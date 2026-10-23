// @vitest-environment happy-dom
// STATUS: GOLD — Present Round 42: style-panel freeze fix, widget text colour, notes redesign,
// animation discoverability.
//
// 1/3) Native colour pickers fire continuous `input` events. The style panel keeps a local draft +
//      lightweight canvas preview and commits ONCE through a ~160 ms debounce (or blur/unmount):
//      measured here as 0 document commits across many events, exactly 1 after the debounce, and
//      one undo step reverting the colour.
// 2)  Widget text colour reaches every text node through the explicit `--present-widget-text` token
//     instead of CSS inheritance; saved/reopened through the canonical writer.
// 4)  Notes page: big slide left, glass notes right, typing commits once per debounce/blur/navigation
//     (memoized slide preview never re-renders per keystroke).
// 5)  Animations: per-object inspector panel (presets incl. Fade in/out, duration, trigger, remove,
//     preview), toolbar entry ("Mehr" → Open animations panel) and the existing presenter playback
//     reading `slide.animations` (static wiring contract).
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { PresentViewWorkspace } from '../../editor/extended-views/PresentViewWorkspace';
import {
  DEFAULT_PRESENT_HANDOUT_MASTER,
  DEFAULT_PRESENT_MASTERS,
  DEFAULT_PRESENT_NOTES_MASTER,
  DEFAULT_PRESENT_THEMES,
} from '../../design/presentDesign';
import { readPresentObjectStyle } from '../../contracts/presentStyle';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';

vi.setConfig({ testTimeout: 60_000 });

const TEXT_OBJECT = {
  id: 'text-1', kind: 'text', text: 'Styled text', xPercent: 10, yPercent: 10,
  widthPercent: 30, heightPercent: 14, fontSizePt: 22, fontWeight: 'semibold',
  color: '#0f172a', textAlign: 'left', opacity: 1, zIndex: 20,
};
const WIDGET_OBJECT = {
  id: 'widget-1', kind: 'widget', widgetType: 'quote', label: 'Quote', value: 'Stay focused',
  accentColor: '#2563eb', xPercent: 50, yPercent: 10, widthPercent: 30, heightPercent: 20,
  opacity: 1, zIndex: 21,
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;
let updates: WorkspaceDocument[] = [];

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function stubbedStageRect(): DOMRect {
    return { x: 0, y: 0, width: 960, height: 540, top: 0, left: 0, right: 960, bottom: 540, toJSON: () => ({}) } as DOMRect;
  };
  updates = [];
  latest = null;
});

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

function slideWith(patch: Record<string, unknown> = {}): PresentSlide {
  return {
    id: 'slide-1', title: '', subtitle: '', layout: 'blank', cards: [], speakerNotes: '',
    sceneObjects: [TEXT_OBJECT, WIDGET_OBJECT] as never,
    ...patch,
  } as PresentSlide;
}

function presentData(slides: PresentSlide[]): PresentDocumentModel {
  return {
    slides,
    themeId: 'paper',
    themes: DEFAULT_PRESENT_THEMES,
    masters: DEFAULT_PRESENT_MASTERS,
    notesMaster: DEFAULT_PRESENT_NOTES_MASTER,
    handoutMaster: DEFAULT_PRESENT_HANDOUT_MASTER,
    aspectRatio: '16:9',
  } as unknown as PresentDocumentModel;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-round-42', title: 'Present Round 42', kind: 'Present',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default', root_object_ids: [], objects: {},
    presentData: presentData([slide]),
  } as WorkspaceDocument;
}

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => {
      updates.push(next);
      setDocument(next);
    },
    workspaceDocuments: [],
    networkCapability: 'offline',
    keyVaultUnlocked: false,
    onSelectSelectionType: vi.fn(),
  } as never);
}

async function mount(slide: PresentSlide = slideWith()): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(ControlledPresenter, { start: documentWith(slide) })); });
  return container;
}

async function settle(ms = 0): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function selectObject(host: HTMLElement, id: string): Promise<void> {
  await clickElement(objectElement(host, id));
}

