// STATUS: PLATIN
// Bounded SVG renderer over the canonical Whiteboard geometry projection.

import { assertSafeLocalSvgSource, SVG_RASTER_LIMITS } from '../../../platform/rendering/svgRasterizer';
import { STICKY_COLORS, type WhiteboardItem } from '../types';
import { WHITEBOARD_INK_MAX_POINTS_PER_STROKE, effectiveInkWidth, inkPathData } from '../model/whiteboardInkEngine';
import type { WhiteboardInkData, WhiteboardInkPoint } from '../../../shared/contracts/workspace';
import { WHITEBOARD_IMAGE_MAX_BYTES } from '../model/whiteboardObjectEngine';
import { buildWhiteboardRenderProjection } from '../rendering/whiteboardRenderProjection';
import { WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT, WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH } from '../model/whiteboardDiagramEngine';
import { whiteboardTextRenderParams } from '../model/whiteboardTextStyleEngine';
import { WHITEBOARD_MAX_COORDINATE, WHITEBOARD_MAX_ITEMS } from '../viewport/whiteboardViewportEngine';

const MAX_IMAGE_BASE64_CHARS = 4 * Math.ceil(WHITEBOARD_IMAGE_MAX_BYTES / 3);

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

function safeImageHref(value?: string): string | null {
  if (typeof value !== 'string') return null;
  const prefix = /^data:image\/(?:png|jpeg|webp);base64,/iu.exec(value)?.[0];
  if (!prefix) return null;
  const encodedLength = value.length - prefix.length;
  if (encodedLength <= 0 || encodedLength > MAX_IMAGE_BASE64_CHARS || encodedLength % 4 !== 0) return null;
  const payload = value.slice(prefix.length);
  return /^[A-Za-z0-9+/]+={0,2}$/u.test(payload) ? value : null;
}

function rotate(item: WhiteboardItem, x: number, y: number): string {
  return item.rotation
    ? ` transform="rotate(${item.rotation} ${x + item.width / 2} ${y + item.height / 2})"`
    : '';
}

function itemText(item: WhiteboardItem): string {
  return item.text || item.name || item.diagram?.title || item.card?.title || item.document?.title
    || item.chart?.title || item.code?.language || item.media?.name || item.icon?.label
    || item.liveObject?.sourceTitle || item.type;
}

function genericCard(item: WhiteboardItem, x: number, y: number): string {
  const subtitle = item.diagram?.subtitle || item.card?.subtitle || item.document?.excerpt
    || item.liveObject?.kind || item.media?.mime || '';
  const title = svgLabel(item, x + 12, Math.max(20, item.width - 24), { size: 12, weight: '600' });
  return `<g id="object_${escapeXml(item.id)}"${rotate(item, x, y)}><rect x="${x}" y="${y}" width="${item.width}" height="${item.height}" rx="10" fill="#111827" stroke="#64748b" stroke-width="1.5"/><text x="${title.x}" y="${y + 24}" fill="#f8fafc" ${title.attributes}>${escapeXml(itemText(item).slice(0, 240))}</text>${subtitle ? `<text x="${x + 12}" y="${y + 44}" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="10">${escapeXml(subtitle.slice(0, 260))}</text>` : ''}</g>`;
}

function normalizeInkForSvg(ink: WhiteboardInkData): WhiteboardInkData {
  if (!Array.isArray(ink.points) || ink.points.length > WHITEBOARD_INK_MAX_POINTS_PER_STROKE) {
    throw new Error('Whiteboard SVG ink stroke exceeds the point policy');
  }

  const points: WhiteboardInkPoint[] = ink.points.map((point) => {
    if (!point || ![point.x, point.y, point.t, point.pressure, point.tiltX, point.tiltY].every(Number.isFinite)
      || Math.abs(point.x) > WHITEBOARD_MAX_COORDINATE || Math.abs(point.y) > WHITEBOARD_MAX_COORDINATE) {
      throw new Error('Whiteboard SVG ink point is invalid');
    }
    return {
      ...point,
      pressure: Math.min(1, Math.max(0, point.pressure)),
      tiltX: Math.min(90, Math.max(-90, point.tiltX)),
      tiltY: Math.min(90, Math.max(-90, point.tiltY)),
    };
  });

  return {
    ...ink,
    points,
    color: /^#[0-9a-f]{6}$/iu.test(ink.color) ? ink.color.toLowerCase() : '#60a5fa',
    width: Number.isFinite(ink.width) ? Math.min(64, Math.max(0.5, ink.width)) : 1,
    opacity: Number.isFinite(ink.opacity) ? Math.min(1, Math.max(0, ink.opacity)) : 1,
  };
}

