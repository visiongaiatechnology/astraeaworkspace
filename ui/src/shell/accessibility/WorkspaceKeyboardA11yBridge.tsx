// STATUS: DIAMANT VGT SUPREME — suite-wide keyboard navigation and keyboard-context-menu bridge.
import React, { useEffect } from 'react';
import { contextMenuPoint, nextCompositeIndex } from '../../design-system/interactions/uiuxInteractionContracts';

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"]), [role="option"]:not([aria-disabled="true"])';

function usableItems(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter((item) => {
    const style = window.getComputedStyle(item);
    return style.display !== 'none' && style.visibility !== 'hidden' && !item.hasAttribute('disabled');
  });
}

function focusItem(items: HTMLElement[], index: number): void {
  if (!items.length) return;
  items[((index % items.length) + items.length) % items.length]?.focus();
}

export const WorkspaceKeyboardA11yBridge: React.FC = () => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
        if (!active || active === document.body) return;
        event.preventDefault();
        const point = contextMenuPoint(active.getBoundingClientRect());
        active.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: point.x,
          clientY: point.y,
        }));
        return;
      }

      if (event.defaultPrevented || !active) return;
      const container = active.closest('[role="menu"], [role="listbox"]');
      if (!container) return;
      const items = usableItems(container);
      if (!items.length) return;
      const currentIndex = Math.max(0, items.indexOf(active));

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusItem(items, nextCompositeIndex(currentIndex, items.length, 'ArrowDown'));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusItem(items, nextCompositeIndex(currentIndex, items.length, 'ArrowUp'));
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusItem(items, nextCompositeIndex(currentIndex, items.length, 'Home'));
      } else if (event.key === 'End') {
        event.preventDefault();
        focusItem(items, nextCompositeIndex(currentIndex, items.length, 'End'));
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        active.click();
      } else if (event.key === 'ArrowRight' && active.getAttribute('aria-haspopup')) {
        event.preventDefault();
        active.click();
        window.requestAnimationFrame(() => {
          const popupId = active.getAttribute('aria-controls');
          const popup = popupId ? document.getElementById(popupId) : document.querySelector<HTMLElement>('[role="menu"] [role="menu"]');
          const first = popup ? usableItems(popup)[0] : null;
          first?.focus();
        });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        const triggerId = container.getAttribute('aria-labelledby');
        if (triggerId) document.getElementById(triggerId)?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);
  return null;
};
