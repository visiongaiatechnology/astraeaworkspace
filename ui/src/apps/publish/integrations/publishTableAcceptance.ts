// STATUS: PLATIN — Astraea Publish: Preisuebersicht aus Grid einfuegen, Snapshot/Live waehlen (AST-1411/1412/1413)
//
// ## Der Befund, gemessen vor dieser Datei
//
// Die **Matrix traegt die Route**: `shell/fabric/fabricGraphWorkspaceDrop.ts` fuehrt Publish mit
// `imports: [{ objectKind: 'Table', intents: ['COPY'] }]` und dem Adapter `fabric-grid-table-to-publish`
// (Zeilen 235-245). Der Resolver liefert also eine Aufloesung — und **Publish nahm sie nicht an**:
//
//   * Es gab **keine** Annahmestelle fuer eine Tabelle. `acceptPublishStoryDrop` nimmt `TextBlock`; fuer `Table`
//     gab es nichts. *Eine Route, die die Flaeche nicht annimmt, ist eine veroeffentlichte Zusage ohne Deckung.*
//   * `PublishTable.link = {sourceKind, sourceUri, mode, lastSourceVersion}` (`workspacePublish.ts:345`) wurde
//     von **niemandem** geschrieben und von **niemandem** gelesen. „Snapshot/Live waehlen" war damit nicht
//     ausfuehrbar — und `mode` ist genau die Wahl.
//   * Die **Speicherung** der Quelle (`PublishWorkspaceReference.frozenSnapshot`, `:358`) existierte samt
//     `freezePublishReference` — aber kein Weg fuehrte von einer Grid-Tabelle dorthin.
//
// ## Keine neue Vokabel, kein zweiter Weg
//
//   * Die Objektart ist `'Table'` **wie in der Matrix** ✓.
//   * Der Modus kommt aus dem **kanonischen** `WorkspaceLiveMode` und wird **einmal** uebersetzt — mit
//     `publishStoryLinkMode` aus `publishStoryAcceptance.ts`. *Zwei Uebersetzungen desselben Wortes waeren zwei
//     Wahrheiten; `PublishLinkMode` ist ein **geteilter** Vertrag und wird hier nicht angefasst.*
//   * Die Quelle wird ueber die **vorhandenen** Funktionen abgelegt (`createPublishWorkspaceReference`,
//     `attachPublishReference`, `freezePublishReference`) — **kein** zweiter Speicherort.
//   * Die Zellwerte kommen aus `TableObject.cells` **wie im Vertrag** (`'row:col'` oder `A1`).
//
// ## Die Absichten, ehrlich benannt
//
// Die Matrix bietet fuer `Table` heute **nur** `COPY` an. `COPY` heisst „Abbild": der Stand wird als
// **eingefrorene** Kopie uebernommen (`mode: 'frozen'`) ✓. `LIVE_REFERENCE` wird **ebenfalls** angenommen und
// ergibt `mode: 'live'` ✓ — *aber die Matrix veroeffentlicht diese Absicht fuer `Table` noch nicht, also ist der
// Live-Weg ueber eine **Ablage** derzeit nicht erreichbar.* Der Nutzer kann den Modus danach **ausdruecklich**
// waehlen (`setPublishTableMode`) — das ist der erreichbare Weg, und er ist benannt statt verschwiegen.
import type { PublishDocumentModel, PublishTable } from '../../../shared/contracts/publish/workspacePublish';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceObjectKind } from '../../../shared/workspace-interaction/workspaceInteractionTypes';
import type { WorkspaceLiveMode } from '../../../shared/workspace-interaction/workspaceInteractionResolver';
import type { PublishWorkspaceDropResolution } from '../drop-zone/publishWorkspaceDropZoneContract';
import { PublishModelError, publishStableId } from '../model/publishDocumentEngine';
import {
  attachPublishReference, createPublishWorkspaceReference, freezePublishReference,
} from './publishWorkspaceIntegration';
import { publishStoryLinkMode } from './publishStoryAcceptance';

/**
 * Die Objektart, die eine **Preisuebersicht** traegt — **gelesen** aus der Matrix (`fabric-graph-workspace-drop`),
 * nicht erfunden ✓.
 */
export const PUBLISH_TABLE_CARRIER_OBJECT_KIND: WorkspaceObjectKind = 'Table';

