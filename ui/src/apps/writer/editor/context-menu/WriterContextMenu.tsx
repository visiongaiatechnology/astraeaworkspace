// STATUS: PLATIN — Small, context-sensitive Writer context menu
//
// ASTRAEA WRITER 50 V2, WR-021/WR-022: a right-click is a *short* interruption, not
// a command wall. The menu therefore shows only the entries that belong to the
// thing that was clicked:
//
//   text    → cut/copy/paste, paragraph actions, insert actions
//   paper   → insert paragraph, insert group, page setup, find, statistics
//   table   → clipboard, find, statistics
//   object  → clipboard, find, statistics
//
// Groups that hold more entries are honest disclosures (`aria-expanded`,
// `aria-controls`). Their panel stays in the DOM so a source witness still sees the
// entry names, but it is `hidden` — which removes it from the tab order and from the
// accessibility tree — until the user opens it.
//
// WR-022: the table size grid is **closed on every open**. The previous
// `useState(true)` was not a preference, it was an accident: it meant every
// right-click rendered a 10×10 grid before the user had asked for a table.
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Scissors,
  Copy,
  ClipboardPaste,
  Paintbrush,
  ArrowUp,
  ArrowDown,
  ArrowUpToLine,
  ArrowDownToLine,
  CopyPlus,
  Trash2,
  SlidersHorizontal,
  Palette,
  ListOrdered,
  Image,
  Table,
  Sigma,
  Shapes,
  FileText,
  Search,
  Hash,
  BarChart2,
  SeparatorHorizontal,
  ChevronRight,
  Link2,
  Unlink,
} from 'lucide-react';
import { WriterTableSizeGrid } from '../../tables/picker/WriterTableSizeGrid';
import type { WriterTableSize } from '../../tables/picker/writerTableSize';

/** Which thing the user right-clicked; the menu shows only that context. */
export type WriterContextMenuKind = 'text' | 'paper' | 'table' | 'object';

export function calculateClampedMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  pad: number = 12
): { top: number; left: number } {
  let nextTop = y;
  let nextLeft = x;

  // Vertical positioning: flip above cursor if overflowing bottom edge, or clamp
  if (y + menuHeight + pad > viewportHeight) {
    if (y - menuHeight >= pad) {
      nextTop = y - menuHeight;
    } else {
      nextTop = Math.max(pad, viewportHeight - menuHeight - pad);
    }
  }

  // Horizontal positioning: flip left if overflowing right edge, or clamp
  if (x + menuWidth + pad > viewportWidth) {
    if (x - menuWidth >= pad) {
      nextLeft = x - menuWidth;
    } else {
      nextLeft = Math.max(pad, viewportWidth - menuWidth - pad);
    }
  }

  nextTop = Math.max(pad, Math.min(nextTop, Math.max(pad, viewportHeight - menuHeight - pad)));
  nextLeft = Math.max(pad, Math.min(nextLeft, Math.max(pad, viewportWidth - menuWidth - pad)));

  return { top: Math.round(nextTop), left: Math.round(nextLeft) };
}

interface WriterContextMenuProps {
  x: number;
  y: number;
  paragraphIndex?: number;
  /** Which context the right-click belongs to. Defaults to the paragraph menu. */
  kind?: WriterContextMenuKind;
  onClose: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  hasCopiedFormat?: boolean;
  /**
   * The document is not editable (read-only or form protection). The entries that
   * write a block into the document render `disabled` instead of silently doing
   * nothing.
   */
  insertDisabled?: boolean;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCopyFormat?: () => void;
  /** WR-035: the URL of the link under the caret, or 
ull when there is none. */
  activeLinkUrl?: string | null;
  onEditLink?: () => void;
  onRemoveLink?: () => void;
  onPasteFormat?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onInsertParagraphBefore?: () => void;
  onInsertParagraphAfter?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onOpenParagraphFormat?: () => void;
  onOpenStyleInspector?: () => void;
  onOpenListFormat?: () => void;
  onInsertImage?: () => void;
  onInsertTable?: (size: WriterTableSize) => void;
  onInsertEquation?: () => void;
  onInsertShape?: () => void;
  onInsertPageBreak?: () => void;
  onOpenPageSetup?: () => void;
  onOpenFindReplace?: () => void;
  onOpenSpecialCharacters?: () => void;
  onOpenStatistics?: () => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  variant?: 'default' | 'accent';
  /** The stable name of this entry, so a witness can find the entry instead of its wording. */
  dataAction?: string;
  /** Set for a disclosure entry that owns a panel below it. */
  expanded?: boolean;
  /** The id of the panel this entry discloses. */
  controls?: string;
}

