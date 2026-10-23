// STATUS: PLATIN — keyboard focus containment for the Present start dialog.
//
// A modal dialog must not let Tab escape into the editor behind it, must place focus inside on open
// and must return it to the trigger on close. Both rules live here so they are testable without a
// browser layout engine.
export const PRESENT_DIALOG_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function presentDialogFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(PRESENT_DIALOG_FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

export interface PresentDialogFocusKeyEvent {
  readonly key: string;
  readonly shiftKey?: boolean;
  preventDefault?: () => void;
}

/**
 * Moves focus with Tab/Shift+Tab inside the dialog and wraps at both ends.
 * Returns `true` when the event was consumed; `false` for every other key.
 */
export function cyclePresentDialogFocus(
  event: PresentDialogFocusKeyEvent,
  container: HTMLElement | null,
  activeElement: Element | null,
): boolean {
  if (event.key !== 'Tab') return false;
  const focusable = presentDialogFocusable(container);
  if (focusable.length === 0) return false;
  event.preventDefault?.();
  const activeIndex = activeElement instanceof HTMLElement ? focusable.indexOf(activeElement) : -1;
  let nextIndex: number;
  if (event.shiftKey) nextIndex = activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1;
  else nextIndex = activeIndex < 0 || activeIndex >= focusable.length - 1 ? 0 : activeIndex + 1;
  focusable[nextIndex]?.focus();
  return true;
}
