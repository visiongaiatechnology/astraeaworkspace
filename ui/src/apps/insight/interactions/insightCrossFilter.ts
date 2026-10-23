// STATUS: PLATIN — deterministic visual cross-filter and KPI projection.
//
// MEASURED FACTS this module encodes (BATCH-INSIGHT-1, proof in testing/insightKpiHonesty.test.ts):
//  - `projectInsightKpis` used to recompute the KPI value from the records but copy `changePct` and
//    `trend` from the stored template. The card showed a period comparison that no operation ever
//    produced; after a cross-filter the value changed while the percentage stayed frozen.
//  - An empty record scope rendered '0.0%' / '0' as if those were measurements.
// Therefore: a value exists only when the records produce it, and a comparison exists only when two
// periods are really present in the visible scope.
import type { InsightKpiMeasure, InsightRecord, KpiMetric } from '../domain/types';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

export type { InsightKpiMeasure };

/** The dimension columns a view-level cross-filter may use. Widened in BATCH-INSIGHT-6 so a visual's own
 * category column can drive the filter; the region segment bar still uses 'region'. */
export type InsightCrossFilterField = 'region' | 'product' | 'quarter';
export interface InsightCrossFilter { field: InsightCrossFilterField; value: string; }
export interface InsightRegionSegment { region: string; revenue: number; share: number; }

export function filterInsightRecords(records: readonly InsightRecord[], filter: InsightCrossFilter | null): InsightRecord[] {
  if (!filter) return records.map((row) => ({ ...row }));
  return records.filter((row) => row[filter.field] === filter.value).map((row) => ({ ...row }));
}
export function insightRegionSegments(records: readonly InsightRecord[]): InsightRegionSegment[] {
  const totals = new Map<string, number>();
  for (const row of records) totals.set(row.region, (totals.get(row.region) ?? 0) + Math.max(0, Number(row.revenue) || 0));
  const grand = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([region, revenue]) => ({ region, revenue, share: grand > 0 ? revenue / grand : 0 }));
}

