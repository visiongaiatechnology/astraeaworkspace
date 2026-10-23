import React, { useState } from 'react';
import { PdfPageModel, PdfSectionModel, PdfAnnotation, PdfPageBox, PdfFormField } from '../../../shared/contracts/workspace';
import { ActiveTool } from '../studio/types';
import { Search, X, FileText } from 'lucide-react';
import { PdfReviewOverlay } from './annotations/PdfReviewOverlay';
import { PdfStructuredFlowLayer } from './layers/PdfStructuredFlowLayer';
import { PdfPositionedSection } from '../editing/PdfPositionedSection';
import { PdfPageInteractiveOverlay } from './interactions/PdfPageInteractiveOverlay';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PDF_NAVIGATION_COPY } from './pdfNavigationLocale';

interface PdfViewportProps {
  pages: PdfPageModel[];
  annotations: PdfAnnotation[];
  formFields: PdfFormField[];
  zoomLevel: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeTool: ActiveTool;
  onStageSectionRedaction: (pageNumber: number, section: PdfSectionModel) => void;
  onStageImageRedaction: (pageNumber: number, imageId: string, rectangle: PdfPageBox) => void;
  onStageRectangleRedaction: (pageNumber: number, rectangle: PdfPageBox) => void;
  onUpdateSectionContent?: (pageNumber: number, sectionId: string, newContent: string) => void;
  onUpdatePageMeta?: (pageNumber: number, title: string, subtitle?: string) => void;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  pageRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  /** Lets the studio's Ctrl/Cmd+F place the caret in this box (AST-0771). */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const PdfViewport: React.FC<PdfViewportProps> = ({
  pages,
  annotations,
  formFields,
  zoomLevel,
  searchQuery,
  setSearchQuery,
  activeTool,
  onStageSectionRedaction,
  onStageImageRedaction,
  onStageRectangleRedaction,
  onUpdateSectionContent,
  onUpdatePageMeta,
  viewportRef,
  pageRefs,
  searchInputRef,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PDF_NAVIGATION_COPY[locale].viewport;
  const [imageRedactionDrag, setImageRedactionDrag] = useState<{
    pageNumber: number;
    imageId: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [pageRedactionDrag, setPageRedactionDrag] = useState<{
    pageNumber: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  const pointerToLocalFraction = (element: HTMLElement, clientX: number, clientY: number, rotation: 0 | 90 | 180 | 270) => {
    const rect = element.getBoundingClientRect();
    const dx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const dy = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    if (rotation === 90) return { x: dy, y: 1 - dx };
    if (rotation === 180) return { x: 1 - dx, y: 1 - dy };
    if (rotation === 270) return { x: 1 - dy, y: dx };
    return { x: dx, y: dy };
  };



  return (
    <main ref={viewportRef} className="flex-1 flex flex-col items-center overflow-y-auto p-6 md:p-10 bg-[#07090e]">
      <div className="w-full max-w-3xl mb-4 flex items-center justify-between">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+F and Escape stay inside the box, so the global shortcut does not steal the caret.
              if (e.key === 'Escape') { e.preventDefault(); setSearchQuery(''); return; }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.currentTarget.select(); }
            }}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            aria-keyshortcuts="Control+F Escape"
            data-pdf-search-input="true"
            className="w-full bg-slate-900/80 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
          />
          {searchQuery && (
            <button aria-label={copy.clearSearch} type="button" onClick={() => setSearchQuery('')} className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>
          )}
        </div>
        <div className="flex items-center space-x-2 text-[0.6875rem] text-slate-400 font-mono">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span>{copy.viewSummary}</span>
        </div>
      </div>

      <div className="flex flex-col items-center space-y-8 transition-all duration-150" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}>
        {pages.map((page, pageIndex) => {
          const rotation = page.rotation ?? 0;
          const quarterTurn = rotation === 90 || rotation === 270;
          const pageMediaBox = page.mediaBox ?? { x: 0, y: 0, width: 595.28, height: 841.89 };
          const screenWidth = 720;
          const screenHeight = screenWidth * pageMediaBox.height / pageMediaBox.width;
          return (
            <div
              key={page.pageNumber}
              ref={(element: HTMLDivElement | null) => { pageRefs.current[page.pageNumber] = element; }}
              className="relative"
              style={{ width: quarterTurn ? screenHeight : screenWidth, height: quarterTurn ? screenWidth : screenHeight }}
            >
              <article
                className="absolute left-1/2 top-1/2 bg-white border border-slate-300 shadow-2xl text-slate-900 select-text overflow-hidden"
                data-pdf-screen-layout="shared-structured-v1"
                style={{ width: screenWidth, height: screenHeight, transform: `translate(-50%, -50%) rotate(${rotation}deg)`, backgroundColor: page.decorations?.backgroundColor || '#ffffff' }}
              >
                {activeTool === 'redact' && (() => {
                  const drag = pageRedactionDrag?.pageNumber === page.pageNumber ? pageRedactionDrag : null;
                  const left = drag ? Math.min(drag.startX, drag.endX) * 100 : 0;
                  const top = drag ? Math.min(drag.startY, drag.endY) * 100 : 0;
                  const width = drag ? Math.abs(drag.endX - drag.startX) * 100 : 0;
                  const height = drag ? Math.abs(drag.endY - drag.startY) * 100 : 0;
                  const mediaBox = page.mediaBox ?? { x: 0, y: 0, width: 595.28, height: 841.89 };
                  return (
                    <div
                      data-pdf-rectangle-redaction-layer="true"
                      className="absolute inset-0 z-50 cursor-crosshair touch-none"
                      title={copy.rectangleTitle}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const point = pointerToLocalFraction(event.currentTarget, event.clientX, event.clientY, rotation);
                        setPageRedactionDrag({ pageNumber: page.pageNumber, startX: point.x, startY: point.y, endX: point.x, endY: point.y });
                      }}
                      onPointerMove={(event) => {
                        if (!drag) return;
                        const point = pointerToLocalFraction(event.currentTarget, event.clientX, event.clientY, rotation);
                        setPageRedactionDrag((current) => current?.pageNumber === page.pageNumber ? { ...current, endX: point.x, endY: point.y } : current);
                      }}
                      onPointerUp={(event) => {
                        if (!drag) return;
                        event.preventDefault();
                        const point = pointerToLocalFraction(event.currentTarget, event.clientX, event.clientY, rotation);
                        const x1 = Math.min(drag.startX, point.x);
                        const x2 = Math.max(drag.startX, point.x);
                        const y1Top = Math.min(drag.startY, point.y);
                        const y2Top = Math.max(drag.startY, point.y);
                        setPageRedactionDrag(null);
                        if (x2 - x1 < 0.006 || y2Top - y1Top < 0.006) return;
                        onStageRectangleRedaction(page.pageNumber, {
                          x: mediaBox.x + x1 * mediaBox.width,
                          y: mediaBox.y + (1 - y2Top) * mediaBox.height,
                          width: (x2 - x1) * mediaBox.width,
                          height: (y2Top - y1Top) * mediaBox.height,
                        });
                      }}
                    >
                      <div className="pointer-events-none absolute left-2 top-2 rounded bg-red-700/90 px-2 py-1 text-[0.5625rem] font-mono text-white shadow">{copy.rectangleHint}</div>
                      {drag && width > 0 && height > 0 && <div className="pointer-events-none absolute border-2 border-red-200 bg-black/70 shadow-lg" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />}
                    </div>
                  );
                })()}
                {page.decorations?.watermarkText && (
                  <div
                    data-pdf-security-watermark="true"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center overflow-hidden select-none"
                  >
                    <div className="max-w-[86%] -rotate-[32deg] text-center font-mono text-[1.375rem] font-bold tracking-[0.12em] text-slate-500/25 break-words">
                      {page.decorations.watermarkText}
                    </div>
                  </div>
                )}
                <PdfReviewOverlay annotations={annotations.filter((annotation) => annotation.page === page.pageNumber)} />
                <PdfPageInteractiveOverlay page={page} mediaBox={pageMediaBox} formFields={formFields} />
                {(page.vectors ?? []).map((vector) => {
                  const mediaBox = page.mediaBox ?? { x: 0, y: 0, width: 595.28, height: 841.89 };
                  const left = ((vector.bounds.x - mediaBox.x) / mediaBox.width) * 100;
                  const bottom = ((vector.bounds.y - mediaBox.y) / mediaBox.height) * 100;
                  const widthPercent = (vector.bounds.width / mediaBox.width) * 100;
                  const heightPercent = (vector.bounds.height / mediaBox.height) * 100;
                  if (vector.type === 'line') {
                    const dx = widthPercent;
                    const dy = -heightPercent;
                    const length = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    return <div key={vector.id} className="absolute pointer-events-none origin-left" style={{ left: `${left}%`, bottom: `${bottom + heightPercent}%`, width: `${length}%`, borderTop: `${Math.max(1, vector.lineWidth ?? 1)}px solid ${vector.strokeColor}`, transform: `rotate(${angle}deg)`, zIndex: 6 + (vector.zIndex ?? 0) }} />;
                  }
                  return <div key={vector.id} className="absolute pointer-events-none" style={{ left: `${left}%`, bottom: `${bottom}%`, width: `${widthPercent}%`, height: `${heightPercent}%`, border: `${Math.max(1, vector.lineWidth ?? 1)}px solid ${vector.strokeColor}`, backgroundColor: vector.fillColor ?? 'transparent', borderRadius: vector.type === 'ellipse' ? '9999px' : undefined, zIndex: 6 + (vector.zIndex ?? 0) }} />;
                })}
                {(page.images ?? []).map((image) => {
                  const mediaBox = page.mediaBox ?? { x: 0, y: 0, width: 595.28, height: 841.89 };
                  const left = ((image.bounds.x - mediaBox.x) / mediaBox.width) * 100;
                  const bottom = ((image.bounds.y - mediaBox.y) / mediaBox.height) * 100;
                  const widthPercent = (image.bounds.width / mediaBox.width) * 100;
                  const heightPercent = (image.bounds.height / mediaBox.height) * 100;
                  const drag = imageRedactionDrag?.pageNumber === page.pageNumber && imageRedactionDrag.imageId === image.id ? imageRedactionDrag : null;
                  const dragLeft = drag ? Math.min(drag.startX, drag.endX) * 100 : 0;
                  const dragTop = drag ? Math.min(drag.startY, drag.endY) * 100 : 0;
                  const dragWidth = drag ? Math.abs(drag.endX - drag.startX) * 100 : 0;
                  const dragHeight = drag ? Math.abs(drag.endY - drag.startY) * 100 : 0;
                  return (
                    <div
                      key={image.id}
                      className={`absolute overflow-hidden ${activeTool === 'redact' ? 'cursor-crosshair ring-1 ring-red-500/40' : 'pointer-events-none'}`}
                      style={{ left: `${left}%`, bottom: `${bottom}%`, width: `${widthPercent}%`, height: `${heightPercent}%`, zIndex: 6 + (image.zIndex ?? 0) }}
                      onPointerDown={(event) => {
                        if (activeTool !== 'redact') return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const rect = event.currentTarget.getBoundingClientRect();
                        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
                        setImageRedactionDrag({ pageNumber: page.pageNumber, imageId: image.id, startX: x, startY: y, endX: x, endY: y });
                      }}
                      onPointerMove={(event) => {
                        if (!drag || activeTool !== 'redact') return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
                        setImageRedactionDrag((current) => current && current.pageNumber === page.pageNumber && current.imageId === image.id ? { ...current, endX: x, endY: y } : current);
                      }}
                      onPointerUp={(event) => {
                        if (!drag || activeTool !== 'redact') return;
                        event.preventDefault();
                        const widthFraction = Math.abs(drag.endX - drag.startX);
                        const heightFraction = Math.abs(drag.endY - drag.startY);
                        const useWholeImage = widthFraction < 0.015 || heightFraction < 0.015;
                        const x1 = useWholeImage ? 0 : Math.min(drag.startX, drag.endX);
                        const x2 = useWholeImage ? 1 : Math.max(drag.startX, drag.endX);
                        const top = useWholeImage ? 0 : Math.min(drag.startY, drag.endY);
                        const bottom = useWholeImage ? 1 : Math.max(drag.startY, drag.endY);
                        onStageImageRedaction(page.pageNumber, image.id, {
                          x: image.bounds.x + x1 * image.bounds.width,
                          y: image.bounds.y + (1 - bottom) * image.bounds.height,
                          width: (x2 - x1) * image.bounds.width,
                          height: (bottom - top) * image.bounds.height,
                        });
                        setImageRedactionDrag(null);
                      }}
                      title={activeTool === 'redact' ? copy.imageTitle : undefined}
                    >
                      <img
                        src={image.dataUrl}
                        alt={image.altText || ''}
                        className="pointer-events-none absolute object-fill"
                        style={{
                          left: `${-((image.crop?.left ?? 0) / Math.max(0.01, 1 - (image.crop?.left ?? 0) - (image.crop?.right ?? 0))) * 100}%`,
                          top: `${-((image.crop?.top ?? 0) / Math.max(0.01, 1 - (image.crop?.top ?? 0) - (image.crop?.bottom ?? 0))) * 100}%`,
                          width: `${100 / Math.max(0.01, 1 - (image.crop?.left ?? 0) - (image.crop?.right ?? 0))}%`,
                          height: `${100 / Math.max(0.01, 1 - (image.crop?.top ?? 0) - (image.crop?.bottom ?? 0))}%`,
                          transform: `rotate(${image.rotation ?? 0}deg)`,
                          transformOrigin: 'center',
                        }}
                      />
                      {activeTool === 'redact' && !drag && <span className="pointer-events-none absolute left-1 top-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[0.5625rem] font-mono text-white">{copy.imageHint}</span>}
                      {drag && dragWidth > 0 && dragHeight > 0 && <div className="pointer-events-none absolute border border-red-200 bg-black/80" style={{ left: `${dragLeft}%`, top: `${dragTop}%`, width: `${dragWidth}%`, height: `${dragHeight}%` }} />}
                    </div>
                  );
                })}
                {page.sections.filter((section) => section.bounds).map((section) => (
                  <PdfPositionedSection
                    key={`positioned-${section.id}`}
                    pageNumber={page.pageNumber}
                    section={section}
                    mediaBox={pageMediaBox}
                    annotations={annotations}
                    searchQuery={searchQuery}
                    activeTool={activeTool}
                    onStageSectionRedaction={onStageSectionRedaction}
                    onUpdateSectionContent={onUpdateSectionContent}
                  />
                ))}
                <PdfStructuredFlowLayer
                  page={page}
                  pageIndex={pageIndex}
                  pageCount={pages.length}
                  annotations={annotations}
                  searchQuery={searchQuery}
                  activeTool={activeTool}
                  onStageSectionRedaction={onStageSectionRedaction}
                  onUpdateSectionContent={onUpdateSectionContent}
                  onUpdatePageMeta={onUpdatePageMeta}
                />
              </article>
            </div>
          );
        })}
      </div>
    </main>
  );
};
