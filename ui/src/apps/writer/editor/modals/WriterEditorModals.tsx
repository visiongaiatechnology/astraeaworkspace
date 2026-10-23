// STATUS: DIAMANT VGT SUPREME — Sovereign Modals Container for Astraea Writer
import React from 'react';
import type {
  Paragraph,
  ParagraphStyle,
  WorkspaceDocument,
  WriterAutoCorrectConfig,
  WriterParagraphStyleName,
  WriterSectionBreakType,
  WriterSectionDefinition,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterStyleSet,
  WriterWorkspaceEmbed,
} from '../../../../shared/contracts/workspace';
import type {
  CitationSource,
  ImageBlockData,
  MailMergeData,
  PageSetupConfig,
  TableBlockData,
  TrackChangeRevision,
  WriterWorkspaceSourceMetadata,
} from '../../types';
import { WriterPageSetupModal } from '../../layout/page-setup/WriterPageSetupModal';
import { WriterCitationModal } from '../../references/citations/WriterCitationModal';
import { WriterExportModal } from '../../interchange/export/WriterExportModal';
import {
  WriterBookmarkModal,
  WriterMailMergeModal,
  WriterSymbolsModal,
} from './WriterToolsModals';
import { WriterParagraphFormatModal } from '../../formatting/paragraphs/WriterParagraphFormatModal';
import type { WriterRangeFormatState } from '../../formatting/range/writerRangeFormatState';
import { WriterStyleInspectorModal } from '../../formatting/styles/WriterStyleInspectorModal';
import { WriterFieldsModal } from '../../automation/fields/WriterFieldsModal';
import { WriterGridEmbedModal } from '../../integrations/grid/WriterGridEmbedModal';
import { WriterStatsModal } from '../../productivity/insights/WriterStatsModal';
import { WriterLinguisticsModal, type WriterLinguisticsModalProps } from '../../productivity/language/WriterLinguisticsModal';
import { WriterDictationModal } from '../../media/dictation/WriterDictationModal';
import { WriterRoundtripModal } from '../../interchange/roundtrip/WriterRoundtripModal';
import type { TextStatistics } from '../../utils/writerUtils';
import { WriterAutoCorrectModal } from './WriterAutoCorrectModal';
import { WriterSortModal } from '../../productivity/sort/WriterSortModal';
import { WriterListFormatModal } from '../../formatting/lists/WriterListFormatModal';
import type { WriterListTemplate } from '../../../../shared/contracts/writer/workspaceWriterList';
import type { WriterSortOptions } from '../../formatting/sorting/writerSort';
import type { WriterExportHost } from '../../../../edition/contracts/writerExportHost';
import { WriterTablePropertiesModal } from '../../tables/properties/WriterTablePropertiesModal';
import { WriterMediaModals } from './WriterMediaModals';

export interface WriterEditorModalsProps {
  pageSetup: PageSetupConfig;
  documentPageSetup: PageSetupConfig;
  workspaceDocuments: readonly WorkspaceDocument[];
  storedWorkspaceDocuments?: readonly WriterWorkspaceSourceMetadata[];
  loadStoredWorkspaceDocument?: (documentId: string) => Promise<WorkspaceDocument | null>;
  isPageSetupOpen: boolean;
  onClosePageSetup: () => void;
  onUpdatePageSetup: (
    cfg: PageSetupConfig,
    breakType?: WriterSectionBreakType,
    restartPageNumberAt?: number | null,
  ) => void;
  isSectionPageSetup: boolean;
  sectionBreakType?: WriterSectionBreakType;
  restartPageNumberAt?: number;
  canCreateSection: boolean;
  onCreateSection: () => void;
  onRemoveSection: () => void;

  citations: CitationSource[];
  isCitationOpen: boolean;
  onCloseCitation: () => void;
  onAddCitationSource: (src: CitationSource) => void;
  onInsertCitation: (citText: string) => void;
  onInsertBibliography: (bibText: string) => void;

  isSymbolsOpen: boolean;
  onCloseSymbols: () => void;
  onInsertSymbol: (sym: string) => void;

  bookmarks: import('../../types').BookmarkItem[];
  isBookmarkOpen: boolean;
  currentParagraphId: string;
  onCloseBookmark: () => void;
  onAddBookmark: (name: string) => void;

  mailMerge?: MailMergeData;
  isMailMergeOpen: boolean;
  onCloseMailMerge: () => void;
  onUpdateMergeData: (data: MailMergeData) => void;

  isParagraphFormatOpen: boolean;
  onCloseParagraphFormat: () => void;
  activeParagraph?: Paragraph;
  onUpdateParagraphStyle: (patch: Partial<ParagraphStyle>) => void;
  /** What the marked range carries, so the dialog can name a disagreement (W-119). */
  rangeFormat?: WriterRangeFormatState;

