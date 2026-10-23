import type { DocumentKind } from '../../shared/contracts/workspace';

export const RECENTS_KEY = 'astraea.shell.recents.v1';
export const SESSION_KEY = 'astraea.shell.session.v1';
export const SHORTCUTS_KEY = 'astraea.shell.shortcuts.v1';
export const APPEARANCE_STORAGE_KEY = 'astraea.appearance/2';
export const LEGACY_APPEARANCE_STORAGE_KEY = 'astraea.shell.appearance.v1';
export const WINDOW_STATE_KEY_PREFIX = 'astraea.shell.window-state.v1:';
export const MAX_RECENTS = 32;
export const MAX_SESSION_DOCUMENTS = 64;
export const MAX_SHORTCUTS = 32;

export interface ShellStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function browserShellStorage(): ShellStorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function safeStorageGet(storage: ShellStorageLike | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function safeStorageSet(storage: ShellStorageLike | null, key: string, value: string): boolean {
  try { storage?.setItem(key, value); return Boolean(storage); } catch { return false; }
}

export function safeStorageRemove(storage: ShellStorageLike | null, key: string): boolean {
  try { storage?.removeItem?.(key); return Boolean(storage?.removeItem); } catch { return false; }
}

export function safeParse(value: string | null): unknown {
  if (!value || value.length > 128 * 1024) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value);
}

const DOCUMENT_KINDS = new Set<DocumentKind>([
  'Writer', 'Grid', 'Present', 'Notes', 'PdfStudio', 'Draw', 'Whiteboard', 'Forms', 'Database',
  'Publish', 'Insight', 'Tasks', 'Planner', 'Projects', 'Vault', 'Spaces', 'Connect', 'Automate', 'AdminPolicy', 'GaiaCom',
]);

export function validDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === 'string' && DOCUMENT_KINDS.has(value as DocumentKind);
}
