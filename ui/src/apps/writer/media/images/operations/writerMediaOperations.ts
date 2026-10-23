// STATUS: DIAMANT VGT SUPREME — Sovereign Image & Media Operations Engine
import type {
  WriterImageBlockData,
  WriterMediaAdjustments,
  WriterMediaCrop,
  WriterTextWrapMode,
  WriterFigureIndexItem,
} from '../../../../../shared/contracts/workspace';
import type { WriterPageGeometry } from '../../../layout/pagination/geometry/writerPaginationGeometry';
import type { WriterPaginationPage } from '../../../layout/pagination/writerPaginationTypes';
import { isWriterImageFixedToPage } from './writerMediaRules';
import { resolveWriterImageWrapMode } from './writerImageBoundary';
export { isWriterImageFixedToPage };

export interface ResolvedMediaStyles {
  containerStyle: React.CSSProperties;
  imageStyle: React.CSSProperties;
  wrapperClassName: string;
}

/**
 * Computes non-destructive CSS filter string from adjustment properties.
 */
export function resolveImageFilters(adjustments?: WriterMediaAdjustments): string {
  if (!adjustments) return 'none';
  const filters: string[] = [];

  // DEF-RE-016: `Math.max(0, 100 + NaN)` is NaN, so a damaged adjustment reached the CSS as
  // `brightness(NaN%)`. The guard sits on the value the branch tests, so a non-finite adjustment does not
  // enter the branch at all - and the existing 'none' fallback applies when nothing else is set.
  // Same class as DEF-RE-009, DEF-RE-010, DEF-RE-013, DEF-RE-014 and DEF-RE-015.
  const brightness = Number.isFinite(adjustments.brightness) ? adjustments.brightness : 0;
  const contrast = Number.isFinite(adjustments.contrast) ? adjustments.contrast : 0;
  const saturation = Number.isFinite(adjustments.saturation) ? adjustments.saturation : 0;
  if (brightness !== 0) {
    // -100 to +100 -> 0% to 200%
    const b = 100 + brightness;
    filters.push(`brightness(${Math.max(0, b)}%)`);
  }
  if (contrast !== 0) {
    // -100 to +100 -> 0% to 200%
    const c = 100 + contrast;
    filters.push(`contrast(${Math.max(0, c)}%)`);
  }
  if (saturation !== 0) {
    // -100 to +100 -> 0% to 200%
    const s = 100 + saturation;
    filters.push(`saturate(${Math.max(0, s)}%)`);
  }
  if (adjustments.grayscale) {
    filters.push('grayscale(100%)');
  }
  if (adjustments.sepia) {
    filters.push('sepia(100%)');
  }
  if (adjustments.invert) {
    filters.push('invert(100%)');
  }

  return filters.length > 0 ? filters.join(' ') : 'none';
}

/**
 * Computes CSS transform, clip-path and opacity for image transformations.
 */
export function resolveImageTransforms(
  crop?: WriterMediaCrop,
  rotationDeg = 0,
  flipHorizontal = false,
  flipVertical = false,
  opacity = 1.0,
): { transform: string; clipPath?: string; opacity: number } {
  const transformParts: string[] = [];
  if (rotationDeg !== 0) {
    transformParts.push(`rotate(${rotationDeg}deg)`);
  }
  if (flipHorizontal && flipVertical) {
    transformParts.push('scale(-1, -1)');
  } else if (flipHorizontal) {
    transformParts.push('scaleX(-1)');
  } else if (flipVertical) {
    transformParts.push('scaleY(-1)');
  }

  const transform = transformParts.length > 0 ? transformParts.join(' ') : 'none';

  let clipPath: string | undefined;
  if (crop && (crop.topPercent > 0 || crop.rightPercent > 0 || crop.bottomPercent > 0 || crop.leftPercent > 0)) {
    // DEF-RE-016: `Math.max(0, Math.min(100, NaN))` is NaN, so a damaged crop edge reached the CSS as
    // `inset(NaN% ...)`. Note the earlier `crop.xPercent > 0` test is false for NaN, so a LONE NaN edge is
    // inert by accident - it is the mixed case that reaches this line unguarded.
    const edge = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    const top = edge(crop.topPercent);
    const right = edge(crop.rightPercent);
    const bottom = edge(crop.bottomPercent);
    const left = edge(crop.leftPercent);
    clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  }

  return {
    transform,
    clipPath,
    // DEF-RE-010: `Math.max(0, Math.min(1, NaN))` is NaN - the clamp did not clamp. A non-finite opacity
    // reached CSS as `opacity: NaN`. Same class as DEF-RE-009 (`Math.max(1, NaN)`). The fallback is 1, which
    // matches the parameter default: an image whose opacity is not a number is shown, not hidden.
    opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1,
  };
}

/**
 * Resolves wrap mode and alignment classes for document flow.
 */
