import { describe, expect, it } from 'vitest';
import type { DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { createEmptyDrawDocument, DrawModelError, upsertDrawObject } from '../../model/drawDocumentEngine';
import { BUILTIN_DRAW_TEMPLATES, instantiateDrawTemplate } from '../../model/drawTemplateEngine';

function existingObject(id: string): DrawObject {
  return {
    id,
    pageId: 'page-1',
    layerId: 'layer-main',
    type: 'shape',
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
  };
}

describe('Draw template model engine', () => {
  it('provides a unique frozen catalog covering each supported diagram family', () => {
    const ids = BUILTIN_DRAW_TEMPLATES.map((template) => template.id);
    const families = [...new Set(BUILTIN_DRAW_TEMPLATES.map((template) => template.family))].sort();

    expect(new Set(ids).size).toBe(ids.length);
    expect(families).toEqual([
      'bpmn', 'data-flow', 'electrical', 'engineering', 'erd', 'floor-plan', 'flowchart', 'gantt',
      'mind-map', 'network-logical', 'network-physical', 'org-chart', 'pert', 'process-map', 'rack',
      'swimlane', 'timeline', 'uml-activity', 'uml-class', 'uml-component', 'uml-deployment',
      'uml-object', 'uml-package', 'uml-sequence', 'uml-state', 'uml-use-case',
    ]);
    expect(Object.isFrozen(BUILTIN_DRAW_TEMPLATES)).toBe(true);
    expect(Object.isFrozen(BUILTIN_DRAW_TEMPLATES[0])).toBe(true);
    expect(Object.isFrozen(BUILTIN_DRAW_TEMPLATES[0].seeds)).toBe(true);
  });

  it('instantiates a template as one validated immutable transaction', () => {
    const initial = createEmptyDrawDocument();

    const next = instantiateDrawTemplate(initial, 'flowchart-basic', 'page-1', 'layer-main', 'flow');

    expect(next).not.toBe(initial);
    expect(next.revision).toBe(initial.revision + 1);
    expect(next.pages[0].objectIds).toEqual(['flow-start', 'flow-step', 'flow-decision', 'flow-end']);
    expect(Object.keys(next.objects)).toHaveLength(4);
    expect(next.objects['flow-start']).toMatchObject({ name: 'Start', zIndex: 0, diagram: { family: 'flowchart', role: 'start' } });
    expect(next.objects['flow-end'].zIndex).toBe(3);
    expect(initial.pages[0].objectIds).toEqual([]);
    expect(initial.objects).toEqual({});
  });

  it('rejects unknown templates, invalid targets, unsafe prefixes, and generated ID collisions', () => {
    const initial = createEmptyDrawDocument();
    const occupied = upsertDrawObject(initial, existingObject('flow-start'));

    expect(() => instantiateDrawTemplate(initial, 'not-a-template', 'page-1', 'layer-main', 'flow'))
      .toThrowError(DrawModelError);
    expect(() => instantiateDrawTemplate(initial, 'flowchart-basic', 'missing-page', 'layer-main', 'flow'))
      .toThrowError(DrawModelError);
    expect(() => instantiateDrawTemplate(initial, 'flowchart-basic', 'page-1', 'missing-layer', 'flow'))
      .toThrowError(DrawModelError);
    expect(() => instantiateDrawTemplate(initial, 'flowchart-basic', 'page-1', 'layer-main', 'bad/prefix'))
      .toThrowError(DrawModelError);
    expect(() => instantiateDrawTemplate(initial, 'flowchart-basic', 'page-1', 'layer-main', 'x'.repeat(128)))
      .toThrowError(DrawModelError);
    expect(() => instantiateDrawTemplate(occupied, 'flowchart-basic', 'page-1', 'layer-main', 'flow'))
      .toThrowError(DrawModelError);
  });

  it('does not overwrite existing template output when a prefix is reused', () => {
    const initial = createEmptyDrawDocument();
    const first = instantiateDrawTemplate(initial, 'process-map', 'page-1', 'layer-main', 'repeat');

    expect(() => instantiateDrawTemplate(first, 'process-map', 'page-1', 'layer-main', 'repeat'))
      .toThrowError(DrawModelError);
    expect(first.revision).toBe(initial.revision + 1);
    expect(first.pages[0].objectIds).toHaveLength(4);
  });

  it('turns lane seeds into real containers so a node belongs to its lane', () => {
    const initial = createEmptyDrawDocument();
    const next = instantiateDrawTemplate(initial, 'swimlane-cross-functional', 'page-1', 'layer-main', 'sw');

    expect(next.objects['sw-lane1']).toMatchObject({ type: 'group', name: 'Lane A', childIds: ['sw-p1'] });
    expect(next.objects['sw-lane2']).toMatchObject({ type: 'group', childIds: ['sw-p2'] });
    expect(next.objects['sw-p1'].parentGroupId).toBe('sw-lane1');
    expect(next.objects['sw-p2'].parentGroupId).toBe('sw-lane2');
    // Each lane still spans its members geometrically, so containment hit-testing agrees.
    const lane = next.objects['sw-lane1'];
    const member = next.objects['sw-p1'];
    expect(member.x).toBeGreaterThanOrEqual(lane.x);
    expect(member.y).toBeGreaterThanOrEqual(lane.y);
    expect(member.x + member.width).toBeLessThanOrEqual(lane.x + lane.width);
    expect(member.y + member.height).toBeLessThanOrEqual(lane.y + lane.height);
  });

  it('keeps flow templates container-free', () => {
    const next = instantiateDrawTemplate(createEmptyDrawDocument(), 'flowchart-basic', 'page-1', 'layer-main', 'flow2');
    expect(Object.values(next.objects).some((object) => object.type === 'group')).toBe(false);
    expect(next.pages[0].objectIds).toHaveLength(4);
  });
});

