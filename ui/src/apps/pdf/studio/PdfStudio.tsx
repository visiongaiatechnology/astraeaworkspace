// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio authoritative Document viewer, editor and sovereign security suite

import React, { useEffect, useRef, useState } from 'react';
import './theme/pdfStudioTheme.css';
import { PdfStudioProps } from './types';
import { PdfToolbar } from './PdfToolbar';
import { PdfThumbnailsSidebar } from '../viewer/thumbnails/PdfThumbnailsSidebar';
import { PdfViewport } from '../viewer/PdfViewport';
import { PdfAnnotationsDrawer } from '../annotations/PdfAnnotationsDrawer';
import { PdfStudioModals } from './overlays/PdfStudioModals';
import { downloadStructuredPdf } from '../interchange/structuredPdfExport';
import { pdfExportDeliveryText, pdfExportFailureText } from '../interchange/pdfExportStatus';
import { usePdfStudioState } from './state/usePdfStudioState';
import { PdfNativeViewer } from '../viewer/PdfNativeViewer';
import { PdfWorkspaceIntegrationModal } from '../integrations/PdfWorkspaceIntegrationModal';
import { usePdfWorkspaceIntegration } from '../integrations/usePdfWorkspaceIntegration';
import { PdfCompareModal } from '../compare/PdfCompareModal';
import { PdfConversionModal } from '../interchange/PdfConversionModal';
import { PdfOptimizationModal } from '../optimization/PdfOptimizationModal';
import { PdfDirectContentEditorModal } from '../editing/PdfDirectContentEditorModal';
import { PdfPasswordProtectionModal } from '../security/encryption/PdfPasswordProtectionModal';
import { applySecurityWatermarkToPdf, createWorkspaceSecurityWatermarkContext } from '../security/watermark';
import { PdfNativeOpenPanel } from '../interchange/native/PdfNativeOpenPanel';
import { buildNativePdfDerivedDocument, type PdfNativeOpenSuccess } from '../interchange/native/openNativePdfPayload';
import { pdfWorkflowText } from '../locale/pdfWorkflowDialogsLocale';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { useWorkspaceUiScale } from '../../../shared/accessibility/workspaceUiScale';
import {
  pdfStudioShortcutConsumesBrowserDefault,
  resolvePdfStudioShortcut,
  stepPdfStudioPage,
} from './interactions/pdfStudioKeyboard';

