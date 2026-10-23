// STATUS: PLATIN — Notes · **AST-0737-Abhängigkeit (4)**, zweite Hälfte: das **lebende** Dokument
//
// ## Warum diese Datei neben der Rundlauf-Datei steht
//
// `notesPageObjectPersistence.ast0737dep.test.ts` misst die **Speicherform** (`.vnote`): die Seite steht als Objekt
// **in den Bytes** und kommt aus ihnen zurück. Das ist die eine Hälfte.
//
// Die andere Hälfte ist die, an der ein Scheinträger entlarvt wird: **zur Zugzeit**. `notesParagraphCarrier` liest
// das **lebende** Dokument — *ein Objekt, das erst beim Ziehen entsteht, existiert dort nicht.* Diese Datei misst
// deshalb am **vorhandenen** Träger und an der **echten** Matrix der Shell, was das Datenmodell **im Dokument**
// leistet.
//
// ## Die eingebaute Gegenprobe — derselbe Zeuge fährt **beide** Zustände
//
// Der Test „A" fährt **denselben** Träger gegen **zwei** Dokumente: einmal gegen das Notes-Dokument **ohne**
// Seitenobjekte (der gemessene Zustand vor der Reparatur: `notesVnoteContainer.ts:11`, `objects: {}`) und einmal
// gegen das Dokument **mit** der Projektion. *Ein Zeuge, der nur den neuen Zustand kennt, könnte nicht zeigen, dass
// die Reparatur die Ursache ist* — dieser zeigt es, weil der **alte** Zustand im selben Lauf **mitgemessen** wird.
//
// ## GEZOGEN (W-445) — **(1)(2)(3)** sind gesetzt ✓✓
//
// Hier stand: *„die Matrix der Shell führt für Notes **keine** Ausfuhr (`exports: []`) und für Writer **keinen**
// Import der Objektart `TextBlock`; der Adapter fehlt. *Das ist **(1)**, **(2)** und **(3)** — Folgearbeit in
// `shell/` und `shared/`, ausdrücklich nicht dieser Auftrag.* Gemessen wurde: der Grund wandert von
// `drop_source_object_missing` (die **Quelle** hat kein Objekt — Runde 93) zu `registry_adapter_route_missing`
// (die **Matrix** hat keine Route). **AST-0737 hat (1)(2)(3) nachgeholt** ✓✓ — die Matrix trägt die Route jetzt
// (`shell/fabric/fabricGraphWorkspaceDrop.ts`, `fabric-notes-textblock-to-writer` ✓), und *der Grund ist damit
// **verschwunden**: die Ablage wird **zugestellt*** ✓✓. Der Übergangsmarker ist **auf den neuen Zustand gezogen** —
// **nicht** gelöscht und **nicht** gelockert ✓. *Die eingebaute Gegenprobe (der alte, objektlose Zustand) bleibt:
// sie ist der Grund, warum dieser Zeuge die **Ursache** zeigen kann und nicht nur das Ergebnis.*
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { serializeWorkspaceDocumentCanonical } from '../../../../../platform/workspace/model/workspaceObjectModel';
import { assessFabricWorkspaceDrop, resolveFabricWorkspaceDrop } from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { createNotePageFromTemplate, createEmptyNotePage } from '../../../model/noteModel';
import { notesPageObjects, withNotesPageObjects } from '../../../model/notesPageObjects';
import { notesParagraphCarrier } from '../../../integrations/notesParagraphCarrier';

const NOW = 1_700_000_000_000;

const contentPage: NotePage = { ...createNotePageFromTemplate('meeting', NOW, 'Feldnotiz'), content: 'Zeile eins\nZeile zwei' };
const emptyPage: NotePage = createEmptyNotePage(NOW, 'Leer');
const notebook: NoteNotebook = { id: 'nb-live', title: 'Live', sections: [{ id: 'sec-live', title: 'S', pages: [contentPage, emptyPage] }] };

