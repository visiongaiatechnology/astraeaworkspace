// STATUS: DIAMANT VGT SUPREME
import React, { useRef, useState } from 'react';
import type {
  Paragraph,
  WriterEquationBlockData,
  WriterFootnote,
  WriterImageBlockData,
  WriterNamedVersion,
  WriterSectionDefinition,
  WriterTableBlockData,
} from '../../../../shared/contracts/workspace';
import { WriterComment, WriterRevision, WriterBookmark, ActiveTabSidebar } from '../../types';
import {
  ListTree,
  Search,
  Hash,
  ChevronRight,
  X,
  Bookmark,
  MessageSquare,
  GitCommit,
  Trash2,
  CornerDownRight,
  Send,
  FileText,
} from 'lucide-react';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import type { WriterClipboardEntry } from '../../productivity/clipboard/writerClipboardHistory';
import type { WriterProductivityOperationResult, WriterSessionVersionEntry } from '../../productivity/useWriterProductivityState';
import { WriterNavigationSupplement } from '../WriterNavigationSupplement';
import { getWriterOutline } from '../writerNavigationEngine';
import { resolveWriterOutlineKeyCommand } from '../writerOutlineKeyboard';
import {
  countOpenWriterComments,
  filterWriterCommentsByAuthor,
  resolveWriterCommentAuthors,
  WRITER_COMMENT_FILTER_ALL,
} from '../../review/comments/writerCommentsEngine';
import { WriterNavigationActions } from '../WriterNavigationActions';

interface WriterTocSidebarProps {
  paragraphs: Paragraph[];
  isOpen: boolean;
  onClose: () => void;
  onJumpToParagraph: (pId: string) => void;
  /** The paragraph the reader is in — marks the current position in the outline (W-268). */
  activeParagraphId?: string | null;
  comments?: WriterComment[];
  revisions?: WriterRevision[];
  bookmarks?: WriterBookmark[];
  onDeleteBookmark?: (id: string) => void;
  onResolveComment?: (id: string) => void;
  onReplyComment?: (id: string, text: string) => void;
  onAcceptRevision?: (id: string) => void;
  onRejectRevision?: (id: string) => void;
  pages: WriterPaginationPage[];
  sections: WriterSectionDefinition[];
  footnotes: WriterFootnote[];
  tables: WriterTableBlockData[];
  images: WriterImageBlockData[];
  equations: WriterEquationBlockData[];
  namedVersions: WriterNamedVersion[];
  sessionVersions: WriterSessionVersionEntry[];
  clipboardHistoryEnabled: boolean;
  clipboardHistory: WriterClipboardEntry[];
  productivityMessage?: string | null;
  onSetClipboardHistoryEnabled: (enabled: boolean) => void;
  onClearClipboardHistory: () => void;
  onInsertClipboardEntry: (id: string) => void;
  onCreateNamedVersion: (name: string) => WriterProductivityOperationResult;
  onRestoreNamedVersion: (id: string) => WriterProductivityOperationResult;
  onDeleteNamedVersion: (id: string) => WriterProductivityOperationResult;
  onRestoreSessionVersion: (historyIndex: number) => WriterProductivityOperationResult;
  onReorderOutline?: (sourceHeadingId: string, targetHeadingId: string) => void;
}

