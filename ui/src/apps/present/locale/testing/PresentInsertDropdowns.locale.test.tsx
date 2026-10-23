// @vitest-environment happy-dom
// STATUS: PLATIN — rendered interaction coverage for localized Present insert menus.
//
// Round 35: the palettes are rendered into a `document.body` portal (so the toolbar's
// `overflow-x-auto` can no longer clip them). This test therefore renders the real component in a
// DOM, opens each palette by clicking its trigger, and reads the localized option labels from the
// portal menu — one pass per workspace locale.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PresentDiagramSceneObject,
  PresentShapeSceneObject,
  PresentWidgetSceneObject,
} from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { DIAGRAM_DEFINITIONS, SHAPE_DEFINITIONS, WIDGET_DEFINITIONS } from '../../contracts/types';
import { PresentInsertDropdowns } from '../../editor/toolbar/PresentInsertDropdowns';
import { PRESENT_TOOLBAR_COPY } from '../presentToolbarLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

interface DropdownHandlers {
  onAddShape: (shape: PresentShapeSceneObject['shape']) => void;
  onAddWidget: (widgetType: PresentWidgetSceneObject['widgetType']) => void;
  onAddDiagram: (diagramType: PresentDiagramSceneObject['diagramType']) => void;
}

async function renderDropdowns(props: DropdownHandlers): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(PresentInsertDropdowns, props));
  });
  return container;
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

describe('Present insert dropdown localization', () => {
  it('opens each insert menu, renders every localized option, and preserves selection keys in all locales', async () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: () => undefined });
      const copy = PRESENT_TOOLBAR_COPY[locale];
      const shapeHandler = vi.fn((_shape: PresentShapeSceneObject['shape']) => undefined);
      const widgetHandler = vi.fn((_widgetType: PresentWidgetSceneObject['widgetType']) => undefined);
      const diagramHandler = vi.fn((_diagramType: PresentDiagramSceneObject['diagramType']) => undefined);

      const verifyMenu = async (
        toggleLabel: string,
        menuKey: 'shapes' | 'widgets' | 'diagrams',
        optionKeyAttribute: string,
        options: readonly { key: string; label: string }[],
        onSelected: ReturnType<typeof vi.fn>,
        handlers: DropdownHandlers,
      ): Promise<void> => {
        const host = await renderDropdowns(handlers);
        const trigger = host.querySelector<HTMLButtonElement>(`button[aria-label="${toggleLabel}"]`);
        expect(trigger, `${locale} toggle ${toggleLabel}`).not.toBeNull();

        await clickElement(trigger!);
        expect(trigger!.getAttribute('aria-expanded'), `${locale} ${toggleLabel} öffnet`).toBe('true');
        const menu = document.querySelector<HTMLElement>(`[data-present-insert-menu="${menuKey}"]`);
        expect(menu, `${locale} ${toggleLabel} Menü im Portal`).not.toBeNull();
        // The palette is mounted in a non-clipping container (document.body), not in the toolbar.
        expect(menu!.closest('[data-vgt-app-toolbar-band="present"]'), 'nicht im geclippten Toolbar-Band').toBeNull();
        expect(menu!.parentElement, 'Portal hängt an document.body').toBe(document.body);

        for (const option of options) {
          const item = menu!.querySelector<HTMLButtonElement>(`[${optionKeyAttribute}="${option.key}"]`);
          expect(item, `${locale} ${toggleLabel} option ${option.key}`).not.toBeNull();
          expect(item!.textContent, `${locale} ${toggleLabel} option label ${option.key}`).toContain(option.label);
        }

        const firstKey = options[0]!.key;
        const firstItem = menu!.querySelector<HTMLButtonElement>(`[${optionKeyAttribute}="${firstKey}"]`)!;
        await clickElement(firstItem);
        expect(onSelected, `${locale} ${toggleLabel} callback`).toHaveBeenCalledWith(firstKey);
        expect(document.querySelector(`[data-present-insert-menu="${menuKey}"]`), 'Menü schließt nach Auswahl').toBeNull();

        await act(async () => { root!.unmount(); });
        root = null;
        container?.remove();
        container = null;
      };

      await verifyMenu(
        copy.text.shapeMenu,
        'shapes',
        'data-present-shape-key',
        SHAPE_DEFINITIONS.map(({ key, label }) => ({ key, label: copy.shapes[key] ?? label })),
        shapeHandler,
        { onAddShape: shapeHandler, onAddWidget: widgetHandler, onAddDiagram: diagramHandler },
      );
      await verifyMenu(
        copy.text.widgetMenu,
        'widgets',
        'data-present-widget-key',
        WIDGET_DEFINITIONS.map(({ key, label }) => ({ key, label: copy.widgets[key] ?? label })),
        widgetHandler,
        { onAddShape: shapeHandler, onAddWidget: widgetHandler, onAddDiagram: diagramHandler },
      );
      await verifyMenu(
        copy.text.diagramMenu,
        'diagrams',
        'data-present-diagram-key',
        DIAGRAM_DEFINITIONS.map(({ key, label }) => ({ key, label: copy.diagrams[key] ?? label })),
        diagramHandler,
        { onAddShape: shapeHandler, onAddWidget: widgetHandler, onAddDiagram: diagramHandler },
      );
    }
  });
});
