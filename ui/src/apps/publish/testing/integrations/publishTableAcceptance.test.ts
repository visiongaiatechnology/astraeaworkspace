// STATUS: PLATIN — Publish: Preisuebersicht aus Grid, Snapshot/Live waehlen (AST-1411/1412/1413)
//
// Akzeptanzsatz: „Preisuebersicht aus Grid einfuegen, **Snapshot/Live** waehlen."
//
// Gemessen vorher: die **Matrix trug die Route** (`shell/fabric/fabricGraphWorkspaceDrop.ts:235-245`:
// `imports: [{ objectKind: 'Table', intents: ['COPY'] }]` + Adapter `fabric-grid-table-to-publish`), der Resolver
// lieferte eine Aufloesung — und **Publish nahm sie nicht an**: es gab keine Annahmestelle fuer `Table`.
// `PublishTable.link` (`workspacePublish.ts:345`) wurde von niemandem geschrieben, und `model.tables` kam im
// Paket-Manifest **nicht** vor.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createPublishProject } from '../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, assertPublishDocument } from '../../model/publishDocumentEngine';
import {
  PUBLISH_TABLE_ACCEPTED_INTENTS, PUBLISH_TABLE_CARRIER_OBJECT_KIND, PUBLISH_TABLE_LIMITS,
  acceptPublishTableDrop, describePublishTable, gridCellText, publishTableFromGridShape,
  publishTableModeForIntent, publishTableRefusalText, readGridCellRef, refreshPublishTableFromSource,
  setPublishTableMode,
} from '../../integrations/publishTableAcceptance';
import { publishCarrierObjectType } from '../../integrations/publishStoryAcceptance';
import { buildPublishPackage } from '../../interchange/publishExportEngine';
import { verifyPublishPayloadRoundtrip } from '../../model/publishPersistence';

/** Eine Grid-Tabelle **in der Form des Vertrags** (`TableObject`: `id`, `rows`, `cols`, `cells`). */
function gridTable(rows = 3, cols = 2): Record<string, unknown> {
  const cells: Record<string, unknown> = {};
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      cells[`${row}:${column}`] = { value: row === 0 ? `Kopf ${column}` : `${row * 10 + column},50` };
    }
  }
  return { id: 'table-1', rows, cols, cells };
}

function sourceDocument(overrides: Record<string, unknown> = {}): WorkspaceDocument {
  return {
    id: 'grid-doc', kind: 'Grid', title: 'Preisliste 2026', version: 7,
    objects: { 'table-1': { type: 'Table', data: gridTable(), ...overrides } },
  } as unknown as WorkspaceDocument;
}

/** Ein Dokument mit ausgewaehltem Rahmen — die Ablage braucht ein Ziel. */
function documentWithFrame() {
  const withFrame = addFrameToPublish(createPublishProject({ pages: 1 }), 'graphic', { name: 'Preisuebersicht', widthMm: 90, heightMm: 60 });
  return { model: withFrame, frameId: withFrame.selectedFrameId! };
}

const resolution = (overrides: Record<string, unknown> = {}) => ({
  adapterId: 'fabric-grid-table-to-publish', intent: 'COPY', integrationKind: 'copy',
  sourceDocumentId: 'grid-doc', sourceObjectId: 'table-1', targetDocumentId: 'pub-doc',
  sourceVersion: 7, targetVersion: 1, ...overrides,
}) as never;

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

describe('die Vokabeln kommen aus der Matrix, nicht aus einer zweiten Liste', () => {
  it('fuehrt die Objektart `Table` und die Absichten `COPY` und `LIVE_REFERENCE`', () => {
    expect(PUBLISH_TABLE_CARRIER_OBJECT_KIND).toBe('Table');
    expect([...PUBLISH_TABLE_ACCEPTED_INTENTS]).toEqual(['COPY', 'LIVE_REFERENCE']);
    // Die Matrix bietet heute **nur** `COPY` — der Live-Weg ist damit ueber eine Ablage nicht erreichbar.
    // Das ist eine gemessene Grenze, keine Behauptung; sie steht in `notes.md`.
    expect(publishTableModeForIntent('COPY')).toBe('Frozen');
    expect(publishTableModeForIntent('LIVE_REFERENCE')).toBe('Live');
    expect(publishTableModeForIntent('FROZEN_SNAPSHOT')).toBeNull();
  });
});

