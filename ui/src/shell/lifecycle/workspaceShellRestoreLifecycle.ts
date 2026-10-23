// STATUS: PLATIN — bounded restore orchestration and autosave visibility projection.
//
// Release Beta 0.1 (blocker #1): startup now restores from the **durable native document files** as
// well as from the IndexedDB crash cache. Both sources are merged by `modified_at` (file wins a tie),
// no document id appears twice, and every restored document comes from a SHA-256-verified container.
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type { EditionRegistry } from '../../edition/contracts';
import { filterDocumentsForEdition } from '../../edition/activeEdition';
import { initialDocs } from '../../app/bootstrap/seedData';
import { getPersistedActiveDocId, scanStoredDocumentIds } from '../../platform/workspace/persistence/workspaceStorage';
import {
  loadWorkspaceDocumentConflictAware,
  loadWorkspaceStartupFileSnapshot,
  type WorkspaceStartupFileSnapshot,
} from '../../platform/workspace/persistence/workspaceFileDocuments';
import type { ShellStorageLike } from '../platform/workspaceShellPlatform';
import { prepareWorkspaceLibraryProjectionDocuments, restoreWorkspaceDocuments, selectWorkspaceRestoreDocumentIds } from './workspaceSessionRestore';
import { loadShellSession } from '../platform/workspaceShellPlatform';
import { projectWorkspaceLibraryDocuments, type WorkspaceLibrarySourceDocument } from '../library/workspaceLibrary';
import { workspaceText, type WorkspaceLocale } from '../localization/workspaceLocale';
import { workspaceSaveProofCopy } from '../persistence/workspaceSaveProof';

export interface WorkspaceShellRestoreLifecycleOptions {
  editionRegistry: EditionRegistry;
  initialActiveDocId: string;
  detachedDocumentId: string | null;
  shellStorage: ShellStorageLike | null;
  setActiveDocId: Dispatch<SetStateAction<string>>;
  setDocuments: Dispatch<SetStateAction<Record<string, WorkspaceDocument>>>;
  setIsStartCenterOpen: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string) => void;
  localeRef: MutableRefObject<WorkspaceLocale>;
  autosavedDocumentIds: ReadonlySet<string>;
  setPersistedDocumentIds: Dispatch<SetStateAction<Set<string>>>;
  setStoredDocumentIdCursor: Dispatch<SetStateAction<string | null>>;
  setHasMoreStoredDocumentIds: Dispatch<SetStateAction<boolean>>;
  setLibraryDocuments: Dispatch<SetStateAction<Record<string, WorkspaceLibrarySourceDocument>>>;
  setTabOrder: Dispatch<SetStateAction<string[]>>;
  setPinnedDocumentIds: Dispatch<SetStateAction<string[]>>;
  setRecentlyClosedDocumentIds: Dispatch<SetStateAction<string[]>>;
  setShellSessionRestored: Dispatch<SetStateAction<boolean>>;
}

function hasOwnDocument<T>(documents: Readonly<Record<string, T>>, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(documents, id);
}

/** The durable file scan is informational: an absent store must never block the IndexedDB restore. */
function reportFileScan(snapshot: WorkspaceStartupFileSnapshot, locale: WorkspaceLocale, showToast: (message: string) => void): void {
  if (!snapshot.available) return;
  const copy = workspaceSaveProofCopy(locale);
  if (snapshot.lockedFileCount > 0) showToast(copy.lockedFilesFound(snapshot.lockedFileCount));
  if (snapshot.failedFileCount > 0) showToast(copy.fileScanFailures(snapshot.failedFileCount));
  if (snapshot.truncated) showToast(copy.fileScanTruncated(Math.max(0, Object.keys(snapshot.documents).length)));
}

