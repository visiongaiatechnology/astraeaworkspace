// Contract test: the virtual canvas must use the shared axis/freeze/merge geometry
// and must not implement a second keyboard or commit path of its own.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('GridVirtualCanvas geometry contract', () => {
  const canvas = read('../../canvas/GridVirtualCanvas.tsx');

  it('derives window, pointer mapping and freeze state from the shared modules', () => {
    expect(canvas).toContain('buildGridAxisScale');
    expect(canvas).toContain('resolveGridVisibleAxisRange');
    expect(canvas).toContain('computeGridFreezeLayout');
    expect(canvas).toContain('resolveGridPointerTarget');
    expect(canvas).toContain('buildGridMergeIndex');
    expect(canvas).toContain('parseA1');
  });

  it('no longer computes a uniform-only window or a uniform-only hit test', () => {
    expect(canvas).not.toContain('computeVirtualWindow');
    expect(canvas).not.toContain('const colWidth =');
    expect(canvas).not.toContain('getCellFromMouse');
  });

  it('owns no keyboard handling and no duplicate commit path', () => {
    expect(canvas).not.toContain('onKeyDown');
    expect(canvas).not.toContain('onCommitValue');
  });
});

describe('GridVirtualCanvas renderer contract', () => {
  const renderer = read('../../canvas/gridVirtualCanvasRenderer.ts');

  it('renders through the axis scales instead of a single scalar width', () => {
    expect(renderer).toContain('colScale.offset');
    expect(renderer).toContain('rowScale.offset');
    expect(renderer).not.toContain('* colWidth');
    expect(renderer).not.toContain('* rowHeight');
  });

  it('paints frozen bands on top of the scrolling body with clipping', () => {
    expect(renderer).toContain('freeze.frozenRows');
    expect(renderer).toContain('freeze.frozenCols');
    expect(renderer).toContain('ctx.clip()');
    expect(renderer).toContain('bodyTop');
    expect(renderer).toContain('bodyLeft');
    expect(renderer).toContain('originByCovered');
  });
});

describe('Grid AutoFill single formula shifter contract', () => {
  const autoFill = read('../../editing/gridAutoFill.ts');

  it('delegates formula shifting to the canonical selection engine', () => {
    expect(autoFill).toContain("from './gridSelection'");
    expect(autoFill).toContain('shiftCanonicalA1References(formula, colDelta, rowDelta)');
    // The removed private implementation rewrote every A1-shaped token, including
    // identifiers and string literals, through a regex replace.
    expect(autoFill).not.toContain('formula.replace(');
  });
});
