import {
  ChartObject,
  PresentChartSceneObject,
  PresentCodeSceneObject,
  PresentDiagramSceneObject,
  PresentImageObject,
  PresentObjectGeometry,
  PresentSceneObject,
  PresentShapeSceneObject,
  PresentTableSceneObject,
  PresentTextSceneObject,
  PresentWidgetSceneObject,
  PresentWidgetType,
} from '../../../../shared/contracts/workspace';
import { createPresentWidgetDefaults } from '../widgets/presentWidgets';
import { PRESENT_DEFAULT_ASPECT, rectFromCorners, type PresentPercentRect } from './presentRect';
import {
  computePresentSnapGeometry,
  PRESENT_DEFAULT_SNAP_TOLERANCE_PERCENT,
  type PresentSnapGuide,
  type PresentSnapOptions,
} from './presentSnapping';

export type PresentLayerObject = PresentSceneObject | PresentImageObject;

/** Upper bound for one layer-order operation; a document may not name an unbounded id list. */
export const PRESENT_MAX_LAYER_MOVE_IDS = 512;

// ---------------------------------------------------------------------------------------------
// PR-007 (M1) — freeform shape drawing.
//
// The canvas draws what the pointer describes; the click-without-drag shortcut has a documented
// default footprint. Both live here as pure geometry (`PresentShapeDrawing`) so the **preview** and
// the **committed object** are computed by the same function and can never disagree.
// ---------------------------------------------------------------------------------------------

/** Default footprint of a shape created by a click without a drag, in slide percent. */
export const PRESENT_SHAPE_CLICK_WIDTH_PERCENT = 20;
export const PRESENT_SHAPE_CLICK_HEIGHT_PERCENT = 16;
/** A click-line is a horizontal divider of this default length and the stroke height of every line. */
export const PRESENT_SHAPE_CLICK_LINE_WIDTH_PERCENT = 24;
export const PRESENT_SHAPE_LINE_HEIGHT_PERCENT = 2;
/** Shortest drawn line width; matches the geometry normaliser's minimum percent width. */
export const PRESENT_SHAPE_LINE_MIN_WIDTH_PERCENT = 3;
/** Pointer travel below this many percent of the slide height is a click, not a drag. */
export const PRESENT_SHAPE_DRAW_MIN_DRAG_PERCENT = 0.8;

/**
 * Geometry produced by one draw gesture.
 *
 * `rect` is the bounding box in slide percent; `rotationDeg` is only non-zero for a freeform line,
 * where the box is the rotated bar's frame and the angle carries the real start→end direction.
 */
export interface PresentShapeDrawing {
  rect: PresentPercentRect;
  rotationDeg: number;
}

export interface PresentShapeDragOptions {
  /** Shift keeps a rectangle/ellipse 1:1 in physical slide space (a visual square, not a percent one). */
  shift?: boolean;
  /** Slide aspect ratio (width / height). Defaults to 16:9 so callers without a stage still agree. */
  aspectRatio?: number;
}

const clampPercent = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function safeAspectRatio(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : PRESENT_DEFAULT_ASPECT;
}

/**
 * The documented click-without-drag result: the default size, centred on the click point and kept
 * inside the slide. "Am Klickpunkt" therefore means the object appears where the user clicked
 * instead of at a hard-coded position far away.
 */
export function presentShapeClickDrawing(
  shape: PresentShapeSceneObject['shape'],
  point: { xPercent: number; yPercent: number },
): PresentShapeDrawing {
  const isLine = shape === 'line';
  const widthPercent = isLine ? PRESENT_SHAPE_CLICK_LINE_WIDTH_PERCENT : PRESENT_SHAPE_CLICK_WIDTH_PERCENT;
  const heightPercent = isLine ? PRESENT_SHAPE_LINE_HEIGHT_PERCENT : PRESENT_SHAPE_CLICK_HEIGHT_PERCENT;
  return {
    rect: {
      xPercent: clampPercent(point.xPercent - widthPercent / 2, 0, 100 - widthPercent),
      yPercent: clampPercent(point.yPercent - heightPercent / 2, 0, 100 - heightPercent),
      widthPercent,
      heightPercent,
    },
    rotationDeg: 0,
  };
}

