// STATUS: PLATIN — Notes page body, editing surface, and callback-only mutations.
import React, { useEffect, useState } from 'react';
import { NotesEditorToolbar } from './toolbar/NotesEditorToolbar';
import { MarkdownPreview } from './markdown/markdownRenderer';
import { BacklinksPanel } from '../knowledge-graph/BacklinksPanel';
import { NotesFreeCanvas } from '../canvas/NotesFreeCanvas';
import { NotesWorkspaceDropZoneSurface } from '../drop-zone/NotesWorkspaceDropZoneSurface';
import type { NotesWorkspaceDropZoneBindings } from '../drop-zone/useNotesWorkspaceDropZone';
import { addCanvasBlock, blockFromAttachment, createCanvasBlock, normalizeNoteCanvas } from '../canvas/notesCanvasModel';
import { continueMarkdownStructure } from './markdown/notesMarkdownEditing';
import { resolveNoteEntryFocus } from './notesEditorFocus';
import { NotesQuickInsertMenu, resolveQuickInsertKey } from './NotesQuickInsertMenu';
import { NotesEditorNotice } from './NotesEditorNotice';
import { applyQuickInsertItem, filterQuickInsertItems, resolveSlashMenu, type NotesQuickInsertAction, type NotesQuickInsertItem } from './notesQuickInsert';
import { exportNoteMarkdown, exportNoteHtml, exportNotePdf } from '../interchange/notesExport';
import { fileToNoteAttachment } from '../media/noteAttachments';
import {
  BookOpen, Edit3, Columns, Eye, Minimize2, Maximize2, ShieldCheck, Calendar, FileText,
  Network, FileDown, PenTool, Mic, Search, History, Share2, Scan, FileStack, Users,
  LockKeyhole, Undo2, Redo2, ChevronDown, WifiOff,
} from 'lucide-react';
import { resolveNotesOfflineState } from '../model/notesOfflinePolicy';
import type { NotesEditorController } from './useNotesEditorController';

interface NotesEditorBodyProps {
  editor: NotesEditorController;
  /**
   * **Paket 12:** die Bindung der Ablagezone. Sie liegt **um** die freie Leinwand (Geschwister der Leinwand, nicht
   * in ihr): *die Leinwand behält ihre Zeigergesten und ihr Scrollen, und die Zone steht daneben.* Fehlt sie,
   * rendert der Rumpf **unverändert**.
   */
  dropZone?: NotesWorkspaceDropZoneBindings;
}

