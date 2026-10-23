// STATUS: PLATIN — Astraea Publish: Stile, Grundlinienraster, Farbfelder und Tabellen bedienbar machen
//
// Befund vor dieser Datei (gemessen, Runde Publish-7):
//   • `resolvePublishStyle`, `upsertPublishStyle` und `applyDeclarativeStyleRules` existierten und waren aus
//     **keiner** Komponente erreichbar. „Globale Stiländerung auf 50 Absätze replizieren" war nicht
//     ausfuehrbar: es gab keinen Stilwaehler, keine Zuweisung und kein Neuberechnen.
//   • `PublishTextFrameOptions.alignToBaselineGrid` und `PublishTypography.tracking` wurden vom Canvas nie
//     gelesen — die Schalter hätten nichts bewirkt.
//   • `model.swatches` enthielt zwei Beispielwerte, war aber an keiner Stelle sichtbar, und es gab keine
//     Moeglichkeit, ein Farbfeld zuzuweisen.
//   • `createPublishTable`/`addStructuredObject` waren nicht erreichbar; Tabellen waren nicht einfuegbar.
//
// Diese Datei besitzt die Zuordnung „Stil → Absaetze" und die Objektzuweisungen. Die Regeln selbst bleiben in
// `publishTypographyEngine` (Aufloesung) und `publishStructuredContentEngine` (Tabellen).
import type {
  PublishDocumentModel, PublishFrame, PublishStyle, PublishStyleKind, PublishTable, PublishSwatch,
} from '../../../shared/contracts/publish/workspacePublish';
import { PUBLISH_LIMITS, PublishModelError, assertPublishDocument, publishStableId, syncPublishCompatibility } from './publishDocumentEngine';
import { resolvePublishStyle, upsertPublishStyle } from '../editorial/publishTypographyEngine';
import { createPublishTable } from '../interchange/structured/publishStructuredContentEngine';

/**
 * Die **Wertebereiche je Farbraum** — eine Definition, und sie folgt der vorhandenen Umrechnung.
 *
 * Gemessen (eigener Fehler, Runde Publish-16, von einem Test gefunden): die erste Fassung pruefte fuer **jeden**
 * Farbraum `0…100`. Der vorhandene Umrechner `colorToCmyk`/`rgbToCmyk` (`publishPrepressEngine.ts`) behandelt
 * **RGB** aber als `0…255` (`rgbToCmyk` teilt durch 255) und **Lab** mit `L` in `0…100` sowie `a`/`b` in
 * `-128…127`. Meine Pruefung haette damit ein gueltiges `rgb(255,0,0)` **abgelehnt** und ein unmoegliches
 * `rgb(100,100,100)` **durchgelassen** — *zwei Wahrheiten ueber denselben Wertebereich, und die neue war falsch.*
 */
const SWATCH_COMPONENT_RANGES: Readonly<Record<PublishSwatch['space'], readonly (readonly [number, number])[]>> = Object.freeze({
  CMYK: [[0, 100], [0, 100], [0, 100], [0, 100]],
  Spot: [[0, 100], [0, 100], [0, 100], [0, 100]],
  Gray: [[0, 100]],
  RGB: [[0, 255], [0, 255], [0, 255]],
  Lab: [[0, 100], [-128, 127], [-128, 127]],
});

/** Die Komponentenzahl je Farbraum — aus derselben Definition, nicht daneben. */
export function publishSwatchComponentCount(space: PublishSwatch['space']): number {
  return SWATCH_COMPONENT_RANGES[space].length;
}

function assertSwatchComponents(space: PublishSwatch['space'], components: readonly number[]): void {
  const ranges = SWATCH_COMPONENT_RANGES[space];
  if (!ranges) throw new PublishModelError(`swatch-space-unknown:${String(space)}`);
  if (components.length < ranges.length) throw new PublishModelError('swatch-components-invalid');
  for (let index = 0; index < ranges.length; index += 1) {
    const value = components[index]!;
    const [min, max] = ranges[index]!;
    if (!Number.isFinite(value) || value < min || value > max) throw new PublishModelError(`swatch-component-out-of-range:${space}:${index}:${min}..${max}`);
  }
}
const MAX_SWATCHES = 8192;
/** dieselbe Grenze wie `assertPublishDocument` — **eine** Zahl, nicht zwei. */
const MAX_STYLES = PUBLISH_LIMITS.maxStyles;
/**
 * Die Stilarten, die diese Flaeche anbietet — **dieselben Woerter wie der Vertrag** (`PublishStyleKind`).
 *
 * Sie stehen hier oeffentlich, damit der Inspektor sie **liest**, statt sie ein zweites Mal aufzuschreiben:
 * *zwei Listen ueber dieselben fuenf Arten waeren zwei Vokabeln.*
 */
