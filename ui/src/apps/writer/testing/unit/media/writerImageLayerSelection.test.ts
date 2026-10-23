// STATUS: PLATIN — WR-033: one predicate decides which image layer a picture belongs to
//
// The native M7 re-probe failed because `WriterPagePaper` answered "does this paragraph
// carry a terminal image?" with `isWriterImageFixedToPage` — the exact negation of the
// layer's own filter. These tests pin the predicate to the layer semantics, so the page and
// the layer can never disagree again.
import { describe, expect, it } from 'vitest';
import type { WriterImageBlockData } from '../../../../../shared/contracts/workspace';
import {
  isWriterImageInAnchoredLayer,
  isWriterImageInTerminalLayer,
  writerAnchoredLayerImages,
  writerTerminalLayerImages,
} from '../../../media/layout/writerImageLayerSelection';
import type { WriterPaginationFragment } from '../../../layout/pagination/writerPagination';

function image(overrides: Partial<WriterImageBlockData> = {}): WriterImageBlockData {
  return {
    id: 'img-1',
    name: 'bild.png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    intrinsicWidth: 800,
    intrinsicHeight: 600,
    widthPercent: 70,
    alignment: 'center',
    ...overrides,
  };
}

const fragment = (isFirst: boolean): WriterPaginationFragment => ({
  key: `p1:${isFirst ? '0' : '1'}`,
  paragraph: {
    id: 'p1',
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
    spans: [{ text: 'Text' }],
  },
  startOffset: 0,
  endOffset: 4,
  lineCount: 1,
  isFirst,
  isLast: isFirst,
});

describe('WR-033 — the terminal layer owns inline and top-and-bottom images', () => {
  it('classifies a normally imported image as a terminal image', () => {
    // `importWriterImage` sets no wrap mode and no placement.
    const imported = image();
    expect(isWriterImageInTerminalLayer(imported)).toBe(true);
    expect(isWriterImageInAnchoredLayer(imported)).toBe(false);
  });

  it.each(['top-bottom', 'inline'] as const)('treats %s as a terminal image', (mode) => {
    const value = image({ wrapMode: mode });
    expect(isWriterImageInTerminalLayer(value)).toBe(true);
    expect(isWriterImageInAnchoredLayer(value)).toBe(false);
  });

  it.each(['square', 'tight', 'through'] as const)('treats %s as an anchored image', (mode) => {
    const value = image({ wrapMode: mode });
    expect(isWriterImageInAnchoredLayer(value)).toBe(true);
    expect(isWriterImageInTerminalLayer(value)).toBe(false);
  });

  it.each(['behind-text', 'in-front-of-text'] as const)('keeps %s visible through the anchored layer', (mode) => {
    const value = image({ wrapMode: mode });
    expect(isWriterImageInAnchoredLayer(value)).toBe(true);
    expect(isWriterImageInTerminalLayer(value)).toBe(false);
  });

  it('belongs to neither layer when it is pinned to the page', () => {
    const pinned = image({ fixPositionOnPage: true });
    expect(isWriterImageInTerminalLayer(pinned)).toBe(false);
    expect(isWriterImageInAnchoredLayer(pinned)).toBe(false);
  });
});

describe('WR-033 — the page subsets follow the paragraph and the fragment', () => {
  const images = [
    image({ id: 'inline', anchorParagraphId: 'p1' }),
    image({ id: 'wrapped', anchorParagraphId: 'p1', wrapMode: 'square' }),
    image({ id: 'other', anchorParagraphId: 'p2' }),
    image({ id: 'pinned', anchorParagraphId: 'p1', fixPositionOnPage: true }),
  ];

  it('filters the terminal layer by paragraph and kind', () => {
    expect(writerTerminalLayerImages(images, 'p1').map((item) => item.id)).toEqual(['inline']);
    expect(writerTerminalLayerImages(images, 'p2').map((item) => item.id)).toEqual(['other']);
  });

  it('filters the anchored layer by paragraph', () => {
    expect(writerAnchoredLayerImages(images, 'p1', fragment(true)).map((item) => item.id)).toEqual(['wrapped']);
  });

  it('keeps a character-anchored image on the fragment that owns its offset', () => {
    const character = image({
      id: 'character',
      anchorParagraphId: 'p1',
      wrapMode: 'square',
      anchorTarget: 'character',
      anchorCharacterOffset: 0,
    });
    // `writerImageBelongsToFragment` keeps non-character anchors on `isFirst`; a character
    // anchor is matched by offset, which is what the fragment range is for.
    expect(writerAnchoredLayerImages([character], 'p1', fragment(true)).map((item) => item.id)).toEqual(['character']);
  });
});