/** **Der gemessene Zustand vor der Reparatur**: das Notizbuch ist da, die Objekte fehlen. */
function notesDocument(notebooks: readonly NoteNotebook[]): WorkspaceDocument {
  return {
    schema_version: 2, id: 'notes-live', title: 'Live', kind: 'Notes', created_at: 1, modified_at: 1, version: 1,
    theme_id: 'cosmic-obsidian', root_object_ids: [], objects: {}, notebooks: [...notebooks],
  };
}

const writerTarget: WorkspaceDocument = {
  schema_version: 2, id: 'writer-live', title: 'Writer', kind: 'Writer', created_at: 1, modified_at: 1, version: 1,
  theme_id: 'cosmic-obsidian', root_object_ids: [], objects: {},
};

function carrierFrom(document: WorkspaceDocument) {
  const step = notesParagraphCarrier({ document, page: contentPage, lineIndex: 0 });
  if (!step.ok) throw new Error(`Träger fehlt: ${step.reason}`);
  return step.carrier;
}

function documentsFor(document: WorkspaceDocument): Record<string, WorkspaceDocument> {
  return { [document.id]: document, [writerTarget.id]: writerTarget };
}

/** Nur für die **Gegenprobe**: der eine benannte Grund, der bleibt (die Quelle hat kein Objekt). */
function dropCodeFor(document: WorkspaceDocument): string {
  const carrier = carrierFrom(document);
  const verdict = assessFabricWorkspaceDrop(carrier.payload, writerTarget.id, documentsFor(document), { effect: 'Allow' });
  if (verdict.status !== 'rejected') throw new Error(`Erwartet war eine benannte Ablehnung, gemessen: ${verdict.status}`);
  return verdict.code;
}

