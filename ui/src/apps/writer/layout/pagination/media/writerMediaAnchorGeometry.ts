// STATUS: DIAMANT VGT SUPREME — Paragraph/Character Anchor Coordinate Resolver
import type { Paragraph, WriterImageBlockData, WriterLanguageTag, WriterStyleDefinition } from '../../../../../shared/contracts/workspace';
import type { WriterPaginationFragment } from '../writerPagination';
import { CSS_PIXELS_PER_MM, type WriterPageGeometry } from '../geometry/writerPaginationGeometry';
import { measureWriterParagraphTypography } from '../measurement/writerPaginationMeasurement';
import { resolveWriterTextFlow } from '../../text-flow/writerTextFlow';
import { writerImageBelongsToFragment } from './writerMediaFlowLayout';

export interface WriterFlowAnchorPosition {
  leftPx: number;
  topPx: number;
  marginFromSidePx: number;
  lineIndex: number;
}

function visibleCharacterCount(value: string): number {
  return Array.from(value.replace(/[\u00AD\u2060]/gu, '')).length;
}

export function resolveWriterImageFlowAnchorPosition(
  image: WriterImageBlockData,
  paragraph: Paragraph,
  fragment: WriterPaginationFragment,
  geometry: WriterPageGeometry,
  styles: readonly WriterStyleDefinition[],
  defaultLanguage: WriterLanguageTag = 'de-DE',
): WriterFlowAnchorPosition | null {
  if (!writerImageBelongsToFragment(image, fragment)) return null;
  const measurement = measureWriterParagraphTypography(
    paragraph,
    geometry.columnWidthPx,
    styles,
    defaultLanguage,
    [],
  );
  const fragmentLine = Math.max(0, measurement.lineRanges.findIndex((range) => fragment.startOffset >= range.start && fragment.startOffset <= range.end));
  const horizontalOffsetPx = Math.max(-geometry.columnWidthPx, Math.min(geometry.columnWidthPx, (image.horizontalOffsetMm ?? 0) * CSS_PIXELS_PER_MM));
  const verticalOffsetPx = Math.max(-geometry.bodyHeightPx, Math.min(geometry.bodyHeightPx, (image.verticalOffsetMm ?? 0) * CSS_PIXELS_PER_MM));
  let lineIndex = fragmentLine;
  let leftPx = Math.max(0, horizontalOffsetPx);

  if (image.anchorTarget === 'character') {
    const offset = Math.max(0, Math.trunc(image.anchorCharacterOffset ?? 0));
    const match = measurement.lineRanges.findIndex((range) => offset >= range.start && offset <= range.end);
    lineIndex = match >= 0 ? match : Math.max(0, measurement.lineRanges.length - 1);
    const line = measurement.lineRanges[lineIndex];
    const clampedOffset = Math.max(line?.start ?? 0, Math.min(line?.end ?? paragraph.spans.map((span) => span.text).join('').length, offset));
    const text = paragraph.spans.map((span) => span.text).join('');
    const prefixWidthPx = visibleCharacterCount(text.slice(line?.start ?? 0, clampedOffset)) * measurement.characterWidthPx;
    const direction = resolveWriterTextFlow(paragraph.style, text).resolvedDirection;
    leftPx = direction === 'rtl'
      ? geometry.columnWidthPx - prefixWidthPx + horizontalOffsetPx
      : prefixWidthPx + horizontalOffsetPx;
  }

  const renderedWidthPx = geometry.columnWidthPx * Math.max(0.05, Math.min(1, image.widthPercent / 100));
  const side = image.alignment === 'right' || image.placement === 'float-right' ? 'right' : 'left';
  const marginFromSidePx = side === 'left'
    ? Math.max(0, Math.min(geometry.columnWidthPx * 0.9, leftPx))
    : Math.max(0, Math.min(geometry.columnWidthPx * 0.9, geometry.columnWidthPx - leftPx - renderedWidthPx));
  const relativeLine = Math.max(0, lineIndex - fragmentLine);
  return {
    leftPx: Math.max(0, Math.min(geometry.columnWidthPx, leftPx)),
    topPx: Math.max(0, relativeLine * measurement.lineHeightPx + verticalOffsetPx),
    marginFromSidePx,
    lineIndex,
  };
}
