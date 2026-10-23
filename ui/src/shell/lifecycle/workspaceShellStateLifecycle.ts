// STATUS: PLATIN — shell library projections and local session/window/recent persistence effects.
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type { EditionRegistry } from '../../edition/contracts';
import { filterDocumentsForEdition } from '../../edition/activeEdition';
import { recordShellRecent, saveShellSession, saveShellWindowState, type ShellRecentEntry, type ShellStorageLike } from '../platform/workspaceShellPlatform';
import { projectWorkspaceLibraryDocuments, type WorkspaceLibrarySourceDocument } from '../library/workspaceLibrary';

export interface WorkspaceShellStateLifecycleOptions {
  editionRegistry: EditionRegistry;
  documents: Record<string, WorkspaceDocument>;
  setLibraryDocuments: Dispatch<SetStateAction<Record<string, WorkspaceLibrarySourceDocument>>>;
  shellSessionRestored: boolean;
  shellStorage: ShellStorageLike | null;
  activeDocId: string;
  tabOrder: string[];
  pinnedDocumentIds: string[];
  recentlyClosedDocumentIds: string[];
  detachedDocumentId: string | null;
  setRecentEntries: Dispatch<SetStateAction<ShellRecentEntry[]>>;
}

export function useWorkspaceShellStateLifecycle(options: WorkspaceShellStateLifecycleOptions): void {
  const { editionRegistry, documents, setLibraryDocuments, shellSessionRestored, shellStorage, activeDocId, tabOrder, pinnedDocumentIds, recentlyClosedDocumentIds, detachedDocumentId, setRecentEntries } = options;
  useEffect(() => {
    const visibleDocuments = filterDocumentsForEdition(documents, editionRegistry);
    const projection = projectWorkspaceLibraryDocuments(visibleDocuments, editionRegistry);
    setLibraryDocuments((previous) => {
      const changed = Object.entries(projection).some(([id, document]) => {
        const existing = previous[id];
        return !existing
          || existing.title !== document.title
          || existing.kind !== document.kind
          || existing.modified_at !== document.modified_at
          || existing.securityPolicy !== document.securityPolicy;
      });
      return changed ? { ...previous, ...projection } : previous;
    });
  }, [documents, editionRegistry]);

  useEffect(() => {
    if (!shellSessionRestored) return;
    saveShellSession(shellStorage, {
      activeDocumentId: activeDocId,
      openDocumentIds: tabOrder.filter((id) => Boolean(documents[id])),
      pinnedDocumentIds,
      recentlyClosedDocumentIds,
      savedAt: Date.now(),
    });
  }, [activeDocId, documents, pinnedDocumentIds, recentlyClosedDocumentIds, shellSessionRestored, shellStorage, tabOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const windowKey = detachedDocumentId ? `doc:${detachedDocumentId}` : 'main';
    let timer = 0;
    const persist = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        saveShellWindowState(shellStorage, windowKey, {
          x: window.screenX,
          y: window.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
          maximized: typeof screen !== 'undefined' && window.outerWidth >= screen.availWidth && window.outerHeight >= screen.availHeight,
        });
      }, 250);
    };
    const flush = () => {
      window.clearTimeout(timer);
      saveShellWindowState(shellStorage, windowKey, { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight, maximized: false });
    };
    window.addEventListener('resize', persist);
    window.addEventListener('beforeunload', flush);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', persist); window.removeEventListener('beforeunload', flush); };
  }, [detachedDocumentId, shellStorage]);

  useEffect(() => {
    if (!shellSessionRestored) return;
    const active = documents[activeDocId];
    if (!active) return;
    try {
      setRecentEntries(recordShellRecent(shellStorage, active));
    } catch (error) {
      console.warn('[ShellLifecycle] Recent document metadata was rejected:', error);
    }
  }, [activeDocId, documents, shellSessionRestored, shellStorage]);
}
