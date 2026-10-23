// STATUS: DIAMANT VGT SUPREME — Deterministic Writer Image Wrap & Flow-Anchor Geometry
import type { WriterImageBlockData, WriterTextWrapMode } from '../../../../../shared/contracts/workspace';
import type { WriterTextLineRange } from '../../text-layout/writerTextLayout';
import { CSS_PIXELS_PER_MM } from '../geometry/writerPaginationGeometry';
import { isWriterImageFixedToPage } from '../../../media/images/operations/writerMediaRules';
// W-057: the resolution of an absent `wrapMode` lives beside the other image boundary rules and is
// applied on write as well. Re-exported so the layout's existing callers keep one import site.
import { resolveWriterImageWrapMode } from '../../../media/images/operations/writerImageBoundary';
export { resolveWriterImageWrapMode };

export interface WriterImageFlowMetric {
  imageId: string;
  mode: WriterTextWrapMode;
  side: 'left' | 'right';
  startLine: number;
  endLineExclusive: number;
  renderedWidthPx: number;
  renderedHeightPx: number;
  excludedWidthPx: number;
  offsetFromSidePx: number;
  topSpacingPx: number;
  bottomSpacingPx: number;
}

function safePercent(value: number | undefined): number {
  return Math.max(5, Math.min(100, Number.isFinite(value) ? (value ?? 100) : 100));
}

function safeDistanceMm(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? (value ?? fallback) : fallback));
}

export function isWriterImageTextWrapMode(image: WriterImageBlockData): boolean {
  const mode = resolveWriterImageWrapMode(image);
  return mode === 'square' || mode === 'tight' || mode === 'through';
}

export interface WriterImageFlowSelection {
  /** The mode the layout engine actually uses, after the `placement` fallback. */
  readonly mode: WriterTextWrapMode;
  /** True when the image sits in the text column and the text flows around it. */
  readonly wrapped: boolean;
  /** True when the image is on the right of the wrapped text. */
  readonly wrappedRight: boolean;
  /** True when the image stands as its own block without text beside it. */
  readonly inlineBlock: boolean;
}

/**
 * The flow state of an image, resolved the same way the layout resolves it.
 *
 * The quick toolbar used to compare the raw `image.wrapMode` field, which is
 * optional: the import path does not set it, so a freshly imported image showed
 * **no** active button although the layout had already decided it is an inline
 * block. Everything that displays or highlights a flow mode must ask here.
 */
export function resolveWriterImageFlowSelection(image: WriterImageBlockData): WriterImageFlowSelection {
  const mode = resolveWriterImageWrapMode(image);
  const wrapped = mode === 'square' || mode === 'tight' || mode === 'through';
  const wrappedRight = image.alignment === 'right' || image.placement === 'float-right';
  return {
    mode,
    wrapped,
    wrappedRight: wrapped && wrappedRight,
    inlineBlock: !wrapped,
  };
}

function anchorLineForCharacterOffset(
  image: WriterImageBlockData,
  baselineRanges: readonly WriterTextLineRange[],
): number {
  if (image.anchorTarget !== 'character') return 0;
  const offset = Math.max(0, Math.trunc(image.anchorCharacterOffset ?? 0));
  const match = baselineRanges.findIndex((range) => offset >= range.start && offset <= range.end);
  return match >= 0 ? match : Math.max(0, baselineRanges.length - 1);
}

/**
 * Calculates the conservative line-exclusion geometry used by pagination.
 * Tight/Through use the same alpha-threshold semantics as CSS shape-outside:
 * Tight reserves most of the image width; Through permits text farther into
 * transparent raster regions. This keeps page breaking deterministic without
 * decoding image pixels inside the layout engine.
 */
/**
 * DEF-RE-015: a non-finite layout parameter poisoned the result of every function in this module.
 *
 * `Math.max(1, NaN)` is NaN, `NaN * x` is NaN, and `Math.min(NaN, x)` is NaN — so a single damaged input
 * propagated into five metric fields, into an excluded width and into a residual height.
 *
 * **The document fields were already covered here, with `image.intrinsicWidth || 1`. That works for NaN
 * because NaN is falsy — but not for `Infinity`, and it is not a form anyone wrote deliberately.** This is
 * the deliberate one.
 *
 * The fallback is `1`: the same bound these expressions already impose with `Math.max(1, …)`. A layout with
 * a degenerate width or line height is wrong but finite, which is what matters at a trust boundary.
 */
function safeLayoutPx(value: number, fallback = 1): number {
  return Number.isFinite(value) ? value : fallback;
}

