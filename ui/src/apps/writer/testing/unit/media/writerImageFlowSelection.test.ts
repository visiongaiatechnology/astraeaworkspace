// STATUS: PLATIN — Flow selection of an image, resolved the way the layout resolves it
//
// The quick toolbar compared the raw optional `wrapMode` field, so a freshly
// imported image — the import path sets no `wrapMode` — showed no active flow
// button although the layout had already decided it is an inline block.
import { describe, expect, it } from 'vitest';
import type { WriterImageBlockData } from '../../../../../shared/contracts/workspace';
import {
  resolveWriterImageFlowSelection,
  resolveWriterImageWrapMode,
} from '../../../layout/pagination/media/writerMediaFlowLayout';

const image = (overrides: Partial<WriterImageBlockData> = {}): WriterImageBlockData => ({
  id: 'img-1',
  name: 'bild.png',
  dataUrl: 'data:image/png;base64,AAAA',
  intrinsicWidth: 800,
  intrinsicHeight: 600,
  widthPercent: 70,
  alignment: 'center',
  anchorParagraphId: 'p1',
  ...overrides,
} as WriterImageBlockData);

describe('Writer image flow selection', () => {
  it('treats an image without a wrap mode as an inline block', () => {
    // Exactly what the import produces: neither `wrapMode` nor `placement`.
    const imported = image();
    expect(resolveWriterImageWrapMode(imported)).toBe('inline');
    expect(resolveWriterImageFlowSelection(imported)).toEqual({
      mode: 'inline',
      wrapped: false,
      wrappedRight: false,
      inlineBlock: true,
    });
  });

  it('reads a float placement as a wrapped image even without a wrap mode', () => {
    expect(resolveWriterImageFlowSelection(image({ placement: 'float-left', alignment: 'left' })))
      .toMatchObject({ mode: 'square', wrapped: true, wrappedRight: false, inlineBlock: false });
    expect(resolveWriterImageFlowSelection(image({ placement: 'float-right', alignment: 'right' })))
      .toMatchObject({ mode: 'square', wrapped: true, wrappedRight: true, inlineBlock: false });
  });

  it('lets an explicit wrap mode win over the placement', () => {
    const selection = resolveWriterImageFlowSelection(image({
      placement: 'float-left',
      alignment: 'left',
      wrapMode: 'inline',
    }));
    expect(selection).toMatchObject({ mode: 'inline', wrapped: false, inlineBlock: true });
  });

  it('recognises tight and through as wrapped modes', () => {
    for (const mode of ['tight', 'through'] as const) {
      expect(resolveWriterImageFlowSelection(image({ wrapMode: mode, alignment: 'left' })))
        .toMatchObject({ mode, wrapped: true, wrappedRight: false });
    }
  });

  it('places a wrapped image on the right only when it is aligned or floating right', () => {
    expect(resolveWriterImageFlowSelection(image({ wrapMode: 'square', alignment: 'right' })).wrappedRight).toBe(true);
    expect(resolveWriterImageFlowSelection(image({ wrapMode: 'square', alignment: 'center' })).wrappedRight).toBe(false);
    expect(resolveWriterImageFlowSelection(image({ wrapMode: 'square', alignment: 'left' })).wrappedRight).toBe(false);
  });

  it('never reports both an inline block and a wrapped image', () => {
    for (const wrapMode of ['inline', 'square', 'tight', 'through'] as const) {
      const selection = resolveWriterImageFlowSelection(image({ wrapMode }));
      expect(selection.inlineBlock).toBe(!selection.wrapped);
    }
  });

  it('treats the other modes as neither wrapped nor an inline block', () => {
    for (const wrapMode of ['behind-text', 'in-front-of-text'] as const) {
      const selection = resolveWriterImageFlowSelection(image({ wrapMode }));
      expect(selection.wrapped).toBe(false);
      // The quick toolbar has no button for these; they must not light up as inline.
      expect(selection.mode).toBe(wrapMode);
    }
  });
});
