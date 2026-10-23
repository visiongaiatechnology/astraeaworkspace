// STATUS: PLATIN — Integration & Release, **Paket 15**: ist `NoteWorkspaceEmbedData.mode` **anschlussfähig**?
//
// ## Die Frage, die dieser Vertrag **misst** (nicht behauptet)
//
// Paket 15 hat dem Resolver den **Modus** gegeben: `WorkspaceDropSelection` trägt jetzt `integrationKind`
// (`copy` / `live`) und — nur bei `live` — den **gesagten** `mode` (`Live` / `Frozen`). *Genau dieser Modus war die
// Begründung für **Form A** in Paket 12: „`WorkspaceDropSelection` trug **kein** `mode`, während Notes' eigener
// Verweis `NoteWorkspaceEmbedData.mode: 'Live' | 'Frozen'` kennt."* Jetzt gibt es ihn — also wird hier gemessen,
// **wie weit** er trägt:
//
//   * **Der Modus ist anschlussfähig** ✓: eine zugestellte Live-Absicht lässt sich **ohne Erfindung** in das
//     vorhandene Einbettmodell überführen (`listNoteWorkspaceEmbedTargets` → `createNoteWorkspaceEmbed`) — der
//     Modus kommt **wörtlich** aus der Zustellung.
//   * **Das Ziel ist es nicht** ✗ — und das ist **gemessen**, nicht behauptet: führt eine Tabelle auf **zwei**
//     Bereiche (zwei Tabellenblätter), dann gibt es **zwei** Ziele mit **derselben** `sourceObjectId`. *Eine
//     Auswahl „nimm das erste" wäre ein **heimlicher Default** — genau der Defekt, den Paket 15 beim Modus
//     beseitigt hat.* Die Zielwahl bleibt deshalb beim **vorhandenen** Weg
//     (`NotesWorkspaceEmbedModal` → `onInsert` → `blockFromWorkspaceEmbed`), der den Nutzer **fragt**.
//   * **Eine Kopie ist es gar nicht** ✗: das Einbettmodell **verlangt** einen Modus (`mode: 'Live' | 'Frozen'`) und
//     baut immer einen **Verweis** (`vgt://workspace/document/…/notes-reference`). Eine `copy`-Zustellung trägt
//     bewusst **keinen** Modus — *ein erfundener wäre der verbotene Default.*
//
// **Was hier NICHT gebaut wird:** ein zweiter Einfüge-Pfad. *Der Resolver stellt eine **Route** fest — „It does not
// mutate or persist either document" —, und die Einfügung hat in Notes **eine** Definition (der Modal-Weg).*
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WriterWorkspaceEmbedSnapshot } from '../../../../shared/contracts/workspace';
import { registerWorkspaceSnapshotProvider } from '../../../../platform/workspace/integrations/workspaceSnapshot';
import {
  WorkspaceInteractionRegistry,
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../shared/workspace-interaction';
import {
  chooseNotesDropIntent,
  createNotesDropZone,
  dropNotesDropZone,
  hoverNotesDropZone,
} from '../../drop-zone/notesDropZone';
import type { NotesDropZoneContext } from '../../drop-zone/notesDropZone';
import { createNoteWorkspaceEmbed, listNoteWorkspaceEmbedTargets } from '../../integrations/notesWorkspaceEmbed';

/**
 * **Der neutrale Schnappschuss-Port** — genau der Weg, den `notesWorkspaceEmbed.test.ts` schon benutzt.
 * *Ohne ihn wirft `createNoteWorkspaceEmbed` `WorkspaceSnapshotProviderUnavailableError` — das ist **gemessen**
 * (der erste Lauf dieses Vertrags ist genau daran gescheitert), und deshalb wird hier **kein** zweiter
 * Einbettungsweg gebaut, sondern der vorhandene Port bedient.*
 */
const snapshot: WriterWorkspaceEmbedSnapshot = { type: 'summary', metrics: [], lines: ['snapshot'] };
let release: (() => void) | undefined;
afterEach(() => {
  release?.();
  release = undefined;
});

/** Die Quelle **mit** Tabellenblättern — so, wie eine echte Grid-Datei aussieht. */
function gridSource(sheets: readonly { id: string; name: string; tableObjectId: string }[]): WorkspaceDocument {
  return {
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
    gridData: { sheets: sheets.map((sheet) => ({ ...sheet })) },
  };
}

const ONE_SHEET = gridSource([{ id: 'sheet-main', name: 'Main', tableObjectId: 'table-forecast' }]);
/** **Zwei** Blätter auf **einer** Tabelle — die Mehrdeutigkeit, die die Zielwahl zur Nutzerentscheidung macht. */
const TWO_SHEETS = gridSource([
  { id: 'sheet-a', name: 'Actuals', tableObjectId: 'table-forecast' },
  { id: 'sheet-b', name: 'Plan', tableObjectId: 'table-forecast' },
]);

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

const liveOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: 'grid-source',
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['LIVE_REFERENCE'],
}));
const copyOnlyPayload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
  documentId: 'grid-source',
  objectId: 'table-forecast',
  objectKind: 'Table',
  sourceApp: 'Grid',
  supportedIntents: ['COPY'],
}));

