// STATUS: PLATIN — lokale Importtiefen-Prüfung für `apps/admin-policy`: **Quellmodule und Tests**.
//
// **Warum es diese Datei gibt (fünftes Vorkommen dieser Form in dieser Sitzung):** der gemeinsame
// Wächter `apps/writer/testing/unit/editor/focus/testImportDepth.contract.test.mjs` sammelt nur Dateien
// mit `\.(test|spec)\.(ts|tsx|mjs)$` unter `src/apps`. Eine falsche Tiefe in einem **Quellmodul**
// meiner App wird dort also **nie** geprüft — und eine **type-only**-Importzeile wird vom Transform
// gelöscht, weshalb meine eigene Vitest-Suite sie ebenfalls nicht sehen kann. Beides ist unsichtbar,
// bis jemand `tsc` kalt laufen lässt.
//
// Diese Prüfung deckt deshalb beide Fälle ab und **beweist ihre eigene Nicht-Leere**: Datei-, Import-,
// Typ-Import- und Quellmodulzahlen werden mitgezählt und geprüft. Ein Wächter, der versehentlich
// nichts mehr scannt, wäre grün und wertlos.
//
// Sie ist eine `.mjs`-Datei, weil sie den Datenträger liest — eine `.ts`-Datei hätte hier keine
// Node-Typen (`TS2307`).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
// contract → testing → admin-policy → apps → src → open-core/ui
const uiRoot = path.resolve(here, '../../../../..');
const adminRoot = path.join(uiRoot, 'src/apps/admin-policy');

const EXECUTABLE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];
const RESOLUTION_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '.css'];

function collectCodeFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collectCodeFiles(full, found);
    } else if (EXECUTABLE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Kommentare und den **Inhalt** von Zeichenketten leeren, Länge und Zeilenstruktur erhalten.
 *
 * Dadurch bleiben die Offsets identisch: ein Spezifizierer wird anschließend aus dem **Original** an
 * derselben Stelle zurückgelesen. Ohne diesen Schritt würden Assertion-Zeichenketten in Vertragstests
 * als Importe gezählt (der Fehler, den der gemeinsame Wächter dreimal gemacht hat).
 */
function stripNonCode(source) {
  let out = '';
  let state = 'code';
  const blank = (character) => (character === '\n' ? '\n' : ' ');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (character === '/' && next === '/') { state = 'line'; out += '  '; index += 1; continue; }
      if (character === '/' && next === '*') { state = 'block'; out += '  '; index += 1; continue; }
      if (character === "'" || character === '"' || character === '`') { state = character; out += character; continue; }
      out += character;
      continue;
    }
    if (state === 'line') {
      if (character === '\n') { state = 'code'; out += '\n'; continue; }
      out += ' ';
      continue;
    }
    if (state === 'block') {
      if (character === '*' && next === '/') { state = 'code'; out += '  '; index += 1; continue; }
      out += blank(character);
      continue;
    }
    if (character === '\\') { out += '  '; index += 1; continue; }
    if (character === state) { state = 'code'; out += character; continue; }
    out += blank(character);
  }
  return out;
}

/** Alle relativen Spezifizierer eines Moduls, mit Art (`type` / `value` / `dynamic`) und Zeile. */
function relativeSpecifiers(source) {
  const code = stripNonCode(source);
  const patterns = [
    { kind: 'type', pattern: /^import\s+type\s+[^\n]*?from\s+'([^']*)'/dgmu },
    { kind: 'type', pattern: /^export\s+type\s+[^\n]*?from\s+'([^']*)'/dgmu },
    { kind: 'value', pattern: /^(?:import|export)[^\n]*?from\s+'([^']*)'/dgmu },
    { kind: 'value', pattern: /^(?:import|export)\s*\{[\s\S]*?\}\s*from\s+'([^']*)'/dgmu },
    { kind: 'value', pattern: /^import\s+'([^']*)'/dgmu },
    { kind: 'dynamic', pattern: /\bimport\(\s*'([^']*)'/dgmu },
    { kind: 'dynamic', pattern: /\brequire\(\s*'([^']*)'/dgmu },
    // Testdateien binden Module über `vi.mock` an einen relativen Pfad — dieselbe Tiefenfalle.
    { kind: 'dynamic', pattern: /\bvi\.(?:mock|doMock|unmock)\(\s*'([^']*)'/dgmu },
  ];
  const found = [];
  const seen = new Set();
  for (const { kind, pattern } of patterns) {
    let match = pattern.exec(code);
    while (match) {
      const [start, end] = match.indices[1];
      const specifier = source.slice(start, end);
      const key = `${match.index}:${specifier}`;
      if (specifier.startsWith('.') && !seen.has(key)) {
        seen.add(key);
        found.push({ specifier, kind, line: code.slice(0, match.index).split('\n').length });
      }
      match = pattern.exec(code);
    }
  }
  return found;
}

function resolves(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  if (RESOLUTION_EXTENSIONS.some((extension) => existsSync(base + extension))) return true;
  if (existsSync(base) && statSync(base).isDirectory()) {
    return RESOLUTION_EXTENSIONS.some((extension) => existsSync(path.join(base, `index${extension}`)));
  }
  if (specifier.endsWith('.js')) return existsSync(base.slice(0, -3) + '.ts');
  return false;
}

const isTestFile = (file) => /\.(test|spec)\.(ts|tsx|mjs)$/u.test(file) || file.includes(`${path.sep}testing${path.sep}`);

describe('admin-policy import depth — source modules and tests', () => {
  const files = collectCodeFiles(adminRoot);
  const broken = [];
  let specifierCount = 0;
  let typeSpecifierCount = 0;
  let dynamicSpecifierCount = 0;
  let sourceFilesWithSpecifiers = 0;

  for (const file of files) {
    const specifiers = relativeSpecifiers(readFileSync(file, 'utf8'));
    if (!isTestFile(file) && specifiers.length > 0) sourceFilesWithSpecifiers += 1;
    for (const { specifier, kind, line } of specifiers) {
      specifierCount += 1;
      if (kind === 'type') typeSpecifierCount += 1;
      if (kind === 'dynamic') dynamicSpecifierCount += 1;
      if (!resolves(file, specifier)) {
        broken.push(`${path.relative(adminRoot, file)}:${line} → ${specifier} (${kind})`);
      }
    }
  }

  it('scans a non-trivial amount of code, including type-only and source-module imports', () => {
    // Diese Zusicherungen sind der Grund, warum dieser Wächter nicht stillschweigend leer laufen kann.
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(specifierCount).toBeGreaterThanOrEqual(60);
    expect(typeSpecifierCount).toBeGreaterThanOrEqual(5);
    expect(dynamicSpecifierCount).toBeGreaterThanOrEqual(1);
    expect(sourceFilesWithSpecifiers).toBeGreaterThanOrEqual(10);
  });

  it('resolves every relative import of every source module and every test', () => {
    // Die Liste wird vollständig gedruckt: eine falsche Tiefe wird durch Zählen der Ebenen behoben,
    // und dafür braucht man Datei und Spezifizierer nebeneinander.
    expect(broken).toEqual([]);
  });
});
