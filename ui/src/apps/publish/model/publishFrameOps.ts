// STATUS: PLATIN — Astraea Publish: Rahmen bedienen (auswaehlen, schieben, tippen, loeschen, sperren)
//
// Befund vor dieser Datei (gemessen, Runde Publish-2): Der Objektinspektor schrieb `xMm`, `yMm`, `widthMm`
// und `heightMm` **direkt** in das Modell — an `snapRect`, an der Groessenpruefung und an der
// Ueberlauf-Neuberechnung vorbei. Es gab keine Pfeiltasten-Bewegung, kein Loeschen per Tastatur und keine
// Moeglichkeit, den Text eines Rahmens ueberhaupt zu setzen (der Canvas benutzte contentEditable, das
// seinen Wert per `innerText` zurueckschrieb — inklusive der Whitespace-Normalisierung des Browsers).
//
// Diese Datei besitzt die Tastatur-Absicht (`resolvePublishKeyIntent`) und die Rahmenbefehle. Sie ist
// bewusst frei von DOM: Canvas und Toolbar rufen nur noch diese Funktionen auf, damit es **eine**
// Definition davon gibt, was „Rahmen um 1 mm verschieben" heisst.
import type { PublishDocumentModel, PublishFrame, PublishRectMm } from '../../../shared/contracts/publish/workspacePublish';
import {
  assertPublishDocument, detectOversetFrames, PublishModelError, refreshFrameOverset,
  reflowAllTextThreads, setFrameRect, syncPublishCompatibility,
} from './publishDocumentEngine';

/** Die einzige Quelle fuer Schrittweiten. Fein = 0,1 mm (1/254 Zoll), grob = 10 mm. */
export const PUBLISH_NUDGE_STEP_MM = 0.1;
export const PUBLISH_NUDGE_COARSE_MM = 10;

export type PublishNudgeDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Was eine Taste in der Publish-Flaeche bedeutet.
 *
 * `null` heisst: diese Taste gehoert nicht uns und wird **nicht** abgefangen. Das ist die wichtigere
 * Haelfte des Vertrags — ein globaler Handler, der jede Pfeiltaste schluckt, macht Tippen im Textrahmen
 * unmoeglich.
 */
export interface PublishKeyIntent {
  kind: 'nudge' | 'delete-frame' | 'deselect';
  direction?: PublishNudgeDirection;
  /** Grosser Schritt (Umschalt) oder feiner Schritt: beides muss erreichbar sein. */
  coarse?: boolean;
}

export interface PublishKeyEventShape {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Wahres, wenn der Fokus in einem Eingabefeld oder einem editierbaren Bereich liegt. */
  editingText?: boolean;
}

/**
 * Tastenabsicht. Reine Funktion: derselbe Ereignis-Shape ergibt dieselbe Absicht, ohne DOM.
 *
 * Regeln und ihr Grund:
 *   • In einem Eingabefeld oder im Textrahmen gehoert die Taste dem Text — ausser Strg/Cmd wird gehalten.
 *   • Pfeiltasten bewegen den ausgewaehlten Rahmen um 0,1 mm; mit Umschalt um 10 mm.
 *   • Entf/Backspace loescht den Rahmen; Escape hebt die Auswahl auf.
 */
export function resolvePublishKeyIntent(event: PublishKeyEventShape): PublishKeyIntent | null {
  const modifier = Boolean(event.ctrlKey || event.metaKey);
  if (event.editingText && !modifier) return null;
  const directions: Record<string, PublishNudgeDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const direction = directions[event.key];
  if (direction) return { kind: 'nudge', direction, coarse: Boolean(event.shiftKey) };
  if (event.key === 'Delete' || event.key === 'Backspace') return { kind: 'delete-frame' };
  if (event.key === 'Escape') return { kind: 'deselect' };
  return null;
}

/** Die Verschiebung in mm fuer eine Richtung und Schrittweite. */
export function nudgeDelta(direction: PublishNudgeDirection, coarse = false): { dxMm: number; dyMm: number } {
  const step = coarse ? PUBLISH_NUDGE_COARSE_MM : PUBLISH_NUDGE_STEP_MM;
  switch (direction) {
    case 'left': return { dxMm: -step, dyMm: 0 };
    case 'right': return { dxMm: step, dyMm: 0 };
    case 'up': return { dxMm: 0, dyMm: -step };
    case 'down': return { dxMm: 0, dyMm: step };
  }
}