  isSortOpen: boolean;
  onCloseSort: () => void;
  onSort: (options: WriterSortOptions) => void;
  sortBoundaryParagraphIds?: string[];

  isImagePropertiesOpen: boolean;
  activeImage?: ImageBlockData | null;
  onCloseImageProperties: () => void;
  onUpdateImage: (imageId: string, patch: Partial<ImageBlockData>) => void;
  isEquationModalOpen: boolean;
  activeEquation?: import('../../../../shared/contracts/workspace').WriterEquationBlockData | null;
  onCloseEquationModal: () => void;
  onSaveEquation: (equation: import('../../../../shared/contracts/workspace').WriterEquationBlockData) => void;
  isTableOfFiguresOpen: boolean;
  onCloseTableOfFigures: () => void;
  onInsertTableOfFigures: (paragraphs: Paragraph[]) => void;
  paginationPages?: readonly import('../../layout/pagination/writerPagination').WriterPaginationPage[];
  isListFormatOpen: boolean;
  onCloseListFormat: () => void;
  isTablePropertiesOpen: boolean;
  activeTable?: TableBlockData | null;
  onCloseTableProperties: () => void;
  onUpdateTable: (table: TableBlockData) => void;
  onSplitTable: (top: TableBlockData, bottom: TableBlockData) => void;
  onApplyListTemplate: (template: WriterListTemplate, isHeadingLinked?: boolean) => void;
  onToggleHeadingOutlineNumbering: (enabled: boolean) => void;

  isStyleInspectorOpen: boolean;
  onCloseStyleInspector: () => void;
  onApplyStyle: (name: WriterParagraphStyleName) => void;
  onApplyCharacterStyle: (id: string) => void;
  onApplyListStyle: (id: string) => void;
  onApplyLinkedStyle: (id: string) => void;
  onApplyTableStyle: (tableId: string, styleId: string) => void;
  onUpdateStyle: (name: WriterParagraphStyleName, patch: Partial<Omit<WriterStyleDefinition, 'name' | 'label'>>) => void;
  onClearDirectFormatting: () => void;
  styleSets: WriterStyleSet[];
  onSaveStyleSet: (name: string) => void;
  onImportStyleSet: (styleSet: WriterStyleSet) => void;
  onApplyStyleSet: (id: string) => void;

  isFieldsOpen: boolean;
  onCloseFields: () => void;
  documentTitle: string;
  wordCount: number;
  charCount: number;
  onInsertField: (text: string) => void;

  isGridEmbedOpen: boolean;
  onCloseGridEmbed: () => void;
  onInsertTableBlock: (table: TableBlockData) => void;
  onInsertWorkspaceEmbed: (embed: WriterWorkspaceEmbed) => void;

  isStatsOpen: boolean;
  onCloseStats: () => void;
  statistics: TextStatistics;
  revisions: TrackChangeRevision[];
  onAcceptAllRevisions: () => void;
  onRejectAllRevisions: () => void;
  onAcceptRevision: (id: string) => void;
  onRejectRevision: (id: string) => void;

