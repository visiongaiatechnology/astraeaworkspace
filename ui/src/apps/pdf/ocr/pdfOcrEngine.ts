// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — bounded local OCR orchestration and searchable-layer model.
// Recognition is delegated to an explicit local adapter; this file never invents OCR text.

import type {
  PdfDocumentModel,
  PdfOcrLayerModel,
  PdfOcrLineModel,
  PdfOcrWordModel,
  PdfPageBox,
  PdfPageImage,
  PdfPageModel,
  PdfSectionModel,
} from '../../../shared/contracts/workspace';
import { recognizeLocalOcr, type LocalOcrRecognitionRequest, type LocalOcrRecognitionResponse } from './pdfOcrNative';

export type PdfOcrLanguage = string;

export interface PdfOcrRegion {
  /** Normalized left coordinate within the displayed scan image. */
  x: number;
  /** Normalized top coordinate within the displayed scan image. */
  y: number;
  width: number;
  height: number;
}

export interface PdfPreparedOcrImage {
  pageNumber: number;
  imageId: string;
  jpegBase64: string;
  pageBounds: PdfPageBox;
  /** Region of the original displayed image represented by the prepared JPEG. */
  mappingRegion: PdfOcrRegion;
}

export interface PdfPageOcrResult {
  pageNumber: number;
  engine: 'tesseract-local';
  engineVersion: string;
  language: string;
  sourceImageIds: string[];
  lines: PdfOcrLineModel[];
  fullText: string;
  meanConfidence: number;
  processingTimeMs: number;
}

export interface BatchOcrProgress {
  currentPage: number;
  totalPages: number;
  percentComplete: number;
  status: string;
}

export interface PdfOcrAdapter {
  recognize(request: LocalOcrRecognitionRequest): Promise<LocalOcrRecognitionResponse>;
}

export interface PdfOcrBatchOptions {
  language: string;
  pageSegmentationMode?: 3 | 4 | 6 | 11 | 12 | 13;
}

interface ParsedTsvWord {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
  block: number;
  paragraph: number;
  line: number;
  word: number;
}

interface ParsedTsv {
  width: number;
  height: number;
  words: ParsedTsvWord[];
}

export const PDF_OCR_LIMITS = {
  maxTsvChars: 24 * 1024 * 1024,
  maxRows: 120_000,
  maxWordsPerImage: 60_000,
  maxLinesPerPage: 20_000,
  maxTextCharsPerWord: 512,
  maxTextCharsPerPage: 8 * 1024 * 1024,
  maxImagesPerPage: 32,
  maxPagesPerBatch: 2_000,
} as const;

const DEFAULT_REGION: PdfOcrRegion = { x: 0, y: 0, width: 1, height: 1 };
const localAdapter: PdfOcrAdapter = { recognize: recognizeLocalOcr };

function finiteInt(value: string, minimum = 0): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && Number.isFinite(parsed) && parsed >= minimum ? parsed : null;
}

function finiteNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanOcrText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim().slice(0, PDF_OCR_LIMITS.maxTextCharsPerWord);
}

function normalizeRegion(region: PdfOcrRegion | undefined): PdfOcrRegion {
  const value = region ?? DEFAULT_REGION;
  const values = [value.x, value.y, value.width, value.height];
  if (!values.every(Number.isFinite) || value.x < 0 || value.y < 0 || value.width <= 0 || value.height <= 0 || value.x + value.width > 1.000001 || value.y + value.height > 1.000001) {
    throw new Error('OCR region must be a finite normalized rectangle inside the source image.');
  }
  return {
    x: Math.max(0, Math.min(1, value.x)),
    y: Math.max(0, Math.min(1, value.y)),
    width: Math.max(0.000001, Math.min(1 - value.x, value.width)),
    height: Math.max(0.000001, Math.min(1 - value.y, value.height)),
  };
}

