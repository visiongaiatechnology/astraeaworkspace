// STATUS: PLATIN — isolates Workspace Fabric shell actions while preserving document transactions and autosave ownership.
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  applyWorkspaceTransfer,
  breakFabricLink,
  freezeFabricReference,
  openFabricSource,
  planWorkspaceTransfer,
  refreshFabricReference,
  relinkFabricReference,
  scanFabricLinks,
  type FabricLink,
  type FabricTransferChoice,
} from '../../shared/workspace-interaction/fabric';
import type { WorkspaceOperationEngine } from '../../platform/workspace/operations/workspaceOperationEngine';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';

interface WorkspaceFabricActionsOptions {
  documents: Record<string, WorkspaceDocument>;
  setDocuments: Dispatch<SetStateAction<Record<string, WorkspaceDocument>>>;
  activeDocumentId: string;
  operationEngine: WorkspaceOperationEngine;
  markDocumentDirty: (documentId: string) => void;
  openDocument: (documentId: string) => void;
  setFabricOpen: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string) => void;
}

export function useWorkspaceFabricActions({
  documents,
  setDocuments,
  activeDocumentId,
  operationEngine,
  markDocumentDirty,
  openDocument,
  setFabricOpen,
  showToast,
}: WorkspaceFabricActionsOptions) {
  const fabricLinks = scanFabricLinks(documents);

  const markFabricDocumentsDirty = useCallback((documentIds: readonly string[]) => {
    for (const documentId of documentIds) markDocumentDirty(documentId);
  }, [markDocumentDirty]);

  const handleFabricOpenSource = useCallback((link: FabricLink) => {
    try {
      const source = openFabricSource(documents, link.targetDocId, link.targetRefId);
      openDocument(source.documentId);
      setFabricOpen(false);
      showToast(`Opened Fabric source: ${source.document.title}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Workspace Fabric source could not be opened.');
    }
  }, [documents, openDocument, setFabricOpen, showToast]);

  const handleFabricRefresh = useCallback((link: FabricLink) => {
    setDocuments((previous) => {
      try {
        const result = refreshFabricReference(previous, link.targetDocId, link.targetRefId);
        const committed = operationEngine.commitDocumentMapTransition(previous, result.updatedDocs, 'Workspace Fabric refresh');
        markFabricDocumentsDirty(committed.touchedDocumentIds);
        showToast(committed.touchedDocumentIds.length ? 'Workspace Fabric link refreshed.' : 'Frozen Fabric links do not refresh.');
        return committed.documents;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Workspace Fabric refresh failed.');
        return previous;
      }
    });
  }, [markFabricDocumentsDirty, operationEngine, setDocuments, showToast]);

  const handleFabricFreeze = useCallback((link: FabricLink) => {
    setDocuments((previous) => {
      try {
        const result = freezeFabricReference(previous, link.targetDocId, link.targetRefId);
        const committed = operationEngine.commitDocumentMapTransition(previous, result.updatedDocs, 'Workspace Fabric freeze');
        markFabricDocumentsDirty(committed.touchedDocumentIds);
        showToast('Workspace Fabric link frozen to a semantic snapshot.');
        return committed.documents;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Workspace Fabric freeze failed.');
        return previous;
      }
    });
  }, [markFabricDocumentsDirty, operationEngine, setDocuments, showToast]);

  const handleFabricBreakLink = useCallback((link: FabricLink) => {
    setDocuments((previous) => {
      try {
        const result = breakFabricLink(previous, link.targetDocId, link.targetRefId);
        const committed = operationEngine.commitDocumentMapTransition(previous, result.updatedDocs, 'Workspace Fabric break link');
        markFabricDocumentsDirty(committed.touchedDocumentIds);
        showToast('Workspace Fabric link broken; current semantic content is now an owned copy.');
        return committed.documents;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Workspace Fabric link could not be broken.');
        return previous;
      }
    });
  }, [markFabricDocumentsDirty, operationEngine, setDocuments, showToast]);

  const handleFabricRelink = useCallback((link: FabricLink, sourceDocumentId: string, sourceObjectId: string) => {
    setDocuments((previous) => {
      try {
        const result = relinkFabricReference(previous, link.targetDocId, link.targetRefId, sourceDocumentId, sourceObjectId);
        const committed = operationEngine.commitDocumentMapTransition(previous, result.updatedDocs, 'Workspace Fabric relink');
        markFabricDocumentsDirty(committed.touchedDocumentIds);
        showToast('Workspace Fabric reference relinked.');
        return committed.documents;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Workspace Fabric relink failed.');
        return previous;
      }
    });
  }, [markFabricDocumentsDirty, operationEngine, setDocuments, showToast]);

  const handleFabricInsertFromWorkspace = useCallback((sourceDocumentId: string, sourceObjectId: string, choice: FabricTransferChoice) => {
    setDocuments((previous) => {
      try {
        const plan = planWorkspaceTransfer(previous, sourceDocumentId, sourceObjectId, activeDocumentId);
        const objectId = `fabric-${crypto.randomUUID()}`;
        const result = applyWorkspaceTransfer(previous, plan, choice, { targetObjectId: objectId });
        const committed = operationEngine.commitDocumentMapTransition(previous, result.updatedDocs, `Workspace Fabric ${choice}`);
        markFabricDocumentsDirty(committed.touchedDocumentIds);
        showToast(choice === 'LiveLink' ? 'Live Workspace object inserted.' : 'Workspace object pasted as an owned copy.');
        return committed.documents;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Insert From Workspace failed.');
        return previous;
      }
    });
  }, [activeDocumentId, markFabricDocumentsDirty, operationEngine, setDocuments, showToast]);

  return {
    fabricLinks,
    handleFabricOpenSource,
    handleFabricRefresh,
    handleFabricFreeze,
    handleFabricBreakLink,
    handleFabricRelink,
    handleFabricInsertFromWorkspace,
  };
}
