// STATUS: PLATIN
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

function isSequentiallyFocusable(element: HTMLElement, documentRef: Document): boolean {
  if (element.tabIndex < 0 || element.matches(':disabled')) return false;

  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (
      ancestor.hasAttribute('hidden') ||
      ancestor.hasAttribute('inert') ||
      ancestor.getAttribute('aria-hidden')?.toLowerCase() === 'true'
    ) {
      return false;
    }

    const style = documentRef.defaultView?.getComputedStyle(ancestor);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) {
      return false;
    }
  }

  return true;
}

function getSequentialFocusables(dialog: HTMLElement, documentRef: Document): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) =>
    isSequentiallyFocusable(element, documentRef),
  );
}

function focusWithoutScrolling(element: HTMLElement): void {
  element.focus({ preventScroll: true });
}

export function attachWhiteboardDialogFocus(
  documentRef: Document,
  dialog: HTMLElement,
  requestClose: () => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusables = getSequentialFocusables(dialog, documentRef);
    const currentIndex = focusables.indexOf(documentRef.activeElement as HTMLElement);
    if (focusables.length === 0) {
      event.preventDefault();
      focusWithoutScrolling(dialog);
    } else if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      focusWithoutScrolling(focusables[focusables.length - 1]);
    } else if (!event.shiftKey && (currentIndex < 0 || currentIndex === focusables.length - 1)) {
      event.preventDefault();
      focusWithoutScrolling(focusables[0]);
    }
  };

  const onFocusIn = (event: FocusEvent): void => {
    if (dialog.contains(event.target as Node)) return;
    const firstFocusable = getSequentialFocusables(dialog, documentRef)[0];
    focusWithoutScrolling(firstFocusable ?? dialog);
  };

  documentRef.addEventListener('keydown', onKeyDown, true);
  documentRef.addEventListener('focusin', onFocusIn, true);

  return () => {
    documentRef.removeEventListener('keydown', onKeyDown, true);
    documentRef.removeEventListener('focusin', onFocusIn, true);
  };
}

export function useWhiteboardDialogFocus(active: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const detachFocusManagement = attachWhiteboardDialogFocus(
      document,
      dialog,
      () => onCloseRef.current(),
    );
    focusWithoutScrolling(dialog);

    return () => {
      detachFocusManagement();
      if (previous?.isConnected) focusWithoutScrolling(previous);
    };
  }, [active]);

  return dialogRef;
}