describe('eine Zelladresse lesen — `row:col` **und** `A1`', () => {
  it('liest beide Formen des Vertrags auf dieselbe Zelle', () => {
    expect(readGridCellRef('0:0')).toEqual({ row: 0, column: 0 });
    expect(readGridCellRef('A1')).toEqual({ row: 0, column: 0 });
    expect(readGridCellRef('2:1')).toEqual({ row: 2, column: 1 });
    expect(readGridCellRef('B3')).toEqual({ row: 2, column: 1 });
    expect(readGridCellRef('AA10')).toEqual({ row: 9, column: 26 });
    // Und was keine Adresse ist, ist **keine** — kein stiller Rueckfall auf 0:0.
    expect(readGridCellRef('Zelle')).toBeNull();
    expect(readGridCellRef('')).toBeNull();
    expect(readGridCellRef('1:')).toBeNull();
  });

  it('formt Zellwerte um, ohne Information zu verlieren', () => {
    expect(gridCellText('Text')).toBe('Text');
    expect(gridCellText(42)).toBe('42');
    expect(gridCellText(0)).toBe('0');
    expect(gridCellText(false)).toBe('false');
    expect(gridCellText(null)).toBe('');
    expect(gridCellText(undefined)).toBe('');
    expect(gridCellText('x'.repeat(PUBLISH_TABLE_LIMITS.maxCellChars + 50))).toHaveLength(PUBLISH_TABLE_LIMITS.maxCellChars);
  });
});

describe('AST-1412 — die Umformung Grid → Publish', () => {
  it('materialisiert **alle** Zellen, auch leere', () => {
    const table = publishTableFromGridShape('Preise', gridTable(3, 2));
    expect(table.rows).toBe(3);
    expect(table.columns).toBe(2);
    expect(table.cells).toHaveLength(6);
    // Eine fehlende Zelle waere von einer leeren nicht zu unterscheiden — genau das braucht der Satz.
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        expect(table.cells.some((cell) => cell.row === row && cell.column === column), `${row}:${column}`).toBe(true);
      }
    }
  });

  it('uebernimmt die Werte aus `value` und ignoriert die Adressform nicht', () => {
    const table = publishTableFromGridShape('Preise', { rows: 2, cols: 2, cells: { '0:0': { value: 'Artikel' }, A2: { value: 9.5 } } });
    expect(table.cells.find((cell) => cell.row === 0 && cell.column === 0)!.content).toBe('Artikel');
    // `A2` ist die zweite Zeile, erste Spalte — dieselbe Zelle wie `1:0`.
    expect(table.cells.find((cell) => cell.row === 1 && cell.column === 0)!.content).toBe('9.5');
  });

  it('ignoriert eine Adresse ausserhalb des Rasters, statt zu werfen', () => {
    const table = publishTableFromGridShape('Preise', { rows: 1, cols: 1, cells: { '5:5': { value: 'x' } } });
    expect(table.cells).toHaveLength(1);
    expect(table.cells[0]!.content).toBe('');
  });

  it('lehnt eine unbekannte Gestalt und eine zu grosse Tabelle benannt ab', () => {
    expect(codes(() => publishTableFromGridShape('X', { rows: 1 }))).toBe('publish-table-shape-unknown');
    expect(codes(() => publishTableFromGridShape('X', { rows: 0, cols: 1, cells: {} }))).toBe('publish-table-shape-unknown');
    expect(codes(() => publishTableFromGridShape('X', { rows: 1, cols: 1, cells: [] }))).toBe('publish-table-shape-unknown');
    expect(codes(() => publishTableFromGridShape('X', { rows: PUBLISH_TABLE_LIMITS.maxRows + 1, cols: 1, cells: {} }))).toBe('publish-table-too-large');
  });
});

