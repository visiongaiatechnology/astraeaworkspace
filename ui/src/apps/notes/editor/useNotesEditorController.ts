// STATUS: PLATIN — Notes editor state and callback orchestration; document commits remain owned by the supplied host.
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { NotePageRevision } from '../../../shared/contracts/workspace';
import type { NotesEditorProps } from '../contracts/notesEditor';
import { useNotesCollaboration } from '../collaboration/useNotesCollaboration';
import { useNotesManager } from '../notebooks/useNotesManager';
import { useNotesWorkspaceIntegration } from '../integrations/useNotesWorkspaceIntegration';
import { viewModeForDirectEntry } from './notesEditorFocus';
import { resolveNotesEditorCommand } from './notesEditorShortcuts';

export function useNotesEditorController({
  document,
  onUpdateDocument,
  onUpdateWorkspaceDocument,
  onCreateDerivedDocument,
  onSelectSelectionType,
  workspaceDocuments = [],
  onOpenWorkspaceDocument,
  onOpenExternalUrl,
}: NotesEditorProps) {
  const collaboration = useNotesCollaboration(document, onUpdateDocument);
  const notes = useNotesManager(document, collaboration.commitDocument);
  const {
    activeNotebook,
    activeSection,
    activePage,
    noteSecurity,
  } = notes;

  const workspaceIntegration = useNotesWorkspaceIntegration({
    sourceDocument: document,
    activePage,
    workspaceDocuments,
    updateCurrentPage: notes.handleUpdateCurrentPage,
    onUpdateWorkspaceDocument,
    onCreateDerivedDocument,
  });

  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isKnowledgeGraphOpen, setIsKnowledgeGraphOpen] = useState(() => new URLSearchParams(window.location.search).get('modal') === 'knowledgeGraph');
  const [isInkOpen, setIsInkOpen] = useState(false);
  const [editingInkBlockId, setEditingInkBlockId] = useState<string | null>(null);
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCrossAppOpen, setIsCrossAppOpen] = useState(false);
  const [isOcrOpen, setIsOcrOpen] = useState(false);
  const [isRoundtripOpen, setIsRoundtripOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isWorkspaceEmbedOpen, setIsWorkspaceEmbedOpen] = useState(false);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [bodyFocusRequest, setBodyFocusRequest] = useState(0);
  const [isQuickInsertOpen, setIsQuickInsertOpen] = useState(false);
  /**
   * AST-0664/AST-0679: one visible notice channel for every mutation outcome that used to be a silent
   * no-op (checklist conversion, tag add/remove, backlink insert).
   */
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reportOutcome = <T extends { ok: boolean; message: string }>(run: () => T): T => {
    const outcome = run();
    setNotice(outcome.message);
    return outcome;
  };

  const handleAddTag = (tag: string) => reportOutcome(() => notes.handleAddTag(tag));
  const handleRemoveTag = (tag: string) => reportOutcome(() => notes.handleRemoveTag(tag));
  /**
   * AST-0721: a comment can be anchored to the exact selected passage. The selection is read from the body
   * textarea, so the anchor and the visible highlight cannot disagree.
   */
  const readBodySelection = (): string | null => {
    const textarea = textareaRef.current;
    if (!textarea) return null;
    const start = Math.min(textarea.selectionStart, textarea.selectionEnd);
    const end = Math.max(textarea.selectionStart, textarea.selectionEnd);
    return end > start ? textarea.value.slice(start, end) : null;
  };

  const handleAddComment = (body: string, authorId: string, authorName: string, parentId?: string | null) =>
    reportOutcome(() => notes.handleAddComment({ selection: readBodySelection(), body }, authorId, authorName, parentId));
  const handleRestoreRevision = (revision: NotePageRevision) => reportOutcome(() => notes.handleRestoreRevision(revision));

  const handleConvertChecklistToTask = (lineIndex: number) => reportOutcome(() => notes.handleConvertChecklistToTask(lineIndex));

  /**
   * AST-0641: creating a note is also a request to type in it. The counter is the only signal the body
   * needs, so plain navigation in the page list never steals the caret.
   */
  const requestDirectEntry = () => {
    setViewMode((current) => viewModeForDirectEntry(current));
    setBodyFocusRequest((current) => current + 1);
  };

  const handleCreatePage = (templateId?: string) => {
    const created = notes.handleCreatePage(templateId);
    if (created) requestDirectEntry();
    return created;
  };

  const handleCreateDailyNote = () => {
    const created = notes.handleCreateDailyNote();
    if (created) requestDirectEntry();
    return created;
  };

  const insertFormatting = (prefix: string, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !activePage) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = activePage.content;
    const selectedText = text.substring(start, end);
    const replacement = `${prefix}${selectedText || 'text'}${suffix}`;
    const newContent = text.substring(0, start) + replacement + text.substring(end);

    notes.handleUpdateCurrentPage({ content: newContent });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selectedText.length || 4)
      );
    }, 10);
  };

  /**
   * AST-0669: inserting a backlink used to be a silent no-op whenever the body textarea was not focused
   * (preview mode, focus mode, canvas page). The insertion now always has a target and reports the outcome.
   */
  const insertBacklinkAtCursor = (targetPageTitle: string) => {
    if (!activePage) { setNotice('No note is selected, so no link was inserted.'); return { ok: false, message: 'No note is selected, so no link was inserted.' }; }
    const snippet = `[[${targetPageTitle}]]`;
    const textarea = textareaRef.current;
    if (!textarea) {
      const next = activePage.content.length && !activePage.content.endsWith('\n') ? `${activePage.content}\n${snippet}` : `${activePage.content}${snippet}`;
      notes.handleUpdateCurrentPage({ content: next });
      setNotice(`Appended link to “${targetPageTitle}” at the end of the note.`);
      return { ok: true, message: `Appended link to “${targetPageTitle}” at the end of the note.` };
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = activePage.content.slice(0, start) + snippet + activePage.content.slice(end);
    notes.handleUpdateCurrentPage({ content: next });
    window.setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + snippet.length, start + snippet.length); }, 0);
    setNotice(`Inserted link to “${targetPageTitle}”.`);
    return { ok: true, message: `Inserted link to “${targetPageTitle}”.` };
  };

  const insertTextAtCursor = (value: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !activePage) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = activePage.content.slice(0, start) + value + activePage.content.slice(end);
    notes.handleUpdateCurrentPage({ content: next });
    window.setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + value.length, start + value.length); }, 0);
  };

  const metrics = useMemo(() => {
    if (!activePage) {
      return { words: 0, chars: 0, lines: 0, readTime: '0 min' };
    }
    const text = activePage.content.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const lines = text ? text.split('\n').length : 0;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return {
      words,
      chars,
      lines,
      readTime: `~${readTimeMinutes} min read`,
    };
  }, [activePage]);

  const formatTime = (ms: number) => {
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const activePageLocked = noteSecurity.isPageLocked(activeNotebook, activeSection, activePage);

  useEffect(() => {
    const onHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
      if (activePageLocked) return;
      event.preventDefault();
      if (event.shiftKey) collaboration.redo();
      else collaboration.undo();
    };
    window.addEventListener('keydown', onHistoryShortcut);
    return () => window.removeEventListener('keydown', onHistoryShortcut);
  }, [activePageLocked, collaboration.redo, collaboration.undo]);

  /**
   * AST-0646/AST-0746: the essential Notes functions are reachable from the keyboard without a global
   * listener that would fire while another app has focus — the resolver is attached to the Notes root.
   */
  const handleEditorKeyDown = (event: React.KeyboardEvent) => {
    const command = resolveNotesEditorCommand({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      locked: activePageLocked,
    });
    if (!command) return;
    event.preventDefault();
    if (command.type === 'setViewMode') setViewMode(command.viewMode);
    else if (command.type === 'toggleFocusMode') setIsFocusMode((current) => !current);
    else if (command.type === 'openFindReplace') setIsFindReplaceOpen(true);
    else if (command.type === 'openQuickInsert') {
      if (!activePage || activePage.editorMode === 'freeform') return;
      setViewMode((current) => viewModeForDirectEntry(current));
      setIsQuickInsertOpen(true);
    }
  };

  return {
    document,
    onSelectSelectionType,
    workspaceDocuments,
    onOpenWorkspaceDocument,
    onOpenExternalUrl,
    collaboration,
    ...notes,
    handleCreatePage,
    handleCreateDailyNote,
    handleAddTag,
    handleRemoveTag,
    handleConvertChecklistToTask,
    handleAddComment,
    handleRestoreRevision,
    readBodySelection,
    notice,
    setNotice,
    workspaceIntegration,
    viewMode,
    setViewMode,
    isFocusMode,
    setIsFocusMode,
    isQuickInsertOpen,
    setIsQuickInsertOpen,
    bodyFocusRequest,
    handleEditorKeyDown,
    isKnowledgeGraphOpen,
    setIsKnowledgeGraphOpen,
    isInkOpen,
    setIsInkOpen,
    editingInkBlockId,
    setEditingInkBlockId,
    isAudioOpen,
    setIsAudioOpen,
    isFindReplaceOpen,
    setIsFindReplaceOpen,
    isHistoryOpen,
    setIsHistoryOpen,
    isCrossAppOpen,
    setIsCrossAppOpen,
    isOcrOpen,
    setIsOcrOpen,
    isRoundtripOpen,
    setIsRoundtripOpen,
    isTemplatesOpen,
    setIsTemplatesOpen,
    isWorkspaceEmbedOpen,
    setIsWorkspaceEmbedOpen,
    isCollaborationOpen,
    setIsCollaborationOpen,
    isSecurityOpen,
    setIsSecurityOpen,
    isImportExportOpen,
    setIsImportExportOpen,
    textareaRef,
    insertFormatting,
    insertBacklinkAtCursor,
    insertTextAtCursor,
    metrics,
    formatTime,
    activePageLocked,
  };
}

export type NotesEditorController = ReturnType<typeof useNotesEditorController>;