/** Eine Matrix mit **beiden** Absichten für Notes — damit die Zustellung wählbar ist (nicht Form A/B geprüft). */
function notesRegistry(): WorkspaceInteractionRegistry {
  const registry = new WorkspaceInteractionRegistry();
  registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
  registry.registerAppManifest({ app: 'Notes', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }] });
  registry.registerAdapter({ id: 'fabric-grid-table-to-notes', targetApp: 'Notes', objectKinds: ['Table'], intents: ['COPY', 'LIVE_REFERENCE'] });
  return registry.seal();
}

const contextWith = (source: WorkspaceDocument, payload: unknown, requestedMode?: unknown): NotesDropZoneContext => ({
  registry: notesRegistry(),
  targetApp: target.kind,
  targetDocumentId: target.id,
  documents: { [source.id]: source, [target.id]: target },
  // UEBERGANGSMARKER (W-455) in der Pruefschicht: die Zone liest die Entscheidung der
  // Administratorrichtlinie aus ihrem Kontext; in der Produktion holt die Shell sie asynchron
  // (`precheckPolicy`) und reicht sie hinein. Der Richtlinien-Zeuge ist ein eigener Vertrag:
  // src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs
  requestedPolicyDecision: { effect: 'Allow' },
  surface: 'canvas',
  payload,
  ...(requestedMode === undefined ? {} : { requestedMode }),
});

const deliver = (source: WorkspaceDocument, payload: unknown, intent: 'COPY' | 'LIVE_REFERENCE', requestedMode?: unknown) =>
  chooseNotesDropIntent(createNotesDropZone(), intent, contextWith(source, payload, requestedMode));

/** Die Ziele, die **das vorhandene** Modell für genau dieses Objekt anbietet — **eine** Quelle, kein Nachbau. */
const targetsFor = (source: WorkspaceDocument, sourceObjectId: string) =>
  listNoteWorkspaceEmbedTargets(source).filter((candidate) => candidate.sourceObjectId === sourceObjectId);

describe('Paket 15 — der gesagte Modus ist an das vorhandene Einbettmodell **anschlussfähig**', () => {
  it('eine Live-Zustellung mit gesagtem Modus ergibt **genau ein** Ziel und den Modus **wörtlich**', () => {
    release = registerWorkspaceSnapshotProvider(() => snapshot);
    for (const mode of ['Live', 'Frozen'] as const) {
      const step = deliver(ONE_SHEET, liveOnlyPayload, 'LIVE_REFERENCE', mode);
      expect(step.ok, mode).toBe(true);
      if (step.state.decision.kind !== 'delivered') throw new Error('Zustellung fehlt');
      const resolution = step.state.decision.resolution;
      expect(resolution.integrationKind, mode).toBe('live');
      expect(resolution.mode, mode).toBe(mode);

      const candidates = targetsFor(ONE_SHEET, resolution.sourceObjectId);
      expect(candidates, mode).toHaveLength(1);
      const only = candidates[0];
      if (!only || resolution.mode === undefined) throw new Error('Ziel oder Modus fehlt');
      // **Die Verbindung** — `createNoteWorkspaceEmbed` ist die **vorhandene** Definition des Einbettmodells.
      const embed = createNoteWorkspaceEmbed(ONE_SHEET, only, resolution.mode);
      expect(embed.mode, mode).toBe(resolution.mode);
      expect(embed.mode, mode).toBe(mode);
      expect(embed.sourceDocumentId, mode).toBe(resolution.sourceDocumentId);
      expect(embed.sourceObjectId, mode).toBe(resolution.sourceObjectId);
      expect(embed.sourceVersion, mode).toBe(resolution.sourceVersion);
      expect(embed.kind, mode).toBe('grid-range');
      expect(embed.uri, mode).toContain('notes-reference');
    }
  });

  it('der zugestellte Modus und der Einbettmodus sind **derselbe** Wert — nicht zwei Vokabulare', () => {
    release = registerWorkspaceSnapshotProvider(() => snapshot);
    const live = deliver(ONE_SHEET, liveOnlyPayload, 'LIVE_REFERENCE', 'Live');
    const frozen = deliver(ONE_SHEET, liveOnlyPayload, 'LIVE_REFERENCE', 'Frozen');
    if (live.state.decision.kind !== 'delivered' || frozen.state.decision.kind !== 'delivered') throw new Error('Zustellung fehlt');
    expect(live.state.decision.resolution.mode).not.toBe(frozen.state.decision.resolution.mode);
    const liveEmbed = createNoteWorkspaceEmbed(ONE_SHEET, targetsFor(ONE_SHEET, 'table-forecast')[0]!, 'Live');
    const frozenEmbed = createNoteWorkspaceEmbed(ONE_SHEET, targetsFor(ONE_SHEET, 'table-forecast')[0]!, 'Frozen');
    // **Gemessen:** der Modus steckt im **Feld** `mode`, **nicht** in der `uri` — die beiden Verweise zeigen auf
    // dasselbe Objekt und unterscheiden sich **nur** im Modus. *Eine Anzeige, die den Modus aus der `uri` läse,
    // läse ihn falsch; die Zone liest ihn deshalb aus der Zustellung.*
    expect(liveEmbed.uri).toBe(frozenEmbed.uri);
    expect(liveEmbed.mode).not.toBe(frozenEmbed.mode);
    expect(liveEmbed.mode).toBe(live.state.decision.resolution.mode);
    expect(frozenEmbed.mode).toBe(frozen.state.decision.resolution.mode);
  });

  it('eine Live-Zustellung **ohne** Modus gibt es nicht — und der Grund wird je Weg **benannt**', () => {
    // Der Weg, der **ohne** den Paket-6-Riegel zustellt (die Absicht): **der Name des Resolvers**.
    const step = deliver(ONE_SHEET, liveOnlyPayload, 'LIVE_REFERENCE');
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('drop_live_mode_required');
    // Der **Ablage**-Weg geht zuerst durch das Urteil (Paket 6) — und dessen Grundvokabel ist **endlich**
    // (`object-kind-unknown` / `intent-unknown` / `route-not-capable` / `payload-missing` / `verdict-unavailable`):
    // es gibt dort **keinen** „Modus fehlt"-Grund. **Gemessen** lautet die Antwort deshalb `route-not-capable`;
    // *die Fläche erfindet keinen zweiten Grund, und ein fünfter gehörte in Paket 6 — nicht hierher.*
    const ohneModus = contextWith(ONE_SHEET, liveOnlyPayload);
    const dropped = dropNotesDropZone(
      hoverNotesDropZone(createNotesDropZone(), contextWith(ONE_SHEET, liveOnlyPayload, 'Live')).state,
      ohneModus,
    );
    expect(dropped.ok).toBe(false);
    expect(dropped.reason).toBe('route-not-capable');
    // **Mit** gesagtem Modus stellt derselbe Ablage-Weg zu — der Unterschied ist **genau** der Modus.
    const delivered = dropNotesDropZone(
      hoverNotesDropZone(createNotesDropZone(), contextWith(ONE_SHEET, liveOnlyPayload, 'Live')).state,
      contextWith(ONE_SHEET, liveOnlyPayload, 'Live'),
    );
    expect(delivered.ok).toBe(true);
    expect(delivered.state.decision.kind).toBe('delivered');
  });
});

