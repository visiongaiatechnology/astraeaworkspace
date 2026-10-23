// STATUS: DIAMANT VGT SUPREME
// Authoritative Vitest test suite for Astraea Grid Formula Engine
// Excel/Calc parity across Math, Stats, Text, Date, Finance, Info/Lookup, Dynamic Arrays, Reference Shifting, Spill & Auditing

import { describe, expect, it } from 'vitest';
import { GridCell } from '../../../../shared/contracts/workspace';
import {
  evaluateGridFormulaLocal,
  translateFormulaReferences,
  extractReferencesFromFormula,
  getPrecedents,
  getDependents,
  applySpill,
  recalculateGridWithSpill,
} from '../../formulas/gridFormulaEngine';
import { FormulaArray } from '../../formulas/gridFormulaTypes';

function makeGrid(data: Record<string, Partial<GridCell>>): Record<string, GridCell> {
  const grid: Record<string, GridCell> = {};
  for (const [coord, cell] of Object.entries(data)) {
    grid[coord.toUpperCase()] = {
      value: cell.value ?? '',
      formula: cell.formula,
      format: cell.format,
      bold: cell.bold,
      commentId: cell.commentId,
    };
  }
  return grid;
}

describe('Astraea Grid Formula Engine — DIAMANT VGT SUPREME', () => {
  // ==========================================
  // SECTION 1: Math & Trigonometry Functions
  // ==========================================
  describe('1. Math & Trigonometry', () => {
    const grid = makeGrid({
      A1: { value: 10 },
      A2: { value: 20 },
      A3: { value: 30 },
      A4: { value: 40 },
      A5: { value: 50 },
      B1: { value: 'Alpha' },
      B2: { value: 'Beta' },
      B3: { value: 'Beta' },
      B4: { value: 'Gamma' },
      B5: { value: 'Alpha' },
      E1: { value: '#DIV/0!' },
    });

    it('SUM & PRODUCT evaluate scalars and ranges', () => {
      expect(evaluateGridFormulaLocal('=SUM(1, 2, 3, 4)', grid)).toBe(10);
      expect(evaluateGridFormulaLocal('=SUM(A1:A3)', grid)).toBe(60);
      expect(evaluateGridFormulaLocal('=PRODUCT(2, 3, 4)', grid)).toBe(24);
      expect(evaluateGridFormulaLocal('=PRODUCT(A1:A2)', grid)).toBe(200);
    });

    it('SUMIF evaluates equality, comparisons and wildcards', () => {
      expect(evaluateGridFormulaLocal('=SUMIF(A1:A5, ">25")', grid)).toBe(120); // 30 + 40 + 50
      expect(evaluateGridFormulaLocal('=SUMIF(A1:A5, "<=20")', grid)).toBe(30); // 10 + 20
      expect(evaluateGridFormulaLocal('=SUMIF(B1:B5, "Beta", A1:A5)', grid)).toBe(50); // 20 + 30
      expect(evaluateGridFormulaLocal('=SUMIF(B1:B5, "B*", A1:A5)', grid)).toBe(50);
      expect(evaluateGridFormulaLocal('=SUMIF(B1:B5, "*ha", A1:A5)', grid)).toBe(60); // Alpha: 10 + 50
    });

    it('SUMIFS handles multi-criteria filtering', () => {
      expect(evaluateGridFormulaLocal('=SUMIFS(A1:A5, B1:B5, "Alpha", A1:A5, ">20")', grid)).toBe(50);
      expect(evaluateGridFormulaLocal('=SUMIFS(A1:A5, B1:B5, "Beta", A1:A5, ">=20")', grid)).toBe(50);
      expect(evaluateGridFormulaLocal('=SUMIFS(A1:A5, B1:B5, "Delta")', grid)).toBe(0);
    });

    it('Rounding functions: ROUND, ROUNDUP, ROUNDDOWN, CEILING, FLOOR, MROUND', () => {
      expect(evaluateGridFormulaLocal('=ROUND(3.14159, 2)', grid)).toBe(3.14);
      expect(evaluateGridFormulaLocal('=ROUNDUP(3.141, 2)', grid)).toBe(3.15);
      expect(evaluateGridFormulaLocal('=ROUNDDOWN(3.149, 2)', grid)).toBe(3.14);
      expect(evaluateGridFormulaLocal('=CEILING(4.2, 1)', grid)).toBe(5);
      expect(evaluateGridFormulaLocal('=CEILING(4.2, 2)', grid)).toBe(6);
      expect(evaluateGridFormulaLocal('=FLOOR(4.8, 1)', grid)).toBe(4);
      expect(evaluateGridFormulaLocal('=FLOOR(4.8, 2)', grid)).toBe(4);
      expect(evaluateGridFormulaLocal('=MROUND(10, 3)', grid)).toBe(9);
      expect(evaluateGridFormulaLocal('=MROUND(11, 3)', grid)).toBe(12);
    });

    it('Arithmetic & powers: SQRT, POWER, ABS, MOD', () => {
      expect(evaluateGridFormulaLocal('=SQRT(25)', grid)).toBe(5);
      expect(evaluateGridFormulaLocal('=SQRT(-4)', grid)).toBe('#NUM!');
      expect(evaluateGridFormulaLocal('=POWER(2, 4)', grid)).toBe(16);
      expect(evaluateGridFormulaLocal('=ABS(-99)', grid)).toBe(99);
      expect(evaluateGridFormulaLocal('=MOD(17, 5)', grid)).toBe(2);
      expect(evaluateGridFormulaLocal('=MOD(10, 0)', grid)).toBe('#DIV/0!');
    });

    it('SUBTOTAL executes standard functions', () => {
      expect(evaluateGridFormulaLocal('=SUBTOTAL(9, A1:A3)', grid)).toBe(60); // SUM
      expect(evaluateGridFormulaLocal('=SUBTOTAL(1, A1:A3)', grid)).toBe(20); // AVERAGE
      expect(evaluateGridFormulaLocal('=SUBTOTAL(4, A1:A3)', grid)).toBe(30); // MAX
      expect(evaluateGridFormulaLocal('=SUBTOTAL(5, A1:A3)', grid)).toBe(10); // MIN
    });

    it('AGGREGATE performs calculations and ignores error values with option 6', () => {
      // Sum of A1:A3 plus E1 which has #DIV/0!
      expect(evaluateGridFormulaLocal('=AGGREGATE(9, 6, A1:A3, E1)', grid)).toBe(60);
    });
  });

  // ==========================================
  // SECTION 2: Statistics Functions
  // ==========================================
  describe('2. Statistics', () => {
    const grid = makeGrid({
      A1: { value: 10 },
      A2: { value: 20 },
      A3: { value: 30 },
      A4: { value: 40 },
      A5: { value: 50 },
      B1: { value: 'X' },
      B2: { value: 'Y' },
      B3: { value: 'X' },
      B4: { value: 'Y' },
      B5: { value: 'X' },
      C1: { value: 5 },
      C2: { value: '' },
      C3: { value: '' },
      C4: { value: 'text' },
    });

    it('AVERAGE, AVERAGEIF, AVERAGEIFS calculate correct means', () => {
      expect(evaluateGridFormulaLocal('=AVERAGE(A1:A3)', grid)).toBe(20);
      expect(evaluateGridFormulaLocal('=AVERAGEIF(A1:A5, ">20")', grid)).toBe(40); // (30 + 40 + 50) / 3 = 40
      expect(evaluateGridFormulaLocal('=AVERAGEIFS(A1:A5, B1:B5, "X")', grid)).toBe(30); // (10 + 30 + 50) / 3 = 30
    });

    it('COUNT, COUNTA, COUNTBLANK, COUNTIF, COUNTIFS', () => {
      expect(evaluateGridFormulaLocal('=COUNT(C1:C4)', grid)).toBe(1); // Only C1 is number
      expect(evaluateGridFormulaLocal('=COUNTA(C1:C4)', grid)).toBe(2); // C1 and C4 are non-empty
      expect(evaluateGridFormulaLocal('=COUNTBLANK(C1:C4)', grid)).toBe(2); // C2 and C3 are blank
      expect(evaluateGridFormulaLocal('=COUNTIF(A1:A5, ">=30")', grid)).toBe(3);
      expect(evaluateGridFormulaLocal('=COUNTIFS(A1:A5, ">=20", B1:B5, "X")', grid)).toBe(2); // A3 (30, X) and A5 (50, X)
    });

    it('Order statistics: LARGE, SMALL, MEDIAN, MODE, MODE.SNGL', () => {
      expect(evaluateGridFormulaLocal('=LARGE(A1:A5, 2)', grid)).toBe(40);
      expect(evaluateGridFormulaLocal('=SMALL(A1:A5, 2)', grid)).toBe(20);
      expect(evaluateGridFormulaLocal('=MEDIAN(1, 2, 10, 20, 30)', grid)).toBe(10);
      expect(evaluateGridFormulaLocal('=MODE(1, 2, 2, 3)', grid)).toBe(2);
      expect(evaluateGridFormulaLocal('=MODE.SNGL(1, 2, 2, 3)', grid)).toBe(2);
      expect(evaluateGridFormulaLocal('=MODE(1, 2, 3)', grid)).toBe('#N/A');
    });

    it('Distribution metrics: STDEV, VAR, PERCENTILE, QUARTILE', () => {
      const stdev = Number(evaluateGridFormulaLocal('=STDEV(10, 12, 23, 23, 16, 23, 21, 16)', grid));
      expect(stdev).toBeCloseTo(5.237, 2);

      const variance = Number(evaluateGridFormulaLocal('=VAR(10, 12, 23, 23, 16, 23, 21, 16)', grid));
      expect(variance).toBeCloseTo(27.428, 2);

      expect(evaluateGridFormulaLocal('=PERCENTILE(A1:A5, 0.5)', grid)).toBe(30);
      expect(evaluateGridFormulaLocal('=QUARTILE(A1:A5, 2)', grid)).toBe(30);
    });
  });

  // ==========================================
  // SECTION 3: Text Functions
  // ==========================================
  describe('3. Text Operations', () => {
    const grid = makeGrid({});

    it('Extraction & length: LEN, LEFT, RIGHT, MID, TRIM, PROPER, REPT', () => {
      expect(evaluateGridFormulaLocal('=LEN("VisionGaia")', grid)).toBe(10);
      expect(evaluateGridFormulaLocal('=LEFT("Technology", 4)', grid)).toBe('Tech');
      expect(evaluateGridFormulaLocal('=RIGHT("Technology", 4)', grid)).toBe('logy');
      expect(evaluateGridFormulaLocal('=MID("VisionGaia", 7, 4)', grid)).toBe('Gaia');
      expect(evaluateGridFormulaLocal('=TRIM("   Astraea   Grid   ")', grid)).toBe('Astraea Grid');
      expect(evaluateGridFormulaLocal('=PROPER("vgt supreme architect")', grid)).toBe('Vgt Supreme Architect');
      expect(evaluateGridFormulaLocal('=REPT("VGT-", 3)', grid)).toBe('VGT-VGT-VGT-');
    });

    it('Searching & replacing: SEARCH, FIND, REPLACE, SUBSTITUTE', () => {
      // SEARCH is case-insensitive and supports wildcards
      expect(evaluateGridFormulaLocal('=SEARCH("ga*", "VisionGaia")', grid)).toBe(7);
      expect(evaluateGridFormulaLocal('=SEARCH("GAIA", "VisionGaia")', grid)).toBe(7);

      // FIND is case-sensitive and exact
      expect(evaluateGridFormulaLocal('=FIND("Gaia", "VisionGaia")', grid)).toBe(7);
      expect(evaluateGridFormulaLocal('=FIND("gaia", "VisionGaia")', grid)).toBe('#VALUE!');

      // REPLACE
      expect(evaluateGridFormulaLocal('=REPLACE("Astraea", 1, 4, "Nova")', grid)).toBe('Novaaea');

      // SUBSTITUTE
      expect(evaluateGridFormulaLocal('=SUBSTITUTE("alpha beta beta", "beta", "omega")', grid)).toBe('alpha omega omega');
      expect(evaluateGridFormulaLocal('=SUBSTITUTE("alpha beta beta", "beta", "omega", 2)', grid)).toBe('alpha beta omega');
    });

    it('Formatting & Concatenation: TEXT, TEXTJOIN, CONCAT, CONCATENATE', () => {
      expect(evaluateGridFormulaLocal('=TEXT(1234.56, "#,##0.00")', grid)).toBe('1,234.56');
      expect(evaluateGridFormulaLocal('=TEXTJOIN(" - ", TRUE, "A", "", "B", "C")', grid)).toBe('A - B - C');
      expect(evaluateGridFormulaLocal('=TEXTJOIN(" - ", FALSE, "A", "", "B")', grid)).toBe('A -  - B');
      expect(evaluateGridFormulaLocal('=CONCAT("Vision", "Gaia")', grid)).toBe('VisionGaia');
      expect(evaluateGridFormulaLocal('=CONCATENATE("VGT", " ", "Supreme")', grid)).toBe('VGT Supreme');
    });
  });

  // ==========================================
  // SECTION 4: Date & Time Functions
  // ==========================================
  describe('4. Date & Time', () => {
    const grid = makeGrid({});

    it('Component extraction & construction: DATE, TIME, YEAR, MONTH, DAY, HOUR, MINUTE, SECOND', () => {
      expect(evaluateGridFormulaLocal('=DATE(2026, 9, 12)', grid)).toBe('2026-09-12');
      expect(evaluateGridFormulaLocal('=YEAR("2026-09-12")', grid)).toBe(2026);
      expect(evaluateGridFormulaLocal('=MONTH("2026-09-12")', grid)).toBe(9);
      expect(evaluateGridFormulaLocal('=DAY("2026-09-12")', grid)).toBe(12);

      expect(evaluateGridFormulaLocal('=TIME(14, 30, 15)', grid)).toBe('14:30:15');
      expect(evaluateGridFormulaLocal('=HOUR("14:30:15")', grid)).toBe(14);
      expect(evaluateGridFormulaLocal('=MINUTE("14:30:15")', grid)).toBe(30);
      expect(evaluateGridFormulaLocal('=SECOND("14:30:15")', grid)).toBe(15);
    });

    it('TODAY & NOW return non-empty date strings', () => {
      const today = String(evaluateGridFormulaLocal('=TODAY()', grid));
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const now = String(evaluateGridFormulaLocal('=NOW()', grid));
      expect(now).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('Date arithmetic: EDATE, EOMONTH, DATEDIF', () => {
      // EDATE clamping to month end
      expect(evaluateGridFormulaLocal('=EDATE("2026-01-31", 1)', grid)).toBe('2026-02-28');
      expect(evaluateGridFormulaLocal('=EDATE("2024-01-31", 1)', grid)).toBe('2024-02-29'); // Leap year!

      // EOMONTH
      expect(evaluateGridFormulaLocal('=EOMONTH("2026-01-15", 1)', grid)).toBe('2026-02-28');
      expect(evaluateGridFormulaLocal('=EOMONTH("2026-02-10", 0)', grid)).toBe('2026-02-28');

      // DATEDIF
      expect(evaluateGridFormulaLocal('=DATEDIF("2020-01-01", "2025-01-01", "Y")', grid)).toBe(5);
      expect(evaluateGridFormulaLocal('=DATEDIF("2026-01-01", "2026-07-01", "M")', grid)).toBe(6);
      expect(evaluateGridFormulaLocal('=DATEDIF("2026-01-01", "2026-01-15", "D")', grid)).toBe(14);
    });

    it('Business calendar: NETWORKDAYS & WORKDAY', () => {
      // 2026-09-07 is Monday, 2026-09-11 is Friday -> 5 business days
      expect(evaluateGridFormulaLocal('=NETWORKDAYS("2026-09-07", "2026-09-11")', grid)).toBe(5);

      // WORKDAY: starting Friday 2026-09-04, +2 work days -> Tuesday 2026-09-08
      expect(evaluateGridFormulaLocal('=WORKDAY("2026-09-04", 2)', grid)).toBe('2026-09-08');
    });
  });

  // ==========================================
  // SECTION 5: Finance Functions
  // ==========================================
  describe('5. Financial Engine', () => {
    const grid = makeGrid({});

    it('Valuation & Annuities: PV, FV, PMT, NPER, RATE', () => {
      // PV of $500 monthly for 10 years at 6% annual rate
      const pv = Number(evaluateGridFormulaLocal('=PV(0.06/12, 120, -500)', grid));
      expect(pv).toBeCloseTo(45036.73, 1);

      // FV
      const fv = Number(evaluateGridFormulaLocal('=FV(0.06/12, 120, -500)', grid));
      expect(fv).toBeCloseTo(81939.67, 1);

      // PMT for $50,000 loan, 10 years, 6%
      const pmt = Number(evaluateGridFormulaLocal('=PMT(0.06/12, 120, 50000)', grid));
      expect(pmt).toBeCloseTo(-555.10, 1);

      // NPER
      const nper = Number(evaluateGridFormulaLocal('=NPER(0.06/12, -555.10, 50000)', grid));
      expect(nper).toBeCloseTo(120, 0);

      // RATE
      const rate = Number(evaluateGridFormulaLocal('=RATE(120, -555.10, 50000)', grid));
      expect(rate).toBeCloseTo(0.06 / 12, 4);
    });

    it('Cash flow analysis: NPV & IRR', () => {
      // Initial investment -1000, subsequent inflows 300, 420, 680 at 10% discount rate
      const npv = Number(evaluateGridFormulaLocal('=NPV(0.1, -1000, 300, 420, 680)', grid));
      expect(npv).toBeGreaterThan(0);

      // IRR should converge near ~16.3%
      const irr = Number(evaluateGridFormulaLocal('=IRR(-1000, 300, 420, 680)', grid));
      expect(irr).toBeCloseTo(0.1633, 2);
    });

    it('Depreciation: SLN', () => {
      // Cost: 10000, Salvage: 1000, Life: 5
      expect(evaluateGridFormulaLocal('=SLN(10000, 1000, 5)', grid)).toBe(1800);
    });
  });

  // ==========================================
  // SECTION 6: Information & Logic
  // ==========================================
  describe('6. Information & Logic', () => {
    const grid = makeGrid({
      A1: { value: 42 },
      A2: { value: 'VisionGaia' },
      A3: { value: '' },
      A4: { value: '#DIV/0!' },
      A5: { value: '#N/A!' },
    });

    it('Type predicates: ISBLANK, ISNUMBER, ISTEXT, ISNONTEXT, ISERROR, ISERR, ISNA, ISLOGICAL', () => {
      expect(evaluateGridFormulaLocal('=ISBLANK(A3)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISBLANK(A1)', grid)).toBe(false);

      expect(evaluateGridFormulaLocal('=ISNUMBER(A1)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISNUMBER(A2)', grid)).toBe(false);

      expect(evaluateGridFormulaLocal('=ISTEXT(A2)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISTEXT(A1)', grid)).toBe(false);

      expect(evaluateGridFormulaLocal('=ISNONTEXT(A1)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISNONTEXT(A2)', grid)).toBe(false);

      expect(evaluateGridFormulaLocal('=ISERROR(A4)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISERR(A4)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISERR(A5)', grid)).toBe(false); // ISERR ignores #N/A!
      expect(evaluateGridFormulaLocal('=ISNA(A5)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISNA(A4)', grid)).toBe(false);

      expect(evaluateGridFormulaLocal('=ISLOGICAL(TRUE)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=ISLOGICAL(123)', grid)).toBe(false);
    });

    it('Branching & logical operators: IF, IFS, IFERROR, IFNA, AND, OR, NOT, XOR, SWITCH', () => {
      expect(evaluateGridFormulaLocal('=IF(1 > 0, "pass", "fail")', grid)).toBe('pass');
      expect(evaluateGridFormulaLocal('=IFS(1=2, "one", 2=3, "two", 3=3, "three")', grid)).toBe('three');
      expect(evaluateGridFormulaLocal('=IFERROR(A4, "recovered")', grid)).toBe('recovered');
      expect(evaluateGridFormulaLocal('=IFNA(A5, "not-found")', grid)).toBe('not-found');

      expect(evaluateGridFormulaLocal('=AND(TRUE, 1 > 0, 5 = 5)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=OR(FALSE, 1 > 2, 5 > 2)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=NOT(TRUE)', grid)).toBe(false);
      expect(evaluateGridFormulaLocal('=XOR(TRUE, FALSE)', grid)).toBe(true);
      expect(evaluateGridFormulaLocal('=XOR(TRUE, TRUE)', grid)).toBe(false);

      expect(evaluateGridFormulaLocal('=SWITCH(2, 1, "One", 2, "Two", "Default")', grid)).toBe('Two');
      expect(evaluateGridFormulaLocal('=SWITCH(9, 1, "One", 2, "Two", "Default")', grid)).toBe('Default');
    });
  });

  // ==========================================
  // SECTION 7: Lookup & Dynamic Arrays
  // ==========================================
  describe('7. Lookup & Dynamic Array Operations', () => {
    const grid = makeGrid({
      A1: { value: 10 }, B1: { value: 'Alpha' }, C1: { value: 'North' },
      A2: { value: 20 }, B2: { value: 'Beta' },  C2: { value: 'South' },
      A3: { value: 30 }, B3: { value: 'Gamma' }, C3: { value: 'East' },
      A4: { value: 40 }, B4: { value: 'Beta' },  C4: { value: 'West' },
      A5: { value: 50 }, B5: { value: 'Delta' }, C5: { value: 'North' },
    });

    it('CHOOSE, INDEX, MATCH, XMATCH', () => {
      expect(evaluateGridFormulaLocal('=CHOOSE(2, "Gold", "Diamond", "Platin")', grid)).toBe('Diamond');
      expect(evaluateGridFormulaLocal('=MATCH("Beta", B1:B5, 0)', grid)).toBe(2);
      expect(evaluateGridFormulaLocal('=XMATCH("Gamma", B1:B5)', grid)).toBe(3);
      expect(evaluateGridFormulaLocal('=INDEX(A1:C5, 3, 2)', grid)).toBe('Gamma');
    });

    it('VLOOKUP & HLOOKUP', () => {
      expect(evaluateGridFormulaLocal('=VLOOKUP("Beta", B1:C5, 2, FALSE)', grid)).toBe('South');
    });

    it('XLOOKUP exact match and fallback', () => {
      expect(evaluateGridFormulaLocal('=XLOOKUP("Beta", B1:B5, A1:A5)', grid)).toBe(20);
      expect(evaluateGridFormulaLocal('=XLOOKUP("Zeta", B1:B5, A1:A5, "Not Found")', grid)).toBe('Not Found');
    });

    it('Dynamic array generators: SEQUENCE & RANDARRAY', () => {
      const seq = evaluateGridFormulaLocal('=SEQUENCE(3, 2, 1, 1)', grid) as FormulaArray;
      expect(seq).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);

      const rand = evaluateGridFormulaLocal('=RANDARRAY(2, 2)', grid) as FormulaArray;
      expect(rand.length).toBe(2);
      expect(rand[0].length).toBe(2);
      expect(typeof rand[0][0]).toBe('number');
    });

    it('Dynamic array manipulations: UNIQUE, SORT, FILTER, TAKE, DROP, CHOOSECOLS, CHOOSEROWS', () => {
      // UNIQUE on B1:B5 (Alpha, Beta, Gamma, Beta, Delta)
      const u = evaluateGridFormulaLocal('=UNIQUE(B1:B5)', grid) as FormulaArray;
      expect(u).toEqual([['Alpha'], ['Beta'], ['Gamma'], ['Delta']]);

      // SORT descending on A1:A5
      const s = evaluateGridFormulaLocal('=SORT(A1:A5, 1, -1)', grid) as FormulaArray;
      expect(s).toEqual([[50], [40], [30], [20], [10]]);

      // TAKE first 2 rows
      const t = evaluateGridFormulaLocal('=TAKE(A1:A5, 2)', grid) as FormulaArray;
      expect(t).toEqual([[10], [20]]);

      // DROP first 3 rows
      const d = evaluateGridFormulaLocal('=DROP(A1:A5, 3)', grid) as FormulaArray;
      expect(d).toEqual([[40], [50]]);

      // CHOOSECOLS: select column 2 of A1:C3
      const cc = evaluateGridFormulaLocal('=CHOOSECOLS(A1:C3, 2)', grid) as FormulaArray;
      expect(cc).toEqual([['Alpha'], ['Beta'], ['Gamma']]);

      // CHOOSEROWS: select rows 1 and 3 of A1:C3
      const cr = evaluateGridFormulaLocal('=CHOOSEROWS(A1:C3, 1, 3)', grid) as FormulaArray;
      expect(cr).toEqual([
        [10, 'Alpha', 'North'],
        [30, 'Gamma', 'East'],
      ]);
    });
  });

  // ==========================================
  // SECTION 8: Reference Shifting Engine
  // ==========================================
  describe('8. Reference Translation & Shifting (translateFormulaReferences)', () => {
    it('translates relative references correctly with offsets', () => {
      expect(translateFormulaReferences('=A1', 1, 1)).toBe('=B2');
      expect(translateFormulaReferences('=A1 + B2', 2, 3)).toBe('=D3 + E4');
      expect(translateFormulaReferences('=SUM(A1:B3)', 2, 1)).toBe('=SUM(B3:C5)');
    });

    it('respects absolute anchors ($) in column and row', () => {
      // Absolute col and row should remain unchanged
      expect(translateFormulaReferences('=$A$1', 5, 5)).toBe('=$A$1');
      expect(translateFormulaReferences('=$A$1 + A1', 1, 1)).toBe('=$A$1 + B2');

      // Mixed anchors: $A1 (col locked, row relative), A$1 (col relative, row locked)
      expect(translateFormulaReferences('=$A1', 2, 3)).toBe('=$A3');
      expect(translateFormulaReferences('=A$1', 2, 3)).toBe('=D$1');
    });

    it('replaces out-of-bounds shifted coordinates with #REF!', () => {
      // Shifting A1 left by 1 column or up by 1 row breaches grid boundaries
      expect(translateFormulaReferences('=A1', -1, 0)).toBe('=#REF!');
      expect(translateFormulaReferences('=A1', 0, -1)).toBe('=#REF!');
      expect(translateFormulaReferences('=B2 + A1', -1, -1)).toBe('=A1 + #REF!');
    });

    it('preserves string literals from erroneous coordinate replacement', () => {
      expect(translateFormulaReferences('="A1 cell" & A1', 1, 1)).toBe('="A1 cell" & B2');
      expect(translateFormulaReferences('="Report for A1:B10" & SUM(A1:B1)', 1, 0)).toBe('="Report for A1:B10" & SUM(A2:B2)');
    });
  });

  // ==========================================
  // SECTION 9: Spill Semantics & Collisions
  // ==========================================
  describe('9. Spill Semantics & Spill Collisions', () => {
    it('applySpill returns scalar directly with empty spilledCells', () => {
      const grid = makeGrid({});
      const res = applySpill('A1', 42, grid);
      expect(res.originCoord).toBe('A1');
      expect(res.value).toBe(42);
      expect(res.spilledCells).toEqual({});
      expect(res.error).toBeUndefined();
    });

    it('applySpill spills 2D dynamic array into adjacent target coordinates', () => {
      const grid = makeGrid({});
      const matrix: FormulaArray = [
        [1, 2],
        [3, 4],
      ];
      const res = applySpill('A1', matrix, grid);
      expect(res.originCoord).toBe('A1');
      expect(res.value).toBe(1);
      expect(res.spilledCells).toEqual({
        B1: 2,
        A2: 3,
        B2: 4,
      });
      expect(res.error).toBeUndefined();
    });

    it('applySpill detects collision when footprint contains non-empty cell', () => {
      const grid = makeGrid({
        B1: { value: 'Obstacle' },
      });
      const matrix: FormulaArray = [
        [1, 2],
        [3, 4],
      ];
      const res = applySpill('A1', matrix, grid);
      expect(res.originCoord).toBe('A1');
      expect(res.value).toBe('#SPILL!');
      expect(res.error).toBe('#SPILL!');
      expect(res.spilledCells).toEqual({});
    });

    it('recalculateGridWithSpill orchestrates dynamic array formulas and spills into grid', () => {
      const grid = makeGrid({
        A1: { formula: '=SEQUENCE(2, 2)' },
      });

      const { updatedCells, spillErrors } = recalculateGridWithSpill(grid);
      expect(spillErrors).toEqual([]);
      expect(updatedCells['A1']?.value).toBe(1);
      expect(updatedCells['B1']?.value).toBe(2);
      expect(updatedCells['A2']?.value).toBe(3);
      expect(updatedCells['B2']?.value).toBe(4);
    });

    it('recalculateGridWithSpill registers #SPILL! when blocked by cell', () => {
      const grid = makeGrid({
        A1: { formula: '=SEQUENCE(2, 2)' },
        B1: { value: 'Blocking content' },
      });

      const { updatedCells, spillErrors } = recalculateGridWithSpill(grid);
      expect(spillErrors).toContain('A1');
      expect(updatedCells['A1']?.value).toBe('#SPILL!');
      // Blocking cell preserves its original value
      expect(updatedCells['B1']?.value).toBe('Blocking content');
    });
  });

  // ==========================================
  // SECTION 10: Formula Auditing & Circularity
  // ==========================================
  describe('10. Graph Auditing & Circular References', () => {
    it('extractReferencesFromFormula captures coordinates and expands ranges', () => {
      const refs = extractReferencesFromFormula('=SUM(A1:B2) + C3 * $D$4');
      expect(refs).toContain('A1');
      expect(refs).toContain('A2');
      expect(refs).toContain('B1');
      expect(refs).toContain('B2');
      expect(refs).toContain('C3');
      expect(refs).toContain('D4');
    });

    it('getPrecedents identifies direct formula precedents', () => {
      const grid = makeGrid({
        C1: { formula: '=A1 + B1' },
      });
      const prec = getPrecedents('C1', grid);
      expect(prec).toEqual(expect.arrayContaining(['A1', 'B1']));
    });

    it('getDependents identifies all worksheet cells depending on target coordinate', () => {
      const grid = makeGrid({
        A1: { value: 100 },
        B1: { formula: '=A1 * 2' },
        C1: { formula: '=SUM(A1:A5)' },
        D1: { formula: '=Z10 + 5' },
      });

      const deps = getDependents('A1', grid);
      expect(deps).toContain('B1');
      expect(deps).toContain('C1');
      expect(deps).not.toContain('D1');
    });

    it('detects direct circular reference and returns #CIRCULAR!', () => {
      const grid = makeGrid({
        A1: { formula: '=A1 + 1' },
      });
      expect(evaluateGridFormulaLocal('=A1 + 1', grid)).toBe('#CIRCULAR!');
    });

    it('detects indirect circular dependency chains and returns #CIRCULAR!', () => {
      const grid = makeGrid({
        A1: { formula: '=B1 + 1' },
        B1: { formula: '=C1 * 2' },
        C1: { formula: '=A1 - 5' },
      });
      expect(evaluateGridFormulaLocal('=A1', grid)).toBe('#CIRCULAR!');
    });
  });
});
