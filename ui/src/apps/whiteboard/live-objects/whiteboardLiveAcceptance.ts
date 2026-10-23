/**
 * Die Annahme einer zugestellten Tabelle im Whiteboard — GAP-0042, Runde 315.
 *
 * DIE LUECKE, DIE DIESE DATEI SCHLIESST. Gemessen in den Runden 263/264: von vier
 * Ablagezonen meldeten DREI eine Platzierung, ohne zu platzieren. Publish
 * verbraucht (`acceptPublishTableDrop`, `acceptPublishStoryDrop`, aufgerufen in
 * `PublishView.tsx:358`/`:367`); Notes, Writer und Whiteboard hatten 0
 * Schreibstellen. Die Meldung ist inzwischen zurueckgenommen (`Routed via`), und
 * diese Datei baut den Verbraucher, den der Eintrag als offene Aufgabe nennt.
 *
 * DAS MUSTER IST `apps/publish/integrations/publishTableAcceptance.ts:212-253`,
 * und drei Eigenschaften sind uebernommen, weil sie dort begruendet sind:
 *
 *   1. JEDE ABLEHNUNG IST BENANNT. Ein `ok: false` ohne Grund waere ein stiller
 *      Erfolg in Kleinformat — die Ansicht koennte nicht sagen, warum nichts
 *      passiert ist. Der Vorgaengerkommentar in Publish sagt es:
 *      "Ein stiller Erfolg waere ein `none`, das wie ein `delivered` aussieht."
 *
 *   2. SPEZIFISCH VOR ALLGEMEIN. `publishTableAcceptance.ts:209-210`: "wer mit
 *      dem Modus beginnt, meldet bei fehlender Quelle den falschen Grund." Die
 *      Reihenfolge unten ist darum: Zustellung, Quelle, Objektart, Absicht,
 *      Modus, Ziel, Duplikat, Konvertierung.
 *
 *   3. DER MODUS KOMMT NICHT AUS DER ABSICHT ALLEIN.
 *      `publishTableAcceptance.ts:224-229`: "der kanonische Wert der Aufloesung
 *      ist die Quelle, und die Uebersetzung ist die vorhandene". Bei
 *      `integrationKind: 'copy'` traegt die Aufloesung KEINEN Modus — das ist
 *      die Aussage (siehe `whiteboardDropZoneContract.ts:100-108`) —, und dann
 *      uebersetzt die Absicht.
 *
 * WAS DIESE DATEI AUSDRUECKLICH NICHT TUT:
 *   * Sie schreibt NICHT ins Dokument. Sie liefert das neue Item; WER es
 *     ablegt, entscheidet der Aufrufer. Das haelt die Funktion rein und
 *     pruefbar — dieselbe Trennung wie in Publish, wo der Aufruf in
 *     `PublishView.tsx` steht.
 *   * Sie erfindet KEINE Konvertierung. `createWhiteboardLiveObject`
 *     (`live-objects/whiteboardLiveObjectEngine.ts:425`) existiert und traegt
 *     bei `mode: 'Frozen'` einen eigenen `frozenSnapshot` (`:431`) — EIN
 *     GEFRORENES LIVE-OBJEKT IST EIGENSTAENDIG und damit der Kopie-Weg, den
 *     `intents: ['COPY']` verlangt. Meine erste Lesart, ein Live-Objekt sei
 *     nur ein Verweis und darum der falsche Weg, war zu streng: sie schloss aus
 *     dem Namen "Live" auf die Sache.
 */
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WhiteboardLiveObjectMode } from '../../../shared/contracts/whiteboard/workspaceWhiteboard';
import type { WhiteboardItem } from '../types';
import { createWhiteboardLiveObject, liveObjectKindsForDocument } from './whiteboardLiveObjectEngine';
import type { WhiteboardDropResolution } from '../drop-zone/whiteboardDropZoneContract';