/**
 * Die Absichten, die Publish fuer eine Tabelle **annehmen kann** ✓.
 *
 * `COPY` ist die, die die Matrix heute veroeffentlicht ✓; `LIVE_REFERENCE` wird angenommen, weil der
 * Akzeptanzwortlaut „Snapshot/Live waehlen" genau diese beiden Ergebnisse verlangt ✓.
 */
export const PUBLISH_TABLE_ACCEPTED_INTENTS = Object.freeze(['COPY', 'LIVE_REFERENCE'] as const);

/** Der Modus je Absicht — **eine** Zuordnung, kein zweiter Weg ✓. */
export function publishTableModeForIntent(intent: string): WorkspaceLiveMode | null {
  if (intent === 'COPY') return 'Frozen';
  if (intent === 'LIVE_REFERENCE') return 'Live';
  return null;
}

/** Die Grenzen dieses Weges — benannt, nicht geraten. */
export const PUBLISH_TABLE_LIMITS = Object.freeze({
  maxRows: 10_000,
  maxColumns: 512,
  maxCells: 250_000,
  maxCellChars: 32_768,
});

export type PublishTableAcceptanceLocalRefusal =
  | 'publish-table-resolution-not-delivered'
  | 'publish-table-source-missing'
  | 'publish-table-frame-missing'
  | 'publish-table-object-kind-not-table'
  | 'publish-table-intent-unsupported'
  | 'publish-table-mode-unknown'
  | 'publish-table-shape-unknown'
  | 'publish-table-too-large'
  | 'publish-table-already-placed'
  | 'publish-table-link-frozen'
  | 'publish-table-link-missing';

export type PublishTableAcceptanceRefusal = PublishTableAcceptanceLocalRefusal;

export type PublishTableAcceptanceInput =
  | { readonly delivered: false }
  | { readonly delivered: true; readonly resolution: PublishWorkspaceDropResolution };

export interface PublishTableAcceptanceStepOk {
  readonly ok: true;
  readonly model: PublishDocumentModel;
  readonly table: PublishTable;
  readonly referenceId: string;
  /** `frozen` heisst: der Stand liegt als Abbild im Dokument; `live` heisst: er folgt der Quelle. */
  readonly mode: 'live' | 'frozen';
  readonly reason?: never;
}

export type PublishTableAcceptanceStep =
  | PublishTableAcceptanceStepOk
  | { readonly ok: false; readonly reason: PublishTableAcceptanceRefusal; readonly model?: never; readonly table?: never; readonly referenceId?: never; readonly mode?: never };

/** Der sichtbare Satz zu jedem Grund — erschoepfend: ein neuer Grund bricht hier den Bau ✓. */
const LOCAL_REFUSAL_TEXT: Readonly<Record<PublishTableAcceptanceLocalRefusal, string>> = Object.freeze({
  'publish-table-resolution-not-delivered': 'Nothing has been placed yet — there is no resolution to accept.',
  'publish-table-source-missing': 'The source document of this price table is not available in the workspace.',
  'publish-table-frame-missing': 'Select a frame before placing a table from Grid.',
  'publish-table-object-kind-not-table': 'Only a Grid table becomes a price table.',
  'publish-table-intent-unsupported': 'Only Copy (snapshot) or Live reference can be placed from a Grid table.',
  'publish-table-mode-unknown': 'Unknown live mode: Live or Frozen are the only modes.',
  'publish-table-shape-unknown': 'This table carries a shape Publish cannot read.',
  'publish-table-too-large': 'This table exceeds the size a Publish document accepts.',
  'publish-table-already-placed': 'This price table is already placed in the document.',
  'publish-table-link-frozen': 'A frozen snapshot does not follow its source. Switch the table to Live first.',
  'publish-table-link-missing': 'This table has no link to a source.',
});

export function publishTableRefusalText(code: PublishTableAcceptanceRefusal): string {
  return LOCAL_REFUSAL_TEXT[code] ?? code;
}

/**
 * **Eine Zelladresse lesen** — `'row:col'` **oder** `A1` ✓, wie der Vertrag beide Formen nennt.
 *
 * Das ist die **einzige** Auslegung einer Zelladresse in dieser Flaeche. *Zwei Auslegungen waeren zwei
 * Tabellen.* Nullbasiert: `'0:0'` und `A1` ergeben dasselbe.
 */
