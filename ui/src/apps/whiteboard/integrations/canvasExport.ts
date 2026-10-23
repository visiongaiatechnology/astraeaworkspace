// STATUS: PLATIN
// Whiteboard PNG export. Thin rasteriser over the canonical export scene
// (`rendering/whiteboardExportScene.ts`): paint order and connector geometry are resolved once, by the
// same modules the live canvas uses. This file contains rendering only — it must never re-derive
// object or connector geometry.

import { STICKY_COLORS, type WhiteboardItem } from '../types';
import { inkPathData } from '../model/whiteboardInkEngine';
import {
  WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT,
  WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH,
} from '../model/whiteboardDiagramEngine';
import { whiteboardTextRenderParams } from '../model/whiteboardTextStyleEngine';
import { deliverExportDataUrl, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import {
  WHITEBOARD_EXPORT_MAX_DIMENSION,
  buildWhiteboardExportScene,
  type WhiteboardExportScene,
} from '../rendering/whiteboardExportScene';

export { WHITEBOARD_EXPORT_MAX_DIMENSION };
export const MAX_EXPORT_DIMENSION = WHITEBOARD_EXPORT_MAX_DIMENSION;

const LAZY_IMAGE_LIMIT = 512;
const MAX_TABLE_ROWS_DRAWN = 12;
const MAX_BODY_LINES_DRAWN = 10;

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image decode failed'));
    image.src = dataUrl;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  let overflow = false;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    let line = '';
    for (const word of words.length ? words : ['']) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = '';
        if (lines.length >= maxLines) {
          overflow = true;
          break;
        }
      }

      if (!line && ctx.measureText(word).width > maxWidth) {
        let fragment = '';
        for (const character of Array.from(word)) {
          const next = fragment + character;
          if (fragment && ctx.measureText(next).width > maxWidth) {
            lines.push(fragment);
            fragment = character;
            if (lines.length >= maxLines) {
              overflow = true;
              break;
            }
          } else fragment = next;
        }
        if (overflow) break;
        line = fragment;
      } else line = line ? `${line} ${word}` : word;
    }
    if (overflow) break;
    if (lines.length < maxLines) lines.push(line);
    else {
      overflow = true;
      break;
    }
  }

  if (lines.length === 0) return [''];
  if (overflow) {
    const lastIndex = lines.length - 1;
    let lastLine = lines[lastIndex] ?? '';
    while (lastLine && ctx.measureText(`${lastLine}…`).width > maxWidth) lastLine = lastLine.slice(0, -1);
    lines[lastIndex] = `${lastLine.trimEnd()}…`;
  }
  return lines;
}

function drawMultilineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 8,
  align: 'left' | 'center' | 'right' = 'left',
): string[] {
  const lines = wrapCanvasText(ctx, text, maxWidth, maxLines);
  const previousAlign = ctx.textAlign;
  if (align !== 'left') ctx.textAlign = align;
  const anchorX = align === 'center' ? x + maxWidth / 2 : align === 'right' ? x + maxWidth : x;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    ctx.fillText(lines[lineIndex] ?? '', anchorX, y + lineIndex * lineHeight);
  }
  ctx.textAlign = previousAlign;
  return lines;
}

/**
 * Typography of one exported label. Without a stored style the historical font is kept; with a style the
 * single formatter of `whiteboardTextStyleEngine` decides the canvas font and the alignment.
 */
function labelFont(item: WhiteboardItem, fallback: string): string {
  return item.textStyle ? whiteboardTextRenderParams(item.textStyle).canvasFont : fallback;
}

function labelAlign(item: WhiteboardItem): 'left' | 'center' | 'right' {
  return item.textStyle ? whiteboardTextRenderParams(item.textStyle).align : 'left';
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  lineHeight: number,
): void {
  const maxWidth = Math.max(20, width - 24);
  const maxLines = Math.max(1, Math.floor((height - 16) / lineHeight));
  const lines = wrapCanvasText(ctx, text, maxWidth, maxLines);
  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'center';
  const firstBaseline = y + height / 2 + 4 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, x + width / 2, firstBaseline + index * lineHeight));
  ctx.textAlign = previousAlign;
}

