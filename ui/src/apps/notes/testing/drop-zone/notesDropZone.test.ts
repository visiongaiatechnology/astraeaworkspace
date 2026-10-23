// STATUS: PLATIN — Integration & Release, **Paket 12**: Beweise für die Notes-Ablagezone
//
// Was hier **wirklich** geprüft wird: das Urteil **aus Paket 6** (nicht ein eigenes), der gelesene Träger **durch
// den einen Parser** (Paket 7), die Zustellung **durch die vorhandene Matrix und den vorhandenen Resolver**
// (Paket 4), die **zwei benannten Flächen** (Leinwand und Seitenliste) in **einer** Maschine, der Tastatur-Weg als
// **dieselbe** Zustellung ohne Überfahren, die Fail-closed-Gründe, die Touch-Entscheidung — und das **Markup**
// (`NotesWorkspaceDropZoneOverlay.render.test.tsx`).
//
// Was hier **nicht** geprüft werden kann und deshalb `NOT_TESTED` bleibt: das **Binden** der Zeiger-, Ablage- und
// Tastenereignisse (`useNotesWorkspaceDropZone`), das **Schweben** eines echten Zuges über dem DOM und die
// **echte** Berührung auf einem Gerät — dafür braucht es einen Browser mit Ereignissen und Touch. *Ein Test, der
// eine Bindung behauptet, ohne sie auszulösen, wäre eine Behauptung.*
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  WORKSPACE_DROP_INTENTS,
  WorkspaceInteractionError,
  WorkspaceInteractionRegistry,
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../shared/workspace-interaction';
import { FABRIC_GRAPH_COPY } from '../../../../shell/i18n/fabricGraphLocale';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
  createFabricWorkspaceObjectDragPayload,
} from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { DRAG_TOUCH_LONGPRESS_MS, dragThresholdForInput } from '../../../../shell/workspace/drag/dragDropVerdict';
import {
  DRAG_THRESHOLD_PX,
  beginDrag,
  cancelDrag,
  createDragSession,
  moveDrag,
} from '../../../../shell/workspace/drag/dragSession';
import {
  applyNotesDropCommand,
  chooseNotesDropIntent,
  confirmNotesDropZone,
  createNotesDropZone,
  dropNotesDropZone,
  enterNotesDropZone,
  hoverNotesDropZone,
  isNotesDropZoneDecided,
  isNotesDropZoneModeCompletion,
  isNotesDropZoneVisible,
  isNotesWorkspaceDrag,
  leaveNotesDropZone,
  notesDropCapabilityQuestion,
  notesDropZoneCanConfirm,
  notesDropZoneChoices,
  notesDropZoneFromDragSession,
  notesDropZoneNeedsMode,
  notesDropZonePresentation,
  notesDropZonePreview,
  notesDropZoneRefusalCode,
  notesDropZoneSurface,
  notesDropZoneView,
  readNotesDropTransfer,
  readNotesWorkspaceTransfer,
  resolveNotesDropCommand,
} from '../../drop-zone/notesDropZone';
import type { NotesDropZoneContext } from '../../drop-zone/notesDropZone';
import {
  NOTES_DROP_INTENT_LABEL,
  NOTES_DROP_ZONE_PRESENTATION,
  NOTES_DROP_ZONE_SURFACES,
  notesDropObjectKindLabel,
  notesDropRefusalText,
  notesDropZoneIdleAnnouncement,
  notesDropZoneTargetLabel,
  notesDropZoneTitle,
} from '../../drop-zone/notesDropZoneContract';
import type { NotesDropZoneRefusal, NotesDropZoneView } from '../../drop-zone/notesDropZoneContract';
import {
  NOTES_DROP_ZONE_TOUCH_ACTION,
  NOTES_DROP_ZONE_TOUCH_CANCEL_REASON,
  notesDropInputKindFromPointerType,
  notesDropZoneInputHint,
  notesDropZoneKeyboardIsPointerFree,
  notesDropZoneLongPressMs,
  notesDropZoneTouchDecision,
  notesDropZoneTouchDragBegins,
  notesDropZoneTouchThresholdPx,
  notesDropZoneTouchWaits,
} from '../../drop-zone/notesDropZoneTouch';
import { normalizePointerType } from '../../canvas/ink/notesInkEngine';

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

const chartSource: WorkspaceDocument = {
  ...source,
  id: 'grid-chart',
  root_object_ids: ['chart-1'],
  objects: {
    'chart-1': { type: 'Chart', data: { id: 'chart-1', chart_type: 'bar', title: 'Chart', categories: [], series: [] } },
  },
};

/** Das Ziel **ist** eine Notes-Fläche — daher `kind: 'Notes'`. */
const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'notes-target',
  title: 'Research notebook',
  kind: 'Notes',
  created_at: 1,
  modified_at: 1,
  version: 4,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const documents: Readonly<Record<string, WorkspaceDocument>> = {
  [source.id]: source,
  [chartSource.id]: chartSource,
  [target.id]: target,
};

const table = source.objects['table-forecast'];
if (!table) throw new Error('Fixture-Tabelle fehlt');

/** Der **produzierte** Träger der Fabric-Oberfläche (Paket 7) — zwei Absichten, also eine Wahl. */
const twoIntentPayload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
/** Derselbe Träger, aber **eine** angebotene Absicht — dann ist die Route eindeutig. */
const oneIntentPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

/**
 * Eine Matrix mit einer **Notes-Route**, aufgebaut mit der **echten** Klasse (Produktionsobjekt) — nicht mit einem
 * Attrappen-Objekt: *ein Prüfling, der die Regel nicht teilt, beweist die Regel nicht.* Die Produktion reicht die
 * **versiegelte** Matrix der Shell hinein (`FABRIC_WORKSPACE_DROP_REGISTRY`); hier wird derselbe Aufbau mit einer
 * Notes-Route gefahren, weil die Shell heute **keine** hat (siehe den Befund unten).
 */
function notesRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({
    app: 'Grid',
    exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
    imports: [],
  });
  registry.registerAppManifest({
    app: 'Notes',
    exports: [],
    imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
  });
  registry.registerAdapter({
    id: 'notes-target-table',
    targetApp: 'Notes',
    objectKinds: ['Table'],
    intents: ['COPY', 'LIVE_REFERENCE'],
  });
  return registry.seal();
}

const ROUTE_REGISTRY = notesRouteRegistry();

const contextWith = (
  registry: WorkspaceInteractionRegistry | null | undefined,
  payload?: unknown,
  surface: unknown = 'canvas',
  requestedMode?: unknown,
): NotesDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  surface,
  payload,
  // **Paket 15:** nur **setzen**, wenn ein Modus gesagt wurde — *`undefined` wäre der heimliche Default.*
  ...(requestedMode === undefined ? {} : { requestedMode }),
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: die Zone liest die Entscheidung der Administratorrichtlinie
  // aus ihrem Kontext ✓✓ (`notesDropZone.ts`, die Zustellung). *In der Produktion holt die Shell sie asynchron*
  // (`precheckPolicy`) *und reicht sie hinein* — **hier** steht sie als `Allow` ✓, *weil diese Vertraege die
  // **Route** bezeugen und nicht die Richtlinie* ✓. *Der Richtlinien-Zeuge ist ein **eigener** Vertrag*
  // (`src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`) ✓✓ —
  // *er misst fehlend, ungueltig, `Deny`, `RequireApproval` und `Allow`* ✓.
  requestedPolicyDecision: { effect: 'Allow' },
});

