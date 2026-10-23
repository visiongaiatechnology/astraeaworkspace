import { describe, expect, it } from 'vitest';
import { stepWorldCenterByKey } from '../../viewport/whiteboardViewportEngine';

const center = { x: 1_000, y: 500 };

describe('Whiteboard mini-map keyboard navigation', () => {
  it('moves the world centre in the direction of the pressed arrow', () => {
    expect(stepWorldCenterByKey(center, 'ArrowLeft', 100)).toEqual({ x: 900, y: 500 });
    expect(stepWorldCenterByKey(center, 'ArrowRight', 100)).toEqual({ x: 1_100, y: 500 });
    expect(stepWorldCenterByKey(center, 'ArrowUp', 100)).toEqual({ x: 1_000, y: 400 });
    expect(stepWorldCenterByKey(center, 'ArrowDown', 100)).toEqual({ x: 1_000, y: 600 });
  });

  it('owns only the arrow keys so every other key still bubbles', () => {
    expect(stepWorldCenterByKey(center, 'Enter', 100)).toBeNull();
    expect(stepWorldCenterByKey(center, 'Tab', 100)).toBeNull();
    expect(stepWorldCenterByKey(center, 'a', 100)).toBeNull();
  });

  it('stays finite and inside the coordinate ceiling for hostile input', () => {
    expect(stepWorldCenterByKey({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, 'ArrowRight', Number.NaN)).toEqual({ x: 0, y: 0 });
    const clamped = stepWorldCenterByKey({ x: 10_000_000, y: 0 }, 'ArrowRight', 500);
    expect(clamped).toEqual({ x: 10_000_000, y: 0 });
  });
});
