// STATUS: DIAMANT VGT SUPREME — Sovereign Paragraph Renderer with Track Changes & 9-Level Lists
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import type { Paragraph, WriterStyleDefinition } from '../../../../shared/contracts/workspace';
import type { FootnoteItem, ReviewMode, ReviewerFilter, TrackChangeRevision } from '../../types';
import { jumpToWriterNote, writerNoteReferenceAnchorId } from '../../references/notes/writerNoteNavigation';
import { isImeCompositionEvent } from '../../../../shared/accessibility/accessibilityPlatform';
import {
  clampWriterCaretOffset,
  resolveWriterFragmentLocalCaret,
  resolveWriterRowClickOffset,
  writerParagraphTextLength,
} from '../../editing/caret/writerCaretTargeting';
import {
  getLastWriterCaretRequest,
  requestWriterCaretAfterLayout,
  subscribeWriterCaret,
  type WriterCaretRequest,
} from '../../editing/caret/writerCaretController';
import { resolveWriterKeyboardNavigation } from '../../editing/caret/writerCaretNavigation';
import { canDeleteWriterParagraph } from '../../editing/paragraphs/writerParagraphDeletion';
import {
  composeWriterParagraphTextFromFragment,
  sliceWriterParagraphFragmentText,
} from '../../editing/paragraphs/writerParagraphFragmentText';
import { resolveWriterParagraphLineCount } from '../../editing/paragraphs/writerParagraphLineCount';
import {
  parseWriterClipboardHtml,
  parseWriterClipboardPlainText,
  type WriterClipboardParagraph,
} from '../../editing/clipboard/writerClipboardPayload';
import {
  resolveWriterBackspaceIntent,
  resolveWriterEnterIntent,
} from '../../editing/paragraphs/writerParagraphKeyIntent';
import { writerStyleForParagraph, writerTextShadow } from '../../formatting/styles/writerStyles';
import { resolveWriterParagraphListPresentation, WriterParagraphListMarker } from './WriterParagraphListMarker';
import type { WriterListTemplate } from '../../../../shared/contracts/writer/workspaceWriterList';
import { writerLineHeightCss } from '../../layout/typography/line-spacing/writerLineSpacing';
import { resolveWriterParagraphSpacing } from '../../formatting/paragraphs/writerParagraphSpacing';
import { resolveWriterParagraphIndent } from '../../formatting/paragraphs/writerParagraphIndent';
import { resolveWriterParagraphDecoration, writerParagraphDecorationCss } from '../../formatting/paragraphs/writerParagraphDecoration';
import { WriterTabLayoutPreview } from '../../formatting/tabs/WriterTabLayoutPreview';
import { WriterNonPrintingOverlay } from '../rendering/WriterNonPrintingOverlay';
import { insertWriterTabAtRange } from '../../formatting/tabs/writerTabStops';
import { resolveWriterTextFlow, writerTextFlowCss } from '../../layout/text-flow/writerTextFlow';
import { WriterParagraphRevisionMarkup } from '../../review/revisions/WriterParagraphRevisionMarkup';
import { WriterRemoteCursorOverlay } from '../../collaboration/presence/WriterRemoteCursorOverlay';
import type { WriterCollaborationPeer } from '../../collaboration/types/writerCollaborationTypes';
import { useWriterRichTextSurface } from '../surface/WriterRichTextSurface';
import { WriterParagraphRichText, showsWriterPlaceholder } from '../surface/WriterParagraphRichText';
import { useWorkspaceLocale, workspaceText } from '../../../../shell/localization/workspaceLocale';

interface WriterParagraphItemProps {
  paragraph: Paragraph;
  paragraphIndex: number;
  allParagraphs: Paragraph[];
  styles: WriterStyleDefinition[];
  isLight: boolean;
  activeParagraphId: string | null;
  draggedPIdx: number | null;
  dragOverPIdx: number | null;
  showNonPrinting: boolean;
  reviewMode: ReviewMode;
  reviewerFilter?: ReviewerFilter;
  revisions: TrackChangeRevision[];
  footnotes?: readonly FootnoteItem[];
  onParagraphChange: (pIdx: number, text: string, inputCaret?: number) => number;
  onTextSelection: (pIdx: number, start: number, end: number) => void;
  onSelectParagraph: (pId: string) => void;
  onAddParagraph: (afterIdx: number, headingLevel?: 1 | 2 | 3) => void;
  onSplitParagraph?: (pIdx: number, offset: number) => void;
  onMergeParagraphBackward?: (pIdx: number) => void;
  /**
   * Paragraphs covered by a selection that spans more than one paragraph.
   * A single textarea cannot express such a selection, so the editor tracks it.
   */
  rangeSelectionParagraphIds?: readonly string[];
  hasRangeSelection?: boolean;
  onRangeSelectionStart?: (pIdx: number, offset: number) => void;
  onReplaceRangeSelection?: (replacement: string) => void;
  /** Caret movement that leaves this paragraph; `extendSelection` is Shift. */
  onNavigate?: (target: { paragraphId: string; offset: number }, extendSelection: boolean) => void;
  /** First and last paragraph of the page this fragment is rendered on. */
  pageBoundary?: { readonly firstParagraphId: string; readonly lastParagraphId: string } | undefined;
  /** Called when a keystroke is refused because the document is protected. */
  onBlockedEditAttempt?: () => void;
  /** Parsed clipboard content, ready to be inserted at the given selection. */
  onPastePayload?: (
    payload: readonly WriterClipboardParagraph[],
    selectionStart: number,
    selectionEnd: number,
  ) => void;
  onDeleteParagraph: (pIdx: number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, targetIdx: number) => void;
  template?: WriterListTemplate;
  onIndentListLevel?: (pIdx: number, delta?: number) => void;
  onOutdentListLevel?: (pIdx: number) => void;
  onExitListMode?: (pIdx: number) => void;
  onContextMenu?: (e: React.MouseEvent, pIdx: number) => void;
  readOnly?: boolean;
  showPageBreakMarker?: boolean;
  remotePeers?: readonly WriterCollaborationPeer[];
  fragment?: {
    key: string;
    startOffset: number;
    endOffset: number;
    lineCount: number;
    isFirst: boolean;
    isLast: boolean;
  };
}

