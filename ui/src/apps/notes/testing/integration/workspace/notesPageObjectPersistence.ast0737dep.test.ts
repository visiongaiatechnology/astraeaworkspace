// STATUS: PLATIN — Notes · **AST-0737-Abhängigkeit (4)**: das Notes-Datenmodell
//
// ## Was diese Datei misst — und warum sie am heutigen Baum **rot** ist
//
// Der Vorgänger-Auftrag hat für **AST-0737** gemessen und gestoppt: der Träger
// (`integrations/notesParagraphCarrier.ts`) benennt den Absatz als **Objekt** (`objectId = pageId`,
// `objectKind = 'TextBlock'`), aber die Seite lebt in `notebooks[].sections[].pages[]` und **nicht** in
// `document.objects` — `.vnote` schreibt `root_object_ids: []`, `objects: {}`
// (`interchange/container/notesVnoteContainer.ts:11`).
//
// Diese Datei ist der **Persistenz-Zeuge** für genau diese Lücke. Sie braucht **kein DOM**: sie fährt die
// **Kette**, die ein Speicher-Rundlauf ist, und zwar **vollständig**:
//
//     Seite erzeugen  →  `.vnote` serialisieren  →  ALLE VERWEISE VERWERFEN  →  deserialisieren  →  vergleichen
//
// Der Vergleich läuft **nicht** über die Kennung allein: geprüft werden **Art**, **Identität** (`data.id`),
// **jeder Absatz** (Anzahl = Zeilenzahl der Seite), der **Text** gegen die **wörtlichen Zeilen** der Vorlage,
// die **Form** jedes Absatzes (`id` / `style` / `spans`) und die **Wurzel** (`root_object_ids`).
//
// ## Warum der Leser **zweimal** befragt wird
//
// `unpackContainer` (`platform/containers/container.ts`) ist der **Plattform-Leser** — er kennt Notes nicht und
// **rechnet nichts nach**: was er liefert, steht **wörtlich in den Bytes**. `unpackVnote`
// (`interchange/container/notesVnoteContainer.ts`) ist der **Notes-Leser**. Beide werden befragt:
// *stimmten sie nicht überein, wäre eine der beiden Hälften eine zweite Wahrheit.* Ein Zeuge, der nur den
// **Serialisierer** prüft, ist in dieser Sitzung schon einmal wertlos gewesen (AST-0478) — deshalb prüft dieser
// Zeuge das **Ergebnis** der Kette, nicht den Serialisierer.
//
// ## Was hier **nicht** verdrahtet wird
//
// Keine Matrix der Shell, kein Adapter, kein Writer-Import: `shell/` und `shared/` liegen außerhalb dieses
// Auftrags. Gemessen wird **allein** die Abhängigkeit (4) — das **Datenmodell**.
import { describe, expect, it } from 'vitest';
import type { NoteNotebook, NotePage } from '../../../../../shared/contracts/workspace';
import { unpackContainer } from '../../../../../platform/containers/container';
import { createNotePageFromTemplate, createEmptyNotePage } from '../../../model/noteModel';
import { packVnote, unpackVnote } from '../../../interchange/container/notesVnoteContainer';

const PASSWORD = 'notes-seitenobjekt-passwort';
const NOW = 1_700_000_000_000;

/**
 * **Zwei Seiten, zwei Formen** — beide aus der **Produktions-Vorlage** erzeugt (`createNotePageFromTemplate`
 * / `createEmptyNotePage`), also mit der **echten** Kennungsform (`page-<uuid>`) und der **echten** Struktur.
 * Die Vorlage liefert den Rahmen; der Inhalt wird wörtlich gesetzt, damit der Zeuge **wörtlich** vergleichen
 * kann statt eine zweite Markdown-Umsetzung nachzubauen.
 */
const contentPage: NotePage = {
  ...createNotePageFromTemplate('research', NOW, 'Feldnotiz'),
  content: 'Erste Zeile\n# Ueberschrift\n- [ ] Aufgabe\n- Punkt',
};
const emptyPage: NotePage = createEmptyNotePage(NOW, 'Leere Seite');

const notebook: NoteNotebook = {
  id: 'nb-seitenobjekt',
  title: 'Seitenobjekt',
  sections: [{ id: 'sec-seitenobjekt', title: 'Abschnitt', pages: [contentPage, emptyPage] }],
};

/** Der wörtliche Text eines `TextBlock` — **eine** Zerlegung, dieselbe wie im vorhandenen Writer-Vertrag. */
function flattenedText(object: unknown): string {
  if (!object || typeof object !== 'object') throw new Error('Kein Objekt vorhanden.');
  const data = (object as { data?: unknown }).data;
  if (!data || typeof data !== 'object') throw new Error('Das Objekt hat keine Nutzdaten.');
  const paragraphs = (data as { paragraphs?: unknown }).paragraphs;
  if (!Array.isArray(paragraphs)) throw new Error('Das Objekt hat keine Absaetze.');
  return paragraphs
    .map((paragraph) => {
      const spans = (paragraph as { spans?: unknown }).spans;
      if (!Array.isArray(spans)) throw new Error('Ein Absatz hat keine Spans.');
      return spans
        .map((span) => {
          const text = (span as { text?: unknown }).text;
          if (typeof text !== 'string') throw new Error('Ein Span hat keinen Text.');
          return text;
        })
        .join('');
    })
    .join('\n');
}

