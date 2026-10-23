import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEditionRegistry } from '../../../edition/registry';
import type { DocumentKind } from '../../../shared/contracts/workspace';
import { listStoredDocumentIdPage } from '../../../platform/workspace/persistence/workspaceStorage';
import { WorkspaceExplorer } from '../components/WorkspaceExplorer';

function renderExplorer(
  documentId: string,
  options: { stored?: boolean; recentKind?: DocumentKind } = {},
): string {
  return renderToStaticMarkup(<WorkspaceExplorer
    documents={{}}
    storedDocumentIds={new Set(options.stored ? [documentId] : [])}
    openDocumentIds={new Set()}
    recentEntries={options.recentKind ? [{ documentId, kind: options.recentKind, lastOpenedAt: 1_700_000_000_000 }] : []}
    metadataLocked={false}
    editionRegistry={createEditionRegistry('open-core')}
    onClose={vi.fn()}
    onOpenDocument={vi.fn()}
    onCreateDocument={vi.fn()}
  />);
}

describe('Workspace Explorer open actions', () => {
  it('exposes a localized action for an opaque stored document ID', () => {
    const markup = renderExplorer('closed-writer', { stored: true });

    expect(markup).toMatch(/aria-label="Open protected document:/u);
    expect(markup).toContain('workspace-explorer__entry-open');
    expect(markup).toContain('workspace-explorer__primary-action');
  });

  it('keeps Premium-required and unavailable entries non-openable in Open Core', () => {
    const premiumMarkup = renderExplorer('closed-form', { stored: true, recentKind: 'Forms' });
    const missingMarkup = renderExplorer('missing-doc', { recentKind: 'Writer' });

    expect(premiumMarkup).toContain('Only available in Premium');
    expect(premiumMarkup).not.toContain('workspace-explorer__entry-open');
    expect(missingMarkup).toContain('This saved document is unavailable.');
    expect(missingMarkup).not.toContain('workspace-explorer__entry-open');
  });

  it('renders a bounded 100-item page for a 10,000-entry library', () => {
    const storedDocumentIds = new Set(
      Array.from({ length: 10_000 }, (_, index) => 'library-' + String(index).padStart(5, '0')),
    );
    const markup = renderToStaticMarkup(<WorkspaceExplorer
      documents={{}}
      storedDocumentIds={storedDocumentIds}
      openDocumentIds={new Set()}
      recentEntries={[]}
      metadataLocked={false}
      editionRegistry={createEditionRegistry('open-core')}
      onClose={vi.fn()}
      onOpenDocument={vi.fn()}
      onCreateDocument={vi.fn()}
    />);

    expect(markup.match(/role="listitem"/gu)?.length ?? 0).toBe(100);
    expect(markup).toContain('Page 1 of 100');
    expect(markup).toContain('aria-label="Next page"');
    expect(markup).not.toContain('library-09999');
  });

  it('exposes a localized control when the startup key scan reports more saved IDs', () => {
    const markup = renderToStaticMarkup(<WorkspaceExplorer
      documents={{}}
      storedDocumentIds={new Set(['doc-first'])}
      storedDocumentIdCursor="doc-first"
      hasMoreStoredDocumentIds
      loadStoredDocumentIdPage={listStoredDocumentIdPage}
      openDocumentIds={new Set()}
      recentEntries={[]}
      metadataLocked={false}
      editionRegistry={createEditionRegistry('open-core')}
      onClose={vi.fn()}
      onOpenDocument={vi.fn()}
      onCreateDocument={vi.fn()}
    />);

    expect(markup).toContain('Load more documents');
    expect(markup).toContain('workspace-explorer__load-more');
    expect(markup).toContain('aria-busy="false"');
  });
});
