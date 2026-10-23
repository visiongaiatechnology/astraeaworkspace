import { APPEARANCE_STORAGE_KEY, LEGACY_APPEARANCE_STORAGE_KEY, safeParse, safeStorageGet, safeStorageRemove, safeStorageSet, type ShellStorageLike } from './workspaceShellPlatformStorage';

import { isWorkspaceAccentId, isWorkspaceSurfaceIntensity, isWorkspaceThemeId, workspaceThemeMode, type WorkspaceAccentId, type WorkspaceSurfaceIntensity, type WorkspaceThemeId } from '../../design-system/themes/workspaceTheme';

export interface ShellAppearancePreference {
  mode: 'dark' | 'system' | 'light';
  themeId: WorkspaceThemeId;
  accentId: WorkspaceAccentId;
  surfaceIntensity: WorkspaceSurfaceIntensity;
  direction: 'auto' | 'ltr' | 'rtl';
  highContrast: 'system' | 'on' | 'off';
  reducedMotion: 'system' | 'on' | 'off';
  scalePercent: number;
}

export interface ShellAppearanceEnvironment {
  prefersDark: boolean;
  prefersHighContrast: boolean;
  prefersReducedMotion: boolean;
  localeDirection?: 'ltr' | 'rtl';
}

export interface ShellAppearanceProjection {
  colorScheme: 'dark' | 'light';
  direction: 'ltr' | 'rtl';
  highContrast: boolean;
  reducedMotion: boolean;
  scalePercent: number;
}

export type ShellScaleBand = 'standard' | 'increased' | 'maximum';

export function shellScaleBand(scalePercent: number): ShellScaleBand {
  if (!Number.isFinite(scalePercent) || scalePercent <= 100) return 'standard';
  return scalePercent >= 175 ? 'maximum' : 'increased';
}

export const DEFAULT_SHELL_APPEARANCE: ShellAppearancePreference = {
  mode: 'dark',
  themeId: 'cosmic-obsidian',
  accentId: 'preset',
  surfaceIntensity: 'obsidian',
  direction: 'auto',
  highContrast: 'system',
  reducedMotion: 'system',
  scalePercent: 100,
};

export function normalizeShellAppearance(value: Partial<ShellAppearancePreference> | null | undefined): ShellAppearancePreference {
  const legacyMode = value?.mode === 'system' || value?.mode === 'light' ? value.mode : 'dark';
  const themeId = isWorkspaceThemeId(value?.themeId)
    ? value.themeId
    : legacyMode === 'system' ? 'system' : legacyMode === 'light' ? 'arctic-daylight' : 'cosmic-obsidian';
  const mode = workspaceThemeMode(themeId);
  const accentId = isWorkspaceAccentId(value?.accentId) ? value.accentId : 'preset';
  const surfaceIntensity = isWorkspaceSurfaceIntensity(value?.surfaceIntensity) ? value.surfaceIntensity : 'obsidian';
  const direction = value?.direction === 'ltr' || value?.direction === 'rtl' ? value.direction : 'auto';
  const highContrast = value?.highContrast === 'on' || value?.highContrast === 'off' ? value.highContrast : 'system';
  const reducedMotion = value?.reducedMotion === 'on' || value?.reducedMotion === 'off' ? value.reducedMotion : 'system';
  const rawScale = Number(value?.scalePercent ?? 100);
  const scalePercent = Math.max(25, Math.min(400, Math.round(Number.isFinite(rawScale) ? rawScale : 100)));
  return { mode, themeId, accentId, surfaceIntensity, direction, highContrast, reducedMotion, scalePercent };
}

export function loadShellAppearance(storage: ShellStorageLike | null): ShellAppearancePreference {
  const current = safeParse(safeStorageGet(storage, APPEARANCE_STORAGE_KEY));
  if (current && typeof current === 'object' && !Array.isArray(current) && 'schemaVersion' in current && current.schemaVersion === 2) {
    const normalized = normalizeStoredAppearance(current);
    if (normalized) return normalized;
  }

  const legacy = safeParse(safeStorageGet(storage, LEGACY_APPEARANCE_STORAGE_KEY));
  const migrated = normalizeStoredAppearance(legacy);
  if (!migrated) return DEFAULT_SHELL_APPEARANCE;
  if (writeShellAppearanceV2(storage, migrated)) safeStorageRemove(storage, LEGACY_APPEARANCE_STORAGE_KEY);
  return migrated;
}

export function saveShellAppearance(storage: ShellStorageLike | null, value: ShellAppearancePreference): ShellAppearancePreference {
  const normalized = normalizeShellAppearance(value);
  writeShellAppearanceV2(storage, normalized);
  return normalized;
}

function normalizeStoredAppearance(value: unknown): ShellAppearancePreference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate: Partial<ShellAppearancePreference> = {};
  if (record.mode === 'dark' || record.mode === 'light' || record.mode === 'system') candidate.mode = record.mode;
  if (isWorkspaceThemeId(record.themeId)) candidate.themeId = record.themeId;
  if (isWorkspaceAccentId(record.accentId)) candidate.accentId = record.accentId;
  if (isWorkspaceSurfaceIntensity(record.surfaceIntensity)) candidate.surfaceIntensity = record.surfaceIntensity;
  if (record.direction === 'auto' || record.direction === 'ltr' || record.direction === 'rtl') candidate.direction = record.direction;
  if (record.highContrast === 'system' || record.highContrast === 'on' || record.highContrast === 'off') candidate.highContrast = record.highContrast;
  if (record.reducedMotion === 'system' || record.reducedMotion === 'on' || record.reducedMotion === 'off') candidate.reducedMotion = record.reducedMotion;
  const storedScale = record.scale ?? record.scalePercent;
  if (typeof storedScale === 'number' || typeof storedScale === 'string') candidate.scalePercent = Number(storedScale);
  return normalizeShellAppearance(candidate);
}

function writeShellAppearanceV2(storage: ShellStorageLike | null, value: ShellAppearancePreference): boolean {
  const normalized = normalizeShellAppearance(value);
  const { scalePercent, ...appearance } = normalized;
  return safeStorageSet(storage, APPEARANCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, ...appearance, scale: scalePercent }));
}

export function deriveShellAppearance(
  preference: ShellAppearancePreference,
  environment: ShellAppearanceEnvironment,
): ShellAppearanceProjection {
  const normalized = normalizeShellAppearance(preference);
  return {
    colorScheme: normalized.mode === 'system' ? (environment.prefersDark ? 'dark' : 'light') : normalized.mode,
    direction: normalized.direction === 'auto' ? (environment.localeDirection ?? 'ltr') : normalized.direction,
    highContrast: normalized.highContrast === 'system' ? environment.prefersHighContrast : normalized.highContrast === 'on',
    reducedMotion: normalized.reducedMotion === 'system' ? environment.prefersReducedMotion : normalized.reducedMotion === 'on',
    scalePercent: normalized.scalePercent,
  };
}
