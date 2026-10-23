import { PresentChartSceneObject, PresentDocumentModel, PresentSceneObject, PresentSlide } from '../../../../shared/contracts/workspace';
import { ensurePresentDesign, resolvePresentSlideDesign } from '../../design/presentDesign';
import { pdfUnicodeTextString } from '../../../../platform/interop/pdf/pdfTextStrings';
import { isPlainPresentRecord, normalizePresentImage, sortPresentLayers } from '../../canvas/model/presentScene';
import { renderPresentWidgetSvg } from '../rendering/presentWidgetSvg';
import { composeTargetAnimationStyle } from '../../animations/presentAnimationEngine';
import { renderPresentWorkspaceSnapshotSvg } from '../rendering/presentWorkspaceSnapshotSvg';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { PRESENT_WORKFLOW_COPY } from '../../locale/presentWorkflowLocale';
import {
  deliverExportBlob,
  deliverExportBytes,
  deliverExportText,
  type ExportDeliveryResult,
} from '../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../platform/rendering/documentPdfExport';

export const PRESENT_CANONICAL_WIDTH = 1280;
export const PRESENT_CANONICAL_HEIGHT = 720;
const SVG_WIDTH = PRESENT_CANONICAL_WIDTH;
const SVG_HEIGHT = PRESENT_CANONICAL_HEIGHT;

// Round 14 (malformed document rest-hardening): every value that lands in the SVG string is coerced
// first. A hostile/malformed payload may carry numbers/objects/missing fields where the contract
// says string — the preview (mounted with the canvas) must not throw because of it.
const escapeXml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const safeColor = (value: string | undefined, fallback: string): string =>
  /^#[0-9a-f]{6}$/i.test(value || '') ? String(value) : fallback;

