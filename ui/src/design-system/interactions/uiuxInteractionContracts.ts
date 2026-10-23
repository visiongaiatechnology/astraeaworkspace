// STATUS: DIAMANT VGT SUPREME — pure UI/UX interaction contracts used by shell accessibility bridges.
export const TOOLTIP_INTENT_DELAY_MS = 300;

export interface UiRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function contextMenuPoint(rect: UiRectLike): { x: number; y: number } {
  return {
    x: Math.max(0, rect.left + Math.min(Math.max(0, rect.width) / 2, 24)),
    y: Math.max(0, rect.top + Math.min(Math.max(0, rect.height) / 2, 24)),
  };
}

export function nextCompositeIndex(currentIndex: number, length: number, key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'): number {
  if (!Number.isSafeInteger(length) || length < 1) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  const current = Math.min(length - 1, Math.max(0, Number.isFinite(currentIndex) ? Math.trunc(currentIndex) : 0));
  return key === 'ArrowDown' ? (current + 1) % length : (current - 1 + length) % length;
}
