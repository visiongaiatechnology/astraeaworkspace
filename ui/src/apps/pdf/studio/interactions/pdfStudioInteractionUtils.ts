// STATUS: DIAMANT VGT SUPREME
// Small interaction primitives shared by the PDF Studio state hook.

import type { PdfAnnotation } from '../../../../shared/contracts/workspace';
import type { PdfVisualMarkType } from '../../signatures/visual/PdfSignatureModal';

export interface PdfTextSelectionContext {
  text: string;
  pageNumber: number;
  sectionId: string;
}

export function getPdfTextSelectionContext(): PdfTextSelectionContext | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';
  if (!selection || selection.rangeCount === 0 || !text) return null;
  const containerForNode = (node: Node | null): HTMLElement | SVGElement | null => {
    if (!node) return null;
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return element?.closest<HTMLElement | SVGElement>('[data-pdf-section-id][data-pdf-page]') ?? null;
  };
  const anchor = containerForNode(selection.anchorNode);
  const focus = containerForNode(selection.focusNode);
  if (!anchor || !focus || anchor !== focus) return null;
  const pageNumber = Number(anchor.dataset.pdfPage);
  const sectionId = anchor.dataset.pdfSectionId ?? '';
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !sectionId) return null;
  return { text, pageNumber, sectionId };
}

/**
 * Monotonic per-process sequence for visual signature marks.
 *
 * The identity used to be `sig-${now}`. Two stamps applied inside the same millisecond — a double click, a
 * scripted signer, a "sign every page" loop — therefore produced **two annotations with the same id**, which
 * collapses React keys, makes `deleteAnnotation` remove both and lets a reply attach to the wrong mark.
 * `Date.now()` alone is not an identity.
 */
let visualSignatureSequence = 0;

export function buildPdfVisualSignatureAnnotation(
  currentPage: number,
  signerName: string,
  role: string,
  sealType: string,
  markType: PdfVisualMarkType,
  now = Date.now(),
): PdfAnnotation {
  visualSignatureSequence += 1;
  const initials = signerName.split(/\s+/).filter(Boolean).slice(0, 4).map((part) => part[0]?.toUpperCase() ?? '').join('');
  const visualValue = markType === 'initial' ? initials || signerName.toUpperCase() : signerName.toUpperCase();
  return {
    id: `sig-${now}-${visualSignatureSequence}`,
    page: currentPage,
    type: 'comment',
    text: `[VISUAL ${markType.toUpperCase()} · ${visualValue} (${role}) · SEAL: ${sealType.toUpperCase()} · NOT A CRYPTOGRAPHIC PDF SIGNATURE]`,
    color: sealType === 'emerald' ? '#10b981' : sealType === 'cyan' ? '#3b82f6' : '#f59e0b',
    author: signerName,
    createdAt: now,
  };
}