/**
 * Geometry of a freeform draw gesture between two slide points.
 *
 * - rectangle / ellipse: the two points are opposite corners (any drag direction).
 * - Shift: a 1:1 shape in physical space; the longer physical axis drives the square (the slide is
 *   anisotropic, so a square in percent space would be visibly warped on a 16:9 slide).
 * - line: the box is the bar frame between the points; its centre is the drag centre and its
 *   rotation is the real start→end angle, so the line keeps its true coordinates.
 * - a drag shorter than `PRESENT_SHAPE_DRAW_MIN_DRAG_PERCENT` is a click and returns the default
 *   footprint at the end point.
 */
export function presentShapeDragDrawing(
  shape: PresentShapeSceneObject['shape'],
  start: { xPercent: number; yPercent: number },
  end: { xPercent: number; yPercent: number },
  options: PresentShapeDragOptions = {},
): PresentShapeDrawing {
  const aspect = safeAspectRatio(options.aspectRatio);
  const dxPercent = (Number.isFinite(end.xPercent) ? end.xPercent : start.xPercent) - start.xPercent;
  const dyPercent = (Number.isFinite(end.yPercent) ? end.yPercent : start.yPercent) - start.yPercent;
  const physicalDx = dxPercent * aspect;
  const physicalDy = dyPercent;
  const distance = Math.hypot(physicalDx, physicalDy);

  if (shape === 'line') {
    if (distance < PRESENT_SHAPE_DRAW_MIN_DRAG_PERCENT) return presentShapeClickDrawing(shape, end);
    const widthPercent = Math.max(PRESENT_SHAPE_LINE_MIN_WIDTH_PERCENT, distance / aspect);
    const heightPercent = PRESENT_SHAPE_LINE_HEIGHT_PERCENT;
    const centreX = start.xPercent + dxPercent / 2;
    const centreY = start.yPercent + dyPercent / 2;
    return {
      rect: {
        xPercent: clampPercent(centreX - widthPercent / 2, 0, Math.max(0, 100 - widthPercent)),
        yPercent: clampPercent(centreY - heightPercent / 2, 0, Math.max(0, 100 - heightPercent)),
        widthPercent,
        heightPercent,
      },
      rotationDeg: (Math.atan2(physicalDy, physicalDx) * 180) / Math.PI,
    };
  }

  if (distance < PRESENT_SHAPE_DRAW_MIN_DRAG_PERCENT) return presentShapeClickDrawing(shape, end);

  let endXPercent = end.xPercent;
  let endYPercent = end.yPercent;
  if (options.shift) {
    // Visual square: one physical side length, anchored at the start corner and following the sign
    // of each drag axis (a straight-axis drag still grows the square sideways).
    const sidePhysical = Math.max(Math.abs(physicalDx), Math.abs(physicalDy));
    const sideWidthPercent = sidePhysical / aspect;
    endXPercent = start.xPercent + (dxPercent < 0 ? -sideWidthPercent : sideWidthPercent);
    endYPercent = start.yPercent + (dyPercent < 0 ? -sidePhysical : sidePhysical);
  }

  return {
    rect: rectFromCorners(start, { xPercent: endXPercent, yPercent: endYPercent }),
    rotationDeg: 0,
  };
}

/**
 * Creates a shape scene object. Without `drawing` the historical fixed-default geometry is kept, so
 * every pre-PR-007 caller (and the keyboard/command paths) behaves exactly as before.
 */

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Round 24 (malformed entries): a hostile document can put `null`/primitives INSIDE an otherwise
 * valid list (`sceneObjects`, `cards`, chart `series`, `images`, `animations`). Readers filter those
 * entries before touching their fields; writers always keep the raw list, so nothing is repaired or
 * removed from the document.
 */
export function isPlainPresentRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Round 25 (data integrity): the write-back merge for `sceneObjects`.
 *
 * Readers work on a filtered list (`null`/primitive entries removed). A transform/patch therefore
 * carries only the real objects; writing that list back verbatim would silently delete the hostile
 * entries — a data loss on corrupted documents. This pure helper merges the transformed objects into
 * the raw list:
 *   - every raw entry keeps its slot; non-objects / objects without a string `id` are copied
 *     unchanged and stay at their original relative position,
 *   - raw objects whose `id` appears in `nextEntries` are replaced by the updated version and follow
 *     the `nextEntries` order (deleted ids disappear, reorders are honoured); duplicate raw ids are
 *     preserved occurrence-by-occurrence instead of being collapsed into one (Fall 6 matrix),
 *   - genuinely new ids (created text box, duplicate, inserted object) are appended at the end in
 *     `nextEntries` order,
 *   - an identity write (`nextEntries` is the raw list) returns the raw list byte-identically.
 */
