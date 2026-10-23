// STATUS: PLATIN — Integration & Release, **Paket 14**: Beweise für die Draw-Ablagezone
//
// Was hier **wirklich** geprüft wird: das Urteil **aus Paket 6** (nicht ein eigenes), der gelesene Träger **durch
// den einen Parser** (Paket 7), die Route **durch die vorhandene Matrix und den vorhandenen Resolver** (Paket 4),
// der Tastatur-Weg als **dieselbe** Auflösung, die Fail-closed-Gründe, die Touch-Entscheidung und das **Markup**
// (`DrawDropZoneOverlay.render.test.tsx`).
//
// Was hier **nicht** geprüft werden kann und deshalb `NOT_TESTED` bleibt: das **Binden** der Zeiger-, Ablage- und
// Tastenereignisse (`useDrawDropZone`) und die **echte** Berührung auf einem Gerät — dafür braucht es einen
// Browser mit Ereignissen und Touch. *Ein Test, der eine Bindung behauptet, ohne sie auszulösen, wäre eine
// Behauptung.*
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
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
  applyDrawDropCommand,
  chooseDrawDropIntent,
  confirmDrawDropZone,
  createDrawDropZone,
  drawDropCapabilityQuestion,
  drawDropZoneCanConfirm,
  drawDropZoneChoices,
  drawDropZoneFromDragSession,
  drawDropZonePresentation,
  drawDropZonePreview,
  drawDropZoneRefusalCode,
  drawDropZoneView,
  dropDrawDropZone,
  enterDrawDropZone,
  hoverDrawDropZone,
  isDrawDropZoneDecided,
  isDrawDropZoneVisible,
  isDrawWorkspaceDrag,
  leaveDrawDropZone,
  readDrawDropTransfer,
  readDrawWorkspaceTransfer,
  resolveDrawDropCommand,
} from '../../drop-zone/drawDropZone';
import type { DrawDropZoneContext } from '../../drop-zone/drawDropZone';
import {
  DRAW_DROP_INTENT_LABEL,
  DRAW_DROP_ZONE_ANNOUNCER_ID,
  DRAW_DROP_ZONE_PRESENTATION,
  drawDropObjectKindLabel,
  drawDropRefusalText,
} from '../../drop-zone/drawDropZoneContract';
import type { DrawDropZoneRefusal, DrawDropZoneView } from '../../drop-zone/drawDropZoneContract';
import {
  DRAW_DROP_ZONE_TOUCH_ACTION,
  DRAW_DROP_ZONE_TOUCH_CANCEL_REASON,
  drawDropInputKindFromPointerType,
  drawDropZoneInputHint,
  drawDropZoneKeyboardIsPointerFree,
  drawDropZoneLongPressMs,
  drawDropZoneTouchDecision,
  drawDropZoneTouchDragBegins,
  drawDropZoneTouchThresholdPx,
  drawDropZoneTouchWaits,
} from '../../drop-zone/drawDropZoneTouch';

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

/** Das Ziel **ist** eine Draw-Leinwand — daher `kind: 'Draw'` (und nicht ein geratener Name). */
const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'draw-target',
  title: 'Architecture sketch',
  kind: 'Draw',
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
 * Eine Matrix mit einer **Draw-Route**, aufgebaut mit der **echten** Klasse (Produktionsobjekt) — nicht mit einem
 * Attrappen-Objekt: *ein Prüfling, der die Regel nicht teilt, beweist die Regel nicht.* Die Produktion reicht die
 * versiegelte Matrix der Shell hinein (`FABRIC_WORKSPACE_DROP_REGISTRY`); hier wird derselbe Aufbau mit einer
 * Draw-Route gefahren, weil die Shell heute **keine** hat (siehe den Befund unten — `fabricGraphWorkspaceDrop.ts`
 * ist **nicht** mein Eigentum).
 */
function drawRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({
    app: 'Grid',
    exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
    imports: [],
  });
  registry.registerAppManifest({
    app: 'Draw',
    exports: [],
    imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
  });
  registry.registerAdapter({
    id: 'draw-canvas-table',
    targetApp: 'Draw',
    objectKinds: ['Table'],
    intents: ['COPY', 'LIVE_REFERENCE'],
  });
  return registry.seal();
}

const ROUTE_REGISTRY = drawRouteRegistry();

const contextWith = (registry: WorkspaceInteractionRegistry | null | undefined, payload?: unknown): DrawDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  payload,
});

const route = (payload?: unknown): DrawDropZoneContext => contextWith(ROUTE_REGISTRY, payload);
const authority = (payload?: unknown): DrawDropZoneContext => contextWith(FABRIC_WORKSPACE_DROP_REGISTRY, payload);

const closed = () => createDrawDropZone();
const hovered = (payload: unknown, registry: WorkspaceInteractionRegistry | null | undefined = ROUTE_REGISTRY) =>
  hoverDrawDropZone(closed(), contextWith(registry, payload)).state;

