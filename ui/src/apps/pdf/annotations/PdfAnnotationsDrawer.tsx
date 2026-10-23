// STATUS: DIAMANT VGT SUPREME
// Filterable review inventory with threaded replies, status workflow and bounded summary import/export.

import React, { useMemo, useState } from 'react';
import { Download, Info, MessageSquare, Search, Trash2, Upload, X } from 'lucide-react';
import type {
  PdfAnnotation,
  PdfAnnotationReviewStatus,
  PdfAnnotationType,
} from '../../../shared/contracts/workspace';
import {
  filterAndSortPdfAnnotations,
  type PdfAnnotationSort,
  type PdfReviewAnnotationDraft,
} from './pdfReviewAnnotations';
import { PdfReviewComposer } from './PdfReviewComposer';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PDF_ANNOTATION_COPY, pdfReviewImportFailureCopy } from './pdfAnnotationsLocale';

interface PdfAnnotationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: PdfAnnotation[];
  currentPage: number;
  totalPages: number;
  onScrollToPage: (page: number) => void;
  onDeleteAnnotation: (id: string) => void;
  onCreateAnnotation: (draft: PdfReviewAnnotationDraft) => void;
  onReply: (annotationId: string, text: string) => void;
  onSetStatus: (annotationId: string, status: PdfAnnotationReviewStatus) => void;
  onExportSummary: () => void;
  onImportSummary: (file: File) => Promise<void>;
}

const TYPE_OPTIONS: Array<PdfAnnotationType | 'all'> = [
  'all', 'highlight', 'underline', 'strike', 'comment', 'text-insert', 'text-replace', 'ink', 'shape',
  'text-box', 'callout', 'stamp', 'file-attachment', 'measurement',
];
const STATUS_OPTIONS: Array<PdfAnnotationReviewStatus | 'all'> = ['all', 'open', 'accepted', 'rejected', 'completed', 'cancelled'];

interface AnnotationCardProps {
  annotation: PdfAnnotation;
  onScrollToPage: (page: number) => void;
  onDelete: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onSetStatus: (id: string, status: PdfAnnotationReviewStatus) => void;
}

