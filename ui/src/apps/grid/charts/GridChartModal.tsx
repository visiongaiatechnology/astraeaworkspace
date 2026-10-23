// STATUS: DIAMANT VGT SUPREME
// Astraea Grid chart studio: bounded live sources, advanced series, templates and local export.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Plus, Save, X } from 'lucide-react';
import type {
  ChartAggregation,
  ChartAxisScale,
  ChartErrorBarType,
  ChartObject,
  ChartStylePreset,
  ChartTrendlineType,
  ChartType,
  GridCell,
  GridChartTemplate,
  GridSheetModel,
} from '../../../shared/contracts/workspace';
import {
  applyGridChartTemplate,
  buildGridChartFromPivot,
  buildGridChartFromRange,
  buildGridChartFromTable,
  createGridChartTemplate,
} from './gridChartEngine';
import {
  buildGridChartLayout,
  GRID_CHART_LEGEND_POSITIONS,
  GRID_CHART_SERIES_TYPES,
  GRID_CHART_STYLE_PRESETS,
  GRID_CHART_TYPES,
} from './gridChartLayout';
import { gridChartSvgDataUrl } from '../../../shared/charts/chartSvgRenderer';
import { chartSourceLock } from '../../../shared/charts/chartEngine';
import { lockNotice } from '../../../shared/charts/ChartRenderer';
import { downloadGridChartPdf, downloadGridChartPng, downloadGridChartSvg } from '../integrations/gridChartExport';
import { gridExportDeliveryText, gridExportFailureText } from '../interchange/gridExportStatus';

type SourceKind = 'range' | 'table' | 'pivot';

interface GridChartModalProps {
  isOpen: boolean;
  selectedRange: string;
  cells: Record<string, GridCell>;
  documentId: string;
  tableObjectId: string;
  sheet: GridSheetModel;
  templates: GridChartTemplate[];
  onUpdateTemplates: (templates: GridChartTemplate[]) => void;
  onClose: () => void;
  onCreateChart: (chart: ChartObject) => void;
}