/** Was die Zustellung mitbringt. `delivered: false` ist ein eigener Grund, kein Fehler. */
export interface WhiteboardLiveDropInput {
  readonly delivered: boolean;
  readonly resolution?: WhiteboardDropResolution;
}

/** Die Absichten, die dieses Whiteboard fuer eine Tabelle annehmen kann. */
export const WHITEBOARD_LIVE_ACCEPTED_INTENTS = Object.freeze(['COPY', 'LIVE_REFERENCE'] as const);

/**
 * Die Live-Objekt-Art einer Grid-Tabelle.
 *
 * `grid-range` ist die Art, die `SUPPORTED` fuer `Grid` fuehrt
 * (`whiteboardLiveObjectEngine.ts:15-20`), und `gridRange` (`:147`) liest genau
 * die Zellen eines `Table`-Objekts. Eine zweite Art fuer dieselbe Quelle waere
 * ein zweiter Weg.
 */
export const WHITEBOARD_TABLE_LIVE_KIND = 'grid-range' as const;

/**
 * Der Modus je Absicht — die Uebersetzung, die die Aufloesung bei `copy` nicht
 * mittraegt.
 *
 * SIE IST DIE IDENTITAET, UND DAS IST GEMESSEN, NICHT ANGENOMMEN:
 * `publishTableModeForIntent` (`publishTableAcceptance.ts:59-64`) bildet
 * `COPY` auf `Frozen` und `LIVE_REFERENCE` auf `Live` ab, und
 * `WhiteboardLiveObjectMode` ist `'Live' | 'Frozen' | 'Link'`. Zwei der drei
 * Werte sind in beiden Raeumen dieselben; `Link` ist Whiteboard-eigen und hier
 * nicht erreichbar, weil keine Absicht darauf zeigt.
 */
export function whiteboardLiveModeForIntent(intent: string): WhiteboardLiveObjectMode | null {
  if (intent === 'COPY') return 'Frozen';
  if (intent === 'LIVE_REFERENCE') return 'Live';
  return null;
}

/**
 * Die drei Modi, die das Whiteboard kennt — und die Pruefung darauf.
 *
 * WARUM DAS NICHT DASSELBE IST WIE `mode === null || mode === undefined`, UND
 * WARUM ICH ES GEAENDERT HABE: mein erster Anlauf pruefte nur die ABWESENHEIT.
 * Ein `resolution.mode` mit einem fremden Wert — aus JSON, aus einer aelteren
 * Fassung, aus einem Fehler — passierte diese Pruefung und fiel erst in
 * `createWhiteboardLiveObject` als `whiteboard_live_contract_invalid`. Die
 * Folge war eine TOTE PRUEFUNG: `whiteboardLiveModeForIntent` liefert fuer jede
 * gueltige Absicht einen Modus, also konnte der Zweig
 * `whiteboard-live-mode-unknown` von keiner Eingabe erreicht werden, die die
 * Absichtspruefung passiert. Mein eigener Test hat das aufgedeckt, indem er den
 * falschen Grund bekam.
 *
 * Jetzt prueft sie die GUELTIGKEIT, und der Zweig ist erreichbar: ein
 * unbekannter Modus in der Aufloesung wird benannt, bevor irgendetwas
 * konvertiert wird.
 */
const WHITEBOARD_LIVE_MODES: readonly WhiteboardLiveObjectMode[] = ['Live', 'Frozen', 'Link'];

export function isWhiteboardLiveObjectMode(value: unknown): value is WhiteboardLiveObjectMode {
  return typeof value === 'string' && (WHITEBOARD_LIVE_MODES as readonly string[]).includes(value);
}

