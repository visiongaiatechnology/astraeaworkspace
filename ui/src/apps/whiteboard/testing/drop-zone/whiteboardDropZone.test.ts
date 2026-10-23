// STATUS: PLATIN — Integration & Release, **Paket 11**: Beweise für die Whiteboard-Ablagezone
//
// Was hier **wirklich** geprüft wird: das Urteil **aus Paket 6** (nicht ein eigenes), der gelesene Träger **durch
// den einen Parser** (Paket 7), die Zustellung **durch die vorhandene Matrix und den vorhandenen Resolver**
// (Paket 4), der Tastatur-Weg als **dieselbe** Zustellung, die Fail-closed-Gründe, die Touch-Entscheidung und das
// **Markup** (`WhiteboardDropZoneOverlay.render.test.tsx`).
//
// Was hier **nicht** geprüft werden kann und deshalb `NOT_TESTED` bleibt: das **Binden** der Zeiger-, Ablage- und
// Tastenereignisse (`useWhiteboardDropZone`) und die **echte** Berührung auf einem Gerät — dafür braucht es einen
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
import type { WorkspaceDropIntent, WorkspaceObjectKind } from '../../../../shared/workspace-interaction';
import {
  FABRIC_GRAPH_COPY,
} from '../../../../shell/i18n/fabricGraphLocale';
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
  applyWhiteboardDropCommand,
  chooseWhiteboardDropIntent,
  confirmWhiteboardDropZone,
  createWhiteboardDropZone,
  dropWhiteboardDropZone,
  enterWhiteboardDropZone,
  hoverWhiteboardDropZone,
  isWhiteboardDropZoneDecided,
  isWhiteboardDropZoneVisible,
  isWhiteboardWorkspaceDrag,
  leaveWhiteboardDropZone,
  readWhiteboardDropTransfer,
  readWhiteboardWorkspaceTransfer,
  resolveWhiteboardDropCommand,
  whiteboardDropCapabilityQuestion,
  whiteboardDropZoneCanConfirm,
  whiteboardDropZoneChoices,
  whiteboardDropZoneFromDragSession,
  whiteboardDropZonePresentation,
  whiteboardDropZonePreview,
  whiteboardDropZoneRefusalCode,
  whiteboardDropZoneView,
} from '../../drop-zone/whiteboardDropZone';
import type { WhiteboardDropZoneContext } from '../../drop-zone/whiteboardDropZone';
import {
  WHITEBOARD_DROP_INTENT_LABEL,
  WHITEBOARD_DROP_ZONE_PRESENTATION,
  whiteboardDropObjectKindLabel,
  whiteboardDropRefusalText,
} from '../../drop-zone/whiteboardDropZoneContract';
import type { WhiteboardDropZoneRefusal, WhiteboardDropZoneView } from '../../drop-zone/whiteboardDropZoneContract';
import {
  WHITEBOARD_DROP_ZONE_TOUCH_ACTION,
  WHITEBOARD_DROP_ZONE_TOUCH_CANCEL_REASON,
  whiteboardDropZoneInputHint,
  whiteboardDropZoneKeyboardIsPointerFree,
  whiteboardDropZoneLongPressMs,
  whiteboardDropZoneTouchDragBegins,
  whiteboardDropZoneTouchThresholdPx,
  whiteboardDropZoneTouchWaits,
} from '../../drop-zone/whiteboardDropZoneTouch';

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

/** Das Ziel **ist** eine Whiteboard-Fläche — daher `kind: 'Whiteboard'`. */
const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'board-target',
  title: 'Workshop board',
  kind: 'Whiteboard',
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
 * Ein Träger, den **keine** Route trägt (Grid-`Chart`) — und zwar **zustandsunabhängig**: diese Matrix kennt nur
 * `Table`, gleichgültig welchen Eintrag die Shell später setzt. Damit bleiben die „Route trägt nicht"-Prüfungen
 * gültig, ohne den Zustand der Produktionsmatrix festzuhalten.
 */
const chartPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: chartSource.id,
  objectId: 'chart-1',
  objectKind: 'Chart',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

/**
 * Eine Matrix mit einer **Whiteboard-Route**, aufgebaut mit der **echten** Klasse (Produktionsobjekt) — nicht mit
 * einem Attrappen-Objekt: *ein Prüfling, der die Regel nicht teilt, beweist die Regel nicht.*
 *
 * UND HIER STAND BIS RUNDE 317 ETWAS, DAS NICHT MEHR STIMMT: „die Produktion reicht die versiegelte Matrix der
 * Shell hinein (...) hier wird derselbe Aufbau mit einer Whiteboard-Route gefahren, **weil die Shell heute keine
 * hat**". DIE SHELL HAT SIE JETZT. Gemessen in `testing/live-objects/whiteboardShellRegistryWiring.test.ts`: die
 * versiegelte Matrix (`FABRIC_WORKSPACE_DROP_REGISTRY`, `shell/fabric/fabricGraphWorkspaceDrop.ts:346`) traegt den
 * Adapter `fabric-grid-table-to-whiteboard` (`:213-218`), und ihr Whiteboard-Manifest importiert `Table` mit `COPY`
 * (`:210-211`). Der Kommentar ist berichtigt, weil ein veralteter Kommentar, der wie eine Messung aussieht, genau
 * die Sorte Erfolgsmeldung ist, die dieses Projekt verbietet.
 *
 * DIESE EIGENE MATRIX BLEIBT TROTZDEM RICHTIG: dieser Test prueft den RESOLVER gegen eine definierte Eingabe,
 * nicht gegen den Zustand der Produktionsmatrix. Waere er an die versiegelte Matrix gebunden, wuerde jede spaetere
 * Registrierung in der Shell ihn still umdeuten.
 */
function boardRouteRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({
    app: 'Grid',
    exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
    imports: [],
  });
  registry.registerAppManifest({
    app: 'Whiteboard',
    exports: [],
    imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
  });
  registry.registerAdapter({
    id: 'whiteboard-board-table',
    targetApp: 'Whiteboard',
    objectKinds: ['Table'],
    intents: ['COPY', 'LIVE_REFERENCE'],
  });
  return registry.seal();
}

const ROUTE_REGISTRY = boardRouteRegistry();

const contextWith = (registry: WorkspaceInteractionRegistry | null | undefined, payload?: unknown): WhiteboardDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  payload,
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Route**, nicht die Richtlinie ✓
  // — *die Zone liest die Entscheidung der Administratorrichtlinie aus ihrem Kontext* ✓✓. *In der Produktion holt
  // die Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge ist ein eigener
  // Vertrag** ✓✓: `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
  requestedPolicyDecision: { effect: 'Allow' },
});

const route = (payload?: unknown): WhiteboardDropZoneContext => contextWith(ROUTE_REGISTRY, payload);
const authority = (payload?: unknown): WhiteboardDropZoneContext => contextWith(FABRIC_WORKSPACE_DROP_REGISTRY, payload);

const closed = () => createWhiteboardDropZone();
const hovered = (payload: unknown, registry: WorkspaceInteractionRegistry | null | undefined = ROUTE_REGISTRY) =>
  hoverWhiteboardDropZone(closed(), contextWith(registry, payload)).state;

