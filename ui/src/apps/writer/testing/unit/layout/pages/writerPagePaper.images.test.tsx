// @vitest-environment happy-dom
// STATUS: PLATIN — WR-033: an inserted image must actually be rendered on the page
//
// Native M7 re-probe: images were invisible on **every** page. `WriterPagePaper` decided
// whether to mount `WriterTerminalImageLayer` with `isWriterImageFixedToPage(image)`, but
// that layer renders exactly the images that are *not* fixed to the page. `hasTerminalImage`
// was therefore always `false` for a normal insert, the layer mounted nowhere, and the
// picture only appeared after its anchor paragraph was deleted (the unanchored fallback).
// These tests pin the page's decision to the layer's own filter.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Paragraph, WriterImageBlockData } from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../../types';
import { ensureWriterStyleCatalog } from '../../../../formatting/styles/writerStyles';
import { recalculateNotes } from '../../../../references/notes/writerNotesEngine';
import { WriterPagePaper } from '../../../../layout/pages/WriterPagePaper';

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

function image(overrides: Partial<WriterImageBlockData> = {}): WriterImageBlockData {
  return {
    id: 'img-1',
    name: 'bild.png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    intrinsicWidth: 800,
    intrinsicHeight: 600,
    widthPercent: 70,
    alignment: 'center',
    altText: 'Ein Bild',
    ...overrides,
  };
}

function buildPage(paragraphs: Paragraph[]) {
  return {
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
  };
}

function renderPaper(
  images: WriterImageBlockData[],
  paragraphs: Paragraph[] = [paragraph('p1', 'Text')],
  pageParagraphs: Paragraph[] = paragraphs,
): string {
  return renderToStaticMarkup(
    <WriterPagePaper
      page={buildPage(pageParagraphs)}
      totalPages={1}
      docWordCount={1}
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
      images={images}
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
      documentTitle="Bildvertrag"
      readOnly={false}
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

const rendered = (markup: string, id: string): boolean => markup.includes(`data-writer-image-id="${id}"`);

describe('WR-033 — an image anchored to a paragraph is rendered on that page', () => {
  it('renders a normally imported image (no wrap mode, anchored paragraph)', () => {
    // This is the exact shape `importWriterImage` produces: no `wrapMode`, no `placement`.
    const markup = renderPaper([image({ id: 'img-inline', anchorParagraphId: 'p1' })]);
    expect(rendered(markup, 'img-inline')).toBe(true);
    expect(markup).toContain('alt="Ein Bild"');
  });

  it('renders an explicit top-and-bottom image', () => {
    const markup = renderPaper([image({ id: 'img-top-bottom', anchorParagraphId: 'p1', wrapMode: 'top-bottom' })]);
    expect(rendered(markup, 'img-top-bottom')).toBe(true);
  });

  it('renders a text-wrapped image through the anchored layer', () => {
    const markup = renderPaper([image({ id: 'img-square', anchorParagraphId: 'p1', wrapMode: 'square', placement: 'float-left' })]);
    expect(rendered(markup, 'img-square')).toBe(true);
  });

  it('renders a behind-the-text image instead of blanking it', () => {
    const markup = renderPaper([image({ id: 'img-behind', anchorParagraphId: 'p1', wrapMode: 'behind-text' })]);
    expect(rendered(markup, 'img-behind')).toBe(true);
  });

  it('does not render an image anchored to a paragraph of another page', () => {
    // p2 exists in the document but is paginated onto a later page.
    const markup = renderPaper(
      [image({ id: 'img-elsewhere', anchorParagraphId: 'p2' })],
      [paragraph('p1', 'Text'), paragraph('p2', 'Später')],
      [paragraph('p1', 'Text')],
    );
    expect(rendered(markup, 'img-elsewhere')).toBe(false);
  });

  it('renders an image without an anchor through the unanchored fallback', () => {
    const markup = renderPaper([image({ id: 'img-orphan' })]);
    expect(rendered(markup, 'img-orphan')).toBe(true);
  });
});
