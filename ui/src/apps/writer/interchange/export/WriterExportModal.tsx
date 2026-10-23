// STATUS: DIAMANT VGT SUPREME
import { useState } from 'react';
import { Printer, FileDown, X, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import { PageSetupConfig, TableBlockData, ImageBlockData } from '../../types';
import {
  Paragraph,
  WriterSectionDefinition,
  WriterStyleDefinition,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';
import { buildWriterPdf, downloadWriterPdf, openWriterPdfForPrint } from './pdf/writerPdfExport';
import { downloadWriterPdfA } from './pdf-archive/writerPdfArchiveExport';
import {
  describeWriterInterchangeFormattingLoss,
  describeWriterInterchangeLoss,
  downloadWriterPortableBytes,
  exportWriterPortableDocument,
  type WriterPortableFormat,
} from '../portable/writerPortableInterop';
import type { WriterInterchangeLossReport } from '../portable/writerInterchangeLossReport';
import { analyzeWriterPdfImageSupport } from './pdf/writerPdfImageSupport';
import type { WriterExportHost } from '../../../../edition/contracts/writerExportHost';
import { writerExportDeliveryText, writerExportFailureText } from './writerExportStatus';

interface WriterExportModalProps {
  document: WorkspaceDocument;
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  wordCount: number;
  charCount: number;
  config: PageSetupConfig;
  paragraphs: Paragraph[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  styles: WriterStyleDefinition[];
  sections: WriterSectionDefinition[];
  writerExportHost?: WriterExportHost;
}

export const WriterExportModal: React.FC<WriterExportModalProps> = ({
  document,
  isOpen,
  onClose,
  documentTitle,
  wordCount,
  charCount,
  config,
  paragraphs,
  tables,
  images,
  styles,
  sections,
  writerExportHost,
}) => {
  const [pageRange, setPageRange] = useState('');
  const [copies, setCopies] = useState(1);
  const [collate, setCollate] = useState(true);
  const [duplex, setDuplex] = useState<'none' | 'long-edge' | 'short-edge'>('none');
  const [scalePercent, setScalePercent] = useState(100);
  const [message, setMessage] = useState<string | null>(null);
/**
 * WR-042 — the loss report as an **itemised list**.
 *
 * The modal only printed one sentence, so a user exporting a document with shapes, comments and
 * footnotes read "ACHTUNG: … (und 3 weitere Angabe(n))" and never learned which three. The
 * report is kept after the export and rendered entry by entry.
 */
const [lastLossReport, setLastLossReport] = useState<WriterInterchangeLossReport | null>(null);
  const pdfMetadata = {
    language: document.writerData?.linguistics?.defaultLanguage ?? 'de-DE',
    createdAt: document.created_at,
    modifiedAt: document.modified_at,
    bookmarks: document.writerData?.bookmarks ?? [],
  };

  if (!isOpen) return null;

  /**
   * WR-043 — what the PDF cannot carry is named, not silently absent.
   *
   * PNG and JPEG are embedded (PNG by Flate passthrough). WebP, alpha PNGs, equations,
   * footnotes and free shapes have no PDF representation in this pipeline, so the export
   * message names them instead of pretending the PDF is complete.
   */
  const pdfSupportNote = (): string => {
    const imageSupport = analyzeWriterPdfImageSupport(images);
    const parts: string[] = [];
    if (imageSupport.unsupported > 0) {
      parts.push(`${imageSupport.unsupported} Bild(er) (WebP oder PNG mit Transparenz) nicht eingebettet`);
    }
    const equations = document.writerData?.equations?.length ?? 0;
    if (equations > 0) parts.push(`${equations} Formel(n) nicht als Formel gesetzt`);
    const footnotes = document.writerData?.footnotes?.length ?? 0;
    if (footnotes > 0) parts.push(`${footnotes} Fußnote(n) nicht im PDF`);
    const shapes = document.writerData?.shapes?.length ?? 0;
    if (shapes > 0) parts.push(`${shapes} Vektorform(en) nicht im PDF`);
    return parts.length > 0 ? ` Hinweis: ${parts.join(' · ')}.` : '';
  };

  const handleTriggerPrint = () => {
    try {
      openWriterPdfForPrint(documentTitle, paragraphs, config, tables, images, styles, sections, {
        pageRange, copies, collate, duplex, scalePercent,
      }, pdfMetadata);
      setMessage(`Print-ready PDF geöffnet. Der Systemdialog übernimmt Drucker-spezifische Optionen.${pdfSupportNote()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Druckvorschau konnte nicht erzeugt werden.');
    }
  };

  const handleExportPdf = async () => {
    try {
      const delivery = await downloadWriterPdf(documentTitle, paragraphs, config, tables, images, styles, sections, pdfMetadata);
      setMessage(`${writerExportDeliveryText(delivery)}${pdfSupportNote()}`);
    } catch (error) {
      setMessage(writerExportFailureText(error));
    }
  };

  const handleExportPdfA = async () => {
    try {
      const delivery = await downloadWriterPdfA(documentTitle, paragraphs, config, tables, images, styles, sections, pdfMetadata);
      setMessage(`${delivery.fileName} als PDF/A-2b ${delivery.mode === 'file' ? 'gespeichert.' : 'als Download gestartet (Browser-Modus – keine Schreibbestätigung).'}${pdfSupportNote()}`);
    } catch (error) {
      setMessage(writerExportFailureText(error));
    }
  };

  const handlePortableExport = async (format: WriterPortableFormat) => {
    try {
      // W-177/W-181/W-196: the export happens first, then the surface says what the format could not
      // carry. The report is built inside the exporter from the same table that describes the formats,
      // so a "vollständig" message cannot contradict what was written. Release Beta 0.1: the delivery
      // note states whether the file was written or only downloaded.
      const output = exportWriterPortableDocument(document, format);
      const delivery = await downloadWriterPortableBytes(output);
      setLastLossReport(output.lossReport);
      const summary = describeWriterInterchangeLoss(output.lossReport);
      const formatting = describeWriterInterchangeFormattingLoss(output.lossReport);
      const deliveryNote = writerExportDeliveryText(delivery);
      setMessage(
        output.lossReport.hasContentLoss
          ? `${deliveryNote} ACHTUNG: ${summary}`
          : [deliveryNote, summary, formatting].filter(Boolean).join(' '),
      );
    } catch (error) {
      setMessage(writerExportFailureText(error));
    }
  };

  const handleRequestPdfSigning = () => {
    const requestPdfSigning = writerExportHost?.onRequestPdfSigning;
    if (!requestPdfSigning) return;
    requestPdfSigning({
      documentTitle,
      currentPage: 1,
      getPdfBytes: () => buildWriterPdf(documentTitle, paragraphs, config, tables, images, styles, sections, {}, pdfMetadata),
      onSignedSuccess: (providerLabel) => setMessage(`Kryptografisch signiertes PDF exportiert · ${providerLabel}.`),
    });
  };

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Printer className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Print & Sovereign PDF Publishing</h3>
          </div>
          <button aria-label="Close Print & Sovereign PDF Publishing dialog"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Document Geometry Summary */}
        <div className="bg-slate-950/80 border border-white/10 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Document:</span>
            <span className="font-bold text-slate-100">{documentTitle}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Paper Standard:</span>
            <span className="font-mono text-blue-300">
              {config.paperSize} · {config.orientation.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Margins:</span>
            <span className="font-mono text-slate-300">{config.margins.toUpperCase()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Content Volume:</span>
            <span className="font-mono text-slate-300">
              {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs md:grid-cols-5">
          <label className="space-y-1 md:col-span-2"><span className="text-[0.625rem] text-slate-400">Seitenbereich</span><input value={pageRange} onChange={(event) => setPageRange(event.target.value)} maxLength={256} placeholder="z.B. 1-3,5" className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500" /></label>
          <label className="space-y-1"><span className="text-[0.625rem] text-slate-400">Kopien</span><input type="number" min={1} max={99} value={copies} onChange={(event) => setCopies(Math.min(99, Math.max(1, Number(event.target.value) || 1)))} className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-slate-200" /></label>
          <label className="space-y-1"><span className="text-[0.625rem] text-slate-400">Skalierung</span><input type="number" min={10} max={200} value={scalePercent} onChange={(event) => setScalePercent(Math.min(200, Math.max(10, Number(event.target.value) || 100)))} className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-slate-200" /></label>
          <label className="space-y-1"><span className="text-[0.625rem] text-slate-400">Duplex-Hinweis</span><select value={duplex} onChange={(event) => setDuplex(event.target.value as typeof duplex)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-slate-200"><option value="none">Simplex</option><option value="long-edge">Lange Kante</option><option value="short-edge">Kurze Kante</option></select></label>
          <label className="col-span-2 flex items-center gap-2 text-[0.625rem] text-slate-300 md:col-span-5"><input type="checkbox" checked={collate} onChange={(event) => setCollate(event.target.checked)} />Kopien sortieren (Collation). Seitenbereich/Kopien/Skalierung werden in die erzeugte Print-PDF-Datei eingerechnet.</label>
        </div>

        {/* Local export path */}
        <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold block">Local PDF Generator</span>
            <p className="text-[0.6875rem] text-emerald-400/80 mt-0.5">
              Local PDF export includes text, page geometry, headers/footers, structured Writer tables and imported Writer images. No third-party converter is used.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={handleTriggerPrint} className="flex items-center justify-center space-x-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition-all hover:bg-blue-500 active:scale-95"><Printer className="h-3.5 w-3.5" /><span>Print Preview PDF</span></button>
          <button type="button" onClick={handleExportPdf} className="flex items-center justify-center space-x-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-100 transition-all hover:bg-slate-700 active:scale-95"><FileDown className="h-3.5 w-3.5 text-blue-400" /><span>PDF exportieren</span></button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-wider text-slate-500"><FileText className="h-3.5 w-3.5" />Portable Writer-Adapter</div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {(['docx', 'odt', 'rtf', 'html', 'markdown', 'txt'] as WriterPortableFormat[]).map((format) => <button key={format} type="button" onClick={() => handlePortableExport(format)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[0.625rem] font-semibold uppercase text-slate-300 hover:border-blue-500/40 hover:bg-blue-500/10">{format === 'markdown' ? 'MD' : format}</button>)}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <button type="button" onClick={handleExportPdfA} className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[0.625rem] font-semibold text-emerald-200 hover:bg-emerald-500/15"><ShieldCheck className="h-3.5 w-3.5" />PDF/A-2b archivieren</button>
            <button type="button" onClick={handleRequestPdfSigning} disabled={!writerExportHost?.onRequestPdfSigning} aria-disabled={!writerExportHost?.onRequestPdfSigning} className="flex items-center justify-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[0.625rem] font-semibold text-cyan-200 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-45"><ShieldCheck className="h-3.5 w-3.5" />PDF kryptografisch signieren</button>
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2 text-[0.625rem] text-blue-200 md:col-span-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>PDF/A nutzt browser-natives Unicode-Shaping als Raster-Stencil mit ActualText, eingebetteten sRGB-Output-Intent und fail-closed Preflight. Lokale Fontdateien werden ohne explizite Lizenzfreigabe niemals extrahiert oder eingebettet.</span></div>
          </div>
        </div>

        {writerExportHost?.sharingPanel}

        {message && <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[0.625rem] text-slate-300">{message}</div>}
        {lastLossReport && lastLossReport.hasLosses && (
          <div data-writer-loss-report="true" className={`rounded-lg border px-3 py-2 text-[0.625rem] ${lastLossReport.hasContentLoss ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-white/5 text-slate-300'}`}>
            <p className="mb-1 font-semibold" role="heading" aria-level={3}>
              {lastLossReport.hasContentLoss ? 'Verlustbericht (Inhalt fehlt):' : 'Hinweise zur Formatierung:'}
            </p>
            <ul className="space-y-0.5">
              {lastLossReport.losses.map((entry) => (
                <li key={entry.kind} data-writer-loss-kind={entry.kind} data-writer-loss-severity={entry.severity}>
                  {entry.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
    </>
  );
};
