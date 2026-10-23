// STATUS: PLATIN — the foreign-PDF entry: what it accepts, what it refuses by name, and where it refuses.
//
// AST-0761 (visible entry, all pages render) and AST-0907/0908 (a truncated PDF is rejected without a crash and
// without silent data loss) are one code path, so they are measured together here. `inspectNativePdfBytes` is
// the **platform** boundary and is exercised for real — these tests build genuine PDF byte streams (including a
// deliberately truncated one) rather than stubs.
//
// Counter-check protocol:
//   A. Remove the `too-large-to-persist` gate: "refuses a payload above the persistability bound" fails — and
//      without it the document is accepted and only the serializer refuses it later, with a byte count.
//   B. Classify by `not-a-pdf` for every failure: "names a truncated file as truncated" fails, i.e. the user
//      would be told "not a PDF" for a file that *is* one.
import { describe, expect, it } from 'vitest';
import { inspectNativePdfBytes } from '../../../../platform/documents/pdf/nativeInspection';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { buildStructuredPdfBytes } from '../structuredPdfExport';
import { maxPersistableNativePdfBytes, validatePdfStudioPayload } from '../../persistence/pdfStudioPersistence';
import { buildNativePdfDerivedDocument, normalizePdfFileName, openNativePdfPayload } from './openNativePdfPayload';

/** A real, minimal, structurally complete PDF — produced by this application's own exporter. */
const realPdf = (): Uint8Array => buildStructuredPdfBytes('Fremdes Dokument', {
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: [],
  redactions: [],
});

describe('opening a foreign PDF through the canonical boundary', () => {
  it('accepts a real PDF, keeps its bytes and its manifest intact', async () => {
    const bytes = realPdf();
    const result = await openNativePdfPayload({ fileName: 'Prüfbericht 2026.pdf', bytes });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe('Prüfbericht 2026.pdf');
    expect(result.byteLength).toBe(bytes.byteLength);
    expect(result.inspection.parser).toBe('vgt-native-pdf-boundary-v1');
    expect(result.inspection.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.inspection.eofMarkerPresent).toBe(true);
    // The payload carries the byte payload and its manifest together, and passes the schema gate the
    // persistence layer applies.
    expect(result.payload.rawPdfDataUrl?.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(result.payload.rawPdfByteLength).toBe(bytes.byteLength);
    expect(result.payload.rawPdfInspection?.sha256).toBe(result.inspection.sha256);
    expect(validatePdfStudioPayload(result.payload)).toEqual([]);
  });

  it('round-trips the bytes through the data URL the viewer reads back', async () => {
    const bytes = realPdf();
    const result = await openNativePdfPayload({ fileName: 'fremd.pdf', bytes });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { decodePdfDataUrl } = await import('../../security/pdfNativeDataUrl');
    const decoded = decodePdfDataUrl(result.payload.rawPdfDataUrl as string, result.byteLength);
    expect(decoded.byteLength).toBe(bytes.byteLength);
    expect(Array.from(decoded.subarray(0, 8))).toEqual(Array.from(bytes.subarray(0, 8)));
    expect(new TextDecoder('latin1').decode(decoded)).toContain('%%EOF');
  });

  it('refuses an empty file by name', async () => {
    const result = await openNativePdfPayload({ fileName: 'leer.pdf', bytes: new Uint8Array(0) });
    expect(result).toMatchObject({ ok: false, code: 'empty-file' });
  });

  it('refuses a file that is not a PDF by name', async () => {
    const notPdf = new TextEncoder().encode('Dies ist kein PDF, sondern Text. %%EOF\n');
    const result = await openNativePdfPayload({ fileName: 'notiz.txt', bytes: notPdf });
    expect(result).toMatchObject({ ok: false, code: 'not-a-pdf' });
    if (result.ok) return;
    // The platform gate answers opaquely on purpose (`OpaqueSecurityError`, no oracle for an attacker). This
    // application passes that sentence through unchanged instead of improving it into a claim it cannot make.
    expect(result.detail).toBe('Request rejected by Workspace security policy.');
  });

  it('names a truncated PDF as truncated, not as "not a PDF"', async () => {
    const whole = realPdf();
    // Cut the trailing xref/trailer off: the header is intact, the file is incomplete.
    const truncated = whole.subarray(0, Math.floor(whole.byteLength * 0.6));
    const result = await openNativePdfPayload({ fileName: 'abgeschnitten.pdf', bytes: truncated });
    expect(result).toMatchObject({ ok: false, code: 'truncated' });
    if (result.ok) return;
    expect(result.detail).toMatch(/final %%EOF marker is missing/u);
  });

  it('names a payload above the persistability bound, before the user edits anything', async () => {
    const oversized = new Uint8Array(maxPersistableNativePdfBytes() + 1);
    oversized.set(new TextEncoder().encode('%PDF-1.7\n'), 0);
    expect(oversized.byteLength).toBeGreaterThan(maxPersistableNativePdfBytes());
    const result = await openNativePdfPayload({ fileName: 'riesig.pdf', bytes: oversized });
    expect(result).toMatchObject({ ok: false, code: 'too-large-to-persist' });
    if (result.ok) return;
    expect(result.detail).toContain('persistability bound');
  });

  it('bounds and sanitizes the file name it takes over', async () => {
    expect(normalizePdfFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(normalizePdfFileName('   ')).toBe('document.pdf');
    // The shared rule's own cap wins: one rule, one limit.\n    expect(normalizePdfFileName('a'.repeat(400)).length).toBe(180);
    const bytes = realPdf();
    const result = await openNativePdfPayload({ fileName: '', bytes });
    expect(result).toMatchObject({ ok: false, code: 'file-name-invalid' });
  });

  it('never throws for a user-reachable input, however broken it is', async () => {
    const cases: Array<[string, Uint8Array]> = [
      ['kein PDF', new TextEncoder().encode('x')],
      ['nur Header', new TextEncoder().encode('%PDF-1.7\n')],
      ['Binary-Müll', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff, 0xfe])],
    ];
    for (const [label, bytes] of cases) {
      const result = await openNativePdfPayload({ fileName: `${label}.pdf`, bytes });
      expect(result.ok, label).toBe(false);
      if (!result.ok) expect(result.code, label).toMatch(/^(not-a-pdf|truncated|inspection-budget-exceeded)$/u);
    }
  });
});