export function resolveWriterImageFlowMetric(
  image: WriterImageBlockData,
  columnWidthPx: number,
  lineHeightPx: number,
  characterWidthPx: number,
  text: string,
  baselineRanges: readonly WriterTextLineRange[],
): WriterImageFlowMetric | null {
  // DEF-RE-015: the three numeric parameters are inputs, not measured values - guard them once, here.
  const columnWidth = safeLayoutPx(columnWidthPx);
  const lineHeight = safeLayoutPx(lineHeightPx);
  const characterWidth = safeLayoutPx(characterWidthPx);
  if (isWriterImageFixedToPage(image) || !isWriterImageTextWrapMode(image)) return null;
  const mode = resolveWriterImageWrapMode(image);
  const widthPercent = safePercent(image.widthPercent);
  const renderedWidthPx = Math.max(1, columnWidth * (widthPercent / 100));
  const intrinsicWidth = Math.max(1, image.intrinsicWidth || 1);
  const intrinsicHeight = Math.max(1, image.intrinsicHeight || 1);
  const renderedHeightPx = Math.max(1, renderedWidthPx * (intrinsicHeight / intrinsicWidth));
  const topSpacingPx = safeDistanceMm(image.wrapDistanceTopMm, 3) * CSS_PIXELS_PER_MM;
  const bottomSpacingPx = safeDistanceMm(image.wrapDistanceBottomMm, 3) * CSS_PIXELS_PER_MM;
  const sideSpacingPx = (
    image.alignment === 'right' || image.placement === 'float-right'
      ? safeDistanceMm(image.wrapDistanceLeftMm, 4)
      : safeDistanceMm(image.wrapDistanceRightMm, 4)
  ) * CSS_PIXELS_PER_MM;
  const contourFactor = mode === 'tight' ? 0.88 : mode === 'through' ? 0.68 : 1;
  const startLine = anchorLineForCharacterOffset(image, baselineRanges);
  const horizontalOffsetPx = Math.max(-columnWidth, Math.min(columnWidth, (image.horizontalOffsetMm ?? 0) * CSS_PIXELS_PER_MM));
  let anchorXFromLeftPx = Math.max(0, horizontalOffsetPx);
  if (image.anchorTarget === 'character') {
    const range = baselineRanges[startLine];
    const rawOffset = Math.max(range?.start ?? 0, Math.min(range?.end ?? text.length, Math.trunc(image.anchorCharacterOffset ?? 0)));
    const visiblePrefix = text.slice(range?.start ?? 0, rawOffset).replace(/[\u00AD\u2060]/gu, '');
    anchorXFromLeftPx = Math.max(0, Math.min(columnWidth, Array.from(visiblePrefix).length * characterWidth + horizontalOffsetPx));
  }
  const side: 'left' | 'right' = image.alignment === 'right' || image.placement === 'float-right' ? 'right' : 'left';
  const offsetFromSidePx = side === 'left'
    ? Math.max(0, anchorXFromLeftPx)
    : Math.max(0, columnWidth - anchorXFromLeftPx - renderedWidthPx);
  const excludedWidthPx = Math.min(
    columnWidth * 0.9,
    offsetFromSidePx + renderedWidthPx * contourFactor + sideSpacingPx,
  );
  const occupiedHeightPx = topSpacingPx + renderedHeightPx + bottomSpacingPx;
  const occupiedLines = Math.max(1, Math.ceil(occupiedHeightPx / Math.max(1, lineHeight)));
  return {
    imageId: image.id,
    mode,
    side,
    startLine,
    endLineExclusive: startLine + occupiedLines,
    renderedWidthPx,
    renderedHeightPx,
    excludedWidthPx,
    offsetFromSidePx,
    topSpacingPx,
    bottomSpacingPx,
  };
}

export function writerImageExcludedWidthForLine(
  lineIndex: number,
  metrics: readonly WriterImageFlowMetric[],
  columnWidthPx: number,
): number {
  // DEF-RE-015: `Math.min(NaN * 0.9, x)` is NaN, so the column width is guarded here too.
  const columnWidth = safeLayoutPx(columnWidthPx);
  const active = metrics.filter((metric) => lineIndex >= metric.startLine && lineIndex < metric.endLineExclusive);
  if (active.length === 0) return 0;
  const left = Math.max(0, ...active.filter((metric) => metric.side === 'left').map((metric) => metric.excludedWidthPx));
  const right = Math.max(0, ...active.filter((metric) => metric.side === 'right').map((metric) => metric.excludedWidthPx));
  return Math.min(columnWidth * 0.9, left + right);
}

export function writerImageResidualFlowHeightPx(
  metrics: readonly WriterImageFlowMetric[],
  wrappedLineCount: number,
  lineHeightPx: number,
): number {
  // DEF-RE-015: `x * NaN` is NaN, and `Math.max(residual, NaN)` is NaN - guard the line height here too.
  const lineHeight = safeLayoutPx(lineHeightPx);
  let residual = 0;
  for (const metric of metrics) {
    const textHeightFromAnchor = Math.max(0, wrappedLineCount - metric.startLine) * lineHeight;
    const imageHeight = metric.topSpacingPx + metric.renderedHeightPx + metric.bottomSpacingPx;
    residual = Math.max(residual, imageHeight - textHeightFromAnchor);
  }
  return Math.max(0, residual);
}

export function writerImageBelongsToFragment(
  image: WriterImageBlockData,
  fragment: { startOffset: number; endOffset: number; isFirst: boolean },
): boolean {
  if (image.anchorTarget !== 'character') return fragment.isFirst;
  const offset = Math.max(0, Math.trunc(image.anchorCharacterOffset ?? 0));
  return offset >= fragment.startOffset && offset <= fragment.endOffset;
}
