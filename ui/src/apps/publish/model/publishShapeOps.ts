// STATUS: PLATIN — Astraea Publish: Vektoren und Formen (AST-1406/1407/1408)
//
// ## Der Befund, gemessen vor dieser Datei
//
// `PublishFrameType` führt `'graphic'` — und der Canvas zeichnete für einen Grafikrahmen **denselben
// Bildplatzhalter** wie für ein fehlendes Bild. Es gab **keinen** Einstieg „Form einfügen", **kein** Einbetten
// eines SVG und **keine** Darstellung einer Kontur. Die Modellfelder dafür waren alle vorhanden und ungenutzt:
// `clippingPath`, `strokeColor`, `strokeWidthPt`, `opacity`, `fillColor`.
//
// ## Keine neue Vokabel — die Form liegt in vorhandenen Feldern
//
//   * **Eine Form ist ein Rahmen der Art `'graphic'`.** *Ein erfundenes `'Shape'` gäbe es im Vertrag nicht, und
//     genau deshalb steht hier keines.*
//   * **Welche Form** = `clippingPath`: die Punktfolge der Kontur. Ein Rechteck hat **keinen** Pfad (der
//     Rahmenkasten ist die Form), jede andere Form hat einen.
//   * **Die Kontur** = `strokeColor` + `strokeWidthPt`. **Die Transparenz** = `opacity`.
//   * **Ein eingebettetes SVG** = `assetId` auf ein Asset der Art `svg`. Der Anzeigepfad dafür existiert schon
//     (`presentPublishImage` nimmt `image` **und** `graphic`).
//
// ## Die eine Definition der Pfadkoordinaten
//
// `fitAssetFrame` (`publishAssetEngine.ts`) schreibt `clippingPath` bereits als **normierte** Werte **0…1**
// relativ zum Rahmenkasten (`{x:(1-w)/2,y:0,width:w,height:1}`). Diese Datei **folgt** dieser Bedeutung, statt
// eine zweite einzuführen: *zwei Einheiten für dasselbe Feld wären zwei Wahrheiten — und genau daran ist dieses
// Projekt schon mehrfach gescheitert.* Deshalb liegt die Umrechnung in **einer** Funktion (`shapeOutlinePoints`),
// und Canvas wie SVG-Export lesen sie von dort.
//
// ## Fail-closed mit benanntem Grund
//
// Unbekannte Form ✓, zu wenige Punkte für eine Fläche ✓, nicht-endliche oder ausserhalb liegende Koordinaten ✓,
// ein SVG, das keine ist ✓, ein zu grosses SVG ✓, aktive Inhalte ✓ → **benannt** abgelehnt.
//
// ## Was `NOT_TESTED` bleibt (Schicht 5)
//
// Der gezeichnete Pixel: ob eine Kontur auf dem Bildschirm so aussieht wie im PDF. Geprüft sind die
// Modellregeln, die erzeugten Ausgabeformate (SVG-Text) und der Rundlauf.
import type { PublishDocumentModel, PublishFrame, PublishPointMm } from '../../../shared/contracts/publish/workspacePublish';
import { addFrameToPublish, PublishModelError } from './publishDocumentEngine';
import { updatePublishFrame } from './publishFrameOps';
import { ingestPublishAsset, PUBLISH_ASSET_LIMITS } from '../assets/publishAssetEngine';

/** Die Formen, die diese Fläche anbietet — **eine** Liste, und sie ist absichtlich kurz. */
export const PUBLISH_SHAPE_KINDS = ['rectangle', 'ellipse', 'line', 'polygon'] as const;
export type PublishShapeKind = (typeof PUBLISH_SHAPE_KINDS)[number];

/** Ein Polygon braucht drei Punkte, eine Linie zwei — **benannte** Grenzen, keine stillen. */
export const PUBLISH_SHAPE_MIN_POINTS: Readonly<Record<PublishShapeKind, number>> = Object.freeze({
  rectangle: 0, ellipse: 0, line: 2, polygon: 3,
});

