// STATUS: PLATIN — bounded, content-free Explorer projection over authoritative Workspace documents.
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import type { EditionRegistry } from '../../edition/contracts';
import type { ShellRecentEntry } from '../platform/workspaceShellPlatform';
import { normalizeSecurityProfile } from '../../platform/security/securityProfiles';

export type WorkspaceLibraryAvailability = 'open' | 'available' | 'locked' | 'missing' | 'premium-required';
export type WorkspaceLibraryView = 'list' | 'grid';
export type WorkspaceLibrarySort = 'modified' | 'name' | 'app';

export interface WorkspaceLibraryEntry {
  readonly id: string;
  readonly documentId: string;
  readonly kind: DocumentKind | null;
  readonly title: string;
  readonly availability: WorkspaceLibraryAvailability;
  readonly storage: 'managed' | 'unknown';
  readonly modifiedAt: number | null;
  readonly isOpen: boolean;
  readonly isRecent: boolean;
  readonly isFavorite: boolean;
  readonly metadataProtected: boolean;
  readonly locatorId: string;
}

export interface WorkspaceLibraryCollection {
  readonly id: string;
  readonly name: string;
  readonly documentIds: readonly string[];
}

export interface WorkspaceLibraryPreferences {
  readonly schemaVersion: 1;
  readonly favorites: readonly string[];
  readonly collections: readonly WorkspaceLibraryCollection[];
  readonly view: WorkspaceLibraryView;
  readonly sort: WorkspaceLibrarySort;
}

export interface WorkspaceLibraryProjectionInput {
  readonly documents: Readonly<Record<string, WorkspaceLibrarySourceDocument>>;
  readonly storedDocumentIds: ReadonlySet<string>;
  readonly openDocumentIds: ReadonlySet<string>;
  readonly recentEntries: readonly ShellRecentEntry[];
  readonly favorites?: ReadonlySet<string>;
  readonly metadataLocked: boolean;
  readonly editionRegistry: EditionRegistry;
}

export type WorkspaceLibrarySourceDocument = Pick<WorkspaceDocument, 'id' | 'kind' | 'title' | 'modified_at' | 'securityPolicy'>;

export interface WorkspaceLibraryPage {
  readonly items: readonly WorkspaceLibraryEntry[];
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly total: number;
}

export function isWorkspaceLibraryEntryOpenable(entry: Pick<WorkspaceLibraryEntry, 'availability'>): boolean {
  return entry.availability === 'open' || entry.availability === 'available' || entry.availability === 'locked';
}

export const WORKSPACE_LIBRARY_PREFERENCES_KEY = 'astraea.workspace.library.preferences.v1';
export const WORKSPACE_LIBRARY_LIMITS = Object.freeze({
  maxEntries: 20_000,
  maxFavorites: 4_096,
  maxCollections: 256,
  maxCollectionNameChars: 64,
  maxCollectionDocuments: 20_000,
  maxDocumentIdChars: 256,
  maxTitleChars: 240,
});
export const WORKSPACE_LIBRARY_PAGE_SIZE = 100;

const EMPTY_PREFERENCES: WorkspaceLibraryPreferences = Object.freeze({
  schemaVersion: 1,
  favorites: Object.freeze([]),
  collections: Object.freeze([]),
  view: 'list',
  sort: 'modified',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDocumentId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= WORKSPACE_LIBRARY_LIMITS.maxDocumentIdChars
    && /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(value);
}

function uniqueIds(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(validDocumentId))].slice(0, limit);
}

function normalizedCollection(value: unknown): WorkspaceLibraryCollection | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/u.test(value.id)) return null;
  if (typeof value.name !== 'string') return null;
  const name = value.name.trim().replace(/\s+/gu, ' ').slice(0, WORKSPACE_LIBRARY_LIMITS.maxCollectionNameChars);
  if (!name || /[\u0000-\u001f\u007f]/u.test(name)) return null;
  return {
    id: value.id,
    name,
    documentIds: uniqueIds(value.documentIds, WORKSPACE_LIBRARY_LIMITS.maxCollectionDocuments),
  };
}

