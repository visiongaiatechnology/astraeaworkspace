// STATUS: DIAMANT VGT SUPREME — Validated paragraph border and shading model
import type {
  ParagraphStyle,
  WriterParagraphBorder,
  WriterParagraphBorders,
  WriterParagraphBorderStyle,
  WriterParagraphShading,
  WriterStyleDefinition,
} from '../../../../shared/contracts/workspace';
import type { CSSProperties } from 'react';

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const BORDER_STYLES = new Set<WriterParagraphBorderStyle>(['solid', 'dashed', 'dotted', 'double']);
const LEGACY_BACKGROUND_COLORS: Readonly<Record<string, string>> = {
  'rgba(241, 245, 249, 0.9)': '#f1f5f9',
  'rgba(239, 246, 255, 0.9)': '#eff6ff',
  'rgba(254, 252, 232, 0.9)': '#fefce8',
};

export interface ResolvedWriterParagraphDecoration {
  borders: WriterParagraphBorders;
  shading?: WriterParagraphShading;
  topInsetPt: number;
  bottomInsetPt: number;
  verticalInsetPt: number;
  /**
   * Horizontal space a border takes away from the text column: the rendered CSS
   * sets `paddingLeft/Right` from the border spacing and draws the border itself
   * inside the column, so the line-break calculation must subtract the same
   * amount. Without it a bordered paragraph wraps later than it renders and the
   * text runs past the page edge.
   */
  leftInsetPt: number;
  rightInsetPt: number;
  horizontalInsetPt: number;
}

const clampFinite = (value: number, minimum: number, maximum: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;

export function normalizeWriterDecorationColor(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase();
  return normalized && HEX_COLOR.test(normalized) ? normalized : fallback;
}

export function normalizeWriterParagraphBorder(
  border: WriterParagraphBorder | undefined,
): WriterParagraphBorder | undefined {
  if (!border) return undefined;
  return {
    style: BORDER_STYLES.has(border.style) ? border.style : 'solid',
    widthPt: clampFinite(border.widthPt, 0.25, 6, 1),
    color: normalizeWriterDecorationColor(border.color, '#64748b'),
    spacingPt: clampFinite(border.spacingPt, 0, 24, 3),
  };
}

function legacyBorder(value: string | undefined): WriterParagraphBorder | undefined {
  return value ? { style: 'solid', widthPt: 0.75, color: '#94a3b8', spacingPt: 3 } : undefined;
}

export function resolveWriterParagraphDecoration(
  paragraphStyle: ParagraphStyle,
  styleDefinition?: WriterStyleDefinition,
): ResolvedWriterParagraphDecoration {
  const sourceBorders = paragraphStyle.borders ?? styleDefinition?.borders ?? {};
  const borders: WriterParagraphBorders = {
    top: normalizeWriterParagraphBorder(sourceBorders.top) ?? legacyBorder(paragraphStyle.border_top ?? styleDefinition?.borderTop),
    right: normalizeWriterParagraphBorder(sourceBorders.right),
    bottom: normalizeWriterParagraphBorder(sourceBorders.bottom) ?? legacyBorder(paragraphStyle.border_bottom ?? styleDefinition?.borderBottom),
    left: normalizeWriterParagraphBorder(sourceBorders.left),
  };
  const sourceShading = paragraphStyle.shading ?? styleDefinition?.shading;
  const legacyBackground = paragraphStyle.background_color ?? styleDefinition?.backgroundColor;
  const legacyFill = legacyBackground ? LEGACY_BACKGROUND_COLORS[legacyBackground] : undefined;
  const shading = sourceShading || legacyFill
    ? {
        fillColor: normalizeWriterDecorationColor(sourceShading?.fillColor ?? legacyFill, '#f1f5f9'),
        opacityPercent: clampFinite(sourceShading?.opacityPercent ?? 90, 0, 100, 100),
      }
    : undefined;
  const topInsetPt = (borders.top?.widthPt ?? 0) + (borders.top?.spacingPt ?? 0);
  const bottomInsetPt = (borders.bottom?.widthPt ?? 0) + (borders.bottom?.spacingPt ?? 0);
  const leftInsetPt = (borders.left?.widthPt ?? 0) + (borders.left?.spacingPt ?? 0);
  const rightInsetPt = (borders.right?.widthPt ?? 0) + (borders.right?.spacingPt ?? 0);
  return {
    borders,
    shading,
    topInsetPt,
    bottomInsetPt,
    verticalInsetPt: topInsetPt + bottomInsetPt,
    leftInsetPt,
    rightInsetPt,
    horizontalInsetPt: leftInsetPt + rightInsetPt,
  };
}

function borderCss(border: WriterParagraphBorder | undefined): string | undefined {
  return border ? `${border.widthPt}pt ${border.style} ${border.color}` : undefined;
}

function colorWithOpacity(color: string, opacityPercent: number): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacityPercent / 100})`;
}

export function writerParagraphDecorationCss(
  decoration: ResolvedWriterParagraphDecoration,
): CSSProperties {
  return {
    borderTop: borderCss(decoration.borders.top),
    borderRight: borderCss(decoration.borders.right),
    borderBottom: borderCss(decoration.borders.bottom),
    borderLeft: borderCss(decoration.borders.left),
    paddingTop: decoration.borders.top ? `${decoration.borders.top.spacingPt}pt` : undefined,
    paddingRight: decoration.borders.right ? `${decoration.borders.right.spacingPt}pt` : undefined,
    paddingBottom: decoration.borders.bottom ? `${decoration.borders.bottom.spacingPt}pt` : undefined,
    paddingLeft: decoration.borders.left ? `${decoration.borders.left.spacingPt}pt` : undefined,
    backgroundColor: decoration.shading
      ? colorWithOpacity(decoration.shading.fillColor, decoration.shading.opacityPercent)
      : undefined,
    boxDecorationBreak: 'clone',
  };
}
