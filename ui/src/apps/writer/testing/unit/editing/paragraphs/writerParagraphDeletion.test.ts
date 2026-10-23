// STATUS: PLATIN — Writer paragraph deletion contracts (last paragraph stays editable)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  canDeleteWriterParagraph,
  planWriterParagraphDelete,
} from '../../../../editing/paragraphs/writerParagraphDeletion';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };

function paragraph(id: string, text: string): Paragraph {
  return { id, style: { ...STYLE }, spans: [{ text }] };
}

describe('Writer paragraph deletion', () => {
  describe('canDeleteWriterParagraph', () => {
    it('refuses to remove the last remaining paragraph', () => {
      expect(canDeleteWriterParagraph(0)).toBe(false);
      expect(canDeleteWriterParagraph(1)).toBe(false);
    });

    it('allows removal while more than one paragraph exists', () => {
      expect(canDeleteWriterParagraph(2)).toBe(true);
      expect(canDeleteWriterParagraph(7)).toBe(true);
      expect(canDeleteWriterParagraph(2.9)).toBe(true);
    });

    it('fails closed for non-finite counts', () => {
      expect(canDeleteWriterParagraph(Number.NaN)).toBe(false);
      expect(canDeleteWriterParagraph(Number.POSITIVE_INFINITY)).toBe(false);
      expect(canDeleteWriterParagraph(-3)).toBe(false);
    });
  });

  describe('planWriterParagraphDelete', () => {
    it('continues at the end of the paragraph above when deleting in the middle', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta gamma'), paragraph('p3', 'Delta')];
      const plan = planWriterParagraphDelete(paragraphs, 2);
      expect(plan?.paragraphs.map((p) => p.id)).toEqual(['p1', 'p2']);
      expect(plan?.removedParagraphId).toBe('p3');
      expect(plan?.removedIndex).toBe(2);
      expect(plan?.selectedParagraphId).toBe('p2');
      expect(plan?.caretOffset).toBe(10);
    });

    it('selects the new first paragraph at offset 0 when the first one is deleted', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      const plan = planWriterParagraphDelete(paragraphs, 0);
      expect(plan?.paragraphs.map((p) => p.id)).toEqual(['p2']);
      expect(plan?.selectedParagraphId).toBe('p2');
      expect(plan?.caretOffset).toBe(0);
    });

    it('leaves a single empty paragraph when every other paragraph was removed', () => {
      let paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta'), paragraph('p3', 'Gamma')];
      let plan = planWriterParagraphDelete(paragraphs, 2);
      expect(plan).not.toBeNull();
      if (!plan) return;
      paragraphs = plan.paragraphs;
      plan = planWriterParagraphDelete(paragraphs, 1);
      expect(plan).not.toBeNull();
      if (!plan) return;
      paragraphs = plan.paragraphs;
      expect(paragraphs).toHaveLength(1);
      expect(paragraphs[0]?.id).toBe('p1');
      // The remaining paragraph is the writing position, so it must stay removable-from-nothing.
      expect(canDeleteWriterParagraph(paragraphs.length)).toBe(false);
      expect(planWriterParagraphDelete(paragraphs, 0)).toBeNull();
    });

    it('refuses to delete the only paragraph', () => {
      expect(planWriterParagraphDelete([paragraph('p1', 'Alpha')], 0)).toBeNull();
      expect(planWriterParagraphDelete([], 0)).toBeNull();
    });

    it('rejects invalid indexes instead of persisting an unchanged document', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      expect(planWriterParagraphDelete(paragraphs, -1)).toBeNull();
      expect(planWriterParagraphDelete(paragraphs, 2)).toBeNull();
      expect(planWriterParagraphDelete(paragraphs, 1.5)).toBeNull();
    });

    it('counts the caret offset across formatting spans', () => {
      const rich: Paragraph = {
        id: 'p1',
        style: { ...STYLE },
        spans: [{ text: 'Bold', bold: true }, { text: ' tail', italic: true }],
      };
      const plan = planWriterParagraphDelete([rich, paragraph('p2', 'Next')], 1);
      expect(plan?.selectedParagraphId).toBe('p1');
      expect(plan?.caretOffset).toBe(9);
    });

    it('does not mutate the input paragraphs', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      const snapshot = JSON.stringify(paragraphs);
      planWriterParagraphDelete(paragraphs, 1);
      expect(JSON.stringify(paragraphs)).toBe(snapshot);
    });

    it('never returns an empty paragraph list', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      for (let index = 0; index < paragraphs.length; index += 1) {
        const plan = planWriterParagraphDelete(paragraphs, index);
        expect((plan?.paragraphs.length ?? 0)).toBeGreaterThan(0);
      }
    });
  });
});
