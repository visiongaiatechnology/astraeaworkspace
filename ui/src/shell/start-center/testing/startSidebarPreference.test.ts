import { describe, expect, it, vi } from 'vitest';
import type { ShellStorageLike } from '../../platform/workspaceShellPlatform';
import {
  DEFAULT_START_SIDEBAR_PREFERENCE,
  loadStartSidebarPreference,
  normalizeStartSidebarPreference,
  saveStartSidebarPreference,
  setStartSidebarCollapsed,
  START_SIDEBAR_MAX_WIDTH,
  START_SIDEBAR_MIN_WIDTH,
  START_SIDEBAR_PREFERENCE_KEY,
  subscribeToStartSidebarPreference,
} from '../navigation/startSidebarPreference';

function memoryStorage(): ShellStorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('Start Center sidebar preference', () => {
  it('uses a bounded expanded default and normalizes untrusted stored shapes', () => {
    expect(loadStartSidebarPreference(memoryStorage())).toEqual(DEFAULT_START_SIDEBAR_PREFERENCE);
    expect(normalizeStartSidebarPreference({ collapsed: true, width: 999 })).toEqual({ collapsed: true, width: START_SIDEBAR_MAX_WIDTH });
    expect(normalizeStartSidebarPreference({ collapsed: true, width: 1 })).toEqual({ collapsed: true, width: START_SIDEBAR_MIN_WIDTH });
    expect(normalizeStartSidebarPreference({ collapsed: 'true', width: '240' })).toEqual(DEFAULT_START_SIDEBAR_PREFERENCE);
    expect(normalizeStartSidebarPreference(['invalid'])).toEqual(DEFAULT_START_SIDEBAR_PREFERENCE);
  });

  it('falls back safely for malformed or oversized storage values', () => {
    const storage = memoryStorage();
    storage.values.set(START_SIDEBAR_PREFERENCE_KEY, '{not-json');
    expect(loadStartSidebarPreference(storage)).toEqual(DEFAULT_START_SIDEBAR_PREFERENCE);
    storage.values.set(START_SIDEBAR_PREFERENCE_KEY, 'x'.repeat(1025));
    expect(loadStartSidebarPreference(storage)).toEqual(DEFAULT_START_SIDEBAR_PREFERENCE);
  });

  it('changes collapsed state without discarding the user-selected width', () => {
    const storage = memoryStorage();
    saveStartSidebarPreference(storage, { collapsed: false, width: 236 });
    expect(setStartSidebarCollapsed(storage, true)).toEqual({ collapsed: true, width: 236 });
    expect(loadStartSidebarPreference(storage)).toEqual({ collapsed: true, width: 236 });
    expect(setStartSidebarCollapsed(storage, false)).toEqual({ collapsed: false, width: 236 });
  });

  it('notifies mounted consumers after a real setting change and ignores idempotent saves', () => {
    const storage = memoryStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeToStartSidebarPreference(storage, listener);
    saveStartSidebarPreference(storage, { collapsed: true, width: 244 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ collapsed: true, width: 244 });
    saveStartSidebarPreference(storage, { collapsed: true, width: 244 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('reports unavailable persistence rather than claiming a setting was saved', () => {
    expect(() => saveStartSidebarPreference(null, { collapsed: true, width: 240 })).toThrow('start-center-sidebar-storage-unavailable');
  });
});
