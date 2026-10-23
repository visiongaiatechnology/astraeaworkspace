// STATUS: PLATIN — Paket 15: der **Ablegeweg** von Present bei einer Route, die **nur** Live führt
//
// ## Warum diese Datei existiert ✗✓
//
// Der **Whiteboard-Agent** hat in **seiner** Zone ein echtes Loch gefunden und geschlossen ✓✓:
// `resolveWorkspaceDrop({ requestedIntent: undefined })` antwortet für eine **reine Live-Route** `resolved` —
// **ohne** Modus ✗. *Hätte die Zone das als Zustellung genommen, hätte sie einen Live-Verweis **ohne** Live/Frozen
// ausgeliefert — genau der heimliche Default, den Paket 15 verbietet* ✗.
//
// **Er hat dasselbe Muster für Present gemeldet — aber als Erreichbarkeits-Hypothese, nicht als Lauf** ✗✓
// („erreichbar mit `supportedIntents: ['LIVE_REFERENCE']`"). *Eine Hypothese wird hier **gemessen**, nicht
// geglaubt* ✓✓ — **deshalb dieser Test:** *er **versucht**, die Umgehung zu erzeugen.*
//
// ## Was er festhält, egal wie er ausgeht ✓
//
// * **Rot** → das Loch ist echt, und dann wird **Present** geschlossen ✗.
// * **Grün** → die Hypothese ist **widerlegt**, und **das** steht dann hier ✓✓ — *mit der Begründung, an welcher
//   Stelle der Ablegeweg die Absicht **ausdrücklich** macht und die Modusregel dadurch greift* ✓.
//
// **Und die positive Kontrolle ist Pflicht** ✓: derselbe Weg **mit** gesagtem Modus muss **zustellen** ✗✓ — *sonst
// bewiese der grüne Fehlschlag nur, dass die Zone gar nichts tut* ✗.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WorkspaceObject } from '../../../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
  WorkspaceInteractionRegistry,
  type WorkspaceDropIntent,
} from '../../../../../shared/workspace-interaction';
import {
  createPresentWorkspaceDropZone,
  dropPresentWorkspaceDropZone,
  openPresentWorkspaceDropZone,
  type PresentWorkspaceDropZoneContext,
} from '../../../integrations/workspace-drop/presentWorkspaceDropZone';

/** Dieselbe Vorrichtungsform wie `presentWorkspaceDropZone.test.ts` ✓ — *keine zweite Bauart* ✓. */
function dokument(id: string, kind: WorkspaceDocument['kind'], objectId?: string): WorkspaceDocument {
  const objects: Record<string, WorkspaceObject> = {};
  if (objectId) objects[objectId] = { type: 'Table', data: { id: objectId, rows: 1, cols: 1, cells: { A1: { value: '42' } } } };
  return {
    schema_version: 2, id, title: id, kind, created_at: 1, modified_at: 1, version: 2,
    theme_id: 'cosmic-obsidian', root_object_ids: objectId ? [objectId] : [], objects,
  };
}

const DOCUMENTS = Object.freeze({
  'grid-doc': dokument('grid-doc', 'Grid', 'table-1'),
  'present-doc': dokument('present-doc', 'Present'),
});

/** **Die reine Live-Route** ✗✓ — *Grid exportiert beides, Present bietet **nur** `LIVE_REFERENCE` an* ✓. */
function nurLive(intents: readonly WorkspaceDropIntent[] = ['LIVE_REFERENCE']): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Present', exports: [], imports: [{ objectKind: 'Table', intents }] });
  registry.registerAdapter({ id: 'present-table-target', targetApp: 'Present', objectKinds: ['Table'], intents });
  return registry.seal();
}

function traeger(): string {
  return serializeWorkspaceDragPayload(createWorkspaceDragPayload({
    documentId: 'grid-doc', objectId: 'table-1', objectKind: 'Table', sourceApp: 'Grid',
    supportedIntents: ['LIVE_REFERENCE'],
  }));
}

