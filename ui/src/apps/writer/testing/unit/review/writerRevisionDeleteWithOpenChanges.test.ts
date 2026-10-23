// STATUS: PLATIN — Deleting a paragraph that still carries open revisions
//
// The acceptance asks explicitly for the behaviour when a paragraph with open
// changes is deleted. It is verified end to end through the real revert engine,
// in the order the review state uses: newest revision first.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import type { TrackChangeRevision } from '../../../types';
import type { WriterRevisionDocumentState } from '../../../review/revisions/writerRevisionRevertEngine';
import { revertWriterRevision } from '../../../review/revisions/writerRevisionRevertEngine';
import {
  acceptAllRevisions,
  acceptRevision,
  createRevision,
} from '../../../review/revisions/track-changes/writerTrackChangesEngine';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };
const para = (id: string, text: string): Paragraph => ({ id, style: { ...STYLE }, spans: [{ text }] });

const state = (paragraphs: Paragraph[]): WriterRevisionDocumentState => ({
  paragraphs,
  tables: [],
  pageSetup: undefined,
  sections: [],
  styleCatalog: { paragraphStyles: [], characterStyles: [], tableStyles: [], listStyles: [], linkedStyles: [] },
} as unknown as WriterRevisionDocumentState);

const textOf = (s: WriterRevisionDocumentState) =>
  s.paragraphs.map((p) => `${p.id}:${p.spans.map((x) => x.text).join('')}`);

/**
 * The two revisions the editor writes when, with tracking on, a paragraph was
 * typed (empty → text) and then deleted. p2 really carries the inserted text, so
 * the data is consistent with the revisions.
 */
function deleteParagraphWithOpenInsert(): { after: Paragraph[]; revisions: TrackChangeRevision[] } {
  const before = [para('p1', 'Erster'), para('p2', 'Neuer Satz'), para('p3', 'Dritter')];
  // `createRevision` stamps the current time itself, so the timestamps are set
  // explicitly here — the order of "reject all" depends on them.
  const inserted: TrackChangeRevision = {
    ...createRevision(
      'insert', 'p2', 'You', '', 'Neuer Satz', 'Text eingefügt',
      { kind: 'text', beforeText: '', afterText: 'Neuer Satz' },
    ),
    timestamp: 100,
  };
  const after = [before[0]!, before[2]!];
  const deletion: TrackChangeRevision = {
    ...createRevision(
      'delete', 'p2', 'You', 'Neuer Satz', '', 'Absatz gelöscht',
      {
        kind: 'paragraph-delete',
        paragraph: structuredClone(before[1]!),
        index: 1,
        previousParagraphId: 'p1',
        nextParagraphId: 'p3',
      },
    ),
    timestamp: 200,
  };
  return { after, revisions: [inserted, deletion] };
}

interface RejectOutcome {
  state: WriterRevisionDocumentState;
  rejected: string[];
  conflicts: string[];
}

function rejectAll(
  start: WriterRevisionDocumentState,
  revisions: readonly TrackChangeRevision[],
  order: 'newest-first' | 'as-given',
): RejectOutcome {
  let current = start;
  const rejected: string[] = [];
  const conflicts: string[] = [];
  const pending = revisions.filter((r) => r.status === 'pending');
  const ordered = order === 'newest-first'
    ? [...pending].sort((a, b) => b.timestamp - a.timestamp)
    : [...pending];
  for (const revision of ordered) {
    const result = revertWriterRevision(current, revision);
    if (!result.ok) {
      conflicts.push(`${revision.type}:${result.reason}`);
      continue;
    }
    current = result.state;
    rejected.push(revision.id);
  }
  return { state: current, rejected, conflicts };
}

