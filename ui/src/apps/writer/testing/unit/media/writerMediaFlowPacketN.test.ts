// STATUS: DIAMANT VGT SUPREME — Writer Packet N: Pagination-aware wrap and anchor regression
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterImageBlockData } from '../../../../../shared/contracts/workspace';
import { measureWriterParagraphTypography } from '../../../layout/pagination/measurement/writerPaginationMeasurement';
import { resolveWriterImageFlowMetric } from '../../../layout/pagination/media/writerMediaFlowLayout';
import { resolveMediaWrapStyles } from '../../../media/images/operations/writerMediaOperations';
import { resolveWriterImageFlowAnchorPosition } from '../../../layout/pagination/media/writerMediaAnchorGeometry';

const paragraph: Paragraph = {
  id: 'p-wrap',
  style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0, line_break_mode: 'break-word' },
  spans: [{ text: 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega. '.repeat(8), font_size_pt: 12 }],
};
const baseImage: WriterImageBlockData = {
  id: 'img-wrap', name: 'wrap.png', dataUrl: 'data:image/png;base64,AAAA',
  intrinsicWidth: 800, intrinsicHeight: 600, widthPercent: 48, alignment: 'left',
  anchorParagraphId: paragraph.id, anchorTarget: 'paragraph', moveWithText: true,
  wrapDistanceRightMm: 4,
};
const geometry = {
  widthPx: 800, heightPx: 1100, bodyWidthPx: 600, bodyHeightPx: 900,
  columnWidthPx: 600, columnCount: 1, columnGapPx: 0, columnWidthsPx: [600],
  marginsPx: { top: 80, bottom: 120, left: 100, right: 100 },
};

describe('Packet N — pagination-aware image wrapping', () => {
  it('changes canonical line breaking for square/tight/through instead of relying on CSS only', () => {
    const plain = measureWriterParagraphTypography(paragraph, 600, []);
    const square = measureWriterParagraphTypography(paragraph, 600, [], 'de-DE', [{ ...baseImage, wrapMode: 'square' }]);
    const tight = measureWriterParagraphTypography(paragraph, 600, [], 'de-DE', [{ ...baseImage, wrapMode: 'tight' }]);
    const through = measureWriterParagraphTypography(paragraph, 600, [], 'de-DE', [{ ...baseImage, wrapMode: 'through' }]);
    expect(square.lineRanges.length).toBeGreaterThan(plain.lineRanges.length);
    expect(tight.lineRanges.length).toBeLessThanOrEqual(square.lineRanges.length);
    expect(through.lineRanges.length).toBeLessThanOrEqual(tight.lineRanges.length);
  });

  it('starts character-anchor exclusion on the line containing the anchor offset', () => {
    const plain = measureWriterParagraphTypography(paragraph, 600, []);
    const characterImage = { ...baseImage, wrapMode: 'square' as const, anchorTarget: 'character' as const, anchorCharacterOffset: 180 };
    const metric = resolveWriterImageFlowMetric(
      characterImage, 600, plain.lineHeightPx, plain.characterWidthPx,
      paragraph.spans[0]?.text ?? '', plain.lineRanges,
    );
    expect(metric).not.toBeNull();
    expect(metric?.startLine).toBeGreaterThan(0);
    expect(metric?.offsetFromSidePx).toBeGreaterThanOrEqual(0);
  });

  it('resolves paragraph and character anchors to bounded physical coordinates', () => {
    const full = measureWriterParagraphTypography(paragraph, 600, []);
    const firstFragment = {
      key: 'p-wrap:first', paragraph, startOffset: 0,
      endOffset: full.lineRanges[Math.min(4, full.lineRanges.length - 1)]?.end ?? paragraph.spans[0]!.text.length,
      lineCount: Math.min(5, full.lineRanges.length), isFirst: true, isLast: false,
    };
    const paragraphAnchor = resolveWriterImageFlowAnchorPosition(
      { ...baseImage, wrapMode: 'square', anchorTarget: 'paragraph', horizontalOffsetMm: 3, verticalOffsetMm: 2 },
      paragraph, firstFragment, geometry, [], 'de-DE',
    );
    expect(paragraphAnchor).not.toBeNull();
    expect(paragraphAnchor?.leftPx).toBeGreaterThan(0);
    expect(paragraphAnchor?.topPx).toBeGreaterThan(0);
    const fragment = {
      key: 'p-wrap:part-0', paragraph, startOffset: 0,
      endOffset: full.lineRanges[Math.min(8, full.lineRanges.length - 1)]?.end ?? paragraph.spans[0]!.text.length,
      lineCount: Math.min(9, full.lineRanges.length), isFirst: true, isLast: false,
    };
    const anchored = resolveWriterImageFlowAnchorPosition(
      { ...baseImage, wrapMode: 'square', anchorTarget: 'character', anchorCharacterOffset: 180, verticalOffsetMm: 2 },
      paragraph, fragment, geometry, [], 'de-DE',
    );
    expect(anchored).not.toBeNull();
    expect(anchored?.topPx).toBeGreaterThan(0);
    expect(anchored?.leftPx).toBeGreaterThanOrEqual(0);
    expect(anchored?.leftPx).toBeLessThanOrEqual(geometry.columnWidthPx);
  });
  it('keeps behind/in-front objects out of normal flow', () => {
    const behind = resolveMediaWrapStyles({ ...baseImage, wrapMode: 'behind-text' });
    const front = resolveMediaWrapStyles({ ...baseImage, wrapMode: 'in-front-of-text' });
    expect(behind.containerStyle.position).toBe('absolute');
    expect(front.containerStyle.position).toBe('absolute');
    expect(behind.containerStyle.zIndex).toBe(0);
    expect(front.containerStyle.zIndex).toBe(20);
  });

});