function kontext(overrides: Partial<PresentWorkspaceDropZoneContext> = {}): PresentWorkspaceDropZoneContext {
  // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt den **Modus-Weg**, nicht die
  // Richtlinie ✓ — *die Zone liest die Entscheidung der Administratorrichtlinie aus ihrem Kontext* ✓✓. *In der
  // Produktion holt die Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge
  // ist ein eigener Vertrag** ✓✓: `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
  return { targetDocumentId: 'present-doc', documents: DOCUMENTS, registry: nurLive(), payload: traeger(), requestedPolicyDecision: { effect: 'Allow' }, ...overrides };
}

describe('Paket 15: der Present-**Ablegeweg** auf einer reinen Live-Route', () => {
  it('**Nicht-Leerheit:** die reine Live-Route ist wirklich gedeckt und das Ablegen ist überhaupt möglich', () => {
    const ctx = kontext();
    // *Wäre die Route nicht gedeckt oder die Fläche nicht bereit, prüfte der folgende Test nichts* ✓.
    expect(ctx.registry?.getCompatibleIntents('Grid', 'Present', 'Table')).toEqual(['LIVE_REFERENCE']);
    const offen = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), ctx);
    expect(offen.state.verdict, 'die Route ist fähig').toBe('accept');
    expect(offen.state.placement, 'ohne Platz gäbe es kein Ablegen zu prüfen').toBeTruthy();
  });

  it('**Der Versuch, die Umgehung zu erzeugen** ✓✗ — ohne gesagten Modus wird **nicht** zugestellt', () => {
    const ctx = kontext();
    const offen = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), ctx);
    const abgelegt = dropPresentWorkspaceDropZone(offen.state, ctx);
    // **Die Zusicherung, die die Hypothese prüft** ✓✓: kein stiller Live-Verweis ohne Modus.
    expect(abgelegt.ok, 'ohne Modus darf NICHT zugestellt werden').toBe(false);
    expect(abgelegt.reason).toBe('drop_live_mode_required');
    expect(abgelegt.state.phase).toBe('refused');
  });

  it('**Und der Zustellweg über die Tastatur ebenso** ✓ — dieselbe Regel, derselbe benannte Grund', () => {
    const ctx = kontext();
    const offen = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), ctx);
    const perTastatur = dropPresentWorkspaceDropZone(offen.state, ctx);
    expect(perTastatur.ok).toBe(false);
    expect(perTastatur.reason).toBe('drop_live_mode_required');
  });

  it('**Positive Kontrolle:** mit gesagtem Modus stellt **derselbe** Weg wirklich zu ✓✓', () => {
    const mitModus = kontext({ requestedMode: 'Live' });
    const offen = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), mitModus);
    const abgelegt = dropPresentWorkspaceDropZone(offen.state, mitModus);
    // *Ohne diese Kontrolle bewiese der grüne Fehlschlag oben nur, dass die Zone gar nichts tut* ✗✓.
    expect(abgelegt.ok, 'mit Modus muss die Zustellung gelingen').toBe(true);
    expect(abgelegt.state.phase).toBe('resolved');
    if (abgelegt.state.assessment?.status === 'resolved') {
      expect(abgelegt.state.assessment.selection.intent).toBe('LIVE_REFERENCE');
      expect(abgelegt.state.assessment.selection.integrationKind).toBe('live');
      expect(abgelegt.state.assessment.selection.mode).toBe('Live');
    }
  });

  it('und ein **unbekannter** Modus ist kein Modus ✗ — fail-closed, kein stiller Rückfall', () => {
    const falsch = kontext({ requestedMode: 'Halbmond' });
    const offen = openPresentWorkspaceDropZone(createPresentWorkspaceDropZone('present-doc'), falsch);
    const abgelegt = dropPresentWorkspaceDropZone(offen.state, falsch);
    expect(abgelegt.ok).toBe(false);
    expect(abgelegt.reason).toBe('drop_live_mode_required');
  });
});
