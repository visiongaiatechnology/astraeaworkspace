// STATUS: PLATIN — bounded inert Visio 2003 VDX import with fail-closed shape handling.
import { secureRandomId } from '../../crypto/secureRandom';
import type { VisioXmlElement } from './xmlParser';
import {
  MAX_VISIO_ITEMS, MAX_TEXT_LENGTH, MAX_NAME_LENGTH, MAX_COORDINATE, PIXELS_PER_MM,
  META_FORMAT, SIMPLE_VISIO_TYPES, VISIO_SHAPE_KINDS, boundedXmlText, conversionReport,
  bounded, defaultShapeKind, fail, isRecord, safeColor, safeId,
  VisioInteropError, type AstraeaVdxMetadata, type ConnectorTargets, type VisioImportResult,
} from './contracts';
import { parseVisioXml, VDX_NAMESPACE_URI } from './xmlParser';
import type { WhiteboardObjectModel, WhiteboardObjectType, WhiteboardShapeKind } from '../../contracts/whiteboard/workspaceWhiteboard';

interface ImportedShape {
  readonly shape: VisioXmlElement;
  readonly sourceId: string;
  readonly id: string;
  readonly metadata: AstraeaVdxMetadata | undefined;
  readonly xForm1D: VisioXmlElement | undefined;
  readonly isConnector: boolean;
}

function child(element: VisioXmlElement, localName: string): VisioXmlElement | undefined {
  const matches = element.content.filter((value): value is VisioXmlElement => typeof value !== 'string' && value.localName === localName);
  if (matches.length > 1) fail('element-ambiguous');
  const found = matches[0];
  if (found && found.namespaceUri !== VDX_NAMESPACE_URI) fail('element-namespace-unsupported');
  return found;
}

function descendants(element: VisioXmlElement, localName: string): VisioXmlElement[] {
  const found: VisioXmlElement[] = [];
  const pending: VisioXmlElement[] = [...element.content].filter((value): value is VisioXmlElement => typeof value !== 'string').reverse();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (current.localName === localName) found.push(current);
    for (let index = current.content.length - 1; index >= 0; index -= 1) {
      const value = current.content[index];
      if (typeof value !== 'string') pending.push(value);
    }
  }
  return found;
}

function textContent(element: VisioXmlElement): string {
  const parts: string[] = [];
  const pending: Array<string | VisioXmlElement> = [...element.content].reverse();
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === 'string') parts.push(current);
    else if (current) for (let index = current.content.length - 1; index >= 0; index -= 1) pending.push(current.content[index]);
  }
  return parts.join('');
}

function attribute(element: VisioXmlElement, name: string): string | undefined {
  const aliases = [...element.attributes].filter(([key]) => key.toLowerCase() === name.toLowerCase());
  if (aliases.length > 1) fail('attribute-ambiguous');
  const found = aliases[0];
  if (found && found[0] !== name) fail('attribute-name-invalid');
  return found?.[1];
}

function childText(element: VisioXmlElement, localName: string): string | undefined {
  const found = child(element, localName);
  return found ? textContent(found).trim() : undefined;
}

function readNumber(element: VisioXmlElement, localName: string, fallback: number, defaultUnit = 'MM'): number {
  const childElement = child(element, localName);
  if (!childElement) return fallback;
  const value = textContent(childElement).trim();
  if (value.length > 64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) fail('number-invalid');
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail('number-invalid');
  const unit = (attribute(childElement, 'Unit') ?? defaultUnit).toUpperCase();
  const scale = unit === 'MM' ? 1 : unit === 'CM' ? 10 : unit === 'IN' ? 25.4 : unit === 'PT' ? 25.4 / 72 : Number.NaN;
  if (!Number.isFinite(scale)) fail('unit-unsupported');
  const pixels = parsed * scale * PIXELS_PER_MM;
  if (!Number.isFinite(pixels)) fail('coordinate-invalid');
  return bounded(pixels, -MAX_COORDINATE, MAX_COORDINATE, 'coordinate-invalid');
}

function readAngleDegrees(element: VisioXmlElement): number {
  const angle = child(element, 'Angle');
  if (!angle) return 0;
  const value = textContent(angle).trim();
  if (value.length > 64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) fail('rotation-invalid');
  const parsed = Number(value);
  const unit = (attribute(angle, 'Unit') ?? 'RAD').toUpperCase();
  const degrees = unit === 'RAD' ? (parsed * 180) / Math.PI : unit === 'DEG' ? parsed : Number.NaN;
  if (!Number.isFinite(degrees)) fail('rotation-invalid');
  return bounded(degrees, -36_000, 36_000, 'rotation-invalid');
}

