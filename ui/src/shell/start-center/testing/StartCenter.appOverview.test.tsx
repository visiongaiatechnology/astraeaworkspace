// @vitest-environment happy-dom
// STATUS: PLATIN — Alpha 0.1 integration: the app overview is the first thing after the hero.
//
// This renders the real Start Center (not just the overview component) to pin the user-visible order
// the Alpha blocker asked for: hero → app overview → workspace library ("Zuletzt verwendet") → tools.
// It also proves the overview inherits the release-modules availability badges (ALPHA / IM AUSBAU)
// instead of inventing a second classification.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditionRegistry } from '../../../edition/registry';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  DEFAULT_SHELL_APPEARANCE,
  DEFAULT_SHELL_SHORTCUTS,
  defaultShellUpdateState,
} from '../../platform/workspaceShellPlatform';
import { StartCenter } from '../StartCenter';
import type { StartCenterProps } from '../contracts/startCenterTypes';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { workspaceText } from '../../localization/workspaceLocale';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../localization/workspaceLocale', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../localization/workspaceLocale')>();
  return { ...actual, useWorkspaceLocale: () => ({ locale: localeState.current }) };
});

const recentDocument: WorkspaceDocument = {
  id: 'recent-grid-document',
  title: 'Quarterly forecast',
  kind: 'Grid',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function startCenterProps(): StartCenterProps {
  return {
    isOpen: true,
    editionRegistry: createEditionRegistry('open-core'),
    onClose: () => undefined,
    onCreateDocument: () => undefined,
    onCreateTemplate: () => undefined,
    onOpenFile: () => undefined,
    onOpenVault: () => undefined,
    recoverySnapshots: [],
    onRestoreRecovery: () => undefined,
    onDeleteRecovery: () => undefined,
    onExportDiagnostics: () => undefined,
    onOpenPlatformModal: () => undefined,
    documents: { [recentDocument.id]: recentDocument },
    recentEntries: [{ documentId: recentDocument.id, kind: recentDocument.kind, lastOpenedAt: 1 }],
    storedDocumentIds: new Set([recentDocument.id]),
    metadataLocked: false,
    onOpenRecentDocument: () => undefined,
    shellAppearance: DEFAULT_SHELL_APPEARANCE,
    shellShortcuts: DEFAULT_SHELL_SHORTCUTS,
    shellUpdateState: defaultShellUpdateState('0.1.0-alpha.1'),
    onShellAppearanceChange: () => undefined,
    onShellShortcutChange: () => undefined,
    onOpenNewWindow: () => undefined,
  };
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
  vi.unstubAllGlobals();
});

describe('Start Center — app overview placement and badges', () => {
  it('renders the app overview after the hero and before the workspace library', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    const markup = renderToStaticMarkup(<StartCenter {...startCenterProps()} />);

    const heroIndex = markup.indexOf('id="astraea-start-title"');
    const overviewIndex = markup.indexOf('data-start-app-overview="true"');
    const libraryIndex = markup.indexOf('id="start-recent-title"');
    expect(heroIndex).toBeGreaterThan(-1);
    expect(overviewIndex).toBeGreaterThan(heroIndex);
    expect(libraryIndex).toBeGreaterThan(overviewIndex);
  });

  it('inherits the release-modules availability badges on the overview rows', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    const markup = renderToStaticMarkup(<StartCenter {...startCenterProps()} />);
    expect(markup).toContain(`data-availability-badge="alpha"`);
    expect(markup).toContain(`data-availability-badge="in-progress"`);
    expect(markup).toContain(workspaceText('availability.alpha', 'de-DE'));
    expect(markup).toContain(workspaceText('availability.inProgress', 'de-DE'));

    const writerRow = markup.slice(
      markup.indexOf('data-app-overview-kind="Writer"'),
      markup.indexOf('</li>', markup.indexOf('data-app-overview-kind="Writer"')),
    );
    expect(writerRow).toContain('data-availability-badge="alpha"');
    const pdfRow = markup.slice(
      markup.indexOf('data-app-overview-kind="PdfStudio"'),
      markup.indexOf('</li>', markup.indexOf('data-app-overview-kind="PdfStudio"')),
    );
    expect(pdfRow).toContain('data-availability-badge="in-progress"');
  });

  it('keeps the overview off search-result and narrow-category states', async () => {
    // The search state is set in an effect, so this needs a real client render rather than SSR.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<StartCenter {...startCenterProps()} initialSearchQuery="writer" />);
    });

    expect(container.querySelector('[data-start-app-overview="true"]')).toBeNull();
    // The filtered tool grid/search result surface still answers the search.
    expect(container.querySelector('#start-tools-title')).not.toBeNull();
  });

  it.each(WORKSPACE_LOCALES)('shows the overview heading in %s', (locale) => {
    localeState.current = locale;
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    const markup = renderToStaticMarkup(<StartCenter {...startCenterProps()} />);
    expect(markup).toContain(workspaceText('start.overview.title', locale));
  });
});
