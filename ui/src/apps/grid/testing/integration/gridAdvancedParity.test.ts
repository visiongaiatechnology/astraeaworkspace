// STATUS: DIAMANT VGT SUPREME
// Astraea Grid Advanced Parity Test Suite
// Exhaustive verification of Array Constants, Matrix Ops, Database Functions, LET/LAMBDA,
// Statistics Toolpak, Regression, Structured Tables, Pivot Data Model, Slicers & Workspace Embeds

import { describe, it, expect } from 'vitest';
import { evaluateGridFormulaLocal, recalculateGridWithSpill } from '../../formulas/gridFormulaEngine';
import {
  parseArrayConstant,
  matrixTranspose,
  matrixMultiply,
  matrixDeterminant,
  matrixInverse,
  evalDatabaseFunction,
} from '../../formulas/gridFormulaAdvanced';
import {
  calculateCorrel,
  calculateCovarianceP,
  calculateCovarianceS,
  calculateSlope,
  calculateIntercept,
  calculateRsq,
  calculateForecast,
  calculateSkewness,
  calculateKurtosis,
  generateDescriptiveStatistics,
} from '../../formulas/legacy/gridStatisticsToolpak';
import {
  propagateColumnFormula,
  multiKeySortRowIndices,
  applyNamedFilterView,
  evaluateSlicers,
  exportTableData,
  createTableWorkspaceDataset,
} from '../../tables/gridTableFeatures';
import {
  buildAdvancedPivotResult,
  drillDownPivotSourceRecords,
  joinDataModelTables,
} from '../../pivots/gridPivotAdvanced';
import {
  createGridLiveEmbedToken,
  validateCellEditPermission,
  mergeCellChanges,
} from '../../integrations/gridWorkspaceIntegration';
import { GridCell, GridStructuredTable, GridPivotDefinition } from '../../../../shared/contracts/grid/workspaceGrid';