describe('Paket 11 — das leere Ziel', () => {
  it('beginnt geschlossen, ohne Urteil und ohne Träger', () => {
    const state = closed();
    expect(whiteboardDropZoneView(state)).toBe('closed');
    expect(state.target.verdict).toBe('none');
    expect(state.target.overTarget).toBe(false);
    expect(whiteboardDropZonePreview(state)).toBeNull();
    expect(state.transfer.ok).toBe(false);
    expect(state.decision.kind).toBe('none');
    expect(isWhiteboardDropZoneVisible(state)).toBe(false);
    expect(isWhiteboardDropZoneDecided(state)).toBe(false);
    expect(whiteboardDropZonePresentation(state).glyph).toBe('');
  });

  it('schließt ein geschlossenes Ziel nicht still, sondern benannt', () => {
    const step = leaveWhiteboardDropZone(closed());
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('whiteboard-drop-inactive');
    expect(whiteboardDropZoneView(step.state)).toBe('closed');
  });
});

describe('Paket 11 — überfahren: das Urteil kommt aus Paket 6', () => {
  it('nimmt eine angebotene Route an und zeigt die Vorschau des Urteils', () => {
    const state = hovered(oneIntentPayload);
    expect(whiteboardDropZoneView(state)).toBe('ready');
    expect(state.target.verdict).toBe('accept');
    expect(state.target.reason).toBeNull();
    expect(state.target.overTarget).toBe(true);
    // Die Vorschau ist die **des Urteils** (Paket 6), nicht eine zweite dieses Moduls.
    expect(whiteboardDropZonePreview(state)).toEqual({ objectKind: 'Table', intent: 'COPY', label: 'Table · COPY' });
    expect(state.transfer.ok).toBe(true);
    if (state.transfer.ok) {
      expect(state.transfer.descriptor.objectKind).toBe('Table');
      expect(state.transfer.descriptor.sourceApp).toBe('Grid');
      expect(state.transfer.descriptor.supportedIntents).toEqual(['COPY']);
    }
    expect(whiteboardDropZoneCanConfirm(state)).toBe(true);
    expect(whiteboardDropZoneRefusalCode(state)).toBeNull();
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
    const state = hovered(chartPayload);
    expect(whiteboardDropZoneView(state)).toBe('open');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    expect(state.transfer.ok).toBe(true);
    expect(whiteboardDropZoneRefusalCode(state)).toBe('route-not-capable');
  });

  it('lehnt einen kaputten Träger benannt ab (payload_invalid)', () => {
    const state = hovered('{kein json');
    expect(state.transfer.ok).toBe(false);
    if (!state.transfer.ok) expect(state.transfer.reason).toBe('payload_invalid');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('object-kind-unknown');
    expect(whiteboardDropZonePreview(state)).toBeNull();
    expect(whiteboardDropZoneRefusalCode(state)).toBe('payload_invalid');
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
    if (!state.transfer.ok) expect(state.transfer.reason).toBe('whiteboard-drop-transfer-missing');
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('object-kind-unknown');
    expect(whiteboardDropZoneCanConfirm(state)).toBe(false);
  });

  /**
   * **Der Übergangsmarker — auf den gemessenen Zustand gezogen, nicht gelöscht, nicht `skip`, nicht gelockert.**
   *
   * Die **eine** Autorität (Paket 4) trägt heute Grid → Writer; die Whiteboard-Route ist **beantragt** (Vokabeln:
   * `objectKinds: ['Table']` × `intents: ['COPY']`) und noch nicht gesetzt. Dieser Vertrag liest die Antwort der
   * versiegelten Matrix **selbst** und behauptet dann **in beiden Welten den vollen, exakten Folgensatz** — er
   * lockert nichts, er verzweigt nur über eine **gemessene** Tatsache:
   *
   *   * **ohne** Route → benannte Ablehnung (`route-not-capable`), kein stiller Erfolg, Knopf nicht aktiv;
   *   * **mit** Route → `accept` und ein **vollendeter** Drop über **genau den Adapter, den die Matrix führt**.
   *
   * Und in **beiden** Zweigen gilt die Eigenschaft, die dieses Paket trägt: *das Urteil beim Überfahren und das
   * Ergebnis der Ablage widersprechen sich nie* („überfahren: nein" bei „abgelegt: ja" wäre eine Lüge).
   */
  it('folgt der versiegelten Matrix in beiden Zuständen: heute benannte Ablehnung, nach dem Eintrag vollendete Zustellung', () => {
    const answer = whiteboardDropCapabilityQuestion({ ...authority(oneIntentPayload) });
    const routeCarried = answer !== null && answer('Whiteboard', 'Table', 'COPY') === true;
    const state = hovered(oneIntentPayload, FABRIC_WORKSPACE_DROP_REGISTRY);
    const dropped = dropWhiteboardDropZone(state, authority(oneIntentPayload));
    if (!routeCarried) {
      // Welt (a) — der heute gemessene Zustand: keine Whiteboard-Route in der versiegelten Matrix.
      expect(state.target.verdict).toBe('reject');
      expect(state.target.reason).toBe('route-not-capable');
      expect(whiteboardDropZoneView(state)).toBe('open');
      expect(whiteboardDropZoneCanConfirm(state)).toBe(false); // „ablegen" darf nicht aktiv aussehen
      expect(dropped.ok).toBe(false);
      expect(dropped.state.decision.kind).toBe('refused');
      expect(whiteboardDropZoneRefusalCode(dropped.state)).not.toBeNull();
    } else {
      // Welt (b) — der Zustand **nach** dem Eintrag: dieselbe Aussage, nur mit der Route.
      expect(state.target.verdict).toBe('accept');
      expect(state.target.reason).toBeNull();
      expect(state.target.preview?.label).toBe('Table · COPY');
      expect(whiteboardDropZoneView(state)).toBe('ready');
      expect(whiteboardDropZoneCanConfirm(state)).toBe(true);
      expect(dropped.ok).toBe(true);
      expect(dropped.state.decision.kind).toBe('delivered');
      if (dropped.state.decision.kind === 'delivered') {
        const resolution = dropped.state.decision.resolution;
        // **Genau der Adapter der Matrix** — kein privater Pfad, und keine erfundene Kennung.
        expect(resolution.adapterId).toBe(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Whiteboard', 'Table', 'COPY')?.id);
        expect(resolution.adapterId.length).toBeGreaterThan(0);
        expect(resolution.intent).toBe('COPY');
        expect(resolution.sourceDocumentId).toBe(source.id);
        expect(resolution.sourceObjectId).toBe('table-forecast');
        expect(resolution.targetDocumentId).toBe(target.id);
        expect(resolution.sourceVersion).toBe(3);
        expect(resolution.targetVersion).toBe(4);
      }
    }
    // Die eine Eigenschaft, die in **beiden** Welten gilt: Urteil und Ablage widersprechen sich nie.
    expect(dropped.state.decision.kind === 'delivered').toBe(state.target.verdict === 'accept');
  });

  it('ist fail-closed, wenn die Autorität fehlt oder nicht antwortet', () => {
    // **Ohne** den Helfer aufgerufen: `hovered(…, undefined)` würde dessen Vorgabewert greifen lassen und damit
    // gerade **nicht** den fehlenden Registry-Fall prüfen — der Fehler steckte im Prüfstand, nicht im Code.
    for (const broken of [null, undefined]) {
      const state = hoverWhiteboardDropZone(closed(), contextWith(broken, oneIntentPayload)).state;
      expect(state.target.verdict, String(broken)).toBe('reject');
      expect(state.target.reason).toBe('verdict-unavailable');
      expect(whiteboardDropZoneView(state)).toBe('open');
    }
    const throwing = {
      isSealed: true,
      getAdapter: () => { throw new Error('kaputt'); },
      getCompatibleIntents: () => { throw new Error('kaputt'); },
    } as unknown as WorkspaceInteractionRegistry;
    // Überfahren: die Frage **wirft** in der Autorität → sie antwortet `false` → das Urteil lehnt ab (Paket 6).
    const state = hoverWhiteboardDropZone(closed(), contextWith(throwing, oneIntentPayload)).state;
    expect(state.target.verdict).toBe('reject');
    expect(state.target.reason).toBe('route-not-capable');
    // Die Ablage wird vom **Urteil** aufgehalten (der eine Riegel) — nicht erst vom Resolver.
    expect(dropWhiteboardDropZone(state, contextWith(throwing, oneIntentPayload)).reason).toBe('route-not-capable');
    // Die **Zustellung** selbst ist ebenfalls fail-closed: sie wird hier über die Tastatur-Absicht erreicht, die
    // das Urteil nicht als Riegel vorschaltet — und nennt dann denselben Namen wie Paket 6 für „keine Antwort".
    expect(chooseWhiteboardDropIntent(state, 'COPY', contextWith(throwing, oneIntentPayload)).reason).toBe('verdict-unavailable');
    expect(chooseWhiteboardDropIntent(state, 'COPY', contextWith(null, oneIntentPayload)).reason).toBe('verdict-unavailable');
  });

  it('fragt nicht, wenn die Fläche ihr eigenes Ziel nicht kennt', () => {
    const noApp = hoverWhiteboardDropZone(closed(), { ...route(oneIntentPayload), targetApp: '' });
    expect(noApp.ok).toBe(false);
    expect(noApp.reason).toBe('whiteboard-drop-target-missing');
    expect(noApp.state.decision.kind).toBe('refused');
    const noDocument = hoverWhiteboardDropZone(closed(), { ...route(oneIntentPayload), targetDocumentId: '' });
    expect(noDocument.ok).toBe(false);
    expect(noDocument.reason).toBe('whiteboard-drop-target-missing');
  });

  it('baut die Fähigkeitsfrage nur mit einer lesbaren Antwort der Autorität', () => {
    expect(whiteboardDropCapabilityQuestion(route(oneIntentPayload))).not.toBeNull();
    expect(whiteboardDropCapabilityQuestion(route(undefined))).toBeNull();
    expect(whiteboardDropCapabilityQuestion({ ...route(oneIntentPayload), registry: null })).toBeNull();
    const question = whiteboardDropCapabilityQuestion(route(oneIntentPayload));
    expect(question?.('Whiteboard', 'Table', 'COPY')).toBe(true);
    expect(question?.('Whiteboard', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
  });
});

describe('Paket 11 — ablegen: eine Zustellung, kein stiller Erfolg', () => {
  it('stellt eine eindeutige Route zu, verbraucht das Urteil und verändert kein Dokument', () => {
    const before = structuredClone(documents);
    const state = hovered(oneIntentPayload);
    const step = dropWhiteboardDropZone(state, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(whiteboardDropZoneView(step.state)).toBe('resolved');
    expect(step.state.decision.kind).toBe('delivered');
    if (step.state.decision.kind === 'delivered') {
      expect(step.state.decision.resolution).toEqual({
        adapterId: 'whiteboard-board-table',
        intent: 'COPY',
        // **Paket 15**: die Kopie **sagt** ihre Behandlungsart und trägt **keinen** Modus.
        integrationKind: 'copy',
        sourceDocumentId: source.id,
        sourceObjectId: 'table-forecast',
        targetDocumentId: target.id,
        sourceVersion: 3,
        targetVersion: 4,
      });
      expect(step.state.decision.resolution.mode).toBeUndefined();
    }
    // Paket 6: **nach dem Ablegen ist das Ziel wieder leer** — ein stehengebliebenes „hier annehmen" wäre eine Lüge.
    expect(step.state.target.verdict).toBe('none');
    expect(step.state.target.overTarget).toBe(false);
    expect(documents).toEqual(before);
  });

  it('legt ohne gewählte Absicht nichts ab, sondern verlangt sie benannt', () => {
    const state = hovered(twoIntentPayload);
    const step = dropWhiteboardDropZone(state, route(twoIntentPayload));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_intent_choice_required');
    expect(whiteboardDropZoneView(step.state)).toBe('choice');
    expect(step.state.decision.kind).toBe('choice');
    expect(whiteboardDropZoneChoices(step.state).map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
    expect(whiteboardDropZoneChoices(step.state).map((choice) => choice.key)).toEqual(['1', '2']);
    expect(whiteboardDropZoneChoices(step.state)[0]?.label).toBe(WHITEBOARD_DROP_INTENT_LABEL.COPY);
    expect(whiteboardDropZoneCanConfirm(step.state)).toBe(false);
  });

  it('lehnt einen kaputten Träger mit dem Code des Parsers ab', () => {
    const step = dropWhiteboardDropZone(closed(), route('{kein json'));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('payload_invalid');
    expect(whiteboardDropZoneView(step.state)).toBe('refused');
    expect(whiteboardDropZoneRefusalCode(step.state)).toBe('payload_invalid');
  });

  it('lehnt eine Ablage ohne Träger benannt ab, statt sie zu verschlucken', () => {
    const step = dropWhiteboardDropZone(closed(), route(undefined));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('whiteboard-drop-transfer-missing');
    expect(whiteboardDropZoneView(step.state)).toBe('refused');
  });

  it('legt einen entschiedenen Fall nicht ein zweites Mal ab', () => {
    const delivered = dropWhiteboardDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const second = dropWhiteboardDropZone(delivered, route(oneIntentPayload));
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('whiteboard-drop-already-decided');
    expect(second.state.decision.kind).toBe('delivered');
  });

  it('nennt ein fehlendes Quellobjekt über den Resolver, wo das Urteil nur „keine Route" sagen kann', () => {
    // Das Urteil (Paket 6) urteilt über die **Route**; die genaue Identität nennt der Resolver.
    const step = chooseWhiteboardDropIntent(hovered(oneIntentPayload), 'COPY', {
      ...route(oneIntentPayload),
      documents: { [target.id]: target },
    });
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_source_document_missing');
  });

  it('legt ohne Canvas und ohne Zeiger ab: eine Ablage ohne vorheriges Überfahren wird benannt, nicht still', () => {
    // „Ablegen" auf eine noch geschlossene Fläche: das Urteil entsteht **hier** (Paket 6), nicht aus einem Hover.
    const step = dropWhiteboardDropZone(closed(), route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('delivered');
  });
});

describe('Paket 11 — die Tastatur ist ein Weg, kein Zusatz', () => {
  it('legt mit der Absicht genau so zu wie der Zeiger', () => {
    const ready = hovered(oneIntentPayload);
    const viaKeyboard = confirmWhiteboardDropZone(ready, route(oneIntentPayload));
    const viaPointer = dropWhiteboardDropZone(ready, route(oneIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision).toEqual(viaPointer.state.decision);
  });

  it('bestätigt **ohne** Überfahren — die Tastatur braucht die Leinwand nicht', () => {
    const fresh = closed();
    expect(fresh.target.overTarget).toBe(false);
    const step = confirmWhiteboardDropZone(fresh, route(oneIntentPayload));
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('delivered');
  });

  it('bestätigt im Zustand „Absicht erforderlich" nicht heimlich, sondern wörtlich wie die Ablage', () => {
    const choice = dropWhiteboardDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    const viaEnter = confirmWhiteboardDropZone(choice, route(twoIntentPayload));
    const viaDrop = dropWhiteboardDropZone(choice, route(twoIntentPayload));
    expect(viaEnter).toEqual(viaDrop);
    expect(viaEnter.reason).toBe('drop_intent_choice_required');
  });

  it('führt die gewählte Absicht durch dieselbe Zustellung wie die Ablage', () => {
    const choice = dropWhiteboardDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    // **Paket 15, vorgezogen (Runde 258) ✓✓** — *nicht gelöscht, nicht gelockert, nicht geskippt* ✓: Live **ohne**
    // Modus ist der **benannte** Fehlschlag ✓. **Und der Zeuge bleibt stehen** ✓✓ — *er ist jetzt die Aussage
    // „kein heimlicher Default", nicht mehr ein Übergangsmarker* ✓:
    const ohneModus = chooseWhiteboardDropIntent(choice, 'LIVE_REFERENCE', route(twoIntentPayload));
    expect(ohneModus.ok).toBe(false);
    expect(ohneModus.reason).toBe('drop_live_mode_required');
    // **Und der Zweck bleibt** ✓: die gewählte Absicht geht durch **dieselbe Zustellung** wie die Ablage ✓ — *über die Kopie*.
    const viaKeyboard = chooseWhiteboardDropIntent(choice, 'COPY', route(twoIntentPayload));
    expect(viaKeyboard.ok).toBe(true);
    expect(viaKeyboard.state.decision.kind).toBe('delivered');
    if (viaKeyboard.state.decision.kind === 'delivered') {
      expect(viaKeyboard.state.decision.resolution.intent).toBe('COPY');
      expect(viaKeyboard.state.decision.resolution.adapterId).toBe('whiteboard-board-table');
      expect(viaKeyboard.state.decision.resolution.targetVersion).toBe(4);
      // **Paket 15 ✓:** die Kopie trägt **keinen** Modus — *die Abwesenheit ist die Aussage* ✓.
      expect(viaKeyboard.state.decision.resolution.integrationKind).toBe('copy');
      expect(viaKeyboard.state.decision.resolution.mode).toBeUndefined();
    }

    // **Paket 15, EINGELÖST (Runde 260) ✓✓:** *Mit gesagtem Modus stellt dieselbe Zustellung vollendet zu* ✓ —
    // und der Modus kommt **aus dem Kontext**, nicht aus einem Default ✓. Genau die Akzeptanzhandlung:
    // „klare Auswahl Live/Frozen **ohne heimlichen Default**" ✓.
    const mitLive = chooseWhiteboardDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Live' });
    expect(mitLive.ok).toBe(true);
    expect(whiteboardDropZoneView(mitLive.state)).toBe('resolved');
    if (mitLive.state.decision.kind === 'delivered') {
      expect(mitLive.state.decision.resolution.intent).toBe('LIVE_REFERENCE');
      expect(mitLive.state.decision.resolution.integrationKind).toBe('live');
      expect(mitLive.state.decision.resolution.mode).toBe('Live');
      expect(mitLive.state.decision.resolution.adapterId).toBe('whiteboard-board-table');
      expect(mitLive.state.decision.resolution.sourceVersion).toBe(3);
      expect(mitLive.state.decision.resolution.targetVersion).toBe(4);
    }
    // **Zwei Modi, keine Vorauswahl** ✓: Frozen ist ebenso wählbar — und liefert **seinen** Modus.
    const mitFrozen = chooseWhiteboardDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Frozen' });
    expect(mitFrozen.ok).toBe(true);
    if (mitFrozen.state.decision.kind === 'delivered') {
      expect(mitFrozen.state.decision.resolution.mode).toBe('Frozen');
      expect(mitFrozen.state.decision.resolution.integrationKind).toBe('live');
    }
    // **Fail-closed bleibt fail-closed** ✓: ein **erfundener** Modus ist kein Modus — der Resolver benennt ihn,
    // die Fläche erfindet **keinen** Ersatz ✗.
    expect(chooseWhiteboardDropIntent(choice, 'LIVE_REFERENCE', { ...route(twoIntentPayload), requestedMode: 'Halbmond' }).reason)
      .toBe('drop_live_mode_required');
    // Und die **Ablage** (nicht nur die Tastatur) führt den Modus ebenso mit ✓ — *ein Weg, nicht zwei* ✓.
    const ablageMitModus = dropWhiteboardDropZone(choice, { ...route(twoIntentPayload), requestedMode: 'Live' });
    expect(ablageMitModus.ok).toBe(false); // ohne gewählte Absicht bleibt es die benannte Wahl …
    expect(ablageMitModus.reason).toBe('drop_intent_choice_required');
    const einAbsichtMitModus = dropWhiteboardDropZone(
      hoverWhiteboardDropZone(closed(), { ...route(oneIntentPayload), requestedMode: 'Live' }).state,
      { ...route(oneIntentPayload), requestedMode: 'Live' },
    );
    // Ein **COPY**-Träger wird auch **mit** gesetztem Modus als **Kopie** zugestellt — *der Modus gehört der
    // Live-Route*; die Kopie trägt ihn **nicht** ✓ (gemessen: der Resolver setzt ihn dort nicht).
    expect(einAbsichtMitModus.ok).toBe(true);
    expect(einAbsichtMitModus.state.decision.kind).toBe('delivered');
    if (einAbsichtMitModus.state.decision.kind === 'delivered') {
      expect(einAbsichtMitModus.state.decision.resolution.integrationKind).toBe('copy');
      expect(einAbsichtMitModus.state.decision.resolution.mode).toBeUndefined();
    }
  });

  it('Paket 15 — Live ohne Modus ist **nicht** `route-not-capable`: die Route ist fähig, der Modus fehlt', () => {
    // **Der Unterschied, den Paket 15 macht** ✓✓: eine Matrix, die **nur** `LIVE_REFERENCE` führt (genau der Fall,
    // in dem die gefaltete Frage sonst fälschlich „keine Route" meldete).
    const liveOnly = (() => {
      const registry = new WorkspaceInteractionRegistry();
      registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
      registry.registerAppManifest({ app: 'Whiteboard', exports: [], imports: [{ objectKind: 'Table', intents: ['LIVE_REFERENCE'] }] });
      registry.registerAdapter({ id: 'whiteboard-board-live', targetApp: 'Whiteboard', objectKinds: ['Table'], intents: ['LIVE_REFERENCE'] });
      return registry.seal();
    })();
    const livePayload = intentOnlyPayload('LIVE_REFERENCE');
    // **Ohne** Modus: das Urteil sagt **accept** (die Route ist fähig!) — *nicht* `route-not-capable` ✗✓.
    const ohneModus = hoverWhiteboardDropZone(closed(), contextWith(liveOnly, livePayload)).state;
    expect(ohneModus.target.verdict).toBe('accept');
    expect(ohneModus.target.reason).toBeNull();
    expect(ohneModus.target.preview?.intent).toBe('LIVE_REFERENCE');
    expect(whiteboardDropZoneView(ohneModus)).toBe('ready');
    expect(whiteboardDropZoneCanConfirm(ohneModus)).toBe(true);
    // Und die **Ablage** benennt dann den fehlenden Modus — *kein stiller Erfolg, kein falscher Routengrund* ✓.
    const ablage = dropWhiteboardDropZone(ohneModus, contextWith(liveOnly, livePayload));
    expect(ablage.ok).toBe(false);
    expect(ablage.reason).toBe('drop_live_mode_required');
    expect(whiteboardDropZoneView(ablage.state)).toBe('refused');
    // **Mit** Modus ergibt dieselbe Frage `accept` **und** einen vollendeten Drop ✓✓.
    const mitModus = hoverWhiteboardDropZone(closed(), { ...contextWith(liveOnly, livePayload), requestedMode: 'Frozen' }).state;
    expect(mitModus.target.verdict).toBe('accept');
    const zustellung = dropWhiteboardDropZone(mitModus, { ...contextWith(liveOnly, livePayload), requestedMode: 'Frozen' });
    expect(zustellung.ok).toBe(true);
    expect(zustellung.state.decision.kind).toBe('delivered');
    if (zustellung.state.decision.kind === 'delivered') {
      expect(zustellung.state.decision.resolution.integrationKind).toBe('live');
      expect(zustellung.state.decision.resolution.mode).toBe('Frozen');
      expect(zustellung.state.decision.resolution.adapterId).toBe('whiteboard-board-live');
    }
    // **Die Fähigkeitsfrage selbst** ✓ — sie liest **genau einen** Code der Autorität als „fähig".
    const frage = whiteboardDropCapabilityQuestion(contextWith(liveOnly, livePayload));
    expect(frage?.('Whiteboard', 'Table', 'LIVE_REFERENCE')).toBe(true);
    // *Und nichts anderes wird so gelesen:* MOVE bleibt `false` (der Resolver hält es nicht).
    expect(whiteboardDropCapabilityQuestion(contextWith(registryWithBoardEntry(['Table'], ['MOVE']), intentOnlyPayload('MOVE')))?.('Whiteboard', 'Table', 'MOVE')).toBe(false);
  });

  it('lehnt eine nicht angebotene und eine unbekannte Absicht benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    expect(chooseWhiteboardDropIntent(ready, 'FROZEN_SNAPSHOT', route(oneIntentPayload)).reason).toBe('drop_intent_not_supported');
    expect(chooseWhiteboardDropIntent(ready, 'TELEPORT', route(oneIntentPayload)).reason).toBe('intent_unknown');
    // Ein bereits gelesener Träger **im Zustand** genügt der Tastatur — sie braucht keine Ablagefläche.
    expect(chooseWhiteboardDropIntent(ready, 'COPY', route(undefined)).ok).toBe(true);
    // Ohne gelesenen Träger ist es ein **benannter** Grund, kein stiller No-op.
    expect(chooseWhiteboardDropIntent(closed(), 'COPY', route(undefined)).reason).toBe('whiteboard-drop-transfer-missing');
  });

  it('übersetzt Tasten in Absichten und nennt ungebundene Tasten', () => {
    const choice = dropWhiteboardDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(resolveWhiteboardDropCommand(choice, 'Enter')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveWhiteboardDropCommand(choice, ' ')).toEqual({ ok: true, command: { kind: 'confirm' } });
    expect(resolveWhiteboardDropCommand(choice, 'Escape')).toEqual({ ok: true, command: { kind: 'dismiss' } });
    expect(resolveWhiteboardDropCommand(choice, '1')).toEqual({ ok: true, command: { kind: 'choose', intent: 'COPY' } });
    expect(resolveWhiteboardDropCommand(choice, '2')).toEqual({ ok: true, command: { kind: 'choose', intent: 'LIVE_REFERENCE' } });
    expect(resolveWhiteboardDropCommand(choice, '9')).toEqual({ ok: false, reason: 'whiteboard-drop-key-unbound' });
    expect(resolveWhiteboardDropCommand(choice, 'x')).toEqual({ ok: false, reason: 'whiteboard-drop-key-unbound' });
    expect(resolveWhiteboardDropCommand(choice, 2)).toEqual({ ok: false, reason: 'whiteboard-drop-key-unbound' });
    // Eine Ziffer ist **nur** eine Absicht, wenn die Matrix eine angeboten hat.
    expect(resolveWhiteboardDropCommand(hovered(twoIntentPayload), '1')).toEqual({ ok: false, reason: 'whiteboard-drop-key-unbound' });
  });

  it('führt Befehle aus und lehnt unbekannte Befehle benannt ab', () => {
    const ready = hovered(oneIntentPayload);
    const dismissed = applyWhiteboardDropCommand(ready, { kind: 'dismiss' }, route(oneIntentPayload));
    expect(dismissed.state.decision.kind).toBe('none');
    expect(whiteboardDropZoneView(dismissed.state)).toBe('closed');
    expect(dismissed.state.closedReason).toBe('keyboard-dismiss');
    const bogus = applyWhiteboardDropCommand(ready, { kind: 'teleport' } as never, route(oneIntentPayload));
    expect(bogus.ok).toBe(false);
    expect(bogus.reason).toBe('whiteboard-drop-command-unknown');
  });
});

describe('Paket 11 — der Zeiger überschreibt keine Tatsache', () => {
  it('löst einen entschiedenen Fall nur durch einen **neuen** Zug ab', () => {
    const delivered = dropWhiteboardDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(isWhiteboardDropZoneDecided(delivered)).toBe(true);
    expect(whiteboardDropZoneView(hoverWhiteboardDropZone(delivered, route(oneIntentPayload)).state)).toBe('resolved');
    expect(whiteboardDropZoneView(leaveWhiteboardDropZone(delivered, 'drag-left').state)).toBe('resolved');
    const entered = enterWhiteboardDropZone(delivered, route(twoIntentPayload));
    expect(whiteboardDropZoneView(entered.state)).toBe('ready');
    expect(entered.state.decision.kind).toBe('none');
  });

  it('schließt eine nur überfahrene Fläche beim Verlassen und nimmt das Urteil zurück', () => {
    const step = leaveWhiteboardDropZone(hovered(oneIntentPayload), 'drag-left');
    expect(step.ok).toBe(true);
    expect(whiteboardDropZoneView(step.state)).toBe('closed');
    expect(step.state.closedReason).toBe('drag-left');
    expect(step.state.target.verdict).toBe('none');
    expect(step.state.target.preview).toBeNull();
    expect(step.state.transfer.ok).toBe(false);
  });
});

describe('Paket 11 — der Empfänger folgt der vorhandenen Zieh-Session (Paket 5)', () => {
  it('öffnet sich aus der laufenden Sitzung mit deren Träger', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, twoIntentPayload);
    expect(started.ok).toBe(true);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    expect(moved.state.phase).toBe('dragging');
    const step = whiteboardDropZoneFromDragSession(closed(), moved.state, route());
    expect(whiteboardDropZoneView(step.state)).toBe('ready');
    expect(step.state.target.preview?.objectKind).toBe('Table');
    expect(step.state.transfer.ok).toBe(true);
  });

  it('schließt eine überfahrene Fläche, wenn der Zug abgebrochen wird — mit **dessen** benanntem Grund', () => {
    const started = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, oneIntentPayload);
    const moved = moveDrag(started.state, { pointerId: 1, x: 40, y: 0 });
    const open = whiteboardDropZoneFromDragSession(closed(), moved.state, route()).state;
    const cancelled = cancelDrag(moved.state, 'pointer-lost');
    const after = whiteboardDropZoneFromDragSession(open, cancelled.state, route());
    expect(whiteboardDropZoneView(after.state)).toBe('closed');
    // Der Grund der Sitzung wird **übernommen**, nicht eingeebnet: `pointercancel` heißt `pointer-lost`.
    expect(after.state.closedReason).toBe('pointer-lost');
    const blurred = cancelDrag(moved.state, 'window-blur');
    expect(whiteboardDropZoneFromDragSession(open, blurred.state, route()).state.closedReason).toBe('window-blur');
    // Und ohne vorheriges Überfahren ist es ein **benannter** No-op.
    const idle = whiteboardDropZoneFromDragSession(closed(), cancelled.state, route());
    expect(idle.ok).toBe(false);
    expect(idle.reason).toBe('whiteboard-drop-inactive');
  });

  it('lässt eine Zustellung stehen, wenn der Zug endet', () => {
    const delivered = dropWhiteboardDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    const started = beginDrag(createDragSession(), { pointerId: 2, x: 0, y: 0 }, oneIntentPayload);
    const cancelled = cancelDrag(started.state, 'pointer-lost');
    const after = whiteboardDropZoneFromDragSession(delivered, cancelled.state, route(oneIntentPayload));
    expect(after.ok).toBe(true);
    expect(whiteboardDropZoneView(after.state)).toBe('resolved');
  });
});

describe('Paket 11 — der Träger aus der Ablagefläche', () => {
  const transfer = (value: unknown) => ({ getData: (mime: string) => (mime === FABRIC_WORKSPACE_OBJECT_DRAG_MIME ? value : '') });

  it('liest genau die vorhandene MIME-Konstante', () => {
    expect(readWhiteboardWorkspaceTransfer(transfer(oneIntentPayload))).toEqual({ ok: true, payload: oneIntentPayload });
  });

  it('nennt einen fehlenden Träger, statt ihn zu erfinden', () => {
    expect(readWhiteboardWorkspaceTransfer(transfer(''))).toEqual({ ok: false, reason: 'whiteboard-drop-transfer-missing' });
    expect(readWhiteboardWorkspaceTransfer(null)).toEqual({ ok: false, reason: 'whiteboard-drop-transfer-missing' });
  });

  it('nennt eine unlesbare Ablagefläche', () => {
    expect(readWhiteboardWorkspaceTransfer({})).toEqual({ ok: false, reason: 'whiteboard-drop-transfer-unreadable' });
    expect(readWhiteboardWorkspaceTransfer({ getData: () => { throw new Error('kein Zugriff'); } }))
      .toEqual({ ok: false, reason: 'whiteboard-drop-transfer-unreadable' });
  });

  it('erkennt den Zug an `types` — der Inhalt ist während `dragover` geschützt', () => {
    expect(isWhiteboardWorkspaceDrag({ types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME] })).toBe(true);
    expect(isWhiteboardWorkspaceDrag({ types: ['Files'] })).toBe(false);
    expect(isWhiteboardWorkspaceDrag({ types: [] })).toBe(false);
    expect(isWhiteboardWorkspaceDrag({ types: { 0: FABRIC_WORKSPACE_OBJECT_DRAG_MIME, length: 1 } })).toBe(true);
    expect(isWhiteboardWorkspaceDrag({ types: null })).toBe(false);
    expect(isWhiteboardWorkspaceDrag({})).toBe(false);
    expect(isWhiteboardWorkspaceDrag(null)).toBe(false);
    expect(isWhiteboardWorkspaceDrag(undefined)).toBe(false);
  });

  it('liest den Träger durch den einen Parser (Paket 7) und gibt dessen Deskriptor weiter', () => {
    const read = readWhiteboardDropTransfer(oneIntentPayload);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.descriptor.objectKind).toBe('Table');
      expect(read.descriptor.documentId).toBe(source.id);
      expect(read.descriptor.objectId).toBe('table-forecast');
    }
    expect(readWhiteboardDropTransfer(undefined).ok).toBe(false);
    expect(readWhiteboardDropTransfer(42).ok).toBe(false);
  });
});

