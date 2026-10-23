// STATUS: PLATIN — deep-link/native-open ingress listeners with cancellation and cleanup.
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { loadDocumentFromStorage, persistActiveDocId } from '../../platform/workspace/persistence/workspaceStorage';
import { deepLinkFromLocation, takeNativeDeepLink } from '../deep-links/nativeDeepLink';
import { listenForNativeOpenedFile, takeNativeOpenedFile } from '../../platform/native/nativeOpen';

export interface WorkspaceShellNativeLifecycleOptions {
  documents: Record<string, WorkspaceDocument>;
  setPersistedDocumentIds: Dispatch<SetStateAction<Set<string>>>;
  setDocuments: Dispatch<SetStateAction<Record<string, WorkspaceDocument>>>;
  setActiveDocId: Dispatch<SetStateAction<string>>;
  setIsStartCenterOpen: Dispatch<SetStateAction<boolean>>;
  handleOpenFile: (file: File) => Promise<unknown> | unknown;
  showToast: (message: string) => void;
  isDocumentDirty: (documentId: string) => boolean;
}

export function useWorkspaceShellNativeLifecycle(options: WorkspaceShellNativeLifecycleOptions): void {
  const { documents, setPersistedDocumentIds, setDocuments, setActiveDocId, setIsStartCenterOpen, handleOpenFile, showToast, isDocumentDirty } = options;
  useEffect(() => {
    let cancelled = false;
    const openDeepLink = async (link: { documentId: string; objectId?: string } | null) => {
      if (!link || cancelled) return;
      const existingInMemory = documents[link.documentId];
      const storedDocument = existingInMemory ? null : await loadDocumentFromStorage(link.documentId);
      const existing = existingInMemory ?? storedDocument;
      if (!existing || cancelled) { showToast('Deep-linked document is unavailable; nothing was recreated.'); return; }
      if (storedDocument) setPersistedDocumentIds((previous) => new Set(previous).add(link.documentId));
      setDocuments((previous) => ({ ...previous, [existing.id]: existing }));
      setActiveDocId(existing.id); persistActiveDocId(existing.id); setIsStartCenterOpen(false);
      if (link.objectId) showToast(`Opened deep-linked document; object ${link.objectId} remains document-scoped.`);
    };
    try { void openDeepLink(deepLinkFromLocation(window.location.href)); } catch (error) { showToast(error instanceof Error ? error.message : 'Deep link was rejected.'); }
    void takeNativeDeepLink().then(openDeepLink).catch((error) => { if (!cancelled) showToast(error instanceof Error ? error.message : 'Native deep link was rejected.'); });
    return () => { cancelled = true; };
  }, [setActiveDocId, setDocuments, setIsStartCenterOpen, showToast]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const consumeNativeQueue = async () => {
      if (cancelled) return;
      try {
        for (;;) {
          const file = await takeNativeOpenedFile();
          if (!file || cancelled) break;
          await handleOpenFile(file);
        }
      } catch (error) {
        if (!cancelled) showToast(error instanceof Error ? error.message : 'Native file could not be opened');
      }
    };
    void consumeNativeQueue();
    void listenForNativeOpenedFile(() => { void consumeNativeQueue(); }).then((dispose) => {
      if (cancelled) dispose();
      else unlisten = dispose;
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [handleOpenFile, showToast]);

  useEffect(() => {
    // Detached Workspace windows (`?start=…` / `?doc=…`) are secondary windows. WebView2 turns a
    // `beforeunload` cancellation into a native prompt that can end up behind the window and make
    // the whole app appear hung/unclosable (native user finding). Their autosave still runs; the
    // dirty-close confirmation belongs to the main window, whose URL has no window query.
    let secondaryWindow = false;
    try {
      const params = new URLSearchParams(window.location.search);
      secondaryWindow = params.has('start') || params.has('doc');
    } catch {
      secondaryWindow = false;
    }
    if (secondaryWindow) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!Object.keys(documents).some((documentId) => isDocumentDirty(documentId))) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [documents, isDocumentDirty]);
}
