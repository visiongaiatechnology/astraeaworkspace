import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Download, FileDiff, X } from 'lucide-react';
import type { PdfPageModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  compareStructuredPdfDocuments,
  computeSynchronizedScrollTop,
  serializePdfCompareReport,
  type PdfCompareCategory,
  type PdfCompareDifference,
  type PdfCompareResult,
} from './pdfCompare';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';
import { deliverExportText } from '../../../shared/interchange/exportDelivery';
import { pdfExportDeliveryText, pdfExportFailureText } from '../interchange/pdfExportStatus';

interface PdfCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: WorkspaceDocument;
  workspaceDocuments: WorkspaceDocument[];
}

const CATEGORY_COPY_KEYS = {
  text: 'compare.category.text',
  'page-meta': 'compare.category.pageMeta',
  decorations: 'compare.category.decorations',
  annotations: 'compare.category.annotations',
  forms: 'compare.category.forms',
  redactions: 'compare.category.redactions',
} as const satisfies Record<PdfCompareCategory, PdfWorkflowCopyKey>;

const CHANGE_COPY_KEYS = {
  inserted: 'compare.change.inserted',
  deleted: 'compare.change.deleted',
  changed: 'compare.change.changed',
  moved: 'compare.change.moved',
} as const satisfies Record<PdfCompareDifference['kind'], PdfWorkflowCopyKey>;

const SECTION_COPY_KEYS = {
  header: 'compare.section.header',
  paragraph: 'compare.section.paragraph',
  callout: 'compare.section.callout',
  table: 'compare.section.table',
  'key-value': 'compare.section.keyValue',
} as const satisfies Record<PdfPageModel['sections'][number]['type'], PdfWorkflowCopyKey>;

const CATEGORIES: PdfCompareCategory[] = [
  'text', 'page-meta', 'decorations', 'annotations', 'forms', 'redactions',
];

/** Release Beta 0.1: native save on the desktop; the browser fallback stays a download. */
function deliverCompareReport(fileName: string, content: string, mimeType: string) {
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'txt';
  return deliverExportText(content, { suggestedName: fileName, extensions: [extension], mimeType });
}

function relevantDifferences(result: PdfCompareResult, pageNumber: number): PdfCompareDifference[] {
  return result.differences.filter((difference) => difference.pageBefore === pageNumber || difference.pageAfter === pageNumber);
}

function sectionDifference(result: PdfCompareResult, pageNumber: number, sectionId: string): PdfCompareDifference | undefined {
  return result.differences.find((difference) =>
    difference.category === 'text'
      && difference.sectionId === sectionId
      && (difference.pageBefore === pageNumber || difference.pageAfter === pageNumber)
  );
}

function diffBorder(kind: PdfCompareDifference['kind'] | undefined): string {
  if (kind === 'inserted') return 'border-emerald-500/60 bg-emerald-500/10';
  if (kind === 'deleted') return 'border-rose-500/60 bg-rose-500/10';
  if (kind === 'changed') return 'border-amber-500/60 bg-amber-500/10';
  if (kind === 'moved') return 'border-blue-500/60 bg-blue-500/10';
  return 'border-white/5 bg-white/[0.02]';
}

const ComparePage: React.FC<{ page: PdfPageModel; result: PdfCompareResult; side: 'before' | 'after'; locale: Parameters<typeof pdfWorkflowText>[0] }> = ({ page, result, side, locale }) => {
  const pageDiffs = relevantDifferences(result, page.pageNumber);
  const pageLabel = pdfWorkflowText(locale, 'compare.pageLabel', { page: page.pageLabel || page.pageNumber });
  return (
    <article className="mx-auto mb-4 w-full max-w-xl rounded-xl border border-white/10 bg-white p-5 text-slate-950 shadow-xl" aria-label={pdfWorkflowText(locale, side === 'before' ? 'compare.pageAria.source' : 'compare.pageAria.target', { page: page.pageNumber })}>
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <div className="text-[0.625rem] font-mono uppercase text-slate-500">{pageLabel}</div>
          <h4 className="font-semibold">{page.title || pageLabel}</h4>
          {page.subtitle && <p className="text-xs text-slate-500">{page.subtitle}</p>}
        </div>
        {pageDiffs.length > 0 && <span className="rounded-full bg-slate-900 px-2 py-1 text-[0.625rem] font-bold text-white">{pdfWorkflowText(locale, 'compare.diffCount', { count: pageDiffs.length })}</span>}
      </div>
      <div className="space-y-2">
        {page.sections.map((section) => {
          const difference = sectionDifference(result, page.pageNumber, section.id);
          const visibleForSide = !difference
            || difference.kind === 'changed'
            || difference.kind === 'moved'
            || (side === 'before' && difference.kind === 'deleted')
            || (side === 'after' && difference.kind === 'inserted');
          if (!visibleForSide) return null;
          return (
            <section key={section.id} className={`rounded-lg border px-3 py-2 text-sm ${diffBorder(difference?.kind)}`} data-compare-section-id={section.id}>
              <div className="mb-1 flex items-center justify-between text-[0.5625rem] font-mono uppercase text-slate-500">
                <span>{pdfWorkflowText(locale, SECTION_COPY_KEYS[section.type])}</span>
                {difference && <span className="font-bold">{pdfWorkflowText(locale, CHANGE_COPY_KEYS[difference.kind])}</span>}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{section.content}</div>
            </section>
          );
        })}
      </div>
    </article>
  );
};