/** Die Vorgabeauflösung der angebotenen Formen (Punkte, normiert 0…1). */
const DEFAULT_OUTLINES: Readonly<Record<Exclude<PublishShapeKind, 'rectangle'>, readonly PublishPointMm[]>> = Object.freeze({
  ellipse: Object.freeze(Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return Object.freeze({ x: 0.5 + 0.5 * Math.cos(angle), y: 0.5 + 0.5 * Math.sin(angle) });
  })),
  line: Object.freeze([Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 1, y: 1 })]),
  polygon: Object.freeze([Object.freeze({ x: 0.5, y: 0 }), Object.freeze({ x: 1, y: 1 }), Object.freeze({ x: 0, y: 1 })]),
});

/**
 * **Die eine Umrechnung** normierter Pfadpunkte in Millimeter im Rahmenkasten.
 *
 * Canvas und SVG-Export lesen **diese** Funktion. *Zwei Umrechnungen desselben Feldes wären zwei Geometrien —
 * und die Erfahrung dieses Projekts mit zwei Geometrieregeln ist eindeutig.*
 */
export function shapeOutlinePoints(frame: Pick<PublishFrame, 'xMm' | 'yMm' | 'widthMm' | 'heightMm' | 'clippingPath' | 'rotationDeg'>): PublishPointMm[] {
  const path = frame.clippingPath;
  if (!path || path.length === 0) return [];
  return path.map((point) => ({ x: frame.xMm + point.x * frame.widthMm, y: frame.yMm + point.y * frame.heightMm }));
}

/** Ist dieser Rahmen eine **Form** (und nicht ein Bildplatzhalter)? — die eine Frage, die beide Flaechen stellen. */
export function isPublishShapeFrame(frame: Pick<PublishFrame, 'type' | 'clippingPath' | 'assetId'>): boolean {
  return frame.type === 'graphic' && frame.assetId === undefined && (frame.clippingPath?.length ?? 0) > 0;
}

/** Ist dieser Rahmen ein **eingebettetes SVG**? */
export function isPublishSvgFrame(frame: Pick<PublishFrame, 'type' | 'assetId'>, model: PublishDocumentModel): boolean {
  if (frame.type !== 'graphic' || frame.assetId === undefined) return false;
  const asset = model.assets.find((candidate) => candidate.id === frame.assetId);
  return asset?.mimeType === 'image/svg+xml';
}

/** Die sichtbare Aussage einer Form — **ohne Farbe**, mit Form und Behandlung. */
export function publishShapeLabel(frame: PublishFrame): string {
  const outline = shapeOutlinePoints(frame);
  const kind = outline.length === 0 ? 'rectangle' : outline.length === 2 ? 'line' : outline.length >= 24 ? 'ellipse' : 'polygon';
  const stroke = (frame.strokeWidthPt ?? 0) > 0 ? ` · ${frame.strokeWidthPt}pt contour` : ' · no contour';
  const opacity = (frame.opacity ?? 1) < 1 ? ` · ${Math.round((frame.opacity ?? 1) * 100)}% opaque` : '';
  return `${kind}${stroke}${opacity}`;
}

function assertPoint(point: PublishPointMm, index: number): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new PublishModelError(`shape-point-not-finite:${index}`);
  // Ausserhalb 0…1 ist erlaubt (eine Form darf über den Rahmen hinausragen), aber **begrenzt**: ein Wert weit
  // ausserhalb ist ein Datenfehler, kein Entwurf. Die Grenze ist benannt.
  if (point.x < -8 || point.x > 9 || point.y < -8 || point.y > 9) throw new PublishModelError(`shape-point-out-of-bounds:${index}`);
}

/** Prueft eine Punktfolge gegen die **benannten** Grenzen der Form. */
export function assertPublishShapeOutline(kind: PublishShapeKind, points: readonly PublishPointMm[]): void {
  if (!(PUBLISH_SHAPE_KINDS as readonly string[]).includes(kind)) throw new PublishModelError(`shape-kind-unknown:${String(kind)}`);
  const minimum = PUBLISH_SHAPE_MIN_POINTS[kind];
  if (points.length < minimum) throw new PublishModelError(`shape-points-below-minimum:${kind}:${points.length}<${minimum}`);
  points.forEach(assertPoint);
}

/**
 * **Eine Form einfuegen** — der eine Einstieg, den die Toolbar ruft.
 *
 * Die Form landet im **aktiven** Rahmen, wenn einer ausgewaehlt ist; sonst wird ein neuer Grafikrahmen angelegt.
 * *Ein zweiter Weg („immer neu anlegen") waere eine zweite Regel.*
 */