function input(host: HTMLElement, ariaLabel: string): HTMLInputElement {
  const element = host.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (!element) throw new Error(`input "${ariaLabel}" not rendered`);
  return element;
}

/** Dispatch N rapid `input` events like a native colour-picker drag (no awaits between them). */
async function rapidInputEvents(element: HTMLInputElement, values: string[]): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    for (const value of values) {
      setter?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await Promise.resolve();
  });
}

const waitDebounce = async (): Promise<void> => settle(280);

describe('Present Round 42 — style picker freeze (1/3)', () => {
  it('colour drag: many input events = 0 commits, 1 commit after debounce, 1 undo step', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    const colorInput = input(host, 'Object text colour');
    const colors = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#b91c1c'];

    await rapidInputEvents(colorInput, colors);
    expect(updates.length, 'während des Ziehens kein Dokument-Commit').toBe(0);
    // Lightweight preview only: the canvas text uses the draft colour, the document does not.
    expect((objectElement(host, 'text-1').firstElementChild as HTMLElement).style.color, 'sofortige Vorschau').toBe('#b91c1c');
    expect(readPresentObjectStyle((latest!.presentData!.slides[0]!.sceneObjects as unknown[])[0]), 'Dokument noch unverändert').toEqual({});

    await waitDebounce();
    expect(updates.length, 'genau ein Commit pro Farbauswahl').toBe(1);
    const stored = readPresentObjectStyle((latest!.presentData!.slides[0]!.sceneObjects as unknown[])[0]);
    expect(stored.textColor, 'finale Farbe im Dokument').toBe('#b91c1c');

    // One undo step reverts the colour (one history entry).
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await settle(60);
    });
    expect(readPresentObjectStyle((latest!.presentData!.slides[0]!.sceneObjects as unknown[])[0]).textColor, 'ein Undo-Schritt').toBeUndefined();
  });

  it('font size typing: many input events = 0 commits, 1 commit after debounce', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    const fontInput = input(host, 'Style font size');
    await rapidInputEvents(fontInput, ['2', '23', '23', '234', '34', '34']);
    expect(updates.length, 'kein Commit pro Tastendruck').toBe(0);
    await waitDebounce();
    expect(updates.length, 'genau ein Commit nach dem Tippen').toBe(1);
    expect(readPresentObjectStyle((latest!.presentData!.slides[0]!.sceneObjects as unknown[])[0]).fontSizePt, 'finale Schriftgröße').toBe(34);
  });

  it('blur flushes immediately without waiting for the debounce', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    const colorInput = input(host, 'Object text colour');
    await rapidInputEvents(colorInput, ['#0ea5e9', '#22d3ee']);
    expect(updates.length, 'noch kein Commit').toBe(0);
    await act(async () => {
      colorInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await settle(30);
    });
    expect(updates.length, 'Blur committet sofort').toBe(1);
    await waitDebounce();
    expect(updates.length, 'kein Doppel-Commit nach dem Blur').toBe(1);
  });
});

describe('Present Round 42 — widget text colour (2)', () => {
  it('applies a visible explicit text-colour token and survives save/reopen', async () => {
    const host = await mount();
    await selectObject(host, 'widget-1');
    await rapidInputEvents(input(host, 'Object text colour'), ['#065f46']);
    await waitDebounce();
    const widgetEntry = (latest!.presentData!.slides[0]!.sceneObjects as unknown as Array<Record<string, unknown>>)
      .find((object) => object.id === 'widget-1')!;
    expect(readPresentObjectStyle(widgetEntry).textColor).toBe('#065f46');

    const frame = objectElement(host, 'widget-1').querySelector<HTMLElement>('[data-present-widget-chrome]');
    expect(frame, 'Widget-Frame').not.toBeNull();
    expect(frame!.getAttribute('data-present-widget-text-color'), 'expliziter Textfarben-Token').toBe('#065f46');
    expect(frame!.className, 'Theme-Klasse für alle Textknoten').toContain('present-widget-text-themed');
    expect(frame!.style.getPropertyValue('--present-widget-text'), 'CSS-Variable').toBe('#065f46');

    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(latest!));
    const reopenedWidget = (reopened.presentData!.slides[0]!.sceneObjects as unknown as Array<Record<string, unknown>>)
      .find((object) => object.id === 'widget-1')!;
    expect(readPresentObjectStyle(reopenedWidget).textColor, 'Save/Reopen erhält die Textfarbe').toBe('#065f46');
  });
});

