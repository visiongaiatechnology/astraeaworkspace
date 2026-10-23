// STATUS: PLATIN — The one Writer rich-text edit surface
//
// Product decision (ASTRAEA WRITER 50 V2, WR-002): the document body is **one**
// logical text space. The paginator may split a paragraph into several DOM
// fragments for the visual pages, but there is exactly one editable root, never
// one per paragraph or per page. That is what makes a native mouse selection able
// to run across paragraphs and pages, which the previous "one `textarea` per
// fragment" architecture could not express at all.
//
// Division of labour:
//
//   DOM event  →  this component  →  model transaction  →  `Paragraph[]` (truth)
//                              ↑                                    │
//                              └──────── React re-projection ←───────┘
//
// **The browser is not allowed to edit the DOM.** Every text edit, deletion and
// selection replacement is intercepted (`beforeinput`/`keydown` +
// `preventDefault()`) and turned into a model transaction. The reason is not
// purity: a `contentEditable` block whose children are React-managed `<span>`s
// breaks the moment the browser inserts a bare text node next to them or deletes
// one of them. React then appends its own `<span>` behind the browser's node, and
// from that point two nodes carry the same character — the real "W → WW → WaWaW"
// duplication found in the Windows probe.
//
// The one exception is an IME composition, which is owned by the operating
// system. It is allowed to write, is reconciled once at `compositionend`, and is
// then wiped by a **hard resync** (`scrubWriterSurfaceDom` + a projection epoch
// that re-mounts the fragments from `Paragraph[]`). So even the IME path cannot
// leave a browser-authored node behind.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { WriterSelectionPoint, WriterSelectionRange } from '../../editing/selection/writerSelectionRange';
import { resolveWriterCaretStepTarget } from '../../editing/caret/writerCaretStep';
import { serializeWriterSelectionForClipboard } from '../../editing/clipboard/writerClipboardSerialize';
import { isImeCompositionEvent } from '../../../../shared/accessibility/accessibilityPlatform';
import {
  parseWriterClipboardHtml,
  parseWriterClipboardPlainText,
  type WriterClipboardParagraph,
} from '../../editing/clipboard/writerClipboardPayload';
import {
  subscribeWriterCaret,
  type WriterCaretRequest,
} from '../../editing/caret/writerCaretController';
import {
  WRITER_SURFACE_ROOT_ATTR,
  collectWriterSurfaceFragments,
  readWriterSurfaceParagraphText,
  readWriterSurfaceSelection,
  scrubWriterSurfaceDom,
  writerSurfaceContains,
  writerSurfaceDomIsClean,
  writerSurfaceMatchesModel,
  writerSurfaceRangeIsCollapsed,
  writerSurfaceRangesEqual,
  writeWriterSurfaceSelection,
} from './writerDomModelAdapter';
import {
  isWriterSurfaceCompositionInputType,
  reconcileWriterSurfaceInput,
  resolveWriterSurfaceInputIntent,
  resolveWriterSurfaceKeyIntent,
  type WriterSurfaceCaretContext,
  type WriterSurfaceEditIntent,
} from './writerInputTransactions';
import { writerSurfaceCaretRange } from './writerSelectionBridge';
import type { WriterSearchHighlightMap } from '../../productivity/search/writerSearchHighlights';
import { EMPTY_WRITER_SEARCH_HIGHLIGHTS } from '../../productivity/search/writerSearchHighlights';

export interface WriterRichTextSurfaceContextValue {
  /** True inside the one editable document body. */
  readonly richTextActive: true;
  readonly readOnly: boolean;
  /**
   * Incremented whenever the fragments had to be rebuilt from the model.
   *
   * Consumers use it as part of the projection key, so a re-mount is a real
   * re-mount: React drops the whole subtree, including any node the browser
   * created behind its back.
   */
  readonly projectionEpoch: number;
  /**
   * WR-036 — visible search hits.
   *
   * The find bar computes them; the run projection underlines them. They are decoration,
   * never model state: a highlight disappears without touching a single span.
   */
  readonly searchHighlights: WriterSearchHighlightMap;
}

const WriterRichTextSurfaceContext = createContext<WriterRichTextSurfaceContextValue | null>(null);

/**
 * `null` outside the surface — the special views (outline, reading, draft) and
 * the paragraph component's standalone tests keep their own rendering path.
 */
export function useWriterRichTextSurface(): WriterRichTextSurfaceContextValue | null {
  return useContext(WriterRichTextSurfaceContext);
}

