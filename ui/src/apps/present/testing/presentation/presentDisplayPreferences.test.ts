// STATUS: GOLD — Present Runde 42: remembered display preference and deterministic monitor preselection.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENT_DISPLAY_PREFERENCE,
  PRESENT_DISPLAY_PREFERENCE_KEY,
  defaultPresentMonitorSelection,
  formatPresentResolution,
  loadPresentDisplayPreference,
  loadPresentDisplayPreferenceState,
  normalizePresentDisplayPreference,
  presentMonitorByIndex,
  savePresentDisplayPreference,
} from '../../presentation/preferences/presentDisplayPreferences';
import { createMonitorFixture } from './presentSessionTestHub';
import type { ShellStorageLike } from '../../../../shell/platform/workspaceShellPlatformStorage';

function memoryStorage(seed: Record<string, string> = {}): ShellStorageLike & { values: Record<string, string> } {
  const values: Record<string, string> = { ...seed };
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => { values[key] = value; },
    removeItem: (key: string) => { delete values[key]; },
  };
}

describe('Present display preference', () => {
  it('preselects the primary screen as presenter and the first other screen as projector', () => {
    const monitors = createMonitorFixture();
    const selection = defaultPresentMonitorSelection(monitors);
    expect(selection).toEqual({ audienceMonitorIndex: 1, presenterMonitorIndex: 0 });
  });

  it('falls back to the only screen for both roles', () => {
    const monitors = createMonitorFixture([
      { index: 0, name: 'Laptop', width: 2560, height: 1600, primary: true },
    ]);
    expect(defaultPresentMonitorSelection(monitors)).toEqual({
      audienceMonitorIndex: 0,
      presenterMonitorIndex: 0,
    });
    expect(defaultPresentMonitorSelection([])).toBeNull();
  });

  it('uses a stored choice only while both indices still exist', () => {
    const monitors = createMonitorFixture();
    expect(defaultPresentMonitorSelection(monitors, {
      mode: 'multi',
      audienceMonitorIndex: 0,
      presenterMonitorIndex: 1,
    })).toEqual({ audienceMonitorIndex: 0, presenterMonitorIndex: 1 });

    expect(defaultPresentMonitorSelection(monitors, {
      mode: 'multi',
      audienceMonitorIndex: 7,
      presenterMonitorIndex: 1,
    })).toEqual({ audienceMonitorIndex: 0, presenterMonitorIndex: 1 });
  });

  it('normalises hostile stored values instead of trusting them', () => {
    expect(normalizePresentDisplayPreference(null)).toEqual(DEFAULT_PRESENT_DISPLAY_PREFERENCE);
    expect(normalizePresentDisplayPreference({ mode: 'exploded', audienceMonitorIndex: -4 })).toEqual(
      DEFAULT_PRESENT_DISPLAY_PREFERENCE,
    );
    expect(normalizePresentDisplayPreference({ mode: 'multi', audienceMonitorIndex: 2, presenterMonitorIndex: 1 }))
      .toEqual({ mode: 'multi', audienceMonitorIndex: 2, presenterMonitorIndex: 1 });
    expect(loadPresentDisplayPreference(memoryStorage({ [PRESENT_DISPLAY_PREFERENCE_KEY]: '{not json' })))
      .toEqual(DEFAULT_PRESENT_DISPLAY_PREFERENCE);
  });

  it('round-trips the saved choice and reports whether it was stored', () => {
    const storage = memoryStorage();
    expect(loadPresentDisplayPreferenceState(storage)).toEqual({
      preference: DEFAULT_PRESENT_DISPLAY_PREFERENCE,
      stored: false,
    });
    expect(savePresentDisplayPreference(storage, {
      mode: 'multi',
      audienceMonitorIndex: 1,
      presenterMonitorIndex: 0,
    })).toBe(true);
    expect(storage.values[PRESENT_DISPLAY_PREFERENCE_KEY]).toContain('"mode":"multi"');
    expect(loadPresentDisplayPreferenceState(storage)).toEqual({
      preference: { mode: 'multi', audienceMonitorIndex: 1, presenterMonitorIndex: 0 },
      stored: true,
    });
  });

  it('describes monitors and resolves them by index', () => {
    const monitors = createMonitorFixture();
    expect(formatPresentResolution(monitors[0])).toBe('1920 × 1080');
    expect(presentMonitorByIndex(monitors, 1)?.name).toBe('Display 2');
    expect(presentMonitorByIndex(monitors, 9)).toBeNull();
    expect(presentMonitorByIndex(monitors, null)).toBeNull();
  });
});
