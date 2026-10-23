// STATUS: DIAMANT VGT SUPREME
// Astraea Grid — the **visible** column-header AutoFilter entry (AST-0391).
//
// What this closes: `data/gridAutoFilter.ts` was a value model with a single production caller — the Slicer
// *modal*, a different place. A model is not a visible entry; a handler is not a visible entry; an import is
// not a visible entry. This component renders one, in the column header itself, and it uses the existing
// bounded model rather than a second enumeration.
//
// Two renderers, one component and **one** implementation:
//  * `GridTableCanvas` renders a real DOM `<table>`; the entry lives inside the `<th>`, which is already
//    `position: relative`, so the host needs no positioning at all.
//  * `GridVirtualCanvas` draws its headers onto a real `<canvas>`, so a DOM control cannot live *in* it. That
//    host positions this component over the canvas header band using the geometry model that already exists
//    (`colScale.offset`, `HEADER_ROW_HEIGHT`). The component itself has no variant: the host owns placement.
//
// Reachability, stated honestly: `ui/` ships no jsdom, no happy-dom and no `@testing-library`, and
// `renderToStaticMarkup` never re-renders and dispatches no event. The markup of this component can be
// asserted; the interaction (click, keyboard, focus) is NOT_TESTED — see the report.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import type { GridCell, GridFilterRule } from '../../../shared/contracts/grid/workspaceGrid';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_DATA_COPY } from '../locale/gridDataLocale';
import { GRID_ANALYSIS_COPY } from '../locale/gridAnalysisLocale';
import {
  autoFilterOptionLabel,
  buildAutoFilterMenu,
  hasAutoFilterRule,
  resetAutoFilterColumnAction,
  searchAutoFilterOptions,
  selectAllAutoFilterOptionsAction,
  toggleAutoFilterOptionAction,
  type AutoFilterAction,
} from './gridAutoFilterControl';

export interface GridAutoFilterDropdownProps {
  /** Column letter, e.g. `A`. */
  column: string;
  cells: Readonly<Record<string, GridCell>>;
  rowCount: number;
  rules: readonly GridFilterRule[];
  /** Writes the **whole** sheet rule list back; the sheet's own access-checked patch path is the caller's. */
  onUpdateRules: (rules: readonly GridFilterRule[]) => void;
  /** Set by the sheet when filtering is forbidden (protection): a visible entry must also be visibly off. */
  disabled?: boolean;
}

