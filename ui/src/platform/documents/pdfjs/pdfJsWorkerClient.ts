// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — bounded direct client for the vendored Mozilla PDF.js 6.3.289 worker.
// This module intentionally talks to the worker protocol without granting network capabilities.

import { fromSerializedError, PdfJsMessageHandler, type PdfJsSerializedError } from './pdfJsWorkerProtocol';

const PDFJS_API_VERSION = '6.3.289';
export const PDFJS_WORKER_PATH = '/vendor/pdfjs/pdf.worker.bootstrap.mjs';
const MAX_TEXT_ITEMS_PER_PAGE = 250_000;
const MAX_OUTLINE_NODES = 100_000;
const MAX_ATTACHMENT_BYTES = 96 * 1024 * 1024;

export interface PdfJsPageInfo {
  pageNumber: number;
  rotation: number;
  userUnit: number;
  view: [number, number, number, number];
  ref: { num: number; gen: number } | null;
  label?: string;
}

export interface PdfJsTextItem {
  str: string;
  dir?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
  hasEOL?: boolean;
}

export interface PdfJsSearchHit {
  pageNumber: number;
  itemIndex: number;
  start: number;
  end: number;
  text: string;
}

export interface PdfJsLink {
  id: string;
  pageNumber: number;
  title: string;
  url: string | null;
  destination: unknown | null;
  targetPage: number | null;
}

export interface PdfJsAttachment {
  name: string;
  description: string;
  content: Uint8Array;
}

export interface PdfJsDocumentSnapshot {
  version: typeof PDFJS_API_VERSION;
  pageCount: number;
  fingerprints: string[];
  pageLabels: string[] | null;
  outline: unknown[] | null;
  attachments: Record<string, unknown> | null;
  optionalContentConfig: unknown | null;
  fieldObjects: Record<string, unknown[]> | null;
  permissions: number[] | null;
  metadata: unknown;
  hasJavaScriptActions: boolean;
  pages: PdfJsPageInfo[];
}

export class PdfJsWorkerDocument {
  private terminated = false;

  constructor(
    readonly snapshot: PdfJsDocumentSnapshot,
    private readonly worker: Worker,
    private readonly rootHandler: PdfJsMessageHandler,
    private readonly documentHandler: PdfJsMessageHandler,
  ) {}

  async getAnnotations(pageNumber: number): Promise<unknown[]> {
    this.assertPage(pageNumber);
    const annotations = await this.documentHandler.sendWithPromise<unknown[]>('GetAnnotations', {
      pageIndex: pageNumber - 1,
      intent: 2,
    });
    return Array.isArray(annotations) ? annotations : [];
  }

  async getStructTree(pageNumber: number): Promise<unknown | null> {
    this.assertPage(pageNumber);
    return this.documentHandler.sendWithPromise<unknown | null>('GetStructTree', { pageIndex: pageNumber - 1 });
  }

  async resolveDestinationPage(destination: unknown): Promise<number | null> {
    let resolved = destination;
    if (typeof destination === 'string') {
      resolved = await this.documentHandler.sendWithPromise<unknown>('GetDestination', { id: destination });
    }
    if (!Array.isArray(resolved) || resolved.length === 0) return null;
    const first = resolved[0];
    if (Number.isInteger(first)) {
      const page = Number(first) + 1;
      return page >= 1 && page <= this.snapshot.pageCount ? page : null;
    }
    if (!first || typeof first !== 'object') return null;
    const ref = first as { num?: unknown; gen?: unknown };
    if (!Number.isInteger(ref.num) || !Number.isInteger(ref.gen)) return null;
    const page = this.snapshot.pages.find((candidate) => candidate.ref?.num === ref.num && candidate.ref?.gen === ref.gen);
    return page?.pageNumber ?? null;
  }

  async getLinks(pageNumber: number): Promise<PdfJsLink[]> {
    const annotations = await this.getAnnotations(pageNumber);
    const links: PdfJsLink[] = [];
    for (const candidate of annotations) {
      if (!candidate || typeof candidate !== 'object') continue;
      const annotation = candidate as Record<string, unknown>;
      if (annotation.subtype !== 'Link' && annotation.annotationType !== 2) continue;
      const contents = annotation.contentsObj && typeof annotation.contentsObj === 'object'
        ? (annotation.contentsObj as { str?: unknown }).str
        : undefined;
      const destination = annotation.dest ?? null;
      const targetPage = destination ? await this.resolveDestinationPage(destination) : null;
      links.push({
        id: typeof annotation.id === 'string' ? annotation.id : `page-${pageNumber}-link-${links.length + 1}`,
        pageNumber,
        title: typeof contents === 'string' && contents.trim() ? contents.trim() : `Link ${links.length + 1}`,
        url: typeof annotation.url === 'string' ? annotation.url : null,
        destination,
        targetPage,
      });
      if (links.length > 10_000) throw new Error('PDF link inventory exceeded the bounded annotation budget');
    }
    return links;
  }

