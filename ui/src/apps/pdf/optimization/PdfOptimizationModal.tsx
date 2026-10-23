import React, { useEffect, useState } from 'react';
import { Download, Gauge, ShieldCheck, X } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';
import { buildStructuredPdfBytes } from '../interchange/structuredPdfExport';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';
import { pdfExportDeliveryText, pdfExportFailureText } from '../interchange/pdfExportStatus';
import { previewStructuredPdfImageDownsampling, type PdfImageDownsamplePreview } from '../media/optimization/pdfImageOptimization';
import { inspectPdfLinearizationAvailability, linearizePdfWithNativeProvider, type PdfLinearizationStatus } from './pdfNativeLinearization';
import {
  applyPdfOptimization,
  previewPdfOptimization,
  type PdfOptimizationObjectAuditEntry,
  type PdfOptimizationPreset,
  type PdfOptimizationPreview,
} from './pdfOptimization';

interface PdfOptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: WorkspaceDocument;
}

const PRESETS: PdfOptimizationPreset[] = ['screen', 'print', 'archive'];
const PRESET_COPY: Readonly<Record<PdfOptimizationPreset, PdfWorkflowCopyKey>> = {
  screen: 'optimization.preset.screen', print: 'optimization.preset.print', archive: 'optimization.preset.archive',
};
const PRESET_NOTE_COPY: Readonly<Record<PdfOptimizationPreset, PdfWorkflowCopyKey>> = {
  screen: 'optimization.preset.screenNote', print: 'optimization.preset.printNote', archive: 'optimization.preset.archiveNote',
};
const PRESET_WARNING_COPY: Readonly<Record<PdfOptimizationPreset, PdfWorkflowCopyKey>> = {
  screen: 'optimization.warning.screen', print: 'optimization.warning.print', archive: 'optimization.warning.archive',
};
const OBJECT_KIND_COPY: Readonly<Record<PdfOptimizationObjectAuditEntry['kind'], PdfWorkflowCopyKey>> = {
  catalog: 'optimization.kind.catalog', pages: 'optimization.kind.pages', page: 'optimization.kind.page', font: 'optimization.kind.font',
  'form-xobject': 'optimization.kind.formXobject', annotation: 'optimization.kind.annotation', 'structure-root': 'optimization.kind.structureRoot',
  'structure-element': 'optimization.kind.structureElement', 'output-intent': 'optimization.kind.outputIntent', stream: 'optimization.kind.stream',
  'number-tree': 'optimization.kind.numberTree', other: 'optimization.kind.other',
};

