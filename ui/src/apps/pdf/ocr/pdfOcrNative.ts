// STATUS: DIAMANT VGT SUPREME — native local OCR adapter boundary.
// No network transport exists in this adapter. Tesseract execution is delegated to the bounded Tauri command.

import { invokeNative, isNativeDesktop } from '../../../platform/native/nativeBridge';

export interface LocalOcrLanguageInventory {
  engine: 'tesseract-local';
  engineVersion: string;
  languages: string[];
}

export interface LocalOcrRecognitionRequest {
  jpegBase64: string;
  language: string;
  pageSegmentationMode?: 3 | 4 | 6 | 11 | 12 | 13;
}

export interface LocalOcrRecognitionResponse {
  engine: 'tesseract-local';
  engineVersion: string;
  language: string;
  tsv: string;
  processingTimeMs: number;
}

interface NativeLanguagesResponse {
  engine?: string;
  engine_version?: string;
  languages?: unknown;
}

interface NativeRecognitionResponse {
  engine?: string;
  engine_version?: string;
  language?: string;
  tsv?: string;
  processing_time_ms?: number;
}

const OCR_LANGUAGE_RE = /^[A-Za-z0-9_+.-]{1,64}$/u;
const MAX_OCR_TSV_CHARS = 24 * 1024 * 1024;
const MAX_OCR_LANGUAGES = 256;
const MAX_JPEG_BASE64_CHARS = 32 * 1024 * 1024;

function cleanLanguage(value: string): string {
  const language = value.trim();
  if (!OCR_LANGUAGE_RE.test(language)) throw new Error('OCR language identifier is invalid.');
  return language;
}

export function isLocalOcrAvailable(): boolean {
  return isNativeDesktop();
}

export async function listLocalOcrLanguages(): Promise<LocalOcrLanguageInventory> {
  if (!isNativeDesktop()) throw new Error('Local OCR requires the Astraea desktop runtime.');
  const payload = await invokeNative<NativeLanguagesResponse>('vgt_ocr_languages');
  if (payload.engine !== 'tesseract-local') throw new Error('Native OCR engine identity is invalid.');
  const engineVersion = String(payload.engine_version ?? '').trim().slice(0, 128);
  if (!engineVersion) throw new Error('Native OCR engine did not report a version.');
  if (!Array.isArray(payload.languages)) throw new Error('Native OCR language inventory is invalid.');
  const languages = payload.languages
    .slice(0, MAX_OCR_LANGUAGES)
    .filter((item): item is string => typeof item === 'string')
    .map(cleanLanguage);
  return { engine: 'tesseract-local', engineVersion, languages: [...new Set(languages)].sort() };
}

export async function recognizeLocalOcr(request: LocalOcrRecognitionRequest): Promise<LocalOcrRecognitionResponse> {
  if (!isNativeDesktop()) throw new Error('Local OCR requires the Astraea desktop runtime.');
  const language = cleanLanguage(request.language);
  if (!/^[A-Za-z0-9+/=]+$/u.test(request.jpegBase64) || request.jpegBase64.length < 32 || request.jpegBase64.length > MAX_JPEG_BASE64_CHARS) {
    throw new Error('OCR JPEG base64 payload violates policy.');
  }
  const psm = request.pageSegmentationMode ?? 6;
  if (![3, 4, 6, 11, 12, 13].includes(psm)) throw new Error('OCR page segmentation mode is not allowed.');
  const payload = await invokeNative<NativeRecognitionResponse>('vgt_ocr_recognize', {
    request: {
      image_base64: request.jpegBase64,
      language,
      page_segmentation_mode: psm,
    },
  });
  if (payload.engine !== 'tesseract-local') throw new Error('Native OCR engine identity is invalid.');
  const tsv = typeof payload.tsv === 'string' ? payload.tsv : '';
  if (!tsv || tsv.length > MAX_OCR_TSV_CHARS) throw new Error('Native OCR TSV output violates policy.');
  const engineVersion = String(payload.engine_version ?? '').trim().slice(0, 128);
  const returnedLanguage = cleanLanguage(String(payload.language ?? language));
  const processingTimeMs = Number(payload.processing_time_ms ?? 0);
  if (!Number.isFinite(processingTimeMs) || processingTimeMs < 0 || processingTimeMs > 120_000) throw new Error('Native OCR timing metadata is invalid.');
  return { engine: 'tesseract-local', engineVersion, language: returnedLanguage, tsv, processingTimeMs };
}
