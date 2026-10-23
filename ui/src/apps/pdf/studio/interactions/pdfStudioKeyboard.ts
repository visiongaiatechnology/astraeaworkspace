// STATUS: DIAMANT VGT SUPREME
// One pure resolver for PDF Studio keyboard semantics. Components only wire it to the DOM.
//
// Why a pure module: the studio used to answer exactly one shortcut (Ctrl+Z / Ctrl+Shift+Z, wired straight
// into a window listener in `studio/PdfStudio.tsx`). Page navigation, zoom and the search box were therefore
// mouse-only in the structured editor, which the accessibility layer of every other app in this workspace
// already forbids. Key semantics are a fact about the document and the viewport, not about React, so they
// live here and `PdfStudio.tsx` only performs the returned command.

import type { ActiveTool } from '../types';

export interface PdfStudioKeyboardContext {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** The event target is inside a text input, textarea, select or contenteditable host. */
  editableTarget: boolean;
}

export type PdfStudioCommand =
  | { kind: 'none' }
  | { kind: 'page-next' }
  | { kind: 'page-previous' }
  | { kind: 'page-first' }
  | { kind: 'page-last' }
  | { kind: 'zoom-in' }
  | { kind: 'zoom-out' }
  | { kind: 'zoom-reset' }
  | { kind: 'focus-search' }
  | { kind: 'copy-selection' }
  | { kind: 'tool'; tool: ActiveTool }
  | { kind: 'undo' }
  | { kind: 'redo' };

export const PDF_STUDIO_ZOOM_STEPS = Object.freeze([50, 75, 100, 125, 150, 200, 300, 400] as const);
export const PDF_STUDIO_MIN_ZOOM = PDF_STUDIO_ZOOM_STEPS[0];
export const PDF_STUDIO_MAX_ZOOM = PDF_STUDIO_ZOOM_STEPS[PDF_STUDIO_ZOOM_STEPS.length - 1];
export const PDF_STUDIO_MAX_PAGES = 10_000;

/** Alt+1 … Alt+6 select the annotation tools, in the order the toolbar shows them. */
const TOOL_SHORTCUTS: Readonly<Record<string, ActiveTool>> = Object.freeze({
  '1': 'select',
  '2': 'highlight',
  '3': 'underline',
  '4': 'strike',
  '5': 'comment',
  '6': 'redact',
});

/** Rounds into the supported zoom window. A non-finite or missing value falls back to 100 %. */
export function clampPdfStudioZoom(level: number): number {
  if (!Number.isFinite(level)) return 100;
  return Math.min(PDF_STUDIO_MAX_ZOOM, Math.max(PDF_STUDIO_MIN_ZOOM, Math.round(level)));
}

/**
 * The next zoom step in `direction`. Starting from a level that is not on the ladder (a typed value) the
 * next step above/below is chosen, so repeated presses never get stuck and the position stays stable.
 */
export function stepPdfStudioZoom(current: number, direction: 1 | -1): number {
  const bounded = clampPdfStudioZoom(current);
  if (direction > 0) return PDF_STUDIO_ZOOM_STEPS.find((step) => step > bounded) ?? bounded;
  const descending = [...PDF_STUDIO_ZOOM_STEPS].reverse();
  return descending.find((step) => step < bounded) ?? bounded;
}

export function clampPdfStudioPage(page: number, pageCount: number): number {
  const boundedCount = Number.isFinite(pageCount) ? Math.min(PDF_STUDIO_MAX_PAGES, Math.max(1, Math.trunc(pageCount))) : 1;
  if (!Number.isFinite(page)) return 1;
  return Math.min(boundedCount, Math.max(1, Math.trunc(page)));
}

export function stepPdfStudioPage(current: number, pageCount: number, delta: number): number {
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  return clampPdfStudioPage(clampPdfStudioPage(current, pageCount) + step, pageCount);
}

export function resolvePdfStudioShortcut(context: PdfStudioKeyboardContext): PdfStudioCommand {
  const withModifier = context.ctrlKey || context.metaKey;
  const key = context.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z stay reachable inside the document history even when a field has focus,
  // because the text fields of PDF Studio are annotation drafts, not the document itself.
  if (withModifier && !context.altKey && lower === 'z') {
    return { kind: context.shiftKey ? 'redo' : 'undo' };
  }

  // Inside a text field every remaining bare key belongs to that field.
  if (context.editableTarget) return { kind: 'none' };

  if (withModifier && !context.altKey) {
    if (lower === 'f') return { kind: 'focus-search' };
    if (lower === '0') return { kind: 'zoom-reset' };
    if (key === '=' || key === '+' || key === 'Add') return { kind: 'zoom-in' };
    if (key === '-' || key === '_' || key === 'Subtract') return { kind: 'zoom-out' };
    if (lower === 'c') return { kind: 'copy-selection' };
    if (key === 'Home') return { kind: 'page-first' };
    if (key === 'End') return { kind: 'page-last' };
    return { kind: 'none' };
  }

  if (context.altKey && !context.shiftKey && TOOL_SHORTCUTS[key]) {
    return { kind: 'tool', tool: TOOL_SHORTCUTS[key] };
  }

  if (key === 'PageDown') return { kind: 'page-next' };
  if (key === 'PageUp') return { kind: 'page-previous' };
  if (!context.altKey && key === 'Home') return { kind: 'page-first' };
  if (!context.altKey && key === 'End') return { kind: 'page-last' };

  return { kind: 'none' };
}

/** True when the key event must be prevented so the browser does not scroll or zoom instead. */
export function pdfStudioShortcutConsumesBrowserDefault(command: PdfStudioCommand): boolean {
  switch (command.kind) {
    case 'none':
      return false;
    case 'copy-selection':
      return false;
    default:
      return true;
  }
}
