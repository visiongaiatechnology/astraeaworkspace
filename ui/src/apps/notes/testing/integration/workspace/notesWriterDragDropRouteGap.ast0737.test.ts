// STATUS: PLATIN — Notes · **AST-0737**: der Zeuge der Fahrt Notes-Absatz → Writer.
//
// ## Diese Datei ist GEZOGEN, nicht gelöscht und nicht gelockert (W-445)
//
// Sie war der **Übergangsmarker** des gestoppten Auftrags: sie hielt den Falschzustand fest („Notes führt
// `exports: []`, Writer importiert `TextBlock` nicht, es gibt keinen Adapter → `registry_adapter_route_missing`")
// und sagte in ihrem eigenen Kopf genau das: *„kommen die externen Einträge, wird dieser Zeuge **rot** und **muss**
// auf den neuen, grünen Zustand gezogen werden (dann ersetzt ein `resolved`-Nachweis die drei Ablehnungen unten)."*
//
// Genau das ist hier geschehen. Die Einträge (1) Notes-Export, (2) Writer-Import `TextBlock`, (3) der Adapter
// `fabric-notes-textblock-to-writer` stehen jetzt in der **einen** gesiegelten Matrix der Shell
// (`shell/fabric/fabricGraphWorkspaceDrop.ts`) — **erweitert**, nicht danebengestellt. Die drei Ablehnungen sind
// durch den **Zustellungsnachweis** ersetzt; die eine Ablehnung, die **bleibt**, ist die der **zweiten Hälfte**
// (Live-Verweis) und sie ist **begründet gemessen** (Fall 6) — nicht stillschweigend weggelassen.
//
// ## Was dieser Zeuge fährt — Wirkung, nicht Anwesenheit
//
// Er fährt den Notes-Absatz durch die **Produktionsprojektion** `withNotesPageObjects` (Runde 93) und dann durch
// die **echte, gesiegelte** Matrix (`FABRIC_WORKSPACE_DROP_REGISTRY`). Gemessen wird:
//   * dass der **Träger der Shell** entsteht (vorher: `null`),
//   * dass der Resolver **zustellt** statt abzulehnen,
//   * und — der Kern — dass der Absatztext **wirklich ankommt**: die Ablage wird anschließend über den
//     **vorhandenen** Zustellweg (`planWorkspaceTransfer` / `applyWorkspaceTransfer`) ausgeführt, und die
//     **Leseregel des Writer-Editors selbst** (`useWriterState.ts:181-186`) wird auf das Ergebnis angewandt.
//     *Ein Zeuge, der nur `resolved` prüft, würde bei „Element behalten, Wirkung entfernt" grün bleiben.*
//
// ## Was hier `NOT_TESTED` bleibt
//
// Das **Binden** des Zuges (`dragstart` → `dataTransfer.setData`), `dragenter`/`dragover`/`dragleave`/`drop` über
// der Writer-Fläche und die Tastatur. `ui/package.json` führt **kein** jsdom, kein happy-dom, kein
// @testing-library (gemessen) — es gibt keine Ereignisse, also ist die **Bedienung** `NOT_TESTED`.
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument, WorkspaceObject } from '../../../../../shared/contracts/workspace';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
  assessFabricWorkspaceDrop,
  createFabricWorkspaceObjectDragPayload,
  resolveFabricWorkspaceDrop,
} from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  applyWorkspaceTransfer,
  planWorkspaceTransfer,
} from '../../../../../shared/workspace-interaction/fabricTransferOperations';
import { notesParagraphCarrier } from '../../../integrations/notesParagraphCarrier';
import { withNotesPageObjects } from '../../../model/notesPageObjects';

/** **Die Sonde:** dieser Inhalt darf im **Träger** nicht auftauchen — und muss in der **Zustellung** ankommen. */
const SECRET = 'GEHEIMER-ABSATZ-INHALT-42';

const page: NotePage = {
  id: 'page-1',
  title: 'Markdown-Absatz',
  content: `# Überschrift\n${SECRET}\n\nletzte Zeile`,
  tags: [],
  backlinks: [],
  last_modified: 1_700_000_000_000,
};

const notebook: NoteNotebook = {
  id: 'nb-1',
  title: 'Recherche',
  sections: [{ id: 'sec-1', title: 'S', pages: [page] }],
};

/**
 * Das Notes-Dokument **vor** der Projektion — der gemessene Zustand vor Runde 93 (`objects: {}`).
 * Er wird in Fall 5 als **Gegenprobe** mitgefahren, damit die Ursache im selben Lauf sichtbar bleibt.
 */
