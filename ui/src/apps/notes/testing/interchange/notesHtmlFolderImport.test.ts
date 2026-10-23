// STATUS: PLATIN — Notes · W-433: die HTML-Ordner-Ausfuhr hat jetzt einen Rückweg
//
// ## Der Defekt
//
// `buildScopedNotesExport(scope,'html')` schreibt für mehrere Seiten eine `-HTML.zip`. Dafür gab es **keinen**
// Leser ✗, und `restoreWikiLinksFromHtml` — als dessen halbe Seite gebaut — hatte **null** Aufrufer ✗ (auch in
// keinem Test). *Eine Ausfuhr ohne Einfuhr ist eine Zusage ohne Deckung.*
//
// ## Warum hier ein **Plattform-Doppelgänger** steht — und was das ehrlich bedeutet
//
// Gemessen: in dieser kopflosen Laufzeit ist `DOMParser` **`undefined`**. Der HTML-Textleser des Produkts ist
// der **eine** vorhandene (`htmlToText`); einen zweiten, DOM-freien Parser zu bauen wäre genau die zweite
// Wahrheit, die dieses Projekt verbietet. Der Test setzt deshalb einen **minimalen Doppelgänger der Plattform**
// ein und führt den **unveränderten Produktionspfad** aus. *Nicht geprüft ist damit, was ein echter Browser-DOM
// liefert — das ist Schicht 5 und bleibt `NOT_TESTED`.*
//
// Geprüft wird: ZIP → Kennung → Einträge → **Link-Rückführung** → Text → Notizbuch, plus jeder benannte
// Fehlschlag (fehlende Kennung, falsche Kennung, keine lesbaren Einträge, unbekannter Ordner).
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteNotebook, NoteSection } from '../../../../shared/contracts/workspace';
import {
  NOTES_HTML_FOLDER_MANIFEST,
  NOTES_MARKDOWN_FOLDER_MANIFEST,
  buildScopedNotesExport,
  importCommonNoteFiles,
  importHtmlFolderZip,
  importMarkdownFolderZip,
  importNotesFolderZip,
} from '../../interchange/notesImportExport';

/** Ein minimaler Doppelgänger **der Plattform** — nicht des Produkts. Er beantwortet genau zwei Fragen. */
function installDomParserDouble(): void {
  class DoubleElement {
    innerText: string;
    textContent: string;
    constructor(text: string) { this.innerText = text; this.textContent = text; }
    remove(): void { /* im Doppelgänger gibt es keine aktiven Knoten */ }
  }
  class DoubleDocument {
    body: DoubleElement;
    constructor(html: string) {
      // Der Doppelgänger liest den Text aus dem `<body>` — die kleinste Antwort, die die Frage stellt.
      const body = /<body[^>]*>([\s\S]*)<\/body>/iu.exec(html)?.[1] ?? html;
      const stripped = body
        .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/giu, '')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/[ \t]+/gu, ' ')
        .trim();
      this.body = new DoubleElement(stripped);
    }
    querySelectorAll(): DoubleElement[] { return []; }
  }
  (globalThis as { DOMParser?: unknown }).DOMParser = class {
    parseFromString(html: string): DoubleDocument { return new DoubleDocument(html); }
  };
}

afterEach(() => { delete (globalThis as { DOMParser?: unknown }).DOMParser; });

const notebook: NoteNotebook = {
  id: 'nb-html',
  title: 'Recherche',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  sections: [
    {
      id: 'sec-a', title: 'Feld', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000, trashedAt: null,
      pages: [
        { id: 'p-1', title: 'Alpha', content: 'Erster Absatz mit [[Beta]].', tags: [], backlinks: [], created_at: 1, last_modified: 1_700_000_000_000 },
        { id: 'p-2', title: 'Beta', content: 'Zweiter Absatz.', tags: [], backlinks: [], created_at: 1, last_modified: 1_700_000_000_000 },
      ],
    },
  ],
};
const sections: NoteSection[] = notebook.sections;