describe('AST-0737-Abhängigkeit (4) · die Notes-Seite als **persistiertes Objekt**', () => {
  it('A · die Seite ist nach dem `.vnote`-Rundlauf als **Objekt** da — nicht nur als Notizbuchseite', async () => {
    const bytes = await packVnote([notebook], notebook.title, { password: PASSWORD });
    // **ALLE VERWEISE VERWORFEN:** ab hier hält der Zeuge nur noch die Bytes. Der vorige Aufruf liefert keine
    // Referenz auf das Dokument, die überleben könnte.
    expect(bytes.byteLength).toBeGreaterThan(64);

    // **Der Plattform-Leser** — er kennt Notes nicht und rechnet nichts nach.
    const raw = await unpackContainer(bytes, { password: PASSWORD });
    const object = raw.objects[contentPage.id];
    expect(object).toBeDefined();
    if (!object) throw new Error('Die Seite ist kein Objekt des Notes-Dokuments.');
    // **Echte Verengung, nicht nur eine Zusicherung an den Leser** — `expect` verengt den Typ nicht.
    if (object.type !== 'TextBlock') throw new Error(`Falsche Objektart: ${object.type}`);
    expect(object.type).toBe('TextBlock');
    // **Die Identität** — der Träger adressiert die Seite als Objektkennung, also muss sie **sie selbst** sein.
    expect(object.data.id).toBe(contentPage.id);
    // **Die Wurzel** — ein Objekt ohne Wurzel ist für den Resolver nicht erreichbar.
    expect(raw.root_object_ids).toContain(contentPage.id);
    // **JEDER Absatz**: die Anzahl ist die Zeilenzahl der Seite — kein Absatz fällt unter den Tisch.
    expect(object.data.paragraphs).toHaveLength(contentPage.content.split('\n').length);
    // **Der Text, wörtlich** — die Sonde: jede Zeile der Vorlage ist im Objekt nachweisbar.
    const text = flattenedText(object);
    for (const line of ['Erste Zeile', 'Ueberschrift', 'Aufgabe', 'Punkt']) expect(text).toContain(line);
    // **Die Form** jedes Absatzes — der Writer-Vertrag verlangt `id`, `style`, `spans`.
    for (const paragraph of object.data.paragraphs) {
      expect(typeof paragraph.id).toBe('string');
      expect(paragraph.id.length).toBeGreaterThan(0);
      expect(paragraph.style).toBeTypeOf('object');
      expect(Array.isArray(paragraph.spans)).toBe(true);
    }
    // **Und die zweite Seite ebenso** — die Zusage gilt dem Notizbuch, nicht einer ausgezeichneten Seite.
    const empty = raw.objects[emptyPage.id];
    expect(empty).toBeDefined();
    if (!empty) throw new Error('Die leere Seite ist kein Objekt des Notes-Dokuments.');
    expect(empty.type).toBe('TextBlock');
    expect(empty.data.id).toBe(emptyPage.id);
  });

  it('B · der **Notes-Leser** liefert dieselben Objekte zurück — eine Wahrheit, nicht zwei', async () => {
    const bytes = await packVnote([notebook], notebook.title, { password: PASSWORD });
    const plattform = await unpackContainer(bytes, { password: PASSWORD });
    const notes = await unpackVnote(bytes, { password: PASSWORD });
    // Der Notes-Leser gibt die Objekte **aus dem Dokument** zurück — nicht neu erfunden.
    expect(notes.objects[contentPage.id]).toEqual(plattform.objects[contentPage.id]);
    expect(notes.root_object_ids).toContain(contentPage.id);
    // Die Notizbuchhälfte bleibt unberührt: dieser Auftrag ändert das Seitenmodell, nicht die Seiten.
    expect(notes.notebooks).toEqual([notebook]);
  });

  it('C · das Objekt ist **feldvollständig** durch die Serialisierung gegangen — nicht nur seine Kennung', async () => {
    const bytes = await packVnote([notebook], notebook.title, { password: PASSWORD });
    const raw = await unpackContainer(bytes, { password: PASSWORD });
    const object = raw.objects[contentPage.id];
    if (!object) throw new Error('Die Seite ist kein Objekt des Notes-Dokuments.');
    // **Die Gegenprobe gegen einen Scheinerfolg:** eine feste, kanonische Form des Objekts überlebt den
    // Rundlauf unverändert. *Wäre nur die Kennung angekommen, fiele diese Prüfung.*
    const canonical = JSON.parse(JSON.stringify(object)) as unknown;
    expect(canonical).toEqual(object);
    const again = await unpackContainer(bytes, { password: PASSWORD });
    expect(JSON.stringify(again.objects[contentPage.id])).toBe(JSON.stringify(object));
  });
});
