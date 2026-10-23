// STATUS: PLATIN — Source contract for the honest language labelling
//
// The engine is unit-tested. What no unit test reaches is that the dialog actually
// names the unchecked languages: the acceptance is "unsupported Sprachen ehrlich
// kennzeichnen", and a capability nobody displays is not a label. The old dialog
// declared "Das Dokument entspricht den linguistischen Standards der gewählten
// Sprache" for a language it had not checked at all.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const modal = read('../../../productivity/language/WriterLinguisticsModal.tsx');
const engine = read('../../../productivity/language/writerLinguistics.ts');
const layout = read('../../../layout/text-layout/writerTextLayout.ts');

describe('Writer unsupported-language labelling contract', () => {
  it('asks for the audit that reports what it skipped', () => {
    expect(modal).toContain('analyzeParagraphLinguisticsDetailed(paragraph, previewConfig)');
    expect(modal).toContain('for (const language of audit.uncheckedLanguages) unchecked.add(language);');
    expect(modal).toContain('const uncheckedLanguages = auditResults.uncheckedLanguages;');
  });

  it('names the unchecked languages in the dialog', () => {
    expect(modal).toContain('gibt es kein Wörterbuch.');
    expect(modal).toContain('Diese Bereiche wurden <strong>nicht</strong> geprüft.');
    expect(modal).toMatch(/role="status"[\s\S]{0,200}amber/);
  });

  it('never claims conformance for a language it did not check', () => {
    // The sentence must survive for the checked case and be replaced otherwise.
    expect(modal).toContain('Das Dokument entspricht den linguistischen Standards der gewählten Sprache.');
    expect(modal).toContain("'Keine Auffälligkeiten in den geprüften Bereichen.'");
    expect(modal).toContain('deshalb sagt dieses Ergebnis nichts über sie aus');
  });

  it('keeps one definition of the supported languages', () => {
    expect(engine).toContain('export function writerLinguisticsCapabilities(');
    expect(engine).toContain('export function isWriterLanguageSupported(');
    expect(engine).toContain('export function writerHyphenationPatternLanguage(');
    // The layout engine must use the shared mapping instead of its own copy.
    expect(layout).toContain('return writerHyphenationPatternLanguage(language);');
    expect(layout).not.toContain("if (language === 'de-DE') return 'de';");
  });

  it('skips hyphenation instead of borrowing another language\'s patterns', () => {
    expect(modal).toContain('const patternLanguage = writerHyphenationPatternLanguage(span.language ?? lang);');
    expect(modal).toContain('if (!patternLanguage) return span.text;');
    // The old mapping sent every non-German span to the English patterns.
    expect(modal).not.toContain("=== 'de-DE' ? 'de' : 'en'");
  });

  it('offers French only as a tag, in the language selector', () => {
    expect(modal).toContain('<option value="fr-FR">Français (Tag only)</option>');
  });

  it('does not add a second dictionary lookup outside the engine', () => {
    // Support is decided in one place; the dialog must ask, not guess.
    expect(modal).not.toContain('CORE_DICT_');
    expect(engine).toContain('function dictionaryForLanguage(');
  });
});