  async getAttachments(): Promise<PdfJsAttachment[]> {
    const inventory = attachmentEntries(this.snapshot.attachments);
    if (inventory.length === 0) return [];
    const attachments: PdfJsAttachment[] = [];
    let totalBytes = 0;
    for (const [id, candidate] of inventory) {
      if (!candidate || typeof candidate !== 'object') continue;
      const record = candidate as { filename?: unknown; rawFilename?: unknown; description?: unknown };
      const payload = await this.documentHandler.sendWithPromise<unknown>('GetAttachmentContent', id);
      const content = payload instanceof Uint8Array
        ? new Uint8Array(payload)
        : payload instanceof ArrayBuffer
          ? new Uint8Array(payload.slice(0))
          : ArrayBuffer.isView(payload)
            ? new Uint8Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength))
            : null;
      if (!content) throw new Error(`PDF.js returned invalid attachment payload for ${id}`);
      totalBytes += content.byteLength;
      if (content.byteLength > MAX_ATTACHMENT_BYTES || totalBytes > MAX_ATTACHMENT_BYTES) {
        throw new Error('PDF embedded attachments exceed the bounded extraction budget');
      }
      const preferredName = typeof record.filename === 'string' && record.filename.trim()
        ? record.filename
        : typeof record.rawFilename === 'string' && record.rawFilename.trim()
          ? record.rawFilename
          : id;
      attachments.push({
        name: preferredName,
        description: typeof record.description === 'string' ? record.description : '',
        content,
      });
    }
    return attachments;
  }

  async getTextItems(pageNumber: number): Promise<PdfJsTextItem[]> {
    this.assertPage(pageNumber);
    const stream = this.documentHandler.sendWithStream('GetTextContent', {
      pageId: pageNumber - 1,
      pageIndex: pageNumber - 1,
      includeMarkedContent: true,
      disableNormalization: false,
    });
    const reader = stream.getReader();
    const items: PdfJsTextItem[] = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value as { items?: unknown[] } | undefined;
        if (!Array.isArray(chunk?.items)) continue;
        for (const candidate of chunk.items) {
          if (!candidate || typeof candidate !== 'object' || !('str' in candidate)) continue;
          const record = candidate as Record<string, unknown>;
          if (typeof record.str !== 'string') continue;
          items.push({
            str: record.str,
            ...(typeof record.dir === 'string' ? { dir: record.dir } : {}),
            ...(Array.isArray(record.transform) && record.transform.every((entry) => typeof entry === 'number') ? { transform: record.transform as number[] } : {}),
            ...(typeof record.width === 'number' ? { width: record.width } : {}),
            ...(typeof record.height === 'number' ? { height: record.height } : {}),
            ...(typeof record.fontName === 'string' ? { fontName: record.fontName } : {}),
            ...(typeof record.hasEOL === 'boolean' ? { hasEOL: record.hasEOL } : {}),
          });
          if (items.length > MAX_TEXT_ITEMS_PER_PAGE) throw new Error('PDF.js text extraction exceeded the per-page item budget');
        }
      }
      return items;
    } finally {
      reader.releaseLock();
    }
  }

  async search(query: string, caseSensitive = false): Promise<PdfJsSearchHit[]> {
    const needle = query.trim();
    if (!needle || needle.length > 1024) return [];
    const expected = caseSensitive ? needle : needle.toLocaleLowerCase();
    const results: PdfJsSearchHit[] = [];
    for (let pageNumber = 1; pageNumber <= this.snapshot.pageCount; pageNumber += 1) {
      const items = await this.getTextItems(pageNumber);
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const text = items[itemIndex].str;
        const haystack = caseSensitive ? text : text.toLocaleLowerCase();
        let offset = 0;
        while (offset <= haystack.length - expected.length) {
          const start = haystack.indexOf(expected, offset);
          if (start < 0) break;
          results.push({ pageNumber, itemIndex, start, end: start + needle.length, text });
          if (results.length >= 10_000) return results;
          offset = start + Math.max(1, expected.length);
        }
      }
    }
    return results;
  }

  async destroy(): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    try {
      await this.documentHandler.sendWithPromise('Terminate', null);
    } catch {
      // The worker is terminated immediately below; cleanup is best-effort after a broken document channel.
    }
    this.documentHandler.destroy();
    this.rootHandler.destroy();
    this.worker.terminate();
  }

  private assertPage(pageNumber: number): void {
    if (this.terminated) throw new Error('PDF.js document has already been destroyed');
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.snapshot.pageCount) {
      throw new Error(`PDF page ${pageNumber} is outside the parsed document boundary`);
    }
  }
}

