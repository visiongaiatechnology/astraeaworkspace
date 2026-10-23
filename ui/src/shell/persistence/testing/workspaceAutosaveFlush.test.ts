// STATUS: PLATIN — release blocker #1 evidence: the durable layer decides the save outcome.
//
// The autosave orchestration is intentionally free of React/Tauri/IndexedDB so these tests can prove —
// with no rendered UI — that:
//   * a document is only "persisted" after its verified file receipt,
//   * a failed file write keeps the document dirty and becomes an error (never "saved"),
//   * an IndexedDB failure cannot destroy a confirmed file save (warning, not error),
//   * in the browser build the cache is the only layer and its failure is a real error,
//   * recovery snapshots still run after a failed primary save but cannot downgrade its status.
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceFileWriteReceipt } from '../../../platform/workspace/persistence/workspaceFilePersistence';
import { WorkspaceFilePersistenceError } from '../../../platform/workspace/persistence/workspaceFilePersistence';
import { runWorkspaceAutosaveFlush, MAX_DIRTY_DOCUMENTS_PER_FLUSH } from '../workspaceAutosaveFlush';

function documentFixture(id: string, overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id,
    title: id,
    kind: 'Writer',
    created_at: 1,
    modified_at: 2,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    ...overrides,
  } as WorkspaceDocument;
}

function receiptFor(documentId: string): WorkspaceFileWriteReceipt {
  return {
    documentId,
    fileName: `doc-${'a'.repeat(32)}.vwc`,
    sizeBytes: 128,
    sha256: 'b'.repeat(64),
    modifiedAtMs: 1_700_000_000_000,
  };
}

const DOC_A = documentFixture('doc-a');
const DOC_B = documentFixture('doc-b', { kind: 'Grid' });

describe('runWorkspaceAutosaveFlush — native file layer', () => {
  it('persists only documents with a verified file receipt', async () => {
    const persistCache = vi.fn(async () => undefined);
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A, 'doc-b': DOC_B },
      documentIds: ['doc-a', 'doc-b'],
      persistFile: async (document) => receiptFor(document.id),
      persistCache,
    });

    expect([...result.persistedDocumentIds].sort()).toEqual(['doc-a', 'doc-b']);
    expect(result.failedDocumentIds).toEqual([]);
    expect(result.failure).toBeNull();
    expect(result.warning).toBeNull();
    expect(result.cacheConfirmed).toBe(true);
    expect(Object.keys(result.fileReceipts).sort()).toEqual(['doc-a', 'doc-b']);
    expect(persistCache).toHaveBeenCalledOnce();
  });

  it('a failed file write keeps the document failed/dirty and classifies the stage', async () => {
    const persistCache = vi.fn(async () => undefined);
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A, 'doc-b': DOC_B },
      documentIds: ['doc-a', 'doc-b'],
      persistFile: async (document) => {
        if (document.id === 'doc-b') throw new WorkspaceFilePersistenceError('write-failed', { cause: Object.assign(new Error('no space'), { code: 'ENOSPC' }) });
        return receiptFor(document.id);
      },
      persistCache,
    });

    expect(result.persistedDocumentIds).toEqual(['doc-a']);
    expect(result.failedDocumentIds).toEqual(['doc-b']);
    expect(result.failure).toEqual({ code: 'storage-full', detail: 'file-write-failed' });
    // The cache is still attempted for the crash path — but it cannot turn the failure into a success.
    expect(persistCache).toHaveBeenCalledOnce();
    expect(result.cacheConfirmed).toBe(true);
  });

  it('a receipt for the wrong document id is not accepted as saved', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: async () => receiptFor('doc-other'),
      persistCache: async () => undefined,
    });
    expect(result.persistedDocumentIds).toEqual([]);
    expect(result.failedDocumentIds).toEqual(['doc-a']);
    expect(result.failure?.detail).toBe('file-verification-failed');
  });

  it('a store that reports no file (null receipt) fails the document instead of silently falling back', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: async () => null,
      persistCache: async () => undefined,
    });
    expect(result.failedDocumentIds).toEqual(['doc-a']);
    expect(result.failure).toEqual({ code: 'native-unavailable', detail: 'store-unavailable' });
  });

  it('an IndexedDB cache failure cannot destroy a confirmed file save (warning, not error)', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: async (document) => receiptFor(document.id),
      persistCache: async () => { throw new Error('IndexedDB transaction aborted'); },
    });

    expect(result.persistedDocumentIds).toEqual(['doc-a']);
    expect(result.failedDocumentIds).toEqual([]);
    expect(result.failure).toBeNull();
    expect(result.warning).toBe('cache-stale');
    expect(result.cacheConfirmed).toBe(false);
  });

  it('never processes more than the hard per-flush bound', async () => {
    const documents: Record<string, WorkspaceDocument> = {};
    const ids: string[] = [];
    for (let index = 0; index < MAX_DIRTY_DOCUMENTS_PER_FLUSH + 5; index += 1) {
      const id = `doc-bound-${index}`;
      documents[id] = documentFixture(id);
      ids.push(id);
    }
    const persistFile = vi.fn(async (document: WorkspaceDocument) => receiptFor(document.id));
    const result = await runWorkspaceAutosaveFlush({
      documents,
      documentIds: ids,
      persistFile,
      persistCache: async () => undefined,
    });
    expect(persistFile).toHaveBeenCalledTimes(MAX_DIRTY_DOCUMENTS_PER_FLUSH);
    expect(result.persistedDocumentIds).toHaveLength(MAX_DIRTY_DOCUMENTS_PER_FLUSH);
  });
});

