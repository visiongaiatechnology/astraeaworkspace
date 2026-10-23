// @vitest-environment happy-dom
// STATUS: PLATIN — Blocks as a second layer, never a writing duty (M7)
//
// ASTRAEA WRITER 50 V2 · WR-031 … WR-035.
//
// The rule of this milestone: building blocks appear **because the user asked for
// them**, and none of them may cost the writer the flow. The tests below drive the real
// editor and read the persisted model, not the DOM.
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

function paragraph(id: string, text: string, style: Partial<Paragraph['style']> = {}): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0, ...style },
    spans: [{ text }],
  };
}

function documentWith(id: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  return {
    id,
    title: 'M7 Zeuge',
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
    root!.render(createElement(ControlledWriter, { start: documentWith('doc-m7', paragraphs), journal }));
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface, 'die Schreibfläche muss im DOM stehen').not.toBeNull();
  await act(async () => {
    surface!.focus();
    await settle(1);
  });
  return { surface: surface!, journal, initial: paragraphs };
}

function current(journal: Journal, fallback: Paragraph[]): Paragraph[] {
  for (let index = journal.documents.length - 1; index >= 0; index -= 1) {
    const paragraphs = readParagraphs(journal.documents[index]!);
    if (paragraphs.length > 0) return paragraphs;
  }
  return fallback;
}

async function setCaret(surface: HTMLElement, paragraphId: string, offset: number): Promise<void> {
  await act(async () => {
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId, offset },
      focus: { paragraphId, offset },
    });
    document.dispatchEvent(new Event('selectionchange'));
    await settle(1);
  });
}

async function select(surface: HTMLElement, anchor: [string, number], focus: [string, number]): Promise<void> {
  await act(async () => {
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId: anchor[0], offset: anchor[1] },
      focus: { paragraphId: focus[0], offset: focus[1] },
    });
    document.dispatchEvent(new Event('selectionchange'));
    await settle(2);
  });
}

async function type(surface: HTMLElement, text: string): Promise<void> {
  for (const character of text) {
    await act(async () => {
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: character, bubbles: true, cancelable: true }));
      await settle(1);
    });
  }
}

async function press(surface: HTMLElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    surface.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    await settle(2);
  });
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

describe('WR-031 — lists arise and end while typing', () => {
  it('turns "- " into a bullet list and consumes the marker', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', '')]);
    await setCaret(surface, 'p1', 0);
    await type(surface, '- ');
    await settle(2);

    const paragraphs = current(journal, initial);
    expect(paragraphs[0]!.style.list_style).toBe('bullet');
    // The marker is a glyph the renderer draws, not stored text.
    expect(texts(paragraphs)).toEqual(['']);
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 0 });
  });

  it('turns "* " into a bullet and "1. " into a numbered list', async () => {
    const bullet = await mount([paragraph('p1', '')]);
    await setCaret(bullet.surface, 'p1', 0);
    await type(bullet.surface, '* ');
    await settle(2);
    expect(current(bullet.journal, bullet.initial)[0]!.style.list_style).toBe('bullet');
    await act(async () => { root!.unmount(); root = null; });
    container!.remove();

    const numbered = await mount([paragraph('p1', '')]);
    await setCaret(numbered.surface, 'p1', 0);
    await type(numbered.surface, '1. ');
    await settle(2);
    expect(current(numbered.journal, numbered.initial)[0]!.style.list_style).toBe('number');
  });

  it('does not convert a paragraph that already has text before the marker', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', 'Hallo')]);
    await setCaret(surface, 'p1', 5);
    await type(surface, ' - ');
    await settle(2);
    const paragraphs = current(journal, initial);
    expect(paragraphs[0]!.style.list_style).toBeUndefined();
    expect(texts(paragraphs)).toEqual(['Hallo - ']);
  });

  it('creates the next item on Enter and leaves the list on a second Enter', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', 'Punkt', { list_style: 'bullet', list_level: 0 }),
    ]);
    await setCaret(surface, 'p1', 5);
    await press(surface, 'Enter');
    await settle(2);

    let paragraphs = current(journal, initial);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]!.style.list_style, 'Enter erzeugt den nächsten Listenpunkt').toBe('bullet');

    // The new item is empty: a second Enter ends the list.
    await press(surface, 'Enter');
    await settle(2);
    paragraphs = current(journal, initial);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]!.style.list_style, 'zweites Enter beendet die Liste').toBeUndefined();
  });

  it('moves the list level with Tab and Shift+Tab instead of inserting a tab character', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', 'Punkt', { list_style: 'bullet', list_level: 0 }),
    ]);
    await setCaret(surface, 'p1', 5);
    await press(surface, 'Tab');
    await settle(2);
    expect(current(journal, initial)[0]!.style.list_level).toBe(1);
    // No tab character was typed into the text.
    expect(texts(current(journal, initial))).toEqual(['Punkt']);

    await press(surface, 'Tab', { shiftKey: true });
    await settle(2);
    expect(current(journal, initial)[0]!.style.list_level).toBe(0);
  });

  it('converts a line in front of existing text when the marker is completed', async () => {
    // Native M7 probe: typing `- ` before existing words did nothing.
    const { surface, journal, initial } = await mount([paragraph('p1', 'bestehender Text')]);
    await setCaret(surface, 'p1', 0);
    await type(surface, '- ');
    await settle(2);

    const paragraphs = current(journal, initial);
    expect(paragraphs[0]!.style.list_style).toBe('bullet');
    // The marker is gone, the existing words remain and the caret sits at the start.
    expect(texts(paragraphs)).toEqual(['bestehender Text']);
    expect(readWriterSurfaceSelection(surface)?.focus).toEqual({ paragraphId: 'p1', offset: 0 });
  });

  it('turns a hand-typed "- Erster Punkt" into a list item on Enter', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', '- Erster Punkt')]);
    await setCaret(surface, 'p1', 15);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    // The marker is consumed, and the new paragraph continues the list.
    expect(texts(paragraphs)[0]).toBe('Erster Punkt');
    expect(paragraphs[0]!.style.list_style).toBe('bullet');
    expect(paragraphs[1], 'der nächste Absatz ist der nächste Listenpunkt').toBeDefined();
    expect(paragraphs[1]!.style.list_style).toBe('bullet');
  });

  it('does not convert a dash that is not a list marker', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', '-x')]);
    await setCaret(surface, 'p1', 2);
    await press(surface, 'Enter');
    await settle(2);
    expect(current(journal, initial)[0]!.style.list_style).toBeUndefined();
  });
});

