// STATUS: PLATIN
// Shared local SVG raster boundary for product-owned renderers.

import { decodeXmlEntities, inspectBoundedForeignXml } from '../../shared/interoperability/xml';

export const SVG_RASTER_LIMITS = Object.freeze({
  maxSourceBytes: 32 * 1024 * 1024,
  maxSourceElements: 10_000,
  maxSourceDepth: 96,
  maxSourceDimension: 1_000_000_000_000,
  maxOutputEdge: 8_192,
  maxOutputPixels: 32_000_000,
});

const ALLOWED_SVG_ELEMENTS = new Set([
  'svg', 'metadata', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'defs', 'clippath', 'lineargradient', 'radialgradient', 'stop', 'pattern', 'marker', 'image',
]);
const SAFE_EMBEDDED_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/iu;

export function exceedsUtf8ByteLimit(value: string, maxBytes: number): boolean {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index += 1; }
      else bytes += 3;
    } else bytes += 3;
    if (bytes > maxBytes) return true;
  }
  return false;
}

export function assertSafeLocalSvgSource(svg: string): void {
  if (!svg.trim() || exceedsUtf8ByteLimit(svg, SVG_RASTER_LIMITS.maxSourceBytes)) throw new Error('SVG raster source exceeds the byte policy');
  inspectBoundedForeignXml(svg, {
    maxBytes: SVG_RASTER_LIMITS.maxSourceBytes,
    maxDepth: SVG_RASTER_LIMITS.maxSourceDepth,
    maxElements: SVG_RASTER_LIMITS.maxSourceElements,
  });
  const compact = svg.trim();
  if (!/^<svg\b/iu.test(compact) || !/<\/svg>\s*$/iu.test(compact)) throw new Error('SVG raster source must have a complete SVG root');
  const tags = compact.match(/<[^>]*>/gu) ?? [];
  for (const tag of tags) {
    if (/^<\s*\?|^<!--|^<!/u.test(tag)) continue;
    if (/\bon[\w:-]*\s*=|@import/iu.test(tag)) throw new Error('SVG raster source contains active content');
    const name = /^<\s*\/?\s*([A-Za-z][\w:-]*)\b/u.exec(tag)?.[1]?.toLowerCase();
    if (!name || !ALLOWED_SVG_ELEMENTS.has(name)) throw new Error('SVG raster source contains an unsupported element');

    const hrefs = /\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/giu;
    let href: RegExpExecArray | null;
    while ((href = hrefs.exec(tag)) !== null) {
      const target = decodeXmlEntities(href[2].trim());
      if (!target.startsWith('#') && !SAFE_EMBEDDED_IMAGE.test(target)) throw new Error('SVG raster source contains an external resource reference');
    }

    const paintReferences = /url\(\s*(["']?)(.*?)\1\s*\)/giu;
    let paintReference: RegExpExecArray | null;
    while ((paintReference = paintReferences.exec(tag)) !== null) {
      if (!decodeXmlEntities(paintReference[2].trim()).startsWith('#')) throw new Error('SVG raster source contains an external paint reference');
    }
  }
}

function parseSvgSize(svg: string): { width: number; height: number } {
  const viewBox = /\bviewBox\s*=\s*["']\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s*["']/iu.exec(svg);
  if (!viewBox) return { width: 1600, height: 900 };
  const width = Number(viewBox[3]);
  const height = Number(viewBox[4]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || width > SVG_RASTER_LIMITS.maxSourceDimension || height > SVG_RASTER_LIMITS.maxSourceDimension) {
    throw new Error('SVG export bounds are invalid');
  }
  return { width, height };
}

function loadSvgImage(svg: string): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not rasterize local SVG')); };
    try {
      image.src = url;
    } catch {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterize local SVG'));
    }
  });
}

export async function rasterizeSvgToDataUrl(
  svg: string,
  mime: 'image/png' | 'image/jpeg' = 'image/png',
  requestedScale = 2,
): Promise<string> {
  if (typeof svg !== 'string') throw new Error('SVG raster source must be text');
  if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Error('Raster output MIME type is unsupported');
  if (!Number.isFinite(requestedScale)) throw new Error('Raster scale must be finite');
  assertSafeLocalSvgSource(svg);

  const base = parseSvgSize(svg);
  const scale = Math.max(0.25, Math.min(4, requestedScale));
  const boundedScale = Math.min(
    scale,
    SVG_RASTER_LIMITS.maxOutputEdge / base.width,
    SVG_RASTER_LIMITS.maxOutputEdge / base.height,
    Math.sqrt(SVG_RASTER_LIMITS.maxOutputPixels / base.width / base.height),
  );
  const width = Math.max(1, Math.min(SVG_RASTER_LIMITS.maxOutputEdge, Math.floor(base.width * boundedScale)));
  const height = Math.max(1, Math.min(SVG_RASTER_LIMITS.maxOutputEdge, Math.floor(base.height * boundedScale)));
  if (width * height > SVG_RASTER_LIMITS.maxOutputPixels) throw new Error('Raster export exceeds pixel budget');
  if (typeof document === 'undefined') throw new Error('Browser canvas is unavailable');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: mime === 'image/png' });
  if (!context) throw new Error('2D canvas is unavailable');
  if (mime === 'image/jpeg') { context.fillStyle = '#0a0d14'; context.fillRect(0, 0, width, height); }
  const loaded = await loadSvgImage(svg);
  try {
    context.drawImage(loaded.image, 0, 0, width, height);
    return canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined);
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}
