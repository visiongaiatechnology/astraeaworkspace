// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — bounded PDF.js thumbnail renderer.

import React, { useEffect, useRef, useState } from 'react';
import type { PdfJsDisplayDocument } from '../contracts/pdfJsDisplayTypes';

interface PdfJsThumbnailProps {
  document: PdfJsDisplayDocument;
  pageNumber: number;
  active: boolean;
  label?: string;
  onSelect: (pageNumber: number) => void;
}

const MAX_THUMBNAIL_PIXELS = 512 * 512;

export const PdfJsThumbnail: React.FC<PdfJsThumbnailProps> = ({ document, pageNumber, active, label, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    setError(false);
    void document.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(0.24, 132 / Math.max(base.width, 1));
      const viewport = page.getViewport({ scale });
      const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
      const width = Math.max(1, Math.ceil(viewport.width * dpr));
      const height = Math.max(1, Math.ceil(viewport.height * dpr));
      if (width * height > MAX_THUMBNAIL_PIXELS) throw new Error('thumbnail budget exceeded');
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('thumbnail canvas unavailable');
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: 0,
        transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0],
      });
      cancelRender = () => task.cancel();
      return task.promise;
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [document, pageNumber]);

  return (
    <button type="button" onClick={() => onSelect(pageNumber)} className={`mb-2 block w-full rounded-lg border p-1.5 text-left ${active ? 'border-cyan-400/45 bg-cyan-500/10' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'}`} aria-current={active ? 'page' : undefined}>
      <div className="grid min-h-24 place-items-center overflow-hidden rounded bg-slate-800">
        {error ? <span className="text-[0.5rem] text-rose-300">thumbnail failed</span> : <canvas ref={canvasRef} aria-label={`Thumbnail page ${pageNumber}`} />}
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 text-[0.5rem] font-mono text-slate-500"><span>p.{pageNumber}</span>{label ? <span className="truncate text-cyan-300">{label}</span> : null}</div>
    </button>
  );
};