describe('Writer deleting a paragraph with open revisions', () => {
  it('records the deletion instead of losing it', () => {
    const { after, revisions } = deleteParagraphWithOpenInsert();
    expect(textOf(state(after))).toEqual(['p1:Erster', 'p3:Dritter']);
    expect(revisions.map((r) => r.type)).toEqual(['insert', 'delete']);
    expect(revisions[1]?.payload).toMatchObject({ kind: 'paragraph-delete', index: 1 });
  });

  it('restores the paragraph with its text when only the deletion is rejected', () => {
    const { after, revisions } = deleteParagraphWithOpenInsert();
    const result = revertWriterRevision(state(after), revisions[1]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(textOf(result.state)).toEqual(['p1:Erster', 'p2:Neuer Satz', 'p3:Dritter']);
  });

  it('restores the document completely when all revisions are rejected newest first', () => {
    const { after, revisions } = deleteParagraphWithOpenInsert();
    const outcome = rejectAll(state(after), revisions, 'newest-first');
    // No conflict: the deletion is reverted first, so the text revision finds its
    // paragraph again and can roll the inserted text back.
    expect(outcome.conflicts).toEqual([]);
    expect(outcome.rejected).toHaveLength(2);
    expect(textOf(outcome.state)).toEqual(['p1:Erster', 'p2:', 'p3:Dritter']);
  });

  it('conflicts when the text revision is rejected before its paragraph is restored', () => {
    // The opposite order proves the ordering in the review state matters.
    const { after, revisions } = deleteParagraphWithOpenInsert();
    const outcome = rejectAll(state(after), revisions, 'as-given');
    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toContain('Zielabsatz existiert nicht mehr');
    expect(outcome.rejected).toHaveLength(1);
  });

  it('leaves the paragraph deleted when all revisions are accepted', () => {
    const { after, revisions } = deleteParagraphWithOpenInsert();
    const accepted = acceptAllRevisions(revisions);
    expect(accepted.every((r) => r.status === 'accepted')).toBe(true);
    expect(textOf(state(after))).toEqual(['p1:Erster', 'p3:Dritter']);
  });

  it('reports a conflict instead of guessing when the paragraph was edited afterwards', () => {
    const { revisions } = deleteParagraphWithOpenInsert();
    const deletion = revisions[1]!;
    // A paragraph with the same id came back with different content.
    const tampered = state([para('p1', 'Erster'), para('p2', 'Ganz anderer Text'), para('p3', 'Dritter')]);
    const result = revertWriterRevision(tampered, deletion);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('refuses to revert the same deletion twice', () => {
    const { after, revisions } = deleteParagraphWithOpenInsert();
    const deletion = revisions[1]!;
    const first = revertWriterRevision(state(after), deletion);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = revertWriterRevision(first.state, { ...deletion, status: 'rejected' });
    expect(second.ok).toBe(false);
  });

  it('carries the neighbouring paragraph ids for the first and last position', () => {
    const removedMiddle = deleteParagraphWithOpenInsert();
    expect(removedMiddle.revisions[1]?.payload).toMatchObject({ previousParagraphId: 'p1', nextParagraphId: 'p3' });

    const deletionOfFirst = createRevision(
      'delete', 'p1', 'You', 'A', '', 'Absatz gelöscht',
      { kind: 'paragraph-delete', paragraph: para('p1', 'A'), index: 0, nextParagraphId: 'p2' },
    );
    expect(deletionOfFirst.payload).toMatchObject({ index: 0, nextParagraphId: 'p2' });
    expect(deletionOfFirst.payload).not.toHaveProperty('previousParagraphId');
  });

  it('never accepts a revision that is no longer pending', () => {
    // Accepting a rejected revision would claim a change was kept although the
    // document has it reverted. `acceptAllRevisions` filters for pending; the
    // single-revision helper has to do the same.
    const { revisions } = deleteParagraphWithOpenInsert();
    const [inserted, deletion] = revisions;
    const rejected = { ...deletion!, status: 'rejected' as const };
    const accepted = { ...inserted!, status: 'accepted' as const };

    const afterRejected = acceptRevision(rejected.id, [rejected, inserted!]);
    expect(afterRejected.find((r) => r.id === rejected.id)?.status).toBe('rejected');
    expect(afterRejected.find((r) => r.id === inserted!.id)?.status).toBe('pending');

    const afterAccepted = acceptRevision(accepted.id, [accepted]);
    expect(afterAccepted[0]?.status).toBe('accepted');
  });
});
