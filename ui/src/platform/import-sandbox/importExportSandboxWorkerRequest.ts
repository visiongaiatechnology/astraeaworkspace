// STATUS: PLATIN — runtime validation for the browser import worker ingress.
export interface ImportExportSandboxWorkerRequest {
  id: string;
  fileName: string;
  bytes: ArrayBuffer;
}

export const IMPORT_WORKER_MAX_INPUT_BYTES = 128 * 1024 * 1024;
export const IMPORT_WORKER_MAX_FILE_NAME_BYTES = 1024;

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED_KEYS = ['id', 'fileName', 'bytes'] as const;

export class ImportExportSandboxRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ImportExportSandboxRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactRequestKeys(value: Record<string, unknown>): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === ALLOWED_KEYS.length
    && keys.every((key) => typeof key === 'string' && ALLOWED_KEYS.includes(key as typeof ALLOWED_KEYS[number]));
}

function getArrayBufferByteLength(value: unknown): number | null {
  const byteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get;
  if (!byteLengthGetter) return null;
  try {
    return byteLengthGetter.call(value) as number;
  } catch {
    return null;
  }
}

export function isImportWorkerByteLengthAllowed(byteLength: number): boolean {
  return Number.isSafeInteger(byteLength) && byteLength >= 1 && byteLength <= IMPORT_WORKER_MAX_INPUT_BYTES;
}

function isBoundedFileName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > IMPORT_WORKER_MAX_FILE_NAME_BYTES) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  return new TextEncoder().encode(value).byteLength <= IMPORT_WORKER_MAX_FILE_NAME_BYTES;
}

export function safeImportExportSandboxRequestId(value: unknown): string {
  try {
    if (!isRecord(value) || typeof value.id !== 'string' || !REQUEST_ID_PATTERN.test(value.id)) return '';
    return value.id;
  } catch {
    return '';
  }
}

export function parseImportExportSandboxWorkerRequest(value: unknown): ImportExportSandboxWorkerRequest {
  try {
    if (!isRecord(value) || !hasExactRequestKeys(value)) {
      throw new ImportExportSandboxRequestError('IMPORT_REQUEST_SCHEMA_REJECTED');
    }
    if (typeof value.id !== 'string' || !REQUEST_ID_PATTERN.test(value.id)) {
      throw new ImportExportSandboxRequestError('IMPORT_REQUEST_ID_REJECTED');
    }
    if (!isBoundedFileName(value.fileName)) {
      throw new ImportExportSandboxRequestError('IMPORT_REQUEST_FILENAME_REJECTED');
    }
    const byteLength = getArrayBufferByteLength(value.bytes);
    if (byteLength === null) throw new ImportExportSandboxRequestError('IMPORT_REQUEST_BYTES_REJECTED');
    if (!isImportWorkerByteLengthAllowed(byteLength)) {
      throw new ImportExportSandboxRequestError('IMPORT_REQUEST_SIZE_REJECTED');
    }
    return { id: value.id, fileName: value.fileName, bytes: value.bytes as ArrayBuffer };
  } catch (error) {
    if (error instanceof ImportExportSandboxRequestError) throw error;
    throw new ImportExportSandboxRequestError('IMPORT_REQUEST_SCHEMA_REJECTED');
  }
}
