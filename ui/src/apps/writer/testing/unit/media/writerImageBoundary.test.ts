// STATUS: DIAMANT — the Writer image boundary: one rule for wrap mode, size and alt text
//
// Findings measured here: W-057 (wrap mode normalised on write), W-063 (a limit for the **sum** of
// images), W-065 (alt text validated instead of silently stored or truncated).
//
// Every assertion in this file failed before the fix — see the notes of AST-0118, AST-0123 and
// AST-0124 for the exact red run.
import { describe, expect, it } from 'vitest';

import type { WriterImageBlockData } from '../../../../../shared/contracts/workspace';
import {
  measureWriterDocumentImageBytes,
  measureWriterImageBytes,
  normalizeWriterImageForWrite,
  normalizeWriterImagesForWrite,
  resolveWriterImageBudget,
  resolveWriterImageWrapMode,
  validateWriterImageAltText,
  validateWriterImageCaption,
  wouldExceedWriterImageBudget,
  writerImageAltTextPrompt,
  WRITER_IMAGE_MAX_ALT_TEXT_LENGTH,
  WRITER_IMAGE_MAX_CAPTION_LENGTH,
  WRITER_IMAGE_MAX_DOCUMENT_BYTES,
  WRITER_IMAGE_MAX_OUTPUT_BYTES,
} from '../../../../writer/media/images/operations/writerImageBoundary';

const DATA_URL_PREFIX = 'data:image/png;base64,';

/**
 * Builds a data URL whose **measured** size is exactly `measuredBytes`.
 *
 * The measurement is the ground truth, so the fixture is inverted from its formula instead of guessed
 * (my first three versions guessed and produced red runs that had nothing to do with the code under
 * test — recorded in the notes rather than hidden).
 *
 *   measure(dataUrl) = ceil(payloadChars * 3 / 4) + headerBytes
 *
 * so with `payloadChars = 4k` the measured size is `3k + 22`, and for an arbitrary target the
 * payload has to be padded up. `dataUrlWithBytes` below takes the target and floors the measured result
 * onto `22 + 3k`, which is the set the other tests work with.
 */
function dataUrlWithBytes(bytes: number): string {
  return `${DATA_URL_PREFIX}${'A'.repeat(Math.ceil(bytes / 4) * 4)}`;
}

/** The measured size of the fixture produced by `dataUrlWithBytes(bytes)`. */
function measuredSizeOf(bytes: number): number {
  return DATA_URL_PREFIX.length + Math.ceil(bytes / 4) * 3;
}

/** The fixture whose measured size is exactly `22 + 3k`, for `k >= 1`. */
function dataUrlWithMeasuredSteps(steps: number): string {
  if (!Number.isInteger(steps) || steps <= 0) throw new Error(`unreachable step count ${steps}`);
  return `${DATA_URL_PREFIX}${'A'.repeat(steps * 4)}`;
}

/** The measured size of `dataUrlWithMeasuredSteps(steps)`. */
function measuredStepsToBytes(steps: number): number {
  return DATA_URL_PREFIX.length + steps * 3;
}

describe('the byte measurement itself (the basis of every budget assertion below)', () => {
  it('charges the base64 payload and the header, and is monotone', () => {
    // The fixture is inverted from the formula, so the measurement is checked against itself.
    for (const bytes of [4, 1024, 2048, 4096, 100_004]) {
      expect(measureWriterImageBytes({ dataUrl: dataUrlWithBytes(bytes) })).toBe(measuredSizeOf(bytes));
    }
    // 2048 payload bytes -> 2048 base64 characters -> 1536 + 22.
    expect(measureWriterImageBytes({ dataUrl: dataUrlWithBytes(2048) })).toBe(1558);
    expect(measureWriterImageBytes({ dataUrl: '' })).toBe(0);
    let previous = 0;
    for (const bytes of [4, 1024, 4096, 100_004]) {
      const measured = measureWriterImageBytes({ dataUrl: dataUrlWithBytes(bytes) });
      expect(measured).toBeGreaterThan(previous);
      previous = measured;
    }
  });
});

function image(overrides: Partial<WriterImageBlockData> = {}): WriterImageBlockData {
  return {
    id: 'img-1',
    name: 'Schaubild.png',
    dataUrl: dataUrlWithBytes(1024),
    intrinsicWidth: 640,
    intrinsicHeight: 480,
    widthPercent: 70,
    alignment: 'center',
    ...overrides,
  };
}

