// STATUS: PLATIN — pure Present grouping, lock and layer-ordering operations.
//
// "Objekte gruppieren, locken und vorne/hinten sortieren ohne Reihenfolgeverlust" (Paket 9).
// Grouping uses the documented app-local `groupId` extension
// (`presentObjectExtensions.ts`); locking uses the real `locked` field of the shared geometry
// contract. A click on a group member selects the whole group, which is what the acceptance
// scenario means by "grouped".

import {
  PRESENT_MAX_GROUP_ID_LENGTH,
  createPresentGroupId,
  readPresentGroupId,
  withPresentGroupId,
} from './presentObjectExtensions';
import { movePresentLayer, normalizePresentZOrder, type PresentLayerObject } from './presentScene';
import { normalizePresentSelection, PRESENT_MAX_SELECTION_SIZE, type PresentSelectableObject } from './presentSelection';

/** A group larger than this is treated as corrupt and dissolved. */
export const PRESENT_MAX_GROUP_MEMBERS = 256;

export interface PresentGroupResult<T> {
  objects: T[];
  groupId: string | null;
  memberIds: string[];
  reason?: 'too-few-members' | 'too-many-members';
}

/** Deterministic free group id: the lowest `present-group-<n>` not used by the objects. */
export function nextPresentGroupId(objects: readonly object[]): string {
  const used = new Set<string>();
  for (const object of objects) {
    const id = readPresentGroupId(object);
    if (id) used.add(id);
  }
  for (let sequence = 0; sequence < PRESENT_MAX_SELECTION_SIZE; sequence += 1) {
    const candidate = createPresentGroupId(sequence);
    if (!used.has(candidate)) return candidate;
  }
  return createPresentGroupId(used.size);
}

/** Distinct group ids present on the objects, in first-seen order, bounded. */
export function listPresentGroupIds(objects: readonly object[]): string[] {
  const seen: string[] = [];
  for (const object of objects) {
    const id = readPresentGroupId(object);
    if (id && !seen.includes(id) && seen.length < PRESENT_MAX_SELECTION_SIZE) seen.push(id);
  }
  return seen;
}

/** All object ids that share the group of `id` (including `id`), or `[id]` when ungrouped. */
export function resolvePresentGroupMembers<T extends { id: string }>(
  objects: readonly T[],
  id: string,
): string[] {
  const target = objects.find((object) => object.id === id);
  if (!target) return [];
  const groupId = readPresentGroupId(target);
  if (!groupId) return [id];
  return objects.filter((object) => readPresentGroupId(object) === groupId).map((object) => object.id);
}

/**
 * Click semantics for groups: selecting one member selects the whole group. Ids that belong to no
 * group are passed through unchanged. Bounded by `PRESENT_MAX_SELECTION_SIZE`.
 */
export function expandPresentSelectionToGroups<T extends { id: string }>(
  objects: readonly T[],
  ids: readonly string[],
): string[] {
  const expanded: string[] = [];
  for (const id of ids) {
    for (const memberId of resolvePresentGroupMembers(objects, id)) {
      if (!expanded.includes(memberId) && expanded.length < PRESENT_MAX_SELECTION_SIZE) expanded.push(memberId);
    }
  }
  return expanded;
}

/**
 * Groups the given ids. Fewer than two resolvable members is refused (fail-closed) and reported,
 * because a one-member group is not a group and would only add a hidden state.
 */
export function groupPresentObjects<T extends PresentSelectableObject>(
  objects: readonly T[],
  ids: readonly string[],
  groupId?: string,
): PresentGroupResult<T> {
  const selected = normalizePresentSelection(objects, ids);
  if (selected.length < 2) {
    return { objects: [...objects], groupId: null, memberIds: selected, reason: 'too-few-members' };
  }
  if (selected.length > PRESENT_MAX_GROUP_MEMBERS) {
    return { objects: [...objects], groupId: null, memberIds: selected, reason: 'too-many-members' };
  }
  const bounded = (groupId ?? nextPresentGroupId(objects)).slice(0, PRESENT_MAX_GROUP_ID_LENGTH);
  const wanted = new Set(selected);
  return {
    objects: objects.map((object) => (wanted.has(object.id) ? withPresentGroupId(object, bounded) : object)),
    groupId: bounded,
    memberIds: selected,
  };
}

/** Removes the group key from every member of the group that `id` belongs to. */
export function ungroupPresentObjects<T extends { id: string }>(
  objects: readonly T[],
  id: string,
): { objects: T[]; memberIds: string[] } {
  const memberIds = resolvePresentGroupMembers(objects, id);
  if (memberIds.length < 2) return { objects: [...objects], memberIds: [] };
  const wanted = new Set(memberIds);
  return {
    objects: objects.map((object) => (wanted.has(object.id) ? withPresentGroupId(object, null) : object)),
    memberIds,
  };
}

/** Dissolves groups with fewer than two members (corrupt or partial documents). */
export function normalizePresentGroups<T extends { id: string }>(objects: readonly T[]): T[] {
  const counts = new Map<string, number>();
  for (const object of objects) {
    const id = readPresentGroupId(object);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return objects.map((object) => {
    const id = readPresentGroupId(object);
    if (!id) return object;
    return (counts.get(id) ?? 0) >= 2 ? object : withPresentGroupId(object, null);
  });
}

/**
 * Locks or unlocks whole groups. Unlike a geometry transform, locking a *locked* object is
 * allowed, because unlocking must stay reachable.
 */
export function setPresentGroupLocked<T extends { id: string; locked?: boolean }>(
  objects: readonly T[],
  id: string,
  locked: boolean,
): { objects: T[]; memberIds: string[] } {
  const memberIds = resolvePresentGroupMembers(objects, id);
  const wanted = new Set(memberIds);
  return {
    objects: objects.map((object) => (wanted.has(object.id) ? { ...object, locked } : object)),
    memberIds,
  };
}

/**
 * Layer ordering for scene objects and images together. Delegates to `movePresentLayer` and
 * re-densifies the z values, so the requested order is exactly what the next render reproduces.
 */
export function reorderPresentLayers<T extends PresentLayerObject>(
  objects: readonly T[],
  ids: readonly string[],
  action: 'front' | 'back' | 'forward' | 'backward',
): T[] {
  if (!objects.length) return [...objects];
  const bounded = ids.slice(0, PRESENT_MAX_SELECTION_SIZE);
  if (!bounded.length) return [...objects];
  return normalizePresentZOrder(movePresentLayer(objects, bounded, action));
}
