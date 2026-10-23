// STATUS: DIAMANT VGT SUPREME
// Parser-backed foreign-PDF navigation. No PDF content triggers network access automatically.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FileSearch, Link2, ListTree, Paperclip, Search } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PDF_NAVIGATION_COPY, pdfNavigationFailureCopy } from '../pdfNavigationLocale';
import { deliverExportBytes } from '../../../../shared/interchange/exportDelivery';
import { pdfExportDeliveryText, pdfExportFailureText } from '../../interchange/pdfExportStatus';
import type { PdfJsAttachment, PdfJsDocumentSnapshot, PdfJsLink, PdfJsSearchHit, PdfJsWorkerDocument } from '../../../../platform/documents/pdfjs/pdfJsWorkerClient';

interface PdfJsDocumentNavigatorProps {
  document: PdfJsWorkerDocument | null;
  snapshot: PdfJsDocumentSnapshot;
  currentPage: number;
  onNavigatePage: (page: number) => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
}

interface OutlineRow {
  key: string;
  title: string;
  destination: unknown | null;
  url: string | null;
  depth: number;
}

const flattenOutline = (outline: unknown[] | null): OutlineRow[] => {
  if (!outline) return [];
  const result: OutlineRow[] = [];
  const walk = (items: unknown[], depth: number, prefix: string) => {
    for (let index = 0; index < items.length; index += 1) {
      const candidate = items[index];
      if (!candidate || typeof candidate !== 'object') continue;
      const record = candidate as Record<string, unknown>;
      const key = `${prefix}-${index}`;
      result.push({
        key,
        title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : `Bookmark ${result.length + 1}`,
        destination: record.dest ?? null,
        url: typeof record.url === 'string' ? record.url : null,
        depth: Math.min(depth, 12),
      });
      if (Array.isArray(record.items) && depth < 12) walk(record.items, depth + 1, key);
    }
  };
  walk(outline, 0, 'outline');
  return result;
};

const sanitizeAttachmentName = (name: string): string => {
  const sanitized = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 180).trim();
  return sanitized || 'attachment.bin';
};

const SearchMatch: React.FC<{ hit: PdfJsSearchHit }> = ({ hit }) => (
  <span className="break-words">
    {hit.text.slice(0, hit.start)}
    <mark className="rounded bg-amber-400/30 px-0.5 text-amber-100">{hit.text.slice(hit.start, hit.end)}</mark>
    {hit.text.slice(hit.end)}
  </span>
);

