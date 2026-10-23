// STATUS: PLATIN

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WHITEBOARD_INTERCHANGE_LIMITS,
  buildWhiteboardPdf,
  importPdfPagesAsWhiteboardItems,
  itemsForWhiteboardScope,
} from '../../interchange/whiteboardExportImportEngine';
import type { WhiteboardItem } from '../../types';
import { buildPresentPdfFromJpegs } from '../../../present/interchange/render/presentExport';
import { flattenForeignPdfPages } from '../../../pdf-studio/import/pdfForeignPageImport';

vi.mock('../../core/container', () => ({
  packLocalEncryptedContainer: vi.fn(),
  unpackLocalEncryptedContainer: vi.fn(),
}));
vi.mock('../../core/interop/xml', () => ({ inspectBoundedForeignXml: vi.fn() }));
vi.mock('../../../present/interchange/render/presentExport', () => ({ buildPresentPdfFromJpegs: vi.fn(() => new Uint8Array([1])) }));
vi.mock('../../../pdf-studio/import/pdfForeignPageImport', () => ({ flattenForeignPdfPages: vi.fn() }));
vi.mock('../../interchange/whiteboardInterchangeEngine', () => ({
  exportWhiteboardToSvg: vi.fn(() => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>'),
}));
vi.mock('../../model/whiteboardObjectEngine', () => ({
  sanitizeWhiteboardSvgSource: vi.fn((source: string) => source),
  WHITEBOARD_SVG_MAX_BYTES: 2 * 1024 * 1024,
}));

const item = (id: string, overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id,
  type: 'shape',
  x: 0,
  y: 0,
  width: 80,
  height: 48,
  text: id,
  ...overrides,
});

function stubRasterSurface(dataUrl = 'data:image/jpeg;base64,ABCD') {
  const context = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => dataUrl),
  } as unknown as HTMLCanvasElement;
  class TestImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  // The blob API is stubbed through a **subclass** of the real `URL`, never through a plain object:
  // replacing the global constructor made `new URL(...)` throw for every later test file that ran in the
  // same worker (source-contract tests use `new URL(..., import.meta.url)`, the object engine parses
  // links). That leak made the suite order-dependent: whichever files shared a worker after this one
  // failed with "URL is not a constructor".
  class TestUrl extends URL {}
  Object.assign(TestUrl, {
    createObjectURL: vi.fn(() => 'blob:whiteboard-export-test'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  vi.stubGlobal('URL', TestUrl);
  return { canvas, context };
}

describe('Whiteboard export and import resource boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // The stub must never outlive the test that installed it: with a shuffled order the raster test can be
  // the last one of this file, and the next file in the same worker would inherit a broken global.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects oversized board export instead of silently dropping items', () => {
    const oversized = new Array<WhiteboardItem>(WHITEBOARD_INTERCHANGE_LIMITS.maxItems + 1);
    expect(() => itemsForWhiteboardScope(oversized)).toThrow('Whiteboard item count exceeds the export policy');
  });

  it('rejects PDF frame overflow before rasterizing rather than exporting a truncated document', async () => {
    const frames = Array.from({ length: WHITEBOARD_INTERCHANGE_LIMITS.maxPdfPages + 1 }, (_, index) => item(`frame-${index}`, { type: 'frame' }));
    await expect(buildWhiteboardPdf('Board', frames)).rejects.toThrow('PDF page count exceeds export policy');
    expect(buildPresentPdfFromJpegs).not.toHaveBeenCalled();
  });

  it('rejects a non-JPEG raster result before handing pages to the PDF writer', async () => {
    stubRasterSurface('data:image/png;base64,AA==');
    await expect(buildWhiteboardPdf('Board', [item('node')])).rejects.toThrow('PDF frame rasterizer returned an invalid JPEG data URL');
    expect(buildPresentPdfFromJpegs).not.toHaveBeenCalled();
  });

  it('forwards the Whiteboard PDF import caps before decoding and rejects invalid placement coordinates', async () => {
    const file = { size: 64, type: 'application/pdf', name: 'board.pdf' } as File;
    vi.mocked(flattenForeignPdfPages).mockResolvedValue([
      { name: 'page 1', dataUrl: 'data:image/jpeg;base64,AAAA', widthPx: 640, heightPx: 480 },
    ]);

    const pages = await importPdfPagesAsWhiteboardItems(file, 12, 24);
    expect(pages).toHaveLength(1);
    expect(flattenForeignPdfPages).toHaveBeenCalledWith(file, undefined, {
      maxImportedPages: WHITEBOARD_INTERCHANGE_LIMITS.maxPdfPages,
      maxAggregateJpegBytes: WHITEBOARD_INTERCHANGE_LIMITS.maxPdfAggregateJpegBytes,
    });
    await expect(importPdfPagesAsWhiteboardItems(file, Number.POSITIVE_INFINITY, 0)).rejects.toThrow('PDF placement coordinates exceed Whiteboard bounds');
  });
});
