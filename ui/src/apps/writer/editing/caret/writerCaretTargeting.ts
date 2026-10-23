// STATUS: DIAMANT VGT SUPREME — Deterministic caret targeting for Writer page interactions
import type { Paragraph } from '../../../../shared/contracts/workspace';

/**
 * A resolved, serializable caret placement decision. It is produced by pure
 * functions only, so the editor, the page renderer and the automated tests all
 * agree on where a click or a keyboard command must place the caret.
 */
export interface WriterCaretTarget {
  readonly kind: 'focus-existing' | 'create-paragraph';
  readonly paragraphId: string | null;
  readonly offset: number;
}

export function writerParagraphText(paragraph: Paragraph): string {
  return paragraph.spans.map((span) => span.text).join('');
}

export function writerParagraphTextLength(paragraph: Paragraph): number {
  return writerParagraphText(paragraph).length;
}

/**
 * Clamps an externally supplied caret offset into the paragraph text range.
 * Non-finite, negative or fractional inputs collapse to a safe integer so a
 * hostile or stale offset can never move the DOM selection out of range.
 */
export function clampWriterCaretOffset(offset: number, textLength: number): number {
  const limit = Number.isFinite(textLength) ? Math.max(0, Math.trunc(textLength)) : 0;
  if (!Number.isFinite(offset)) return 0;
  const truncated = Math.trunc(offset);
  if (truncated <= 0) return 0;
  return Math.min(truncated, limit);
}

/**
 * Target for "click below the last text line": the end of the last paragraph,
 * or a fresh first paragraph when the document carries no paragraph at all.
 */
export function resolveWriterEndOfDocumentTarget(paragraphs: readonly Paragraph[]): WriterCaretTarget {
  const last = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : undefined;
  if (!last) return { kind: 'create-paragraph', paragraphId: null, offset: 0 };
  return { kind: 'focus-existing', paragraphId: last.id, offset: writerParagraphTextLength(last) };
}

/** Everything the page renderer knows about a click on empty paper area. */
export interface WriterPageClickInput {
  readonly paragraphs: readonly Paragraph[];
  /**
   * Paragraphs actually rendered on the clicked page, in document order. A
   * paragraph that is split across pages appears on every page it reaches.
   */
  readonly pageParagraphIds: readonly string[];
  /** Paragraph whose top edge sits closest above the pointer, or `null`. */
  readonly nearestParagraphId: string | null;
  /**
   * M2 · WR-006: the measured geometry of the same click.
   *
   * Present when the page could measure itself; a caller that only needs the
   * legacy "which paragraph is nearest" decision may omit it, and the resolver
   * then falls back to `resolveWriterPageClickTarget`.
   */
  readonly direct?: WriterDirectCaretInput;
}

/**
 * Target for a click on empty paper area.
 *
 * Resolution order matters for multi-page documents:
 *
 * 1. an empty document always requests the creation of the first paragraph;
 * 2. a paragraph above the pointer receives the caret at the end of its text —
 *    this is the "continue writing below the last line" case;
 * 3. otherwise the caret goes to the start of the first paragraph *on the
 *    clicked page*, never to the start of the document;
 * 4. a page that renders no paragraph at all sits after the document text, so
 *    the caret continues at the end of the document.
 *
 * Step 3 and 4 used to collapse into "jump to `paragraphs[0]`", which sent a
 * click on page 3 back to the first paragraph of page 1.
 */
export function resolveWriterPageClickTarget(input: WriterPageClickInput): WriterCaretTarget {
  const { paragraphs, pageParagraphIds, nearestParagraphId } = input;
  if (paragraphs.length === 0) return { kind: 'create-paragraph', paragraphId: null, offset: 0 };

  const nearest = nearestParagraphId === null
    ? undefined
    : paragraphs.find((paragraph) => paragraph.id === nearestParagraphId);
  if (nearest) {
    return { kind: 'focus-existing', paragraphId: nearest.id, offset: writerParagraphTextLength(nearest) };
  }

  const firstOnPage = pageParagraphIds
    .map((id) => paragraphs.find((paragraph) => paragraph.id === id))
    .find((paragraph): paragraph is Paragraph => paragraph !== undefined);
  if (firstOnPage) return { kind: 'focus-existing', paragraphId: firstOnPage.id, offset: 0 };

  return resolveWriterEndOfDocumentTarget(paragraphs);
}

