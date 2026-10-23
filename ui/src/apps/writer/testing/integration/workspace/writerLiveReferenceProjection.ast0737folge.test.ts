// STATUS: PLATIN — AST-0737 Folge: der Zeuge der **Leseregel** fuer einen gelieferten Workspace-Verweis
// und der **Schreibgrenze**, ohne die die Leseregel ein Nachweis auf Sand waere.
//
// ## Warum diese Datei existiert
//
// Der Vorgaenger (`AST-0737`) hat Notes → Writer gebaut und die **Live-Haelfte** bewusst nicht
// eingetragen, weil Writer einen `WorkspaceReference` nicht liest (`REPAIR_NOTES_WRITER_DRAGDROP_0737.md`,
// Abschnitt T2.9). Diese Datei faehrt die Uebergabe: **eine** Leseregel als Erweiterung der vorhandenen
// Projektion — und die Schreibgrenze, die dazugehoert.
//
// ## Was dieser Zeuge faehrt — **Wirkung, nicht Anwesenheit**
//
// Er faehrt den **Produktionsweg**:
//   Notes-Absatz → `planWorkspaceTransfer`/`applyWorkspaceTransfer` (Live) bzw. der Frozen-Zweig des
//   geteilten Einfügers → das Writer-Dokument → `projectWriterPrimaryText` **und** der **echte Hook**
//   `useWriterState` (per `renderToStaticMarkup`, mit demselben `window`-Polyfill wie
//   `writerHookWitnessFeasibility.defect.test.ts`: diese Umgebung hat kein jsdom, aber der
//   Server-Renderer ruft den Hook wirklich auf — **gemessen**, nicht angenommen).
//
// Gemessen wird **der Text**, nicht die Anwesenheit eines Objekts:
//   * `SECRET` muss **woertlich** in dem stehen, was der Editor liest (`state.paragraphs`),
//   * und der Verweis muss **nach einem Tastendruck** noch derselbe sein **und weiter aufloesen**.
//
// ## Was `NOT_TESTED` bleibt
//
// Die **Bedienung** — `dragstart`/`setData`, `dragenter`/`dragover`/`dragleave`/`drop`, Tastatur,
// Hover-/Fokus-/Disabled-Zustaende: `ui/package.json` fuehrt kein jsdom, kein happy-dom, kein
// @testing-library (gemessen). Gefahren wird die Strecke **hinter** dem Anschlag.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  NoteNotebook,
  NotePage,
  Paragraph,
  TextBlockObject,
  WorkspaceDocument,
  WorkspaceObject,
} from '../../../../../shared/contracts/workspace';
import { withNotesPageObjects } from '../../../../notes/model/notesPageObjects';
import {
  applyWorkspaceTransfer,
  planWorkspaceTransfer,
} from '../../../../../shared/workspace-interaction/fabricTransferOperations';
import { insertFromWorkspace } from '../../../../../shared/workspace-interaction/fabricReferenceOperations';
import { resolveFabricReference } from '../../../../../shared/workspace-interaction/fabricState';
import { applyTextFormat } from '../../../../../shared/workspace/operations/documentActions';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { planWriterTextBlockWrite } from '../../../persistence/writerTextBlockWrite';
import { useWriterState } from '../../../editor/useWriterState';
import { projectWriterPrimaryText } from '../../../editor/writerPrimaryTextProjection';

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { search: '', href: 'http://localhost/' },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    },
    writable: true,
    configurable: true,
  });
}

/** **Die Sonde:** dieser Inhalt muss in dem stehen, was der Editor liest — und er darf nicht raten. */
const SECRET = 'GEHEIMER-ABSATZ-INHALT-42';

/** Der Notes-Absatz, wie ihn die Notes-Flaeche baut (dieselbe Form wie im Vorgaengerzeugen). */
const page: NotePage = {
  id: 'page-1',
  title: 'Markdown-Absatz',
  content: `# Ueberschrift\n${SECRET}\n\nletzte Zeile`,
  tags: [],
  backlinks: [],
  last_modified: 1_700_000_000_000,
};
const notebook: NoteNotebook = { id: 'nb-1', title: 'Recherche', sections: [{ id: 'sec-1', title: 'S', pages: [page] }] };

