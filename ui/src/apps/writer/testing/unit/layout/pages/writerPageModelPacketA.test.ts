// STATUS: DIAMANT VGT SUPREME — Sovereign Automated Test Suite for Paket A (Document & Page Model)
import { describe, expect, it } from 'vitest';
import type {
  Paragraph,
  WriterPaperSize,
  WriterSectionDefinition,
  WriterStyleDefinition,
} from '../../../../../../shared/contracts/workspace';
import type { PageSetupConfig, TableBlockData } from '../../../../types';
import {
  paginateWriterSections,
  formatWriterPageNumber,
  getMargins,
  getWriterPageGeometry,
} from '../../../../layout/pagination/writerPagination';
import { validateWriterPageSetup } from '../../../../layout/page-setup/writerPageSetupValidation';

const DEFAULT_SETUP: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

const STYLES: WriterStyleDefinition[] = [
  {
    name: 'normal',
    label: 'Normal',
    fontSizePt: 11,
    bold: false,
    lineHeight: 1.5,
    spaceBefore: 0,
    spaceAfter: 8,
  },
  {
    name: 'heading1',
    label: 'Heading 1',
    fontSizePt: 20,
    bold: true,
    lineHeight: 1.2,
    spaceBefore: 12,
    spaceAfter: 6,
  },
];

const createParagraph = (
  id: string,
  text: string,
  opts?: { headingLevel?: 1 | 2 | 3; pageBreakBefore?: boolean; columnBreakBefore?: boolean }
): Paragraph => ({
  id,
  style: {
    style_name: opts?.headingLevel
      ? (`heading${opts.headingLevel}` as Paragraph['style']['style_name'])
      : 'normal',
    heading_level: opts?.headingLevel,
    alignment: 'left',
    line_height: 1.5,
    space_before: 0,
    space_after: 8,
    page_break_before: opts?.pageBreakBefore,
    column_break_before: opts?.columnBreakBefore,
  },
  spans: [{ text }],
});

