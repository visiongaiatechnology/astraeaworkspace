// STATUS: PLATIN — typed, local-only theme registry with bounded material and accessibility tokens.

export type WorkspaceThemeId = 'system' | 'cosmic-obsidian' | 'sovereign-gold' | 'tactical-emerald' | 'abyssal-sapphire' | 'crimson-command' | 'arctic-daylight';
export type WorkspacePresetThemeId = Exclude<WorkspaceThemeId, 'system'>;
export type WorkspaceAccentId = 'preset' | 'violet' | 'sapphire' | 'cyan' | 'emerald' | 'gold' | 'rose' | 'fuchsia' | 'silver';
export type WorkspaceSurfaceIntensity = 'oled' | 'obsidian' | 'soft-slate';
export type WorkspaceColorScheme = 'dark' | 'light' | 'system';

export interface WorkspaceThemeBackgrounds {
  environment: string;
  workbench: string;
  sidebar: string;
  toolbar: string;
  control: string;
  controlHover: string;
  controlActive: string;
  floating: string;
  modal: string;
}

export interface WorkspaceThemeTokens {
  background: WorkspaceThemeBackgrounds;
  text: { primary: string; secondary: string; muted: string; disabled: string };
  border: { subtle: string; control: string; focus: string; strong: string };
  accent: { base: string; soft: string; strong: string; contrast: string };
  primaryAction: { surface: string; hover: string; active: string; border: string; text: string };
  specular: { edge: string; soft: string };
  selection: { surface: string; border: string; contrast: string };
  focus: { color: string; ring: string };
  state: { success: string; warning: string; critical: string; info: string };
  shadow: { z1: string; z2: string; z3: string; z4: string };
  glass: { background: string; border: string; blur: string };
  divider: string;
  scrollbar: { track: string; thumb: string; thumbHover: string; edge: string };
  radius: { control: string; panel: string; floating: string; modal: string };
  motion: { fast: string; medium: string; slow: string };
}

export interface WorkspaceThemePreset {
  id: WorkspacePresetThemeId;
  name: { de: string; en: string };
  description: { de: string; en: string };
  colorScheme: Exclude<WorkspaceColorScheme, 'system'>;
  supportsDarkSurfaceIntensity: boolean;
  tokens: WorkspaceThemeTokens;
  material: { controlHoverMix: number; controlActiveMix: number; primaryActionMix: number; selectionOpacity: number };
}

export interface WorkspaceThemeOption {
  id: WorkspaceThemeId;
  name: { de: string; en: string };
  description: { de: string; en: string };
}

export interface WorkspaceThemeStyleRoot {
  dataset: Record<string, string | undefined>;
  style: { setProperty: (name: string, value: string) => void };
}

interface ThemeRecipe {
  id: WorkspacePresetThemeId;
  name: { de: string; en: string };
  description: { de: string; en: string };
  colorScheme: 'dark' | 'light';
  surfaces: readonly [string, string, string, string, string, string, string];
  text: readonly [string, string, string, string];
  accent: string;
  focus: string;
  specular: string;
  specularOpacity: number;
  specularSoftOpacity: number;
  accentSurfaceOpacity: number;
  accentGlowOpacity: number;
  primaryActionMix: number;
  selectionOpacity: number;
  controlHoverMix: number;
  controlActiveMix: number;
  borderBase: string;
  borderOpacity: readonly [number, number, number];
  glassOpacity: number;
  glassBorderOpacity: number;
  glassBlur: string;
  shadowTint: string;
  shadowOpacity: readonly [number, number, number, number];
  scrollTrack: string;
  scrollThumb: string;
  scrollThumbHover: string;
  scrollEdge: string;
  radius: readonly [string, string, string, string];
}

const DARK_STATES = { success: '#4bc98b', warning: '#f0ba58', critical: '#ff625f', info: '#68baf2' } as const;
const LIGHT_STATES = { success: '#176b45', warning: '#805400', critical: '#b42318', info: '#1d5e91' } as const;