export const PUBLISH_STYLE_KINDS: readonly PublishStyleKind[] = Object.freeze(['paragraph', 'character', 'object', 'table', 'cell']);

/**
 * **Einen Stil anlegen** (`AST-1386`) — der eine Einstieg, den die Oberflaeche ruft.
 *
 * Gemessen vorher: `applyStyleToAllAbsaetze` und `assignPublishStyle` waren erreichbar, aber es gab **keinen**
 * Weg, einen Stil **anzulegen** — der Inspektor zeigte nur, was schon da war. In einem leeren Dokument (das
 * dieser Batch erst moeglich gemacht hat) stand die Liste damit **immer** leer und der Stilwaehler war nutzlos.
 *
 * Die ID entsteht **stabil** aus Name und Art (`publishStableId`), damit derselbe Stil beim zweiten Anlegen
 * **derselbe** ist — *eine zufaellige ID haette bei jedem Klick einen zweiten Stil erzeugt.*
 */
export function createPublishStyle(
  model: PublishDocumentModel,
  name: string,
  kind: PublishStyleKind,
  properties: Record<string, string | number | boolean> = {},
): { model: PublishDocumentModel; styleId: string } {
  const cleanName = name.trim().slice(0, 512);
  if (!cleanName) throw new PublishModelError('style-name-empty');
  if (!PUBLISH_STYLE_KINDS.includes(kind)) throw new PublishModelError(`style-kind-unknown:${String(kind)}`);
  const styleId = publishStableId('style', `${kind}:${cleanName}`);
  if (model.styles.some((candidate) => candidate.id === styleId)) return { model, styleId };
  if (model.styles.length >= MAX_STYLES) throw new PublishModelError('style-count-limit');
  const style: PublishStyle = { id: styleId, name: cleanName, kind, properties: { ...properties } };
  // Der **vorhandene** Weg schreibt den Stil (`upsertPublishStyle` der Typografie-Engine) — keine zweite Regel.
  return { model: upsertPublishStyle(model, style), styleId };
}

/**
 * **Ein Farbfeld anlegen** (`AST-1396`) — der eine Einstieg.
 *
 * Gemessen vorher: `upsertPublishSwatch` war erreichbar, aber die Oberflaeche bot **nur** die zwei
 * Beispiel-Farbfelder an — in einem leeren Dokument also **gar keines**. „Spot-/Prozessfarben getrennt behandeln"
 * verlangt, dass man beide **anlegen** kann.
 *
 * Die Komponenten werden auf den Farbraum **aufgefuellt** (CMYK/Spot 4, RGB 3, Gray 1), damit der Aufrufer nur
 * die Zahlen nennen muss, die er kennt — *und die Pruefung bleibt bei `upsertPublishSwatch`.*
 */
export function createPublishSwatch(
  model: PublishDocumentModel,
  spec: { name: string; space: PublishSwatch['space']; components: readonly number[]; tintPercent?: number; spotName?: string },
): { model: PublishDocumentModel; swatchId: string } {
  const cleanName = spec.name.trim().slice(0, 512);
  if (!cleanName) throw new PublishModelError('swatch-name-empty');
  const required = publishSwatchComponentCount(spec.space);
  const components = Array.from({ length: required }, (_, index) => spec.components[index] ?? 0);
  const swatch: PublishSwatch = {
    id: publishStableId('swatch', `${spec.space}:${cleanName}:${spec.spotName ?? ''}`),
    name: cleanName,
    space: spec.space,
    components,
    tintPercent: spec.tintPercent ?? 100,
    ...(spec.space === 'Spot' ? { spotName: (spec.spotName ?? cleanName).trim().slice(0, 512) } : {}),
  };
  /**
   * **„Anlegen" ist nicht „ersetzen"** — dieselbe Regel wie bei `createPublishStyle`.
   *
   * Gemessen (eigener Fehler, Runde Publish-16): die erste Fassung rief unbedingt `upsertPublishSwatch` und
   * **ueberschrieb** damit ein vorhandenes Feld mit demselben Namen. `createPublishStyle` verhielt sich umgekehrt.
   * Zwei „Anlegen"-Wege mit zwei Bedeutungen — jetzt sagen beide: existiert es schon, bleibt es, wie es ist.
   * *Wer aendern will, aendert (`upsertPublishSwatch`) — wer anlegt, legt an.*
   */
  if (model.swatches.some((candidate) => candidate.id === swatch.id)) return { model, swatchId: swatch.id };
  return { model: upsertPublishSwatch(model, swatch), swatchId: swatch.id };
}

