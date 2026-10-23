// STATUS: PLATIN — Source contract for the selection-aware font controls
//
// The font resolution and application are unit-tested. What unit tests cannot
// reach is that the toolbar actually applies a font to the marked text instead of
// rewriting the shared style definition, and that the displayed value comes from
// the marked range instead of the paragraph's first span.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const formatting = read('../../../../formatting/useWriterFormattingState.ts');
const characterRow = read('../../../../formatting/toolbar/WriterFormattingToolbarCharacterRow.tsx');
const toolbar = read('../../../../formatting/toolbar/WriterFormattingToolbar.tsx');
const rangeState = read('../../../../formatting/range/writerRangeFormatState.ts');
const editor = read('../../../../editor/WriterEditor.tsx');

describe('Writer font control wiring contract', () => {
  it('applies a font to the marked range through the pure helper', () => {
    expect(formatting).toContain('const applyFontPatch = useCallback((patch: WriterFontPatch) => {');
    expect(formatting).toContain('return applyWriterFontToRange(p, patch, selection);');
    expect(formatting).toContain('const handleSetFontFamily = useCallback((fontFamily: string) => {');
    expect(formatting).toContain('const handleSetFontSizePt = useCallback((fontSizePt: number) => {');
  });

  it('no longer rewrites the style definition as the primary path', () => {
    // The style patch survives only as the guarded fallback for callers that do
    // not hand in the range-aware handler.
    expect(characterRow).toContain('else onUpdateStyle(styleName, { fontFamily: event.target.value });');
    expect(characterRow).toContain('else onUpdateStyle(styleName, { fontSizePt: nextSize });');
    expect(characterRow).toContain('if (onSetFontFamily) onSetFontFamily(event.target.value);');
    expect(characterRow).toContain('if (onSetFontSizePt) onSetFontSizePt(nextSize);');
  });

  it('derives the displayed values from the marked range', () => {
    // The row reads the one range reader's answer instead of a second derivation
    // of its own; the reader itself resolves the family from the covered spans.
    expect(rangeState).toContain('resolveWriterFontAtRange(');
    expect(characterRow).toContain('const fontFamily = rangeFormat.fontFamily;');
    expect(characterRow).toContain('const fontSizePt = rangeFormat.fontSizePt;');
    expect(characterRow).not.toContain('paragraph?.spans.find((span) => span.font_family)?.font_family');
    expect(characterRow).not.toContain('paragraph?.spans.find((span) => span.font_size_pt)?.font_size_pt');
  });

  it('hands the range state to every formatting control', () => {
    expect(toolbar).toContain('rangeFormat?: WriterRangeFormatState;');
    expect(toolbar).toContain('rangeFormat={effectiveRangeFormat}');
    expect(toolbar).toContain('const currentLineHeight = effectiveRangeFormat.lineHeight.value');
    expect(toolbar).toContain('resolveWriterRangeFormatState(');
    expect(editor).toContain('rangeFormat={state.rangeFormatState}');
    // The marked text of the active paragraph still bounds the displayed range.
    expect(editor).toContain('selection={state.textSelection}');
    expect(toolbar).toContain('selection?: { readonly start: number; readonly end: number } | null;');
  });

  it('disables the font controls in historical review', () => {
    expect(editor).toContain('onSetFontFamily={isHistoricalReview ? undefined : state.handleSetFontFamily}');
    expect(editor).toContain('onSetFontSizePt={isHistoricalReview ? undefined : state.handleSetFontSizePt}');
  });
});
