// STATUS: PLATIN

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rasterizeSvgToDataUrl, SVG_RASTER_LIMITS } from '../../platform/rendering/svgRasterizer';

function stubRasterSurface(dataUrl = 'data:image/png;base64,AA==') {
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
  const urlApi = {
    createObjectURL: vi.fn(() => 'blob:svg-raster-test'),
    revokeObjectURL: vi.fn(),
  };
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  vi.stubGlobal('URL', urlApi);
  return { canvas, context, urlApi };
}

describe('shared SVG raster boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('bounds canvas dimensions and draws the source image once', async () => {
    const { canvas, context, urlApi } = stubRasterSurface();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5000 3000"><rect width="5000" height="3000" fill="#123456"/></svg>';

    const dataUrl = await rasterizeSvgToDataUrl(svg, 'image/png', 2);

    expect(dataUrl).toBe('data:image/png;base64,AA==');
    expect(canvas.width).toBeLessThanOrEqual(SVG_RASTER_LIMITS.maxOutputEdge);
    expect(canvas.height).toBeLessThanOrEqual(SVG_RASTER_LIMITS.maxOutputEdge);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(SVG_RASTER_LIMITS.maxOutputPixels);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:svg-raster-test');
  });

  it('rejects active or external SVG resources before creating browser objects', async () => {
    const hostileSvgs = [
      '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
      '<svg viewBox="0 0 1 1"><rect onload="alert(1)"/></svg>',
      '<svg viewBox="0 0 1 1"><image href="https://example.invalid/pixel.png"/></svg>',
      '<svg viewBox="0 0 1 1"><rect fill="url(https://example.invalid/paint)"/></svg>',
      '<svg viewBox="0 0 1 1"><image href="https&#x3A;//example.invalid/pixel.png"/></svg>',
      '<!DOCTYPE svg><svg viewBox="0 0 1 1"></svg>',
    ];

    for (const svg of hostileSvgs) await expect(rasterizeSvgToDataUrl(svg)).rejects.toThrow();
  });

  it('accepts local paint references and bounded embedded image data', async () => {
    stubRasterSurface();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid"><rect fill="url(#local)"/></pattern></defs><image href="data:image/png;base64,AA==" width="100" height="100"/></svg>';

    await expect(rasterizeSvgToDataUrl(svg)).resolves.toBe('data:image/png;base64,AA==');
  });

  it('rejects non-finite scale and unsupported runtime MIME values', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
    await expect(rasterizeSvgToDataUrl(svg, 'image/png', Number.NaN)).rejects.toThrow('Raster scale must be finite');
    await expect(rasterizeSvgToDataUrl(svg, 'image/webp' as 'image/png')).rejects.toThrow('Raster output MIME type is unsupported');
  });
});
