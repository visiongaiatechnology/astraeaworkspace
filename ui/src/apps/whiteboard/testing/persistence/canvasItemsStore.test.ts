import { describe, expect, it } from 'vitest';
import type { ShapeObject, WorkspaceDocument, WorkspaceObject } from '../../../../shared/contracts/workspace';
import { getInitialItemsFromDoc, syncWhiteboardItemsToDocument } from '../../persistence/canvasItemsStore';
import type { WhiteboardItem } from '../../types';

function createShape(id: string, overrides: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id,
    shape_type: 'rectangle',
    x: 10,
    y: 20,
    width: 180,
    height: 100,
    rotation: 0,
    fill: '#0f172a',
    stroke: '#3b82f6',
    stroke_width: 2,
    ...overrides,
  };
}

function createDocument(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: 'whiteboard-1',
    title: 'Architecture board',
    kind: 'Whiteboard',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    ...overrides,
  };
}

function createItem(id: string, text: string): WhiteboardItem {
  return { id, type: 'process', x: 10, y: 20, width: 180, height: 100, text };
}

describe('Whiteboard document item synchronization', () => {
  it('preserves an intentionally empty canonical board across synchronization and reload', () => {
    const externalReference: WorkspaceObject = {
      type: 'WorkspaceReference',
      data: { id: 'ref-1', uri: 'vgt://workspace/doc/anchor', mode: 'Live' },
    };
    const document = createDocument({
      root_object_ids: ['ref-1'],
      objects: { 'ref-1': externalReference },
      whiteboardData: { items: [] },
    });

    expect(getInitialItemsFromDoc(document)).toEqual([]);

    const synchronized = syncWhiteboardItemsToDocument([], document);

    expect(synchronized.whiteboardData?.items).toEqual([]);
    expect(synchronized.root_object_ids).toEqual(['ref-1']);
    expect(getInitialItemsFromDoc(synchronized)).toEqual([]);
  });

  it('replaces Whiteboard roots while preserving unrelated WOM roots and objects', () => {
    const externalReference: WorkspaceObject = {
      type: 'WorkspaceReference',
      data: { id: 'ref-1', uri: 'vgt://workspace/doc/anchor', mode: 'Live' },
    };
    const unrelatedShape: WorkspaceObject = { type: 'Shape', data: createShape('foreign-shape') };
    const previousItem = createItem('old-item', 'Previous');
    const nextItem = createItem('new-item', 'Current');
    const document = createDocument({
      root_object_ids: ['old-item', 'ref-1', 'foreign-shape'],
      objects: {
        'old-item': { type: 'Shape', data: createShape('old-item') },
        'ref-1': externalReference,
        'foreign-shape': unrelatedShape,
      },
      whiteboardData: { items: [previousItem] },
    });

    const synchronized = syncWhiteboardItemsToDocument([nextItem], document);

    expect(synchronized.root_object_ids).toEqual(['ref-1', 'foreign-shape', 'new-item']);
    expect(synchronized.objects['old-item']).toBeUndefined();
    expect(synchronized.objects['ref-1']).toEqual(externalReference);
    expect(synchronized.objects['foreign-shape']).toEqual(unrelatedShape);
    expect(synchronized.objects['new-item']).toEqual({ type: 'Shape', data: createShape('new-item', { text: 'Current' }) });
    expect(getInitialItemsFromDoc(synchronized)).toEqual([nextItem]);
  });

  it('migrates legacy Shape objects into canonical Whiteboard items and reloads them', () => {
    const legacyShape = createShape('legacy-sticky', { fill: '#fef9c3', text: 'Migrated note' });
    const document = createDocument({
      root_object_ids: ['legacy-sticky'],
      objects: { 'legacy-sticky': { type: 'Shape', data: legacyShape } },
    });

    const migratedItems = getInitialItemsFromDoc(document);
    expect(migratedItems).toEqual([{
      id: 'legacy-sticky',
      type: 'sticky',
      x: 10,
      y: 20,
      width: 180,
      height: 100,
      text: 'Migrated note',
      color: 'yellow',
    }]);

    const synchronized = syncWhiteboardItemsToDocument(migratedItems, document);

    expect(synchronized.whiteboardData?.items).toEqual(migratedItems);
    expect(getInitialItemsFromDoc(synchronized)).toEqual(migratedItems);
  });
});
