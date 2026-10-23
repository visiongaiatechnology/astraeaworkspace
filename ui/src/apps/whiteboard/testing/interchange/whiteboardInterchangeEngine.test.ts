import { describe, expect, it } from 'vitest';
import { decomposeWhiteboardFrames, exportWhiteboardToSvg } from '../../interchange/whiteboardInterchangeEngine';
import type { WhiteboardItem } from '../../types';

const item = (id: string, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 80,
  height: 48,
  text: id,
  ...overrides,
});

describe('Whiteboard interchange rendering and frame decomposition', () => {
  it('escapes hostile labels and validates generated SVG before returning it', () => {
    const svg = exportWhiteboardToSvg('<script>board</script>', [
      item('hostile-label', { text: '<img src=x onerror=alert(1)>' }),
    ]);

    expect(svg).toContain('&lt;SCRIPT&gt;BOARD&lt;/SCRIPT&gt;');
    expect(svg).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<img src=x');
  });

  it('does not preserve an external paint reference from a malformed shape', () => {
    const svg = exportWhiteboardToSvg('Board', [item('hostile-shape', {
      type: 'shape',
      shape: { kind: 'rectangle', fill: 'url(https://attacker.invalid/pixel)', stroke: '#000000', strokeWidth: 1 },
    })]);

    expect(svg).not.toContain('attacker.invalid');
    expect(svg).toContain('<svg');
  });

  it('computes connector-free bounds without variadic aggregation for a large board', () => {
    const items = Array.from({ length: 12_000 }, (_, index) => item(`node-${index}`, {
      x: index * 2,
      y: index * -1,
      width: 10,
      height: 12,
    }));
    const [slice] = decomposeWhiteboardFrames(items);

    expect(slice?.frameId).toBe('root_board');
    expect(slice?.bounds).toEqual({ x: 0, y: -11_999, width: 24_008, height: 12_011 });
    expect(slice?.containedItems).toHaveLength(items.length);
  });

  it('keeps connectors only when both endpoint nodes belong to the frame', () => {
    const board: WhiteboardItem[] = [
      item('frame-1', { type: 'frame', x: 0, y: 0, width: 160, height: 120 }),
      item('inside-1', { x: 10, y: 10 }),
      item('inside-2', { x: 30, y: 30 }),
      item('outside', { x: 150, y: 150 }),
      item('inside-link', { type: 'connector', fromId: 'inside-1', toId: 'inside-2' }),
      item('crossing-link', { type: 'connector', fromId: 'inside-1', toId: 'outside' }),
    ];

    const [slice] = decomposeWhiteboardFrames(board);
    expect(slice?.containedItems.map(({ id }) => id).sort()).toEqual(['inside-1', 'inside-2', 'inside-link']);
  });

  it('rejects frame expansion above the bounded visit budget', () => {
    const frames = Array.from({ length: 201 }, (_, index) => item(`frame-${index}`, {
      type: 'frame', x: 0, y: 0, width: 100, height: 100,
    }));
    const nodes = Array.from({ length: 10_000 }, (_, index) => item(`node-${index}`));

    expect(() => decomposeWhiteboardFrames([...frames, ...nodes]))
      .toThrow('Whiteboard frame decomposition exceeds the processing policy');
  });

  it('rejects duplicate IDs before producing a vector document', () => {
    expect(() => exportWhiteboardToSvg('Board', [item('duplicate'), item('duplicate')]))
      .toThrow('Duplicate or empty whiteboard object id rejected.');
  });
});
