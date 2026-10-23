// STATUS: DIAMANT VGT SUPREME
// Review annotation authoring surface. Renderer-neutral drafts only.

import React, { useRef, useState } from 'react';
import { Paperclip, PenLine, Plus, Trash2 } from 'lucide-react';
import type { PdfAnnotationPoint, PdfAnnotationType } from '../../../shared/contracts/workspace';
import {
  createPdfAnnotationAttachment,
  type PdfReviewAnnotationDraft,
} from './pdfReviewAnnotations';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PDF_ANNOTATION_COPY } from './pdfAnnotationsLocale';

interface PdfReviewComposerProps {
  currentPage: number;
  totalPages: number;
  onCreate: (draft: PdfReviewAnnotationDraft) => void;
}

const REVIEW_TYPES: Array<Exclude<PdfAnnotationType, 'highlight' | 'underline' | 'strike'>> = [
  'comment', 'text-insert', 'text-replace', 'ink', 'shape', 'text-box', 'callout', 'stamp', 'file-attachment', 'measurement',
];

const DEFAULT_BOUNDS = { x: 0.12, y: 0.14, width: 0.34, height: 0.12 };

function pointerPoint(event: React.PointerEvent<SVGSVGElement>, svg: SVGSVGElement): PdfAnnotationPoint {
  const rect = svg.getBoundingClientRect();
  const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    pressure: typeof event.pressure === 'number' && event.pressure > 0 ? Math.min(1, event.pressure) : 0.5,
  };
}

