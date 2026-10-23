// STATUS: PLATIN — Rich clipboard insertion at a marked range
//
// ASTRAEA WRITER 50 V2 · M4 (WR-019).
//
// The surface already owns one canonical replacement path for *text*
// (`replaceWriterSelection`). Pasting rich text needs the same shape, but the middle
// of the result is a list of spans instead of one string — and it must be inserted
// through the model, never by handing HTML to the DOM.
//
// This module is that one operation. It keeps the head of the first covered
// paragraph and the tail of the last one verbatim (including their character
// formatting), so pasting into the middle of a sentence behaves like every other
// replacement in the editor.
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';
import { writerParagraphTextLength } from '../caret/writerCaretTargeting';
import { normalizeWriterSpans, sliceWriterSpans } from '../paragraphs/writerParagraphStructure';
import type { WriterSelectionRange } from '../selection/writerSelectionRange';
import { resolveWriterSelection } from '../selection/writerSelectionRange';

/** The subset of `TextSpan` a paste may carry; everything else is dropped. */
const PASTED_SPAN_KEYS: ReadonlyArray<Exclude<keyof TextSpan, 'text'>> = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'subscript',
  'superscript',
  'font_family',
  'font_size_pt',
  'text_color',
  'highlight_color',
  'background_color',
];

/**
 * Sanitises one pasted span.
 *
 * A clipboard is untrusted input. Only formatting properties the editor itself
 * renders survive; link targets, character-style ids and language tags from a
 * foreign document are discarded rather than silently adopted.
 */
export function sanitizeWriterPastedSpan(span: TextSpan): TextSpan {
  const clean: Record<string, unknown> = { text: span.text };
  for (const key of PASTED_SPAN_KEYS) {
    const value = span[key];
    if (value === undefined) continue;
    if (typeof value === 'boolean' && !value) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    clean[key] = value;
  }
  return clean as unknown as TextSpan;
}

export interface WriterPastedInsertionInput {
  readonly paragraphs: readonly Paragraph[];
  readonly range: WriterSelectionRange;
  /** Pasted blocks in order; the first one continues the head of the first paragraph. */
  readonly blocks: readonly { readonly spans: readonly TextSpan[] }[];
  /** Ids for the paragraphs the paste opens (`blocks.length - 1` of them). */
  readonly newParagraphIds: readonly string[];
}

export interface WriterPastedInsertion {
  readonly paragraphs: Paragraph[];
  readonly caret: { readonly paragraphId: string; readonly offset: number };
  /** Paragraph ids that the replacement removed. */
  readonly removedParagraphIds: readonly string[];
}

function blockSpans(block: { readonly spans: readonly TextSpan[] } | undefined): TextSpan[] {
  if (!block) return [];
  return normalizeWriterSpans(block.spans.filter((span) => span.text.length > 0).map(sanitizeWriterPastedSpan));
}

/**
 * Inserts `blocks` at `range`.
 *
 * Returns `null` when the range no longer addresses the document — a stale range
 * must not silently rewrite text somewhere else.
 */
export function insertWriterClipboardAtRange(
  input: WriterPastedInsertionInput,
): WriterPastedInsertion | null {
  const { paragraphs, range, blocks } = input;
  const resolved = resolveWriterSelection(paragraphs, range);
  if (!resolved) return null;

  const first = paragraphs[resolved.startParagraphIndex];
  const last = paragraphs[resolved.endParagraphIndex];
  if (!first || !last) return null;

  const firstLength = writerParagraphTextLength(first);
  const lastLength = writerParagraphTextLength(last);
  const startOffset = Math.max(0, Math.min(resolved.startOffset, firstLength));
  const endOffset = Math.max(0, Math.min(resolved.endOffset, lastLength));
  const sameParagraph = resolved.startParagraphIndex === resolved.endParagraphIndex;

  const head = sliceWriterSpans(first.spans, 0, startOffset).filter((span) => span.text.length > 0);
  const tailSpans = sameParagraph
    ? sliceWriterSpans(first.spans, endOffset, firstLength)
    : sliceWriterSpans(last.spans, endOffset, lastLength);
  const tail = tailSpans.filter((span) => span.text.length > 0);

  const pasted = blocks.length > 0 ? blocks : [{ spans: [] as readonly TextSpan[] }];
  const firstBlock = blockSpans(pasted[0]);
  const restBlocks = pasted.slice(1);

  if (restBlocks.length === 0) {
    const merged: Paragraph = {
      ...first,
      spans: normalizeWriterSpans([...head, ...firstBlock, ...tail]),
    };
    return {
      paragraphs: [
        ...paragraphs.slice(0, resolved.startParagraphIndex),
        merged,
        ...paragraphs.slice(resolved.endParagraphIndex + 1),
      ],
      caret: { paragraphId: merged.id, offset: startOffset + firstBlock.reduce((total, span) => total + span.text.length, 0) },
      removedParagraphIds: sameParagraph
        ? []
        : paragraphs
          .slice(resolved.startParagraphIndex + 1, resolved.endParagraphIndex + 1)
          .map((paragraph) => paragraph.id),
    };
  }

  const headParagraph: Paragraph = {
    ...first,
    spans: normalizeWriterSpans([...head, ...firstBlock]),
  };
  const opened: Paragraph[] = restBlocks.map((block, position) => ({
    id: input.newParagraphIds[position] ?? `${first.id}-paste-${position + 1}`,
    style: { ...last.style },
    spans: normalizeWriterSpans(blockSpans(block)),
  }));
  const tailParagraph = opened[opened.length - 1];
  if (!tailParagraph) return null;
  tailParagraph.spans = normalizeWriterSpans([...tailParagraph.spans.filter((span) => span.text.length > 0), ...tail]);

  const caretOffset = restBlocks.length > 0
    ? (restBlocks[restBlocks.length - 1]?.spans ?? [])
      .reduce((total, span) => total + span.text.length, 0)
    : 0;

  return {
    paragraphs: [
      ...paragraphs.slice(0, resolved.startParagraphIndex),
      headParagraph,
      ...opened,
      ...paragraphs.slice(resolved.endParagraphIndex + 1),
    ],
    caret: { paragraphId: tailParagraph.id, offset: caretOffset },
    removedParagraphIds: sameParagraph
      ? []
      : paragraphs
        .slice(resolved.startParagraphIndex + 1, resolved.endParagraphIndex + 1)
        .map((paragraph) => paragraph.id),
  };
}
