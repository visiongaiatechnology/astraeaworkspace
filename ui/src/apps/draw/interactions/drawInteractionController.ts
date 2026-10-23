// STATUS: PLATIN — pure Draw pointer/keyboard interaction state machine (no React, no DOM).
import type { DrawBounds, DrawDocumentModel, DrawObjectId, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument } from '../model/drawDocumentValidation';
import type { DrawResizeHandle } from './drawGeometry';
import { normalizeDrawBounds } from './drawGeometry';
import { projectDrawScene, type DrawScene } from './drawSceneProjection';import {
  hitTestDrawScene,
  hitTestDrawSelectionAdorner,
  marqueeDrawSelection,
  rotateHandleWorld,
  type DrawHit,
} from './drawHitTest';
import { buildDrawSpatialIndex, type DrawSpatialIndex } from './drawSpatialIndex';
import {
  cycleDrawSelection,
  normalizeDrawSelection,
  primaryDrawSelection,
  resolveDrawSelectionCommand,
  summarizeDrawSelection,
  toggleDrawSelection,
  type DrawKeyboardEventLike,
  type DrawSelectionCommand,
  type DrawSelectionMode,
} from './drawSelectionEngine';
import {
  applyDrawZOrder,
  deleteDrawObjects,
  groupDrawSelection,
  moveDrawObjects,
  resizeDrawObjects,
  rotateDrawObjects,
  ungroupDrawSelection,
  type DrawMoveResult,
} from './drawCommandEngine';
import { alignmentGuidesForSnap, type DrawAlignmentGuide } from './drawOverlayProjection';

export interface DrawInteractionModifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export const NO_DRAW_MODIFIERS: DrawInteractionModifiers = { shift: false, ctrl: false, alt: false, meta: false };

export type DrawInteractionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'marquee'; readonly origin: DrawPoint; readonly current: DrawPoint; readonly additive: boolean; readonly baseSelection: readonly DrawObjectId[] }
  | { readonly kind: 'drag'; readonly origin: DrawPoint; readonly current: DrawPoint; readonly ids: readonly DrawObjectId[]; readonly startedAt: number; readonly moved: boolean }
  | { readonly kind: 'resize'; readonly handle: DrawResizeHandle; readonly objectId: DrawObjectId; readonly target: DrawPoint; readonly keepAspect: boolean }
  | { readonly kind: 'rotate'; readonly objectId: DrawObjectId; readonly pointer: DrawPoint; readonly snapStep: number }
  | { readonly kind: 'text'; readonly objectId: DrawObjectId };

export interface DrawInteractionContext {
  readonly model: DrawDocumentModel;
  readonly scene: DrawScene;
  readonly index: DrawSpatialIndex;
  readonly selectedIds: readonly DrawObjectId[];
  readonly interaction: DrawInteractionState;
  /** True when the pointer press also moved keyboard focus into the canvas. */
  readonly focusCanvas: boolean;
}

export interface DrawInteractionStep {
  readonly state: DrawInteractionState;
  readonly selectedIds: readonly DrawObjectId[];
  readonly model: DrawDocumentModel;
  readonly guides: readonly DrawAlignmentGuide[];
  readonly hoverId: DrawObjectId | null;
  readonly marqueeRect: DrawBounds | null;
  readonly marqueeCount: number;
  readonly announcement: string | null;
}

/**
 * Scene + spatial index for one model revision.
 *
 * `projectDrawScene` and `buildDrawSpatialIndex` are both O(n) and the controller needs them on every
 * pointer event. Caching them per *model identity* is safe because every engine returns a brand-new
 * immutable model object, so a stale entry can never be observed; the WeakMap also cannot leak. Without
 * this, a 500-shape/800-connector page rebuilt the index on each mousemove (measured as the dominant
 * cost of the drag loop).
 */
const sceneIndexCache = new WeakMap<DrawDocumentModel, { readonly scene: DrawScene; readonly index: DrawSpatialIndex }>();

export function drawSceneIndexFor(model: DrawDocumentModel): { readonly scene: DrawScene; readonly index: DrawSpatialIndex } {
  const cached = sceneIndexCache.get(model);
  if (cached) return cached;
  const scene = projectDrawScene(model, model.activePageId);
  const fresh = { scene, index: buildDrawSpatialIndex(scene, scene.entries) };
  sceneIndexCache.set(model, fresh);
  return fresh;
}

