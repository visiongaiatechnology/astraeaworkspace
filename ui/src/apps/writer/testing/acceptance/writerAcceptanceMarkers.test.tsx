// STATUS: PLATIN — Writer acceptance harness, part 8/7: the render contracts the notes claim.
//
// WHY THIS FILE EXISTS
// --------------------
// The audit found five notes whose claim names a rendered marker (`data-writer-header-preview`,
// `data-writer-outline-id`, `aria-multiline`, …) while the cited test never asserted that marker. The
// markers are rendered by components that render fine under `renderToStaticMarkup`, so the honest fix is
// to *assert* them rather than to weaken the note.
//
// Each `it` is titled `AST-xxxx` so `tools/writer-acceptance.mjs` and
// `tools/writer-claim-verification.mjs` can attribute the result to the point.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../types';
import { WriterPageHeaderFooter } from '../../layout/pages/WriterPageHeaderFooter';
import { WriterTocSidebar } from '../../navigation/toc/WriterTocSidebar';
import { recalculateNotes } from '../../references/notes/writerNotesEngine';
import { ensureWriterStyleCatalog } from '../../formatting/styles/writerStyles';
import { WriterPagePaper } from '../../layout/pages/WriterPagePaper';

const pageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  pageNumberFormat: 'arabic',
  pageNumberPosition: 'footer-center',
  headerText: 'Astraea',
  footerText: 'Seite {PAGE} von {NUMPAGES}',
};

function paragraph(id: string, text: string, extra: Partial<Paragraph['style']> = {}): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0, ...extra },
    spans: [{ text }],
  };
}

