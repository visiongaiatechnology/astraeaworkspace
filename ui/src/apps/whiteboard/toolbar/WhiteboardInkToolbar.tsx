// STATUS: DIAMANT VGT SUPREME
// Compact local-first ink controls for Astraea Whiteboard.

import React from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eraser, Highlighter, Lasso, PenTool, Redo2, Trash2, Undo2 } from 'lucide-react';
import type { WhiteboardInteractionTool } from '../types';

interface WhiteboardInkToolbarProps {
  activeTool: WhiteboardInteractionTool;
  setActiveTool: (tool: WhiteboardInteractionTool) => void;
  color: string;
  setColor: (color: string) => void;
  width: number;
  setWidth: (width: number) => void;
  straightLineAssist: boolean;
  setStraightLineAssist: (value: boolean) => void;
  shapeRecognition: boolean;
  setShapeRecognition: (value: boolean) => void;
  arrowStart: boolean;
  setArrowStart: (value: boolean) => void;
  arrowEnd: boolean;
  setArrowEnd: (value: boolean) => void;
  eraserMode: 'point' | 'object';
  setEraserMode: (mode: 'point' | 'object') => void;
  eraserRadius: number;
  setEraserRadius: (radius: number) => void;
  selectedInkCount: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  deleteSelection: () => void;
  moveSelection: (dx: number, dy: number) => void;
}

const COLORS = ['#ffffff', '#60a5fa', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];
const inkToolClass = (active: boolean) => `flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[0.6875rem] font-medium transition ${active ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100' : 'border-white/10 text-slate-300 hover:bg-white/[0.06]'}`;

export const WhiteboardInkToolbar: React.FC<WhiteboardInkToolbarProps> = ({
  activeTool, setActiveTool, color, setColor, width, setWidth,
  straightLineAssist, setStraightLineAssist, shapeRecognition, setShapeRecognition,
  arrowStart, setArrowStart, arrowEnd, setArrowEnd,
  eraserMode, setEraserMode, eraserRadius, setEraserRadius,
  selectedInkCount, canUndo, canRedo, undo, redo, deleteSelection, moveSelection,
}) => (
  <div className="whiteboard-toolbar__context whiteboard-toolbar__context--ink" data-vgt-whiteboard-context="ink" role="toolbar" aria-label="Whiteboard ink tools">
    <button type="button" onClick={() => setActiveTool('ink-pen')} className={inkToolClass(activeTool === 'ink-pen')} title="Pressure-aware pen"><PenTool className="h-3.5 w-3.5" />Pen</button>
    <button type="button" onClick={() => setActiveTool('ink-pencil')} className={inkToolClass(activeTool === 'ink-pencil')} title="Pencil preset"><PenTool className="h-3.5 w-3.5 opacity-70" />Pencil</button>
    <button type="button" onClick={() => setActiveTool('ink-highlighter')} className={inkToolClass(activeTool === 'ink-highlighter')} title="Translucent highlighter"><Highlighter className="h-3.5 w-3.5" />Highlight</button>
    <button type="button" onClick={() => setActiveTool('ink-eraser')} className={inkToolClass(activeTool === 'ink-eraser')} title="Ink eraser"><Eraser className="h-3.5 w-3.5" />Eraser</button>
    <button type="button" onClick={() => setActiveTool('ink-lasso')} className={inkToolClass(activeTool === 'ink-lasso')} title="Lasso ink strokes"><Lasso className="h-3.5 w-3.5" />Lasso</button>

    <div className="mx-0.5 h-5 w-px bg-white/10" />
    <div className="flex items-center gap-1" aria-label="Ink colors">
      {COLORS.map((candidate) => <button key={candidate} type="button" aria-label={`Ink color ${candidate}`} onClick={() => setColor(candidate)} className={`h-4 w-4 rounded-full border ${color === candidate ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-950' : 'border-white/20'}`} style={{ backgroundColor: candidate }} />)}
    </div>
    <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400">Width <input aria-label="Ink width" type="range" min={1} max={12} step={0.5} value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-20 accent-cyan-400" /><span className="w-7 font-mono text-slate-300">{width.toFixed(1)}</span></label>

    {activeTool === 'ink-eraser' ? <>
      <select aria-label="Eraser mode" value={eraserMode} onChange={(event) => setEraserMode(event.target.value as 'point' | 'object')} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.6875rem] text-slate-300 outline-none"><option value="point">Point</option><option value="object">Whole stroke</option></select>
      <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400">Radius <input aria-label="Eraser radius" type="range" min={4} max={80} value={eraserRadius} onChange={(event) => setEraserRadius(Number(event.target.value))} className="w-16 accent-rose-400" /></label>
    </> : <>
      <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400"><input type="checkbox" checked={straightLineAssist} onChange={(event) => setStraightLineAssist(event.target.checked)} />Line assist</label>
      <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400" title="Deterministic local recognition, no network"><input type="checkbox" checked={shapeRecognition} onChange={(event) => setShapeRecognition(event.target.checked)} />Local shapes</label>
      <button type="button" onClick={() => setArrowStart(!arrowStart)} className={inkToolClass(arrowStart)} title="Arrowhead at stroke start"><ArrowLeft className="h-3 w-3" />Start</button>
      <button type="button" onClick={() => setArrowEnd(!arrowEnd)} className={inkToolClass(arrowEnd)} title="Arrowhead at stroke end">End<ArrowRight className="h-3 w-3" /></button>
    </>}

    <div className="mx-0.5 h-5 w-px bg-white/10" />
    <button type="button" onClick={undo} disabled={!canUndo} className="rounded-lg border border-white/10 p-1 text-slate-300 disabled:opacity-25" aria-label="Undo ink stroke"><Undo2 className="h-3.5 w-3.5" /></button>
    <button type="button" onClick={redo} disabled={!canRedo} className="rounded-lg border border-white/10 p-1 text-slate-300 disabled:opacity-25" aria-label="Redo ink stroke"><Redo2 className="h-3.5 w-3.5" /></button>
    {selectedInkCount > 0 && <div className="flex items-center gap-1 rounded-lg border border-cyan-400/15 bg-cyan-500/[0.06] px-1.5 py-1 text-[0.6875rem] text-cyan-200"><span>{selectedInkCount} selected</span><button type="button" onClick={() => moveSelection(-10, 0)} aria-label="Move ink left"><ArrowLeft className="h-3 w-3" /></button><button type="button" onClick={() => moveSelection(10, 0)} aria-label="Move ink right"><ArrowRight className="h-3 w-3" /></button><button type="button" onClick={() => moveSelection(0, -10)} aria-label="Move ink up"><ArrowUp className="h-3 w-3" /></button><button type="button" onClick={() => moveSelection(0, 10)} aria-label="Move ink down"><ArrowDown className="h-3 w-3" /></button><button type="button" onClick={deleteSelection} aria-label="Delete selected ink"><Trash2 className="h-3 w-3 text-rose-300" /></button></div>}
  </div>
);