const route = (payload?: unknown, surface: unknown = 'canvas'): NotesDropZoneContext => contextWith(ROUTE_REGISTRY, payload, surface);
const authority = (payload?: unknown, surface: unknown = 'canvas'): NotesDropZoneContext => contextWith(FABRIC_WORKSPACE_DROP_REGISTRY, payload, surface);
/** **Der Modus wird gesagt** (Paket 15) — dieselbe Route, nur mit einem gewählten Live-Modus. */
const routeWithMode = (payload: unknown, requestedMode: unknown, surface: unknown = 'canvas'): NotesDropZoneContext =>
  contextWith(ROUTE_REGISTRY, payload, surface, requestedMode);

const closed = () => createNotesDropZone();
const hovered = (
  payload: unknown,
  registry: WorkspaceInteractionRegistry | null | undefined = ROUTE_REGISTRY,
  surface: unknown = 'canvas',
) => hoverNotesDropZone(closed(), contextWith(registry, payload, surface)).state;

describe('Paket 12 — das leere Ziel', () => {
  it('beginnt geschlossen, ohne Urteil, ohne Träger und ohne Fläche', () => {
    const state = closed();
    expect(notesDropZoneView(state)).toBe('closed');
    expect(state.target.verdict).toBe('none');
    expect(state.target.overTarget).toBe(false);
    expect(notesDropZonePreview(state)).toBeNull();
    expect(state.transfer.ok).toBe(false);
    expect(state.decision.kind).toBe('none');
    expect(notesDropZoneSurface(state)).toBeNull();
    expect(isNotesDropZoneVisible(state)).toBe(false);
    expect(isNotesDropZoneDecided(state)).toBe(false);
    expect(notesDropZonePresentation(state).glyph).toBe('');
  });

  it('schließt ein geschlossenes Ziel nicht still, sondern benannt', () => {
    const step = leaveNotesDropZone(closed(), route());
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('notes-drop-inactive');
    expect(notesDropZoneView(step.state)).toBe('closed');
  });

  it('hat **eine** Zustandsform: keine zweite Phasenangabe neben dem Urteil', () => {
    // Die View-Phase wird **gerechnet** (aus Urteil + Entscheidung + Fläche) — zwei Felder für eine Tatsache
    // wären der Defekt selbst.
    expect(Object.keys(closed()).sort()).toEqual(['closedReason', 'decision', 'surface', 'target', 'transfer']);
  });
});

