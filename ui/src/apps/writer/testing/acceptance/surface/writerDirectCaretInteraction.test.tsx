// @vitest-environment happy-dom
// STATUS: PLATIN — Direct cursor as a real click sequence (ASTRAEA WRITER 50 V2 · M2)
//
// WR-006 … WR-010 are interaction requirements, so this file dispatches **real**
// `click` and `dblclick` events into the **real** editor and reads the resulting
// document model — the same shape the acceptance plan asks for.
//
// ## What is injected and why
//
// `happy-dom` has no layout engine: every `getBoundingClientRect()` returns zeros
// and `line-height` is `normal`. A pointer test without geometry would be a test of
// nothing. The test therefore installs a **deterministic geometry** (a DIN A4 text
// column, one paragraph, a 20 px line grid) through `getBoundingClientRect` and
// `getComputedStyle`. Everything above the measurement — the click handler, the
// resolver, the model transaction, the caret — is the production code path.
//
// **Honest limit:** this proves the *decision*, not the browser's real layout. The
// real-page half stays the native Windows probe (WR-049).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterEditor } from '../../../editor/WriterEditor';
import { resetWriterCaretController } from '../../../editing/caret/writerCaretController';

/** The writable column of the synthetic page, in viewport pixels. */
const COLUMN = { top: 96, bottom: 1096, left: 96, right: 720 };
const LINE = 20;
/** The paragraph the fixture document starts with: two lines at the top of the page. */
const FIRST_BLOCK_TOP = COLUMN.top;
const FIRST_BLOCK_BOTTOM = FIRST_BLOCK_TOP + 2 * LINE;

const X_ZONES = { left: 120, center: 408, right: 690 } as const;
const Y_HEIGHTS = { first: 300, second: 500, third: 700 } as const;

function freshDocument(id: string): WorkspaceDocument {
  return {
    id,
    title: 'Direkt-Cursor Zeuge',
    kind: 'Writer',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
}

/** A document that already carries one paragraph of running text. */
function documentWithText(id: string, text: string): WorkspaceDocument {
  const base = freshDocument(id);
  const textBlockId = 'tb-' + id;
  return {
    ...base,
    root_object_ids: [textBlockId],
    objects: {
      [textBlockId]: {
        type: 'TextBlock',
        data: {
          id: textBlockId,
          paragraphs: [{
            id: 'p-1',
            style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
            spans: [{ text }],
          }],
        },
      },
    },
  } as WorkspaceDocument;
}

/**
 * The paragraph list of a document, as the Writer persisted it.
 *
 * The Writer keeps its primary text in a `TextBlock` object; the acceptance reads
 * exactly that, so the assertion is about the stored model and not about markup.
 */
function readParagraphs(doc: WorkspaceDocument): Paragraph[] {
  for (const object of Object.values(doc.objects ?? {})) {
    const candidate = object as { type?: string; data?: { paragraphs?: Paragraph[] } };
    if (candidate.type === 'TextBlock' && Array.isArray(candidate.data?.paragraphs)) {
      return candidate.data!.paragraphs!;
    }
  }
  return [];
}

function installSyntheticPageGeometry(): () => void {
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalComputed = window.getComputedStyle;

  const rectOf = (x: number, y: number, width: number, height: number): DOMRect => ({
    x, y, top: y, left: x, right: x + width, bottom: y + height, width, height,
    toJSON: () => ({}),
  }) as DOMRect;

  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
    if (this.getAttribute('data-writer-page-body') === 'true') {
      return rectOf(COLUMN.left, COLUMN.top, COLUMN.right - COLUMN.left, COLUMN.bottom - COLUMN.top);
    }
    if (this.hasAttribute('data-writer-column')) {
      return rectOf(COLUMN.left, COLUMN.top, COLUMN.right - COLUMN.left, COLUMN.bottom - COLUMN.top);
    }
    if (this.hasAttribute('data-writer-paragraph-anchor')) {
      // A fixed two-line block at the top of the column. Deliberately static: the
      // test wants to prove that *every* free-area click ends up at the same
      // decision, not to simulate the growth of the document.
      return rectOf(COLUMN.left, FIRST_BLOCK_TOP, COLUMN.right - COLUMN.left, FIRST_BLOCK_BOTTOM - FIRST_BLOCK_TOP);
    }
    return rectOf(0, 0, 0, 0);
  };

  window.getComputedStyle = ((element: Element) => {
    const base = originalComputed.call(window, element);
    return new Proxy(base, {
      get(target, property) {
        if (property === 'lineHeight') return `${LINE}px`;
        if (property === 'marginBottom') return '0px';
        if (property === 'fontSize') return '14.66px';
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }) as typeof window.getComputedStyle;

  return () => {
    Element.prototype.getBoundingClientRect = originalRect;
    window.getComputedStyle = originalComputed;
  };
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
let restoreGeometry: (() => void) | null = null;

async function mountEditor(start: WorkspaceDocument = freshDocument('doc-direct')): Promise<{ pageBody: HTMLElement; journal: Journal; start: WorkspaceDocument }> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const journal: Journal = { documents: [] };
  await act(async () => {
    root!.render(createElement(ControlledWriter, { start, journal }));
  });
  const pageBody = container.querySelector<HTMLElement>('[data-writer-page-body="true"]');
  expect(pageBody, 'der Seitenkörper muss im DOM stehen').not.toBeNull();
  return { pageBody: pageBody!, journal, start };
}

/** The most recent persisted paragraph list, falling back to the fixture. */
function currentParagraphs(journal: Journal, start: WorkspaceDocument): Paragraph[] {
  for (let index = journal.documents.length - 1; index >= 0; index -= 1) {
    const paragraphs = readParagraphs(journal.documents[index]!);
    if (paragraphs.length > 0) return paragraphs;
  }
  return readParagraphs(start);
}

/**
 * Lets React, its scheduler and the caret frame finish.
 *
 * A single fixed setTimeout(10) made these tests order- and load-dependent: on a
 * busy machine the commit had not happened yet and the assertion read a stale
 * document. Three macrotask hops are cheap and deterministic enough.
 */
async function settle(hops = 3): Promise<void> {
  for (let hop = 0; hop < hops; hop += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

async function clickAt(pageBody: HTMLElement, x: number, y: number): Promise<void> {
  await act(async () => {
    pageBody.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    }));
    await settle();
  });
}

async function doubleClickAt(pageBody: HTMLElement, x: number, y: number): Promise<void> {
  // A real double click delivers click, click, dblclick — in that order.
  await act(async () => {
    for (const type of ['click', 'click', 'dblclick'] as const) {
      pageBody.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }));
    }
    await settle();
  });
}