export const WriterParagraphItem: React.FC<WriterParagraphItemProps> = ({
  paragraph: p,
  paragraphIndex: pIdx,
  allParagraphs,
  styles,
  isLight,
  activeParagraphId,
  draggedPIdx,
  dragOverPIdx,
  showNonPrinting,
  reviewMode,
  reviewerFilter = 'all',
  revisions,
  footnotes,
  onParagraphChange,
  onTextSelection,
  onSelectParagraph,
  onAddParagraph,
  onSplitParagraph,
  onMergeParagraphBackward,
  rangeSelectionParagraphIds,
  hasRangeSelection = false,
  onRangeSelectionStart,
  onReplaceRangeSelection,
  onNavigate,
  pageBoundary,
  onBlockedEditAttempt,
  onPastePayload,
  onDeleteParagraph,
  onDragStart,
  onDragOver,
  onDrop,
  template,
  onIndentListLevel,
  onOutdentListLevel,
  onExitListMode,
  onContextMenu,
  readOnly = false,
  showPageBreakMarker = true,
  remotePeers = [],
  fragment,
}) => {
  const heading = p.style.heading_level;
  const rawText = p.spans.map((s) => s.text).join('');
  const isDragging = draggedPIdx === pIdx;
  const isDragOver = dragOverPIdx === pIdx;
  const styleDef = writerStyleForParagraph(p, styles);
  const paragraphSpacing = resolveWriterParagraphSpacing(p.style, styleDef.spaceBefore, styleDef.spaceAfter);
  const paragraphIndent = resolveWriterParagraphIndent(p.style);
  const explicitBold = p.spans.some((s) => s.bold);
  const explicitItalic = p.spans.some((s) => s.italic);
  const explicitUnderline = p.spans.some((s) => s.underline);
  const explicitStrike = p.spans.some((s) => s.strikethrough);
  const explicitFontFamily = p.spans.find((span) => span.font_family)?.font_family;
  const explicitFontSize = p.spans.find((span) => span.font_size_pt)?.font_size_pt;
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handledCaretTokenRef = useRef<number>(0);
  const pendingRangeDragRef = useRef(false);
  const plainPasteRef = useRef(false);
  const isRangeSelected = rangeSelectionParagraphIds?.includes(p.id) ?? false;
  const isLastFragment = fragment?.isLast ?? true;
  const fragmentStart = fragment?.startOffset ?? 0;
  const paragraphTextLength = writerParagraphTextLength(p);
  const textFlow = resolveWriterTextFlow(p.style, rawText);
  const textFlowCss = writerTextFlowCss(textFlow);

  /**
   * Applies a caret position inside this paragraph. The paragraph is rendered
   * as one textarea per page fragment, so the fragment that *owns* the offset
   * takes the caret; a fragment that does not own it stays untouched and lets
   * its sibling handle the handover.
   */
  const fragmentEndOffset = fragment?.endOffset ?? paragraphTextLength;
  const applyCaret = useCallback((start: number, end: number) => {
    if (readOnly) return;
    const localStart = resolveWriterFragmentLocalCaret(
      { startOffset: fragmentStart, endOffset: fragmentEndOffset, isLastFragment },
      start,
    );
    if (localStart === null) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    setIsEditing(true);
    textarea.focus();
    const clampedStart = clampWriterCaretOffset(localStart, textarea.value.length);
    const requestedEnd = resolveWriterFragmentLocalCaret(
      { startOffset: fragmentStart, endOffset: fragmentEndOffset, isLastFragment },
      end,
    );
    const clampedEnd = clampWriterCaretOffset(requestedEnd ?? clampedStart, textarea.value.length);
    textarea.setSelectionRange(clampedStart, Math.max(clampedStart, clampedEnd));
    onSelectParagraph(p.id);
    onTextSelection(pIdx, fragmentStart + clampedStart, fragmentStart + clampedEnd);
  }, [fragmentStart, fragmentEndOffset, isLastFragment, onSelectParagraph, onTextSelection, p.id, pIdx, readOnly]);

  useEffect(() => {
    const consume = (request: WriterCaretRequest) => {
      if (request.paragraphId !== p.id) return;
      if (request.token <= handledCaretTokenRef.current) return;
      // A deferred caret request follows the user's own typing. If focus already
      // moved somewhere else in the meantime, it must not be pulled back.
      if (request.origin === 'pagination') {
        const active = textareaRef.current?.ownerDocument.activeElement ?? null;
        const stillOurs = active === textareaRef.current;
        const nothingFocused = active === null || active === textareaRef.current?.ownerDocument.body;
        if (!stillOurs && !nothingFocused) {
          handledCaretTokenRef.current = request.token;
          return;
        }
      }
      handledCaretTokenRef.current = request.token;
      applyCaret(request.start, request.end);
      if (!textareaRef.current) {
        requestAnimationFrame(() => applyCaret(request.start, request.end));
      }
    };
    const unsubscribe = subscribeWriterCaret(consume);
    const pending = getLastWriterCaretRequest();
    if (pending && pending.paragraphId === p.id && pending.token > handledCaretTokenRef.current) {
      consume(pending);
    }
    return unsubscribe;
  }, [applyCaret, p.id]);

  const listPresentation = resolveWriterParagraphListPresentation(p, allParagraphs, pIdx, template);
  const effectiveLeftIndentMm = paragraphIndent.leftMm ?? listPresentation.levelGeometry?.leftIndentMm;
  const effectiveHangingIndentMm = paragraphIndent.hangingMm ?? listPresentation.levelGeometry?.hangingIndentMm;

  // Track changes evaluation
  const paragraphRevisions = revisions.filter(
    (r) => r.paragraphId === p.id && r.status === 'pending'
  );
  const hasRevisions = paragraphRevisions.length > 0;
  const activeRev = paragraphRevisions[paragraphRevisions.length - 1];

  let displayContent = rawText;
  if (reviewMode === 'original' && activeRev && activeRev.originalText !== undefined) {
    displayContent = activeRev.originalText;
  }
  const fragmentEnd = Math.min(displayContent.length, fragment?.endOffset ?? displayContent.length);
  displayContent = sliceWriterParagraphFragmentText(displayContent, fragmentStart, fragmentEnd);
  const isFirstFragment = fragment?.isFirst ?? true;
  const resolvedDecoration = resolveWriterParagraphDecoration(p.style, styleDef);
  const decorationCss = writerParagraphDecorationCss({
    ...resolvedDecoration,
    borders: {
      ...resolvedDecoration.borders,
      top: isFirstFragment ? resolvedDecoration.borders.top : undefined,
      bottom: isLastFragment ? resolvedDecoration.borders.bottom : undefined,
    },
  });

  const showSimpleMarkupBar = reviewMode === 'simple' && hasRevisions;
  const textColor = p.spans.find((span) => span.text_color)?.text_color ?? styleDef.textColor;
  const isActive = activeParagraphId === p.id;
  /**
   * WR-002: inside the rich-text surface the paragraph is a **projection**, not an
   * editor root. Its text is rendered as one `<span>` per model span, so a single
   * word can be bold while its neighbours are not — the exact thing the old
   * `textarea` could not do (it applied `p.spans.some(s => s.bold)` to the whole
   * block).
   */
  const surface = useWriterRichTextSurface();
  const richText = surface?.richTextActive === true;
  const { locale } = useWorkspaceLocale();
  /**
   * WR-024: a localized, non-persisted hint instead of `Type sovereign text here...`
   * or `Heading 1`. It is a CSS `::before` on an empty paragraph, so it can never
   * become part of the saved text and never appears in a PDF.
   *
   * **Only the single empty document shows it.** The plan is explicit — "leere
   * Absätze im normalen Schreibmodus sind einfach leere Zeilen ohne künstlichen
   * Platzhaltertext". Two `Enter` presses therefore produce two empty lines, not two
   * copies of the hint; only a document that consists of exactly one empty
   * paragraph gets it.
   */
  const showsDocumentPlaceholder = showsWriterPlaceholder(allParagraphs, p);
  const placeholderText = !showsDocumentPlaceholder
    ? undefined
    : styleDef.name === 'title'
      ? workspaceText('writer.placeholderTitle', locale)
      : styleDef.name.startsWith('heading')
        ? workspaceText('writer.placeholderHeading', locale)
        : workspaceText('writer.placeholderBody', locale);
  /**
   * Paragraph typography shared by the runs. The *character* properties
   * (bold/italic/underline/size/family/colour) are deliberately **not** inherited
   * from a single span here: each run carries its own, which is what makes a
   * word-accurate format possible at all.
   */
  /** WR-031: the gutter the list marker occupies inside the rich-text surface. */
  const LIST_MARKER_GUTTER_MM = 7;
  const underListMarker = richText && Boolean(p.style.list_style) && isFirstFragment;
  const richTextLayerStyle: React.CSSProperties = {
    ...textFlowCss,
    ...decorationCss,
    fontSize: `${styleDef.fontSizePt}pt`,
    fontFamily: styleDef.fontFamily ?? 'inherit',
    fontWeight: styleDef.bold ? 700 : 400,
    fontStyle: styleDef.italic ? 'italic' : 'normal',
    color: textColor,
    caretColor: textColor,
    textShadow: writerTextShadow(styleDef.textEffect),
    backgroundColor: decorationCss.backgroundColor ?? undefined,
    textAlign: p.style.alignment === 'distributed' ? 'justify' : (p.style.alignment ?? styleDef.alignment ?? 'left'),
    textAlignLast: p.style.alignment === 'distributed' ? 'justify' : undefined,
    lineHeight: writerLineHeightCss(p.style, styleDef.lineHeight),
    /**
     * WR-031 — the list geometry, corrected.
     *
     * `paddingLeft: hanging` together with `textIndent: -hanging` cancels itself out on
     * the first line (`6.35mm − 6.35mm = 0`) and the inline `paddingLeft` overrode the
     * container's `pl-5`. In the rich-text surface the **marker** provides the hanging
     * indent instead: the text keeps a clean left padding and the first line is not
     * pulled back into the bullet.
     */
    paddingLeft: richText
      ? undefined
      : effectiveHangingIndentMm ? `${effectiveHangingIndentMm}mm` : undefined,
    textIndent: paragraphIndent.firstLineMm
      ? `${paragraphIndent.firstLineMm}mm`
      : !richText && effectiveHangingIndentMm ? `-${effectiveHangingIndentMm}mm` : undefined,
    marginTop: `${isFirstFragment ? paragraphSpacing.beforePt : 0}pt`,
    marginBottom: `${isLastFragment ? paragraphSpacing.afterPt : 0}pt`,
    /**
     * The wrapping `<div className="relative">` already carries the left indent; a second
     * `marginLeft` here doubled it (WR-031, native M7 probe).
     */
    marginLeft: richText ? undefined : effectiveLeftIndentMm ? `${effectiveLeftIndentMm}mm` : undefined,
    marginRight: paragraphIndent.rightMm ? `${paragraphIndent.rightMm}mm` : undefined,
    paddingRight: richText && underListMarker ? `${LIST_MARKER_GUTTER_MM}mm` : undefined,
  };
  const effectiveTextColor = isActive ? `var(--writer-live-text-color, ${textColor})` : textColor;
  const rawHighlightColor = p.spans.find((s) => s.highlight_color)?.highlight_color ?? 'transparent';
  const effectiveHighlightColor = isActive ? `var(--writer-live-highlight-color, ${rawHighlightColor})` : rawHighlightColor;
  const showTabPreview = displayContent.includes('\t') && !isEditing;
  const paragraphNotes = (footnotes ?? []).filter((fn) => fn.referenceParagraphId === p.id);
  const collaborationTextStyle: React.CSSProperties = { ...textFlowCss, fontSize: `${explicitFontSize ?? styleDef.fontSizePt}pt`, fontFamily: explicitFontFamily ?? styleDef.fontFamily ?? 'inherit', fontWeight: styleDef.bold || explicitBold ? 700 : 400, fontStyle: styleDef.italic || explicitItalic ? 'italic' : 'normal', lineHeight: writerLineHeightCss(p.style, styleDef.lineHeight), paddingLeft: effectiveHangingIndentMm ? `${effectiveHangingIndentMm}mm` : undefined, textIndent: paragraphIndent.firstLineMm ? `${paragraphIndent.firstLineMm}mm` : effectiveHangingIndentMm ? `-${effectiveHangingIndentMm}mm` : undefined };

  return (
    <>
      {showPageBreakMarker && p.style.page_break_before && isFirstFragment && (
        // WR-002/WR-005: this marker sits *inside* the one contentEditable root, so
        // it must be an island the browser can neither put a caret into nor delete a
        // selection into.
        <div contentEditable={false} className="w-full flex items-center gap-2 my-3 select-none">
          <div className="h-[1px] flex-1 bg-blue-500/40 border-b border-dashed border-blue-400/50" />
          <span className="text-[0.5625rem] uppercase tracking-widest font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
            Seitenumbruch
          </span>
          <div className="h-[1px] flex-1 bg-blue-500/40 border-b border-dashed border-blue-400/50" />
        </div>
      )}
      {p.style.column_break_before && isFirstFragment && showNonPrinting && (
        <div contentEditable={false} className="my-3 flex w-full select-none items-center gap-2">
          <div className="h-px flex-1 border-b border-dashed border-cyan-400/50 bg-cyan-500/40" />
          <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-widest text-cyan-400">
            Spaltenumbruch
          </span>
          <div className="h-px flex-1 border-b border-dashed border-cyan-400/50 bg-cyan-500/40" />
        </div>
      )}
      <div
        id={isFirstFragment ? `writer-paragraph-${p.id}` : `writer-paragraph-${p.id}-${fragment?.key ?? 'continuation'}`}
        // W-267: jumps from the outline (and the find bar) scroll here and then move focus here. A div
        // is not focusable without this, so `focus()` would have done nothing and a keyboard user would
        // have stayed on the sidebar button. -1 keeps the paragraph out of the tab order.
        //
        // Inside the rich-text surface this attribute must **not** exist: Chromium focuses every
        // `tabindex="-1"` element on a mouse click, so a click into a paragraph moved
        // `document.activeElement` from the `contenteditable` root onto this inner div. From that
        // moment the browser moved no caret at all — arrow keys, Home/End and Shift+arrows were dead
        // while the toolbar still worked (the native M4 probe). Without the attribute the click
        // focuses the editing host, which is what owns the caret.
        tabIndex={richText ? undefined : -1}
        data-vgt-app-guide-anchor={isFirstFragment && !readOnly ? 'Writer:first' : undefined}
        // WR-005: block reordering is a structure action, not a writing action. Inside
        // the rich-text surface the paragraph must not become a drag-and-drop target —
        // that would compete with dragging a *text selection*, which is the primary
        // interaction there. Reordering stays reachable through the context menu.
        onDragOver={readOnly || richText ? undefined : (e) => onDragOver(e, pIdx)}
        onDrop={readOnly || richText ? undefined : (e) => onDrop(e, pIdx)}
        onClick={(event) => {
          onSelectParagraph(p.id);
          if (readOnly) return;
          // Inside the rich-text surface the browser's own character hit test
          // places the caret; a second, proportional projection on top of it would
          // move the caret to a different character than the one clicked (WR-014).
          if (richText) return;
          const target = event.target;
          if (target instanceof HTMLElement && target.closest('textarea, input, button, a, [contenteditable="true"]')) {
            return;
          }
          // A click on the row itself — gutter, padding, the space beside a short
          // line — must still place the caret, projected onto the paragraph text.
          const textarea = textareaRef.current;
          if (!textarea) return;
          const rect = textarea.getBoundingClientRect();
          const offset = resolveWriterRowClickOffset({
            pointerY: event.clientY,
            boxTop: rect.top,
            boxHeight: rect.height,
            textLength: paragraphTextLength,
          });
          applyCaret(offset, offset);
        }}
        onContextMenu={readOnly ? undefined : (e) => onContextMenu?.(e, pIdx)}
        className={
          richText
            /**
             * WR-002: the normal writing surface has **no** paragraph card. No
             * `rounded-lg p-1.5`, no colour ring, no permanent drag handle, no
             * trash button — those turned running text into a stack of boxes and
             * are now reached through the context menu instead (a deliberately
             * opened structure path, not a removed one).
             */
            ? `group relative ${
                textFlow.resolvedDirection === 'rtl' ? '-mr-6 pr-6' : '-ml-6 pl-6'
              } ${
                isDragging ? 'opacity-40' : ''
              } ${
                isRangeSelected ? 'bg-blue-500/10' : ''
              }`
            : `group relative rounded-lg p-1.5 transition-all duration-150 ${
                textFlow.resolvedDirection === 'rtl' ? '-mr-6 pr-6' : '-ml-6 pl-6'
              } ${
                isDragging ? 'opacity-40 border-2 border-dashed border-blue-500' : ''
              } ${isDragOver ? 'border-t-2 border-blue-500' : ''} ${
                activeParagraphId === p.id ? 'ring-1 ring-blue-500/30 bg-blue-500/[0.02]' : ''
              } ${showSimpleMarkupBar ? 'border-l-2 border-rose-500 pl-4' : ''} ${
                isRangeSelected ? 'bg-blue-500/10 ring-1 ring-blue-500/20' : ''
              } hover:bg-black/[0.02]`
        }
      >
        {/* Drop Target Indicator Bar */}
        {isDragOver && !richText && (
          <div className="absolute -top-1.5 left-0 right-0 h-1 bg-blue-500 rounded-full z-30 shadow-md flex items-center justify-center pointer-events-none">
            <span className="bg-blue-600 text-white text-[0.5625rem] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
              Hier einfügen
            </span>
          </div>
        )}

        {/* Drag & Delete Controls — structure actions, not part of the writing flow */}
        {isFirstFragment && !readOnly && !richText && (
          <div
            /**
             * Always present, never only on hover. The VGT UI/UX gate forbids an
             * essential function being reachable by hover alone, so the row is
             * quiet by default (40 %) and full strength on hover or keyboard
             * focus. Hiding it entirely made deleting a paragraph undiscoverable
             * without a pointer.
             */
            className={`absolute top-2 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center space-x-0.5 select-none z-20 ${
              textFlow.resolvedDirection === 'rtl' ? 'right-0' : 'left-0'
            }`}
          >
            <div
              draggable={isFirstFragment}
              onDragStart={(e) => {
                e.stopPropagation();
                onDragStart(pIdx);
              }}
              className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 cursor-grab active:cursor-grabbing rounded transition-colors"
              title="Bereich halten und ziehen zum Neuanordnen"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            {canDeleteWriterParagraph(allParagraphs.length) && (
              <button
                type="button"
                onClick={() => onDeleteParagraph(pIdx)}
                className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                aria-label="Absatz löschen" title="Absatz löschen"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* WR-002/WR-005: the list marker is decoration inside the editable root —
            it must not become a caret target or part of a deleted selection.
            WR-017 (native M4 probe): only render the island when there *is* a marker.
            An empty `contenteditable="false"` element between two paragraphs blocks
            the browser's own arrow navigation at every paragraph boundary. */}
        {p.style.list_style ? (
          <span contentEditable={false} className="contents">
            <WriterParagraphListMarker
              paragraph={p}
              presentation={listPresentation}
              isFirstFragment={isFirstFragment}
              isLight={isLight}
              isRightToLeft={textFlow.resolvedDirection === 'rtl'}
              readOnly={readOnly}
              richText={richText}
            />
          </span>
        ) : null}

        {/* All-Markup Track Changes Details Header */}
        {reviewMode === 'all' && hasRevisions && activeRev && (
          <div contentEditable={false} className="text-[0.625rem] font-mono text-rose-500/90 flex items-center gap-2 mb-1 select-none">
            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
              Revision ({activeRev.author})
            </span>
            {activeRev.originalText && (
              <span className="line-through text-rose-400 opacity-70">
                {activeRev.originalText.slice(0, 40)}{activeRev.originalText.length > 40 ? '...' : ''}
              </span>
            )}
          </div>
        )}

        {/* Paragraph Textarea / Revision Markup / Rich-text projection */}
        <div className="relative" style={{
          marginTop: `${isFirstFragment ? paragraphSpacing.beforePt : 0}pt`,
          marginBottom: `${isLastFragment ? paragraphSpacing.afterPt : 0}pt`,
          marginLeft: effectiveLeftIndentMm ? `${effectiveLeftIndentMm}mm` : undefined,
          marginRight: paragraphIndent.rightMm ? `${paragraphIndent.rightMm}mm` : undefined,
        }}>
          {/*
            WR-002 — the primary text layer of the normal writing surface.
            One `<div>` per page fragment inside the **one** contentEditable root,
            with one `<span>` per model span. No `textarea`, no per-paragraph
            editable island: a native mouse selection can run across paragraphs and
            pages, which is exactly what the fragment-per-textarea architecture made
            impossible.
          */}
          {richText && (
            <WriterParagraphRichText
              // The projection key: a hard resync of the surface bumps the epoch,
              // which makes React drop and recreate this subtree. That is the only
              // reliable way to get rid of a node the browser created behind
              // React's back (an IME's raw text node, a stray `<br>`).
              key={`${p.id}:${fragment?.key ?? 'complete'}:${surface?.projectionEpoch ?? 0}`}
              paragraph={p}
              start={fragmentStart}
              end={fragmentEnd}
              style={richTextLayerStyle}
              isActive={isActive}
              placeholder={placeholderText}
              className={
                p.style.list_style
                  ? (textFlow.resolvedDirection === 'rtl' ? 'pr-5' : 'pl-5')
                  : styleDef.name === 'quote'
                    ? (textFlow.resolvedDirection === 'rtl'
                      ? 'border-r-4 border-slate-400/60 pr-4 italic'
                      : 'border-l-4 border-slate-400/60 pl-4 italic')
                    : ''
              }
              decorations={reviewMode === 'all' && hasRevisions ? (
                <span
                  contentEditable={false}
                  data-writer-revision-markup="true"
                  className="ml-1 select-none align-super font-mono text-[0.625rem] text-rose-500/90"
                  title={`Revision (${activeRev?.author ?? 'Reviewer'})`}
                >
                  ⟦{paragraphRevisions.length}⟧
                </span>
              ) : null}
            />
          )}
          {!richText && (<>
          {reviewMode === 'all' && hasRevisions && !isEditing && (
            <div
              onClick={() => {
                if (!readOnly) setIsEditing(true);
                onSelectParagraph(p.id);
              }}
              className={`w-full py-1 select-text ${readOnly ? 'cursor-default' : 'cursor-text'}`}
              style={{
                ...textFlowCss,
                ...decorationCss,
                fontSize: `${explicitFontSize ?? styleDef.fontSizePt}pt`,
                fontFamily: explicitFontFamily ?? styleDef.fontFamily ?? 'inherit',
                fontWeight: styleDef.bold || explicitBold ? 700 : 400,
                fontStyle: styleDef.italic || explicitItalic ? 'italic' : 'normal',
                lineHeight: writerLineHeightCss(p.style, styleDef.lineHeight),
                paddingLeft: effectiveHangingIndentMm ? `${effectiveHangingIndentMm}mm` : undefined,
                textIndent: paragraphIndent.firstLineMm
                  ? `${paragraphIndent.firstLineMm}mm`
                  : effectiveHangingIndentMm ? `-${effectiveHangingIndentMm}mm` : undefined,
              }}
            >
              <WriterParagraphRevisionMarkup
                paragraphId={p.id}
                currentText={displayContent}
                revisions={paragraphRevisions}
                reviewMode={reviewMode}
                reviewerFilter={reviewerFilter}
              />
            </div>
          )}
          {showTabPreview && (
            <WriterTabLayoutPreview
              text={displayContent}
              tabStops={p.style.tab_stops}
              style={{
                ...textFlowCss,
                fontSize: `${explicitFontSize ?? styleDef.fontSizePt}pt`,
                fontFamily: explicitFontFamily ?? styleDef.fontFamily ?? 'inherit',
                fontWeight: styleDef.bold || explicitBold ? 700 : 400,
                fontStyle: styleDef.italic || explicitItalic ? 'italic' : 'normal',
                lineHeight: writerLineHeightCss(p.style, styleDef.lineHeight),
                color: effectiveTextColor,
                textShadow: writerTextShadow(styleDef.textEffect),
                paddingLeft: paragraphIndent.hangingMm ? `${paragraphIndent.hangingMm}mm` : undefined,
                textIndent: paragraphIndent.firstLineMm
                  ? `${paragraphIndent.firstLineMm}mm`
                  : paragraphIndent.hangingMm ? `-${paragraphIndent.hangingMm}mm` : undefined,
              }}
            />
          )}
          {showNonPrinting && !showTabPreview && !isEditing && (
            <WriterNonPrintingOverlay
              text={displayContent}
              showNonPrinting={showNonPrinting}
              style={{
                ...textFlowCss,
                fontSize: `${explicitFontSize ?? styleDef.fontSizePt}pt`,
                fontFamily: explicitFontFamily ?? styleDef.fontFamily ?? 'inherit',
                fontWeight: styleDef.bold || explicitBold ? 700 : 400,
                fontStyle: styleDef.italic || explicitItalic ? 'italic' : 'normal',
                lineHeight: writerLineHeightCss(p.style, styleDef.lineHeight),
                paddingLeft: paragraphIndent.hangingMm ? `${paragraphIndent.hangingMm}mm` : undefined,
                textIndent: paragraphIndent.firstLineMm
                  ? `${paragraphIndent.firstLineMm}mm`
                  : paragraphIndent.hangingMm ? `-${paragraphIndent.hangingMm}mm` : undefined,
              }}
            />
          )}
          <WriterRemoteCursorOverlay text={displayContent} fragmentStart={fragmentStart} fragmentEnd={fragmentEnd} peers={remotePeers} textStyle={collaborationTextStyle} />
          <textarea
          ref={textareaRef}
          dir={textFlow.resolvedDirection}
          // W-280: roving tabindex — the document is **one** tab stop, not one per paragraph. Without
          // it a keyboard user had to press Tab once per paragraph (plus once per footnote badge) to
          // reach anything after the document, which is unusable on a full page. The arrow keys already
          // move between paragraphs programmatically, and a programmatic focus works on `tabIndex={-1}`.
          // The fallback matters for the empty page: while nothing is active the first paragraph must
          // stay reachable, or the editor could not be entered by keyboard at all.
          tabIndex={(isFirstFragment && (activeParagraphId ? activeParagraphId === p.id : pIdx === 0)) ? 0 : -1}
          rows={fragment
            ? Math.max(1, fragment.lineCount)
            : resolveWriterParagraphLineCount({ text: displayContent, headingLevel: heading })}
          value={displayContent}
          readOnly={readOnly}
          aria-readonly={readOnly}
          aria-multiline="true"
          aria-label={`${heading ? `Überschrift Ebene ${p.style.heading_level ?? 1}` : 'Absatz'} ${pIdx + 1}`}
          onFocus={(event) => {
            if (!readOnly) setIsEditing(true);
            onSelectParagraph(p.id);
            onTextSelection(
              pIdx,
              fragmentStart + event.currentTarget.selectionStart,
              fragmentStart + event.currentTarget.selectionEnd,
            );
          }}
          onBlur={() => setIsEditing(false)}
          onPaste={(event) => {
            if (readOnly || !onPastePayload) return;
            const clipboard = event.clipboardData;
            if (!clipboard) return;
            // Ctrl/Cmd+Shift+V asks for plain text even when rich text is offered.
            // The DOM clipboard event carries no modifier state, so the request is
            // recorded on the key press that precedes the paste.
            const plainOnly = plainPasteRef.current;
            plainPasteRef.current = false;
            const html = plainOnly ? '' : clipboard.getData('text/html');
            const payload = html.trim().length > 0
              ? parseWriterClipboardHtml(html)
              : parseWriterClipboardPlainText(clipboard.getData('text/plain'));
            if (payload.length === 0) return;
            event.preventDefault();
            onPastePayload(
              payload,
              fragmentStart + event.currentTarget.selectionStart,
              fragmentStart + event.currentTarget.selectionEnd,
            );
          }}
          onMouseDown={() => { pendingRangeDragRef.current = true; }}
          onMouseUp={() => { pendingRangeDragRef.current = false; }}
          onSelect={(event) => {
            const textarea = event.currentTarget;
            // The first `select` of a drag reports the pressed position as the
            // selection start, which is exactly the anchor of the range.
            if (pendingRangeDragRef.current) {
              pendingRangeDragRef.current = false;
              onRangeSelectionStart?.(pIdx, fragmentStart + Math.min(textarea.selectionStart, textarea.selectionEnd));
            }
            onTextSelection(
              pIdx,
              fragmentStart + textarea.selectionStart,
              fragmentStart + textarea.selectionEnd,
            );
          }}
          onKeyDown={(event) => {
            // W-278: an input method editor owns the keys it is composing with — `Enter` commits the
            // candidate, `Escape` cancels it, arrows walk the candidate list. Without this guard every
            // branch below fought the IME: Escape also left editing mode and blurred, Enter also split
            // or appended a paragraph, Backspace also merged paragraphs, arrows also jumped across
            // paragraphs, Tab also inserted a tab, and a printable key also replaced a range selection
            // with one raw character. The `input` handler below already honoured composition; the
            // keydown path did not. The rule itself is shared (`accessibilityPlatform`).
            if (isImeCompositionEvent(event.nativeEvent)) return;
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'V' || event.key === 'v')) {
              plainPasteRef.current = true;
            }
            if (readOnly) {
              // The textarea refuses the input silently; report it so the visible
              // blockade can explain itself.
              const isEditKey = event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key);
              if (isEditKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                onBlockedEditAttempt?.();
              }
              return;
            }
            // A selection that spans paragraphs cannot be replaced by the
            // browser: no single textarea owns it. The editor replaces it.
            if (hasRangeSelection) {
              if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault();
                onReplaceRangeSelection?.('');
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                onReplaceRangeSelection?.('\n');
                return;
              }
              if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                onReplaceRangeSelection?.(event.key);
                return;
              }
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setIsEditing(false);
              event.currentTarget.blur();
              return;
            }
            // Caret movement that would leave this textarea: the browser cannot
            // cross into the neighbouring paragraph on its own.
            {
              const navigationTarget = event.currentTarget;
              const collapsed = navigationTarget.selectionStart === navigationTarget.selectionEnd;
              const navigation = collapsed
                ? resolveWriterKeyboardNavigation({
                    key: event.key,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    paragraphs: allParagraphs,
                    paragraphIndex: pIdx,
                    caretOffset: fragmentStart + navigationTarget.selectionStart,
                    fragmentStart,
                    fragmentEnd: fragmentStart + navigationTarget.value.length,
                    isFirstFragment: !fragment || fragment.isFirst,
                    isLastFragment,
                    pageBoundary,
                  })
                : null;
              if (navigation) {
                event.preventDefault();
                onNavigate?.(navigation.target, navigation.extendSelection);
                return;
              }
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              const isList = Boolean(p.style.list_style || p.style.heading_outline_numbered);
              if (isList) {
                if (event.shiftKey) {
                  onOutdentListLevel?.(pIdx);
                } else {
                  onIndentListLevel?.(pIdx, 1);
                }
                return;
              }
              const textarea = event.currentTarget;
              const insertion = insertWriterTabAtRange(
                textarea.value,
                textarea.selectionStart,
                textarea.selectionEnd,
              );
              const nextText = composeWriterParagraphTextFromFragment({
                fullText: rawText,
                fragmentStart,
                fragmentEnd: fragment?.endOffset ?? rawText.length,
                fragmentValue: insertion.text,
              });
              const nextCaret = onParagraphChange(pIdx, nextText, fragmentStart + insertion.caret);
              requestAnimationFrame(() => {
                const localCaret = Math.max(0, nextCaret - fragmentStart);
                textarea.setSelectionRange(localCaret, localCaret);
              });
              return;
            }
            const backspaceIntent = resolveWriterBackspaceIntent({
              shiftKey: event.shiftKey,
              paragraphIndex: pIdx,
              fragmentIsFirst: !fragment || fragment.isFirst,
              selectionStart: event.currentTarget.selectionStart,
              selectionEnd: event.currentTarget.selectionEnd,
            });
            if (event.key === 'Backspace' && backspaceIntent === 'merge-backward') {
              event.preventDefault();
              onMergeParagraphBackward?.(pIdx);
              return;
            }
            const enterIntent = event.key !== 'Enter'
              ? 'default'
              : resolveWriterEnterIntent({
                  shiftKey: event.shiftKey,
                  isLastFragment,
                  isEmptyListParagraph: Boolean(p.style.list_style) && rawText.trim().length === 0,
                  selectionStart: event.currentTarget.selectionStart,
                  selectionEnd: event.currentTarget.selectionEnd,
                  valueLength: event.currentTarget.value.length,
                });
            if (enterIntent === 'exit-list') {
              event.preventDefault();
              onExitListMode?.(pIdx);
              return;
            }
            if (enterIntent === 'append-paragraph') {
              event.preventDefault();
              onAddParagraph(pIdx);
              return;
            }
            if (enterIntent === 'split-paragraph') {
              event.preventDefault();
              onSplitParagraph?.(pIdx, fragmentStart + event.currentTarget.selectionStart);
            }
          }}
          onChange={(event) => {
            if (readOnly) return;
            const textarea = event.currentTarget;
            const isComposing = event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing;
            const nextText = composeWriterParagraphTextFromFragment({
              fullText: rawText,
              fragmentStart,
              fragmentEnd: fragment?.endOffset ?? rawText.length,
              fragmentValue: textarea.value,
            });
            const nextCaret = onParagraphChange(
              pIdx,
              nextText,
              isComposing ? undefined : fragmentStart + textarea.selectionStart,
            );
            const localCaret = Math.max(0, nextCaret - fragmentStart);
            if (!isComposing && localCaret !== textarea.selectionStart) {
              requestAnimationFrame(() => textarea.setSelectionRange(localCaret, localCaret));
            }
            if (!isComposing) {
              // Re-pagination can move this paragraph's fragment boundaries or
              // replace the focused textarea entirely. Re-establish the caret
              // after layout so typing across a page break stays continuous.
              requestWriterCaretAfterLayout({ paragraphId: p.id, start: nextCaret, origin: 'pagination' });
            }
          }}
          style={{
            ...textFlowCss,
            ...decorationCss,
            fontSize: `${explicitFontSize ?? styleDef.fontSizePt}pt`,
            fontFamily: explicitFontFamily ?? styleDef.fontFamily ?? 'inherit',
            fontWeight: styleDef.bold || explicitBold ? 700 : 400,
            fontStyle: styleDef.italic || explicitItalic ? 'italic' : 'normal',
            textDecoration: explicitStrike ? 'line-through' : explicitUnderline ? 'underline' : 'none',
            color: showTabPreview ? 'transparent' : effectiveTextColor,
            caretColor: effectiveTextColor,
            textShadow: writerTextShadow(styleDef.textEffect),
            backgroundColor: decorationCss.backgroundColor ?? effectiveHighlightColor,
            textAlign: p.style.alignment === 'distributed' ? 'justify' : (p.style.alignment ?? styleDef.alignment ?? 'left'),
            textAlignLast: p.style.alignment === 'distributed' ? 'justify' : undefined,
            lineHeight: writerLineHeightCss(p.style, styleDef.lineHeight),
            paddingLeft: effectiveHangingIndentMm ? `${effectiveHangingIndentMm}mm` : undefined,
            textIndent: paragraphIndent.firstLineMm
              ? `${paragraphIndent.firstLineMm}mm`
              : effectiveHangingIndentMm ? `-${effectiveHangingIndentMm}mm` : undefined,
          }}
          className={`w-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 resize-none py-1 overflow-y-auto no-scrollbar select-text ${readOnly ? 'cursor-text' : ''} ${
            reviewMode === 'all' && hasRevisions && !isEditing ? 'hidden' : ''
          } ${
            p.style.list_style ? (textFlow.resolvedDirection === 'rtl' ? 'pr-5' : 'pl-5') : ''
          } ${styleDef.name === 'quote' ? (textFlow.resolvedDirection === 'rtl' ? 'border-r-4 border-slate-400/60 pr-4 italic' : 'border-l-4 border-slate-400/60 pl-4 italic') : ''}`}
          placeholder={placeholderText}
          />
          </>)}

          {/* Footnote & Endnote Superscript Badges */}
          {paragraphNotes.length > 0 && isLastFragment && (
            // A non-editable island: the badge is a button, not document text, and
            // the browser must not be able to put a caret into it or select it away.
            <span contentEditable={false} className="inline-flex items-center gap-1 select-none ml-1 align-super text-[0.625rem] font-mono">
              {paragraphNotes.map((note) => (
                <sup
                  key={note.id}
                  // The id is what the note entry's "jump back to the reference" link
                  // points at. Without it the link was dead: `#fn-ref-<id>` matched no
                  // element, so the jump went nowhere.
                  id={writerNoteReferenceAnchorId(note)}
                  // The badge already showed `cursor-pointer`; the click now does what
                  // the cursor promises and brings the note at the page bottom into view.
                  onClick={() => jumpToWriterNote(note, 'to-note')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      jumpToWriterNote(note, 'to-note');
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${note.noteType === 'endnote' ? 'Endnote' : 'Footnote'} ${note.number}: ${note.text.slice(0, 60)}`}
                  className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold cursor-pointer hover:underline focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:outline-none"
                  title={note.text}
                >
                  {note.customMark || (note.noteType === 'endnote' ? `[en.${note.number}]` : `[fn.${note.number}]`)}
                </sup>
              ))}
            </span>
          )}
        </div>

        {showNonPrinting && (
          <span contentEditable={false} className="text-[0.625rem] text-blue-400/60 font-mono select-none ml-1">¶</span>
        )}
      </div>
    </>
  );
};
