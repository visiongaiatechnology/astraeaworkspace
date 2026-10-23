// STATUS: PLATIN
// Astraea Whiteboard — bounded native/container and foreign interchange engine.

import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../../platform/containers/container';
import { inspectBoundedForeignXml } from '../../../shared/interoperability/xml';
import { exceedsUtf8ByteLimit, rasterizeSvgToDataUrl, SVG_RASTER_LIMITS } from '../../../platform/rendering/svgRasterizer';
import { buildPresentPdfFromJpegs } from '../../present/interchange/render/presentExport';
import { flattenForeignPdfPages } from '../../pdf-studio/import/pdfForeignPageImport';
import type { WhiteboardItem } from '../types';
import { exportWhiteboardToSvg } from './whiteboardInterchangeEngine';
import { sanitizeWhiteboardSvgSource, WHITEBOARD_SVG_MAX_BYTES } from '../model/whiteboardObjectEngine';
import { deliverExportBytes, deliverExportText, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';

export const WHITEBOARD_INTERCHANGE_LIMITS = Object.freeze({
  maxNativeBytes: 128 * 1024 * 1024,
  maxItems: 100_000,
  maxPdfPages: 128,
  maxPdfBytes: 96 * 1024 * 1024,
  maxPdfItemVisits: 2_000_000,
  maxPdfPageJpegBytes: 16 * 1024 * 1024,
  maxPdfAggregateJpegBytes: 64 * 1024 * 1024,
  maxSvgNodes: 10_000,
  maxSvgElements: 10_000,
  maxSvgDepth: 64,
  maxSvgNearestComparisons: 1_000_000,
  maxSvgParseMs: 500,
});

export interface WhiteboardNativeOptions { password?: string; pin?: string; }
export interface WhiteboardExportScope { frameId?: string; }

function assertWhiteboardDocument(doc: WorkspaceDocument): void {
  if (doc.kind !== 'Whiteboard') throw new Error('Native container does not contain an Astraea Whiteboard document');
  const items = doc.whiteboardData?.items;
  if (!Array.isArray(items)) throw new Error('Whiteboard payload does not contain canonical items');
  if (items.length > WHITEBOARD_INTERCHANGE_LIMITS.maxItems) throw new Error('Whiteboard item count exceeds the import policy');
}

export async function packNativeWhiteboard(document: WorkspaceDocument, options: WhiteboardNativeOptions = {}): Promise<Uint8Array> {
  assertWhiteboardDocument(document);
  const bytes = await packLocalEncryptedContainer(document, options);
  if (bytes.byteLength < 16 || bytes.byteLength > WHITEBOARD_INTERCHANGE_LIMITS.maxNativeBytes) throw new Error('Encrypted .vboard size boundary violation');
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== 'VGT2' && magic !== 'VGT3') throw new Error('Native .vboard export is not an authenticated encrypted VGT container');
  return bytes;
}

export async function unpackNativeWhiteboard(bytes: Uint8Array, options: WhiteboardNativeOptions = {}): Promise<WorkspaceDocument> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 16 || bytes.byteLength > WHITEBOARD_INTERCHANGE_LIMITS.maxNativeBytes) throw new Error('Encrypted .vboard size boundary violation');
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== 'VGT2' && magic !== 'VGT3') throw new Error('Legacy/plaintext .vboard is rejected by the native encrypted import path');
  const doc = await unpackLocalEncryptedContainer(bytes, options);
  assertWhiteboardDocument(doc);
  return doc;
}

function insideFrame(item: WhiteboardItem, frame: WhiteboardItem): boolean {
  if (item.id === frame.id) return true;
  if (item.type === 'connector') return false;
  return item.x >= frame.x && item.y >= frame.y && item.x + item.width <= frame.x + frame.width && item.y + item.height <= frame.y + frame.height;
}