export function normalizeWorkspaceLibraryPreferences(value: unknown): WorkspaceLibraryPreferences {
  if (!isRecord(value) || value.schemaVersion !== 1) return EMPTY_PREFERENCES;
  const favorites = uniqueIds(value.favorites, WORKSPACE_LIBRARY_LIMITS.maxFavorites);
  const collectionCandidates = Array.isArray(value.collections) ? value.collections.slice(0, WORKSPACE_LIBRARY_LIMITS.maxCollections * 2) : [];
  const collections = collectionCandidates
    .map(normalizedCollection)
    .filter((item): item is WorkspaceLibraryCollection => item !== null)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, WORKSPACE_LIBRARY_LIMITS.maxCollections);
  return {
    schemaVersion: 1,
    favorites,
    collections,
    view: value.view === 'grid' ? 'grid' : 'list',
    sort: value.sort === 'name' || value.sort === 'app' ? value.sort : 'modified',
  };
}

export function loadWorkspaceLibraryPreferences(storage: Pick<Storage, 'getItem'> | null): WorkspaceLibraryPreferences {
  try {
    const raw = storage?.getItem(WORKSPACE_LIBRARY_PREFERENCES_KEY);
    if (!raw || raw.length > 256 * 1024) return EMPTY_PREFERENCES;
    return normalizeWorkspaceLibraryPreferences(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_PREFERENCES;
  }
}

export function saveWorkspaceLibraryPreferences(
  storage: Pick<Storage, 'setItem'> | null,
  value: unknown,
): WorkspaceLibraryPreferences {
  if (!storage) throw new Error('workspace-library-storage-unavailable');
  const normalized = normalizeWorkspaceLibraryPreferences(value);
  storage.setItem(WORKSPACE_LIBRARY_PREFERENCES_KEY, JSON.stringify(normalized));
  return normalized;
}

export function toggleWorkspaceLibraryFavorite(
  preferences: WorkspaceLibraryPreferences,
  documentId: string,
): WorkspaceLibraryPreferences {
  if (!validDocumentId(documentId)) return preferences;
  const favorites = new Set(preferences.favorites);
  if (favorites.has(documentId)) favorites.delete(documentId);
  else if (favorites.size < WORKSPACE_LIBRARY_LIMITS.maxFavorites) favorites.add(documentId);
  return { ...preferences, favorites: [...favorites] };
}

export function createWorkspaceLibraryCollection(
  preferences: WorkspaceLibraryPreferences,
  nameInput: string,
  id = globalThis.crypto?.randomUUID?.(),
): WorkspaceLibraryPreferences {
  const name = nameInput.trim().replace(/\s+/gu, ' ').slice(0, WORKSPACE_LIBRARY_LIMITS.maxCollectionNameChars);
  if (!name || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error('workspace-library-collection-name-invalid');
  if (preferences.collections.length >= WORKSPACE_LIBRARY_LIMITS.maxCollections) throw new Error('workspace-library-collection-limit');
  if (!id || !/^[A-Za-z0-9_-]{1,96}$/u.test(id)) throw new Error('workspace-library-collection-id-invalid');
  if (preferences.collections.some((collection) => collection.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))) {
    throw new Error('workspace-library-collection-name-duplicate');
  }
  return { ...preferences, collections: [...preferences.collections, { id, name, documentIds: [] }] };
}

export function setWorkspaceLibraryCollectionMembership(
  preferences: WorkspaceLibraryPreferences,
  collectionId: string,
  documentId: string,
  included: boolean,
): WorkspaceLibraryPreferences {
  if (!validDocumentId(documentId)) return preferences;
  let changed = false;
  const collections = preferences.collections.map((collection) => {
    if (collection.id !== collectionId) return collection;
    const documentIds = new Set(collection.documentIds);
    const wasIncluded = documentIds.has(documentId);
    if (included) documentIds.add(documentId);
    else documentIds.delete(documentId);
    if (documentIds.size > WORKSPACE_LIBRARY_LIMITS.maxCollectionDocuments) return collection;
    if (wasIncluded !== included) changed = true;
    return { ...collection, documentIds: [...documentIds] };
  });
  return changed ? { ...preferences, collections } : preferences;
}

export function removeWorkspaceLibraryCollection(
  preferences: WorkspaceLibraryPreferences,
  collectionId: string,
): WorkspaceLibraryPreferences {
  const collections = preferences.collections.filter((collection) => collection.id !== collectionId);
  return collections.length === preferences.collections.length ? preferences : { ...preferences, collections };
}

function safeModifiedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function safeDocument(value: unknown, requestedId: string): value is WorkspaceLibrarySourceDocument {
  if (!isRecord(value)) return false;
  return value.id === requestedId
    && typeof value.title === 'string'
    && typeof value.kind === 'string'
    && value.title.length <= 16_384;
}

function labelForKind(kind: DocumentKind, editionRegistry: EditionRegistry): string {
  return editionRegistry.getImplementedApp(kind)?.name
    ?? editionRegistry.getCatalogOnlyApp(kind)?.name
    ?? 'Workspace document';
}

export function projectWorkspaceLibrary(input: WorkspaceLibraryProjectionInput): WorkspaceLibraryEntry[] {
  const favorites = input.favorites ?? new Set<string>();
  const recentById = new Map<string, ShellRecentEntry>();
  for (const recent of input.recentEntries.slice(0, WORKSPACE_LIBRARY_LIMITS.maxEntries)) {
    if (validDocumentId(recent.documentId) && !recentById.has(recent.documentId)) recentById.set(recent.documentId, recent);
  }

  const entries = new Map<string, WorkspaceLibraryEntry>();
  const documentIds = Object.keys(input.documents).slice(0, WORKSPACE_LIBRARY_LIMITS.maxEntries);
  for (const id of documentIds) {
    if (!validDocumentId(id)) continue;
    const isOpen = input.openDocumentIds.has(id);
    const isStored = input.storedDocumentIds.has(id);
    if (!isOpen && !isStored) continue;
    const document: unknown = input.documents[id];
    if (!safeDocument(document, id)) continue;
    const kind = document.kind;
    const isImplemented = input.editionRegistry.isImplementedApp(kind);
    const isPremium = !isImplemented && Boolean(input.editionRegistry.getCatalogOnlyApp(kind));
    const metadataProtected = input.metadataLocked || normalizeSecurityProfile(document.securityPolicy?.profile) === 'VGT_TOP_SECRET';
    const title = isPremium
      ? labelForKind(kind, input.editionRegistry)
      : metadataProtected
        ? `Protected ${labelForKind(kind, input.editionRegistry)} document`
        : document.title.trim().slice(0, WORKSPACE_LIBRARY_LIMITS.maxTitleChars) || 'Untitled document';
    entries.set(id, {
      id: `managed:${id}`,
      documentId: id,
      kind,
      title,
      availability: isPremium ? 'premium-required' : isOpen ? 'open' : 'available',
      storage: 'managed',
      modifiedAt: metadataProtected || isPremium ? null : safeModifiedAt(document.modified_at),
      isOpen,
      isRecent: recentById.has(id),
      isFavorite: favorites.has(id),
      metadataProtected: metadataProtected || isPremium,
      locatorId: `managed:${id}`,
    });
  }

  const knownIds = new Set(entries.keys());
  const candidateIds = new Set<string>([
    ...[...input.storedDocumentIds].slice(0, WORKSPACE_LIBRARY_LIMITS.maxEntries),
    ...recentById.keys(),
  ]);
  for (const id of candidateIds) {
    if (!validDocumentId(id) || knownIds.has(id)) continue;
    const recent = recentById.get(id);
    const catalogApp = recent ? input.editionRegistry.getCatalogOnlyApp(recent.kind) : undefined;
    const stored = input.storedDocumentIds.has(id);
    const availability: WorkspaceLibraryAvailability = catalogApp
      ? 'premium-required'
      : stored
        ? 'locked'
        : 'missing';
    const kind = catalogApp ? catalogApp.kind : recent?.kind ?? null;
    const title = catalogApp
      ? catalogApp.name
      : stored
        ? 'Protected workspace document'
        : 'Unavailable workspace document';
    entries.set(id, {
      id: `${stored ? 'managed' : 'unknown'}:${id}`,
      documentId: id,
      kind,
      title,
      availability,
      storage: stored ? 'managed' : 'unknown',
      modifiedAt: null,
      isOpen: false,
      isRecent: Boolean(recent),
      isFavorite: favorites.has(id),
      metadataProtected: true,
      locatorId: `${stored ? 'managed' : 'unknown'}:${id}`,
    });
  }

  return [...entries.values()]
    .sort((left, right) => (right.modifiedAt ?? 0) - (left.modifiedAt ?? 0) || left.documentId.localeCompare(right.documentId))
    .slice(0, WORKSPACE_LIBRARY_LIMITS.maxEntries);
}

/**
 * Extends the bounded startup projection with explicitly requested keyset pages.
 * Each additional ID is projected from already available minimal metadata or as an
 * opaque locked record; no storage payload is read by this projection.
 */
export function projectWorkspaceLibraryWithAdditionalStoredIds(
  input: WorkspaceLibraryProjectionInput,
  additionalStoredDocumentIds: readonly string[],
  startupProjection?: readonly WorkspaceLibraryEntry[],
): WorkspaceLibraryEntry[] {
  const baseEntries = startupProjection ?? projectWorkspaceLibrary(input);
  if (additionalStoredDocumentIds.length === 0) return [...baseEntries];

  const baseIds = new Set(baseEntries.map((entry) => entry.documentId));
  const additionalIds = new Set<string>();
  for (const id of additionalStoredDocumentIds) {
    if (!validDocumentId(id) || baseIds.has(id)) continue;
    additionalIds.add(id);
    if (additionalIds.size >= WORKSPACE_LIBRARY_LIMITS.maxEntries) break;
  }
  if (additionalIds.size === 0) return [...baseEntries];

  const additionalDocuments: Record<string, WorkspaceLibrarySourceDocument> = {};
  for (const id of additionalIds) {
    const candidate = input.documents[id];
    if (safeDocument(candidate, id)) additionalDocuments[id] = candidate;
  }
  const additionalRecentEntries = input.recentEntries.filter((entry) => additionalIds.has(entry.documentId));
  const additionalEntries = projectWorkspaceLibrary({
    ...input,
    documents: additionalDocuments,
    storedDocumentIds: additionalIds,
    openDocumentIds: new Set([...input.openDocumentIds].filter((id) => additionalIds.has(id))),
    recentEntries: additionalRecentEntries,
  });

  const merged = new Map(baseEntries.map((entry) => [entry.documentId, entry]));
  for (const entry of additionalEntries) {
    const existing = merged.get(entry.documentId);
    if (!existing || existing.availability === 'missing') merged.set(entry.documentId, entry);
  }
  return [...merged.values()]
    .sort((left, right) => (right.modifiedAt ?? 0) - (left.modifiedAt ?? 0) || left.documentId.localeCompare(right.documentId))
    .slice(0, WORKSPACE_LIBRARY_LIMITS.maxEntries * 2);
}

/**
 * Reduces decrypted canonical records to the smallest Explorer source projection.
 * Premium records in Open Core retain only safe kind recognition and a static catalog label.
 */
export function projectWorkspaceLibraryDocuments(
  documents: Readonly<Record<string, WorkspaceDocument>>,
  editionRegistry: EditionRegistry,
): Record<string, WorkspaceLibrarySourceDocument> {
  const projected: Record<string, WorkspaceLibrarySourceDocument> = {};
  for (const id of Object.keys(documents).slice(0, WORKSPACE_LIBRARY_LIMITS.maxEntries)) {
    const document: unknown = documents[id];
    if (!validDocumentId(id) || !safeDocument(document, id)) continue;
    if (editionRegistry.isImplementedApp(document.kind)) {
      projected[id] = {
        id,
        kind: document.kind,
        title: document.title.slice(0, 16_384),
        modified_at: safeModifiedAt(document.modified_at) ?? 0,
        securityPolicy: document.securityPolicy,
      };
      continue;
    }
    const catalog = editionRegistry.getCatalogOnlyApp(document.kind);
    if (!catalog) continue;
    projected[id] = {
      id,
      kind: catalog.kind,
      title: catalog.name,
      modified_at: 0,
      securityPolicy: undefined,
    };
  }
  return projected;
}

/**
 * Exposes only edition-available, privacy-projected metadata to cross-app integrations.
 * Decrypted document payloads never cross the Explorer metadata boundary.
 */
export function projectWorkspaceIntegrationSourceMetadata(
  input: WorkspaceLibraryProjectionInput,
): WorkspaceLibrarySourceDocument[] {
  return projectWorkspaceLibrary(input).flatMap((entry) => {
    if (!entry.kind || !input.editionRegistry.isImplementedApp(entry.kind) || entry.availability === 'missing') return [];
    return [{
      id: entry.documentId,
      kind: entry.kind,
      title: entry.title,
      modified_at: entry.modifiedAt ?? 0,
      securityPolicy: undefined,
    }];
  });
}

export function filterWorkspaceLibraryEntries(
  entries: readonly WorkspaceLibraryEntry[],
  input: { query?: string; section?: 'all' | 'recent' | 'open' | 'favorites' | 'collection'; collectionIds?: ReadonlySet<string>; appKind?: DocumentKind | null },
): WorkspaceLibraryEntry[] {
  const query = input.query?.trim().toLocaleLowerCase('en-US').slice(0, 256) ?? '';
  return entries.filter((entry) => {
    if (input.section === 'recent' && !entry.isRecent) return false;
    if (input.section === 'open' && !entry.isOpen) return false;
    if (input.section === 'favorites' && !entry.isFavorite) return false;
    if (input.section === 'collection' && !input.collectionIds?.has(entry.documentId)) return false;
    if (input.appKind && entry.kind !== input.appKind) return false;
    if (!query || entry.metadataProtected) return !query || entry.metadataProtected === false;
    return entry.title.toLocaleLowerCase('en-US').includes(query)
      || entry.kind?.toLocaleLowerCase('en-US').includes(query) === true;
  });
}

export function paginateWorkspaceLibraryEntries(
  entries: readonly WorkspaceLibraryEntry[],
  requestedPageIndex: number,
  requestedPageSize = WORKSPACE_LIBRARY_PAGE_SIZE,
): WorkspaceLibraryPage {
  const pageSize = Number.isSafeInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, WORKSPACE_LIBRARY_PAGE_SIZE)
    : WORKSPACE_LIBRARY_PAGE_SIZE;
  const pageCount = Math.ceil(entries.length / pageSize);
  const pageIndex = pageCount === 0 || !Number.isSafeInteger(requestedPageIndex)
    ? 0
    : Math.max(0, Math.min(requestedPageIndex, pageCount - 1));
  const offset = pageIndex * pageSize;
  return {
    items: entries.slice(offset, offset + pageSize),
    pageIndex,
    pageSize,
    pageCount,
    total: entries.length,
  };
}