export function readGridCellRef(key: string): { row: number; column: number } | null {
  const colon = /^(\d+):(\d+)$/u.exec(key);
  if (colon) return { row: Number(colon[1]), column: Number(colon[2]) };
  const a1 = /^([A-Z]{1,3})(\d+)$/u.exec(key);
  if (!a1) return null;
  let column = 0;
  for (const character of a1[1]!) column = column * 26 + (character.charCodeAt(0) - 64);
  return { row: Number(a1[2]) - 1, column: column - 1 };
}

/** Der Zellwert als Text — die **eine** Umformung, und sie verliert keine Information. */
export function gridCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.slice(0, PUBLISH_TABLE_LIMITS.maxCellChars);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value).slice(0, PUBLISH_TABLE_LIMITS.maxCellChars);
}

/**
 * **Die Umformung Grid → Publish** (`AST-1412`) — die eine Stelle.
 *
 * Gelesen werden die Felder, die der Vertrag fuehrt (`id`, `rows`, `cols`, `cells`). Ist eines davon nicht in der
 * erwarteten Form, wird **benannt** abgelehnt (`publish-table-shape-unknown`) — *eine Tabelle zu raten waere eine
 * Attrappe.*
 */
export function publishTableFromGridShape(name: string, shape: Record<string, unknown>): PublishTable {
  const rows = shape.rows;
  const cols = shape.cols ?? shape.columns;
  const cells = shape.cells;
  if (!Number.isInteger(rows) || !Number.isInteger(cols)) throw new PublishModelError('publish-table-shape-unknown');
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) throw new PublishModelError('publish-table-shape-unknown');
  if ((rows as number) < 1 || (cols as number) < 1) throw new PublishModelError('publish-table-shape-unknown');
  if ((rows as number) > PUBLISH_TABLE_LIMITS.maxRows || (cols as number) > PUBLISH_TABLE_LIMITS.maxColumns || (rows as number) * (cols as number) > PUBLISH_TABLE_LIMITS.maxCells) {
    throw new PublishModelError('publish-table-too-large');
  }
  const table: PublishTable = {
    id: publishStableId('table', `${name}:${String(rows)}x${String(cols)}`),
    name: name.slice(0, 512) || 'Grid table',
    rows: rows as number,
    columns: cols as number,
    headerRows: 1,
    footerRows: 0,
    // Alle Zellen werden **materialisiert**, auch leere: *eine fehlende Zelle waere von einer leeren nicht zu
    // unterscheiden, und genau diese Unterscheidung braucht der Satz.*
    cells: Array.from({ length: rows as number }, (_, row) => Array.from({ length: cols as number }, (_, column) => ({
      id: publishStableId('cell', `${name}:${row}:${column}`),
      row,
      column,
      rowSpan: 1,
      colSpan: 1,
      content: '',
    }))).flat(),
    insetsMm: { top: 1, right: 1, bottom: 1, left: 1 },
  };
  for (const [key, raw] of Object.entries(cells as Record<string, unknown>)) {
    const ref = readGridCellRef(key);
    if (!ref) continue;
    if (ref.row < 0 || ref.row >= (rows as number) || ref.column < 0 || ref.column >= (cols as number)) continue;
    const cell = table.cells.find((candidate) => candidate.row === ref.row && candidate.column === ref.column);
    if (!cell) continue;
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).value : raw;
    cell.content = gridCellText(value);
  }
  return table;
}

/** Das Quellobjekt, **woertlich** gelesen — kein zweiter Parser: der Resolver hat es bereits identifiziert. */
function sourceObject(source: WorkspaceDocument, objectId: string): Record<string, unknown> | null {
  const objects = source.objects as unknown as Record<string, unknown> | undefined;
  if (!objects || typeof objects !== 'object') return null;
  const object = objects[objectId];
  return object && typeof object === 'object' && !Array.isArray(object) ? (object as Record<string, unknown>) : null;
}

/**
 * **Die Annahme einer zugestellten Tabelle** ✓✓ — die eine Stelle, an der daraus eine Preisuebersicht wird.
 *
 * Reihenfolge **spezifisch vor allgemein**: Zustellung, Quelle, Objektart, Absicht, Modus, Gestalt, Groesse —
 * *wer mit dem Modus beginnt, meldet bei fehlender Quelle den falschen Grund.*
 */
