// STATUS: PLATIN
// Bounded X.509, PEM, certificate-name, and ECDSA representation helpers.

import { MAX_DER_BYTES, children, decodeDerText, decodeOidElement, readElement, sliceElement } from './pdfDerParser';
import { concatBytes, der, derSequence } from './pdfDerPrimitives';

// STATUS: DIAMANT VGT SUPREME
// Minimal bounded DER/CMS primitives for detached CAdES signatures.

export interface ParsedCertificateDer {
  certificateDer: Uint8Array;
  tbsCertificateDer: Uint8Array;
  issuerDer: Uint8Array;
  subjectDer: Uint8Array;
  serialNumberDer: Uint8Array;
  subjectPublicKeyInfoDer: Uint8Array;
}

export function parseX509CertificateDer(input: Uint8Array): ParsedCertificateDer {
  if (input.byteLength === 0 || input.byteLength > 256 * 1024) throw new Error('X.509 certificate size is invalid');
  const bytes = input.slice();
  const certificate = readElement(bytes, 0);
  if (certificate.tag !== 0x30 || certificate.end !== bytes.byteLength) throw new Error('X.509 certificate must be one DER SEQUENCE');
  const certificateChildren = children(bytes, certificate);
  if (certificateChildren.length !== 3 || certificateChildren[0]!.tag !== 0x30) throw new Error('X.509 certificate structure is invalid');
  const tbs = certificateChildren[0]!;
  const tbsChildren = children(bytes, tbs);
  let index = 0;
  if (tbsChildren[index]?.tag === 0xa0) index += 1;
  const serial = tbsChildren[index++];
  const signature = tbsChildren[index++];
  const issuer = tbsChildren[index++];
  const validity = tbsChildren[index++];
  const subject = tbsChildren[index++];
  const spki = tbsChildren[index++];
  if (!serial || serial.tag !== 0x02 || !signature || !issuer || issuer.tag !== 0x30 || !validity || !subject || !spki || spki.tag !== 0x30) {
    throw new Error('X.509 TBSCertificate is missing required fields');
  }
  return {
    certificateDer: bytes,
    tbsCertificateDer: sliceElement(bytes, tbs),
    issuerDer: sliceElement(bytes, issuer),
    subjectDer: sliceElement(bytes, subject),
    serialNumberDer: sliceElement(bytes, serial),
    subjectPublicKeyInfoDer: sliceElement(bytes, spki),
  };
}

export function pemToDer(input: string, acceptedLabels: readonly string[]): Uint8Array {
  const normalized = input.replace(/\r/g, '').trim();
  for (const label of acceptedLabels) {
    const pattern = new RegExp(`-----BEGIN ${label}-----\\n([A-Za-z0-9+/=\\n]+)\\n-----END ${label}-----`, 'u');
    const match = pattern.exec(normalized);
    if (!match) continue;
    const base64 = match[1]!.replace(/\s+/g, '');
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (bytes.byteLength > MAX_DER_BYTES) throw new Error('PEM payload exceeds configured size limit');
    return bytes;
  }
  throw new Error(`PEM must contain ${acceptedLabels.join(' or ')}`);
}

/**
 * Decodes a bounded PEM bundle containing only repeated blocks of one label.
 * Non-whitespace material outside blocks is rejected so certificate/key files
 * cannot smuggle unrelated payloads through the identity import boundary.
 */