const ContextMenuItem: React.FC<MenuItemProps> = ({
  icon,
  label,
  shortcut,
  onClick,
  disabled = false,
  destructive = false,
  variant = 'default',
  dataAction,
  expanded,
  controls,
}) => {
  if (!onClick) return null;
  const isAccent = variant === 'accent';

  let baseClass = 'group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-medium transition-colors ';
  if (disabled) {
    baseClass += 'text-slate-500 opacity-40 cursor-not-allowed';
  } else if (destructive) {
    baseClass += 'text-rose-300 hover:bg-rose-600 hover:text-white';
  } else if (isAccent) {
    baseClass += 'bg-blue-600/20 text-blue-100 hover:bg-blue-600 hover:text-white';
  } else {
    baseClass += 'text-slate-200 hover:bg-blue-600 hover:text-white';
  }

  const iconClass = disabled
    ? 'text-slate-500 shrink-0'
    : destructive
      ? 'text-rose-300 group-hover:text-white shrink-0'
      : isAccent
        ? 'text-blue-200 group-hover:text-white shrink-0'
        : 'text-slate-300 group-hover:text-white shrink-0';

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      // WR-025: a disabled entry says so to assistive technology, not only to CSS.
      aria-disabled={disabled ? 'true' : undefined}
      data-writer-context-menu-action={dataAction}
      aria-expanded={expanded}
      aria-controls={expanded === undefined ? undefined : controls}
      onClick={disabled ? undefined : onClick}
      onFocus={(event) => {
        // Roving tab stop: the focused entry is the menu's single tab stop.
        const root = event.currentTarget.closest('[role="menu"]');
        if (!root) return;
        for (const item of Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'))) {
          item.tabIndex = item === event.currentTarget ? 0 : -1;
        }
      }}
      className={baseClass}
    >
      <div className="flex items-center gap-2 truncate">
        <span className={iconClass}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <span className="ml-2 flex shrink-0 items-center gap-1">
        {shortcut && (
          <span className="font-mono text-[0.625rem] text-slate-400 group-hover:text-blue-100">
            {shortcut}
          </span>
        )}
        {expanded !== undefined && (
          <ChevronRight
            aria-hidden="true"
            className={`h-3 w-3 text-slate-400 transition-transform group-hover:text-blue-100 ${expanded ? 'rotate-90' : ''}`}
          />
        )}
      </span>
    </button>
  );
};

/** A named disclosure inside the menu. The panel is `hidden` while closed. */
const ContextMenuGroup: React.FC<{
  id: string;
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, label, icon, open, onToggle, children }) => (
  <>
    <ContextMenuItem
      icon={icon}
      label={`${label} ▸`}
      expanded={open}
      controls={id}
      onClick={onToggle}
    />
    <div
      id={id}
      role="group"
      aria-label={label}
      hidden={!open}
      data-writer-context-menu-group={label}
      className="ml-2 border-l border-white/10 pl-1.5"
    >
      {children}
    </div>
  </>
);