// ---------------------------------------------------------------------------------------------
// Notes page: split layout + debounced typing
// ---------------------------------------------------------------------------------------------
let notesUpdates: PresentSlide[] = [];

function ControlledNotes({ activeIndex }: { activeIndex: number }) {
  const [model, setModel] = useState<PresentDocumentModel>(() => presentData([
    slideWith({ id: 'slide-1', speakerNotes: 'Existing speaker notes', title: 'First' }),
    slideWith({ id: 'slide-2', speakerNotes: '', title: 'Second' }),
  ]));
  notesUpdates = notesUpdates; // keep global array identity
  return createElement(PresentViewWorkspace, {
    view: 'notes',
    slide: model.slides[activeIndex]!,
    slideIndex: activeIndex,
    model,
    embeddedObjects: [] as never,
    onUpdateSlide: (updated: PresentSlide) => {
      notesUpdates.push(updated);
      setModel((current) => ({ ...current, slides: current.slides.map((slide) => (slide.id === updated.id ? updated : slide)) }));
    },
    onUpdateModel: (next: PresentDocumentModel) => setModel(next),
  });
}

async function mountNotes(activeIndex = 0): Promise<HTMLElement> {
  notesUpdates = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(ControlledNotes, { activeIndex })); });
  return container;
}

async function typeNotes(textarea: HTMLTextAreaElement, values: string[]): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    for (const value of values) {
      setter?.call(textarea, value);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await Promise.resolve();
  });
}

describe('Present Round 42 — notes redesign + typing latency (4)', () => {
  it('splits into a large slide and a glass notes area; typing commits once per debounce', async () => {
    const host = await mountNotes(0);
    expect(host.querySelector('[data-present-notes-layout="split"]'), 'Split-Layout').not.toBeNull();
    expect(host.querySelector('[data-present-notes-slide="true"]'), 'große Folie links').not.toBeNull();
    expect(host.querySelector('[data-present-notes-page="true"]'), 'Glass-Notizbereich rechts').not.toBeNull();
    expect(host.querySelector('[data-present-notes-position="true"]')!.textContent, 'Toolbar Folie X von Y').toContain('Slide 1 of 2');
    expect(host.querySelector('[data-present-slide-preview="notes-thumbnail"]'), 'voll gerenderte Folie').not.toBeNull();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Speaker notes"]')!;
    expect(textarea.value).toBe('Existing speaker notes');

    await typeNotes(textarea, ['N', 'Ne', 'New', 'New ', 'New n', 'New notes']);
    expect(notesUpdates.length, 'kein Commit pro Buchstabe').toBe(0);
    await settle(360);
    expect(notesUpdates.length, 'genau ein Commit nach dem Debounce').toBe(1);
    expect(notesUpdates[0]!.speakerNotes, 'finaler Notiztext').toBe('New notes');

    // Blur commits immediately (and never duplicates a later debounce commit).
    await typeNotes(textarea, ['Blurred notes']);
    await act(async () => { textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await settle(30); });
    expect(notesUpdates.length, 'Blur commit').toBe(2);
    await settle(360);
    expect(notesUpdates.length, 'kein späterer Doppel-Commit').toBe(2);
  });

  it('commits pending notes when navigating away (unmount)', async () => {
    const host = await mountNotes(0);
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Speaker notes"]')!;
    await typeNotes(textarea, ['Pending before navigation']);
    expect(notesUpdates.length).toBe(0);
    await act(async () => { root!.render(createElement(ControlledNotes, { activeIndex: 1 })); await settle(60); });
    expect(notesUpdates.length, 'Navigation committet die offenen Notizen').toBe(1);
    expect(notesUpdates[0]!.id).toBe('slide-1');
    expect(notesUpdates[0]!.speakerNotes).toBe('Pending before navigation');
    expect(host.querySelector('[data-present-notes-position="true"]')!.textContent).toContain('Slide 2 of 2');
  });
});

