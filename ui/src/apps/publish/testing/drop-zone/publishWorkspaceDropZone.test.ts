// STATUS: PLATIN — Integration & Release, **Paket 13**: Beweise für die Publish-Ablagezone
//
// Was hier **wirklich** geprüft wird: das Urteil **aus Paket 6** (nicht ein eigenes), der gelesene Träger **durch
// den einen Parser** (Paket 7), die Zustellung **durch die vorhandene Matrix und den vorhandenen Resolver**
// (Paket 4), der Tastatur-Weg als **dieselbe** Zustellung, die Fail-closed-Gründe, der **Anspruch an `types`**
// (der P1-Defekt `W-443`) und die Touch-Entscheidung.
//
// **Der Produktionsbefund steht als Test drin** und wird nicht schöngeredet: die versiegelte Matrix der Shell
// (`FABRIC_WORKSPACE_DROP_REGISTRY`) trägt die Publish-Route seit **Paket 13** (Form A, **für Publish gemessen**) —
// ein Publish-Ablageversuch ist damit eine **vollendete** Zustellung. Wo keine Route trägt, bleibt es eine
// **benannte** Ablehnung (`route-not-capable`): fail-closed, kein stiller Erfolg.
// Die Vokabeln (`['Table']`, `['COPY']`) und die Ausschlüsse (`MOVE`, `FROZEN_SNAPSHOT`) sind **gemessen**, jeder
// mit seinem **eigenen** Publish-Grund; Annehmen und Zustellen wird zusätzlich gegen eine **echte**
// `WorkspaceInteractionRegistry` in einem zweiten Aufbau bewiesen: *die Regel bleibt eine, der Prüfling darf ein
// zweiter Aufbau sein.*
//
// Was hier **nicht** geprüft werden kann und deshalb `NOT_TESTED` bleibt: das **Binden** der Ereignisse
// (`usePublishWorkspaceDropZone`), die **echte** Geste (`dragenter` / `dragover` / `drop` / `pointercancel`),
// `touch-action` auf einem Gerät und jede Screenshot-Prüfung — dafür braucht es einen Browser.
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
import {
  DRAG_TOUCH_LONGPRESS_MS,
  dragInputKindFromPointerType,
  dragThresholdForInput,
} from '../../../../shell/workspace/drag/dragDropVerdict';
import {
  DRAG_THRESHOLD_PX,
  beginDrag,
  cancelDrag,
  createDragSession,
  moveDrag,
} from '../../../../shell/workspace/drag/dragSession';
import {
  applyPublishWorkspaceDropCommand,
  choosePublishWorkspaceDropIntent,
  claimPublishWorkspaceDropZone,
  confirmPublishWorkspaceDropZone,
  createPublishWorkspaceDropZone,
  dropPublishWorkspaceDropZone,
  enterPublishWorkspaceDropZone,
  holdPublishWorkspaceDropZone,
  hoverPublishWorkspaceDropZone,
  isPublishWorkspaceDrag,
  isPublishWorkspaceDropZoneDecided,
  isPublishWorkspaceDropZoneVisible,
  leavePublishWorkspaceDropZone,
  publishWorkspaceDropCapabilityQuestion,
  publishWorkspaceDropIntentLabelOf,
  publishWorkspaceDropZoneCanConfirm,
  publishWorkspaceDropZoneChoices,
  publishWorkspaceDropZoneFromDragSession,
  publishWorkspaceDropZonePreview,
  publishWorkspaceDropZoneRefusalCode,
  publishWorkspaceDropZoneView,
  readPublishWorkspaceDropTransfer,
  readPublishWorkspaceTransfer,
  resolvePublishWorkspaceDropCommand,
} from '../../drop-zone/publishWorkspaceDropZone';
import type { PublishWorkspaceDropZoneContext } from '../../drop-zone/publishWorkspaceDropZone';
import {
  PUBLISH_WORKSPACE_DROP_INTENT_LABEL,
  PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION,
  publishWorkspaceDropObjectKindLabel,
  publishWorkspaceDropRefusalText,
} from '../../drop-zone/publishWorkspaceDropZoneContract';
import type { PublishWorkspaceDropZoneRefusal, PublishWorkspaceDropZoneView } from '../../drop-zone/publishWorkspaceDropZoneContract';
import {
  PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION,
  PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_CANCEL_REASON,
  publishWorkspaceDropTouchStrategy,
  publishWorkspaceDropZoneInputHint,
  publishWorkspaceDropZoneKeyboardIsPointerFree,
  publishWorkspaceDropZoneLongPressMs,
  publishWorkspaceDropZoneTouchDragBegins,
  publishWorkspaceDropZoneTouchThresholdPx,
  publishWorkspaceDropZoneTouchWaits,
} from '../../drop-zone/publishWorkspaceDropZoneTouch';

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

/** Das Ziel **ist** eine Publish-Fläche — daher `kind: 'Publish'`. */
const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'publish-target',
  title: 'Annual report',
  kind: 'Publish',
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
 * Eine Matrix mit einer **Publish-Route**, aufgebaut mit der **echten** Klasse (Produktionsobjekt) — nicht mit
 * einem Attrappen-Objekt: *ein Prüfling, der die Regel nicht teilt, beweist die Regel nicht.*
 *
 * Die Produktion reicht die versiegelte Matrix der Shell hinein (`FABRIC_WORKSPACE_DROP_REGISTRY`), und die trägt
 * die Publish-Route seit dem Eintrag von Paket 13 (Form A, für Publish gemessen). Dieser **zweite** Aufbau bleibt
 * trotzdem stehen: er zeigt, dass die Fläche gegen eine **gesetzmäßig aufgebaute** Matrix **derselben** Klasse
 * arbeitet (Paket 4) — *die Regel bleibt eine, der Prüfling darf ein zweiter Aufbau sein.*
 */
function publishRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({
    app: 'Grid',
    exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
    imports: [],
  });
  registry.registerAppManifest({
    app: 'Publish',
    exports: [],
    imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
  });
  registry.registerAdapter({
    id: 'publish-page-table',
    targetApp: 'Publish',
    objectKinds: ['Table'],
    intents: ['COPY', 'LIVE_REFERENCE'],
  });
  return registry.seal();
}

const ROUTE_REGISTRY = publishRouteRegistry();

const contextWith = (registry: WorkspaceInteractionRegistry | null | undefined, payload?: unknown): PublishWorkspaceDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  payload,
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: die Zone liest die Entscheidung der Administratorrichtlinie
  // aus ihrem Kontext ✓✓ (`publishWorkspaceDropZone.ts`, Frage **und** Zustellung). *In der Produktion holt die
  // Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* — **hier** steht sie als `Allow` ✓, *weil
  // dieser Vertrag die **Route** bezeugt und nicht die Richtlinie* ✓. *Der Richtlinien-Zeuge ist ein **eigener**
  // Vertrag* (`src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`) ✓✓.
  requestedPolicyDecision: { effect: 'Allow' },
});

const route = (payload?: unknown): PublishWorkspaceDropZoneContext => contextWith(ROUTE_REGISTRY, payload);
const authority = (payload?: unknown): PublishWorkspaceDropZoneContext => contextWith(FABRIC_WORKSPACE_DROP_REGISTRY, payload);
/**
 * **Paket 15:** derselbe Aufbau, aber mit **gesagtem** Modus — *der Modus wird gefragt, nicht angenommen.*
 * `mode` bleibt `unknown`, weil der Resolver die Vokabel prüft (`drop_live_mode_required`) — *eine eigene
 * Vorprüfung wäre eine zweite Wahrheit.*
 */
const withMode = (mode: unknown, payload: unknown = twoIntentPayload): PublishWorkspaceDropZoneContext => ({
  ...route(payload),
  requestedMode: mode,
});

const closed = () => createPublishWorkspaceDropZone();
const hovered = (payload: unknown, registry: WorkspaceInteractionRegistry | null | undefined = ROUTE_REGISTRY) =>
  hoverPublishWorkspaceDropZone(closed(), contextWith(registry, payload)).state;
const mime = (types: unknown, getData?: () => unknown) => ({ types, getData });