function parseVdxId(value: string | undefined, code: string): string {
  if (value === undefined || value.length > 20 || !/^\d+$/u.test(value)) fail(code);
  const canonical = value.replace(/^0+(?=\d)/u, '');
  if (canonical.length > 20 || (canonical.length === 20 && canonical > '18446744073709551615')) fail(code);
  return canonical;
}

function metadataNumber(value: unknown, minimum: number, maximum: number, code: string): number {
  if (typeof value !== 'number') fail(code);
  return bounded(value, minimum, maximum, code);
}

function uniqueImportedId(existing: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = safeId(secureRandomId('visio'), 'generated-id-invalid');
    if (!existing.has(id)) { existing.add(id); return id; }
  }
  fail('id-generation-failed');
}

function metadataForShape(shape: VisioXmlElement): AstraeaVdxMetadata | undefined {
  const raw = childText(shape, 'Data1');
  if (raw === undefined || raw.length > 4096) return undefined;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!isRecord(value) || value.format !== META_FORMAT) return undefined;
  if (typeof value.type !== 'string' || !SIMPLE_VISIO_TYPES.has(value.type)) fail('metadata-type-invalid');
  const type = value.type as WhiteboardObjectType;
  const fill = safeColor(value.fill, 'metadata-color-invalid');
  const stroke = safeColor(value.stroke, 'metadata-color-invalid');
  const strokeWidth = metadataNumber(value.strokeWidth, 0, 1024, 'metadata-stroke-width-invalid');
  const x = metadataNumber(value.x, -MAX_COORDINATE, MAX_COORDINATE, 'metadata-geometry-invalid');
  const y = metadataNumber(value.y, -MAX_COORDINATE, MAX_COORDINATE, 'metadata-geometry-invalid');
  const width = metadataNumber(value.width, 0, MAX_COORDINATE, 'metadata-geometry-invalid');
  const height = metadataNumber(value.height, 0, MAX_COORDINATE, 'metadata-geometry-invalid');
  const rotation = metadataNumber(value.rotation, -36_000, 36_000, 'metadata-rotation-invalid');
  const name = value.name === undefined ? undefined : boundedXmlText(value.name, MAX_NAME_LENGTH, 'metadata-name-invalid');
  const shapeKind = value.shapeKind === undefined ? undefined : value.shapeKind;
  if (shapeKind !== undefined && (typeof shapeKind !== 'string' || !VISIO_SHAPE_KINDS.has(shapeKind))) fail('metadata-shape-kind-invalid');
  return { type, fill, stroke, strokeWidth, x, y, width, height, rotation,
    ...(name === undefined ? {} : { name }), ...(shapeKind === undefined ? {} : { shapeKind: shapeKind as WhiteboardShapeKind }) };
}

function mapVisioType(name: string | undefined): WhiteboardObjectType | undefined {
  switch (name?.trim().toLowerCase().replace(/[\s-]+/gu, '_')) {
    case 'flowchart_decision': case 'decision': case 'diamond': return 'decision';
    case 'flowchart_process': case 'process': case 'rectangle': case 'rect': return 'process';
    case 'flowchart_terminator': case 'terminator': case 'ellipse': case 'oval': return 'terminal';
    case 'text': return 'text';
    default: return undefined;
  }
}

function mapShapeKind(name: string | undefined, type: WhiteboardObjectType): WhiteboardShapeKind {
  switch (name?.trim().toLowerCase().replace(/[\s-]+/gu, '_')) {
    case 'diamond': case 'flowchart_decision': return 'diamond';
    case 'triangle': return 'triangle';
    case 'rounded_rectangle': case 'roundrect': case 'roundedrect': return 'rounded-rectangle';
    case 'ellipse': case 'oval': case 'flowchart_terminator': return 'ellipse';
    default: return defaultShapeKind(type);
  }
}

function directPageShapes(page: VisioXmlElement): VisioXmlElement[] {
  const shapesRoot = child(page, 'Shapes');
  if (!shapesRoot) return [];
  const children = shapesRoot.content.filter((value): value is VisioXmlElement => typeof value !== 'string');
  if (children.some((value) => value.namespaceUri !== VDX_NAMESPACE_URI || value.localName !== 'Shape')) fail('shape-element-unsupported');
  if (children.some((shape) => descendants(shape, 'Shape').length > 0)) fail('group-shape-unsupported');
  return children;
}

