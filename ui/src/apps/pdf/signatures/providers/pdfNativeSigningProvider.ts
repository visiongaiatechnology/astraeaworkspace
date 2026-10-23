// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — native OS-keystore / PKCS#11 PDF signing provider.

import { invokeNative, isNativeDesktop } from '../../../../platform/native/nativeBridge';
import {
  buildDetachedCadesCms,
  bytesToHex,
  cmsSignedAttributes,
  parseX509CertificateDer,
} from '../cms/pdfCmsDer';
import type { PdfSigningProvider, PdfSigningRequest, PdfSigningResponse } from '../pdfDigitalSignature';
import type { PdfTrustedTimestampProvider } from '../timestamps/pdfRfc3161Timestamp';

export interface NativePdfSigningIdentity {
  id: string;
  label: string;
  source: 'windows-cert-store' | 'pkcs11';
  algorithm: 'RSA' | 'ECDSA';
  certificateDerBase64: string;
  chainDerBase64: string[];
  hardwareBacked: boolean;
}

interface NativeIdentityListResponse {
  available?: boolean;
  provider?: string;
  reason?: string;
  identities?: NativePdfSigningIdentity[];
}

interface NativeSignResponse {
  success?: boolean;
  signatureBase64?: string | null;
  error?: string | null;
}

const MAX_CERTIFICATE_BYTES = 1024 * 1024;
const MAX_CHAIN_CERTIFICATES = 16;

const decodeBase64 = (input: string, maxBytes = MAX_CERTIFICATE_BYTES): Uint8Array => {
  if (!input || input.length > Math.ceil(maxBytes / 3) * 4 + 16) throw new Error('Native signing certificate exceeds the bounded transfer policy');
  const binary = atob(input);
  if (binary.length <= 0 || binary.length > maxBytes) throw new Error('Native signing certificate violates the byte policy');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const encodeBase64 = (bytes: Uint8Array): string => {
  if (bytes.byteLength > 64 * 1024) throw new Error('Native signing request exceeds the bounded attribute policy');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 8192)));
  return btoa(binary);
};

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SHA-256 is unavailable');
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
};

const validateIdentity = (candidate: NativePdfSigningIdentity): NativePdfSigningIdentity => {
  if (!candidate || typeof candidate !== 'object') throw new Error('Native signing identity is invalid');
  if (!candidate.id || candidate.id.length > 512 || !candidate.label || candidate.label.length > 512) throw new Error('Native signing identity metadata exceeds policy');
  if (candidate.source !== 'windows-cert-store' && candidate.source !== 'pkcs11') throw new Error('Unknown native signing identity source');
  if (candidate.algorithm !== 'RSA' && candidate.algorithm !== 'ECDSA') throw new Error('Unsupported native signing algorithm');
  if (!Array.isArray(candidate.chainDerBase64) || candidate.chainDerBase64.length > MAX_CHAIN_CERTIFICATES) throw new Error('Native certificate chain exceeds policy');
  decodeBase64(candidate.certificateDerBase64);
  for (const certificate of candidate.chainDerBase64) decodeBase64(certificate);
  return candidate;
};

export async function listNativePdfSigningIdentities(): Promise<{ available: boolean; provider: string; reason: string; identities: NativePdfSigningIdentity[] }> {
  if (!isNativeDesktop()) return { available: false, provider: 'Unavailable', reason: 'Native signing requires Astraea Desktop.', identities: [] };
  const response = await invokeNative<NativeIdentityListResponse>('vgt_pdf_signing_identities');
  const identities = Array.isArray(response.identities) ? response.identities.slice(0, 256).map(validateIdentity) : [];
  return {
    available: response.available === true,
    provider: typeof response.provider === 'string' ? response.provider.slice(0, 256) : 'Native provider',
    reason: typeof response.reason === 'string' ? response.reason.slice(0, 512) : '',
    identities,
  };
}

export async function createNativePdfSigningProvider(
  identity: NativePdfSigningIdentity,
  trustedTimestampProvider?: PdfTrustedTimestampProvider,
): Promise<PdfSigningProvider> {
  if (!isNativeDesktop()) throw new Error('Native signing provider is unavailable outside Astraea Desktop');
  const verified = validateIdentity(identity);
  const certificateDer = decodeBase64(verified.certificateDerBase64);
  const parsedCertificate = parseX509CertificateDer(certificateDer);
  const chainDerBytes = verified.chainDerBase64.map((entry) => decodeBase64(entry));
  const fingerprint = bytesToHex(await sha256(certificateDer));

  return {
    id: `native:${verified.id}`,
    label: `${verified.label} · ${verified.source}${verified.hardwareBacked ? ' · hardware-backed' : ''}`,
    certificate: {
      fingerprintSha256: fingerprint,
      algorithm: verified.algorithm,
      derBytes: certificateDer,
      chainDerBytes: chainDerBytes.length ? chainDerBytes : [certificateDer],
    },
    supportsTrustedTimestamp: Boolean(trustedTimestampProvider),
    async signDetachedCms(request: PdfSigningRequest): Promise<PdfSigningResponse> {
      if (request.digestAlgorithm !== 'SHA-256' || request.pdfDigest.byteLength !== 32) throw new Error('Only SHA-256 PDF digests are accepted');
      if (request.profile === 'B-T' && !trustedTimestampProvider) throw new Error('PAdES-B-T requires a configured trusted RFC 3161 timestamp provider');
      const certDigest = await sha256(certificateDer);
      const signedAttributes = cmsSignedAttributes(request.pdfDigest, certDigest, request.signingTime);
      const response = await invokeNative<NativeSignResponse>('vgt_pdf_signing_sign', {
        request: { identity_id: verified.id, data_base64: encodeBase64(signedAttributes) },
      });
      if (response.success !== true || typeof response.signatureBase64 !== 'string') throw new Error(response.error || 'Native signing provider rejected the request');
      const signature = decodeBase64(response.signatureBase64, 64 * 1024);
      const trustedTimestamp = request.profile === 'B-T' ? await trustedTimestampProvider!.timestampSignature(signature) : null;
      const cmsBytes = buildDetachedCadesCms(
        parsedCertificate,
        signedAttributes,
        signature,
        verified.algorithm === 'RSA' ? 'rsa' : 'ecdsa',
        chainDerBytes.length ? chainDerBytes.map((bytes) => parseX509CertificateDer(bytes)) : [parsedCertificate],
        trustedTimestamp?.tokenDer,
      );
      return { cmsBytes, timestampAttested: Boolean(trustedTimestamp) };
    },
  };
}
