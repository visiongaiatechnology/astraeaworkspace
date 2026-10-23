// STATUS: PLATIN — real (WebCrypto) test doubles for the durable Workspace file store.
//
// The roundtrip tests must exercise **real container bytes**: a fake codec returning JSON would not
// prove that size/hash verification works. The test codec below encrypts with AES-256-GCM through
// WebCrypto (no new production crypto — test-only), prefixes the canonical `VWC1` framing magic and
// therefore behaves like the native container byte-for-byte from the store's point of view.
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { toOwnedArrayBuffer } from '../../../../shared/binary/ownedBufferSource';
import { sha256HexBytes } from '../workspaceStorageCrypto';
import {
  workspaceStoreFileNameForDocumentId,
  type WorkspaceContainerCodec,
  type WorkspaceDocumentCredentials,
  type WorkspaceFileStorePort,
  type WorkspaceStoreFileContent,
  type WorkspaceStoreFileEntry,
  type WorkspaceStoreListing,
  type WorkspaceStoreWriteReceipt,
} from '../workspaceFilePersistence';

export interface FakeWorkspaceFileStore {
  readonly port: WorkspaceFileStorePort;
  readonly files: Map<string, Uint8Array>;
  readonly fileNameByDocumentId: Map<string, string>;
  forceListUnavailable(): void;
  forceWriteError(error: Error | null): void;
  forceWriteReceipt(overrides: Partial<WorkspaceStoreWriteReceipt> | null): void;
  tamperNextRead(): void;
  /** Makes the next read report a SHA-256 that does not match its bytes (tamper evidence). */
  forceReadSha(sha256: string | null): void;
  failNextRead(): void;
  listCalls(): number;
  readCalls(): number;
  writeCalls(): number;
}

/** In-memory port with the same contract shape the Lead-owned Tauri bridge fulfils. */
export function createFakeWorkspaceFileStore(rootPath = 'C:\\Astraea\\Workspace\\workspace-store'): FakeWorkspaceFileStore {
  const files = new Map<string, Uint8Array>();
  const modifiedByFileName = new Map<string, number>();
  const fileNameByDocumentId = new Map<string, string>();
  let listAvailable = true;
  let writeError: Error | null = null;
  let receiptOverrides: Partial<WorkspaceStoreWriteReceipt> | null = null;
  let tamperRead = false;
  let readShaOverride: string | null = null;
  let failRead = false;
  let clock = 1_700_000_000_000;
  let listCount = 0;
  let readCount = 0;
  let writeCount = 0;

  const toContent = async (fileName: string, bytes: Uint8Array): Promise<WorkspaceStoreFileContent> => ({
    fileName,
    bytes,
    sizeBytes: bytes.byteLength,
    sha256: await sha256HexBytes(bytes),
    modifiedAtMs: modifiedByFileName.get(fileName) ?? clock,
  });

  const port: WorkspaceFileStorePort = {
    async list(): Promise<WorkspaceStoreListing | null> {
      listCount += 1;
      if (!listAvailable) return null;
      const entries: WorkspaceStoreFileEntry[] = [...files.entries()].map(([fileName, bytes]) => ({
        fileName,
        sizeBytes: bytes.byteLength,
        modifiedAtMs: modifiedByFileName.get(fileName) ?? clock,
      }));
      return { rootPath, files: entries };
    },
    async write(documentId: string, bytes: Uint8Array): Promise<WorkspaceStoreWriteReceipt | null> {
      writeCount += 1;
      if (writeError) throw writeError;
      const fileName = await workspaceStoreFileNameForDocumentId(documentId);
      // Copy, like a real process boundary does.
      files.set(fileName, new Uint8Array(bytes));
      clock += 1_000;
      modifiedByFileName.set(fileName, clock);
      fileNameByDocumentId.set(documentId, fileName);
      const sha256 = await sha256HexBytes(bytes);
      return {
        fileName,
        sizeBytes: bytes.byteLength,
        sha256,
        modifiedAtMs: clock,
        ...receiptOverrides,
      };
    },
    async read(fileName: string): Promise<WorkspaceStoreFileContent | null> {
      readCount += 1;
      if (failRead) throw new Error('Workspace document could not be read');
      let bytes = files.get(fileName);
      if (!bytes) return null;
      if (tamperRead) {
        bytes = new Uint8Array(bytes);
        bytes[bytes.byteLength - 1] = (bytes[bytes.byteLength - 1]! ^ 0xff) & 0xff;
        tamperRead = false;
      }
      const content = await toContent(fileName, bytes);
      return readShaOverride ? { ...content, sha256: readShaOverride } : content;
    },
    async remove(fileName: string): Promise<boolean> {
      return files.delete(fileName);
    },
    async reveal(): Promise<boolean> {
      return true;
    },
  };

  return {
    port,
    files,
    fileNameByDocumentId,
    forceListUnavailable: () => { listAvailable = false; },
    forceWriteError: (error) => { writeError = error; },
    forceWriteReceipt: (overrides) => { receiptOverrides = overrides; },
    tamperNextRead: () => { tamperRead = true; },
    forceReadSha: (sha256) => { readShaOverride = sha256; },
    failNextRead: () => { failRead = true; },
    listCalls: () => listCount,
    readCalls: () => readCount,
    writeCalls: () => writeCount,
  };
}