const PAGE_TEXTS = ['Ueberschrift', SECRET, '', 'letzte Zeile'];

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

/** Das Notes-Dokument **mit** der Produktionsprojektion (`withNotesPageObjects`) — die Seite ist ein Objekt. */
function notesDocument(): WorkspaceDocument {
  return withNotesPageObjects({
    schema_version: 2, id: 'notes-quelle', title: 'Recherche', kind: 'Notes',
    created_at: 1, modified_at: 1, version: 5, theme_id: 'cosmic-obsidian',
    root_object_ids: [], objects: {}, notebooks: [notebook],
  });
}

/** Ein Writer-Ziel **ohne** eigenen TextBlock — die Form, in der eine Zustellung ankommt. */
function writerTarget(): WorkspaceDocument {
  return {
    schema_version: 2, id: 'writer-ziel', title: 'Writer Ziel', kind: 'Writer',
    created_at: 1, modified_at: 1, version: 4, theme_id: 'cosmic-obsidian',
    root_object_ids: [], objects: {},
  };
}

/** Ein Writer-Ziel **mit** eigenem TextBlock — die Form, in der der eigene Text gewinnen muss. */
function writerWithOwnText(): WorkspaceDocument {
  const base = writerTarget();
  const write = planWriterTextBlockWrite({ document: base, paragraphs: [paragraph('eigener-1', 'EIGENER-TEXT')] });
  if (!write) throw new Error('Der eigene TextBlock wurde nicht geplant.');
  return { ...base, root_object_ids: write.rootObjectIds, objects: write.objects };
}

function documentsOf(notes: WorkspaceDocument, writer: WorkspaceDocument): Record<string, WorkspaceDocument> {
  return { [notes.id]: notes, [writer.id]: writer };
}

/** Die Zustellung, die der Resolver als `resolved` benennt — ueber den **vorhandenen** Weg ausgefuehrt. */
function deliverLive(notes: WorkspaceDocument, writer: WorkspaceDocument, referenceId: string): WorkspaceDocument {
  const documents = documentsOf(notes, writer);
  const result = applyWorkspaceTransfer(
    documents,
    planWorkspaceTransfer(documents, notes.id, page.id, writer.id),
    'LiveLink',
    { targetObjectId: referenceId, now: 100 },
  );
  const delivered = result.updatedDocs[writer.id];
  if (!delivered) throw new Error('Die Zustellung hat kein Writer-Dokument geliefert.');
  return delivered;
}

/** Die **Frozen**-Zustellung: der geteilte Einfüger mit `mode: 'Frozen'` (der eingebettete Schnappschuss). */
function deliverFrozen(notes: WorkspaceDocument, writer: WorkspaceDocument, referenceId: string): WorkspaceDocument {
  const documents = documentsOf(notes, writer);
  const result = insertFromWorkspace(documents, writer.id, notes.id, page.id, {
    referenceId,
    mode: 'Frozen',
    expectedType: 'TextBlock',
    now: 101,
  });
  const delivered = result.updatedDocs[writer.id];
  if (!delivered) throw new Error('Die Frozen-Zustellung hat kein Writer-Dokument geliefert.');
  return delivered;
}

/**
 * **Der Editor selbst** — der echte Hook, per Server-Renderer aufgerufen.
 *
 * Das ist der Unterschied zu einem Zeugen, der die Leseregel **nachbaut**: hier laeuft
 * `useWriterState` mit allen 56 Hook-Aufrufen, und gelesen wird `state.paragraphs` — genau das, was
 * die Oberflaeche rendert.
 */
function editorReads(document: WorkspaceDocument, known: readonly WorkspaceDocument[]): string[] {
  const captured: { texts: string[] | null } = { texts: null };
  const Probe = (): null => {
    const state = useWriterState(document, () => undefined, known);
    captured.texts = state.paragraphs.flatMap((entry) => entry.spans.map((span) => span.text));
    return null;
  };
  renderToStaticMarkup(React.createElement(Probe));
  const texts = captured.texts;
  if (texts === null) throw new Error('Der Editor-Hook hat nicht gelesen.');
  return texts;
}