describe('Paket 13 — das leere Ziel', () => {
  it('beginnt geschlossen, ohne Urteil und ohne gelesenen Träger', () => {
    const state = closed();
    expect(publishWorkspaceDropZoneView(state)).toBe('closed');
    expect(state.target.verdict).toBe('none');
    expect(state.target.overTarget).toBe(false);
    expect(publishWorkspaceDropZonePreview(state)).toBeNull();
    expect(state.transfer.ok).toBe(false);
    expect(state.decision.kind).toBe('none');
    expect(isPublishWorkspaceDropZoneVisible(state)).toBe(false);
    expect(isPublishWorkspaceDropZoneDecided(state)).toBe(false);
    expect(PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION.closed.glyph).toBe('');
  });

  it('schließt ein geschlossenes Ziel nicht still, sondern benannt', () => {
    const step = leavePublishWorkspaceDropZone(closed());
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('publish-drop-inactive');
    expect(publishWorkspaceDropZoneView(step.state)).toBe('closed');
  });

  it('meldet im leeren Zustand **keinen** Grund — es gibt keinen Zug, über den etwas zu sagen wäre', () => {
    // Der Trägerzustand einer Fläche ohne Zug ist **keine** Auskunft über einen Zug. Eine Anzeige, die dort
    // „geschützt" sagt, behauptet einen Zug, den es nicht gibt.
    expect(publishWorkspaceDropZoneRefusalCode(closed())).toBeNull();
  });

  it('speichert die View-Phase **nicht** — sie wird gerechnet', () => {
    expect(Object.keys(closed()).sort()).toEqual(['closedReason', 'decision', 'target', 'transfer']);
  });
});

describe('Paket 13 — überfahren: das Urteil kommt aus Paket 6', () => {
  it('nimmt eine angebotene Route an und zeigt die Vorschau des Urteils', () => {
    const state = hovered(oneIntentPayload);
    expect(publishWorkspaceDropZoneView(state)).toBe('ready');
    expect(state.target.verdict).toBe('accept');
    expect(state.target.reason).toBeNull();
    expect(state.target.overTarget).toBe(true);
    // Die Vorschau ist die **des Urteils** (Paket 6), nicht eine zweite dieses Moduls.
    expect(publishWorkspaceDropZonePreview(state)).toEqual({ objectKind: 'Table', intent: 'COPY', label: 'Table · COPY' });
    expect(state.transfer.ok).toBe(true);
    if (state.transfer.ok) {
      expect(state.transfer.descriptor.objectKind).toBe('Table');
      expect(state.transfer.descriptor.sourceApp).toBe('Grid');
      expect(state.transfer.descriptor.supportedIntents).toEqual(['COPY']);
    }
    expect(publishWorkspaceDropZoneCanConfirm(state)).toBe(true);
    expect(publishWorkspaceDropZoneRefusalCode(state)).toBeNull();
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
    expect(publishWorkspaceDropZoneView(state)).toBe('open');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    expect(state.transfer.ok).toBe(true);
    expect(publishWorkspaceDropZoneRefusalCode(state)).toBe('route-not-capable');
  });

  it('lehnt einen kaputten Träger mit dem Code des Parsers ab (payload_invalid)', () => {
    const state = hovered('{kein json');
    expect(state.transfer.ok).toBe(false);
    if (!state.transfer.ok) expect(state.transfer.reason).toBe('payload_invalid');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('object-kind-unknown');
    expect(publishWorkspaceDropZonePreview(state)).toBeNull();
    expect(publishWorkspaceDropZoneRefusalCode(state)).toBe('payload_invalid');
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

  it('trägt jetzt die Publish-Route — der Drop ist **vollendet** (der Marker ist eingelöst)', () => {
    // **Vorgezogen (Paket 13), nicht gelöscht und nicht gelockert:** dieser Test hielt den gemessenen Zustand
    // fest, dass die versiegelte Matrix **keine** Publish-Route trägt und ein Publish-Ablageversuch deshalb eine
    // benannte Ablehnung (`route-not-capable`) ist. Der Eintrag ist jetzt gesetzt — *ein Test, der einen bekannten
    // Falschzustand festhält, ist ein Übergangsmarker; er wird auf den neuen gemessenen Zustand gezogen.*
    //
    // Die Vokabeln sind **Literale aus der Messung**, keine Erfindung — und die Sonde zeigt, dass der neue Pfad
    // wirklich läuft: die eine Autorität trägt jetzt genau diese Route.
    /**
     * **Der Übergangsmarker ist eingelöst** (`AST-1411/1412`) ✓✓.
     *
     * Vorher pinnte diese Zusage den damaligen Stand **korrekt**: Publish importierte für `Table` **nur** `COPY`.
     * Paket 15 heisst „Tabellen und **Grid-Datalinks**" — *ein Datalink verlangt eine Verknüpfung*, also trägt die
     * Matrix jetzt **beide** Absichten. `COPY` **bleibt**: *ein eingefrorener Tabellenstand ist ein Stand, kein
     * unsichtbares Rechteck.* Gezogen auf den **neuen gemessenen** Zustand — nicht gelöscht, nicht gelockert.
     */
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Publish')).toEqual({
      app: 'Publish',
      exports: [],
      imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
    });
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Publish', 'Table')).toEqual(['COPY', 'LIVE_REFERENCE']);
    // Der Adapter antwortet für **beide** Absichten — und weiterhin für die alte.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Publish', 'Table', 'COPY')?.id).toBe('fabric-grid-table-to-publish');
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Publish', 'Table', 'LIVE_REFERENCE')?.id).toBe('fabric-grid-table-to-publish');

    const state = hovered(oneIntentPayload, FABRIC_WORKSPACE_DROP_REGISTRY);
    expect(state.target.verdict).toBe('accept');
    expect(state.target.reason).toBeNull();
    expect(publishWorkspaceDropZoneView(state)).toBe('ready');
    expect(publishWorkspaceDropZoneCanConfirm(state)).toBe(true);
    const dropped = dropPublishWorkspaceDropZone(state, authority(oneIntentPayload));
    expect(dropped.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(dropped.state)).toBe('resolved');
    if (dropped.state.decision.kind === 'delivered') {
      expect(dropped.state.decision.resolution).toEqual({
        adapterId: 'fabric-grid-table-to-publish',
        // **Paket 15:** die Zustellung sagt **wie** — eine Kopie trägt `'copy'` und **keinen** Modus.
        integrationKind: 'copy',
        intent: 'COPY',
        sourceDocumentId: source.id,
        sourceObjectId: 'table-forecast',
        targetDocumentId: target.id,
        sourceVersion: 3,
        targetVersion: 4,
      });
    }
  });

  it('bleibt fail-closed und **benannt**, wo keine Route trägt — der Eintrag heilt nur seine eigene Vokabel', () => {
    // Der Teil des alten Markers, der **auch nach** dem Eintrag gilt: eine Objektart, die die Matrix nicht trägt,
    // bleibt eine **benannte** Ablehnung mit sichtbarem Satz — kein stiller Erfolg. *Fail-closed ist keine
    // Eigenschaft des Eintrags, sondern der Fläche.*
    const chartPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: chartSource.id,
      objectId: 'chart-1',
      objectKind: 'Chart',
      sourceApp: 'Grid',
      supportedIntents: ['COPY'],
    }));
    const state = hovered(chartPayload, FABRIC_WORKSPACE_DROP_REGISTRY);
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    expect(publishWorkspaceDropZoneView(state)).toBe('open');
    // Der Träger ist gelesen, das Urteil lehnt ab → „ablegen" darf **nicht** aktiv aussehen.
    expect(publishWorkspaceDropZoneCanConfirm(state)).toBe(false);
    const dropped = dropPublishWorkspaceDropZone(state, authority(chartPayload));
    expect(dropped.ok).toBe(false);
    expect(dropped.reason).toBe('route-not-capable');
    expect(dropped.state.decision.kind).toBe('refused');
    expect(publishWorkspaceDropZoneView(dropped.state)).toBe('refused');
    // Und der Grund ist ein **Satz**, kein leerer Zustand.
    expect(publishWorkspaceDropRefusalText('route-not-capable').length).toBeGreaterThan(10);
  });

  it('bleibt auch **ohne** Quellenliste eine benannte Ablehnung', () => {
    // Der Resolver kennt die **Quelle** nicht, wenn die Dokumentliste sie nicht führt (z. B. eine eingebettete
    // Ansicht ohne Dokumentliste). Er antwortet `drop_source_document_missing` — die Fläche macht daraus
    // **denselben** benannten Zustand: *kein stiller Erfolg, und kein zweiter Grund, der die Ursache verschweigt.*
    const withoutSources = { ...authority(oneIntentPayload), documents: { [target.id]: target } };
    const state = hoverPublishWorkspaceDropZone(closed(), withoutSources).state;
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    const dropped = dropPublishWorkspaceDropZone(state, withoutSources);
    expect(dropped.ok).toBe(false);
    expect(dropped.state.decision.kind).toBe('refused');
    // Der **Resolver**-Grund dahinter, wörtlich — *damit der Satz darüber gemessen ist und nicht geraten.*
    expect(choosePublishWorkspaceDropIntent(state, 'COPY', withoutSources).reason).toBe('drop_source_document_missing');
  });

  it('ist fail-closed, wenn die Autorität fehlt oder nicht antwortet', () => {
    // **Ohne** den Helfer aufgerufen: `hovered(…, undefined)` würde dessen Vorgabewert greifen lassen und damit
    // gerade **nicht** den fehlenden Registry-Fall prüfen — der Fehler steckte im Prüfstand, nicht im Code.
    for (const broken of [null, undefined]) {
      const state = hoverPublishWorkspaceDropZone(closed(), contextWith(broken, oneIntentPayload)).state;
      expect(state.target.verdict, String(broken)).toBe('reject');
      expect(state.target.reason).toBe('verdict-unavailable');
      expect(publishWorkspaceDropZoneView(state)).toBe('open');
    }
    const throwing = {
      isSealed: true,
      getAdapter: () => { throw new Error('kaputt'); },
      getCompatibleIntents: () => { throw new Error('kaputt'); },
    } as unknown as WorkspaceInteractionRegistry;
    // Überfahren: die Frage **wirft** in der Autorität → sie antwortet `false` → das Urteil lehnt ab (Paket 6).
    const state = hoverPublishWorkspaceDropZone(closed(), contextWith(throwing, oneIntentPayload)).state;
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    // Die Ablage wird vom **Urteil** aufgehalten (der eine Riegel) — nicht erst vom Resolver.
    expect(dropPublishWorkspaceDropZone(state, contextWith(throwing, oneIntentPayload)).reason).toBe('route-not-capable');
    // Die **Zustellung** selbst ist ebenfalls fail-closed: sie wird hier über die Tastatur-Absicht erreicht, die
    // das Urteil nicht als Riegel vorschaltet — und nennt dann denselben Namen wie Paket 6 für „keine Antwort".
    expect(choosePublishWorkspaceDropIntent(state, 'COPY', contextWith(throwing, oneIntentPayload)).reason).toBe('verdict-unavailable');
    expect(choosePublishWorkspaceDropIntent(state, 'COPY', contextWith(null, oneIntentPayload)).reason).toBe('verdict-unavailable');
  });

  it('fragt nicht, wenn die Fläche ihr eigenes Ziel nicht kennt', () => {
    const noApp = hoverPublishWorkspaceDropZone(closed(), { ...route(oneIntentPayload), targetApp: '' });
    expect(noApp.ok).toBe(false);
    expect(noApp.reason).toBe('publish-drop-target-missing');
    expect(noApp.state.decision.kind).toBe('refused');
    const noDocument = hoverPublishWorkspaceDropZone(closed(), { ...route(oneIntentPayload), targetDocumentId: '' });
    expect(noDocument.ok).toBe(false);
    expect(noDocument.reason).toBe('publish-drop-target-missing');
  });

  it('baut die Fähigkeitsfrage nur mit einer lesbaren Antwort der Autorität', () => {
    expect(publishWorkspaceDropCapabilityQuestion(route(oneIntentPayload))).not.toBeNull();
    expect(publishWorkspaceDropCapabilityQuestion(route(undefined))).toBeNull();
    expect(publishWorkspaceDropCapabilityQuestion({ ...route(oneIntentPayload), registry: null })).toBeNull();
    const question = publishWorkspaceDropCapabilityQuestion(route(oneIntentPayload));
    expect(question?.('Publish', 'Table', 'COPY')).toBe(true);
    expect(question?.('Publish', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
  });
});