describe('Paket 12 — überfahren: das Urteil kommt aus Paket 6', () => {
  it('nimmt eine angebotene Route an und zeigt die Vorschau des Urteils **wörtlich**', () => {
    const state = hovered(oneIntentPayload);
    expect(notesDropZoneView(state)).toBe('ready');
    expect(state.target.verdict).toBe('accept');
    expect(state.target.reason).toBeNull();
    expect(state.target.overTarget).toBe(true);
    expect(notesDropZoneSurface(state)).toBe('canvas');
    // Die Vorschau ist die **des Urteils** (Paket 6) — dieses Modul formuliert sie nicht neu.
    expect(notesDropZonePreview(state)).toEqual({ objectKind: 'Table', intent: 'COPY', label: 'Table · COPY' });
    expect(state.transfer.ok).toBe(true);
    if (state.transfer.ok) {
      expect(state.transfer.descriptor.objectKind).toBe('Table');
      expect(state.transfer.descriptor.sourceApp).toBe('Grid');
      expect(state.transfer.descriptor.supportedIntents).toEqual(['COPY']);
    }
    expect(notesDropZoneCanConfirm(state)).toBe(true);
    expect(notesDropZoneRefusalCode(state)).toBeNull();
  });

  it('faltet zwei angebotene Absichten zu **einem** annehmbaren Träger', () => {
    // Gegenprobe zum Defekt: würde nur die erste Absicht gefragt, wäre die Antwort von Quelle und Matrix
    // abhängig — und „überfahren: nein" bei „abgelegt: ja" wäre möglich.
    const state = hovered(twoIntentPayload);
    expect(state.target.verdict).toBe('accept');
    expect(state.target.preview?.intent).toBe('COPY');
    expect(state.transfer.ok && state.transfer.descriptor.supportedIntents).toEqual(['COPY', 'LIVE_REFERENCE']);
  });

  it('lehnt eine inkompatible Route über die Matrix ab, nicht über eine eigene Regel', () => {
    const chartPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: chartSource.id,
      objectId: 'chart-1',
      objectKind: 'Chart',
      sourceApp: 'Grid',
      supportedIntents: ['COPY'],
    }));
    const state = hovered(chartPayload);
    expect(notesDropZoneView(state)).toBe('open');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    expect(state.transfer.ok).toBe(true);
    expect(notesDropZoneRefusalCode(state)).toBe('route-not-capable');
  });

  it('lehnt einen kaputten Träger mit dem Code des **Parsers** ab (paket 7)', () => {
    const state = hovered('{kein json');
    expect(state.transfer.ok).toBe(false);
    if (!state.transfer.ok) expect(state.transfer.reason).toBe('payload_invalid');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('object-kind-unknown');
    expect(notesDropZonePreview(state)).toBeNull();
    expect(notesDropZoneRefusalCode(state)).toBe('payload_invalid');
  });

  it('lehnt eine unbekannte Objektart und ein sechstes Feld benannt ab', () => {
    const unknownKind = JSON.stringify({
      schema: 'astraea.workspace.drag',
      version: 1,
      descriptor: { documentId: source.id, objectId: 'table-forecast', objectKind: 'Hovercraft', sourceApp: 'Grid', supportedIntents: ['COPY'] },
    });
    const unknown = hovered(unknownKind);
    expect(unknown.transfer.ok).toBe(false);
    if (!unknown.transfer.ok) expect(unknown.transfer.reason).toBe('object_kind_unknown');

    const sixKeys = JSON.stringify({
      schema: 'astraea.workspace.drag',
      version: 1,
      descriptor: { documentId: source.id, objectId: 'table-forecast', objectKind: 'Table', sourceApp: 'Grid', supportedIntents: ['COPY'], range: 'A1:B2' },
    });
    const six = hovered(sixKeys);
    expect(six.transfer.ok).toBe(false);
    if (!six.transfer.ok) expect(six.transfer.reason).toBe('payload_invalid');
  });

  it('lehnt einen fehlenden Träger benannt ab, ohne einen Objekttyp zu raten', () => {
    const state = hovered(undefined);
    expect(state.transfer.ok).toBe(false);
    if (!state.transfer.ok) expect(state.transfer.reason).toBe('notes-drop-transfer-missing');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('object-kind-unknown');
    expect(notesDropZoneCanConfirm(state)).toBe(false);
  });

  it('nimmt über die **versiegelte** Matrix der Shell an: die Notes-Route ist eingetragen', () => {
    // **Der gemessene Produktionszustand nach dem Eintrag.** Die eine Autorität (Paket 4) trägt jetzt auch
    // Grid → Notes (`fabric-grid-table-to-notes`, Form A, hinter dem Whiteboard-Block). Diese Fläche baut
    // **keine** zweite Erlaubnis: sie liest die Antwort, die der Resolver derselben Matrix gibt.
    const state = hovered(oneIntentPayload, FABRIC_WORKSPACE_DROP_REGISTRY);
    expect(state.target.verdict).toBe('accept');
    expect(state.target.reason).toBeNull();
    expect(notesDropZoneView(state)).toBe('ready');
    expect(state.target.preview).toEqual({ objectKind: 'Table', intent: 'COPY', label: 'Table · COPY' });
    // Der Träger ist gelesen und das Urteil nimmt an → „ablegen" darf aktiv aussehen.
    expect(notesDropZoneCanConfirm(state)).toBe(true);
    const dropped = dropNotesDropZone(state, authority(oneIntentPayload));
    expect(dropped.ok).toBe(true);
    expect(dropped.reason).toBeUndefined();
    expect(dropped.state.decision.kind).toBe('delivered');
    if (dropped.state.decision.kind === 'delivered') {
      expect(dropped.state.decision.resolution.adapterId).toBe('fabric-grid-table-to-notes');
      expect(dropped.state.decision.resolution.intent).toBe('COPY');
      expect(dropped.state.decision.resolution.sourceVersion).toBe(3);
      expect(dropped.state.decision.resolution.targetVersion).toBe(4);
    }
  });

  it('ist fail-closed, wenn die Autorität fehlt oder nicht antwortet', () => {
    // **Ohne** den Helfer aufgerufen: `hovered(…, undefined)` würde dessen Vorgabewert greifen lassen und damit
    // gerade **nicht** den fehlenden Registry-Fall prüfen — der Fehler steckte im Prüfstand, nicht im Code.
    for (const broken of [null, undefined]) {
      const state = hoverNotesDropZone(closed(), contextWith(broken, oneIntentPayload)).state;
      expect(state.target.verdict, String(broken)).toBe('reject');
      expect(state.target.reason).toBe('verdict-unavailable');
      expect(notesDropZoneView(state)).toBe('open');
    }
    const throwing = {
      isSealed: true,
      getAdapter: () => { throw new Error('kaputt'); },
      getCompatibleIntents: () => { throw new Error('kaputt'); },
    } as unknown as WorkspaceInteractionRegistry;
    // Überfahren: die Frage **wirft** in der Autorität → sie antwortet `false` → das Urteil lehnt ab (Paket 6).
    const state = hoverNotesDropZone(closed(), contextWith(throwing, oneIntentPayload)).state;
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    // Die Ablage wird vom **Urteil** aufgehalten (der eine Riegel) — nicht erst vom Resolver.
    expect(dropNotesDropZone(state, contextWith(throwing, oneIntentPayload)).reason).toBe('route-not-capable');
    // Die **Zustellung** selbst ist ebenfalls fail-closed: sie wird hier über die Tastatur-Absicht erreicht, die
    // das Urteil nicht als Riegel vorschaltet — und nennt dann denselben Namen wie Paket 6 für „keine Antwort".
    expect(chooseNotesDropIntent(state, 'COPY', contextWith(throwing, oneIntentPayload)).reason).toBe('verdict-unavailable');
    expect(chooseNotesDropIntent(state, 'COPY', contextWith(null, oneIntentPayload)).reason).toBe('verdict-unavailable');
  });

  it('fragt nicht, wenn die Fläche ihr eigenes Ziel nicht kennt', () => {
    const noApp = hoverNotesDropZone(closed(), { ...route(oneIntentPayload), targetApp: '' });
    expect(noApp.ok).toBe(false);
    expect(noApp.reason).toBe('notes-drop-target-missing');
    expect(noApp.state.decision.kind).toBe('refused');
    const noDocument = hoverNotesDropZone(closed(), { ...route(oneIntentPayload), targetDocumentId: '' });
    expect(noDocument.ok).toBe(false);
    expect(noDocument.reason).toBe('notes-drop-target-missing');
  });

  it('baut die Fähigkeitsfrage nur mit einer lesbaren Antwort der Autorität', () => {
    expect(notesDropCapabilityQuestion(route(oneIntentPayload))).not.toBeNull();
    expect(notesDropCapabilityQuestion(route(undefined))).toBeNull();
    expect(notesDropCapabilityQuestion({ ...route(oneIntentPayload), registry: null })).toBeNull();
    const question = notesDropCapabilityQuestion(route(oneIntentPayload));
    expect(question?.('Notes', 'Table', 'COPY')).toBe(true);
    expect(question?.('Notes', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
  });
});

