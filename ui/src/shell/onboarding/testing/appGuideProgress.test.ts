// STATUS: PLATIN — versioned guide progress, automatic presentation, and storage denial coverage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appGuideTargetKey,
  isAppGuideStepReady,
  markAppGuideAutoShown,
  readAppGuideProgress,
  saveAppGuideProgress,
  saveAppGuideProgressBeforeClose,
  shouldAutoShowAppGuide,
  type AppGuideTarget,
} from '../AppGuidePanel';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const target: AppGuideTarget = { type: 'app', kind: 'Writer' };

afterEach(() => vi.unstubAllGlobals());

describe('app guide progress', () => {
  it('automatically presents an app guide once, then leaves manual replay available', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });

    expect(shouldAutoShowAppGuide(target)).toBe(true);
    expect(markAppGuideAutoShown(target)).toBe(true);
    expect(shouldAutoShowAppGuide(target)).toBe(false);
    expect(readAppGuideProgress(target)).toMatchObject({
      stepIndex: 0,
      completed: false,
      skipped: false,
      optedOut: false,
      autoShown: true,
      confirmedSteps: [],
    });
  });

  it('persists confirmed actions and requires both confirmation and a visible target', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const initial = readAppGuideProgress(target);
    expect(saveAppGuideProgress(target, { ...initial, confirmedSteps: [0] })).toBe(true);
    expect(readAppGuideProgress(target).confirmedSteps).toEqual([0]);
    expect(isAppGuideStepReady(false, false)).toBe(false);
    expect(isAppGuideStepReady(true, false)).toBe(false);
    expect(isAppGuideStepReady(false, true)).toBe(false);
    expect(isAppGuideStepReady(true, true)).toBe(true);
  });

  it('migrates valid version-one progress without treating old click-through steps as confirmed', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    storage.setItem(`astraea.shell.onboarding-guide.v1:${appGuideTargetKey(target)}`, JSON.stringify({
      version: 1,
      stepIndex: 1,
      completed: false,
      skipped: false,
      optedOut: false,
      autoShown: true,
    }));

    expect(readAppGuideProgress(target)).toEqual({
      stepIndex: 1,
      completed: false,
      skipped: false,
      optedOut: false,
      autoShown: true,
      confirmedSteps: [],
    });
  });

  it('rejects malformed or duplicate persisted confirmations', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    storage.setItem(`astraea.shell.onboarding-guide.v1:${appGuideTargetKey(target)}`, JSON.stringify({
      version: 2,
      stepIndex: 0,
      completed: false,
      skipped: false,
      optedOut: false,
      autoShown: false,
      confirmedSteps: [0, 0],
    }));

    expect(readAppGuideProgress(target).confirmedSteps).toEqual([]);
    expect(readAppGuideProgress(target).stepIndex).toBe(0);
  });

  it('keeps fail-safe guide state usable when localStorage is denied', () => {
    vi.stubGlobal('window', {
      get localStorage() { throw new Error('storage denied'); },
    });

    expect(shouldAutoShowAppGuide(target)).toBe(true);
    expect(markAppGuideAutoShown(target)).toBe(false);
    expect(readAppGuideProgress(target).autoShown).toBe(false);
  });

  it('keeps the guide open when terminal progress cannot be persisted', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error('storage denied'); },
      },
    });
    let closeCount = 0;

    expect(saveAppGuideProgressBeforeClose(target, {
      ...readAppGuideProgress(target),
      optedOut: true,
    }, () => { closeCount += 1; })).toBe(false);
    expect(closeCount).toBe(0);
  });
});