export function mergePresentSceneObjects(
  rawEntries: readonly unknown[] | null | undefined,
  nextEntries: readonly unknown[] | null | undefined,
): unknown[] {
  const raw = Array.isArray(rawEntries) ? rawEntries : [];
  const next = Array.isArray(nextEntries) ? nextEntries : [];
  const rawIds = new Set<string>();
  for (const entry of raw) {
    if (isPlainPresentRecord(entry) && typeof entry.id === 'string') rawIds.add(entry.id);
  }
  // Keep the occurrence order of `nextEntries`; duplicates are intentionally not collapsed.
  const existing = next.filter(
    (entry) => isPlainPresentRecord(entry) && typeof entry.id === 'string' && rawIds.has(entry.id),
  );
  const appended = next.filter(
    (entry) => isPlainPresentRecord(entry) && typeof entry.id === 'string' && !rawIds.has(entry.id),
  );
  // Non-updatable raw entries keep their position relative to the raw object count preceding them.
  const slots: Array<{ after: number; entry: unknown }> = [];
  let seenObjects = 0;
  for (const entry of raw) {
    if (isPlainPresentRecord(entry) && typeof entry.id === 'string') {
      seenObjects += 1;
      continue;
    }
    slots.push({ after: seenObjects, entry });
  }
  const merged: unknown[] = [];
  let slotIndex = 0;
  const emitSlotsThrough = (after: number) => {
    while (slotIndex < slots.length && slots[slotIndex].after <= after) {
      merged.push(slots[slotIndex].entry);
      slotIndex += 1;
    }
  };
  emitSlotsThrough(0);
  for (let index = 0; index < existing.length; index += 1) {
    merged.push(existing[index]);
    emitSlotsThrough(index + 1);
  }
  while (slotIndex < slots.length) {
    merged.push(slots[slotIndex].entry);
    slotIndex += 1;
  }
  merged.push(...appended);
  return merged;
}

export function normalizePresentGeometry<T extends PresentObjectGeometry>(object: T): T {
  const width = clamp(Number.isFinite(object.widthPercent) ? object.widthPercent : 20, 3, 100);
  const height = clamp(Number.isFinite(object.heightPercent) ? object.heightPercent : 15, 2, 100);
  return {
    ...object,
    xPercent: clamp(Number.isFinite(object.xPercent) ? object.xPercent : 0, 0, Math.max(0, 100 - width)),
    yPercent: clamp(Number.isFinite(object.yPercent) ? object.yPercent : 0, 0, Math.max(0, 100 - height)),
    widthPercent: width,
    heightPercent: height,
    rotation: clamp(Number.isFinite(object.rotation ?? 0) ? (object.rotation ?? 0) : 0, -360, 360),
    opacity: clamp(Number.isFinite(object.opacity ?? 1) ? (object.opacity ?? 1) : 1, 0, 1),
    zIndex: Number.isFinite(object.zIndex ?? 1) ? Math.round(object.zIndex ?? 1) : 1,
    locked: Boolean(object.locked),
    hidden: Boolean(object.hidden),
  };
}

export function normalizePresentImage(image: PresentImageObject): PresentImageObject {
  return normalizePresentGeometry({
    ...image,
    heightPercent: Number.isFinite(image.heightPercent) ? image.heightPercent : Math.max(8, image.widthPercent * 0.5625),
  });
}

/**
 * A text object at the requested slide position (or the editor default when no point is given).
 * Paket 4: "Canvas anklicken und editierbare Textbox erstellen" - the factory therefore accepts the
 * click point instead of always dropping the box at 12 % / 28 %.
 */
export function createPresentTextObject(
  id: string,
  point: { xPercent: number; yPercent: number } = { xPercent: 12, yPercent: 28 },
): PresentTextSceneObject {
  return normalizePresentGeometry({
    id,
    kind: 'text',
    text: '',
    xPercent: Number.isFinite(point.xPercent) ? point.xPercent : 12,
    yPercent: Number.isFinite(point.yPercent) ? point.yPercent : 28,
    widthPercent: 34,
    heightPercent: 12,
    fontSizePt: 22,
    fontWeight: 'semibold',
    color: '#f8fafc',
    textAlign: 'left',
    zIndex: 20,
  });
}