describe('Paket 13 — der P1-Defekt W-443: der Anspruch liest `types`, nie den Inhalt', () => {
  it('beansprucht den Zug **ohne** lesbaren Inhalt — und nennt den Grund „geschützt", nicht „fehlt"', () => {
    // Das ist der geschützte Modus des Browsers: `types` ist sichtbar, `getData()` liefert nichts. Eine Fläche,
    // die hier auf den Inhalt wartet, ruft **nie** `preventDefault()` und bekommt **nie** ein `drop`.
    const claim = claimPublishWorkspaceDropZone(closed(), route(), mime([FABRIC_WORKSPACE_OBJECT_DRAG_MIME], () => ''));
    expect(claim.ok).toBe(true);
    expect(claim.state.target.overTarget).toBe(true);
    expect(publishWorkspaceDropZoneView(claim.state)).toBe('open');
    expect(claim.state.transfer.ok).toBe(false);
    if (!claim.state.transfer.ok) expect(claim.state.transfer.reason).toBe('publish-drop-transfer-protected');
    expect(publishWorkspaceDropZoneRefusalCode(claim.state)).toBe('publish-drop-transfer-protected');
    // Und der Satz sagt die Wahrheit über diesen Zustand — nicht „es wurde nichts übergeben".
    expect(publishWorkspaceDropRefusalText('publish-drop-transfer-protected')).not.toBe(
      publishWorkspaceDropRefusalText('publish-drop-transfer-missing'),
    );
  });

  it('beansprucht **nicht**, was nicht uns gehört — der Datei-Empfänger behält seinen Zug', () => {
    for (const foreign of [mime(['Files']), mime(['text/plain']), mime([]), mime(null), mime(undefined), null, undefined, {}]) {
      const claim = claimPublishWorkspaceDropZone(closed(), route(), foreign);
      expect(claim.ok, JSON.stringify(foreign)).toBe(false);
      if (!claim.ok) {
        expect(claim.reason).toBe('publish-drop-foreign-drag');
        // **Kein** Zustand gesetzt: ein fremder Zug verändert unsere Fläche nicht.
        expect(claim.state).toEqual(closed());
      }
    }
  });

  it('liest den Inhalt, **wenn** der Browser ihn schon herausgibt (kein zweiter Weg)', () => {
    const claim = claimPublishWorkspaceDropZone(closed(), route(), mime([FABRIC_WORKSPACE_OBJECT_DRAG_MIME], () => oneIntentPayload));
    expect(claim.ok).toBe(true);
    expect(claim.state.transfer.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(claim.state)).toBe('ready');
    expect(publishWorkspaceDropZonePreview(claim.state)?.label).toBe('Table · COPY');
  });

  it('erkennt den Zug an `types` — auch als DOMStringList und ohne jedes `getData`', () => {
    expect(isPublishWorkspaceDrag({ types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME] })).toBe(true);
    expect(isPublishWorkspaceDrag({ types: { 0: FABRIC_WORKSPACE_OBJECT_DRAG_MIME, length: 1 } })).toBe(true);
    expect(isPublishWorkspaceDrag({ types: FABRIC_WORKSPACE_OBJECT_DRAG_MIME })).toBe(true);
    expect(isPublishWorkspaceDrag({ types: ['Files'] })).toBe(false);
    expect(isPublishWorkspaceDrag({ types: [] })).toBe(false);
    expect(isPublishWorkspaceDrag({ types: null })).toBe(false);
    expect(isPublishWorkspaceDrag({})).toBe(false);
    expect(isPublishWorkspaceDrag(null)).toBe(false);
    expect(isPublishWorkspaceDrag(undefined)).toBe(false);
  });

  it('nennt einen **fehlenden** Träger erst bei der Ablage so — nicht beim Überfahren', () => {
    const over = claimPublishWorkspaceDropZone(closed(), route(), mime([FABRIC_WORKSPACE_OBJECT_DRAG_MIME]));
    expect(over.ok).toBe(true);
    if (over.ok && !over.state.transfer.ok) expect(over.state.transfer.reason).toBe('publish-drop-transfer-protected');
    // Bei der **Ablage** ist „leer" dagegen „fehlend": dort war der Speicher lesbar.
    const dropped = dropPublishWorkspaceDropZone(closed(), route(undefined));
    expect(dropped.ok).toBe(false);
    expect(dropped.reason).toBe('publish-drop-transfer-missing');
  });

  it('nimmt einen entschiedenen Fall beim wiederholten `dragover` **nicht** zurück, beim neuen `dragenter` schon', () => {
    const delivered = dropPublishWorkspaceDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(publishWorkspaceDropZoneView(delivered)).toBe('resolved');
    // `dragover` feuert viele Male **innerhalb** eines Zuges: die Zustellung ist eine Tatsache und bleibt stehen.
    const held = holdPublishWorkspaceDropZone(delivered, route(), mime([FABRIC_WORKSPACE_OBJECT_DRAG_MIME]));
    expect(held.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(held.state)).toBe('resolved');
    // `dragenter` eröffnet einen **neuen** Zug und darf den alten Fall ablösen.
    const claimed = claimPublishWorkspaceDropZone(delivered, route(), mime([FABRIC_WORKSPACE_OBJECT_DRAG_MIME]));
    expect(claimed.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(claimed.state)).toBe('open');
    expect(claimed.state.decision.kind).toBe('none');
  });
});

