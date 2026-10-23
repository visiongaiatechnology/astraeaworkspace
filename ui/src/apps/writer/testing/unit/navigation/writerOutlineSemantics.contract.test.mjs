// STATUS: PLATIN — Source contract: the outline is semantic, the jump is exact and lands in the text
//
// Paket 46 acceptance: "Klick auf Überschrift springt **exakt** zum Text und **markiert semantisch
// richtig**."
//
// A unit test can prove what the outline contains. It cannot prove that the hierarchy reaches a screen
// reader, that the reader's position is marked, that the jump resolves the right element, or that focus
// follows the jump — hence this contract.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const sidebar = read('../../../navigation/toc/WriterTocSidebar.tsx');
const editor = read('../../../editor/WriterEditor.tsx');
const paragraphItem = read('../../../editor/paragraphs/WriterParagraphItem.tsx');
const engine = read('../../../navigation/writerNavigationEngine.ts');

describe('the outline is marked semantically', () => {
  it('declares a tree with a name', () => {
    expect(sidebar).toContain('role="tree"');
    expect(sidebar).toContain('aria-label="Dokumentgliederung"');
  });

  it('states the depth of every heading instead of only indenting it', () => {
    // W-268: indentation and font weight were the only carriers of the hierarchy.
    expect(sidebar).toContain('role="treeitem"');
    expect(sidebar).toContain('aria-level={item.level}');
  });

  it('marks where the reader is, and not only in colour', () => {
    expect(sidebar).toContain("aria-current={activeParagraphId === item.id ? 'location' : undefined}");
    // A visible marker next to the coloured border, so the state is not carried by colour alone.
    expect(sidebar).toContain('>hier</span>');
  });

  it('actually receives the active paragraph', () => {
    expect(sidebar).toContain('activeParagraphId?: string | null;');
    expect(sidebar).toContain('  activeParagraphId,');
    expect(editor).toContain('activeParagraphId={state.activeParagraphId}');
  });
});

describe('the outline has one definition', () => {
  it('asks the engine instead of recomputing the headings', () => {
    // W-266: the panel had its own copy of "what is a heading".
    expect(sidebar).toContain("import { getWriterOutline } from '../writerNavigationEngine';");
    expect(sidebar).toContain('const outline = getWriterOutline(paragraphs);');
    expect(sidebar).not.toContain('.filter((h) => h.level > 0 && h.text.length > 0)');
  });

  it('keeps the engine as the single source', () => {
    expect(engine).toContain('export function getWriterOutline(');
    expect(engine).toContain('const level = paragraph.style.heading_level ?? 0;');
  });
});

describe('the jump is exact and lands in the text', () => {
  it('resolves the paragraph through the shared id prefix', () => {
    // W-269: the prefix constant existed while three sites built the id by hand.
    expect(editor).toContain('${WRITER_PARAGRAPH_ANCHOR_PREFIX}${pId}');
    expect(editor).not.toContain('getElementById(`writer-paragraph-${pId}`)');
    expect(editor).toContain("import { WRITER_PARAGRAPH_ANCHOR_PREFIX } from '../references/notes/writerNoteNavigation';");
  });

  it('is the same prefix the paragraph element uses', () => {
    // The element builds `writer-paragraph-<id>`; the constant must match it.
    expect(paragraphItem).toContain('`writer-paragraph-${p.id}`');
    expect(read('../../../references/notes/writerNoteNavigation.ts')).toContain("export const WRITER_PARAGRAPH_ANCHOR_PREFIX = 'writer-paragraph-';");
  });

  it('scrolls to the paragraph and puts the caret into the text', () => {
    const jump = editor.slice(editor.indexOf('onJumpToParagraph={(pId) => {'));
    const body = jump.slice(0, jump.indexOf('}}'));
    expect(body).toContain("el?.scrollIntoView({ behavior: 'smooth', block: 'center' })");
    expect(body).toContain('state.setActiveParagraphId(pId)');
    // WR-037: the wrapper is not focusable in the rich surface, so `focus()` only scrolled.
    // The jump goes through the one caret authority instead, which also places the caret.
    expect(body).toContain("requestWriterCaret({ paragraphId: pId, start: 0, end: 0, origin: 'api' })");
    expect(body).not.toContain('el?.focus?.({ preventScroll: true })');
  });

  it('makes the target focusable, or focus would do nothing', () => {
    // W-267: a div without tabIndex cannot take focus, so the jump would move the page and leave the
    // keyboard user behind. -1 keeps it out of the tab order.
    expect(paragraphItem).toContain('tabIndex={-1}');
  });
});
