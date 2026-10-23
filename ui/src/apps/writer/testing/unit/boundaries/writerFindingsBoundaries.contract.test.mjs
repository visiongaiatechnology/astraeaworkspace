// STATUS: DIAMANT — the source contracts of the findings pass (W-062 + W-063/W-061 wiring)
//
// Why a separate `.mjs`: this repository's `.ts` test files have **no** Node type declarations, so
// `import { readFileSync } from 'node:fs'` fails `tsc -b` (measured: three TS2307 errors). Source
// contracts that read files therefore live in `.mjs` files, like the other contract tests here.
//
// Each assertion states what the source must say, and why the test is weaker than a behavioural one.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
/** From `apps/writer/testing/unit/boundaries/` up to `apps/`. */
const APPS = resolve(HERE, '../../../..');

function readWriterSource(relativePath) {
  return readFileSync(resolve(APPS, 'writer', relativePath), 'utf8');
}

/** Removes comments so a sentence about a removed constant is not read as the constant. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('W-062 — the pixel limit is derived, not a second number', () => {
  it('computes MAX_PIXEL_COUNT from the decode budget', () => {
    const code = stripComments(readWriterSource('media/images/import/writerImageImport.ts'));
    expect(code).toContain('const MAX_PIXEL_COUNT = Math.floor(');
    // The old shape was a literal; a literal cannot be related to the memory budget.
    expect(code).not.toMatch(/const MAX_PIXEL_COUNT = \d/);
    // And the derivation names the two factors it uses, so the relation is readable.
    expect(code).toContain('BYTES_PER_RGBA_PIXEL');
    expect(code).toContain('DECODE_WORKING_COPY_FACTOR');
  });

  it('derives it from MAX_DECODE_BYTES, not from a third constant', () => {
    const code = stripComments(readWriterSource('media/images/import/writerImageImport.ts'));
    expect(code).toMatch(/MAX_PIXEL_COUNT = Math\.floor\(MAX_DECODE_BYTES \//);
  });
});

describe('W-061 — the declared MIME is compared case-insensitively', () => {
  it('lower-cases the declared type before comparing it to the signature', () => {
    const code = stripComments(readWriterSource('media/images/import/writerImageImport.ts'));
    expect(code).toContain('declaredMime.toLowerCase() !== detectedMime');
    // The signature check itself must stay strict: only the declared string is normalised.
    expect(code).toContain('detectWriterImageMime(header)');
    expect(code).not.toContain('detectedMime.toLowerCase()');
  });
});

describe('W-065 / W-063 — the bounds stay wired where the content arrives', () => {
  it('keeps the alt-text rule on both paths and the budget before the write', () => {
    const state = stripComments(readWriterSource('editor/useWriterState.ts'));
    expect(state).toContain('validateWriterImageAltText(image.altText)');
    expect(state).toContain('wouldExceedWriterImageBudget(images, image)');
    const budgetIndex = state.indexOf('wouldExceedWriterImageBudget(images, image)');
    // Native round 6: the image is written together with the follow-up paragraph, from the
    // `nextImages` value — the budget check still has to happen first.
    const persistIndex = Math.min(...[
      state.indexOf('persistWriterData({ images: nextImages })'),
      state.indexOf('persistParagraphs(plan.paragraphs, { images: nextImages })'),
    ].filter((index) => index >= 0));
    expect(budgetIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(budgetIndex);
  });
});
