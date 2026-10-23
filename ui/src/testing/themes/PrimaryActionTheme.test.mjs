import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = new URL('.', import.meta.url);
const read = (relativePath) => readFileSync(fileURLToPath(new URL(relativePath, here)), 'utf8');

describe('curated primary-action material contract', () => {
  it('routes shared and legacy app primary actions through recipe tokens', () => {
    const globalCss = [
      '../../design-system/styles/index.css',
      '../../design-system/styles/foundation.css',
      '../../design-system/styles/app-primitives.css',
      '../../design-system/styles/app-accessibility.css',
      '../../design-system/styles/theme-layer.css',
      '../../design-system/styles/module-accessibility.css',
      '../../design-system/styles/workspace-interaction.css',
      '../../design-system/styles/shell-surfaces.css',
      '../../design-system/styles/shared-controls.css',
      '../../design-system/styles/content-color-policy.css',
      '../../design-system/styles/module-shells.css',
    ].map(read).join('\n');
    expect(globalCss).toContain('--as-primary-action-surface');
    expect(globalCss).toContain('--as-primary-action-hover');
    expect(globalCss).toContain('--as-primary-action-active');
    expect(globalCss).toContain('--as-primary-action-border');
    expect(globalCss).toContain('--as-primary-action-text');
    expect(globalCss).toContain('[data-vgt-publish-root="true"]');
    expect(globalCss).toContain('[data-vgt-automate-root="true"]');
    expect(globalCss).toContain('[data-vgt-vault-root="true"]');
    expect(globalCss).toContain('[role="dialog"]');
    expect(globalCss).toContain(':not([data-color]):not([data-swatch])');
  });

  it('keeps Connect and Vault primary text readable against the material surface', () => {
    const connectCss = read('../../apps/connect/components/connectTheme.css');
    const vaultCss = read('../../design-system/themes/vaultChrome.css');
    const explorerCss = read('../../shell/explorer/components/WorkspaceExplorer.css');
    const galleryCss = read('../../shell/settings/WorkspaceSettingsThemes.css');

    expect(connectCss).toContain('var(--vgt-control-primary-text');
    expect(vaultCss).toContain('var(--vgt-control-primary-text');
    expect(explorerCss).toContain('var(--as-primary-action-text');
    expect(galleryCss).toContain('var(--as-primary-action-surface');
  });
});
