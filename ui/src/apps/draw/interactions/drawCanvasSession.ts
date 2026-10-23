// STATUS: PLATIN — the single pure entry point for every interactive Draw edit.
//
// The React canvas is a *wiring* layer: it forwards pointer/keyboard/panel intents into this session
// and renders the returned state. All edit rules (hit-testing, z-order, resize geometry, snapping,
// grouping, connector routing) live in the existing engines; this module only decides
//   * which engine call an intent maps to,
//   * whether the result must be written live or as one undo step, and
//   * which object stays selected afterwards.
//
// Gesture/undo contract: a drag/resize/rotate/text edit publishes `live` updates while the pointer is
// down (so the document is never stale) and exactly one `history` entry on release. `gestureBase`
// remembers the pre-gesture model, which is also the model each incremental move is computed against —
// the interaction controller derives absolute geometry from the pointer-down origin, so feeding it the
// running model would apply the delta twice.
import type {
  DrawArrowhead, DrawBounds, DrawConnectorRoute, DrawDocumentModel, DrawObjectId, DrawPoint, DrawVectorStyle, DrawViewport,
} from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument } from '../model/drawDocumentValidation';
import { addDrawGuide, moveDrawGuide, removeDrawGuide } from '../model/drawDocumentEngine';
import { setDrawObjectsLocked } from './drawCommandEngine';
import {
  applyDrawKeyboardInteraction,
  beginDrawPointerInteraction,
  beginDrawTextInteraction,
  endDrawPointerInteraction,
  updateDrawPointerInteraction,
  type DrawInteractionState,
  type DrawKeyboardInput,
  type DrawPointerDownInput,
  type DrawPointerMoveInput,
  type DrawPointerUpInput,
} from './drawInteractionController';
import {
  addDrawSelectionToGroup,
  applyDrawShadowPatch,
  applyDrawStylePatch,
  applyDrawTypographyPatch,
  applyDrawZOrder,
  alignDrawObjects,
  deleteDrawObjects,
  groupDrawSelection,
  moveDrawObjects,
  setDrawObjectText,
  ungroupDrawSelection,
} from './drawCommandEngine';
import type { ZOrderAction, TransformOperation } from '../model/drawVectorEngine';
import type { DrawTypographyPatch } from './drawTextLayout';
import {
  appendDrawConnectorWaypoint,
  clearDrawConnectorWaypoints,
  createDrawConnector,
  deleteDrawConnector,
  setDrawConnectorArrowheads,
  setDrawConnectorLabel,
  setDrawConnectorRoute,
  syncDrawConnectorBounds,
} from './drawConnectorEngine';
import {
  moveDrawObjectsToLayer, renameDrawLayer, setDrawLayerLock, setDrawLayerPrintable,
  setDrawLayerVisibility, stepDrawLayerOrder,
} from './drawLayerEngine';
import {
  cycleDrawSelection, normalizeDrawSelection,
} from './drawSelectionEngine';
import { projectDrawScene } from './drawSceneProjection';
import { dropDrawStencil, findDrawContainerAt } from './drawPlacementEngine';
import { hitTestDrawScene, expandDrawSelection } from './drawHitTest';
import type { DrawAlignmentGuide } from './drawOverlayProjection';

/** How a session step has to reach the document. */
export type DrawSessionCommit = 'none' | 'live' | 'history';

export interface DrawCanvasSessionState {
  readonly model: DrawDocumentModel;
  readonly selectedIds: readonly DrawObjectId[];
  readonly interaction: DrawInteractionState;
  readonly hoverId: DrawObjectId | null;
  readonly marqueeRect: DrawBounds | null;
  readonly guides: readonly DrawAlignmentGuide[];
  readonly announcement: string | null;
  /** Pre-gesture model; non-null exactly while a live gesture is open. */
  readonly gestureBase: DrawDocumentModel | null;
}

export interface DrawCanvasSessionStep {
  readonly state: DrawCanvasSessionState;
  readonly commit: DrawSessionCommit;
}

