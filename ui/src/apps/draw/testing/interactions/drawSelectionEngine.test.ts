// STATUS: GOLD — keyboard intent table and selection set algebra, written from the UI contract.
import { describe, expect, it } from 'vitest';
import { DrawModelError } from '../../model/drawDocumentValidation';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import {
  cycleDrawSelection,
  moveStepForViewport,
  normalizeDrawSelection,
  primaryDrawSelection,
  resolveDrawSelectionCommand,
  selectionRoots,
  summarizeDrawSelection,
  toggleDrawSelection,
} from '../../interactions/drawSelectionEngine';
import { buildDrawModel, overlappingModel } from './drawInteractionFixtures';

function key(partial: Partial<{ key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) {
  return { key: 'x', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...partial };
}

const context = { step: 16, editingText: false };

describe('Draw selection keyboard contract', () => {
  it('maps every essential canvas function to a key', () => {
    expect(resolveDrawSelectionCommand(key({ key: 'Tab' }), context)).toEqual({ kind: 'select-next' });
    expect(resolveDrawSelectionCommand(key({ key: 'Tab', shiftKey: true }), context)).toEqual({ kind: 'select-previous' });
    expect(resolveDrawSelectionCommand(key({ key: 'ArrowRight' }), context)).toEqual({ kind: 'move', delta: { x: 16, y: 0 } });
    expect(resolveDrawSelectionCommand(key({ key: 'ArrowLeft' }), context)).toEqual({ kind: 'move', delta: { x: -16, y: 0 } });
    expect(resolveDrawSelectionCommand(key({ key: 'ArrowUp' }), context)).toEqual({ kind: 'move', delta: { x: 0, y: -16 } });
    expect(resolveDrawSelectionCommand(key({ key: 'ArrowDown' }), context)).toEqual({ kind: 'move', delta: { x: 0, y: 16 } });
    expect(resolveDrawSelectionCommand(key({ key: 'ArrowRight', shiftKey: true }), context))
      .toEqual({ kind: 'move', delta: { x: 160, y: 0 } });
    expect(resolveDrawSelectionCommand(key({ key: 'Delete' }), context)).toEqual({ kind: 'delete' });
    expect(resolveDrawSelectionCommand(key({ key: 'Backspace' }), context)).toEqual({ kind: 'delete' });
    expect(resolveDrawSelectionCommand(key({ key: 'Escape' }), context)).toEqual({ kind: 'cancel' });
    expect(resolveDrawSelectionCommand(key({ key: 'F2' }), context)).toEqual({ kind: 'edit-text' });
    expect(resolveDrawSelectionCommand(key({ key: 'a', ctrlKey: true }), context)).toEqual({ kind: 'select-all' });
    expect(resolveDrawSelectionCommand(key({ key: 'g', ctrlKey: true }), context)).toEqual({ kind: 'group' });
    expect(resolveDrawSelectionCommand(key({ key: 'g', ctrlKey: true, shiftKey: true }), context)).toEqual({ kind: 'ungroup' });
    expect(resolveDrawSelectionCommand(key({ key: ']', ctrlKey: true }), context)).toEqual({ kind: 'z-order', action: 'forward' });
    expect(resolveDrawSelectionCommand(key({ key: '[', ctrlKey: true }), context)).toEqual({ kind: 'z-order', action: 'backward' });
    expect(resolveDrawSelectionCommand(key({ key: ']', ctrlKey: true, shiftKey: true }), context)).toEqual({ kind: 'z-order', action: 'front' });
    expect(resolveDrawSelectionCommand(key({ key: '[', metaKey: true, shiftKey: true }), context)).toEqual({ kind: 'z-order', action: 'back' });
    expect(resolveDrawSelectionCommand(key({ key: 'S', ctrlKey: true, shiftKey: true }), context)).toEqual({ kind: 'toggle-snap' });
  });

  it('leaves unrelated keys to the browser so focus order and typing keep working', () => {
    expect(resolveDrawSelectionCommand(key({ key: 'a' }), context)).toBeNull();
    expect(resolveDrawSelectionCommand(key({ key: 'Enter' }), context)).toBeNull();
    expect(resolveDrawSelectionCommand(key({ key: ' ' }), context)).toBeNull();
    expect(resolveDrawSelectionCommand(key({ key: 'p', ctrlKey: true }), context)).toBeNull();
    expect(resolveDrawSelectionCommand(key({ key: 'z', ctrlKey: true }), context)).toBeNull();
  });

  it('releases every movement key while direct text editing is active', () => {
    const editing = { step: 16, editingText: true };
    for (const name of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Tab', 'Delete', 'Backspace']) {
      expect(resolveDrawSelectionCommand(key({ key: name }), editing), name).toBeNull();
    }
    expect(resolveDrawSelectionCommand(key({ key: 'Escape' }), editing)).toEqual({ kind: 'cancel' });
  });

  it('derives the arrow-key step from the grid, falling back to one unit', () => {
    expect(moveStepForViewport({ snapToGrid: true, gridSize: 16 })).toBe(16);
    expect(moveStepForViewport({ snapToGrid: false, gridSize: 16 })).toBe(1);
    expect(moveStepForViewport({ snapToGrid: true, gridSize: 8 })).toBe(8);
    expect(() => moveStepForViewport({ snapToGrid: true, gridSize: 0 })).toThrowError(DrawModelError);
  });

  it('rejects a malformed keyboard event instead of guessing', () => {
    expect(() => resolveDrawSelectionCommand({ key: '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, context))
      .toThrowError(DrawModelError);
  });
});

describe('Draw selection set algebra', () => {
  it('replaces, toggles and adds without duplicating ids', () => {
    expect(toggleDrawSelection(['a', 'b'], 'c', 'replace')).toEqual(['c']);
    expect(toggleDrawSelection(['a', 'b'], 'c', 'add')).toEqual(['a', 'b', 'c']);
    expect(toggleDrawSelection(['a', 'b'], 'a', 'add')).toEqual(['a', 'b']);
    expect(toggleDrawSelection(['a', 'b'], 'a', 'toggle')).toEqual(['b']);
    expect(toggleDrawSelection(['a'], 'b', 'toggle')).toEqual(['a', 'b']);
    expect(() => toggleDrawSelection([], '', 'replace')).toThrowError(DrawModelError);
  });

  it('drops stale and hidden ids and expands groups', () => {
    const scene = projectDrawScene(overlappingModel(), 'page-1');
    expect(normalizeDrawSelection(scene, ['low', 'ghost', 'hidden-shape'])).toEqual(['low']);
    expect(normalizeDrawSelection(scene, ['low', 'low', 'low'])).toEqual(['low']);
  });

  it('summarizes which ids are locked, connectors or groups', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'free', x: 0, y: 0 },
        { id: 'pinned', x: 0, y: 0, locked: true },
        { id: 'group', type: 'group', x: 0, y: 0, width: 10, height: 10 },
      ],
    });
    const scene = projectDrawScene(model, 'page-1');
    const summary = summarizeDrawSelection(scene, ['free', 'pinned', 'group']);
    expect(summary.lockedIds).toEqual(['pinned']);
    expect([...summary.writableIds].sort()).toEqual(['free', 'group']);
    expect(summary.groupIds).toEqual(['group']);
    expect(summary.multi).toBe(true);
    expect(primaryDrawSelection(scene, ['pinned', 'free'])).toBe('free');
    expect(primaryDrawSelection(scene, ['pinned'])).toBeNull();
  });

  it('cycles selection topmost-first, skips locked objects, and wraps in both directions', () => {
    const scene = projectDrawScene(overlappingModel(), 'page-1');
    const order = scene.hitOrder
      .filter((entry) => entry.visible && !entry.locked)
      .map((entry) => entry.object.id);
    expect(order).toEqual(['high', 'outside', 'low']);
    expect(cycleDrawSelection(scene, [], 1)).toEqual(['high']);
    expect(cycleDrawSelection(scene, [], -1)).toEqual(['low']);
    expect(cycleDrawSelection(scene, ['high'], 1)).toEqual(['outside']);
    expect(cycleDrawSelection(scene, ['low'], 1)).toEqual(['high']);
    expect(cycleDrawSelection(scene, ['high'], -1)).toEqual(['low']);
    expect(cycleDrawSelection(scene, ['stale'], 1)).toEqual(['high']);
    // Locked objects stay reachable when the caller explicitly asks for them.
    expect(cycleDrawSelection(scene, [], 1, { includeLocked: true })).toEqual(['locked-shape']);
    expect(cycleDrawSelection(scene, [], 1, { includeLocked: true })).not.toContain('hidden-shape');
  });

  it('collapses a child selection onto its group root exactly once', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'child-a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'child-b', x: 20, y: 0, width: 10, height: 10 },
        { id: 'group-x', type: 'group', x: 0, y: 0, width: 30, height: 10, childIds: ['child-a', 'child-b'] },
      ],
    });
    const linked = {
      ...model,
      objects: {
        ...model.objects,
        'child-a': { ...model.objects['child-a']!, parentGroupId: 'group-x' },
        'child-b': { ...model.objects['child-b']!, parentGroupId: 'group-x' },
      },
    };
    const scene = projectDrawScene(linked, 'page-1');
    expect(selectionRoots(scene, ['child-a', 'child-b'])).toEqual(['group-x']);
  });
});
