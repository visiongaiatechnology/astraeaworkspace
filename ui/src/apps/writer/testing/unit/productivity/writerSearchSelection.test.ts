// STATUS: DIAMANT VGT SUPREME — Replace only the chosen matches
//
// Paket 30 acceptance: "Über gesamtes Dokument suchen, Treffer hervorheben und
// **nur gewählte Treffer ersetzen**." The document-wide replace could only do all
// or nothing. These tests pin the selection path, including the two ways it can go
// wrong: stale offsets and multiple hits inside one span.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import {
  findWriterSearchMatches,
  replaceWriterSearchMatches,
  replaceWriterSearchMatchesAtSelection,
  type WriterSearchMatch,
} from '../../../productivity/search/writerSearchEngine';

const para = (id: string, ...texts: string[]): Paragraph => ({
  id,
  spans: texts.map((text) => ({ text })),
  style: { style_name: 'normal' },
} as unknown as Paragraph);

const PLAIN = { matchCase: false, wholeWord: false, mode: 'plain' as const };
const textOf = (paragraph: Paragraph): string[] => paragraph.spans.map((span) => span.text);

const matchesIn = (paragraphs: Paragraph[], query: string): WriterSearchMatch[] =>
  findWriterSearchMatches(paragraphs, query, PLAIN).matches;

describe('Writer selected-match replacement', () => {
  it('replaces only the chosen match and leaves its neighbours alone', () => {
    const paragraphs = [para('p1', 'rot rot rot')];
    const matches = matchesIn(paragraphs, 'rot');
    expect(matches).toHaveLength(3);

    const result = replaceWriterSearchMatchesAtSelection(paragraphs, [matches[1]!], 'blau');
    expect(result.count).toBe(1);
    expect(result.skipped).toBe(0);
    expect(textOf(result.paragraphs[0]!)).toEqual(['rot blau rot']);
  });

  it('replaces several chosen matches across paragraphs', () => {
    const paragraphs = [para('p1', 'a b a'), para('p2', 'a c')];
    const matches = matchesIn(paragraphs, 'a');
    expect(matches).toHaveLength(3);

    const chosen = [matches[0]!, matches[2]!];
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, chosen, 'X');
    expect(result.count).toBe(2);
    expect(textOf(result.paragraphs[0]!)).toEqual(['X b a']);
    expect(textOf(result.paragraphs[1]!)).toEqual(['X c']);
  });

  it('keeps the offsets valid when one span holds several chosen matches', () => {
    // Applied left to right this would shift every later offset.
    const paragraphs = [para('p1', 'aa aa aa')];
    const matches = matchesIn(paragraphs, 'aa');
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, matches, 'LONGER');
    expect(result.count).toBe(3);
    expect(textOf(result.paragraphs[0]!)).toEqual(['LONGER LONGER LONGER']);
  });

  it('replaces across separate spans of the same paragraph', () => {
    const paragraphs = [para('p1', 'eins', 'zwei', 'drei')];
    const matches = matchesIn(paragraphs, 'zwei');
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, matches, 'II');
    expect(result.count).toBe(1);
    expect(textOf(result.paragraphs[0]!)).toEqual(['eins', 'II', 'drei']);
  });

  it('leaves a stale match alone instead of corrupting other text', () => {
    const paragraphs = [para('p1', 'Treffer hier')];
    const matches = matchesIn(paragraphs, 'Treffer');
    // The user edited between searching and replacing.
    const edited = [para('p1', 'voellig anderer Text')];

    const result = replaceWriterSearchMatchesAtSelection(edited, matches, 'X');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(1);
    expect(textOf(result.paragraphs[0]!)).toEqual(['voellig anderer Text']);
  });

  it('skips a match whose paragraph id does not fit its index', () => {
    const paragraphs = [para('p1', 'abc'), para('p2', 'abc')];
    const matches = matchesIn(paragraphs, 'abc');
    // A match that claims paragraph p2 but sits at index 0 is inconsistent.
    const forged = [{ ...matches[0]!, paragraphId: 'p2' }];
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, forged, 'X');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips an out-of-range or empty range', () => {
    const paragraphs = [para('p1', 'abc')];
    const base = matchesIn(paragraphs, 'abc')[0]!;
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, [
      { ...base, start: 1, end: 1 },
      { ...base, start: 0, end: 99 },
    ], 'X');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(2);
    expect(textOf(result.paragraphs[0]!)).toEqual(['abc']);
  });

  it('accepts an empty replacement as a deletion', () => {
    const paragraphs = [para('p1', 'keep drop keep')];
    const matches = matchesIn(paragraphs, 'drop');
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, matches, '');
    expect(result.count).toBe(1);
    expect(textOf(result.paragraphs[0]!)).toEqual(['keep  keep']);
  });

  it('counts replaced and skipped separately when only some still fit', () => {
    const paragraphs = [para('p1', 'aa bb'), para('p2', 'aa bb')];
    const matches = matchesIn(paragraphs, 'aa');
    const edited = [para('p1', 'aa bb'), para('p2', 'geaendert')];
    const result = replaceWriterSearchMatchesAtSelection(edited, matches, 'X');
    expect(result.count).toBe(1);
    expect(result.skipped).toBe(1);
    expect(textOf(result.paragraphs[0]!)).toEqual(['X bb']);
    expect(textOf(result.paragraphs[1]!)).toEqual(['geaendert']);
  });

  it('does nothing for an empty selection', () => {
    const paragraphs = [para('p1', 'abc')];
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, [], 'X');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(0);
    expect(textOf(result.paragraphs[0]!)).toEqual(['abc']);
  });

  it('does not mutate the document it was given', () => {
    const paragraphs = [para('p1', 'aa aa')];
    const snapshot = JSON.stringify(paragraphs);
    replaceWriterSearchMatchesAtSelection(paragraphs, matchesIn(paragraphs, 'aa'), 'X');
    expect(JSON.stringify(paragraphs)).toBe(snapshot);
  });

  it('differs from the document-wide replace, which is the point', () => {
    const paragraphs = [para('p1', 'rot rot rot')];
    const matches = matchesIn(paragraphs, 'rot');

    const all = replaceWriterSearchMatches(paragraphs, 'rot', 'blau', PLAIN);
    expect(all.count).toBe(3);
    expect(textOf(all.paragraphs[0]!)).toEqual(['blau blau blau']);

    const one = replaceWriterSearchMatchesAtSelection(paragraphs, [matches[0]!], 'blau');
    expect(one.count).toBe(1);
    expect(textOf(one.paragraphs[0]!)).toEqual(['blau rot rot']);
  });

  it('keeps untouched paragraphs by identity', () => {
    const paragraphs = [para('p1', 'a'), para('p2', 'a')];
    const matches = matchesIn(paragraphs, 'a');
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, [matches[0]!], 'X');
    expect(result.paragraphs[1]).toBe(paragraphs[1]);
  });
});
