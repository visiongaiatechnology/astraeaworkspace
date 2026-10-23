// STATUS: DIAMANT VGT SUPREME — Footnotes: text order, and a jump that actually lands
//
// Paket 34 acceptance: "Fußnote hinzufügen, zur Quelle springen, Nummerierung nach
// Umordnung erhalten."
//
// Two defects stood in the way:
//   W-045  the engine ordered notes inside a paragraph by `referenceSpanIndex`, a field
//          **nothing ever wrote** — so the numbering followed insertion order.
//   W-153  the note entry's "back to the reference" link pointed at `#fn-ref-<id>`, and
//          no element carried that id: the jump was a dead link.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import type { FootnoteItem } from '../../../types';
import {
  recalculateNotes,
  writerNoteReferenceOffset,
} from '../../../references/notes/writerNotesEngine';
import {
  resolveWriterNoteJump,
  writerNoteEntryAnchorId,
  writerNoteReferenceAnchorId,
  writerParagraphAnchorId,
} from '../../../references/notes/writerNoteNavigation';

const para = (id: string, text = 'Text'): Paragraph => ({
  id, spans: [{ text }], style: { style_name: 'normal' },
} as unknown as Paragraph);

const note = (overrides: Partial<FootnoteItem> & { id: string }): FootnoteItem => ({
  number: 0,
  text: 'Notiz',
  referenceParagraphId: 'p1',
  noteType: 'footnote',
  ...overrides,
} as FootnoteItem);

const numbersOf = (notes: FootnoteItem[], paragraphs: Paragraph[]) => {
  const separated = recalculateNotes(paragraphs, notes);
  return separated.footnotes.map((entry) => `${entry.note.id}=${entry.displayNumber}`);
};

describe('Writer note ordering inside a paragraph', () => {
  it('numbers by text position, not by insertion order', () => {
    // Added last-first: the note at the paragraph end was inserted first.
    const notes = [
      note({ id: 'late', referenceTextOffset: 40 }),
      note({ id: 'early', referenceTextOffset: 3 }),
    ];
    expect(numbersOf(notes, [para('p1')])).toEqual(['early=1', 'late=2']);
  });

  it('falls back to insertion order when no offset is known', () => {
    // Legacy notes without an offset keep today's behaviour rather than jumping around.
    const notes = [note({ id: 'first' }), note({ id: 'second' })];
    expect(numbersOf(notes, [para('p1')])).toEqual(['first=1', 'second=2']);
  });

  it('keeps paragraph order above the offset', () => {
    const notes = [
      note({ id: 'in-second', referenceParagraphId: 'p2', referenceTextOffset: 0 }),
      note({ id: 'in-first', referenceParagraphId: 'p1', referenceTextOffset: 99 }),
    ];
    expect(numbersOf(notes, [para('p1'), para('p2')])).toEqual(['in-first=1', 'in-second=2']);
  });

  it('still reads the former field name so an old file orders correctly', () => {
    const legacy = note({ id: 'legacy', referenceSpanIndex: 5 });
    expect(writerNoteReferenceOffset(legacy)).toBe(5);
    const notes = [note({ id: 'modern', referenceTextOffset: 9 }), legacy];
    expect(numbersOf(notes, [para('p1')])).toEqual(['legacy=1', 'modern=2']);
  });

  it('prefers the current field when both are present', () => {
    expect(writerNoteReferenceOffset(note({ id: 'both', referenceTextOffset: 2, referenceSpanIndex: 77 }))).toBe(2);
  });

  it('treats a missing, negative or non-finite offset as unknown', () => {
    expect(writerNoteReferenceOffset(note({ id: 'none' }))).toBe(0);
    expect(writerNoteReferenceOffset(note({ id: 'neg', referenceTextOffset: -4 }))).toBe(0);
    expect(writerNoteReferenceOffset(note({ id: 'nan', referenceTextOffset: Number.NaN }))).toBe(0);
    expect(writerNoteReferenceOffset(note({ id: 'frac', referenceTextOffset: 7.8 }))).toBe(7);
  });
});

describe('Writer note jump targets', () => {
  it('builds the two anchors a note needs, by type', () => {
    expect(writerNoteEntryAnchorId(note({ id: 'n1' }))).toBe('fn-n1');
    expect(writerNoteReferenceAnchorId(note({ id: 'n1' }))).toBe('fn-ref-n1');
    expect(writerNoteEntryAnchorId(note({ id: 'n2', noteType: 'endnote' }))).toBe('en-n2');
    expect(writerNoteReferenceAnchorId(note({ id: 'n2', noteType: 'endnote' }))).toBe('en-ref-n2');
  });

  it('jumps from the note to the paragraph that carries the reference', () => {
    const target = resolveWriterNoteJump(note({ id: 'n1', referenceParagraphId: 'p7' }), 'to-reference');
    expect(target).toEqual({ direction: 'to-reference', anchorId: writerParagraphAnchorId('p7'), paragraphId: 'p7' });
  });

  it('jumps from the badge to the note entry', () => {
    const target = resolveWriterNoteJump(note({ id: 'n1' }), 'to-note');
    expect(target.anchorId).toBe('fn-n1');
  });

  it('never produces a target that cannot be reached', () => {
    // A note whose paragraph is unknown falls back to its own entry.
    const orphan = resolveWriterNoteJump(note({ id: 'n9', referenceParagraphId: '' }), 'to-reference');
    expect(orphan.anchorId).toBe('fn-n9');
    expect(orphan.paragraphId).toBe('');
  });

  it('matches the anchor id the engine hands to the note entry', () => {
    const notes = [note({ id: 'n1', referenceTextOffset: 1 })];
    const separated = recalculateNotes([para('p1')], notes);
    const entry = separated.footnotes[0]!;
    // The link in the note list and the badge in the text must be built the same way.
    expect(entry.anchorId).toBe(writerNoteEntryAnchorId(entry.note));
    expect(entry.refAnchorId).toBe(writerNoteReferenceAnchorId(entry.note));
  });
});
