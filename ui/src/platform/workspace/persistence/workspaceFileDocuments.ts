// STATUS: PLATIN — app-facing view of the durable Workspace file store.
//
// The startup scan is bounded and memoised per process; lazy reopen reads exactly the file of a
// known document id. Every path merges the durable native file with the IndexedDB crash cache by
// `modified_at`, so a reopen after a restart restores the newest content without duplicates.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { loadDocumentFromStorage, saveDocumentToStorage } from './workspaceStorage';
import { getWorkspaceFileStoreSession, revealWorkspaceFileStoreFolder } from './workspaceFileStoreProvider';
import {
  mergeWorkspaceDocumentSources,
  readWorkspaceDocumentFile,
  scanWorkspaceDocumentFiles,
  sovereignContainerCodec,
  writeWorkspaceDocumentFile,
  type WorkspaceContainerCodec,
  type WorkspaceDocumentSource,
  type WorkspaceFileDocumentRecord,
  type WorkspaceFileWriteReceipt,
} from './workspaceFilePersistence';
import type { WorkspaceSaveProof } from '../../../shell/persistence/workspaceSaveProof';

export interface WorkspaceStartupFileSnapshot {
  readonly available: boolean;
  readonly rootPath: string | null;
  readonly documents: Record<string, WorkspaceDocument>;
  readonly receipts: Record<string, WorkspaceFileWriteReceipt>;
  readonly lockedFileCount: number;
  readonly failedFileCount: number;
  readonly truncated: boolean;
}

const EMPTY_SNAPSHOT: WorkspaceStartupFileSnapshot = Object.freeze({
  available: false,
  rootPath: null,
  documents: Object.freeze({}),
  receipts: Object.freeze({}),
  lockedFileCount: 0,
  failedFileCount: 0,
  truncated: false,
});

let startupSnapshot: WorkspaceStartupFileSnapshot | null = null;
let startupSnapshotPromise: Promise<WorkspaceStartupFileSnapshot> | null = null;

export function getRememberedWorkspaceFileSnapshot(): WorkspaceStartupFileSnapshot | null {
  return startupSnapshot;
}

/**
 * Reads at most `MAX_WORKSPACE_FILE_SCAN` newest store files, verifies their SHA-256 and unpacks
 * them. A native store that is absent or unreachable resolves to `available: false` — the browser
 * build and a failed desktop service must both keep the IndexedDB path working.
 */
export async function loadWorkspaceStartupFileSnapshot(codec: WorkspaceContainerCodec = sovereignContainerCodec): Promise<WorkspaceStartupFileSnapshot> {
  if (startupSnapshot) return startupSnapshot;
  if (startupSnapshotPromise) return startupSnapshotPromise;
  startupSnapshotPromise = (async () => {
    const session = await getWorkspaceFileStoreSession();
    if (!session) return EMPTY_SNAPSHOT;
    try {
      const scan = await scanWorkspaceDocumentFiles(session.store, {}, codec);
      if (!scan.available) return EMPTY_SNAPSHOT;
      const documents: Record<string, WorkspaceDocument> = {};
      const receipts: Record<string, WorkspaceFileWriteReceipt> = {};
      for (const record of scan.records) {
        documents[record.document.id] = record.document;
        receipts[record.document.id] = record.receipt;
      }
      return {
        available: true,
        rootPath: scan.rootPath,
        documents,
        receipts,
        lockedFileCount: scan.lockedFileCount,
        failedFileCount: scan.failedFileCount,
        truncated: scan.truncated,
      };
    } catch {
      return EMPTY_SNAPSHOT;
    }
  })();
  try {
    startupSnapshot = await startupSnapshotPromise;
  } finally {
    startupSnapshotPromise = null;
  }
  return startupSnapshot;
}

/** Keeps the per-process view current after a confirmed write without rescanning the store. */
export function rememberWorkspaceFileWrite(document: WorkspaceDocument, receipt: WorkspaceFileWriteReceipt): void {
  if (!startupSnapshot) return;
  startupSnapshot = {
    ...startupSnapshot,
    documents: { ...startupSnapshot.documents, [document.id]: document },
    receipts: { ...startupSnapshot.receipts, [document.id]: receipt },
  };
}

