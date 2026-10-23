import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawDocumentModel, DrawPage } from '../../../../shared/contracts/draw/workspaceDraw';
import { createEmptyDrawDocument, DrawModelError } from '../../model/drawDocumentEngine';

const rasterizer = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../../../platform/rendering/svgRasterizer', () => ({ rasterizeSvgToDataUrl: rasterizer.run }));

import { buildDrawPdf, buildDrawPng, buildDrawWebp, DRAW_PDF_LIMITS } from '../../import-export/drawInterchangeEngine';

function makeModel(includeSecondPage = false): DrawDocumentModel {
  const base = createEmptyDrawDocument();
  const pages: DrawPage[] = includeSecondPage
    ? [base.pages[0], {
      ...base.pages[0],
      id: 'page-2',
      name: 'Page 2',
      objectIds: [],
      printableBounds: { ...base.pages[0].printableBounds },
    }]
    : base.pages;
  return { ...base, pages };
}

function makeJpegDataUrl(): string {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01]);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

function containsBytes(source: Uint8Array, needle: Uint8Array): boolean {
  for (let offset = 0; offset <= source.length - needle.length; offset += 1) {
    let matches = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (source[offset + index] !== needle[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function installWebpBrowserMocks(output: string, contextAvailable = true) {
  const context = { drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => (contextAvailable ? context : null)),
    toDataURL: vi.fn(() => output),
  };
  class FakeImage {
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    set src(value: string) {
      if (value) queueMicrotask(() => this.onload?.(new Event('load')));
    }
  }
  const urlApi = {
    createObjectURL: vi.fn(() => 'blob:draw-export'),
    revokeObjectURL: vi.fn(),
  };
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', urlApi);
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  return { canvas, context, urlApi };
}

describe('Draw raster and PDF interchange facade', () => {
  beforeEach(() => {
    rasterizer.run.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('delegates bounded PNG rendering with the selected page SVG', async () => {
    const model = makeModel(true);
    rasterizer.run.mockResolvedValue('data:image/png;base64,AA==');

    const png = await buildDrawPng(model, 'page-2');

    expect(png).toBe('data:image/png;base64,AA==');
    expect(rasterizer.run).toHaveBeenCalledOnce();
    expect(rasterizer.run).toHaveBeenCalledWith(expect.stringContaining('Astraea Draw Page 2'), 'image/png', 2);
  });

  it('caps WebP canvas dimensions, emits WebP, and revokes its temporary SVG URL', async () => {
    const browser = installWebpBrowserMocks('data:image/webp;base64,AA==');

    const webp = await buildDrawWebp(makeModel());

    expect(webp).toBe('data:image/webp;base64,AA==');
    expect(browser.canvas.width).toBeLessThanOrEqual(8_192);
    expect(browser.canvas.height).toBeLessThanOrEqual(8_192);
    expect(browser.canvas.width * browser.canvas.height).toBeLessThanOrEqual(32_000_000);
    expect(browser.context.drawImage).toHaveBeenCalledOnce();
    expect(browser.urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:draw-export');
  });

  it('rejects browser WebP fallback output and still revokes the SVG URL', async () => {
    const browser = installWebpBrowserMocks('data:image/png;base64,AA==');

    await expect(buildDrawWebp(makeModel())).rejects.toMatchObject({ code: 'webp-encoder-unavailable' });
    expect(browser.urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:draw-export');
  });

  it('writes a bounded PDF with raw validated JPEG streams and a Unicode-safe title', async () => {
    const model = makeModel();
    rasterizer.run.mockResolvedValue(makeJpegDataUrl());

    const pdf = await buildDrawPdf('Résumé (Architecture)', model, ['page-1']);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01]);
    const prefix = new TextDecoder().decode(pdf.slice(0, 8));
    const structure = new TextDecoder().decode(pdf.slice(0, 2_048));

    expect(prefix).toBe('%PDF-1.4');
    expect(pdf.byteLength).toBeLessThan(DRAW_PDF_LIMITS.maxBytes);
    expect(containsBytes(pdf, jpeg)).toBe(true);
    expect(structure).toContain('/Filter /DCTDecode');
    expect(structure).toContain('/Title <FEFF005200e900730075006d00e9002000280041007200630068006900740065006300740075007200650029>');
    expect(structure).not.toContain('ASCIIHexDecode');
  });

  it('rejects duplicate, excessive, and missing PDF page selections before rasterizing', async () => {
    const model = makeModel(true);

    await expect(buildDrawPdf('Draw', model, ['page-1', 'page-1'])).rejects.toBeInstanceOf(DrawModelError);
    await expect(buildDrawPdf('Draw', model, Array.from({ length: 129 }, (_, index) => `page-${index}`))).rejects.toBeInstanceOf(DrawModelError);
    await expect(buildDrawPdf('Draw', model, ['missing-page'])).rejects.toMatchObject({ code: 'page-missing' });
    expect(rasterizer.run).not.toHaveBeenCalled();
  });

  it('rejects malformed raster output and overlong PDF titles with stable Draw errors', async () => {
    rasterizer.run.mockResolvedValue('data:image/jpeg;base64,AB==');
    await expect(buildDrawPdf('Draw', makeModel(), ['page-1'])).rejects.toMatchObject({ code: 'pdf-jpeg-invalid' });

    rasterizer.run.mockClear();
    await expect(buildDrawPdf('x'.repeat(513), makeModel(), ['page-1'])).rejects.toMatchObject({ code: 'pdf-title-size-boundary' });
    expect(rasterizer.run).not.toHaveBeenCalled();
  });
});