describe('W-433 — die HTML-Ordner-Ausfuhr ist rücklesbar', () => {
  it('Export → Import über den **echten** Weg gibt die Seiten und die Wiki-Links zurück', async () => {
    installDomParserDouble();
    const artifact = buildScopedNotesExport({ kind: 'section', notebook, section: sections[0]! }, 'html');
    // Mehrere Seiten ⇒ ein Archiv mit Kennung — vorher trug es **keine**.
    expect(artifact.mimeType).toBe('application/zip');
    expect(artifact.filename.endsWith('-HTML.zip')).toBe(true);

    const imported = await importHtmlFolderZip(artifact.bytes);
    const pages = imported.sections.flatMap((section) => section.pages);
    expect(pages.map((page) => page.title).sort()).toEqual(['Alpha', 'Beta']);
    // **Der Link überlebt:** im HTML stand `<a href="Beta.html">`; er kommt als `[[Beta]]` zurück.
    const alpha = pages.find((page) => page.title === 'Alpha');
    expect(alpha?.content).toContain('[[Beta]]');
    expect(alpha?.content).not.toContain('<a ');
    // Und der Abschnittsname kommt aus dem Ordnerpfad.
    expect(imported.sections[0]?.title).toBe('Feld');
  }, 60_000);

  it('der **eine** Ordner-Eingang findet beide Kennungen', async () => {
    installDomParserDouble();
    const htmlZip = buildScopedNotesExport({ kind: 'section', notebook, section: sections[0]! }, 'html').bytes;
    const markdownZip = buildScopedNotesExport({ kind: 'section', notebook, section: sections[0]! }, 'markdown-folder').bytes;
    expect((await importNotesFolderZip(htmlZip)).sections.flatMap((s) => s.pages)).toHaveLength(2);
    expect((await importNotesFolderZip(markdownZip)).sections.flatMap((s) => s.pages)).toHaveLength(2);
  }, 60_000);

  it('**und der Weg, den die Oberfläche geht**, führt dorthin: `importCommonNoteFiles` mit einem HTML-Ordner', async () => {
    // *Die erste Fassung dieses Tests rief nur `importNotesFolderZip` direkt auf — und der Gegencheck blieb
    // grün, als die Verdrahtung in `importCommonNoteFiles` wieder auf den Markdown-Leser zurückfiel.*
    // **Ein Test, der die Funktion selbst ruft, ist ihr einziger Aufrufer — er prüft die Kante nicht.**
    installDomParserDouble();
    const artifact = buildScopedNotesExport({ kind: 'section', notebook, section: sections[0]! }, 'html');
    const file = new File([artifact.bytes as unknown as BlobPart], 'Recherche-HTML.zip', { type: 'application/zip' });
    const imported = await importCommonNoteFiles([file]);
    expect(imported.sections.flatMap((section) => section.pages).map((page) => page.title).sort()).toEqual(['Alpha', 'Beta']);
  }, 60_000);

  it('ein Archiv **ohne** Kennung wird benannt abgelehnt', async () => {
    installDomParserDouble();
    const artifact = buildScopedNotesExport({ kind: 'section', notebook, section: sections[0]! }, 'html');
    await expect(importNotesFolderZip(artifact.bytes)).resolves.toBeDefined();

    // Ein Fremd-ZIP (nur irgendeine Datei) trägt keine der beiden Kennungen.
    const { writeStoredZip } = await import('../../../../platform/interop/zip');
    const foreign = writeStoredZip([{ name: 'notes.txt', data: new TextEncoder().encode('fremd') }]);
    await expect(importNotesFolderZip(foreign)).rejects.toThrow(/no Astraea Notes manifest/u);
  }, 60_000);

  it('eine **falsche** Kennung wird abgelehnt, nicht geraten', async () => {
    installDomParserDouble();
    const { writeStoredZip } = await import('../../../../platform/interop/zip');
    const wrong = writeStoredZip([{
      name: NOTES_HTML_FOLDER_MANIFEST,
      data: new TextEncoder().encode(JSON.stringify({ format: 'etwas-anderes', version: 1, title: 'X', pages: [{ id: 'a', path: 'a.html' }] })),
    }, { name: 'a.html', data: new TextEncoder().encode('<html><body>a</body></html>') }]);
    await expect(importHtmlFolderZip(wrong)).rejects.toThrow(/Unsupported Astraea Notes HTML-folder manifest/u);
  }, 60_000);

  it('ein Manifest **ohne lesbaren Eintrag** wird abgelehnt, nicht halb importiert', async () => {
    installDomParserDouble();
    const { writeStoredZip } = await import('../../../../platform/interop/zip');
    const empty = writeStoredZip([{
      name: NOTES_HTML_FOLDER_MANIFEST,
      data: new TextEncoder().encode(JSON.stringify({ format: 'astraea-notes-html-folder', version: 1, title: 'X', pages: [{ id: 'a', path: 'fehlt.html' }] })),
    }]);
    await expect(importHtmlFolderZip(empty)).rejects.toThrow(/references no readable page entry/u);
  }, 60_000);

  it('ohne DOM nennt der **vorhandene** HTML-Leser seinen Grund, statt zu stürzen', async () => {
    // Kein Doppelgänger installiert: genau der kopflose Produktionszustand.
    const { writeStoredZip } = await import('../../../../platform/interop/zip');
    const zip = writeStoredZip([{
      name: NOTES_HTML_FOLDER_MANIFEST,
      data: new TextEncoder().encode(JSON.stringify({ format: 'astraea-notes-html-folder', version: 1, title: 'X', pages: [{ id: 'a', path: 'a.html' }] })),
    }, { name: 'a.html', data: new TextEncoder().encode('<html><body>a</body></html>') }]);
    // Vorher: ein `TypeError` tief in einer Zeile. Jetzt: ein benannter Zustand.
    await expect(importHtmlFolderZip(zip)).rejects.toThrow(/requires a DOM \(DOMParser\)/u);
  }, 60_000);

  it('die Kennungen sind zwei **benannte** Tatsachen, keine Zeichenketten im Code', () => {
    expect(NOTES_HTML_FOLDER_MANIFEST).toBe('astraea-notes-html-manifest.json');
    expect(NOTES_MARKDOWN_FOLDER_MANIFEST).toBe('astraea-notes-manifest.json');
    expect(NOTES_HTML_FOLDER_MANIFEST).not.toBe(NOTES_MARKDOWN_FOLDER_MANIFEST);
  });
});

describe('W-433 — der Markdown-Leser bleibt unverändert erreichbar', () => {
  it('der vorhandene Markdown-Import antwortet weiterhin auf sein Manifest', async () => {
    const artifact = buildScopedNotesExport({ kind: 'section', notebook, section: sections[0]! }, 'markdown-folder');
    const imported = await importMarkdownFolderZip(artifact.bytes);
    expect(imported.sections.flatMap((section) => section.pages)).toHaveLength(2);
  }, 60_000);
});
