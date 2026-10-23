// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio authoritative state manager and business operations hook
import { useState, useMemo, useRef } from 'react';
import {
  WorkspaceDocument,
  PdfDocumentModel,
} from '../../../../shared/contracts/workspace';
import type { PdfVisualMarkType } from '../../signatures/visual/PdfSignatureModal';
import { buildPdfVisualSignatureAnnotation, getPdfTextSelectionContext } from '../interactions/pdfStudioInteractionUtils';
import { ActiveTool } from '../types';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { deletePdfPage, duplicatePdfPage, insertBlankPdfPage, reorderPdfPage, rotatePdfPage } from '../../pages/pdfPageOps';
import {
  addPdfReviewAnnotation,
  exportPdfAnnotationSummary,
  importPdfAnnotationSummary,
  replyToPdfAnnotation,
  setPdfAnnotationStatus,
  type PdfReviewAnnotationDraft,
} from '../../annotations/pdfReviewAnnotations';
import type { PdfAnnotationReviewStatus } from '../../../../shared/contracts/workspace';
import { usePdfRedactionWorkflow } from '../../security/redaction/usePdfRedactionWorkflow';
import {
  buildSanitizedStructuredPdfCopy,
  type PdfStructuredSanitizationRequest,
} from '../../security/sanitization/pdfStructuredSanitization';
import { buildSanitizedForeignPdfCopy } from '../../security/foreignSanitization/pdfForeignSanitization';
import { usePdfDocumentHistory } from '../../history/usePdfDocumentHistory';
import { clampPdfStudioPage, clampPdfStudioZoom, stepPdfStudioZoom } from '../interactions/pdfStudioKeyboard';
import { withPdfStudioSchema } from './pdfStudioSchema';
import { PdfStudioPersistenceError, savePdfStudioDocument } from '../../persistence/pdfStudioPersistence';
import { deliverExportBytes } from '../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../platform/rendering/documentPdfExport';

/**
 * Visible feedback for a rejected action.
 *
 * The structured editor used to answer a rejected action with `return` — no selection for a highlight, an
 * empty comment, a delete on the last remaining page. The point stayed "nothing happened" to the user, and
 * AST-0764/0779/0789/0809 all require every invalid path to be *visible* and fail closed.
 */
export interface PdfStudioNotice {
  tone: 'info' | 'warning';
  message: string;
  /** Monotonic so a repeated identical message still re-announces to a screen reader. */
  seq: number;
}

