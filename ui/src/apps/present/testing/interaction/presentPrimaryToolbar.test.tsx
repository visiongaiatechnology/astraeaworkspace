// @vitest-environment happy-dom
// STATUS: GOLD — Present Round 40: primary toolbar without horizontal scrolling + "More" popover
//
// User finding: text/shapes/images/widgets/diagrams were only reachable after scrolling the toolbar
// horizontally. The rebuilt toolbar keeps the basics in a fixed primary zone (never scrolls) and
// moves rare commands into a `document.body` portal popover ("More"). This test proves the DOM
// contract: primary commands live in the primary zone, rare ones only behind More, the popover is
// not clipped, keyboard (Escape) and outside-click work, and the layout switches write the document.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import { PresentTopToolbar } from '../../editor/toolbar/PresentTopToolbar';
import { resolvePresentSlideDesign, DEFAULT_PRESENT_THEMES } from '../../design/presentDesign';
import { PRESENT_TOOLBAR_COPY } from '../../locale/presentToolbarLocale';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let handlers: ReturnType<typeof makeHandlers>;

function makeHandlers() {
  return {
    onUpdateSlide: vi.fn(),
    onUpdatePresentData: vi.fn(),
    onInsertImageFile: vi.fn(),
    onAddText: vi.fn(),
    onAddShape: vi.fn(),
    onAddWidget: vi.fn(),
    onAddDiagram: vi.fn(),
    onAddCode: vi.fn(),
    onAddChart: vi.fn(),
    onAddTable: vi.fn(),
    onToggleLayers: vi.fn(),
    onToggleAnimations: vi.fn(),
    onToggleNotes: vi.fn(),
    onToggleInspector: vi.fn(),
    onOpenThemeManager: vi.fn(),
    onOpenSections: vi.fn(),
    onOpenRehearsal: vi.fn(),
    onOpenComments: vi.fn(),
    onOpenMediaEmbed: vi.fn(),
    onOpenVideoExport: vi.fn(),
    onOpenSpeakerCoach: vi.fn(),
    onOpenWorkspaceIntegration: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onPreviewTransition: vi.fn(),
    onApplyTransitionToAll: vi.fn(),
    onCommand: vi.fn(),
    onToggleArmedTool: vi.fn(),
    onApplyThemeToDeck: vi.fn(),
  };
}

const SLIDE = {
  id: 'slide-1',
  title: '',
  subtitle: '',
  layout: 'blank',
  cards: [],
  speakerNotes: '',
  sceneObjects: [],
  comments: [],
} as unknown as PresentSlide;

const MODEL = {
  slides: [SLIDE],
  themeId: 'paper',
  themes: DEFAULT_PRESENT_THEMES,
  aspectRatio: '16:9',
} as unknown as PresentDocumentModel;

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

async function mountToolbar(): Promise<HTMLElement> {
  handlers = makeHandlers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(PresentTopToolbar, {
      ...handlers,
      slide: SLIDE,
      design: resolvePresentSlideDesign(SLIDE, MODEL),
      presentData: MODEL,
      showLayers: false,
      showAnimations: false,
      showNotes: false,
      showInspector: false,
      canUndo: true,
      canRedo: true,
      selectionSize: 0,
      armedTool: null,
    } as never));
  });
  await settle();
  return container;
}

beforeEach(() => {
  vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function pressEscape(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
  });
}

