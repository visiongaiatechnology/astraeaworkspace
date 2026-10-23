// STATUS: PLATIN — Paket 15 (AST-1306/AST-1307): fremdes SVG als **sichere vektorielle Form** einfügen.
//
// ## Die Lücke, gemessen
//
// `importDrawSvg` nimmt **nur** ein Astraea-eigenes SVG: es verlangt das eingebettete
// `VGT_DRAW_SVG_META_V1` und wirft sonst `svg-semantic-metadata-missing` (`drawInterchangeCore.ts:106-121`).
// Jedes fremde SVG war damit **nicht** importierbar — *die Akzeptanz nennt aber ausdrücklich die „sichere
// vektorielle Form"* ✓.
//
// ## Was hier entsteht — und was **nicht**
//
// Hier entsteht **keine** zweite Härtung ✗: `assertSafeDrawSvgSource` (dieselbe Funktion wie im
// Metadaten-Import) prüft Größe, Tiefe, Elementzahl, aktiven Inhalt und Struktur, **bevor** gelesen wird.
// Gelesen werden die Grundformen, die sich **verlustfrei** auf Draw-Vektoren abbilden: `rect`, `circle`,
// `ellipse`, `line`, `polyline`, `polygon`. Alles andere wird **benannt** ausgelassen:
//   * `path` — Draw führt Kurven über `pathNodes`; eine Umdeutung als Polyline wäre ein Datenverlust ohne
//     Ansage. Deshalb: benannt ausgelassen, nicht stillschweigend vereinfacht.
//   * `text` — Draw-Text ist ein eigener Vertrag (`richText`); ein `<text>`-Knoten ohne Layouthinweise
//     hineinzurechnen wäre geraten.
//   * `image` — **der „geprüfte Rasterfall" dieser Zone**: Draw hat **kein** Bildobjekt
//     (`DrawObject.type` kennt keines, `WORKSPACE_OBJECT_KINDS` führt `MediaAsset` — Draw aber nicht).
//     Deshalb wird Rasterinhalt **geprüft und benannt abgelehnt** (`svg-raster-content-unsupported`), statt
//     eine Attrappe zu bauen. Sobald der Vertrag ein Bildobjekt führt, gehört dieser Zweig hierher.
import type { DrawDocumentModel, DrawObject, DrawPageId, DrawVectorStyle } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument, transactDraw } from '../model/drawDocumentEngine';
import { DEFAULT_DRAW_STYLE, createVectorShape } from '../model/drawVectorEngine';
import { MAX_OBJECTS, safeId } from '../model/drawDocumentValidation';
import { assertSafeDrawSvgSource } from './drawInterchangeCore';

export const DRAW_FOREIGN_SVG_LIMITS = Object.freeze({
  /** Obergrenze der gelesenen Elemente — darüber wird **benannt** abgebrochen. */
  maxElements: 2_000,
  /** Obergrenze der erzeugten Objekte. */
  maxObjects: 2_000,
});

export interface DrawForeignSvgResult {
  readonly model: DrawDocumentModel;
  /** Die gelesenen Formarten, je einmal genannt (z. B. `rect`, `circle`). */
  readonly imported: readonly string[];
  /** Die **benannten** Auslassungen — je Elementart einmal, ohne Wiederholung. */
  readonly omitted: readonly string[];
}

const NUMBER = '(-?[0-9.]+)';

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return match ? match[1]! : null;
}

