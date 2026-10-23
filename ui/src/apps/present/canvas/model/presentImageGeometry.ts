// STATUS: PLATIN — pure Present image geometry: aspect-correct insert and resize.
//
// Paket 6 "Bildimport und Zuschneiden": "PNG per Drag-and-drop einfügen, **korrekt skalieren** und
// maskieren".
//
// The defect this module fixes, measured: `SlideContentEditor.handleInsertImageFile` stored
// `widthPercent: 28, heightPercent: 18` for **every** image, and the resize gesture changed only
// `widthPercent`. Percent space is anisotropic (1 % width is not 1 % height), so an image was
// distorted on insert and stretched on every resize. All conversions between pixels and slide
// percent live here, and the same function is used by insert and by the resize gesture.

import { PRESENT_DEFAULT_ASPECT } from './presentRect';

/** Insert default: the image occupies this share of the slide width before it is clamped. */
export const PRESENT_IMAGE_DEFAULT_WIDTH_PERCENT = 28;

/** Below this the resize handle is unusable; above it an object could cover the whole slide. */
export const PRESENT_IMAGE_MIN_WIDTH_PERCENT = 4;
export const PRESENT_IMAGE_MIN_HEIGHT_PERCENT = 3;

export interface PresentImageIntrinsicSize {
  widthPx: number;
  heightPx: number;
}

export interface PresentImageBox {
  widthPercent: number;
  heightPercent: number;
}

function positive(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Height in slide percent that keeps the image's visual aspect ratio for a given width.
 *
 * physical width  = widthPercent  * slideAspect
 * physical height = heightPercent
 * => heightPercent = widthPercent * slideAspect * (imageHeightPx / imageWidthPx)
 */
export function presentImageHeightForWidth(
  size: PresentImageIntrinsicSize,
  widthPercent: number,
  slideAspectRatio: number = PRESENT_DEFAULT_ASPECT,
): number {
  const width = positive(size.widthPx);
  const height = positive(size.heightPx);
  const slideAspect = positive(slideAspectRatio) ?? PRESENT_DEFAULT_ASPECT;
  const target = positive(widthPercent) ?? PRESENT_IMAGE_DEFAULT_WIDTH_PERCENT;
  if (width === null || height === null) return target * slideAspect * 0.5625;
  return Math.round(target * slideAspect * (height / width) * 100) / 100;
}

/**
 * Insert box for a real image: the requested width, an aspect-correct height, both clamped so the
 * object fits on the slide. A malformed intrinsic size falls back to the 16:9 default rather than
 * producing `NaN` geometry.
 */
export function presentImageBoxForIntrinsicSize(
  size: PresentImageIntrinsicSize,
  slideAspectRatio: number = PRESENT_DEFAULT_ASPECT,
  requestedWidthPercent: number = PRESENT_IMAGE_DEFAULT_WIDTH_PERCENT,
): PresentImageBox {
  const slideAspect = positive(slideAspectRatio) ?? PRESENT_DEFAULT_ASPECT;
  const requested = positive(requestedWidthPercent) ?? PRESENT_IMAGE_DEFAULT_WIDTH_PERCENT;
  let widthPercent = Math.min(100, Math.max(PRESENT_IMAGE_MIN_WIDTH_PERCENT, requested));
  let heightPercent = Math.max(PRESENT_IMAGE_MIN_HEIGHT_PERCENT, presentImageHeightForWidth(size, widthPercent, slideAspect));
  if (heightPercent > 100) {
    // A very tall image: keep the ratio, shrink the width instead of clamping the height (which
    // would silently change the aspect ratio).
    const ratio = widthPercent / heightPercent;
    heightPercent = 100;
    widthPercent = Math.max(PRESENT_IMAGE_MIN_WIDTH_PERCENT, Math.min(100, heightPercent * ratio));
    heightPercent = Math.max(PRESENT_IMAGE_MIN_HEIGHT_PERCENT, presentImageHeightForWidth(size, widthPercent, slideAspect));
  }
  return {
    widthPercent: Math.round(widthPercent * 100) / 100,
    heightPercent: Math.round(Math.min(100, heightPercent) * 100) / 100,
  };
}

/**
 * Resize with a preserved aspect ratio. `free` (Shift) keeps the old behaviour of changing one axis.
 * The intrinsic size is required: without it "preserve the ratio" would just preserve the *current*
 * (possibly already wrong) box.
 */
export function resizePresentImageBox(
  size: PresentImageIntrinsicSize,
  current: PresentImageBox,
  dxPercent: number,
  dyPercent: number,
  slideAspectRatio: number = PRESENT_DEFAULT_ASPECT,
  options: { free?: boolean; maxWidthPercent?: number } = {},
): PresentImageBox {
  const slideAspect = positive(slideAspectRatio) ?? PRESENT_DEFAULT_ASPECT;
  const dx = Number.isFinite(dxPercent) ? dxPercent : 0;
  const dy = Number.isFinite(dyPercent) ? dyPercent : 0;
  const maxWidth = Math.max(PRESENT_IMAGE_MIN_WIDTH_PERCENT, Math.min(100, positive(options.maxWidthPercent) ?? 100));

  if (options.free) {
    return {
      widthPercent: Math.round(Math.min(maxWidth, Math.max(PRESENT_IMAGE_MIN_WIDTH_PERCENT, current.widthPercent + dx)) * 100) / 100,
      heightPercent: Math.round(Math.min(100, Math.max(PRESENT_IMAGE_MIN_HEIGHT_PERCENT, current.heightPercent + dy)) * 100) / 100,
    };
  }

  // Corner drag: the dominant axis decides, so a diagonal drag feels natural.
  const widthDriven = Math.abs(dx) >= Math.abs(dy);
  const requestedWidth = widthDriven
    ? current.widthPercent + dx
    : presentImageHeightForWidth(size, current.widthPercent, slideAspect) > 0
      ? current.widthPercent + dy / (presentImageHeightForWidth(size, 1, slideAspect) || 1)
      : current.widthPercent;
  const widthPercent = Math.min(maxWidth, Math.max(PRESENT_IMAGE_MIN_WIDTH_PERCENT, requestedWidth));
  const heightPercent = Math.min(100, Math.max(PRESENT_IMAGE_MIN_HEIGHT_PERCENT, presentImageHeightForWidth(size, widthPercent, slideAspect)));
  return { widthPercent: Math.round(widthPercent * 100) / 100, heightPercent: Math.round(heightPercent * 100) / 100 };
}

/** Physical pixel size of an image box on a slide of the given aspect ratio, for export/alt text. */
export function presentImagePhysicalSize(
  box: PresentImageBox,
  slideAspectRatio: number = PRESENT_DEFAULT_ASPECT,
): { widthUnits: number; heightUnits: number } {
  const slideAspect = positive(slideAspectRatio) ?? PRESENT_DEFAULT_ASPECT;
  return {
    widthUnits: Math.round(box.widthPercent * slideAspect * 100) / 100,
    heightUnits: Math.round(box.heightPercent * 100) / 100,
  };
}
