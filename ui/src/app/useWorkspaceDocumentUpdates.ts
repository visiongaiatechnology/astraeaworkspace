// STATUS: PLATIN — coordinates document edits, cross-app projections, Fabric propagation, and one history commit.
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { WorkspaceDocument } from '../shared/contracts/workspace';
import { propagateFabricUpdates } from '../shared/workspace-interaction/fabric';
import { refreshWriterGridLinks } from '../apps/writer/integrations/grid/writerGridLink';
import { refreshWriterWorkspaceEmbeds } from '../apps/writer/public/workspace/writerWorkspaceIntegration';
import type { WorkspaceOperationEngine } from '../platform/workspace/operations/workspaceOperationEngine';
import { stampWorkspaceDocumentSchema } from '../platform/workspace/integrations/workspaceDocumentStamp';
import { mayPropagateSharing } from './liveLinkSharingCache';

interface WorkspaceDocumentUpdatesOptions {
  readonly operationEngine: WorkspaceOperationEngine;
  readonly markDocumentDirty: (documentId: string) => void;
  readonly setDocuments: Dispatch<SetStateAction<Record<string, WorkspaceDocument>>>;
  readonly showToast: (message: string) => void;
}

export function useWorkspaceDocumentUpdates({
  operationEngine,
  markDocumentDirty,
  setDocuments,
  showToast,
}: WorkspaceDocumentUpdatesOptions) {
  return useCallback((incomingDoc: WorkspaceDocument) => {
    // **Der Umschlag wird hier gestempelt — an genau einer Stelle** (Integration & Release, Paket 1+2).
    // Die Schema-Version gehört zum Dokument-Umschlag, nicht in elf Apps mit zusammen dutzenden Speicherpunkten
    // (Grid allein hat fünf). `stampWorkspaceDocumentSchema` wirft **nie**: ein unbekannter Dokumenttyp wird
    // durchgelassen und gezählt, denn ein nicht gespeichertes Dokument wäre schlimmer als eines ohne
    // Versionsangabe. Abgelehnt wird beim **Lesen**, nicht beim Schreiben.
    // **The sharing boundary, enforced before anything propagates.** `setDocuments` below is a React state
    // updater and must stay pure and synchronous, so the decision is taken here — from a synchronous cache of
    // the engine's last answer (`liveLinkSharingCache`) — and the updater only obeys the captured boolean.
    //
    // Fail-closed by construction: an empty cache refuses (`POLICY_UNANSWERED`), and so does anything that is
    // not an explicit `Allow`. `sharing.write` is one of three boundaries with no enforcement point (round
    // 170); this closes that one, not the other two.
    const sharing = mayPropagateSharing();
    const updatedDoc = stampWorkspaceDocumentSchema(incomingDoc).document as WorkspaceDocument;
    setDocuments((previous) => {
      let newDocs = { ...previous, [updatedDoc.id]: updatedDoc };
      let propagatedCount = 0;
      for (const [objectId, object] of Object.entries(updatedDoc.objects)) {
        if (object.type === 'Chart' || object.type === 'Table') {
          const propagated = propagateFabricUpdates(
            updatedDoc.id,
            objectId,
            object,
            newDocs,
          );
          newDocs = propagated.updatedDocs;
          propagatedCount += propagated.count;
        }
        if (sharing.allowed && object.type === 'Table' && updatedDoc.kind === 'Grid') {
          for (const [documentId, candidate] of Object.entries(newDocs)) {
            const refreshed = refreshWriterGridLinks(candidate, updatedDoc, objectId);
            if (refreshed.updatedCount > 0) {
              newDocs = { ...newDocs, [documentId]: refreshed.document };
              propagatedCount += refreshed.updatedCount;
              markDocumentDirty(documentId);
            }
          }
        }
      }
      if (sharing.allowed) {
        for (const [documentId, candidate] of Object.entries(newDocs)) {
          if (documentId === updatedDoc.id) continue;
          const refreshed = refreshWriterWorkspaceEmbeds(candidate, updatedDoc);
          if (refreshed.updatedCount > 0) {
            newDocs = { ...newDocs, [documentId]: refreshed.document };
            propagatedCount += refreshed.updatedCount;
            markDocumentDirty(documentId);
          }
        }
      }
      if (propagatedCount > 0) {
        showToast(`Workspace Fabric: ${propagatedCount} live link(s) updated.`);
      }
      try {
        const committed = operationEngine.commitDocumentMapTransition(
          previous,
          newDocs,
          `Edit ${updatedDoc.kind}`,
        );
        for (const documentId of committed.touchedDocumentIds) markDocumentDirty(documentId);
        return committed.documents;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Workspace operation commit failed.');
        return previous;
      }
    });
  }, [markDocumentDirty, operationEngine, setDocuments, showToast]);
}