function number(tag: string, name: string): number | null {
  const raw = attribute(tag, name);
  if (raw === null) return null;
  const match = new RegExp(`^\\s*${NUMBER}\\s*$`).exec(raw);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function pointsAttribute(tag: string): { x: number; y: number }[] {
  const raw = attribute(tag, 'points');
  if (raw === null) return [];
  const numbers = raw.trim().split(/[\s,]+/u).map((entry) => Number(entry));
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const x = numbers[index]!;
    const y = numbers[index + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    points.push({ x, y });
  }
  return points;
}

function styleFrom(tag: string): Partial<DrawVectorStyle> {
  const style: Partial<DrawVectorStyle> = {};
  const fill = attribute(tag, 'fill');
  const stroke = attribute(tag, 'stroke');
  const strokeWidth = number(tag, 'stroke-width');
  if (fill !== null && fill !== 'none') style.fill = fill;
  if (stroke !== null && stroke !== 'none') style.stroke = stroke;
  if (strokeWidth !== null && strokeWidth >= 0) style.strokeWidth = strokeWidth;
  return style;
}

/** Ein Tag → Draw-Objekt oder `null` (dann steht der Grund in `omitted`). */
function objectFromTag(tag: string, name: string, index: number, pageId: DrawPageId, layerId: string): { object: DrawObject | null; kind: string } {
  const style = styleFrom(tag);
  const base = {
    id: safeId(`svg-${name}-${index + 1}`, 'svg-object-id-invalid'),
    pageId,
    layerId,
    name: `${name} ${index + 1}`,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: index,
    vector: { kind: 'rectangle' as const, style: { ...DEFAULT_DRAW_STYLE, ...style } },
  };

  if (name === 'rect') {
    const width = number(tag, 'width') ?? 0;
    const height = number(tag, 'height') ?? 0;
    if (width <= 0 || height <= 0) return { object: null, kind: 'rect' };
    return {
      object: createVectorShape({ ...base, x: number(tag, 'x') ?? 0, y: number(tag, 'y') ?? 0, width, height, vector: { kind: 'rectangle', style: base.vector.style } }),
      kind: 'rect',
    };
  }
  if (name === 'circle' || name === 'ellipse') {
    const rx = name === 'circle' ? number(tag, 'r') : number(tag, 'rx');
    const ry = name === 'circle' ? number(tag, 'r') : number(tag, 'ry');
    if (rx === null || ry === null || rx <= 0 || ry <= 0) return { object: null, kind: name };
    const cx = number(tag, 'cx') ?? 0;
    const cy = number(tag, 'cy') ?? 0;
    return {
      object: createVectorShape({ ...base, x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2, vector: { kind: 'ellipse', style: base.vector.style } }),
      kind: name,
    };
  }
  if (name === 'line') {
    const x1 = number(tag, 'x1') ?? 0;
    const y1 = number(tag, 'y1') ?? 0;
    const x2 = number(tag, 'x2') ?? 0;
    const y2 = number(tag, 'y2') ?? 0;
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    return {
      object: createVectorShape({
        ...base, x, y, width: Math.abs(x2 - x1) || 1, height: Math.abs(y2 - y1) || 1,
        vector: { kind: 'line', style: { ...base.vector.style, fill: 'none' }, points: [{ x: x1 - x, y: y1 - y }, { x: x2 - x, y: y2 - y }] },
      }),
      kind: 'line',
    };
  }
  if (name === 'polyline' || name === 'polygon') {
    const points = pointsAttribute(tag);
    if (points.length < 2) return { object: null, kind: name };
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    if (name === 'polygon' && points.length >= 4) {
      // Ein Viereck wird als Vieleck geführt (Draws `polygon`-Rendermodell ist die Raute — deshalb `custom-path`).
      return {
        object: createVectorShape({
          ...base, x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top),
          vector: { kind: 'custom-path', closed: true, style: base.vector.style, points: points.map((point) => ({ x: point.x - left, y: point.y - top })) },
        }),
        kind: 'polygon',
      };
    }
    return {
      object: createVectorShape({
        ...base, x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top),
        vector: { kind: 'freehand', closed: false, style: { ...base.vector.style, fill: 'none' }, points: points.map((point) => ({ x: point.x - left, y: point.y - top })) },
      }),
      kind: name,
    };
  }
  return { object: null, kind: name };
}

/**
 * Liest ein **fremdes** SVG (ohne Astraea-Metadaten) als sichere vektorielle Form in die Seite ein.
 *
 * `omitted` ist die Ansage: jede nicht unterstützte Elementart steht **einmal** darin. Rasterinhalt
 * (`<image>`) ist ein **benannter** Fall (`svg-raster-content-unsupported`) — kein stiller Verlust.
 */
export function importForeignDrawSvg(
  source: string,
  base: DrawDocumentModel,
  pageId: DrawPageId = base.activePageId,
  layerId?: string,
): DrawForeignSvgResult {
  if (typeof source !== 'string') throw new DrawModelError('svg-source-invalid');
  assertDrawDocument(base);
  assertSafeDrawSvgSource(source);
  const page = base.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const targetLayer = layerId ?? page.layerIds[0];
  if (!targetLayer || !page.layerIds.includes(targetLayer)) throw new DrawModelError('object-layer-missing');
  if (/<image\b/i.test(source)) throw new DrawModelError('svg-raster-content-unsupported');

  const tags = source.match(/<(?:rect|circle|ellipse|line|polyline|polygon|path|text|image|use)\b[^>]*>/gi) ?? [];
  if (tags.length > DRAW_FOREIGN_SVG_LIMITS.maxElements) throw new DrawModelError('svg-element-limit');
  if (Object.keys(base.objects).length + tags.length > Math.min(DRAW_FOREIGN_SVG_LIMITS.maxObjects, MAX_OBJECTS)) {
    throw new DrawModelError('svg-object-limit');
  }

  const importedKinds = new Set<string>();
  const omittedKinds = new Set<string>();
  const objects: DrawObject[] = [];
  tags.forEach((tag, index) => {
    const name = (/^<([a-z]+)/i.exec(tag)?.[1] ?? '').toLowerCase();
    if (name === 'path' || name === 'text' || name === 'use' || name === 'image') {
      omittedKinds.add(name);
      return;
    }
    const { object, kind } = objectFromTag(tag, name, index, pageId, targetLayer);
    if (!object) { omittedKinds.add(kind); return; }
    importedKinds.add(kind);
    objects.push(object);
  });

  if (objects.length === 0) throw new DrawModelError('svg-no-vector-content');
  const firstZIndex = Object.values(base.objects).reduce((highest, object) => Math.max(highest, object.zIndex), -1) + 1;
  const model = transactDraw(base, (draft) => {
    objects.forEach((object, index) => {
      draft.objects[object.id] = { ...object, zIndex: firstZIndex + index };
      const targetPage = draft.pages.find((candidate) => candidate.id === pageId)!;
      if (!targetPage.objectIds.includes(object.id)) targetPage.objectIds.push(object.id);
    });
  });
  return { model, imported: [...importedKinds].sort(), omitted: [...omittedKinds].sort() };
}