export function updateWriterImagePlacement(
  images: readonly WriterImageBlockData[],
  imageId: string,
  patch: Partial<WriterImageBlockData>,
  pages: readonly { pageIndex: number; isFirst: boolean; paragraphs: readonly { id: string }[] }[],
): WriterImageBlockData[] {
  return images.map((image) => image.id === imageId
    ? applyWriterImagePlacementPatch(image, patch, pages)
    : image);
}

export function applyWriterImagePlacementPatch(
  image: WriterImageBlockData,
  patch: Partial<WriterImageBlockData>,
  pages: readonly { pageIndex: number; isFirst: boolean; paragraphs: readonly { id: string }[] }[],
): WriterImageBlockData {
  const next = { ...image, ...patch };
  if (!isWriterImageFixedToPage(next)) return { ...next, anchorPageIndex: undefined };
  if (next.anchorPageIndex !== undefined) return next;
  const anchoredPage = pages.find((candidate) =>
    next.anchorParagraphId
      ? candidate.paragraphs.some((paragraph) => paragraph.id === next.anchorParagraphId)
      : candidate.isFirst,
  );
  return { ...next, anchorPageIndex: anchoredPage?.pageIndex ?? 1 };
}

function safeMm(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(-1000, Math.min(1000, value ?? fallback));
}

function safeWidthPercent(value: number): number {
  return Math.max(5, Math.min(100, Number.isFinite(value) ? value : 100));
}

