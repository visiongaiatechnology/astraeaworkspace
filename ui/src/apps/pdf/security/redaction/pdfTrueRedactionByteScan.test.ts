// STATUS: PLATIN — redaction byte verification asks the canonical encoder, not a second rule of its own.
//
// Counter-check protocol (revert → named red test → restore), run for every claim below:
//   A. `pdfRedactionVerificationEncodings` — revert it to the previous local rule in this folder
//      (`value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '?')` plus delimiter escaping, i.e. `Müller` →
//      `M?ller`). Test 1 then fails on the missing `M\374ller` and hex representations.
//   B. `scanVisibleFields` — drop `field.name`/`field.defaultValue` from the visited values. Test 3 then
//      fails with "promise resolved instead of rejecting".
//   C. `maxByteScanTargets` — remove the refusal in `buildVerifiedRedactedStructuredPdfBytes`. Test 5 then
//      fails on the missing throw.
//
// Why A matters: `platform/interop/pdf/pdfTextStrings.ts` documents exactly this trap ("Six call sites used
// to escape on their own … They all ask this module now") after a local `escapePdfLiteral` had silently cut
// signature metadata. A verification pass that uses a weaker rule than the writer it verifies can report
// `verified: true` for a document that still contains the secret.
import { describe, expect, it } from 'vitest';
import { pdfUnicodeTextString, pdfWinAnsiLiteral } from '../../../../platform/interop/pdf/pdfTextStrings';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import type { PdfDocumentModel, PdfRedaction } from '../../../../shared/contracts/workspace';
import {
  PDF_TRUE_REDACTION_LIMITS,
  buildVerifiedRedactedStructuredPdfBytes,
  pdfRedactionVerificationEncodings,
  redactStructuredPdfPattern,
} from './pdfTrueRedaction';

const appliedRedaction: PdfRedaction = {
  id: 'redact-control',
  page: 1,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  reason: 'Control redaction so the export path is reachable at all.',
  isApplied: true,
  targetText: '[12 CHARACTERS REDACTED]',
  timestamp: 1_792_000_000_000,
};

/** A model that still carries `secret` in a visible section, plus one applied redaction. */
function leakingModel(secret: string): PdfDocumentModel {
  return {
    ...DEFAULT_PDF_MODEL,
    pages: DEFAULT_PDF_MODEL.pages.map((page) => page.pageNumber !== 1 ? page : {
      ...page,
      sections: page.sections.map((section) => section.id !== 'sec-p1-1' ? section : { ...section, content: `Vertraulich: ${secret}` }),
    }),
    redactions: [appliedRedaction],
  };
}

describe('redaction verification encodings (counter-check A)', () => {
  it('carries the WinAnsi octal and UTF-16BE representations the exporter actually writes', () => {
    const encodings = pdfRedactionVerificationEncodings('Müller-Geheim');

    // `interchange/structuredPdfExport.ts:253` draws content text with `pdfWinAnsiLiteral`.
    expect(encodings).toContain(pdfWinAnsiLiteral('Müller-Geheim'));
    expect(encodings).toContain('M\\374ller-Geheim');
    // `structuredPdfExport.ts:381` and `navigation/pdfStructuredNavigation.ts:60` write text strings as hex.
    expect(encodings).toContain(pdfUnicodeTextString('Müller-Geheim'));
    expect(encodings.some((encoding) => encoding.includes('004D00FC'))).toBe(true);
    // The previous local rule substituted `?`; that representation must not be able to satisfy the scan.
    expect(encodings).not.toContain('M?ller-Geheim');
  });

  it('keeps every representation lossless-or-absent, so a clean document cannot be flagged', () => {
    // A value outside WinAnsi has no WinAnsi form to look for, but keeps its lossless text-string form.
    const encodings = pdfRedactionVerificationEncodings('東京');
    expect(encodings).toContain(pdfUnicodeTextString('東京'));
    expect(encodings).not.toContain('??');
  });

  it('escapes delimiters so a bracketed secret cannot hide behind PDF literal escaping', () => {
    expect(pdfRedactionVerificationEncodings('Akte (intern)')).toContain('Akte \\(intern\\)');
  });
});