export function selectPublishFrame(model: PublishDocumentModel, frameId: string | null): PublishDocumentModel {
  if (frameId !== null && !model.frames.some(frame => frame.id === frameId)) throw new PublishModelError('frame-missing');
  return syncPublishCompatibility({ ...model, selectedFrameId: frameId });
}

/**
 * Verschiebt einen Rahmen **ohne** Rasterung.
 *
 * Der Grund ist gemessen: mit aktivem Fang rastete eine 0,1-mm-Bewegung sofort auf die naechste
 * Hilfslinie ein und der Rahmen bewegte sich scheinbar gar nicht. Fangen ist fuer Ziehen mit der Maus
 * richtig, nicht fuer die Taste.
 */
export function nudgePublishFrame(model: PublishDocumentModel, frameId: string, direction: PublishNudgeDirection, coarse = false): PublishDocumentModel {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.locked) throw new PublishModelError('frame-locked');
  const { dxMm, dyMm } = nudgeDelta(direction, coarse);
  return setFrameRect(model, frameId, { x: frame.xMm + dxMm, y: frame.yMm + dyMm }, { snap: false });
}

/** Textinhalt setzen und den Ueberlauf neu berechnen — die einzige Stelle, die `content` schreibt. */
export function setPublishFrameContent(model: PublishDocumentModel, frameId: string, content: string): PublishDocumentModel {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'text') throw new PublishModelError('frame-not-text');
  if (content.length > 8_000_000) throw new PublishModelError('frame-text-boundary');
  const frames = model.frames.map(candidate => candidate.id === frameId ? refreshFrameOverset({ ...candidate, content }) : candidate);
  const next = syncPublishCompatibility({ ...model, frames, revision: model.revision + 1 });
  assertPublishDocument(next);
  return next;
}

/**
 * Erlaubte Felder eines Rahmen-Patches.
 *
 * `id`, `pageId` und `pageIndex` fehlen hier **absichtlich**: sie sind Eigentum des Dokuments. Vorher
 * schrieb der Aufrufer ein beliebiges `Partial<PublishFrame>` und konnte damit die Seitenzugehoerigkeit
 * zerreissen — der Fehler kam erst spaeter als `frame-page-missing` heraus.
 */
export type PublishFramePatch = Partial<Omit<PublishFrame, 'id' | 'pageId' | 'pageIndex'>>;

const FRAME_PATCH_KEYS: readonly (keyof PublishFramePatch)[] = [
  'type', 'name', 'xMm', 'yMm', 'widthMm', 'heightMm', 'rotationDeg', 'content', 'fontSizePt', 'fontFamily',
  'lineHeight', 'fillColor', 'strokeColor', 'strokeWidthPt', 'columns', 'opacity', 'locked', 'hidden', 'text',
  'typography', 'paragraphStyleId', 'characterStyleId', 'objectStyleId', 'nestedStyles', 'declarativeStyleRules',
  'decoration', 'footnotes', 'endnotes', 'spanColumns', 'splitColumns', 'anchor', 'constraints', 'responsiveRules',
  'assetId', 'fitMode', 'focalPoint', 'clippingPath', 'maskAssetId', 'blendMode', 'effects', 'altText',
  'semanticRole', 'workspaceReferenceId', 'tableId', 'chartReferenceId', 'barcodeId',
];

export function updatePublishFrame(model: PublishDocumentModel, frameId: string, patch: PublishFramePatch): PublishDocumentModel {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const applied: Record<string, unknown> = {};
  for (const key of FRAME_PATCH_KEYS) if (key in patch) applied[key] = patch[key];
  const frames = model.frames.map(candidate => candidate.id === frameId ? refreshFrameOverset({ ...candidate, ...applied } as PublishFrame) : candidate);
  const next = syncPublishCompatibility({ ...model, frames, revision: model.revision + 1 });
  assertPublishDocument(next);
  return next;
}