export function createDrawCanvasSession(
  model: DrawDocumentModel,
  selectedIds: readonly DrawObjectId[] = [],
): DrawCanvasSessionState {
  assertDrawDocument(model);
  const scene = projectDrawScene(model, model.activePageId);
  return {
    model,
    selectedIds: normalizeDrawSelection(scene, selectedIds),
    interaction: { kind: 'idle' },
    hoverId: null,
    marqueeRect: null,
    guides: [],
    announcement: null,
    gestureBase: null,
  };
}

function step(
  state: DrawCanvasSessionState,
  overrides: Partial<DrawCanvasSessionState> = {},
  commit: DrawSessionCommit = 'none',
): DrawCanvasSessionStep {
  return { state: { ...state, ...overrides }, commit };
}

/** True when the interaction consumes pointer movement and therefore needs a gesture base. */
function opensGesture(interaction: DrawInteractionState): boolean {
  return interaction.kind === 'drag' || interaction.kind === 'resize' || interaction.kind === 'rotate';
}

function revisionChanged(before: DrawDocumentModel | null, after: DrawDocumentModel): boolean {
  return before === null || before.revision !== after.revision;
}

export function drawSessionPointerDown(
  state: DrawCanvasSessionState,
  input: DrawPointerDownInput,
): DrawCanvasSessionStep {
  // Alt+click while a single connector is selected adds a routing waypoint. Checked before the
  // controller so the documented waypoint gesture is not shadowed by Alt+drag rotation.
  if (input.modifiers.alt && state.selectedIds.length === 1) {
    const only = state.selectedIds[0]!;
    if (state.model.objects[only]?.type === 'connector') {
      return drawSessionCommand(state, { kind: 'connector-waypoint', point: input.point });
    }
  }
  const result = beginDrawPointerInteraction(state.model, state.selectedIds, input);
  const nextInteraction = result.state;
  const base = opensGesture(nextInteraction) || nextInteraction.kind === 'text' ? state.model : null;
  return step(state, {
    selectedIds: result.selectedIds,
    interaction: nextInteraction,
    hoverId: null,
    marqueeRect: result.marqueeRect,
    guides: [],
    announcement: result.announcement,
    gestureBase: base,
  });
}

export function drawSessionPointerMove(
  state: DrawCanvasSessionState,
  input: DrawPointerMoveInput,
): DrawCanvasSessionStep {
  const base = opensGesture(state.interaction) ? (state.gestureBase ?? state.model) : state.model;
  const result = updateDrawPointerInteraction(base, state.selectedIds, state.interaction, input);
  const changed = result.model !== base;
  // A drag/resize/rotate moves the anchors a connector hangs from; keep the stored routed box in step
  // so marquee selection and the spatial index still find the connector.
  const movedIds = gestureSubjectIds(state);
  const next = changed ? syncAffectedConnectors(result.model, movedIds) : state.model;
  return step(state, {
    model: next,
    selectedIds: result.selectedIds,
    interaction: result.state,
    hoverId: result.hoverId,
    marqueeRect: result.marqueeRect,
    guides: result.guides,
    announcement: result.announcement,
  }, changed ? 'live' : 'none');
}

export function drawSessionPointerUp(
  state: DrawCanvasSessionState,
  input: DrawPointerUpInput,
): DrawCanvasSessionStep {
  const gesture = opensGesture(state.interaction);
  const base = gesture ? (state.gestureBase ?? state.model) : state.model;
  const result = endDrawPointerInteraction(base, state.selectedIds, state.interaction, input);
  // The controller resolves the *base* model for a committed drag; the session keeps the live model.
  const model = gesture ? state.model : result.model;
  const commit: DrawSessionCommit = gesture && revisionChanged(state.gestureBase, model) ? 'history' : 'none';
  return step(state, {
    model,
    selectedIds: result.selectedIds,
    interaction: { kind: 'idle' },
    hoverId: null,
    marqueeRect: null,
    guides: [],
    announcement: result.announcement,
    gestureBase: null,
  }, commit);
}

/** `pointercancel` / Escape during a drag: the gesture is rolled back to its base model. */
export function drawSessionPointerCancel(state: DrawCanvasSessionState): DrawCanvasSessionStep {
  if (!opensGesture(state.interaction) || !state.gestureBase) {
    return step(state, {
      interaction: { kind: 'idle' }, marqueeRect: null, guides: [], announcement: 'cancelled', gestureBase: null,
    });
  }
  const changed = revisionChanged(state.gestureBase, state.model);
  return step(state, {
    model: state.gestureBase,
    interaction: { kind: 'idle' },
    marqueeRect: null,
    guides: [],
    announcement: 'cancelled',
    gestureBase: null,
  }, changed ? 'live' : 'none');
}

