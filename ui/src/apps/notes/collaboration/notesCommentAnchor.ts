// STATUS: DIAMANT VGT SUPREME — anchor a comment to the exact selected passage
//
// AST-0721 acceptance: "Kommentar auf Auswahl erfassen und im Verlauf anzeigen."
// `NoteComment` has no anchor field in the shared contract, and that contract is not mine to change. The
// selection is therefore carried as a bounded Markdown block quote on the first line of the comment body:
// it is visible, greppable, survives every existing serializer, and needs no schema migration.

import type { NoteComment } from '../../../shared/contracts/workspace';

export const NOTE_COMMENT_MAX_SELECTION = 512;
export const NOTE_COMMENT_MAX_BODY = 16_384;
const QUOTE_PREFIX = '> ';

export interface NoteCommentAnchor {
  /** The quoted passage exactly as it was selected, or `null` for a general comment. */
  selection: string | null;
  /** The author's own text, without the quote. */
  body: string;
}

/** Collapses a raw selection into the single bounded line that can be stored in a comment body. */
export function normalizeCommentSelection(selection: string | null | undefined): string | null {
  if (typeof selection !== 'string') return null;
  const collapsed = selection.normalize('NFKC').replace(/\s+/g, ' ').replace(/^>\s*/, '').replace(/[\r\n]+/g, ' ').trim();
  return collapsed ? collapsed.slice(0, NOTE_COMMENT_MAX_SELECTION) : null;
}

/**
 * Builds the stored body for a comment: the quoted selection first, then a blank line, then the author's
 * text. A general comment (no selection) is stored unchanged.
 */
export function buildSelectionCommentBody(selection: string | null | undefined, body: string): NoteCommentAnchor {
  const authorText = String(body ?? '').normalize('NFKC').replace(/\u0000/g, '').trim().slice(0, NOTE_COMMENT_MAX_BODY);
  const anchor = normalizeCommentSelection(selection);
  if (!anchor) return { selection: null, body: authorText };
  if (!authorText) return { selection: anchor, body: `${QUOTE_PREFIX}${anchor}` };
  return { selection: anchor, body: `${QUOTE_PREFIX}${anchor}\n\n${authorText}`.slice(0, NOTE_COMMENT_MAX_BODY) };
}

/** Reads an anchor back out of a stored comment body. Tolerates hand-edited comments. */
export function parseSelectionComment(body: string): NoteCommentAnchor {
  const text = String(body ?? '');
  const multiline = text.match(/^>[ \t]?([^\n]*)(?:\r?\n){1,2}([\s\S]*)$/);
  if (multiline) {
    const selection = normalizeCommentSelection(multiline[1]);
    if (selection) return { selection, body: (multiline[2] ?? '').trim() };
  }
  const singleLine = text.match(/^>[ \t]?([^\n]*)$/);
  if (singleLine) {
    const selection = normalizeCommentSelection(singleLine[1]);
    if (selection) return { selection, body: '' };
  }
  return { selection: null, body: text.trim() };
}

/** A short, non-colour-only label for the collapsed comment list. */
export function describeCommentAnchor(comment: Pick<NoteComment, 'body'>): string | null {
  const anchor = parseSelectionComment(comment.body).selection;
  if (!anchor) return null;
  return anchor.length > 60 ? `“${anchor.slice(0, 57)}…”` : `“${anchor}”`;
}
