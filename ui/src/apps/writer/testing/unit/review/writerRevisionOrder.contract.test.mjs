// STATUS: PLATIN — Source contract for the revision revert order
//
// The order is unit-tested through the pure helper. What no unit test reaches is that
// the two handlers actually use it: "reject all" and "reject selected" each carried
// their own inline `sort((l, r) => r.timestamp - l.timestamp)`, and with equal
// timestamps that order is oldest-first — measured to leave text "B" plus a conflict
// where the original "A" was reachable.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const reviewState = read('../../../review/useWriterReviewState.ts');
const engine = read('../../../review/revisions/track-changes/writerTrackChangesEngine.ts');

describe('Writer revision revert order contract', () => {
  it('routes both reject paths through the shared ordering', () => {
    expect(reviewState).toContain('sortWriterRevisionsNewestFirst(');
    // Exactly the two call sites — the import line carries no parenthesis.
    expect(reviewState.split('sortWriterRevisionsNewestFirst(').length - 1).toBe(2);
    expect(reviewState).toContain('revisions.filter((revision) => revision.status === \'pending\'),');
    expect(reviewState).toContain('revisions.filter((revision) => selected.has(revision.id) && revision.status === \'pending\'),');
  });

  it('no longer sorts by timestamp inline', () => {
    // The inline sort is the defect: it has no tiebreaker beyond array stability.
    expect(reviewState).not.toContain('right.timestamp - left.timestamp');
  });

  it('keeps the tiebreaker in the engine, with its requirement stated', () => {
    expect(engine).toContain('export function sortWriterRevisionsNewestFirst(');
    expect(engine).toContain('(right.revision.timestamp - left.revision.timestamp) || (right.index - left.index)');
    // The requirement that the input be in register order must stay documented.
    expect(engine).toContain('The input must be in register order');
    expect(engine).toContain('deliberately not idempotent');
  });

  it('leaves the revert engine itself untouched by the ordering question', () => {
    // Ordering belongs to the caller; the engine reverts exactly what it is given.
    const revert = read('../../../review/revisions/writerRevisionRevertEngine.ts');
    expect(revert).not.toContain('sortWriterRevisionsNewestFirst');
    expect(revert).toContain("if (revision.status !== 'pending')");
  });
});
