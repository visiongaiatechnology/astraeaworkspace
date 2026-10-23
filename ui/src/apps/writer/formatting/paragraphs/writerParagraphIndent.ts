// STATUS: PLATIN — Canonical Writer paragraph indentation model
import type { ParagraphStyle } from '../../../../shared/contracts/workspace';
import { clampWriterParagraphIndentMm } from '../../editing/paragraphs/writerParagraphStyleBounds';

export interface WriterParagraphIndent {
  leftMm: number;
  rightMm: number;
  firstLineMm: number;
  hangingMm: number;
}

function boundedMillimeters(value: number | undefined): number {
  // The bound itself lives in `writerParagraphStyleBounds`, where the write path
  // clamps too: reader and writer cannot disagree about the band any more.
  return clampWriterParagraphIndentMm(value) ?? 0;
}

export function resolveWriterParagraphIndent(
  style: Pick<ParagraphStyle, 'left_indent_mm' | 'right_indent_mm' | 'first_line_indent_mm' | 'hanging_indent_mm'>,
): WriterParagraphIndent {
  const firstLineMm = boundedMillimeters(style.first_line_indent_mm);
  const hangingMm = firstLineMm > 0 ? 0 : boundedMillimeters(style.hanging_indent_mm);
  return {
    leftMm: boundedMillimeters(style.left_indent_mm),
    rightMm: boundedMillimeters(style.right_indent_mm),
    firstLineMm,
    hangingMm,
  };
}
