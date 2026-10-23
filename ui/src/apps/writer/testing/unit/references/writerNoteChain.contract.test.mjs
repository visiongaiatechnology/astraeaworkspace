// STATUS: PLATIN — Source contract for the note chain: write, order, anchor, jump
//
// The ordering and the id builders are unit-tested. What no unit test reaches is that
// the four links of the chain exist at all:
//   1. the insert path **writes** the offset the engine orders by,
//   2. the editor passes the caret offset into that path,
//   3. the engine builds its anchors with the shared builders,
//   4. the badge in the text carries the id the note's link points at (W-153: it did not).
// Any missing link makes the acceptance's clauses silently false.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const engine = read('../../../references/notes/writerNotesEngine.ts');
const referenceState = read('../../../references/useWriterReferenceState.ts');
const editorState = read('../../../editor/useWriterState.ts');
const paragraphItem = read('../../../editor/paragraphs/WriterParagraphItem.tsx');
const navigation = read('../../../references/notes/writerNoteNavigation.ts');

describe('Writer note chain contract', () => {
  it('writes the offset the engine orders by', () => {
    expect(referenceState).toContain('referenceTextOffset: Math.max(0, Math.trunc(activeTextOffset ?? 0)),');
  });

  it('feeds the caret offset into the insert path', () => {
    expect(editorState).toContain('activeTextOffset: textSelection && textSelection.paragraphId === activeParagraph?.id');
    expect(editorState).toContain(': activeParagraph?.spans.reduce((length, span) => length + span.text.length, 0) ?? 0,');
  });

  it('orders by that offset with the legacy name as a fallback', () => {
    expect(engine).toContain('export function writerNoteReferenceOffset(');
    expect(engine).toContain('note.referenceTextOffset ?? note.referenceSpanIndex');
    expect(engine).toContain('const offsetA = writerNoteReferenceOffset(a);');
  });

  it('builds every anchor in one place', () => {
    expect(navigation).toContain('export function writerNoteEntryAnchorId(');
    expect(navigation).toContain('export function writerNoteReferenceAnchorId(');
    expect(engine).toContain('anchorId: writerNoteEntryAnchorId(note),');
    expect(engine).toContain('refAnchorId: writerNoteReferenceAnchorId(note),');
    // The inline template strings are gone.
    expect(engine).not.toContain('anchorId: `fn-');
    expect(engine).not.toContain('refAnchorId: `en-ref-');
  });

  it('gives the badge in the text the id the note link points at', () => {
    // W-153: `#fn-ref-<id>` matched no element, so "jump back to the reference" was dead.
    expect(paragraphItem).toContain('id={writerNoteReferenceAnchorId(note)}');
  });

  it('makes the badge reachable and clickable, as its cursor already promised', () => {
    expect(paragraphItem).toContain("onClick={() => jumpToWriterNote(note, 'to-note')}");
    expect(paragraphItem).toContain('role="button"');
    expect(paragraphItem).toContain('tabIndex={0}');
    expect(paragraphItem).toContain('aria-label={`${note.noteType === \'endnote\' ? \'Endnote\' : \'Footnote\'}');
    // Keyboard activation, not only the mouse.
    expect(paragraphItem).toContain("if (event.key === 'Enter' || event.key === ' ') {");
  });

  it('keeps the jump reachable when the DOM is absent', () => {
    // The unit tests run without a DOM; the jump must report failure, not throw.
    expect(navigation).toContain("if (typeof document === 'undefined') return false;");
    expect(navigation).toContain('if (!element) return false;');
  });
});
