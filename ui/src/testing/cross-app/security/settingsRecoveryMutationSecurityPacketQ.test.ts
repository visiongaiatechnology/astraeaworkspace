// STATUS: PLATIN — bounded persisted-state and security-ticket mutation contracts.
import { describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_SHELL_SHORTCUTS,
  loadShellAppearance,
  loadShellRecents,
  loadShellSession,
  loadShellShortcuts,
  type ShellStorageLike,
} from '../../../shell/platform/workspaceShellPlatform';
import {
  loadWorkspaceLibraryPreferences,
  WORKSPACE_LIBRARY_LIMITS,
  WORKSPACE_LIBRARY_PREFERENCES_KEY,
} from '../../../shell/library/workspaceLibrary';
import { beginWorkspaceSession } from '../../../shell/lifecycle/workspaceRecoverySession';
import { loadEmergencySnapshot } from '../../../platform/workspace/persistence/workspaceStorage';
import { decodeSecurityRoundtripTicket, OpaqueSecurityError } from '../../../platform/security/securityGatesPlatform';

const MUTATION_CASES = 4_096;
const EMERGENCY_MARKER_KEY = 'vgt_emergency_snapshot_v1';
const SESSION_MARKER_KEY = 'vgt_workspace_session_state_v1';
const SHELL_SESSION_KEY = 'astraea.shell.session.v1';
const SHELL_RECENTS_KEY = 'astraea.shell.recents.v1';
const SHELL_SHORTCUTS_KEY = 'astraea.shell.shortcuts.v1';
const LEGACY_APPEARANCE_KEY = 'astraea.shell.appearance.v1';

type Boundary = 'shell-session' | 'shell-appearance' | 'shell-recents' | 'shell-shortcuts'
  | 'library-preferences' | 'recovery-marker' | 'emergency-marker' | 'security-ticket';

function baseline(boundary: Boundary, index: number): unknown {
  switch (boundary) {
    case 'shell-session':
      return { version: 1, activeDocumentId: `doc-${index}`, openDocumentIds: [`doc-${index}`], pinnedDocumentIds: [], recentlyClosedDocumentIds: [], savedAt: index + 1 };
    case 'shell-appearance':
      return { schemaVersion: 2, mode: 'dark', themeId: 'cosmic-obsidian', accentId: 'preset', surfaceIntensity: 'obsidian', direction: 'auto', highContrast: 'system', reducedMotion: 'system', scale: 100 + (index % 301) };
    case 'shell-recents':
      return [{ documentId: `doc-${index}`, kind: 'Writer', lastOpenedAt: index + 1 }];
    case 'shell-shortcuts':
      return { ...DEFAULT_SHELL_SHORTCUTS, 'command-palette': index % 2 === 0 ? 'Ctrl+K' : 'Meta+K' };
    case 'library-preferences':
      return { schemaVersion: 1, favorites: [`doc-${index}`], collections: [{ id: `collection-${index}`, name: 'Archive', documentIds: [`doc-${index}`] }], view: 'list', sort: 'modified' };
    case 'recovery-marker':
      return { version: 1, state: index % 2 === 0 ? 'open' : 'clean', sessionId: `session-${index}`, transitionedAt: Date.now() - index };
    case 'emergency-marker':
      return { version: 2, timestamp: Date.now() - index, documentIds: [`doc-${index}`] };
    case 'security-ticket':
      return { schema: 'astraea-security-boundary/v1', boundary: 'pdf', fileName: `report-${index}.pdf`, byteLength: index, nonce: '0123456789abcdef0123456789abcdef' };
  }
}

function mutatedRecord(boundary: Boundary, index: number, changes: Record<string, unknown>): string {
  const value = baseline(boundary, index);
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { initial: value };
  return JSON.stringify({ ...record, ...changes });
}