export const GridAutoFilterDropdown: React.FC<GridAutoFilterDropdownProps> = ({
  column,
  cells,
  rowCount,
  rules,
  onUpdateRules,
  disabled = false,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_DATA_COPY[locale].autoFilterMenu;
  const blanks = GRID_ANALYSIS_COPY[locale].slicer.blanks;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const columnHasFilter = useMemo(() => hasAutoFilterRule(rules, column), [rules, column]);
  const hasDataRows = rowCount > 1;
  const enabled = !disabled && hasDataRows;

  /**
   * The value enumeration is O(data rows) and is therefore built **only while the menu is open** — never for
   * every column header on every render of the sheet.
   */
  const menu = useMemo(
    () => (open ? buildAutoFilterMenu({ cells, rowCount, column, rules, blankLabel: blanks }) : null),
    [blanks, cells, column, open, rowCount, rules],
  );

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setQuery('');
    setNotice(null);
    setActiveIndex(0);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
    setQuery('');
    setNotice(null);
    setActiveIndex(0);
  }, []);

  // Focus moves into the popup on open and back to the trigger on close — the restoration half of the rule.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Click outside closes. The trigger's own click is excluded, otherwise opening would immediately close.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      closeMenu(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [closeMenu, open]);

  const options = useMemo(
    () => (menu?.ok ? searchAutoFilterOptions(menu.menu, query) : { shown: [], hidden: 0 }),
    [menu, query],
  );

  const apply = useCallback((action: AutoFilterAction) => {
    if (!action.ok) {
      setNotice(copy.cannotHideAll);
      return;
    }
    setNotice(null);
    onUpdateRules(action.rules);
  }, [copy.cannotHideAll, onUpdateRules]);

  /** Roving focus over the option list; the search field is the first stop, so this is bounded by the list. */
  const moveActive = useCallback((delta: number) => {
    setActiveIndex((current) => {
      const total = options.shown.length;
      if (total === 0) return 0;
      return (current + delta + total) % total;
    });
  }, [options.shown.length]);

  const activateIndex = useCallback((index: number) => {
    const entry = options.shown[index];
    if (!entry || !menu?.ok) return;
    apply(toggleAutoFilterOptionAction(menu.menu, entry.value, rules));
  }, [apply, menu, options.shown, rules]);

  /**
   * Keyboard inside the popup: Escape closes and restores focus, Tab cycles inside the popup (so focus cannot
   * wander behind it), arrows/Home/End move the active option, Enter/Space toggles it.
   */
  const handlePanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(Math.max(0, options.shown.length - 1));
        break;
      case 'Enter':
        event.preventDefault();
        activateIndex(activeIndex);
        break;
      default:
        break;
    }
  }, [activateIndex, activeIndex, closeMenu, moveActive, options.shown.length]);

  const listId = `grid-autofilter-list-${column}`;
  const statusText = notice
    ?? (query.trim() !== ''
      ? copy.valueCount(options.shown.length, menu?.ok ? menu.menu.valueSet.values.length : 0)
      : menu?.ok && menu.menu.foreignRuleCount > 0
        ? copy.hiddenByForeignFilter(column)
        : menu?.ok && menu.menu.hasFilter
          ? copy.selectedCount(menu.menu.checked.length)
          : copy.valueCount(menu?.ok ? menu.menu.valueSet.values.length : 0, menu?.ok ? menu.menu.valueSet.values.length : 0));

  const allChecked = menu?.ok ? menu.menu.checked.length === menu.menu.valueSet.values.length : false;

  return (
    <span
      data-vgt-grid-autofilter={column}
      className="relative inline-block leading-none"
      // **One** place that keeps this control's pointer events away from its host: the column header selects
      // the column on click, and the canvas host resolves a pointer target on mousedown. Without this the
      // entry would open the filter *and* select a column/cell — two effects from one click.
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        role="button"
        data-vgt-grid-autofilter-trigger={column}
        data-vgt-grid-autofilter-active={columnHasFilter ? 'true' : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={copy.title(column)}
        title={copy.title(column)}
        disabled={!enabled}
        onClick={() => {
          if (open) closeMenu(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
        className={`ml-1 rounded-sm p-0.5 align-middle text-slate-400 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors ${
          columnHasFilter ? 'text-blue-300' : ''
        }`}
      >
        <Filter className="w-3 h-3" aria-hidden="true" />
      </button>

      {open && menu?.ok && (
        <div
          ref={panelRef}
          data-vgt-grid-autofilter-panel={column}
          className="absolute left-0 top-full mt-1 z-50 w-60 bg-slate-900 border border-white/20 rounded shadow-2xl text-left font-sans text-xs"
          onKeyDown={handlePanelKeyDown}
        >
          <div className="p-2 border-b border-white/10 space-y-1.5">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchPlaceholder}
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-100 outline-none focus:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-400"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-vgt-grid-autofilter-select-all={column}
                disabled={allChecked}
                onClick={() => { if (menu.ok) apply(selectAllAutoFilterOptionsAction(menu.menu, rules)); }}
                className="flex-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {copy.selectAll}
              </button>
              <button
                type="button"
                data-vgt-grid-autofilter-reset={column}
                disabled={!columnHasFilter}
                onClick={() => { if (menu.ok) apply(resetAutoFilterColumnAction(menu.menu, rules)); }}
                className="flex-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {copy.resetColumn(column)}
              </button>
            </div>
          </div>

          <p
            role="status"
            aria-live="polite"
            data-vgt-grid-autofilter-status={column}
            className={`px-2 py-1 border-b border-white/10 ${notice ? 'text-amber-300' : 'text-slate-400'}`}
          >
            {statusText}
          </p>

          <div
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={copy.title(column)}
            className="max-h-48 overflow-y-auto py-1"
          >
            {options.shown.length === 0 ? (
              <p className="px-3 py-2 text-slate-500 italic">{GRID_ANALYSIS_COPY[locale].slicer.noValues(column)}</p>
            ) : (
              options.shown.map((entry, index) => {
                const selected = menu.menu.checked.includes(entry.value);
                return (
                  <button
                    key={entry.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-vgt-grid-autofilter-option={entry.value}
                    title={entry.truncated ? entry.value : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => apply(toggleAutoFilterOptionAction(menu.menu, entry.value, rules))}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      index === activeIndex ? 'bg-white/10' : ''
                    } ${selected ? 'text-slate-100' : 'text-slate-400'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`w-3 h-3 shrink-0 border rounded-sm flex items-center justify-center text-[0.5625rem] leading-none ${
                        selected ? 'bg-blue-600 border-blue-400 text-white' : 'border-white/30'
                      }`}
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span className="truncate flex-1">{autoFilterOptionLabel(entry)}</span>
                  </button>
                );
              })
            )}
          </div>

          {menu.menu.valueSet.valueCapped && (
            <p role="status" className="px-2 py-1 border-t border-white/10 text-amber-300/90">
              {copy.capped(menu.menu.valueSet.values.length)}
            </p>
          )}
          {options.hidden > 0 && (
            <p role="status" className="px-2 py-1 border-t border-white/10 text-slate-400">
              {copy.valueCount(options.shown.length, menu.menu.valueSet.values.length)}
            </p>
          )}
        </div>
      )}
    </span>
  );
};
