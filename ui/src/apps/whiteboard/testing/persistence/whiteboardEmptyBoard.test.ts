// STATUS: PLATIN — the board starts empty, and a structurally invalid persisted payload is rejected
// fail-closed instead of loading a partly corrupt board.
import { describe, expect, it } from 'vitest';
import type { ShapeObject, WorkspaceDocument, WorkspaceObject } from '../../../../shared/contracts/workspace';
import { getInitialItemsFromDoc, loadWhiteboardItemsFromDocument } from '../../persistence/canvasItemsStore';
import { WHITEBOARD_MAX_ITEMS } from '../../viewport/whiteboardViewportEngine';
import type { WhiteboardItem } from '../../types';

function createDocument(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: 'whiteboard-empty',
    title: 'New board',
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

function createShape(id: string, overrides: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id,
    shape_type: 'rectangle',
    x: 10,
    y: 20,
    width: 180,
    height: 100,
    rotation: 0,
    fill: '#0f2937',
    stroke: '#3b82f6',
    stroke_width: 2,
    ...overrides,
  };
}

describe('Whiteboard empty infinite canvas (AST-1011)', () => {
  it('starts a genuinely empty board when the document carries no canonical items', () => {
    const document = createDocument();
    expect(getInitialItemsFromDoc(document)).toEqual([]);
    expect(loadWhiteboardItemsFromDocument(document)).toEqual({ ok: true, items: [] });
  });

  it('does not invent sample content even when unrelated WOM objects exist', () => {
    const reference: WorkspaceObject = {
      type: 'WorkspaceReference',
      data: { id: 'ref-1', uri: 'vgt://workspace/doc/anchor', mode: 'Live' },
    };
    const document = createDocument({ root_object_ids: ['ref-1'], objects: { 'ref-1': reference } });
    expect(getInitialItemsFromDoc(document)).toEqual([]);
  });

  it('still migrates legacy Shape objects into canonical items', () => {
    const legacy = createShape('legacy-sticky', { fill: '#fef9c3', text: 'Migrated note' });
    const document = createDocument({
      root_object_ids: ['legacy-sticky'],
      objects: { 'legacy-sticky': { type: 'Shape', data: legacy } },
    });
    expect(getInitialItemsFromDoc(document)).toEqual([{
      id: 'legacy-sticky', type: 'sticky', x: 10, y: 20, width: 180, height: 100, text: 'Migrated note', color: 'yellow',
    }]);
  });

  it('preserves an intentionally empty canonical board', () => {
    const document = createDocument({ whiteboardData: { items: [] } });
    expect(loadWhiteboardItemsFromDocument(document)).toEqual({ ok: true, items: [] });
  });
});

describe('Whiteboard fail-closed payload load (AST-1114)', () => {
  it('rejects a payload that is not an item array', () => {
    const document = createDocument({ whiteboardData: { items: 'not-an-array' as unknown as WhiteboardItem[] } });
    const loaded = loadWhiteboardItemsFromDocument(document);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toContain('canonical item array');
  });

  it('rejects duplicated object identities instead of loading one of them silently', () => {
    const duplicated: WhiteboardItem[] = [
      { id: 'same', type: 'process', x: 0, y: 0, width: 10, height: 10, text: 'a' },
      { id: 'same', type: 'process', x: 20, y: 0, width: 10, height: 10, text: 'b' },
    ];
    const loaded = loadWhiteboardItemsFromDocument(createDocument({ whiteboardData: { items: duplicated } }));
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toContain('Duplicate or empty whiteboard object id');
  });

  it('rejects a board above the canonical object ceiling', () => {
    const oversized = new Array<WhiteboardItem>(WHITEBOARD_MAX_ITEMS + 1);
    const loaded = loadWhiteboardItemsFromDocument(createDocument({ whiteboardData: { items: oversized } }));
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toContain('ceiling exceeded');
  });

  it('accepts and normalises a valid payload', () => {
    const items: WhiteboardItem[] = [{ id: 'ok', type: 'process', x: -5, y: 10, width: 200, height: 90, text: 'Fine' }];
    const loaded = loadWhiteboardItemsFromDocument(createDocument({ whiteboardData: { items } }));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.items).toEqual(items);
  });
});
