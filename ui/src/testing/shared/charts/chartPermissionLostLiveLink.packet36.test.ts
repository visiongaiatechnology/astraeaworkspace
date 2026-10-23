// STATUS: DIAMANT VGT SUPREME
// Paket 36 — „Permission Lost Live Link".
//
// Akzeptanz: „Berechtigung entziehen, zuvor verfügbares Objekt wird fail-closed verborgen."
//
// Diese Datei erfindet **keine** Vokabel. Sie benutzt genau die vorhandenen Namen:
//   • `SOURCE_STATES`      — shared/charts/chartModel.ts:30  (`'current','stale','broken','permission-lost','frozen'`)
//   • `chartSourceWithholdsData` — shared/charts/chartModel.ts:44 (Auswahl aus `SOURCE_STATES`, keine zweite Liste)
//   • `resolveChartSourceState`  — shared/charts/chartEngine.ts:112, Verzweigung in :114
//   • `validateLiveChartSource`  — shared/charts/chartEngine.ts:128, `chart_source_permission_lost` in :132
//   • `chartSourceLock`          — shared/charts/chartEngine.ts:139 (ruft den Wächter, fängt seinen Wurf)
// Der Vorher-Zustand kommt aus dem vorhandenen Bindepfad (`bindChartWorkspaceSource`), nicht aus einem
// selbstgebauten Objekt — sonst würde der Test die Vokabel prüfen, die er selbst mitbringt.
//
// **VORHER gemessen (vor dieser Änderung, Positivkontrolle im Instrument):** `ChartRenderer.tsx:25` las
// `source_state` und benutzte ihn in `:31–33` **nur als Etikett**; `:29` zeichnete das Diagramm und `:36`
// las die Daten weiter. Ein Objekt mit entzogener Berechtigung wurde also als `PERMISSION-LOST`
// **beschriftet** und zeigte seine Werte samt Screenreader-Zusammenfassung weiter.
//
// **NACHHER (hier geprüft):** `ChartRenderer` befragt den Wächter **vor** jedem Datenpfad. Bei Rückhalt
// entsteht kein SVG, keine Tabelle und kein Zahlenwert — stattdessen eine sichtbare, benannte Aussage
// aus **Zustand + Grund + Handlung**.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChartObject } from '../../../shared/contracts/workspace';
import { bindChartWorkspaceSource, chartSourceLock, resolveChartSourceState, validateLiveChartSource } from '../../../shared/charts/chartEngine';
import { chartSourceWithholdsData, normalizeCanonicalChart } from '../../../shared/charts/chartModel';
import { ChartRenderer } from '../../../shared/charts/ChartRenderer';

const draft: ChartObject = {
  id: 'revenue-link',
  chart_type: 'line',
  title: 'Revenue Link',
  categories: ['Q1', 'Q2'],
  series: [{ name: 'Revenue', values: [12, 18], color: '#3b82f6' }],
};

/** Der gemessene Vorher-Zustand: ein verfügbares, lebendiges Objekt. */
const liveLink = bindChartWorkspaceSource(draft, {
  kind: 'range',
  documentId: 'revenue-grid',
  objectId: 'table-1',
  version: 7,
  sheetId: 'sheet-1',
  range: 'B2:C3',
});

const render = (chart: ChartObject): string => renderToStaticMarkup(createElement(ChartRenderer, { chart, interactive: true }));

describe('Paket 36 — Permission Lost Live Link', () => {
  it('der Vorher-Zustand ist wirklich verfügbar: live, current, ohne Einwand', () => {
    expect(liveLink.source?.live).toBe(true);
    expect(liveLink.source_state).toBe('current');
    expect(() => validateLiveChartSource(liveLink)).not.toThrow();
  });

  it('„Berechtigung entziehen": eine Ableitung ergibt `permission-lost` — am Objekt UND an der Quelle', () => {
    const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'current', reason: 'permission' });

    expect(revoked.source_state).toBe('permission-lost');
    expect(revoked.source?.state).toBe('permission-lost');
    // Der Link selbst bleibt lebendig — verloren ist die Berechtigung, nicht die Verknüpfung.
    expect(revoked.source?.live).toBe(true);
  });

  it('die Prüfung scheitert BENANNT mit `chart_source_permission_lost`, nicht still', () => {
    const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'current' });

    expect(() => validateLiveChartSource(revoked)).toThrow(/^chart_source_permission_lost$/u);
  });

  it('Gegenprobe: ohne `denied` bleibt genau derselbe Aufruf bei `current` — eine Ableitung, zwei Ausgänge', () => {
    for (const permission of ['allowed', 'unknown'] as const) {
      const kept = resolveChartSourceState(liveLink, { permission, state: 'current' });

      expect(kept.source_state, permission).toBe('current');
      expect(kept.source?.state, permission).toBe('current');
      expect(() => validateLiveChartSource(kept), permission).not.toThrow();
    }
  });

  it('`denied` gewinnt gegen jeden mitgegebenen Zustand — auch gegen `broken`', () => {
    const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'broken' });

    expect(revoked.source_state).toBe('permission-lost');
    expect(() => validateLiveChartSource(revoked)).toThrow(/^chart_source_permission_lost$/u);
  });

  it('die Auflösung übernimmt Versionen, ohne Zustände zu erfinden', () => {
    const resolved = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'stale', sourceVersion: 7, resolvedVersion: 9 });

    expect(resolved.source_state).toBe('stale');
    expect(resolved.source?.sourceVersion).toBe(7);
    expect(resolved.source?.resolvedVersion).toBe(9);
  });

  it('die Nutzdaten überleben den Berechtigungsentzug unverändert', () => {
    const payload = (chart: ChartObject): string => {
      const normalized = normalizeCanonicalChart(chart);
      return JSON.stringify({ title: normalized.title, categories: normalized.categories, series: normalized.series });
    };
    const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'current' });

    expect(payload(revoked)).toBe(payload(liveLink));
  });
});

