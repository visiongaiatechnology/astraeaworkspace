// STATUS: PLATIN — Writer page paper render contract for empty-page caret targeting
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
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

const emptyParagraph = paragraph('p1', '');

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

function renderPaper(paragraphs: Paragraph[] = [emptyParagraph], readOnly = false): string {
  return renderToStaticMarkup(
    <WriterPagePaper
      page={buildPage(paragraphs)}
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
      documentTitle="Contract"
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

describe('Writer page paper render contract', () => {
  const markup = renderPaper();

  it('marks the page body so the empty-area click handler can attach to it', () => {
    expect(markup).toContain('data-writer-page-body="true"');
  });

  it('marks every flow item and exposes the paragraph anchor id', () => {
    expect(markup).toContain('data-writer-flow-item="paragraph"');
    expect(markup).toContain('data-writer-paragraph-anchor="p1"');
    expect(markup).toContain('id="writer-paragraph-p1"');
  });

  it('renders the single empty paragraph as an editable textarea with an accessible name', () => {
    expect(markup).toContain('<textarea');
    expect(markup).toContain('aria-label="Absatz 1"');
    expect(markup).toContain('aria-multiline="true"');
  });

  it('does not mark the document read-only for an unprotected document', () => {
    expect(markup).not.toContain('aria-readonly="true"');
  });

  it('marks the textarea read-only for a protected document', () => {
    expect(renderPaper([emptyParagraph], true)).toContain('aria-readonly="true"');
  });

  it('offers no delete control while only one paragraph exists', () => {
    expect(renderPaper([emptyParagraph])).not.toContain('aria-label="Absatz löschen"');
  });

  it('offers a delete control as soon as a second paragraph exists', () => {
    const twoParagraphs = renderPaper([paragraph('p1', 'Alpha'), paragraph('p2', '')]);
    expect(twoParagraphs).toContain('aria-label="Absatz löschen"');
    expect(twoParagraphs).toContain('data-writer-paragraph-anchor="p2"');
  });

  it('offers no delete control in a read-only document', () => {
    const readOnly = renderPaper([paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')], true);
    expect(readOnly).not.toContain('aria-label="Absatz löschen"');
  });
});
