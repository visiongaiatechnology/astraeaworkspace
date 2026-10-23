// STATUS: PLATIN — shared bounded VDX format contracts and validation.
import { MAX_VISIO_XML_BYTES } from './xmlParser';
import type { WhiteboardObjectModel, WhiteboardObjectType, WhiteboardShapeKind } from '../../contracts/whiteboard/workspaceWhiteboard';

export const MAX_VISIO_ITEMS = 10_000;
export const MAX_VISIO_BYTES = MAX_VISIO_XML_BYTES;
export const MAX_TEXT_LENGTH = 4096;
export const MAX_NAME_LENGTH = 512;
export const MAX_COORDINATE = 1_000_000_000;
export const PIXELS_PER_MM = 96 / 25.4;
export const MM_PER_PIXEL = 25.4 / 96;
export const META_FORMAT = 'ASTRAEA_VDX_META_V1';
export const SIMPLE_VISIO_TYPES: ReadonlySet<string> = new Set(['sticky', 'process', 'decision', 'terminal', 'connector', 'text', 'frame', 'shape']);
export const VISIO_SHAPE_KINDS: ReadonlySet<string> = new Set(['rectangle', 'rounded-rectangle', 'ellipse', 'diamond', 'triangle']);
const XML_COLORS = /^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|[a-z]{1,32}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+/-]{1,48}\))$/iu;

export interface VisioConversionReport {
  timestamp: number;
  shapesConvertedCount: number;
  connectorsConvertedCount: number;
  supportedFeatures: string[];
  omittedFeatures: string[];
  foreignXmlPreserved: boolean;
  activeContentExecuted: false;
  summary: string;
}

export interface VisioImportResult { items: WhiteboardObjectModel[]; conversion: VisioConversionReport; }
export interface VisioExportResult { vdxXml: string; conversion: VisioConversionReport; }

export interface AstraeaVdxMetadata {
  readonly type: WhiteboardObjectType;
  readonly name?: string;
  readonly shapeKind?: WhiteboardShapeKind;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}


export interface ConnectorTargets { beginX?: string; beginY?: string; endX?: string; endY?: string; }


export class VisioInteropError extends Error {
  constructor(readonly code: string) {
    super(`Visio interchange rejected: ${code}`);
    this.name = 'VisioInteropError';
  }
}

export function fail(code: string): never { throw new VisioInteropError(`visio-${code}`); }

export function bounded(value: unknown, minimum: number, maximum: number, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(code);
  return value;
}

export function safeId(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9._:@-]+$/u.test(value)) fail(code);
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => 'value' in descriptor);
  } catch {
    return false;
  }
}

export function boundedXmlText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string' || value.length > maximum) fail(code);
  for (const character of value) {
    const point = character.codePointAt(0) ?? -1;
    if (!(point === 0x9 || point === 0xa || point === 0xd || (point >= 0x20 && point <= 0xd7ff)
      || (point >= 0xe000 && point <= 0xfffd) || (point >= 0x10000 && point <= 0x10ffff))) fail(code);
  }
  return value;
}

export function safeColor(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length > 64 || !XML_COLORS.test(value)) fail(code);
  return value;
}

export function defaultShapeKind(type: WhiteboardObjectType): WhiteboardShapeKind {
  if (type === 'decision') return 'diamond';
  if (type === 'terminal') return 'ellipse';
  return 'rectangle';
}

export function conversionReport(shapes: number, connectors: number, direction: 'import' | 'export'): VisioConversionReport {
  return {
    timestamp: Date.now(),
    shapesConvertedCount: shapes,
    connectorsConvertedCount: connectors,
    supportedFeatures: [
      'Single-page Visio 2003 DatadiagramML VDX with editable basic geometry, text, rotation, solid fill, and line styling',
      'Bound shape-to-shape connectors with page-level connection records and one-dimensional endpoints',
      'Namespaced XML parsing with DTD, entity, size, depth, element-count, and malformed-structure limits',
    ],
    omittedFeatures: [
      'VSDX ZIP packages, multiple pages, groups, masters, formulas, foreign parts, themes, and rich text are unsupported.',
      'Ink, tables, charts, media, live references, gradients, transparency, and page-specific Draw metadata are omitted.',
      'Astraea shape details are carried only in the standard VDX Data1 field and may be removed by other editors.',
    ],
    foreignXmlPreserved: false,
    activeContentExecuted: false,
    summary: `${direction === 'export' ? 'Exported' : 'Imported'} ${shapes} shape(s) and ${connectors} connector(s) in the bounded single-page Visio 2003 VDX subset. The input is parsed as inert XML; VSDX packages and unsupported content are omitted.`,
  };
}
