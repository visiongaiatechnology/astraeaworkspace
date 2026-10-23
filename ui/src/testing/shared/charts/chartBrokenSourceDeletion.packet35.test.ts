// STATUS: DIAMANT VGT SUPREME
// Paket 35 — „Broken Link und Quellenlöschung".
//
// Akzeptanz: „Quelle löschen, Ziel zeigt broken ohne Datenkorruption."
//
// Benutzte, vorhandene Vokabel (nichts daneben):
//   • `broken` als Zustand — shared/charts/chartModel.ts:30 (`SOURCE_STATES`)
//   • `resolveChartSourceState` — shared/charts/chartEngine.ts:112
//   • `chart_source_broken`     — shared/charts/chartEngine.ts:131
// Die Zusicherung „ohne Datenkorruption" wird als **Vergleich der Nutzdaten vor/nach** geführt, nicht als
// Behauptung: derselbe Serialisierer über beide Zustände.
import { describe, expect, it } from 'vitest';
import type { ChartObject } from '../../../shared/contracts/workspace';
import { bindChartWorkspaceSource, resolveChartSourceState, validateLiveChartSource } from '../../../shared/charts/chartEngine';
import { normalizeCanonicalChart } from '../../../shared/charts/chartModel';

const draft: ChartObject = {
  id: 'orders-link',
  chart_type: 'column',
  title: 'Orders per Region',
  categories: ['North', 'South', 'West'],
  series: [
    { name: 'Orders', values: [4, 9, 6], color: '#10b981' },
    { name: 'Returns', values: [1, 2, 0], color: '#ef4444' },
  ],
  y_axis_title: 'Count',
};

const liveLink = bindChartWorkspaceSource(draft, {
  kind: 'table',
  documentId: 'orders-grid',
  objectId: 'table-9',
  version: 3,
  sheetId: 'sheet-1',
  tableId: 'orders',
});

/** Die Nutzdaten — bewusst **ohne** `source`/`source_state`: genau die Felder, die eine Löschung nicht verändern darf. */
function payloadOf(chart: ChartObject): string {
  const normalized = normalizeCanonicalChart(chart);
  return JSON.stringify({
    id: normalized.id,
    chart_type: normalized.chart_type,
    title: normalized.title,
    categories: normalized.categories,
    series: normalized.series,
    x_axis: normalized.x_axis,
    y_axis: normalized.y_axis,
    y_axis_title: normalized.y_axis_title,
    annotations: normalized.annotations,
    reference_lines: normalized.reference_lines,
  });
}

describe('Paket 35 — Broken Link und Quellenlöschung', () => {
  it('„Quelle löschen": das Ziel zeigt `broken` — am Objekt UND an der Quelle', () => {
    const deleted = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'broken', reason: 'missing' });

    expect(deleted.source_state).toBe('broken');
    expect(deleted.source?.state).toBe('broken');
    // Nicht stillschweigend eingefroren: der Link bleibt als lebendig markiert und damit sichtbar defekt.
    expect(deleted.source?.live).toBe(true);
  });

  it('die Prüfung scheitert BENANNT mit `chart_source_broken`, nicht still', () => {
    const deleted = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'broken' });

    expect(() => validateLiveChartSource(deleted)).toThrow(/^chart_source_broken$/u);
  });

  it('Gegenprobe: `broken` wird nicht behauptet, wo die Quelle noch steht', () => {
    const intact = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'current' });

    expect(intact.source_state).toBe('current');
    expect(() => validateLiveChartSource(intact)).not.toThrow();
  });

  it('„ohne Datenkorruption": die Nutzdaten sind vor und nach dem Löschen identisch', () => {
    const before = payloadOf(liveLink);
    const deleted = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'broken', reason: 'missing' });

    expect(payloadOf(deleted)).toBe(before);
    // Und die Gegenprobe zur Gegenprobe: der Vergleich ist empfindlich genug, eine Änderung zu bemerken.
    const corrupted: ChartObject = { ...deleted, series: deleted.series.map((series) => ({ ...series, values: series.values.map(() => 0) })) };
    expect(payloadOf(corrupted)).not.toBe(before);
  });

  it('das Löschen ist wiederholbar: zweimal `broken` ergibt denselben Zustand', () => {
    const once = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'broken', reason: 'missing' });
    const twice = resolveChartSourceState(once, { permission: 'allowed', state: 'broken', reason: 'missing' });

    expect(twice.source_state).toBe('broken');
    expect(payloadOf(twice)).toBe(payloadOf(once));
  });
});
