// BATCH-PRESENT — canvas command executor contract (Paket 1, 2, 3, 8, 9, 10).
//
// The oracle values are hand-written from the requested behaviour, not read back from the code:
// "Mehrfachauswahl, Snap, Resize, Rotation und Flip bedienen" and "Objekte gruppieren, locken und
// vorne/hinten sortieren ohne Reihenfolgeverlust".
import { describe, expect, it } from 'vitest';
import type { PresentSceneObject, PresentShapeSceneObject, PresentTextSceneObject } from '../../../../shared/contracts/workspace';
import {
  PRESENT_MAX_DUPLICATE_BATCH,
  applyPresentCanvasCommand,
  isPresentCanvasCommand,
  type PresentCanvasCommandState,
} from '../../editor/presentCanvasCommands';
import type { PresentEditorCommand } from '../../editor/presentEditorCommands';
import { readPresentGroupId } from '../../canvas/model/presentObjectExtensions';

const text = (id: string, patch: Partial<PresentTextSceneObject> = {}): PresentTextSceneObject => ({
  id,
  kind: 'text',
  text: id,
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 10,
  fontSizePt: 18,
  color: '#ffffff',
  zIndex: 1,
  ...patch,
});

const state = (objects: PresentSceneObject[], selection: string[] = []): PresentCanvasCommandState => ({ objects, selection });

const run = (command: PresentEditorCommand, input: PresentCanvasCommandState) =>
  applyPresentCanvasCommand(command, input);

