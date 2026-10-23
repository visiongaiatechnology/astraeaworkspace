import { describe, expect, it, vi } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { drawGridCanvasSparkline } from '../../canvas/gridCanvasSparkline';

function createCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('Grid canvas sparkline hostile persisted values', () => {
  it('rejects oversized value arrays before touching the canvas context', () => {
    const context = createCanvasContext();
    const cell = { value: '', sparkline: Array.from({ length: 2_049 }, (_, index) => index) } satisfies GridCell;

    drawGridCanvasSparkline(context, cell, 0, 0, 100, 24);

    expect(context.save).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it('rejects non-finite or non-numeric persisted points before drawing', () => {
    for (const sparkline of [[1, Number.NaN], [1, Number.POSITIVE_INFINITY], [1, '2']]) {
      const context = createCanvasContext();
      const cell = { value: '', sparkline } as unknown as GridCell;

      drawGridCanvasSparkline(context, cell, 0, 0, 100, 24);

      expect(context.save).not.toHaveBeenCalled();
      expect(context.fillRect).not.toHaveBeenCalled();
      expect(context.stroke).not.toHaveBeenCalled();
    }
  });

  it('draws bounded finite values and restores canvas state', () => {
    const context = createCanvasContext();
    const cell = { value: '', sparkline: [2, 4, -1] } satisfies GridCell;

    drawGridCanvasSparkline(context, cell, 0, 0, 100, 24);

    expect(context.save).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenCalledOnce();
    expect(context.lineTo).toHaveBeenCalledTimes(2);
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  });
});
