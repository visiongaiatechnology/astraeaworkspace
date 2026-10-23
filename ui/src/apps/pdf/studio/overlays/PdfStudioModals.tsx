import React from 'react';
import { PdfDocumentModel, NetworkCapability, PdfPageBox, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { RedactReasonModal, CommentModal, RedactionAuditModal } from './PdfModals';
import { PdfSignatureModal, type PdfVisualMarkType } from '../../signatures/visual/PdfSignatureModal';
import { PdfMetadataSanitizerModal } from '../../security/metadata/PdfMetadataSanitizerModal';
import { PdfFormFillerModal } from '../../forms/PdfFormFillerModal';
import { PdfDocumentAssemblerModal } from '../../interchange/PdfDocumentAssemblerModal';
import { PdfOcrModal } from '../../ocr/PdfOcrModal';
import { PdfDigitalSignatureModal } from '../../signatures/PdfDigitalSignatureModal';
import { PdfRoundtripModal } from '../../testing/roundtrip/PdfRoundtripModal';
import { buildStructuredPdfBytes } from '../../interchange/structuredPdfExport';
import type { PdfTrustedTimestampProvider } from '../../signatures/timestamps/pdfRfc3161Timestamp';
import type { PdfStructuredSanitizationReport, PdfStructuredSanitizationRequest } from '../../security/sanitization/pdfStructuredSanitization';
import { PdfTrueRedactionModal, type PdfTrueRedactionRequest } from '../../security/redaction/PdfTrueRedactionModal';
import { applySecurityWatermarkToPdf, type SecurityWatermarkContext } from '../../security/watermark';

export interface PdfStudioModalsProps {
  documentTitle: string;
  currentPage: number;
  pdfData: PdfDocumentModel;
  securityWatermarkContext: SecurityWatermarkContext;
  persistPdfData: (updated: PdfDocumentModel) => void;

  // Redact Modal
  isRedactReasonModalOpen: boolean;
  setIsRedactReasonModalOpen: (open: boolean) => void;
  selectedSectionForRedaction: {
    pageNumber: number;
    sectionId: string;
    sampleText: string;
  } | null;
  selectedImageForRedaction: {
    pageNumber: number;
    imageId: string;
    rectangle: PdfPageBox;
    sampleText: string;
  } | null;
  selectedRectangleForRedaction: {
    pageNumber: number;
    rectangle: PdfPageBox;
    sampleText: string;
  } | null;
  redactionReason: string;
  setRedactionReason: (r: string) => void;
  redactionOverlayColor: string;
  setRedactionOverlayColor: (value: string) => void;
  redactionOverlayText: string;
  setRedactionOverlayText: (value: string) => void;
  handleConfirmRedaction: () => void;

  isTrueRedactionModalOpen: boolean;
  setIsTrueRedactionModalOpen: (open: boolean) => void;
  handleApplyDocumentRedaction: (request: PdfTrueRedactionRequest) => { matchCount: number; redactedCharacters: number };

  // Comment Modal
  isCommentModalOpen: boolean;
  setIsCommentModalOpen: (open: boolean) => void;
  commentTargetText: string;
  commentInput: string;
  setCommentInput: (v: string) => void;
  handleSaveComment: () => void;

  // Audit Modal
  isAuditModalOpen: boolean;
  setIsAuditModalOpen: (open: boolean) => void;
  redactedSectionsCount: number;
  redactionCount: number;

  // Visual Signature Modal
  isSignatureModalOpen: boolean;
  setIsSignatureModalOpen: (open: boolean) => void;
  handleApplySignature: (signerName: string, role: string, sealType: string, markType: PdfVisualMarkType) => void;

  // Metadata Sanitizer Modal
  isSanitizeModalOpen: boolean;
  setIsSanitizeModalOpen: (open: boolean) => void;
  handleSanitizeMetadata: () => void;
  handleExportSanitizedCopy: (request: PdfStructuredSanitizationRequest) => Promise<PdfStructuredSanitizationReport>;

  // Form Filler Modal
  isFormFillerOpen: boolean;
  setIsFormFillerOpen: (open: boolean) => void;

  // Assembler Modal
  isAssemblerOpen: boolean;
  setIsAssemblerOpen: (open: boolean) => void;
  currentDocumentId: string;
  workspaceDocuments: WorkspaceDocument[];
  onUpdateWorkspaceDocument?: (document: WorkspaceDocument) => void;

  // Schicht 2: OCR Modal
  isOcrModalOpen: boolean;
  setIsOcrModalOpen: (open: boolean) => void;

  // Schicht 2: Digital Signature Modal
  isDigitalSignatureModalOpen: boolean;
  setIsDigitalSignatureModalOpen: (open: boolean) => void;
  trustedTimestampProvider?: PdfTrustedTimestampProvider;
  networkCapability?: NetworkCapability;

  // Schicht 2: Roundtrip & Preflight Modal
  isRoundtripModalOpen: boolean;
  setIsRoundtripModalOpen: (open: boolean) => void;
}

export const PdfStudioModals: React.FC<PdfStudioModalsProps> = ({
  documentTitle,
  currentPage,
  pdfData,
  securityWatermarkContext,
  persistPdfData,
  isRedactReasonModalOpen,
  setIsRedactReasonModalOpen,
  selectedSectionForRedaction,
  selectedImageForRedaction,
  selectedRectangleForRedaction,
  redactionReason,
  setRedactionReason,
  redactionOverlayColor,
  setRedactionOverlayColor,
  redactionOverlayText,
  setRedactionOverlayText,
  handleConfirmRedaction,
  isTrueRedactionModalOpen,
  setIsTrueRedactionModalOpen,
  handleApplyDocumentRedaction,
  isCommentModalOpen,
  setIsCommentModalOpen,
  commentTargetText,
  commentInput,
  setCommentInput,
  handleSaveComment,
  isAuditModalOpen,
  setIsAuditModalOpen,
  redactedSectionsCount,
  redactionCount,
  isSignatureModalOpen,
  setIsSignatureModalOpen,
  handleApplySignature,
  isSanitizeModalOpen,
  setIsSanitizeModalOpen,
  handleSanitizeMetadata,
  handleExportSanitizedCopy,
  isFormFillerOpen,
  setIsFormFillerOpen,
  isAssemblerOpen,
  setIsAssemblerOpen,
  currentDocumentId,
  workspaceDocuments,
  onUpdateWorkspaceDocument,
  isOcrModalOpen,
  setIsOcrModalOpen,
  isDigitalSignatureModalOpen,
  setIsDigitalSignatureModalOpen,
  trustedTimestampProvider,
  networkCapability,
  isRoundtripModalOpen,
  setIsRoundtripModalOpen,
}) => {
  return (
    <>
      {/* MODAL 1: Redaction Reason & Confirmation */}
      <RedactReasonModal
        isOpen={isRedactReasonModalOpen}
        onClose={() => setIsRedactReasonModalOpen(false)}
        selectedSection={selectedSectionForRedaction}
        selectedImage={selectedImageForRedaction}
        selectedRectangle={selectedRectangleForRedaction}
        reason={redactionReason}
        setReason={setRedactionReason}
        overlayColor={redactionOverlayColor}
        setOverlayColor={setRedactionOverlayColor}
        overlayText={redactionOverlayText}
        setOverlayText={setRedactionOverlayText}
        onConfirm={handleConfirmRedaction}
      />


      <PdfTrueRedactionModal
        isOpen={isTrueRedactionModalOpen}
        onClose={() => setIsTrueRedactionModalOpen(false)}
        onApply={handleApplyDocumentRedaction}
      />

      {/* MODAL 2: Comment Sticky Note Creation */}
      <CommentModal
        isOpen={isCommentModalOpen}
        onClose={() => setIsCommentModalOpen(false)}
        targetText={commentTargetText}
        commentInput={commentInput}
        setCommentInput={setCommentInput}
        onSave={handleSaveComment}
      />

      {/* MODAL 3: Cryptographic Redaction Audit Certificate */}
      <RedactionAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        documentTitle={documentTitle}
        totalSanitizedBlocks={redactedSectionsCount + redactionCount}
        redactions={pdfData.redactions}
        redactedSectionsCount={redactedSectionsCount}
      />

      {/* MODAL 4: Visual Signature Stamp */}
      <PdfSignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        currentPage={currentPage}
        onApplySignature={handleApplySignature}
      />

      {/* MODAL 5: Anti-Forensic Metadata Sanitizer */}
      <PdfMetadataSanitizerModal
        isOpen={isSanitizeModalOpen}
        onClose={() => setIsSanitizeModalOpen(false)}
        documentTitle={documentTitle}
        pdfData={pdfData}
        onSanitize={handleSanitizeMetadata}
        onExportSanitized={handleExportSanitizedCopy}
      />

      {/* MODAL 6: Fill & Sign Form Fields */}
      <PdfFormFillerModal
        isOpen={isFormFillerOpen}
        pdfData={pdfData}
        onClose={() => setIsFormFillerOpen(false)}
        onUpdatePdfData={persistPdfData}
        networkCapability={networkCapability}
      />

      {/* MODAL 7: Page Assembler, Extraction & Watermark */}
      <PdfDocumentAssemblerModal
        isOpen={isAssemblerOpen}
        pdfData={pdfData}
        onClose={() => setIsAssemblerOpen(false)}
        onUpdatePdfData={(updated) => persistPdfData(updated)}
        currentDocumentId={currentDocumentId}
        workspaceDocuments={workspaceDocuments}
        onUpdateWorkspaceDocument={onUpdateWorkspaceDocument}
      />

      {/* MODAL 8: Local OCR & Searchable Layer Generator (Schicht 2) */}
      <PdfOcrModal
        isOpen={isOcrModalOpen}
        onClose={() => setIsOcrModalOpen(false)}
        pdfData={pdfData}
        onUpdatePdfData={persistPdfData}
      />

      {/* MODAL 9: Certificate-Based Digital PDF Signature & PAdES Seal (Schicht 2) */}
      <PdfDigitalSignatureModal
        isOpen={isDigitalSignatureModalOpen}
        onClose={() => setIsDigitalSignatureModalOpen(false)}
        documentTitle={documentTitle}
        currentPage={currentPage}
        getPdfBytes={() => buildStructuredPdfBytes(documentTitle, applySecurityWatermarkToPdf(pdfData, securityWatermarkContext))}
        trustedTimestampProvider={trustedTimestampProvider}
      />

      {/* MODAL 10: PDF Roundtrip, Diagnostics & Preflight Suite (Schicht 2) */}
      <PdfRoundtripModal
        isOpen={isRoundtripModalOpen}
        onClose={() => setIsRoundtripModalOpen(false)}
        documentTitle={documentTitle}
        pdfData={pdfData}
        securityWatermarkContext={securityWatermarkContext}
      />
    </>
  );
};
