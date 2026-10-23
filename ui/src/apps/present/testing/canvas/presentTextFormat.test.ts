// BATCH-PRESENT — pure text formatting applied to the visible selection (Paket 5).
import { describe, expect, it } from 'vitest';
import type { PresentSceneObject, PresentTextSceneObject } from '../../../../shared/contracts/workspace';
import {
  PRESENT_FONT_SIZE_MAX_PT,
  PRESENT_FONT_SIZE_MIN_PT,
  PRESENT_LINE_HEIGHT_MAX,
  PRESENT_LINE_HEIGHT_MIN,
  applyPresentTextFormat,
  normalizePresentFontFamily,
  normalizePresentLineHeight,
} from '../../canvas/model/presentTextFormat';
import { readPresentTextStyle } from '../../canvas/model/presentObjectExtensions';

const text = (id: string, patch: Partial<PresentTextSceneObject> = {}): PresentTextSceneObject => ({
  id,
  kind: 'text',
  text: id,
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 10,
  fontSizePt: 18,
  color: '#ffffff',
  zIndex: 1,
  ...patch,
});

const shape = (id: string): PresentSceneObject => ({
  id,
  kind: 'shape',
  shape: 'rectangle',
  fillColor: '#111111',
  strokeColor: '#222222',
  strokeWidth: 1,
  xPercent: 0,
  yPercent: 0,
  widthPercent: 10,
  heightPercent: 10,
  zIndex: 1,
});

describe('applyPresentTextFormat', () => {
  it('applies font size, weight, alignment, line spacing and family to every selected text object', () => {
    const objects = [text('a'), text('b'), shape('s')];
    const result = applyPresentTextFormat(objects, ['a', 'b'], {
      fontSizePt: 30,
      fontWeight: 'bold',
      textAlign: 'center',
      lineHeight: 1.75,
      fontFamily: 'Georgia, serif',
    });
    expect(result.changedIds).toEqual(['a', 'b']);
    for (const object of result.objects.slice(0, 2) as PresentTextSceneObject[]) {
      expect(object.fontSizePt).toBe(30);
      expect(object.fontWeight).toBe('bold');
      expect(object.textAlign).toBe('center');
      expect(readPresentTextStyle(object)).toEqual({ lineHeight: 1.75, fontFamily: 'Georgia, serif' });
    }
  });

  it('never touches an object outside the visible selection', () => {
    const objects = [text('a'), text('b')];
    const result = applyPresentTextFormat(objects, ['a'], { fontSizePt: 40 });
    expect(result.changedIds).toEqual(['a']);
    expect((result.objects[1] as PresentTextSceneObject).fontSizePt).toBe(18);
  });

  it('reports non-text and locked objects instead of pretending they were formatted', () => {
    const objects = [text('a'), shape('s'), text('locked', { locked: true })];
    const result = applyPresentTextFormat(objects, ['a', 's', 'locked'], { color: '#ff0000' });
    expect(result.changedIds).toEqual(['a']);
    expect(result.skippedNonTextIds).toEqual(['s']);
    expect((result.objects[2] as PresentTextSceneObject).color).toBe('#ffffff');
  });

  it('drops invalid values field by field instead of storing them', () => {
    const objects = [text('a')];
    const result = applyPresentTextFormat(objects, ['a'], {
      fontSizePt: Number.NaN,
      lineHeight: 99,
      fontFamily: 'Evil"; background:url(x)',
      color: 'not-a-colour',
    });
    const formatted = result.objects[0] as PresentTextSceneObject;
    expect(formatted.fontSizePt).toBe(18);
    expect(formatted.color).toBe('#ffffff');
    const style = readPresentTextStyle(formatted);
    expect(style.lineHeight).toBe(PRESENT_LINE_HEIGHT_MAX);
    // The font stack must not be able to break out of the CSS property value: a colon, semicolon or
    // parenthesis would allow a second declaration. Quotes stay, because "Times New Roman" is legal.
    expect(style.fontFamily ?? '').not.toMatch(/[;:(){}]/);
    expect(style.fontFamily ?? '').toContain('Evil');
    // Nothing was changed except the two clamped/accepted fields, so the call is not silent.
    expect(result.changedIds).toEqual(['a']);
  });

  it('clamps sizes and line heights to the documented bounds', () => {
    expect(normalizePresentLineHeight(0.01)).toBe(PRESENT_LINE_HEIGHT_MIN);
    expect(normalizePresentLineHeight(100)).toBe(PRESENT_LINE_HEIGHT_MAX);
    expect(normalizePresentLineHeight('abc')).toBeUndefined();
    const tiny = applyPresentTextFormat([text('a')], ['a'], { fontSizePt: 1 }).objects[0] as PresentTextSceneObject;
    expect(tiny.fontSizePt).toBe(PRESENT_FONT_SIZE_MIN_PT);
    const huge = applyPresentTextFormat([text('a')], ['a'], { fontSizePt: 10_000 }).objects[0] as PresentTextSceneObject;
    expect(huge.fontSizePt).toBe(PRESENT_FONT_SIZE_MAX_PT);
  });

  it('bounds a hostile font stack read back from a document', () => {
    const hostile = { ...text('a'), fontFamily: 'x'.repeat(10_000) } as unknown as PresentTextSceneObject;
    const style = readPresentTextStyle(hostile);
    expect((style.fontFamily ?? '').length).toBeLessThanOrEqual(128);
    expect(normalizePresentFontFamily('{}')).toBeUndefined();
  });

  it('reports no change when the format already matches', () => {
    const objects = [text('a', { fontSizePt: 30, fontWeight: 'bold' })];
    const result = applyPresentTextFormat(objects, ['a'], { fontSizePt: 30, fontWeight: 'bold' });
    expect(result.changedIds).toEqual([]);
  });
});