/**
 * Renders an exact path string produced by a canonical geometry module (routing engine or ink engine).
 * `Path2D` is used when the host provides it (browser); the bounded parser below is the deterministic
 * fallback and understands only the `M`/`L`/`C`/`Q`/`Z` commands those engines emit. It parses, it does
 * not re-route and it does not re-fit.
 */
export function drawCanonicalPathData(ctx: CanvasRenderingContext2D, path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  const pathConstructor = (globalThis as { Path2D?: new (data: string) => Path2D }).Path2D;
  if (typeof pathConstructor === 'function') {
    ctx.stroke(new pathConstructor(path));
    return true;
  }
  const tokens = path.match(/[MLCQZ]|-?\d+(?:\.\d+)?/gu);
  if (!tokens || tokens.length === 0) return false;
  let cursor = 0;
  let command = '';
  let started = false;
  let currentX = 0;
  let currentY = 0;
  const nextNumber = (): number => Number(tokens[cursor++]);
  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token === 'M' || token === 'L' || token === 'C' || token === 'Q' || token === 'Z') {
      command = token;
      cursor += 1;
      continue;
    }
    if (command === 'M' || command === 'L') {
      const x = nextNumber();
      const y = nextNumber();
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (!started) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
      currentX = x;
      currentY = y;
    } else if (command === 'C') {
      const c1x = nextNumber();
      const c1y = nextNumber();
      const c2x = nextNumber();
      const c2y = nextNumber();
      const x = nextNumber();
      const y = nextNumber();
      if (![c1x, c1y, c2x, c2y, x, y].every(Number.isFinite)) return false;
      if (!started) {
        ctx.beginPath();
        ctx.moveTo(c1x, c1y);
        started = true;
      }
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
      currentX = x;
      currentY = y;
    } else if (command === 'Q') {
      const cx = nextNumber();
      const cy = nextNumber();
      const x = nextNumber();
      const y = nextNumber();
      if (![cx, cy, x, y].every(Number.isFinite)) return false;
      if (!started) {
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        started = true;
      }
      ctx.quadraticCurveTo(cx, cy, x, y);
      currentX = x;
      currentY = y;
    } else if (command === 'Z') {
      if (started) ctx.closePath();
    } else {
      return false;
    }
  }
  if (!started) return false;
  ctx.stroke();
  return true;
}

