// STATUS: PLATIN — Integration & Release, **Notes · Paket 21** (Notes → Writer): Beweise für den Träger-Erzeuger
//
// ## Was hier gemessen wird
//
//   * **Der Träger ist eine Referenz** ✓ — Dokument-ID, Objekt-ID, Objektart, Quell-Anwendung, Absichten; **kein**
//     Absatztext ✗ (*eine Sonde mit einem unverwechselbaren Inhalt beweist es*).
//   * **Ein Format, kein zweiter Pfad** ✓ — der Träger entsteht über den **vorhandenen** Erzeuger und trägt die
//     **fünf** kanonischen Deskriptor-Schlüssel.
//   * **Fail-closed mit benanntem Grund** ✓ — jede Unbrauchbarkeit hat einen Namen.
//   * **Die Tastatur ist derselbe Weg** ✓ — `applyNotesCarrierCommand('carry')` liefert **denselben** Träger.
//   * **Live/Kopie ist am Träger sichtbar** ✓ — und in der Zustellung unterscheidbar (`integrationKind` / `mode`).
//
// ## Und was hier **gegen die echte gesiegelte Matrix** gemessen wird ✓✓
//
// **GEZOGEN (W-445) durch AST-0737.** Hier stand: *„Die Quellenseite von Notes → Writer ist in Produktion **offen**
// ✗: die versiegelte Matrix trägt für Notes `exports: []` und für Writer **keinen** `TextBlock`-Import."* Genau das
// war gemessen und richtig — **bis** die drei Einträge gesetzt wurden. Sie stehen jetzt in der **einen** gesiegelten
// Matrix der Shell (`shell/fabric/fabricGraphWorkspaceDrop.ts`) ✓✓, und dieser Vertrag misst sie **dort** ✓ — die
// Matrix wird **nicht** nachgebaut. *Die eine Ablehnung, die bleibt, ist die Identität der Quelle* ✓: ein
// Notes-Dokument **ohne** Seitenobjekt hat weiterhin keinen Träger, und **das** ist Notes-Sache, nicht die der Matrix.
import { describe, expect, it } from 'vitest';
import type { NotePage, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { WorkspaceInteractionRegistry, WORKSPACE_DROP_INTENTS, resolveWorkspaceDrop } from '../../../../shared/workspace-interaction';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
  assessFabricWorkspaceDrop,
  resolveFabricWorkspaceDrop,
} from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  NOTES_CARRIER_INTENTS,
  NOTES_CARRIER_OBJECT_KIND,
  applyNotesCarrierCommand,
  notesCarrierRefusalText,
  notesParagraphCarrier,
  resolveNotesCarrierCommand,
} from '../../integrations/notesParagraphCarrier';
import type { NotesCarrierRequest, NotesCarrierRefusal } from '../../integrations/notesParagraphCarrier';

/** **Die Sonde:** dieser Inhalt darf **nirgends** im Träger auftauchen. */
const SECRET = 'GEHEIMER-ABSATZ-INHALT-42';

/**
 * Ein Notes-Dokument, wie die Anwendung es führt — **gemessen** (`notesVnoteContainer.ts`):
 * `root_object_ids: []`, `objects: {}`. *Die Absätze leben in den Seiten, nicht in `objects`.*
 */
const notesDocument: WorkspaceDocument = {
  schema_version: 2,
  id: 'notes-quelle',
  title: 'Recherche',
  kind: 'Notes',
  created_at: 1,
  modified_at: 1,
  version: 5,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

/** Dieselbe Quelle, aber mit der Seite **als Objekt** — die Datenmodell-Frage, die dieser Vertrag sichtbar macht. */
const notesDocumentWithObject: WorkspaceDocument = {
  ...notesDocument,
  root_object_ids: ['page-1'],
  objects: {
    'page-1': {
      type: 'TextBlock',
      data: { id: 'page-1', paragraphs: [{ id: 'p-0', style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 4 }, spans: [{ text: SECRET, font_size_pt: 11 }] }] },
    },
  },
};

const page: NotePage = {
  id: 'page-1',
  title: 'Markdown-Absatz',
  content: `# Überschrift\n${SECRET}\n\nletzte Zeile`,
  tags: [],
  backlinks: [],
  last_modified: 1_700_000_000_000,
};

