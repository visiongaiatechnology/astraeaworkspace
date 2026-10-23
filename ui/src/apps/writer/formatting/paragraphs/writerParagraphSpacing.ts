// STATUS: PLATIN — Bounded paragraph spacing in typographic points
import type { ParagraphStyle } from '../../../../shared/contracts/workspace';
import { clampWriterParagraphSpacingPt } from '../../editing/paragraphs/writerParagraphStyleBounds';

function boundedPoints(value: number | undefined, fallback: number): number {
  // A non-finite or absent value cannot be used at all; the band itself comes
  // from the one definition shared with the write path.
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampWriterParagraphSpacingPt(value) ?? fallback;
}

export interface WriterParagraphSpacing {
  beforePt: number;
  afterPt: number;
}

export function resolveWriterParagraphSpacing(
  style: Pick<ParagraphStyle, 'space_before' | 'space_after'>,
  fallbackBeforePt = 0,
  fallbackAfterPt = 0,
): WriterParagraphSpacing {
  return {
    beforePt: boundedPoints(style.space_before, fallbackBeforePt),
    afterPt: boundedPoints(style.space_after, fallbackAfterPt),
  };
}
