// STATUS: PLATIN — persistence contract and hostile-storage failure coverage.
import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_SETUP_STORAGE_KEY,
  attemptFirstRunSetupDismissal,
  clearFirstRunSetupState,
  loadFirstRunSetupState,
  saveFirstRunSetupState,
  type FirstRunSetupStorage,
} from '../firstRunSetupPersistence';

class MemoryStorage implements FirstRunSetupStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('first-run setup persistence', () => {
  it('round-trips a versioned completion or skip record', () => {
    const storage = new MemoryStorage();

    expect(saveFirstRunSetupState('completed', storage, 1_800_000_000_000)).toBe(true);
    expect(loadFirstRunSetupState(storage)).toEqual({
      version: 1,
      outcome: 'completed',
      dismissedAt: 1_800_000_000_000,
    });

    expect(saveFirstRunSetupState('skipped', storage, 1_800_000_000_001)).toBe(true);
    expect(loadFirstRunSetupState(storage)?.outcome).toBe('skipped');
    expect(storage.getItem(FIRST_RUN_SETUP_STORAGE_KEY)).toContain('"version":1');
  });

  it('rejects malformed, oversized, stale-version, and invalid timestamp records', () => {
    const storage = new MemoryStorage();
    for (const value of [
      '{',
      'x'.repeat(513),
      JSON.stringify({ version: 2, outcome: 'completed', dismissedAt: 10 }),
      JSON.stringify({ version: 1, outcome: 'completed', dismissedAt: Number.NaN }),
      JSON.stringify({ version: 1, outcome: 'unknown', dismissedAt: 10 }),
    ]) {
      storage.setItem(FIRST_RUN_SETUP_STORAGE_KEY, value);
      expect(loadFirstRunSetupState(storage)).toBeNull();
    }
  });

  it('reports unavailable and throwing storage without crashing setup', () => {
    const throwingStorage: FirstRunSetupStorage = {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => { throw new Error('storage denied'); },
      removeItem: () => { throw new Error('storage denied'); },
    };

    expect(loadFirstRunSetupState(null)).toBeNull();
    expect(loadFirstRunSetupState(throwingStorage)).toBeNull();
    expect(saveFirstRunSetupState('completed', null, 10)).toBe(false);
    expect(saveFirstRunSetupState('completed', throwingStorage, 10)).toBe(false);
    expect(clearFirstRunSetupState(throwingStorage)).toBe(false);

    let dismissed = false;
    expect(attemptFirstRunSetupDismissal('skipped', () => { dismissed = true; }, throwingStorage, 10)).toBe('storage-unavailable');
    expect(dismissed).toBe(false);
  });

  it('persists before closing and removes dismissal if the shell close callback fails', () => {
    const storage = new MemoryStorage();
    let storedBeforeClose = false;
    expect(attemptFirstRunSetupDismissal('completed', () => {
      storedBeforeClose = loadFirstRunSetupState(storage)?.outcome === 'completed';
    }, storage, 1_800_000_000_000)).toBe('dismissed');
    expect(storedBeforeClose).toBe(true);

    expect(attemptFirstRunSetupDismissal('skipped', () => { throw new Error('close failed'); }, storage, 1_800_000_000_001)).toBe('callback-failed');
    expect(loadFirstRunSetupState(storage)).toBeNull();
  });

  it('clears the stored dismissal so setup can be replayed on next launch', () => {
    const storage = new MemoryStorage();
    saveFirstRunSetupState('completed', storage, 1_800_000_000_000);

    expect(clearFirstRunSetupState(storage)).toBe(true);
    expect(loadFirstRunSetupState(storage)).toBeNull();
  });
});