export interface WriterRichTextSurfaceProps {
  readonly paragraphs: readonly Paragraph[];
  readonly readOnly: boolean;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly ariaLabel: string;
  /** Selection moved. `null` when the selection left the surface. */
  readonly onSelectionChange: (range: WriterSelectionRange | null) => void;
  /**
   * One paragraph changed. Returns the caret the owner actually persisted, which
   * can differ from the requested one (AutoCorrect rewrites text).
   */
  readonly onParagraphTextChange: (paragraphIndex: number, nextText: string, caret: number) => number;
  readonly onSplitParagraph: (paragraphIndex: number, offset: number) => void;
  readonly onMergeParagraphBackward: (paragraphIndex: number) => void;
  /** Replace a range the model owns (multi-paragraph selection, delete, forward merge). */
  readonly onReplaceSelection: (range: WriterSelectionRange, replacement: string) => void;
  /** WR-019: paste a parsed clipboard payload at a range, formatting included. */
  readonly onPasteRich?: (range: WriterSelectionRange, blocks: readonly WriterClipboardParagraph[]) => void;
  /** WR-020: the browser's own historyUndo/historyRedo requests. */
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  /** WR-025: open the text context menu from Shift+F10 / the ContextMenu key. */
  readonly onRequestContextMenu?: () => void;
  /** WR-033: an image pasted from the clipboard is imported like a dropped file. */
  readonly onInsertImageFile?: (file: File) => void;
  /** WR-035: Strg+Klick on an external link opens it through the shell. */
  readonly onOpenExternalUrl?: (url: string) => void;
  /** Indent a list item through the established list commands. */
  readonly onIndentListLevel?: (paragraphIndex: number, delta?: number) => void;
  /** WR-011: Enter on an empty list item ends the list. */
  readonly onExitListMode?: (paragraphIndex: number) => void;
  /** A keystroke was refused because the document is protected. */
  readonly onBlockedEditAttempt?: () => void;
  /**
   * Asks the owner to re-project the pages from the model.
   *
   * Used only by the repair path: when the live DOM no longer matches the model
   * projection, the DOM is rebuilt from the model instead of being trusted.
   */
  readonly onRequestProjectionRepair?: () => void;
  /** Keyboard entry into a document that has no paragraph yet. */
  readonly onKeyboardEntry?: (
    key: string,
    modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  ) => boolean;
  /** WR-036: paragraphs and ranges the find bar marked, rendered as `<mark>`. */
  readonly searchHighlights?: WriterSearchHighlightMap;
  /** WR-047: BCP-47 language of the document text (default German). */
  readonly language?: string;
  readonly children: React.ReactNode;
}

function collapsedRange(paragraphId: string, offset: number): WriterSelectionRange {
  const point: WriterSelectionPoint = { paragraphId, offset };
  return { anchor: point, focus: point };
}

function paragraphModelText(paragraph: Paragraph): string {
  return paragraph.spans.map((span) => span.text).join('');
}

/**
 * True when the event belongs to a *different* editing host inside the surface.
 *
 * The header field, table-cell inputs and `contenteditable="false"` islands live
 * inside the same editable root, so their `input`/`keydown` events bubble up here.
 * Treating them as document input would re-project the pages under the user's
 * cursor while they are typing into a header — the exact kind of feedback loop a
 * rich-text surface must not have.
 */
function isForeignWriterSurfaceTarget(event: { target: EventTarget | null }): boolean {
  const target = event.target;
  if (!target || (target as Node).nodeType === undefined) return false;
  const element = (target as Node).nodeType === 1
    ? (target as Element)
    : (target as Node).parentElement;
  if (!element || typeof element.closest !== 'function') return false;
  if (element.closest('[data-writer-surface-paragraph]') !== null) return false;
  return element.closest('input, textarea, select, [contenteditable="false"]') !== null;
}

interface ResolvedCaretContext {
  readonly range: WriterSelectionRange;
  readonly paragraph: Paragraph;
  readonly paragraphIndex: number;
  readonly caret: WriterSurfaceCaretContext;
}

