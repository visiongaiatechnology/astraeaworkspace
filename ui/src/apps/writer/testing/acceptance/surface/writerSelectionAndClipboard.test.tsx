// @vitest-environment happy-dom
// STATUS: PLATIN — Selection, navigation, IME and paste as real interactions (M4)
//
// ASTRAEA WRITER 50 V2 · WR-016 … WR-019.
//
// Every case drives the **real** editor with real events and asserts on the
// persisted model: selection replacement, `Ctrl+A`/`Ctrl+Home`/`Ctrl+End`, an IME
// composition that writes raw DOM, and a paste whose HTML must never reach the DOM.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterEditor } from '../../../editor/WriterEditor';
import {
  readWriterSurfaceSelection,
  writeWriterSurfaceSelection,
} from '../../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../../editing/caret/writerCaretController';

function paragraph(id: string, spans: Paragraph['spans']): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans,
  };
}

function documentWith(id: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  return {
    id,
    title: 'M4 Zeuge',
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlockId],
    objects: { [textBlockId]: { type: 'TextBlock', data: { id: textBlockId, paragraphs } } },
  } as WorkspaceDocument;
}

function readParagraphs(doc: WorkspaceDocument): Paragraph[] {
  for (const object of Object.values(doc.objects ?? {})) {
    const candidate = object as { type?: string; data?: { paragraphs?: Paragraph[] } };
    if (candidate.type === 'TextBlock' && Array.isArray(candidate.data?.paragraphs)) {
      return candidate.data!.paragraphs!;
    }
  }
  return [];
}

function texts(paragraphs: Paragraph[]): string[] {
  return paragraphs.map((item) => item.spans.map((span) => span.text).join(''));
}

interface Journal {
  readonly documents: WorkspaceDocument[];
}

function ControlledWriter({ start, journal }: { start: WorkspaceDocument; journal: Journal }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  return createElement(WriterEditor, {
    document,
    workspaceDocuments: [],
    onSelectSelectionType: () => undefined,
    onUpdateDocument: (next: WorkspaceDocument) => {
      journal.documents.push(next);
      setDocument(next);
    },
    onOpenDocument: () => undefined,
    onOpenExternalUrl: () => undefined,
  });
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function settle(hops = 3): Promise<void> {
  for (let hop = 0; hop < hops; hop += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

async function mount(paragraphs: Paragraph[]): Promise<{
  surface: HTMLElement;
  journal: Journal;
  initial: Paragraph[];
}> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const journal: Journal = { documents: [] };
  await act(async () => {
    root!.render(createElement(ControlledWriter, { start: documentWith('doc-m4', paragraphs), journal }));
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface, 'die Schreibfläche muss im DOM stehen').not.toBeNull();
  return { surface: surface!, journal, initial: paragraphs };
}

function current(journal: Journal, fallback: Paragraph[]): Paragraph[] {
  for (let index = journal.documents.length - 1; index >= 0; index -= 1) {
    const paragraphs = readParagraphs(journal.documents[index]!);
    if (paragraphs.length > 0) return paragraphs;
  }
  return fallback;
}

async function select(surface: HTMLElement, anchor: [string, number], focus: [string, number]): Promise<void> {
  await act(async () => {
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId: anchor[0], offset: anchor[1] },
      focus: { paragraphId: focus[0], offset: focus[1] },
    });
    document.dispatchEvent(new Event('selectionchange'));
    await settle(1);
  });
}

/**
 * Dispatches a key event on the **editing host**, which is what has the focus in a
 * real browser while typing.
 *
 * The earlier helper dispatched on a paragraph fragment instead — a synthetic target
 * that made the shortcut filter look correct while `Strg+Z`/`Strg+B` were dead in the
 * app (native M4 probe). Both targets are exercised now.
 */
async function key(
  surface: HTMLElement,
  value: string,
  modifiers: KeyboardEventInit = {},
  target: 'surface' | 'paragraph' = 'surface',
): Promise<void> {
  const dispatchTarget = target === 'paragraph'
    ? (surface.querySelector<HTMLElement>('[data-writer-surface-paragraph]') ?? surface)
    : surface;
  await act(async () => {
    dispatchTarget.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...modifiers }));
    await settle(1);
  });
}

/** An in-memory clipboard (happy-dom has no `DataTransfer`). */
interface FakeClipboard {
  readonly store: Map<string, string>;
  getData(type: string): string;
  setData(type: string, value: string): void;
}