function boundedOutlineCount(outline: unknown[] | null): number {
  if (!outline) return 0;
  let count = 0;
  const stack: unknown[] = [...outline];
  while (stack.length > 0) {
    const node = stack.pop();
    count += 1;
    if (count > MAX_OUTLINE_NODES) throw new Error('PDF outline exceeds the bounded node budget');
    if (node && typeof node === 'object') {
      const items = (node as { items?: unknown[] }).items;
      if (Array.isArray(items)) stack.push(...items);
    }
  }
  return count;
}

function attachmentEntries(attachments: Map<string, unknown> | Record<string, unknown> | null): Array<[string, unknown]> {
  if (!attachments) return [];
  const entries = attachments instanceof Map ? [...attachments.entries()] : Object.entries(attachments);
  if (entries.length > 4_096) throw new Error('PDF embedded attachment inventory exceeds the bounded entry budget');
  for (const [id] of entries) {
    if (!id || id.length > 4_096) throw new Error('PDF embedded attachment identifier exceeds the bounded metadata budget');
  }
  return entries;
}

function normalizeRecordMap<T>(value: Map<string, T> | Record<string, T> | null): Record<string, T> | null {
  if (!value) return null;
  return value instanceof Map ? Object.fromEntries(value.entries()) : value;
}

function boundedAttachments(attachments: Map<string, unknown> | Record<string, unknown> | null): Record<string, unknown> | null {
  const normalized = normalizeRecordMap(attachments);
  attachmentEntries(normalized);
  return normalized;
}

