import { describe, expect, it } from 'vitest';
import { WHITEBOARD_IMAGE_MAX_BYTES } from '../../model/whiteboardObjectEngine';
import { renderWhiteboardProjectionToSvg } from '../../interchange/whiteboardSvgRenderProjection';
import type { WhiteboardItem } from '../../types';

const item = (id: string, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 80,
  height: 48,
  text: id,
  ...overrides,
} as WhiteboardItem);

describe('Whiteboard SVG render projection resource boundaries', () => {
  it('keeps a small allowlisted embedded image and validates the resulting SVG', () => {
    const svg = renderWhiteboardProjectionToSvg('Bounded', [item('safe-image', {
      type: 'image',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    })]);

    expect(svg).toContain('href="data:image/png;base64,iVBORw0KGgo="');
    expect(svg).toContain('fill="url(#dotGrid)"');
  });

  it('renders oversized or malformed image data as a text card without embedding it', () => {
    const maximumEncodedLength = 4 * Math.ceil(WHITEBOARD_IMAGE_MAX_BYTES / 3);
    const invalidDataUrl = `data:image/png;base64,${'A'.repeat(maximumEncodedLength + 4)}`;
    const svg = renderWhiteboardProjectionToSvg('Bounded', [item('oversized-image', {
      type: 'image',
      name: 'Oversized local image',
      dataUrl: invalidDataUrl,
    })]);

    expect(svg).toContain('Oversized local image');
    expect(svg).not.toContain('data:image/png;base64');
  });

  it('rejects ink strokes above the shared point ceiling before constructing a path', () => {
    const points = Array.from({ length: 4_097 }, (_, index) => ({
      x: index,
      y: index,
      t: index,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
    }));

    expect(() => renderWhiteboardProjectionToSvg('Bounded', [item('oversized-ink', {
      type: 'ink',
      ink: {
        preset: 'pen',
        inputType: 'mouse',
        points,
        color: '#60a5fa',
        width: 2,
        opacity: 1,
      },
    })])).toThrow('Whiteboard SVG ink stroke exceeds the point policy');
  });

  it('rejects malformed ink points and clamps hostile visual parameters', () => {
    const malformed = item('invalid-ink', {
      type: 'ink',
      ink: {
        preset: 'pen',
        inputType: 'mouse',
        points: [{ x: Number.NaN, y: 0, t: 0, pressure: 0.5, tiltX: 0, tiltY: 0 }],
        color: '#60a5fa',
        width: 2,
        opacity: 1,
      },
    });
    expect(() => renderWhiteboardProjectionToSvg('Bounded', [malformed]))
      .toThrow('Whiteboard SVG ink point is invalid');

    const bounded = renderWhiteboardProjectionToSvg('Bounded', [item('clamped-ink', {
      type: 'ink',
      ink: {
        preset: 'pen',
        inputType: 'mouse',
        points: [{ x: 0, y: 0, t: 0, pressure: 10, tiltX: 180, tiltY: -180 }],
        color: 'url(https://attacker.invalid/paint)',
        width: 2,
        opacity: 3,
      },
    })]);
    expect(bounded).toContain('stroke="#60a5fa"');
    expect(bounded).toContain('stroke-opacity="1"');
    expect(bounded).not.toContain('attacker.invalid');
  });

  it('enforces the same element ceiling as the local SVG parser while appending output', () => {
    const objects = Array.from({ length: 3_400 }, (_, index) => item(`element-${index}`));

    expect(() => renderWhiteboardProjectionToSvg('Bounded', objects))
      .toThrow('Whiteboard SVG output exceeds the element policy');
  });

  // W-300: this test builds two data URLs at the image byte ceiling and measures the joined SVG, which is
  // legitimately heavy work. With the default five seconds it passed on its own (1.6 s) and timed out in the
  // full suite, where every worker also pays for module transforms — so the suite went red for a reason that
  // had nothing to do with the code under test. A red suite that cannot be told apart from a real regression
  // is worse than a slow test, so the limit is raised explicitly instead of the ceiling being lowered.
  it('enforces the SVG byte ceiling before joining a multi-image export', { timeout: 30_000 }, () => {
    const maximumEncodedLength = 4 * Math.ceil(WHITEBOARD_IMAGE_MAX_BYTES / 3);
    const boundedDataUrl = `data:image/png;base64,${'A'.repeat(maximumEncodedLength)}`;
    const images = [
      item('large-image-a', { type: 'image', dataUrl: boundedDataUrl }),
      item('large-image-b', { type: 'image', dataUrl: boundedDataUrl }),
    ];

    expect(() => renderWhiteboardProjectionToSvg('Bounded', images))
      .toThrow('Whiteboard SVG output exceeds the byte policy');
  });
});