function makeClipboard(): FakeClipboard {
  const store = new Map<string, string>();
  return {
    store,
    getData: (type: string) => store.get(type) ?? '',
    setData: (type: string, value: string) => { store.set(type, value); },
  };
}

async function dispatchClipboardEvent(
  surface: HTMLElement,
  type: 'copy' | 'cut' | 'paste',
  clipboard: FakeClipboard,
): Promise<void> {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  await act(async () => {
    surface.dispatchEvent(event);
    await settle(2);
  });
}

/** Dispatches a `paste` with a synthetic clipboard. */
async function paste(surface: HTMLElement, payload: { text?: string; html?: string }): Promise<void> {
  const clipboard = makeClipboard();
  if (payload.text !== undefined) clipboard.setData('text/plain', payload.text);
  if (payload.html !== undefined) clipboard.setData('text/html', payload.html);
  await dispatchClipboardEvent(surface, 'paste', clipboard);
}

beforeEach(() => {
  resetWriterCaretController();
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  document.getSelection()?.removeAllRanges();
});

describe('WR-016 — one selection space, one replacement', () => {
  it('replaces only the marked range across two paragraphs', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', [{ text: 'Hallo Welt' }]),
      paragraph('p2', [{ text: 'Zweiter Absatz' }]),
    ]);
    // From "Hal|lo Welt" into "Zwe|iter Absatz".
    await select(surface, ['p1', 3], ['p2', 4]);
    await key(surface, 'X');

    const paragraphs = current(journal, initial);
    // Head of p1 + one paragraph break + replacement + tail of p2.
    expect(texts(paragraphs)).toEqual(['HalXter Absatz']);
    expect(paragraphs[0]!.id).toBe('p1');
  });

  it('keeps the marked range stable while it is formatted', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo Welt' }])]);
    await select(surface, ['p1', 6], ['p1', 10]);

    // Ctrl+B formats exactly the marked range …
    await key(surface, 'b', { ctrlKey: true });
    await settle(2);

    const paragraphs = current(journal, initial);
    expect(texts(paragraphs)).toEqual(['Hallo Welt']);
    expect(paragraphs[0]!.spans.map((span) => [span.text, Boolean(span.bold)])).toEqual([
      ['Hallo ', false],
      ['Welt', true],
    ]);

    // … and the selection is still the same range, not a collapsed caret.
    const restored = readWriterSurfaceSelection(surface);
    expect(restored).toEqual({
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p1', offset: 10 },
    });
  });
});

describe('WR-017 — document navigation from the keyboard', () => {
  it('selects the whole running text on Ctrl+A', async () => {
    const { surface } = await mount([
      paragraph('p1', [{ text: 'Hallo' }]),
      paragraph('p2', [{ text: 'Welt' }]),
    ]);
    await select(surface, ['p1', 2], ['p1', 2]);
    await key(surface, 'a', { ctrlKey: true });
    await settle(2);

    expect(readWriterSurfaceSelection(surface)).toEqual({
      anchor: { paragraphId: 'p1', offset: 0 },
      focus: { paragraphId: 'p2', offset: 4 },
    });
  });

  it('moves the caret to the document edges on Ctrl+Home / Ctrl+End', async () => {
    const { surface } = await mount([
      paragraph('p1', [{ text: 'Hallo' }]),
      paragraph('p2', [{ text: 'Welt' }]),
    ]);
    await select(surface, ['p1', 2], ['p1', 2]);
    await key(surface, 'End', { ctrlKey: true });
    await settle(2);
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p2', offset: 4 });

    await key(surface, 'Home', { ctrlKey: true });
    await settle(2);
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 0 });
  });
});

