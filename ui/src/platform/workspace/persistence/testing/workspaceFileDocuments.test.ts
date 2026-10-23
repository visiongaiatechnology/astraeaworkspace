// STATUS: PLATIN — release blocker #1: reopen restores from the durable file and the crash cache.
//
// Startup must list the native store, read/unpack the files (SHA-256 verified) and merge them with the
// IndexedDB cache by `modified_at` — no duplicates, newest content wins, file wins a tie. These tests
// mock only the two process boundaries (native bridge, IndexedDB) and keep the real merge/verify logic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WorkspaceFileStoreSession } from '../workspaceFileStoreProvider';
import {
  loadWorkspaceDocumentConflictAware,
  loadWorkspaceDocumentFromStores,
  loadWorkspaceStartupFileSnapshot,
  resetWorkspaceFileDocumentsForTests,
  saveWorkspaceDocumentDurably,
} from '../workspaceFileDocuments';
import { writeWorkspaceDocumentFile } from '../workspaceFilePersistence';
import {
  createFakeWorkspaceFileStore,
  createTestContainerCodec,
  workspaceDocumentFixture,
} from './workspaceFileTestDoubles';

const providerState = vi.hoisted(() => ({ session: null as WorkspaceFileStoreSession | null }));
const storageState = vi.hoisted(() => ({
  loadDocumentFromStorage: vi.fn(async (_documentId: string): Promise<WorkspaceDocument | null> => null),
  saveDocumentToStorage: vi.fn(async (_document: WorkspaceDocument, _credentials?: unknown): Promise<void> => undefined),
}));

vi.mock('../workspaceFileStoreProvider', () => ({
  getWorkspaceFileStoreSession: async () => providerState.session,
  revealWorkspaceFileStoreFolder: async () => true,
}));

vi.mock('../workspaceStorage', () => ({
  loadDocumentFromStorage: (documentId: string) => storageState.loadDocumentFromStorage(documentId),
  saveDocumentToStorage: (document: WorkspaceDocument, credentials?: unknown) => storageState.saveDocumentToStorage(document, credentials),
}));

const CACHE_NEWER = workspaceDocumentFixture({ id: 'doc-reopen', title: 'Cache newer', modified_at: 3_000 });

beforeEach(() => {
  resetWorkspaceFileDocumentsForTests();
  providerState.session = null;
  storageState.loadDocumentFromStorage.mockReset();
  storageState.loadDocumentFromStorage.mockResolvedValue(null);
  storageState.saveDocumentToStorage.mockReset();
  storageState.saveDocumentToStorage.mockResolvedValue(undefined);
});

afterEach(() => {
  resetWorkspaceFileDocumentsForTests();
  vi.clearAllMocks();
});

async function seedStore(): Promise<{
  store: ReturnType<typeof createFakeWorkspaceFileStore>;
  codec: Awaited<ReturnType<typeof createTestContainerCodec>>;
}> {
  const store = createFakeWorkspaceFileStore('C:\\Astraea\\workspace-store');
  const codec = await createTestContainerCodec();
  await writeWorkspaceDocumentFile(store.port, workspaceDocumentFixture({ id: 'doc-reopen', title: 'File newer', modified_at: 2_000 }), {}, codec);
  await writeWorkspaceDocumentFile(store.port, workspaceDocumentFixture({ id: 'doc-file-only', title: 'File only', kind: 'Grid', modified_at: 1_000 }), {}, codec);
  providerState.session = { store: store.port, rootPath: 'C:\\Astraea\\workspace-store' };
  return { store, codec };
}

