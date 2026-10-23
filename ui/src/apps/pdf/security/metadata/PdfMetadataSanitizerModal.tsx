// STATUS: DIAMANT VGT SUPREME
import React, { useMemo, useState } from 'react';
import { X, Sparkles, Check, ShieldAlert, Download, ExternalLink, Paperclip } from 'lucide-react';
import type { PdfDocumentModel } from '../../../../shared/contracts/workspace';
import type { PdfMetadataSanitizationMode, PdfStructuredSanitizationReport } from '../sanitization/pdfStructuredSanitization';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';

interface PdfMetadataSanitizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  pdfData: PdfDocumentModel;
  onSanitize: () => void;
  onExportSanitized: (request: { metadataMode: PdfMetadataSanitizationMode; replacementTitle?: string; stripAnnotations: boolean; stripAttachments: boolean; stripFormData: boolean; stripActions: boolean; stripHiddenText: boolean }) => Promise<PdfStructuredSanitizationReport>;
}

export const PdfMetadataSanitizerModal: React.FC<PdfMetadataSanitizerModalProps> = ({
  isOpen, onClose, documentTitle, pdfData, onSanitize, onExportSanitized,
}) => {
  const { locale } = useWorkspaceLocale();
  const [metadataMode, setMetadataMode] = useState<PdfMetadataSanitizationMode>('strip');
  const [replacementTitle, setReplacementTitle] = useState('Sanitized Document');
  const [stripAnnotations, setStripAnnotations] = useState(true);
  const [stripAttachments, setStripAttachments] = useState(true);
  const [stripFormData, setStripFormData] = useState(true);
  const [stripActions, setStripActions] = useState(true);
  const [stripHiddenText, setStripHiddenText] = useState(true);
  const [report, setReport] = useState<PdfStructuredSanitizationReport | null>(null);
  const [error, setError] = useState('');
  const attachmentCount = useMemo(() => pdfData.annotations.filter((annotation) => annotation.attachment).length, [pdfData.annotations]);

  if (!isOpen) return null;

  const exportSanitized = async () => {
    setError('');
    try {
      const next = await onExportSanitized({ metadataMode, replacementTitle, stripAnnotations, stripAttachments, stripFormData, stripActions, stripHiddenText });
      if (metadataMode === 'strip') onSanitize();
      setReport(next);
    } catch {
      setReport(null);
      setError(pdfWorkflowText(locale, 'metadata.error'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150" role="dialog" aria-modal="true" aria-labelledby="pdf-metadata-sanitizer-title">
      <div className="vgt-dialog-scroll-surface max-h-[90vh] overflow-y-auto w-full max-w-2xl bg-slate-950 border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div><h3 id="pdf-metadata-sanitizer-title" className="text-sm font-bold text-slate-100">{pdfWorkflowText(locale, 'metadata.title')}</h3><p className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'metadata.heading')} · {documentTitle}</p></div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white" aria-label={pdfWorkflowText(locale, 'metadata.close')}><X className="w-4 h-4" /></button>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[0.6875rem] leading-relaxed text-amber-100">
          {pdfWorkflowText(locale, 'metadata.caution')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <label className="space-y-1"><span className="text-[0.625rem] font-semibold uppercase tracking-wider text-slate-400">{pdfWorkflowText(locale, 'metadata.policy')}</span><select value={metadataMode} onChange={(event) => setMetadataMode(event.target.value as PdfMetadataSanitizationMode)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"><option value="strip">{pdfWorkflowText(locale, 'metadata.strip')}</option><option value="replace-title">{pdfWorkflowText(locale, 'metadata.replaceTitle')}</option></select></label>
          <label className="space-y-1"><span className="text-[0.625rem] font-semibold uppercase tracking-wider text-slate-400">{pdfWorkflowText(locale, 'metadata.replacementTitle')}</span><input value={replacementTitle} onChange={(event) => setReplacementTitle(event.target.value)} disabled={metadataMode !== 'replace-title'} maxLength={256} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white disabled:opacity-40" /></label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300"><input type="checkbox" checked={stripAnnotations} onChange={(event) => setStripAnnotations(event.target.checked)} />{pdfWorkflowText(locale, 'metadata.removeAnnotations')} ({new Intl.NumberFormat(locale).format(pdfData.annotations.length)})</label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300"><input type="checkbox" checked={stripAttachments} onChange={(event) => setStripAttachments(event.target.checked)} />{pdfWorkflowText(locale, 'metadata.removeAttachments')} ({new Intl.NumberFormat(locale).format(attachmentCount)})</label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300"><input type="checkbox" checked={stripFormData} onChange={(event) => setStripFormData(event.target.checked)} />{pdfWorkflowText(locale, 'metadata.removeForms')} ({new Intl.NumberFormat(locale).format(pdfData.formFields?.length ?? 0)})</label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300"><input type="checkbox" checked={stripActions} onChange={(event) => setStripActions(event.target.checked)} />{pdfWorkflowText(locale, 'metadata.removeActions')} ({new Intl.NumberFormat(locale).format(pdfData.pages.reduce((sum, page) => sum + (page.links?.filter((link) => link.target.kind === 'url').length ?? 0), 0) + (pdfData.formFields?.filter((field) => field.submitUrl).length ?? 0))})</label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300"><input type="checkbox" checked={stripHiddenText} onChange={(event) => setStripHiddenText(event.target.checked)} />{pdfWorkflowText(locale, 'metadata.removeHiddenText')} ({new Intl.NumberFormat(locale).format(pdfData.pages.reduce((sum, page) => sum + (page.ocrLayer?.lines.reduce((lineSum, line) => lineSum + line.words.length, 0) ?? 0), 0))})</label>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200"><ShieldAlert className="inline w-4 h-4 mr-2" />{error}</div>}

        {report && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3 space-y-2 text-[0.6875rem]">
            <div className="flex items-center gap-2 font-semibold text-emerald-300"><Check className="w-4 h-4" />{pdfWorkflowText(locale, 'metadata.success')}</div>
            <div className="grid grid-cols-2 gap-2 font-mono text-slate-300">
              <span>{pdfWorkflowText(locale, 'metadata.removedAnnotations')}: {new Intl.NumberFormat(locale).format(report.removedAnnotations)}</span><span>{pdfWorkflowText(locale, 'metadata.removedAttachments')}: {new Intl.NumberFormat(locale).format(report.removedAttachments)}</span>
              <span>{pdfWorkflowText(locale, 'metadata.xmpAbsent')}: {pdfWorkflowText(locale, report.xmpAbsent ? 'common.yes' : 'common.no')}</span><span>{pdfWorkflowText(locale, 'metadata.actionsAbsent')}: {pdfWorkflowText(locale, report.activeActionsAbsent ? 'common.yes' : 'common.no')}</span>
              <span>{pdfWorkflowText(locale, 'metadata.revisionAbsent')}: {pdfWorkflowText(locale, report.incrementalHistoryAbsent ? 'common.yes' : 'common.no')}</span><span>{pdfWorkflowText(locale, 'metadata.annotationObjectsAbsent')}: {pdfWorkflowText(locale, report.annotationObjectsAbsent ? 'common.yes' : 'common.no')}</span>
              <span>{pdfWorkflowText(locale, 'metadata.removedForms')}: {new Intl.NumberFormat(locale).format(report.removedFormFields)}/{new Intl.NumberFormat(locale).format(report.originalFormFields)}</span><span>{pdfWorkflowText(locale, 'metadata.formDataAbsent')}: {pdfWorkflowText(locale, report.formDataAbsent ? 'common.yes' : 'common.no')}</span>
              <span>{pdfWorkflowText(locale, 'metadata.removedActions')}: {new Intl.NumberFormat(locale).format(report.removedActions)}/{new Intl.NumberFormat(locale).format(report.originalActions)}</span><span>{pdfWorkflowText(locale, 'metadata.actionsAbsent')}: {pdfWorkflowText(locale, report.activeActionsAbsent ? 'common.yes' : 'common.no')}</span>
              <span>{pdfWorkflowText(locale, 'metadata.removedHiddenText')}: {new Intl.NumberFormat(locale).format(report.removedHiddenTextItems)}/{new Intl.NumberFormat(locale).format(report.originalHiddenTextItems)}</span><span>{pdfWorkflowText(locale, 'metadata.hiddenTextAbsent')}: {pdfWorkflowText(locale, report.hiddenTextAbsent ? 'common.yes' : 'common.no')}</span>
              {report.foreignRasterFlattened ? <><span>{pdfWorkflowText(locale, 'metadata.flattened')}: {pdfWorkflowText(locale, 'common.yes')}</span><span>{pdfWorkflowText(locale, 'metadata.hiddenLayersAbsent')}: {pdfWorkflowText(locale, report.hiddenLayerStructuresAbsent ? 'common.yes' : 'common.no')}</span><span>{pdfWorkflowText(locale, 'metadata.detectedLayers')}: {new Intl.NumberFormat(locale).format(report.detectedHiddenLayerStructures ?? 0)}</span><span>{pdfWorkflowText(locale, 'metadata.alternateImagesAbsent')}: {pdfWorkflowText(locale, report.alternateImageStructuresAbsent ? 'common.yes' : 'common.no')}</span></> : null}
            </div>
            {report.attachmentInventory.length > 0 && <div className="pt-2 border-t border-white/10"><div className="flex items-center gap-1 text-slate-400"><Paperclip className="w-3 h-3" />{pdfWorkflowText(locale, 'metadata.attachmentInventory')}</div>{report.attachmentInventory.map((item) => <div key={`${item.page}-${item.sha256}`} className="font-mono text-slate-500 truncate">p{new Intl.NumberFormat(locale).format(item.page)} · {item.fileName} · {new Intl.NumberFormat(locale).format(item.byteLength)} B · {item.sha256.slice(0, 16)}…</div>)}</div>}
            {report.externalReferences.length > 0 && <div className="pt-2 border-t border-white/10"><div className="flex items-center gap-1 text-slate-400"><ExternalLink className="w-3 h-3" />{pdfWorkflowText(locale, 'metadata.externalReferences')}</div>{report.externalReferences.map((item) => <div key={`${item.scheme}-${item.host}`} className="font-mono text-slate-500">{item.scheme}://{item.host} · {new Intl.NumberFormat(locale).format(item.occurrences)}</div>)}</div>}
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs text-slate-400 hover:text-slate-200">{pdfWorkflowText(locale, 'common.close')}</button>
          <button type="button" onClick={exportSanitized} className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-lg shadow-amber-600/30 flex items-center space-x-1.5"><Download className="w-3.5 h-3.5" /><span>{pdfWorkflowText(locale, 'metadata.buildVerify')}</span></button>
        </div>
      </div>
    </div>
  );
};
