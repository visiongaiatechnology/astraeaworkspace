// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — bounded detached-CMS PDF signature validation and revision status.

import {
  bytesToHex,
  hexToBytes,
  parseDetachedCadesCms,
  parseX509NameSummary,
  type ParsedCertificateDer,
} from '../cms/pdfCmsDer';

const MAX_VALIDATION_BYTES = 128 * 1024 * 1024;
const MAX_OBJECTS = 500_000;
const MAX_SIGNATURES = 64;
const MAX_OBJECT_BODY_CHARS = 2 * 1024 * 1024;
const MAX_SCAN_MILLIS = 2_500;

export interface PdfCertificateDisplay {
  subject: string;
  issuer: string;
  fingerprintSha256: string;
  isSigner: boolean;
}

export type PdfSignatureRevisionStatus = 'valid-current' | 'valid-earlier-revision' | 'invalid' | 'unsupported';

export interface PdfSignatureValidationResult {
  index: number;
  objectId: number;
  fieldName: string;
  byteRange: [number, number, number, number];
  signedRevisionEnd: number;
  currentFileLength: number;
  digestMatches: boolean;
  cmsSignatureValid: boolean;
  signingCertificateDigestMatches: boolean | null;
  valid: boolean;
  status: PdfSignatureRevisionStatus;
  modifiedAfterSigning: boolean;
  signingTime?: number;
  signatureAlgorithm: 'RSA-SHA256' | 'ECDSA-SHA256' | 'unsupported';
  signer: PdfCertificateDisplay;
  certificateChain: PdfCertificateDisplay[];
  warnings: string[];
}

interface PdfIndirectObject {
  objectId: number;
  generation: number;
  body: string;
}

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) diff |= left[index]! ^ right[index]!;
  return diff === 0;
};

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('PDF signature validation requires WebCrypto SubtleCrypto');
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(await sha256(bytes));
}

function boundedPdfObjects(text: string): PdfIndirectObject[] {
  const started = performance.now();
  const header = /(?:^|[\r\n])(\d{1,10})\s+(\d{1,5})\s+obj\b/gu;
  const objects: PdfIndirectObject[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(text))) {
    if (objects.length >= MAX_OBJECTS) throw new Error('PDF signature validation rejected an excessive object count');
    if (performance.now() - started > MAX_SCAN_MILLIS) throw new Error('PDF signature validation exceeded the bounded scan time');
    const bodyStart = header.lastIndex;
    const end = text.indexOf('endobj', bodyStart);
    if (end < 0) continue;
    if (end - bodyStart > MAX_OBJECT_BODY_CHARS) {
      header.lastIndex = end + 'endobj'.length;
      continue;
    }
    objects.push({ objectId: Number(match[1]), generation: Number(match[2]), body: text.slice(bodyStart, end) });
    header.lastIndex = end + 'endobj'.length;
  }
  return objects;
}

function decodePdfLiteral(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char !== '\\') {
      output += char;
      continue;
    }
    const next = value[++index];
    if (next === undefined) break;
    if (next === 'n') output += '\n';
    else if (next === 'r') output += '\r';
    else if (next === 't') output += '\t';
    else if (next === 'b') output += '\b';
    else if (next === 'f') output += '\f';
    else if (/[0-7]/u.test(next)) {
      let octal = next;
      for (let count = 0; count < 2 && index + 1 < value.length && /[0-7]/u.test(value[index + 1]!); count += 1) octal += value[++index]!;
      output += String.fromCharCode(Number.parseInt(octal, 8));
    } else output += next;
  }
  return output.replace(/[\x00-\x1f\x7f]/gu, '').slice(0, 512);
}

function signatureFieldNames(objects: readonly PdfIndirectObject[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const object of objects) {
    if (!/\/FT\s*\/Sig\b/u.test(object.body)) continue;
    const valueRef = /\/V\s+(\d+)\s+(\d+)\s+R\b/u.exec(object.body);
    if (!valueRef) continue;
    const title = /\/T\s*\(((?:\\.|[^\\)])*)\)/u.exec(object.body);
    names.set(`${valueRef[1]}:${valueRef[2]}`, title ? decodePdfLiteral(title[1]!) : `Signature ${names.size + 1}`);
  }
  return names;
}

function parseByteRange(body: string): [number, number, number, number] | null {
  const match = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/u.exec(body);
  if (!match) return null;
  const values = match.slice(1).map(Number);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  return values as [number, number, number, number];
}

function parseContentsBytes(body: string): Uint8Array | null {
  const match = /\/Contents\s*<([0-9A-Fa-f\s]{2,2097152})>/u.exec(body);
  if (!match) return null;
  const hex = match[1]!.replace(/\s+/gu, '');
  if (!hex || hex.length % 2 !== 0) return null;
  return hexToBytes(hex);
}