describe('the rendered markers the notes claim', () => {
  it('AST-0141 the header and the footer render their own preview element with the evaluated field text', () => {
    // The preview only exists while the field actually contains a field marker: substituting a template
    // with no fields would be a no-op, and claiming a preview element there would be false.
    //
    // ASTRAEA WRITER 50 V2 · M1 (WR-003/WR-004): the field is an **editor**, so it only
    // exists in the deliberate edit state. `editing` is the explicit double-click mode;
    // the passive sheet renders the evaluated text and no input at all.
    const header = renderToStaticMarkup(
      <WriterPageHeaderFooter
        type="header"
        pageIndex={2}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={42}
        editing
        pageSetup={{ ...pageSetup, headerText: 'Astraea · Seite {PAGE} von {NUMPAGES}' }}
      />,
    );
    expect(header).toContain('data-writer-header-preview="true"');
    // The preview shows the **evaluated** value, the input keeps the template.
    expect(header).toContain('value="Astraea · Seite {PAGE} von {NUMPAGES}"');
    expect(header).toContain('Astraea · Seite 2 von 3');

    const footer = renderToStaticMarkup(
      <WriterPageHeaderFooter
        type="footer"
        pageIndex={1}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={0}
        editing
        pageSetup={pageSetup}
      />,
    );
    expect(footer).toContain('data-writer-footer-preview="true"');
    expect(footer).toContain('Seite 1 von 3');

    // Without a field marker there is no preview element — the condition is real, not decorative.
    const plainHeader = renderToStaticMarkup(
      <WriterPageHeaderFooter
        type="header"
        pageIndex={1}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={0}
        editing
        pageSetup={{ ...pageSetup, headerText: 'Astraea' }}
      />,
    );
    expect(plainHeader).not.toContain('data-writer-header-preview');
  });

  it('AST-0141 the editable header field still holds the template, not the substituted value', () => {
    const withTemplateField = renderToStaticMarkup(
      <WriterPageHeaderFooter
        type="footer"
        pageIndex={1}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={0}
        editing
        pageSetup={{ ...pageSetup, footerText: 'Seite {PAGE}' }}
      />,
    );
    // The input carries the template so the user can edit it; substituting here was the W-… defect.
    expect(withTemplateField).toContain('value="Seite {PAGE}"');
  });

  it('WR-003 the passive header shows the text but never an input field', () => {
    // The defect the plan names: a fresh DIN A4 sheet carried a permanently visible,
    // blue-framed header input, a technical label chip and the paper format. None of
    // that may be part of the normal writing surface.
    const passive = renderToStaticMarkup(
      <WriterPageHeaderFooter
        type="header"
        pageIndex={1}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={0}
        pageSetup={{ ...pageSetup, headerText: 'Astraea' }}
      />,
    );
    expect(passive).toContain('data-writer-header-zone="true"');
    expect(passive).toContain('data-writer-header-footer-state="passive"');
    // The stored text stays visible, at its correct place.
    expect(passive).toContain('Astraea');
    // But nothing is an editable field, and no technical chrome is rendered.
    expect(passive).not.toContain('<input');
    expect(passive).not.toContain('aria-label="Kopfzeilentext"');
    expect(passive).not.toContain('data-writer-header-preview');
  });

  it('AST-0226 the outline panel marks every entry with a stable id attribute for the jump', () => {
    const paragraphs = [
      paragraph('h1', 'Kapitel A', { heading_level: 1, style_name: 'heading1' }),
      paragraph('p1', 'Text'),
      paragraph('h2', 'Kapitel B', { heading_level: 2, style_name: 'heading2' }),
    ];
    const sidebar = renderToStaticMarkup(
      <WriterTocSidebar
        paragraphs={paragraphs}
        isOpen
        onClose={() => undefined}
        onJumpToParagraph={() => undefined}
        activeParagraphId="h1"
        pages={[]}
        sections={[]}
        footnotes={[]}
        tables={[]}
        images={[]}
        equations={[]}
        namedVersions={[]}
        sessionVersions={[]}
        clipboardHistoryEnabled={false}
        clipboardHistory={[]}
        onSetClipboardHistoryEnabled={() => undefined}
        onClearClipboardHistory={() => undefined}
        onInsertClipboardEntry={() => undefined}
        onCreateNamedVersion={() => ({ changed: false } as never)}
        onRestoreNamedVersion={() => ({ changed: false } as never)}
        onDeleteNamedVersion={() => ({ changed: false } as never)}
        onRestoreSessionVersion={() => ({ changed: false } as never)}
      />,
    );
    expect(sidebar).toContain('data-writer-outline-id="h1"');
    expect(sidebar).toContain('data-writer-outline-id="h2"');
    // The heading text is the visible label, and the level is announced, not decorative.
    expect(sidebar).toContain('Kapitel A');
    expect(sidebar).toContain('Kapitel B');
  });

  it('AST-0234 the paragraph surface names itself, is multiline and reports its read-only state', () => {
    const catalog = ensureWriterStyleCatalog(undefined, undefined);
    const paragraphs = [paragraph('p1', 'Text'), paragraph('h1', 'Überschrift', { heading_level: 1, style_name: 'heading1' })];
    const markup = renderToStaticMarkup(
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
        docWordCount={3}
        viewMode="print"
        showRuler={false}
        effectivePageSetup={pageSetup}
        isLight
        paperBg="text-slate-900"
        backgroundColor="#ffffff"
        activeParagraph={paragraphs[0]}
        activeParagraphId="p1"
        paragraphs={paragraphs}
        tables={[]}
        images={[]}
        equations={[]}
        footnotes={[]}
        separatedNotes={recalculateNotes(paragraphs, [])}
        styles={catalog.paragraphStyles}
        styleCatalog={catalog}
        draggedPIdx={null}
        dragOverPIdx={null}
        showNonPrinting={false}
        reviewMode="none"
        reviewerFilter="all"
        revisions={[]}
        documentTitle="Abnahme"
        readOnly
        onParagraphChange={() => 0}
        onTextSelection={() => undefined}
        onSelectParagraph={() => undefined}
        onAddParagraph={() => undefined}
        onDeleteParagraph={() => undefined}
        onDragStart={() => undefined}
        onDragOver={() => undefined}
        onDrop={() => undefined}
        onPaperDrop={() => undefined}
        onUpdateTable={() => undefined}
        onDeleteTable={() => undefined}
        onUpdateImage={() => undefined}
        onDeleteImage={() => undefined}
        onUpdateEquation={() => undefined}
        onDeleteEquation={() => undefined}
        onUpdateHeader={() => undefined}
        onUpdateFooter={() => undefined}
        onEmptyAreaClick={() => undefined}
      />,
    );
    // The accessible name names the paragraph and, for a heading, its level.
    expect(markup).toContain('aria-label="Absatz 1"');
    expect(markup).toContain('aria-label="Überschrift Ebene 1 2"');
    expect(markup).toContain('aria-multiline="true"');
    // A read-only document says so on the surface the screen reader reads.
    expect(markup).toContain('aria-readonly="true"');
    // The page body is still the click target and the paragraphs keep their anchors.
    expect(markup).toContain('data-writer-page-body="true"');
    expect(markup).toContain('data-writer-flow-item="paragraph"');
    expect(markup).toContain('data-writer-paragraph-anchor="p1"');
  });
});
