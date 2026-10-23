// STATUS: DIAMANT VGT SUPREME — Legacy flow-break marker normalisation
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';

/**
 * Older documents carried a page or column break as **text** inside a span. The
 * current model stores it as a paragraph flag (`page_break_before`,
 * `column_break_before`), and `insertWriterFlowBreak` only ever writes the flag.
 *
 * The marker was still *read* — so such a paragraph did break the page — but it
 * was never removed, which means the marker also showed up as literal text in
 * the paragraph, counted towards its length and travelled into statistics, copy
 * and export. Typing the marker by hand produced an unintended page break.
 *
 * This module is the single place that knows the marker strings: it projects a
 * document onto the canonical representation by moving the break into the flag
 * and removing the text.
 */

export const WRITER_PAGE_BREAK_MARKER = '---PAGEBREAK---';
export const WRITER_COLUMN_BREAK_MARKER = '---COLUMNBREAK---';

const ALL_MARKERS = [WRITER_PAGE_BREAK_MARKER, WRITER_COLUMN_BREAK_MARKER] as const;

export type WriterBreakMarkerKind = 'page' | 'column';

export function hasWriterPageBreakMarker(text: string): boolean {
  return text.includes(WRITER_PAGE_BREAK_MARKER);
}

export function hasWriterColumnBreakMarker(text: string): boolean {
  return text.includes(WRITER_COLUMN_BREAK_MARKER);
}

export function hasWriterBreakMarker(text: string): boolean {
  return ALL_MARKERS.some((marker) => text.includes(marker));
}

/** Removes every break marker from a text value. */
export function stripWriterBreakMarkersFromText(text: string): string {
  let stripped = text;
  for (const marker of ALL_MARKERS) {
    while (stripped.includes(marker)) stripped = stripped.replace(marker, '');
  }
  return stripped;
}

export function writerBreakMarkerKinds(paragraph: Paragraph): WriterBreakMarkerKind[] {
  const kinds: WriterBreakMarkerKind[] = [];
  for (const span of paragraph.spans) {
    if (hasWriterPageBreakMarker(span.text) && !kinds.includes('page')) kinds.push('page');
    if (hasWriterColumnBreakMarker(span.text) && !kinds.includes('column')) kinds.push('column');
  }
  return kinds;
}

export interface WriterBreakMarkerNormalization {
  readonly paragraphs: Paragraph[];
  readonly changedCount: number;
  /**
   * The array that was projected, by reference. A caller that has to decide
   * whether a document is still untouched can compare against this instead of
   * deep-comparing paragraphs. Identical to `paragraphs` when nothing changed.
   */
  readonly source: Paragraph[];
}

/**
 * Moves every text marker into the paragraph flag and removes the marker text.
 * Paragraphs without a marker are returned by reference, so a document that is
 * already canonical produces no change and no write.
 *
 * A page break wins over a column break when a paragraph somehow carries both,
 * because a page break already implies a new column.
 *
 * **Call this at a document boundary, not on every edit.** The projection cannot
 * tell a legacy marker from text a user typed, so running it continuously made
 * typing `---PAGEBREAK---` insert a page break and delete the text.
 */
export function normalizeWriterBreakMarkers(
  paragraphs: Paragraph[],
): WriterBreakMarkerNormalization {
  let changedCount = 0;
  const next = paragraphs.map((paragraph) => {
    const kinds = writerBreakMarkerKinds(paragraph);
    if (kinds.length === 0) return paragraph;
    changedCount += 1;
    const spans: TextSpan[] = paragraph.spans
      .map((span) => (hasWriterBreakMarker(span.text)
        ? { ...span, text: stripWriterBreakMarkersFromText(span.text) }
        : { ...span }))
      .filter((span) => span.text.length > 0);
    return {
      ...paragraph,
      spans: spans.length > 0 ? spans : [{ ...(paragraph.spans[0] ?? { text: '' }), text: '' }],
      style: {
        ...paragraph.style,
        page_break_before: kinds.includes('page') ? true : paragraph.style.page_break_before,
        column_break_before: !kinds.includes('page') && kinds.includes('column')
          ? true
          : paragraph.style.column_break_before,
      },
    };
  });
  // A canonical document keeps its array identity, so "no change" really means no
  // change — including for the callers that compare arrays to decide on a render.
  if (changedCount === 0) return { paragraphs, changedCount, source: paragraphs };
  return { paragraphs: next, changedCount, source: paragraphs };
}

/**
 * The paragraphs to render: the migrated ones **only while the document is
 * untouched**, otherwise the live value.
 *
 * `migration.source` is the array the projection was computed from, so an
 * identical reference means nothing has been written since the document was
 * opened. As soon as a write produces a new array the live value wins — that is
 * what keeps text a user typed from being reinterpreted as a break. Every writer
 * builds on the returned array, so the first real edit persists the canonical
 * form and the marker never comes back.
 */
export function applyWriterBreakMigration(
  live: Paragraph[],
  migration: WriterBreakMarkerNormalization,
): Paragraph[] {
  return live === migration.source ? migration.paragraphs : live;
}
