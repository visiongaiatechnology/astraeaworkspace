// STATUS: DIAMANT VGT SUPREME
// **`W-450`** — der rohe Zeichner ist fail-closed: **vier** Wege am Rückhalt vorbei sind geschlossen.
//
// **VORHER gemessen (Baseline vor dieser Änderung: 42 Dateien / 319 Tests grün):**
// `shared/charts/chartSvgRenderer.ts` importierte `chartEngine` nur für `calculateChartErrorBars` und
// `calculateChartTrendline`; `assertChartSourceRenderable` kam in ganz `open-core/ui/src` nur in
// `shared/charts/chartEngine.ts` (Definition, `:345`) und `shared/charts/export/chartVectorPdf.ts:131`
// vor. Der rohe Zeichner befragte den Wächter **nie** — jeder direkte Aufruf schrieb die Zahlen also
// auch dann, wenn die Leinwand (`ChartRenderer.tsx:54`) das Diagramm gesperrt zeigte.
//
// Die vier Stellen, jede unten einzeln über den **vorhandenen** Weg belegt — die Zeilennummern sind die
// des Registers `W-450` **vor** dieser Änderung; benannt wird hier über den Aufruf, nicht über die Zeile:
//   Weg 1  `apps/insight/export/insightExportEngine.ts` `exportInsightChartSvg`  ← `InsightReportCanvas`-Schaltfläche
//   Weg 2  `apps/grid/charts/GridChartModal.tsx` Vorschau-`<img>`                ← über `gridChartSvgDataUrl`
//   Weg 3  `apps/grid/integrations/gridChartExport.ts` SVG- und PNG-Ausfuhr
//   Weg 4  `shared/charts/chartSvgRenderer.ts` `buildGridChartSvg`               ← die Wurzel
//
// **Eine Vokabel, ein Prüfweg:** geprüft wird ausschließlich über `chartSourceLock` /
// `assertChartSourceRenderable` (`shared/charts/chartEngine.ts`), deren Entscheidung aus
// `chartSourceWithholdsData` (`chartModel.ts:51`) über `SOURCE_STATES` (`chartModel.ts:30`) kommt.
// Hier wird **keine** zweite Zustandsliste, **keine** zweite Prüfung und **kein** zweiter Code gebaut.
//
// Absichtlich kein `.mjs`: diese Datei liest keine Dateien aus dem Projekt.
import { describe, expect, it } from 'vitest';
import type { ChartObject, GridCell } from '../../../shared/contracts/workspace';
import { bindChartWorkspaceSource, chartSourceLock, resolveChartSourceState } from '../../../shared/charts/chartEngine';
import { buildGridChartSvg, gridChartSvgDataUrl } from '../../../shared/charts/chartSvgRenderer';
import { buildGridChartFromRange } from '../../../apps/grid/charts/gridChartEngine';
import { assertGridChartExportable, downloadGridChartPng, downloadGridChartSvg } from '../../../apps/grid/integrations/gridChartExport';
import { InsightError } from '../../../apps/insight/core/insightCore';
import { exportInsightChartSvg } from '../../../apps/insight/export/insightExportEngine';
import { buildInsightChartObject, chartSourceStateFor } from '../../../apps/insight/integrations/insightChartBridge';
import { DEFAULT_INSIGHT_MODEL } from '../../../apps/insight/domain/types';
import { createInsightVisual } from '../../../apps/insight/visuals/insightVisualEngine';

/** Der Zeuge, der im erzeugten SVG nur stehen kann, wenn die Nutzdaten wirklich geschrieben wurden. */
const GRID_WITNESS = 'W450LEAK';
/** Der Zeuge des Insight-Wegs: die aggregierte Kennzahl, die `insightExportBounds.test.ts:52` bindet. */
const INSIGHT_WITNESS = '535000';

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/**
 * Was kommt aus einem Weg **heraus**? Entweder der **benannte** Wurf — oder die Zeichenkette mit den
 * Daten. Der Rückgabewert nennt den Zeugen **wörtlich**, damit ein neutralisierter Wächter die Leckage
 * im Klartext zeigt (`DATA:W450LEAK:…`) statt nur „hat nicht geworfen".
 */