describe('Paket 14 — das leere Ziel', () => {
  it('beginnt geschlossen, ohne Urteil und ohne Träger', () => {
    const state = closed();
    expect(drawDropZoneView(state)).toBe('closed');
    expect(state.target.verdict).toBe('none');
    expect(state.target.overTarget).toBe(false);
    expect(drawDropZonePreview(state)).toBeNull();
    expect(state.transfer.ok).toBe(false);
    expect(state.decision.kind).toBe('none');
    expect(isDrawDropZoneVisible(state)).toBe(false);
    expect(isDrawDropZoneDecided(state)).toBe(false);
    expect(drawDropZonePresentation(state).glyph).toBe('');
  });

  it('schließt ein geschlossenes Ziel nicht still, sondern benannt', () => {
    const step = leaveDrawDropZone(closed());
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('draw-drop-inactive');
    expect(drawDropZoneView(step.state)).toBe('closed');
  });

  it('speichert **keine** View-Phase — sie ist gerechnet, nicht abgelegt', () => {
    // Zwei Felder für eine Tatsache wären genau der Defekt, den dieses Paket nicht wiederholen darf.
    expect(Object.keys(closed()).sort()).toEqual(['closedReason', 'decision', 'target', 'transfer']);
    expect(Object.hasOwn(closed(), 'view')).toBe(false);
    expect(Object.hasOwn(closed(), 'phase')).toBe(false);
  });
});

