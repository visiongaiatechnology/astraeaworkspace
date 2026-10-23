// STATUS: DIAMANT VGT SUPREME — shared deterministic freeform-canvas print/export presentation model
import type { NoteCanvasBlock, NoteCanvasState, NotePage, WriterImageBlockData, WriterPageSetupConfig } from '../../../shared/contracts/workspace';
import { buildDocumentPdf } from '../../../platform/rendering/documentPdfExport';
import { normalizeNoteCanvas, resolveCanvasSize, sanitizeNoteInkSvg } from '../canvas/notesCanvasModel';

export const NOTE_CANVAS_PRINT_MAX_EDGE = 4_096;
export const NOTE_CANVAS_PRINT_MAX_PIXELS = 16_000_000;

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function safeDataImage(value: string): string | null {
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) && value.length <= 32 * 1024 * 1024 ? value : null;
}
function wrap(value: string, maxChars: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const raw of value.replace(/\r/g, '').split('\n')) {
    let rest = raw;
    while (rest.length > maxChars && out.length < maxLines) {
      let cut = rest.lastIndexOf(' ', maxChars);
      if (cut < Math.floor(maxChars * 0.45)) cut = maxChars;
      out.push(rest.slice(0, cut).trimEnd()); rest = rest.slice(cut).trimStart();
    }
    if (out.length < maxLines) out.push(rest);
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}
function textLines(lines: readonly string[], x: number, y: number, width: number, height: number, fontSize = 12): string {
  const maxChars = Math.max(8, Math.floor((width - 20) / (fontSize * 0.56)));
  const maxLines = Math.max(1, Math.floor((height - 42) / (fontSize * 1.35)));
  const wrapped = wrap(lines.join('\n'), maxChars, maxLines);
  return wrapped.map((line, index) => `<text x="${x + 10}" y="${y + 47 + index * fontSize * 1.35}" font-family="system-ui, sans-serif" font-size="${fontSize}" fill="#dbeafe">${xml(line)}</text>`).join('');
}
function blockText(block: NoteCanvasBlock): string[] {
  switch (block.kind) {
    case 'text': return [block.text];
    case 'list': return block.items.map((item, index) => `${block.checklist ? '☐ ' : block.ordered ? `${index + 1}. ` : '• '}${item}`);
    case 'table': return block.rows.map((row) => row.join('  |  '));
    case 'file': return [`Attachment: ${block.name}`, block.mimeType];
    case 'embed': return [block.title, block.reference, block.workspace ? `${block.workspace.mode} · ${block.workspace.kind}` : 'External web link'];
    case 'toggle': return [block.title, ...(block.collapsed ? ['(collapsed)'] : [block.text])];
    case 'media': return [block.memo.title || `${block.memo.kind} note`, `${block.memo.kind} · ${Math.round(block.memo.durationSeconds)}s`, ...block.memo.transcript.slice(0, 4).map((segment) => segment.text)];
    case 'image': return [block.altText || 'Image'];
    case 'ink': return [block.recognizedText || 'Ink'];
  }
}

export interface NoteCanvasPrintModel {
  canvas: NoteCanvasState;
  width: number;
  height: number;
  svg: string;
}

