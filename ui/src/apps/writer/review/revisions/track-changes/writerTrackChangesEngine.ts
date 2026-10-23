// STATUS: DIAMANT VGT SUPREME — Sovereign Track Changes & LCS Diffing Engine
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import type {
  TrackChangeRevision,
  WriterRevisionPayload,
  WriterRevisionStatus,
  WriterRevisionType,
} from '../../../types';

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export function computeDiffSegments(originalText: string, newText: string): DiffSegment[] {
  if (originalText === newText) return [{ type: 'equal', text: newText }];
  if (!originalText) return [{ type: 'insert', text: newText }];
  if (!newText) return [{ type: 'delete', text: originalText }];

  const tokenize = (value: string): string[] => value.match(/\s+|[^\s]+/g) || [];
  const left = tokenize(originalText);
  const right = tokenize(newText);
  const dp: number[][] = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      dp[i][j] = left[i - 1] === right[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const raw: DiffSegment[] = [];
  let i = left.length;
  let j = right.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && left[i - 1] === right[j - 1]) {
      raw.push({ type: 'equal', text: left[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'insert', text: right[j - 1] });
      j -= 1;
    } else {
      raw.push({ type: 'delete', text: left[i - 1] });
      i -= 1;
    }
  }

  raw.reverse();
  return raw.reduce<DiffSegment[]>((segments, segment) => {
    const previous = segments[segments.length - 1];
    if (previous?.type === segment.type) previous.text += segment.text;
    else segments.push({ ...segment });
    return segments;
  }, []);
}

export function paragraphText(paragraph: Paragraph): string {
  return paragraph.spans.map((span) => span.text).join('');
}

export function createRevision(
  type: WriterRevisionType,
  paragraphId: string,
  author: string = 'You',
  originalText?: string,
  newText?: string,
  details?: string,
  payload?: WriterRevisionPayload,
): TrackChangeRevision {
  const authorColors: Record<string, string> = {
    You: '#3b82f6',
    Alice: '#10b981',
    Bob: '#f59e0b',
    Reviewer: '#ec4899',
  };
  return {
    id: crypto.randomUUID(),
    paragraphId,
    type,
    author,
    authorColor: authorColors[author] || '#8b5cf6',
    originalText,
    newText,
    timestamp: Date.now(),
    status: 'pending',
    details,
    payload,
  };
}

export function createTextRevision(
  paragraphId: string,
  beforeText: string,
  afterText: string,
  author = 'You',
  details?: string,
): TrackChangeRevision {
  return createRevision(
    afterText.length >= beforeText.length ? 'insert' : 'delete',
    paragraphId,
    author,
    beforeText,
    afterText,
    details,
    { kind: 'text', beforeText, afterText },
  );
}

export function createParagraphTextRevision(
  beforeParagraph: Paragraph,
  afterParagraph: Paragraph,
  author = 'You',
  details?: string,
): TrackChangeRevision {
  if (beforeParagraph.id !== afterParagraph.id) {
    throw new Error('Textrevision benötigt dieselbe Absatz-ID für Vorher/Nachher.');
  }
  const beforeText = paragraphText(beforeParagraph);
  const afterText = paragraphText(afterParagraph);
  return createRevision(
    afterText.length >= beforeText.length ? 'insert' : 'delete',
    afterParagraph.id,
    author,
    beforeText,
    afterText,
    details,
    {
      kind: 'text',
      beforeText,
      afterText,
      beforeParagraph: structuredClone(beforeParagraph),
      afterParagraph: structuredClone(afterParagraph),
    },
  );
}

export function createFormatRevision(
  beforeParagraph: Paragraph,
  afterParagraph: Paragraph,
  author = 'You',
  details?: string,
): TrackChangeRevision {
  return createRevision(
    'format',
    afterParagraph.id,
    author,
    paragraphText(beforeParagraph),
    paragraphText(afterParagraph),
    details,
    {
      kind: 'format',
      beforeParagraph: structuredClone(beforeParagraph),
      afterParagraph: structuredClone(afterParagraph),
    },
  );
}

export function createMoveRevision(
  paragraphId: string,
  beforeOrder: readonly string[],
  afterOrder: readonly string[],
  author = 'You',
  details?: string,
): TrackChangeRevision {
  return createRevision('move', paragraphId, author, undefined, undefined, details, {
    kind: 'move',
    paragraphId,
    beforeOrder: [...beforeOrder],
    afterOrder: [...afterOrder],
  });
}

