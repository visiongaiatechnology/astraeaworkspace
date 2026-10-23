// STATUS: PLATIN
// Detached CAdES/CMS encoding and parsing for PDF signatures.

import { MAX_DER_BYTES, bytesEqual, children, decodeOidElement, readElement, sliceElement } from './pdfDerParser';
import { concatBytes, derContext, derInteger, derNull, derOctetString, derOid, derSequence, derSet, derUtcTime } from './pdfDerPrimitives';
import { CmsOid } from './pdfCmsOids';
import { parseX509CertificateDer } from './pdfX509Der';
import type { ParsedCertificateDer } from './pdfX509Der';
import type { DerElement } from './pdfDerParser';

export function cmsSignedAttributes(pdfDigest: Uint8Array, certificateDigest: Uint8Array, signingTime: number): Uint8Array {
  if (pdfDigest.byteLength !== 32 || certificateDigest.byteLength !== 32) throw new Error('CMS SHA-256 digests must be 32 bytes');
  const attribute = (oid: string, value: Uint8Array) => derSequence(derOid(oid), derSet(value));
  const essCertIdV2 = derSequence(derOctetString(certificateDigest));
  return derSet(
    attribute(CmsOid.contentType, derOid(CmsOid.data)),
    attribute(CmsOid.messageDigest, derOctetString(pdfDigest)),
    attribute(CmsOid.signingTime, derUtcTime(signingTime)),
    attribute(CmsOid.signingCertificateV2, derSequence(essCertIdV2)),
  );
}

export function buildDetachedCadesCms(
  certificate: ParsedCertificateDer,
  signedAttributesSet: Uint8Array,
  signatureValue: Uint8Array,
  signatureKind: 'rsa' | 'ecdsa',
  certificateChain: readonly ParsedCertificateDer[] = [certificate],
  signatureTimestampTokenDer?: Uint8Array,
): Uint8Array {
  if (signedAttributesSet[0] !== 0x31) throw new Error('CMS signed attributes must be a DER SET');
  if (certificateChain.length === 0 || certificateChain.length > 16) throw new Error('CMS certificate chain count is outside supported bounds');
  const signedAttrsImplicit = signedAttributesSet.slice();
  signedAttrsImplicit[0] = 0xa0;
  const digestAlgorithm = derSequence(derOid(CmsOid.sha256), derNull());
  const signatureAlgorithm = signatureKind === 'rsa'
    ? derSequence(derOid(CmsOid.rsaEncryption), derNull())
    : derSequence(derOid(CmsOid.ecdsaWithSha256));
  const issuerAndSerial = derSequence(certificate.issuerDer, certificate.serialNumberDer);
  const signerInfoItems = [
    derInteger(1),
    issuerAndSerial,
    digestAlgorithm,
    signedAttrsImplicit,
    signatureAlgorithm,
    derOctetString(signatureValue),
  ];
  if (signatureTimestampTokenDer) {
    if (signatureTimestampTokenDer.byteLength <= 0 || signatureTimestampTokenDer.byteLength > 512 * 1024 || signatureTimestampTokenDer[0] !== 0x30) {
      throw new Error('RFC 3161 timestamp token is outside supported DER bounds');
    }
    const timestampAttribute = derSequence(
      derOid(CmsOid.signatureTimeStampToken),
      derSet(signatureTimestampTokenDer),
    );
    signerInfoItems.push(derContext(1, timestampAttribute));
  }
  const signerInfo = derSequence(...signerInfoItems);
  const encapContentInfo = derSequence(derOid(CmsOid.data));

  const uniqueCertificates: Uint8Array[] = [];
  const candidates = [certificate, ...certificateChain].map((item) => item.certificateDer);
  for (const candidate of candidates) {
    if (candidate.byteLength === 0 || candidate.byteLength > 256 * 1024) throw new Error('CMS certificate is outside supported bounds');
    if (!uniqueCertificates.some((existing) => bytesEqual(existing, candidate))) uniqueCertificates.push(candidate);
  }
  if (uniqueCertificates.length > 16) throw new Error('CMS certificate chain count exceeds supported bounds');
  uniqueCertificates.sort((left, right) => {
    const length = Math.min(left.byteLength, right.byteLength);
    for (let index = 0; index < length; index += 1) {
      const delta = left[index]! - right[index]!;
      if (delta !== 0) return delta;
    }
    return left.byteLength - right.byteLength;
  });
  const certificateSetImplicit = derContext(0, concatBytes(uniqueCertificates));
  const signedData = derSequence(
    derInteger(1),
    derSet(digestAlgorithm),
    encapContentInfo,
    certificateSetImplicit,
    derSet(signerInfo),
  );
  return derSequence(derOid(CmsOid.signedData), derContext(0, signedData));
}