export const WriterTocSidebar: React.FC<WriterTocSidebarProps> = ({
  paragraphs,
  isOpen,
  onClose,
  onJumpToParagraph,
  activeParagraphId,
  comments = [],
  revisions = [],
  bookmarks = [],
  onDeleteBookmark,
  onResolveComment,
  onReplyComment,
  onAcceptRevision,
  onRejectRevision,
  pages,
  sections,
  footnotes,
  tables,
  images,
  equations,
  namedVersions,
  sessionVersions,
  clipboardHistoryEnabled,
  clipboardHistory,
  productivityMessage,
  onSetClipboardHistoryEnabled,
  onClearClipboardHistory,
  onInsertClipboardEntry,
  onCreateNamedVersion,
  onRestoreNamedVersion,
  onDeleteNamedVersion,
  onRestoreSessionVersion,
  onReorderOutline,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTabSidebar>('toc');
  const [query, setQuery] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [draggedHeadingId, setDraggedHeadingId] = useState<string | null>(null);
  /** The one item of the tree that carries the tab stop; `null` means "nothing focused yet". */
  const [focusedHeadingId, setFocusedHeadingId] = useState<string | null>(null);
  const outlineTreeRef = useRef<HTMLDivElement | null>(null);
  /**
   * Comments are filtered by author here, next to the list the user is looking
   * at. The reviewer filter in the review bar covers tracked changes only.
   */
  const [commentAuthorFilter, setCommentAuthorFilter] = useState<string>(WRITER_COMMENT_FILTER_ALL);
  const commentAuthors = React.useMemo(() => resolveWriterCommentAuthors(comments), [comments]);
  const visibleComments = React.useMemo(
    () => filterWriterCommentsByAuthor(comments, commentAuthorFilter),
    [comments, commentAuthorFilter],
  );
  // A filter that no longer matches any author (for example after the last
  // comment of that person was deleted) falls back to showing everything.
  React.useEffect(() => {
    if (commentAuthorFilter === WRITER_COMMENT_FILTER_ALL) return;
    if (commentAuthors.includes(commentAuthorFilter)) return;
    setCommentAuthorFilter(WRITER_COMMENT_FILTER_ALL);
  }, [commentAuthorFilter, commentAuthors]);

  if (!isOpen) return null;

  // Extract headings
  // One definition of the outline: the engine's `getWriterOutline` decides what a heading is. This
  // panel used to recompute it (level > 0 and non-empty text), so a change to what counts as a
  // heading would have reached the reorder and the go-to list but not the panel (W-266).
  const outline = getWriterOutline(paragraphs);
  const headings = outline.map((entry) => ({ id: entry.id, index: entry.paragraphIndex, level: entry.level, text: entry.text }));

  const filteredHeadings = query.trim()
    ? headings.filter((h) => h.text.toLowerCase().includes(query.toLowerCase()))
    : headings;

  /** Moves the DOM focus (and the tab stop) to the heading at `index` of the visible list. */
  const focusOutlineHeading = (index: number): void => {
    const item = filteredHeadings[index];
    if (!item) return;
    setFocusedHeadingId(item.id);
    const node = outlineTreeRef.current?.querySelector<HTMLButtonElement>(`[data-writer-outline-id="${CSS.escape(item.id)}"]`);
    node?.focus();
  };

  return (
    <aside data-vgt-workspace-chrome="panel" className="relative w-80 bg-slate-900/95 border-r border-white/10 flex flex-col h-full shrink-0 animate-in slide-in-from-left duration-200 select-none z-20">
      {/* Sidebar Header */}
      <div className="h-12 border-b border-white/10 px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-blue-400">
          <ListTree className="w-4 h-4" />
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            Navigation Pane
          </span>
        </div>
        <button aria-label="Close Writer Toc panel"
          type="button"
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b border-white/10 bg-slate-950/40 p-1">
        {[
          { id: 'toc' as const, label: 'Outline', icon: ListTree, count: headings.length },
          { id: 'pages' as const, label: 'Pages', icon: FileText, count: pages.length },
          { id: 'bookmarks' as const, label: 'Bookmarks', icon: Bookmark, count: bookmarks.length },
          { id: 'comments' as const, label: 'Comments', icon: MessageSquare, count: comments.filter((c) => !c.resolved).length },
          { id: 'search' as const, label: 'Search', icon: Search, count: 0 },
          { id: 'revisions' as const, label: 'Changes', icon: GitCommit, count: revisions.filter((r) => r.status === 'pending').length },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-1 px-1 rounded-md text-[0.625rem] font-medium flex items-center justify-center space-x-1 transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[0.5625rem] px-1 rounded-full ${activeTab === tab.id ? 'bg-blue-800' : 'bg-slate-800 text-slate-300'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter / Search Bar */}
      <div className="p-2.5 border-b border-white/5">
        <div className="relative">
          <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder={activeTab === 'search' ? 'Search document…' : `Filter ${activeTab}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg pl-7 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Tab 1: TOC Outline */}
      {activeTab === 'toc' && (
        <div
          className="flex-1 overflow-y-auto p-2 space-y-1"
          role="tree"
          aria-label="Dokumentgliederung"
          ref={outlineTreeRef}
          // W-270: a tree that answers no keys is a promise the interface cannot keep. The decision lives in
          // `resolveWriterOutlineKeyCommand` (pure, unit-tested); this only moves the focus and calls the
          // same reorder the drag uses. W-271: `Alt`+Arrow is the keyboard alternative to dragging.
          onKeyDown={(event) => {
            const items = filteredHeadings.map((heading) => ({ id: heading.id, level: heading.level }));
            const currentIndex = Math.max(0, items.findIndex((item) => item.id === focusedHeadingId));
            const command = resolveWriterOutlineKeyCommand({
              key: event.key,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              items,
              currentIndex,
            });
            if (!command) return;
            event.preventDefault();
            if (command.kind === 'focus') {
              focusOutlineHeading(command.index);
              return;
            }
            if (command.kind === 'activate') {
              const target = items[command.index];
              if (target) onJumpToParagraph(target.id);
              return;
            }
            const source = items[command.sourceIndex];
            const target = items[command.targetIndex];
            if (source && target && onReorderOutline) onReorderOutline(source.id, target.id);
          }}
        >
          {filteredHeadings.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500" role="none">
              <Hash className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p>No headings found.</p>
              <p className="text-[0.625rem] mt-1 text-slate-600">
                Apply Heading 1, 2, or 3 styles to build the document outline.
              </p>
            </div>
          ) : (
            filteredHeadings.map((item) => (
              <button
                key={item.id}
                type="button"
                data-writer-outline-id={item.id}
                // One tab stop for the whole tree, moved with the arrow keys (`roving tabindex`). Without the
                // fallback the tree would not be reachable at all before anything is focused.
                tabIndex={(focusedHeadingId ? focusedHeadingId === item.id : item.id === filteredHeadings[0]?.id) ? 0 : -1}
                onFocus={() => setFocusedHeadingId(item.id)}
                // The acceptance asks for the heading to be "marked semantically correctly": the level
                // was conveyed only by indentation and font weight, so a screen reader heard a row of
                // identical buttons with no depth. `treeitem` + `aria-level` states the hierarchy, and
                // `aria-current` marks where the reader currently is (W-268).
                role="treeitem"
                aria-level={item.level}
                aria-current={activeParagraphId === item.id ? 'location' : undefined}
                draggable={Boolean(onReorderOutline)}
                onDragStart={() => setDraggedHeadingId(item.id)}
                onDragOver={(event) => { if (onReorderOutline) event.preventDefault(); }}
                onDragEnd={() => setDraggedHeadingId(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedHeadingId && draggedHeadingId !== item.id && onReorderOutline) onReorderOutline(draggedHeadingId, item.id);
                  setDraggedHeadingId(null);
                }}
                onClick={() => onJumpToParagraph(item.id)}
                className={`w-full text-left rounded-lg p-2 transition-all flex items-start space-x-2 group hover:bg-white/5 border-l-2 ${
                  activeParagraphId === item.id ? 'border-cyan-400 bg-white/[0.06]' : 'border-transparent'
                } ${draggedHeadingId === item.id ? 'opacity-50' : ''} ${
                  item.level === 1
                    ? 'font-bold text-slate-100'
                    : item.level === 2
                    ? 'pl-5 font-semibold text-slate-200'
                    : 'pl-8 font-normal text-slate-300'
                }`}
              >
                <ChevronRight
                  className={`w-3 h-3 mt-0.5 text-blue-400 opacity-60 group-hover:opacity-100 shrink-0 ${
                    item.level === 1 ? '' : 'w-2.5 h-2.5'
                  }`}
                />
                <span className="text-xs truncate flex-1">{item.text}</span>
                {activeParagraphId === item.id && <span className="shrink-0 text-[0.5625rem] font-mono uppercase text-cyan-300">hier</span>}
              </button>
            ))
          )}
        </div>
      )}

      {/* W-271: the keyboard alternative to dragging must be discoverable, not a secret. It is shown only
          where reordering exists, and it is text — not a tooltip. */}
      {activeTab === 'toc' && onReorderOutline && filteredHeadings.length > 0 && (
        <p className="px-2 pb-2 text-[0.625rem] leading-relaxed text-slate-500">
          Pfeiltasten wandern durch die Gliederung, <kbd className="font-mono text-slate-400">Alt</kbd>+
          <kbd className="font-mono text-slate-400">↑</kbd>/<kbd className="font-mono text-slate-400">↓</kbd> verschiebt
          die gewählte Überschrift mit ihrem Abschnitt.
        </p>
      )}

      <WriterNavigationSupplement
        activeTab={activeTab}
        query={query}
        paragraphs={paragraphs}
        pages={pages}
        onJumpToParagraph={onJumpToParagraph}
      />

      {/* Tab 2: Bookmarks */}
      {activeTab === 'bookmarks' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {bookmarks.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p>No bookmarks set.</p>
              <p className="text-[0.625rem] mt-1 text-slate-600">
                Add bookmarks from the toolbar to create jump targets.
              </p>
            </div>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-white/5 hover:border-white/10 group"
              >
                <button
                  type="button"
                  onClick={() => onJumpToParagraph(bm.paragraphId)}
                  className="flex items-center space-x-2 text-left flex-1 truncate"
                >
                  <Bookmark className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-xs text-slate-200 font-medium truncate">{bm.name}</span>
                </button>
                {onDeleteBookmark && (
                  <button aria-label="Delete bookmark"
                    type="button"
                    onClick={() => onDeleteBookmark(bm.id)}
                    className="opacity-40 group-hover:opacity-100 focus-visible:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Comments */}
      {activeTab === 'comments' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {comments.length > 0 && commentAuthors.length > 1 && (
            <div className="flex items-center gap-2 px-1 pb-1">
              <label className="text-[0.625rem] text-slate-400 shrink-0" htmlFor="writer-comment-author-filter">
                Verfasser
              </label>
              <select
                id="writer-comment-author-filter"
                aria-label="Kommentare nach Verfasser filtern"
                value={commentAuthorFilter}
                onChange={(event) => setCommentAuthorFilter(event.target.value)}
                className="flex-1 min-w-0 bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-[0.625rem] text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 hover:border-blue-500/40"
              >
                <option value={WRITER_COMMENT_FILTER_ALL}>
                  Alle ({countOpenWriterComments(comments)} offen)
                </option>
                {commentAuthors.map((author) => (
                  <option key={author} value={author}>
                    {author} ({countOpenWriterComments(comments, author)} offen)
                  </option>
                ))}
              </select>
            </div>
          )}
          {visibleComments.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p>
                {comments.length === 0
                  ? 'Keine Kommentare im Dokument.'
                  : 'Keine Kommentare dieses Verfassers.'}
              </p>
            </div>
          ) : (
            visibleComments.map((comment) => (
              <div
                key={comment.id}
                // GAP-0051, Runde 280: die Zeile trug `cursor-pointer` und ein
                // `onClick`, aber keinen Tastaturweg — kein Tab erreichte sie,
                // Enter und Leertaste loesten nichts aus. `role="button"` macht
                // sie zu einem Bedienelement; der Textinhalt ist ihr Name.
                role="button"
                tabIndex={0}
                onClick={() => onJumpToParagraph(comment.paragraphId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onJumpToParagraph(comment.paragraphId);
                  }
                }}
                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  comment.resolved
                    ? 'bg-slate-950/40 border-white/5 opacity-75'
                    : 'bg-slate-950/80 border-white/10 hover:border-blue-500/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: comment.avatarColor || '#60a5fa' }} />
                    <span className="font-semibold text-slate-200 text-[0.6875rem] truncate">{comment.author}</span>
                    {comment.mentions && comment.mentions.length > 0 && (
                      <span className="text-[0.5625rem] text-cyan-400">@{comment.mentions.length}</span>
                    )}
                  </div>
                  {onResolveComment && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onResolveComment(comment.id);
                      }}
                      className={`text-[0.625rem] transition-colors ${comment.resolved ? 'text-blue-400 hover:text-blue-300' : 'text-slate-400 hover:text-emerald-400'}`}
                    >
                      {comment.resolved ? 'Reopen' : 'Resolve'}
                    </button>
                  )}
                </div>
                <p className="text-slate-300 text-[0.6875rem] whitespace-pre-wrap break-words">{comment.text}</p>

                {comment.replies.length > 0 && (
                  <div className="mt-2 space-y-1.5 border-l border-white/10 pl-2">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="bg-white/[0.03] rounded-lg p-1.5">
                        <div className="flex items-center gap-1 text-[0.5625rem] text-slate-500 mb-0.5">
                          <CornerDownRight className="w-2.5 h-2.5" />
                          <span className="font-semibold text-slate-300">{reply.author}</span>
                          {reply.mentions && reply.mentions.length > 0 && <span className="text-cyan-400">@{reply.mentions.length}</span>}
                        </div>
                        <p className="text-[0.625rem] text-slate-300 whitespace-pre-wrap break-words">{reply.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {onReplyComment && (
                  <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                    {replyingTo === comment.id ? (
                      <div className="flex gap-1.5">
                        <input
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setReplyingTo(null);
                              setReplyText('');
                            }
                            if (event.key === 'Enter' && !event.shiftKey && replyText.trim()) {
                              event.preventDefault();
                              onReplyComment(comment.id, replyText);
                              setReplyingTo(null);
                              setReplyText('');
                            }
                          }}
                          maxLength={2000}
                          placeholder="Antworten… @Name wird erkannt"
                          className="min-w-0 flex-1 bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-[0.625rem] text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          disabled={!replyText.trim()}
                          onClick={() => {
                            if (!replyText.trim()) return;
                            onReplyComment(comment.id, replyText);
                            setReplyingTo(null);
                            setReplyText('');
                          }}
                          className="p-1.5 rounded-md bg-blue-600 disabled:opacity-40 text-white"
                          aria-label="Antwort senden"
                        >
                          <Send className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(comment.id);
                          setReplyText('');
                        }}
                        className="text-[0.625rem] text-blue-400 hover:text-blue-300"
                      >
                        Antworten
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Track Changes / Revisions */}
      {activeTab === 'revisions' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {revisions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              <GitCommit className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p>No tracked revisions.</p>
              <p className="text-[0.625rem] mt-1 text-slate-600">
                Enable Track Changes to record insertions and deletions.
              </p>
            </div>
          ) : (
            revisions.map((rev) => (
              <div
                key={rev.id}
                // GAP-0051, Runde 280: dieselbe Luecke wie beim Kommentar
                // darueber — `cursor-pointer` und `onClick`, aber kein
                // Tastaturweg.
                role="button"
                tabIndex={0}
                onClick={() => onJumpToParagraph(rev.paragraphId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onJumpToParagraph(rev.paragraphId);
                  }
                }}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 hover:border-blue-500/50 text-xs cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-200 text-[0.6875rem]">{rev.author}</span>
                  <span
                    className={`text-[0.5625rem] px-1.5 py-0.5 rounded font-mono uppercase ${
                      rev.type === 'insert'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : rev.type === 'delete'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {rev.type}
                  </span>
                </div>
                <p className="text-[0.6875rem] text-slate-300 line-clamp-2">
                  {rev.type === 'delete' ? rev.originalText : rev.newText}
                </p>
                {rev.status === 'pending' && (onAcceptRevision || onRejectRevision) && (
                  <div className="flex items-center space-x-2 mt-2 pt-1 border-t border-white/5">
                    {onAcceptRevision && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAcceptRevision(rev.id);
                        }}
                        className="text-[0.625rem] text-emerald-400 hover:underline font-semibold"
                      >
                        Accept
                      </button>
                    )}
                    {onRejectRevision && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRejectRevision(rev.id);
                        }}
                        className="text-[0.625rem] text-rose-400 hover:underline font-semibold"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <WriterNavigationActions
        pages={pages}
        sections={sections}
        bookmarks={bookmarks}
        footnotes={footnotes}
        comments={comments}
        tables={tables}
        images={images}
        equations={equations}
        namedVersions={namedVersions}
        sessionVersions={sessionVersions}
        clipboardHistoryEnabled={clipboardHistoryEnabled}
        clipboardHistory={clipboardHistory}
        productivityMessage={productivityMessage}
        onSetClipboardHistoryEnabled={onSetClipboardHistoryEnabled}
        onClearClipboardHistory={onClearClipboardHistory}
        onInsertClipboardEntry={onInsertClipboardEntry}
        onCreateNamedVersion={onCreateNamedVersion}
        onRestoreNamedVersion={onRestoreNamedVersion}
        onDeleteNamedVersion={onDeleteNamedVersion}
        onRestoreSessionVersion={onRestoreSessionVersion}
        onJumpToParagraph={onJumpToParagraph}
      />
      <div className="p-2 border-t border-white/10 text-[0.5625rem] text-slate-600 font-mono flex items-center justify-between">
        <span>Astraea Navigation</span><span>{headings.length} headings</span>
      </div>
    </aside>
  );
};
