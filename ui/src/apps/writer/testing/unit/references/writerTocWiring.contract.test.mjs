// STATUS: PLATIN — Source contract for the directory's page numbers
//
// The page-number resolution is unit-tested. What no unit test reaches is the **prop
// chain**: W-161 happened because `pages` was optional on the modal and the caller
// simply omitted it, so the directory showed "1" on every line and the user had to run
// a field update afterwards. TypeScript stayed silent because the prop was optional.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const modal = read('../../../references/toc/WriterTocModal.tsx');
const chain = read('../../../editor/modals/WriterReviewAndReferenceModals.tsx');
const allModals = read('../../../editor/modals/WriterAllModals.tsx');
const engine = read('../../../references/toc/writerTocEngine.ts');

describe('Writer directory page-number contract', () => {
  it('requires the pagination instead of accepting its absence', () => {
    // Optional is what allowed the silent omission.
    expect(modal).toContain('pages: readonly WriterPaginationPage[];');
    expect(modal).not.toContain('pages?: readonly WriterPaginationPage[];');
    expect(modal).toContain('**Required on purpose.**');
  });

  it('threads the pagination from the state to the modal', () => {
    expect(allModals).toContain('pages={state.pages}');
    expect(chain).toContain('pages: readonly WriterPaginationPage[];');
    expect(chain).toContain('  pages,');
    expect(chain).toContain('pages={pages}');
  });

  it('uses the pagination for both the preview and the insert', () => {
    // Both calls take the same argument, so what the user sees is what gets inserted.
    expect(modal).toContain('generateTableOfContentsParagraphs(paragraphs, pages, options)');
    expect(modal).toContain('updateOrInsertTableOfContents(paragraphs, pages, options)');
  });

  it('keeps the honest fallback in the engine, with its meaning stated', () => {
    expect(engine).toContain('if (!pages || pages.length === 0) return 1;');
    expect(engine).toContain('return page.displayPageNumber ?? (page.pageIndex + 1);');
  });

  it('skips its own paragraphs so a regeneration cannot list the directory', () => {
    expect(engine).toContain('if (p.id.startsWith(TOC_HEADER_PREFIX) || p.id.startsWith(TOC_ITEM_PREFIX)) {');
    expect(engine).toContain('return;');
  });
});
