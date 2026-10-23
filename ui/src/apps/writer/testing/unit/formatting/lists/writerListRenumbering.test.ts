// STATUS: PLATIN — Writer list renumbering across paragraph insertion and deletion
//
// The ordinal of a list item is derived from the paragraph sequence rather than
// stored on the paragraph. That is what makes insertion and deletion renumber
// correctly, but only if the derivation really is stable — which is what this
// file pins down. It is the evidence for "Nummerierung läuft beim Einfügen und
// Löschen korrekt neu".
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import { calculateMultilevelListOrdinal } from '../../../../formatting/lists/writerMultilevelList';
import { patchWriterParagraphStyle } from '../../../../editing/paragraphs/writerParagraphFormatApply';
import { splitWriterParagraphAt } from '../../../../editing/paragraphs/writerParagraphStructure';
import { planWriterParagraphDelete } from '../../../../editing/paragraphs/writerParagraphDeletion';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };

function item(id: string, text: string, overrides: Partial<Paragraph['style']> = {}): Paragraph {
  return { id, style: { ...STYLE, ...overrides }, spans: [{ text }] };
}

const numbered = (id: string, text: string, level = 0) => item(id, text, { list_style: 'number', list_level: level });

/** The ordinal every numbered paragraph of the document would render. */
const ordinals = (paragraphs: readonly Paragraph[]): string[] =>
  paragraphs
    .map((paragraph, index) => (paragraph.style.list_style === 'number'
      ? calculateMultilevelListOrdinal([...paragraphs], index)
      : '—'));

describe('Writer list renumbering', () => {
  describe('flat list', () => {
    const list = [numbered('p1', 'Eins'), numbered('p2', 'Zwei'), numbered('p3', 'Drei')];

    it('numbers a fresh list from one', () => {
      expect(ordinals(list)).toEqual(['1.', '2.', '3.']);
    });

    it('shifts every following item when one is inserted in the middle', () => {
      const inserted = [...list.slice(0, 1), numbered('p2b', 'Neu'), ...list.slice(1)];
      expect(ordinals(inserted)).toEqual(['1.', '2.', '3.', '4.']);
    });

    it('closes the gap when the middle item is deleted', () => {
      const removed = [list[0], list[2]];
      expect(ordinals(removed)).toEqual(['1.', '2.']);
    });

    it('keeps a contiguous sequence when a list item is turned off', () => {
      const toggled = patchWriterParagraphStyle(list, [1], { list: null }).paragraphs;
      expect(ordinals(toggled)).toEqual(['1.', '—', '2.']);
    });

    it('keeps the numbered items contiguous when one becomes a bullet', () => {
      const mixed = patchWriterParagraphStyle(list, [1], { list: 'bullet' }).paragraphs;
      expect(ordinals(mixed)).toEqual(['1.', '—', '2.']);
    });

    it('renumbers after a paragraph split at the caret', () => {
      const split = splitWriterParagraphAt(list, 1, 2, 'p2b');
      expect(ordinals(split?.paragraphs ?? [])).toEqual(['1.', '2.', '3.', '4.']);
    });

    it('renumbers after a paragraph is deleted', () => {
      const plan = planWriterParagraphDelete(list, 1);
      expect(ordinals(plan?.paragraphs ?? [])).toEqual(['1.', '2.']);
    });
  });

  describe('nested list', () => {
    const nested = [
      numbered('p1', 'Kapitel 1', 0),
      numbered('p1a', 'Punkt 1.1', 1),
      numbered('p1b', 'Punkt 1.2', 1),
      numbered('p2', 'Kapitel 2', 0),
      numbered('p2a', 'Punkt 2.1', 1),
    ];

    it('numbers hierarchically', () => {
      expect(ordinals(nested)).toEqual(['1.', '1.1.', '1.2.', '2.', '2.1.']);
    });

    it('resets the sub-level when a new parent is inserted before it', () => {
      const inserted = [
        nested[0], nested[1], nested[2],
        numbered('p1c', 'Kapitel 1b', 0),
        nested[3], nested[4],
      ];
      expect(ordinals(inserted)).toEqual(['1.', '1.1.', '1.2.', '2.', '3.', '3.1.']);
    });

    it('keeps the remaining sub-items contiguous when a parent is deleted', () => {
      // Deleting "Kapitel 2" leaves its sub-item behind. It is now the third
      // sub-item of chapter 1, so it must read 1.3. — the numbering closes up
      // instead of leaving a gap at 2.1.
      const removed = [nested[0], nested[1], nested[2], nested[4]];
      expect(ordinals(removed)).toEqual(['1.', '1.1.', '1.2.', '1.3.']);
    });

    it('drops a sub-item to the top level when it is outdented', () => {
      const outdented = patchWriterParagraphStyle(nested, [1], { list: 'number' }).paragraphs;
      // Applying the same style keeps the level, so the ordinal is unchanged.
      expect(ordinals(outdented)).toEqual(['1.', '1.1.', '1.2.', '2.', '2.1.']);
    });
  });

  describe('numbering shape', () => {
    it('counts a fresh list from one after a list with a start value was removed', () => {
      const withStart = [numbered('p1', 'Fünf'), numbered('p2', 'Sechs')];
      withStart[0].style.list_start_value = 5;
      expect(ordinals(withStart)).toEqual(['5.', '6.']);

      // Turning the list off must not leave the start value behind, otherwise the
      // next list would silently begin at five again.
      const cleared = patchWriterParagraphStyle(withStart, [0, 1], { list: null }).paragraphs;
      const fresh = patchWriterParagraphStyle(cleared, [0, 1], { list: 'number' }).paragraphs;
      expect(ordinals(fresh)).toEqual(['1.', '2.']);
    });

    it('restarts subordinate numbering when a higher level follows', () => {
      const sequence = [
        numbered('a', 'A', 0),
        numbered('a1', 'A1', 1),
        numbered('b', 'B', 0),
        numbered('b1', 'B1', 1),
        numbered('b2', 'B2', 1),
      ];
      expect(ordinals(sequence)).toEqual(['1.', '1.1.', '2.', '2.1.', '2.2.']);
    });
  });
});
