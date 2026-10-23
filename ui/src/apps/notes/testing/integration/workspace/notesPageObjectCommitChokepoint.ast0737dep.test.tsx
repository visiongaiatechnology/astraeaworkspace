// STATUS: PLATIN — Notes · **AST-0737-Abhängigkeit (4)**, die **Verdrahtung** des lebenden Dokuments
//
// ## Warum diese Datei nötig ist — obwohl die Projektion schon einen Zeugen hat
//
// `notesPageObjectLiveDocument.ast0737dep.test.ts` ruft `withNotesPageObjects` **direkt** auf. Damit ist bewiesen,
// dass die Funktion **richtig rechnet** — und **nicht**, dass die Anwendung sie **benutzt**. *Eine Funktion ohne
// Aufrufer ist die Krankheit, die dieses Projekt am häufigsten gejagt hat* (der Träger `notesParagraphCarrier` ist
// genau daran gescheitert). **Dieser Zeuge fährt den echten Durchlass** `useNotesCollaboration.commitDocument` und
// misst, was **beim Aufrufer ankommt**.
//
// ## Kein DOM — derselbe Weg wie die vorhandenen Hook-Zeugen
//
// `ui/package.json` führt **kein** jsdom, kein happy-dom, kein @testing-library (gemessen). Der vorhandene Zeuge
// `testing/tasks/notesTaskBindingReopen.test.tsx:32-88` führt Hooks deshalb über `renderToStaticMarkup` aus. *Dieser
// Zeuge tut dasselbe — kein neues Testgerüst, keine neue Abhängigkeit.*
//
// ## Gemessen wird die **Wirkung**, nicht die Anwesenheit
//
// Nicht „steht `withNotesPageObjects` im Quelltext?" (das wäre wertlos), sondern: **das Dokument, das der Aufrufer
// erhält, trägt die Seite als Objekt — und der Träger findet es.** *Die Anwesenheits-Falle dieser Sitzung: vier
// Anwesenheits-Zusicherungen blieben bei der Mutation grün; nur die Wirkungs-Zusicherungen wurden rot. Hier gibt es
// deshalb nur Wirkungs-Zusicherungen.*
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { assessFabricWorkspaceDrop, resolveFabricWorkspaceDrop } from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { createNotePageFromTemplate } from '../../../model/noteModel';
import { notesParagraphCarrier } from '../../../integrations/notesParagraphCarrier';
import { useNotesCollaboration } from '../../../collaboration/useNotesCollaboration';

const NOW = 1_700_000_000_000;

const page = { ...createNotePageFromTemplate('project', NOW, 'Durchlass'), content: 'Erste Zeile\nZweite Zeile' };
const notebook: NoteNotebook = { id: 'nb-durchlass', title: 'Durchlass', sections: [{ id: 'sec-durchlass', title: 'S', pages: [page] }] };

/** Das Dokument, wie es **vor** dem Durchlass aussieht: Notizbuch da, Seitenobjekte nicht. */
const document: WorkspaceDocument = {
  schema_version: 2, id: 'notes-durchlass', title: 'Durchlass', kind: 'Notes', created_at: 1, modified_at: 1, version: 1,
  theme_id: 'cosmic-obsidian', root_object_ids: [], objects: {}, notebooks: [notebook],
};

const writerTarget: WorkspaceDocument = {
  schema_version: 2, id: 'writer-durchlass', title: 'Writer', kind: 'Writer', created_at: 1, modified_at: 1, version: 1,
  theme_id: 'cosmic-obsidian', root_object_ids: [], objects: {},
};

/** Der **echte** Durchlass wird ausgeführt — über denselben Weg wie `useNotesEditorController.ts:23`. */
function throughCommitChokepoint(next: WorkspaceDocument): WorkspaceDocument {
  const committed: WorkspaceDocument[] = [];
  let commit: ((document: WorkspaceDocument) => void) | null = null;
  const Capture = (): null => {
    commit = useNotesCollaboration(document, (updated) => { committed.push(updated); }).commitDocument;
    return null;
  };
  renderToStaticMarkup(<Capture />);
  if (!commit) throw new Error('useNotesCollaboration wurde nicht ausgeführt');
  (commit as (document: WorkspaceDocument) => void)(next);
  const last = committed.at(-1);
  if (!last) throw new Error('commitDocument hat das Dokument nicht weitergereicht');
  return last;
}