describe('Present canvas command executor', () => {
  it('moves a whole multi-selection by the delta and keeps relative offsets', () => {
    const objects = [text('a', { xPercent: 10 }), text('b', { xPercent: 40 })];
    const result = run({ type: 'nudge', dxPercent: 5, dyPercent: 0 }, state(objects, ['a', 'b']));
    expect(result).not.toBeNull();
    expect(result!.changed).toBe(true);
    expect(result!.state.objects.map((object) => object.xPercent)).toEqual([15, 45]);
    expect(result!.message).toBe('Move: 2 object(s).');
  });

  it('reports a blocked edge instead of silently doing nothing', () => {
    const objects = [text('a', { xPercent: 0 })];
    const result = run({ type: 'nudge', dxPercent: -5, dyPercent: 0 }, state(objects, ['a']));
    expect(result!.changed).toBe(false);
    expect(result!.message).toContain('slide edge');
  });

  it('never creates an undo entry for a locked selection', () => {
    const objects = [text('a', { locked: true })];
    const result = run({ type: 'nudge', dxPercent: 5, dyPercent: 0 }, state(objects, ['a']));
    expect(result!.changed).toBe(false);
    expect(result!.message).toContain('locked');
  });

  it('resizes and rotates only via the pure transform rules', () => {
    const objects = [text('a', { widthPercent: 20, heightPercent: 10, rotation: 0 })];
    const resized = run({ type: 'resize', dxPercent: 10, dyPercent: 5 }, state(objects, ['a']));
    expect([resized!.state.objects[0].widthPercent, resized!.state.objects[0].heightPercent]).toEqual([30, 15]);
    const rotated = run({ type: 'rotate', deltaDeg: 15 }, state(objects, ['a']));
    expect(rotated!.state.objects[0].rotation).toBe(15);
    expect(rotated!.message).toBe('Rotation 15°: 1 object(s).');
  });

  it('flips and reports the axis in words', () => {
    const objects = [text('a')];
    const flipped = run({ type: 'flip', axis: 'x' }, state(objects, ['a']));
    expect(flipped!.message).toBe('Flip horizontal: 1 object(s).');
    expect((flipped!.state.objects[0] as unknown as Record<string, unknown>).flipX).toBe(true);
  });

  it('refuses to delete locked objects and explains why', () => {
    const objects = [text('a'), text('b', { locked: true })];
    const refused = run({ type: 'delete-selection' }, state(objects, ['b']));
    expect(refused!.changed).toBe(false);
    expect(refused!.message).toBe('Delete refused: 1 locked object(s). Unlock first.');
    const partial = run({ type: 'delete-selection' }, state(objects, ['a', 'b']));
    expect(partial!.state.objects.map((object) => object.id)).toEqual(['b']);
    expect(partial!.message).toBe('Deleted 1 object(s); 1 locked object(s) kept.');
  });

  it('duplicates a group into a new group instead of merging it with the original', () => {
    const objects = [text('a'), text('b')];
    const grouped = run({ type: 'group' }, state(objects, ['a', 'b']));
    const groupedObjects = grouped!.state.objects;
    const originalGroup = readPresentGroupId(groupedObjects[0]);
    expect(originalGroup).not.toBeNull();

    const duplicated = run(
      { type: 'duplicate-selection' },
      state(groupedObjects, ['a', 'b']),
    );
    const copies = duplicated!.state.objects.slice(2);
    expect(copies).toHaveLength(2);
    const copyGroups = new Set(copies.map((copy) => readPresentGroupId(copy)));
    // Exactly one new group key, shared by both copies, different from the original group.
    expect(copyGroups.size).toBe(1);
    expect([...copyGroups][0]).not.toBe(originalGroup);
    // The copies keep holding the same group, so clicking one selects both copies again.
    expect(duplicated!.state.selection).toEqual(copies.map((copy) => copy.id));
    expect(duplicated!.message).toBe('Duplicated 2 object(s).');
  });

  it('bounds one duplicate command', () => {
    const many = Array.from({ length: PRESENT_MAX_DUPLICATE_BATCH + 10 }, (_, index) => text(`o${index}`));
    const result = run(
      { type: 'duplicate-selection' },
      state(many, many.map((object) => object.id)),
    );
    expect(result!.state.objects).toHaveLength(many.length + PRESENT_MAX_DUPLICATE_BATCH);
  });

  it('refuses to group fewer than two objects and says what to do', () => {
    const objects = [text('a')];
    const result = run({ type: 'group' }, state(objects, ['a']));
    expect(result!.changed).toBe(false);
    expect(result!.message).toBe('Select at least two objects to group.');
  });

  it('groups, expands the selection to all members and ungroups again', () => {
    const objects = [text('a'), text('b'), text('c')];
    const grouped = run({ type: 'group' }, state(objects, ['a', 'b']));
    expect(grouped!.state.selection).toEqual(['a', 'b']);
    const ungrouped = run({ type: 'ungroup' }, state(grouped!.state.objects, ['a']));
    expect(ungrouped!.state.objects.every((object) => readPresentGroupId(object) === null)).toBe(true);
    expect(ungrouped!.message).toBe('Ungrouped 2 objects.');
    const nothing = run({ type: 'ungroup' }, state(ungrouped!.state.objects, ['a']));
    expect(nothing!.message).toBe('The selected object is not part of a group.');
  });

  it('reorders layers without losing an object and reports an unchanged order honestly', () => {
    const objects: PresentShapeSceneObject[] = [
      { id: 'a', kind: 'shape', shape: 'rectangle', fillColor: '#111', strokeColor: '#222', strokeWidth: 1, xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10, zIndex: 1 },
      { id: 'b', kind: 'shape', shape: 'rectangle', fillColor: '#111', strokeColor: '#222', strokeWidth: 1, xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10, zIndex: 2 },
    ];
    const forward = run({ type: 'layer', action: 'forward' }, { objects, selection: ['a'] });
    expect(forward!.changed).toBe(true);
    // 'a' now renders above 'b': the dense z rank of 'a' is higher afterwards.
    const rank = (id: string) => forward!.state.objects.find((object) => object.id === id)!.zIndex ?? 0;
    expect(rank('a')).toBeGreaterThan(rank('b'));
    expect(forward!.state.objects).toHaveLength(2);

    const alreadyFront = run({ type: 'layer', action: 'forward' }, forward!.state);
    expect(alreadyFront!.changed).toBe(false);
    expect(alreadyFront!.message).toBe('Layer order unchanged (already at the front).');
    expect(alreadyFront!.state.objects).toHaveLength(2);
  });

  it('toggles the lock of the whole selection and reports the count', () => {
    const objects = [text('a'), text('b')];
    const locked = run({ type: 'toggle-lock' }, state(objects, ['a', 'b']));
    expect(locked!.state.objects.every((object) => object.locked)).toBe(true);
    expect(locked!.message).toBe('Locked 2 object(s).');
    const unlocked = run({ type: 'toggle-lock' }, state(locked!.state.objects, ['a', 'b']));
    expect(unlocked!.state.objects.every((object) => !object.locked)).toBe(true);
  });

  it('owns the selection commands and leaves the rest to the editor', () => {
    const objects = [text('a', { zIndex: 1 }), text('b', { zIndex: 2 })];
    const all = run({ type: 'select-all' }, state(objects, []));
    expect(all!.state.selection).toEqual(['a', 'b']);
    expect(all!.changed).toBe(false);

    const next = run({ type: 'select-next' }, state(objects, []));
    expect(next!.state.selection).toEqual(['a']);

    const toggleAdd = run({ type: 'toggle-object-selection', id: 'b', additive: true }, state(objects, ['a']));
    expect(toggleAdd!.state.selection).toEqual(['a', 'b']);
    const toggleRemove = run({ type: 'toggle-object-selection', id: 'b', additive: true }, state(objects, ['a', 'b']));
    expect(toggleRemove!.state.selection).toEqual(['a']);

    const cleared = run({ type: 'dismiss' }, state(objects, ['a']));
    expect(cleared!.state.selection).toEqual([]);
    expect(run({ type: 'dismiss' }, state(objects, []))).toBeNull();

    for (const command of [
      { type: 'undo' },
      { type: 'redo' },
      { type: 'next-slide' },
      { type: 'previous-slide' },
      { type: 'move-slide', delta: 1 },
      { type: 'start-presentation', fromCurrent: false },
    ] as PresentEditorCommand[]) {
      expect(run(command, state(objects, ['a'])), command.type).toBeNull();
      expect(isPresentCanvasCommand(command), command.type).toBe(false);
    }
  });

  it('answers "is this a canvas command" without needing any state', () => {
    for (const command of [
      { type: 'nudge', dxPercent: 1, dyPercent: 0 },
      { type: 'resize', dxPercent: 1, dyPercent: 0 },
      { type: 'rotate', deltaDeg: 5 },
      { type: 'flip', axis: 'y' },
      { type: 'delete-selection' },
      { type: 'duplicate-selection' },
      { type: 'layer', action: 'back' },
      { type: 'group' },
      { type: 'ungroup' },
      { type: 'toggle-lock' },
      { type: 'select-all' },
      { type: 'select-next' },
      { type: 'select-previous' },
      { type: 'toggle-object-selection', id: 'a', additive: false },
      { type: 'dismiss' },
    ] as PresentEditorCommand[]) {
      expect(isPresentCanvasCommand(command), command.type).toBe(true);
    }
  });
});