describe('Paket 12 — zwei benannte Flächen, **eine** Maschine', () => {
  it('nennt genau zwei Flächen und gibt jeder ein eigenes Wort', () => {
    expect([...NOTES_DROP_ZONE_SURFACES]).toEqual(['canvas', 'page-list']);
    const labels = NOTES_DROP_ZONE_SURFACES.map((surface) => notesDropZoneTitle(surface));
    expect(new Set(labels).size).toBe(NOTES_DROP_ZONE_SURFACES.length);
    expect(notesDropZoneTitle('canvas')).toContain('canvas');
    expect(notesDropZoneTitle('page-list')).toContain('page list');
    // Ziel und Zone sind **zwei** Tatsachen mit **einer** Quelle — die Namen dürfen sich nicht gleichen.
    for (const surface of NOTES_DROP_ZONE_SURFACES) {
      expect(notesDropZoneTargetLabel(surface)).not.toBe(notesDropZoneTitle(surface));
      expect(notesDropZoneIdleAnnouncement(surface)).toContain(notesDropZoneTargetLabel(surface).split(' workspace')[0]);
    }
  });

  it('führt **eine** Fläche zur Zeit und wechselt sie als **neue** Tatsache', () => {
    const canvasState = hovered(oneIntentPayload, ROUTE_REGISTRY, 'canvas');
    expect(notesDropZoneSurface(canvasState)).toBe('canvas');
    const listState = hoverNotesDropZone(canvasState, route(oneIntentPayload, 'page-list')).state;
    expect(notesDropZoneSurface(listState)).toBe('page-list');
    expect(notesDropZoneView(listState)).toBe('ready');
    // Und zurück: der Name folgt dem Zeiger, die Zustellung bleibt dieselbe.
    expect(notesDropZoneSurface(hoverNotesDropZone(listState, route(oneIntentPayload, 'canvas')).state)).toBe('canvas');
  });

  it('lehnt eine unbekannte Fläche **benannt** ab, statt sie zu raten', () => {
    // Ein Name außerhalb der Liste kann nur über eine Umgehung des Typs entstehen — fail-closed.
    const step = hoverNotesDropZone(closed(), contextWith(ROUTE_REGISTRY, oneIntentPayload, 'sidebar'));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('notes-drop-surface-unknown');
    expect(step.state.decision.kind).toBe('refused');
    expect(notesDropZoneSurface(step.state)).toBeNull();
    expect(dropNotesDropZone(closed(), contextWith(ROUTE_REGISTRY, oneIntentPayload, 42)).reason).toBe('notes-drop-surface-unknown');
  });

  it('löscht beim Verlassen **nur** die eigene Fläche — eine fremde ist ein benannter No-op', () => {
    const canvasState = hovered(oneIntentPayload, ROUTE_REGISTRY, 'canvas');
    const foreign = leaveNotesDropZone(canvasState, route(undefined, 'page-list'));
    expect(foreign.ok).toBe(false);
    expect(foreign.reason).toBe('notes-drop-surface-mismatch');
    // Die Tatsache der Leinwand steht **unverändert**: Urteil, Träger und Fläche.
    expect(foreign.state.target.verdict).toBe('accept');
    expect(foreign.state.transfer.ok).toBe(true);
    expect(notesDropZoneSurface(foreign.state)).toBe('canvas');
    const own = leaveNotesDropZone(canvasState, route(undefined, 'canvas'));
    expect(own.ok).toBe(true);
    expect(notesDropZoneView(own.state)).toBe('closed');
    expect(own.state.closedReason).toBe('drag-left');
    expect(own.state.target.verdict).toBe('none');
    expect(own.state.target.preview).toBeNull();
    expect(own.state.transfer.ok).toBe(false);
    expect(notesDropZoneSurface(own.state)).toBeNull();
  });

  it('löst einen entschiedenen Fall **derselben** Fläche nicht ab, einen der anderen schon', () => {
    const delivered = dropNotesDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(isNotesDropZoneDecided(delivered)).toBe(true);
    expect(notesDropZoneView(hoverNotesDropZone(delivered, route(oneIntentPayload)).state)).toBe('resolved');
    expect(notesDropZoneView(leaveNotesDropZone(delivered, route(undefined)).state)).toBe('resolved');
    const entered = enterNotesDropZone(delivered, route(twoIntentPayload));
    expect(notesDropZoneView(entered.state)).toBe('ready');
    expect(entered.state.decision.kind).toBe('none');
  });
});