export const NotesEditorBody: React.FC<NotesEditorBodyProps> = ({ editor, dropZone }) => {
  const {
    workspaceDocuments,
    onOpenWorkspaceDocument,
    onOpenExternalUrl,
    collaboration,
    activeNotebook,
    activeSection,
    activePage,
    allPagesList,
    linkedMentions,
    outgoingLinks,
    unlinkedMentions,
    brokenLinks,
    relatedNotes,
    referenceCount,
    resolveKnowledgeReference,
    handleAddAlias,
    handleRemoveAlias,
    handleCreatePage,
    handleUpdateCurrentPage,
    handleSetProperty,
    handleRemoveProperty,
    navigateToPage,
    addAttachment,
    removeAttachment,
    handleAddTag,
    handleRemoveTag,
    togglePinned,
    toggleFavorite,
    toggleArchived,
    viewMode,
    setViewMode,
    isFocusMode,
    setIsFocusMode,
    setIsKnowledgeGraphOpen,
    setIsInkOpen,
    setEditingInkBlockId,
    setIsAudioOpen,
    setIsFindReplaceOpen,
    setIsHistoryOpen,
    setIsCrossAppOpen,
    setIsOcrOpen,
    setIsRoundtripOpen,
    setIsTemplatesOpen,
    setIsWorkspaceEmbedOpen,
    setIsSecurityOpen,
    setIsCollaborationOpen,
    setIsImportExportOpen,
    textareaRef,
    insertFormatting,
    insertBacklinkAtCursor,
    insertTextAtCursor,
    metrics,
    formatTime,
    activePageLocked,
    handleConvertChecklistToTask,
    tagDefinitions,
    bodyFocusRequest,
    isQuickInsertOpen,
    setIsQuickInsertOpen,
    notice,
    setNotice,
  } = editor;

  /**
   * AST-0656: the slash menu context is derived from the real caret, never from a guessed offset, so the
   * visible list and the text that is replaced can never disagree.
   */
  const [quickInsert, setQuickInsert] = useState<{ start: number; end: number; query: string } | null>(null);
  const [quickInsertIndex, setQuickInsertIndex] = useState(0);
  const [quickInsertNotice, setQuickInsertNotice] = useState<string | null>(null);

  const isMenuOpen = Boolean(quickInsert) || isQuickInsertOpen;

  /**
   * Release Beta 0.1 (export integrity): the export menu states whether the file was confirmed
   * written or only downloaded, and a failure is named instead of disappearing.
   */
  const runNoteExport = (task: Promise<import('../../../shared/interchange/exportDelivery').ExportDeliveryResult>) => {
    void task
      .then((result) => setNotice(result.mode === 'file'
        ? `${result.fileName} saved.`
        : `Download started: ${result.fileName} (browser mode – no write confirmation).`))
      .catch((error: unknown) => setNotice(`Export failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  /**
   * AST-0741: the local-first claim is shown as a real state instead of a static badge. Notes performs no
   * network operation at all (`NOTES_NETWORK_OPERATIONS` is empty), so an offline session changes nothing
   * about editing — and the UI now says which mode the user is in.
   */
  const [offlineState, setOfflineState] = useState(() => resolveNotesOfflineState({
    onLine: typeof navigator === 'undefined' ? undefined : navigator.onLine,
    protectedNote: false,
  }));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setOfflineState(resolveNotesOfflineState({ onLine: navigator.onLine, protectedNote: activePageLocked }));
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, [activePageLocked]);

  const closeQuickInsert = () => { setQuickInsert(null); setQuickInsertIndex(0); setIsQuickInsertOpen(false); };

  const syncQuickInsertWithCaret = (value: string, caret: number) => {
    const context = resolveSlashMenu(value, caret);
    if (context) { setQuickInsert(context); setQuickInsertIndex(0); return; }
    if (!isQuickInsertOpen) setQuickInsert(null);
  };

  const applyQuickInsert = (item: NotesQuickInsertItem) => {
    const context = quickInsert ?? { start: textareaRef.current?.selectionStart ?? 0, end: textareaRef.current?.selectionStart ?? 0, query: '' };
    const result = applyQuickInsertItem(context, item, activePage?.content ?? '');
    handleUpdateCurrentPage({ content: result.content });
    setQuickInsert(null);
    setQuickInsertIndex(0);
    setIsQuickInsertOpen(false);
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(result.caret, result.caret);
    }, 0);
  };

  const handleQuickInsertAction = (action: NotesQuickInsertAction) => {
    // Media entries remove the typed query, then hand over to the existing canonical entry point.
    const context = quickInsert ?? { start: textareaRef.current?.selectionStart ?? 0, end: textareaRef.current?.selectionStart ?? 0, query: '' };
    const result = applyQuickInsertItem(context, { id: action, label: action, description: '', group: 'media', keywords: [], action }, activePage?.content ?? '');
    if (result.content !== activePage?.content) handleUpdateCurrentPage({ content: result.content });
    closeQuickInsert();
    if (action === 'ink') { setEditingInkBlockId(null); setIsInkOpen(true); return; }
    if (action === 'voice') { setIsAudioOpen(true); return; }
    if (action === 'ocr') { setIsOcrOpen(true); return; }
    if (action === 'embed') { setIsWorkspaceEmbedOpen(true); return; }
  };

  const handleMenuKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!isMenuOpen) return false;
    const candidates = filterQuickInsertItems(quickInsert?.query ?? '');
    const command = resolveQuickInsertKey(event.key, candidates.length, quickInsertIndex);
    if (!command) return false;
    event.preventDefault();
    if (command.type === 'move') { setQuickInsertIndex(command.index); return true; }
    if (command.type === 'close') { closeQuickInsert(); return true; }
    const item = candidates[quickInsertIndex] ?? candidates[0];
    if (!item) { closeQuickInsert(); return true; }
    if (item.action) handleQuickInsertAction(item.action);
    else applyQuickInsert(item);
    return true;
  };

  /**
   * AST-0641: a create action asks for direct entry. The plan comes from the pure resolver, so the rule
   * ("document mode, body visible, caret at the end") lives in `notesEditorFocus`, not in this component.
   */
  useEffect(() => {
    const plan = resolveNoteEntryFocus({
      activePageId: activePage?.id ?? null,
      content: activePage?.content ?? '',
      editorMode: activePage?.editorMode,
      viewMode,
      focusRequest: bodyFocusRequest,
      locked: activePageLocked,
    });
    if (!plan) return;
    if (plan.viewMode !== viewMode) setViewMode(plan.viewMode);
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(plan.caret, plan.caret);
  }, [bodyFocusRequest, activePage?.id, activePage?.content, activePage?.editorMode, activePageLocked, viewMode, setViewMode]);

  return (
      <main
        data-vgt-notes-chrome="editor-surface"
        className="flex-1 flex flex-col h-full bg-[#0a0d14] overflow-hidden"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={async (event) => {
          if (!activePage || event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          let existing = activePage.attachments ?? [];
          for (const file of Array.from(event.dataTransfer.files as FileList)) {
            try {
              const attachment = await fileToNoteAttachment(file, existing);
              addAttachment(attachment);
              existing = [...existing, attachment];
            } catch (error) {
              console.warn('Note attachment rejected:', error);
            }
          }
        }}
      >
        {activePage && !activePageLocked ? (
          <>
            {/* Top Editor Bar: Breadcrumb, View Mode, Focus Mode */}
            <div className="vgt-app-toolbar-band flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-3 py-1.5 text-xs backdrop-blur-md sm:px-4" data-vgt-app-toolbar-band="notes-editor">
              <div className="flex min-w-0 flex-1 items-center space-x-2 truncate text-[0.6875rem] text-[var(--vgt-control-muted)]">
                <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="font-semibold text-slate-300 truncate">
                  {activeNotebook?.title}
                </span>
                <span>/</span>
                <span className="truncate">{activeSection?.title}</span>
                <span>/</span>
                <span className="text-blue-300 font-medium truncate">
                  {activePage.title}
                </span>
              </div>

              {/* Toolbar Controls */}
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                <div className="flex items-center gap-0.5 rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-0.5" aria-label="Note history controls">
                  <button type="button" onClick={collaboration.undo} disabled={!collaboration.canUndo} className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] disabled:opacity-30" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo last Notes edit"><Undo2 className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={collaboration.redo} disabled={!collaboration.canRedo} className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] disabled:opacity-30" title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo last Notes edit"><Redo2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-0.5 text-[0.6875rem]" aria-label="Notes editing mode">
                  <button type="button" onClick={() => handleUpdateCurrentPage({ editorMode: 'document' })} aria-pressed={activePage.editorMode !== 'freeform'} className={`rounded-md px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${activePage.editorMode !== 'freeform' ? 'bg-[var(--vgt-accent-soft)] text-[var(--vgt-accent-strong)]' : 'text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'}`}>Document</button>
                  <button type="button" onClick={() => {
                    let canvas = normalizeNoteCanvas(activePage.canvas);
                    if (!activePage.canvas && activePage.content.trim()) {
                      const initial = { ...createCanvasBlock('text', 56, 56), kind: 'text' as const, text: activePage.content };
                      canvas = addCanvasBlock(canvas, initial);
                    }
                    handleUpdateCurrentPage({ editorMode: 'freeform', canvas });
                  }} aria-pressed={activePage.editorMode === 'freeform'} className={`rounded-md px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${activePage.editorMode === 'freeform' ? 'bg-[var(--vgt-accent-soft)] text-[var(--vgt-accent-strong)]' : 'text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'}`}>Canvas</button>
                </div>
                {activePage.editorMode !== 'freeform' && <div className="flex items-center rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-0.5 text-[0.6875rem]" aria-label="Notes view mode">
                  <button
                    type="button"
                    onClick={() => setViewMode('edit')}
                    aria-pressed={viewMode === 'edit'}
                    className={`flex items-center space-x-1 rounded-md px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${
                      viewMode === 'edit'
                        ? 'bg-[var(--vgt-accent-soft)] font-medium text-[var(--vgt-accent-strong)]'
                        : 'text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'
                    }`}
                    title="Edit Markdown"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('split')}
                    aria-pressed={viewMode === 'split'}
                    className={`flex items-center space-x-1 rounded-md px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${
                      viewMode === 'split'
                        ? 'bg-[var(--vgt-accent-soft)] font-medium text-[var(--vgt-accent-strong)]'
                        : 'text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'
                    }`}
                    title="Split View"
                  >
                    <Columns className="w-3 h-3" />
                    <span className="hidden sm:inline">Split</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('preview')}
                    aria-pressed={viewMode === 'preview'}
                    className={`flex items-center space-x-1 rounded-md px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] ${
                      viewMode === 'preview'
                        ? 'bg-[var(--vgt-accent-soft)] font-medium text-[var(--vgt-accent-strong)]'
                        : 'text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]'
                    }`}
                    title="Live Preview"
                  >
                    <Eye className="w-3 h-3" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                </div>}

                {activePage && (
                  <details className="relative shrink-0">
                    <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] [&::-webkit-details-marker]:hidden">
                      <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
                      Export
                      <ChevronDown aria-hidden="true" className="h-3 w-3" />
                    </summary>
                    <div className="absolute right-0 top-full z-40 mt-2 grid min-w-44 gap-1 rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                      <button type="button" onClick={() => runNoteExport(exportNoteMarkdown(activePage))} className="rounded-md px-3 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]">Markdown (.md)</button>
                      <button type="button" onClick={() => runNoteExport(exportNoteHtml(activePage))} className="rounded-md px-3 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]">HTML</button>
                      <button type="button" onClick={() => runNoteExport(exportNotePdf(activePage))} className="rounded-md px-3 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]">PDF</button>
                      <button type="button" onClick={() => setIsImportExportOpen(true)} className="rounded-md px-3 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Scoped Import / Export">Import / Export</button>
                    </div>
                  </details>
                )}

                <button type="button" onClick={() => setIsFindReplaceOpen(true)} className="rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Find & Replace" title="Find & Replace"><Search className="h-3.5 w-3.5" /></button>

                <details className="relative shrink-0">
                  <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] [&::-webkit-details-marker]:hidden">
                    Weitere Tools
                    <ChevronDown aria-hidden="true" className="h-3 w-3" />
                  </summary>
                  <div className="absolute right-0 top-full z-40 mt-2 grid w-[min(22rem,88vw)] grid-cols-2 gap-1 rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                    <button type="button" onClick={() => { setEditingInkBlockId(null); setIsInkOpen(true); }} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Ink & Vector Sketch" title="Ink & Vector Sketch"><PenTool aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Sketch</span></button>
                    <button type="button" onClick={() => setIsAudioOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Voice Memo & Timestamps" title="Voice Memo & Timestamps"><Mic aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Voice memo</span></button>
                    <button type="button" onClick={() => setIsOcrOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Local OCR & Scan Recognition" title="Local OCR & Scan Recognition"><Scan aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Local OCR</span></button>
                    <button type="button" onClick={() => setIsRoundtripOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="OneNote/ENEX Universal Interoperability" title="OneNote/ENEX Universal Interoperability"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Interoperability</span></button>
                    <button type="button" onClick={() => setIsSecurityOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Notes Security & .vnote" title="Notes Security & .vnote"><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Security</span></button>
                    <button type="button" onClick={() => setIsCollaborationOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Collaboration, Comments & Mentions" title="Collaboration, Comments & Mentions"><Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Collaboration</span></button>
                    <button type="button" onClick={() => setIsHistoryOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Version History" title="Version History"><History aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">History</span></button>
                    <button type="button" onClick={() => setIsTemplatesOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Notebook / Section / Page Templates" title="Notebook / Section / Page Templates"><FileStack aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Templates</span></button>
                    <button type="button" onClick={() => setIsCrossAppOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Cross-App Dispatch" title="Cross-App Dispatch"><Share2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Send to app</span></button>
                    <button type="button" onClick={() => setIsKnowledgeGraphOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.6875rem] text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label="Open Sovereign Knowledge Graph" title="Open Sovereign Knowledge Graph"><Network aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Knowledge graph</span></button>
                  </div>
                </details>

                {/* Focus Mode Button */}
                <button type="button" aria-pressed={isFocusMode} aria-label={isFocusMode ? 'Exit Full Width' : 'Full Width Focus'}
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  className="rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
                  title={isFocusMode ? 'Exit Full Width' : 'Full Width Focus'}
                >
                  {isFocusMode ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Note Metadata Header & Formatting Toolbar */}
            <NotesEditorToolbar
              title={activePage.title}
              onUpdateTitle={(title) => handleUpdateCurrentPage({ title })}
              tags={activePage.tags}
              tagDefinitions={tagDefinitions}
              aliases={activePage.aliases ?? []}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              onAddAlias={handleAddAlias}
              onRemoveAlias={handleRemoveAlias}
              allPagesList={allPagesList}
              activePageId={activePage.id}
              onInsertBacklink={insertBacklinkAtCursor}
              onInsertFormatting={insertFormatting}
              onInsertText={insertTextAtCursor}
              pinned={Boolean(activePage.pinned)}
              favorite={Boolean(activePage.favorite)}
              archived={Boolean(activePage.archived)}
              attachments={activePage.attachments ?? []}
              onTogglePinned={togglePinned}
              onToggleFavorite={toggleFavorite}
              onToggleArchived={toggleArchived}
              onAddAttachment={addAttachment}
              onRemoveAttachment={removeAttachment}
              properties={activePage.properties ?? {}}
              onSetProperty={handleSetProperty}
              onRemoveProperty={handleRemoveProperty}
              showFormattingToolbar={activePage.editorMode !== 'freeform' && viewMode !== 'preview'}
            />

            {/* Note Workspace Body (Document / Freeform Canvas) */}
            {activePage.editorMode === 'freeform' ? (
              <NotesWorkspaceDropZoneSurface surface="canvas" zone={dropZone} className="flex-1 flex flex-col overflow-hidden">
              <NotesFreeCanvas
                canvas={activePage.canvas}
                onChange={(canvas) => handleUpdateCurrentPage({ canvas, editorMode: 'freeform' })}
                onDropFiles={async (files, x, y) => {
                  let attachments = [...(activePage.attachments ?? [])];
                  let canvas = normalizeNoteCanvas(activePage.canvas);
                  for (const [index, file] of files.slice(0, 16).entries()) {
                    const attachment = await fileToNoteAttachment(file, attachments);
                    attachments = [...attachments, attachment];
                    canvas = addCanvasBlock(canvas, blockFromAttachment(attachment, x + index * 18, y + index * 18));
                  }
                  handleUpdateCurrentPage({ attachments, canvas, editorMode: 'freeform' });
                }}
                onEditInk={(blockId) => { setEditingInkBlockId(blockId); setIsInkOpen(true); }}
                attachments={activePage.attachments ?? []}
                workspaceDocuments={workspaceDocuments}
                onOpenWorkspaceDocument={onOpenWorkspaceDocument}
                onOpenExternalUrl={onOpenExternalUrl}
                onOpenWorkspaceEmbed={() => setIsWorkspaceEmbedOpen(true)}
              />
              </NotesWorkspaceDropZoneSurface>
            ) : (
            <div className="flex-1 flex overflow-hidden">
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div
                  className={`relative flex-1 flex flex-col p-6 overflow-y-auto ${
                    viewMode === 'split' ? 'border-r border-white/[0.06]' : ''
                  }`}
                >
                  {isMenuOpen && (
                    <NotesQuickInsertMenu
                      query={quickInsert?.query ?? ''}
                      activeIndex={quickInsertIndex}
                      onActiveIndexChange={setQuickInsertIndex}
                      attachments={activePage.attachments ?? []}
                      onAddAttachment={addAttachment}
                      onInsertAttachmentReference={(attachment) => {
                        const reference = attachment.mimeType.startsWith('image/')
                          ? `\n![${attachment.name}](${attachment.id})\n`
                          : `\n[${attachment.name}](${attachment.id})\n`;
                        insertTextAtCursor(reference);
                      }}
                      onAttachmentError={setQuickInsertNotice}
                      onApply={applyQuickInsert}
                      onAction={handleQuickInsertAction}
                      onClose={closeQuickInsert}
                    />
                  )}
                  <textarea
                    ref={textareaRef}
                    dir="auto"
                    data-notes-live-markdown-editor="true"
                    data-vgt-app-guide-anchor="Notes:second"
                    aria-label="Note body markdown editor"
                    aria-multiline="true"
                    aria-expanded={isMenuOpen}
                    aria-controls={isMenuOpen ? 'notes-quick-insert-list' : undefined}
                    value={activePage.content}
                    onChange={(e) =>
                      { handleUpdateCurrentPage({ content: e.target.value }); syncQuickInsertWithCaret(e.target.value, e.target.selectionStart); }
                    }
                    onKeyDown={(event) => {
                      if (handleMenuKey(event)) return;
                      if (event.key === 'Escape' && isQuickInsertOpen) { closeQuickInsert(); return; }
                      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); insertFormatting('**', '**'); return; }
                      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') { event.preventDefault(); insertFormatting('*', '*'); return; }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        const textarea = textareaRef.current;
                        if (!textarea) return;
                        const result = continueMarkdownStructure(activePage.content, textarea.selectionStart);
                        if (result) {
                          event.preventDefault();
                          handleUpdateCurrentPage({ content: result.content });
                          window.setTimeout(() => { textarea.focus(); textarea.setSelectionRange(result.cursor, result.cursor); }, 0);
                        }
                      }
                    }}
                    placeholder="Type sovereign notes or markdown here..."
                    className="w-full h-full bg-transparent text-slate-200 outline-none resize-none font-mono text-xs leading-relaxed selection:bg-blue-600/40 select-text"
                  />
                  {quickInsertNotice && <div role="status" aria-live="polite" className="mt-2 text-[0.6875rem] text-red-300">{quickInsertNotice}</div>}
                  {isMenuOpen && <span id="notes-quick-insert-list" className="sr-only">Quick insert building blocks</span>}
                </div>
              )}

              {(viewMode === 'preview' || viewMode === 'split') && (
                <div dir="auto" data-notes-live-wysiwyg-preview="true" className="flex-1 flex flex-col p-6 overflow-y-auto select-text">
                  <div className="max-w-3xl">
                    <MarkdownPreview
                      content={activePage.content}
                      onNavigateToPage={navigateToPage}
                      onUpdateContent={(content) => handleUpdateCurrentPage({ content })}
                      resolveKnowledgeReference={resolveKnowledgeReference}
                      onConvertChecklistToTask={handleConvertChecklistToTask}
                    />

                    {/* Backlinks & Linked Mentions */}
                    <BacklinksPanel
                      linkedMentions={linkedMentions}
                      outgoingLinks={outgoingLinks}
                      unlinkedMentions={unlinkedMentions}
                      brokenLinks={brokenLinks}
                      relatedNotes={relatedNotes}
                      allPagesList={allPagesList}
                      referenceCount={referenceCount}
                      onNavigateToPage={navigateToPage}
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Mutation feedback: every formerly silent no-op reports here (AST-0664/AST-0679). */}
            <NotesEditorNotice message={notice} onDismiss={() => setNotice(null)} />

            {/* Bottom Status Bar & Word Metrics */}
            <footer className="h-7 bg-slate-950 border-t border-white/[0.08] px-4 flex items-center justify-between text-[0.6875rem] text-slate-400 shrink-0 select-none">              <div className="flex items-center space-x-3 font-mono">
                <span>{metrics.words} words</span>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
                <span>{metrics.chars} chars</span>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
                <span>{metrics.lines} lines</span>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
                <span className="text-slate-300">{metrics.readTime}</span>
              </div>

              <div className="flex items-center space-x-3">
                {/* AST-0741: the offline/local-first state is named in text, not carried by colour alone. */}
                <span
                  data-notes-connectivity={offlineState.connectivity}
                  title={offlineState.detail}
                  className="flex items-center space-x-1 font-mono text-[0.625rem] text-slate-400"
                >
                  <WifiOff className="w-3 h-3" aria-hidden="true" />
                  <span>{offlineState.label}</span>
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
                <span className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[0.625rem]">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>AES-256-GCM Sovereign Storage</span>
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-700" />
                <span className="flex items-center space-x-1 text-slate-500 text-[0.625rem]">
                  <Calendar className="w-2.5 h-2.5" />
                  <span>Modified {formatTime(activePage.last_modified)}</span>
                </span>
              </div>
            </footer>
          </>
        ) : activePageLocked ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs space-y-3 p-8 text-center">
            <LockKeyhole className="w-9 h-9 text-amber-300" />
            <div className="font-semibold text-slate-200">Protected note locked</div>
            <p className="max-w-md text-[0.6875rem] text-slate-500">Content, attachment previews, OCR, transcripts and search indexing stay unavailable until the required additional-unlock policy is satisfied.</p>
            <button type="button" onClick={() => setIsSecurityOpen(true)} className="px-3 py-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-200">Open security controls</button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs space-y-3">
            <FileText className="w-8 h-8 text-slate-600" />
            <p>No note selected. Pick a note or create a new one.</p>
            <button onClick={() => handleCreatePage()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium text-xs shadow hover:bg-blue-500 transition-colors">Create Note</button>
          </div>
        )}
      </main>
  );
};
