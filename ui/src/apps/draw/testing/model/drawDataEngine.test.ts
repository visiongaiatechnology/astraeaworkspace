import { describe, expect, it } from 'vitest';
import type { DrawDataBinding, DrawDataGraphicRule, DrawDocumentModel, DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { createEmptyDrawDocument } from '../../model/drawDocumentEngine';
import { createVectorShape } from '../../model/drawVectorEngine';
import {
  applyDataGraphicProjection,
  breakDataBinding,
  dataBindingNavigationTarget,
  evaluateDataGraphics,
  freezeDataBinding,
  refreshDataBinding,
  relinkDataBinding,
  upsertDataBinding,
} from '../../model/drawDataEngine';

function createShape(): DrawObject {
  return createVectorShape({
    id: 'shape-1',
    pageId: 'page-1',
    layerId: 'layer-main',
    name: 'Bound shape',
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    vector: { kind: 'rectangle' },
  });
}

function createModel(): DrawDocumentModel {
  const model = createEmptyDrawDocument();
  const shape = createShape();
  return {
    ...model,
    objects: { [shape.id]: shape },
    pages: model.pages.map((page) => ({ ...page, objectIds: [shape.id] })),
  };
}

function createRule(overrides: Partial<DrawDataGraphicRule> = {}): DrawDataGraphicRule {
  return {
    id: 'rule-1',
    sourceField: 'status',
    operator: 'eq',
    compareValue: 'ready',
    target: 'fill',
    value: '#22c55e',
    allowGeometryMutation: false,
    ...overrides,
  };
}

function createBinding(overrides: Partial<DrawDataBinding> = {}): DrawDataBinding {
  return {
    id: 'binding-1',
    objectId: 'shape-1',
    sourceKind: 'grid-range',
    sourceDocumentId: 'grid-doc',
    sourceUri: 'vgt://workspace/document/grid-doc/object/table-1',
    selector: 'A1:B2',
    mode: 'live',
    rules: [createRule()],
    ...overrides,
  };
}

describe('Draw data-graphic projection', () => {
  it('evaluates validated rules into a bounded projection and applies it immutably', () => {
    const object = createShape();
    const binding = createBinding({
      rules: [
        createRule(),
        createRule({ id: 'rule-2', sourceField: 'load', operator: 'gte', compareValue: 90, target: 'data-bar', value: 150 }),
        createRule({ id: 'rule-3', sourceField: 'load', operator: 'gte', compareValue: 90, target: 'x', value: 2_000_000, allowGeometryMutation: true }),
      ],
    });
    const projection = evaluateDataGraphics(object, binding, {
      sourceVersion: 4,
      values: { status: 'ready', load: 95 },
    });

    expect(projection).toEqual({ objectId: 'shape-1', style: { fill: '#22c55e' }, dataBar: 100, geometry: { x: 1_000_000 } });
    const updated = applyDataGraphicProjection(object, projection);
    expect(updated.vector?.style.fill).toBe('#22c55e');
    expect(updated.customProperties?.dataBar).toBe(100);
    expect(updated.x).toBe(1_000_000);
    expect(object.x).toBe(0);
  });

  it('fails closed on unsafe style values, unauthorized geometry, and hostile snapshots', () => {
    const object = createShape();
    expect(() => evaluateDataGraphics(object, createBinding({ rules: [createRule({ value: 'url(https://attacker.invalid/a.svg)' })] }), {
      sourceVersion: 1,
      values: { status: 'ready' },
    })).toThrow('data-graphic-color-invalid');
    expect(() => evaluateDataGraphics(object, createBinding({ rules: [createRule({ target: 'width', value: 20 })] }), {
      sourceVersion: 1,
      values: { status: 'ready' },
    })).toThrow('geometry-mapping-not-authorized');
    expect(() => evaluateDataGraphics(object, createBinding(), {
      sourceVersion: 1,
      values: { status: Number.NaN as unknown as string },
    })).toThrow('snapshot-value-invalid');
  });

  it('rejects unsafe projections and geometry sizes', () => {
    const object = createShape();
    expect(() => applyDataGraphicProjection(object, {
      objectId: object.id,
      style: { fill: 'url(javascript:alert(1))' },
    })).toThrow('data-graphic-color-invalid');
    expect(() => applyDataGraphicProjection(object, {
      objectId: object.id,
      style: {},
      geometry: { width: -1 },
    })).toThrow('data-graphic-size-invalid');
  });
});

describe('Draw data-binding lifecycle', () => {
  it('upserts bindings only for existing vector shapes and canonical source URIs', () => {
    const model = createModel();
    const updated = upsertDataBinding(model, createBinding());

    expect(updated.dataBindings).toEqual([createBinding()]);
    expect(updated.revision).toBe(model.revision + 1);
    expect(model.dataBindings).toEqual([]);
    expect(() => upsertDataBinding(model, createBinding({ sourceUri: 'vgt://workspace/document/grid-doc/object/../secret' }))).toThrow('binding-uri-invalid');
  });

  it('validates external capabilities and requires explicit geometry authorization', () => {
    const model = createModel();
    expect(() => upsertDataBinding(model, createBinding({
      sourceKind: 'external-approved',
      sourceDocumentId: undefined,
      sourceUri: 'https://example.com/feed',
    }))).toThrow('external-capability-invalid');
    expect(() => upsertDataBinding(model, createBinding({
      rules: [createRule({ target: 'height', value: 10, allowGeometryMutation: false })],
    }))).toThrow('geometry-mapping-not-authorized');
  });

  it('freezes, refreshes, breaks, and relinks with validated versions and timestamps', () => {
    const binding = createBinding();
    const snapshot = { sourceVersion: 7, values: { status: 'ready', count: 8 } };
    const frozen = freezeDataBinding(binding, snapshot, 100);

    expect(frozen.mode).toBe('frozen');
    expect(frozen.frozenSnapshot).toEqual(snapshot.values);
    expect(evaluateDataGraphics(createShape(), frozen, { sourceVersion: 8, values: { status: 'blocked' } }).style.fill).toBe('#22c55e');
    expect(refreshDataBinding(frozen, { sourceVersion: 9, values: { status: 'blocked' } }, 200)).toMatchObject({ mode: 'live', lastSourceVersion: 9, lastRefreshAt: 200 });
    const broken = breakDataBinding(binding);
    expect(dataBindingNavigationTarget(broken)).toEqual({ uri: 'vgt://workspace/broken' });
    expect(() => refreshDataBinding(broken, snapshot, 300)).toThrow('binding-broken');
    expect(relinkDataBinding(broken, {
      sourceDocumentId: 'grid-doc',
      sourceUri: 'vgt://workspace/document/grid-doc/object/table-2',
      selector: 'A1:B2',
      sourceKind: 'grid-range',
    })).toMatchObject({ mode: 'live', sourceUri: 'vgt://workspace/document/grid-doc/object/table-2' });
    expect(() => freezeDataBinding(binding, snapshot, Number.NaN)).toThrow('binding-time-invalid');
  });
});
