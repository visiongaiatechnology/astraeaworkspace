// STATUS: PLATIN — Source contract for the multi-paragraph commands (W-110, W-117)
//
// The walks themselves are unit-tested next door. What a unit test cannot reach is
// that the two handlers which act on one paragraph at a time actually consult the
// marked range, and that the coverage they consult carries the offsets and not
// only the ids. Comments are stripped first, so this contract cannot be satisfied
// by a comment.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');
const code = (relative) => read(relative)
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/^\s*\/\/.*$/gmu, '');

const formatting = code('../../../../formatting/useWriterFormattingState.ts');
const editorState = code('../../../../editor/useWriterState.ts');
const toolbar = code('../../../../formatting/toolbar/WriterFormattingToolbar.tsx');

describe('Writer multi-paragraph command wiring contract', () => {
  it('reads the covered ranges with their offsets, not only the ids', () => {
    expect(editorState).toContain('const coveredParagraphRangesRef = useRef<readonly WriterCoveredParagraphRange[]>([]);');
    expect(editorState).toContain('coveredParagraphRangesRef.current = coveredParagraphRanges;');
    expect(editorState).toContain('getCoveredParagraphRanges: () => coveredParagraphRangesRef.current,');
    expect(editorState).toContain('resolveWriterCoveredParagraphRanges(paragraphs, activeParagraphIndex, textSelection, rangeSelection.selection),');
  });

  it('routes a character toggle over a cross-paragraph range through the shared walk', () => {
    expect(formatting).toContain('const ranges = getCoveredParagraphRanges?.() ?? [];\n    if (ranges.length >= 2) {');
    expect(formatting).toContain('const result = applyWriterSpanToggleAcrossParagraphs(paragraphs, ranges, prop);');
    expect(formatting).toContain('if (result.changedParagraphIds.length === 0) return;');
    // The single-paragraph path keeps its own history behaviour.
    expect(formatting).toContain('return toggleWriterSpanProperty(p, prop, selection).paragraph;');
  });

  it('routes a list template over the covered paragraphs too', () => {
    expect(formatting).toContain("(paragraph) => applyWriterListStyle(paragraph, styleId, styleCatalog),");
    expect(formatting).toContain('const outcome = applyAcrossCoveredParagraphs(');
    expect(formatting).toContain("if (outcome === 'handled') return;");
  });

  it('creates one revision per changed paragraph of the range', () => {
    expect(formatting).toContain('result.changedParagraphIds');
    expect(formatting).toContain("createFormatRevision(before, after, 'You', revisionLabel)");
    expect(formatting).toContain("createFormatRevision(before, after, 'You', 'Zeichenformatierung')");
  });

  it('sends the pressed state to the buttons a screen reader reads', () => {
    expect(toolbar).toContain('aria-pressed={resolveWriterAriaPressed(state)}');
    expect(toolbar).toContain('data-writer-toggle-state={state}');
    expect(toolbar).toContain('const toggleBtn = (state: WriterRangeToggleState');
  });
});
