// STATUS: PLATIN — The toolbar's table-size chooser: one trigger, one popover, one grid.
//
// ## Why a popover and not a gallery in the ribbon
//
// The ribbon is a fixed row of 30-odd buttons; an 8 × 10 grid rendered inline would push every neighbour
// aside. The trigger therefore keeps the ribbon's size, and the grid appears anchored under it. The
// popover is **not** a dialog: it holds no state of its own and traps no focus. It does restore the focus
// to its trigger, which is the part of "close" a keyboard user actually needs.
//
// ## Why the panel stays in the DOM
//
// The panel is toggled with the `hidden` attribute rather than unmounted. `hidden` takes it out of the
// accessibility tree and out of the tab order exactly like an unmount, but the grid keeps its position
// and its labels, and a static render still shows which size choice the surface offers — the same reason
// the size grid is witnessable at all without a DOM runner.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Table as TableIcon } from 'lucide-react';
import { WriterTableSizeGrid } from './WriterTableSizeGrid';
import type { WriterTableSize } from './writerTableSize';

export interface WriterTableSizePickerProps {
  /** The trigger's accessible name, in the wording of the surface that mounts it. */
  readonly label: string;
  readonly gridLabel: string;
  readonly hint: string;
  readonly onPick: (size: WriterTableSize) => void;
  readonly disabled?: boolean;
  /** The trigger's classes, so the ribbon keeps one button style instead of a second one. */
  readonly buttonClass?: string;
}

export function WriterTableSizePicker({
  label,
  gridLabel,
  hint,
  onPick,
  disabled = false,
  buttonClass = '',
}: WriterTableSizePickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((restoreFocusToTrigger: boolean): void => {
    setOpen(false);
    if (restoreFocusToTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') close(true); };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      data-writer-table-size-picker={open ? 'open' : 'closed'}
    >
      <button
        type="button"
        ref={triggerRef}
        // WR-023/WR-025: the picker lives inside a `role="menu"` (toolbar menu and
        // context menu). Without a menu role the arrow keys of the surrounding menu
        // walked past it and the entry was invisible to a screen reader's menu list.
        role="menuitem"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        data-writer-table-size-trigger="true"
        onClick={() => setOpen((value) => !value)}
        className={`${buttonClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <TableIcon className="w-3.5 h-3.5 text-emerald-400" />
      </button>
      <div
        data-writer-table-size-popover={open ? 'open' : 'closed'}
        hidden={!open}
        className="absolute left-0 top-full z-40 mt-1 rounded-lg border border-white/15 bg-[#0c1220] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.9)]"
      >
        <WriterTableSizeGrid
          label={gridLabel}
          hint={hint}
          disabled={disabled}
          onPick={(size) => {
            close(true);
            onPick(size);
          }}
        />
      </div>
    </div>
  );
}
