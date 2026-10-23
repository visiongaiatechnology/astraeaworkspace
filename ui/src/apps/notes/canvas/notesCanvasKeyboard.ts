// STATUS: DIAMANT VGT SUPREME — pure keyboard geometry for free-positioned canvas cards
//
// AST-0686 acceptance: "Notiz in freie Canvas ziehen, verschieben und als Karte verknuepfen."
// Moving a card was pointer-only. This module owns the keyboard arithmetic and reuses the *same* bounds as
// `normalizeBlock`, so a keyboard move can never place a card outside the canvas extent or under the
// minimum size.

import type { NoteCanvasBlock } from '../../../shared/contracts/workspace';
import { NOTE_CANVAS_MAX_EXTENT } from './notesCanvasModel';

export const NOTE_CANVAS_KEYBOARD_STEP = 8;
export const NOTE_CANVAS_KEYBOARD_COARSE_STEP = 48;
export const NOTE_CANVAS_MIN_WIDTH = 120;
export const NOTE_CANVAS_MIN_HEIGHT = 56;

export type NoteCanvasMoveDirection = 'left' | 'right' | 'up' | 'down';

export interface NoteCanvasKeyboardState {
  block: Pick<NoteCanvasBlock, 'x' | 'y' | 'width' | 'height'>;
  shiftKey: boolean;
  /** A coarse modifier takes precedence so Alt+Arrow never silently falls back to the fine step. */
  altKey: boolean;
}

/**
 * Resolves one arrow key into a move patch.
 * Returns `null` for a key that is not a movement key, so the component owns no direction table.
 */
/** A non-finite or non-positive dimension is treated as zero, so a hostile geometry cannot poison the clamp. */
function safeSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function resolveCanvasMovePatch(
  direction: string,
  state: NoteCanvasKeyboardState,
): { x: number } | { y: number } | null {
  const step = state.altKey ? NOTE_CANVAS_KEYBOARD_COARSE_STEP : NOTE_CANVAS_KEYBOARD_STEP;
  const maxX = Math.max(0, NOTE_CANVAS_MAX_EXTENT - safeSize(state.block.width));
  const maxY = Math.max(0, NOTE_CANVAS_MAX_EXTENT - safeSize(state.block.height));
  const clampedX = clamp(state.block.x, 0, maxX);
  const clampedY = clamp(state.block.y, 0, maxY);
  switch (direction) {
    case 'ArrowLeft': return { x: clamp(clampedX - step, 0, maxX) };
    case 'ArrowRight': return { x: clamp(clampedX + step, 0, maxX) };
    case 'ArrowUp': return { y: clamp(clampedY - step, 0, maxY) };
    case 'ArrowDown': return { y: clamp(clampedY + step, 0, maxY) };
    default: return null;
  }
}

/**
 * Resolves one Shift+arrow key into a resize patch, bounded exactly like the pointer resize grip:
 * never below the minimum size, never above the canvas extent.
 */
export function resolveCanvasResizePatch(
  direction: string,
  state: NoteCanvasKeyboardState,
): { width?: number; height?: number } | null {
  const step = state.altKey ? NOTE_CANVAS_KEYBOARD_COARSE_STEP : NOTE_CANVAS_KEYBOARD_STEP;
  const maxWidth = Math.max(NOTE_CANVAS_MIN_WIDTH, NOTE_CANVAS_MAX_EXTENT - clamp(state.block.x, 0, NOTE_CANVAS_MAX_EXTENT));
  const maxHeight = Math.max(NOTE_CANVAS_MIN_HEIGHT, NOTE_CANVAS_MAX_EXTENT - clamp(state.block.y, 0, NOTE_CANVAS_MAX_EXTENT));
  const width = clamp(safeSize(state.block.width) || NOTE_CANVAS_MIN_WIDTH, NOTE_CANVAS_MIN_WIDTH, maxWidth);
  const height = clamp(safeSize(state.block.height) || NOTE_CANVAS_MIN_HEIGHT, NOTE_CANVAS_MIN_HEIGHT, maxHeight);
  switch (direction) {
    case 'ArrowLeft': return { width: clamp(width - step, NOTE_CANVAS_MIN_WIDTH, maxWidth) };
    case 'ArrowRight': return { width: clamp(width + step, NOTE_CANVAS_MIN_WIDTH, maxWidth) };
    case 'ArrowUp': return { height: clamp(height - step, NOTE_CANVAS_MIN_HEIGHT, maxHeight) };
    case 'ArrowDown': return { height: clamp(height + step, NOTE_CANVAS_MIN_HEIGHT, maxHeight) };
    default: return null;
  }
}

export type NoteCanvasKeyboardCommand =
  | { type: 'move'; patch: { x: number } | { y: number } }
  | { type: 'resize'; patch: { width?: number; height?: number } }
  | { type: 'remove' }
  | { type: 'select-next'; delta: 1 | -1 }
  | { type: 'deselect' };

export interface NoteCanvasKeyEvent {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}

/**
 * One decision function for every canvas keyboard meaning, so move, resize, delete and focus order cannot
 * drift apart. Ctrl/Meta combinations are left to the browser and the shell.
 */
export function resolveCanvasKeyboardCommand(
  event: NoteCanvasKeyEvent,
  state: NoteCanvasKeyboardState,
): NoteCanvasKeyboardCommand | null {
  if (event.isComposing) return null;
  if (event.ctrlKey || event.metaKey) return null;
  if (event.key === 'Delete' || event.key === 'Backspace') return { type: 'remove' };
  if (event.key === 'Escape') return { type: 'deselect' };
  if (event.key === 'Tab') return { type: 'select-next', delta: event.shiftKey ? -1 : 1 };
  if (event.shiftKey) {
    const patch = resolveCanvasResizePatch(event.key, state);
    return patch ? { type: 'resize', patch } : null;
  }
  const patch = resolveCanvasMovePatch(event.key, state);
  return patch ? { type: 'move', patch } : null;
}

/**
 * Focus order for Tab / Shift+Tab: the next block in z-order, wrapping at both ends. Returns `null` when
 * there is nothing to move to, so the caller leaves the browser's own focus handling alone.
 */
export function nextCanvasBlockId(
  blocks: readonly Pick<NoteCanvasBlock, 'id' | 'zIndex'>[],
  currentBlockId: string | null,
  delta: 1 | -1,
): string | null {
  if (!blocks.length) return null;
  const ordered = [...blocks].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  if (!currentBlockId) return ordered[delta > 0 ? 0 : ordered.length - 1].id;
  const index = ordered.findIndex((block) => block.id === currentBlockId);
  if (index < 0) return ordered[0].id;
  const next = index + delta;
  if (next < 0 || next >= ordered.length) return null;
  return ordered[next].id;
}

function clamp(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, safe));
}