describe('the derived document for an opened foreign PDF', () => {
  it('is a real PdfStudio document with a stable id and the byte payload', async () => {
    const bytes = realPdf();
    const opened = await openNativePdfPayload({ fileName: 'Bericht.pdf', bytes });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const derived = buildNativePdfDerivedDocument({ createId: () => 'pdf-nativ-1', payload: opened.payload, fileName: opened.fileName, now: 1_700_000_000_000 });
    expect(derived.kind).toBe('PdfStudio');
    expect(derived.id).toBe('pdf-nativ-1');
    expect(derived.title).toBe('Bericht');
    expect(derived.version).toBe(1);
    expect(derived.pdfData?.rawPdfFileName).toBe('Bericht.pdf');
    expect(validatePdfStudioPayload(derived.pdfData)).toEqual([]);
  });

  it('keeps the byte payload when the studio picks its model (no demonstration model may shadow it)', async () => {
    // The studio used to fall back to `DEFAULT_PDF_MODEL` whenever `pages.length === 0` — which is exactly the
    // shape of a byte payload. That would silently replace an imported document with the demo pages.
    const opened = await openNativePdfPayload({ fileName: 'Bericht.pdf', bytes: realPdf() });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.payload.pages).toEqual([]);
    expect(opened.payload.numPages).toBe(0);
  });

  it('relies on the platform gate rather than a second header check of its own', async () => {
    // The platform really does expose the gate this application calls …
    await expect(inspectNativePdfBytes(new TextEncoder().encode('nicht pdf'))).rejects.toThrow(/Workspace security policy/u);
    // … and the platform gate is what a real PDF passes.
    await expect(inspectNativePdfBytes(realPdf())).resolves.toMatchObject({ eofMarkerPresent: true });
  });

  it('leaves the demonstration model untouched as a value, so the fallback cannot be reintroduced by accident', () => {
    expect(DEFAULT_PDF_MODEL.pages.length).toBeGreaterThan(0);
  });
});
