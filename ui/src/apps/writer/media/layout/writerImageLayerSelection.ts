// STATUS: DIAMANT VGT SUPREME — One Source of Truth for Image Layer Membership
import type { WriterImageBlockData } from '../../../../shared/contracts/workspace';
import type { WriterPaginationFragment } from '../../layout/pagination/writerPagination';
import { isWriterImageFixedToPage } from '../images/operations/writerMediaOperations';
import {
  isWriterImageTextWrapMode,
  resolveWriterImageWrapMode,
  writerImageBelongsToFragment,
} from '../../layout/pagination/media/writerMediaFlowLayout';

/**
 * WR-033 (native M7 re-probe) — the page decided "does this paragraph carry an image?"
 * with its own, **inverted** predicate.
 *
 * `WriterPagePaper` asked `isWriterImageFixedToPage(image)` to decide whether to mount the
 * *terminal* layer — that layer renders exactly the images that are **not** fixed to the
 * page. For every normally imported image the answer is `false`, so `hasTerminalImage` was
 * always `false`: the inline/top-bottom image was never mounted on any page and stayed
 * 100 % invisible until its anchor paragraph was deleted and the unanchored fallback kicked
 * in. Nothing threw, nothing logged; the image simply did not exist.
 *
 * The fix is not a second copy of the layer's filter in the page — two copies drift apart
 * again. The filter lives **here**, once, and the layers and the page both ask it.
 */

/** Text wrap mode that lets text run beside the image (Word's "square/tight/through"). */
function isTextWrapImage(image: WriterImageBlockData): boolean {
  const mode = resolveWriterImageWrapMode(image);
  return isWriterImageTextWrapMode(image) || mode === 'behind-text' || mode === 'in-front-of-text';
}

/**
 * Images drawn by `WriterAnchoredImageLayer`: text-wrap modes, floating over the text.
 *
 * `behind-text` / `in-front-of-text` deliberately belong here as well — the layer used to
 * accept them, so a page-level predicate that omitted them would blank those images.
 */
export function isWriterImageInAnchoredLayer(image: WriterImageBlockData): boolean {
  if (isWriterImageFixedToPage(image)) return false;
  return isTextWrapImage(image);
}

/**
 * Images drawn by `WriterTerminalImageLayer`: inline / top-and-bottom blocks that stand as
 * their own block between paragraphs.
 */
export function isWriterImageInTerminalLayer(image: WriterImageBlockData): boolean {
  if (isWriterImageFixedToPage(image)) return false;
  return !isTextWrapImage(image);
}

/** Anchored-layer subset for one paragraph fragment (character anchors respect fragments). */
export function writerAnchoredLayerImages(
  images: readonly WriterImageBlockData[],
  paragraphId: string,
  fragment: WriterPaginationFragment,
): WriterImageBlockData[] {
  return images.filter((image) => (
    image.anchorParagraphId === paragraphId
    && isWriterImageInAnchoredLayer(image)
    && writerImageBelongsToFragment(image, fragment)
  ));
}

/** Terminal-layer subset for one paragraph (rendered once, with the paragraph's last fragment). */
export function writerTerminalLayerImages(
  images: readonly WriterImageBlockData[],
  paragraphId: string,
): WriterImageBlockData[] {
  return images.filter((image) => image.anchorParagraphId === paragraphId && isWriterImageInTerminalLayer(image));
}

/** Cheap boolean form for the page, so the islands around a paragraph stay conditional. */
export function hasWriterImageInAnchoredLayer(
  images: readonly WriterImageBlockData[],
  paragraphId: string,
  fragment: WriterPaginationFragment,
): boolean {
  return images.some((image) => (
    image.anchorParagraphId === paragraphId
    && isWriterImageInAnchoredLayer(image)
    && writerImageBelongsToFragment(image, fragment)
  ));
}

export function hasWriterImageInTerminalLayer(
  images: readonly WriterImageBlockData[],
  paragraphId: string,
): boolean {
  return images.some((image) => image.anchorParagraphId === paragraphId && isWriterImageInTerminalLayer(image));
}
