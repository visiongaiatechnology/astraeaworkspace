// STATUS: PLATIN — Integration & Release, **Paket 12**: die Vokabeln der Matrix, **gemessen** (Zwei-Welten-Messung)
//
// ## Wozu diese Datei
//
// Die Notes-Ablagezone ist fertig und geprüft ✓ — und die **versiegelte** Matrix der Shell
// (`shell/fabric/fabricGraphWorkspaceDrop.ts`) trägt die Notes-Route jetzt **selbst** ✓: Manifest + Adapter
// (`fabric-grid-table-to-notes`, Form A) wurden in **einem** Zug mit den drei Prüfstellen gesetzt, die den
// früheren Zustand festhielten. *Der Zustand **vor** dem Eintrag ist damit nicht mehr der Produktionszustand —
// die Zone liest weiterhin nur die Antwort der einen Autorität.*
//
// Diese Datei hält die Vokabeln **wörtlich** fest und misst sie auf der **echten** Klasse
// (`WorkspaceInteractionRegistry`) und dem **echten** Produktionspfad (`notesDropZone.ts`), mit denselben
// Trägern wie die Fabric-Oberfläche. **Sie schreibt nichts in die Shell-Datei**: sie liest sie und baut den Block
// auf einer eigenen Instanz nach — *und die Sonde zeigt, dass der eingetragene Zweig wirklich läuft.*
//
// ## Die zwei Welten
//
//   * **Welt A — der Produktionsstand:** die versiegelte Matrix der Shell **mit** dem Eintrag.
//     `getCompatibleIntents('Grid','Notes','Table') === ['COPY']`, das Urteil ist `accept` und die Ablage eine
//     **vollendete** Zustellung — *die Zone sagt die Wahrheit über die Matrix.*
//   * **Welt B — derselbe Eintrag auf einer eigenen Instanz:** dieselbe Klasse, derselbe Schnitt. Sie trägt die
//     Varianten (Form B, `MOVE`, `FROZEN_SNAPSHOT`), die **nicht** in die versiegelte Matrix gehören.
//
// **Die Sonde** ist der Adapter-Bezeichner: `'fabric-grid-table-to-notes'` kann **nur** aus dem Eintrag stammen.
// *Ein Zweig, der nur „grün" meldet, ohne dass man sieht, dass er lief, wäre eine Behauptung.*
//
// ## Warum **Form A** (`['COPY']`) und nicht Form B (`['COPY','LIVE_REFERENCE']`)
//
// Gemessen, nicht gemeint: der **vorhandene** Träger der Fabric-Oberfläche
// (`createFabricWorkspaceObjectDragPayload`) bietet für eine Grid-Tabelle **zwei** Absichten an — `COPY` **und**
// `LIVE_REFERENCE`. Die Matrix schneidet Quelle × Ziel × Adapter (`WorkspaceInteractionRegistry.getCompatibleIntents`),
// es zählt also der **Schnitt**:
//
//   * **Form A** → Schnitt `['COPY']` → **genau eine** Route → `accept` **und** eine **vollendete** Zustellung ✓.
//   * **Form B** → Schnitt `['COPY','LIVE_REFERENCE']` → **zwei** Routen → `accept`, aber Phase `choice` und ein
//     **benanntes** `drop_intent_choice_required`: *jede schlichte Ablage ist dann ein Fehlschlag* — das ist
//     **Paket 15**, nicht dieses ✓.
//
// Und `LIVE_REFERENCE` ist für Notes heute **nicht wahrheitsfähig**: `WorkspaceDropSelection` trägt **kein** `mode`,
// während Notes' eigener Verweis `NoteWorkspaceEmbedData.mode: 'Live' | 'Frozen'` kennt
// (`integrations/notesWorkspaceEmbed.ts`) — *eine Route, die den Modus nicht ausdrücken kann, würde eine Absicht
// versprechen, die die Zustellung nicht einlöst.* **Deshalb Form A.**
//
// ## Der Ausschluss-Test — und **welcher** der beiden Gründe für Notes gilt
//
// Der Whiteboard-Agent hat den geteilten Begründungsblock korrigiert: *„Gemeinsam ist der Test, nicht der Grund —
// Einträge dürfen keine Begründung erben, die nur für eine Fläche gemessen ist."* Für Notes gilt die **Whiteboard-**
// Form, und das ist hier gemessen:
//
//   * **`MOVE`** → die Fähigkeitsfrage der Zone fragt den **Resolver** (`evaluateWorkspaceDrop`). Der Resolver
//     lehnt `MOVE` **vor** jeder Routensuche ab (`workspaceInteractionResolver.ts`: `drop_move_transaction_unavailable`).
//     Gemessen: mit einer MOVE-fähigen Route erreicht `MOVE` **nicht einmal `accept`** (Urteil `reject` /
//     `route-not-capable`), und die **Zustellung** nennt `drop_move_transaction_unavailable`. *Ein MOVE-Eintrag
//     würde also etwas versprechen, das der Resolver nicht hält* — **nicht** die Present-Form (dort erreicht MOVE
//     `accept` und scheitert erst beim Ablegen), weil Notes' Zone den Resolver fragt.
//   * **`FROZEN_SNAPSHOT`** → die **Quelle** führt das Wort nicht: die Grid-Seite der versiegelten Matrix
//     exportiert `COPY` und `LIVE_REFERENCE`. Gemessen: selbst mit einem `FROZEN_SNAPSHOT`-fähigen Notes-Eintrag
//     enthält `getCompatibleIntents('Grid','Notes','Table')` es **nicht** — *ein Eintrag, der es nennte, wäre für
//     diese Quelle eine erfundene Vokabel.*
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  WorkspaceInteractionRegistry,
  createWorkspaceDragPayload,
  evaluateWorkspaceDrop,
  resolveWorkspaceDrop,
  serializeWorkspaceDragPayload,
} from '../../../../shared/workspace-interaction';
import type { WorkspaceDropIntent, WorkspaceObjectKind } from '../../../../shared/workspace-interaction';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  createFabricWorkspaceObjectDragPayload,
} from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  chooseNotesDropIntent,
  confirmNotesDropZone,
  createNotesDropZone,
  dropNotesDropZone,
  hoverNotesDropZone,
  notesDropZoneCanConfirm,
  notesDropZoneChoices,
  notesDropZonePreview,
  notesDropZoneRefusalCode,
  notesDropZoneView,
} from '../../drop-zone/notesDropZone';
import type { NotesDropZoneContext } from '../../drop-zone/notesDropZone';

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

