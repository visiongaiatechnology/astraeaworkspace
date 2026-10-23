// STATUS: PLATIN — pure Draw selection set + keyboard intent resolution (no DOM, no model mutation).
import type { DrawObjectId, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../model/drawDocumentValidation';
import { expandDrawSelection, resolveDrawSelectionRoot } from './drawHitTest';
import type { DrawScene } from './drawSceneProjection';

export type DrawZOrderAction = 'front' | 'back' | 'forward' | 'backward';
export type DrawSelectionMode = 'replace' | 'toggle' | 'add';

export interface DrawKeyboardEventLike {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

export type DrawSelectionCommand =
  | { readonly kind: 'select-next' }
  | { readonly kind: 'select-previous' }
  | { readonly kind: 'select-all' }
  | { readonly kind: 'clear' }
  | { readonly kind: 'move'; readonly delta: DrawPoint }
  | { readonly kind: 'delete' }
  | { readonly kind: 'group' }
  | { readonly kind: 'ungroup' }
  | { readonly kind: 'z-order'; readonly action: DrawZOrderAction }
  | { readonly kind: 'edit-text' }
  | { readonly kind: 'toggle-snap' }
  | { readonly kind: 'cancel' };

export function toggleDrawSelection(
  current: readonly DrawObjectId[],
  id: DrawObjectId,
  mode: DrawSelectionMode,
): DrawObjectId[] {
  if (typeof id !== 'string' || id.length === 0) throw new DrawModelError('selection-id-invalid');
  if (mode === 'replace') return [id];
  if (mode === 'add') return current.includes(id) ? [...current] : [...current, id];
  return current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
}

/** Drops ids that no longer exist or are not on the active page, and expands group containers. */
export function normalizeDrawSelection(
  scene: DrawScene,
  ids: readonly DrawObjectId[],
  options?: { readonly expandGroups?: boolean },
): DrawObjectId[] {
  const alive = ids.filter((id) => scene.byId.has(id));
  const expanded = options?.expandGroups === false ? alive : expandDrawSelection(scene, alive);
  const selectable = expanded.filter((id) => {
    const entry = scene.byId.get(id);
    return Boolean(entry && entry.visible);
  });
  return [...new Set(selectable)];
}

export interface DrawSelectionSummary {
  readonly objectIds: readonly DrawObjectId[];
  readonly lockedIds: readonly DrawObjectId[];
  readonly connectorIds: readonly DrawObjectId[];
  readonly groupIds: readonly DrawObjectId[];
  readonly writableIds: readonly DrawObjectId[];
  readonly multi: boolean;
}

export function summarizeDrawSelection(scene: DrawScene, ids: readonly DrawObjectId[]): DrawSelectionSummary {
  const lockedIds: DrawObjectId[] = [];
  const connectorIds: DrawObjectId[] = [];
  const groupIds: DrawObjectId[] = [];
  const writableIds: DrawObjectId[] = [];
  for (const id of ids) {
    const entry = scene.byId.get(id);
    if (!entry) continue;
    if (entry.locked) lockedIds.push(id);
    else writableIds.push(id);
    if (entry.object.type === 'connector') connectorIds.push(id);
    if (entry.object.type === 'group') groupIds.push(id);
  }
  return {
    objectIds: [...ids],
    lockedIds,
    connectorIds,
    groupIds,
    writableIds,
    multi: ids.length > 1,
  };
}

/**
 * Cycles the selection through the page in canonical paint order. `hitOrder` is topmost-first, so
 * "next" walks visually downwards and wraps around at the end.
 *
 * Locked objects are skipped by default so they can never capture the movement keys; the object
 * navigator lists them explicitly and is the documented keyboard path to unlock them.
 */
export function cycleDrawSelection(
  scene: DrawScene,
  current: readonly DrawObjectId[],
  direction: 1 | -1,
  options?: { readonly includeLocked?: boolean },
): DrawObjectId[] {
  const selectable = scene.hitOrder.filter((entry) => entry.visible && (options?.includeLocked || !entry.locked));
  if (selectable.length === 0) return [];
  const ids = selectable.map((entry) => entry.object.id);
  if (current.length === 0) return [ids[direction === 1 ? 0 : ids.length - 1]!];
  const anchorId = current[current.length - 1]!;
  const position = ids.indexOf(anchorId);
  if (position < 0) return [ids[0]!];
  const next = (position + direction + ids.length) % ids.length;
  return [ids[next]!];
}

export function moveStepForViewport(viewport: { readonly snapToGrid: boolean; readonly gridSize: number }): number {
  if (viewport.snapToGrid) {
    if (!Number.isFinite(viewport.gridSize) || viewport.gridSize <= 0) throw new DrawModelError('grid-range');
    return viewport.gridSize;
  }
  return 1;
}

const MOVE_KEYS: Readonly<Record<string, DrawPoint>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Maps a key event to a canvas command. Returning `null` means "not ours" so the caller can let the
 * event bubble. Every essential canvas function has an entry here — pointer input is never the only
 * path.
 */
export function resolveDrawSelectionCommand(
  event: DrawKeyboardEventLike,
  context: { readonly step: number; readonly editingText: boolean },
): DrawSelectionCommand | null {
  if (typeof event?.key !== 'string' || event.key.length === 0) throw new DrawModelError('keyboard-event-invalid');
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key;
  const lower = key.toLowerCase();
  const step = Number.isFinite(context.step) && context.step > 0 ? context.step : 1;

  if (context.editingText) {
    if (key === 'Escape') return { kind: 'cancel' };
    return null;
  }

  if (key === 'Escape') return { kind: 'cancel' };
  if (key === 'Delete' || key === 'Backspace') return { kind: 'delete' };
  if (key === 'Tab') return { kind: event.shiftKey ? 'select-previous' : 'select-next' };
  if (key === 'F2') return { kind: 'edit-text' };

  const direction = MOVE_KEYS[key];
  if (direction) {
    const factor = event.shiftKey ? 10 : 1;
    return { kind: 'move', delta: { x: direction.x * step * factor, y: direction.y * step * factor } };
  }

  if (mod && lower === 'a') return { kind: 'select-all' };
  if (mod && lower === 'g') return { kind: event.shiftKey ? 'ungroup' : 'group' };
  if (mod && key === ']') return { kind: 'z-order', action: event.shiftKey ? 'front' : 'forward' };
  if (mod && key === '[') return { kind: 'z-order', action: event.shiftKey ? 'back' : 'backward' };
  if (mod && lower === 's' && event.shiftKey) return { kind: 'toggle-snap' };
  return null;
}

/** First writable (unlocked) id, used as the resize/rotate subject. */
export function primaryDrawSelection(scene: DrawScene, ids: readonly DrawObjectId[]): DrawObjectId | null {
  for (const id of ids) {
    const entry = scene.byId.get(id);
    if (entry && !entry.locked && entry.object.type !== 'connector') return id;
  }
  return null;
}

export function selectionRoots(scene: DrawScene, ids: readonly DrawObjectId[]): DrawObjectId[] {
  return [...new Set(ids.map((id) => resolveDrawSelectionRoot(scene, id)))];
}