export function createPresentShapeObject(
  id: string,
  shape: PresentShapeSceneObject['shape'] = 'rounded-rectangle',
  drawing?: PresentShapeDrawing,
): PresentShapeSceneObject {
  const isLine = shape === 'line';
  const rect = drawing?.rect;
  return normalizePresentGeometry({
    id,
    kind: 'shape',
    shape,
    xPercent: rect ? rect.xPercent : 48,
    yPercent: rect ? rect.yPercent : 32,
    widthPercent: rect ? rect.widthPercent : isLine ? 24 : 20,
    heightPercent: rect ? rect.heightPercent : isLine ? 2 : 16,
    rotation: drawing?.rotationDeg ?? 0,
    fillColor: isLine ? '#3b82f6' : '#2563eb',
    strokeColor: '#60a5fa',
    strokeWidth: 2,
    opacity: 0.9,
    // Round 40 (P0): shapes must sit above the slide content layer at least like text does. With
    // zIndex 10 they tied with the legacy header/body/footer layer (z-10) and were painted/hit-tested
    // underneath it natively — a freshly drawn shape could not be grabbed and dragged.
    zIndex: 20,
  });
}

export function createPresentWidgetObject(
  id: string,
  widgetType: PresentWidgetType = 'kpi'
): PresentWidgetSceneObject {
  const defaults = createPresentWidgetDefaults(widgetType);
  const wide = ['milestone', 'roadmap', 'comparison', 'quote', 'status', 'calendar', 'device', 'gallery'].includes(widgetType);
  const tall = ['progress-ring', 'gauge', 'calendar', 'device', 'gallery'].includes(widgetType);
  return normalizePresentGeometry({
    id,
    kind: 'widget',
    ...defaults,
    xPercent: wide ? 28 : 54,
    yPercent: 44,
    widthPercent: wide ? 46 : 26,
    heightPercent: tall ? 28 : wide ? 22 : 18,
    zIndex: 30,
  });
}

export function createPresentDiagramObject(
  id: string,
  diagramType: PresentDiagramSceneObject['diagramType'] = 'process'
): PresentDiagramSceneObject {
  const items = diagramType === 'timeline'
    ? [
        { id: 'item-1', title: 'Phase 1', subtitle: 'Architecture', color: '#3b82f6' },
        { id: 'item-2', title: 'Phase 2', subtitle: 'Native Core', color: '#10b981' },
        { id: 'item-3', title: 'Phase 3', subtitle: 'Release RC', color: '#f59e0b' },
      ]
    : diagramType === 'matrix'
    ? [
        { id: 'item-1', title: 'High Value', subtitle: 'Strategic Priority', color: '#10b981' },
        { id: 'item-2', title: 'Quick Wins', subtitle: 'Fast Delivery', color: '#3b82f6' },
        { id: 'item-3', title: 'Maintenance', subtitle: 'Routine Tasks', color: '#6b7280' },
        { id: 'item-4', title: 'Re-evaluate', subtitle: 'Low Priority', color: '#ef4444' },
      ]
    : [
        { id: 'item-1', title: 'Input', subtitle: 'Local Files', color: '#3b82f6' },
        { id: 'item-2', title: 'Engine', subtitle: 'Rust Crypto', color: '#8b5cf6' },
        { id: 'item-3', title: 'Output', subtitle: 'Encrypted VWC', color: '#10b981' },
      ];

  return normalizePresentGeometry({
    id,
    kind: 'diagram',
    diagramType,
    items,
    accentColor: '#38bdf8',
    xPercent: 20,
    yPercent: 40,
    widthPercent: 60,
    heightPercent: 24,
    zIndex: 22,
  });
}

export function createPresentCodeObject(id: string, language = 'rust'): PresentCodeSceneObject {
  const defaultCode =
    language === 'rust'
      ? '// Sovereign Rust Core\nfn verify_crypto_envelope() -> bool {\n    true\n}'
      : '// Sovereign TypeScript\nexport const isLocalFirst = true;';

  return normalizePresentGeometry({
    id,
    kind: 'code',
    language,
    code: defaultCode,
    lineNumbers: true,
    xPercent: 24,
    yPercent: 42,
    widthPercent: 48,
    heightPercent: 26,
    zIndex: 24,
  });
}

