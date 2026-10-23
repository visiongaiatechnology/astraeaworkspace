// STATUS: PLATIN — Notes · Paket 21 (AST-0738): die **Fahrt** von Ende zu Ende gemessen
//
// ## Warum diese Datei existiert
//
// Der Träger (`integrations/notesParagraphCarrier.ts`) ist gebaut und geprüft — aber **niemand** hat gemessen, ob
// die Zusage des Pakets durchläuft: *„Textausschnitt in Writer als Kopie **oder Link** übernehmen"*. Der Register­stand
// war: „Der Träger ist gebaut ✓ — aber ob die Fahrt durchläuft, hat niemand gemessen ✗✓."
//
// Diese Datei misst **beide** Wege getrennt und benennt, welcher trägt und welcher nicht:
//
//   * **Weg A — der erreichbare** (`createWriterDraftFromSelection` / `createWriterDraftFromNote`): er wird von
//     `NotesCrossAppModal` („Send selection to Writer") über `useNotesWorkspaceIntegration` gerufen. Hier wird
//     gemessen, dass der erzeugte Writer-Entwurf **kanonisch** ist, dass Writer ihn **liest**, dass die Referenz ein
//     **Link** ist (nicht nur Text) und dass Writer sie bis in die **PDF-Linkannotation** trägt.
//   * **Weg B — der Träger** (`notesParagraphCarrier`): er ist gebaut, aber **ohne Aufrufer** ✗. Gemessen wird sein
//     benannter Fehlschlag gegen die **echte** gesiegelte Matrix — *nicht behauptet, sondern am Objekt.*
//
// ## Warum hier *Writer*-Code importiert wird (nur gelesen, nichts geändert)
//
// „Ob die Fahrt durchläuft" ist keine Notes-Frage: sie endet in Writer. Deshalb wird das **Ende** mit Writers
// **eigenem** Code gemessen (`sanitizeWriterPdfLink`, `buildWriterPdf`) statt mit einer Nachbildung. *Eine
// Nachbildung des Empfängers wäre genau die zweite Wahrheit, die dieses Projekt verbietet.*
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { sanitizeWriterPdfLink } from '../../../../writer/interchange/export/pdf/writerPdfStructure';
import { buildWriterPdf } from '../../../../writer/interchange/export/pdf/writerPdfExport';
import { createWriterDraftFromNote, createWriterDraftFromSelection, noteWorkspaceUri } from '../../../integrations/notesWorkspaceActions';
import { packVnote, unpackVnote } from '../../../interchange/container/notesVnoteContainer';
import { notesParagraphCarrier } from '../../../integrations/notesParagraphCarrier';
import { assessFabricWorkspaceDrop } from '../../../../../shell/fabric/fabricGraphWorkspaceDrop';

const PLAIN = 'Der Absatz lautet Alpha.';
const REFERENCED = 'Der referenzierte Absatz lautet Beta.';

const page: NotePage = {
  id: 'page-journey',
  title: 'Feldnotiz',
  content: `${PLAIN}\n${REFERENCED}`,
  tags: ['messung'],
  backlinks: [],
  last_modified: 1_700_000_000_000,
};

const notebook: NoteNotebook = { id: 'nb-journey', title: 'Reise', sections: [{ id: 'sec-1', title: 'S', pages: [page] }] };

const source: WorkspaceDocument = {
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
  notebooks: [notebook],
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

/** Genau die Regel, mit der Writers Zustand seinen Textblock findet (`editor/useWriterState.ts:161-165`). */
function writerParagraphsOf(document: WorkspaceDocument) {
  const textBlockId = document.root_object_ids.find((id) => document.objects[id]?.type === 'TextBlock') ?? '';
  const block = document.objects[textBlockId];
  if (block?.type !== 'TextBlock') throw new Error('Der Entwurf hat keinen kanonischen TextBlock.');
  return block.data.paragraphs;
}

const flat = (paragraphs: readonly { spans: readonly { text: string }[] }[]) =>
  paragraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join(''));

