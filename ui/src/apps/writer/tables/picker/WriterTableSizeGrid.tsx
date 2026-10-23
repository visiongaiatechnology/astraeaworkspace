// STATUS: PLATIN — The one table-size grid of the Writer, shared by the toolbar and the context menu.
//
// ## Why one component and not two
//
// Two surfaces insert a table (the formatting ribbon and the paragraph context menu) and both used to
// build the same fixed 3 × 1 literal. This session has found nine times that a second rule for one thing
// drifts; so the size choice is built **once** and both surfaces mount it. The surfaces differ only in
// their wording (`label`, `hint`) and in who receives the picked size (`onPick`).
//
// ## What the states are
//
// * **Hover** — pointing at a cell sets the announced size and highlights every cell up to it.
// * **Focus** — exactly one cell is in the tab order (`tabindex="0"`, the rest `-1`); the arrow keys,
//   `Home` and `End` move that focus inside the grid, and focusing a cell highlights it, so a keyboard
//   user sees the same picture as a pointer user.
// * **Disabled** — every cell is `disabled`, carries `cursor-not-allowed` and dims; the grid stays
//   *visible* instead of disappearing, so a read-only document does not look like a missing feature.
//
// ## What this component cannot prove
//
// `renderToStaticMarkup` renders once and never fires an event, so the **click** that inserts the table
// is not exercised here — the witness drives `onPick`'s callers instead (see
// `writerContextMenuInsertActions.test.ts` and `writerTableInsertPlan.size.test.ts`). The reachability of
// a cell by a real pointer remains `NOT_TESTED`.
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  describeWriterTableSize,
  moveWriterTableSizeFocus,
  resolveWriterTableSizeFromCell,
  WRITER_TABLE_SIZE_GRID,
  writerTableSizeCellIsHighlighted,
  type WriterTableSize,
} from './writerTableSize';

export interface WriterTableSizeGridProps {
  /** The grid's accessible name, in the wording of the surface that mounts it. */
  readonly label: string;
  /** The sentence that explains how to pick, in the wording of the surface that mounts it. */
  readonly hint: string;
  /** Receives the size of the cell the user picked. */
  readonly onPick: (size: WriterTableSize) => void;
  readonly disabled?: boolean;
  /** Move the keyboard focus into the first cell on mount (the toolbar's popover does this). */
  readonly autoFocus?: boolean;
}

const MOVEMENT_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

const CELL_CLASS = [
  'h-3 w-3 rounded-[2px] border transition-colors motion-reduce:transition-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
  'hover:border-blue-400',
].join(' ');

export function WriterTableSizeGrid({
  label,
  hint,
  onPick,
  disabled = false,
  autoFocus = false,
}: WriterTableSizeGridProps): React.ReactElement {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [hoveredSize, setHoveredSize] = useState<WriterTableSize | null>(null);
  const hintId = useId();
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!autoFocus) return;
    cellRefs.current[0]?.focus();
  }, [autoFocus]);

  const focusedCell = resolveWriterTableSizeFromCell(
    Math.floor(focusedIndex / WRITER_TABLE_SIZE_GRID.cols),
    focusedIndex % WRITER_TABLE_SIZE_GRID.cols,
  );
  const announced = hoveredSize ?? focusedCell;

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!MOVEMENT_KEYS.includes(event.key)) return;
    event.preventDefault();
    const next = moveWriterTableSizeFocus(focusedIndex, event.key, WRITER_TABLE_SIZE_GRID);
    setFocusedIndex(next);
    cellRefs.current[next]?.focus();
  }, [focusedIndex]);

  // The ref array is written by each cell's callback ref, so `cellRefs.current[index]` is the element the
  // arrow keys move to. No second lookup table is kept.
  const rows = Array.from({ length: WRITER_TABLE_SIZE_GRID.rows }, (_, row) => row);
  const cols = Array.from({ length: WRITER_TABLE_SIZE_GRID.cols }, (_, col) => col);

  return (
    <div data-writer-table-size-widget={describeWriterTableSize(WRITER_TABLE_SIZE_GRID)}>
      <p id={hintId} className="sr-only">{hint}</p>
      <p
        aria-live="polite"
        data-writer-table-size-announcement={announced ? describeWriterTableSize(announced) : ''}
        className="mb-1 text-[0.625rem] font-mono text-slate-300"
      >
        {announced ? `${label}: ${describeWriterTableSize(announced)}` : label}
      </p>
      <div
        role="grid"
        aria-label={label}
        aria-describedby={hintId}
        aria-readonly={disabled ? 'true' : undefined}
        data-writer-table-size-grid={`${WRITER_TABLE_SIZE_GRID.rows}x${WRITER_TABLE_SIZE_GRID.cols}`}
        data-writer-table-size-disabled={disabled ? 'true' : 'false'}
        className="flex flex-col gap-[3px]"
        onKeyDown={handleKeyDown}
      >
        {rows.map((row) => (
          <div role="row" key={row} className="flex gap-[3px]">
            {cols.map((col) => {
              const size: WriterTableSize = { rows: row + 1, cols: col + 1 };
              const index = row * WRITER_TABLE_SIZE_GRID.cols + col;
              const highlighted = hoveredSize !== null && writerTableSizeCellIsHighlighted(hoveredSize, size);
              return (
                <span role="gridcell" key={col}>
                  <button
                    type="button"
                    ref={(element) => { cellRefs.current[index] = element; }}
                    disabled={disabled}
                    tabIndex={index === focusedIndex ? 0 : -1}
                    aria-label={describeWriterTableSize(size)}
                    data-writer-table-size-cell={`${size.rows}x${size.cols}`}
                    data-writer-table-size-highlighted={highlighted ? 'true' : 'false'}
                    className={`${CELL_CLASS} ${
                      disabled
                        ? 'cursor-not-allowed border-white/10 bg-slate-800/40 opacity-40'
                        : highlighted
                          ? 'border-blue-400 bg-blue-500/40'
                          : 'border-white/20 bg-slate-800/80'
                    }`}
                    onMouseEnter={() => setHoveredSize(size)}
                    onFocus={() => {
                      setFocusedIndex(index);
                      setHoveredSize(size);
                    }}
                    onClick={() => onPick(size)}
                  />
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