export async function openPdfJsWorkerDocument(
  sourceBytes: Uint8Array,
  password?: string,
  workerPath = PDFJS_WORKER_PATH,
): Promise<PdfJsWorkerDocument> {
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0) throw new Error('PDF.js worker requires non-empty PDF bytes');
  if (sourceBytes.byteLength > 96 * 1024 * 1024) throw new Error('PDF.js worker source exceeds Astraea native PDF import boundary');
  if (typeof Worker === 'undefined') throw new Error('Module Worker API is unavailable');

  const worker = new Worker(workerPath, { type: 'module', name: `astraea-pdfjs-${PDFJS_API_VERSION}` });
  const root = new PdfJsMessageHandler('main', 'worker', worker);
  let documentHandler: PdfJsMessageHandler | null = null;
  try {
    const ready = new Promise<void>((resolve) => root.on('ready', () => resolve()));
    await Promise.race([
      ready,
      new Promise<never>((_, reject) => globalThis.setTimeout(() => reject(new Error('PDF.js worker bootstrap timed out')), 5_000)),
    ]);

    root.send('configure', { verbosity: 0 });
    const docId = `astraea-${crypto.randomUUID()}`;
    const transferable = new Uint8Array(sourceBytes);
    const workerId = await root.sendWithPromise<string>('GetDocRequest', {
      docId,
      apiVersion: PDFJS_API_VERSION,
      data: transferable,
      password: password || null,
      disableAutoFetch: true,
      rangeChunkSize: 65536,
      length: transferable.byteLength,
      docBaseUrl: null,
      enableXfa: false,
      evaluatorOptions: {
        maxImageSize: 16_777_216,
        disableFontFace: false,
        ignoreErrors: false,
        isEvalSupported: false,
        isOffscreenCanvasSupported: typeof OffscreenCanvas !== 'undefined',
        isImageDecoderSupported: typeof ImageDecoder !== 'undefined',
        canvasMaxAreaInBytes: 16_777_216,
        useSystemFonts: true,
        useWasm: false,
        useWorkerFetch: false,
        cMapUrl: null,
        iccUrl: null,
        standardFontDataUrl: null,
        wasmUrl: null,
        cMapPacked: true,
        fontExtraProperties: false,
      },
    }, [transferable.buffer]);

    documentHandler = new PdfJsMessageHandler(docId, workerId, worker);
    let docResolve!: (value: { pdfInfo: { numPages: number; fingerprints: string[] } }) => void;
    let docReject!: (reason: Error) => void;
    const docReady = new Promise<{ pdfInfo: { numPages: number; fingerprints: string[] } }>((resolve, reject) => {
      docResolve = resolve;
      docReject = reject;
    });
    documentHandler.on('GetDoc', (data) => { docResolve(data as { pdfInfo: { numPages: number; fingerprints: string[] } }); });
    documentHandler.on('DocException', (data) => { docReject(fromSerializedError(data as PdfJsSerializedError)); });
    documentHandler.on('PasswordRequest', () => {
      if (password) return { password };
      throw new Error('PDF password required');
    });
    documentHandler.on('DataLoaded', () => undefined);
    documentHandler.on('DocProgress', () => undefined);
    documentHandler.on('UnsupportedFeature', () => undefined);
    documentHandler.on('commonobj', () => undefined);
    documentHandler.on('obj', () => undefined);
    documentHandler.on('DocStats', () => undefined);
    documentHandler.on('FetchBuiltInCMap', () => { throw new Error('External PDF.js CMap fetch denied by local-only policy'); });
    documentHandler.on('FetchStandardFontData', () => { throw new Error('External PDF.js standard-font fetch denied by local-only policy'); });
    documentHandler.on('FetchWasm', () => { throw new Error('External PDF.js WASM fetch denied by local-only policy'); });
    documentHandler.on('FetchImage', () => { throw new Error('External PDF.js image fetch denied by local-only policy'); });
    documentHandler.send('Ready', null);

    const doc = await Promise.race([
      docReady,
      new Promise<never>((_, reject) => globalThis.setTimeout(() => reject(new Error('PDF.js document parse timed out')), 15_000)),
    ]);
    const pageCount = doc.pdfInfo.numPages;
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100_000) throw new Error('PDF.js returned an invalid or unbounded page count');

    const [pageLabels, outline, attachments, optionalContentConfig, fieldObjects, permissions, metadata, hasJavaScriptActions] = await Promise.all([
      documentHandler.sendWithPromise<string[] | null>('GetPageLabels', null),
      documentHandler.sendWithPromise<unknown[] | null>('GetOutline', null),
      documentHandler.sendWithPromise<Map<string, unknown> | Record<string, unknown> | null>('GetAttachments', null),
      documentHandler.sendWithPromise<unknown | null>('GetOptionalContentConfig', null),
      documentHandler.sendWithPromise<Map<string, unknown[]> | Record<string, unknown[]> | null>('GetFieldObjects', null),
      documentHandler.sendWithPromise<number[] | null>('GetPermissions', null),
      documentHandler.sendWithPromise<unknown>('GetMetadata', null),
      documentHandler.sendWithPromise<boolean>('HasJSActions', null),
    ]);
    boundedOutlineCount(outline);
    boundedAttachments(attachments);
    if (pageLabels && pageLabels.length !== pageCount) throw new Error('PDF.js page-label count does not match parsed page count');

    const pages: PdfJsPageInfo[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const page = await documentHandler.sendWithPromise<{
        rotate: number;
        ref: { num: number; gen: number } | null;
        userUnit: number;
        view: [number, number, number, number];
      }>('GetPage', { pageIndex });
      if (!Array.isArray(page.view) || page.view.length !== 4 || !page.view.every(Number.isFinite)) {
        throw new Error(`PDF.js returned invalid page geometry for page ${pageIndex + 1}`);
      }
      pages.push({
        pageNumber: pageIndex + 1,
        rotation: page.rotate,
        userUnit: page.userUnit,
        view: page.view,
        ref: page.ref,
        ...(pageLabels?.[pageIndex] ? { label: pageLabels[pageIndex] } : {}),
      });
    }

    return new PdfJsWorkerDocument({
      version: PDFJS_API_VERSION,
      pageCount,
      fingerprints: Array.isArray(doc.pdfInfo.fingerprints) ? doc.pdfInfo.fingerprints : [],
      pageLabels,
      outline,
      attachments: boundedAttachments(attachments),
      optionalContentConfig,
      fieldObjects: normalizeRecordMap(fieldObjects),
      permissions,
      metadata,
      hasJavaScriptActions: Boolean(hasJavaScriptActions),
      pages,
    }, worker, root, documentHandler);
  } catch (error) {
    documentHandler?.destroy();
    root.destroy();
    worker.terminate();
    throw error;
  }
}
