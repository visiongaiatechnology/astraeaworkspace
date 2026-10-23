// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — PDF.js canvas/text/annotation page renderer.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { NativeContrastMode, NativeFitMode, NativeRotation } from '../contracts/pdfNativeViewerState';
import type {
  PdfJsDisplayDocument,
  PdfJsDisplayModule,
  PdfJsDisplayPage,
  PdfJsOptionalContentConfig,
  PdfJsViewport,
} from '../contracts/pdfJsDisplayTypes';
import './pdfJsDisplay.css';
import { deliverExportBytes } from '../../../../shared/interchange/exportDelivery';

interface PdfJsPageViewProps {
  module: PdfJsDisplayModule;
  document: PdfJsDisplayDocument;
  pageNumber: number;
  fit: NativeFitMode;
  zoom: number;
  rotation: NativeRotation;
  contrast: NativeContrastMode;
  availableWidth: number;
  availableHeight: number;
  optionalContentConfig: PdfJsOptionalContentConfig;
  ocgRevision: number;
  searchQuery: string;
  /**
   * 0-based index of the match on this page the search cursor currently sits on, or null when this page is
   * not the active one. The viewer used to highlight every match equally, so "scroll to the finding" had no
   * target to scroll to.
   */
  activeSearchHit?: number | null;
  fieldObjects: Record<string, unknown[]> | null;
  hasJavaScriptActions: boolean;
  onNavigateDestination: (destination: unknown) => void | Promise<void>;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
  onNamedAction?: (action: string) => void;
  onOcgChanged?: () => void;
}

const MAX_CANVAS_DIMENSION = 16_384;
const MAX_CANVAS_PIXELS = 64 * 1024 * 1024;
/** Matches marked inside one page's text layer. One hostile page cannot mark unbounded DOM nodes. */
const MAX_MARKED_SEARCH_HITS = 2_000;

/**
 * Marks every match in the rendered text layer and scrolls the cursor's match into view.
 *
 * Returns the number of marked hits (capped), so the caller can compare it against the count the search
 * cursor derived from the text content: the two must agree, and a disagreement is a real signal that the
 * text layer and the text content have diverged.
 */
const applySearchHighlights = (container: HTMLElement, rawQuery: string, activeHit: number | null): number => {
  const query = rawQuery.trim();
  if (!query) return 0;
  const needle = query.toLocaleLowerCase();
  let marked = 0;
  let activeElement: HTMLElement | null = null;
  for (const span of Array.from(container.querySelectorAll<HTMLElement>('span'))) {
    const source = span.textContent ?? '';
    const haystack = source.toLocaleLowerCase();
    if (!haystack.includes(needle)) continue;
    span.classList.add('pdfjs-search-hit');
    span.dataset.searchMatch = query;
    // A span can carry more than one occurrence; the cursor counts occurrences, not spans.
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(needle, from);
      if (index < 0) break;
      if (marked === activeHit) activeElement = span;
      marked += 1;
      span.dataset.searchHitCount = String(marked);
      if (marked >= MAX_MARKED_SEARCH_HITS) break;
      from = index + needle.length;
    }
    if (marked >= MAX_MARKED_SEARCH_HITS) break;
  }
  if (activeElement) {
    activeElement.classList.add('pdfjs-search-hit-active');
    activeElement.dataset.searchHitActive = 'true';
    try {
      activeElement.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch {
      // A JSDOM-like environment without scrollIntoView must not break rendering.
    }
  }
  return marked;
};

const normalizeRotation = (pageRotation: number, viewRotation: number): number => {
  const normalized = ((pageRotation + viewRotation) % 360 + 360) % 360;
  return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
};

const computeScale = (
  page: PdfJsDisplayPage,
  fit: NativeFitMode,
  zoom: number,
  rotation: NativeRotation,
  availableWidth: number,
  availableHeight: number,
): { viewport: PdfJsViewport; cssScale: number } => {
  const combinedRotation = normalizeRotation(page.rotate, rotation);
  const base = page.getViewport({ scale: 1, rotation: combinedRotation });
  const boundedWidth = Math.max(160, availableWidth - 32);
  const boundedHeight = Math.max(160, availableHeight - 32);
  const widthScale = boundedWidth / Math.max(1, base.width);
  const pageScale = Math.min(widthScale, boundedHeight / Math.max(1, base.height));
  const cssScale = fit === 'width' ? widthScale : fit === 'page' ? pageScale : Math.max(0.1, Math.min(8, zoom / 100));
  return { viewport: page.getViewport({ scale: cssScale, rotation: combinedRotation }), cssScale };
};