describe('WR-035 — links do not interrupt the flow', () => {
  /** Types a URL into the link dialog and confirms it. */
  async function applyLinkUrl(url: string): Promise<void> {
    const dialog = container!.querySelector<HTMLElement>('[data-writer-link-dialog="open"]');
    expect(dialog, 'der Link-Dialog muss offen sein').not.toBeNull();
    const input = dialog!.querySelector<HTMLInputElement>('[data-writer-link-input="true"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, url);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(1);
    });
    const apply = dialog!.querySelector<HTMLElement>('[data-writer-link-action="apply"]')!;
    await act(async () => {
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(3);
    });
  }

  it('links the marked text through the Ctrl+K dialog and removes it again', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', 'Astraea Webseite')]);
    await select(surface, ['p1', 0], ['p1', 7]);

    // WR-035: `Strg+K` opens a real dialog — `window.prompt` is blocked in Tauri.
    await press(surface, 'k', { ctrlKey: true });
    await settle(3);
    expect(container!.querySelector('[data-writer-link-dialog="open"]'), 'Strg+K öffnet den Dialog').not.toBeNull();

    await applyLinkUrl('astraea.example');
    let paragraphs = current(journal, initial);
    const linked = paragraphs[0]!.spans.find((span) => span.link);
    expect(linked, 'der Dialog setzt den Link auf die Auswahl').toBeDefined();
    // A bare domain is completed to https — the dialog never stores a naked host.
    expect(linked!.link).toEqual({ kind: 'external', url: 'https://astraea.example/' });
    expect(linked!.text).toBe('Astraea');
    expect(texts(paragraphs)).toEqual(['Astraea Webseite']);
    expect(paragraphs[0]!.spans.filter((span) => !span.link).map((span) => span.text).join('')).toBe(' Webseite');

    // Reopening offers the current URL and the removal action.
    await select(surface, ['p1', 0], ['p1', 7]);
    await press(surface, 'k', { ctrlKey: true });
    await settle(3);
    const dialog = container!.querySelector<HTMLElement>('[data-writer-link-dialog="open"]')!;
    expect(dialog.querySelector<HTMLInputElement>('[data-writer-link-input="true"]')!.value)
      .toBe('https://astraea.example/');
    const remove = dialog.querySelector<HTMLElement>('[data-writer-link-action="remove"]')!;
    await act(async () => {
      remove.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(3);
    });

    paragraphs = current(journal, initial);
    expect(paragraphs[0]!.spans.some((span) => span.link), 'Link entfernen räumt die Auswahl').toBe(false);
    expect(texts(paragraphs)).toEqual(['Astraea Webseite']);
  });

  it('renders a linked run visibly as a link', async () => {
    const { surface } = await mount([paragraph('p1', 'Astraea')]);
    await select(surface, ['p1', 0], ['p1', 7]);
    await press(surface, 'k', { ctrlKey: true });
    await settle(2);
    await applyLinkUrl('https://astraea.example');

    const run = container!.querySelector<HTMLElement>('[data-writer-run-link]');
    expect(run, 'ein verlinkter Lauf trägt das Link-Merkmal').not.toBeNull();
    expect(run!.getAttribute('data-writer-run-link')).toBe('https://astraea.example/');
    expect(run!.style.textDecoration).toContain('underline');
    expect(run!.title).toContain('Strg+Klick');
    void surface;
  });
});

describe('WR-034 — no shape appears from ordinary typing or clicking', () => {
  it('creates no shape object while the user writes', async () => {
    const { surface, journal, initial } = await mount([paragraph('p1', '')]);
    await setCaret(surface, 'p1', 0);
    await type(surface, 'Nur Text');
    await settle(2);

    expect(texts(current(journal, initial))).toEqual(['Nur Text']);
    const lastDocument = journal.documents[journal.documents.length - 1] ?? documentWith('doc-m7', initial);
    const objectTypes = Object.values(lastDocument.objects ?? {}).map((object) => (object as { type?: string }).type);
    // The document holds its text block — and nothing the user did not ask for.
    expect(objectTypes.filter((type) => type === 'VectorShape')).toHaveLength(0);
  });
});
