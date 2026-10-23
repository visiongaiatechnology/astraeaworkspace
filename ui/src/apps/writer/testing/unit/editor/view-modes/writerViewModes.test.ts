// STATUS: DIAMANT VGT SUPREME — Writer view-mode domain verification
import { describe, expect, it } from 'vitest';
import {
  isWriterViewMode,
  normalizeWriterViewMode,
  resolveWriterContentViewMode,
  resolveWriterFocusBaseMode,
  resolveWriterViewModeTransition,
  writerViewModeIsReadOnly,
  WRITER_VIEW_MODES,
} from '../../../../editor/view-modes/writerViewModes';

describe('Writer view-mode domain', () => {
  it('recognizes exactly the six supported modes', () => {
    expect(WRITER_VIEW_MODES).toEqual([
      'print',
      'continuous',
      'draft',
      'outline',
      'reading',
      'focus',
    ]);
    for (const mode of WRITER_VIEW_MODES) {
      expect(isWriterViewMode(mode)).toBe(true);
    }
    expect(isWriterViewMode('web')).toBe(false);
    expect(isWriterViewMode('')).toBe(false);
    expect(isWriterViewMode(null)).toBe(false);
  });

  it('fails closed to print for malformed persisted values', () => {
    expect(normalizeWriterViewMode('outline')).toBe('outline');
    expect(normalizeWriterViewMode('unknown')).toBe('print');
    expect(normalizeWriterViewMode({ mode: 'reading' })).toBe('print');
  });

  it('keeps focus transient and restores its underlying content view', () => {
    expect(resolveWriterFocusBaseMode('reading')).toBe('reading');
    expect(resolveWriterFocusBaseMode('focus')).toBe('print');
    expect(resolveWriterContentViewMode('focus', 'outline')).toBe('outline');
    expect(resolveWriterContentViewMode('draft', 'outline')).toBe('draft');

    const enterFocus = resolveWriterViewModeTransition('reading', 'reading', 'focus');
    expect(enterFocus).toEqual({ viewMode: 'focus', focusBaseMode: 'reading' });
    const exitFocus = resolveWriterViewModeTransition('focus', enterFocus.focusBaseMode, 'reading');
    expect(exitFocus).toEqual({
      viewMode: 'reading',
      focusBaseMode: 'reading',
      persistedMode: 'reading',
    });
  });

  it('makes only Reading mode immutable', () => {
    expect(writerViewModeIsReadOnly('reading')).toBe(true);
    for (const mode of ['print', 'continuous', 'draft', 'outline'] as const) {
      expect(writerViewModeIsReadOnly(mode)).toBe(false);
    }
  });
});