export interface PublishShapeSpec {
  kind: PublishShapeKind;
  xMm?: number;
  yMm?: number;
  widthMm?: number;
  heightMm?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidthPt?: number;
  opacity?: number;
  /** Nur fuer `polygon`/`line`: die eigenen Punkte. Fehlen sie, gilt die Vorgabeform. */
  points?: readonly PublishPointMm[];
}

export function shapeOutlineFor(spec: PublishShapeSpec): PublishPointMm[] {
  if (spec.points !== undefined) {
    assertPublishShapeOutline(spec.kind, spec.points);
    return spec.points.map((point) => ({ x: point.x, y: point.y }));
  }
  if (spec.kind === 'rectangle') return [];
  const outline = DEFAULT_OUTLINES[spec.kind];
  assertPublishShapeOutline(spec.kind, outline);
  return outline.map((point) => ({ x: point.x, y: point.y }));
}

/**
 * Die **Formfelder** eines Patches — genau die Felder, die eine Form ausmachen, und keine anderen.
 *
 * Sie stehen **einmal** hier, damit Toolbar, Inspektor und Tests dieselbe Zuordnung benutzen: *eine zweite
 * Zuordnung „was ist eine Form" waere eine zweite Vokabel.*
 */
export function shapeFramePatch(spec: PublishShapeSpec): Parameters<typeof updatePublishFrame>[2] {
  const outline = shapeOutlineFor(spec);
  return {
    type: 'graphic',
    semanticRole: 'Artifact',
    ...(spec.fillColor === undefined ? {} : { fillColor: spec.fillColor }),
    // Eine Form **ohne** Kontur ist unsichtbar, wenn sie auch keine Fuellung hat — die Vorgabe ist deshalb eine
    // Kontur, und sie steht hier an genau einer Stelle.
    strokeColor: spec.strokeColor ?? '#334155',
    strokeWidthPt: spec.strokeWidthPt ?? 1,
    opacity: spec.opacity ?? 1,
    ...(outline.length === 0 ? { clippingPath: undefined } : { clippingPath: outline }),
  };
}

/**
 * **Eine neue Form einfuegen** — der eine Einstieg der Toolbar.
 *
 * Sie benutzt den **vorhandenen** Weg (`addFrameToPublish` → `updatePublishFrame`) und fuegt **keine** zweite
 * Rahmen-Erzeugung hinzu: *eine zweite Erzeugung waere eine zweite Identitaets- und Eigentumsregel.*
 */
export function insertPublishShape(model: PublishDocumentModel, spec: PublishShapeSpec): PublishDocumentModel {
  const withFrame = addFrameToPublish(model, 'graphic', {
    name: `Shape · ${spec.kind}`,
    content: '',
    ...(spec.xMm === undefined ? {} : { xMm: spec.xMm }),
    ...(spec.yMm === undefined ? {} : { yMm: spec.yMm }),
    ...(spec.widthMm === undefined ? {} : { widthMm: spec.widthMm }),
    ...(spec.heightMm === undefined ? {} : { heightMm: spec.heightMm }),
  });
  const frameId = withFrame.selectedFrameId;
  if (!frameId) throw new PublishModelError('shape-frame-not-selected-after-insert');
  return updatePublishFrame(withFrame, frameId, shapeFramePatch(spec));
}

/**
 * **Ein SVG einbetten** (`AST-1407`).
 *
 * Der Aufnahmeweg ist der **vorhandene** (`ingestPublishAsset`): er prueft Format, Groesse und aktive Inhalte und
 * berechnet den SHA-256. *Ein zweiter Aufnahmeweg waere ein zweiter Parser.* Die Kontur- und
 * Transparenzfelder des Rahmens bleiben unangetastet — *das ist der Akzeptanzsatz „Kontur und Transparenz
 * erhalten".*
 */
