// STATUS: DIAMANT VGT SUPREME — pure note-page → canvas card transfer
//
// AST-0686 acceptance: "Notiz in freie Canvas ziehen, verschieben und als Karte verknuepfen."
// Dragging a note from the page list onto the canvas creates a card that links back to the source note via
// the canonical [[wiki link]] syntax, so the knowledge graph picks the relation up without a second link
// model. The payload is Notes-internal and bounded; it is deliberately *not* the cross-app Fabric drag
// payload (`shared/workspace-interaction`), which describes canonical Workspace objects, not note pages.

import type { NoteCanvasState, NotePage } from '../../../shared/contracts/workspace';
import { NOTE_CANVAS_MAX_BLOCKS, addCanvasBlock, normalizeNoteCanvas } from './notesCanvasModel';

export const NOTE_PAGE_DRAG_MIME = 'application/x-astraea-notes-page';
export const NOTE_PAGE_DRAG_SCHEMA = 'astraea.notes.page' as const;
export const NOTE_PAGE_DRAG_MAX_BYTES = 512;
const MAX_TITLE_LENGTH = 240;

export interface NotePageDragPayload {
  schema: typeof NOTE_PAGE_DRAG_SCHEMA;
  pageId: string;
  title: string;
}

/** Builds the bounded drag payload for one note page. */
export function createNotePageDragPayload(page: Pick<NotePage, 'id' | 'title'>): NotePageDragPayload {
  return {
    schema: NOTE_PAGE_DRAG_SCHEMA,
    pageId: String(page.id ?? '').slice(0, 160),
    title: String(page.title ?? '').normalize('NFKC').slice(0, MAX_TITLE_LENGTH),
  };
}

export function serializeNotePageDragPayload(payload: NotePageDragPayload): string {
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > NOTE_PAGE_DRAG_MAX_BYTES) {
    throw new Error('The note drag payload exceeds its size limit.');
  }
  return serialized;
}

/** Strict, fail-closed parse of an untrusted drop payload. Returns `null` instead of throwing. */
export function parseNotePageDragPayload(raw: string | null | undefined): NotePageDragPayload | null {
  if (typeof raw !== 'string' || !raw.length || raw.length > NOTE_PAGE_DRAG_MAX_BYTES * 2) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (Object.keys(candidate).length !== 3) return null;
  if (candidate.schema !== NOTE_PAGE_DRAG_SCHEMA) return null;
  if (typeof candidate.pageId !== 'string' || !candidate.pageId.length || candidate.pageId.length > 160) return null;
  if (typeof candidate.title !== 'string' || candidate.title.length > MAX_TITLE_LENGTH) return null;
  return { schema: NOTE_PAGE_DRAG_SCHEMA, pageId: candidate.pageId, title: candidate.title.normalize('NFKC') };
}

/**
 * Creates the canvas card for a dropped note page: a text block whose body is the canonical [[link]] to
 * the source note. `null` when the canvas is already at its block bound, so the caller can say so instead
 * of silently dropping the gesture.
 */
export function addNotePageCard(
  canvas: NoteCanvasState | undefined,
  payload: NotePageDragPayload,
  position: { x: number; y: number },
): NoteCanvasState | null {
  const state = normalizeNoteCanvas(canvas);
  if (state.blocks.length >= NOTE_CANVAS_MAX_BLOCKS) return null;
  const title = payload.title.trim() || 'Untitled Note';
  const x = Math.max(0, Math.round(Number.isFinite(position.x) ? position.x : 56));
  const y = Math.max(0, Math.round(Number.isFinite(position.y) ? position.y : 56));
  const block = {
    id: `block-note-${payload.pageId}`,
    kind: 'text' as const,
    x,
    y,
    width: 320,
    height: 160,
    zIndex: 1,
    text: `[[${title}]]`,
  };
  return addCanvasBlock(state, block);
}

/** The link text a card carries, exposed so the UI can describe the drop in its visible feedback. */
export function notePageCardLinkText(payload: NotePageDragPayload): string {
  return `[[${payload.title.trim() || 'Untitled Note'}]]`;
}
