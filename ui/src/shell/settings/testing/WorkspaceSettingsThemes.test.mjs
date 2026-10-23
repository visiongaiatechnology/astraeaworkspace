// STATUS: PLATIN — responsive contract for the Workspace theme gallery.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../WorkspaceSettingsThemes.css', import.meta.url), 'utf8');
const rules = [];
postcss.parse(css).walkRules((rule) => rules.push(rule));

describe('Workspace settings theme gallery responsive contract', () => {
  it('uses auto-fit columns for theme, accent, and intensity controls', () => {
    const selectors = [
      '.workspace-theme-grid',
      '.workspace-theme-controls',
      '.workspace-intensity-grid',
    ];

    for (const selector of selectors) {
      const grid = rules.find((rule) => rule.selector === selector);

      expect(grid, `${selector} should remain responsive`).toBeDefined();
      expect(grid.nodes.map((node) => node.toString()).join(' ')).toContain(
        'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))',
      );
    }
  });

  it('allows preset labels and descriptions to wrap at maximum Workspace scale', () => {
    const name = rules.find((rule) => rule.selector === ':root[data-astraea-scale-band="maximum"] .workspace-settings-dialog .workspace-theme-card__name');
    const description = rules.find((rule) => rule.selector === ':root[data-astraea-scale-band="maximum"] .workspace-settings-dialog .workspace-theme-card__description');

    expect(name).toBeDefined();
    expect(name.nodes.map((node) => node.toString()).join(' ')).toContain('white-space: normal');
    expect(description).toBeDefined();
    expect(description.nodes.map((node) => node.toString()).join(' ')).toContain('-webkit-line-clamp: unset');
  });
});
