import { describe, expect, it } from 'vitest';
import { APPEARANCE_STORAGE_KEY, DEFAULT_SHELL_APPEARANCE, loadShellAppearance, normalizeShellAppearance, saveShellAppearance, shellScaleBand, type ShellStorageLike } from '../../../shell/platform/workspaceShellPlatform';
import {
  applyWorkspaceTheme,
  resolveWorkspaceThemeId,
  resolveWorkspaceThemeTokens,
  WORKSPACE_ACCENTS,
  WORKSPACE_SURFACE_INTENSITIES,
  WORKSPACE_THEME_OPTIONS,
  WORKSPACE_THEME_PRESETS,
} from '../../../design-system/themes/workspaceTheme';

type ThemeTokenRoot = { dataset: Record<string, string | undefined>; style: { setProperty: (name: string, value: string) => void } };

function readThemeTokens(
  themeId: Parameters<typeof applyWorkspaceTheme>[1],
  accentId: Parameters<typeof applyWorkspaceTheme>[2] = 'preset',
  intensity: Parameters<typeof applyWorkspaceTheme>[3] = 'obsidian',
  prefersDark = true,
  highContrast = false,
): { variables: Map<string, string>; root: ThemeTokenRoot } {
  const variables = new Map<string, string>();
  const root: ThemeTokenRoot = { dataset: {}, style: { setProperty: (name, value) => variables.set(name, value) } };
  applyWorkspaceTheme(root, themeId, accentId, intensity, prefersDark, highContrast);
  return { variables, root };
}

function hexChannels(hex: string): [number, number, number] {
  const matches = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!matches) throw new Error(`Expected a normalized hex color, received ${hex}.`);
  return [Number.parseInt(matches[1], 16), Number.parseInt(matches[2], 16), Number.parseInt(matches[3], 16)];
}

function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexChannels(hex).map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function makeStorage(seed: Record<string, string> = {}): { storage: ShellStorageLike; values: Map<string, string> } {
  const values = new Map(Object.entries(seed));
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    },
  };
}