/**
 * **Ein Buchstabe getippt** — der **echte** Schreibplan, gespeist aus der Projektion.
 *
 * Genau der Weg, den `useWriterPersistence.persistParagraphs` nimmt (`useWriterPersistence.ts:149-169`):
 * `planWriterTextBlockWrite({ document, primaryTextBlockId, existingTextBlock, paragraphs })`.
 */
function typeOneLetter(document: WorkspaceDocument, documents: Record<string, WorkspaceDocument>): WorkspaceDocument {
  const projection = projectWriterPrimaryText(document, documents);
  const typed: Paragraph[] = projection.paragraphs.length > 0
    ? projection.paragraphs.map((entry) => ({ ...entry }))
    : [paragraph('tipp-1', '')];
  const first = typed[0];
  if (first) typed[0] = { ...first, spans: [...first.spans, { text: 'X' }] };
  const write = planWriterTextBlockWrite({
    document,
    primaryTextBlockId: projection.writeTextBlockId,
    existingTextBlock: projection.writeTextBlock,
    paragraphs: typed,
  });
  if (!write) throw new Error('Der Schreibplan ist leer geblieben.');
  return { ...document, version: document.version + 1, root_object_ids: write.rootObjectIds, objects: write.objects };
}

/**
 * **Die abgeloeste Regel, woertlich** (der Ist-Stand vor dieser Aenderung):
 * `root_object_ids.find((id) => objects[id]?.type === 'TextBlock') || root_object_ids[0]`,
 * danach `objects[id].data` mit Cast. Sie steht hier als **Gegenprobe**, damit der Unterschied
 * zwischen „vorher" und „nachher" in **einem** Lauf sichtbar ist.
 */
function abolishedWriteTarget(document: WorkspaceDocument): { id: string | undefined; paragraphs: Paragraph[] } {
  const id = document.root_object_ids.find((candidate) => document.objects[candidate]?.type === 'TextBlock')
    ?? document.root_object_ids[0];
  const data = id ? document.objects[id]?.data : undefined;
  const paragraphs = data && 'paragraphs' in data && Array.isArray(data.paragraphs) ? data.paragraphs : [];
  return { id, paragraphs };
}

function objectOf(document: WorkspaceDocument, id: string): WorkspaceObject | undefined {
  return document.objects[id];
}

function textBlockData(object: WorkspaceObject | undefined): TextBlockObject | null {
  return object && object.type === 'TextBlock' ? object.data : null;
}