export const WriterContextMenu: React.FC<WriterContextMenuProps> = ({
  x,
  y,
  paragraphIndex,
  kind = 'text',
  onClose,
  canMoveUp = true,
  canMoveDown = true,
  hasCopiedFormat = false,
  insertDisabled = false,
  onCut,
  onCopy,
  onPaste,
  onCopyFormat,
  activeLinkUrl = null,
  onEditLink,
  onRemoveLink,
  onPasteFormat,
  onMoveUp,
  onMoveDown,
  onInsertParagraphBefore,
  onInsertParagraphAfter,
  onDuplicate,
  onDelete,
  onOpenParagraphFormat,
  onOpenStyleInspector,
  onOpenListFormat,
  onInsertImage,
  onInsertTable,
  onInsertEquation,
  onInsertShape,
  onInsertPageBreak,
  onOpenPageSetup,
  onOpenFindReplace,
  onOpenSpecialCharacters,
  onOpenStatistics,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const groupIdPrefix = useId();
  /**
   * WR-022 — the table size grid is closed when the menu opens, and it is closed
   * again on every reopen or context change. The old `useState(true)` documented
   * itself as intentional; it was not, and it turned every right-click into a grid.
   */
  const [tableGridOpen, setTableGridOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  /** Focus that the menu must give back when it closes (WR-021). */
  const returnFocusRef = useRef<Element | null>(
    typeof document !== 'undefined' ? document.activeElement : null,
  );

  const [pos, setPos] = useState(() => {
    const innerW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const innerH = typeof window !== 'undefined' ? window.innerHeight : 768;
    return calculateClampedMenuPosition(x, y, 260, 420, innerW, innerH);
  });

  // A new position or a new context is a new menu: nothing stays open.
  useEffect(() => {
    setTableGridOpen(false);
    setOpenGroup(null);
  }, [x, y, kind]);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const innerW = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const innerH = typeof window === 'undefined' ? 768 : window.innerHeight;
    setPos(calculateClampedMenuPosition(x, y, rect.width || 260, rect.height || 420, innerW, innerH));
  }, [x, y, openGroup, tableGridOpen]);

  const enabledItems = useCallback((): HTMLElement[] => {
    const root = menuRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .filter((item) => !item.hasAttribute('disabled') && item.closest('[hidden]') === null);
  }, []);

  /**
   * WR-025 — one tab stop, not one per entry.
   *
   * A menu is a single stop in the tab order; inside it the arrow keys move. Without
   * the roving attribute every entry of an open menu became its own tab stop, so a
   * keyboard user had to press Tab through twenty commands to leave the menu.
   */
  const setRovingTabStop = useCallback((active: HTMLElement | null) => {
    const root = menuRef.current;
    if (!root) return;
    for (const item of Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'))) {
      item.tabIndex = item === active ? 0 : -1;
    }
  }, []);

  const focusItem = useCallback((item: HTMLElement | undefined) => {
    if (!item) return;
    item.focus();
    setRovingTabStop(item);
  }, [setRovingTabStop]);

  // Keyboard focus starts inside the menu, in the first permitted command.
  useEffect(() => {
    const items = enabledItems();
    focusItem(items[0]);
  }, [enabledItems, focusItem]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Give the focus back to where it was — normally the writing surface (WR-021).
  useEffect(() => () => {
    const previous = returnFocusRef.current;
    if (!previous || !(previous as HTMLElement).isConnected) return;
    const target = previous as HTMLElement;
    if (typeof target.focus !== 'function') return;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    /**
     * WR-025 — ArrowRight opens a disclosure, ArrowLeft closes it again.
     *
     * A `role="menu"` is expected to behave like this (`aria-haspopup` submenus), and
     * without it the nested groups of a 20-entry menu were mouse-only.
     */
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const item = event.target as HTMLElement;
      if (event.key === 'ArrowRight') {
        const controls = item.getAttribute('aria-controls');
        if (controls && item.getAttribute('aria-expanded') === 'false') {
          event.preventDefault();
          item.click();
          // The group becomes visible in the same commit; focus follows it.
          queueMicrotask(() => {
            const group = controls ? menuRef.current?.querySelector<HTMLElement>(`#${CSS.escape(controls)}`) : null;
            const first = group
              ? Array.from(group.querySelectorAll<HTMLElement>('[role="menuitem"]'))
                .find((entry) => !entry.hasAttribute('disabled'))
              : null;
            focusItem(first ?? undefined);
          });
          return;
        }
      } else {
        const group = item.closest('[role="group"]');
        if (group) {
          const disclosure = menuRef.current?.querySelector<HTMLElement>(`[aria-controls="${group.id}"]`);
          if (disclosure) {
            event.preventDefault();
            if (disclosure.getAttribute('aria-expanded') === 'true') disclosure.click();
            focusItem(disclosure);
            return;
          }
        }
      }
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    const items = enabledItems();
    if (items.length === 0) return;
    const current = items.indexOf(event.target as HTMLElement);
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
    else next = current <= 0 ? items.length - 1 : current - 1;
    event.preventDefault();
    focusItem(items[next]);
  };

  const execute = (action?: () => void) => {
    if (!action) return;
    action();
    onClose();
  };

  const showParagraphGroup = kind === 'text';
  const showInsertGroup = kind === 'text' || kind === 'paper';
  const showDocumentGroup = kind === 'paper' || kind === 'text' || kind === 'table' || kind === 'object';
  const contextLabel = kind === 'paper'
    ? 'Seite'
    : kind === 'table'
      ? 'Tabelle'
      : kind === 'object'
        ? 'Objekt'
        : 'Text';

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Kontextmenü"
      data-writer-context-menu="open"
      data-writer-context-menu-kind={kind}
      onKeyDown={handleKeyDown}
      className="fixed z-50 max-h-[calc(100vh-24px)] min-w-[220px] max-w-[264px] animate-in fade-in zoom-in-95 overflow-y-auto overscroll-contain rounded-xl border border-slate-700 bg-[#0c1220] p-1.5 font-sans text-xs text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.95)] ring-1 ring-white/15 select-none duration-100 scrollbar-thin"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Context badge — one short line, not a title bar */}
      <div className="mb-1.5 flex items-center justify-between px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-slate-400">
        <span className="font-semibold text-slate-300">{contextLabel}</span>
        {paragraphIndex !== undefined && (
          <span className="font-bold text-blue-400">Absatz {paragraphIndex + 1}</span>
        )}
      </div>

      {/* Zwischenablage — der Kern eines Textmenüs */}
      <div className="space-y-0.5">
        <ContextMenuItem
          icon={<Scissors className="h-3.5 w-3.5" />}
          label="Ausschneiden"
          shortcut="Strg+X"
          onClick={onCut ? () => execute(onCut) : undefined}
        />
        <ContextMenuItem
          icon={<Copy className="h-3.5 w-3.5" />}
          label="Kopieren"
          shortcut="Strg+C"
          onClick={onCopy ? () => execute(onCopy) : undefined}
        />
        <ContextMenuItem
          icon={<ClipboardPaste className="h-3.5 w-3.5" />}
          label="Einfügen"
          shortcut="Strg+V"
          onClick={onPaste ? () => execute(onPaste) : undefined}
        />
        <ContextMenuItem
          icon={<Paintbrush className="h-3.5 w-3.5 text-blue-400" />}
          label="Format übertragen"
          onClick={onCopyFormat ? () => execute(onCopyFormat) : undefined}
        />
        {onPasteFormat && hasCopiedFormat && (
          <ContextMenuItem
            icon={<Paintbrush className="h-3.5 w-3.5" />}
            label="Kopiertes Format anwenden"
            variant="accent"
            onClick={() => execute(onPasteFormat)}
          />
        )}
      </div>

      {/*
        WR-035 — link-sensitive entries, only while the caret sits in a link.
        A menu that offers "Link bearbeiten" without a link is noise; one that does
        not offer it forces the user to select the text again and press `Strg+K`.
      */}
      {activeLinkUrl !== null && (
        <>
          <div className="my-1 h-px bg-slate-800" />
          <div className="space-y-0.5">
            <ContextMenuItem
              icon={<Link2 className="h-3.5 w-3.5 text-sky-400" />}
              label="Link bearbeiten"
              dataAction="link-edit"
              onClick={onEditLink ? () => execute(onEditLink) : undefined}
            />
            <ContextMenuItem
              icon={<Unlink className="h-3.5 w-3.5 text-rose-300" />}
              label="Link entfernen"
              dataAction="link-remove"
              onClick={onRemoveLink ? () => execute(onRemoveLink) : undefined}
            />
          </div>
        </>
      )}

      {showInsertGroup && (onInsertImage || onInsertTable || onInsertEquation || onInsertShape || onInsertPageBreak) && (
        <>
          <div className="my-1 h-px bg-slate-800" />
          <ContextMenuGroup
            id={`${groupIdPrefix}-insert`}
            label="Einfügen"
            icon={<FileText className="h-3.5 w-3.5 text-amber-400" />}
            open={openGroup === 'insert'}
            onToggle={() => setOpenGroup((value) => (value === 'insert' ? null : 'insert'))}
          >
            {onInsertImage && (
              <ContextMenuItem
                icon={<Image className="h-3.5 w-3.5 text-amber-400" />}
                label="Bild einfügen …"
                onClick={() => execute(onInsertImage)}
              />
            )}
            {/*
              WR-022: the entry is a **disclosure**, never an open grid. The size is
              the argument of `onInsertTable`, so the fixed 3 × 1 literal that used to
              live here cannot come back through this path.
            */}
            <ContextMenuItem
              icon={<Table className="h-3.5 w-3.5 text-emerald-400" />}
              label="Tabelle einfügen ▸"
              dataAction="insert-table"
              disabled={insertDisabled}
              expanded={tableGridOpen}
              controls={`${groupIdPrefix}-table-grid`}
              onClick={onInsertTable ? () => setTableGridOpen((value) => !value) : undefined}
            />
            {onInsertTable && tableGridOpen && (
              <div
                id={`${groupIdPrefix}-table-grid`}
                role="group"
                aria-label="Tabellengröße wählen"
                data-writer-context-menu-table-size="open"
                className="mx-0.5 mb-1 rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1.5"
              >
                <WriterTableSizeGrid
                  label="Tabellengröße wählen"
                  hint="Zellen überfahren oder mit den Pfeiltasten wählen; Klick oder Enter fügt die Tabelle ein."
                  disabled={insertDisabled}
                  onPick={(size) => execute(() => onInsertTable(size))}
                />
              </div>
            )}
            {onInsertEquation && (
              <ContextMenuItem
                icon={<Sigma className="h-3.5 w-3.5 text-purple-400" />}
                label="Formel (LaTeX/MathML) …"
                onClick={() => execute(onInsertEquation)}
              />
            )}
            {onInsertShape && (
              <ContextMenuItem
                icon={<Shapes className="h-3.5 w-3.5 text-rose-400" />}
                label="Vektorform / Shape …"
                onClick={() => execute(onInsertShape)}
              />
            )}
            {onInsertPageBreak && (
              <ContextMenuItem
                icon={<SeparatorHorizontal className="h-3.5 w-3.5 text-indigo-400" />}
                label="Seitenumbruch"
                shortcut="Strg+Enter"
                onClick={() => execute(onInsertPageBreak)}
              />
            )}
          </ContextMenuGroup>
        </>
      )}

      {showParagraphGroup && (onInsertParagraphBefore || onInsertParagraphAfter || onDuplicate || onDelete || onOpenParagraphFormat) && (
        <>
          <div className="my-1 h-px bg-slate-800" />
          <ContextMenuGroup
            id={`${groupIdPrefix}-paragraph`}
            label="Absatz"
            icon={<SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />}
            open={openGroup === 'paragraph'}
            onToggle={() => setOpenGroup((value) => (value === 'paragraph' ? null : 'paragraph'))}
          >
            <ContextMenuItem
              icon={<ArrowUp className="h-3.5 w-3.5 text-blue-400" />}
              label="Nach oben verschieben"
              shortcut="Alt+↑"
              disabled={!canMoveUp}
              onClick={onMoveUp ? () => execute(onMoveUp) : undefined}
            />
            <ContextMenuItem
              icon={<ArrowDown className="h-3.5 w-3.5 text-blue-400" />}
              label="Nach unten verschieben"
              shortcut="Alt+↓"
              disabled={!canMoveDown}
              onClick={onMoveDown ? () => execute(onMoveDown) : undefined}
            />
            {/* AST-0096: the two entries that insert a paragraph *relative to this
                one* sit next to the two move entries — the four together are
                "where does this paragraph go" — and before the paragraph format
                entry, so the established order is unchanged. */}
            <ContextMenuItem
              icon={<ArrowUpToLine className="h-3.5 w-3.5 text-emerald-400" />}
              label="Absatz davor einfügen"
              dataAction="insert-paragraph-before"
              disabled={insertDisabled}
              onClick={onInsertParagraphBefore ? () => execute(onInsertParagraphBefore) : undefined}
            />
            <ContextMenuItem
              icon={<ArrowDownToLine className="h-3.5 w-3.5 text-emerald-400" />}
              label="Absatz darunter einfügen"
              dataAction="insert-paragraph-after"
              disabled={insertDisabled}
              onClick={onInsertParagraphAfter ? () => execute(onInsertParagraphAfter) : undefined}
            />
            <ContextMenuItem
              icon={<CopyPlus className="h-3.5 w-3.5 text-blue-400" />}
              label="Absatz duplizieren"
              onClick={onDuplicate ? () => execute(onDuplicate) : undefined}
            />
            <ContextMenuItem
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />}
              label="Absatz formatieren …"
              onClick={onOpenParagraphFormat ? () => execute(onOpenParagraphFormat) : undefined}
            />
            <ContextMenuItem
              icon={<Palette className="h-3.5 w-3.5 text-purple-400" />}
              label="Formatvorlagen & Inspektor …"
              onClick={onOpenStyleInspector ? () => execute(onOpenStyleInspector) : undefined}
            />
            <ContextMenuItem
              icon={<ListOrdered className="h-3.5 w-3.5 text-emerald-400" />}
              label="Aufzählung & Listen …"
              onClick={onOpenListFormat ? () => execute(onOpenListFormat) : undefined}
            />
          </ContextMenuGroup>
        </>
      )}

      {showDocumentGroup && (onOpenPageSetup || onOpenFindReplace || onOpenSpecialCharacters || onOpenStatistics) && (
        <>
          <div className="my-1 h-px bg-slate-800" />
          <div className="space-y-0.5">
            {onOpenPageSetup && (
              <ContextMenuItem
                icon={<FileText className="h-3.5 w-3.5 text-slate-300" />}
                label="Seiteneinrichtung & Ränder …"
                onClick={() => execute(onOpenPageSetup)}
              />
            )}
            {onOpenFindReplace && (
              <ContextMenuItem
                icon={<Search className="h-3.5 w-3.5 text-slate-300" />}
                label="Suchen & Ersetzen"
                shortcut="Strg+F"
                onClick={() => execute(onOpenFindReplace)}
              />
            )}
            {onOpenSpecialCharacters && (
              <ContextMenuItem
                icon={<Hash className="h-3.5 w-3.5 text-slate-300" />}
                label="Sonderzeichen …"
                onClick={() => execute(onOpenSpecialCharacters)}
              />
            )}
            {onOpenStatistics && (
              <ContextMenuItem
                icon={<BarChart2 className="h-3.5 w-3.5 text-slate-300" />}
                label="Wort- & Dokumentstatistik …"
                onClick={() => execute(onOpenStatistics)}
              />
            )}
          </div>
        </>
      )}

      {onDelete && kind === 'text' && (
        <>
          <div className="my-1 h-px bg-slate-800" />
          <ContextMenuItem
            icon={<Trash2 className="h-3.5 w-3.5 text-rose-300" />}
            label="Absatz löschen"
            destructive
            disabled={insertDisabled}
            onClick={() => execute(onDelete)}
          />
        </>
      )}
    </div>
  );
};