describe('Paket 14 — überfahren: das Urteil kommt aus Paket 6', () => {
  it('nimmt eine angebotene Route an und zeigt die Vorschau des Urteils', () => {
    const state = hovered(oneIntentPayload);
    expect(drawDropZoneView(state)).toBe('ready');
    expect(state.target.verdict).toBe('accept');
    expect(state.target.reason).toBeNull();
    expect(state.target.overTarget).toBe(true);
    // Die Vorschau ist die **des Urteils** (Paket 6), nicht eine zweite dieses Moduls.
    expect(drawDropZonePreview(state)).toEqual({ objectKind: 'Table', intent: 'COPY', label: 'Table · COPY' });
    expect(state.transfer.ok).toBe(true);
    if (state.transfer.ok) {
      expect(state.transfer.descriptor.objectKind).toBe('Table');
      expect(state.transfer.descriptor.sourceApp).toBe('Grid');
      expect(state.transfer.descriptor.supportedIntents).toEqual(['COPY']);
    }
    expect(drawDropZoneCanConfirm(state)).toBe(true);
    expect(drawDropZoneRefusalCode(state)).toBeNull();
  });

  it('faltet zwei angebotene Absichten zu **einem** annehmbaren Träger', () => {
    // Gegenprobe zum Defekt: würde nur die erste Absicht gefragt, wäre die Antwort von Quelle und Matrix
    // abhängig — und „überfahren: nein" bei „Route aufgelöst: ja" wäre möglich.
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
    expect(drawDropZoneView(state)).toBe('open');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    expect(state.transfer.ok).toBe(true);
    expect(drawDropZoneRefusalCode(state)).toBe('route-not-capable');
  });

  it('lehnt einen kaputten Träger benannt ab (payload_invalid)', () => {
    const state = hovered('{kein json');
    expect(state.transfer.ok).toBe(false);
    if (!state.transfer.ok) expect(state.transfer.reason).toBe('payload_invalid');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('object-kind-unknown');
    expect(drawDropZonePreview(state)).toBeNull();
    expect(drawDropZoneRefusalCode(state)).toBe('payload_invalid');
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
    if (!state.transfer.ok) expect(state.transfer.reason).toBe('draw-drop-transfer-missing');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('object-kind-unknown');
    expect(drawDropZoneCanConfirm(state)).toBe(false);
  });

  it('trägt jetzt die gemessene Draw-Route der Shell und bleibt fail-closed für alles andere', () => {
    // **Vorgezogener Marker (Paket 14, koordiniert mit der Shell):** dieser Test stand vorher auf dem
    // Produktionszustand **ohne** Draw-Route. Er ist **nicht** gelöscht, **nicht** geskippt und **nicht**
    // gelockert — er behauptet jetzt das **Gemessene**: die versiegelte Matrix trägt `fabric-grid-table-to-draw`
    // (Form A, `['COPY']`), die Ablage ist ein **vollendeter** Drop, und **alles andere bleibt fail-closed**.
    // *Eine Route in einer zweiten Datei zu registrieren wäre genau der Defekt, den dieses Paket verbietet —
    // deshalb hält dieser Test den Eintrag der **Shell** und nicht einen eigenen.*
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Draw', 'Table')).toEqual(['COPY']);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Draw', 'Table', 'COPY')?.id).toBe('fabric-grid-table-to-draw');
    const state = hovered(oneIntentPayload, FABRIC_WORKSPACE_DROP_REGISTRY);
    expect(state.target.verdict).toBe('accept');
    expect(state.target.reason).toBeNull();
    expect(drawDropZoneView(state)).toBe('ready');
    expect(drawDropZoneCanConfirm(state)).toBe(true);
    const dropped = dropDrawDropZone(state, authority(oneIntentPayload));
    expect(dropped.ok).toBe(true);
    expect(dropped.state.decision.kind).toBe('routed');
    if (dropped.state.decision.kind === 'routed') {
      expect(dropped.state.decision.route.adapterId).toBe('fabric-grid-table-to-draw');
      expect(dropped.state.decision.route.targetDocumentId).toBe(target.id);
    }
    // Grid → Draw ist **eine** Route für **eine** Objektart: ein `Chart` bleibt benannt abgelehnt.
    const chartPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: chartSource.id,
      objectId: 'chart-1',
      objectKind: 'Chart',
      sourceApp: 'Grid',
      supportedIntents: ['COPY'],
    }));
    const chartState = hovered(chartPayload, FABRIC_WORKSPACE_DROP_REGISTRY);
    expect(chartState.target.verdict).toBe('reject');
    expect(chartState.target.reason).toBe('route-not-capable');
    expect(drawDropZoneCanConfirm(chartState)).toBe(false);
    expect(dropDrawDropZone(chartState, authority(chartPayload)).state.decision.kind).toBe('refused');
    // Und die beiden Sonderabsichten — **für Draw gemessen**, nicht geerbt: die Fähigkeitsfrage fragt den Resolver.
    const movePayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['MOVE'],
    }));
    const frozenPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['FROZEN_SNAPSHOT'],
    }));
    // `MOVE` erreicht **nicht einmal `accept`** (der Resolver antwortet `drop_move_transaction_unavailable`), und
    // `FROZEN_SNAPSHOT` scheitert an der **Quelle** (Grid exportiert die Absicht nicht) — die Whiteboard/Notes-Form.
    expect(drawDropCapabilityQuestion(authority(movePayload))?.('Draw', 'Table', 'MOVE')).toBe(false);
    expect(drawDropCapabilityQuestion(authority(frozenPayload))?.('Draw', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
    for (const payload of [movePayload, frozenPayload]) {
      const special = hovered(payload, FABRIC_WORKSPACE_DROP_REGISTRY);
      expect(special.target.verdict).toBe('reject');
      expect(special.target.reason).toBe('route-not-capable');
      expect(drawDropZoneCanConfirm(special)).toBe(false);
    }
  });

  it('ist fail-closed, wenn die Autorität fehlt oder nicht antwortet', () => {
    for (const broken of [null, undefined]) {
      const state = hoverDrawDropZone(closed(), contextWith(broken, oneIntentPayload)).state;
      expect(state.target.verdict, String(broken)).toBe('reject');
      expect(state.target.reason).toBe('verdict-unavailable');
      expect(drawDropZoneView(state)).toBe('open');
    }
    const throwing = {
      isSealed: true,
      getAdapter: () => { throw new Error('kaputt'); },
      getCompatibleIntents: () => { throw new Error('kaputt'); },
    } as unknown as WorkspaceInteractionRegistry;
    // Überfahren: die Frage **wirft** in der Autorität → sie antwortet `false` → das Urteil lehnt ab (Paket 6).
    const state = hoverDrawDropZone(closed(), contextWith(throwing, oneIntentPayload)).state;
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    // Die Ablage wird vom **Urteil** aufgehalten (der eine Riegel) — nicht erst vom Resolver.
    expect(dropDrawDropZone(state, contextWith(throwing, oneIntentPayload)).reason).toBe('route-not-capable');
    // Die **Route** selbst ist ebenfalls fail-closed: sie wird hier über die Tastatur-Absicht erreicht, die das
    // Urteil nicht als Riegel vorschaltet — und nennt dann denselben Namen wie Paket 6 für „keine Antwort".
    expect(chooseDrawDropIntent(state, 'COPY', contextWith(throwing, oneIntentPayload)).reason).toBe('verdict-unavailable');
    expect(chooseDrawDropIntent(state, 'COPY', contextWith(null, oneIntentPayload)).reason).toBe('verdict-unavailable');
  });

  it('fragt nicht, wenn die Fläche ihr eigenes Ziel nicht kennt', () => {
    const noApp = hoverDrawDropZone(closed(), { ...route(oneIntentPayload), targetApp: '' });
    expect(noApp.ok).toBe(false);
    expect(noApp.reason).toBe('draw-drop-target-missing');
    expect(noApp.state.decision.kind).toBe('refused');
    const noDocument = hoverDrawDropZone(closed(), { ...route(oneIntentPayload), targetDocumentId: '' });
    expect(noDocument.ok).toBe(false);
    expect(noDocument.reason).toBe('draw-drop-target-missing');
  });

  it('baut die Fähigkeitsfrage nur mit einer lesbaren Antwort der Autorität', () => {
    expect(drawDropCapabilityQuestion(route(oneIntentPayload))).not.toBeNull();
    expect(drawDropCapabilityQuestion(route(undefined))).toBeNull();
    expect(drawDropCapabilityQuestion({ ...route(oneIntentPayload), registry: null })).toBeNull();
    const question = drawDropCapabilityQuestion(route(oneIntentPayload));
    expect(question?.('Draw', 'Table', 'COPY')).toBe(true);
    expect(question?.('Draw', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
  });
});