const THEME_RECIPES: readonly ThemeRecipe[] = [
  {
    id: 'cosmic-obsidian',
    name: { de: 'Cosmic Obsidian', en: 'Cosmic Obsidian' },
    description: { de: 'Polierter Obsidian mit kalten Reflexionen aus Violet und Indigo.', en: 'Polished obsidian with cool violet and indigo reflections.' },
    colorScheme: 'dark',
    surfaces: ['#07080d', '#0b0d14', '#0d1018', '#10131d', '#131724', '#151927', '#090b12'],
    text: ['#f5f7ff', '#bdc5d8', '#929bad', '#778197'],
    accent: '#8b63ff', focus: '#9a78ff', specular: '#977eff', specularOpacity: 0.45, specularSoftOpacity: 0.11,
    accentSurfaceOpacity: 0.12, accentGlowOpacity: 0.14, primaryActionMix: 0.16, selectionOpacity: 0.18, controlHoverMix: 0.035, controlActiveMix: 0.06,
    borderBase: '#a9b2c8', borderOpacity: [0.12, 0.2, 0.34], glassOpacity: 0.965, glassBorderOpacity: 0.22, glassBlur: '10px',
    shadowTint: '#02040a', shadowOpacity: [0.16, 0.22, 0.34, 0.46], scrollTrack: '#080a11', scrollThumb: '#2b3040', scrollThumbHover: '#454c60', scrollEdge: '#755bd6',
    radius: ['5px', '9px', '10px', '14px'],
  },
  {
    id: 'sovereign-gold',
    name: { de: 'Sovereign Gold', en: 'Sovereign Gold' },
    description: { de: 'Dunkles Präzisionsgraphit mit Champagne-Metallkante.', en: 'Dark precision graphite with a fine champagne-metal edge.' },
    colorScheme: 'dark',
    surfaces: ['#090a0c', '#0e1012', '#111315', '#151719', '#181b1e', '#1d2023', '#111315'],
    text: ['#f7f3eb', '#cec6b8', '#a59e92', '#8f887c'],
    accent: '#d9be84', focus: '#e2c98d', specular: '#f4dca8', specularOpacity: 0.5, specularSoftOpacity: 0.13,
    accentSurfaceOpacity: 0.07, accentGlowOpacity: 0.09, primaryActionMix: 0.09, selectionOpacity: 0.16, controlHoverMix: 0.025, controlActiveMix: 0.045,
    borderBase: '#b9b7af', borderOpacity: [0.1, 0.17, 0.3], glassOpacity: 0.972, glassBorderOpacity: 0.24, glassBlur: '8px',
    shadowTint: '#020202', shadowOpacity: [0.17, 0.24, 0.36, 0.48], scrollTrack: '#0d0e10', scrollThumb: '#363638', scrollThumbHover: '#4d4b46', scrollEdge: '#d9be84',
    radius: ['4px', '7px', '8px', '11px'],
  },
  {
    id: 'tactical-emerald',
    name: { de: 'Tactical Emerald', en: 'Tactical Emerald' },
    description: { de: 'Mattes Instrumentenschiefer mit kontrolliertem Smaragdfokus.', en: 'Matte instrument slate with controlled emerald focus.' },
    colorScheme: 'dark',
    surfaces: ['#07100c', '#0a1510', '#0c1913', '#102018', '#13271e', '#173025', '#0b1711'],
    text: ['#f1f8f4', '#b8c9bf', '#91a49a', '#7d9286'],
    accent: '#39c985', focus: '#55d89a', specular: '#7de5b4', specularOpacity: 0.38, specularSoftOpacity: 0.075,
    accentSurfaceOpacity: 0.09, accentGlowOpacity: 0.08, primaryActionMix: 0.07, selectionOpacity: 0.16, controlHoverMix: 0.03, controlActiveMix: 0.05,
    borderBase: '#9bb8a7', borderOpacity: [0.11, 0.19, 0.34], glassOpacity: 0.975, glassBorderOpacity: 0.18, glassBlur: '4px',
    shadowTint: '#020905', shadowOpacity: [0.18, 0.24, 0.34, 0.45], scrollTrack: '#08110d', scrollThumb: '#2c3b33', scrollThumbHover: '#405449', scrollEdge: '#4da77b',
    radius: ['4px', '7px', '8px', '11px'],
  },
  {
    id: 'abyssal-sapphire',
    name: { de: 'Abyssal Sapphire', en: 'Abyssal Sapphire' },
    description: { de: 'Tiefes Saphirglas mit präziser Eis-Cyan-Kante.', en: 'Deep sapphire glass with a precise ice-cyan edge.' },
    colorScheme: 'dark',
    surfaces: ['#06101a', '#081522', '#0a1928', '#0d2033', '#102942', '#14344f', '#091a2a'],
    text: ['#f2f8ff', '#b6cadd', '#8fa8bd', '#7892a9'],
    accent: '#53c9f2', focus: '#55bded', specular: '#8edbf7', specularOpacity: 0.36, specularSoftOpacity: 0.09,
    accentSurfaceOpacity: 0.1, accentGlowOpacity: 0.09, primaryActionMix: 0.1, selectionOpacity: 0.17, controlHoverMix: 0.03, controlActiveMix: 0.055,
    borderBase: '#91b8d2', borderOpacity: [0.12, 0.21, 0.36], glassOpacity: 0.968, glassBorderOpacity: 0.2, glassBlur: '9px',
    shadowTint: '#020915', shadowOpacity: [0.17, 0.23, 0.35, 0.46], scrollTrack: '#07121e', scrollThumb: '#294253', scrollThumbHover: '#3c6078', scrollEdge: '#397da0',
    radius: ['5px', '8px', '10px', '13px'],
  },
  {
    id: 'crimson-command',
    name: { de: 'Crimson Command', en: 'Crimson Command' },
    description: { de: 'Bordeaux-Obsidian mit ruhigem, kontrolliertem Rubinlicht.', en: 'Bordeaux obsidian with calm, controlled ruby light.' },
    colorScheme: 'dark',
    surfaces: ['#10070b', '#160a10', '#1a0d14', '#211019', '#29151f', '#321a26', '#190d14'],
    text: ['#fff4f7', '#d6bbc4', '#b0929d', '#a0848f'],
    accent: '#c84462', focus: '#da607b', specular: '#e2607e', specularOpacity: 0.34, specularSoftOpacity: 0.075,
    accentSurfaceOpacity: 0.07, accentGlowOpacity: 0.08, primaryActionMix: 0.08, selectionOpacity: 0.16, controlHoverMix: 0.025, controlActiveMix: 0.045,
    borderBase: '#c1a3ac', borderOpacity: [0.11, 0.2, 0.34], glassOpacity: 0.97, glassBorderOpacity: 0.19, glassBlur: '7px',
    shadowTint: '#080306', shadowOpacity: [0.18, 0.24, 0.35, 0.46], scrollTrack: '#13090f', scrollThumb: '#45303a', scrollThumbHover: '#60404d', scrollEdge: '#a23c55',
    radius: ['4px', '7px', '9px', '12px'],
  },
  {
    id: 'arctic-daylight',
    name: { de: 'Arctic Daylight', en: 'Arctic Daylight' },
    description: { de: 'Blendarmes Alabaster mit Studioglas und Graphittypografie.', en: 'Low-glare alabaster with studio glass and graphite typography.' },
    colorScheme: 'light',
    surfaces: ['#eff2f5', '#f7f9fb', '#eceff2', '#ffffff', '#f7f8fa', '#ffffff', '#ffffff'],
    text: ['#151a20', '#48515c', '#626c78', '#58636f'],
    accent: '#8c6b2f', focus: '#795a25', specular: '#ffffff', specularOpacity: 0.92, specularSoftOpacity: 0.7,
    accentSurfaceOpacity: 0.08, accentGlowOpacity: 0.05, primaryActionMix: 0.075, selectionOpacity: 0.13, controlHoverMix: 0.025, controlActiveMix: 0.05,
    borderBase: '#25303b', borderOpacity: [0.12, 0.2, 0.34], glassOpacity: 0.97, glassBorderOpacity: 0.3, glassBlur: '8px',
    shadowTint: '#526174', shadowOpacity: [0.06, 0.1, 0.16, 0.2], scrollTrack: '#e8edf2', scrollThumb: '#9ba7b4', scrollThumbHover: '#778595', scrollEdge: '#8c6b2f',
    radius: ['5px', '8px', '10px', '13px'],
  },
];