export const WriterRichTextSurface: React.FC<WriterRichTextSurfaceProps> = ({
  paragraphs,
  readOnly,
  className = '',
  style,
  ariaLabel,
  onSelectionChange,
  onParagraphTextChange,
  onSplitParagraph,
  onMergeParagraphBackward,
  onReplaceSelection,
  onPasteRich,
  onUndo,
  onRedo,
  onRequestContextMenu,
  onInsertImageFile,
  onOpenExternalUrl,
  onIndentListLevel,
  onExitListMode,
  onBlockedEditAttempt,
  onRequestProjectionRepair,
  onKeyboardEntry,
  searchHighlights = EMPTY_WRITER_SEARCH_HIGHLIGHTS,
  language = 'de-DE',
  children,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);
  const applyingSelectionRef = useRef(false);
  const handledCaretTokenRef = useRef(0);
  const caretTokenRef = useRef(0);
  const pendingCaretRef = useRef<{ token: number; range: WriterSelectionRange } | null>(null);
  /** The one pending caret frame; a newer request replaces it instead of stacking. */
  const caretFrameRef = useRef<number | null>(null);
  /** Set by Ctrl+Shift+V: the next paste must ignore the rich variant. */
  const plainPasteRef = useRef(false);
  /**
   * The paragraph the composition started in.
   *
   * A browser keeps the selection inside the composing text node, so
   * compositionend can read it — but an input method (or a replacement of the whole
   * text node) can invalidate it. Remembering the paragraph keeps the committed
   * characters from being thrown away in that case.
   */
  const composingParagraphRef = useRef<string | null>(null);
  /** The projection the range restore already ran for (WR-017). */
  const restoredProjectionRef = useRef<{ paragraphs: readonly Paragraph[]; epoch: number } | null>(null);
  const lastRangeRef = useRef<WriterSelectionRange | null>(null);
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;
  /**
   * Forces the fragments to be re-mounted from the model.
   *
   * A counter and not a boolean: two consecutive hard resyncs must both produce a
   * new key, otherwise the second one would be a no-op exactly when it matters.
   */
  const [projectionEpoch, setProjectionEpoch] = useState(0);

  /**
   * Writes a caret into the DOM and remembers it as "the range the surface knows".
   *
   * Recording the range here is what makes the browser's echoed `selectionchange`
   * free: `publishSelection` compares against it and returns without a state
   * update, so a typed character costs one render (the model change) instead of two.
   */
  const applyPendingCaret = useCallback((range: WriterSelectionRange, focusSurface: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    applyingSelectionRef.current = true;
    try {
      writeWriterSurfaceSelection(root, range, focusSurface);
      lastRangeRef.current = range;
    } finally {
      applyingSelectionRef.current = false;
    }
  }, []);

  /**
   * Applies a caret after the next commit.
   *
   * A model transaction re-renders the projection; if the browser's text node
   * structure changed, React may replace nodes and the caret collapses. The
   * pending range is applied in the layout effect *after* the commit, so the
   * caret always ends up at the model position that was just persisted.
   */
  const scheduleCaret = useCallback((range: WriterSelectionRange, focusSurface = false) => {
    /**
     * Focus **synchronously**, selection on the next frame.
     *
     * A caret is only visible when the editable host has focus, so the focus must
     * not wait for a re-render or an animation frame: the user clicked, and the
     * cursor has to be there. The *position* needs the frame, because the
     * projection may still be re-rendering.
     */
    if (focusSurface) {
      const root = rootRef.current;
      if (root && root.ownerDocument?.activeElement !== root) {
        try {
          root.focus({ preventScroll: true });
        } catch {
          root.focus();
        }
      }
    }
    const token = caretTokenRef.current + 1;
    caretTokenRef.current = token;
    pendingCaretRef.current = { token, range };
    const apply = () => {
      caretFrameRef.current = null;
      const pending = pendingCaretRef.current;
      if (!pending || pending.token !== token) return;
      pendingCaretRef.current = null;
      applyPendingCaret(pending.range, focusSurface);
    };
    if (typeof requestAnimationFrame === 'function') {
      // One pending frame is enough: the callback always reads the *latest*
      // pending range, so an older frame would only duplicate the same write.
      if (caretFrameRef.current !== null) cancelAnimationFrame(caretFrameRef.current);
      caretFrameRef.current = requestAnimationFrame(apply);
    } else {
      apply();
    }
  }, [applyPendingCaret]);

  const publishSelection = useCallback(() => {
    if (applyingSelectionRef.current) return;
    const root = rootRef.current;
    if (!root) return;
    const range = readWriterSurfaceSelection(root);
    if (!range) return;
    /**
     * The surface writes the DOM selection itself after every keystroke.
     * Chromium delivers `selectionchange` for that write asynchronously, so
     * without this comparison every typed character would trigger a second
     * React render cycle (state → editor → re-projection) on top of the one the
     * model transaction already caused. Comparing against the range the surface
     * last wrote turns that echo into a no-op.
     */
    if (writerSurfaceRangesEqual(lastRangeRef.current, range)) return;
    lastRangeRef.current = range;
    onSelectionChange(range);
  }, [onSelectionChange]);

  // The pending caret is applied **after** the commit that re-projected the
  // pages, so it always lands on the model position that was just persisted and
  // never on a stale DOM offset.
  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (pending) {
      pendingCaretRef.current = null;
      // The commit already re-projected the pages: the frame fallback would only
      // write the same selection a second time.
      if (caretFrameRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(caretFrameRef.current);
        caretFrameRef.current = null;
      }
      applyPendingCaret(pending.range, false);
      return;
    }
    /**
     * WR-016 — a **marked range** survives a re-projection.
     *
     * Formatting a selection rewrites the runs, so the DOM nodes the browser's range
     * pointed at are replaced and the range collapses (or jumps to the fragment
     * start). While the surface still has the focus and the last known range is not
     * a caret, the range is written back.
     *
     * WR-017 (native M4 probe) — only after a **real projection change**.
     *
     * This effect runs after every render. Restoring unconditionally meant that the
     * next cursor movement (an arrow key, a click, `End`) was overwritten on the spot:
     * the old selection was pushed back into the DOM whenever it disagreed with
     * `lastRangeRef`. The restore now happens once per changed projection
     * (`paragraphs` identity or the repair epoch), never in between, and the equality
     * check keeps it a no-op when the browser preserved the selection anyway.
     */
    const previousProjection = restoredProjectionRef.current;
    const projectionChanged = previousProjection === null
      || previousProjection.paragraphs !== paragraphs
      || previousProjection.epoch !== projectionEpoch;
    restoredProjectionRef.current = { paragraphs, epoch: projectionEpoch };
    if (!projectionChanged) return;
    const lastRange = lastRangeRef.current;
    if (!lastRange || writerSurfaceRangeIsCollapsed(lastRange)) return;
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const active = doc?.activeElement ?? null;
    if (active === null || (active !== root && !root.contains(active))) return;
    const current = readWriterSurfaceSelection(root);
    if (current && writerSurfaceRangesEqual(current, lastRange)) return;
    applyPendingCaret(lastRange, false);
  });

  // Selection reporting. `selectionchange` is the only event that also fires for
  // a keyboard-driven caret, a double-click word selection and a drag that
  // crosses a page boundary.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handler = () => {
      if (composingRef.current) return;
      publishSelection();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [publishSelection]);

  // Caret hand-over from the editor state. Every existing command (Enter, paste,
  // search jump, note insertion, undo) publishes through this one channel, so the
  // surface honours them without a second, competing caret authority.
  useEffect(() => {
    const consume = (request: WriterCaretRequest) => {
      const root = rootRef.current;
      if (!root) return;
      if (request.token <= handledCaretTokenRef.current) return;
      handledCaretTokenRef.current = request.token;
      const doc = root.ownerDocument;
      const active = doc?.activeElement ?? null;
      const inside = active !== null && (active === root || writerSurfaceContains(root, active));
      if (request.origin === 'pagination' && !inside) return;
      const focusSurface = inside || active === null || active === doc?.body;
      scheduleCaret(writerSurfaceCaretRange(request.paragraphId, request.start, request.end), focusSurface);
    };
    return subscribeWriterCaret(consume);
  }, [scheduleCaret]);

  /**
   * Rebuilds the rendered fragments from `Paragraph[]`.
   *
   * This is the safety net for everything the surface could not pre-empt — an IME
   * composition, a browser that ignores `beforeinput`, an extension writing into
   * the DOM. It **never** reads the DOM back: the foreign nodes are removed
   * (`scrubWriterSurfaceDom`), the projection epoch changes so React drops and
   * recreates each fragment, and the caret is restored to the last model position.
   */
  const hardResync = useCallback(() => {
    const root = rootRef.current;
    if (root) scrubWriterSurfaceDom(root);
    if (!pendingCaretRef.current && lastRangeRef.current) {
      scheduleCaret(lastRangeRef.current, false);
    }
    setProjectionEpoch((value) => value + 1);
    onRequestProjectionRepair?.();
  }, [onRequestProjectionRepair, scheduleCaret]);

  /** The model context of the current DOM selection, or `null` outside a paragraph. */
  const resolveCaretContext = useCallback((): ResolvedCaretContext | null => {
    const root = rootRef.current;
    if (!root) return null;
    /**
     * WR-017 — a caret the DOM cannot report is not a reason to do nothing.
     *
     * While the browser sits between two fragments (a click on the page body, a
     * selection the browser dropped, the moment after `Strg+A`), the read returns
     * `null`. Falling back to the last range the surface knows keeps `Strg+A`,
     * `Strg+Home`, `Strg+End` and the arrow keys working instead of aborting
     * silently.
     */
    const domRange = readWriterSurfaceSelection(root);
    const range = domRange ?? lastRangeRef.current;
    if (!range) return null;
    const list = paragraphsRef.current;
    const paragraphIndex = list.findIndex((paragraph) => paragraph.id === range.focus.paragraphId);
    if (paragraphIndex < 0) return null;
    const paragraph = list[paragraphIndex];
    if (!paragraph) return null;
    const collapsed = writerSurfaceRangeIsCollapsed(range);
    return {
      range,
      paragraph,
      paragraphIndex,
      caret: {
        paragraphIndex,
        offset: range.focus.offset,
        paragraphText: paragraphModelText(paragraph),
        hasSelection: !collapsed,
        spansParagraphs: !collapsed && range.anchor.paragraphId !== range.focus.paragraphId,
        hasPreviousParagraph: paragraphIndex > 0,
        hasNextParagraph: paragraphIndex < list.length - 1,
        isListParagraph: Boolean(paragraph.style.list_style),
      },
    };
  }, []);

  /**
   * Applies one decided edit to the model.
   *
   * Every branch ends in an already existing writer command; the surface adds no
   * second editing path. The caret is scheduled *before* the state update so it is
   * pending when the commit lands.
   */
  const applyIntent = useCallback((
    intent: WriterSurfaceEditIntent | null,
    range: WriterSelectionRange | null,
  ): void => {
    if (!intent || !range) return;
    const list = paragraphsRef.current;
    const paragraphIndex = list.findIndex((paragraph) => paragraph.id === range.focus.paragraphId);
    if (paragraphIndex < 0) return;
    const paragraph = list[paragraphIndex];
    if (!paragraph) return;
    const text = paragraphModelText(paragraph);

    const commitText = (nextText: string, caret: number): void => {
      const bounded = Math.max(0, Math.min(caret, nextText.length));
      scheduleCaret(collapsedRange(paragraph.id, bounded), false);
      const settled = onParagraphTextChange(paragraphIndex, nextText, bounded);
      if (typeof settled === 'number' && settled !== bounded) {
        scheduleCaret(collapsedRange(paragraph.id, settled), false);
      }
    };

    switch (intent.kind) {
      case 'replace-selection': {
        onReplaceSelection(range, intent.replacement);
        return;
      }
      case 'insert-text':
      case 'insert-line-break':
      case 'insert-tab': {
        const inserted = intent.kind === 'insert-text'
          ? intent.text
          : intent.kind === 'insert-tab' ? '\t' : '\n';
        const offset = Math.max(0, Math.min(intent.offset, text.length));
        commitText(`${text.slice(0, offset)}${inserted}${text.slice(offset)}`, offset + inserted.length);
        return;
      }
      case 'delete-backward': {
        const offset = Math.max(0, Math.min(intent.offset, text.length));
        const start = Math.max(0, offset - Math.max(0, intent.length));
        if (start === offset) return;
        commitText(`${text.slice(0, start)}${text.slice(offset)}`, start);
        return;
      }
      case 'delete-forward': {
        const offset = Math.max(0, Math.min(intent.offset, text.length));
        const end = Math.min(text.length, offset + Math.max(0, intent.length));
        if (end === offset) return;
        commitText(`${text.slice(0, offset)}${text.slice(end)}`, offset);
        return;
      }
      case 'split-paragraph': {
        onSplitParagraph(paragraphIndex, intent.offset);
        return;
      }
      case 'merge-backward': {
        onMergeParagraphBackward(paragraphIndex);
        return;
      }
      case 'exit-list': {
        onExitListMode?.(paragraphIndex);
        return;
      }
      case 'select-all': {
        // WR-017: the whole running text, from the first paragraph's start to the
        // last paragraph's end — the model range, not whatever the browser's
        // select-all happens to include inside the editing host.
        const first = list[0];
        const last = list[list.length - 1];
        if (!first || !last) return;
        const wholeText: WriterSelectionRange = {
          anchor: { paragraphId: first.id, offset: 0 },
          focus: { paragraphId: last.id, offset: paragraphModelText(last).length },
        };
        scheduleCaret(wholeText, false);
        // A programme-set range is a user intent: report it, do not wait for the echo.
        onSelectionChange(wholeText);
        return;
      }
      case 'move-caret': {
        const first = list[0];
        const last = list[list.length - 1];
        if (!first || !last) return;
        const point = intent.to === 'document-start'
          ? { paragraphId: first.id, offset: 0 }
          : { paragraphId: last.id, offset: paragraphModelText(last).length };
        // Shift extends from wherever the selection started.
        const target: WriterSelectionRange = intent.extend
          ? { anchor: range.anchor, focus: point }
          : { anchor: point, focus: point };
        scheduleCaret(target, true);
        onSelectionChange(target);
        return;
      }
      case 'caret-step': {
        /**
         * WR-017 — the surface writes these itself.
         *
         * `scheduleCaret(..., true)` also focuses the editing host, so the next key
         * reaches the surface even when the browser had dropped the focus (the state
         * a click on a `tabindex="-1"` paragraph used to leave behind).
         */
        const point = resolveWriterCaretStepTarget(list, range.focus, intent.step);
        if (!point) return;
        const target: WriterSelectionRange = intent.extend
          ? { anchor: range.anchor, focus: point }
          : { anchor: point, focus: point };
        scheduleCaret(target, true);
        onSelectionChange(target);
        return;
      }
      case 'merge-forward': {
        const next = list[paragraphIndex + 1];
        if (!next) return;
        // Expressed with the canonical cross-paragraph replacement: the range
        // covers exactly the paragraph boundary, so the successor's spans are
        // appended to this paragraph and its block disappears.
        onReplaceSelection({
          anchor: { paragraphId: paragraph.id, offset: text.length },
          focus: { paragraphId: next.id, offset: 0 },
        }, '');
        return;
      }
      default: {
        const unreachable: never = intent;
        void unreachable;
      }
    }
  }, [onExitListMode, onMergeParagraphBackward, onParagraphTextChange, onReplaceSelection, onSplitParagraph, scheduleCaret]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isForeignWriterSurfaceTarget(event)) return;
    const root = rootRef.current;
    if (!root) return;
    if (composingRef.current || isImeCompositionEvent(event.nativeEvent)) return;

    /**
     * WR-025 — the text menu without a mouse.
     *
     * `Shift+F10` and the dedicated `ContextMenu` key are the platform bindings for
     * "open the context menu here". They are handled before every edit key so the
     * menu opens at the caret and the document is untouched.
     */
    const isContextMenuKey = event.key === 'ContextMenu'
      || (event.key === 'F10' && event.shiftKey);
    if (isContextMenuKey && onRequestContextMenu) {
      event.preventDefault();
      onRequestContextMenu();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'V' || event.key === 'v')) {
      plainPasteRef.current = true;
    }

    if (readOnly) {
      const isEditKey = event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key);
      if (isEditKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        onBlockedEditAttempt?.();
      }
      return;
    }

    const list = paragraphsRef.current;
    // A document without a paragraph has nothing the surface could edit: hand the
    // keystroke to the editor's entry path, which creates the first paragraph.
    if (collectWriterSurfaceFragments(root).length === 0 || list.length === 0) {
      if (
        onKeyboardEntry?.(event.key, {
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
        })
      ) {
        event.preventDefault();
      }
      return;
    }

    const context = resolveCaretContext();
    if (!context) return;

    // Tab inside a list stays the established list command.
    if (event.key === 'Tab' && context.paragraph.style.list_style && onIndentListLevel) {
      event.preventDefault();
      onIndentListLevel(context.paragraphIndex, event.shiftKey ? -1 : 1);
      return;
    }

    const intent = resolveWriterSurfaceKeyIntent({
      ...context.caret,
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    });
    if (!intent) return;
    event.preventDefault();
    applyIntent(intent, context.range);
  }, [applyIntent, onBlockedEditAttempt, onIndentListLevel, onKeyboardEntry, onRedo, onUndo, readOnly, resolveCaretContext]);

  /**
   * `beforeinput` is where the browser is stopped.
   *
   * Everything that is not an IME composition is cancelled — including the plain
   * `insertText` and including the browser's own undo/redo. The intended edit is
   * then applied to the model. A browser-side change is therefore impossible by
   * construction, not merely repaired afterwards.
   *
   * **Attached natively**, not through React's `onBeforeInput`: React 19 no longer
   * synthesises that event (a probe with a plain `InputEvent` reached no handler at
   * all), so the handler was dead code — a context-menu `Undo`, which produces only
   * `beforeinput historyUndo`, could roll the DOM back behind the model's back.
   */
  const applyBeforeInput = useCallback((native: InputEvent) => {
    if (isForeignWriterSurfaceTarget(native)) return;
    const inputType = typeof native.inputType === 'string' ? native.inputType : '';
    if (inputType.length === 0) return;
    // An IME owns its composition; it is reconciled at `compositionend`.
    if (isWriterSurfaceCompositionInputType(inputType)) return;

    /**
     * The browser's own history commands are cancelled and routed to the Writer's
     * one history (WR-020).
     *
     * A `contenteditable` host gets `historyUndo`/`historyRedo` from the context menu,
     * from `Ctrl+Z` on some platforms and from assistive technology — paths where no
     * `keydown` reaches the shortcut hook.
     */
    if (inputType === 'historyUndo' || inputType === 'historyRedo') {
      native.preventDefault();
      if (readOnly) {
        onBlockedEditAttempt?.();
        return;
      }
      if (inputType === 'historyUndo') onUndo?.();
      else onRedo?.();
      return;
    }

    native.preventDefault();
    if (readOnly) {
      onBlockedEditAttempt?.();
      return;
    }
    const context = resolveCaretContext();
    if (!context) return;
    const intent = resolveWriterSurfaceInputIntent({
      ...context.caret,
      inputType,
      data: typeof native.data === 'string' ? native.data : null,
    });
    if (!intent) return;
    applyIntent(intent, context.range);
  }, [applyIntent, onBlockedEditAttempt, onRedo, onUndo, readOnly, resolveCaretContext]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const listener = (event: Event) => applyBeforeInput(event as InputEvent);
    root.addEventListener('beforeinput', listener);
    return () => root.removeEventListener('beforeinput', listener);
  }, [applyBeforeInput]);

  /**
   * Safety net for a browser edit the surface did not originate.
   *
   * Two different things can arrive here:
   *
   * - the DOM text changed inside a **managed** run (a browser without
   *   `beforeinput` support, dictation, a spellcheck replacement) — the diff is
   *   real and is reconciled into the model, and the fragment is re-mounted right
   *   after, so the browser-authored structure never survives;
   * - the DOM text changed through **foreign** nodes — still reconciled by its
   *   text diff (so the typed character is not lost), then scrubbed and re-mounted.
   *
   * What is never done is trusting the DOM as the authority: after the reconcile
   * the fragment is rebuilt from `Paragraph[]`, so an accumulation like
   * `W → WW → WaWaW` cannot happen even here.
   */
  const handleInput = useCallback((event: React.FormEvent<HTMLDivElement>) => {
    if (isForeignWriterSurfaceTarget(event)) return;
    const native = event.nativeEvent as InputEvent | undefined;
    if (composingRef.current || (native && native.isComposing === true)) return;
    const root = rootRef.current;
    if (!root || readOnly) return;

    const context = resolveCaretContext();
    if (!context) {
      hardResync();
      return;
    }
    const modelText = paragraphModelText(context.paragraph);
    const domText = readWriterSurfaceParagraphText(root, context.paragraph.id);
    if (domText === null) {
      hardResync();
      return;
    }

    if (domText === modelText) {
      // No character changed — but a structural deviation still has to go.
      if (writerSurfaceMatchesModel(root, context.paragraph) === false) hardResync();
      return;
    }

    const clean = writerSurfaceDomIsClean(root);
    const reconciliation = reconcileWriterSurfaceInput(context.paragraphIndex, modelText, domText);
    if (reconciliation) {
      scheduleCaret(collapsedRange(context.paragraph.id, reconciliation.caret), false);
      onParagraphTextChange(context.paragraphIndex, reconciliation.afterText, reconciliation.caret);
    }
    // The DOM was edited by the browser. Re-project it from the model so no
    // browser-authored node (and no duplicate of a character) survives.
    if (!clean || writerSurfaceMatchesModel(root, context.paragraph) === false) hardResync();
  }, [hardResync, onParagraphTextChange, readOnly, resolveCaretContext, scheduleCaret]);

  /**
   * WR-019 — copy and cut are written from the **model**.
   *
   * Chromium serialises its own DOM view of the selection into `text/html`, and a
   * Writer run is a `<span style="font-weight:700">`, not a `<strong>`. Copying a
   * bold word out of this editor therefore produced markup that the paste path (and
   * most foreign editors) treated as plain text — the formatting was gone after
   * `Strg+C`/`Strg+V` (native M4 probe). The surface now writes both `text/plain`
   * and a semantic `text/html` built from the marked spans, and `Ctrl+X` deletes the
   * same range through the canonical replacement.
   */
  const writeClipboardSlice = useCallback((event: React.ClipboardEvent<HTMLDivElement>): boolean => {
    const root = rootRef.current;
    if (!root) return false;
    const range = readWriterSurfaceSelection(root) ?? lastRangeRef.current;
    if (!range) return false;
    const slice = serializeWriterSelectionForClipboard(paragraphsRef.current, range);
    if (!slice) return false;
    const clipboard = event.clipboardData;
    if (clipboard) {
      clipboard.setData('text/plain', slice.text);
      clipboard.setData('text/html', slice.html);
    }
    return true;
  }, []);

  const handleCopy = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    if (isForeignWriterSurfaceTarget(event)) return;
    // Writing the data replaces whatever the browser would have put there.
    if (writeClipboardSlice(event)) event.preventDefault();
  }, [writeClipboardSlice]);

  const handleCut = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    if (isForeignWriterSurfaceTarget(event)) return;
    if (readOnly) {
      onBlockedEditAttempt?.();
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const range = readWriterSurfaceSelection(root) ?? lastRangeRef.current;
    if (!range) return;
    if (!writeClipboardSlice(event)) return;
    event.preventDefault();
    if (writerSurfaceRangeIsCollapsed(range)) return;
    // The model deletes exactly what was just copied.
    onReplaceSelection(range, '');
  }, [onBlockedEditAttempt, onReplaceSelection, readOnly, writeClipboardSlice]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    if (isForeignWriterSurfaceTarget(event)) return;
    if (readOnly) return;
    /**
     * WR-033 — a copied image is imported like a dropped file.
     *
     * The clipboard carries an image as a file, not as text; without this branch the
     * paste silently did nothing and the only way in was the file dialog. The image is
     * anchored at the active paragraph by onInsertImageFile, so the text before and
     * after it stays editable and the caret never disappears behind the picture.
     */
    const pastedFile = Array.from(event.clipboardData?.files ?? [])
      .find((file) => file.type.startsWith('image/'));
    if (pastedFile && onInsertImageFile) {
      event.preventDefault();
      onInsertImageFile(pastedFile);
      return;
    }
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    /**
     * WR-019 — paste like a normal text editor.
     *
     * Clipboard **HTML is never written into the DOM**. It is parsed into semantic
     * blocks of spans (`parseWriterClipboardHtml`) and inserted through the model, so
     * a hostile clipboard cannot smuggle markup or attributes into the surface.
     * `Ctrl+Shift+V` (the `plain` intent) and a clipboard that carries no formatting
     * both take the plain-text path.
     */
    const plainText = clipboard.getData('text/plain');
    const html = plainPasteRef.current ? '' : clipboard.getData('text/html');
    plainPasteRef.current = false;
    const payload = html.trim().length > 0
      ? parseWriterClipboardHtml(html)
      : parseWriterClipboardPlainText(plainText);
    if (payload.length === 0) return;
    event.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const range = readWriterSurfaceSelection(root);
    if (!range) return;

    const carriesFormatting = payload.some((block) => block.spans.some((span) => (
      span.bold || span.italic || span.underline || span.strikethrough
      || span.font_size_pt !== undefined || span.font_family !== undefined
      || span.text_color !== undefined || span.highlight_color !== undefined
    )));
    if (carriesFormatting && onPasteRich) {
      onPasteRich(range, payload);
      return;
    }

    const text = payload
      .map((entry) => entry.spans.map((span) => span.text).join(''))
      .join('\n');
    if (text.length === 0) return;
    onReplaceSelection(range, text);
  }, [onInsertImageFile, onPasteRich, onReplaceSelection, readOnly]);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    composingParagraphRef.current = lastRangeRef.current?.focus.paragraphId ?? null;
  }, []);

  /**
   * The committed composition is taken over and the DOM is wiped.
   *
   * During the composition the browser owned the DOM and may have created text
   * nodes of its own. The text is reconciled once; the fragment is then rebuilt
   * from the model, so nothing the input method wrote stays behind.
   */
  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    const root = rootRef.current;
    if (!root || readOnly) return;
    const context = resolveCaretContext();
    const fallbackParagraphId = composingParagraphRef.current;
    composingParagraphRef.current = null;
    const fallbackIndex = fallbackParagraphId === null
      ? -1
      : paragraphsRef.current.findIndex((item) => item.id === fallbackParagraphId);
    const resolved = context ?? (fallbackIndex >= 0
      ? { paragraphIndex: fallbackIndex, paragraph: paragraphsRef.current[fallbackIndex]! }
      : null);
    if (resolved) {
      const modelText = paragraphModelText(resolved.paragraph);
      const domText = readWriterSurfaceParagraphText(root, resolved.paragraph.id);
      if (domText !== null && domText !== modelText) {
        const reconciliation = reconcileWriterSurfaceInput(resolved.paragraphIndex, modelText, domText);
        if (reconciliation) {
          scheduleCaret(collapsedRange(resolved.paragraph.id, reconciliation.caret), false);
          onParagraphTextChange(resolved.paragraphIndex, reconciliation.afterText, reconciliation.caret);
        }
      }
    }
    hardResync();
  }, [hardResync, onParagraphTextChange, readOnly, resolveCaretContext, scheduleCaret]);

  const contextValue = useMemo<WriterRichTextSurfaceContextValue>(
    () => ({ richTextActive: true, readOnly, projectionEpoch, searchHighlights }),
    [projectionEpoch, readOnly, searchHighlights],
  );

  return (
    <div
      ref={rootRef}
      {...{ [WRITER_SURFACE_ROOT_ATTR]: 'true' }}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-readonly={readOnly ? 'true' : undefined}
      /**
       * WR-047 — the surface states the language of the text it contains.
       *
       * Without it a screen reader pronounces German text with the shell's language (the HTML
       * document says `lang="en"`), so umlauts and German words were read with English
       * phonetics. `lang` on the editable region fixes the pronunciation without touching the
       * shell.
       */
      lang={language}
      tabIndex={0}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={false}
      className={`select-text outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 ${className}`}
      style={style}
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onPaste={handlePaste}
      onCopy={handleCopy}
      onCut={handleCut}
      onDrop={(event) => {
        // A text drop would let the browser write into the paragraph DOM.
        if (isForeignWriterSurfaceTarget(event)) return;
        event.preventDefault();
      }}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onMouseUp={(event) => {
        /**
         * WR-035 — Strg+Klick opens an external link.
         *
         * The run carries the target in data-writer-run-link; a plain click must keep
         * placing the caret (that is what the surface is for), so only the modified
         * click leaves the document.
         */
        if ((event.ctrlKey || event.metaKey) && onOpenExternalUrl) {
          const run = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-writer-run-link]');
          const url = run?.getAttribute('data-writer-run-link') ?? null;
          if (url && /^https?:\/\//iu.test(url)) {
            event.preventDefault();
            onOpenExternalUrl(url);
            return;
          }
        }
        publishSelection();
      }}
      onKeyUp={publishSelection}
      onFocus={publishSelection}
    >
      <WriterRichTextSurfaceContext.Provider value={contextValue}>
        {children}
      </WriterRichTextSurfaceContext.Provider>
    </div>
  );
};