describe('Paket 15 — die zwei Grenzen sind **gemessen**, nicht behauptet', () => {
  it('das **Ziel** ist mehrdeutig, sobald zwei Bereiche dieselbe Tabelle führen — eine Wahl, kein Default', () => {
    const step = deliver(TWO_SHEETS, liveOnlyPayload, 'LIVE_REFERENCE', 'Live');
    if (step.state.decision.kind !== 'delivered') throw new Error('Zustellung fehlt');
    const candidates = targetsFor(TWO_SHEETS, step.state.decision.resolution.sourceObjectId);
    // **Zwei** Ziele, **eine** `sourceObjectId`: *wer hier „das erste" nähme, hätte einen heimlichen Default
    // erfunden — genau der Defekt, den Paket 15 beim Modus beseitigt.* Die Wahl bleibt beim Nutzer (Modal).
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(2);
    expect(candidates.every((candidate) => candidate.sourceObjectId === 'table-forecast')).toBe(true);
  });

  it('eine Quelle **ohne** Bereiche bietet gar kein Ziel — die Zone kann keines erfinden', () => {
    const withoutSheets: WorkspaceDocument = { ...ONE_SHEET };
    delete (withoutSheets as { gridData?: unknown }).gridData;
    expect(targetsFor(withoutSheets, 'table-forecast')).toEqual([]);
    // Und die Zustellung selbst bleibt davon **unberührt**: die Route ist eine Route, kein Einfügen.
    const step = deliver(withoutSheets, liveOnlyPayload, 'LIVE_REFERENCE', 'Live');
    expect(step.ok).toBe(true);
  });

  it('eine **Kopie** trägt keinen Modus — und das Einbettmodell verlangt einen', () => {
    const step = deliver(ONE_SHEET, copyOnlyPayload, 'COPY');
    if (step.state.decision.kind !== 'delivered') throw new Error('Zustellung fehlt');
    const resolution = step.state.decision.resolution;
    expect(resolution.integrationKind).toBe('copy');
    // **Nicht** `mode: undefined`, sondern **kein** Feld — *das ist der Unterschied zwischen „nicht gesagt" und
    // „heimlich gesetzt" (`exactOptionalPropertyTypes` macht ihn prüfbar).*
    expect(Object.hasOwn(resolution, 'mode')).toBe(false);
    // Das Einbettmodell kann eine Kopie deshalb **nicht** ausdrücken: es baut immer einen **Verweis** und verlangt
    // einen Modus. *Ein erfundener Modus wäre der verbotene Default.*
    expect(Object.keys(resolution).sort()).toEqual([
      'adapterId', 'integrationKind', 'intent', 'sourceDocumentId', 'sourceObjectId',
      'sourceVersion', 'targetDocumentId', 'targetVersion',
    ]);
  });
});