export function useWorkspaceShellRestoreLifecycle(options: WorkspaceShellRestoreLifecycleOptions): void {
  const { editionRegistry, initialActiveDocId, detachedDocumentId, shellStorage, setActiveDocId, setDocuments, setIsStartCenterOpen, showToast, localeRef, autosavedDocumentIds, setPersistedDocumentIds, setStoredDocumentIdCursor, setHasMoreStoredDocumentIds, setLibraryDocuments, setTabOrder, setPinnedDocumentIds, setRecentlyClosedDocumentIds, setShellSessionRestored } = options;
  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        const [storedIdScan, fileSnapshot] = await Promise.all([
          scanStoredDocumentIds(),
          loadWorkspaceStartupFileSnapshot(),
        ]);
        const persistedIds = [...storedIdScan.ids];
        if (!mounted) return;
        reportFileScan(fileSnapshot, localeRef.current, showToast);
        setStoredDocumentIdCursor(storedIdScan.nextCursor);
        setHasMoreStoredDocumentIds(storedIdScan.hasMore);
        const storedDocumentIds = new Set([...persistedIds, ...Object.keys(fileSnapshot.documents)]);
        const seededDocuments = filterDocumentsForEdition(initialDocs, editionRegistry);
        const session = loadShellSession(shellStorage);
        const legacyActiveDocumentId = getPersistedActiveDocId();
        const restoreIds = selectWorkspaceRestoreDocumentIds({
          detachedDocumentId,
          sessionDocumentIds: session?.openDocumentIds ?? null,
          legacyActiveDocumentId,
          storedDocumentIds,
          seededDocuments,
        });
        const restoreResult = await restoreWorkspaceDocuments(restoreIds, {
          storedDocumentIds,
          seededDocuments,
          loadStoredDocument: async (documentId) => (await loadWorkspaceDocumentConflictAware(documentId))?.document ?? null,
        });
        if (!mounted) return;

        const restoredDocuments = restoreResult.documents;
        const available = filterDocumentsForEdition(restoredDocuments, editionRegistry);
        const hasExplicitRestoreState = detachedDocumentId !== null
          || session !== null
          || Boolean(legacyActiveDocumentId && storedDocumentIds.has(legacyActiveDocumentId));
        if (hasExplicitRestoreState) {
          setDocuments(available);
          setTabOrder(restoreIds.filter((id) => Boolean(available[id])));
        }

        setPersistedDocumentIds((previous) => new Set([...previous, ...persistedIds, ...Object.keys(fileSnapshot.documents)]));
        setLibraryDocuments(projectWorkspaceLibraryDocuments(
          {
            ...fileSnapshot.documents,
            ...prepareWorkspaceLibraryProjectionDocuments(seededDocuments, storedDocumentIds, restoredDocuments),
          },
          editionRegistry,
        ));

        const lastId = detachedDocumentId ?? session?.activeDocumentId ?? legacyActiveDocumentId ?? initialActiveDocId;
        const activeRestoredDocument = lastId && hasOwnDocument(available, lastId) ? available[lastId] : undefined;
        const activeStoredDocument = lastId && hasOwnDocument(restoredDocuments, lastId) ? restoredDocuments[lastId] : undefined;
        if (activeRestoredDocument) {
          setActiveDocId(lastId);
        } else if (activeStoredDocument && !editionRegistry.isImplementedApp(activeStoredDocument.kind)) {
          showToast(workspaceText('edition.savedDocumentUnavailable', localeRef.current));
          const firstAvailableId = Object.keys(available)[0];
          setActiveDocId(firstAvailableId ?? '');
          if (!firstAvailableId) setIsStartCenterOpen(true);
        } else if (lastId && restoreResult.failedStoredDocumentIds.includes(lastId)) {
          showToast(workspaceText('workspace.restore.integrityFailure', localeRef.current));
          const firstAvailableId = Object.keys(available)[0];
          setActiveDocId(firstAvailableId ?? '');
          if (!firstAvailableId) setIsStartCenterOpen(true);
        } else if (hasExplicitRestoreState) {
          const firstAvailableId = Object.keys(available)[0];
          setActiveDocId(firstAvailableId ?? '');
          if (!firstAvailableId) setIsStartCenterOpen(true);
        } else if (!hasExplicitRestoreState && hasOwnDocument(seededDocuments, lastId)) {
          setActiveDocId(lastId);
        }

        setPinnedDocumentIds((session?.pinnedDocumentIds ?? []).filter((id) => hasOwnDocument(available, id)));
        setRecentlyClosedDocumentIds((session?.recentlyClosedDocumentIds ?? []).filter(
          (id) => storedDocumentIds.has(id) || hasOwnDocument(seededDocuments, id),
        ));
        if (restoreResult.failedStoredDocumentIds.length > 0 && !restoreResult.failedStoredDocumentIds.includes(lastId ?? '')) {
          showToast(workspaceText('workspace.restore.multipleIntegrityFailures', localeRef.current));
        }
        setShellSessionRestored(true);
      } catch (error) {
        console.warn('[ShellLifecycle] Local persistence restore check failed:', error instanceof Error ? error.name : 'Error');
        if (mounted) {
          showToast(workspaceText('workspace.restore.libraryUnavailable', localeRef.current));
          setShellSessionRestored(true);
        }
      }
    };
    void restore();
    return () => { mounted = false; };
  }, [detachedDocumentId, editionRegistry, initialActiveDocId, setActiveDocId, setDocuments, setIsStartCenterOpen, shellStorage, showToast]);

  useEffect(() => {
    if (autosavedDocumentIds.size === 0) return;
    setPersistedDocumentIds((previous) => {
      const next = new Set(previous);
      for (const id of autosavedDocumentIds) next.add(id);
      return next.size === previous.size ? previous : next;
    });
  }, [autosavedDocumentIds]);
}
