// STATUS: PLATIN — release blocker #1: real document files, honest receipts, no silent loss.
//
// The browser build has never written a document **file**; "saved" only ever meant that an
// IndexedDB transaction committed. The native build now has an atomic, app-data-directory file
// store (`ui/src/platform/native/workspaceFileStore.ts`, bridge to
// `crates/vgt-desktop/src/workspace_store_bridge.rs`). This module is the platform-independent
// orchestration around it:
//
//   * pack the **existing** encrypted VWC container (no new crypto) from the canonical document,
//   * write it to the store and verify the returned receipt (file name, byte count, SHA-256),
//   * read files back and verify their SHA-256/byte count before unpacking,
//   * merge file documents with the IndexedDB crash cache by `modified_at` without duplicates.
//
// Filtering rules stay authoritative in Rust; this module additionally verifies every receipt
// locally, because a "saved" claim must be independently checkable and never derived from a
// protocol the UI cannot confirm.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { packContainer, unpackContainer } from '../../containers/container';
import { sha256HexBytes } from './workspaceStorageCrypto';

/** Bound for a startup scan: reading a store full of documents must never stall the shell. */
export const MAX_WORKSPACE_FILE_SCAN = 64;
/** Same document-id vocabulary as `validate_document_id` in the Rust store bridge. */
export const WORKSPACE_FILE_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/u;
/** Deterministic store file name issued by the Rust bridge (`store_file_name`). */
const WORKSPACE_STORE_FILE_NAME_PATTERN = /^doc-[0-9a-f]{32}\.vwc$/u;

export interface WorkspaceDocumentCredentials {
  readonly pin?: string;
  readonly password?: string;
}

export interface WorkspaceStoreFileEntry {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly modifiedAtMs: number;
}

export interface WorkspaceStoreListing {
  readonly rootPath: string;
  readonly files: readonly WorkspaceStoreFileEntry[];
}

export interface WorkspaceStoreWriteReceipt {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly modifiedAtMs: number;
}

export interface WorkspaceStoreFileContent extends WorkspaceStoreWriteReceipt {
  readonly bytes: Uint8Array;
}

/**
 * Narrow consumption port for the Lead-owned bridge. Deliberately smaller than the bridge so the
 * orchestration stays testable without Tauri and so a different durable backend can be plugged in.
 */
export interface WorkspaceFileStorePort {
  list(): Promise<WorkspaceStoreListing | null>;
  write(documentId: string, bytes: Uint8Array): Promise<WorkspaceStoreWriteReceipt | null>;
  read(fileName: string): Promise<WorkspaceStoreFileContent | null>;
  remove(fileName: string): Promise<boolean>;
  reveal(): Promise<boolean>;
}

export interface WorkspaceContainerCodec {
  pack(document: WorkspaceDocument, credentials: WorkspaceDocumentCredentials): Promise<Uint8Array>;
  unpack(bytes: Uint8Array, credentials: WorkspaceDocumentCredentials): Promise<WorkspaceDocument>;
}

/**
 * Sovereign codec: the native desktop packs through the Rust Workspace Core (device-key container
 * that survives an IndexedDB wipe), everything else keeps the local encrypted browser container.
 */
export const sovereignContainerCodec: WorkspaceContainerCodec = {
  pack: (document, credentials) => packContainer(document, { pin: credentials.pin, password: credentials.password }),
  unpack: (bytes, credentials) => unpackContainer(bytes, { pin: credentials.pin, password: credentials.password }),
};

export type WorkspaceFilePersistenceErrorCode =
  | 'invalid-document'
  | 'container-pack-failed'
  | 'container-unpack-failed'
  | 'store-unavailable'
  | 'write-failed'
  | 'read-failed'
  | 'verification-failed'
  | 'credential-required';

