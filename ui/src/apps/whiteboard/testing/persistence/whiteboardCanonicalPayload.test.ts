// STATUS: PLATIN — Save→Close→Reopen identity for the Whiteboard payload through the canonical
// platform serializer (the same proof PDF Studio established, `apps/pdf/persistence/pdfStudioPersistence.ts`).
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';
import { syncWhiteboardItemsToDocument, syncWhiteboardViewToDocument, loadWhiteboardItemsFromDocument } from '../../persistence/canvasItemsStore';
import { normalizeWhiteboardViewConfig, zoomAroundScreenPoint } from '../../viewport/whiteboardViewportEngine';
import { normalizeWhiteboardRichObject } from '../../model/whiteboardObjectEngine';
import { normalizeWhiteboardDiagramItem, addWhiteboardMindMapChild } from '../../model/whiteboardDiagramEngine';
import { normalizeWhiteboardManipulationMetadata } from '../../model/whiteboardManipulationEngine';
import { normalizeWhiteboardItemTextStyle } from '../../model/whiteboardTextStyleEngine';
import { describeWhiteboardItem, whiteboardKeyboardOrder } from '../../a11y/whiteboardAccessibilityEngine';
import type { WhiteboardItem } from '../../types';

const normalize = (items: WhiteboardItem[]): WhiteboardItem[] => items
  .map(normalizeWhiteboardRichObject)
  .map(normalizeWhiteboardItemTextStyle)
  .map(normalizeWhiteboardManipulationMetadata)
  .map(normalizeWhiteboardDiagramItem);

function createDocument(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: 'whiteboard-save-reopen',
    title: 'Workshop board',
    kind: 'Whiteboard',
    created_at: 1_000,
    modified_at: 1_000,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    ...overrides,
  };
}

