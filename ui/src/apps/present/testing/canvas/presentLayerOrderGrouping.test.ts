// BATCH-PRESENT — layer order without loss and grouping (Paket 9). Hand-written oracle.
import { describe, expect, it } from 'vitest';
import type { PresentImageObject, PresentSceneObject } from '../../../../shared/contracts/workspace';
import {
  movePresentLayer,
  normalizePresentZOrder,
  presentLayerList,
  sortPresentLayers,
} from '../../canvas/model/presentScene';
import {
  PRESENT_MAX_GROUP_MEMBERS,
  expandPresentSelectionToGroups,
  groupPresentObjects,
  listPresentGroupIds,
  nextPresentGroupId,
  normalizePresentGroups,
  resolvePresentGroupMembers,
  setPresentGroupLocked,
  ungroupPresentObjects,
} from '../../canvas/model/presentGrouping';
import { readPresentGroupId } from '../../canvas/model/presentObjectExtensions';

const shape = (id: string, zIndex: number): PresentSceneObject =>
  ({ id, kind: 'shape', shape: 'rectangle', fillColor: '#000', strokeColor: '#fff', strokeWidth: 1, xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10, zIndex } as PresentSceneObject);
const image = (id: string, zIndex: number): PresentImageObject => ({
  id,
  name: id,
  dataUrl: 'data:image/png;base64,AA==',
  xPercent: 0,
  yPercent: 0,
  widthPercent: 10,
  heightPercent: 10,
  zIndex,
});

const idsBottomFirst = (objects: readonly { id: string; zIndex?: number }[]): string[] =>
  sortPresentLayers([...objects]).map((object) => object.id);

