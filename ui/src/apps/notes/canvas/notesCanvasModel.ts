// STATUS: DIAMANT VGT SUPREME — pure freeform Notes canvas domain

import type { NoteAttachment, NoteCanvasBlock, NoteCanvasState, NoteMediaMemo, NoteWorkspaceEmbedData } from '../../../shared/contracts/workspace';
import { createNoteEntityId } from '../model/notesHierarchy';
import { createEmptyNoteInkDocument, normalizeNoteInkDocument, renderNoteInkSvg } from './ink/notesInkEngine';
import { isSafeNoteImageMime } from '../media/noteAttachments';
import { normalizeNoteImageBlock } from '../media/notesImageModel';
import { normalizeNoteMediaMemo } from '../media/notesMediaModel';

export const NOTE_CANVAS_MAX_BLOCKS = 512;
export const NOTE_CANVAS_MAX_EXTENT = 20_000;
const MIN_BLOCK_WIDTH = 120;
const MIN_BLOCK_HEIGHT = 56;

export function defaultNoteCanvas(): NoteCanvasState {
  return { pageMode: 'infinite', pageSize: 'A4', background: 'plain', backgroundColor: '#0a0d14', blocks: [] };
}

export function normalizeNoteCanvas(state: NoteCanvasState | undefined): NoteCanvasState {
  const source = state ?? defaultNoteCanvas();
  return {
    pageMode: source.pageMode === 'fixed' ? 'fixed' : 'infinite',
    pageSize: ['A4', 'Letter', 'A5', 'Custom'].includes(source.pageSize) ? source.pageSize : 'A4',
    customWidthPx: bound(source.customWidthPx ?? 960, 320, 4_000),
    customHeightPx: bound(source.customHeightPx ?? 1280, 320, 8_000),
    background: ['plain', 'grid', 'ruled', 'dots'].includes(source.background) ? source.background : 'plain',
    backgroundColor: /^#[0-9a-f]{6}$/i.test(source.backgroundColor ?? '') ? source.backgroundColor : '#0a0d14',
    blocks: (source.blocks ?? []).slice(0, NOTE_CANVAS_MAX_BLOCKS).map(normalizeBlock),
  };
}

