// STATUS: PLATIN — Copy/Cut serialisation of a model selection (WR-019)
//
// ## Why the editor writes the clipboard itself
//
// A Writer paragraph is rendered as `<span data-writer-run-bold="true"
// style="font-weight:700">`. When the user marks a bold word and presses `Strg+C`,
// Chromium serialises *its* DOM view into `text/html` — a shape no foreign editor
// has to understand, and one the Writer's own parser used to drop on paste. The
// native M4 probe showed the result: copy a bold word, paste it, the word is plain.
//
// The surface therefore writes the clipboard from the **model**: a semantic
// `text/html` fragment (`<strong>`, `<em>`, `<u>`, `<s>`, plus the span key as a
// data attribute for a lossless round trip inside the Writer) and the plain text.
//
// The output is escaped here, never taken from the DOM.
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';
import { sliceWriterSpans } from '../paragraphs/writerParagraphStructure';
import type { WriterSelectionRange } from '../selection/writerSelectionRange';
import { resolveWriterSelection } from '../selection/writerSelectionRange';

export interface WriterClipboardSlice {
  readonly html: string;
  readonly text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The `data-writer-span-key` the surface itself renders, recomputed from the span. */
export function writerSpanFormatKey(span: TextSpan): string {
  return [
    span.bold ? 'b' : '',
    span.italic ? 'i' : '',
    span.underline ? 'u' : '',
    span.strikethrough ? 's' : '',
    span.font_family ?? '',
    span.font_size_pt !== undefined ? String(span.font_size_pt) : '',
    span.text_color ?? '',
  ].join('|');
}

/**
 * One span as semantic HTML.
 *
 * Nesting order is fixed (`s > u > em > strong`) so the same model always produces
 * byte-identical markup — the round-trip test relies on that.
 */
function spanToHtml(span: TextSpan): string {
  const text = escapeHtml(span.text).replace(/\n/g, '<br>');
  if (text.length === 0) return '';
  const key = writerSpanFormatKey(span);
  const attributes = ` data-writer-span-key="${escapeHtml(key)}"`;
  let html = text;
  if (span.strikethrough) html = `<s${attributes}>${html}</s>`;
  if (span.underline) html = `<u${attributes}>${html}</u>`;
  if (span.italic) html = `<em${attributes}>${html}</em>`;
  if (span.bold) html = `<strong${attributes}>${html}</strong>`;
  // Unformatted runs keep the key as well: the Writer can then restore the run even
  // when no semantic tag carries it.
  return html === text ? `<span${attributes}>${text}</span>` : html;
}

/**
 * The clipboard representation of everything `range` covers.
 *
 * Returns `null` when the range does not address the document, or when it covers
 * nothing — an empty clipboard write would wipe whatever the user had copied before.
 */
export function serializeWriterSelectionForClipboard(
  paragraphs: readonly Paragraph[],
  range: WriterSelectionRange,
): WriterClipboardSlice | null {
  const resolved = resolveWriterSelection(paragraphs, range);
  if (!resolved) return null;

  const blocks: string[] = [];
  const texts: string[] = [];
  for (
    let index = resolved.startParagraphIndex;
    index <= resolved.endParagraphIndex;
    index += 1
  ) {
    const paragraph = paragraphs[index];
    if (!paragraph) continue;
    const length = paragraph.spans.reduce((total, span) => total + span.text.length, 0);
    const from = index === resolved.startParagraphIndex ? resolved.startOffset : 0;
    const to = index === resolved.endParagraphIndex ? resolved.endOffset : length;
    const spans = sliceWriterSpans(paragraph.spans, from, to).filter((span) => span.text.length > 0);
    if (spans.length === 0) continue;
    blocks.push(`<p>${spans.map(spanToHtml).join('')}</p>`);
    texts.push(spans.map((span) => span.text).join(''));
  }

  if (blocks.length === 0) return null;
  return { html: blocks.join(''), text: texts.join('\n') };
}