function validateByteRange(bytes: Uint8Array, range: [number, number, number, number]): number {
  const [offset1, length1, offset2, length2] = range;
  if (offset1 !== 0 || length1 <= 0 || offset2 <= length1 || length2 < 0) throw new Error('PDF signature ByteRange is structurally invalid');
  const end = offset2 + length2;
  if (!Number.isSafeInteger(end) || end > bytes.byteLength) throw new Error('PDF signature ByteRange exceeds the document boundary');
  const gap = bytes.subarray(length1, offset2);
  if (gap.byteLength < 2 || gap[0] !== 0x3c || gap[gap.length - 1] !== 0x3e) throw new Error('PDF signature ByteRange does not isolate a hexadecimal Contents field');
  return end;
}

async function digestByteRange(bytes: Uint8Array, range: [number, number, number, number]): Promise<Uint8Array> {
  const [, length1, offset2, length2] = range;
  const combined = new Uint8Array(length1 + length2);
  combined.set(bytes.subarray(0, length1), 0);
  combined.set(bytes.subarray(offset2, offset2 + length2), length1);
  return sha256(combined);
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; headerLength: number } {
  if (offset + 2 > bytes.byteLength) throw new Error('ECDSA DER signature is truncated');
  const first = bytes[offset + 1]!;
  if ((first & 0x80) === 0) return { length: first, headerLength: 2 };
  const count = first & 0x7f;
  if (count <= 0 || count > 2 || offset + 2 + count > bytes.byteLength) throw new Error('ECDSA DER signature length is invalid');
  let length = 0;
  for (let index = 0; index < count; index += 1) length = length * 256 + bytes[offset + 2 + index]!;
  return { length, headerLength: 2 + count };
}

function ecdsaDerToRaw(signature: Uint8Array, componentBytes: number): Uint8Array {
  if (signature[0] !== 0x30) throw new Error('ECDSA CMS signature is not a DER SEQUENCE');
  const sequence = readDerLength(signature, 0);
  if (sequence.headerLength + sequence.length !== signature.byteLength) throw new Error('ECDSA DER signature has trailing data');
  let cursor = sequence.headerLength;
  const output = new Uint8Array(componentBytes * 2);
  for (let component = 0; component < 2; component += 1) {
    if (signature[cursor] !== 0x02) throw new Error('ECDSA DER signature INTEGER is missing');
    const integer = readDerLength(signature, cursor);
    const start = cursor + integer.headerLength;
    let value = signature.subarray(start, start + integer.length);
    while (value.byteLength > 1 && value[0] === 0) value = value.subarray(1);
    if (value.byteLength > componentBytes) throw new Error('ECDSA signature component exceeds curve size');
    output.set(value, component * componentBytes + componentBytes - value.byteLength);
    cursor = start + integer.length;
  }
  if (cursor !== signature.byteLength) throw new Error('ECDSA DER signature has unexpected elements');
  return output;
}

export async function verifyCmsSignature(certificate: ParsedCertificateDer, kind: 'rsa' | 'ecdsa', signedAttributes: Uint8Array, signature: Uint8Array): Promise<boolean> {
  if (!globalThis.crypto?.subtle) throw new Error('PDF signature validation requires WebCrypto SubtleCrypto');
  if (kind === 'rsa') {
    const key = await globalThis.crypto.subtle.importKey(
      'spki', certificate.subjectPublicKeyInfoDer as unknown as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    return globalThis.crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as unknown as BufferSource, signedAttributes as unknown as BufferSource);
  }
  const curves: Array<{ name: 'P-256' | 'P-384' | 'P-521'; bytes: number }> = [
    { name: 'P-256', bytes: 32 },
    { name: 'P-384', bytes: 48 },
    { name: 'P-521', bytes: 66 },
  ];
  for (const curve of curves) {
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'spki', certificate.subjectPublicKeyInfoDer as unknown as BufferSource,
        { name: 'ECDSA', namedCurve: curve.name }, false, ['verify'],
      );
      const rawSignature = ecdsaDerToRaw(signature, curve.bytes);
      if (await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, rawSignature as unknown as BufferSource, signedAttributes as unknown as BufferSource)) return true;
    } catch {
      // Try the next supported named curve. Import failure is expected on mismatch.
    }
  }
  return false;
}

async function certificateDisplay(certificate: ParsedCertificateDer, signer: ParsedCertificateDer): Promise<PdfCertificateDisplay> {
  const subject = parseX509NameSummary(certificate.subjectDer).displayName;
  const issuer = parseX509NameSummary(certificate.issuerDer).displayName;
  return {
    subject,
    issuer,
    fingerprintSha256: await sha256Hex(certificate.certificateDer),
    isSigner: constantTimeEqual(certificate.certificateDer, signer.certificateDer),
  };
}

function orderEmbeddedCertificateChain(
  certificates: readonly ParsedCertificateDer[],
  signer: ParsedCertificateDer,
): { ordered: ParsedCertificateDer[]; complete: boolean } {
  const ordered: ParsedCertificateDer[] = [signer];
  const remaining = certificates.filter((candidate) => !constantTimeEqual(candidate.certificateDer, signer.certificateDer));
  let current = signer;
  let complete = true;
  while (remaining.length > 0) {
    if (constantTimeEqual(current.issuerDer, current.subjectDer)) break;
    const matches = remaining.filter((candidate) => constantTimeEqual(candidate.subjectDer, current.issuerDer));
    if (matches.length !== 1) {
      complete = false;
      break;
    }
    const issuer = matches[0]!;
    ordered.push(issuer);
    remaining.splice(remaining.indexOf(issuer), 1);
    current = issuer;
  }
  if (remaining.length > 0) {
    complete = false;
    ordered.push(...remaining);
  }
  return { ordered, complete };
}

