// STATUS: DIAMANT VGT SUPREME — local-first editable Ink, Handwriting & Vector Drawing Studio

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Circle,
  Eraser,
  Highlighter,
  Lasso,
  Minus,
  PenTool,
  Plus,
  Redo2,
  Shield,
  Sigma,
  Square,
  TextSearch,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react';
import type { NoteInkDocument, NoteInkPoint, NoteInkStroke, NoteInkTool } from '../../../../shared/contracts/workspace';
import {
  appendNoteInkPoint,
  convertInkStrokeToShape,
  createEmptyNoteInkDocument,
  createNoteInkStroke,
  deleteInkStrokes,
  eraseInkNear,
  lassoSelectInkStrokeIds,
  normalizeNoteInkDocument,
  pointFromPointerSample,
  recognizeNoteInkTextLocally,
  recognizeSimpleMathInk,
  renderNoteInkSvg,
  shouldAcceptInkPointer,
  translateInkStrokes,
} from './notesInkEngine';
import { NOTE_INK_MAX_ZOOM, NOTE_INK_MIN_ZOOM, formatInkViewBox, resolveInkViewBox, stepInkZoom } from './notesInkZoom';
import { useNotesDialogA11y } from '../../editor/useNotesDialogA11y';

export interface NotesInkInsertPayload {
  svg: string;
  ink: NoteInkDocument;
  recognizedText: string;
}

interface NotesInkCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertDrawing: (payload: NotesInkInsertPayload) => void;
  initialDocument?: NoteInkDocument;
}

type StudioTool = NoteInkTool | 'eraser' | 'lasso';
const HISTORY_LIMIT = 64;
const COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#ffffff'];

function appendStroke(document: NoteInkDocument, stroke: NoteInkStroke): NoteInkDocument {
  return normalizeNoteInkDocument({ ...document, recognition: undefined, strokes: [...document.strokes, stroke] });
}

