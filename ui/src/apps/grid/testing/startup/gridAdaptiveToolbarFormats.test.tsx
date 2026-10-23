// @vitest-environment happy-dom
// STATUS: PLATIN — Grid-Formatvertrag in der adaptiven Shell-Toolbar.
//
// Der Nutzer beklagte, dass die adaptive Toolbar bei Grid nur Währung + Prozent zeigt.
// Diese Datei prüft den sichtbaren Vertrag: vier Schnellformate (Zahl, Währung, Prozent,
// Datum) plus ein echtes „Format"-Preset-Menü mit **allen** GRID_NUMBER_FORMAT_PRESETS.
// Die Aktionen sind Spies; der Grid-Pfad selbst wird in `gridToolbarFormatActions.test.tsx`
// gegen `applyNumberFormatToSelection` geprüft.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdaptiveToolbar,
  type AdaptiveToolbarCellFormat,
} from '../../../../shell/adaptive-toolbar/AdaptiveToolbar';
import { ADAPTIVE_TOOLBAR_COPY } from '../../../../shell/adaptive-toolbar/adaptiveToolbarLocale';
import { GRID_NUMBER_FORMAT_PRESETS, GRID_TOOLBAR_NUMBER_FORMAT_IDS } from '../../formatting/gridNumberFormat';
import { GRID_TOOLBAR_QUICK_FORMATS } from '../../formatting/gridToolbarFormatContract';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const COPY = ADAPTIVE_TOOLBAR_COPY['en-US'];
let root: Root | null = null;
let container: HTMLElement | null = null;

interface RenderResult {
  readonly onFormatCell: ReturnType<typeof vi.fn>;
  readonly onApplyNumberFormat: ReturnType<typeof vi.fn>;
}

