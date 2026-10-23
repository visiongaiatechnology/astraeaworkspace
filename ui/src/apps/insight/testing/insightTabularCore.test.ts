// STATUS: PLATIN — BATCH-INSIGHT-2: one delimited reader, one type per column, bounded and reported.
//
// MEASURED DEFECT this replaces (proof: `connectors/insightConnectorEngine.ts:42` before this batch):
// each CSV cell was coerced on its own, so the column `revenue` with the values `1,2,x` delivered
// the numbers 1 and 2 and the text 'x' in the same column. The visible aggregate then counted only
// the numeric subset — a plausible total over an incomplete column, with no error anywhere.
import { describe, expect, it } from 'vitest';
import { InsightError } from '../core/insightCore';
import {
  TABULAR_LIMITS,
  assertJsonDepth,
  buildTypedTable,
  convertCell,
  inferColumnType,
  parseDelimitedRows,
  readDelimitedTable,
} from '../connectors/insightTabularCore';
import { parseTabularFile } from '../connectors/insightConnectorEngine';

const small = { maxBytes:1024, maxRows:3, maxColumns:4, maxDepth:4, maxErrors:2 };

describe('Insight delimited reader (pure)', () => {
  it('tokenizes quoted fields with embedded delimiters and doubled quotes', () => {
    const table = readDelimitedTable('a,b\n"x,1","he said ""hi"""\n', ',');
    expect(table.headers).toEqual(['a', 'b']);
    expect(table.rows).toEqual([['x,1', 'he said "hi"']]);
    expect(table.errors).toEqual([]);
  });

  it('gives every column exactly one type instead of coercing cell by cell', () => {
    const table = parseDelimitedRows('revenue\n1\n2\nx\n', ',');
    expect(table.schema).toEqual([{ name:'revenue', type:'string', nullable:false }]);
    // The removed per-cell rule produced [1, 2, 'x'] here.
    expect(table.rows.map((row) => row.revenue)).toEqual(['1', '2', 'x']);
    expect(table.errors).toEqual([]);
  });

  it('infers integer, number, boolean, date, text and unknown columns', () => {
    expect(inferColumnType(['1', '2', ''])).toBe('integer');
    expect(inferColumnType(['1.5', '2'])).toBe('number');
    expect(inferColumnType(['true', 'FALSE'])).toBe('boolean');
    expect(inferColumnType(['2026-01-05', '2026-02-01T10:00:00Z'])).toBe('date');
    expect(inferColumnType(['a', '1'])).toBe('string');
    expect(inferColumnType(['', '  '])).toBe('unknown');
  });

  it('converts a cell into the declared type and keeps empty cells absent', () => {
    expect(convertCell('42', 'integer')).toBe(42);
    expect(convertCell('4.5', 'number')).toBe(4.5);
    expect(convertCell('TRUE', 'boolean')).toBe(true);
    expect(convertCell('', 'integer')).toBeNull();
    expect(convertCell('x', 'string')).toBe('x');
  });

  it('reports a row whose field count does not match the header, with its row number', () => {
    const table = parseDelimitedRows('a,b\n1,2\n3\n', ',');
    expect(table.rows).toEqual([{ a:1, b:2 }]);
    expect(table.errors).toEqual([{ row:2, column:'', code:'tabular-column-mismatch' }]);
  });

  it('rejects a cell that exceeds the documented string bound and skips only that row', () => {
    const long = 'x'.repeat(9000);
    const table = parseDelimitedRows(`a\nshort\n${long}\n`, ',');
    expect(table.rows).toEqual([{ a:'short' }]);
    expect(table.errors).toEqual([{ row:2, column:'a', code:'tabular-cell-limit' }]);
  });

  it('names the row, column and error-count limits instead of truncating silently', () => {
    expect(() => parseDelimitedRows('a,b,c,d,e\n1,2,3,4,5\n', ',', small)).toThrowError('tabular-column-limit');
    expect(() => parseDelimitedRows('a\n1\n2\n3\n4\n', ',', small)).toThrowError('file-row-limit');
    const manyBadRows = 'a,b\n1,2\n3\n4\n5\n6\n';
    expect(() => parseDelimitedRows(manyBadRows, ',', small)).toThrowError('tabular-error-limit');
    expect(TABULAR_LIMITS.maxBytes).toBe(64 * 1024 * 1024);
  });

  it('bounds JSON nesting before parsing', () => {
    expect(() => assertJsonDepth('[{"a":1}]', 4)).not.toThrow();
    expect(() => assertJsonDepth('[[[[[1]]]]]', 4)).toThrowError('json-depth-limit');
  });

  it('lets the connector intake and the local import share this one reader', () => {
    const bytes = new TextEncoder().encode('region,revenue\nEurope,10\nEurope,20\n');
    return parseTabularFile('csv', bytes).then((rows) => {
      expect(rows).toEqual([{ region:'Europe', revenue:10 }, { region:'Europe', revenue:20 }]);
      expect(buildTypedTable(readDelimitedTable('region,revenue\nEurope,10\n', ',')).rows).toEqual(rows.slice(0, 1));
    });
  });

  it('fails closed on an impossible limit set rather than returning a partial table', () => {
    expect(() => parseDelimitedRows('a\n1\n', ',', { ...small, maxRows:0 })).toThrowError(InsightError);
  });
});
