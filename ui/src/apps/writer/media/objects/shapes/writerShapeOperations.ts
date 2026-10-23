import { secureRandomId } from '../../../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME — Sovereign Vector Shapes & Drawing Engine
import type {
  WriterShapeBlockData,
  WriterShapeKind,
} from '../../../../../shared/contracts/workspace';

export interface CreateWriterShapeOptions extends Partial<WriterShapeBlockData> {
  x_mm?: number;
  y_mm?: number;
  width_mm?: number;
  height_mm?: number;
  anchor_paragraph_id?: string;
}

/** The minimum a page has to expose for a shape to find its place. */
export interface WriterShapePageLike {
  readonly fragments?: readonly { readonly paragraph: { readonly id: string } }[];
  readonly paragraphs?: readonly { readonly id: string }[];
}

function paragraphIdsOfPage(page: WriterShapePageLike | undefined): string[] {
  if (!page) return [];
  const fromFragments = (page.fragments ?? []).map((fragment) => fragment.paragraph.id);
  const fromParagraphs = (page.paragraphs ?? []).map((paragraph) => paragraph.id);
  return [...fromFragments, ...fromParagraphs];
}

/**
 * The largest coordinate or length a shape may carry, in millimetres (W-072).
 *
 * The value is deliberately a document-scale bound and not a page bound: this module is the media
 * layer and must not learn about paper sizes (the layout layer imports from here, not the other way
 * round). A caller that knows the page passes `bounds`.
 */
export const WRITER_SHAPE_MAX_COORDINATE_MM = 10_000;

/** The smallest length a shape may have. A line or arrow may be flat (height 0). */
const MIN_EXTENT_MM = 1;