/**
 * Orders revisions newest first — the order a revert **must** follow.
 *
 * Reverting an older change before a newer one of the same paragraph does not reach
 * the original text: the older revision's "after" text no longer matches, so it is
 * refused as a conflict while a correct order exists. Measured on two edits of one
 * paragraph: `rev1 -> rev2` yields text "B" plus one conflict, `rev2 -> rev1` yields
 * the original "A".
 *
 * `createRevision` stamps `Date.now()`, so revisions created in the same millisecond
 * — a document comparison generates a whole batch in a loop — share a timestamp.
 * A stable sort would then keep the array order, which is *oldest first*. The register
 * index is the tiebreaker, because the revision list is append-only: a higher index
 * is always the newer change.
 *
 * **The input must be in register order** — `revisions.filter(...)` preserves it, and
 * that is how both call sites use this. The function derives the tiebreak from the
 * position in the array it is given, so handing it an already reordered list reverses
 * the tiebreak; it is deliberately not idempotent for such input. Sorting is therefore
 * a filter-and-order step to be applied to the register, not a repair for any order.
 */
export function sortWriterRevisionsNewestFirst(
  revisions: readonly TrackChangeRevision[],
): TrackChangeRevision[] {
  return revisions
    .map((revision, index) => ({ revision, index }))
    .sort((left, right) => (right.revision.timestamp - left.revision.timestamp) || (right.index - left.index))
    .map((entry) => entry.revision);
}

/**
 * Accepts one revision.
 *
 * Only a pending revision can be accepted. Accepting a rejected one would claim a
 * change was kept while the document already has it reverted — the document and
 * the register would contradict each other. All three review surfaces pass only
 * pending revisions and `acceptAllRevisions` filters for pending as well; the
 * guard keeps that property at the source, where a future caller cannot miss it.
 */
export function acceptRevision(
  revisionId: string,
  revisions: readonly TrackChangeRevision[],
): TrackChangeRevision[] {
  return revisions.map((revision) => revision.id === revisionId && revision.status === 'pending'
    ? { ...revision, status: 'accepted' as WriterRevisionStatus, conflictReason: undefined }
    : revision);
}

export function acceptAllRevisions(revisions: readonly TrackChangeRevision[]): TrackChangeRevision[] {
  return revisions.map((revision) => revision.status === 'pending'
    ? { ...revision, status: 'accepted' as WriterRevisionStatus, conflictReason: undefined }
    : revision);
}

/**
 * The most revisions one document keeps (W-053).
 *
 * The register grew without bound: accepted and rejected revisions stayed forever, so a long review
 * process kept every intermediate state of every edit in the file. This is the ceiling.
 */
export const WRITER_MAX_TRACKED_REVISIONS = 2_000;

/**
 * Bounds the revision register (W-053).
 *
 * Two properties matter more than the number:
 *
 *  - **A pending revision is never dropped.** A decided revision is history; a pending one is an open
 *    question, and silently discarding it would hide a change the user has not answered yet.
 *  - **The newest survive.** When there are more decided revisions than the ceiling allows, the oldest
 *    decided ones go first, so the register reads like the recent history it is.
 *
 * The function returns the same array instance when nothing had to be dropped, so a save that changes
 * nothing does not produce a new document revision.
 */
export function boundWriterRevisionRegister(
  revisions: readonly TrackChangeRevision[],
  limit: number = WRITER_MAX_TRACKED_REVISIONS,
): TrackChangeRevision[] {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : WRITER_MAX_TRACKED_REVISIONS;
  if (revisions.length <= boundedLimit) return revisions as TrackChangeRevision[];

  const pending = revisions.filter((revision) => revision.status === 'pending');
  // A register consisting only of pending work cannot be trimmed without losing an open question, so
  // the ceiling yields to that. This is the one documented case where the bound is not reached.
  if (pending.length >= boundedLimit) return revisions as TrackChangeRevision[];

  const decidedBudget = boundedLimit - pending.length;
  const decidedNewestFirst = sortWriterRevisionsNewestFirst(
    revisions.filter((revision) => revision.status !== 'pending'),
  ).slice(0, decidedBudget);
  const keptDecided = new Set(decidedNewestFirst.map((revision) => revision.id));
  return revisions.filter((revision) => revision.status === 'pending' || keptDecided.has(revision.id));
}

export function createTableRevision(
  tableId: string,
  beforeTable: import('../../../types').TableBlockData | undefined,
  afterTable: import('../../../types').TableBlockData | undefined,
  beforeIndex: number | undefined,
  afterIndex: number | undefined,
  paragraphId = '',
  author = 'You',
  details?: string,
): TrackChangeRevision {
  return createRevision(
    'table',
    paragraphId || afterTable?.anchorParagraphId || beforeTable?.anchorParagraphId || tableId,
    author,
    undefined,
    undefined,
    details,
    {
      kind: 'table',
      tableId,
      beforeTable: beforeTable ? structuredClone(beforeTable) : undefined,
      afterTable: afterTable ? structuredClone(afterTable) : undefined,
      beforeIndex,
      afterIndex,
    },
  );
}

export function createPropertyRevision(
  paragraphId: string,
  payload: Extract<WriterRevisionPayload, { kind: 'property' }>,
  author = 'You',
  details?: string,
): TrackChangeRevision {
  return createRevision('property', paragraphId, author, undefined, undefined, details, structuredClone(payload));
}
