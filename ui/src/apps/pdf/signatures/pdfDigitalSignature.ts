// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — fail-closed cryptographic PDF signing contract.

import { signPdfIncrementally } from './incremental/pdfIncrementalSignature';
import type { PdfSignatureMetadata, PdfSigningProvider, SignedPdfResult, XfaInspectionReport } from './pdfSignatureContracts';
export type { PadesProfile, PdfSignatureMetadata, PdfSigningProvider, PdfSigningProviderCertificate, PdfSigningRequest, PdfSigningResponse, SignedPdfResult, XfaInspectionReport } from './pdfSignatureContracts';



/**
 * XFA compatibility inspection. Dynamic XFA is never silently flattened or rewritten.
 */
export function inspectXfaCompatibility(pdfBytes: Uint8Array): XfaInspectionReport {
  if (pdfBytes.byteLength === 0 || pdfBytes.byteLength > 512 * 1024 * 1024) {
    throw new Error('PDF size is outside supported inspection bounds');
  }
  const pdfString = new TextDecoder('latin1').decode(pdfBytes);
  const hasXfa = /\/XFA\s+(\d+\s+\d+\s+R|\[[^\]]*\])/u.test(pdfString);
  if (!hasXfa) return { hasXfa: false, xfaType: 'none', packetCount: 0, packetsFound: [], isSafeToEdit: true };
  const packetsFound: string[] = [];
  const knownPackets = ['template', 'datasets', 'config', 'localeSet', 'connectionSet', 'sourceSet', 'stylesheet'];
  for (const packet of knownPackets) {
    if (pdfString.includes(`name="${packet}"`) || pdfString.includes(`/${packet}`)) packetsFound.push(packet);
  }
  const isDynamic = packetsFound.includes('template') && packetsFound.includes('datasets');
  return {
    hasXfa: true,
    xfaType: isDynamic ? 'dynamic' : 'static',
    packetCount: packetsFound.length,
    packetsFound,
    isSafeToEdit: !isDynamic,
    corruptionWarning: isDynamic
      ? 'Dynamic XFA detected. Astraea will not rewrite or flatten the XFA payload during signing.'
      : undefined,
  };
}

/** SHA-256 over an exact PDF ByteRange. Fails closed when SubtleCrypto is unavailable. */
export async function calculatePdfByteRangeDigest(
  pdfBytes: Uint8Array,
  byteRange: [number, number, number, number],
): Promise<{ digestHex: string; digestBytes: Uint8Array }> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SubtleCrypto is unavailable');
  const [offset1, length1, offset2, length2] = byteRange;
  if (offset1 !== 0 || length1 < 0 || offset2 < length1 || length2 < 0 || offset2 + length2 > pdfBytes.byteLength) {
    throw new Error('PDF ByteRange is invalid');
  }
  const combined = new Uint8Array(length1 + length2);
  combined.set(pdfBytes.subarray(offset1, offset1 + length1), 0);
  combined.set(pdfBytes.subarray(offset2, offset2 + length2), length1);
  const digestBytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', combined as unknown as BufferSource));
  const digestHex = Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { digestHex, digestBytes };
}

/**
 * Signs the actual PDF bytes through an explicit cryptographic provider.
 * No provider, no CMS, no success state.
 */
export async function signPdfDocument(
  pdfBytes: Uint8Array,
  metadata: PdfSignatureMetadata,
  provider: PdfSigningProvider,
): Promise<SignedPdfResult> {
  if (!provider || typeof provider.signDetachedCms !== 'function') throw new Error('No cryptographic PDF signing provider is configured');
  if (!metadata.signerName.trim()) throw new Error('Signer identity is required');
  if (metadata.padesProfile === 'B-T' && !provider.supportsTrustedTimestamp) {
    throw new Error('PAdES-B-T requires a signing provider with a real RFC 3161 timestamp service');
  }
  return signPdfIncrementally(pdfBytes, {
    ...metadata,
    // W-301: no `slice(...)` here any more. The three metadata widths live once, in
    // `PDF_SIGNATURE_METADATA_LIMITS`, and are enforced by the writer through `pdfMetadataTextString`, which
    // refuses an over-long value by name instead of cutting it where the caller cannot see it.
    signerName: metadata.signerName.trim(),
    reason: metadata.reason.trim(),
    location: metadata.location.trim(),
  }, provider);
}