function withRotation(ctx: CanvasRenderingContext2D, item: WhiteboardItem, draw: () => void): void {
  const rotation = Number.isFinite(item.rotation) ? item.rotation as number : 0;
  if (rotation === 0) {
    draw();
    return;
  }
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

function richObjectBody(item: WhiteboardItem): string[] {
  if (item.table) return item.table.rows.slice(0, MAX_TABLE_ROWS_DRAWN).map((row) => row.join('  ·  '));
  if (item.chart) return item.chart.labels.slice(0, MAX_BODY_LINES_DRAWN).map((label, index) => `${label}: ${item.chart?.values[index] ?? ''}`);
  if (item.code) return item.code.code.split(/\r?\n/u).slice(0, MAX_BODY_LINES_DRAWN);
  if (item.diagram?.fields) return item.diagram.fields.slice(0, MAX_BODY_LINES_DRAWN);
  if (item.card?.tags) return item.card.tags.slice(0, MAX_BODY_LINES_DRAWN);
  if (item.liveObject) return (item.liveObject.frozenSnapshot?.lines ?? []).slice(0, MAX_BODY_LINES_DRAWN);
  return [];
}

function richObjectSubtitle(item: WhiteboardItem): string {
  return item.diagram?.subtitle || item.card?.subtitle || item.document?.excerpt || item.liveObject?.sourceTitle
    || item.media?.mime || item.icon?.label || '';
}

async function drawImageItem(
  ctx: CanvasRenderingContext2D,
  item: WhiteboardItem,
  x: number,
  y: number,
): Promise<void> {
  if (!item.dataUrl) {
    ctx.fillStyle = '#3f0d16';
    ctx.fillRect(x, y, item.width, item.height);
    ctx.fillStyle = '#fda4af';
    ctx.font = '11px sans-serif';
    ctx.fillText('Missing image data', x + 10, y + 20);
    return;
  }
  try {
    const image = await loadDataUrlImage(item.dataUrl);
    ctx.drawImage(image, x, y, item.width, item.height);
  } catch {
    // Visible, never silent: the cell is filled and labelled so a failed decode cannot pass as content.
    ctx.fillStyle = '#3f0d16';
    ctx.fillRect(x, y, item.width, item.height);
    ctx.fillStyle = '#fda4af';
    ctx.font = '11px sans-serif';
    ctx.fillText('Image decode failed', x + 10, y + 20);
  }
}

function drawShapeItem(ctx: CanvasRenderingContext2D, item: WhiteboardItem, x: number, y: number): boolean {
  const shape = item.shape;
  if (!shape) return false;
  const w = item.width;
  const h = item.height;
  ctx.fillStyle = shape.fill;
  ctx.strokeStyle = shape.stroke;
  ctx.lineWidth = shape.strokeWidth;
  ctx.beginPath();
  if (shape.kind === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape.kind === 'diamond') {
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
  } else if (shape.kind === 'triangle') {
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  } else if (shape.kind === 'rounded-rectangle') ctx.roundRect(x, y, w, h, 12);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  return true;
}

function drawGenericCard(ctx: CanvasRenderingContext2D, item: WhiteboardItem, x: number, y: number): void {
  const w = item.width;
  const h = item.height;
  ctx.fillStyle = item.type === 'terminal' ? '#064e3b' : '#111827';
  ctx.strokeStyle = item.type === 'terminal' ? '#10b981' : '#64748b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  const title = item.text || item.diagram?.title || item.card?.title || item.document?.title
    || item.chart?.title || item.code?.language || item.media?.name || item.icon?.label
    || item.liveObject?.sourceTitle || item.name || item.type;
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px sans-serif';
  const titleLines = drawMultilineText(ctx, title, x + 12, y + 24, Math.max(20, w - 24), 15, 2);
  const subtitle = richObjectSubtitle(item);
  let cursorY = y + 24 + titleLines.length * 15;
  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    const subtitleLines = drawMultilineText(ctx, subtitle, x + 12, cursorY, Math.max(20, w - 24), 13, 2);
    cursorY += subtitleLines.length * 13 + 2;
  }
  const body = richObjectBody(item);
  if (body.length > 0 && cursorY < y + h - 8) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px monospace';
    const maxLines = Math.max(1, Math.floor((y + h - 10 - cursorY) / 12));
    drawMultilineText(ctx, body.join('\n'), x + 12, cursorY, Math.max(20, w - 24), 12, Math.min(MAX_BODY_LINES_DRAWN, maxLines));
  }
}