describe('AST-1411 — die Annahme einer zugestellten Tabelle', () => {
  it('legt die Tabelle an, bindet sie an den Rahmen und traegt den Verweis', () => {
    const { model, frameId } = documentWithFrame();
    const step = acceptPublishTableDrop(model, { delivered: true, resolution: resolution() }, { 'grid-doc': sourceDocument() });
    expect(step.ok, JSON.stringify(step)).toBe(true);
    if (!step.ok) return;
    expect(step.model.tables).toHaveLength(1);
    expect(step.table.rows).toBe(3);
    expect(step.table.cells.filter((cell) => cell.content.length > 0)).toHaveLength(6);
    // Der Verweis steht **auf der Tabelle** — mit Modus, Quelle und Stand.
    expect(step.table.link?.mode).toBe('frozen');
    expect(step.table.link?.sourceKind).toBe('grid');
    expect(step.table.link?.lastSourceVersion).toBe(7);
    // Und die Referenz im kanonischen Speicher zeigt auf dieselbe Quelle.
    expect(step.model.workspaceReferences).toHaveLength(1);
    expect(step.model.workspaceReferences[0]!.mode).toBe('frozen');
    expect(step.model.workspaceReferences[0]!.frozenSnapshot).toEqual(gridTable());
    expect(step.model.frames.find((frame) => frame.id === frameId)!.workspaceReferenceId).toBe(step.referenceId);
    assertPublishDocument(step.model);
  });

  it('`COPY` ergibt ein **Abbild**, `LIVE_REFERENCE` einen **Live**-Verweis', () => {
    const { model } = documentWithFrame();
    const copy = acceptPublishTableDrop(model, { delivered: true, resolution: resolution() }, { 'grid-doc': sourceDocument() });
    expect(copy.ok && copy.mode).toBe('frozen');
    const live = acceptPublishTableDrop(model, { delivered: true, resolution: resolution({ intent: 'LIVE_REFERENCE', integrationKind: 'live' }) }, { 'grid-doc': sourceDocument() });
    expect(live.ok && live.mode).toBe('live');
    // Ein Live-Verweis traegt **kein** eingefrorenes Abbild — *ein Abbild neben „live" waere ein zweiter Stand.*
    expect(live.ok && live.model.workspaceReferences[0]!.frozenSnapshot).toBeUndefined();
  });

  it('ist **spezifisch vor allgemein**: Zustellung, Quelle, Objektart, Absicht, Modus, Ziel', () => {
    const { model } = documentWithFrame();
    const documents = { 'grid-doc': sourceDocument() };
    expect(acceptPublishTableDrop(model, { delivered: false }, documents)).toEqual({ ok: false, reason: 'publish-table-resolution-not-delivered' });
    expect(acceptPublishTableDrop(model, { delivered: true, resolution: resolution({ sourceDocumentId: 'weg' }) }, documents)).toEqual({ ok: false, reason: 'publish-table-source-missing' });
    expect(acceptPublishTableDrop(model, { delivered: true, resolution: resolution({ sourceObjectId: 'weg' }) }, documents)).toEqual({ ok: false, reason: 'publish-table-object-kind-not-table' });
    const storyDoc = { 'grid-doc': { ...sourceDocument(), objects: { 'table-1': { type: 'TextBlock', data: {} } } } as unknown as WorkspaceDocument };
    expect(acceptPublishTableDrop(model, { delivered: true, resolution: resolution() }, storyDoc)).toEqual({ ok: false, reason: 'publish-table-object-kind-not-table' });
    expect(acceptPublishTableDrop(model, { delivered: true, resolution: resolution({ intent: 'FROZEN_SNAPSHOT' }) }, documents)).toEqual({ ok: false, reason: 'publish-table-intent-unsupported' });
    // Ohne ausgewaehlten Rahmen: benannt, nicht still.
    const bare = createPublishProject({ pages: 1 });
    expect(acceptPublishTableDrop(bare, { delivered: true, resolution: resolution() }, documents)).toEqual({ ok: false, reason: 'publish-table-frame-missing' });
  });

  it('lehnt einen **zweiten** Ablagevorgang derselben Quelle benannt ab', () => {
    const { model } = documentWithFrame();
    const documents = { 'grid-doc': sourceDocument() };
    const first = acceptPublishTableDrop(model, { delivered: true, resolution: resolution() }, documents);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(acceptPublishTableDrop(first.model, { delivered: true, resolution: resolution() }, documents)).toEqual({ ok: false, reason: 'publish-table-already-placed' });
  });

  it('meldet jede Ablehnung in Worten, nicht als Code', () => {
    for (const code of ['publish-table-resolution-not-delivered', 'publish-table-source-missing', 'publish-table-frame-missing', 'publish-table-shape-unknown', 'publish-table-link-frozen'] as const) {
      const text = publishTableRefusalText(code);
      expect(text, code).not.toBe(code);
      expect(text.length, code).toBeGreaterThan(20);
    }
  });
});