/* ------------------------------------------------------------------------- *
 * M2 · WR-006 … WR-010 — the direct cursor
 *
 * The resolver below is the *geometry* half of "click into the free writing area
 * and the caret appears on the next allowed line". It is pure: the page paper
 * measures, this decides, `useWriterState` mutates. Nothing here reads the DOM,
 * and nothing here can change the horizontal alignment — that is WR-008's job and
 * it is expressed as an explicit `intent`.
 * ------------------------------------------------------------------------- */

/** What the pointer asked for. A single click never aligns (WR-008). */
export type WriterDirectCaretIntent = 'normal' | 'direct-align';

/** A paragraph as the page actually rendered it, in viewport pixels. */
export interface WriterMeasuredParagraphBox {
  readonly paragraphId: string;
  /** Index in the document, so "insert after" is unambiguous. */
  readonly index: number;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** Effective line height of this paragraph, in the same (scaled) pixels. */
  readonly lineHeightPx: number;
  /** Rendered `margin-bottom`, to model margin collapsing. */
  readonly marginBottomPx: number;
  readonly textLength: number;
  /**
   * True when this paragraph's block also renders an image, a media object or a shape.
   *
   * The measured box is the whole flow-item block, so `bottom` includes the media. Without
   * this flag the "empty paragraph absorbs the click" rule below recycled an empty anchor
   * paragraph and put the caret **above** its image — the layer underneath became unusable.
   *
   * The page derives it from the **model** (an image, a media object or a shape whose
   * `anchorParagraphId` is this paragraph) *and* from the DOM, because the layer that draws
   * the picture is free to change without the click rule changing with it.
   */
  readonly hasMedia?: boolean;
}

/**
 * Everything the resolver needs to place a direct caret.
 *
 * All pixel values are **viewport** pixels, i.e. exactly what
 * `getBoundingClientRect()` returns — including the zoom scale the page container
 * applies. `pxToPt` divides by `zoom` again, so a click at 125 % lands on the same
 * model offset as at 100 %.
 */
export interface WriterDirectCaretInput {
  readonly measured: readonly WriterMeasuredParagraphBox[];
  readonly pointer: { readonly x: number; readonly y: number };
  /** The writable box of the clicked column, in viewport pixels. */
  readonly column: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
  };
  readonly columnIndex: number;
  readonly pageIndex: number;
  /** Zoom in percent (100 = 1:1); used for the pixel → point conversion. */
  readonly zoom: number;
  /** Fallback when a paragraph has no measurable line height. */
  readonly defaultLineHeightPx: number;
  /** Total number of paragraphs in the document. */
  readonly paragraphCount: number;
  readonly intent: WriterDirectCaretIntent;
}

/**
 * Where the direct cursor goes.
 *
 * `spaceBeforePt` is a **semantic** vertical distance in typographic points
 * (WR-007): it becomes the paragraph's `space_before`, so the gap is part of the
 * flow, pushes later content down instead of overlapping it, and survives
 * save/reopen. It never becomes empty paragraphs or absolute CSS positions.
 */
export type WriterDirectCaretTarget =
  | {
      readonly kind: 'focus-existing';
      readonly paragraphId: string;
      readonly offset: number;
      /** 0-based line inside the paragraph that the pointer pointed at. */
      readonly lineIndex: number;
    }
  | {
      readonly kind: 'create-paragraph';
      /** Insert after this document index; `paragraphCount - 1` appends. */
      readonly afterIndex: number;
      readonly alignment: WriterDirectAlignment;
      readonly spaceBeforePt: number;
      /** 0-based line below the last paragraph that the pointer pointed at. */
      readonly lineIndex: number;
    };

/** The three alignments a *double* click can choose (WR-008). */
export type WriterDirectAlignment = 'left' | 'center' | 'right';

/** Below this distance the pointer is treated as being on the last line. */
const POINTER_FUZZ_PX = 2;

/**
 * Is the pointer inside the **media area** of this block (below its first text line)?
 *
 * A paragraph that carries a picture measures as one box: the text line on top, the
 * picture underneath. Anything below the first line is therefore not "the paragraph
 * text" but the picture's band — a click there has to create the follow-up paragraph,
 * never place the caret in the text above the picture. Shared by the resolver and by
 * the page's hit test so both agree on where that band starts.
 */