describe('AST-0738 · Weg A — der erreichbare Weg trägt: Absatz → Writer-Rich-Text', () => {
  it('der Entwurf ist ein **kanonisches** Writer-Dokument, das Writer selbst liest', () => {
    const { draft } = createWriterDraftFromSelection(source, page, REFERENCED);
    expect(draft.kind).toBe('Writer');
    // **Eine** TextBlock-Identität im Wurzelverzeichnis — dieselbe Auflösung, die Writer beim Öffnen benutzt.
    const textBlockIds = draft.root_object_ids.filter((id) => draft.objects[id]?.type === 'TextBlock');
    expect(textBlockIds).toHaveLength(1);
    const paragraphs = writerParagraphsOf(draft);
    // Der Absatz ist **angekommen** — nicht als Platzhalter, sondern wörtlich.
    expect(flat(paragraphs).join('\n')).toContain(REFERENCED);
    // Und der Text, der **nicht** ausgewählt war, ist **nicht** mitgefahren (Kopie des Ausschnitts, nicht der Seite).
    expect(flat(paragraphs).join('\n')).not.toContain(PLAIN);
  });

  it('die Referenz fährt als **Link** mit — nicht als toter Text', () => {
    const { draft } = createWriterDraftFromSelection(source, page, REFERENCED);
    const uri = noteWorkspaceUri(source.id, page.id);
    const sourceParagraph = writerParagraphsOf(draft).at(-1);
    const span = sourceParagraph?.spans[0];
    // Der sichtbare Text ist die Adresse …
    expect(span?.text).toContain(uri);
    // … **und** der Träger der Absicht steht im vorhandenen Feld (`TextSpan.link`, Writer-Vertrag).
    expect(span?.link).toEqual({ kind: 'external', url: uri });
    // **Ohne** `link` wäre das nur eine Zeichenkette gewesen: die Zusage „als Link" ohne Deckung.
    expect(span?.link).not.toBeUndefined();
  });

  it('auch der Ganz-Notiz-Entwurf trägt den Link — ein Weg, nicht zwei Verhalten', () => {
    const { draft } = createWriterDraftFromNote(source, page);
    const uri = noteWorkspaceUri(source.id, page.id);
    const spans = writerParagraphsOf(draft).flatMap((paragraph) => paragraph.spans);
    expect(spans.some((span) => span.link?.kind === 'external' && span.link.url === uri)).toBe(true);
    // Und die ganze Seite ist mitgefahren — anders als beim Ausschnitt.
    expect(flat(writerParagraphsOf(draft)).join('\n')).toContain(PLAIN);
    expect(flat(writerParagraphsOf(draft)).join('\n')).toContain(REFERENCED);
  });

  it('**das Ende der Fahrt:** Writer nimmt den Link an und schreibt ihn als PDF-Linkannotation', () => {
    const { draft } = createWriterDraftFromSelection(source, page, REFERENCED);
    const uri = noteWorkspaceUri(source.id, page.id);
    const paragraphs = writerParagraphsOf(draft);
    const sourceSpan = paragraphs.at(-1)?.spans[0];
    // 1. Writers **eigene** Freigabe-Regel verwirft den Link nicht (`platform/security/richTextLinkSecurity.ts`).
    expect(sanitizeWriterPdfLink(sourceSpan?.link)).toEqual({ kind: 'external', url: uri });
    // 2. Writers **eigener** PDF-Bau trägt ihn als Annotation in die Datei.
    const bytes = buildWriterPdf(
      draft.title,
      paragraphs,
      draft.writerData!.pageSetup,
    );
    const pdf = new TextDecoder('latin1').decode(bytes);
    expect(pdf).toContain('/Subtype /Link');
    expect(pdf).toContain(uri);
  });
});

describe('AST-0738 · Save → Close → Reopen — **ausgeführt**, nicht behauptet', () => {
  it('die Seite überlebt den **echten** verschlüsselten Container byte-identisch — samt Absatz und Link', async () => {
    // **Eine** Erzeugung, nicht zwei: der Rückverweis muss auf **denselben** Entwurf zeigen, dessen Link gemessen wird.
    const { draft, page: pageAfter } = createWriterDraftFromSelection(source, page, REFERENCED);
    const before: WorkspaceDocument = { ...source, notebooks: [{ ...notebook, sections: [{ id: 'sec-1', title: 'S', pages: [pageAfter] }] }] };

    // **Echter Container, echte Kryptografie** (WebCrypto im Testlauf) — kein Attrappen-Rundlauf.
    const bytes = await packVnote(before.notebooks!, before.title, { password: 'notes-reise-passwort' });
    expect(bytes.byteLength).toBeGreaterThan(64);
    const reopened = await unpackVnote(bytes, { password: 'notes-reise-passwort' });

    // Die Nutzdaten sind **identisch** — der Absatz wörtlich und der Rückverweis vollständig.
    expect(reopened.notebooks).toEqual(before.notebooks);
    const reopenedPage = reopened.notebooks[0]!.sections[0]!.pages[0]!;
    expect(reopenedPage.content).toBe(pageAfter.content);
    expect(reopenedPage.workspaceLinks?.some((entry) => entry.relation === 'writer-draft' && entry.targetDocumentId === draft.id)).toBe(true);
    // Und die Referenz, die im Writer-Entwurf steht, zeigt auf dieselbe Seite, die zurückkam.
    expect(noteWorkspaceUri(source.id, reopenedPage.id)).toBe(noteWorkspaceUri(source.id, page.id));
  }, 60_000);

  it('ein **falsches** Passwort öffnet den Container nicht — der Rundlauf ist keine Einbahnstraße', async () => {
    const bytes = await packVnote([notebook], 'Reise', { password: 'notes-reise-passwort' });
    await expect(unpackVnote(bytes, { password: 'falsches-passwort' })).rejects.toThrow();
  }, 60_000);

  it('ein **abgeschnittener** Container wird abgelehnt, nicht halb geöffnet', async () => {
    const bytes = await packVnote([notebook], 'Reise', { password: 'notes-reise-passwort' });
    // Kopf ohne Rumpf: derselbe Leser, benannter Fehlschlag — kein stiller Teilerfolg.
    await expect(unpackVnote(bytes.subarray(0, 24), { password: 'notes-reise-passwort' })).rejects.toThrow();
  }, 60_000);
});

describe('AST-0738 · Weg B — der Träger: gebaut, aber die Route ist quellenseitig offen', () => {
  it('der Träger wird gebaut — und die **echte** Matrix lehnt die Fahrt mit **Namen** ab', () => {
    const step = notesParagraphCarrier({ document: source, page, lineIndex: 1 });
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    const documents = { [source.id]: source, [writerTarget.id]: writerTarget };
    const urteil = assessFabricWorkspaceDrop(step.carrier.payload, writerTarget.id, documents, { effect: 'Allow' });
    expect(urteil.status).toBe('rejected');
    // Benannter Grund, nicht „irgendwie rot": der Absatz ist kein Objekt des Notes-Dokuments.
    if (urteil.status === 'rejected') expect(urteil.code).toBe('drop_source_object_missing');
  });

  it('die Referenz des Trägers benutzt dieselbe Vokabel wie der Tasks-Weg', () => {
    const step = notesParagraphCarrier({ document: source, page, lineIndex: 1 });
    if (!step.ok) throw new Error('Träger fehlt');
    expect(step.carrier.reference).toBe(`${noteWorkspaceUri(source.id, page.id)}#line-1`);
  });
});