function pageConnectorTargets(page: VisioXmlElement): Map<string, ConnectorTargets> {
  const connects = child(page, 'Connects');
  if (!connects) return new Map();
  const entries = connects.content.filter((value): value is VisioXmlElement => typeof value !== 'string');
  if (entries.some((entry) => entry.localName !== 'Connect' || entry.namespaceUri !== VDX_NAMESPACE_URI)) fail('connect-element-unsupported');
  const targets = new Map<string, ConnectorTargets>();
  for (const connect of entries) {
    const source = parseVdxId(attribute(connect, 'FromSheet'), 'connector-source-invalid');
    const fromCell = attribute(connect, 'FromCell');
    const target = parseVdxId(attribute(connect, 'ToSheet'), 'connector-target-invalid');
    if (!fromCell || !['BeginX', 'BeginY', 'EndX', 'EndY'].includes(fromCell)) fail('connector-cell-unsupported');
    const key = fromCell === 'BeginX' || fromCell === 'BeginY' ? 'begin' : 'end';
    const axis = fromCell.endsWith('X') ? 'X' : 'Y';
    const current = targets.get(source) ?? {};
    const axisName = `${key}${axis}` as keyof ConnectorTargets;
    if (current[axisName] !== undefined) fail('connector-reference-duplicate');
    const updated: ConnectorTargets = { ...current, [axisName]: target };
    targets.set(source, updated);
  }
  return targets;
}