describe('Paket 13 — ablegen: eine Zustellung, kein stiller Erfolg', () => {
  it('stellt eine eindeutige Route zu, verbraucht das Urteil und verändert kein Dokument', () => {
    const before = structuredClone(documents);
    const state = hovered(oneIntentPayload);
    const step = dropPublishWorkspaceDropZone(state, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(step.state)).toBe('resolved');
    expect(step.state.decision.kind).toBe('delivered');
    if (step.state.decision.kind === 'delivered') {
      expect(step.state.decision.resolution).toEqual({
        adapterId: 'publish-page-table',
        // **Paket 15:** die Kopie trägt die Integrationsart — und **keinen** Modus.
        integrationKind: 'copy',
        intent: 'COPY',
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
    expect(documents).toEqual(before);
  });

  it('legt ohne gewählte Absicht nichts ab, sondern verlangt sie benannt', () => {
    const state = hovered(twoIntentPayload);
    const step = dropPublishWorkspaceDropZone(state, route(twoIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_intent_choice_required');
    expect(publishWorkspaceDropZoneView(step.state)).toBe('choice');
    expect(step.state.decision.kind).toBe('choice');
    expect(publishWorkspaceDropZoneChoices(step.state).map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
    expect(publishWorkspaceDropZoneChoices(step.state).map((choice) => choice.key)).toEqual(['1', '2']);
    expect(publishWorkspaceDropZoneChoices(step.state)[0]?.label).toBe(PUBLISH_WORKSPACE_DROP_INTENT_LABEL.COPY);
    expect(publishWorkspaceDropZoneCanConfirm(step.state)).toBe(false);
  });

  it('lehnt einen kaputten Träger mit dem Code des Parsers ab', () => {
    const step = dropPublishWorkspaceDropZone(closed(), route('{kein json'));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('payload_invalid');
    expect(publishWorkspaceDropZoneView(step.state)).toBe('refused');
    expect(publishWorkspaceDropZoneRefusalCode(step.state)).toBe('payload_invalid');
  });

  it('lehnt eine Ablage ohne Träger benannt ab, statt sie zu verschlucken', () => {
    const step = dropPublishWorkspaceDropZone(closed(), route(undefined));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('publish-drop-transfer-missing');
    expect(publishWorkspaceDropZoneView(step.state)).toBe('refused');
  });

  it('legt einen entschiedenen Fall nicht ein zweites Mal ab', () => {
    const delivered = dropPublishWorkspaceDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const second = dropPublishWorkspaceDropZone(delivered, route(oneIntentPayload));
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('publish-drop-already-decided');
    expect(second.state.decision.kind).toBe('delivered');
  });

  it('nennt ein fehlendes Quellobjekt über den Resolver, wo das Urteil nur „keine Route" sagen kann', () => {
    // Das Urteil (Paket 6) urteilt über die **Route**; die genaue Identität nennt der Resolver.
    const step = choosePublishWorkspaceDropIntent(hovered(oneIntentPayload), 'COPY', {
      ...route(oneIntentPayload),
      documents: { [target.id]: target },
    });
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_source_document_missing');
  });

  it('legt ohne vorheriges Überfahren ab — und nennt das Ergebnis, nicht einen stillen Erfolg', () => {
    // „Ablegen" auf eine noch geschlossene Fläche: das Urteil entsteht **hier** (Paket 6), nicht aus einem Hover.
    const step = dropPublishWorkspaceDropZone(closed(), route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('delivered');
  });
});

describe('Paket 13 — die Tastatur ist ein Weg, kein Zusatz', () => {
  it('legt mit der Absicht genau so zu wie der Zeiger', () => {
    const ready = hovered(oneIntentPayload);
    const viaKeyboard = confirmPublishWorkspaceDropZone(ready, route(oneIntentPayload));
    const viaPointer = dropPublishWorkspaceDropZone(ready, route(oneIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision).toEqual(viaPointer.state.decision);
  });

  it('bestätigt **ohne** Überfahren — die Tastatur braucht den Zeiger nicht', () => {
    const fresh = closed();
    expect(fresh.target.overTarget).toBe(false);
    const step = confirmPublishWorkspaceDropZone(fresh, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('delivered');
  });

  it('bestätigt im Zustand „Absicht erforderlich" nicht heimlich, sondern wörtlich wie die Ablage', () => {
    const choice = dropPublishWorkspaceDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    const viaEnter = confirmPublishWorkspaceDropZone(choice, route(twoIntentPayload));
    const viaDrop = dropPublishWorkspaceDropZone(choice, route(twoIntentPayload));
    expect(viaEnter).toEqual(viaDrop);
    expect(viaEnter.reason).toBe('drop_intent_choice_required');
  });

  it('führt die gewählte Absicht durch dieselbe Zustellung wie die Ablage', () => {
    const choice = dropPublishWorkspaceDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    // **Paket 15, vorgezogen (Runde 258 → AST-1948) ✓✓** — *nicht gelöscht, nicht gelockert, nicht geskippt* ✓:
    // Live **ohne** Modus ist und bleibt der **benannte** Fehlschlag ✓ — der Zeuge steht weiter hier.
    const ohneModus = choosePublishWorkspaceDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload));
    expect(ohneModus.ok).toBe(false);
    expect(ohneModus.reason).toBe('drop_live_mode_required');
    // **Und jetzt die Zustellung MIT Modus** ✓: der Modus wird **gesagt**, nicht angenommen.
    const mitLive = choosePublishWorkspaceDropIntent(choice, 'LIVE_REFERENCE', withMode('Live'));
    expect(mitLive.ok).toBe(true);
    expect(mitLive.state.decision.kind).toBe('delivered');
    if (mitLive.state.decision.kind === 'delivered') {
      expect(mitLive.state.decision.resolution.integrationKind).toBe('live');
      expect(mitLive.state.decision.resolution.mode).toBe('Live');
    }
    const mitFrozen = choosePublishWorkspaceDropIntent(choice, 'LIVE_REFERENCE', withMode('Frozen'));
    expect(mitFrozen.state.decision.kind).toBe('delivered');
    if (mitFrozen.state.decision.kind === 'delivered') {
      expect(mitFrozen.state.decision.resolution.mode).toBe('Frozen');
    }
    // **Und der Zweck bleibt** ✓: die gewählte Absicht geht durch **dieselbe Zustellung** wie die Ablage ✓ — *über die Kopie*.
    const viaKeyboard = choosePublishWorkspaceDropIntent(choice, 'COPY', route(twoIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision.kind).toBe('delivered');
    if (viaKeyboard.state.decision.kind === 'delivered') {
      expect(viaKeyboard.state.decision.resolution.intent).toBe('COPY');
      expect(viaKeyboard.state.decision.resolution.adapterId).toBe('publish-page-table');
      expect(viaKeyboard.state.decision.resolution.targetVersion).toBe(4);
      // **Kopie ohne `mode`** ✓✓: der Modus gehört dem **Live-Verweis**, nicht jeder Zustellung — *und ein
      // eingesetztes „Live" wäre der heimliche Default, den Paket 15 verbietet.*
      expect(viaKeyboard.state.decision.resolution.integrationKind).toBe('copy');
      expect(Object.hasOwn(viaKeyboard.state.decision.resolution, 'mode')).toBe(false);
    }
  });

  it('**Paket 15:** Live **mit** Modus ist fähig und wird zugestellt — Live **ohne** Modus ist benannt, nicht `route-not-capable`', () => {
    // Der **scharfe** Fall: der Träger bietet **nur** den Live-Verweis an — hier entscheidet allein der Modus.
    const livePayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['LIVE_REFERENCE'],
    }));
    // **① Ohne Modus nimmt das Urteil den Träger an** ✓ — *die Route ist da, es fehlt nur die Wahl.* Sagte die
    // Fähigkeitsfrage hier „nein", hieße der Grund nach Paket 6 `route-not-capable` — die **falsche** Auskunft.
    const ohneModusHover = hovered(livePayload);
    expect(ohneModusHover.target.verdict).toBe('accept');
    expect(publishWorkspaceDropZoneCanConfirm(ohneModusHover)).toBe(true);
    const ohneModusDrop = dropPublishWorkspaceDropZone(ohneModusHover, route(livePayload));
    expect(ohneModusDrop.ok).toBe(false);
    expect(ohneModusDrop.reason).toBe('drop_live_mode_required');
    expect(ohneModusDrop.reason).not.toBe('route-not-capable');
    expect(publishWorkspaceDropZoneView(ohneModusDrop.state)).toBe('refused');
    expect(publishWorkspaceDropZoneRefusalCode(ohneModusDrop.state)).toBe('drop_live_mode_required');
    // **② Mit Modus ist sie fähig UND zugestellt** ✓ — mit Integrationsart und **gesagtem** Modus.
    const mitLive = dropPublishWorkspaceDropZone(hovered(livePayload), withMode('Live', livePayload));
    expect(mitLive.ok).toBe(true);
    expect(mitLive.state.decision.kind).toBe('delivered');
    if (mitLive.state.decision.kind === 'delivered') {
      expect(mitLive.state.decision.resolution.integrationKind).toBe('live');
      expect(mitLive.state.decision.resolution.mode).toBe('Live');
      expect(mitLive.state.decision.resolution.intent).toBe('LIVE_REFERENCE');
    }
    const mitFrozen = dropPublishWorkspaceDropZone(hovered(livePayload), withMode('Frozen', livePayload));
    expect(mitFrozen.state.decision.kind).toBe('delivered');
    if (mitFrozen.state.decision.kind === 'delivered') {
      expect(mitFrozen.state.decision.resolution.mode).toBe('Frozen');
    }
    // **③ Ein unbekannter Modus ist kein Modus** ✓ — *kein stiller Rückfall auf einen der beiden.*
    expect(dropPublishWorkspaceDropZone(hovered(livePayload), withMode('Teleport', livePayload)).reason).toBe('drop_live_mode_required');
    // **④ Die Kopie trägt keinen Modus** ✓ — auch dann nicht, wenn einer **gesagt** wurde.
    const kopie = dropPublishWorkspaceDropZone(hovered(oneIntentPayload), withMode('Live', oneIntentPayload));
    expect(kopie.ok).toBe(true);
    if (kopie.state.decision.kind === 'delivered') {
      expect(kopie.state.decision.resolution.integrationKind).toBe('copy');
      expect(kopie.state.decision.resolution.mode).toBeUndefined();
      expect(Object.hasOwn(kopie.state.decision.resolution, 'mode')).toBe(false);
    }
  });

  it('fragt den Modus **in beiden** Aufrufen — die Fähigkeitsfrage ist keine zweite Meinung über die Route', () => {
    const livePayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['LIVE_REFERENCE'],
    }));
    // **Mit** Modus: fähig ✓. **Ohne** Modus: ebenfalls fähig ✓ — *der Modus ist keine Frage der Route.*
    expect(publishWorkspaceDropCapabilityQuestion(withMode('Live', livePayload))?.('Publish', 'Table', 'LIVE_REFERENCE')).toBe(true);
    expect(publishWorkspaceDropCapabilityQuestion(route(livePayload))?.('Publish', 'Table', 'LIVE_REFERENCE')).toBe(true);
    // Und eine Absicht **ohne** Route bleibt `false` — die Toleranz öffnet nur den Modus-Fall, nicht die Route.
    expect(publishWorkspaceDropCapabilityQuestion(route(livePayload))?.('Publish', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
  });

  it('lehnt eine nicht angebotene und eine unbekannte Absicht benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    expect(choosePublishWorkspaceDropIntent(ready, 'FROZEN_SNAPSHOT', route(oneIntentPayload)).reason).toBe('drop_intent_not_supported');
    expect(choosePublishWorkspaceDropIntent(ready, 'TELEPORT', route(oneIntentPayload)).reason).toBe('intent_unknown');
    // Ein bereits gelesener Träger **im Zustand** genügt der Tastatur — sie braucht keine Ablagefläche.
    expect(choosePublishWorkspaceDropIntent(ready, 'COPY', route(undefined)).ok).toBe(true);
    // Ohne gelesenen Träger ist es ein **benannter** Grund, kein stiller No-op.
    expect(choosePublishWorkspaceDropIntent(closed(), 'COPY', route(undefined)).reason).toBe('publish-drop-transfer-missing');
  });

  it('übersetzt Tasten in Absichten und nennt ungebundene Tasten', () => {
    const choice = dropPublishWorkspaceDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(resolvePublishWorkspaceDropCommand(choice, 'Enter')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolvePublishWorkspaceDropCommand(choice, ' ')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolvePublishWorkspaceDropCommand(choice, 'Escape')).toEqual({ ok: true, command: { kind: 'dismiss' } });
    expect(resolvePublishWorkspaceDropCommand(choice, '1')).toEqual({ ok: true, command: { kind: 'choose', intent: 'COPY' } });
    expect(resolvePublishWorkspaceDropCommand(choice, '2')).toEqual({ ok: true, command: { kind: 'choose', intent: 'LIVE_REFERENCE' } });
    expect(resolvePublishWorkspaceDropCommand(choice, '9')).toEqual({ ok: false, reason: 'publish-drop-key-unbound' });
    expect(resolvePublishWorkspaceDropCommand(choice, 'x')).toEqual({ ok: false, reason: 'publish-drop-key-unbound' });
    expect(resolvePublishWorkspaceDropCommand(choice, 2)).toEqual({ ok: false, reason: 'publish-drop-key-unbound' });
    // Eine Ziffer ist **nur** eine Absicht, wenn die Matrix eine angeboten hat.
    expect(resolvePublishWorkspaceDropCommand(hovered(twoIntentPayload), '1')).toEqual({ ok: false, reason: 'publish-drop-key-unbound' });
  });

  it('führt Befehle aus und lehnt unbekannte Befehle benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    const dismissed = applyPublishWorkspaceDropCommand(ready, { kind: 'dismiss' }, route(oneIntentPayload));
    expect(dismissed.state.decision.kind).toBe('none');
    expect(publishWorkspaceDropZoneView(dismissed.state)).toBe('closed');
    expect(dismissed.state.closedReason).toBe('keyboard-dismiss');
    const bogus = applyPublishWorkspaceDropCommand(ready, { kind: 'teleport' } as never, route(oneIntentPayload));
    expect(bogus.ok).toBe(false);
    expect(bogus.reason).toBe('publish-drop-command-unknown');
  });
});

describe('Paket 13 — der Zeiger überschreibt keine Tatsache', () => {
  it('löst einen entschiedenen Fall nur durch einen **neuen** Zug ab', () => {
    const delivered = dropPublishWorkspaceDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(isPublishWorkspaceDropZoneDecided(delivered)).toBe(true);
    expect(publishWorkspaceDropZoneView(hoverPublishWorkspaceDropZone(delivered, route(oneIntentPayload)).state)).toBe('resolved');
    expect(publishWorkspaceDropZoneView(leavePublishWorkspaceDropZone(delivered, 'drag-left').state)).toBe('resolved');
    const entered = enterPublishWorkspaceDropZone(delivered, route(twoIntentPayload));
    expect(publishWorkspaceDropZoneView(entered.state)).toBe('ready');
    expect(entered.state.decision.kind).toBe('none');
  });

  it('schließt eine nur überfahrene Fläche beim Verlassen und nimmt das Urteil zurück', () => {
    const step = leavePublishWorkspaceDropZone(hovered(oneIntentPayload), 'drag-left');
    expect(step.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(step.state)).toBe('closed');
    expect(step.state.closedReason).toBe('drag-left');
    expect(step.state.target.verdict).toBe('none');
    expect(step.state.target.preview).toBeNull();
    expect(step.state.transfer.ok).toBe(false);
  });
});

describe('Paket 13 — der Empfänger folgt der vorhandenen Zieh-Session (Paket 5)', () => {
  it('öffnet sich aus der laufenden Sitzung mit deren Träger — dem einzigen Weg zu einer echten Vorschau', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, twoIntentPayload);
    expect(started.ok).toBe(true);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    expect(moved.state.phase).toBe('dragging');
    const step = publishWorkspaceDropZoneFromDragSession(closed(), moved.state, route());
    expect(publishWorkspaceDropZoneView(step.state)).toBe('ready');
    expect(step.state.target.preview?.objectKind).toBe('Table');
    expect(step.state.transfer.ok).toBe(true);
  });

  it('schließt eine überfahrene Fläche, wenn der Zug abgebrochen wird — mit **dessen** benanntem Grund', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, oneIntentPayload);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    const open = publishWorkspaceDropZoneFromDragSession(closed(), moved.state, route()).state;
    const cancelled = cancelDrag(moved.state, 'pointer-lost');
    const after = publishWorkspaceDropZoneFromDragSession(open, cancelled.state, route());
    expect(publishWorkspaceDropZoneView(after.state)).toBe('closed');
    // Der Grund der Sitzung wird **übernommen**, nicht eingeebnet: `pointercancel` heißt `pointer-lost`.
    expect(after.state.closedReason).toBe('pointer-lost');
    const blurred = cancelDrag(moved.state, 'window-blur');
    expect(publishWorkspaceDropZoneFromDragSession(open, blurred.state, route()).state.closedReason).toBe('window-blur');
    // Und ohne vorheriges Überfahren ist es ein **benannter** No-op.
    const idle = publishWorkspaceDropZoneFromDragSession(closed(), cancelled.state, route());
    expect(idle.ok).toBe(false);
    expect(idle.reason).toBe('publish-drop-inactive');
  });

  it('lässt eine Zustellung stehen, wenn der Zug endet', () => {
    const delivered = dropPublishWorkspaceDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const started = beginDrag(createDragSession(), { pointerId: 2, x: 0, y: 0 }, oneIntentPayload);
    const cancelled = cancelDrag(started.state, 'pointer-lost');
    const after = publishWorkspaceDropZoneFromDragSession(delivered, cancelled.state, route(oneIntentPayload));
    expect(after.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(after.state)).toBe('resolved');
  });
});