function wrapWords(value: string, maxChars: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textSvg(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: string,
  width: number,
  weight = 400,
  anchor: 'start' | 'middle' | 'end' = 'start'
): string {
  // Malformed documents may omit required text fields; a preview/export must not throw because of
  // that (it would take the whole Present module down through the recording-studio preview mount).
  const safeText = typeof text === 'string' ? text : '';
  const maxChars = Math.max(8, Math.floor(width / Math.max(7, fontSize * 0.58)));
  return wrapWords(safeText, maxChars)
    .slice(0, 8)
    .map(
      (line, index) =>
        `<text x="${x.toFixed(1)}" y="${(y + index * fontSize * 1.18).toFixed(1)}" font-size="${fontSize}" font-weight="${weight}" fill="${safeColor(
          color,
          '#f8fafc'
        )}" text-anchor="${anchor}" font-family="Inter,Arial,sans-serif">${escapeXml(line)}</text>`
    )
    .join('');
}

function sceneGeometry(object: PresentSceneObject, width: number, height: number) {
  return {
    x: (object.xPercent / 100) * width,
    y: (object.yPercent / 100) * height,
    w: (object.widthPercent / 100) * width,
    h: (object.heightPercent / 100) * height,
  };
}

function chartSvg(object: PresentChartSceneObject, width: number, height: number): string {
  const { x, y, w, h } = sceneGeometry(object, width, height);
  const chart = object.chart;
  /**
   * Malformed document guard: `chart` may be absent/null and `series`/`categories` may be missing.
   * Rendering a labelled placeholder keeps the preview/export path alive instead of throwing inside
   * the recording-studio preview (which is mounted with the canvas and would lose the module tree).
   */
  if (!chart || !Array.isArray(chart.series) || !Array.isArray(chart.categories)) {
    return `<g opacity="${object.opacity ?? 1}" transform="rotate(${object.rotation ?? 0} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#0f172a" stroke="#334155" stroke-dasharray="6 4"/><text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" fill="#64748b" font-size="14" font-family="Inter,Arial,sans-serif">Chart data unavailable</text></g>`;
  }
  // A series entry may be null or lack its numeric values array; only renderable series are used.
  const series = chart.series.filter(
    (entry) => Boolean(entry) && typeof entry === 'object' && Array.isArray((entry as { values?: unknown }).values),
  );
  const values = series.flatMap((entry) => entry.values).filter(Number.isFinite);
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const plotX = x + 42;
  const plotY = y + 34;
  const plotW = Math.max(20, w - 58);
  const plotH = Math.max(20, h - 58);
  let body = `<g opacity="${object.opacity ?? 1}" transform="rotate(${object.rotation ?? 0} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#0f172a" stroke="#334155"/><text x="${x + 16}" y="${y + 22}" fill="#e2e8f0" font-size="15" font-weight="700">${escapeXml(chart.title)}</text>`;
  body += `<line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="#64748b"/><line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotH}" stroke="#64748b"/>`;
  const categoryCount = Math.max(1, chart.categories.length);
  if (chart.chart_type === 'line' || chart.chart_type === 'area') {
    series.forEach((entry, sIdx) => {
      const points = entry.values.map((value, idx) => `${plotX + (idx / Math.max(1, categoryCount - 1)) * plotW},${plotY + plotH - (value / max) * plotH}`).join(' ');
      body += `<polyline fill="none" stroke="${safeColor(entry.color, sIdx ? '#a78bfa' : '#38bdf8')}" stroke-width="3" points="${points}"/>`;
    });
  } else {
    const seriesCount = Math.max(1, series.length);
    const groupW = plotW / categoryCount;
    const barW = Math.max(2, groupW / (seriesCount + 1));
    series.forEach((entry, sIdx) =>
      entry.values.forEach((value, idx) => {
        const bh = Math.max(0, (value / max) * plotH);
        const bx = plotX + idx * groupW + sIdx * barW + barW * 0.2;
        const by = plotY + plotH - bh;
        body += `<rect x="${bx}" y="${by}" width="${barW * 0.8}" height="${bh}" fill="${safeColor(entry.color, sIdx ? '#a78bfa' : '#38bdf8')}"/>`;
      })
    );
  }
  body += '</g>';
  return body;
}

function sceneObjectSvg(object: PresentSceneObject, width: number, height: number, locale: WorkspaceLocale): string {
  if (object.hidden) return '';
  if (object.kind === 'chart') return chartSvg(object, width, height);
  const { x, y, w, h } = sceneGeometry(object, width, height);
  const rotation = object.rotation ?? 0;
  const opacity = object.opacity ?? 1;
  const transform = `rotate(${rotation} ${x + w / 2} ${y + h / 2})`;

  if (object.kind === 'text') {
    return `<g opacity="${opacity}" transform="${transform}">${object.backgroundColor ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${safeColor(object.backgroundColor, '#0f172a')}"/>` : ''}${textSvg(object.text, x + 8, y + Math.max(18, object.fontSizePt), Math.max(8, object.fontSizePt), object.color, w - 16, object.fontWeight === 'bold' ? 700 : object.fontWeight === 'semibold' ? 600 : 400)}</g>`;
  }

  if (object.kind === 'shape') {
    if (object.shape === 'ellipse') {
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${safeColor(object.fillColor, '#2563eb')}" stroke="${safeColor(object.strokeColor, '#60a5fa')}" stroke-width="${Math.max(0, object.strokeWidth)}" opacity="${opacity}" transform="${transform}"/>`;
    }
    if (object.shape === 'triangle') {
      return `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" fill="${safeColor(object.fillColor, '#2563eb')}" stroke="${safeColor(object.strokeColor, '#60a5fa')}" stroke-width="${Math.max(0, object.strokeWidth)}" opacity="${opacity}" transform="${transform}"/>`;
    }
    if (object.shape === 'diamond') {
      return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="${safeColor(object.fillColor, '#2563eb')}" stroke="${safeColor(object.strokeColor, '#60a5fa')}" stroke-width="${Math.max(0, object.strokeWidth)}" opacity="${opacity}" transform="${transform}"/>`;
    }
    if (object.shape === 'line') {
      return `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(2, h)}" fill="${safeColor(object.strokeColor, '#60a5fa')}" opacity="${opacity}" transform="${transform}"/>`;
    }
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${object.shape === 'rounded-rectangle' ? 18 : 0}" fill="${safeColor(object.fillColor, '#2563eb')}" stroke="${safeColor(object.strokeColor, '#60a5fa')}" stroke-width="${Math.max(0, object.strokeWidth)}" opacity="${opacity}" transform="${transform}"/>`;
  }

  if (object.kind === 'widget') {
    return `<g opacity="${opacity}" transform="${transform}">${renderPresentWidgetSvg(object, { x, y, w, h })}</g>`;
  }

  if (object.kind === 'workspace') {
    return renderPresentWorkspaceSnapshotSvg(object, { x, y, w, h }, locale);
  }

  if (object.kind === 'code') {
    const languageLabel = typeof object.language === 'string' ? object.language.toUpperCase() : '';
    return `<g opacity="${opacity}" transform="${transform}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#030712" stroke="#334155"/><text x="${x + 12}" y="${y + 18}" fill="#94a3b8" font-size="9" font-family="monospace" font-weight="700">${escapeXml(languageLabel)}</text>${textSvg(object.code, x + 12, y + 36, 10, '#34d399', w - 24, 400)}</g>`;
  }

  if (object.kind === 'diagram') {
    const diagramItems = Array.isArray(object.items)
      ? object.items.filter((item) => Boolean(item) && typeof item === 'object')
      : [];
    const box = `<g opacity="${opacity}" transform="${transform}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#0f172a" stroke="#334155"/>`;
    if (!diagramItems.length) {
      return `${box}<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" fill="#64748b" font-size="12" font-family="Inter,Arial,sans-serif">Diagram data unavailable</text></g>`;
    }
    let diaBody = box;
    const itemCount = Math.max(1, diagramItems.length);
    const itemW = (w - 24) / itemCount;
    diagramItems.forEach((it, idx) => {
      const ix = x + 12 + idx * itemW;
      diaBody += `<rect x="${ix + 4}" y="${y + 12}" width="${itemW - 8}" height="${h - 24}" rx="8" fill="#1e293b" stroke="${safeColor(it.color || object.accentColor, '#38bdf8')}" stroke-opacity=".5"/>${textSvg(it.title, ix + 10, y + 32, 11, '#f8fafc', itemW - 20, 700)}${textSvg(it.subtitle || '', ix + 10, y + 50, 9, '#94a3b8', itemW - 20, 400)}`;
    });
    diaBody += '</g>';
    return diaBody;
  }

  // Table is the documented fallback for a known object kind. An **unknown** kind (e.g. a future or
  // hostile `'video'` object) has no rows/columns at all — it must render nothing, not throw.
  if (!Array.isArray(object.rows) || !Array.isArray(object.columns)) return '';
  const rowCount = Math.max(1, object.rows.length + 1);
  const colCount = Math.max(1, object.columns.length);
  const rowH = h / rowCount;
  const colW = w / colCount;
  let body = `<g opacity="${opacity}" transform="${transform}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${safeColor(object.bodyColor, '#0f172a')}"/>`;
  object.columns.forEach((column, c) => {
    body += `<rect x="${x + c * colW}" y="${y}" width="${colW}" height="${rowH}" fill="${safeColor(object.headerColor, '#1d4ed8')}" stroke="#475569"/>${textSvg(column, x + c * colW + colW / 2, y + rowH * 0.65, 10, object.textColor, colW - 8, 700, 'middle')}`;
  });
  object.rows.forEach((row, r) => {
    if (!Array.isArray(row)) return;
    object.columns.forEach((_, c) => {
      body += `<rect x="${x + c * colW}" y="${y + (r + 1) * rowH}" width="${colW}" height="${rowH}" fill="${safeColor(object.bodyColor, '#0f172a')}" stroke="#334155"/>${textSvg(row[c] || '', x + c * colW + colW / 2, y + (r + 1) * rowH + rowH * 0.65, 9, object.textColor, colW - 8, 400, 'middle')}`;
    });
  });
  return body + '</g>';
}


