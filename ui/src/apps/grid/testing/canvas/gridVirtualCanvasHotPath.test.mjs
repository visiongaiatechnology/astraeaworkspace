// STATUS: PLATIN
// Counter-checks for Grid Paket 42 / AST-0447 — the canvas hot path of a large imported table.
//
// The renderer needs a DOM canvas, so it is checked in two honest ways:
//   1. a measured comparison of the *access pattern* that was replaced (per-cell linear scan of the
//      sheet's comment list) against the pattern that replaced it (one Set + O(1) lookups),
//   2. a source contract asserting the renderer no longer contains the per-cell scans.
// Neither claims a frame time in a browser.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildGridAxisVisibility, isGridAxisIndexVisible } from '../../workbook/gridWorkbookViews';
import { toA1 } from '../../formulas/formula';

const here = dirname(fileURLToPath(import.meta.url));
const grid = resolve(here, '..', '..');

function read(relativePath) {
  return readFileSync(resolve(grid, relativePath), 'utf8');
}
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** A 60 × 25 viewport over a sheet that carries 10,000 unresolved comments. */
const VISIBLE_ROWS = 60;
const VISIBLE_COLS = 25;
const COMMENT_COUNT = 10_000;

function sheetWithComments() {
  const comments = Array.from({ length: COMMENT_COUNT }, (_, index) => ({
    id: `c${index}`,
    coord: `A${1_500 + index}`,
    text: `Kommentar ${index}`,
    createdAt: 0,
    authorId: 'u',
    resolved: false,
  }));
  const sheet = { id: 's1', name: 'Gross', tableObjectId: 't1', tables: [], validations: [], comments };
  return { sheet, comments };
}

function windowCoords() {
  const coords = [];
  for (let row = 0; row < VISIBLE_ROWS; row += 1) {
    for (let col = 0; col < VISIBLE_COLS; col += 1) coords.push(toA1(col, row));
  }
  return coords;
}

describe('Grid canvas comment markers: O(cells x comments) was replaced', () => {
  it('measures the old per-cell scan against the one-Set lookup', () => {
    const { sheet, comments } = sheetWithComments();
    const coords = windowCoords();
    expect(coords.length).toBe(VISIBLE_ROWS * VISIBLE_COLS);

    // Old pattern: for every visible cell, walk the whole comment list of the sheet.
    const oldStarted = Date.now();
    let oldHits = 0;
    for (const coord of coords) {
      if (comments.some((comment) => comment.coord.toUpperCase() === coord && !comment.resolved)) oldHits += 1;
    }
    const oldMs = Date.now() - oldStarted;

    // New pattern: build the Set once per frame, then O(1) per cell.
    const newStarted = Date.now();
    const commentCoords = new Set();
    for (const comment of sheet.comments ?? []) if (!comment.resolved) commentCoords.add(comment.coord.toUpperCase());
    let newHits = 0;
    for (const coord of coords) if (commentCoords.has(coord)) newHits += 1;
    const newMs = Date.now() - newStarted;

    expect(newHits).toBe(oldHits);
    // 1,500 cells x 10,000 comments is 15 million string comparisons; the Set builds once.
    expect(newMs).toBeLessThan(oldMs);
  });

  it('answers the whole visible window with one pass instead of two calls per cell', () => {
    const { sheet } = sheetWithComments();
    const columns = Array.from({ length: VISIBLE_COLS }, (_, index) => index);
    const rows = Array.from({ length: VISIBLE_ROWS }, (_, index) => index);
    const colVisible = buildGridAxisVisibility(sheet, 'col', columns);
    const rowVisible = buildGridAxisVisibility(sheet, 'row', rows);
    expect(colVisible).toHaveLength(VISIBLE_COLS);
    expect(rowVisible).toHaveLength(VISIBLE_ROWS);
    for (const index of columns) expect(colVisible[index]).toBe(isGridAxisIndexVisible(sheet, 'col', index));
    for (const index of rows) expect(rowVisible[index]).toBe(isGridAxisIndexVisible(sheet, 'row', index));
  });

  it('honours hidden axes and collapsed groups in the batch answer', () => {
    const sheet = {
      id: 's2', name: 'S', tableObjectId: 't2', tables: [], validations: [],
      hiddenCols: [2, 3], hiddenRows: [5], colGroups: [{ start: 7, end: 9, collapsed: true }],
    };
    const cols = buildGridAxisVisibility(sheet, 'col', [0, 2, 3, 7, 8, 10]);
    expect(cols).toEqual([true, false, false, false, false, true]);
    const rows = buildGridAxisVisibility(sheet, 'row', [4, 5, 6]);
    expect(rows).toEqual([true, false, true]);
  });
});

describe('Grid canvas renderer source contract', () => {
  it('no longer scans the comment list or the axis visibility per cell', () => {
    const renderer = withoutComments(read('canvas/gridVirtualCanvasRenderer.ts'));
    expect(renderer).toContain('buildGridAxisVisibility');
    expect(renderer).toContain('commentCoords.has(coord)');
    expect(renderer).not.toContain('(sheet.comments ?? []).some(');
    expect(renderer).not.toContain('isGridAxisIndexVisible');
  });

  it('builds the comment index and the axis answers exactly once per frame', () => {
    const renderer = withoutComments(read('canvas/gridVirtualCanvasRenderer.ts'));
    expect(renderer.split('const commentCoords').length - 1).toBe(1);
    expect(renderer.split('buildGridAxisVisibility(').length - 1).toBe(2);
    // The selection ranges keep their single decomposition as well.
    expect(renderer.split('parseGridSelectionBounds(').length - 1).toBe(1);
  });

  it('still derives a bounded visible window from the shared axis-window helper', () => {
    const canvas = withoutComments(read('canvas/GridVirtualCanvas.tsx'));
    // The window helper moved from `platform/rendering/virtualization` to a scale-aware sibling;
    // what must hold is that the window is resolved by a shared helper and that the projection is
    // honoured, never that a particular module name survives.
    expect(canvas).toContain('resolveGridVisibleAxisRange(');
    expect(canvas.split('resolveGridVisibleAxisRange(').length - 1).toBe(2);
    expect(canvas).toContain('rowProjection?.[displayRow]');
  });
});
