// STATUS: PLATIN — multi-select operations are undoable and keep object identities stable (AST-1093).
import { describe, expect, it } from 'vitest';
import {
  applyWhiteboardHistoryEntry,
  createWhiteboardHistory,
  createWhiteboardItemHistoryEntry,
  recordWhiteboardHistory,
  stepWhiteboardHistory,
} from '../../history/whiteboardDocumentHistory';
import { detectChangedWhiteboardItemIds } from '../../model/whiteboardCollaborationEngine';
import {
  expandSelectionForGroup,
  groupWhiteboardSelection,
  layerWhiteboardSelection,
  ungroupWhiteboardSelection,
} from '../../model/whiteboardManipulationEngine';
import { marqueeWhiteboardSelection } from '../../selection/whiteboardMarqueeEngine';
import type { WhiteboardItem } from '../../types';

const DOCUMENT_ID = 'whiteboard-multiselect';

const node = (id: string, x: number, y: number, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id, type: 'process', x, y, width: 100, height: 60, text: id, ...overrides,
});

/** Replays the canonical mutation + history boundary the manipulation hook uses. */
function applyMutation(
  historyState: ReturnType<typeof createWhiteboardHistory>,
  items: WhiteboardItem[],
  mutate: (previous: WhiteboardItem[]) => WhiteboardItem[],
  coalesceKey?: string,
) {
  const next = mutate(items);
  const changedIds = detectChangedWhiteboardItemIds(items, next);
  const entry = createWhiteboardItemHistoryEntry(DOCUMENT_ID, items, next, changedIds, coalesceKey);
  return { items: next, history: recordWhiteboardHistory(historyState, entry) };
}

describe('Whiteboard multi-select operations are undoable with stable identities (AST-1093)', () => {
  it('deletes a marquee selection including its connectors, and undo restores exactly those objects', () => {
    const items: WhiteboardItem[] = [
      node('a', 0, 0),
      node('b', 200, 0),
      node('c', 400, 0),
      node('d', 600, 0),
      { id: 'edge', type: 'connector', x: 0, y: 0, width: 1, height: 1, text: '', fromId: 'b', toId: 'c' },
    ];
    const marquee = marqueeWhiteboardSelection(items, { x: -10, y: -10, width: 520, height: 200 }, { mode: 'contain' });
    expect(marquee.ok).toBe(true);
    if (!marquee.ok) return;
    const selected = new Set(expandSelectionForGroup(items, marquee.ids));
    expect([...selected].sort()).toEqual(['a', 'b', 'c']);

    let history = createWhiteboardHistory(DOCUMENT_ID);
    const deleted = applyMutation(history, items, (previous) => previous.filter((item) =>
      !selected.has(item.id) && !selected.has(item.fromId ?? '') && !selected.has(item.toId ?? '')));
    history = deleted.history;
    expect(deleted.items.map((item) => item.id)).toEqual(['d']);

    const undoStep = stepWhiteboardHistory(history, 'undo');
    const restored = applyWhiteboardHistoryEntry({ items: deleted.items }, undoStep.entry!, 'undo');
    expect([...restored.items].map((item) => item.id).sort()).toEqual(['a', 'b', 'c', 'd', 'edge']);
    expect(restored.items.find((item) => item.id === 'a')).toEqual(items[0]);
    expect(restored.items.find((item) => item.id === 'edge')).toEqual(items[4]);

    const redoStep = stepWhiteboardHistory(undoStep.state, 'redo');
    const redone = applyWhiteboardHistoryEntry({ items: restored.items }, redoStep.entry!, 'redo');
    expect(redone.items.map((item) => item.id)).toEqual(['d']);
  });

  it('groups and ungroups a multi-selection without inventing or losing identities', () => {
    const items: WhiteboardItem[] = [node('a', 0, 0), node('b', 200, 0), node('c', 400, 0)];
    const ids = new Set(['a', 'b', 'c']);

    const grouped = applyMutation(createWhiteboardHistory(DOCUMENT_ID), items, (previous) => groupWhiteboardSelection(previous, ids, 'group-1'));
    expect(grouped.items.map((item) => item.id)).toEqual(items.map((item) => item.id));
    expect(grouped.items.every((item) => item.groupId === 'group-1')).toBe(true);

    const undone = applyWhiteboardHistoryEntry({ items: grouped.items }, stepWhiteboardHistory(grouped.history, 'undo').entry!, 'undo');
    expect(undone.items.map((item) => item.id)).toEqual(items.map((item) => item.id));
    expect(undone.items.every((item) => item.groupId === undefined)).toBe(true);

    const ungrouped = applyMutation(grouped.history, grouped.items, (previous) => ungroupWhiteboardSelection(previous, ids));
    expect(ungrouped.items.every((item) => item.groupId === undefined)).toBe(true);
    const regrouped = applyWhiteboardHistoryEntry({ items: ungrouped.items }, stepWhiteboardHistory(ungrouped.history, 'undo').entry!, 'undo');
    expect(regrouped.items.every((item) => item.groupId === 'group-1')).toBe(true);
  });

  it('restores the exact stacking order after a multi-select layer change', () => {
    const items: WhiteboardItem[] = [
      node('a', 0, 0, { zIndex: 1 }),
      node('b', 200, 0, { zIndex: 2 }),
      node('c', 400, 0, { zIndex: 3 }),
    ];
    const ids = new Set(['a', 'b']);
    const layered = applyMutation(createWhiteboardHistory(DOCUMENT_ID), items, (previous) => layerWhiteboardSelection(previous, ids, 'front'));
    expect(layered.items.find((item) => item.id === 'c')?.zIndex).toBe(3);
    expect((layered.items.find((item) => item.id === 'a')?.zIndex ?? 0)).toBeGreaterThan(3);

    const undone = applyWhiteboardHistoryEntry({ items: layered.items }, stepWhiteboardHistory(layered.history, 'undo').entry!, 'undo');
    expect(undone.items.map((item) => item.zIndex)).toEqual([1, 2, 3]);
  });

  it('keeps ids stable for the same operation regardless of selection order', () => {
    const items: WhiteboardItem[] = [node('a', 0, 0), node('b', 200, 0), node('c', 400, 0)];
    const forward = applyMutation(createWhiteboardHistory(DOCUMENT_ID), items, (previous) => groupWhiteboardSelection(previous, new Set(['a', 'b', 'c']), 'fixed-group'));
    const reverse = applyMutation(createWhiteboardHistory(DOCUMENT_ID), items, (previous) => groupWhiteboardSelection(previous, new Set(['c', 'b', 'a']), 'fixed-group'));
    expect(forward.items).toEqual(reverse.items);
    expect(forward.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});
