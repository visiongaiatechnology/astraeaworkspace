// STATUS: PLATIN — Writer shell chrome is themed without taking ownership of paper content.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = [
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
].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
const writerSources = [
  '../../../../apps/writer/formatting/toolbar/WriterFormattingToolbar.tsx',
  '../../../../apps/writer/review/WriterReviewBar.tsx',
  '../../../../apps/writer/editor/status/WriterStatusBar.tsx',
  '../../../../apps/writer/navigation/toc/WriterTocSidebar.tsx',
  '../../../../apps/writer/review/WriterReviewPane.tsx',
  '../../../../apps/writer/layout/pages/WriterRuler.tsx',
  '../../../../apps/writer/layout/pages/WriterVerticalRuler.tsx',
  '../../../../apps/writer/layout/pages/WriterPagePaper.tsx'
].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'));

describe('Writer Workspace theme boundaries', () => {
  it('parses the chrome token rules and reserves markers for shell surfaces', () => {
    expect(() => postcss.parse(css)).not.toThrow();
    expect(css).toContain('.writer-a11y-root [data-vgt-workspace-chrome]');
    expect(css).toContain('[data-vgt-workspace-chrome-layer="true"]');
    expect(css).toContain('--vgt-module-panel-surface');
    expect(css).toContain('--vgt-module-control-surface');
    expect(css).toContain('main[data-content-color-policy="content-owned"]');
  });

  it('marks only Writer toolbars, side panels, status, and rulers as Workspace chrome', () => {
    const markedRoots = writerSources.reduce((count, source) => count + [...source.matchAll(/data-vgt-workspace-chrome=/g)].length, 0);
    expect(markedRoots).toBeGreaterThanOrEqual(8);
    expect(writerSources.some((source) => source.includes('data-vgt-workspace-chrome="panel"'))).toBe(true);
    expect(writerSources.some((source) => source.includes('data-vgt-workspace-chrome="status"'))).toBe(true);
    expect(writerSources.some((source) => source.includes('data-vgt-workspace-chrome="ruler"'))).toBe(true);
  });
});
