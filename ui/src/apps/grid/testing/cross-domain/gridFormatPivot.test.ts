// STATUS: DIAMANT VGT SUPREME
// Astraea Grid Formatting & Pivot Engine Test Suite

import { describe, it, expect } from "vitest";
import { formatCellValue, toFractionString, applyCustomNumberFormat } from "../../compat/gridUtils";
import { buildPivotResult, pivotResultToCells } from "../../compat/gridProfessional";
import { GridCell, GridPivotDefinition } from "../../../../shared/contracts/grid/workspaceGrid";

describe("Astraea Grid — Cell Formatting & Number Format Codes", () => {
  describe("toFractionString", () => {
    it("converts common decimals to exact fractions", () => {
      expect(toFractionString(0.5)).toBe("1/2");
      expect(toFractionString(0.25)).toBe("1/4");
      expect(toFractionString(0.75)).toBe("3/4");
      expect(toFractionString(0.125)).toBe("1/8");
      expect(toFractionString(2.5)).toBe("2 1/2");
      expect(toFractionString(10)).toBe("10");
      expect(toFractionString(-0.5)).toBe("-1/2");
    });
  });

  describe("applyCustomNumberFormat", () => {
    it("applies Euro currency format", () => {
      const res = applyCustomNumberFormat(1250.5, "#,##0.00 €");
      expect(res).toContain("1,250.50");
      expect(res).toContain("€");
    });

    it("applies Dollar currency format", () => {
      const res = applyCustomNumberFormat(450, "$#,##0");
      expect(res).toContain("$");
      expect(res).toContain("450");
    });

    it("applies percentage format code", () => {
      const res = applyCustomNumberFormat(0.185, "0.00%");
      expect(res).toBe("18.50%");
    });
  });

  describe("formatCellValue", () => {
    it("formats accounting positive and negative numbers", () => {
      const posCell: GridCell = { value: 1000, format: "accounting" };
      const negCell: GridCell = { value: -1000, format: "accounting" };
      expect(formatCellValue(posCell)).toContain("$ 1,000.00");
      expect(formatCellValue(negCell)).toBe("($ 1,000.00)");
    });

    it("formats scientific notation", () => {
      const cell: GridCell = { value: 12345, format: "scientific" };
      // Excel-standard exponent padding: the canonical `0.00E+00` code renders 1.23E+04.
      expect(formatCellValue(cell)).toBe("1.23E+04");
    });

    it("formats fraction representation", () => {
      const cell: GridCell = { value: 3.75, format: "fraction" };
      expect(formatCellValue(cell)).toBe("3 3/4");
    });

    it("prioritizes numberFormatCode when present", () => {
      const cell: GridCell = { value: 2500, numberFormatCode: "#,##0.00 €" };
      const formatted = formatCellValue(cell);
      expect(formatted).toContain("2,500.00");
      expect(formatted).toContain("€");
    });
  });
});

describe("Astraea Grid — Pivot Table Engine", () => {
  const testCells: Record<string, GridCell> = {
    A1: { value: "Region" },
    B1: { value: "Revenue" },

    A2: { value: "North" },
    B2: { value: 100 },

    A3: { value: "South" },
    B3: { value: 200 },

    A4: { value: "North" },
    B4: { value: 300 },

    A5: { value: "East" },
    B5: { value: 150 },

    A6: { value: "South" },
    B6: { value: 250 },
  };

  it("calculates SUM aggregation grouped by row column", () => {
    const def: GridPivotDefinition = {
      id: "piv-1",
      name: "Regional Revenue",
      sourceRange: "A1:B6",
      rowColumn: "A",
      valueColumn: "B",
      aggregation: "sum",
    };

    const result = buildPivotResult(testCells, def);
    expect(result.rows).toEqual([
      ["East", 150],
      ["North", 400],
      ["South", 450],
    ]);
  });

  it("calculates AVERAGE aggregation", () => {
    const def: GridPivotDefinition = {
      id: "piv-2",
      name: "Regional Avg",
      sourceRange: "A1:B6",
      rowColumn: "A",
      valueColumn: "B",
      aggregation: "average",
    };

    const result = buildPivotResult(testCells, def);
    expect(result.rows).toEqual([
      ["East", 150],
      ["North", 200],
      ["South", 225],
    ]);
  });

  it("calculates MIN and MAX aggregations", () => {
    const minDef: GridPivotDefinition = {
      id: "piv-min",
      name: "Regional Min",
      sourceRange: "A1:B6",
      rowColumn: "A",
      valueColumn: "B",
      aggregation: "min",
    };
    const maxDef: GridPivotDefinition = {
      id: "piv-max",
      name: "Regional Max",
      sourceRange: "A1:B6",
      rowColumn: "A",
      valueColumn: "B",
      aggregation: "max",
    };

    expect(buildPivotResult(testCells, minDef).rows).toEqual([
      ["East", 150],
      ["North", 100],
      ["South", 200],
    ]);
    expect(buildPivotResult(testCells, maxDef).rows).toEqual([
      ["East", 150],
      ["North", 300],
      ["South", 250],
    ]);
  });

  it("calculates COUNT and DISTINCT_COUNT aggregations", () => {
    const countDef: GridPivotDefinition = {
      id: "piv-cnt",
      name: "Regional Count",
      sourceRange: "A1:B6",
      rowColumn: "A",
      valueColumn: "B",
      aggregation: "count",
    };
    const distDef: GridPivotDefinition = {
      id: "piv-dist",
      name: "Regional Distinct",
      sourceRange: "A1:B6",
      rowColumn: "A",
      valueColumn: "B",
      aggregation: "distinct_count",
    };

    expect(buildPivotResult(testCells, countDef).rows).toEqual([
      ["East", 1],
      ["North", 2],
      ["South", 2],
    ]);
    expect(buildPivotResult(testCells, distDef).rows).toEqual([
      ["East", 1],
      ["North", 2],
      ["South", 2],
    ]);
  });

  it("converts pivot results to sheet cell objects with headers", () => {
    const def: GridPivotDefinition = {
      id: "piv-cells",
      name: "Cells Export",
      sourceRange: "A1:B6",
      rowColumn: "A",
      valueColumn: "B",
      aggregation: "sum",
    };
    const result = buildPivotResult(testCells, def);
    const cells = pivotResultToCells(result);

    expect(cells.A1.value).toBe("A");
    expect(cells.B1.value).toBe("SUM(B)");
    expect(cells.A2.value).toBe("East");
    expect(cells.B2.value).toBe(150);
    expect(cells.A3.value).toBe("North");
    expect(cells.B3.value).toBe(400);
  });
});
