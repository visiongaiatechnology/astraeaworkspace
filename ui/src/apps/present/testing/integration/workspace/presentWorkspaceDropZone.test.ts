// STATUS: PLATIN — Integration & Release, **Paket 10**: das Present-Ablageziel, kopflos geprueft
//
// Die Faelle folgen den fuenf Punkten des Standards (§12.3) und der fail-closed-Forderung:
// erkennbare Zone, Vorschau, erlaubt/unerlaubt, Tastatur, Touch — plus: **kein stiller Erfolg**.
//
// **Geprueft wird gegen die vorhandenen Objekte**, nicht gegen Nachbauten: die Zieh-Session aus Paket 5,
// das Urteil aus Paket 6, der Träger aus Paket 7, die Matrix aus Paket 4 und der Resolver.
import { describe, expect, it } from 'vitest';
import type { DocumentKind, PresentObjectGeometry, WorkspaceDocument, WorkspaceObject } from '../../../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
  WorkspaceInteractionRegistry,
  type WorkspaceDropIntent,
} from '../../../../../shared/workspace-interaction';
import { FABRIC_WORKSPACE_DROP_REGISTRY, FABRIC_WORKSPACE_OBJECT_DRAG_MIME } from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { DRAG_TOUCH_LONGPRESS_MS, type DragInputKind } from '../../../../../shell/workspace/drag/dragDropVerdict';
import { DRAG_THRESHOLD_PX, beginDrag, createDragSession, moveDrag } from '../../../../../shell/workspace/drag/dragSession';
import {
  applyPresentWorkspaceDropCommand,
  choosePresentWorkspaceDropIntent,
  confirmPresentWorkspaceDropZone,
  createPresentWorkspaceDropZone,
  dropPresentWorkspaceDropZone,
  enterPresentWorkspaceDropZone,
  hasPresentWorkspaceDropTransfer,
  isPresentWorkspaceDropZoneSettled,
  leavePresentWorkspaceDropZone,
  openPresentWorkspaceDropZone,
  openPresentWorkspaceDropZoneFromDragSession,
  presentWorkspaceDropCompatibleIntents,
  presentWorkspaceDropPlacement,
  presentWorkspaceDropPointerPercent,
  readPresentWorkspaceTransfer,
  resolvePresentWorkspaceDropCommand,
  type PresentWorkspaceDropZoneContext,
  type PresentWorkspaceDropZoneState,
} from '../../../integrations/workspace-drop/presentWorkspaceDropZone';
import {
  PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION,
  isPresentWorkspaceDropRefusal,
  presentWorkspaceDropRefusalText,
} from '../../../integrations/workspace-drop/presentWorkspaceDropZoneContract';
import {
  PRESENT_WORKSPACE_DROP_ZONE_TOUCH_ACTION,
  presentWorkspaceDropGestureBegins,
  presentWorkspaceDropTouchStrategy,
} from '../../../integrations/workspace-drop/presentWorkspaceDropZoneTouch';

// ---------------------------------------------------------------------------------------------
// Vorrichtungen — dieselbe Form, die die vorhandenen Vertraege benutzen.
// ---------------------------------------------------------------------------------------------

function document(id: string, kind: DocumentKind, objectId?: string): WorkspaceDocument {
  const objects: Record<string, WorkspaceObject> = {};
  if (objectId) objects[objectId] = { type: 'Table', data: { id: objectId, rows: 1, cols: 1, cells: { A1: { value: '42' } } } };
  return {
    schema_version: 2, id, title: id, kind, created_at: 1, modified_at: 1, version: 2,
    theme_id: 'cosmic-obsidian', root_object_ids: objectId ? [objectId] : [], objects,
  };
}

const DOCUMENTS: Readonly<Record<string, WorkspaceDocument>> = Object.freeze({
  'grid-doc': document('grid-doc', 'Grid', 'table-1'),
  'present-doc': document('present-doc', 'Present'),
});

/**
 * Eine Matrix **fuer die Pruefung**, gebaut mit dem **vorhandenen** Registry-Typ.
 *
 * **Warum das kein zweiter Mechanismus ist:** die gesiegelte Produktionsmatrix
 * (`FABRIC_WORKSPACE_DROP_REGISTRY`) traegt die Routen. Ihre **Form fuer Present** steht **ausgefuehrt** in
 * `presentWorkspaceDropZoneRegistryForm.contract.test.ts` (Manifest + Adapter, Form A). Hier wird
 * dieselbe Registry-Klasse mit **derselben Form** benutzt — nur mit einer **lokalen** Adapterkennung
 * (`present-table-target` statt `fabric-grid-table-to-present`), damit die Zusicherungen dieser Datei
 * **nicht davon abhaengen**, ob der Shell-Eintrag schon gesetzt ist: *ein Test, der einen Uebergang
 * festhaelt, darf nicht mit dem Uebergang rot werden.*
 */
