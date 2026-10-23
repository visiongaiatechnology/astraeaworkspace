// STATUS: DIAMANT VGT SUPREME — Central Writer modal focus and screen-reader boundary
import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])', 'a[href]', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
].join(',');

function isVisible(element: HTMLElement): boolean {
  const style = globalThis.getComputedStyle?.(element);
  return style ? style.display !== 'none' && style.visibility !== 'hidden' : true;
}

function activeDialog(host: HTMLElement): HTMLElement | null {
  const candidates = Array.from(host.querySelectorAll<HTMLElement>('[role="dialog"], .fixed.inset-0'))
    .filter(isVisible);
  return candidates.at(-1) ?? null;
}

function normalizeDialogSemantics(dialog: HTMLElement): void {
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
  if (dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
  const heading = dialog.querySelector<HTMLElement>('h1, h2, h3, [data-dialog-title]');
  if (heading) {
    if (!heading.id) heading.id = `writer-dialog-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  } else {
    dialog.setAttribute('aria-label', 'Astraea Writer Dialog');
  }
}

export function useWriterModalAccessibility(hostRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let previousFocus: HTMLElement | null = null;
    let currentDialog: HTMLElement | null = null;
    let raf = 0;

    const sync = () => {
      globalThis.cancelAnimationFrame?.(raf);
      raf = globalThis.requestAnimationFrame?.(() => {
        const nextDialog = activeDialog(host);
        if (nextDialog === currentDialog) return;
        if (!currentDialog && nextDialog) {
          const active = globalThis.document?.activeElement;
          previousFocus = active instanceof HTMLElement ? active : null;
        }
        currentDialog = nextDialog;
        if (!currentDialog) {
          if (previousFocus?.isConnected) previousFocus.focus();
          previousFocus = null;
          return;
        }
        normalizeDialogSemantics(currentDialog);
        const first = currentDialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (first ?? currentDialog).focus();
      }) ?? 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !currentDialog) return;
      const focusable = Array.from(currentDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
      if (focusable.length === 0) {
        event.preventDefault();
        currentDialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = globalThis.document?.activeElement;
      if (event.shiftKey && (active === first || active === currentDialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(host, { childList: true, subtree: true });
    globalThis.document?.addEventListener('keydown', onKeyDown, true);
    sync();
    return () => {
      globalThis.cancelAnimationFrame?.(raf);
      observer.disconnect();
      globalThis.document?.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [hostRef]);
}