export function buildNoteCanvasPrintModel(input: NoteCanvasState | undefined): NoteCanvasPrintModel {
  const canvas = normalizeNoteCanvas(input);
  const size = resolveCanvasSize(canvas);
  const width = Math.max(320, Math.min(12_000, Math.ceil(size.width)));
  const height = Math.max(320, Math.min(20_000, Math.ceil(size.minHeight)));
  const blocks = [...canvas.blocks].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const defs = canvas.background === 'grid'
    ? '<pattern id="bg" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#94a3b8" stroke-opacity=".14"/></pattern>'
    : canvas.background === 'ruled'
      ? '<pattern id="bg" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M0 27.5H28" stroke="#94a3b8" stroke-opacity=".18"/></pattern>'
      : canvas.background === 'dots'
        ? '<pattern id="bg" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#94a3b8" fill-opacity=".32"/></pattern>'
        : '';
  const body = blocks.map((block) => {
    const h = block.collapsed && block.kind !== 'toggle' ? 34 : block.height;
    const shell = `<rect x="${block.x}" y="${block.y}" width="${block.width}" height="${h}" rx="12" fill="#0f172a" fill-opacity=".96" stroke="#334155"/><rect x="${block.x}" y="${block.y}" width="${block.width}" height="28" rx="12" fill="#020617"/><text x="${block.x + 10}" y="${block.y + 19}" font-family="system-ui, sans-serif" font-size="9" letter-spacing="1" fill="#94a3b8">${xml(block.kind.toUpperCase())}</text>`;
    if (block.collapsed && block.kind !== 'toggle') return `<g data-note-block-id="${xml(block.id)}" data-z="${block.zIndex}">${shell}</g>`;
    if (block.kind === 'image') {
      const src = safeDataImage(block.src);
      const visual = src ? `<image href="${xml(src)}" x="${block.x + 4}" y="${block.y + 32}" width="${Math.max(1, block.width - 8)}" height="${Math.max(1, block.height - 36)}" preserveAspectRatio="xMidYMid meet"/>` : textLines(blockText(block), block.x, block.y, block.width, block.height);
      return `<g data-note-block-id="${xml(block.id)}" data-z="${block.zIndex}">${shell}${visual}</g>`;
    }
    if (block.kind === 'ink') {
      const safe = sanitizeNoteInkSvg(block.svg);
      const visual = safe ? `<image href="data:image/svg+xml;charset=utf-8,${xml(encodeURIComponent(safe))}" x="${block.x + 4}" y="${block.y + 32}" width="${Math.max(1, block.width - 8)}" height="${Math.max(1, block.height - 36)}" preserveAspectRatio="xMidYMid meet"/>` : textLines(blockText(block), block.x, block.y, block.width, block.height);
      return `<g data-note-block-id="${xml(block.id)}" data-z="${block.zIndex}">${shell}${visual}</g>`;
    }
    return `<g data-note-block-id="${xml(block.id)}" data-z="${block.zIndex}">${shell}${textLines(blockText(block), block.x, block.y, block.width, h)}</g>`;
  }).join('');
  const background = defs ? `<rect width="100%" height="100%" fill="url(#bg)"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs><rect width="100%" height="100%" fill="${xml(canvas.backgroundColor ?? '#0a0d14')}"/>${background}${body}</svg>`;
  return { canvas, width, height, svg };
}

async function rasterizeNoteCanvasSvg(model: NoteCanvasPrintModel): Promise<{ dataUrl: string; width: number; height: number }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('Freeform PDF export requires the browser canvas renderer.');
  const scale = Math.min(1, NOTE_CANVAS_PRINT_MAX_EDGE / Math.max(model.width, model.height), Math.sqrt(NOTE_CANVAS_PRINT_MAX_PIXELS / (model.width * model.height)));
  const width = Math.max(1, Math.round(model.width * scale));
  const height = Math.max(1, Math.round(model.height * scale));
  const blob = new Blob([model.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Freeform canvas SVG could not be rasterized.')); image.src = url; });
    const surface = document.createElement('canvas'); surface.width = width; surface.height = height;
    const context = surface.getContext('2d', { alpha: false }); if (!context) throw new Error('Canvas 2D renderer is unavailable.');
    context.drawImage(image, 0, 0, width, height);
    return { dataUrl: surface.toDataURL('image/jpeg', 0.94), width, height };
  } finally { URL.revokeObjectURL(url); }
}

export async function buildNoteFreeformPdf(page: NotePage): Promise<Uint8Array> {
  if (page.editorMode !== 'freeform' || !page.canvas) throw new Error('Freeform PDF renderer requires a freeform Notes page.');
  const model = buildNoteCanvasPrintModel(page.canvas);
  const raster = await rasterizeNoteCanvasSvg(model);
  const pxToMm = 25.4 / 96;
  const flowReserveMm = 40 * 25.4 / 72;
  const config: WriterPageSetupConfig = {
    paperSize: 'Custom', customWidthMm: model.width * pxToMm, customHeightMm: model.height * pxToMm + flowReserveMm,
    orientation: 'portrait', margins: 'custom', customMargins: { top: 0, bottom: 0, left: 0, right: 0 }, paperColor: 'white',
    showPageNumbers: false, headerText: '', footerText: '', backgroundColor: '#ffffff',
  };
  const image: WriterImageBlockData = { id: 'notes-freeform-canvas', name: `${page.title}.jpg`, dataUrl: raster.dataUrl, intrinsicWidth: raster.width, intrinsicHeight: raster.height, widthPercent: 100, alignment: 'left', altText: page.title, placement: 'block' };
  return buildDocumentPdf({title:page.title,paragraphs:[],config,images:[image]});
}

export function printNoteFreeformPage(page: NotePage): void {
  if (page.editorMode !== 'freeform' || !page.canvas) throw new Error('Print requires a freeform Notes page.');
  if (typeof window === 'undefined') throw new Error('Printing is unavailable in this runtime.');
  const model = buildNoteCanvasPrintModel(page.canvas);
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Print window was blocked.');
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${xml(page.title)}</title><style>@page{margin:0}html,body{margin:0;padding:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body>${model.svg}</body></html>`);
  popup.document.close();
  popup.addEventListener('load', () => { popup.focus(); popup.print(); }, { once: true });
}
