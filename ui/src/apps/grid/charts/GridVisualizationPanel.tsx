import React, { useMemo, useState } from 'react';
import { BarChart3, Activity, RadioTower } from 'lucide-react';
import type { ChartObject, ReferenceMode, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { listGridChartPublishSlides, type GridChartPublishTarget } from '../integrations/gridChartPublish';

interface GridVisualizationPanelProps {
  selectedCell: string;
  selectedRange: string;
  charts: ChartObject[];
  publishTargets: GridChartPublishTarget[];
  /**
   * Publish targets with their documents, so the panel can offer the concrete destination slide of a
   * Present target ("Diagramm markieren, als Live-/Snapshot-Element auf gewählte Folie einfügen").
   */
  publishTargetDocuments?: Record<string, WorkspaceDocument>;
  onOpenChartStudio: () => void;
  onApplySparkline: (sourceRange: string, targetCell: string, type: 'line'|'column'|'win-loss', color: string) => void;
  /** `slideIndex` is only meaningful for a Present target and is ignored otherwise. */
  onPublishChart: (chartId: string, targetDocumentId: string, mode: ReferenceMode, slideIndex?: number) => void;
}

export const GridVisualizationPanel: React.FC<GridVisualizationPanelProps> = ({
  selectedCell, selectedRange, charts, publishTargets, publishTargetDocuments, onOpenChartStudio, onApplySparkline, onPublishChart,
}) => {
  const [sourceRange, setSourceRange] = useState(selectedRange);
  const [targetCell, setTargetCell] = useState(selectedCell);
  const [type, setType] = useState<'line'|'column'|'win-loss'>('line');
  const [color, setColor] = useState('#10b981');
  const [chartId, setChartId] = useState(charts[0]?.id ?? '');
  const [targetId, setTargetId] = useState(publishTargets[0]?.id ?? '');
  const [mode, setMode] = useState<ReferenceMode>('Live');
  const [slideIndex, setSlideIndex] = useState(0);

  const selectedChart = useMemo(() => charts.find((chart) => chart.id === chartId) ?? charts[0], [charts, chartId]);
  const selectedTarget = useMemo(() => publishTargets.find((target) => target.id === targetId) ?? publishTargets[0], [publishTargets, targetId]);
  // Present targets expose their slides; a Writer target has none and the selector stays hidden.
  const slides = useMemo(() => {
    const document = selectedTarget ? publishTargetDocuments?.[selectedTarget.id] : undefined;
    return document ? listGridChartPublishSlides(document) : [];
  }, [selectedTarget, publishTargetDocuments]);
  const effectiveSlide = slides.some((slide) => slide.index === slideIndex) ? slideIndex : 0;
  const input = 'vgt-input w-full';

  return <div className="space-y-4">
    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-slate-200"><BarChart3 className="h-4 w-4 text-cyan-300"/><h3 className="font-semibold">Charts</h3></div>
      <p className="text-[0.625rem] text-slate-500">Range, Structured Table and Pivot sources use the same bounded local chart engine.</p>
      <button type="button" onClick={onOpenChartStudio} className="vgt-button-primary w-full">Open Chart Studio</button>
    </section>

    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-slate-200"><Activity className="h-4 w-4 text-emerald-300"/><h3 className="font-semibold">Sparkline</h3></div>
      <div className="grid grid-cols-2 gap-2"><input className={`${input} font-mono`} value={sourceRange} onChange={(e)=>setSourceRange(e.target.value.toUpperCase())} placeholder="A1:F1"/><input className={`${input} font-mono`} value={targetCell} onChange={(e)=>setTargetCell(e.target.value.toUpperCase())} placeholder="G1"/></div>
      <div className="grid grid-cols-[1fr_52px] gap-2"><select className={input} value={type} onChange={(e)=>setType(e.target.value as typeof type)}><option value="line">Line</option><option value="column">Column</option><option value="win-loss">Win/Loss</option></select><input aria-label="Sparkline color" type="color" value={color} onChange={(e)=>setColor(e.target.value)} className="h-8 w-full rounded border border-white/10 bg-transparent"/></div>
      <button type="button" onClick={()=>onApplySparkline(sourceRange,targetCell,type,color)} className="vgt-button-secondary w-full">Create / replace sparkline</button>
      <p className="text-[0.625rem] text-slate-500">Source is capped at 2,048 cells and stored as a live local range reference.</p>
    </section>

    <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-slate-200"><RadioTower className="h-4 w-4 text-violet-300"/><h3 className="font-semibold">Live Publish</h3></div>
      {charts.length && publishTargets.length ? <>
        <select className={input} value={selectedChart?.id ?? ''} onChange={(e)=>setChartId(e.target.value)}>{charts.map((chart)=><option key={chart.id} value={chart.id}>{chart.title} · {chart.chart_type}</option>)}</select>
        <select className={input} value={selectedTarget?.id ?? ''} onChange={(e)=>{setTargetId(e.target.value);setSlideIndex(0);}}>{publishTargets.map((target)=><option key={target.id} value={target.id}>{target.title} · {target.kind}</option>)}</select>
        {slides.length > 0 && (
          <label className="block space-y-1">
            <span className="text-[0.625rem] text-slate-400">Zielfolie</span>
            <select aria-label="Zielfolie" className={input} value={effectiveSlide} onChange={(e)=>setSlideIndex(Number(e.target.value))}>
              {slides.map((slide)=><option key={slide.index} value={slide.index}>{slide.label}</option>)}
            </select>
          </label>
        )}
        <select className={input} value={mode} onChange={(e)=>setMode(e.target.value as ReferenceMode)}><option value="Live">Live</option><option value="Frozen">Frozen snapshot</option></select>
        <button type="button" onClick={()=>selectedChart&&selectedTarget&&onPublishChart(selectedChart.id,selectedTarget.id,mode,slides.length?effectiveSlide:undefined)} className="vgt-button-secondary w-full">Publish chart</button>
        {slides.length === 0 && selectedTarget?.kind === 'Present' && (
          <p className="text-[0.625rem] text-amber-300">Für dieses Present-Ziel sind keine Folien geladen; es wird Folie 1 verwendet.</p>
        )}
      </> : <p className="text-[0.625rem] text-slate-500">Create a chart and keep a Writer, Present or Spaces document in the Workspace to publish it.</p>}
    </section>
  </div>;
};
