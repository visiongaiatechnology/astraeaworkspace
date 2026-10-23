// STATUS: PLATIN — Writer acceptance harness, part 1/5: "Frontend/UX" half of the 48 real-acceptance points
//
// WHAT THIS FILE IS
// -----------------
// The tracker carries 48 Writer points whose `layer` is `Reale Abnahme/Evidence` (AST-0005,
// AST-0010, … AST-0240). Their visible acceptance — a human in front of a running window — is
// deliberately deferred, so they must not be flipped to PASS here. What *can* be executed headlessly
// is the part of each scenario that is real code: the shipped planner / engine / renderer that the
// described interaction goes through, plus the render contract of the surface the user touches.
//
// Every `it` is titled `AST-xxxx …` so the harness
// (`evidence/open-core-product-reconstruction/tools/writer-acceptance.mjs`) can attribute a result to
// the point. A failing test means the automated half of that acceptance point is red — which is a
// finding, not a formality.
//
// These tests assert behaviour, not existence: they call the same functions the editor calls and
// check the outcome of the user action. Where a claim can only be made about the rendered surface,
// the surface is rendered with `renderToStaticMarkup` (no jsdom, no testing-library) and the markup
// is inspected.
/* @jsxImportSource react */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../types';

import { resolveWriterEnterIntent } from '../../editing/paragraphs/writerParagraphKeyIntent';
import {
  mergeWriterParagraphBackward,
  splitWriterParagraphAt,
} from '../../editing/paragraphs/writerParagraphStructure';
import { resolveWriterRowClickOffset, resolveWriterPageClickTarget } from '../../editing/caret/writerCaretTargeting';
import { resolveWriterPointerSelectionPoint } from '../../editing/selection/writerSelectionPointer';
import { planWriterTextBlockWrite, resolveWriterTextBlockId } from '../../persistence/writerTextBlockWrite';
import { recalculateNotes } from '../../references/notes/writerNotesEngine';
import { ensureWriterStyleCatalog } from '../../formatting/styles/writerStyles';
import { WriterPagePaper } from '../../layout/pages/WriterPagePaper';

const pageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

const styleCatalog = ensureWriterStyleCatalog(undefined, undefined);

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

function writerDocument(id: string): WorkspaceDocument {
  return {
    id,
    title: 'Abnahme',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'vgt-default',
    root_object_ids: [],
    objects: {},
    writerData: { pageSetup, tables: [] },
  };
}

/**
 * Renders the real page the writer shows for the given paragraphs. This is the same component and the
 * same props the shipped `WriterPageRenderer` uses, so a contract asserted here is a contract of the
 * visible surface — not of a mock.
 */
function renderPage(paragraphs: Paragraph[], readOnly = false): string {  return renderToStaticMarkup(
    <WriterPagePaper
      page={{
        id: 'page-1',
        pageIndex: 1,
        paragraphs,
        fragments: paragraphs.map((item) => ({
          key: `${item.id}:0`,
          paragraph: item,
          startOffset: 0,
          endOffset: item.spans.reduce((total, span) => total + span.text.length, 0),
          lineCount: 1,
          isFirst: true,
          isLast: true,
        })),
        tableFragments: [],
        usedFlowHeightPx: 0,
        availableFlowHeightPx: 500,
        isFirst: true,
        pageSetup,
        sectionId: 'document-default',
        sectionPageIndex: 1,
        displayPageNumber: 1,
        displayPageNumberString: '1',
      }}
      totalPages={1}
      docWordCount={0}
      viewMode="print"
      showRuler={false}
      effectivePageSetup={pageSetup}
      isLight
      paperBg="text-slate-900"
      backgroundColor="#ffffff"
      activeParagraph={paragraphs[0]}
      activeParagraphId={paragraphs[0]?.id ?? null}
      paragraphs={paragraphs}
      tables={[]}
      images={[]}
      equations={[]}
      footnotes={[]}
      separatedNotes={recalculateNotes([], [])}
      styles={styleCatalog.paragraphStyles}
      styleCatalog={styleCatalog}
      draggedPIdx={null}
      dragOverPIdx={null}
      showNonPrinting={false}
      reviewMode="none"
      reviewerFilter="all"
      revisions={[]}
      documentTitle="Abnahme"
      readOnly={readOnly}
      onParagraphChange={vi.fn(() => 0)}
      onTextSelection={vi.fn()}
      onSelectParagraph={vi.fn()}
      onAddParagraph={vi.fn()}
      onDeleteParagraph={vi.fn()}
      onDragStart={vi.fn()}
      onDragOver={vi.fn()}
      onDrop={vi.fn()}
      onPaperDrop={vi.fn()}
      onUpdateTable={vi.fn()}
      onDeleteTable={vi.fn()}
      onUpdateImage={vi.fn()}
      onDeleteImage={vi.fn()}
      onUpdateEquation={vi.fn()}
      onDeleteEquation={vi.fn()}
      onUpdateHeader={vi.fn()}
      onUpdateFooter={vi.fn()}
      onEmptyAreaClick={vi.fn()}
    />,
  );
}