export function parseTesseractTsv(tsv: string): ParsedTsv {
  if (!tsv || tsv.length > PDF_OCR_LIMITS.maxTsvChars) throw new Error('OCR TSV violates size policy.');
  const rows = tsv.split(/\r?\n/u);
  if (rows.length < 2 || rows.length > PDF_OCR_LIMITS.maxRows) throw new Error('OCR TSV row count violates policy.');
  const header = rows[0].split('\t');
  const expected = ['level', 'page_num', 'block_num', 'par_num', 'line_num', 'word_num', 'left', 'top', 'width', 'height', 'conf', 'text'];
  if (expected.some((column, index) => header[index] !== column)) throw new Error('OCR TSV header is unsupported.');

  let width = 0;
  let height = 0;
  const words: ParsedTsvWord[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    if (!rows[index]) continue;
    const columns = rows[index].split('\t');
    if (columns.length < 12) continue;
    const level = finiteInt(columns[0]);
    const left = finiteInt(columns[6]);
    const top = finiteInt(columns[7]);
    const rowWidth = finiteInt(columns[8]);
    const rowHeight = finiteInt(columns[9]);
    if (level === null || left === null || top === null || rowWidth === null || rowHeight === null) continue;
    if (level === 1) {
      width = Math.max(width, rowWidth);
      height = Math.max(height, rowHeight);
      continue;
    }
    if (level !== 5 || rowWidth < 1 || rowHeight < 1) continue;
    const text = cleanOcrText(columns.slice(11).join('\t'));
    if (!text) continue;
    const confidenceRaw = finiteNumber(columns[10]);
    if (confidenceRaw === null || confidenceRaw < 0) continue;
    const block = finiteInt(columns[2]) ?? 0;
    const paragraph = finiteInt(columns[3]) ?? 0;
    const line = finiteInt(columns[4]) ?? 0;
    const word = finiteInt(columns[5]) ?? words.length + 1;
    words.push({ text, confidence: Math.max(0, Math.min(100, confidenceRaw)), left, top, width: rowWidth, height: rowHeight, block, paragraph, line, word });
    if (words.length > PDF_OCR_LIMITS.maxWordsPerImage) throw new Error('OCR word count exceeds policy.');
  }
  if (width < 1 || height < 1 || width > 100_000 || height > 100_000) throw new Error('OCR TSV page dimensions are invalid.');
  return { width, height, words };
}

function mapPixelBoxToPdf(
  word: Pick<ParsedTsvWord, 'left' | 'top' | 'width' | 'height'>,
  parsedWidth: number,
  parsedHeight: number,
  pageBounds: PdfPageBox,
  mappingRegion: PdfOcrRegion,
): PdfPageBox {
  const region = normalizeRegion(mappingRegion);
  const left = region.x + (word.left / parsedWidth) * region.width;
  const top = region.y + (word.top / parsedHeight) * region.height;
  const width = (word.width / parsedWidth) * region.width;
  const height = (word.height / parsedHeight) * region.height;
  return {
    x: pageBounds.x + left * pageBounds.width,
    y: pageBounds.y + (1 - top - height) * pageBounds.height,
    width: Math.max(0.1, width * pageBounds.width),
    height: Math.max(0.1, height * pageBounds.height),
  };
}

