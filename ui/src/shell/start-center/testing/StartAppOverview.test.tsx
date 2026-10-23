// @vitest-environment happy-dom
// STATUS: PLATIN — Alpha 0.1 first-start app overview: core apps, honest sentences, working actions.
//
// The overview is the first-start trust surface: it must list the core Open Core apps, describe them
// truthfully (the same localized sentences the rest of the shell uses), and every primary action must
// call a real handler — "Open" for an already open document, "Create" otherwise. It must never show a
// dead button for a blocked security gate, and it must stay badge-ready for the modules workstream.
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentKind, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { EditionRegistry } from '../../../edition/contracts';
import { createEditionRegistry } from '../../../edition/registry';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { workspaceText } from '../../localization/workspaceLocale';
import { shellSurfaceCopy } from '../../i18n/shellSurfaceLocale';
import { StartAppOverview, START_OVERVIEW_APP_KINDS } from '../StartAppOverview';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../localization/workspaceLocale', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../localization/workspaceLocale')>();
  return { ...actual, useWorkspaceLocale: () => ({ locale: localeState.current }) };
});

const REGISTRY: EditionRegistry = createEditionRegistry('open-core');

function documentFixture(overrides: Partial<WorkspaceDocument> & Pick<WorkspaceDocument, 'id' | 'kind'>): WorkspaceDocument {
  return { title: overrides.id, created_at: 1, modified_at: 1, version: 1, theme_id: 'default', root_object_ids: [], objects: {}, ...overrides } as WorkspaceDocument;
}

interface RenderOverrides {
  readonly editionRegistry?: EditionRegistry;
  readonly documents?: Record<string, WorkspaceDocument>;
  readonly onOpenDocument?: (documentId: string) => void;
  readonly onCreateDocument?: (kind: DocumentKind) => void;
  readonly renderBadge?: (kind: DocumentKind) => ReactNode;
}

