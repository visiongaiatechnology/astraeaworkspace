// STATUS: DIAMANT VGT SUPREME — Sovereign Paragraph Measurement & Flow Layout Helpers
import type {
  Paragraph,
  WriterStyleDefinition,
  WriterLanguageTag,
  WriterImageBlockData,
} from '../../../../../shared/contracts/workspace';
import {
  CSS_PIXELS_PER_MM,
  CSS_PIXELS_PER_POINT,
  MINIMUM_LINE_HEIGHT_PX,
  DEFAULT_FONT_SIZE_PT,
  DEFAULT_CHARACTER_WIDTH_FACTOR,
  type WriterPageGeometry,
} from '../geometry/writerPaginationGeometry';
import type { WriterFlowContent } from '../writerPaginationTypes';
import { writerLineHeightPx } from '../../typography/line-spacing/writerLineSpacing';
import { resolveWriterParagraphSpacing } from '../../../formatting/paragraphs/writerParagraphSpacing';
import { resolveWriterParagraphIndent } from '../../../formatting/paragraphs/writerParagraphIndent';
import { resolveWriterParagraphDecoration } from '../../../formatting/paragraphs/writerParagraphDecoration';
import { hasWriterColumnBreakMarker, hasWriterPageBreakMarker } from '../../../editing/flow-breaks/writerBreakMarkers';
import { wrapWriterTextRanges, wrapWriterTextRangesVariable, type WriterTextLineRange } from '../../text-layout/writerTextLayout';
import { normalizeWriterTextFlow } from '../../text-flow/writerTextFlow';
import { isWriterImageFixedToPage } from '../../../media/images/operations/writerMediaRules';
import {
  resolveWriterImageFlowMetric,
  resolveWriterImageWrapMode,
  writerImageExcludedWidthForLine,
  writerImageResidualFlowHeightPx,
  type WriterImageFlowMetric,
} from '../media/writerMediaFlowLayout';
import { browserCanvasTextMeasureAdapter, resolveFont, shapeText } from '../../../../../platform/rendering/index';

const WRITER_TEXT_MEASURE_ADAPTER = browserCanvasTextMeasureAdapter();

export interface WriterParagraphTypographyMeasurement {
  lineRanges: WriterTextLineRange[];
  lineHeightPx: number;
  characterWidthPx: number;
  spaceBeforePx: number;
  spaceAfterPx: number;
  flowImageMetrics: WriterImageFlowMetric[];
}

export function getStyleDefinition(
  paragraph: Paragraph,
  styles: readonly WriterStyleDefinition[],
): WriterStyleDefinition | undefined {
  const styleName = paragraph.style.style_name;
  return styleName ? styles.find((style) => style.name === styleName) : undefined;
}