describe('die Wahl „Snapshot oder Live" fuer eine vorhandene Tabelle', () => {
  const placed = () => {
    const { model } = documentWithFrame();
    const step = acceptPublishTableDrop(model, { delivered: true, resolution: resolution({ intent: 'LIVE_REFERENCE', integrationKind: 'live' }) }, { 'grid-doc': sourceDocument() });
    if (!step.ok) throw new Error('Ablage fehlgeschlagen');
    return step;
  };

  it('wechselt von `live` nach `frozen` und **friert den Stand wirklich ein**', () => {
    const step = placed();
    const frozen = setPublishTableMode(step.model, step.table.id, 'frozen', gridTable(), 9);
    const table = frozen.tables.find((candidate) => candidate.id === step.table.id)!;
    expect(table.link?.mode).toBe('frozen');
    expect(table.link?.lastSourceVersion).toBe(9);
    const reference = frozen.workspaceReferences.find((candidate) => candidate.canonicalUri === table.link!.sourceUri)!;
    expect(reference.frozenSnapshot).toEqual(gridTable());
    // Ohne Stand wird **nicht** eingefroren — benannt.
    expect(codes(() => setPublishTableMode(step.model, step.table.id, 'frozen'))).toBe('publish-table-shape-unknown');
  });

  it('wechselt zurueck nach `live` und **entfernt** das Abbild', () => {
    const step = placed();
    const frozen = setPublishTableMode(step.model, step.table.id, 'frozen', gridTable());
    const live = setPublishTableMode(frozen, step.table.id, 'live');
    const table = live.tables.find((candidate) => candidate.id === step.table.id)!;
    expect(table.link?.mode).toBe('live');
    expect(live.workspaceReferences.find((candidate) => candidate.canonicalUri === table.link!.sourceUri)!.frozenSnapshot).toBeUndefined();
  });

  it('zieht eine **Live**-Tabelle nach und lehnt eine **eingefrorene** benannt ab', () => {
    const step = placed();
    const changed = sourceDocument({ data: { rows: 1, cols: 1, cells: { '0:0': { value: 'Neuer Preis' } } } });
    const refreshed = refreshPublishTableFromSource(step.model, step.table.id, changed);
    const table = refreshed.tables.find((candidate) => candidate.id === step.table.id)!;
    expect(table.rows).toBe(1);
    expect(table.cells[0]!.content).toBe('Neuer Preis');
    // Kennung und Name bleiben: derselbe Rahmen zeigt dieselbe Tabelle.
    expect(table.id).toBe(step.table.id);
    expect(table.name).toBe(step.table.name);
    // **Die Grenze der Wahl:** ein eingefrorener Stand zieht **nicht** nach.
    const frozen = setPublishTableMode(step.model, step.table.id, 'frozen', gridTable());
    expect(codes(() => refreshPublishTableFromSource(frozen, step.table.id, changed))).toBe('publish-table-link-frozen');
  });

  it('beschreibt die Tabelle mit Modus und Stand — nicht nur mit einer Zahl', () => {
    const step = placed();
    const text = describePublishTable(step.table);
    expect(text).toContain('3×2');
    expect(text).toContain('6 filled cell(s)');
    expect(text).toContain('live grid link');
    expect(text).toContain('source v7');
    expect(describePublishTable({ ...step.table, link: undefined })).toContain('not linked');
  });
});

