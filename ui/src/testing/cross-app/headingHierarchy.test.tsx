import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConnectView } from '../../apps/connect/components/ConnectView';
import { DEFAULT_CONNECT_MODEL, type ConnectViewMode } from '../../apps/connect/domain/types';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { StartCenter } from '../../shell/start-center/StartCenter';
import type { StartCenterProps } from '../../shell/start-center/contracts/startCenterTypes';
import { DEFAULT_SHELL_APPEARANCE, DEFAULT_SHELL_SHORTCUTS, defaultShellUpdateState } from '../../shell/platform/workspaceShellPlatform';
import { createEditionRegistry } from '../../edition/registry';

function renderedHeadingLevels(markup: string): number[] {
  return [...markup.matchAll(/<h([1-6])(?=[\s>])/g)].map(([, level]) => Number(level));
}

function findHeadingJumps(levels: readonly number[]): Array<{ from: number; to: number }> {
  const jumps: Array<{ from: number; to: number }> = [];
  for (let index = 1; index < levels.length; index += 1) {
    const previous = levels[index - 1];
    const current = levels[index];
    if (previous !== undefined && current !== undefined && current > previous + 1) {
      jumps.push({ from: previous, to: current });
    }
  }
  return jumps;
}

function makeConnectDocument(viewMode: ConnectViewMode): WorkspaceDocument {
  return {
    id: `heading-audit-${viewMode}`,
    title: 'Connect heading audit',
    kind: 'Connect',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    connectData: { ...structuredClone(DEFAULT_CONNECT_MODEL), viewMode },
  };
}

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
    documents: {},
    recentEntries: [],
    storedDocumentIds: new Set<string>(),
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

describe('UX-094 rendered heading hierarchy', () => {
  it('checks the composed Start Center headings for skipped levels', () => {
    const markup = renderToStaticMarkup(<StartCenter {...makeStartCenterProps()} />);
    const levels = renderedHeadingLevels(markup);
    expect(levels).toContain(1);
    expect(findHeadingJumps(levels)).toEqual([]);
  });

  it.each<ConnectViewMode>(['mail', 'calendar', 'contacts'])(
    'checks rendered Connect %s headings for skipped levels',
    (viewMode) => {
      const markup = renderToStaticMarkup(
        <ConnectView document={makeConnectDocument(viewMode)} onUpdateDocument={vi.fn()} />,
      );
      const levels = renderedHeadingLevels(markup);
      expect(levels.length, `${viewMode} should render at least one heading`).toBeGreaterThan(0);
      expect(findHeadingJumps(levels)).toEqual([]);
      if (viewMode === 'contacts' || viewMode === 'calendar') expect(levels).toContain(3);
    },
  );
});