export const PdfReviewComposer: React.FC<PdfReviewComposerProps> = ({ currentPage, totalPages, onCreate }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PDF_ANNOTATION_COPY[locale].composer;
  const [type, setType] = useState<PdfAnnotationType>('comment');
  const [page, setPage] = useState(currentPage);
  const [author, setAuthor] = useState('Local Reviewer');
  const [text, setText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [replacementText, setReplacementText] = useState('');
  const [color, setColor] = useState('#38bdf8');
  const [shapeKind, setShapeKind] = useState<'rectangle' | 'ellipse' | 'line' | 'arrow'>('rectangle');
  const [stampLabel, setStampLabel] = useState('REVIEWED');
  const [measurementValue, setMeasurementValue] = useState('1');
  const [measurementUnit, setMeasurementUnit] = useState<'mm' | 'cm' | 'm' | 'in' | 'ft' | 'pt'>('cm');
  const [scaleLabel, setScaleLabel] = useState('');
  const [attachment, setAttachment] = useState<PdfReviewAnnotationDraft['attachment']>(undefined);
  const [points, setPoints] = useState<PdfAnnotationPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const inkRef = useRef<SVGSVGElement | null>(null);

  const resetPayload = () => {
    setText('');
    setTargetText('');
    setReplacementText('');
    setAttachment(undefined);
    setPoints([]);
    setError('');
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError('');
      setAttachment(await createPdfAnnotationAttachment(file));
    } catch {
      setAttachment(undefined);
      setError(copy.attachmentRejected);
    }
  };

  const handleSubmit = () => {
    try {
      setError('');
      const numericMeasurement = Number(measurementValue);
      const draft: PdfReviewAnnotationDraft = {
        page: Math.max(1, Math.min(totalPages, Math.trunc(page))),
        type,
        text,
        color,
        author,
        ...((type === 'text-insert' || type === 'text-replace') && targetText ? { targetText } : {}),
        ...((type === 'text-insert' || type === 'text-replace') ? { bounds: DEFAULT_BOUNDS } : {}),
        ...(type === 'text-replace' ? { replacementText } : {}),
        ...(type === 'ink' ? { points } : {}),
        ...(type === 'shape' ? { shapeKind, bounds: DEFAULT_BOUNDS } : {}),
        ...((type === 'text-box' || type === 'callout') ? { bounds: DEFAULT_BOUNDS } : {}),
        ...(type === 'stamp' ? { stampLabel, bounds: DEFAULT_BOUNDS } : {}),
        ...(type === 'file-attachment' && attachment ? { attachment, bounds: DEFAULT_BOUNDS } : {}),
        ...(type === 'measurement'
          ? {
              bounds: DEFAULT_BOUNDS,
              measurement: {
                value: Number.isFinite(numericMeasurement) ? numericMeasurement : 0,
                unit: measurementUnit,
                ...(scaleLabel.trim() ? { scaleLabel: scaleLabel.trim() } : {}),
              },
            }
          : {}),
      };
      onCreate(draft);
      resetPayload();
    } catch {
      setError(copy.createFailed);
    }
  };

  const requiresText = type !== 'ink' && type !== 'shape' && type !== 'file-attachment' && type !== 'measurement';

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/60 p-3 space-y-3" aria-label={copy.accessibleName}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[0.6875rem] font-semibold text-slate-200">
          <Plus className="w-3.5 h-3.5 text-blue-400" /> {copy.title}
        </div>
        <input
          aria-label={copy.color}
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="w-7 h-6 bg-transparent border-0 p-0"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[0.625rem] text-slate-400">
          {copy.type}
          <select value={type} onChange={(event) => { setType(event.target.value as PdfAnnotationType); resetPayload(); }} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200">
            {REVIEW_TYPES.map((entry) => <option key={entry} value={entry}>{copy.types[entry]}</option>)}
          </select>
        </label>
        <label className="text-[0.625rem] text-slate-400">
          {copy.page}
          <input type="number" min={1} max={totalPages} value={page} onChange={(event) => setPage(Number(event.target.value))} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200" />
        </label>
      </div>

      <label className="block text-[0.625rem] text-slate-400">
        {copy.author}
        <input value={author} maxLength={256} onChange={(event) => setAuthor(event.target.value)} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200" />
      </label>

      {requiresText && (
        <label className="block text-[0.625rem] text-slate-400">
          {type === 'stamp' ? copy.stampNote : copy.commentText}
          <textarea value={text} maxLength={32_000} onChange={(event) => setText(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded bg-slate-950 border border-white/10 p-2 text-[0.6875rem] text-slate-200" />
        </label>
      )}

      {(type === 'text-insert' || type === 'text-replace') && (
        <label className="block text-[0.625rem] text-slate-400">
          {copy.targetText}
          <input value={targetText} maxLength={32_000} onChange={(event) => setTargetText(event.target.value)} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200" />
        </label>
      )}

      {type === 'text-replace' && (
        <label className="block text-[0.625rem] text-slate-400">
          {copy.replacementText}
          <input value={replacementText} maxLength={32_000} onChange={(event) => setReplacementText(event.target.value)} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200" />
        </label>
      )}

      {type === 'shape' && (
        <label className="block text-[0.625rem] text-slate-400">
          {copy.shape}
          <select value={shapeKind} onChange={(event) => setShapeKind(event.target.value as typeof shapeKind)} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200">
            <option value="rectangle">{copy.shapes.rectangle}</option><option value="ellipse">{copy.shapes.ellipse}</option><option value="line">{copy.shapes.line}</option><option value="arrow">{copy.shapes.arrow}</option>
          </select>
        </label>
      )}

      {type === 'stamp' && (
        <label className="block text-[0.625rem] text-slate-400">
          {copy.stampLabel}
          <input value={stampLabel} maxLength={256} onChange={(event) => setStampLabel(event.target.value)} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200 uppercase" />
        </label>
      )}

      {type === 'file-attachment' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer rounded border border-dashed border-white/15 bg-slate-950/60 p-2 text-[0.625rem] text-slate-300">
            <Paperclip className="w-3.5 h-3.5 text-blue-400" />
            <span>{attachment ? `${attachment.fileName} · ${attachment.byteLength} bytes` : copy.attachment}</span>
            <input type="file" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
          {attachment && <div className="font-mono text-[0.5625rem] break-all text-slate-500">SHA-256 {attachment.sha256}</div>}
        </div>
      )}

      {type === 'measurement' && (
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[0.625rem] text-slate-400 col-span-1">{copy.measurementValue}<input type="number" min="0" step="any" value={measurementValue} onChange={(event) => setMeasurementValue(event.target.value)} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200" /></label>
          <label className="text-[0.625rem] text-slate-400">{copy.unit}<select value={measurementUnit} onChange={(event) => setMeasurementUnit(event.target.value as typeof measurementUnit)} className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200"><option>mm</option><option>cm</option><option>m</option><option>in</option><option>ft</option><option>pt</option></select></label>
          <label className="text-[0.625rem] text-slate-400">{copy.scale}<input value={scaleLabel} maxLength={256} onChange={(event) => setScaleLabel(event.target.value)} placeholder="1:100" className="mt-1 w-full rounded bg-slate-950 border border-white/10 p-1.5 text-[0.6875rem] text-slate-200" /></label>
        </div>
      )}

      {type === 'ink' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[0.625rem] text-slate-400"><span className="flex items-center gap-1"><PenLine className="w-3 h-3" /> {copy.drawFreehand}</span><button type="button" onClick={() => setPoints([])} className="flex items-center gap-1 text-slate-500 hover:text-red-300"><Trash2 className="w-3 h-3" /> {copy.clearPoints}</button></div>
          <svg
            ref={inkRef}
            viewBox="0 0 300 110"
            className="w-full h-[110px] rounded-lg border border-white/10 bg-slate-950 touch-none"
            onPointerDown={(event) => {
              const svg = inkRef.current;
              if (!svg) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDrawing(true);
              setPoints([pointerPoint(event, svg)]);
            }}
            onPointerMove={(event) => {
              if (!drawing) return;
              const svg = inkRef.current;
              if (!svg) return;
              const point = pointerPoint(event, svg);
              setPoints((current) => current.length >= 4096 ? current : [...current, point]);
            }}
            onPointerUp={() => setDrawing(false)}
            onPointerCancel={() => setDrawing(false)}
          >
            {points.length > 1 && <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points.map((point) => `${point.x * 300},${point.y * 110}`).join(' ')} />}
          </svg>
          <div className="text-[0.5625rem] text-slate-500">{copy.capturedPoints(points.length)}</div>
        </div>
      )}

      {error && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[0.625rem] text-red-200">{error}</div>}

      <button type="button" onClick={handleSubmit} className="w-full rounded-lg border border-blue-500/30 bg-blue-500/15 px-3 py-2 text-[0.6875rem] font-semibold text-blue-200 hover:bg-blue-500/25">
        {copy.create}
      </button>
    </section>
  );
};
