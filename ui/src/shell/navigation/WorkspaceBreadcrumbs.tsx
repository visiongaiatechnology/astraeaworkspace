import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Copy, Pencil, PanelsTopLeft } from 'lucide-react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellChromeCopy } from '../i18n/shellChromeLocale';

interface WorkspaceBreadcrumbsProps {
  document: WorkspaceDocument;
  onOpenWorkspace: () => void;
  onOpenModule: () => void;
  onRename: (title: string) => void;
}

type Segment = 'workspace' | 'module' | 'document';

export const WorkspaceBreadcrumbs: React.FC<WorkspaceBreadcrumbsProps> = ({ document, onOpenWorkspace, onOpenModule, onRename }) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellChromeCopy(locale).breadcrumb;
  const [menu, setMenu] = useState<{ segment: Segment; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(document.title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(document.title); }, [document.id, document.title]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key, true); };
  }, [menu]);
  const openMenu = (segment: Segment, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); setMenu({ segment, x: event.clientX, y: event.clientY });
  };
  const copyLink = async () => {
    const link = `vgt://workspace/document/${encodeURIComponent(document.id)}`;
    try { await navigator.clipboard.writeText(link); } catch { /* UI remains fail-soft if clipboard permission is unavailable. */ }
    setMenu(null);
  };
  const commitRename = () => { const next = draft.trim(); if (next && next !== document.title) onRename(next.slice(0, 240)); else setDraft(document.title); setEditing(false); };
  const segmentClass = 'workspace-breadcrumbs__segment';
  return <nav aria-label={copy.nav} className="workspace-breadcrumbs relative min-w-0 items-center">
    <button type="button" className={segmentClass} onClick={(event) => openMenu('workspace', event)} onContextMenu={(event) => openMenu('workspace', event)}>{copy.workspace}</button>
    <ChevronRight className="workspace-breadcrumbs__separator" aria-hidden="true" />
    <button type="button" className={segmentClass} onClick={(event) => openMenu('module', event)} onContextMenu={(event) => openMenu('module', event)}>{document.kind}</button>
    <ChevronRight className="workspace-breadcrumbs__separator" aria-hidden="true" />
    {editing ? <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') { setDraft(document.title); setEditing(false); } }} className="workspace-breadcrumbs__rename" aria-label={copy.renameTitle} /> : <button type="button" className={`${segmentClass} workspace-breadcrumbs__segment--current`} title={document.title} onClick={(event) => openMenu('document', event)} onContextMenu={(event) => openMenu('document', event)}>{document.title}</button>}
    {menu && <div role="menu" aria-label={copy.actions} onPointerDown={(event) => event.stopPropagation()} style={{ left: Math.min(menu.x, Math.max(8, window.innerWidth - 220)), top: Math.min(menu.y, Math.max(8, window.innerHeight - 160)) }} className="workspace-breadcrumbs__menu fixed z-50">
      {menu.segment === 'workspace' && <button role="menuitem" type="button" onClick={() => { setMenu(null); onOpenWorkspace(); }} className="workspace-breadcrumbs__menu-item"><PanelsTopLeft aria-hidden="true"/>{copy.openWorkspace}</button>}
      {menu.segment === 'module' && <button role="menuitem" type="button" onClick={() => { setMenu(null); onOpenModule(); }} className="workspace-breadcrumbs__menu-item"><PanelsTopLeft aria-hidden="true"/>{copy.openModule(document.kind)}</button>}
      {menu.segment === 'document' && <><button role="menuitem" type="button" onClick={() => { setMenu(null); setEditing(true); }} className="workspace-breadcrumbs__menu-item"><Pencil aria-hidden="true"/>{copy.rename}</button><button role="menuitem" type="button" onClick={() => { void copyLink(); }} className="workspace-breadcrumbs__menu-item"><Copy aria-hidden="true"/>{copy.copyLink}</button></>}
    </div>}
  </nav>;
};
