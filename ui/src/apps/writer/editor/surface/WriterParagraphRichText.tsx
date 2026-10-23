// STATUS: PLATIN — Inline-rich run projection of one Writer paragraph fragment
//
// This is the piece the old `textarea` could never be: it renders every model
// `TextSpan` as its own inline run, so `Hallo **Astraea**` really has one bold
// word and not a bold paragraph. It is **not** an editor root — it is a plain
// projection *inside* the one contentEditable surface, which is what keeps a
// mouse selection able to cross paragraphs and pages.
//
// The element carries the model geometry (`paragraph`/`start`/`end`) the adapter
// needs to translate DOM positions back into model offsets.
import React from 'react';
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';
import {
  splitWriterRunHighlightSegments,
  type WriterSearchHighlightRange,
} from '../../productivity/search/writerSearchHighlights';
import { useWriterRichTextSurface } from './WriterRichTextSurface';
import {
  WRITER_SURFACE_EMPTY_BREAK_ATTR,
  WRITER_SURFACE_EMPTY_RUN_ATTR,
  WRITER_SURFACE_FRAGMENT_ATTR,
  WRITER_SURFACE_FRAGMENT_END_ATTR,
  WRITER_SURFACE_FRAGMENT_START_ATTR,
  WRITER_SURFACE_SPAN_ATTR,
  WRITER_SURFACE_SPAN_KEY_ATTR,
  writerSurfaceSpanKey,
} from './writerDomModelAdapter';

/** One inline run of a paragraph, already clipped to the visible fragment. */
export interface WriterRichTextRun {
  /** Index of the span in the paragraph, so a witness can address it. */
  readonly index: number;
  readonly text: string;
  readonly span: TextSpan;
}

/**
 * Clips the paragraph's spans to the offsets one page fragment renders.
 *
 * Empty runs are kept out of the DOM (an empty `<span>` would be an invisible
 * caret trap) but they never carry text anyway, so nothing is lost.
 */
export function resolveWriterRichTextRuns(
  paragraph: Paragraph,
  start: number,
  end: number,
): WriterRichTextRun[] {
  const runs: WriterRichTextRun[] = [];
  let cursor = 0;
  paragraph.spans.forEach((span, index) => {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    const from = Math.max(spanStart, start);
    const to = Math.min(spanEnd, end);
    if (to <= from) return;
    runs.push({ index, text: span.text.slice(from - spanStart, to - spanStart), span });
  });
  return runs;
}

/**
 * Inline style of one run.
 *
 * A run only overrides what it actually carries; everything else is inherited
 * from the paragraph style on the fragment element. That is what makes a heading
 * stay bold while a single word inside it can be made italic without inheriting
 * the paragraph's whole look.
 */
export function writerRichTextRunStyle(span: TextSpan): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (span.bold !== undefined) style.fontWeight = span.bold ? 700 : 400;
  if (span.italic !== undefined) style.fontStyle = span.italic ? 'italic' : 'normal';
  const decorations: string[] = [];
  if (span.underline) decorations.push('underline');
  if (span.strikethrough) decorations.push('line-through');
  if (decorations.length > 0) style.textDecoration = decorations.join(' ');
  if (span.font_family) style.fontFamily = span.font_family;
  if (span.font_size_pt) style.fontSize = `${span.font_size_pt}pt`;
  if (span.text_color) style.color = span.text_color;
  if (span.background_color) style.backgroundColor = span.background_color;
  if (span.highlight_color) style.backgroundColor = span.highlight_color;
  if (span.superscript) {
    style.verticalAlign = 'super';
    style.fontSize = '0.75em';
  }
  if (span.subscript) {
    style.verticalAlign = 'sub';
    style.fontSize = '0.75em';
  }
  return style;
}