describe('Paket 12 — ablegen: eine Zustellung, kein stiller Erfolg', () => {
  it('stellt eine eindeutige Route zu, verbraucht das Urteil und verändert kein Dokument', () => {
    const before = structuredClone(documents);
    const state = hovered(oneIntentPayload);
    const step = dropNotesDropZone(state, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(notesDropZoneView(step.state)).toBe('resolved');
    expect(step.state.decision.kind).toBe('delivered');
    if (step.state.decision.kind === 'delivered') {
      expect(step.state.decision.resolution).toEqual({
        adapterId: 'notes-target-table',
        intent: 'COPY',
        // **Paket 15 — vorgezogen:** die Zustellung trägt die neuen Tatsachen des Resolvers. Bei einer **Kopie**
        // ist `integrationKind: 'copy'` und **kein** `mode` — *`mode` fehlt, es ist nicht `undefined` gesetzt*
        // (`exactOptionalPropertyTypes`), und `toEqual` prüft genau das.
        integrationKind: 'copy',
        sourceDocumentId: source.id,
        sourceObjectId: 'table-forecast',
        targetDocumentId: target.id,
        sourceVersion: 3,
        targetVersion: 4,
      });
    }
    // Paket 6: **nach dem Ablegen ist das Ziel wieder leer** — ein stehengebliebenes „hier annehmen" wäre eine Lüge.
    expect(step.state.target.verdict).toBe('none');
    expect(step.state.target.overTarget).toBe(false);
    // Die Fläche bleibt benannt: sie **ist** der Ort der Zustellung.
    expect(notesDropZoneSurface(step.state)).toBe('canvas');
    expect(documents).toEqual(before);
  });

  it('legt ohne gewählte Absicht nichts ab, sondern verlangt sie benannt', () => {
    const state = hovered(twoIntentPayload);
    const step = dropNotesDropZone(state, route(twoIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_intent_choice_required');
    expect(notesDropZoneView(step.state)).toBe('choice');
    expect(step.state.decision.kind).toBe('choice');
    expect(notesDropZoneChoices(step.state).map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
    // Die Tasten kommen aus der **vorhandenen** Absichtsliste — die Spanne ist keine zweite Zahl.
    expect(notesDropZoneChoices(step.state).map((choice) => choice.key)).toEqual(
      WORKSPACE_DROP_INTENTS.slice(0, 2).map((_, index) => String(index + 1)),
    );
    expect(notesDropZoneChoices(step.state)[0]?.label).toBe(NOTES_DROP_INTENT_LABEL.COPY);
    expect(notesDropZoneCanConfirm(step.state)).toBe(false);
  });

  it('lehnt einen kaputten Träger mit dem Code des Parsers ab', () => {
    const step = dropNotesDropZone(closed(), route('{kein json'));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('payload_invalid');
    expect(notesDropZoneView(step.state)).toBe('refused');
    expect(notesDropZoneRefusalCode(step.state)).toBe('payload_invalid');
  });

  it('lehnt eine Ablage ohne Träger benannt ab, statt sie zu verschlucken', () => {
    const step = dropNotesDropZone(closed(), route(undefined));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('notes-drop-transfer-missing');
    expect(notesDropZoneView(step.state)).toBe('refused');
  });

  it('legt einen entschiedenen Fall nicht ein zweites Mal ab', () => {
    const delivered = dropNotesDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const second = dropNotesDropZone(delivered, route(oneIntentPayload));
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('notes-drop-already-decided');
    expect(second.state.decision.kind).toBe('delivered');
  });

  it('nennt ein fehlendes Quellobjekt über den Resolver, wo das Urteil nur „keine Route" sagen kann', () => {
    // Das Urteil (Paket 6) urteilt über die **Route**; die genaue Identität nennt der Resolver.
    const step = chooseNotesDropIntent(hovered(oneIntentPayload), 'COPY', {
      ...route(oneIntentPayload),
      documents: { [target.id]: target },
    });
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_source_document_missing');
  });

  it('legt **ohne** vorheriges Überfahren ab: die Ablage braucht keinen Zeiger-Pfad', () => {
    const step = dropNotesDropZone(closed(), route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('delivered');
  });
});

describe('Paket 12 — die Tastatur ist ein Weg, kein Zusatz', () => {
  it('legt mit der Absicht genau so zu wie der Zeiger', () => {
    const ready = hovered(oneIntentPayload);
    const viaKeyboard = confirmNotesDropZone(ready, route(oneIntentPayload));
    const viaPointer = dropNotesDropZone(ready, route(oneIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision).toEqual(viaPointer.state.decision);
  });

  it('bestätigt **ohne** Überfahren — die Tastatur braucht die Leinwand nicht', () => {
    const fresh = closed();
    expect(fresh.target.overTarget).toBe(false);
    const step = confirmNotesDropZone(fresh, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('delivered');
  });

  it('bestätigt im Zustand „Absicht erforderlich" nicht heimlich, sondern wörtlich wie die Ablage', () => {
    const choice = dropNotesDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    const viaEnter = confirmNotesDropZone(choice, route(twoIntentPayload));
    const viaDrop = dropNotesDropZone(choice, route(twoIntentPayload));
    expect(viaEnter).toEqual(viaDrop);
    expect(viaEnter.reason).toBe('drop_intent_choice_required');
  });

  it('führt die gewählte Absicht durch dieselbe Zustellung wie die Ablage — **mit** gesagtem Modus (Paket 15)', () => {
    const choice = dropNotesDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    // **Der Fehlschlag-Zeuge bleibt** ✓✓: Live **ohne** Modus ist der **benannte** Fehlschlag des Resolvers —
    // *kein heimlicher Default, und die Fläche erfindet keinen.*
    const ohneModus = chooseNotesDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload));
    expect(ohneModus.ok).toBe(false);
    expect(ohneModus.reason).toBe('drop_live_mode_required');
    // **Vorgezogen (Paket 15, AST-1948):** mit gesagtem Modus ist **dieselbe** Anfrage die Zustellung — und sie
    // trägt die neuen Tatsachen des Resolvers (`integrationKind: 'live'` + `mode`).
    for (const mode of ['Live', 'Frozen'] as const) {
      const mitModus = chooseNotesDropIntent(choice, 'LIVE_REFERENCE', routeWithMode(twoIntentPayload, mode));
      expect(mitModus.ok, mode).toBe(true);
      expect(mitModus.state.decision.kind, mode).toBe('delivered');
      if (mitModus.state.decision.kind === 'delivered') {
        expect(mitModus.state.decision.resolution.integrationKind, mode).toBe('live');
        expect(mitModus.state.decision.resolution.mode, mode).toBe(mode);
        expect(mitModus.state.decision.resolution.intent, mode).toBe('LIVE_REFERENCE');
      }
    }
    const viaKeyboard = chooseNotesDropIntent(choice, 'COPY', route(twoIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision.kind).toBe('delivered');
    if (viaKeyboard.state.decision.kind === 'delivered') {
      expect(viaKeyboard.state.decision.resolution.intent).toBe('COPY');
      expect(viaKeyboard.state.decision.resolution.adapterId).toBe('notes-target-table');
      expect(viaKeyboard.state.decision.resolution.targetVersion).toBe(4);
      // **Die Kopie trägt keinen Modus** ✓✓ — `mode` **fehlt**, es ist nicht `undefined` gesetzt.
      expect(viaKeyboard.state.decision.resolution.integrationKind).toBe('copy');
      expect(viaKeyboard.state.decision.resolution.mode).toBeUndefined();
    }
  });

  it('lehnt eine nicht angebotene und eine unbekannte Absicht benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    expect(chooseNotesDropIntent(ready, 'FROZEN_SNAPSHOT', route(oneIntentPayload)).reason).toBe('drop_intent_not_supported');
    expect(chooseNotesDropIntent(ready, 'TELEPORT', route(oneIntentPayload)).reason).toBe('intent_unknown');
    // Ein bereits gelesener Träger **im Zustand** genügt der Tastatur — sie braucht keine Ablagefläche.
    expect(chooseNotesDropIntent(ready, 'COPY', route(undefined)).ok).toBe(true);
    // Ohne gelesenen Träger ist es ein **benannter** Grund, kein stiller No-op.
    expect(chooseNotesDropIntent(closed(), 'COPY', route(undefined)).reason).toBe('notes-drop-transfer-missing');
  });

  it('übersetzt Tasten in Absichten und nennt ungebundene Tasten', () => {
    const choice = dropNotesDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(resolveNotesDropCommand(choice, 'Enter')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveNotesDropCommand(choice, ' ')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveNotesDropCommand(choice, 'Escape')).toEqual({ ok: true, command: { kind: 'dismiss' } });
    expect(resolveNotesDropCommand(choice, '1')).toEqual({ ok: true, command: { kind: 'choose', intent: 'COPY' } });
    expect(resolveNotesDropCommand(choice, '2')).toEqual({ ok: true, command: { kind: 'choose', intent: 'LIVE_REFERENCE' } });
    expect(resolveNotesDropCommand(choice, '9')).toEqual({ ok: false, reason: 'notes-drop-key-unbound' });
    expect(resolveNotesDropCommand(choice, 'x')).toEqual({ ok: false, reason: 'notes-drop-key-unbound' });
    expect(resolveNotesDropCommand(choice, 2)).toEqual({ ok: false, reason: 'notes-drop-key-unbound' });
    // Eine Ziffer ist **nur** eine Absicht, wenn die Matrix eine angeboten hat.
    expect(resolveNotesDropCommand(hovered(twoIntentPayload), '1')).toEqual({ ok: false, reason: 'notes-drop-key-unbound' });
  });

  it('führt Befehle aus und lehnt unbekannte Befehle benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    const dismissed = applyNotesDropCommand(ready, { kind: 'dismiss' }, route(oneIntentPayload));
    expect(dismissed.state.decision.kind).toBe('none');
    expect(notesDropZoneView(dismissed.state)).toBe('closed');
    expect(dismissed.state.closedReason).toBe('keyboard-dismiss');
    const bogus = applyNotesDropCommand(ready, { kind: 'teleport' } as never, route(oneIntentPayload));
    expect(bogus.ok).toBe(false);
    expect(bogus.reason).toBe('notes-drop-command-unknown');
  });

  it('lässt einen entschiedenen Fall auch beim Verwerfen stehen — mit **seinem** Flächennamen', () => {
    const delivered = dropNotesDropZone(hovered(oneIntentPayload, ROUTE_REGISTRY, 'page-list'), route(oneIntentPayload, 'page-list')).state;
    const dismissed = leaveNotesDropZone(delivered, route(undefined, 'page-list'), 'keyboard-dismiss');
    // Ein entschiedener Fall bleibt stehen (die Tatsache gehört dem Nutzer) — der Flächenname bleibt dabei erhalten.
    expect(notesDropZoneSurface(dismissed.state)).toBe('page-list');
  });
});

describe('Paket 12 — der Empfänger folgt der vorhandenen Zieh-Session (Paket 5)', () => {
  it('öffnet sich aus der laufenden Sitzung mit deren Träger', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, twoIntentPayload);
    expect(started.ok).toBe(true);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    expect(moved.state.phase).toBe('dragging');
    const step = notesDropZoneFromDragSession(closed(), moved.state, route());
    expect(notesDropZoneView(step.state)).toBe('ready');
    expect(step.state.target.preview?.objectKind).toBe('Table');
    expect(step.state.transfer.ok).toBe(true);
    expect(notesDropZoneSurface(step.state)).toBe('canvas');
  });

  it('schließt eine überfahrene Fläche, wenn der Zug abgebrochen wird — mit **dessen** benanntem Grund', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, oneIntentPayload);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    const open = notesDropZoneFromDragSession(closed(), moved.state, route()).state;
    const cancelled = cancelDrag(moved.state, 'pointer-lost');
    const after = notesDropZoneFromDragSession(open, cancelled.state, route());
    expect(notesDropZoneView(after.state)).toBe('closed');
    // Der Grund der Sitzung wird **übernommen**, nicht eingeebnet: `pointercancel` heißt `pointer-lost`.
    expect(after.state.closedReason).toBe('pointer-lost');
    const blurred = cancelDrag(moved.state, 'window-blur');
    expect(notesDropZoneFromDragSession(open, blurred.state, route()).state.closedReason).toBe('window-blur');
    // Und ohne vorheriges Überfahren ist es ein **benannter** No-op.
    const idle = notesDropZoneFromDragSession(closed(), cancelled.state, route());
    expect(idle.ok).toBe(false);
    expect(idle.reason).toBe('notes-drop-inactive');
  });

  it('lässt eine Zustellung stehen, wenn der Zug endet', () => {
    const delivered = dropNotesDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const started = beginDrag(createDragSession(), { pointerId: 2, x: 0, y: 0 }, oneIntentPayload);
    const cancelled = cancelDrag(started.state, 'pointer-lost');
    const after = notesDropZoneFromDragSession(delivered, cancelled.state, route(oneIntentPayload));
    expect(after.ok).toBe(true);
    expect(notesDropZoneView(after.state)).toBe('resolved');
  });
});