describe('Paket 13 — der Träger aus der Ablagefläche', () => {
  const transfer = (value: unknown) => ({ getData: (mime: string) => (mime === FABRIC_WORKSPACE_OBJECT_DRAG_MIME ? value : '') });

  it('liest genau die vorhandene MIME-Konstante', () => {
    expect(readPublishWorkspaceTransfer(transfer(oneIntentPayload))).toEqual({ ok: true, payload: oneIntentPayload });
  });

  it('nennt einen fehlenden Träger, statt ihn zu erfinden', () => {
    expect(readPublishWorkspaceTransfer(transfer(''))).toEqual({ ok: false, reason: 'publish-drop-transfer-missing' });
    expect(readPublishWorkspaceTransfer(null)).toEqual({ ok: false, reason: 'publish-drop-transfer-missing' });
  });

  it('nennt eine unlesbare Ablagefläche', () => {
    expect(readPublishWorkspaceTransfer({})).toEqual({ ok: false, reason: 'publish-drop-transfer-unreadable' });
    expect(readPublishWorkspaceTransfer({ getData: () => { throw new Error('kein Zugriff'); } }))
      .toEqual({ ok: false, reason: 'publish-drop-transfer-unreadable' });
  });

  it('liest den Träger durch den einen Parser (Paket 7) und gibt dessen Deskriptor weiter', () => {
    const read = readPublishWorkspaceDropTransfer(oneIntentPayload);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.descriptor.objectKind).toBe('Table');
      expect(read.descriptor.documentId).toBe(source.id);
      expect(read.descriptor.objectId).toBe('table-forecast');
    }
    expect(readPublishWorkspaceDropTransfer(42).ok).toBe(false);
    expect(readPublishWorkspaceDropTransfer(undefined)).toEqual({ ok: false, reason: 'publish-drop-transfer-protected' });
  });
});

