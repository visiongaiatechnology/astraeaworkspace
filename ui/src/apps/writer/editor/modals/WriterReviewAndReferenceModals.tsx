// STATUS: DIAMANT VGT SUPREME — Sovereign Review & Reference Modals Orchestrator
import React from 'react';
import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import type {
  BookmarkItem,
  FootnoteItem,
  ImageBlockData,
  TableBlockData,
  TrackChangeRevision,
  WriterFootnoteType,
  WriterIndexEntry,
  WriterNoteNumberFormat,
  WriterProtectionMode,
} from '../../types';
import { WriterTocModal } from '../../references/toc/WriterTocModal';
import { WriterSpecialDirectoriesModal } from '../../references/indexes/WriterSpecialDirectoriesModal';
import { WriterCompareModal } from '../../review/WriterCompareModal';
import { WriterProtectionModal } from '../../security/protection/WriterProtectionModal';
import { WriterFootnoteModal } from '../../references/footnotes/WriterFootnoteModal';
import { WriterCrossReferenceModal } from '../../references/cross-references/WriterCrossReferenceModal';

export interface WriterReviewAndReferenceModalsProps {
  // TOC
  isTocOpen: boolean;
  onCloseToc: () => void;
  onInsertToc: (updatedParagraphs: Paragraph[]) => void;

  // Special Directories (TOT & Index)
  isSpecialDirectoriesOpen: boolean;
  onCloseSpecialDirectories: () => void;
  indexEntries: readonly WriterIndexEntry[];
  onUpdateIndexEntries: (entries: WriterIndexEntry[]) => void;
  onInsertSpecialIndexParagraphs: (paragraphs: Paragraph[]) => void;

  // Compare
  isCompareOpen: boolean;
  onCloseCompare: () => void;
  currentDocumentId: string;
  workspaceDocuments: readonly WorkspaceDocument[];
  onApplyMergedRevisions: (
    mergedParagraphs: Paragraph[],
    generatedRevisions: TrackChangeRevision[]
  ) => void;

  // Protection
  isProtectionOpen: boolean;
  onCloseProtection: () => void;
  protectionMode: WriterProtectionMode;
  protectionPasswordHash?: string;
  onApplyProtection: (mode: WriterProtectionMode, passwordHash?: string) => void;

  // Footnotes & Endnotes
  isFootnoteOpen: boolean;
  onCloseFootnote: () => void;
  onInsertFootnote: (
    text: string,
    options?: {
      noteType?: WriterFootnoteType;
      numberFormat?: WriterNoteNumberFormat;
      customMark?: string;
    }
  ) => void;

  // Cross-References
  isCrossReferenceOpen: boolean;
  onCloseCrossReference: () => void;
  paragraphs: Paragraph[];
  /** Pagination of the current document — the directory needs it for its page numbers. */
  pages: readonly WriterPaginationPage[];
  bookmarks: BookmarkItem[];
  footnotes: FootnoteItem[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  onInsertCrossReference: (refText: string) => void;
}

export const WriterReviewAndReferenceModals: React.FC<WriterReviewAndReferenceModalsProps> = ({
  isTocOpen,
  onCloseToc,
  onInsertToc,
  isSpecialDirectoriesOpen,
  onCloseSpecialDirectories,
  indexEntries,
  onUpdateIndexEntries,
  onInsertSpecialIndexParagraphs,
  isCompareOpen,
  onCloseCompare,
  currentDocumentId,
  workspaceDocuments,
  onApplyMergedRevisions,
  isProtectionOpen,
  onCloseProtection,
  protectionMode,
  protectionPasswordHash,
  onApplyProtection,
  isFootnoteOpen,
  onCloseFootnote,
  onInsertFootnote,
  isCrossReferenceOpen,
  onCloseCrossReference,
  paragraphs,
  pages,
  bookmarks,
  footnotes,
  tables,
  images,
  onInsertCrossReference,
}) => {
  return (
    <>
      <WriterTocModal
        isOpen={isTocOpen}
        onClose={onCloseToc}
        paragraphs={paragraphs}
        pages={pages}
        onInsertToc={onInsertToc}
      />

      <WriterSpecialDirectoriesModal
        isOpen={isSpecialDirectoriesOpen}
        onClose={onCloseSpecialDirectories}
        tables={tables}
        indexEntries={indexEntries}
        onUpdateIndexEntries={onUpdateIndexEntries}
        onInsertParagraphs={onInsertSpecialIndexParagraphs}
      />

      <WriterCompareModal
        isOpen={isCompareOpen}
        onClose={onCloseCompare}
        currentDocumentId={currentDocumentId}
        currentParagraphs={paragraphs}
        workspaceDocuments={workspaceDocuments}
        onApplyMergedRevisions={onApplyMergedRevisions}
      />

      <WriterProtectionModal
        isOpen={isProtectionOpen}
        onClose={onCloseProtection}
        currentMode={protectionMode}
        storedPasswordHash={protectionPasswordHash}
        onApplyProtection={onApplyProtection}
      />

      <WriterFootnoteModal
        isOpen={isFootnoteOpen}
        onClose={onCloseFootnote}
        onInsertFootnote={onInsertFootnote}
      />

      <WriterCrossReferenceModal
        isOpen={isCrossReferenceOpen}
        onClose={onCloseCrossReference}
        paragraphs={paragraphs}
        bookmarks={bookmarks}
        footnotes={footnotes}
        tables={tables}
        images={images}
        onInsertCrossReference={onInsertCrossReference}
      />
    </>
  );
};
