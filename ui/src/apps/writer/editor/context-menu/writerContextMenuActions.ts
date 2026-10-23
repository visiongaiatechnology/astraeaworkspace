// STATUS: PLATIN — The paragraph-context-menu actions that touch the document, in one testable place.
//
// ## Why this is a factory and not three inline arrow functions
//
// `AST-0096` asks for "Absatz davor/darunter einfügen" and `AST-0106` for a real size choice. Written as
// inline arrows inside `WriterEditorContextMenu.tsx`, neither can be **operated** by a witness without a
// DOM: the component reads the whole editor state. As a factory over a small host, the three handlers are
// driven directly — which is the difference between "the label is in the markup" and "the entry does what
// it says".
//
// The two paragraph entries are **not** new behaviour: they call the `handleAddParagraph(afterIdx)` that
// already inserts a paragraph (`useWriterParagraphOperations.ts:136`) and already accepts `-1` for "before
// the very first paragraph" (`writerParagraphInsert.ts:15`). Only the menu entries were missing.
import type { WriterTableBlockData } from '../../../../shared/contracts/writer/workspaceWriterTable';
import { buildWriterTableBlock } from '../../tables/picker/writerTableInsertPlan';
import type { WriterTableSize } from '../../tables/picker/writerTableSize';

export interface WriterContextMenuInsertHost {
  /** How many paragraphs the document has; `0` disables both paragraph entries. */
  readonly paragraphCount: number;
  /** The paragraph the menu was opened on, or `-1` when the right-click missed every paragraph. */
  readonly targetParagraphIndex: number;
  readonly anchorParagraphId?: string;
  /** The existing paragraph insertion of the editing layer (`handleAddParagraph`). */
  readonly addParagraph: (afterIdx: number) => void;
  readonly insertTable: (table: WriterTableBlockData) => void;
}

export interface WriterContextMenuInsertActions {
  readonly onInsertParagraphBefore: () => void;
  readonly onInsertParagraphAfter: () => void;
  readonly onInsertTable: (size: WriterTableSize) => void;
}

export interface WriterParagraphInsertTarget {
  /** The index the new paragraph follows, so that it lands **before** the targeted paragraph. */
  readonly before: number;
  /** The index the new paragraph follows, so that it lands **under** the targeted paragraph. */
  readonly after: number;
}

/**
 * Turns "which paragraph was clicked" into the two `afterIdx` values the editing layer expects.
 *
 * Three cases, and they are deliberately different:
 *
 * * **A paragraph was clicked** — `before` follows its predecessor (`-1` when it is the first one, which
 *   `planWriterParagraphInsert` reads as "the very beginning"), `after` follows the paragraph itself.
 * * **The right-click missed every paragraph** (`-1`) — there is no "before" reference, so **both**
 *   entries append. Appending is what the neighbouring paste entry already does.
 * * **The stored index lies past the end** (the document shrank between the right-click and the menu) —
 *   the last paragraph is meant, so both values resolve against it instead of the stale index.
 *
 * An empty document resolves to `-1`, which is the insert-at-the-beginning path.
 */
export function resolveWriterParagraphInsertTarget(
  targetParagraphIndex: number,
  paragraphCount: number,
): WriterParagraphInsertTarget {
  if (paragraphCount <= 0) return { before: -1, after: -1 };
  if (targetParagraphIndex < 0) return { before: paragraphCount - 1, after: paragraphCount - 1 };
  const target = targetParagraphIndex < paragraphCount ? targetParagraphIndex : paragraphCount - 1;
  return { before: target - 1, after: target };
}

export function createWriterContextMenuInsertActions(
  host: WriterContextMenuInsertHost,
): WriterContextMenuInsertActions {
  const target = resolveWriterParagraphInsertTarget(host.targetParagraphIndex, host.paragraphCount);
  return {
    onInsertParagraphBefore: () => host.addParagraph(target.before),
    onInsertParagraphAfter: () => host.addParagraph(target.after),
    onInsertTable: (size) => host.insertTable(
      buildWriterTableBlock({ size, anchorParagraphId: host.anchorParagraphId }),
    ),
  };
}
