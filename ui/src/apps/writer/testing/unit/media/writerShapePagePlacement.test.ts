// STATUS: PLATIN — Which page a shape is drawn on
//
// A shape carries `anchorParagraphId` from the moment it is inserted, and its
// coordinates are millimetres on its page. The canvas used to be drawn on the
// first page only, so a text box inserted while writing on page three appeared on
// page one — the anchor was written and never read.
import { describe, expect, it } from 'vitest';
import type { WriterShapeBlockData } from '../../../../../shared/contracts/workspace';
import {
  createWriterShape,
  resolveWriterShapePageIndex,
  resolveWriterShapesForPageIndex,
  type WriterShapePageLike,
} from '../../../media/objects/shapes/writerShapeOperations';

const page = (ids: string[]): WriterShapePageLike => ({
  fragments: ids.map((id) => ({ paragraph: { id } })),
});

const THREE_PAGES: WriterShapePageLike[] = [
  page(['p1', 'p2']),
  page(['p3']),
  page(['p4', 'p5']),
];

const shape = (overrides: Partial<WriterShapeBlockData> = {}): WriterShapeBlockData => ({
  ...createWriterShape('textbox' as never, { id: 'shape-1' } as never),
  ...overrides,
});

describe('Writer shape page resolution', () => {
  it('puts a shape on the page that renders its anchor paragraph', () => {
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p1' }), THREE_PAGES)).toBe(0);
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p3' }), THREE_PAGES)).toBe(1);
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p5' }), THREE_PAGES)).toBe(2);
  });

  it('keeps a shape without an anchor on the first page', () => {
    expect(resolveWriterShapePageIndex(shape(), THREE_PAGES)).toBe(0);
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: undefined }), THREE_PAGES)).toBe(0);
  });

  it('keeps a shape whose anchor paragraph is gone on the first page', () => {
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'deleted' }), THREE_PAGES)).toBe(0);
  });

  it('returns the first page when there are no pages at all', () => {
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p3' }), [])).toBe(0);
  });

  it('finds the anchor in the plain paragraph list as well as in fragments', () => {
    const fromParagraphs: WriterShapePageLike[] = [{ paragraphs: [{ id: 'p9' }] }, { paragraphs: [{ id: 'p10' }] }];
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p10' }), fromParagraphs)).toBe(1);
  });

  it('splits several shapes across their pages, keeping the stored order', () => {
    const shapes = [
      shape({ id: 'a', anchorParagraphId: 'p3' }),
      shape({ id: 'b', anchorParagraphId: 'p1' }),
      shape({ id: 'c', anchorParagraphId: 'p4' }),
      shape({ id: 'd' }),
    ];
    expect(resolveWriterShapesForPageIndex(shapes, THREE_PAGES, 0).map((s) => s.id)).toEqual(['b', 'd']);
    expect(resolveWriterShapesForPageIndex(shapes, THREE_PAGES, 1).map((s) => s.id)).toEqual(['a']);
    expect(resolveWriterShapesForPageIndex(shapes, THREE_PAGES, 2).map((s) => s.id)).toEqual(['c']);
  });

  it('draws every shape exactly once across the pages', () => {
    const shapes = [
      shape({ id: 'a', anchorParagraphId: 'p1' }),
      shape({ id: 'b', anchorParagraphId: 'p3' }),
      shape({ id: 'c', anchorParagraphId: 'p4' }),
    ];
    const drawn = THREE_PAGES.flatMap((_, index) => resolveWriterShapesForPageIndex(shapes, THREE_PAGES, index));
    expect(drawn.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('draws nothing on a page without matching shapes', () => {
    expect(resolveWriterShapesForPageIndex([shape({ anchorParagraphId: 'p1' })], THREE_PAGES, 2)).toEqual([]);
    expect(resolveWriterShapesForPageIndex([], THREE_PAGES, 0)).toEqual([]);
  });

  it('does not mutate the shape list', () => {
    const shapes = [shape({ id: 'a', anchorParagraphId: 'p3' })];
    const snapshot = JSON.stringify(shapes);
    resolveWriterShapesForPageIndex(shapes, THREE_PAGES, 1);
    expect(JSON.stringify(shapes)).toBe(snapshot);
  });
});