function mutatedJsonCorpus(boundary: Boundary): string[] {
  const cases = new Array<string>(MUTATION_CASES);
  for (let index = 0; index < MUTATION_CASES; index += 1) {
    if (index % 1_024 === 1_023) {
      cases[index] = JSON.stringify('x'.repeat(131_072 + (index % 32)));
      continue;
    }
    switch (index % 16) {
      case 0:
        cases[index] = JSON.stringify(baseline(boundary, index));
        break;
      case 1:
        cases[index] = JSON.stringify(index);
        break;
      case 2:
        cases[index] = JSON.stringify(`hostile-${boundary}-${index}`);
        break;
      case 3:
        cases[index] = JSON.stringify([index, null, true, { nested: `value-${index}` }]);
        break;
      case 4:
        cases[index] = `{"truncated":${index}`;
        break;
      case 5:
        cases[index] = JSON.stringify({ mutant: index, unexpected: { nested: [{ value: index }] } });
        break;
      case 6:
        cases[index] = mutatedRecord(boundary, index, { version: null, schemaVersion: '2', state: ['open'], transitionedAt: 'now' });
        break;
      case 7:
        cases[index] = mutatedRecord(boundary, index, { openDocumentIds: `doc-${index}`, favorites: {}, collections: null, documentIds: false });
        break;
      case 8:
        cases[index] = mutatedRecord(boundary, index, { activeDocumentId: { toString: { value: index } }, fileName: [], nonce: { value: index } });
        break;
      case 9:
        cases[index] = mutatedRecord(boundary, index, { savedAt: 1e309, timestamp: -index, byteLength: 1e309, scale: 'Infinity' });
        break;
      case 10:
        cases[index] = mutatedRecord(boundary, index, { documentIds: [null, index, '../escape', 'valid-id'], openDocumentIds: [null, index, '../escape', 'valid-id'] });
        break;
      case 11:
        cases[index] = mutatedRecord(boundary, index, { boundary: { toString: { value: index }, valueOf: { value: index } } });
        break;
      case 12:
        cases[index] = mutatedRecord(boundary, index, { padding: '\u0000\u202e\ud800', schema: 'wrong', unknown: index });
        break;
      case 13:
        cases[index] = mutatedRecord(boundary, index, { openDocumentIds: Array.from({ length: index % 80 }, (_, item) => `doc-${item}`), favorites: Array.from({ length: index % 80 }, (_, item) => `fav-${item}`) });
        break;
      case 14:
        cases[index] = '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"mutant":' + index + '}';
        break;
      default:
        cases[index] = JSON.stringify({ mutant: index, padding: 'x'.repeat(index % 1_024) });
        break;
    }
  }
  return cases;
}