export function isWriterMediaBand(
  box: Pick<WriterMeasuredParagraphBox, 'hasMedia' | 'top' | 'bottom' | 'lineHeightPx'>,
  pointerY: number,
): boolean {
  if (!box.hasMedia) return false;
  if (!Number.isFinite(pointerY) || !Number.isFinite(box.top)) return false;
  const lineHeight = Math.max(1, Number.isFinite(box.lineHeightPx) ? box.lineHeightPx : 18);
  const bandStart = box.top + Math.max(lineHeight, 24);
  const bandEnd = Number.isFinite(box.bottom) ? box.bottom + POINTER_FUZZ_PX : Number.POSITIVE_INFINITY;
  return pointerY > bandStart && pointerY <= bandEnd;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Points per pixel at the current zoom. 96 CSS px = 72 pt. */
export function writerCaretPxToPt(px: number, zoom: number): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom / 100 : 1;
  return (finiteOr(px, 0) / safeZoom) * (72 / 96);
}

/**
 * The X zone → alignment mapping of WR-008.
 *
 * Only a deliberate **double** click may use it. `35 %` and `65 %` are the plan's
 * boundaries; the result is expressed in model terms (`left|center|right`), never
 * as a pixel coordinate.
 */
export function resolveWriterDirectAlignment(xRatio: number): WriterDirectAlignment {
  const ratio = Math.max(0, Math.min(1, finiteOr(xRatio, 0)));
  if (ratio < 0.35) return 'left';
  if (ratio < 0.65) return 'center';
  return 'right';
}

/** X position inside the column as a 0..1 ratio, clamped and NaN-safe. */
export function resolveWriterColumnXRatio(
  column: { readonly left: number; readonly right: number },
  pointerX: number,
): number {
  const width = finiteOr(column.right, 0) - finiteOr(column.left, 0);
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.max(0, Math.min(1, (finiteOr(pointerX, 0) - column.left) / width));
}

/**
 * The direct-cursor decision.
 *
 * Order (WR-006/WR-009):
 *
 * 1. pointer above every paragraph on this page → the first paragraph, offset 0;
 * 2. pointer inside a paragraph's vertical band → that paragraph, on the line the
 *    pointer points at (the browser's character hit test owns clicks *on text*;
 *    this branch covers the gaps a paginated block leaves open);
 * 3. pointer above the closer of two neighbouring paragraphs → the following one,
 *    offset 0; otherwise the previous one, at its end;
 * 4. pointer below the last paragraph → **create** one, snapped to the next line
 *    grid, with the vertical distance stored as `space_before`.
 *
 * A target that cannot be resolved at all (`-1` paragraph, no column) yields the
 * end of the document instead of a silent jump to page 1.
 */