/**
 * Eine freie Ablageposition fuer ein neues Item.
 *
 * WARUM ES DIESE FUNKTION GIBT, UND WARUM SIE SO RECHNET — beides ist gemessen:
 *   * `WhiteboardDropResolution` traegt KEINE Zeigerkoordinate. Gemessen: der
 *     Typ (`whiteboardDropZoneContract.ts:97-115`) hat `adapterId`, `intent`,
 *     `integrationKind`, `mode?`, die beiden Dokumentkennungen und die beiden
 *     Versionen — kein x, kein y.
 *   * UND es gibt keine gemeinsame Platzierungsfunktion im Whiteboard. Gemessen:
 *     `WhiteboardMiniMap.tsx:53` rechnet einen `viewportCenter`, aber der ist
 *     lokal in der MiniMap und wird nirgends geteilt.
 * Also muss der Aufrufer eine Position liefern, und diese Funktion liefert eine,
 * die NICHT geraten ist: sie setzt das neue Item rechts neben das rechteste
 * vorhandene und auf dessen Hoehe. Ein festes Paar wuerde jedes Item auf
 * denselben Punkt legen; eine Ableitung aus dem Bestand ist deterministisch,
 * sichtbar und ohne Zufall pruefbar.
 *
 * DASS DIE ZEIGERKOORDINATE FEHLT, IST EIN OFFENER REST UND KEIN ÜBERSCHEN:
 * sie gehoert in die Aufloesung, wenn ein Drop sie tragen soll. Solange sie
 * fehlt, ist die Ableitung die ehrlichere Antwort als eine Konstante.
 */
export function whiteboardFreeDropPosition(
  items: readonly WhiteboardItem[],
  step: { readonly x: number; readonly y: number } = { x: 40, y: 0 },
): { x: number; y: number } {
  let rechtesteKante = Number.NEGATIVE_INFINITY;
  let hoeheDerRechtesten = 0;
  for (const item of items) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.width)) continue;
    const kante = item.x + item.width;
    if (kante > rechtesteKante) {
      rechtesteKante = kante;
      hoeheDerRechtesten = Number.isFinite(item.y) ? item.y : 0;
    }
  }
  if (!Number.isFinite(rechtesteKante)) return { x: 80, y: 80 };
  return { x: rechtesteKante + step.x, y: hoeheDerRechtesten + step.y };
}

/** Jede Ablehnung hat einen Namen. */
export type WhiteboardLiveAcceptanceRefusal =
  | 'whiteboard-live-drop-not-delivered'
  | 'whiteboard-live-resolution-missing'
  | 'whiteboard-live-source-missing'
  | 'whiteboard-live-object-kind-not-table'
  | 'whiteboard-live-intent-unsupported'
  | 'whiteboard-live-mode-unknown'
  | 'whiteboard-live-target-mismatch'
  | 'whiteboard-live-source-kind-unsupported'
  | 'whiteboard-live-already-placed'
  | 'whiteboard-live-contract-invalid'
  | 'whiteboard-live-source-id-invalid';

export type WhiteboardLiveAcceptanceStep =
  | { readonly ok: true; readonly item: WhiteboardItem; readonly mode: WhiteboardLiveObjectMode }
  | { readonly ok: false; readonly reason: WhiteboardLiveAcceptanceRefusal };

/** Die Objektart, die als Tabelle gilt — dieselbe Zeichenkette wie in Publish. */
const TABLE_OBJECT_KIND = 'Table';

/** Die Grenzen dieses Weges — benannt, nicht geraten. */
export const WHITEBOARD_LIVE_LIMITS = Object.freeze({
  maxItems: 100_000,
});

function sourceObject(source: WorkspaceDocument, objectId: string): Record<string, unknown> | null {
  const objects = source.objects as unknown as Record<string, unknown> | undefined;
  if (!objects || typeof objects !== 'object') return null;
  const object = objects[objectId];
  return object && typeof object === 'object' && !Array.isArray(object)
    ? (object as Record<string, unknown>)
    : null;
}

/**
 * **Die Annahme einer zugestellten Grid-Tabelle im Whiteboard.**
 *
 * `targetDocumentId` ist das Dokument, in das abgelegt wird — es wird GEGEN die
 * Aufloesung geprueft, denn eine Zustellung an ein anderes Ziel als das
 * offene ist ein benannter Widerspruch und kein stiller Treffer.
 *
 * `existingItems` sind die Items, die das Ziel schon traegt — sie werden NUR
 * gelesen, um ein Duplikat zu erkennen. Dieselbe Quelle zweimal abzulegen ist
 * ein benannter Zustand und kein stiller Zwilling.
 */
