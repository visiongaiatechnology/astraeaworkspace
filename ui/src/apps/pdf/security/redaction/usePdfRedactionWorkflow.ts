// STATUS: DIAMANT VGT SUPREME — isolated PDF redaction orchestration.

import { useState } from 'react';
import type { PdfDocumentModel, PdfPageBox, PdfRedaction, PdfSectionModel } from '../../../../shared/contracts/workspace';
import { getPdfTextSelectionContext } from '../../studio/interactions/pdfStudioInteractionUtils';
import { redactPhraseInSection } from './pdfModelOps';
import {
  buildVerifiedRedactedStructuredPdfBytes,
  buildVerifiedRedactedStructuredPdfBytesWithImages,
  redactStructuredPdfPattern,
  type PdfRedactionPatternRequest,
} from './pdfTrueRedaction';
import { redactStructuredPdfImageRectangle } from './pdfImageRedaction';
import { redactStructuredPdfRectangle } from './pdfRectangleRedaction';
import { deliverExportBytes } from '../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../platform/rendering/documentPdfExport';

interface PdfRedactionWorkflowOptions {
  documentTitle: string;
  pdfData: PdfDocumentModel;
  persistPdfData: (model: PdfDocumentModel) => void;
  setCurrentPage: (page: number) => void;
  /**
   * Visible-feedback channel. Optional so the hook stays usable on its own in tests; PDF Studio always
   * supplies it. Every rejected redaction path below reported nothing before: no selection, no occurrence,
   * a section that was already redacted (AST-0854/AST-0859).
   */
  onNotice?: (message: string, tone?: 'info' | 'warning') => void;
}

