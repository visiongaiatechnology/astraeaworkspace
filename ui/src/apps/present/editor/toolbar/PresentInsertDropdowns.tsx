// STATUS: DIAMANT VGT SUPREME — Present Insert Dropdowns Menu Subcomponent
//
// PR-012 (M1 accessibility): the insert palettes are real keyboard menus:
//   - ArrowDown on a closed trigger opens the menu and focuses its first item;
//   - ArrowDown/ArrowUp cycle the focus between the items (wrap), Home/End jump to first/last;
//   - Escape closes the menu and returns the focus to its trigger; activating an item does the same;
//   - every navigation key is consumed *here* (preventDefault + stopPropagation), so the global
//     Present canvas resolver (arrows = nudge, Home/End = slide navigation) never fires while the
//     user browses a palette.
//
// Round 35 (M1 user finding "clicking Shapes/Widgets does nothing"): the toolbar band is
// `overflow-x-auto` (and the editor root `overflow-hidden`), so an absolutely positioned palette was
// clipped to the 44 px toolbar height and *invisible* although the DOM test could see it. The menu is
// now rendered into a `document.body` portal with `position: fixed` and a very high z-index, i.e. in
// a non-clipping container. `data-present-insert-menu` stays on the menu so the keyboard tests keep
// one stable selector — they query it through `document` (a portal child is not inside the host).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PresentShapeSceneObject,
  PresentWidgetSceneObject,
  PresentDiagramSceneObject,
} from '../../../../shared/contracts/workspace';
import {
  SHAPE_DEFINITIONS,
  WIDGET_DEFINITIONS,
  DIAGRAM_DEFINITIONS,
} from '../../contracts/types';
import {
  Square,
  Gauge,
  GitFork,
  ChevronDown,
} from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PRESENT_TOOLBAR_COPY } from '../../locale/presentToolbarLocale';

interface PresentInsertDropdownsProps {
  onAddShape: (shape: PresentShapeSceneObject['shape']) => void;
  onAddWidget: (widgetType: PresentWidgetSceneObject['widgetType']) => void;
  onAddDiagram: (diagramType: PresentDiagramSceneObject['diagramType']) => void;
}

type PresentInsertMenu = 'shapes' | 'widgets' | 'diagrams';

const MENU_NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const;

const MENU_ID: Record<PresentInsertMenu, string> = {
  shapes: 'present-insert-menu-shapes',
  widgets: 'present-insert-menu-widgets',
  diagrams: 'present-insert-menu-diagrams',
};

