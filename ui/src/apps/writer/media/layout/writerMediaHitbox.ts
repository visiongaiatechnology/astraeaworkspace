// STATUS: PLATIN — the one hit-test rule for media blocks on a Writer page.
//
// Native round 6: the page filtered `[contenteditable="false"]` wholesale and asked
// `island.querySelector(marker)` whether the island *contained* a picture. Both halves
// were wrong for the media wrappers: a click on the wrapper itself (the padding around a
// picture, the gap under its toolbar) found no matching *descendant* and was thrown away,
// so the caret stayed in the paragraph above the picture and the caption was typed there.
//
// One rule, used by the page hitbox and by the caret measurement, so a click can never be
// classified differently by the two.

/** Every element that identifies a media block, independent of which layer draws it. */
export const WRITER_MEDIA_MARKER_SELECTOR = [
  '[data-writer-image-id]',
  '[data-writer-media-object]',
  '[data-writer-media-id]',
  '[data-writer-shape-canvas]',
  '[data-writer-shape-anchor]',
].join(', ');

/**
 * Is this element itself a media marker, or does it contain one?
 *
 * The self-check is the part that was missing: the island `<div contenteditable="false">`
 * that wraps a picture may also *be* the marked element.
 */
export function isWriterMediaElement(element: Element | null): boolean {
  if (!element) return false;
  if (typeof element.matches === 'function' && element.matches(WRITER_MEDIA_MARKER_SELECTOR)) return true;
  return element.querySelector(WRITER_MEDIA_MARKER_SELECTOR) !== null;
}

/**
 * Should this click be **ignored** because it landed in a non-editable text island?
 *
 * Footnotes, equations, embeds and tables keep their islands: their text must never create
 * a paragraph. Media islands are the exception — their margins belong to the page, and the
 * caret has to be able to continue below the picture.
 */
export function isWriterTextIsland(element: Element | null): boolean {
  if (!element) return false;
  const island = element.closest('[contenteditable="false"]');
  if (!island) return false;
  return !isWriterMediaElement(island);
}

/** Minimal shape of the document collections that anchor media to a paragraph. */
export interface WriterMediaAnchorCollections {
  readonly images?: readonly { readonly anchorParagraphId?: string | null }[];
  readonly mediaObjects?: readonly { readonly anchorParagraphId?: string | null }[];
  readonly shapes?: readonly { readonly anchorParagraphId?: string | null }[];
}

/**
 * Does the **model** anchor any media to this paragraph?
 *
 * The DOM query is only as good as the layer that renders the object. Deriving the flag
 * from the document means the click rule survives a layer that mounts elsewhere, lazy
 * media, or a picture that is drawn by a different component tomorrow.
 */
export function paragraphCarriesWriterMedia(
  paragraphId: string,
  collections: WriterMediaAnchorCollections,
): boolean {
  if (paragraphId.length === 0) return false;
  const anchored = (items?: readonly { readonly anchorParagraphId?: string | null }[]): boolean => (
    Array.isArray(items) && items.some((item) => item.anchorParagraphId === paragraphId)
  );
  return anchored(collections.images)
    || anchored(collections.mediaObjects)
    || anchored(collections.shapes);
}
