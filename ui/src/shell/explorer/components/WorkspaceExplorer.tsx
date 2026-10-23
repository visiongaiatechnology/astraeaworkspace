// STATUS: PLATIN — responsive Explorer surface over metadata-only library entries.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileStack,
  FolderOpen,
  Grid2X2,
  Layers3,
  List,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { DocumentKind, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { EditionRegistry } from '../../../edition/contracts';
import { browserShellStorage } from '../../platform/workspaceShellPlatform';
import {
  MAX_STORED_DOCUMENT_ID_PAGE_SIZE,
  type StoredDocumentIdPage,
  type StoredDocumentIdPageOptions,
} from '../../../platform/workspace/persistence/workspaceStorage';
import { useWorkspaceLocale, workspaceText, type WorkspaceChromeMessage, type WorkspaceLocale } from '../../localization/workspaceLocale';
import {
  createWorkspaceLibraryCollection,
  filterWorkspaceLibraryEntries,
  isWorkspaceLibraryEntryOpenable,
  loadWorkspaceLibraryPreferences,
  paginateWorkspaceLibraryEntries,
  projectWorkspaceLibrary,
  projectWorkspaceLibraryWithAdditionalStoredIds,
  removeWorkspaceLibraryCollection,
  saveWorkspaceLibraryPreferences,
  setWorkspaceLibraryCollectionMembership,
  toggleWorkspaceLibraryFavorite,
  type WorkspaceLibraryAvailability,
  type WorkspaceLibraryEntry,
  type WorkspaceLibraryPage,
  type WorkspaceLibraryPreferences,
  WORKSPACE_LIBRARY_LIMITS,
} from '../../library/workspaceLibrary';
import { AstraeaAppIcon } from '../../../design-system/brand/AstraeaAppIcon';
import './WorkspaceExplorer.css';

interface WorkspaceExplorerProps {
  documents: Readonly<Record<string, Pick<WorkspaceDocument, 'id' | 'kind' | 'title' | 'modified_at' | 'securityPolicy'>>>;
  storedDocumentIds: ReadonlySet<string>;
  storedDocumentIdCursor?: string | null;
  hasMoreStoredDocumentIds?: boolean;
  loadStoredDocumentIdPage?: (options: StoredDocumentIdPageOptions) => Promise<StoredDocumentIdPage>;
  openDocumentIds: ReadonlySet<string>;
  recentEntries: readonly import('../../platform/workspaceShellPlatform').ShellRecentEntry[];
  metadataLocked: boolean;
  editionRegistry: EditionRegistry;
  onClose: () => void;
  onOpenDocument: (documentId: string) => void;
  onCreateDocument: (kind: DocumentKind) => void;
  onPersistenceError?: () => void;
}

type ExplorerSection = 'all' | 'recent' | 'open' | 'favorites' | 'collection' | 'app';

const STATUS_MESSAGES: Record<WorkspaceLibraryAvailability, WorkspaceChromeMessage> = {
  open: 'explorer.statusOpen',
  available: 'explorer.statusSaved',
  locked: 'explorer.statusProtected',
  missing: 'explorer.statusUnavailable',
  'premium-required': 'explorer.statusPremium',
};

function titleForEntry(entry: WorkspaceLibraryEntry, locale: WorkspaceLocale): string {
  if (entry.availability === 'premium-required') return workspaceText('explorer.premiumRequired', locale);
  if (entry.availability === 'missing') return workspaceText('explorer.unavailable', locale);
  if (entry.metadataProtected) return workspaceText('explorer.protected', locale);
  return entry.title;
}

function modifiedLabel(timestamp: number | null, locale: WorkspaceLocale): string {
  if (timestamp === null) return workspaceText('explorer.dateProtected', locale);
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
  } catch {
    return workspaceText('explorer.dateUnavailable', locale);
  }
}

function statusLabel(availability: WorkspaceLibraryAvailability, locale: WorkspaceLocale): string {
  return workspaceText(STATUS_MESSAGES[availability], locale);
}