export function createPresentChartObject(id: string, chart?: ChartObject, linked = false): PresentChartSceneObject {
  const fallback: ChartObject = chart || {
    id: `${id}-chart`,
    chart_type: 'column',
    title: 'Financial Breakdown',
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: 'Growth', values: [28, 45, 62, 85], color: '#38bdf8' }],
  };
  return normalizePresentGeometry({
    id,
    kind: 'chart',
    chart: fallback,
    linked,
    xPercent: 12,
    yPercent: 34,
    widthPercent: 46,
    heightPercent: 36,
    zIndex: 15,
  });
}

export function createPresentTableObject(id: string): PresentTableSceneObject {
  return normalizePresentGeometry({
    id,
    kind: 'table',
    columns: ['Metric', 'Q1 2026', 'Q2 2026', 'Target'],
    rows: [
      ['Users', '12,400', '28,900', '50,000'],
      ['Encryption Key Ops', '1.2M', '3.8M', '10.0M'],
      ['Zero-Leak Verified', '100%', '100%', '100%'],
    ],
    headerColor: '#1e3a8a',
    bodyColor: '#0f172a',
    textColor: '#f8fafc',
    xPercent: 16,
    yPercent: 42,
    widthPercent: 56,
    heightPercent: 26,
    zIndex: 16,
  });
}

export function updatePresentSceneObject(
  objects: PresentSceneObject[],
  id: string,
  patch: Partial<PresentSceneObject>
): PresentSceneObject[] {
  return objects.map((object) =>
    object.id === id ? normalizePresentGeometry({ ...object, ...patch } as PresentSceneObject) : object
  );
}

/**
 * Re-assigns dense z-order values 1..n following the current render order.
 *
 * The previous `movePresentLayer` did arithmetic on the z values (`maxZ + 1`, `current + 1`,
 * `Math.max(1, current - 1)`), which had two real defects: sending the bottom object further back
 * clamped `0` to `1` and therefore did nothing, and `forward` produced the *same* z value as its
 * neighbour, so the visible order depended on array order instead of the requested move. This
 * function makes "the order" a permutation of distinct ranks, so a reorder can never be lost.
 */
export function normalizePresentZOrder<T extends PresentLayerObject>(objects: readonly T[]): T[] {
  const ordered = sortPresentLayers([...objects]);
  const rankById = new Map(ordered.map((object, index) => [object.id, index + 1]));
  return objects.map((object) => ({ ...object, zIndex: rankById.get(object.id) ?? 1 }) as T);
}

/**
 * Moves one object - or a whole selection as a block - through the layer stack.
 * `front`/`back` move to the very top/bottom; `forward`/`backward` move one position and never
 * swap with another selected object. The result carries dense z values, so no order is lost.
 */
export function movePresentLayer<T extends PresentLayerObject>(
  objects: readonly T[],
  ids: string | readonly string[],
  action: 'front' | 'back' | 'forward' | 'backward'
): T[] {
  if (!objects.length) return [...objects];
  const idList = (typeof ids === 'string' ? [ids] : [...ids]).slice(0, PRESENT_MAX_LAYER_MOVE_IDS);
  const selected = new Set(idList.filter((id) => typeof id === 'string' && id.length > 0));
  if (!selected.size) return [...objects];

  const ordered = sortPresentLayers([...objects]);
  const byId = new Map(ordered.map((object) => [object.id, object]));
  const positions = ordered.map((object) => object.id);
  const movingCount = positions.filter((id) => selected.has(id)).length;
  if (!movingCount) return [...objects];

  let nextPositions: string[];
  if (action === 'front') {
    nextPositions = [...positions.filter((id) => !selected.has(id)), ...positions.filter((id) => selected.has(id))];
  } else if (action === 'back') {
    nextPositions = [...positions.filter((id) => selected.has(id)), ...positions.filter((id) => !selected.has(id))];
  } else if (action === 'forward') {
    nextPositions = [...positions];
    for (let index = nextPositions.length - 2; index >= 0; index -= 1) {
      if (selected.has(nextPositions[index]) && !selected.has(nextPositions[index + 1])) {
        [nextPositions[index], nextPositions[index + 1]] = [nextPositions[index + 1], nextPositions[index]];
      }
    }
  } else {
    nextPositions = [...positions];
    for (let index = 1; index < nextPositions.length; index += 1) {
      if (selected.has(nextPositions[index]) && !selected.has(nextPositions[index - 1])) {
        [nextPositions[index], nextPositions[index - 1]] = [nextPositions[index - 1], nextPositions[index]];
      }
    }
  }

  const rankById = new Map(nextPositions.map((id, index) => [id, index + 1]));
  return objects.map((object) => {
    const rank = rankById.get(object.id);
    if (rank === undefined) return { ...object } as T;
    const source = byId.get(object.id) ?? object;
    return { ...source, zIndex: rank } as T;
  });
}