/**
 * Validates embedded detached CMS signatures without granting certificate trust.
 * Cryptographic validity and certificate trust are intentionally separate facts.
 */
export async function validatePdfSignatures(pdfBytes: Uint8Array): Promise<PdfSignatureValidationResult[]> {
  if (pdfBytes.byteLength < 32 || pdfBytes.byteLength > MAX_VALIDATION_BYTES) throw new Error('PDF is outside signature-validation size bounds');
  const text = new TextDecoder('latin1').decode(pdfBytes);
  if (!/%PDF-(?:1\.[0-7]|2\.0)/u.test(text.slice(0, 1024))) throw new Error('Signature validation rejected a non-PDF input');
  const objects = boundedPdfObjects(text);
  const fieldNames = signatureFieldNames(objects);
  const signatureObjects = objects.filter((object) => /\/Type\s*\/Sig\b/u.test(object.body) && /\/ByteRange\b/u.test(object.body));
  if (signatureObjects.length > MAX_SIGNATURES) throw new Error('PDF signature count exceeds the configured bound');

  const results: PdfSignatureValidationResult[] = [];
  for (let index = 0; index < signatureObjects.length; index += 1) {
    const object = signatureObjects[index]!;
    const fieldName = fieldNames.get(`${object.objectId}:${object.generation}`) ?? `Signature ${index + 1}`;
    const warnings: string[] = [];
    let range: [number, number, number, number] = [0, 0, 0, 0];
    try {
      const parsedRange = parseByteRange(object.body);
      const contents = parseContentsBytes(object.body);
      if (!parsedRange || !contents) throw new Error('Signature dictionary is missing ByteRange or Contents');
      range = parsedRange;
      const signedRevisionEnd = validateByteRange(pdfBytes, range);
      const cms = parseDetachedCadesCms(contents);
      const pdfDigest = await digestByteRange(pdfBytes, range);
      const digestMatches = constantTimeEqual(pdfDigest, cms.messageDigest);
      const cmsSignatureValid = await verifyCmsSignature(cms.signerCertificate, cms.signatureKind, cms.signedAttributesDer, cms.signatureValue);
      let signingCertificateDigestMatches: boolean | null = null;
      if (cms.signingCertificateV2Digest) {
        signingCertificateDigestMatches = constantTimeEqual(await sha256(cms.signerCertificate.certificateDer), cms.signingCertificateV2Digest);
      }
      const orderedCertificates = orderEmbeddedCertificateChain(cms.certificates, cms.signerCertificate);
      const certificateChain = await Promise.all(orderedCertificates.ordered.map((certificate) => certificateDisplay(certificate, cms.signerCertificate)));
      const signer = certificateChain[0]!;
      const modifiedAfterSigning = signedRevisionEnd < pdfBytes.byteLength;
      if (modifiedAfterSigning) warnings.push(`${pdfBytes.byteLength - signedRevisionEnd} byte(s) were appended after this signed revision.`);
      if (!orderedCertificates.complete && cms.certificates.length > 1) warnings.push('Embedded certificate set could not be resolved into one unambiguous issuer chain.');
      warnings.push('Certificate trust/revocation is not inferred from cryptographic validity; trust-store validation is a separate adapter responsibility.');
      const valid = digestMatches && cmsSignatureValid && signingCertificateDigestMatches !== false;
      results.push({
        index: index + 1,
        objectId: object.objectId,
        fieldName,
        byteRange: range,
        signedRevisionEnd,
        currentFileLength: pdfBytes.byteLength,
        digestMatches,
        cmsSignatureValid,
        signingCertificateDigestMatches,
        valid,
        status: valid ? (modifiedAfterSigning ? 'valid-earlier-revision' : 'valid-current') : 'invalid',
        modifiedAfterSigning,
        signingTime: cms.signingTime,
        signatureAlgorithm: cms.signatureKind === 'rsa' ? 'RSA-SHA256' : 'ECDSA-SHA256',
        signer,
        certificateChain,
        warnings,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unsupported signature structure';
      results.push({
        index: index + 1,
        objectId: object.objectId,
        fieldName,
        byteRange: range,
        signedRevisionEnd: 0,
        currentFileLength: pdfBytes.byteLength,
        digestMatches: false,
        cmsSignatureValid: false,
        signingCertificateDigestMatches: null,
        valid: false,
        status: 'unsupported',
        modifiedAfterSigning: false,
        signatureAlgorithm: 'unsupported',
        signer: { subject: 'Unknown signer', issuer: 'Unknown issuer', fingerprintSha256: '', isSigner: true },
        certificateChain: [],
        warnings: [message],
      });
    }
  }
  return results;
}