describe('Paket 14 — ablegen: eine Route, kein stiller Erfolg', () => {
  it('löst eine eindeutige Route auf, verbraucht das Urteil und verändert kein Dokument', () => {
    const before = structuredClone(documents);
    const state = hovered(oneIntentPayload);
    const step = dropDrawDropZone(state, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(drawDropZoneView(step.state)).toBe('resolved');
    expect(step.state.decision.kind).toBe('routed');
    if (step.state.decision.kind === 'routed') {
      expect(step.state.decision.route).toEqual({
        adapterId: 'draw-canvas-table',
        intent: 'COPY',
        // **Paket 15:** eine Kopie nennt ihre Art — und **keinen** Modus.
        integrationKind: 'copy',
        sourceDocumentId: source.id,
        sourceObjectId: 'table-forecast',
        targetDocumentId: target.id,
        sourceVersion: 3,
        targetVersion: 4,
      });
      // **Kein heimlicher Default** ✓✓: das Feld fehlt **ganz** — `toEqual` würde ein `mode: undefined` verschlucken,
      // deshalb wird die **Anwesenheit** geprüft.
      expect(Object.hasOwn(step.state.decision.route, 'mode')).toBe(false);
    }
    // Paket 6: **nach dem Ablegen ist das Ziel wieder leer** — ein stehengebliebenes „hier annehmen" wäre eine Lüge.
    expect(step.state.target.verdict).toBe('none');
    expect(step.state.target.overTarget).toBe(false);
    // Und die Tatsache, die der Resolver selbst nennt: er verändert **kein** Dokument.
    expect(documents).toEqual(before);
  });

  it('legt ohne gewählte Absicht nichts ab, sondern verlangt sie benannt', () => {
    const state = hovered(twoIntentPayload);
    const step = dropDrawDropZone(state, route(twoIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_intent_choice_required');
    expect(drawDropZoneView(step.state)).toBe('choice');
    expect(step.state.decision.kind).toBe('choice');
    expect(drawDropZoneChoices(step.state).map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
    expect(drawDropZoneChoices(step.state).map((choice) => choice.key)).toEqual(['1', '2']);
    expect(drawDropZoneChoices(step.state)[0]?.label).toBe(DRAW_DROP_INTENT_LABEL.COPY);
    expect(drawDropZoneCanConfirm(step.state)).toBe(false);
  });

  it('lehnt einen kaputten Träger mit dem Code des Parsers ab', () => {
    const step = dropDrawDropZone(closed(), route('{kein json'));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('payload_invalid');
    expect(drawDropZoneView(step.state)).toBe('refused');
    expect(drawDropZoneRefusalCode(step.state)).toBe('payload_invalid');
  });

  it('lehnt eine Ablage ohne Träger benannt ab, statt sie zu verschlucken', () => {
    const step = dropDrawDropZone(closed(), route(undefined));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('draw-drop-transfer-missing');
    expect(drawDropZoneView(step.state)).toBe('refused');
  });

  it('legt einen entschiedenen Fall nicht ein zweites Mal ab', () => {
    const routed = dropDrawDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const second = dropDrawDropZone(routed, route(oneIntentPayload));
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('draw-drop-already-decided');
    expect(second.state.decision.kind).toBe('routed');
  });

  it('nennt ein fehlendes Quellobjekt über den Resolver, wo das Urteil nur „keine Route" sagen kann', () => {
    const step = chooseDrawDropIntent(hovered(oneIntentPayload), 'COPY', {
      ...route(oneIntentPayload),
      documents: { [target.id]: target },
    });
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_source_document_missing');
  });

  it('legt ohne Canvas und ohne Zeiger ab: eine Ablage ohne vorheriges Überfahren wird benannt, nicht still', () => {
    // „Ablegen" auf eine noch geschlossene Fläche: das Urteil entsteht **hier** (Paket 6), nicht aus einem Hover.
    const step = dropDrawDropZone(closed(), route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('routed');
  });
});

describe('Paket 14 — die Tastatur ist ein Weg, kein Zusatz', () => {
  it('löst mit der Absicht genau so auf wie der Zeiger', () => {
    const ready = hovered(oneIntentPayload);
    const viaKeyboard = confirmDrawDropZone(ready, route(oneIntentPayload));
    const viaPointer = dropDrawDropZone(ready, route(oneIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision).toEqual(viaPointer.state.decision);
  });

  it('bestätigt **ohne** Überfahren — die Tastatur braucht die Leinwand nicht', () => {
    const fresh = closed();
    expect(fresh.target.overTarget).toBe(false);
    const step = confirmDrawDropZone(fresh, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('routed');
  });

  it('bestätigt im Zustand „Absicht erforderlich" nicht heimlich, sondern wörtlich wie die Ablage', () => {
    const choice = dropDrawDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    const viaEnter = confirmDrawDropZone(choice, route(twoIntentPayload));
    const viaDrop = dropDrawDropZone(choice, route(twoIntentPayload));
    expect(viaEnter).toEqual(viaDrop);
    expect(viaEnter.reason).toBe('drop_intent_choice_required');
  });

  it('führt die gewählte Absicht durch dieselbe Auflösung wie die Ablage — Live nur mit gesagtem Modus', () => {
    const choice = dropDrawDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    // **Paket 15, vorgezogen ✓✓** — *nicht gelöscht, nicht gelockert, nicht geskippt* ✓: Live **ohne** Modus bleibt
    // der **benannte** Fehlschlag ✓ (*kein heimlicher Default*).
    const ohneModus = chooseDrawDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload));
    expect(ohneModus.ok).toBe(false);
    expect(ohneModus.reason).toBe('drop_live_mode_required');
    // **Der Modusschritt ist gebaut:** Live **mit** gesagtem Modus wird zugestellt — mit `integrationKind: 'live'`
    // und **genau dem** Modus, der gesagt wurde (*nicht* Live als Vorgabe und *nicht* Frozen als Vorgabe).
    const live = chooseDrawDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Live' });
    expect(live.ok).toBe(true);
    expect(live.state.decision.kind).toBe('routed');
    if (live.state.decision.kind === 'routed') {
      expect(live.state.decision.route.integrationKind).toBe('live');
      expect(live.state.decision.route.mode).toBe('Live');
      expect(live.state.decision.route.intent).toBe('LIVE_REFERENCE');
      expect(live.state.decision.route.adapterId).toBe('draw-canvas-table');
    }
    const frozen = chooseDrawDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Frozen' });
    expect(frozen.ok).toBe(true);
    expect(frozen.state.decision.kind).toBe('routed');
    if (frozen.state.decision.kind === 'routed') {
      expect(frozen.state.decision.route.integrationKind).toBe('live');
      expect(frozen.state.decision.route.mode).toBe('Frozen');
    }
    // Ein **unbekannter** Modus ist **kein** Modus: fail-closed und benannt — *kein stiller Rückfall auf einen der beiden.*
    const unbekannt = chooseDrawDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Half' });
    expect(unbekannt.ok).toBe(false);
    expect(unbekannt.reason).toBe('drop_live_mode_required');
    // **Die Fähigkeitsfrage führt den Modus ebenfalls** ✓ — *sonst wäre ein Live-Verweis „nicht fähig", obwohl die
    // Route ihn trägt.* Gemessen an einer **Live-einzigen** Quelle:
    const liveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['LIVE_REFERENCE'],
    }));
    const liveReady = hoverDrawDropZone(closed(), { ...route(liveOnlyPayload), requestedMode: 'Live' });
    expect(liveReady.state.target.verdict).toBe('accept');
    expect(drawDropZoneCanConfirm(liveReady.state)).toBe(true);
    expect(drawDropCapabilityQuestion({ ...route(liveOnlyPayload), requestedMode: 'Frozen' })?.('Draw', 'Table', 'LIVE_REFERENCE')).toBe(true);
    // **Und ohne Modus bleibt es fail-closed**, aber **benannt auf dem Zustellweg**: der **Resolver** antwortet
    // `drop_live_mode_required` (oben geprüft). Die *Anzeige* trägt an dieser Stelle Paket 6's gefalteten Grund
    // `route-not-capable` — *Paket 6 kennt **fünf** Namen, und „Modus fehlt" ist keiner davon.* Das ist ein
    // **gemessener** Rest, kein stiller Erfolg.
    expect(drawDropCapabilityQuestion(route(liveOnlyPayload))?.('Draw', 'Table', 'LIVE_REFERENCE')).toBe(false);
    const ohneModusHover = hoverDrawDropZone(closed(), route(liveOnlyPayload));
    expect(ohneModusHover.state.target.verdict).toBe('reject');
    expect(ohneModusHover.state.target.reason).toBe('route-not-capable');
    expect(drawDropZoneCanConfirm(ohneModusHover.state)).toBe(false);
    // **Und der Zweck bleibt** ✓: die gewählte Absicht geht durch **dieselbe Auflösung** wie die Ablage ✓ — *über die Kopie*.
    const viaKeyboard = chooseDrawDropIntent(choice, 'COPY', route(twoIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision.kind).toBe('routed');
    if (viaKeyboard.state.decision.kind === 'routed') {
      expect(viaKeyboard.state.decision.route.intent).toBe('COPY');
      expect(viaKeyboard.state.decision.route.adapterId).toBe('draw-canvas-table');
      expect(viaKeyboard.state.decision.route.targetVersion).toBe(4);
      // **Kopie ohne `mode`** ✓✓ — das Feld fehlt **ganz**; `toEqual` würde ein `mode: undefined` verschlucken,
      // deshalb wird die **Anwesenheit** geprüft.
      expect(viaKeyboard.state.decision.route.integrationKind).toBe('copy');
      expect(Object.hasOwn(viaKeyboard.state.decision.route, 'mode')).toBe(false);
    }
  });

  it('lehnt eine nicht angebotene und eine unbekannte Absicht benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    expect(chooseDrawDropIntent(ready, 'FROZEN_SNAPSHOT', route(oneIntentPayload)).reason).toBe('drop_intent_not_supported');
    expect(chooseDrawDropIntent(ready, 'TELEPORT', route(oneIntentPayload)).reason).toBe('intent_unknown');
    // Ein bereits gelesener Träger **im Zustand** genügt der Tastatur — sie braucht keine Ablagefläche.
    expect(chooseDrawDropIntent(ready, 'COPY', route(undefined)).ok).toBe(true);
    // Ohne gelesenen Träger ist es ein **benannter** Grund, kein stiller No-op.
    expect(chooseDrawDropIntent(closed(), 'COPY', route(undefined)).reason).toBe('draw-drop-transfer-missing');
  });

  it('übersetzt Tasten in Absichten und nennt ungebundene Tasten', () => {
    const choice = dropDrawDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(resolveDrawDropCommand(choice, 'Enter')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveDrawDropCommand(choice, ' ')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveDrawDropCommand(choice, 'Escape')).toEqual({ ok: true, command: { kind: 'dismiss' } });
    expect(resolveDrawDropCommand(choice, '1')).toEqual({ ok: true, command: { kind: 'choose', intent: 'COPY' } });
    expect(resolveDrawDropCommand(choice, '2')).toEqual({ ok: true, command: { kind: 'choose', intent: 'LIVE_REFERENCE' } });
    expect(resolveDrawDropCommand(choice, '9')).toEqual({ ok: false, reason: 'draw-drop-key-unbound' });
    expect(resolveDrawDropCommand(choice, 'x')).toEqual({ ok: false, reason: 'draw-drop-key-unbound' });
    expect(resolveDrawDropCommand(choice, 2)).toEqual({ ok: false, reason: 'draw-drop-key-unbound' });
    // Eine Ziffer ist **nur** eine Absicht, wenn die Matrix eine angeboten hat.
    expect(resolveDrawDropCommand(hovered(twoIntentPayload), '1')).toEqual({ ok: false, reason: 'draw-drop-key-unbound' });
  });

  it('führt Befehle aus und lehnt unbekannte Befehle benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    const dismissed = applyDrawDropCommand(ready, { kind: 'dismiss' }, route(oneIntentPayload));
    expect(dismissed.state.decision.kind).toBe('none');
    expect(drawDropZoneView(dismissed.state)).toBe('closed');
    expect(dismissed.state.closedReason).toBe('keyboard-dismiss');
    const bogus = applyDrawDropCommand(ready, { kind: 'teleport' } as never, route(oneIntentPayload));
    expect(bogus.ok).toBe(false);
    expect(bogus.reason).toBe('draw-drop-command-unknown');
  });
});

describe('Paket 14 — der Zeiger überschreibt keine Tatsache', () => {
  it('löst einen entschiedenen Fall nur durch einen **neuen** Zug ab', () => {
    const routed = dropDrawDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(isDrawDropZoneDecided(routed)).toBe(true);
    expect(drawDropZoneView(hoverDrawDropZone(routed, route(oneIntentPayload)).state)).toBe('resolved');
    expect(drawDropZoneView(leaveDrawDropZone(routed, 'drag-left').state)).toBe('resolved');
    const entered = enterDrawDropZone(routed, route(twoIntentPayload));
    expect(drawDropZoneView(entered.state)).toBe('ready');
    expect(entered.state.decision.kind).toBe('none');
  });

  it('schließt eine nur überfahrene Fläche beim Verlassen und nimmt das Urteil zurück', () => {
    const step = leaveDrawDropZone(hovered(oneIntentPayload), 'drag-left');
    expect(step.ok).toBe(true);
    expect(drawDropZoneView(step.state)).toBe('closed');
    expect(step.state.closedReason).toBe('drag-left');
    expect(step.state.target.verdict).toBe('none');
    expect(step.state.target.preview).toBeNull();
    expect(step.state.transfer.ok).toBe(false);
  });
});

describe('Paket 14 — der Empfänger folgt der vorhandenen Zieh-Session (Paket 5)', () => {
  it('öffnet sich aus der laufenden Sitzung mit deren Träger', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, twoIntentPayload);
    expect(started.ok).toBe(true);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    expect(moved.state.phase).toBe('dragging');
    const step = drawDropZoneFromDragSession(closed(), moved.state, route());
    expect(drawDropZoneView(step.state)).toBe('ready');
    expect(step.state.target.preview?.objectKind).toBe('Table');
    expect(step.state.transfer.ok).toBe(true);
  });

  it('schließt eine überfahrene Fläche, wenn der Zug abgebrochen wird — mit **dessen** benanntem Grund', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, oneIntentPayload);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    const open = drawDropZoneFromDragSession(closed(), moved.state, route()).state;
    const cancelled = cancelDrag(moved.state, 'pointer-lost');
    const after = drawDropZoneFromDragSession(open, cancelled.state, route());
    expect(drawDropZoneView(after.state)).toBe('closed');
    // Der Grund der Sitzung wird **übernommen**, nicht eingeebnet: `pointercancel` heißt `pointer-lost`.
    expect(after.state.closedReason).toBe('pointer-lost');
    const blurred = cancelDrag(moved.state, 'window-blur');
    expect(drawDropZoneFromDragSession(open, blurred.state, route()).state.closedReason).toBe('window-blur');
    // Und ohne vorheriges Überfahren ist es ein **benannter** No-op.
    const idle = drawDropZoneFromDragSession(closed(), cancelled.state, route());
    expect(idle.ok).toBe(false);
    expect(idle.reason).toBe('draw-drop-inactive');
  });

  it('lässt eine aufgelöste Route stehen, wenn der Zug endet', () => {
    const routed = dropDrawDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const started = beginDrag(createDragSession(), { pointerId: 2, x: 0, y: 0 }, oneIntentPayload);
    const cancelled = cancelDrag(started.state, 'pointer-lost');
    const after = drawDropZoneFromDragSession(routed, cancelled.state, route(oneIntentPayload));
    expect(after.ok).toBe(true);
    expect(drawDropZoneView(after.state)).toBe('resolved');
  });
});

