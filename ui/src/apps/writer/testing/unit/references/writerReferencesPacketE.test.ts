// STATUS: DIAMANT VGT SUPREME — Sovereign Test Suite for Paket E (References, Citations & Science)
import { describe, it, expect } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import type {
  FootnoteItem,
  BookmarkItem,
  TableBlockData,
  ImageBlockData,
  WriterIndexEntry,
  WriterCrossReferenceField,
} from '../../../types';
import type { WriterPaginationPage } from '../../../layout/pagination/writerPagination';
import {
  formatNoteMarker,
  recalculateNotes,
  getPageFootnotes,
} from '../../../references/notes/writerNotesEngine';
import {
  extractTocEntries,
  generateTableOfContentsParagraphs,
  TOC_HEADER_PREFIX,
  TOC_ITEM_PREFIX,
} from '../../../references/toc/writerTocEngine';
import {
  formatInTextCitation,
  generateBibliography,
} from '../../../references/citations/writerCitationCsl';
import {
  extractCrossReferenceTargets,
  resolveCrossReferenceText,
  type CrossReferenceContext,
} from '../../../references/cross-references/writerCrossReferenceEngine';
import {
  generateTableOfFiguresParagraphs,
  generateTableOfTablesParagraphs,
  generateSubjectIndexParagraphs,
} from '../../../references/indexes/writerSpecialIndexesEngine';
import { updateAllDocumentFields } from '../../../references/fields/writerFieldUpdateEngine';

