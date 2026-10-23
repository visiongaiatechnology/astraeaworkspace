// STATUS: GOLD — Draw auto layout: deterministic, bounded, idempotent and non-destructive.
import { describe, expect, it } from 'vitest';
import { DRAW_LAYOUT_MARGIN, layoutDrawPage } from '../../interactions/drawAutoLayoutEngine';
import { createDrawConnector } from '../../interactions/drawConnectorEngine';
import { routeDrawConnectorFromModel } from '../../interactions/drawConnectorEngine';
import { buildDrawModel } from './drawInteractionFixtures';

const connector = (fromId: string, toId: string, label?: string) => ({
  from: { objectId: fromId, anchor: 'auto' as const },
  to: { objectId: toId, anchor: 'auto' as const },
  route: 'orthogonal' as const,
  autoRoute: true,
  waypoints: [],
  obstacleAvoidance: true,
  routingPriority: 0,
  crossingStyle: 'none' as const,
  semantic: label ? { label } : {},
  arrowStart: 'none' as const,
  arrowEnd: 'triangle' as const,
});

function chain() {
  return buildDrawModel({
    objects: [
      { id: 'a', x: 500, y: 600, width: 160, height: 80, text: 'A' },
      { id: 'b', x: 20, y: 30, width: 160, height: 80, text: 'B' },
      { id: 'c', x: 900, y: 700, width: 160, height: 80, text: 'C' },
      { id: 'e1', type: 'connector', x: 0, y: 0, width: 100, height: 100, connector: connector('a', 'b') },
      { id: 'e2', type: 'connector', x: 0, y: 0, width: 100, height: 100, connector: connector('b', 'c') },
    ],
  });
}

describe('Draw auto layout', () => {
  it('re-arranges the page deterministically and keeps object identity, text and layer', () => {
    const model = chain();
    const first = layoutDrawPage(model, { layout: 'table' });
    expect(first.movedIds.length).toBe(3);
    const before = routeDrawConnectorFromModel(model, 'e1').path;
    const after = routeDrawConnectorFromModel(first.model, 'e1').path;
    // The connector follows the new arrangement without a second routing rule.
    expect(after).not.toBe(before);
    for (const id of ['a', 'b', 'c']) {
      const original = model.objects[id]!;
      const laid = first.model.objects[id]!;
      expect(laid.name).toBe(original.name);
      expect(laid.layerId).toBe(original.layerId);
      expect(laid.richText).toEqual(original.richText);
      expect(laid.x).toBeGreaterThanOrEqual(0);
      expect(laid.y).toBeGreaterThanOrEqual(0);
      expect(laid.x + laid.width).toBeLessThanOrEqual(first.model.pages[0]!.width);
      expect(laid.y + laid.height).toBeLessThanOrEqual(first.model.pages[0]!.height);
    }
    expect(first.model.pages[0]!.objectIds.sort()).toEqual(model.pages[0]!.objectIds.sort());
    expect(first.model.revision).toBe(model.revision + 1);
  });

  it('is idempotent: a second run moves nothing and produces no new revision', () => {
    const once = layoutDrawPage(chain(), { layout: 'table' });
    const twice = layoutDrawPage(once.model, { layout: 'table' });
    expect(twice.movedIds).toEqual([]);
    expect(twice.model).toBe(once.model);
  });

  it('aligns the generated layout to the page margin', () => {
    const result = layoutDrawPage(chain(), { layout: 'table' });
    const xs = ['a', 'b', 'c'].map((id) => result.model.objects[id]!.x);
    const ys = ['a', 'b', 'c'].map((id) => result.model.objects[id]!.y);
    expect(Math.min(...xs)).toBe(DRAW_LAYOUT_MARGIN);
    expect(Math.min(...ys)).toBe(DRAW_LAYOUT_MARGIN);
  });

  it('uses the connector graph for the hierarchical layout and differs from the grid layout', () => {
    const table = layoutDrawPage(chain(), { layout: 'table' });
    const hierarchy = layoutDrawPage(chain(), { layout: 'hierarchy' });
    // Three objects fit in one table row (five columns), so the grid layout keeps them on one line …
    const tableRows = new Set(['a', 'b', 'c'].map((id) => table.model.objects[id]!.y));
    expect(tableRows.size).toBe(1);
    // … while the connector graph a→b→c puts each hop on its own row, strictly downwards.
    expect(hierarchy.model.objects.b!.y).toBeGreaterThan(hierarchy.model.objects.a!.y);
    expect(hierarchy.model.objects.c!.y).toBeGreaterThan(hierarchy.model.objects.b!.y);
    expect(new Set(['a', 'b', 'c'].map((id) => hierarchy.model.objects[id]!.y)).size).toBe(3);
  });

  it('fails closed on an empty page and on an unknown layout', () => {
    expect(() => layoutDrawPage(buildDrawModel({}))).toThrowError(/auto-layout-empty/);
    expect(() => layoutDrawPage(chain(), { layout: 'nope' as 'table' })).toThrowError(/auto-diagram-layout-invalid/);
    expect(() => layoutDrawPage(chain(), { pageId: 'page-nope' })).toThrowError(/page-missing/);
  });

  it('keeps working after a connector was created through the connector engine', () => {
    const connected = createDrawConnector(chain(), 'a', 'c', { idSeed: 'x' });
    const result = layoutDrawPage(connected, { layout: 'hierarchy' });
    expect(result.movedIds.length).toBe(3);
    expect(Object.values(result.model.objects).filter((object) => object.type === 'connector').length).toBe(3);
  });
});
