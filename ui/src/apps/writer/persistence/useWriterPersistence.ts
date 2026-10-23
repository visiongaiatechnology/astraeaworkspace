// STATUS: DIAMANT VGT SUPREME — Writer Persistence Boundary
import { useCallback } from 'react';
import type {
  Paragraph,
  TextBlockObject,
  WorkspaceDocument,
  WriterAutoCorrectConfig,
  WriterSectionDefinition,
  WriterMediaObjectData,
  WriterShapeBlockData,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterStyleSet,
} from '../../../shared/contracts/workspace';
import { refreshWriterLocalChartEmbeds } from '../public/workspace/writerWorkspaceIntegration';
import { normalizeWriterImagesForWrite } from '../media/images/operations/writerImageBoundary';
import { planWriterTextBlockWrite } from './writerTextBlockWrite';
import { carryOverWriterDataPatchFields } from './writerDataWriteCarryOver';
import type { WriterHistoryCoalesceRequest } from '../editor/history/writerHistory';
import type {
  BookmarkItem,
  CitationSource,
  DocumentComment,
  EquationBlockData,
  FootnoteItem,
  ImageBlockData,
  MailMergeData,
  PageSetupConfig,
  TableBlockData,
  TrackChangeRevision,
  ViewMode,
  WriterDocumentData,
} from '../types';

interface UseWriterPersistenceProps {
  document: WorkspaceDocument;
  writerData: WriterDocumentData;
  primaryTextBlockId?: string;
  textBlockObj?: TextBlockObject;
  pageSetup: PageSetupConfig;
  tables: TableBlockData[];
  images: ImageBlockData[];
  mediaObjects: WriterMediaObjectData[];
  styles: WriterStyleDefinition[];
  styleCatalog: WriterStyleCatalog;
  styleSets: WriterStyleSet[];
  sections: WriterSectionDefinition[];
  equations: EquationBlockData[];
  shapes: WriterShapeBlockData[];
  footnotes: FootnoteItem[];
  citations: CitationSource[];
  comments: DocumentComment[];
  revisions: TrackChangeRevision[];
  bookmarks: BookmarkItem[];
  mailMerge?: MailMergeData;
  autoCorrect: WriterAutoCorrectConfig;
  viewMode: ViewMode;
  currentTheme?: string;
  commitDocument: (document: WorkspaceDocument, coalesce?: WriterHistoryCoalesceRequest) => void;
}

