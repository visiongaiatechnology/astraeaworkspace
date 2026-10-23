// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — tagged-document reading/reflow surface backed by PDF.js text + structure data.

import React, { useEffect, useRef, useState } from 'react';
import type { PdfJsDisplayDocument } from '../contracts/pdfJsDisplayTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PDF_NAVIGATION_COPY, pdfNavigationFailureCopy } from '../pdfNavigationLocale';

interface PdfJsReflowViewProps {
  document: PdfJsDisplayDocument;
  pageNumbers: number[];
}

interface ReflowPage {
  pageNumber: number;
  tagged: boolean;
  paragraphs: string[];
}

const MAX_REFLOW_TEXT_PER_PAGE = 4 * 1024 * 1024;
const MAX_REFLOW_PARAGRAPHS_PER_PAGE = 20_000;

const textItemString = (candidate: unknown): { text: string; eol: boolean } | null => {
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  if (typeof record.str !== 'string') return null;
  return { text: record.str, eol: record.hasEOL === true };
};

const buildParagraphs = (items: unknown[]): string[] => {
  const paragraphs: string[] = [];
  let current = '';
  let textBytes = 0;
  for (const candidate of items) {
    const item = textItemString(candidate);
    if (!item) continue;
    textBytes += item.text.length;
    if (textBytes > MAX_REFLOW_TEXT_PER_PAGE) throw new Error('PDF reflow text exceeded the per-page safety budget');
    current += item.text;
    if (item.eol) {
      const trimmed = current.trim();
      if (trimmed) paragraphs.push(trimmed);
      current = '';
    } else if (item.text && !/\s$/.test(item.text)) {
      current += ' ';
    }
    if (paragraphs.length > MAX_REFLOW_PARAGRAPHS_PER_PAGE) throw new Error('PDF reflow paragraph count exceeded the per-page safety budget');
  }
  const trimmed = current.trim();
  if (trimmed) paragraphs.push(trimmed);
  return paragraphs;
};

export const PdfJsReflowView: React.FC<PdfJsReflowViewProps> = ({ document, pageNumbers }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PDF_NAVIGATION_COPY[locale].reflow;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [pages, setPages] = useState<ReflowPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setError(null);
    void (async () => {
      const next: ReflowPage[] = [];
      for (const pageNumber of pageNumbers) {
        const page = await document.getPage(pageNumber);
        const [structure, text] = await Promise.all([
          page.getStructTree(),
          page.getTextContent({ includeMarkedContent: true, disableNormalization: false }),
        ]);
        next.push({ pageNumber, tagged: structure !== null, paragraphs: buildParagraphs(text.items) });
      }
      if (!cancelled) setPages(next);
    })().catch((reason) => {
      if (!cancelled) setError(pdfNavigationFailureCopy(localeRef.current, 'reflow', reason));
    });
    return () => { cancelled = true; };
  }, [document, pageNumbers.join(',')]);

  if (error) return <div role="alert" className="m-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200">{error}</div>;
  if (!pages.length) return <div className="p-4 text-xs text-slate-500">{copy.building}</div>;

  const hasTaggedPage = pages.some((page) => page.tagged);
  if (!hasTaggedPage) {
    return <div className="m-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">{copy.taggedUnavailable}</div>;
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-8 text-[0.9375rem] leading-7 text-slate-200" data-pdf-reflow="tagged">
      {pages.map((page) => (
        <section key={page.pageNumber} aria-label={copy.pageAria(page.pageNumber)} className="mb-10">
          <div className="mb-3 border-b border-white/10 pb-2 text-[0.625rem] font-mono uppercase tracking-wider text-slate-500">{copy.pageLabel(page.pageNumber, page.tagged)}</div>
          {page.paragraphs.length ? page.paragraphs.map((paragraph, index) => <p key={`${page.pageNumber}-${index}`} className="mb-3 whitespace-pre-wrap">{paragraph}</p>) : <p className="text-slate-500">{copy.noReadableText}</p>}
        </section>
      ))}
    </article>
  );
};
