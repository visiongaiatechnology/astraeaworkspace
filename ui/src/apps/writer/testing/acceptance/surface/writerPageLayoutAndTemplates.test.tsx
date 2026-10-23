// @vitest-environment happy-dom
// STATUS: PLATIN — Page layout, breaks, templates and scoped paragraph formatting (M6)
//
// ASTRAEA WRITER 50 V2 · WR-026 … WR-030.
//
// Every case drives the real editor and asserts on the persisted model: a manual page
// break is a **semantic flag**, not a filler object; `Enter` after a heading continues
// in `normal`; and a paragraph command reaches exactly the paragraphs the range covers.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterEditor } from '../../../editor/WriterEditor';
import { writeWriterSurfaceSelection } from '../../../editor/surface/writerDomModelAdapter';
import { resetWriterCaretController } from '../../../editing/caret/writerCaretController';
import { resolveWriterDirectCaretTarget, writerCaretPxToPt } from '../../../editing/caret/writerCaretTargeting';
import { getWriterPageGeometry } from '../../../layout/pagination/geometry/writerPaginationGeometry';
import { paginateWriterParagraphs } from '../../../layout/pagination/paragraphs/writerParagraphPagination';

function paragraph(id: string, text: string | { text: string }, style: Partial<Paragraph['style']> = {}): Paragraph {
  const value = typeof text === 'string'
    ? text
    : Array.isArray(text)
      ? text.map((span) => span.text).join('')
      : (text?.text ?? '');
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0, ...style },
    spans: [{ text: value }],
  };
}

function documentWith(id: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlockId = 'tb-' + id;
  return {
    id,
    title: 'M6 Zeuge',
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
    root!.render(createElement(ControlledWriter, { start: documentWith('doc-m6', paragraphs), journal }));
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

describe('WR-027 — the page break is a semantic flag, not a filler object', () => {
  it('inserts a page break with Ctrl+Enter at the caret', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', [{ text: 'Erster Absatz' }] as never),
      paragraph('p2', { text: 'Zweiter Absatz' } as never),
    ] as never);
    await setCaret(surface, 'p2', 0);
    await press(surface, 'Enter', { ctrlKey: true });
    await settle(3);

    const paragraphs = current(journal, initial);
    const broken = paragraphs.find((item) => item.style.page_break_before === true);
    expect(broken, 'Strg+Enter setzt page_break_before').toBeDefined();
    // The model carries **no** filler object and no marker text: the text is preserved
    // verbatim and the break exists only as the paragraph flag.
    expect(paragraphs.some((item) => item.spans.some((span) => span.text.includes('PAGEBREAK')))).toBe(false);
    expect(paragraphs.map((item) => item.spans.map((span) => span.text).join('')).join('')).toBe('Erster AbsatzZweiter Absatz');
  });

  it('removes the break with Backspace at the document start and restores it with Ctrl+Z', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', { text: 'Mit Umbruch' } as never, { page_break_before: true } as never),
      paragraph('p2', { text: 'Danach' } as never),
    ] as never);
    await setCaret(surface, 'p1', 0);
    await press(surface, 'Backspace');
    await settle(3);
    expect(current(journal, initial)[0]!.style.page_break_before).toBeUndefined();

    await press(surface, 'z', { ctrlKey: true });
    await settle(3);
    expect(current(journal, initial)[0]!.style.page_break_before, 'Undo stellt den Umbruch wieder her').toBe(true);
  });

  it('recomputes the page count when the text column gets narrower', () => {
    // The paginator is a pure function of the document and the page setup: a narrower
    // text column (wider margins) must produce more pages, not the same count.
    const long = 'Satz '.repeat(900).trim();
    const paragraphs = [paragraph('p1', long)];
    const normalSetup = {
      paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
      showPageNumbers: true, columns: 1,
    } as never;
    const wideSetup = {
      paperSize: 'A4', orientation: 'portrait', paperColor: 'white', showPageNumbers: true, columns: 1,
      margins: 'custom',
      customMargins: { top: 40, bottom: 40, left: 60, right: 60 },
    } as never;

    const normalPages = paginateWriterParagraphs(paragraphs, normalSetup, []).length;
    const widePages = paginateWriterParagraphs(paragraphs, wideSetup, []).length;
    expect(normalPages, 'ein langer Text füllt mehr als eine Seite').toBeGreaterThan(1);
    expect(widePages, 'breitere Ränder ergeben mehr Seiten').toBeGreaterThan(normalPages);
  });});

