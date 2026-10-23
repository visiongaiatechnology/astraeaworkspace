// STATUS: DIAMANT VGT SUPREME — Canonical Writer view-mode domain
import type { ViewMode } from '../../types';

export type WriterContentViewMode = Exclude<ViewMode, 'focus'>;

export const WRITER_VIEW_MODES = [
  'print',
  'continuous',
  'draft',
  'outline',
  'reading',
  'focus',
] as const satisfies readonly ViewMode[];

const WRITER_VIEW_MODE_SET: ReadonlySet<string> = new Set(WRITER_VIEW_MODES);

export function isWriterViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && WRITER_VIEW_MODE_SET.has(value);
}

export function normalizeWriterViewMode(value: unknown): ViewMode {
  return isWriterViewMode(value) ? value : 'print';
}

export function resolveWriterContentViewMode(
  viewMode: ViewMode,
  focusBaseMode: WriterContentViewMode,
): WriterContentViewMode {
  return viewMode === 'focus' ? focusBaseMode : viewMode;
}

export function resolveWriterFocusBaseMode(
  persistedMode: unknown,
): WriterContentViewMode {
  const normalized = normalizeWriterViewMode(persistedMode);
  return normalized === 'focus' ? 'print' : normalized;
}

export function writerViewModeIsReadOnly(viewMode: WriterContentViewMode): boolean {
  return viewMode === 'reading';
}

export interface WriterViewModeTransition {
  viewMode: ViewMode;
  focusBaseMode: WriterContentViewMode;
  persistedMode?: WriterContentViewMode;
}

export function resolveWriterViewModeTransition(
  currentMode: ViewMode,
  focusBaseMode: WriterContentViewMode,
  requestedMode: unknown,
): WriterViewModeTransition {
  const normalizedMode = normalizeWriterViewMode(requestedMode);
  if (normalizedMode === 'focus') {
    return {
      viewMode: 'focus',
      focusBaseMode: currentMode === 'focus' ? focusBaseMode : currentMode,
    };
  }
  return {
    viewMode: normalizedMode,
    focusBaseMode: normalizedMode,
    persistedMode: normalizedMode,
  };
}
