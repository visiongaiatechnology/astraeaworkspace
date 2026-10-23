// STATUS: PLATIN
// Strict bounded DER parsing and public-value decoding helpers.

export interface DerElement {
  tag: number;
  start: number;
  headerLength: number;
  valueStart: number;
  valueLength: number;
  end: number;
}

export const MAX_DER_BYTES = 1024 * 1024;
const MAX_DER_DEPTH = 32;

export function readElement(bytes: Uint8Array, offset: number, depth = 0): DerElement {
  if (depth > MAX_DER_DEPTH || offset < 0 || offset + 2 > bytes.byteLength) throw new Error('DER input is truncated');
  const tag = bytes[offset]!;
  const firstLength = bytes[offset + 1]!;
  let valueLength = 0;
  let headerLength = 2;
  if ((firstLength & 0x80) === 0) {
    valueLength = firstLength;
  } else {
    const count = firstLength & 0x7f;
    if (count === 0 || count > 4 || offset + 2 + count > bytes.byteLength) throw new Error('DER length encoding is rejected');
    headerLength += count;
    for (let index = 0; index < count; index += 1) valueLength = valueLength * 256 + bytes[offset + 2 + index]!;
    if (valueLength < 0x80) throw new Error('Non-canonical DER length encoding is rejected');
  }
  const valueStart = offset + headerLength;
  const end = valueStart + valueLength;
  if (valueLength > MAX_DER_BYTES || end > bytes.byteLength) throw new Error('DER element exceeds input boundary');
  return { tag, start: offset, headerLength, valueStart, valueLength, end };
}

export function children(bytes: Uint8Array, parent: DerElement): DerElement[] {
  const output: DerElement[] = [];
  let cursor = parent.valueStart;
  while (cursor < parent.end) {
    const child = readElement(bytes, cursor, 1);
    output.push(child);
    cursor = child.end;
    if (output.length > 128) throw new Error('DER child count exceeds configured limit');
  }
  if (cursor !== parent.end) throw new Error('DER child boundary mismatch');
  return output;
}

export function sliceElement(bytes: Uint8Array, element: DerElement): Uint8Array {
  return bytes.slice(element.start, element.end);
}

export const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
};

export function decodeOidElement(bytes: Uint8Array, element: DerElement): string {
  if (element.tag !== 0x06 || element.valueLength <= 0) throw new Error('DER OID is invalid');
  const value = bytes.subarray(element.valueStart, element.end);
  const first = value[0]!;
  const root = first < 40 ? 0 : first < 80 ? 1 : 2;
  const second = first - root * 40;
  const parts: number[] = [root, second];
  let component = 0;
  let open = false;
  for (let index = 1; index < value.length; index += 1) {
    const octet = value[index]!;
    component = component * 128 + (octet & 0x7f);
    if (!Number.isSafeInteger(component)) throw new Error('DER OID component exceeds safe integer range');
    open = (octet & 0x80) !== 0;
    if (!open) {
      parts.push(component);
      component = 0;
    }
  }
  if (open) throw new Error('DER OID is truncated');
  return parts.join('.');
}

export function decodeDerText(bytes: Uint8Array, element: DerElement): string {
  const value = bytes.subarray(element.valueStart, element.end);
  switch (element.tag) {
    case 0x0c:
      return new TextDecoder('utf-8', { fatal: false }).decode(value);
    case 0x13:
    case 0x16:
    case 0x14:
      return new TextDecoder('latin1').decode(value);
    case 0x1e: {
      if (value.byteLength % 2 !== 0) return '';
      let output = '';
      for (let index = 0; index < value.byteLength; index += 2) output += String.fromCharCode(value[index]! * 256 + value[index + 1]!);
      return output;
    }
    default:
      return '';
  }
}
