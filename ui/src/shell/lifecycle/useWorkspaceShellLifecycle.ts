// STATUS: DIAMANT VGT SUPREME — bounded Workspace shell lifecycle orchestration.
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { useWorkspaceShellRestoreLifecycle } from './workspaceShellRestoreLifecycle';
import { useWorkspaceShellStateLifecycle } from './workspaceShellStateLifecycle';
import { useWorkspaceShellAppearanceLifecycle } from './workspaceShellAppearanceLifecycle';
import { useWorkspaceShellShortcutLifecycle } from './workspaceShellShortcutLifecycle';
import { useWorkspaceShellNativeLifecycle } from './workspaceShellNativeLifecycle';
import {
  acceptShellDroppedFiles,
  browserShellStorage,
  defaultShellUpdateState,
  loadShellAppearance,
  loadShellRecents,
  loadShellShortcuts,
  reorderShellDocumentIds,
  saveShellAppearance,
  persistShellSession,
  saveShellShortcuts,
  setShortcutBinding,
  type ShellAppearancePreference,
  type ShellShortcutCommand,
} from '../platform/workspaceShellPlatform';
import {
  persistActiveDocId,
} from '../../platform/workspace/persistence/workspaceStorage';
import {
  loadWorkspaceDocumentFromStores,
  saveWorkspaceDocumentDurably,
} from '../../platform/workspace/persistence/workspaceFileDocuments';
import { isNativeDesktop } from '../../platform/native/nativeBridge';
import { configureNativeShellPolicy, DEFAULT_SHELL_NATIVE_POLICY, nativeShellOpenFile } from '../../platform/native/nativeShellServices';
import { openShellWindow } from '../windows/shellWindowBridge';
import { initialDocs } from '../../app/bootstrap/seedData';
import { ALPHA_VERSION } from '../../platform/release/alphaStatus';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import type { EditionRegistry } from '../../edition/contracts';
import { filterDocumentsForEdition } from '../../edition/activeEdition';
import { projectWorkspaceLibraryDocuments, type WorkspaceLibrarySourceDocument } from '../library/workspaceLibrary';
import { resolveWorkspaceDocumentRead } from '../../platform/workspace/integrations/workspaceDocumentRead';

const EMPTY_DOCUMENT_IDS: ReadonlySet<string> = new Set();

interface WorkspaceShellLifecycleOptions {
  editionRegistry: EditionRegistry;
  documents: Record<string, WorkspaceDocument>;
  setDocuments: Dispatch<SetStateAction<Record<string, WorkspaceDocument>>>;
  activeDocId: string;
  setActiveDocId: Dispatch<SetStateAction<string>>;
  setIsStartCenterOpen: Dispatch<SetStateAction<boolean>>;
  setIsCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setIsWorkspaceExplorerOpen: Dispatch<SetStateAction<boolean>>;
  handleOpenFile: (file: File) => Promise<unknown> | unknown;
  handleCloseDocument: (documentId: string) => void;
  handleSaveVwc: () => Promise<void> | void;
  autosavedDocumentIds?: ReadonlySet<string>;
  showToast: (message: string) => void;
  isDocumentDirty?: (documentId: string) => boolean;
  /** Per-document unlock credentials, used when an explicit save must write the real file. */
  documentCredentials?: (documentId: string) => { readonly pin?: string; readonly password?: string };
}

