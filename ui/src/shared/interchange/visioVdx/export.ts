// STATUS: PLATIN — bounded Visio 2003 VDX export with explicit feature limits.
import { escapeXml } from '../../interoperability/xml';
import { VDX_NAMESPACE_URI } from './xmlParser';
import type { WhiteboardObjectModel, WhiteboardObjectType, WhiteboardShapeKind } from '../../contracts/whiteboard/workspaceWhiteboard';
import {
  MAX_COORDINATE, MAX_NAME_LENGTH, MAX_TEXT_LENGTH, MAX_VISIO_BYTES, MAX_VISIO_ITEMS, META_FORMAT, MM_PER_PIXEL,
  SIMPLE_VISIO_TYPES, VISIO_SHAPE_KINDS, bounded, boundedXmlText, conversionReport, defaultShapeKind, fail,
  isRecord, safeColor, safeId,
  type VisioExportResult,
} from './contracts';

const VDX_NAMED_COLORS: Readonly<Record<string, string>> = {
  aqua: '#00ffff', black: '#000000', blue: '#0000ff', cyan: '#00ffff', fuchsia: '#ff00ff', gray: '#808080',
  green: '#008000', lime: '#00ff00', maroon: '#800000', navy: '#000080', olive: '#808000', orange: '#ffa500',
  purple: '#800080', red: '#ff0000', silver: '#c0c0c0', teal: '#008080', white: '#ffffff', yellow: '#ffff00',
}

interface NormalizedItem {
  readonly item: WhiteboardObjectModel;
  readonly id: string;
  readonly type: WhiteboardObjectType;
  readonly shapeKind: WhiteboardShapeKind;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

function normalizeItems(items: readonly WhiteboardObjectModel[]): NormalizedItem[] {
  if (!Array.isArray(items) || items.length > MAX_VISIO_ITEMS) fail('item-limit');
  const ids = new Set<string>();
  const normalized: NormalizedItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(items, String(index));
    if (!descriptor || !('value' in descriptor) || !isRecord(descriptor.value)) fail('item-invalid');
    const item = descriptor.value as unknown as WhiteboardObjectModel;
    const id = safeId(item.id, 'item-id-invalid');
    if (ids.has(id)) fail('item-id-duplicate');
    ids.add(id);
    if (typeof item.type !== 'string' || !SIMPLE_VISIO_TYPES.has(item.type)) fail('item-kind-unsupported');
    bounded(item.x, -MAX_COORDINATE, MAX_COORDINATE, 'item-geometry-invalid');
    bounded(item.y, -MAX_COORDINATE, MAX_COORDINATE, 'item-geometry-invalid');
    bounded(item.width, 0, MAX_COORDINATE, 'item-geometry-invalid');
    bounded(item.height, 0, MAX_COORDINATE, 'item-geometry-invalid');
    if (!Number.isFinite(item.x + item.width) || !Number.isFinite(item.y + item.height)) fail('item-geometry-invalid');
    boundedXmlText(item.text, MAX_TEXT_LENGTH, 'item-text-invalid');
    if (item.name !== undefined) boundedXmlText(item.name, MAX_NAME_LENGTH, 'item-name-invalid');
    if (item.rotation !== undefined) bounded(item.rotation, -36_000, 36_000, 'item-rotation-invalid');
    const fill = safeColor(item.shape?.fill ?? item.color ?? '#3b82f6', 'item-fill-invalid');
    const stroke = safeColor(item.shape?.stroke ?? '#334155', 'item-stroke-invalid');
    const strokeWidth = bounded(item.shape?.strokeWidth ?? 1, 0, 1024, 'item-stroke-width-invalid');
    if (item.shape?.kind !== undefined && !VISIO_SHAPE_KINDS.has(item.shape.kind)) fail('item-shape-kind-invalid');
    normalized.push({ item, id, type: item.type, shapeKind: item.shape?.kind ?? defaultShapeKind(item.type), fill, stroke, strokeWidth });
  }

  const byId = new Map(normalized.map((entry) => [entry.id, entry]));
  for (const entry of normalized) if (entry.type === 'connector') {
    const from = byId.get(safeId(entry.item.fromId, 'connector-from-invalid'));
    const to = byId.get(safeId(entry.item.toId, 'connector-to-invalid'));
    if (!from || !to || from.type === 'connector' || to.type === 'connector') fail('connector-reference-invalid');
  }
  return normalized;
}

function millimeters(pixels: number): string {
  const value = pixels * MM_PER_PIXEL;
  if (!Number.isFinite(value)) fail('coordinate-overflow');
  return value.toFixed(6);
}