export function resolveWriterDirectCaretTarget(input: WriterDirectCaretInput): WriterDirectCaretTarget {
  const boxes = [...input.measured]
    .filter((box) => box.paragraphId.length > 0 && Number.isFinite(box.top) && Number.isFinite(box.bottom))
    .sort((left, right) => left.top - right.top);
  const pointerY = finiteOr(input.pointer.y, finiteOr(input.column.top, 0));
  const lineHeightPx = Math.max(1, finiteOr(input.defaultLineHeightPx, 18));
  const zoom = finiteOr(input.zoom, 100);
  const alignment: WriterDirectAlignment = input.intent === 'direct-align'
    ? resolveWriterDirectAlignment(resolveWriterColumnXRatio(input.column, input.pointer.x))
    : 'left';
  const columnBottom = Number.isFinite(input.column.bottom) ? input.column.bottom : pointerY + lineHeightPx;

  const lineIndexBelow = (anchorBottom: number, heightPx: number): number => {
    const raw = Math.floor((pointerY - anchorBottom) / Math.max(1, heightPx));
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  };

  const createAfter = (last: WriterMeasuredParagraphBox | null): WriterDirectCaretTarget => {
    /**
     * WR-SHELL-02 / WR-006 (native M7 probe, round 3) — **no ghost paragraphs under an image.**
     *
     * Clicking into the free area below the text created a paragraph with `space_before`. When
     * that paragraph stayed empty, the very next click below it created *another* one, because
     * an 18-px empty paragraph is not a hit target for a pointer 100 px lower. Three clicks
     * produced four mostly-empty pages. An empty last paragraph is already the writing position
     * the user is aiming at: the caret goes **into it** instead of stacking a second one.
     *
     * This also covers the common "image at the end of the document" case: the image is rendered
     * inside its paragraph's block, the block is measured with the image (`anchorBottom` already
     * includes it), the paragraph text is empty, and a click below the picture now lands in that
     * paragraph instead of generating a page break.
     *
     * **But not when the paragraph carries media.** `WriterParagraphItem` (the text) is rendered
     * *above* `WriterTerminalImageLayer` (the picture). Absorbing the click into the empty anchor
     * paragraph therefore placed the caret on line 0 — above the image — and no follow-up
     * paragraph was ever created, so the area below a picture was unusable. An empty paragraph
     * **with** media must hand the click to `createAfter`, which inserts the follow-up paragraph
     * below the block with `space_before: 0` inside the line-grid distance.
     */
    if (last && last.textLength === 0 && !last.hasMedia) {
      return { kind: 'focus-existing', paragraphId: last.paragraphId, offset: 0, lineIndex: 0 };
    }
    const afterIndex = last ? last.index : input.paragraphCount - 1;
    const anchorBottom = last ? last.bottom : finiteOr(input.column.top, pointerY);
    const boxLineHeight = Math.max(1, finiteOr(last?.lineHeightPx ?? 0, lineHeightPx));
    const previousAfterPx = Math.max(0, finiteOr(last?.marginBottomPx ?? 0, 0));
    const lineIndex = lineIndexBelow(anchorBottom, boxLineHeight);
    // Snap to the line grid, but never past the last line that still fits.
    const snappedTop = Math.min(
      anchorBottom + lineIndex * boxLineHeight,
      Math.max(anchorBottom, columnBottom - boxLineHeight),
    );
    const neededGapPx = Math.max(0, snappedTop - anchorBottom);
    /**
     * WR-006/WR-007 (native M7 re-probe) — **two hard bounds on the artificial gap.**
     *
     * A click in the free area below the text used to store `space_before` for *every* pixel
     * between the last line and the pointer, bounded only by the page's remaining height. The
     * resulting paragraph was taller than the space left, the paginator pushed it to the next
     * page, and the huge gap travelled with it: page 1 ended at 40–50 % white while the caret sat
     * hundreds of points below the click on page 2.
     *
     * 1. Within **two line heights** the user clicked "the next line", not "a gap": the paragraph
     *    starts on the line grid without any artificial spacing. Two lines is the distance at
     *    which a click still reads as *this* line.
     * 2. Beyond that, the gap can never exceed the space this page can still give —
     *    `columnBottom - anchorBottom` minus two line heights of safety. A single click therefore
     *    cannot force a page break, and cannot leave the document with a giant empty gap.
     */
    const lineDistancePx = 2 * boxLineHeight;
    /**
     * Native regression (Runde 4) — the safety buffer has to cover **everything** the
     * paginator charges after the caret line.
     *
     * Two line heights were not enough: the new paragraph also carries its `space_after`
     * (typically 6 pt ≈ 8 px) and the page's own reserved flow height, so a gap that looked
     * "exactly fitting" was still ~30 px too tall and the paginator broke the page. Three line
     * heights plus one default paragraph gap keep the click on the page it was made on.
     */
    const safetyBufferPx = 3 * boxLineHeight + 16;
    const availableGapPx = Math.max(0, columnBottom - anchorBottom - safetyBufferPx);
    const requestedGapPx = neededGapPx <= lineDistancePx ? 0 : Math.min(neededGapPx, availableGapPx);
    // Sibling margins collapse to the larger one, so the stored value has to win
    // against the previous paragraph's own `space_after` — otherwise the line would
    // sit lower than the user clicked. A large `space_after` must not smuggle the
    // runaway back in, so the result stays bounded by the page's free space.
    const collapsedGapPx = Math.min(Math.max(requestedGapPx, previousAfterPx), availableGapPx);
    const roundedPt = Math.round(writerCaretPxToPt(collapsedGapPx, zoom) * 10) / 10;
    return {
      kind: 'create-paragraph',
      afterIndex: Math.max(-1, afterIndex),
      alignment,
      spaceBeforePt: Math.max(0, roundedPt),
      lineIndex,
    };
  };

  if (boxes.length === 0) return createAfter(null);

  const first = boxes[0];
  if (!first) return createAfter(null);
  if (pointerY < first.top - POINTER_FUZZ_PX) {
    return { kind: 'focus-existing', paragraphId: first.paragraphId, offset: 0, lineIndex: 0 };
  }

  const insideCandidates = boxes.filter((box) => (
    pointerY >= box.top - POINTER_FUZZ_PX && pointerY <= box.bottom + POINTER_FUZZ_PX
  ));
  /**
   * Native round 6 — a media block **owns** the click inside its own band.
   *
   * `find` used to take the first box in top order. When two blocks overlap vertically —
   * a picture that hangs into a following paragraph's box, or a tall neighbour — the
   * generic box won the hit test, the resolver placed the caret at its text, and the
   * typing landed *above* the picture even though the pointer was far below it.
   */
  const inside = insideCandidates.find((box) => box.hasMedia) ?? insideCandidates[0];
  if (inside) {
    /**
     * A media block's box also spans its picture. A click below the first text line is a click
     * in (or under) the media area, not on the paragraph text — it must create the follow-up
     * paragraph instead of focusing the text above the picture.
     */
    if (isWriterMediaBand(inside, pointerY)) {
      return createAfter(inside);
    }
    const height = Math.max(1, finiteOr(inside.lineHeightPx, lineHeightPx));
    const line = Math.max(0, Math.floor((pointerY - inside.top) / height));
    return {
      kind: 'focus-existing',
      paragraphId: inside.paragraphId,
      // A click on the first line means "start here"; every later line means
      // "continue where this paragraph ends". Character precision for clicks *on*
      // text belongs to the browser's own hit test (WR-014) and never reaches here.
      offset: line === 0 ? 0 : inside.textLength,
      lineIndex: line,
    };
  }

  const above = boxes.filter((box) => box.bottom < pointerY);
  const below = boxes.filter((box) => box.top > pointerY);
  const previous = above[above.length - 1];
  const next = below[0];
  if (previous && next) {
    const distanceUp = pointerY - previous.bottom;
    const distanceDown = next.top - pointerY;
    if (distanceDown < distanceUp) {
      return { kind: 'focus-existing', paragraphId: next.paragraphId, offset: 0, lineIndex: 0 };
    }
    return {
      kind: 'focus-existing',
      paragraphId: previous.paragraphId,
      offset: previous.textLength,
      lineIndex: Math.max(0, Math.floor(distanceUp / Math.max(1, previous.lineHeightPx))),
    };
  }
  if (next) {
    return { kind: 'focus-existing', paragraphId: next.paragraphId, offset: 0, lineIndex: 0 };
  }
  return createAfter(previous ?? null);
}

