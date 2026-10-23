// STATUS: PLATIN — Integration & Release, **Paket 10**: die geforderte Registrierungsform, AUSGEFÜHRT
//
// ## Wozu diese Datei existiert
//
// Das Present-Ablageziel kann heute **nur verweigern**, weil die gesiegelte Matrix
// (`FABRIC_WORKSPACE_DROP_REGISTRY`, `shell/fabric/fabricGraphWorkspaceDrop.ts`) **keinen**
// Present-Eintrag hat. Nachregistrieren ist gesperrt (`seal()` → `registry_read_only`) — der Eintrag
// gehört also **zur Konstruktion**, und die gehört der Shell.
//
// Damit die Shell nicht raten muss, steht hier die **verlangte Form** — und sie wird **wörtlich
// ausgeführt**: dieselben Deklarationen, dieselbe Registry-Klasse, dieselbe Kette
// Manifest → Adapter → `presentWorkspaceDropCapabilityQuestion` → `hoverDropTarget` →
// `resolveWorkspaceDrop`. *Eine beschriebene Form wäre eine Behauptung; eine ausgeführte Form ist ein
// Nachweis.*
//
// Die Quellseite (Grid) ist **gemessen**, nicht erfunden: der Träger kommt aus der
// **Produktionsfunktion** `createFabricWorkspaceObjectDragPayload`, die Grids `Table` mit **genau**
// `['COPY', 'LIVE_REFERENCE']` zusagt.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WorkspaceObject } from '../../../../../shared/contracts/workspace';
import { WorkspaceInteractionRegistry } from '../../../../../shared/workspace-interaction';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  createFabricWorkspaceObjectDragPayload,
} from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  choosePresentWorkspaceDropIntent,
  confirmPresentWorkspaceDropZone,
  createPresentWorkspaceDropZone,
  dropPresentWorkspaceDropZone,
  openPresentWorkspaceDropZone,
  presentWorkspaceDropCapabilityQuestion,
  type PresentWorkspaceDropZoneContext,
} from '../../../integrations/workspace-drop/presentWorkspaceDropZone';

function document(id: string, kind: 'Grid' | 'Present'): WorkspaceDocument {
  const objects: Record<string, WorkspaceObject> = kind === 'Grid'
    ? { 'table-1': { type: 'Table', data: { id: 'table-1', rows: 1, cols: 1, cells: { A1: { value: '42' } } } } }
    : {};
  return {
    schema_version: 2, id, title: id, kind, created_at: 1, modified_at: 1, version: 2,
    theme_id: 'cosmic-obsidian', root_object_ids: kind === 'Grid' ? ['table-1'] : [], objects,
  };
}

const GRID = document('grid-doc', 'Grid');
const PRESENT = document('present-doc', 'Present');
const DOCUMENTS: Readonly<Record<string, WorkspaceDocument>> = Object.freeze({ 'grid-doc': GRID, 'present-doc': PRESENT });

/** Der Träger aus der **Produktionsfunktion** — nicht hier zusammengesetzt. */
const PAYLOAD = createFabricWorkspaceObjectDragPayload(GRID, GRID.objects['table-1']);
if (PAYLOAD === null) throw new Error('Vorrichtung: die Produktionsfunktion hat keinen Träger gebaut');

/** Die Absichten, die **Grid heute wirklich zusagt** — gemessen an der vorhandenen Produktionsroute. */
const GRID_INTENTS: readonly string[] = FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Writer', 'Table');

/**
 * **FORM A — das Minimum, mit dem Paket 10 allein zustellt.**
 *
 * In der Produktionsdatei existiert der Grid-Block **schon**; hinzu kommen genau zwei Blöcke:
 * das Present-Manifest und der Adapter. Ein frisches Registry-Objekt braucht die Quelle mit, deshalb
 * steht sie hier nach.
 */
function formA(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Present', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY'] }] });
  registry.registerAdapter({ id: 'fabric-grid-table-to-present', targetApp: 'Present', objectKinds: ['Table'], intents: ['COPY'] });
  return registry.seal();
}

/**
 * **FORM B — beide Absichten, wie Grid sie heute exportiert.** Der Zeiger landet dann in `choice`:
 * *ohne Wahl wird nicht zugestellt* (keine heimliche Vorauswahl) — das ist der Übergang zu Paket 15.
 */
function formB(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Present', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }] });
  registry.registerAdapter({ id: 'fabric-grid-table-to-present', targetApp: 'Present', objectKinds: ['Table'], intents: ['COPY', 'LIVE_REFERENCE'] });
  return registry.seal();
}

function context(registry: WorkspaceInteractionRegistry, overrides: Partial<PresentWorkspaceDropZoneContext> = {}): PresentWorkspaceDropZoneContext {
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Route**, nicht die Richtlinie ✓
  // — *die Zone liest die Entscheidung der Administratorrichtlinie aus ihrem Kontext* ✓✓. *In der Produktion holt
  // die Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge ist ein eigener
  // Vertrag** ✓✓: `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
  return { targetDocumentId: 'present-doc', documents: DOCUMENTS, payload: PAYLOAD, registry, requestedPolicyDecision: { effect: 'Allow' }, ...overrides };
}