describe('AST-0737 Folge · Writer liest den gelieferten Verweis — und schreibt ihn nicht kaputt', () => {
  it('1 · SCHREIBGRENZE: ein Buchstabe getippt — der Verweis steht noch, und er loest weiter auf', () => {
    // (a) LIVE
    const notes = notesDocument();
    const liveWriter = deliverLive(notes, writerTarget(), 'verweis-live-1');
    const liveDocuments = documentsOf(notes, liveWriter);
    const afterLive = typeOneLetter(liveWriter, liveDocuments);

    const liveObject = objectOf(afterLive, 'verweis-live-1');
    // **Die Wirkung:** das Objekt an der Verweis-Kennung ist **noch** ein Verweis — kein TextBlock.
    expect(liveObject?.type).toBe('WorkspaceReference');
    if (liveObject?.type === 'WorkspaceReference') {
      expect(liveObject.data.expected_type).toBe('TextBlock');
      expect(liveObject.data.mode).toBe('Live');
      expect(liveObject.data.uri).toBe('vgt://workspace/document/notes-quelle/object/page-1');
    }
    // Der getippte Text landete in **einem eigenen**, kanonischen Block — nicht im Verweis.
    expect(textBlockData(objectOf(afterLive, 'tb-writer-ziel'))).not.toBeNull();
    expect(afterLive.root_object_ids).toContain('tb-writer-ziel');
    expect(afterLive.root_object_ids).toContain('verweis-live-1');
    // **Und er loest weiter auf**: die Quelle liefert ihren Absatz noch, woertlich.
    const resolution = resolveFabricReference(
      { ...liveDocuments, [afterLive.id]: afterLive },
      afterLive.id,
      'verweis-live-1',
    );
    const resolved = textBlockData(resolution.sourceObject);
    expect(resolved?.paragraphs.flatMap((entry) => entry.spans.map((span) => span.text))).toEqual(PAGE_TEXTS);

    // (b) FROZEN — hier traegt der Verweis selbst den Inhalt; „hat er ihn noch?" ist messbar.
    const frozenWriter = deliverFrozen(notesDocument(), writerTarget(), 'verweis-frozen-1');
    const frozenDocuments = documentsOf(notesDocument(), frozenWriter);
    const afterFrozen = typeOneLetter(frozenWriter, frozenDocuments);
    const frozenObject = objectOf(afterFrozen, 'verweis-frozen-1');
    expect(frozenObject?.type).toBe('WorkspaceReference');
    const frozenEmbedded = frozenObject?.type === 'WorkspaceReference' ? textBlockData(frozenObject.data.cached_snapshot) : null;
    expect(frozenEmbedded?.paragraphs.flatMap((entry) => entry.spans.map((span) => span.text))).toEqual(PAGE_TEXTS);
    expect(textBlockData(objectOf(afterFrozen, 'tb-writer-ziel'))).not.toBeNull();

    // (c) **Die Gegenprobe**: die abgeloeste Regel hatte genau diesen Verweis als Schreibziel und
    // ersetzte ihn an derselben Kennung durch einen TextBlock.
    const abolished = abolishedWriteTarget(liveWriter);
    expect(abolished.id).toBe('verweis-live-1');
    expect(abolished.paragraphs).toEqual([]);
    const abolishedWrite = planWriterTextBlockWrite({
      document: liveWriter,
      primaryTextBlockId: abolished.id,
      existingTextBlock: textBlockData(objectOf(liveWriter, 'verweis-live-1')) ?? undefined,
      paragraphs: [paragraph('tipp-1', 'X')],
    });
    expect(abolishedWrite?.objects['verweis-live-1']?.type).toBe('TextBlock');
  });

  it('2 · LESEREGEL (Live): der Editor liest den Notes-Absatz WOERTLICH', () => {
    const notes = notesDocument();
    const delivered = deliverLive(notes, writerTarget(), 'verweis-live-1');
    // Die Gegenprobe zuerst: der Inhalt steht **nirgends** im Writer-Dokument.
    expect(JSON.stringify(delivered)).not.toContain(SECRET);

    // **Und der echte Editor liest ihn** — ueber den Hook, nicht ueber eine nachgebaute Regel.
    expect(editorReads(delivered, [notes, delivered])).toEqual(PAGE_TEXTS);
    // Dieselbe Aussage an der reinen Projektion: der Verweis ist die **Quelle des Textes**.
    const projection = projectWriterPrimaryText(delivered, documentsOf(notes, delivered));
    expect(projection.paragraphs.flatMap((entry) => entry.spans.map((span) => span.text))).toEqual(PAGE_TEXTS);
    expect(projection.borrowedText?.referenceId).toBe('verweis-live-1');
    expect(projection.borrowedText?.sourceDocumentId).toBe('notes-quelle');
    expect(projection.borrowedText?.sourceObjectId).toBe('page-1');
    // Und **kein** Schreibziel: der Verweis ist nie das Ziel (die Invariante).
    expect(projection.writeTextBlockId).toBeUndefined();
  });

  it('3 · GEGENPROBE: ohne die bekannten Dokumente bleibt es bei [] — benannt, nicht still ersetzt', () => {
    const notes = notesDocument();
    const delivered = deliverLive(notes, writerTarget(), 'verweis-live-1');
    // Der Live-Verweis traegt **keinen** Inhalt (gemessen: `cached_snapshot` gibt es nur bei Frozen).
    const object = objectOf(delivered, 'verweis-live-1');
    expect(object?.type === 'WorkspaceReference' ? object.data.cached_snapshot : 'n/a').toBeUndefined();
    // Also: **ohne** die Dokumente nichts — und der Editor behauptet auch nichts.
    expect(editorReads(delivered, [delivered])).toEqual([]);
    expect(projectWriterPrimaryText(delivered).paragraphs).toEqual([]);
  });

  it('4 · LESEREGEL (Frozen): der eingebettete Schnappschuss traegt den Absatz — ohne Quelldokument', () => {
    const delivered = deliverFrozen(notesDocument(), writerTarget(), 'verweis-frozen-1');
    expect(editorReads(delivered, [delivered])).toEqual(PAGE_TEXTS);
    const projection = projectWriterPrimaryText(delivered);
    expect(projection.paragraphs.flatMap((entry) => entry.spans.map((span) => span.text))).toEqual(PAGE_TEXTS);
    expect(projection.borrowedText?.mode).toBe('Frozen');
    expect(projection.writeTextBlockId).toBeUndefined();
  });

  it('5 · REIHENFOLGE: der eigene TextBlock gewinnt gegen einen Verweis, der VOR ihm liegt', () => {
    const notes = notesDocument();
    const own = writerWithOwnText();
    // Ein Verweis **vor** dem eigenen Block: die Projektion darf den eigenen Text nicht verdecken.
    const withReferenceFirst: WorkspaceDocument = {
      ...own,
      root_object_ids: ['verweis-vor-1', ...own.root_object_ids],
      objects: { ...own.objects },
    };
    const documents = documentsOf(notes, withReferenceFirst);
    const result = insertFromWorkspace(documents, withReferenceFirst.id, notes.id, page.id, {
      referenceId: 'verweis-vor-1',
      mode: 'Live',
      expectedType: 'TextBlock',
      now: 102,
    });
    const delivered = result.updatedDocs[withReferenceFirst.id];
    if (!delivered) throw new Error('Der Verweis wurde nicht eingefuegt.');
    expect(delivered.root_object_ids[0]).toBe('verweis-vor-1');
    const projection = projectWriterPrimaryText(delivered, documentsOf(notes, delivered));
    expect(projection.writeTextBlockId).toBe('tb-writer-ziel');
    expect(projection.paragraphs.flatMap((entry) => entry.spans.map((span) => span.text))).toEqual(['EIGENER-TEXT']);
    expect(editorReads(delivered, [notes, delivered])).toEqual(['EIGENER-TEXT']);
  });

  it('6 · KEIN TEXTBLOCK IM VERWEIS: ein angekuendigter Table-Verweis wird nicht als Text gelesen', () => {
    const notes = notesDocument();
    const base = writerTarget();
    // Ein Verweis, der **nicht** `'TextBlock'` ankuendigt: er faellt durch die Leseregel.
    const foreign: WorkspaceObject = {
      type: 'WorkspaceReference',
      data: {
        id: 'verweis-table-1',
        uri: 'vgt://workspace/document/notes-quelle/object/page-1',
        mode: 'Frozen',
        expected_type: 'Table',
        cached_snapshot: { type: 'TextBlock', data: { id: 'page-1', paragraphs: [paragraph('p1', SECRET)] } },
      },
    };
    const document: WorkspaceDocument = {
      ...base,
      root_object_ids: ['verweis-table-1'],
      objects: { 'verweis-table-1': foreign },
    };
    const projection = projectWriterPrimaryText(document, documentsOf(notes, document));
    expect(projection.paragraphs).toEqual([]);
    expect(projection.borrowedText).toBeNull();
    expect(projection.writeTextBlockId).toBeUndefined();
    expect(editorReads(document, [notes, document])).toEqual([]);
  });

  it('7 · DIE KETTE: anlegen → lesen → vergleichen → Zustand verwerfen → wiederherstellen → wieder vergleichen', () => {
    const firstNotes = notesDocument();
    const firstWriter = deliverLive(firstNotes, writerTarget(), 'verweis-live-1');
    const firstRead = editorReads(firstWriter, [firstNotes, firstWriter]);
    expect(firstRead).toEqual(PAGE_TEXTS);

    // **Zustand verworfen**: alles aus dem ersten Durchgang wird nicht weiterverwendet; die Quelle
    // wird aus der Vorlage **neu** gebaut (keine Referenz auf den ersten Lauf).
    const secondNotes = notesDocument();
    const secondWriter = deliverLive(secondNotes, writerTarget(), 'verweis-live-1');
    const secondRead = editorReads(secondWriter, [secondNotes, secondWriter]);
    expect(secondRead).toEqual(PAGE_TEXTS);
    // Wortgleich **und** zustandsgleich: die Zustellung ist reproduzierbar, nicht zufaellig.
    expect(secondRead).toEqual(firstRead);
    expect(JSON.stringify(secondWriter)).toBe(JSON.stringify(firstWriter));
  });

  it('8 · FREMDSPUR (dieselbe Klasse, shared/ NICHT angefasst): der Shell-Formatierer zielt auf den Verweis', () => {
    // **Gemessener Ist-Stand, nicht meine Zusicherung an shared/:** `applyTextFormat`
    // (`ui/src/shared/workspace/operations/documentActions.ts:14-93`) waehlt den Primaertext mit
    // **derselben** abgeloesten Regel (`find(TextBlock) || root_object_ids[0]`) und castet `data`.
    // Bei einem Verweis als `root[0]` ist `data.paragraphs` nicht vorhanden -> `[...undefined]`.
    // **Diese Zusicherung ist zu ZIEHEN, sobald `shared/` dort repariert wird** (W-445): sie haelt
    // den Ist-Stand fest, damit die Klasse sichtbar ist — sie ist **kein** Wunschzustand.
    const notes = notesDocument();
    const delivered = deliverLive(notes, writerTarget(), 'verweis-live-1');
    expect(() => applyTextFormat(delivered, 'bold')).toThrowError(TypeError);
  });

  it('9 · DIE ZWEI WOERTER: Ziel-Import und Adapter fuehren LIVE_REFERENCE — die Route aber (noch) nicht', () => {
    // **Die Wirkung der zwei Woerter**, nicht ihre Anwesenheit: der Empfaenger kann die Absicht
    // fuehren, und der Adapter ist fuer sie da.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Writer')?.imports)
      .toContainEqual({ objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] });
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'TextBlock', 'LIVE_REFERENCE')?.id)
      .toBe('fabric-notes-textblock-to-writer');

    // **Und die gemessene Grenze, die bleibt:** eine Route braucht **drei** Seiten
    // (`workspaceInteractionRegistry.ts:160-163`: Quelle ∩ Ziel ∩ Adapter). Notes **exportiert**
    // `'TextBlock'` mit `['COPY']` (`fabricGraphWorkspaceDrop.ts:232`) — also entsteht fuer
    // `LIVE_REFERENCE` **keine** Route, und die Kopie-Route bleibt unberuehrt:
    //   * `getCompatibleIntents` ist unveraendert `['COPY']` (die Zeiger-Ablage bleibt Form A),
    //   * der Live-Verweis wird weiter **benannt** abgelehnt (`drop_intent_not_supported`).
    // **Diese zwei Zusicherungen sind UEBERGANGSMARKER (W-445):** sobald der Eigentuemer den
    // Notes-Export um `'LIVE_REFERENCE'` erweitert (dann wird die Route **zwei** Absichten breit und
    // die Zeiger-Ablage landet in der Auswahlphase `drop_intent_choice_required` — Paket 15), sind
    // sie auf den neuen Zustand zu **ziehen**, nicht zu loeschen und nicht zu lockern.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Notes', 'Writer', 'TextBlock')).toEqual(['COPY']);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Notes')?.exports)
      .toEqual([{ objectKind: 'TextBlock', intents: ['COPY'] }]);
  });
});
