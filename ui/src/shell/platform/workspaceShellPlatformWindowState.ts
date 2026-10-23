import { WINDOW_STATE_KEY_PREFIX, safeParse, safeStorageGet, safeStorageSet, type ShellStorageLike } from './workspaceShellPlatformStorage';

export interface ShellLocalWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

function normalizeWindowStateNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

export function saveShellWindowState(
  storage: ShellStorageLike | null,
  windowKey: string,
  input: Partial<ShellLocalWindowState>,
): ShellLocalWindowState {
  const safeKey = /^[A-Za-z0-9._:-]{1,128}$/.test(windowKey) ? windowKey : 'main';
  const state: ShellLocalWindowState = {
    x: normalizeWindowStateNumber(input.x, 80, -32_768, 32_768),
    y: normalizeWindowStateNumber(input.y, 80, -32_768, 32_768),
    width: normalizeWindowStateNumber(input.width, 1280, 640, 16_384),
    height: normalizeWindowStateNumber(input.height, 820, 480, 16_384),
    maximized: Boolean(input.maximized),
  };
  safeStorageSet(storage, `${WINDOW_STATE_KEY_PREFIX}${safeKey}`, JSON.stringify(state));
  return state;
}

export function loadShellWindowState(storage: ShellStorageLike | null, windowKey: string): ShellLocalWindowState | null {
  const safeKey = /^[A-Za-z0-9._:-]{1,128}$/.test(windowKey) ? windowKey : 'main';
  const raw = safeParse(safeStorageGet(storage, `${WINDOW_STATE_KEY_PREFIX}${safeKey}`));
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<ShellLocalWindowState>;
  return {
    x: normalizeWindowStateNumber(value.x, 80, -32_768, 32_768),
    y: normalizeWindowStateNumber(value.y, 80, -32_768, 32_768),
    width: normalizeWindowStateNumber(value.width, 1280, 640, 16_384),
    height: normalizeWindowStateNumber(value.height, 820, 480, 16_384),
    maximized: Boolean(value.maximized),
  };
}
