import { describe, expect, it } from 'vitest';
import { generateDeterministicDiagram } from '../../model/drawAutoDiagramEngine';
describe('Deterministic data diagrams', () => {
  it('sorts table rows stably, preserves scalar fields, and bounds generated identities', () => {
    const longId = `id-${'x'.repeat(125)}`;
    const rows = [
      { id: 'row-b', label: 'Second', fields: { count: 2, status: 'ready', missing: null } },
      { id: longId, label: 'Long id' },
      { id: 'row-a', label: 'First' },
    ];
    const first = generateDeterministicDiagram(rows, 'page-1', 'layer-main');
    const second = generateDeterministicDiagram(rows, 'page-1', 'layer-main');

    expect(first.map((shape) => shape.id)).toEqual(second.map((shape) => shape.id));
    expect(first.map((shape) => shape.name)).toEqual(['Long id', 'First', 'Second']);
    expect(first[2]?.customProperties).toMatchObject({ 'data:count': 2, 'data:status': 'ready' });
    expect(first[0]?.id.length).toBeLessThanOrEqual(128);
  });

  it('generates deep hierarchy layouts iteratively and rejects cycles or missing parents', () => {
    const rows = Array.from({ length: 900 }, (_, index) => ({
      id: `row-${String(index).padStart(4, '0')}`,
      label: `Node ${index}`,
      ...(index > 0 ? { parentId: `row-${String(index - 1).padStart(4, '0')}` } : {}),
    }));
    const diagram = generateDeterministicDiagram(rows, 'page-1', 'layer-main', 'hierarchy');

    expect(diagram).toHaveLength(900);
    expect(diagram.at(-1)?.y).toBe(80 + 899 * 160);
    expect(() => generateDeterministicDiagram([
      { id: 'a', label: 'A', parentId: 'b' },
      { id: 'b', label: 'B', parentId: 'a' },
    ], 'page-1', 'layer-main', 'hierarchy')).toThrow('hierarchy-cycle');
    expect(() => generateDeterministicDiagram([
      { id: 'child', label: 'Child', parentId: 'missing' },
    ], 'page-1', 'layer-main', 'hierarchy')).toThrow('hierarchy-parent-missing');
  });
});