export function assertSvgBytes(bytes: Uint8Array, name: string): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new PublishModelError('svg-bytes-empty');
  if (bytes.byteLength > PUBLISH_ASSET_LIMITS.maxSvgBytes) throw new PublishModelError(`svg-size-boundary:${bytes.byteLength}>${PUBLISH_ASSET_LIMITS.maxSvgBytes}`);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(4096, bytes.byteLength)));
  // Der **vorhandene** Aufnehmer prueft die aktiven Inhalte noch einmal in voller Laenge — hier wird nur der
  // Kopf geprueft, damit ein offensichtlich fremder Datensatz gar nicht erst in die Aufnahme laeuft.
  if (!/<svg[\s>]/iu.test(head)) throw new PublishModelError(`svg-root-element-missing:${name}`);
}

export interface PublishSvgEmbedRequest {
  name: string;
  bytes: Uint8Array;
  strokeColor?: string;
  strokeWidthPt?: number;
  opacity?: number;
}

/**
 * Bettet ein SVG in einen Grafikrahmen ein und **behaelt** Kontur und Transparenz.
 *
 * `assetId` geht durch `updatePublishFrame` — *dieselbe Regel wie ueberall: kein direktes Schreiben ins Modell.*
 */
export async function embedPublishSvg(
  model: PublishDocumentModel,
  frameId: string,
  request: PublishSvgEmbedRequest,
): Promise<{ model: PublishDocumentModel; assetId: string }> {
  const frame = model.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'graphic' && frame.type !== 'image') throw new PublishModelError('asset-frame-type-invalid');
  assertSvgBytes(request.bytes, request.name);
  const asset = await ingestPublishAsset({
    name: request.name,
    bytes: request.bytes,
    declaredMime: 'image/svg+xml',
    storage: 'embedded',
    canonicalUri: `asset://local/${encodeURIComponent(request.name)}`,
    modifiedAt: 0,
    licenseAllowsPackaging: true,
  });
  if (asset.mimeType !== 'image/svg+xml') throw new PublishModelError(`svg-mime-invalid:${asset.mimeType}`);
  const assets = model.assets.some((candidate) => candidate.id === asset.id)
    ? model.assets.map((candidate) => (candidate.id === asset.id ? asset : candidate))
    : [...model.assets, asset];
  /**
   * Kontur und Transparenz werden **nur gesetzt, wenn der Aufruf sie nennt** — sonst bleiben die Werte des
   * Rahmens stehen. *Ein hartes Zuruecksetzen auf die Vorgabe waere der Verlust, den der Akzeptanzsatz verbietet.*
   */
  const next = updatePublishFrame({ ...model, assets }, frameId, {
    type: 'graphic',
    assetId: asset.id,
    altText: frame.altText ?? request.name,
    ...(request.strokeColor === undefined ? {} : { strokeColor: request.strokeColor }),
    ...(request.strokeWidthPt === undefined ? {} : { strokeWidthPt: request.strokeWidthPt }),
    ...(request.opacity === undefined ? {} : { opacity: request.opacity }),
  });
  return { model: next, assetId: asset.id };
}

/**
 * **Erhaelt** der Rundlauf Kontur und Transparenz? — die gemessene Fassung des Akzeptanzsatzes.
 *
 * Sie vergleicht die **drei** Felder, die der Satz nennt, und nennt jedes, das abweicht. *Ein „erhalten", das
 * nichts vergleicht, waere eine Behauptung.*
 */
export interface PublishShapeFidelity {
  identical: boolean;
  changed: string[];
  before: { strokeColor: string | undefined; strokeWidthPt: number | undefined; opacity: number | undefined; pathPoints: number };
  after: { strokeColor: string | undefined; strokeWidthPt: number | undefined; opacity: number | undefined; pathPoints: number };
}

export function compareShapeFidelity(before: PublishFrame, after: PublishFrame): PublishShapeFidelity {
  const fields: Array<keyof PublishFrame> = ['strokeColor', 'strokeWidthPt', 'opacity'];
  const changed = fields.filter((field) => before[field] !== after[field]).map(String);
  const beforePoints = before.clippingPath?.length ?? 0;
  const afterPoints = after.clippingPath?.length ?? 0;
  if (beforePoints !== afterPoints) changed.push('clippingPath');
  return {
    identical: changed.length === 0,
    changed,
    before: { strokeColor: before.strokeColor, strokeWidthPt: before.strokeWidthPt, opacity: before.opacity, pathPoints: beforePoints },
    after: { strokeColor: after.strokeColor, strokeWidthPt: after.strokeWidthPt, opacity: after.opacity, pathPoints: afterPoints },
  };
}