describe('Paket 13 — Touch ist entschieden, nicht angenommen', () => {
  it('liest den Langdruck und die Toleranz aus Paket 5/6, statt eine zweite Zahl zu setzen', () => {
    expect(publishWorkspaceDropZoneLongPressMs()).toBe(DRAG_TOUCH_LONGPRESS_MS);
    expect(publishWorkspaceDropZoneTouchThresholdPx()).toBe(dragThresholdForInput('touch', DRAG_THRESHOLD_PX));
    expect(publishWorkspaceDropZoneTouchWaits()).toBe(true);
    expect(publishWorkspaceDropZoneKeyboardIsPointerFree()).toBe(true);
  });

  it('beginnt einen Touch-Zug erst nach Langdruck innerhalb der Toleranz', () => {
    const long = publishWorkspaceDropZoneLongPressMs();
    const tolerance = publishWorkspaceDropZoneTouchThresholdPx();
    expect(publishWorkspaceDropZoneTouchDragBegins(long - 1, 0)).toBe(false);
    expect(publishWorkspaceDropZoneTouchDragBegins(long, 0)).toBe(true);
    expect(publishWorkspaceDropZoneTouchDragBegins(long + 1, tolerance)).toBe(true);
    expect(publishWorkspaceDropZoneTouchDragBegins(long + 1, tolerance + 1)).toBe(false);
    // Diese Funktion ist die **Touch**-Entscheidung und deshalb **nicht** eingabeartabhängig. Dass Maus und Stift
    // **nicht** warten, steht in den benannten Entscheidungen — nicht hier: *eine Funktion, die je Eingabeart
    // etwas anderes täte, hätte die Eingabeart als Parameter gebraucht.*
    expect(publishWorkspaceDropTouchStrategy('mouse').longPress.required).toBe(false);
    expect(publishWorkspaceDropTouchStrategy('pen').longPress.required).toBe(false);
  });

  it('ist bei unbrauchbaren Zahlen fail-closed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, '250', null, undefined]) {
      expect(publishWorkspaceDropZoneTouchDragBegins(bad, 0), String(bad)).toBe(false);
      expect(publishWorkspaceDropZoneTouchDragBegins(1000, bad), String(bad)).toBe(false);
    }
  });

  it('stiehlt der Seitenfläche die Geste nicht: `manipulation`, nie `none`', () => {
    expect(PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION).toBe('manipulation');
    expect(PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION).not.toBe('none');
    expect(publishWorkspaceDropZoneInputHint('touch')).toContain(`touch-action: ${PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION}`);
    expect(publishWorkspaceDropZoneInputHint('touch')).toContain(String(publishWorkspaceDropZoneLongPressMs()));
    expect(publishWorkspaceDropZoneInputHint('touch')).toContain('pan and pinch-zoom stay with the page surface');
    expect(publishWorkspaceDropZoneInputHint('keyboard')).toContain('no pointer');
    expect(publishWorkspaceDropZoneInputHint('pen')).toContain('Pointer');
  });

  it('nennt die Entscheidungen als **ein** benanntes Bündel, gelesen aus Paket 5/6', () => {
    const touch = publishWorkspaceDropTouchStrategy('touch');
    expect(touch.touchAction).toBe(PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION);
    expect(touch.longPress).toEqual({ required: true, ms: DRAG_TOUCH_LONGPRESS_MS });
    expect(touch.thresholdPx).toBe(dragThresholdForInput('touch', DRAG_THRESHOLD_PX));
    expect(touch.cancelReason).toBe('pointer-lost');
    expect(touch.pointerFree).toBe(false);
    const keyboard = publishWorkspaceDropTouchStrategy('keyboard');
    expect(keyboard.longPress.required).toBe(false);
    // Die Tastatur hat **keine** Schwelle: *eine Tastatur mit Langdruck wäre eine erfundene Hürde.*
    expect(keyboard.thresholdPx).toBe(0);
    expect(keyboard.pointerFree).toBe(true);
    const pen = publishWorkspaceDropTouchStrategy('pen');
    expect(pen.longPress.required).toBe(false);
    expect(pen.thresholdPx).toBe(dragThresholdForInput('pen', DRAG_THRESHOLD_PX));
    expect(pen.pointerFree).toBe(false);
  });

  it('übersetzt eine Zeigereingabe mit der **einen** Übersetzung aus Paket 6 — fail-closed auf `touch`', () => {
    // **Paket 15 / `W-446`:** Publish führt **keine** eigene Übersetzung mehr. *Gemessen waren es fünf Kopien
    // einer Ein-Zeilen-Regel — Publish war eine davon.*
    expect(dragInputKindFromPointerType('touch')).toBe('touch');
    expect(dragInputKindFromPointerType('pen')).toBe('pen');
    expect(dragInputKindFromPointerType('mouse')).toBe('mouse');
    // **Unbekannt ist kein Zeiger** — und die **strengste** Regel ist die sichere: Langdruck nötig. *Ein
    // unbekanntes Gerät als „mouse" zu behandeln würde auf einem Tablet **jeden Scrollversuch** zu einem Zug
    // machen.* (Auch `'keyboard'` kommt hier nicht durch: die Tastatur ist **keine** Zeigereingabe, sie wird von
    // der Zone selbst gesetzt.)
    for (const unknown of ['', 'stylus', 'keyboard', null, undefined, 42, {}]) {
      expect(dragInputKindFromPointerType(unknown), String(unknown)).toBe('touch');
    }
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session', () => {
    expect(PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_CANCEL_REASON).toBe('pointer-lost');
    const closedByTouch = leavePublishWorkspaceDropZone(hovered(oneIntentPayload), PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_CANCEL_REASON);
    expect(closedByTouch.state.closedReason).toBe('pointer-lost');
    expect(publishWorkspaceDropZoneView(closedByTouch.state)).toBe('closed');
  });
});

