import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyWorkspaceTheme, WORKSPACE_THEME_PRESETS } from '../../../../design-system/themes/workspaceTheme';

const pdfStudioThemeCss = readFileSync(new URL('../../studio/theme/pdfStudioTheme.css', import.meta.url), 'utf8');

describe('PDF Studio chrome theme contract', () => {
  it('uses workspace tokens for PDF chrome and preserves document-page surfaces', () => {
    expect(pdfStudioThemeCss).toContain('[data-pdf-brand-label="true"]');
    expect(pdfStudioThemeCss).toContain('[data-pdf-tool-band="true"]');
    expect(pdfStudioThemeCss).toContain('[data-pdf-studio-sidebar="pages"]');
    expect(pdfStudioThemeCss).toContain('[data-pdf-studio-sidebar="review"]');
    expect(pdfStudioThemeCss).toContain('var(--vgt-control-surface)');
    expect(pdfStudioThemeCss).toContain('var(--vgt-control-text)');
    expect(pdfStudioThemeCss).toContain('var(--vgt-control-muted)');
    expect(pdfStudioThemeCss).toContain('[data-pdf-tool="select"][aria-pressed="true"]');
    expect(pdfStudioThemeCss).toContain('[data-pdf-page-selected="true"]');
    expect(pdfStudioThemeCss).toContain('var(--vgt-accent-solid)');
    expect(pdfStudioThemeCss).toContain('var(--vgt-accent-soft)');
    expect(pdfStudioThemeCss).toContain('var(--vgt-on-accent)');
    expect(pdfStudioThemeCss).not.toContain('data-pdf-screen-layout');
    expect(pdfStudioThemeCss).not.toContain('data-pdf-rendered-page');
    expect(pdfStudioThemeCss).not.toContain('data-pdf-positioned-layout');
  });

  it('routes Sovereign Gold page and tool selection through the workspace accent tokens', () => {
    const tokens = new Map();
    const root = { dataset: {}, style: { setProperty: (name, value) => tokens.set(name, value) } };

    applyWorkspaceTheme(root, 'sovereign-gold', 'preset', 'obsidian', false);

    const goldPreset = WORKSPACE_THEME_PRESETS.find((theme) => theme.id === 'sovereign-gold');
    expect(goldPreset).toBeDefined();
    expect(tokens.get('--vgt-accent-solid')).toBe(goldPreset?.tokens.accent.base);
    expect(tokens.get('--vgt-accent-soft')).toContain('rgba(');
    expect(tokens.get('--vgt-on-accent')).toBeTruthy();
    expect(pdfStudioThemeCss).toContain('[data-pdf-tool="select"][aria-pressed="true"]');
    expect(pdfStudioThemeCss).toContain('[data-pdf-page-selected="true"]');
    expect(pdfStudioThemeCss).toContain('var(--vgt-accent-solid)');
    expect(pdfStudioThemeCss).toContain('var(--vgt-accent-soft)');
    expect(pdfStudioThemeCss).toContain('var(--vgt-on-accent)');
  });
});
