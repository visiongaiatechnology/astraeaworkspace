// STATUS: DIAMANT VGT SUPREME — pure bounded zoom for the local attachment preview
//
// AST-0696 acceptance: "Asset aus Vault oder Datei in Notiz verlinken und previewen."
// A preview that cannot be zoomed is unusable for scans and dense PDFs. This module owns the bounded zoom
// arithmetic; the component only applies the returned CSS transform.

export const NOTE_PREVIEW_MIN_ZOOM = 0.5;
export const NOTE_PREVIEW_MAX_ZOOM = 4;
export const NOTE_PREVIEW_ZOOM_STEP = 0.25;

/** Previewable kinds that support zoom in the local viewer. */
export type NotePreviewZoomKind = 'image' | 'pdf';

export function supportsNotePreviewZoom(kind: 'image' | 'text' | 'pdf' | null): kind is NotePreviewZoomKind {
  return kind === 'image' || kind === 'pdf';
}

export function clampNotePreviewZoom(zoom: number): number {
  const safe = Number.isFinite(zoom) ? zoom : 1;
  return Math.max(NOTE_PREVIEW_MIN_ZOOM, Math.min(NOTE_PREVIEW_MAX_ZOOM, Math.round(safe * 100) / 100));
}

export function stepNotePreviewZoom(zoom: number, direction: 1 | -1): number {
  return clampNotePreviewZoom(clampNotePreviewZoom(zoom) + direction * NOTE_PREVIEW_ZOOM_STEP);
}

export interface NotePreviewZoomStyle {
  transform: string;
  transformOrigin: 'top center';
  /** PDF pages are laid out by the viewer, so their zoom must not squash the frame. */
  width?: string;
}

export function notePreviewZoomStyle(kind: NotePreviewZoomKind, zoom: number): NotePreviewZoomStyle {
  const safe = clampNotePreviewZoom(zoom);
  if (kind === 'pdf') return { transform: `scale(${safe})`, transformOrigin: 'top center', width: `${100 / safe}%` };
  return { transform: `scale(${safe})`, transformOrigin: 'top center' };
}

export function formatNotePreviewZoom(zoom: number): string {
  return `${Math.round(clampNotePreviewZoom(zoom) * 100)}%`;
}