export function itemsForWhiteboardScope(items: readonly WhiteboardItem[], scope: WhiteboardExportScope = {}): WhiteboardItem[] {
  if (!Array.isArray(items)) throw new Error('Whiteboard items must be a canonical array');
  if (items.length > WHITEBOARD_INTERCHANGE_LIMITS.maxItems) throw new Error('Whiteboard item count exceeds the export policy');
  if (!scope.frameId) return items.map((item) => ({ ...item }));
  const frame = items.find((item) => item.id === scope.frameId && item.type === 'frame');
  if (!frame) throw new Error('Requested export frame does not exist');
  const contained = items.filter((item) => insideFrame(item, frame));
  const ids = new Set(contained.map((item) => item.id));
  const connectors = items.filter((item) => item.type === 'connector' && item.fromId && item.toId && ids.has(item.fromId) && ids.has(item.toId));
  if (contained.length + connectors.length > WHITEBOARD_INTERCHANGE_LIMITS.maxItems) throw new Error('Scoped Whiteboard item count exceeds the export policy');
  return [...contained, ...connectors].map((item) => ({ ...item }));
}

export function buildWhiteboardSvg(documentTitle: string, items: readonly WhiteboardItem[], scope: WhiteboardExportScope = {}): string {
  const scoped = itemsForWhiteboardScope(items, scope);
  const svg = exportWhiteboardToSvg(documentTitle, scoped);
  if (exceedsUtf8ByteLimit(svg, SVG_RASTER_LIMITS.maxSourceBytes)) throw new Error('Generated SVG exceeds the export policy');
  return svg;
}

export async function buildWhiteboardPng(documentTitle: string, items: readonly WhiteboardItem[], scope: WhiteboardExportScope = {}): Promise<string> {
  return rasterizeSvgToDataUrl(buildWhiteboardSvg(documentTitle, items, scope), 'image/png', 2);
}

export async function buildWhiteboardPdf(documentTitle: string, items: readonly WhiteboardItem[], scope: WhiteboardExportScope = {}): Promise<Uint8Array> {
  if (!Array.isArray(items) || items.length > WHITEBOARD_INTERCHANGE_LIMITS.maxItems) throw new Error('Whiteboard item count exceeds the PDF export policy');
  const actualFrames = items.filter((item) => item.type === 'frame');
  const pages: WhiteboardExportScope[] = scope.frameId
    ? [{ frameId: scope.frameId }]
    : actualFrames.length > 0
      ? actualFrames.map((frame) => ({ frameId: frame.id }))
      : [{}];
  const effectivePages = pages;
  if (effectivePages.length > WHITEBOARD_INTERCHANGE_LIMITS.maxPdfPages) throw new Error('PDF page count exceeds export policy');
  if (items.length > Math.floor(WHITEBOARD_INTERCHANGE_LIMITS.maxPdfItemVisits / effectivePages.length)) throw new Error('PDF frame expansion exceeds the item processing policy');
  const jpegs: string[] = [];
  let aggregateJpegBytes = 0;
  for (const page of effectivePages) {
    const svg = buildWhiteboardSvg(documentTitle, items, page);
    const jpeg = await rasterizeSvgToDataUrl(svg, 'image/jpeg', 1.5);
    const encoded = /^data:image\/jpeg;base64,([A-Za-z0-9+/]*={0,2})$/i.exec(jpeg);
    if (!encoded) throw new Error('PDF frame rasterizer returned an invalid JPEG data URL');
    const padding = encoded[1].endsWith('==') ? 2 : encoded[1].endsWith('=') ? 1 : 0;
    const jpegBytes = Math.floor(encoded[1].length * 3 / 4) - padding;
    if (jpegBytes < 1 || jpegBytes > WHITEBOARD_INTERCHANGE_LIMITS.maxPdfPageJpegBytes) throw new Error('PDF page JPEG exceeds the encoded size policy');
    if (jpegBytes > WHITEBOARD_INTERCHANGE_LIMITS.maxPdfAggregateJpegBytes - aggregateJpegBytes) throw new Error('PDF pages exceed the aggregate encoded size policy');
    aggregateJpegBytes += jpegBytes;
    jpegs.push(jpeg);
  }
  return buildPresentPdfFromJpegs(documentTitle, jpegs, { width: 1600, height: 900 });
}

function numberAttr(element: Element, name: string, fallback = 0): number {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? Math.max(-10_000_000, Math.min(10_000_000, value)) : fallback;
}

function assertImportDeadline(deadlineAt: number): void {
  if (Date.now() > deadlineAt) throw new Error('SVG import exceeded the parse time budget');
}