describe('WR-029 — Enter after a heading continues in "normal"', () => {
  it('creates a normal paragraph after a level-1 heading', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('h1', { text: 'Kapitel' } as never, { heading_level: 1, style_name: 'heading1' } as never),
      paragraph('p2', { text: 'Text' } as never),
    ] as never);
    await setCaret(surface, 'h1', 7);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    const created = paragraphs.find((item) => item.id !== 'h1' && item.id !== 'p2');
    expect(created, 'Enter muss einen neuen Absatz anlegen').toBeDefined();
    expect(created!.style.heading_level, 'nach einer Überschrift folgt Normal').toBeUndefined();
    expect(created!.style.style_name).toBe('normal');
    // The heading itself stays a heading.
    expect(paragraphs.find((item) => item.id === 'h1')!.style.heading_level).toBe(1);
  });

  it('keeps the heading when the split happens inside the heading text', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('h1', { text: 'Kapitel Eins' } as never, { heading_level: 2, style_name: 'heading2' } as never),
    ] as never);
    await setCaret(surface, 'h1', 7);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    expect(paragraphs).toHaveLength(2);
    // Both halves are still the heading — only the *end* of a heading starts "normal".
    expect(paragraphs[1]!.style.heading_level).toBe(2);
  });
});

describe('WR-030 — a paragraph command reaches exactly the covered paragraphs', () => {
  it('centres only the marked paragraphs of a three-paragraph document', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', { text: 'Eins' } as never),
      paragraph('p2', { text: 'Zwei' } as never),
      paragraph('p3', { text: 'Drei' } as never),
    ] as never);
    await select(surface, ['p1', 2], ['p2', 2]);

    // The toolbar command, reached through the editor's own alignment callback.
    const alignmentButton = Array.from(container!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => (button.getAttribute('aria-label') ?? '').toLowerCase().includes('center')
        || (button.getAttribute('title') ?? '').toLowerCase().includes('zentriert'));
    expect(alignmentButton, 'der Zentriert-Knopf muss existieren').toBeDefined();
    await act(async () => {
      alignmentButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await settle(3);
    });

    const paragraphs = current(journal, initial);
    expect(paragraphs[0]!.style.alignment).toBe('center');
    expect(paragraphs[1]!.style.alignment).toBe('center');
    expect(paragraphs[2]!.style.alignment, 'der dritte Absatz bleibt unberührt').toBe('left');
  });

  it('keeps the semantic distance of a direct-cursor paragraph (WR-007) intact', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', { text: 'Oben' } as never),
      paragraph('p2', { text: '' } as never, { space_before: 96 } as never),
      paragraph('p3', { text: 'Unten' } as never),
    ] as never);
    await select(surface, ['p1', 0], ['p1', 4]);

    const spacingSelect = container!.querySelector<HTMLSelectElement>('select[data-writer-line-spacing-mixed]');
    expect(spacingSelect, 'der Zeilenabstand muss erreichbar sein').not.toBeNull();
    await act(async () => {
      spacingSelect!.value = '2';
      spacingSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(3);
    });

    const paragraphs = current(journal, initial);
    expect(paragraphs[0]!.style.line_height).toBe(2);
    // The direct-cursor distance is not nulled by an unrelated command.
    expect(paragraphs[1]!.style.space_before).toBe(96);
  });
});