export const PresentInsertDropdowns: React.FC<PresentInsertDropdownsProps> = ({
  onAddShape,
  onAddWidget,
  onAddDiagram,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_TOOLBAR_COPY[locale];
  const [openMenu, setOpenMenu] = useState<PresentInsertMenu | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const shapeTriggerRef = useRef<HTMLButtonElement>(null);
  const widgetTriggerRef = useRef<HTMLButtonElement>(null);
  const diagramTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anyOpen = openMenu !== null;

  const triggerFor = (menu: PresentInsertMenu): HTMLButtonElement | null =>
    menu === 'shapes' ? shapeTriggerRef.current : menu === 'widgets' ? widgetTriggerRef.current : diagramTriggerRef.current;

  const closeAll = () => {
    setOpenMenu(null);
    setMenuPosition(null);
  };

  /**
   * Opens one palette as a fixed-position portal right below its trigger (never clipped).
   *
   * **Runde 38 (real-Chrome-Befund):** Die Palette konnte außerhalb des Viewports landen, wenn
   * der Trigger selbst am/rechts vom Rand lag (gemessen: Portal bei x=2144 in einem 1582-px-
   * Fenster → unsichtbar, „Form/Widgets tun nichts"). Die Position wird deshalb in den Viewport
   * geklemmt; reicht der Platz unter dem Trigger nicht, öffnet das Menü oberhalb.
   */
  const openAt = (menu: PresentInsertMenu) => {
    const trigger = triggerFor(menu);
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = 260;
      const menuHeight = 380;
      const margin = 8;
      const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
      const left = Math.min(Math.max(margin, Math.round(rect.left)), maxLeft);
      const below = Math.round(rect.bottom + 4);
      const above = Math.round(rect.top - menuHeight - 4);
      const top = below + menuHeight > viewportHeight - margin
        ? Math.max(margin, above)
        : Math.min(below, Math.max(margin, viewportHeight - menuHeight - margin));
      setMenuPosition({ top, left });
    }
    setOpenMenu(menu);
  };

  const focusFirstItemSoon = () => {
    window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }, 0);
  };

  // Outside click closes the open palette; the trigger and the menu stay clickable.
  useEffect(() => {
    if (!anyOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (triggerFor(openMenu as PresentInsertMenu)?.contains(target)) return;
      closeAll();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [anyOpen, openMenu]);

  const handleTriggerClick = (menu: PresentInsertMenu) => () => {
    if (openMenu === menu) closeAll();
    else openAt(menu);
  };

  /** ArrowDown on a trigger opens the palette (or jumps into an already open one). */
  const handleTriggerKeyDown = (menu: PresentInsertMenu) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && anyOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeAll();
      triggerFor(menu)?.focus();
      return;
    }
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    if (openMenu !== menu) {
      openAt(menu);
      focusFirstItemSoon();
      return;
    }
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  };

  /** Roving focus inside one open palette; item keydowns are handled here by bubbling. */
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const trigger = openMenu ? triggerFor(openMenu) : null;
      closeAll();
      trigger?.focus();
      return;
    }
    if (!MENU_NAVIGATION_KEYS.includes(event.key as (typeof MENU_NAVIGATION_KEYS)[number])) return;
    event.preventDefault();
    event.stopPropagation();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    else nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  /**
   * Activating an item closes the palette, returns the focus to its trigger and performs the action.
   * `item` is optional because the pure locale coverage test invokes the handler without a DOM event.
   */
  const activateItem = (item: HTMLButtonElement | null, action: () => void) => {
    const trigger = openMenu ? triggerFor(openMenu) : null;
    action();
    closeAll();
    trigger?.focus();
    if (item) item.blur();
  };

  /** One palette, rendered as a portal below its trigger. */
  const renderMenu = (menu: PresentInsertMenu, items: React.ReactNode, widthClass: string) => {
    if (openMenu !== menu || !menuPosition) return null;
    return createPortal(
      <div
        ref={menuRef}
        id={MENU_ID[menu]}
        role="menu"
        data-present-insert-menu={menu}
        data-present-insert-menu-portal="true"
        onKeyDown={handleMenuKeyDown}
        style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, zIndex: 2147483000, maxHeight: 'min(70vh, 420px)', overflowY: 'auto' }}
        className={`${widthClass} max-h-80 overflow-y-auto rounded-xl border border-white/15 bg-slate-950 p-1.5 shadow-2xl space-y-0.5`}
      >
        {items}
      </div>,
      document.body,
    );
  };

  const triggerClass = 'flex items-center space-x-1 px-2 py-1 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5';

  return (
    <div className="contents" data-present-insert-dropdowns="true">
      {/* Shape Menu Dropdown */}
      <div className="relative">
        <button
          ref={shapeTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'shapes'}
          aria-controls={openMenu === 'shapes' ? MENU_ID.shapes : undefined}
          onKeyDown={handleTriggerKeyDown('shapes')}
          onClick={handleTriggerClick('shapes')}
          className={triggerClass}
          title={copy.text.shapeMenu}
          aria-label={copy.text.shapeMenu}
        >
          <Square className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden md:inline">{copy.text.shape}</span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-500" />
        </button>
        {renderMenu(
          'shapes',
          SHAPE_DEFINITIONS.map((shp) => (
            <button
              key={shp.key}
              type="button"
              role="menuitem"
              data-present-shape-key={shp.key}
              onClick={(event) => activateItem(event.currentTarget, () => onAddShape(shp.key))}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-blue-600/20 hover:text-blue-300 flex items-center justify-between"
            >
              <span>{copy.shapes[shp.key] ?? shp.label}</span>
            </button>
          )),
          'w-44',
        )}
      </div>

      {/* Widgets Menu Dropdown */}
      <div className="relative">
        <button
          ref={widgetTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'widgets'}
          aria-controls={openMenu === 'widgets' ? MENU_ID.widgets : undefined}
          onKeyDown={handleTriggerKeyDown('widgets')}
          onClick={handleTriggerClick('widgets')}
          className={triggerClass}
          title={copy.text.widgetMenu}
          aria-label={copy.text.widgetMenu}
        >
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline">{copy.text.widget}</span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-500" />
        </button>
        {renderMenu(
          'widgets',
          WIDGET_DEFINITIONS.map((w) => (
            <button
              key={w.key}
              type="button"
              role="menuitem"
              data-present-widget-key={w.key}
              onClick={(event) => activateItem(event.currentTarget, () => onAddWidget(w.key))}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-amber-600/20 hover:text-amber-300 flex items-center justify-between"
            >
              <span>{copy.widgets[w.key] ?? w.label}</span>
            </button>
          )),
          'w-56',
        )}
      </div>

      {/* Diagrams Menu Dropdown */}
      <div className="relative">
        <button
          ref={diagramTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'diagrams'}
          aria-controls={openMenu === 'diagrams' ? MENU_ID.diagrams : undefined}
          onKeyDown={handleTriggerKeyDown('diagrams')}
          onClick={handleTriggerClick('diagrams')}
          className={triggerClass}
          title={copy.text.diagramMenu}
          aria-label={copy.text.diagramMenu}
        >
          <GitFork className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden md:inline">{copy.text.diagram}</span>
          <ChevronDown className="w-2.5 h-2.5 text-slate-500" />
        </button>
        {renderMenu(
          'diagrams',
          DIAGRAM_DEFINITIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              role="menuitem"
              data-present-diagram-key={d.key}
              onClick={(event) => activateItem(event.currentTarget, () => onAddDiagram(d.key))}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-purple-600/20 hover:text-purple-300 flex items-center justify-between"
            >
              <span>{copy.diagrams[d.key] ?? d.label}</span>
            </button>
          )),
          'w-48',
        )}
      </div>
    </div>
  );
};