/** Das Ziel **ist** die Notes-Fläche — `kind: 'Notes'`, wie die Shell sie der Ansicht reicht. */
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

const documents: Readonly<Record<string, WorkspaceDocument>> = { [source.id]: source, [target.id]: target };

const table = source.objects['table-forecast'];
if (!table) throw new Error('Fixture-Tabelle fehlt');

/** **Der vorhandene** Träger der Fabric-Oberfläche — er bietet `COPY` **und** `LIVE_REFERENCE` an. */
const fabricPayload = createFabricWorkspaceObjectDragPayload(source, table) ?? '';
/** Ein Träger mit **genau einer** angebotenen Absicht — für die eindeutige Gegenprobe. */
const copyOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));
/** Ein Träger, der **nur** `MOVE` anbietet — die Absicht, die der Resolver nicht ausführt. */
const moveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: source.id,
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['MOVE'],
}));

/**
 * **Welt B** — derselbe Eintrag, wörtlich, auf der **echten** Klasse.
 *
 * Die Grid-Seite wird **aus der versiegelten Matrix übernommen** (sie ist nicht Gegenstand dieses Pakets); der
 * Notes-Block ist **wörtlich** der Block, der dort jetzt steht. `objectKinds` und `intents` sind der Schnitt, den
 * `getCompatibleIntents` bildet.
 */
function worldWithNotes(notesIntents: readonly WorkspaceDropIntent[], notesKinds: readonly WorkspaceObjectKind[] = ['Table']): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  // Die **vorhandene** Quelle — wörtlich der Block der versiegelten Matrix.
  registry.registerAppManifest({
    app: 'Grid',
    exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
    imports: [],
  });
  // **DER EINGETRAGENE BLOCK — Manifest …**
  registry.registerAppManifest({
    app: 'Notes',
    exports: [],
    imports: notesKinds.map((objectKind) => ({ objectKind, intents: [...notesIntents] })),
  });
  // **… und Adapter.**
  registry.registerAdapter({
    id: 'fabric-grid-table-to-notes',
    targetApp: 'Notes',
    objectKinds: [...notesKinds],
    intents: [...notesIntents],
  });
  return registry.seal();
}

const contextWith = (
  registry: WorkspaceInteractionRegistry,
  payload?: unknown,
  surface: unknown = 'canvas',
): NotesDropZoneContext => ({
  registry,
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents,
  surface,
  payload,
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Route**, nicht die Richtlinie ✓
  // — *die Zone liest die Entscheidung der Administratorrichtlinie aus ihrem Kontext* ✓✓. *In der Produktion holt
  // die Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge ist ein eigener
  // Vertrag** ✓✓: `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
  requestedPolicyDecision: { effect: 'Allow' },
});

