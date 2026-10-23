// STATUS: PLATIN — Transaction byte measurement must not be quadratic
//
// ASTRAEA WRITER 50 V2 · M3-Vorabfix (Tipp-Latenz).
//
// ## What was wrong
//
// `WorkspaceOperationEngine.compactHistoryIfNeeded` sums the byte size of the whole
// undo stack on **every** commit. `transactionBytes` used to serialise the
// transaction on every one of those calls, and each Writer transaction carries a
// cloned `paragraphs` array. After 300 keystrokes a single new character therefore
// re-serialised 300 transactions — the latency the desktop probe reported.
//
// ## What is asserted here
//
// The measurement is a pure function of immutable content, so it must run **once per
// transaction** and be a cache hit afterwards. The test simulates the engine's
// per-commit summation (commit i sums transactions 0…i) and asserts that the number
// of `JSON.stringify` calls never exceeds the number of distinct transactions.
import { describe, expect, it, vi } from 'vitest';
import {
  transactionBytes,
} from '../../../../../platform/workspace/operations/workspaceOperationPatch';
import type { WorkspaceOperationTransaction } from '../../../../../platform/workspace/operations/workspaceOperationTypes';

/** A transaction that carries a paragraph array, like a Writer keystroke. */
function writerTransaction(index: number): WorkspaceOperationTransaction {
  return {
    id: `tx-${index}`,
    documentId: 'doc-latenz',
    baseVersion: index,
    description: `Keystroke ${index}`,
    timestamp: index,
    operations: [{
      operationId: `op-${index}`,
      documentId: 'doc-latenz',
      path: ['objects', 'tb-doc-latenz', 'data', 'paragraphs'],
      before: { present: true, value: [{ id: 'p-1', spans: [{ text: 'a'.repeat(index) }] }] },
      after: { present: true, value: [{ id: 'p-1', spans: [{ text: 'a'.repeat(index + 1) }] }] },
    }],
  } as WorkspaceOperationTransaction;
}

describe('transactionBytes — one serialisation per transaction, not per commit', () => {
  it('serialises each transaction exactly once when 300 commits sum the history', () => {
    const transactions = Array.from({ length: 300 }, (_unused, index) => writerTransaction(index));
    const stringify = vi.spyOn(JSON, 'stringify');

    // Exactly what the engine does: after commit i, sum the byte size of 0…i.
    for (let commit = 0; commit < transactions.length; commit += 1) {
      let total = 0;
      for (let index = 0; index <= commit; index += 1) {
        total += transactionBytes(transactions[index]!);
      }
      expect(Number.isFinite(total)).toBe(true);
    }

    // 45 150 measurements in total, but only 300 serialisations.
    expect(stringify).toHaveBeenCalledTimes(300);
    stringify.mockRestore();
  });

  it('returns the same value on a cache hit', () => {
    const transaction = writerTransaction(7);
    const first = transactionBytes(transaction);
    const second = transactionBytes(transaction);
    expect(second).toBe(first);
    expect(first).toBeGreaterThan(0);
  });

  it('keeps distinct transactions distinct', () => {
    const small = transactionBytes(writerTransaction(1));
    const large = transactionBytes(writerTransaction(200));
    expect(large).toBeGreaterThan(small);
  });

  it('measures a real transaction shape deterministically', () => {
    const a = writerTransaction(3);
    const b = writerTransaction(3);
    // Two different objects with the same content measure the same …
    expect(transactionBytes(a)).toBe(transactionBytes(b));
    // … and each of them is serialised on its own (no cross-object cache misuse).
    expect(transactionBytes(a)).toBe(transactionBytes(a));
  });
});
