import { MAX_SHORTCUTS, SHORTCUTS_KEY, safeParse, safeStorageSet, type ShellStorageLike } from './workspaceShellPlatformStorage';

export type ShellShortcutCommand =
  | 'command-palette'
  | 'save'
  | 'quick-add-task'
  | 'start-center'
  | 'workspace-explorer'
  | 'new-window';

export type ShellShortcutMap = Record<ShellShortcutCommand, string>;

export const DEFAULT_SHELL_SHORTCUTS: ShellShortcutMap = {
  'command-palette': 'Ctrl+K',
  save: 'Ctrl+S',
  'quick-add-task': 'Ctrl+Shift+A',
  'start-center': 'Ctrl+Alt+H',
  'workspace-explorer': 'Ctrl+Alt+E',
  'new-window': 'Ctrl+Shift+N',
};

export function normalizeShortcutBinding(input: string): string {
  const parts = input.split('+').map((part) => part.trim()).filter(Boolean);
  const modifiers = new Set<string>();
  let key = '';
  for (const raw of parts) {
    const token = raw.toLowerCase();
    if (token === 'control' || token === 'ctrl') modifiers.add('Ctrl');
    else if (token === 'command' || token === 'cmd' || token === 'meta') modifiers.add('Meta');
    else if (token === 'shift') modifiers.add('Shift');
    else if (token === 'alt' || token === 'option') modifiers.add('Alt');
    else {
      if (key) throw new Error('Shortcut contains multiple non-modifier keys');
      key = raw.length === 1 ? raw.toUpperCase() : raw;
    }
  }
  if (!key || key.length > 24) throw new Error('Shortcut requires one bounded key');
  const order = ['Ctrl', 'Meta', 'Alt', 'Shift'].filter((modifier) => modifiers.has(modifier));
  return [...order, key].join('+');
}

export function findShortcutConflicts(map: ShellShortcutMap): Array<{ binding: string; commands: ShellShortcutCommand[] }> {
  const reverse = new Map<string, ShellShortcutCommand[]>();
  for (const [command, rawBinding] of Object.entries(map) as Array<[ShellShortcutCommand, string]>) {
    const binding = normalizeShortcutBinding(rawBinding);
    const list = reverse.get(binding) ?? [];
    list.push(command);
    reverse.set(binding, list);
  }
  return [...reverse.entries()]
    .filter(([, commands]) => commands.length > 1)
    .map(([binding, commands]) => ({ binding, commands }));
}

export function setShortcutBinding(map: ShellShortcutMap, command: ShellShortcutCommand, rawBinding: string): ShellShortcutMap {
  const binding = normalizeShortcutBinding(rawBinding);
  const next = { ...map, [command]: binding };
  const conflict = findShortcutConflicts(next)[0];
  if (conflict) throw new Error(`Shortcut ${conflict.binding} conflicts between ${conflict.commands.join(' and ')}`);
  return next;
}

export function loadShellShortcuts(storage: ShellStorageLike | null): ShellShortcutMap {
  if (!storage) return { ...DEFAULT_SHELL_SHORTCUTS };
  const raw = safeParse(storage.getItem(SHORTCUTS_KEY));
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SHELL_SHORTCUTS };
  let next = { ...DEFAULT_SHELL_SHORTCUTS };
  let count = 0;
  for (const command of Object.keys(DEFAULT_SHELL_SHORTCUTS) as ShellShortcutCommand[]) {
    const value = (raw as Record<string, unknown>)[command];
    if (typeof value !== 'string' || count >= MAX_SHORTCUTS) continue;
    try { next = setShortcutBinding(next, command, value); count += 1; } catch { /* preserve safe default */ }
  }
  return next;
}

export function saveShellShortcuts(storage: ShellStorageLike | null, map: ShellShortcutMap): void {
  const conflicts = findShortcutConflicts(map);
  if (conflicts.length > 0) throw new Error(`Shortcut conflict: ${conflicts[0].binding}`);
  safeStorageSet(storage, SHORTCUTS_KEY, JSON.stringify(map));
}

export interface ShortcutEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function shortcutMatches(event: ShortcutEventLike, rawBinding: string): boolean {
  const binding = normalizeShortcutBinding(rawBinding).split('+');
  const key = binding[binding.length - 1].toLowerCase();
  const wantsCtrl = binding.includes('Ctrl');
  const wantsMeta = binding.includes('Meta');
  const primaryModifierMatches = wantsCtrl && !wantsMeta
    ? (event.ctrlKey || event.metaKey)
    : event.ctrlKey === wantsCtrl && event.metaKey === wantsMeta;
  return event.key.toLowerCase() === key
    && primaryModifierMatches
    && event.altKey === binding.includes('Alt')
    && event.shiftKey === binding.includes('Shift');
}