function presentRegistry(intents: readonly WorkspaceDropIntent[] = ['COPY']): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Present', exports: [], imports: [{ objectKind: 'Table', intents }] });
  registry.registerAdapter({ id: 'present-table-target', targetApp: 'Present', objectKinds: ['Table'], intents });
  return registry.seal();
}

function payload(overrides: Record<string, unknown> = {}): string {
  return serializeWorkspaceDragPayload(createWorkspaceDragPayload({
    documentId: 'grid-doc',
    objectId: 'table-1',
    objectKind: 'Table',
    sourceApp: 'Grid',
    supportedIntents: ['COPY', 'LIVE_REFERENCE'],
    ...overrides,
  }));
}

function context(overrides: Partial<PresentWorkspaceDropZoneContext> = {}): PresentWorkspaceDropZoneContext {
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: diese Vertraege bezeugen die **Route**, nicht die
  // Richtlinie ✓ — *die Zone liest die Entscheidung der Administratorrichtlinie aus ihrem Kontext*
  // (`presentWorkspaceDropZone.ts`, die Zustellung) ✓✓. *In der Produktion holt die Shell sie asynchron*
  // (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge ist ein eigener Vertrag** ✓✓:
  // `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
  return { targetDocumentId: 'present-doc', documents: DOCUMENTS, registry: presentRegistry(), requestedPolicyDecision: { effect: 'Allow' }, ...overrides };
}

const KEINE_FLaeCHE: readonly PresentObjectGeometry[] = Object.freeze([]);

/** Belegt **alle** drei Platze, die `presentReferencePlacementRect` kennt — dieselbe Geometrie. */
const FOLIE_VOLL: readonly PresentObjectGeometry[] = Object.freeze([
  { xPercent: 71, yPercent: 28, widthPercent: 27, heightPercent: 18 },
  { xPercent: 71, yPercent: 49, widthPercent: 27, heightPercent: 18 },
  { xPercent: 71, yPercent: 70, widthPercent: 27, heightPercent: 18 },
]);

/** Ein offenes, beurteiltes Ziel — der Ausgangspunkt der meisten Faelle. */
function offen(overrides: Partial<PresentWorkspaceDropZoneContext> = {}): PresentWorkspaceDropZoneState {
  const step = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context(overrides));
  if (!step.ok && step.state.phase !== 'refused' && step.state.phase !== 'choice') {
    throw new Error(`Vorrichtung konnte das Ziel nicht oeffnen: ${step.reason}`);
  }
  return step.state;
}

