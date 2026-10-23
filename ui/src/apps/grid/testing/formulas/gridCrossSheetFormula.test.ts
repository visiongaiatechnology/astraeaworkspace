// STATUS: DIAMANT VGT SUPREME
// Unit tests for Cross-Sheet and 3D Formula evaluation in Astraea Grid

import { describe, it, expect } from 'vitest';
import { evaluateGridFormulaLocal, parseSheetReference } from '../../formulas/gridFormulaEngine';
import { GridCell } from '../../../../shared/contracts/workspace';

describe('Cross-Sheet Reference Parser', () => {
  it('parses standard sheet reference', () => {
    const res = parseSheetReference('Sheet2!A1');
    expect(res).not.toBeNull();
    expect(res?.startSheet).toBe('Sheet2');
    expect(res?.cellOrRange).toBe('A1');
    expect(res?.endSheet).toBeUndefined();
  });

  it('parses quoted sheet name with spaces', () => {
    const res = parseSheetReference("'Q1 Budget'!B10");
    expect(res).not.toBeNull();
    expect(res?.startSheet).toBe('Q1 Budget');
    expect(res?.cellOrRange).toBe('B10');
  });

  it('parses 3D multi-sheet range reference', () => {
    const res = parseSheetReference('Sheet1:Sheet3!A1:B10');
    expect(res).not.toBeNull();
    expect(res?.startSheet).toBe('Sheet1');
    expect(res?.endSheet).toBe('Sheet3');
    expect(res?.cellOrRange).toBe('A1:B10');
  });
});

describe('Cross-Sheet & 3D Formula Engine Evaluation', () => {
  const sheet1Cells: Record<string, GridCell> = {
    A1: { value: 100 },
    B1: { value: 50 },
  };

  const sheet2Cells: Record<string, GridCell> = {
    A1: { value: 200 },
    B1: { value: 30 },
  };

  const sheet3Cells: Record<string, GridCell> = {
    A1: { value: 300 },
    B1: { value: 20 },
  };

  const allSheets: Record<string, Record<string, GridCell>> = {
    Sheet1: sheet1Cells,
    Sheet2: sheet2Cells,
    Sheet3: sheet3Cells,
  };

  it('evaluates single cross-sheet cell reference', () => {
    const res = evaluateGridFormulaLocal('=Sheet2!A1 * 2', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe(400); // 200 * 2
  });

  it('evaluates arithmetic with multiple sheets', () => {
    const res = evaluateGridFormulaLocal('=A1 + Sheet2!A1 + Sheet3!A1', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe(600); // 100 + 200 + 300
  });

  it('evaluates cross-sheet range aggregate with SUM', () => {
    const res = evaluateGridFormulaLocal('=SUM(Sheet2!A1:B1)', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe(230); // 200 + 30
  });

  it('evaluates 3D multi-sheet reference across Sheet1:Sheet3', () => {
    // A1 in Sheet1 (100), Sheet2 (200), Sheet3 (300)
    const res = evaluateGridFormulaLocal('=SUM(Sheet1:Sheet3!A1)', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe(600); // 100 + 200 + 300
  });

  it('evaluates 3D multi-sheet range aggregate across Sheet1:Sheet3!A1:B1', () => {
    // Sheet1: 100 + 50 = 150
    // Sheet2: 200 + 30 = 230
    // Sheet3: 300 + 20 = 320
    // Total = 700
    const res = evaluateGridFormulaLocal('=SUM(Sheet1:Sheet3!A1:B1)', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe(700);
  });

  it('returns #REF! for invalid non-existent sheet reference', () => {
    const res = evaluateGridFormulaLocal('=NonExistentSheet!A1 + 5', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe('#REF!');
  });

  // Runde 229: Dieser Test deckt einen Pfad, der bis Runde 228 UNGEDECKT war.
  //
  // Ein Blattbereich in SKALAR-Position — also `=Sheet1:Sheet3!A1` OHNE `SUM` —
  // ist kein Skalar. Die Funktion `resolveCell` gibt `FormulaValue` zurueck,
  // und bei mehreren Blaettern gab sie vorher `vals` selbst zurueck, ein ARRAY,
  // verdeckt durch `as any`. Der Aufrufer behandelte das Array als Skalar, also
  // entstand ein STILLER falscher Wert.
  //
  // Der kanonische 3D-Pfad ist `resolveRange2D` (gridFormulaEngine.ts:250-260),
  // den `SUM` benutzt — deshalb gehen die beiden Tests darueber und beruehren
  // diesen Zweig nie.
  //
  // ROTER FALL: mit der alten Form `vals.length === 1 ? vals[0] : (vals as any)`
  // liefert dieser Aufruf ein ARRAY, und `toBe('#VALUE!')` versagt. Der Test ist
  // also nicht nur gruen, weil irgendetwas gruen ist.
  //
  // Und `#VALUE!` ist die fail-closed Wahl: `#REF!` waere falsch, weil die
  // Blaetter existieren; `vals[0]` waere willkuerlich und lieferte einen
  // falschen Wert.
  it('returns #VALUE! for a sheet range in scalar position (no SUM)', () => {
    const res = evaluateGridFormulaLocal('=Sheet1:Sheet3!A1', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe('#VALUE!');
  });

  it('returns #VALUE! for a sheet range in scalar arithmetic, not a silent array', () => {
    // Und die Verstaerkung: in einer ARITHMETIK darf kein ARRAY entstehen.
    // `+ 1` auf einem Array ergaebe in JavaScript eine Zeichenkette wie
    // "100,200,3001" — ein stiller falscher Wert, der nirgends auffiele.
    //
    // Runde 231: Hier stand zusaetzlich `expect(typeof res).not.toBe('string')`.
    // Das war FALSCH: der Fehlerwert `#VALUE!` IST ein String, die beiden
    // Zusicherungen widersprachen sich also und die zweite konnte nie bestehen,
    // wenn die erste besteht. Gemeint war „kein ARRAY" — und genau das wird
    // jetzt geprueft.
    const res = evaluateGridFormulaLocal('=Sheet1:Sheet3!A1 + 1', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe('#VALUE!');
    expect(Array.isArray(res)).toBe(false);
  });

  it('GEGENPROBE: the canonical 3D aggregate path still sums across sheets', () => {
    // Dieselben Blaetter, derselbe Bereich — nur ueber den kanonischen Pfad.
    // Ohne diese Zusicherung koennte der Test oben auch dann gruen sein,
    // wenn 3D-Bereiche insgesamt kaputt waeren.
    const res = evaluateGridFormulaLocal('=SUM(Sheet1:Sheet3!A1)', sheet1Cells, new Set(), allSheets, 'Sheet1');
    expect(res).toBe(600);
  });

  it('detects circular dependencies across sheets and returns #CIRCULAR!', () => {
    const circularSheets: Record<string, Record<string, GridCell>> = {
      SheetA: {
        A1: { value: 0, formula: '=SheetB!B1 + 1' },
      },
      SheetB: {
        B1: { value: 0, formula: '=SheetA!A1 + 1' },
      },
    };

    const res = evaluateGridFormulaLocal(
      circularSheets.SheetA.A1.formula!,
      circularSheets.SheetA,
      new Set(),
      circularSheets,
      'SheetA'
    );
    expect(res).toBe('#CIRCULAR!');
  });
});
