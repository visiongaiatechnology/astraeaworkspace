// STATUS: PLATIN — shared PDF signing request, provider, result, and inspection contracts

export type PadesProfile = 'B-B' | 'B-T';

export interface PdfSigningProviderCertificate {
  fingerprintSha256: string;
  algorithm: string;
  derBytes: Uint8Array;
  chainDerBytes?: Uint8Array[];
}

export interface PdfSigningRequest {
  profile: PadesProfile;
  digestAlgorithm: 'SHA-256';
  pdfDigest: Uint8Array;
  signingTime: number;
}

export interface PdfSigningResponse {
  cmsBytes: Uint8Array;
  timestampAttested: boolean;
}

export interface PdfSigningProvider {
  id: string;
  label: string;
  certificate: PdfSigningProviderCertificate;
  supportsTrustedTimestamp: boolean;
  signDetachedCms: (request: PdfSigningRequest) => Promise<PdfSigningResponse>;
}

export interface PdfSignatureMetadata {
  signerName: string;
  reason: string;
  location: string;
  contactInfo?: string;
  signDate: number;
  padesProfile: PadesProfile;
  pageNumber: number;
  bbox: { x: number; y: number; width: number; height: number };
}

/**
 * W-301: the three metadata slots of a signature dictionary and the width each is delivered with — **one**
 * definition. Measured before this constant existed: `pdfDigitalSignature.ts` cut at 160/512/256 with
 * `slice(...)` and `pdfIncrementalSignature.ts` repeated the same three numbers, so the rule lived twice and
 * neither copy was visible to the caller. The dialog already bounds its inputs with the same numbers
 * (`maxLength` 160/512/256 in `PdfDigitalSignatureModal.tsx`), so this only decides what a programmatic caller
 * may pass — and an over-long value is now refused by name instead of being cut.
 */
export const PDF_SIGNATURE_METADATA_LIMITS = Object.freeze({
  signerName: 160,
  reason: 512,
  location: 256,
});

export interface SignedPdfResult {
  signedBytes: Uint8Array;
  byteRange: [number, number, number, number];
  contentDigestHex: string;
  signatureValueHex: string;
  timestampAttested: boolean;
  signerSubject: string;
  providerLabel: string;
  certificateFingerprintSha256: string;
}

export interface XfaInspectionReport {
  hasXfa: boolean;
  xfaType: 'none' | 'static' | 'dynamic';
  packetCount: number;
  packetsFound: string[];
  isSafeToEdit: boolean;
  corruptionWarning?: string;
}