export function useWorkspaceShellLifecycle(options: WorkspaceShellLifecycleOptions) {
  const { locale } = useWorkspaceLocale();
  const {
    editionRegistry,
    documents,
    setDocuments,
    activeDocId,
    setActiveDocId,
    setIsStartCenterOpen,
    setIsCommandPaletteOpen,
    setIsWorkspaceExplorerOpen,
    handleOpenFile,
    handleCloseDocument,
    handleSaveVwc,
    autosavedDocumentIds = EMPTY_DOCUMENT_IDS,
    showToast,
    isDocumentDirty = () => false,
    documentCredentials = () => ({}),
  } = options;

  const initialActiveDocId = useRef(activeDocId).current;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const shellStorage = useMemo(() => browserShellStorage(), []);
  const detachedDocumentId = useMemo(
    () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('doc')),
    [],
  );
  const [recentEntries, setRecentEntries] = useState(() =>
    loadShellRecents(shellStorage),
  );
  const visibleRecentEntries = useMemo(
    () => recentEntries.filter((entry) => editionRegistry.isImplementedApp(entry.kind)),
    [editionRegistry, recentEntries],
  );
  const [shellShortcuts, setShellShortcuts] = useState(() => loadShellShortcuts(shellStorage));
  const [shellAppearance, setShellAppearance] = useState(() => loadShellAppearance(shellStorage));
  const [shellUpdateState] = useState(() => defaultShellUpdateState(ALPHA_VERSION));
  const [shellSessionRestored, setShellSessionRestored] = useState(false);
  const [persistedDocumentIds, setPersistedDocumentIds] = useState<Set<string>>(() => new Set());
  const [storedDocumentIdCursor, setStoredDocumentIdCursor] = useState<string | null>(null);
  const [hasMoreStoredDocumentIds, setHasMoreStoredDocumentIds] = useState(false);
  const [libraryDocuments, setLibraryDocuments] = useState<Record<string, WorkspaceLibrarySourceDocument>>(() =>
    projectWorkspaceLibraryDocuments(filterDocumentsForEdition(initialDocs, editionRegistry), editionRegistry),
  );
  const [pinnedDocumentIds, setPinnedDocumentIds] = useState<string[]>([]);
  const [recentlyClosedDocumentIds, setRecentlyClosedDocumentIds] = useState<string[]>([]);
  const [pendingDirtyCloseDocumentId, setPendingDirtyCloseDocumentId] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[]>(() => Object.keys(documents));
  const nativeDesktop = isNativeDesktop();

  useEffect(() => {
    if (!nativeDesktop) return;
    void configureNativeShellPolicy(DEFAULT_SHELL_NATIVE_POLICY).catch((error) => {
      console.warn('[ShellLifecycle] Native capability policy could not be configured:', error);
    });
  }, [nativeDesktop]);

  useWorkspaceShellRestoreLifecycle({ editionRegistry, initialActiveDocId, detachedDocumentId, shellStorage, setActiveDocId, setDocuments, setIsStartCenterOpen, showToast, localeRef, autosavedDocumentIds, setPersistedDocumentIds, setStoredDocumentIdCursor, setHasMoreStoredDocumentIds, setLibraryDocuments, setTabOrder, setPinnedDocumentIds, setRecentlyClosedDocumentIds, setShellSessionRestored });
  useWorkspaceShellStateLifecycle({ editionRegistry, documents, setLibraryDocuments, shellSessionRestored, shellStorage, activeDocId, tabOrder, pinnedDocumentIds, recentlyClosedDocumentIds, detachedDocumentId, setRecentEntries });
  useWorkspaceShellAppearanceLifecycle({ locale, shellAppearance });

  const handleOpenRecentDocument = useCallback(async (documentId: string) => {
    const existing = documents[documentId];
    if (existing) {
      if (!editionRegistry.isImplementedApp(existing.kind)) {
        showToast(workspaceText('edition.documentUnavailable', locale));
        return;
      }
      setActiveDocId(documentId);
      persistActiveDocId(documentId);
      setIsStartCenterOpen(false);
      return;
    }
    const storedDocument = await loadWorkspaceDocumentFromStores(documentId);
    const restored = storedDocument ?? (persistedDocumentIds.has(documentId) ? null : initialDocs[documentId] ?? null);
    if (!restored) {
      showToast('Recent document is unavailable or failed integrity validation.');
      return;
    }
    if (storedDocument) setPersistedDocumentIds((previous) => new Set(previous).add(documentId));
    if (!editionRegistry.isImplementedApp(restored.kind)) {
      showToast(workspaceText('edition.documentUnavailable', locale));
      return;
    }
    setDocuments((previous: Record<string, WorkspaceDocument>) => ({ ...previous, [restored.id]: restored }));
    setLibraryDocuments((previous) => ({
      ...previous,
      ...projectWorkspaceLibraryDocuments({ [restored.id]: restored }, editionRegistry),
    }));
    setActiveDocId(restored.id);
    persistActiveDocId(restored.id);
    setIsStartCenterOpen(false);
  }, [documents, editionRegistry, locale, persistedDocumentIds, setActiveDocId, setDocuments, setIsStartCenterOpen, showToast]);

  const handleOpenNewWindow = useCallback(async () => {
    try {
      await openShellWindow({ startCenter: true });
      showToast('New Workspace window opened.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Workspace window could not be opened.');
    }
  }, [showToast]);

  const handleDetachDocument = useCallback(async (documentId: string) => {
    const workspaceDocument = documents[documentId];
    if (!workspaceDocument) return;
    if (!editionRegistry.isImplementedApp(workspaceDocument.kind)) {
      showToast(workspaceText('edition.documentUnavailable', locale));
      return;
    }
    try {
      await saveWorkspaceDocumentDurably(workspaceDocument, documentCredentials(documentId));
      setPersistedDocumentIds((previous) => new Set(previous).add(documentId));
      await openShellWindow({ documentId, startCenter: false });
      if (!detachedDocumentId) handleCloseDocument(documentId);
      showToast(`Detached ${workspaceDocument.title} into a new window.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Tab could not be detached.');
    }
  }, [detachedDocumentId, documentCredentials, documents, editionRegistry, handleCloseDocument, showToast]);

  const finalizeDocumentClose = useCallback((documentId: string) => {
    setRecentlyClosedDocumentIds((previous) => [documentId, ...previous.filter((id) => id !== documentId)].slice(0, 32));
    setPinnedDocumentIds((previous) => previous.filter((id) => id !== documentId));
    handleCloseDocument(documentId);
  }, [handleCloseDocument]);

  const handleRequestCloseDocument = useCallback(async (documentId: string) => {
    const documentToClose = documents[documentId];
    if (!documentToClose) return;
    if (isDocumentDirty(documentId)) { setPendingDirtyCloseDocumentId(documentId); return; }
    finalizeDocumentClose(documentId);
  }, [documents, finalizeDocumentClose, isDocumentDirty]);

  const handleResolveDirtyClose = useCallback(async (action: 'save' | 'discard' | 'cancel') => {
    const documentId = pendingDirtyCloseDocumentId;
    if (!documentId) return;
    if (action === 'cancel') { setPendingDirtyCloseDocumentId(null); return; }
    const documentToClose = documents[documentId];
    if (!documentToClose) { setPendingDirtyCloseDocumentId(null); return; }
    if (action === 'save') {
      try {
        await saveWorkspaceDocumentDurably(documentToClose, documentCredentials(documentId));
        setPersistedDocumentIds((previous) => new Set(previous).add(documentId));
      }
      catch { showToast('Document could not be saved; close was cancelled.'); setPendingDirtyCloseDocumentId(null); return; }
    }
    setPendingDirtyCloseDocumentId(null);
    finalizeDocumentClose(documentId);
  }, [documentCredentials, documents, finalizeDocumentClose, pendingDirtyCloseDocumentId, showToast]);

  const handleCloseOtherDocuments = useCallback(async (documentId: string) => {
    const orderedIds = tabOrder.filter((id) => id !== documentId && Boolean(documents[id]));
    for (const id of orderedIds) {
      if (isDocumentDirty(id)) { await handleRequestCloseDocument(id); showToast('Close Others paused for an unsaved document.'); return; }
      finalizeDocumentClose(id);
    }
  }, [documents, finalizeDocumentClose, handleRequestCloseDocument, isDocumentDirty, showToast, tabOrder]);

  const handleCloseDocumentsToRight = useCallback(async (documentId: string) => {
    const index = tabOrder.indexOf(documentId);
    if (index < 0) return;
    for (const id of tabOrder.slice(index + 1)) {
      if (!documents[id]) continue;
      if (isDocumentDirty(id)) { await handleRequestCloseDocument(id); showToast('Close Right paused for an unsaved document.'); return; }
      finalizeDocumentClose(id);
    }
  }, [documents, finalizeDocumentClose, handleRequestCloseDocument, isDocumentDirty, showToast, tabOrder]);

  const handleDuplicateDocument = useCallback((documentId: string) => {
    const source = documents[documentId];
    if (!source) return;
    const now = Date.now();
    const duplicate = (typeof structuredClone === 'function' ? structuredClone(source) : JSON.parse(JSON.stringify(source))) as WorkspaceDocument;
    duplicate.id = globalThis.crypto.randomUUID();
    duplicate.title = `${source.title} Copy`.slice(0, 240);
    duplicate.created_at = now; duplicate.modified_at = now; duplicate.version = 1;
    setDocuments((previous) => ({ ...previous, [duplicate.id]: duplicate }));
    setTabOrder((current) => [...current.filter((id) => id !== duplicate.id), duplicate.id]);
    setActiveDocId(duplicate.id); persistActiveDocId(duplicate.id);
    showToast(`Duplicated ${source.title}.`);
  }, [documents, setActiveDocId, setDocuments, showToast]);

  const handleCopyDocumentPath = useCallback(async (documentId: string) => {
    if (!documents[documentId]) return;
    const value = `vgt://workspace/document/${encodeURIComponent(documentId)}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(value);
      showToast('Workspace path copied.');
    } catch { showToast(`Workspace path: ${value}`); }
  }, [documents, showToast]);

  const handleTogglePinDocument = useCallback((documentId: string) => {
    if (!documents[documentId]) return;
    setPinnedDocumentIds((previous) => {
      const next = previous.includes(documentId)
        ? previous.filter((id) => id !== documentId)
        : [documentId, ...previous.filter((id) => id !== documentId)].slice(0, 32);
      // Optimistic UI: paint immediately, then persist. A storage failure rolls the star back in the next microtask.
      const persisted = persistShellSession(shellStorage, {
        activeDocumentId: activeDocId,
        openDocumentIds: tabOrder.filter((id) => Boolean(documents[id])),
        pinnedDocumentIds: next,
        recentlyClosedDocumentIds,
        savedAt: Date.now(),
      }).persisted;
      if (!persisted) queueMicrotask(() => {
        setPinnedDocumentIds(previous);
        showToast('Favorite was restored because local persistence failed.');
      });
      return next;
    });
  }, [activeDocId, documents, recentlyClosedDocumentIds, shellStorage, showToast, tabOrder]);

  const handleReopenClosedDocument = useCallback(async () => {
    const documentId = recentlyClosedDocumentIds[0];
    if (!documentId) { showToast('No recently closed document.'); return; }
    const existingInMemory = documents[documentId];
    const storedDocument = existingInMemory ? null : await loadWorkspaceDocumentFromStores(documentId);
    const existing = existingInMemory ?? storedDocument;
    if (!existing) { setRecentlyClosedDocumentIds((previous) => previous.slice(1)); showToast('Recently closed document is unavailable.'); return; }
    if (storedDocument) setPersistedDocumentIds((previous) => new Set(previous).add(documentId));
    setDocuments((previous) => ({ ...previous, [existing.id]: existing }));
    setRecentlyClosedDocumentIds((previous) => previous.filter((id) => id !== existing.id));
    setActiveDocId(existing.id);
    persistActiveDocId(existing.id);
  }, [documents, recentlyClosedDocumentIds, setActiveDocId, setDocuments, setPersistedDocumentIds, showToast]);

  const handleCloseAllDocuments = useCallback(async () => {
    for (const documentId of Object.keys(documents)) {
      if (isDocumentDirty(documentId)) { showToast('Close All stopped because unsaved documents require an explicit per-document save.'); return; }
    }
    for (const documentId of Object.keys(documents)) handleCloseDocument(documentId);
    setRecentlyClosedDocumentIds((previous) => [...Object.keys(documents).reverse(), ...previous].filter((id, index, all) => all.indexOf(id) === index).slice(0, 32));
    setPinnedDocumentIds([]);
  }, [documents, handleCloseDocument, isDocumentDirty, showToast]);

  const handleShellAppearanceChange = useCallback((next: ShellAppearancePreference) => {
    const normalized = saveShellAppearance(shellStorage, next);
    setShellAppearance(normalized);
  }, [shellStorage]);

  const handleShellShortcutChange = useCallback((command: ShellShortcutCommand, binding: string) => {
    try {
      const next = setShortcutBinding(shellShortcuts, command, binding);
      saveShellShortcuts(shellStorage, next);
      setShellShortcuts(next);
      showToast(`Shortcut updated: ${next[command]}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Shortcut could not be updated.');
    }
  }, [shellShortcuts, shellStorage, showToast]);

  useWorkspaceShellShortcutLifecycle({ activeDocId, documents, shellShortcuts, setActiveDocId, setIsCommandPaletteOpen, setIsStartCenterOpen, setIsWorkspaceExplorerOpen, handleOpenNewWindow, handleSaveVwc });
  useWorkspaceShellNativeLifecycle({ documents, setPersistedDocumentIds, setDocuments, setActiveDocId, setIsStartCenterOpen, handleOpenFile, showToast, isDocumentDirty });
  const handleNativeOpenFile = useCallback(async () => {
    if (!nativeDesktop) return;
    try {
      const file = await nativeShellOpenFile(DEFAULT_SHELL_NATIVE_POLICY);
      if (file) await handleOpenFile(file);
    } catch (error) {
      const raw = typeof error === 'string' ? error : (error instanceof Error ? error.message : '');
      if (/cancelled|abgebrochen/i.test(raw)) return;
      showToast(raw || 'Native open dialog failed.');
    }
  }, [handleOpenFile, nativeDesktop, showToast]);

  const handleShellDrop = useCallback(async (files: File[]) => {
    try {
      const index = acceptShellDroppedFiles(files);
      await handleOpenFile(files[index]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Dropped file was rejected.');
    }
  }, [handleOpenFile, showToast]);

  useEffect(() => {
    setTabOrder((current) => {
      const live = new Set(Object.keys(documents));
      const retained = current.filter((id) => live.has(id));
      const added = Object.keys(documents).filter((id) => !retained.includes(id));
      const next = [...retained, ...added];
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [documents]);

  const handleReorderDocument = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setTabOrder((current) => reorderShellDocumentIds(current, sourceId, targetId));
  }, []);

  const loadStoredWorkspaceDocument = useCallback(async (documentId: string): Promise<WorkspaceDocument | null> => {
    const activeDocument = documents[documentId];
    if (activeDocument) return activeDocument;
    if (!persistedDocumentIds.has(documentId)) return null;
    const storedDocument = await loadWorkspaceDocumentFromStores(documentId);
    if (storedDocument) {
      if (!editionRegistry.isImplementedApp(storedDocument.kind)) return null;
      // **Lese-Seite des Umschlag-Vertrags** (Integration & Release, Paket 1+2): Eine Ablage aus der Zeit **vor**
      // der Versionierung wird erlaubt und beim nächsten Speichern gestempelt; eine **neuere** oder unsinnige
      // Angabe wird **mit Namen abgelehnt** — „best effort" zu lesen ist der Weg, auf dem Daten still falsch
      // werden, weil Felder, die diese Anwendung nicht kennt, beim nächsten Speichern verloren gehen.
      resolveWorkspaceDocumentRead(storedDocument);
      setPersistedDocumentIds((previous) => new Set(previous).add(documentId));
      return storedDocument;
    }
    if (persistedDocumentIds.has(documentId)) return null;
    const seedDocument = initialDocs[documentId] ?? null;
    return seedDocument && editionRegistry.isImplementedApp(seedDocument.kind) ? seedDocument : null;
  }, [documents, editionRegistry, persistedDocumentIds, setPersistedDocumentIds]);

  const tabDocuments = useMemo(() => {
    if (detachedDocumentId && documents[detachedDocumentId]) return [documents[detachedDocumentId]];
    const position = new Map(tabOrder.map((id, index) => [id, index]));
    const pinned = new Set(pinnedDocumentIds);
    const values = tabOrder.map((id) => documents[id]).filter((document): document is WorkspaceDocument => Boolean(document));
    for (const document of Object.values(documents)) if (!position.has(document.id)) values.push(document);
    return values.sort((a, b) => {
      const ap = pinned.has(a.id); const bp = pinned.has(b.id);
      if (ap !== bp) return ap ? -1 : 1;
      return (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    });
  }, [detachedDocumentId, documents, pinnedDocumentIds, tabOrder]);

  return {
    detachedDocumentId,
    recentEntries: visibleRecentEntries,
    libraryRecentEntries: recentEntries,
    storedDocumentIds: persistedDocumentIds,
    storedDocumentIdCursor,
    hasMoreStoredDocumentIds,
    libraryDocuments,
    loadStoredWorkspaceDocument,
    pinnedDocumentIds,
    recentlyClosedDocumentIds,
    pendingDirtyCloseDocumentId,
    shellShortcuts,
    shellAppearance,
    shellUpdateState,
    nativeDesktop,
    tabDocuments,
    handleOpenRecentDocument,
    handleOpenNewWindow,
    handleDetachDocument,
    handleRequestCloseDocument,
    handleResolveDirtyClose,
    handleCloseOtherDocuments,
    handleCloseDocumentsToRight,
    handleDuplicateDocument,
    handleCopyDocumentPath,
    handleTogglePinDocument,
    handleReorderDocument,
    handleReopenClosedDocument,
    handleCloseAllDocuments,
    handleShellAppearanceChange,
    handleShellShortcutChange,
    handleNativeOpenFile,
    handleShellDrop,
  };
}
