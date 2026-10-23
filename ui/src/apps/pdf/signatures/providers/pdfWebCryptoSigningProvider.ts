// STATUS: DIAMANT VGT SUPREME
import {
  buildDetachedCadesCms,
  bytesToHex,
  cmsSignedAttributes,
  normalizeEcdsaWebCryptoSignature,
  parseX509CertificateDer,
  pemBundleToDer,
  pemToDer,
  type ParsedCertificateDer,
} from '../cms/pdfCmsDer';
import type { PdfSigningProvider, PdfSigningProviderCertificate, PdfSigningRequest, PdfSigningResponse } from '../pdfDigitalSignature';
import type { PdfTrustedTimestampProvider } from '../timestamps/pdfRfc3161Timestamp';
import { toOwnedArrayBuffer } from '../../../../shared/binary/ownedBufferSource';

type SupportedPrivateKey = {
  key: CryptoKey;
  kind: 'rsa' | 'ecdsa';
  curve?: 'P-256' | 'P-384';
};

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SubtleCrypto is unavailable');
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
}

async function importPrivateKey(pkcs8: Uint8Array): Promise<SupportedPrivateKey> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SubtleCrypto is unavailable');
  const attempts: Array<() => Promise<SupportedPrivateKey>> = [
    async () => ({
      key: await globalThis.crypto.subtle.importKey('pkcs8', pkcs8 as unknown as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']),
      kind: 'rsa',
    }),
    async () => ({
      key: await globalThis.crypto.subtle.importKey('pkcs8', pkcs8 as unknown as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
      kind: 'ecdsa',
      curve: 'P-256',
    }),
    async () => ({
      key: await globalThis.crypto.subtle.importKey('pkcs8', pkcs8 as unknown as BufferSource, { name: 'ECDSA', namedCurve: 'P-384' }, false, ['sign']),
      kind: 'ecdsa',
      curve: 'P-384',
    }),
  ];
  for (const attempt of attempts) {
    try { return await attempt(); } catch { /* try next supported algorithm */ }
  }
  throw new Error('PKCS#8 key must be RSA PKCS#1-v1_5 or ECDSA P-256/P-384 and must not be password-encrypted');
}

async function verifyKeyMatchesCertificate(certificate: ParsedCertificateDer, privateKey: SupportedPrivateKey): Promise<void> {
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  if (privateKey.kind === 'rsa') {
    const publicKey = await globalThis.crypto.subtle.importKey(
      'spki', certificate.subjectPublicKeyInfoDer as unknown as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    const signature = await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey.key, challenge as unknown as BufferSource);
    const valid = await globalThis.crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, challenge as unknown as BufferSource);
    if (!valid) throw new Error('Private key does not match the imported X.509 certificate');
    return;
  }
  const curve = privateKey.curve!;
  const publicKey = await globalThis.crypto.subtle.importKey(
    'spki', certificate.subjectPublicKeyInfoDer as unknown as BufferSource,
    { name: 'ECDSA', namedCurve: curve }, false, ['verify'],
  );
  const signature = await globalThis.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey.key, challenge as unknown as BufferSource);
  const valid = await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, challenge as unknown as BufferSource);
  if (!valid) throw new Error('Private key does not match the imported X.509 certificate');
}

function decodePemOrDer(bytes: Uint8Array, acceptedLabels: readonly string[]): Uint8Array {
  if (bytes.byteLength === 0) throw new Error('Identity file is empty');
  if (bytes.byteLength > 1024 * 1024) throw new Error('Identity file exceeds 1 MiB limit');
  if (bytes[0] === 0x30) return bytes.slice();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return pemToDer(text, acceptedLabels);
}

function decodeCertificateChain(bytes: Uint8Array): Uint8Array[] {
  if (bytes.byteLength === 0) throw new Error('Certificate file is empty');
  if (bytes.byteLength > 1024 * 1024) throw new Error('Certificate file exceeds 1 MiB limit');
  if (bytes[0] === 0x30) return [bytes.slice()];
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return pemBundleToDer(text, 'CERTIFICATE', 16);
}

export async function createWebCryptoCmsSigningProvider(
  certificateFileBytes: Uint8Array,
  privateKeyFileBytes: Uint8Array,
  trustedTimestampProvider?: PdfTrustedTimestampProvider,
): Promise<PdfSigningProvider> {
  const certificateChainDer = decodeCertificateChain(certificateFileBytes);
  const privateKeyDer = decodePemOrDer(privateKeyFileBytes, ['PRIVATE KEY']);
  const parsedChain = certificateChainDer.map((certificateDer) => parseX509CertificateDer(certificateDer));
  const privateKey = await importPrivateKey(privateKeyDer);
  let parsedCertificate: ParsedCertificateDer | null = null;
  for (const candidate of parsedChain) {
    try {
      await verifyKeyMatchesCertificate(candidate, privateKey);
      parsedCertificate = candidate;
      break;
    } catch {
      // Certificate bundles may list intermediates/root before the leaf; continue until the private key matches.
    }
  }
  if (!parsedCertificate) throw new Error('Private key does not match any X.509 certificate in the imported bundle');
  const certificateDer = parsedCertificate.certificateDer;
  const fingerprint = bytesToHex(await sha256(certificateDer));
  const certificate: PdfSigningProviderCertificate = {
    fingerprintSha256: fingerprint,
    algorithm: privateKey.kind === 'rsa' ? 'RSA' : `ECDSA-${privateKey.curve}`,
    derBytes: certificateDer,
    chainDerBytes: parsedChain.map((candidate) => candidate.certificateDer),
  };

  return {
    id: `webcrypto:${fingerprint.slice(0, 24)}`,
    label: 'Imported X.509 + PKCS#8 (WebCrypto)',
    certificate,
    supportsTrustedTimestamp: Boolean(trustedTimestampProvider),
    async signDetachedCms(request: PdfSigningRequest): Promise<PdfSigningResponse> {
      if (request.digestAlgorithm !== 'SHA-256' || request.pdfDigest.byteLength !== 32) throw new Error('Only SHA-256 PDF digests are accepted');
      if (request.profile === 'B-T' && !trustedTimestampProvider) throw new Error('PAdES-B-T requires a configured trusted RFC 3161 timestamp provider');
      const certDigest = await sha256(certificateDer);
      const signedAttributes = cmsSignedAttributes(request.pdfDigest, certDigest, request.signingTime);
      let signature = new Uint8Array(await globalThis.crypto.subtle.sign(
        privateKey.kind === 'rsa' ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' },
        privateKey.key,
        signedAttributes as unknown as BufferSource,
      ));
      if (privateKey.kind === 'ecdsa') signature = new Uint8Array(toOwnedArrayBuffer(normalizeEcdsaWebCryptoSignature(signature)));
      const trustedTimestamp = request.profile === 'B-T'
        ? await trustedTimestampProvider!.timestampSignature(signature)
        : null;
      const cmsBytes = buildDetachedCadesCms(
        parsedCertificate,
        signedAttributes,
        signature,
        privateKey.kind,
        parsedChain,
        trustedTimestamp?.tokenDer,
      );
      return { cmsBytes, timestampAttested: Boolean(trustedTimestamp) };
    },
  };
}