describe('Paket 36 — der Sperrzustand ist erreichbar und benannt', () => {
  it('`chartSourceLock` befragt den Wächter und meldet den Rückhalt samt benanntem Code', () => {
    const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'current' });
    const lock = chartSourceLock(revoked);

    expect(lock.withheld).toBe(true);
    expect(lock.state).toBe('permission-lost');
    // Der Name kommt aus dem Wurf des Wächters, nicht aus einer zweiten Liste.
    expect(lock.code).toBe('chart_source_permission_lost');
  });

  it('Gegenprobe: ein verfügbares Objekt wird **nicht** zurückgehalten, der Wächter schweigt', () => {
    const lock = chartSourceLock(liveLink);

    expect(lock.withheld).toBe(false);
    expect(lock.state).toBe('current');
    expect(lock.code).toBeNull();
  });

  it('der Rückhalt ist genau die vorhandene Auswahl der Vokabel — `stale` und `frozen` halten nichts zurück', () => {
    expect(chartSourceWithholdsData('permission-lost')).toBe(true);
    expect(chartSourceWithholdsData('broken')).toBe(true);
    for (const state of ['current', 'stale', 'frozen'] as const) {
      expect(chartSourceWithholdsData(state), state).toBe(false);
    }
    expect(chartSourceWithholdsData(undefined)).toBe(false);
  });
});

describe('Paket 36 — fail-closed verborgen: der Render-Vertrag', () => {
  it('VERBIRGT: `permission-lost` gibt **kein** SVG, **keine** Tabelle und **keinen** Zahlenwert aus', () => {
    const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'current' });
    const markup = render(revoked);

    // 1. Der Rückhalt ist als Zustand am Markup erkennbar (nicht als Etikett über einem Diagramm).
    expect(markup).toContain('data-chart-source-lock="permission-lost"');
    // 2. **Kein** Bild des Diagramms — weder als Daten-URL noch als SVG.
    expect(markup).not.toContain('data:image/svg+xml');
    expect(markup).not.toContain('<svg');
    // 3. **Keine** Datentabelle und **keine** Screenreader-Zusammenfassung (die trug vorher „Revenue: Q1: 12; Q2: 18").
    expect(markup).not.toContain('<table');
    expect(markup).not.toContain('Revenue: Q1: 12; Q2: 18');
    // 4. Überhaupt **nichts** vom Diagramm und **kein** Zahlenwert.
    expect(markup).not.toContain('Revenue');
    expect(markup).not.toContain('Q1');
    expect(markup).not.toContain('18');
  });

  it('VERBIRGT: dasselbe gilt für `broken` — die Auswahl der Vokabel, nicht ein zweiter Sonderfall', () => {
    const deleted = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'broken', reason: 'missing' });
    const markup = render(deleted);

    expect(markup).toContain('data-chart-source-lock="broken"');
    expect(markup).not.toContain('data:image/svg+xml');
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('Revenue');
    expect(markup).not.toContain('Q1');
  });

  it('NENNT stattdessen Zustand, Grund und Handlung — nicht allein über Farbe', () => {
    const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'current' });
    const markup = render(revoked);

    // Zustand: in Worten, nicht nur als Farbe oder Klasse.
    expect(markup).toContain('Quelle gesperrt — Berechtigung entzogen');
    // Grund.
    expect(markup).toContain('Die Berechtigung für die verknüpfte Quelle wurde entzogen.');
    // Handlung.
    expect(markup).toContain('Handlung:');
    expect(markup).toContain('erneut freigeben oder das Diagramm von der Quelle trennen');
    // Und der **benannte** Code, damit der Zustand nachschlagbar bleibt.
    expect(markup).toContain('chart_source_permission_lost');
    // Nicht allein über Farbe: die Aussage steht als **Text** im Markup, und der Sperrzustand trägt
    // einen echten zugänglichen Namen — die `figure` verweist auf den Grund-Absatz, nicht auf eine Farbe.
    const labelledBy = markup.match(/<figure[^>]*aria-labelledby="([^"]+)"/u)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(markup).toContain(`<p id="${labelledBy}"`);
  });

  it('Gegenprobe: ein verfügbares Objekt wird weiterhin gezeichnet — Bild, Tabelle, Zahlen', () => {
    const markup = render(liveLink);

    expect(markup).toContain('data:image/svg+xml');
    expect(markup).toContain('Revenue: Q1: 12; Q2: 18');
    expect(markup).toContain('LIVE');
    expect(markup).not.toContain('data-chart-source-lock');
  });

  it('Gegenprobe: `stale` bleibt sichtbar — gestalteter Zustand, kein Datenentzug (UI-Standard §24)', () => {
    const resolved = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'stale' });
    const markup = render(resolved);

    expect(markup).not.toContain('data-chart-source-lock');
    expect(markup).toContain('data:image/svg+xml');
    expect(markup).toContain('STALE');
    // Der benannte Code des Wächters bleibt am Etikett nachschlagbar.
    expect(markup).toContain('title="chart_source_stale"');
  });
});
