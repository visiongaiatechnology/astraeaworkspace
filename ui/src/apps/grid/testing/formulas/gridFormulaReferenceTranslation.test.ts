// STATUS: DIAMANT VGT SUPREME
// Reference translation and extraction: counter-checks for Paket 23 (AST-0351..0355).
//
// The expectations are hand-written from the Excel fill/copy rules, not derived from
// the implementation. Every case in the "legacy defect" block additionally re-implements
// the previous loose `[A-Za-z]+[0-9]+` scan so the regression is provable rather than
// asserted: if the canonical implementation is reverted, those assertions turn red.

import { describe, expect, it } from 'vitest';
import {
  extractReferencesFromFormula,
  extractReferencesFromFormulaDetailed,
  parseA1ReferenceToken,
  translateFormulaReferences,
} from '../../formulas/gridFormulaReferences';
import type { GridCell } from '../../../../shared/contracts/workspace';

/** The pre-fix algorithm, kept verbatim as a negative oracle. */
function legacyTranslate(formula: string, rowOffset: number, colOffset: number): string {
  if (!formula.startsWith('=')) return formula;
  const regex = /("(?:""|[^"])*")|([A-Za-z_][A-Za-z0-9_.]*\s*\()|(\$?)([A-Za-z]+)(\$?)([1-9]\d*)(?![A-Za-z0-9_])/g;
  return formula.replace(regex, (match, quotedString, functionCall, colDollar, colLetters, rowDollar, rowDigits) => {
    if (quotedString !== undefined) return quotedString;
    if (functionCall !== undefined) return functionCall;
    if (!colLetters || !rowDigits) return match;
    const colNorm = colLetters.toUpperCase();
    let origCol = 0;
    for (let i = 0; i < colNorm.length; i++) origCol = origCol * 26 + (colNorm.charCodeAt(i) - 64);
    origCol -= 1;
    const origRow = parseInt(rowDigits, 10) - 1;
    const newCol = colDollar === '$' ? origCol : origCol + colOffset;
    const newRow = rowDollar === '$' ? origRow : origRow + rowOffset;
    if (newCol < 0 || newRow < 0) return '#REF!';
    let c = newCol + 1;
    let colStr = '';
    while (c > 0) {
      const rem = (c - 1) % 26;
      colStr = String.fromCharCode(65 + rem) + colStr;
      c = Math.floor((c - 1) / 26);
    }
    return `${colDollar === '$' ? '$' : ''}${colStr}${rowDollar === '$' ? '$' : ''}${newRow + 1}`;
  });
}

const emptyCells: Record<string, GridCell> = {};

