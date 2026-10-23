// STATUS: PLATIN — Writer PDF alignment behavior tests
import { describe, expect, it } from 'vitest';
import type {
  Paragraph,
  WriterPageSetupConfig,
  WriterSectionDefinition,
} from '../../../../../../shared/contracts/workspace';
import { buildWriterPdf, writerPageGeometry } from '../../../../interchange/export/pdf/writerPdfExport';

const pageSetup: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
};

function paragraph(alignment: Paragraph['style']['alignment'], text: string): Paragraph {
  return {
    id: `paragraph-${alignment}`,
    style: { alignment, line_height: 1.5, space_before: 0, space_after: 8 },
    spans: [{ text, font_size_pt: 11 }],
  };
}

describe('Writer PDF alignment', () => {
  it('emits positive word spacing for distributed multi-word lines', () => {
    const pdf = new TextDecoder().decode(buildWriterPdf(
      'Distributed',
      [paragraph('distributed', 'Alpha Beta Gamma')],
      pageSetup,
    ));
    const spacing = /([0-9]+\.[0-9]+) Tw/.exec(pdf);
    expect(Number(spacing?.[1])).toBeGreaterThan(0);
  });

  it('keeps the final line of ordinary justification undistributed', () => {
    const pdf = new TextDecoder().decode(buildWriterPdf(
      'Justified',
      [paragraph('justify', 'Alpha Beta Gamma')],
      pageSetup,
    ));
    expect(pdf).toContain('0.000 Tw');
    expect(pdf).toContain('0.000 Tc');
  });

  it('applies left and first-line indentation to PDF placement', () => {
    const indented = paragraph('left', 'Indented text');
    indented.style.left_indent_mm = 10;
    indented.style.first_line_indent_mm = 5;
    const pdf = new TextDecoder().decode(buildWriterPdf('Indented', [indented], pageSetup));
    const placement = /1 0 0 1 ([0-9.]+) [0-9.]+ Tm\n\(Indented text\) Tj/.exec(pdf);
    expect(Number(placement?.[1])).toBeGreaterThan(90);
  });

  it('creates a physical PDF page for page-break-before', () => {
    const first = paragraph('left', 'First page');
    const second = paragraph('left', 'Second page');
    second.id = 'paragraph-second';
    second.style.page_break_before = true;
    const pdf = new TextDecoder().decode(buildWriterPdf('Break', [first, second], pageSetup));
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(2);
  });

  it('renders independent first, even, and default header/footer variants', () => {
    const first = paragraph('left', 'First page body');
    first.id = 'first-page';
    const second = paragraph('left', 'Second page body');
    second.id = 'second-page';
    second.style.page_break_before = true;
    const third = paragraph('left', 'Third page body');
    third.id = 'third-page';
    third.style.page_break_before = true;
    const variantSetup: WriterPageSetupConfig = {
      ...pageSetup,
      headerText: 'ODD HEADER',
      footerText: 'ODD FOOTER',
      firstPageDifferent: true,
      firstPageHeaderText: 'FIRST HEADER',
      firstPageFooterText: 'FIRST FOOTER',
      oddEvenDifferent: true,
      evenPageHeaderText: 'EVEN HEADER',
      evenPageFooterText: 'EVEN FOOTER',
    };
    const pdf = new TextDecoder().decode(
      buildWriterPdf('Variants', [first, second, third], variantSetup),
    );

    for (const text of ['FIRST HEADER', 'FIRST FOOTER', 'EVEN HEADER', 'EVEN FOOTER', 'ODD HEADER', 'ODD FOOTER']) {
      expect(pdf).toContain(`(${text}) Tj`);
    }
  });

  it('renders manual line breaks as separate PDF text lines', () => {
    const source = paragraph('left', 'First line\nSecond line');
    const pdf = new TextDecoder().decode(buildWriterPdf('Line break', [source], pageSetup));
    const firstY = Number(/1 0 0 1 [0-9.]+ ([0-9.]+) Tm\n\(First line\) Tj/u.exec(pdf)?.[1]);
    const secondY = Number(/1 0 0 1 [0-9.]+ ([0-9.]+) Tm\n\(Second line\) Tj/u.exec(pdf)?.[1]);

    expect(firstY).toBeGreaterThan(secondY);
  });

  it('uses section-specific PDF media boxes and page boundaries', () => {
    const first = paragraph('left', 'Portrait');
    first.id = 'first';
    const second = paragraph('left', 'Landscape');
    second.id = 'second';
    const landscape = { ...pageSetup, orientation: 'landscape' as const };
    const sections: WriterSectionDefinition[] = [{
      id: 'landscape-section',
      startParagraphId: second.id,
      pageSetup: landscape,
      breakType: 'next-page',
    }];
    const pdf = new TextDecoder().decode(
      buildWriterPdf('Sections', [first, second], pageSetup, [], [], undefined, sections),
    );
    const portraitGeometry = writerPageGeometry(pageSetup);
    const landscapeGeometry = writerPageGeometry(landscape);

    expect(pdf.match(/\/Type \/Page\b/gu)).toHaveLength(2);
    expect(pdf).toContain(
      `/MediaBox [0 0 ${portraitGeometry.width.toFixed(2)} ${portraitGeometry.height.toFixed(2)}]`,
    );
    expect(pdf).toContain(
      `/MediaBox [0 0 ${landscapeGeometry.width.toFixed(2)} ${landscapeGeometry.height.toFixed(2)}]`,
    );
  });

  it('resolves linked section headers and independent section footers in PDF', () => {
    const first = paragraph('left', 'Root section');
    first.id = 'linked-first';
    const second = paragraph('left', 'Linked section');
    second.id = 'linked-second';
    const rootSetup = { ...pageSetup, headerText: 'ROOT HEADER', footerText: 'ROOT FOOTER' };
    const pdf = new TextDecoder().decode(buildWriterPdf(
      'Section links',
      [first, second],
      rootSetup,
      [],
      [],
      undefined,
      [{
        id: 'linked-section',
        startParagraphId: second.id,
        pageSetup: {
          ...rootSetup,
          headerText: 'STALE HEADER',
          footerText: 'SECTION FOOTER',
          linkToPreviousHeader: true,
          linkToPreviousFooter: false,
        },
        breakType: 'next-page',
      }],
    ));

    expect(pdf.match(/\(ROOT HEADER\) Tj/gu)).toHaveLength(2);
    expect(pdf).not.toContain('(STALE HEADER) Tj');
    expect(pdf).toContain('(ROOT FOOTER) Tj');
    expect(pdf).toContain('(SECTION FOOTER) Tj');
  });

  it('renders formatted logical page numbers at the configured header position and honors section restarts', () => {
    const first = paragraph('left', 'First');
    first.id = 'number-first';
    const second = paragraph('left', 'Second');
    second.id = 'number-second';
    const numberedSetup: WriterPageSetupConfig = {
      ...pageSetup,
      showPageNumbers: true,
      pageNumberStart: 4,
      pageNumberFormat: 'roman-lower',
      pageNumberPosition: 'header-center',
      chapterNumbering: true,
    };
    const pdf = new TextDecoder().decode(buildWriterPdf(
      'Numbering',
      [first, second],
      numberedSetup,
      [],
      [],
      undefined,
      [{
        id: 'number-section',
        startParagraphId: second.id,
        breakType: 'next-page',
        restartPageNumberAt: 2,
        pageSetup: { ...numberedSetup, pageNumberFormat: 'alpha-upper' },
      }],
    ));

    expect(pdf).toContain('(Kapitel 1-iv) Tj');
    expect(pdf).toContain('(Kapitel 2-B) Tj');
    expect(pdf).not.toContain(' of 2');
  });

  it('keeps compatible continuous sections on one PDF page and honors odd-page parity', () => {
    const first = paragraph('left', 'First section');
    first.id = 'first';
    const second = paragraph('left', 'Continuous section');
    second.id = 'second';
    const continuousSections: WriterSectionDefinition[] = [{
      id: 'continuous',
      startParagraphId: second.id,
      pageSetup: { ...pageSetup, columns: 2, columnGapMm: 8 },
      breakType: 'continuous',
    }];
    const continuousPdf = new TextDecoder().decode(
      buildWriterPdf('Continuous', [first, second], pageSetup, [], [], undefined, continuousSections),
    );
    const oddPdf = new TextDecoder().decode(
      buildWriterPdf('Odd', [first, second], pageSetup, [], [], undefined, [{
        ...continuousSections[0],
        id: 'odd',
        breakType: 'odd-page',
        pageSetup,
      }]),
    );

    expect(continuousPdf.match(/\/Type \/Page\b/gu)).toHaveLength(1);
    expect(oddPdf.match(/\/Type \/Page\b/gu)).toHaveLength(3);
  });

  it('renders paragraph shading and typed borders into the PDF graphics stream', () => {
    const decorated = paragraph('left', 'Framed paragraph');
    decorated.style.borders = {
      top: { style: 'double', widthPt: 1.5, color: '#ff0000', spacingPt: 3 },
      left: { style: 'dashed', widthPt: 1, color: '#ff0000', spacingPt: 3 },
    };
    decorated.style.shading = { fillColor: '#00ff00', opacityPercent: 100 };
    const pdf = new TextDecoder().decode(buildWriterPdf('Decoration', [decorated], pageSetup));
    expect(pdf).toContain('0.000 1.000 0.000 rg');
    expect(pdf).toContain('1.000 0.000 0.000 RG');
    expect(pdf).toMatch(/ m [0-9.]+ [0-9.]+ l S/);
  });

  it('renders custom page backgrounds, borders and rotated watermarks into PDF', () => {
    const decoratedSetup: WriterPageSetupConfig = {
      ...pageSetup,
      backgroundColor: '#123456',
      pageBorders: { style: 'double', widthPt: 2, color: '#FF0000', paddingMm: 4 },
      watermark: { enabled: true, text: 'CONFIDENTIAL', opacity: 0.1, rotationDeg: -45, color: '#FFFFFF' },
    };
    const pdf = new TextDecoder().decode(
      buildWriterPdf('Page decorations', [paragraph('left', 'Decorated')], decoratedSetup),
    );

    expect(pdf).toContain('0.07058823529411765 0.20392156862745098 0.33725490196078434 rg 0 0');
    expect(pdf).toContain('(CONFIDENTIAL) Tj');
    expect(pdf).toContain('1.000 0.000 0.000 RG');
    expect(pdf.match(/ re S/gu)?.length).toBeGreaterThanOrEqual(2);
  });

  it('promotes a continuous section with different decorations to a new physical page', () => {
    const first = paragraph('left', 'First');
    first.id = 'first-decoration';
    const second = paragraph('left', 'Second');
    second.id = 'second-decoration';
    const pdf = new TextDecoder().decode(buildWriterPdf(
      'Section backgrounds',
      [first, second],
      { ...pageSetup, backgroundColor: '#FFFFFF' },
      [],
      [],
      undefined,
      [{
        id: 'decorated-section',
        startParagraphId: second.id,
        pageSetup: { ...pageSetup, backgroundColor: '#000000' },
        breakType: 'continuous',
      }],
    ));

    expect(pdf.match(/\/Type \/Page\b/gu)).toHaveLength(2);
    expect(pdf).toContain('1 1 1 rg 0 0');
    expect(pdf).toContain('0 0 0 rg 0 0');
  });

  it('fails closed before exporting a hostile persisted decoration value', () => {
    expect(() => buildWriterPdf(
      'Rejected decoration',
      [paragraph('left', 'Rejected')],
      { ...pageSetup, backgroundColor: 'url(javascript:payload)' },
    )).toThrow(/Invalid Writer page decoration/);
  });

  it('places decimal-tabbed PDF runs on one shared decimal axis and emits leaders', () => {
    const first = paragraph('left', 'Revenue\t1,5');
    const second = paragraph('left', 'Cost\t123,5');
    second.id = 'paragraph-tab-second';
    for (const item of [first, second]) {
      item.style.tab_stops = [{
        id: 'decimal-stop', positionMm: 70, alignment: 'decimal', leader: 'dots', decimalCharacter: ',',
      }];
    }
    const pdf = new TextDecoder().decode(buildWriterPdf('Tabs', [first, second], pageSetup));
    const firstPlacement = /1 0 0 1 ([0-9.]+) [0-9.]+ Tm\n\(1,5\) Tj/.exec(pdf);
    const secondPlacement = /1 0 0 1 ([0-9.]+) [0-9.]+ Tm\n\(123,5\) Tj/.exec(pdf);
    const characterWidth = 11 * 0.52;
    const firstAxis = Number(firstPlacement?.[1]) + characterWidth;
    const secondAxis = Number(secondPlacement?.[1]) + characterWidth * 3;
    expect(firstAxis).toBeCloseTo(secondAxis, 1);
    expect(pdf).toMatch(/\(\.{2,}\) Tj/);
  });

  it('renders theme heading shadows before the primary colored text', () => {
    const heading = paragraph('left', 'Themed heading');
    heading.style.style_name = 'heading1';
    heading.style.heading_level = 1;
    const pdf = new TextDecoder().decode(buildWriterPdf('Theme', [heading], pageSetup, [], [], [{
      name: 'heading1',
      label: 'Heading 1',
      fontSizePt: 20,
      bold: true,
      lineHeight: 1.25,
      spaceBefore: 14,
      spaceAfter: 8,
      textColor: '#991b1b',
      textEffect: 'strong-shadow',
    }]));
    expect(pdf).toContain('0.12 0.15 0.20 rg');
    expect(pdf.match(/\(Themed heading\) Tj/g)).toHaveLength(2);
    expect(pdf).toContain('0.6 0.10588235294117647 0.10588235294117647 rg');
  });

});