/** Absaetze, die einen Stil tragen — die Liste, die eine globale Aenderung trifft. */
export function framesUsingStyle(model: PublishDocumentModel, styleId: string, kind: PublishStyleKind): PublishFrame[] {
  const property = kind === 'character' ? 'characterStyleId' : kind === 'object' ? 'objectStyleId' : 'paragraphStyleId';
  return model.frames.filter(frame => frame[property] === styleId);
}

/**
 * Eine Stiländerung auf alle Absaetze replizieren.
 *
 * `upsertPublishStyle` steigt die Vererbungskette hoch, wenn der Stil noch nicht existiert — deshalb wird
 * **einmal** aufgeloest und dann verteilt, statt pro Rahmen neu zu rechnen. Genau das war der Fehler, den
 * die Akzeptanzhandlung nennt: „ohne lokale Sonderfaelle zu verlieren". Lokale Sonderfaelle sind Felder, die
 * der Rahmen selbst traegt (`fontSizePt`, `fontFamily`, `lineHeight`). Sie werden hier **nicht** ueberschrieben,
 * weil sie sonst stillschweigend verschwaenden.
 */
export interface PublishStyleReplication {
  model: PublishDocumentModel;
  styleId: string;
  affectedFrameIds: string[];
  preservedLocalOverrideCount: number;
}

/** Die Vorgaben, die `createPublishFrame` jedem Textrahmen mitgibt. Nur **davon abweichende** Werte sind lokal. */
const FRAME_FONT_SIZE_DEFAULT = 10;
const FRAME_FONT_FAMILY_DEFAULT = 'system-ui, sans-serif';
const FRAME_LINE_HEIGHT_DEFAULT = 1.4;

/**
 * Ist der Wert ein **lokaler** Sonderfall oder nur die Vorgabe der Rahmen-Erzeugung?
 *
 * Der Unterschied ist der Kern dieser Funktion. `createPublishFrame` setzt `fontSizePt: 10` und
 * `fontFamily: 'system-ui, sans-serif'` in **jeden** Textrahmen. Wer nur auf "Feld ist gesetzt" prueft, haelt
 * jeden Rahmen fuer einen Sonderfall; wer gar nicht prueft, ueberschreibt echte Sonderfaelle. Beide Irrwege
 * sind in Runde Publish-14 an einem Test mit 50 Absaetzen aufgefallen.
 */
export interface PublishLocalOverrides { fontSize: boolean; fontFamily: boolean; lineHeight: boolean; }

export function localStyleOverrides(frame: PublishFrame): PublishLocalOverrides {
  return {
    fontSize: frame.fontSizePt !== undefined && frame.fontSizePt !== FRAME_FONT_SIZE_DEFAULT,
    fontFamily: frame.fontFamily !== undefined && frame.fontFamily !== FRAME_FONT_FAMILY_DEFAULT,
    lineHeight: frame.lineHeight !== undefined && frame.lineHeight !== FRAME_LINE_HEIGHT_DEFAULT,
  };
}

