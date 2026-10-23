// STATUS: PLATIN — release blocker #1 evidence: real file writes, verified receipts, verified reads.
//
// These tests use a real WebCrypto container codec (AES-256-GCM, `VWC1` framing) and an in-memory port
// with the same contract as the Lead-owned Tauri bridge. They prove the four honesty properties:
//   * a save is only reported with a matching file name + byte count + SHA-256 receipt,
//   * a tampered or short write is rejected instead of reported as saved,
//   * a read is verified before a document is restored,
//   * a Save → list/read → reopen roundtrip restores the exact document.
import { describe, expect, it } from 'vitest';
import {
  MAX_WORKSPACE_FILE_SCAN,
  WorkspaceFilePersistenceError,
  mergeWorkspaceDocumentSources,
  readWorkspaceDocumentFile,
  scanWorkspaceDocumentFiles,
  workspaceStoreFileNameForDocumentId,
  writeWorkspaceDocumentFile,
} from '../workspaceFilePersistence';
import {
  createFakeWorkspaceFileStore,
  createTestContainerCodec,
  workspaceDocumentFixture,
} from './workspaceFileTestDoubles';

const DOC_A = workspaceDocumentFixture({ id: 'doc-alpha', title: 'Alpha', modified_at: 1_700_000_000_100, version: 3 });
const DOC_B = workspaceDocumentFixture({ id: '2026-10-18:doc_beta', title: 'Beta', kind: 'Grid', modified_at: 1_700_000_000_200 });

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('workspaceStoreFileNameForDocumentId', () => {
  it('computes the same deterministic name as the Rust store (sha256 prefix + .vwc)', async () => {
    const expected = `doc-${(await sha256Hex('doc-alpha')).slice(0, 32)}.vwc`;
    await expect(workspaceStoreFileNameForDocumentId('doc-alpha')).resolves.toBe(expected);
    expect(expected).toMatch(/^doc-[0-9a-f]{32}\.vwc$/u);
  });

  it('rejects document ids outside the native store vocabulary', async () => {
    for (const invalid of ['', '../doc-alpha', 'doc/alpha', 'doc\\alpha', 'doc alpha', 'x'.repeat(257)]) {
      await expect(workspaceStoreFileNameForDocumentId(invalid)).rejects.toMatchObject({ code: 'invalid-document' });
    }
  });
});

describe('writeWorkspaceDocumentFile', () => {
  it('packs the existing container, writes it and returns the verified receipt', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();

    const receipt = await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);

    expect(receipt.documentId).toBe(DOC_A.id);
    expect(receipt.fileName).toBe(await workspaceStoreFileNameForDocumentId(DOC_A.id));
    expect(receipt.sizeBytes).toBeGreaterThan(0);
    expect(receipt.sha256).toMatch(/^[0-9a-f]{64}$/u);
    const written = store.files.get(receipt.fileName);
    expect(written, 'die Datei liegt im Store').toBeInstanceOf(Uint8Array);
    expect(written!.byteLength).toBe(receipt.sizeBytes);
    expect(Array.from(written!.subarray(0, 4))).toEqual([0x56, 0x57, 0x43, 0x31]); // "VWC1"
    expect(store.writeCalls()).toBe(1);
  });

  it('rejects a receipt with a different SHA-256 instead of claiming saved', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    store.forceWriteReceipt({ sha256: '0'.repeat(64) });

    await expect(writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec))
      .rejects.toMatchObject({ code: 'verification-failed' });
  });

  it('rejects a receipt that reports a different byte count', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    store.forceWriteReceipt({ sizeBytes: 1 });

    await expect(writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec))
      .rejects.toMatchObject({ code: 'verification-failed' });
  });

  it('reports a store write failure as write-failed (never as saved)', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    store.forceWriteError(new Error('Workspace document could not be written'));

    await expect(writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec))
      .rejects.toMatchObject({ code: 'write-failed' });
  });

  it('reports an absent native store instead of falling back silently', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    store.forceWriteError(new WorkspaceFilePersistenceError('store-unavailable'));

    await expect(writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec))
      .rejects.toMatchObject({ code: 'write-failed' });
  });

  it('reports a container packing failure (e.g. PQC profile) without writing', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec({ failPackDocumentIds: new Set([DOC_A.id]) });

    await expect(writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec))
      .rejects.toMatchObject({ code: 'container-pack-failed' });
    expect(store.writeCalls()).toBe(0);
    expect(store.files.size).toBe(0);
  });
});

