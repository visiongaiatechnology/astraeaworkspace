// STATUS: DIAMANT VGT SUPREME — Sovereign Unified Modals Container for Astraea Writer
import React, { useRef } from 'react';
import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { useWriterState } from '../useWriterState';
import type { WriterWorkspaceSourceMetadata } from '../../types';
import type { WriterExportHost } from '../../../../edition/contracts/writerExportHost';
import { WriterEditorModals } from './WriterEditorModals';
import { WriterReviewAndReferenceModals } from './WriterReviewAndReferenceModals';
import { WriterAudioVideoModal } from '../../media/WriterAudioVideoModal';
import { appendWriterWorkspaceEmbed } from '../../public/workspace/writerWorkspaceIntegration';
import { applyWriterTextSpanFormatRange, writerTextSpanFormatAtOffset } from '../../editing/text/writerTextEditing';
import { useWriterModalAccessibility } from '../accessibility/useWriterModalAccessibility';

export interface WriterAllModalsProps {
  state: ReturnType<typeof useWriterState>;
  document: WorkspaceDocument;
  workspaceDocuments: readonly WorkspaceDocument[];
  storedWorkspaceDocuments?: readonly WriterWorkspaceSourceMetadata[];
  loadStoredWorkspaceDocument?: (documentId: string) => Promise<WorkspaceDocument | null>;
  allowBrowserManagedSpeech?: boolean;
  writerExportHost?: WriterExportHost;
}