describe('Paket 11 — Touch ist entschieden, nicht angenommen', () => {
  it('liest den Langdruck und die Toleranz aus Paket 5/6, statt eine zweite Zahl zu setzen', () => {
    expect(whiteboardDropZoneLongPressMs()).toBe(DRAG_TOUCH_LONGPRESS_MS);
    expect(whiteboardDropZoneTouchThresholdPx()).toBe(dragThresholdForInput('touch', DRAG_THRESHOLD_PX));
    expect(whiteboardDropZoneTouchWaits()).toBe(true);
    expect(whiteboardDropZoneKeyboardIsPointerFree()).toBe(true);
  });

  it('beginnt einen Touch-Zug erst nach Langdruck innerhalb der Toleranz', () => {
    const long = whiteboardDropZoneLongPressMs();
    const tolerance = whiteboardDropZoneTouchThresholdPx();
    expect(whiteboardDropZoneTouchDragBegins(long - 1, 0)).toBe(false);
    expect(whiteboardDropZoneTouchDragBegins(long, 0)).toBe(true);
    expect(whiteboardDropZoneTouchDragBegins(long + 1, tolerance)).toBe(true);
    expect(whiteboardDropZoneTouchDragBegins(long + 1, tolerance + 1)).toBe(false);
  });

  it('ist bei unbrauchbaren Zahlen fail-closed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, '250', null, undefined]) {
      expect(whiteboardDropZoneTouchDragBegins(bad, 0), String(bad)).toBe(false);
      expect(whiteboardDropZoneTouchDragBegins(1000, bad), String(bad)).toBe(false);
    }
  });

  it('stiehlt dem Board die Geste nicht: `manipulation`, nie `none`', () => {
    expect(WHITEBOARD_DROP_ZONE_TOUCH_ACTION).toBe('manipulation');
    expect(WHITEBOARD_DROP_ZONE_TOUCH_ACTION).not.toBe('none');
    expect(whiteboardDropZoneInputHint('touch')).toContain(`touch-action: ${WHITEBOARD_DROP_ZONE_TOUCH_ACTION}`);
    expect(whiteboardDropZoneInputHint('touch')).toContain(String(whiteboardDropZoneLongPressMs()));
    expect(whiteboardDropZoneInputHint('keyboard')).toContain('no pointer');
    expect(whiteboardDropZoneInputHint('pen')).toContain('Pointer');
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session', () => {
    expect(WHITEBOARD_DROP_ZONE_TOUCH_CANCEL_REASON).toBe('pointer-lost');
    const closedByTouch = leaveWhiteboardDropZone(hovered(oneIntentPayload), WHITEBOARD_DROP_ZONE_TOUCH_CANCEL_REASON);
    expect(closedByTouch.state.closedReason).toBe('pointer-lost');
    expect(whiteboardDropZoneView(closedByTouch.state)).toBe('closed');
  });
});