function notesWithoutObjects(): WorkspaceDocument {
  return {
    schema_version: 2, id: 'notes-quelle', title: 'Recherche', kind: 'Notes',
    created_at: 1, modified_at: 1, version: 5, theme_id: 'cosmic-obsidian',
    root_object_ids: [], objects: {}, notebooks: [notebook],
  };
}

/** Und dasselbe Dokument **mit** der Produktionsprojektion — die Seite steht als Objekt darin. */
function notesDocument(): WorkspaceDocument {
  return withNotesPageObjects(notesWithoutObjects());
}

/** Ein Writer-Ziel **ohne** eigenes TextBlock — die Form, in der die Zustellung ankommt. */
function writerTarget(): WorkspaceDocument {
  return {
    schema_version: 2, id: 'writer-ziel', title: 'Writer Ziel', kind: 'Writer',
    created_at: 1, modified_at: 1, version: 4, theme_id: 'cosmic-obsidian',
    root_object_ids: [], objects: {},
  };
}

/**
 * **Die Leseregel des Writer-Editors, wörtlich** (`apps/writer/editor/useWriterState.ts:181-186`):
 * `document.root_object_ids.find((id) => document.objects[id]?.type === 'TextBlock') || root_object_ids[0]`,
 * danach `document.objects[primaryTextBlockId]?.data`.
 *
 * Sie steht hier **einmal** und wird nach der Zustellung angewandt — *so misst dieser Zeuge nicht „steht etwas im
 * Dokument?", sondern „liest Writer es?".*
 */
function writerReads(document: WorkspaceDocument): { readonly id: string | undefined; readonly texts: readonly string[] } {
  const id = document.root_object_ids.find((candidate) => document.objects[candidate]?.type === 'TextBlock')
    ?? document.root_object_ids[0];
  const object: WorkspaceObject | undefined = id === undefined ? undefined : document.objects[id];
  const texts = object?.type === 'TextBlock'
    ? object.data.paragraphs.flatMap((paragraph) => paragraph.spans.map((span) => span.text))
    : [];
  return { id, texts };
}

/** Der Träger des **Notes-Erzeugers** — die Quellenseite, wie die Notes-Fläche sie baut. */
function notesCarrier(document: WorkspaceDocument) {
  const step = notesParagraphCarrier({ document, page, lineIndex: 1 });
  if (!step.ok) throw new Error(`Träger fehlt: ${step.reason}`);
  return step.carrier;
}

function documentsOf(notes: WorkspaceDocument, writer: WorkspaceDocument): Record<string, WorkspaceDocument> {
  return { [notes.id]: notes, [writer.id]: writer };
}