/**
 * Keyboard path. Returns `null` when the key is not a Draw command so the caller can let it bubble —
 * every essential canvas function (select next/previous, move, delete, group/ungroup, layer order,
 * text edit, snap toggle) is reachable from here.
 */
export function drawSessionKeyDown(
  state: DrawCanvasSessionState,
  event: DrawKeyboardInput,
): DrawCanvasSessionStep | null {
  // Ctrl/Cmd+Shift+C connects the two selected objects: the pointer path (button in the layer panel)
  // must never be the only way to create a connector.
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.shiftKey && event.key.toLowerCase() === 'c' && state.interaction.kind !== 'text') {
    if (state.selectedIds.length !== 2) throw new DrawModelError('connect-needs-two-objects');
    return drawSessionCommand(state, { kind: 'connect' });
  }
  const result = applyDrawKeyboardInteraction(state.model, state.selectedIds, state.interaction, event);
  if (!result) return null;
  const changed = result.model !== state.model;
  const intoText = result.state.kind === 'text' && state.interaction.kind !== 'text';
  return step(state, {
    model: result.model,
    selectedIds: result.selectedIds,
    interaction: result.state,
    marqueeRect: null,
    guides: [],
    announcement: result.announcement,
    gestureBase: intoText ? state.model : (opensGesture(result.state) ? state.model : state.gestureBase),
  }, changed ? 'history' : 'none');
}

export function drawSessionDoubleClick(
  state: DrawCanvasSessionState,
  point: DrawPoint,
): DrawCanvasSessionStep {
  const scene = projectDrawScene(state.model, state.model.activePageId);
  const hit = hitTestDrawScene(scene, point, { groupSelect: true });
  if (!hit || hit.entry.object.type === 'connector') return step(state);
  const result = beginDrawTextInteraction(state.model, state.selectedIds, hit.objectId);
  return step(state, {
    selectedIds: result.selectedIds,
    interaction: result.state,
    announcement: result.announcement,
    gestureBase: state.model,
  });
}

/** Live text update while typing directly on the canvas (one undo step for the whole edit). */
export function drawSessionSetText(state: DrawCanvasSessionState, text: string): DrawCanvasSessionStep {
  if (state.interaction.kind !== 'text') return step(state);
  const next = setDrawObjectText(state.model, state.interaction.objectId, text);
  if (next === state.model) return step(state);
  return step(state, {
    model: next,
    gestureBase: state.gestureBase ?? state.model,
    announcement: 'text-typing',
  }, 'live');
}

export function drawSessionEndText(state: DrawCanvasSessionState): DrawCanvasSessionStep {
  if (state.interaction.kind !== 'text') return step(state);
  const commit: DrawSessionCommit = revisionChanged(state.gestureBase, state.model) ? 'history' : 'none';
  return step(state, {
    interaction: { kind: 'idle' },
    gestureBase: null,
    announcement: 'text-committed',
  }, commit);
}