interface SvgLabel {
  readonly x: number;
  readonly attributes: string;
}

/**
 * One formatter for every SVG label. `boxX`/`boxWidth` describe the label box: without a stored style the
 * historical font, position and `fallbackAnchor` are kept byte-identically, and with a style the single
 * formatter of `whiteboardTextStyleEngine` decides font, size, weight and box-relative alignment — the
 * same rule the DOM renderer applies through `text-align`. The SVG renderer never computes a font of its
 * own and never re-anchors text outside its box.
 */
function svgLabel(
  item: WhiteboardItem,
  boxX: number,
  boxWidth: number,
  base: { size: number; weight: string; fallbackAnchor?: 'middle' },
): SvgLabel {
  const centred = base.fallbackAnchor === 'middle';
  if (!item.textStyle) {
    return {
      x: centred ? boxX + boxWidth / 2 : boxX,
      attributes: `font-family="system-ui,sans-serif" font-size="${base.size}" font-weight="${base.weight}"${centred ? ' text-anchor="middle"' : ''}`,
    };
  }
  const params = whiteboardTextRenderParams(item.textStyle);
  const x = params.align === 'center' ? boxX + boxWidth / 2 : params.align === 'right' ? boxX + boxWidth : boxX;
  return {
    x,
    attributes: `font-family="${escapeXml(params.familyCss)}" font-size="${params.fontSize}" font-weight="${params.svgFontWeight}" text-anchor="${params.svgTextAnchor}"`,
  };
}

