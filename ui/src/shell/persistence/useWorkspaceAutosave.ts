// STATUS: DIAMANT VGT SUPREME — Sovereign bounded Workspace Autosave Hook
//
// Release Beta 0.1 (blocker #1: no silent data loss): a document is only reported as saved after its
// **real, confirmed file write** on the native desktop. The IndexedDB transaction remains what it always
// was — a crash cache. Only the browser build (no native store) still has the cache as its only layer,
// and the status proof says so explicitly (`browser-cache`, never "file").
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { saveAllDocumentsToStorage, saveEmergencySnapshot } from '../../platform/workspace/persistence/workspaceStorage';
import { writeRecoverySnapshot, recoverySupported } from '../../platform/recovery/recovery';
import { persistOperationAutosaveSnapshot } from '../../platform/workspace/recovery/workspaceVersioning';
import { workspaceSaveLeaseManager, type DocumentSaveLease } from '../../platform/recovery/versionRecoveryEngine';
import { securityPolicyForDocument } from '../../platform/security/securityProfiles';
import {
  getWorkspaceFileStoreSession,
  type WorkspaceFileStoreSession,
} from '../../platform/workspace/persistence/workspaceFileStoreProvider';
import { writeWorkspaceDocumentFile } from '../../platform/workspace/persistence/workspaceFilePersistence';
import { rememberWorkspaceFileWrite, revealWorkspaceFilesFolder } from '../../platform/workspace/persistence/workspaceFileDocuments';
import { MAX_DIRTY_DOCUMENTS_PER_FLUSH, runWorkspaceAutosaveFlush } from './workspaceAutosaveFlush';
import { classifyWorkspaceSaveFailureDetailed, type WorkspaceSaveFailure } from './workspaceSaveFailure';
import type { WorkspaceSaveProof, WorkspaceSaveWarning } from './workspaceSaveProof';
import { workspaceSaveProofCopy } from './workspaceSaveProof';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export type SaveStatus = 'saved' | 'saved-with-warning' | 'saving' | 'unsaved' | 'error';

interface UseWorkspaceAutosaveOptions {
  documents: Record<string, WorkspaceDocument>;
  activeDocId: string;
  documentPins?: Record<string, string>;
  documentPasswords?: Record<string, string>;
  onSaveToast?: (message: string) => void;
}

const AUTOSAVE_DEBOUNCE_MS = 2_500;
const AUTOSAVE_HARD_CEILING_MS = 10_000;

