// STATUS: DIAMANT VGT SUPREME — bounded editable Notes image block with local OCR geometry
import React, { useState } from 'react';
import { Copy, Crop, Eye, Highlighter, RotateCcw, RotateCw, ScanText, Settings2, Trash2 } from 'lucide-react';
import type { NoteCanvasBlock } from '../../../../shared/contracts/workspace';
import { performLocalImageOcr } from '../../../../platform/media/ocr/localTextDetection';
import { createNoteImageAnnotation, imageOcrFromResult, normalizeNoteImageCrop, rotateNoteImage, type NoteImageBlock } from '../../media/notesImageModel';

type ImagePatch = Partial<Extract<NoteCanvasBlock, { kind: 'image' }>>;
interface NotesImageBlockProps { block: NoteImageBlock; onChange: (patch: ImagePatch) => void; }
interface DrawPoint { x: number; y: number; }

export const NotesImageBlockView: React.FC<NotesImageBlockProps> = ({ block, onChange }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [annotationStart, setAnnotationStart] = useState<DrawPoint | null>(null);
  const crop = normalizeNoteImageCrop(block.crop);

  const setCropField = (field: 'x' | 'y' | 'width' | 'height', percent: number) => {
    onChange({ crop: normalizeNoteImageCrop({ ...crop, [field]: percent / 100 }) });
  };
  const runOcr = async () => {
    if (!block.src) return;
    setOcrBusy(true); setStatus('');
    try {
      const result = await performLocalImageOcr(block.src);
      onChange({ ocr: imageOcrFromResult(result) });
      setShowOcr(true);
      setStatus(result.fullText ? `${result.tokens.length} local text region(s) detected.` : 'Local OCR completed; no text detected.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Local OCR failed.');
    } finally { setOcrBusy(false); }
  };
  const copyOcr = async () => {
    if (!block.ocr?.fullText) return;
    try { await navigator.clipboard.writeText(block.ocr.fullText); setStatus('OCR text copied.'); }
    catch { setStatus('Clipboard access was denied.'); }
  };
  const relativePoint = (event: React.PointerEvent<HTMLDivElement>): DrawPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))) };
  };
  const annotationDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!annotating) return;
    event.preventDefault(); event.stopPropagation();
    setAnnotationStart(relativePoint(event));
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const annotationUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!annotating || !annotationStart) return;
    event.preventDefault(); event.stopPropagation();
    const end = relativePoint(event);
    const x = Math.min(annotationStart.x, end.x); const y = Math.min(annotationStart.y, end.y);
    const width = Math.abs(end.x - annotationStart.x); const height = Math.abs(end.y - annotationStart.y);
    if (width >= 0.01 && height >= 0.01) onChange({ annotations: [...(block.annotations ?? []), createNoteImageAnnotation(x, y, width, height)] });
    setAnnotationStart(null);
  };
  const projectBox = (box: { x: number; y: number; width: number; height: number }) => {
    if (!block.ocr) return null;
    const nx = box.x / block.ocr.sourceWidth; const ny = box.y / block.ocr.sourceHeight;
    const nw = box.width / block.ocr.sourceWidth; const nh = box.height / block.ocr.sourceHeight;
    const left = (nx - crop.x) / crop.width; const top = (ny - crop.y) / crop.height;
    const right = left + nw / crop.width; const bottom = top + nh / crop.height;
    if (right <= 0 || bottom <= 0 || left >= 1 || top >= 1) return null;
    return { left: `${Math.max(0, left) * 100}%`, top: `${Math.max(0, top) * 100}%`, width: `${Math.max(0.002, Math.min(1, right) - Math.max(0, left)) * 100}%`, height: `${Math.max(0.002, Math.min(1, bottom) - Math.max(0, top)) * 100}%` };
  };

  return <div className="relative w-full h-full bg-slate-950 overflow-hidden">
    <div onPointerDown={annotationDown} onPointerUp={annotationUp} className={`absolute inset-0 overflow-hidden ${annotating ? 'cursor-crosshair' : ''}`}>
      <div className="absolute inset-0" style={{ transform: `rotate(${block.rotation ?? 0}deg)`, transformOrigin: '50% 50%' }}>
        <img src={block.src} alt={block.altText || 'Note image'} draggable={false} className="absolute max-w-none max-h-none select-none pointer-events-none" style={{ left: `${-(crop.x / crop.width) * 100}%`, top: `${-(crop.y / crop.height) * 100}%`, width: `${100 / crop.width}%`, height: `${100 / crop.height}%` }} />
        {(block.annotations ?? []).map((annotation) => <div key={annotation.id} className="absolute border-2 pointer-events-none" style={{ left: `${((annotation.x - crop.x) / crop.width) * 100}%`, top: `${((annotation.y - crop.y) / crop.height) * 100}%`, width: `${(annotation.width / crop.width) * 100}%`, height: `${(annotation.height / crop.height) * 100}%`, borderColor: annotation.color, backgroundColor: `${annotation.color}18` }} />)}
        {showOcr && (block.ocr?.tokens ?? []).map((token, index) => { const projected = projectBox(token.box); return projected ? <div key={`${token.text}-${index}`} title={token.text} className="absolute border border-emerald-400/70 bg-emerald-400/10 pointer-events-none" style={projected} /> : null; })}
      </div>
    </div>
    <div className="absolute left-2 top-2 flex gap-1 z-10">
      <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="p-1 rounded bg-slate-950/90 border border-white/10 text-slate-300" aria-label="Image settings" title="Image settings"><Settings2 className="w-3 h-3" /></button>
      <button type="button" onClick={() => onChange(rotateNoteImage(block, 'left'))} className="p-1 rounded bg-slate-950/90 border border-white/10 text-slate-300" aria-label="Rotate left" title="Rotate left"><RotateCcw className="w-3 h-3" /></button>
      <button type="button" onClick={() => onChange(rotateNoteImage(block, 'right'))} className="p-1 rounded bg-slate-950/90 border border-white/10 text-slate-300" aria-label="Rotate right" title="Rotate right"><RotateCw className="w-3 h-3" /></button>
      <button type="button" onClick={() => setAnnotating((value) => !value)} className={`p-1 rounded border ${annotating ? 'bg-amber-500/20 border-amber-400/50 text-amber-200' : 'bg-slate-950/90 border-white/10 text-slate-300'}`} aria-label="Draw rectangle annotation" title="Draw rectangle annotation"><Highlighter className="w-3 h-3" /></button>
    </div>
    <div className="absolute right-2 top-2 flex gap-1 z-10">
      <button type="button" onClick={() => { void runOcr(); }} disabled={ocrBusy} className="px-1.5 py-1 rounded bg-slate-950/90 border border-white/10 text-[0.5625rem] text-emerald-200 disabled:opacity-40" title="Run local OCR"><ScanText className="w-3 h-3 inline mr-1" />{ocrBusy ? 'OCR…' : 'OCR'}</button>
      {block.ocr && <button type="button" onClick={() => setShowOcr((value) => !value)} className="p-1 rounded bg-slate-950/90 border border-white/10 text-slate-300" aria-label="Toggle OCR geometry" title="Toggle OCR geometry"><Eye className="w-3 h-3" /></button>}
      {block.ocr?.fullText && <button type="button" onClick={() => { void copyOcr(); }} className="p-1 rounded bg-slate-950/90 border border-white/10 text-slate-300" aria-label="Copy text from picture" title="Copy text from picture"><Copy className="w-3 h-3" /></button>}
    </div>
    {settingsOpen && <div className="absolute left-2 right-2 bottom-2 z-20 p-2 rounded-lg bg-slate-950/95 border border-white/10 grid grid-cols-2 gap-2 text-[0.5625rem] text-slate-400 shadow-xl">
      <label className="col-span-2">Alt text<input value={block.altText ?? ''} onChange={(event) => onChange({ altText: event.target.value.slice(0, 2048) })} className="mt-1 w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-200 outline-none" /></label>
      {(['x', 'y', 'width', 'height'] as const).map((field) => <label key={field} className="flex items-center gap-1"><Crop className="w-3 h-3" />{field}<input type="range" min="0" max="100" step="1" value={Math.round(crop[field] * 100)} onChange={(event) => setCropField(field, Number(event.target.value))} className="min-w-0 flex-1 accent-cyan-500" /></label>)}
      <button type="button" onClick={() => onChange({ crop: { x: 0, y: 0, width: 1, height: 1 } })} className="px-2 py-1 rounded border border-white/10 text-slate-300">Reset crop</button>
      <button type="button" disabled={!(block.annotations?.length)} onClick={() => onChange({ annotations: [] })} className="px-2 py-1 rounded border border-white/10 text-rose-300 disabled:opacity-30"><Trash2 className="w-3 h-3 inline mr-1" />Clear annotations</button>
      {status && <span className="col-span-2 text-slate-500">{status}</span>}
    </div>}
  </div>;
};
