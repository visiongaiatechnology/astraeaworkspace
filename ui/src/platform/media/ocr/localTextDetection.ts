// STATUS: DIAMANT VGT SUPREME — bounded local platform OCR adapter, no synthetic text fallbacks
export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrToken {
  text: string;
  confidence: number | null;
  box: OcrBoundingBox;
  isHandwritten?: boolean;
}

export interface OcrLine {
  lineIndex: number;
  text: string;
  tokens: OcrToken[];
  averageConfidence: number | null;
  box: OcrBoundingBox;
}

export interface OcrResult {
  fullText: string;
  lines: OcrLine[];
  tokens: OcrToken[];
  confidence: number | null;
  processingTimeMs: number;
  handwritingDetected: boolean;
  markdownFormatted: string;
  sourceWidth: number;
  sourceHeight: number;
  engine: 'shape-detection-text';
}

interface DetectedTextLike {
  rawValue?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}
interface TextDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedTextLike[]>;
}
interface TextDetectorGlobal {
  TextDetector?: new () => TextDetectorLike;
}

export const NOTES_OCR_MAX_SOURCE_PIXELS = 24_000_000;
export const NOTES_OCR_MAX_EDGE = 8_192;
export const NOTES_OCR_WORK_EDGE = 2_048;
export const NOTES_OCR_MAX_RESULTS = 4_096;
export const NOTES_OCR_MAX_TEXT = 1_000_000;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function safeMarkdownQuote(text: string): string {
  return text.split('\n').map((line) => `> ${line.replace(/\r/g, '')}`).join('\n');
}

async function loadImage(source: string): Promise<HTMLImageElement> {
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) throw new Error('OCR accepts only local PNG, JPEG or WebP image data.');
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image could not be decoded for local OCR.'));
    image.src = source;
  });
  return image;
}

async function sourceToCanvas(source: string | HTMLImageElement | HTMLCanvasElement): Promise<{ canvas: HTMLCanvasElement; sourceWidth: number; sourceHeight: number; scaleX: number; scaleY: number }> {
  if (source instanceof HTMLCanvasElement) {
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    if (sourceWidth <= 0 || sourceHeight <= 0 || sourceWidth > NOTES_OCR_MAX_EDGE || sourceHeight > NOTES_OCR_MAX_EDGE || sourceWidth * sourceHeight > NOTES_OCR_MAX_SOURCE_PIXELS) throw new Error('OCR source exceeds bounded image geometry limits.');
    return { canvas: source, sourceWidth, sourceHeight, scaleX: 1, scaleY: 1 };
  }
  const image = typeof source === 'string' ? await loadImage(source) : source;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('OCR image has invalid dimensions.');
  if (sourceWidth > NOTES_OCR_MAX_EDGE || sourceHeight > NOTES_OCR_MAX_EDGE || sourceWidth * sourceHeight > NOTES_OCR_MAX_SOURCE_PIXELS) throw new Error('OCR image exceeds the 8192px / 24MP safety limit.');
  const scale = Math.min(1, NOTES_OCR_WORK_EDGE / Math.max(sourceWidth, sourceHeight));
  const workWidth = Math.max(1, Math.round(sourceWidth * scale));
  const workHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = workWidth;
  canvas.height = workHeight;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) throw new Error('Canvas 2D context is not available for OCR.');
  context.drawImage(image, 0, 0, workWidth, workHeight);
  return { canvas, sourceWidth, sourceHeight, scaleX: sourceWidth / workWidth, scaleY: sourceHeight / workHeight };
}

export function isLocalTextDetectionAvailable(): boolean {
  return typeof (globalThis as unknown as TextDetectorGlobal).TextDetector === 'function';
}

/**
 * Performs OCR exclusively through the browser/platform-local TextDetector API.
 * No cloud request and no fabricated OCR fallback is permitted.
 */
export async function performLocalImageOcr(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  options: { enhanceContrast?: boolean; languageHint?: string } = {}
): Promise<OcrResult> {
  void options;
  const started = performance.now();
  const { canvas, sourceWidth, sourceHeight, scaleX, scaleY } = await sourceToCanvas(imageSource);
  const Detector = (globalThis as unknown as TextDetectorGlobal).TextDetector;
  if (!Detector) throw new Error('Local platform OCR is unavailable. This build will not invent OCR text or upload the image to a cloud service.');
  const detector = new Detector();
  const detections = (await detector.detect(canvas)).slice(0, NOTES_OCR_MAX_RESULTS);
  const tokens: OcrToken[] = detections.map((entry) => {
    const raw = entry.rawValue?.normalize('NFKC').trim().slice(0, 16_384) ?? '';
    const box = entry.boundingBox ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
    return {
      text: raw,
      confidence: null,
      box: {
        x: clamp(box.x * scaleX, 0, sourceWidth),
        y: clamp(box.y * scaleY, 0, sourceHeight),
        width: clamp(box.width * scaleX, 0, sourceWidth),
        height: clamp(box.height * scaleY, 0, sourceHeight),
      },
    };
  }).filter((token) => token.text.length > 0);
  tokens.sort((a, b) => Math.abs(a.box.y - b.box.y) > Math.max(a.box.height, b.box.height) * 0.5 ? a.box.y - b.box.y : a.box.x - b.box.x);
  const lines: OcrLine[] = tokens.map((token, index) => ({ lineIndex: index, text: token.text, tokens: [token], averageConfidence: null, box: token.box }));
  const fullText = tokens.map((token) => token.text).join('\n').slice(0, NOTES_OCR_MAX_TEXT);
  return {
    fullText,
    lines,
    tokens,
    confidence: null,
    processingTimeMs: Math.round(performance.now() - started),
    handwritingDetected: false,
    markdownFormatted: fullText ? `> 📄 **Local OCR result**\n>\n${safeMarkdownQuote(fullText)}\n` : '',
    sourceWidth,
    sourceHeight,
    engine: 'shape-detection-text',
  };
}


/**
 * OCR adapter for a PDF snippet that has already been rasterized by the trusted PDF surface.
 * Notes deliberately does not parse PDF bytes itself; it consumes the bounded local canvas only.
 */
export async function performLocalPdfSnippetOcr(snippetCanvas: HTMLCanvasElement): Promise<OcrResult> {
  return performLocalImageOcr(snippetCanvas);
}
