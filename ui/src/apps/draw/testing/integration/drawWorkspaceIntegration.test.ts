import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WhiteboardDocumentModel } from '../../../../shared/contracts/whiteboard/workspaceWhiteboard';
import type { DrawDataGraphicRule, DrawDocumentModel, DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { createEmptyDrawDocument, DrawModelError, upsertDrawObject } from '../../model/drawDocumentEngine';
import { createErdObjectsFromSchema, type DrawDatabaseSchemaTable } from '../../model/drawErdSchemaEngine';
import { createVectorShape } from '../../model/drawVectorEngine';
import {
  bindWorkspaceDataGraphic,
  convertWhiteboardToDraw,
  linkDrawShapeToProject,
  linkDrawShapeToTask,
  proposeDatabaseSchemaChangesFromErd,
  registerDrawEmbedAnchor,
} from '../../integrations/drawWorkspaceIntegration';

function shape(id = 'shape-1'): DrawObject {
  return createVectorShape({
    id,
    pageId: 'page-1',
    layerId: 'layer-main',
    name: id,
    x: 10,
    y: 20,
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

function connector(id = 'connector-1', fromId = 'shape-1', toId = 'shape-2'): DrawObject {
  return {
    id,
    pageId: 'page-1',
    layerId: 'layer-main',
    type: 'connector',
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
    zIndex: 1,
    connector: {
      from: { objectId: fromId, anchor: 'auto' },
      to: { objectId: toId, anchor: 'auto' },
      route: 'straight',
      autoRoute: true,
      waypoints: [],
      obstacleAvoidance: true,
      routingPriority: 0,
      crossingStyle: 'none',
      semantic: {},
      arrowStart: 'none',
      arrowEnd: 'none',
    },
  };
}

function drawModel(objects: DrawObject[] = []): DrawDocumentModel {
  let model = createEmptyDrawDocument();
  for (const object of objects) model = upsertDrawObject(model, object);
  return model;
}

function workspaceDocument(drawData = createEmptyDrawDocument()): WorkspaceDocument {
  return {
    id: 'draw-doc',
    title: 'Architecture',
    kind: 'Draw',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'astraea-dark',
    root_object_ids: [],
    objects: {},
    drawData,
  };
}

const whiteboard: WhiteboardDocumentModel = {
  items: [
    { id: 'node-a', type: 'process', x: 10, y: 20, width: 120, height: 70, text: 'Start' },
    { id: 'node-b', type: 'decision', x: 300, y: 20, width: 120, height: 70, text: 'Ready?' },
    { id: 'edge-1', type: 'connector', x: 130, y: 50, width: 170, height: 10, text: '', fromId: 'node-a', toId: 'node-b' },
  ],
};

function schema(): DrawDatabaseSchemaTable[] {
  return [{ id: 'customers', name: 'Customer', columns: [
    { id: 'id', name: 'id', type: 'uuid', primaryKey: true },
    { id: 'name', name: 'name', type: 'text' },
  ] }];
}

function modelWithErd(): DrawDocumentModel {
  const initial = createEmptyDrawDocument();
  const tableObjects = createErdObjectsFromSchema(schema(), initial.pages[0].id, initial.pages[0].layerIds[0]);
  return drawModel(tableObjects);
}

function rule(): DrawDataGraphicRule {
  return {
    id: 'rule-1',
    sourceField: 'status',
    operator: 'eq',
    compareValue: 'ready',
    target: 'fill',
    value: '#22c55e',
    allowGeometryMutation: false,
  };
}

describe('Draw workspace integrations', () => {
  it('registers an immutable canonical page anchor and stable live reference', () => {
    const source = workspaceDocument();
    const before = structuredClone(source);
    const registered = registerDrawEmbedAnchor(source, { kind: 'page', id: 'page-1' }, 'Live', 10);

    expect(source).toEqual(before);
    expect(registered.source.version).toBe(2);
    expect(registered.source.modified_at).toBe(10);
    expect(registered.source.root_object_ids).toEqual([registered.anchorObjectId]);
    expect(registered.reference).toMatchObject({
      uri: `vgt://workspace/document/draw-doc/object/${registered.anchorObjectId}`,
      mode: 'Live',
      expected_type: 'Shape',
      fabric_status: 'current',
      resolved_source_version: 2,
    });
    expect(registerDrawEmbedAnchor(source, { kind: 'page', id: 'page-1' }, 'Live', 10)).toEqual(registered);
  });

  it('registers frozen frame references with a validated cached shape snapshot', () => {
    const model = drawModel([{ ...shape('frame-1'), type: 'frame' } as DrawObject]);
    const result = registerDrawEmbedAnchor(workspaceDocument(model), { kind: 'frame', id: 'frame-1' }, 'Frozen', 20);

    expect(result.reference.mode).toBe('Frozen');
    expect(result.reference.fabric_status).toBe('frozen');
    expect(result.reference.cached_snapshot).toMatchObject({ type: 'Shape', data: { id: result.anchorObjectId } });
    expect(result.reference.frozen_at).toBe(20);
  });

  it('rejects invalid modes, missing targets, stale anchor collisions, and exhausted times', () => {
    const source = workspaceDocument();
    expect(() => registerDrawEmbedAnchor(source, { kind: 'page', id: 'missing' }, 'Live', 1)).toThrow(DrawModelError);
    expect(() => registerDrawEmbedAnchor(source, { kind: 'page', id: 'page-1' }, 'Live' as 'Frozen', -1)).toThrow(DrawModelError);
    expect(() => registerDrawEmbedAnchor(source, { kind: 'page', id: 'page-1' }, 'Invalid' as 'Live', 1)).toThrow('embed-mode-invalid');

    const first = registerDrawEmbedAnchor(source, { kind: 'page', id: 'page-1' }, 'Live', 1);
    expect(() => registerDrawEmbedAnchor(first.source, { kind: 'page', id: 'page-1' }, 'Live', 2))
      .toThrow('embed-anchor-identity-conflict');
  });

  it('proposes bounded schema changes and flags table, column, and type removals as destructive', () => {
    const model = modelWithErd();
    const stable = proposeDatabaseSchemaChangesFromErd(model, schema());
    expect(stable).toMatchObject({ sourceRevision: model.revision, requiresExplicitApply: true, destructive: false, summary: [] });

    const removedTable = proposeDatabaseSchemaChangesFromErd(model, [...schema(), {
      id: 'old-table', name: 'Old', columns: [{ id: 'old-id', name: 'id', type: 'uuid' }],
    }]);
    expect(removedTable).toMatchObject({ destructive: true, summary: ['drop-table:old-table'] });

    const removedColumn = proposeDatabaseSchemaChangesFromErd(model, [{
      id: 'customers', name: 'Customer', columns: [
        { id: 'id', name: 'id', type: 'uuid', primaryKey: true },
        { id: 'name', name: 'name', type: 'text' },
        { id: 'legacy', name: 'legacy', type: 'text' },
      ],
    }]);
    expect(removedColumn).toMatchObject({ destructive: true, summary: ['alter-table:customers'] });
  });

  it('rejects malformed or duplicated schema baselines before generating a proposal', () => {
    const model = modelWithErd();
    expect(() => proposeDatabaseSchemaChangesFromErd(model, [schema()[0], schema()[0]])).toThrow('schema-baseline-invalid');
    expect(() => proposeDatabaseSchemaChangesFromErd(model, [{ ...schema()[0], columns: [
      ...schema()[0].columns,
      { id: 'bad-ref', name: 'bad_ref', type: 'uuid', foreignTableId: 'missing', foreignFieldId: 'missing' },
    ] }])).toThrow('schema-baseline-reference-missing');
  });

  it('binds Data Graphics through a canonical WOM URI and preserves the source model', () => {
    const model = drawModel([shape()]);
    const next = bindWorkspaceDataGraphic(model, {
      id: 'binding-1',
      objectId: 'shape-1',
      sourceKind: 'grid-range',
      sourceDocumentId: 'grid-doc',
      sourceObjectId: 'range-a',
      selector: 'A1:B4',
      rules: [rule()],
    });

    expect(model.dataBindings).toHaveLength(0);
    expect(next.revision).toBe(model.revision + 1);
    expect(next.dataBindings[0].sourceUri).toBe('vgt://workspace/document/grid-doc/object/range-a');
    expect(() => bindWorkspaceDataGraphic(model, null as never)).toThrow('data-binding-input-invalid');
  });

  it('stores project and task links as canonical workspace URIs without mutating the original model', () => {
    const model = drawModel([shape()]);
    const projectLinked = linkDrawShapeToProject(model, 'shape-1', 'projects-doc', 'project-1');
    const taskLinked = linkDrawShapeToTask(projectLinked, 'shape-1', 'tasks-doc', 'task-1');

    expect(model.objects['shape-1'].customProperties).toBeUndefined();
    expect(taskLinked.objects['shape-1'].customProperties).toEqual({
      projectRef: 'vgt://workspace/document/projects-doc/object/project-1',
      taskRef: 'vgt://workspace/document/tasks-doc/object/task-1',
    });
    expect(() => linkDrawShapeToProject(model, 'toString', 'projects-doc', 'project-1')).toThrow('shape-link-target-missing');
  });

  it('rejects connector links and missing shape IDs without reading inherited properties', () => {
    const model = drawModel([shape(), shape('shape-2'), connector()]);
    expect(() => linkDrawShapeToTask(model, 'connector-1', 'tasks-doc', 'task-1')).toThrow('shape-link-target-missing');
    expect(() => linkDrawShapeToTask(model, 'constructor', 'tasks-doc', 'task-1')).toThrow('shape-link-target-missing');
  });

  it('converts Whiteboard objects without mutation and preserves semantic connector endpoints', () => {
    const source = structuredClone(whiteboard);
    const before = structuredClone(source);
    const result = convertWhiteboardToDraw(source, createEmptyDrawDocument());
    const edge = Object.values(result.model.objects).find((object) => object.type === 'connector');

    expect(source).toEqual(before);
    expect(Object.keys(result.model.objects)).toHaveLength(3);
    expect(result.warnings).toEqual([]);
    expect(edge?.connector).toBeDefined();
    expect(result.model.objects[edge!.connector!.from.objectId]).toBeDefined();
    expect(result.model.objects[edge!.connector!.to.objectId]).toBeDefined();
  });

  it('uses a null-prototype ID map so special source names resolve as ordinary identifiers', () => {
    const source: WhiteboardDocumentModel = { items: [
      { id: '__proto__', type: 'process', x: 0, y: 0, width: 10, height: 10, text: 'Source' },
      { id: 'edge', type: 'connector', x: 0, y: 0, width: 10, height: 10, text: '', fromId: '__proto__', toId: '__proto__' },
    ] };
    const result = convertWhiteboardToDraw(source, createEmptyDrawDocument());
    const edge = Object.values(result.model.objects).find((object) => object.type === 'connector');

    expect(Object.getPrototypeOf(result.idMap)).toBeNull();
    expect(result.idMap['__proto__']).toMatch(/^wb-/u);
    expect(edge?.connector?.from.objectId).toBe(result.idMap['__proto__']);
    expect(result.warnings).toEqual([]);
  });

  it('rejects active hyperlinks, duplicate identities, unknown kinds, and target identity collisions', () => {
    expect(() => convertWhiteboardToDraw({ items: [
      { id: 'bad-link', type: 'process', x: 0, y: 0, width: 10, height: 10, text: 'Bad', linkUri: 'javascript:alert(1)' },
    ] }, createEmptyDrawDocument())).toThrow(DrawModelError);

    expect(() => convertWhiteboardToDraw({ items: [
      { id: 'same', type: 'process', x: 0, y: 0, width: 10, height: 10, text: 'A' },
      { id: 'same', type: 'process', x: 20, y: 0, width: 10, height: 10, text: 'B' },
    ] }, createEmptyDrawDocument())).toThrow('whiteboard-object-id-duplicate');

    expect(() => convertWhiteboardToDraw({ items: [
      { id: 'unknown', type: 'malformed' as never, x: 0, y: 0, width: 10, height: 10, text: 'Bad' },
    ] }, createEmptyDrawDocument())).toThrow('whiteboard-object-type-unknown');

    const imported = convertWhiteboardToDraw({ items: [whiteboard.items[0]] }, createEmptyDrawDocument());
    expect(() => convertWhiteboardToDraw({ items: [whiteboard.items[0]] }, drawModel([shape(imported.idMap['node-a'])])))
      .toThrow('whiteboard-object-target-collision');
  });

  it('reports unresolved connectors and rejects oversized Whiteboard inputs before cloning', () => {
    const unresolved: WhiteboardDocumentModel = { items: [
      { id: 'edge', type: 'connector', x: 0, y: 0, width: 10, height: 10, text: '', fromId: 'missing', toId: 'missing' },
    ] };
    expect(convertWhiteboardToDraw(unresolved, createEmptyDrawDocument()).warnings).toEqual(['connector-unresolved:edge']);
    expect(() => convertWhiteboardToDraw({ items: Array.from({ length: 100_001 }, (_, index) => ({
      id: `item-${index}`, type: 'process' as const, x: 0, y: 0, width: 10, height: 10, text: '',
    })) }, createEmptyDrawDocument())).toThrow('whiteboard-object-limit');
  });
});