export function formatInsightUsd(value: number, locale: WorkspaceLocale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
function percent(value: number, digits = 1): string { return `${value.toFixed(digits)}%`; }

/** The dimension the KPI comparison is built from. One definition, shared by view and tests. */
export const INSIGHT_PERIOD_FIELD = 'quarter' as const;

/** Which measure each seeded KPI card projects. Legacy fallback: newer cards carry `measure` themselves. */
export const INSIGHT_KPI_MEASURE: Readonly<Record<string, InsightKpiMeasure>> = {
  'kpi-rev': 'revenue',
  'kpi-margin': 'margin',
  'kpi-users': 'activeUsers',
  'kpi-anomaly': 'anomaly',
};
/**
 * The ONE resolution of "which measure does this card show": the card's own declared measure first,
 * the seeded id map second. A card without either is reported as not modelled instead of showing a
 * stored constant as a measurement.
 */
export function resolveInsightKpiMeasure(kpi: Pick<KpiMetric, 'id' | 'measure'>): InsightKpiMeasure | undefined {
  return kpi.measure ?? INSIGHT_KPI_MEASURE[kpi.id];
}

export interface InsightPeriodSplit { currentLabel: string; previousLabel: string; current: InsightRecord[]; previous: InsightRecord[]; }

/**
 * Split the visible records into the last two distinct periods of `field` (ascending order).
 * Returns null when the scope holds fewer than two periods — then no comparison exists.
 */
export function splitInsightPeriods(records: readonly InsightRecord[], field: keyof InsightRecord = INSIGHT_PERIOD_FIELD): InsightPeriodSplit | null {
  const labels = [...new Set(records.map((row) => String(row[field] ?? '')))].sort();
  if (labels.length < 2) return null;
  const previousLabel = labels[labels.length - 2];
  const currentLabel = labels[labels.length - 1];
  const inPeriod = (label: string) => records.filter((row) => String(row[field] ?? '') === label);
  return { currentLabel, previousLabel, current: inPeriod(currentLabel), previous: inPeriod(previousLabel) };
}

export interface InsightKpiComparison {
  readonly currentLabel: string;
  readonly previousLabel: string;
  /** Signed change in `kind` units, rounded to one decimal. */
  readonly change: number;
  readonly kind: 'relative' | 'percentage-points';
  readonly direction: 'up' | 'down' | 'flat';
}

export interface InsightKpiCardValue {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  /** null = no value exists for this scope. Never silently rendered as 0. */
  readonly value: string | null;
  /** true when `value` was computed from the records; false when a stored template value is shown. */
  readonly computed: boolean;
  readonly comparison: InsightKpiComparison | null;
  /** Named reason, used as visible text whenever `comparison` is null. */
  readonly comparisonUnavailableReason: string;
}

const RATIO_MEASURES: ReadonlySet<InsightKpiMeasure> = new Set(['margin', 'anomaly']);

/**
 * The ONE formatting of a derived KPI change, in its own unit: percent for a relative change,
 * points for a ratio change. The card and the exported report both call this, so the document can
 * never state a different growth than the surface.
 */
export function formatInsightKpiChange(comparison: InsightKpiComparison, pointsUnit: string): string {
  const sign = comparison.change > 0 ? '+' : comparison.change < 0 ? '-' : '';
  const unit = comparison.kind === 'relative' ? '%' : ` ${pointsUnit}`;
  return `${sign}${Math.abs(comparison.change).toFixed(1)}${unit}`;
}

function sumOf(rows: readonly InsightRecord[], pick: (row: InsightRecord) => number): number {
  return rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
}

/** null = the measure is undefined for this scope (no revenue to form a ratio). */
function measureValue(rows: readonly InsightRecord[], measure: InsightKpiMeasure): number | null {
  if (measure === 'anomaly') return rows.length ? sumOf(rows, (row) => row.anomalyScore) / rows.length * 100 : null;
  const revenue = sumOf(rows, (row) => row.revenue);
  if (measure === 'revenue') return revenue;
  if (measure === 'activeUsers') return sumOf(rows, (row) => row.activeUsers);
  const cost = sumOf(rows, (row) => row.cost);
  return revenue > 0 ? (revenue - cost) / revenue * 100 : null;
}

function formatMeasure(value: number, measure: InsightKpiMeasure, locale: WorkspaceLocale): string {
  if (measure === 'revenue') return formatInsightUsd(value, locale);
  if (measure === 'activeUsers') return Math.round(value).toLocaleString(locale);
  return measure === 'margin' ? percent(value, 1) : percent(value, 3);
}

function deriveComparison(split: InsightPeriodSplit | null, measure: InsightKpiMeasure): InsightKpiComparison | null {
  if (!split) return null;
  const current = measureValue(split.current, measure);
  const previous = measureValue(split.previous, measure);
  if (current === null || previous === null) return null;
  const kind: InsightKpiComparison['kind'] = RATIO_MEASURES.has(measure) ? 'percentage-points' : 'relative';
  if (kind === 'relative' && previous === 0) return null;
  const change = Number((kind === 'relative' ? (current - previous) / Math.abs(previous) * 100 : current - previous).toFixed(1));
  return {
    currentLabel: split.currentLabel,
    previousLabel: split.previousLabel,
    change,
    kind,
    direction: change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat',
  };
}

/**
 * Project the visible KPI cards. The value comes from `records`; a card whose id is not modelled
 * shows its stored value explicitly marked as stored, and a card without data shows no number.
 */
export function projectInsightKpis(
  records: readonly InsightRecord[],
  template: readonly KpiMetric[],
  locale: WorkspaceLocale = 'en-US',
  periodField: keyof InsightRecord = INSIGHT_PERIOD_FIELD,
): InsightKpiCardValue[] {
  const split = splitInsightPeriods(records, periodField);
  return template.map((kpi) => {
    const base = { id: kpi.id, title: kpi.title, category: kpi.category };
    const measure = resolveInsightKpiMeasure(kpi);
    if (!measure) {
      return { ...base, value: String(kpi.value), computed: false, comparison: null, comparisonUnavailableReason: 'kpi-not-modelled' };
    }
    const value = records.length ? measureValue(records, measure) : null;
    if (value === null) {
      return { ...base, value: null, computed: false, comparison: null, comparisonUnavailableReason: records.length ? 'margin-undefined' : 'no-rows' };
    }
    const comparison = deriveComparison(split, measure);
    return {
      ...base,
      value: formatMeasure(value, measure, locale),
      computed: true,
      comparison,
      comparisonUnavailableReason: comparison ? '' : split ? 'no-prior-value' : 'no-prior-period',
    };
  });
}