function renderItem(item: WhiteboardItem, offsetX: number, offsetY: number): string {
  const x = item.x + offsetX;
  const y = item.y + offsetY;
  const w = item.width;
  const h = item.height;

  if (item.type === 'frame') {
    const label = svgLabel(item, x + 12, Math.max(20, w - 24), { size: 12, weight: '600' });
    return `<g id="frame_${escapeXml(item.id)}"${rotate(item, x, y)}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(15,23,42,.2)" stroke="#64748b" stroke-width="2" stroke-dasharray="8 6" rx="8"/><text x="${label.x}" y="${y + 24}" fill="#cbd5e1" ${label.attributes}>${escapeXml(item.text || 'Frame')}</text></g>`;
  }
  if (item.type === 'sticky') {
    const palette = STICKY_COLORS[item.color || 'yellow'] || STICKY_COLORS.yellow;
    const label = svgLabel(item, x + 12, Math.max(20, w - 24), { size: 13, weight: '500' });
    return `<g id="sticky_${escapeXml(item.id)}"${rotate(item, x, y)}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${palette.bg}" stroke="${palette.border}" stroke-width="1.5" rx="6"/><text x="${label.x}" y="${y + 24}" fill="${palette.text}" ${label.attributes}>${escapeXml(item.text || '')}</text></g>`;
  }
  if (item.type === 'process') {
    const label = svgLabel(item, x + 12, Math.max(20, w - 24), { size: 12, weight: '600', fallbackAnchor: 'middle' });
    return `<g id="process_${escapeXml(item.id)}"${rotate(item, x, y)}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1e293b" stroke="#3b82f6" stroke-width="2" rx="8"/><text x="${label.x}" y="${y + h / 2 + 4}" fill="#f8fafc" ${label.attributes}>${escapeXml(item.text || item.diagram?.title || 'Process')}</text></g>`;
  }
  if (item.type === 'decision') {
    const cy = y + h / 2;
    const label = svgLabel(item, x + 12, Math.max(20, w - 24), { size: 11, weight: '600', fallbackAnchor: 'middle' });
    return `<g id="decision_${escapeXml(item.id)}"${rotate(item, x, y)}><polygon points="${x + w / 2},${y} ${x + w},${cy} ${x + w / 2},${y + h} ${x},${cy}" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/><text x="${label.x}" y="${cy + 4}" fill="#f8fafc" ${label.attributes}>${escapeXml(item.text || item.diagram?.title || 'Decision?')}</text></g>`;
  }
  if (item.type === 'terminal') {
    const label = svgLabel(item, x + 12, Math.max(20, w - 24), { size: 12, weight: '600', fallbackAnchor: 'middle' });
    return `<g id="terminal_${escapeXml(item.id)}"${rotate(item, x, y)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="#064e3b" stroke="#10b981" stroke-width="2"/><text x="${label.x}" y="${y + h / 2 + 4}" fill="#ecfdf5" ${label.attributes}>${escapeXml(item.text || item.diagram?.title || 'Start / End')}</text></g>`;
  }
  if (item.type === 'text') {
    const label = svgLabel(item, x, w, { size: 16, weight: '600' });
    return `<g id="text_${escapeXml(item.id)}"${rotate(item, x, y)}><text x="${label.x}" y="${y + 20}" fill="#f1f5f9" ${label.attributes}>${escapeXml(item.text || 'Text')}</text></g>`;
  }
  if (item.type === 'image') {
    const href = safeImageHref(item.dataUrl);
    return href
      ? `<g id="image_${escapeXml(item.id)}"${rotate(item, x, y)}><image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></g>`
      : genericCard({ ...item, text: item.name || 'Image' }, x, y);
  }
  if (item.type === 'ink') {
    if (!item.ink || !Array.isArray(item.ink.points)) throw new Error('Whiteboard SVG ink data is invalid');
    if (item.ink.points.length === 0) return genericCard(item, x, y);
    const ink = normalizeInkForSvg(item.ink);
    return `<g id="ink_${escapeXml(item.id)}" transform="translate(${x} ${y}) rotate(${item.rotation ?? 0} ${w / 2} ${h / 2})"><path d="${escapeXml(inkPathData(ink.points))}" fill="none" stroke="${ink.color}" stroke-width="${effectiveInkWidth(ink)}" stroke-opacity="${ink.opacity}" stroke-linecap="round" stroke-linejoin="round"${ink.arrowStart ? ' marker-start="url(#wbInkArrow)"' : ''}${ink.arrowEnd ? ' marker-end="url(#wbInkArrow)"' : ''}/></g>`;
  }
  if (item.type === 'shape' && item.shape) {
    const fill = escapeXml(item.shape.fill);
    const stroke = escapeXml(item.shape.stroke);
    const strokeWidth = item.shape.strokeWidth;
    if (item.shape.kind === 'ellipse') {
      return `<g id="shape_${escapeXml(item.id)}"${rotate(item, x, y)}><ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></g>`;
    }
    if (item.shape.kind === 'diamond') {
      return `<g id="shape_${escapeXml(item.id)}"${rotate(item, x, y)}><polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></g>`;
    }
    if (item.shape.kind === 'triangle') {
      return `<g id="shape_${escapeXml(item.id)}"${rotate(item, x, y)}><polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></g>`;
    }
    return `<g id="shape_${escapeXml(item.id)}"${rotate(item, x, y)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${item.shape.kind === 'rounded-rectangle' ? 12 : 0}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></g>`;
  }
  return genericCard(item, x, y);
}

function measureFragment(fragment: string): { bytes: number; elements: number } {
  let bytes = 0;
  let elements = 0;
  for (let index = 0; index < fragment.length; index += 1) {
    const codeUnit = fragment.charCodeAt(index);
    if (codeUnit === 60) {
      const next = fragment.charCodeAt(index + 1);
      if ((next >= 65 && next <= 90) || (next >= 97 && next <= 122)) elements += 1;
    }
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < fragment.length) {
      const next = fragment.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > SVG_RASTER_LIMITS.maxSourceBytes || elements > SVG_RASTER_LIMITS.maxSourceElements) break;
  }
  return { bytes, elements };
}

