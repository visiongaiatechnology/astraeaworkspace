// STATUS: PLATIN — single geometric description of a Draw object, shared by every renderer.
import type { DrawObject, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import { assertDrawObject, DrawModelError } from '../model/drawDocumentValidation';
import { routeDrawConnector, type DrawRoutedConnector } from '../model/drawRoutingEngine';
import { DEFAULT_DRAW_STYLE } from '../model/drawVectorEngine';
import { drawObjectCenter } from './drawGeometry';

export interface DrawSceneStroke {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly dash: readonly number[];
  readonly opacity: number;
}

export type DrawSceneShape =
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly cornerRadius: number }
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
  | { readonly kind: 'polygon'; readonly points: readonly DrawPoint[] }
  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly kind: 'polyline'; readonly points: readonly DrawPoint[] }
  | { readonly kind: 'path'; readonly d: string };

export interface DrawSceneText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly anchor: 'middle' | 'start';
  readonly fill: string;
  /** `middle` emits `dominant-baseline="middle"`; `auto` leaves the baseline alone. */
  readonly baseline: 'middle' | 'auto';
}

export type DrawSceneNodeCategory = 'shape' | 'frame' | 'connector' | 'none';

export interface DrawSceneNode {
  readonly id: string;
  /** Value written to `data-vgt-type`; for shapes this is the vector kind. */
  readonly nodeType: string;
  readonly category: DrawSceneNodeCategory;
  readonly rotation: number;
  readonly rotationCenter: DrawPoint;
  readonly stroke: DrawSceneStroke;
  /** `null` means the object paints nothing (connectors are drawn as a path, groups as nothing). */
  readonly shape: DrawSceneShape | null;
  readonly text: DrawSceneText | null;
}

const LABEL_FILL = '#f8fafc';
const DEFAULT_LABEL_FONT_SIZE = 14;

function strokeOf(object: DrawObject): DrawSceneStroke {
  const style = object.vector?.style ?? DEFAULT_DRAW_STYLE;
  return {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    dash: style.dash,
    opacity: object.opacity,
  };
}

export function drawObjectLabel(object: DrawObject): string {
  return object.richText?.runs.map((run) => run.text).join('') ?? object.name;
}

export function drawObjectLabelFontSize(object: DrawObject): number {
  const size = object.richText?.runs[0]?.fontSize ?? DEFAULT_LABEL_FONT_SIZE;
  return Number.isFinite(size) && size >= 4 && size <= 512 ? size : DEFAULT_LABEL_FONT_SIZE;
}

export function isDrawObjectPainted(object: DrawObject): boolean {
  return object.type !== 'connector' && object.type !== 'group';
}

/**
 * Maps one object onto the primitive a renderer has to draw. Both the SVG exporter and the
 * interactive DOM surface consume this, so shape geometry exists in exactly one place.
 */
export function describeDrawSceneNode(object: DrawObject): DrawSceneNode {
  assertDrawObject(object);
  const rotationCenter = drawObjectCenter(object);
  const rotation = object.rotation;
  const base = {
    id: object.id,
    rotation,
    rotationCenter,
    stroke: strokeOf(object),
    text: null as DrawSceneText | null,
  };

  if (object.type === 'connector') {
    return { ...base, nodeType: 'connector', category: 'connector', shape: null, text: null };
  }
  if (object.type === 'group') {
    return { ...base, nodeType: 'group', category: 'none', shape: null, text: null };
  }

  const label = drawObjectLabel(object);
  const fontSize = drawObjectLabelFontSize(object);

  if (object.type === 'frame') {
    return {
      ...base,
      nodeType: 'frame',
      category: 'frame',
      stroke: { fill: 'none', stroke: '#64748b', strokeWidth: 1, dash: [8, 6], opacity: object.opacity },
      shape: { kind: 'rect', x: object.x, y: object.y, width: object.width, height: object.height, cornerRadius: 0 },
      text: label ? { text: label, x: object.x + 8, y: object.y + 18, fontSize, anchor: 'start', fill: '#94a3b8', baseline: 'auto' } : null,
    };
  }

  const kind = object.vector?.kind ?? 'rectangle';
  const { x, y, width, height } = object;
  const text: DrawSceneText | null = label
    ? { text: label, x: x + width / 2, y: y + height / 2, fontSize, anchor: 'middle', fill: LABEL_FILL, baseline: 'middle' }
    : null;

  let shape: DrawSceneShape;
  if (kind === 'ellipse') shape = { kind: 'ellipse', cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2 };
  else if (kind === 'polygon' || kind === 'star') {
    shape = kind === 'star'
      ? { kind: 'polygon', points: starPoints(object) }
      : {
        kind: 'polygon',
        points: [
          { x: x + width / 2, y },
          { x: x + width, y: y + height / 2 },
          { x: x + width / 2, y: y + height },
          { x, y: y + height / 2 },
        ],
      };
  } else if (kind === 'line' || kind === 'arrow') {
    shape = { kind: 'line', x1: x, y1: y + height / 2, x2: x + width, y2: y + height / 2 };
  } else if (kind === 'freehand' || kind === 'bezier' || kind === 'custom-path') {
    const points = object.vector?.points ?? [];
    shape = points.length
      ? { kind: 'polyline', points: points.map((point) => ({ x: x + point.x, y: y + point.y })) }
      : { kind: 'rect', x, y, width, height, cornerRadius: object.vector?.style.cornerRadius ?? 0 };
  } else {
    shape = { kind: 'rect', x, y, width, height, cornerRadius: object.vector?.style.cornerRadius ?? 0 };
  }

  return { ...base, nodeType: kind, category: 'shape', shape, text };
}

/** Five-point star inscribed in the object box, used for the `star` stencil kind. */
function starPoints(object: DrawObject): DrawPoint[] {
  const cx = object.x + object.width / 2;
  const cy = object.y + object.height / 2;
  const outerX = object.width / 2;
  const outerY = object.height / 2;
  const points: DrawPoint[] = [];
  for (let index = 0; index < 10; index += 1) {
    const ratio = index % 2 === 0 ? 1 : 0.42;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    points.push({ x: cx + Math.cos(angle) * outerX * ratio, y: cy + Math.sin(angle) * outerY * ratio });
  }
  return points;
}

export interface DrawSceneConnector {
  readonly id: string;
  readonly path: string;
  readonly points: readonly DrawPoint[];
  readonly label: string | null;
  readonly labelX: number;
  readonly labelY: number;
}

/** Connector description resolved through the canonical routing engine. */
export function describeDrawConnectorNode(
  object: DrawObject,
  objects: Readonly<Record<string, DrawObject>>,
  routed?: DrawRoutedConnector,
): DrawSceneConnector {
  assertDrawObject(object);
  if (object.type !== 'connector' || !object.connector) throw new DrawModelError('connector-data-missing');
  const route = routed ?? routeDrawConnector(object.connector, objects);
  const middle = route.points[Math.floor(route.points.length / 2)] ?? route.points[0];
  if (!middle) throw new DrawModelError('connector-route-empty');
  const connector: DrawSceneConnector = {
    id: object.id,
    path: route.path,
    points: route.points,
    label: object.connector.semantic.label ?? null,
    labelX: middle.x,
    labelY: middle.y - 6,
  };
  return connector;
}

export function dashArrayAttribute(dash: readonly number[]): string | null {
  return dash.length > 0 ? dash.join(' ') : null;
}