function bound(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function normalizeBlock<T extends NoteCanvasBlock>(block: T): T {
  const geometry = {
    ...block,
    x: bound(block.x, 0, NOTE_CANVAS_MAX_EXTENT),
    y: bound(block.y, 0, NOTE_CANVAS_MAX_EXTENT),
    width: bound(block.width, MIN_BLOCK_WIDTH, 4_000),
    height: bound(block.height, MIN_BLOCK_HEIGHT, 4_000),
    zIndex: Math.round(bound(block.zIndex, 0, NOTE_CANVAS_MAX_BLOCKS * 4)),
  } as T;
  if (geometry.kind === 'image') return normalizeNoteImageBlock(geometry) as T;
  if (geometry.kind === 'media') return { ...geometry, memo: normalizeNoteMediaMemo(geometry.memo) } as T;
  if (geometry.kind !== 'ink') return geometry;
  const ink = geometry.ink ? normalizeNoteInkDocument(geometry.ink) : undefined;
  const svg = ink ? renderNoteInkSvg(ink) : sanitizeNoteInkSvg(geometry.svg) ?? '';
  return { ...geometry, ink, svg, recognizedText: ink?.recognition?.text ?? geometry.recognizedText?.slice(0, 16_384) } as T;
}

export type EmptyNoteCanvasBlockKind = Exclude<NoteCanvasBlock['kind'], 'media'>;

export function createCanvasBlock(kind: EmptyNoteCanvasBlockKind, x = 48, y = 48): NoteCanvasBlock {
  const base = { id: createNoteEntityId(`block-${kind}`), x, y, width: 320, height: 160, zIndex: 1 };
  switch (kind) {
    case 'text': return { ...base, kind, text: 'Start writing…' };
    case 'list': return { ...base, kind, items: ['First item', 'Second item'], checklist: false, ordered: false };
    case 'table': return { ...base, kind, rows: [['Column A', 'Column B'], ['Value', 'Value']] };
    case 'image': return normalizeNoteImageBlock({ ...base, kind, src: '', mimeType: 'image/png', altText: '', crop: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0, annotations: [] });
    case 'ink': { const ink = createEmptyNoteInkDocument(); return { ...base, kind, ink, svg: renderNoteInkSvg(ink), recognizedText: '' }; }
    case 'file': return { ...base, kind, attachmentId: '', name: 'Attachment', mimeType: 'application/octet-stream' };
    case 'embed': return { ...base, kind, title: 'Workspace Embed', reference: 'vgt://workspace/', frozen: true };
    case 'toggle': return { ...base, kind, title: 'Toggle', text: 'Collapsible content', collapsed: false };
  }
}

export function addCanvasBlock(canvas: NoteCanvasState | undefined, block: NoteCanvasBlock): NoteCanvasState {
  const state = normalizeNoteCanvas(canvas);
  if (state.blocks.length >= NOTE_CANVAS_MAX_BLOCKS) return state;
  const maxZ = state.blocks.reduce((max, item) => Math.max(max, item.zIndex), 0);
  return { ...state, blocks: [...state.blocks, normalizeBlock({ ...block, zIndex: maxZ + 1 })] };
}

export function updateCanvasBlock(canvas: NoteCanvasState | undefined, blockId: string, patch: Partial<NoteCanvasBlock>): NoteCanvasState {
  const state = normalizeNoteCanvas(canvas);
  return { ...state, blocks: state.blocks.map((block) => block.id === blockId ? normalizeBlock({ ...block, ...patch } as NoteCanvasBlock) : block) };
}

export function deleteCanvasBlock(canvas: NoteCanvasState | undefined, blockId: string): NoteCanvasState {
  const state = normalizeNoteCanvas(canvas);
  return { ...state, blocks: state.blocks.filter((block) => block.id !== blockId) };
}

export function moveCanvasBlockLayer(canvas: NoteCanvasState | undefined, blockId: string, direction: 'front' | 'back'): NoteCanvasState {
  const state = normalizeNoteCanvas(canvas);
  const target = state.blocks.find((block) => block.id === blockId);
  if (!target) return state;
  const extreme = direction === 'front'
    ? state.blocks.reduce((max, block) => Math.max(max, block.zIndex), 0) + 1
    : Math.min(...state.blocks.map((block) => block.zIndex), 0) - 1;
  const shifted = state.blocks.map((block) => block.id === blockId ? { ...block, zIndex: extreme } : block);
  const ordered = [...shifted].sort((a, b) => a.zIndex - b.zIndex).map((block, index) => ({ ...block, zIndex: index + 1 }));
  return { ...state, blocks: ordered };
}

export function blockFromAttachment(attachment: NoteAttachment, x = 48, y = 48): NoteCanvasBlock {
  const base = { id: createNoteEntityId('block-file'), x, y, width: 320, height: 180, zIndex: 1 };
  if (isSafeNoteImageMime(attachment.mimeType)) {
    return normalizeNoteImageBlock({ ...base, kind: 'image', src: attachment.dataUrl, mimeType: attachment.mimeType, altText: attachment.name, crop: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0, annotations: [] });
  }
  return { ...base, kind: 'file', attachmentId: attachment.id, name: attachment.name, mimeType: attachment.mimeType };
}

export function blockFromMediaMemo(memo: NoteMediaMemo, x = 72, y = 72): NoteCanvasBlock {
  const normalized = normalizeNoteMediaMemo(memo);
  return normalizeBlock({
    id: createNoteEntityId('block-media'),
    kind: 'media',
    x,
    y,
    width: normalized.kind === 'video' ? 520 : 420,
    height: normalized.kind === 'video' ? 390 : 300,
    zIndex: 1,
    memo: normalized,
  });
}

export function blockFromWorkspaceEmbed(workspace: NoteWorkspaceEmbedData, x = 88, y = 88): NoteCanvasBlock {
  return normalizeBlock({
    id: createNoteEntityId('block-embed'),
    kind: 'embed',
    x,
    y,
    width: 520,
    height: 340,
    zIndex: 1,
    title: workspace.title,
    reference: workspace.uri,
    frozen: workspace.mode === 'Frozen',
    workspace,
  });
}

export function resolveCanvasSize(canvas: NoteCanvasState): { width: number; minHeight: number } {
  if (canvas.pageMode === 'infinite') {
    const maxX = canvas.blocks.reduce((max, block) => Math.max(max, block.x + block.width), 0);
    const maxY = canvas.blocks.reduce((max, block) => Math.max(max, block.y + block.height), 0);
    return { width: Math.max(1100, maxX + 160), minHeight: Math.max(900, maxY + 240) };
  }
  if (canvas.pageSize === 'A4') return { width: 794, minHeight: 1123 };
  if (canvas.pageSize === 'Letter') return { width: 816, minHeight: 1056 };
  if (canvas.pageSize === 'A5') return { width: 559, minHeight: 794 };
  return { width: canvas.customWidthPx ?? 960, minHeight: canvas.customHeightPx ?? 1280 };
}

export function sanitizeNoteInkSvg(svg: string): string | null {
  const source = svg.trim();
  if (!source.startsWith('<svg') || source.length > 1_000_000) return null;
  if (/<\/?(?:script|foreignObject|iframe|object|embed)\b/i.test(source)) return null;
  if (/\son[a-z]+\s*=/i.test(source)) return null;
  if (/(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:|data:(?!image\/(?:png|jpeg|webp);))/i.test(source)) return null;
  return source;
}