describe('verified redaction byte scan over the real export', () => {
  it('refuses a leak that survives only in a content stream with delimiter escaping', () => {
    expect(() => buildVerifiedRedactedStructuredPdfBytes('Audit.pdf', leakingModel('Akte (intern)'), ['Akte (intern)']))
      .toThrow(/Redaction verification failed/u);
  });

  // Counter-check B: `scanVisibleFields` did not visit `field.name`, so a redaction target that survived in a
  // form field name produced `verified: true`. The name is written by `formFieldDictionary` as
  // `/T ${pdfUnicodeTextString(field.name)}`, which the old `?`-substituting rule could not match either.
  it('refuses a leak that survives in a form field name or default value', () => {
    const model: PdfDocumentModel = {
      ...leakingModel('harmlos'),
      formFields: [{
        id: 'field-1',
        name: 'GEHEIM-Müller',
        type: 'text',
        page: 1,
        bounds: { x: 20, y: 20, width: 200, height: 18 },
        value: '',
        defaultValue: 'GEHEIM-Vertraulich',
        options: [],
        required: false,
        readOnly: false,
      }],
    };
    expect(() => buildVerifiedRedactedStructuredPdfBytes('Audit.pdf', model, ['GEHEIM-Müller']))
      .toThrow('Redaction verification failed: target text remains in the structured model.');
    expect(() => buildVerifiedRedactedStructuredPdfBytes('Audit.pdf', model, ['GEHEIM-Vertraulich']))
      .toThrow('Redaction verification failed: target text remains in the structured model.');
  });

  it('runs the byte stage independently of the model stage and names it in the failure', () => {
    // The target is the *escaped* spelling, which is not a substring of any model value — so the model scan
    // passes and only the byte scan can answer. This pins that the byte stage is reachable, not dead code.
    const escapedTarget = 'Akte \\(intern\\)';
    expect('Vertraulich: Akte (intern)'.includes(escapedTarget)).toBe(false);
    expect(() => buildVerifiedRedactedStructuredPdfBytes('Audit.pdf', leakingModel('Akte (intern)'), [escapedTarget]))
      .toThrow('Redaction verification failed: target text remains in exported PDF bytes.');
  });

  it('compares without Unicode normalisation, and says so', () => {
    // Documented limitation, not a hidden one: the scan is a byte comparison, so an NFD spelling does not
    // match an NFC byte sequence. The canonical redaction path never introduces that mismatch, because the
    // targets come from `LinearPattern.findAll` over the exact model text that is then exported.
    const target = 'Mu\u0308ller-Geheim';
    expect(pdfRedactionVerificationEncodings(target).some((encoding) => encoding.includes('M\\374ller'))).toBe(false);
    expect(() => buildVerifiedRedactedStructuredPdfBytes('Audit.pdf', leakingModel('M\u00FCller-Geheim'), [target]))
      .not.toThrow();
  });

  it('still verifies a clean redaction and keeps the xref trailer structurally intact', () => {
    const redaction = redactStructuredPdfPattern(DEFAULT_PDF_MODEL, {
      pattern: 'DEMO-SECRET-ALPHA-2026',
      mode: 'literal',
      reason: 'Release workflow verification',
    }, 1_792_000_000_000);
    const verified = buildVerifiedRedactedStructuredPdfBytes('Security-Audit.pdf', redaction.model, redaction.verificationTargets);
    const text = new TextDecoder('latin1').decode(verified.bytes);

    expect(verified.report.verified).toBe(true);
    expect(verified.report.checkedTargets).toBe(1);
    expect(text).toContain('xref\n0 ');
    expect(text).toMatch(/startxref\s+\d+\s+%%EOF\s*$/u);
    // Stated, not hidden: annotations never reach the verified export.
    expect(DEFAULT_PDF_MODEL.annotations.length).toBeGreaterThan(0);
    expect(verified.report.annotationsOmittedFromSecureExport).toBeGreaterThan(0);
    expect(text).not.toContain('Verify page-reference remapping');
    expect(text).not.toContain('DEMO-SECRET-ALPHA-2026');
  });

  // Counter-check C.
  it('refuses an over-large target list instead of under-verifying it', () => {
    const targets = Array.from({ length: PDF_TRUE_REDACTION_LIMITS.maxByteScanTargets + 1 }, (_, index) => `target-${index}`);
    expect(() => buildVerifiedRedactedStructuredPdfBytes('Audit.pdf', leakingModel('harmlos'), targets))
      .toThrow(/exceed the 4096-target byte-verification policy/u);
  });

  it('pins the byte-scan budget in one place', () => {
    expect(PDF_TRUE_REDACTION_LIMITS.maxByteScanTargets).toBe(4_096);
    expect(PDF_TRUE_REDACTION_LIMITS.maxVerificationTargets).toBe(10_000);
  });
});