describe('Paket 10: das Present-Ablageziel', () => {
  it('Nicht-Leerheit: alle fuenf sichtbaren Zustaende, alle drei Urteile und benannte Gruende sind erreichbar', () => {
    const phasen = new Set<string>();
    const urteile = new Set<string>();
    const gruende = new Set<string>();
    const faelle = [
      // `closed` -- und zugleich der benannte No-op des Schliessens.
      leavePresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc')),
      // `open` -- ein Zug ohne Traeger (der leere Zustand).
      openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: null })),
      // `ready` -- der Traeger passt, eine Absicht.
      openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload() })),
      // `choice` -- der Traeger passt, zwei Absichten.
      openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) })),
      // `refused` -- die **Present-Route ist da** (Form A: genau die Form der Shell), aber dieser Traeger
      // ist **kein** Table. Das Ziel nimmt ihn nicht an und **sagt warum** -- der Grund kommt aus Paket 6.
      openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload({ objectKind: 'Chart' }), registry: presentRegistry(['COPY']) })),
      // `ready` -- **der neue gemessene Produktionszustand**: die gesiegelte Matrix traegt die
      // Present-Route (Form A). *Vor* dem Shell-Eintrag liefert derselbe Fall `refused`; die Zusicherungen
      // unten (Mengen) haengen deshalb nicht an diesem einen Zustand -- gegengeprueft in beiden Welten.
      openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload(), registry: FABRIC_WORKSPACE_DROP_REGISTRY })),
      // `refused` -- ein unlesbarer Traeger.
      openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: 'kein JSON' })),
      // `refused` -- diese Flaeche kennt ihr eigenes Zieldokument nicht.
      openPresentWorkspaceDropZone(createPresentWorkspaceDropZone(), context({ targetDocumentId: '  ', payload: payload() })),
      // `resolved` -- die Zustellung durch den vorhandenen Resolver.
      (() => {
        const s = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload() })).state;
        return dropPresentWorkspaceDropZone(s, context({ payload: payload() }));
      })(),
    ];
    for (const fall of faelle) {
      phasen.add(fall.state.phase);
      urteile.add(fall.state.verdict);
      if (fall.state.reason) gruende.add(fall.state.reason);
    }
    expect([...phasen].sort()).toEqual(['choice', 'closed', 'open', 'ready', 'refused', 'resolved']);
    expect([...urteile].sort()).toEqual(['accept', 'none', 'reject']);
    expect(gruende.size).toBeGreaterThanOrEqual(3);
    // Jeder Zustand hat Zeichen, Form und Worte — **keine** dieser drei Achsen ist eine Farbe.
    for (const phase of ['open', 'ready', 'choice', 'refused', 'resolved'] as const) {
      const presentation = PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION[phase];
      expect(presentation.glyph.length, phase).toBeGreaterThan(0);
      expect(presentation.headline.length, phase).toBeGreaterThan(0);
      expect(['dashed', 'solid', 'double'], phase).toContain(presentation.pattern);
    }
    const glyphen = new Set(Object.values(PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION).map((p) => p.glyph));
    expect(glyphen.size, 'die Zeichen muessen die Zustaende unterscheiden').toBe(6);
  });

  it('ein annehmendes Ziel: Urteil accept, Vorschau aus Paket 6, beide Zugaenge nennen denselben Adapter', () => {
    const s = offen({ payload: payload() });
    expect(s.phase).toBe('ready');
    expect(s.verdict).toBe('accept');
    expect(s.reason).toBeNull();
    expect(s.canConfirmWithKeyboard).toBe(true);
    expect(s.compatibleIntents).toEqual(['COPY']);
    // Die Vorschau ist die von `hoverDropTarget` — hier wird **keine** zweite gebaut.
    expect(s.target.preview).toEqual({ objectKind: 'Table', intent: 'COPY', label: 'Table · COPY' });

    const zeiger = dropPresentWorkspaceDropZone(s, context({ payload: payload() }));
    const tastatur = confirmPresentWorkspaceDropZone(s, context({ payload: payload() }));
    expect(zeiger.ok).toBe(true);
    expect(tastatur.ok).toBe(true);
    // **Eine** Zustellung: Zeiger und Tastatur liefern dasselbe Ergebnis aus dem vorhandenen Resolver.
    expect(zeiger.state.assessment).toEqual(tastatur.state.assessment);
    expect(zeiger.state.phase).toBe('resolved');
    const assessment = zeiger.state.assessment;
    expect(assessment?.status).toBe('resolved');
    if (assessment?.status === 'resolved') {
      expect(assessment.selection.adapterId).toBe('present-table-target');
      expect(assessment.selection.intent).toBe('COPY');
      expect(assessment.selection.targetDocumentId).toBe('present-doc');
      expect(assessment.sourceVersion).toBe(2);
      expect(assessment.targetVersion).toBe(2);
    }
  });

  it('der neue Zustand: die Route nimmt an -- und ohne Quellen verweigert das Ablegen BENANNT', () => {
    // **Form A** (die Form der Shell): die Route traegt `Table` mit `COPY`.
    const s = offen({ payload: payload(), registry: presentRegistry(['COPY']) });
    expect(s.phase).toBe('ready');
    expect(s.verdict).toBe('accept');
    expect(s.reason).toBeNull();
    expect(s.compatibleIntents).toEqual(['COPY']);

    // Der **heute montierte** Zustand: die Route ist da, aber die Shell liefert die Quellen noch nicht.
    // Der vorhandene Resolver verweigert dann -- mit **Namen**, nicht still.
    const ohneQuellen = context({
      payload: payload(),
      registry: presentRegistry(['COPY']),
      documents: { 'present-doc': DOCUMENTS['present-doc'] },
    });
    const ablage = dropPresentWorkspaceDropZone(s, ohneQuellen);
    expect(ablage.ok, 'ein benannter Fehlschlag darf NIE ok sein').toBe(false);
    expect(ablage.reason).toBe('drop_source_document_missing');
    expect(ablage.state.assessment?.status).toBe('rejected');
  });

  it('ein nicht gedeckter Traeger: das Ablegen ist ein BENANNTER Fehlschlag, kein stiller Erfolg', () => {
    // **Dieselbe** Route, ein Traeger, den sie **nicht** deckt (kein Table) -- das Urteil kommt aus Paket 6.
    const ungedeckt = context({ payload: payload({ objectKind: 'Chart' }), registry: presentRegistry(['COPY']) });
    const s = offen(ungedeckt);
    expect(s.phase).toBe('refused');
    expect(s.verdict).toBe('reject');
    expect(s.reason).toBe('route-not-capable');
    expect(isPresentWorkspaceDropRefusal(s.reason)).toBe(true);
    expect(presentWorkspaceDropRefusalText('route-not-capable').length).toBeGreaterThan(0);

    const ablage = dropPresentWorkspaceDropZone(s, ungedeckt);
    expect(ablage.ok, 'eine abgelehnte Ablage darf NIE ok sein').toBe(false);
    // Ein zweiter Abschluss auf einem **entschiedenen** Fall ist ein benannter No-op -- und die
    // **Tatsache** bleibt sichtbar: aus `reject` wird kein stilles `accept`.
    expect(ablage.reason).toBe('drop-zone-already-decided');
    expect(ablage.state.verdict).toBe('reject');
    expect(ablage.state.assessment).toBeNull();
  });

  it('fail-closed: kaputter Traeger, unbekannte Objektart, fehlende Matrix — je ein benannter Grund', () => {
    const mitZusatzfeld = JSON.parse(payload()) as Record<string, unknown>;
    mitZusatzfeld['html'] = '<script>run()</script>';
    const faelle: readonly (readonly [string, unknown, Partial<PresentWorkspaceDropZoneContext>, string])[] = [
      ['Zusatzfeld', JSON.stringify(mitZusatzfeld), {}, 'payload_invalid'],
      ['unbekannte Objektart', payload().replace('"objectKind":"Table"', '"objectKind":"Script"'), {}, 'object_kind_unknown'],
      ['unbekannte Absicht', payload().replace('"COPY"', '"EXECUTE"'), {}, 'intent_unknown'],
      ['kein JSON', '{', {}, 'payload_invalid'],
    ];
    for (const [name, traeger, extra, erwartet] of faelle) {
      const s = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: traeger, ...extra })).state;
      expect(s.phase, name).toBe('refused');
      expect(s.reason, name).toBe(erwartet);
      expect(s.verdict, name).toBe('none');
    }
    // Eine **fehlende Quelle** ist keine Frage der Route: das Ueberfahren urteilt die Faehigkeit, erst die
    // Zustellung prueft die Identitaet. *Zwei Tatsachen, zwei Zeitpunkte -- und beide benannt.*
    const fremdeQuelle = offen({ payload: payload({ documentId: 'gibt-es-nicht' }) });
    expect(fremdeQuelle.phase).toBe('ready');
    const ablage = dropPresentWorkspaceDropZone(fremdeQuelle, context({ payload: payload({ documentId: 'gibt-es-nicht' }) }));
    expect(ablage.ok).toBe(false);
    expect(ablage.reason).toBe('drop_source_document_missing');
    // Fehlende und nicht versiegelte Matrix: **keine** Antwort ist **keine** Erlaubnis (Paket 6).
    for (const registry of [null, new WorkspaceInteractionRegistry()]) {
      const s = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload(), registry })).state;
      expect(s.phase).toBe('refused');
      expect(s.reason).toBe('verdict-unavailable');
      expect(s.verdict).toBe('reject');
      const ablage = dropPresentWorkspaceDropZone(s, context({ payload: payload(), registry }));
      expect(ablage.ok).toBe(false);
    }
  });

  it('Ziel und Traeger werden benannt verweigert -- nie still', () => {
    const ohneZiel = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone(), context({ targetDocumentId: '   ', payload: payload() }));
    expect(ohneZiel.ok).toBe(false);
    expect(ohneZiel.reason).toBe('drop-zone-target-missing');

    const geschlossen = createPresentWorkspaceDropZone('present-doc');
    const ablage = dropPresentWorkspaceDropZone(geschlossen, context({ payload: payload() }));
    expect(ablage.ok).toBe(false);
    expect(ablage.reason).toBe('drop-zone-inactive');

    // Ein Zug ist da, aber **kein** Traeger: der leere Zustand -- kein Fehler, aber auch keine Ablage.
    const leer = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: null }));
    expect(leer.ok).toBe(true);
    expect(leer.state.phase).toBe('open');
    expect(leer.state.verdict).toBe('none');
    expect(leer.state.target.preview).toBeNull();
    expect(leer.state.canConfirmWithKeyboard).toBe(false);
    const ohneTraeger = dropPresentWorkspaceDropZone(leer.state, context({ payload: null }));
    expect(ohneTraeger.ok).toBe(false);
    expect(ohneTraeger.reason).toBe('drop-zone-transfer-missing');
    const bestaetigt = confirmPresentWorkspaceDropZone(leer.state, context({ payload: null }));
    expect(bestaetigt.ok).toBe(false);
    expect(bestaetigt.reason).toBe('drop-zone-transfer-missing');
  });

  it('offene Absicht: KEINE heimliche Vorauswahl -- der Grund kommt aus der Matrix', () => {
    const s = offen({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) });
    expect(s.phase).toBe('choice');
    expect(s.verdict).toBe('accept');
    expect(s.compatibleIntents).toEqual(['COPY', 'LIVE_REFERENCE']);

    const ablage = dropPresentWorkspaceDropZone(s, context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) }));
    expect(ablage.ok).toBe(false);
    expect(ablage.reason).toBe('drop_intent_choice_required');
    expect(ablage.state.phase, 'die offene Absicht bleibt offen').toBe('choice');
    expect(ablage.state.assessment?.status).toBe('needsChoice');

    // Und dieselbe Tastatur bestaetigt **woertlich die Ablage** — naemlich gar nichts.
    const bestaetigt = confirmPresentWorkspaceDropZone(s, context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) }));
    expect(bestaetigt.ok).toBe(false);
    expect(bestaetigt.reason).toBe('drop_intent_choice_required');

    // **Paket 15 — Marker EINGELÖST (Runde 259) ✓✓:** *Live **ohne** Modus ist der **benannte** Fehlschlag* ✓ — und
    // **mit** gewähltem Modus **vollendet dieselbe Zustellung** ✓✓. *Genau die Akzeptanzhandlung: „klare Auswahl
    // Live/Frozen **ohne heimlichen Default**"* ✓.
    const ohneModus = choosePresentWorkspaceDropIntent(s, 'LIVE_REFERENCE', context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) }));
    expect(ohneModus.ok).toBe(false);
    expect(ohneModus.reason).toBe('drop_live_mode_required');
    const mitModus = choosePresentWorkspaceDropIntent(s, 'LIVE_REFERENCE', context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']), requestedMode: 'Live' }));
    expect(mitModus.ok).toBe(true);
    expect(mitModus.state.phase).toBe('resolved');
    if (mitModus.state.assessment?.status === 'resolved') {
      expect(mitModus.state.assessment.selection.intent).toBe('LIVE_REFERENCE');
      expect(mitModus.state.assessment.selection.integrationKind).toBe('live');
      expect(mitModus.state.assessment.selection.mode).toBe('Live');
    }
    // **Und Frozen ist ebenso wählbar** ✓ — *zwei Modi, keine Vorauswahl* ✓.
    const frozen = choosePresentWorkspaceDropIntent(s, 'LIVE_REFERENCE', context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']), requestedMode: 'Frozen' }));
    expect(frozen.ok).toBe(true);
    // **Und die Kopie trägt keinen Modus** ✓ — *die Abwesenheit ist die Aussage* ✓.
    const alsKopie = choosePresentWorkspaceDropIntent(s, 'COPY', context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) }));
    expect(alsKopie.ok).toBe(true);
    expect(alsKopie.state.phase).toBe('resolved');
    expect(alsKopie.state.assessment?.status).toBe('resolved');
    if (alsKopie.state.assessment?.status === 'resolved') {
      expect(alsKopie.state.assessment.selection.intent).toBe('COPY');
      expect(alsKopie.state.assessment.selection.integrationKind).toBe('copy');
      expect(alsKopie.state.assessment.selection.mode).toBeUndefined();
    }

    // Eine **nicht** angebotene Absicht wird nicht stillschweigend uebernommen: die Matrix benennt sie.
    const fremd = choosePresentWorkspaceDropIntent(s, 'FROZEN_SNAPSHOT', context({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) }));
    expect(fremd.ok).toBe(false);
    expect(fremd.reason).toBe('drop_intent_not_supported');
  });

  it('Tatsachen bleiben stehen: ein ueberfahrender Zeiger loescht eine Ablehnung nicht', () => {
    const abgelehnt = offen({ payload: 'kein JSON' });
    expect(isPresentWorkspaceDropZoneSettled(abgelehnt)).toBe(true);
    const ueberfahren = openPresentWorkspaceDropZone(abgelehnt, context({ payload: payload() }));
    expect(ueberfahren.ok).toBe(true);
    expect(ueberfahren.state).toEqual(abgelehnt);
    expect(leavePresentWorkspaceDropZone(abgelehnt).state).toEqual(abgelehnt);
    expect(dropPresentWorkspaceDropZone(abgelehnt, context({ payload: payload() })).reason).toBe('drop-zone-already-decided');
    // Ein **neuer** Zug loest den entschiedenen Fall ab -- nur er (`enter` schliesst ihn zuerst).
    const neuerZug = enterPresentWorkspaceDropZone(abgelehnt, context({ payload: payload() }));
    expect(neuerZug.ok).toBe(true);
    expect(neuerZug.state.phase).toBe('ready');
    expect(neuerZug.state.reason).toBeNull();
  });

  it('die Zieh-Session aus Paket 5 ist die Quelle -- kein zweiter Zug', () => {
    const begonnen = beginDrag(createDragSession(), { pointerId: 1, x: 0, y: 0 }, payload());
    const gezogen = moveDrag(begonnen.state, { pointerId: 1, x: DRAG_THRESHOLD_PX * 4, y: 0 });
    expect(gezogen.state.phase).toBe('dragging');
    // Der Traeger kommt **woertlich** aus der Sitzung -- der Kontext hat keinen.
    const s = openPresentWorkspaceDropZoneFromDragSession(createPresentWorkspaceDropZone('present-doc'), gezogen.state, context({ payload: undefined }));
    expect(s.ok).toBe(true);
    expect(s.state.phase).toBe('ready');
    expect(s.state.target.preview?.label).toBe('Table · COPY');

    // Laeuft kein Zug mehr, schliesst ein ueberfahrendes Ziel.
    const beendet = openPresentWorkspaceDropZoneFromDragSession(s.state, createDragSession(), context({ payload: undefined }));
    expect(beendet.state.phase).toBe('closed');
    expect(beendet.state.closedReason).toBe('drag-left');
    const nichts = openPresentWorkspaceDropZoneFromDragSession(createPresentWorkspaceDropZone('present-doc'), createDragSession(), context());
    expect(nichts.ok).toBe(false);
    expect(nichts.reason).toBe('drop-zone-inactive');
  });

  it('die Tastatur ist eine Absicht -- dieselben Befehle, derselbe Weg', () => {
    const s = offen({ payload: payload(), registry: presentRegistry(['COPY', 'LIVE_REFERENCE']) });
    const enter = resolvePresentWorkspaceDropCommand(s, 'Enter');
    expect(enter.ok).toBe(true);
    if (enter.ok) expect(enter.command).toEqual({ kind: 'confirm' });
    const escape = resolvePresentWorkspaceDropCommand(s, 'Escape');
    expect(escape.ok).toBe(true);
    if (escape.ok) expect(escape.command).toEqual({ kind: 'dismiss' });
    // Die Ziffer waehlt die **Stelle** in der angebotenen Liste -- hier '2' also LIVE_REFERENCE.
    const zwei = resolvePresentWorkspaceDropCommand(s, '2');
    expect(zwei.ok).toBe(true);
    if (zwei.ok) expect(zwei.command).toEqual({ kind: 'choose', intent: 'LIVE_REFERENCE' });
    for (const taste of ['9', '', 'F5']) {
      const ungebunden = resolvePresentWorkspaceDropCommand(s, taste);
      expect(ungebunden.ok, taste).toBe(false);
      if (!ungebunden.ok) expect(ungebunden.reason).toBe('drop-zone-key-unbound');
    }
    // Ein Befehl, den die Maschine nicht kennt, wird benannt abgelehnt.
    const unbekannt = applyPresentWorkspaceDropCommand(s, { kind: 'explode' } as never, context({ payload: payload() }));
    expect(unbekannt.ok).toBe(false);
    expect(unbekannt.reason).toBe('drop-zone-command-unknown');
    // Und der Schliessen-Befehl schliesst -- mit benanntem Grund.
    const geschlossen = applyPresentWorkspaceDropCommand(s, { kind: 'dismiss' }, context({ payload: payload() }));
    expect(geschlossen.ok).toBe(true);
    expect(geschlossen.state.phase).toBe('closed');
    expect(geschlossen.state.closedReason).toBe('keyboard-dismiss');
  });

  it('die Geometrie ist die vorhandene Platzierung -- und ohne freien Platz wird verweigert', () => {
    const platz = presentWorkspaceDropPlacement(KEINE_FLaeCHE);
    expect(platz).toEqual({ xPercent: 71, yPercent: 28, widthPercent: 27, heightPercent: 18 });
    expect(presentWorkspaceDropPlacement(FOLIE_VOLL), 'eine volle Folie hat keinen freien Platz').toBeNull();
    expect(presentWorkspaceDropPlacement(undefined)).toEqual(platz);

    const s = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload(), existingObjects: FOLIE_VOLL })).state;
    expect(s.phase).toBe('refused');
    expect(s.reason).toBe('drop-zone-no-free-region');
    expect(s.placement).toBeNull();
    expect(s.target.verdict, 'das Urteil der Matrix bleibt unberuehrt -- Geometrie ist keine Route').toBe('accept');
    const ablage = dropPresentWorkspaceDropZone({ ...s, phase: 'ready' }, context({ payload: payload(), existingObjects: FOLIE_VOLL }));
    expect(ablage.ok).toBe(false);
    expect(ablage.reason).toBe('drop-zone-no-free-region');
  });

  it('die Platzierung ist zoomunabhaengig -- derselbe Punkt relativ zur sichtbaren Folie', () => {
    const einfach = { left: 100, top: 50, width: 400, height: 225 };
    const doppelt = { left: -100, top: 20, width: 800, height: 450 };
    const punktEinfach = { clientX: 100 + 0.25 * 400, clientY: 50 + 0.5 * 225 };
    const punktDoppelt = { clientX: -100 + 0.25 * 800, clientY: 20 + 0.5 * 450 };
    expect(presentWorkspaceDropPointerPercent(einfach, punktEinfach)).toEqual({ xPercent: 25, yPercent: 50 });
    expect(presentWorkspaceDropPointerPercent(doppelt, punktDoppelt)).toEqual(presentWorkspaceDropPointerPercent(einfach, punktEinfach));
    // Fail-closed: ohne messbare Flaeche gibt es keine Position -- und keine geratene.
    expect(presentWorkspaceDropPointerPercent(null, punktEinfach)).toBeNull();
    expect(presentWorkspaceDropPointerPercent({ left: 0, top: 0, width: 0, height: 10 }, punktEinfach)).toBeNull();
    expect(presentWorkspaceDropPointerPercent(einfach, { clientX: Number.NaN, clientY: 1 })).toBeNull();
  });

  it('die Touch-Strategie ist entschieden -- Langdruck, touch-action, pointercancel', () => {
    const beruehrung = presentWorkspaceDropTouchStrategy('touch');
    expect(beruehrung.longPress.required).toBe(true);
    expect(beruehrung.longPress.ms).toBe(DRAG_TOUCH_LONGPRESS_MS);
    expect(beruehrung.thresholdPx).toBe(DRAG_THRESHOLD_PX * 2);
    expect(beruehrung.touchAction).toBe(PRESENT_WORKSPACE_DROP_ZONE_TOUCH_ACTION);
    expect(beruehrung.touchAction, 'nie none -- sonst tauscht man ein Bedienproblem gegen ein anderes').toBe('manipulation');
    expect(beruehrung.cancelEvent).toBe('pointercancel');
    expect(beruehrung.cancelReason).toBe('pointer-lost');
    expect(beruehrung.pointerFree).toBe(false);

    for (const art of ['mouse', 'pen'] as const) {
      const strategie = presentWorkspaceDropTouchStrategy(art);
      expect(strategie.longPress.required, art).toBe(false);
      expect(strategie.longPress.ms, art).toBe(0);
      expect(strategie.thresholdPx, art).toBe(DRAG_THRESHOLD_PX);
      expect(strategie.pointerFree, art).toBe(false);
    }
    const tastatur = presentWorkspaceDropTouchStrategy('keyboard');
    expect(tastatur.pointerFree).toBe(true);
    expect(tastatur.longPress.required).toBe(false);

    // „Beginnt aus diesem Druck ein Zug?" -- als Entscheidung, nicht als Behauptung.
    expect(presentWorkspaceDropGestureBegins('touch', DRAG_TOUCH_LONGPRESS_MS, 0)).toBe(true);
    expect(presentWorkspaceDropGestureBegins('touch', DRAG_TOUCH_LONGPRESS_MS - 1, 0)).toBe(false);
    expect(presentWorkspaceDropGestureBegins('touch', DRAG_TOUCH_LONGPRESS_MS * 2, DRAG_THRESHOLD_PX * 2 + 1)).toBe(false);
    expect(presentWorkspaceDropGestureBegins('mouse', 0, 0)).toBe(true);
    expect(presentWorkspaceDropGestureBegins('keyboard', 10_000, 0)).toBe(false);
    for (const kaputt of [Number.NaN, -1, Number.POSITIVE_INFINITY, '500']) {
      expect(presentWorkspaceDropGestureBegins('touch', kaputt, 0), String(kaputt)).toBe(false);
    }
  });

  it('der Traeger kommt aus der Ablageflaeche -- genau eine MIME, sonst benannt', () => {
    const gut = { getData: (mime: string) => (mime === FABRIC_WORKSPACE_OBJECT_DRAG_MIME ? payload() : '') };
    const gelesen = readPresentWorkspaceTransfer(gut);
    expect(gelesen.ok).toBe(true);
    if (gelesen.ok) expect(gelesen.payload).toBe(payload());
    expect(readPresentWorkspaceTransfer(null)).toEqual({ ok: false, reason: 'drop-zone-transfer-missing' });
    expect(readPresentWorkspaceTransfer({})).toEqual({ ok: false, reason: 'drop-zone-transfer-unreadable' });
    expect(readPresentWorkspaceTransfer({ getData: () => '' })).toEqual({ ok: false, reason: 'drop-zone-transfer-missing' });
    expect(readPresentWorkspaceTransfer({ getData: () => { throw new Error('kaputt'); } })).toEqual({ ok: false, reason: 'drop-zone-transfer-unreadable' });

    expect(hasPresentWorkspaceDropTransfer([FABRIC_WORKSPACE_OBJECT_DRAG_MIME, 'text/plain'])).toBe(true);
    expect(hasPresentWorkspaceDropTransfer(['text/plain'])).toBe(false);
    expect(hasPresentWorkspaceDropTransfer(null)).toBe(false);
  });

  it('die Absichten kommen aus der Autoritaet -- nicht aus einer zweiten Liste hier', () => {
    const eine = presentWorkspaceDropCompatibleIntents(presentRegistry(['COPY']), {
      documentId: 'grid-doc', objectId: 'table-1', objectKind: 'Table', sourceApp: 'Grid', supportedIntents: ['COPY', 'LIVE_REFERENCE'],
    });
    // LIVE_REFERENCE ist im Traeger zugesagt, aber **nicht** von der Matrix gedeckt -- sie fehlt hier.
    expect(eine).toEqual(['COPY']);
    // Dieselbe Autoritaet, **andere** Deckung: die Route traegt genau COPY -- der Traeger darf nicht mehr
    // bekommen, und ohne Ueberschneidung bekommt er **nichts**.
    const gedeckt = presentWorkspaceDropCompatibleIntents(presentRegistry(['COPY']), {
      documentId: 'grid-doc', objectId: 'table-1', objectKind: 'Table', sourceApp: 'Grid', supportedIntents: ['COPY', 'LIVE_REFERENCE'],
    });
    expect(gedeckt, 'die Matrix deckt genau COPY').toEqual(['COPY']);
    const keine = presentWorkspaceDropCompatibleIntents(presentRegistry(['COPY']), {
      documentId: 'grid-doc', objectId: 'table-1', objectKind: 'Table', sourceApp: 'Grid', supportedIntents: ['FROZEN_SNAPSHOT'],
    });
    expect(keine, 'keine Ueberschneidung heisst keine Absicht').toEqual([]);
    expect(presentWorkspaceDropCompatibleIntents(null, {
      documentId: 'grid-doc', objectId: 'table-1', objectKind: 'Table', sourceApp: 'Grid', supportedIntents: ['COPY'],
    })).toEqual([]);
  });

  it('jede Eingabeart ist im Zustand benannt -- die Flaeche raet sie nicht', () => {
    for (const art of ['touch', 'pen', 'keyboard', 'mouse'] as const) {
      const s = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload(), input: art })).state;
      expect(s.input, art).toBe(art);
    }
    const unbekannt: DragInputKind = 'mouse';
    const s = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), context({ payload: payload(), input: 'gamepad' })).state;
    expect(s.input).toBe(unbekannt);
  });
});
