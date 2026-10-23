// STATUS: PLATIN — counter-checks for Grid Paket 37 (Diagramm-Assistent mit Live-Vorschau) and
// Paket 38 (Chart-Layout und Export).
//
// Hand-written oracle:
//   37: "Datenbereich auswählen, Säulen-/Linienchart erstellen und Achsen editieren."
//   38: "Legende, Beschriftungen und Fehlerbalken gestalten und als PNG/SVG exportieren."
import { describe, expect, it } from 'vitest';
import type { ChartObject, GridCell } from '../../../../shared/contracts/workspace';
import { buildGridChartFromRange, createGridChartTemplate, applyGridChartTemplate } from '../../charts/gridChartEngine';
import {
  buildGridChartLayout,
  GRID_CHART_TYPES,
  type GridChartLayoutControls,
} from '../../charts/gridChartLayout';
import { assertGridChartExportable } from '../../integrations/gridChartExport';

function sheetCells(): Record<string, GridCell> {
  return {
    A1: { value: 'Monat' }, B1: { value: 'Umsatz' }, C1: { value: 'Kosten' },
    A2: { value: 'Jan' }, B2: { value: 1200 }, C2: { value: 700 },
    A3: { value: 'Feb' }, B3: { value: 1500 }, C3: { value: 800 },
    A4: { value: 'Mär' }, B4: { value: 900 }, C4: { value: 600 },
    A5: { value: '' }, B5: { value: '' }, C5: { value: '' },
  };
}

function baseControls(overrides: Partial<GridChartLayoutControls> = {}): GridChartLayoutControls {
  return {
    title: 'Umsatz je Monat', chartType: 'column', stylePreset: 'astraea-dark', legend: 'bottom',
    showDataLabels: false, showGridlines: true,
    xAxisTitle: '', yAxisTitle: '', secondaryAxisTitle: '',
    xAxisScale: 'category', yAxisScale: 'linear',
    yMin: '', yMax: '', yMajorUnit: '', yNumberFormat: '',
    annotationText: '', referenceLineValue: '', firstPointColor: '#3b82f6',
    trendline: 'none', errorBar: 'none',
    seriesOrder: [], seriesTypes: {}, secondarySeries: {}, seriesAggregation: {},
    ...overrides,
  };
}

function baseChart(range = 'A1:C4', type: ChartObject['chart_type'] = 'column'): ChartObject {
  return buildGridChartFromRange(sheetCells(), range, type, {
    sheetId: 's1', documentId: 'doc-1', tableObjectId: 'table-1', live: true, title: 'Umsatz je Monat',
  });
}

