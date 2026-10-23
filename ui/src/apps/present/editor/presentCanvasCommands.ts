// STATUS: PLATIN — the single executor that turns a Present editor command into document state.
//
// Why this file exists: `presentSelection`, `presentTransform` and `presentGrouping` were pure,
// tested and **unreachable** — no component imported them, so every acceptance scenario of
// Paket 8 ("Mehrfachauswahl, Snap, Resize, Rotation und Flip bedienen") and Paket 9 ("Objekte
// gruppieren, locken und vorne/hinten sortieren") was pointer-only or impossible. This executor is
// the one place that maps `PresentEditorCommand` onto those primitives, so the stage canvas, the
// layers pane and the inspector cannot drift apart: they all commit the objects this returns.
//
// It is a pure function: identical input state + command always yields the identical result, which
// is what makes the keyboard contract testable without a DOM.

import type { PresentSceneObject } from '../../../shared/contracts/workspace';
import {
  groupPresentObjects,
  ungroupPresentObjects,
  expandPresentSelectionToGroups,
} from '../canvas/model/presentGrouping';
import {
  readPresentGroupId,
  withPresentGroupId,
  createPresentGroupId,
} from '../canvas/model/presentObjectExtensions';
import { duplicatePresentSceneObject, movePresentLayer } from '../canvas/model/presentScene';
import {
  cyclePresentSelection,
  normalizePresentSelection,
  presentSelectionLabel,
  presentSelectionPrimary,
  selectAllPresentObjects,
  togglePresentSelection,
  type PresentSelectableObject,
} from '../canvas/model/presentSelection';
import {
  deletePresentSelection,
  flipPresentSelection,
  nudgePresentSelection,
  presentRotationLabel,
  resizePresentSelection,
  rotatePresentSelection,
  setPresentSelectionLocked,
  type PresentTransformResult,
} from '../canvas/model/presentTransform';
import type { PresentEditorCommand } from './presentEditorCommands';

/** Duplicating more than this in one command is a defect, not a feature. */
export const PRESENT_MAX_DUPLICATE_BATCH = 256;

export interface PresentCanvasCommandState {
  objects: PresentSceneObject[];
  /** Render-ordered selection of scene object ids. */
  selection: string[];
}

export interface PresentCanvasCommandResult {
  state: PresentCanvasCommandState;
  /** `true` when the document must be committed (undo entry + publish). */
  changed: boolean;
  /** User-visible, never colour-only status for the live region; `null` when silent. */
  message: string | null;
}

export interface PresentCanvasCommandOptions {
  /** Deterministic copy ids. Defaults to `<source id>-copy-<index>`. */
  newObjectId?: (index: number, source: PresentSceneObject) => string;
}

/**
 * Packs a geometry result. `changed` is never derived from array identity: the pure transforms
 * return a fresh array even when nothing moved (locked selection, blocked edge), and an empty undo
 * entry per keystroke is exactly the kind of "bloßer Statuswechsel" the plan forbids. Callers pass
 * the real reason instead.
 */
function pack(
  state: PresentCanvasCommandState,
  objects: PresentSceneObject[],
  objectsChanged: boolean,
  selection?: string[],
  message: string | null = null,
): PresentCanvasCommandResult {
  const nextSelection = selection === undefined ? state.selection : normalizePresentSelection(objects, selection);
  const selectionChanged = nextSelection.join('\u0000') !== state.selection.join('\u0000');
  return { state: { objects, selection: nextSelection }, changed: objectsChanged || selectionChanged, message };
}

/** Bottom-to-top id order, used to detect a real layer reorder. */
function layerOrder(objects: readonly PresentSceneObject[]): string {
  return [...objects]
    .map((object, index) => ({ id: object.id, z: object.zIndex ?? 1, index }))
    .sort((a, b) => (a.z - b.z) || (a.index - b.index))
    .map((entry) => entry.id)
    .join('\u0000');
}

function describeTransform(label: string, result: PresentTransformResult<PresentSceneObject>): string | null {
  if (result.changedIds.length === 0) {
    if (result.skippedLockedIds.length) return `${label}: refused, ${result.skippedLockedIds.length} locked object(s) selected.`;
    if (result.blockedAxes.length) return `${label}: the selection already touches the slide edge.`;
    return null;
  }
  const parts = [`${label}: ${result.changedIds.length} object(s).`];
  if (result.skippedLockedIds.length) parts.push(`${result.skippedLockedIds.length} locked object(s) unchanged.`);
  if (result.blockedAxes.length) parts.push(`blocked on ${result.blockedAxes.map((axis) => axis.toUpperCase()).join('/')}.`);
  return parts.join(' ');
}

