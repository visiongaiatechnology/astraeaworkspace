// STATUS: DIAMANT VGT SUPREME
// Bounded decoder for locally persisted PDF data URLs. No network or blob URL required.

const PDF_DATA_URL_PREFIX = 'data:application/pdf;base64,';

export function decodePdfDataUrl(
  dataUrl: string,
  expectedByteLength?: number,
  maxBytes = 96 * 1024 * 1024,
): Uint8Array {
  if (!dataUrl.startsWith(PDF_DATA_URL_PREFIX)) throw new Error('Native PDF payload is not an application/pdf base64 data URL');
  const base64 = dataUrl.slice(PDF_DATA_URL_PREFIX.length);
  if (!base64 || /\s/u.test(base64) || !/^[A-Za-z0-9+/]*={0,2}$/u.test(base64) || base64.length % 4 !== 0) {
    throw new Error('Native PDF base64 payload is malformed');
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const decodedLength = (base64.length / 4) * 3 - padding;
  if (!Number.isSafeInteger(decodedLength) || decodedLength <= 0 || decodedLength > maxBytes) throw new Error('Native PDF payload exceeds the bounded decode size');
  if (expectedByteLength !== undefined && decodedLength !== expectedByteLength) throw new Error('Native PDF payload length no longer matches its import manifest');

  const output = new Uint8Array(decodedLength);
  const chunkChars = 32 * 1024; // divisible by four, so base64 quartets never split.
  let writeOffset = 0;
  for (let offset = 0; offset < base64.length; offset += chunkChars) {
    const chunk = base64.slice(offset, Math.min(base64.length, offset + chunkChars));
    const binary = globalThis.atob(chunk);
    if (writeOffset + binary.length > output.length) throw new Error('Native PDF base64 decoder exceeded the declared output size');
    for (let index = 0; index < binary.length; index += 1) output[writeOffset + index] = binary.charCodeAt(index);
    writeOffset += binary.length;
  }
  if (writeOffset !== output.length) throw new Error('Native PDF base64 decoder produced an unexpected byte count');
  return output;
}
