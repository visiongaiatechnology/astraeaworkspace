// STATUS: DIAMANT VGT SUPREME — Bounded Writer undo/redo history domain
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';

export const WRITER_HISTORY_LIMIT = 100;

/**
 * Names the kind of edit that may be folded into the current history entry.
 *
 * Coalescing without a key is unsafe: an intermediate drag frame would happily
 * overwrite the entry a structural edit just produced, and a typing run would
 * swallow the paragraph break that followed it. The key makes the decision
 * explicit, and a different key always starts a new step.
 */
export type WriterHistoryCoalesceKey = string;

/** `true` is accepted as the generic key for callers that only know "merge". */
export type WriterHistoryCoalesceRequest = WriterHistoryCoalesceKey | boolean;

/**
 * How many whole words are **completed** before `caret`.
 *
 * `"Hallo"` → 1, `"Hallo "` → 1, `"Hallo W"` → 2, `"Hallo Welt "` → 2. The count is the
 * word the user is writing *after* that many, so it changes exactly when a new word
 * begins — which is what turns one typed sentence into one undo step per word.
 */
export function writerCompletedWordCount(textBeforeCaret: string): number {
  const trimmed = textBeforeCaret.replace(/\s+$/u, '');
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/u).length;
}

/**
 * The coalesce key for one keystroke.
 *
 * Two rules, both measured against the M4 native probe:
 *
 * 1. **Per word, not per paragraph.** A single key for the whole paragraph merged an
 *    entire typed sentence into one undo step, so `Strg+Z` deleted the sentence instead
 *    of the last word. The word index in front of the caret changes as soon as a new
 *    word starts (trailing spaces still belong to the word they follow).
 * 2. **Typing and deleting never merge.** A backspace series after a word must be its
 *    own step; folding it into the word that was just typed would make undo restore a
 *    half-deleted word.
 *
 * Returns `null` when the edit is not a single-character typing/deleting step (paste,
 * autocorrect, a replaced selection). Those are their own step, which is what the
 * caller gets by passing no key at all.
 */
export function resolveWriterTypingCoalesceKey(input: {
  readonly paragraphId: string;
  readonly previousText: string;
  readonly nextText: string;
  readonly caret: number;
}): WriterHistoryCoalesceKey | null {
  const { paragraphId, previousText, nextText } = input;
  if (previousText === nextText) return null;
  const caret = Math.max(0, Math.min(Math.trunc(input.caret), nextText.length));
  const lengthDelta = nextText.length - previousText.length;
  // Only a one-character insertion or deletion is a typing step.
  if (Math.abs(lengthDelta) !== 1) return null;
  /**
   * The edit must be exactly at the caret, not somewhere else in the paragraph.
   *
   * The caret is reported in **new** coordinates: after an insertion it sits behind
   * the inserted character, after a deletion it sits on the seam.
   */
  if (lengthDelta === 1) {
    if (caret < 1) return null;
    if (nextText.slice(0, caret - 1) + nextText.slice(caret) !== previousText) return null;
  } else if (nextText.slice(0, caret) + previousText[caret] + nextText.slice(caret) !== previousText) {
    return null;
  }
  const kind = lengthDelta > 0 ? 'typing' : 'deleting';
  const words = writerCompletedWordCount(nextText.slice(0, caret));
  return `${kind}:${paragraphId}:word:${words}`;
}

export interface WriterHistoryState {
  entries: WorkspaceDocument[];
  index: number;
  /**
   * Key of the edit that produced `entries[index]`, or `null` when the entry
   * must not be extended. Reset by every undo/redo, so an edit after stepping
   * through history always branches instead of rewriting a restored snapshot.
   */
  coalesceKey: WriterHistoryCoalesceKey | null;
}

function normalizeCoalesceKey(request: WriterHistoryCoalesceRequest | undefined): WriterHistoryCoalesceKey | null {
  if (request === undefined || request === false) return null;
  if (request === true) return 'generic';
  return request.length > 0 ? request : null;
}

export function createWriterHistory(document: WorkspaceDocument): WriterHistoryState {
  return { entries: [document], index: 0, coalesceKey: null };
}

/**
 * Appends an edit, or folds it into the current entry when the same kind of
 * edit is still running at the tip of the history.
 *
 * Coalescing is deliberately refused in three situations: without a key, when
 * the current entry is not the newest one (the user stepped back in history),
 * and when the running edit has a different key (a structural edit interrupts
 * typing). In all three the edit becomes its own step and the redo branch is
 * dropped, which is what "correct handling after a new branch" means.
 */
export function commitWriterHistory(
  state: WriterHistoryState,
  document: WorkspaceDocument,
  coalesce: WriterHistoryCoalesceRequest = false,
): WriterHistoryState {
  const key = normalizeCoalesceKey(coalesce);
  const isTip = state.index === state.entries.length - 1;
  const canExtend = key !== null
    && isTip
    && state.index > 0
    && state.coalesceKey === key;
  if (canExtend) {
    const entries = [...state.entries];
    entries[state.index] = document;
    return { entries, index: state.index, coalesceKey: key };
  }
  const entries = [...state.entries.slice(0, state.index + 1), document].slice(-WRITER_HISTORY_LIMIT);
  return { entries, index: entries.length - 1, coalesceKey: key };
}

export function replaceWriterHistoryCurrent(
  state: WriterHistoryState,
  document: WorkspaceDocument,
): WriterHistoryState {
  const entries = [...state.entries];
  entries[state.index] = document;
  return { entries, index: state.index, coalesceKey: state.coalesceKey };
}

/**
 * Moves through history. Stepping always ends the running edit, so the next
 * write branches from the restored state instead of extending it.
 */
export function stepWriterHistory(
  state: WriterHistoryState,
  direction: 'undo' | 'redo',
): { state: WriterHistoryState; document?: WorkspaceDocument } {
  const nextIndex = direction === 'undo' ? state.index - 1 : state.index + 1;
  if (nextIndex < 0 || nextIndex >= state.entries.length) return { state };
  return {
    state: { entries: state.entries, index: nextIndex, coalesceKey: null },
    document: state.entries[nextIndex],
  };
}