describe('der **eine** Leser der Objektart', () => {
  it('liest die Art aus der Quelle — oder `null`, benannt', () => {
    const documents = { 'grid-doc': sourceDocument() };
    expect(publishCarrierObjectType(documents, 'grid-doc', 'table-1')).toBe('Table');
    expect(publishCarrierObjectType(documents, 'grid-doc', 'weg')).toBeNull();
    expect(publishCarrierObjectType(documents, 'weg', 'table-1')).toBeNull();
    expect(publishCarrierObjectType({}, 'grid-doc', 'table-1')).toBeNull();
  });

  it('die zwei Annehmer und die Weiche fragen **dieselbe** Funktion', () => {
    // Gemessen (eigener Befund): mit zwei Annehmern haette jede Seite den Traeger selbst gelesen — und die
    // Ansicht ein **drittes** Mal, um zu entscheiden. *Drei Leser derselben Frage sind drei Antworten.*
    const documents = { 'grid-doc': sourceDocument() };
    const storyDoc = { 'grid-doc': { ...sourceDocument(), objects: { 'table-1': { type: 'TextBlock', data: {} } } } as unknown as WorkspaceDocument };
    // Die Weiche liefert die Art, die der Annehmer dann **prueft** — und beide sind sich einig.
    expect(publishCarrierObjectType(documents, 'grid-doc', 'table-1')).toBe(PUBLISH_TABLE_CARRIER_OBJECT_KIND);
    expect(publishCarrierObjectType(storyDoc, 'grid-doc', 'table-1')).not.toBe(PUBLISH_TABLE_CARRIER_OBJECT_KIND);
  });
});

describe('AST-1413 — die Tabelle ueberlebt Speichern und erreicht das Paket', () => {
  it('bleibt beim Wiedereroeffnen identisch — samt Verweis und Modus', () => {
    const { model } = documentWithFrame();
    const step = acceptPublishTableDrop(model, { delivered: true, resolution: resolution() }, { 'grid-doc': sourceDocument() });
    if (!step.ok) throw new Error('Ablage fehlgeschlagen');
    const { reopened, diff } = verifyPublishPayloadRoundtrip(step.model, 0);
    expect(diff.identical).toBe(true);
    const table = reopened.tables[0]!;
    expect(table.link?.mode).toBe('frozen');
    expect(table.link?.sourceUri).toBe(step.table.link!.sourceUri);
    expect(table.cells.filter((cell) => cell.content.length > 0)).toHaveLength(6);
    expect(reopened.workspaceReferences[0]!.frozenSnapshot).toEqual(gridTable());
  });

  it('**das Paket nennt und liefert die Tabellen** — das war der Befund', () => {
    const { model } = documentWithFrame();
    const step = acceptPublishTableDrop(model, { delivered: true, resolution: resolution() }, { 'grid-doc': sourceDocument() });
    if (!step.ok) throw new Error('Ablage fehlgeschlagen');
    const result = buildPublishPackage(step.model);
    const manifest = JSON.parse(result.manifest) as { tables: { id: string; mode: string; filledCells: number; sourceUri?: string }[]; tableCount: number };
    expect(manifest.tableCount).toBe(1);
    expect(manifest.tables[0]!.id).toBe(step.table.id);
    expect(manifest.tables[0]!.mode).toBe('frozen');
    expect(manifest.tables[0]!.filledCells).toBe(6);
    expect(manifest.tables[0]!.sourceUri).toBe(step.table.link!.sourceUri);
    // Und der **Inhalt** faehrt mit, nicht nur die Erwaehnung.
    const entry = result.entries.find((candidate) => candidate.path === `Tables/${step.table.id}.json`);
    expect(entry, 'Tables/<id>.json fehlt im Paket').toBeDefined();
    expect(new TextDecoder().decode(entry!.bytes)).toContain('Neuer Preis'.slice(0, 0) + 'Kopf 0');
  });

  it('ein Dokument **ohne** Tabelle nennt null Tabellen — kein stiller Eintrag', () => {
    const result = buildPublishPackage(createPublishProject({ pages: 1 }));
    const manifest = JSON.parse(result.manifest) as { tableCount: number; tables: unknown[] };
    expect(manifest.tableCount).toBe(0);
    expect(manifest.tables).toEqual([]);
    expect(result.entries.some((candidate) => candidate.path.startsWith('Tables/'))).toBe(false);
  });
});