export function setPublishFrameLocked(model: PublishDocumentModel, frameId: string, locked: boolean): PublishDocumentModel {
  return updatePublishFrame(model, frameId, { locked });
}

export function setPublishFrameHidden(model: PublishDocumentModel, frameId: string, hidden: boolean): PublishDocumentModel {
  return updatePublishFrame(model, frameId, { hidden });
}

/**
 * Loescht einen Rahmen und **repariert die Textverkettung**.
 *
 * Ohne die Reparatur bliebe ein Verweis auf einen nicht mehr vorhandenen Rahmen stehen;
 * `assertPublishDocument` lehnt das als `text-thread-target-invalid` ab. Der Vorgaenger wird also direkt
 * mit dem Nachfolger verbunden, damit eine Story beim Loeschen eines Mittelstuecks nicht zerreisst.
 */
export function removePublishFrame(model: PublishDocumentModel, frameId: string): PublishDocumentModel {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const previousId = frame.text?.previousFrameId;
  const nextId = frame.text?.nextFrameId;
  /**
   * Wurde der Rahmen ueberhaupt verkettet? Nur dann wird die Kette repariert **und** neu umflossen.
   *
   * Gemessen (eigener Fehler, Runde Publish-11): ein Umfluss nach dem Loeschen verteilte Texte neu, die nie
   * eine Story waren — aus 2 Zeichen wurden 3, weil der Umfluss beide Rahmen als eine Kette behandelte und
   * ihre Inhalte zusammenzaehlte.
   */
  const wasLinked = Boolean(previousId || nextId);
  const hasPrevious = previousId !== undefined && model.frames.some(candidate => candidate.id === previousId);
  const hasNext = nextId !== undefined && model.frames.some(candidate => candidate.id === nextId);
  const frames = model.frames
    .filter(candidate => candidate.id !== frameId)
    .map(candidate => {
      if (candidate.type !== 'text' || !candidate.text) return candidate;
      /**
       * Nur verlinken, wenn beide Enden existieren.
       *
       * Gemessen (eigener Fehler, Runde Publish-11): fehlte ein Ende, entstand ein Verweis auf einen **nicht
       * vorhandenen** Rahmen. `assertPublishDocument` haette das spaeter als `text-thread-target-invalid`
       * gemeldet, aber der Umfluss lief vorher und verschob Text — der Vorgaenger bekam den Inhalt des
       * geloeschten Rahmens und wuchs von 1 auf 2 Zeichen.
       */
      if (candidate.id === previousId) {
        const text = { ...candidate.text };
        if (hasNext) text.nextFrameId = nextId; else delete text.nextFrameId;
        return { ...candidate, text };
      }
      if (candidate.id === nextId) {
        const text = { ...candidate.text };
        if (hasPrevious) text.previousFrameId = previousId; else delete text.previousFrameId;
        return { ...candidate, text };
      }
      return candidate;
    });
  const pages = model.pages.map(page => page.frameIds.includes(frameId) ? { ...page, frameIds: page.frameIds.filter(id => id !== frameId) } : page);
  const repaired = syncPublishCompatibility({ ...model, pages, frames, selectedFrameId: null, revision: model.revision + 1 });
  if (!wasLinked) { assertPublishDocument(repaired); return repaired; }
  // Nur eine **echte** Story neu umfliessen: der geloeschte Rahmen hat den Textfluss veraendert, ein
  // unverbundener Einzelrahmen darf nicht in eine Story hineingezogen werden.
  const synced = syncPublishCompatibility(reflowAllTextThreads(repaired));
  assertPublishDocument(synced);
  return synced;
}

/** Alle Rahmen eines Dokuments, die Text verlieren — die Liste, die der Inspector als Ueberlauf anzeigt. */
export function oversetFrameIds(model: PublishDocumentModel): string[] {
  return detectOversetFrames(model);
}

/** Das Rechteck eines Rahmens als Wert — damit Canvas und Inspector dieselbe Zahl lesen. */
export function frameRect(frame: PublishFrame): PublishRectMm {
  return { x: frame.xMm, y: frame.yMm, width: frame.widthMm, height: frame.heightMm };
}
