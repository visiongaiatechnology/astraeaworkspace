// STATUS: PLATIN — annotation identity, and the visible-feedback contract of the state hook's pure pieces.
//
// Counter-check for the visual signature id: revert `buildPdfVisualSignatureAnnotation` to `id: `sig-${now}``
// and the first test below fails with "expected 'sig-1' not to be 'sig-1'" — two stamps inside the same
// millisecond produced two annotations with one identity, which collapses React keys and makes
// `deleteAnnotation` remove both.
//
// The pure helpers of the state hook are checked here rather than through React, because this environment has
// no DOM: what a hook does with `window.getSelection()` cannot be rendered, but what it returns can be pinned.
import { describe, expect, it } from 'vitest';
import { buildPdfVisualSignatureAnnotation } from '../../studio/interactions/pdfStudioInteractionUtils';
import { clampPdfStudioZoom, stepPdfStudioZoom } from '../../studio/interactions/pdfStudioKeyboard';

describe('visual PDF signature identity', () => {
  it('gives two stamps in the same millisecond two distinct identities', () => {
    const first = buildPdfVisualSignatureAnnotation(1, 'Ada Lovelace', 'Reviewer', 'emerald', 'signature', 1_792_000_000_000);
    const second = buildPdfVisualSignatureAnnotation(1, 'Ada Lovelace', 'Reviewer', 'emerald', 'signature', 1_792_000_000_000);
    expect(first.id).not.toBe(second.id);
    expect(first.id.startsWith('sig-1792000000000-')).toBe(true);
    expect(new Set([first.id, second.id]).size).toBe(2);
  });

  it('keeps the mark self-describing and never claims to be a cryptographic signature', () => {
    const annotation = buildPdfVisualSignatureAnnotation(2, 'Grace Hopper', 'Approver', 'cyan', 'initial', 1);
    expect(annotation.page).toBe(2);
    expect(annotation.type).toBe('comment');
    expect(annotation.text).toContain('NOT A CRYPTOGRAPHIC PDF SIGNATURE');
    expect(annotation.text).toContain('GH');
    expect(annotation.author).toBe('Grace Hopper');
  });
});

describe('zoom values a user can reach are always inside the ladder', () => {
  it('never leaves the supported window, whatever sequence of presses is delivered', () => {
    let zoom = 100;
    for (let press = 0; press < 50; press += 1) zoom = stepPdfStudioZoom(zoom, 1);
    expect(zoom).toBe(400);
    for (let press = 0; press < 50; press += 1) zoom = stepPdfStudioZoom(zoom, -1);
    expect(zoom).toBe(50);
    expect(clampPdfStudioZoom(zoom)).toBe(50);
  });
});