/** Die Frage an die **echte** Matrix der Shell — derselbe Aufruf wie in der Zone. */
function dropVerdictFor(candidate: WorkspaceDocument) {
  const step = notesParagraphCarrier({ document: candidate, page, lineIndex: 0 });
  if (!step.ok) throw new Error(`Träger fehlt: ${step.reason}`);
  return {
    step,
    verdict: assessFabricWorkspaceDrop(step.carrier.payload, writerTarget.id, { [candidate.id]: candidate, [writerTarget.id]: writerTarget }, { effect: 'Allow' }),
  };
}

/** Nur für die **Gegenprobe**: der eine benannte Grund, der bleibt (die Quelle hat kein Objekt). */
function dropCodeFor(candidate: WorkspaceDocument): string {
  const { verdict } = dropVerdictFor(candidate);
  if (verdict.status !== 'rejected') throw new Error(`Erwartet war eine benannte Ablehnung, gemessen: ${verdict.status}`);
  return verdict.code;
}

describe('AST-0737-Abhängigkeit (4) · der Durchlass `commitDocument` führt die Seiten als Objekte', () => {
  it('A · was beim Aufrufer ankommt, trägt das Seitenobjekt — und die Matrix stellt seit AST-0737 zu', () => {
    const vorher = dropCodeFor(document);
    // **Die Gegenprobe zuerst:** ohne den Durchlass ist die Quelle objektlos — derselbe Zeuge fährt beide Zustände.
    expect(vorher).toBe('drop_source_object_missing');

    const committed = throughCommitChokepoint({ ...document, version: document.version + 1, notebooks: [notebook] });

    // **Die Wirkung:** das Objekt steht im Dokument, das die Anwendung erhält — nicht in einer Kopie daneben.
    expect(committed.objects[page.id]?.type).toBe('TextBlock');
    expect(committed.root_object_ids).toContain(page.id);
    // **GEZOGEN (W-445):** hier stand `expect(dropCodeFor(committed)).toBe('registry_adapter_route_missing')` — der
    // Übergangsmarker für die fehlende Route. AST-0737 hat **(1)(2)(3)** gesetzt; die Matrix sieht die Quelle jetzt
    // **und stellt zu**: `accepted` (das Angebot) und `resolved` (die Zustellung) über **genau einen** Adapter.
    const { step, verdict } = dropVerdictFor(committed);
    expect(verdict.status).toBe('accepted');
    if (verdict.status !== 'accepted') throw new Error(`Erwartet war ein Angebot, gemessen: ${verdict.status}`);
    const zustellung = resolveFabricWorkspaceDrop(step.carrier.payload, writerTarget.id, { [committed.id]: committed, [writerTarget.id]: writerTarget }, 'COPY', undefined, { effect: 'Allow' });
    expect(zustellung.status).toBe('resolved');
    if (zustellung.status !== 'resolved') throw new Error(`Erwartet war eine Zustellung, gemessen: ${zustellung.status}`);
    expect(zustellung.selection).toEqual(verdict.selection);
    expect(zustellung.selection.adapterId).toBe('fabric-notes-textblock-to-writer');
  });

  it('B · der Durchlass ist **idempotent** — ein zweiter Aufruf ändert die Objekte nicht', () => {
    const once = throughCommitChokepoint({ ...document, version: document.version + 1, notebooks: [notebook] });
    const twice = throughCommitChokepoint({ ...once, version: once.version + 1, notebooks: [notebook] });
    expect(twice.objects).toEqual(once.objects);
    expect(twice.root_object_ids).toEqual(once.root_object_ids);
  });

  it('C · eine geänderte Seite ändert ihr Objekt mit — der Durchlass ist keine Einmal-Projektion', () => {
    const first = throughCommitChokepoint({ ...document, version: document.version + 1, notebooks: [notebook] });
    const edited = { ...page, content: 'Ein voellig neuer Absatz' };
    const second = throughCommitChokepoint({
      ...first, version: first.version + 1,
      notebooks: [{ id: 'nb-durchlass', title: 'Durchlass', sections: [{ id: 'sec-durchlass', title: 'S', pages: [edited] }] }],
    });
    const object = second.objects[page.id];
    if (object?.type !== 'TextBlock') throw new Error('Kein TextBlock im weitergereichten Dokument.');
    const text = object.data.paragraphs.flatMap((paragraph) => paragraph.spans.map((span) => span.text)).join('\n');
    expect(text).toContain('Ein voellig neuer Absatz');
  });
});
