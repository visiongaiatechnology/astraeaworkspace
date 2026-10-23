/**
 * GAP-0042, Runde 315: DER NACHWEIS, DASS DIE ANNAHME EINER GRID-TABELLE FUNKTIONIERT.
 *
 * WAS VORHER GALT, GEMESSEN IN DEN RUNDEN 263/264: von vier Ablagezonen meldeten
 * DREI eine Platzierung, ohne zu platzieren — Whiteboard hatte 23 Lesezugriffe
 * auf die Zustellung und 0 Schreibstellen. Diese Sonde prueft die
 * Schreibstelle, die diese Runde gebaut hat.
 *
 * WAS DIESER TEST MISST, UND WAS ER NICHT MISST:
 *   Er misst JEDE der neun Ablehnungen einzeln und den Erfolgsweg mit seinen
 *   zwei Modi.
 *   Er misst NICHT, dass die Drop-Zone die Funktion AUFRUFT — das ist die
 *   naechste Stufe und braucht ein DOM. Ein Test, dessen Name mehr behauptet
 *   als er prueft, ist eine Erfolgsmeldung in Kleinformat.
 *
 * UND ER MISST DIE ENTSCHEIDUNG, DIE DIESE RUNDE GETROFFEN HAT, GEGEN DEN
 * ZWEIFEL DER VORRUNDE: ich hatte behauptet, ein Live-Objekt sei ein Verweis
 * und darum fuer `COPY` der falsche Weg. Der Test `copy_ist_eigenstaendig`
 * haelt das Gegenteil fest — ein gefrorenes Live-Objekt traegt seinen eigenen
 * Schnappschuss.
 */
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../../types';
import type { WhiteboardDropResolution } from '../../drop-zone/whiteboardDropZoneContract';
import {
  acceptWhiteboardTableDrop,
  whiteboardFreeDropPosition,
  whiteboardLiveModeForIntent,
} from '../../live-objects/whiteboardLiveAcceptance';

const makeDocument = (
  kind: WorkspaceDocument['kind'],
  overrides: Partial<WorkspaceDocument> = {},
): WorkspaceDocument =>
  ({
    id: 'source-document',
    title: 'Quelldokument',
    kind,
    version: 7,
    objects: {},
    ...overrides,
  }) as WorkspaceDocument;

const TABELLE = {
  type: 'Table',
  data: { id: 'gitter', rows: 2, cols: 2, cells: { A1: { value: 'Umsatz' }, B1: { value: 42 } } },
};

/** Die Objekte tragen das WOM-Format; der Cast ist die Fixture-Konvention dieses Projekts
 *  (dieselbe Form wie in `whiteboardLiveObjectEngine.test.ts:13-15`). */
const alsObjekte = (objects: Record<string, unknown>): WorkspaceDocument['objects'] =>
  objects as WorkspaceDocument['objects'];

const quellGrid = (objects: Record<string, unknown> = { tabelle: TABELLE }): WorkspaceDocument =>
  makeDocument('Grid', { id: 'grid-doc', title: 'Zahlen', objects: alsObjekte(objects) });

function aufloesung(overrides: Partial<WhiteboardDropResolution> = {}): WhiteboardDropResolution {
  return {
    adapterId: 'fabric-grid-table-to-whiteboard',
    intent: 'COPY',
    integrationKind: 'copy',
    sourceDocumentId: 'grid-doc',
    sourceObjectId: 'tabelle',
    targetDocumentId: 'wb-doc',
    sourceVersion: 7,
    targetVersion: 3,
    ...overrides,
  };
}

const POSITION = { x: 120, y: 80 };

describe('acceptWhiteboardTableDrop — jede Ablehnung ist benannt', () => {
  it('meldet die fehlende Zustellung', () => {
    const r = acceptWhiteboardTableDrop({ delivered: false }, 'wb-doc', {}, [], POSITION);
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-drop-not-delivered' });
  });

  it('meldet die fehlende Aufloesung', () => {
    const r = acceptWhiteboardTableDrop({ delivered: true }, 'wb-doc', {}, [], POSITION);
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-resolution-missing' });
  });

  it('meldet die fehlende Quelle', () => {
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung() },
      'wb-doc',
      {},
      [],
      POSITION,
    );
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-source-missing' });
  });

  it('meldet eine Objektart, die keine Tabelle ist', () => {
    const quelle = quellGrid({ form: { type: 'Form', data: {} } });
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung({ sourceObjectId: 'form' }) },
      'wb-doc',
      { 'grid-doc': quelle },
      [],
      POSITION,
    );
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-object-kind-not-table' });
  });

  it('meldet eine nicht unterstuetzte Absicht', () => {
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung({ intent: 'MOVE' as never }) },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-intent-unsupported' });
  });

  it('meldet einen unbekannten Modus in der Aufloesung', () => {
    // DIESER FALL WAR UNERREICHBAR, BEVOR ICH DIE PRUEFUNG GEAENDERT HABE: mein
    // erster Anlauf pruefte nur `mode === null || mode === undefined`, und
    // `whiteboardLiveModeForIntent` liefert fuer jede gueltige Absicht einen
    // Modus. Ein fremder Wert kam darum erst in der Konvertierung an und hiess
    // dann `-contract-invalid` statt `-mode-unknown`. Ein toter Waechter sieht
    // aus wie ein strenger.
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung({ mode: 'Unsinn' as never }) },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-mode-unknown' });
  });

  it('meldet ein Ziel, das nicht das offene ist', () => {
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung({ targetDocumentId: 'anderes' }) },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-target-mismatch' });
  });

  it('meldet ein leeres Ziel', () => {
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung({ targetDocumentId: '' }) },
      '',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-target-mismatch' });
  });

  it('meldet eine Quelle, die diese Art nicht anbietet', () => {
    const quelle = makeDocument('Writer', { id: 'grid-doc', objects: alsObjekte({ tabelle: TABELLE }) });
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung() },
      'wb-doc',
      { 'grid-doc': quelle },
      [],
      POSITION,
    );
    expect(r).toEqual({ ok: false, reason: 'whiteboard-live-source-kind-unsupported' });
  });

  it('meldet ein Duplikat statt einen stillen Zwilling', () => {
    const erst = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung() },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(erst.ok).toBe(true);
    if (!erst.ok) throw new Error('der erste Drop muss gelingen');

    const zweit = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung() },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [erst.item],
      POSITION,
    );
    expect(zweit).toEqual({ ok: false, reason: 'whiteboard-live-already-placed' });
  });
});

