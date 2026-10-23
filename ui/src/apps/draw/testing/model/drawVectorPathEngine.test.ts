import { describe, expect, it } from 'vitest';
import { simplifyDrawPath } from '../../model/drawVectorPathEngine';

describe('Draw vector path engine', () => {
  it('simplifies paths iteratively and returns detached, endpoint-preserving points', () => {
    const input = [{ x: 0, y: 0 }, { x: 5, y: 0.2 }, { x: 10, y: 0 }];
    const result = simplifyDrawPath(input, 1);

    expect(result).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(result[0]).not.toBe(input[0]);
    input[0].x = 99;
    expect(result[0].x).toBe(0);
  });

  it('bounds worst-case path work without recursion or losing endpoints', () => {
    const input = Array.from({ length: 6_000 }, (_, index) => ({ x: index, y: index % 2 ? 4 : 0 }));
    const result = simplifyDrawPath(input, 0);

    expect(result).toHaveLength(input.length);
    expect(result[0]).toEqual(input[0]);
    expect(result.at(-1)).toEqual(input.at(-1));
  });

  it('rejects sparse, non-finite, oversized, and unbounded path inputs', () => {
    expect(() => simplifyDrawPath(new Array(2) as Array<{ x: number; y: number }>)).toThrow(/path-point-invalid/u);
    expect(() => simplifyDrawPath(new Array(100_001) as Array<{ x: number; y: number }>)).toThrow(/path-point-limit/u);
    expect(() => simplifyDrawPath([{ x: Number.NaN, y: 0 }])).toThrow(/path-point-invalid/u);
    expect(() => simplifyDrawPath([{ x: 1_000_000_001, y: 0 }])).toThrow(/path-point-invalid/u);
    expect(() => simplifyDrawPath([{ x: 0, y: 0 }], Number.POSITIVE_INFINITY)).toThrow(/path-tolerance-invalid/u);
  });
});