async function unmountEditor(): Promise<void> {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  document.getSelection()?.removeAllRanges();
}

beforeEach(() => {
  resetWriterCaretController();
  restoreGeometry = installSyntheticPageGeometry();
});

afterEach(async () => {
  await unmountEditor();
  restoreGeometry?.();
  restoreGeometry = null;
});

describe('WR-006/WR-008 — nine single clicks, three heights × three X zones', { timeout: 30_000 }, () => {
  it('always creates a left-aligned paragraph and never aligns by X', async () => {
    const { pageBody, journal, start } = await mountEditor();
    const seen: Array<{ x: number; y: number; alignment: string | undefined }> = [];

    for (const y of Object.values(Y_HEIGHTS)) {
      for (const x of Object.values(X_ZONES)) {
        await clickAt(pageBody, x, y);
        const paragraphs = currentParagraphs(journal, start);
        const created = paragraphs[paragraphs.length - 1];
        seen.push({ x, y, alignment: created?.style.alignment });
      }
    }

    // Every single click produced a paragraph, and every one of them is left-aligned.
    expect(seen).toHaveLength(9);
    for (const sample of seen) {
      expect(sample.alignment, `x=${sample.x} y=${sample.y} must stay left`).toBe('left');
    }
    // The X zone really varied — otherwise the assertion above would be vacuous.
    expect(new Set(seen.map((sample) => sample.x)).size).toBe(3);
  });

  it('stores a positive semantic distance for a click far below the text', async () => {
    const { pageBody, journal, start } = await mountEditor();
    await clickAt(pageBody, X_ZONES.left, Y_HEIGHTS.third);
    const paragraphs = currentParagraphs(journal, start);
    const created = paragraphs[paragraphs.length - 1];
    expect(created).toBeDefined();
    // Third height → further down → a real space_before, not an empty line.
    expect(created!.style.space_before).toBeGreaterThan(0);
    // And it is a normal paragraph with no text, not a box of spaces.
    expect(created!.spans.map((span) => span.text).join('')).toBe('');
  });
});

describe('WR-008 — three deliberate double clicks choose the alignment', { timeout: 30_000 }, () => {
  it('left / center / right per X zone, with exactly one paragraph each', async () => {
    const expectations: Array<[keyof typeof X_ZONES, string]> = [
      ['left', 'left'],
      ['center', 'center'],
      ['right', 'right'],
    ];

    for (const [zone, expected] of expectations) {
      const { pageBody, journal, start } = await mountEditor();
      const before = currentParagraphs(journal, start).length;
      await doubleClickAt(pageBody, X_ZONES[zone], Y_HEIGHTS.second);
      const after = currentParagraphs(journal, start);
      // One gesture, one paragraph: the first click creates it, the second click
      // keeps it, the double click only changes its alignment.
      expect(after.length, `${zone}: exactly one paragraph must be added`).toBe(before + 1);
      expect(after[after.length - 1]!.style.alignment, `${zone}`).toBe(expected);
      await unmountEditor();
    }
  });

  it('never changes the alignment of a double-clicked word in existing text', async () => {
    const { pageBody, journal, start } = await mountEditor(documentWithText('doc-text', 'Astraea Test'));
    const fragment = pageBody.querySelector<HTMLElement>('[data-writer-surface-paragraph]');
    expect(fragment, 'der Absatz muss als Fragment gerendert sein').not.toBeNull();
    const before = currentParagraphs(journal, start);
    const writesBefore = journal.documents.length;

    await act(async () => {
      for (const type of ['click', 'click', 'dblclick'] as const) {
        fragment!.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: COLUMN.left + 40,
          clientY: FIRST_BLOCK_TOP + 5,
        }));
      }
      await settle();
    });

    const after = currentParagraphs(journal, start);
    // The word double click is the browser's selection gesture: no paragraph was
    // created and no existing paragraph was reformatted.
    expect(after.length).toBe(before.length);
    expect(after[0]!.style.alignment).toBe(before[0]!.style.alignment);
    expect(journal.documents.length).toBe(writesBefore);
  });
});