function isSafeRasterDataUrl(value: string): boolean {
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

/**
 * Resolves the page-relative origin for page/margin/column anchored media.
 * Paragraph/character anchored media deliberately remain in the text flow and
 * are positioned relative to their anchor paragraph by the renderer.
 */
export function resolveWriterImagePageAnchor(
  image: WriterImageBlockData,
  geometry?: WriterPageGeometry,
): { left: string; top: string } | undefined {
  if (!isWriterImageFixedToPage(image)) return undefined;

  const xMm = safeMm(image.horizontalOffsetMm);
  const yMm = safeMm(image.verticalOffsetMm);
  const target = image.anchorTarget ?? 'page';
  if (!geometry || target === 'page') {
    return { left: `${xMm}mm`, top: `${yMm}mm` };
  }

  if (target === 'margin') {
    return {
      left: `calc(${geometry.marginsPx.left}px + ${xMm}mm)`,
      top: `calc(${geometry.marginsPx.top}px + ${yMm}mm)`,
    };
  }

  if (target === 'column') {
    const widths = geometry.columnWidthsPx && geometry.columnWidthsPx.length > 0
      ? geometry.columnWidthsPx
      : Array.from({ length: Math.max(1, geometry.columnCount) }, () => geometry.columnWidthPx);
    const columnIndex = Math.max(0, Math.min(widths.length - 1, Math.trunc((image.anchorColumnIndex ?? 1) - 1)));
    let leftPx = geometry.marginsPx.left;
    for (let index = 0; index < columnIndex; index += 1) {
      leftPx += widths[index] + geometry.columnGapPx;
    }
    return {
      left: `calc(${leftPx}px + ${xMm}mm)`,
      top: `calc(${geometry.marginsPx.top}px + ${yMm}mm)`,
    };
  }

  return { left: `${xMm}mm`, top: `${yMm}mm` };
}

/**
 * Resolves wrap mode and placement styles. Page/margin/column anchored objects
 * are absolute page-layer objects and therefore never consume document flow.
 */
export function resolveMediaWrapStyles(
  image: WriterImageBlockData,
  geometry?: WriterPageGeometry,
): ResolvedMediaStyles {
  // W-057: one resolution for an absent `wrapMode`, shared with the write path.
  const wrapMode: WriterTextWrapMode = resolveWriterImageWrapMode(image);

  const filter = resolveImageFilters(image.adjustments);
  const transforms = resolveImageTransforms(
    image.crop,
    image.rotationDeg,
    image.flipHorizontal,
    image.flipVertical,
    image.opacity,
  );
  const fixedToPage = isWriterImageFixedToPage(image);
  const widthPercent = safeWidthPercent(image.widthPercent);

  const containerStyle: React.CSSProperties = {
    maxWidth: '100%',
    width: `${widthPercent}%`,
  };

  const imageStyle: React.CSSProperties = {
    filter,
    transform: transforms.transform,
    clipPath: transforms.clipPath,
    opacity: transforms.opacity,
    transition: 'filter 0.15s ease, transform 0.15s ease',
  };

  const topMm = Math.max(0, safeMm(image.wrapDistanceTopMm, 3));
  const bottomMm = Math.max(0, safeMm(image.wrapDistanceBottomMm, 3));
  const leftMm = Math.max(0, safeMm(image.wrapDistanceLeftMm, 4));
  const rightMm = Math.max(0, safeMm(image.wrapDistanceRightMm, 4));
  let wrapperClassName = 'group transition-all select-none ';

  if (fixedToPage) {
    const anchor = resolveWriterImagePageAnchor(image, geometry);
    containerStyle.position = 'absolute';
    containerStyle.left = anchor?.left ?? `${safeMm(image.horizontalOffsetMm)}mm`;
    containerStyle.top = anchor?.top ?? `${safeMm(image.verticalOffsetMm)}mm`;
    containerStyle.margin = 0;
    containerStyle.float = 'none';
    containerStyle.clear = 'none';
    containerStyle.zIndex = wrapMode === 'behind-text' ? 1 : 25;
    if (wrapMode === 'behind-text') wrapperClassName += 'opacity-80 ';
    if (wrapMode === 'in-front-of-text') wrapperClassName += 'shadow-xl ';
    return { containerStyle, imageStyle, wrapperClassName: wrapperClassName.trim() };
  }

  switch (wrapMode) {
    case 'square':
    case 'tight':
    case 'through': {
      if (image.alignment === 'right' || image.placement === 'float-right') {
        wrapperClassName += 'float-right ';
        containerStyle.float = 'right';
        containerStyle.marginLeft = `${leftMm}mm`;
      } else {
        wrapperClassName += 'float-left ';
        containerStyle.float = 'left';
        containerStyle.marginRight = `${rightMm}mm`;
      }
      containerStyle.marginBottom = `${bottomMm}mm`;
      containerStyle.marginTop = `${topMm}mm`;
      if ((wrapMode === 'tight' || wrapMode === 'through') && isSafeRasterDataUrl(image.dataUrl)) {
        containerStyle.shapeOutside = `url("${image.dataUrl}")`;
        containerStyle.shapeMargin = `${Math.max(leftMm, rightMm)}mm`;
        containerStyle.shapeImageThreshold = wrapMode === 'through' ? 0.85 : 0.15;
      }
      break;
    }
    case 'top-bottom': {
      wrapperClassName += 'clear-both my-4 ';
      containerStyle.display = 'block';
      containerStyle.clear = 'both';
      if (image.alignment === 'left') wrapperClassName += 'mr-auto ';
      else if (image.alignment === 'right') wrapperClassName += 'ml-auto ';
      else wrapperClassName += 'mx-auto ';
      containerStyle.marginTop = `${topMm}mm`;
      containerStyle.marginBottom = `${bottomMm}mm`;
      break;
    }
    case 'behind-text':
    case 'in-front-of-text': {
      containerStyle.position = 'absolute';
      containerStyle.zIndex = wrapMode === 'behind-text' ? 0 : 20;
      containerStyle.left = `${safeMm(image.horizontalOffsetMm)}mm`;
      containerStyle.top = `${safeMm(image.verticalOffsetMm)}mm`;
      containerStyle.margin = 0;
      containerStyle.float = 'none';
      if (wrapMode === 'behind-text') wrapperClassName += 'opacity-80 ';
      else wrapperClassName += 'shadow-xl ';
      break;
    }
    case 'inline':
    default: {
      containerStyle.display = 'inline-block';
      wrapperClassName += 'clear-both my-4 ';
      if (image.alignment === 'left') wrapperClassName += 'mr-auto ';
      else if (image.alignment === 'right') wrapperClassName += 'ml-auto ';
      else wrapperClassName += 'mx-auto ';
      break;
    }
  }

  return { containerStyle, imageStyle, wrapperClassName: wrapperClassName.trim() };
}

/**
 * Resolves a numbered figure caption (e.g. "Abbildung 1: Quartalsbericht").
 */
export function resolveFigureCaption(image: WriterImageBlockData, figureIndex: number): string {
  const prefix = `Abbildung ${figureIndex}`;
  if (!image.caption || image.caption.trim().length === 0) {
    return prefix;
  }
  const cleanCaption = image.caption.replace(/^Abbildung\s*\d+\s*:\s*/i, '').trim();
  return `${prefix}: ${cleanCaption}`;
}

/**
 * Generates an automated Table of Figures (Abbildungsverzeichnis).
 */
export function generateTableOfFigures(
  images: readonly WriterImageBlockData[],
  pages?: readonly WriterPaginationPage[],
): WriterFigureIndexItem[] {
  const result: WriterFigureIndexItem[] = [];

  images.forEach((img, idx) => {
    const figureIndex = idx + 1;
    const label = `Abbildung ${figureIndex}`;
    const cleanCaption = img.caption
      ? img.caption.replace(/^Abbildung\s*\d+\s*:\s*/i, '').trim()
      : img.name;

    // Resolve page number from pagination if available
    let pageNumber = 1;
    if (pages && pages.length > 0) {
      for (const page of pages) {
        const hasImage = (page.paragraphs ?? []).some(
          (p) => p.id === img.anchorParagraphId,
        );
        if (hasImage) {
          pageNumber = page.displayPageNumber ?? (page.pageIndex + 1);
          break;
        }
      }
    }

    result.push({
      id: img.id,
      label,
      caption: cleanCaption,
      pageNumber,
    });
  });

  return result;
}