export class WorkspaceFilePersistenceError extends Error {
  constructor(readonly code: WorkspaceFilePersistenceErrorCode, options?: { cause?: unknown }) {
    super(`Workspace file persistence rejected: ${code}`);
    this.name = 'WorkspaceFilePersistenceError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

const CREDENTIAL_ERROR_CODES = new Set(['PIN_REQUIRED', 'PASSWORD_REQUIRED', 'RECIPIENT_KEY_REQUIRED']);

export function isWorkspaceCredentialError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (CREDENTIAL_ERROR_CODES.has(error.message)) return true;
  const text = error.message.toLowerCase();
  return text.includes('pin required') || text.includes('password required') || text.includes('pin_required') || text.includes('password_required');
}

export interface WorkspaceFileWriteReceipt extends WorkspaceStoreWriteReceipt {
  readonly documentId: string;
}

/**
 * Proof of the **last confirmed** persistence of a document. `file` means a real native document file
 * with a verified receipt; `browser-cache` means the IndexedDB cache only — no file exists.
 */
export interface WorkspaceSaveFileProof {
  readonly kind: 'file';
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly modifiedAtMs: number;
  /** Application-data directory of the native store, when known (tooltip / "Ordner öffnen"). */
  readonly rootPath: string | null;
}

export interface WorkspaceSaveBrowserProof {
  readonly kind: 'browser-cache';
  readonly savedAt: number;
}

export type WorkspaceSaveProof = WorkspaceSaveFileProof | WorkspaceSaveBrowserProof;

export interface WorkspaceFileDocumentRecord {
  readonly document: WorkspaceDocument;
  readonly receipt: WorkspaceFileWriteReceipt;
}

function assertStoreFileEntry(entry: WorkspaceStoreFileEntry, index: number): void {
  if (!entry || typeof entry !== 'object') throw new WorkspaceFilePersistenceError('read-failed');
  if (!WORKSPACE_STORE_FILE_NAME_PATTERN.test(entry.fileName)) throw new WorkspaceFilePersistenceError('verification-failed');
  if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) throw new WorkspaceFilePersistenceError('verification-failed');
  if (!Number.isSafeInteger(entry.modifiedAtMs) || entry.modifiedAtMs < 0) throw new WorkspaceFilePersistenceError('verification-failed');
  if (index >= MAX_WORKSPACE_FILE_SCAN * 8) throw new WorkspaceFilePersistenceError('read-failed');
}

/**
 * The store file name is deterministic: `doc-` + first 32 hex chars of SHA-256(documentId)`.vwc`.
 * Being able to compute it lets a reopen read exactly the file of a known document instead of
 * scanning and decrypting the whole store.
 */
export async function workspaceStoreFileNameForDocumentId(documentId: string): Promise<string> {
  if (typeof documentId !== 'string' || !WORKSPACE_FILE_DOCUMENT_ID_PATTERN.test(documentId)) {
    throw new WorkspaceFilePersistenceError('invalid-document');
  }
  const digest = await sha256HexBytes(new TextEncoder().encode(documentId));
  return `doc-${digest.slice(0, 32)}.vwc`;
}

function verifyFileContent(content: WorkspaceStoreFileContent, expectedFileName: string | null, expectedSha256: string | null): void {
  if (!(content.bytes instanceof Uint8Array) || content.bytes.byteLength === 0) {
    throw new WorkspaceFilePersistenceError('verification-failed');
  }
  if (expectedFileName !== null && content.fileName !== expectedFileName) {
    throw new WorkspaceFilePersistenceError('verification-failed');
  }
  if (!WORKSPACE_STORE_FILE_NAME_PATTERN.test(content.fileName)) {
    throw new WorkspaceFilePersistenceError('verification-failed');
  }
  if (!Number.isSafeInteger(content.sizeBytes) || content.sizeBytes !== content.bytes.byteLength) {
    throw new WorkspaceFilePersistenceError('verification-failed');
  }
  if (expectedSha256 !== null && content.sha256 !== expectedSha256) {
    throw new WorkspaceFilePersistenceError('verification-failed');
  }
  if (!/^[0-9a-f]{64}$/u.test(content.sha256)) throw new WorkspaceFilePersistenceError('verification-failed');
}

async function unpackVerifiedContainer(
  content: WorkspaceStoreFileContent,
  expectedDocumentId: string | null,
  codec: WorkspaceContainerCodec,
  credentials: WorkspaceDocumentCredentials,
): Promise<WorkspaceDocument> {
  if (await sha256HexBytes(content.bytes) !== content.sha256) {
    throw new WorkspaceFilePersistenceError('verification-failed');
  }
  let document: WorkspaceDocument;
  try {
    document = await codec.unpack(content.bytes, credentials);
  } catch (error: unknown) {
    if (isWorkspaceCredentialError(error)) throw new WorkspaceFilePersistenceError('credential-required', { cause: error });
    throw new WorkspaceFilePersistenceError('container-unpack-failed', { cause: error });
  }
  if (!document || typeof document !== 'object' || typeof document.id !== 'string') {
    throw new WorkspaceFilePersistenceError('container-unpack-failed');
  }
  if (!WORKSPACE_FILE_DOCUMENT_ID_PATTERN.test(document.id)) {
    throw new WorkspaceFilePersistenceError('container-unpack-failed');
  }
  if (expectedDocumentId !== null && document.id !== expectedDocumentId) {
    throw new WorkspaceFilePersistenceError('verification-failed');
  }
  return document;
}

/**
 * Packs the canonical document into the existing encrypted container, writes it to the file store
 * and verifies the returned receipt before reporting a durable file. Never resolves after a write
 * the desktop did not confirm byte-for-byte.
 */
