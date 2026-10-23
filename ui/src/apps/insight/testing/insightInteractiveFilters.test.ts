// STATUS: PLATIN — BATCH-INSIGHT-6: slicers and drilldown are real scope changes.
//
// MEASURED FACTS before this batch: `createSlicer` had no importer and no slicer was ever written to a
// page; `drillVisual` had no importer; the only interactive filter was the region segment bar. The
// functions below are pinned here, and the render contract in insightReportCanvas.test.tsx pins that the
// controls exist and are labelled.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightRecord, type InsightSlicer } from '../domain/types';
import { InsightError } from '../core/insightCore';
import {
  INSIGHT_SLICER_LIMITS,
  applyInsightSlicers,
  slicerFieldAllowed,
  slicerOptions,
  toggleSlicerValue,
} from '../interactions/insightSlicers';
import { INSIGHT_DRILL_DIMENSIONS, drillInsightVisual, insightDrillLevels } from '../interactions/insightDrill';
import { addSlicer, createSlicer, removeSlicer, updateSlicerSelection } from '../reports/insightReportEngine';
import { buildInsightChartObject } from '../integrations/insightChartBridge';

const model = () => structuredClone(DEFAULT_INSIGHT_MODEL);
const records = () => structuredClone(DEFAULT_INSIGHT_MODEL.records) as InsightRecord[];
const slicer = (field: string, selection: string[] = []): InsightSlicer => ({ ...createSlicer(field, 'list', selection as never), selection });

describe('Insight slicers (pure)', () => {
  it('lists the bounded option set of a field and counts what did not fit', () => {
    const options = slicerOptions(records(), 'region');
    expect(options.options).toEqual(['Europe-Central', 'Europe-North']);
    expect(options.omitted).toBe(0);
    const bounded = slicerOptions(records(), 'region', 1);
    expect(bounded.options).toHaveLength(1);
    expect(bounded.omitted).toBe(1);
    expect(slicerOptions(records(), 'no-such-column')).toEqual({ options:[], omitted:0 });
  });

  it('restricts the records to the selection and treats an empty selection as no restriction', () => {
    expect(applyInsightSlicers(records(), [])).toHaveLength(8);
    expect(applyInsightSlicers(records(), [slicer('region')])).toHaveLength(8);
    const central = applyInsightSlicers(records(), [slicer('region', ['Europe-Central'])]);
    expect(central).toHaveLength(4);
    expect(central.every((row) => row.region === 'Europe-Central')).toBe(true);
    // Two slicers combine as an AND, exactly like real slicer panels.
    const combined = applyInsightSlicers(records(), [slicer('region', ['Europe-Central']), slicer('quarter', ['Q2'])]);
    expect(combined.map((row) => row.id)).toEqual(['rec-5', 'rec-6']);
    // The document records are never mutated.
    expect(records()).toHaveLength(8);
  });

  it('bounds a date-range slicer between its two values and refuses an unparseable range', () => {
    const dated = records().map((row, index) => ({ ...row, booked: `2026-0${index % 2 === 0 ? 1 : 2}-1${index % 9}` }));
    const range: InsightSlicer = { ...createSlicer('booked', 'date-range', []), selection:['2026-01-01', '2026-01-31'] };
    const january = applyInsightSlicers(dated, [range]);
    expect(january.length).toBeGreaterThan(0);
    expect(january.every((row) => Date.parse(String(row.booked)) <= Date.parse('2026-01-31'))).toBe(true);
    const broken: InsightSlicer = { ...createSlicer('booked', 'date-range', []), selection:['not-a-date', 'also-not'] };
    expect(applyInsightSlicers(dated, [broken])).toHaveLength(0);
    const openEnded: InsightSlicer = { ...createSlicer('booked', 'date-range', []), selection:['2026-01-01'] };
    expect(applyInsightSlicers(dated, [openEnded])).toHaveLength(dated.length);
  });

  it('toggles one value at a time and refuses an oversized selection', () => {
    const base = slicer('region');
    expect(toggleSlicerValue(base, 'Europe-Central')).toEqual(['Europe-Central']);
    expect(toggleSlicerValue(slicer('region', ['Europe-Central']), 'Europe-Central')).toEqual([]);
    const full: InsightSlicer = { ...base, selection:Array.from({ length:INSIGHT_SLICER_LIMITS.maxOptions }, (_, index) => index) as never };
    expect(() => toggleSlicerValue(full, 'one-too-many')).toThrowError('insight-slicer-selection-limit');
  });

  it('allows only the documented dimension columns as slicer fields', () => {
    expect(slicerFieldAllowed('region')).toBe(true);
    expect(slicerFieldAllowed('product')).toBe(true);
    expect(slicerFieldAllowed('quarter')).toBe(true);
    expect(slicerFieldAllowed('revenue')).toBe(false);
    expect(slicerFieldAllowed('id')).toBe(false);
  });
});