describe('Paket 14 — der Träger aus der Ablagefläche', () => {
  const transfer = (value: unknown) => ({ getData: (mime: string) => (mime === FABRIC_WORKSPACE_OBJECT_DRAG_MIME ? value : '') });

  it('liest genau die vorhandene MIME-Konstante', () => {
    expect(readDrawWorkspaceTransfer(transfer(oneIntentPayload))).toEqual({ ok: true, payload: oneIntentPayload });
  });

  it('nennt einen fehlenden Träger, statt ihn zu erfinden', () => {
    expect(readDrawWorkspaceTransfer(transfer(''))).toEqual({ ok: false, reason: 'draw-drop-transfer-missing' });
    expect(readDrawWorkspaceTransfer(null)).toEqual({ ok: false, reason: 'draw-drop-transfer-missing' });
  });

  it('nennt eine unlesbare Ablagefläche', () => {
    expect(readDrawWorkspaceTransfer({})).toEqual({ ok: false, reason: 'draw-drop-transfer-unreadable' });
    expect(readDrawWorkspaceTransfer({ getData: () => { throw new Error('kein Zugriff'); } }))
      .toEqual({ ok: false, reason: 'draw-drop-transfer-unreadable' });
  });

  it('erkennt den Zug an `types` — der Inhalt ist während `dragover` geschützt (W-443 wird nicht wiederholt)', () => {
    // **Der P1-Defekt aus Paket 9:** eine Fläche, die den Zug erst an `getData()` erkennt, ruft nie
    // `preventDefault()` und bekommt deshalb **nie** ein `drop`. Der Beanspruchungsblick geht auf `types`.
    expect(isDrawWorkspaceDrag({ types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME] })).toBe(true);
    expect(isDrawWorkspaceDrag({ types: ['Files'] })).toBe(false);
    expect(isDrawWorkspaceDrag({ types: [] })).toBe(false);
    expect(isDrawWorkspaceDrag({ types: { 0: FABRIC_WORKSPACE_OBJECT_DRAG_MIME, length: 1 } })).toBe(true);
    expect(isDrawWorkspaceDrag({ types: FABRIC_WORKSPACE_OBJECT_DRAG_MIME })).toBe(true);
    expect(isDrawWorkspaceDrag({ types: 'Files' })).toBe(false);
    expect(isDrawWorkspaceDrag({ types: null })).toBe(false);
    expect(isDrawWorkspaceDrag({})).toBe(false);
    expect(isDrawWorkspaceDrag(null)).toBe(false);
    expect(isDrawWorkspaceDrag(undefined)).toBe(false);
    // Und der Inhalt allein ist **kein** Nachweis: die Ablagefläche im geschützten Modus liefert ihn nicht.
    const contentOnly: { readonly types?: unknown; readonly getData?: () => string } = { getData: () => oneIntentPayload };
    expect(isDrawWorkspaceDrag(contentOnly)).toBe(false);
  });

  it('liest den Träger durch den einen Parser (Paket 7) und gibt dessen Deskriptor weiter', () => {
    const read = readDrawDropTransfer(oneIntentPayload);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.descriptor.objectKind).toBe('Table');
      expect(read.descriptor.documentId).toBe(source.id);
      expect(read.descriptor.objectId).toBe('table-forecast');
    }
    expect(readDrawDropTransfer(undefined).ok).toBe(false);
    expect(readDrawDropTransfer(42).ok).toBe(false);
  });
});

