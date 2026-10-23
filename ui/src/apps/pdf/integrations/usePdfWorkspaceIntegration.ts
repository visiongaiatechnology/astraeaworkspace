// STATUS: DIAMANT VGT SUPREME — UI orchestration for canonical PDF Studio cross-app actions.

import { useCallback } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  convertPdfAnnotationsToTasks,
  createPdfStudioFromWorkspaceSource,
  createWorkspaceDocumentFromPdfPages,
  storePdfDocumentInVault,
} from './pdfWorkspaceActions';

interface PdfWorkspaceIntegrationArgs {
  source: WorkspaceDocument;
  workspaceDocuments: WorkspaceDocument[];
  onUpdateWorkspaceDocument?: (document: WorkspaceDocument) => void;
  onCreateDerivedDocument?: (document: WorkspaceDocument) => void;
  onOpenWorkspaceDocument?: (documentId: string) => void;
}

function findTarget(documents: WorkspaceDocument[], documentId: string, kinds: WorkspaceDocument['kind'][]): WorkspaceDocument {
  const target = documents.find((document) => document.id === documentId);
  if (!target || !kinds.includes(target.kind)) throw new Error(`Select a ${kinds.join('/')} Workspace document.`);
  return target;
}

export function usePdfWorkspaceIntegration({
  source,
  workspaceDocuments,
  onUpdateWorkspaceDocument,
  onCreateDerivedDocument,
  onOpenWorkspaceDocument,
}: PdfWorkspaceIntegrationArgs) {
  const createPdfFromSource = useCallback((sourceDocumentId: string): string => {
    const input = findTarget(workspaceDocuments, sourceDocumentId, ['Writer', 'Grid', 'Present']);
    const created = createPdfStudioFromWorkspaceSource(input);
    if (!onCreateDerivedDocument) throw new Error('Workspace document creation is unavailable in this host.');
    onCreateDerivedDocument(created);
    onOpenWorkspaceDocument?.(created.id);
    return `Created “${created.title}” through the PDF Studio pipeline.`;
  }, [onCreateDerivedDocument, onOpenWorkspaceDocument, workspaceDocuments]);

  const annotationsToTasks = useCallback((targetDocumentId?: string): string => {
    const target = targetDocumentId ? findTarget(workspaceDocuments, targetDocumentId, ['Tasks']) : undefined;
    const result = convertPdfAnnotationsToTasks(source, target);
    if (target) {
      if (!onUpdateWorkspaceDocument) throw new Error('Workspace target mutation is unavailable in this host.');
      onUpdateWorkspaceDocument(result.target);
    } else {
      if (!onCreateDerivedDocument) throw new Error('Workspace document creation is unavailable in this host.');
      onCreateDerivedDocument(result.target);
    }
    return `${result.count} PDF review annotation${result.count === 1 ? '' : 's'} converted to canonical Tasks.`;
  }, [onCreateDerivedDocument, onUpdateWorkspaceDocument, source, workspaceDocuments]);

  const pagesToWorkspace = useCallback((pageNumbers: number[], kind: 'Present' | 'Notes' | 'Whiteboard'): string => {
    if (!onCreateDerivedDocument) throw new Error('Workspace document creation is unavailable in this host.');
    const target = createWorkspaceDocumentFromPdfPages(source, pageNumbers, kind);
    onCreateDerivedDocument(target);
    return `${pageNumbers.length} selected PDF page${pageNumbers.length === 1 ? '' : 's'} linked into ${kind}.`;
  }, [onCreateDerivedDocument, source]);

  const protectInVault = useCallback(async (targetDocumentId: string): Promise<string> => {
    if (!onUpdateWorkspaceDocument) throw new Error('Workspace target mutation is unavailable in this host.');
    const target = findTarget(workspaceDocuments, targetDocumentId, ['Vault']);
    const updated = await storePdfDocumentInVault(source, target);
    onUpdateWorkspaceDocument(updated);
    return `Stored PDF Workspace document version ${source.version} in Vault with SHA-256 integrity metadata.`;
  }, [onUpdateWorkspaceDocument, source, workspaceDocuments]);

  return {
    createPdfFromSource,
    annotationsToTasks,
    pagesToWorkspace,
    protectInVault,
  };
}