export async function writeWorkspaceDocumentFile(
  store: WorkspaceFileStorePort,
  document: WorkspaceDocument,
  credentials: WorkspaceDocumentCredentials = {},
  codec: WorkspaceContainerCodec = sovereignContainerCodec,
): Promise<WorkspaceFileWriteReceipt> {
  const expectedFileName = await workspaceStoreFileNameForDocumentId(document.id);
  let bytes: Uint8Array;
  try {
    bytes = await codec.pack(document, credentials);
  } catch (error: unknown) {
    throw new WorkspaceFilePersistenceError('container-pack-failed', { cause: error });
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new WorkspaceFilePersistenceError('container-pack-failed');
  }
  const sha256 = await sha256HexBytes(bytes);
  let receipt: WorkspaceStoreWriteReceipt | null;
  try {
    receipt = await store.write(document.id, bytes);
  } catch (error: unknown) {
    throw new WorkspaceFilePersistenceError('write-failed', { cause: error });
  }
  if (!receipt) throw new WorkspaceFilePersistenceError('store-unavailable');
  if (receipt.fileName !== expectedFileName) throw new WorkspaceFilePersistenceError('verification-failed');
  if (!Number.isSafeInteger(receipt.sizeBytes) || receipt.sizeBytes !== bytes.byteLength) throw new WorkspaceFilePersistenceError('verification-failed');
  if (receipt.sha256 !== sha256) throw new WorkspaceFilePersistenceError('verification-failed');
  if (!Number.isSafeInteger(receipt.modifiedAtMs) || receipt.modifiedAtMs < 0) throw new WorkspaceFilePersistenceError('verification-failed');
  return { documentId: document.id, fileName: receipt.fileName, sizeBytes: receipt.sizeBytes, sha256, modifiedAtMs: receipt.modifiedAtMs };
}

/** Reads exactly one known document from the store — no scan, no guessing, SHA-256 verified. */
export async function readWorkspaceDocumentFile(
  store: WorkspaceFileStorePort,
  documentId: string,
  credentials: WorkspaceDocumentCredentials = {},
  codec: WorkspaceContainerCodec = sovereignContainerCodec,
): Promise<WorkspaceFileDocumentRecord | null> {
  const expectedFileName = await workspaceStoreFileNameForDocumentId(documentId);
  let content: WorkspaceStoreFileContent | null;
  try {
    content = await store.read(expectedFileName);
  } catch (error: unknown) {
    throw new WorkspaceFilePersistenceError('read-failed', { cause: error });
  }
  if (!content) return null;
  verifyFileContent(content, expectedFileName, null);
  const document = await unpackVerifiedContainer(content, documentId, codec, credentials);
  return {
    document,
    receipt: {
      documentId,
      fileName: content.fileName,
      sizeBytes: content.sizeBytes,
      sha256: content.sha256,
      modifiedAtMs: content.modifiedAtMs,
    },
  };
}

export interface WorkspaceFileScanResult {
  readonly available: boolean;
  readonly rootPath: string | null;
  readonly records: readonly WorkspaceFileDocumentRecord[];
  /** Files whose container needs a PIN/passphrase before it can be verified/opened. */
  readonly lockedFileCount: number;
  /** Files that exist but failed verification or unpacking — never silently resurrected. */
  readonly failedFileCount: number;
  /** More files exist than the bounded startup scan reads. */
  readonly truncated: boolean;
}

/**
 * Bounded startup scan. The store is metadata-listed, then files are read, SHA-256-verified and
 * unpacked. Duplicate document ids keep the newest `modifiedAtMs`; unreadable files are counted,
 * never silently dropped.
 *
 * Reads run with bounded concurrency: every file is one native IPC round-trip plus a container
 * verification, so a sequential scan of the 64-file startup window would add avoidable latency.
 * The reduction below still runs in listing order, so duplicate/tie behaviour stays deterministic.
 */
export const WORKSPACE_FILE_SCAN_CONCURRENCY = 4;

interface WorkspaceFileScanOutcome {
  readonly record: WorkspaceFileDocumentRecord | null;
  readonly locked: boolean;
  readonly failed: boolean;
}

