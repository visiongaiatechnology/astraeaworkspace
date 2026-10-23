// STATUS: DIAMANT VGT SUPREME — canonical finite layout primitives for every workspace surface
import { convertRenderUnit, type RenderUnit } from './renderGeometry';

export const MAX_LAYOUT_NODES = 250_000;
export const MAX_LAYOUT_DEPTH = 128;
export const MAX_TABLE_ROWS = 100_000;
export const MAX_TABLE_COLUMNS = 16_384;

export type LayoutNodeKind = 'page' | 'box' | 'flow' | 'column' | 'text' | 'image' | 'table' | 'scene' | 'shape';
export type LayoutPositionMode = 'flow' | 'anchored' | 'floating' | 'absolute';

export interface LayoutRect { x: number; y: number; width: number; height: number; }
export interface LayoutTransform { a: number; b: number; c: number; d: number; e: number; f: number; }
export interface LayoutAnchor { targetId: string; edge?: 'start' | 'center' | 'end'; offsetX?: number; offsetY?: number; }
export interface LayoutTableGeometry { rows: number; columns: number; rowHeights: number[]; columnWidths: number[]; }

export interface LayoutNode {
  id: string;
  kind: LayoutNodeKind;
  rect: LayoutRect;
  position: LayoutPositionMode;
  zIndex?: number;
  anchor?: LayoutAnchor;
  transform?: LayoutTransform;
  table?: LayoutTableGeometry;
  children?: LayoutNode[];
}

export interface OutputUnitContext {
  unit: RenderUnit;
  dpi: number;
  pixelRatio: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`render_layout_non_finite_${label}`);
  return value;
}

function nonNegative(value: number, label: string): number {
  const n = finite(value, label);
  if (n < 0) throw new Error(`render_layout_negative_${label}`);
  return n;
}

export function validateLayoutRect(rect: LayoutRect): LayoutRect {
  return {
    x: finite(rect.x, 'x'), y: finite(rect.y, 'y'),
    width: nonNegative(rect.width, 'width'), height: nonNegative(rect.height, 'height'),
  };
}

export function validateLayoutTransform(transform: LayoutTransform | undefined): LayoutTransform | undefined {
  if (!transform) return undefined;
  return {
    a: finite(transform.a, 'transform_a'), b: finite(transform.b, 'transform_b'),
    c: finite(transform.c, 'transform_c'), d: finite(transform.d, 'transform_d'),
    e: finite(transform.e, 'transform_e'), f: finite(transform.f, 'transform_f'),
  };
}

export function validateLayoutTree(root: LayoutNode): LayoutNode {
  const ids = new Set<string>();
  let count = 0;
  const visit = (node: LayoutNode, depth: number): LayoutNode => {
    if (++count > MAX_LAYOUT_NODES) throw new Error('render_layout_node_limit');
    if (depth > MAX_LAYOUT_DEPTH) throw new Error('render_layout_depth_limit');
    if (!node.id || node.id.length > 256 || ids.has(node.id)) throw new Error('render_layout_id_invalid');
    ids.add(node.id);
    const table = node.table ? validateTableGeometry(node.table) : undefined;
    const anchor = node.anchor ? {
      targetId: node.anchor.targetId,
      edge: node.anchor.edge,
      offsetX: finite(node.anchor.offsetX ?? 0, 'anchor_offset_x'),
      offsetY: finite(node.anchor.offsetY ?? 0, 'anchor_offset_y'),
    } : undefined;
    if (anchor && (!anchor.targetId || anchor.targetId.length > 256)) throw new Error('render_layout_anchor_invalid');
    return {
      ...node,
      rect: validateLayoutRect(node.rect),
      zIndex: node.zIndex === undefined ? undefined : Math.trunc(finite(node.zIndex, 'z_index')),
      anchor,
      transform: validateLayoutTransform(node.transform),
      table,
      children: node.children?.map((child) => visit(child, depth + 1)),
    };
  };
  return visit(root, 0);
}

export function validateTableGeometry(table: LayoutTableGeometry): LayoutTableGeometry {
  const rows = Math.trunc(nonNegative(table.rows, 'table_rows'));
  const columns = Math.trunc(nonNegative(table.columns, 'table_columns'));
  if (rows > MAX_TABLE_ROWS || columns > MAX_TABLE_COLUMNS) throw new Error('render_layout_table_limit');
  if (table.rowHeights.length !== rows || table.columnWidths.length !== columns) throw new Error('render_layout_table_shape_mismatch');
  return {
    rows, columns,
    rowHeights: table.rowHeights.map((value) => nonNegative(value, 'row_height')),
    columnWidths: table.columnWidths.map((value) => nonNegative(value, 'column_width')),
  };
}

export function resolveOutputUnitContext(unit: RenderUnit, dpi = 96, pixelRatio = 1): OutputUnitContext {
  const safeDpi = finite(dpi, 'dpi');
  const safeRatio = finite(pixelRatio, 'pixel_ratio');
  if (safeDpi < 36 || safeDpi > 2400) throw new Error('render_layout_dpi_limit');
  if (safeRatio <= 0 || safeRatio > 8) throw new Error('render_layout_pixel_ratio_limit');
  return { unit, dpi: safeDpi, pixelRatio: safeRatio };
}

export function convertPhysicalUnit(value: number, from: RenderUnit, context: OutputUnitContext): number {
  const base = convertRenderUnit(finite(value, 'unit_value'), from, context.unit);
  if (context.unit !== 'px') return base;
  // CSS px are defined at 96 dpi; explicit output DPI controls raster/export pixel geometry.
  return base * (context.dpi / 96) * context.pixelRatio;
}

export function applyLayoutTransform(point: { x: number; y: number }, transform?: LayoutTransform): { x: number; y: number } {
  const p = { x: finite(point.x, 'point_x'), y: finite(point.y, 'point_y') };
  const t = validateLayoutTransform(transform);
  if (!t) return p;
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}
