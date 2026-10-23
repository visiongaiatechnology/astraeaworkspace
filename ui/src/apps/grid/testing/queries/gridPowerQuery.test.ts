// STATUS: DIAMANT VGT SUPREME
// Unit tests for Astraea Grid Power Query (M-Engine) ETL pipeline: parse, transform, unpivot, join, load

import { describe, it, expect } from 'vitest';
import {
  parseCsvToQueryTable,
  executeQueryPipeline,
  queryResultToGridCells,
  QueryStep,
  QueryColumn,
} from '../../queries/gridPowerQuery';

describe('Power Query (M-Engine) ETL Pipeline', () => {
  const sampleCsv = `Country,Year2023,Year2024,Region
Germany,100,120,EMEA
USA,300,350,AMER
Japan,200,210,APAC`;

  it('parses CSV and infers numeric column types', () => {
    const { columns, rows } = parseCsvToQueryTable(sampleCsv);
    expect(columns.length).toBe(4);
    expect(columns[0].name).toBe('Country');
    expect(columns[1].name).toBe('Year2023');
    expect(columns[1].type).toBe('number');
    expect(columns[2].name).toBe('Year2024');
    expect(columns[2].type).toBe('number');
    expect(rows.length).toBe(3);
    expect(rows[0][1]).toBe(100);
  });

  it('executes filter and sort steps', () => {
    const { columns, rows } = parseCsvToQueryTable(sampleCsv);
    const steps: QueryStep[] = [
      {
        id: 'step-filter',
        type: 'filter',
        description: 'Filter rows where Year2023 >= 200',
        params: { colIndex: 1, operator: 'greater', value: 150 },
      },
      {
        id: 'step-sort',
        type: 'sort',
        description: 'Sort descending by Year2023',
        params: { colIndex: 1, ascending: false },
      },
    ];

    const result = executeQueryPipeline(columns, rows, steps);
    expect(result.rowCount).toBe(2); // USA (300) and Japan (200)
    expect(result.rows[0][0]).toBe('USA');
    expect(result.rows[1][0]).toBe('Japan');
  });

  it('executes groupBy with SUM aggregation', () => {
    const salesData: { columns: QueryColumn[]; rows: any[][] } = {
      columns: [
        { name: 'Category', type: 'text' },
        { name: 'Sales', type: 'number' },
      ],
      rows: [
        ['Electronics', 500],
        ['Furniture', 300],
        ['Electronics', 700],
        ['Furniture', 200],
      ],
    };

    const steps: QueryStep[] = [
      {
        id: 'step-group',
        type: 'groupBy',
        description: 'Group by Category and SUM Sales',
        params: { groupColIndex: 0, aggColIndex: 1, aggFunction: 'sum' },
      },
    ];

    const result = executeQueryPipeline(salesData.columns, salesData.rows, steps);
    expect(result.rowCount).toBe(2);
    const elec = result.rows.find((r) => r[0] === 'Electronics');
    const furn = result.rows.find((r) => r[0] === 'Furniture');
    expect(elec?.[1]).toBe(1200);
    expect(furn?.[1]).toBe(500);
  });

  it('executes unpivot step to normalize wide columns into attribute-value rows', () => {
    const { columns, rows } = parseCsvToQueryTable(sampleCsv);
    const steps: QueryStep[] = [
      {
        id: 'step-unpivot',
        type: 'unpivot',
        description: 'Unpivot Year2023 and Year2024 into Year and Revenue',
        params: {
          fixedColIndices: [0, 3], // Country, Region
          unpivotColIndices: [1, 2], // Year2023, Year2024
          attributeColName: 'Year',
          valueColName: 'Revenue',
        },
      },
    ];

    const result = executeQueryPipeline(columns, rows, steps);
    // 3 rows * 2 unpivoted cols = 6 normalized rows
    expect(result.rowCount).toBe(6);
    expect(result.columns.map((c) => c.name)).toEqual(['Country', 'Region', 'Year', 'Revenue']);

    // Check first unpivoted row
    expect(result.rows[0]).toEqual(['Germany', 'EMEA', 'Year2023', 100]);
    expect(result.rows[1]).toEqual(['Germany', 'EMEA', 'Year2024', 120]);
  });

  it('executes join step to merge two tables on a key column', () => {
    const leftTable = {
      columns: [
        { name: 'EmployeeID', type: 'text' as const },
        { name: 'Name', type: 'text' as const },
      ],
      rows: [
        ['E1', 'Alice'],
        ['E2', 'Bob'],
        ['E3', 'Charlie'],
      ],
    };

    const rightTable = {
      columns: [
        { name: 'EmpID', type: 'text' as const },
        { name: 'Department', type: 'text' as const },
      ],
      rows: [
        ['E1', 'Engineering'],
        ['E2', 'Finance'],
      ],
    };

    const steps: QueryStep[] = [
      {
        id: 'step-join',
        type: 'join',
        description: 'Left Join on EmployeeID = EmpID',
        params: {
          joinType: 'left',
          leftKeyIndex: 0,
          rightTable,
          rightKeyIndex: 0,
        },
      },
    ];

    const result = executeQueryPipeline(leftTable.columns, leftTable.rows, steps);
    expect(result.rowCount).toBe(3);
    // Alice -> Engineering
    expect(result.rows[0][1]).toBe('Alice');
    expect(result.rows[0][3]).toBe('Engineering');
    // Charlie -> null (Left join without match)
    expect(result.rows[2][1]).toBe('Charlie');
    expect(result.rows[2][3]).toBeNull();
  });

  it('converts query pipeline result into Astraea Grid cell coordinates', () => {
    const columns: QueryColumn[] = [
      { name: 'ID', type: 'text' },
      { name: 'Score', type: 'number' },
    ];
    const rows = [
      ['A01', 95],
      ['A02', 88],
    ];

    // Load starting at A1 (col 0, row 0)
    const cellMap = queryResultToGridCells(0, 0, columns, rows);
    // Header
    expect(cellMap['A1']).toBe('ID');
    expect(cellMap['B1']).toBe('Score');
    // Data
    expect(cellMap['A2']).toBe('A01');
    expect(cellMap['B2']).toBe('95');
    expect(cellMap['A3']).toBe('A02');
    expect(cellMap['B3']).toBe('88');
  });
});