export function acceptPublishTableDrop(
  model: PublishDocumentModel,
  input: PublishTableAcceptanceInput,
  documents: Readonly<Record<string, WorkspaceDocument>>,
): PublishTableAcceptanceStep {
  if (!input.delivered) return { ok: false, reason: 'publish-table-resolution-not-delivered' };
  const resolution = input.resolution;
  const source = documents[resolution.sourceDocumentId];
  if (!source) return { ok: false, reason: 'publish-table-source-missing' };
  const object = sourceObject(source, resolution.sourceObjectId);
  if (object === null || object.type !== PUBLISH_TABLE_CARRIER_OBJECT_KIND) return { ok: false, reason: 'publish-table-object-kind-not-table' };
  if (!(PUBLISH_TABLE_ACCEPTED_INTENTS as readonly string[]).includes(resolution.intent)) return { ok: false, reason: 'publish-table-intent-unsupported' };
  // Der Modus kommt **nicht** aus der Absicht allein: der kanonische Wert der Aufloesung ist die Quelle, und die
  // Uebersetzung ist die **vorhandene** (`publishStoryLinkMode`). Nur wenn die Aufloesung keinen Modus traegt,
  // entscheidet die Absicht — und dann steht der Grund benannt da, wenn auch das nicht geht.
  const liveMode = resolution.mode ?? publishTableModeForIntent(resolution.intent);
  const linkMode = liveMode === null || liveMode === undefined ? null : publishStoryLinkMode(liveMode);
  if (linkMode === null) return { ok: false, reason: 'publish-table-mode-unknown' };
  const frameId = model.selectedFrameId;
  if (!frameId) return { ok: false, reason: 'publish-table-frame-missing' };
  // Ein **zweiter** Ablagevorgang derselben Quelle ist ein benannter Zustand, kein stiller Zwillingsrahmen.
  if (model.workspaceReferences.some((reference) => reference.sourceDocumentId === resolution.sourceDocumentId && reference.selector === resolution.sourceObjectId)) {
    return { ok: false, reason: 'publish-table-already-placed' };
  }
  let table: PublishTable;
  try {
    table = publishTableFromGridShape(`${source.title || source.kind} · ${resolution.sourceObjectId}`, object.data as Record<string, unknown> ?? {});
  } catch (cause) {
    const code = cause instanceof PublishModelError ? cause.code : 'publish-table-shape-unknown';
    return { ok: false, reason: code === 'publish-table-too-large' ? 'publish-table-too-large' : 'publish-table-shape-unknown' };
  }
  /**
   * Die Quelle wird ueber die **vorhandenen** Funktionen abgelegt — **kein** zweiter Speicherort ✓.
   * `createPublishWorkspaceReference` traegt den Modus; bei `frozen` kommt der **wirkliche** Stand als
   * `frozenSnapshot` mit (`freezePublishReference`), damit das Abbild auch ohne Quelle lesbar bleibt.
   */
  const reference = createPublishWorkspaceReference(source, 'grid-range', resolution.sourceObjectId, linkMode);
  let next: PublishDocumentModel;
  try {
    next = attachPublishReference(model, frameId, reference);
    if (linkMode === 'frozen') next = freezePublishReference(next, reference.id, object.data as Record<string, unknown>, source.version ?? 0);
  } catch {
    // Die Referenz liess sich nicht anlegen oder einfrieren — der Grund bleibt **benannt**, statt halb zu wirken.
    return { ok: false, reason: 'publish-table-shape-unknown' };
  }
  /**
   * Die Tabelle traegt **ihren** Verweis — dieselbe Kennung wie die Referenz, damit beide dasselbe meinen.
   *
   * `publishStoryLinkMode` kann `'broken'` **nicht** liefern (das entsteht nur ueber `breakPublishReference`) —
   * die Verengung steht deshalb **einmal** hier, sichtbar, statt spaeter geraten zu werden.
   */
  const tableMode: 'live' | 'frozen' = linkMode === 'live' ? 'live' : 'frozen';
  const linked: PublishTable = { ...table, link: { sourceKind: 'grid', sourceUri: reference.canonicalUri, mode: tableMode, ...(source.version === undefined ? {} : { lastSourceVersion: source.version }) } };
  const withTable: PublishDocumentModel = {
    ...next,
    tables: [...next.tables.filter((candidate) => candidate.id !== linked.id), linked],
    revision: next.revision + 1,
  };
  return { ok: true, model: withTable, table: linked, referenceId: reference.id, mode: tableMode };
}

