// STATUS: PLATIN — release blocker #1: autosave outcome is decided by the durable layer, not the cache.
//
// This orchestration is deliberately platform-free and browser-free so its honesty rules are testable
// without React, Tauri or IndexedDB:
//
//   1. The **native document file** is written first (when the desktop store exists). A document only
//      counts as persisted when its store receipt — file name, byte count and SHA-256 — was verified.
//   2. The IndexedDB transaction is a **crash cache** and is attempted for every dirty document. If it
//      fails while the file succeeded, the run is `saved-with-warning` (`cache-stale`), not an error.
//   3. In the browser build there is no native file store; then — and only then — the IndexedDB
//      transaction is the authoritative layer and its failure is an error. The UI marks that proof as
//      `browser-cache`, never as a file.
//   4. Recovery/version snapshots still run after a primary failure (that is when they matter), but a
//      failed primary save always stays a failed save.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import type { WorkspaceFileWriteReceipt } from '../../platform/workspace/persistence/workspaceFilePersistence';
import { WorkspaceFilePersistenceError } from '../../platform/workspace/persistence/workspaceFilePersistence';
import type { WorkspaceSaveFailureClassification, WorkspaceSaveStage } from './workspaceSaveFailure';
import { classifyWorkspaceSaveFailureDetailed } from './workspaceSaveFailure';

/** Hard bound per flush: a corrupted UI must not start hundreds of container packs. */
export const MAX_DIRTY_DOCUMENTS_PER_FLUSH = 128;

export type WorkspaceAutosaveWarning = 'cache-stale' | 'recovery-unavailable';

export interface WorkspaceAutosaveFlushDependencies {
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly documentIds: readonly string[];
  /**
   * Writes the encrypted container as a real file and returns the verified receipt.
   * `null` means: this process has no native durable store (browser build) — the cache is the only
   * available layer then.
   */
  readonly persistFile: ((document: WorkspaceDocument) => Promise<WorkspaceFileWriteReceipt | null>) | null;
  /** IndexedDB crash cache for the whole batch. */
  readonly persistCache: (documents: Record<string, WorkspaceDocument>) => Promise<void>;
  readonly persistVersionSnapshot?: (document: WorkspaceDocument) => Promise<void>;
  /** `'unavailable'` means the native recovery store is absent (STANDARD documents tolerate that). */
  readonly persistRecoverySnapshot?: ((document: WorkspaceDocument) => Promise<'written' | 'unavailable'>) | null;
  readonly isRecoveryMandatory?: (document: WorkspaceDocument) => boolean;
}

export interface WorkspaceAutosaveFlushResult {
  /** Dirty documents that were captured for this run (immutable snapshots). */
  readonly documentsToSave: Record<string, WorkspaceDocument>;
  /** Confirmed durable file writes, by document id. */
  readonly fileReceipts: Readonly<Record<string, WorkspaceFileWriteReceipt>>;
  /** Documents whose authoritative layer was confirmed (file, or cache in the browser build). */
  readonly persistedDocumentIds: readonly string[];
  /** Documents that were not persisted by the authoritative layer and stay dirty. */
  readonly failedDocumentIds: readonly string[];
  readonly failure: WorkspaceSaveFailureClassification | null;
  readonly warning: WorkspaceAutosaveWarning | null;
  /** Whether the IndexedDB crash cache committed. */
  readonly cacheConfirmed: boolean;
}

interface ClassifiedError {
  readonly error: unknown;
  readonly stage: WorkspaceSaveStage;
}

function asFailure(error: ClassifiedError): WorkspaceSaveFailureClassification {
  return classifyWorkspaceSaveFailureDetailed(error.error, error.stage);
}

/**
 * Runs one autosave flush. Never throws for per-document persistence failures — it reports them, and the
 * caller keeps the dirty state. Programming errors are still surfaced through the returned failure.
 */
export async function runWorkspaceAutosaveFlush(
  dependencies: WorkspaceAutosaveFlushDependencies,
): Promise<WorkspaceAutosaveFlushResult> {
  const boundedIds = [...new Set(dependencies.documentIds)].slice(0, MAX_DIRTY_DOCUMENTS_PER_FLUSH);
  const documentsToSave: Record<string, WorkspaceDocument> = {};
  for (const id of boundedIds) {
    const document = dependencies.documents[id];
    if (document) documentsToSave[id] = document;
  }
  const documentIds = Object.keys(documentsToSave);
  if (documentIds.length === 0) {
    return {
      documentsToSave: {},
      fileReceipts: {},
      persistedDocumentIds: [],
      failedDocumentIds: [],
      failure: null,
      warning: null,
      cacheConfirmed: true,
    };
  }

  const fileReceipts: Record<string, WorkspaceFileWriteReceipt> = {};
  const persisted = new Set<string>();
  const failed = new Set<string>();
  let firstFailure: ClassifiedError | null = null;
  let warning: WorkspaceAutosaveWarning | null = null;

  if (dependencies.persistFile) {
    const persistFile = dependencies.persistFile;
    for (const [id, document] of Object.entries(documentsToSave)) {
      try {
        const receipt = await persistFile(document);
        if (!receipt) throw new WorkspaceFilePersistenceError('store-unavailable');
        if (receipt.documentId !== id) throw new WorkspaceFilePersistenceError('verification-failed');
        fileReceipts[id] = receipt;
        persisted.add(id);
      } catch (error: unknown) {
        failed.add(id);
        if (!firstFailure) firstFailure = { error, stage: 'native-file' };
      }
    }
  }

  let cacheConfirmed = false;
  let cacheFailure: ClassifiedError | null = null;
  try {
    await dependencies.persistCache(documentsToSave);
    cacheConfirmed = true;
  } catch (error: unknown) {
    cacheFailure = { error, stage: 'indexeddb-cache' };
    if (!dependencies.persistFile) {
      // Browser build: the cache is the only durable layer, so its failure is the save's failure.
      for (const id of documentIds) failed.add(id);
      if (!firstFailure) firstFailure = cacheFailure;
    } else {
      warning = 'cache-stale';
    }
  }
  if (!dependencies.persistFile && cacheConfirmed) {
    for (const id of documentIds) persisted.add(id);
  }

  if (dependencies.persistVersionSnapshot) {
    for (const document of Object.values(documentsToSave)) {
      try {
        await dependencies.persistVersionSnapshot(document);
      } catch (error: unknown) {
        if (!firstFailure) firstFailure = { error, stage: 'unknown' };
      }
    }
  }

  if (dependencies.persistRecoverySnapshot) {
    const isMandatory = dependencies.isRecoveryMandatory ?? (() => false);
    const persistRecovery = dependencies.persistRecoverySnapshot;
    for (const document of Object.values(documentsToSave)) {
      try {
        const outcome = await persistRecovery(document);
        if (outcome === 'unavailable') {
          if (isMandatory(document)) {
            if (!firstFailure) firstFailure = { error: new Error('RECOVERY_REQUIRED_UNAVAILABLE'), stage: 'unknown' };
          } else {
            warning = 'recovery-unavailable';
          }
        }
      } catch (error: unknown) {
        if (isMandatory(document)) {
          if (!firstFailure) firstFailure = { error, stage: 'unknown' };
        } else {
          warning = 'recovery-unavailable';
        }
      }
    }
  }

  const failedDocumentIds = documentIds.filter((id) => !persisted.has(id));
  return {
    documentsToSave,
    fileReceipts,
    persistedDocumentIds: [...persisted],
    failedDocumentIds,
    failure: firstFailure ? asFailure(firstFailure) : null,
    warning,
    cacheConfirmed,
  };
}
