// STATUS: DIAMANT VGT SUPREME — Stable-ID Document Compare & Multi-Reviewer Combine Engine
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { TrackChangeRevision } from '../../types';
import {
  createFormatRevision,
  createMoveRevision,
  createRevision,
  createTextRevision,
  paragraphText,
} from '../revisions/track-changes/writerTrackChangesEngine';

export interface DocumentCompareStats {
  insertedCount: number;
  deletedCount: number;
  modifiedCount: number;
  identicalCount: number;
}

export interface DocumentCompareResult {
  mergedParagraphs: Paragraph[];
  generatedRevisions: TrackChangeRevision[];
  stats: DocumentCompareStats;
}

export interface ReviewerDocumentInput {
  reviewer: string;
  paragraphs: readonly Paragraph[];
}

export interface WriterCombineConflict {
  paragraphId: string;
  reviewers: string[];
  reason: 'concurrent-edit' | 'delete-vs-edit' | 'concurrent-insert';
}

export interface WriterCombineResult extends DocumentCompareResult {
  conflicts: WriterCombineConflict[];
}

function sameParagraph(left: Paragraph, right: Paragraph): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneParagraph(paragraph: Paragraph): Paragraph {
  return structuredClone(paragraph);
}

function createDeletedParagraphRevision(
  paragraph: Paragraph,
  index: number,
  paragraphs: readonly Paragraph[],
  reviewer: string,
): TrackChangeRevision {
  return createRevision(
    'delete',
    paragraph.id,
    reviewer,
    paragraphText(paragraph),
    '',
    'Absatz gelöscht via Dokumentvergleich',
    {
      kind: 'paragraph-delete',
      paragraph: cloneParagraph(paragraph),
      index,
      previousParagraphId: paragraphs[index - 1]?.id,
      nextParagraphId: paragraphs[index + 1]?.id,
    },
  );
}

function createInsertedParagraphRevision(
  paragraph: Paragraph,
  index: number,
  reviewer: string,
): TrackChangeRevision {
  return createRevision(
    'insert',
    paragraph.id,
    reviewer,
    '',
    paragraphText(paragraph),
    'Absatz hinzugefügt via Dokumentvergleich',
    { kind: 'paragraph-insert', paragraph: cloneParagraph(paragraph), index },
  );
}

export function compareDocuments(
  originalParagraphs: readonly Paragraph[],
  revisedParagraphs: readonly Paragraph[],
  reviewerName = 'Document Compare',
): DocumentCompareResult {
  const originalById = new Map(originalParagraphs.map((paragraph) => [paragraph.id, paragraph]));
  const revisedById = new Map(revisedParagraphs.map((paragraph) => [paragraph.id, paragraph]));
  const mergedParagraphs = revisedParagraphs.map(cloneParagraph);
  const generatedRevisions: TrackChangeRevision[] = [];
  let insertedCount = 0;
  let deletedCount = 0;
  let modifiedCount = 0;
  let identicalCount = 0;

  for (let index = 0; index < originalParagraphs.length; index++) {
    const original = originalParagraphs[index];
    const revised = revisedById.get(original.id);
    if (!revised) {
      deletedCount += 1;
      generatedRevisions.push(createDeletedParagraphRevision(original, index, originalParagraphs, reviewerName));
      continue;
    }
    if (sameParagraph(original, revised)) {
      identicalCount += 1;
      continue;
    }
    modifiedCount += 1;
    const originalText = paragraphText(original);
    const revisedText = paragraphText(revised);
    generatedRevisions.push(
      originalText === revisedText
        ? createFormatRevision(original, revised, reviewerName, 'Absatzformatierung via Dokumentvergleich')
        : createTextRevision(original.id, originalText, revisedText, reviewerName, 'Absatzänderung via Dokumentvergleich'),
    );
  }

  for (let index = 0; index < revisedParagraphs.length; index++) {
    const revised = revisedParagraphs[index];
    if (originalById.has(revised.id)) continue;
    insertedCount += 1;
    generatedRevisions.push(createInsertedParagraphRevision(revised, index, reviewerName));
  }

  const originalOrder = originalParagraphs.map((paragraph) => paragraph.id);
  const revisedOrder = revisedParagraphs.map((paragraph) => paragraph.id);
  const sameParagraphSet = originalOrder.length === revisedOrder.length
    && originalOrder.every((id) => revisedById.has(id));
  if (sameParagraphSet && originalOrder.some((id, index) => revisedOrder[index] !== id)) {
    const movedParagraphId = revisedOrder.find((id, index) => originalOrder[index] !== id) ?? revisedOrder[0] ?? '';
    generatedRevisions.push(createMoveRevision(
      movedParagraphId,
      originalOrder,
      revisedOrder,
      reviewerName,
      'Absatzreihenfolge via Dokumentvergleich geändert',
    ));
    modifiedCount += 1;
    identicalCount = Math.max(0, identicalCount - 1);
  }

  return {
    mergedParagraphs,
    generatedRevisions,
    stats: { insertedCount, deletedCount, modifiedCount, identicalCount },
  };
}

interface ReviewerChange {
  reviewer: string;
  paragraphId: string;
  kind: 'insert' | 'delete' | 'edit' | 'move';
  paragraph?: Paragraph;
  order?: string[];
  revision: TrackChangeRevision;
}

