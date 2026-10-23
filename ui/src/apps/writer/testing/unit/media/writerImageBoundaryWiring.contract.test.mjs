// STATUS: DIAMANT — one definition of the Writer image wrap mode, and it is applied on write
//
// W-057 had two halves and both are pinned here:
//
//   1. "is the layout's resolution of an absent `wrapMode` written down on save?" — checked in the
//      persistence boundary, and checked against the **rendered** fallback logic being absent from the
//      layout module. The layout used to answer this question itself.
//   2. "is there still only one definition?" — the resolver must exist in exactly one module. A second
//      copy is what made a fix here miss a call site there.
//
// Comments are stripped before asserting on absence, so a sentence **about** the removed rule does not
// read as the rule itself. This is a source contract because the environment has no DOM runner; it is
// weaker than a behavioural test and the notes say so.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../../..');

function readSource(relativePath) {
  return readFileSync(resolve(SRC, relativePath), 'utf8');
}

/** Removes line and block comments so a note about old behaviour is not read as the behaviour. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const BOUNDARY = 'apps/writer/media/images/operations/writerImageBoundary.ts';
const FLOW_LAYOUT = 'apps/writer/layout/pagination/media/writerMediaFlowLayout.ts';
const MEDIA_OPERATIONS = 'apps/writer/media/images/operations/writerMediaOperations.ts';
const PERSISTENCE = 'apps/writer/persistence/useWriterPersistence.ts';

describe('W-057 — the wrap-mode resolution exists once', () => {
  it('defines it in the boundary module and nowhere else', () => {
    const boundary = stripComments(readSource(BOUNDARY));
    expect(boundary).toContain('export function resolveWriterImageWrapMode(');

    for (const consumer of [FLOW_LAYOUT, MEDIA_OPERATIONS]) {
      const source = stripComments(readSource(consumer));
      expect(source, `${consumer} must not define its own resolver`).not.toContain(
        'function resolveWriterImageWrapMode(',
      );
    }
  });

  it('leaves no second `placement`-to-mode fallback in the layout or the media operations', () => {
    // The old copies looked exactly like this. The shape is asserted, not the word "wrapMode", so a
    // renamed variable cannot hide a second rule.
    const fallback = /placement\s*===\s*'float-(left|right)'\s*\?\s*'square'/;
    for (const consumer of [FLOW_LAYOUT, MEDIA_OPERATIONS]) {
      expect(stripComments(readSource(consumer)), `${consumer} must not re-derive the fallback`).not.toMatch(fallback);
    }
  });
});

describe('W-057 — the mode the layout resolves is written down', () => {
  it('normalises the images on the persistence boundary', () => {
    const persistence = stripComments(readSource(PERSISTENCE));
    expect(persistence).toContain('normalizeWriterImagesForWrite');
    // The images the document is saved with go through the normalisation, not the raw list.
    expect(persistence).toMatch(/images:\s*normalizeWriterImagesForWrite\(/);
    expect(persistence).not.toMatch(/images:\s*patch\.images\s*\?\?\s*images,/);
  });

  it('keeps the compatibility re-export, so the existing callers keep one import site', () => {
    // The four render layers and the pagination measurement import the resolver from the layout module.
    // That is allowed only because the layout re-exports the canonical function **as a local binding**
    // (an `export { x } from '...'` would not define `x` for this module's own use — that mistake was
    // made and measured here: "ReferenceError: resolveWriterImageWrapMode is not defined").
    const layout = stripComments(readSource(FLOW_LAYOUT));
    expect(layout).toContain("import { resolveWriterImageWrapMode } from '../../../media/images/operations/writerImageBoundary';");
    expect(layout).toContain('export { resolveWriterImageWrapMode };');
    // And the module still uses it itself, so the re-export cannot be the only mention.
    expect(layout).toContain('const mode = resolveWriterImageWrapMode(image);');
  });
});

describe('W-063 / W-065 — the bounds are enforced where the content arrives', () => {
  it('checks the document budget before the image is written', () => {
    const state = stripComments(readSource('apps/writer/editor/useWriterState.ts'));
    expect(state).toContain('wouldExceedWriterImageBudget(images, image)');
    // The refusal happens before the write, so nothing is added. Native round 6 moved the
    // write into the shared `nextImages` value (the image and the follow-up paragraph are
    // one transaction), so the contract names both accepted write forms.
    const budgetIndex = state.indexOf('wouldExceedWriterImageBudget(images, image)');
    const persistIndex = Math.min(...[
      state.indexOf('persistWriterData({ images: nextImages })'),
      state.indexOf('persistParagraphs(plan.paragraphs, { images: nextImages })'),
    ].filter((index) => index >= 0));
    expect(budgetIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(budgetIndex);
  });

  it('validates alt text on the insert path and in the dialog', () => {
    expect(stripComments(readSource('apps/writer/editor/useWriterState.ts'))).toContain('validateWriterImageAltText(image.altText)');
    const modal = stripComments(readSource('apps/writer/media/images/WriterImagePropertiesModal.tsx'));
    expect(modal).toContain('validateWriterImageAltText(altText)');
    expect(modal).toContain('validateWriterImageCaption(caption)');
    // An invalid value keeps the dialog open: the patch is not applied on that path.
    expect(modal).toMatch(/if \(!altVerdict\.ok\) \{[\s\S]*?return;/);
  });

  it('shows both limits where the text is typed', () => {
    const tabs = stripComments(readSource('apps/writer/media/images/WriterImageModalTabs.tsx'));
    expect(tabs).toContain('maxLength={WRITER_IMAGE_MAX_ALT_TEXT_LENGTH}');
    expect(tabs).toContain('maxLength={WRITER_IMAGE_MAX_CAPTION_LENGTH}');
  });
});
