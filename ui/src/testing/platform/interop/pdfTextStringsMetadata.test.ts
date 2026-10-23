// STATUS: PLATIN — W-301: the one rule for a bounded PDF metadata text string.
//
// Measured before this rule existed: `apps/pdf/signatures/incremental/pdfIncrementalSignature.ts` carried its own
// function — named `escapePdfLiteral`, although this module exports `escapePdfLiteral` with a *different* meaning
// (delimiter escaping) — which (a) cut over-long values with `slice(...)` and (b) silently deleted control
// characters. Both were invisible to the caller. These tests pin the replacement: refuse by name, and carry what
// a PDF text string can carry.
import { describe, expect, it } from 'vitest';
import {
  escapePdfLiteral,
  pdfMetadataTextString,
  pdfUnicodeTextString,
  PdfMetadataTextLimitError,
} from '../../../platform/interop/pdf/pdfTextStrings';

describe('bounded PDF metadata text strings (W-301)', () => {
  it('produces the same text string as pdfUnicodeTextString when the value fits', () => {
    expect(pdfMetadataTextString('Grüße', 160, 'Signer name')).toBe(pdfUnicodeTextString('Grüße'));
    expect(pdfMetadataTextString('ü'.repeat(160), 160, 'Signer name')).toBe(pdfUnicodeTextString('ü'.repeat(160)));
  });

  it('refuses a value above the limit and names field, limit and measured length', () => {
    let thrown: unknown;
    try {
      pdfMetadataTextString('x'.repeat(161), 160, 'Signer name');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PdfMetadataTextLimitError);
    expect((thrown as Error).message).toBe('Signer name exceeds the 160-character PDF metadata limit (161 characters).');
    expect((thrown as PdfMetadataTextLimitError).field).toBe('Signer name');
    expect((thrown as PdfMetadataTextLimitError).length).toBe(161);
    expect((thrown as PdfMetadataTextLimitError).maxCharacters).toBe(160);
  });

  it('carries a control character instead of deleting it, because the output is a hex text string', () => {
    // `<FEFF...>` cannot be broken by a newline, so the old `[\x00-\x1F\x7F]` strip was a silent loss, not a
    // safety measure. Measured: `a\nb` leaves as U+000A between the two letters.
    expect(pdfMetadataTextString('a\nb', 512, 'Signing reason')).toBe('<FEFF0061000A0062>');
  });

  it('rejects a limit that is not a positive integer', () => {
    expect(() => pdfMetadataTextString('a', 0, 'Signer name')).toThrow(TypeError);
    expect(() => pdfMetadataTextString('a', Number.NaN, 'Signer name')).toThrow(TypeError);
  });

  it('keeps the delimiter-escaping function it was confused with untouched', () => {
    // The name collision is the point of W-301: this function is *not* the metadata rule.
    expect(escapePdfLiteral('()\\')).toBe('\\(\\)\\\\');
  });
});
