// STATUS: PLATIN — Labelled toolbar menus (WR-023 / WR-025)
//
// ## Why this exists
//
// The toolbar used to hide roughly thirty rare commands behind a single "more tools"
// toggle, and even then they appeared as an unlabelled wall of icons. At 1366 × 768
// that is neither readable nor operable by keyboard: a user cannot tell `Ω` from `fn¹`
// without hovering, and a screen reader hears thirty identical "button"s.
//
// These menus are the answer the reconstruction plan asks for: **labelled**
// disclosures in the primary row (`Einfügen ▾`, `Format ▾`, `Werkzeuge & Ansicht ▾`)
// whose entries carry a name, an icon, a shortcut and a tooltip — and which are fully
// keyboard operable.
//
// ## Why the panel stays mounted
//
// A closed panel is `hidden`, not unmounted. `hidden` removes it from the tab order
// and from the accessibility tree (which is what WR-025 requires), while keeping the
// whole command surface present for the static-markup contracts that prove every
// action is still reachable.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Returns the focus to the writing surface after the menu closes. */
function focusWritingSurface(): void {
  const surface = globalThis.document?.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  const target = surface ?? globalThis.document?.querySelector<HTMLElement>('[data-writer-flow-item] textarea');
  if (!target) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

export interface WriterToolbarMenuProps {
  /** Stable id used for `aria-controls` and as the DOM marker. */
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  /** Optional extra class for the panel width. */
  readonly panelClassName?: string;
}

export const WriterToolbarMenu: React.FC<WriterToolbarMenuProps> = ({
  id,
  label,
  icon,
  open,
  onToggle,
  onClose,
  children,
  panelClassName = 'w-64',
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const enabledEntries = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .filter((entry) => !(entry as HTMLButtonElement).disabled && entry.closest('[hidden]') === null);
  }, []);

  const focusEntry = (index: number): void => {
    const entries = enabledEntries();
    if (entries.length === 0) return;
    const bounded = ((index % entries.length) + entries.length) % entries.length;
    entries[bounded]?.focus();
  };

  // A click outside closes the menu; the writing surface gets the focus back only
  // when the user did not click somewhere else on purpose.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [onClose, open]);

  // Opening moves the focus into the panel, so `ArrowDown` from the trigger lands on
  // the first command instead of nowhere.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => focusEntry(0));
  }, [open]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) onToggle();
      else focusEntry(0);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
    }
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const entries = enabledEntries();
    const current = entries.indexOf(event.target as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') {
      // Leaving the menu closes it; the browser keeps its own tab order.
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusEntry(current + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusEntry(current <= 0 ? entries.length - 1 : current - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusEntry(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusEntry(entries.length - 1);
    }
  };

  return (
    <div className="relative" data-writer-toolbar-menu-root={id}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={id}
        data-writer-toolbar-menu-trigger={id}
        title={label}
        onClick={onToggle}
        onKeyDown={handleTriggerKeyDown}
        className={`flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors ${
          open
            ? 'border-blue-500/50 bg-blue-600/30 text-blue-200'
            : 'border-white/10 bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        {icon}
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown aria-hidden="true" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        ref={panelRef}
        id={id}
        role="menu"
        aria-label={label}
        hidden={!open}
        data-writer-toolbar-menu={id}
        data-writer-toolbar-menu-open={open ? 'true' : 'false'}
        onKeyDown={handlePanelKeyDown}
        className={`absolute left-0 top-full z-40 mt-1 ${panelClassName} max-h-[70vh] overflow-y-auto rounded-xl border border-slate-700 bg-[#0c1220] p-1.5 font-sans text-xs text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.95)] ring-1 ring-white/15`}
      >
        {children}
      </div>
    </div>
  );
};

export interface WriterToolbarMenuItemProps {
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly shortcut?: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly anchor?: string;
  /** Extra DOM marker kept for the existing contracts. */
  readonly dataAction?: string;
  /** Close the menu and return the focus to the writing surface. */
  readonly onExecuted: () => void;
}

/**
 * One command inside a toolbar menu: name, icon, shortcut, tooltip.
 *
 * It is a `role="menuitem"` because the panel is a menu; the click both executes and
 * closes, and the focus goes back to the writing surface so the user can continue
 * typing immediately.
 */
export const WriterToolbarMenuItem: React.FC<WriterToolbarMenuItemProps> = ({
  label,
  icon,
  shortcut,
  onClick,
  disabled = false,
  anchor,
  dataAction,
  onExecuted,
}) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    aria-disabled={disabled ? 'true' : undefined}
    title={shortcut ? `${label} (${shortcut})` : label}
    data-vgt-app-guide-anchor={anchor}
    data-writer-toolbar-menu-action={dataAction}
    onClick={() => {
      if (disabled || !onClick) return;
      onClick();
      onExecuted();
      focusWritingSurface();
    }}
    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
      disabled
        ? 'cursor-not-allowed text-slate-500'
        : 'text-slate-200 hover:bg-blue-600/20 hover:text-white'
    }`}
  >
    <span className="shrink-0">{icon}</span>
    <span className="flex-1 truncate">{label}</span>
    {shortcut && <span className="shrink-0 font-mono text-[0.625rem] text-slate-400">{shortcut}</span>}
  </button>
);

/** A heading inside a toolbar menu. */
export const WriterToolbarMenuGroup: React.FC<{ readonly label: string; readonly children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div role="group" aria-label={label} data-writer-toolbar-menu-group={label} className="mb-1">
    <div className="px-2 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-slate-500">{label}</div>
    {children}
  </div>
);

/** Local state helper so the toolbar does not need three booleans. */
export function useWriterToolbarMenuState(): {
  openMenu: string | null;
  toggle: (id: string) => void;
  close: () => void;
} {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  return {
    openMenu,
    toggle: (id: string) => setOpenMenu((current) => (current === id ? null : id)),
    close: () => setOpenMenu(null),
  };
}
