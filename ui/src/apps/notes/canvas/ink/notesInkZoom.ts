// STATUS: DIAMANT VGT SUPREME — pure lossless zoom for the vector ink surface
//
// AST-0691 acceptance: "Ink-Strokes aufnehmen und nach Zoom verlustfrei anzeigen."
// The ink document is vector geometry; zoom is therefore a `viewBox` transform over the *unmodified*
// stroke data, never a resample. This module owns the arithmetic and the bounds.

import type { NoteInkDocument } from '../../../../shared/contracts/notes-pdf/workspaceNotes';

export const NOTE_INK_MIN_ZOOM = 0.5;
export const NOTE_INK_MAX_ZOOM = 4;
export const NOTE_INK_ZOOM_STEP = 0.25;

export interface NoteInkViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
  zoom: number;
}

export function clampInkZoom(zoom: number): number {
  const safe = Number.isFinite(zoom) ? zoom : 1;
  return Math.max(NOTE_INK_MIN_ZOOM, Math.min(NOTE_INK_MAX_ZOOM, Math.round(safe * 100) / 100));
}

export function stepInkZoom(zoom: number, direction: 1 | -1, coarse = false): number {
  const step = coarse ? NOTE_INK_ZOOM_STEP * 4 : NOTE_INK_ZOOM_STEP;
  return clampInkZoom(clampInkZoom(zoom) + direction * step);
}

/**
 * View box for the given zoom, centred on the document.
 * Zoom 1 returns the full document, so an unzoomed surface renders byte-identical strokes as before.
 */
export function resolveInkViewBox(document: Pick<NoteInkDocument, 'width' | 'height'>, zoom: number): NoteInkViewBox {
  const safeZoom = clampInkZoom(zoom);
  const width = Math.max(1, Number.isFinite(document.width) ? document.width : 1);
  const height = Math.max(1, Number.isFinite(document.height) ? document.height : 1);
  const visibleWidth = width / safeZoom;
  const visibleHeight = height / safeZoom;
  return {
    minX: (width - visibleWidth) / 2,
    minY: (height - visibleHeight) / 2,
    width: visibleWidth,
    height: visibleHeight,
    zoom: safeZoom,
  };
}

export function formatInkViewBox(box: NoteInkViewBox): string {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return `${round(box.minX)} ${round(box.minY)} ${round(box.width)} ${round(box.height)}`;
}

/**
 * Screen-space pan in document units. Bounded to the visible band so a pan can never scroll the drawing
 * out of view: `minX` stays inside `[0, document.width - box.width]`.
 */
export function panInkViewBox(box: NoteInkViewBox, document: Pick<NoteInkDocument, 'width' | 'height'>, dxScreen: number, dyScreen: number, renderedWidth: number): NoteInkViewBox {
  if (!renderedWidth || renderedWidth <= 0) return box;
  const scale = box.width / renderedWidth;
  const maxX = Math.max(0, document.width - box.width);
  const maxY = Math.max(0, document.height - box.height);
  return {
    ...box,
    minX: Math.max(0, Math.min(maxX, box.minX + dxScreen * scale)),
    minY: Math.max(0, Math.min(maxY, box.minY + dyScreen * scale)),
  };
}