function reviewerChanges(
  baseParagraphs: readonly Paragraph[],
  input: ReviewerDocumentInput,
): ReviewerChange[] {
  const comparison = compareDocuments(baseParagraphs, input.paragraphs, input.reviewer);
  const revisedById = new Map(input.paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  return comparison.generatedRevisions.map((revision) => {
    const payload = revision.payload;
    if (payload?.kind === 'paragraph-insert') {
      return { reviewer: input.reviewer, paragraphId: revision.paragraphId, kind: 'insert' as const, paragraph: payload.paragraph, revision };
    }
    if (payload?.kind === 'paragraph-delete') {
      return { reviewer: input.reviewer, paragraphId: revision.paragraphId, kind: 'delete' as const, revision };
    }
    if (payload?.kind === 'move') {
      return {
        reviewer: input.reviewer,
        paragraphId: '__writer_document_order__',
        kind: 'move' as const,
        order: [...payload.afterOrder],
        revision,
      };
    }
    return {
      reviewer: input.reviewer,
      paragraphId: revision.paragraphId,
      kind: 'edit' as const,
      paragraph: revisedById.get(revision.paragraphId),
      revision,
    };
  });
}

export function combineReviewerDocuments(
  baseParagraphs: readonly Paragraph[],
  reviewerDocuments: readonly ReviewerDocumentInput[],
): WriterCombineResult {
  const changes = reviewerDocuments.flatMap((input) => reviewerChanges(baseParagraphs, input));
  const moveChanges = changes.filter((change) => change.kind === 'move');
  const byParagraphId = new Map<string, ReviewerChange[]>();
  for (const change of changes) {
    if (change.kind === 'move') continue;
    const bucket = byParagraphId.get(change.paragraphId) ?? [];
    bucket.push(change);
    byParagraphId.set(change.paragraphId, bucket);
  }

  let mergedParagraphs = baseParagraphs.map(cloneParagraph);
  const generatedRevisions: TrackChangeRevision[] = [];
  const conflicts: WriterCombineConflict[] = [];
  let insertedCount = 0;
  let deletedCount = 0;
  let modifiedCount = 0;

  for (const [paragraphId, paragraphChanges] of byParagraphId) {
    const reviewers = Array.from(new Set(paragraphChanges.map((change) => change.reviewer)));
    const kinds = new Set(paragraphChanges.map((change) => change.kind));
    const serializedTargets = new Set(
      paragraphChanges
        .filter((change) => change.paragraph)
        .map((change) => JSON.stringify(change.paragraph)),
    );

    if (kinds.size > 1) {
      conflicts.push({ paragraphId, reviewers, reason: kinds.has('delete') ? 'delete-vs-edit' : 'concurrent-edit' });
      continue;
    }
    if (serializedTargets.size > 1) {
      conflicts.push({
        paragraphId,
        reviewers,
        reason: paragraphChanges[0]?.kind === 'insert' ? 'concurrent-insert' : 'concurrent-edit',
      });
      continue;
    }

    const selected = paragraphChanges[0];
    if (!selected) continue;
    if (selected.kind === 'delete') {
      const index = mergedParagraphs.findIndex((paragraph) => paragraph.id === paragraphId);
      if (index >= 0) mergedParagraphs.splice(index, 1);
      deletedCount += 1;
      generatedRevisions.push(selected.revision);
      continue;
    }
    if (!selected.paragraph) continue;

    if (selected.kind === 'insert') {
      insertedCount += 1;
      const payload = selected.revision.payload;
      const insertAt = payload?.kind === 'paragraph-insert'
        ? Math.min(payload.index, mergedParagraphs.length)
        : mergedParagraphs.length;
      mergedParagraphs.splice(insertAt, 0, cloneParagraph(selected.paragraph));
      generatedRevisions.push(selected.revision);
      continue;
    }

    const index = mergedParagraphs.findIndex((paragraph) => paragraph.id === paragraphId);
    if (index < 0) continue;
    modifiedCount += 1;
    mergedParagraphs[index] = cloneParagraph(selected.paragraph);
    generatedRevisions.push(selected.revision);
  }

  if (moveChanges.length > 0) {
    const reviewers = Array.from(new Set(moveChanges.map((change) => change.reviewer)));
    const targetOrders = new Map<string, string[]>();
    for (const change of moveChanges) {
      if (change.order) targetOrders.set(JSON.stringify(change.order), change.order);
    }
    if (targetOrders.size > 1) {
      conflicts.push({ paragraphId: '__writer_document_order__', reviewers, reason: 'concurrent-edit' });
    } else {
      const targetOrder = targetOrders.values().next().value as string[] | undefined;
      const selectedMove = moveChanges[0];
      if (targetOrder && selectedMove) {
        const currentIds = new Set(mergedParagraphs.map((paragraph) => paragraph.id));
        const missingFromMerged = targetOrder.some((id) => !currentIds.has(id));
        if (missingFromMerged) {
          conflicts.push({ paragraphId: '__writer_document_order__', reviewers, reason: 'delete-vs-edit' });
        } else {
          const byId = new Map(mergedParagraphs.map((paragraph) => [paragraph.id, paragraph]));
          let orderIndex = 0;
          mergedParagraphs = mergedParagraphs.map((paragraph) => {
            if (!targetOrder.includes(paragraph.id)) return paragraph;
            const nextId = targetOrder[orderIndex++];
            return byId.get(nextId) ?? paragraph;
          });
          generatedRevisions.push(selectedMove.revision);
          modifiedCount += 1;
        }
      }
    }
  }

  return {
    mergedParagraphs,
    generatedRevisions,
    conflicts,
    stats: {
      insertedCount,
      deletedCount,
      modifiedCount,
      identicalCount: Math.max(0, baseParagraphs.length - deletedCount - modifiedCount),
    },
  };
}
