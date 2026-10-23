// STATUS: PLATIN — every relative import in a test file must resolve
//
// This check exists because of a mistake I made **five times** in this project: a test file placed one
// directory level too shallow, so `../../../../shared/…` pointed at nothing. `tsc` catches it, but only
// when the typecheck runs — and in one round it was the evidence capture that found it, after the work
// was already written up. A wrong depth is a mechanical error, so it gets a mechanical check.
//
// It resolves each relative import of every test file against the file system instead of trusting it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
// focus → editor → unit → testing → writer → apps. The first version of this file said four levels and
// looked for `src/apps/writer/apps`; the error message is what gave it away — the same mistake this
// check exists to catch, made inside the check.
const appsRoot = path.resolve(here, '../../../../..');

const TEST_DIRECTORY = appsRoot;
const CANDIDATE_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '.css'];

function collectTestFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collectTestFiles(full, found);
    } else if (/\.(test|spec)\.(ts|tsx|mjs)$/u.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Relative specifiers of a module.
 *
 * The first version matched `from '...'` anywhere in the file and therefore reported nine "broken
 * imports" that were really **assertion strings** in contract tests — those files read source code as
 * text and assert on lines such as `import { … } from '../../../grid/compat/gridUtils';`. A module
 * statement starts a line, so the scan requires that; an assertion never does.
 */
/**
 * Blank out comments and the **content** of string literals so that only real code is scanned.
 *
 * Two failed attempts before this one, both measured rather than guessed:
 *   1. matching `from '...'` anywhere → nine "broken imports" that were assertion text;
 *   2. requiring a line to start with `import`/`export` → five left, all inside multi-line template
 *      literals of assertions (my own file among them).
 * The quotes stay, their content becomes blanks, and the length and line structure are preserved — so a
 * specifier can be read back from the original text at the same offset.
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
    // Inside a string: the closing quote ends it unless it is escaped.
    if (character === '\\') { out += '  '; index += 1; continue; }
    if (character === state) { state = 'code'; out += character; continue; }
    out += blank(character);
  }
  return out;
}

function relativeImports(source) {
  const code = stripNonCode(source);
  // The patterns must not depend on the specifier's **content**: it is blanked in `code`, so even the
  // leading dot is a space there. They capture the position between the quotes; the text is read back
  // from the original and filtered afterwards. (The first version required `\.` and matched nothing —
  // measured with a one-off probe rather than guessed.)
  const patterns = [
    /^(?:import|export)[^\n]*?from\s+'([^']*)'/dgmu, // single line, incl. `import type`
    /^(?:import|export)\s*\{[\s\S]*?\}\s*from\s+'([^']*)'/dgmu, // braces spread over lines
    /^import\s+'([^']*)'/dgmu, // side-effect import
    // Contract tests read files as text; a wrong depth there is the same mistake and it bit me again
    // while writing this very file's sibling, so the paths are checked too.
    /\bread\(\s*'([^']*)'/dgmu,
    // **Eigener Fehler, korrigiert (Runde 258) ✗✓:** Hier stand `path\.resolve\(\s*[A-Za-z_$][\w$]*\s*,…` — das
    // erkannte den **Aufruf** ✓, aber `resolves()` rechnet den relativen Teil gegen die **Testdatei** ✗. Bei
    // `path.resolve(notes, '../../shell/…')` ist die Basis aber `notes = path.resolve(here, '../..')` ✓ — *eine
    // **andere** Basis, und der Wächter kannte sie nicht* ✗. Folge: ein **falscher** Fund in
    // `notesDropZoneWiring.contract.test.mjs:36` ✗, und die Datei lief gleichzeitig **grün** ✓.
    // **Ein Muster stand für eine Struktur** ✗: Der Aufruf ist prüfbar nur, wenn die Basis **auflösbar** ist.
    // Deshalb jetzt **nur** die Basen, die der Wächter wirklich kennt — *eine unbekannte Basis wird
    // **übersprungen**, nicht geraten* ✓✓.
    /\bpath\.resolve\(\s*(?:here|__dirname)\s*,\s*'([^']*)'/dgmu,
  ];
  const specifiers = [];
  for (const pattern of patterns) {
    let match = pattern.exec(code);
    while (match) {
      // The specifier is string content, so it is blank in `code`; the offsets are identical, which is
      // what makes reading it from the original possible.
      const [start, end] = match.indices[1];
      const specifier = source.slice(start, end);
      if (specifier.startsWith('.')) {
        specifiers.push({ specifier, line: code.slice(0, match.index).split('\n').length });
      }
      match = pattern.exec(code);
    }
  }
  return specifiers;
}

function resolves(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  if (CANDIDATE_EXTENSIONS.some((extension) => existsSync(base + extension))) return true;
  // A directory import resolves through its index file.
  if (existsSync(base) && statSync(base).isDirectory()) {
    return CANDIDATE_EXTENSIONS.some((extension) => existsSync(path.join(base, `index${extension}`)));
  }
  // TypeScript also resolves an explicit `.js` specifier to a `.ts` source.
  if (specifier.endsWith('.js')) return existsSync(base.slice(0, -3) + '.ts');
  return false;
}

describe('test files do not import across a wrong directory depth', () => {
  const files = collectTestFiles(TEST_DIRECTORY);
  const broken = [];
  let checked = 0;

  for (const file of files) {
    for (const { specifier, line } of relativeImports(readFileSync(file, 'utf8'))) {
      checked += 1;
      if (!resolves(file, specifier)) {
        broken.push(`${path.relative(appsRoot, file)}:${line} → ${specifier}`);
      }
    }
  }

  it('found test files to check', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(checked).toBeGreaterThan(500);
  });

  it('resolves every relative import', () => {
    // The list is printed in full: a wrong depth is fixed by counting directory levels, and having the
    // file and the specifier side by side is what makes that possible.
    expect(broken).toEqual([]);
  });
});