export function usePdfRedactionWorkflow({ documentTitle, pdfData, persistPdfData, setCurrentPage, onNotice }: PdfRedactionWorkflowOptions) {
  const [isRedactReasonModalOpen, setIsRedactReasonModalOpen] = useState(false);
  const [selectedSectionForRedaction, setSelectedSectionForRedaction] = useState<{ pageNumber: number; sectionId: string; sampleText: string } | null>(null);
  const [selectedImageForRedaction, setSelectedImageForRedaction] = useState<{ pageNumber: number; imageId: string; rectangle: PdfPageBox; sampleText: string } | null>(null);
  const [selectedRectangleForRedaction, setSelectedRectangleForRedaction] = useState<{ pageNumber: number; rectangle: PdfPageBox; sampleText: string } | null>(null);
  const [redactionReason, setRedactionReason] = useState('Confidential Enclave Secret / PII');
  const [redactionOverlayColor, setRedactionOverlayColor] = useState('#000000');
  const [redactionOverlayText, setRedactionOverlayText] = useState('REDACTED');
  const [isTrueRedactionModalOpen, setIsTrueRedactionModalOpen] = useState(false);
  const [redactionVerificationTargets, setRedactionVerificationTargets] = useState<string[]>([]);
  const [redactionImageVerificationHashes, setRedactionImageVerificationHashes] = useState<string[]>([]);

  const openReason = () => setIsRedactReasonModalOpen(true);
  const clearTargets = () => {
    setSelectedSectionForRedaction(null);
    setSelectedImageForRedaction(null);
    setSelectedRectangleForRedaction(null);
  };

  const handleStageSectionRedaction = (pageNumber: number, section: PdfSectionModel) => {
    if (section.isRedacted) {
      onNotice?.(`Section ${section.id} on page ${pageNumber} is already redacted; nothing was staged.`, 'warning');
      return;
    }
    clearTargets();
    setSelectedSectionForRedaction({ pageNumber, sectionId: section.id, sampleText: section.content });
    openReason();
  };

  const handleStageImageRedaction = (pageNumber: number, imageId: string, rectangle: PdfPageBox) => {
    const page = pdfData.pages.find((candidate) => candidate.pageNumber === pageNumber);
    const image = (page?.images ?? []).find((candidate) => candidate.id === imageId);
    if (!image) return;
    clearTargets();
    setSelectedImageForRedaction({
      pageNumber,
      imageId,
      rectangle,
      sampleText: `Image ${imageId} · x=${rectangle.x.toFixed(1)}, y=${rectangle.y.toFixed(1)}, ${rectangle.width.toFixed(1)}×${rectangle.height.toFixed(1)} pt`,
    });
    openReason();
  };

  const handleStageRectangleRedaction = (pageNumber: number, rectangle: PdfPageBox) => {
    clearTargets();
    setSelectedRectangleForRedaction({
      pageNumber,
      rectangle,
      sampleText: `Page ${pageNumber} rectangle · x=${rectangle.x.toFixed(1)}, y=${rectangle.y.toFixed(1)}, ${rectangle.width.toFixed(1)}×${rectangle.height.toFixed(1)} pt`,
    });
    openReason();
  };

  const handleConfirmRedaction = () => {
    if (selectedRectangleForRedaction) {
      const pending = selectedRectangleForRedaction;
      setIsRedactReasonModalOpen(false);
      clearTargets();
      void redactStructuredPdfRectangle(pdfData, {
        pageNumber: pending.pageNumber,
        rectangle: pending.rectangle,
        reason: redactionReason,
        overlayColor: redactionOverlayColor,
        overlayText: redactionOverlayText,
      }).then((result) => {
        persistPdfData(result.model);
        setRedactionVerificationTargets((targets) => [...new Set([...targets, ...result.verificationTargets])]);
        setRedactionImageVerificationHashes((hashes) => [...new Set([...hashes, ...result.originalImageSha256])]);
        setCurrentPage(pending.pageNumber);
      }).catch((error) => window.alert(error instanceof Error ? error.message : 'Rectangle redaction failed closed.'));
      return;
    }

    if (selectedImageForRedaction) {
      const pending = selectedImageForRedaction;
      setIsRedactReasonModalOpen(false);
      clearTargets();
      void redactStructuredPdfImageRectangle(pdfData, {
        pageNumber: pending.pageNumber,
        imageId: pending.imageId,
        rectangle: pending.rectangle,
        reason: redactionReason,
        overlayColor: redactionOverlayColor,
        overlayText: redactionOverlayText,
      }).then((result) => {
        persistPdfData(result.model);
        setRedactionImageVerificationHashes((hashes) => [...new Set([...hashes, result.originalSha256])]);
        setCurrentPage(pending.pageNumber);
      }).catch((error) => window.alert(error instanceof Error ? error.message : 'Image redaction failed closed.'));
      return;
    }

    if (!selectedSectionForRedaction) return;
    const { pageNumber, sectionId } = selectedSectionForRedaction;
    let scrubbedBytesCount = 0;
    const updatedPages = pdfData.pages.map((page) => page.pageNumber !== pageNumber ? page : {
      ...page,
      sections: page.sections.map((section) => {
        if (section.id !== sectionId) return section;
        scrubbedBytesCount = section.content.length;
        return {
          ...section,
          content: '█'.repeat(Math.max(16, Math.min(section.content.length, 60))),
          isRedacted: true,
          isMarkedForRedaction: false,
          redactionReason,
          originalContent: undefined,
        };
      }),
    });
    const redaction: PdfRedaction = {
      id: `redact-${Date.now()}`,
      page: pageNumber,
      x: 40,
      y: 100,
      width: 500,
      height: 40,
      reason: redactionReason,
      isApplied: true,
      targetText: `[${scrubbedBytesCount} CHARACTERS REDACTED]`,
      timestamp: Date.now(),
    };
    persistPdfData({ ...pdfData, pages: updatedPages, redactions: [...pdfData.redactions, redaction] });
    const original = selectedSectionForRedaction.sampleText.trim();
    if (original) setRedactionVerificationTargets((targets) => [...new Set([...targets, original])]);
    setIsRedactReasonModalOpen(false);
    clearTargets();
    onNotice?.(`Section redacted on page ${pageNumber}. Use the verified redaction export to write a checked copy.`);
  };

  const handleRedactSelection = () => {
    const selectionContext = getPdfTextSelectionContext();
    if (!selectionContext) {
      onNotice?.('No PDF text is selected, so no targeted redaction was applied. Select text inside a page first.', 'warning');
      return { applied: false as const, reason: 'no-selection' as const, occurrences: 0 };
    }
    const result = redactPhraseInSection(pdfData, selectionContext.pageNumber, selectionContext.sectionId, selectionContext.text, 'Targeted Sensitive Phrase Sanitized');
    if (result.occurrences === 0) {
      onNotice?.('The selected text was not found in the page model, so nothing was redacted. Re-select inside the page text.', 'warning');
      return { applied: false as const, reason: 'not-found' as const, occurrences: 0 };
    }
    persistPdfData(result.model);
    setRedactionVerificationTargets((targets) => [...new Set([...targets, selectionContext.text])]);
    setCurrentPage(selectionContext.pageNumber);
    window.getSelection()?.removeAllRanges();
    onNotice?.(`${result.occurrences} occurrence(s) redacted on page ${selectionContext.pageNumber}.`);
    return { applied: true as const, occurrences: result.occurrences, page: selectionContext.pageNumber };
  };

  const handleApplyDocumentRedaction = (request: PdfRedactionPatternRequest) => {
    const result = redactStructuredPdfPattern(pdfData, request);
    if (result.matchCount > 0) {
      persistPdfData(result.model);
      setRedactionVerificationTargets((targets) => [...new Set([...targets, ...result.verificationTargets])]);
    } else {
      // A pattern that matches nothing used to look exactly like a successful redaction (AST-0854).
      onNotice?.(`No match for the redaction pattern, so the document is unchanged. Check the pattern, the mode (literal vs regex) and the case sensitivity.`, 'warning');
    }
    return { matchCount: result.matchCount, redactedCharacters: result.redactedCharacters };
  };

  const handleVerifiedRedactionExport = async () => {
    if (pdfData.redactions.length > 0 && redactionVerificationTargets.length === 0 && redactionImageVerificationHashes.length === 0) {
      throw new Error('Verified redaction export is unavailable after verification targets have been lost from memory. Re-apply the redactions in this session.');
    }
    const verified = redactionImageVerificationHashes.length > 0
      ? await buildVerifiedRedactedStructuredPdfBytesWithImages(documentTitle, pdfData, redactionVerificationTargets, redactionImageVerificationHashes)
      : buildVerifiedRedactedStructuredPdfBytes(documentTitle, pdfData, redactionVerificationTargets);
    const safe = (documentTitle || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120);
    // Release Beta 0.1: the desktop confirms the write; the browser fallback stays a download.
    const delivery = await deliverExportBytes(verified.bytes, {
      suggestedName: `${safe}_redacted_verified.pdf`,
      extensions: ['pdf'],
      mimeType: 'application/pdf',
      assertArtifact: assertPdfExportArtifact,
    });
    onNotice?.(delivery.mode === 'file'
      ? `Verified redaction export saved: ${delivery.fileName}.`
      : `Verified redaction download started: ${delivery.fileName} (browser mode – no write confirmation).`);
    return verified.report;
  };

  const redactionCount = pdfData.redactions.length;
  const redactedSectionsCount = pdfData.pages.reduce((count, page) => count + page.sections.filter((section) => section.isRedacted).length, 0);

  return {
    isRedactReasonModalOpen,
    selectedSectionForRedaction,
    selectedImageForRedaction,
    selectedRectangleForRedaction,
    redactionReason,
    redactionOverlayColor,
    redactionOverlayText,
    isTrueRedactionModalOpen,
    redactionCount,
    redactedSectionsCount,
    setIsRedactReasonModalOpen,
    setRedactionReason,
    setRedactionOverlayColor,
    setRedactionOverlayText,
    setIsTrueRedactionModalOpen,
    handleStageSectionRedaction,
    handleStageImageRedaction,
    handleStageRectangleRedaction,
    handleConfirmRedaction,
    handleRedactSelection,
    handleApplyDocumentRedaction,
    handleVerifiedRedactionExport,
  };
}