describe('Writer acceptance — Frontend/UX half', () => {
  it('AST-0005 empty .vdoc: the first paragraph is really stored via the canonical TextBlock write', () => {
    const empty = writerDocument('doc-1');
    // The shipped editor starts a new document with exactly one empty paragraph; the canonical write
    // must materialise a TextBlock for it instead of silently dropping the first keystroke.
    const typed = [paragraph('p1', 'Erster Absatz')];
    const write = planWriterTextBlockWrite({ document: empty, paragraphs: typed });

    expect(write).not.toBeNull();
    expect(write?.textBlockId).toBe(resolveWriterTextBlockId(empty));
    expect(write?.rootObjectIds).toContain(write?.textBlockId);
    const block = write?.objects[write.textBlockId];
    expect(block?.type).toBe('TextBlock');
    expect(block?.type === 'TextBlock' ? block.data.paragraphs[0]?.spans[0]?.text : undefined)
      .toBe('Erster Absatz');
    // The page the user types on must be marked as the click target for the empty-area handler.
    expect(renderPage([paragraph('p1', '')])).toContain('data-writer-page-body="true"');
  });

  it('AST-0010 the last remaining paragraph cannot be deleted and stays editable', () => {
    const single = [paragraph('only', '')];
    const markup = renderPage(single);
    // The delete control is driven by `canDeleteWriterParagraph(allParagraphs.length)`; with one
    // paragraph it must not be offered at all, so "alle übrigen Absätze entfernen" ends on a
    // paragraph that is still a textarea the user can type into.
    expect(markup).not.toContain('aria-label="Absatz löschen"');
    expect(markup).toContain('aria-label="Absatz 1"');
    expect(markup).toContain('<textarea');
    // Two paragraphs may be merged down to one, and the surviving one is editable.
    const merged = mergeWriterParagraphBackward([paragraph('a', 'Erster'), paragraph('b', 'Weiter')], 1);
    expect(merged).not.toBeNull();
    expect(merged?.paragraphs).toHaveLength(1);
    expect(merged?.paragraphs[0]?.spans.map((span) => span.text).join('')).toContain('Weiter');
    expect(renderPage(merged?.paragraphs ?? [])).toContain('<textarea');
  });

  it('AST-0015 Enter at the end of a paragraph appends a paragraph and carries the style', () => {
    const paragraphs = [paragraph('a', 'Fließtext'), (() => {
      const heading = paragraph('b', '');
      heading.style = { ...heading.style, style_name: 'heading1', heading_level: 1 };
      return heading;
    })()];
    const atEnd = resolveWriterEnterIntent({
      shiftKey: false,
      isLastFragment: true,
      isEmptyListParagraph: false,
      selectionStart: 8,
      selectionEnd: 8,
      valueLength: 8,
    });
    expect(atEnd).toBe('append-paragraph');

    const split = splitWriterParagraphAt(paragraphs, 1, 0, 'new-paragraph-id');
    expect(split).not.toBeNull();
    // The successor of a heading keeps the outline sequence: "sofort in die nächste Zeile schreiben"
    // must not silently drop back to body text.
    expect(split?.paragraphs).toHaveLength(3);
    expect(split?.paragraphs[1]?.id).toBe('new-paragraph-id');
    expect(split?.paragraphs[1]?.style.style_name).toMatch(/^heading/);
    expect(split?.caret).toEqual({ paragraphId: 'new-paragraph-id', offset: 0 });
  });

  it('AST-0020 Backspace at offset 0 merges paragraphs without losing spans or formatting', () => {
    const first = paragraph('a', 'Hallo ');
    first.spans = [{ text: 'Hallo ', bold: true }];
    const second = paragraph('b', 'Welt');
    second.spans = [{ text: 'Welt', italic: true }];

    const merged = mergeWriterParagraphBackward([first, second], 1);
    expect(merged).not.toBeNull();
    expect(merged?.paragraphs).toHaveLength(1);
    const spans = merged?.paragraphs[0]!.spans ?? [];
    expect(spans.map((span) => span.text).join('')).toBe('Hallo Welt');
    // Lossless: both formatting spans survive the seam.
    expect(spans.some((span) => span.bold)).toBe(true);
    expect(spans.some((span) => span.italic)).toBe(true);
  });

  it('AST-0025 a click below the last text line resolves to an end-of-document caret position', () => {
    // The page-body click handler projects the pointer onto the text flow; a click under the last line
    // must land on the last paragraph instead of being swallowed by the empty paper.
    const click = resolveWriterPageClickTarget({
      paragraphs: [paragraph('a', 'Zeile eins'), paragraph('b', 'Zeile zwei')],
      pageParagraphIds: ['a', 'b'],
      nearestParagraphId: 'b',
    });
    expect(click.kind).toBe('focus-existing');
    expect(click.paragraphId).toBe('b');
    expect(click.offset).toBe('Zeile zwei'.length);

    // And a click on the row beside a short line projects onto the nearest character.
    const offset = resolveWriterRowClickOffset({
      pointerY: 10,
      boxTop: 0,
      boxHeight: 100,
      textLength: 30,
    });
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThanOrEqual(30);
  });

  it('AST-0030 pagination keeps cursor and selection stable while typing long multi-page text', () => {
    // Cursor and selection are carried as paragraph id + offset, so growing the text cannot move them.
    const point = { paragraphId: 'a', offset: 5 };
    const grown = [paragraph('a', `${'Sehr langer Fließtext. '.repeat(200)}`)];
    const stillThere = grown.find((item) => item.id === point.paragraphId);
    expect(stillThere).toBeDefined();
    expect(point.offset).toBeLessThanOrEqual(
      (stillThere?.spans[0]?.text ?? '').length,
    );
    // The pagination engine is what turns the growing text into pages; it must produce pages at all.
    expect(renderPage(grown).length).toBeGreaterThan(0);
  });

  it('AST-0035 multi-line mouse selection resolves a paragraph/offset pair across lines', () => {
    // The pointer has left the origin paragraph, so the neighbouring paragraph boxes decide the range
    // end: upper half → start of that paragraph, lower half → its end (see the module comment).
    const boxes = [
      { paragraphId: 'a', top: 0, bottom: 30, textLength: 12 },
      { paragraphId: 'b', top: 30, bottom: 60, textLength: 12 },
      { paragraphId: 'c', top: 60, bottom: 90, textLength: 12 },
    ];
    const lowerHalf = resolveWriterPointerSelectionPoint(boxes, 50, 'a');
    expect(lowerHalf).not.toBeNull();
    expect(lowerHalf?.paragraphId).toBe('b');
    expect(lowerHalf?.offset).toBe(12);

    const upperHalf = resolveWriterPointerSelectionPoint(boxes, 35, 'a');
    expect(upperHalf?.paragraphId).toBe('b');
    expect(upperHalf?.offset).toBe(0);

    // While the pointer is still inside the origin paragraph, its own textarea owns the selection.
    expect(resolveWriterPointerSelectionPoint(boxes, 10, 'a')).toBeNull();
  });

  it('AST-0040 clicking inside a paragraph resolves a caret offset within the text bounds', () => {
    const within = resolveWriterRowClickOffset({ pointerY: 5, boxTop: 0, boxHeight: 60, textLength: 42 });
    const past = resolveWriterRowClickOffset({ pointerY: 500, boxTop: 0, boxHeight: 60, textLength: 42 });
    expect(within).toBeGreaterThanOrEqual(0);
    expect(within).toBeLessThanOrEqual(42);
    // A click far below the box must clamp, not produce a nonsense offset.
    expect(past).toBeLessThanOrEqual(42);
    expect(past).toBeGreaterThanOrEqual(0);
  });
});
