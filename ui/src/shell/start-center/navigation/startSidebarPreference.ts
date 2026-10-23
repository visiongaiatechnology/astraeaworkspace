import type { ShellStorageLike } from '../../platform/workspaceShellPlatform';

export const START_SIDEBAR_PREFERENCE_KEY = 'astraea.uiux.start-sidebar.v1';
export const START_SIDEBAR_MIN_WIDTH = 200;
export const START_SIDEBAR_MAX_WIDTH = 280;
export const START_SIDEBAR_COLLAPSED_WIDTH = 48;

export interface StartSidebarPreference {
  collapsed: boolean;
  width: number;
}

export const DEFAULT_START_SIDEBAR_PREFERENCE: Readonly<StartSidebarPreference> = {
  collapsed: false,
  width: START_SIDEBAR_MAX_WIDTH,
};

interface PreferenceSubscriber {
  storage: ShellStorageLike | null;
  listener: (preference: StartSidebarPreference) => void;
}

const subscribers = new Set<PreferenceSubscriber>();

function normalizedWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return START_SIDEBAR_MAX_WIDTH;
  return Math.max(START_SIDEBAR_MIN_WIDTH, Math.min(START_SIDEBAR_MAX_WIDTH, Math.round(value)));
}

export function normalizeStartSidebarPreference(value: unknown): StartSidebarPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_START_SIDEBAR_PREFERENCE };
  const candidate = value as Record<string, unknown>;
  return {
    collapsed: candidate.collapsed === true,
    width: normalizedWidth(candidate.width),
  };
}

export function loadStartSidebarPreference(storage: ShellStorageLike | null): StartSidebarPreference {
  try {
    const raw = storage?.getItem(START_SIDEBAR_PREFERENCE_KEY);
    if (!raw || raw.length > 1024) return { ...DEFAULT_START_SIDEBAR_PREFERENCE };
    return normalizeStartSidebarPreference(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_START_SIDEBAR_PREFERENCE };
  }
}

function publishPreference(storage: ShellStorageLike | null, preference: StartSidebarPreference): void {
  for (const subscriber of subscribers) {
    if (subscriber.storage === storage) subscriber.listener({ ...preference });
  }
}

export function saveStartSidebarPreference(
  storage: ShellStorageLike | null,
  value: StartSidebarPreference,
): StartSidebarPreference {
  if (!storage) throw new Error('start-center-sidebar-storage-unavailable');
  const normalized = normalizeStartSidebarPreference(value);
  const serialized = JSON.stringify(normalized);
  try {
    if (storage.getItem(START_SIDEBAR_PREFERENCE_KEY) === serialized) return normalized;
    storage.setItem(START_SIDEBAR_PREFERENCE_KEY, serialized);
  } catch {
    throw new Error('start-center-sidebar-storage-failed');
  }
  publishPreference(storage, normalized);
  return normalized;
}

export function setStartSidebarCollapsed(
  storage: ShellStorageLike | null,
  collapsed: boolean,
): StartSidebarPreference {
  if (typeof collapsed !== 'boolean') throw new Error('start-center-sidebar-value-invalid');
  return saveStartSidebarPreference(storage, {
    ...loadStartSidebarPreference(storage),
    collapsed,
  });
}

export function subscribeToStartSidebarPreference(
  storage: ShellStorageLike | null,
  listener: (preference: StartSidebarPreference) => void,
): () => void {
  const subscriber = { storage, listener };
  subscribers.add(subscriber);

  const onStorage = (event: StorageEvent) => {
    if (event.key === START_SIDEBAR_PREFERENCE_KEY) {
      listener(loadStartSidebarPreference(storage));
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return () => {
    subscribers.delete(subscriber);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