function unionBoxes(boxes: readonly PdfPageBox[]): PdfPageBox {
  const x1 = Math.min(...boxes.map((box) => box.x));
  const y1 = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x + box.width));
  const y2 = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function buildImageLines(parsed: ParsedTsv, input: PdfPreparedOcrImage): PdfOcrLineModel[] {
  const groups = new Map<string, PdfOcrWordModel[]>();
  for (const word of parsed.words) {
    const key = `${word.block}:${word.paragraph}:${word.line}`;
    const words = groups.get(key) ?? [];
    words.push({
      id: `ocr-p${input.pageNumber}-i${input.imageId}-b${word.block}-p${word.paragraph}-l${word.line}-w${word.word}`,
      text: word.text,
      confidence: Math.round(word.confidence * 100) / 100,
      bounds: mapPixelBoxToPdf(word, parsed.width, parsed.height, input.pageBounds, input.mappingRegion),
      sourceImageId: input.imageId,
    });
    groups.set(key, words);
  }
  const lines: PdfOcrLineModel[] = [];
  for (const [key, rawWords] of groups) {
    const words = [...rawWords].sort((a, b) => a.bounds.x - b.bounds.x || b.bounds.y - a.bounds.y);
    const text = words.map((word) => word.text).join(' ').slice(0, PDF_OCR_LIMITS.maxTextCharsPerPage);
    const confidence = words.reduce((sum, word) => sum + word.confidence, 0) / Math.max(1, words.length);
    lines.push({ id: `ocr-line-${input.pageNumber}-${input.imageId}-${key.replaceAll(':', '-')}`, text, confidence: Math.round(confidence * 100) / 100, bounds: unionBoxes(words.map((word) => word.bounds)), words });
    if (lines.length > PDF_OCR_LIMITS.maxLinesPerPage) throw new Error('OCR line count exceeds policy.');
  }
  return lines.sort((a, b) => b.bounds.y - a.bounds.y || a.bounds.x - b.bounds.x);
}

export async function processSinglePreparedImageOcr(
  input: PdfPreparedOcrImage,
  options: PdfOcrBatchOptions,
  adapter: PdfOcrAdapter = localAdapter,
): Promise<PdfPageOcrResult> {
  const language = options.language.trim();
  if (!/^[A-Za-z0-9_+.-]{1,64}$/u.test(language)) throw new Error('OCR language identifier is invalid.');
  const recognition = await adapter.recognize({ jpegBase64: input.jpegBase64, language, pageSegmentationMode: options.pageSegmentationMode ?? 6 });
  const parsed = parseTesseractTsv(recognition.tsv);
  const lines = buildImageLines(parsed, input);
  const allWords = lines.flatMap((line) => line.words);
  const meanConfidence = allWords.length ? allWords.reduce((sum, word) => sum + word.confidence, 0) / allWords.length : 0;
  const fullText = lines.map((line) => line.text).join('\n').slice(0, PDF_OCR_LIMITS.maxTextCharsPerPage);
  return {
    pageNumber: input.pageNumber,
    engine: 'tesseract-local',
    engineVersion: recognition.engineVersion,
    language: recognition.language,
    sourceImageIds: [input.imageId],
    lines,
    fullText,
    meanConfidence: Math.round(meanConfidence * 100) / 100,
    processingTimeMs: recognition.processingTimeMs,
  };
}

export async function processBatchPdfOcr(
  images: readonly PdfPreparedOcrImage[],
  options: PdfOcrBatchOptions,
  onProgress?: (progress: BatchOcrProgress) => void,
  adapter: PdfOcrAdapter = localAdapter,
): Promise<PdfPageOcrResult[]> {
  if (images.length < 1 || images.length > PDF_OCR_LIMITS.maxPagesPerBatch * PDF_OCR_LIMITS.maxImagesPerPage) throw new Error('OCR batch size violates policy.');
  const byPage = new Map<number, PdfPageOcrResult[]>();
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    onProgress?.({ currentPage: image.pageNumber, totalPages: images.length, percentComplete: Math.round((index / images.length) * 100), status: `Recognizing page ${image.pageNumber} locally…` });
    const result = await processSinglePreparedImageOcr(image, options, adapter);
    byPage.set(image.pageNumber, [...(byPage.get(image.pageNumber) ?? []), result]);
  }
  const results = [...byPage.entries()].sort(([a], [b]) => a - b).map(([pageNumber, pageResults]) => {
    const lines = pageResults.flatMap((result) => result.lines).sort((a, b) => b.bounds.y - a.bounds.y || a.bounds.x - b.bounds.x);
    const words = lines.flatMap((line) => line.words);
    return {
      pageNumber,
      engine: 'tesseract-local' as const,
      engineVersion: pageResults[0]?.engineVersion ?? 'unknown',
      language: pageResults[0]?.language ?? options.language,
      sourceImageIds: [...new Set(pageResults.flatMap((result) => result.sourceImageIds))],
      lines,
      fullText: lines.map((line) => line.text).join('\n').slice(0, PDF_OCR_LIMITS.maxTextCharsPerPage),
      meanConfidence: words.length ? Math.round((words.reduce((sum, word) => sum + word.confidence, 0) / words.length) * 100) / 100 : 0,
      processingTimeMs: pageResults.reduce((sum, result) => sum + result.processingTimeMs, 0),
    };
  });
  onProgress?.({ currentPage: results.at(-1)?.pageNumber ?? 0, totalPages: images.length, percentComplete: 100, status: `Local OCR complete for ${results.length} page(s).` });
  return results;
}

