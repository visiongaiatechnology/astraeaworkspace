// STATUS: PLATIN — AST-0651/AST-0654/AST-0746: the rendered page list is a real, labelled tree.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NotePage, NoteSection } from '../../../../shared/contracts/workspace';
import { NotesHierarchyNotice, NotesPagesList } from '../../navigation/NotesPagesList';

const noop = (): void => undefined;

function page(id: string, title: string, parentPageId: string | null = null): NotePage {
  return { id, title, content: `${title} body`, tags: [], backlinks: [], last_modified: 1_700_000_000_000, parentPageId };
}

const parent = page('p1', 'Parent');
const child = page('p2', 'Child', 'p1');
const activeSection: NoteSection = {
  id: 'sec', title: 'Evidence', createdAt: 1, updatedAt: 1, trashedAt: null, pages: [parent, child],
};

function renderList(overrides: Partial<ComponentProps<typeof NotesPagesList>> = {}): string {
  const props: ComponentProps<typeof NotesPagesList> = {
    activeSection,
    activePageId: 'p1',
    filteredPages: [parent, child],
    searchQuery: '',
    onSearchChange: noop,
    searchScope: 'section',
    onSearchScopeChange: noop,
    showArchived: false,
    onShowArchivedChange: noop,
    favoritesOnly: false,
    onFavoritesOnlyChange: noop,
    searchDateFrom: '',
    onSearchDateFromChange: noop,
    searchDateTo: '',
    onSearchDateToChange: noop,
    searchResultsByPageId: new Map(),
    savedSearches: [],
    selectedSavedSearchId: null,
    onApplySavedSearch: noop,
    onSaveSearch: noop,
    onDeleteSavedSearch: noop,
    pageCollection: 'pages',
    onPageCollectionChange: noop,
    onSelectPage: noop,
    onCreatePage: noop,
    onCreateDailyNote: noop,
    onDeletePage: noop,
    onRestorePage: noop,
    onSetPageParent: () => null,
    customPageTemplates: [],
    formatTime: () => 'just now',
    ...overrides,
  };
  return renderToStaticMarkup(<NotesPagesList {...props} />);
}

describe('AST-0651 rendered page tree contract', () => {
  it('exposes the hierarchy as a labelled tree with levels and selection', () => {
    const markup = renderList();
    expect(markup).toContain('role="tree"');
    expect(markup).toContain('aria-label="Note page hierarchy"');
    expect(markup).toContain('role="treeitem"');
    expect(markup).toContain('aria-level="1"');
    expect(markup).toContain('aria-level="2"');
    expect(markup).toContain('aria-selected="true"');
  });

  it('keeps exactly one row in the tab order so Tab reaches the tree once', () => {
    const markup = renderList();
    expect((markup.match(/tabindex="0"/g) ?? []).length).toBe(1);
  });

  it('marks a parent row as expanded and gives every row an accessible parent selector', () => {
    const markup = renderList();
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="Set subpage parent of Parent"');
    expect(markup).toContain('aria-label="Set subpage parent of Child"');
  });

  it('renders the trash collection as a flat list without tree roles', () => {
    const trashed: NotePage = { ...page('p3', 'Deleted'), trashedAt: 5 };
    const markup = renderList({ pageCollection: 'trash', filteredPages: [trashed], activePageId: 'p3' });
    expect(markup).not.toContain('role="tree"');
    expect(markup).not.toContain('role="treeitem"');
    expect(markup).toContain('Restore page');
  });

  it('shows no rejection message until a hierarchy change is rejected', () => {
    expect(renderList()).not.toContain('role="status"');
  });
});

describe('AST-0654 rejection notice contract', () => {
  it('announces the concrete rejection reason as visible, non-colour-only text', () => {
    const markup = renderToStaticMarkup(<NotesHierarchyNotice message="That move would create a circular page hierarchy, so it was rejected." />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('circular page hierarchy');
  });

  it('renders nothing when the last hierarchy change succeeded', () => {
    expect(renderToStaticMarkup(<NotesHierarchyNotice message={null} />)).toBe('');
    expect(renderToStaticMarkup(<NotesHierarchyNotice message="" />)).toBe('');
  });
});