describe('Paket 14 — Touch ist entschieden, nicht angenommen', () => {
  it('liest den Langdruck und die Toleranz aus Paket 5/6, statt eine zweite Zahl zu setzen', () => {
    expect(drawDropZoneLongPressMs()).toBe(DRAG_TOUCH_LONGPRESS_MS);
    expect(drawDropZoneTouchThresholdPx()).toBe(dragThresholdForInput('touch', DRAG_THRESHOLD_PX));
    expect(drawDropZoneTouchWaits()).toBe(true);
    expect(drawDropZoneKeyboardIsPointerFree()).toBe(true);
  });

  it('beginnt einen Touch-Zug erst nach Langdruck innerhalb der Toleranz', () => {
    const long = drawDropZoneLongPressMs();
    const tolerance = drawDropZoneTouchThresholdPx();
    expect(drawDropZoneTouchDragBegins(long - 1, 0)).toBe(false);
    expect(drawDropZoneTouchDragBegins(long, 0)).toBe(true);
    expect(drawDropZoneTouchDragBegins(long + 1, tolerance)).toBe(true);
    expect(drawDropZoneTouchDragBegins(long + 1, tolerance + 1)).toBe(false);
  });

  it('ist bei unbrauchbaren Zahlen fail-closed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, '250', null, undefined]) {
      expect(drawDropZoneTouchDragBegins(bad, 0), String(bad)).toBe(false);
      expect(drawDropZoneTouchDragBegins(1000, bad), String(bad)).toBe(false);
    }
  });

  it('stiehlt der Leinwand die Geste nicht: `manipulation`, nie `none` — und die Zeichengeste bleibt beim Canvas', () => {
    expect(DRAW_DROP_ZONE_TOUCH_ACTION).toBe('manipulation');
    expect(DRAW_DROP_ZONE_TOUCH_ACTION).not.toBe('none');
    const decision = drawDropZoneTouchDecision('touch');
    expect(decision.touchAction).toBe(DRAW_DROP_ZONE_TOUCH_ACTION);
    expect(decision.keepsPanning).toBe(true);
    expect(decision.claimsPointerGesture).toBe(false);
    expect(decision.drawingGestureStaysWithCanvas).toBe(true);
    expect(drawDropZoneInputHint('touch')).toContain(`touch-action: ${DRAW_DROP_ZONE_TOUCH_ACTION}`);
    expect(drawDropZoneInputHint('touch')).toContain(String(drawDropZoneLongPressMs()));
    expect(drawDropZoneInputHint('touch')).toContain('stays with the canvas');
    expect(drawDropZoneInputHint('keyboard')).toContain('no pointer');
    expect(drawDropZoneInputHint('pen')).toContain('Pointer');
    expect(drawDropZoneTouchDecision('keyboard').waitsForLongPress).toBe(false);
    expect(drawDropZoneTouchDecision('mouse').thresholdPx).toBe(DRAG_THRESHOLD_PX);
  });

  it('übersetzt die Zeigerart **einmal** — und `keyboard` kommt von keinem Zeiger', () => {
    expect(drawDropInputKindFromPointerType('touch')).toBe('touch');
    expect(drawDropInputKindFromPointerType('pen')).toBe('pen');
    expect(drawDropInputKindFromPointerType('mouse')).toBe('mouse');
    for (const unknown of [undefined, null, '', 'stylus', 7, {}]) {
      expect(drawDropInputKindFromPointerType(unknown), String(unknown)).toBe('mouse');
    }
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session', () => {
    expect(DRAW_DROP_ZONE_TOUCH_CANCEL_REASON).toBe('pointer-lost');
    const closedByTouch = leaveDrawDropZone(hovered(oneIntentPayload), DRAW_DROP_ZONE_TOUCH_CANCEL_REASON);
    expect(closedByTouch.state.closedReason).toBe('pointer-lost');
    expect(drawDropZoneView(closedByTouch.state)).toBe('closed');
  });
});