describe('W-057 — the wrap mode the layout resolves is written down', () => {
  it('resolves an absent mode from the placement, exactly as the layout does', () => {
    expect(resolveWriterImageWrapMode(image())).toBe('inline');
    expect(resolveWriterImageWrapMode(image({ placement: 'block' }))).toBe('inline');
    expect(resolveWriterImageWrapMode(image({ placement: 'float-left' }))).toBe('square');
    expect(resolveWriterImageWrapMode(image({ placement: 'float-right' }))).toBe('square');
  });

  it('never overrides a mode the user chose', () => {
    for (const wrapMode of ['inline', 'square', 'tight', 'through', 'top-bottom', 'behind-text', 'in-front-of-text'] as const) {
      expect(resolveWriterImageWrapMode(image({ wrapMode, placement: 'float-left' }))).toBe(wrapMode);
      expect(normalizeWriterImageForWrite(image({ wrapMode, placement: 'float-left' })).wrapMode).toBe(wrapMode);
    }
  });

  it('adds the field an image stored without one', () => {
    const stored = normalizeWriterImageForWrite(image({ placement: 'float-right' }));
    expect(stored.wrapMode).toBe('square');
    // The field is added, nothing else is rewritten.
    expect(stored.dataUrl).toBe(image().dataUrl);
    expect(stored.alignment).toBe('center');
    expect(stored.widthPercent).toBe(70);
  });

  it('is idempotent, so a second save writes the same bytes', () => {
    const once = normalizeWriterImageForWrite(image({ placement: 'float-left' }));
    const twice = normalizeWriterImageForWrite(once);
    expect(twice).toEqual(once);
    // Identity is kept where nothing had to change: no needless document churn on every save.
    expect(twice).toBe(once);
    const alreadyCanonical = image({ wrapMode: 'inline' });
    expect(normalizeWriterImageForWrite(alreadyCanonical)).toBe(alreadyCanonical);
  });

  it('normalises a whole document without changing the length or the order', () => {
    const images = [
      image({ id: 'a', placement: 'float-left' }),
      image({ id: 'b', wrapMode: 'tight' }),
      image({ id: 'c' }),
    ];
    const normalized = normalizeWriterImagesForWrite(images);
    expect(normalized.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(normalized.map((entry) => entry.wrapMode)).toEqual(['square', 'tight', 'inline']);
    expect(normalized[1]).toBe(images[1]);
  });
});

describe('W-063 — the sum of the images is bounded, not only each one', () => {
  it('measures the stored payload, header included', () => {
    // base64 stores 3 bytes per 4 characters, so the measured size is 3/4 of the payload plus the
    // header — the number the document budget is charged.
    const measured = measureWriterImageBytes({ dataUrl: dataUrlWithBytes(3000) });
    expect(measured).toBe(measuredSizeOf(3000));
    expect(measured).toBe(2250 + DATA_URL_PREFIX.length);
    expect(measured).toBeGreaterThanOrEqual(Math.floor(3000 * 3 / 4));
    expect(measureWriterImageBytes({ dataUrl: '' })).toBe(0);
  });

  it('sums the whole document', () => {
    const images = [
      image({ id: 'a', dataUrl: dataUrlWithMeasuredSteps(1000) }),
      image({ id: 'b', dataUrl: dataUrlWithMeasuredSteps(2000) }),
    ];
    expect(measureWriterDocumentImageBytes(images))
      .toBe(measuredStepsToBytes(1000) + measuredStepsToBytes(2000));
    expect(measureWriterDocumentImageBytes([])).toBe(0);
  });

  it('refuses the image that would exceed the document budget', () => {
    // Both fixtures come from the measurable set (`22 + 3k`), so this test is about the budget rule and
    // not about base64 rounding.
    const firstSteps = 683;
    const first = image({ dataUrl: dataUrlWithMeasuredSteps(firstSteps) });
    const used = measureWriterDocumentImageBytes([first]);
    expect(used).toBe(measuredStepsToBytes(firstSteps));
    // Four steps of headroom: those four fit, a fifth does not.
    const limit = used + measuredStepsToBytes(4);
    expect(wouldExceedWriterImageBudget([first], { dataUrl: dataUrlWithMeasuredSteps(4) }, limit)).toBe(false);
    expect(wouldExceedWriterImageBudget([first], { dataUrl: dataUrlWithMeasuredSteps(5) }, limit)).toBe(true);
  });

  it('refuses the image that would exceed the real document budget', () => {
    const steps = Math.floor((WRITER_IMAGE_MAX_DOCUMENT_BYTES - DATA_URL_PREFIX.length) / 3);
    const full = [image({ dataUrl: dataUrlWithMeasuredSteps(steps) })];
    expect(measureWriterDocumentImageBytes(full)).toBeLessThanOrEqual(WRITER_IMAGE_MAX_DOCUMENT_BYTES);
    expect(WRITER_IMAGE_MAX_DOCUMENT_BYTES - measureWriterDocumentImageBytes(full)).toBeLessThan(3);
    expect(wouldExceedWriterImageBudget(full, { dataUrl: dataUrlWithMeasuredSteps(1) })).toBe(true);
    expect(wouldExceedWriterImageBudget([], { dataUrl: dataUrlWithMeasuredSteps(1) })).toBe(false);
    expect(wouldExceedWriterImageBudget([image({ dataUrl: dataUrlWithMeasuredSteps(1) })], { dataUrl: dataUrlWithMeasuredSteps(1) })).toBe(false);
  });

  it('reports the remaining budget for the surface that has to show it', () => {
    const budget = resolveWriterImageBudget([image({ dataUrl: dataUrlWithMeasuredSteps(1000) })], 10_000);
    expect(budget.usedBytes).toBe(measuredStepsToBytes(1000));
    expect(budget.remainingBytes).toBe(10_000 - budget.usedBytes);
    expect(budget.overBudget).toBe(false);
    expect(resolveWriterImageBudget([image({ dataUrl: dataUrlWithMeasuredSteps(4000) })], 10_000).overBudget).toBe(true);
    // Never negative: the surface shows "nothing left", not a negative number.
    expect(resolveWriterImageBudget([image({ dataUrl: dataUrlWithMeasuredSteps(4000) })], 10_000).remainingBytes).toBe(0);
  });

  it('keeps the document budget a whole number of maximum images', () => {
    expect(WRITER_IMAGE_MAX_DOCUMENT_BYTES).toBe(3 * WRITER_IMAGE_MAX_OUTPUT_BYTES);
  });
});

describe('W-065 — alt text is validated instead of stored unchecked', () => {
  it('treats whitespace as absent, not as a description', () => {
    expect(validateWriterImageAltText('   ')).toEqual({ ok: true, value: undefined });
    expect(validateWriterImageAltText(undefined)).toEqual({ ok: true, value: undefined });
    expect(validateWriterImageAltText(null)).toEqual({ ok: true, value: undefined });
  });

  it('keeps a usable description and trims it', () => {
    expect(validateWriterImageAltText('  Verlauf der Kennzahlen  ')).toEqual({
      ok: true,
      value: 'Verlauf der Kennzahlen',
    });
  });

  it('accepts exactly the limit and refuses one character more, with a named reason', () => {
    const atLimit = 'a'.repeat(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH);
    expect(validateWriterImageAltText(atLimit).ok).toBe(true);
    const tooLong = validateWriterImageAltText('a'.repeat(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH + 1));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.message).toContain(String(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH));
  });

  it('holds the caption to the same shape of rule', () => {
    expect(validateWriterImageCaption('  ').ok).toBe(true);
    expect(validateWriterImageCaption('a'.repeat(WRITER_IMAGE_MAX_CAPTION_LENGTH)).ok).toBe(true);
    expect(validateWriterImageCaption('a'.repeat(WRITER_IMAGE_MAX_CAPTION_LENGTH + 1)).ok).toBe(false);
  });

  it('names the missing description as the question the dialog has to ask', () => {
    expect(writerImageAltTextPrompt(image({ altText: 'Quartalsverlauf' }))).toBeNull();
    expect(writerImageAltTextPrompt(image({ altText: undefined }))).toContain('Alternativtext');
    expect(writerImageAltTextPrompt(image({ altText: 'a'.repeat(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH + 1) })))
      .toContain(String(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH));
  });
});