export function renderWhiteboardProjectionToSvg(documentTitle: string, sourceItems: readonly WhiteboardItem[]): string {
  if (typeof documentTitle !== 'string' || documentTitle.length > 4_096) {
    throw new Error('Whiteboard SVG title exceeds the export policy');
  }
  if (!Array.isArray(sourceItems) || sourceItems.length > WHITEBOARD_MAX_ITEMS) {
    throw new Error('Whiteboard SVG item count exceeds the rendering policy');
  }

  const projection = buildWhiteboardRenderProjection(sourceItems);
  let minX = 0;
  let minY = 0;
  let maxX = 800;
  let maxY = 600;
  if (projection.items.length > 0) {
    minX = Number.POSITIVE_INFINITY;
    minY = Number.POSITIVE_INFINITY;
    maxX = Number.NEGATIVE_INFINITY;
    maxY = Number.NEGATIVE_INFINITY;
    for (const item of projection.items) {
      if (![item.x, item.y, item.width, item.height].every(Number.isFinite)
        || item.width <= 0 || item.height <= 0
        || Math.abs(item.x) > WHITEBOARD_MAX_COORDINATE || Math.abs(item.y) > WHITEBOARD_MAX_COORDINATE) {
        throw new Error('Whiteboard SVG geometry is invalid');
      }
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      if (item.type !== 'connector') {
        maxX = Math.max(maxX, item.x + item.width);
        maxY = Math.max(maxY, item.y + item.height);
      }
    }
  }

  const padding = 60;
  const width = Math.max(maxX - minX + padding * 2, 800);
  const height = Math.max(maxY - minY + padding * 2, 600);
  const offsetX = -minX + padding;
  const offsetY = -minY + padding;
  const fragments: string[] = [];
  let outputBytes = 0;
  let outputElements = 0;
  const append = (fragment: string): void => {
    const measured = measureFragment(fragment);
    const separatorBytes = fragments.length > 0 ? 1 : 0;
    if (measured.bytes > SVG_RASTER_LIMITS.maxSourceBytes - outputBytes - separatorBytes) {
      throw new Error('Whiteboard SVG output exceeds the byte policy');
    }
    if (measured.elements > SVG_RASTER_LIMITS.maxSourceElements - outputElements) {
      throw new Error('Whiteboard SVG output exceeds the element policy');
    }
    outputBytes += measured.bytes + separatorBytes;
    outputElements += measured.elements;
    fragments.push(fragment);
  };

  append(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
  append(`<rect x="0" y="0" width="${width}" height="${height}" fill="#0a0d14"/>`);
  append('<defs><pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1" fill="rgba(255,255,255,.08)"/></pattern><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#64748b"/></marker><marker id="wbInkArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><polygon points="0 1,8 4,0 7" fill="context-stroke"/></marker></defs>');
  append(`<rect x="0" y="0" width="${width}" height="${height}" fill="url(#dotGrid)"/>`);
  append(`<text x="30" y="36" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="13" font-weight="bold">ASTRAEA WHITEBOARD · ${escapeXml(documentTitle.toUpperCase())} · VECTOR SVG</text>`);

  for (const item of projection.items) {
    if (item.type === 'frame') append(renderItem(item, offsetX, offsetY));
  }
  for (const item of projection.items) {
    if (item.type === 'connector') {
      const routed = projection.connectorPaths.get(item.id);
      if (!routed) continue;
      append(`<g id="connector_${escapeXml(item.id)}" transform="translate(${offsetX} ${offsetY})"><path d="${escapeXml(routed.path)}" fill="none" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrowhead)"/>${item.lineLabel ? `<rect x="${routed.labelX - WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH}" y="${routed.labelY - WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT}" width="${WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH * 2}" height="${WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT * 2}" fill="#0f172a" rx="4" stroke="#475569"/><text x="${routed.labelX}" y="${routed.labelY + 2}" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="10" text-anchor="middle">${escapeXml(item.lineLabel)}</text>` : ''}</g>`);
    } else if (item.type !== 'frame') append(renderItem(item, offsetX, offsetY));
  }
  append('</svg>');

  const svg = fragments.join('\n');
  assertSafeLocalSvgSource(svg);
  return svg;
}