describe('Paket 23 — relative and absolute reference translation', () => {
  it('shifts only the relative dimension of anchored references', () => {
    expect(translateFormulaReferences('=$A$1', 5, 5)).toBe('=$A$1');
    expect(translateFormulaReferences('=$A$1 + A1', 1, 1)).toBe('=$A$1 + B2');
    expect(translateFormulaReferences('=$A1', 2, 3)).toBe('=$A3');
    expect(translateFormulaReferences('=A$1', 2, 3)).toBe('=D$1');
  });

  it('shifts every reference of a filled range', () => {
    expect(translateFormulaReferences('=A1', 1, 1)).toBe('=B2');
    expect(translateFormulaReferences('=SUM(A1:B3)', 2, 1)).toBe('=SUM(B3:C5)');
    expect(translateFormulaReferences('=B2 + A1', -1, -1)).toBe('=A1 + #REF!');
    expect(translateFormulaReferences('=A1', -1, 0)).toBe('=#REF!');
    expect(translateFormulaReferences('=A1', 0, -1)).toBe('=#REF!');
  });

  it('keeps string literals untouched', () => {
    expect(translateFormulaReferences('="A1 cell" & A1', 1, 1)).toBe('="A1 cell" & B2');
    expect(translateFormulaReferences('="Report for A1:B10" & SUM(A1:B1)', 1, 0)).toBe('="Report for A1:B10" & SUM(A2:B2)');
  });

  it('translates the cell but preserves the sheet qualifier', () => {
    // Excel shifts the A1 part and keeps the sheet name.
    expect(translateFormulaReferences('=Sheet2!A1', 1, 1)).toBe('=Sheet2!B2');
    expect(translateFormulaReferences("='My Sheet'!$A$1 + A1", 1, 1)).toBe("='My Sheet'!$A$1 + B2");
    expect(translateFormulaReferences('=SUM(Sheet2!A1:B2)', 1, 0)).toBe('=SUM(Sheet2!A2:B3)');
  });

  it('preserves structured table references verbatim', () => {
    expect(translateFormulaReferences('=SUM(Table1[Amount])', 1, 1)).toBe('=SUM(Table1[Amount])');
    expect(translateFormulaReferences('=Table1[[#Data],[Amount]] + A1', 1, 1)).toBe('=Table1[[#Data],[Amount]] + B2');
  });

  it('shifts whole column and whole row references', () => {
    expect(translateFormulaReferences('=SUM(A:A)', 3, 1)).toBe('=SUM(B:B)');
    expect(translateFormulaReferences('=SUM($A:C)', 0, 1)).toBe('=SUM($A:D)');
    expect(translateFormulaReferences('=SUM(A:C)', 0, -1)).toBe('=SUM(#REF!)');
    expect(translateFormulaReferences('=SUM(1:3)', 2, 4)).toBe('=SUM(3:5)');
  });

  it('leaves out-of-raster tokens alone instead of mangling them', () => {
    expect(translateFormulaReferences('=XFE1 + A1', 1, 0)).toBe('=XFE1 + A2');
    expect(translateFormulaReferences('=A1048577 + A1', 1, 0)).toBe('=A1048577 + A2');
  });

  it('recognises references only inside the raster', () => {
    expect(parseA1ReferenceToken('A1')).toEqual({ colIdx: 0, rowIdx: 0, colAbsolute: false, rowAbsolute: false, text: 'A1' });
    expect(parseA1ReferenceToken('$XFD$1048576')).toEqual({
      colIdx: 16383,
      rowIdx: 1048575,
      colAbsolute: true,
      rowAbsolute: true,
      text: '$XFD$1048576',
    });
    expect(parseA1ReferenceToken('Sheet1')).toBeNull();
    expect(parseA1ReferenceToken('Table1')).toBeNull();
    expect(parseA1ReferenceToken('XFE1')).toBeNull();
    expect(parseA1ReferenceToken('A0')).toBeNull();
  });

  it('extracts precedents without inventing sheet or table names as cells', () => {
    expect(extractReferencesFromFormula('=SUM(A1:B2) + C3 * $D$4').sort()).toEqual(['A1', 'A2', 'B1', 'B2', 'C3', 'D4']);
    expect(extractReferencesFromFormula('=Sheet2!A1 + Table1[Amount]')).toEqual(['A1']);
    expect(extractReferencesFromFormula('=LOG10(2) + ATAN2(1, 2)')).toEqual([]);
    expect(extractReferencesFromFormula('not a formula')).toEqual([]);
  });

  it('degrades to range corners beyond the expansion budget', () => {
    const detailed = extractReferencesFromFormulaDetailed('=SUM(A1:A100)', 10);
    expect(detailed.truncatedRanges).toEqual(['A1:A100']);
    expect(detailed.cells).toEqual(['A1', 'A100']);
  });

  it('empty input is not a reference', () => {
    expect(extractReferencesFromFormula('=SUM()')).toEqual([]);
    expect(extractReferencesFromFormula('=A1')).toEqual(['A1']);
    expect(Object.keys(emptyCells)).toHaveLength(0);
  });
});

describe('Paket 23 — legacy defect counter-check', () => {
  it('the previous scan corrupted sheet qualifiers; the canonical one does not', () => {
    // Negative oracle: the old implementation read `Sheet2` as a cell address.
    expect(legacyTranslate('=Sheet2!A1', 1, 1)).not.toBe('=Sheet2!B2');
    expect(translateFormulaReferences('=Sheet2!A1', 1, 1)).toBe('=Sheet2!B2');
  });

  it('the previous scan corrupted structured table names; the canonical one does not', () => {
    const legacy = legacyTranslate('=SUM(Table1[Amount])', 1, 1);
    expect(legacy).not.toBe('=SUM(Table1[Amount])');
    expect(translateFormulaReferences('=SUM(Table1[Amount])', 1, 1)).toBe('=SUM(Table1[Amount])');
  });

  it('the previous extractor invented TABLE1/SHEET2 precedents; the canonical one does not', () => {
    const legacyExtract = '=SUM(Table1[Amount]) + Sheet2!A1'.match(/(?:^|[^A-Z0-9_.$])(\$?[A-Z]+\$?[1-9]\d*)(?!\s*\()/gi) ?? [];
    const legacyTokens = legacyExtract.map((token) => token.replace(/^[^A-Z0-9$]+/i, '').toUpperCase());
    expect(legacyTokens.length).toBeGreaterThan(1);
    expect(extractReferencesFromFormula('=SUM(Table1[Amount]) + Sheet2!A1')).toEqual(['A1']);
  });

  it('whole column references were previously not translated at all', () => {
    expect(legacyTranslate('=SUM(A:A)', 0, 1)).toBe('=SUM(A:A)');
    expect(translateFormulaReferences('=SUM(A:A)', 0, 1)).toBe('=SUM(B:B)');
  });
});
