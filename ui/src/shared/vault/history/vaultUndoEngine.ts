// STATUS: DIAMANT VGT SUPREME
// Bounded in-memory Vault undo/redo. Canonical state remains WorkspaceDocument.vaultData.
import type { StoredVaultData } from '../../contracts/vaultSpaces';

export const VAULT_UNDO_MAX_STEPS = 32;
export const VAULT_UNDO_MAX_NODES = 250_000;
export const VAULT_UNDO_MAX_DEPTH = 64;

export interface VaultUndoHistory {
  past: StoredVaultData[];
  future: StoredVaultData[];
}

function cloneImmutable<T>(value: T, depth: number, budget: { nodes: number }): T {
  if (depth > VAULT_UNDO_MAX_DEPTH) throw new Error('vault_undo_depth_limit');
  if (value === null || typeof value !== 'object') return value;
  budget.nodes += 1;
  if (budget.nodes > VAULT_UNDO_MAX_NODES) throw new Error('vault_undo_node_limit');
  if (Array.isArray(value)) return value.map((item) => cloneImmutable(item, depth + 1, budget)) as T;
  if (value instanceof Uint8Array) return new Uint8Array(value) as T;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('vault_undo_non_plain_object');
  const copy: Record<string, unknown> = Object.create(prototype);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) copy[key] = cloneImmutable(nested, depth + 1, budget);
  return copy as T;
}

// Large attachment payloads are immutable strings. This recursive clone duplicates object/array shells
// without serializing the Vault to another plaintext buffer, so undo remains canonical and bounded.
export function snapshotVaultData(value: StoredVaultData): StoredVaultData {
  return cloneImmutable(value, 0, { nodes: 0 });
}

export function createVaultUndoHistory(): VaultUndoHistory { return { past: [], future: [] }; }

export function recordVaultUndoPoint(history: VaultUndoHistory, current: StoredVaultData): VaultUndoHistory {
  return { past: [...history.past, snapshotVaultData(current)].slice(-VAULT_UNDO_MAX_STEPS), future: [] };
}

export function undoVaultData(history: VaultUndoHistory, current: StoredVaultData): { data: StoredVaultData; history: VaultUndoHistory } {
  if (!history.past.length) throw new Error('vault_undo_empty');
  return {
    data: snapshotVaultData(history.past[history.past.length - 1]),
    history: { past: history.past.slice(0, -1), future: [...history.future, snapshotVaultData(current)].slice(-VAULT_UNDO_MAX_STEPS) },
  };
}

export function redoVaultData(history: VaultUndoHistory, current: StoredVaultData): { data: StoredVaultData; history: VaultUndoHistory } {
  if (!history.future.length) throw new Error('vault_redo_empty');
  return {
    data: snapshotVaultData(history.future[history.future.length - 1]),
    history: { past: [...history.past, snapshotVaultData(current)].slice(-VAULT_UNDO_MAX_STEPS), future: history.future.slice(0, -1) },
  };
}
