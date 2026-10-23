// STATUS: PLATIN — Legacy flow-break marker normalisation contracts
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  hasWriterBreakMarker,
  hasWriterColumnBreakMarker,
  hasWriterPageBreakMarker,
  normalizeWriterBreakMarkers,
  stripWriterBreakMarkersFromText,
  writerBreakMarkerKinds,
  WRITER_COLUMN_BREAK_MARKER,
  WRITER_PAGE_BREAK_MARKER,
} from '../../../../editing/flow-breaks/writerBreakMarkers';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };

const para = (id: string, spans: Paragraph['spans'], overrides: Partial<Paragraph['style']> = {}): Paragraph => ({
  id,
  style: { ...STYLE, ...overrides },
  spans,
});

const text = (p: Paragraph) => p.spans.map((s) => s.text).join('');

describe('Writer break markers', () => {
  describe('detection', () => {
    it('recognises each marker', () => {
      expect(hasWriterPageBreakMarker(`a${WRITER_PAGE_BREAK_MARKER}b`)).toBe(true);
      expect(hasWriterColumnBreakMarker(`a${WRITER_COLUMN_BREAK_MARKER}b`)).toBe(true);
      expect(hasWriterPageBreakMarker('normaler Text')).toBe(false);
      expect(hasWriterBreakMarker('---PAGEBREAK--')).toBe(false);
    });

    it('reports the kinds a paragraph carries', () => {
      expect(writerBreakMarkerKinds(para('p1', [{ text: `A${WRITER_PAGE_BREAK_MARKER}` }]))).toEqual(['page']);
      expect(writerBreakMarkerKinds(para('p1', [{ text: `A${WRITER_COLUMN_BREAK_MARKER}` }]))).toEqual(['column']);
      expect(writerBreakMarkerKinds(para('p1', [
        { text: WRITER_PAGE_BREAK_MARKER },
        { text: WRITER_COLUMN_BREAK_MARKER },
      ]))).toEqual(['page', 'column']);
      expect(writerBreakMarkerKinds(para('p1', [{ text: 'Text' }]))).toEqual([]);
    });
  });

  describe('stripping', () => {
    it('removes a marker wherever it sits', () => {
      expect(stripWriterBreakMarkersFromText(`Anfang${WRITER_PAGE_BREAK_MARKER}Ende`)).toBe('AnfangEnde');
      expect(stripWriterBreakMarkersFromText(`${WRITER_PAGE_BREAK_MARKER}Text`)).toBe('Text');
      expect(stripWriterBreakMarkersFromText(`Text${WRITER_COLUMN_BREAK_MARKER}`)).toBe('Text');
    });

    it('removes repeated markers', () => {
      expect(stripWriterBreakMarkersFromText(
        `${WRITER_PAGE_BREAK_MARKER}a${WRITER_PAGE_BREAK_MARKER}b${WRITER_COLUMN_BREAK_MARKER}`,
      )).toBe('ab');
    });

    it('leaves ordinary text alone', () => {
      const source = 'Ein Text mit --- Strichen und -- Zeichen.';
      expect(stripWriterBreakMarkersFromText(source)).toBe(source);
    });
  });

  describe('normalisation', () => {
    it('moves a page marker into the flag and removes the text', () => {
      const result = normalizeWriterBreakMarkers([
        para('p1', [{ text: `Erster Teil${WRITER_PAGE_BREAK_MARKER}` }]),
        para('p2', [{ text: 'Zweiter Teil' }]),
      ]);
      expect(result.changedCount).toBe(1);
      expect(result.paragraphs[0]?.style.page_break_before).toBe(true);
      expect(text(result.paragraphs[0]!)).toBe('Erster Teil');
      expect(result.paragraphs[1]).toBe(result.paragraphs[1]);
    });

    it('keeps the text that surrounded the marker', () => {
      const result = normalizeWriterBreakMarkers([para('p1', [{ text: `vor${WRITER_PAGE_BREAK_MARKER}nach` }])]);
      expect(text(result.paragraphs[0]!)).toBe('vornach');
    });

    it('drops a span that held nothing but the marker but keeps one span', () => {
      const result = normalizeWriterBreakMarkers([para('p1', [{ text: WRITER_PAGE_BREAK_MARKER }])]);
      expect(result.paragraphs[0]?.spans).toHaveLength(1);
      expect(text(result.paragraphs[0]!)).toBe('');
    });

    it('preserves the formatting of the surrounding spans', () => {
      const result = normalizeWriterBreakMarkers([para('p1', [
        { text: 'fett', bold: true },
        { text: WRITER_PAGE_BREAK_MARKER },
        { text: 'normal' },
      ])]);
      expect(result.paragraphs[0]?.spans).toEqual([{ text: 'fett', bold: true }, { text: 'normal' }]);
      expect(result.paragraphs[0]?.style.page_break_before).toBe(true);
    });

    it('maps a column marker to the column flag', () => {
      const result = normalizeWriterBreakMarkers([para('p1', [{ text: `${WRITER_COLUMN_BREAK_MARKER}` }])]);
      expect(result.paragraphs[0]?.style.column_break_before).toBe(true);
      expect(result.paragraphs[0]?.style.page_break_before).toBeUndefined();
    });

    it('prefers the page flag when a paragraph carries both markers', () => {
      const result = normalizeWriterBreakMarkers([para('p1', [
        { text: `${WRITER_COLUMN_BREAK_MARKER}x${WRITER_PAGE_BREAK_MARKER}` },
      ])]);
      expect(result.paragraphs[0]?.style.page_break_before).toBe(true);
      expect(result.paragraphs[0]?.style.column_break_before).toBeUndefined();
    });

    it('leaves an existing flag in place', () => {
      const result = normalizeWriterBreakMarkers([
        para('p1', [{ text: 'Text' }], { page_break_before: true }),
      ]);
      expect(result.changedCount).toBe(0);
      expect(result.paragraphs[0]?.style.page_break_before).toBe(true);
    });

    it('reports no change for a canonical document', () => {
      const source = [para('p1', [{ text: 'A' }]), para('p2', [{ text: 'B' }], { page_break_before: true })];
      const result = normalizeWriterBreakMarkers(source);
      expect(result.changedCount).toBe(0);
      expect(result.paragraphs[0]).toBe(source[0]);
      expect(result.paragraphs[1]).toBe(source[1]);
    });

    it('does not mutate the input document', () => {
      const source = [para('p1', [{ text: `A${WRITER_PAGE_BREAK_MARKER}` }])];
      const snapshot = JSON.stringify(source);
      normalizeWriterBreakMarkers(source);
      expect(JSON.stringify(source)).toBe(snapshot);
    });

    it('is idempotent', () => {
      const once = normalizeWriterBreakMarkers([para('p1', [{ text: `A${WRITER_PAGE_BREAK_MARKER}B` }])]);
      const twice = normalizeWriterBreakMarkers(once.paragraphs);
      expect(twice.changedCount).toBe(0);
      expect(text(twice.paragraphs[0]!)).toBe('AB');
    });
  });
});
