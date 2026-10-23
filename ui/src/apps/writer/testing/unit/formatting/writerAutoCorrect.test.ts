// STATUS: PLATIN — Writer AutoCorrect behavior and hostile-boundary tests
import { describe, expect, it } from 'vitest';
import type { WriterAutoCorrectConfig } from '../../../../../shared/contracts/workspace';
import {
  applyWriterAutoCorrect,
  normalizeWriterAutoCorrectConfig,
  writerAutoCorrectRuleError,
} from '../../../formatting/autocorrect/writerAutoCorrect';

const config: WriterAutoCorrectConfig = {
  enabled: true,
  smartQuotes: true,
  autoFormat: true,
  locale: 'de-DE',
  replacements: [
    { id: 'mfg', trigger: 'mfg', replacement: 'Mit freundlichen Grüßen', caseSensitive: false },
    { id: 'case', trigger: 'VGT', replacement: 'VisionGaia Technology', caseSensitive: true },
  ],
};

describe('Writer AutoCorrect', () => {
  it('uses German opening and closing quotes from insertion context', () => {
    expect(applyWriterAutoCorrect('', '"', 1, config).text).toBe('„');
    expect(applyWriterAutoCorrect('„Text', '„Text"', 6, config).text).toBe('„Text“');
    expect(applyWriterAutoCorrect('Wort', "Wort'", 5, config).text).toBe('Wort’');
    expect(applyWriterAutoCorrect('‚Wort', "‚Wort'", 6, config).text).toBe('‚Wort‘');
  });

  it('uses English smart-quote pairs when configured', () => {
    const english = { ...config, locale: 'en-US' as const };
    expect(applyWriterAutoCorrect('', '"', 1, english).text).toBe('“');
    expect(applyWriterAutoCorrect('“Text', '“Text"', 6, english).text).toBe('“Text”');
  });

  it('applies bounded typographic AutoFormat transformations', () => {
    expect(applyWriterAutoCorrect('..', '...', 3, config)).toMatchObject({ text: '…', caret: 1, applied: 'auto-format' });
    expect(applyWriterAutoCorrect('(c', '(c)', 3, config).text).toBe('©');
    expect(applyWriterAutoCorrect('go-', 'go->', 4, config).text).toBe('go→');
  });

  it('converts double hyphens to locale-specific typographic dashes and preserves trailing text', () => {
    expect(applyWriterAutoCorrect('Text-', 'Text--', 6, config)).toMatchObject({
      text: 'Text–',
      caret: 5,
      applied: 'auto-format',
    });
    expect(applyWriterAutoCorrect('Text-', 'Text--', 6, { ...config, locale: 'en-US' })).toMatchObject({
      text: 'Text—',
      caret: 5,
      applied: 'auto-format',
    });
    expect(applyWriterAutoCorrect('A-BC', 'A--BC', 3, config)).toMatchObject({
      text: 'A–BC',
      caret: 2,
      applied: 'auto-format',
    });
    expect(applyWriterAutoCorrect('--', '---', 3, config)).toMatchObject({
      text: '—',
      caret: 1,
      applied: 'auto-format',
    });
  });

  it('applies a configurable replacement when a word boundary is typed', () => {
    expect(applyWriterAutoCorrect('mf', 'mfg', 3, config).text).toBe('mfg');
    expect(applyWriterAutoCorrect('mfg', 'mfg ', 4, config)).toMatchObject({
      text: 'Mit freundlichen Grüßen ',
      caret: 24,
      applied: 'replacement',
      ruleId: 'mfg',
    });
  });

  it('honors case-sensitive rules and word boundaries', () => {
    expect(applyWriterAutoCorrect('vgt', 'vgt ', 4, config).text).toBe('vgt ');
    expect(applyWriterAutoCorrect('VGT', 'VGT ', 4, config).text).toBe('VisionGaia Technology ');
    expect(applyWriterAutoCorrect('amfg', 'amfg ', 5, config).text).toBe('amfg ');
  });

  it('does not transform deletions, replacements, or disabled configurations', () => {
    expect(applyWriterAutoCorrect('Text', 'Tex', 3, config).applied).toBe('none');
    expect(applyWriterAutoCorrect('abc', 'axc', 2, config).applied).toBe('none');
    expect(applyWriterAutoCorrect('..', '...', 3, { ...config, enabled: false }).text).toBe('...');
  });

  it('rejects duplicate and control-character rules', () => {
    expect(writerAutoCorrectRuleError('MFG', 'x', config.replacements)).toContain('bereits');
    expect(writerAutoCorrectRuleError('bad\u0000', 'x', [])).toContain('Steuerzeichen');
    expect(writerAutoCorrectRuleError('ok', 'bad\u0001', [])).toContain('Steuerzeichen');
  });

  it('normalizes invalid and duplicate persisted rules deterministically', () => {
    const normalized = normalizeWriterAutoCorrectConfig({
      ...config,
      locale: 'invalid' as 'de-DE',
      replacements: [config.replacements[0], { ...config.replacements[0], id: 'duplicate' }],
    });
    expect(normalized.locale).toBe('de-DE');
    expect(normalized.replacements).toHaveLength(1);
  });
});