describe('Paket 11 — das Vokabular ist eine Definition', () => {
  it('nimmt die Objektart- und Absichtswörter aus der vorhandenen Fabric-Oberfläche', () => {
    expect(whiteboardDropObjectKindLabel('Table')).toBe(FABRIC_GRAPH_COPY['en-US'].objectType.Table);
    expect(WHITEBOARD_DROP_INTENT_LABEL.COPY).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy);
    expect(WHITEBOARD_DROP_INTENT_LABEL.LIVE_REFERENCE).toBe(FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink);
  });

  it('nimmt die Sätze der Matrix-Codes aus dem Fehler selbst, statt sie zweimal zu schreiben', () => {
    for (const code of ['payload_invalid', 'registry_adapter_route_missing', 'drop_authorization_failed', 'intent_unknown'] as const) {
      expect(whiteboardDropRefusalText(code), code).toBe(new WorkspaceInteractionError(code).message);
    }
  });

  it('hat für jeden eigenen Grund und jeden Urteilsgrund einen sichtbaren Satz', () => {
    const own: readonly WhiteboardDropZoneRefusal[] = [
      'whiteboard-drop-transfer-missing',
      'whiteboard-drop-transfer-unreadable',
      'whiteboard-drop-target-missing',
      'whiteboard-drop-inactive',
      'whiteboard-drop-already-decided',
      'whiteboard-drop-command-unknown',
      'object-kind-unknown',
      'intent-unknown',
      'route-not-capable',
      'payload-missing',
      'verdict-unavailable',
    ];
    for (const code of own) {
      const text = whiteboardDropRefusalText(code);
      expect(text.length, code).toBeGreaterThan(10);
      expect(text, code).not.toBe(code);
    }
  });

  it('gibt jedem View-Zustand ein eigenes Zeichen, eine eigene Form und eigene Worte', () => {
    const views: WhiteboardDropZoneView[] = ['closed', 'open', 'ready', 'choice', 'refused', 'resolved'];
    const signatures = new Set<string>();
    for (const view of views) {
      const presentation = WHITEBOARD_DROP_ZONE_PRESENTATION[view];
      signatures.add(`${presentation.glyph}|${presentation.pattern}|${presentation.headline}`);
    }
    expect(signatures.size).toBe(views.length);
    // Die View-Phase ist aus den Tatsachen **gerechnet**, nicht gespeichert: die Zustandsform hat kein Feld dafür.
    expect(Object.keys(closed()).sort()).toEqual(['closedReason', 'decision', 'target', 'transfer']);
  });

  it('rechnet die View-Phase aus Urteil und Zustellung', () => {
    expect(whiteboardDropZoneView(closed())).toBe('closed');
    expect(whiteboardDropZoneView(hovered(oneIntentPayload))).toBe('ready');
    // Für den abgelehnten „überfahren"-Fall wird **nicht** die Produktionsmatrix befragt (ihr Zustand ändert sich
    // mit dem beantragten Eintrag) — sondern der zustandsunabhängige Fall „keine Antwort der Autorität".
    expect(whiteboardDropZoneView(hoverWhiteboardDropZone(closed(), contextWith(null, oneIntentPayload)).state)).toBe('open');
    expect(whiteboardDropZoneView(hovered(chartPayload))).toBe('open');
    const choice = dropWhiteboardDropZone(hovered(twoIntentPayload), route(twoIntentPayload)).state;
    expect(whiteboardDropZoneView(choice)).toBe('choice');
    const refused = dropWhiteboardDropZone(closed(), route('{kein json')).state;
    expect(whiteboardDropZoneView(refused)).toBe('refused');
    const delivered = dropWhiteboardDropZone(hovered(oneIntentPayload), route(oneIntentPayload)).state;
    expect(whiteboardDropZoneView(delivered)).toBe('resolved');
    // Und die Präsentation folgt der gerechneten Phase (eine Quelle für die Ansicht).
    expect(whiteboardDropZonePresentation(delivered).glyph).toBe(WHITEBOARD_DROP_ZONE_PRESENTATION.resolved.glyph);
  });
});

