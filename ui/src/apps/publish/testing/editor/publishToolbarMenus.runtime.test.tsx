// @vitest-environment happy-dom
// STATUS: PLATIN — die neue Publish-Leiste im Betrieb: Menüs, Tastatur und Einklappen.
//
// Markup-Verträge (siehe `editor/publishToolbarStructure.test.tsx`) beweisen nur, dass die Struktur
// gerendert wird. Dieser Test bedient sie: Klick öffnet das Formen-/Exportmenü, `Escape` schließt und gibt
// den Fokus zurück, eine Auswahl ruft genau den Handler und schließt, die sekundäre Leiste klappt ein und
// wieder aus. *Ein Menü, das „menu" heißt, aber nicht bedienbar ist, wäre eine Attrappe.*
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PUBLISH_MODEL } from '../../contracts/types';
import { PublishToolbar } from '../../editor/PublishToolbar';
import { PUBLISH_SHAPE_KINDS } from '../../model/publishShapeOps';

const noop = (): void => undefined;
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

interface Gerendert {
  readonly container: HTMLElement;
  readonly abbauen: () => Promise<void>;
}

async function rendere(overrides: Partial<Parameters<typeof PublishToolbar>[0]> = {}): Promise<Gerendert> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const props = {
    model: DEFAULT_PUBLISH_MODEL,
    onUpdateModel: noop,
    onAddFrame: noop,
    onAddShape: noop,
    showPreflight: false,
    onTogglePreflight: noop,
    onUndo: noop,
    onRedo: noop,
    canUndo: true,
    canRedo: false,
    zoomPercent: 100,
    onZoomOut: noop,
    onZoomIn: noop,
    ...overrides,
  } as Parameters<typeof PublishToolbar>[0];
  await act(async () => { root.render(<PublishToolbar {...props} />); });
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  return {
    container,
    abbauen: async () => {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

async function klicke(container: HTMLElement, selector: string): Promise<HTMLElement> {
  const element = container.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`${selector} fehlt`);
  await act(async () => {
    element.click();
    await new Promise((done) => setTimeout(done, 0));
  });
  return element;
}

async function taste(ziel: EventTarget, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => {
    ziel.dispatchEvent(event);
    await new Promise((done) => setTimeout(done, 0));
  });
  return event;
}

describe('Publish-Leiste im Betrieb: Menüs und Einklappen', () => {
  it('öffnet das Formenmenü, listet jede Form und legt die gewählte Form an', async () => {
    const onAddShape = vi.fn();
    const toolbar = await rendere({ onAddShape });
    try {
      expect(toolbar.container.querySelector('[data-publish-shapes-menu="open"]')).toBeNull();
      await klicke(toolbar.container, '[data-publish-shapes-trigger="true"]');
      expect(toolbar.container.querySelector('[data-publish-shapes-menu="open"]')).not.toBeNull();
      expect(toolbar.container.querySelector('[data-publish-shapes-trigger="true"]')?.getAttribute('aria-expanded')).toBe('true');
      for (const kind of PUBLISH_SHAPE_KINDS) {
        expect(toolbar.container.querySelector(`[data-publish-add-shape="${kind}"]`), kind).not.toBeNull();
      }
      const firstKind = PUBLISH_SHAPE_KINDS[0];
      await klicke(toolbar.container, `[data-publish-add-shape="${firstKind}"]`);
      expect(onAddShape).toHaveBeenCalledWith(firstKind);
      expect(toolbar.container.querySelector('[data-publish-shapes-menu="open"]'), 'Auswahl schließt das Menü').toBeNull();
    } finally {
      await toolbar.abbauen();
    }
  });

  it('führt die Tastatur im Menü: Escape schließt und gibt den Fokus an den Trigger zurück', async () => {
    const toolbar = await rendere({ onAddShape: noop });
    try {
      const trigger = toolbar.container.querySelector<HTMLElement>('[data-publish-shapes-trigger="true"]')!;
      trigger.focus();
      await taste(trigger, 'ArrowDown');
      expect(toolbar.container.querySelector('[data-publish-shapes-menu="open"]')).not.toBeNull();
      const menu = toolbar.container.querySelector<HTMLElement>('[data-publish-shapes-menu="open"]')!;
      const firstItem = menu.querySelector<HTMLElement>('[role="menuitem"]')!;
      firstItem.focus();
      const escape = await taste(firstItem, 'Escape');
      expect(escape.defaultPrevented).toBe(true);
      expect(toolbar.container.querySelector('[data-publish-shapes-menu="open"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      await toolbar.abbauen();
    }
  });

  it('öffnet das Exportmenü und exportiert genau das gewählte Ziel', async () => {
    const onExport = vi.fn();
    const toolbar = await rendere({ onExport });
    try {
      await klicke(toolbar.container, '[data-publish-export-trigger="true"]');
      expect(toolbar.container.querySelector('[data-publish-export-menu="open"]')).not.toBeNull();
      await klicke(toolbar.container, '[data-publish-export-button="epub"]');
      expect(onExport).toHaveBeenCalledWith('epub');
      expect(toolbar.container.querySelector('[data-publish-export-menu="open"]'), 'Auswahl schließt das Menü').toBeNull();
    } finally {
      await toolbar.abbauen();
    }
  });

  it('klappt die Seite-&-Dokument-Leiste ein und wieder aus', async () => {
    const toolbar = await rendere();
    try {
      const toggle = () => toolbar.container.querySelector<HTMLElement>('[data-publish-secondary-toggle="true"]')!;
      const pageBar = () => toolbar.container.querySelector<HTMLElement>('[data-publish-page-bar="true"]');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(pageBar()?.className).not.toContain('hidden');

      await klicke(toolbar.container, '[data-publish-secondary-toggle="true"]');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(toolbar.container.querySelector('[data-publish-secondary-state="collapsed"]')).not.toBeNull();
      expect(pageBar()?.className, 'eingeklappt = display none, nicht nur blass').toContain('hidden');

      await klicke(toolbar.container, '[data-publish-secondary-toggle="true"]');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(pageBar()?.className).not.toContain('hidden');
    } finally {
      await toolbar.abbauen();
    }
  });

  it('schließt ein offenes Menü bei Klick außerhalb', async () => {
    const toolbar = await rendere({ onAddShape: noop });
    try {
      await klicke(toolbar.container, '[data-publish-shapes-trigger="true"]');
      expect(toolbar.container.querySelector('[data-publish-shapes-menu="open"]')).not.toBeNull();
      await act(async () => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await new Promise((done) => setTimeout(done, 0));
      });
      expect(toolbar.container.querySelector('[data-publish-shapes-menu="open"]')).toBeNull();
    } finally {
      await toolbar.abbauen();
    }
  });
});

