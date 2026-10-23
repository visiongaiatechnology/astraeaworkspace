import React, { useMemo, useRef, useState } from 'react';
import { Download, FileArchive, FilePlus2, ImagePlus, RefreshCw, X } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  batchConvertStructuredPdfs,
  bundlePdfBatchArtifacts,
  convertStructuredPdf,
  createPdfFromMixedSources,
  isPdfCreationWorkspaceSource,
  type PdfConversionArtifact,
  type PdfConversionFormat,
} from './pdfConversion';
import { normalizeLocalImageFiles, type PdfNormalizedJpegSource } from '../media/import/pdfImageImport';
import { exportStructuredPdfPagesToRaster, type PdfRasterFormat } from './raster/pdfStructuredRasterExport';
import { applySecurityWatermarkToPdf, createWorkspaceSecurityWatermarkContext } from '../security/watermark';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';
import { pdfExportDeliveryText, pdfExportFailureText } from './pdfExportStatus';

interface PdfConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: WorkspaceDocument;
  workspaceDocuments: WorkspaceDocument[];
}

const FORMATS: PdfConversionFormat[] = ['docx', 'xlsx', 'pptx', 'html', 'text'];
const FORMAT_COPY_KEYS = {
  docx: ['conversion.format.docx', 'conversion.formatNote.docx'],
  xlsx: ['conversion.format.xlsx', 'conversion.formatNote.xlsx'],
  pptx: ['conversion.format.pptx', 'conversion.formatNote.pptx'],
  html: ['conversion.format.html', 'conversion.formatNote.html'],
  text: ['conversion.format.text', 'conversion.formatNote.text'],
} as const satisfies Record<PdfConversionFormat, readonly [PdfWorkflowCopyKey, PdfWorkflowCopyKey]>;

function localizedWarning(warning: string, locale: Parameters<typeof pdfWorkflowText>[0]): string {
  if (warning.startsWith('Workspace sources are semantically reflowed into PDF Studio pages;')) {
    return pdfWorkflowText(locale, 'conversion.warning.mixedSources');
  }
  const invalidLinks = /^\s*(\d+) invalid or non-HTTP\(S\) link target\(s\) were omitted/u.exec(warning);
  if (invalidLinks) return pdfWorkflowText(locale, 'conversion.warning.invalidLinks', { count: Number(invalidLinks[1]) });
  return pdfWorkflowText(locale, 'conversion.warning.generic');
}

/** Release Beta 0.1: native write on the desktop; the browser fallback stays a download. */
function deliverConversion(fileName: string, mimeType: string, bytes: Uint8Array): Promise<ExportDeliveryResult> {
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBytes(bytes, {
    suggestedName: fileName,
    extensions: [extension],
    mimeType,
    assertArtifact: mimeType === 'application/pdf' ? assertPdfExportArtifact : undefined,
  });
}

