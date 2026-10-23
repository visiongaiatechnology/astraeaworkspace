// @vitest-environment happy-dom
// STATUS: PLATIN — SEC-03 hardening for the round-41 Present style extensions.
//
// Style payloads are read from documents that may be foreign or hand-edited. Colours and the
// slide background image end up in CSS, so a hostile document must never be able to inject
// arbitrary CSS/URLs: every invalid value is dropped and the kind default wins.
import { describe, expect, it } from 'vitest';
import {
  presentCardStyleCss,
  presentObjectStyleCss,
  presentSlideBackgroundCss,
  readPresentCardStyle,
  readPresentObjectStyle,
  readPresentSlideBackgroundStyle,
  resolvePresentObjectStyle,
} from '../../contracts/presentStyle';

describe('Present style extension — hostile document input', () => {
  it('drops colour values that are not plain CSS colour tokens', () => {
    const style = readPresentObjectStyle({
      kind: 'text',
      presentStyle: {
        textColor: 'red; background: url(https://evil.example/x)',
        backgroundColor: 'expression(alert(1))',
        border: { color: 'red;position:fixed', width: 2, radius: 4 },
        shadow: { color: 'url(javascript:alert(1))', blurPx: 8, offsetXPx: 1, offsetYPx: 1 },
        backgroundGradient: { from: 'url(https://evil.example/y)', to: '#ffffff', angle: 45 },
      },
    });
    expect(style.textColor).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
    expect(style.border?.color).toBe('#94a3b8');
    expect(style.shadow?.color).toBe('rgba(0,0,0,0.35)');
    expect(style.backgroundGradient, 'ein Gradient mit ungültigem Stop wird verworfen').toBeUndefined();
    const css = presentObjectStyleCss(resolvePresentObjectStyle({ kind: 'text', presentStyle: { textColor: 'red; position: fixed' } }));
    expect(JSON.stringify(css)).not.toContain('url(');
    expect(JSON.stringify(css)).not.toContain('position');
  });

  it('accepts ordinary hex/rgb/hsl/oklch colours from the picker', () => {
    const style = readPresentObjectStyle({
      kind: 'shape',
      presentStyle: {
        textColor: '#1e293b',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: { color: 'oklch(0.7 0.1 250)', width: 2, radius: 8 },
        backgroundGradient: { from: '#0f172a', to: 'hsl(220, 30%, 40%)', angle: 90 },
      },
    });
    expect(style.textColor).toBe('#1e293b');
    expect(style.backgroundColor).toBe('rgba(15, 23, 42, 0.85)');
    expect(style.border?.color).toBe('oklch(0.7 0.1 250)');
    expect(style.backgroundGradient?.to).toBe('hsl(220, 30%, 40%)');
  });

  it('rejects a non-image slide background URL and keeps valid data images', () => {
    const hostile = readPresentSlideBackgroundStyle({
      presentBackgroundStyle: { imageDataUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' },
    });
    expect(hostile.imageDataUrl).toBeUndefined();
    const hostileCss = presentSlideBackgroundCss(
      { presentBackgroundStyle: { imageDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' } } as never,
      '#ffffff',
    );
    expect(hostileCss.backgroundImage).toBeUndefined();

    const valid = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const read = readPresentSlideBackgroundStyle({ presentBackgroundStyle: { imageDataUrl: valid } });
    expect(read.imageDataUrl).toBe(valid);
    const css = presentSlideBackgroundCss({ presentBackgroundStyle: { imageDataUrl: valid } } as never, '#ffffff');
    expect(css.backgroundImage).toContain('data:image/png;base64,');
  });

  it('sanitizes card styles and never throws on primitive or array payloads', () => {
    expect(readPresentCardStyle({ presentStyle: { textColor: 'red;x', backgroundColor: 42 } })).toEqual({});
    expect(readPresentCardStyle('not-an-object')).toEqual({});
    expect(JSON.stringify(presentCardStyleCss({ presentStyle: { backgroundColor: 'url(https://evil.example)' } }))).not.toContain('url(');
  });
});