describe('AST-0737 · die Fahrt Notes-Absatz → Writer', () => {
  it('1 · die **Quelle** führt die Objektart — und der Träger der Shell entsteht', () => {
    const notes = notesDocument();
    // Die eine Autorität, wörtlich gelesen: Notes führt **genau einen** Export, die Objektart des Absatzes.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Notes')?.exports)
      .toEqual([{ objectKind: 'TextBlock', intents: ['COPY'] }]);

    const pageObject = notes.objects[page.id];
    if (!pageObject) throw new Error('Die Produktionsprojektion hat kein Seitenobjekt geliefert.');
    // **Die Wirkung:** der Erzeuger der Shell (den `FabricGraphModal` benutzt) liefert jetzt einen Träger —
    // vorher lieferte er `null`, weil Notes nichts ausführte (`fabricGraphWorkspaceDrop.ts:269-272`).
    const payload = createFabricWorkspaceObjectDragPayload(notes, pageObject);
    if (payload === null) throw new Error('Der Erzeuger der Shell liefert weiterhin `null`.');
    const descriptor = JSON.parse(payload) as { descriptor: Record<string, unknown> };
    expect(descriptor.descriptor).toMatchObject({
      documentId: notes.id,
      objectId: page.id,
      objectKind: 'TextBlock',
      sourceApp: 'Notes',
      supportedIntents: ['COPY'],
    });
    // Eine Referenz, keine Kopie: der Absatztext fährt **nicht** mit.
    expect(payload).not.toContain(SECRET);
  });

  it('2 · der **Empfänger** Writer nimmt die Objektart an — und der Tisch-Import bleibt unberührt', () => {
    const imports = FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Writer')?.imports ?? [];
    // GEZOGEN (W-445, Runde 118): Writer nimmt die Objektart jetzt mit BEIDEN Absichten an.
    // Vorher stand hier `['COPY']` — das hielt den Falschzustand fest, in dem die zweite
    // Hälfte des Vertrags fehlte, obwohl der Leser sie seit `writerPrimaryTextProjection.ts`
    // führt. Nicht gelockert: die Zusicherung prüft weiter die VOLLE Absichtsliste.
    expect(imports).toContainEqual({ objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] });
    // Der vorhandene Eintrag wird **erweitert**, nicht ersetzt (ein zweiter `registerAppManifest` würde werfen).
    expect(imports).toContainEqual({ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] });
  });

  it('3 · die **Route** entsteht — und sie hat **genau einen** Adapter', () => {
    // UNVERÄNDERT, und das ist gemessen: Notes exportiert `TextBlock` weiter NUR mit `['COPY']`
    // (`fabricGraphWorkspaceDrop.ts:232`). Ein drittes Wort im Notes-Export würde die Route zwei
    // Absichten breit machen und die Zeiger-Ablage in `drop_intent_choice_required` zwingen —
    // das ist eine Eigentümerentscheidung, keine des ziehenden Auftrags.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Notes', 'Writer', 'TextBlock')).toEqual(['COPY']);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'TextBlock', 'COPY')?.id)
      .toBe('fabric-notes-textblock-to-writer');
    // GEZOGEN (W-445, Runde 118): der Adapter für die zweite Absicht ist jetzt DEFINIERT.
    // Vorher stand hier `toBeUndefined()` — der letzte Marker des Falschzustands.
    // Die Zustellung selbst bleibt trotzdem abgelehnt, weil die QUELLE die Absicht nicht
    // anbietet; das misst Fall 6, und dieser Grund ist unverändert gültig.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'TextBlock', 'LIVE_REFERENCE')?.id)
      .toBe('fabric-notes-textblock-to-writer');
  });

  it('4 · die **Zustellung** wird nicht mehr abgelehnt — und die Frage sagt dasselbe wie die Zustellung', () => {
    const notes = notesDocument();
    const writer = writerTarget();
    const documents = documentsOf(notes, writer);
    const carrier = notesCarrier(notes);
    // Eine MIME-Art — die vorhandene, keine zweite.
    expect(carrier.mime).toBe(FABRIC_WORKSPACE_OBJECT_DRAG_MIME);

    const frage = assessFabricWorkspaceDrop(carrier.payload, writer.id, documents, { effect: 'Allow' });
    const zustellung = resolveFabricWorkspaceDrop(carrier.payload, writer.id, documents, 'COPY', undefined, { effect: 'Allow' });
    // **Eine** Antwort, **zwei** Stufen — und der Unterschied ist Absicht, nicht Zufall
    // (`workspaceInteractionResolver.ts:192-195`): `accepted` ist das **Angebot**, `resolved` die **Zustellung**.
    expect(frage.status).toBe('accepted');
    if (frage.status !== 'accepted') throw new Error(`Nicht angenommen: ${frage.status}`);
    expect(zustellung.status).toBe('resolved');
    if (zustellung.status !== 'resolved') throw new Error(`Nicht zugestellt: ${zustellung.status}`);
    // **Dieselbe** Auswahl — die Zustellung erfindet keine zweite.
    expect(zustellung.selection).toEqual(frage.selection);
    expect(zustellung.selection.adapterId).toBe('fabric-notes-textblock-to-writer');
    expect(zustellung.selection.integrationKind).toBe('copy');
    expect(zustellung.selection.objectKind).toBe('TextBlock');
    expect(zustellung.selection.sourceObjectId).toBe(page.id);
    // Paket 15: eine **Kopie** trägt **keinen** Modus — abwesend, nicht `undefined`.
    expect(Object.prototype.hasOwnProperty.call(zustellung.selection, 'mode')).toBe(false);
    expect(zustellung.sourceVersion).toBe(notes.version);
    expect(zustellung.targetVersion).toBe(writer.version);
  });

  it('5 · **die Wirkung:** der Absatz kommt im Writer-Dokument TATSAECHLICH an — gemessen an Writers eigener Leseregel', () => {
    const notes = notesDocument();
    const writer = writerTarget();
    const documents = documentsOf(notes, writer);

    // **Die Gegenprobe zuerst:** vor der Ablage steht der Absatztext **nirgends** im Writer-Dokument.
    expect(JSON.stringify(writer)).not.toContain(SECRET);
    expect(writerReads(writer).texts).toEqual([]);

    // Dieselbe Zustellung, die der Resolver als `resolved` benennt, wird über den **vorhandenen** Weg ausgeführt.
    const plan = planWorkspaceTransfer(documents, notes.id, page.id, writer.id);
    expect(plan.sourceType).toBe('TextBlock');
    const result = applyWorkspaceTransfer(documents, plan, 'PasteCopy', { targetObjectId: 'notes-absatz-1', now: 100 });
    const delivered = result.updatedDocs[writer.id];
    if (!delivered) throw new Error('Die Zustellung hat kein Writer-Dokument geliefert.');

    // (a) Das Objekt **ist** da — und es ist die Objektart, die die Route verspricht.
    expect(delivered.objects['notes-absatz-1']?.type).toBe('TextBlock');
    expect(delivered.root_object_ids).toContain('notes-absatz-1');
    // (b) Der Inhalt ist der Absatz — **nicht** der Ersatz, sondern die Zeilen der Seite.
    const deliveredObject = delivered.objects['notes-absatz-1'];
    const deliveredTexts = deliveredObject?.type === 'TextBlock'
      ? deliveredObject.data.paragraphs.flatMap((paragraph) => paragraph.spans.map((span) => span.text))
      : [];
    expect(deliveredTexts.join('\n')).toContain(SECRET);
    // (c) **Und Writer liest es**: die Leseregel des Editors liefert genau dieses Objekt mit genau diesem Text.
    const reads = writerReads(delivered);
    expect(reads.id).toBe('notes-absatz-1');
    expect(reads.texts.join('\n')).toContain(SECRET);
    // Und die Vorlage wurde **nicht** angefasst (Reinheit der Zustellung).
    expect(JSON.stringify(writer)).not.toContain(SECRET);
  });

  it('6 · die **andere** Hälfte ist benannt abgelehnt — und der Grund ist gemessen, nicht behauptet', () => {
    const notes = notesDocument();
    const writer = writerTarget();
    const documents = documentsOf(notes, writer);
    const carrier = notesCarrier(notes);

    // Der Träger **bietet** den Live-Verweis an (`notesParagraphCarrier.ts:76`) — die Matrix nimmt ihn nicht an.
    expect(carrier.intents).toContain('LIVE_REFERENCE');
    const verweis = resolveFabricWorkspaceDrop(carrier.payload, writer.id, documents, 'LIVE_REFERENCE', 'Live', { effect: 'Allow' });
    expect(verweis.status).toBe('rejected');
    if (verweis.status === 'rejected') {
      // **Benannt**, und zwar mit dem Grund der **Zielseite** — nicht mit „keine Route überhaupt".
      expect(verweis.code).toBe('drop_intent_not_supported');
    }

    // **Der gemessene Grund:** der vorhandene Live-Weg legt einen `WorkspaceReference` an. Writers Leseregel sucht
    // einen `TextBlock` — sie findet keinen, und `data.paragraphs` gibt es dort nicht. Ein Live-Verweis käme also
    // **im Dokument an** und wäre für den Writer-Editor **unsichtbar**:
    // `ui/src/apps/writer/**` hat **null** Produktionstreffer für `'WorkspaceReference'` (nur eine Test-Attrappe).
    const live = applyWorkspaceTransfer(
      documents,
      planWorkspaceTransfer(documents, notes.id, page.id, writer.id),
      'LiveLink',
      { targetObjectId: 'notes-verweis-1', now: 101 },
    );
    const withReference = live.updatedDocs[writer.id];
    if (!withReference) throw new Error('Der Live-Weg hat kein Writer-Dokument geliefert.');
    expect(withReference.objects['notes-verweis-1']?.type).toBe('WorkspaceReference');
    expect(writerReads(withReference).texts.join('\n')).not.toContain(SECRET);
    expect(writerReads(withReference).texts).toEqual([]);
  });

  it('7 · die Zustellung ist **keine** Nebenwirkung einer Anwesenheit: ohne Route bleibt sie aus', () => {
    // Dieselbe Ablage gegen das Dokument **ohne** Seitenobjekt: der Resolver bleibt bei der Identität stehen.
    const ohneObjekt = notesWithoutObjects();
    const writer = writerTarget();
    const documents = documentsOf(ohneObjekt, writer);
    const carrier = notesCarrier(ohneObjekt);
    const urteil = assessFabricWorkspaceDrop(carrier.payload, writer.id, documents, { effect: 'Allow' });
    expect(urteil.status).toBe('rejected');
    if (urteil.status === 'rejected') expect(urteil.code).toBe('drop_source_object_missing');
    // Und der Zustellweg selbst weigert sich ebenso — er findet das Quellobjekt nicht.
    expect(() => planWorkspaceTransfer(documents, ohneObjekt.id, page.id, writer.id))
      .toThrowError(/does not exist/u);
  });
});