export const PdfJsDocumentNavigator: React.FC<PdfJsDocumentNavigatorProps> = ({
  document,
  snapshot,
  currentPage,
  onNavigatePage,
  onOpenExternalUrl,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PDF_NAVIGATION_COPY[locale].navigation;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const outlines = useMemo(() => flattenOutline(snapshot.outline), [snapshot.outline]);
  const [attachments, setAttachments] = useState<PdfJsAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [links, setLinks] = useState<PdfJsLink[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PdfJsSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [navStatus, setNavStatus] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    setAttachments([]);
    setAttachmentError(null);
    if (!document) return () => { cancelled = true; };
    void document.getAttachments().then((next) => {
      if (!cancelled) setAttachments(next);
    }).catch((error) => {
      if (!cancelled) setAttachmentError(pdfNavigationFailureCopy(localeRef.current, 'attachments', error));
    });
    return () => { cancelled = true; };
  }, [document, snapshot.attachments]);

  useEffect(() => {
    let cancelled = false;
    setLinks([]);
    setLinkError(null);
    if (!document) return () => { cancelled = true; };
    void document.getLinks(currentPage).then((next) => {
      if (!cancelled) setLinks(next);
    }).catch((error) => {
      if (!cancelled) setLinkError(pdfNavigationFailureCopy(localeRef.current, 'links', error));
    });
    return () => { cancelled = true; };
  }, [currentPage, document]);

  const navigateDestination = async (destination: unknown) => {
    if (!document) return;
    try {
      const target = await document.resolveDestinationPage(destination);
      if (!target) {
        setNavStatus(copy.destinationFailed);
        return;
      }
      setNavStatus(null);
      onNavigatePage(target);
    } catch (error) {
      setNavStatus(pdfNavigationFailureCopy(locale, 'destination', error));
    }
  };

  const openExternal = async (rawUrl: string) => {
    if (!onOpenExternalUrl) {
      setNavStatus(copy.externalUnavailable);
      return;
    }
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.toString().length > 2048) {
        setNavStatus(copy.externalBlocked);
        return;
      }
      setNavStatus(copy.externalOpening(url.hostname));
      await onOpenExternalUrl(url.toString());
      setNavStatus(null);
    } catch (error) {
      setNavStatus(pdfNavigationFailureCopy(locale, 'external', error));
    }
  };

  /** Release Beta 0.1: native save on the desktop; the browser fallback stays a download. */
  const saveAttachment = async (name: string, content: Uint8Array) => {
    const fileName = sanitizeAttachmentName(name);
    const extension = /\.[A-Za-z0-9]{1,12}$/u.test(fileName) ? fileName.split('.').pop()!.toLowerCase() : 'bin';
    try {
      const delivery = await deliverExportBytes(content, {
        suggestedName: fileName,
        extensions: [extension],
        mimeType: 'application/octet-stream',
      });
      setNavStatus(pdfExportDeliveryText(locale, delivery));
    } catch (error) {
      setNavStatus(pdfExportFailureText(locale, error));
    }
  };

  const runSearch = async () => {
    const needle = query.trim();
    if (!document || !needle) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setSearchResults(await document.search(needle));
    } catch (error) {
      setSearchResults([]);
      setSearchError(pdfNavigationFailureCopy(locale, 'search', error));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mt-3 space-y-2" aria-label={copy.title}>
      {navStatus ? <div className="rounded border border-amber-500/20 bg-amber-500/[0.05] p-1.5 text-[0.5625rem] text-amber-200">{navStatus}</div> : null}

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300"><ListTree className="h-3 w-3 text-cyan-400" />{copy.bookmarks}</div>
        {outlines.length ? (
          <div className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto">
            {outlines.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => item.destination ? void navigateDestination(item.destination) : item.url ? void openExternal(item.url) : undefined}
                disabled={!item.destination && !item.url}
                className="block w-full rounded px-1.5 py-1 text-left text-[0.5625rem] text-slate-300 hover:bg-white/[0.05] disabled:text-slate-600"
                style={{ paddingLeft: `${6 + item.depth * 10}px` }}
              >{item.title}</button>
            ))}
          </div>
        ) : <div className="mt-1 text-[0.5625rem] text-slate-600">{copy.noOutline}</div>}
      </section>

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300"><Link2 className="h-3 w-3 text-violet-400" />{copy.linksOnPage(currentPage)}</div>
        {linkError ? <div className="mt-1 text-[0.5625rem] text-amber-200">{linkError}</div> : links.length ? (
          <div className="mt-1.5 space-y-1">
            {links.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => link.targetPage ? onNavigatePage(link.targetPage) : link.destination ? void navigateDestination(link.destination) : link.url ? void openExternal(link.url) : undefined}
                disabled={!link.targetPage && !link.destination && !link.url}
                className="flex w-full items-center justify-between gap-2 rounded border border-white/[0.05] px-1.5 py-1 text-left text-[0.5625rem] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-40"
              >
                <span className="truncate">{link.title}</span>
                {link.targetPage ? <span className="shrink-0 font-mono text-cyan-300">p.{link.targetPage}</span> : link.url ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
              </button>
            ))}
          </div>
        ) : <div className="mt-1 text-[0.5625rem] text-slate-600">{copy.noLinks}</div>}
      </section>

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300"><Paperclip className="h-3 w-3 text-emerald-400" />{copy.attachments}</div>
        {attachmentError ? <div className="mt-1 text-[0.5625rem] text-amber-200">{attachmentError}</div> : attachments.length ? (
          <div className="mt-1.5 space-y-1">
            {attachments.map((attachment) => (
              <div key={attachment.name} className="flex items-center justify-between gap-2 rounded border border-white/[0.05] px-1.5 py-1">
                <div className="min-w-0"><div className="truncate text-[0.5625rem] text-slate-300">{attachment.name}</div><div className="font-mono text-[0.5rem] text-slate-600">{attachment.content.byteLength.toLocaleString()} B</div></div>
                <button type="button" onClick={() => { void saveAttachment(attachment.name, attachment.content); }} className="native-control rounded p-1 text-slate-400 hover:bg-white/[0.05] hover:text-white" aria-label={copy.saveAttachment} title={copy.saveAttachment}><Download className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        ) : <div className="mt-1 text-[0.5625rem] text-slate-600">{copy.noAttachments}</div>}
      </section>

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-slate-300"><FileSearch className="h-3 w-3 text-amber-400" />{copy.localSearch}</div>
        <div className="mt-1.5 flex gap-1">
          <input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 256))} onKeyDown={(event) => { if (event.key === 'Enter') void runSearch(); }} className="min-w-0 flex-1 rounded border border-white/10 bg-black/20 px-1.5 py-1 text-[0.5625rem] text-slate-200 outline-none focus:border-amber-400/40" placeholder={copy.searchPlaceholder} aria-label={copy.searchPlaceholder} />
          <button type="button" disabled={searching || !query.trim()} onClick={() => void runSearch()} className="native-control rounded border border-white/10 p-1.5 text-slate-300 disabled:opacity-40" aria-label={copy.search} title={copy.search}><Search className="h-3 w-3" /></button>
        </div>
        {searchError ? <div className="mt-1 text-[0.5625rem] text-amber-200">{searchError}</div> : null}
        {!searching && query.trim() ? <div className="mt-1 text-[0.5rem] text-slate-600">{copy.parsedMatches(searchResults.length.toLocaleString(), searchResults.length >= 10_000)}</div> : null}
        {searchResults.length ? (
          <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {searchResults.slice(0, 250).map((hit, index) => (
              <button key={`${hit.pageNumber}-${hit.itemIndex}-${hit.start}-${index}`} type="button" onClick={() => onNavigatePage(hit.pageNumber)} className="block w-full rounded border border-white/[0.05] px-1.5 py-1 text-left text-[0.5625rem] text-slate-400 hover:bg-white/[0.05]">
                <span className="mr-1 font-mono text-cyan-300">p.{hit.pageNumber}</span><SearchMatch hit={hit} />
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};
