/// <reference lib="webworker" />
import {
  IMPORT_WORKER_MAX_INPUT_BYTES,
  ImportExportSandboxRequestError,
  parseImportExportSandboxWorkerRequest,
  safeImportExportSandboxRequestId,
  type ImportExportSandboxWorkerRequest,
} from './importExportSandboxWorkerRequest';
// STATUS: DIAMANT — browser fallback is intentionally a strict subset.
// Complex ZIP/OOXML/ODF/PDF parsing is native-only so the Rust sandbox remains
// the single security truth. This worker only handles isolated image decode and
// bounded JSON/CSV intake when no native runtime exists.

type Request = ImportExportSandboxWorkerRequest;
interface Report {
  contract: 'VGT-IMPORT-SANDBOX-3';
  format: string;
  file_name_hint: string;
  size_bytes: number;
  entry_count: number;
  expanded_bytes: number;
  max_observed_ratio_milli: number;
  active_content: 'none' | 'quarantined_preserved' | 'rejected';
  integrity_verified: boolean;
  parser_boundary: 'browser-dedicated-worker';
  image_width: number | null;
  image_height: number | null;
  untrusted_resources: { embedded_fonts: number; icc_profiles: number; external_references: number };
  fidelity: {
    source_format: string;
    supported_features: string[];
    unsupported_features: string[];
    preserved_foreign_parts: Array<{ path: string; size_bytes: number; blake3: string; media_hint: string; quarantined: boolean }>;
    dropped_active_parts: string[];
    warnings: string[];
    destructive_roundtrip_requires_confirmation: boolean;
  };
}

const MAX_INPUT = IMPORT_WORKER_MAX_INPUT_BYTES;
const MAX_BROWSER_TEXT = 16 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 120_000_000;
const MAX_IMAGE_DIMENSION = 16_384;

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.length <= bytes.byteLength && prefix.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes: Uint8Array, token: string): boolean {
  const needle = new TextEncoder().encode(token);
  if (!needle.length || bytes.byteLength < needle.length) return false;
  outer: for (let offset = 0; offset + needle.length <= bytes.byteLength; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) if (bytes[offset + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
}

function sniffImageMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [137,80,78,71,13,10,26,10])) return 'image/png';
  if (startsWith(bytes, [0xff,0xd8,0xff])) return 'image/jpeg';
  if (bytes.length >= 6 && new TextDecoder('ascii').decode(bytes.slice(0,6)).startsWith('GIF8')) return 'image/gif';
  if (bytes.length >= 12 && new TextDecoder('ascii').decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder('ascii').decode(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}


function u16be(bytes: Uint8Array, offset: number): number { return (bytes[offset] << 8) | bytes[offset + 1]; }
function u24le(bytes: Uint8Array, offset: number): number { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }
function u32be(bytes: Uint8Array, offset: number): number { return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0; }

function jpegHeaderDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let cursor = 2;
  for (let steps = 0; cursor + 8 < bytes.length && steps < 4096; steps += 1) {
    if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) break;
    const marker = bytes[cursor++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 1 >= bytes.length) break;
    const length = u16be(bytes, cursor);
    if (length < 2 || cursor + length > bytes.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) {
      return { height: u16be(bytes, cursor + 3), width: u16be(bytes, cursor + 5) };
    }
    cursor += length;
  }
  return null;
}

function imageHeaderDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png' && bytes.length >= 24 && new TextDecoder('ascii').decode(bytes.slice(12,16)) === 'IHDR') return { width: u32be(bytes,16), height: u32be(bytes,20) };
  if (mime === 'image/gif' && bytes.length >= 10) return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  if (mime === 'image/webp' && bytes.length >= 30 && new TextDecoder('ascii').decode(bytes.slice(12,16)) === 'VP8X') return { width: u24le(bytes,24)+1, height: u24le(bytes,27)+1 };
  if (mime === 'image/webp' && bytes.length >= 30 && new TextDecoder('ascii').decode(bytes.slice(12,16)) === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  if (mime === 'image/webp' && bytes.length >= 25 && new TextDecoder('ascii').decode(bytes.slice(12,16)) === 'VP8L' && bytes[20] === 0x2f) return { width: 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff), height: 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff) };
  if (mime === 'image/jpeg') return jpegHeaderDimensions(bytes);
  return null;
}

