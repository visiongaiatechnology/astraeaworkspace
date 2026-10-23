// STATUS: PLATIN — W-301: through the real signing writer, the metadata limit refuses instead of cutting.
//
// Measured before the fix, on this exact path: `signPdfDocument` ran `metadata.signerName.trim().slice(0, 160)`
// and `buildUnsignedIncrementalRevision` ran its own `slice(...)` a second time, so a 200-character signer name
// produced a **signed** PDF whose `/Name` held 160 characters and nobody was told. The dialog bounds its inputs
// (`maxLength` 160/512/256), so only a programmatic caller could see it — which is exactly the caller that gets
// no UI feedback at all.
import { describe, expect, it } from 'vitest';
import { signPdfDocument } from '../../signatures/pdfDigitalSignature';
import { signPdfIncrementally } from '../../signatures/incremental/pdfIncrementalSignature';
import { PDF_SIGNATURE_METADATA_LIMITS } from '../../signatures/pdfSignatureContracts';
import type { PdfSignatureMetadata, PdfSigningProvider } from '../../signatures/pdfSignatureContracts';
import { pdfUnicodeTextString, PdfMetadataTextLimitError } from '../../../../platform/interop/pdf/pdfTextStrings';

/** The minimal classic-xref PDF the roundtrip suite uses, inlined so this test owns its own witness. */
function syntheticPdf(): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 595.28 841.89 ] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 72 712 Td (Astraea PDF Test Stream) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000209 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
305
%%EOF`);
}

const provider: PdfSigningProvider = {
  id: 'test-provider',
  label: 'Test identity',
  certificate: { fingerprintSha256: 'a'.repeat(64), algorithm: 'ECDSA-P256', derBytes: new Uint8Array([1, 2, 3]) },
  supportsTrustedTimestamp: true,
  async signDetachedCms() {
    return { cmsBytes: new Uint8Array(256).fill(7), timestampAttested: true };
  },
};

const metadata = (overrides: Partial<PdfSignatureMetadata> = {}): PdfSignatureMetadata => ({
  signerName: 'Ada Lovelace',
  reason: 'Freigabe',
  location: 'Berlin',
  signDate: 1_750_000_000_000,
  padesProfile: 'B-B',
  pageNumber: 1,
  bbox: { x: 0, y: 0, width: 120, height: 40 },
  ...overrides,
});

describe('PDF signature metadata bounds (W-301)', () => {
  it('signs with metadata inside the limits and writes the reason as a UTF-16 text string', async () => {
    const result = await signPdfIncrementally(syntheticPdf(), metadata(), provider);
    const text = new TextDecoder('latin1').decode(result.signedBytes);

    expect(result.signedBytes.byteLength).toBeGreaterThan(0);
    expect(text).toContain(`/Reason (${pdfUnicodeTextString('Freigabe')})`);
    expect(text).toContain(`/Name (${pdfUnicodeTextString('Ada Lovelace')})`);
    expect(text).toContain(`/Location (${pdfUnicodeTextString('Berlin')})`);
  });

  it('carries a newline in the reason instead of deleting it', async () => {
    const result = await signPdfIncrementally(syntheticPdf(), metadata({ reason: 'Zeile 1\nZeile 2' }), provider);
    const text = new TextDecoder('latin1').decode(result.signedBytes);

    expect(text).toContain(pdfUnicodeTextString('Zeile 1\nZeile 2'));
    expect(text).toContain('000A');
  });

  it('refuses a signer name above 160 characters by name', async () => {
    await expect(signPdfIncrementally(syntheticPdf(), metadata({ signerName: 'x'.repeat(161) }), provider))
      .rejects.toThrow(PdfMetadataTextLimitError);
    await expect(signPdfIncrementally(syntheticPdf(), metadata({ signerName: 'x'.repeat(161) }), provider))
      .rejects.toThrow('Signer name exceeds the 160-character PDF metadata limit (161 characters).');
  });

  it('refuses a reason above 512 characters and a location above 256 characters', async () => {
    await expect(signPdfIncrementally(syntheticPdf(), metadata({ reason: 'x'.repeat(513) }), provider))
      .rejects.toThrow('Signing reason exceeds the 512-character PDF metadata limit (513 characters).');
    await expect(signPdfIncrementally(syntheticPdf(), metadata({ location: 'x'.repeat(257) }), provider))
      .rejects.toThrow('Signing location exceeds the 256-character PDF metadata limit (257 characters).');
  });

  // This is the behaviour change W-301 asked for: the public entry point used to cut the name and still report a
  // successful signature.
  it('no longer cuts an over-long signer name silently at the public entry point', async () => {
    await expect(signPdfDocument(syntheticPdf(), metadata({ signerName: 'n'.repeat(200) }), provider))
      .rejects.toThrow('Signer name exceeds the 160-character PDF metadata limit (200 characters).');
    await expect(signPdfDocument(syntheticPdf(), metadata({ signerName: `  ${'n'.repeat(160)}  ` }), provider))
      .resolves.toMatchObject({ signerSubject: 'n'.repeat(160) });
  });

  it('pins the three slot widths in one place', () => {
    expect(PDF_SIGNATURE_METADATA_LIMITS).toEqual({ signerName: 160, reason: 512, location: 256 });
  });
});