function buildContext(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[],
  interaction: DrawInteractionState,
): DrawInteractionContext {
  const { scene, index } = drawSceneIndexFor(model);
  return {
    model,
    scene,
    index,
    selectedIds: normalizeDrawSelection(scene, selectedIds),
    interaction,
    focusCanvas: false,
  };
}

function step(
  context: DrawInteractionContext,
  overrides: Partial<DrawInteractionStep> = {},
): DrawInteractionStep {
  const state = overrides.state ?? context.interaction;
  let marqueeRect: DrawBounds | null = null;
  let marqueeCount = 0;
  if (state.kind === 'marquee') {
    marqueeRect = normalizeDrawBounds({ x: state.origin.x, y: state.origin.y, width: state.current.x - state.origin.x, height: state.current.y - state.origin.y });
    marqueeCount = marqueeDrawSelection(context.scene, marqueeRect, {
      index: context.index,
      groupSelect: true,
      mode: 'contain',
    }).length;
  }
  return {
    state,
    selectedIds: overrides.selectedIds ?? context.selectedIds,
    model: overrides.model ?? context.model,
    guides: overrides.guides ?? [],
    hoverId: overrides.hoverId ?? null,
    marqueeRect,
    marqueeCount,
    announcement: overrides.announcement ?? null,
  };
}

export function createDrawInteractionStep(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[] = [],
): DrawInteractionStep {
  assertDrawDocument(model);
  const context = buildContext(model, selectedIds, { kind: 'idle' });
  return step(context);
}

export interface DrawPointerDownInput {
  readonly point: DrawPoint;
  readonly modifiers: DrawInteractionModifiers;
  /** `primary` is the left button. */
  readonly button?: 'primary' | 'secondary';
  /** When true the adorners of the current selection are hit-tested first. */
  readonly preferHandles?: boolean;
}

/**
 * Pointer press: grips win over bodies, Shift toggles, Alt+drag over an object begins a rotation from
 * the object centre, and an empty press starts a marquee.
 */
export function beginDrawPointerInteraction(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[],
  input: DrawPointerDownInput,
): DrawInteractionStep {
  assertDrawDocument(model);
  const context = buildContext(model, selectedIds, { kind: 'idle' });
  const tolerance = Math.max(2, model.viewport.snapTolerance / 2);

  const adorner = hitTestDrawSelectionAdorner(context.scene, context.selectedIds, input.point, {
    tolerance: tolerance + 6,
  });
  if (adorner && adorner.region === 'handle' && adorner.handle) {
    return step(context, {
      state: {
        kind: 'resize',
        handle: adorner.handle,
        objectId: adorner.objectId,
        target: input.point,
        keepAspect: input.modifiers.shift,
      },
      selectedIds: context.selectedIds,
    });
  }
  if (adorner && adorner.region === 'rotate') {
    return step(context, {
      state: {
        kind: 'rotate',
        objectId: adorner.objectId,
        pointer: input.point,
        snapStep: input.modifiers.shift ? 15 : 0,
      },
      selectedIds: context.selectedIds,
    });
  }

  const hit: DrawHit | null = hitTestDrawScene(context.scene, input.point, {
    index: context.index,
    tolerance,
    groupSelect: true,
  });

  if (!hit) {
    return step(context, {
      state: {
        kind: 'marquee',
        origin: input.point,
        current: input.point,
        additive: input.modifiers.shift,
        baseSelection: input.modifiers.shift ? context.selectedIds : [],
      },
      selectedIds: input.modifiers.shift ? context.selectedIds : [],
    });
  }

  const mode: DrawSelectionMode = input.modifiers.shift ? 'toggle' : 'replace';
  let selection = toggleDrawSelection(context.selectedIds, hit.objectId, mode);
  selection = normalizeDrawSelection(context.scene, selection);

  if (input.modifiers.alt) {
    return step(context, {
      state: { kind: 'rotate', objectId: hit.objectId, pointer: input.point, snapStep: input.modifiers.shift ? 15 : 0 },
      selectedIds: selection,
      announcement: 'rotate',
    });
  }

  return step(context, {
    state: { kind: 'drag', origin: input.point, current: input.point, ids: selection, startedAt: 0, moved: false },
    selectedIds: selection,
    announcement: 'selected',
  });
}

export interface DrawPointerMoveInput {
  readonly point: DrawPoint;
  readonly modifiers: DrawInteractionModifiers;
  /** Timestamp used to decide whether a click became a drag. */
  readonly timestamp?: number;
}

