// STATUS: DIAMANT VGT SUPREME — Paragraph and hierarchical list sorting verification
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  parseWriterSortDate,
  parseWriterSortNumber,
  resolveWriterSortRange,
  sortWriterParagraphs,
  type WriterSortOptions,
} from '../../../../formatting/sorting/writerSort';

const paragraph = (
  id: string,
  text: string,
  patch: Partial<Paragraph['style']> = {},
): Paragraph => ({
  id,
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8, ...patch },
  spans: [{ text }],
});

const defaults: WriterSortOptions = {
  dataType: 'text',
  direction: 'ascending',
  keySeparator: 'whole',
  keyIndex: 1,
  caseSensitive: false,
  locale: 'de-DE',
};

describe('Writer paragraph and list sorting', () => {
  it('bounds a paragraph block by headings, page breaks and section starts', () => {
    const source = [
      paragraph('heading', 'Titel', { heading_level: 1 }),
      paragraph('b', 'Beta'),
      paragraph('a', 'Alpha'),
      paragraph('section', 'Abschnittsbeginn'),
      paragraph('after', 'Danach'),
    ];
    expect(resolveWriterSortRange(source, 'b', ['section'])).toMatchObject({
      startIndex: 1,
      endIndex: 2,
      unitCount: 2,
      kind: 'paragraphs',
      sortable: true,
    });
    expect(resolveWriterSortRange(source, 'section', ['section']).sortable).toBe(false);
  });

  it('sorts localized text stably without mutating the input', () => {
    const source = [paragraph('z', 'Zebra'), paragraph('a1', 'Ähre'), paragraph('a2', 'ähre')];
    const result = sortWriterParagraphs(source, 'z', defaults);
    expect(result.paragraphs.map(({ id }) => id)).toEqual(['a1', 'a2', 'z']);
    expect(source.map(({ id }) => id)).toEqual(['z', 'a1', 'a2']);
    expect(result.changed).toBe(true);
  });

  it('sorts a selected delimited numeric field with German separators', () => {
    const source = [paragraph('low', 'A\t1.234,50'), paragraph('high', 'B\t12.000,00')];
    const result = sortWriterParagraphs(source, 'low', {
      ...defaults,
      dataType: 'number',
      direction: 'descending',
      keySeparator: 'tab',
      keyIndex: 2,
    });
    expect(result.paragraphs.map(({ id }) => id)).toEqual(['high', 'low']);
    expect(parseWriterSortNumber('(1.234,50 €)', 'de-DE')).toBe(-1234.5);
  });

  it('parses locale-aware calendar dates and rejects impossible dates', () => {
    expect(parseWriterSortDate('31.12.2026', 'de-DE')).toBe(Date.UTC(2026, 11, 31));
    expect(parseWriterSortDate('12/31/2026', 'en-US')).toBe(Date.UTC(2026, 11, 31));
    expect(parseWriterSortDate('31.02.2026', 'de-DE')).toBeNull();
  });

  it('moves nested list children atomically with their parent item', () => {
    const source = [
      paragraph('b', 'Beta', { list_style: 'number', list_level: 0 }),
      paragraph('b-child', 'Child B', { list_style: 'bullet', list_level: 1 }),
      paragraph('a', 'Alpha', { list_style: 'number', list_level: 0 }),
      paragraph('a-child', 'Child A', { list_style: 'checklist', list_level: 1 }),
      paragraph('tail', 'Tail'),
    ];
    const result = sortWriterParagraphs(source, 'b', defaults);
    expect(result.range).toMatchObject({ kind: 'list', unitCount: 2, paragraphCount: 4 });
    expect(result.paragraphs.map(({ id }) => id)).toEqual(['a', 'a-child', 'b', 'b-child', 'tail']);
  });

  it('keeps invalid typed values last in both directions', () => {
    const source = [paragraph('invalid', 'unbekannt'), paragraph('two', '2'), paragraph('ten', '10')];
    const result = sortWriterParagraphs(source, 'invalid', {
      ...defaults,
      dataType: 'number',
      direction: 'descending',
    });
    expect(result.paragraphs.map(({ id }) => id)).toEqual(['ten', 'two', 'invalid']);
  });

  it('returns an unchanged copy when the active range has one item', () => {
    const source = [paragraph('heading', 'Titel', { heading_level: 1 }), paragraph('only', 'Einzeln')];
    const result = sortWriterParagraphs(source, 'only', defaults);
    expect(result.changed).toBe(false);
    expect(result.paragraphs).not.toBe(source);
    expect(result.paragraphs).toEqual(source);
  });
});
