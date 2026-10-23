// STATUS: PLATIN — Source contract for paragraph-level commands across a range
//
// The targeting, patching and option building are unit-tested. What unit tests
// cannot reach is that the toolbar handlers actually consult the marked range
// instead of always rewriting the active paragraph, and that the line-spacing
// control offers the value the document carries.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const formatting = read('../../../../formatting/useWriterFormattingState.ts');
const toolbar = read('../../../../formatting/toolbar/WriterFormattingToolbar.tsx');
const editorState = read('../../../../editor/useWriterState.ts');
const modals = read('../../../../editor/modals/WriterAllModals.tsx');

describe('Writer paragraph command wiring contract', () => {
  it('routes alignment and line spacing through the shared paragraph patch', () => {
    expect(formatting).toContain('const applyParagraphPatch = useCallback((patch: WriterParagraphStylePatch) => {');
    expect(formatting).toContain('applyParagraphPatch({ alignment });');
    expect(formatting).toContain('applyParagraphPatch({ lineHeight: spacing });');
  });

  it('resolves the targets from the marked range', () => {
    expect(formatting).toContain('resolveWriterParagraphTargets(');
    expect(formatting).toContain('getCoveredParagraphIds?.() ?? null,');
    expect(formatting).toContain('if (result.changedCount === 0) return;');
  });

  it('no longer rewrites only the active paragraph for these commands', () => {
    expect(formatting).not.toContain("updateActiveParagraphFormatting((p) => ({ ...p, style: { ...p.style, alignment } }))");
    expect(formatting).not.toContain("updateActiveParagraphFormatting((p) => ({ ...p, style: { ...p.style, line_height: spacing } }))");
  });

  it('reads the covered ids through a getter at command time', () => {
    expect(editorState).toContain('getCoveredParagraphIds: () => coveredParagraphIdsRef.current,');
    expect(editorState).toContain('coveredParagraphIdsRef.current = rangeSelection.coveredParagraphIds;');
    expect(editorState).toContain('const coveredParagraphIdsRef = useRef<readonly string[]>([]);');
  });

  it('offers the document value in the line-spacing control', () => {
    expect(toolbar).toContain('resolveWriterLineHeightOptions(LINE_SPACINGS, currentLineHeight)');
    expect(toolbar).toContain('{lineHeightOptions.map((sp) => (');
    expect(toolbar).not.toContain('{LINE_SPACINGS.map((sp) => (');
  });

  it('applies a list to every marked paragraph and toggles it off again', () => {
    expect(formatting).toContain('const handleToggleList = useCallback((list: WriterParagraphListStyle) => {');
    expect(formatting).toContain('resolveWriterListToggleValue(paragraphs, targets, list)');
    expect(formatting).toContain('patchWriterParagraphStyle(paragraphs, targets, { list: value })');
    // The old version rewrote only the active paragraph and forced level 0.
    expect(formatting).not.toContain('list_style: p.style.list_style === list ? undefined : list,');
    expect(formatting).not.toContain('list_level: 0,\n      },\n    }));');
  });

  it('routes indents, tab stops and the paragraph dialog through the same targets', () => {
    expect(formatting).toContain('const handleApplyParagraphStylePatch = useCallback((patch: Partial<Paragraph[\'style\']>) => {');
    expect(formatting).toContain('applyParagraphPatch({ style: patch });');
    expect(formatting).toContain('applyParagraphPatch({ style: patch });\n    },\n    [applyParagraphPatch]\n  );\n\n  const handleUpdateTabStops');
    // The dialog used to rewrite the active paragraph directly.
    expect(modals).not.toContain('onUpdateParagraphStyle={(patch) => state.updateActiveParagraphFormatting(');
    expect(modals).toContain('onUpdateParagraphStyle={state.handleApplyParagraphStylePatch}');
  });
});
