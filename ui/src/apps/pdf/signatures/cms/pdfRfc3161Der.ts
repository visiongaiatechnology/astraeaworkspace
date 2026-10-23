// STATUS: PLATIN
// Structural RFC 3161 timestamp response parsing; trust stays in the provider.

import { MAX_DER_BYTES, bytesEqual, children, decodeOidElement, readElement, sliceElement } from './pdfDerParser';
import { CmsOid } from './pdfCmsOids';
import { parseX509CertificateDer } from './pdfX509Der';
import type { ParsedCertificateDer } from './pdfX509Der';
import type { DerElement } from './pdfDerParser';

export interface ParsedRfc3161TimestampResponse {
  status: number;
  tokenDer: Uint8Array;
  tstInfoDer: Uint8Array;
  messageImprintDigest: Uint8Array;
  nonce?: Uint8Array;
  generationTime?: number;
  certificates: ParsedCertificateDer[];
  signerCertificate: ParsedCertificateDer;
  signedAttributesDer: Uint8Array;
  signatureValue: Uint8Array;
  signatureKind: 'rsa' | 'ecdsa';
  messageDigest: Uint8Array;
}

function decodeSmallPositiveInteger(bytes: Uint8Array, element: DerElement): number {
  if (element.tag !== 0x02 || element.valueLength <= 0 || element.valueLength > 6) throw new Error('DER INTEGER is outside supported bounds');
  const valueBytes = bytes.subarray(element.valueStart, element.end);
  if ((valueBytes[0]! & 0x80) !== 0) throw new Error('Negative DER INTEGER is unsupported');
  let value = 0;
  for (const octet of valueBytes) value = value * 256 + octet;
  if (!Number.isSafeInteger(value)) throw new Error('DER INTEGER exceeds safe integer range');
  return value;
}

function normalizedPositiveIntegerBytes(bytes: Uint8Array, element: DerElement): Uint8Array {
  if (element.tag !== 0x02 || element.valueLength <= 0 || element.valueLength > 32) throw new Error('DER INTEGER is outside supported bounds');
  let value = bytes.slice(element.valueStart, element.end);
  if ((value[0]! & 0x80) !== 0) throw new Error('Negative DER INTEGER is unsupported');
  while (value.byteLength > 1 && value[0] === 0) value = value.slice(1);
  return value;
}

function parseGeneralizedTimeElement(bytes: Uint8Array, element: DerElement): number | undefined {
  if (element.tag !== 0x18) return undefined;
  const value = new TextDecoder('ascii').decode(bytes.subarray(element.valueStart, element.end));
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?Z$/u.exec(value);
  if (!match) return undefined;
  const millis = Number((match[7] ?? '').padEnd(3, '0'));
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]), millis);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

/**
 * Parses a DER RFC 3161 TimeStampResp and its embedded CMS TimeStampToken.
 * Cryptographic verification and trust pinning are deliberately performed by
 * the timestamp provider, not by this structural parser.
 */