  isExportOpen: boolean; onCloseExport: () => void;
  writerExportHost?: WriterExportHost;
  document: WorkspaceDocument;
  paragraphs: Paragraph[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  styles: WriterStyleDefinition[];
  sections: WriterSectionDefinition[];
  styleCatalog: WriterStyleCatalog;

  isLinguisticsOpen: boolean;
  onCloseLinguistics: () => void;
  linguisticsProps: Omit<WriterLinguisticsModalProps, 'isOpen' | 'onClose' | 'paragraphs'>;

  isDictationOpen: boolean;
  allowBrowserManagedSpeech?: boolean;
  onCloseDictation: () => void;
  onInsertTranscript: (text: string) => void;

  isRoundtripOpen: boolean;
  onCloseRoundtrip: () => void;
  onImportParagraphs: (importedParagraphs: Paragraph[]) => void;
  onImportDocument: (importedDocument: WorkspaceDocument) => void;

  isAutoCorrectOpen: boolean;
  onCloseAutoCorrect: () => void;
  autoCorrect: WriterAutoCorrectConfig;
  onSaveAutoCorrect: (config: WriterAutoCorrectConfig) => void;
}

export const WriterEditorModals: React.FC<WriterEditorModalsProps> = ({
  pageSetup,
  documentPageSetup,
  workspaceDocuments,
  storedWorkspaceDocuments,
  loadStoredWorkspaceDocument,
  isPageSetupOpen,
  onClosePageSetup,
  onUpdatePageSetup,
  isSectionPageSetup,
  sectionBreakType,
  restartPageNumberAt,
  canCreateSection,
  onCreateSection,
  onRemoveSection,
  citations,
  isCitationOpen,
  onCloseCitation,
  onAddCitationSource,
  onInsertCitation,
  onInsertBibliography,
  isSymbolsOpen,
  onCloseSymbols,
  onInsertSymbol,
  bookmarks: _bookmarks,
  isBookmarkOpen,
  onCloseBookmark,
  onAddBookmark,
  mailMerge,
  isMailMergeOpen,
  onCloseMailMerge,
  onUpdateMergeData,
  isParagraphFormatOpen,
  onCloseParagraphFormat,
  activeParagraph,
  onUpdateParagraphStyle,
  rangeFormat,
  isSortOpen,
  onCloseSort,
  onSort,
  sortBoundaryParagraphIds = [],
  isImagePropertiesOpen,
  activeImage = null,
  onCloseImageProperties,
  onUpdateImage,
  isEquationModalOpen,
  activeEquation = null,
  onCloseEquationModal,
  onSaveEquation,
  isTableOfFiguresOpen,
  onCloseTableOfFigures,
  onInsertTableOfFigures,
  paginationPages,
  isListFormatOpen,
  onCloseListFormat,
  isTablePropertiesOpen,
  activeTable = null,
  onCloseTableProperties,
  onUpdateTable,
  onSplitTable,
  onApplyListTemplate,
  onToggleHeadingOutlineNumbering,
  isStyleInspectorOpen,
  onCloseStyleInspector,
  onApplyStyle,
  onApplyCharacterStyle,
  onApplyListStyle,
  onApplyLinkedStyle,
  onApplyTableStyle,
  onUpdateStyle,
  onClearDirectFormatting,
  styleSets,
  onSaveStyleSet,
  onImportStyleSet,
  onApplyStyleSet,
  isFieldsOpen,
  onCloseFields,
  documentTitle,
  wordCount,
  charCount,
  onInsertField,
  isGridEmbedOpen,
  onCloseGridEmbed,
  onInsertTableBlock,
  onInsertWorkspaceEmbed,
  isStatsOpen,
  onCloseStats,
  statistics,
  revisions,
  onAcceptAllRevisions,
  onRejectAllRevisions,
  onAcceptRevision,
  onRejectRevision,
  isExportOpen, onCloseExport,
  writerExportHost,
  document,
  paragraphs,
  tables,
  images,
  styles,
  sections,
  styleCatalog,
  isLinguisticsOpen,
  onCloseLinguistics,
  linguisticsProps,
  isDictationOpen,
  allowBrowserManagedSpeech = false,
  onCloseDictation,
  onInsertTranscript,
  isRoundtripOpen,
  onCloseRoundtrip,
  onImportParagraphs,
  onImportDocument,
  isAutoCorrectOpen,
  onCloseAutoCorrect,
  autoCorrect,
  onSaveAutoCorrect,
}) => {
  return (
    <>
      <WriterPageSetupModal
        isOpen={isPageSetupOpen}
        onClose={onClosePageSetup}
        config={pageSetup}
        onUpdateConfig={onUpdatePageSetup}
        isSectionConfig={isSectionPageSetup}
        sectionBreakType={sectionBreakType}
        restartPageNumberAt={restartPageNumberAt}
        canCreateSection={canCreateSection}
        onCreateSection={onCreateSection}
        onRemoveSection={onRemoveSection}
      />

      <WriterCitationModal
        isOpen={isCitationOpen}
        onClose={onCloseCitation}
        sources={citations}
        onAddSource={onAddCitationSource}
        onInsertCitation={(citText) => onInsertCitation(citText)}
        onGenerateBibliography={(entries) => onInsertBibliography(entries.join('\n\n'))}
      />

      <WriterSymbolsModal
        isOpen={isSymbolsOpen}
        onClose={onCloseSymbols}
        onInsertSymbol={onInsertSymbol}
      />

      <WriterBookmarkModal
        isOpen={isBookmarkOpen}
        onClose={onCloseBookmark}
        onAddBookmark={onAddBookmark}
      />

      <WriterMailMergeModal
        isOpen={isMailMergeOpen}
        onClose={onCloseMailMerge}
        mailMergeConfig={mailMerge || { records: [], currentRecordIndex: 0, previewEnabled: false }}
        onUpdateMailMergeConfig={onUpdateMergeData}
        onInsertMergeField={onInsertSymbol}
      />

      <WriterParagraphFormatModal
        isOpen={isParagraphFormatOpen}
        onClose={onCloseParagraphFormat}
        paragraph={activeParagraph}
        onUpdateParagraphStyle={onUpdateParagraphStyle}
        rangeFormat={rangeFormat}
      />

      <WriterSortModal
        isOpen={isSortOpen}
        paragraphs={paragraphs}
        activeParagraphId={activeParagraph?.id ?? null}
        boundaryParagraphIds={sortBoundaryParagraphIds}
        locale={autoCorrect.locale}
        onClose={onCloseSort}
        onApply={onSort}
      />

      <WriterStyleInspectorModal
        isOpen={isStyleInspectorOpen}
        onClose={onCloseStyleInspector}
        paragraph={activeParagraph}
        catalog={styleCatalog}
        activeTable={tables.find((table) => table.anchorParagraphId === activeParagraph?.id) ?? tables[0]}
        onApplyStyle={onApplyStyle}
        onApplyCharacterStyle={onApplyCharacterStyle}
        onApplyListStyle={onApplyListStyle}
        onApplyLinkedStyle={onApplyLinkedStyle}
        onApplyTableStyle={onApplyTableStyle}
        onUpdateStyle={onUpdateStyle}
        onClearDirectFormatting={onClearDirectFormatting}
        styleSets={styleSets}
        onSaveStyleSet={onSaveStyleSet}
        onImportStyleSet={onImportStyleSet}
        onApplyStyleSet={onApplyStyleSet}
        rangeFormat={rangeFormat}
      />

      <WriterFieldsModal
        isOpen={isFieldsOpen}
        onClose={onCloseFields}
        documentTitle={documentTitle}
        pageSetup={pageSetup}
        totalWords={wordCount}
        onInsertField={onInsertField}
      />

      <WriterGridEmbedModal
        isOpen={isGridEmbedOpen}
        onClose={onCloseGridEmbed}
        onInsertTable={onInsertTableBlock}
        onInsertWorkspaceEmbed={onInsertWorkspaceEmbed}
        writerDocument={document}
        anchorParagraphId={activeParagraph?.id ?? ''}
        workspaceDocuments={workspaceDocuments}
        storedWorkspaceDocuments={storedWorkspaceDocuments}
        loadStoredWorkspaceDocument={loadStoredWorkspaceDocument}
      />

      <WriterStatsModal
        isOpen={isStatsOpen}
        onClose={onCloseStats}
        statistics={statistics}
        revisions={revisions}
        onAcceptAllRevisions={onAcceptAllRevisions}
        onRejectAllRevisions={onRejectAllRevisions}
        onAcceptRevision={onAcceptRevision}
        onRejectRevision={onRejectRevision}
      />

      <WriterExportModal
        document={document}
        isOpen={isExportOpen}
        onClose={onCloseExport}
        documentTitle={documentTitle}
        wordCount={wordCount}
        charCount={charCount}
        config={documentPageSetup}
        paragraphs={paragraphs}
        tables={tables}
        images={images}
        styles={styles}
        sections={sections}
        writerExportHost={writerExportHost}
      />

      <WriterLinguisticsModal
        isOpen={isLinguisticsOpen}
        onClose={onCloseLinguistics}
        paragraphs={paragraphs}
        {...linguisticsProps}
      />

      <WriterDictationModal
        isOpen={isDictationOpen}
        allowBrowserManagedSpeech={allowBrowserManagedSpeech}
        onClose={onCloseDictation}
        onInsertTranscript={onInsertTranscript}
      />

      <WriterRoundtripModal
        isOpen={isRoundtripOpen}
        onClose={onCloseRoundtrip}
        onImportParagraphs={onImportParagraphs}
        onImportDocument={onImportDocument}
      />

      <WriterAutoCorrectModal
        isOpen={isAutoCorrectOpen}
        config={autoCorrect}
        onClose={onCloseAutoCorrect}
        onSave={onSaveAutoCorrect}
      />

      <WriterTablePropertiesModal
        isOpen={isTablePropertiesOpen}
        table={activeTable ?? null}
        onClose={onCloseTableProperties}
        onUpdateTable={onUpdateTable}
        onSplitTable={onSplitTable}
      />

      <WriterMediaModals
        isImagePropertiesOpen={isImagePropertiesOpen}
        activeImage={activeImage}
        onCloseImageProperties={onCloseImageProperties}
        onUpdateImage={onUpdateImage}
        isEquationModalOpen={isEquationModalOpen}
        activeEquation={activeEquation}
        onCloseEquationModal={onCloseEquationModal}
        onSaveEquation={onSaveEquation}
        isTableOfFiguresOpen={isTableOfFiguresOpen}
        images={images}
        paginationPages={paginationPages}
        onCloseTableOfFigures={onCloseTableOfFigures}
        onInsertTableOfFigures={onInsertTableOfFigures}
      />

      <WriterListFormatModal
        isOpen={isListFormatOpen}
        onClose={onCloseListFormat}
        activeParagraph={activeParagraph}
        allParagraphs={paragraphs}
        onUpdateParagraphStyle={onUpdateParagraphStyle}
        onApplyListTemplate={onApplyListTemplate}
        onToggleHeadingOutlineNumbering={onToggleHeadingOutlineNumbering}
      />
    </>
  );
};