describe('Paket 12 — der Träger aus der Ablagefläche', () => {
  const transfer = (value: unknown) => ({ getData: (mime: string) => (mime === FABRIC_WORKSPACE_OBJECT_DRAG_MIME ? value : '') });

  it('liest genau die vorhandene MIME-Konstante', () => {
    expect(readNotesWorkspaceTransfer(transfer(oneIntentPayload))).toEqual({ ok: true, payload: oneIntentPayload });
  });

  it('nennt einen fehlenden Träger, statt ihn zu erfinden', () => {
    expect(readNotesWorkspaceTransfer(transfer(''))).toEqual({ ok: false, reason: 'notes-drop-transfer-missing' });
    expect(readNotesWorkspaceTransfer(null)).toEqual({ ok: false, reason: 'notes-drop-transfer-missing' });
  });

  it('nennt eine unlesbare Ablagefläche', () => {
    expect(readNotesWorkspaceTransfer({})).toEqual({ ok: false, reason: 'notes-drop-transfer-unreadable' });
    expect(readNotesWorkspaceTransfer({ getData: () => { throw new Error('kein Zugriff'); } }))
      .toEqual({ ok: false, reason: 'notes-drop-transfer-unreadable' });
  });

  it('erkennt den Zug an `types` — der Inhalt ist während `dragover` geschützt (W-443)', () => {
    expect(isNotesWorkspaceDrag({ types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME] })).toBe(true);
    expect(isNotesWorkspaceDrag({ types: ['Files'] })).toBe(false);
    expect(isNotesWorkspaceDrag({ types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME, 'Files'] })).toBe(true);
    expect(isNotesWorkspaceDrag({ types: [] })).toBe(false);
    expect(isNotesWorkspaceDrag({ types: { 0: FABRIC_WORKSPACE_OBJECT_DRAG_MIME, length: 1 } })).toBe(true);
    expect(isNotesWorkspaceDrag({ types: { 0: 'Files', length: 1 } })).toBe(false);
    expect(isNotesWorkspaceDrag({ types: null })).toBe(false);
    expect(isNotesWorkspaceDrag({})).toBe(false);
    expect(isNotesWorkspaceDrag(null)).toBe(false);
    expect(isNotesWorkspaceDrag(undefined)).toBe(false);
  });

  it('liest den Träger durch den **einen** Parser (Paket 7) und gibt dessen Deskriptor weiter', () => {
    const read = readNotesDropTransfer(oneIntentPayload);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.descriptor.objectKind).toBe('Table');
      expect(read.descriptor.documentId).toBe(source.id);
      expect(read.descriptor.objectId).toBe('table-forecast');
    }
    expect(readNotesDropTransfer(undefined).ok).toBe(false);
    expect(readNotesDropTransfer(42).ok).toBe(false);
  });
});

describe('Paket 12 — Touch ist entschieden, nicht angenommen', () => {
  it('liest den Langdruck und die Toleranz aus Paket 5/6, statt eine zweite Zahl zu setzen', () => {
    expect(notesDropZoneLongPressMs()).toBe(DRAG_TOUCH_LONGPRESS_MS);
    expect(notesDropZoneTouchThresholdPx()).toBe(dragThresholdForInput('touch', DRAG_THRESHOLD_PX));
    expect(notesDropZoneTouchWaits()).toBe(true);
    expect(notesDropZoneKeyboardIsPointerFree()).toBe(true);
  });

  it('nennt jede Entscheidung mit Namen — Langdruck, Toleranz, `touch-action`, Abbruch', () => {
    const touch = notesDropZoneTouchDecision('touch');
    expect(touch.inputKind).toBe('touch');
    expect(touch.waitsForLongPress).toBe(true);
    expect(touch.longPressMs).toBe(DRAG_TOUCH_LONGPRESS_MS);
    expect(touch.thresholdPx).toBe(dragThresholdForInput('touch', DRAG_THRESHOLD_PX));
    expect(touch.cancelReason).toBe('pointer-lost');
    expect(touch.claimsPointerGesture).toBe(false);
    // Maus und Stift warten **nicht** — dort ist die Berührung selbst die Absicht (Paket 6).
    expect(notesDropZoneTouchDecision('mouse').waitsForLongPress).toBe(false);
    expect(notesDropZoneTouchDecision('pen').waitsForLongPress).toBe(false);
    expect(notesDropZoneTouchDecision('keyboard').waitsForLongPress).toBe(false);
    expect(notesDropZoneTouchDecision('mouse').thresholdPx).toBe(dragThresholdForInput('mouse', DRAG_THRESHOLD_PX));
  });

  it('beginnt einen Touch-Zug erst nach Langdruck innerhalb der Toleranz', () => {
    const long = notesDropZoneLongPressMs();
    const tolerance = notesDropZoneTouchThresholdPx();
    expect(notesDropZoneTouchDragBegins(long - 1, 0)).toBe(false);
    expect(notesDropZoneTouchDragBegins(long, 0)).toBe(true);
    expect(notesDropZoneTouchDragBegins(long + 1, tolerance)).toBe(true);
    expect(notesDropZoneTouchDragBegins(long + 1, tolerance + 1)).toBe(false);
  });

  it('ist bei unbrauchbaren Zahlen fail-closed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, '250', null, undefined]) {
      expect(notesDropZoneTouchDragBegins(bad, 0), String(bad)).toBe(false);
      expect(notesDropZoneTouchDragBegins(1000, bad), String(bad)).toBe(false);
    }
  });

  it('stiehlt der Leinwand die Geste nicht: `manipulation`, nie `none`', () => {
    expect(NOTES_DROP_ZONE_TOUCH_ACTION).toBe('manipulation');
    expect(NOTES_DROP_ZONE_TOUCH_ACTION).not.toBe('none');
    // Die Zusage „das Verschieben bleibt der Leinwand" ist **gerechnet**, nicht behauptet.
    expect(notesDropZoneTouchDecision('touch').keepsPanning).toBe(true);
    const hint = notesDropZoneInputHint('touch');
    expect(hint).toContain(`touch-action: ${NOTES_DROP_ZONE_TOUCH_ACTION}`);
    expect(hint).toContain(String(notesDropZoneLongPressMs()));
    expect(hint).toContain('never starts a pointer gesture');
    expect(notesDropZoneInputHint('keyboard')).toContain('no pointer');
    expect(notesDropZoneInputHint('pen')).toContain('never claims the gesture');
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session', () => {
    expect(NOTES_DROP_ZONE_TOUCH_CANCEL_REASON).toBe('pointer-lost');
    const closedByTouch = leaveNotesDropZone(hovered(oneIntentPayload), route(undefined), NOTES_DROP_ZONE_TOUCH_CANCEL_REASON);
    expect(closedByTouch.state.closedReason).toBe('pointer-lost');
    expect(notesDropZoneView(closedByTouch.state)).toBe('closed');
  });

  it('übersetzt die Zeigerart über die **vorhandene** Übersetzung der Notes-Tinte', () => {
    for (const value of ['touch', 'pen', 'stylus', 'mouse', '', undefined, 42]) {
      expect(notesDropInputKindFromPointerType(value), String(value))
        .toBe(normalizePointerType(typeof value === 'string' ? value : undefined));
    }
    expect(notesDropInputKindFromPointerType('touch')).toBe('touch');
    expect(notesDropInputKindFromPointerType('pen')).toBe('pen');
    expect(notesDropInputKindFromPointerType('stylus')).toBe('mouse');
  });
});

