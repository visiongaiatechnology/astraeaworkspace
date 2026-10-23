// STATUS: PLATIN — DOM selection → editor state bridge (pure)
//
// ASTRAEA WRITER 50 V2 · M1 (WR-002/WR-016). The surface reads a real DOM range;
// this module decides what that means for the editor state. What is asserted here
// is the part a browser cannot fake: which paragraph owns the caret, which
// paragraphs the range covers, and whether a stale selection is refused instead of
// silently moving the insertion point.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import {
  readWriterSurfaceRangeText,
  resolveWriterSurfaceSelectionReport,
  writerSurfaceCaretRange,
  writerSurfaceSelectionReportsEqual,
} from '../../../editor/surface/writerSelectionBridge';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

const DOC: Paragraph[] = [
  paragraph('p1', 'Hallo Astraea'),
  paragraph('p2', 'Zweiter Absatz'),
  paragraph('p3', 'Dritter Absatz'),
];

describe('resolveWriterSurfaceSelectionReport', () => {
  it('reports a collapsed caret in one paragraph', () => {
    const report = resolveWriterSurfaceSelectionReport(DOC, writerSurfaceCaretRange('p2', 4, 4));
    expect(report).not.toBeNull();
    expect(report!.activeParagraphId).toBe('p2');
    expect(report!.textSelection).toEqual({ paragraphId: 'p2', start: 4, end: 4 });
    expect(report!.rangeSelection).toBeNull();
    expect(report!.spansParagraphs).toBe(false);
    expect(report!.coveredParagraphIds).toEqual([]);
  });

  it('orders a backwards range without moving the anchor', () => {
    const report = resolveWriterSurfaceSelectionReport(DOC, {
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p1', offset: 2 },
    });
    expect(report!.textSelection).toEqual({ paragraphId: 'p1', start: 2, end: 6 });
    expect(report!.collapsed).toBe(false);
  });

  it('reports a range that crosses paragraphs as covered paragraphs', () => {
    const report = resolveWriterSurfaceSelectionReport(DOC, {
      anchor: { paragraphId: 'p1', offset: 3 },
      focus: { paragraphId: 'p3', offset: 5 },
    });
    expect(report).not.toBeNull();
    expect(report!.spansParagraphs).toBe(true);
    expect(report!.coveredParagraphIds).toEqual(['p1', 'p2', 'p3']);
    expect(report!.rangeSelection).toEqual({
      anchor: { paragraphId: 'p1', offset: 3 },
      focus: { paragraphId: 'p3', offset: 5 },
    });
    // The focus paragraph owns the caret, exactly as in a word processor.
    expect(report!.activeParagraphId).toBe('p3');
  });

  it('clamps an offset that the model does not have', () => {
    const report = resolveWriterSurfaceSelectionReport(DOC, writerSurfaceCaretRange('p1', 0, 999));
    expect(report!.textSelection.end).toBe(13);
  });

  it('refuses a stale selection instead of silently moving the caret', () => {
    // A paragraph that a re-pagination removed must not become "offset 0 of
    // something else" — the caller keeps its previous state.
    expect(resolveWriterSurfaceSelectionReport(DOC, writerSurfaceCaretRange('gone', 0, 0))).toBeNull();
    expect(resolveWriterSurfaceSelectionReport([], writerSurfaceCaretRange('p1', 0, 0))).toBeNull();
  });

  it('treats a non-finite offset as the paragraph start rather than as NaN', () => {
    const report = resolveWriterSurfaceSelectionReport(DOC, {
      anchor: { paragraphId: 'p2', offset: Number.NaN },
      focus: { paragraphId: 'p2', offset: 2 },
    });
    expect(report!.textSelection.start).toBe(0);
  });
});

describe('writerSurfaceSelectionReportsEqual', () => {
  const a = resolveWriterSurfaceSelectionReport(DOC, writerSurfaceCaretRange('p1', 1, 1));
  const b = resolveWriterSurfaceSelectionReport(DOC, writerSurfaceCaretRange('p1', 1, 1));
  const c = resolveWriterSurfaceSelectionReport(DOC, writerSurfaceCaretRange('p1', 2, 2));

  it('treats two reads of the same caret as equal — no render per selectionchange tick', () => {
    expect(writerSurfaceSelectionReportsEqual(a, b)).toBe(true);
  });

  it('sees a moved caret', () => {
    expect(writerSurfaceSelectionReportsEqual(a, c)).toBe(false);
  });

  it('handles the absent report', () => {
    expect(writerSurfaceSelectionReportsEqual(null, null)).toBe(true);
    expect(writerSurfaceSelectionReportsEqual(a, null)).toBe(false);
  });
});

describe('readWriterSurfaceRangeText', () => {
  it('joins a cross-paragraph range with line breaks', () => {
    expect(readWriterSurfaceRangeText(DOC, {
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p2', offset: 6 },
    })).toBe('Astraea\nZweite');
  });

  it('returns the head and tail slice of one paragraph', () => {
    expect(readWriterSurfaceRangeText(DOC, {
      anchor: { paragraphId: 'p1', offset: 0 },
      focus: { paragraphId: 'p1', offset: 5 },
    })).toBe('Hallo');
  });
});