function drawItem(ctx: CanvasRenderingContext2D, scene: WhiteboardExportScene, item: WhiteboardItem): void {
  const x = item.x + scene.offsetX;
  const y = item.y + scene.offsetY;

  if (item.type === 'ink') {
    if (!item.ink || item.ink.points.length === 0) return;
    ctx.strokeStyle = item.ink.color;
    ctx.lineWidth = item.ink.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // One ink geometry rule: the same local-space path data the SVG export and the live canvas use.
    ctx.save();
    ctx.translate(x, y);
    const rotation = Number.isFinite(item.rotation) ? item.rotation as number : 0;
    if (rotation !== 0) {
      ctx.translate(item.width / 2, item.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-item.width / 2, -item.height / 2);
    }
    drawCanonicalPathData(ctx, inkPathData(item.ink.points));
    ctx.restore();
    ctx.lineCap = 'butt';
    return;
  }

  if (item.type === 'shape' && drawShapeItem(ctx, item, x, y)) {
    if (item.text && item.shape) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = labelFont(item, 'bold 12px sans-serif');
      drawCenteredText(ctx, item.text, x, y, item.width, item.height, 15);
    }
    return;
  }

  if (item.type === 'text') {
    ctx.fillStyle = '#f8fafc';
    ctx.font = labelFont(item, 'bold 16px sans-serif');
    drawMultilineText(ctx, item.text, x, y + 18, Math.max(20, item.width), 20, 12, labelAlign(item));
    return;
  }

  if (item.type === 'sticky') {
    const color = STICKY_COLORS[item.color || 'yellow'];
    ctx.fillStyle = color.bg;
    ctx.strokeStyle = color.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, item.width, item.height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color.header;
    ctx.beginPath();
    ctx.roundRect(x, y, item.width, 24, [8, 8, 0, 0]);
    ctx.fill();
    ctx.fillStyle = color.text;
    ctx.font = labelFont(item, 'bold 12px sans-serif');
    drawMultilineText(ctx, item.text, x + 12, y + 44, Math.max(20, item.width - 24), 16, Math.max(1, Math.floor((item.height - 50) / 16)), labelAlign(item));
    return;
  }

  if (item.type === 'process') {
    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, item.width, item.height, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e2e8f0'; ctx.font = labelFont(item, 'bold 12px sans-serif');
    drawCenteredText(ctx, item.text || item.diagram?.title || '', x, y, item.width, item.height, 15);
    return;
  }

  if (item.type === 'decision') {
    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + item.width / 2, y); ctx.lineTo(x + item.width, y + item.height / 2);
    ctx.lineTo(x + item.width / 2, y + item.height); ctx.lineTo(x, y + item.height / 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fde68a'; ctx.font = labelFont(item, 'bold 11px sans-serif');
    drawCenteredText(ctx, item.text || item.diagram?.title || '', x, y, item.width, item.height, 14);
    return;
  }

  if (item.type === 'terminal') {
    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, item.width, item.height, item.height / 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a7f3d0'; ctx.font = labelFont(item, 'bold 12px sans-serif');
    drawCenteredText(ctx, item.text || item.diagram?.title || 'Start / End', x, y, item.width, item.height, 15);
    return;
  }

  drawGenericCard(ctx, item, x, y);
}

/**
 * Draws a resolved export scene into a 2D context. Exported separately from the DOM wrapper so the
 * complete render contract is testable without a browser.
 */
