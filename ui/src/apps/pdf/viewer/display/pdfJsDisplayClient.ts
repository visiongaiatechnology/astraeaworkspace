// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — local-only PDF.js 6.3.289 display loader with bounded resources.

import type { PdfJsDisplayModule, PdfJsOpenedDisplayDocument } from '../contracts/pdfJsDisplayTypes';

export const PDFJS_DISPLAY_VERSION = '6.3.289';
export const PDFJS_DISPLAY_BUILD = '1c8020a7d';
export const PDFJS_DISPLAY_PATH = '/vendor/pdfjs/pdf.display.bootstrap.mjs';
export const PDFJS_DISPLAY_WORKER_PATH = '/vendor/pdfjs/pdf.worker.bootstrap.mjs';
export const PDFJS_DISPLAY_MAX_BYTES = 96 * 1024 * 1024;

let displayModulePromise: Promise<PdfJsDisplayModule> | null = null;

const importPdfJsDisplayModule = async (): Promise<PdfJsDisplayModule> => {
  if (!displayModulePromise) {
    const path = PDFJS_DISPLAY_PATH;
    displayModulePromise = import(/* @vite-ignore */ path).then((candidate) => {
      const module = candidate as unknown as PdfJsDisplayModule;
      if (module.version !== PDFJS_DISPLAY_VERSION || module.build !== PDFJS_DISPLAY_BUILD) {
        throw new Error(`PDF.js display version mismatch: expected ${PDFJS_DISPLAY_VERSION}/${PDFJS_DISPLAY_BUILD}, received ${String(module.version)}/${String(module.build)}`);
      }
      if (!module.GlobalWorkerOptions || typeof module.getDocument !== 'function' || typeof module.TextLayer !== 'function' || typeof module.AnnotationLayer !== 'function') {
        throw new Error('Vendored PDF.js display module is missing required rendering exports');
      }
      module.GlobalWorkerOptions.workerSrc = PDFJS_DISPLAY_WORKER_PATH;
      return module;
    }).catch((error) => {
      displayModulePromise = null;
      throw error;
    });
  }
  return displayModulePromise;
};

export const openPdfJsDisplayDocument = async (
  sourceBytes: Uint8Array,
  password?: string,
): Promise<PdfJsOpenedDisplayDocument> => {
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0) throw new Error('PDF.js display requires non-empty PDF bytes');
  if (sourceBytes.byteLength > PDFJS_DISPLAY_MAX_BYTES) throw new Error('PDF.js display source exceeds Astraea native PDF import boundary');
  if (typeof Worker === 'undefined' || typeof document === 'undefined') throw new Error('PDF.js display requires a browser document and Module Worker API');

  const module = await importPdfJsDisplayModule();
  const bytes = new Uint8Array(sourceBytes.byteLength);
  bytes.set(sourceBytes);
  const loadingTask = module.getDocument({
    data: bytes,
    password: password || null,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    enableXfa: false,
    isEvalSupported: false,
    useWasm: false,
    useWorkerFetch: false,
    cMapUrl: null,
    iccUrl: null,
    standardFontDataUrl: null,
    wasmUrl: null,
    maxImageSize: 16_777_216,
    canvasMaxAreaInBytes: 32 * 1024 * 1024,
    isOffscreenCanvasSupported: typeof OffscreenCanvas !== 'undefined',
    isImageDecoderSupported: typeof ImageDecoder !== 'undefined',
    disableFontFace: false,
    useSystemFonts: true,
    stopAtErrors: true,
    verbosity: 0,
  });
  loadingTask.onPassword = (_updatePassword, reason) => {
    throw new Error(reason === 1 ? 'PDF password required' : 'Incorrect PDF password');
  };
  try {
    const documentProxy = await Promise.race([
      loadingTask.promise,
      new Promise<never>((_, reject) => globalThis.setTimeout(() => reject(new Error('PDF.js display document parse timed out')), 20_000)),
    ]);
    if (!Number.isInteger(documentProxy.numPages) || documentProxy.numPages < 1 || documentProxy.numPages > 100_000) {
      throw new Error('PDF.js display returned an invalid or unbounded page count');
    }
    return { module, loadingTask, document: documentProxy };
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    throw error;
  }
};
