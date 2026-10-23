// STATUS: PLATIN — Source contract for header and footer fields
//
// The field evaluation is unit-tested. What unit tests cannot reach is that the
// editable field holds the *template*: rendering the evaluated text into a
// controlled input wrote the substituted values back on the first keystroke and
// destroyed every field.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const headerFooter = read('../../../layout/pages/WriterPageHeaderFooter.tsx');
const helpers = read('../../../layout/header-footer/writerHeaderFooterHelpers.ts');

describe('Writer header and footer field wiring contract', () => {
  it('edits the template instead of the evaluated text', () => {
    // ASTRAEA WRITER 50 V2 · M1 (WR-003/WR-004): header and footer now share one
    // implementation, so the template is selected once by `isHeader` instead of
    // being read into two separate variables. The invariant is unchanged and is
    // asserted below: the field's value is the raw template, never the evaluated
    // text.
    expect(headerFooter).toContain('const template = isHeader ? resolved.headerText : resolved.footerText;');
    expect(headerFooter).toContain('value={template}');
    // The evaluated value must never be the input's value.
    expect(headerFooter).not.toContain('value={evaluated}');
    expect(headerFooter).not.toContain('value={evalHeader}');
    expect(headerFooter).not.toContain('value={evalFooter}');
  });

  it('shows the evaluated result as a separate preview', () => {
    expect(headerFooter).toContain('headerHasFields = isHeader && hasWriterFields(template)');
    expect(headerFooter).toContain('footerHasFields = !isHeader && hasWriterFields(template)');
    expect(headerFooter).toContain('data-writer-header-preview="true"');
    expect(headerFooter).toContain('data-writer-footer-preview="true"');
    expect(headerFooter).toContain('{evaluated}');
    // The preview is the evaluated value of the same template, computed once.
    expect(headerFooter).toContain('const evaluated = evaluateFields(template, {');
  });

  it('keeps the odd/even and first-page variants in one place', () => {
    expect(helpers).toContain("if (target === 'first') return { firstPageHeaderText: text };");
    expect(helpers).toContain("if (target === 'even') return { evenPageHeaderText: text };");
    expect(helpers).toContain("if (target === 'first') return { firstPageFooterText: text };");
    expect(helpers).toContain("if (target === 'even') return { evenPageFooterText: text };");
  });

  it('passes the page context the fields need', () => {
    expect(headerFooter).toContain('pageNumber: pageIndex,');
    expect(headerFooter).toContain('totalPages,');
    expect(headerFooter).toContain('title: documentTitle,');
    expect(headerFooter).toContain('words: wordCount,');
  });
});