/**
 * WR-024 — when the localized hint may appear at all.
 *
 * The plan is explicit: "leere Absätze im normalen Schreibmodus sind einfach leere
 * Zeilen ohne künstlichen Platzhaltertext". A document that consists of exactly one
 * empty paragraph *is* the empty page and may invite the user to write; every other
 * empty line — the second, the third, the one after two `Enter` presses — is just an
 * empty line.
 */
export function showsWriterPlaceholder(
  allParagraphs: readonly Paragraph[] | undefined,
  paragraph: Paragraph,
): boolean {
  if (!allParagraphs || allParagraphs.length !== 1) return false;
  const only = allParagraphs[0];
  if (only !== undefined && only.id !== paragraph.id) return false;
  return paragraph.spans.every((span) => span.text.length === 0);
}

export interface WriterParagraphRichTextProps {
  paragraph: Paragraph;
  /** First model offset this fragment renders. */
  start: number;
  /** Last model offset this fragment renders (exclusive). */
  end: number;
  /** Paragraph-level typography (font, size, alignment, line height, indents). */
  style: React.CSSProperties;
  className?: string;
  /** Marks the paragraph the caret currently sits in, for the quiet focus ring. */
  isActive?: boolean;
  /** Localized, non-persisted hint shown by CSS while the paragraph is empty. */
  placeholder?: string;
  /** Extra non-editable decoration drawn on top of the runs (revisions, notes). */
  decorations?: React.ReactNode;
}

/** Shared empty list: a paragraph without hits must not allocate a new array per render. */
const EMPTY_HIGHLIGHTS: readonly WriterSearchHighlightRange[] = Object.freeze([]);

/**
 * The editable text layer of one paragraph fragment.
 *
 * `whiteSpace: pre-wrap` is load-bearing: a manual line break (`Shift+Enter`) is
 * a real `\n` inside a text node, which keeps model offsets and DOM offsets
 * identical. Rendering it as `<br>` would make every offset behind the break
 * disagree with the model.
 *
 * The empty paragraph deliberately renders **one managed run** containing a single
 * `<br data-writer-empty-break>`. Two reasons, both learned from the real desktop
 * probe:
 *
 * 1. Chromium draws no caret in a block without rendered content, so it inserts a
 *    `<br>` of its own — a node React does not know about, which is the first half
 *    of the "every character appears twice" defect.
 * 2. With a real `<span>` present, the browser's own text insertion (if any) lands
 *    *inside* a managed node and can be reconciled; without it, the browser creates
 *    a bare text node next to React's spans and the two copies diverge forever.
 */