function nearestNode(items: WhiteboardItem[], x: number, y: number, deadlineAt: number, work: { remaining: number }): WhiteboardItem | undefined {
  let best: WhiteboardItem | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < items.length; index += 1) {
    if ((index & 255) === 0) assertImportDeadline(deadlineAt);
    work.remaining -= 1;
    if (work.remaining < 0) throw new Error('SVG connector association exceeds the complexity policy');
    const item = items[index];
    if (item.type === 'connector' || item.type === 'text' || item.type === 'frame') continue;
    const dx = item.x + item.width / 2 - x;
    const dy = item.y + item.height / 2 - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) { best = item; bestDistance = distance; }
  }
  return best;
}

export function importCommonDiagramSvg(source: string, now = Date.now()): WhiteboardItem[] {
  inspectBoundedForeignXml(source, { maxBytes: WHITEBOARD_SVG_MAX_BYTES, maxDepth: WHITEBOARD_INTERCHANGE_LIMITS.maxSvgDepth, maxElements: WHITEBOARD_INTERCHANGE_LIMITS.maxSvgElements });
  const startedAt = Date.now();
  const deadlineAt = startedAt + WHITEBOARD_INTERCHANGE_LIMITS.maxSvgParseMs;
  const safe = sanitizeWhiteboardSvgSource(source);
  if (!safe) throw new Error('SVG rejected by the active-content policy');
  if (new TextEncoder().encode(safe).byteLength > WHITEBOARD_SVG_MAX_BYTES) throw new Error('SVG exceeds byte budget');
  if (typeof DOMParser === 'undefined') throw new Error('SVG DOM parser is unavailable');
  const parsed = new DOMParser().parseFromString(safe, 'image/svg+xml');
  assertImportDeadline(deadlineAt);
  if (parsed.querySelector('parsererror')) throw new Error('SVG is malformed');
  const unsupportedVisible = Array.from(parsed.querySelectorAll('path,polyline')).filter((element) => !element.closest('defs,clipPath'));
  if (unsupportedVisible.length) throw new Error('SVG contains unsupported path/polyline geometry; import requires simple rect/circle/ellipse/polygon/text/line primitives');
  const transformed = Array.from(parsed.querySelectorAll('[transform]')).filter((element) => !element.closest('defs'));
  if (transformed.length) throw new Error('SVG contains transformed geometry that cannot be preserved by semantic import');
  const allElements = Array.from(parsed.querySelectorAll('*'));
  if (allElements.length > WHITEBOARD_INTERCHANGE_LIMITS.maxSvgElements) throw new Error('SVG element count exceeds import policy');
  for (let index = 0; index < allElements.length; index += 1) {
    if ((index & 255) === 0) assertImportDeadline(deadlineAt);
    let depth = 0;
    let parent: Element | null = allElements[index];
    while (parent) {
      depth += 1;
      if (depth > WHITEBOARD_INTERCHANGE_LIMITS.maxSvgDepth) throw new Error('SVG nesting depth exceeds import policy');
      parent = parent.parentElement;
    }
  }
  const nodes = Array.from(parsed.querySelectorAll('rect,circle,ellipse,polygon,text,line')).filter((element) => !element.closest('defs,clipPath'));
  if (nodes.length > WHITEBOARD_INTERCHANGE_LIMITS.maxSvgNodes) throw new Error('SVG node count exceeds import policy');
  const output: WhiteboardItem[] = [];
  let sequence = 0;
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    if ((nodeIndex & 255) === 0) assertImportDeadline(deadlineAt);
    const node = nodes[nodeIndex];
    const tag = node.tagName.toLowerCase();
    const id = `svg-${now}-${sequence++}`;
    if (tag === 'rect') {
      output.push({ id, type: 'process', x: numberAttr(node,'x'), y: numberAttr(node,'y'), width: Math.max(8, numberAttr(node,'width',120)), height: Math.max(8, numberAttr(node,'height',64)), text: node.getAttribute('aria-label') || 'Imported rectangle' });
    } else if (tag === 'circle' || tag === 'ellipse') {
      const rx = tag === 'circle' ? numberAttr(node,'r',40) : numberAttr(node,'rx',50);
      const ry = tag === 'circle' ? numberAttr(node,'r',40) : numberAttr(node,'ry',36);
      const cx = numberAttr(node,'cx',rx), cy = numberAttr(node,'cy',ry);
      output.push({ id, type: 'terminal', x: cx-rx, y: cy-ry, width: Math.max(8,rx*2), height: Math.max(8,ry*2), text: 'Imported ellipse' });
    } else if (tag === 'polygon') {
      const points=(node.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      const xs=points.filter((_,i)=>i%2===0), ys=points.filter((_,i)=>i%2===1);
      if(xs.length>=3&&ys.length>=3){const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);output.push({id,type:'decision',x:minX,y:minY,width:Math.max(8,maxX-minX),height:Math.max(8,maxY-minY),text:'Imported decision'});}
    } else if (tag === 'text') {
      const text=(node.textContent||'').trim().slice(0,10_000); if(text) output.push({id,type:'text',x:numberAttr(node,'x'),y:numberAttr(node,'y'),width:Math.max(80,text.length*8),height:32,text});
    }
  }
  const shapeItems = output.filter((item)=>item.type!=='text');
  const lineNodes = nodes.filter((entry)=>entry.tagName.toLowerCase()==='line');
  const nearestNodeWork = { remaining: WHITEBOARD_INTERCHANGE_LIMITS.maxSvgNearestComparisons };
  for (let lineIndex = 0; lineIndex < lineNodes.length; lineIndex += 1) {
    assertImportDeadline(deadlineAt);
    const node = lineNodes[lineIndex];
    const from=nearestNode(shapeItems,numberAttr(node,'x1'),numberAttr(node,'y1'),deadlineAt,nearestNodeWork);
    const to=nearestNode(shapeItems,numberAttr(node,'x2'),numberAttr(node,'y2'),deadlineAt,nearestNodeWork);
    if(from&&to&&from.id!==to.id) output.push({id:`svg-${now}-${sequence++}`,type:'connector',x:0,y:0,width:0,height:0,text:'',fromId:from.id,toId:to.id});
  }
  if (!output.length) throw new Error('SVG contains no supported diagram primitives');
  if (output.length > WHITEBOARD_INTERCHANGE_LIMITS.maxItems) throw new Error('SVG expansion exceeds item budget');
  return output;
}