describe('Present layer order', () => {
  it('really sends the bottom object further back instead of clamping it to z=1', () => {
    const objects = [shape('bottom', 1), shape('middle', 2), shape('top', 3)];
    const result = movePresentLayer(objects, 'bottom', 'back');
    expect(idsBottomFirst(result)).toEqual(['bottom', 'middle', 'top']);
    expect(result.map((object) => object.zIndex)).toEqual([1, 2, 3]);
  });

  it('brings an object to the front with a dense z value and no drift on repetition', () => {
    const objects = [shape('a', 1), shape('b', 2), shape('c', 3)];
    const once = movePresentLayer(objects, 'a', 'front');
    expect(idsBottomFirst(once)).toEqual(['b', 'c', 'a']);
    const twice = movePresentLayer(once, 'a', 'front');
    expect(idsBottomFirst(twice)).toEqual(['b', 'c', 'a']);
    expect(twice.map((object) => object.zIndex).sort()).toEqual([1, 2, 3]);
  });

  it('moves one position forward and one position back, not through a neighbour', () => {
    const objects = [shape('a', 1), shape('b', 2), shape('c', 3)];
    expect(idsBottomFirst(movePresentLayer(objects, 'a', 'forward'))).toEqual(['b', 'a', 'c']);
    expect(idsBottomFirst(movePresentLayer(objects, 'c', 'backward'))).toEqual(['a', 'c', 'b']);
    // Already at the top: forward must be a no-op, not a z collision.
    expect(idsBottomFirst(movePresentLayer(objects, 'c', 'forward'))).toEqual(['a', 'b', 'c']);
    expect(idsBottomFirst(movePresentLayer(objects, 'a', 'backward'))).toEqual(['a', 'b', 'c']);
  });

  it('moves a multi-object selection as a block and keeps the order inside the block', () => {
    const objects = [shape('a', 1), shape('b', 2), shape('c', 3), shape('d', 4)];
    // Both 'a' and 'c' step up one position: a past b, c past d. The relative order a before c is kept.
    expect(idsBottomFirst(movePresentLayer(objects, ['a', 'c'], 'forward'))).toEqual(['b', 'a', 'd', 'c']);
    expect(idsBottomFirst(movePresentLayer(objects, ['b', 'd'], 'backward'))).toEqual(['b', 'a', 'd', 'c']);
    const front = movePresentLayer(objects, ['a', 'c'], 'front');
    expect(idsBottomFirst(front)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('orders scene objects and images together so the layers pane cannot lose the interleaving', () => {
    const merged = [shape('s-image-under', 1), image('img', 2), shape('s-over', 3)];
    expect(idsBottomFirst(merged)).toEqual(['s-image-under', 'img', 's-over']);
    expect(presentLayerList(merged).map((object) => object.id)).toEqual(['s-over', 'img', 's-image-under']);
    expect(idsBottomFirst(movePresentLayer(merged, 'img', 'front'))).toEqual(['s-image-under', 's-over', 'img']);
  });

  it('re-densifies corrupt duplicate z values so the visible order stops depending on array order', () => {
    const objects = [shape('a', 4), shape('b', 4), shape('c', 4)];
    expect(normalizePresentZOrder(objects).map((object) => object.zIndex)).toEqual([1, 2, 3]);
    expect(idsBottomFirst(normalizePresentZOrder([shape('a', 4), shape('b', 4), shape('c', 4)]))).toEqual(['a', 'b', 'c']);
  });

  it('refuses an unbounded id list and an empty document', () => {
    const objects = [shape('a', 1), shape('b', 2)];
    expect(idsBottomFirst(movePresentLayer(objects, [], 'front'))).toEqual(['a', 'b']);
    expect(idsBottomFirst(movePresentLayer(objects, ['ghost'], 'front'))).toEqual(['a', 'b']);
    expect(movePresentLayer([], 'a', 'front')).toEqual([]);
  });
});

describe('Present grouping and locking', () => {
  it('groups two or more objects and reports the member ids', () => {
    const objects = [shape('a', 1), shape('b', 2), shape('c', 3)];
    const result = groupPresentObjects(objects, ['a', 'b']);
    expect(result.reason).toBeUndefined();
    expect(result.memberIds).toEqual(['a', 'b']);
    expect(readPresentGroupId(result.objects[0])).toBe(result.groupId);
    expect(readPresentGroupId(result.objects[1])).toBe(result.groupId);
    expect(readPresentGroupId(result.objects[2])).toBeNull();
    expect(listPresentGroupIds(result.objects)).toEqual([result.groupId]);
  });

  it('refuses a one-member group and a group above the member ceiling', () => {
    const objects = [shape('a', 1), shape('b', 2)];
    expect(groupPresentObjects(objects, ['a']).reason).toBe('too-few-members');
    expect(groupPresentObjects(objects, ['ghost']).reason).toBe('too-few-members');
    const many = Array.from({ length: PRESENT_MAX_GROUP_MEMBERS + 1 }, (_, index) => shape(`o-${index}`, index));
    expect(groupPresentObjects(many, many.map((object) => object.id)).reason).toBe('too-many-members');
  });

  it('selects the whole group when one member is selected, and ungroups again', () => {
    const objects = [shape('a', 1), shape('b', 2), shape('c', 3)];
    const grouped = groupPresentObjects(objects, ['a', 'b']).objects;
    expect(resolvePresentGroupMembers(grouped, 'a')).toEqual(['a', 'b']);
    expect(expandPresentSelectionToGroups(grouped, ['b'])).toEqual(['a', 'b']);
    expect(expandPresentSelectionToGroups(grouped, ['c'])).toEqual(['c']);
    const ungrouped = ungroupPresentObjects(grouped, 'b');
    expect(ungrouped.memberIds).toEqual(['a', 'b']);
    expect(ungrouped.objects.every((object) => readPresentGroupId(object) === null)).toBe(true);
  });

  it('dissolves a corrupt one-member group and picks a free group id', () => {
    const grouped = groupPresentObjects([shape('a', 1), shape('b', 2)], ['a', 'b'], 'present-group-0').objects;
    const orphan = { ...shape('solo', 3), groupId: 'present-group-9' };
    const normalized = normalizePresentGroups([...grouped, orphan]);
    expect(readPresentGroupId(normalized[2])).toBeNull();
    expect(nextPresentGroupId(grouped)).toBe('present-group-1');
  });

  it('locks and unlocks every member of a group', () => {
    const grouped = groupPresentObjects([shape('a', 1), shape('b', 2), shape('c', 3)], ['a', 'b']).objects;
    const locked = setPresentGroupLocked(grouped, 'a', true);
    expect(locked.memberIds).toEqual(['a', 'b']);
    expect(locked.objects.map((object) => Boolean(object.locked))).toEqual([true, true, false]);
    const unlocked = setPresentGroupLocked(locked.objects, 'b', false);
    expect(unlocked.objects.every((object) => !object.locked)).toBe(true);
  });
});