export function applyStyleToAllAbsaetze(model: PublishDocumentModel, styleId: string, properties: Record<string, string | number | boolean>): PublishStyleReplication {
  const style = model.styles.find(candidate => candidate.id === styleId);
  if (!style) throw new PublishModelError('style-missing');
  const existing = upsertPublishStyle(model, { ...style, properties: { ...style.properties, ...properties } });
  const resolved = resolvePublishStyle(existing.styles, styleId);
  const frames = framesUsingStyle(existing, styleId, resolved.kind);
  const family = typeof resolved.properties.fontFamily === 'string' ? resolved.properties.fontFamily : undefined;
  const size = typeof resolved.properties.fontSizePt === 'number' ? resolved.properties.fontSizePt : undefined;
  const leading = typeof resolved.properties.leadingPt === 'number' ? resolved.properties.leadingPt : undefined;
  let preserved = 0;
  const nextFrames = existing.frames.map(frame => {
    if (!frames.some(match => match.id === frame.id)) return frame;
    const typography = frame.typography;
    if (!typography) throw new PublishModelError(`frame-typography-missing:${frame.id}`);
    /**
     * Lokale Sonderfaelle bleiben lokal, Vorgaben weichen dem Stil — **feldweise**.
     *
     * "Lokal" heisst: der Rahmen traegt einen vom Vorgabewert **abweichenden** Wert. Die Vorgaben von
     * `createPublishFrame` (10 pt, `system-ui, sans-serif`, 1.4) sind keine Sonderfaelle, sonst wirkte keine
     * Stilaenderung auf irgendeinen Absatz. Ein echter Sonderfall wird auf **beiden** Ebenen unangetastet
     * gelassen, damit Anzeige und Stil nicht auseinanderlaufen.
     */
    const local = localStyleOverrides(frame);
    if (local.fontSize || local.fontFamily || local.lineHeight) preserved += 1;
    const applyFamily = family !== undefined && !local.fontFamily;
    const applySize = size !== undefined && !local.fontSize;
    const applyLeading = leading !== undefined && !local.lineHeight;
    return {
      ...frame,
      ...(applyFamily ? { fontFamily: family } : {}),
      ...(applySize ? { fontSizePt: size } : {}),
      ...(applyLeading ? { lineHeight: leading! / Math.max(1, size ?? frame.fontSizePt ?? FRAME_FONT_SIZE_DEFAULT) } : {}),
      typography: {
        ...typography,
        ...(applyFamily ? { fontFamily: family! } : {}),
        ...(applySize ? { fontSizePt: size! } : {}),
        ...(applyLeading ? { leadingPt: leading! } : {}),
      },
    };
  });
  const synced = syncPublishCompatibility({ ...existing, frames: nextFrames, revision: existing.revision + 1 });
  assertPublishDocument(synced);
  return { model: synced, styleId, affectedFrameIds: frames.map(frame => frame.id), preservedLocalOverrideCount: preserved };
}

export function assignPublishStyle(model: PublishDocumentModel, frameId: string, styleId: string): PublishDocumentModel {
  const style = model.styles.find(candidate => candidate.id === styleId);
  if (!style) throw new PublishModelError('style-missing');
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (style.kind === 'paragraph' && frame.type !== 'text') throw new PublishModelError('style-kind-mismatch');
  const resolved = resolvePublishStyle(model.styles, styleId);
  const key = resolved.kind === 'character' ? 'characterStyleId' : resolved.kind === 'object' ? 'objectStyleId' : 'paragraphStyleId';
  const frames = model.frames.map(candidate => candidate.id === frameId ? { ...candidate, [key]: styleId } : candidate);
  const synced = syncPublishCompatibility({ ...model, frames, revision: model.revision + 1 });
  assertPublishDocument(synced);
  return synced;
}

/**
 * Grundlinienraster und Laufweite eines Textrahmens.
 *
 * Beide Werte wurden vom Canvas vorher ignoriert. `alignToBaselineGrid` landet in `text`, `tracking` in
 * `typography` — das sind die kanonischen Felder, keine neuen.
 */
export function setPublishBaselineGridAlignment(model: PublishDocumentModel, frameId: string, align: boolean): PublishDocumentModel {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'text') throw new PublishModelError('frame-not-text');
  if (!frame.text) throw new PublishModelError('frame-text-options-missing');
  return replaceFrame(model, frameId, { ...frame, text: { ...frame.text, alignToBaselineGrid: align } });
}

export function setPublishTracking(model: PublishDocumentModel, frameId: string, tracking: number): PublishDocumentModel {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'text' || !frame.typography) throw new PublishModelError('frame-not-text');
  // Grenze benannt: -1000 bis 10000 (1/1000 em) deckt jeden praxistauglichen Satz ab und verhindert
  // Rechenwerte, die keine Schrift mehr darstellen kann.
  if (!Number.isFinite(tracking) || tracking < -1000 || tracking > 10_000) throw new PublishModelError('typography-tracking-boundary');
  return replaceFrame(model, frameId, { ...frame, typography: { ...frame.typography, tracking } });
}

function replaceFrame(model: PublishDocumentModel, frameId: string, frame: PublishFrame): PublishDocumentModel {
  const frames = model.frames.map(candidate => candidate.id === frameId ? frame : candidate);
  const synced = syncPublishCompatibility({ ...model, frames, revision: model.revision + 1 });
  assertPublishDocument(synced);
  return synced;
}

