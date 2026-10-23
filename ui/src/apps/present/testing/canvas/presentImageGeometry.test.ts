// BATCH-PRESENT — pure image geometry: aspect-correct insert and resize (Paket 6).
//
// The oracle values are computed by hand from the physical model:
// physical width = widthPercent * slideAspect, physical height = heightPercent.
import { describe, expect, it } from 'vitest';
import {
  PRESENT_IMAGE_DEFAULT_WIDTH_PERCENT,
  PRESENT_IMAGE_MIN_HEIGHT_PERCENT,
  PRESENT_IMAGE_MIN_WIDTH_PERCENT,
  presentImageBoxForIntrinsicSize,
  presentImageHeightForWidth,
  presentImagePhysicalSize,
  resizePresentImageBox,
} from '../../canvas/model/presentImageGeometry';
import {
  PRESENT_MAX_CROP_INSET_PERCENT,
  presentImageCropClipPath,
  readPresentImageCrop,
  readPresentImageIntrinsicSize,
  withPresentImageCrop,
} from '../../canvas/model/presentObjectExtensions';

const square = { widthPx: 1000, heightPx: 1000 };
const wide = { widthPx: 1920, heightPx: 1080 };
const tall = { widthPx: 1080, heightPx: 1920 };

describe('presentImageHeightForWidth', () => {
  it('keeps the visual aspect ratio in anisotropic percent space', () => {
    // A square image at 28 % of a 16:9 slide is physically 28 * 16/9 = 49.78 units wide, so its
    // height must be 49.78 % of the slide height to stay square on screen.
    expect(presentImageHeightForWidth(square, 28, 16 / 9)).toBeCloseTo(49.78, 2);
    // A 16:9 image keeps exactly the slide ratio: height = width * slideAspect * (1080/1920).
    expect(presentImageHeightForWidth(wide, 50, 16 / 9)).toBeCloseTo(50 * (16 / 9) * (1080 / 1920), 2);
  });

  it('falls back to the 16:9 default instead of producing NaN for unusable input', () => {
    const fallback = presentImageHeightForWidth({ widthPx: 0, heightPx: Number.NaN }, 20, 16 / 9);
    expect(Number.isFinite(fallback)).toBe(true);
    expect(fallback).toBeGreaterThan(0);
  });
});

describe('presentImageBoxForIntrinsicSize', () => {
  it('produces a box whose physical size matches the image ratio', () => {
    const box = presentImageBoxForIntrinsicSize(wide, 16 / 9, PRESENT_IMAGE_DEFAULT_WIDTH_PERCENT);
    const physical = presentImagePhysicalSize(box, 16 / 9);
    expect(physical.widthUnits / physical.heightUnits).toBeCloseTo(1920 / 1080, 2);
  });

  it('shrinks a very tall image by width instead of clamping the height (which would distort it)', () => {
    const box = presentImageBoxForIntrinsicSize(tall, 16 / 9, 40);
    expect(box.heightPercent).toBeLessThanOrEqual(100);
    const physical = presentImagePhysicalSize(box, 16 / 9);
    expect(physical.widthUnits / physical.heightUnits).toBeCloseTo(1080 / 1920, 2);
  });

  it('never returns an unusable or off-slide box', () => {
    for (const size of [square, wide, tall]) {
      const box = presentImageBoxForIntrinsicSize(size, 4 / 3, 200);
      expect(box.widthPercent).toBeGreaterThanOrEqual(PRESENT_IMAGE_MIN_WIDTH_PERCENT);
      expect(box.heightPercent).toBeGreaterThanOrEqual(PRESENT_IMAGE_MIN_HEIGHT_PERCENT);
      expect(box.widthPercent).toBeLessThanOrEqual(100);
      expect(box.heightPercent).toBeLessThanOrEqual(100);
    }
  });
});

describe('resizePresentImageBox', () => {
  it('preserves the aspect ratio for a corner drag', () => {
    const start = presentImageBoxForIntrinsicSize(wide, 16 / 9, 30);
    const next = resizePresentImageBox(wide, start, 10, 2, 16 / 9);
    const physical = presentImagePhysicalSize(next, 16 / 9);
    expect(physical.widthUnits / physical.heightUnits).toBeCloseTo(1920 / 1080, 2);
    expect(next.widthPercent).toBeGreaterThan(start.widthPercent);
  });

  it('honours the free (Shift) mode by changing one axis only', () => {
    const start = { widthPercent: 30, heightPercent: 20 };
    const next = resizePresentImageBox(wide, start, 10, 0, 16 / 9, { free: true });
    expect(next.widthPercent).toBe(40);
    expect(next.heightPercent).toBe(20);
  });

  it('never shrinks below the minimum or grows past the available width', () => {
    const start = { widthPercent: 20, heightPercent: 12 };
    const tiny = resizePresentImageBox(wide, start, -500, -500, 16 / 9);
    expect(tiny.widthPercent).toBe(PRESENT_IMAGE_MIN_WIDTH_PERCENT);
    const huge = resizePresentImageBox(wide, start, 500, 500, 16 / 9, { maxWidthPercent: 40 });
    expect(huge.widthPercent).toBe(40);
  });
});

describe('image crop', () => {
  it('clamps each inset and refuses to hide the whole image', () => {
    const cropped = withPresentImageCrop({}, { cropTop: 200, cropBottom: 200, cropLeft: -5, cropRight: 10 });
    const crop = readPresentImageCrop(cropped);
    expect(crop.top).toBe(PRESENT_MAX_CROP_INSET_PERCENT);
    // The clamp and the visibility rule must agree: a clamped crop is always still visible.
    expect(crop.top + crop.bottom).toBeLessThan(90);
    expect(crop.visible).toBe(true);
    expect(crop.left).toBe(0);
    expect(crop.right).toBe(10);
  });

  it('treats a hostile crop as invisible rather than rendering a blank image silently', () => {
    const hostile = { cropTop: 500, cropBottom: 500 };
    expect(readPresentImageCrop(hostile).visible).toBe(false);
    expect(presentImageCropClipPath(hostile)).toBe('inset(45% 45% 45% 45%)');
  });

  it('renders no clip path when nothing is cropped and a clip path otherwise', () => {
    expect(presentImageCropClipPath({})).toBeUndefined();
    expect(presentImageCropClipPath({ cropTop: 10, cropLeft: 5 })).toBe('inset(10% 0% 0% 5%)');
  });

  it('falls back to the current box ratio when no intrinsic size was stored', () => {
    const size = readPresentImageIntrinsicSize({ widthPercent: 28, heightPercent: 18 }, 16 / 9);
    expect(size.widthPx / size.heightPx).toBeCloseTo((28 * (16 / 9)) / 18, 3);
  });

  it('bounds a hostile stored intrinsic size', () => {
    const size = readPresentImageIntrinsicSize({ intrinsicWidthPx: 1e9, intrinsicHeightPx: -5 }, 16 / 9);
    expect(size.widthPx).toBe(32768);
    expect(size.heightPx).toBeGreaterThan(0);
  });
});
