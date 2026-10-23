// STATUS: DIAMANT VGT SUPREME — stable PDF Studio ↔ Workspace integration API.
// Cross-app callers remain on this facade while conversion and action responsibilities stay isolated.

import type { PdfPageModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { pdfAnnotationUri as pdfAnnotationUriCore, pdfDocumentUri as pdfDocumentUriCore, pdfPageUri as pdfPageUriCore } from './pdfWorkspaceAdapterSupport';
import { convertPdfAnnotationsToTasks as convertPdfAnnotationsToTasksCore, createPdfStudioFromWorkspaceSource as createPdfStudioFromWorkspaceSourceCore, createWorkspaceDocumentFromPdfPages as createWorkspaceDocumentFromPdfPagesCore, workspaceSourceToPdfPages as workspaceSourceToPdfPagesCore } from './pdfWorkspaceConversions';
import { storePdfDocumentInVault as storePdfDocumentInVaultCore } from './pdfWorkspaceActionService';

export function pdfDocumentUri(documentId: string): string {
  return pdfDocumentUriCore(documentId);
}

export function pdfPageUri(documentId: string, pageNumber: number): string {
  return pdfPageUriCore(documentId, pageNumber);
}

export function pdfAnnotationUri(documentId: string, annotationId: string): string {
  return pdfAnnotationUriCore(documentId, annotationId);
}

export function workspaceSourceToPdfPages(source: WorkspaceDocument): PdfPageModel[] {
  return workspaceSourceToPdfPagesCore(source);
}

/** Creates a real PdfStudio document from canonical Writer/Grid/Present/Notes/Whiteboard content. */
export function createPdfStudioFromWorkspaceSource(source: WorkspaceDocument): WorkspaceDocument {
  return createPdfStudioFromWorkspaceSourceCore(source);
}

export function convertPdfAnnotationsToTasks(
  source: WorkspaceDocument,
  target: WorkspaceDocument | undefined,
  annotationIds?: readonly string[],
): { target: WorkspaceDocument; count: number } {
  return convertPdfAnnotationsToTasksCore(source, target, annotationIds);
}

export function createWorkspaceDocumentFromPdfPages(
  source: WorkspaceDocument,
  pageNumbers: readonly number[],
  kind: 'Present' | 'Notes' | 'Whiteboard',
): WorkspaceDocument {
  return createWorkspaceDocumentFromPdfPagesCore(source, pageNumbers, kind);
}

export async function storePdfDocumentInVault(source: WorkspaceDocument, target: WorkspaceDocument): Promise<WorkspaceDocument> {
  return storePdfDocumentInVaultCore(source, target);
}

