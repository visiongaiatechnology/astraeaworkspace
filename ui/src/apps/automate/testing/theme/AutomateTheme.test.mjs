import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const css = read('../../canvas/AutomateCanvasTheme.css');
const globalCss = [
  '../../../../design-system/styles/index.css',
  '../../../../design-system/styles/foundation.css',
  '../../../../design-system/styles/app-primitives.css',
  '../../../../design-system/styles/app-accessibility.css',
  '../../../../design-system/styles/theme-layer.css',
  '../../../../design-system/styles/module-accessibility.css',
  '../../../../design-system/styles/workspace-interaction.css',
  '../../../../design-system/styles/shell-surfaces.css',
  '../../../../design-system/styles/shared-controls.css',
  '../../../../design-system/styles/content-color-policy.css',
  '../../../../design-system/styles/module-shells.css',
].map(read).join('\n');
const source = [
  read('../../app/AutomateView.tsx'),
  read('../../toolbar/AutomatePalette.tsx'),
  read('../../canvas/AutomateCanvas.tsx'),
  read('../../execution/AutomateRunDrawer.tsx'),
].join('\n');

describe('Automate material theme contract', () => {
  it('maps app, palette, canvas, nodes, inspector and actions to Workspace theme tokens', () => {
    for (const selector of [
      '[data-vgt-automate-root="true"]',
      '.automate-palette',
      '.automate-canvas',
      '.automate-flow-node',
      '.automate-run-drawer',
      '.automate-primary-button',
    ]) expect(css).toContain(selector);

    for (const token of [
      '--as-bg-environment', '--as-bg-toolbar', '--as-bg-sidebar', '--as-bg-workbench', '--as-bg-control',
      '--as-text-primary', '--as-text-secondary', '--as-border-control', '--as-border-strong', '--as-accent-strong',
      '--as-primary-action-surface', '--as-selection-border', '--as-success', '--as-warning', '--as-critical',
    ]) expect(css).toContain(token);
  });

  it('keeps status colors semantic and adapts selection, focus and reduced motion', () => {
    expect(css).toContain('.automate-status-dot--success');
    expect(css).toContain('.automate-status-dot--critical');
    expect(css).toContain('.automate-status-dot--running');
    expect(css).toContain('.automate-flow-node.is-selected');
    expect(css).toContain('overflow: auto');
    expect(source).toContain('className="automate-canvas flex-1 relative overflow-auto select-none"');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('--as-selection');
  });

  it('removes fixed violet/slate surfaces from Automate components', () => {
    expect(source).not.toMatch(/bg-\[#|border-purple-|text-slate-|bg-purple-|from-purple-/);
    expect(source).toContain('import \'../canvas/AutomateCanvasTheme.css\';');
    expect(source).toContain('automate-node-icon--trigger');
  });

  it('keeps the primary workspace content reachable at maximum shell scale', () => {
    expect(globalCss).toContain(':root[data-astraea-scale-band="maximum"] body');
    expect(globalCss).toContain(':root[data-astraea-scale-band="maximum"] #root');
    expect(globalCss).toContain(':root[data-astraea-scale-band="maximum"] #astraea-workspace-main');
    expect(globalCss).toContain('overflow-y: auto');
    expect(globalCss).toContain('min-height: 60vh');
    expect(css).toContain('.automate-workspace-layout');
    expect(css).toContain('flex-wrap: wrap;');
    expect(css).toContain('order: 0;');
    expect(css).toContain('order: 1;');
    expect(css).toContain('order: 2;');
    expect(css).toContain('.automate-minimap');
    expect(css).toContain('top: 1rem;');
    expect(css).toContain('width: min(18vw, 16rem);');
    expect(css).toContain('.automate-toolbar');
    expect(css).toContain('.automate-palette > div:last-child');
    expect(css).toContain('overflow-y: auto;');
    expect(source).toContain('const [layoutScale, setLayoutScale] = React.useState(readWorkspaceScale)');
    expect(source).toContain('node.x * layoutScale');
  });


  it('allows long palette labels and inspector headings to wrap at high scale', () => {
    expect(css).toContain('.automate-palette-item > span:first-child');
    expect(css).toContain('min-width: 0;\n  flex: 1 1 auto;');
    expect(css).toContain('.automate-palette-item-name');
    expect(css).toContain('overflow-wrap: anywhere;');
    expect(css).toContain('.automate-run-drawer-header > span');
    expect(css).toContain('.automate-run-drawer-header > button');
  });
});