/** Top-to-bottom layer list for the layers pane (highest z first). */
export function presentLayerList<T extends PresentLayerObject>(objects: readonly T[]): T[] {
  return sortPresentLayers([...objects]).reverse();
}

export function sortPresentLayers<T extends { zIndex?: number }>(objects: T[]): T[] {
  return [...objects].sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
}

export function alignPresentObjectToSlide(
  object: PresentSceneObject,
  alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
): PresentSceneObject {
  const patch: Partial<PresentObjectGeometry> = {};
  if (alignment === 'left') patch.xPercent = 0;
  if (alignment === 'center') patch.xPercent = (100 - object.widthPercent) / 2;
  if (alignment === 'right') patch.xPercent = 100 - object.widthPercent;
  if (alignment === 'top') patch.yPercent = 0;
  if (alignment === 'middle') patch.yPercent = (100 - object.heightPercent) / 2;
  if (alignment === 'bottom') patch.yPercent = 100 - object.heightPercent;
  return normalizePresentGeometry({ ...object, ...patch } as PresentSceneObject);
}

export function distributePresentObjects(
  objects: PresentSceneObject[],
  selectedIds: string[],
  direction: 'horizontal' | 'vertical'
): PresentSceneObject[] {
  if (selectedIds.length < 3) return objects;
  const targets = objects.filter((o) => selectedIds.includes(o.id));
  if (targets.length < 3) return objects;

  if (direction === 'horizontal') {
    const sorted = [...targets].sort((a, b) => a.xPercent - b.xPercent);
    const minX = sorted[0].xPercent;
    const maxX = sorted[sorted.length - 1].xPercent;
    const step = (maxX - minX) / (sorted.length - 1);
    return objects.map((o) => {
      const idx = sorted.findIndex((t) => t.id === o.id);
      return idx > 0 && idx < sorted.length - 1
        ? normalizePresentGeometry({ ...o, xPercent: minX + idx * step })
        : o;
    });
  } else {
    const sorted = [...targets].sort((a, b) => a.yPercent - b.yPercent);
    const minY = sorted[0].yPercent;
    const maxY = sorted[sorted.length - 1].yPercent;
    const step = (maxY - minY) / (sorted.length - 1);
    return objects.map((o) => {
      const idx = sorted.findIndex((t) => t.id === o.id);
      return idx > 0 && idx < sorted.length - 1
        ? normalizePresentGeometry({ ...o, yPercent: minY + idx * step })
        : o;
    });
  }
}

/**
 * Snaps one object and returns both the snapped geometry and the guides the canvas must draw.
 * `presentSnapping.computePresentSnapGeometry` is the single snap definition; this wrapper only
 * adds the scene normalisation, so the drawn guide and the snapped position always agree.
 */
export function snapPresentGeometryWithGuides<T extends PresentSceneObject>(
  object: T,
  options: PresentSnapOptions = {}
): { object: T; guides: PresentSnapGuide[] } {
  const outcome = computePresentSnapGeometry(object, options);
  return {
    object: normalizePresentGeometry({ ...object, xPercent: outcome.xPercent, yPercent: outcome.yPercent }),
    guides: outcome.guides,
  };
}

/**
 * Backwards-compatible snap entry point. Accepts either a bare tolerance (previous signature) or
 * full snap options with neighbouring objects, grid and aspect ratio.
 */
export function snapPresentGeometry<T extends PresentSceneObject>(
  object: T,
  toleranceOrOptions: number | PresentSnapOptions = PRESENT_DEFAULT_SNAP_TOLERANCE_PERCENT
): T {
  const options: PresentSnapOptions =
    typeof toleranceOrOptions === 'number' ? { tolerancePercent: toleranceOrOptions } : toleranceOrOptions;
  return snapPresentGeometryWithGuides(object, options).object;
}

export function duplicatePresentSceneObject(object: PresentSceneObject, newId: string): PresentSceneObject {
  return normalizePresentGeometry({
    ...object,
    id: newId,
    xPercent: Math.min(80, object.xPercent + 3),
    yPercent: Math.min(80, object.yPercent + 3),
  } as PresentSceneObject);
}