describe('Paket 13 — das Vokabular ist eine Definition', () => {
  it('nimmt die Objektart- und Absichtswörter aus der vorhandenen Fabric-Oberfläche', () => {
    expect(publishWorkspaceDropObjectKindLabel('Table')).toBe(FABRIC_GRAPH_COPY['en-US'].objectType.Table);
    expect(PUBLISH_WORKSPACE_DROP_INTENT_LABEL.COPY).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy);
    expect(PUBLISH_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink);
    expect(publishWorkspaceDropIntentLabelOf('COPY')).toBe(PUBLISH_WORKSPACE_DROP_INTENT_LABEL.COPY);
  });

  it('nimmt die Sätze der Matrix-Codes aus dem Fehler selbst, statt sie zweimal zu schreiben', () => {
    for (const code of ['payload_invalid', 'registry_adapter_route_missing', 'drop_authorization_failed', 'intent_unknown', 'drop_source_document_missing'] as const) {
      expect(publishWorkspaceDropRefusalText(code), code).toBe(new WorkspaceInteractionError(code).message);
    }
  });

  it('hat für jeden eigenen Grund und jeden Urteilsgrund einen sichtbaren Satz', () => {
    const own: readonly PublishWorkspaceDropZoneRefusal[] = [
      'publish-drop-transfer-missing',
      'publish-drop-transfer-protected',
      'publish-drop-transfer-unreadable',
      'publish-drop-target-missing',
      'publish-drop-inactive',
      'publish-drop-already-decided',
      'publish-drop-command-unknown',
      'publish-drop-foreign-drag',
      'object-kind-unknown',
      'intent-unknown',
      'route-not-capable',
      'payload-missing',
      'verdict-unavailable',
    ];
    for (const code of own) {
      const text = publishWorkspaceDropRefusalText(code);
      expect(text.length, code).toBeGreaterThan(10);
      expect(text, code).not.toBe(code);
    }
  });

  it('gibt jedem View-Zustand ein eigenes Zeichen, eine eigene Form und eigene Worte', () => {
    const views: PublishWorkspaceDropZoneView[] = ['closed', 'open', 'ready', 'choice', 'refused', 'resolved'];
    const signatures = new Set<string>();
    for (const view of views) {
      const presentation = PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION[view];
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
    }
    expect(signatures.size).toBe(views.length);
  });

  it('rechnet die View-Phase aus Urteil und Zustellung', () => {
    expect(publishWorkspaceDropZoneView(closed())).toBe('closed');
    expect(publishWorkspaceDropZoneView(hovered(oneIntentPayload))).toBe('ready');
    // **Vorgezogen (Paket 13, Matrix-Eintrag):** derselbe Träger ergibt über die **Autorität** jetzt dasselbe
    // `ready` (vorher `open`) — die versiegelte Matrix trägt die Publish-Route (Form A, gemessen).
    expect(publishWorkspaceDropZoneView(hovered(oneIntentPayload, FABRIC_WORKSPACE_DROP_REGISTRY))).toBe('ready');
    // Der **`open`**-Zweig bleibt gedeckt — mit einem **gemessenen** Fall, der auch nach dem Eintrag abgelehnt
    // wird: die Matrix führt für Publish/Table **`COPY` und `LIVE_REFERENCE`**, also ist ein Träger, der **nur
    // `MOVE`** anbietet, keine dieser Absichten — er wird abgelehnt und die Phase bleibt `open`.
    //
    // **Gezogen, nicht gelockert:** vorher stand hier ein `LIVE_REFERENCE`-Träger, weil Publish diese Absicht
    // **nicht** annahm. Seit die Matrix sie trägt (`AST-1411/1412`), ist derselbe Träger **angenommen** (`ready`)
    // — *die Absicht ist erreichbar geworden, und genau das war der Zweck des Eintrags.*
    const moveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['MOVE'],
    }));
    expect(publishWorkspaceDropZoneView(hovered(moveOnlyPayload, FABRIC_WORKSPACE_DROP_REGISTRY))).toBe('open');
    // Und die **neue** Erreichbarkeit ist gepinnt: ein Live-Träger wird jetzt angenommen.
    const liveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['LIVE_REFERENCE'],
    }));
    expect(publishWorkspaceDropZoneView(hovered(liveOnlyPayload, FABRIC_WORKSPACE_DROP_REGISTRY))).toBe('ready');
    const choice = dropPublishWorkspaceDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(publishWorkspaceDropZoneView(choice)).toBe('choice');
    const refused = dropPublishWorkspaceDropZone(closed(), route('{kein json')).state;
    expect(publishWorkspaceDropZoneView(refused)).toBe('refused');
    const delivered = dropPublishWorkspaceDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(publishWorkspaceDropZoneView(delivered)).toBe('resolved');
    // Und die Präsentation folgt der gerechneten Phase (eine Quelle für die Ansicht).
    expect(PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION[delivered.decision.kind === 'delivered' ? 'resolved' : 'closed'].glyph)
      .toBe(PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION.resolved.glyph);
  });
});

/**
 * **Die Form des Matrix-Eintrags wird gemessen, nicht gewählt** — und die Messung steht hier als Beweis.
 *
 * Der verbindliche Auftrag lautet: *Eintraege duerfen keine Begruendung erben, die nur fuer eine Flaeche gemessen
 * ist.* Deshalb wird hier **fuer Publish** gemessen, was die beiden Formen ergeben, und **warum** `MOVE` und
 * `FROZEN_SNAPSHOT` nicht hineingehoeren. Die Replikate sind **gesetzmaessig aufgebaute** Matrizen **derselben
 * Klasse** (Paket 4) — *die Regel bleibt eine, der Pruefling darf ein zweiter Aufbau sein*; die Vokabeln der
 * Absichten kommen aus **Paket 4s eigener Signatur**, damit in dieser Datei **keine** zweite Vokabel entsteht.
 */
