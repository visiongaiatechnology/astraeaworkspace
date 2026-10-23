// STATUS: DIAMANT VGT SUPREME
// Paket 36 — die Durchsetzung **außerhalb** des Renderers: Ausführen und Vektor-Export.
//
// Akzeptanz: „Berechtigung entziehen, zuvor verfügbares Objekt wird fail-closed verborgen." Das Verbergen
// endet nicht am Bildschirm: wer ein zurückgehaltenes Diagramm **ausführt**, würde sonst genau die Werte
// in eine Datei schreiben, die das Fenster nicht mehr zeigt.
//
// Benutzte, vorhandene Vokabel (nichts daneben):
//   • `validateLiveChartSource`      — shared/charts/chartEngine.ts:128 (`chart_source_permission_lost` :132, `chart_source_broken` :131)
//   • `chartSourceLock`              — shared/charts/chartEngine.ts:139 (fängt den Wurf, verliert den Namen nicht)
//   • `assertChartSourceRenderable`  — shared/charts/chartEngine.ts:160 (die Durchsetzung für Rendern und Ausführen)
//   • `chartSourceWithholdsData`     — shared/charts/chartModel.ts:44 (die Auswahl aus `SOURCE_STATES`)
//
// Warum `buildVectorChartPdf` **wirft** und nicht `null` gibt: `null` heißt in diesem Adapter „nimm den
// Rasterweg", und `apps/grid/integrations/gridChartExport.ts:90` nimmt ihn genau so — ein `null` würde die
// Zahlen also über den Rasterweg doch ausgeben.
import { describe, expect, it } from 'vitest';
import type { ChartObject } from '../../../shared/contracts/workspace';
import { assertChartSourceRenderable, bindChartWorkspaceSource, chartSourceLock, chooseChartExport, resolveChartSourceState } from '../../../shared/charts/chartEngine';
import { buildVectorChartPdf } from '../../../shared/charts/export/chartVectorPdf';
import { buildGridChartSvg } from '../../../shared/charts/chartSvgRenderer';

const draft: ChartObject = {
  id: 'orders-link',
  chart_type: 'column',
  title: 'Orders per Region',
  categories: ['North', 'South'],
  series: [{ name: 'Orders', values: [4, 9], color: '#10b981' }],
};

const liveLink = bindChartWorkspaceSource(draft, {
  kind: 'range',
  documentId: 'orders-grid',
  objectId: 'table-1',
  version: 3,
  sheetId: 'sheet-1',
  range: 'B2:C3',
});

const revoked = resolveChartSourceState(liveLink, { permission: 'denied', state: 'current' });
const deleted = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'broken', reason: 'missing' });
const stale = resolveChartSourceState(liveLink, { permission: 'allowed', state: 'stale' });

describe('Paket 36 — Ausführen einer zurückgehaltenen Quelle', () => {
  it('VERWEIGERT BENANNT: `chooseChartExport` wirft `chart_source_permission_lost`, nicht still', () => {
    expect(() => assertChartSourceRenderable(revoked)).toThrow(/^chart_source_permission_lost$/u);
    expect(() => chooseChartExport(revoked, 'pdf')).toThrow(/^chart_source_permission_lost$/u);
    expect(() => chooseChartExport(revoked, 'svg')).toThrow(/^chart_source_permission_lost$/u);
  });

  it('VERWEIGERT BENANNT: dasselbe für `broken` — eine Auswahl, zwei benannte Ausgänge', () => {
    expect(() => assertChartSourceRenderable(deleted)).toThrow(/^chart_source_broken$/u);
    expect(() => chooseChartExport(deleted, 'pdf')).toThrow(/^chart_source_broken$/u);
  });

  it('`buildVectorChartPdf` gibt für eine zurückgehaltene Quelle **nichts** aus — und nicht `null`', () => {
    // `null` wäre der stille Rasterweg und damit genau die Leckage, die hier verhindert werden soll.
    expect(() => buildVectorChartPdf(revoked)).toThrow(/^chart_source_permission_lost$/u);
    expect(() => buildVectorChartPdf(deleted)).toThrow(/^chart_source_broken$/u);
  });

  it('Gegenprobe: `stale` bleibt ausführbar — gestalteter Zustand, kein Datenentzug (UI-Standard §24)', () => {
    expect(() => assertChartSourceRenderable(stale)).not.toThrow();
    expect(() => chooseChartExport(stale, 'pdf')).not.toThrow();
    expect(() => buildVectorChartPdf(stale)).not.toThrow();
  });

  it('Gegenprobe: das verfügbare Objekt bleibt ausführbar — sonst wäre die Verweigerung wertlos', () => {
    expect(() => assertChartSourceRenderable(liveLink)).not.toThrow();
    expect(chartSourceLock(liveLink).withheld).toBe(false);
    expect(() => chooseChartExport(liveLink, 'svg')).not.toThrow();
  });
});

describe('Paket 36 — die Grenze der Durchsetzung ist offengelegt, nicht verschwiegen', () => {
  it('AUSGELIEFERT: `buildGridChartSvg` hält selbst zurück — die rohe SVG-Zeichenfläche ist geschlossen', () => {
    // **Die Grenze hat sich verschoben, und dieser Befund ist genau dafür rot geworden** (Auftrag
    // `W-450`: die vier Wege am Rückhalt vorbei schließen). Der Befund von Paket 36 lautete wörtlich:
    // „`buildGridChartSvg` hält **nichts** zurück — die rohe SVG-Zeichenfläche bleibt offen"; gemessen
    // wurde er über `expect(...).not.toThrow()`. Die vier Aufrufer, die damals fremden Zonen gehörten
    // (`apps/grid/charts/GridChartModal.tsx:208`, `apps/grid/integrations/gridChartExport.ts:33/50/55`,
    // `apps/insight/export/insightExportEngine.ts:56`), sind jetzt fail-closed — deshalb wird hier die
    // **neue** Messung festgehalten, nicht die alte Zusage.
    expect(() => buildGridChartSvg(revoked, 1280, 720)).toThrow(/^chart_source_permission_lost$/u);
    expect(() => buildGridChartSvg(deleted, 1280, 720)).toThrow(/^chart_source_broken$/u);
    // Die Gegenprobe bleibt an derselben Stelle stehen: `stale` ist ein gestalteter Zustand, kein
    // Datenentzug — der rohe Zeichner bleibt für ihn offen.
    expect(() => buildGridChartSvg(stale, 1280, 720)).not.toThrow();
  });
});
