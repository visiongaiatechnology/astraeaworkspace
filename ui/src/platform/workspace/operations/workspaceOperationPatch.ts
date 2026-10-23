// STATUS: DIAMANT VGT SUPREME — Bounded conflict-aware WOM delta primitives
import type { OperationPathSegment, OperationValue, WorkspaceDeltaOperation, WorkspaceOperationTransaction } from './workspaceOperationTypes';
import { WorkspaceOperationError } from './workspaceOperationTypes';

const MAX_PATH_DEPTH = 96;
const MAX_SEGMENT_LENGTH = 256;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ENGINE_METADATA_KEYS = new Set(['version', 'modified_at']);

export function cloneValue<T>(value: T): T { return structuredClone(value); }

export function valueAt(root: unknown, path: readonly OperationPathSegment[]): OperationValue {
  let cursor: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'string' && FORBIDDEN_KEYS.has(segment)) throw new WorkspaceOperationError('INVALID', 'Unsafe operation path');
    if (Array.isArray(cursor)) {
      if (!Number.isInteger(segment) || Number(segment) < 0 || Number(segment) >= cursor.length) return { present: false };
      cursor = cursor[Number(segment)];
      continue;
    }
    if (!cursor || typeof cursor !== 'object' || typeof segment !== 'string') return { present: false };
    const record = cursor as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, segment)) return { present: false };
    cursor = record[segment];
  }
  return { present: true, value: cloneValue(cursor) };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }
  if (typeof a === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!deepEqual(leftKeys, rightKeys)) return false;
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

export function sameOperationValue(a: OperationValue, b: OperationValue): boolean {
  return a.present === b.present && (!a.present || deepEqual(a.value, b.value));
}

export function validatePath(path: readonly OperationPathSegment[]): void {
  if (!Array.isArray(path) || path.length === 0 || path.length > MAX_PATH_DEPTH) throw new WorkspaceOperationError('INVALID', 'Operation path depth is invalid');
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Number.isInteger(segment) || segment < 0 || segment > 10_000_000) throw new WorkspaceOperationError('INVALID', 'Array path index is invalid');
    } else if (!segment || segment.length > MAX_SEGMENT_LENGTH || FORBIDDEN_KEYS.has(segment) || /[\u0000-\u001f]/.test(segment)) {
      throw new WorkspaceOperationError('INVALID', 'Object path segment is invalid');
    }
  }
}

export function setValueAt(root: unknown, path: readonly OperationPathSegment[], next: OperationValue): void {
  validatePath(path);
  let cursor = root as Record<string, unknown> | unknown[];
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (Array.isArray(cursor)) {
      if (typeof segment !== 'number' || segment < 0 || segment >= cursor.length) throw new WorkspaceOperationError('CONFLICT', 'Array operation path no longer exists');
      const child = cursor[segment];
      if (!child || typeof child !== 'object') throw new WorkspaceOperationError('CONFLICT', 'Operation parent is no longer an object');
      cursor = child as Record<string, unknown> | unknown[];
    } else {
      if (typeof segment !== 'string' || !Object.prototype.hasOwnProperty.call(cursor, segment)) throw new WorkspaceOperationError('CONFLICT', 'Operation parent path no longer exists');
      const child = cursor[segment];
      if (!child || typeof child !== 'object') throw new WorkspaceOperationError('CONFLICT', 'Operation parent is no longer an object');
      cursor = child as Record<string, unknown> | unknown[];
    }
  }
  const leaf = path[path.length - 1];
  if (Array.isArray(cursor)) {
    if (typeof leaf !== 'number' || leaf < 0 || leaf >= cursor.length) throw new WorkspaceOperationError('CONFLICT', 'Array operation leaf no longer exists');
    if (!next.present) throw new WorkspaceOperationError('INVALID', 'Array element deletion must be represented as an array replacement');
    cursor[leaf] = cloneValue(next.value);
    return;
  }
  if (typeof leaf !== 'string') throw new WorkspaceOperationError('INVALID', 'Object operation leaf must be a string');
  if (next.present) cursor[leaf] = cloneValue(next.value); else delete cursor[leaf];
}

export function diffDocumentValues(
  documentId: string, before: unknown, after: unknown, path: OperationPathSegment[], out: WorkspaceDeltaOperation[], idFactory: () => string, maxOperations: number,
): void {
  if (deepEqual(before, after)) return;
  if (out.length >= maxOperations) throw new WorkspaceOperationError('LIMIT', 'Operation transaction exceeds the configured delta limit');
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (path.length === 0 && ENGINE_METADATA_KEYS.has(key)) continue;
      const leftPresent = Object.prototype.hasOwnProperty.call(left, key);
      const rightPresent = Object.prototype.hasOwnProperty.call(right, key);
      if (leftPresent && rightPresent) diffDocumentValues(documentId, left[key], right[key], [...path, key], out, idFactory, maxOperations);
      else {
        const operationPath = [...path, key];
        validatePath(operationPath);
        out.push({ operationId: idFactory(), documentId, path: operationPath, before: leftPresent ? { present: true, value: cloneValue(left[key]) } : { present: false }, after: rightPresent ? { present: true, value: cloneValue(right[key]) } : { present: false } });
      }
    }
    return;
  }
  if (path.length === 0) throw new WorkspaceOperationError('INVALID', 'Whole-document replacement is not a valid editable operation');
  validatePath(path);
  out.push({ operationId: idFactory(), documentId, path: [...path], before: { present: true, value: cloneValue(before) }, after: { present: true, value: cloneValue(after) } });
}

export function invertOperation(operation: WorkspaceDeltaOperation, idFactory: () => string): WorkspaceDeltaOperation {
  return { operationId: idFactory(), documentId: operation.documentId, path: [...operation.path], before: cloneValue(operation.after), after: cloneValue(operation.before) };
}

/**
 * Serially measured byte size per transaction.
 *
 * `compactHistoryIfNeeded` sums this over the whole undo stack on **every** commit,
 * so an uncached measurement made typing quadratic: after 300 keystrokes each new
 * character re-serialised 300 transactions, each of them carrying a cloned
 * `paragraphs` array. Measuring a transaction is a pure function of its immutable
 * content, so one measurement per transaction is enough — the cache turns the
 * per-commit cost from O(N · document) into O(N) hash lookups.
 *
 * A `WeakMap` and not a `Map`: history entries are dropped by compaction and by
 * document close, and the measurement must not keep them alive.
 */
const TRANSACTION_BYTE_CACHE = new WeakMap<WorkspaceOperationTransaction, number>();

export function transactionBytes(transaction: WorkspaceOperationTransaction): number {
  const cached = TRANSACTION_BYTE_CACHE.get(transaction);
  if (cached !== undefined) return cached;
  const bytes = new TextEncoder().encode(JSON.stringify(transaction)).byteLength;
  TRANSACTION_BYTE_CACHE.set(transaction, bytes);
  return bytes;
}
