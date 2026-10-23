// STATUS: PLATIN — Source contract for the selection-aware formatting toggle
//
// The toggle logic and the merging range primitive are unit-tested. What unit
// tests cannot reach is that the toolbar handler actually consults the marked
// range — the previous implementation reformatted the whole paragraph and
// ignored the selection entirely.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const formatting = readFileSync(
  path.resolve(here, '../../../../formatting/useWriterFormattingState.ts'),
  'utf8',
);
const editing = readFileSync(
  path.resolve(here, '../../../../editing/text/writerTextEditing.ts'),
  'utf8',
);

describe('Writer formatting toggle wiring contract', () => {
  it('derives the toggle range from the marked selection', () => {
    expect(formatting).toContain('const selection = textSelection && textSelection.paragraphId === p.id');
    expect(formatting).toContain('return toggleWriterSpanProperty(p, prop, selection).paragraph;');
  });

  it('no longer reformats the whole paragraph', () => {
    expect(formatting).not.toContain('const enabled = p.spans.some((s) => Boolean(s[prop]));');
    expect(formatting).not.toContain('spans: p.spans.map((s) => ({ ...s, [prop]: !enabled }))');
  });

  it('keeps the replacing primitive for the format painter and adds a merging one', () => {
    expect(editing).toContain('export function applyWriterTextSpanFormatRange(');
    expect(editing).toContain('export function mergeWriterTextSpanFormatRange(');
    expect(editing).toContain('function mapWriterRangeSpans(');
    // Both variants share the slicing so their behaviour cannot drift apart.
    expect(editing.match(/mapWriterRangeSpans\(/g)?.length).toBe(3);
  });

  it('routes every toggle property through the shared helper', () => {
    expect(formatting).toContain("'strikethrough' | 'subscript' | 'superscript') => {");
    expect(formatting.match(/toggleWriterSpanProperty\(/g)?.length).toBe(1);
  });
});
