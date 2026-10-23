// STATUS: PLATIN — remembered Present display choice and deterministic monitor preselection.
//
// The user picks the projector monitor and the presenter monitor once; the choice is stored in the
// same local storage the Workspace shell already uses and re-applied when the start dialog opens.
// Monitor indices are only meaningful together with the current monitor list, so a stored index is
// used only when it still exists; otherwise the deterministic default applies.
import type { PresentMonitorInfo } from '../../../../platform/native/presentWindowBridge';
import {
  safeParse,
  safeStorageGet,
  safeStorageSet,
  type ShellStorageLike,
} from '../../../../shell/platform/workspaceShellPlatformStorage';

export const PRESENT_DISPLAY_PREFERENCE_KEY = 'astraea.present.display-preference.v1';
export const PRESENT_DISPLAY_MAX_MONITORS = 16;

export type PresentPresentationMode = 'single' | 'multi';

export interface PresentDisplayPreference {
  readonly mode: PresentPresentationMode;
  readonly audienceMonitorIndex: number | null;
  readonly presenterMonitorIndex: number | null;
}

export interface PresentMonitorSelection {
  readonly audienceMonitorIndex: number;
  readonly presenterMonitorIndex: number;
}

export const DEFAULT_PRESENT_DISPLAY_PREFERENCE: PresentDisplayPreference = Object.freeze({
  mode: 'single',
  audienceMonitorIndex: null,
  presenterMonitorIndex: null,
});

export function normalizePresentDisplayPreference(value: unknown): PresentDisplayPreference {
  if (typeof value !== 'object' || value === null) return DEFAULT_PRESENT_DISPLAY_PREFERENCE;
  const record = value as Record<string, unknown>;
  const mode: PresentPresentationMode = record.mode === 'multi' ? 'multi' : 'single';
  const audience = typeof record.audienceMonitorIndex === 'number' && Number.isInteger(record.audienceMonitorIndex)
    && record.audienceMonitorIndex >= 0 && record.audienceMonitorIndex < PRESENT_DISPLAY_MAX_MONITORS
    ? record.audienceMonitorIndex
    : null;
  const presenter = typeof record.presenterMonitorIndex === 'number' && Number.isInteger(record.presenterMonitorIndex)
    && record.presenterMonitorIndex >= 0 && record.presenterMonitorIndex < PRESENT_DISPLAY_MAX_MONITORS
    ? record.presenterMonitorIndex
    : null;
  if (mode === 'single') return { mode, audienceMonitorIndex: audience, presenterMonitorIndex: presenter };
  return { mode, audienceMonitorIndex: audience, presenterMonitorIndex: presenter };
}

export interface PresentDisplayPreferenceState {
  readonly preference: PresentDisplayPreference;
  /** `true` when the user has saved a choice before; used to pick the dialog's initial mode. */
  readonly stored: boolean;
}

export function loadPresentDisplayPreferenceState(storage: ShellStorageLike | null): PresentDisplayPreferenceState {
  const raw = safeParse(safeStorageGet(storage, PRESENT_DISPLAY_PREFERENCE_KEY));
  return {
    preference: normalizePresentDisplayPreference(raw),
    stored: raw !== null,
  };
}

export function loadPresentDisplayPreference(storage: ShellStorageLike | null): PresentDisplayPreference {
  return loadPresentDisplayPreferenceState(storage).preference;
}

export function savePresentDisplayPreference(
  storage: ShellStorageLike | null,
  preference: PresentDisplayPreference,
): boolean {
  const normalized = normalizePresentDisplayPreference(preference);
  return safeStorageSet(storage, PRESENT_DISPLAY_PREFERENCE_KEY, JSON.stringify(normalized));
}

/**
 * Deterministic preselection:
 *   1. a stored index that still exists wins,
 *   2. otherwise the primary screen is the presenter screen and the first other screen the projector,
 *   3. with a single screen both roles fall back to it (the dialog then offers the single-screen mode).
 */
export function defaultPresentMonitorSelection(
  monitors: readonly PresentMonitorInfo[],
  preference: PresentDisplayPreference = DEFAULT_PRESENT_DISPLAY_PREFERENCE,
): PresentMonitorSelection | null {
  if (monitors.length === 0) return null;
  const available = new Set(monitors.map((monitor) => monitor.index));
  const storedPresenter = preference.presenterMonitorIndex !== null && available.has(preference.presenterMonitorIndex)
    ? preference.presenterMonitorIndex
    : null;
  const storedAudience = preference.audienceMonitorIndex !== null && available.has(preference.audienceMonitorIndex)
    ? preference.audienceMonitorIndex
    : null;

  const primary = monitors.find((monitor) => monitor.primary)?.index ?? monitors[0].index;
  const presenterMonitorIndex = storedPresenter ?? primary;
  const audienceFallback = monitors.find((monitor) => monitor.index !== presenterMonitorIndex)?.index ?? presenterMonitorIndex;
  const audienceMonitorIndex = storedAudience ?? audienceFallback;
  return { audienceMonitorIndex, presenterMonitorIndex };
}

export function presentMonitorLabel(monitor: PresentMonitorInfo): string {
  return `${monitor.name} · ${formatPresentResolution(monitor)}`;
}

export function formatPresentResolution(monitor: Pick<PresentMonitorInfo, 'width' | 'height'>): string {
  return `${monitor.width} × ${monitor.height}`;
}

export function presentMonitorByIndex(
  monitors: readonly PresentMonitorInfo[],
  index: number | null,
): PresentMonitorInfo | null {
  if (index === null) return null;
  return monitors.find((monitor) => monitor.index === index) ?? null;
}
