import { describe, expect, it } from 'vitest';
import { exportSearchResultsCsv, importSearchResultsCsv } from '../searchInterchangeCore';
import type { SearchHubHit } from '../searchTypes';

const HEADER = 'document_id,document_title,module,object_id,object_type,field,snippet,deep_link,score';
const CASE_COUNT = 4_096;
const VALID_CASES = 1_024;
const MUTATION_BYTES = 64 * 1_024;
const MAX_CELL_CHARS = 64 * 1_024;
const MAX_CSV_BYTES = 16 * 1_024 * 1_024;
const MAX_DATA_ROWS = 10_000;
const FIELD_NAMES = ['documentId', 'documentTitle', 'module', 'objectId', 'objectType', 'field', 'snippet', 'deepLink', 'score'] as const;
const STRING_FIELDS = ['documentId', 'documentTitle', 'module', 'objectId', 'objectType', 'field', 'snippet', 'deepLink'] as const;

type ImportedRow = ReturnType<typeof importSearchResultsCsv>[number];

function createHit(index: number): SearchHubHit {
  const titleVariants = [
    `Quarterly review ${index}`,
    `Revenue, ${index}`,
    `Quoted "document" ${index}`,
    `First line\nSecond line ${index}`,
    `First line\r\nSecond line ${index}`,
    `Unicode 🔐 café ${index}`,
    `Leading and trailing spaces ${index} `,
    `Tab\tseparator ${index}`,
  ];
  const snippet = index % 127 === 1
    ? 'x'.repeat(60 * 1_024)
    : titleVariants[(index + 3) % titleVariants.length];
  return {
    documentId: `document-${index}`,
    documentTitle: titleVariants[index % titleVariants.length],
    documentKind: 'Writer',
    objectId: `paragraph-${index}`,
    objectType: 'Paragraph',
    field: index % 2 === 0 ? 'body' : 'summary',
    snippet,
    lexicalScore: 0.25,
    finalScore: (index - 512) / 97,
    modifiedAt: 1_700_000_000_000 + index,
    deepLink: `astraea://workspace/document-${index}?focus=paragraph-${index}`,
    group: 'documents',
    why: [],
    metadataProtected: false,
  };
}