function memoryStorage(initial?: Readonly<Record<string, string>>): ShellStorageLike & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function assertMutationRun<T>(
  boundary: Boundary,
  inputs: readonly string[],
  execute: (raw: string) => T,
  isControlledReject: (error: unknown) => boolean = () => false,
): { accepted: number; controlledRejects: number } {
  let accepted = 0;
  let controlledRejects = 0;
  let dispatched = 0;
  const unexpected: string[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const raw = inputs[index];
    if (raw === undefined) {
      unexpected.push(`case-${index}: missing generated input`);
      continue;
    }
    dispatched += 1;
    try {
      execute(raw);
      accepted += 1;
    } catch (error) {
      if (isControlledReject(error)) controlledRejects += 1;
      else unexpected.push(`case-${index}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    }
  }
  expect(inputs).toHaveLength(MUTATION_CASES);
  expect(dispatched, `${boundary} cases dispatched`).toBe(MUTATION_CASES);
  expect(unexpected, `${boundary} raw/native failures`).toEqual([]);
  expect(accepted + controlledRejects, `${boundary} cases accounted`).toBe(MUTATION_CASES);
  return { accepted, controlledRejects };
}

function expectValidTicket(value: unknown): void {
  expect(value).toMatchObject({
    schema: 'astraea-security-boundary/v1',
    boundary: expect.stringMatching(/^(vwc|ooxml|pdf|image|foreign)$/u),
    fileName: expect.any(String),
    nonce: expect.stringMatching(/^[a-f0-9]{32}$/u),
  });
}

describe('persisted settings, recovery, and platform ticket mutation packet Q', () => {
  it('bounds shell session restoration over 4,096 deterministic stored JSON mutations', () => {
    const storage = memoryStorage();
    const stats = assertMutationRun('shell-session', mutatedJsonCorpus('shell-session'), (raw) => {
      storage.setItem(SHELL_SESSION_KEY, raw);
      const state = loadShellSession(storage);
      if (state) {
        expect(state.openDocumentIds.length).toBeLessThanOrEqual(64);
        expect(new Set(state.openDocumentIds).size).toBe(state.openDocumentIds.length);
      }
      return state;
    });
    expect(stats.accepted).toBe(MUTATION_CASES);
  });

  it('bounds shell appearance preference restoration over 4,096 mutations', () => {
    const storage = memoryStorage();
    const stats = assertMutationRun('shell-appearance', mutatedJsonCorpus('shell-appearance'), (raw) => {
      storage.setItem(APPEARANCE_STORAGE_KEY, raw);
      storage.values.delete(LEGACY_APPEARANCE_KEY);
      const value = loadShellAppearance(storage);
      expect(value.scalePercent).toBeGreaterThanOrEqual(25);
      expect(value.scalePercent).toBeLessThanOrEqual(400);
      return value;
    });
    expect(stats.accepted).toBe(MUTATION_CASES);
  });

  it('bounds shell recents and shortcut restoration over 4,096 mutations each', () => {
    const recentInputs = mutatedJsonCorpus('shell-recents');
    const shortcutInputs = mutatedJsonCorpus('shell-shortcuts');
    const storage = memoryStorage();
    const recents = assertMutationRun('shell-recents', recentInputs, (raw) => {
      storage.setItem(SHELL_RECENTS_KEY, raw);
      const entries = loadShellRecents(storage);
      expect(entries.length).toBeLessThanOrEqual(32);
      return entries;
    });
    const shortcuts = assertMutationRun('shell-shortcuts', shortcutInputs, (raw) => {
      storage.setItem(SHELL_SHORTCUTS_KEY, raw);
      const map = loadShellShortcuts(storage);
      expect(Object.keys(map)).toEqual(Object.keys(DEFAULT_SHELL_SHORTCUTS));
      expect(Object.values(map).every((binding) => typeof binding === 'string' && binding.length <= 32)).toBe(true);
      return map;
    });
    expect(recents.accepted).toBe(MUTATION_CASES);
    expect(shortcuts.accepted).toBe(MUTATION_CASES);
  });

  it('bounds Workspace Library persisted preferences over 4,096 mutations', () => {
    const storage = memoryStorage();
    const stats = assertMutationRun('library-preferences', mutatedJsonCorpus('library-preferences'), (raw) => {
      storage.setItem(WORKSPACE_LIBRARY_PREFERENCES_KEY, raw);
      const value = loadWorkspaceLibraryPreferences(storage);
      expect(value.favorites.length).toBeLessThanOrEqual(WORKSPACE_LIBRARY_LIMITS.maxFavorites);
      expect(value.collections.length).toBeLessThanOrEqual(WORKSPACE_LIBRARY_LIMITS.maxCollections);
      return value;
    });
    expect(stats.accepted).toBe(MUTATION_CASES);
  });

  it('bounds abnormal-termination session marker parsing over 4,096 mutations', () => {
    const storage = memoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    try {
      const stats = assertMutationRun('recovery-marker', mutatedJsonCorpus('recovery-marker'), (raw) => {
        storage.setItem(SESSION_MARKER_KEY, raw);
        const state = beginWorkspaceSession();
        expect(typeof state.abnormalPreviousTermination).toBe('boolean');
        expect(typeof state.previousCleanTermination).toBe('boolean');
        expect(state.sessionId.length).toBeGreaterThan(0);
        return state;
      });
      expect(stats.accepted).toBe(MUTATION_CASES);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bounds emergency snapshot marker parsing and never returns plaintext documents over 4,096 mutations', () => {
    const storage = memoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    try {
      const stats = assertMutationRun('emergency-marker', mutatedJsonCorpus('emergency-marker'), (raw) => {
        storage.setItem(EMERGENCY_MARKER_KEY, raw);
        const snapshot = loadEmergencySnapshot();
        expect(snapshot).toBeNull();
        return snapshot;
      });
      expect(stats.accepted).toBe(MUTATION_CASES);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects malformed platform ticket JSON opaquely across 4,096 deterministic mutations', () => {
    const inputs = mutatedJsonCorpus('security-ticket');
    const stats = assertMutationRun('security-ticket', inputs, (raw) => {
      const ticket = decodeSecurityRoundtripTicket(raw);
      expectValidTicket(ticket);
      return ticket;
    }, (error) => error instanceof OpaqueSecurityError);
    expect(stats.accepted + stats.controlledRejects).toBe(MUTATION_CASES);
    expect(stats.accepted).toBeGreaterThan(0);

    const invalidRuntimeTypes: readonly unknown[] = [null, undefined, 0, false, {}, []];
    for (const value of invalidRuntimeTypes) {
      expect(() => decodeSecurityRoundtripTicket(value as string)).toThrow(OpaqueSecurityError);
    }
  });
});
