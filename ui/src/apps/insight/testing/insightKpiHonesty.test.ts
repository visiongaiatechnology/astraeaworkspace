// STATUS: PLATIN — BATCH-INSIGHT-1: the KPI card may only show a period comparison that was
// actually derived from the visible records.
//
// MEASURED FACTS (proof: `interactions/insightCrossFilter.ts:25-38` before BATCH-INSIGHT-1 and the
// seeded model in `domain/types.ts:159-164`): `projectInsightKpis` recomputed the KPI *value* from
// the records but copied `changePct` and `trend` straight out of the stored template. The card
// therefore rendered "+18.4% vs prior period" next to a value that grew by 19.7% between Q1 and Q2,
// and nothing in the app ever computed or stored that 18.4. After a cross-filter the value changed
// while the percentage stayed frozen — a number no operation produced.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightRecord } from '../domain/types';
import {
  INSIGHT_KPI_MEASURE,
  INSIGHT_PERIOD_FIELD,
  projectInsightKpis,
  splitInsightPeriods,
} from '../interactions/insightCrossFilter';

const records = structuredClone(DEFAULT_INSIGHT_MODEL.records) as InsightRecord[];
const template = DEFAULT_INSIGHT_MODEL.kpis;
const stored = (id: string) => template.find((kpi) => kpi.id === id)!;
const project = (rows: readonly InsightRecord[]) => projectInsightKpis(rows, template, 'en-US');
const card = (rows: readonly InsightRecord[], id: string) => project(rows).find((kpi) => kpi.id === id)!;