export interface ParsedDetachedCadesCms {
  exactCmsDer: Uint8Array;
  certificates: ParsedCertificateDer[];
  signerCertificate: ParsedCertificateDer;
  signedAttributesDer: Uint8Array;
  signatureValue: Uint8Array;
  signatureKind: 'rsa' | 'ecdsa';
  digestAlgorithm: 'SHA-256';
  messageDigest: Uint8Array;
  signingTime?: number;
  signingCertificateV2Digest?: Uint8Array;
  signatureTimestampTokenDer?: Uint8Array;
}

function parseUtcTimeElement(bytes: Uint8Array, element: DerElement): number | undefined {
  if (element.tag !== 0x17) return undefined;
  const value = new TextDecoder('ascii').decode(bytes.subarray(element.valueStart, element.end));
  const match = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/u.exec(value);
  if (!match) return undefined;
  let year = Number(match[1]);
  year += year >= 50 ? 1900 : 2000;
  const timestamp = Date.UTC(year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

/**
 * Parses the detached CMS/CAdES subset used by PDF signatures. The parser is
 * intentionally bounded and rejects BER/indefinite-length encodings rather
 * than attempting permissive recovery of hostile signature containers.
 */
export function parseDetachedCadesCms(input: Uint8Array): ParsedDetachedCadesCms {
  if (input.byteLength <= 0 || input.byteLength > MAX_DER_BYTES) throw new Error('CMS object is outside supported bounds');
  const root = readElement(input, 0);
  if (root.tag !== 0x30) throw new Error('CMS ContentInfo must be a DER SEQUENCE');
  for (let index = root.end; index < input.byteLength; index += 1) {
    if (input[index] !== 0) throw new Error('CMS Contents padding contains non-zero trailing data');
  }
  const bytes = input.slice(0, root.end);
  const contentInfo = readElement(bytes, 0);
  const contentInfoChildren = children(bytes, contentInfo);
  if (contentInfoChildren.length !== 2 || decodeOidElement(bytes, contentInfoChildren[0]!) !== CmsOid.signedData || contentInfoChildren[1]!.tag !== 0xa0) {
    throw new Error('CMS ContentInfo is not SignedData');
  }
  const signedDataWrapperChildren = children(bytes, contentInfoChildren[1]!);
  if (signedDataWrapperChildren.length !== 1 || signedDataWrapperChildren[0]!.tag !== 0x30) throw new Error('CMS SignedData wrapper is invalid');
  const signedDataChildren = children(bytes, signedDataWrapperChildren[0]!);
  if (signedDataChildren.length < 4) throw new Error('CMS SignedData is incomplete');

  const digestAlgorithms = signedDataChildren[1]!;
  if (digestAlgorithms.tag !== 0x31) throw new Error('CMS digestAlgorithms SET is missing');
  const digestAlgorithmEntries = children(bytes, digestAlgorithms);
  if (digestAlgorithmEntries.length !== 1 || digestAlgorithmEntries[0]!.tag !== 0x30) throw new Error('CMS must contain exactly one digest algorithm');
  const digestAlgorithmParts = children(bytes, digestAlgorithmEntries[0]!);
  if (!digestAlgorithmParts[0] || decodeOidElement(bytes, digestAlgorithmParts[0]) !== CmsOid.sha256) throw new Error('CMS digest algorithm must be SHA-256');

  const certificateContainer = signedDataChildren.find((element, index) => index >= 3 && element.tag === 0xa0);
  const signerInfos = [...signedDataChildren].reverse().find((element) => element.tag === 0x31);
  if (!certificateContainer || !signerInfos) throw new Error('CMS certificates or signerInfos are missing');
  const certificateElements = children(bytes, certificateContainer).filter((element) => element.tag === 0x30);
  if (certificateElements.length === 0 || certificateElements.length > 16) throw new Error('CMS certificate count is outside supported bounds');
  const certificates = certificateElements.map((element) => parseX509CertificateDer(sliceElement(bytes, element)));

  const signerInfoEntries = children(bytes, signerInfos);
  if (signerInfoEntries.length !== 1 || signerInfoEntries[0]!.tag !== 0x30) throw new Error('CMS must contain exactly one SignerInfo');
  const signerInfo = children(bytes, signerInfoEntries[0]!);
  if (signerInfo.length < 6 || signerInfo[1]!.tag !== 0x30) throw new Error('CMS SignerInfo is incomplete');
  const issuerAndSerial = children(bytes, signerInfo[1]!);
  if (issuerAndSerial.length !== 2 || issuerAndSerial[0]!.tag !== 0x30 || issuerAndSerial[1]!.tag !== 0x02) throw new Error('CMS signer identifier is unsupported');
  const signerCertificate = certificates.find((certificate) =>
    bytesEqual(certificate.issuerDer, sliceElement(bytes, issuerAndSerial[0]!))
    && bytesEqual(certificate.serialNumberDer, sliceElement(bytes, issuerAndSerial[1]!)),
  );
  if (!signerCertificate) throw new Error('CMS signer certificate is not embedded');

  const signerDigestAlgorithm = children(bytes, signerInfo[2]!);
  if (!signerDigestAlgorithm[0] || decodeOidElement(bytes, signerDigestAlgorithm[0]) !== CmsOid.sha256) throw new Error('CMS SignerInfo digest algorithm must be SHA-256');
  const signedAttributes = signerInfo[3]!;
  if (signedAttributes.tag !== 0xa0) throw new Error('CMS signed attributes are required');
  const signatureAlgorithmParts = children(bytes, signerInfo[4]!);
  if (!signatureAlgorithmParts[0]) throw new Error('CMS signature algorithm is missing');
  const signatureOid = decodeOidElement(bytes, signatureAlgorithmParts[0]);
  const signatureKind = (signatureOid === CmsOid.rsaEncryption || signatureOid === CmsOid.sha256WithRsaEncryption) ? 'rsa' : signatureOid === CmsOid.ecdsaWithSha256 ? 'ecdsa' : null;
  if (!signatureKind) throw new Error(`CMS signature algorithm ${signatureOid} is unsupported`);
  const signatureValueElement = signerInfo[5]!;
  if (signatureValueElement.tag !== 0x04 || signatureValueElement.valueLength <= 0) throw new Error('CMS signature value is missing');

  let signatureTimestampTokenDer: Uint8Array | undefined;
  const unsignedAttributes = signerInfo[6];
  if (unsignedAttributes) {
    if (unsignedAttributes.tag !== 0xa1) throw new Error('CMS unsigned attributes use an unsupported encoding');
    for (const attribute of children(bytes, unsignedAttributes)) {
      if (attribute.tag !== 0x30) continue;
      const parts = children(bytes, attribute);
      if (parts.length !== 2 || parts[0]!.tag !== 0x06 || parts[1]!.tag !== 0x31) continue;
      if (decodeOidElement(bytes, parts[0]!) !== CmsOid.signatureTimeStampToken) continue;
      const values = children(bytes, parts[1]!);
      if (values.length !== 1 || values[0]!.tag !== 0x30) throw new Error('CMS signatureTimeStampToken attribute is invalid');
      signatureTimestampTokenDer = sliceElement(bytes, values[0]!);
    }
  }

  let messageDigest: Uint8Array | undefined;
  let signingTime: number | undefined;
  let signingCertificateV2Digest: Uint8Array | undefined;
  for (const attribute of children(bytes, signedAttributes)) {
    if (attribute.tag !== 0x30) continue;
    const parts = children(bytes, attribute);
    if (parts.length !== 2 || parts[0]!.tag !== 0x06 || parts[1]!.tag !== 0x31) continue;
    const oid = decodeOidElement(bytes, parts[0]!);
    const values = children(bytes, parts[1]!);
    if (oid === CmsOid.messageDigest && values[0]?.tag === 0x04) {
      messageDigest = bytes.slice(values[0].valueStart, values[0].end);
    } else if (oid === CmsOid.signingTime && values[0]) {
      signingTime = parseUtcTimeElement(bytes, values[0]);
    } else if (oid === CmsOid.signingCertificateV2 && values[0]?.tag === 0x30) {
      const essSequence = children(bytes, values[0]);
      const firstEssCert = essSequence[0];
      if (firstEssCert?.tag === 0x30) {
        const essParts = children(bytes, firstEssCert);
        if (essParts[0]?.tag === 0x04) signingCertificateV2Digest = bytes.slice(essParts[0].valueStart, essParts[0].end);
      }
    }
  }
  if (!messageDigest || messageDigest.byteLength !== 32) throw new Error('CMS messageDigest signed attribute is missing or invalid');

  const signedAttributesDer = sliceElement(bytes, signedAttributes);
  signedAttributesDer[0] = 0x31;
  return {
    exactCmsDer: bytes,
    certificates,
    signerCertificate,
    signedAttributesDer,
    signatureValue: bytes.slice(signatureValueElement.valueStart, signatureValueElement.end),
    signatureKind,
    digestAlgorithm: 'SHA-256',
    messageDigest,
    signingTime,
    signingCertificateV2Digest,
    signatureTimestampTokenDer,
  };
}