function svgAnimationStyle(slide: PresentSlide, targetId: string, progressByAnimationId?: Record<string, number>): string {
  if (!progressByAnimationId || !slide.animations?.length) return '';
  // Round 24: a null/primitive animation entry must not crash the preview/export.
  const animations = slide.animations.filter(isPlainPresentRecord) as unknown as typeof slide.animations;
  if (!animations.length) return '';
  const style = composeTargetAnimationStyle(animations, targetId, progressByAnimationId);
  const opacity = typeof style.opacity === 'number' ? `opacity:${Math.max(0, Math.min(1, style.opacity))};` : '';
  const transform = typeof style.transform === 'string'
    ? style.transform.replace(/[^a-zA-Z0-9().,%+\- ]/g, '').slice(0, 240)
    : '';
  return `${opacity}${transform ? `transform:${transform};transform-box:fill-box;transform-origin:center;` : ''}`;
}

export interface PresentSlidePixelSize { width: number; height: number; }

export function resolvePresentSlidePixelSize(model: PresentDocumentModel, longEdge = 1280): PresentSlidePixelSize {
  const raw = String(model.aspectRatio || '16:9').trim();
  let ratio = 16 / 9;
  if (raw === '16:10') ratio = 16 / 10;
  else if (raw === '4:3') ratio = 4 / 3;
  else if (/^A4$/i.test(raw)) ratio = 297 / 210;
  else if (/^Letter$/i.test(raw)) ratio = 11 / 8.5;
  else {
    const pair = /^([0-9]+(?:\.[0-9]+)?)\s*[:x/]\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(raw);
    if (pair) {
      const w = Number(pair[1]);
      const h = Number(pair[2]);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) ratio = Math.max(0.25, Math.min(4, w / h));
    }
  }
  const boundedLongEdge = Math.max(320, Math.min(4096, Math.round(longEdge)));
  if (ratio >= 1) return { width: boundedLongEdge, height: Math.max(240, Math.round(boundedLongEdge / ratio)) };
  return { width: Math.max(240, Math.round(boundedLongEdge * ratio)), height: boundedLongEdge };
}

