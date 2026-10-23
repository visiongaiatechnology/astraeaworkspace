// STATUS: PLATIN — Writer acceptance harness, part 9: the source contracts that no DOM runner is needed
// for, kept as `.mjs` so they read the shipped sources directly (`node:fs`) without a Node type
// dependency in the TypeScript project — the same convention the rest of the Writer suite uses.
//
// These are the *wiring* half of points whose behaviour is asserted elsewhere: the marker exists in the
// shipped component and the code that clicks/jumps uses it. Every `it` is titled `AST-xxxx` so
// `tools/writer-acceptance.mjs` can attribute the result.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');
/** Comments are stripped so a commented-out marker cannot count as evidence. */
const code = (relative) => read(relative).replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');

describe('Writer acceptance — source contracts for the rendered markers', () => {
  it('AST-0004 the page body and every paragraph carry the click-path markers the handler reads', () => {
    const paper = code('../../layout/pages/WriterPagePaper.tsx');
    expect(paper).toContain('data-writer-page-body="true"');
    expect(paper).toContain('data-writer-flow-item="paragraph"');
    expect(paper).toContain('data-writer-paragraph-anchor={p.id}');
    // The page body measures its anchors and hands the decision to the resolver — it never writes the
    // caret itself.
    expect(paper).toContain("querySelectorAll<HTMLElement>('[data-writer-paragraph-anchor]')");
    expect(paper).toContain('onEmptyAreaClick({');
    // The click really goes through the caret resolver and is refused in a protected document.
    const state = code('../../editor/useWriterState.ts');
    expect(state).toContain('const handlePageBackgroundClick = useCallback');
    expect(state).toContain('resolveWriterPageClickTarget(click)');
    expect(state).toMatch(/handlePageBackgroundClick = useCallback\(\(click: WriterPageClickInput\) => \{\s*if \(!canEditText\(reviewState\.protectionMode\)\) \{ handleBlockedEditAttempt\(\); return; \}/u);
  });

  it('AST-0096 and AST-0141 the header and footer preview elements are gated by the field check', () => {
    const headerFooter = code('../../layout/pages/WriterPageHeaderFooter.tsx');
    expect(headerFooter).toContain('data-writer-header-preview="true"');
    expect(headerFooter).toContain('data-writer-footer-preview="true"');
    // The preview exists only when the field carries a marker — otherwise it would render a no-op.
    expect(headerFooter).toContain('headerHasFields &&');
    expect(headerFooter).toContain('footerHasFields &&');
    // The input keeps the template; the preview shows the evaluated value.
    // (ASTRAEA WRITER 50 V2 · M1: header and footer share one implementation, so the
    // template is selected once by `isHeader`. The invariant is unchanged.)
    expect(headerFooter).toContain('value={template}');
    expect(headerFooter).toContain('const template = isHeader ? resolved.headerText : resolved.footerText;');
    expect(headerFooter).toContain('{evaluated}');
    // And the preview is really the evaluated value of the field logic.
    const utils = code('../../utils/writerUtils.ts');
    expect(utils).toContain('export function evaluateFields');
    expect(utils).toContain('export function hasWriterFields');
  });

  it('AST-0226 the outline entry carries the anchor the jump scrolls to, and the target is focusable', () => {
    const sidebar = code('../../navigation/toc/WriterTocSidebar.tsx');
    expect(sidebar).toContain('data-writer-outline-id={item.id}');
    // The jump looks the entry up by exactly that attribute.
    expect(sidebar).toMatch(/querySelector<HTMLButtonElement>\(`\[data-writer-outline-id=/u);
    // The paragraph is a focusable anchor, otherwise `focus()` after the jump would do nothing (W-267).
    const item = code('../../editor/paragraphs/WriterParagraphItem.tsx');
    expect(item).toContain('id={isFirstFragment ? `writer-paragraph-${p.id}`');
    expect(item).toContain('tabIndex={(isFirstFragment');
  });

  it('AST-0234 the paragraph surface is multiline, named and read-only-aware', () => {
    const item = code('../../editor/paragraphs/WriterParagraphItem.tsx');
    expect(item).toContain('aria-multiline="true"');
    expect(item).toContain('aria-readonly={readOnly}');
    // The accessible name names the paragraph and its heading level, in German, with a 1-based index.
    expect(item).toMatch(/aria-label=\{`\$\{heading \? `[^`]*\$\{p\.style\.heading_level \?\? 1\}` : 'Absatz'\} \$\{pIdx \+ 1\}`\}/u);
  });

  it('AST-0134 the page-setup dialog keeps a visible focus ring on every control it disables the outline for', () => {
    const focusContract = code('../unit/layout/page-setup/writerFocusVisibility.contract.test.mjs');
    // The contract exists and pins the rule; this assertion guards against it being deleted silently.
    expect(focusContract).toContain("focus-visible:ring");
    expect(focusContract).toContain('outline-none');
    const modal = code('../../layout/page-setup/WriterPageSetupModal.tsx');
    expect(modal).toContain('focus-visible:ring');
  });
});
