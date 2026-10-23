// STATUS: DIAMANT VGT SUPREME — Sovereign References & Field Update State Hook
import { useCallback } from 'react';
import type {
  Paragraph,
  WriterFootnoteType,
  WriterNoteNumberFormat,
  WriterIndexEntry,
  WriterSectionDefinition,
  WriterStyleCatalog,
  WriterStyleDefinition,
} from '../../../shared/contracts/workspace';
import type {
  BookmarkItem,
  EquationBlockData,
  FootnoteItem,
  ImageBlockData,
  PageSetupConfig,
  TableBlockData,
  WriterDocumentData,
} from '../types';
import {
  updateAllDocumentFields,
  type FieldUpdateSummary,
} from './fields/writerFieldUpdateEngine';
import {
  generateTableOfTablesParagraphs,
  generateSubjectIndexParagraphs,
} from './indexes/writerSpecialIndexesEngine';

export interface UseWriterReferenceStateProps {
  paragraphs: Paragraph[];
  footnotes: FootnoteItem[];
  bookmarks: BookmarkItem[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  equations: EquationBlockData[];
  styles: WriterStyleDefinition[];
  styleCatalog: WriterStyleCatalog;
  pageSetup: PageSetupConfig;
  sections: WriterSectionDefinition[];
  indexEntries?: WriterIndexEntry[];
  activeParagraphId: string | null;
  activeParagraphIndex: number;
  /**
   * Caret offset inside the active paragraph. A note records it so notes can be
   * numbered in **text order** rather than insertion order.
   */
  activeTextOffset?: number;
  persistParagraphs: (
    newParagraphs: Paragraph[],
    writerPatch?: Partial<WriterDocumentData>
  ) => void;
  persistWriterData: (patch: Partial<WriterDocumentData>) => void;
  handleInsertTextAtSelection: (text: string) => void;
}

export function useWriterReferenceState({
  paragraphs,
  footnotes,
  bookmarks,
  tables,
  images,
  equations: _equations,
  styles: _styles,
  styleCatalog: _styleCatalog,
  pageSetup: _pageSetup,
  sections: _sections,
  indexEntries = [],
  activeParagraphId,
  activeParagraphIndex,
  activeTextOffset,
  persistParagraphs,
  persistWriterData,
  handleInsertTextAtSelection,
}: UseWriterReferenceStateProps) {
  // Global F9 Field Update (Paket E L124)
  const handleUpdateAllFields = useCallback((): FieldUpdateSummary => {
    const result = updateAllDocumentFields({
      paragraphs,
      footnotes,
      bookmarks,
      tables,
      images,
      indexEntries,
    });

    if (result.summary.totalUpdated > 0) {
      persistParagraphs(result.updatedParagraphs, {
        footnotes: result.updatedFootnotes,
      });
    }
    return result.summary;
  }, [
    paragraphs,
    footnotes,
    bookmarks,
    tables,
    images,
    indexEntries,
    persistParagraphs,
  ]);

  // Insert TOC Paragraphs (Paket E L120, L121)
  const handleInsertTocParagraphs = useCallback(
    (updatedParagraphs: Paragraph[]) => {
      persistParagraphs(updatedParagraphs);
    },
    [persistParagraphs]
  );

  // Insert Special Index Paragraphs (TOT, Index) (Paket E L122, L123)
  const handleInsertSpecialIndexParagraphs = useCallback(
    (newParagraphs: Paragraph[]) => {
      const insertIdx = activeParagraphIndex >= 0 ? activeParagraphIndex : paragraphs.length - 1;
      const next = [...paragraphs];
      next.splice(insertIdx + 1, 0, ...newParagraphs);
      persistParagraphs(next);
    },
    [activeParagraphIndex, paragraphs, persistParagraphs]
  );

  // Update Index Entries (Paket E L123)
  const handleUpdateIndexEntries = useCallback(
    (updatedEntries: WriterIndexEntry[]) => {
      persistWriterData({ indexEntries: updatedEntries });
    },
    [persistWriterData]
  );

  // Table of Tables (TOT) insertion
  const handleInsertTableOfTables = useCallback(() => {
    const totParagraphs = generateTableOfTablesParagraphs(tables);
    handleInsertSpecialIndexParagraphs(totParagraphs);
  }, [tables, handleInsertSpecialIndexParagraphs]);

  // Subject Index (Stichwortindex) insertion
  const handleInsertSubjectIndex = useCallback(
    (entries: readonly WriterIndexEntry[]) => {
      const indexParagraphs = generateSubjectIndexParagraphs(entries);
      handleInsertSpecialIndexParagraphs(indexParagraphs);
    },
    [handleInsertSpecialIndexParagraphs]
  );

  // Footnote & Endnote insertion (Paket E L113)
  const handleAddFootnote = useCallback(
    (
      text: string,
      options?: {
        noteType?: WriterFootnoteType;
        numberFormat?: WriterNoteNumberFormat;
        customMark?: string;
      }
    ) => {
      const pId = activeParagraphId ?? paragraphs[0]?.id ?? 'p-default';
      const isEndnote = options?.noteType === 'endnote';
      const existingMatchingNotes = footnotes.filter((fn) =>
        isEndnote ? fn.noteType === 'endnote' : fn.noteType !== 'endnote'
      );
      const nextNumber = existingMatchingNotes.length + 1;

      const newNote: FootnoteItem = {
        id: crypto.randomUUID(),
        number: nextNumber,
        text,
        referenceParagraphId: pId,
        // Where in the paragraph the reference sits. Without it the numbering of
        // several notes in one paragraph follows the order they were added, not the
        // order they appear in the text.
        referenceTextOffset: Math.max(0, Math.trunc(activeTextOffset ?? 0)),
        noteType: options?.noteType ?? 'footnote',
        numberFormat: options?.numberFormat ?? (isEndnote ? 'roman' : 'arabic'),
        customMark: options?.customMark,
      };

      persistWriterData({
        footnotes: [...footnotes, newNote],
      });
    },
    [activeParagraphId, activeTextOffset, paragraphs, footnotes, persistWriterData]
  );

  // Cross-reference insertion (Paket E L118)
  const handleInsertCrossReferenceText = useCallback(
    (refText: string) => {
      handleInsertTextAtSelection(` ${refText}`);
    },
    [handleInsertTextAtSelection]
  );

  return {
    indexEntries,
    handleUpdateAllFields,
    handleInsertTocParagraphs,
    handleInsertSpecialIndexParagraphs,
    handleUpdateIndexEntries,
    handleInsertTableOfTables,
    handleInsertSubjectIndex,
    handleAddFootnote,
    handleInsertCrossReferenceText,
  };
}