export type DrawSessionCommand =
  | { readonly kind: 'select'; readonly ids: readonly DrawObjectId[] }
  | { readonly kind: 'select-root'; readonly id: DrawObjectId }
  | { readonly kind: 'cycle-selection'; readonly direction: 1 | -1 }
  | { readonly kind: 'select-all' }
  | { readonly kind: 'clear-selection' }
  | { readonly kind: 'nudge'; readonly delta: DrawPoint }
  | { readonly kind: 'delete' }
  | { readonly kind: 'group' }
  | { readonly kind: 'ungroup' }
  | { readonly kind: 'add-to-container'; readonly containerId: DrawObjectId }
  | { readonly kind: 'z-order'; readonly action: ZOrderAction }
  | { readonly kind: 'set-locked'; readonly locked: boolean }
  | { readonly kind: 'insert-stencil'; readonly stencilId: string; readonly point: DrawPoint; readonly layerId?: string; readonly idSeed?: string }
  | { readonly kind: 'connect'; readonly fromId?: DrawObjectId; readonly toId?: DrawObjectId; readonly route?: DrawConnectorRoute }
  | { readonly kind: 'disconnect' }
  | { readonly kind: 'connector-route'; readonly route: DrawConnectorRoute }
  | { readonly kind: 'connector-waypoint'; readonly point: DrawPoint }
  | { readonly kind: 'connector-clear-waypoints' }
  | { readonly kind: 'connector-label'; readonly text: string }
  | { readonly kind: 'connector-arrowheads'; readonly arrowStart: DrawArrowhead; readonly arrowEnd: DrawArrowhead }
  | { readonly kind: 'style'; readonly patch: Partial<DrawVectorStyle> }
  | { readonly kind: 'typography'; readonly patch: DrawTypographyPatch }
  | { readonly kind: 'shadow'; readonly shadow: DrawVectorStyle['shadow'] | undefined }
  | { readonly kind: 'align'; readonly operation: TransformOperation; readonly amount?: DrawPoint }
  | { readonly kind: 'move-to-layer'; readonly layerId: string }
  | { readonly kind: 'layer-visibility'; readonly layerId: string; readonly value: boolean }
  | { readonly kind: 'layer-lock'; readonly layerId: string; readonly value: boolean }
  | { readonly kind: 'layer-printable'; readonly layerId: string; readonly value: boolean }
  | { readonly kind: 'layer-order'; readonly pageId: string; readonly layerId: string; readonly direction: 1 | -1 }
  | { readonly kind: 'rename-layer'; readonly layerId: string; readonly name: string }
  | { readonly kind: 'viewport'; readonly patch: Partial<DrawViewport> }
  | { readonly kind: 'guide-add'; readonly axis: 'x' | 'y'; readonly position: number }
  | { readonly kind: 'guide-remove'; readonly guideId: string }
  | { readonly kind: 'guide-move'; readonly guideId: string; readonly position: number }
  | { readonly kind: 'sync-connector-bounds' };

function changedStep(state: DrawCanvasSessionState, model: DrawDocumentModel, extra: Partial<DrawCanvasSessionState> = {}): DrawCanvasSessionStep {
  if (model === state.model) return step(state, extra);
  return step(state, { ...extra, model }, 'history');
}

/**
 * Connector commands need a connector subject. `primaryDrawSelection` deliberately skips connectors
 * (they have no resizable box), so using it here threw `selection-empty` for every connector edit —
 * found by the Alt+click waypoint test, not by inspection.
 */
function requireSelectedConnector(state: DrawCanvasSessionState): DrawObjectId {
  const id = state.selectedIds.find((candidate) => state.model.objects[candidate]?.type === 'connector');
  if (!id) throw new DrawModelError('connector-missing');
  return id;
}

/** Connectors whose route depends on one of `movedIds`; one pass over the page, never a nested scan. */
function affectedConnectorIds(model: DrawDocumentModel, movedIds: readonly DrawObjectId[]): DrawObjectId[] {
  if (movedIds.length === 0) return [];
  const moved = new Set(movedIds);
  const page = model.pages.find((candidate) => candidate.id === model.activePageId);
  if (!page) return [];
  const ids: DrawObjectId[] = [];
  for (const id of page.objectIds) {
    const object = model.objects[id];
    if (object?.type !== 'connector' || !object.connector) continue;
    if (moved.has(object.connector.from.objectId) || moved.has(object.connector.to.objectId)) ids.push(id);
  }
  return ids;
}

/**
 * Writes routed extents back onto the connectors affected by a geometry edit, so the stored box stays
 * usable for marquee selection and the spatial index. Bounded by the moved objects' own connectors.
 */
function syncAffectedConnectors(model: DrawDocumentModel, movedIds: readonly DrawObjectId[]): DrawDocumentModel {
  const ids = affectedConnectorIds(model, movedIds);
  if (ids.length === 0) return model;
  return syncDrawConnectorBounds(model, ids);
}

/** Objects a live gesture changes: the dragged selection, or the resized/rotated single object. */
function gestureSubjectIds(state: DrawCanvasSessionState): readonly DrawObjectId[] {
  const interaction = state.interaction;
  if (interaction.kind === 'drag') return interaction.ids;
  if (interaction.kind === 'resize' || interaction.kind === 'rotate') return [interaction.objectId];
  return [];
}

