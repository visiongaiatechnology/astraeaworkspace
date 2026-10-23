// STATUS: PLATIN — mind-map authoring: one deterministic engine, two callers (panel button + keyboard).
import { describe, expect, it } from 'vitest';
import {
  WHITEBOARD_MINDMAP_MAX_CHILDREN_PER_NODE,
  addWhiteboardMindMapChild,
  buildWhiteboardConnectorPaths,
} from '../../model/whiteboardDiagramEngine';
import { resolveWhiteboardKeyboardCommand } from '../../selection/whiteboardKeyboardEngine';
import { WhiteboardDiagramPanel } from '../../tools/WhiteboardDiagramPanel';
import { WHITEBOARD_OBJECTS_COPY } from '../../whiteboardObjectsLocale';
import { renderWithWhiteboardLocale } from '../support/whiteboardLocaleProbe';
import { WHITEBOARD_MAX_ITEMS } from '../../viewport/whiteboardViewportEngine';
import type { WhiteboardItem } from '../../types';

const noop = (): void => undefined;
/** One locale per render, pinned through the real provider — no shared module mock. */
const LOCALE = 'en-US' as const;

const root = (overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id: 'root', type: 'shape', x: 0, y: 0, width: 200, height: 100, text: 'Central idea',
  diagram: { family: 'mind-map', kind: 'mind-topic', title: 'Central idea' },
  shape: { kind: 'rounded-rectangle', fill: '#0f172a', stroke: '#38bdf8', strokeWidth: 2 },
  zIndex: 10,
  ...overrides,
});

describe('Whiteboard mind-map child node (AST-1081)', () => {
  it('adds a child node and a canonical connector to the selected parent', () => {
    const result = addWhiteboardMindMapChild([root()], 'root');
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(3);
    const child = result.items.find((item) => item.id === result.newNodeId);
    expect(child).toMatchObject({
      type: 'shape',
      x: 360,
      y: 0,
      diagram: { family: 'mind-map', kind: 'mind-topic' },
    });
    const edge = result.items.find((item) => item.id === result.connectorId);
    expect(edge).toMatchObject({
      type: 'connector', fromId: 'root', toId: result.newNodeId,
      fromAnchor: 'auto', toAnchor: 'auto', connectorStyle: { route: 'curved', autoRoute: true },
    });
    // The structure is real: the routing engine resolves the new edge.
    expect(buildWhiteboardConnectorPaths(result.items).has(result.connectorId!)).toBe(true);
  });

  it('places siblings deterministically on alternating sides', () => {
    const first = addWhiteboardMindMapChild([root()], 'root');
    const second = addWhiteboardMindMapChild(first.items, 'root');
    const third = addWhiteboardMindMapChild(second.items, 'root');
    const positions = [first, second, third].map((result) => {
      const child = result.items.find((item) => item.id === result.newNodeId);
      return { x: child?.x, y: child?.y };
    });
    expect(positions).toEqual([{ x: 360, y: 0 }, { x: -340, y: 0 }, { x: 360, y: 110 }]);
    // Same input, same output: no clock, no randomness in the placement rule.
    const repeated = addWhiteboardMindMapChild([root()], 'root');
    expect(repeated.items.find((item) => item.id === repeated.newNodeId)).toMatchObject({ x: 360, y: 0 });
  });

  it('rejects a missing or connector parent, and the per-node child ceiling', () => {
    expect(addWhiteboardMindMapChild([root()], 'missing')).toMatchObject({ ok: false });
    expect(addWhiteboardMindMapChild([root(), { id: 'edge', type: 'connector', x: 0, y: 0, width: 1, height: 1, text: '' }], 'edge')).toMatchObject({ ok: false });
    let items: WhiteboardItem[] = [root()];
    for (let index = 0; index < WHITEBOARD_MINDMAP_MAX_CHILDREN_PER_NODE; index += 1) {
      const step = addWhiteboardMindMapChild(items, 'root');
      expect(step.ok).toBe(true);
      items = step.items;
    }
    const overflow = addWhiteboardMindMapChild(items, 'root');
    expect(overflow.ok).toBe(false);
    expect(overflow.items).toBe(items);
  });

  it('rejects a board at the canonical object ceiling', () => {
    const full = new Array<WhiteboardItem>(WHITEBOARD_MAX_ITEMS);
    expect(addWhiteboardMindMapChild(full, 'root')).toMatchObject({ ok: false });
  });
});

describe('Whiteboard mind-map keyboard path', () => {
  it('binds Ctrl/Cmd+Enter to adding a child node, and only with a selection', () => {
    const base = { key: 'Enter', shiftKey: false, ctrlKey: true, metaKey: false, altKey: false };
    expect(resolveWhiteboardKeyboardCommand(base, { step: 24, editingText: false, hasSelection: true }))
      .toEqual({ kind: 'add-child-node' });
    expect(resolveWhiteboardKeyboardCommand({ ...base, ctrlKey: false, metaKey: true }, { step: 1, editingText: false, hasSelection: true }))
      .toEqual({ kind: 'add-child-node' });
    expect(resolveWhiteboardKeyboardCommand(base, { step: 24, editingText: false, hasSelection: false })).toBeNull();
    expect(resolveWhiteboardKeyboardCommand(base, { step: 24, editingText: true, hasSelection: true })).toBeNull();
    expect(resolveWhiteboardKeyboardCommand({ ...base, key: 'Enter', ctrlKey: false }, { step: 24, editingText: false, hasSelection: true })).toBeNull();
  });

  it('exposes the same capability as a keyboard reachable panel button', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardDiagramPanel
        items={[root()]}
        selectedIds={['root']}
        origin={{ x: 0, y: 0 }}
        updateItems={noop}
        onAddChildNode={noop}
        onClose={noop}
        showToast={noop}
      />,
      LOCALE,
    );
    const copy = WHITEBOARD_OBJECTS_COPY[LOCALE];
    expect(markup).toContain('data-vgt-whiteboard-add-child="true"');
    expect(markup).toContain(copy.addChildNode);
    expect(markup).toContain(copy.addChildNodeTitle);
  });

  it('disables the panel button without a selection', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardDiagramPanel items={[root()]} selectedIds={[]} origin={{ x: 0, y: 0 }} updateItems={noop} onAddChildNode={noop} onClose={noop} showToast={noop} />,
      LOCALE,
    );
    expect(markup).toContain('disabled=""');
  });
});