describe('Present Round 42 — animations discoverable (5)', () => {
  it('per-object inspector: preset, duration, trigger, remove, save/reopen', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    const panel = host.querySelector<HTMLElement>('[data-present-animation-panel="true"]');
    expect(panel, 'Animation-Panel im Inspector').not.toBeNull();

    const presetSelect = panel!.querySelector<HTMLSelectElement>('select[aria-label="Animation preset"]')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(presetSelect, 'entrance-fade');
      presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(30);
    });
    let animations = (latest!.presentData!.slides[0]!.animations ?? []);
    expect(animations.length, 'Fade-in angelegt').toBe(1);
    expect(animations[0]!.targetId).toBe('text-1');
    expect(animations[0]!.effect).toBe('fade-in');

    const duration = panel!.querySelector<HTMLInputElement>('input[aria-label="Animation duration"]')!;
    await act(async () => {
      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      inputSetter?.call(duration, '900');
      duration.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(30);
    });
    animations = latest!.presentData!.slides[0]!.animations ?? [];
    expect(animations[0]!.durationMs, 'Dauer konfigurierbar').toBe(900);

    const trigger = panel!.querySelector<HTMLSelectElement>('select[aria-label="Animation trigger"]')!;
    await act(async () => {
      setter?.call(trigger, 'after-previous');
      trigger.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(30);
    });
    expect((latest!.presentData!.slides[0]!.animations ?? [])[0]!.trigger).toBe('after-previous');

    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(latest!));
    expect((reopened.presentData!.slides[0]!.animations ?? [])[0]!.effect, 'Save/Reopen erhält Animation').toBe('fade-in');
    expect((reopened.presentData!.slides[0]!.animations ?? [])[0]!.durationMs).toBe(900);

    // Preview uses the existing engine (no crash, no document change from the preview itself).
    const updatesBeforePreview = updates.length;
    await clickElement(panel!.querySelector('[aria-label="Preview object animation"]')!);
    expect(updates.length, 'Vorschau schreibt nicht ins Dokument').toBe(updatesBeforePreview);

    // Remove the animation again.
    await clickElement(panel!.querySelector('[aria-label="Remove object animation"]')!);
    expect((latest!.presentData!.slides[0]!.animations ?? []), 'Animation entfernt').toHaveLength(0);
  });

  it('toolbar exposes the animations panel (Mehr → Open animations panel)', async () => {
    const host = await mount();
    await clickElement(host.querySelector('[data-present-more-button="true"]')!);
    const openButton = document.querySelector<HTMLElement>('[data-present-open-animations="true"]');
    expect(openButton, 'Mehr-Menü hat Animations-Eintrag').not.toBeNull();
    await clickElement(openButton!);
    expect(document.querySelector('[data-present-more-menu="true"]'), 'Mehr-Menü schließt').toBeNull();
    expect(host.textContent, 'bestehender Animation-Pane sichtbar').toContain('Animation');
    // The primary-zone panel toggle stays available too.
    expect(host.querySelector('[data-present-panel-toggles="true"] button[aria-label]'), 'Panel-Toggles').not.toBeNull();
  });

  it('presenter playback reads the stored slide.animations (existing engine wiring contract)', () => {
    const source = readFileSync('src/apps/present/presenter/PresenterModeModal.tsx', 'utf8');
    expect(source, 'Playback liest slide.animations').toMatch(/slide\?\.animations/);
    expect(source, 'Playback führt die Animationen mit Fortschritt aus').toContain('animationProgressById');
    expect(source, 'Engine-Normalisierung im Playback').toContain('normalizePresentAnimation');
    expect(source, 'Klick-Gruppen/Trigger im Playback').toContain('buildAnimationPlaybackGroups');
  });
});