export interface TestContainerCodec extends WorkspaceContainerCodec {
  readonly decryptCalls: () => number;
}

const MAGIC = new TextEncoder().encode('VWC1');

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

/**
 * Test codec: AES-256-GCM through WebCrypto. `lockedDocumentIds` simulates containers that require a
 * PIN/passphrase to unlock (decrypt first, then refuse) so the restore logic's "locked" path is real.
 */
export async function createTestContainerCodec(options: {
  lockedDocumentIds?: ReadonlySet<string>;
  failPackDocumentIds?: ReadonlySet<string>;
} = {}): Promise<TestContainerCodec> {
  const key = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let decryptCalls = 0;
  return {
    async pack(document: WorkspaceDocument, _credentials: WorkspaceDocumentCredentials): Promise<Uint8Array> {
      if (options.failPackDocumentIds?.has(document.id)) throw new Error('PQC_PROFILE_NOT_OPERATIONAL');
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: toOwnedArrayBuffer(iv) },
        key,
        toOwnedArrayBuffer(encoder.encode(JSON.stringify(document))),
      );
      return concatBytes([MAGIC, iv, new Uint8Array(ciphertext)]);
    },
    async unpack(bytes: Uint8Array, _credentials: WorkspaceDocumentCredentials): Promise<WorkspaceDocument> {
      decryptCalls += 1;
      const magic = decoder.decode(bytes.subarray(0, 4));
      if (magic !== 'VWC1') throw new Error('Unrecognized container format');
      const iv = bytes.subarray(4, 16);
      const plaintext = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toOwnedArrayBuffer(iv) },
        key,
        toOwnedArrayBuffer(bytes.subarray(16)),
      );
      const document = JSON.parse(decoder.decode(new Uint8Array(plaintext))) as WorkspaceDocument;
      if (options.lockedDocumentIds?.has(document.id)) throw new Error('PIN_REQUIRED');
      return document;
    },
    decryptCalls: () => decryptCalls,
  };
}

/** Minimal valid WorkspaceDocument for persistence tests (shape accepted by the container mocks). */
export function workspaceDocumentFixture(overrides: Partial<WorkspaceDocument> & Pick<WorkspaceDocument, 'id'>): WorkspaceDocument {
  return {
    title: overrides.id,
    kind: 'Writer',
    created_at: 1_700_000_000_000,
    modified_at: 1_700_000_000_000,
    version: 1,
    theme_id: 'astraea-dark',
    root_object_ids: [],
    objects: {},
    ...overrides,
  } as WorkspaceDocument;
}
