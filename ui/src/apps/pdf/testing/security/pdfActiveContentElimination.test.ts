// STATUS: PLATIN — direct byte regressions for the current fail-closed PDF marker policy.
import { describe, expect, it } from 'vitest';
import { assertPdfActiveContentEliminated } from '../../interchange/security/pdfActiveContentElimination';

const activeMarkers = [
  '/JavaScript', '/JS', '/Launch', '/OpenAction', '/AA', '/EmbeddedFiles',
  '/EmbeddedFile', '/FileAttachment', '/Filespec', '/EF <<',
] as const;

describe('PDF active-content marker policy', () => {
  it('accepts passive output with no active-action names', () => {
    const passivePdf = new TextEncoder().encode('%PDF-1.7\n<< /Type /Catalog /Pages 1 0 R >>\n%%EOF');
    expect(() => assertPdfActiveContentEliminated(passivePdf)).not.toThrow();
  });

  it.each(activeMarkers)('rejects the active marker %s', (marker) => {
    const unsafePdf = new TextEncoder().encode(`%PDF-1.7\n<< /Catalog << ${marker} >> >>\n%%EOF`);
    expect(() => assertPdfActiveContentEliminated(unsafePdf))
      .toThrow('PDF active-content elimination failed closed.');
  });

  it('does not mistake longer passive names for exact active markers', () => {
    const passivePdf = new TextEncoder().encode('%PDF-1.7\n/JavaScriptAction /LaunchPad /OpenActions\n%%EOF');
    expect(() => assertPdfActiveContentEliminated(passivePdf)).not.toThrow();
  });
});
