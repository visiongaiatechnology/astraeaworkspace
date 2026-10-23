// @vitest-environment happy-dom
// STATUS: PLATIN — Undo/Redo must survive a host that clones and stamps the document
//
// ASTRAEA WRITER 50 V2 · M4-Vorabfix (WR-020-Grundlage).
//
// ## The defect this file pins
//
// Unit harnesses usually hand the *same object* back in `onUpdateDocument`. The real
// desktop app does not: `useWorkspaceDocumentUpdates` stamps the schema and
// `operationEngine.commitDocumentMapTransition` clones the document and bumps
// `version`. `useWriterState` used to compare the incoming `document` prop with
// `historyRef.current[index]` **by identity**, so in the app the comparison was
// false after *every* edit — the open-document effect reset the history to a single
// entry and the toolbar's undo button was greyed out immediately.
//
// This harness reproduces the host exactly (`structuredClone` + `version + 1`) and
// drives the **toolbar buttons**, not an internal handler.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterEditor } from '../../../editor/WriterEditor';
import { writeWriterSurfaceSelection } from '../../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../../editing/caret/writerCaretController';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

function documentWith(id: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  return {
    id,
    title: 'Echo-Zeuge',
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
  versions: number;
}

/**
 * A host that behaves like the desktop one: **every** accepted document comes back
 * as a deep clone with a higher version, never as the object it was given.
 */
function CloningWriter({ start, journal }: { start: WorkspaceDocument; journal: Journal }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  return createElement(WriterEditor, {
    document,
    workspaceDocuments: [],
    onSelectSelectionType: () => undefined,
    onUpdateDocument: (next: WorkspaceDocument) => {
      journal.versions += 1;
      const cloned = structuredClone(next) as WorkspaceDocument;
      cloned.version = journal.versions;
      cloned.modified_at = journal.versions;
      journal.documents.push(cloned);
      setDocument(cloned);
    },
    onOpenDocument: () => undefined,
    onOpenExternalUrl: () => undefined,
  });
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function settle(hops = 4): Promise<void> {
  for (let hop = 0; hop < hops; hop += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

async function mount(): Promise<{ surface: HTMLElement; journal: Journal; initial: Paragraph[] }> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const journal: Journal = { documents: [], versions: 1 };
  const initial = [paragraph('p1', 'Hallo')];
  await act(async () => {
    root!.render(createElement(CloningWriter, { start: documentWith('doc-echo', initial), journal }));
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface, 'die Schreibfläche muss im DOM stehen').not.toBeNull();
  return { surface: surface!, journal, initial };
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

async function key(surface: HTMLElement, value: string, modifiers: KeyboardEventInit = {}): Promise<void> {
  // The editing host itself is the keydown target in a real browser (document.activeElement).
  const target = surface;
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...modifiers }));
    await settle(1);
  });
}

/** The toolbar's undo/redo buttons, found by their accessible label. */
function historyButton(label: 'undo' | 'redo'): HTMLButtonElement {
  const buttons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button'));
  const match = buttons.find((button) => {
    const text = `${button.getAttribute('aria-label') ?? ''} ${button.getAttribute('title') ?? ''}`.toLowerCase();
    return label === 'undo' ? text.includes('undo') || text.includes('rückgängig') : text.includes('redo') || text.includes('wiederholen');
  });
  expect(match, `der ${label}-Button muss in der Toolbar stehen`).toBeDefined();
  return match!;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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

describe('WR-020 — the host echoes a clone, the history must survive it', { timeout: 30_000 }, () => {
  it('keeps undo available after three edits and steps back and forward from the toolbar', async () => {
    const { surface, journal, initial } = await mount();

    // Three distinct edits: typing, a paragraph break, typing again.
    await setCaret(surface, 'p1', 5);
    await key(surface, 'a');
    await act(async () => { await settle(2); });
    await key(surface, 'Enter');
    await act(async () => { await settle(2); });
    await key(surface, 'b');
    await act(async () => { await settle(2); });

    // The host really did clone+bump on every publish — otherwise this test proves nothing.
    expect(journal.documents.length).toBeGreaterThanOrEqual(3);
    expect(journal.documents[0]!.version).toBe(2);
    expect(texts(current(journal, initial))).toEqual(['Halloa', 'b']);

    // `canUndo === true`: the toolbar button is enabled after the edits.
    const undo = historyButton('undo');
    expect(undo.hasAttribute('disabled'), 'Undo darf nach Edits nicht ausgegraut sein').toBe(false);
    expect(historyButton('redo').hasAttribute('disabled')).toBe(true);

    // Two clicks → two steps back.
    await click(undo);
    expect(texts(current(journal, initial)), 'nach 1× Undo').toEqual(['Halloa', '']);
    await click(historyButton('undo'));
    expect(texts(current(journal, initial)), 'nach 2× Undo').toEqual(['Halloa']);

    // `canRedo === true` after stepping back.
    const redo = historyButton('redo');
    expect(redo.hasAttribute('disabled'), 'Redo muss nach Undo verfügbar sein').toBe(false);

    // One click forward restores the paragraph break.
    await click(redo);
    expect(texts(current(journal, initial)), 'nach 1× Redo').toEqual(['Halloa', '']);
  });

  it('undoes a typed sentence word by word, but a paste in one step', async () => {
    const { surface, journal, initial } = await mount();
    await setCaret(surface, 'p1', 5);

    // "Hallo" + " Welt Test" typed character by character.
    for (const character of ' Welt Test') {
      await key(surface, character);
      await act(async () => { await settle(1); });
    }
    expect(texts(current(journal, initial))).toEqual(['Hallo Welt Test']);

    // 1× undo removes the last word … and its separating space.
    await key(surface, 'z', { ctrlKey: true });
    await act(async () => { await settle(2); });
    expect(texts(current(journal, initial)), 'nach 1× Strg+Z').toEqual(['Hallo Welt ']);

    // … 2× undo removes the word before it.
    await key(surface, 'z', { ctrlKey: true });
    await act(async () => { await settle(2); });
    expect(texts(current(journal, initial)), 'nach 2× Strg+Z').toEqual(['Hallo ']);

    // 1× redo brings it back.
    await key(surface, 'y', { ctrlKey: true });
    await act(async () => { await settle(2); });
    expect(texts(current(journal, initial)), 'nach 1× Strg+Y').toEqual(['Hallo Welt ']);
  }, 30_000);

  it('keeps a paste as one undo step', async () => {
    const { surface, journal, initial } = await mount();
    await setCaret(surface, 'p1', 5);
    const clipboard = new Event('paste', { bubbles: true, cancelable: true });
    const store = new Map<string, string>([['text/plain', ' Welt Test']]);
    Object.defineProperty(clipboard, 'clipboardData', {
      value: {
        getData: (type: string) => store.get(type) ?? '',
        setData: (type: string, value: string) => { store.set(type, value); },
      },
    });
    await act(async () => {
      surface.dispatchEvent(clipboard);
      await settle(2);
    });
    expect(texts(current(journal, initial))).toEqual(['Hallo Welt Test']);

    // One undo removes the *whole* inserted text — paste is not word-coalesced.
    await key(surface, 'z', { ctrlKey: true });
    await act(async () => { await settle(2); });
    expect(texts(current(journal, initial)), 'nach 1× Strg+Z').toEqual(['Hallo']);
  }, 30_000);
});