async function renderToolbar(): Promise<RenderResult> {
  const onFormatCell = vi.fn();
  const onApplyNumberFormat = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AdaptiveToolbar, {
      documentKind: 'Grid',
      activeSelectionType: 'cell',
      isClassicRibbon: false,
      onToggleRibbonMode: () => undefined,
      onFormatCell,
      numberFormatPresets: GRID_NUMBER_FORMAT_PRESETS,
      onApplyNumberFormat,
    }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { onFormatCell, onApplyNumberFormat };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressEscape(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

function query<T extends Element>(selector: string): T | null {
  return container!.querySelector<T>(selector);
}

function queryBody<T extends Element>(selector: string): T | null {
  return document.body.querySelector<T>(selector);
}

describe('Adaptive Shell-Toolbar — Grid-Formatvertrag', () => {
  it('rendert vier Schnellformate (Zahl, Währung, Prozent, Datum) mit echten Aktionen', async () => {
    const { onFormatCell } = await renderToolbar();
    const quick: readonly AdaptiveToolbarCellFormat[] = ['number', 'currency', 'percent', 'date'];
    for (const format of quick) {
      const button = query<HTMLButtonElement>(`[data-adaptive-format-action="${format}"]`);
      expect(button, `${format} ist sichtbar`).not.toBeNull();
      expect(button!.getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
      await click(button!);
      expect(onFormatCell).toHaveBeenLastCalledWith(format);
    }
    expect(onFormatCell).toHaveBeenCalledTimes(4);
    // Contract authority: the four quick formats are exactly the canonical toolbar id set.
    expect(new Set(GRID_TOOLBAR_QUICK_FORMATS)).toEqual(new Set(GRID_TOOLBAR_NUMBER_FORMAT_IDS));
    // The German labels are not active in this default en-US context, but the visible labels
    // must come from the locale catalog, never from a hard-coded single button.
    expect(COPY.number).toBe('Number');
    expect(COPY.date).toBe('Date');
  });

  it('öffnet das Format-Menü mit allen kanonischen Presets und ruft die echte Preset-Aktion', async () => {
    const { onApplyNumberFormat } = await renderToolbar();
    const trigger = query<HTMLButtonElement>('[data-adaptive-format-action="preset-menu"]');
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');

    await click(trigger!);
    expect(trigger!.getAttribute('aria-expanded')).toBe('true');
    // The menu must not live inside the toolbar stacking context.
    expect(query('[role="menu"]'), 'kein Inline-Menü im Toolbar-Baum').toBeNull();
    const menu = queryBody<HTMLElement>('[role="menu"]');
    expect(menu, 'Format-Popover ist im body-Portal').not.toBeNull();
    expect(menu!.parentElement, 'Portal hängt direkt am body').toBe(document.body);
    expect(menu!.style.position, 'fixed Positionierung').toBe('fixed');
    expect(Number(menu!.style.zIndex), 'sehr hoher Stacking-Kontext').toBeGreaterThanOrEqual(2_147_483_000);
    // GLASS 2100: floating glass with blur/shadow, no decorative grid surface.
    expect(menu!.className).toContain('backdrop-blur-2xl');
    expect(menu!.className).toContain('rounded-2xl');

    const presetButtons = Array.from(menu!.querySelectorAll('[data-adaptive-format-preset]'));
    expect(presetButtons).toHaveLength(GRID_NUMBER_FORMAT_PRESETS.length);
    for (const preset of GRID_NUMBER_FORMAT_PRESETS) {
      expect(queryBody(`[data-adaptive-format-preset="${preset.id}"]`), preset.id).not.toBeNull();
    }

    await click(queryBody<HTMLButtonElement>('[data-adaptive-format-preset="accounting"]')!);
    expect(onApplyNumberFormat).toHaveBeenCalledTimes(1);
    expect(onApplyNumberFormat).toHaveBeenCalledWith('accounting');
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');
    expect(queryBody('[role="menu"]')).toBeNull();
  });

  it('klammert das Portal am Viewport (rechts/ unten) statt hinter dem Grid zu verschwinden', async () => {
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    try {
      await renderToolbar();
      const trigger = query<HTMLButtonElement>('[data-adaptive-format-action="preset-menu"]')!;
      trigger.getBoundingClientRect = (() => ({
        x: 720, y: 540, left: 720, top: 540, right: 760, bottom: 570,
        width: 40, height: 30,
        toJSON: () => ({ x: 720, y: 540, left: 720, top: 540, right: 760, bottom: 570, width: 40, height: 30 }),
      })) as () => DOMRect;
      await click(trigger);
      const menu = queryBody<HTMLElement>('[role="menu"]')!;
      const left = Number.parseFloat(menu.style.left);
      const top = Number.parseFloat(menu.style.top);
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(top)).toBe(true);
      // width=264 fallback, viewport 800 → left must end at least 8px before the edge.
      expect(left + 264).toBeLessThanOrEqual(800 - 8 + 0.01);
      expect(left).toBeGreaterThanOrEqual(8);
      // height fallback = min(420, 10 Presets × 30 + 56) = 356; viewport 600 → oben öffnen.
      const estimatedMenuHeight = Math.min(420, GRID_NUMBER_FORMAT_PRESETS.length * 30 + 56);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(top + estimatedMenuHeight).toBeLessThanOrEqual(600 - 8 + 0.01);
    } finally {
      if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor);
      if (heightDescriptor) Object.defineProperty(window, 'innerHeight', heightDescriptor);
    }
  });

  it('schließt das Portal bei Outside-Click, nicht bei Klick im Menü', async () => {
    await renderToolbar();
    const trigger = query<HTMLButtonElement>('[data-adaptive-format-action="preset-menu"]')!;
    await click(trigger);
    expect(queryBody('[role="menu"]')).not.toBeNull();

    await act(async () => {
      queryBody('[data-adaptive-format-preset="number"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(queryBody('[role="menu"]'), 'Klick im Menü darf nicht schließen').not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(queryBody('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('schließt das Menü per Escape und gibt den Fokus an den Auslöser zurück', async () => {
    await renderToolbar();
    const trigger = query<HTMLButtonElement>('[data-adaptive-format-action="preset-menu"]')!;
    await click(trigger);
    expect(queryBody('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).toBe(queryBody('[data-adaptive-format-preset="general"]'));

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(queryBody('[data-adaptive-format-preset="number"]'));

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(queryBody('[data-adaptive-format-preset="text"]'));

    await pressEscape();
    expect(queryBody('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('bleibt bei Nicht-Grid-Dokumenten ohne Zellformat-Gruppe', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(AdaptiveToolbar, {
        documentKind: 'Present',
        activeSelectionType: 'shape',
        isClassicRibbon: false,
        onToggleRibbonMode: () => undefined,
      }));
    });
    expect(query('[data-adaptive-format-action]')).toBeNull();
  });
});
