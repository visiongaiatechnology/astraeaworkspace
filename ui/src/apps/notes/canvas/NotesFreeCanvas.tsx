// STATUS: PLATIN — free-position Notes canvas: cards, keyboard, drop, and **bounded zoom** (W-430)
//
// ## W-430 — die Leinwand hatte kein Zoom
//
// Gemessen: Tinte (`canvas/ink/notesInkZoom.ts`) und Anhangvorschau (`media/notesAttachmentZoom.ts`) haben ein
// begrenztes Zoom; die **freie Leinwand** nicht ✗ — ein großes Board ließ sich nur scrollen.
//
// **Keine dritte Zoom-Regel:** die Arithmetik kommt aus `notesInkZoom` (Grenzen und Schritt sind dort
// definiert), die Prozent-Beschriftung aus `formatNotePreviewZoom` (die vorhandene Beschriftung). *Beide Module
// tragen heute **dieselben** Zahlen (0,5–4, Schritt 0,25) — das ist eine eigene Doppelung und als Befund
// gemeldet; hier entsteht jedenfalls keine dritte.*
//
// Pan ist **Scrollen**: die gezoomte Fläche wächst in ihrem Layout-Kasten, damit die Scrollbalken mitwachsen —
// *eine skalierte Fläche ohne wachsenden Kasten lässt sich nicht schwenken.*
import React, { useMemo, useRef, useState } from 'react';
import type { NoteAttachment, NoteCanvasBlock, NoteCanvasState, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { ChevronDown, ChevronUp, FilePlus2, Globe2, Grip, Image as ImageIcon, Layers, List, Minus, PanelTopClose, Paperclip, Plus, Table2, Trash2, Type } from 'lucide-react';
import { NotesImageBlockView } from './blocks/NotesImageBlock';
import { NotesMediaMemoBlock } from './blocks/NotesMediaMemoBlock';
import { NotesWorkspaceEmbedBlock } from './blocks/NotesWorkspaceEmbedBlock';
import { NotesAttachmentPreviewModal } from '../media/NotesAttachmentPreviewModal';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { notesExtendedText } from '../notesExtendedLocale';
import {
  addCanvasBlock,
  createCanvasBlock,
  deleteCanvasBlock,
  moveCanvasBlockLayer,
  normalizeNoteCanvas,
  resolveCanvasSize,
  sanitizeNoteInkSvg,
  updateCanvasBlock,
} from './notesCanvasModel';
import { nextCanvasBlockId, resolveCanvasKeyboardCommand } from './notesCanvasKeyboard';
import { NOTE_PAGE_DRAG_MIME, addNotePageCard, notePageCardLinkText, parseNotePageDragPayload } from './notesCanvasDrop';
import { NOTE_INK_MAX_ZOOM, NOTE_INK_MIN_ZOOM, stepInkZoom } from './ink/notesInkZoom';
import { formatNotePreviewZoom } from '../media/notesAttachmentZoom';

interface NotesFreeCanvasProps {
  canvas: NoteCanvasState | undefined;
  onChange: (canvas: NoteCanvasState) => void;
  onDropFiles: (files: File[], x: number, y: number) => Promise<void>;
  onEditInk?: (blockId: string) => void;
  attachments?: readonly NoteAttachment[];
  workspaceDocuments?: readonly WorkspaceDocument[];
  onOpenWorkspaceDocument?: (documentId: string) => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
  onOpenWorkspaceEmbed?: () => void;
}

interface PointerSession { blockId: string; kind: 'move' | 'resize'; startX: number; startY: number; originX: number; originY: number; originW: number; originH: number; }

export const NotesFreeCanvas: React.FC<NotesFreeCanvasProps> = ({ canvas, onChange, onDropFiles, onEditInk, attachments = [], workspaceDocuments = [], onOpenWorkspaceDocument, onOpenExternalUrl, onOpenWorkspaceEmbed }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message:string) => notesExtendedText(message, locale);
  const blockLabel = (kind: NoteCanvasBlock['kind']) => t(({ text: 'Text', list: 'List', table: 'Table', toggle: 'Toggle', image: 'Image', ink: 'Ink', file: 'File', embed: 'Web link', media: 'Media' })[kind]);
  const state = useMemo(() => normalizeNoteCanvas(canvas), [canvas]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  /**
   * **W-430:** der Zoom der Leinwand. Die Grenzen und der Schritt sind die **vorhandenen** aus
   * `notesInkZoom` — *hier wird kein zweites Limit erfunden.* `zoom === 1` ist der unveränderte Zustand, damit
   * eine ungezoomte Leinwand **byte-identisch** rendert wie vorher.
   */
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const size = resolveCanvasSize(state);

  /** Tastatur-Zoom wie in der Tintenfläche (`+`/`-`/`0`) — dieselben Tasten, dieselbe Bedeutung. */
  const handleCanvasZoomKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Nur die Fläche selbst zoomt: in einem Textfeld bedeuten diese Tasten Text, nicht Ansicht.
    if (event.target !== event.currentTarget) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((current) => stepInkZoom(current, 1)); return; }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom((current) => stepInkZoom(current, -1)); return; }
    if (event.key === '0') { event.preventDefault(); setZoom(1); }
  };

  const updateBlock = (blockId: string, patch: Partial<NoteCanvasBlock>) => onChange(updateCanvasBlock(state, blockId, patch));
  const [status, setStatus] = useState<string | null>(null);
  const add = (kind: Parameters<typeof createCanvasBlock>[0]) => onChange(addCanvasBlock(state, createCanvasBlock(kind, 56 + state.blocks.length * 14, 56 + state.blocks.length * 14)));

  /**
   * AST-0686/AST-0689: moving and resizing a card is keyboard-first. The arithmetic lives in
   * `notesCanvasKeyboard` with the same bounds as `normalizeBlock`, so a keyboard move can never push a
   * card out of the canvas or below the minimum size.
   */
  const handleBlockKeyDown = (event: React.KeyboardEvent<HTMLElement>, block: NoteCanvasBlock) => {
    const command = resolveCanvasKeyboardCommand({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
    }, { block, shiftKey: event.shiftKey, altKey: event.altKey });
    if (!command) return;
    event.preventDefault();
    if (command.type === 'move' || command.type === 'resize') { updateBlock(block.id, command.patch); return; }
    if (command.type === 'remove') {
      setSelectedId(null);
      setStatus(`Removed the “${blockLabel(block.kind)}” card.`);
      onChange(deleteCanvasBlock(state, block.id));
      return;
    }
    if (command.type === 'deselect') { setSelectedId(null); return; }
    const target = nextCanvasBlockId(state.blocks, block.id, command.delta);
    setSelectedId(target);
    if (target) surfaceRef.current?.querySelector<HTMLElement>(`[data-notes-canvas-block="${target}"]`)?.focus();
  };

  /**
   * AST-0686: dropping a note page from the page list creates a card that links back through the canonical
   * [[wiki link]], on top of the existing file/media drop handling.
   */
  const handleNotePageDrop = (event: React.DragEvent<HTMLDivElement>, target: HTMLDivElement | null): boolean => {
    const raw = event.dataTransfer.getData(NOTE_PAGE_DRAG_MIME);
    if (!raw) return false;
    const payload = parseNotePageDragPayload(raw);
    if (!payload) { setStatus('The dragged note reference was invalid, so no card was created.'); return true; }
    const rect = target?.getBoundingClientRect();
    const next = addNotePageCard(state, payload, {
      x: Math.max(0, event.clientX - (rect?.left ?? 0)),
      y: Math.max(0, event.clientY - (rect?.top ?? 0)),
    });
    if (!next) { setStatus(`The canvas is limited to ${state.blocks.length} cards; no card was added.`); return true; }
    onChange(next);
    setStatus(`Added a linked card for “${payload.title}” (${notePageCardLinkText(payload)}).`);
    return true;
  };
  const addWebLink = () => {
    const offset = 56 + state.blocks.length * 14;
    const block = { ...createCanvasBlock('embed', offset, offset), kind: 'embed' as const, title: 'Web link', reference: 'https://', frozen: true };
    onChange(addCanvasBlock(state, block));
  };
  const backgroundStyle: React.CSSProperties = state.background === 'grid'
    ? { backgroundImage: 'linear-gradient(rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px)', backgroundSize: '24px 24px' }
    : state.background === 'ruled'
      ? { backgroundImage: 'repeating-linear-gradient(to bottom,transparent 0,transparent 27px,rgba(148,163,184,.12) 28px)', backgroundSize: '100% 28px' }
      : state.background === 'dots'
        ? { backgroundImage: 'radial-gradient(rgba(148,163,184,.24) 1px,transparent 1px)', backgroundSize: '20px 20px' }
        : {};

  const pointerStart = (event: React.PointerEvent, block: NoteCanvasBlock, kind: 'move' | 'resize') => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    sessionRef.current = { blockId: block.id, kind, startX: event.clientX, startY: event.clientY, originX: block.x, originY: block.y, originW: block.width, originH: block.height };
    setSelectedId(block.id);
  };
  const pointerMove = (event: React.PointerEvent) => {
    const session = sessionRef.current;
    if (!session) return;
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    updateBlock(session.blockId, session.kind === 'move'
      ? { x: Math.max(0, session.originX + dx), y: Math.max(0, session.originY + dy) }
      : { width: Math.max(120, session.originW + dx), height: Math.max(56, session.originH + dy) });
  };
  const pointerEnd = () => { sessionRef.current = null; };

  const renderBlockBody = (block: NoteCanvasBlock) => {
    if (block.collapsed && block.kind !== 'toggle') return null;
    switch (block.kind) {
      case 'text': return <textarea aria-label={t('Text note container')} value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} className="w-full h-full resize-none bg-transparent p-3 text-xs text-slate-200 outline-none" />;
      case 'list': return <textarea aria-label={t('List note container')} value={block.items.join('\n')} onChange={(event) => updateBlock(block.id, { items: event.target.value.split('\n').slice(0, 256) })} className="w-full h-full resize-none bg-transparent p-3 text-xs text-slate-200 outline-none font-mono" />;
      case 'table': return <div className="p-2 overflow-auto h-full"><table className="w-full border-collapse text-[0.625rem]">{block.rows.map((row, r) => <tbody key={r}><tr>{row.map((cell, c) => <td key={c} className="border border-white/10 p-1"><input value={cell} onChange={(event) => { const rows = block.rows.map((source) => [...source]); rows[r][c] = event.target.value; updateBlock(block.id, { rows }); }} className="w-full bg-transparent outline-none text-slate-300" /></td>)}</tr></tbody>)}</table></div>;
      case 'image': return block.src ? <NotesImageBlockView block={block} onChange={(patch) => updateBlock(block.id, patch)} /> : <div className="h-full flex items-center justify-center text-slate-500 text-xs"><ImageIcon className="w-5 h-5 mr-2" />{t('Drop, paste or import an image here')}</div>;
      case 'media': return <NotesMediaMemoBlock memo={block.memo} onChange={(memo) => updateBlock(block.id, { memo })} />;
      case 'ink': { const safe = sanitizeNoteInkSvg(block.svg); return safe ? <div className="relative w-full h-full"><img alt={block.recognizedText ? `Editable ink drawing. Recognized text: ${block.recognizedText}` : 'Editable ink drawing'} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(safe)}`} className="w-full h-full object-contain pointer-events-none" />{onEditInk && <button type="button" onClick={() => onEditInk(block.id)} className="absolute right-2 bottom-2 px-2 py-1 rounded bg-slate-950/90 border border-cyan-500/30 text-[0.5625rem] text-cyan-200 hover:bg-cyan-950/80">{t('Edit ink')}</button>}</div> : <div className="h-full flex items-center justify-center text-red-300 text-xs">{t('Invalid ink payload')}</div>; }
      case 'file': { const attachment = attachments.find((item) => item.id === block.attachmentId); return <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-xs text-slate-300"><div className="flex items-center min-w-0"><FilePlus2 className="w-5 h-5 text-purple-400 mr-2 shrink-0" /><span className="truncate">{block.name}</span></div>{attachment && <button type="button" onClick={() => setPreviewAttachmentId(attachment.id)} className="rounded border border-purple-500/20 px-2 py-1 text-[0.5625rem] text-purple-200">{t('Open safe viewer')}</button>}</div>; }
      case 'embed': {
        if (block.workspace) return <NotesWorkspaceEmbedBlock embed={block.workspace} workspaceDocuments={workspaceDocuments} onOpenSource={onOpenWorkspaceDocument} onChange={(workspace) => updateBlock(block.id, { workspace, title: workspace.title, reference: workspace.uri, frozen: workspace.mode === 'Frozen' })} />;
        const isHttps = /^https:\/\//i.test(block.reference);
        return <div className="p-3 space-y-2 text-xs">
          <input value={block.title} onChange={(event) => updateBlock(block.id, { title: event.target.value.slice(0, 256) })} className="w-full bg-transparent text-slate-200 font-semibold outline-none" />
          <input value={block.reference} onChange={(event) => updateBlock(block.id, { reference: event.target.value.slice(0, 2048) })} className="w-full bg-slate-950/60 border border-white/10 rounded px-2 py-1 text-[0.625rem] font-mono text-cyan-300 outline-none" aria-label={t('Web link URL')} />
          <div className="rounded border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[0.5625rem] leading-relaxed text-slate-500">{t('No metadata, thumbnail, favicon or remote asset is fetched automatically. External preview is user-triggered and must pass NetGate policy.')}</div>
          <button type="button" disabled={!isHttps || !onOpenExternalUrl} onClick={() => { if (isHttps && onOpenExternalUrl) void onOpenExternalUrl(block.reference); }} className="rounded border border-cyan-500/20 px-2 py-1 text-[0.5625rem] text-cyan-200 disabled:opacity-40">{!isHttps ? t('Enter an HTTPS URL') : onOpenExternalUrl ? t('Preview externally via NetGate') : t('NetGate unavailable')}</button>
        </div>;
      }
      case 'toggle': return <div className="p-3"><button type="button" onClick={() => updateBlock(block.id, { collapsed: !block.collapsed })} className="flex items-center gap-1 text-xs font-semibold text-slate-200">{block.collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}{block.title}</button>{!block.collapsed && <textarea value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} className="mt-2 w-full h-20 resize-none bg-transparent text-xs text-slate-300 outline-none" />}</div>;
    }
  };

  return <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
    <div className="h-10 px-3 border-b border-white/10 flex items-center gap-1 overflow-x-auto shrink-0">
      <button type="button" onClick={() => add('text')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5"><Type className="w-3.5 h-3.5" />{t('Text')}</button>
      <button type="button" onClick={() => add('list')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5"><List className="w-3.5 h-3.5" />{t('List')}</button>
      <button type="button" onClick={() => add('table')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5"><Table2 className="w-3.5 h-3.5" />{t('Table')}</button>
      <button type="button" onClick={() => add('toggle')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5"><PanelTopClose className="w-3.5 h-3.5" />{t('Toggle')}</button>
      <button type="button" onClick={() => onOpenWorkspaceEmbed ? onOpenWorkspaceEmbed() : add('embed')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5"><Layers className="w-3.5 h-3.5" />{t('Workspace')}</button>
      <button type="button" onClick={addWebLink} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5"><Globe2 className="w-3.5 h-3.5" />{t('Web link')}</button>
      <label className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"><Paperclip className="w-3.5 h-3.5" />{t('File')}<input type="file" multiple className="hidden" onChange={async (event) => { const files = Array.from(event.target.files ?? []) as File[]; event.currentTarget.value = ''; if (files.length) await onDropFiles(files.slice(0, 16), 72, 72); }} /></label>
      <label className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"><ImageIcon className="w-3.5 h-3.5" />{t('Image')}<input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={async (event) => { const files = Array.from(event.target.files ?? []) as File[]; event.currentTarget.value = ''; if (files.length) await onDropFiles(files.slice(0, 16), 72, 72); }} /></label>
      {/*
        **W-430:** Die Beschriftungen sind **wörtlich dieselben** wie an der Tintenfläche
        (`NotesInkCanvasModal`: „Ink zoom", „Zoom in ink canvas", „Zoom out ink canvas") — *eine Zoom-Sprache
        für dieselbe Sache.* Sie stehen bewusst **nicht** im Katalog: die vorhandenen Zoom-Beschriftungen von
        Tinte und Anhangvorschau stehen dort auch nicht, und ein `t()` über einen fehlenden Schlüssel würde eine
        Übersetzung **behaupten**, die es nicht gibt. *Der fehlende Katalogeintrag ist als Befund gemeldet, nicht
        hier heimlich erfunden.*
      */}
      <div className="w-px h-5 bg-white/10 mx-1" />
      <div role="group" aria-label="Canvas zoom" className="flex items-center gap-0.5 rounded border border-white/10 px-1 py-0.5">
        <button type="button" onClick={() => setZoom((current) => stepInkZoom(current, -1))} disabled={zoom <= NOTE_INK_MIN_ZOOM} aria-label="Zoom out canvas" title="Zoom out canvas" className="p-0.5 rounded text-slate-400 hover:text-white disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"><Minus className="w-3 h-3" /></button>
        <button type="button" onClick={() => setZoom(1)} aria-label={`Canvas zoom ${formatNotePreviewZoom(zoom)}, reset to 100 percent`} title="Reset canvas zoom to 100 percent" className="min-w-11 rounded px-1 py-0.5 text-[0.625rem] font-mono text-slate-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]">{formatNotePreviewZoom(zoom)}</button>
        <button type="button" onClick={() => setZoom((current) => stepInkZoom(current, 1))} disabled={zoom >= NOTE_INK_MAX_ZOOM} aria-label="Zoom in canvas" title="Zoom in canvas" className="p-0.5 rounded text-slate-400 hover:text-white disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"><Plus className="w-3 h-3" /></button>
      </div>
      <div className="w-px h-5 bg-white/10 mx-1" />
      <select value={state.background} onChange={(event) => onChange({ ...state, background: event.target.value as NoteCanvasState['background'] })} className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-300"><option value="plain">{t('Plain')}</option><option value="grid">{t('Grid')}</option><option value="ruled">{t('Ruled')}</option><option value="dots">{t('Dots')}</option></select>
      <select value={state.pageMode} onChange={(event) => onChange({ ...state, pageMode: event.target.value as NoteCanvasState['pageMode'] })} className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-300"><option value="infinite">{t('Infinite')}</option><option value="fixed">{t('Printable')}</option></select>
      {state.pageMode === 'fixed' && <select value={state.pageSize} onChange={(event) => onChange({ ...state, pageSize: event.target.value as NoteCanvasState['pageSize'] })} className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-300"><option>A4</option><option>Letter</option><option>A5</option><option>{t('Custom')}</option></select>}
      {state.pageMode === 'fixed' && state.pageSize === 'Custom' && <><input aria-label={t('Custom page width')} type="number" min={320} max={4000} value={state.customWidthPx ?? 960} onChange={(event) => onChange({ ...state, customWidthPx: Math.max(320, Math.min(4000, Number(event.target.value) || 960)) })} className="w-20 bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-300" /><span className="text-[0.625rem] text-slate-600">×</span><input aria-label={t('Custom page height')} type="number" min={320} max={8000} value={state.customHeightPx ?? 1280} onChange={(event) => onChange({ ...state, customHeightPx: Math.max(320, Math.min(8000, Number(event.target.value) || 1280)) })} className="w-20 bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-300" /></>}
    </div>
    <div ref={scrollRef} tabIndex={0} onKeyDown={handleCanvasZoomKeyDown} aria-label="Free canvas surface" className="flex-1 overflow-auto p-6 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--vgt-focus)]" onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files') || event.dataTransfer.types.includes(NOTE_PAGE_DRAG_MIME)) event.preventDefault(); }} onDrop={async (event) => { if (!surfaceRef.current) return; if (handleNotePageDrop(event, surfaceRef.current)) { event.preventDefault(); event.stopPropagation(); return; } if (!event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); const rect = surfaceRef.current.getBoundingClientRect(); await onDropFiles(Array.from(event.dataTransfer.files) as File[], Math.max(0, event.clientX - rect.left), Math.max(0, event.clientY - rect.top)); }} onPaste={async (event: React.ClipboardEvent<HTMLDivElement>) => { const files = (Array.from(event.clipboardData.files) as File[]).filter((file) => file.type.startsWith('image/')); if (!files.length) return; event.preventDefault(); await onDropFiles(files, 72, 72); }}>
      {/*
        **W-430:** Die gezoomte Fläche bekommt einen **mitwachsenden Layout-Kasten**. Ohne ihn bliebe der
        Scrollbereich so groß wie bei Zoom 1, und die vergrößerte Leinwand wäre nicht erreichbar — *Zoom ohne
        Schwenk ist eine halbe Fähigkeit.* Bei Zoom 1 sind Kasten und Fläche deckungsgleich: **byte-identisch**.
        Keine Animation, also auch nichts, was `prefers-reduced-motion` abzuschalten hätte.
      */}
      <div style={{ width: size.width * zoom, minHeight: size.minHeight * zoom }} className="mx-auto">
        <div ref={surfaceRef} onPointerDown={() => setSelectedId(null)} style={{ width: size.width, minHeight: size.minHeight, backgroundColor: state.backgroundColor, transform: `scale(${zoom})`, transformOrigin: 'top left', ...backgroundStyle }} className={`relative border ${state.pageMode === 'fixed' ? 'border-white/15 shadow-2xl' : 'border-white/[0.05]'} rounded-sm overflow-hidden`}>
          {state.blocks.map((block) => <section key={block.id} data-notes-canvas-block={block.id} aria-label={`${blockLabel(block.kind)} ${t('note block')}`} tabIndex={0} style={{ left: block.x, top: block.y, width: block.width, height: block.collapsed && block.kind !== 'toggle' ? 34 : block.height, zIndex: block.zIndex }} onFocus={() => setSelectedId(block.id)} onKeyDown={(event) => handleBlockKeyDown(event, block)} className={`absolute rounded-xl bg-slate-900/90 border shadow-xl overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${selectedId === block.id ? 'border-cyan-500/70 ring-1 ring-cyan-500/20' : 'border-white/10'}`}>
            <header onPointerDown={(event) => pointerStart(event, block, 'move')} className="h-7 px-2 flex items-center gap-1 bg-slate-950/80 border-b border-white/[0.07] cursor-grab select-none"><Grip className="w-3 h-3 text-slate-600" /><span className="text-[0.5625rem] uppercase tracking-wider text-slate-500 flex-1">{blockLabel(block.kind)}</span><button type="button" onClick={() => onChange(moveCanvasBlockLayer(state, block.id, 'front'))} className="p-0.5 text-slate-600 hover:text-white" aria-label={t('Bring to front')} title={t('Bring to front')}><ChevronUp className="w-3 h-3" /></button><button type="button" onClick={() => onChange(moveCanvasBlockLayer(state, block.id, 'back'))} className="p-0.5 text-slate-600 hover:text-white" aria-label={t('Send to back')} title={t('Send to back')}><ChevronDown className="w-3 h-3" /></button><button type="button" onClick={() => onChange(deleteCanvasBlock(state, block.id))} className="p-0.5 text-slate-600 hover:text-red-300" aria-label={t('Delete block')} title={t('Delete block')}><Trash2 className="w-3 h-3" /></button></header>
            <div style={{ height: 'calc(100% - 28px)' }}>{renderBlockBody(block)}</div>
            <div onPointerDown={(event) => pointerStart(event, block, 'resize')} className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize"><span className="absolute right-1 bottom-1 w-2 h-2 border-r border-b border-cyan-400/70" /></div>
          </section>)}
          {state.blocks.length === 0 && <button type="button" onClick={() => add('text')} className="absolute left-12 top-12 px-4 py-3 rounded-xl border border-dashed border-white/15 text-xs text-slate-500 hover:text-cyan-300 hover:border-cyan-500/30 flex items-center gap-2"><Plus className="w-4 h-4" />{t('Add your first free-position note container')}</button>}
        </div>
      </div>
    </div>
    <NotesAttachmentPreviewModal attachment={attachments.find((item) => item.id === previewAttachmentId) ?? null} onClose={() => setPreviewAttachmentId(null)} />
    {status && <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 border-t border-white/10 bg-slate-900/70 px-3 py-1 text-[0.625rem] text-slate-300"><span>{status}</span><button type="button" onClick={() => setStatus(null)} className="text-slate-500 hover:text-slate-200" aria-label="Dismiss canvas message">Dismiss</button></div>}
  </div>;
};