describe('Insight KPI value projection (pure)', () => {
  it('computes every modelled value from the visible records', () => {
    const cards = project(records);
    const revenue = records.reduce((total, row) => total + row.revenue, 0);
    const cost = records.reduce((total, row) => total + row.cost, 0);
    const users = records.reduce((total, row) => total + row.activeUsers, 0);
    const anomaly = records.reduce((total, row) => total + row.anomalyScore, 0) / records.length * 100;

    expect(cards.find((kpi) => kpi.id === 'kpi-rev')!.value).toBe('$947,000');
    expect(cards.find((kpi) => kpi.id === 'kpi-margin')!.value).toBe(`${((revenue - cost) / revenue * 100).toFixed(1)}%`);
    expect(cards.find((kpi) => kpi.id === 'kpi-users')!.value).toBe(users.toLocaleString('en-US'));
    expect(cards.find((kpi) => kpi.id === 'kpi-anomaly')!.value).toBe(`${anomaly.toFixed(3)}%`);
    for (const card of cards) expect(card.computed).toBe(true);
  });

  it('derives the period comparison instead of copying the stored template number', () => {
    const revenue = card(records, 'kpi-rev');
    const q1 = records.filter((row) => row.quarter === 'Q1').reduce((total, row) => total + row.revenue, 0);
    const q2 = records.filter((row) => row.quarter === 'Q2').reduce((total, row) => total + row.revenue, 0);
    const expected = Number(((q2 - q1) / q1 * 100).toFixed(1));

    expect(q1).toBe(431000);
    expect(q2).toBe(516000);
    expect(expected).toBe(19.7);
    expect(revenue.comparison).not.toBeNull();
    expect(revenue.comparison!.change).toBe(expected);
    expect(revenue.comparison!.kind).toBe('relative');
    expect(revenue.comparison!.currentLabel).toBe('Q2');
    expect(revenue.comparison!.previousLabel).toBe('Q1');
    expect(revenue.comparison!.direction).toBe('up');
    // The stored template number was 18.4 and was never produced by any operation.
    expect(stored('kpi-rev').changePct).toBe(18.4);
    expect(revenue.comparison!.change).not.toBe(stored('kpi-rev').changePct);
  });

  it('reports a ratio KPI change in percentage points, not as a relative change of a ratio', () => {
    const margin = card(records, 'kpi-margin').comparison!;
    const marginOf = (rows: readonly InsightRecord[]) => {
      const revenue = rows.reduce((total, row) => total + row.revenue, 0);
      const cost = rows.reduce((total, row) => total + row.cost, 0);
      return (revenue - cost) / revenue * 100;
    };
    const expected = Number((marginOf(records.filter((row) => row.quarter === 'Q2')) - marginOf(records.filter((row) => row.quarter === 'Q1'))).toFixed(1));
    expect(margin.kind).toBe('percentage-points');
    expect(margin.change).toBe(expected);
    expect(margin.change).toBe(3);
    expect(card(records, 'kpi-anomaly').comparison!.kind).toBe('percentage-points');
  });

  it('recomputes the comparison inside the filtered scope', () => {
    const central = records.filter((row) => row.region === 'Europe-Central');
    const comparison = card(central, 'kpi-rev').comparison!;
    const q1 = central.filter((row) => row.quarter === 'Q1').reduce((total, row) => total + row.revenue, 0);
    const q2 = central.filter((row) => row.quarter === 'Q2').reduce((total, row) => total + row.revenue, 0);
    expect(q2).toBe(292000);
    expect(q1).toBe(243000);
    expect(comparison.change).toBe(Number(((q2 - q1) / q1 * 100).toFixed(1)));
    expect(comparison.change).not.toBe(card(records, 'kpi-rev').comparison!.change);
  });

  it('never invents a comparison when there is only one period in scope', () => {
    const q2 = records.filter((row) => row.quarter === 'Q2');
    expect(splitInsightPeriods(q2)).toBeNull();
    const comparisonCard = card(q2, 'kpi-rev');
    expect(comparisonCard.comparison).toBeNull();
    expect(comparisonCard.comparisonUnavailableReason).toBe('no-prior-period');
    // The value itself is still real: the Q2 sum.
    expect(comparisonCard.value).toBe('$516,000');
  });

  it('reports "no rows in scope" instead of a zero that looks like a measurement', () => {
    const cards = project([]);
    for (const card of cards) {
      expect(card.value).toBeNull();
      expect(card.computed).toBe(false);
      expect(card.comparison).toBeNull();
      expect(card.comparisonUnavailableReason).toBe('no-rows');
    }
    // The removed branch rendered '0.0%' for margin and '0' for the user count.
    expect(cards.find((kpi) => kpi.id === 'kpi-margin')!.value).not.toBe('0.0%');
  });

  it('marks an unmodelled KPI as stored instead of presenting it as a computed number', () => {
    const custom = [...template, { id: 'kpi-custom', title: 'Manual note', value: '42', changePct: 7.5, trend: 'up' as const, category: 'Custom' }];
    const projected = projectInsightKpis(records, custom, 'en-US').find((kpi) => kpi.id === 'kpi-custom')!;
    expect(projected.computed).toBe(false);
    expect(projected.value).toBe('42');
    expect(projected.comparison).toBeNull();
    expect(projected.comparisonUnavailableReason).toBe('kpi-not-modelled');
  });

  it('exposes the period field and the KPI/measure mapping as the one definition', () => {
    expect(INSIGHT_PERIOD_FIELD).toBe('quarter');
    expect(INSIGHT_KPI_MEASURE['kpi-rev']).toBe('revenue');
    expect(INSIGHT_KPI_MEASURE['kpi-users']).toBe('activeUsers');
    // The identifiers used by the seeded model must be covered by the mapping.
    for (const kpi of template) expect(INSIGHT_KPI_MEASURE[kpi.id]).toBeDefined();
  });

  it('names an undefined ratio instead of returning 0%', () => {
    const zeroRevenue = records.map((row) => ({ ...row, revenue: 0 }));
    const margin = card(zeroRevenue, 'kpi-margin');
    expect(margin.value).toBeNull();
    expect(margin.computed).toBe(false);
    expect(margin.comparisonUnavailableReason).toBe('margin-undefined');
  });
});
