// STATUS: PLATIN — The one table-size rule of the Writer.
//
// `AST-0106` asks for *"Tabellengröße wählen können"*. Before this module the Writer had no size at all:
// two call sites built the same literal, one row of three cells, and nothing in the tree could name,
// check or render a table size. This module is that one rule — geometry, cell resolution, keyboard
// movement and the size wording — so the toolbar and the paragraph context menu cannot drift apart.
//
// Measured before writing it: `gridSize | GridSize | sizeGrid | SizeGrid | gridPicker` had **0** hits
// under `ui/src/apps/writer`; the 60 `gridSize` hits elsewhere in `ui/src` are all in `apps/draw/**` and
// describe the *drawing canvas* cell pitch, not a table size. No other app has a size chooser to reuse
// (`apps/publish` uses four number fields in `PublishInspector.tsx:619`, not a hover grid).
export interface WriterTableSize {
  readonly rows: number;
  readonly cols: number;
}

/** The grid the user hovers: 8 rows by 10 columns, the shape the order names as an example. */
export const WRITER_TABLE_SIZE_GRID: WriterTableSize = { rows: 8, cols: 10 };

/** The number of cells the grid renders. */
export const WRITER_TABLE_SIZE_GRID_CELL_COUNT = WRITER_TABLE_SIZE_GRID.rows * WRITER_TABLE_SIZE_GRID.cols;

/** True for a whole number of rows and columns inside the grid — the only sizes this Writer can build. */
export function isWriterTableSize(value: { readonly rows: number; readonly cols: number }): boolean {
  return isGridCount(value.rows, WRITER_TABLE_SIZE_GRID.rows)
    && isGridCount(value.cols, WRITER_TABLE_SIZE_GRID.cols);
}

/**
 * The size a hovered cell stands for.
 *
 * The caller passes the **0-based** cell position it rendered; the answer is the **1-based** table size,
 * because "the third cell means three rows". A position outside the grid is refused rather than clamped:
 * a silently clamped size would insert a table the user did not point at.
 */
export function resolveWriterTableSizeFromCell(row: number, col: number): WriterTableSize | null {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || col < 0) return null;
  if (row >= WRITER_TABLE_SIZE_GRID.rows || col >= WRITER_TABLE_SIZE_GRID.cols) return null;
  return { rows: row + 1, cols: col + 1 };
}

/** The linear cell index a size corresponds to, for the roving focus. */
export function writerTableSizeFocusIndex(size: WriterTableSize): number {
  return (size.rows - 1) * WRITER_TABLE_SIZE_GRID.cols + (size.cols - 1);
}

/** True while the size still covers the cell — this is what "hover to pick" highlights. */
export function writerTableSizeCellIsHighlighted(size: WriterTableSize, cell: WriterTableSize): boolean {
  return cell.rows <= size.rows && cell.cols <= size.cols;
}

/**
 * Where an arrow key takes the focus inside the grid.
 *
 * The focus **stops at the edge** instead of wrapping: a wrap would move the highlight to the other side
 * of the grid while the user holds the key down, and the announced size would jump without the pointer
 * following. `Home` and `End` stay inside their own row for the same reason.
 */
export function moveWriterTableSizeFocus(
  index: number,
  key: string,
  grid: WriterTableSize = WRITER_TABLE_SIZE_GRID,
): number {
  const total = grid.rows * grid.cols;
  if (!Number.isInteger(index) || index < 0 || index >= total) return 0;
  const row = Math.floor(index / grid.cols);
  const col = index % grid.cols;
  switch (key) {
    case 'ArrowLeft':
      return col > 0 ? index - 1 : index;
    case 'ArrowRight':
      return col < grid.cols - 1 ? index + 1 : index;
    case 'ArrowUp':
      return row > 0 ? index - grid.cols : index;
    case 'ArrowDown':
      return row < grid.rows - 1 ? index + grid.cols : index;
    case 'Home':
      return row * grid.cols;
    case 'End':
      return row * grid.cols + grid.cols - 1;
    default:
      return index;
  }
}

/**
 * The size as one word: **columns × rows**, the order every table gallery uses (`5 × 2` = five columns,
 * two rows). Digits and the multiplication sign are the same in all seven shipped locales, so the size
 * needs no entry in a copy register — only the surrounding sentence does, and that stays with the
 * surface that says it.
 */
export function describeWriterTableSize(size: WriterTableSize): string {
  return `${size.cols} × ${size.rows}`;
}

function isGridCount(value: number, limit: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= limit;
}