export function measureWriterParagraphTypography(
  paragraph: Paragraph,
  columnWidthPx: number,
  styles: readonly WriterStyleDefinition[],
  defaultLanguage: WriterLanguageTag = 'de-DE',
  images: readonly WriterImageBlockData[] = [],
): WriterParagraphTypographyMeasurement {
  const styleDefinition = getStyleDefinition(paragraph, styles);
  const fontSizePt = Math.max(
    DEFAULT_FONT_SIZE_PT,
    styleDefinition?.fontSizePt ?? 0,
    ...paragraph.spans.map((span) => span.font_size_pt ?? 0),
  );
  const fontSizePx = fontSizePt * CSS_PIXELS_PER_POINT;
  const lineHeightPx = Math.max(
    MINIMUM_LINE_HEIGHT_PX,
    writerLineHeightPx(paragraph.style, fontSizePx, styleDefinition?.lineHeight ?? 1.2),
  );
  const paragraphText = paragraph.spans.map((span) => span.text).join('');
  const explicitFamily = paragraph.spans.find((span) => span.font_family)?.font_family ?? styleDefinition?.fontFamily;
  const resolvedFont = resolveFont({ family: explicitFamily, generic: 'sans-serif', weight: styleDefinition?.bold ? 700 : 400, italic: styleDefinition?.italic });
  const shapingSample = (paragraphText || '00000000').slice(0, 256);
  const shaped = shapeText(shapingSample, { fontFamily: resolvedFont.cssFamily, fontSizePx, fontWeight: resolvedFont.weight, italic: resolvedFont.italic }, WRITER_TEXT_MEASURE_ADAPTER, defaultLanguage);
  const shapedClusters = Math.max(1, shaped.graphemes.length);
  const characterWidthPx = Math.max(1, shaped.widthPx / shapedClusters || fontSizePx * DEFAULT_CHARACTER_WIDTH_FACTOR);
  const indent = resolveWriterParagraphIndent(paragraph.style);
  const indentWidthPx = (indent.leftMm + indent.rightMm + Math.max(indent.firstLineMm, indent.hangingMm)) * CSS_PIXELS_PER_MM;
  // A border draws inside the column and adds padding, so it narrows the text
  // exactly like an indent does. Ignoring it here made bordered paragraphs wrap
  // later than they render and overrun the page edge.
  const decoration = resolveWriterParagraphDecoration(paragraph.style, styleDefinition);
  const borderWidthPx = decoration.horizontalInsetPt * CSS_PIXELS_PER_POINT;
  const effectiveWidthPx = Math.max(characterWidthPx, columnWidthPx - indentWidthPx - borderWidthPx);
  const charactersPerLine = Math.max(1, Math.floor(effectiveWidthPx / characterWidthPx));
  const text = paragraphText;
  const textFlow = normalizeWriterTextFlow(paragraph.style);
  let spanOffset = 0;
  const languageRanges = paragraph.spans.map((span) => {
    const start = spanOffset;
    spanOffset += span.text.length;
    return { start, end: spanOffset, language: span.language ?? defaultLanguage };
  });
  const layoutOptions = {
    lineBreakMode: textFlow.lineBreakMode,
    hyphenationMode: textFlow.hyphenationMode,
    language: defaultLanguage,
    languageRanges,
  } as const;
  const baselineRanges = wrapWriterTextRanges(text, charactersPerLine, layoutOptions);
  const flowImageMetrics = images
    .filter((image) => image.anchorParagraphId === paragraph.id)
    .map((image) => resolveWriterImageFlowMetric(
      image, effectiveWidthPx, lineHeightPx, characterWidthPx, text, baselineRanges,
    ))
    .filter((metric): metric is WriterImageFlowMetric => metric !== null);
  const lineRanges = flowImageMetrics.length === 0
    ? baselineRanges
    : wrapWriterTextRangesVariable(text, (lineIndex) => {
        const excludedWidthPx = writerImageExcludedWidthForLine(lineIndex, flowImageMetrics, effectiveWidthPx);
        const availableWidthPx = Math.max(characterWidthPx * 4, effectiveWidthPx - excludedWidthPx);
        return Math.max(1, Math.floor(availableWidthPx / characterWidthPx));
      }, layoutOptions);
  const paragraphSpacing = resolveWriterParagraphSpacing(
    paragraph.style,
    styleDefinition?.spaceBefore ?? 0,
    styleDefinition?.spaceAfter ?? 0,
  );
  const spaceBeforePx = paragraphSpacing.beforePt * CSS_PIXELS_PER_POINT;
  const spaceAfterPx = paragraphSpacing.afterPt * CSS_PIXELS_PER_POINT;

  return {
    lineRanges,
    lineHeightPx,
    characterWidthPx,
    spaceBeforePx: spaceBeforePx + decoration.topInsetPt * CSS_PIXELS_PER_POINT,
    spaceAfterPx: spaceAfterPx + decoration.bottomInsetPt * CSS_PIXELS_PER_POINT,
    flowImageMetrics,
  };
}