export async function importPdfPagesAsWhiteboardItems(file: File, startX = 0, startY = 0): Promise<WhiteboardItem[]> {
  if (!file || (file.type && file.type !== 'application/pdf')) throw new Error('Only local PDF files are accepted');
  if (file.size < 1 || file.size > WHITEBOARD_INTERCHANGE_LIMITS.maxPdfBytes) throw new Error('PDF byte size exceeds Whiteboard import policy');
  if (!Number.isFinite(startX) || !Number.isFinite(startY) || Math.abs(startX) > 10_000_000 || Math.abs(startY) > 10_000_000) throw new Error('PDF placement coordinates exceed Whiteboard bounds');
  const pages = await flattenForeignPdfPages(file, undefined, {
    maxImportedPages: WHITEBOARD_INTERCHANGE_LIMITS.maxPdfPages,
    maxAggregateJpegBytes: WHITEBOARD_INTERCHANGE_LIMITS.maxPdfAggregateJpegBytes,
  });
  if (pages.length > WHITEBOARD_INTERCHANGE_LIMITS.maxPdfPages) throw new Error('PDF page count exceeds Whiteboard import policy');
  return pages.map((page,index)=>{
    const width=Math.min(900,Math.max(200,page.widthPx)); const scale=width/Math.max(1,page.widthPx); const height=Math.max(120,Math.round(page.heightPx*scale));
    return {id:`pdf-page-${Date.now()}-${index}`,type:'image',x:startX+(index%3)*940,y:startY+Math.floor(index/3)*Math.min(1100,height+80),width,height,text:'',name:page.name.slice(0,200),dataUrl:page.dataUrl} satisfies WhiteboardItem;
  });
}

/**
 * Release Beta 0.1: native save on the desktop; the browser fallback is a download reported as such.
 */
export function downloadWhiteboardBytes(bytes: Uint8Array, mime: string, filename: string): Promise<ExportDeliveryResult> {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(filename) ? filename.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBytes(bytes, { suggestedName: filename, extensions: [extension], mimeType: mime });
}

export function downloadWhiteboardText(text: string, mime: string, filename: string): Promise<ExportDeliveryResult> {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(filename) ? filename.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportText(text, { suggestedName: filename, extensions: [extension], mimeType: mime });
}

export function safeWhiteboardFilename(title: string): string { return title.trim().replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'') || 'whiteboard'; }