export async function drawWhiteboardExportScene(
  ctx: CanvasRenderingContext2D,
  scene: WhiteboardExportScene,
  documentTitle: string,
): Promise<void> {
  ctx.save();
  ctx.scale(scene.scale, scene.scale);
  try {
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, scene.width, scene.height);

    const gridTile = window.document.createElement('canvas');
    gridTile.width = 24;
    gridTile.height = 24;
    const gridContext = gridTile.getContext('2d');
    if (gridContext) {
      gridContext.fillStyle = 'rgba(255, 255, 255, 0.08)';
      gridContext.beginPath();
      gridContext.arc(1, 1, 1, 0, Math.PI * 2);
      gridContext.fill();
      const gridPattern = ctx.createPattern(gridTile, 'repeat');
      if (gridPattern) {
        ctx.fillStyle = gridPattern;
        ctx.fillRect(0, 0, scene.width, scene.height);
      }
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`ASTRAEA WHITEBOARD · ${documentTitle.slice(0, 240).toUpperCase()} · LOCAL EXPORT`, 24, 32);

    // Frames first: they are visual grouping backgrounds in the live canvas too.
    for (const item of scene.items) {
      if (item.type !== 'frame') continue;
      withRotation(ctx, item, () => {
        const x = item.x + scene.offsetX;
        const y = item.y + scene.offsetY;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.fillRect(x, y, item.width, item.height);
        ctx.strokeRect(x, y, item.width, item.height);
        ctx.setLineDash([]);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 11px sans-serif';
        drawMultilineText(ctx, item.text || 'Frame', x + 8, y + 18, Math.max(20, item.width - 16), 13, 2);
      });
    }

    // Connectors use the routing engine's own path and label placement — never a local endpoint rule.
    for (const item of scene.items) {
      if (item.type !== 'connector') continue;
      const routed = scene.connectorPaths.get(item.id);
      if (!routed) continue;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2.5;
      drawCanonicalPathData(ctx, routed.path);
      const headLength = 10;
      const angle = Math.atan2(routed.to.y - routed.from.y, routed.to.x - routed.from.x);
      const tipX = routed.to.x + scene.offsetX;
      const tipY = routed.to.y + scene.offsetY;
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - headLength * Math.cos(angle - Math.PI / 6), tipY - headLength * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tipX - headLength * Math.cos(angle + Math.PI / 6), tipY - headLength * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      if (item.lineLabel) {
        const labelX = routed.labelX + scene.offsetX;
        const labelY = routed.labelY + scene.offsetY;
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(labelX - WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH, labelY - WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT, WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH * 2, WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.font = '10px monospace';
        const previousAlign = ctx.textAlign;
        ctx.textAlign = 'center';
        ctx.fillText(wrapCanvasText(ctx, item.lineLabel, WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH * 2 - 6, 1)[0] ?? '', labelX, labelY + 3);
        ctx.textAlign = previousAlign;
      }
    }

    let decodedImages = 0;
    let pendingImage: Promise<void> | null = null;
    for (const item of scene.items) {
      if (item.type === 'connector' || item.type === 'frame') continue;
      if (item.type === 'image' && item.dataUrl && decodedImages >= LAZY_IMAGE_LIMIT) {
        // Bounded decode work: the remaining images are drawn as visible placeholders, never skipped.
        ctx.fillStyle = '#111827';
        ctx.fillRect(item.x + scene.offsetX, item.y + scene.offsetY, item.width, item.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px sans-serif';
        ctx.fillText('Image decode budget reached', item.x + scene.offsetX + 8, item.y + scene.offsetY + 18);
        continue;
      }
      if (item.type === 'image') decodedImages += 1;
      withRotation(ctx, item, () => {
        if (item.type === 'image') {
          pendingImage = drawImageItem(ctx, item, item.x + scene.offsetX, item.y + scene.offsetY);
          return;
        }
        drawItem(ctx, scene, item);
      });
      if (pendingImage) {
        await pendingImage;
        pendingImage = null;
      }
    }
  } finally {
    ctx.restore();
  }
}

export async function buildWhiteboardPngDataUrl(documentTitle: string, items: WhiteboardItem[]): Promise<string> {
  const scene = buildWhiteboardExportScene(items);
  const canvas = window.document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  canvas.width = Math.max(1, Math.round(scene.width * scene.scale));
  canvas.height = Math.max(1, Math.round(scene.height * scene.scale));
  await drawWhiteboardExportScene(ctx, scene, documentTitle);
  return canvas.toDataURL('image/png');
}

/** Release Beta 0.1: native save on the desktop; the browser fallback is a download. */
export async function exportWhiteboardToPNG(documentTitle: string, items: WhiteboardItem[]): Promise<ExportDeliveryResult> {
  const safeTitle = documentTitle.slice(0, 240);
  const url = await buildWhiteboardPngDataUrl(safeTitle, items);
  const fileName = `whiteboard-${safeTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'canvas'}.png`;
  return deliverExportDataUrl(url, { suggestedName: fileName, extensions: ['png'], mimeType: 'image/png' });
}