export function estimateWriterParagraphHeightPx(
  paragraph: Paragraph,
  columnWidthPx: number,
  styles: readonly WriterStyleDefinition[],
): number {
  const measurement = measureWriterParagraphTypography(paragraph, columnWidthPx, styles);
  return measurement.lineRanges.length * measurement.lineHeightPx +
    measurement.spaceBeforePx + measurement.spaceAfterPx;
}

export function hasExplicitPageBreak(paragraph: Paragraph): boolean {
  return paragraph.style.page_break_before === true ||
    paragraph.spans.some((span) => hasWriterPageBreakMarker(span.text));
}

export function hasExplicitColumnBreak(paragraph: Paragraph): boolean {
  return paragraph.style.column_break_before === true ||
    paragraph.spans.some((span) => hasWriterColumnBreakMarker(span.text));
}

export function estimateAnchoredMediaHeightPx(
  paragraphId: string,
  geometry: WriterPageGeometry,
  flowContent?: WriterFlowContent,
  typography?: Pick<WriterParagraphTypographyMeasurement, 'lineRanges' | 'lineHeightPx' | 'flowImageMetrics'>,
): number {
  if (!flowContent) return 0;
  let heightPx = 0;

  for (const image of flowContent.images ?? []) {
    if (image.anchorParagraphId !== paragraphId || isWriterImageFixedToPage(image)) continue;
    const mode = resolveWriterImageWrapMode(image);
    if (mode === 'square' || mode === 'tight' || mode === 'through') continue;
    if (mode === 'behind-text' || mode === 'in-front-of-text') continue;
    // DEF-RE-013: `Math.max(1, NaN)` is NaN. A non-finite intrinsic size made `safeHeight / safeWidth`
    // NaN, and `heightPx += NaN` stayed NaN for every later image - the returned line height, which the
    // page breaks are computed from. `Infinity` was worse still: it yielded 28, a finite but wrong value.
    // Same class as DEF-RE-009 and DEF-RE-010. The fallbacks are the bounds these clamps already impose.
    const safeWidth = Number.isFinite(image.intrinsicWidth) ? Math.max(1, image.intrinsicWidth) : 1;
    const safeHeight = Number.isFinite(image.intrinsicHeight) ? Math.max(1, image.intrinsicHeight) : 1;
    const widthPercent = Number.isFinite(image.widthPercent) ? image.widthPercent : 100;
    const renderedWidth = geometry.columnWidthPx * Math.min(1, Math.max(0.05, widthPercent / 100));
    heightPx += Math.min(geometry.bodyHeightPx, renderedWidth * (safeHeight / safeWidth)) + 28;
  }
  if (typography && typography.flowImageMetrics.length > 0) {
    heightPx += writerImageResidualFlowHeightPx(
      typography.flowImageMetrics,
      typography.lineRanges.length,
      typography.lineHeightPx,
    );
  }
  for (const media of flowContent.mediaObjects ?? []) {
    if (media.anchorParagraphId !== paragraphId) continue;
    heightPx += media.kind === 'video' ? 250 : 82;
  }
  for (const equation of flowContent.equations ?? []) {
    if (equation.anchorParagraphId === paragraphId) heightPx += 84;
  }
  for (const footnote of flowContent.footnotes ?? []) {
    if (footnote.referenceParagraphId === paragraphId) {
      const lines = Math.max(1, Math.ceil(Array.from(footnote.text).length / 80));
      heightPx += 18 + lines * 15;
    }
  }
  for (const embed of flowContent.workspaceEmbeds ?? []) {
    if (embed.anchorParagraphId !== paragraphId) continue;
    if (embed.snapshot.type === 'table') heightPx += Math.min(320, 84 + embed.snapshot.rows.length * 22);
    else if (embed.snapshot.type === 'timeline') heightPx += Math.min(300, 72 + embed.snapshot.items.length * 28);
    else if (embed.snapshot.type === 'chart') heightPx += 190;
    else heightPx += 150;
  }

  return heightPx;
}
