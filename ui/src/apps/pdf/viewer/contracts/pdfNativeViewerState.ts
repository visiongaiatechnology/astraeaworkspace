// STATUS: DIAMANT VGT SUPREME
// Pure bounded viewport state helpers for the Native PDF shell. Parser/renderer independent.

export type NativeFitMode = 'custom' | 'page' | 'width';
export type NativeContrastMode = 'normal' | 'high-contrast' | 'invert' | 'grayscale';
export type NativeRotation = 0 | 90 | 180 | 270;

export const NATIVE_PDF_ZOOM_MIN = 25;
export const NATIVE_PDF_ZOOM_MAX = 400;

export function clampNativePdfZoom(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(NATIVE_PDF_ZOOM_MIN, Math.min(NATIVE_PDF_ZOOM_MAX, Math.round(value)));
}

export function normalizeNativePdfRotation(value: number): NativeRotation {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return normalized as NativeRotation;
}

export function nextNativePdfRotation(value: NativeRotation): NativeRotation {
  return normalizeNativePdfRotation(value + 90);
}

export function nativePdfContrastFilter(mode: NativeContrastMode): string {
  switch (mode) {
    case 'high-contrast': return 'contrast(1.45) saturate(0.85)';
    case 'invert': return 'invert(1) hue-rotate(180deg)';
    case 'grayscale': return 'grayscale(1) contrast(1.1)';
    default: return 'none';
  }
}

export function nativePdfFragment(page: number, fit: NativeFitMode, zoom: number, hideToolbar = false): string {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const view = fit === 'page' ? 'Fit' : fit === 'width' ? 'FitH' : String(clampNativePdfZoom(zoom));
  return `#page=${safePage}&zoom=${encodeURIComponent(view)}${hideToolbar ? '&toolbar=0&navpanes=0' : ''}`;
}

export function nativePdfFrameStyle(contrast: NativeContrastMode, rotation: NativeRotation): {
  filter: string;
  transform: string;
  transformOrigin: string;
} {
  return {
    filter: nativePdfContrastFilter(contrast),
    transform: rotation === 0 ? 'none' : `rotate(${rotation}deg)`,
    transformOrigin: 'center center',
  };
}