describe('AST-0737-Abhängigkeit (4) · das **lebende** Dokument führt die Seite als Objekt', () => {
  it('A · **die Wirkung, mit eingebauter Gegenprobe**: erst die Quelle, dann die Matrix — beide Grenzen sind zu', () => {
    // **Der Zustand vor der Reparatur (Runde 93)**, im selben Lauf mitgemessen — die Quelle hat kein Objekt.
    expect(dropCodeFor(notesDocument([notebook]))).toBe('drop_source_object_missing');
    // **Der Zustand nach der Reparatur** — dieselbe Frage, dasselbe Notizbuch, dieselbe Matrix.
    const live = withNotesPageObjects(notesDocument([notebook]));
    // Kein Zugriff zur Zugzeit: das Objekt stand schon im Dokument, bevor irgendwer zieht.
    expect(live.objects[contentPage.id]?.type).toBe('TextBlock');
    expect(live.root_object_ids).toContain(contentPage.id);
    // **Und seit AST-0737 steht auch die Route** ✓✓: der Grund `registry_adapter_route_missing` ist **weg** — die
    // Ablage wird angeboten (`accepted`) und zugestellt (`resolved`), und zwar über **genau einen** Adapter.
    const carrier = carrierFrom(live);
    const urteil = assessFabricWorkspaceDrop(carrier.payload, writerTarget.id, documentsFor(live), { effect: 'Allow' });
    expect(urteil.status).toBe('accepted');
    if (urteil.status !== 'accepted') throw new Error(`Erwartet war ein Angebot, gemessen: ${urteil.status}`);
    const zustellung = resolveFabricWorkspaceDrop(carrier.payload, writerTarget.id, documentsFor(live), 'COPY', undefined, { effect: 'Allow' });
    expect(zustellung.status).toBe('resolved');
    if (zustellung.status !== 'resolved') throw new Error(`Erwartet war eine Zustellung, gemessen: ${zustellung.status}`);
    expect(zustellung.selection).toEqual(urteil.selection);
    expect(zustellung.selection.adapterId).toBe('fabric-notes-textblock-to-writer');
  });

  it('B · auch die **leere** Seite ist ein Objekt — „leer" ist kein Sonderfall', () => {
    const live = withNotesPageObjects(notesDocument([notebook]));
    const empty = live.objects[emptyPage.id];
    expect(empty?.type).toBe('TextBlock');
    // Der Träger einer leeren Zeile bleibt benannt abgelehnt — dieses Modul ändert **nicht** die Trägerregel.
    const step = notesParagraphCarrier({ document: live, page: emptyPage, lineIndex: 0 });
    expect(step.ok).toBe(false);
    if (!step.ok) expect(step.reason).toBe('notes-carrier-line-empty');
  });

  it('C · die Projektion ist **idempotent** — ein zweiter Durchlauf ändert nichts', () => {
    const once = withNotesPageObjects(notesDocument([notebook]));
    const twice = withNotesPageObjects(once);
    expect(twice.objects).toEqual(once.objects);
    expect(twice.root_object_ids).toEqual(once.root_object_ids);
    // Und sie ist **rein**: die Vorlage wird nicht angefasst.
    const source = notesDocument([notebook]);
    withNotesPageObjects(source);
    expect(source.objects).toEqual({});
    expect(source.root_object_ids).toEqual([]);
  });

  it('D · **fremde Objekte bleiben** — ein vorhandener Datensatz wird nicht ohne Grund gelöscht', () => {
    const table: WorkspaceDocument['objects'][string] = { type: 'Table', data: { id: 'table-fremd', rows: 1, cols: 1, cells: {} } };
    const source: WorkspaceDocument = { ...notesDocument([notebook]), objects: { 'table-fremd': table }, root_object_ids: ['table-fremd'] };
    const live = withNotesPageObjects(source);
    expect(live.objects['table-fremd']).toEqual(table);
    expect(live.root_object_ids).toContain('table-fremd');
    expect(live.root_object_ids).toContain(contentPage.id);
    // Keine Kennung doppelt — die Wurzelliste ist eine Menge.
    expect(new Set(live.root_object_ids).size).toBe(live.root_object_ids.length);
  });

  it('E · eine Seite **außerhalb der Kennungsgrenze** bekommt kein Objekt — und geht nicht verloren', () => {
    // Feindliche Eingabe: ein importiertes `.notes.json` kann **jede** Seitenkennung tragen
    // (`model/notesHierarchy.ts` normalisiert Titel, Inhalt, Tags — **nicht** die `id`).
    const foreign: NotePage = { ...emptyPage, id: 'page/mit leerzeichen #1', content: 'Fremde Kennung' };
    const mixed: NoteNotebook = { id: 'nb-mixed', title: 'Gemischt', sections: [{ id: 'sec-mixed', title: 'S', pages: [contentPage, foreign] }] };
    const live = withNotesPageObjects(notesDocument([mixed]));
    // **Kein Objekt** unter der untragbaren Kennung — *eine erfundene Kennung wäre eine zweite Identität.*
    expect(Object.keys(live.objects)).toEqual([contentPage.id]);
    // **Aber die Seite ist nicht verloren** — sie fährt vollständig im Notizbuch mit.
    expect(live.notebooks?.[0]?.sections[0]?.pages.map((page) => page.id)).toEqual([contentPage.id, foreign.id]);
    // **Und das Dokument bleibt speicherbar**: die Ausfuhr zerbricht nicht an einer feindlichen Kennung.
    expect(() => serializeWorkspaceDocumentCanonical(live)).not.toThrow();
  });

  it('F · **zwei Seiten, eine Kennung**: die zweite verdrängt die erste nicht heimlich', () => {
    const erste: NotePage = { ...contentPage, id: 'page-doppelt', content: 'Erste Fassung' };
    const zweite: NotePage = { ...contentPage, id: 'page-doppelt', content: 'Zweite Fassung' };
    const doppelt: NoteNotebook = { id: 'nb-doppelt', title: 'Doppelt', sections: [{ id: 'sec-doppelt', title: 'S', pages: [erste, zweite] }] };
    const projection = notesPageObjects([doppelt]);
    // **Eine** Kennung, **ein** Objekt — und es ist die **erste** Fassung: kein stiller Überschreiber.
    expect(projection.root_object_ids).toEqual(['page-doppelt']);
    const object = projection.objects['page-doppelt'];
    if (object?.type !== 'TextBlock') throw new Error('Kein TextBlock projiziert.');
    const text = object.data.paragraphs.flatMap((paragraph) => paragraph.spans.map((span) => span.text)).join('\n');
    expect(text).toContain('Erste Fassung');
    expect(text).not.toContain('Zweite Fassung');
  });
});