export const PdfConversionModal: React.FC<PdfConversionModalProps> = ({ isOpen, onClose, source, workspaceDocuments }) => {
  const { locale } = useWorkspaceLocale();
  const [format, setFormat] = useState<PdfConversionFormat>('docx');
  const [status, setStatus] = useState('');
  const [lastArtifact, setLastArtifact] = useState<PdfConversionArtifact | null>(null);
  const [creationSourceIds, setCreationSourceIds] = useState<string[]>([]);
  const [creationImages, setCreationImages] = useState<PdfNormalizedJpegSource[]>([]);
  const [rasterFormat, setRasterFormat] = useState<PdfRasterFormat>('png');
  const [rasterDpi, setRasterDpi] = useState(144);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const batchSources = useMemo(() => {
    const map = new Map<string, WorkspaceDocument>();
    for (const doc of [source, ...workspaceDocuments]) {
      if (doc.kind === 'PdfStudio' && doc.pdfData?.pages?.length && !doc.pdfData.rawPdfDataUrl) map.set(doc.id, doc);
    }
    return [...map.values()].slice(0, 64);
  }, [source, workspaceDocuments]);

  const creationSources = useMemo(() => {
    const map = new Map<string, WorkspaceDocument>();
    for (const doc of workspaceDocuments) if (isPdfCreationWorkspaceSource(doc)) map.set(doc.id, doc);
    if (isPdfCreationWorkspaceSource(source)) map.set(source.id, source);
    return [...map.values()].slice(0, 32);
  }, [source, workspaceDocuments]);

  if (!isOpen) return null;

  const runCurrent = () => {
    try {
      if (!source.pdfData || source.pdfData.rawPdfDataUrl) throw new Error('Current document is not a structured PDF Studio document.');
      const artifact = convertStructuredPdf(source.title, source.pdfData, format);
      setLastArtifact(artifact);
      setStatus(pdfWorkflowText(locale, 'conversion.status.current', { fileName: artifact.fileName, bytes: artifact.bytes.byteLength, pages: artifact.sourcePages }));
    } catch {
      setLastArtifact(null);
      setStatus(pdfWorkflowText(locale, 'conversion.error'));
    }
  };

  const runBatch = async () => {
    try {
      if (!batchSources.length) throw new Error('No structured PDF Studio documents are available for batch conversion.');
      const result = batchConvertStructuredPdfs(batchSources.map((doc) => ({ title: doc.title, model: doc.pdfData! })), format);
      const zip = bundlePdfBatchArtifacts(result);
      const delivery = await deliverConversion(`astraea-pdf-batch-${format}.zip`, 'application/zip', zip);
      setLastArtifact(null);
      setStatus(`${pdfWorkflowText(locale, 'conversion.status.batch', { documents: result.artifacts.length, pages: result.totalInputPages, bytes: result.totalOutputBytes })} ${pdfExportDeliveryText(locale, delivery)}`);
    } catch (error) {
      setStatus(pdfExportFailureText(locale, error));
    }
  };

  const toggleCreationSource = (id: string) => {
    setCreationSourceIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(0, 32));
  };

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const normalized = await normalizeLocalImageFiles([...files]);
      setCreationImages((current) => [...current, ...normalized].slice(0, 128));
      setStatus(pdfWorkflowText(locale, 'conversion.status.imagesPrepared', { count: normalized.length }));
    } catch {
      setStatus(pdfWorkflowText(locale, 'conversion.error'));
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const runCreatePdf = () => {
    try {
      const selected = creationSources.filter((doc) => creationSourceIds.includes(doc.id));
      const artifact = createPdfFromMixedSources('astraea-mixed-source', selected, creationImages);
      setLastArtifact(artifact);
      setStatus(pdfWorkflowText(locale, 'conversion.status.created', { pages: artifact.sourcePages, sources: selected.length, images: creationImages.length }));
    } catch {
      setLastArtifact(null);
      setStatus(pdfWorkflowText(locale, 'conversion.error'));
    }
  };

  const runRasterExport = async () => {
    try {
      if (!source.pdfData || source.pdfData.rawPdfDataUrl) throw new Error('Raster export currently requires a structured PDF Studio document.');
      const protectedModel = applySecurityWatermarkToPdf(source.pdfData, createWorkspaceSecurityWatermarkContext(source));
      const artifacts = await exportStructuredPdfPagesToRaster(source.title, protectedModel, rasterFormat, { dpi: rasterDpi, jpegQuality: 0.9 });
      let delivery: ExportDeliveryResult;
      if (artifacts.length === 1) {
        const artifact = artifacts[0];
        delivery = await deliverConversion(artifact.fileName, artifact.mimeType, artifact.bytes);
      } else {
        const totalOutputBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes.byteLength, 0);
        const zip = bundlePdfBatchArtifacts({ artifacts, totalInputPages: source.pdfData.pages.length, totalOutputBytes });
        delivery = await deliverConversion(`${source.title.replace(/[^a-z0-9._-]+/giu, '_').slice(0, 100) || 'pdf'}-${rasterFormat}-pages.zip`, 'application/zip', zip);
      }
      setLastArtifact(null);
      setStatus(`${pdfWorkflowText(locale, 'conversion.status.raster', { pages: artifacts.length, format: rasterFormat.toUpperCase(), dpi: rasterDpi })} ${pdfExportDeliveryText(locale, delivery)}`);
    } catch (error) {
      setStatus(pdfExportFailureText(locale, error));
    }
  };

  /** Download of a previously built single artifact (the conversion itself wrote no file yet). */
  const downloadLastArtifact = async () => {
    if (!lastArtifact) return;
    try {
      const delivery = await deliverConversion(lastArtifact.fileName, lastArtifact.mimeType, lastArtifact.bytes);
      setStatus(pdfExportDeliveryText(locale, delivery));
    } catch (error) {
      setStatus(pdfExportFailureText(locale, error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="pdf-conversion-title">
      <div className="vgt-dialog-scroll-surface max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-violet-500/30 bg-[#0b0f17] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-violet-300"><RefreshCw className="h-5 w-5" /><h3 id="pdf-conversion-title" className="font-bold">{pdfWorkflowText(locale, 'conversion.title')}</h3></div><p className="mt-1 text-xs text-slate-400">{pdfWorkflowText(locale, 'conversion.intro')}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={pdfWorkflowText(locale, 'conversion.close')}><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {FORMATS.map((item) => <button key={item} type="button" aria-pressed={format === item} onClick={() => { setFormat(item); setLastArtifact(null); setStatus(''); }} className={`rounded-xl border p-3 text-left transition-colors ${format === item ? 'border-violet-400 bg-violet-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'}`}><div className="text-xs font-bold">{pdfWorkflowText(locale, FORMAT_COPY_KEYS[item][0])}</div><div className="mt-1 text-[0.5625rem] leading-snug text-slate-500">{pdfWorkflowText(locale, FORMAT_COPY_KEYS[item][1])}</div></button>)}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-100">{pdfWorkflowText(locale, 'conversion.current')}: {source.title}</div>
          <div className="mt-1 text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'conversion.batchPool', { count: batchSources.length, documents: 64, pages: 10_000, mib: 128 })}</div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={runCurrent} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500">{pdfWorkflowText(locale, 'conversion.convertCurrent')}</button>
          <button type="button" onClick={runBatch} className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/15"><FileArchive className="h-4 w-4" />{pdfWorkflowText(locale, 'conversion.batch')}</button>
        </div>

        <section className="space-y-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-200"><ImagePlus className="h-4 w-4" />{pdfWorkflowText(locale, 'conversion.rasterHeading')}</div>
          <p className="text-[0.625rem] leading-relaxed text-slate-500">{pdfWorkflowText(locale, 'conversion.rasterIntro')}</p>
          <div className="grid grid-cols-3 gap-2">
            {(['png', 'jpeg', 'tiff'] as PdfRasterFormat[]).map((value) => <button key={value} type="button" onClick={() => setRasterFormat(value)} className={`rounded-lg border px-3 py-2 text-[0.625rem] font-bold uppercase ${rasterFormat === value ? 'border-sky-400 bg-sky-500/15 text-sky-100' : 'border-white/10 bg-white/[0.03] text-slate-400'}`}>{value}</button>)}
          </div>
          <label className="flex items-center justify-between gap-3 text-[0.625rem] text-slate-400"><span>{pdfWorkflowText(locale, 'conversion.resolution')}</span><select aria-label={pdfWorkflowText(locale, 'conversion.resolution')} value={rasterDpi} onChange={(event) => setRasterDpi(Number(event.target.value))} className="rounded border border-white/10 bg-black/30 px-2 py-1 text-slate-200"><option value={72}>72 DPI</option><option value={144}>144 DPI</option><option value={300}>300 DPI</option></select></label>
          <button type="button" onClick={() => void runRasterExport()} className="w-full rounded-lg bg-sky-600/20 px-3 py-2 text-[0.625rem] font-bold text-sky-100 hover:bg-sky-600/30">{pdfWorkflowText(locale, 'conversion.exportRaster', { format: rasterFormat.toUpperCase() })}</button>
        </section>

        <section className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-200"><FilePlus2 className="h-4 w-4" />{pdfWorkflowText(locale, 'conversion.createHeading')}</div>
          <p className="text-[0.625rem] leading-relaxed text-slate-500">{pdfWorkflowText(locale, 'conversion.createIntro')}</p>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
            {creationSources.map((doc) => <label key={doc.id} className="flex cursor-pointer items-center gap-2 text-[0.625rem] text-slate-300"><input type="checkbox" checked={creationSourceIds.includes(doc.id)} onChange={() => toggleCreationSource(doc.id)} /><span className="rounded bg-white/5 px-1.5 py-0.5 text-[0.5625rem] text-slate-500">{doc.kind}</span><span className="truncate">{doc.title}</span></label>)}
            {!creationSources.length && <div className="text-[0.625rem] text-slate-600">{pdfWorkflowText(locale, 'conversion.noSources')}</div>}
          </div>
          <input aria-label={pdfWorkflowText(locale, 'conversion.addImages', { count: creationImages.length })} ref={imageInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => void addImages(event.target.files)} className="hidden" />
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => imageInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.625rem] font-semibold text-slate-300 hover:bg-white/[0.06]"><ImagePlus className="h-3.5 w-3.5" />{pdfWorkflowText(locale, 'conversion.addImages', { count: creationImages.length })}</button>
            <button type="button" onClick={runCreatePdf} className="rounded-lg bg-emerald-600/20 px-3 py-2 text-[0.625rem] font-bold text-emerald-200 hover:bg-emerald-600/30">{pdfWorkflowText(locale, 'conversion.createPdf')}</button>
          </div>
          {creationImages.length > 0 && <button type="button" onClick={() => setCreationImages([])} className="text-[0.5625rem] text-slate-500 underline hover:text-slate-300">{pdfWorkflowText(locale, 'conversion.clearImages')}</button>}
        </section>

        {lastArtifact && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3"><button type="button" onClick={() => { void downloadLastArtifact(); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600/20 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-600/30"><Download className="h-4 w-4" />{pdfWorkflowText(locale, 'conversion.download', { fileName: lastArtifact.fileName })}</button>{lastArtifact.warnings.map((warning, index) => <p key={`${index}:${warning.slice(0, 32)}`} className="mt-2 text-[0.625rem] text-amber-200">{localizedWarning(warning, locale)}</p>)}</div>}
        {status && <div role="status" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.6875rem] text-slate-300">{status}</div>}
      </div>
    </div>
  );
};