/**
 * **Die Vokabeln des beantragten Matrix-Eintrags — gemessen, nicht beschrieben.**
 *
 * Die Route gehört **nicht** mir (`src/shell/fabric/fabricGraphWorkspaceDrop.ts`), aber die Vokabeln muss ich
 * liefern. Deshalb wird hier mit der **echten** `WorkspaceInteractionRegistry` und dem **echten** Resolver gemessen,
 * welche `objectKinds` × `intents` mein `whiteboardDropCapabilityQuestion` auf `accept` bringen — und was **nicht**
 * hinein darf, weil die Matrix dann etwas verspräche, das der Resolver nicht hält.
 *
 * Die Bindung ist eine **Schnittmenge**: die Route wirkt nur, wenn **die Quelle** die Objektart mit der Absicht
 * **exportiert** (`getCompatibleIntents`, Grid tut das für `Table` mit `COPY`/`LIVE_REFERENCE`) **und** die
 * Whiteboard-Fläche sie **importiert** und ein Adapter sie führt.
 */
function registryWithBoardEntry(
  objectKinds: readonly WorkspaceObjectKind[],
  intents: readonly WorkspaceDropIntent[],
): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Whiteboard', exports: [], imports: objectKinds.map((objectKind) => ({ objectKind, intents })) });
  registry.registerAdapter({ id: 'fabric-grid-table-to-whiteboard', targetApp: 'Whiteboard', objectKinds, intents });
  return registry.seal();
}

