// STATUS: PLATIN — release blocker #1: a failed save names the stage, without leaking content.
//
// W-229 asked "why did it fail?". Beta 0.1 adds the durable-file stage, so the answer must distinguish
// "file could not be written", "file written but confirmation mismatch", "store unavailable" and "cache
// could not be written". The raw error text (possibly a path) still never becomes a user-facing string.
import { describe, expect, it } from 'vitest';
import { WorkspaceFilePersistenceError } from '../../../platform/workspace/persistence/workspaceFilePersistence';
import {
  classifyWorkspaceSaveFailureDetailed,
} from '../workspaceSaveFailure';

describe('classifyWorkspaceSaveFailureDetailed', () => {
  it('keeps the existing four public codes unchanged', () => {
    expect(classifyWorkspaceSaveFailureDetailed({ code: 'ENOSPC' })).toEqual({ code: 'storage-full', detail: 'file-write-failed' });
    expect(classifyWorkspaceSaveFailureDetailed(new Error('save lease is busy'))).toEqual({ code: 'save-blocked', detail: null });
    expect(classifyWorkspaceSaveFailureDetailed(new Error('tauri ipc unavailable'))).toEqual({ code: 'native-unavailable', detail: null });
    expect(classifyWorkspaceSaveFailureDetailed(new Error('C:\\Users\\Someone\\geheim.docx'))).toEqual({ code: 'unknown', detail: null });
  });

  it('maps a failed file write to the file stage (and detects a full disk)', () => {
    const full = new WorkspaceFilePersistenceError('write-failed', { cause: Object.assign(new Error('write failed'), { code: 'ENOSPC' }) });
    expect(classifyWorkspaceSaveFailureDetailed(full)).toEqual({ code: 'storage-full', detail: 'file-write-failed' });
    const generic = new WorkspaceFilePersistenceError('write-failed', { cause: new Error('Workspace document could not be written') });
    expect(classifyWorkspaceSaveFailureDetailed(generic)).toEqual({ code: 'unknown', detail: 'file-write-failed' });
  });

  it('never reports a mismatching write confirmation as saved', () => {
    expect(classifyWorkspaceSaveFailureDetailed(new WorkspaceFilePersistenceError('verification-failed')))
      .toEqual({ code: 'unknown', detail: 'file-verification-failed' });
  });

  it('maps an unreachable native store to native-unavailable', () => {
    expect(classifyWorkspaceSaveFailureDetailed(new WorkspaceFilePersistenceError('store-unavailable')))
      .toEqual({ code: 'native-unavailable', detail: 'store-unavailable' });
    expect(classifyWorkspaceSaveFailureDetailed(new WorkspaceFilePersistenceError('read-failed')))
      .toEqual({ code: 'native-unavailable', detail: 'store-unavailable' });
  });

  it('maps missing credentials and id violations to their own stages', () => {
    expect(classifyWorkspaceSaveFailureDetailed(new WorkspaceFilePersistenceError('credential-required')))
      .toEqual({ code: 'save-blocked', detail: 'credential-required' });
    expect(classifyWorkspaceSaveFailureDetailed(new WorkspaceFilePersistenceError('invalid-document')))
      .toEqual({ code: 'unknown', detail: 'document-id-rejected' });
    expect(classifyWorkspaceSaveFailureDetailed(new WorkspaceFilePersistenceError('container-pack-failed')))
      .toEqual({ code: 'unknown', detail: 'container-pack-failed' });
  });

  it('names the cache stage when an IndexedDB transaction fails', () => {
    const quota = Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
    expect(classifyWorkspaceSaveFailureDetailed(quota, 'indexeddb-cache'))
      .toEqual({ code: 'storage-full', detail: 'cache-write-failed' });
  });
});
