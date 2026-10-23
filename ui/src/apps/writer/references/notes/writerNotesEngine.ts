// STATUS: DIAMANT VGT SUPREME — Sovereign Footnote & Endnote Engine
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { FootnoteItem, WriterNoteNumberFormat } from '../../types';
import { writerNoteEntryAnchorId, writerNoteReferenceAnchorId } from './writerNoteNavigation';

export interface FormattedNote {
  note: FootnoteItem;
  displayNumber: string;
  anchorId: string;
  refAnchorId: string;
}

export interface SeparatedNotes {
  footnotes: FormattedNote[];
  endnotes: FormattedNote[];
  /**
   * Notes whose reference paragraph no longer exists. They are kept out of both
   * lists so they cannot be numbered, printed or counted, but they stay in the
   * document so that undoing the deletion restores them.
   */
  orphanedNotes?: FootnoteItem[];
}

/**
 * Converts a 1-based index to lowercase Roman numerals (i, ii, iii, iv, v, ...).
 */
/**
 * The ordering key of a note inside its paragraph.
 *
 * `referenceTextOffset` is what insertion writes today. `referenceSpanIndex` is the
 * former name of the same idea — nothing ever wrote it, so it is read only so a
 * hand-authored file that used it still orders correctly. A missing or unusable value
 * yields 0, which means "unknown" and lets the register order decide.
 */
export function writerNoteReferenceOffset(note: FootnoteItem): number {
  const raw = note.referenceTextOffset ?? note.referenceSpanIndex;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}

export function toRomanNumeral(num: number): string {  if (num <= 0) return '1';
  const romanMap: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
  ];
  let result = '';
  let n = num;
  for (const [val, letter] of romanMap) {
    while (n >= val) {
      result += letter;
      n -= val;
    }
  }
  return result || 'i';
}

/**
 * Converts a 1-based index to lowercase alphabet letters (a, b, c, ... aa, ab, ...).
 */
export function toAlphaLetter(num: number): string {
  if (num <= 0) return 'a';
  let result = '';
  let n = num;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(97 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Formats a note marker based on format specification.
 */
export function formatNoteMarker(
  ordinal: number,
  format: WriterNoteNumberFormat = 'arabic',
  customMark?: string
): string {
  if (customMark && customMark.trim()) {
    return customMark.trim();
  }
  switch (format) {
    case 'roman':
      return toRomanNumeral(ordinal);
    case 'alpha':
      return toAlphaLetter(ordinal);
    case 'symbol': {
      const symbols = ['*', '†', '‡', '§', '‖', '¶'];
      const idx = (ordinal - 1) % symbols.length;
      const repeats = Math.floor((ordinal - 1) / symbols.length) + 1;
      return symbols[idx].repeat(repeats);
    }
    case 'arabic':
    default:
      return String(ordinal);
  }
}

/**
 * Re-indexes and orders footnotes and endnotes strictly by the visual order of paragraphs in the document.
 *
 * Notes whose reference paragraph no longer exists are dropped. Deleting a
 * paragraph never removed its notes, so an orphan stayed in the document: it
 * consumed a number, its text counted towards the statistics, and — worst of all
 * — an orphaned **endnote** was still printed at the end of the document, because
 * the endnote list is rendered without a page filter. Dropping them here fixes
 * every consumer at once (rendering, statistics, navigation, cross references)
 * without touching the stored data, so undoing the deletion brings the note back.
 */
export function recalculateNotes(
  paragraphs: readonly Paragraph[],
  notes: readonly FootnoteItem[]
): SeparatedNotes {
  if (!notes || notes.length === 0) {
    return { footnotes: [], endnotes: [], orphanedNotes: [] };
  }

  // Build a lookup map of paragraph indices
  const pIndexMap = new Map<string, number>();
  paragraphs.forEach((p, idx) => pIndexMap.set(p.id, idx));

  const attached = notes.filter((note) => pIndexMap.has(note.referenceParagraphId));
  const orphanedNotes = notes.filter((note) => !pIndexMap.has(note.referenceParagraphId));

  // Notes follow the text: paragraph order first, then the reference offset inside
  // the paragraph. Without the offset every note of one paragraph ties and the order
  // degrades to insertion order — a note added at the end of a paragraph could be
  // numbered before one that sits at its start.
  const sortedNotes = [...attached].sort((a, b) => {
    const pIdxA = pIndexMap.get(a.referenceParagraphId) ?? 0;
    const pIdxB = pIndexMap.get(b.referenceParagraphId) ?? 0;
    if (pIdxA !== pIdxB) return pIdxA - pIdxB;
    const offsetA = writerNoteReferenceOffset(a);
    const offsetB = writerNoteReferenceOffset(b);
    if (offsetA !== offsetB) return offsetA - offsetB;
    // Same offset (or both unknown): keep the register order, which is insertion
    // order and therefore the only remaining information.
    return 0;
  });

  const footnotes: FormattedNote[] = [];
  const endnotes: FormattedNote[] = [];

  let fnCounter = 1;
  let enCounter = 1;

  for (const note of sortedNotes) {
    const isEndnote = note.noteType === 'endnote';
    if (isEndnote) {
      const format = note.numberFormat || 'roman';
      const displayNumber = formatNoteMarker(enCounter, format, note.customMark);
      endnotes.push({
        note: { ...note, number: enCounter },
        displayNumber,
        anchorId: writerNoteEntryAnchorId(note),
        refAnchorId: writerNoteReferenceAnchorId(note),
      });
      enCounter++;
    } else {
      const format = note.numberFormat || 'arabic';
      const displayNumber = formatNoteMarker(fnCounter, format, note.customMark);
      footnotes.push({
        note: { ...note, number: fnCounter },
        displayNumber,
        anchorId: writerNoteEntryAnchorId(note),
        refAnchorId: writerNoteReferenceAnchorId(note),
      });
      fnCounter++;
    }
  }

  return { footnotes, endnotes, orphanedNotes };
}

/**
 * Retrieves all footnotes anchored to paragraphs appearing on a specific page.
 *
 * The caller passes the paragraphs whose **last** fragment is on this page (see
 * `WriterPagePaper`). That matters: a paragraph running over several pages appears
 * on each of them, and the pagination reserves the note's space on the last
 * fragment — so the note is printed there and nowhere else.
 */
export function getPageFootnotes(
  pageParagraphs: readonly Paragraph[],
  allFootnotes: readonly FormattedNote[]
): FormattedNote[] {
  const pagePIds = new Set(pageParagraphs.map((p) => p.id));
  return allFootnotes.filter((fn) => pagePIds.has(fn.note.referenceParagraphId));
}
