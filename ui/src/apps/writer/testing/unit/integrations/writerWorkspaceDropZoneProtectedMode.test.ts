// STATUS: PLATIN — W-443 (P1): der protected mode — die Entscheidung liegt auf der Typenliste
//
// ## Der Befund, gemessen statt behauptet
//
// Der Whiteboard-Agent hat gemeldet ✓ (und der Bericht hat recht ✓): `useWriterWorkspaceDropZone` entschied in
// `dragenter`/`dragover` auf dem **Träger** ✓ — `getData(...)` liefert dort im *protected mode* aber `''` ✓.
// Der Handler kehrte deshalb **vor** `preventDefault()` zurück ✓, der Browser gab **kein** `drop` ✓, und die
// Zone war für echte Züge **unerreichbar** ✗.
//
// ## Was hier geprüft wird ✓ — und was nicht ✗
//
// Geprüft ist die **Entscheidung** ✓: dass die **Typenliste** den Träger ankündigt, wo der Inhalt leer ist ✓,
// dass fremde Träger **fail-closed** abgelehnt werden ✓, und dass ohne lesbaren Träger **nichts entschieden**
// wird ✓ (nur der leere Zustand `open` ✓), während der `drop`-Pfad ihn nachholt ✓.
//
// **`NOT_TESTED` bleibt der protected mode selbst** ✗: dass ein Browser `getData` während `dragover`
// tatsächlich leer lässt ✓ und `types` gefüllt ✓, ist **spezifiziert**, aber in dieser Umgebung (headless Node,
// kein Browser) **nicht ausführbar** ✓. *Der Fix ist vor einer echten Abnahme mit einem echten Zug zu belegen*
// ✓ — hier steht die Entscheidung, nicht die Geste ✓.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../../shared/workspace-interaction';
import {
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
  createFabricWorkspaceObjectDragPayload,
} from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  createWriterWorkspaceDropZone,
  dropWriterWorkspaceDropZone,
  isWriterWorkspaceDropZoneVisible,
  openWriterWorkspaceDropZone,
  readWriterWorkspaceTransfer,
  revealWriterWorkspaceDropZone,
  writerWorkspaceDropZoneCarriesTransfer,
} from '../../../integrations/workspace-drop/writerWorkspaceDropZone';
import type { WriterWorkspaceDataTransferLike } from '../../../integrations/workspace-drop/writerWorkspaceDropZone';

const source: WorkspaceDocument = {
  schema_version: 2,
  id: 'grid-source',
  title: 'Forecast',
  kind: 'Grid',
  created_at: 1,
  modified_at: 1,
  version: 3,
  theme_id: 'cosmic-obsidian',
  root_object_ids: ['table-forecast'],
  objects: {
    'table-forecast': {
      type: 'Table',
      data: { id: 'table-forecast', rows: 1, cols: 1, cells: { A1: { value: 'private-cell' } } },
    },
  },
};

const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'writer-target',
  title: 'Report',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 4,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const documents: Readonly<Record<string, WorkspaceDocument>> = { [source.id]: source, [target.id]: target };
const context = { targetDocumentId: target.id, documents } as const;

const table = source.objects['table-forecast'];
if (!table) throw new Error('Fixture-Tabelle fehlt');
const twoIntentPayload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
const oneIntentPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

/** **Der protected mode, wie er sich dieser Schicht zeigt** ✓: Typenliste gefüllt ✓, Inhalt leer ✓. */
const protectedTransfer: WriterWorkspaceDataTransferLike = {
  types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME],
  getData: () => '',
};

const carries = (value: WriterWorkspaceDataTransferLike) => writerWorkspaceDropZoneCarriesTransfer(value);

describe('W-443 — die Zone entscheidet auf der Typenliste, nicht auf dem Träger', () => {
  it('kündigt den Träger an, wo der Inhalt leer ist — die alte Entscheidung war hier falsch', () => {
    // Genau die Messung des Befunds: der Inhalt ist leer …
    expect(readWriterWorkspaceTransfer(protectedTransfer)).toEqual({ ok: false, reason: 'drop-zone-transfer-missing' });
    // … und die Typenliste sagt trotzdem, dass dieser Zug **uns** gilt. Also muss `preventDefault` fallen.
    expect(carries(protectedTransfer)).toBe(true);
  });

  it('lehnt fremde Träger fail-closed ab', () => {
    expect(carries({ types: ['text/plain'] })).toBe(false);
    expect(carries({ types: [] })).toBe(false);
    expect(carries({ types: null })).toBe(false);
    expect(carries({})).toBe(false);
    expect(carries({ types: 5 })).toBe(false);
    // Eine Zeichenkette ist **keine** Typenliste — sie wird nicht buchstabenweise gelesen.
    expect(carries({ types: FABRIC_WORKSPACE_OBJECT_DRAG_MIME })).toBe(false);
  });

  it('bleibt bei fehlender Ablagefläche fail-closed', () => {
    expect(writerWorkspaceDropZoneCarriesTransfer(null)).toBe(false);
    expect(writerWorkspaceDropZoneCarriesTransfer(undefined)).toBe(false);
  });

  it('liest auch eine array-artige Typenliste (DOMStringList)', () => {
    const listLike = { types: { length: 1, 0: FABRIC_WORKSPACE_OBJECT_DRAG_MIME } };
    expect(carries(listLike)).toBe(true);
    expect(carries({ types: { length: 0 } })).toBe(false);
  });
});

describe('W-443 — ohne lesbaren Träger wird nichts entschieden', () => {
  it('zeigt das leere Ziel sichtbar an, ohne Urteil und ohne Vorschau', () => {
    const step = revealWriterWorkspaceDropZone(createWriterWorkspaceDropZone(target.id), context);
    expect(step.ok).toBe(true);
    expect(step.state.phase).toBe('open');
    expect(step.state.acceptance).toBe('unknown');
    expect(step.state.preview).toBeNull();
    expect(step.state.code).toBeNull();
    expect(step.state.choices).toEqual([]);
    expect(isWriterWorkspaceDropZoneVisible(step.state)).toBe(true);
  });

  it('stuft ein bereits gezeigtes Angebot nicht zurück', () => {
    const offered = openWriterWorkspaceDropZone(createWriterWorkspaceDropZone(target.id), { ...context, payload: twoIntentPayload }).state;
    expect(offered.phase).toBe('choice');
    const revealed = revealWriterWorkspaceDropZone(offered, context);
    expect(revealed.state.phase).toBe('choice');
    expect(revealed.state).toBe(offered);
  });

  it('holt den Träger bei der Ablage nach und stellt dann über die Matrix zu', () => {
    const revealed = revealWriterWorkspaceDropZone(createWriterWorkspaceDropZone(target.id), context).state;
    expect(revealed.phase).toBe('open');
    const dropped = dropWriterWorkspaceDropZone(revealed, { ...context, payload: oneIntentPayload });
    expect(dropped.ok).toBe(true);
    expect(dropped.state.phase).toBe('resolved');
    expect(dropped.state.resolution?.adapterId).toBe('fabric-grid-table-to-writer');
    expect(dropped.state.resolution?.intent).toBe('COPY');
    expect(dropped.state.resolution?.sourceVersion).toBe(3);
    expect(dropped.state.resolution?.targetVersion).toBe(4);
  });
});
