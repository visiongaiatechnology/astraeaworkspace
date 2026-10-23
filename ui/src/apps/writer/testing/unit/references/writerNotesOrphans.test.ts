// STATUS: PLATIN — Orphaned footnote and endnote handling
//
// Deleting a paragraph never removed its notes. The orphan stayed in the
// document, consumed a number, counted towards the statistics, and — because the
// endnote list is printed without a page filter — an orphaned endnote was still
// rendered at the end of the document.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import type { FootnoteItem } from '../../../types';
import { getPageFootnotes, recalculateNotes } from '../../../references/notes/writerNotesEngine';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };
const para = (id: string): Paragraph => ({ id, style: { ...STYLE }, spans: [{ text: `Text ${id}` }] });

const note = (id: string, referenceParagraphId: string, overrides: Partial<FootnoteItem> = {}): FootnoteItem => ({
  id,
  number: 0,
  text: `Note ${id}`,
  referenceParagraphId,
  ...overrides,
});

const doc = [para('p1'), para('p2'), para('p3')];

describe('Writer orphaned notes', () => {
  it('numbers the notes of existing paragraphs contiguously', () => {
    const result = recalculateNotes(doc, [
      note('a', 'p1'),
      note('b', 'p2'),
      note('c', 'p3'),
    ]);
    expect(result.footnotes.map((entry) => entry.displayNumber)).toEqual(['1', '2', '3']);
    expect(result.orphanedNotes).toEqual([]);
  });

  it('drops a note whose paragraph was deleted', () => {
    const result = recalculateNotes([para('p1'), para('p3')], [
      note('a', 'p1'),
      note('gone', 'deleted-paragraph'),
      note('c', 'p3'),
    ]);
    expect(result.footnotes.map((entry) => entry.note.id)).toEqual(['a', 'c']);
    // The numbering closes up: no gap where the deleted note used to be.
    expect(result.footnotes.map((entry) => entry.displayNumber)).toEqual(['1', '2']);
    expect(result.orphanedNotes?.map((entry) => entry.id)).toEqual(['gone']);
  });

  it('never prints an orphaned endnote at the end of the document', () => {
    const result = recalculateNotes([para('p1')], [
      note('kept', 'p1', { noteType: 'endnote', numberFormat: 'roman' }),
      note('orphan-endnote', 'deleted-paragraph', { noteType: 'endnote', numberFormat: 'roman' }),
    ]);
    expect(result.endnotes.map((entry) => entry.note.id)).toEqual(['kept']);
    expect(result.endnotes.map((entry) => entry.displayNumber)).toEqual(['i']);
    expect(result.orphanedNotes?.map((entry) => entry.id)).toEqual(['orphan-endnote']);
  });

  it('keeps footnotes and endnotes in separate number sequences', () => {
    const result = recalculateNotes(doc, [
      note('f1', 'p1'),
      note('e1', 'p1', { noteType: 'endnote', numberFormat: 'roman' }),
      note('f2', 'p2'),
      note('e2', 'p2', { noteType: 'endnote', numberFormat: 'roman' }),
    ]);
    expect(result.footnotes.map((entry) => entry.displayNumber)).toEqual(['1', '2']);
    expect(result.endnotes.map((entry) => entry.displayNumber)).toEqual(['i', 'ii']);
  });

  it('reports no orphans and no notes for an empty document', () => {
    const result = recalculateNotes(doc, []);
    expect(result.footnotes).toEqual([]);
    expect(result.endnotes).toEqual([]);
    expect(result.orphanedNotes).toEqual([]);
  });

  it('treats every note as orphaned when no paragraph is left', () => {
    const result = recalculateNotes([], [note('a', 'p1'), note('b', 'p2')]);
    expect(result.footnotes).toEqual([]);
    expect(result.endnotes).toEqual([]);
    expect(result.orphanedNotes).toHaveLength(2);
  });

  it('still finds the notes of the page for a surviving paragraph', () => {
    const result = recalculateNotes([para('p1'), para('p3')], [
      note('a', 'p1'),
      note('gone', 'deleted-paragraph'),
    ]);
    expect(getPageFootnotes([para('p1')], result.footnotes).map((entry) => entry.note.id)).toEqual(['a']);
    expect(getPageFootnotes([para('p3')], result.footnotes)).toEqual([]);
  });

  it('does not mutate the stored notes', () => {
    const stored = [note('a', 'p1'), note('gone', 'deleted-paragraph')];
    const snapshot = JSON.stringify(stored);
    recalculateNotes([para('p1')], stored);
    expect(JSON.stringify(stored)).toBe(snapshot);
  });
});