describe('Paket 12 — Welt A: die versiegelte Matrix der Shell, **mit** eingetragenem Eintrag', () => {
  it('die versiegelte Matrix bietet für Grid → Notes genau **eine** kompatible Absicht', () => {
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Notes')).not.toBeUndefined();
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Notes', 'Table')).toEqual(['COPY']);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Notes', 'Table', 'COPY')?.id).toBe('fabric-grid-table-to-notes');
  });

  it('deshalb ist die Ablage über die **Produktions**matrix eine vollendete Zustellung', () => {
    const worldA = contextWith(FABRIC_WORKSPACE_DROP_REGISTRY, fabricPayload);
    const hovered = hoverNotesDropZone(createNotesDropZone(), worldA).state;
    expect(hovered.target.verdict).toBe('accept');
    expect(hovered.target.reason).toBeNull();
    expect(notesDropZoneView(hovered)).toBe('ready');
    expect(notesDropZoneCanConfirm(hovered)).toBe(true);
    expect(notesDropZoneRefusalCode(hovered)).toBeNull();
    const dropped = dropNotesDropZone(hovered, worldA);
    expect(dropped.ok).toBe(true);
    expect(dropped.reason).toBeUndefined();
    expect(dropped.state.decision.kind).toBe('delivered');
    if (dropped.state.decision.kind === 'delivered') {
      // **Sonde 3:** der Adapter der **Produktions**matrix — kein Prüfling, die versiegelte eine Autorität.
      expect(dropped.state.decision.resolution.adapterId).toBe('fabric-grid-table-to-notes');
      expect(dropped.state.decision.resolution.sourceVersion).toBe(3);
      expect(dropped.state.decision.resolution.targetVersion).toBe(4);
    }
  });
});

describe('Paket 12 — Welt B: derselbe Eintrag auf eigener Instanz, mit Sonde', () => {
  it('Form A (`[\'COPY\']`): Schnitt, Urteil und **vollendete** Zustellung', () => {
    const registry = worldWithNotes(['COPY']);
    // **Sonde 1:** der Schnitt ist nicht leer — das kann nur der neue Eintrag bewirken.
    expect(registry.getCompatibleIntents('Grid', 'Notes', 'Table')).toEqual(['COPY']);
    const world = contextWith(registry, fabricPayload);
    const hovered = hoverNotesDropZone(createNotesDropZone(), world).state;
    expect(hovered.target.verdict).toBe('accept');
    expect(notesDropZoneView(hovered)).toBe('ready');
    expect(notesDropZonePreview(hovered)).toEqual({ objectKind: 'Table', intent: 'COPY', label: 'Table · COPY' });
    expect(notesDropZoneCanConfirm(hovered)).toBe(true);

    const dropped = dropNotesDropZone(hovered, world);
    expect(dropped.ok).toBe(true);
    expect(notesDropZoneView(dropped.state)).toBe('resolved');
    expect(dropped.state.decision.kind).toBe('delivered');
    if (dropped.state.decision.kind === 'delivered') {
      // **Sonde 2:** dieser Bezeichner stammt **nur** aus dem neuen Eintrag.
      expect(dropped.state.decision.resolution.adapterId).toBe('fabric-grid-table-to-notes');
      expect(dropped.state.decision.resolution.intent).toBe('COPY');
      expect(dropped.state.decision.resolution.sourceDocumentId).toBe(source.id);
      expect(dropped.state.decision.resolution.targetDocumentId).toBe(target.id);
      expect(dropped.state.decision.resolution.sourceVersion).toBe(3);
      expect(dropped.state.decision.resolution.targetVersion).toBe(4);
    }
    // Der vorhandene Träger bietet **zwei** Absichten an — Form A faltet sie auf **eine** Route zusammen.
    expect(registry.getCompatibleIntents('Grid', 'Notes', 'Table')).toHaveLength(1);
  });

  it('die **Tastatur** liefert mit dem Eintrag ebenfalls vollständig zu — ohne Überfahren', () => {
    const registry = worldWithNotes(['COPY']);
    const world = contextWith(registry, copyOnlyPayload);
    const fresh = createNotesDropZone();
    expect(fresh.target.overTarget).toBe(false);
    const step = confirmNotesDropZone(fresh, world);
    expect(step.ok).toBe(true);
    expect(step.state.decision.kind).toBe('delivered');
    if (step.state.decision.kind === 'delivered') {
      expect(step.state.decision.resolution.adapterId).toBe('fabric-grid-table-to-notes');
    }
  });

  it('Form B (`[\'COPY\',\'LIVE_REFERENCE\']`): `accept`, aber **jede** Ablage braucht eine Wahl', () => {
    const registry = worldWithNotes(['COPY', 'LIVE_REFERENCE']);
    expect(registry.getCompatibleIntents('Grid', 'Notes', 'Table')).toEqual(['COPY', 'LIVE_REFERENCE']);
    const world = contextWith(registry, fabricPayload);
    const hovered = hoverNotesDropZone(createNotesDropZone(), world).state;
    expect(hovered.target.verdict).toBe('accept');
    const dropped = dropNotesDropZone(hovered, world);
    expect(dropped.ok).toBe(false);
    expect(dropped.reason).toBe('drop_intent_choice_required');
    expect(dropped.state.decision.kind).toBe('choice');
    expect(notesDropZoneChoices(dropped.state).map((choice) => choice.intent)).toEqual(['COPY', 'LIVE_REFERENCE']);
    // **Das ist der gemessene Grund für Form A:** mit Form B ist die schlichte Ablage ein Fehlschlag (Paket 15).
  });
});