export function updateDrawPointerInteraction(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[],
  interaction: DrawInteractionState,
  input: DrawPointerMoveInput,
): DrawInteractionStep {
  assertDrawDocument(model);
  const context = buildContext(model, selectedIds, interaction);

  if (interaction.kind === 'idle') {
    const hover = hitTestDrawScene(context.scene, input.point, {
      index: context.index,
      tolerance: Math.max(2, model.viewport.snapTolerance / 2),
      groupSelect: true,
    });
    return step(context, { hoverId: hover ? hover.objectId : null });
  }

  if (interaction.kind === 'marquee') {
    return step(context, { state: { ...interaction, current: input.point } });
  }

  if (interaction.kind === 'drag') {
    const delta = { x: input.point.x - interaction.origin.x, y: input.point.y - interaction.origin.y };
    if (delta.x === 0 && delta.y === 0) return step(context, { state: { ...interaction, current: input.point } });
    const result: DrawMoveResult = moveDrawObjects(model, interaction.ids, delta);
    const before = context.scene.byId.get(interaction.ids[0] ?? '')?.object;
    const afterEntry = projectDrawScene(result.model, result.model.activePageId).byId.get(interaction.ids[0] ?? '');
    const guides = before && afterEntry && result.snapped
      ? alignmentGuidesForSnap(before, afterEntry.object)
      : [];
    return step(context, {
      state: { ...interaction, current: input.point, moved: true },
      model: result.model,
      guides,
      announcement: result.snapped ? 'snapped' : 'moving',
    });
  }

  if (interaction.kind === 'resize') {
    const snapped = model.viewport.snapToGrid || model.viewport.snapToGuides || model.viewport.snapToShapes
      ? { x: Math.round(input.point.x), y: Math.round(input.point.y) }
      : input.point;
    const nextModel = resizeDrawObjects(model, interaction.objectId, interaction.handle, snapped, {
      keepAspect: input.modifiers.shift || interaction.keepAspect,
    });
    return step(context, {
      state: { ...interaction, target: input.point, keepAspect: input.modifiers.shift || interaction.keepAspect },
      model: nextModel,
      announcement: 'resizing',
    });
  }

  if (interaction.kind === 'rotate') {
    const nextModel = rotateDrawObjects(model, interaction.objectId, input.point, {
      snapStep: input.modifiers.shift ? 15 : interaction.snapStep,
    });
    return step(context, {
      state: { ...interaction, pointer: input.point, snapStep: input.modifiers.shift ? 15 : interaction.snapStep },
      model: nextModel,
      announcement: 'rotating',
    });
  }

  return step(context);
}

export interface DrawPointerUpInput {
  readonly point: DrawPoint;
  readonly modifiers: DrawInteractionModifiers;
}

/** Pointer release: a marquee commits its hits, a click without movement commits the selection. */
export function endDrawPointerInteraction(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[],
  interaction: DrawInteractionState,
  input: DrawPointerUpInput,
): DrawInteractionStep {
  assertDrawDocument(model);
  const context = buildContext(model, selectedIds, interaction);

  if (interaction.kind === 'marquee') {
    const rect = normalizeDrawBounds({
      x: interaction.origin.x,
      y: interaction.origin.y,
      width: input.point.x - interaction.origin.x,
      height: input.point.y - interaction.origin.y,
    });
    const hits = rect.width < 2 && rect.height < 2 && !interaction.additive
      ? []
      : marqueeDrawSelection(context.scene, rect, { index: context.index, groupSelect: true, mode: 'contain' });
    const combined = interaction.additive ? [...interaction.baseSelection, ...hits] : hits;
    return step(context, {
      state: { kind: 'idle' },
      selectedIds: normalizeDrawSelection(context.scene, combined),
      announcement: hits.length > 0 ? 'marquee-committed' : 'selection-cleared',
    });
  }

  return step(context, { state: { kind: 'idle' } });
}

export interface DrawKeyboardInput extends DrawKeyboardEventLike {
  readonly repeat?: boolean;
}

/**
 * Keyboard path for every essential canvas function. `Tab` cycles objects because the surface is a
 * composite `role="application"` widget; arrow keys move, Delete removes, Ctrl+G groups, and
 * Ctrl+[ / Ctrl+] change stacking order.
 */
