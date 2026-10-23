// STATUS: PLATIN
// Bounded acceptance policy for files dropped onto the Whiteboard canvas.
//
// The former handler read `dataTransfer.files.item(0)` and ignored every other dropped file, and it
// accepted nothing it could not classify without saying so. Both are silent truncation. This module
// classifies and validates the *whole* drop first: either every file is inside the local import
// budget and gets inserted, or the drop is rejected with a named reason that the canvas shows.

import {
  WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES,
  WHITEBOARD_IMAGE_MAX_BYTES,
  WHITEBOARD_SVG_MAX_BYTES,
} from '../model/whiteboardObjectEngine';
import { WHITEBOARD_INTERCHANGE_LIMITS } from '../interchange/whiteboardExportImportEngine';

export const WHITEBOARD_DROP_MAX_FILES = 8;
export const WHITEBOARD_DROP_MAX_TOTAL_BYTES = 160 * 1024 * 1024;

export type WhiteboardDropClassification = 'image' | 'svg' | 'pdf' | 'media' | 'unsupported';

export interface WhiteboardDropFileLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface WhiteboardDropEntry {
  readonly index: number;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly classification: Exclude<WhiteboardDropClassification, 'unsupported'>;
}

export type WhiteboardDropPlan =
  | { readonly ok: true; readonly entries: WhiteboardDropEntry[] }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

export interface WhiteboardDropLimits {
  readonly maxFiles?: number;
  readonly maxTotalBytes?: number;
}

const MEDIA_MIMES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm'];
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

/** Classification is by declared MIME first, then by extension — never by trusting the name alone. */
export function classifyWhiteboardDropFile(file: WhiteboardDropFileLike): WhiteboardDropClassification {
  const type = typeof file?.type === 'string' ? file.type.toLowerCase() : '';
  const extension = extensionOf(typeof file?.name === 'string' ? file.name : '');
  if (type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (type === 'image/svg+xml' || extension === 'svg') return 'svg';
  if (IMAGE_MIMES.includes(type) || ['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return 'image';
  if (MEDIA_MIMES.includes(type) || ['mp3', 'wav', 'ogg', 'mp4', 'webm'].includes(extension)) return 'media';
  return 'unsupported';
}

function byteBudgetFor(classification: Exclude<WhiteboardDropClassification, 'unsupported'>): number {
  if (classification === 'svg') return WHITEBOARD_SVG_MAX_BYTES;
  if (classification === 'pdf') return WHITEBOARD_INTERCHANGE_LIMITS.maxPdfBytes;
  if (classification === 'media') return WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES;
  return WHITEBOARD_IMAGE_MAX_BYTES;
}

/** True when a drag payload could become a Whiteboard object; used for the hover target preview. */
export function isWhiteboardFileDrag(types: readonly string[] | undefined): boolean {
  return Array.isArray(types) && (types.includes('Files') || types.includes('application/x-moz-file'));
}

/**
 * Validates an entire drop. Rejects — with a machine-readable `reason` and the offending `detail` —
 * instead of inserting part of the payload.
 */
export function planWhiteboardDrop(
  files: readonly WhiteboardDropFileLike[] | undefined,
  limits: WhiteboardDropLimits = {},
): WhiteboardDropPlan {
  const maxFiles = Number.isFinite(limits.maxFiles) ? Math.max(1, Math.trunc(limits.maxFiles as number)) : WHITEBOARD_DROP_MAX_FILES;
  const maxTotalBytes = Number.isFinite(limits.maxTotalBytes)
    ? Math.max(1, Math.trunc(limits.maxTotalBytes as number))
    : WHITEBOARD_DROP_MAX_TOTAL_BYTES;
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) return { ok: false, reason: 'empty', detail: '' };
  if (list.length > maxFiles) return { ok: false, reason: 'too-many-files', detail: String(list.length) };

  const entries: WhiteboardDropEntry[] = [];
  let totalBytes = 0;
  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    const name = typeof file?.name === 'string' ? file.name : '';
    const size = Number.isFinite(file?.size) ? Math.max(0, Math.trunc(file.size)) : 0;
    const classification = classifyWhiteboardDropFile({ name, type: file?.type ?? '', size });
    if (classification === 'unsupported') return { ok: false, reason: 'unsupported-file', detail: name.slice(0, 200) };
    if (size <= 0) return { ok: false, reason: 'empty-file', detail: name.slice(0, 200) };
    if (size > byteBudgetFor(classification)) return { ok: false, reason: 'file-too-large', detail: name.slice(0, 200) };
    totalBytes += size;
    if (totalBytes > maxTotalBytes) return { ok: false, reason: 'total-too-large', detail: String(totalBytes) };
    entries.push({ index, name: name.slice(0, 240), type: file?.type ?? '', size, classification });
  }
  return { ok: true, entries };
}
