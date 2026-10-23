// STATUS: PLATIN — Notes · Wächter: der native Container hat **einen** Schreiber und **einen** Leser, beide erreichbar
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat in diesem Projekt **keine** Node-Typen — `node:fs` ergäbe `TS2307`.
//
// ## Was dieser Wächter verhindert
//
// Der gemessene Defekt war keine falsche Zeile, sondern eine **fehlende Kante**: `unpackVnote` war gebaut und
// geprüft und hatte **null** Produktionsaufrufer. Ein Verhaltenstest kann das nicht fangen — er ruft die Funktion
// selbst auf und ist damit ihr einziger Aufrufer. *Nur eine Quelltext-Messung über den ganzen Baum sieht, ob eine
// exportierte Funktion von **Produktionscode** erreicht wird.* Deshalb steht diese Prüfung hier und nicht im
// Verhaltenstest.
//
// Sie pinnt außerdem **Nicht-Leerheit**: die gemessene Menge (Produktionsdateien, gefundene Aufrufe) muss groß
// genug sein, damit die Prüfung nicht still leer wird und „grün" meldet, ohne etwas geprüft zu haben.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';


// This file walks the source tree with readdirSync. Measured isolated: the three files together finish in
// 1.8 s. Under a full 832-file parallel run the same work exceeded the 5 s default and failed with
// "Test timed out in 5000ms" — the test was measuring machine load, not correctness. The scan is the
// assertion, so it gets a window that does not depend on contention.
vi.setConfig({ testTimeout: 60_000 });

const here = path.dirname(fileURLToPath(import.meta.url));
const notes = path.resolve(here, '../..');
const src = path.resolve(notes, '..', '..');

const read = (relativeToNotes) => readFileSync(path.resolve(notes, relativeToNotes), 'utf8');
/** Kommentare entfernen — *ein Satz über eine verbotene Sache ist nicht die Sache* (wiederkehrende Lehre). */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const containerModule = 'interchange/container/notesVnoteContainer.ts';
const importExport = read('interchange/notesImportExport.ts');
const modal = read('interchange/NotesImportExportModal.tsx');

/** Alle Produktionsdateien unter `src`, ohne Tests/Testhilfen. */
function productionFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'testing' || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/u.test(entry.name)) continue;
      if (/\.(test|spec)\./u.test(entry.name)) continue;
      found.push(full);
    }
  };
  walk(root);
  return found;
}

const files = productionFiles(src);
const rel = (file) => path.relative(src, file).replace(/\\/gu, '/');
const callers = files
  .filter((file) => rel(file) !== `apps/notes/${containerModule}`)
  .map((file) => ({ file: rel(file), source: code(readFileSync(file, 'utf8')) }));

describe('Notes · der native Container: ein Schreiber, ein Leser — beide erreichbar', () => {
  it('die Messung ist nicht leer (sonst wäre das Tor grün ohne Prüfung)', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(callers.length).toBeGreaterThan(300);
  });

  it('`unpackVnote` hat **Produktionsaufrufer** — die Ausfuhr ist keine Einbahnstraße mehr', () => {
    const reached = callers.filter((entry) => /\bunpackVnote\s*\(/u.test(entry.source)).map((entry) => entry.file);
    // Der gemessene Defekt: diese Liste war **leer**.
    expect(reached.length).toBeGreaterThan(0);
    expect(reached).toContain('apps/notes/interchange/notesImportExport.ts');
  });

  it('`packVnote` hat ebenfalls einen Produktionsaufrufer — beide Hälften bleiben angeschlossen', () => {
    const reached = callers.filter((entry) => /\bpackVnote\s*\(/u.test(entry.source)).map((entry) => entry.file);
    expect(reached).toContain('apps/notes/security/NotesSecurityModal.tsx');
  });

  it('es gibt **keinen** zweiten Entschlüsseler: nur der Container-Aufruf, kein eigenes `JSON.parse` auf Containerdaten', () => {
    const importExportCode = code(importExport);
    // Der Import **delegiert**; er entschlüsselt nicht selbst.
    expect(importExportCode).toContain("import { unpackVnote } from './container/notesVnoteContainer';");
    expect(importExportCode).toContain('await unpackVnote(bytes,');
    expect(importExportCode).not.toContain('crypto.subtle');
    expect(importExportCode).not.toContain('packContainer');
    expect(importExportCode).not.toContain('unpackContainer');
    // Die Grenze wird **benannt** wiederverwendet, nicht neu erfunden.
    expect(importExportCode).toContain('MAX_NOTES_IMPORT_FILE_BYTES');
  });

  it('der Importweg liest `.vnote` als **eine** Datei und reicht das Kennwort durch', () => {
    expect(importExport).toContain('importVnoteArchive');
    expect(importExport).toContain('/\\.vnote$/i.test(files[0].name)');
    expect(importExport).toContain('options.vnotePassword ? { password: options.vnotePassword } : {}');
    // Mehr als ein Notizbuch wird **nicht** stillschweigend ausgewählt.
    expect(importExport).toContain('a Notes import expects exactly one');
  });

  it('die Oberfläche bietet den Weg an: `.vnote` im Dateifilter, ein echtes `<label>` für das Kennwort', () => {
    const modalCode = code(modal);
    expect(modalCode).toContain('.vnote');
    expect(modalCode).toContain('vnotePassword');
    // Ein sichtbares Label, kein Platzhalter als Beschriftung.
    expect(modalCode).toContain('Password for an encrypted .vnote');
    expect(modalCode).toContain('type="password"');
    // Und die Beschreibung hängt am Feld, nicht irgendwo im Dialog.
    expect(modalCode).toContain('aria-describedby="vnote-password-hint"');
    expect(modalCode).toContain('id="vnote-password-hint"');
  });

  it('es gibt **genau eine** Datei, die den Container selbst anfasst', () => {
    // **Alle** Produktionsdateien, auch der Container selbst — sonst kann die Menge nie den Eigentümer enthalten.
    const touching = files
      .map((file) => ({ file: rel(file), source: code(readFileSync(file, 'utf8')) }))
      .filter((entry) => /\b(packContainer|unpackContainer)\s*\(/u.test(entry.source))
      .map((entry) => entry.file)
      .filter((file) => file.startsWith('apps/notes/'));
    expect(touching).toEqual(['apps/notes/interchange/container/notesVnoteContainer.ts']);
    expect(statSync(path.resolve(notes, containerModule)).isFile()).toBe(true);
  });
});
