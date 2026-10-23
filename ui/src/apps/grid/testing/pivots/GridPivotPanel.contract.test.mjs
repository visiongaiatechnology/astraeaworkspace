// STATUS: PLATIN - source contract for the Excel-like pivot builder UI.
//
// This is the counter-check that a *rendered* assertion cannot provide: it reads
// the panel source, blanks comments, and asserts that the drag-and-drop wiring
// exists while the removed text-DSL fields cannot come back.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../pivots/GridPivotPanel.tsx', import.meta.url), 'utf8');

// Blank block and line comments while preserving line structure, so a documented
// removal cannot satisfy (or falsely break) an assertion about live code.
const withoutComments = source
  .replace(/\/\*[\s\S]*?\*\//gu, (match) => match.replace(/[^\n]/gu, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/gu, (match, prefix) => prefix + ' '.repeat(match.length - prefix.length));

describe('GridPivotPanel source contract', () => {
  it('wires drag-and-drop on both the chips and the four drop zones', () => {
    expect(withoutComments).toContain('onDragStart');
    expect(withoutComments).toContain('onDragOver');
    expect(withoutComments).toContain('onDrop');
    expect(withoutComments).toContain('dataTransfer.setData');
    for (const zone of ['rows', 'columns', 'values', 'filters']) {
      expect(withoutComments).toContain(`zoneBox('${zone}'`);
    }
  });

  it('keeps a keyboard/button path for every zone so nothing is pointer-only', () => {
    for (const label of ["'+ Zeile'", "'+ Spalte'", "'+ Wert'", "'+ Filter'"]) {
      expect(withoutComments).toContain(label);
    }
    expect(withoutComments).toContain('data-pivot-add');
    expect(withoutComments).toContain('aria-label=');
  });

  it('does not bring back the removed text-syntax fields', () => {
    // The pattern targets the placeholder shapes ("Rows: A,B", "Values: D:sum"),
    // so an unrelated identifier such as `alternateRows: true` cannot match.
    expect(withoutComments).not.toMatch(/\bRows:\s*[A-Z]/u);
    expect(withoutComments).not.toMatch(/\bValues:\s*[A-Z]/u);
    expect(withoutComments).not.toMatch(/\bFilters:\s*[A-Z]/u);
    expect(withoutComments).not.toContain('Calculated items:');
    expect(withoutComments).not.toContain("split(',')");
  });

  it('hands every transfer to the bounded builder model instead of parsing text', () => {
    expect(withoutComments).toContain('movePivotField');
    expect(withoutComments).toContain('buildPivotDefinition');
    expect(withoutComments).toContain('buildPivotPreview');
    expect(withoutComments).toContain('buildPivotDrillDown');
  });
});