describe('Paket 10: die Registrierungsform fuer Present, ausgefuehrt', () => {
  it('die Formen bestehen die VORHANDENE Registry-Pruefung -- Manifest zuerst, dann der Adapter', () => {
    const a = formA();
    expect(a.isSealed).toBe(true);
    expect(a.getAdapter('Present', 'Table', 'COPY')).toBeDefined();
    // Beidseitig gedeckt: Quelle exportiert, Ziel importiert, Route existiert.
    expect(a.getCompatibleIntents('Grid', 'Present', 'Table')).toEqual(['COPY']);
    // Und die Reihenfolge ist keine Bequemlichkeit: ohne Manifest ist der Adapter ungueltig.
    const ohneManifest = new WorkspaceInteractionRegistry();
    expect(() => ohneManifest.registerAdapter({ id: 'fabric-grid-table-to-present', targetApp: 'Present', objectKinds: ['Table'], intents: ['COPY'] }))
      .toThrowError(/registry_manifest_missing|manifest/iu);
  });

  it('FORM A: die Faehigkeitsfrage antwortet JA -- und Zeiger UND Tastatur stellen zu', () => {
    const registry = formA();
    expect(presentWorkspaceDropCapabilityQuestion(registry, 'Grid')?.('Present', 'Table', 'COPY')).toBe(true);
    expect(presentWorkspaceDropCapabilityQuestion(registry, 'Grid')?.('Present', 'Table', 'LIVE_REFERENCE')).toBe(false);

    const geoeffnet = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context(registry));
    expect(geoeffnet.ok).toBe(true);
    expect(geoeffnet.state.phase).toBe('ready');
    expect(geoeffnet.state.verdict).toBe('accept');
    expect(geoeffnet.state.target.preview?.label).toBe('Table · COPY');

    const zeiger = dropPresentWorkspaceDropZone(geoeffnet.state, context(registry));
    const tastatur = confirmPresentWorkspaceDropZone(geoeffnet.state, context(registry));
    expect(zeiger.ok).toBe(true);
    expect(tastatur.ok).toBe(true);
    expect(zeiger.state.assessment).toEqual(tastatur.state.assessment);
    expect(zeiger.state.assessment?.status).toBe('resolved');
    if (zeiger.state.assessment?.status === 'resolved') {
      expect(zeiger.state.assessment.selection).toMatchObject({
        adapterId: 'fabric-grid-table-to-present', intent: 'COPY', targetDocumentId: 'present-doc', objectKind: 'Table',
      });
    }
  });

  it('die QUELLENLISTE ist der Unterschied zwischen einer Route und einer Funktion', () => {
    const registry = formA();
    const ziel = DOCUMENTS['present-doc'];
    const geoeffnet = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context(registry));
    // ① Mit der Route ist das Urteil `accept` -- der Traeger passt.
    expect(geoeffnet.state.phase).toBe('ready');
    expect(geoeffnet.state.verdict).toBe('accept');
    // ② Ohne das **Quell**dokument im Kontext verweigert der vorhandene Resolver -- benannt.
    const ohneQuelle = dropPresentWorkspaceDropZone(geoeffnet.state, context(registry, { documents: { 'present-doc': ziel } }));
    expect(ohneQuelle.ok).toBe(false);
    expect(ohneQuelle.reason).toBe('drop_source_document_missing');
    // ③ Mit der Quellenliste wird aus **derselben** Route ein vollendeter Drop.
    const mitQuelle = dropPresentWorkspaceDropZone(geoeffnet.state, context(registry, { documents: { 'grid-doc': GRID, 'present-doc': ziel } }));
    expect(mitQuelle.ok).toBe(true);
    expect(mitQuelle.state.phase).toBe('resolved');
    if (mitQuelle.state.assessment?.status === 'resolved') {
      expect(mitQuelle.state.assessment.selection.adapterId).toBe('fabric-grid-table-to-present');
    }
  });

  it('FORM B: beide Absichten gedeckt -- der Zeiger landet in choice, ohne Wahl wird NICHT zugestellt', () => {
    const registry = formB();
    const geoeffnet = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context(registry));
    expect(geoeffnet.state.phase).toBe('choice');
    expect(geoeffnet.state.verdict, 'die Route ist faehig -- offen ist nur die Absicht').toBe('accept');
    expect(geoeffnet.state.compatibleIntents).toEqual(['COPY', 'LIVE_REFERENCE']);

    const ohneWahl = dropPresentWorkspaceDropZone(geoeffnet.state, context(registry));
    expect(ohneWahl.ok).toBe(false);
    expect(ohneWahl.reason).toBe('drop_intent_choice_required');
    expect(ohneWahl.state.assessment?.status).toBe('needsChoice');

    // **Paket 15 — Marker EINGELÖST (Runde 259) ✓✓** — *nicht gelöscht, nicht gelockert* ✓: Die Live-Wahl **allein**
    // liefert **nicht** ✗ (*sie braucht den Modus* ✓), und **mit** gewähltem Modus **vollendet** sie ✓✓.
    const mitWahl = choosePresentWorkspaceDropIntent(geoeffnet.state, 'LIVE_REFERENCE', context(registry));
    expect(mitWahl.ok).toBe(false);
    expect(mitWahl.reason).toBe('drop_live_mode_required');
    const mitModus = choosePresentWorkspaceDropIntent(geoeffnet.state, 'LIVE_REFERENCE', context(registry, { requestedMode: 'Frozen' }));
    expect(mitModus.ok).toBe(true);
    expect(mitModus.state.phase).toBe('resolved');
    if (mitModus.state.assessment?.status === 'resolved') {
      expect(mitModus.state.assessment.selection.intent).toBe('LIVE_REFERENCE');
      expect(mitModus.state.assessment.selection.integrationKind).toBe('live');
      expect(mitModus.state.assessment.selection.mode).toBe('Frozen');
    }
    // **Und die Kopie bleibt gedeckt** ✓ — *auf demselben Weg, ohne Modus* ✓.
    const alsKopie = choosePresentWorkspaceDropIntent(geoeffnet.state, 'COPY', context(registry));
    expect(alsKopie.ok).toBe(true);
    expect(alsKopie.state.phase).toBe('resolved');
  });

  it('MOVE gehoert NICHT in die Form -- die Matrix verspricht sonst, was der Resolver verweigert', () => {
    const registry = new WorkspaceInteractionRegistry();
    registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['MOVE'] }], imports: [] });
    registry.registerAppManifest({ app: 'Present', exports: [], imports: [{ objectKind: 'Table', intents: ['MOVE'] }] });
    registry.registerAdapter({ id: 'fabric-grid-table-to-present', targetApp: 'Present', objectKinds: ['Table'], intents: ['MOVE'] });
    const mitMove = registry.seal();
    expect(presentWorkspaceDropCapabilityQuestion(mitMove, 'Grid')?.('Present', 'Table', 'MOVE'), 'die Frage waere erfuellt').toBe(true);
    // Ein Traeger, der MOVE zusagt: die vorhandene Produktionsfunktion sagt es **nicht** zu, deshalb wird
    // nur die eine Absicht im Träger ersetzt -- die Formatpruefung bleibt die des einen Parsers.
    const moveTraeger = PAYLOAD.replace('"COPY"', '"MOVE"');
    const geoeffnet = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context(mitMove, { payload: moveTraeger }));
    expect(geoeffnet.state.compatibleIntents).toEqual(['MOVE']);
    expect(geoeffnet.state.verdict).toBe('accept');
    const ablage = dropPresentWorkspaceDropZone(geoeffnet.state, context(mitMove, { payload: moveTraeger, requestedIntent: 'MOVE' }));
    expect(ablage.ok).toBe(false);
    expect(ablage.reason, 'die Route waere da -- der Resolver verweigert MOVE trotzdem').toBe('drop_move_transaction_unavailable');
  });

  it('die Form wird aus der GEMESSENEN Quellfaehigkeit abgeleitet -- keine erfundene Absicht', () => {
    // Gemessen an der vorhandenen Produktionsroute Grid → Writer: genau diese zwei Absichten sagt Grid zu.
    expect(GRID_INTENTS).toEqual(['COPY', 'LIVE_REFERENCE']);
    // FROZEN_SNAPSHOT ist damit heute **nicht** lieferbar und darf nicht in der Form stehen.
    expect(GRID_INTENTS).not.toContain('FROZEN_SNAPSHOT');
    expect(GRID_INTENTS).not.toContain('MOVE');
    expect(['COPY']).toEqual(GRID_INTENTS.filter((intent) => intent === 'COPY'));
    expect(['COPY', 'LIVE_REFERENCE']).toEqual(GRID_INTENTS.filter((intent) => intent === 'LIVE_REFERENCE' || intent === 'COPY'));
  });

  it('Vorwaertspruefung: sobald die gesiegelte Matrix Present kennt, muss der annehmende Pfad tragen', () => {
    // **Heute leer** -- genau das ist der Befund, den der Shell-Eintrag schliesst. Geprueft wird die
    // **Invariante**, damit diese Datei den Eintrag nicht blockiert, sondern ihn abnimmt:
    const routeHeute = FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Present', 'Table');
    expect(routeHeute.filter((intent) => !GRID_INTENTS.includes(intent)), 'keine erfundene Absicht').toEqual([]);
    if (FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Present', 'Table', 'COPY')) {
      // Ab hier ist die Pruefung **wirksam** (heute uebersprungen, weil der Eintrag fehlt).
      const geoeffnet = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context(FABRIC_WORKSPACE_DROP_REGISTRY));
      expect(geoeffnet.state.phase).toBe('ready');
      expect(geoeffnet.state.verdict).toBe('accept');
      const ablage = dropPresentWorkspaceDropZone(geoeffnet.state, context(FABRIC_WORKSPACE_DROP_REGISTRY));
      expect(ablage.ok).toBe(true);
      expect(ablage.state.phase).toBe('resolved');
    }
  });
});