export function pemBundleToDer(input: string, label: string, maxItems = 16): Uint8Array[] {
  if (!/^[A-Z0-9][A-Z0-9 ]{0,63}$/u.test(label)) throw new Error('PEM label is invalid');
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 64) throw new Error('PEM bundle item limit is invalid');
  const normalized = input.replace(/\r/g, '').trim();
  if (!normalized || normalized.length > MAX_DER_BYTES * 2) throw new Error('PEM bundle is outside configured text bounds');
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  const output: Uint8Array[] = [];
  let cursor = 0;
  let totalBytes = 0;
  while (cursor < normalized.length) {
    const start = normalized.indexOf(begin, cursor);
    if (start < 0) {
      if (normalized.slice(cursor).trim()) throw new Error('PEM bundle contains unexpected trailing material');
      break;
    }
    if (normalized.slice(cursor, start).trim()) throw new Error('PEM bundle contains unexpected material between certificate blocks');
    const payloadStart = start + begin.length;
    const finish = normalized.indexOf(end, payloadStart);
    if (finish < 0) throw new Error(`PEM bundle has an unterminated ${label} block`);
    const payloadText = normalized.slice(payloadStart, finish).trim();
    const base64 = payloadText.replace(/\s+/gu, '');
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(base64) || base64.length % 4 !== 0) throw new Error('PEM bundle contains invalid base64');
    let binary: string;
    try { binary = globalThis.atob(base64); } catch { throw new Error('PEM bundle contains invalid base64'); }
    if (!binary.length) throw new Error('PEM bundle contains an empty payload');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > 256 * 1024 || totalBytes > MAX_DER_BYTES) throw new Error('PEM bundle exceeds configured DER size limits');
    output.push(bytes);
    if (output.length > maxItems) throw new Error('PEM bundle item count exceeds configured limit');
    cursor = finish + end.length;
  }
  if (output.length === 0) throw new Error(`PEM must contain at least one ${label} block`);
  return output;
}

export function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.byteLength; index += 1) output += bytes[index]!.toString(16).padStart(2, '0').toUpperCase();
  return output;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9A-F]*$/iu.test(hex)) throw new Error('Hex input is invalid');
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return output;
}

export function normalizeEcdsaWebCryptoSignature(signature: Uint8Array): Uint8Array {
  if (signature[0] === 0x30) return signature;
  if (signature.byteLength !== 64 && signature.byteLength !== 96) throw new Error('ECDSA signature length is unsupported');
  const half = signature.byteLength / 2;
  const encodeInteger = (raw: Uint8Array): Uint8Array => {
    let start = 0;
    while (start + 1 < raw.length && raw[start] === 0) start += 1;
    let value = raw.slice(start);
    if ((value[0]! & 0x80) !== 0) value = concatBytes([Uint8Array.of(0), value]);
    return der(0x02, value);
  };
  return derSequence(encodeInteger(signature.slice(0, half)), encodeInteger(signature.slice(half)));
}

export interface X509NameSummary {
  commonName?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  email?: string;
  displayName: string;
}

export function parseX509NameSummary(nameDer: Uint8Array): X509NameSummary {
  if (nameDer.byteLength <= 0 || nameDer.byteLength > 64 * 1024) throw new Error('X.509 name is outside supported bounds');
  const root = readElement(nameDer, 0);
  if (root.tag !== 0x30 || root.end !== nameDer.byteLength) throw new Error('X.509 name must be a DER SEQUENCE');
  const values = new Map<string, string>();
  for (const rdnSet of children(nameDer, root)) {
    if (rdnSet.tag !== 0x31) continue;
    for (const attributeSequence of children(nameDer, rdnSet)) {
      if (attributeSequence.tag !== 0x30) continue;
      const pair = children(nameDer, attributeSequence);
      if (pair.length < 2 || pair[0]!.tag !== 0x06) continue;
      const oid = decodeOidElement(nameDer, pair[0]!);
      const decoded = decodeDerText(nameDer, pair[1]!).replace(/[\x00-\x1f\x7f]/gu, '').trim().slice(0, 256);
      if (decoded && !values.has(oid)) values.set(oid, decoded);
    }
  }
  const commonName = values.get('2.5.4.3');
  const organization = values.get('2.5.4.10');
  const organizationalUnit = values.get('2.5.4.11');
  const country = values.get('2.5.4.6');
  const email = values.get('1.2.840.113549.1.9.1');
  const displayName = [commonName, organization, country].filter(Boolean).join(' · ') || 'Unnamed certificate subject';
  return { commonName, organization, organizationalUnit, country, email, displayName };
}