export function applyDrawKeyboardInteraction(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[],
  interaction: DrawInteractionState,
  event: DrawKeyboardInput,
): DrawInteractionStep | null {
  assertDrawDocument(model);
  const context = buildContext(model, selectedIds, interaction);
  const stepSize = model.viewport.snapToGrid ? model.viewport.gridSize : 1;
  const command: DrawSelectionCommand | null = resolveDrawSelectionCommand(event, {
    step: stepSize,
    editingText: interaction.kind === 'text',
  });
  if (!command) return null;

  switch (command.kind) {
    case 'select-next':
    case 'select-previous': {
      const direction: 1 | -1 = command.kind === 'select-next' ? 1 : -1;
      const next = cycleDrawSelection(context.scene, context.selectedIds, direction);
      return step(context, {
        state: { kind: 'idle' },
        selectedIds: next,
        announcement: next.length > 0 ? 'selected' : 'selection-cleared',
      });
    }
    case 'select-all': {
      const all = context.scene.entries.filter((entry) => entry.visible).map((entry) => entry.object.id);
      return step(context, { selectedIds: normalizeDrawSelection(context.scene, all), announcement: 'select-all' });
    }
    case 'clear':
    case 'cancel':
      return step(context, { state: { kind: 'idle' }, selectedIds: [], announcement: 'selection-cleared' });
    case 'move': {
      if (context.selectedIds.length === 0) return step(context, { announcement: null });
      // The step already derives from the grid, so the nudge is applied exactly.
      const result = moveDrawObjects(model, context.selectedIds, command.delta, { snap: false });
      return step(context, { model: result.model, announcement: 'moving' });
    }
    case 'delete': {
      if (context.selectedIds.length === 0) return step(context, { announcement: null });
      const next = deleteDrawObjects(model, context.selectedIds);
      return step(context, { model: next, selectedIds: [], announcement: 'deleted' });
    }
    case 'group': {
      const next = groupDrawSelection(model, context.selectedIds);
      const nextScene = projectDrawScene(next, next.activePageId);
      const grouped = nextScene.hitOrder.find((entry) => entry.object.type === 'group')?.object.id;
      return step(context, {
        model: next,
        selectedIds: grouped ? [grouped] : context.selectedIds,
        announcement: 'grouped',
      });
    }
    case 'ungroup': {
      const next = ungroupDrawSelection(model, context.selectedIds);
      const nextScene = projectDrawScene(next, next.activePageId);
      const children = context.selectedIds
        .map((id) => context.scene.byId.get(id)?.object.childIds ?? [])
        .flat()
        .filter((id) => nextScene.byId.has(id));
      return step(context, { model: next, selectedIds: children, announcement: 'ungrouped' });
    }
    case 'z-order': {
      const next = applyDrawZOrder(model, context.selectedIds, command.action);
      return step(context, { model: next, announcement: `z-order-${command.action}` });
    }
    case 'edit-text': {
      const subject = primaryDrawSelection(context.scene, context.selectedIds);
      if (!subject) return step(context, { announcement: null });
      return step(context, { state: { kind: 'text', objectId: subject }, announcement: 'text-editing' });
    }
    case 'toggle-snap': {
      const viewport = { ...model.viewport, snapToGrid: !model.viewport.snapToGrid };
      const next: DrawDocumentModel = { ...model, viewport };
      return step(context, { model: next, announcement: viewport.snapToGrid ? 'snap-on' : 'snap-off' });
    }
    default:
      return null;
  }
}

/** Double-click on a shape enters direct text editing (acceptance scenario for package 09). */
export function beginDrawTextInteraction(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[],
  objectId: DrawObjectId,
): DrawInteractionStep {
  assertDrawDocument(model);
  const context = buildContext(model, selectedIds, { kind: 'idle' });
  const entry = context.scene.byId.get(objectId);
  if (!entry) throw new DrawModelError('selection-stale');
  if (entry.locked) throw new DrawModelError('object-locked');
  if (entry.object.type === 'connector') throw new DrawModelError('text-target-invalid');
  return step(context, {
    state: { kind: 'text', objectId },
    selectedIds: [objectId],
    announcement: 'text-editing',
  });
}

export function endDrawTextInteraction(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[],
): DrawInteractionStep {
  const context = buildContext(model, selectedIds, { kind: 'idle' });
  return step(context, { state: { kind: 'idle' }, announcement: 'text-committed' });
}

export function isDrawInteracting(state: DrawInteractionState): boolean {
  return state.kind !== 'idle' && state.kind !== 'text';
}

export function drawInteractionCursor(state: DrawInteractionState): string {
  switch (state.kind) {
    case 'drag': return 'grabbing';
    case 'resize': return 'nwse-resize';
    case 'rotate': return 'crosshair';
    case 'marquee': return 'crosshair';
    case 'text': return 'text';
    default: return 'default';
  }
}

export { summarizeDrawSelection, rotateHandleWorld };