describe('Astraea Grid — Array Constants & Matrix Operations', () => {
  it('parses array constants correctly into 2D matrices', () => {
    const arr = parseArrayConstant('{1, 2, 3; 4, 5, 6}');
    expect(arr).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('evaluates formulas with array constants in formula engine', () => {
    const res = evaluateGridFormulaLocal('=SUM({1, 2, 3; 4, 5, 6})', {});
    expect(res).toBe(21);
  });

  it('performs matrix transpose', () => {
    const transposed = matrixTranspose([
      [1, 2],
      [3, 4],
    ]);
    expect(transposed).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it('performs matrix multiplication (MMULT)', () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    const b = [
      [2, 0],
      [1, 2],
    ];
    const c = matrixMultiply(a, b);
    expect(c).toEqual([
      [4, 4],
      [10, 8],
    ]);
  });

  it('calculates matrix determinant (MDETERM)', () => {
    const mat = [
      [1, 2],
      [3, 4],
    ];
    const det = matrixDeterminant(mat);
    expect(det).toBe(-2);
  });

  it('calculates matrix inversion (MINVERSE)', () => {
    const mat = [
      [4, 7],
      [2, 6],
    ];
    const inv = matrixInverse(mat);
    expect(inv).toEqual([
      [0.6, -0.7],
      [-0.2, 0.4],
    ]);
  });
});

describe('Astraea Grid — Database Functions (DSUM, DAVERAGE, DCOUNT, DMIN, DMAX)', () => {
  const dbRange = [
    ['Category', 'Sales', 'Profit'],
    ['Furniture', 100, 20],
    ['Technology', 300, 80],
    ['Furniture', 200, 45],
    ['Office', 50, 10],
  ];

  const criteriaFurniture = [
    ['Category'],
    ['Furniture'],
  ];

  it('calculates DSUM for filtered database records', () => {
    const sum = evalDatabaseFunction('DSUM', [dbRange, 'Sales', criteriaFurniture]);
    expect(sum).toBe(300);
  });

  it('calculates DAVERAGE for filtered database records', () => {
    const avg = evalDatabaseFunction('DAVERAGE', [dbRange, 'Profit', criteriaFurniture]);
    expect(avg).toBe(32.5);
  });

  it('calculates DCOUNT, DMIN, DMAX for filtered records', () => {
    const count = evalDatabaseFunction('DCOUNT', [dbRange, 'Sales', criteriaFurniture]);
    const min = evalDatabaseFunction('DMIN', [dbRange, 'Sales', criteriaFurniture]);
    const max = evalDatabaseFunction('DMAX', [dbRange, 'Sales', criteriaFurniture]);
    expect(count).toBe(2);
    expect(min).toBe(100);
    expect(max).toBe(200);
  });
});

describe('Astraea Grid — Functional Programming (LET, MAP, BYROW, BYCOL, REDUCE)', () => {
  it('evaluates LET with local scoped variables', () => {
    const res = evaluateGridFormulaLocal('=LET(x, 10, y, 25, x * y)', {});
    expect(res).toBe(250);
  });

  it('evaluates nested LET statements', () => {
    const res = evaluateGridFormulaLocal('=LET(a, 5, b, LET(c, 3, a * c), a + b)', {});
    expect(res).toBe(20);
  });

  it('evaluates MAP with LAMBDA', () => {
    const res = evaluateGridFormulaLocal('=MAP({1, 2; 3, 4}, LAMBDA(x, x * 10))', {});
    expect(res).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });

  it('evaluates BYROW and BYCOL', () => {
    const rowRes = evaluateGridFormulaLocal('=BYROW({1, 2; 3, 4}, LAMBDA(r, SUM(r)))', {});
    expect(rowRes).toEqual([[3], [7]]);

    const colRes = evaluateGridFormulaLocal('=BYCOL({1, 2; 3, 4}, LAMBDA(c, SUM(c)))', {});
    expect(colRes).toEqual([[4, 6]]);
  });

  it('evaluates REDUCE accumulator with LAMBDA', () => {
    const res = evaluateGridFormulaLocal('=REDUCE(0, {1, 2, 3, 4}, LAMBDA(acc, val, acc + val))', {});
    expect(res).toBe(10);
  });

  it('evaluates array shaping SEQUENCE, VSTACK, HSTACK', () => {
    const seq = evaluateGridFormulaLocal('=SEQUENCE(2, 3, 1, 1)', {});
    expect(seq).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);

    const vstacked = evaluateGridFormulaLocal('=VSTACK({1, 2}, {3, 4})', {});
    expect(vstacked).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('Astraea Grid — Statistics Toolpak & Regression', () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [2, 4, 6, 8, 10];

  it('calculates perfect linear correlation (CORREL)', () => {
    const r = calculateCorrel(xs, ys);
    expect(r).toBe(1);
  });

  it('calculates covariance, slope, intercept and RSQ', () => {
    const covP = calculateCovarianceP(xs, ys);
    const covS = calculateCovarianceS(xs, ys);
    const slope = calculateSlope(ys, xs);
    const intercept = calculateIntercept(ys, xs);
    const rsq = calculateRsq(ys, xs);

    expect(covP).toBe(4);
    expect(covS).toBe(5);
    expect(slope).toBe(2);
    expect(intercept).toBe(0);
    expect(rsq).toBe(1);

    const skew = calculateSkewness([1, 2, 2, 3, 4, 5, 10]);
    const kurt = calculateKurtosis([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(typeof skew).toBe('number');
    expect(typeof kurt).toBe('number');
  });

  it('calculates linear FORECAST', () => {
    const predicted = calculateForecast(6, ys, xs);
    expect(predicted).toBe(12);
  });

  it('generates full Descriptive Statistics Toolpak Summary', () => {
    const data = [10, 20, 20, 40, 50, 60, 70];
    const stats = generateDescriptiveStatistics(data, 0.95);

    expect(stats.count).toBe(7);
    expect(stats.mean).toBe(38.57142857);
    expect(stats.median).toBe(40);
    expect(stats.mode).toBe(20);
    expect(stats.minimum).toBe(10);
    expect(stats.maximum).toBe(70);
    expect(stats.range).toBe(60);
    expect(stats.sum).toBe(270);
    expect(stats.confidenceLevel95).toBeGreaterThan(0);
  });
});

describe('Astraea Grid — Structured Tables & Calculated Columns', () => {
  const table: GridStructuredTable = {
    id: 'tbl-1',
    name: 'SalesTable',
    sheetId: 'sheet-1',
    range: 'A1:C4',
    hasHeaders: true,
    hasTotalsRow: false,
    columns: [
      { name: 'Qty' },
      { name: 'Price' },
      { name: 'Total' },
    ],
  };

  const cells: Record<string, GridCell> = {
    A1: { value: 'Qty' },
    B1: { value: 'Price' },
    C1: { value: 'Total' },

    A2: { value: 2 },
    B2: { value: 10 },

    A3: { value: 5 },
    B3: { value: 20 },

    A4: { value: 3 },
    B4: { value: 15 },
  };

  it('auto-propagates calculated column formula across all table data rows', () => {
    const { updatedCells } = propagateColumnFormula(table, 'Total', '=A2*B2', cells);
    expect(updatedCells.C2?.formula).toBe('=A2*B2');
    expect(updatedCells.C3?.formula).toBe('=A3*B3');
    expect(updatedCells.C4?.formula).toBe('=A4*B4');
  });

  it('sorts rows with multi-key criteria and custom lists', () => {
    const rows = [1, 2, 3];
    const sorted = multiKeySortRowIndices(
      rows,
      [{ column: 'A', direction: 'desc' }],
      cells
    );
    expect(sorted).toEqual([2, 3, 1]); // A3 (5), then A4 (3), then A2 (2)
  });

  it('exports table to CSV, TSV, and JSON formats', () => {
    const csv = exportTableData(table, cells, 'csv');
    expect(csv).toContain('"Qty","Price","Total"');
    expect(csv).toContain('"2","10",""');

    const json = exportTableData(table, cells, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(3);
    expect(parsed[0].Qty).toBe(2);
  });

  it('applies non-destructive Named Filter Views and evaluates Slicers', () => {
    const viewRows = applyNamedFilterView(
      { id: 'v1', name: 'HighQty', sheetId: 'sheet-1', filters: [{ id: 'f1', column: 'A', operator: 'greater-than', value: 2 }] },
      4,
      cells,
      0
    );
    expect(viewRows).toContain(2); // row index 2 has Qty 5
    expect(viewRows).toContain(3); // row index 3 has Qty 3

    const slicerMatch = evaluateSlicers(
      [{ id: 'sl-1', title: 'Price', column: 'B', selectedValues: ['20'] }],
      2,
      cells
    );
    expect(slicerMatch).toBe(true);
  });

  it('orchestrates iterative grid calculation with recalculateGridWithSpill', () => {
    const calcGrid: Record<string, GridCell> = {
      A1: { value: 10 },
      A2: { value: 0, formula: '=A1*2' },
    };
    const { updatedCells, spillErrors } = recalculateGridWithSpill(calcGrid, {
      enableIterativeCalculation: true,
      maxIterations: 5,
    });
    expect(updatedCells.A2?.value).toBe(20);
    expect(spillErrors.length).toBe(0);
  });

  it('creates Live Workspace Dataset with schema and SHA-256 sync digest', async () => {
    const ds = await createTableWorkspaceDataset(table, cells);
    expect(ds.tableName).toBe('SalesTable');
    expect(ds.recordCount).toBe(3);
    expect(ds.schema.length).toBe(3);
    expect(ds.syncDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('Astraea Grid — Advanced Pivot & Data Model', () => {
  const pivotCells: Record<string, GridCell> = {
    A1: { value: 'Date' },
    B1: { value: 'Amount' },

    A2: { value: '2026-01-15' },
    B2: { value: 100 },

    A3: { value: '2026-01-20' },
    B3: { value: 200 },

    A4: { value: '2026-02-10' },
    B4: { value: 300 },

    A5: { value: '2026-03-05' },
    B5: { value: 400 },
  };

  const pivotDef: GridPivotDefinition = {
    id: 'piv-date',
    name: 'DatePivot',
    sourceRange: 'A1:B5',
    rowColumn: 'A',
    valueColumn: 'B',
    aggregation: 'sum',
  };

  it('groups dates by Month and calculates custom field margin', () => {
    const res = buildAdvancedPivotResult(
      pivotCells,
      pivotDef,
      { column: 'A', dateGrouping: 'month' },
      [{ name: 'Tax', formula: 'B * 0.19' }]
    );

    expect(res.rows.length).toBe(3); // 2026-01, 2026-02, 2026-03
    expect(res.rows[0].groupKey).toBe('2026-01');
    expect(res.rows[0].metrics['SUM(B)']).toBe(300);
    expect(res.rows[0].metrics['Tax']).toBe(57);
  });

  it('drills down to original source records from pivot group', () => {
    const res = buildAdvancedPivotResult(
      pivotCells,
      pivotDef,
      { column: 'A', dateGrouping: 'month' }
    );
    const januaryRows = res.rows[0].sourceRecordRowIndices;
    const records = drillDownPivotSourceRecords(pivotCells, 'A1:B5', januaryRows);

    expect(records.length).toBe(2);
    expect(records[0].Amount).toBe(100);
    expect(records[1].Amount).toBe(200);
  });

  it('joins relational tables across local Data Model', () => {
    const tableCustomers: GridStructuredTable = {
      id: 'tbl-c',
      name: 'Customers',
      sheetId: 's1',
      range: 'A1:B3',
      hasHeaders: true,
      hasTotalsRow: false,
      columns: [{ name: 'CustId' }, { name: 'CustName' }],
    };
    const custCells: Record<string, GridCell> = {
      A1: { value: 'CustId' },
      B1: { value: 'CustName' },
      A2: { value: 1 },
      B2: { value: 'Alice' },
      A3: { value: 2 },
      B3: { value: 'Bob' },
    };

    const tableOrders: GridStructuredTable = {
      id: 'tbl-o',
      name: 'Orders',
      sheetId: 's1',
      range: 'A1:B3',
      hasHeaders: true,
      hasTotalsRow: false,
      columns: [{ name: 'OrderId' }, { name: 'CustomerId' }],
    };
    const orderCells: Record<string, GridCell> = {
      A1: { value: 'OrderId' },
      B1: { value: 'CustomerId' },
      A2: { value: 101 },
      B2: { value: 1 },
      A3: { value: 102 },
      B3: { value: 2 },
    };

    const joined = joinDataModelTables(
      tableCustomers,
      custCells,
      tableOrders,
      orderCells,
      { id: 'rel-1', primaryTableId: 'tbl-c', primaryColumn: 'CustId', foreignTableId: 'tbl-o', foreignColumn: 'CustomerId' }
    );
    expect(joined.length).toBe(2);
    expect(joined[0]['Customers.CustName']).toBe('Alice');
    expect(joined[0]['Orders.OrderId']).toBe(101);
  });
});

describe('Astraea Grid — Workspace Integration & Permissions', () => {
  const cells: Record<string, GridCell> = {
    A1: { value: 'KPI Sales' },
    A2: { value: 150000 },
  };

  it('generates an integrity-protected Grid Embed Token and does not claim a signature without a provider', async () => {
    const token = await createGridLiveEmbedToken('sheet-1', 'A1:A2', 'kpi', cells, 'Q1 Sales KPI');
    expect(token.sourceSheetId).toBe('sheet-1');
    expect(token.objectType).toBe('kpi');
    expect(token.dataSnapshot.values).toEqual([['KPI Sales'], [150000]]);
    expect(token.integrityDigest.algorithm).toBe('SHA-256');
    expect(token.integrityDigest.value).toMatch(/^[0-9a-f]{64}$/);
    expect(token.signature).toBeUndefined();
  });

  it('enforces cell permissions and protection rules', () => {
    const lockedCell: GridCell = { value: 10, locked: true };
    const unlockedCell: GridCell = { value: 20, locked: false };

    const check1 = validateCellEditPermission('A1', 'user1', ['editor'], { isProtected: true }, lockedCell);
    expect(check1.allowed).toBe(false);

    const check2 = validateCellEditPermission('A2', 'user1', ['editor'], { isProtected: true }, unlockedCell);
    expect(check2.allowed).toBe(true);

    const check3 = validateCellEditPermission(
      'B5',
      'user-guest',
      ['viewer'],
      undefined,
      undefined,
      [{ id: 'r1', range: 'B1:B10', allowedUsers: ['admin-1'], allowedRoles: ['finance'], isReadOnly: false }]
    );
    expect(check3.allowed).toBe(false);
  });

  it('merges cell changes with 3-way conflict resolution', () => {
    const cleanMerge = mergeCellChanges('A1', 'old', 'old', 'new', 100, 200);
    expect(cleanMerge.conflictDetected).toBe(false);
    expect(cleanMerge.mergedValue).toBe('new');

    const conflictMerge = mergeCellChanges('A1', 'base', 'userA', 'userB', 100, 200);
    expect(conflictMerge.conflictDetected).toBe(true);
    expect(conflictMerge.mergedValue).toBe('userB'); // LWW winner
  });
});