export const WriterAllModals: React.FC<WriterAllModalsProps> = ({
  state,
  document,
  workspaceDocuments,
  storedWorkspaceDocuments,
  loadStoredWorkspaceDocument,
  allowBrowserManagedSpeech = false,
  writerExportHost,
}) => {
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  useWriterModalAccessibility(modalHostRef);
  return (
    <div ref={modalHostRef} className="contents" data-writer-modal-host="true">
      {/* Core Editor Modals */}
      <WriterEditorModals
        pageSetup={state.activePageSetup}
        documentPageSetup={state.pageSetup}
        workspaceDocuments={workspaceDocuments}
        storedWorkspaceDocuments={storedWorkspaceDocuments}
        loadStoredWorkspaceDocument={loadStoredWorkspaceDocument}
        isPageSetupOpen={state.isPageSetupOpen}
        onClosePageSetup={() => state.setIsPageSetupOpen(false)}
        onUpdatePageSetup={state.handleUpdateActivePageSetup}
        isSectionPageSetup={Boolean(state.activeSection)}
        sectionBreakType={state.activeSection?.breakType ?? 'next-page'}
        restartPageNumberAt={state.activeSection?.restartPageNumberAt}
        canCreateSection={state.canCreateSectionAtCursor}
        onCreateSection={state.handleCreateSectionAtActiveParagraph}
        onRemoveSection={state.handleRemoveActiveSection}
        citations={state.citations}
        isCitationOpen={state.isCitationOpen}
        onCloseCitation={() => state.setIsCitationOpen(false)}
        onAddCitationSource={(src) => state.persistWriterData({ citations: [...state.citations, src] })}
        onInsertCitation={(citationText) => state.handleInsertTextAtSelection(` ${citationText}`)}
        onInsertBibliography={(bibText) => {
          const bibP: Paragraph = { id: `bib-${Date.now()}`, style: { style_name: 'heading2', heading_level: 2, alignment: 'left', line_height: 1.3, space_before: 16, space_after: 8 }, spans: [{ text: 'Literaturverzeichnis', bold: true, font_size_pt: 16 }] };
          const contentP: Paragraph = { id: `bib-content-${Date.now()}`, style: { style_name: 'normal', alignment: 'left', line_height: 1.5, space_before: 4, space_after: 6 }, spans: [{ text: bibText, font_size_pt: 10 }] };
          state.persistParagraphs([...state.paragraphs, bibP, contentP]);
        }}
        isSymbolsOpen={state.isSymbolsOpen}
        onCloseSymbols={() => state.setIsSymbolsOpen(false)}
        onInsertSymbol={state.handleInsertTextAtSelection}
        bookmarks={state.bookmarks}
        isBookmarkOpen={state.isBookmarkOpen}
        currentParagraphId={state.activeParagraph?.id || ''}
        onCloseBookmark={() => state.setIsBookmarkOpen(false)}
        onAddBookmark={(name) => {
          const newB = { id: crypto.randomUUID(), name, paragraphId: state.activeParagraph?.id || '', createdAt: Date.now() };
          state.persistWriterData({ bookmarks: [...state.bookmarks, newB] });
        }}
        mailMerge={state.mailMerge}
        isMailMergeOpen={state.isMailMergeOpen}
        onCloseMailMerge={() => state.setIsMailMergeOpen(false)}
        onUpdateMergeData={(data) => state.persistWriterData({ mailMerge: data })}
        isParagraphFormatOpen={state.isParagraphFormatOpen}
        onCloseParagraphFormat={() => state.setIsParagraphFormatOpen(false)}
        activeParagraph={state.activeParagraph}
        onUpdateParagraphStyle={state.handleApplyParagraphStylePatch}
        rangeFormat={state.rangeFormatState}
        isSortOpen={state.isSortOpen}
        onCloseSort={() => state.setIsSortOpen(false)}
        onSort={state.handleSortParagraphs}
        sortBoundaryParagraphIds={state.activeParagraphId ? [state.activeParagraphId] : []}
        isStyleInspectorOpen={state.isStyleInspectorOpen}
        onCloseStyleInspector={() => state.setIsStyleInspectorOpen(false)}
        onApplyStyle={state.handleApplyStyle}
        onApplyCharacterStyle={state.handleApplyCharacterStyle}
        onApplyListStyle={state.handleApplyListStyle}
        onApplyLinkedStyle={state.handleApplyLinkedStyle}
        onApplyTableStyle={state.handleApplyTableStyle}
        onUpdateStyle={state.handleUpdateStyle}
        onClearDirectFormatting={state.handleClearFormatting}
        styleSets={state.styleSets}
        onSaveStyleSet={state.handleSaveStyleSet}
        onImportStyleSet={state.handleImportStyleSet}
        onApplyStyleSet={state.handleApplyStyleSet}
        isFieldsOpen={state.isFieldsOpen}
        onCloseFields={() => state.setIsFieldsOpen(false)}
        documentTitle={document.title}
        wordCount={state.stats.words}
        charCount={state.stats.characters}
        onInsertField={state.handleInsertTextAtSelection}
        isGridEmbedOpen={state.isGridEmbedOpen}
        onCloseGridEmbed={() => state.setIsGridEmbedOpen(false)}
        onInsertTableBlock={state.insertTable}
        onInsertWorkspaceEmbed={(embed) => state.persistWriterData({ workspaceEmbeds: appendWriterWorkspaceEmbed(document.writerData?.workspaceEmbeds ?? [], embed) })}
        isStatsOpen={state.isStatsOpen}
        onCloseStats={() => state.setIsStatsOpen(false)}
        statistics={state.stats}
        revisions={state.revisions}
        onAcceptAllRevisions={state.handleAcceptAllRevisions}
        onRejectAllRevisions={state.handleRejectAllRevisions}
        onAcceptRevision={state.handleAcceptRevision}
        onRejectRevision={state.handleRejectRevision}
        writerExportHost={writerExportHost}
        isExportOpen={state.isExportOpen}
        onCloseExport={() => state.setIsExportOpen(false)}
        document={document}
        paragraphs={state.paragraphs}
        tables={state.tables}
        images={state.images}
        styles={state.styles}
        sections={state.sections}
        styleCatalog={state.styleCatalog}
        isLinguisticsOpen={state.isLinguisticsOpen}
        onCloseLinguistics={() => state.setIsLinguisticsOpen(false)}
        linguisticsProps={{
          linguistics: state.linguistics,
          activeParagraphId: state.activeParagraph?.id,
          hasTextSelection: Boolean(state.textSelection && state.textSelection.paragraphId === state.activeParagraph?.id && state.textSelection.start !== state.textSelection.end),
          onUpdateParagraphText: (pId, text) => {
            const idx = state.paragraphs.findIndex((p) => p.id === pId);
            if (idx >= 0) state.handleParagraphChange(idx, text);
          },
          onUpdateLinguistics: (config) => state.persistWriterData({ linguistics: config }),
          onApplyLanguage: (language) => state.updateActiveParagraphFormatting((paragraph) => {
            const selection = state.textSelection?.paragraphId === paragraph.id && state.textSelection.start !== state.textSelection.end ? state.textSelection : null;
            if (!selection) return { ...paragraph, spans: paragraph.spans.map((span) => ({ ...span, language })) };
            const base = writerTextSpanFormatAtOffset(paragraph, selection.start);
            return applyWriterTextSpanFormatRange(paragraph, selection.start, selection.end, { ...base, language });
          }),
          onSetHyphenationMode: (hyphenationMode) => state.updateActiveParagraphFormatting((paragraph) => ({
            ...paragraph,
            style: { ...paragraph.style, hyphenation_mode: hyphenationMode },
          })),
        }}
        isDictationOpen={state.isDictationOpen}
        allowBrowserManagedSpeech={allowBrowserManagedSpeech}
        onCloseDictation={() => state.setIsDictationOpen(false)}
        onInsertTranscript={state.handleInsertTextAtSelection}
        isRoundtripOpen={state.isRoundtripOpen}
        onCloseRoundtrip={() => state.setIsRoundtripOpen(false)}
        onImportParagraphs={(imported) => state.persistParagraphs(imported)}
        onImportDocument={(importedDocument) => {
          const importedTextBlock = importedDocument.root_object_ids
            .map((id) => importedDocument.objects[id])
            .find((object) => object?.type === 'TextBlock');
          if (importedTextBlock?.type !== 'TextBlock') return;
          state.persistParagraphs(importedTextBlock.data.paragraphs, importedDocument.writerData);
        }}
        isAutoCorrectOpen={state.isAutoCorrectOpen}
        autoCorrect={state.autoCorrect}
        onCloseAutoCorrect={() => state.setIsAutoCorrectOpen(false)}
        onSaveAutoCorrect={(cfg) => state.persistWriterData({ autoCorrect: cfg })}
        isTablePropertiesOpen={state.isTablePropertiesOpen}
        activeTable={state.selectedTableForProperties}
        onCloseTableProperties={() => state.setIsTablePropertiesOpen(false)}
        onUpdateTable={state.updateTable}
        onSplitTable={state.splitTable}
        isImagePropertiesOpen={state.isImagePropertiesOpen}
        activeImage={state.selectedImageForProperties}
        onCloseImageProperties={() => state.setIsImagePropertiesOpen(false)}
        onUpdateImage={(imgId, patch) => state.persistWriterData({ images: state.images.map((img) => (img.id === imgId ? { ...img, ...patch } : img)) })}
        isEquationModalOpen={state.isEquationModalOpen}
        activeEquation={state.selectedEquationForModal}
        onCloseEquationModal={() => state.setIsEquationModalOpen(false)}
        onSaveEquation={state.handleSaveEquation}
        isTableOfFiguresOpen={state.isTableOfFiguresOpen}
        onCloseTableOfFigures={() => state.setIsTableOfFiguresOpen(false)}
        onInsertTableOfFigures={state.handleInsertTableOfFigures}
        paginationPages={undefined}
        isListFormatOpen={state.isListFormatOpen}
        onCloseListFormat={() => state.setIsListFormatOpen(false)}
        onApplyListTemplate={state.handleApplyListTemplate}
        onToggleHeadingOutlineNumbering={state.handleToggleHeadingOutlineNumbering}
      />

      <WriterAudioVideoModal
        isOpen={state.isMediaObjectOpen}
        anchorParagraphId={state.activeParagraph?.id}
        onClose={() => state.setIsMediaObjectOpen(false)}
        onInsert={(media) => state.persistWriterData({ mediaObjects: [...state.mediaObjects, media] })}
      />

      {/* Review & Reference Modals (Paket E & F) */}
      <WriterReviewAndReferenceModals
        isTocOpen={state.isTocOpen}
        onCloseToc={() => state.setIsTocOpen(false)}
        onInsertToc={state.handleInsertTocParagraphs}
        pages={state.pages}
        isSpecialDirectoriesOpen={state.isSpecialDirectoriesOpen}
        onCloseSpecialDirectories={() => state.setIsSpecialDirectoriesOpen(false)}
        indexEntries={state.indexEntries}
        onUpdateIndexEntries={state.handleUpdateIndexEntries}
        onInsertSpecialIndexParagraphs={state.handleInsertSpecialIndexParagraphs}
        isCompareOpen={state.isCompareOpen}
        onCloseCompare={() => state.setIsCompareOpen(false)}
        currentDocumentId={document.id}
        workspaceDocuments={workspaceDocuments}
        onApplyMergedRevisions={state.handleApplyMergedRevisions}
        isProtectionOpen={state.isProtectionOpen}
        onCloseProtection={() => state.setIsProtectionOpen(false)}
        protectionMode={state.protectionMode}
        protectionPasswordHash={state.protectionPasswordHash}
        onApplyProtection={state.handleApplyProtection}
        isFootnoteOpen={state.isFootnoteOpen}
        onCloseFootnote={() => state.setIsFootnoteOpen(false)}
        onInsertFootnote={state.handleAddFootnote}
        isCrossReferenceOpen={state.isCrossReferenceOpen}
        onCloseCrossReference={() => state.setIsCrossReferenceOpen(false)}
        paragraphs={state.paragraphs}
        bookmarks={state.bookmarks}
        footnotes={state.footnotes}
        tables={state.tables}
        images={state.images}
        onInsertCrossReference={state.handleInsertCrossReferenceText}
      />
    </div>
  );
};
