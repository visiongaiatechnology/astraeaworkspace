// STATUS: DIAMANT VGT SUPREME — Deterministic Writer Snapshot → SyncGraph Operation Derivation
import type { Paragraph, TextBlockObject, WorkspaceDocument, WorkspaceObject } from '../../../../shared/contracts/workspace';
import type { WriterSyncOperation } from '../types/writerCollaborationTypes';

export class WriterSyncDerivationError extends Error {}

interface WriterTextBlockSnapshot {
  blockId: string;
  block: TextBlockObject;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolvePrimaryTextBlock(document: WorkspaceDocument): WriterTextBlockSnapshot {
  const blockId = document.root_object_ids.find((id) => document.objects[id]?.type === 'TextBlock');
  if (!blockId) throw new WriterSyncDerivationError('Writer document has no primary TextBlock');
  const object = document.objects[blockId];
  if (!object || object.type !== 'TextBlock') throw new WriterSyncDerivationError('Writer primary TextBlock is unavailable');
  return { blockId, block: object.data };
}

function assertStableDocumentIdentity(before: WorkspaceDocument, after: WorkspaceDocument): void {
  if (before.id !== after.id) throw new WriterSyncDerivationError('Cannot derive collaboration operations across different documents');
  if (before.kind !== 'Writer' || after.kind !== 'Writer') throw new WriterSyncDerivationError('Writer collaboration only accepts Writer documents');
  if (before.title !== after.title || before.theme_id !== after.theme_id || before.schema_version !== after.schema_version) {
    throw new WriterSyncDerivationError('Writer document metadata changed outside the collaboration operation model');
  }
}

function assertNonWriterObjectsStable(
  before: WorkspaceDocument,
  after: WorkspaceDocument,
  primaryBlockId: string,
): void {
  const objectIds = new Set([...Object.keys(before.objects), ...Object.keys(after.objects)]);
  for (const objectId of objectIds) {
    if (objectId === primaryBlockId) continue;
    if (!jsonEqual(before.objects[objectId], after.objects[objectId])) {
      throw new WriterSyncDerivationError(`Workspace object '${objectId}' changed outside the Writer collaboration operation model`);
    }
  }
  if (!jsonEqual(before.root_object_ids, after.root_object_ids)) {
    throw new WriterSyncDerivationError('Writer root object order changed outside the collaboration operation model');
  }
}

function deriveParagraphOperations(
  blockId: string,
  beforeParagraphs: readonly Paragraph[],
  afterParagraphs: readonly Paragraph[],
): WriterSyncOperation[] {
  const operations: WriterSyncOperation[] = [];
  const working = beforeParagraphs.map(cloneValue);
  const afterIds = new Set(afterParagraphs.map((paragraph) => paragraph.id));

  for (let index = working.length - 1; index >= 0; index -= 1) {
    const paragraph = working[index];
    if (!afterIds.has(paragraph.id)) {
      operations.push({
        DeleteParagraph: {
          block_id: blockId,
          paragraph_id: paragraph.id,
          index,
          cached_paragraph: cloneValue(paragraph),
        },
      });
      working.splice(index, 1);
    }
  }

  for (let targetIndex = 0; targetIndex < afterParagraphs.length; targetIndex += 1) {
    const target = afterParagraphs[targetIndex];
    const existingIndex = working.findIndex((paragraph) => paragraph.id === target.id);
    if (existingIndex === -1) {
      operations.push({
        InsertParagraph: {
          block_id: blockId,
          index: targetIndex,
          paragraph: cloneValue(target),
        },
      });
      working.splice(targetIndex, 0, cloneValue(target));
    }
  }

  for (let targetIndex = 0; targetIndex < afterParagraphs.length; targetIndex += 1) {
    const target = afterParagraphs[targetIndex];
    const currentIndex = working.findIndex((paragraph) => paragraph.id === target.id);
    if (currentIndex === -1) {
      throw new WriterSyncDerivationError(`Paragraph '${target.id}' disappeared while deriving collaboration operations`);
    }
    if (currentIndex !== targetIndex) {
      operations.push({
        MoveParagraph: {
          block_id: blockId,
          paragraph_id: target.id,
          from_index: currentIndex,
          to_index: targetIndex,
        },
      });
      const [moved] = working.splice(currentIndex, 1);
      if (!moved) throw new WriterSyncDerivationError(`Paragraph '${target.id}' could not be moved`);
      working.splice(targetIndex, 0, moved);
    }
  }

  for (let index = 0; index < afterParagraphs.length; index += 1) {
    const beforeParagraph = working[index];
    const afterParagraph = afterParagraphs[index];
    if (!beforeParagraph || beforeParagraph.id !== afterParagraph.id) {
      throw new WriterSyncDerivationError('Paragraph order diverged during operation derivation');
    }
    if (!jsonEqual(beforeParagraph, afterParagraph)) {
      operations.push({
        ReplaceParagraph: {
          block_id: blockId,
          paragraph_id: afterParagraph.id,
          before: cloneValue(beforeParagraph),
          after: cloneValue(afterParagraph),
        },
      });
      working[index] = cloneValue(afterParagraph);
    }
  }

  return operations;
}

export function deriveWriterSyncOperations(
  before: WorkspaceDocument,
  after: WorkspaceDocument,
): WriterSyncOperation[] {
  assertStableDocumentIdentity(before, after);
  const beforeText = resolvePrimaryTextBlock(before);
  const afterText = resolvePrimaryTextBlock(after);
  if (beforeText.blockId !== afterText.blockId) {
    throw new WriterSyncDerivationError('Primary Writer TextBlock identity changed');
  }
  assertNonWriterObjectsStable(before, after, beforeText.blockId);

  const operations = deriveParagraphOperations(
    beforeText.blockId,
    beforeText.block.paragraphs,
    afterText.block.paragraphs,
  );

  const beforeWriterData = before.writerData ?? {};
  const afterWriterData = after.writerData ?? {};
  const writerFields = new Set([...Object.keys(beforeWriterData), ...Object.keys(afterWriterData)]);
  for (const field of Array.from(writerFields).sort()) {
    const beforeValue = (beforeWriterData as Record<string, unknown>)[field];
    const afterValue = (afterWriterData as Record<string, unknown>)[field];
    if (jsonEqual(beforeValue ?? null, afterValue ?? null)) continue;
    operations.push({
      SetWriterDataField: {
        field,
        before: beforeValue === undefined ? null : cloneValue(beforeValue),
        after: afterValue === undefined ? null : cloneValue(afterValue),
      },
    });
  }

  return operations;
}

export function getWriterPrimaryTextBlock(document: WorkspaceDocument): { id: string; object: WorkspaceObject } {
  const snapshot = resolvePrimaryTextBlock(document);
  const object = document.objects[snapshot.blockId];
  if (!object) throw new WriterSyncDerivationError('Primary Writer object disappeared');
  return { id: snapshot.blockId, object };
}