describe('Paket E: References, Citations & Science Suite', () => {
  describe('Footnotes & Endnotes (L113)', () => {
    it('formats numbers correctly across arabic, roman, alpha, and symbol styles', () => {
      expect(formatNoteMarker(1, 'arabic')).toBe('1');
      expect(formatNoteMarker(5, 'arabic')).toBe('5');

      expect(formatNoteMarker(1, 'roman')).toBe('i');
      expect(formatNoteMarker(4, 'roman')).toBe('iv');
      expect(formatNoteMarker(14, 'roman')).toBe('xiv');

      expect(formatNoteMarker(1, 'alpha')).toBe('a');
      expect(formatNoteMarker(26, 'alpha')).toBe('z');
      expect(formatNoteMarker(27, 'alpha')).toBe('aa');

      expect(formatNoteMarker(1, 'symbol')).toBe('*');
      expect(formatNoteMarker(2, 'symbol')).toBe('†');
      expect(formatNoteMarker(3, 'symbol')).toBe('‡');
      expect(formatNoteMarker(4, 'symbol')).toBe('§');
      expect(formatNoteMarker(7, 'symbol')).toBe('**');
    });

    it('recalculates note order and separates page footnotes from document endnotes', () => {
      const paragraphs: Paragraph[] = [
        { id: 'p1', style: { alignment: 'left', line_height: 1.15, space_before: 0, space_after: 4 }, spans: [{ text: 'Para 1' }] },
        { id: 'p2', style: { alignment: 'left', line_height: 1.15, space_before: 0, space_after: 4 }, spans: [{ text: 'Para 2' }] },
      ];

      const rawNotes: FootnoteItem[] = [
        { id: 'n1', number: 99, text: 'First endnote', referenceParagraphId: 'p1', noteType: 'endnote', numberFormat: 'roman' },
        { id: 'n2', number: 88, text: 'First footnote', referenceParagraphId: 'p1', noteType: 'footnote', numberFormat: 'arabic' },
        { id: 'n3', number: 77, text: 'Second footnote', referenceParagraphId: 'p2', noteType: 'footnote', numberFormat: 'arabic' },
      ];

      const recalculated = recalculateNotes(paragraphs, rawNotes);

      expect(recalculated.footnotes).toHaveLength(2);
      expect(recalculated.footnotes[0].note.number).toBe(1);
      expect(recalculated.footnotes[0].displayNumber).toBe('1');
      expect(recalculated.footnotes[1].note.number).toBe(2);
      expect(recalculated.footnotes[1].displayNumber).toBe('2');

      expect(recalculated.endnotes).toHaveLength(1);
      expect(recalculated.endnotes[0].note.number).toBe(1);
      expect(recalculated.endnotes[0].displayNumber).toBe('i');

      const pageFootnotes = getPageFootnotes([paragraphs[0]], recalculated.footnotes);
      expect(pageFootnotes).toHaveLength(1);
      expect(pageFootnotes[0].note.id).toBe('n2');

      const docEndnotes = recalculated.endnotes;
      expect(docEndnotes).toHaveLength(1);
      expect(docEndnotes[0].note.id).toBe('n1');
    });
  });

  describe('Automated Table of Contents (TOC) (L120, L121)', () => {
    it('extracts heading items up to configured maxDepth with page numbers', () => {
      const h1: Paragraph = { id: 'h1', style: { heading_level: 1, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: 'Introduction' }] };
      const p1: Paragraph = { id: 'p1', style: { alignment: 'left', line_height: 1.15, space_before: 0, space_after: 0 }, spans: [{ text: 'Body text' }] };
      const h2: Paragraph = { id: 'h2', style: { heading_level: 2, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: 'Background' }] };
      const h3: Paragraph = { id: 'h3', style: { heading_level: 3, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: 'Deep details' }] };
      const h4: Paragraph = { id: 'h4', style: { heading_level: 4, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: 'Ignored level 4' }] };

      const paragraphs = [h1, p1, h2, h3, h4];

      const pages = [
        { pageIndex: 0, displayPageNumber: 1, paragraphs: [h1, p1] },
        { pageIndex: 1, displayPageNumber: 2, paragraphs: [h2, h3, h4] },
      ] as unknown as WriterPaginationPage[];

      const items = extractTocEntries(paragraphs, pages, { maxLevel: 3 });
      expect(items).toHaveLength(3);
      expect(items[0]).toMatchObject({ title: 'Introduction', level: 1, pageNumber: 1 });
      expect(items[1]).toMatchObject({ title: 'Background', level: 2, pageNumber: 2 });
      expect(items[2]).toMatchObject({ title: 'Deep details', level: 3, pageNumber: 2 });
    });

    it('generates TOC paragraphs with tab leader dots and replaces previous TOC', () => {
      const paragraphs: Paragraph[] = [
        { id: `${TOC_HEADER_PREFIX}-old`, style: { alignment: 'left', line_height: 1, space_before: 0, space_after: 0 }, spans: [{ text: 'Old TOC' }] },
        { id: `${TOC_ITEM_PREFIX}-old`, style: { alignment: 'left', line_height: 1, space_before: 0, space_after: 0 }, spans: [{ text: 'Old Item' }] },
        { id: 'h1', style: { heading_level: 1, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: 'Architecture' }] },
      ];

      const generated = generateTableOfContentsParagraphs(paragraphs, undefined, {
        maxLevel: 3,
        showPageNumbers: true,
        tabLeader: '.',
      });

      const tocItems = generated.filter((p) => p.id.startsWith(TOC_ITEM_PREFIX));
      expect(tocItems).toHaveLength(1);
      const text = tocItems[0].spans.map((s) => s.text).join('');
      expect(text).toContain('Architecture');
      expect(text).toContain('....');
    });
  });

  describe('CSL Citations & Bibliography Engine (L114, L116)', () => {
    const bookSource = {
      id: 'src1',
      type: 'book' as const,
      author: 'Knuth, Donald E.',
      title: 'The Art of Computer Programming',
      year: '1968',
      publisher: 'Addison-Wesley',
    };

    const articleSource = {
      id: 'src2',
      type: 'article' as const,
      author: 'Shannon, Claude E.',
      title: 'A Mathematical Theory of Communication',
      year: '1948',
      journal: 'Bell System Technical Journal',
      doi: '10.1002/j.1538-7305.1948.tb01338.x',
    };

    it('formats in-text citations across APA, MLA, Chicago, IEEE, ISO690, Harvard styles', () => {
      expect(formatInTextCitation({ id: 'c1', sourceId: 'src1' }, bookSource, 'APA')).toBe('(Knuth, 1968)');
      expect(formatInTextCitation({ id: 'c1', sourceId: 'src1', locator: '45' }, bookSource, 'APA')).toBe('(Knuth, 1968, p. 45)');

      expect(formatInTextCitation({ id: 'c1', sourceId: 'src1' }, bookSource, 'MLA')).toBe('(Knuth)');
      expect(formatInTextCitation({ id: 'c1', sourceId: 'src1', locator: '45' }, bookSource, 'MLA')).toBe('(Knuth 45)');

      expect(formatInTextCitation({ id: 'c1', sourceId: 'src1' }, bookSource, 'IEEE', 1)).toBe('[1]');
      expect(formatInTextCitation({ id: 'c1', sourceId: 'src1' }, articleSource, 'Harvard')).toBe('(Shannon, 1948)');
    });

    it('generates formatted alphabetical bibliography entries', () => {
      const bib = generateBibliography([articleSource, bookSource], 'APA');
      expect(bib).toHaveLength(2);
      expect(bib[0].formattedText).toContain('Knuth, Donald E.');
      expect(bib[0].formattedText).toContain('(1968)');
      expect(bib[1].formattedText).toContain('Shannon, Claude E.');
      expect(bib[1].formattedText).toContain('Bell System Technical Journal');
    });
  });

  describe('Cross-References Engine (L118, L119)', () => {
    it('extracts targets and resolves dynamic text for headings, bookmarks, figures, and tables', () => {
      const paragraphs: Paragraph[] = [
        { id: 'h1', style: { heading_level: 1, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 }, spans: [{ text: 'Executive Summary' }] },
        { id: 'p1', style: { alignment: 'left', line_height: 1.15, space_before: 0, space_after: 0 }, spans: [{ text: 'Anchor content' }] },
      ];

      const bookmarks: BookmarkItem[] = [
        { id: 'bm1', name: 'KeyFinding', paragraphId: 'p1', createdAt: Date.now() },
      ];

      const tables: TableBlockData[] = [
        {
          id: 'tbl1',
          rows: [
            { id: 'r1', cells: [{ id: 'c1', content: 'Data' }] },
          ],
          columns: ['Metric', 'Score'],
        },
      ];

      const images: ImageBlockData[] = [
        {
          id: 'img1',
          name: 'Arch Diagram',
          dataUrl: 'data:image/png;base64,abc',
          intrinsicWidth: 100,
          intrinsicHeight: 100,
          widthPercent: 100,
          alignment: 'center',
          caption: 'System Architecture Diagram',
          altText: 'Arch Diagram',
          anchorParagraphId: 'p1',
        },
      ];

      const pages: WriterPaginationPage[] = [
        {
          pageIndex: 0,
          displayPageNumber: 1,
          paragraphs,
          tableFragments: [{
            key: 'tf1',
            tableId: 'tbl1',
            table: tables[0],
            startRowIndex: 0,
            endRowIndex: 0,
            isFirstFragment: true,
            isLastFragment: true,
            repeatHeader: false,
          }],
          id: 'p-0',
          fragments: [],
          usedFlowHeightPx: 100,
          availableFlowHeightPx: 800,
          isFirst: true,
          pageSetup: {} as any,
          sectionId: 'sec-1',
          sectionPageIndex: 0,
        },
      ];

      const ctx: CrossReferenceContext = {
        paragraphs,
        bookmarks,
        footnotes: [],
        tables,
        images,
        pages,
      };

      const targets = extractCrossReferenceTargets(ctx);
      expect(targets.length).toBeGreaterThanOrEqual(4);

      const h1Field: WriterCrossReferenceField = {
        type: 'cross_reference',
        targetType: 'heading',
        targetId: 'h1',
        format: 'full',
        cachedText: '',
      };
      expect(resolveCrossReferenceText(h1Field, ctx)).toContain('Executive Summary');

      const pageField: WriterCrossReferenceField = {
        type: 'cross_reference',
        targetType: 'heading',
        targetId: 'h1',
        format: 'page',
        cachedText: '',
      };
      expect(resolveCrossReferenceText(pageField, ctx)).toBe('Seite 1');

      const bmField: WriterCrossReferenceField = {
        type: 'cross_reference',
        targetType: 'bookmark',
        targetId: 'bm1',
        format: 'text',
        cachedText: '',
      };
      expect(resolveCrossReferenceText(bmField, ctx)).toBe('Textmarke „KeyFinding“');
    });
  });

  describe('Special Indexes & Global F9 Update (L122, L123, L124)', () => {
    it('generates Table of Figures, Table of Tables, and Subject Index', () => {
      const tables: TableBlockData[] = [
        { id: 't1', rows: [], columns: ['Alpha', 'Beta'] },
      ];
      const tofParagraphs = generateTableOfFiguresParagraphs([]);
      expect(tofParagraphs.length).toBeGreaterThanOrEqual(2);
      expect(tofParagraphs[0].spans[0].text).toBe('Abbildungsverzeichnis');

      const totParagraphs = generateTableOfTablesParagraphs(tables);
      expect(totParagraphs.length).toBeGreaterThanOrEqual(2);
      expect(totParagraphs[0].spans[0].text).toBe('Tabellenverzeichnis');

      const indexEntries: WriterIndexEntry[] = [
        { id: 'i1', term: 'Kryptographie', pageNumbers: [1, 4] },
        { id: 'i2', term: 'Algorithmen', pageNumbers: [2, 5], subEntries: [{ id: 's1', subTerm: 'Sortierung', pageNumbers: [3] }] },
      ];
      const indexParagraphs = generateSubjectIndexParagraphs(indexEntries);
      expect(indexParagraphs.length).toBeGreaterThanOrEqual(3);
      expect(indexParagraphs[0].spans[0].text).toBe('Stichwortverzeichnis');
    });

    it('F9 Engine orchestrates global update of TOC, indexes, and footnotes', () => {
      const paragraphs: Paragraph[] = [
        { id: `${TOC_HEADER_PREFIX}-1`, style: { alignment: 'left', line_height: 1, space_before: 0, space_after: 0 }, spans: [{ text: 'Inhaltsverzeichnis' }] },
        { id: `${TOC_ITEM_PREFIX}-1`, style: { alignment: 'left', line_height: 1, space_before: 0, space_after: 0 }, spans: [{ text: 'Old Entry' }] },
        { id: 'p1', style: { heading_level: 1, alignment: 'left', line_height: 1, space_before: 0, space_after: 0 }, spans: [{ text: 'Chapter 1' }] },
      ];

      const footnotes: FootnoteItem[] = [
        { id: 'fn1', number: 99, text: 'Note 1', referenceParagraphId: 'p1' },
      ];

      const updateResult = updateAllDocumentFields({
        paragraphs,
        footnotes,
        bookmarks: [],
        tables: [],
        images: [],
      });

      expect(updateResult.summary.totalUpdated).toBeGreaterThan(0);
      expect(updateResult.summary.tocsUpdated).toBe(1);
      expect(updateResult.updatedFootnotes[0].number).toBe(1);
    });
  });
});