export function parseRfc3161TimestampResponse(input: Uint8Array): ParsedRfc3161TimestampResponse {
  if (input.byteLength <= 0 || input.byteLength > MAX_DER_BYTES) throw new Error('RFC 3161 response is outside supported bounds');
  const root = readElement(input, 0);
  if (root.tag !== 0x30 || root.end !== input.byteLength) throw new Error('RFC 3161 response must be one DER SEQUENCE');
  const responseChildren = children(input, root);
  if (responseChildren.length < 1 || responseChildren.length > 2 || responseChildren[0]!.tag !== 0x30) throw new Error('RFC 3161 response structure is invalid');
  const statusInfo = children(input, responseChildren[0]!);
  if (!statusInfo[0]) throw new Error('RFC 3161 PKIStatusInfo is missing');
  const status = decodeSmallPositiveInteger(input, statusInfo[0]);
  if (status !== 0 && status !== 1) throw new Error(`RFC 3161 timestamp authority rejected the request with status ${status}`);
  const tokenElement = responseChildren[1];
  if (!tokenElement || tokenElement.tag !== 0x30) throw new Error('RFC 3161 granted response is missing TimeStampToken');
  const tokenDer = sliceElement(input, tokenElement);

  const tokenRoot = readElement(tokenDer, 0);
  const contentInfoChildren = children(tokenDer, tokenRoot);
  if (contentInfoChildren.length !== 2 || decodeOidElement(tokenDer, contentInfoChildren[0]!) !== CmsOid.signedData || contentInfoChildren[1]!.tag !== 0xa0) {
    throw new Error('RFC 3161 TimeStampToken is not CMS SignedData');
  }
  const wrapper = children(tokenDer, contentInfoChildren[1]!);
  if (wrapper.length !== 1 || wrapper[0]!.tag !== 0x30) throw new Error('RFC 3161 SignedData wrapper is invalid');
  const signedDataChildren = children(tokenDer, wrapper[0]!);
  if (signedDataChildren.length < 4) throw new Error('RFC 3161 SignedData is incomplete');

  const digestAlgorithms = signedDataChildren[1]!;
  const digestEntries = children(tokenDer, digestAlgorithms);
  if (digestAlgorithms.tag !== 0x31 || digestEntries.length !== 1 || digestEntries[0]!.tag !== 0x30) throw new Error('RFC 3161 digestAlgorithms is invalid');
  const digestParts = children(tokenDer, digestEntries[0]!);
  if (!digestParts[0] || decodeOidElement(tokenDer, digestParts[0]) !== CmsOid.sha256) throw new Error('RFC 3161 timestamp must use SHA-256');

  const encapContentInfo = signedDataChildren[2]!;
  if (encapContentInfo.tag !== 0x30) throw new Error('RFC 3161 encapsulated content is missing');
  const encapChildren = children(tokenDer, encapContentInfo);
  if (encapChildren.length !== 2 || decodeOidElement(tokenDer, encapChildren[0]!) !== CmsOid.timestampInfoContentType || encapChildren[1]!.tag !== 0xa0) {
    throw new Error('RFC 3161 timestamp token does not contain TSTInfo');
  }
  const eContentChildren = children(tokenDer, encapChildren[1]!);
  if (eContentChildren.length !== 1 || eContentChildren[0]!.tag !== 0x04) throw new Error('RFC 3161 TSTInfo eContent is invalid');
  const tstInfoDer = tokenDer.slice(eContentChildren[0]!.valueStart, eContentChildren[0]!.end);
  const tstRoot = readElement(tstInfoDer, 0);
  if (tstRoot.tag !== 0x30 || tstRoot.end !== tstInfoDer.byteLength) throw new Error('RFC 3161 TSTInfo must be one DER SEQUENCE');
  const tstChildren = children(tstInfoDer, tstRoot);
  if (tstChildren.length < 5 || tstChildren[2]!.tag !== 0x30) throw new Error('RFC 3161 TSTInfo is incomplete');
  const imprintChildren = children(tstInfoDer, tstChildren[2]!);
  if (imprintChildren.length !== 2 || imprintChildren[0]!.tag !== 0x30 || imprintChildren[1]!.tag !== 0x04) throw new Error('RFC 3161 messageImprint is invalid');
  const imprintAlgorithm = children(tstInfoDer, imprintChildren[0]!);
  if (!imprintAlgorithm[0] || decodeOidElement(tstInfoDer, imprintAlgorithm[0]) !== CmsOid.sha256) throw new Error('RFC 3161 messageImprint must use SHA-256');
  const messageImprintDigest = tstInfoDer.slice(imprintChildren[1]!.valueStart, imprintChildren[1]!.end);
  if (messageImprintDigest.byteLength !== 32) throw new Error('RFC 3161 SHA-256 messageImprint length is invalid');
  const generationTime = parseGeneralizedTimeElement(tstInfoDer, tstChildren[4]!);
  let nonce: Uint8Array | undefined;
  for (let index = 5; index < tstChildren.length; index += 1) {
    const candidate = tstChildren[index]!;
    if (candidate.tag === 0x02) {
      nonce = normalizedPositiveIntegerBytes(tstInfoDer, candidate);
      break;
    }
  }

  const certificateContainer = signedDataChildren.find((element, index) => index >= 3 && element.tag === 0xa0);
  const signerInfos = [...signedDataChildren].reverse().find((element) => element.tag === 0x31);
  if (!certificateContainer || !signerInfos) throw new Error('RFC 3161 certificates or signerInfos are missing');
  const certificateElements = children(tokenDer, certificateContainer).filter((element) => element.tag === 0x30);
  if (certificateElements.length === 0 || certificateElements.length > 16) throw new Error('RFC 3161 certificate count is outside supported bounds');
  const certificates = certificateElements.map((element) => parseX509CertificateDer(sliceElement(tokenDer, element)));
  const signerEntries = children(tokenDer, signerInfos);
  if (signerEntries.length !== 1 || signerEntries[0]!.tag !== 0x30) throw new Error('RFC 3161 token must contain exactly one SignerInfo');
  const signerInfo = children(tokenDer, signerEntries[0]!);
  if (signerInfo.length < 6 || signerInfo[1]!.tag !== 0x30) throw new Error('RFC 3161 SignerInfo is incomplete');
  const issuerAndSerial = children(tokenDer, signerInfo[1]!);
  if (issuerAndSerial.length !== 2) throw new Error('RFC 3161 signer identifier is unsupported');
  const signerCertificate = certificates.find((certificate) =>
    bytesEqual(certificate.issuerDer, sliceElement(tokenDer, issuerAndSerial[0]!))
    && bytesEqual(certificate.serialNumberDer, sliceElement(tokenDer, issuerAndSerial[1]!)),
  );
  if (!signerCertificate) throw new Error('RFC 3161 signer certificate is not embedded');
  const signerDigest = children(tokenDer, signerInfo[2]!);
  if (!signerDigest[0] || decodeOidElement(tokenDer, signerDigest[0]) !== CmsOid.sha256) throw new Error('RFC 3161 SignerInfo digest algorithm must be SHA-256');
  const signedAttributes = signerInfo[3]!;
  if (signedAttributes.tag !== 0xa0) throw new Error('RFC 3161 signed attributes are required');
  const signatureAlgorithm = children(tokenDer, signerInfo[4]!);
  if (!signatureAlgorithm[0]) throw new Error('RFC 3161 signature algorithm is missing');
  const signatureOid = decodeOidElement(tokenDer, signatureAlgorithm[0]);
  const signatureKind = (signatureOid === CmsOid.rsaEncryption || signatureOid === CmsOid.sha256WithRsaEncryption) ? 'rsa' : signatureOid === CmsOid.ecdsaWithSha256 ? 'ecdsa' : null;
  if (!signatureKind) throw new Error(`RFC 3161 signature algorithm ${signatureOid} is unsupported`);
  const signatureValueElement = signerInfo[5]!;
  if (signatureValueElement.tag !== 0x04 || signatureValueElement.valueLength <= 0) throw new Error('RFC 3161 signature value is missing');
  let messageDigest: Uint8Array | undefined;
  for (const attribute of children(tokenDer, signedAttributes)) {
    if (attribute.tag !== 0x30) continue;
    const parts = children(tokenDer, attribute);
    if (parts.length !== 2 || parts[0]!.tag !== 0x06 || parts[1]!.tag !== 0x31) continue;
    if (decodeOidElement(tokenDer, parts[0]!) !== CmsOid.messageDigest) continue;
    const values = children(tokenDer, parts[1]!);
    if (values[0]?.tag === 0x04) messageDigest = tokenDer.slice(values[0].valueStart, values[0].end);
  }
  if (!messageDigest || messageDigest.byteLength !== 32) throw new Error('RFC 3161 CMS messageDigest is missing or invalid');
  const signedAttributesDer = sliceElement(tokenDer, signedAttributes);
  signedAttributesDer[0] = 0x31;

  return {
    status,
    tokenDer,
    tstInfoDer,
    messageImprintDigest,
    nonce,
    generationTime,
    certificates,
    signerCertificate,
    signedAttributesDer,
    signatureValue: tokenDer.slice(signatureValueElement.valueStart, signatureValueElement.end),
    signatureKind,
    messageDigest,
  };
}