export interface WriterShapeGeometryBounds {
  readonly maxCoordinateMm?: number;
  readonly maxWidthMm?: number;
  readonly maxHeightMm?: number;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Brings a shape's geometry into a drawable range (W-072).
 *
 * Before this, coordinates and sizes were taken as given: a shape could sit at `xMm: -50` or be
 * `NaN` wide, was drawn outside the page (or not at all) and was written into the document that way.
 * The clamp is **pure** and **idempotent**, names nothing as an error — clamping is the documented
 * behaviour, not a failure — and never touches any field other than the four geometry values.
 *
 * `bounds` lets the caller pass the page it knows; without it the document-scale bound applies, so an
 * absurd value is still bounded when the page is unknown.
 */
export function clampWriterShapeGeometry(
  shape: WriterShapeBlockData,
  bounds: WriterShapeGeometryBounds = {},
): WriterShapeBlockData {
  const maxCoordinate = finiteOr(bounds.maxCoordinateMm, WRITER_SHAPE_MAX_COORDINATE_MM);
  const maxWidth = finiteOr(bounds.maxWidthMm, WRITER_SHAPE_MAX_COORDINATE_MM);
  const maxHeight = finiteOr(bounds.maxHeightMm, WRITER_SHAPE_MAX_COORDINATE_MM);
  // A line and an arrow are horizontal by definition in this model, so their height stays 0.
  const minHeight = shape.shapeKind === 'line' || shape.shapeKind === 'arrow' ? 0 : MIN_EXTENT_MM;

  const xMm = Math.min(Math.max(finiteOr(shape.xMm, 0), 0), maxCoordinate);
  const yMm = Math.min(Math.max(finiteOr(shape.yMm, 0), 0), maxCoordinate);
  const widthMm = Math.min(Math.max(finiteOr(shape.widthMm, MIN_EXTENT_MM), MIN_EXTENT_MM), maxWidth);
  const heightMm = Math.min(Math.max(finiteOr(shape.heightMm, minHeight), minHeight), maxHeight);

  if (shape.xMm === xMm && shape.yMm === yMm && shape.widthMm === widthMm && shape.heightMm === heightMm) {
    return shape;
  }
  return { ...shape, xMm, yMm, widthMm, heightMm };
}

/**
 * The page a shape is drawn on.
 *
 * A shape carries `anchorParagraphId` from the moment it is inserted, and its
 * coordinates are millimetres **on its page** — so the page that renders the
 * anchor paragraph is the only coherent place for it. Before this, the canvas was
 * drawn on the first page only, which meant a text box inserted while writing on
 * page three appeared on page one.
 *
 * A shape without an anchor — or whose anchor paragraph no longer exists on any
 * page — stays on the first page. That keeps the previous behaviour for documents
 * that never had an anchor and is the only deterministic choice without a stored
 * page number.
 */
export function resolveWriterShapePageIndex(
  shape: WriterShapeBlockData,
  pages: readonly WriterShapePageLike[],
): number {
  const anchorId = shape.anchorParagraphId;
  if (!anchorId || pages.length === 0) return 0;
  const found = pages.findIndex((page) => paragraphIdsOfPage(page).includes(anchorId));
  return found >= 0 ? found : 0;
}

/**
 * The shapes to draw on one page, in their stored order. A shape whose page is
 * resolved receives the page it belongs to; all others stay where they are.
 */
export function resolveWriterShapesForPageIndex(
  shapes: readonly WriterShapeBlockData[],
  pages: readonly WriterShapePageLike[],
  pageIndex: number,
): WriterShapeBlockData[] {
  return shapes.filter((shape) => resolveWriterShapePageIndex(shape, pages) === pageIndex);
}

/**
 * Creates a default shape with standard dimensions and VGT styling.
 */
export function createWriterShape(
  kind: WriterShapeKind,
  optionsOrXMm?: CreateWriterShapeOptions | number,
  yMm = 20,
  idFactory: () => string = () => secureRandomId('shape'),
): WriterShapeBlockData {
  const isOptions = typeof optionsOrXMm === 'object' && optionsOrXMm !== null;
  const opts = isOptions ? optionsOrXMm : {};
  const actualX = typeof optionsOrXMm === 'number' ? optionsOrXMm : (opts.xMm ?? opts.x_mm ?? 20);
  const actualY = typeof optionsOrXMm === 'number' ? yMm : (opts.yMm ?? opts.y_mm ?? 20);
  const isLineOrArrow = kind === 'line' || kind === 'arrow';
  const defaultW = isLineOrArrow ? 60 : 50;
  const defaultH = isLineOrArrow ? 0 : 35;
  const actualW = opts.widthMm ?? opts.width_mm ?? defaultW;
  const actualH = opts.heightMm ?? opts.height_mm ?? defaultH;

  return clampWriterShapeGeometry({
    id: opts.id ?? idFactory(),
    shapeKind: kind,
    xMm: actualX,
    yMm: actualY,
    widthMm: actualW,
    heightMm: actualH,
    rotationDeg: opts.rotationDeg ?? 0,
    fillColor: opts.fillColor ?? (isLineOrArrow ? undefined : '#0f172a'),
    fillOpacity: opts.fillOpacity ?? 0.9,
    strokeColor: opts.strokeColor ?? '#3b82f6',
    strokeWidthPx: opts.strokeWidthPx ?? (isLineOrArrow ? 2.5 : 1.5),
    strokeDashStyle: opts.strokeDashStyle ?? 'solid',
    text: opts.text ?? (kind === 'textbox' ? 'Text hier eingeben' : kind === 'callout' ? 'Hinweis' : undefined),
    calloutTailXMm: opts.calloutTailXMm ?? (kind === 'callout' ? actualX - 10 : undefined),
    calloutTailYMm: opts.calloutTailYMm ?? (kind === 'callout' ? actualY + actualH + 15 : undefined),
    arrowStartHead: opts.arrowStartHead ?? false,
    arrowEndHead: opts.arrowEndHead ?? (kind === 'arrow'),
    zIndex: opts.zIndex ?? 1,
    wrapMode: opts.wrapMode ?? 'square',
    anchorParagraphId: opts.anchorParagraphId ?? opts.anchor_paragraph_id,
  });
}

/**
 * Updates a shape with immutable patch application (W-072: the result is clamped).
 *
 * The clamp happens **after** the patch, so a patch that carries `NaN`, a negative coordinate or an
 * oversized shape cannot reach the document. A patch that touches no geometry is returned unchanged
 * apart from the patched fields.
 */
export function updateWriterShape(
  shape: WriterShapeBlockData,
  patch: Partial<WriterShapeBlockData>,
  bounds: WriterShapeGeometryBounds = {},
): WriterShapeBlockData {
  return clampWriterShapeGeometry({
    ...shape,
    ...patch,
  }, bounds);
}

/**
 * Groups multiple shapes under a single group ID.
 */
export function groupWriterShapes(
  shapes: readonly WriterShapeBlockData[],
  shapeIdsToGroup: readonly string[],
  groupIdFactory: () => string = () => secureRandomId('grp'),
): WriterShapeBlockData[] {
  if (shapeIdsToGroup.length < 2) return [...shapes];
  const targetGroupId = groupIdFactory();

  return shapes.map((shape) => {
    if (shapeIdsToGroup.includes(shape.id)) {
      return {
        ...shape,
        groupId: targetGroupId,
      };
    }
    return shape;
  });
}

/**
 * Ungroups shapes that belong to a specific group ID.
 */
export function ungroupWriterShapes(
  shapes: readonly WriterShapeBlockData[],
  groupId: string,
): WriterShapeBlockData[] {
  return shapes.map((shape) => {
    if (shape.groupId === groupId) {
      const { groupId: _, ...rest } = shape;
      return rest;
    }
    return shape;
  });
}

/**
 * Brings target shape to the front (highest z-index).
 */
export function bringShapeToFront(
  shapes: readonly WriterShapeBlockData[],
  targetId: string,
): WriterShapeBlockData[] {
  const maxZ = shapes.reduce((max, s) => Math.max(max, s.zIndex ?? 1), 1);
  return shapes.map((s) => (s.id === targetId ? { ...s, zIndex: maxZ + 1 } : s));
}

/**
 * Sends target shape to the back (lowest z-index).
 */
export function sendShapeToBack(
  shapes: readonly WriterShapeBlockData[],
  targetId: string,
): WriterShapeBlockData[] {
  const minZ = shapes.reduce((min, s) => Math.min(min, s.zIndex ?? 1), 1);
  const newZ = Math.max(0, minZ - 1);
  return shapes.map((s) => (s.id === targetId ? { ...s, zIndex: newZ } : s));
}

/**
 * Increments target shape's z-index by 1.
 */
export function bringShapeForward(
  shapes: readonly WriterShapeBlockData[],
  targetId: string,
): WriterShapeBlockData[] {
  return shapes.map((s) => (s.id === targetId ? { ...s, zIndex: (s.zIndex ?? 1) + 1 } : s));
}

/**
 * Decrements target shape's z-index by 1 (minimum 0).
 */
export function sendShapeBackward(
  shapes: readonly WriterShapeBlockData[],
  targetId: string,
): WriterShapeBlockData[] {
  return shapes.map((s) => {
    if (s.id === targetId) {
      return { ...s, zIndex: Math.max(0, (s.zIndex ?? 1) - 1) };
    }
    return s;
  });
}

export interface ShapeSvgPathResult {
  path: string;
  isClosed: boolean;
  extraElements?: 'ellipse' | 'callout-tail';
  tailPath?: string;
}

/**
 * Generates SVG path data for a given shape in local coordinate space (widthPx, heightPx).
 */
export function generateShapeSvgPath(
  shape: WriterShapeBlockData,
  widthPx: number,
  heightPx: number,
): ShapeSvgPathResult {
  // DEF-RE-009: `Math.max(1, NaN)` is NaN - the guard did not guard. A NaN in an SVG path makes the whole
  // element unrenderable, and clampWriterShapeGeometry guards the very same input class with `finiteOr`.
  const w = Number.isFinite(widthPx) ? Math.max(1, widthPx) : 1;
  const h = Number.isFinite(heightPx) ? Math.max(1, heightPx) : 1;

  switch (shape.shapeKind) {
    case 'rectangle':
    case 'textbox': {
      return {
        path: `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
        isClosed: true,
      };
    }
    case 'rounded-rectangle': {
      const r = Math.min(16, w / 4, h / 4);
      return {
        path: `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`,
        isClosed: true,
      };
    }
    case 'ellipse': {
      const rx = w / 2;
      const ry = h / 2;
      return {
        path: `M ${rx} 0 A ${rx} ${ry} 0 1 0 ${rx} ${h} A ${rx} ${ry} 0 1 0 ${rx} 0 Z`,
        isClosed: true,
        extraElements: 'ellipse',
      };
    }
    case 'line':
    case 'arrow': {
      return {
        path: `M 0 ${h / 2} L ${w} ${h / 2}`,
        isClosed: false,
      };
    }
    case 'callout': {
      const r = 8;
      // Bubble body
      const bubble = `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
      // Tail pointer relative to bubble
      const tailX = shape.calloutTailXMm !== undefined ? (shape.calloutTailXMm - shape.xMm) * 3.78 : w / 4;
      const tailY = shape.calloutTailYMm !== undefined ? (shape.calloutTailYMm - shape.yMm) * 3.78 : h + 24;
      const tailPath = `M ${w * 0.25} ${h} L ${tailX} ${tailY} L ${w * 0.45} ${h} Z`;

      return {
        path: bubble,
        isClosed: true,
        extraElements: 'callout-tail',
        tailPath,
      };
    }
    default:
      return {
        path: `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
        isClosed: true,
      };
  }
}