/** Release Beta 0.1: native save on the desktop; the browser fallback stays a download. */
function deliverPdf(fileName: string, bytes: Uint8Array): Promise<ExportDeliveryResult> {
  return deliverExportBytes(bytes, {
    suggestedName: fileName,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}

const signedBytes = (value: number, locale: string): string => `${value >= 0 ? '+' : ''}${new Intl.NumberFormat(locale).format(value)} B`;

export const PdfOptimizationModal: React.FC<PdfOptimizationModalProps> = ({ isOpen, onClose, source }) => {
  const { locale } = useWorkspaceLocale();
  const [preset, setPreset] = useState<PdfOptimizationPreset>('screen');
  const [preview, setPreview] = useState<PdfOptimizationPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState('');
  const [imageMaxDimension, setImageMaxDimension] = useState('1600');
  const [imageQuality, setImageQuality] = useState('0.82');
  const [imagePreview, setImagePreview] = useState<PdfImageDownsamplePreview | null>(null);
  const [imageConfirmed, setImageConfirmed] = useState(false);
  const [linearization, setLinearization] = useState<PdfLinearizationStatus | null>(null);
  const [linearizing, setLinearizing] = useState(false);

  useEffect(() => {
    setPreview(null);
    setConfirmed(false);
    setStatus('');
    setImagePreview(null);
    setImageConfirmed(false);
  }, [preset, source.id, source.pdfData, imageMaxDimension, imageQuality, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void inspectPdfLinearizationAvailability().then((next) => { if (!cancelled) setLinearization(next); }).catch(() => {
      if (!cancelled) setLinearization({ available: false, provider: 'Unavailable', reason: '' });
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const analyze = () => {
    try {
      if (!source.pdfData || source.pdfData.rawPdfDataUrl) throw new Error();
      const next = previewPdfOptimization(source.title, source.pdfData, preset);
      setPreview(next);
      setConfirmed(false);
      setStatus(pdfWorkflowText(locale, 'optimization.status.preview', { objects: next.optimized.objectCount, bytes: new Intl.NumberFormat(locale).format(next.optimized.byteLength) }));
    } catch {
      setPreview(null);
      setConfirmed(false);
      setStatus(pdfWorkflowText(locale, 'optimization.error.preview'));
    }
  };

  const analyzeImages = async () => {
    try {
      if (!source.pdfData || source.pdfData.rawPdfDataUrl) throw new Error();
      const result = await previewStructuredPdfImageDownsampling(source.pdfData, { maxDimension: Number(imageMaxDimension), jpegQuality: Number(imageQuality) });
      setImagePreview(result);
      setImageConfirmed(false);
      setStatus(pdfWorkflowText(locale, 'optimization.status.imagePreview', { changed: result.imagesDownsampled, total: result.imagesSeen, saved: new Intl.NumberFormat(locale).format(result.bytesSaved) }));
    } catch {
      setImagePreview(null);
      setImageConfirmed(false);
      setStatus(pdfWorkflowText(locale, 'optimization.error.images'));
    }
  };

  const exportImageOptimized = async () => {
    try {
      if (!imagePreview || !imageConfirmed) throw new Error('No confirmed image optimization preview.');
      const exportOptions = preset === 'screen'
        ? { deduplicateResources: true }
        : { taggedStructure: true, includeSrgbOutputIntent: true, deduplicateResources: true };
      const bytes = buildStructuredPdfBytes(source.title, imagePreview.model, exportOptions);
      const safe = (source.title || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_');
      const delivery = await deliverPdf(`${safe}_${preset}_image_optimized.pdf`, bytes);
      setStatus(`${pdfWorkflowText(locale, 'optimization.status.imageExport', { changed: imagePreview.imagesDownsampled, saved: new Intl.NumberFormat(locale).format(imagePreview.bytesSaved) })} ${pdfExportDeliveryText(locale, delivery)}`);
    } catch (error) {
      setStatus(pdfExportFailureText(locale, error));
    }
  };

  const exportOptimized = async () => {
    try {
      if (!source.pdfData || !preview) throw new Error('No confirmed optimization preview.');
      const result = applyPdfOptimization(source.title, source.pdfData, preset, { confirmed, previewId: preview.previewId });
      const safe = (source.title || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_');
      const delivery = await deliverPdf(`${safe}_${preset}_optimized.pdf`, result.bytes);
      setStatus(`${pdfWorkflowText(locale, 'optimization.status.export', { bytes: new Intl.NumberFormat(locale).format(result.bytes.byteLength) })} ${pdfExportDeliveryText(locale, delivery)}`);
    } catch (error) {
      setStatus(pdfExportFailureText(locale, error));
    }
  };

  const exportLinearized = async () => {
    try {
      if (!source.pdfData || source.pdfData.rawPdfDataUrl) throw new Error('Linearization requires a structured PDF Studio document.');
      setLinearizing(true);
      const sourceBytes = buildStructuredPdfBytes(source.title, source.pdfData, { taggedStructure: true, includeSrgbOutputIntent: true, deduplicateResources: true });
      const result = await linearizePdfWithNativeProvider(sourceBytes);
      const safe = (source.title || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_');
      const delivery = await deliverPdf(`${safe}_fast_web_view.pdf`, result.bytes);
      setStatus(`${pdfWorkflowText(locale, 'optimization.status.linearized', { bytes: new Intl.NumberFormat(locale).format(result.bytes.byteLength) })} ${pdfExportDeliveryText(locale, delivery)}`);
    } catch (error) {
      setStatus(pdfExportFailureText(locale, error));
    } finally {
      setLinearizing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div role="dialog" aria-modal="true" aria-label={pdfWorkflowText(locale, 'optimization.title')} className="vgt-dialog-scroll-surface max-h-[88vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#0b0f17] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-300"><Gauge className="h-5 w-5" /><h3 className="font-bold">{pdfWorkflowText(locale, 'optimization.title')}</h3></div>
            <p className="mt-1 text-xs text-slate-400">{pdfWorkflowText(locale, 'optimization.description')}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={pdfWorkflowText(locale, 'optimization.close')}><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((item) => (
            <button key={item} type="button" onClick={() => setPreset(item)} className={`rounded-xl border p-3 text-left transition-colors ${preset === item ? 'border-cyan-400 bg-cyan-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'}`}>
              <div className="text-xs font-bold">{pdfWorkflowText(locale, PRESET_COPY[item])}</div>
              <div className="mt-1 text-[0.5625rem] text-slate-500">{pdfWorkflowText(locale, PRESET_NOTE_COPY[item])}</div>
            </button>
          ))}
        </div>

        <button type="button" onClick={analyze} className="w-full rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-500">{pdfWorkflowText(locale, 'optimization.analyze')}</button>

        {preview && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[0.5625rem] uppercase tracking-wide text-slate-500">{pdfWorkflowText(locale, 'optimization.before')}</div><div className="mt-1 text-sm font-bold text-slate-100">{new Intl.NumberFormat(locale).format(preview.baseline.byteLength)} B</div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[0.5625rem] uppercase tracking-wide text-slate-500">{pdfWorkflowText(locale, 'optimization.after')}</div><div className="mt-1 text-sm font-bold text-slate-100">{new Intl.NumberFormat(locale).format(preview.optimized.byteLength)} B</div></div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[0.5625rem] uppercase tracking-wide text-slate-500">{pdfWorkflowText(locale, 'optimization.delta')}</div><div className="mt-1 text-sm font-bold text-slate-100">{signedBytes(preview.byteDelta, locale)} · {preview.byteDeltaPercent.toFixed(1)}%</div></div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3"><div className="text-[0.5625rem] uppercase tracking-wide text-emerald-400">{pdfWorkflowText(locale, 'optimization.reachability')}</div><div className="mt-1 text-sm font-bold text-emerald-200">{new Intl.NumberFormat(locale).format(preview.optimized.reachableObjectCount)}/{new Intl.NumberFormat(locale).format(preview.optimized.objectCount)}</div></div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[0.625rem] text-slate-300">
              <div className="font-semibold text-slate-100">{pdfWorkflowText(locale, 'optimization.audit.title')}</div>
              <div className="mt-2 grid gap-1">
                {preview.optimized.largestObjects.slice(0, 8).map((entry) => <div key={entry.objectId} className="flex justify-between gap-3"><span>#{entry.objectId} · {pdfWorkflowText(locale, OBJECT_KIND_COPY[entry.kind])} · {pdfWorkflowText(locale, 'optimization.audit.references', { count: entry.references.length })}</span><span className="font-mono text-slate-400">{new Intl.NumberFormat(locale).format(entry.byteLength)} B</span></div>)}
              </div>
              <div className="mt-2 text-emerald-300">{pdfWorkflowText(locale, 'optimization.audit.unused', { count: preview.optimized.unreachableObjectIds.length })} · {pdfWorkflowText(locale, 'optimization.audit.duplicates', { count: preview.optimized.duplicateResourceGroups.length })}</div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[0.625rem] leading-relaxed text-amber-100">
              <p>{pdfWorkflowText(locale, PRESET_WARNING_COPY[preset])}</p><p>{pdfWorkflowText(locale, 'optimization.warning.general')}</p>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
              <span><b className="text-white">{pdfWorkflowText(locale, 'optimization.review')}</b> {pdfWorkflowText(locale, 'optimization.review.note')}</span>
            </label>

            <button type="button" disabled={!confirmed} onClick={exportOptimized} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck className="h-4 w-4" /><Download className="h-4 w-4" />{pdfWorkflowText(locale, 'optimization.export')}</button>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
          <div><div className="text-xs font-bold text-fuchsia-200">{pdfWorkflowText(locale, 'optimization.lossy.title')}</div><p className="mt-1 text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'optimization.lossy.note')}</p></div>
          <div className="grid grid-cols-2 gap-2"><label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'optimization.maxDimension')}<input aria-label={pdfWorkflowText(locale, 'optimization.maxDimension')} type="number" min="256" max="4096" value={imageMaxDimension} onChange={(event) => setImageMaxDimension(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-slate-200" /></label><label className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, 'optimization.jpegQuality')}<input aria-label={pdfWorkflowText(locale, 'optimization.jpegQuality')} type="number" min="0.4" max="0.95" step="0.01" value={imageQuality} onChange={(event) => setImageQuality(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-slate-200" /></label></div>
          <button type="button" onClick={() => void analyzeImages()} className="w-full rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[0.6875rem] font-semibold text-fuchsia-100 hover:bg-fuchsia-500/20">{pdfWorkflowText(locale, 'optimization.previewImages')}</button>
          {imagePreview && <><div className="text-[0.625rem] text-slate-300">{pdfWorkflowText(locale, 'optimization.imageSummary', { changed: imagePreview.imagesDownsampled, total: imagePreview.imagesSeen, saved: new Intl.NumberFormat(locale).format(imagePreview.bytesSaved) })} · {new Intl.NumberFormat(locale).format(imagePreview.originalBytes)} B → {new Intl.NumberFormat(locale).format(imagePreview.optimizedBytes)} B</div><label className="flex items-start gap-2 text-[0.625rem] text-amber-100"><input type="checkbox" aria-label={pdfWorkflowText(locale, 'optimization.reviewLossy')} checked={imageConfirmed} onChange={(event) => setImageConfirmed(event.target.checked)} className="mt-0.5" /><span>{pdfWorkflowText(locale, 'optimization.reviewLossy')}</span></label><button type="button" disabled={!imageConfirmed} onClick={exportImageOptimized} className="w-full rounded-lg bg-fuchsia-600 px-3 py-2 text-[0.6875rem] font-bold text-white disabled:opacity-40">{pdfWorkflowText(locale, 'optimization.exportLossy')}</button></>}
        </div>

        <div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="text-xs font-bold text-sky-200">{pdfWorkflowText(locale, 'optimization.fastView.title')}</div>
          <p className="text-[0.625rem] leading-relaxed text-slate-400">{pdfWorkflowText(locale, 'optimization.fastView.note')}</p>
          <div className="text-[0.5625rem] font-mono text-slate-500">{linearization ? pdfWorkflowText(locale, linearization.available ? 'optimization.fastView.available' : 'optimization.fastView.unavailable') : pdfWorkflowText(locale, 'optimization.fastView.checking')}</div>
          <button type="button" disabled={!linearization?.available || linearizing} onClick={() => void exportLinearized()} className="w-full rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[0.6875rem] font-bold text-sky-100 hover:bg-sky-500/20 disabled:opacity-35">{linearizing ? pdfWorkflowText(locale, 'optimization.fastView.linearizing') : pdfWorkflowText(locale, 'optimization.fastView.export')}</button>
        </div>

        {status && <div role="status" aria-live="polite" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.6875rem] text-slate-300">{status}</div>}
      </div>
    </div>
  );
};