function outcomeOf(produce: () => string, witness: string): string {
  try {
    const text = produce();
    return `${text.includes(witness) ? `DATA:${witness}` : 'NO-DATA'}:${text.length}`;
  } catch (error) {
    return `REFUSED:${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Dasselbe für einen Weg, der **nichts** zurückgibt (die Ausfuhr-Vorprüfung). */
function refusalOf(run: () => void): string {
  try {
    run();
    return 'NO-REFUSAL';
  } catch (error) {
    return `REFUSED:${error instanceof Error ? error.message : String(error)}`;
  }
}

const gridDraft: ChartObject = {
  id: 'w450-grid',
  chart_type: 'column',
  title: 'W-450 Grid',
  categories: [GRID_WITNESS, 'Second'],
  series: [{ name: 'Orders', values: [4711, 1337], color: '#10b981' }],
  show_data_labels: true,
};

const gridLink = bindChartWorkspaceSource(gridDraft, {
  kind: 'range',
  documentId: 'grid-doc',
  objectId: 'table-1',
  sheetId: 'sheet-1',
  range: 'B2:C3',
  version: 3,
});
const gridRevoked = resolveChartSourceState(gridLink, { permission: 'denied', state: 'current' });
const gridBroken = resolveChartSourceState(gridLink, { permission: 'allowed', state: 'broken', reason: 'missing' });
const gridStale = resolveChartSourceState(gridLink, { permission: 'allowed', state: 'stale' });
const gridFrozen = bindChartWorkspaceSource(gridDraft, {
  kind: 'range',
  documentId: 'grid-doc',
  objectId: 'table-1',
  sheetId: 'sheet-1',
  range: 'B2:C3',
}, false);

const insightVisual = {
  ...createInsightVisual('column', 'q-main', 'W-450 Revenue', { x: 0, y: 0, width: 560, height: 320 }),
  encoding: { category: 'region', values: ['revenue'], aggregation: 'SUM' as const },
};
const insightModel = structuredClone(DEFAULT_INSIGHT_MODEL);
const insightRecords = structuredClone(DEFAULT_INSIGHT_MODEL.records);
/** `cache.sourceState:'empty'` → `chartSourceStateFor` → `broken` (`insightChartBridge.ts:60`) → Rückhalt. */
const withheldContext = { documentId: 'insight-w450', cacheState: 'empty' as const, revision: 1 };
const exportableContext = { documentId: 'insight-w450', cacheState: 'stale' as const, revision: 1 };

describe('W-450 · Weg 4 (Wurzel) — `buildGridChartSvg` befragt den Wächter', () => {
  it('VERWEIGERT BENANNT: für eine zurückgehaltene Quelle entsteht kein SVG', () => {
    expect(outcomeOf(() => buildGridChartSvg(gridRevoked, 900, 520), GRID_WITNESS)).toBe('REFUSED:chart_source_permission_lost');
    expect(outcomeOf(() => buildGridChartSvg(gridBroken, 900, 520), GRID_WITNESS)).toBe('REFUSED:chart_source_broken');
  });

  it('POSITIVKONTROLLE im selben Instrument: `current` und `stale` zeichnen weiter — mit den Daten', () => {
    // Ohne diesen Satz wäre „verweigert" auch dann grün, wenn der Zeichner gar nichts mehr zeichnet.
    expect(outcomeOf(() => buildGridChartSvg(gridLink, 900, 520), GRID_WITNESS)).toMatch(/^DATA:W450LEAK:\d+$/u);
    expect(outcomeOf(() => buildGridChartSvg(gridStale, 900, 520), GRID_WITNESS)).toMatch(/^DATA:W450LEAK:\d+$/u);
  });
});

describe('W-450 · Weg 2 — die Vorschau (`GridChartModal.tsx:208`) baut keine Datenquelle mehr', () => {
  it('VERWEIGERT BENANNT: `gridChartSvgDataUrl` gibt für eine zurückgehaltene Quelle nichts aus', () => {
    expect(outcomeOf(() => gridChartSvgDataUrl(gridRevoked, 900, 520), GRID_WITNESS)).toBe('REFUSED:chart_source_permission_lost');
    expect(outcomeOf(() => gridChartSvgDataUrl(gridBroken, 900, 520), GRID_WITNESS)).toBe('REFUSED:chart_source_broken');
  });

  it('POSITIVKONTROLLE im selben Instrument: eine verfügbare Quelle liefert weiter eine Daten-URL', () => {
    expect(outcomeOf(() => gridChartSvgDataUrl(gridLink, 900, 520), GRID_WITNESS)).toMatch(/^DATA:W450LEAK:\d+$/u);
  });
});

describe('W-450 · Weg 3 — die SVG/PNG-Ausfuhr (`gridChartExport.ts:33/50/55`)', () => {
  it('VERWEIGERT BENANNT an `:33`: das vorhandene Preflight `assertGridChartExportable`', () => {
    expect(refusalOf(() => assertGridChartExportable(gridRevoked))).toBe('REFUSED:chart_source_permission_lost');
    expect(refusalOf(() => assertGridChartExportable(gridBroken))).toBe('REFUSED:chart_source_broken');
  });

  it('VERWEIGERT BENANNT an `:50`: `downloadGridChartSvg` schreibt keine Datei', () => {
    expect(refusalOf(() => downloadGridChartSvg(gridRevoked))).toBe('REFUSED:chart_source_permission_lost');
  });

  it('VERWEIGERT BENANNT an `:55`: `downloadGridChartPng` rastert nicht und fällt nicht still zurück', async () => {
    await expect(downloadGridChartPng(gridRevoked)).rejects.toThrow(/^chart_source_permission_lost$/u);
    await expect(downloadGridChartPng(gridBroken)).rejects.toThrow(/^chart_source_broken$/u);
  });

  it('die benannten Hüllen-Codes bleiben unverändert und liegen **vor** dem Rückhalt', () => {
    // Der Wächter steht bewusst hinter den Hüllen-Prüfungen: ein `undefined` heißt weiter so, wie es hieß.
    expect(refusalOf(() => assertGridChartExportable(undefined as unknown as ChartObject))).toBe('REFUSED:chart_export_invalid');
    expect(refusalOf(() => assertGridChartExportable({ chart_type: 'column' } as unknown as ChartObject))).toBe('REFUSED:chart_export_has_no_series');
    expect(refusalOf(() => assertGridChartExportable(gridStale))).toBe('NO-REFUSAL');
  });
});

describe('W-450 · Weg 1 — der Insight-Export (`insightExportEngine.ts:56`)', () => {
  it('VERWEIGERT BENANNT: die Export-Schaltfläche schreibt die Zahlen einer gesperrten Quelle nicht', () => {
    expect(outcomeOf(() => decode(exportInsightChartSvg(insightVisual, insightRecords, withheldContext, insightModel)), INSIGHT_WITNESS))
      .toBe('REFUSED:chart_source_broken');
  });

  it('der Grund erreicht den Aufrufer als `InsightError.code` — nicht als „SVG nicht verfügbar"', () => {
    // `InsightReportCanvas.tsx:90` zeigt `caught.code`; genau dieser Code muss der des Wächters sein.
    try {
      exportInsightChartSvg(insightVisual, insightRecords, withheldContext, insightModel);
      throw new Error('expected refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(InsightError);
      expect((error as InsightError).code).toBe('chart_source_broken');
    }
  });

  it('POSITIVKONTROLLE im selben Instrument: dieselbe Ansicht mit `stale` exportiert weiter', () => {
    expect(outcomeOf(() => decode(exportInsightChartSvg(insightVisual, insightRecords, exportableContext, insightModel)), INSIGHT_WITNESS))
      .toMatch(/^DATA:535000:\d+$/u);
  });
});

describe('W-450 · Erreichbarkeit — Befunde, gemessen statt angenommen', () => {
  it('BEFUND: Weg 1 ist **ohne** präpariertes Dokument erreichbar — `empty` wird zu `broken`', () => {
    // Der produktive Erzeuger des Zustands steht in `insightDatasetAuthoring.ts:44`
    // (`createEmptyInsightModel` schreibt `cache.sourceState:'empty'`), der Aufrufer in
    // `views/InsightView.tsx:111`. Die Abbildung `empty → broken` ist bereits gebunden
    // (`insightChartBridgeCore.test.ts:53`) — hier wird nur nachgemessen, dass daraus ein Rückhalt wird.
    expect(chartSourceStateFor('empty')).toBe('broken');
    const chart = buildInsightChartObject(insightVisual, insightRecords, withheldContext, insightModel);
    expect(chart.source_state).toBe('broken');
    expect(chartSourceLock(chart).withheld).toBe(true);
    // Und derselbe Zustand, den die Leinwand sperrt, wird vom Export benannt abgewiesen.
    expect(outcomeOf(() => decode(exportInsightChartSvg(insightVisual, insightRecords, withheldContext, insightModel)), INSIGHT_WITNESS))
      .toBe('REFUSED:chart_source_broken');
  });

  it('BEFUND: die Grid-Wege 2/3 tragen in diesem Build **keinen** Rückhalt — die Grenze ist Vorsorge', () => {
    // `gridChartEngine.ts:132` (range), `:146` (table) und `:175` (pivot) schreiben ausschließlich
    // `current`/`frozen`; der Assistent reicht nur `live:true` hinein (`GridChartModal.tsx:97/104`).
    // Kein Eingabeweg des Assistenten erzeugt also `broken`/`permission-lost`. Die Grenze an Weg 2/3
    // greift, sobald ein Grid-Diagramm einen dieser Zustände trägt — genau der App-Aufrufer von
    // `resolveChartSourceState`, den `chartSourceGuardReachability.packet36.contract.test.mjs:109` als
    // OFFEN meldet. Sie ist trotzdem nötig: ohne sie risse der Wurf der Wurzel (Weg 4) den Assistenten
    // beim Rendern ab, statt eine Aussage zu zeigen.
    const cells: Record<string, GridCell> = {
      A1: { value: 'Monat' }, B1: { value: 'Umsatz' },
      A2: { value: 'Jan' }, B2: { value: 1200 },
      A3: { value: 'Feb' }, B3: { value: 1500 },
    };
    const live = buildGridChartFromRange(cells, 'A1:B3', 'column', { sheetId: 's1', documentId: 'doc-1', tableObjectId: 'table-1', live: true });
    const frozen = buildGridChartFromRange(cells, 'A1:B3', 'column', { sheetId: 's1', documentId: 'doc-1', tableObjectId: 'table-1', live: false });
    expect(live.source_state).toBe('current');
    expect(frozen.source_state).toBe('frozen');
    expect(chartSourceLock(live).withheld).toBe(false);
    expect(chartSourceLock(frozen).withheld).toBe(false);
    // Gegenprobe an derselben Vokabel: `frozen` ist ausdrücklich **kein** Rückhalt (Auftrag, Punkt 3).
    expect(outcomeOf(() => buildGridChartSvg(gridFrozen, 900, 520), GRID_WITNESS)).toMatch(/^DATA:W450LEAK:\d+$/u);
  });
});