const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value));

function parseHex(hex: string): readonly [number, number, number] | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) return null;
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}

function mixHex(color: string, target: string, amount: number): string {
  const source = parseHex(color);
  const destination = parseHex(target);
  if (!source || !destination) return color;
  const weight = clamp(amount);
  return `#${source.map((channel, index) => Math.round(channel * (1 - weight) + destination[index] * weight).toString(16).padStart(2, '0')).join('')}`;
}

function rgba(hex: string, opacity: number): string {
  const channels = parseHex(hex);
  if (!channels) return 'rgba(124, 58, 237, 0.16)';
  const [red, green, blue] = channels;
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacity)})`;
}

function relativeLuminance(hex: string): number {
  const channels = parseHex(hex);
  if (!channels) return 0;
  const [red, green, blue] = channels.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableAccentForeground(accent: string): string {
  const light = '#ffffff';
  const dark = '#05070b';
  return contrastRatio(accent, dark) >= contrastRatio(accent, light) ? dark : light;
}

function createThemeTokens(recipe: ThemeRecipe): WorkspaceThemeTokens {
  const [environment, workbench, sidebar, toolbar, control, floating, modal] = recipe.surfaces;
  const [primary, secondary, muted, disabled] = recipe.text;
  const states = recipe.colorScheme === 'dark' ? DARK_STATES : LIGHT_STATES;
  const specularEdge = rgba(recipe.specular, recipe.specularOpacity);
  const shadow = (index: number, distance: number, blur: number) => `0 ${distance}px ${blur}px ${rgba(recipe.shadowTint, recipe.shadowOpacity[index])}`;
  const highlight = `inset 0 1px 0 ${rgba(recipe.specular, recipe.specularSoftOpacity)}`;

  return {
    background: {
      environment, workbench, sidebar, toolbar, control,
      controlHover: mixHex(control, recipe.accent, recipe.controlHoverMix),
      controlActive: mixHex(control, recipe.accent, recipe.controlActiveMix),
      floating, modal,
    },
    text: { primary, secondary, muted, disabled },
    border: {
      subtle: rgba(recipe.borderBase, recipe.borderOpacity[0]),
      control: rgba(recipe.borderBase, recipe.borderOpacity[1]),
      focus: recipe.focus,
      strong: rgba(recipe.borderBase, recipe.borderOpacity[2]),
    },
    accent: {
      base: recipe.accent,
      soft: rgba(recipe.accent, recipe.accentSurfaceOpacity),
      strong: mixHex(recipe.accent, recipe.colorScheme === 'dark' ? '#ffffff' : '#101820', recipe.colorScheme === 'dark' ? 0.16 : 0.08),
      contrast: readableAccentForeground(recipe.accent),
    },
    primaryAction: {
      surface: mixHex(control, recipe.accent, recipe.primaryActionMix),
      hover: mixHex(control, recipe.accent, recipe.primaryActionMix + recipe.controlHoverMix),
      active: mixHex(control, recipe.accent, recipe.primaryActionMix + recipe.controlActiveMix),
      border: mixHex(recipe.accent, recipe.specular, 0.4),
      text: primary,
    },
    specular: { edge: specularEdge, soft: rgba(recipe.specular, recipe.specularSoftOpacity) },
    selection: {
      surface: rgba(recipe.accent, recipe.selectionOpacity),
      border: rgba(recipe.accent, 0.9),
      contrast: readableAccentForeground(recipe.accent),
    },
    focus: { color: recipe.focus, ring: `0 0 0 3px ${rgba(recipe.focus, 0.38)}` },
    state: states,
    shadow: {
      z1: `${highlight}, ${shadow(0, 1, 2)}`,
      z2: `${highlight}, ${shadow(1, 3, 9)}`,
      z3: `${highlight}, ${shadow(2, 16, 38)}`,
      z4: `${highlight}, ${shadow(3, 26, 72)}`,
    },
    glass: {
      background: rgba(floating, recipe.glassOpacity),
      border: rgba(recipe.specular, recipe.glassBorderOpacity),
      blur: recipe.glassBlur,
    },
    divider: rgba(recipe.borderBase, recipe.borderOpacity[0]),
    scrollbar: {
      track: recipe.scrollTrack,
      thumb: recipe.scrollThumb,
      thumbHover: recipe.scrollThumbHover,
      edge: rgba(recipe.scrollEdge, recipe.colorScheme === 'dark' ? 0.58 : 0.72),
    },
    radius: { control: recipe.radius[0], panel: recipe.radius[1], floating: recipe.radius[2], modal: recipe.radius[3] },
    motion: { fast: '120ms', medium: '200ms', slow: '320ms' },
  };
}

export const WORKSPACE_THEME_PRESETS: readonly WorkspaceThemePreset[] = THEME_RECIPES.map((recipe) => ({
  id: recipe.id,
  name: recipe.name,
  description: recipe.description,
  colorScheme: recipe.colorScheme,
  supportsDarkSurfaceIntensity: recipe.colorScheme === 'dark',
  material: { controlHoverMix: recipe.controlHoverMix, controlActiveMix: recipe.controlActiveMix, primaryActionMix: recipe.primaryActionMix, selectionOpacity: recipe.selectionOpacity },
  tokens: createThemeTokens(recipe),
}));

export const WORKSPACE_THEME_OPTIONS: readonly WorkspaceThemeOption[] = [
  {
    id: 'system',
    name: { de: 'Systemadaptiv', en: 'System adaptive' },
    description: { de: 'Dunkles System: Cosmic Obsidian · Helles System: Arctic Daylight.', en: 'Dark system: Cosmic Obsidian · Light system: Arctic Daylight.' },
  },
  ...WORKSPACE_THEME_PRESETS.map(({ id, name, description }) => ({ id, name, description })),
];

export const WORKSPACE_ACCENTS: readonly { id: WorkspaceAccentId; name: { de: string; en: string }; color: string }[] = [
  { id: 'preset', name: { de: 'Theme-Farbe', en: 'Theme color' }, color: 'preset' },
  { id: 'violet', name: { de: 'Violett', en: 'Violet' }, color: '#8b5cf6' },
  { id: 'sapphire', name: { de: 'Saphir', en: 'Sapphire' }, color: '#3478d4' },
  { id: 'cyan', name: { de: 'Cyan', en: 'Cyan' }, color: '#1684a0' },
  { id: 'emerald', name: { de: 'Smaragd', en: 'Emerald' }, color: '#1b9364' },
  { id: 'gold', name: { de: 'Gold', en: 'Gold' }, color: '#a66e0c' },
  { id: 'rose', name: { de: 'Rubin', en: 'Ruby' }, color: '#c7435d' },
  { id: 'fuchsia', name: { de: 'Fuchsia', en: 'Fuchsia' }, color: '#b8329e' },
  { id: 'silver', name: { de: 'Silber', en: 'Silver' }, color: '#576a81' },
];

export const WORKSPACE_SURFACE_INTENSITIES: readonly { id: WorkspaceSurfaceIntensity; name: { de: string; en: string }; description: { de: string; en: string } }[] = [
  { id: 'oled', name: { de: 'Pure Black OLED', en: 'Pure Black OLED' }, description: { de: 'Schwarz mit minimalen Flächenabstufungen.', en: 'Black with minimal surface separation.' } },
  { id: 'obsidian', name: { de: 'Obsidian Glass', en: 'Obsidian Glass' }, description: { de: 'Ausgewogene Standardtiefe.', en: 'Balanced default depth.' } },
  { id: 'soft-slate', name: { de: 'Soft Slate', en: 'Soft Slate' }, description: { de: 'Etwas hellere Arbeitsflächen.', en: 'Slightly brighter workspace surfaces.' } },
];

const THEME_BY_ID = new Map<WorkspacePresetThemeId, WorkspaceThemePreset>(WORKSPACE_THEME_PRESETS.map((theme) => [theme.id, theme]));
const THEME_IDS = new Set<string>(WORKSPACE_THEME_OPTIONS.map(({ id }) => id));
const ACCENT_BY_ID = new Map<WorkspaceAccentId, string>(WORKSPACE_ACCENTS.filter((accent) => accent.id !== 'preset').map(({ id, color }) => [id, color]));
const SURFACE_INTENSITIES = new Set<string>(['oled', 'obsidian', 'soft-slate']);

export function isWorkspaceThemeId(value: unknown): value is WorkspaceThemeId {
  return typeof value === 'string' && THEME_IDS.has(value);
}

export function isWorkspaceAccentId(value: unknown): value is WorkspaceAccentId {
  return value === 'preset' || (typeof value === 'string' && ACCENT_BY_ID.has(value as WorkspaceAccentId));
}

export function isWorkspaceSurfaceIntensity(value: unknown): value is WorkspaceSurfaceIntensity {
  return typeof value === 'string' && SURFACE_INTENSITIES.has(value);
}

export function workspaceThemeMode(id: WorkspaceThemeId): WorkspaceColorScheme {
  if (id === 'system') return 'system';
  return THEME_BY_ID.get(id)?.colorScheme ?? 'dark';
}

export function resolveWorkspaceThemeId(id: WorkspaceThemeId, prefersDark: boolean): WorkspacePresetThemeId {
  if (id === 'system') return prefersDark ? 'cosmic-obsidian' : 'arctic-daylight';
  return id;
}

export function getWorkspaceThemePreset(id: WorkspaceThemeId, prefersDark = true): WorkspaceThemePreset {
  const effectiveId = resolveWorkspaceThemeId(id, prefersDark);
  const preset = THEME_BY_ID.get(effectiveId);
  if (!preset) throw new Error(`Workspace theme registry is missing preset ${effectiveId}.`);
  return preset;
}

function adjustedSurface(color: string, index: number, colorScheme: 'dark' | 'light', intensity: WorkspaceSurfaceIntensity): string {
  if (colorScheme === 'light' || intensity === 'obsidian') return color;
  const amount = intensity === 'oled' ? 0.68 : 0.11;
  const target = intensity === 'oled' ? '#000000' : '#ffffff';
  return mixHex(color, target, amount * (1 - index * 0.065));
}

export function resolveWorkspaceThemeTokens(
  themeId: WorkspaceThemeId,
  accentId: WorkspaceAccentId,
  intensity: WorkspaceSurfaceIntensity,
  prefersDark: boolean,
  highContrast = false,
): WorkspaceThemeTokens {
  const theme = getWorkspaceThemePreset(themeId, prefersDark);
  const base = theme.tokens;
  const isDark = theme.colorScheme === 'dark';
  const backgrounds: WorkspaceThemeBackgrounds = {
    environment: adjustedSurface(base.background.environment, 0, theme.colorScheme, intensity),
    workbench: adjustedSurface(base.background.workbench, 1, theme.colorScheme, intensity),
    sidebar: adjustedSurface(base.background.sidebar, 2, theme.colorScheme, intensity),
    toolbar: adjustedSurface(base.background.toolbar, 3, theme.colorScheme, intensity),
    control: adjustedSurface(base.background.control, 4, theme.colorScheme, intensity),
    controlHover: adjustedSurface(base.background.controlHover, 4, theme.colorScheme, intensity),
    controlActive: adjustedSurface(base.background.controlActive, 4, theme.colorScheme, intensity),
    floating: adjustedSurface(base.background.floating, 5, theme.colorScheme, intensity),
    modal: adjustedSurface(base.background.modal, 6, theme.colorScheme, intensity),
  };
  // A custom accent is an accessibility and selection affordance. It must not
  // repaint the curated material, semantic states, or primary action surfaces.
  const selectionColor = accentId === 'preset' ? base.accent.base : ACCENT_BY_ID.get(accentId) ?? base.accent.base;
  const focusColor = accentId === 'preset' ? base.focus.color : selectionColor;
  const normal: WorkspaceThemeTokens = {
    ...base,
    background: backgrounds,
    accent: base.accent,
    primaryAction: {
      ...base.primaryAction,
      surface: adjustedSurface(base.primaryAction.surface, 4, theme.colorScheme, intensity),
      hover: adjustedSurface(base.primaryAction.hover, 4, theme.colorScheme, intensity),
      active: adjustedSurface(base.primaryAction.active, 4, theme.colorScheme, intensity),
    },
    border: { ...base.border, focus: focusColor },
    selection: {
      surface: rgba(selectionColor, theme.material.selectionOpacity),
      border: rgba(selectionColor, 0.9),
      contrast: readableAccentForeground(selectionColor),
    },
    focus: { color: focusColor, ring: `0 0 0 3px ${rgba(focusColor, 0.42)}` },
    glass: { ...base.glass, background: rgba(backgrounds.floating, isDark ? 0.965 : 0.97) },
  };
  if (!highContrast) return normal;

  const highContrastText = isDark
    ? { primary: '#ffffff', secondary: '#f1f4fa', muted: '#d3dbe8', disabled: '#bbc5d3' }
    : { primary: '#101820', secondary: '#202b37', muted: '#354251', disabled: '#536171' };
  const contrastEdge = isDark ? '#edf2fb' : '#17212d';
  const highContrastFocus = isDark ? '#ffffff' : '#101820';
  return {
    ...normal,
    text: highContrastText,
    primaryAction: { ...normal.primaryAction, border: contrastEdge, text: highContrastText.primary },
    border: {
      subtle: rgba(contrastEdge, 0.5),
      control: rgba(contrastEdge, 0.74),
      focus: highContrastFocus,
      strong: rgba(contrastEdge, 0.92),
    },
    selection: { surface: rgba(selectionColor, 0.26), border: rgba(selectionColor, 1), contrast: readableAccentForeground(selectionColor) },
    focus: { color: highContrastFocus, ring: `0 0 0 3px ${rgba(highContrastFocus, 0.78)}` },
    shadow: { z1: 'none', z2: 'none', z3: 'none', z4: 'none' },
    glass: { background: rgba(backgrounds.floating, 0.99), border: rgba(contrastEdge, 0.74), blur: '0px' },
    divider: rgba(contrastEdge, 0.5),
  };
}

function cssVariableEntries(tokens: WorkspaceThemeTokens): readonly (readonly [string, string])[] {
  const { background, text, border, accent, primaryAction, specular, selection, focus, state, shadow, glass, scrollbar, radius, motion } = tokens;
  return [
    ['--as-bg-environment', background.environment], ['--as-bg-workbench', background.workbench],
    ['--as-bg-sidebar', background.sidebar], ['--as-bg-toolbar', background.toolbar],
    ['--as-bg-control', background.control], ['--as-bg-control-hover', background.controlHover],
    ['--as-bg-control-active', background.controlActive], ['--as-bg-floating', background.floating],
    ['--as-bg-modal', background.modal],
    ['--as-text-primary', text.primary], ['--as-text-secondary', text.secondary],
    ['--as-text-muted', text.muted], ['--as-text-disabled', text.disabled],
    ['--as-border-subtle', border.subtle], ['--as-border-control', border.control],
    ['--as-border-focus', border.focus], ['--as-border-strong', border.strong],
    ['--as-accent', accent.base], ['--as-accent-soft', accent.soft], ['--as-accent-strong', accent.strong],
    ['--as-accent-contrast', accent.contrast], ['--as-specular', specular.edge], ['--as-specular-soft', specular.soft],
    ['--as-primary-action-surface', primaryAction.surface], ['--as-primary-action-hover', primaryAction.hover],
    ['--as-primary-action-active', primaryAction.active], ['--as-primary-action-border', primaryAction.border],
    ['--as-primary-action-text', primaryAction.text],
    ['--as-selection', selection.surface], ['--as-selection-border', selection.border], ['--as-selection-contrast', selection.contrast],
    ['--as-focus', focus.color], ['--as-focus-ring', focus.ring],
    ['--as-success', state.success], ['--as-warning', state.warning], ['--as-critical', state.critical], ['--as-info', state.info],
    ['--as-shadow-z1', shadow.z1], ['--as-shadow-z2', shadow.z2], ['--as-shadow-z3', shadow.z3], ['--as-shadow-z4', shadow.z4],
    ['--as-glass-bg', glass.background], ['--as-glass-border', glass.border], ['--as-glass-blur', glass.blur],
    ['--as-divider', tokens.divider], ['--as-scroll-track', scrollbar.track], ['--as-scroll-thumb', scrollbar.thumb],
    ['--as-scroll-thumb-hover', scrollbar.thumbHover], ['--as-scroll-edge', scrollbar.edge],
    ['--as-radius-control', radius.control], ['--as-radius-panel', radius.panel],
    ['--as-radius-floating', radius.floating], ['--as-radius-modal', radius.modal],
    ['--as-motion-fast', motion.fast], ['--as-motion-medium', motion.medium], ['--as-motion-slow', motion.slow],
    // Compatibility bridge for existing Workspace consumers; new components use the --as-* contract.
    ['--vgt-surface-z0', background.environment], ['--vgt-surface-z1', background.workbench],
    ['--vgt-surface-z2', background.control], ['--vgt-surface-z3', background.floating], ['--vgt-surface-z4', background.modal],
    ['--vgt-text-primary', text.primary], ['--vgt-text-secondary', text.secondary], ['--vgt-text-muted', text.muted],
    ['--vgt-accent', accent.base], ['--vgt-accent-solid', accent.base], ['--vgt-accent-soft', accent.soft],
    ['--vgt-accent-strong', accent.strong], ['--vgt-accent-glow', accent.soft], ['--vgt-on-accent', accent.contrast],
    ['--vgt-focus', focus.color], ['--vgt-selection', selection.surface], ['--vgt-selection-border', selection.border], ['--vgt-selection-text', selection.contrast],
    ['--vgt-bg', background.environment], ['--vgt-surface', background.workbench],
    ['--vgt-card', background.control], ['--vgt-neutral-border', border.subtle], ['--vgt-control-border', border.control],
    ['--vgt-control-border-hover', border.strong], ['--vgt-control-surface', background.control],
    ['--vgt-control-hover', background.controlHover], ['--vgt-control-active', background.controlActive],
    ['--vgt-control-text', text.primary], ['--vgt-control-muted', text.secondary], ['--vgt-control-placeholder', text.muted],
    ['--vgt-control-primary-bg', primaryAction.surface], ['--vgt-control-primary-hover', primaryAction.hover],
    ['--vgt-control-primary-active', primaryAction.active], ['--vgt-control-primary-border', primaryAction.border],
    ['--vgt-control-primary-text', primaryAction.text], ['--vgt-on-primary-action', primaryAction.text],
    ['--vgt-control-success', state.success], ['--vgt-control-warning', state.warning],
    ['--vgt-control-danger', state.critical], ['--vgt-control-info', state.info],
    ['--vgt-metal-highlight', specular.soft], ['--vgt-metal-edge', specular.edge],
    ['--vgt-metal-shadow', shadow.z2], ['--glass-bg', glass.background], ['--glass-border', glass.border],
    ['--vgt-glass-blur', glass.blur], ['--vgt-shadow-raised', shadow.z2], ['--vgt-shadow-overlay', shadow.z3],
    ['--vgt-scrollbar-track', scrollbar.track], ['--vgt-scrollbar-thumb', scrollbar.thumb],
    ['--vgt-scrollbar-thumb-hover', scrollbar.thumbHover],
    ['--vgt-radius-control', radius.control], ['--vgt-radius-panel', radius.panel],
    ['--vgt-radius-input', radius.control], ['--vgt-radius-modal', radius.modal],
  ];
}

export function applyWorkspaceTheme(
  root: WorkspaceThemeStyleRoot,
  themeId: WorkspaceThemeId,
  accentId: WorkspaceAccentId,
  intensity: WorkspaceSurfaceIntensity,
  prefersDark: boolean,
  highContrast = false,
): void {
  const theme = getWorkspaceThemePreset(themeId, prefersDark);
  const tokens = resolveWorkspaceThemeTokens(themeId, accentId, intensity, prefersDark, highContrast);
  root.dataset.astraeaTheme = theme.id;
  root.dataset.astraeaScheme = theme.colorScheme;
  root.dataset.vgtTheme = theme.id;
  root.dataset.vgtAccent = accentId;
  root.dataset.vgtSurfaceIntensity = intensity;
  for (const [name, value] of cssVariableEntries(tokens)) root.style.setProperty(name, value);
}
