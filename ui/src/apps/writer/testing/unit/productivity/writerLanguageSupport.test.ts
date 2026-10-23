// STATUS: DIAMANT VGT SUPREME — Unsupported languages must be named, not silently skipped
//
// Paket 31 acceptance: "DE/EN-Prüfung sichtbar anbieten, unsupported Sprachen
// ehrlich kennzeichnen." The engine supports de-DE, en-US and en-GB; fr-FR is a
// valid document language but has no dictionary. Before this, the audit of a French
// document returned **no issues**, and the dialog declared "Das Dokument entspricht
// den linguistischen Standards der gewählten Sprache" — a check that never happened.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import {
  analyzeParagraphLinguistics,
  analyzeParagraphLinguisticsDetailed,
  isWriterLanguageSupported,
  normalizeWriterLinguisticsConfig,
  writerHyphenationPatternLanguage,
  writerLinguisticsCapabilities,
} from '../../../productivity/language/writerLinguistics';

const para = (...spans: Array<{ text: string; language?: string }>): Paragraph => ({
  id: 'p1',
  spans: spans.map((span) => ({ text: span.text, language: span.language })),
  style: { style_name: 'normal' },
} as unknown as Paragraph);

describe('Writer language support is stated, not implied', () => {
  it('names the supported languages and nothing else', () => {
    expect(isWriterLanguageSupported('de-DE')).toBe(true);
    expect(isWriterLanguageSupported('en-US')).toBe(true);
    expect(isWriterLanguageSupported('en-GB')).toBe(true);
    expect(isWriterLanguageSupported('fr-FR')).toBe(false);
  });

  it('separates spelling from hyphenation, because they differ', () => {
    expect(writerLinguisticsCapabilities('de-DE')).toEqual({ spelling: true, hyphenation: true });
    expect(writerLinguisticsCapabilities('en-GB')).toEqual({ spelling: true, hyphenation: true });
    expect(writerLinguisticsCapabilities('fr-FR')).toEqual({ spelling: false, hyphenation: false });
  });

  it('reports the languages it could not check instead of returning a clean result', () => {
    const audit = analyzeParagraphLinguisticsDetailed(
      para({ text: 'Bonjour le monde', language: 'fr-FR' }),
      { defaultLanguage: 'fr-FR' },
    );
    expect(audit.issues).toEqual([]);
    // The empty issue list is the honest part — but only because it is labelled.
    expect(audit.uncheckedLanguages).toEqual(['fr-FR']);
  });

  it('lists each unchecked language once, in order of appearance', () => {
    const audit = analyzeParagraphLinguisticsDetailed(
      para(
        { text: 'Bonjour ', language: 'fr-FR' },
        { text: 'hello ', language: 'en-US' },
        { text: 'monde ', language: 'fr-FR' },
      ),
      { defaultLanguage: 'de-DE' },
    );
    expect(audit.uncheckedLanguages).toEqual(['fr-FR']);
  });

  it('treats every tag outside the closed set as unchecked, even if one slips in', () => {
    // The tag set is closed (`de-DE | en-US | en-GB | fr-FR`), but a document from
    // elsewhere can carry a tag the type does not know. The runtime must not claim it
    // checked that language.
    const audit = analyzeParagraphLinguisticsDetailed(
      para({ text: 'Ciao mondo', language: 'it-IT' as never }),
      { defaultLanguage: 'de-DE' },
    );
    expect(audit.issues).toEqual([]);
    expect(audit.uncheckedLanguages).toEqual(['it-IT']);
  });

  it('reports nothing unchecked for a fully supported document', () => {
    const audit = analyzeParagraphLinguisticsDetailed(
      para({ text: 'Der schnelle braune Fuchs', language: 'de-DE' }),
      { defaultLanguage: 'de-DE' },
    );
    expect(audit.uncheckedLanguages).toEqual([]);
  });

  it('still finds real issues in the supported part of a mixed document', () => {
    const audit = analyzeParagraphLinguisticsDetailed(
      para(
        { text: 'Der scschnelle Fuchs ', language: 'de-DE' },
        { text: 'Bonjour', language: 'fr-FR' },
      ),
      { defaultLanguage: 'de-DE' },
    );
    expect(audit.issues.length).toBeGreaterThan(0);
    expect(audit.uncheckedLanguages).toEqual(['fr-FR']);
  });

  it('keeps the plain view identical to the detailed one', () => {
    const paragraph = para({ text: 'Der scschnelle Fuchs', language: 'de-DE' });
    expect(analyzeParagraphLinguistics(paragraph, { defaultLanguage: 'de-DE' }))
      .toEqual(analyzeParagraphLinguisticsDetailed(paragraph, { defaultLanguage: 'de-DE' }).issues);
  });

  it('marks the default language of an unsupported document as unchecked', () => {
    const config = normalizeWriterLinguisticsConfig({ defaultLanguage: 'fr-FR' });
    // The configuration accepts French — that is fine, as long as the audit says so.
    expect(config.defaultLanguage).toBe('fr-FR');
    const audit = analyzeParagraphLinguisticsDetailed(para({ text: 'Bonjour' }), config);
    expect(audit.uncheckedLanguages).toEqual(['fr-FR']);
  });

  it('maps hyphenation patterns only where they exist', () => {
    expect(writerHyphenationPatternLanguage('de-DE')).toBe('de');
    expect(writerHyphenationPatternLanguage('en-US')).toBe('en');
    expect(writerHyphenationPatternLanguage('en-GB')).toBe('en');
    // The manual action used to send everything non-German to the English patterns.
    expect(writerHyphenationPatternLanguage('fr-FR')).toBeNull();
    expect(writerHyphenationPatternLanguage('it-IT' as never)).toBeNull();
  });
});
