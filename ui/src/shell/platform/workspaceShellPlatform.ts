// STATUS: DIAMANT VGT SUPREME — Stable compatibility facade for shell platform policy owners.

export { APPEARANCE_STORAGE_KEY, browserShellStorage } from './workspaceShellPlatformStorage';
export type { ShellStorageLike } from './workspaceShellPlatformStorage';
export { loadShellRecents, recordShellRecent, projectShellRecents, type ShellRecentEntry, type ShellRecentProjection } from './workspaceShellPlatformRecents';
export { reorderShellDocumentIds, persistShellSession, saveShellSession, loadShellSession, type ShellSessionState } from './workspaceShellPlatformSession';
export { DEFAULT_SHELL_SHORTCUTS, normalizeShortcutBinding, findShortcutConflicts, setShortcutBinding, loadShellShortcuts, saveShellShortcuts, shortcutMatches, type ShellShortcutCommand, type ShellShortcutMap, type ShortcutEventLike } from './workspaceShellPlatformShortcuts';
export { DEFAULT_SHELL_APPEARANCE, shellScaleBand, normalizeShellAppearance, loadShellAppearance, saveShellAppearance, deriveShellAppearance, type ShellAppearancePreference, type ShellAppearanceEnvironment, type ShellAppearanceProjection, type ShellScaleBand } from './workspaceShellPlatformAppearance';
export { saveShellWindowState, loadShellWindowState, type ShellLocalWindowState } from './workspaceShellPlatformWindowState';
export { searchShellDocuments, acceptShellDroppedFiles, type ShellSearchResult } from './workspaceShellPlatformSecurity';
export { defaultShellUpdateState, type ShellUpdateState } from './workspaceShellPlatformUpdate';