export function importVisioXmlToDraw(xmlContent: string): VisioImportResult {
  let root: VisioXmlElement;
  try { root = parseVisioXml(xmlContent); } catch (error) {
    if (error instanceof VisioInteropError) throw error;
    fail(error instanceof Error ? `xml-${error.name}` : 'xml-invalid');
  }
  const pages = root.content.filter((value): value is VisioXmlElement => typeof value !== 'string' && value.localName === 'Pages');
  if (pages.length !== 1 || pages[0]?.namespaceUri !== VDX_NAMESPACE_URI) fail('page-count-unsupported');
  const pageNode = pages[0];
  if (!pageNode) fail('page-missing');
  const pageEntries = pageNode.content.filter((value): value is VisioXmlElement => typeof value !== 'string');
  if (pageEntries.some((value) => value.namespaceUri !== VDX_NAMESPACE_URI || value.localName !== 'Page')) fail('page-content-unsupported');
  if (pageEntries.length !== 1) fail('page-count-unsupported');
  const page = pageEntries[0];
  if (!page) fail('page-missing');
  parseVdxId(attribute(page, 'ID'), 'page-id-invalid');
  const sourceShapes = directPageShapes(page);
  if (sourceShapes.length > MAX_VISIO_ITEMS) fail('item-limit');
  const edgeTargets = pageConnectorTargets(page);
  const importedIds = new Set<string>();
  const externalIds = new Set<string>();
  const sourceIdToRecord = new Map<string, ImportedShape>();
  const records = sourceShapes.map((shape): ImportedShape => {
    const aliasIds = [...shape.attributes.keys()].filter((key) => ['id'].includes(key.toLowerCase()));
    if (aliasIds.length > 1) fail('attribute-ambiguous');
    const sourceId = parseVdxId(attribute(shape, 'ID'), 'source-id-invalid');
    if (externalIds.has(sourceId)) fail('source-id-duplicate');
    externalIds.add(sourceId);
    const shapeType = attribute(shape, 'Type');
    if (shapeType !== undefined && shapeType.toLowerCase() !== 'shape') fail('shape-type-unsupported');
    const metadata = metadataForShape(shape);
    const xForm1D = child(shape, 'XForm1D');
    const isConnector = xForm1D !== undefined || metadata?.type === 'connector' || edgeTargets.has(sourceId);
    if (isConnector && !xForm1D) fail('connector-transform-missing');
    const record = { shape, sourceId, id: uniqueImportedId(importedIds), metadata, xForm1D, isConnector };
    sourceIdToRecord.set(sourceId, record);
    return record;
  });

  const items: WhiteboardObjectModel[] = [];
  let shapesCount = 0;
  let connectorsCount = 0;
  for (const record of records) {
    const textNode = child(record.shape, 'Text');
    const text = textNode ? boundedXmlText(textContent(textNode), MAX_TEXT_LENGTH, 'text-invalid') : '';
    const sourceName = attribute(record.shape, 'NameU') ?? attribute(record.shape, 'Name');
    const name = record.metadata?.name ?? (sourceName === undefined ? undefined : boundedXmlText(sourceName, MAX_NAME_LENGTH, 'name-invalid'));
    const line = child(record.shape, 'Line');
    const fillNode = child(record.shape, 'Fill');
    const rawFill = childText(fillNode ?? record.shape, 'FillForegnd') ?? '#3b82f6';
    const rawStroke = childText(line ?? record.shape, 'LineColor') ?? '#334155';
    const fill = record.metadata?.fill ?? safeColor(rawFill, 'color-invalid');
    const stroke = record.metadata?.stroke ?? safeColor(rawStroke, 'stroke-invalid');
    const strokeWidth = record.metadata?.strokeWidth ?? (line ? bounded(readNumber(line, 'LineWeight', 1, 'PT'), 0, 1024, 'stroke-width-invalid') : 1);

    if (record.isConnector) {
      const xForm1D = record.xForm1D;
      if (!xForm1D) fail('connector-transform-missing');
      const targets = edgeTargets.get(record.sourceId);
      const beginTargetId = targets?.beginX ?? targets?.beginY;
      const endTargetId = targets?.endX ?? targets?.endY;
      if (!targets || !beginTargetId || !endTargetId
        || (targets.beginX && targets.beginY && targets.beginX !== targets.beginY)
        || (targets.endX && targets.endY && targets.endX !== targets.endY)) fail('connector-reference-invalid');
      const beginTarget = sourceIdToRecord.get(beginTargetId);
      const endTarget = sourceIdToRecord.get(endTargetId);
      if (!beginTarget || !endTarget || beginTarget.isConnector || endTarget.isConnector) fail('connector-reference-invalid');
      const beginX = readNumber(xForm1D, 'BeginX', 0);
      const beginY = readNumber(xForm1D, 'BeginY', 0);
      const endX = readNumber(xForm1D, 'EndX', 0);
      const endY = readNumber(xForm1D, 'EndY', 0);
      items.push({ id: record.id, type: 'connector', x: record.metadata?.x ?? Math.min(beginX, endX), y: record.metadata?.y ?? Math.min(beginY, endY),
        width: record.metadata?.width ?? Math.abs(endX - beginX), height: record.metadata?.height ?? Math.abs(endY - beginY),
        rotation: record.metadata?.rotation ?? 0, text, fromId: beginTarget.id, toId: endTarget.id, lineLabel: text,
        ...(name === undefined ? {} : { name }) });
      connectorsCount += 1;
      continue;
    }

    const type = record.metadata?.type ?? mapVisioType(sourceName);
    if (!type || type === 'connector' || !SIMPLE_VISIO_TYPES.has(type)) fail('item-kind-unsupported');
    const xForm = child(record.shape, 'XForm');
    if (!xForm) fail('shape-transform-missing');
    if (!child(xForm, 'PinX') || !child(xForm, 'PinY') || !child(xForm, 'Width') || !child(xForm, 'Height')) fail('shape-transform-incomplete');
    const width = bounded(readNumber(xForm, 'Width', 0), 0, MAX_COORDINATE, 'geometry-invalid');
    const height = bounded(readNumber(xForm, 'Height', 0), 0, MAX_COORDINATE, 'geometry-invalid');
    const pinX = readNumber(xForm, 'PinX', 0);
    const pinY = readNumber(xForm, 'PinY', 0);
    const x = record.metadata?.x ?? bounded(pinX - width / 2, -MAX_COORDINATE, MAX_COORDINATE, 'coordinate-invalid');
    const y = record.metadata?.y ?? bounded(pinY - height / 2, -MAX_COORDINATE, MAX_COORDINATE, 'coordinate-invalid');
    const rotation = record.metadata?.rotation ?? readAngleDegrees(xForm);
    const shapeKind = record.metadata?.shapeKind ?? mapShapeKind(sourceName, type);
    const color = fill === 'yellow' || fill === 'cyan' || fill === 'purple' ? fill : undefined;
    items.push({ id: record.id, type, x, y, width: record.metadata?.width ?? width, height: record.metadata?.height ?? height,
      rotation, text, ...(name === undefined ? {} : { name }), ...(color === undefined ? {} : { color }),
      shape: { kind: shapeKind, fill, stroke, strokeWidth } });
    shapesCount += 1;
  }

  const conversion = conversionReport(shapesCount, connectorsCount, 'import');
  if (sourceShapes.length !== items.length) fail('object-count-mismatch');
  return { items, conversion };
}