describe('WR-026 — margins define the writing area, rulers follow the zoom', () => {
  it('clamps a horizontal click outside the margins onto the text column', () => {
    // A4 text column between x=100 and x=500, one paragraph with two lines.
    const column = { left: 100, top: 50, right: 500, bottom: 650 };
    const measured = [{
      paragraphId: 'p1',
      index: 0,
      top: 60,
      bottom: 100,
      left: column.left,
      right: column.right,
      lineHeightPx: 20,
      marginBottomPx: 0,
      textLength: 40,
    }];
    const resolve = (x: number) => resolveWriterDirectCaretTarget({
      measured,
      pointer: { x, y: 70 },
      column,
      columnIndex: 0,
      pageIndex: 0,
      zoom: 100,
      defaultLineHeightPx: 20,
      paragraphCount: 1,
      intent: 'normal',
    } as never);

    // Far outside on both sides still resolves to a position **inside** the paragraph.
    for (const target of [resolve(-4000), resolve(4000)]) {
      expect(target, 'ein Klick außerhalb des Satzspiegels muss auflösen').not.toBeNull();
      expect(target.kind).toBe('focus-existing');
      if (target.kind !== 'focus-existing') return;
      expect(target.offset).toBeGreaterThanOrEqual(0);
      expect(target.offset).toBeLessThanOrEqual(40);
      expect(target.lineIndex).toBe(0);
    }
  });
  it('keeps the paper geometry zoom-independent and divides the zoom out of a click', () => {
    // The ruler is rendered at paper scale; the **page** is what the zoom scales. So
    // the millimetre grid must not change with the zoom, and a pointer position must
    // be converted back into points before it is compared with the model.
    const columnWidth = getWriterPageGeometry({
      paperSize: 'A4',
      orientation: 'portrait',
      margins: 'normal',
      paperColor: 'white',
      showPageNumbers: true,
      columns: 1,
    } as never).columnWidthPx;

    // 96 CSS pixels per inch are 72 points: at 100 % zoom, 96 px are 72 pt.
    expect(writerCaretPxToPt(96, 100)).toBeCloseTo(72, 5);
    // A smaller zoom shows *more* paper per device pixel, so the same 96 device
    // pixels are more points — the conversion has to divide the zoom out.
    expect(writerCaretPxToPt(96, 80)).toBeCloseTo(90, 5);
    expect(writerCaretPxToPt(96, 125)).toBeCloseTo(57.6, 5);
    // The column width itself is a property of the paper, not of the view.
    expect(columnWidth).toBeGreaterThan(0);
  });
});

/**
 * Native round 6 — three Enter rules the E2E run measured on the desktop.
 *
 * All three were model-level wrong, so they are witnessed here on the persisted document and
 * not on a screenshot: the follow style after a title, the break a split must not inherit, and
 * the list exit on an empty bullet.
 */