/** All members of a group must share one new key after a duplication, otherwise two groups merge. */
function reassignDuplicatedGroups(copies: PresentSceneObject[], existing: readonly PresentSceneObject[]): PresentSceneObject[] {
  const used = new Set<string>();
  for (const object of existing) {
    const id = readPresentGroupId(object);
    if (id) used.add(id);
  }
  const remapped = new Map<string, string>();
  const next = copies.map((copy) => {
    const groupId = readPresentGroupId(copy);
    if (!groupId) return copy;
    let replacement = remapped.get(groupId);
    if (!replacement) {
      let sequence = used.size;
      while (used.has(createPresentGroupId(sequence))) sequence += 1;
      replacement = createPresentGroupId(sequence);
      used.add(replacement);
      remapped.set(groupId, replacement);
    }
    return withPresentGroupId(copy, replacement);
  });
  return next;
}

/**
 * Executes one editor command against the scene objects of the active slide.
 * Returns `null` when the command is not a canvas command (slide navigation, presentation start,
 * undo/redo), so the caller's own handler stays the only owner of those.
 */
export function applyPresentCanvasCommand(
  command: PresentEditorCommand,
  state: PresentCanvasCommandState,
  options: PresentCanvasCommandOptions = {},
): PresentCanvasCommandResult | null {
  const objects = state.objects;
  const selection = normalizePresentSelection(objects as PresentSelectableObject[], state.selection);

  switch (command.type) {
    case 'select-next':
    case 'select-previous': {
      const next = cyclePresentSelection(objects, selection, command.type === 'select-next' ? 1 : -1);
      const expanded = expandPresentSelectionToGroups(objects, next);
      return { state: { objects, selection: normalizePresentSelection(objects, expanded) }, changed: false, message: presentSelectionLabel(objects, expanded) };
    }
    case 'select-all': {
      const all = selectAllPresentObjects(objects);
      return { state: { objects, selection: all }, changed: false, message: all.length ? `${all.length} objects selected` : 'No object selected' };
    }
    case 'dismiss': {
      if (!selection.length) return null;
      return { state: { objects, selection: [] }, changed: false, message: 'No object selected' };
    }
    case 'toggle-object-selection': {
      const next = expandPresentSelectionToGroups(
        objects,
        togglePresentSelection(objects, selection, command.id, command.additive),
      );
      return { state: { objects, selection: normalizePresentSelection(objects, next) }, changed: false, message: presentSelectionLabel(objects, next) };
    }
    case 'nudge': {
      const result = nudgePresentSelection(objects, selection, command.dxPercent, command.dyPercent);
      return pack(state, result.objects, result.changedIds.length > 0, undefined, describeTransform('Move', result));
    }
    case 'resize': {
      const result = resizePresentSelection(objects, selection, command.dxPercent, command.dyPercent);
      return pack(state, result.objects, result.changedIds.length > 0, undefined, describeTransform('Resize', result));
    }
    case 'rotate': {
      const result = rotatePresentSelection(objects, selection, command.deltaDeg);
      const primary = presentSelectionPrimary(objects, selection);
      const label = primary ? `Rotation ${presentRotationLabel((primary.rotation ?? 0) + command.deltaDeg)}` : 'Rotate';
      return pack(state, result.objects, result.changedIds.length > 0, undefined, describeTransform(label, result));
    }
    case 'flip': {
      const result = flipPresentSelection(objects, selection, command.axis);
      return pack(state, result.objects, result.changedIds.length > 0, undefined, describeTransform(command.axis === 'x' ? 'Flip horizontal' : 'Flip vertical', result));
    }
    case 'delete-selection': {
      const result = deletePresentSelection(objects, selection);
      if (!result.changedIds.length) {
        return {
          state: { objects, selection },
          changed: false,
          message: result.skippedLockedIds.length
            ? `Delete refused: ${result.skippedLockedIds.length} locked object(s). Unlock first.`
            : 'Nothing to delete.',
        };
      }
      return pack(
        state,
        result.objects,
        true,
        [],
        result.skippedLockedIds.length
          ? `Deleted ${result.changedIds.length} object(s); ${result.skippedLockedIds.length} locked object(s) kept.`
          : `Deleted ${result.changedIds.length} object(s).`,
      );
    }
    case 'duplicate-selection': {
      const bounded = selection.slice(0, PRESENT_MAX_DUPLICATE_BATCH);
      if (!bounded.length) return { state: { objects, selection }, changed: false, message: 'Select an object before duplicating.' };
      const wanted = new Set(bounded);
      const sources = objects.filter((object) => wanted.has(object.id));
      const copies = sources.map((source, index) =>
        duplicatePresentSceneObject(source, (options.newObjectId ?? ((i, s) => `${s.id}-copy-${i}`))(index, source)),
      );
      const regrouped = reassignDuplicatedGroups(copies, objects);
      const nextObjects = [...objects, ...regrouped];
      return pack(state, nextObjects, regrouped.length > 0, regrouped.map((copy) => copy.id), `Duplicated ${regrouped.length} object(s).`);
    }
    case 'layer': {
      if (!selection.length) return { state: { objects, selection }, changed: false, message: 'Select an object first.' };
      const reordered = movePresentLayer(objects, selection, command.action);
      const reorderedChanged = layerOrder(reordered) !== layerOrder(objects);
      return pack(state, reordered, reorderedChanged, undefined, reorderedChanged ? `Layer order: ${command.action}.` : `Layer order unchanged (already at the ${command.action === 'forward' || command.action === 'front' ? 'front' : 'back'}).`);
    }
    case 'group': {
      const result = groupPresentObjects(objects, selection);
      if (!result.groupId) {
        return {
          state: { objects, selection },
          changed: false,
          message: result.reason === 'too-many-members'
            ? `Grouping refused: more than ${result.memberIds.length} objects selected.`
            : 'Select at least two objects to group.',
        };
      }
      return pack(state, result.objects, true, result.memberIds, `Grouped ${result.memberIds.length} objects.`);
    }
    case 'ungroup': {
      const primary = presentSelectionPrimary(objects, selection);
      if (!primary) return { state: { objects, selection }, changed: false, message: 'Select a grouped object first.' };
      const result = ungroupPresentObjects(objects, primary.id);
      if (!result.memberIds.length) return { state: { objects, selection }, changed: false, message: 'The selected object is not part of a group.' };
      return pack(state, result.objects, true, result.memberIds, `Ungrouped ${result.memberIds.length} objects.`);
    }
    case 'toggle-lock': {
      if (!selection.length) return { state: { objects, selection }, changed: false, message: 'Select an object first.' };
      const targets = objects.filter((object) => selection.includes(object.id));
      const lock = !targets.every((object) => object.locked === true);
      const result = setPresentSelectionLocked(objects, selection, lock);
      return pack(state, result.objects, result.changedIds.length > 0, undefined, `${lock ? 'Locked' : 'Unlocked'} ${result.changedIds.length} object(s).`);
    }
    default:
      return null;
  }
}

