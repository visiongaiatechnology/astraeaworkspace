// STATUS: PLATIN — Every essential control must be reachable without a pointer
//
// VGT UI/UX implementation gate: "Keine essenzielle Funktion ausschließlich per
// Hover." The paragraph actions, the image quick toolbar, the table row/column
// controls, the equation actions and the bookmark delete were all `opacity-0` and
// only appeared on hover — invisible to keyboard users and undiscoverable without a
// pointer. They are quiet now (40 %) and full strength on hover **and** keyboard
// focus. This contract keeps it that way.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const writerRoot = path.resolve(here, '../../..');           // apps/writer

/**
 * The non-printing overlay draws whitespace marks over the real text and hides the
 * text itself so the marks line up. `opacity-0` is the mechanism there, not a
 * control gate — the only file allowed to use it.
 */
const OVERLAY_EXCEPTION = 'WriterNonPrintingOverlay.tsx';

function tsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : tsxFiles(full);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [full] : [];
  });
}

function linesWith(dir, needle) {
  const hits = [];
  for (const file of tsxFiles(dir)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (line.includes(needle)) hits.push({ file: path.basename(file), line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

describe('Writer hover-gate contract', () => {
  it('never hides a control behind hover alone', () => {
    const offenders = linesWith(writerRoot, 'opacity-0')
      .filter((hit) => hit.file !== OVERLAY_EXCEPTION)
      .map((hit) => `${hit.file}:${hit.line}`);
    expect(offenders).toEqual([]);
  });

  it('keeps the overlay exception to the spacing trick', () => {
    const overlay = linesWith(writerRoot, 'opacity-0');
    expect(overlay.length).toBeGreaterThan(0);
    for (const hit of overlay) {
      expect(hit.file).toBe(OVERLAY_EXCEPTION);
      // Spans that hide word text so the visible marks line up — never a button.
      expect(hit.text).toContain('<span');
      expect(hit.text).not.toContain('<button');
    }
  });

  it('brightens every quiet control on keyboard focus as well as hover', () => {
    const quiet = linesWith(writerRoot, 'opacity-40 group-hover:opacity-100')
      .concat(linesWith(writerRoot, 'opacity-40 transition-opacity group-hover:opacity-100'));
    expect(quiet.length).toBeGreaterThanOrEqual(6);
    for (const hit of quiet) {
      const hasFocus = hit.text.includes('focus-within:opacity-100') || hit.text.includes('focus-visible:opacity-100');
      expect(hasFocus, `${hit.file}:${hit.line} has no keyboard focus state`).toBe(true);
    }
  });

  it('covers the six control sites that were hover-only', () => {
    const files = new Set(linesWith(writerRoot, 'opacity-40 group-hover:opacity-100')
      .concat(linesWith(writerRoot, 'opacity-40 transition-opacity group-hover:opacity-100'))
      .map((hit) => hit.file));
    for (const expected of [
      'WriterParagraphItem.tsx',
      'WriterImageBlock.tsx',
      'WriterTableBlock.tsx',
      'WriterEquationBlock.tsx',
      'WriterTocSidebar.tsx',
    ]) {
      expect(files.has(expected), `${expected} is not covered`).toBe(true);
    }
  });
});