describe('Paket 14 — das Vokabular ist eine Definition', () => {
  it('nimmt die Objektart- und Absichtswörter aus der vorhandenen Fabric-Oberfläche', () => {
    expect(drawDropObjectKindLabel('Table')).toBe(FABRIC_GRAPH_COPY['en-US'].objectType.Table);
    expect(DRAW_DROP_INTENT_LABEL.COPY).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy);
    expect(DRAW_DROP_INTENT_LABEL.LIVE_REFERENCE).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink);
  });

  it('nimmt die Sätze der Matrix-Codes aus dem Fehler selbst, statt sie zweimal zu schreiben', () => {
    for (const code of ['payload_invalid', 'registry_adapter_route_missing', 'drop_authorization_failed', 'intent_unknown'] as const) {
      expect(drawDropRefusalText(code), code).toBe(new WorkspaceInteractionError(code).message);
    }
  });

  it('hat für jeden eigenen Grund und jeden Urteilsgrund einen sichtbaren Satz', () => {
    const own: readonly DrawDropZoneRefusal[] = [
      'draw-drop-transfer-missing',
      'draw-drop-transfer-unreadable',
      'draw-drop-target-missing',
      'draw-drop-inactive',
      'draw-drop-already-decided',
      'draw-drop-command-unknown',
      'draw-drop-key-unbound',
      'object-kind-unknown',
      'intent-unknown',
      'route-not-capable',
      'payload-missing',
      'verdict-unavailable',
    ];
    for (const code of own) {
      const text = drawDropRefusalText(code);
      expect(text.length, code).toBeGreaterThan(10);
      expect(text, code).not.toBe(code);
    }
  });

  it('gibt jedem View-Zustand ein eigenes Zeichen, eine eigene Form und eigene Worte', () => {
    const views: DrawDropZoneView[] = ['closed', 'open', 'ready', 'choice', 'refused', 'resolved'];
    const signatures = new Set<string>();
    for (const view of views) {
      const presentation = DRAW_DROP_ZONE_PRESENTATION[view];
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
    }
    expect(signatures.size).toBe(views.length);
    // Die Ansageregion hat **eine** Kennung — die Fläche verweist darauf, statt eine zweite Region zu bauen.
    expect(DRAW_DROP_ZONE_ANNOUNCER_ID).toBe('draw-drop-zone-announcer');
  });

  it('rechnet die View-Phase aus Urteil und Route', () => {
    expect(drawDropZoneView(closed())).toBe('closed');
    expect(drawDropZoneView(hovered(oneIntentPayload))).toBe('ready');
    // **Vorgezogen** (koordinierter Shell-Eintrag, Form A): die **versiegelte** Matrix trägt die Draw-Route.
    expect(drawDropZoneView(hovered(oneIntentPayload, FABRIC_WORKSPACE_DROP_REGISTRY))).toBe('ready');
    const choice = dropDrawDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(drawDropZoneView(choice)).toBe('choice');
    const refused = dropDrawDropZone(closed(), route('{kein json')).state;
    expect(drawDropZoneView(refused)).toBe('refused');
    const routed = dropDrawDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(drawDropZoneView(routed)).toBe('resolved');
    // Und die Präsentation folgt der gerechneten Phase (eine Quelle für die Ansicht).
    expect(drawDropZonePresentation(routed).glyph).toBe(DRAW_DROP_ZONE_PRESENTATION.resolved.glyph);
  });
});
