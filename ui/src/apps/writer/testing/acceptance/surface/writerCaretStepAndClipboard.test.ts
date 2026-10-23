// STATUS: PLATIN — Caret steps and copy serialisation as pure functions (WR-017/WR-019)
//
// These two decisions were the blind spots of the happy-dom tests: the caret steps
// were left to the browser (which placed none), and the clipboard was written by
// the browser (which dropped the run formatting). Both are pure functions now, so
// they can be proven without a layout engine.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { resolveWriterCaretStepTarget } from '../../../editing/caret/writerCaretStep';
import { serializeWriterSelectionForClipboard } from '../../../editing/clipboard/writerClipboardSerialize';
import { parseWriterClipboardHtml } from '../../../editing/clipboard/writerClipboardPayload';

function paragraph(id: string, spans: Paragraph['spans']): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans,
  };
}

const twoParagraphs = [
  paragraph('p1', [{ text: 'Hallo' }]),
  paragraph('p2', [{ text: 'schöne Welt' }]),
];

describe('WR-017 — resolveWriterCaretStepTarget', () => {
  it('steps one character and stops at the document edges', () => {
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p1', offset: 2 }, 'char-backward'))
      .toEqual({ paragraphId: 'p1', offset: 1 });
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p1', offset: 0 }, 'char-backward'))
      .toEqual({ paragraphId: 'p1', offset: 0 });
    // 'schöne Welt' is 11 characters long.
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p2', offset: 11 }, 'char-forward'))
      .toEqual({ paragraphId: 'p2', offset: 11 });
  });

  it('crosses the paragraph boundary in both directions', () => {
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p1', offset: 5 }, 'char-forward'))
      .toEqual({ paragraphId: 'p2', offset: 0 });
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p2', offset: 0 }, 'char-backward'))
      .toEqual({ paragraphId: 'p1', offset: 5 });
  });

  it('jumps words without leaving the document', () => {
    const one = [paragraph('p1', [{ text: 'Hallo schöne Welt' }])];
    // Forward from the start clears the first word (the step includes the space
    // behind it, like every word-processor does).
    expect(resolveWriterCaretStepTarget(one, { paragraphId: 'p1', offset: 0 }, 'word-forward'))
      .toEqual({ paragraphId: 'p1', offset: 5 });
    // At the very start a word jump leaves the paragraph through its predecessor.
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p2', offset: 0 }, 'word-backward'))
      .toEqual({ paragraphId: 'p1', offset: 5 });
    // At the end of a paragraph it continues in the next one.
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p1', offset: 5 }, 'word-forward'))
      .toEqual({ paragraphId: 'p2', offset: 0 });
  });
  it('addresses the paragraph on Home/End', () => {
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p2', offset: 4 }, 'paragraph-start'))
      .toEqual({ paragraphId: 'p2', offset: 0 });
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'p2', offset: 4 }, 'paragraph-end'))
      .toEqual({ paragraphId: 'p2', offset: 11 });
  });

  it('returns null for a paragraph that no longer exists', () => {
    expect(resolveWriterCaretStepTarget(twoParagraphs, { paragraphId: 'weg', offset: 0 }, 'char-forward')).toBeNull();
  });
});

describe('WR-019 — clipboard serialisation', () => {
  it('writes semantic HTML and plain text for a marked range', () => {
    const paragraphs = [paragraph('p1', [{ text: 'Hallo ' }, { text: 'fett', bold: true }, { text: ' Welt' }])];
    const slice = serializeWriterSelectionForClipboard(paragraphs, {
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p1', offset: 10 },
    });

    expect(slice?.text).toBe('fett');
    expect(slice?.html).toContain('<strong');
    expect(slice?.html).toContain('data-writer-span-key="b|||');
    // The round trip through the parser gives the format back.
    const parsed = parseWriterClipboardHtml(slice!.html);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.spans.map((span) => [span.text, Boolean(span.bold)])).toEqual([['fett', true]]);
  });

  it('separates paragraphs with a line break in the plain text', () => {
    const paragraphs = [
      paragraph('p1', [{ text: 'eins' }]),
      paragraph('p2', [{ text: 'zwei' }]),
    ];
    const slice = serializeWriterSelectionForClipboard(paragraphs, {
      anchor: { paragraphId: 'p1', offset: 0 },
      focus: { paragraphId: 'p2', offset: 4 },
    });
    expect(slice?.text).toBe('eins\nzwei');
    expect(slice?.html).toBe('<p><span data-writer-span-key="||||||">eins</span></p><p><span data-writer-span-key="||||||">zwei</span></p>');
  });

  it('refuses an empty selection instead of clearing the clipboard', () => {
    const paragraphs = [paragraph('p1', [{ text: 'Hallo' }])];
    expect(serializeWriterSelectionForClipboard(paragraphs, {
      anchor: { paragraphId: 'p1', offset: 3 },
      focus: { paragraphId: 'p1', offset: 3 },
    })).toBeNull();
  });

  it('escapes markup from the model text', () => {
    const paragraphs = [paragraph('p1', [{ text: '<b>kein Markup</b>' }])];
    const slice = serializeWriterSelectionForClipboard(paragraphs, {
      anchor: { paragraphId: 'p1', offset: 0 },
      focus: { paragraphId: 'p1', offset: 18 },
    });
    expect(slice?.html).not.toContain('<b>');
    expect(slice?.html).toContain('&lt;b&gt;');
    expect(parseWriterClipboardHtml(slice!.html)[0]!.spans.map((span) => span.text).join('')).toBe('<b>kein Markup</b>');
  });
});
