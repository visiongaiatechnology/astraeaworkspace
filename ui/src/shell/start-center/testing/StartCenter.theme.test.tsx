import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SHELL_APPEARANCE,
  DEFAULT_SHELL_SHORTCUTS,
  defaultShellUpdateState,
  type ShellRecentEntry,
} from '../../platform/workspaceShellPlatform';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { StartCenter } from '../StartCenter';
import { StartDiagnosticsPanel } from '../StartDiagnosticsPanel';
import { StartTemplates } from '../StartTemplates';
import { StartToolGrid } from '../StartToolGrid';
import type { StartCenterProps } from '../contracts/startCenterTypes';
import { createEditionRegistry } from '../../../edition/registry';
import { ShellPlatformStatusPanel } from '../ShellPlatformStatusPanel';

const previewDocument: WorkspaceDocument = {
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

const recentEntries: ShellRecentEntry[] = [
  { documentId: previewDocument.id, kind: previewDocument.kind, lastOpenedAt: 1 },
];

function makeStartCenterProps(): StartCenterProps {
  return {
    isOpen: true,
    editionRegistry: createEditionRegistry('premium'),
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
    documents: { [previewDocument.id]: previewDocument },
    recentEntries,
    storedDocumentIds: new Set([previewDocument.id]),
    metadataLocked: false,
    onOpenRecentDocument: () => undefined,
    shellAppearance: DEFAULT_SHELL_APPEARANCE,
    shellShortcuts: DEFAULT_SHELL_SHORTCUTS,
    shellUpdateState: defaultShellUpdateState('0.1.0-beta.1'),
    onShellAppearanceChange: () => undefined,
    onShellShortcutChange: () => undefined,
    onOpenNewWindow: () => undefined,
  };
}

describe('Start Center premium theme surfaces', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses palette surfaces and reserves the accent for primary and selected actions', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    const markup = renderToStaticMarkup(<StartCenter {...makeStartCenterProps()} />);

    expect(markup).toContain('bg-[var(--vgt-surface-z0)]');

    /**
     * Native regression (Runde 4) — the Start Center must cover the shell header.
     *
     * The header was raised to `z-50` for the File menu (WR-SHELL-01). The Start Center kept
     * `z-30` and therefore lost the stacking order: the header bar cut across the overview and
     * hid navigation and search. Every other shell modal already sits on `z-50`; the Start
     * Center is rendered after the header in the DOM, so at the same level it wins.
     */
    const dialogStart = markup.indexOf('role="dialog"');
    const dialog = markup.slice(Math.max(0, dialogStart - 200), dialogStart + 400);
    expect(dialog).toMatch(/class="[^"]*\bz-50\b[^"]*"/);
    expect(dialog).not.toMatch(/class="[^"]*\bz-30\b[^"]*"/);
    expect(markup).not.toMatch(/class="fixed inset-0 z-30/);

    const sidebarStart = markup.indexOf('<aside aria-label="Start Center navigation"');
    const sidebarEnd = markup.indexOf('</aside>', sidebarStart);
    const sidebar = markup.slice(sidebarStart, sidebarEnd);
    expect(sidebar).toContain('glass-panel');
    expect(sidebar).toContain('vgt-button-primary');
    expect(sidebar).toContain('var(--vgt-metal-edge)');
    expect(sidebar).not.toMatch(/bg-purple-|border-purple-|text-purple-|bg-\[#/);

    const topbarStart = markup.indexOf('<header class="glass-panel sticky');
    const topbarEnd = markup.indexOf('</header>', topbarStart);
    const topbar = markup.slice(topbarStart, topbarEnd);
    expect(topbar).toContain('vgt-input');
    expect(topbar).toContain('placeholder="Search everything…"');
    expect(topbar).toContain('pr-20');
    expect(topbar).toContain('aria-describedby="start-search-syntax-hint"');
    expect(topbar).toContain('type:writer, tag:security, and field:ocr');
    expect(topbar).toContain('aria-pressed="true"');
    expect(topbar).toContain('bg-[var(--vgt-accent-soft)]');
    expect(topbar).toContain('var(--vgt-control-hover)');
    expect(topbar).not.toMatch(/bg-purple-|border-purple-|text-purple-|bg-\[#/);
  });

  it('keeps document preview imagery unfiltered inside neutral glass surfaces', () => {
    const markup = renderToStaticMarkup(
      <StartCenter {...makeStartCenterProps()} initialSearchQuery="" />,
    );
    const recentStart = markup.indexOf('<section aria-labelledby="start-recent-title"');
    const recentEnd = markup.indexOf('</section>', recentStart);
    const recentPanel = markup.slice(recentStart, recentEnd);
    const previewImage = recentPanel.match(/<img src="data:image\/svg\+xml[^"]*"[^>]*class="([^"]+)"/);

    expect(recentPanel).toContain('glass-panel');
    expect(recentPanel).toContain('var(--vgt-control-surface)');
    expect(recentPanel).toContain('Quarterly forecast');
    expect(previewImage?.[1]).toContain('object-cover');
    expect(previewImage?.[1]).not.toMatch(/filter|grayscale|contrast/);
    expect(recentPanel).not.toMatch(/bg-purple-|border-purple-|text-purple-|bg-\[#/);
  });

  it('keeps the template catalog calm and makes the selected filter explicit', () => {
    const markup = renderToStaticMarkup(
      <StartTemplates onCreateTemplate={() => undefined} editionRegistry={createEditionRegistry('premium')} />,
    );

    expect(markup).toContain('glass-panel');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('var(--vgt-accent-soft)');
    expect(markup).toContain('var(--vgt-control-surface)');
    expect(markup).not.toMatch(/bg-purple-|border-purple-|text-purple-|bg-slate-|text-slate-/);
  });

  it('keeps Premium-only template previews inert and labelled in Open Core', () => {
    const markup = renderToStaticMarkup(
      <StartTemplates onCreateTemplate={() => undefined} editionRegistry={createEditionRegistry('open-core')} />,
    );

    expect(markup).toContain('aria-label="Project plan · Only available in Premium"');
    expect(markup).toContain('Project plan');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-availability="premium-required"');
  });

  it('uses neutral module surfaces while preserving app icon and category content', () => {
    const markup = renderToStaticMarkup(
      <StartToolGrid searchQuery="" activeCategory="all" onSelectModule={() => undefined} editionRegistry={createEditionRegistry('premium')} />,
    );

    expect(markup).toContain('glass-panel');
    expect(markup).toContain('Astraea Writer');
    expect(markup).toContain('Productivity');
    expect(markup).toContain('vgt-button-secondary');
    expect(markup).toContain('/astraea-icons/svg/astraea-writer.svg');
    expect(markup).toContain('Astraea Publish');
    expect(markup).toContain('Astraea Insight');
    expect(markup).toContain('Astraea Connect');
    expect(markup).toContain('Astraea Automate');
    expect(markup).not.toMatch(/bg-purple-|border-purple-|text-purple-|bg-slate-|text-slate-/);
  });

  it('shows the edition label in the Start Center title area', () => {
    const markup = renderToStaticMarkup(
      <StartCenter {...makeStartCenterProps()} editionRegistry={createEditionRegistry('open-core')} />,
    );

    expect(markup).toContain('OPEN CORE');
    expect(markup).toContain('aria-label="Edition: Open Core"');
  });

  it('shows inert Premium teasers in the Open Core start catalog', () => {
    const markup = renderToStaticMarkup(
      <StartToolGrid
        searchQuery=""
        activeCategory="all"
        onSelectModule={() => undefined}
        editionRegistry={createEditionRegistry('open-core')}
      />,
    );

    expect(markup.match(/<article[^>]*data-availability="premium-required"/gu)).toHaveLength(6);
    expect(markup).toContain('Only available in Premium');
    expect(markup).toContain('aria-label="Astraea Planner — Only available in Premium"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-availability="premium-required"');
  });

  it('identifies the selected edition in the About and update panel', () => {
    const markup = renderToStaticMarkup(
      <ShellPlatformStatusPanel
        edition="open-core"
        appearance={DEFAULT_SHELL_APPEARANCE}
        shortcuts={DEFAULT_SHELL_SHORTCUTS}
        updateState={defaultShellUpdateState('0.1.0-beta.1')}
        documents={{}}
        onAppearanceChange={() => undefined}
        onShortcutChange={() => undefined}
        onOpenNewWindow={() => undefined}
      />,
    );

    expect(markup).toContain('Edition: Open Core');
  });

  it('themes and localizes the platform status controls', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    const markup = renderToStaticMarkup(
      <ShellPlatformStatusPanel
        edition="open-core"
        appearance={DEFAULT_SHELL_APPEARANCE}
        shortcuts={DEFAULT_SHELL_SHORTCUTS}
        updateState={defaultShellUpdateState('0.1.0-beta.1')}
        documents={{}}
        onAppearanceChange={() => undefined}
        onShortcutChange={() => undefined}
        onOpenNewWindow={() => undefined}
      />,
    );

    expect(markup).toContain('About &amp; update state');
    expect(markup).toContain('Cosmic Obsidian');
    expect(markup).toContain('Automatic update networking is disabled');
    expect(markup).toContain('Document accessibility checkers');
    expect(markup).toContain('Keyboard shortcut map &amp; conflict guard');
    expect(markup).toContain('var(--vgt-surface-z1)');
    expect(markup).toContain('var(--vgt-metal-edge)');
    expect(markup).not.toMatch(/bg-purple-|border-purple-|text-purple-|bg-slate-|text-slate-/);
  });

  it('uses neutral diagnostics panels and keeps semantic status colors tokenized', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => undefined });
    vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: () => undefined });
    const markup = renderToStaticMarkup(
      <StartDiagnosticsPanel
        onOpenFileClick={() => undefined}
        onOpenVault={() => undefined}
        recoverySnapshots={[]}
        onRestoreRecovery={() => undefined}
        onDeleteRecovery={() => undefined}
        onExportDiagnostics={() => undefined}
        onOpenPlatformModal={() => undefined}
      />,
    );

    expect(markup).toContain('glass-panel');
    expect(markup).toContain('vgt-button-primary');
    expect(markup).toContain('var(--vgt-control-success)');
    expect(markup).toContain('var(--vgt-control-warning)');
    expect(markup).toContain('var(--vgt-control-danger)');
    expect(markup).not.toMatch(/bg-purple-|border-purple-|text-purple-|bg-slate-|text-slate-/);
  });
});
