// STATUS: PLATIN — selective restore selection and corrupted-storage isolation contracts.
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  MAX_WORKSPACE_SESSION_RESTORE_DOCUMENTS,
  prepareWorkspaceLibraryProjectionDocuments,
  restoreWorkspaceDocuments,
  selectWorkspaceRestoreDocumentIds,
} from '../../../shell/lifecycle/workspaceSessionRestore';

function document(id: string): Pick<WorkspaceDocument, 'id'> {
  return { id };
}

describe('Workspace session restore', () => {
  it('restores only session-selected IDs and never enumerates the complete stored library', () => {
    const selected = selectWorkspaceRestoreDocumentIds({
      detachedDocumentId: null,
      sessionDocumentIds: ['open-a', 'open-b'],
      legacyActiveDocumentId: 'legacy-active',
      storedDocumentIds: new Set(['open-a', 'open-b', 'closed-c', 'legacy-active']),
      seededDocuments: {},
    });

    expect(selected).toEqual(['open-a', 'open-b']);
  });

  it('does not restore every stored source when no session exists and only restores the legacy active source', () => {
    const base = {
      detachedDocumentId: null,
      sessionDocumentIds: null,
      storedDocumentIds: new Set(['stored-a', 'stored-b']),
      seededDocuments: {},
    } as const;

    expect(selectWorkspaceRestoreDocumentIds({ ...base, legacyActiveDocumentId: null })).toEqual([]);
    expect(selectWorkspaceRestoreDocumentIds({ ...base, legacyActiveDocumentId: 'stored-b' })).toEqual(['stored-b']);
  });

  it('prioritizes a detached document and treats a valid empty session as an explicit empty tab set', () => {
    const input = {
      legacyActiveDocumentId: 'legacy-active',
      storedDocumentIds: new Set(['detached', 'legacy-active']),
      seededDocuments: {},
    } as const;

    expect(selectWorkspaceRestoreDocumentIds({ ...input, detachedDocumentId: 'detached', sessionDocumentIds: ['legacy-active'] }))
      .toEqual(['detached']);
    expect(selectWorkspaceRestoreDocumentIds({ ...input, detachedDocumentId: null, sessionDocumentIds: [] }))
      .toEqual([]);
  });

  it('limits and deduplicates untrusted session identifiers', () => {
    const ids = Array.from({ length: MAX_WORKSPACE_SESSION_RESTORE_DOCUMENTS + 3 }, (_, index) => `doc-${index}`);
    const result = selectWorkspaceRestoreDocumentIds({
      detachedDocumentId: null,
      sessionDocumentIds: [...ids, ids[0]!, '../escape', 'bad/id'],
      legacyActiveDocumentId: null,
      storedDocumentIds: new Set(ids),
      seededDocuments: {},
    });

    expect(result).toEqual(ids.slice(0, MAX_WORKSPACE_SESSION_RESTORE_DOCUMENTS));
  });

  it('hydrates only selected stored sources sequentially and uses seeds only when no persisted key exists', async () => {
    const loadStoredDocument = vi.fn(async (id: string) => document(id));
    const seededDocuments = { 'seed-only': document('seed-only'), 'stored-corrupt': document('stored-corrupt') };
    const storedDocumentIds = new Set(['stored-open', 'stored-corrupt', 'closed-stored']);
    const selectedIds = selectWorkspaceRestoreDocumentIds({
      detachedDocumentId: null,
      sessionDocumentIds: ['stored-open', 'seed-only', 'stored-corrupt'],
      legacyActiveDocumentId: null,
      storedDocumentIds,
      seededDocuments,
    });

    const result = await restoreWorkspaceDocuments(selectedIds, {
      storedDocumentIds,
      seededDocuments,
      loadStoredDocument: async (id) => id === 'stored-corrupt' ? null : loadStoredDocument(id),
    });

    expect(loadStoredDocument.mock.calls.map(([id]) => id)).toEqual(['stored-open']);
    expect(result.documents).toEqual({ 'stored-open': document('stored-open'), 'seed-only': document('seed-only') });
    expect(result.failedStoredDocumentIds).toEqual(['stored-corrupt']);
    expect(result.documents['stored-corrupt']).toBeUndefined();
  });

  it('does not fall back to seeded data when a persisted document has an identity mismatch or load error', async () => {
    const seededDocuments = { 'same-id': document('same-id'), 'throws-id': document('throws-id') };
    const result = await restoreWorkspaceDocuments(['same-id', 'throws-id'], {
      storedDocumentIds: new Set(['same-id', 'throws-id']),
      seededDocuments,
      loadStoredDocument: async (id) => {
        if (id === 'same-id') return document('unexpected-id');
        throw new Error('storage failure');
      },
    });

    expect(result.documents).toEqual({});
    expect(result.failedStoredDocumentIds).toEqual(['same-id', 'throws-id']);
  });

  it('does not project a seed title for a persisted document that has not been hydrated', () => {
    const seededDocuments = { 'seed-id': document('seed-id'), 'seed-only': document('seed-only') };
    expect(prepareWorkspaceLibraryProjectionDocuments(
      seededDocuments,
      new Set(['seed-id']),
      {},
    )).toEqual({ 'seed-only': document('seed-only') });
    expect(prepareWorkspaceLibraryProjectionDocuments(
      seededDocuments,
      new Set(['seed-id']),
      { 'seed-id': document('seed-id') },
    )).toEqual({ 'seed-only': document('seed-only'), 'seed-id': document('seed-id') });
  });
});
