// STATUS: PLATIN
// DER encoding primitives shared by PDF signing and timestamp paths.

import { MAX_DER_BYTES } from './pdfDerParser';

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  if (length > MAX_DER_BYTES) throw new Error('DER structure exceeds configured size limit');
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function derLength(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_DER_BYTES) throw new Error('DER length is invalid');
  if (length < 0x80) return Uint8Array.of(length);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

export function der(tag: number, value: Uint8Array): Uint8Array {
  if (tag < 0 || tag > 0xff) throw new Error('DER tag is invalid');
  return concatBytes([Uint8Array.of(tag), derLength(value.byteLength), value]);
}

export const derSequence = (...items: Uint8Array[]): Uint8Array => der(0x30, concatBytes(items));

export function derSet(...items: Uint8Array[]): Uint8Array {
  const sorted = [...items].sort((a, b) => {
    const length = Math.min(a.byteLength, b.byteLength);
    for (let index = 0; index < length; index += 1) {
      const delta = a[index]! - b[index]!;
      if (delta !== 0) return delta;
    }
    return a.byteLength - b.byteLength;
  });
  return der(0x31, concatBytes(sorted));
}

export const derOctetString = (value: Uint8Array): Uint8Array => der(0x04, value);
export const derNull = (): Uint8Array => Uint8Array.of(0x05, 0x00);
export const derBoolean = (value: boolean): Uint8Array => der(0x01, Uint8Array.of(value ? 0xff : 0x00));

export function derPositiveIntegerBytes(value: Uint8Array): Uint8Array {
  if (value.byteLength <= 0 || value.byteLength > 32) throw new Error('DER positive integer byte length is invalid');
  let start = 0;
  while (start + 1 < value.byteLength && value[start] === 0) start += 1;
  let normalized = value.slice(start);
  if ((normalized[0]! & 0x80) !== 0) normalized = concatBytes([Uint8Array.of(0), normalized]);
  return der(0x02, normalized);
}

export const derContext = (tagNumber: number, content: Uint8Array): Uint8Array => {
  if (!Number.isInteger(tagNumber) || tagNumber < 0 || tagNumber > 30) throw new Error('DER context tag is invalid');
  return der(0xa0 | tagNumber, content);
};

export function derInteger(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('DER integer is invalid');
  const bytes: number[] = [];
  let remaining = value;
  do {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  } while (remaining > 0);
  if ((bytes[0]! & 0x80) !== 0) bytes.unshift(0);
  return der(0x02, Uint8Array.from(bytes));
}

export function derOid(oid: string): Uint8Array {
  const parts = oid.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => !Number.isSafeInteger(part) || part < 0)) throw new Error('OID is invalid');
  if (parts[0]! > 2 || (parts[0]! < 2 && parts[1]! > 39)) throw new Error('OID root is invalid');
  const body: number[] = [parts[0]! * 40 + parts[1]!];
  for (const component of parts.slice(2)) {
    const encoded = [component & 0x7f];
    let value = Math.floor(component / 128);
    while (value > 0) {
      encoded.unshift(0x80 | (value & 0x7f));
      value = Math.floor(value / 128);
    }
    body.push(...encoded);
  }
  return der(0x06, Uint8Array.from(body));
}

export function derUtcTime(timestamp: number): Uint8Array {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('Signing time is invalid');
  const year = date.getUTCFullYear();
  if (year < 1950 || year > 2049) throw new Error('UTCTime supports years 1950-2049');
  const pad = (value: number) => value.toString().padStart(2, '0');
  const text = `${pad(year % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return der(0x17, new TextEncoder().encode(text));
}
