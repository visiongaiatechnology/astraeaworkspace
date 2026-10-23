// @vitest-environment happy-dom
// STATUS: PLATIN — Continuous typing across paragraphs (ASTRAEA WRITER 50 V2 · M3)
//
// WR-011, WR-012, WR-015 as real interaction: the **real** editor, real `keydown`
// events, and assertions on the **persisted model** (`Paragraph[]`, stable ids,
// spans) rather than on markup.
//
// The editor is mounted in `happy-dom`; geometry is irrelevant here because every
// case starts from a caret the test sets explicitly through the surface adapter.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterEditor } from '../../../editor/WriterEditor';
import { writeWriterSurfaceSelection } from '../../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../../editing/caret/writerCaretController';

function makeParagraph(id: string, spans: Paragraph['spans'], extra: Partial<Paragraph['style']> = {}): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0, ...extra },
    spans,
  };
}

function documentWith(id: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  return {
    id,
    title: 'M3 Zeuge',
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlockId],
    objects: {
      [textBlockId]: {
        type: 'TextBlock',
        data: { id: textBlockId, paragraphs },
      },
    },
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
    root!.render(createElement(ControlledWriter, { start: documentWith('doc-m3', paragraphs), journal }));
  });
  const surface = container.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  expect(surface, 'die Schreibfläche muss im DOM stehen').not.toBeNull();
  return { surface: surface!, journal, initial: paragraphs };
}

/** The paragraphs as the editor last persisted them. */
function current(journal: Journal, fallback: Paragraph[]): Paragraph[] {
  for (let index = journal.documents.length - 1; index >= 0; index -= 1) {
    const paragraphs = readParagraphs(journal.documents[index]!);
    if (paragraphs.length > 0) return paragraphs;
  }
  return fallback;
}

function texts(paragraphs: Paragraph[]): string[] {
  return paragraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join(''));
}

async function setCaret(surface: HTMLElement, paragraphId: string, offset: number): Promise<void> {
  await act(async () => {
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId, offset },
      focus: { paragraphId, offset },
    });
    document.dispatchEvent(new Event('selectionchange'));
  });
}

async function select(surface: HTMLElement, paragraphId: string, from: number, to: number): Promise<void> {
  await act(async () => {
    writeWriterSurfaceSelection(surface, {
      anchor: { paragraphId, offset: from },
      focus: { paragraphId, offset: to },
    });
    document.dispatchEvent(new Event('selectionchange'));
  });
}

/** Lets React and the caret frame finish (three macrotask hops, load-independent). */
async function settle(hops = 3): Promise<void> {
  for (let hop = 0; hop < hops; hop += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

async function key(surface: HTMLElement, value: string, modifiers: KeyboardEventInit = {}): Promise<void> {
  // A real key event targets the innermost element at the caret — a span inside a
  // paragraph fragment — and bubbles to the surface. Dispatching on the surface root
  // instead would look like a key press on the *editor chrome* to the application
  // shortcut filter, which then (correctly) refuses Ctrl+B/Ctrl+Z.
  const target = surface.querySelector<HTMLElement>('[data-writer-surface-paragraph]') ?? surface;
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: value,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    }));
    await settle();
  });
}