/**
 * Target for "Delete at the very end of a paragraph": the caret moves to the seam
 * between this paragraph and its successor, which is exactly offset 0 of the next.
 */
export function resolveWriterForwardMergeCaret(
  paragraphs: readonly Paragraph[],
  paragraphIndex: number,
): WriterCaretTarget | null {
  const current = paragraphs[paragraphIndex];
  const next = paragraphs[paragraphIndex + 1];
  if (!current || !next) return null;
  return resolveWriterStructuralCaret(next.id, 0);
}

/**
 * Target after a structural paragraph change (merge or split). The receiving
 * paragraph is focused with the caret inside the merged/split text.
 */
export function resolveWriterStructuralCaret(
  targetParagraphId: string,
  offset: number,
): WriterCaretTarget {
  return { kind: 'focus-existing', paragraphId: targetParagraphId, offset: Math.max(0, Math.trunc(offset)) };
}

/**
 * The slice of a paragraph that one textarea renders. The Writer paginates a
 * long paragraph into one fragment per page it reaches, so a caret offset is
 * only meaningful together with the fragment that owns it.
 */
export interface WriterFragmentRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly isLastFragment: boolean;
}

/**
 * A fragment owns every offset in `[startOffset, endOffset)`. The last fragment
 * additionally owns everything from its start onwards, because there is no
 * successor that could take the tail — that is the case where the caret sits at
 * the very end of the paragraph.
 */