/**
 * Panel and intent commands. One branch per user action, each delegating to an existing engine; the
 * selection is re-normalized against the new scene so a deleted/grouped id can never stay selected.
 */
export function drawSessionCommand(
  state: DrawCanvasSessionState,
  command: DrawSessionCommand,
): DrawCanvasSessionStep {
  const scene = () => projectDrawScene(state.model, state.model.activePageId);
  switch (command.kind) {
    case 'select': {
      return step(state, { selectedIds: normalizeDrawSelection(scene(), command.ids) });
    }
    case 'select-root': {
      const current = scene();
      const entry = current.byId.get(command.id);
      if (!entry) return step(state);
      const expanded = expandDrawSelection(current, [entry.object.id]);
      return step(state, { selectedIds: normalizeDrawSelection(current, expanded) });
    }
    case 'cycle-selection': {
      return step(state, { selectedIds: cycleDrawSelection(scene(), state.selectedIds, command.direction) });
    }
    case 'select-all': {
      const current = scene();
      const all = current.hitOrder.filter((entry) => entry.visible && !entry.locked).map((entry) => entry.object.id);
      return step(state, { selectedIds: normalizeDrawSelection(current, all) });
    }
    case 'clear-selection':
      return step(state, { selectedIds: [] });
    case 'nudge': {
      if (state.selectedIds.length === 0) return step(state);
      const result = moveDrawObjects(state.model, state.selectedIds, command.delta, { snap: false });
      return changedStep(state, syncAffectedConnectors(result.model, state.selectedIds), { announcement: 'moving' });
    }
    case 'delete': {
      if (state.selectedIds.length === 0) return step(state);
      const next = deleteDrawObjects(state.model, state.selectedIds);
      return changedStep(state, next, { selectedIds: [], announcement: 'deleted' });
    }
    case 'group': {
      const next = groupDrawSelection(state.model, state.selectedIds);
      const nextScene = projectDrawScene(next, next.activePageId);
      const grouped = nextScene.hitOrder.find((entry) => entry.object.type === 'group')?.object.id;
      return changedStep(state, next, {
        selectedIds: grouped ? [grouped] : [],
        announcement: 'grouped',
      });
    }
    case 'ungroup': {
      const current = scene();
      const children = state.selectedIds
        .map((id) => current.byId.get(id)?.object.childIds ?? [])
        .flat();
      const next = ungroupDrawSelection(state.model, state.selectedIds);
      const nextScene = projectDrawScene(next, next.activePageId);
      return changedStep(state, next, {
        selectedIds: children.filter((id) => nextScene.byId.has(id)),
        announcement: 'ungrouped',
      });
    }
    case 'add-to-container': {
      const next = addDrawSelectionToGroup(state.model, command.containerId, state.selectedIds);
      return changedStep(state, next, { announcement: 'grouped' });
    }
    case 'z-order': {
      const next = applyDrawZOrder(state.model, state.selectedIds, command.action as ZOrderAction);
      return changedStep(state, next, { announcement: `z-order-${command.action}` });
    }
    case 'set-locked': {
      const next = setDrawObjectsLocked(state.model, state.selectedIds, command.locked);
      return changedStep(state, next, { selectedIds: [], announcement: command.locked ? 'locked' : 'unlocked' });
    }
    case 'insert-stencil': {
      const result = dropDrawStencil(state.model, command.stencilId, command.point, {
        layerId: command.layerId,
        idSeed: command.idSeed,
      });
      // Dropping onto an existing group makes the new object a child of that container, so a lane or
      // frame actually holds its contents instead of merely overlapping them.
      const containerId = findDrawContainerAt(result.model, command.point);
      const next = containerId ? addDrawSelectionToGroup(result.model, containerId, [result.objectId]) : result.model;
      return changedStep(state, next, { selectedIds: [result.objectId], announcement: 'inserted' });
    }
    case 'connect': {
      const fromId = command.fromId ?? state.selectedIds[0];
      const toId = command.toId ?? state.selectedIds[1];
      if (!fromId || !toId) throw new DrawModelError('selection-empty');
      const next = createDrawConnector(state.model, fromId, toId, { route: command.route });
      const created = Object.keys(next.objects).find((id) => !state.model.objects[id]);
      return changedStep(state, next, { selectedIds: created ? [created] : [], announcement: 'connected' });
    }
    case 'disconnect': {
      const target = requireSelectedConnector(state);
      const next = deleteDrawConnector(state.model, target);
      return changedStep(state, next, { selectedIds: [], announcement: 'disconnected' });
    }
    case 'connector-route': {
      const next = setDrawConnectorRoute(state.model, requireSelectedConnector(state), command.route);
      return changedStep(state, next, { announcement: 'connector-routed' });
    }
    case 'connector-waypoint': {
      const next = appendDrawConnectorWaypoint(state.model, requireSelectedConnector(state), command.point);
      return changedStep(state, next, { announcement: 'connector-waypoint-added' });
    }
    case 'connector-clear-waypoints': {
      const next = clearDrawConnectorWaypoints(state.model, requireSelectedConnector(state));
      return changedStep(state, next, { announcement: 'connector-auto-routed' });
    }
    case 'connector-label': {
      const next = setDrawConnectorLabel(state.model, requireSelectedConnector(state), command.text);
      return changedStep(state, next, { announcement: 'connector-labelled' });
    }
    case 'connector-arrowheads': {
      const next = setDrawConnectorArrowheads(state.model, requireSelectedConnector(state), command.arrowStart, command.arrowEnd);
      return changedStep(state, next, { announcement: 'connector-labelled' });
    }
    case 'style': {
      const next = applyDrawStylePatch(state.model, state.selectedIds, command.patch);
      return changedStep(state, next, { announcement: 'styled' });
    }
    case 'typography': {
      const next = applyDrawTypographyPatch(state.model, state.selectedIds, command.patch);
      return changedStep(state, next, { announcement: 'typography' });
    }
    case 'shadow': {
      const next = applyDrawShadowPatch(state.model, state.selectedIds, command.shadow);
      return changedStep(state, next, { announcement: 'shadow' });
    }
    case 'align': {
      const next = alignDrawObjects(state.model, state.selectedIds, command.operation, command.amount);
      return changedStep(state, next, { announcement: `align-${command.operation}` });
    }
    case 'move-to-layer': {
      const result = moveDrawObjectsToLayer(state.model, state.selectedIds, command.layerId);
      return changedStep(state, result.model, { announcement: 'layer-moved' });
    }
    case 'layer-visibility': {
      return changedStep(state, setDrawLayerVisibility(state.model, command.layerId, command.value), { announcement: 'layer-visibility' });
    }
    case 'layer-lock': {
      const next = setDrawLayerLock(state.model, command.layerId, command.value);
      const nextScene = projectDrawScene(next, next.activePageId);
      return changedStep(state, next, {
        selectedIds: state.selectedIds.filter((id) => !nextScene.byId.get(id)?.locked),
        announcement: 'layer-lock',
      });
    }
    case 'layer-printable': {
      return changedStep(state, setDrawLayerPrintable(state.model, command.layerId, command.value), { announcement: 'layer-printable' });
    }
    case 'layer-order': {
      return changedStep(state, stepDrawLayerOrder(state.model, command.pageId, command.layerId, command.direction), { announcement: 'layer-order' });
    }
    case 'rename-layer': {
      return changedStep(state, renameDrawLayer(state.model, command.layerId, command.name), { announcement: 'layer-renamed' });
    }
    case 'viewport': {
      const viewport: DrawViewport = { ...state.model.viewport, ...command.patch };
      const next: DrawDocumentModel = { ...state.model, viewport };
      return step(state, { model: next }, 'history');
    }
    case 'guide-add': {
      const next = addDrawGuide(state.model, command.axis, command.position);
      return changedStep(state, next, { announcement: 'guide-added' });
    }
    case 'guide-remove': {
      const next = removeDrawGuide(state.model, command.guideId);
      return changedStep(state, next, { announcement: 'guide-removed' });
    }
    case 'guide-move': {
      const next = moveDrawGuide(state.model, command.guideId, command.position);
      return changedStep(state, next, { announcement: 'guide-moved' });
    }
    case 'sync-connector-bounds': {
      const next = syncDrawConnectorBounds(state.model);
      return changedStep(state, next);
    }
    default:
      throw new DrawModelError('session-command-unknown');
  }
}