const intentOnlyPayload = (intent: WorkspaceDropIntent): string => serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: [intent],
}));

describe('Paket 11 — die Vokabeln des Matrix-Eintrags, gemessen', () => {
  it('EMPFEHLUNG: `objectKinds: [\'Table\']` mit `intents: [\'COPY\']` erreicht accept UND einen vollendeten Drop', () => {
    const registry = registryWithBoardEntry(['Table'], ['COPY']);
    const state = hoverWhiteboardDropZone(closed(), contextWith(registry, oneIntentPayload)).state;
    expect(state.target.verdict).toBe('accept');
    expect(whiteboardDropZoneView(state)).toBe('ready');
    const dropped = dropWhiteboardDropZone(state, contextWith(registry, oneIntentPayload));
    expect(dropped.ok).toBe(true);
    expect(dropped.state.decision.kind).toBe('delivered');
    if (dropped.state.decision.kind === 'delivered') {
      expect(dropped.state.decision.resolution).toEqual({
        adapterId: 'fabric-grid-table-to-whiteboard',
        intent: 'COPY',
        integrationKind: 'copy',
        sourceDocumentId: source.id,
        sourceObjectId: 'table-forecast',
        targetDocumentId: target.id,
        sourceVersion: 3,
        targetVersion: 4,
      });
    }
  });

  it('`[\'COPY\', \'LIVE_REFERENCE\']` erreicht ebenfalls accept — der Drop wird dann aber zur benannten Wahl', () => {
    const registry = registryWithBoardEntry(['Table'], ['COPY', 'LIVE_REFERENCE']);
    const hoverState = hoverWhiteboardDropZone(closed(), contextWith(registry, twoIntentPayload)).state;
    expect(hoverState.target.verdict).toBe('accept');
    expect(hoverState.target.preview?.intent).toBe('COPY'); // die erste erlaubte — die Fläche wählt nichts
    // Ein Träger mit **einer** Absicht wird auch hier vollendet zugestellt …
    const oneDrop = dropWhiteboardDropZone(hoverState, contextWith(registry, oneIntentPayload));
    expect(oneDrop.state.decision.kind).toBe('delivered');
    // … ein Träger mit **zwei** Absichten dagegen **nicht**: benannte Wahl statt heimlicher Vorauswahl.
    const twoDrop = dropWhiteboardDropZone(hoverState, contextWith(registry, twoIntentPayload));
    expect(twoDrop.ok).toBe(false);
    expect(twoDrop.reason).toBe('drop_intent_choice_required');
    expect(whiteboardDropZoneView(twoDrop.state)).toBe('choice');
    // Genau **eine** Absicht genügt für den vollendeten Drop: `['COPY']` ist die kleinste ehrliche Form.
    expect(whiteboardDropZoneChoices(twoDrop.state).map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
  });

  it('`\'MOVE\'` darf NICHT hinein: die Route wäre da, der Resolver hält sie aber nicht', () => {
    const registry = registryWithBoardEntry(['Table'], ['MOVE']);
    // Die Route ist **eingetragen** — ein Verbraucher, der die Matrix direkt fragt, läse „erlaubt" …
    expect(registry.getAdapter('Whiteboard', 'Table', 'MOVE')).toBeDefined();
    expect(registry.getCompatibleIntents('Grid', 'Whiteboard', 'Table')).toEqual([]);
    // … die Fähigkeitsfrage antwortet trotzdem **nein**, weil sie den **Resolver** fragt (nicht die Route allein).
    const payload = intentOnlyPayload('MOVE');
    const question = whiteboardDropCapabilityQuestion(contextWith(registry, payload));
    expect(question?.('Whiteboard', 'Table', 'MOVE')).toBe(false);
    const state = hoverWhiteboardDropZone(closed(), contextWith(registry, payload)).state;
    expect(state.target.verdict).toBe('reject');
    // Und der Grund ist der des Resolvers, benannt — „Verschieben ist ohne Transaktion nicht verfügbar".
    expect(chooseWhiteboardDropIntent(state, 'MOVE', contextWith(registry, payload)).reason)
      .toBe('drop_move_transaction_unavailable');
  });

  it('`\'FROZEN_SNAPSHOT\'` ist nutzlos: die Quelle exportiert ihn nicht, also antwortet die Frage nein', () => {
    const registry = registryWithBoardEntry(['Table'], ['FROZEN_SNAPSHOT']);
    expect(registry.getAdapter('Whiteboard', 'Table', 'FROZEN_SNAPSHOT')).toBeDefined();
    expect(registry.getCompatibleIntents('Grid', 'Whiteboard', 'Table')).toEqual([]);
    const payload = intentOnlyPayload('FROZEN_SNAPSHOT');
    expect(whiteboardDropCapabilityQuestion(contextWith(registry, payload))?.('Whiteboard', 'Table', 'FROZEN_SNAPSHOT')).toBe(false);
    expect(hoverWhiteboardDropZone(closed(), contextWith(registry, payload)).state.target.verdict).toBe('reject');
    // **Gemessen** (und genauer als erwartet): hier ist die Menge der möglichen Absichten **leer**, weil die Quelle
    // den Import nicht exportiert — der Resolver nennt das `registry_adapter_route_missing`, nicht
    // `drop_intent_not_supported`. Letzteres entsteht erst, wenn es **andere** angebotene Absichten gibt.
    expect(chooseWhiteboardDropIntent(closed(), 'FROZEN_SNAPSHOT', contextWith(registry, payload)).reason)
      .toBe('registry_adapter_route_missing');
    const mixed = registryWithBoardEntry(['Table'], ['COPY', 'FROZEN_SNAPSHOT']);
    const mixedPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: source.id,
      objectId: 'table-forecast',
      objectKind: 'Table',
      sourceApp: 'Grid',
      supportedIntents: ['COPY', 'FROZEN_SNAPSHOT'],
    }));
    expect(chooseWhiteboardDropIntent(closed(), 'FROZEN_SNAPSHOT', contextWith(mixed, mixedPayload)).reason)
      .toBe('drop_intent_not_supported');
  });

  it('eine Objektart, die die Quelle nicht exportiert, bleibt wirkungslos — die Route ist eine Schnittmenge', () => {
    const registry = registryWithBoardEntry(['Chart'], ['COPY']);
    expect(registry.getAdapter('Whiteboard', 'Chart', 'COPY')).toBeDefined();
    expect(registry.getCompatibleIntents('Grid', 'Whiteboard', 'Chart')).toEqual([]);
    expect(whiteboardDropCapabilityQuestion(contextWith(registry, chartPayload))?.('Whiteboard', 'Chart', 'COPY')).toBe(false);
    expect(hoverWhiteboardDropZone(closed(), contextWith(registry, chartPayload)).state.target.verdict).toBe('reject');
  });

  it('Manifest und Adapter müssen dieselben Vokabeln tragen — sonst weist die Matrix den Eintrag ab', () => {
    const registry = new WorkspaceInteractionRegistry();
    registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY'] }], imports: [] });
    registry.registerAppManifest({ app: 'Whiteboard', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY'] }] });
    // Der Adapter nennt eine Absicht, die das Ziel-Manifest **nicht** importiert → benannte Ablehnung beim Bauen.
    expect(() => registry.registerAdapter({
      id: 'fabric-grid-table-to-whiteboard',
      targetApp: 'Whiteboard',
      objectKinds: ['Table'],
      intents: ['COPY', 'LIVE_REFERENCE'],
    })).toThrowError(WorkspaceInteractionError);
    // Und die versiegelte Matrix nimmt danach nichts mehr an.
    expect(() => registry.seal().registerAppManifest({ app: 'Present', exports: [], imports: [] })).toThrowError(WorkspaceInteractionError);
  });
});