function assertImageDimensionsBeforeDecode(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  const dimensions = imageHeaderDimensions(bytes, mime);
  if (!dimensions) throw new Error('Image dimensions unavailable before decode');
  const pixels = dimensions.width * dimensions.height;
  if (!dimensions.width || !dimensions.height || dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION || !Number.isSafeInteger(pixels) || pixels > MAX_IMAGE_PIXELS) {
    throw new Error('Image dimension/pixel ceiling exceeded before decode');
  }
  return dimensions;
}

function imageIccCount(bytes: Uint8Array, mime: string): number {
  if (mime === 'image/png') return containsAscii(bytes, 'iCCP') ? 1 : 0;
  if (mime === 'image/jpeg') return containsAscii(bytes, 'ICC_PROFILE') ? 1 : 0;
  if (mime === 'image/webp') return containsAscii(bytes, 'ICCP') ? 1 : 0;
  return 0;
}

function simpleReport(format: string, request: Request, supported: string[]): Report {
  return {
    contract:'VGT-IMPORT-SANDBOX-3', format, file_name_hint:request.fileName.slice(0,240), size_bytes:request.bytes.byteLength,
    entry_count:0, expanded_bytes:0, max_observed_ratio_milli:1000, active_content:'none', integrity_verified:true,
    parser_boundary:'browser-dedicated-worker', image_width:null, image_height:null,
    untrusted_resources:{embedded_fonts:0,icc_profiles:0,external_references:0},
    fidelity:{source_format:format.toUpperCase(),supported_features:supported,unsupported_features:[],preserved_foreign_parts:[],dropped_active_parts:[],warnings:[],destructive_roundtrip_requires_confirmation:false},
  };
}

async function inspect(request: Request): Promise<Report> {
  const bytes = new Uint8Array(request.bytes);
  if (!bytes.length || bytes.length > MAX_INPUT) throw new Error('Foreign file exceeds browser sandbox size limit');
  const isZip = startsWith(bytes, [0x50,0x4b,0x03,0x04]) || startsWith(bytes, [0x50,0x4b,0x05,0x06]);
  const isPdf = bytes.length >= 5 && containsAscii(bytes.slice(0, Math.min(bytes.length, 1024)), '%PDF-');
  if (isZip || isPdf) throw new Error('Complex Office/ODF/PDF intake requires the native sandbox core');

  const imageMime = sniffImageMime(bytes);
  if (imageMime) {
    assertImageDimensionsBeforeDecode(bytes, imageMime);
    if (typeof createImageBitmap !== 'function') throw new Error('Isolated image decoder unavailable');
    const bitmap = await createImageBitmap(new Blob([bytes], { type: imageMime }));
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    const pixels = width * height;
    if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || !Number.isSafeInteger(pixels) || pixels > MAX_IMAGE_PIXELS) {
      throw new Error('Image dimension/pixel ceiling exceeded');
    }
    const icc = imageIccCount(bytes, imageMime);
    const format = imageMime === 'image/jpeg' ? 'jpeg' : imageMime.slice('image/'.length);
    const report = simpleReport(format, request, ['isolated image decode preflight']);
    report.image_width = width;
    report.image_height = height;
    report.untrusted_resources.icc_profiles = icc;
    if (icc) report.fidelity.warnings.push('Embedded ICC/profile data is untrusted and remains isolated from the UI realm');
    return report;
  }

  if (bytes.byteLength > MAX_BROWSER_TEXT) throw new Error('Browser text intake exceeds strict fallback limit');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0')) throw new Error('Foreign text contains NUL');
  try {
    JSON.parse(text);
    return simpleReport('json', request, ['bounded JSON parse in dedicated worker']);
  } catch { /* delimited text below */ }
  const lines = text.split(/\r?\n/).slice(0, 32);
  if (lines.length && lines.some((line) => /[,;\t]/.test(line))) return simpleReport('csv', request, ['bounded delimited text intake in dedicated worker']);
  throw new Error('Unsupported foreign format');
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  let requestId = '';
  try {
    const data = event?.data;
    requestId = safeImportExportSandboxRequestId(data);
    const request = parseImportExportSandboxWorkerRequest(data);
    const report = await inspect(request);
    self.postMessage({ id: request.id, ok: true, report });
  } catch (error) {
    const message = error instanceof ImportExportSandboxRequestError
      ? error.code
      : error instanceof Error ? error.message : 'Foreign file rejected';
    self.postMessage({ id: requestId, ok: false, error: message });
  }
};
