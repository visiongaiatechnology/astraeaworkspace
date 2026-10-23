// STATUS: PLATIN
// Native file-association ingress. Rust validates the explicit OS path and returns bytes; the UI never receives arbitrary filesystem access.

import { invokeNative, isNativeDesktop, listenNative } from './nativeBridge';

const MAX_NATIVE_OPEN_BYTES = 128 * 1024 * 1024;

export interface NativeOpenedFile {
  file_name: string;
  data_base64: string;
  size_bytes: number;
}

export function decodeNativeOpenBase64(input: string): Uint8Array {
  if (input.length > Math.ceil(MAX_NATIVE_OPEN_BYTES / 3) * 4 + 8) throw new Error('Native file payload exceeds the configured boundary');
  const binary = atob(input);
  if (binary.length === 0 || binary.length > MAX_NATIVE_OPEN_BYTES) throw new Error('Native file payload has an invalid size');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function nativeOpenedPayloadToFile(payload: NativeOpenedFile): File {
  if (!Number.isSafeInteger(payload.size_bytes) || payload.size_bytes <= 0 || payload.size_bytes > MAX_NATIVE_OPEN_BYTES) throw new Error('Native file metadata is invalid');
  if (!payload.file_name || payload.file_name.length > 255 || /[\\/]/.test(payload.file_name)) throw new Error('Native file name is invalid');
  const bytes = decodeNativeOpenBase64(payload.data_base64);
  if (bytes.byteLength !== payload.size_bytes) throw new Error('Native file payload length mismatch');
  return new File([bytes as unknown as BlobPart], payload.file_name, { type: 'application/octet-stream' });
}

export async function takeNativeOpenedFile(): Promise<File | null> {
  if (!isNativeDesktop()) return null;
  const payload = await invokeNative<NativeOpenedFile | null>('vgt_take_opened_file');
  if (!payload) return null;
  return nativeOpenedPayloadToFile(payload);
}

export async function listenForNativeOpenedFile(handler: () => void): Promise<() => void> {
  if (!isNativeDesktop()) return () => undefined;
  return listenNative<boolean>('astraea://opened-file', () => handler());
}