export const PdfStudio: React.FC<PdfStudioProps> = ({
  document,
  onUpdateDocument,
  workspaceDocuments = [],
  onUpdateWorkspaceDocument,
  onCreateDerivedDocument,
  onOpenWorkspaceDocument,
  trustedTimestampProvider,
  networkCapability,
  onOpenExternalUrl,
}) => {
  const { locale } = useWorkspaceLocale();
  // "Skalierbare UI" is a Definition-of-Done item (`M05-Z1113`). The workspace scale is published on
  // the document root; both render paths of this studio follow it, structured and native.
  const uiScale = useWorkspaceUiScale();
  const {
    pdfData,
    zoomLevel,
    currentPage,
    activeTool,
    selectedHighlightColor,
    searchQuery,
    isCommentModalOpen,
    commentTargetText,
    commentInput,
    isRedactReasonModalOpen,
    selectedSectionForRedaction,
    selectedImageForRedaction,
    selectedRectangleForRedaction,
    redactionReason,
    redactionOverlayColor,
    redactionOverlayText,
    isAuditModalOpen,
    isTrueRedactionModalOpen,
    isSignatureModalOpen,
    isSanitizeModalOpen,
    isAnnotationsDrawerOpen,
    isFormFillerOpen,
    isAssemblerOpen,
    viewportRef,
    pageRefs,
    redactionCount,
    redactedSectionsCount,
    setActiveTool,
    setSelectedHighlightColor,
    setSearchQuery,
    setIsCommentModalOpen,
    setCommentInput,
    setIsRedactReasonModalOpen,
    setRedactionReason,
    setRedactionOverlayColor,
    setRedactionOverlayText,
    setIsAuditModalOpen,
    setIsTrueRedactionModalOpen,
    setIsSignatureModalOpen,
    setIsSanitizeModalOpen,
    setIsAnnotationsDrawerOpen,
    setIsFormFillerOpen,
    setIsAssemblerOpen,
    persistPdfData,
    canUndo,
    canRedo,
    undo,
    redo,
    scrollToPage,
    handleZoomChange,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    studioNotice,
    dismissNotice,
    notify,
    handleCopySelection,
    handleUpdateSectionContent,
    handleUpdatePageMeta,
    handleStageSectionRedaction,
    handleStageImageRedaction,
    handleStageRectangleRedaction,
    handleConfirmRedaction,
    handleRedactSelection,
    handleApplyDocumentRedaction,
    handleVerifiedRedactionExport,
    handleApplyTextAnnotation,
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
  } = usePdfStudioState(document, onUpdateDocument);

  // Schicht 2: Deep Engine Modal States
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isDigitalSignatureModalOpen, setIsDigitalSignatureModalOpen] = useState(false);
  const [isRoundtripModalOpen, setIsRoundtripModalOpen] = useState(false);
  const [isWorkspaceIntegrationOpen, setIsWorkspaceIntegrationOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isConversionOpen, setIsConversionOpen] = useState(false);
  const [isOptimizationOpen, setIsOptimizationOpen] = useState(false);
  const [isContentEditorOpen, setIsContentEditorOpen] = useState(false);
  const [isPasswordProtectionOpen, setIsPasswordProtectionOpen] = useState(false);
  const [isNativeOpenOpen, setIsNativeOpenOpen] = useState(false);
  // The copy control is only meaningful while text is selected, so the studio tracks that fact instead of
  // offering a button that silently does nothing (AST-0776).
  const [hasTextSelection, setHasTextSelection] = useState(false);
  useEffect(() => {
    const updateSelection = () => setHasTextSelection(Boolean(window.getSelection()?.toString().trim()));
    // `window.document`, because the component's `document` prop is a WorkspaceDocument and shadows the global.
    window.document.addEventListener('selectionchange', updateSelection);
    return () => window.document.removeEventListener('selectionchange', updateSelection);
  }, []);
  const securityWatermarkContext = createWorkspaceSecurityWatermarkContext(document);
  const outputPdfData = applySecurityWatermarkToPdf(pdfData, securityWatermarkContext);

  /**
   * Release Beta 0.1: the PDF toolbar export writes through the native save dialog + atomic export on
   * the desktop; the browser fallback remains a download. The studio notice states which happened and
   * a failed/cancelled export is named instead of disappearing.
   */
  const handleStudioPdfExport = async () => {
    try {
      const delivery = await downloadStructuredPdf(document.title, outputPdfData);
      notify(pdfExportDeliveryText(locale, delivery));
    } catch (error) {
      notify(pdfExportFailureText(locale, error), 'warning');
    }
  };

  /**
   * A foreign PDF is a **different** document, so it becomes a derived document through the canonical path the
   * shell already provides. Only when the host offers no derived-document channel does the payload replace this
   * document's payload — and then it goes through `persistPdfData`, i.e. through undo/redo and the persistence
   * gate, with a visible notice naming what happened.
   */
  const handleNativePdfOpened = (result: PdfNativeOpenSuccess) => {
    const pages = result.inspection.estimatedPageObjects || 0;
    const notice = pdfWorkflowText(locale, 'nativeOpen.opened', {
      name: result.fileName,
      pages: pages.toLocaleString(locale),
      sha256: result.inspection.sha256.slice(0, 12),
    });
    setIsNativeOpenOpen(false);
    if (onCreateDerivedDocument) {
      onCreateDerivedDocument(buildNativePdfDerivedDocument({
        createId: () => `pdf-${crypto.randomUUID()}`,
        payload: result.payload,
        fileName: result.fileName,
        now: Date.now(),
        themeId: document.theme_id,
      }) as Parameters<NonNullable<PdfStudioProps['onCreateDerivedDocument']>>[0]);
      notify(notice);
      return;
    }
    persistPdfData(result.payload);
    notify(`${notice} — ${pdfWorkflowText(locale, 'nativeOpen.hint')}`);
  };

  const workspaceIntegration = usePdfWorkspaceIntegration({
    source: document,
    workspaceDocuments,
    onUpdateWorkspaceDocument,
    onCreateDerivedDocument,
    onOpenWorkspaceDocument,
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const pageCount = pdfData.pages.length;
  const pageCountRef = useRef(pageCount);
  pageCountRef.current = pageCount;
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const command = resolvePdfStudioShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        editableTarget: Boolean(target?.closest('input, textarea, select, [contenteditable="true"]')),
      });
      if (command.kind === 'none') return;
      if (pdfStudioShortcutConsumesBrowserDefault(command)) event.preventDefault();
      switch (command.kind) {
        case 'undo': undo(); return;
        case 'redo': redo(); return;
        case 'page-next': scrollToPage(stepPdfStudioPage(currentPageRef.current, pageCountRef.current, 1)); return;
        case 'page-previous': scrollToPage(stepPdfStudioPage(currentPageRef.current, pageCountRef.current, -1)); return;
        case 'page-first': scrollToPage(1); return;
        case 'page-last': scrollToPage(pageCountRef.current); return;
        case 'zoom-in': handleZoomIn(); return;
        case 'zoom-out': handleZoomOut(); return;
        case 'zoom-reset': handleZoomReset(); return;
        case 'focus-search': searchInputRef.current?.focus(); searchInputRef.current?.select(); return;
        case 'copy-selection': void handleCopySelection(); return;
        case 'tool': setActiveTool(command.tool); return;
        default: return;
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [undo, redo, scrollToPage, handleZoomIn, handleZoomOut, handleZoomReset, handleCopySelection, setActiveTool]);

  // Arbitrary foreign PDFs remain byte-preserving and pass through the hostile-import boundary before this renderer is reached.
  const nativePdfDataUrl = document.pdfData?.rawPdfDataUrl;
  if (nativePdfDataUrl) {
    const raw = document.pdfData!;
    return (
      <div className="flex-1 flex flex-col min-h-0" style={uiScale.style} data-astraea-scale-percent={uiScale.scaleAttribute}>
        <PdfNativeViewer
          title={document.title}
          dataUrl={nativePdfDataUrl}
          fileName={raw.rawPdfFileName || document.title || 'document.pdf'}
          byteLength={raw.rawPdfByteLength || 0}
          inspection={raw.rawPdfInspection}
          onOpenWorkspaceIntegration={() => setIsWorkspaceIntegrationOpen(true)}
          onOpenExternalUrl={onOpenExternalUrl}
        />
        <PdfWorkspaceIntegrationModal
          isOpen={isWorkspaceIntegrationOpen}
          onClose={() => setIsWorkspaceIntegrationOpen(false)}
          source={document}
          workspaceDocuments={workspaceDocuments}
          onCreatePdfFromSource={workspaceIntegration.createPdfFromSource}
          onAnnotationsToTasks={workspaceIntegration.annotationsToTasks}
          onPagesToWorkspace={workspaceIntegration.pagesToWorkspace}
          onProtectInVault={workspaceIntegration.protectInVault}
        />
      </div>
    );
  }

  return (
    <div data-vgt-pdf-root="true" className="flex-1 flex flex-col h-full bg-[#0a0d14] text-slate-100 overflow-hidden" style={uiScale.style} data-astraea-scale-percent={uiScale.scaleAttribute}>
      {/* 1. TOP PDF STUDIO TOOLBAR */}
      <PdfToolbar
        currentPage={currentPage}
        totalPages={pdfData.pages.length}
        onScrollToPage={scrollToPage}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        onApplyHighlight={() => handleApplyTextAnnotation('highlight')}
        selectedHighlightColor={selectedHighlightColor}
        setSelectedHighlightColor={setSelectedHighlightColor}
        onApplyUnderline={() => handleApplyTextAnnotation('underline')}
        onApplyStrike={() => handleApplyTextAnnotation('strike')}
        onInitiateComment={handleInitiateComment}
        onRedactSelection={handleRedactSelection}
        onOpenTrueRedaction={() => setIsTrueRedactionModalOpen(true)}
        onVerifiedRedactionExport={() => {
          void handleVerifiedRedactionExport().catch((error) => window.alert(error instanceof Error ? error.message : 'Verified redaction export failed closed.'));
        }}
        onOpenSignatureModal={() => setIsSignatureModalOpen(true)}
        onOpenSanitizeModal={() => setIsSanitizeModalOpen(true)}
        onOpenFormFiller={() => setIsFormFillerOpen(true)}
        onOpenAssembler={() => setIsAssemblerOpen(true)}
        onOpenOcrModal={() => setIsOcrModalOpen(true)}
        onOpenDigitalSignatureModal={() => setIsDigitalSignatureModalOpen(true)}
        onOpenPasswordProtection={() => setIsPasswordProtectionOpen(true)}
        onOpenRoundtripModal={() => setIsRoundtripModalOpen(true)}
        onOpenWorkspaceIntegration={() => setIsWorkspaceIntegrationOpen(true)}
        onOpenCompare={() => setIsCompareOpen(true)}
        onOpenConversion={() => setIsConversionOpen(true)}
        onOpenOptimization={() => setIsOptimizationOpen(true)}
        onOpenContentEditor={() => setIsContentEditorOpen(true)}
        totalRedactionsCount={redactedSectionsCount + redactionCount}
        zoomLevel={zoomLevel}
        onZoomChange={handleZoomChange}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
        isAnnotationsDrawerOpen={isAnnotationsDrawerOpen}
        onToggleAnnotationsDrawer={() => setIsAnnotationsDrawerOpen(!isAnnotationsDrawerOpen)}
        onExportPdf={() => { void handleStudioPdfExport(); }}
        onOpenNativePdf={() => setIsNativeOpenOpen((open) => !open)}
        isNativeOpenPanelOpen={isNativeOpenOpen}
        onCopySelection={() => void handleCopySelection()}
        hasTextSelection={hasTextSelection}
      />

      {isNativeOpenOpen ? <PdfNativeOpenPanel onOpened={handleNativePdfOpened} onClose={() => setIsNativeOpenOpen(false)} /> : null}

      {/* 1b. VISIBLE FEEDBACK FOR EVERY REJECTED OR COMPLETED ACTION */}
      <div data-pdf-studio-notice={studioNotice ? studioNotice.tone : 'idle'} className="shrink-0">
        {studioNotice ? (
          <div
            role={studioNotice.tone === 'warning' ? 'alert' : 'status'}
            aria-live={studioNotice.tone === 'warning' ? 'assertive' : 'polite'}
            key={studioNotice.seq}
            className={`flex items-center justify-between gap-3 border-b px-3 py-1.5 text-[0.6875rem] ${studioNotice.tone === 'warning' ? 'border-amber-500/25 bg-amber-500/[0.08] text-amber-100' : 'border-blue-500/20 bg-blue-500/[0.06] text-blue-100'}`}
          >
            <span className="min-w-0 break-words">{studioNotice.message}</span>
            <button type="button" onClick={dismissNotice} aria-label="Dismiss PDF Studio message" className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[0.625rem] text-slate-300 hover:bg-white/10">Dismiss</button>
          </div>
        ) : null}
      </div>

      {/* 2. MAIN WORKSPACE VIEWPORT (Sidebar + Document Canvas + Annotations) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: PAGE THUMBNAILS SIDEBAR */}
        <PdfThumbnailsSidebar
          pages={pdfData.pages}
          currentPage={currentPage}
          onScrollToPage={scrollToPage}
          onAddPage={handleAddPage}
          annotations={pdfData.annotations}
          onReorderPage={handleReorderPage}
          onRotatePage={handleRotatePage}
          onDuplicatePage={handleDuplicatePage}
          onDeletePage={handleDeletePage}
        />

        {/* Center: PDF DOCUMENT VIEWPORT */}
        <PdfViewport
          pages={outputPdfData.pages}
          annotations={pdfData.annotations}
          formFields={pdfData.formFields ?? []}
          zoomLevel={zoomLevel}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTool={activeTool}
          onStageSectionRedaction={handleStageSectionRedaction}
          onStageImageRedaction={handleStageImageRedaction}
          onStageRectangleRedaction={handleStageRectangleRedaction}
          onUpdateSectionContent={handleUpdateSectionContent}
          onUpdatePageMeta={handleUpdatePageMeta}
          viewportRef={viewportRef}
          pageRefs={pageRefs}
          searchInputRef={searchInputRef}
        />

        {/* Right: ANNOTATIONS & COMMENTS DRAWER */}
        <PdfAnnotationsDrawer
          isOpen={isAnnotationsDrawerOpen}
          onClose={() => setIsAnnotationsDrawerOpen(false)}
          annotations={pdfData.annotations}
          currentPage={currentPage}
          totalPages={pdfData.pages.length}
          onScrollToPage={scrollToPage}
          onDeleteAnnotation={handleDeleteAnnotation}
          onCreateAnnotation={handleAddReviewAnnotation}
          onReply={handleReplyToAnnotation}
          onSetStatus={handleSetAnnotationStatus}
          onExportSummary={handleExportAnnotationSummary}
          onImportSummary={handleImportAnnotationSummary}
        />
      </div>

      {/* 3. ORCHESTRATED PDF STUDIO MODALS */}
      <PdfStudioModals
        documentTitle={document.title}
        currentPage={currentPage}
        pdfData={pdfData}
        securityWatermarkContext={securityWatermarkContext}
        persistPdfData={persistPdfData}
        isRedactReasonModalOpen={isRedactReasonModalOpen}
        setIsRedactReasonModalOpen={setIsRedactReasonModalOpen}
        selectedSectionForRedaction={selectedSectionForRedaction}
        selectedImageForRedaction={selectedImageForRedaction}
        selectedRectangleForRedaction={selectedRectangleForRedaction}
        redactionReason={redactionReason}
        setRedactionReason={setRedactionReason}
        redactionOverlayColor={redactionOverlayColor}
        setRedactionOverlayColor={setRedactionOverlayColor}
        redactionOverlayText={redactionOverlayText}
        setRedactionOverlayText={setRedactionOverlayText}
        handleConfirmRedaction={handleConfirmRedaction}
        isTrueRedactionModalOpen={isTrueRedactionModalOpen}
        setIsTrueRedactionModalOpen={setIsTrueRedactionModalOpen}
        handleApplyDocumentRedaction={handleApplyDocumentRedaction}
        isCommentModalOpen={isCommentModalOpen}
        setIsCommentModalOpen={setIsCommentModalOpen}
        commentTargetText={commentTargetText}
        commentInput={commentInput}
        setCommentInput={setCommentInput}
        handleSaveComment={handleSaveComment}
        isAuditModalOpen={isAuditModalOpen}
        setIsAuditModalOpen={setIsAuditModalOpen}
        redactedSectionsCount={redactedSectionsCount}
        redactionCount={redactionCount}
        isSignatureModalOpen={isSignatureModalOpen}
        setIsSignatureModalOpen={setIsSignatureModalOpen}
        handleApplySignature={handleApplySignature}
        isSanitizeModalOpen={isSanitizeModalOpen}
        setIsSanitizeModalOpen={setIsSanitizeModalOpen}
        handleSanitizeMetadata={handleSanitizeMetadata}
        handleExportSanitizedCopy={handleExportSanitizedCopy}
        isFormFillerOpen={isFormFillerOpen}
        setIsFormFillerOpen={setIsFormFillerOpen}
        isAssemblerOpen={isAssemblerOpen}
        setIsAssemblerOpen={setIsAssemblerOpen}
        currentDocumentId={document.id}
        workspaceDocuments={workspaceDocuments}
        onUpdateWorkspaceDocument={onUpdateWorkspaceDocument}
        isOcrModalOpen={isOcrModalOpen}
        setIsOcrModalOpen={setIsOcrModalOpen}
        isDigitalSignatureModalOpen={isDigitalSignatureModalOpen}
        setIsDigitalSignatureModalOpen={setIsDigitalSignatureModalOpen}
        isRoundtripModalOpen={isRoundtripModalOpen}
        setIsRoundtripModalOpen={setIsRoundtripModalOpen}
        trustedTimestampProvider={trustedTimestampProvider}
        networkCapability={networkCapability}
      />
      <PdfWorkspaceIntegrationModal
        isOpen={isWorkspaceIntegrationOpen}
        onClose={() => setIsWorkspaceIntegrationOpen(false)}
        source={document}
        workspaceDocuments={workspaceDocuments}
        onCreatePdfFromSource={workspaceIntegration.createPdfFromSource}
        onAnnotationsToTasks={workspaceIntegration.annotationsToTasks}
        onPagesToWorkspace={workspaceIntegration.pagesToWorkspace}
        onProtectInVault={workspaceIntegration.protectInVault}
      />
      <PdfCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        source={document}
        workspaceDocuments={workspaceDocuments}
      />
      <PdfConversionModal
        isOpen={isConversionOpen}
        onClose={() => setIsConversionOpen(false)}
        source={document}
        workspaceDocuments={workspaceDocuments}
      />
      <PdfDirectContentEditorModal
        isOpen={isContentEditorOpen}
        onClose={() => setIsContentEditorOpen(false)}
        pdfData={pdfData}
        onUpdate={persistPdfData}
        currentPage={currentPage}
      />

      <PdfPasswordProtectionModal
        isOpen={isPasswordProtectionOpen}
        onClose={() => setIsPasswordProtectionOpen(false)}
        documentTitle={document.title}
        pdfData={pdfData}
      />

      <PdfOptimizationModal
        isOpen={isOptimizationOpen}
        onClose={() => setIsOptimizationOpen(false)}
        source={document}
      />
    </div>
  );
};

export default PdfStudio;