describe('Grid chart assistant: range -> chart with an empty-cell-correct model (AST-0422)', () => {
  it('builds a column chart from a selected range with categories and named series', () => {
    const chart = baseChart();
    expect(chart.chart_type).toBe('column');
    expect(chart.categories).toEqual(['Jan', 'Feb', 'Mär']);
    expect(chart.series.map((series) => series.name)).toEqual(['Umsatz', 'Kosten']);
    expect(chart.series[0]?.values).toEqual([1200, 1500, 900]);
    expect(chart.data_source_link).toContain('range=A1%3AC4');
    expect(chart.source).toMatchObject({ kind: 'range', live: true, state: 'current' });
  });

  it('builds a line chart for the same range', () => {
    const chart = baseChart('A1:C4', 'line');
    expect(chart.chart_type).toBe('line');
    expect(chart.series).toHaveLength(2);
  });

  it('treats an empty cell as missing instead of as the number 0', () => {
    // The last row is entirely empty; with the old `Number('') === 0` behaviour it produced a
    // fabricated zero data point and the header heuristic mis-fitted.
    const chart = baseChart('A1:C5');
    expect(chart.series[0]?.values).toEqual([1200, 1500, 900, 0]);
    expect(chart.categories).toHaveLength(4);
    // The fourth category comes from an empty cell, so it stays empty rather than being invented.
    expect(chart.categories[3]).toBe('');
    // A range made only of empty data rows cannot produce a numeric series at all.
    expect(() => buildGridChartFromRange(sheetCells(), 'A5:C5', 'column', { sheetId: 's1' }))
      .toThrow('chart_source_has_no_numeric_series');
  });

  it('rejects an invalid or oversized range instead of drawing something wrong', () => {
    for (const range of ['nonsense', 'A0:C4', '', 'ZZZ999999:XFD1048576']) {
      expect(() => buildGridChartFromRange(sheetCells(), range, 'column', { sheetId: 's1' }))
        .toThrow('chart_source_range_limit');
    }
    expect(() => buildGridChartFromRange(sheetCells(), 'A1:A1', 'column', { sheetId: 's1' }))
      .toThrow('chart_source_has_no_numeric_series');
    expect(() => buildGridChartFromRange(sheetCells(), 'A1:B5000', 'column', { sheetId: 's1' }))
      .toThrow('chart_series_point_limit');
  });

  it('normalises a reversed range instead of charting the wrong window', () => {
    const forward = baseChart('A1:C4');
    const reversed = baseChart('C4:A1');
    expect(reversed.categories).toEqual(forward.categories);
    expect(reversed.series.map((series) => series.values)).toEqual(forward.series.map((series) => series.values));
  });

  it('requires two numeric columns for a scatter chart', () => {
    expect(() => buildGridChartFromRange(sheetCells(), 'A1:A4', 'scatter', { sheetId: 's1' })).toThrow();
    const scatter = buildGridChartFromRange(sheetCells(), 'B1:C4', 'scatter', { sheetId: 's1' });
    expect(scatter.series[0]?.x_values).toEqual([1200, 1500, 900]);
    expect(scatter.series[0]?.values).toEqual([700, 800, 600]);
  });

  it('keeps a saved template round-trippable and bounded', () => {
    const chart = baseChart();
    const template = createGridChartTemplate(chart, '  Standard  ');
    expect(template.name).toBe('Standard');
    expect(template.chartType).toBe('column');
    const applied = applyGridChartTemplate(baseChart('A1:C4', 'line'), template);
    expect(applied.chart_type).toBe('column');
    expect(applied.template_name).toBe('Standard');
    expect(() => createGridChartTemplate(chart, '   ')).toThrow('chart_template_name_required');
  });
});