function expectedFromHit(hit: SearchHubHit): ImportedRow {
  return {
    documentId: hit.documentId,
    documentTitle: hit.documentTitle,
    module: hit.documentKind,
    objectId: hit.objectId,
    objectType: hit.objectType,
    field: hit.field,
    snippet: hit.snippet,
    deepLink: hit.deepLink,
    score: hit.finalScore,
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validCase(index: number): { input: string; expected: ImportedRow[] } {
  if (index % 8 === 0) {
    return { input: `${HEADER}\r\n`, expected: [] };
  }
  const hits = index % 11 === 0 ? [createHit(index), createHit(index + CASE_COUNT)] : [createHit(index)];
  return {
    input: exportSearchResultsCsv(hits),
    expected: hits.map(expectedFromHit),
  };
}

function malformedCsv(category: number, index: number): unknown {
  const row = `doc-${index},title,Writer,obj-${index},Paragraph,body,snippet,astraea://doc-${index},0.5`;
  switch (category) {
    case 0:
      return `wrong,header\r\n${row}\r\n`;
    case 1:
      return `document_id,document_title,module,object_id,object_type,field,snippet,deep_link,score\r\ndoc-${index},title,Writer\r\n`;
    case 2:
      return `${HEADER}\r\ndoc-${index},title,Writer,obj-${index},Paragraph,body,snippet,astraea://doc-${index},0.5,extra\r\n`;
    case 3:
      return `${HEADER}\n${row.slice(0, row.lastIndexOf(','))},not-a-number\n`;
    case 4:
      return `${HEADER}\r\n${row.replace('snippet', '"unterminated snippet')}\r\n`;
    case 5:
      return `${HEADER}\r\ndoc-${index},title"suffix,Writer,obj-${index},Paragraph,body,snippet,astraea://doc-${index},0.5\r\n`;
    case 6:
      return `${HEADER}\r\ndoc-${index},"title"suffix,Writer,obj-${index},Paragraph,body,snippet,astraea://doc-${index},0.5\r\n`;
    case 7:
      return `${HEADER}\r${row}\r\n`;
    case 8:
      return null;
    case 9:
      return { csv: `${HEADER}\r\n${row}\r\n` };
    case 10:
      return index;
    default:
      return `${HEADER}\r\ndoc-${index},title,Writer,obj-${index},Paragraph,body,snippet,astraea://doc-${index},\r\n`;
  }
}

function expectOutputInvariants(rows: ImportedRow[], source: string): void {
  expect(Array.isArray(rows)).toBe(true);
  expect(rows.length).toBeLessThanOrEqual(10_000);
  const totalStringChars = rows.reduce((total, row) => {
    expect(Object.keys(row).sort()).toEqual([...FIELD_NAMES].sort());
    for (const key of STRING_FIELDS) {
      expect(typeof row[key]).toBe('string');
      expect(row[key].length).toBeLessThanOrEqual(MAX_CELL_CHARS);
    }
    expect(typeof row.score).toBe('number');
    expect(Number.isFinite(row.score)).toBe(true);
    return total + STRING_FIELDS.reduce((fieldTotal, key) => fieldTotal + row[key].length, 0);
  }, 0);
  expect(totalStringChars).toBeLessThanOrEqual(source.length);
}

describe('Search CSV hostile-input packet Q', () => {
  it('dispatches exactly 4,096 bounded imports and distinguishes valid CSV from controlled rejects', () => {
    const corpus: unknown[] = [];
    const expectedRows: Array<ImportedRow[] | null> = [];
    for (let index = 0; index < VALID_CASES; index += 1) {
      const generated = validCase(index);
      expect(utf8ByteLength(generated.input)).toBeLessThanOrEqual(MUTATION_BYTES);
      corpus.push(generated.input);
      expectedRows.push(generated.expected);
    }
    for (let index = VALID_CASES; index < CASE_COUNT; index += 1) {
      const generated = malformedCsv((index - VALID_CASES) % 12, index);
      const measuredBytes = typeof generated === 'string'
        ? utf8ByteLength(generated)
        : utf8ByteLength(JSON.stringify(generated) ?? '');
      expect(measuredBytes).toBeLessThanOrEqual(MUTATION_BYTES);
      corpus.push(generated);
      expectedRows.push(null);
    }

    let dispatched = 0;
    let accepted = 0;
    let controlledRejects = 0;
    let nativeFailures = 0;
    const unexpectedErrors: string[] = [];

    for (let index = 0; index < corpus.length; index += 1) {
      dispatched += 1;
      try {
        const source = corpus[index] as string;
        const rows = importSearchResultsCsv(source);
        accepted += 1;
        if (expectedRows[index] === null) {
          unexpectedErrors.push(`mutation ${index} was accepted`);
          continue;
        }
        expectOutputInvariants(rows, source);
        expect(rows).toEqual(expectedRows[index]);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError || (error instanceof Error && /stack|recursion/i.test(error.message))) {
          nativeFailures += 1;
          continue;
        }
        if (error instanceof Error && error.message.startsWith('Search CSV ')) {
          controlledRejects += 1;
          if (expectedRows[index] !== null) unexpectedErrors.push(`valid case ${index} was rejected: ${error.message}`);
          continue;
        }
        unexpectedErrors.push(`case ${index}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      }
    }

    expect({ dispatched, accepted, controlledRejects, nativeFailures, unexpectedErrors: unexpectedErrors.slice(0, 20) }).toEqual({
      dispatched: CASE_COUNT,
      accepted: VALID_CASES,
      controlledRejects: CASE_COUNT - VALID_CASES,
      nativeFailures: 0,
      unexpectedErrors: [],
    });
  });

  it('accepts exactly 10,000 data rows and rejects 10,001', () => {
    const minimalRow = 'a,a,a,a,a,a,a,a,0';
    const maximumRowsInput = [HEADER, ...Array<string>(MAX_DATA_ROWS).fill(minimalRow)].join('\r\n');
    expect(importSearchResultsCsv(maximumRowsInput)).toHaveLength(MAX_DATA_ROWS);

    const excessiveRowsInput = [HEADER, ...Array<string>(MAX_DATA_ROWS + 1).fill(minimalRow)].join('\r\n');
    expect(() => importSearchResultsCsv(excessiveRowsInput)).toThrowError('Search CSV row boundary');
  });

  it('accepts exactly 16 MiB of UTF-8 CSV and rejects 16 MiB plus one byte', () => {
    const targetRowCount = MAX_DATA_ROWS;
    const prefix = `${HEADER}\r\n`;
    const minimalRowWithEmptySnippet = 'a,a,a,a,a,a,,a,0';
    const rowSeparators = (targetRowCount - 1) * 2;
    const paddingChars = MAX_CSV_BYTES - prefix.length - minimalRowWithEmptySnippet.length * targetRowCount - rowSeparators;
    const uniformPadding = Math.floor(paddingChars / targetRowCount);
    const extraPaddedRows = paddingChars % targetRowCount;
    const exactInput = prefix + Array.from({ length: targetRowCount }, (_, index) => {
      const snippetLength = uniformPadding + (index < extraPaddedRows ? 1 : 0);
      return `a,a,a,a,a,a,${'x'.repeat(snippetLength)},a,0`;
    }).join('\r\n');

    // The generated file is ASCII, so code-unit length equals its UTF-8 byte length.
    expect(exactInput.length).toBe(MAX_CSV_BYTES);
    const rows = importSearchResultsCsv(exactInput);
    expect(rows).toHaveLength(MAX_DATA_ROWS);
    expect(rows[0].snippet.length).toBe(uniformPadding + 1);
    expect(() => importSearchResultsCsv(`${exactInput}x`)).toThrowError('Search CSV byte boundary');
  });

  it('accepts a 64-KiB cell and rejects a cell one character over', () => {
    const exactCellInput = `${HEADER}\r\na,a,a,a,a,a,${'x'.repeat(MAX_CELL_CHARS)},a,0`;
    const rows = importSearchResultsCsv(exactCellInput);
    expect(rows).toHaveLength(1);
    expect(rows[0].snippet).toHaveLength(MAX_CELL_CHARS);

    const oversizedCellInput = `${HEADER}\r\na,a,a,a,a,a,${'x'.repeat(MAX_CELL_CHARS + 1)},a,0`;
    expect(() => importSearchResultsCsv(oversizedCellInput)).toThrowError('Search CSV cell boundary');
  });
});