describe('loadWorkspaceStartupFileSnapshot', () => {
  it('is empty in the browser build (no native session)', async () => {
    await expect(loadWorkspaceStartupFileSnapshot()).resolves.toMatchObject({
      available: false,
      documents: {},
      rootPath: null,
      lockedFileCount: 0,
    });
  });

  it('reads, verifies and unpacks the durable files at startup', async () => {
    const { codec } = await seedStore();

    const snapshot = await loadWorkspaceStartupFileSnapshot(codec);

    expect(snapshot.available).toBe(true);
    expect(snapshot.rootPath).toBe('C:\\Astraea\\workspace-store');
    expect(Object.keys(snapshot.documents).sort()).toEqual(['doc-file-only', 'doc-reopen']);
    expect(snapshot.documents['doc-reopen']).toMatchObject({ title: 'File newer', modified_at: 2_000 });
    expect(snapshot.receipts['doc-reopen']!.fileName).toMatch(/^doc-[0-9a-f]{32}\.vwc$/u);
    // Memoised: a second caller must not re-list the store.
    const store = providerState.session!.store as unknown as { list: () => Promise<unknown> };
    const listSpy = vi.spyOn(store, 'list');
    await loadWorkspaceStartupFileSnapshot(codec);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('counts locked and failed files instead of loading them', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec({ lockedDocumentIds: new Set(['doc-locked']) });
    await writeWorkspaceDocumentFile(store.port, workspaceDocumentFixture({ id: 'doc-locked' }), {}, codec);
    store.files.set(`doc-${'0'.repeat(32)}.vwc`, new Uint8Array([9, 9, 9, 9]));
    providerState.session = { store: store.port, rootPath: 'C:\\store' };

    const snapshot = await loadWorkspaceStartupFileSnapshot(codec);

    expect(snapshot.documents).toEqual({});
    expect(snapshot.lockedFileCount).toBe(1);
    expect(snapshot.failedFileCount).toBe(1);
  });
});

describe('loadWorkspaceDocumentConflictAware', () => {
  it('prefers the newer IndexedDB cache over an older durable file', async () => {
    const { codec } = await seedStore();
    storageState.loadDocumentFromStorage.mockResolvedValueOnce(CACHE_NEWER);

    const loaded = await loadWorkspaceDocumentConflictAware('doc-reopen', codec);

    expect(loaded).toMatchObject({ origin: 'indexeddb-cache' });
    expect(loaded!.document).toMatchObject({ title: 'Cache newer', modified_at: 3_000 });
  });

  it('prefers the newer durable file over an older cache', async () => {
    const { codec } = await seedStore();
    storageState.loadDocumentFromStorage.mockResolvedValueOnce(
      workspaceDocumentFixture({ id: 'doc-reopen', title: 'Cache older', modified_at: 500 }),
    );

    const loaded = await loadWorkspaceDocumentConflictAware('doc-reopen', codec);

    expect(loaded).toMatchObject({ origin: 'native-file' });
    expect(loaded!.document).toMatchObject({ title: 'File newer', modified_at: 2_000 });
  });

  it('falls back to the file even when the cache has no entry (store first run)', async () => {
    const { codec } = await seedStore();
    const loaded = await loadWorkspaceDocumentConflictAware('doc-file-only', codec);
    expect(loaded).toMatchObject({ origin: 'native-file' });
    expect(loaded!.document).toMatchObject({ title: 'File only', kind: 'Grid' });
  });

  it('returns null when neither source has verified content', async () => {
    providerState.session = null;
    await expect(loadWorkspaceDocumentConflictAware('doc-missing')).resolves.toBeNull();
    await expect(loadWorkspaceDocumentFromStores('doc-missing')).resolves.toBeNull();
  });
});

describe('saveWorkspaceDocumentDurably (explicit close/detach save)', () => {
  it('writes the real file first and returns the file proof', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    providerState.session = { store: store.port, rootPath: 'C:\\store' };
    const document = workspaceDocumentFixture({ id: 'doc-explicit', title: 'Explicit' });

    const proof = await saveWorkspaceDocumentDurably(document, { pin: '1234' }, codec);

    expect(proof.kind).toBe('file');
    expect(proof.kind === 'file' && proof.fileName).toMatch(/^doc-[0-9a-f]{32}\.vwc$/u);
    expect(store.files.size).toBe(1);
    expect(storageState.saveDocumentToStorage).toHaveBeenCalledOnce();
  });

  it('writes the cache only in the browser build and proves it as browser-cache', async () => {
    providerState.session = null;
    const document = workspaceDocumentFixture({ id: 'doc-browser' });
    const proof = await saveWorkspaceDocumentDurably(document);
    expect(proof.kind).toBe('browser-cache');
    expect(storageState.saveDocumentToStorage).toHaveBeenCalledOnce();
  });

  it('throws instead of reporting a proof when the file write fails', async () => {
    const store = createFakeWorkspaceFileStore();
    const codec = await createTestContainerCodec();
    store.forceWriteError(new Error('Workspace document could not be written'));
    providerState.session = { store: store.port, rootPath: 'C:\\store' };
    await expect(saveWorkspaceDocumentDurably(workspaceDocumentFixture({ id: 'doc-fail' }), {}, codec))
      .rejects.toMatchObject({ code: 'write-failed' });
    expect(storageState.saveDocumentToStorage).not.toHaveBeenCalled();
  });
});