export function buildPresentSlideSvg(slide: PresentSlide, model: PresentDocumentModel, width?: number, height?: number, animationProgressById?: Record<string, number>, locale: WorkspaceLocale = 'en-US'): string {
  const resolved = resolvePresentSlidePixelSize(model);
  const w = Math.max(240, Math.min(4096, Math.round(width ?? resolved.width)));
  const h = Math.max(240, Math.min(4096, Math.round(height ?? resolved.height)));
  const sx = w / SVG_WIDTH;
  const sy = h / SVG_HEIGHT;
  const normalized = ensurePresentDesign(model);
  const design = resolvePresentSlideDesign(slide, normalized);
  // Round 16 (malformed document): a non-array `sceneObjects` used to crash the preview (which is
  // mounted with the canvas) in `.some`/`.map`; the export always renders a real list.
  // Round 24: entries inside the array can be null/primitives; they are filtered for rendering only
  // (read-only — the document keeps them untouched).
  const slideSceneObjects = Array.isArray(slide.sceneObjects)
    ? slide.sceneObjects.filter(isPlainPresentRecord) as unknown as PresentSceneObject[]
    : [];
  const hasWorkspaceReferences = slideSceneObjects.some((object) => object.kind === 'workspace');
  const px = (value: number) => value * sx;
  const py = (value: number) => value * sy;
  const font = (value: number) => value * Math.min(sx, sy);
  const contentX = px(72);
  const contentWidth = px(hasWorkspaceReferences ? 780 : 1136);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${safeColor(design.backgroundColor, '#0c1222')}"/>`;
  const categoryLabel = slide.categoryTag || slide.category || PRESENT_WORKFLOW_COPY[locale].export.slideFallback;
  svg += `<text x="${px(72)}" y="${py(60)}" font-family="Inter,Arial,sans-serif" font-size="${font(12)}" font-weight="700" fill="${safeColor(design.accentColor, '#38bdf8')}">${escapeXml(categoryLabel)}</text>`;
  svg += `<g style="${svgAnimationStyle(slide, 'slide-title', animationProgressById)}">${textSvg(slide.title, px(72), py(112), font(40), design.titleColor, px(1136), 700)}</g>`;
  if (slide.subtitle) svg += `<g style="${svgAnimationStyle(slide, 'slide-subtitle', animationProgressById)}">${textSvg(slide.subtitle, px(72), py(156), font(18), design.bodyColor, px(1136), 400)}</g>`;

  // Malformed `cards` must not break the preview: only an actual array of card objects is laid out
  // (a hostile cards value may be an object/string/number, and entries may be null).
  const slideCards = Array.isArray(slide.cards)
    ? slide.cards.filter((card) => Boolean(card) && typeof card === 'object')
    : [];
  if (slide.layout === 'cards' && slideCards.length) {
    const gap = px(20);
    const count = slideCards.length;
    const cardW = Math.min(px(340), (contentWidth - gap * (count - 1)) / count);
    const total = cardW * count + gap * (count - 1);
    const startX = contentX + (contentWidth - total) / 2;
    slideCards.forEach((card, i) => {
      const x = startX + i * (cardW + gap);
      const y = py(250);
      const color = safeColor(card.customColor, card.colorTheme === 'emerald' ? '#10b981' : card.colorTheme === 'purple' ? '#a855f7' : card.colorTheme === 'amber' ? '#f59e0b' : card.colorTheme === 'rose' ? '#ec4899' : '#3b82f6');
      svg += `<g style="${svgAnimationStyle(slide, card.id, animationProgressById)}"><rect x="${x}" y="${y}" width="${cardW}" height="${py(190)}" rx="${font(18)}" fill="${safeColor(design.surfaceColor, '#111827')}" stroke="${color}" stroke-opacity=".6"/>${textSvg(card.title, x + px(18), y + py(36), font(16), color, cardW - px(36), 700)}${textSvg(card.description, x + px(18), y + py(74), font(13), design.bodyColor, cardW - px(36), 400)}</g>`;
    });
  }

  if (slide.layout === 'bullet-list' && slide.bulletPoints?.length) {
    slide.bulletPoints.forEach((bullet, i) => {
      const y = py(245 + i * 58);
      const bulletX = contentX + px(28);
      const textX = contentX + px(50);
      const textWidth = hasWorkspaceReferences ? contentWidth - px(80) : px(1010);
      svg += `<circle cx="${bulletX}" cy="${y - py(5)}" r="${font(5)}" fill="${safeColor(design.accentColor, '#38bdf8')}"/>${textSvg(bullet, textX, y, font(18), design.bodyColor, textWidth, 400)}`;
    });
  }

  for (const object of sortPresentLayers(slideSceneObjects)) svg += `<g style="${svgAnimationStyle(slide, object.id, animationProgressById)}">${sceneObjectSvg(object, w, h, locale)}</g>`;
  // Malformed `images` / image entries are skipped instead of throwing; an image without a data URL
  // has nothing to draw and is left out (the canvas shows its placeholder affordance).
  const slideImages = Array.isArray(slide.images)
    ? slide.images.filter((image) => Boolean(image) && typeof image === 'object')
    : [];
  for (const rawImage of slideImages.filter((image) => !image.hidden)) {
    if (typeof rawImage.dataUrl !== 'string' || !rawImage.dataUrl) continue;
    const image = normalizePresentImage(rawImage);
    const x = (image.xPercent / 100) * w;
    const y = (image.yPercent / 100) * h;
    const imageW = (image.widthPercent / 100) * w;
    const imageH = (image.heightPercent / 100) * h;
    svg += `<g style="${svgAnimationStyle(slide, image.id, animationProgressById)}"><image href="${escapeXml(image.dataUrl)}" x="${x}" y="${y}" width="${imageW}" height="${imageH}" preserveAspectRatio="xMidYMid meet" opacity="${image.opacity ?? 1}" transform="rotate(${image.rotation ?? 0} ${x + imageW / 2} ${y + imageH / 2})"/></g>`;
  }
  if (design.showFooter) {
    svg += `<line x1="${px(72)}" y1="${py(666)}" x2="${px(1208)}" y2="${py(666)}" stroke="${safeColor(design.bodyColor, '#64748b')}" stroke-opacity=".22"/><text x="${px(72)}" y="${py(692)}" font-family="monospace" font-size="${font(11)}" fill="${safeColor(design.bodyColor, '#94a3b8')}">${escapeXml(design.footerText)}</text>`;
  }
  return svg + '</svg>';
}

