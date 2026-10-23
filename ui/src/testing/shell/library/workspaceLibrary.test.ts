import { describe, expect, it } from 'vitest';
import { createEditionRegistry } from '../../../edition/registry';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  filterWorkspaceLibraryEntries,
  isWorkspaceLibraryEntryOpenable,
  loadWorkspaceLibraryPreferences,
  normalizeWorkspaceLibraryPreferences,
  paginateWorkspaceLibraryEntries,
  projectWorkspaceLibrary,
  projectWorkspaceLibraryWithAdditionalStoredIds,
  projectWorkspaceIntegrationSourceMetadata,
  saveWorkspaceLibraryPreferences,
  WORKSPACE_LIBRARY_PREFERENCES_KEY,
} from '../../../shell/library/workspaceLibrary';

function document(id: string, kind: WorkspaceDocument['kind'], title: string, securityPolicy?: WorkspaceDocument['securityPolicy']): WorkspaceDocument {
  return {
    id,
    kind,
    title,
    created_at: 1_700_000_000_000,
    modified_at: 1_700_000_100_000,
    version: 1,
    theme_id: 'cosmic-obsidian',
    securityPolicy,
    root_object_ids: [],
    objects: {},
  } as WorkspaceDocument;
}

describe('Workspace Library metadata projection', () => {
  const openCore = createEditionRegistry('open-core');

  it('allows opening stored opaque IDs without exposing missing or Premium-only entries', () => {
    expect(isWorkspaceLibraryEntryOpenable({ availability: 'open' })).toBe(true);
    expect(isWorkspaceLibraryEntryOpenable({ availability: 'available' })).toBe(true);
    expect(isWorkspaceLibraryEntryOpenable({ availability: 'locked' })).toBe(true);
    expect(isWorkspaceLibraryEntryOpenable({ availability: 'missing' })).toBe(false);
    expect(isWorkspaceLibraryEntryOpenable({ availability: 'premium-required' })).toBe(false);
  });

  it('projects safe integration metadata and excludes Premium sources in Open Core', () => {
    const secretGrid = document('secret-grid', 'Grid', 'Sensitive forecast', { profile: 'VGT_TOP_SECRET' });
    const premiumForm = document('premium-form', 'Forms', 'Sensitive acquisition survey');
    const sources = projectWorkspaceIntegrationSourceMetadata({
      documents: {
        [secretGrid.id]: secretGrid,
        [premiumForm.id]: premiumForm,
      },
      storedDocumentIds: new Set([secretGrid.id, premiumForm.id]),
      openDocumentIds: new Set(),
      recentEntries: [],
      metadataLocked: false,
      editionRegistry: openCore,
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: secretGrid.id,
      kind: 'Grid',
      title: 'Protected Astraea Grid document',
    });
    expect(sources[0]?.title).not.toContain('Sensitive forecast');
    expect(sources[0]).not.toHaveProperty('objects');
    expect(sources.some((source) => source.kind === 'Forms')).toBe(false);
    expect(JSON.stringify(sources)).not.toContain('Sensitive acquisition survey');
  });

  it('replaces Premium document titles with catalog-only labels in Open Core', () => {
    const premiumDocument = document('private-form-id', 'Forms', 'Sensitive acquisition survey');
    const [entry] = projectWorkspaceLibrary({
      documents: { [premiumDocument.id]: premiumDocument },
      storedDocumentIds: new Set([premiumDocument.id]),
      openDocumentIds: new Set([premiumDocument.id]),
      recentEntries: [],
      metadataLocked: false,
      editionRegistry: openCore,
    });

    expect(entry.availability).toBe('premium-required');
    expect(entry.title).toBe(openCore.getCatalogOnlyApp('Forms')?.name);
    expect(entry.title).not.toContain('Sensitive acquisition survey');
    expect(entry.metadataProtected).toBe(true);
    expect(entry.modifiedAt).toBeNull();
  });

  it('keeps protected titles out of Explorer search and preview metadata', () => {
    const topSecret = document('secret-id', 'Writer', 'Operation Northstar', { profile: 'VGT_TOP_SECRET' });
    const entries = projectWorkspaceLibrary({
      documents: { [topSecret.id]: topSecret },
      storedDocumentIds: new Set([topSecret.id]),
      openDocumentIds: new Set(),
      recentEntries: [],
      metadataLocked: false,
      editionRegistry: openCore,
    });

    expect(entries[0]?.title).toBe('Protected Astraea Writer document');
    expect(entries[0]?.metadataProtected).toBe(true);
    expect(filterWorkspaceLibraryEntries(entries, { query: 'Northstar' })).toEqual([]);
    expect(filterWorkspaceLibraryEntries(entries, { query: 'Writer' })).toEqual([]);
    expect(filterWorkspaceLibraryEntries(entries, {})).toHaveLength(1);
  });

  it('projects regular open and closed documents without copying payloads into library entries', () => {
    const writer = document('writer-id', 'Writer', 'Quarterly plan');
    const grid = document('grid-id', 'Grid', 'Forecast');
    const entries = projectWorkspaceLibrary({
      documents: { [writer.id]: writer, [grid.id]: grid },
      storedDocumentIds: new Set([writer.id, grid.id]),
      openDocumentIds: new Set([writer.id]),
      recentEntries: [{ documentId: grid.id, kind: 'Grid', lastOpenedAt: 1_700_000_000_000 }],
      favorites: new Set([grid.id]),
      metadataLocked: false,
      editionRegistry: openCore,
    });

    expect(entries.find((entry) => entry.documentId === 'writer-id')).toMatchObject({ availability: 'open' });
    expect(entries.find((entry) => entry.documentId === 'grid-id')).toMatchObject({ availability: 'available', isRecent: true, isFavorite: true, locatorId: 'managed:grid-id' });
    const writerEntry = entries.find((entry) => entry.documentId === 'writer-id');
    expect(writerEntry).not.toHaveProperty('objects');
    expect(writerEntry).not.toHaveProperty('writerData');
  });

  it('does not present built-in in-memory seeds as saved or expose them to closed-source pickers', () => {
    const seed = document('builtin-writer-seed', 'Writer', 'Example seed document');
    const input = {
      documents: { [seed.id]: seed },
      storedDocumentIds: new Set<string>(),
      openDocumentIds: new Set<string>(),
      recentEntries: [],
      metadataLocked: false,
      editionRegistry: openCore,
    };

    expect(projectWorkspaceLibrary(input)).toEqual([]);
    expect(projectWorkspaceIntegrationSourceMetadata(input)).toEqual([]);
  });

  it('retains recent unsaved records as unavailable without advertising them as integration sources', () => {
    const seed = document('recent-seed', 'Grid', 'Example seed grid');
    const input = {
      documents: { [seed.id]: seed },
      storedDocumentIds: new Set<string>(),
      openDocumentIds: new Set<string>(),
      recentEntries: [{ documentId: seed.id, kind: 'Grid' as const, lastOpenedAt: 1_700_000_000_000 }],
      metadataLocked: false,
      editionRegistry: openCore,
    };
    const [entry] = projectWorkspaceLibrary(input);

    expect(entry).toMatchObject({ availability: 'missing', title: 'Unavailable workspace document', metadataProtected: true });
    expect(projectWorkspaceIntegrationSourceMetadata(input)).toEqual([]);
  });

  it('shows locked and missing records without inventing titles or paths', () => {
    const entries = projectWorkspaceLibrary({
      documents: {},
      storedDocumentIds: new Set(['locked-id']),
      openDocumentIds: new Set(),
      recentEntries: [{ documentId: 'missing-id', kind: 'Grid', lastOpenedAt: 1_700_000_000_000 }],
      metadataLocked: true,
      editionRegistry: openCore,
    });
    const locked = entries.find((entry) => entry.documentId === 'locked-id');
    const missing = entries.find((entry) => entry.documentId === 'missing-id');
    expect(locked).toMatchObject({ availability: 'locked', title: 'Protected workspace document', locatorId: 'managed:locked-id' });
    expect(missing).toMatchObject({ availability: 'missing', title: 'Unavailable workspace document', locatorId: 'unknown:missing-id' });
    expect(locked?.locatorId).not.toContain('C:');
  });

  it('merges cursor-loaded IDs beyond the bounded startup projection without exposing metadata', () => {
    const initialIds = new Set(Array.from({ length: 20_000 }, (_, index) => `doc-${String(index).padStart(5, '0')}`));
    const input = {
      documents: {},
      storedDocumentIds: initialIds,
      openDocumentIds: new Set<string>(),
      recentEntries: [],
      metadataLocked: false,
      editionRegistry: openCore,
    };

    const entries = projectWorkspaceLibraryWithAdditionalStoredIds(input, [
      'doc-00001',
      'cursor-loaded-tail',
      'cursor-loaded-tail',
    ]);
    const addedEntry = entries.find((entry) => entry.documentId === 'cursor-loaded-tail');

    expect(projectWorkspaceLibrary(input)).toHaveLength(20_000);
    expect(entries).toHaveLength(20_001);
    expect(entries.filter((entry) => entry.documentId === 'cursor-loaded-tail')).toHaveLength(1);
    expect(addedEntry).toMatchObject({
      availability: 'locked',
      title: 'Protected workspace document',
      metadataProtected: true,
      modifiedAt: null,
    });
  });

  it('recognizes a locked Premium recent from safe kind metadata only', () => {
    const premiumId = 'premium-record-id';
    const [entry] = projectWorkspaceLibrary({
      documents: {},
      storedDocumentIds: new Set([premiumId]),
      openDocumentIds: new Set(),
      recentEntries: [{ documentId: premiumId, kind: 'Forms', lastOpenedAt: 1_700_000_000_000 }],
      metadataLocked: true,
      editionRegistry: openCore,
    });

    expect(entry).toMatchObject({
      documentId: premiumId,
      kind: 'Forms',
      title: openCore.getCatalogOnlyApp('Forms')?.name,
      availability: 'premium-required',
      metadataProtected: true,
      modifiedAt: null,
    });
  });

  it('filters and pages a 10,000-document library while keeping each rendered slice bounded', () => {
    const documents: Record<string, WorkspaceDocument> = {};
    for (let index = 0; index < 10_000; index += 1) {
      const id = 'doc-' + String(index).padStart(5, '0');
      documents[id] = document(id, 'Writer', index % 1_000 === 0 ? 'Needle ' + index : 'Document ' + index);
    }
    const storedDocumentIds = new Set(Object.keys(documents));
    const entries = projectWorkspaceLibrary({
      documents,
      storedDocumentIds,
      openDocumentIds: storedDocumentIds,
      recentEntries: [],
      metadataLocked: false,
      editionRegistry: openCore,
    });

    expect(entries).toHaveLength(10_000);
    const firstPage = paginateWorkspaceLibraryEntries(entries, 0);
    const secondPage = paginateWorkspaceLibraryEntries(entries, 1);
    const finalPage = paginateWorkspaceLibraryEntries(entries, Number.MAX_SAFE_INTEGER);
    expect(firstPage).toMatchObject({ pageIndex: 0, pageSize: 100, pageCount: 100, total: 10_000 });
    expect(firstPage.items).toHaveLength(100);
    expect(secondPage.items).toHaveLength(100);
    expect(firstPage.items.at(-1)?.documentId).toBe('doc-00099');
    expect(secondPage.items[0]?.documentId).toBe('doc-00100');
    expect(finalPage).toMatchObject({ pageIndex: 99, pageCount: 100, total: 10_000 });
    expect(finalPage.items).toHaveLength(100);
    expect(paginateWorkspaceLibraryEntries(entries, 0, 10_000).items).toHaveLength(100);
    expect(filterWorkspaceLibraryEntries(entries, { query: 'needle' })).toHaveLength(10);
    expect(paginateWorkspaceLibraryEntries([], 0)).toMatchObject({ items: [], pageIndex: 0, pageCount: 0, total: 0 });
  });
});

