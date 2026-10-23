import React, { useEffect, useRef, useState } from 'react';
import { FileText, Plus, X, ChevronDown, ExternalLink, PanelsTopLeft, Pin, PinOff, RotateCcw, Copy, CopyPlus, PanelRightClose } from 'lucide-react';
import { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import { AstraeaAppIcon, hasAstraeaAppIcon } from '../../design-system/brand/AstraeaAppIcon';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellChromeCopy } from '../i18n/shellChromeLocale';

interface TabBarProps {
  documents: WorkspaceDocument[];
  activeDocId: string;
  onSelectDoc: (id: string) => void;
  onCloseDoc: (id: string) => void;
  onCloseOtherDocs?: (id: string) => void;
  onCloseDocsToRight?: (id: string) => void;
  onDuplicateDoc?: (id: string) => void;
  onCopyPath?: (id: string) => void;
  onCreateDoc: (kind: DocumentKind) => void;
  onDetachDoc?: (id: string) => void;
  onReorderDoc?: (sourceId: string, targetId: string) => void;
  onOpenNewWindow?: () => void;
  pinnedDocumentIds?: readonly string[];
  onTogglePin?: (id: string) => void;
  canReopenClosed?: boolean;
  onReopenClosed?: () => void;
  /**
   * Shell ergonomics — the tab bar can be collapsed to a slim strip.
   *
   * While writing, the bar's height is worth more to the page than to the navigation.
   * The state lives in the shell (and is persisted there), not in this component, so
   * it survives re-renders and a restart.
   */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  documents,
  activeDocId,
  onSelectDoc,
  onCloseDoc,
  onCloseOtherDocs,
  onCloseDocsToRight,
  onDuplicateDoc,
  onCopyPath,
  onCreateDoc,
  onDetachDoc,
  onReorderDoc,
  onOpenNewWindow,
  pinnedDocumentIds = [],
  onTogglePin,
  canReopenClosed = false,
  onReopenClosed,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellChromeCopy(locale).tabs;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ documentId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', keydown, true); };
  }, [contextMenu]);

  useEffect(() => {
    const tabs = Array.from(tabListRef.current?.querySelectorAll<HTMLElement>('[data-workspace-tab-id]') ?? []);
    tabs.find((tab) => tab.dataset.workspaceTabId === activeDocId)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }, [activeDocId, documents.length]);

  const getDocIcon = (kind: DocumentKind) => {
    if (hasAstraeaAppIcon(kind)) {
      return <AstraeaAppIcon kind={kind} className="h-4 w-4 shrink-0 min-[1700px]:h-5 min-[1700px]:w-5" />;
    }
    return <FileText className="h-3 w-3 shrink-0 text-slate-400" />;
  };

  return (
    <div
      className={`flex min-w-0 w-full shrink-0 items-center gap-2 border-b border-purple-500/15 bg-[#07050d]/95 px-2 select-none ${collapsed ? 'h-7' : 'h-12 min-[1700px]:h-[54px]'}`}
      data-workspace-tabbar={collapsed ? 'collapsed' : 'expanded'}
    >
      {collapsed ? (
        <>
          {/* Collapsed: one line with the active document and the way back out. */}
          <button
            type="button"
            data-workspace-tabbar-toggle="expand"
            aria-expanded="false"
            aria-label={copy.expand}
            title={copy.expand}
            onClick={onToggleCollapsed}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-slate-900/80 text-slate-400 transition-colors hover:border-purple-500/40 hover:text-white"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                data-workspace-tab-id={doc.id}
                aria-label={`${doc.title}, ${doc.kind} document`}
                aria-current={doc.id === activeDocId ? 'page' : undefined}
                onClick={() => onSelectDoc(doc.id)}
                className={`min-w-0 truncate rounded px-1.5 py-0.5 text-[0.6875rem] transition-colors ${
                  doc.id === activeDocId
                    ? 'bg-purple-950/70 text-purple-100'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                {doc.title}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
      <div ref={tabListRef} role="tablist" aria-label={copy.list} aria-orientation="horizontal" className="flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain whitespace-nowrap px-1 py-1.5 vgt-horizontal-scroll">
        {documents.map((doc) => {
          const isActive = doc.id === activeDocId;
          return (
            <div key={doc.id} role="presentation" className={'group relative flex h-9 w-[clamp(116px,8.5vw,148px)] shrink-0 items-center rounded-lg border shadow-sm transition-colors min-[1700px]:h-10 min-[1700px]:w-[clamp(156px,10vw,200px)] min-[1700px]:rounded-xl ' + (isActive ? 'border-purple-400/40 bg-purple-950/55 shadow-purple-950/40' : 'border-white/[0.08] bg-slate-950/55 hover:border-purple-500/30 hover:bg-purple-950/25')}>
              <button
                type="button"
                role="tab"
                data-workspace-tab-id={doc.id}
                aria-label={doc.title + ', ' + doc.kind + ' document'}
                aria-selected={isActive}
                aria-controls="astraea-workspace-main"
                tabIndex={isActive ? 0 : -1}
                draggable={Boolean(onReorderDoc || onDetachDoc)}
                onDragStart={(event) => {
                  setDraggedTabId(doc.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('application/x-astraea-tab', doc.id);
                  event.dataTransfer.setData('text/plain', doc.id);
                }}
                onDragOver={(event) => {
                  if (!draggedTabId || draggedTabId === doc.id || !onReorderDoc) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTargetId(doc.id);
                }}
                onDragLeave={() => { if (dropTargetId === doc.id) setDropTargetId(null); }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = draggedTabId || event.dataTransfer.getData('application/x-astraea-tab');
                  if (sourceId && sourceId !== doc.id) onReorderDoc?.(sourceId, doc.id);
                  setDropTargetId(null);
                  setDraggedTabId(null);
                }}
                onDragEnd={(event) => {
                  const bar = event.currentTarget.closest('[role="tablist"]')?.getBoundingClientRect();
                  const hasPointerCoordinates = event.clientX !== 0 || event.clientY !== 0;
                  if (bar && hasPointerCoordinates && onDetachDoc) {
                    const outside = event.clientX < bar.left - 16 || event.clientX > bar.right + 16 || event.clientY < bar.top - 16 || event.clientY > bar.bottom + 16;
                    if (outside) onDetachDoc(doc.id);
                  }
                  setDropTargetId(null);
                  setDraggedTabId(null);
                }}
                onClick={() => onSelectDoc(doc.id)}
                onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onSelectDoc(doc.id); setContextMenu({ documentId: doc.id, x: event.clientX, y: event.clientY }); }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
                  event.preventDefault();
                  const tabs = Array.from(event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"][data-workspace-tab-id]') ?? []);
                  const index = tabs.indexOf(event.currentTarget);
                  if (index < 0 || tabs.length === 0) return;
                  const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                  target.focus();
                  const targetId = target.dataset.workspaceTabId;
                  if (targetId) onSelectDoc(targetId);
                }}
                className={'relative flex h-full min-w-0 flex-1 items-center gap-1 px-2 text-left text-[11px] font-medium transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 min-[1700px]:gap-2 min-[1700px]:px-2.5 min-[1700px]:text-xs ' + (isActive ? 'text-purple-100' : 'text-slate-300 hover:text-white')}
              >
                {dropTargetId === doc.id && draggedTabId !== doc.id && <span aria-hidden="true" className="absolute inset-y-1 left-0.5 z-10 w-0.5 rounded-full bg-purple-300 shadow-[0_0_8px_rgba(196,181,253,0.6)]" />}
                {getDocIcon(doc.kind)}
                <span className="min-w-0 flex-1" title={doc.title}>
                  <span className="block truncate leading-4">{doc.title}</span>
                  <span className="hidden truncate text-[9px] leading-3 text-slate-500 min-[1700px]:block">{doc.kind}</span>
                </span>
              </button>
              <div className="flex shrink-0 items-center pr-1">
                {documents.length > 1 && <button type="button" onClick={(event) => { event.stopPropagation(); onCloseDoc(doc.id); }} className="rounded-md p-0.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 min-[1700px]:p-1" title={copy.close} aria-label={`${copy.close} ${doc.title}`}><X className="h-3 w-3" /></button>}
              </div>
              {isActive && <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-purple-400 to-indigo-300" />}
            </div>
          );
        })}
      </div>

      <div className="relative flex h-full shrink-0 items-center gap-0.5 border-l border-white/10 pl-2">
      {onOpenNewWindow && (
        <button
          onClick={onOpenNewWindow}
          className="flex items-center px-2 py-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-950/40 border border-transparent hover:border-purple-500/20 transition-all"
          title={copy.newWindow}
          aria-label={copy.newWindow}
        >
          <PanelsTopLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {onReopenClosed && (
        <button onClick={onReopenClosed} disabled={!canReopenClosed} className="flex items-center px-2 py-1.5 rounded-lg text-slate-400 hover:text-purple-300 disabled:opacity-30 disabled:cursor-not-allowed" title={copy.reopen} aria-label={copy.reopen}><RotateCcw className="w-3.5 h-3.5" /></button>
      )}

      {contextMenu && (() => {
        const doc = documents.find((candidate) => candidate.id === contextMenu.documentId);
        if (!doc) return null;
        const isPinned = pinnedDocumentIds.includes(doc.id);
        const action = (run: () => void) => () => { setContextMenu(null); run(); };
        return <div ref={contextMenuRef} role="menu" aria-label={copy.list} onPointerDown={(event) => event.stopPropagation()} style={{ left: Math.min(contextMenu.x, Math.max(8, window.innerWidth - 230)), top: Math.min(contextMenu.y, Math.max(8, window.innerHeight - 260)) }} className="fixed z-50 w-56 rounded-xl border border-white/10 bg-[#0a0714] p-1.5 shadow-2xl">
          <button role="menuitem" type="button" onClick={action(() => onCloseDoc(doc.id))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10"><X className="h-3.5 w-3.5"/>{copy.closeTab}</button>
          <button role="menuitem" type="button" onClick={action(() => onTogglePin?.(doc.id))} disabled={!onTogglePin} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40">{isPinned ? <PinOff className="h-3.5 w-3.5"/> : <Pin className="h-3.5 w-3.5"/>}{isPinned ? copy.unpin : copy.pin}</button>
          <button role="menuitem" type="button" onClick={action(() => onCloseOtherDocs?.(doc.id))} disabled={!onCloseOtherDocs} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40"><PanelsTopLeft className="h-3.5 w-3.5"/>{copy.closeOthers}</button>
          <button role="menuitem" type="button" onClick={action(() => onCloseDocsToRight?.(doc.id))} disabled={!onCloseDocsToRight} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40"><PanelRightClose className="h-3.5 w-3.5"/>{copy.closeRight}</button>
          <button role="menuitem" type="button" onClick={action(() => onDuplicateDoc?.(doc.id))} disabled={!onDuplicateDoc} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40"><CopyPlus className="h-3.5 w-3.5"/>{copy.duplicate}</button>
          <button role="menuitem" type="button" onClick={action(() => onDetachDoc?.(doc.id))} disabled={!onDetachDoc} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40"><ExternalLink className="h-3.5 w-3.5"/>{copy.detach}</button>
          <button role="menuitem" type="button" onClick={action(() => onCopyPath?.(doc.id))} disabled={!onCopyPath} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40"><Copy className="h-3.5 w-3.5"/>{copy.copyPath}</button>
        </div>;
      })()}

      {/* New Document Button & Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex h-9 items-center space-x-1 rounded-lg border border-transparent px-2 text-slate-400 transition-all hover:border-purple-500/20 hover:bg-purple-950/40 hover:text-purple-300"
          aria-label={copy.create} aria-expanded={isDropdownOpen} title={copy.newDocument}
        >
          <Plus className="w-3.5 h-3.5" />
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {isDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsDropdownOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(24rem,calc(100vh-8rem))] w-56 space-y-0.5 overflow-y-auto rounded-xl glass-dropdown p-1.5 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  onCreateDoc('Writer');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-blue-600/20 hover:text-blue-300 transition-colors"
              >
                <AstraeaAppIcon kind="Writer" className="w-5 h-5 shrink-0" />
                <span>VGT Writer (.vdoc)</span>
              </button>

              <button
                onClick={() => {
                  onCreateDoc('Grid');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors"
              >
                <AstraeaAppIcon kind="Grid" className="w-5 h-5 shrink-0" />
                <span>VGT Grid (.vgrid)</span>
              </button>

              <button
                onClick={() => {
                  onCreateDoc('Present');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-600/20 hover:text-amber-300 transition-colors"
              >
                <AstraeaAppIcon kind="Present" className="w-5 h-5 shrink-0" />
                <span>VGT Present (.vpresent)</span>
              </button>

              <button
                onClick={() => {
                  onCreateDoc('Notes');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-purple-600/20 hover:text-purple-300 transition-colors"
              >
                <AstraeaAppIcon kind="Notes" className="w-5 h-5 shrink-0" />
                <span>VGT Notes (.vnote)</span>
              </button>

              <button
                onClick={() => {
                  onCreateDoc('PdfStudio');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-rose-600/20 hover:text-rose-300 transition-colors"
              >
                <AstraeaAppIcon kind="PdfStudio" className="w-5 h-5 shrink-0" />
                <span>VGT PDF Studio (.vpdf)</span>
              </button>

              <button
                onClick={() => {
                  onCreateDoc('Whiteboard');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-pink-600/20 hover:text-pink-300 transition-colors"
              >
                <AstraeaAppIcon kind="Whiteboard" className="w-5 h-5 shrink-0" />
                <span>VGT Whiteboard (.vboard)</span>
              </button>



              <button
                onClick={() => {
                  onCreateDoc('Tasks');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 transition-colors"
              >
                <AstraeaAppIcon kind="Tasks" className="w-5 h-5 shrink-0" />
                <span>VGT Work Mgmt (.vtask)</span>
              </button>

              <button
                onClick={() => {
                  onCreateDoc('Vault');
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-violet-600/20 hover:text-violet-300 transition-colors"
              >
                <AstraeaAppIcon kind="Vault" className="w-5 h-5 shrink-0" />
                <span>VGT Vault (.vvault)</span>
              </button>
            </div>
          </>
        )}
      </div>
      </div>
      {/* Collapse control — right edge, always reachable by keyboard. */}
      {onToggleCollapsed && (
        <button
          type="button"
          data-workspace-tabbar-toggle="collapse"
          aria-expanded="true"
          aria-label={copy.collapse}
          title={copy.collapse}
          onClick={onToggleCollapsed}
          className="flex h-7 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-slate-900/80 text-slate-400 transition-colors hover:border-purple-500/40 hover:text-white"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
        </button>
      )}
        </>
      )}
    </div>
  );
};