function openActionLabel(entry: WorkspaceLibraryEntry, locale: WorkspaceLocale): string {
  return workspaceText(entry.availability === 'locked' ? 'explorer.openProtectedDocument' : 'explorer.openDocument', locale);
}

function sortEntries(entries: readonly WorkspaceLibraryEntry[], sort: WorkspaceLibraryPreferences['sort'], locale: string): WorkspaceLibraryEntry[] {
  return [...entries].sort((left, right) => {
    if (sort === 'name') return left.title.localeCompare(right.title, locale, { sensitivity: 'base' }) || left.documentId.localeCompare(right.documentId);
    if (sort === 'app') return (left.kind ?? '').localeCompare(right.kind ?? '', locale) || left.title.localeCompare(right.title, locale);
    return (right.modifiedAt ?? 0) - (left.modifiedAt ?? 0) || left.documentId.localeCompare(right.documentId);
  });
}

export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = ({
  documents,
  storedDocumentIds,
  storedDocumentIdCursor = null,
  hasMoreStoredDocumentIds = false,
  loadStoredDocumentIdPage,
  openDocumentIds,
  recentEntries,
  metadataLocked,
  editionRegistry,
  onClose,
  onOpenDocument,
  onCreateDocument,
  onPersistenceError,
}) => {
  const { locale } = useWorkspaceLocale();
  const storage = useMemo(() => browserShellStorage(), []);
  const [preferences, setPreferences] = useState(() => loadWorkspaceLibraryPreferences(storage));
  const [section, setSection] = useState<ExplorerSection>('all');
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [appKind, setAppKind] = useState<DocumentKind | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [additionalStoredDocumentIds, setAdditionalStoredDocumentIds] = useState<string[]>([]);
  const [nextStoredDocumentIdCursor, setNextStoredDocumentIdCursor] = useState<string | null>(storedDocumentIdCursor);
  const [canLoadMoreStoredDocumentIds, setCanLoadMoreStoredDocumentIds] = useState(hasMoreStoredDocumentIds);
  const [isLoadingStoredDocumentIds, setIsLoadingStoredDocumentIds] = useState(false);
  const [storedDocumentIdLoadFailed, setStoredDocumentIdLoadFailed] = useState(false);
  const [storedDocumentIdLimitReached, setStoredDocumentIdLimitReached] = useState(false);
  const loadRequestActive = useRef(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showCollectionComposer, setShowCollectionComposer] = useState(false);
  const [newDocumentKind, setNewDocumentKind] = useState<DocumentKind>(editionRegistry.creatableApps[0]?.kind ?? 'Writer');

  const favoriteIds = useMemo(() => new Set(preferences.favorites), [preferences.favorites]);
  useEffect(() => {
    setAdditionalStoredDocumentIds([]);
    setNextStoredDocumentIdCursor(storedDocumentIdCursor);
    setCanLoadMoreStoredDocumentIds(hasMoreStoredDocumentIds);
    setStoredDocumentIdLoadFailed(false);
    setStoredDocumentIdLimitReached(false);
  }, [hasMoreStoredDocumentIds, storedDocumentIdCursor]);

  const projectionInput = useMemo(() => ({
    documents,
    storedDocumentIds,
    openDocumentIds,
    recentEntries,
    favorites: favoriteIds,
    metadataLocked,
    editionRegistry,
  }), [documents, editionRegistry, favoriteIds, metadataLocked, openDocumentIds, recentEntries, storedDocumentIds]);
  const startupEntries = useMemo(() => projectWorkspaceLibrary(projectionInput), [projectionInput]);
  const entries = useMemo(() => projectWorkspaceLibraryWithAdditionalStoredIds(
    projectionInput,
    additionalStoredDocumentIds,
    startupEntries,
  ), [additionalStoredDocumentIds, projectionInput, startupEntries]);
  const selectedCollection = preferences.collections.find((collection) => collection.id === collectionId) ?? null;
  const collectionIds = useMemo(() => new Set(selectedCollection?.documentIds ?? []), [selectedCollection]);
  const filteredEntries = useMemo(() => {
    const base = filterWorkspaceLibraryEntries(entries, {
      query,
      section: section === 'app' ? 'all' : section,
      collectionIds: section === 'collection' ? collectionIds : undefined,
      appKind: section === 'app' ? appKind : null,
    });
    return sortEntries(base, preferences.sort, locale);
  }, [appKind, collectionIds, entries, locale, preferences.sort, query, section]);
  const entryCounts = useMemo(() => {
    const byKind = new Map<DocumentKind, number>();
    let recent = 0;
    let open = 0;
    let favorites = 0;
    for (const entry of entries) {
      if (entry.isRecent) recent += 1;
      if (entry.isOpen) open += 1;
      if (entry.isFavorite) favorites += 1;
      if (entry.kind) byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
    }
    return { byKind, recent, open, favorites };
  }, [entries]);
  const libraryPage: WorkspaceLibraryPage = paginateWorkspaceLibraryEntries(filteredEntries, pageIndex);
  const visibleEntries = libraryPage.items;
  const selectedEntry = entries.find((entry) => entry.documentId === selectedId) ?? visibleEntries[0] ?? null;
  const hasSelectedEntry = selectedId !== null && selectedEntry !== null;

  const persistPreferences = (next: WorkspaceLibraryPreferences) => {
    try {
      setPreferences(saveWorkspaceLibraryPreferences(storage, next));
    } catch {
      onPersistenceError?.();
    }
  };

  const handleLoadMoreStoredDocuments = async () => {
    if (!loadStoredDocumentIdPage || !canLoadMoreStoredDocumentIds || loadRequestActive.current) return;
    loadRequestActive.current = true;
    setIsLoadingStoredDocumentIds(true);
    setStoredDocumentIdLoadFailed(false);
    try {
      const page = await loadStoredDocumentIdPage({
        afterId: nextStoredDocumentIdCursor,
        pageSize: MAX_STORED_DOCUMENT_ID_PAGE_SIZE,
      });
      setNextStoredDocumentIdCursor(page.nextCursor);
      setCanLoadMoreStoredDocumentIds(page.hasMore);
      const ids = new Set(additionalStoredDocumentIds);
      for (const id of page.ids) {
        if (storedDocumentIds.has(id) || ids.has(id)) continue;
        if (ids.size >= WORKSPACE_LIBRARY_LIMITS.maxEntries) break;
        ids.add(id);
      }
      setAdditionalStoredDocumentIds([...ids]);
      if (ids.size >= WORKSPACE_LIBRARY_LIMITS.maxEntries && page.hasMore) setStoredDocumentIdLimitReached(true);
    } catch {
      setStoredDocumentIdLoadFailed(true);
    } finally {
      loadRequestActive.current = false;
      setIsLoadingStoredDocumentIds(false);
    }
  };

  const sectionButton = (
    id: ExplorerSection,
    label: string,
    Icon: typeof FolderOpen,
    count: number,
    selected = section === id,
  ) => (
    <button
      key={id}
      type="button"
      className={`workspace-explorer__nav-item${selected ? ' is-active' : ''}`}
      aria-current={selected ? 'page' : undefined}
      onClick={() => { setSection(id); setCollectionId(null); setAppKind(null); setPageIndex(0); }}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span>{label}</span>
      <span className="workspace-explorer__nav-count">{count}</span>
    </button>
  );

  const handleOpen = (entry: WorkspaceLibraryEntry) => {
    if (!isWorkspaceLibraryEntryOpenable(entry)) return;
    onOpenDocument(entry.documentId);
  };

  const handleCreateCollection = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const next = createWorkspaceLibraryCollection(preferences, newCollectionName);
      persistPreferences(next);
      setCollectionId(next.collections.at(-1)?.id ?? null);
      setSection('collection');
      setPageIndex(0);
      setNewCollectionName('');
      setShowCollectionComposer(false);
    } catch {
      onPersistenceError?.();
    }
  };

  const collectionToggle = (entry: WorkspaceLibraryEntry, id: string, included: boolean) => {
    persistPreferences(setWorkspaceLibraryCollectionMembership(preferences, id, entry.documentId, included));
  };

  return (
    <section className="workspace-explorer" aria-label={workspaceText('explorer.title', locale)} data-workspace-explorer="true">
      <header className="workspace-explorer__header">
        <div className="workspace-explorer__heading">
          <div className="workspace-explorer__brand-mark"><FolderOpen aria-hidden="true" className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h1>{workspaceText('explorer.title', locale)}</h1>
            <p>{workspaceText('explorer.subtitle', locale)}</p>
          </div>
        </div>
        <div className="workspace-explorer__header-tools">
          <label className="workspace-explorer__search">
            <Search aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">{workspaceText('explorer.search', locale)}</span>
            <input
              value={query}
              onChange={(event) => { setQuery(event.currentTarget.value.slice(0, 256)); setPageIndex(0); }}
              placeholder={workspaceText('explorer.searchPlaceholder', locale)}
              maxLength={256}
              type="search"
              autoComplete="off"
              spellCheck={false}
            />
            {query && <button type="button" aria-label={workspaceText('explorer.clearSearch', locale)} onClick={() => { setQuery(''); setPageIndex(0); }}><X aria-hidden="true" className="h-3.5 w-3.5" /></button>}
          </label>
          <label className="workspace-explorer__sort">
            <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">{workspaceText('explorer.sort', locale)}</span>
            <select value={preferences.sort} onChange={(event) => { persistPreferences({ ...preferences, sort: event.currentTarget.value as WorkspaceLibraryPreferences['sort'] }); setPageIndex(0); }}>
              <option value="modified">{workspaceText('explorer.sortModified', locale)}</option>
              <option value="name">{workspaceText('explorer.sortName', locale)}</option>
              <option value="app">{workspaceText('explorer.sortApp', locale)}</option>
            </select>
          </label>
          <div className="workspace-explorer__view-switch" role="group" aria-label={workspaceText('explorer.title', locale)}>
            <button type="button" className={preferences.view === 'list' ? 'is-active' : ''} aria-label={workspaceText('explorer.listView', locale)} aria-pressed={preferences.view === 'list'} onClick={() => persistPreferences({ ...preferences, view: 'list' })}><List aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" className={preferences.view === 'grid' ? 'is-active' : ''} aria-label={workspaceText('explorer.gridView', locale)} aria-pressed={preferences.view === 'grid'} onClick={() => persistPreferences({ ...preferences, view: 'grid' })}><Grid2X2 aria-hidden="true" className="h-4 w-4" /></button>
          </div>
          <button type="button" className="workspace-explorer__icon-button" aria-label={workspaceText('explorer.close', locale)} title={workspaceText('explorer.close', locale)} onClick={onClose}><X aria-hidden="true" className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="workspace-explorer__body">
        <aside className="workspace-explorer__rail" aria-label={workspaceText('explorer.title', locale)}>
          <div className="workspace-explorer__nav-group">
            <span className="workspace-explorer__eyebrow">{workspaceText('explorer.title', locale)}</span>
            {sectionButton('all', workspaceText('explorer.allFiles', locale), FileStack, entries.length)}
            {sectionButton('recent', workspaceText('explorer.recent', locale), Clock3, entryCounts.recent)}
            {sectionButton('open', workspaceText('explorer.openItems', locale), FolderOpen, entryCounts.open)}
            {sectionButton('favorites', workspaceText('explorer.favorites', locale), Star, entryCounts.favorites)}
          </div>

          <div className="workspace-explorer__nav-group">
            <span className="workspace-explorer__eyebrow">{workspaceText('explorer.byApp', locale)}</span>
            {editionRegistry.implementedApps.map((app) => (
              <button
                key={app.kind}
                type="button"
                className={`workspace-explorer__nav-item${section === 'app' && appKind === app.kind ? ' is-active' : ''}`}
                aria-current={section === 'app' && appKind === app.kind ? 'page' : undefined}
                onClick={() => { setSection('app'); setAppKind(app.kind); setCollectionId(null); setPageIndex(0); }}
              >
                <AstraeaAppIcon kind={app.kind} alt="" className="h-4 w-4 rounded-sm" />
                <span>{app.name}</span>
                <span className="workspace-explorer__nav-count">{entryCounts.byKind.get(app.kind) ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="workspace-explorer__nav-group workspace-explorer__collections-nav">
            <div className="workspace-explorer__nav-heading">
              <span className="workspace-explorer__eyebrow">{workspaceText('explorer.collections', locale)}</span>
              <button type="button" className="workspace-explorer__small-icon" aria-label={workspaceText('explorer.createCollection', locale)} title={workspaceText('explorer.createCollection', locale)} onClick={() => setShowCollectionComposer((open) => !open)}><Plus aria-hidden="true" className="h-3.5 w-3.5" /></button>
            </div>
            {showCollectionComposer && (
              <form className="workspace-explorer__collection-form" onSubmit={handleCreateCollection}>
                <input autoFocus value={newCollectionName} onChange={(event) => setNewCollectionName(event.currentTarget.value.slice(0, 64))} maxLength={64} aria-label={workspaceText('explorer.collectionName', locale)} placeholder={workspaceText('explorer.collectionName', locale)} />
                <button type="submit" disabled={!newCollectionName.trim()} aria-label={workspaceText('explorer.create', locale)}><Check aria-hidden="true" className="h-3.5 w-3.5" /></button>
              </form>
            )}
            {preferences.collections.length === 0 && <p className="workspace-explorer__quiet-copy">{workspaceText('explorer.noCollections', locale)}</p>}
            {preferences.collections.map((collection) => (
              <div className="workspace-explorer__collection-line" key={collection.id}>
                <button type="button" className={`workspace-explorer__nav-item${section === 'collection' && collectionId === collection.id ? ' is-active' : ''}`} aria-current={section === 'collection' && collectionId === collection.id ? 'page' : undefined} onClick={() => { setSection('collection'); setCollectionId(collection.id); setAppKind(null); setPageIndex(0); }}>
                  <Layers3 aria-hidden="true" className="h-4 w-4" /><span>{collection.name}</span><span className="workspace-explorer__nav-count">{collection.documentIds.length}</span>
                </button>
                <button type="button" className="workspace-explorer__small-icon workspace-explorer__remove-collection" aria-label={`${workspaceText('explorer.removeCollection', locale)}: ${collection.name}`} title={workspaceText('explorer.removeCollection', locale)} onClick={() => { persistPreferences(removeWorkspaceLibraryCollection(preferences, collection.id)); if (collectionId === collection.id) { setCollectionId(null); setSection('all'); } }}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          <div className="workspace-explorer__edition-note"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /><span>{editionRegistry.edition === 'open-core' ? 'Open Core' : 'Premium'}</span></div>
        </aside>

        <section className="workspace-explorer__results" aria-label={workspaceText('explorer.allFiles', locale)}>
          <div className="workspace-explorer__results-heading">
            <div>
              <h2>{section === 'recent' ? workspaceText('explorer.recent', locale) : section === 'open' ? workspaceText('explorer.openItems', locale) : section === 'favorites' ? workspaceText('explorer.favorites', locale) : section === 'collection' ? selectedCollection?.name ?? workspaceText('explorer.collections', locale) : section === 'app' ? editionRegistry.getImplementedApp(appKind ?? 'Writer')?.name ?? workspaceText('explorer.byApp', locale) : workspaceText('explorer.allFiles', locale)}</h2>
              <p>{workspaceText('explorer.resultCount', locale)}: {new Intl.NumberFormat(locale).format(filteredEntries.length)}</p>
            </div>
            <div className="workspace-explorer__new-document">
              <select value={newDocumentKind} onChange={(event) => setNewDocumentKind(event.currentTarget.value as DocumentKind)} aria-label={workspaceText('explorer.create', locale)}>
                {/* Erstellen nur für Beta-freigegebene Apps — ein gesperrtes Sicherheits-Gate ist kein Startknopf. */}
                {editionRegistry.creatableApps.map((app) => <option value={app.kind} key={app.kind}>{app.name}</option>)}
              </select>
              <button type="button" onClick={() => onCreateDocument(newDocumentKind)}><Plus aria-hidden="true" className="h-4 w-4" /><span>{workspaceText('explorer.create', locale)}</span></button>
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="workspace-explorer__empty">
              <div className="workspace-explorer__empty-mark"><FileStack aria-hidden="true" className="h-7 w-7" /></div>
              <h3>{query ? workspaceText('explorer.noResults', locale) : workspaceText('explorer.emptyLibrary', locale)}</h3>
            </div>
          ) : (
            <div className={`workspace-explorer__entry-list${preferences.view === 'grid' ? ' is-grid' : ''}`} role="list" aria-label={workspaceText('explorer.allFiles', locale)}>
              {visibleEntries.map((entry) => (
                <article key={entry.documentId} className={`workspace-explorer__entry${selectedEntry?.documentId === entry.documentId ? ' is-selected' : ''}`} role="listitem" onDoubleClick={() => handleOpen(entry)}>
                  <button type="button" className="workspace-explorer__entry-main" onClick={() => setSelectedId(entry.documentId)} aria-pressed={selectedEntry?.documentId === entry.documentId}>
                    {entry.kind ? <AstraeaAppIcon kind={entry.kind} alt="" className="workspace-explorer__app-icon" /> : <span className="workspace-explorer__generic-icon"><LockKeyhole aria-hidden="true" className="h-5 w-5" /></span>}
                    <span className="workspace-explorer__entry-copy">
                      <span className="workspace-explorer__entry-title">{titleForEntry(entry, locale)}</span>
                      <span className="workspace-explorer__entry-subtitle">{entry.kind ? editionRegistry.getImplementedApp(entry.kind)?.name ?? editionRegistry.getCatalogOnlyApp(entry.kind)?.name ?? workspaceText('explorer.protected', locale) : workspaceText('explorer.protected', locale)}</span>
                    </span>
                    <span className={`workspace-explorer__status state-${entry.availability}`}>{statusLabel(entry.availability, locale)}</span>
                    <span className="workspace-explorer__entry-date">{modifiedLabel(entry.modifiedAt, locale)}</span>
                  </button>
                  {isWorkspaceLibraryEntryOpenable(entry) && (
                    <button
                      type="button"
                      className="workspace-explorer__entry-open"
                      aria-label={`${openActionLabel(entry, locale)}: ${titleForEntry(entry, locale)}`}
                      title={openActionLabel(entry, locale)}
                      onClick={() => handleOpen(entry)}
                    >
                      <FolderOpen aria-hidden="true" className="h-4 w-4" />
                      <span className="workspace-explorer__entry-open-label" aria-hidden="true">{openActionLabel(entry, locale)}</span>
                    </button>
                  )}
                  <button type="button" className={`workspace-explorer__favorite${entry.isFavorite ? ' is-active' : ''}`} aria-label={entry.isFavorite ? workspaceText('explorer.removeFavorite', locale) : workspaceText('explorer.favorites', locale)} aria-pressed={entry.isFavorite} onClick={() => persistPreferences(toggleWorkspaceLibraryFavorite(preferences, entry.documentId))}>
                    <Star aria-hidden="true" className="h-4 w-4" />
                  </button>
                </article>
              ))}
            </div>
          )}
          {libraryPage.pageCount > 1 && (
            <nav className="workspace-explorer__pagination" aria-label={workspaceText('explorer.pageNavigation', locale)}>
              <button type="button" aria-label={workspaceText('explorer.previousPage', locale)} disabled={libraryPage.pageIndex === 0} onClick={() => setPageIndex(libraryPage.pageIndex - 1)}>
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                <span>{workspaceText('explorer.previousPage', locale)}</span>
              </button>
              <span className="workspace-explorer__page-count" aria-live="polite">
                {workspaceText('explorer.pageOf', locale)
                  .replace('{current}', new Intl.NumberFormat(locale).format(libraryPage.pageIndex + 1))
                  .replace('{total}', new Intl.NumberFormat(locale).format(libraryPage.pageCount))}
              </span>
              <button type="button" aria-label={workspaceText('explorer.nextPage', locale)} disabled={libraryPage.pageIndex >= libraryPage.pageCount - 1} onClick={() => setPageIndex(libraryPage.pageIndex + 1)}>
                <span>{workspaceText('explorer.nextPage', locale)}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </nav>
          )}
          {canLoadMoreStoredDocumentIds && !storedDocumentIdLimitReached && loadStoredDocumentIdPage && (
            <div className="workspace-explorer__load-more">
              <button
                type="button"
                className="workspace-explorer__primary-action"
                onClick={() => { void handleLoadMoreStoredDocuments(); }}
                disabled={isLoadingStoredDocumentIds}
                aria-busy={isLoadingStoredDocumentIds}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {workspaceText(isLoadingStoredDocumentIds ? 'explorer.loadingMore' : 'explorer.loadMore', locale)}
              </button>
              {storedDocumentIdLoadFailed && <p role="alert">{workspaceText('explorer.loadMoreFailed', locale)}</p>}
            </div>
          )}
          {storedDocumentIdLimitReached && <p className="workspace-explorer__load-limit" role="status">{workspaceText('explorer.loadLimitReached', locale)}</p>}
        </section>

        <aside className="workspace-explorer__details" aria-label={workspaceText('explorer.details', locale)} data-has-selection={hasSelectedEntry}>
          {selectedEntry ? (
            <>
              <button type="button" className="workspace-explorer__detail-close" aria-label={workspaceText('explorer.closeDetails', locale)} onClick={() => setSelectedId(null)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
              <div className="workspace-explorer__detail-cover">{selectedEntry.kind ? <AstraeaAppIcon kind={selectedEntry.kind} alt="" className="h-12 w-12 rounded-xl" /> : <FileStack aria-hidden="true" className="h-10 w-10" />}</div>
              <span className={`workspace-explorer__status state-${selectedEntry.availability}`}>{statusLabel(selectedEntry.availability, locale)}</span>
              <h2>{titleForEntry(selectedEntry, locale)}</h2>
              <p>{selectedEntry.kind ? editionRegistry.getImplementedApp(selectedEntry.kind)?.name ?? editionRegistry.getCatalogOnlyApp(selectedEntry.kind)?.name ?? workspaceText('explorer.protected', locale) : workspaceText('explorer.protected', locale)}</p>
              <dl className="workspace-explorer__detail-meta">
                <div><dt>{workspaceText('explorer.sortModified', locale)}</dt><dd>{modifiedLabel(selectedEntry.modifiedAt, locale)}</dd></div>
                <div><dt>{workspaceText('explorer.details', locale)}</dt><dd>{selectedEntry.metadataProtected ? workspaceText('explorer.protected', locale) : selectedEntry.storage === 'managed' ? 'Astraea Workspace' : workspaceText('explorer.unavailable', locale)}</dd></div>
              </dl>
              {isWorkspaceLibraryEntryOpenable(selectedEntry) && (
                <button type="button" className="workspace-explorer__primary-action" onClick={() => handleOpen(selectedEntry)}><FolderOpen aria-hidden="true" className="h-4 w-4" />{openActionLabel(selectedEntry, locale)}</button>
              )}
              {selectedEntry.availability === 'premium-required' && <p className="workspace-explorer__premium-note">{workspaceText('explorer.premiumRequired', locale)}</p>}
              {preferences.collections.length > 0 && selectedEntry.availability !== 'missing' && (
                <fieldset className="workspace-explorer__collection-membership">
                  <legend>{workspaceText('explorer.addToCollection', locale)}</legend>
                  {preferences.collections.map((collection) => (
                    <label key={collection.id}>
                      <input type="checkbox" checked={collection.documentIds.includes(selectedEntry.documentId)} onChange={(event) => collectionToggle(selectedEntry, collection.id, event.currentTarget.checked)} />
                      <span>{collection.name}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          ) : <p className="workspace-explorer__details-empty">{workspaceText('explorer.selectItem', locale)}</p>}
        </aside>
      </div>
    </section>
  );
};