describe('Paket 13 — die Matrix-Form ist gemessen, nicht gewählt (Publish braucht Form A)', () => {
  type ReplicaIntents = Parameters<WorkspaceInteractionRegistry['registerAdapter']>[0]['intents'];

  /** Eine echte Matrix derselben Klasse, mit den **gemessenen** Vokabeln der Produktion. */
  function replicaRegistry(publishImports: ReplicaIntents, gridExports: ReplicaIntents): WorkspaceInteractionRegistry {
    const registry = new WorkspaceInteractionRegistry();
    registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: gridExports }], imports: [] });
    registry.registerAppManifest({ app: 'Publish', exports: [], imports: [{ objectKind: 'Table', intents: publishImports }] });
    registry.registerAdapter({ id: 'replica-publish-table', targetApp: 'Publish', objectKinds: ['Table'], intents: publishImports });
    return registry.seal();
  }

  /** Die Vokabeln der **Quelle**, woertlich gemessen — Grid exportiert gemessen genau diese zwei Absichten. */
  const GRID_EXPORTS: ReplicaIntents = ['COPY', 'LIVE_REFERENCE'];

  it('Form A vollendet den Drop — Form B endet in der Phase `choice` (das ist Paket 15)', () => {
    // Der Traeger ist der **produzierte** der Fabric-Flaeche (`createFabricWorkspaceObjectDragPayload`): er bietet
    // COPY **und** LIVE_REFERENCE an. Genau an ihm unterscheiden sich die beiden Formen.
    const formA = replicaRegistry(['COPY'], GRID_EXPORTS);
    const hoverA = hoverPublishWorkspaceDropZone(closed(), contextWith(formA, twoIntentPayload));
    expect(hoverA.state.target.verdict).toBe('accept');
    const dropA = dropPublishWorkspaceDropZone(hoverA.state, contextWith(formA, twoIntentPayload));
    expect(dropA.ok).toBe(true);
    expect(publishWorkspaceDropZoneView(dropA.state)).toBe('resolved');
    if (dropA.state.decision.kind === 'delivered') {
      expect(dropA.state.decision.resolution).toEqual({
        adapterId: 'replica-publish-table',
        // **Paket 15:** Form A liefert eine **Kopie** — Integrationsart gesetzt, Modus **nicht**.
        integrationKind: 'copy',
        intent: 'COPY',
        sourceDocumentId: source.id,
        sourceObjectId: 'table-forecast',
        targetDocumentId: target.id,
        sourceVersion: 3,
        targetVersion: 4,
      });
    }
    // **Form B** — gemessen: `accept`, aber der Drop ist **keine** Zustellung, sondern eine benannte Wahl.
    const formB = replicaRegistry(['COPY', 'LIVE_REFERENCE'], GRID_EXPORTS);
    const hoverB = hoverPublishWorkspaceDropZone(closed(), contextWith(formB, twoIntentPayload));
    expect(hoverB.state.target.verdict).toBe('accept');
    const dropB = dropPublishWorkspaceDropZone(hoverB.state, contextWith(formB, twoIntentPayload));
    expect(dropB.ok).toBe(false);
    expect(dropB.reason).toBe('drop_intent_choice_required');
    expect(publishWorkspaceDropZoneView(dropB.state)).toBe('choice');
    expect(publishWorkspaceDropZoneChoices(dropB.state).map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
    // *Publish braucht also **Form A** fuer einen vollendeten Drop; B ist Paket 15 und heute keine Zustellung.*
  });

  it('MOVE erreicht bei Publish **nicht einmal `accept`** — die Publish-Form, nicht die von Present', () => {
    // Die Faehigkeitsfrage der Publish-Zone fragt den **Resolver** (`evaluateWorkspaceDrop`) — wie Whiteboard und
    // Notes, **nicht** wie Present (das die Route fragt). Deshalb ist der Ausschlussgrund ein **gemessener**
    // Publish-Grund und kein geliehener.
    const withMove = replicaRegistry(['COPY', 'MOVE'], ['COPY', 'LIVE_REFERENCE', 'MOVE']);
    const movePayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['MOVE'],
    }));
    // **Kontrolle zuerst:** die Route ist da und traegt COPY — die Ablehnung unten heisst also **nicht**
    // „es gibt gar keine Route". (Reihenfolge nach `WORKSPACE_DROP_INTENTS`.)
    expect(withMove.getCompatibleIntents('Grid', 'Publish', 'Table')).toEqual(['MOVE', 'COPY']);
    expect(hoverPublishWorkspaceDropZone(closed(), contextWith(withMove, oneIntentPayload)).state.target.verdict).toBe('accept');
    // Gemessen: `MOVE` erreicht **kein** `accept`.
    const hoverMove = hoverPublishWorkspaceDropZone(closed(), contextWith(withMove, movePayload));
    expect(hoverMove.state.target.verdict).toBe('reject');
    expect(hoverMove.state.target.reason).toBe('route-not-capable');
    expect(publishWorkspaceDropCapabilityQuestion(contextWith(withMove, movePayload))?.('Publish', 'Table', 'MOVE')).toBe(false);
    // Und der Resolver selbst nennt beim Zustellen seinen **eigenen** Grund — woertlich.
    expect(choosePublishWorkspaceDropIntent(hoverMove.state, 'MOVE', contextWith(withMove, movePayload)).reason)
      .toBe('drop_move_transaction_unavailable');
  });

  it('FROZEN_SNAPSHOT scheitert schon an der **Quelle** — Grid exportiert es gemessen nicht', () => {
    // Die Vokabel der Quelle ist eine **Messung der versiegelten Matrix**, keine Erfindung.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Grid')?.exports).toEqual([
      { objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] },
    ]);
    const frozenPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['FROZEN_SNAPSHOT'],
    }));
    const hoverFrozen = hoverPublishWorkspaceDropZone(closed(), contextWith(replicaRegistry(['COPY'], GRID_EXPORTS), frozenPayload));
    expect(hoverFrozen.state.target.verdict).toBe('reject');
    expect(hoverFrozen.state.target.reason).toBe('route-not-capable');
    expect(publishWorkspaceDropCapabilityQuestion(contextWith(replicaRegistry(['COPY'], GRID_EXPORTS), frozenPayload))?.('Publish', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
    // Die **Resolver**-Gruende, woertlich gemessen — sie unterscheiden sich, und genau deshalb steht hier Publishs
    // eigener: mit einem FROZEN-Traeger fehlt die Route ganz, mit dem Grid-Traeger ist die Absicht nicht gedeckt.
    expect(choosePublishWorkspaceDropIntent(hoverFrozen.state, 'FROZEN_SNAPSHOT', contextWith(replicaRegistry(['COPY'], GRID_EXPORTS), frozenPayload)).reason)
      .toBe('registry_adapter_route_missing');
    expect(choosePublishWorkspaceDropIntent(hoverPublishWorkspaceDropZone(closed(), contextWith(replicaRegistry(['COPY'], GRID_EXPORTS), oneIntentPayload)).state, 'FROZEN_SNAPSHOT', contextWith(replicaRegistry(['COPY'], GRID_EXPORTS), oneIntentPayload)).reason)
      .toBe('drop_intent_not_supported');
  });

  it('**Nicht-Leerheit der Messung:** dieselbe Frage liefert `[]` nur, wenn wirklich keine Route da ist', () => {
    // **Differenzkontrolle im selben Aufbau**, damit ein `[]` nicht auch „die Messung misst nichts" heissen kann:
    // dieselbe Abfrage, einmal **mit** Route (Table) und einmal **ohne** (Chart exportiert Grid nicht).
    expect(replicaRegistry(['COPY'], GRID_EXPORTS).getCompatibleIntents('Grid', 'Publish', 'Table')).toEqual(['COPY']);
    expect(replicaRegistry(['COPY'], GRID_EXPORTS).getCompatibleIntents('Grid', 'Publish', 'Chart')).toEqual([]);
  });
});