export function writerFragmentOwnsCaret(range: WriterFragmentRange, absoluteOffset: number): boolean {
  if (!Number.isFinite(absoluteOffset)) return false;
  const offset = Math.trunc(absoluteOffset);
  if (offset < range.startOffset) return false;
  if (range.isLastFragment) return true;
  return offset < range.endOffset;
}

/**
 * Local caret offset inside the fragment's textarea, or `null` when this
 * fragment does not own the requested position and another fragment must take
 * over. Returning `null` is the signal for a cross-page handover.
 */
export function resolveWriterFragmentLocalCaret(
  range: WriterFragmentRange,
  absoluteOffset: number,
): number | null {
  if (!writerFragmentOwnsCaret(range, absoluteOffset)) return null;
  const offset = Math.trunc(absoluteOffset);
  return Math.max(0, offset - range.startOffset);
}

/**
 * Caret offset for a click that lands on a paragraph row instead of inside its
 * textarea. The paragraph is a single textarea, so the browser's own character
 * hit test is unavailable outside it; the vertical position is projected onto
 * the text instead. A click above the box means "start", below it means "end",
 * inside it is proportional — which is monotone and therefore predictable.
 */
export function resolveWriterRowClickOffset(input: {
  readonly pointerY: number;
  readonly boxTop: number;
  readonly boxHeight: number;
  readonly textLength: number;
}): number {
  const textLength = Number.isFinite(input.textLength) ? Math.max(0, Math.trunc(input.textLength)) : 0;
  const { pointerY, boxTop, boxHeight } = input;
  if (!Number.isFinite(pointerY) || !Number.isFinite(boxTop) || !Number.isFinite(boxHeight)) return 0;
  if (boxHeight <= 0) return pointerY < boxTop ? 0 : textLength;
  if (pointerY <= boxTop) return 0;
  if (pointerY >= boxTop + boxHeight) return textLength;
  const ratio = (pointerY - boxTop) / boxHeight;
  return Math.max(0, Math.min(textLength, Math.round(ratio * textLength)));
}

/** Measured paragraph box, reduced to the values the decision needs. */export interface WriterParagraphAnchorBox {
  readonly paragraphId: string;
  readonly top: number;
  /** Horizontal extent of the box. Omitted by callers that only measure `top`. */
  readonly left?: number;
  readonly right?: number;
}

/**
 * Picks the paragraph whose top edge sits closest above the pointer, so a click
 * into empty paper resolves to the nearest paragraph above it. Returns `null`
 * when the pointer is above every paragraph. The DOM measurement stays in the
 * component; only this decision lives here, which keeps it unit-testable
 * without a layout engine.
 *
 * In a multi-column section, "above the pointer" is not enough: column 1 can
 * reach lower than column 2. When the horizontal extent of the boxes is known,
 * a paragraph that spans the pointer's column wins over a lower box in another
 * column, so the caret lands in the column the user actually clicked.
 */
export function resolveNearestWriterParagraphAnchor(
  anchors: readonly WriterParagraphAnchorBox[],
  pointerTop: number,
  pointerLeft?: number,
): string | null {
  if (!Number.isFinite(pointerTop)) return null;
  const above = anchors.filter((anchor) => (
    anchor.paragraphId.length > 0
    && Number.isFinite(anchor.top)
    && anchor.top <= pointerTop
  ));
  if (above.length === 0) return null;

  const hasColumnGeometry = pointerLeft !== undefined
    && Number.isFinite(pointerLeft)
    && above.some((anchor) => anchor.left !== undefined && anchor.right !== undefined);

  const candidates = hasColumnGeometry
    ? above.filter((anchor) => (
        anchor.left !== undefined
        && anchor.right !== undefined
        && Number.isFinite(anchor.left)
        && Number.isFinite(anchor.right)
        && anchor.left <= pointerLeft!
        && pointerLeft! <= anchor.right
      ))
    : above;

  const pool = candidates.length > 0 ? candidates : above;
  let nearest: string | null = null;
  let nearestTop = Number.NEGATIVE_INFINITY;
  for (const anchor of pool) {
    if (anchor.top > nearestTop) {
      nearestTop = anchor.top;
      nearest = anchor.paragraphId;
    }
  }
  return nearest;
}
