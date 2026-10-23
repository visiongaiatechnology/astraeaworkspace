// STATUS: DIAMANT VGT SUPREME
// RFC 3161 timestamp adapter with nonce/imprint binding and pinned TSA signer trust.

import {
  CmsOid,
  bytesToHex,
  derBoolean,
  derInteger,
  derNull,
  derOctetString,
  derOid,
  derPositiveIntegerBytes,
  derSequence,
  parseRfc3161TimestampResponse,
} from '../cms/pdfCmsDer';
import { verifyCmsSignature } from '../validation/pdfSignatureValidation';

const MAX_TIMESTAMP_RESPONSE_BYTES = 1024 * 1024;

export interface PdfRfc3161Transport {
  id: string;
  label: string;
  requestTimestamp: (requestDer: Uint8Array) => Promise<Uint8Array>;
}

export interface PdfTrustedTimestampResult {
  tokenDer: Uint8Array;
  generationTime: number;
  signerFingerprintSha256: string;
  authorityLabel: string;
}

export interface PdfTrustedTimestampProvider {
  id: string;
  label: string;
  timestampSignature: (signatureValue: Uint8Array) => Promise<PdfTrustedTimestampResult>;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('RFC 3161 requires WebCrypto SubtleCrypto');
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function normalizeFingerprint(value: string): string {
  const normalized = value.replace(/[^0-9A-F]/giu, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/u.test(normalized)) throw new Error('Trusted TSA signer fingerprint must be SHA-256 hex');
  return normalized;
}

export async function buildRfc3161TimestampRequest(signatureValue: Uint8Array): Promise<{
  requestDer: Uint8Array;
  messageImprintDigest: Uint8Array;
  nonce: Uint8Array;
}> {
  if (signatureValue.byteLength <= 0 || signatureValue.byteLength > 64 * 1024) throw new Error('Signature value is outside RFC 3161 request bounds');
  if (!globalThis.crypto?.getRandomValues) throw new Error('RFC 3161 requires a cryptographically secure random source');
  const messageImprintDigest = await sha256(signatureValue);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const messageImprint = derSequence(
    derSequence(derOid(CmsOid.sha256), derNull()),
    derOctetString(messageImprintDigest),
  );
  const requestDer = derSequence(
    derInteger(1),
    messageImprint,
    derPositiveIntegerBytes(nonce),
    derBoolean(true),
  );
  return { requestDer, messageImprintDigest, nonce };
}

export function createPinnedRfc3161TimestampProvider(
  transport: PdfRfc3161Transport,
  trustedSignerFingerprintsSha256: readonly string[],
): PdfTrustedTimestampProvider {
  if (!transport?.id || !transport?.label || typeof transport.requestTimestamp !== 'function') throw new Error('RFC 3161 transport adapter is invalid');
  const trusted = new Set(trustedSignerFingerprintsSha256.map(normalizeFingerprint));
  if (trusted.size === 0 || trusted.size > 32) throw new Error('At least one and at most 32 trusted TSA signer fingerprints are required');

  return {
    id: `rfc3161:${transport.id}`,
    label: `RFC 3161 · ${transport.label}`,
    async timestampSignature(signatureValue: Uint8Array): Promise<PdfTrustedTimestampResult> {
      const request = await buildRfc3161TimestampRequest(signatureValue);
      const responseBytes = await transport.requestTimestamp(request.requestDer);
      if (!(responseBytes instanceof Uint8Array) || responseBytes.byteLength <= 0 || responseBytes.byteLength > MAX_TIMESTAMP_RESPONSE_BYTES) {
        throw new Error('RFC 3161 transport returned an invalid response size');
      }
      const parsed = parseRfc3161TimestampResponse(responseBytes);
      if (!constantTimeEqual(parsed.messageImprintDigest, request.messageImprintDigest)) throw new Error('RFC 3161 response messageImprint does not match the PDF signature value');
      if (!parsed.nonce || !constantTimeEqual(parsed.nonce, request.nonce)) throw new Error('RFC 3161 response nonce does not match the request');
      const tstInfoDigest = await sha256(parsed.tstInfoDer);
      if (!constantTimeEqual(tstInfoDigest, parsed.messageDigest)) throw new Error('RFC 3161 CMS messageDigest does not match TSTInfo');
      const cmsSignatureValid = await verifyCmsSignature(parsed.signerCertificate, parsed.signatureKind, parsed.signedAttributesDer, parsed.signatureValue);
      if (!cmsSignatureValid) throw new Error('RFC 3161 TimeStampToken CMS signature is invalid');
      const signerFingerprintSha256 = bytesToHex(await sha256(parsed.signerCertificate.certificateDer));
      if (!trusted.has(signerFingerprintSha256)) throw new Error('RFC 3161 TSA signer certificate is not pinned as trusted');
      if (!parsed.generationTime) throw new Error('RFC 3161 timestamp is missing a valid generation time');
      return {
        tokenDer: parsed.tokenDer,
        generationTime: parsed.generationTime,
        signerFingerprintSha256,
        authorityLabel: transport.label,
      };
    },
  };
}
