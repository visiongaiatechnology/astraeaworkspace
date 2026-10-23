// STATUS: GOLD — oracles for Draw text wrapping, measurement and direct-edit commits.
import { describe, expect, it } from 'vitest';
import { DrawModelError } from '../../model/drawDocumentValidation';
import {
  DEFAULT_DRAW_FONT_SIZE,
  drawObjectFontSize,
  drawObjectPlainText,
  drawTextMeasureFunction,
  measureDrawText,
  setDrawObjectPlainText,
  wrapDrawText,
} from '../../interactions/drawTextLayout';
import { createVectorShape } from '../../model/drawVectorEngine';

function shapeWithText(text: string, width = 200, height = 100) {
  return createVectorShape({
    id: 'shape',
    pageId: 'page-1',
    layerId: 'layer-main',
    name: 'shape',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    richText: {
      runs: [{ text, bold: true, fontSize: 16, color: '#ffffff' }],
      autoFit: 'none',
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      verticalAlign: 'middle',
      rotation: 0,
    },
    vector: { kind: 'rectangle' },
  });
}

describe('Draw text layout', () => {
  it('reads the plain text of an object, falling back to its name', () => {
    expect(drawObjectPlainText(shapeWithText('Hello'))).toBe('Hello');
    const noText = createVectorShape({
      id: 'bare', pageId: 'page-1', layerId: 'layer-main', name: 'Bare',
      x: 0, y: 0, width: 10, height: 10, rotation: 0, flipX: false, flipY: false,
      opacity: 1, locked: false, zIndex: 0, vector: { kind: 'rectangle' },
    });
    expect(drawObjectPlainText(noText)).toBe('Bare');
    expect(drawObjectFontSize(noText)).toBe(DEFAULT_DRAW_FONT_SIZE);
    expect(drawObjectFontSize(shapeWithText('x'))).toBe(16);
  });

  it('wraps on word boundaries and preserves explicit line breaks', () => {
    // maxWidth 100 at 16px allows floor(100 / 8.8) = 11 characters per line.
    const lines = wrapDrawText('alpha beta gamma delta', 100, 16);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(11);
    expect(lines.join(' ')).toContain('alpha');
    expect(lines.join(' ')).toContain('delta');
    expect(wrapDrawText('one\ntwo', 1000, 16)).toEqual(['one', 'two']);
    expect(wrapDrawText('', 100, 16)).toEqual(['']);
    expect(wrapDrawText('a\n\nb', 1000, 16)).toEqual(['a', '', 'b']);
  });

  it('hard-breaks a single token that is wider than the line', () => {
    const lines = wrapDrawText('aaaaaaaaaaaaaaaaaaaaaaaa', 80, 16);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(Math.floor(80 / (16 * 0.55)));
    expect(lines.join('')).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('measures deterministically and consistently with the wrap result', () => {
    const measured = measureDrawText('alpha beta gamma', 100, 16);
    expect(measured.lines).toEqual(wrapDrawText('alpha beta gamma', 100, 16));
    expect(measured.height).toBeGreaterThanOrEqual(measured.lines.length * 16);
    const wider = measureDrawText('alpha beta gamma', 400, 16);
    expect(wider.lines.length).toBeLessThanOrEqual(measured.lines.length);
    expect(drawTextMeasureFunction(100)('alpha', 16)).toEqual({
      width: measureDrawText('alpha', 100, 16).width,
      height: measureDrawText('alpha', 100, 16).height,
    });
  });

  it('rejects invalid widths and oversized text instead of producing NaN', () => {
    expect(() => wrapDrawText('x', 0, 16)).toThrowError(DrawModelError);
    expect(() => wrapDrawText('x', -1, 16)).toThrowError(DrawModelError);
    expect(() => wrapDrawText(42 as never, 100, 16)).toThrowError(DrawModelError);
    expect(() => measureDrawText('x', Number.NaN, 16)).toThrowError(DrawModelError);
    expect(() => setDrawObjectPlainText(shapeWithText('x'), 42 as never)).toThrowError(DrawModelError);
    expect(() => setDrawObjectPlainText(shapeWithText('x'), 'y'.repeat(600 * 1024))).toThrowError(DrawModelError);
  });

  it('commits direct text editing while keeping the run styling and normalizing the result', () => {
    const source = shapeWithText('before');
    const next = setDrawObjectPlainText(source, 'after');
    expect(next.richText?.runs).toHaveLength(1);
    expect(next.richText?.runs[0]).toMatchObject({ text: 'after', bold: true, fontSize: 16, color: '#ffffff' });
    expect(next.richText?.padding).toEqual({ top: 4, right: 4, bottom: 4, left: 4 });
    // The original object is never mutated in place.
    expect(source.richText?.runs[0]?.text).toBe('before');
  });

  it('grows the shape only when autoFit is resize-shape, and shrinks the font for shrink', () => {
    const resize = setDrawObjectPlainText(shapeWithText('word '.repeat(40), 40, 20), 'word '.repeat(40), { autoFit: 'resize-shape' });
    expect(resize.height).toBeGreaterThan(20);
    const shrink = setDrawObjectPlainText(shapeWithText('word '.repeat(40), 40, 20), 'word '.repeat(40), { autoFit: 'shrink' });
    expect(shrink.width).toBe(40);
    expect(shrink.height).toBe(20);
    expect(shrink.richText!.runs[0]!.fontSize!).toBeLessThan(16);
    expect(shrink.richText!.runs[0]!.fontSize!).toBeGreaterThanOrEqual(4);
    const none = setDrawObjectPlainText(shapeWithText('x', 40, 20), 'a very long piece of text indeed', { autoFit: 'none' });
    expect(none.width).toBe(40);
    expect(none.richText!.runs[0]!.fontSize).toBe(16);
  });

  it('creates usable rich text for a shape that had none', () => {
    const bare = createVectorShape({
      id: 'bare', pageId: 'page-1', layerId: 'layer-main', name: 'Bare',
      x: 0, y: 0, width: 120, height: 60, rotation: 0, flipX: false, flipY: false,
      opacity: 1, locked: false, zIndex: 0, vector: { kind: 'rectangle' },
    });
    const next = setDrawObjectPlainText(bare, 'Typed');
    expect(next.richText?.runs[0]?.text).toBe('Typed');
    expect(next.richText?.autoFit).toBe('shrink');
    expect(next.richText?.verticalAlign).toBe('middle');
    expect(next.richText?.padding).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
  });
});