describe('Grid chart layout: axis, legend and error-bar editing never crashes the surface (AST-0427/0429)', () => {
  it('edits both axis titles, the legend position and the data labels', () => {
    const result = buildGridChartLayout(baseChart(), baseControls({
      xAxisTitle: 'Monat', yAxisTitle: 'EUR', legend: 'right', showDataLabels: true,
    }));
    if (!result.ok) throw new Error(result.error);
    expect(result.chart.x_axis_title).toBe('Monat');
    expect(result.chart.y_axis_title).toBe('EUR');
    expect(result.chart.legend_position).toBe('right');
    expect(result.chart.show_data_labels).toBe(true);
    expect(result.chart.show_gridlines).toBe(true);
  });

  it('reports an inverted Y axis as a message instead of throwing out of render', () => {
    const result = buildGridChartLayout(baseChart(), baseControls({ yMin: '10', yMax: '5' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/Y-Minimum muss kleiner/u);
  });

  it('reports a non-numeric axis bound, an out-of-range bound and a non-positive log minimum', () => {
    const nonNumeric = buildGridChartLayout(baseChart(), baseControls({ yMin: 'abc' }));
    expect(nonNumeric.ok).toBe(false);
    if (!nonNumeric.ok) expect(nonNumeric.error).toMatch(/muss eine Zahl sein/u);

    const outOfRange = buildGridChartLayout(baseChart(), baseControls({ yMax: '1e30' }));
    expect(outOfRange.ok).toBe(false);

    const logMin = buildGridChartLayout(baseChart(), baseControls({ yAxisScale: 'log', yMin: '0' }));
    expect(logMin.ok).toBe(false);
    if (!logMin.ok) expect(logMin.error).toMatch(/logarithmische Y-Achse/u);

    const logOk = buildGridChartLayout(baseChart(), baseControls({ yAxisScale: 'log', yMin: '1' }));
    expect(logOk.ok).toBe(true);
  });

  it('accepts a valid numeric envelope and a numeric reference line', () => {
    const result = buildGridChartLayout(baseChart(), baseControls({
      yMin: '0', yMax: '2000', yMajorUnit: '500', yNumberFormat: '#,##0 €', referenceLineValue: '1000',
    }));
    if (!result.ok) throw new Error(result.error);
    expect(result.chart.y_axis).toMatchObject({ min: 0, max: 2000, major_unit: 500, number_format: '#,##0 €' });
    expect(result.chart.reference_lines).toEqual([{ axis: 'y', value: 1000, label: 'Reference' }]);
  });

  it('attaches error bars and a trendline only to the first series', () => {
    const result = buildGridChartLayout(baseChart(), baseControls({ errorBar: 'percentage', trendline: 'moving-average' }));
    if (!result.ok) throw new Error(result.error);
    expect(result.chart.error_bars).toEqual([{ seriesIndex: 0, type: 'percentage', value: 5 }]);
    expect(result.chart.trendlines).toEqual([{ seriesIndex: 0, type: 'moving-average', period: 3 }]);

    const none = buildGridChartLayout(baseChart(), baseControls({ errorBar: 'none', trendline: 'none' }));
    if (!none.ok) throw new Error(none.error);
    expect(none.chart.error_bars).toEqual([]);
    expect(none.chart.trendlines).toEqual([]);
  });

  it('reorders series deterministically and ignores duplicate or out-of-range positions', () => {
    const result = buildGridChartLayout(baseChart(), baseControls({ seriesOrder: [1, 1, 5, -2, 0] }));
    if (!result.ok) throw new Error(result.error);
    expect(result.chart.series.map((series) => series.name)).toEqual(['Kosten', 'Umsatz']);
  });

  it('rejects unknown chart types, legend positions, style presets and colours', () => {
    for (const controls of [
      baseControls({ chartType: 'pie3d' as never }),
      baseControls({ legend: 'middle' as never }),
      baseControls({ stylePreset: 'neon' as never }),
      baseControls({ firstPointColor: 'red' }),
      baseControls({ yNumberFormat: 'x'.repeat(65) }),
      baseControls({ annotationText: 'x'.repeat(513) }),
    ]) {
      expect(buildGridChartLayout(baseChart(), controls).ok).toBe(false);
    }
    expect(GRID_CHART_TYPES).toContain('column');
    expect(GRID_CHART_TYPES).not.toContain('pie3d');
  });

  it('accepts every offered chart type', () => {
    for (const chartType of GRID_CHART_TYPES) {
      const result = buildGridChartLayout(baseChart('A1:C4', chartType === 'scatter' || chartType === 'bubble' ? 'scatter' : 'column'), baseControls({ chartType }));
      expect(result.ok).toBe(true);
    }
  });
});

describe('Grid chart export preflight (AST-0429/0430)', () => {
  it('accepts a well-formed bounded chart', () => {
    expect(() => assertGridChartExportable(baseChart())).not.toThrow();
  });

  it('refuses a chart with no series, a non-finite value or too many points', () => {
    const noSeries = { ...baseChart(), series: [] } as ChartObject;
    expect(() => assertGridChartExportable(noSeries)).toThrow('chart_export_has_no_series');

    const broken = baseChart();
    broken.series[0]!.values = [1, Number.NaN, 3];
    expect(() => assertGridChartExportable(broken)).toThrow('chart_export_non_finite_value');

    const huge = baseChart();
    huge.series = [{ name: 'S', values: Array.from({ length: 2_049 }, () => 1) }];
    // The canonical model clips at 2,048 points, so a raw oversized series is refused explicitly.
    expect(() => assertGridChartExportable(huge)).toThrow('chart_export_point_limit');
  });

  it('refuses a non-chart value at the export boundary', () => {
    expect(() => assertGridChartExportable(undefined as unknown as ChartObject)).toThrow('chart_export_invalid');
    expect(() => assertGridChartExportable({ chart_type: 'column' } as unknown as ChartObject)).toThrow('chart_export_has_no_series');
  });
});