export function usePdfStudioState(
  document: WorkspaceDocument,
  onUpdateDocument: (doc: WorkspaceDocument) => void
) {
  const pdfData: PdfDocumentModel = useMemo(() => {
    // A byte payload owns its own shape: `pages` is empty because the page list comes from the renderer, and
    // the structured model deliberately claims no pages it has not parsed. The old fallback (`pages.length > 0`
    // or else the demonstration model) therefore replaced **every** freshly opened foreign PDF with the demo
    // pages — silently, on the first render.
    if (document.pdfData?.rawPdfDataUrl) return document.pdfData;
    if (document.pdfData?.pages && document.pdfData.pages.length > 0) {
      return document.pdfData;
    }
    return DEFAULT_PDF_MODEL;
  }, [document.pdfData]);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [studioNotice, setStudioNotice] = useState<PdfStudioNotice | null>(null);
  const noticeSequence = useRef(0);
  const notify = (message: string, tone: PdfStudioNotice['tone'] = 'info') => {
    noticeSequence.current += 1;
    setStudioNotice({ tone, message, seq: noticeSequence.current });
  };
  const dismissNotice = () => setStudioNotice(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [selectedHighlightColor, setSelectedHighlightColor] = useState<string>('#f59e0b');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [commentTargetText, setCommentTargetText] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [commentTargetPage, setCommentTargetPage] = useState<number>(1);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(
    () => new URLSearchParams(window.location.search).get('modal') === 'pdfSignature'
  );
  const [isSanitizeModalOpen, setIsSanitizeModalOpen] = useState(false);
  const [isAnnotationsDrawerOpen, setIsAnnotationsDrawerOpen] = useState(false);
  const [isFormFillerOpen, setIsFormFillerOpen] = useState(false);
  const [isAssemblerOpen, setIsAssemblerOpen] = useState(false);
  const documentHistory = usePdfDocumentHistory(document, onUpdateDocument);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const persistPdfData = (updated: PdfDocumentModel) => {
    // **Ein Schreibpfad, geprüft** (dieser Batch): Die Ablage läuft durch die kanonische Persistenzgrenze —
    // Nutzdaten-Schema, stabile IDs, Dokumentinvarianten, Schutzmetadaten und Schemaversion werden **vor** dem
    // Schreiben geprüft, und eine Ablehnung ist sichtbar (benannter Grund) statt still. Vorher entstand das
    // Dokument hier von Hand: `version + 1`, `onUpdateDocument` — ohne eine einzige Prüfung.
    let saved: WorkspaceDocument;
    try {
      saved = savePdfStudioDocument(document, updated);
    } catch (cause) {
      const message = cause instanceof PdfStudioPersistenceError
        ? `${cause.code} (${cause.path}): ${cause.detail}`
        : cause instanceof Error ? cause.message : 'Unbekannter Fehler';
      notify(`Die Änderung wurde nicht gespeichert — ${message}`, 'warning');
      return document;
    }
    // Der App-Stempel schreibt **dasselbe** kanonische Umschlagfeld mit **demselben** abgeleiteten Wert wie der
    // Plattform-Stempel in `savePdfStudioDocument`; der Aufruf ist deshalb idempotent. Er bleibt hier stehen,
    // weil `integrationSchemaAdoption.contract.test.mjs` genau diesen Aufruf an dieser Stelle misst.
    const stamped = withPdfStudioSchema(saved) as WorkspaceDocument;
    documentHistory.recordTransition(stamped);
    onUpdateDocument(stamped);
    return stamped;
  };
  const redactionWorkflow = usePdfRedactionWorkflow({
    documentTitle: document.title,
    pdfData,
    persistPdfData,
    setCurrentPage,
    onNotice: notify,
  });

  const scrollToPage = (pageNumber: number) => {
    const bounded = clampPdfStudioPage(pageNumber, pdfData.pages.length);
    setCurrentPage(bounded);
    const targetEl = pageRefs.current[bounded];
    if (targetEl && viewportRef.current) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleZoomChange = (level: number) => setZoomLevel(clampPdfStudioZoom(level));
  const handleZoomIn = () => setZoomLevel((current) => stepPdfStudioZoom(current, 1));
  const handleZoomOut = () => setZoomLevel((current) => stepPdfStudioZoom(current, -1));
  const handleZoomReset = () => setZoomLevel(100);

  const handleUpdateSectionContent = (pageNumber: number, sectionId: string, newContent: string) => {
    const updatedPages = pdfData.pages.map((pg) => {
      if (pg.pageNumber !== pageNumber) return pg;
      return {
        ...pg,
        sections: pg.sections.map((sec) =>
          sec.id === sectionId ? { ...sec, content: newContent } : sec
        ),
      };
    });
    persistPdfData({ ...pdfData, pages: updatedPages });
  };

  const handleUpdatePageMeta = (pageNumber: number, title: string, subtitle?: string) => {
    const updatedPages = pdfData.pages.map((pg) => {
      if (pg.pageNumber !== pageNumber) return pg;
      return {
        ...pg,
        title,
        ...(subtitle !== undefined ? { subtitle } : {}),
      };
    });
    persistPdfData({ ...pdfData, pages: updatedPages });
  };

  const handleApplyTextAnnotation = (type: 'highlight' | 'underline' | 'strike') => {
    const selectionContext = getPdfTextSelectionContext();
    if (!selectionContext) {
      notify(`No selectable PDF text is selected, so no ${type} annotation was added. Select text inside a page first.`, 'warning');
      return { applied: false as const, reason: 'no-selection' as const };
    }
    persistPdfData(addPdfReviewAnnotation(pdfData, {
      page: selectionContext.pageNumber,
      sectionId: selectionContext.sectionId,
      type,
      text: selectionContext.text,
      color: type === 'highlight' ? selectedHighlightColor : type === 'strike' ? '#f43f5e' : '#f59e0b',
      author: 'Local User',
    }));
    setCurrentPage(selectionContext.pageNumber);
    window.getSelection()?.removeAllRanges();
    notify(`${type === 'highlight' ? 'Highlight' : type === 'strike' ? 'Strikethrough' : 'Underline'} annotation added on page ${selectionContext.pageNumber}.`);
    return { applied: true as const, page: selectionContext.pageNumber };
  };

  /**
   * Copies the current PDF text selection.
   *
   * AST-0776/0779 ask for a copy action whose result is observable. The clipboard write cannot be verified
   * headlessly, so the return value carries the exact text and the notice says how much of it was handed to
   * the clipboard — the byte-level clipboard contents stay `NOT_TESTED`.
   */
  const handleCopySelection = async () => {
    const text = window.getSelection()?.toString() ?? '';
    if (!text.trim()) {
      notify('No PDF text is selected, so the clipboard was left unchanged.', 'warning');
      return { copied: false as const, reason: 'no-selection' as const, text: '' };
    }
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${text.length.toLocaleString()} character(s) of PDF text to the clipboard.`);
      return { copied: true as const, text };
    } catch (error) {
      notify(error instanceof Error ? `Clipboard write refused: ${error.message}` : 'Clipboard write refused.', 'warning');
      return { copied: false as const, reason: 'clipboard-refused' as const, text };
    }
  };

  const handleInitiateComment = () => {
    const selectionContext = getPdfTextSelectionContext();
    setCommentTargetText(selectionContext?.text || 'Selected Page Area');
    setCommentTargetPage(selectionContext?.pageNumber ?? currentPage);
    setCommentInput('');
    setIsCommentModalOpen(true);
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveComment = () => {
    if (!commentInput.trim()) {
      notify('A comment with no text was not saved.', 'warning');
      return { saved: false as const, reason: 'empty' as const };
    }
    persistPdfData(addPdfReviewAnnotation(pdfData, {
      page: commentTargetPage,
      type: 'comment',
      text: `${commentTargetText ? `"${commentTargetText.slice(0, 40)}...": ` : ''}${commentInput.trim()}`,
      color: '#f59e0b',
      author: 'Sovereign Reviewer',
      ...(commentTargetText ? { targetText: commentTargetText } : {}),
    }));
    setIsCommentModalOpen(false);
    setCommentInput('');
    notify(`Comment saved on page ${commentTargetPage}.`);
    return { saved: true as const, page: commentTargetPage };
  };

  const handleAddReviewAnnotation = (draft: PdfReviewAnnotationDraft) => {
    persistPdfData(addPdfReviewAnnotation(pdfData, draft));
    setCurrentPage(draft.page);
  };

  const handleReplyToAnnotation = (annotationId: string, text: string) => {
    persistPdfData(replyToPdfAnnotation(pdfData, annotationId, text, 'Local Reviewer'));
  };

  const handleSetAnnotationStatus = (annotationId: string, status: PdfAnnotationReviewStatus) => {
    persistPdfData(setPdfAnnotationStatus(pdfData, annotationId, status));
  };

  /**
   * Release Beta 0.1: exports are written natively on the desktop and only reported as saved after
   * the confirmed write. The browser fallback is reported as a download — never as a save.
   */
  const handleExportAnnotationSummary = async () => {
    const bytes = exportPdfAnnotationSummary(pdfData);
    const safe = (document.title || 'document').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'document';
    try {
      const delivery = await deliverExportBytes(bytes, {
        suggestedName: `${safe}.annotations.json`,
        extensions: ['json'],
        mimeType: 'application/json;charset=utf-8',
      });
      notify(delivery.mode === 'file'
        ? `Annotation summary saved: ${delivery.fileName}.`
        : `Annotation summary download started: ${delivery.fileName} (browser mode – no write confirmation).`);
    } catch (error) {
      notify(`Annotation summary export failed: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    }
  };

  const handleImportAnnotationSummary = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    persistPdfData(importPdfAnnotationSummary(pdfData, bytes));
  };

  const handleDeleteAnnotation = (annoId: string) => {
    persistPdfData({
      ...pdfData,
      annotations: pdfData.annotations.filter((a) => a.id !== annoId),
    });
  };

  const handleAddPage = () => {
    const newPageNumber = pdfData.pages.length + 1;
    persistPdfData(insertBlankPdfPage(pdfData, newPageNumber, `Page ${newPageNumber}`));
    setCurrentPage(newPageNumber);
  };

  const handleReorderPage = (sourcePage: number, targetPage: number) => {
    const updated = reorderPdfPage(pdfData, sourcePage, targetPage);
    persistPdfData(updated);
    setCurrentPage(Math.min(targetPage, updated.pages.length));
  };

  const handleRotatePage = (pageNumber: number) => {
    persistPdfData(rotatePdfPage(pdfData, pageNumber));
  };

  const handleDuplicatePage = (pageNumber: number) => {
    const updated = duplicatePdfPage(pdfData, pageNumber);
    persistPdfData(updated);
    setCurrentPage(Math.min(pageNumber + 1, updated.pages.length));
  };

  const handleDeletePage = (pageNumber: number) => {
    const updated = deletePdfPage(pdfData, pageNumber);
    if (updated === pdfData) {
      // The document refuses to drop its final page; say so instead of returning silently (AST-0809).
      notify('The last remaining page cannot be deleted. A PDF document must keep at least one page.', 'warning');
      return { deleted: false as const, reason: 'last-page' as const };
    }
    persistPdfData(updated);
    setCurrentPage(Math.min(pageNumber, updated.pages.length));
    notify(`Page ${pageNumber} deleted. Undo (Ctrl+Z) restores it.`);
    return { deleted: true as const, pageCount: updated.pages.length };
  };

  const handleApplySignature = (signerName: string, role: string, sealType: string, markType: PdfVisualMarkType) => {
    const newAnnotation = buildPdfVisualSignatureAnnotation(currentPage, signerName, role, sealType, markType);
    persistPdfData({ ...pdfData, annotations: [...pdfData.annotations, newAnnotation] });
  };

  const handleSanitizeMetadata = () => {
    persistPdfData({ ...pdfData, metadataSanitized: true });
  };

  const handleExportSanitizedCopy = async (request: PdfStructuredSanitizationRequest) => {
    const result = pdfData.rawPdfDataUrl
      ? await buildSanitizedForeignPdfCopy(document.title, pdfData, request)
      : buildSanitizedStructuredPdfCopy(document.title, pdfData, request);
    const safe = (result.exportTitle || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120);
    try {
      const delivery = await deliverExportBytes(result.bytes, {
        suggestedName: `${safe}_sanitized.pdf`,
        extensions: ['pdf'],
        mimeType: 'application/pdf',
        assertArtifact: assertPdfExportArtifact,
      });
      notify(delivery.mode === 'file'
        ? `Sanitized copy saved: ${delivery.fileName}.`
        : `Sanitized copy download started: ${delivery.fileName} (browser mode – no write confirmation).`);
    } catch (error) {
      notify(`Sanitized copy export failed: ${error instanceof Error ? error.message : String(error)}`, 'warning');
      throw error;
    }
    return result.report;
  };


  return {
    pdfData,
    zoomLevel,
    currentPage,
    activeTool,
    selectedHighlightColor,
    searchQuery,
    isCommentModalOpen,
    commentTargetText,
    commentInput,
    ...redactionWorkflow,
    isAuditModalOpen,
    isSignatureModalOpen,
    isSanitizeModalOpen,
    isAnnotationsDrawerOpen,
    isFormFillerOpen,
    isAssemblerOpen,
    studioNotice,
    notify,
    dismissNotice,
    viewportRef,
    pageRefs,
    setZoomLevel,
    setCurrentPage,
    setActiveTool,
    setSelectedHighlightColor,
    setSearchQuery,
    setIsCommentModalOpen,
    setCommentInput,
    setIsAuditModalOpen,
    setIsSignatureModalOpen,
    setIsSanitizeModalOpen,
    setIsAnnotationsDrawerOpen,
    setIsFormFillerOpen,
    setIsAssemblerOpen,
    persistPdfData,
    canUndo: documentHistory.canUndo,
    canRedo: documentHistory.canRedo,
    undo: documentHistory.undo,
    redo: documentHistory.redo,
    scrollToPage,
    handleZoomChange,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleUpdateSectionContent,
    handleUpdatePageMeta,
    handleApplyTextAnnotation,
    handleCopySelection,
    handleInitiateComment,
    handleSaveComment,
    handleAddReviewAnnotation,
    handleReplyToAnnotation,
    handleSetAnnotationStatus,
    handleExportAnnotationSummary,
    handleImportAnnotationSummary,
    handleDeleteAnnotation,
    handleAddPage,
    handleReorderPage,
    handleRotatePage,
    handleDuplicatePage,
    handleDeletePage,
    handleApplySignature,
    handleSanitizeMetadata,
    handleExportSanitizedCopy,
  };
}