describe('Paket 12 — das Vokabular ist eine Definition', () => {
  it('nimmt die Objektart- und Absichtswörter aus der vorhandenen Fabric-Oberfläche', () => {
    expect(notesDropObjectKindLabel('Table')).toBe(FABRIC_GRAPH_COPY['en-US'].objectType.Table);
    expect(NOTES_DROP_INTENT_LABEL.COPY).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy);
    expect(NOTES_DROP_INTENT_LABEL.LIVE_REFERENCE).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink);
  });

  it('nimmt die Sätze der Matrix-Codes aus dem Fehler selbst, statt sie zweimal zu schreiben', () => {
    for (const code of ['payload_invalid', 'registry_adapter_route_missing', 'drop_authorization_failed', 'intent_unknown'] as const) {
      expect(notesDropRefusalText(code), code).toBe(new WorkspaceInteractionError(code).message);
    }
  });

  it('hat für jeden eigenen Grund und jeden Urteilsgrund einen sichtbaren Satz', () => {
    const own: readonly NotesDropZoneRefusal[] = [
      'notes-drop-transfer-missing',
      'notes-drop-transfer-unreadable',
      'notes-drop-target-missing',
      'notes-drop-surface-unknown',
      'notes-drop-surface-mismatch',
      'notes-drop-inactive',
      'notes-drop-already-decided',
      'notes-drop-command-unknown',
      'notes-drop-key-unbound',
      'object-kind-unknown',
      'intent-unknown',
      'route-not-capable',
      'payload-missing',
      'verdict-unavailable',
    ];
    for (const code of own) {
      const text = notesDropRefusalText(code);
      expect(text.length, code).toBeGreaterThan(10);
      expect(text, code).not.toBe(code);
    }
  });

  it('gibt jedem View-Zustand ein eigenes Zeichen, eine eigene Form und eigene Worte', () => {
    const views: NotesDropZoneView[] = ['closed', 'open', 'ready', 'choice', 'refused', 'resolved'];
    const signatures = new Set<string>();
    for (const view of views) {
      const presentation = NOTES_DROP_ZONE_PRESENTATION[view];
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
    }
    expect(signatures.size).toBe(views.length);
  });

  it('rechnet die View-Phase aus Urteil, Entscheidung und Fläche', () => {
    expect(notesDropZoneView(closed())).toBe('closed');
    expect(notesDropZoneView(hovered(oneIntentPayload))).toBe('ready');
    expect(notesDropZoneView(hovered(oneIntentPayload, FABRIC_WORKSPACE_DROP_REGISTRY))).toBe('ready');
    const choice = dropNotesDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(notesDropZoneView(choice)).toBe('choice');
    const refused = dropNotesDropZone(closed(), route('{kein json')).state;
    expect(notesDropZoneView(refused)).toBe('refused');
    const delivered = dropNotesDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(notesDropZoneView(delivered)).toBe('resolved');
    expect(notesDropZonePresentation(delivered).glyph).toBe(NOTES_DROP_ZONE_PRESENTATION.resolved.glyph);
  });
});