export function useWorkspaceAutosave({
  documents,
  activeDocId,
  documentPins = {},
  documentPasswords = {},
  onSaveToast,
}: UseWorkspaceAutosaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  /** **Warum** das letzte Speichern scheiterte (W-229) — ein Grund, kein Fehlertext. */
  const [saveFailure, setSaveFailure] = useState<WorkspaceSaveFailure | null>(null);
  const [secondsUntilSave, setSecondsUntilSave] = useState<number>(10);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => Date.now());
  const [persistedDocumentIds, setPersistedDocumentIds] = useState<Set<string>>(() => new Set());
  /** Bestätigter Speichernachweis des aktiven Dokuments — Datei oder ausdrücklich Browser-Ablage. */
  const [saveProof, setSaveProof] = useState<WorkspaceSaveProof | null>(null);
  /** Zusätzlicher, sichtbarer Grund für `saved-with-warning`. */
  const [saveWarning, setSaveWarning] = useState<WorkspaceSaveWarning | null>(null);
  /** Ob dieser Prozess überhaupt eine native Dateiablage besitzt (Desktop-Build). */
  const [fileStoreAvailable, setFileStoreAvailable] = useState<boolean>(false);

  const { locale } = useWorkspaceLocale();
  const localeRef = useRef<WorkspaceLocale>(locale);
  localeRef.current = locale;

  const dirtyDocIdsRef = useRef<Set<string>>(new Set());
  const mutationRevisionRef = useRef<Map<string, number>>(new Map());
  const firstDirtyTimestampRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const documentsRef = useRef<Record<string, WorkspaceDocument>>(documents);
  const pinsRef = useRef<Record<string, string>>(documentPins);
  const passwordsRef = useRef<Record<string, string>>(documentPasswords);
  documentsRef.current = documents;
  pinsRef.current = documentPins;
  passwordsRef.current = documentPasswords;
  const saveProofsRef = useRef<Map<string, WorkspaceSaveProof>>(new Map());
  const storeSessionRef = useRef<WorkspaceFileStoreSession | null | undefined>(undefined);
  const activeDocIdInRef = useRef(activeDocId);
  activeDocIdInRef.current = activeDocId;
  const saveFailureRef = useRef<WorkspaceSaveFailure | null>(null);
  saveFailureRef.current = saveFailure;

  const prevDocsRef = useRef<Record<string, WorkspaceDocument>>({});

  const credentialFor = useCallback((documentId: string) => ({
    pin: pinsRef.current[documentId] ?? null,
    password: passwordsRef.current[documentId] ?? null,
  }), []);

  const publishProof = useCallback((documentId: string) => {
    setSaveProof(saveProofsRef.current.get(documentId) ?? null);
  }, []);

  useEffect(() => {
    publishProof(activeDocId);
  }, [activeDocId, publishProof]);

  // Resolve the native store once per process. Until it resolves, a flush still awaits the same
  // memoised promise — an autosave must never race the capability probe.
  useEffect(() => {
    let disposed = false;
    void getWorkspaceFileStoreSession().then((session) => {
      if (disposed) return;
      setFileStoreAvailable(session !== null);
    });
    return () => { disposed = true; };
  }, []);

  const flushPendingSaves = useCallback(async () => {
    if (flushInFlightRef.current) return flushInFlightRef.current;
    const run = (async () => {
      const dirtyIds = Array.from(dirtyDocIdsRef.current).slice(0, MAX_DIRTY_DOCUMENTS_PER_FLUSH);
      if (dirtyIds.length === 0) {
        setSaveStatus('saved');
        setSecondsUntilSave(10);
        return;
      }

      const currentDocs = documentsRef.current;
      const revisionAtStart = new Map<string, number>();
      const idsToSave: string[] = [];
      for (const id of dirtyIds) {
        if (!currentDocs[id]) continue;
        revisionAtStart.set(id, mutationRevisionRef.current.get(id) ?? 0);
        idsToSave.push(id);
      }
      if (idsToSave.length === 0) return;

      setSaveStatus('saving');
      const leases: DocumentSaveLease[] = [];
      try {
        for (const id of idsToSave) leases.push(workspaceSaveLeaseManager.acquire(id));

        let storeSession = storeSessionRef.current;
        if (storeSession === undefined) {
          storeSession = await getWorkspaceFileStoreSession();
          storeSessionRef.current = storeSession;
          setFileStoreAvailable(storeSession !== null);
        }
        const persistFile = storeSession
          ? async (document: WorkspaceDocument) => {
            const credentials = credentialFor(document.id);
            const receipt = await writeWorkspaceDocumentFile(storeSession.store, document, {
              pin: credentials.pin ?? undefined,
              password: credentials.password ?? undefined,
            });
            rememberWorkspaceFileWrite(document, receipt);
            return receipt;
          }
          : null;

        const outcome = await runWorkspaceAutosaveFlush({
          documents: currentDocs,
          documentIds: idsToSave,
          persistFile,
          persistCache: (docs) => saveAllDocumentsToStorage(docs, credentialFor),
          persistVersionSnapshot: async (document) => {
            await persistOperationAutosaveSnapshot(document, 'autosave_routine', credentialFor(document.id));
          },
          persistRecoverySnapshot: recoverySupported()
            ? async (document) => {
              const credentials = credentialFor(document.id);
              try {
                await writeRecoverySnapshot(document, credentials.pin, credentials.password);
                return 'written' as const;
              } catch {
                return 'unavailable' as const;
              }
            }
            : null,
          isRecoveryMandatory: (document) => securityPolicyForDocument(document).profile !== 'STANDARD',
        });

        // Dirty state is only cleared for documents whose authoritative layer confirmed THIS revision.
        for (const id of outcome.persistedDocumentIds) {
          if ((mutationRevisionRef.current.get(id) ?? 0) === revisionAtStart.get(id)) dirtyDocIdsRef.current.delete(id);
          const receipt = outcome.fileReceipts[id];
          if (receipt) {
            saveProofsRef.current.set(id, {
              kind: 'file',
              fileName: receipt.fileName,
              sizeBytes: receipt.sizeBytes,
              sha256: receipt.sha256,
              modifiedAtMs: receipt.modifiedAtMs,
              rootPath: storeSessionRef.current?.rootPath ?? null,
            });
          } else if (!persistFile) {
            saveProofsRef.current.set(id, { kind: 'browser-cache', savedAt: Date.now() });
          }
        }
        if (outcome.persistedDocumentIds.length > 0) {
          setPersistedDocumentIds((previous) => {
            const next = new Set(previous);
            for (const id of outcome.persistedDocumentIds) next.add(id);
            return next.size === previous.size ? previous : next;
          });
          setLastSavedAt(Date.now());
        }
        publishProof(activeDocIdInRef.current);
        setSaveWarning(outcome.warning);

        const copy = workspaceSaveProofCopy(localeRef.current);
        if (outcome.failure) {
          // Save failure never clears dirty state. The classification carries code + stage; the raw
          // error is deliberately not shown because it may contain paths and content.
          console.warn('[Autosave] Persistence failed:', outcome.failure.detail ?? outcome.failure.code);
          setSaveFailure({
            code: outcome.failure.code,
            at: Date.now(),
            ...(outcome.failure.detail ? { detail: outcome.failure.detail } : {}),
          });
          setSaveStatus('error');
          return;
        }
        if (dirtyDocIdsRef.current.size === 0) {
          firstDirtyTimestampRef.current = null;
          setSaveFailure(null);
          setSecondsUntilSave(10);
          setSaveStatus(outcome.warning ? 'saved-with-warning' : 'saved');
          const confirmedFiles = Object.values(outcome.fileReceipts);
          if (confirmedFiles.length === 1) {
            const only = confirmedFiles[0]!;
            onSaveToast?.(copy.savedFileToast(only.fileName, only.sizeBytes));
          } else if (confirmedFiles.length > 1) {
            onSaveToast?.(copy.savedFileBatchToast(confirmedFiles.length));
          } else if (!persistFile && outcome.cacheConfirmed) {
            onSaveToast?.(copy.savedBrowserToast);
          } else if (outcome.warning) {
            onSaveToast?.(copy.warning[outcome.warning]);
          }
        } else {
          firstDirtyTimestampRef.current = Date.now();
          setSaveStatus('unsaved');
        }
      } catch (error: unknown) {
        // Unexpected orchestration failure (lease, bridge): never claim saved, keep the dirty state.
        console.warn('[Autosave] Persistence failed:', error instanceof Error ? error.name : 'Error');
        const failure = classifyWorkspaceSaveFailureDetailed(error);
        setSaveFailure({ code: failure.code, at: Date.now(), ...(failure.detail ? { detail: failure.detail } : {}) });
        setSaveStatus('error');
      } finally {
        for (const lease of leases) workspaceSaveLeaseManager.release(lease);
      }
    })();
    flushInFlightRef.current = run;
    try { await run; } finally { flushInFlightRef.current = null; }
  }, [credentialFor, onSaveToast, publishProof]);

  const markDocumentDirty = useCallback((docId: string) => {
    if (!docId || docId.length > 256 || /[\u0000-\u001f]/.test(docId)) return;
    dirtyDocIdsRef.current.add(docId);
    mutationRevisionRef.current.set(docId, (mutationRevisionRef.current.get(docId) ?? 0) + 1);
    setSaveStatus('unsaved');
    const now = Date.now();
    if (firstDirtyTimestampRef.current === null) firstDirtyTimestampRef.current = now;
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    const elapsed = now - firstDirtyTimestampRef.current;
    const remaining = Math.max(500, AUTOSAVE_HARD_CEILING_MS - elapsed);
    debounceTimerRef.current = window.setTimeout(() => { void flushPendingSaves(); }, Math.min(AUTOSAVE_DEBOUNCE_MS, remaining));
  }, [flushPendingSaves]);

  useEffect(() => {
    if (dirtyDocIdsRef.current.size > 0 && firstDirtyTimestampRef.current !== null) {
      if (!countdownIntervalRef.current) {
        countdownIntervalRef.current = window.setInterval(() => {
          if (firstDirtyTimestampRef.current === null) return setSecondsUntilSave(10);
          const elapsed = Date.now() - firstDirtyTimestampRef.current;
          const remainingSec = Math.max(0, Math.ceil((AUTOSAVE_HARD_CEILING_MS - elapsed) / 1000));
          setSecondsUntilSave(remainingSec);
          if (remainingSec === 0) void flushPendingSaves();
        }, 1000);
      }
    } else if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
      setSecondsUntilSave(10);
    }
    return () => {
      if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    };
  }, [saveStatus, flushPendingSaves]);

  useEffect(() => {
    const prev = prevDocsRef.current;
    const changed: string[] = [];
    for (const [id, doc] of Object.entries(documents)) if (prev[id] && prev[id] !== doc) changed.push(id);
    prevDocsRef.current = documents;
    for (const id of changed) markDocumentDirty(id);
  }, [documents, markDocumentDirty]);

  const triggerImmediateSave = useCallback(async () => {
    if (debounceTimerRef.current) { window.clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
    markDocumentDirty(activeDocId);
    await flushPendingSaves();
  }, [activeDocId, flushPendingSaves, markDocumentDirty]);

  /** Reopen the mobile/desktop folder containing the confirmed document files. */
  const openWorkspaceFilesFolder = useCallback(async () => {
    const opened = await revealWorkspaceFilesFolder();
    if (!opened) onSaveToast?.(workspaceSaveProofCopy(localeRef.current).storeUnavailableToast);
    return opened;
  }, [onSaveToast]);

  useEffect(() => {
    const handleBeforeUnload = () => { if (dirtyDocIdsRef.current.size > 0) saveEmergencySnapshot(documentsRef.current); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && dirtyDocIdsRef.current.size > 0) {
        saveEmergencySnapshot(documentsRef.current);
        void flushPendingSaves();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [flushPendingSaves]);

  const isDocumentDirty = useCallback((documentId: string) => dirtyDocIdsRef.current.has(documentId), []);
  const getSaveProof = useCallback((documentId: string): WorkspaceSaveProof | null => saveProofsRef.current.get(documentId) ?? null, []);
  const getSaveFailure = useCallback((): WorkspaceSaveFailure | null => saveFailureRef.current, []);
  return {
    saveStatus, saveFailure,
    saveProof, saveWarning, fileStoreAvailable,
    secondsUntilSave, lastSavedAt, persistedDocumentIds,
    isDirty: dirtyDocIdsRef.current.size > 0, isDocumentDirty,
    triggerImmediateSave, markDocumentDirty, flushPendingSaves,
    retrySave: triggerImmediateSave,
    getSaveProof, getSaveFailure,
    openWorkspaceFilesFolder,
  };
}