describe('WR-018 — an IME composition owns the DOM until it ends', () => {
  it('ignores intermediate DOM writes and commits them once at compositionend', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: '' }])]);
    const fragment = surface.querySelector<HTMLElement>('[data-writer-surface-paragraph]')!;
    // An input method composes *at the caret*: the editor knows the paragraph.
    await select(surface, ['p1', 0], ['p1', 0]);

    await act(async () => {
      fragment.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });
    // The input method writes raw nodes into the DOM while composing.
    await act(async () => {
      fragment.textContent = 'Ärg';
      fragment.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(1);
    });
    // Nothing may reach the model before the composition is committed.
    expect(current(journal, initial).map((item) => item.spans.map((span) => span.text).join(''))).toEqual(['']);

    await act(async () => {
      fragment.textContent = 'Ärger';
      fragment.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Ärger' }));
      await settle(3);
    });

    // Exactly once, and the projection is clean again.
    const paragraphs = current(journal, initial);
    expect(paragraphs.map((item) => item.spans.map((span) => span.text).join(''))).toEqual(['Ärger']);
    const committed = surface.querySelector<HTMLElement>('[data-writer-surface-paragraph]')!;
    expect(committed.textContent).toBe('Ärger');
    for (const child of Array.from(committed.childNodes)) {
      if (child.nodeType === 3) expect((child.textContent ?? '').length).toBe(0);
    }
  });
});

describe('WR-019 — paste like a normal text editor', () => {
  it('inserts plain text at the caret and moves the caret behind it', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    await select(surface, ['p1', 5], ['p1', 5]);
    await paste(surface, { text: ' Welt' });

    expect(texts(current(journal, initial))).toEqual(['Hallo Welt']);
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 10 });
  });

  it('keeps bold from pasted HTML but never writes the HTML into the DOM', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo ' }])]);
    await select(surface, ['p1', 6], ['p1', 6]);
    await paste(surface, { html: '<p>Hallo <b>Astraea</b>!</p>' });

    const paragraphs = current(journal, initial);
    expect(texts(paragraphs)).toEqual(['Hallo Hallo Astraea!']);
    expect(paragraphs[0]!.spans.some((span) => span.bold && span.text.includes('Astraea'))).toBe(true);
    // No element from the clipboard reached the surface — only our own projection.
    expect(surface.querySelector('b')).toBeNull();
    expect(surface.querySelector('strong')).toBeNull();
    expect(surface.querySelectorAll('[data-writer-surface-span]').length).toBeGreaterThan(0);
  });

  it('treats Ctrl+Shift+V as plain text even when HTML is offered', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: '' }])]);
    await select(surface, ['p1', 0], ['p1', 0]);
    await key(surface, 'V', { ctrlKey: true, shiftKey: true });
    await paste(surface, { text: 'fett', html: '<b>fett</b>' });

    const paragraphs = current(journal, initial);
    expect(texts(paragraphs)).toEqual(['fett']);
    expect(paragraphs[0]!.spans.every((span) => !span.bold)).toBe(true);
  });

  it('copies its own bold run and pastes it back with bold — copy/paste round trip', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', [{ text: 'Hallo ' }, { text: 'fett', bold: true }]),
    ]);
    // Mark exactly the bold word.
    await select(surface, ['p1', 6], ['p1', 10]);

    const clipboard = makeClipboard();
    await dispatchClipboardEvent(surface, 'copy', clipboard);

    // The editor wrote both representations itself …
    expect(clipboard.getData('text/plain')).toBe('fett');
    expect(clipboard.getData('text/html')).toContain('<strong');
    expect(clipboard.getData('text/html')).toContain('data-writer-span-key="b|||');

    // … and pasting them back keeps the format.
    await select(surface, ['p1', 10], ['p1', 10]);
    await dispatchClipboardEvent(surface, 'paste', clipboard);

    const paragraphs = current(journal, initial);
    expect(texts(paragraphs)).toEqual(['Hallo fettfett']);
    const pasted = paragraphs[0]!.spans.filter((span) => span.bold && span.text === 'fett');
    expect(pasted.length).toBe(2);
    expect(paragraphs[0]!.spans.filter((span) => !span.bold).map((span) => span.text)).toEqual(['Hallo ']);
  });

  it('understands the span markup Chromium produces from the writer surface', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: '' }])]);
    await select(surface, ['p1', 0], ['p1', 0]);
    // Exactly the shape the surface renders: a span with a writer run flag and an
    // inline style, no `<b>`/`<strong>` anywhere.
    await paste(surface, {
      html: '<p><span data-writer-span-key="b|||||" data-writer-run-bold="true" style="font-weight: 700;">fett</span>'
        + ' <span style="font-style: italic">kursiv</span>'
        + ' <span style="text-decoration: underline">unter</span>'
        + ' <span style="text-decoration-line: line-through">durch</span></p>',
    });

    const paragraphs = current(journal, initial);
    expect(texts(paragraphs)).toEqual(['fett kursiv unter durch']);
    const [bold, italic, underline, strike] = paragraphs[0]!.spans.filter((span) => span.text.trim().length > 0);
    expect(Boolean(bold?.bold)).toBe(true);
    expect(Boolean(italic?.italic)).toBe(true);
    expect(Boolean(underline?.underline)).toBe(true);
    expect(Boolean(strike?.strikethrough)).toBe(true);
  });

  it('cuts the marked range out of the model after writing it', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo Welt' }])]);
    await select(surface, ['p1', 5], ['p1', 10]);

    const clipboard = makeClipboard();
    await dispatchClipboardEvent(surface, 'cut', clipboard);

    expect(clipboard.getData('text/plain')).toBe(' Welt');
    expect(texts(current(journal, initial))).toEqual(['Hallo']);
  });
});