function renderOverview(overrides: RenderOverrides = {}): string {
  return renderToStaticMarkup(
    <StartAppOverview
      editionRegistry={overrides.editionRegistry ?? REGISTRY}
      documents={overrides.documents ?? {}}
      onOpenDocument={overrides.onOpenDocument ?? (() => undefined)}
      onCreateDocument={overrides.onCreateDocument ?? (() => undefined)}
      renderBadge={overrides.renderBadge}
    />,
  );
}

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  localeState.current = 'de-DE';
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('StartAppOverview — first-start app overview', () => {
  it('sits on the start page with the localized heading and description', () => {
    const markup = renderOverview();
    expect(markup).toContain('data-start-app-overview="true"');
    expect(markup).toContain('aria-labelledby="start-app-overview-title"');
    expect(markup).toContain(workspaceText('start.overview.title', 'de-DE'));
    expect(markup).toContain(workspaceText('start.overview.description', 'de-DE'));
  });

  it('shows the required core apps, each with its one honest sentence', () => {
    const markup = renderOverview();
    const surface = shellSurfaceCopy('de-DE');
    const required = ['Writer', 'Grid', 'Present', 'Notes', 'Tasks', 'Whiteboard', 'Publish', 'PdfStudio'] as const;
    for (const kind of required) {
      expect(START_OVERVIEW_APP_KINDS, kind).toContain(kind);
      expect(markup, kind).toContain(`data-app-overview-kind="${kind}"`);
      expect(markup, kind).toContain(surface.modules[kind].description);
    }
    // Priority order is the user-facing Alpha order, not alphabetical.
    const positions = required.map((kind) => markup.indexOf(`data-app-overview-kind="${kind}"`));
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    // Draw and Vault are welcome additions, but they must only appear when the Alpha allows them.
    for (const kind of ['Draw', 'Vault'] as const) {
      if (REGISTRY.isImplementedApp(kind) && REGISTRY.isCreationAvailable(kind)) {
        expect(markup, kind).toContain(`data-app-overview-kind="${kind}"`);
      }
    }
  });

  it('never offers a dead action for a locked security gate', () => {
    const markup = renderOverview();
    const blockedKinds = ['AdminPolicy'] as const;
    for (const kind of blockedKinds) {
      expect(markup).not.toContain(`data-app-overview-kind="${kind}"`);
    }
    // Only shipped and Alpha-creatable apps may own a visible action.
    const actionCount = (markup.match(/data-app-overview-action=/g) ?? []).length;
    const kindCount = (markup.match(/data-app-overview-kind=/g) ?? []).length;
    expect(actionCount).toBe(kindCount);
    expect(actionCount).toBeGreaterThanOrEqual(8);
  });

  it('offers Create for apps that are not open and Open for an already open document', () => {
    const writer = documentFixture({ id: 'writer-open', kind: 'Writer', title: 'Mein Plan' });
    const markup = renderOverview({ documents: { 'writer-open': writer } });
    expect(markup).toContain('data-app-overview-kind="Writer" data-app-overview-state="open"');
    expect(markup).toContain('data-app-overview-kind="Grid" data-app-overview-state="create"');
    expect(markup).toContain(workspaceText('start.overview.open', 'de-DE'));
    expect(markup).toContain(workspaceText('start.overview.create', 'de-DE'));
    expect(markup).toContain('aria-label="Astraea Writer — Öffnen"');
    expect(markup).toContain('aria-label="Astraea Grid — Erstellen"');
  });

  it('calls the real handlers: create for new apps, open for an open document', async () => {
    const onOpenDocument = vi.fn();
    const onCreateDocument = vi.fn();
    const writer = documentFixture({ id: 'writer-open', kind: 'Writer' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StartAppOverview
          editionRegistry={REGISTRY}
          documents={{ 'writer-open': writer }}
          onOpenDocument={onOpenDocument}
          onCreateDocument={onCreateDocument}
        />,
      );
    });

    const openButton = container.querySelector<HTMLButtonElement>('[data-app-overview-kind="Writer"] [data-app-overview-action="open"]');
    const createButton = container.querySelector<HTMLButtonElement>('[data-app-overview-kind="Grid"] [data-app-overview-action="create"]');
    expect(openButton).not.toBeNull();
    expect(createButton).not.toBeNull();

    await act(async () => { openButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onOpenDocument).toHaveBeenCalledWith('writer-open');
    expect(onCreateDocument).not.toHaveBeenCalled();

    await act(async () => { createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onCreateDocument).toHaveBeenCalledWith('Grid');
  });

  it('renders a guarded empty state instead of an empty shell', () => {
    const blockedRegistry: EditionRegistry = {
      ...REGISTRY,
      isImplementedApp: (() => false) as unknown as EditionRegistry['isImplementedApp'],
      isCreationAvailable: (() => false) as unknown as EditionRegistry['isCreationAvailable'],
    };
    const markup = renderOverview({ editionRegistry: blockedRegistry });
    expect(markup).toContain('data-start-app-overview="true"');
    expect(markup).toContain(workspaceText('start.overview.empty', 'de-DE'));
    expect(markup).not.toContain('data-start-app-overview-list="true"');
  });

  it('reserves a badge slot for the modules workstream without claiming a status itself', () => {
    const withoutBadges = renderOverview();
    expect(withoutBadges).not.toContain('data-app-overview-badge-slot');

    const withBadges = renderToStaticMarkup(
      <StartAppOverview
        editionRegistry={REGISTRY}
        documents={{}}
        onOpenDocument={() => undefined}
        onCreateDocument={() => undefined}
        renderBadge={(kind) => (kind === 'Writer' ? <span data-test-badge="writer">Kernmodul</span> : null)}
      />,
    );
    expect(withBadges).toContain('data-app-overview-badge-slot="Writer"');
    expect(withBadges).toContain('data-test-badge="writer"');
  });

  it.each(WORKSPACE_LOCALES)('speaks the app overview in %s without falling back to German copy', (locale) => {
    localeState.current = locale;
    const markup = renderOverview();
    expect(markup).toContain(workspaceText('start.overview.title', locale));
    expect(markup).toContain(workspaceText('start.overview.description', locale));
    expect(markup).toContain(workspaceText('start.overview.create', locale));
    if (locale === 'en-US') {
      expect(markup).not.toContain('Erstellen');
      expect(markup).not.toContain('App-Übersicht');
    }
  });
});