export async function scanWorkspaceDocumentFiles(
  store: WorkspaceFileStorePort,
  credentials: WorkspaceDocumentCredentials = {},
  codec: WorkspaceContainerCodec = sovereignContainerCodec,
  maxFiles = MAX_WORKSPACE_FILE_SCAN,
): Promise<WorkspaceFileScanResult> {
  let listing: WorkspaceStoreListing | null;
  try {
    listing = await store.list();
  } catch {
    return { available: false, rootPath: null, records: [], lockedFileCount: 0, failedFileCount: 0, truncated: false };
  }
  if (!listing) return { available: false, rootPath: null, records: [], lockedFileCount: 0, failedFileCount: 0, truncated: false };
  const boundedMax = Number.isSafeInteger(maxFiles) ? Math.max(0, Math.min(maxFiles, MAX_WORKSPACE_FILE_SCAN)) : MAX_WORKSPACE_FILE_SCAN;
  const entries = [...listing.files].sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
  const selected = entries.slice(0, boundedMax);
  const truncated = entries.length > selected.length;

  const readOne = async (entry: WorkspaceStoreListing['files'][number], index: number): Promise<WorkspaceFileScanOutcome> => {
    try {
      assertStoreFileEntry(entry, index);
    } catch {
      return { record: null, locked: false, failed: true };
    }
    try {
      const content = await store.read(entry.fileName);
      if (!content) return { record: null, locked: false, failed: true };
      verifyFileContent(content, entry.fileName, null);
      if (content.sizeBytes !== entry.sizeBytes) return { record: null, locked: false, failed: true };
      const document = await unpackVerifiedContainer(content, null, codec, credentials);
      return {
        record: {
          document,
          receipt: {
            documentId: document.id,
            fileName: content.fileName,
            sizeBytes: content.sizeBytes,
            sha256: content.sha256,
            modifiedAtMs: content.modifiedAtMs,
          },
        },
        locked: false,
        failed: false,
      };
    } catch (error: unknown) {
      if (error instanceof WorkspaceFilePersistenceError && error.code === 'credential-required') {
        return { record: null, locked: true, failed: false };
      }
      return { record: null, locked: false, failed: true };
    }
  };

  const outcomes: WorkspaceFileScanOutcome[] = new Array(selected.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < selected.length) {
      const index = nextIndex;
      nextIndex += 1;
      outcomes[index] = await readOne(selected[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(WORKSPACE_FILE_SCAN_CONCURRENCY, selected.length) }, worker),
  );

  const byDocumentId = new Map<string, WorkspaceFileDocumentRecord>();
  let lockedFileCount = 0;
  let failedFileCount = 0;
  for (const outcome of outcomes) {
    if (outcome.locked) lockedFileCount += 1;
    if (outcome.failed) failedFileCount += 1;
    const record = outcome.record;
    if (!record) continue;
    const existing = byDocumentId.get(record.document.id);
    if (!existing || record.receipt.modifiedAtMs >= existing.receipt.modifiedAtMs) byDocumentId.set(record.document.id, record);
  }

  return {
    available: true,
    rootPath: listing.rootPath,
    records: [...byDocumentId.values()],
    lockedFileCount,
    failedFileCount,
    truncated,
  };
}

export type WorkspaceDocumentOrigin = 'native-file' | 'indexeddb-cache';

export interface WorkspaceDocumentSource {
  readonly origin: WorkspaceDocumentOrigin;
  readonly document: WorkspaceDocument;
  readonly receipt?: WorkspaceFileWriteReceipt;
}

function documentModifiedAt(document: WorkspaceDocument): number {
  return typeof document.modified_at === 'number' && Number.isFinite(document.modified_at) ? document.modified_at : 0;
}

/**
 * Merge rule: newest `modified_at` wins; `native-file` wins a tie because the file is the
 * authoritative durable copy and the cache only a crash aid. No duplicate document ids.
 */
export function mergeWorkspaceDocumentSources(sources: readonly WorkspaceDocumentSource[]): {
  readonly documents: Record<string, WorkspaceDocument>;
  readonly origins: Record<string, WorkspaceDocumentOrigin>;
  readonly receipts: Record<string, WorkspaceFileWriteReceipt>;
} {
  const documents: Record<string, WorkspaceDocument> = {};
  const origins: Record<string, WorkspaceDocumentOrigin> = {};
  const receipts: Record<string, WorkspaceFileWriteReceipt> = {};
  for (const source of sources) {
    const candidate = source.document;
    if (!candidate || typeof candidate.id !== 'string' || !WORKSPACE_FILE_DOCUMENT_ID_PATTERN.test(candidate.id)) continue;
    const existing = documents[candidate.id];
    if (existing) {
      const existingOrigin = origins[candidate.id]!;
      const candidateIsNewer = documentModifiedAt(candidate) > documentModifiedAt(existing)
        || (documentModifiedAt(candidate) === documentModifiedAt(existing) && source.origin === 'native-file' && existingOrigin !== 'native-file');
      if (!candidateIsNewer) continue;
    }
    documents[candidate.id] = candidate;
    origins[candidate.id] = source.origin;
    if (source.receipt && source.origin === 'native-file') receipts[candidate.id] = source.receipt;
    else delete receipts[candidate.id];
  }
  return { documents, origins, receipts };
}