describe('acceptWhiteboardTableDrop — die zwei gueltigen Wege', () => {
  it('COPY wird zu einem EIGENSTAENDIGEN Objekt mit eigenem Schnappschuss', () => {
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung() },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('muss gelingen');

    // DIE ENTSCHEIDUNG DIESER RUNDE, HIER FESTGEHALTEN: `COPY` uebersetzt zu
    // `Frozen`, und ein gefrorenes Live-Objekt traegt seinen eigenen
    // Schnappschuss — es ist damit eigenstaendig und kein blosser Verweis.
    expect(r.mode).toBe('Frozen');
    expect(r.item.type).toBe('live');
    expect(r.item.liveObject?.kind).toBe('grid-range');
    expect(r.item.liveObject?.mode).toBe('Frozen');
    expect(r.item.liveObject?.sourceDocumentId).toBe('grid-doc');
    expect(r.item.liveObject?.selector).toBe('tabelle');
    expect(r.item.liveObject?.frozenSnapshot).toBeDefined();
    expect(r.item.x).toBe(120);
    expect(r.item.y).toBe(80);
  });

  it('LIVE_REFERENCE wird zu einem Verweis OHNE Schnappschuss', () => {
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung({ intent: 'LIVE_REFERENCE', integrationKind: 'live' }) },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('muss gelingen');
    expect(r.mode).toBe('Live');
    expect(r.item.liveObject?.mode).toBe('Live');
    expect(r.item.liveObject?.frozenSnapshot).toBeUndefined();
  });

  it('ein Modus IN DER AUFLOESUNG gewinnt gegen die Absicht', () => {
    // Der kanonische Wert ist die Aufloesung; die Uebersetzung greift nur, wenn
    // sie keinen traegt. Dieselbe Regel wie in Publish (`:224-229`).
    const r = acceptWhiteboardTableDrop(
      { delivered: true, resolution: aufloesung({ mode: 'Live' }) },
      'wb-doc',
      { 'grid-doc': quellGrid() },
      [],
      POSITION,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('muss gelingen');
    expect(r.mode).toBe('Live');
  });
});

describe('whiteboardLiveModeForIntent — die Uebersetzung', () => {
  it('bildet COPY auf Frozen und LIVE_REFERENCE auf Live ab', () => {
    expect(whiteboardLiveModeForIntent('COPY')).toBe('Frozen');
    expect(whiteboardLiveModeForIntent('LIVE_REFERENCE')).toBe('Live');
  });

  it('gibt fuer alles andere null statt eines heimlichen Vorgabewerts', () => {
    expect(whiteboardLiveModeForIntent('MOVE')).toBeNull();
    expect(whiteboardLiveModeForIntent('')).toBeNull();
  });
});

describe('whiteboardFreeDropPosition — die Platzierung', () => {
  const item = (x: number, y: number, width: number): WhiteboardItem => ({
    id: `i-${x}`,
    type: 'sticky',
    x,
    y,
    width,
    height: 100,
    text: '',
    zIndex: 1,
  });

  it('legt das erste Item auf den Ursprung', () => {
    expect(whiteboardFreeDropPosition([])).toEqual({ x: 80, y: 80 });
  });

  it('legt ein neues Item rechts neben das rechteste', () => {
    const position = whiteboardFreeDropPosition([item(10, 20, 100), item(300, 50, 120)]);
    expect(position).toEqual({ x: 460, y: 50 });
  });

  it('ist deterministisch und nicht zufaellig', () => {
    const items = [item(10, 20, 100), item(300, 50, 120)];
    expect(whiteboardFreeDropPosition(items)).toEqual(whiteboardFreeDropPosition(items));
  });
});
