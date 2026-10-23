// STATUS: PLATIN — Writer dynamic field evaluation contracts
//
// Header and footer text may carry fields such as {PAGE} or {DATE}. The
// evaluation had no test at all, and it read the clock internally, so {DATE} and
// {TIME} could not be pinned. Both are fixed here.
import { describe, expect, it } from 'vitest';
import {
  evaluateFields,
  hasWriterFields,
  writerFieldNames,
  WRITER_FIELD_NAMES,
} from '../../../utils/writerUtils';

const context = { pageNumber: 3, totalPages: 12, title: 'Quartalsbericht', author: 'A. Muster', words: 1450 };
const fixedNow = new Date('2026-10-10T14:30:00Z');

describe('Writer field detection', () => {
  it('recognises a field in any position', () => {
    expect(hasWriterFields('Seite {PAGE}')).toBe(true);
    expect(hasWriterFields('{TITLE}')).toBe(true);
    expect(hasWriterFields('ohne Feld')).toBe(false);
    expect(hasWriterFields('')).toBe(false);
    expect(hasWriterFields('{UNKNOWN}')).toBe(false);
  });

  it('lists the fields a text uses, in order and without repeats', () => {
    expect(writerFieldNames('{TITLE} · Seite {PAGE} von {NUMPAGES} · {PAGE}'))
      .toEqual(['TITLE', 'PAGE', 'NUMPAGES']);
    expect(writerFieldNames('kein Feld')).toEqual([]);
  });

  it('treats every known name as a field', () => {
    for (const name of WRITER_FIELD_NAMES) {
      expect(hasWriterFields(`{${name}}`)).toBe(true);
    }
  });
});

describe('Writer field evaluation', () => {
  it('substitutes page number and total pages', () => {
    expect(evaluateFields('Seite {PAGE} von {NUMPAGES}', context, fixedNow)).toBe('Seite 3 von 12');
  });

  it('substitutes the document title and the word count', () => {
    expect(evaluateFields('{TITLE} ({WORDCOUNT} Wörter)', context, fixedNow))
      .toBe('Quartalsbericht (1450 Wörter)');
  });

  it('substitutes date and time from the injected clock', () => {
    const evaluated = evaluateFields('{DATE} {TIME}', context, fixedNow);
    expect(evaluated).toBe(`${fixedNow.toLocaleDateString()} ${fixedNow.toLocaleTimeString()}`);
  });

  it('is reproducible for the same clock', () => {
    expect(evaluateFields('{DATE} {TIME}', context, fixedNow))
      .toBe(evaluateFields('{DATE} {TIME}', context, fixedNow));
  });

  it('is case insensitive', () => {
    expect(evaluateFields('{page}/{Page}/{numpages}', context, fixedNow)).toBe('3/3/12');
  });

  it('replaces every occurrence', () => {
    expect(evaluateFields('{PAGE}-{PAGE}-{PAGE}', context, fixedNow)).toBe('3-3-3');
  });

  it('leaves unknown fields untouched instead of swallowing them', () => {
    expect(evaluateFields('{FOO} und {PAGE}', context, fixedNow)).toBe('{FOO} und 3');
    expect(evaluateFields('a { b } c', context, fixedNow)).toBe('a { b } c');
  });

  it('falls back for a missing title and author', () => {
    const bare = { pageNumber: 1, totalPages: 1, title: '', words: 0 };
    expect(evaluateFields('{TITLE}', bare, fixedNow)).toBe('Untitled Document');
    expect(evaluateFields('{AUTHOR}', bare, fixedNow)).toBe('Astraea Author');
  });

  it('prefers the given author over the fallback', () => {
    expect(evaluateFields('{AUTHOR}', context, fixedNow)).toBe('A. Muster');
  });

  it('leaves text without fields unchanged', () => {
    const plain = 'Kapitel 1 · Vertraulich';
    expect(evaluateFields(plain, context, fixedNow)).toBe(plain);
  });

  it('does not let one field name shadow another', () => {
    // A naive replace of PAGE before NUMPAGES could corrupt the longer name.
    expect(evaluateFields('{NUMPAGES}', context, fixedNow)).toBe('12');
    expect(evaluateFields('{PAGE}|{NUMPAGES}', context, fixedNow)).toBe('3|12');
  });

  it('survives an empty text', () => {
    expect(evaluateFields('', context, fixedNow)).toBe('');
  });
});