describe('Paket 15 — der Modusschritt: Live wird **gesagt**, nicht angenommen', () => {
  /** Ein Träger, der **nur** einen Live-Verweis anbietet — die schärfste Form der Frage. */
  const liveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
    documentId: source.id,
    objectId: 'table-forecast',
    objectKind: 'Table',
    sourceApp: 'Grid',
    supportedIntents: ['LIVE_REFERENCE'],
  }));

  it('die **Fähigkeitsfrage** führt den Modus mit: Live **mit** Modus ist fähig, Live **ohne** nicht', () => {
    const ohne = notesDropCapabilityQuestion(contextWith(ROUTE_REGISTRY, liveOnlyPayload));
    expect(ohne?.('Notes', 'Table', 'LIVE_REFERENCE')).toBe(false);
    const mit = notesDropCapabilityQuestion(contextWith(ROUTE_REGISTRY, liveOnlyPayload, 'canvas', 'Live'));
    expect(mit?.('Notes', 'Table', 'LIVE_REFERENCE')).toBe(true);
    // Die **Kopie** braucht keinen Modus — sie ist mit **und** ohne Modus fähig, wenn der Träger sie anbietet
    // (die Fähigkeitsfrage fragt den Resolver, nicht einen eigenen Modus-Zweig).
    const zweiAbsichten = notesDropCapabilityQuestion(contextWith(ROUTE_REGISTRY, twoIntentPayload, 'canvas', 'Live'));
    expect(zweiAbsichten?.('Notes', 'Table', 'COPY')).toBe(true);
    expect(notesDropCapabilityQuestion(contextWith(ROUTE_REGISTRY, twoIntentPayload))?.('Notes', 'Table', 'COPY')).toBe(true);
    // Und ein Träger, der **nur** Live anbietet, macht die Kopie **nicht** fähig: *die Quelle bietet sie nicht an*
    // (`drop_intent_not_supported`) — die Fläche fragt, sie behauptet nicht.
    expect(mit?.('Notes', 'Table', 'COPY')).toBe(false);
    // Ein **unbekannter** Modus ist kein Modus: der Resolver lehnt ihn selbst ab, hier wird nichts geraten.
    const unbekannt = notesDropCapabilityQuestion(contextWith(ROUTE_REGISTRY, liveOnlyPayload, 'canvas', 'Warm'));
    expect(unbekannt?.('Notes', 'Table', 'LIVE_REFERENCE')).toBe(false);
  });

  it('überfährt einen Live-Träger **mit** Modus als `accept` — und **ohne** Modus nicht als annehmbar', () => {
    const mit = hoverNotesDropZone(closed(), routeWithMode(liveOnlyPayload, 'Frozen')).state;
    expect(mit.target.verdict).toBe('accept');
    expect(notesDropZoneView(mit)).toBe('ready');
    expect(notesDropZoneCanConfirm(mit)).toBe(true);
    const ohne = hoverNotesDropZone(closed(), contextWith(ROUTE_REGISTRY, liveOnlyPayload)).state;
    expect(ohne.target.verdict).toBe('reject');
    expect(notesDropZoneCanConfirm(ohne)).toBe(false);
    // **Gemessene Grenze, benannt:** Paket 6 hat für „Modus fehlt" **keinen** eigenen Grund — seine Vokabel ist
    // endlich (`object-kind-unknown` / `intent-unknown` / `route-not-capable` / `payload-missing` /
    // `verdict-unavailable`). *Diese Fläche erfindet deshalb keinen zweiten: sie zeigt das Urteil, und den **Namen**
    // des Resolvers nennt der Weg, der wirklich zustellt.* Ein fünfter Grund gehörte in Paket 6
    // (`shell/workspace/drag/dragDropVerdict.ts`) — **nicht** hierher.
    expect(ohne.target.reason).toBe('route-not-capable');
    expect(notesDropZoneRefusalCode(ohne)).toBe('route-not-capable');
  });

  it('stellt einen Live-Verweis **mit** Modus zu und nennt beide neuen Tatsachen', () => {
    for (const mode of ['Live', 'Frozen'] as const) {
      const step = confirmNotesDropZone(closed(), routeWithMode(liveOnlyPayload, mode));
      expect(step.ok, mode).toBe(true);
      expect(step.state.decision.kind, mode).toBe('delivered');
      if (step.state.decision.kind === 'delivered') {
        expect(step.state.decision.resolution.integrationKind, mode).toBe('live');
        expect(step.state.decision.resolution.mode, mode).toBe(mode);
      }
    }
    // **Ohne** Modus nennt der Resolver den Namen — über den Weg, der ohne Paket-6-Riegel zustellt.
    const ohne = chooseNotesDropIntent(closed(), 'LIVE_REFERENCE', contextWith(ROUTE_REGISTRY, liveOnlyPayload));
    expect(ohne.ok).toBe(false);
    expect(ohne.reason).toBe('drop_live_mode_required');
    expect(notesDropZoneRefusalCode(ohne.state)).toBe('drop_live_mode_required');
    // Derselbe Weg **mit** Modus liefert.
    const mit = chooseNotesDropIntent(closed(), 'LIVE_REFERENCE', routeWithMode(liveOnlyPayload, 'Live'));
    expect(mit.ok).toBe(true);
    expect(mit.state.decision.kind).toBe('delivered');
  });

  it('nennt einen **unbekannten** Modus mit dem Namen des Resolvers, statt zu raten', () => {
    const step = chooseNotesDropIntent(closed(), 'LIVE_REFERENCE', routeWithMode(liveOnlyPayload, 'Warm'));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_live_mode_required');
    expect(step.state.decision.kind).toBe('refused');
  });

  it('wählt durch den Modus **nicht heimlich** die Absicht: die Wahl bleibt eine Wahl', () => {
    // Ein gesagter Modus allein entscheidet nichts — der Träger bietet **zwei** Absichten an, also bleibt es bei
    // `drop_intent_choice_required` (Paket 15 verbietet den heimlichen Default in **beide** Richtungen).
    const step = dropNotesDropZone(hovered(twoIntentPayload), routeWithMode(twoIntentPayload, 'Live'));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_intent_choice_required');
    expect(step.state.decision.kind).toBe('choice');
  });

  it('**vervollständigt** den Modus: nach dem benannten Fehlschlag führt derselbe Weg **mit** Modus zum Ziel', () => {
    const choice = dropNotesDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    const refused = chooseNotesDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload));
    expect(refused.state.decision.kind).toBe('refused');
    expect(refused.reason).toBe('drop_live_mode_required');
    // Ohne Modus bleibt der Fall entschieden — ein **benannter** No-op, kein stiller zweiter Abschluss.
    expect(chooseNotesDropIntent(refused.state, 'LIVE_REFERENCE', route(twoIntentPayload)).reason).toBe('notes-drop-already-decided');
    expect(isNotesDropZoneModeCompletion(refused.state, route(twoIntentPayload))).toBe(false);
    // **Mit** Modus ist es die fehlende Tatsache, nicht ein zweiter Abschluss ✓.
    expect(isNotesDropZoneModeCompletion(refused.state, routeWithMode(twoIntentPayload, 'Live'))).toBe(true);
    const completed = chooseNotesDropIntent(refused.state, 'LIVE_REFERENCE', routeWithMode(twoIntentPayload, 'Live'));
    expect(completed.ok).toBe(true);
    expect(completed.state.decision.kind).toBe('delivered');
    if (completed.state.decision.kind === 'delivered') {
      expect(completed.state.decision.resolution.integrationKind).toBe('live');
      expect(completed.state.decision.resolution.mode).toBe('Live');
    }
    // Und **nach** der Zustellung ist der Fall entschieden — auch mit Modus.
    expect(isNotesDropZoneModeCompletion(completed.state, routeWithMode(twoIntentPayload, 'Frozen'))).toBe(false);
    expect(chooseNotesDropIntent(completed.state, 'LIVE_REFERENCE', routeWithMode(twoIntentPayload, 'Frozen')).reason)
      .toBe('notes-drop-already-decided');
  });

  it('fragt den Modus nur, wenn eine Live-Route **wirklich** im Spiel ist', () => {
    const choice = dropNotesDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(notesDropZoneNeedsMode(choice)).toBe(true);
    // Nur die Kopie angeboten → **kein** Modus-Knopf.
    expect(notesDropZoneNeedsMode(hovered(oneIntentPayload))).toBe(false);
    expect(notesDropZoneNeedsMode(dropNotesDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state)).toBe(false);
    // Der benannte Modus-Fehlschlag hält die Frage **offen** — sonst verschwänden die Knöpfe genau dann, wenn sie
    // gebraucht werden.
    expect(notesDropZoneNeedsMode(chooseNotesDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload)).state)).toBe(true);
    // Eine zugestellte Kopie fragt nichts mehr.
    expect(notesDropZoneNeedsMode(chooseNotesDropIntent(choice, 'COPY', route(twoIntentPayload)).state)).toBe(false);
  });
});