async function type(surface: HTMLElement, text: string): Promise<void> {
  for (const character of text) {
    await key(surface, character);
  }
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

describe('WR-011 — Enter splits exactly at the caret and keeps every span', () => {
  it('splits inside a bold run and keeps the format on both sides', async () => {
    const { surface, journal } = await mount([
      makeParagraph('p1', [{ text: 'Hallo ' }, { text: 'Welt', bold: true }]),
    ]);
    // "Hallo |We|lt" — offset 8 sits inside the bold run.
    await setCaret(surface, 'p1', 8);
    await key(surface, 'Enter');

    const paragraphs = current(journal, []);
    expect(paragraphs).toHaveLength(2);
    // The ids are the stable model ids: the source keeps its id, the tail is new.
    expect(paragraphs[0]!.id).toBe('p1');
    expect(paragraphs[1]!.id).not.toBe('p1');

    expect(paragraphs[0]!.spans.map((span) => [span.text, Boolean(span.bold)])).toEqual([
      ['Hallo ', false],
      ['We', true],
    ]);
    expect(paragraphs[1]!.spans.map((span) => [span.text, Boolean(span.bold)])).toEqual([
      ['lt', true],
    ]);
  });

  it('appends a paragraph when Enter is pressed at the very end', async () => {
    const { surface, journal } = await mount([makeParagraph('p1', [{ text: 'Ende' }])]);
    await setCaret(surface, 'p1', 4);
    await key(surface, 'Enter');
    const paragraphs = current(journal, []);
    expect(texts(paragraphs)).toEqual(['Ende', '']);
  });

  it('keeps Shift+Enter as a line break inside the same paragraph', async () => {
    const { surface, journal } = await mount([makeParagraph('p1', [{ text: 'Hallo Welt' }])]);
    await setCaret(surface, 'p1', 5);
    await key(surface, 'Enter', { shiftKey: true });
    const paragraphs = current(journal, []);
    expect(paragraphs).toHaveLength(1);
    expect(texts(paragraphs)).toEqual(['Hallo\n Welt']);
  });

  it('ends the list on Enter in an empty list item instead of adding a bullet', async () => {
    const { surface, journal } = await mount([
      makeParagraph('p1', [{ text: '' }], { list_style: 'bullet', list_level: 0 }),
    ]);
    await setCaret(surface, 'p1', 0);
    await key(surface, 'Enter');
    const paragraphs = current(journal, []);
    // No second paragraph, and the list style is gone (the list ended).
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.style.list_style).toBeUndefined();
  });
});

describe('WR-012 — Backspace and Delete join paragraphs without losing a span', () => {
  it('joins backwards at offset 0 and keeps both formats', async () => {
    const { surface, journal } = await mount([
      makeParagraph('p1', [{ text: 'Hallo', bold: true }]),
      makeParagraph('p2', [{ text: ' Welt', italic: true }]),
    ]);
    await setCaret(surface, 'p2', 0);
    await key(surface, 'Backspace');

    const paragraphs = current(journal, []);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.id).toBe('p1');
    // Both runs survive the merge: bold from p1, italic from p2.
    expect(paragraphs[0]!.spans.map((span) => [span.text, Boolean(span.bold), Boolean(span.italic)])).toEqual([
      ['Hallo', true, false],
      [' Welt', false, true],
    ]);
  });

  it('joins forwards on Delete at the very end and keeps both formats', async () => {
    const { surface, journal } = await mount([
      makeParagraph('p1', [{ text: 'Hallo', bold: true }]),
      makeParagraph('p2', [{ text: ' Welt', italic: true }]),
    ]);
    await setCaret(surface, 'p1', 5);
    await key(surface, 'Delete');

    const paragraphs = current(journal, []);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.id).toBe('p1');
    expect(paragraphs[0]!.spans.map((span) => [span.text, Boolean(span.bold), Boolean(span.italic)])).toEqual([
      ['Hallo', true, false],
      [' Welt', false, true],
    ]);
  });

  it('never deletes the last remaining empty paragraph', async () => {
    const { surface, journal, initial } = await mount([makeParagraph('p1', [{ text: '' }])]);
    await setCaret(surface, 'p1', 0);
    await key(surface, 'Backspace');
    await key(surface, 'Delete');
    const paragraphs = current(journal, initial);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.id).toBe('p1');
    // Still editable: the paragraph keeps its (empty) span.
    expect(paragraphs[0]!.spans.length).toBeGreaterThan(0);
  });
});

