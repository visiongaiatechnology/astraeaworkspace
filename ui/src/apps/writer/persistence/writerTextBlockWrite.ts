// STATUS: DIAMANT VGT SUPREME — Canonical TextBlock write planning for Writer persistence
import type { Paragraph, TextBlockObject, WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';

export interface WriterTextBlockWrite {
  readonly textBlockId: string;
  readonly rootObjectIds: string[];
  readonly objects: Record<string, WorkspaceObject>;
}

export interface WriterTextBlockWriteInput {
  readonly document: WorkspaceDocument;
  readonly primaryTextBlockId?: string | undefined;
  readonly existingTextBlock?: TextBlockObject | undefined;
  readonly paragraphs: readonly Paragraph[];
}

/**
 * Deterministic, collision-free primary text block id for a document. Deriving
 * it from the document id keeps the identity stable across save/reopen cycles
 * instead of minting a random id on every write.
 */
export function resolveWriterTextBlockId(document: WorkspaceDocument): string {
  return `tb-${document.id}`;
}

/**
 * Plans the object-model write for a paragraph mutation.
 *
 * A document that was created without a TextBlock (empty `.vdoc`, imported
 * fragment, cleared document) must still persist its first paragraph. The
 * previous implementation returned silently in that case, so the user typed
 * into a document that never stored anything. This planner always returns a
 * complete, canonical write, or `null` when there is genuinely nothing to
 * store.
 */
export function planWriterTextBlockWrite(input: WriterTextBlockWriteInput): WriterTextBlockWrite | null {
  const { document, existingTextBlock, paragraphs } = input;
  if (paragraphs.length === 0 && !existingTextBlock) return null;

  const existingId = existingTextBlock?.id;
  const resolvedId = input.primaryTextBlockId ?? existingId ?? resolveWriterTextBlockId(document);
  const textBlock: TextBlockObject = existingTextBlock
    ? { ...existingTextBlock, id: resolvedId, paragraphs: [...paragraphs] }
    : { id: resolvedId, paragraphs: [...paragraphs] };

  const rootObjectIds = document.root_object_ids.includes(resolvedId)
    ? [...document.root_object_ids]
    : [
        resolvedId,
        ...document.root_object_ids.filter((id) => document.objects[id]?.type !== 'TextBlock'),
      ];

  return {
    textBlockId: resolvedId,
    rootObjectIds,
    objects: {
      ...document.objects,
      [resolvedId]: { type: 'TextBlock', data: textBlock },
    },
  };
}
