// STATUS: PLATIN — Markdown-style list autoformat while typing (WR-031)
//
// ## Why this exists
//
// The plan asks for lists that *arise while writing*: typing `- ` or `* ` at the start
// of a line turns the line into a bullet, `1. ` into a numbered item. Without it a list
// costs a trip to the toolbar — and M7's rule is "Bausteine als zweite Ebene, nicht als
// Schreibpflicht".
//
// ## Two triggers, both pure
//
// 1. **The space behind the marker** (`resolveWriterListAutoformat`). It fires when the
//    user completes the marker, also when text already follows the caret — typing `- `
//    in front of an existing line converts that line instead of doing nothing.
// 2. **Enter at the end of such a line** (`resolveWriterListEnterConversion`). A line
//    that reads `- Wenn das so wäre` becomes a bullet when the user presses `Enter`, and
//    the paragraph the break creates continues the list.
//
// Both only convert an **exact** prefix. A pasted document is never silently turned into
// a list.
import type { Paragraph } from '../../../../shared/contracts/workspace';

export type WriterListAutoformatStyle = 'bullet' | 'number';

export interface WriterListAutoformat {
  readonly listStyle: WriterListAutoformatStyle;
  /** What remains of the line after the marker (everything right of the caret). */
  readonly remainingText: string;
}

const BULLET_MARKERS = ['-', '*', '•'] as const;

/** The marker the text starts with, or `null`. */
export function readWriterListPrefix(text: string): { style: WriterListAutoformatStyle; marker: string } | null {
  const match = /^([-*•]|1[.)])([ \u00A0])/u.exec(text);
  if (!match) return null;
  const marker = match[1]!;
  const style: WriterListAutoformatStyle = (BULLET_MARKERS as readonly string[]).includes(marker) ? 'bullet' : 'number';
  return { style, marker };
}

/**
 * The marker has just been completed with a space.
 *
 * `previousText` is the line before the keystroke and `nextText` after it; `caret` is
 * the position in `nextText`. The conversion is offered when the inserted character is
 * exactly the space behind a marker at the **start** of the line — regardless of what
 * follows the caret.
 */
export function resolveWriterListAutoformat(
  previousText: string,
  nextText: string,
  caret: number,
  currentStyle?: Paragraph['style'],
): WriterListAutoformat | null {
  // Already a list item: a second marker is text, not a conversion.
  if (currentStyle?.list_style) return null;
  const prefix = readWriterListPrefix(nextText);
  if (!prefix) return null;
  const markerEnd = prefix.marker.length + 1;
  // The caret must sit behind the space that was just typed …
  if (caret < markerEnd) return null;
  /**
   * … and removing exactly that space must reproduce the previous line.
   *
   * This is what keeps the conversion to the **keystroke** that completes the marker:
   * text may follow the caret (a line converted in front of existing words), but the
   * edit itself has to be the one space.
   */
  const withoutSpace = nextText.slice(0, prefix.marker.length) + nextText.slice(markerEnd);
  if (previousText !== withoutSpace) return null;
  return { listStyle: prefix.style, remainingText: nextText.slice(markerEnd) };
}

/**
 * `Enter` at the end of a plain line that reads like a list item.
 *
 * Returns what the paragraph should keep as text (the part after the marker). The
 * caller turns the paragraph and the one the break creates into list items.
 */
export function resolveWriterListEnterConversion(
  text: string,
  currentStyle?: Paragraph['style'],
): WriterListAutoformat | null {
  if (currentStyle?.list_style) return null;
  const prefix = readWriterListPrefix(text);
  if (!prefix) return null;
  const remainingText = text.slice(prefix.marker.length + 1);
  // An empty marker is not a list item — it is a line that starts with a dash.
  if (remainingText.trim().length === 0) return null;
  return { listStyle: prefix.style, remainingText };
}