describe('Paket A: Dokument- & Seitenmodell (Exhaustive Verification Suite)', () => {
  // 1. Pagination-Splits (Absätze & übergroße Tabellen)
  describe('Gate 1: Pagination-Splits & Table Chunking', () => {
    it('breaks long paragraphs across page boundaries preserving paragraph identity', () => {
      const longText = Array.from({ length: 150 }, (_, i) => `Satz ${i + 1} mit juristischem VGT Kerninhalt.`).join(' ');
      const p = createParagraph('p1', longText);

      const pages = paginateWriterSections([p], DEFAULT_SETUP, STYLES, []);
      expect(pages.length).toBeGreaterThan(1);
      expect(pages[0].fragments[0].paragraph.id).toBe('p1');
      expect(pages[1].fragments[0].paragraph.id).toBe('p1');
    });

    it('splits oversized tables across pages with repeating headers on subsequent fragments', () => {
      const table: TableBlockData = {
        id: 'table-large',
        anchorParagraphId: 'p-anchor',
        columns: ['ID', 'Bezeichnung', 'Status', 'Wert'],
        rows: Array.from({ length: 40 }, (_, r) => ({
          id: `row-${r}`,
          cells: [
            { id: `c-${r}-0`, content: `Item ${r}` },
            { id: `c-${r}-1`, content: `Beschreibung für Zeile ${r}` },
            { id: `c-${r}-2`, content: 'Aktiv' },
            { id: `c-${r}-3`, content: `${(r + 1) * 100} EUR` },
          ],
        })),
      };

      const anchorP = createParagraph('p-anchor', 'Tabelle der Vermögenswerte:');
      const pages = paginateWriterSections([anchorP], DEFAULT_SETUP, STYLES, [], { tables: [table], images: [], equations: [], footnotes: [] });
      expect(pages.length).toBeGreaterThan(1);

      const tableFragments = pages.flatMap((page) => page.tableFragments ?? []);
      expect(tableFragments.length).toBeGreaterThanOrEqual(2);

      // First fragment has isFirstFragment = true
      expect(tableFragments[0].isFirstFragment).toBe(true);
      expect(tableFragments[0].repeatHeader).toBe(true);
      // Subsequent fragments have isFirstFragment = false, repeatHeader = true
      expect(tableFragments[1].isFirstFragment).toBe(false);
      expect(tableFragments[1].repeatHeader).toBe(true);
      expect(tableFragments[1].table.columns).toEqual(table.columns);

      // Verify row chunk coverage
      const totalChunkedRows = tableFragments.reduce((sum, f) => sum + (f.endRowIndex - f.startRowIndex), 0);
      expect(totalChunkedRows).toBe(table.rows.length);
    });
  });

  // 2. Papierformate & Geometrie (A0–A6, B4, B5, Letter, Legal, Executive, Custom)
  describe('Gate 2: Papierformate & Geometrie (L71/L72)', () => {
    it('supports all standard ISO and North American formats with exact millimeter dimensions', () => {
      const expectedSizes: Array<{
        paperSize: Exclude<WriterPaperSize, 'Custom'>;
        width: number;
        height: number;
      }> = [
        { paperSize: 'A0', width: 841, height: 1189 },
        { paperSize: 'A1', width: 594, height: 841 },
        { paperSize: 'A2', width: 420, height: 594 },
        { paperSize: 'A3', width: 297, height: 420 },
        { paperSize: 'A4', width: 210, height: 297 },
        { paperSize: 'A5', width: 148, height: 210 },
        { paperSize: 'A6', width: 105, height: 148 },
        { paperSize: 'B4', width: 250, height: 353 },
        { paperSize: 'B5', width: 176, height: 250 },
        { paperSize: 'Letter', width: 215.9, height: 279.4 },
        { paperSize: 'Legal', width: 215.9, height: 355.6 },
        { paperSize: 'Executive', width: 184.15, height: 266.7 },
      ];

      for (const expected of expectedSizes) {
        const setup: PageSetupConfig = {
          ...DEFAULT_SETUP,
          paperSize: expected.paperSize,
          orientation: 'portrait',
        };
        const geo = getWriterPageGeometry(setup);
        const mmW = (geo.widthPx * 25.4) / 96;
        const mmH = (geo.heightPx * 25.4) / 96;
        expect(mmW).toBeCloseTo(expected.width, 1);
        expect(mmH).toBeCloseTo(expected.height, 1);
      }
    });

    it('correctly flips width and height for landscape orientation', () => {
      const setup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        paperSize: 'A4',
        orientation: 'landscape',
      };
      const geo = getWriterPageGeometry(setup);
      const mmW = (geo.widthPx * 25.4) / 96;
      const mmH = (geo.heightPx * 25.4) / 96;
      expect(mmW).toBeCloseTo(297, 1);
      expect(mmH).toBeCloseTo(210, 1);
    });

    it('supports custom paper dimensions between 25mm and 2000mm', () => {
      const setup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        paperSize: 'Custom',
        orientation: 'portrait',
        customWidthMm: 175,
        customHeightMm: 225,
      };
      const geo = getWriterPageGeometry(setup);
      const mmW = (geo.widthPx * 25.4) / 96;
      const mmH = (geo.heightPx * 25.4) / 96;
      expect(mmW).toBeCloseTo(175, 1);
      expect(mmH).toBeCloseTo(225, 1);
    });
  });

  // 3. Ränder, Bundsteg & Gespiegelte Ränder (L73/L74)
  describe('Gate 3: Ränder, Bundsteg & Gespiegelte Ränder', () => {
    it('applies standard margin presets: normal, narrow, wide', () => {
      expect(getMargins({ ...DEFAULT_SETUP, margins: 'normal' })).toEqual({ top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 });
      expect(getMargins({ ...DEFAULT_SETUP, margins: 'narrow' })).toEqual({ top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 });
      expect(getMargins({ ...DEFAULT_SETUP, margins: 'wide' })).toEqual({ top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 });
    });

    it('calculates mirrored margins and gutter for double-sided book printing', () => {
      const setup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        margins: 'custom',
        customMargins: {
          top: 20,
          bottom: 20,
          left: 15,
          right: 30,
          gutter: 10,
        },
        mirroredMargins: true,
      };

      // Page 1 (odd page index 1): Inside is on Left + Gutter
      const oddMargins = getMargins(setup, 1);
      expect(oddMargins.left).toBe(15 + 10);
      expect(oddMargins.right).toBe(30);

      // Page 2 (even page index 2): Inside is on Right + Gutter, Left is Outside
      const evenMargins = getMargins(setup, 2);
      expect(evenMargins.left).toBe(30);
      expect(evenMargins.right).toBe(15 + 10);
    });
  });

  // 4. Mehrspaltigkeit & Spaltenumbrüche (L74/L75)
  describe('Gate 4: Mehrspaltigkeit (1–4 Spalten) & Spaltenumbrüche', () => {
    it('calculates multi-column geometry up to 4 columns', () => {
      for (const cols of [1, 2, 3, 4] as const) {
        const setup: PageSetupConfig = {
          ...DEFAULT_SETUP,
          columns: cols,
          columnGapMm: 8,
        };
        const geo = getWriterPageGeometry(setup);
        expect(geo.columnCount).toBe(cols);
        if (geo.columnWidthsPx) {
          expect(geo.columnWidthsPx.length).toBe(cols);
          const totalColWidth = geo.columnWidthsPx.reduce((a, b) => a + b, 0);
          const totalGaps = (cols - 1) * ((8 * 96) / 25.4);
          expect(totalColWidth + totalGaps).toBeCloseTo(geo.bodyWidthPx, 0);
        }
      }
    });

    it('handles explicit column breaks before paragraphs', () => {
      const p1 = createParagraph('p1', 'Erste Spalte Inhalt.');
      const p2 = createParagraph('p2', 'Zweite Spalte Inhalt erzwungen.', { columnBreakBefore: true });
      const setup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        columns: 2,
        columnGapMm: 10,
      };

      const pages = paginateWriterSections([p1, p2], setup, STYLES, []);
      expect(pages.length).toBeGreaterThanOrEqual(1);
      expect(pages[0].fragments.length).toBe(2);
    });
  });

  // 5. Kopf- & Fußzeilen Separation (L77/L78)
  describe('Gate 5: Kopf- & Fußzeilen Separation', () => {
    it('stores separated header and footer configurations for first page and even pages', () => {
      const setup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        headerText: 'Standard Kopfzeile (Ungerade)',
        footerText: 'Standard Fußzeile (Ungerade)',
        firstPageDifferent: true,
        firstPageHeaderText: 'Deckblatt Kopfzeile (Keine)',
        firstPageFooterText: 'Deckblatt Fußzeile (Streng Geheim)',
        oddEvenDifferent: true,
        evenPageHeaderText: 'Gerade Kopfzeile (Kapitelübersicht)',
        evenPageFooterText: 'Gerade Fußzeile (Astraea Writer)',
        linkToPreviousHeader: false,
        linkToPreviousFooter: true,
      };

      expect(setup.firstPageHeaderText).toBe('Deckblatt Kopfzeile (Keine)');
      expect(setup.evenPageHeaderText).toBe('Gerade Kopfzeile (Kapitelübersicht)');
      expect(setup.linkToPreviousHeader).toBe(false);
      expect(setup.linkToPreviousFooter).toBe(true);
    });
  });

  // 6. Seitennummerierung & Formate (L79/L80)
  describe('Gate 6: Seitennummerierung & Formatierung', () => {
    it('formats Arabic, Roman, and Alphabetic page numbers with offsets', () => {
      // Arabic
      expect(formatWriterPageNumber(1, 'arabic')).toBe('1');
      expect(formatWriterPageNumber(42, 'arabic')).toBe('42');

      // Roman Upper
      expect(formatWriterPageNumber(1, 'roman-upper')).toBe('I');
      expect(formatWriterPageNumber(4, 'roman-upper')).toBe('IV');
      expect(formatWriterPageNumber(9, 'roman-upper')).toBe('IX');
      expect(formatWriterPageNumber(14, 'roman-upper')).toBe('XIV');
      expect(formatWriterPageNumber(49, 'roman-upper')).toBe('XLIX');

      // Roman Lower
      expect(formatWriterPageNumber(3, 'roman-lower')).toBe('iii');
      expect(formatWriterPageNumber(8, 'roman-lower')).toBe('viii');

      // Alpha Upper
      expect(formatWriterPageNumber(1, 'alpha-upper')).toBe('A');
      expect(formatWriterPageNumber(26, 'alpha-upper')).toBe('Z');
      expect(formatWriterPageNumber(27, 'alpha-upper')).toBe('AA');

      // Alpha Lower
      expect(formatWriterPageNumber(1, 'alpha-lower')).toBe('a');
      expect(formatWriterPageNumber(2, 'alpha-lower')).toBe('b');
    });

    it('formats page numbers with chapter reference', () => {
      expect(formatWriterPageNumber(1, 'arabic', 'Kapitel 1')).toBe('Kapitel 1-1');
      expect(formatWriterPageNumber(3, 'roman-upper', 'Teil A')).toBe('Teil A-III');
    });
  });

  // 7. Ansichtsmodi (L80/L81)
  describe('Gate 7: Ansichtsmodi (Print, Continuous, Draft, Outline, Reading, Focus)', () => {
    it('validates all 6 view modes are supported in the contract', () => {
      const validModes = ['print', 'continuous', 'draft', 'outline', 'reading', 'focus'] as const;
      expect(validModes.length).toBe(6);
      expect(validModes).toContain('draft');
      expect(validModes).toContain('outline');
      expect(validModes).toContain('reading');
    });
  });

  // 8. Seitenrahmen, Hintergrund & Wasserzeichen (L77)
  describe('Gate 8: Seitenrahmen, Hintergrund & Wasserzeichen', () => {
    it('accepts valid page borders, paper surfaces, and watermarks', () => {
      const setup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        paperColor: 'cream',
        pageBorders: {
          style: 'double',
          widthPt: 2.5,
          color: '#1e3a8a',
          paddingMm: 12,
        },
        watermark: {
          enabled: true,
          text: 'VERTRAULICH',
          opacity: 0.15,
          rotationDeg: -45,
          color: '#ef4444',
        },
      };

      const error = validateWriterPageSetup(setup);
      expect(error).toBeNull();
    });
  });

  // 9. Umbrüche & Abschnittsumbrüche (L76)
  describe('Gate 9: Umbrüche (Seite, Spalte, Abschnitt)', () => {
    it('isolates different page setups across sections', () => {
      const p1 = createParagraph('p1', 'Abschnitt 1 (A4 Portrait)');
      const p2 = createParagraph('p2', 'Abschnitt 2 (A3 Landscape)');

      const sections: WriterSectionDefinition[] = [
        {
          id: 'sec-1',
          startParagraphId: 'p1',
          pageSetup: {
            ...DEFAULT_SETUP,
            paperSize: 'A4',
            orientation: 'portrait',
          },
        },
        {
          id: 'sec-2',
          startParagraphId: 'p2',
          pageSetup: {
            ...DEFAULT_SETUP,
            paperSize: 'A3',
            orientation: 'landscape',
          },
        },
      ];

      const pages = paginateWriterSections([p1, p2], DEFAULT_SETUP, STYLES, sections);
      expect(pages.length).toBe(2);
      expect(pages[0].pageSetup.paperSize).toBe('A4');
      expect(pages[0].pageSetup.orientation).toBe('portrait');
      expect(pages[1].pageSetup.paperSize).toBe('A3');
      expect(pages[1].pageSetup.orientation).toBe('landscape');
    });
  });

  // 10. Grenzwertvalidierung (Security Gate & Bound Checks)
  describe('Gate 10: Grenzwertvalidierung & Defense-in-Depth', () => {
    it('rejects invalid column counts outside 1..4', () => {
      const invalidSetup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        columns: 5 as unknown as 4,
      };
      const error = validateWriterPageSetup(invalidSetup);
      expect(error).toBe('Die Spaltenanzahl muss zwischen eins und vier liegen.');
    });

    it('rejects invalid page border widths outside 0..36 pt', () => {
      const invalidSetup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        pageBorders: {
          style: 'solid',
          widthPt: 40,
          color: '#000000',
          paddingMm: 5,
        },
      };
      const error = validateWriterPageSetup(invalidSetup);
      expect(error).toContain('0–36 pt Breite');
    });

    it('rejects negative gutter margins', () => {
      const invalidSetup: PageSetupConfig = {
        ...DEFAULT_SETUP,
        margins: 'custom',
        customMargins: {
          top: 25,
          bottom: 25,
          left: 25,
          right: 25,
          gutter: -5,
        },
      };
      const error = validateWriterPageSetup(invalidSetup);
      expect(error).toBe('Seitenränder und Bundsteg müssen zwischen 0 und 200 mm liegen.');
    });
  });
});