/** Every payload family the tracker names for the persistence layer, in one board. */
function createPayloadItems(): WhiteboardItem[] {
  const ink: WhiteboardItem = {
    id: 'ink-1', type: 'ink', x: 10, y: 10, width: 200, height: 120, text: '',
    ink: {
      preset: 'pen', inputType: 'pen', color: '#60a5fa', width: 3.5, opacity: 0.9,
      arrowStart: false, arrowEnd: true, recognizedShape: 'line',
      points: [
        { x: 0, y: 0, t: 0, pressure: 0.4, tiltX: -1, tiltY: 2 },
        { x: 20, y: 12, t: 8, pressure: 0.6, tiltX: -1, tiltY: 2 },
        { x: 44, y: 4, t: 16, pressure: 0.8, tiltX: 0, tiltY: 1 },
      ],
    },
  };
  const shape: WhiteboardItem = {
    id: 'node-a', type: 'process', x: 300, y: 40, width: 200, height: 90, text: 'Gateway',
    zIndex: 4, groupId: 'group-1', tags: ['workshop'], rotation: 12.5, locked: true,
    linkUri: 'vgt://workspace/doc/anchor',
    constraints: { moveAxis: 'horizontal', lockAspectRatio: true, minWidth: 60, maxWidth: 400 },
    textStyle: { fontSize: 20, fontWeight: 'bold', fontFamily: 'mono', align: 'center' },
  };
  const hidden: WhiteboardItem = { id: 'node-b', type: 'sticky', x: 620, y: 40, width: 180, height: 140, text: 'Secret', color: 'cyan', hidden: true, groupId: 'group-1', zIndex: 9 };
  const card: WhiteboardItem = {
    id: 'card-1', type: 'card', x: 300, y: 220, width: 260, height: 150, text: 'Task',
    card: { cardKind: 'task', title: 'Task', subtitle: 'Subtitle', status: 'In progress', tags: ['a', 'b'], sourceUri: 'vgt://workspace/task/1' },
  };
  const chart: WhiteboardItem = { id: 'chart-1', type: 'chart', x: 620, y: 220, width: 260, height: 180, text: '', chart: { chartKind: 'donut', labels: ['A', 'B'], values: [3, 7], title: 'Split' } };
  const image: WhiteboardItem = { id: 'image-1', type: 'image', x: 40, y: 420, width: 160, height: 120, text: '', name: 'shot.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
  return [ink, shape, hidden, card, chart, image];
}

function createConnectorItems(): WhiteboardItem[] {
  return [
    { id: 'from', type: 'process', x: 0, y: 0, width: 200, height: 100, text: 'From' },
    { id: 'to', type: 'terminal', x: 500, y: 300, width: 180, height: 80, text: 'To' },
    {
      id: 'edge-1', type: 'connector', x: 0, y: 0, width: 1, height: 1, text: '',
      fromId: 'from', toId: 'to', fromAnchor: 'bottom', toAnchor: 'left', lineLabel: 'handoff',
      connectorStyle: { route: 'orthogonal', autoRoute: true },
    },
  ];
}

describe('Whiteboard canonical payload identity (Save → Close → Reopen)', () => {
  it('keeps every object family identical through the canonical serializer', () => {
    const items = normalize(createPayloadItems());
    const document = syncWhiteboardItemsToDocument(items, createDocument());

    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(document));
    const loaded = loadWhiteboardItemsFromDocument(reopened);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const expected = normalize(loaded.items);
    expect(expected).toEqual(items);
    // Ink geometry survives point by point (AST-1028) …
    const ink = expected.find((item) => item.id === 'ink-1');
    expect(ink?.ink?.points).toHaveLength(3);
    expect(ink?.ink?.points[1]).toEqual(items[0].ink?.points[1]);
    expect(ink?.ink?.color).toBe('#60a5fa');
    expect(ink?.ink?.arrowEnd).toBe(true);
    // … and so does typography (AST-1046/1047) and the object state the a11y layer reads (AST-1118).
    const styled = expected.find((item) => item.id === 'node-a');
    expect(styled?.textStyle).toEqual({ fontSize: 20, fontWeight: 'bold', fontFamily: 'mono', align: 'center' });
    expect(styled?.locked).toBe(true);
    expect(styled?.groupId).toBe('group-1');
    expect(styled?.hidden).toBeUndefined();
    expect(expected.find((item) => item.id === 'node-b')?.hidden).toBe(true);
  });

  it('keeps connector endpoints, anchors and route identical (AST-1038)', () => {
    const items = normalize(createConnectorItems());
    const document = syncWhiteboardItemsToDocument(items, createDocument());
    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(document));
    const loaded = loadWhiteboardItemsFromDocument(reopened);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const edge = loaded.items.find((item) => item.id === 'edge-1');
    expect(edge).toMatchObject({
      type: 'connector', fromId: 'from', toId: 'to', fromAnchor: 'bottom', toAnchor: 'left',
      lineLabel: 'handoff', connectorStyle: { route: 'orthogonal', autoRoute: true },
    });
  });

  it('keeps the persisted view configuration identical, including guides, grid and snap flags (AST-1043)', () => {
    const view = normalizeWhiteboardViewConfig({
      backgroundStyle: 'grid',
      gridSize: 32,
      showRulers: false,
      snapToGrid: false,
      snapToGuides: true,
      guides: [{ id: 'guide-x', axis: 'x', position: 240 }, { id: 'guide-y', axis: 'y', position: -80 }],
      bookmarks: [{ id: 'loc-1', name: 'Kickoff', x: 120, y: 60, zoom: 0.5 }],
      presentationPath: ['frame-1'],
    });
    const items = normalize([{ id: 'frame-1', type: 'frame', x: 0, y: 0, width: 640, height: 360, text: 'Frame' }]);
    const withItems = syncWhiteboardItemsToDocument(items, createDocument());
    const document = syncWhiteboardViewToDocument(view, withItems);

    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(document));
    expect(normalizeWhiteboardViewConfig(reopened.whiteboardData?.view)).toEqual(view);
  });

  it('reproduces the a11y order and descriptions after a reopen (AST-1118)', () => {
    const items = normalize([
      { id: 'a', type: 'sticky', x: 0, y: 0, width: 100, height: 80, text: 'Alpha', color: 'yellow', zIndex: 1 },
      { id: 'b', type: 'process', x: 200, y: 0, width: 100, height: 80, text: 'Beta', zIndex: 5, locked: true },
      { id: 'c', type: 'sticky', x: 400, y: 0, width: 100, height: 80, text: 'Gamma', hidden: true, zIndex: 9 },
    ]);
    const document = syncWhiteboardItemsToDocument(items, createDocument());
    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(document));
    const loaded = loadWhiteboardItemsFromDocument(reopened);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(whiteboardKeyboardOrder(loaded.items).map((item) => item.id)).toEqual(['b', 'a']);
    expect(whiteboardKeyboardOrder(loaded.items).map((item) => describeWhiteboardItem(item, 'en-US')))
      .toEqual(whiteboardKeyboardOrder(items).map((item) => describeWhiteboardItem(item, 'en-US')));
  });

  it('keeps a mind-map child node and its connector through the round trip (AST-1081 structure)', () => {
    const root: WhiteboardItem = { id: 'root', type: 'shape', x: 0, y: 0, width: 200, height: 100, text: 'Central', diagram: { family: 'mind-map', kind: 'mind-topic', title: 'Central' } };
    const added = addWhiteboardMindMapChild(normalize([root]), 'root');
    expect(added.ok).toBe(true);
    const items = normalize(added.items);
    const document = syncWhiteboardItemsToDocument(items, createDocument());
    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(document));
    const loaded = loadWhiteboardItemsFromDocument(reopened);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const child = loaded.items.find((item) => item.id === added.newNodeId);
    expect(child?.diagram).toMatchObject({ family: 'mind-map', kind: 'mind-topic' });
    const edge = loaded.items.find((item) => item.type === 'connector');
    expect(edge).toMatchObject({ fromId: 'root', toId: added.newNodeId, connectorStyle: { route: 'curved' } });
  });

  it('is position-preserving when zooming out to 10 percent and back (AST-1018)', () => {
    const anchor = { x: 640, y: 360 };
    const start = { pan: { x: 80, y: 60 }, zoom: 1 };
    const out = zoomAroundScreenPoint(start.pan, start.zoom, 0.1, anchor);
    expect(out.zoom).toBe(0.1);
    // The world point under the cursor is unchanged by the zoom step.
    const worldBefore = { x: (anchor.x - start.pan.x) / start.zoom, y: (anchor.y - start.pan.y) / start.zoom };
    const worldAfter = { x: (anchor.x - out.pan.x) / out.zoom, y: (anchor.y - out.pan.y) / out.zoom };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10);

    const back = zoomAroundScreenPoint(out.pan, out.zoom, 1, anchor);
    expect(back.zoom).toBeCloseTo(1, 12);
    expect(back.pan.x).toBeCloseTo(start.pan.x, 8);
    expect(back.pan.y).toBeCloseTo(start.pan.y, 8);
  });
});
