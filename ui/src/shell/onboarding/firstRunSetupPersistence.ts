// STATUS: PLATIN — versioned, failure-tolerant first-run dismissal state.

export type FirstRunSetupOutcome = 'completed' | 'skipped';

export interface FirstRunSetupState {
  readonly version: 1;
  readonly outcome: FirstRunSetupOutcome;
  readonly dismissedAt: number;
}

export interface FirstRunSetupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const FIRST_RUN_SETUP_STORAGE_KEY = 'astraea.open-core.first-run.v1';

function browserStorage(): FirstRunSetupStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parseState(value: string | null): FirstRunSetupState | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const state = parsed as Record<string, unknown>;
    if (
      state.version !== 1 ||
      (state.outcome !== 'completed' && state.outcome !== 'skipped') ||
      typeof state.dismissedAt !== 'number' ||
      !Number.isSafeInteger(state.dismissedAt) ||
      state.dismissedAt <= 0
    ) return null;
    return {
      version: 1,
      outcome: state.outcome,
      dismissedAt: state.dismissedAt,
    };
  } catch {
    return null;
  }
}

export function loadFirstRunSetupState(storage: FirstRunSetupStorage | null = browserStorage()): FirstRunSetupState | null {
  try {
    return parseState(storage?.getItem(FIRST_RUN_SETUP_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveFirstRunSetupState(
  outcome: FirstRunSetupOutcome,
  storage: FirstRunSetupStorage | null = browserStorage(),
  now = Date.now(),
): boolean {
  if (
    !storage ||
    (outcome !== 'completed' && outcome !== 'skipped') ||
    !Number.isSafeInteger(now) ||
    now <= 0
  ) return false;
  const state: FirstRunSetupState = { version: 1, outcome, dismissedAt: now };
  try {
    storage.setItem(FIRST_RUN_SETUP_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export type FirstRunSetupDismissalResult = 'dismissed' | 'storage-unavailable' | 'callback-failed';

/** Persists the dismissal before notifying the shell that it can close the wizard. */
export function attemptFirstRunSetupDismissal(
  outcome: FirstRunSetupOutcome,
  dismiss: () => void,
  storage: FirstRunSetupStorage | null = browserStorage(),
  now = Date.now(),
): FirstRunSetupDismissalResult {
  if (!saveFirstRunSetupState(outcome, storage, now)) return 'storage-unavailable';
  try {
    dismiss();
    return 'dismissed';
  } catch {
    clearFirstRunSetupState(storage);
    return 'callback-failed';
  }
}

export function clearFirstRunSetupState(storage: FirstRunSetupStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(FIRST_RUN_SETUP_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
