// STATUS: DIAMANT VGT SUPREME — Where a newly imported image is anchored
import type { Paragraph } from '../../../../../shared/contracts/workspace';

/**
 * WR-033 (native M7 re-probe) — an inserted image must land where the user is.
 *
 * The import anchored at `activeParagraph?.id`, and `activeParagraph` falls back to
 * `paragraphs[0]` whenever the active id is stale. The picture then appeared on page 1
 * while the caret was on page 5 — and because it was rendered nowhere at all (see
 * `writerImageLayerSelection`), the wrong anchor was the only trace of the insert.
 *
 * The anchor is resolved in a fixed order and never invents a paragraph:
 *
 * 1. the paragraph the **caret** is in — it is on screen by definition;
 * 2. the active paragraph, if it still exists and is visible;
 * 3. the **last visible** paragraph of the page the user is looking at;
 * 4. the last paragraph of the document, so the image is appended to the flow;
 * 5. `undefined` for an empty document — the unanchored fallback renders it on page 1.
 */
export interface WriterImageAnchorInput {
  readonly paragraphs: readonly Paragraph[];
  /** `textSelection.paragraphId` — where the caret actually is. */
  readonly caretParagraphId?: string | null;
  /** `activeParagraphId` before any fallback to `paragraphs[0]`. */
  readonly activeParagraphId?: string | null;
  /** Paragraph ids the scroll container currently shows, in document order. */
  readonly visibleParagraphIds?: readonly string[];
}

export function resolveWriterImageAnchorParagraphId(input: WriterImageAnchorInput): string | undefined {
  const existing = new Set(input.paragraphs.map((paragraph) => paragraph.id));
  const visible = (input.visibleParagraphIds ?? []).filter((id) => existing.has(id));
  const caret = input.caretParagraphId && existing.has(input.caretParagraphId) ? input.caretParagraphId : null;
  if (caret) return caret;

  const active = input.activeParagraphId && existing.has(input.activeParagraphId) ? input.activeParagraphId : null;
  if (active && (visible.length === 0 || visible.includes(active))) return active;
  if (visible.length > 0) return visible[visible.length - 1];
  if (active) return active;
  const last = input.paragraphs[input.paragraphs.length - 1];
  return last ? last.id : undefined;
}

/** Marker the Writer puts on its one scrolling container. */
export const WRITER_SCROLL_CONTAINER_SELECTOR = '[data-writer-scroll-container="true"]';

/**
 * Which paragraphs are on screen right now.
 *
 * Measured from the DOM on purpose: the pagination model knows which page a paragraph is
 * on, but not which page the **user** is looking at. Without layout (unit tests, a
 * detached tree) every rectangle is zero; then the measurement is not "nothing is
 * visible" but "nothing can be measured", and the ids are returned unfiltered so the
 * resolver still has an order to work with.
 */
export function readVisibleWriterParagraphIds(
  root: Document | undefined = typeof globalThis.document === 'undefined' ? undefined : globalThis.document,
): string[] {
  if (!root) return [];
  const container = root.querySelector<HTMLElement>(WRITER_SCROLL_CONTAINER_SELECTOR);
  if (!container) return [];
  const containerRect = container.getBoundingClientRect();
  const measurable = containerRect.height > 0;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const element of Array.from(container.querySelectorAll<HTMLElement>('[data-writer-paragraph-anchor]'))) {
    const id = element.getAttribute('data-writer-paragraph-anchor');
    if (!id || seen.has(id)) continue;
    if (measurable) {
      const rect = element.getBoundingClientRect();
      const intersects = rect.bottom > containerRect.top && rect.top < containerRect.bottom;
      if (!intersects) continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