/** Ein Farbfeld anlegen oder ersetzen. Die Komponenten werden gegen den Farbraum geprueft. */
export function upsertPublishSwatch(model: PublishDocumentModel, swatch: PublishSwatch): PublishDocumentModel {
  if (!swatch.id || !swatch.name.trim()) throw new PublishModelError('swatch-name-empty');
  // Die Wertebereiche kommen aus **einer** Definition, die der vorhandenen Umrechnung folgt.
  assertSwatchComponents(swatch.space, swatch.components);
  if (!Number.isFinite(swatch.tintPercent) || swatch.tintPercent < 0 || swatch.tintPercent > 100) throw new PublishModelError('swatch-tint-invalid');
  if (swatch.space === 'Spot' && !swatch.spotName?.trim()) throw new PublishModelError('swatch-spot-name-missing');
  const exists = model.swatches.some(candidate => candidate.id === swatch.id);
  if (!exists && model.swatches.length >= MAX_SWATCHES) throw new PublishModelError('swatch-count-limit');
  const swatches = exists ? model.swatches.map(candidate => candidate.id === swatch.id ? { ...swatch } : candidate) : [...model.swatches, { ...swatch }];
  return { ...model, swatches, revision: model.revision + 1 };
}

/** Ein Farbfeld einem Rahmen zuweisen — der einzige Weg, `fillColor`/`strokeColor` zu setzen. */
export function assignPublishSwatch(model: PublishDocumentModel, frameId: string, swatchId: string, role: 'fill' | 'stroke'): PublishDocumentModel {
  const swatch = model.swatches.find(candidate => candidate.id === swatchId);
  if (!swatch) throw new PublishModelError('swatch-missing');
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const value = swatchToCss(swatch);
  /**
   * Eine Konturfarbe ohne Breite waere unsichtbar.
   *
   * Gemessen (eigener Fehler, Runde Publish-14): `frame.strokeWidthPt ?? 1` half nicht, weil der Rahmen die
   * Breite als **0** traegt — `??` greift nur bei `null`/`undefined`. Der Nutzer waehlte eine Konturfarbe und
   * sah nichts. Jetzt wird 0 ausdruecklich auf 1 angehoben.
   */
  return replaceFrame(model, frameId, role === 'fill' ? { ...frame, fillColor: value } : { ...frame, strokeColor: value, strokeWidthPt: frame.strokeWidthPt ? frame.strokeWidthPt : 1 });
}

/**
 * Die **eine** Umrechnung Farbfeld → Anzeigewert.
 *
 * Der Canvas benutzte `frame.fillColor` direkt; es gab keine Stelle, die ein CMYK-Feld in einen sichtbaren
 * Wert brachte. Spot-Farben sind absichtlich als `spot(...)`-Token dargestellt: eine geratenaeherte
 * RGB-Anzeige einer Sonderfarbe waere eine Behauptung ueber eine Farbe, die der Bildschirm nicht kennt.
 */
export function swatchToCss(swatch: PublishSwatch): string {
  const tint = swatch.tintPercent / 100;
  if (swatch.space === 'Spot') return `spot(${swatch.spotName ?? swatch.name} ${Math.round(swatch.tintPercent)}%)`;
  if (swatch.space === 'CMYK') {
    const [c = 0, m = 0, y = 0, k = 0] = swatch.components;
    return `cmyk(${Math.round(c * tint)}% ${Math.round(m * tint)}% ${Math.round(y * tint)}% ${Math.round(k * tint)}%)`;
  }
  if (swatch.space === 'Gray') { const level = Math.round(255 * (1 - ((swatch.components[0] ?? 0) / 100) * tint)); return `rgb(${level} ${level} ${level})`; }
  if (swatch.space === 'Lab') return `lab(${swatch.components[0] ?? 50}% 0 0)`;
  const [r = 0, g = 0, b = 0] = swatch.components;
  return `rgb(${Math.round(r * tint)} ${Math.round(g * tint)} ${Math.round(b * tint)})`;
}

/** Tabelle einfuegen und an einen Rahmen binden — Tabellen waren vorher nicht einfuegbar. */
export function insertPublishTable(model: PublishDocumentModel, frameId: string, name: string, rows: number, columns: number): { model: PublishDocumentModel; table: PublishTable } {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const table = createPublishTable(name, rows, columns, 1, 0);
  const tables = model.tables.some(candidate => candidate.id === table.id) ? model.tables.map(candidate => candidate.id === table.id ? table : candidate) : [...model.tables, table];
  const frames = model.frames.map(candidate => candidate.id === frameId ? { ...candidate, type: 'table' as const, tableId: table.id, semanticRole: 'Table' as const, name: candidate.name || name } : candidate);
  const synced = syncPublishCompatibility({ ...model, tables, frames, revision: model.revision + 1 });
  assertPublishDocument(synced);
  return { model: synced, table };
}
