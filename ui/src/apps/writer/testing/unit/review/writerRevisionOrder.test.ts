// STATUS: DIAMANT VGT SUPREME — Revisions with the same timestamp must still revert newest first
//
// Paket 33 acceptance: "Änderung markieren, kommentieren, annehmen/ablehnen mit
// **korrekter Originalfassung**." Reverting an older change of a paragraph before a
// newer one does not reach the original text — measured: `rev1 -> rev2` yields "B"
// plus one conflict, `rev2 -> rev1` yields the original "A".
//
// `createRevision` stamps `Date.now()`, so revisions created in the same millisecond
// share a timestamp; a document comparison generates a whole batch in a loop. A
// stable sort then keeps the array order, which is *oldest first*.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import type { TrackChangeRevision } from '../../../types';
import {
  createRevision,
  sortWriterRevisionsNewestFirst,
} from '../../../review/revisions/track-changes/writerTrackChangesEngine';
import { revertWriterRevision } from '../../../review/revisions/writerRevisionRevertEngine';

const para = (id: string, text: string): Paragraph => ({
  id, spans: [{ text }], style: { style_name: 'normal' },
} as unknown as Paragraph);

const textRevision = (beforeText: string, afterText: string, timestamp: number): TrackChangeRevision => ({
  ...createRevision('insert', 'p1', 'You', beforeText, afterText, '', { kind: 'text', beforeText, afterText }),
  timestamp,
});

const documentState = (text: string) => ({ paragraphs: [para('p1', text)], revisions: [] }) as never;
const textOf = (state: unknown) =>
  (state as { paragraphs: Paragraph[] }).paragraphs.map((p) => p.spans.map((s) => s.text).join('')).join('|');

/** Reverts in the given order and reports the result. */
function revertInOrder(
  order: readonly TrackChangeRevision[],
): { text: string; conflicts: string[] } {
  let state = documentState('C');
  const conflicts: string[] = [];
  for (const revision of order) {
    const result = revertWriterRevision(state, revision);
    if (!result.ok) { conflicts.push(result.reason); continue; }
    state = result.state as never;
  }
  return { text: textOf(state), conflicts };
}

describe('Writer revision order with equal timestamps', () => {
  it('puts the newer change first even when both share a timestamp', () => {
    const older = textRevision('A', 'B', 1000);
    const newer = textRevision('B', 'C', 1000);
    // The register is append-only: the higher index is the newer change.
    expect(sortWriterRevisionsNewestFirst([older, newer]).map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it('reaches the original text instead of stopping at a conflict', () => {
    const older = textRevision('A', 'B', 1000);
    const newer = textRevision('B', 'C', 1000);
    const order = sortWriterRevisionsNewestFirst([older, newer]);

    const result = revertInOrder(order);
    expect(result.conflicts).toEqual([]);
    expect(result.text).toBe('A');
  });

  it('shows what the plain timestamp sort would have produced', () => {
    const older = textRevision('A', 'B', 1000);
    const newer = textRevision('B', 'C', 1000);
    // A stable sort keeps the array order for equal keys — oldest first, the wrong way.
    const naive = [older, newer].sort((left, right) => right.timestamp - left.timestamp);
    expect(naive.map((r) => r.id)).toEqual([older.id, newer.id]);

    const result = revertInOrder(naive);
    expect(result.text).toBe('B');
    expect(result.conflicts).toHaveLength(1);
  });

  it('still orders by timestamp when the timestamps differ', () => {
    const first = textRevision('A', 'B', 1000);
    const second = textRevision('B', 'C', 2000);
    const third = textRevision('C', 'D', 3000);
    expect(sortWriterRevisionsNewestFirst([first, second, third]).map((r) => r.id))
      .toEqual([third.id, second.id, first.id]);
    // Even when the register order disagrees with the timestamps.
    expect(sortWriterRevisionsNewestFirst([third, first, second]).map((r) => r.id))
      .toEqual([third.id, second.id, first.id]);
  });

  it('orders a whole batch of equal timestamps newest first, taken from the register', () => {
    const batch = Array.from({ length: 6 }, (_, index) => textRevision(`t${index}`, `t${index + 1}`, 5000));
    const sorted = sortWriterRevisionsNewestFirst(batch);
    expect(sorted.map((r) => r.id)).toEqual([...batch].reverse().map((r) => r.id));
  });

  it('loses and duplicates nothing, whatever the input order', () => {
    const batch = Array.from({ length: 6 }, (_, index) => textRevision(`t${index}`, `t${index + 1}`, 5000));
    // The function is documented as requiring register order for the *tiebreak*; the
    // set must still survive any order.
    const shuffled = [batch[3]!, batch[0]!, batch[5]!, batch[1]!, batch[4]!, batch[2]!];
    expect([...sortWriterRevisionsNewestFirst(shuffled)].map((r) => r.id).sort())
      .toEqual(batch.map((r) => r.id).sort());
  });

  it('is deliberately not idempotent for equal timestamps, because position is the tiebreak', () => {
    // Documented behaviour, pinned so nobody assumes otherwise: an already sorted
    // list is no longer in register order, so a second pass reverses the ties.
    const batch = Array.from({ length: 3 }, (_, index) => textRevision(`t${index}`, `t${index + 1}`, 5000));
    const once = sortWriterRevisionsNewestFirst(batch);
    const twice = sortWriterRevisionsNewestFirst(once);
    expect(twice.map((r) => r.id)).toEqual(once.map((r) => r.id).reverse());
    // Callers therefore pass the register, never an already ordered list.
  });

  it('does not mutate the list it was given', () => {
    const older = textRevision('A', 'B', 1000);
    const newer = textRevision('B', 'C', 1000);
    const input = [older, newer];
    const snapshot = input.map((r) => r.id);
    sortWriterRevisionsNewestFirst(input);
    expect(input.map((r) => r.id)).toEqual(snapshot);
  });

  it('handles an empty register', () => {
    expect(sortWriterRevisionsNewestFirst([])).toEqual([]);
  });
});
