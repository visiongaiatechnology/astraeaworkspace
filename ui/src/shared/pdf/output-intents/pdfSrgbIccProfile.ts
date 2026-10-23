// STATUS: PLATIN — immutable source material with bounded ICC header integrity validation.
const SRGB_ICC_BASE64 = 'AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACQAUAA4AIAAtYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c';

function decodeBase64(input: string): Uint8Array {
  const binary = globalThis.atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function getPdfSrgbIccProfile(): Uint8Array {
  const bytes = decodeBase64(SRGB_ICC_BASE64);
  if (bytes.byteLength < 40) throw new Error('Embedded sRGB ICC output intent failed integrity validation');
  const declaredLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  const signature = String.fromCharCode(bytes[36], bytes[37], bytes[38], bytes[39]);
  if (declaredLength !== bytes.byteLength || signature !== 'acsp') {
    throw new Error('Embedded sRGB ICC output intent failed integrity validation');
  }
  return bytes;
}