describe('Workspace Library preferences', () => {
  it('normalizes untrusted values, caps collections and rejects unsafe IDs', () => {
    const normalized = normalizeWorkspaceLibraryPreferences({
      schemaVersion: 1,
      view: 'grid',
      sort: 'name',
      favorites: ['doc-1', 'doc-1', '../bad', 'doc-2\nforged'],
      collections: [
        { id: 'work', name: '  Work   Plans ', documentIds: ['doc-1', '../bad'] },
        { id: 'work', name: 'duplicate', documentIds: [] },
        { id: 'bad id', name: 'Rejected', documentIds: [] },
      ],
    });
    expect(normalized).toEqual({
      schemaVersion: 1,
      favorites: ['doc-1'],
      collections: [{ id: 'work', name: 'Work Plans', documentIds: ['doc-1'] }],
      view: 'grid',
      sort: 'name',
    });
  });

  it('persists only bounded organization preferences and recovers from invalid storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const saved = saveWorkspaceLibraryPreferences(storage, {
      schemaVersion: 1,
      favorites: ['doc-1'],
      collections: [{ id: 'work', name: 'Work', documentIds: ['doc-1'] }],
      view: 'grid',
      sort: 'app',
    });
    expect(saved.view).toBe('grid');
    expect(loadWorkspaceLibraryPreferences(storage)).toEqual(saved);
    expect(values.get(WORKSPACE_LIBRARY_PREFERENCES_KEY)).not.toContain('Quarterly plan');
    values.set(WORKSPACE_LIBRARY_PREFERENCES_KEY, '{invalid');
    expect(loadWorkspaceLibraryPreferences(storage).favorites).toEqual([]);
  });
});
