// STATUS: PLATIN — exercises the structured redaction workflow through byte export.
import { expect, it } from 'vitest';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { buildVerifiedRedactedStructuredPdfBytes, redactStructuredPdfPattern } from './pdfTrueRedaction';

it('exports a verified redaction from the bundled PDF Studio demonstration model', () => {
  const redaction = redactStructuredPdfPattern(DEFAULT_PDF_MODEL, {
    pattern: 'DEMO-SECRET-ALPHA-2026',
    mode: 'literal',
    reason: 'Release workflow verification',
  }, 1_792_000_000_000);

  expect(redaction.matchCount).toBe(1);
  const verified = buildVerifiedRedactedStructuredPdfBytes(
    'Security-Audit.pdf',
    redaction.model,
    redaction.verificationTargets,
  );

  expect(verified.report.incrementalHistoryAbsent).toBe(true);
  expect(new TextDecoder('latin1').decode(verified.bytes)).toContain('/Prev');
});