function rememberedRecord(documentId: string): WorkspaceFileDocumentRecord | null {
  const snapshot = startupSnapshot;
  const document = snapshot?.documents[documentId];
  const receipt = snapshot?.receipts[documentId];
  return document && receipt ? { document, receipt } : null;
}

async function readFileRecord(documentId: string, codec: WorkspaceContainerCodec): Promise<WorkspaceFileDocumentRecord | null> {
  const remembered = rememberedRecord(documentId);
  if (remembered) return remembered;
  const session = await getWorkspaceFileStoreSession();
  if (!session) return null;
  try {
    const record = await readWorkspaceDocumentFile(session.store, documentId, {}, codec);
    if (record) rememberWorkspaceFileWrite(record.document, record.receipt);
    return record;
  } catch {
    // A locked/corrupt file must behave like a missing cached copy on lazy reopen: the shell
    // reports "unavailable" rather than resurrecting unverified content.
    return null;
  }
}

export interface WorkspaceDocumentLoadResult {
  readonly document: WorkspaceDocument;
  readonly origin: 'native-file' | 'indexeddb-cache';
}

/**
 * Conflict-aware load for one document id: durable file and crash cache are both consulted, the
 * newer `modified_at` wins (file wins a tie), and only verified content is returned.
 *
 * `codec` exists for tests; production uses the sovereign container codec.
 */
export async function loadWorkspaceDocumentConflictAware(
  documentId: string,
  codec: WorkspaceContainerCodec = sovereignContainerCodec,
): Promise<WorkspaceDocumentLoadResult | null> {
  const sources: WorkspaceDocumentSource[] = [];
  const cached = await loadDocumentFromStorage(documentId);
  if (cached) sources.push({ origin: 'indexeddb-cache', document: cached });
  const fileRecord = await readFileRecord(documentId, codec);
  if (fileRecord) sources.push({ origin: 'native-file', document: fileRecord.document, receipt: fileRecord.receipt });
  const merged = mergeWorkspaceDocumentSources(sources);
  const document = merged.documents[documentId];
  const origin = merged.origins[documentId];
  return document && origin ? { document, origin } : null;
}

/** Lazy reopen used by shell actions; returns verified content or `null` (never a stale guess). */
export async function loadWorkspaceDocumentFromStores(
  documentId: string,
  codec: WorkspaceContainerCodec = sovereignContainerCodec,
): Promise<WorkspaceDocument | null> {
  return (await loadWorkspaceDocumentConflictAware(documentId, codec))?.document ?? null;
}

export async function revealWorkspaceFilesFolder(): Promise<boolean> {
  return revealWorkspaceFileStoreFolder();
}

/**
 * Durable save for explicit user actions (close-with-save, detach): the real file is written first
 * and the IndexedDB cache only afterwards. Returns the proof the caller may show; throws when the
 * authoritative layer did not confirm.
 */
export async function saveWorkspaceDocumentDurably(
  document: WorkspaceDocument,
  credentials: { readonly pin?: string; readonly password?: string } = {},
  codec: WorkspaceContainerCodec = sovereignContainerCodec,
): Promise<WorkspaceSaveProof> {
  const session = await getWorkspaceFileStoreSession();
  if (session) {
    const receipt = await writeWorkspaceDocumentFile(session.store, document, credentials, codec);
    rememberWorkspaceFileWrite(document, receipt);
    try {
      await saveDocumentToStorage(document, credentials);
    } catch {
      // The cache is only a crash aid; the confirmed file is the durable truth.
    }
    return {
      kind: 'file',
      fileName: receipt.fileName,
      sizeBytes: receipt.sizeBytes,
      sha256: receipt.sha256,
      modifiedAtMs: receipt.modifiedAtMs,
      rootPath: session.rootPath,
    };
  }
  await saveDocumentToStorage(document, credentials);
  return { kind: 'browser-cache', savedAt: Date.now() };
}

/** Test seam: a fresh application start must rescan and must not inherit another test's cache. */
export function resetWorkspaceFileDocumentsForTests(): void {
  startupSnapshot = null;
  startupSnapshotPromise = null;
}