describe('runWorkspaceAutosaveFlush — browser fallback (no native store)', () => {
  it('the IndexedDB cache is the authoritative layer when no file store exists', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: null,
      persistCache: async () => undefined,
    });
    expect(result.persistedDocumentIds).toEqual(['doc-a']);
    expect(result.failedDocumentIds).toEqual([]);
    expect(result.fileReceipts).toEqual({});
    expect(result.failure).toBeNull();
  });

  it('a cache failure is a real save failure in the browser build', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: null,
      persistCache: async () => { throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' }); },
    });
    expect(result.persistedDocumentIds).toEqual([]);
    expect(result.failedDocumentIds).toEqual(['doc-a']);
    expect(result.failure?.detail).toBe('cache-write-failed');
  });
});

describe('runWorkspaceAutosaveFlush — recovery snapshots', () => {
  it('a tolerated unavailable recovery store becomes a warning, not a failure', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: async (document) => receiptFor(document.id),
      persistCache: async () => undefined,
      persistRecoverySnapshot: async () => 'unavailable',
      isRecoveryMandatory: () => false,
    });
    expect(result.persistedDocumentIds).toEqual(['doc-a']);
    expect(result.failure).toBeNull();
    expect(result.warning).toBe('recovery-unavailable');
  });

  it('a mandatory recovery store that is unavailable fails the save of a protected document', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: async (document) => receiptFor(document.id),
      persistCache: async () => undefined,
      persistRecoverySnapshot: async () => 'unavailable',
      isRecoveryMandatory: () => true,
    });
    expect(result.failure).not.toBeNull();
  });

  it('runs recovery after a failed primary save and keeps the failure', async () => {
    const recovery = vi.fn(async () => 'written' as const);
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: async () => { throw new WorkspaceFilePersistenceError('write-failed'); },
      persistCache: async () => undefined,
      persistRecoverySnapshot: recovery,
    });
    expect(recovery).toHaveBeenCalledOnce();
    expect(result.failedDocumentIds).toEqual(['doc-a']);
    expect(result.failure?.detail).toBe('file-write-failed');
  });

  it('a version snapshot failure is reported but a confirmed file still counts as persisted', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-a': DOC_A },
      documentIds: ['doc-a'],
      persistFile: async (document) => receiptFor(document.id),
      persistCache: async () => undefined,
      persistVersionSnapshot: async () => { throw new Error('version store unavailable'); },
    });
    expect(result.persistedDocumentIds).toEqual(['doc-a']);
    expect(result.failure).not.toBeNull();
  });
});

describe('runWorkspaceAutosaveFlush — empty flush', () => {
  it('does nothing when there is no dirty document', async () => {
    const persistFile = vi.fn(async (document: WorkspaceDocument) => receiptFor(document.id));
    const persistCache = vi.fn(async () => undefined);
    const result = await runWorkspaceAutosaveFlush({ documents: {}, documentIds: [], persistFile, persistCache });
    expect(result.persistedDocumentIds).toEqual([]);
    expect(result.failure).toBeNull();
    expect(persistFile).not.toHaveBeenCalled();
    expect(persistCache).not.toHaveBeenCalled();
  });
});
