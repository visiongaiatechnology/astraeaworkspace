// STATUS: PLATIN — every relative import under apps/automate must resolve, SOURCE files included.
//
// Why this exists (fifth occurrence of this shape in the project):
//  - The shared guard (`apps/writer/testing/unit/editor/focus/testImportDepth.contract.test.mjs`) collects
//    only files matching `\.(test|spec)\.(ts|tsx|mjs)$` under `src/apps`. A wrong relative depth in an
//    apps/automate **source** module is therefore never checked by it.
//  - A **type-only** import is erased by this app's transform, so `automateInteraction.test.tsx` cannot
//    observe it either: the module never loads, so nothing fails at run time.
// This check resolves every relative specifier of every `.ts`/`.tsx`/`.mjs`/`.js` file under the app —
// source and tests alike — so a wrong depth is a failure in THIS app's suite, not a silent hole.
//
// It is deliberately local to `apps/automate/**`: a later refactor of the writer guard cannot remove it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
// contracts → testing → automate → apps
const automateRoot = path.resolve(here, '..', '..');
const CANDIDATE_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '.css'];

function collectSourceFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, found);
    else if (/\.(ts|tsx|mjs|js)$/u.test(entry.name)) found.push(full);
  }
  return found;
}

/** Blanks comments and the content of string literals, so an assertion string cannot look like an import. */
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
    if (state === 'line') { if (character === '\n') { state = 'code'; out += '\n'; continue; } out += ' '; continue; }
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

/**
 * Every relative specifier, from single- and double-quoted imports alike, with its 1-based line.
 *
 * Matches are de-duplicated by their start offset: the single-line form and the braced multi-line form
 * both match a one-line named import, and counting it twice would inflate the non-triviality metric.
 */
function relativeSpecifiers(source) {
  const code = stripNonCode(source);
  const patterns = [
    /^(?:import|export)[^\n]*?from\s+['"]([^'"]*)['"]/dgmu,
    /^(?:import|export)\s*\{[\s\S]*?\}\s*from\s+['"]([^'"]*)['"]/dgmu,
    /^import\s+['"]([^'"]*)['"]/dgmu,
    /\brequire\(\s*['"]([^'"]*)['"]/dgmu,
  ];
  const specifiers = [];
  const seen = new Set();
  for (const pattern of patterns) {
    let match = pattern.exec(code);
    while (match) {
      const [start, end] = match.indices[1];
      if (!seen.has(match.index)) {
        seen.add(match.index);
        const specifier = source.slice(start, end);
        if (specifier.startsWith('.')) {
          specifiers.push({ specifier, line: code.slice(0, match.index).split('\n').length });
        }
      }
      match = pattern.exec(code);
    }
  }
  return specifiers;
}

function resolves(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  if (CANDIDATE_EXTENSIONS.some((extension) => existsSync(base + extension))) return true;
  if (existsSync(base) && statSync(base).isDirectory()) {
    return CANDIDATE_EXTENSIONS.some((extension) => existsSync(path.join(base, `index${extension}`)));
  }
  if (specifier.endsWith('.js')) return existsSync(base.slice(0, -3) + '.ts');
  return false;
}

const isTestFile = (file) => /\.(test|spec)\.(ts|tsx|mjs|js)$/u.test(file);

describe('apps/automate relative imports resolve from every file, source and test alike', () => {
  const files = collectSourceFiles(automateRoot);
  const broken = [];
  const sourceFiles = [];
  let checked = 0;
  let typeOnly = 0;

  for (const file of files) {
    if (!isTestFile(file)) sourceFiles.push(file);
    const source = readFileSync(file, 'utf8');
    for (const { specifier, line } of relativeSpecifiers(source)) {
      checked += 1;
      if (/\bimport\s+type\b|^import\s+type|^export\s+type/u.test(source.split('\n')[line - 1] ?? '')) typeOnly += 1;
      if (!resolves(file, specifier)) broken.push(`${path.relative(automateRoot, file)}:${line} → ${specifier}`);
    }
  }

  it('scanned the whole app, source files included, and found type-only imports', () => {
    // The non-triviality assertions exist so this check can never quietly become empty and pass.
    expect(files.length).toBeGreaterThan(25);
    expect(sourceFiles.length).toBeGreaterThan(18);
    expect(checked).toBeGreaterThan(50);
    expect(typeOnly).toBeGreaterThan(5);
  });

  it('resolves every relative import', () => {
    expect(broken).toEqual([]);
  });

  it('strips comments and string literals before reading imports', () => {
    // A guard that scans raw text would treat the docs and this file's own assertion strings as imports.
    expect(relativeSpecifiers("// import x from './nope'\nconst s = \"from './also-nope'\";")).toEqual([]);
    expect(relativeSpecifiers("import { a } from './real';\n")).toHaveLength(1);
  });
});
