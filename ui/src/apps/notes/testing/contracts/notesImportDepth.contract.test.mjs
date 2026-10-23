// STATUS: PLATIN — every relative import under apps/notes must resolve, source files included.
//
// The shared guard (`apps/writer/testing/unit/editor/focus/testImportDepth.contract.test.mjs`) resolves the
// relative imports of **test files** under `src/apps`. A wrong depth in a Notes **source** module, or in a
// type-only import that this app's own transform erases, would not be caught there. This check therefore
// resolves every relative specifier of every `.ts`/`.tsx`/`.mjs` file under `apps/notes`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
// contracts → testing → notes → apps → src
const notesRoot = path.resolve(here, '..', '..');
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

function relativeSpecifiers(source) {
  const code = stripNonCode(source);
  const patterns = [
    /^(?:import|export)[^\n]*?from\s+'([^']*)'/dgmu,
    /^(?:import|export)\s*\{[\s\S]*?\}\s*from\s+'([^']*)'/dgmu,
    /^import\s+'([^']*)'/dgmu,
    /\brequire\(\s*'([^']*)'/dgmu,
  ];
  const specifiers = [];
  for (const pattern of patterns) {
    let match = pattern.exec(code);
    while (match) {
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
  if (existsSync(base) && statSync(base).isDirectory()) {
    return CANDIDATE_EXTENSIONS.some((extension) => existsSync(path.join(base, `index${extension}`)));
  }
  if (specifier.endsWith('.js')) return existsSync(base.slice(0, -3) + '.ts');
  return false;
}

describe('apps/notes relative imports resolve from every file, source and test alike', () => {
  const files = collectSourceFiles(notesRoot);
  const broken = [];
  let checked = 0;
  let typeOnly = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { specifier, line } of relativeSpecifiers(source)) {
      checked += 1;
      if (/^import\s+type|^export\s+type|\bimport\s+type\b/u.test(source.split('\n')[line - 1] ?? '')) typeOnly += 1;
      if (!resolves(file, specifier)) broken.push(`${path.relative(notesRoot, file)}:${line} → ${specifier}`);
    }
  }

  it('scanned the whole app, including its type-only imports', () => {
    expect(files.length).toBeGreaterThan(70);
    expect(checked).toBeGreaterThan(300);
    expect(typeOnly).toBeGreaterThan(10);
  });

  it('resolves every relative import', () => {
    expect(broken).toEqual([]);
  });
});