/** The commands whose behaviour is defined by this executor. Written out explicitly so that a
 * newly added command cannot silently be reported as "owned by the canvas". */
const PRESENT_CANVAS_COMMAND_TYPES: readonly PresentEditorCommand['type'][] = [
  'select-next',
  'select-previous',
  'select-all',
  'dismiss',
  'toggle-object-selection',
  'nudge',
  'resize',
  'rotate',
  'flip',
  'delete-selection',
  'duplicate-selection',
  'layer',
  'group',
  'ungroup',
  'toggle-lock',
];

/** True when the command is owned by the canvas executor (used by the coverage test). */
export function isPresentCanvasCommand(command: PresentEditorCommand): boolean {
  return PRESENT_CANVAS_COMMAND_TYPES.includes(command.type);
}

/**
 * Advances an editor snapshot with a command result (W-401).
 *
 * Why this exists as its own function: a command runner that keeps its state in a `const` copy or a
 * ref snapshot read *before* the command will compute the **second** command in the same tick from
 * the stale state and silently discard the first. That is the same defect shape as a `const`-copy
 * action layer, only latency-shaped. Making the advance explicit means the accumulation can be
 * proven by a test that runs two commands against one snapshot instead of being asserted by reading
 * the component.
 *
 * A result that changed nothing but the selection advances the selection only, so a pure selection
 * command never rewrites the object array.
 */
export function advancePresentCommandSnapshot(
  current: PresentCanvasCommandState,
  result: PresentCanvasCommandResult,
): PresentCanvasCommandState {
  const selectionChanged = result.state.selection.join('\u0000') !== current.selection.join('\u0000');
  if (!result.changed) {
    return selectionChanged ? { objects: current.objects, selection: result.state.selection } : current;
  }
  return { objects: result.state.objects, selection: result.state.selection };
}

export interface PresentCanvasCommandRun {
  /** The snapshot the next command in the same tick must use. */
  snapshot: PresentCanvasCommandState;
  changed: boolean;
  message: string | null;
  /** Ids of the objects the command changed, for a caller that wants to report or focus them. */
  changedIds: string[];
}

/**
 * Runs one command against a snapshot and returns the advanced snapshot plus what happened. This is
 * the entry point a component should call: applying the command and advancing the snapshot are one
 * step, so they cannot drift apart again.
 */
export function runPresentCanvasCommand(
  snapshot: PresentCanvasCommandState,
  command: PresentEditorCommand,
  options: PresentCanvasCommandOptions = {},
): PresentCanvasCommandRun | null {
  const result = applyPresentCanvasCommand(command, snapshot, options);
  if (!result) return null;
  const next = advancePresentCommandSnapshot(snapshot, result);
  return {
    snapshot: next,
    changed: result.changed,
    message: result.message,
    changedIds: next.objects
      .filter((object, index) => snapshot.objects[index] !== object)
      .map((object) => object.id),
  };
}
