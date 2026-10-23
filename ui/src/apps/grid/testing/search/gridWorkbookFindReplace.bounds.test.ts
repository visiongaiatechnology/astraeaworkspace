// STATUS: PLATIN — counter-checks for Grid Paket 47 (Workbook-Suche und Navigation).
//
// Hand-written oracle: "Auf allen Sheets nach Formel, Wert und Kommentar suchen und Treffer öffnen"
// plus the trust-boundary requirement that a large workbook must not be walked unboundedly.
import { describe, expect, it } from 'vitest';
import type { GridCell, GridSheetModel } from '../../../../shared/contracts/workspace';
import {
  describeGridWorkbookFindResult,
  findGridWorkbookMatches,
  findGridWorkbookMatchesDetailed,
  replaceGridWorkbookMatches,
  GRID_FIND_MAX_QUERY_CHARS,
} from '../../search/gridWorkbookFindReplace';

function sheet(id: string, name: string, extra: Partial<GridSheetModel> = {}): GridSheetModel {
  return { id, name, tableObjectId: `t-${id}`, tables: [], validations: [], ...extra } as GridSheetModel;
}

const sheets: GridSheetModel[] = [
  sheet('s1', 'Umsatz'),
  sheet('s2', 'Kosten', { comments: [{ id: 'c1', coord: 'B2', text: 'Prüfen: Umsatzdopplung', createdAt: 0, authorId: 'u' } as never] }),
];

const cellsBySheet: Record<string, Record<string, GridCell>> = {
  s1: { A1: { value: 'Umsatz' }, B2: { value: 1200, formula: '=SUM(B1:B1)' }, C3: { value: '00123' } },
  s2: { A1: { value: 'Kosten' }, B2: { value: 400, formula: '=B1*2' } },
};

describe('Grid workbook find: values, formulas and comments across all sheets', () => {
  it('finds values, formulas and comments when the workbook scope and all fields are enabled', () => {
    const found = findGridWorkbookMatches(sheets, cellsBySheet, 'umSatz', {
      scope: 'workbook', activeSheetId: 's1', fields: ['value', 'formula', 'comment'],
    });
    expect(found.map((match) => `${match.sheetId}!${match.coord}:${match.field}`)).toEqual([
      's1!A1:value',
      's2!B2:comment',
    ]);
  });

  it('matches a formula literal even though no cell value contains it', () => {
    const found = findGridWorkbookMatches(sheets, cellsBySheet, 'SUM(', {
      scope: 'workbook', activeSheetId: 's1', fields: ['value', 'formula'],
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ sheetId: 's1', coord: 'B2', field: 'formula' });
  });

  it('limits the scan to the active sheet when the scope is "sheet"', () => {
    const found = findGridWorkbookMatches(sheets, cellsBySheet, 'b1*2', {
      scope: 'sheet', activeSheetId: 's1', fields: ['formula'],
    });
    expect(found).toEqual([]);
  });

  it('honours matchCase and entireCell instead of always matching loosely', () => {
    expect(findGridWorkbookMatches(sheets, cellsBySheet, 'umsatz', { scope: 'workbook', activeSheetId: 's1', fields: ['value'] }))
      .toHaveLength(1);
    expect(findGridWorkbookMatches(sheets, cellsBySheet, 'umsatz', { scope: 'workbook', activeSheetId: 's1', fields: ['value'], matchCase: true }))
      .toHaveLength(0);
    expect(findGridWorkbookMatches(sheets, cellsBySheet, 'Umsatz', { scope: 'workbook', activeSheetId: 's1', fields: ['value'], entireCell: true }))
      .toHaveLength(1);
    expect(findGridWorkbookMatches(sheets, cellsBySheet, 'Umsat', { scope: 'workbook', activeSheetId: 's1', fields: ['value'], entireCell: true }))
      .toHaveLength(0);
  });

  it('returns nothing for an empty or whitespace query', () => {
    expect(findGridWorkbookMatches(sheets, cellsBySheet, '', { scope: 'workbook', activeSheetId: 's1', fields: ['value'] })).toEqual([]);
    expect(findGridWorkbookMatches(sheets, cellsBySheet, '   ', { scope: 'workbook', activeSheetId: 's1', fields: ['value'] })).toEqual([]);
  });

  it('truncates an over-long query instead of scanning with an unbounded needle', () => {
    const long = 'a'.repeat(GRID_FIND_MAX_QUERY_CHARS + 500);
    expect(() => findGridWorkbookMatches(sheets, cellsBySheet, long, { scope: 'workbook', activeSheetId: 's1', fields: ['value'] })).not.toThrow();
    expect(findGridWorkbookMatches(sheets, cellsBySheet, long, { scope: 'workbook', activeSheetId: 's1', fields: ['value'] })).toEqual([]);
  });

  it('does not treat the query as a regular expression', () => {
    // ".*" must be a literal, otherwise it would match everything.
    expect(findGridWorkbookMatches(sheets, cellsBySheet, '.*', { scope: 'workbook', activeSheetId: 's1', fields: ['value', 'formula'] })).toEqual([]);
  });
});

