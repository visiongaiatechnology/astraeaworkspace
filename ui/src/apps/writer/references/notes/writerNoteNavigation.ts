// STATUS: DIAMANT VGT SUPREME — Jump between a note and its reference
//
// Paket 34 acceptance: "Fußnote hinzufügen, **zur Quelle springen**, Nummerierung nach
// Umordnung erhalten." The jump did not exist: the note badge in the text carried
// `cursor-pointer` but no handler, and the note entry at the page bottom was plain
// text. Both directions are implemented here.
//
// The ids are built in one place so the badge, the note entry and the jump agree.
// They match the anchor the find/replace navigation already uses for paragraphs,
// which is what makes the target reachable at all.

export const WRITER_PARAGRAPH_ANCHOR_PREFIX = 'writer-paragraph-';
export const WRITER_NOTE_ANCHOR_PREFIX = 'writer-note-';

/** The prefix a note's anchors carry, by note type. */
function writerNoteAnchorPrefix(note: { readonly noteType?: string }): 'fn' | 'en' {
  return note.noteType === 'endnote' ? 'en' : 'fn';
}

/**
 * The element id of a note's **entry** at the page bottom.
 *
 * One definition for the entry that carries it and the badge that jumps to it. The
 * engine used to build these strings inline, and the badge built none at all — the
 * note's "back to the reference" link pointed at `#fn-ref-<id>`, which no element
 * ever carried, so the jump went nowhere.
 */
export function writerNoteEntryAnchorId(note: { readonly id: string; readonly noteType?: string }): string {
  return `${writerNoteAnchorPrefix(note)}-${note.id}`;
}

/** The element id of a note's **reference badge** in the text. */
export function writerNoteReferenceAnchorId(note: { readonly id: string; readonly noteType?: string }): string {
  return `${writerNoteAnchorPrefix(note)}-ref-${note.id}`;
}

/** The element id of a paragraph. Shared with the existing highlight navigation. */
export function writerParagraphAnchorId(paragraphId: string): string {
  return `${WRITER_PARAGRAPH_ANCHOR_PREFIX}${paragraphId}`;
}

export type WriterNoteJumpDirection = 'to-reference' | 'to-note';

export interface WriterNoteJumpTarget {
  readonly direction: WriterNoteJumpDirection;
  /** The element to bring into view. */
  readonly anchorId: string;
  /** Set for `to-reference`: the paragraph that owns the reference. */
  readonly paragraphId: string;
}

/**
 * Where a jump from this note goes. Pure: the caller decides how to move the view.
 *
 * A note whose reference paragraph is unknown still yields a target — the note entry
 * itself — so a click never silently does nothing.
 */
export function resolveWriterNoteJump(
  note: { readonly id: string; readonly noteType?: string; readonly referenceParagraphId?: string },
  direction: WriterNoteJumpDirection,
): WriterNoteJumpTarget {
  if (direction === 'to-note') {
    return { direction, anchorId: writerNoteEntryAnchorId(note), paragraphId: '' };
  }
  const paragraphId = note.referenceParagraphId ?? '';
  return {
    direction,
    anchorId: paragraphId ? writerParagraphAnchorId(paragraphId) : writerNoteEntryAnchorId(note),
    paragraphId,
  };
}

/**
 * Brings an anchor into view and, for a paragraph, focuses its writing surface.
 *
 * The DOM part is deliberately tiny and separate from the decision above, because
 * this environment has no DOM test runner: the ids and the direction are unit-tested,
 * the three lines that touch `document` are pinned by a source contract.
 */
export function performWriterNoteJump(target: WriterNoteJumpTarget): boolean {
  if (typeof document === 'undefined') return false;
  const element = document.getElementById(target.anchorId);
  if (!element) return false;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (target.direction === 'to-reference') {
    const field = element.querySelector('textarea, [contenteditable="true"]');
    if (field instanceof HTMLElement) field.focus();
    else element.focus?.();
  }
  return true;
}

/** Convenience for the click handlers: resolve and perform in one step. */
export function jumpToWriterNote(
  note: { readonly id: string; readonly noteType?: string; readonly referenceParagraphId?: string },
  direction: WriterNoteJumpDirection,
): boolean {
  return performWriterNoteJump(resolveWriterNoteJump(note, direction));
}