export const PdfCompareModal: React.FC<PdfCompareModalProps> = ({ isOpen, onClose, source, workspaceDocuments }) => {
  const { locale } = useWorkspaceLocale();
  const candidates = useMemo(
    () => workspaceDocuments.filter((doc) => doc.id !== source.id && doc.kind === 'PdfStudio' && doc.pdfData?.pages?.length && !doc.pdfData.rawPdfDataUrl),
    [source.id, workspaceDocuments]
  );
  const [targetId, setTargetId] = useState('');
  const [ignored, setIgnored] = useState<PdfCompareCategory[]>([]);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const target = candidates.find((doc) => doc.id === targetId) ?? candidates[0];
  const sourcePdf = source.pdfData;
  const targetPdf = target?.pdfData;
  const downloadReport = async (fileName: string, content: string, mimeType: string) => {
    try {
      const delivery = await deliverCompareReport(fileName, content, mimeType);
      setDeliveryNotice(pdfExportDeliveryText(locale, delivery));
      setDeliveryError(null);
    } catch (error) {
      setDeliveryError(pdfExportFailureText(locale, error));
      setDeliveryNotice(null);
    }
  };

  const comparison = useMemo((): { result: PdfCompareResult | null; failed: boolean } => {
    if (!isOpen || !sourcePdf || !targetPdf) return { result: null, failed: false };
    try {
      return { result: compareStructuredPdfDocuments(source.title, sourcePdf, target.title, targetPdf, {
        ignoreCategories: ignored,
        ignoreWhitespace,
        ignoreCase,
      }), failed: false };
    } catch {
      return { result: null, failed: true };
    }
  }, [ignoreCase, ignoreWhitespace, ignored, isOpen, source.title, sourcePdf, target?.title, targetPdf]);
  const { result } = comparison;

  if (!isOpen) return null;

  const syncScroll = (from: 'left' | 'right') => {
    if (syncingRef.current) return;
    const sourceEl = from === 'left' ? leftRef.current : rightRef.current;
    const targetEl = from === 'left' ? rightRef.current : leftRef.current;
    if (!sourceEl || !targetEl) return;
    syncingRef.current = true;
    targetEl.scrollTop = computeSynchronizedScrollTop(
      sourceEl.scrollTop,
      sourceEl.scrollHeight,
      sourceEl.clientHeight,
      targetEl.scrollHeight,
      targetEl.clientHeight
    );
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  const toggleIgnored = (category: PdfCompareCategory) => {
    setIgnored((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  };

  const baseFileName = `${(source.title || 'source').replace(/[^a-z0-9._-]+/giu, '_')}_vs_${(target?.title || 'target').replace(/[^a-z0-9._-]+/giu, '_')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="pdf-compare-title">
      <div className="vgt-dialog-scroll-surface h-[92vh] max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#0b0f17] shadow-2xl flex">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-300"><FileDiff className="h-5 w-5" /><h3 id="pdf-compare-title" className="font-bold">{pdfWorkflowText(locale, 'compare.title')}</h3></div>
            <p className="mt-1 text-xs text-slate-400">{pdfWorkflowText(locale, 'compare.intro')}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={pdfWorkflowText(locale, 'compare.close')}><X className="h-4 w-4" /></button>
        </header>

        <div className="shrink-0 border-b border-white/10 bg-slate-950/70 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_2fr_auto]">
            <label className="space-y-1 text-xs"><span className="font-semibold text-slate-300">{pdfWorkflowText(locale, 'compare.compareAgainst')}</span><select aria-label={pdfWorkflowText(locale, 'compare.compareAgainst')} value={target?.id ?? ''} onChange={(event) => setTargetId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100">{candidates.length === 0 && <option value="">{pdfWorkflowText(locale, 'compare.noTarget')}</option>}{candidates.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>
            <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 px-3 py-2 text-[0.6875rem]"><legend className="px-1 text-slate-500">{pdfWorkflowText(locale, 'compare.ignoreCategories')}</legend>{CATEGORIES.map((category) => <label key={category} className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={ignored.includes(category)} onChange={() => toggleIgnored(category)} />{pdfWorkflowText(locale, CATEGORY_COPY_KEYS[category])}</label>)}</fieldset>
            <div className="flex items-end gap-2 text-[0.6875rem]"><label className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-2 text-slate-300"><input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} />{pdfWorkflowText(locale, 'compare.ignoreWhitespace')}</label><label className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-2 text-slate-300"><input type="checkbox" checked={ignoreCase} onChange={(event) => setIgnoreCase(event.target.checked)} />{pdfWorkflowText(locale, 'compare.ignoreCase')}</label></div>
          </div>

          {result && <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.625rem] font-mono"><span className="rounded bg-white/5 px-2 py-1 text-slate-300">{pdfWorkflowText(locale, 'compare.summary.total', { count: result.summary.total })}</span><span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300">+ {pdfWorkflowText(locale, 'compare.summary.inserted', { count: result.summary.inserted })}</span><span className="rounded bg-rose-500/10 px-2 py-1 text-rose-300">− {pdfWorkflowText(locale, 'compare.summary.deleted', { count: result.summary.deleted })}</span><span className="rounded bg-amber-500/10 px-2 py-1 text-amber-300">Δ {pdfWorkflowText(locale, 'compare.summary.changed', { count: result.summary.changed })}</span><span className="rounded bg-blue-500/10 px-2 py-1 text-blue-300">↔ {pdfWorkflowText(locale, 'compare.summary.moved', { count: result.summary.moved })}</span><span className="rounded bg-white/5 px-2 py-1 text-slate-300">{pdfWorkflowText(locale, 'compare.summary.pages', { count: result.summary.pagesTouched })}</span><div className="ml-auto flex gap-2"><button type="button" onClick={() => { void downloadReport(`${baseFileName}.compare.json`, serializePdfCompareReport(result, 'json'), 'application/json'); }} className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-200"><Download className="h-3 w-3" />{pdfWorkflowText(locale, 'compare.export.json')}</button><button type="button" onClick={() => { void downloadReport(`${baseFileName}.compare.html`, serializePdfCompareReport(result, 'html'), 'text/html'); }} className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-200"><Download className="h-3 w-3" />{pdfWorkflowText(locale, 'compare.export.html')}</button></div></div>}
          {deliveryNotice && <div role="status" data-pdf-compare-delivery="true" className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[0.625rem] text-emerald-200">{deliveryNotice}</div>}
          {deliveryError && <div role="alert" data-pdf-compare-delivery-error="true" className="mt-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[0.625rem] text-rose-200">{deliveryError}</div>}
        </div>

        {!sourcePdf || !targetPdf || !result ? (
          <div role={comparison.failed ? 'alert' : 'status'} className="flex flex-1 items-center justify-center p-6 text-sm text-slate-400">{comparison.failed ? pdfWorkflowText(locale, 'compare.error') : pdfWorkflowText(locale, 'compare.empty')}</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-white/10">
            <section aria-label={pdfWorkflowText(locale, 'compare.side.source')} className="flex min-h-0 flex-col"><div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold text-slate-200"><ArrowLeftRight className="h-3.5 w-3.5 text-cyan-400" />{pdfWorkflowText(locale, 'compare.side.source')} · {source.title}</div><div ref={leftRef} onScroll={() => syncScroll('left')} className="min-h-0 flex-1 overflow-y-auto bg-slate-900/60 p-4">{sourcePdf.pages.map((page) => <ComparePage key={`before-${page.pageNumber}`} page={page} result={result} side="before" locale={locale} />)}</div></section>
            <section aria-label={pdfWorkflowText(locale, 'compare.side.target')} className="flex min-h-0 flex-col"><div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold text-slate-200"><ArrowLeftRight className="h-3.5 w-3.5 text-cyan-400" />{pdfWorkflowText(locale, 'compare.side.target')} · {target.title}</div><div ref={rightRef} onScroll={() => syncScroll('right')} className="min-h-0 flex-1 overflow-y-auto bg-slate-900/60 p-4">{targetPdf.pages.map((page) => <ComparePage key={`after-${page.pageNumber}`} page={page} result={result} side="after" locale={locale} />)}</div></section>
          </div>
        )}
      </div>
    </div>
  );
};