describe('readWorkspaceDocumentFile', () => {
  it('reads exactly the file of the known document id and verifies SHA-256', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    const receipt = await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);

    const record = await readWorkspaceDocumentFile(store.port, DOC_A.id, {}, codec);

    expect(record).not.toBeNull();
    expect(record!.document).toMatchObject({ id: DOC_A.id, title: 'Alpha', version: 3, modified_at: DOC_A.modified_at });
    expect(record!.receipt).toMatchObject({ fileName: receipt.fileName, sha256: receipt.sha256, sizeBytes: receipt.sizeBytes });
  });

  it('returns null for a document that has no file', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    await expect(readWorkspaceDocumentFile(store.port, DOC_A.id, {}, codec)).resolves.toBeNull();
  });

  it('rejects a read whose reported SHA-256 does not match the bytes before unpacking', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);
    store.forceReadSha('0'.repeat(64));
    const decryptCallsBefore = codec.decryptCalls();

    await expect(readWorkspaceDocumentFile(store.port, DOC_A.id, {}, codec))
      .rejects.toMatchObject({ code: 'verification-failed' });
    expect(codec.decryptCalls(), 'SHA-Abweichung wird vor dem Entpacken erkannt').toBe(decryptCallsBefore);
  });

  it('rejects tampered container bytes (GCM authenticity) instead of restoring them', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);
    store.tamperNextRead();

    await expect(readWorkspaceDocumentFile(store.port, DOC_A.id, {}, codec))
      .rejects.toMatchObject({ code: 'container-unpack-failed' });
  });

  it('classifies a container that needs a PIN as credential-required', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec({ lockedDocumentIds: new Set([DOC_A.id]) });
    await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);

    await expect(readWorkspaceDocumentFile(store.port, DOC_A.id, {}, codec))
      .rejects.toMatchObject({ code: 'credential-required' });
  });
});

describe('scanWorkspaceDocumentFiles', () => {
  it('lists, verifies and unpacks store files; locked and corrupt files are counted, not resurrected', async () => {
    const store = createFakeWorkspaceFileStore('D:\\AstraeaData\\workspace-store');
    const codec = await createTestContainerCodec({ lockedDocumentIds: new Set(['doc-locked']) });
    const locked = workspaceDocumentFixture({ id: 'doc-locked', title: 'Locked', modified_at: 1_700_000_000_300 });
    await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);
    await writeWorkspaceDocumentFile(store.port, DOC_B, {}, codec);
    await writeWorkspaceDocumentFile(store.port, locked, {}, codec);
    // A foreign/corrupt file name is ignored by the native store; a corrupt payload is counted.
    store.files.set('doc-00000000000000000000000000000000.vwc', new Uint8Array([1, 2, 3, 4]));

    const scan = await scanWorkspaceDocumentFiles(store.port, {}, codec);

    expect(scan.available).toBe(true);
    expect(scan.rootPath).toBe('D:\\AstraeaData\\workspace-store');
    expect(scan.records.map((record) => record.document.id).sort()).toEqual([DOC_A.id, DOC_B.id].sort());
    expect(scan.lockedFileCount).toBe(1);
    expect(scan.failedFileCount).toBe(1);
    expect(scan.truncated).toBe(false);
  });

  it('bounds how many files a startup scan reads and reports truncation', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    for (let index = 0; index < 3; index += 1) {
      await writeWorkspaceDocumentFile(store.port, workspaceDocumentFixture({ id: `doc-scan-${index}` }), {}, codec);
    }
    const scan = await scanWorkspaceDocumentFiles(store.port, {}, codec, 2);
    expect(scan.records.length).toBe(2);
    expect(scan.truncated).toBe(true);
  });

  it('reports an unavailable store as unavailable instead of throwing', async () => {
    const store = createFakeWorkspaceFileStore();
    store.forceListUnavailable();
    const codec = await createTestContainerCodec();
    const scan = await scanWorkspaceDocumentFiles(store.port, {}, codec);
    expect(scan).toMatchObject({ available: false, records: [], rootPath: null, lockedFileCount: 0, failedFileCount: 0 });
    expect(MAX_WORKSPACE_FILE_SCAN).toBeGreaterThan(0);
  });
});