const writerTarget: WorkspaceDocument = {
  schema_version: 2,
  id: 'writer-ziel',
  title: 'Writer Ziel',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 4,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const request = (over: Partial<NotesCarrierRequest> = {}): NotesCarrierRequest => ({
  document: notesDocument,
  page,
  lineIndex: 1,
  ...over,
});

const carrierOf = (over: Partial<NotesCarrierRequest> = {}) => {
  const step = notesParagraphCarrier(request(over));
  if (!step.ok) throw new Error(`Träger fehlt: ${step.reason}`);
  return step.carrier;
};

describe('Notes · Paket 21 — der Träger ist eine **Referenz**, kein Inhalt', () => {
  it('trägt Dokument-ID, Objekt-ID, Objektart und Quell-Anwendung — und **keinen** Absatztext', () => {
    const carrier = carrierOf();
    const parsed = JSON.parse(carrier.payload) as { descriptor: Record<string, unknown> };
    // **Ein Format:** genau die fünf kanonischen Schlüssel (Paket 7) — kein sechstes Feld.
    expect(Object.keys(parsed.descriptor).sort()).toEqual(['documentId', 'objectId', 'objectKind', 'sourceApp', 'supportedIntents']);
    expect(parsed.descriptor.documentId).toBe(notesDocument.id);
    expect(parsed.descriptor.objectId).toBe(page.id);
    expect(parsed.descriptor.objectKind).toBe(NOTES_CARRIER_OBJECT_KIND);
    expect(parsed.descriptor.sourceApp).toBe('Notes');
    // **Die Sonde:** der Inhalt fährt nicht mit — im Träger und in der sichtbaren Beschreibung.
    expect(carrier.payload).not.toContain(SECRET);
    expect(carrier.label).not.toContain(SECRET);
    expect(carrier.reference).not.toContain(SECRET);
    // Und die MIME-Art ist **die eine** vorhandene — nicht eine zweite.
    expect(carrier.mime).toBe(FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  });

  it('benennt den Absatz mit der **vorhandenen** Referenz-Vokabel: Seiten-URI + `#line-<n>`', () => {
    const carrier = carrierOf();
    expect(carrier.reference).toBe(`vgt://workspace/document/${notesDocument.id}/notes/page/${page.id}#line-1`);
    // Dieselbe Vokabel wie im vorhandenen Notes→Tasks-Weg (`notesWorkspaceActions.ts`: `${sourceUri}#line-${index}`).
    expect(carrierOf({ lineIndex: 3 }).reference.endsWith('#line-3')).toBe(true);
    expect(carrier.lineIndex).toBe(1);
  });

  it('**zeigt** die Unterscheidung Kopie/Referenz am Träger, statt sie heimlich zu wählen', () => {
    const carrier = carrierOf();
    expect([...carrier.intents]).toEqual(['COPY', 'LIVE_REFERENCE']);
    expect([...NOTES_CARRIER_INTENTS]).toEqual(['COPY', 'LIVE_REFERENCE']);
    // **Keine zweite Vokabel:** jede angebotene Absicht stammt aus der **vorhandenen** Absichtsliste (Paket 4).
    expect(NOTES_CARRIER_INTENTS.every((intent) => WORKSPACE_DROP_INTENTS.includes(intent))).toBe(true);
    // Und die angebotenen Absichten stehen **im** Träger — wer ihn liest, sieht beide.
    const parsed = JSON.parse(carrier.payload) as { descriptor: { supportedIntents: string[] } };
    expect(parsed.descriptor.supportedIntents).toEqual(['COPY', 'LIVE_REFERENCE']);
  });

  it('ist eingefroren — ein Träger ist eine Tatsache, kein Formular', () => {
    const carrier = carrierOf();
    expect(Object.isFrozen(carrier)).toBe(true);
    expect(Object.isFrozen(NOTES_CARRIER_INTENTS)).toBe(true);
  });
});

describe('Notes · Paket 21 — fail-closed: jeder unbrauchbare Absatz hat einen **Namen**', () => {
  const faelle: readonly (readonly [string, NotesCarrierRefusal, Partial<NotesCarrierRequest>])[] = [
    ['kein Dokument', 'notes-carrier-document-missing', { document: null }],
    ['falsche Dokumentart', 'notes-carrier-document-kind-invalid', { document: { ...notesDocument, kind: 'Writer' } }],
    ['keine Seite', 'notes-carrier-page-missing', { page: null }],
    ['Seite ohne Kennung', 'notes-carrier-page-missing', { page: { ...page, id: '' } }],
    ['Seite im Papierkorb', 'notes-carrier-page-trashed', { page: { ...page, trashedAt: 5 } }],
    ['**gesperrte** Seite', 'notes-carrier-page-locked', { locked: true }],
    ['Zeile außerhalb', 'notes-carrier-line-invalid', { lineIndex: 99 }],
    ['negative Zeile', 'notes-carrier-line-invalid', { lineIndex: -1 }],
    ['keine Zahl', 'notes-carrier-line-invalid', { lineIndex: '1' }],
    ['leerer Absatz', 'notes-carrier-line-empty', { page: { ...page, content: 'a\n\nb' }, lineIndex: 1 }],
  ];

  for (const [name, reason, over] of faelle) {
    it(`lehnt ab und nennt den Grund: ${name}`, () => {
      const step = notesParagraphCarrier(request(over));
      expect(step.ok).toBe(false);
      expect(step.reason).toBe(reason);
      // **Kein stiller Erfolg:** es gibt **keinen** Träger — nicht einen leeren, nicht einen halben.
      expect(step.carrier).toBeUndefined();
      expect(notesCarrierRefusalText(reason).length).toBeGreaterThan(10);
    });
  }

  it('reicht den Code des **vorhandenen** Erzeugers durch, statt eine zweite Kennungsprüfung zu führen', () => {
    // Eine Kennung, die der vorhandene Erzeuger ablehnt (`assertStableWorkspaceId` über `identifier_invalid`).
    const step = notesParagraphCarrier(request({ page: { ...page, id: ' page 1 ' } }));
    expect(step.ok).toBe(false);
    expect(step.reason).toBe('identifier_invalid');
    // Und der Satz kommt aus dem Fehler **selbst** — keine zweite Wörterbuchzeile.
    expect(notesCarrierRefusalText('identifier_invalid')).toContain('identifier');
  });

  it('hat für jeden **eigenen** Grund einen sichtbaren Satz', () => {
    const own: readonly NotesCarrierRefusal[] = [
      'notes-carrier-document-missing', 'notes-carrier-document-kind-invalid', 'notes-carrier-page-missing',
      'notes-carrier-page-trashed', 'notes-carrier-page-locked', 'notes-carrier-line-invalid',
      'notes-carrier-line-empty', 'notes-carrier-key-unbound', 'notes-carrier-command-unknown',
    ];
    for (const code of own) {
      expect(notesCarrierRefusalText(code).length, code).toBeGreaterThan(10);
      expect(notesCarrierRefusalText(code), code).not.toBe(code);
    }
  });
});

describe('Notes · Paket 21 — die Tastatur ist **derselbe** Weg, kein Ersatz', () => {
  it('übersetzt Tasten und nennt ungebundene', () => {
    expect(resolveNotesCarrierCommand('Enter')).toEqual({ ok: true, command: { kind: 'carry' } });
    expect(resolveNotesCarrierCommand(' ')).toEqual({ ok: true, command: { kind: 'carry' } });
    expect(resolveNotesCarrierCommand('Escape')).toEqual({ ok: true, command: { kind: 'dismiss' } });
    expect(resolveNotesCarrierCommand('x')).toEqual({ ok: false, reason: 'notes-carrier-key-unbound' });
    expect(resolveNotesCarrierCommand(13)).toEqual({ ok: false, reason: 'notes-carrier-key-unbound' });
  });

  it('erzeugt über `carry` **denselben** Träger wie der Zeiger-Weg — kein zweiter Pfad', () => {
    const perTastatur = applyNotesCarrierCommand(request(), { kind: 'carry' });
    expect(perTastatur.ok).toBe(true);
    if (perTastatur.ok && perTastatur.kind === 'carried') {
      // **Gleichheit, nicht Ähnlichkeit:** beide Wege rufen `notesParagraphCarrier`.
      expect(perTastatur.carrier).toEqual(carrierOf());
    }
    expect(applyNotesCarrierCommand(request(), { kind: 'dismiss' })).toEqual({ ok: true, kind: 'dismissed' });
  });

  it('ist auch ohne Zeiger **fail-closed** — derselbe Grund, kein leerer Träger', () => {
    const gesperrt = applyNotesCarrierCommand(request({ locked: true }), { kind: 'carry' });
    expect(gesperrt).toEqual({ ok: false, reason: 'notes-carrier-page-locked' });
    expect(applyNotesCarrierCommand(request(), { kind: 'teleport' } as never))
      .toEqual({ ok: false, reason: 'notes-carrier-command-unknown' });
  });
});

// ## GEZOGEN (W-445) — AST-0737 hat die Einträge gesetzt ✓✓
//
// Hier stand der Übergangsmarker: *„Notes führt heute `exports: []` und Writer importiert keinen `TextBlock` — die
// Route ist quellenseitig offen"* ✓ — **gemessen und richtig für den Zustand vor AST-0737**. Die Einträge
// **(1)** Notes-Export, **(2)** Writer-Import `TextBlock`, **(3)** Adapter `fabric-notes-textblock-to-writer` stehen
// jetzt in der **einen** gesiegelten Matrix der Shell (`shell/fabric/fabricGraphWorkspaceDrop.ts`) ✓✓. Der Marker ist
// damit auf den **neuen** Zustand gezogen — **nicht** gelöscht und **nicht** gelockert ✓. *Die eine Ablehnung, die
// **bleibt** (die Identität der Quelle), wird im selben Block weiter mitgemessen und ist der Grund, warum dieser
// Vertrag nicht wertlos wird.*
describe('Notes · Paket 21 — der **gemessene** Produktionszustand gegen die gesiegelte Matrix', () => {
  it('Notes führt jetzt **aus**, Writer nimmt den `TextBlock` an — und die Route steht (AST-0737)', () => {
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Notes')?.exports)
      .toEqual([{ objectKind: 'TextBlock', intents: ['COPY'] }]);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Notes', 'Writer', 'TextBlock')).toEqual(['COPY']);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'TextBlock', 'COPY')?.id)
      .toBe('fabric-notes-textblock-to-writer');
    // GEZOGEN (W-445, Runde 123): Der EMPFÄNGER trägt die zweite Absicht jetzt — der Adapter ist
    // definiert. Vorher stand hier `toBeUndefined()`, und die Begründung war korrekt: Writer hatte
    // keinen Produktionsleser für `WorkspaceReference`. Seit `writerPrimaryTextProjection.ts` hat er
    // ihn, also ist die Zusicherung auf den neuen Zustand gezogen — nicht gelockert, nicht gelöscht.
    //
    // Die ABLEHNUNG bleibt trotzdem bestehen, und zwar an der QUELLE: Notes exportiert `TextBlock`
    // weiter NUR mit `['COPY']` (Zeile 237/238 oben, unverändert), sodass ein Live-Wunsch benannt
    // als `drop_intent_not_supported` abgelehnt wird statt still. Ein drittes Wort im Notes-Export
    // würde die Route zwei Absichten breit machen und die Zeiger-Ablage in
    // `drop_intent_choice_required` zwingen — das ist eine Eigentümerentscheidung.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'TextBlock', 'LIVE_REFERENCE')?.id)
      .toBe('fabric-notes-textblock-to-writer');
  });

  it('ein echter Notes-Träger ist deshalb ein **benannter** Fehlschlag — und der erste Grund ist die Identität', () => {
    const carrier = carrierOf();
    const documents = { [notesDocument.id]: notesDocument, [writerTarget.id]: writerTarget };
    const urteil = assessFabricWorkspaceDrop(carrier.payload, writerTarget.id, documents, { effect: 'Allow' });
    expect(urteil.status).toBe('rejected');
    // **Der Absatz ist kein Objekt des Notes-Dokuments** (gemessen: `objects: {}`) — der Resolver nennt das selbst.
    if (urteil.status === 'rejected') expect(urteil.code).toBe('drop_source_object_missing');
    const zustellung = resolveFabricWorkspaceDrop(carrier.payload, writerTarget.id, documents, 'COPY', undefined, { effect: 'Allow' });
    expect(zustellung.status).toBe('rejected');
    if (zustellung.status === 'rejected') expect(zustellung.code).toBe('drop_source_object_missing');
    // **Und der Träger ist trotzdem gebaut** ✓ — *der Erzeuger erfindet keine Route; er nennt die Referenz.*
    expect(carrier.payload).not.toContain(SECRET);
  });

  it('mit der Seite **als Objekt** stellt die vorhandene Matrix jetzt wirklich zu (AST-0737, gezogen)', () => {
    const carrier = carrierOf({ document: notesDocumentWithObject });
    const documents = { [notesDocumentWithObject.id]: notesDocumentWithObject, [writerTarget.id]: writerTarget };
    const urteil = assessFabricWorkspaceDrop(carrier.payload, writerTarget.id, documents, { effect: 'Allow' });
    // **Eine** Antwort, **zwei** Stufen: `accepted` ist das Angebot, `resolved` die Zustellung
    // (`workspaceInteractionResolver.ts:192-195`) — hier wird **beides** gemessen, nicht nur der Name.
    expect(urteil.status).toBe('accepted');
    if (urteil.status !== 'accepted') throw new Error(`Nicht angenommen: ${urteil.status}`);
    const zustellung = resolveFabricWorkspaceDrop(carrier.payload, writerTarget.id, documents, 'COPY', undefined, { effect: 'Allow' });
    expect(zustellung.status).toBe('resolved');
    if (zustellung.status !== 'resolved') throw new Error(`Nicht zugestellt: ${zustellung.status}`);
    expect(zustellung.selection).toEqual(urteil.selection);
    expect(zustellung.selection.adapterId).toBe('fabric-notes-textblock-to-writer');
    expect(zustellung.selection.integrationKind).toBe('copy');
  });

  it('die **Vokabeln** tragen: mit den fehlenden Einträgen stellt dieselbe Klasse wirklich zu (gemessen, nicht gesetzt)', () => {
    // **Welt B** — die wörtlichen Einträge, die der Eigentümer der Matrix setzen müsste. *Die Matrix selbst wird
    // hier nicht angefasst.*
    const registry = new WorkspaceInteractionRegistry();
    registry.registerAppManifest({ app: 'Grid', exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [] });
    registry.registerAppManifest({ app: 'Notes', exports: [{ objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] }], imports: [{ objectKind: 'Table', intents: ['COPY'] }] });
    registry.registerAppManifest({ app: 'Writer', exports: [], imports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }, { objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] }] });
    registry.registerAdapter({ id: 'fabric-notes-textblock-to-writer', targetApp: 'Writer', objectKinds: ['TextBlock'], intents: ['COPY', 'LIVE_REFERENCE'] });
    registry.seal();

    const carrier = carrierOf({ document: notesDocumentWithObject });
    const documents = { [notesDocumentWithObject.id]: notesDocumentWithObject, [writerTarget.id]: writerTarget };
    expect(registry.getCompatibleIntents('Notes', 'Writer', 'TextBlock')).toEqual(['COPY', 'LIVE_REFERENCE']);
    // **Kopie** — ohne Modus (Paket 15: eine Kopie trägt keinen).
    const kopie = resolveWorkspaceDropMit(registry, carrier.payload, 'COPY', documents);
    expect(kopie.status).toBe('resolved');
    if (kopie.status === 'resolved') {
      expect(kopie.selection.adapterId).toBe('fabric-notes-textblock-to-writer');
      expect(kopie.selection.integrationKind).toBe('copy');
      expect(kopie.selection.mode).toBeUndefined();
      expect(kopie.sourceVersion).toBe(notesDocumentWithObject.version);
      expect(kopie.targetVersion).toBe(writerTarget.version);
    }
    // **Referenz** — und der Modus wird **gesagt**, nie angenommen.
    const ohneModus = resolveWorkspaceDropMit(registry, carrier.payload, 'LIVE_REFERENCE', documents);
    expect(ohneModus.status).toBe('rejected');
    if (ohneModus.status === 'rejected') expect(ohneModus.code).toBe('drop_live_mode_required');
    for (const mode of ['Live', 'Frozen'] as const) {
      const mitModus = resolveWorkspaceDropMit(registry, carrier.payload, 'LIVE_REFERENCE', documents, mode);
      expect(mitModus.status, mode).toBe('resolved');
      if (mitModus.status === 'resolved') {
        expect(mitModus.selection.integrationKind, mode).toBe('live');
        expect(mitModus.selection.mode, mode).toBe(mode);
      }
    }
  });
});