export const NotesInkCanvasModal: React.FC<NotesInkCanvasModalProps> = ({
  isOpen,
  onClose,
  onInsertDrawing,
  initialDocument,
}) => {
  const [tool, setTool] = useState<StudioTool>('pen');
  const [color, setColor] = useState('#60a5fa');
  const [width, setWidth] = useState(3);
  const [document, setDocument] = useState<NoteInkDocument>(() => normalizeNoteInkDocument(initialDocument));
  const [currentStroke, setCurrentStroke] = useState<NoteInkStroke | null>(null);
  const [lassoPoints, setLassoPoints] = useState<NoteInkPoint[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<NoteInkDocument[]>([]);
  const [future, setFuture] = useState<NoteInkDocument[]>([]);
  const [rejectTouch, setRejectTouch] = useState(true);
  const [recognitionLanguage, setRecognitionLanguage] = useState('en');
  const [recognizing, setRecognizing] = useState(false);
  /**
   * AST-0691: zoom is a pure `viewBox` transform over the unchanged stroke data, so a zoomed drawing stays
   * lossless — the strokes are never resampled.
   */
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState('Local vector ink. No network required.');
  const svgRef = useRef<SVGSVGElement>(null);
  const activePointerId = useRef<number | null>(null);
  const lastPenTimestamp = useRef(0);
  const gestureStart = useRef<NoteInkDocument | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDocument(normalizeNoteInkDocument(initialDocument));
    setCurrentStroke(null);
    setLassoPoints([]);
    setSelectedIds([]);
    setHistory([]);
    setFuture([]);
    setStatus('Local vector ink. No network required.');
  }, [isOpen, initialDocument]);

  const dialogA11y = useNotesDialogA11y(isOpen, onClose);

  if (!isOpen) return null;

  const selected = new Set(selectedIds);
  const previewDocument = currentStroke ? appendStroke(document, currentStroke) : document;
  const previewSvg = renderNoteInkSvg(previewDocument, selected);
  const previewSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}`;

  const remember = (before: NoteInkDocument) => {
    setHistory((items) => [...items, before].slice(-HISTORY_LIMIT));
    setFuture([]);
  };
  const commit = (next: NoteInkDocument, before = document) => {
    remember(before);
    setDocument(normalizeNoteInkDocument(next));
  };
  const sampleFromEvent = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const scaleX = rect?.width ? document.width / rect.width : 1;
    const scaleY = rect?.height ? document.height / rect.height : 1;
    return {
      x: Math.max(0, Math.min(document.width, (event.clientX - (rect?.left ?? 0)) * scaleX)),
      y: Math.max(0, Math.min(document.height, (event.clientY - (rect?.top ?? 0)) * scaleY)),
      t: event.timeStamp,
      pressure: event.pressure,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      pointerType: event.pointerType,
    };
  };

  const pointerAllowed = (event: React.PointerEvent<SVGSVGElement>) => {
    const now = Date.now();
    const accepted = shouldAcceptInkPointer({
      rejectTouch,
      lastPenTimestamp: lastPenTimestamp.current,
      now,
      contactWidth: event.width,
      contactHeight: event.height,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
    });
    if (accepted && event.pointerType === 'pen') lastPenTimestamp.current = now;
    return accepted;
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerAllowed(event)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    const sample = sampleFromEvent(event);
    const point = pointFromPointerSample(sample);
    if (tool === 'lasso') {
      setLassoPoints([point]);
      return;
    }
    gestureStart.current = document;
    if (tool === 'eraser') {
      setDocument((state) => eraseInkNear(state, point, Math.max(14, width * 4)));
      return;
    }
    setCurrentStroke(createNoteInkStroke(tool, sample, color, width));
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activePointerId.current !== event.pointerId || !pointerAllowed(event)) return;
    const sample = sampleFromEvent(event);
    const point = pointFromPointerSample(sample);
    if (tool === 'lasso') {
      setLassoPoints((points) => [...points, point].slice(-2048));
      return;
    }
    if (tool === 'eraser') {
      setDocument((state) => eraseInkNear(state, point, Math.max(14, width * 4)));
      return;
    }
    setCurrentStroke((stroke) => stroke ? appendNoteInkPoint(stroke, sample) : null);
  };

  const handlePointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    activePointerId.current = null;
    if (tool === 'lasso') {
      setSelectedIds(lassoSelectInkStrokeIds(document, lassoPoints));
      setLassoPoints([]);
      return;
    }
    if (currentStroke?.points.length) {
      const before = gestureStart.current ?? document;
      commit(appendStroke(document, currentStroke), before);
    } else if (tool === 'eraser' && gestureStart.current && gestureStart.current !== document) {
      remember(gestureStart.current);
    }
    gestureStart.current = null;
    setCurrentStroke(null);
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [document, ...items].slice(0, HISTORY_LIMIT));
    setDocument(previous);
    setSelectedIds([]);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items, document].slice(-HISTORY_LIMIT));
    setDocument(next);
    setSelectedIds([]);
  };
  const moveSelection = (dx: number, dy: number) => {
    if (!selected.size) return;
    commit(translateInkStrokes(document, selected, dx, dy));
  };
  const deleteSelection = () => {
    if (!selected.size) return;
    commit(deleteInkStrokes(document, selected));
    setSelectedIds([]);
  };
  const applyShapeAssist = () => {
    const ids = selected.size ? [...selected] : document.strokes.slice(-1).map((stroke) => stroke.id);
    if (!ids.length) return;
    let next = document;
    for (const id of ids) next = convertInkStrokeToShape(next, id);
    commit(next);
    setStatus('Shape assist applied locally to the selected/freehand stroke.');
  };
  const recognizeMath = () => {
    const source = selected.size ? document.strokes.filter((stroke) => selected.has(stroke.id)) : document.strokes;
    const result = recognizeSimpleMathInk(source);
    setStatus(result ? `Local math recognition: ${result.text} (${Math.round(result.confidence * 100)}%) · LaTeX ${result.latex}` : 'No supported simple math symbol recognized locally.');
  };
  const recognizeText = async () => {
    setRecognizing(true);
    try {
      const next = await recognizeNoteInkTextLocally(document, recognitionLanguage);
      commit(next);
      setStatus(`Local handwriting recognition: ${next.recognition?.text ?? ''}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Local handwriting recognition failed.');
    } finally {
      setRecognizing(false);
    }
  };
  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    // Ctrl/Cmd + '+'/'-' zoom the vector surface without touching the drawing data.
    if (event.ctrlKey || event.metaKey) {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((current) => stepInkZoom(current, 1)); return; }
      if (event.key === '-') { event.preventDefault(); setZoom((current) => stepInkZoom(current, -1)); return; }
      if (event.key === '0') { event.preventDefault(); setZoom(1); return; }
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected.size) {
      event.preventDefault();
      deleteSelection();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null;
    if (delta && selected.size) {
      event.preventDefault();
      moveSelection(delta[0], delta[1]);
    }
  };
  const handleExport = () => {
    if (!document.strokes.length) return;
    const ink = normalizeNoteInkDocument(document);
    onInsertDrawing({ svg: renderNoteInkSvg(ink), ink, recognizedText: ink.recognition?.text ?? '' });
    onClose();
  };

  const toolButton = (value: StudioTool, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setTool(value)} className={`p-1.5 rounded-lg border ${tool === value ? 'bg-cyan-600 border-cyan-500 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5'}`} title={label} aria-label={label}>{icon}</button>
  );

  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none" role="dialog" aria-modal="true" aria-label="Ink and handwriting studio">
    <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col text-xs">
      <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2"><PenTool className="w-4 h-4 text-cyan-400" /><span className="font-bold text-slate-100 text-sm">Ink & Handwriting Studio</span><span className="text-[0.5625rem] text-emerald-400 flex items-center gap-1"><Shield className="w-3 h-3" />local-first</span></div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white" aria-label="Close ink studio"><X className="w-4 h-4" /></button>
      </div>

      <div className="px-4 py-2 bg-slate-950/60 border-b border-white/10 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {toolButton('pen', 'Pen', <PenTool className="w-3.5 h-3.5" />)}
          {toolButton('highlighter', 'Highlighter', <Highlighter className="w-3.5 h-3.5" />)}
          {toolButton('eraser', 'Eraser', <Eraser className="w-3.5 h-3.5" />)}
          {toolButton('lasso', 'Lasso select', <Lasso className="w-3.5 h-3.5" />)}
          <div className="w-px h-5 bg-white/10 mx-1" />
          {toolButton('line', 'Straight line', <Minus className="w-3.5 h-3.5" />)}
          {toolButton('rect', 'Rectangle', <Square className="w-3.5 h-3.5" />)}
          {toolButton('ellipse', 'Ellipse', <Circle className="w-3.5 h-3.5" />)}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">{COLORS.map((entry) => <button key={entry} type="button" onClick={() => setColor(entry)} aria-label={`Ink color ${entry}`} className={`w-4 h-4 rounded-full border ${color === entry ? 'ring-2 ring-cyan-400 scale-110' : 'border-white/20'}`} style={{ backgroundColor: entry }} />)}</div>
          <input aria-label="Stroke width" type="range" min="1" max="12" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-16 accent-cyan-500" />
          <label className="flex items-center gap-1 text-[0.625rem] text-slate-400"><input type="checkbox" checked={rejectTouch} onChange={(event) => setRejectTouch(event.target.checked)} />Palm rejection</label>
          <div className="flex items-center gap-1" role="group" aria-label="Ink zoom">
            <button type="button" onClick={() => setZoom((current) => stepInkZoom(current, -1))} disabled={zoom <= NOTE_INK_MIN_ZOOM} className="p-1 rounded border border-white/10 text-slate-400 disabled:opacity-30" aria-label="Zoom out ink canvas"><Minus className="w-3 h-3" /></button>
            <button type="button" onClick={() => setZoom(1)} className="min-w-10 rounded border border-white/10 px-1 py-0.5 text-[0.625rem] font-mono text-slate-300" aria-label={`Ink zoom ${Math.round(zoom * 100)} percent, reset to 100 percent`}>{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((current) => stepInkZoom(current, 1))} disabled={zoom >= NOTE_INK_MAX_ZOOM} className="p-1 rounded border border-white/10 text-slate-400 disabled:opacity-30" aria-label="Zoom in ink canvas"><Plus className="w-3 h-3" /></button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} disabled={!history.length} className="p-1.5 rounded border border-white/10 text-slate-400 disabled:opacity-30" aria-label="Undo" title="Undo"><Undo2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={redo} disabled={!future.length} className="p-1.5 rounded border border-white/10 text-slate-400 disabled:opacity-30" aria-label="Redo" title="Redo"><Redo2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => { if (document.strokes.length) commit(createEmptyNoteInkDocument(document.width, document.height)); setSelectedIds([]); }} disabled={!document.strokes.length} className="p-1.5 rounded border border-white/10 text-slate-400 hover:text-rose-400 disabled:opacity-30" aria-label="Clear canvas" title="Clear canvas"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/10 bg-slate-900/80 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={applyShapeAssist} disabled={!document.strokes.length} className="px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-300 hover:text-cyan-300 disabled:opacity-30 flex items-center gap-1"><WandSparkles className="w-3 h-3" />Ink to shape</button>
        <button type="button" onClick={recognizeMath} disabled={!document.strokes.length} className="px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-300 hover:text-violet-300 disabled:opacity-30 flex items-center gap-1"><Sigma className="w-3 h-3" />Math ink</button>
        <input aria-label="Handwriting recognition language" value={recognitionLanguage} onChange={(event) => setRecognitionLanguage(event.target.value.slice(0, 32))} className="w-20 bg-slate-950 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-300" placeholder="en" />
        <button type="button" onClick={() => { void recognizeText(); }} disabled={!document.strokes.length || recognizing} className="px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-300 hover:text-emerald-300 disabled:opacity-30 flex items-center gap-1"><TextSearch className="w-3 h-3" />{recognizing ? 'Recognizing…' : 'Ink to text'}</button>
        {selected.size > 0 && <><span className="ml-1 text-[0.625rem] text-cyan-300">{selected.size} selected</span><button type="button" onClick={() => moveSelection(-10, 0)} className="p-1 border border-white/10 rounded" aria-label="Move left" title="Move left"><ArrowLeft className="w-3 h-3" /></button><button type="button" onClick={() => moveSelection(10, 0)} className="p-1 border border-white/10 rounded" aria-label="Move right" title="Move right"><ArrowRight className="w-3 h-3" /></button><button type="button" onClick={() => moveSelection(0, -10)} className="p-1 border border-white/10 rounded" aria-label="Move up" title="Move up"><ArrowUp className="w-3 h-3" /></button><button type="button" onClick={() => moveSelection(0, 10)} className="p-1 border border-white/10 rounded" aria-label="Move down" title="Move down"><ArrowDown className="w-3 h-3" /></button><button type="button" onClick={deleteSelection} className="p-1 border border-white/10 rounded text-rose-300" aria-label="Delete selection" title="Delete selection"><Trash2 className="w-3 h-3" /></button></>}
      </div>

      <div className="p-3 flex justify-center bg-[#07090e]">
        <svg ref={svgRef} viewBox={formatInkViewBox(resolveInkViewBox(document, zoom))} width="640" height="360" tabIndex={0} aria-label="Editable ink canvas" className="bg-slate-950 border border-white/10 rounded-lg cursor-crosshair shadow-inner outline-none focus:ring-2 focus:ring-cyan-500/50 touch-none" onKeyDown={handleKeyDown} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd}>
          <image href={previewSrc} x="0" y="0" width={document.width} height={document.height} pointerEvents="none" />
          {lassoPoints.length > 1 && <polyline points={lassoPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(34,211,238,.08)" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="5 4" pointerEvents="none" />}
        </svg>
      </div>

      <div className="px-4 py-2 bg-slate-950/70 border-t border-white/10 text-[0.625rem] text-slate-400 flex items-center justify-between gap-3">
        <span className="truncate">{status}</span><span className="shrink-0">{document.strokes.length} strokes · pressure/tilt persisted</span>
      </div>
      {document.recognition?.text && <div className="px-4 py-2 bg-emerald-950/20 border-t border-emerald-500/10 text-[0.625rem] text-emerald-200"><strong>Recognized locally:</strong> {document.recognition.text}</div>}

      <div className="px-4 py-3 bg-slate-950 border-t border-white/10 flex items-center justify-between">
        <span className="text-slate-500 text-[0.625rem]">Pointer events · bounded vector model · editable after persistence</span>
        <div className="flex items-center gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5">Cancel</button><button type="button" onClick={handleExport} disabled={!document.strokes.length} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-500 flex items-center gap-1.5 disabled:opacity-40"><Check className="w-3.5 h-3.5" />Save Ink</button></div>
      </div>
    </div>
  </div>;
};