describe('Present Round 40 — primary toolbar (finding 3)', () => {
  it('keeps the basic commands in a non-scrolling primary zone', async () => {
    const host = await mountToolbar();
    const copy = PRESENT_TOOLBAR_COPY['en-US'];
    const band = host.querySelector<HTMLElement>('[data-vgt-app-toolbar-band="present"]')!;
    expect(band.getAttribute('data-present-toolbar-scroll'), 'Toolbar scrollt nicht horizontal').toBe('none');
    expect(band.className, 'kein overflow-x-auto').not.toContain('overflow-x-auto');

    const primary = host.querySelector<HTMLElement>('[data-present-primary-actions="true"]');
    expect(primary, 'Primärzone vorhanden').not.toBeNull();
    for (const label of [
      copy.text.undo,
      copy.text.redo,
      copy.text.insertImage,
      copy.text.insertTextBox,
      copy.text.shapeMenu,
      copy.text.widgetMenu,
      copy.text.diagramMenu,
    ]) {
      const button = primary!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button, `Basisfunktion "${label}" ist in der Primärzone (ohne Scrollen)`).not.toBeNull();
    }
    expect(primary!.querySelectorAll('[data-present-layout-button]').length, 'alle Layout-Schalter in der Primärzone').toBe(5);
    expect(primary!.querySelectorAll('button[aria-haspopup="menu"]').length, 'drei Einfüge-Paletten').toBe(3);
    expect(host.querySelector('[data-present-more-button="true"]'), 'Mehr-Trigger').not.toBeNull();
  });

  it('layout switches write the slide layout', async () => {
    const host = await mountToolbar();
    await clickElement(host.querySelector<HTMLElement>('[data-present-layout-button="cards"]')!);
    expect(handlers.onUpdateSlide, 'Karten-Layout geschrieben').toHaveBeenCalledWith(expect.objectContaining({ layout: 'cards' }));
    await clickElement(host.querySelector<HTMLElement>('[data-present-layout-button="blank"]')!);
    expect(handlers.onUpdateSlide, 'Blank-Layout geschrieben').toHaveBeenCalledWith(expect.objectContaining({ layout: 'blank' }));
  });

  it('the "More" popover hosts the rare commands in a non-clipped portal and closes on Escape/outside click', async () => {
    const host = await mountToolbar();
    const copy = PRESENT_TOOLBAR_COPY['en-US'];
    const moreButton = host.querySelector<HTMLButtonElement>('[data-present-more-button="true"]')!;
    await clickElement(moreButton);
    const dialog = document.querySelector<HTMLElement>('[data-present-more-menu="true"]');
    expect(dialog, 'Mehr-Popover gerendert').not.toBeNull();
    expect(dialog!.parentElement, 'Popover hängt an document.body').toBe(document.body);
    expect(dialog!.closest('[data-vgt-app-toolbar-band="present"]'), 'Popover ist nicht im Toolbar-Band geclippt').toBeNull();
    expect(dialog!.style.position, 'Popover ist position:fixed').toBe('fixed');
    expect(Number(dialog!.style.zIndex), 'Popover liegt über der App').toBeGreaterThan(100_000);

    for (const label of [
      copy.text.slideAspectRatio,
      copy.text.slideTransition,
      copy.text.insertCode,
      copy.text.insertChart,
      copy.text.insertTable,
      copy.text.brandKitMasters,
      copy.text.sections,
      copy.text.rehearsal,
    ]) {
      expect(dialog!.querySelector(`[aria-label="${label}"]`), `seltene Funktion "${label}" im Mehr-Popover`).not.toBeNull();
    }
    // The rare commands are not part of the closed primary band.
    expect(host.querySelector(`[aria-label="${copy.text.slideTransition}"]`), 'Transition nicht in der Primärzone').toBeNull();

    await pressEscape(dialog!);
    expect(document.querySelector('[data-present-more-menu="true"]'), 'Escape schließt das Popover').toBeNull();
    expect(document.activeElement, 'Fokus zurück auf dem Mehr-Trigger').toBe(moreButton);

    // Outside click closes it too.
    await clickElement(moreButton);
    expect(document.querySelector('[data-present-more-menu="true"]')).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      await settle();
    });
    expect(document.querySelector('[data-present-more-menu="true"]'), 'Outside-Click schließt das Popover').toBeNull();
  });

  it('a rare command in the popover is wired and runs its handler', async () => {
    const host = await mountToolbar();
    const copy = PRESENT_TOOLBAR_COPY['en-US'];
    await clickElement(host.querySelector<HTMLElement>('[data-present-more-button="true"]')!);
    const dialog = document.querySelector<HTMLElement>('[data-present-more-menu="true"]')!;
    await clickElement(dialog.querySelector<HTMLElement>(`[aria-label="${copy.text.insertCode}"]`)!);
    expect(handlers.onAddCode, 'Code-Einfügen ruft den Handler').toHaveBeenCalledWith('rust');
    expect(document.querySelector('[data-present-more-menu="true"]'), 'Popover schließt nach der Aktion').toBeNull();
  });
});
