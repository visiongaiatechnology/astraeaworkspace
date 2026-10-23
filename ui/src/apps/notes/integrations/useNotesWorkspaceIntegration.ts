// STATUS: DIAMANT VGT SUPREME — Notes workspace integration dispatcher
import { useCallback } from 'react';
import type { NotePage, WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  createWriterDraftFromNote,
  createWriterDraftFromSelection,
  sendChecklistToTaskDocument,
  sendNoteAttachmentsToVault,
} from './notesWorkspaceActions';

interface NotesWorkspaceIntegrationOptions {
  sourceDocument: WorkspaceDocument;
  activePage: NotePage | null;
  workspaceDocuments: readonly WorkspaceDocument[];
  updateCurrentPage: (patch: Partial<NotePage>) => void;
  onUpdateWorkspaceDocument?: (document: WorkspaceDocument) => void;
  onCreateDerivedDocument?: (document: WorkspaceDocument) => void;
}

function requirePage(page: NotePage | null): NotePage {
  if (!page) throw new Error('No active note is available for this action.');
  return page;
}

function requireTarget(
  documents: readonly WorkspaceDocument[],
  targetDocumentId: string,
  acceptedKinds: readonly string[],
): WorkspaceDocument {
  const target = documents.find((document) => document.id === targetDocumentId);
  if (!target) throw new Error('The selected Workspace target is no longer available.');
  if (!acceptedKinds.includes(target.kind)) throw new Error(`Target must be ${acceptedKinds.join(' or ')}.`);
  return target;
}

export function useNotesWorkspaceIntegration({
  sourceDocument,
  activePage,
  workspaceDocuments,
  updateCurrentPage,
  onUpdateWorkspaceDocument,
  onCreateDerivedDocument,
}: NotesWorkspaceIntegrationOptions) {
  const persistPageLinks = useCallback((page: NotePage) => {
    updateCurrentPage({ workspaceLinks: page.workspaceLinks });
  }, [updateCurrentPage]);

  const requireWorkspaceUpdater = useCallback(() => {
    if (!onUpdateWorkspaceDocument) throw new Error('Workspace document mutation is unavailable in this host.');
    return onUpdateWorkspaceDocument;
  }, [onUpdateWorkspaceDocument]);

  const createWriterDraft = useCallback((selection?: string): string => {
    const page = requirePage(activePage);
    if (!onCreateDerivedDocument) throw new Error('Derived-document creation is unavailable in this host.');
    // AST-0736: with a selection the transfer is a copy of that passage plus a link back to the note;
    // without one it stays the whole-note draft.
    const result = selection && selection.trim()
      ? createWriterDraftFromSelection(sourceDocument, page, selection)
      : createWriterDraftFromNote(sourceDocument, page);
    onCreateDerivedDocument(result.draft);
    persistPageLinks(result.page);
    return selection && selection.trim()
      ? `Writer draft “${result.draft.title}” created from the selected passage with a canonical source-note link.`
      : `Writer draft “${result.draft.title}” created with a canonical source-note link.`;
  }, [activePage, onCreateDerivedDocument, persistPageLinks, sourceDocument]);

  const convertTasks = useCallback((lineIndices: readonly number[], targetDocumentId?: string): string => {
    const page = requirePage(activePage);
    const target = targetDocumentId
      ? requireTarget(workspaceDocuments, targetDocumentId, ['Tasks'])
      : undefined;
    const result = sendChecklistToTaskDocument(sourceDocument, page, lineIndices, target);
    if (target) requireWorkspaceUpdater()(result.target);
    else {
      if (!onCreateDerivedDocument) throw new Error('Derived-document creation is unavailable in this host.');
      onCreateDerivedDocument(result.target);
    }
    persistPageLinks(result.page);
    return `${result.count} checklist item${result.count === 1 ? '' : 's'} converted to canonical Tasks.`;
  }, [activePage, onCreateDerivedDocument, persistPageLinks, requireWorkspaceUpdater, sourceDocument, workspaceDocuments]);

  const sendVault = useCallback(async (targetDocumentId: string): Promise<string> => {
    const page = requirePage(activePage);
    const target = requireTarget(workspaceDocuments, targetDocumentId, ['Vault']);
    const result = await sendNoteAttachmentsToVault(page, target);
    requireWorkspaceUpdater()(result.target);
    persistPageLinks(result.page);
    return `${result.count} verified attachment${result.count === 1 ? '' : 's'} transferred to Vault.`;
  }, [activePage, persistPageLinks, requireWorkspaceUpdater, sourceDocument, workspaceDocuments]);


  return {
    createWriterDraft,
    convertTasks,
    sendVault,
  };
}
