// STATUS: DIAMANT VGT SUPREME — Tab-stop normalization and layout tests
import { describe, expect, it } from 'vitest';
import type { WriterTabStop } from '../../../../../../shared/contracts/workspace';
import {
  insertWriterTabAtRange,
  layoutWriterTabbedLine,
  normalizeWriterTabStops,
  writerTabLeaderCharacters,
  WRITER_MAX_TAB_STOPS,
} from '../../../../formatting/tabs/writerTabStops';

describe('Writer tab stops', () => {
  it('sorts, deduplicates and bounds imported tab-stop arrays', () => {
    const hostile = Array.from({ length: WRITER_MAX_TAB_STOPS + 8 }, (_, index): WriterTabStop => ({
      id: index === 0 ? '<script>' : `stop-${index}`,
      positionMm: index === 0 ? Number.POSITIVE_INFINITY : index % 2 === 0 ? 25 : 25.001,
      alignment: 'left',
      leader: 'none',
    }));
    const normalized = normalizeWriterTabStops(hostile);
    expect(normalized.length).toBeLessThanOrEqual(WRITER_MAX_TAB_STOPS);
    expect(normalized[0]?.id).not.toContain('<');
    expect(normalized.every((stop) => stop.positionMm >= 1 && stop.positionMm <= 500)).toBe(true);
    expect(normalized.every((stop) => stop.decimalCharacter === undefined)).toBe(true);
    expect(normalized.map((stop) => stop.positionMm)).toEqual(
      [...normalized.map((stop) => stop.positionMm)].sort((left, right) => left - right),
    );
  });

  it('replaces a selected range with one canonical tab and returns its caret', () => {
    expect(insertWriterTabAtRange('Alpha Beta', 5, 10)).toEqual({ text: 'Alpha\t', caret: 6 });
  });

  it('assigns left, right, center and decimal stops in stable ordinal order', () => {
    const stops: WriterTabStop[] = [
      { id: 'left', positionMm: 20, alignment: 'left', leader: 'dots' },
      { id: 'right', positionMm: 50, alignment: 'right', leader: 'dashes' },
      { id: 'center', positionMm: 80, alignment: 'center', leader: 'underline' },
      { id: 'decimal', positionMm: 110, alignment: 'decimal', leader: 'none', decimalCharacter: ',' },
    ];
    const segments = layoutWriterTabbedLine('A\tB\tC\tD\t123,45', stops);
    expect(segments.map((segment) => segment.alignment)).toEqual(['left', 'left', 'right', 'center', 'decimal']);
    expect(segments.at(-1)?.decimalCharacter).toBe(',');
  });

  it('caps generated leader text to a bounded allocation', () => {
    expect(writerTabLeaderCharacters('dots', 10)).toBe('..........');
    expect(writerTabLeaderCharacters('underline', 100_000)).toHaveLength(256);
    expect(writerTabLeaderCharacters('none', 100)).toBe('');
  });
});