const AnnotationCard: React.FC<AnnotationCardProps> = ({ annotation, onScrollToPage, onDelete, onReply, onSetStatus }) => {
  const { locale } = useWorkspaceLocale();
  const { drawer: copy, annotationTypes, statuses } = PDF_ANNOTATION_COPY[locale];
  const [reply, setReply] = useState('');
  const createdAt = annotation.createdAt ? new Date(annotation.createdAt).toLocaleString(locale) : copy.unknownTime;
  const status = annotation.status ?? 'open';

  return (
    <article className="rounded-xl border border-white/[0.08] bg-slate-900/70 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 text-[0.625rem]">
        <button type="button" onClick={() => onScrollToPage(annotation.page)} className="font-mono text-blue-400 font-semibold hover:text-blue-300">
          {copy.pageAnnotation(annotation.page, annotationTypes[annotation.type])}
        </button>
        <button type="button" onClick={() => onDelete(annotation.id)} className="text-slate-500 hover:text-red-400 p-0.5 rounded" title={copy.deleteAnnotation} aria-label={copy.deleteAnnotation}>
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {annotation.text && <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{annotation.text}</p>}
      {annotation.targetText && <div className="text-[0.625rem] text-slate-400">{copy.target} <span className="text-slate-300">{annotation.targetText}</span></div>}
      {annotation.replacementText && <div className="text-[0.625rem] text-emerald-300">{copy.replacement} {annotation.replacementText}</div>}
      {annotation.stampLabel && <div className="inline-flex rounded border border-current px-2 py-0.5 text-[0.625rem] font-bold uppercase" style={{ color: annotation.color }}>{annotation.stampLabel}</div>}
      {annotation.measurement && <div className="text-[0.625rem] text-cyan-300">{copy.measurement} {annotation.measurement.value} {annotation.measurement.unit}{annotation.measurement.scaleLabel ? ` · ${annotation.measurement.scaleLabel}` : ''}</div>}
      {annotation.attachment && (
        <div className="rounded border border-white/10 bg-slate-950/70 p-2 text-[0.5625rem] text-slate-400">
          <div className="text-slate-300">{annotation.attachment.fileName} · {copy.attachmentBytes(annotation.attachment.byteLength)}</div>
          <div className="font-mono break-all">SHA-256 {annotation.attachment.sha256}</div>
          {!annotation.attachment.dataUrl && <div className="text-amber-300 mt-1">{copy.metadataOnly}</div>}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-white/[0.05] pt-2">
        <div className="text-[0.5625rem] text-slate-500 min-w-0"><span className="text-slate-400">{annotation.author || copy.localReviewer}</span> · {createdAt}</div>
        <select aria-label={copy.reviewStatus} value={status} onChange={(event) => onSetStatus(annotation.id, event.target.value as PdfAnnotationReviewStatus)} className="rounded bg-slate-950 border border-white/10 px-1.5 py-1 text-[0.5625rem] text-slate-300">
          {STATUS_OPTIONS.filter((entry) => entry !== 'all').map((entry) => <option key={entry} value={entry}>{statuses[entry]}</option>)}
        </select>
      </div>

      {(annotation.replies ?? []).length > 0 && (
        <div className="space-y-1.5 pl-2 border-l border-blue-500/20">
          {(annotation.replies ?? []).map((entry) => (
            <div key={entry.id} className="rounded bg-slate-950/60 p-2 text-[0.625rem]">
              <div className="text-slate-200 whitespace-pre-wrap break-words">{entry.text}</div>
              <div className="mt-1 text-[0.5625rem] text-slate-500">{entry.author} · {new Date(entry.createdAt).toLocaleString(locale)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <input aria-label={copy.replyPlaceholder} value={reply} maxLength={32_000} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && reply.trim()) {
            event.preventDefault();
            onReply(annotation.id, reply);
            setReply('');
          }
        }} placeholder={copy.replyPlaceholder} className="min-w-0 flex-1 rounded bg-slate-950 border border-white/10 px-2 py-1.5 text-[0.625rem] text-slate-200" />
        <button type="button" disabled={!reply.trim()} onClick={() => { onReply(annotation.id, reply); setReply(''); }} className="rounded border border-blue-500/30 bg-blue-500/10 px-2 text-[0.625rem] text-blue-200 disabled:opacity-40">{copy.reply}</button>
      </div>
    </article>
  );
};

export const PdfAnnotationsDrawer: React.FC<PdfAnnotationsDrawerProps> = ({
  isOpen,
  onClose,
  annotations,
  currentPage,
  totalPages,
  onScrollToPage,
  onDeleteAnnotation,
  onCreateAnnotation,
  onReply,
  onSetStatus,
  onExportSummary,
  onImportSummary,
}) => {
  const { locale } = useWorkspaceLocale();
  const { drawer: copy, annotationTypes, statuses } = PDF_ANNOTATION_COPY[locale];
  const [query, setQuery] = useState('');
  const [type, setType] = useState<PdfAnnotationType | 'all'>('all');
  const [status, setStatus] = useState<PdfAnnotationReviewStatus | 'all'>('all');
  const [page, setPage] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<PdfAnnotationSort>('newest');
  const [showComposer, setShowComposer] = useState(false);
  const [importError, setImportError] = useState('');

  const visible = useMemo(() => filterAndSortPdfAnnotations(annotations, { query, type, status, page, sort }), [annotations, page, query, sort, status, type]);

  if (!isOpen) return null;

  return (
    <aside data-pdf-studio-sidebar="review" className="w-full max-w-[min(360px,92vw)] bg-slate-950 border-l border-white/[0.08] flex flex-col p-4 space-y-3 shrink-0" aria-label={copy.accessibleName}>
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <span className="min-w-0 break-words text-xs font-bold text-slate-200 uppercase tracking-wider">{copy.heading(annotations.length)}</span>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label={copy.close}><X className="w-4 h-4" /></button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3 h-3 text-slate-500" />
          <input aria-label={copy.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="w-full rounded-lg bg-slate-900 border border-white/10 py-2 pl-7 pr-2 text-[0.625rem] text-slate-200" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={copy.typeFilter} value={type} onChange={(event) => setType(event.target.value as PdfAnnotationType | 'all')} className="rounded bg-slate-900 border border-white/10 p-1.5 text-[0.625rem] text-slate-300">{TYPE_OPTIONS.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? copy.allTypes : annotationTypes[entry]}</option>)}</select>
          <select aria-label={copy.statusFilter} value={status} onChange={(event) => setStatus(event.target.value as PdfAnnotationReviewStatus | 'all')} className="rounded bg-slate-900 border border-white/10 p-1.5 text-[0.625rem] text-slate-300">{STATUS_OPTIONS.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? copy.allStatuses : statuses[entry]}</option>)}</select>
          <select aria-label={copy.pageFilter} value={page} onChange={(event) => setPage(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="rounded bg-slate-900 border border-white/10 p-1.5 text-[0.625rem] text-slate-300"><option value="all">{copy.allPages}</option>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <option key={number} value={number}>{copy.sort.page} {number}</option>)}</select>
          <select aria-label={copy.sortFilter} value={sort} onChange={(event) => setSort(event.target.value as PdfAnnotationSort)} className="rounded bg-slate-900 border border-white/10 p-1.5 text-[0.625rem] text-slate-300"><option value="newest">{copy.sort.newest}</option><option value="oldest">{copy.sort.oldest}</option><option value="page">{copy.sort.page}</option><option value="author">{copy.sort.author}</option><option value="type">{copy.sort.type}</option></select>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => setShowComposer((value) => !value)} className="min-w-0 break-words rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1.5 text-[0.625rem] text-blue-200">{showComposer ? copy.hideEditor : copy.newMark}</button>
          <button type="button" onClick={onExportSummary} className="min-w-0 break-words flex items-center justify-center gap-1 rounded border border-white/10 px-2 py-1.5 text-[0.625rem] text-slate-300"><Download className="w-3 h-3 shrink-0" /> {copy.summary}</button>
          <label className="min-w-0 break-words flex items-center justify-center gap-1 rounded border border-white/10 px-2 py-1.5 text-[0.625rem] text-slate-300 cursor-pointer"><Upload className="w-3 h-3 shrink-0" /> {copy.import}<input type="file" accept="application/json,.json" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            setImportError('');
            void onImportSummary(file).catch((cause: unknown) => setImportError(pdfReviewImportFailureCopy(locale, cause)));
          }} /></label>
        </div>
        {importError && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[0.625rem] text-red-200">{importError}</div>}
      </div>

      {showComposer && <PdfReviewComposer currentPage={currentPage} totalPages={totalPages} onCreate={onCreateAnnotation} />}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {visible.map((annotation) => <AnnotationCard key={annotation.id} annotation={annotation} onScrollToPage={onScrollToPage} onDelete={onDeleteAnnotation} onReply={onReply} onSetStatus={onSetStatus} />)}
        {visible.length === 0 && (
          <div className="text-center py-10 text-xs text-slate-500 space-y-2"><Info className="w-6 h-6 mx-auto text-slate-600" /><p>{copy.empty}</p></div>
        )}
      </div>
    </aside>
  );
};