/** Der Resolver mit **freier** Matrix — `resolveWorkspaceDrop` nimmt die Registry als Parameter (Paket 4). */
function resolveWorkspaceDropMit(
  registry: WorkspaceInteractionRegistry,
  payload: string,
  intent: string,
  documents: Readonly<Record<string, WorkspaceDocument>>,
  requestedMode?: unknown,
) {
  // **Kein zweiter Resolver:** dieselbe Funktion, nur mit der im Test gebauten Instanz **derselben** Klasse.
  return resolveWorkspaceDrop(
    {
      payload,
      targetDocumentId: writerTarget.id,
      requestedIntent: intent,
      documents,
      ...(requestedMode === undefined ? {} : { requestedMode }),
      // UEBERGANGSMARKER (W-455) in der **Pruefschicht**: dieser Vertrag bezeugt die **Route**, nicht die
      // Richtlinie ✓ — *der Resolver verlangt die Entscheidung der Administratorrichtlinie* ✓✓. *In der Produktion
      // holt die Shell sie asynchron* (`precheckPolicy`) *und reicht sie hinein* ✓. **Der Richtlinien-Zeuge ist ein
      // eigener Vertrag** ✓✓: `src/testing/shared/workspace-interaction/workspacePolicyDecisionGate.w455.contract.test.mjs`.
      requestedPolicyDecision: { effect: 'Allow' },
    },
    registry,
  );
}