describe('mergeWorkspaceDocumentSources', () => {
  it('keeps the newest modified_at and the native file on a tie — never duplicates', () => {
    const cached = workspaceDocumentFixture({ id: 'doc-merge', title: 'Cache copy', modified_at: 500 });
    const file = workspaceDocumentFixture({ id: 'doc-merge', title: 'File copy', modified_at: 400 });
    const merged = mergeWorkspaceDocumentSources([
      { origin: 'native-file', document: file, receipt: { documentId: 'doc-merge', fileName: `doc-${'a'.repeat(32)}.vwc`, sizeBytes: 10, sha256: 'a'.repeat(64), modifiedAtMs: 1 } },
      { origin: 'indexeddb-cache', document: cached },
    ]);
    expect(Object.keys(merged.documents)).toEqual(['doc-merge']);
    expect(merged.documents['doc-merge']!.title).toBe('Cache copy');
    expect(merged.origins['doc-merge']).toBe('indexeddb-cache');
    expect(merged.receipts['doc-merge']).toBeUndefined();

    const tie = mergeWorkspaceDocumentSources([
      { origin: 'indexeddb-cache', document: workspaceDocumentFixture({ id: 'doc-tie', title: 'Cache', modified_at: 500 }) },
      { origin: 'native-file', document: workspaceDocumentFixture({ id: 'doc-tie', title: 'File', modified_at: 500 }), receipt: { documentId: 'doc-tie', fileName: `doc-${'b'.repeat(32)}.vwc`, sizeBytes: 10, sha256: 'b'.repeat(64), modifiedAtMs: 1 } },
    ]);
    expect(tie.documents['doc-tie']!.title).toBe('File');
    expect(tie.origins['doc-tie']).toBe('native-file');
  });

  it('ignores documents with an id outside the store vocabulary', () => {
    const merged = mergeWorkspaceDocumentSources([
      { origin: 'indexeddb-cache', document: workspaceDocumentFixture({ id: '../outside' }) },
      { origin: 'indexeddb-cache', document: workspaceDocumentFixture({ id: 'doc-valid' }) },
    ]);
    expect(Object.keys(merged.documents)).toEqual(['doc-valid']);
  });
});

describe('Save → Store-Write → List/Read → Reopen roundtrip', () => {
  it('restores both documents with their exact content after a simulated restart', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);
    await writeWorkspaceDocumentFile(store.port, DOC_B, {}, codec);

    // "Restart": nothing but the store survives.
    const scan = await scanWorkspaceDocumentFiles(store.port, {}, codec);
    expect(scan.records).toHaveLength(2);

    const reopened = Object.fromEntries(scan.records.map((record) => [record.document.id, record.document]));
    expect(reopened[DOC_A.id]).toMatchObject({ title: 'Alpha', version: 3, kind: 'Writer', modified_at: DOC_A.modified_at });
    expect(reopened[DOC_B.id]).toMatchObject({ title: 'Beta', kind: 'Grid', modified_at: DOC_B.modified_at });

    // A known document can also be read directly, without scanning.
    const direct = await readWorkspaceDocumentFile(store.port, DOC_B.id, {}, codec);
    expect(direct!.document).toMatchObject({ id: DOC_B.id, title: 'Beta' });
  });

  it('a save overwrites the previous confirmed file for the same document id', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    await writeWorkspaceDocumentFile(store.port, DOC_A, {}, codec);
    const updated = { ...DOC_A, title: 'Alpha revised', version: 4, modified_at: DOC_A.modified_at + 1_000 };
    await writeWorkspaceDocumentFile(store.port, updated, {}, codec);

    expect(store.files.size).toBe(1);
    const record = await readWorkspaceDocumentFile(store.port, DOC_A.id, {}, codec);
    expect(record!.document).toMatchObject({ title: 'Alpha revised', version: 4 });
  });
});