describe('WR-015 — one input authority: type → Enter → bold → undo → redo', () => {
  /** Model shape the undo/redo comparison is about: ids, texts, span formats. */
  function snapshot(paragraphs: Paragraph[]): string {
    return JSON.stringify(paragraphs.map((paragraph) => ({
      id: paragraph.id,
      text: paragraph.spans.map((span) => span.text).join(''),
      spans: paragraph.spans.map((span) => ({ text: span.text, bold: Boolean(span.bold) })),
    })));
  }

  /**
   * Waits until the model satisfies `predicate`.
   *
   * A fixed number of history steps made this test load-dependent: whether two
   * keystrokes coalesce into one entry depends on how quickly the previous state
   * landed. Waiting for the *effect* (the model content) instead of for a duration
   * makes the assertion about the behaviour, not about the machine.
   */
  async function until(predicate: () => boolean, label: string, timeoutMs = 12_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await act(async () => {
        await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
      });
    }
    throw new Error(`timeout while waiting for: ${label}`);
  }

  /** Steps history until the model matches, with a bounded number of steps. */
  async function stepUntil(
    surface: HTMLElement,
    direction: 'z' | 'y',
    predicate: () => boolean,
    label: string,
    maxSteps = 24,
  ): Promise<void> {
    for (let step = 0; step < maxSteps; step += 1) {
      if (predicate()) return;
      await key(surface, direction, { ctrlKey: true });
    }
    await until(predicate, label);
  }

  it('restores exactly the same ids, texts and spans through undo and redo', async () => {
    const { surface, journal, initial } = await mount([makeParagraph('p1', [{ text: 'Hallo' }])]);

    // Type, split, then make one word bold — three different transactions.
    await setCaret(surface, 'p1', 5);
    await type(surface, ' Welt');
    await key(surface, 'Enter');
    await type(surface, 'Astraea');
    await until(
      () => texts(current(journal, initial)).length === 2
        && texts(current(journal, initial))[1] === 'Astraea',
      'the typed second paragraph',
    );
    await select(surface, 'p1', 6, 10);
    await key(surface, 'b', { ctrlKey: true });
    await until(
      () => current(journal, initial)[0]!.spans.some((span) => span.bold),
      'the bold range',
    );

    const edited = current(journal, []);
    expect(texts(edited)).toEqual(['Hallo Welt', 'Astraea']);
    const editedSnapshot = snapshot(edited);

    // Undo until the original document is back: one paragraph, its id, its text.
    // The predicate is the *content*, not the paragraph count: reverting the Enter
    // already leaves one paragraph, but with "Hallo Welt" still in it.
    await stepUntil(
      surface,
      'z',
      () => {
        const currentTexts = texts(current(journal, initial));
        return currentTexts.length === 1 && currentTexts[0] === 'Hallo';
      },
      'undo back to the opened document',
    );
    await settle();

    const undone = current(journal, initial);
    expect(texts(undone), 'undone texts').toEqual(['Hallo']);
    expect(undone).toHaveLength(1);
    expect(undone[0]!.id).toBe('p1');

    // Redo until the edited model is back — byte-identical content.
    await stepUntil(
      surface,
      'y',
      () => snapshot(current(journal, initial)) === editedSnapshot,
      'redo back to the edited document',
    );
    await settle();
    expect(snapshot(current(journal, []))).toBe(editedSnapshot);

    // A new edit after an undo discards the redo branch.
    await key(surface, 'z', { ctrlKey: true });
    await settle();
    const afterUndo = texts(current(journal, initial));
    await setCaret(surface, current(journal, initial)[0]!.id, 0);
    await type(surface, 'X');
    await until(
      () => texts(current(journal, initial))[0]!.startsWith('X'),
      'the new edit after undo',
    );
    const withNewEdit = texts(current(journal, initial));
    expect(withNewEdit).not.toEqual(afterUndo);
    // Redo is gone: the branch was replaced, not appended to.
    await key(surface, 'y', { ctrlKey: true });
    await settle();
    expect(texts(current(journal, initial))).toEqual(withNewEdit);
    // The chain types, splits, formats and steps history many times: under a loaded
    // parallel suite the default 5 s budget is not enough for the behaviour, only for
    // the machine.
  }, 30_000);
});