export function useWriterPersistence({
  document,
  writerData,
  primaryTextBlockId,
  textBlockObj,
  pageSetup,
  tables,
  images,
  mediaObjects,
  styles,
  styleCatalog,
  styleSets,
  sections,
  equations,
  shapes,
  footnotes,
  citations,
  comments,
  revisions,
  bookmarks,
  mailMerge,
  autoCorrect,
  viewMode,
  currentTheme,
  commitDocument,
}: UseWriterPersistenceProps) {
  const mergedWriterData = useCallback((patch: Partial<WriterDocumentData> = {}) => {
    const hasProtectionPasswordPatch = Object.prototype.hasOwnProperty.call(patch, 'protectionPasswordHash');
    const nextComments = patch.comments ?? comments;
    const nextWorkspaceEmbeds = Object.prototype.hasOwnProperty.call(patch, 'tables')
      ? refreshWriterLocalChartEmbeds(
          patch.workspaceEmbeds ?? writerData.workspaceEmbeds,
          patch.tables ?? tables,
          document.id,
          document.version + 1,
          Date.now(),
        )
      : patch.workspaceEmbeds ?? writerData.workspaceEmbeds;
    const merged = {
    ...writerData,
    pageSetup: patch.pageSetup ?? pageSetup,
    tables: patch.tables ?? tables,
    // W-057: the wrap mode the layout resolves is written down, so the stored document says what is
    // displayed. Only this field is added; every other field is passed through untouched.
    images: normalizeWriterImagesForWrite(patch.images ?? images),
    mediaObjects: patch.mediaObjects ?? mediaObjects,
    styles: patch.styles ?? (patch.styleCatalog ? patch.styleCatalog.paragraphStyles : styles),
    styleCatalog: patch.styleCatalog ?? (patch.styles ? { ...styleCatalog, paragraphStyles: patch.styles } : styleCatalog),
    styleSets: patch.styleSets ?? styleSets,
    sections: patch.sections ?? sections,
    equations: patch.equations ?? equations,
    footnotes: patch.footnotes ?? footnotes,
    citations: patch.citations ?? citations,
    comments: nextComments,
    revisions: patch.revisions ?? revisions,
    bookmarks: patch.bookmarks ?? bookmarks,
    mailMerge: patch.mailMerge ?? mailMerge,
    autoCorrect: patch.autoCorrect ?? autoCorrect,
    linguistics: patch.linguistics ?? writerData.linguistics,
    viewMode: patch.viewMode ?? viewMode,
    currentTheme: patch.currentTheme ?? currentTheme,
    shapes: patch.shapes ?? shapes,
    protectionMode: patch.protectionMode ?? writerData.protectionMode,
    protectionPasswordHash: hasProtectionPasswordPatch ? patch.protectionPasswordHash : writerData.protectionPasswordHash,
    contentControls: patch.contentControls ?? writerData.contentControls,
    indexEntries: patch.indexEntries ?? writerData.indexEntries,
    list_templates: patch.list_templates ?? writerData.list_templates,
    active_heading_list_template_id: patch.active_heading_list_template_id ?? writerData.active_heading_list_template_id,
    namedVersions: patch.namedVersions ?? writerData.namedVersions,
    interopPreservation: patch.interopPreservation ?? writerData.interopPreservation,
    workspaceEmbeds: nextWorkspaceEmbeds,
    };
    /**
     * Release 0.1: die Liste oben ist der **aufgelöste** Teil des Schreibpfads, nicht
     * die Grenze der Patch-Felder. Was hier fehlt (heute `endnotes`, künftig additiv
     * ergänzte Modellfelder), wird aus dem Patch übernommen, statt still zu
     * verschwinden — siehe `writerDataWriteCarryOver.ts`.
     */
    return carryOverWriterDataPatchFields(merged, patch);
  }, [
    autoCorrect, bookmarks, citations, comments, currentTheme, equations, footnotes, images, mediaObjects,
    mailMerge, pageSetup, revisions, sections, shapes, styleCatalog, styleSets, styles, tables,
    viewMode, writerData.active_heading_list_template_id, writerData.indexEntries,
    writerData.list_templates, writerData.namedVersions, writerData.interopPreservation, writerData.workspaceEmbeds, writerData.mediaObjects, writerData.linguistics, writerData.protectionMode, writerData.protectionPasswordHash, writerData.contentControls,
  ]);

  const persistWriterData = useCallback((patch: Partial<WriterDocumentData>, coalesce: WriterHistoryCoalesceRequest = false) => {
    commitDocument({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      writerData: mergedWriterData(patch),
    }, coalesce);
  }, [commitDocument, document, mergedWriterData]);

  const persistParagraphs = useCallback((
    paragraphs: Paragraph[],
    writerPatch?: Partial<WriterDocumentData>,
    coalesce: WriterHistoryCoalesceRequest = false,
  ) => {
    const write = planWriterTextBlockWrite({
      document,
      primaryTextBlockId,
      existingTextBlock: textBlockObj,
      paragraphs,
    });
    if (!write) return;
    commitDocument({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      root_object_ids: write.rootObjectIds,
      objects: write.objects,
      writerData: mergedWriterData(writerPatch),
    }, coalesce);
  }, [commitDocument, document, mergedWriterData, primaryTextBlockId, textBlockObj]);

  return { persistWriterData, persistParagraphs };
}
