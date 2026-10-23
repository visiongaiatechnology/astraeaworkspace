import { MAX_SESSION_DOCUMENTS, SESSION_KEY, safeParse, safeStorageGet, safeStorageSet, validDocumentId, type ShellStorageLike } from './workspaceShellPlatformStorage';

export interface ShellSessionState {
  version: 1;
  activeDocumentId: string | null;
  openDocumentIds: string[];
  pinnedDocumentIds?: string[];
  recentlyClosedDocumentIds?: string[];
  savedAt: number;
}

export function reorderShellDocumentIds(order: readonly string[], sourceId: string, targetId: string): string[] {
  const bounded = [...new Set(order.filter(validDocumentId))].slice(0, MAX_SESSION_DOCUMENTS);
  if (sourceId === targetId || !bounded.includes(sourceId) || !bounded.includes(targetId)) return bounded;
  const sourceIndex = bounded.indexOf(sourceId);
  const originalTargetIndex = bounded.indexOf(targetId);
  const next = bounded.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  const insertionIndex = sourceIndex < originalTargetIndex ? targetIndex + 1 : targetIndex;
  next.splice(Math.max(0, insertionIndex), 0, sourceId);
  return next;
}

export function persistShellSession(storage: ShellStorageLike | null, session: Omit<ShellSessionState, 'version'>): { state: ShellSessionState; persisted: boolean } {
  const openDocumentIds = [...new Set(session.openDocumentIds.filter(validDocumentId))].slice(0, MAX_SESSION_DOCUMENTS);
  const activeDocumentId = session.activeDocumentId && openDocumentIds.includes(session.activeDocumentId)
    ? session.activeDocumentId
    : openDocumentIds[0] ?? null;
  const pinnedDocumentIds = [...new Set((session.pinnedDocumentIds ?? []).filter(validDocumentId))].filter((id) => openDocumentIds.includes(id)).slice(0, 32);
  const recentlyClosedDocumentIds = [...new Set((session.recentlyClosedDocumentIds ?? []).filter(validDocumentId))].filter((id) => !openDocumentIds.includes(id)).slice(0, 32);
  const state: ShellSessionState = {
    version: 1,
    activeDocumentId,
    openDocumentIds,
    pinnedDocumentIds,
    recentlyClosedDocumentIds,
    savedAt: Number.isSafeInteger(session.savedAt) && session.savedAt > 0 ? session.savedAt : Date.now(),
  };
  return { state, persisted: safeStorageSet(storage, SESSION_KEY, JSON.stringify(state)) };
}

export function saveShellSession(storage: ShellStorageLike | null, session: Omit<ShellSessionState, 'version'>): ShellSessionState {
  return persistShellSession(storage, session).state;
}

export function loadShellSession(storage: ShellStorageLike | null): ShellSessionState | null {
  if (!storage) return null;
  const raw = safeParse(safeStorageGet(storage, SESSION_KEY));
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<ShellSessionState>;
  if (value.version !== 1 || !Array.isArray(value.openDocumentIds)) return null;
  const openDocumentIds = [...new Set(value.openDocumentIds.filter(validDocumentId))].slice(0, MAX_SESSION_DOCUMENTS);
  const activeDocumentId = validDocumentId(value.activeDocumentId) && openDocumentIds.includes(value.activeDocumentId)
    ? value.activeDocumentId
    : openDocumentIds[0] ?? null;
  const pinnedDocumentIds = Array.isArray(value.pinnedDocumentIds) ? [...new Set(value.pinnedDocumentIds.filter(validDocumentId))].filter((id) => openDocumentIds.includes(id)).slice(0, 32) : [];
  const recentlyClosedDocumentIds = Array.isArray(value.recentlyClosedDocumentIds) ? [...new Set(value.recentlyClosedDocumentIds.filter(validDocumentId))].filter((id) => !openDocumentIds.includes(id)).slice(0, 32) : [];
  return {
    version: 1,
    activeDocumentId,
    openDocumentIds,
    pinnedDocumentIds,
    recentlyClosedDocumentIds,
    savedAt: Number.isSafeInteger(value.savedAt) && (value.savedAt ?? 0) > 0 ? value.savedAt as number : 0,
  };
}
