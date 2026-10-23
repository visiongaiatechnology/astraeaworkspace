// STATUS: PLATIN — Deterministic Writer line-spacing model
import type { ParagraphStyle } from '../../../../../shared/contracts/workspace';

export type WriterLineSpacingMode = 'preset' | 'exact' | 'minimum' | 'multiple';
export interface WriterLineSpacing { mode: WriterLineSpacingMode; value: number; }

const POINTS_TO_CSS_PIXELS = 96 / 72;

function clampFinite(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export function resolveWriterLineSpacing(
  style: Pick<ParagraphStyle, 'line_height' | 'line_spacing_mode' | 'line_spacing_value'>,
  fallbackMultiplier = 1.2,
): WriterLineSpacing {
  const mode = style.line_spacing_mode ?? 'preset';
  const legacy = clampFinite(style.line_height, 0.5, 10, fallbackMultiplier);
  if (mode === 'exact' || mode === 'minimum') {
    return { mode, value: clampFinite(style.line_spacing_value ?? 12, 1, 500, 12) };
  }
  return { mode, value: clampFinite(style.line_spacing_value ?? legacy, 0.5, 10, legacy) };
}

export function writerLineHeightCss(style: ParagraphStyle, fallbackMultiplier = 1.2): string | number {
  const spacing = resolveWriterLineSpacing(style, fallbackMultiplier);
  if (spacing.mode === 'exact') return `${spacing.value}pt`;
  if (spacing.mode === 'minimum') return `max(${spacing.value}pt, 1.2em)`;
  return spacing.value;
}

export function writerLineHeightPx(style: ParagraphStyle, fontSizePx: number, fallbackMultiplier = 1.2): number {
  const spacing = resolveWriterLineSpacing(style, fallbackMultiplier);
  if (spacing.mode === 'exact') return spacing.value * POINTS_TO_CSS_PIXELS;
  if (spacing.mode === 'minimum') return Math.max(spacing.value * POINTS_TO_CSS_PIXELS, fontSizePx * 1.2);
  return fontSizePx * spacing.value;
}

export function writerLineHeightPt(style: ParagraphStyle, fontSizePt: number, fallbackMultiplier = 1.2): number {
  const spacing = resolveWriterLineSpacing(style, fallbackMultiplier);
  if (spacing.mode === 'exact') return spacing.value;
  if (spacing.mode === 'minimum') return Math.max(spacing.value, fontSizePt * 1.2);
  return fontSizePt * spacing.value;
}