export function acceptWhiteboardTableDrop(
  input: WhiteboardLiveDropInput,
  targetDocumentId: string,
  documents: Readonly<Record<string, WorkspaceDocument>>,
  existingItems: readonly WhiteboardItem[],
  position: { readonly x: number; readonly y: number },
): WhiteboardLiveAcceptanceStep {
  // 1. Die Zustellung selbst.
  if (!input.delivered) return { ok: false, reason: 'whiteboard-live-drop-not-delivered' };
  const resolution = input.resolution;
  if (!resolution) return { ok: false, reason: 'whiteboard-live-resolution-missing' };

  // 2. Die Quelle.
  const source = documents[resolution.sourceDocumentId];
  if (!source) return { ok: false, reason: 'whiteboard-live-source-missing' };

  // 3. Die Objektart.
  const object = sourceObject(source, resolution.sourceObjectId);
  if (object === null || object.type !== TABLE_OBJECT_KIND) {
    return { ok: false, reason: 'whiteboard-live-object-kind-not-table' };
  }

  // 4. Die Absicht.
  if (!(WHITEBOARD_LIVE_ACCEPTED_INTENTS as readonly string[]).includes(resolution.intent)) {
    return { ok: false, reason: 'whiteboard-live-intent-unsupported' };
  }

  // 5. Der Modus — Aufloesung zuerst, dann die Absicht. Bei `copy` traegt die
  //    Aufloesung keinen, und das ist die Aussage. Geprueft wird die
  //    GUELTIGKEIT, nicht die Abwesenheit: ein fremder Wert in der Aufloesung
  //    wird hier benannt und nicht erst in der Konvertierung.
  const mode = resolution.mode ?? whiteboardLiveModeForIntent(resolution.intent);
  if (!isWhiteboardLiveObjectMode(mode)) {
    return { ok: false, reason: 'whiteboard-live-mode-unknown' };
  }

  // 6. Das Ziel — die Aufloesung muss auf DIESES Dokument zeigen.
  if (resolution.targetDocumentId !== targetDocumentId || targetDocumentId.length === 0) {
    return { ok: false, reason: 'whiteboard-live-target-mismatch' };
  }

  // 7. Die Quelle muss die Art ueberhaupt anbieten — dieselbe Vorpruefung, die
  //    `createWhiteboardLiveObject` intern macht, hier aber BENANNT statt als
  //    geworfener Fehler.
  if (!liveObjectKindsForDocument(source).includes(WHITEBOARD_TABLE_LIVE_KIND)) {
    return { ok: false, reason: 'whiteboard-live-source-kind-unsupported' };
  }

  // 8. Kein stiller Zwilling.
  if (
    existingItems.some(
      (item) =>
        item.liveObject?.sourceDocumentId === resolution.sourceDocumentId &&
        item.liveObject?.selector === resolution.sourceObjectId,
    )
  ) {
    return { ok: false, reason: 'whiteboard-live-already-placed' };
  }

  // 9. Die Konvertierung — die VORHANDENE, mit ihren drei benannten Fehlern.
  try {
    const item = createWhiteboardLiveObject({
      source,
      kind: WHITEBOARD_TABLE_LIVE_KIND,
      mode,
      selector: resolution.sourceObjectId,
      x: position.x,
      y: position.y,
    });
    return { ok: true, item, mode };
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : '';
    if (code === 'whiteboard_live_source_kind_mismatch') {
      return { ok: false, reason: 'whiteboard-live-source-kind-unsupported' };
    }
    if (code === 'whiteboard_live_source_id_invalid') {
      return { ok: false, reason: 'whiteboard-live-source-id-invalid' };
    }
    return { ok: false, reason: 'whiteboard-live-contract-invalid' };
  }
}