export const WriterParagraphRichText: React.FC<WriterParagraphRichTextProps> = ({
  paragraph,
  start,
  end,
  style,
  className = '',
  isActive = false,
  placeholder,
  decorations,
}) => {
  const runs = resolveWriterRichTextRuns(paragraph, start, end);
  const isEmptyFragment = runs.length === 0;
  const anchorFormat = paragraph.spans[0] ?? { text: '' };
  /**
   * WR-036 — the find bar's hits are drawn **inside** the runs.
   *
   * The ranges are absolute paragraph offsets; each run is clipped to `[start, end)`, so the
   * run's absolute start is the fragment start plus the lengths of the runs before it. The
   * `<mark>` stays inside the run's `<span>`: the DOM→model adapter walks nested text nodes,
   * so the offset mapping and the fragment signature stay identical.
   */
  const surface = useWriterRichTextSurface();
  const highlights: readonly WriterSearchHighlightRange[] =
    surface?.searchHighlights[paragraph.id] ?? EMPTY_HIGHLIGHTS;
  let runCursor = start;
  /**
   * WR-047 — a heading is a heading for assistive technology too.
   *
   * The paragraph style carried `heading_level`, but the rich projection rendered a plain
   * `div`: a screen reader could not jump between chapters, although the outline view and the
   * navigation panel already knew the structure.
   */
  const headingLevel = paragraph.style.heading_level;
  return (
    <div
      // The one addressable node: the adapter maps every DOM position inside it
      // to `{ paragraphId, offset }` using these three values.
      {...{ [WRITER_SURFACE_FRAGMENT_ATTR]: paragraph.id }}
      {...{ [WRITER_SURFACE_FRAGMENT_START_ATTR]: String(start) }}
      {...{ [WRITER_SURFACE_FRAGMENT_END_ATTR]: String(end) }}
      data-writer-paragraph-empty={isEmptyFragment ? 'true' : undefined}
      data-writer-paragraph-active={isActive ? 'true' : undefined}
      data-writer-heading-level={headingLevel}
      role={headingLevel ? 'heading' : undefined}
      aria-level={headingLevel}
      data-writer-placeholder={placeholder}
      className={`relative min-h-[1.35em] whitespace-pre-wrap break-words ${className}`}
      style={style}
    >
      {runs.map((run) => {
        // Absolute start of this run inside the paragraph (the fragment may begin mid-paragraph).
        const runStart = runCursor;
        runCursor += run.text.length;
        const segments = splitWriterRunHighlightSegments(run.text, runStart, highlights);
        return (
        <span
          key={`${paragraph.id}:${run.index}`}
          {...{ [WRITER_SURFACE_SPAN_ATTR]: String(run.index) }}
          {...{ [WRITER_SURFACE_SPAN_KEY_ATTR]: writerSurfaceSpanKey(run.span) }}
          data-writer-run-bold={run.span.bold ? 'true' : undefined}
          data-writer-run-italic={run.span.italic ? 'true' : undefined}
          /**
           * WR-035 — a link must be **visible** as a link.
           *
           * The model carried `span.link`, but the run looked like ordinary text, so a
           * link was invisible in the document and unreachable without selecting it.
           * Underline + link colour are the established signal; the target lives in the
           * tooltip and in a data attribute the surface uses for `Strg+Klick`.
           */
          data-writer-run-link={run.span.link
            ? run.span.link.kind === 'external'
              ? run.span.link.url
              : run.span.link.paragraphId
            : undefined}
          title={run.span.link
            ? run.span.link.kind === 'external'
              ? `${run.span.link.url} — Strg+Klick zum Öffnen`
              : 'Interner Verweis — Strg+Klick zum Springen'
            : undefined}
          style={run.span.link
            ? {
              ...writerRichTextRunStyle(run.span),
              color: run.span.text_color ?? '#60a5fa',
              textDecoration: writerRichTextRunStyle(run.span).textDecoration
                ? `${writerRichTextRunStyle(run.span).textDecoration} underline`
                : 'underline',
              cursor: 'pointer',
            }
            : writerRichTextRunStyle(run.span)}
        >
          {segments.map((segment, segmentIndex) => (
            segment.hit === null
              ? <React.Fragment key={`segment:${segmentIndex}`}>{segment.text}</React.Fragment>
              : (
                <mark
                  key={`segment:${segmentIndex}`}
                  data-writer-search-hit={segment.hit}
                  style={segment.hit === 'current'
                    ? { backgroundColor: 'rgba(245, 158, 11, 0.55)', color: 'inherit', borderRadius: '2px' }
                    : { backgroundColor: 'rgba(250, 204, 21, 0.28)', color: 'inherit', borderRadius: '2px' }}
                >
                  {segment.text}
                </mark>
              )
          ))}
        </span>
        );
      })}
      {isEmptyFragment && (
        <span
          {...{ [WRITER_SURFACE_SPAN_ATTR]: '0' }}
          {...{ [WRITER_SURFACE_SPAN_KEY_ATTR]: writerSurfaceSpanKey(anchorFormat) }}
          {...{ [WRITER_SURFACE_EMPTY_RUN_ATTR]: 'true' }}
          style={writerRichTextRunStyle(anchorFormat)}
        >
          <br {...{ [WRITER_SURFACE_EMPTY_BREAK_ATTR]: 'true' }} />
        </span>
      )}
      {decorations}
    </div>
  );
};
