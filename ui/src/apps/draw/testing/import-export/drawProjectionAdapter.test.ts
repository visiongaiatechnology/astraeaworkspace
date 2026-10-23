// STATUS: PLATIN — direct contracts for Draw-to-Whiteboard interchange projection.
import { describe, expect, it } from 'vitest';
import type { DrawDocumentModel, DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { createEmptyDrawDocument } from '../../model/drawDocumentEngine';
import {
  drawObjectToWhiteboardItem,
  drawPageToWhiteboardItems,
} from '../../import-export/drawProjectionAdapter';

function makeObject(id: string, overrides: Partial<DrawObject> = {}): DrawObject {
  return {
    id,
    pageId: 'page-1',
    layerId: 'layer-main',
    type: 'shape',
    name: id,
    x: 10,
    y: 20,
    width: 80,
    height: 40,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    ...overrides,
  };
}

function makeModel(objects: DrawObject[]): DrawDocumentModel {
  const base = createEmptyDrawDocument();
  return {
    ...base,
    pages: base.pages.map((page) => ({ ...page, objectIds: objects.map((object) => object.id) })),
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
  };
}

describe('Draw projection adapter', () => {
  it('projects only page members in z-order without mutating the source model', () => {
    const later = makeObject('later', { zIndex: 4, vector: { kind: 'ellipse', style: {
      fill: '#fef3c7', stroke: '#334155', strokeWidth: 2, dash: [], opacity: 1, cornerRadius: 0,
      arrowStart: 'none', arrowEnd: 'none',
    } } });
    const earlier = makeObject('earlier', { zIndex: 1, richText: {
      runs: [{ text: 'First' }, { text: ' page item' }],
      autoFit: 'none',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      verticalAlign: 'top',
      rotation: 0,
    } });
    const unreferenced = makeObject('unreferenced', { zIndex: 0, pageId: 'other-page' });
    const model = makeModel([later, earlier, unreferenced]);
    model.pages[0].objectIds = ['later', 'earlier'];

    const projected = drawPageToWhiteboardItems(model);

    expect(projected.map((item) => item.id)).toEqual(['earlier', 'later']);
    expect(projected[0]).toMatchObject({ id: 'earlier', text: 'First page item' });
    expect(projected[1]).toMatchObject({ id: 'later', type: 'terminal', color: 'yellow' });
    expect(model.pages[0].objectIds).toEqual(['later', 'earlier']);
  });

  it('preserves draw metadata used by the Whiteboard object projection', () => {
    const object = makeObject('table-shape', {
      vector: { kind: 'freehand', style: {
        fill: 'violet', stroke: '#475569', strokeWidth: 3, dash: [], opacity: 1, cornerRadius: 0,
        arrowStart: 'none', arrowEnd: 'none',
      } },
      parentGroupId: 'group-a',
      diagram: { family: 'flowchart', role: 'task' },
      hyperlink: { kind: 'workspace', uri: 'vgt://workspace/document/doc-a' },
      table: { columns: ['Name'], rows: [['Astraea']], headerRows: 1 },
    });

    const projected = drawObjectToWhiteboardItem(object);

    expect(projected).toMatchObject({
      type: 'shape',
      color: 'purple',
      groupId: 'group-a',
      linkUri: 'vgt://workspace/document/doc-a',
      tags: ['flowchart', 'task'],
      shape: { kind: 'rectangle', fill: 'violet', stroke: '#475569', strokeWidth: 3 },
      table: { columns: ['Name'], rows: [['Astraea']] },
    });
    expect(projected.table).not.toBe(object.table);
    expect(projected.table?.rows[0]).not.toBe(object.table?.rows[0]);
  });

  it('maps connectors, custom routes, and unsupported point anchors safely', () => {
    const connector = makeObject('edge-a', {
      type: 'connector',
      connector: {
        from: { objectId: 'shape-a', anchor: 'point:custom' },
        to: { objectId: 'shape-b', anchor: 'bottom' },
        route: 'custom',
        autoRoute: true,
        waypoints: [],
        obstacleAvoidance: true,
        routingPriority: 1,
        crossingStyle: 'none',
        semantic: { label: 'depends on' },
        arrowStart: 'none',
        arrowEnd: 'triangle',
      },
    });

    expect(drawObjectToWhiteboardItem(connector)).toMatchObject({
      type: 'connector',
      text: 'depends on',
      fromId: 'shape-a',
      toId: 'shape-b',
      fromAnchor: 'auto',
      toAnchor: 'bottom',
      connectorStyle: { route: 'orthogonal', autoRoute: true },
    });
  });

  it('rejects missing page-object references instead of silently dropping them', () => {
    const model = makeModel([]);
    model.pages[0].objectIds = ['missing-object'];

    expect(() => drawPageToWhiteboardItems(model)).toThrowError(
      expect.objectContaining({ name: 'DrawProjectionError', code: 'page-object-missing' }),
    );
  });

  it('rejects connector objects without connector data and returns empty for an unknown page', () => {
    expect(() => drawObjectToWhiteboardItem(makeObject('bad-edge', { type: 'connector' }))).toThrowError(
      expect.objectContaining({ name: 'DrawProjectionError', code: 'connector-data-missing' }),
    );
    expect(drawPageToWhiteboardItems(makeModel([]), 'missing-page')).toEqual([]);
  });
});
