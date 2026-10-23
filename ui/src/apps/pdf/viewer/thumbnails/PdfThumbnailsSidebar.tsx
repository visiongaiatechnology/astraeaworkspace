import React, { useState } from 'react';
import { PdfPageModel, PdfAnnotation } from '../../../../shared/contracts/workspace';
import { Copy, GripVertical, Layers, Plus, RotateCw, Trash2 } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PDF_VIEWER_COPY } from '../pdfViewerLocale';

interface PdfThumbnailsSidebarProps {
  pages: PdfPageModel[];
  currentPage: number;
  onScrollToPage: (page: number) => void;
  onAddPage: () => void;
  annotations: PdfAnnotation[];
  onReorderPage: (sourcePage: number, targetPage: number) => void;
  onRotatePage: (pageNumber: number) => void;
  onDuplicatePage: (pageNumber: number) => void;
  onDeletePage: (pageNumber: number) => void;
}

export const PdfThumbnailsSidebar: React.FC<PdfThumbnailsSidebarProps> = ({
  pages,
  currentPage,
  onScrollToPage,
  onAddPage,
  annotations,
  onReorderPage,
  onRotatePage,
  onDuplicatePage,
  onDeletePage,
}) => {
  const [draggingPage, setDraggingPage] = useState<number | null>(null);
  const documentRef = React.useRef<HTMLDivElement>(null);
  const { locale } = useWorkspaceLocale();
  const copy = PDF_VIEWER_COPY[locale].thumbnails;
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  /**
   * Keyboard parity for the page strip. The tiles used to be plain `div`s with an `onClick`, so the page
   * list — the only way to change page without the toolbar arrows — could not be reached with Tab at all
   * (AST-0766 / AST-0769). Reordering was drag-only (AST-0804); Alt+ArrowUp/Down now performs the same
   * transition through the canonical `onReorderPage` path, and focus follows the moved page.
   */
  const moveFocusToPage = (pageNumber: number) => {
    onScrollToPage(pageNumber);
    const list = documentRef.current;
    if (!list) return;
    const next = list.querySelector<HTMLElement>(`[data-pdf-thumbnail-page-index="${pageNumber}"]`);
    next?.focus();
  };

  const handleTileKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, pageNumber: number) => {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const index = ordered.findIndex((page) => page.pageNumber === pageNumber);
      const targetIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
      const targetPage = ordered[targetIndex].pageNumber;
      onReorderPage(pageNumber, targetPage);
      moveFocusToPage(targetPage);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const index = ordered.findIndex((page) => page.pageNumber === pageNumber);
      const targetIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return;
      moveFocusToPage(ordered[targetIndex].pageNumber);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveFocusToPage(event.key === 'Home' ? ordered[0].pageNumber : ordered[ordered.length - 1].pageNumber);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onScrollToPage(pageNumber);
      return;
    }
    if (event.key === 'Delete' && ordered.length > 1) {
      event.preventDefault();
      const index = ordered.findIndex((page) => page.pageNumber === pageNumber);
      onDeletePage(pageNumber);
      const fallback = ordered[Math.min(index, ordered.length - 2)];
      if (fallback) moveFocusToPage(fallback.pageNumber);
    }
  };

  return (
    <aside data-pdf-studio-sidebar="pages" className="w-56 bg-slate-950 border-r border-white/[0.08] flex flex-col p-3 space-y-3 shrink-0">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <span data-pdf-sidebar-heading="true" className="text-[0.6875rem] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>{copy.pages(pages.length)}</span>
        </span>
        <button data-pdf-sidebar-action="add-page" type="button" onClick={onAddPage} className="p-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300" aria-label={copy.addBlank} title={copy.addBlank}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div data-pdf-sidebar-hint="true" className="break-words text-[0.625rem] text-slate-600 px-1">{copy.reorderHint}</div>

      <div ref={documentRef} className="flex-1 overflow-y-auto space-y-3 pr-1" role="listbox" aria-label={copy.pages(pages.length)} aria-orientation="vertical">
        {pages.map((pg) => {
          const isActive = pg.pageNumber === currentPage;
          const hasRedactions = pg.sections.some((section) => section.isRedacted);
          return (
            <div
              key={pg.pageNumber}
              role="option"
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              onKeyDown={(event) => handleTileKeyDown(event, pg.pageNumber)}
              draggable
              onDragStart={(event) => {
                setDraggingPage(pg.pageNumber);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(pg.pageNumber));
              }}
              onDragEnd={() => setDraggingPage(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = Number(event.dataTransfer.getData('text/plain') || draggingPage);
                if (Number.isFinite(source) && source > 0 && source !== pg.pageNumber) onReorderPage(source, pg.pageNumber);
                setDraggingPage(null);
              }}
              onClick={() => onScrollToPage(pg.pageNumber)}
              data-pdf-page-selected={isActive ? 'true' : undefined}
              data-pdf-thumbnail-page-index={pg.pageNumber}
              aria-current={isActive ? 'page' : undefined}
              aria-label={copy.goToPage(pg.pageNumber)}
              aria-keyshortcuts="Enter Space ArrowUp ArrowDown Home End Alt+ArrowUp Alt+ArrowDown Delete"
              data-vgt-app-guide-anchor={isActive ? 'PdfStudio:first' : undefined}
              className={`group relative p-2 rounded-xl cursor-pointer transition-all border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 ${
                isActive
                  ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30'
                  : draggingPage === pg.pageNumber
                    ? 'bg-indigo-500/10 border-indigo-500/40 opacity-60'
                    : 'bg-slate-900/60 border-white/[0.06] hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1 text-[0.625rem] text-slate-500">
                  <GripVertical className="w-3 h-3" />
                  <span>{copy.page(pg.pageNumber)}</span>
                  {(pg.rotation ?? 0) !== 0 && <span className="text-amber-400">{pg.rotation}°</span>}
                </div>
                <div className="flex gap-0.5 opacity-30 group-hover:opacity-100 transition-opacity" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => onRotatePage(pg.pageNumber)} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-amber-300" aria-label={copy.rotate} title={copy.rotate}><RotateCw className="w-3 h-3" /></button>
                  <button type="button" onClick={() => onDuplicatePage(pg.pageNumber)} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-blue-300" aria-label={copy.duplicate} title={copy.duplicate}><Copy className="w-3 h-3" /></button>
                  <button type="button" disabled={pages.length <= 1} onClick={() => onDeletePage(pg.pageNumber)} className="p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 disabled:opacity-20" aria-label={copy.delete} title={copy.delete}><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>

              <div data-pdf-thumbnail-page="true" className={`aspect-[1/1.41] w-full rounded-lg bg-slate-900 border border-white/10 p-2 flex flex-col justify-between overflow-hidden shadow-inner relative ${(pg.rotation ?? 0) === 90 || (pg.rotation ?? 0) === 270 ? 'ring-1 ring-amber-500/20' : ''}`}>
                <div className="space-y-1">
                  <div className="w-3/4 h-1.5 bg-slate-600/60 rounded" />
                  <div className="w-1/2 h-1 bg-slate-700/40 rounded" />
                </div>
                <div className="space-y-1 my-1">
                  <div className="w-full h-1 bg-slate-700/30 rounded" />
                  <div className="w-5/6 h-1 bg-slate-700/30 rounded" />
                  <div className="w-4/6 h-1 bg-slate-700/30 rounded" />
                  {hasRedactions && (
                    <div className="w-full h-2 bg-black border border-red-500/40 rounded-xs flex items-center justify-center"><span className="text-[0.375rem] text-red-400 font-mono">{copy.redacted}</span></div>
                  )}
                  <div className="w-full h-1 bg-slate-700/30 rounded" />
                </div>
                <div className="flex items-center justify-between text-[0.5rem] font-mono text-slate-500 pt-1 border-t border-white/[0.04]">
                  <span>{copy.structured}</span><span>{copy.pageAbbreviation}{pg.pageNumber}</span>
                </div>
                {annotations.some((annotation) => annotation.page === pg.pageNumber) && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 shadow" />}
              </div>

              <div className="flex items-center justify-between mt-1.5 text-[0.6875rem]">
                <span className={`font-semibold truncate ${isActive ? 'text-blue-300' : 'text-slate-400'}`}>{pg.title}</span>
                {hasRedactions && <span className="text-[0.5625rem] font-mono text-red-400 bg-red-950/60 px-1 rounded border border-red-500/20">{copy.sanitized}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