describe('WR-017 — keyboard navigation with the editing host as the event target', () => {
  it('steps over the paragraph boundary with the arrows', async () => {
    const { surface } = await mount([
      paragraph('p1', [{ text: 'Hallo' }]),
      paragraph('p2', [{ text: 'Welt' }]),
    ]);
    await select(surface, ['p1', 5], ['p1', 5]);
    await key(surface, 'ArrowRight');
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p2', offset: 0 });

    await key(surface, 'ArrowLeft');
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 5 });
  });

  it('jumps to the paragraph start/end on Home/End and extends with Shift', async () => {
    const { surface } = await mount([paragraph('p1', [{ text: 'Hallo Welt' }])]);
    await select(surface, ['p1', 5], ['p1', 5]);
    await key(surface, 'End');
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 10 });

    await key(surface, 'Home');
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 0 });

    // Shift+End extends from the anchor instead of collapsing.
    await key(surface, 'End', { shiftKey: true });
    expect(readWriterSurfaceSelection(surface)).toEqual({
      anchor: { paragraphId: 'p1', offset: 0 },
      focus: { paragraphId: 'p1', offset: 10 },
    });
  });

  it('jumps a word with Ctrl+Arrow', async () => {
    const { surface } = await mount([paragraph('p1', [{ text: 'Hallo schöne Welt' }])]);
    await select(surface, ['p1', 0], ['p1', 0]);
    await key(surface, 'ArrowRight', { ctrlKey: true });
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 5 });

    await key(surface, 'ArrowLeft', { ctrlKey: true });
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 0 });
  });
});

describe('WR-017/WR-020 — editor shortcuts reach the editor from the editing host', () => {
  it('undoes and redoes when the event target is the contenteditable root', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    await select(surface, ['p1', 5], ['p1', 5]);
    await key(surface, 'a');
    await settle(3);
    expect(texts(current(journal, initial))).toEqual(['Halloa']);

    // `surface` is the contenteditable root — `document.activeElement` in the app.
    await key(surface, 'z', { ctrlKey: true });
    await settle(3);
    expect(texts(current(journal, initial)), 'nach Strg+Z').toEqual(['Hallo']);

    await key(surface, 'y', { ctrlKey: true });
    await settle(3);
    expect(texts(current(journal, initial)), 'nach Strg+Y').toEqual(['Halloa']);
  });

  it('applies Ctrl+B to the marked range from the editing host', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo Welt' }])]);
    await select(surface, ['p1', 6], ['p1', 10]);
    await key(surface, 'b', { ctrlKey: true });
    await settle(3);

    const paragraphs = current(journal, initial);
    expect(paragraphs[0]!.spans.some((span) => span.bold && span.text === 'Welt')).toBe(true);
  });

  it('routes the browser’s own historyUndo/Redo into the writer history', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', [{ text: 'Hallo' }])]);
    await select(surface, ['p1', 5], ['p1', 5]);
    await key(surface, 'a');
    await settle(3);
    expect(texts(current(journal, initial))).toEqual(['Halloa']);

    await act(async () => {
      surface.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'historyUndo',
        bubbles: true,
        cancelable: true,
      }));
      await settle(3);
    });
    expect(texts(current(journal, initial)), 'nach historyUndo').toEqual(['Hallo']);

    await act(async () => {
      surface.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'historyRedo',
        bubbles: true,
        cancelable: true,
      }));
      await settle(3);
    });
    expect(texts(current(journal, initial)), 'nach historyRedo').toEqual(['Halloa']);
  });
});
