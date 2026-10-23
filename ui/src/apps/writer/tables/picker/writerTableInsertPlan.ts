// STATUS: PLATIN — The one place that builds the table block an insertion command inserts.
//
// The table was written out twice as a literal — `WriterEditor.tsx:161` and `WriterEditorContextMenu.tsx:83`
// — one row of three cells with the same fixture text. Two copies of one construction drift apart, and
// neither copy was reachable from a test, which is why the fixed 3 × 1 shape survived unnoticed (`AST-0106`).
// This module is now the single source, and the size is a required input instead of a constant.
import type { WriterTableBlockData } from '../../../../shared/contracts/writer/workspaceWriterTable';
import { isWriterTableSize, type WriterTableSize } from './writerTableSize';

export interface WriterTableBlockRequest {
  /** How large the inserted table is; the user picks it in the size grid. */
  readonly size: WriterTableSize;
  /** The paragraph the table is anchored to; absent while no paragraph is active. */
  readonly anchorParagraphId?: string;
}

/**
 * Builds the table block for a requested size.
 *
 * The cell text is empty and the column headers are numbered: the old literal carried sample content
 * ("Eintrag A", "100", "Aktiv") because it was a fixed demo table, but a table the user sizes themselves
 * has no sample data to carry. An out-of-range size throws rather than being clamped — the grid cannot
 * produce one, so a caller that does is a defect that must be visible, not silently resized.
 */
export function buildWriterTableBlock(request: WriterTableBlockRequest): WriterTableBlockData {
  const { size } = request;
  if (!isWriterTableSize(size)) {
    throw new Error(`writer-table-size-out-of-range:${size.rows}x${size.cols}`);
  }
  return {
    id: crypto.randomUUID(),
    anchorParagraphId: request.anchorParagraphId,
    columns: Array.from({ length: size.cols }, (_, col) => `Spalte ${col + 1}`),
    rows: Array.from({ length: size.rows }, () => ({
      id: crypto.randomUUID(),
      cells: Array.from({ length: size.cols }, () => ({ id: crypto.randomUUID(), content: '' })),
    })),
  };
}