export const GridChartModal: React.FC<GridChartModalProps> = ({
  isOpen, selectedRange, cells, documentId, tableObjectId, sheet, templates, onUpdateTemplates, onClose, onCreateChart,
}) => {
  const [sourceKind, setSourceKind] = useState<SourceKind>('range');
  const [sourceId, setSourceId] = useState('');
  const [rangeInput, setRangeInput] = useState(selectedRange);
  const [chartType, setChartType] = useState<ChartType>('column');
  const [chartTitle, setChartTitle] = useState('Data Analysis Chart');
  const [stylePreset, setStylePreset] = useState<ChartStylePreset>('astraea-dark');
  const [legend, setLegend] = useState<NonNullable<ChartObject['legend_position']>>('bottom');
  const [showLabels, setShowLabels] = useState(false);
  const [showGridlines, setShowGridlines] = useState(true);
  const [xAxisTitle, setXAxisTitle] = useState('');
  const [yAxisTitle, setYAxisTitle] = useState('');
  const [secondaryAxisTitle, setSecondaryAxisTitle] = useState('');
  const [seriesTypes, setSeriesTypes] = useState<Record<number, ChartType>>({});
  const [secondarySeries, setSecondarySeries] = useState<Record<number, boolean>>({});
  const [seriesOrder, setSeriesOrder] = useState<number[]>([]);
  const [seriesAggregation, setSeriesAggregation] = useState<Record<number, ChartAggregation>>({});
  const [xAxisScale, setXAxisScale] = useState<ChartAxisScale>('category');
  const [yAxisScale, setYAxisScale] = useState<ChartAxisScale>('linear');
  const [yMin, setYMin] = useState('');
  const [yMax, setYMax] = useState('');
  const [yMajorUnit, setYMajorUnit] = useState('');
  const [yNumberFormat, setYNumberFormat] = useState('');
  const [annotationText, setAnnotationText] = useState('');
  const [referenceLineValue, setReferenceLineValue] = useState('');
  const [firstPointColor, setFirstPointColor] = useState('#3b82f6');
  const [trendline, setTrendline] = useState<ChartTrendlineType | 'none'>('none');
  const [errorBar, setErrorBar] = useState<ChartErrorBarType | 'none'>('none');
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRangeInput(selectedRange);
    setError(null);
    setExportNotice(null);
  }, [isOpen, selectedRange]);

  const baseChart = useMemo(() => {
    try {
      if (sourceKind === 'table') {
        const table = sheet.tables?.find((item) => item.id === sourceId) ?? sheet.tables?.[0];
        if (!table) throw new Error('Auf diesem Blatt ist keine strukturierte Tabelle verfügbar.');
        return buildGridChartFromTable(cells, table, chartType, { documentId, tableObjectId, live:true, title:chartTitle });
      }
      if (sourceKind === 'pivot') {
        const pivot = sheet.pivots?.find((item) => item.id === sourceId) ?? sheet.pivots?.[0];
        if (!pivot) throw new Error('Auf diesem Blatt ist keine Pivot-Definition verfügbar.');
        return buildGridChartFromPivot(cells, pivot, sheet.id, chartType);
      }
      return buildGridChartFromRange(cells, rangeInput || selectedRange, chartType, { documentId, tableObjectId, sheetId:sheet.id, live:true, title:chartTitle });
    } catch (reason) {
      return reason instanceof Error ? reason : new Error('Diagrammquelle konnte nicht gelesen werden.');
    }
  }, [sourceKind, sourceId, sheet, cells, chartType, documentId, tableObjectId, chartTitle, rangeInput, selectedRange]);

  // Every layout decision goes through the non-throwing validator: a mistyped axis bound shows a
  // message instead of unmounting the Grid surface.
  const layout = useMemo(() => {
    if (baseChart instanceof Error) return { ok: false as const, error: baseChart.message };
    return buildGridChartLayout(baseChart, {
      title: chartTitle, chartType, stylePreset, legend, showDataLabels: showLabels, showGridlines,
      xAxisTitle, yAxisTitle, secondaryAxisTitle, xAxisScale, yAxisScale,
      yMin, yMax, yMajorUnit, yNumberFormat, annotationText, referenceLineValue, firstPointColor,
      trendline, errorBar, seriesOrder, seriesTypes, secondarySeries, seriesAggregation,
    });
  }, [baseChart, chartTitle, chartType, stylePreset, legend, showLabels, showGridlines, xAxisTitle, yAxisTitle, secondaryAxisTitle, seriesTypes, secondarySeries, seriesOrder, seriesAggregation, xAxisScale, yAxisScale, yMin, yMax, yMajorUnit, yNumberFormat, annotationText, referenceLineValue, firstPointColor, trendline, errorBar]);

  const chart = layout.ok ? layout.chart : null;
  const sourceError = layout.ok ? null : layout.error;
  // **`W-450`, Weg 2** ✗✓✓: der Sperrzustand kommt aus der **einen** Vokabel — dieselbe Befragung wie
  // im gesperrten `ChartRenderer.tsx:46`, dieselbe Formulierung (`lockNotice`). Ein zurückgehaltenes
  // Diagramm bekommt **keine** Vorschau und **keine** Zahlen, und der Nutzer sieht den **Grund**.
  // Zugleich Vorsorge gegen den Wurf, den die Wurzel (`chartSvgRenderer.ts`, Weg 4) jetzt erzeugt:
  // ohne diese Verzweigung risse er den Assistenten beim Rendern ab, statt eine Aussage zu zeigen.
  const lock = chart ? chartSourceLock(chart) : null;
  const lockMessage = lock ? lockNotice(lock.state) : null;

  // Export failures are surfaced; the previous `void downloadGridChartPng(...)` produced an
  // unhandled promise rejection with no user-visible feedback. Release Beta 0.1: the notice now
  // distinguishes a confirmed native write from a browser download.
  const runExport = useCallback(async (kind: 'svg' | 'png' | 'pdf') => {
    if (!chart) return;
    setExportBusy(true);
    setExportNotice(null);
    setError(null);
    try {
      const result = kind === 'svg'
        ? await downloadGridChartSvg(chart)
        : kind === 'png'
          ? await downloadGridChartPng(chart)
          : await downloadGridChartPdf(chart);
      const label = kind === 'svg' ? 'SVG-Vektorexport' : kind === 'png' ? 'PNG-Rasterexport' : 'PDF-Export';
      setExportNotice(`${label}: ${gridExportDeliveryText(result)}`);
    } catch (reason) {
      setError(gridExportFailureText(reason));
    } finally {
      setExportBusy(false);
    }
  }, [chart]);

  if (!isOpen) return null;
  const selectClass = 'w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-slate-100 outline-none focus:border-emerald-500';

  const handleInsert = () => {
    if (!chart) { setError(sourceError || 'Diagrammquelle ist ungültig.'); return; }
    onCreateChart(chart); onClose();
  };
  const saveTemplate = () => {
    if (!chart) return;
    try {
      const created = createGridChartTemplate(chart, templateName);
      onUpdateTemplates([...templates.filter((item) => item.name.toLowerCase() !== created.name.toLowerCase()), created].slice(-64));
      setTemplateName(''); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Diagrammvorlage konnte nicht gespeichert werden.'); }
  };
  const loadTemplate = (id:string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    if (!chart) { setError(sourceError || 'Diagrammquelle ist ungültig.'); return; }
    const applied = applyGridChartTemplate(chart, template);
    setChartType(applied.chart_type); setStylePreset(applied.style_preset || 'astraea-dark'); setLegend(applied.legend_position || 'bottom'); setShowGridlines(applied.show_gridlines !== false); setShowLabels(applied.show_data_labels === true);
  };

  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grid-chart-studio-title"
      className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden text-xs flex flex-col"
    >
      <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-400" aria-hidden="true"/><span id="grid-chart-studio-title" className="font-bold text-slate-100 text-sm">Astraea Chart Studio</span></div>
        <button type="button" onClick={onClose} aria-label="Diagramm-Assistent schließen" className="p-1 rounded hover:bg-white/10 text-slate-400"><X className="w-4 h-4" aria-hidden="true"/></button>
      </div>
      <div className="grid grid-cols-[390px_1fr] min-h-0 flex-1">
        <div className="p-4 space-y-3 overflow-auto border-r border-white/10">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-slate-400">Datenquelle</span><select value={sourceKind} onChange={(e)=>{setSourceKind(e.target.value as SourceKind);setSourceId('');}} className={selectClass}><option value="range">Bereich</option><option value="table">Strukturierte Tabelle</option><option value="pivot">Pivot</option></select></label>
            {sourceKind === 'range' ? <label className="space-y-1"><span className="text-slate-400">Bereich</span><input aria-label="Diagramm-Datenbereich" value={rangeInput} onChange={(e)=>setRangeInput(e.target.value)} className={`${selectClass} font-mono`}/></label> :
              <label className="space-y-1"><span className="text-slate-400">Objekt</span><select value={sourceId} onChange={(e)=>setSourceId(e.target.value)} className={selectClass}><option value="">Automatisch</option>{(sourceKind==='table'?sheet.tables:sheet.pivots)?.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          </div>
          <label className="space-y-1 block"><span className="text-slate-400">Titel</span><input aria-label="Diagrammtitel" value={chartTitle} onChange={(e)=>setChartTitle(e.target.value.slice(0,512))} className={selectClass}/></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-slate-400">Diagrammtyp</span><select aria-label="Diagrammtyp" value={chartType} onChange={(e)=>setChartType(e.target.value as ChartType)} className={selectClass}>{GRID_CHART_TYPES.map((type)=><option key={type} value={type}>{type}</option>)}</select></label>
            <label className="space-y-1"><span className="text-slate-400">Design</span><select value={stylePreset} onChange={(e)=>setStylePreset(e.target.value as ChartStylePreset)} className={selectClass}>{GRID_CHART_STYLE_PRESETS.map((item)=><option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="grid grid-cols-3 gap-2"><input aria-label="X-Achsentitel" value={xAxisTitle} onChange={(e)=>setXAxisTitle(e.target.value)} placeholder="X-Achse" className={selectClass}/><input aria-label="Y-Achsentitel" value={yAxisTitle} onChange={(e)=>setYAxisTitle(e.target.value)} placeholder="Y-Achse" className={selectClass}/><input aria-label="Zweite Y-Achsentitel" value={secondaryAxisTitle} onChange={(e)=>setSecondaryAxisTitle(e.target.value)} placeholder="2. Y-Achse" className={selectClass}/></div>
          <div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-slate-400">X-Achse skaliert</span><select value={xAxisScale} onChange={(e)=>setXAxisScale(e.target.value as ChartAxisScale)} className={selectClass}><option value="category">Kategorie</option><option value="linear">linear</option><option value="time">Zeit</option></select></label><label className="space-y-1"><span className="text-slate-400">Y-Achse skaliert</span><select value={yAxisScale} onChange={(e)=>setYAxisScale(e.target.value as ChartAxisScale)} className={selectClass}><option value="linear">linear</option><option value="log">log10</option></select></label></div>
          <div className="grid grid-cols-4 gap-2"><input aria-label="Y-Minimum" value={yMin} onChange={(e)=>setYMin(e.target.value)} inputMode="decimal" placeholder="Y min" className={selectClass}/><input aria-label="Y-Maximum" value={yMax} onChange={(e)=>setYMax(e.target.value)} inputMode="decimal" placeholder="Y max" className={selectClass}/><input aria-label="Hauptschrittweite" value={yMajorUnit} onChange={(e)=>setYMajorUnit(e.target.value)} inputMode="decimal" placeholder="Schritt" className={selectClass}/><input aria-label="Zahlenformat" value={yNumberFormat} onChange={(e)=>setYNumberFormat(e.target.value.slice(0,64))} placeholder="Zahlenformat" className={selectClass}/></div>
          <div className="grid grid-cols-2 gap-2"><input aria-label="Beschriftung" value={annotationText} onChange={(e)=>setAnnotationText(e.target.value.slice(0,512))} placeholder="Beschriftung" className={selectClass}/><input aria-label="Y-Referenzlinie" value={referenceLineValue} onChange={(e)=>setReferenceLineValue(e.target.value)} inputMode="decimal" placeholder="Y-Referenzlinie" className={selectClass}/></div>
          <label className="flex items-center gap-2"><span className="text-slate-400">Erster Datenpunkt</span><input type="color" value={firstPointColor} onChange={(e)=>setFirstPointColor(e.target.value)} aria-label="Farbe des ersten Datenpunkts"/></label>
          <div className="grid grid-cols-3 gap-2"><label className="space-y-1"><span className="text-slate-400">Legende</span><select value={legend} onChange={(e)=>setLegend(e.target.value as NonNullable<ChartObject['legend_position']>)} className={selectClass}>{GRID_CHART_LEGEND_POSITIONS.map((item)=><option key={item}>{item}</option>)}</select></label><label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={showGridlines} onChange={(e)=>setShowGridlines(e.target.checked)}/>Gitterlinien</label><label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={showLabels} onChange={(e)=>setShowLabels(e.target.checked)}/>Datenbeschriftung</label></div>
          <div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-slate-400">Trendlinie · 1. Reihe</span><select value={trendline} onChange={(e)=>setTrendline(e.target.value as ChartTrendlineType|'none')} className={selectClass}><option value="none">keine</option><option value="linear">linear</option><option value="exponential">exponentiell</option><option value="moving-average">gleitender Mittelwert</option></select></label><label className="space-y-1"><span className="text-slate-400">Fehlerbalken · 1. Reihe</span><select value={errorBar} onChange={(e)=>setErrorBar(e.target.value as ChartErrorBarType|'none')} className={selectClass}><option value="none">keine</option><option value="fixed">fest</option><option value="percentage">Prozent</option><option value="standard-deviation">Standardabweichung</option></select></label></div>
          {chart && chart.series.length > 0 && <div className="space-y-2"><div className="text-slate-300 font-semibold">Reihen-Editor</div>{chart.series.slice(0,16).map((series,index)=><div key={`${series.name}-${index}`} className="grid grid-cols-[1fr_70px_95px_90px_70px] gap-2 items-center bg-black/20 p-2 rounded"><span className="truncate text-slate-300">{series.name}</span><div className="flex gap-1"><button type="button" disabled={index===0} onClick={()=>setSeriesOrder((prev)=>{const count=chart.series.length;const order=prev.length?prev.slice():Array.from({length:count},(_,i)=>i);[order[index-1],order[index]]=[order[index]!,order[index-1]!];return order;})} className="px-1.5 rounded bg-slate-800 disabled:opacity-30" aria-label={`Reihe ${series.name} nach oben`}>↑</button><button type="button" disabled={index===chart.series.length-1} onClick={()=>setSeriesOrder((prev)=>{const count=chart.series.length;const order=prev.length?prev.slice():Array.from({length:count},(_,i)=>i);[order[index],order[index+1]]=[order[index+1]!,order[index]!];return order;})} className="px-1.5 rounded bg-slate-800 disabled:opacity-30" aria-label={`Reihe ${series.name} nach unten`}>↓</button></div><select aria-label={`Diagrammtyp für Reihe ${index+1}`} value={seriesTypes[index] || ''} onChange={(e)=>setSeriesTypes((prev)=>({...prev,[index]:e.target.value as ChartType}))} className={selectClass}><option value="">erben</option>{GRID_CHART_SERIES_TYPES.map((type)=><option key={type} value={type}>{type}</option>)}</select><select aria-label={`Aggregation für Reihe ${index+1}`} value={seriesAggregation[index] ?? 'none'} onChange={(e)=>setSeriesAggregation(prev=>({...prev,[index]:e.target.value as ChartAggregation}))} className={selectClass}><option value="none">roh</option><option value="sum">Summe</option><option value="average">Mittel</option><option value="min">Min</option><option value="max">Max</option><option value="count">Anzahl</option></select><label className="flex items-center gap-1"><input type="checkbox" checked={secondarySeries[index]||false} onChange={(e)=>setSecondarySeries((prev)=>({...prev,[index]:e.target.checked}))} aria-label={`Reihe ${index+1} auf zweiter Achse`}/>2. Achse</label></div>)}</div>}
          <div className="space-y-2 border-t border-white/10 pt-3"><select aria-label="Diagrammvorlage anwenden" defaultValue="" onChange={(e)=>{loadTemplate(e.target.value);e.currentTarget.value='';}} className={selectClass}><option value="">Diagrammvorlage anwenden…</option>{templates.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="flex gap-2"><input aria-label="Vorlagenname" value={templateName} onChange={(e)=>setTemplateName(e.target.value)} placeholder="Vorlagenname" className={selectClass}/><button type="button" onClick={saveTemplate} aria-label="Diagrammvorlage speichern" className="px-3 rounded bg-slate-700 hover:bg-slate-600"><Save className="w-3.5 h-3.5" aria-hidden="true"/></button></div></div>
          {(sourceError||error) && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 text-red-300 p-2 break-words">{error||sourceError}</div>}
          {exportNotice && <div role="status" className="rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 p-2">{exportNotice}</div>}
        </div>
        <div className="p-5 flex flex-col min-w-0">
          <div className="flex-1 bg-slate-950 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden">{lock?.withheld && lockMessage ? <div role="status" data-grid-chart-source-lock={lock.state} className="max-w-md p-4 text-slate-300"><p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-amber-200">{lockMessage.condition}</p><p className="mt-1.5 text-xs leading-snug">{lockMessage.ground}</p><p className="mt-1 text-[0.6875rem] leading-snug text-slate-400">Handlung: {lockMessage.action}</p><p className="mt-1 font-mono text-[0.625rem] text-slate-500">{lock.code ?? lock.state}</p></div> : chart ? <img src={gridChartSvgDataUrl(chart,900,520)} alt={chart.alt_summary || chart.title} className="max-w-full max-h-full object-contain"/> : <span className="text-slate-500">Keine gültige Diagrammvorschau</span>}</div>
          <div className="flex gap-2 pt-4"><button type="button" disabled={!chart||exportBusy||Boolean(lock?.withheld)} onClick={()=>void runExport('svg')} className="px-3 py-2 rounded bg-slate-800 disabled:opacity-40"><Download className="w-3 h-3 inline mr-1" aria-hidden="true"/>SVG</button><button type="button" disabled={!chart||exportBusy||Boolean(lock?.withheld)} onClick={()=>void runExport('png')} className="px-3 py-2 rounded bg-slate-800 disabled:opacity-40">PNG</button><button type="button" disabled={!chart||exportBusy||Boolean(lock?.withheld)} onClick={()=>void runExport('pdf')} className="px-3 py-2 rounded bg-slate-800 disabled:opacity-40">PDF</button><button type="button" disabled={!chart} onClick={handleInsert} className="ml-auto px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold"><Plus className="w-3.5 h-3.5 inline mr-1" aria-hidden="true"/>Live-Diagramm einfügen</button></div>
          <p className="pt-2 text-[0.625rem] text-slate-500">Live-Vorschau: jede Änderung an Bereich, Typ, Achsen, Legende, Beschriftung und Fehlerbalken wird sofort neu gerendert.</p>
        </div>
      </div>
    </div>
  </div>
  );
};