export async function renderPresentSlideToRaster(slide: PresentSlide, model: PresentDocumentModel, mime: 'image/jpeg' | 'image/png', quality = 0.92, longEdge = 1280, locale: WorkspaceLocale = 'en-US'): Promise<string> {
  const size = resolvePresentSlidePixelSize(model, longEdge);
  const svg = buildPresentSlideSvg(slide, model, size.width, size.height, undefined, locale);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to rasterize slide SVG.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size.width, size.height); }
    ctx.drawImage(image, 0, 0, size.width, size.height);
    return canvas.toDataURL(mime, mime === 'image/jpeg' ? Math.max(0.5, Math.min(1, quality)) : undefined);
  } finally { URL.revokeObjectURL(url); }
}

export async function renderPresentSlideToJpeg(slide: PresentSlide, model: PresentDocumentModel, quality = 0.92, longEdge = 1280, locale: WorkspaceLocale = 'en-US'): Promise<string> {
  return renderPresentSlideToRaster(slide, model, 'image/jpeg', quality, longEdge, locale);
}

function decodeJpeg(dataUrl: string): Uint8Array {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Expected JPEG data URL.');
  const bin = globalThis.atob(match[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG.');
  return bytes;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');

export function buildPresentPdfFromJpegs(title: string, jpegs: string[], imageSize: PresentSlidePixelSize = { width: SVG_WIDTH, height: SVG_HEIGHT }): Uint8Array {
  if (!jpegs.length) throw new Error('At least one slide image is required.');
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = add('');
  const pageIds: number[] = [];
  const ratio = imageSize.width / Math.max(1, imageSize.height);
  const pdfLong = 960;
  const pdfWidth = ratio >= 1 ? pdfLong : Math.round(pdfLong * ratio);
  const pdfHeight = ratio >= 1 ? Math.round(pdfLong / ratio) : pdfLong;

  jpegs.forEach((dataUrl, index) => {
    const bytes = decodeJpeg(dataUrl);
    const encoded = `${hex(bytes)}>`;
    const imageId = add(`<< /Type /XObject /Subtype /Image /Width ${imageSize.width} /Height ${imageSize.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${encoded.length} >>\nstream\n${encoded}\nendstream`);
    const stream = `q\n${pdfWidth} 0 0 ${pdfHeight} 0 0 cm\n/Im${index + 1} Do\nQ`;
    const contentId = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Title ${pdfUnicodeTextString(title)} /Producer (VGT Workspace Present) >>`);
  let pdf = '%PDF-1.4\n%VGT\n';
  const offsets = [0];
  objects.forEach((body, index) => { offsets[index + 1] = new TextEncoder().encode(pdf).length; pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}


function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Rendered image data URL is invalid.');
  const binary = globalThis.atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes as unknown as BlobPart], { type: match[1] });
}

/**
 * Release Beta 0.1: Present exports are written through the native save dialog + atomic export on the
 * desktop and only reported as saved after the write was confirmed. The browser fallback stays a
 * download; the caller states which happened.
 */
export function downloadPresentBlob(blob: Blob, name: string): Promise<ExportDeliveryResult> {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(name) ? name.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBlob(blob, {
    suggestedName: name,
    extensions: [extension],
    mimeType: blob.type || 'application/octet-stream',
  });
}

export const safePresentFileName = (value: string) => value.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'presentation';

/**
 * Resolves the slides a "selected slides" export must write, in **deck order**.
 *
 * Paket 26 requires "alle oder gewählte Folien in **passender Reihenfolge**". Deck order *is* the
 * passende order: it is the order the audience sees. An unknown or duplicated id therefore can
 * neither add a slide nor reorder the deck. The previous inline
 * `model.slides.filter(slide => ids.includes(slide.id))` did this correctly by accident in three
 * places (`presentExport` and twice in `presentDocumentExport`); this is now the single definition.
 */
export function resolvePresentSlideSelection(
  model: PresentDocumentModel,
  slideIds?: readonly string[] | null,
): PresentSlide[] {
  const slides = model.slides ?? [];
  if (!slideIds || slideIds.length === 0) return [...slides];
  const wanted = new Set(slideIds);
  return slides.filter((slide) => wanted.has(slide.id));
}

export async function downloadPresentPdf(title: string, model: PresentDocumentModel, slideIds?: readonly string[], locale: WorkspaceLocale = 'en-US'): Promise<ExportDeliveryResult> {
  const selected = resolvePresentSlideSelection(model, slideIds);
  if (!selected.length) throw new Error('No slides selected for PDF export.');
  const size = resolvePresentSlidePixelSize(model);
  const jpegs: string[] = [];
  for (const slide of selected) jpegs.push(await renderPresentSlideToJpeg(slide, model, 0.92, 1280, locale));
  return deliverExportBytes(buildPresentPdfFromJpegs(title, jpegs, size), {
    suggestedName: `${safePresentFileName(title)}.pdf`,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}

export async function downloadPresentSlidePng(title: string, slide: PresentSlide, model: PresentDocumentModel, locale: WorkspaceLocale = 'en-US'): Promise<ExportDeliveryResult> {
  const png = await renderPresentSlideToRaster(slide, model, 'image/png', 1, 2048, locale);
  return downloadPresentBlob(dataUrlToBlob(png), `${safePresentFileName(title)}_${safePresentFileName(slide.title)}.png`);
}

export async function downloadPresentSlideJpeg(title: string, slide: PresentSlide, model: PresentDocumentModel, locale: WorkspaceLocale = 'en-US'): Promise<ExportDeliveryResult> {
  const jpeg = await renderPresentSlideToJpeg(slide, model, 0.94, 2048, locale);
  return downloadPresentBlob(dataUrlToBlob(jpeg), `${safePresentFileName(title)}_${safePresentFileName(slide.title)}.jpg`);
}

export function downloadPresentSlideSvg(title: string, slide: PresentSlide, model: PresentDocumentModel, locale: WorkspaceLocale = 'en-US'): Promise<ExportDeliveryResult> {
  const size = resolvePresentSlidePixelSize(model, 2048);
  const svg = buildPresentSlideSvg(slide, model, size.width, size.height, undefined, locale);
  return deliverExportText(svg, {
    suggestedName: `${safePresentFileName(title)}_${safePresentFileName(slide.title)}.svg`,
    extensions: ['svg'],
    mimeType: 'image/svg+xml;charset=utf-8',
  });
}