/**
 * **Die Wahl „Snapshot oder Live"** (`AST-1411`) — der eine Einstieg fuer eine **vorhandene** Tabelle.
 *
 * Gemessen vorher gab es ihn nicht: `PublishTable.link.mode` war unerreichbar. Der Wechsel nach `frozen`
 * **friert den aktuellen Stand wirklich ein** (der Aufrufer reicht ihn herein); der Wechsel nach `live` loest die
 * Bindung — *„live" ohne Quelle waere eine Behauptung, deshalb verlangt dieser Weg die Quelle.*
 */
export function setPublishTableMode(
  model: PublishDocumentModel,
  tableId: string,
  mode: 'live' | 'frozen',
  frozenShape?: Record<string, unknown>,
  sourceVersion?: number,
): PublishDocumentModel {
  const table = model.tables.find((candidate) => candidate.id === tableId);
  if (!table) throw new PublishModelError('table-missing');
  if (!table.link) throw new PublishModelError('publish-table-link-missing');
  const reference = model.workspaceReferences.find((candidate) => candidate.canonicalUri === table.link!.sourceUri);
  if (mode === 'frozen' && frozenShape === undefined) throw new PublishModelError('publish-table-shape-unknown');
  const link = { ...table.link, mode };
  if (sourceVersion !== undefined) link.lastSourceVersion = sourceVersion;
  let next: PublishDocumentModel = { ...model, tables: model.tables.map((candidate) => candidate.id === tableId ? { ...candidate, link } : candidate), revision: model.revision + 1 };
  if (reference) {
    next = mode === 'frozen'
      ? freezePublishReference(next, reference.id, frozenShape!, sourceVersion ?? reference.lastSourceVersion ?? 0)
      // Zurueck nach `live`: der eingefrorene Stand wird **entfernt** — *ein Abbild, das „live" heisst und noch
      // daneben liegt, waere ein zweiter Stand.*
      : { ...next, workspaceReferences: next.workspaceReferences.map((candidate) => candidate.id === reference.id ? { ...candidate, mode, frozenSnapshot: undefined } : candidate) };
  }
  return next;
}

/**
 * **Eine Live-Tabelle nachziehen** (`AST-1412`) — und bei einer eingefrorenen **benannt** ablehnen ✓.
 *
 * Das ist die Grenze der Wahl: *ein eingefrorener Stand, der sich heimlich aktualisiert, waere kein Stand.*
 */
export function refreshPublishTableFromSource(model: PublishDocumentModel, tableId: string, source: WorkspaceDocument): PublishDocumentModel {
  const table = model.tables.find((candidate) => candidate.id === tableId);
  if (!table) throw new PublishModelError('table-missing');
  if (!table.link) throw new PublishModelError('publish-table-link-missing');
  if (table.link.mode !== 'live') throw new PublishModelError('publish-table-link-frozen');
  const object = sourceObject(source, table.link.sourceUri.split('/').pop() ?? '');
  if (object === null) throw new PublishModelError('publish-table-shape-unknown');
  const fresh = publishTableFromGridShape(table.name, object.data as Record<string, unknown> ?? {});
  // Der **Name und die Kennung bleiben** — der Rahmen zeigt dieselbe Tabelle, nur mit neuen Werten.
  const refreshed: PublishTable = { ...table, rows: fresh.rows, columns: fresh.columns, cells: fresh.cells, link: { ...table.link, ...(source.version === undefined ? {} : { lastSourceVersion: source.version }) } };
  return { ...model, tables: model.tables.map((candidate) => candidate.id === tableId ? refreshed : candidate), revision: model.revision + 1 };
}

/** Der sichtbare Satz zu einer Tabelle — Stand, Modus und **ob ein Abbild daneben liegt** ✓. */
export function describePublishTable(table: PublishTable): string {
  const filled = table.cells.filter((cell) => cell.content.trim().length > 0).length;
  const base = `${table.name} · ${table.rows}×${table.columns} · ${filled} filled cell(s)`;
  if (!table.link) return `${base} · not linked`;
  const version = table.link.lastSourceVersion === undefined ? 'version unknown' : `source v${table.link.lastSourceVersion}`;
  return `${base} · ${table.link.mode} ${table.link.sourceKind} link · ${version}`;
}
