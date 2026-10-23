// STATUS: PLATIN — direct behavior coverage for the shell command-palette fuzzy scorer.
import { describe, expect, it } from 'vitest';
import { commandPaletteFuzzyScore } from '../commandPaletteSearch';

describe('commandPaletteFuzzyScore', () => {
  it('gives empty queries a stable neutral score', () => {
    expect(commandPaletteFuzzyScore('   ', 'Save workspace')).toBe(1);
  });

  it('scores case-insensitive direct matches above unmatched candidates', () => {
    expect(commandPaletteFuzzyScore('SAVE', 'Save workspace')).toBeGreaterThan(0);
    expect(commandPaletteFuzzyScore('SAVE', 'Open settings')).toBe(-1);
  });

  it('matches ordered initials and rewards word boundaries', () => {
    const wordBoundaryMatch = commandPaletteFuzzyScore('cp', 'Command Palette');
    const embeddedMatch = commandPaletteFuzzyScore('cp', 'xcommandypalette');
    expect(wordBoundaryMatch).toBeGreaterThan(embeddedMatch);
    expect(commandPaletteFuzzyScore('cp', 'Palette Command')).toBe(-1);
  });

  it('returns deterministic scores for repeated queries', () => {
    const first = commandPaletteFuzzyScore('open settings', 'Open Workspace Settings');
    expect(commandPaletteFuzzyScore('open settings', 'Open Workspace Settings')).toBe(first);
  });
});