describe('Grid workbook find: bounded scan work (counter-check for the O(n) keystroke regression)', () => {
  it('stops at the cell budget and reports the truncation instead of walking the whole workbook', () => {
    const big: Record<string, GridCell> = {};
    for (let index = 0; index < 5_000; index++) big[`A${index + 1}`] = { value: `Zeile ${index}` };
    const result = findGridWorkbookMatchesDetailed(
      [sheet('big', 'Gross')],
      { big },
      'Zeile',
      { scope: 'workbook', activeSheetId: 'big', fields: ['value'], maxScannedCells: 100 },
    );
    expect(result.scannedCells).toBe(100);
    expect(result.truncated).toBe(true);
    expect(result.matches).toHaveLength(100);
    // Repeated calls are deterministic and stop at the same bound.
    const again = findGridWorkbookMatchesDetailed([sheet('big', 'Gross')], { big }, 'Zeile', { scope: 'workbook', activeSheetId: 'big', fields: ['value'], maxScannedCells: 100 });
    expect(again.scannedCells).toBe(100);
    expect(describeGridWorkbookFindResult(again, 'Zeile')).toMatch(/abgebrochen/u);
  });

  it('scans at most 250,000 cells by default so one keystroke stays bounded', () => {
    const big: Record<string, GridCell> = {};
    for (let index = 0; index < 260_000; index++) big[`A${index + 1}`] = { value: 'x' };
    const started = Date.now();
    const result = findGridWorkbookMatchesDetailed([sheet('huge', 'Riesig')], { huge: big }, 'zzz', {
      scope: 'workbook', activeSheetId: 'huge', fields: ['value'],
    });
    const elapsed = Date.now() - started;
    expect(result.scannedCells).toBe(250_000);
    expect(result.truncated).toBe(true);
    expect(elapsed).toBeLessThan(5_000);
  });
});

describe('Grid workbook replace: type preservation and bounded edits', () => {
  it('keeps a leading-zero text value as text instead of coercing it to a number', () => {
    const matches = findGridWorkbookMatches(sheets, cellsBySheet, '123', { scope: 'workbook', activeSheetId: 's1', fields: ['value'] });
    expect(matches.map((match) => `${match.sheetId}!${match.coord}`)).toEqual(['s1!C3']);
    const replaced = replaceGridWorkbookMatches(sheets, cellsBySheet, matches, '123', '456', {});
    expect(replaced.replaced).toBe(1);
    expect(replaced.cellsBySheet.s1?.C3?.value).toBe('00456');
    expect(typeof replaced.cellsBySheet.s1?.C3?.value).toBe('string');
  });

  it('keeps a numeric cell numeric when the replacement is still a number', () => {
    const cells: Record<string, Record<string, GridCell>> = { s1: { A1: { value: 1234 } } };
    const list = [sheet('s1', 'S')];
    const matches = findGridWorkbookMatches(list, cells, '1234', { scope: 'workbook', activeSheetId: 's1', fields: ['value'] });
    const replaced = replaceGridWorkbookMatches(list, cells, matches, '1234', '5678', {});
    expect(replaced.cellsBySheet.s1?.A1?.value).toBe(5678);
  });

  it('replaces inside a formula and inside a comment without touching other cells', () => {
    const list = [sheet('s1', 'S'), sheet('s2', 'K', { comments: [{ id: 'c9', coord: 'A1', text: 'alt alt', createdAt: 0, authorId: 'u' } as never] })];
    const cells: Record<string, Record<string, GridCell>> = { s1: { B1: { value: 1, formula: '=alt+1' } }, s2: {} };
    const matches = findGridWorkbookMatches(list, cells, 'alt', { scope: 'workbook', activeSheetId: 's1', fields: ['value', 'formula', 'comment'] });
    expect(matches).toHaveLength(2);
    const replaced = replaceGridWorkbookMatches(list, cells, matches, 'alt', 'neu', {});
    expect(replaced.replaced).toBe(2);
    expect(replaced.cellsBySheet.s1?.B1?.formula).toBe('=neu+1');
    expect(replaced.sheets[1]?.comments?.[0]?.text).toBe('neu neu');
  });

  it('replaces every occurrence inside one cell, not only the first', () => {
    const list = [sheet('s1', 'S')];
    const cells: Record<string, Record<string, GridCell>> = { s1: { A1: { value: 'aaa' } } };
    const matches = findGridWorkbookMatches(list, cells, 'a', { scope: 'workbook', activeSheetId: 's1', fields: ['value'] });
    const replaced = replaceGridWorkbookMatches(list, cells, matches, 'a', 'bb', {});
    expect(replaced.cellsBySheet.s1?.A1?.value).toBe('bbbbbb');
  });

  it('refuses more matches than the bounded replacement limit', () => {
    const list = [sheet('s1', 'S')];
    const many = Array.from({ length: 10_001 }, (_, index) => ({ sheetId: 's1', coord: `A${index + 1}`, field: 'value' as const, preview: 'x' }));
    expect(() => replaceGridWorkbookMatches(list, {}, many, 'x', 'y', {})).toThrow(/bounded match limit/u);
  });

  it('does not mutate the input maps when replacing', () => {
    const list = [sheet('s1', 'S')];
    const cells: Record<string, Record<string, GridCell>> = { s1: { A1: { value: 'alt' } } };
    const matches = findGridWorkbookMatches(list, cells, 'alt', { scope: 'workbook', activeSheetId: 's1', fields: ['value'] });
    replaceGridWorkbookMatches(list, cells, matches, 'alt', 'neu', {});
    expect(cells.s1?.A1?.value).toBe('alt');
  });
});
