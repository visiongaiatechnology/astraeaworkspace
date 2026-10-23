// STATUS: DIAMANT VGT SUPREME — Deterministic Review-Mode Presentation Projection
import type { TrackChangeRevision, ReviewMode } from '../../types';
import {
  revertWriterRevision,
  type WriterRevisionDocumentState,
} from '../revisions/writerRevisionRevertEngine';

export interface WriterReviewProjectionConflict {
  revisionId: string;
  reason: string;
}

export interface WriterReviewPresentation {
  state: WriterRevisionDocumentState;
  conflicts: WriterReviewProjectionConflict[];
  historical: boolean;
}

function pendingInReverseApplicationOrder(revisions: readonly TrackChangeRevision[]): TrackChangeRevision[] {
  return revisions
    .map((revision, index) => ({ revision, index }))
    .filter(({ revision }) => revision.status === 'pending')
    .sort((left, right) => right.revision.timestamp - left.revision.timestamp || right.index - left.index)
    .map(({ revision }) => revision);
}

function cloneState(state: WriterRevisionDocumentState): WriterRevisionDocumentState {
  return structuredClone(state);
}

/**
 * Produces the non-mutating document projection used by review display modes.
 * `original` walks every still-pending change backwards with the same fail-closed
 * reversible engine used by Reject. Other modes intentionally present the current
 * document and only alter markup visibility.
 */
export function projectWriterReviewPresentation(
  current: WriterRevisionDocumentState,
  revisions: readonly TrackChangeRevision[],
  mode: ReviewMode,
): WriterReviewPresentation {
  if (mode !== 'original') {
    return { state: current, conflicts: [], historical: false };
  }

  let projected = cloneState(current);
  const conflicts: WriterReviewProjectionConflict[] = [];
  for (const revision of pendingInReverseApplicationOrder(revisions)) {
    const result = revertWriterRevision(projected, revision);
    if (!result.ok) {
      conflicts.push({
        revisionId: revision.id,
        reason: 'reason' in result ? result.reason : 'Revision konnte nicht historisch projiziert werden.',
      });
      continue;
    }
    projected = result.state;
  }

  return { state: projected, conflicts, historical: true };
}