export function isLikelyScannedPage(page: PdfPageModel): boolean {
  const visibleText = page.sections.filter((section) => !section.isRedacted).map((section) => section.content.trim()).join(' ').length;
  return (page.images?.length ?? 0) > 0 && visibleText < 24;
}

export function detectScannedPages(model: PdfDocumentModel): number[] {
  return model.pages.filter(isLikelyScannedPage).map((page) => page.pageNumber);
}

export function applyOcrResultsToDocument(model: PdfDocumentModel, results: readonly PdfPageOcrResult[], now = Date.now()): PdfDocumentModel {
  const resultByPage = new Map(results.map((result) => [result.pageNumber, result]));
  return {
    ...model,
    pages: model.pages.map((page) => {
      const result = resultByPage.get(page.pageNumber);
      if (!result) return page;
      const layer: PdfOcrLayerModel = {
        engine: 'tesseract-local', engineVersion: result.engineVersion, language: result.language, processedAt: now,
        meanConfidence: result.meanConfidence, originalImagesPreserved: true, sourceImageIds: result.sourceImageIds, lines: result.lines,
      };
      return { ...page, ocrLayer: layer };
    }),
  };
}

export function correctOcrWord(model: PdfDocumentModel, pageNumber: number, wordId: string, replacement: string): PdfDocumentModel {
  const text = cleanOcrText(replacement);
  if (!text) throw new Error('Corrected OCR text cannot be empty.');
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber || !page.ocrLayer) return page;
      let found = false;
      const lines = page.ocrLayer.lines.map((line) => {
        const words = line.words.map((word) => {
          if (word.id !== wordId) return word;
          found = true;
          return { ...word, text };
        });
        return { ...line, words, text: words.map((word) => word.text).join(' ') };
      });
      if (!found) throw new Error('OCR correction target does not exist.');
      return { ...page, ocrLayer: { ...page.ocrLayer, lines } };
    }),
  };
}

export function convertOcrPageToEditable(model: PdfDocumentModel, pageNumber: number, keepScanImage = true): PdfDocumentModel {
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber || !page.ocrLayer) return page;
      const sections: PdfSectionModel[] = page.ocrLayer.lines.map((line, index) => ({ id: `ocr-editable-${pageNumber}-${index + 1}`, type: 'paragraph', content: line.text, bounds: { ...line.bounds } }));
      return { ...page, sections, images: keepScanImage ? page.images : [], ocrLayer: undefined };
    }),
  };
}

export function jpegBase64FromDataUrl(dataUrl: string): string {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match || match[1].length < 32) throw new Error('OCR accepts only normalized local JPEG images.');
  return match[1];
}

export function preparedOcrImageFromPageImage(pageNumber: number, image: PdfPageImage, region?: PdfOcrRegion): PdfPreparedOcrImage {
  return { pageNumber, imageId: image.id, jpegBase64: jpegBase64FromDataUrl(image.dataUrl), pageBounds: { ...image.bounds }, mappingRegion: normalizeRegion(region) };
}
