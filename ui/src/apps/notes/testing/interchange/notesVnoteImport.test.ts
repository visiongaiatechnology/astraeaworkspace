// STATUS: PLATIN — Notes · das verschlüsselte `.vnote` **zurücklesen** (AST-0728/AST-0734, Register W-433-Familie)
//
// ## Der Defekt, den diese Datei festhält
//
// `packVnote` schreibt seit jeher ein verschlüsseltes `.vnote` (`security/NotesSecurityModal.tsx:61`) — und
// `unpackVnote` (`interchange/container/notesVnoteContainer.ts:16`) hatte **keinen** Produktionsaufrufer ✗.
// Die Ausfuhr war eine **Einbahnstraße**: der Nutzer erhielt eine Datei, die die eigene Anwendung nicht mehr
// öffnen konnte. Das ist dieselbe Krankheit, die dieses Projekt am häufigsten gejagt hat — *eine Fähigkeit ohne
// Aufrufer ist nicht geliefert* ✓.
//
// ## Was hier gemessen wird — ausgeführt, nicht beschrieben
//
// Der Rundlauf läuft durch den **echten** Container (WebCrypto im Testlauf, kein Attrappen-Format) und durch den
// **echten** Importweg (`importCommonNoteFiles`), den die Oberfläche ruft. Geprüft werden beide Richtungen:
// Erfolg mit dem richtigen Kennwort, **benannter** Fehlschlag ohne bzw. mit falschem Kennwort, und die Grenze
// (mehr als ein Notizbuch wird nicht stillschweigend ausgewählt).
import { describe, expect, it } from 'vitest';
import type { NoteNotebook } from '../../../../shared/contracts/workspace';
import { packVnote } from '../../interchange/container/notesVnoteContainer';
import { MAX_NOTES_IMPORT_FILE_BYTES, importCommonNoteFiles, importVnoteArchive } from '../../interchange/notesImportExport';

const PASSWORD = 'notes-vnote-passwort';

const notebook: NoteNotebook = {
  id: 'nb-vnote',
  title: 'Tresor-Notizbuch',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  sections: [
    {
      id: 'sec-vnote',
      title: 'Abschnitt',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      trashedAt: null,
      pages: [
        {
          id: 'page-vnote',
          title: 'Seite',
          content: 'RUNDLAUF-INHALT-GAMMA',
          tags: ['tresor'],
          backlinks: [],
          created_at: 1_700_000_000_000,
          last_modified: 1_700_000_000_000,
        },
      ],
    },
  ],
};

/** Eine echte Datei, wie der Dateiauswahldialog sie liefert — nicht ein nachgebautes Objekt. */
function vnoteFile(bytes: Uint8Array): File {
  return new File([bytes as unknown as BlobPart], 'Tresor.vnote', { type: 'application/vnd.astraea.vnote' });
}

describe('Notes · `.vnote` — die Ausfuhr hat jetzt eine Einfuhr', () => {
  it('der echte Container kommt durch den echten Importweg zurück', async () => {
    const bytes = await packVnote([notebook], notebook.title, { password: PASSWORD });
    const imported = await importCommonNoteFiles([vnoteFile(bytes)], { vnotePassword: PASSWORD });
    // Die Nutzdaten sind angekommen — Titel, Seite, Absatz wörtlich.
    expect(imported.title).toBe(notebook.title);
    expect(imported.sections.flatMap((section) => section.pages).map((page) => page.title)).toEqual(['Seite']);
    expect(imported.sections[0]?.pages[0]?.content).toBe('RUNDLAUF-INHALT-GAMMA');
    expect(imported.sections[0]?.pages[0]?.tags).toEqual(['tresor']);
  }, 60_000);

  it('ohne Kennwort wird **benannt** abgelehnt — kein stiller Teilerfolg', async () => {
    const bytes = await packVnote([notebook], notebook.title, { password: PASSWORD });
    // Der Grund kommt aus dem **vorhandenen** Leser, nicht aus einer zweiten Fehlerliste hier.
    await expect(importVnoteArchive(bytes, {})).rejects.toThrow(/PASSWORD_REQUIRED/u);
  }, 60_000);

  it('mit **falschem** Kennwort wird abgelehnt, nicht halb geöffnet', async () => {
    const bytes = await packVnote([notebook], notebook.title, { password: PASSWORD });
    await expect(importVnoteArchive(bytes, { vnotePassword: 'anderes-kennwort' })).rejects.toThrow();
  }, 60_000);

  it('ein Container mit **zwei** Notizbüchern wird nicht stillschweigend auf eines verkürzt', async () => {
    const bytes = await packVnote([notebook, { ...notebook, id: 'nb-zwei', title: 'Zweites' }], 'Zwei', { password: PASSWORD });
    await expect(importVnoteArchive(bytes, { vnotePassword: PASSWORD }))
      .rejects.toThrow(/holds 2 notebooks/u);
  }, 60_000);

  it('die Größenordnung ist die **vorhandene** Grenze, keine zweite Zahl', async () => {
    // Kein 8-MiB-Fixture: die Grenze wird über ihre benannte Konstante geprüft, damit keine zweite Zahl entsteht.
    expect(MAX_NOTES_IMPORT_FILE_BYTES).toBe(8 * 1024 * 1024);
    const bytes = await packVnote([notebook], notebook.title, { password: PASSWORD });
    const file = vnoteFile(bytes);
    expect(file.size).toBeLessThanOrEqual(MAX_NOTES_IMPORT_FILE_BYTES);
  }, 60_000);
});