const sanitizeDownloadName = (name: string): string => {
  const normalized = name.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return normalized.slice(0, 180) || 'attachment.bin';
};

export const PdfJsPageView: React.FC<PdfJsPageViewProps> = ({
  module,
  document,
  pageNumber,
  fit,
  zoom,
  rotation,
  contrast,
  availableWidth,
  availableHeight,
  optionalContentConfig,
  ocgRevision,
  searchQuery,
  activeSearchHit = null,
  fieldObjects,
  hasJavaScriptActions,
  onNavigateDestination,
  onOpenExternalUrl,
  onNamedAction,
  onOcgChanged,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PdfJsDisplayPage | null>(null);
  const [viewport, setViewport] = useState<PdfJsViewport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  /** Release Beta 0.1: attachment delivery is stated (saved vs download) instead of silently writing. */
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);

  const pageKey = useMemo(() => `${pageNumber}:${fit}:${zoom}:${rotation}:${availableWidth}:${availableHeight}:${ocgRevision}`, [pageNumber, fit, zoom, rotation, availableWidth, availableHeight, ocgRevision]);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setViewport(null);
    setError(null);
    void document.getPage(pageNumber).then((nextPage) => {
      if (cancelled) return;
      const computed = computeScale(nextPage, fit, zoom, rotation, availableWidth, availableHeight);
      if (!Number.isFinite(computed.viewport.width) || !Number.isFinite(computed.viewport.height) || computed.viewport.width <= 0 || computed.viewport.height <= 0) {
        throw new Error(`PDF.js returned invalid viewport geometry for page ${pageNumber}`);
      }
      setPage(nextPage);
      setViewport(computed.viewport);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'PDF page load failed');
    });
    return () => { cancelled = true; };
  }, [document, pageKey]);

  useEffect(() => {
    if (!page || !viewport) return undefined;
    const canvas = canvasRef.current;
    const textLayerContainer = textLayerRef.current;
    const annotationLayerContainer = annotationLayerRef.current;
    if (!canvas || !textLayerContainer || !annotationLayerContainer) return undefined;

    let cancelled = false;
    setRendering(true);
    setError(null);
    textLayerContainer.replaceChildren();
    annotationLayerContainer.replaceChildren();

    const deviceScale = Math.max(1, Math.min(2.5, globalThis.devicePixelRatio || 1));
    const pixelWidth = Math.ceil(viewport.width * deviceScale);
    const pixelHeight = Math.ceil(viewport.height * deviceScale);
    if (pixelWidth > MAX_CANVAS_DIMENSION || pixelHeight > MAX_CANVAS_DIMENSION || pixelWidth * pixelHeight > MAX_CANVAS_PIXELS) {
      setError('PDF page render exceeds the bounded canvas budget at the selected zoom');
      setRendering(false);
      return undefined;
    }
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    textLayerContainer.style.width = `${viewport.width}px`;
    textLayerContainer.style.height = `${viewport.height}px`;
    annotationLayerContainer.style.width = `${viewport.width}px`;
    annotationLayerContainer.style.height = `${viewport.height}px`;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      setError('2D canvas context is unavailable');
      setRendering(false);
      return undefined;
    }

    const optionalContentConfigPromise = Promise.resolve(optionalContentConfig);
    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      annotationMode: module.AnnotationMode.ENABLE_FORMS,
      transform: deviceScale === 1 ? null : [deviceScale, 0, 0, deviceScale, 0, 0],
      optionalContentConfigPromise,
      background: contrast === 'invert' ? '#000000' : '#ffffff',
    });
    const textLayer = new module.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: false }),
      container: textLayerContainer,
      viewport,
    });

    const saveAttachment = (content: Uint8Array, name: string) => {
      const fileName = sanitizeDownloadName(name);
      const extension = /\.[A-Za-z0-9]{1,12}$/u.test(fileName) ? fileName.split('.').pop()!.toLowerCase() : 'bin';
      // Release Beta 0.1: native save on the desktop; the browser fallback stays a download.
      void deliverExportBytes(content, {
        suggestedName: fileName,
        extensions: [extension],
        mimeType: 'application/octet-stream',
      }).then((delivery) => {
        setAttachmentNotice(delivery.mode === 'file'
          ? `Attachment saved: ${delivery.fileName}.`
          : `Attachment download started: ${delivery.fileName} (browser mode – no write confirmation).`);
      }).catch((reason: unknown) => {
        setAttachmentNotice(`Attachment export failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      });
    };

    const linkService = {
      eventBus: null,
      getDestinationHash: () => '#',
      getAnchorUrl: () => '#',
      goToDestination: (destination: unknown) => { void onNavigateDestination(destination); },
      executeNamedAction: (action: string) => onNamedAction?.(action),
      executeSetOCGState: (action: { state?: unknown[]; preserveRB?: boolean }) => {
        if (Array.isArray(action?.state)) {
          optionalContentConfig.setOCGState({ state: action.state, preserveRB: action.preserveRB });
          onOcgChanged?.();
        }
      },
      getAttachmentContent: (id: string) => document.getAttachmentContent(id),
      addLinkAttributes: (link: HTMLAnchorElement, rawUrl: string) => {
        link.href = '#';
        link.rel = 'noreferrer noopener';
        link.onclick = (event) => {
          event.preventDefault();
          try {
            const url = new URL(rawUrl);
            if (url.protocol !== 'https:' || url.username || url.password || url.toString().length > 2048) return false;
            void onOpenExternalUrl?.(url.toString());
          } catch {
            return false;
          }
          return false;
        };
      },
    };
    const downloadManager = {
      openOrDownloadData: (content: Uint8Array, filename: string) => saveAttachment(content, filename),
      downloadData: (content: Uint8Array, filename: string) => saveAttachment(content, filename),
    };

    const annotationLayer = new module.AnnotationLayer({
      div: annotationLayerContainer,
      page,
      viewport,
      linkService,
      annotationStorage: document.annotationStorage,
      annotationCanvasMap: new Map(),
    });

    void Promise.all([
      renderTask.promise,
      textLayer.render(),
      page.getAnnotations({ intent: 'display' }).then((annotations) => annotationLayer.render({
        annotations,
        optionalContentConfig,
        renderForms: true,
        downloadManager,
        enableScripting: false,
        hasJSActions: hasJavaScriptActions,
        fieldObjects,
      })),
    ]).then(() => {
      if (cancelled) return;
      applySearchHighlights(textLayerContainer, searchQuery, activeSearchHit);
      setRendering(false);
    }).catch((reason) => {
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : 'PDF page rendering failed');
        setRendering(false);
      }
    });

    return () => {
      cancelled = true;
      renderTask.cancel();
      textLayer.cancel();
      page.cleanup();
    };
  }, [page, viewport, module, document, optionalContentConfig, ocgRevision, contrast, fieldObjects, hasJavaScriptActions, onNavigateDestination, onOpenExternalUrl, onNamedAction, onOcgChanged, searchQuery, activeSearchHit]);

  if (error) return <div className="m-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3 text-xs text-rose-200">{error}</div>;
  if (!page || !viewport) return <div className="m-3 h-40 animate-pulse rounded-xl border border-white/10 bg-white/[0.025]" aria-label={`Loading PDF page ${pageNumber}`} />;

  return (
    <div className="relative mx-auto my-4 w-fit" data-pdf-rendered-page={pageNumber}>
      <div className="pdfjs-page-shell" data-contrast={contrast} style={{ width: viewport.width, height: viewport.height }}>
        <canvas ref={canvasRef} className="pdfjs-page-canvas" aria-label={`Rendered PDF page ${pageNumber}`} />
        <div ref={textLayerRef} className="pdfjs-text-layer" aria-label={`Selectable text for PDF page ${pageNumber}`} />
        <div ref={annotationLayerRef} className="pdfjs-annotation-layer" aria-label={`PDF annotations and forms for page ${pageNumber}`} />
        {rendering ? <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/20 text-[0.625rem] text-slate-500">Rendering page {pageNumber}…</div> : null}
      </div>
      {attachmentNotice && <div role="status" data-pdf-attachment-delivery="true" className="mx-auto mb-2 w-fit max-w-full break-words rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[0.625rem] text-emerald-200">{attachmentNotice}</div>}
      <div className="mt-1 text-center font-mono text-[0.5625rem] text-slate-600">{pageNumber}</div>
    </div>
  );
};