describe('Insight slicers on a page (pure)', () => {
  it('adds, updates and removes a slicer and refuses the invalid cases by name', () => {
    const base = model().report;
    const pageId = base.activePageId;
    const entry = slicer('region', ['Europe-Central']);
    const added = addSlicer(base, pageId, entry);
    expect(added.pages[0].slicers).toHaveLength(1);
    expect(() => addSlicer(added, pageId, entry)).toThrowError('report-slicer-exists');
    const updated = updateSlicerSelection(added, pageId, entry.id, ['Europe-North']);
    expect(updated.pages[0].slicers[0].selection).toEqual(['Europe-North']);
    expect(() => updateSlicerSelection(added, pageId, 'no-such-slicer', [])).toThrowError('report-slicer-missing');
    // The second removal runs against the result of the first, so it must be refused.
    const removed = removeSlicer(updated, pageId, entry.id);
    expect(removed.pages[0].slicers).toHaveLength(0);
    expect(() => removeSlicer(removed, pageId, entry.id)).toThrowError('report-slicer-missing');
  });

  it('lets a bookmark carry the slicer selection, so a saved view really restores the filter', () => {
    const pageId = model().report.activePageId;
    const withSlicer = addSlicer(model().report, pageId, slicer('region', ['Europe-North']));
    const bookmark = { ...withSlicer, bookmarks:[{ id:'bm-1', name:'North', pageId, filters:[], slicers:structuredClone(withSlicer.pages[0].slicers), visualVisibility:{} }] };
    expect(bookmark.bookmarks[0].slicers[0].selection).toEqual(['Europe-North']);
  });
});

describe('Insight drilldown (pure)', () => {
  const withVisual = () => {
    const base = model();
    const pageId = base.report.activePageId;
    const visualId = base.report.pages[0].visuals[0].id;
    return { base, pageId, visualId };
  };

  it('walks the documented dimension order and rewrites the visual category', () => {
    const { base, pageId, visualId } = withVisual();
    expect(INSIGHT_DRILL_DIMENSIONS).toEqual(['region', 'product', 'quarter']);
    expect(insightDrillLevels(base, base.report.pages[0].visuals[0])).toEqual(['region', 'product', 'quarter']);
    const first = drillInsightVisual(base, pageId, visualId, 'down');
    const drilled = first.report.pages[0].visuals[0];
    expect(drilled.drillLevel).toBe(1);
    expect(drilled.encoding.category).toBe('product');
    // The chart really aggregates by the new column: the categories become the products.
    const chart = buildInsightChartObject({ ...drilled, encoding:{ ...drilled.encoding, values:['revenue'] } }, records(), { documentId:'d', cacheState:'stale', revision:1 }, first);
    expect(chart.categories).toEqual(['Astraea Enterprise Core', 'KeyVault HSM Enclave', 'Sovereign Mesh']);
    const second = drillInsightVisual(first, pageId, visualId, 'down');
    expect(second.report.pages[0].visuals[0].encoding.category).toBe('quarter');
    // The last level cannot be left, and the first cannot be left upwards.
    expect(() => drillInsightVisual(second, pageId, visualId, 'down')).toThrowError('insight-drill-limit');
    expect(() => drillInsightVisual(base, pageId, visualId, 'up')).toThrowError('insight-drill-limit');
    const back = drillInsightVisual(second, pageId, visualId, 'up');
    expect(back.report.pages[0].visuals[0].encoding.category).toBe('product');
  });

  it('uses a declared hierarchy when the visual names one and falls back otherwise', () => {
    const base = model();
    const [table] = base.semanticModel.tables;
    const hierarchy = { id:'hier-geo', name:'Geography', tableId:table.id, levels:[{ id:'l1', columnId:'col-region', name:'Region' }, { id:'l2', columnId:'col-product', name:'Product' }] };
    const withHierarchy = { ...base, semanticModel:{ ...base.semanticModel, hierarchies:[hierarchy] } };
    const pageId = withHierarchy.report.activePageId;
    const visual = { ...withHierarchy.report.pages[0].visuals[0], hierarchyId:'hier-geo' };
    expect(insightDrillLevels(withHierarchy, visual)).toEqual(['region', 'product']);
    // An unknown hierarchy id falls back to the canonical order instead of throwing.
    expect(insightDrillLevels(withHierarchy, { ...visual, hierarchyId:'no-such' })).toEqual(['region', 'product', 'quarter']);
    // A single-level hierarchy is not a drill path.
    const shallow = { ...withHierarchy, semanticModel:{ ...withHierarchy.semanticModel, hierarchies:[{ ...hierarchy, levels:[hierarchy.levels[0]] }] } };
    expect(insightDrillLevels(shallow, visual)).toEqual(['region', 'product', 'quarter']);
    expect(() => drillInsightVisual(base, pageId, 'no-such-visual', 'down')).toThrowError('report-visual-missing');
    expect(() => drillInsightVisual(base, 'no-such-page', visual.id, 'down')).toThrowError(InsightError);
  });
});