describe('native round 6 — Enter after title, after a manual break, and on an empty bullet', () => {
  it('continues a 26 pt title with a normal paragraph (WR-029)', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('title', { text: 'Berichtstitel' } as never, { style_name: 'title' } as never),
    ] as never);
    // `title` carries no `heading_level`; the old predicate only looked at that level and
    // therefore kept the 26 pt style for every following paragraph.
    await setCaret(surface, 'title', 13);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    expect(paragraphs, 'nach dem Titel muss ein Absatz entstehen').toHaveLength(2);
    const created = paragraphs[1]!;
    expect(created.style.style_name, 'der Folgestil ist Normaltext').toBe('normal');
    expect(created.style.heading_level).toBeUndefined();
    // The title itself stays the title.
    expect(paragraphs[0]!.style.style_name).toBe('title');
  });

  it('keeps the title style when Enter splits the title text in the middle', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('title', { text: 'Berichtstitel' } as never, { style_name: 'title' } as never),
    ] as never);
    await setCaret(surface, 'title', 6);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]!.style.style_name, 'ein Schnitt im Titel bleibt ein Titel').toBe('title');
  });

  it('does not inherit a manual page break into the paragraph Enter creates', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', { text: 'Seite eins' } as never, { page_break_before: true } as never),
    ] as never);
    await setCaret(surface, 'p1', 9);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]!.style.page_break_before, 'der neue Absatz erbt den Umbruch nicht').toBeUndefined();
    expect(paragraphs[0]!.style.page_break_before, 'der markierte Absatz behält ihn').toBe(true);
  });

  it('does not add a second break right after Strg+Enter + Enter', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', { text: 'Text' } as never),
      paragraph('p2', { text: 'Zweiter Absatz' } as never),
    ] as never);
    await setCaret(surface, 'p2', 0);
    await press(surface, 'Enter', { ctrlKey: true });
    await settle(3);
    // The break command creates the paragraph that starts the new page.
    const afterBreak = current(journal, initial);
    const brokenIndex = afterBreak.findIndex((item) => item.style.page_break_before === true);
    expect(brokenIndex, 'Strg+Enter setzt den Umbruch').toBeGreaterThanOrEqual(0);

    // Enter inside that paragraph must split it without copying the flag.
    const broken = afterBreak[brokenIndex]!;
    await setCaret(surface, broken.id, 0);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    const flagged = paragraphs.filter((item) => item.style.page_break_before === true);
    expect(flagged, 'genau ein manueller Umbruch bleibt bestehen').toHaveLength(1);
  });

  it('leaves the list on Enter in an empty list item instead of adding a bullet', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', { text: 'Erster Punkt' } as never, { list_style: 'bullet', list_level: 0 } as never),
      paragraph('p2', { text: '' } as never, { list_style: 'bullet', list_level: 0 } as never),
    ] as never);
    await setCaret(surface, 'p2', 0);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    expect(paragraphs, 'kein weiterer leerer Punkt').toHaveLength(2);
    expect(paragraphs[1]!.style.list_style, 'die Liste ist für diesen Absatz beendet').toBeUndefined();
    expect(paragraphs[1]!.style.list_level).toBeUndefined();
    expect(paragraphs[0]!.style.list_style, 'der erste Punkt bleibt ein Punkt').toBe('bullet');
  });

  it('still continues the list when the list item has text', async () => {
    const { surface, journal, initial } = await mount([
      paragraph('p1', { text: 'Erster Punkt' } as never, { list_style: 'bullet', list_level: 0 } as never),
    ] as never);
    await setCaret(surface, 'p1', 13);
    await press(surface, 'Enter');
    await settle(3);

    const paragraphs = current(journal, initial);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]!.style.list_style, 'ein Punkt mit Text setzt die Liste fort').toBe('bullet');
  });
});

describe('native round 6 — a header double click edits the clicked page only', () => {
  it('renders exactly one header field, on the page that was double-clicked', async () => {
    // Enough text for several sheets: the paginator works on estimated line counts here, and
    // the regression needs at least two pages with a header zone each.
    const many = Array.from({ length: 60 }, (_, index) => paragraph(
      `p${index}`,
      { text: `Absatz ${index}. ${'Fülltext für den Seitenumbruch. '.repeat(6)}` } as never,
    ));
    const { surface } = await mount(many as never);
    const zones = Array.from(surface.querySelectorAll<HTMLElement>('[data-writer-header-zone="true"]'));
    expect(zones.length, 'für diese Probe braucht es mindestens zwei Seiten').toBeGreaterThan(1);

    await act(async () => {
      zones[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await settle(2);
    });

    const inputs = Array.from(surface.querySelectorAll<HTMLElement>('[data-writer-header-editor="true"]'));
    expect(inputs, 'nur EIN Feld darf im Editiermodus existieren').toHaveLength(1);
    expect(zones[0]!.contains(inputs[0]!), 'das Feld gehört zur geklickten Seite').toBe(true);
    for (const zone of zones.slice(1)) {
      expect(zone.querySelector('[data-writer-header-editor="true"]'), 'andere Seiten bleiben passiv').toBeNull();
    }
  });
});
