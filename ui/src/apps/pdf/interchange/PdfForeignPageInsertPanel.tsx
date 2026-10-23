// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — local PDF/image/scanner insert UI with explicit camera lifetime.

import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileImage, FileInput, LoaderCircle, ScanLine, VideoOff } from 'lucide-react';
import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';
import {
  flattenForeignPdfPages,
  insertNormalizedForeignPages,
  normalizedImagesFromLocalFiles,
  normalizedImagesFromScannerFrame,
} from '../../pdf-studio/import/pdfForeignPageImport';

interface PdfForeignPageInsertPanelProps {
  pdfData: PdfDocumentModel;
  onUpdatePdfData: (model: PdfDocumentModel) => void;
  initialMode?: 'pdf' | 'images' | 'scanner';
}

type ImportMode = 'pdf' | 'images' | 'scanner';
const MODE_COPY: Readonly<Record<ImportMode, PdfWorkflowCopyKey>> = {
  pdf: 'foreign.mode.pdf', images: 'foreign.mode.images', scanner: 'foreign.mode.scanner',
};

const stopStream = (stream: MediaStream | null): void => {
  for (const track of stream?.getTracks() ?? []) track.stop();
};

export const PdfForeignPageInsertPanel: React.FC<PdfForeignPageInsertPanelProps> = ({ pdfData, onUpdatePdfData, initialMode = 'pdf' }) => {
  const { locale } = useWorkspaceLocale();
  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [insertAt, setInsertAt] = useState(String(pdfData.pages.length + 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => () => stopStream(stream), [stream]);
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.srcObject = stream;
  }, [stream, mode]);

  const insertionPoint = () => Math.max(1, Math.min(pdfData.pages.length + 1, Math.trunc(Number(insertAt) || pdfData.pages.length + 1)));

  const runImport = async (operation: () => Promise<ReturnType<typeof insertNormalizedForeignPages>>, successKey: PdfWorkflowCopyKey) => {
    setBusy(true); setError(null); setNotice(null);
    try { onUpdatePdfData(await operation()); setNotice(pdfWorkflowText(locale, successKey)); }
    catch { setError(pdfWorkflowText(locale, 'foreign.error.import')); }
    finally { setBusy(false); }
  };

  const importPdf = (file: File) => runImport(async () => insertNormalizedForeignPages(pdfData, await flattenForeignPdfPages(file), insertionPoint()), 'foreign.success.pdf');
  const importImages = (files: File[]) => runImport(async () => insertNormalizedForeignPages(pdfData, await normalizedImagesFromLocalFiles(files), insertionPoint(), 'local-image-import'), 'foreign.success.images');

  const startScanner = async () => {
    setError(null); setNotice(null); stopStream(stream); setStream(null);
    if (!navigator.mediaDevices?.getUserMedia) { setError(pdfWorkflowText(locale, 'foreign.error.cameraUnavailable')); return; }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setStream(next);
      queueMicrotask(() => { if (videoRef.current) videoRef.current.srcObject = next; });
    } catch { setError(pdfWorkflowText(locale, 'foreign.error.camera')); }
  };

  const captureScanner = () => {
    const video = videoRef.current;
    if (!video) return;
    void runImport(async () => insertNormalizedForeignPages(pdfData, await normalizedImagesFromScannerFrame(video), insertionPoint(), 'scanner-import'), 'foreign.success.scanner');
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([['pdf', FileInput], ['images', FileImage], ['scanner', ScanLine]] as const).map(([value, Icon]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[0.625rem] ${mode === value ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200' : 'border-white/10 text-slate-400'}`}><Icon className="h-3.5 w-3.5" />{pdfWorkflowText(locale, MODE_COPY[value])}</button>)}
      </div>
      <label className="block text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'foreign.insertBefore')}<input aria-label={pdfWorkflowText(locale, 'foreign.insertBefore')} type="number" min="1" max={pdfData.pages.length + 1} value={insertAt} onChange={(event) => setInsertAt(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 font-mono text-slate-200" /></label>
      {mode === 'pdf' ? <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.025] p-5 text-xs text-slate-400 hover:border-cyan-400/30"><FileInput className="h-4 w-4" />{pdfWorkflowText(locale, 'foreign.choosePdf')}<input aria-label={pdfWorkflowText(locale, 'foreign.choosePdf')} type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPdf(file); event.currentTarget.value=''; }} /></label> : null}
      {mode === 'images' ? <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.025] p-5 text-xs text-slate-400 hover:border-cyan-400/30"><FileImage className="h-4 w-4" />{pdfWorkflowText(locale, 'foreign.chooseImages')}<input aria-label={pdfWorkflowText(locale, 'foreign.chooseImages')} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={busy} onChange={(event) => { const files=[...(event.target.files ?? [])]; if(files.length) void importImages(files); event.currentTarget.value=''; }} /></label> : null}
      {mode === 'scanner' ? <div className="space-y-2"><div className="overflow-hidden rounded-xl border border-white/10 bg-black"><video ref={videoRef} autoPlay muted playsInline aria-label={pdfWorkflowText(locale, 'foreign.mode.scanner')} className="aspect-video w-full object-contain" /></div><div className="flex gap-2"><button type="button" onClick={() => void startScanner()} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[0.625rem] text-slate-300"><Camera className="h-3.5 w-3.5" />{pdfWorkflowText(locale, 'foreign.startCamera')}</button><button type="button" onClick={captureScanner} disabled={busy || !stream} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-2 py-1.5 text-[0.625rem] font-semibold text-white disabled:opacity-40"><ScanLine className="h-3.5 w-3.5" />{pdfWorkflowText(locale, 'foreign.capture')}</button><button type="button" onClick={() => { stopStream(stream); setStream(null); }} disabled={!stream} className="rounded-lg border border-white/10 p-2 text-slate-400 disabled:opacity-30" aria-label={pdfWorkflowText(locale, 'foreign.stopCamera')} title={pdfWorkflowText(locale, 'foreign.stopCamera')}><VideoOff className="h-3.5 w-3.5" /></button></div></div> : null}
      {busy ? <div role="status" aria-live="polite" className="flex items-center gap-1.5 text-[0.625rem] text-cyan-300"><LoaderCircle className="h-3 w-3 animate-spin" />{pdfWorkflowText(locale, 'foreign.importing')}</div> : null}
      {notice ? <div role="status" aria-live="polite" className="rounded border border-emerald-500/20 bg-emerald-500/[0.05] p-2 text-[0.625rem] text-emerald-200">{notice}</div> : null}
      {error ? <div role="alert" aria-live="assertive" className="rounded border border-rose-500/20 bg-rose-500/[0.05] p-2 text-[0.625rem] text-rose-200">{error}</div> : null}
      <p className="text-[0.5625rem] leading-relaxed text-slate-600">{pdfWorkflowText(locale, 'foreign.explanation')}</p>
    </div>
  );
};