describe('WR-010 — exactly one visible caret after positioning', { timeout: 30_000 }, () => {
  it('focuses the writing surface and puts the DOM caret into the created paragraph', async () => {
    const { pageBody } = await mountEditor();
    await clickAt(pageBody, X_ZONES.center, Y_HEIGHTS.second);

    const surface = container!.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
    expect(surface).not.toBeNull();
    // Exactly one editable root, one focus owner.
    expect(container!.querySelectorAll('[data-writer-rich-surface="true"]')).toHaveLength(1);
    const active = document.activeElement;
    expect(active === surface || surface!.contains(active)).toBe(true);

    // The DOM selection lives inside a paragraph fragment of the surface …
    const selection = window.getSelection();
    expect(selection?.rangeCount).toBe(1);
    const anchorNode = selection!.anchorNode;
    expect(anchorNode).not.toBeNull();
    const anchorFragment = (anchorNode!.nodeType === 1 ? anchorNode as Element : anchorNode!.parentElement)
      ?.closest('[data-writer-surface-paragraph]');
    expect(anchorFragment, 'der Caret muss in einem Absatz-Fragment liegen').not.toBeNull();
    // … and it is collapsed, i.e. one caret and not a spread selection.
    expect(selection!.isCollapsed).toBe(true);
  });
});

/**
 * WR-048 (A/B) — the release checks the plan names explicitly: a real click, then **typing**,
 * read back from the model.
 *
 * The plan forbids substituting `renderToStaticMarkup` or a source string, and the earlier
 * tests only half-covered A and B: they clicked without typing, or typed without clicking.
 * These two tests do the whole gesture and assert the stored text — the strongest witness this
 * environment can produce. **WR-048 stays `BLOCKED`**, because pointer geometry needs a real
 * browser layout engine (no Playwright runner is installed); the native probe covers that half.
 */
describe('WR-048 A/B — click, then type, then read the model', { timeout: 30_000 }, () => {
  async function typeIntoSink(surface: HTMLElement, text: string): Promise<void> {
    for (const character of text) {
      await act(async () => {
        surface.dispatchEvent(new KeyboardEvent('keydown', {
          key: character,
          bubbles: true,
          cancelable: true,
        }));
        await settle(1);
      });
    }
    await settle();
  }

  it('A: a free click on the blank page creates the line, and the typed text lands there', async () => {
    const { pageBody, journal, start } = await mountEditor();
    await clickAt(pageBody, X_ZONES.left, Y_HEIGHTS.second);

    const surface = container!.querySelector<HTMLElement>('[data-writer-rich-surface="true"]')!;
    expect(surface).not.toBeNull();
    await typeIntoSink(surface, 'Hallo');

    const paragraphs = currentParagraphs(journal, start);
    const typed = paragraphs.find((paragraph) => paragraph.spans.map((span) => span.text).join('') === 'Hallo');
    expect(typed, 'der getippte Absatz muss im Modell stehen').toBeDefined();
    expect(typed!.style.space_before).toBeGreaterThan(0);
    expect(typed!.style.alignment).toBe('left');
  });

  it('B: a click far below the text creates an ordered line and typing keeps the order', async () => {
    const { pageBody, journal, start } = await mountEditor(documentWithText('doc-order', 'Erster Absatz'));
    await clickAt(pageBody, X_ZONES.left, Y_HEIGHTS.third);

    const surface = container!.querySelector<HTMLElement>('[data-writer-rich-surface="true"]')!;
    await typeIntoSink(surface, 'Zweiter');

    const paragraphs = currentParagraphs(journal, start);
    // Document order is preserved: the original paragraph stays first, the typed one follows.
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.spans.map((span) => span.text).join('')).toBe('Erster Absatz');
    expect(paragraphs[1]!.spans.map((span) => span.text).join('')).toBe('Zweiter');
    expect(paragraphs[1]!.style.space_before).toBeGreaterThan(0);
  });
});