describe('global Workspace theme system', () => {
  it('offers six full material presets and a separate system resolver option', () => {
    expect(WORKSPACE_THEME_PRESETS.map(({ id }) => id)).toEqual([
      'cosmic-obsidian', 'sovereign-gold', 'tactical-emerald', 'abyssal-sapphire', 'crimson-command', 'arctic-daylight',
    ]);
    expect(WORKSPACE_THEME_OPTIONS.map(({ id }) => id)).toEqual([
      'system', 'cosmic-obsidian', 'sovereign-gold', 'tactical-emerald', 'abyssal-sapphire', 'crimson-command', 'arctic-daylight',
    ]);
    expect(WORKSPACE_ACCENTS).toHaveLength(9);
    expect(WORKSPACE_SURFACE_INTENSITIES).toHaveLength(3);
    const recipes = WORKSPACE_THEME_PRESETS.map(({ tokens }) => [
      tokens.background.environment, tokens.background.control, tokens.specular.edge, tokens.glass.blur, tokens.scrollbar.thumb,
    ].join('|'));
    expect(new Set(recipes).size).toBe(6);
  });

  it('resolves system appearance to Cosmic Obsidian or Arctic Daylight without replacing the selected mode', () => {
    expect(resolveWorkspaceThemeId('system', true)).toBe('cosmic-obsidian');
    expect(resolveWorkspaceThemeId('system', false)).toBe('arctic-daylight');
    expect(resolveWorkspaceThemeId('crimson-command', false)).toBe('crimson-command');

    const dark = readThemeTokens('system', 'preset', 'obsidian', true);
    const light = readThemeTokens('system', 'preset', 'obsidian', false);
    expect(dark.root.dataset).toMatchObject({ astraeaTheme: 'cosmic-obsidian', astraeaScheme: 'dark' });
    expect(light.root.dataset).toMatchObject({ astraeaTheme: 'arctic-daylight', astraeaScheme: 'light' });
  });

  it('persists the versioned appearance contract and migrates the legacy shell record', () => {
    const storageState = makeStorage();
    const saved = saveShellAppearance(storageState.storage, {
      ...DEFAULT_SHELL_APPEARANCE,
      themeId: 'sovereign-gold',
      accentId: 'violet',
      surfaceIntensity: 'soft-slate',
      scalePercent: 125,
    });
    const serialized = JSON.parse(storageState.values.get(APPEARANCE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    expect(saved).toMatchObject({ themeId: 'sovereign-gold', mode: 'dark', accentId: 'violet', surfaceIntensity: 'soft-slate' });
    expect(serialized).toMatchObject({ schemaVersion: 2, themeId: 'sovereign-gold', accentId: 'violet', scale: 125 });
    expect(serialized).not.toHaveProperty('scalePercent');

    const legacyState = makeStorage({
      'astraea.shell.appearance.v1': JSON.stringify({ themeId: 'abyssal-sapphire', accentId: 'cyan', surfaceIntensity: 'oled', scalePercent: 175, direction: 'rtl' }),
    });
    expect(loadShellAppearance(legacyState.storage)).toMatchObject({ themeId: 'abyssal-sapphire', accentId: 'cyan', surfaceIntensity: 'oled', scalePercent: 175, direction: 'rtl' });
    expect(JSON.parse(legacyState.values.get(APPEARANCE_STORAGE_KEY) ?? '{}')).toMatchObject({ schemaVersion: 2, themeId: 'abyssal-sapphire', scale: 175 });
    expect(legacyState.values.has('astraea.shell.appearance.v1')).toBe(false);
  });

  it('rejects unknown stored identifiers and bounds scale values', () => {
    expect(normalizeShellAppearance({ mode: 'system', themeId: '../invalid' as never, accentId: 'url-value' as never, surfaceIntensity: 'unknown' as never, scalePercent: 999 })).toMatchObject({
      themeId: 'system', mode: 'system', accentId: 'preset', surfaceIntensity: 'obsidian', scalePercent: 400,
    });
  });

  it('selects responsive scale bands without changing the configured scale value', () => {
    expect([100, 101, 125, 150, 174, 175, 200, 400].map(shellScaleBand)).toEqual([
      'standard', 'increased', 'increased', 'increased', 'increased', 'maximum', 'maximum', 'maximum',
    ]);
    expect(shellScaleBand(Number.NaN)).toBe('standard');
  });

  it('publishes the complete material and interaction token contract for every preset', () => {
    const requiredVariables = [
      '--as-bg-environment', '--as-bg-workbench', '--as-bg-sidebar', '--as-bg-toolbar', '--as-bg-control', '--as-bg-control-hover', '--as-bg-control-active', '--as-bg-floating', '--as-bg-modal',
      '--as-text-primary', '--as-text-secondary', '--as-text-muted', '--as-text-disabled', '--as-border-subtle', '--as-border-control', '--as-border-focus', '--as-border-strong',
      '--as-accent', '--as-accent-soft', '--as-accent-strong', '--as-accent-contrast', '--as-specular', '--as-specular-soft', '--as-selection', '--as-selection-border', '--as-selection-contrast', '--as-focus', '--as-focus-ring',
      '--as-primary-action-surface', '--as-primary-action-hover', '--as-primary-action-active', '--as-primary-action-border', '--as-primary-action-text',
      '--as-success', '--as-warning', '--as-critical', '--as-info', '--as-shadow-z1', '--as-shadow-z2', '--as-shadow-z3', '--as-shadow-z4', '--as-glass-bg', '--as-glass-border', '--as-glass-blur',
      '--as-divider', '--as-scroll-track', '--as-scroll-thumb', '--as-scroll-thumb-hover', '--as-scroll-edge', '--as-radius-control', '--as-radius-panel', '--as-radius-floating', '--as-radius-modal',
      '--as-motion-fast', '--as-motion-medium', '--as-motion-slow',
    ];
    for (const theme of WORKSPACE_THEME_PRESETS) {
      const { variables, root } = readThemeTokens(theme.id);
      expect(root.dataset.astraeaTheme).toBe(theme.id);
      expect(requiredVariables.filter((name) => !variables.has(name)), `${theme.id} missing contract tokens`).toEqual([]);
      expect(variables.get('--as-glass-blur')).toBe(theme.tokens.glass.blur);
      expect(variables.get('--as-specular')).toBe(theme.tokens.specular.edge);
      expect(variables.get('--as-primary-action-surface')).toBe(theme.tokens.primaryAction.surface);
      expect(variables.get('--vgt-control-primary-text')).toBe(theme.tokens.primaryAction.text);
      expect(variables.get('--as-success')).toBe(theme.tokens.state.success);
      expect(variables.get('--vgt-selection-text')).toBe(theme.tokens.selection.contrast);
    }
  });

  it('keeps custom accents limited to selection and keyboard focus', () => {
    const goldPreset = resolveWorkspaceThemeTokens('sovereign-gold', 'preset', 'obsidian', true);
    const goldViolet = resolveWorkspaceThemeTokens('sovereign-gold', 'violet', 'obsidian', true);
    expect(goldViolet.background).toEqual(goldPreset.background);
    expect(goldViolet.accent).toEqual(goldPreset.accent);
    expect(goldViolet.specular).toEqual(goldPreset.specular);
    expect(goldViolet.primaryAction).toEqual(goldPreset.primaryAction);
    expect(goldViolet.state).toEqual(goldPreset.state);
    expect(goldViolet.scrollbar).toEqual(goldPreset.scrollbar);
    expect(goldViolet.focus.color).toBe('#8b5cf6');
    expect(goldViolet.selection.surface).not.toBe(goldPreset.selection.surface);
    expect(goldViolet.selection.border).not.toBe(goldPreset.selection.border);
    expect(contrastRatio('#8b5cf6', goldViolet.selection.contrast)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps primary actions material-led and text-readable across every preset', () => {
    for (const theme of WORKSPACE_THEME_PRESETS) {
      const tokens = resolveWorkspaceThemeTokens(theme.id, 'preset', 'obsidian', theme.colorScheme === 'dark');
      expect(contrastRatio(tokens.primaryAction.surface, tokens.primaryAction.text), `${theme.id} primary action text`).toBeGreaterThanOrEqual(4.5);
      expect(tokens.primaryAction.surface).not.toBe(tokens.accent.base);
      expect(tokens.primaryAction.border).not.toBe(tokens.border.control);
    }

    const gold = resolveWorkspaceThemeTokens('sovereign-gold', 'preset', 'obsidian', true);
    const emerald = resolveWorkspaceThemeTokens('tactical-emerald', 'preset', 'obsidian', true);
    expect(gold.primaryAction.surface).not.toBe(gold.accent.base);
    expect(emerald.primaryAction.surface).not.toBe(emerald.state.success);
    expect(emerald.primaryAction.text).toBe(emerald.text.primary);
  });

  it('changes dark surface intensity while leaving Arctic Daylight unchanged', () => {
    const oled = resolveWorkspaceThemeTokens('cosmic-obsidian', 'preset', 'oled', true);
    const balanced = resolveWorkspaceThemeTokens('cosmic-obsidian', 'preset', 'obsidian', true);
    const slate = resolveWorkspaceThemeTokens('cosmic-obsidian', 'preset', 'soft-slate', true);
    expect(oled.background.environment).not.toBe(balanced.background.environment);
    expect(slate.background.workbench).not.toBe(balanced.background.workbench);

    const arcticOled = resolveWorkspaceThemeTokens('arctic-daylight', 'preset', 'oled', true);
    const arcticSlate = resolveWorkspaceThemeTokens('arctic-daylight', 'preset', 'soft-slate', true);
    expect(arcticOled.background).toEqual(arcticSlate.background);
  });

  it('applies high contrast as a real token override and keeps semantic statuses stable', () => {
    const normal = resolveWorkspaceThemeTokens('abyssal-sapphire', 'violet', 'obsidian', true);
    const highContrast = resolveWorkspaceThemeTokens('abyssal-sapphire', 'violet', 'obsidian', true, true);
    expect(highContrast.text.primary).toBe('#ffffff');
    expect(highContrast.primaryAction.text).toBe('#ffffff');
    expect(highContrast.text.muted).toBe('#d3dbe8');
    expect(highContrast.border.strong).not.toBe(normal.border.strong);
    expect(highContrast.focus.color).toBe('#ffffff');
    expect(highContrast.selection.contrast).toBe(normal.selection.contrast);
    expect(highContrast.glass.blur).toBe('0px');
    expect(highContrast.shadow).toEqual({ z1: 'none', z2: 'none', z3: 'none', z4: 'none' });
    expect(highContrast.state).toEqual(normal.state);
    expect(highContrast.accent).toEqual(normal.accent);
  });

  it('meets readable foreground contrast for every curated and custom accent', () => {
    for (const theme of WORKSPACE_THEME_PRESETS) {
      for (const accent of WORKSPACE_ACCENTS) {
        const tokens = resolveWorkspaceThemeTokens(theme.id, accent.id, 'obsidian', theme.colorScheme === 'dark');
        expect(contrastRatio(tokens.accent.base, tokens.accent.contrast), `${theme.id}/${accent.id} accent foreground`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.primaryAction.surface, tokens.primaryAction.text), `${theme.id}/${accent.id} primary action foreground`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.focus.color, tokens.background.workbench), `${theme.id}/${accent.id} focus on workbench`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