function vdxColor(value: string): string {
  const lower = value.toLowerCase();
  const named = VDX_NAMED_COLORS[lower];
  if (named) return named;
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(value);
  if (hex?.[1]) {
    if (hex[1].length === 3) return `#${[...hex[1]].map((part) => `${part}${part}`).join('')}`.toLowerCase();
    return value.toLowerCase();
  }
  const rgb = /^rgba?\(\s*([^)]*)\s*\)$/iu.exec(value);
  if (rgb?.[1]) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    if (parts.length < 3 || parts.length > 4) fail('color-unsupported');
    if (parts.length === 4 && Number(parts[3]) !== 1) fail('color-alpha-unsupported');
    const channels = parts.slice(0, 3).map((part) => {
      const percent = part.endsWith('%');
      const number = Number(percent ? part.slice(0, -1) : part);
      const scaled = percent ? (number * 255) / 100 : number;
      if (!Number.isFinite(scaled) || scaled < 0 || scaled > 255) fail('color-unsupported');
      return Math.round(scaled).toString(16).padStart(2, '0');
    });
    return `#${channels.join('')}`;
  }
  fail('color-unsupported');
}

function shapePoints(kind: WhiteboardShapeKind, width: number, height: number): readonly { x: number; y: number }[] {
  if (kind === 'diamond') return [{ x: width / 2, y: 0 }, { x: width, y: height / 2 }, { x: width / 2, y: height }, { x: 0, y: height / 2 }];
  if (kind === 'triangle') return [{ x: width / 2, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  if (kind === 'rounded-rectangle') {
    const radius = Math.min(width, height) * 0.16;
    return [
      { x: radius, y: 0 }, { x: width - radius, y: 0 }, { x: width - radius / 2, y: radius / 2 },
      { x: width, y: radius }, { x: width, y: height - radius }, { x: width - radius / 2, y: height - radius / 2 },
      { x: width - radius, y: height }, { x: radius, y: height }, { x: radius / 2, y: height - radius / 2 },
      { x: 0, y: height - radius }, { x: 0, y: radius }, { x: radius / 2, y: radius / 2 },
    ];
  }
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

function geometryXml(kind: WhiteboardShapeKind, width: number, height: number, noFill: boolean): string {
  const flags = `<NoFill>${noFill ? 1 : 0}</NoFill><NoLine>0</NoLine><NoShow>0</NoShow><NoSnap>0</NoSnap>`;
  if (kind === 'ellipse') {
    return `<Geom IX="0">${flags}<Ellipse IX="1"><X Unit="MM">${millimeters(width / 2)}</X><Y Unit="MM">${millimeters(height / 2)}</Y><A Unit="MM">${millimeters(width / 2)}</A><B Unit="MM">0</B><C Unit="MM">0</C><D Unit="MM">${millimeters(height / 2)}</D></Ellipse></Geom>`;
  }
  const points = shapePoints(kind, width, height);
  const first = points[0];
  if (!first) fail('geometry-missing');
  const rows = [`<MoveTo IX="1"><X Unit="MM">${millimeters(first.x)}</X><Y Unit="MM">${millimeters(first.y)}</Y></MoveTo>`];
  for (let index = 1; index <= points.length; index += 1) {
    const point = points[index % points.length];
    if (!point) fail('geometry-missing');
    rows.push(`<LineTo IX="${index + 1}"><X Unit="MM">${millimeters(point.x)}</X><Y Unit="MM">${millimeters(point.y)}</Y></LineTo>`);
  }
  return `<Geom IX="0">${flags}${rows.join('')}</Geom>`;
}

function metadataXml(entry: NormalizedItem): string {
  const item = entry.item;
  const metadata = {
    format: META_FORMAT,
    type: entry.type,
    name: item.name,
    shapeKind: entry.shapeKind,
    fill: entry.fill,
    stroke: entry.stroke,
    strokeWidth: entry.strokeWidth,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation ?? 0,
  };
  return `<Data1>${escapeXml(JSON.stringify(metadata))}</Data1>`;
}

export function exportDrawToVisioXml(documentTitle: string, items: readonly WhiteboardObjectModel[]): VisioExportResult {
  const title = boundedXmlText(documentTitle, MAX_NAME_LENGTH, 'title-invalid');
  const normalized = normalizeItems(items);
  const byId = new Map(normalized.map((entry) => [entry.id, entry]));
  const vdxIdByItemId = new Map(normalized.map((entry, index) => [entry.id, String(index + 1)]));
  let minX = 0;
  let minY = 0;
  let maxX = 816;
  let maxY = 1056;
  for (const { item } of normalized) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  const offsetX = minX < 0 ? 24 - minX : 0;
  const offsetY = minY < 0 ? 24 - minY : 0;
  const pageWidth = Math.max(816, maxX + offsetX + 24);
  const pageHeight = Math.max(1056, maxY + offsetY + 24);
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<VisioDocument xmlns="${VDX_NAMESPACE_URI}" version="11.0" metric="1" DocLangID="1033" xml:space="preserve">`,
    `<DocumentProperties><Title>${escapeXml(title)}</Title><Creator>Astraea Workspace</Creator></DocumentProperties>`,
    `<Pages><Page ID="0" Name="Page-1"><PageSheet><PageProps><PageWidth Unit="MM">${millimeters(pageWidth)}</PageWidth><PageHeight Unit="MM">${millimeters(pageHeight)}</PageHeight></PageProps></PageSheet><Shapes>`,
  ];

  for (let index = 0; index < normalized.length; index += 1) {
    const entry = normalized[index];
    if (!entry) fail('item-invalid');
    const item = entry.item;
    const id = String(index + 1);
    const name = escapeXml(item.name ?? entry.id);
    const vdxFill = vdxColor(entry.fill);
    const vdxStroke = vdxColor(entry.stroke);
    const strokePt = (entry.strokeWidth * 0.75).toFixed(5);
    const text = escapeXml(item.text);
    const line = `<Line><LineColor>${vdxStroke}</LineColor><LineWeight Unit="PT">${strokePt}</LineWeight></Line>`;
    const geometry = entry.type === 'connector'
      ? connectorGeometry(entry, byId, offsetX, offsetY)
      : geometryXml(entry.shapeKind, item.width, item.height, entry.type === 'text' || entry.type === 'frame');
    const fill = entry.type === 'connector' ? '<Fill><FillPattern>0</FillPattern></Fill>'
      : `<Fill><FillForegnd>${vdxFill}</FillForegnd><FillBkgnd>${vdxFill}</FillBkgnd><FillPattern>1</FillPattern></Fill>`;
    const transformed = entry.type === 'connector' ? '' : `<XForm><PinX Unit="MM">${millimeters(item.x + item.width / 2 + offsetX)}</PinX><PinY Unit="MM">${millimeters(item.y + item.height / 2 + offsetY)}</PinY><Width Unit="MM">${millimeters(item.width)}</Width><Height Unit="MM">${millimeters(item.height)}</Height><LocPinX Unit="MM">${millimeters(item.width / 2)}</LocPinX><LocPinY Unit="MM">${millimeters(item.height / 2)}</LocPinY><Angle Unit="RAD">${(((item.rotation ?? 0) * Math.PI) / 180).toFixed(8)}</Angle></XForm>`;
    parts.push(`<Shape ID="${id}" Name="${name}" NameU="${name}" Type="Shape">${transformed}${line}${fill}${geometry}<Text>${text}</Text>${metadataXml(entry)}</Shape>`);
  }

  parts.push('</Shapes>');
  const connects: string[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const entry = normalized[index];
    if (!entry || entry.type !== 'connector') continue;
    const fromId = vdxIdByItemId.get(safeId(entry.item.fromId, 'connector-from-invalid'));
    const toId = vdxIdByItemId.get(safeId(entry.item.toId, 'connector-to-invalid'));
    if (!fromId || !toId) fail('connector-reference-invalid');
    const connectorId = String(index + 1);
    connects.push(`<Connect FromSheet="${connectorId}" FromCell="BeginX" ToSheet="${fromId}" ToCell="PinX"/><Connect FromSheet="${connectorId}" FromCell="BeginY" ToSheet="${fromId}" ToCell="PinY"/><Connect FromSheet="${connectorId}" FromCell="EndX" ToSheet="${toId}" ToCell="PinX"/><Connect FromSheet="${connectorId}" FromCell="EndY" ToSheet="${toId}" ToCell="PinY"/>`);
  }
  if (connects.length > 0) parts.push(`<Connects>${connects.join('')}</Connects>`);
  parts.push('</Page></Pages></VisioDocument>');
  let byteLength = 0;
  for (const part of parts) {
    byteLength += new TextEncoder().encode(part).byteLength;
    if (byteLength > MAX_VISIO_BYTES) fail('export-too-large');
  }
  const vdxXml = parts.join('');
  const shapes = normalized.filter((entry) => entry.type !== 'connector').length;
  return { vdxXml, conversion: conversionReport(shapes, normalized.length - shapes, 'export') };
}

function connectorGeometry(entry: NormalizedItem, byId: ReadonlyMap<string, NormalizedItem>, offsetX: number, offsetY: number): string {
  const from = byId.get(safeId(entry.item.fromId, 'connector-from-invalid'));
  const to = byId.get(safeId(entry.item.toId, 'connector-to-invalid'));
  if (!from || !to) fail('connector-reference-invalid');
  const beginX = from.item.x + from.item.width / 2 + offsetX;
  const beginY = from.item.y + from.item.height / 2 + offsetY;
  const endX = to.item.x + to.item.width / 2 + offsetX;
  const endY = to.item.y + to.item.height / 2 + offsetY;
  const localEndX = endX - beginX;
  const localEndY = endY - beginY;
  return `<XForm1D><BeginX Unit="MM">${millimeters(beginX)}</BeginX><BeginY Unit="MM">${millimeters(beginY)}</BeginY><EndX Unit="MM">${millimeters(endX)}</EndX><EndY Unit="MM">${millimeters(endY)}</EndY></XForm1D><Geom IX="0"><NoFill>1</NoFill><NoLine>0</NoLine><NoShow>0</NoShow><NoSnap>0</NoSnap><MoveTo IX="1"><X Unit="MM">0</X><Y Unit="MM">0</Y></MoveTo><LineTo IX="2"><X Unit="MM">${millimeters(localEndX)}</X><Y Unit="MM">${millimeters(localEndY)}</Y></LineTo></Geom>`;
}