describe('Paket 12 — der Ausschluss-Test: MOVE und FROZEN_SNAPSHOT, je mit **eigenem** Grund', () => {
  it('MOVE erreicht **nicht einmal `accept`** — die Notes-Form des Grundes, weil die Zone den Resolver fragt', () => {
    // Eine MOVE-fähige Route: das ist genau der Eintrag, der hier **nicht** gesetzt werden darf.
    const registry = worldWithNotes(['COPY', 'MOVE']);
    const world = contextWith(registry, moveOnlyPayload);
    // Die Quelle exportiert MOVE ohnehin nicht — der Schnitt bleibt bei COPY.
    expect(registry.getCompatibleIntents('Grid', 'Notes', 'Table')).toEqual(['COPY']);
    // Und die Fähigkeitsfrage der Zone fragt den **Resolver**, nicht die Matrix:
    const hovered = hoverNotesDropZone(createNotesDropZone(), world).state;
    expect(hovered.target.verdict).toBe('reject');
    expect(hovered.target.reason).toBe('route-not-capable');
    expect(notesDropZoneCanConfirm(hovered)).toBe(false);
    // Der Resolver lehnt MOVE **vor** jeder Routensuche ab — der benannte Grund:
    expect(evaluateWorkspaceDrop({ payload: moveOnlyPayload, targetDocumentId: target.id, requestedIntent: 'MOVE', documents, requestedPolicyDecision: { effect: 'Allow' } }, registry))
      .toEqual({ status: 'rejected', code: 'drop_move_transaction_unavailable' });
    expect(resolveWorkspaceDrop({ payload: moveOnlyPayload, targetDocumentId: target.id, requestedIntent: 'MOVE', documents, requestedPolicyDecision: { effect: 'Allow' } }, registry))
      .toEqual({ status: 'rejected', code: 'drop_move_transaction_unavailable' });
    // Und die **Zustellung** durch die Zone nennt denselben Namen — nicht „keine Route".
    expect(chooseNotesDropIntent(createNotesDropZone(), 'MOVE', world).reason).toBe('drop_move_transaction_unavailable');
  });

  it('FROZEN_SNAPSHOT wäre für diese Quelle ein **erfundenes** Wort', () => {
    // Ein Eintrag, der es nennte: die Quellenseite führt es nicht, also entsteht keine Route.
    const registry = worldWithNotes(['COPY', 'FROZEN_SNAPSHOT']);
    expect(registry.getCompatibleIntents('Grid', 'Notes', 'Table')).toEqual(['COPY']);
    expect(registry.getAdapter('Notes', 'Table', 'FROZEN_SNAPSHOT')).toBeDefined();
    const world = contextWith(registry, copyOnlyPayload);
    // Angeboten wird es von der Quelle nicht; eine **erzwungene** Absicht nennt der Resolver benannt:
    expect(chooseNotesDropIntent(createNotesDropZone(), 'FROZEN_SNAPSHOT', world).reason).toBe('drop_intent_not_supported');
    expect(evaluateWorkspaceDrop({ payload: copyOnlyPayload, targetDocumentId: target.id, requestedIntent: 'FROZEN_SNAPSHOT', documents, requestedPolicyDecision: { effect: 'Allow' } }, registry))
      .toEqual({ status: 'rejected', code: 'drop_intent_not_supported' });
  });
});
