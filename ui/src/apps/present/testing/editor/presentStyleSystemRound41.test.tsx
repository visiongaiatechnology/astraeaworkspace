// @vitest-environment happy-dom
// STATUS: GOLD — Present Round 41: additive style system, slide backgrounds, editable branding
//
// (B) Every scene object (text/shape/widget/…) has a "Style"/"Background" inspector backed by the
// additive optional `presentStyle` extension; cards have background/text colour; the slide supports
// solid colour, a two-stop linear gradient and an authored background image (existing Data-URL path,
// size limited). Everything is optional → old documents stay readable and no migration is required.
// (C) The footer text/visibility/alignment are authored on the slide master; the old hardcoded
// second footer line is gone.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import {
  DEFAULT_PRESENT_HANDOUT_MASTER,
  DEFAULT_PRESENT_MASTERS,
  DEFAULT_PRESENT_NOTES_MASTER,
  DEFAULT_PRESENT_THEMES,
} from '../../design/presentDesign';
import {
  PRESENT_STYLE_IMAGE_MAX_BYTES,
  presentBackgroundImageFitsLimit,
  readPresentObjectStyle,
  resolvePresentObjectStyle,
  withPresentSlideBackgroundStyle,
} from '../../contracts/presentStyle';
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
const SHAPE_OBJECT = {
  id: 'shape-1', kind: 'shape', shape: 'rectangle', xPercent: 50, yPercent: 10,
  widthPercent: 20, heightPercent: 15, fillColor: '#2563eb', strokeColor: '#60a5fa',
  strokeWidth: 2, opacity: 1, zIndex: 21,
};
const WIDGET_OBJECT = {
  id: 'widget-1', kind: 'widget', widgetType: 'quote', label: 'Quote', value: 'Stay focused',
  accentColor: '#2563eb', xPercent: 10, yPercent: 55, widthPercent: 30, heightPercent: 22,
  opacity: 1, zIndex: 22,
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function stubbedStageRect(): DOMRect {
    return { x: 0, y: 0, width: 960, height: 540, top: 0, left: 0, right: 960, bottom: 540, toJSON: () => ({}) } as DOMRect;
  };
});

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  latest = null;
  document.body.innerHTML = '';
});

function slideWith(patch: Record<string, unknown> = {}): PresentSlide {
  return {
    id: 'slide-1', title: '', subtitle: '', layout: 'blank', cards: [], speakerNotes: '',
    sceneObjects: [TEXT_OBJECT, SHAPE_OBJECT, WIDGET_OBJECT] as never,
    ...patch,
  } as PresentSlide;
}

function presentDataWith(slide: PresentSlide): PresentDocumentModel {
  return {
    slides: [slide],
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
    id: 'present-round-41-style', title: 'Present Round 41 Style', kind: 'Present',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default', root_object_ids: [], objects: {},
    presentData: presentDataWith(slide),
  } as WorkspaceDocument;
}

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
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

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
}

function objectEntry(id: string): Record<string, unknown> {
  const objects = (latest?.presentData?.slides?.[0]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
  const object = objects.find((candidate) => candidate.id === id);
  if (!object) throw new Error(`object ${id} missing`);
  return object;
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function setInputValue(input: Element, value: string): Promise<void> {
  const prototype = input instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  });
}

async function selectObject(host: HTMLElement, id: string): Promise<void> {
  await clickElement(objectElement(host, id));
}

function styleInput(host: HTMLElement, ariaLabel: string): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (!input) throw new Error(`style input "${ariaLabel}" not rendered`);
  return input;
}

/** Round 42: the style panel debounces commits (~160 ms); wait for the single document commit. */
async function flushStyleDebounce(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 260); }); });
}

describe('Present Round 41 — object style system (B)', () => {
  it('text style: colour/typography/border/gradient are written additively and rendered', async () => {
    const host = await mount();
    await selectObject(host, 'text-1');
    expect(host.querySelector('[data-present-style-panel="true"]'), 'Style-Panel im Inspector').not.toBeNull();
    expect(host.querySelectorAll('[data-present-style-tab]').length, 'Tabs Stil/Hintergrund').toBe(2);

    // Style tab: text colour + font size + weight + alignment + border + opacity.
    await setInputValue(styleInput(host, 'Object text colour'), '#b91c1c');
    await setInputValue(styleInput(host, 'Style font size'), '34');
    await setInputValue(host.querySelector('select[aria-label="Style font weight"]')!, 'bold');
    await setInputValue(host.querySelector('select[aria-label="Style text alignment"]')!, 'center');
    await setInputValue(styleInput(host, 'Border colour'), '#0ea5e9');
    await setInputValue(styleInput(host, 'Border width'), '4');
    await setInputValue(styleInput(host, 'Border radius'), '16');
    await setInputValue(styleInput(host, 'Object opacity'), '0.8');
    await flushStyleDebounce();

    const style = readPresentObjectStyle(objectEntry('text-1'));
    expect(style.textColor, 'Textfarbe additiv gespeichert').toBe('#b91c1c');
    expect(style.fontSizePt).toBe(34);
    expect(style.fontWeight).toBe('bold');
    expect(style.textAlign).toBe('center');
    expect(style.border, 'Rahmen additiv').toMatchObject({ color: '#0ea5e9', width: 4, radius: 16 });
    expect(style.opacity).toBe(0.8);

    const textHost = objectElement(host, 'text-1');
    expect((textHost.firstElementChild as HTMLElement).style.color, 'Renderer nutzt die Textfarbe').toBe('#b91c1c');
    expect(textHost.style.border, 'Renderer nutzt den Rahmen').toContain('4px');
    expect(textHost.style.borderRadius).toBe('16px');
    expect(Number(textHost.style.opacity)).toBeCloseTo(0.8, 3);

    // Background tab: gradient (2 stops + angle) replaces the solid background.
    await clickElement(host.querySelector('[data-present-style-tab="background"]')!);
    await clickElement(host.querySelector('input[aria-label="Use gradient"]')!);
    await setInputValue(styleInput(host, 'Gradient from'), '#ffffff');
    await setInputValue(styleInput(host, 'Gradient to'), '#93c5fd');
    await setInputValue(styleInput(host, 'Gradient angle'), '45');
    await flushStyleDebounce();
    const gradientStyle = readPresentObjectStyle(objectEntry('text-1'));
    expect(gradientStyle.backgroundGradient).toEqual({ type: 'linear', from: '#ffffff', to: '#93c5fd', angle: 45 });
    expect(objectElement(host, 'text-1').style.backgroundImage, 'Gradient im Renderer').toBe('linear-gradient(45deg, #ffffff, #93c5fd)');

    // Reset: deleting the extension restores the kind defaults (no data repair, no migration).
    await clickElement(host.querySelector('[data-present-style-tab="style"]')!);
    await clickElement(host.querySelector('[data-present-style-reset="true"]')!);
    expect(Object.keys(readPresentObjectStyle(objectEntry('text-1'))), 'Reset entfernt nur die Erweiterung').toEqual([]);
    expect(resolvePresentObjectStyle(objectEntry('text-1')).textColor, 'Default-Farbe wieder aktiv').toBe('#0f172a');
    expect(objectElement(host, 'text-1').style.border, 'Rahmen zurückgesetzt').toBeFalsy();
  });

  it('shape and widget styling use the same contract (background/fill, border, widget chrome)', async () => {
    const host = await mount();
    await selectObject(host, 'shape-1');
    await setInputValue(styleInput(host, 'Object text colour'), '#111827');
    await clickElement(host.querySelector('[data-present-style-tab="background"]')!);
    await setInputValue(styleInput(host, 'Object background colour'), '#f59e0b');
    await flushStyleDebounce();
    const shape = objectEntry('shape-1');
    expect(readPresentObjectStyle(shape).backgroundColor).toBe('#f59e0b');
    // The shape renderer receives the style fill (inner rect uses it).
    const shapeFill = objectElement(host, 'shape-1').firstElementChild as HTMLElement;
    expect(shapeFill.style.backgroundColor).toBe('#f59e0b');

    await selectObject(host, 'widget-1');
    await clickElement(host.querySelector('[data-present-style-tab="background"]')!);
    await setInputValue(styleInput(host, 'Object background colour'), '#ecfdf5');
    await clickElement(host.querySelector('[data-present-style-tab="style"]')!);
    await setInputValue(styleInput(host, 'Object text colour'), '#065f46');
    await flushStyleDebounce();
    const widgetStyle = readPresentObjectStyle(objectEntry('widget-1'));
    expect(widgetStyle.backgroundColor).toBe('#ecfdf5');
    expect(widgetStyle.textColor).toBe('#065f46');
    const widgetFrame = objectElement(host, 'widget-1').querySelector<HTMLElement>('[data-present-widget-chrome]');
    expect(widgetFrame, 'Widget-Frame meldet gestylten Chrome').not.toBeNull();
    expect(widgetFrame!.style.backgroundColor).toBe('#ecfdf5');
    expect(widgetFrame!.style.color).toBe('#065f46');
  });

  it('present cards accept background and text colours and render them', async () => {
    const host = await mount(slideWith({
      layout: 'cards',
      cards: [{ id: 'card-1', title: 'Card one', description: 'Body', colorTheme: 'blue' }],
    }));
    const card = host.querySelector<HTMLElement>('[data-present-card-id="card-1"]');
    expect(card, 'Karte gerendert').not.toBeNull();
    await setInputValue(host.querySelector<HTMLInputElement>('input[aria-label="Card 1 background colour"]')!, '#1e293b');
    await setInputValue(host.querySelector<HTMLInputElement>('input[aria-label="Card 1 text colour"]')!, '#fde68a');
    const cardEntry = (latest!.presentData!.slides[0]!.cards![0]) as unknown as Record<string, unknown>;
    expect((cardEntry.presentStyle as Record<string, unknown>).backgroundColor).toBe('#1e293b');
    expect((cardEntry.presentStyle as Record<string, unknown>).textColor).toBe('#fde68a');
    expect(host.querySelector<HTMLElement>('[data-present-card-id="card-1"]')!.style.backgroundColor).toBe('#1e293b');
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Card 1 background colour"]')!.value).toBe('#1e293b');
  });
});

describe('Present Round 41 — slide backgrounds (B)', () => {
  it('slide gradient is authored in the inline inspector and rendered under the objects', async () => {
    const host = await mount();
    await clickElement(host.querySelector('[data-present-more-button="true"]')!);
    const dialog = document.querySelector<HTMLElement>('[data-present-more-menu="true"]')!;
    await clickElement(dialog.querySelector<HTMLElement>('input[aria-label="Use slide gradient"]')!);
    await setInputValue(styleInput(document.body as unknown as HTMLElement, 'Slide gradient from'), '#0ea5e9');
    await setInputValue(styleInput(document.body as unknown as HTMLElement, 'Slide gradient to'), '#22d3ee');
    await setInputValue(styleInput(document.body as unknown as HTMLElement, 'Slide gradient angle'), '120');
    const slide = latest!.presentData!.slides[0]!;
    expect(slide.backgroundGradient).toEqual({ type: 'linear', from: '#0ea5e9', to: '#22d3ee', angle: 120 });
    const stage = host.querySelector<HTMLElement>('[data-present-stage="true"]')!;
    expect(stage.style.backgroundImage, 'Gradient auf der Bühne').toContain('linear-gradient(120deg');
    // Objects still render above the background layer.
    expect(host.querySelector('[data-present-object-id="text-1"]')).not.toBeNull();
  });

  it('authored slide background image: size limit + renderer uses it below all objects', async () => {
    const slide = withPresentSlideBackgroundStyle({ ...slideWith() } as unknown as object, {
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    }) as unknown as PresentSlide;
    const host = await mount(slide);
    const stage = host.querySelector<HTMLElement>('[data-present-stage="true"]')!;
    expect(stage.style.backgroundImage, 'Bild als Bühnenhintergrund').toContain('data:image/png');
    expect(stage.style.backgroundSize).toBe('cover');
    expect(host.querySelector('[data-present-object-id="text-1"]'), 'Objekte liegen darüber').not.toBeNull();

    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    expect(presentBackgroundImageFitsLimit(tinyPng), 'kleines Bild erlaubt').toBe(true);
    const oversized = `data:image/png;base64,${'A'.repeat(Math.ceil((PRESENT_STYLE_IMAGE_MAX_BYTES * 4) / 3) + 4000)}`;
    expect(presentBackgroundImageFitsLimit(oversized), 'über dem Limit abgelehnt').toBe(false);
    expect(presentBackgroundImageFitsLimit('data:text/plain;base64,AAAA'), 'kein Bild abgelehnt').toBe(false);
  });
});

describe('Present Round 41 — editable branding + persistence (C)', () => {
  it('footer text/visibility/position are authored; no hardcoded branding line remains', async () => {
    const host = await mount();
    const footer = host.querySelector<HTMLElement>('[data-present-footer="true"]');
    expect(footer, 'Footer gerendert').not.toBeNull();
    expect(footer!.textContent, 'Footer-Text aus dem Master').toContain(DEFAULT_PRESENT_MASTERS[0]!.footerText!);
    expect(host.textContent, 'kein hartkodierter zweiter Branding-Text').not.toContain('Local-first Sovereign Present');

    // Author text, alignment and visibility through the real "More" inspector.
    await clickElement(host.querySelector('[data-present-more-button="true"]')!);
    await setInputValue(styleInput(document.body as unknown as HTMLElement, 'Footer text'), '© 2026 Example Corp · Internal');
    await setInputValue(document.querySelector<HTMLSelectElement>('select[aria-label="Footer position"]')!, 'center');
    let stageFooter = host.querySelector<HTMLElement>('[data-present-footer="true"]')!;
    expect(stageFooter.textContent).toContain('© 2026 Example Corp · Internal');
    expect(stageFooter.getAttribute('data-present-footer-position')).toBe('center');
    const masterAfterEdit = latest!.presentData!.masters![0] as unknown as Record<string, unknown>;
    expect(masterAfterEdit.footerText).toBe('© 2026 Example Corp · Internal');
    expect(masterAfterEdit.footerPosition).toBe('center');

    await clickElement(document.querySelector<HTMLElement>('input[aria-label="Show footer"]')!);
    expect(host.querySelector('[data-present-footer="true"]'), 'Footer ausblendbar').toBeNull();
    expect((latest!.presentData!.masters![0] as unknown as Record<string, unknown>).showFooter).toBe(false);
  });

  it('canonical save/reopen keeps object style, card style and slide background', async () => {
    const cardSlide = slideWith({
      layout: 'cards',
      cards: [{ id: 'card-1', title: 'Card one', description: 'Body', colorTheme: 'blue' }],
    });
    const host = await mount(withPresentSlideBackgroundStyle({ ...cardSlide } as unknown as object, {
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    }) as unknown as PresentSlide);

    await selectObject(host, 'text-1');
    await setInputValue(styleInput(host, 'Object text colour'), '#7c3aed');
    await clickElement(host.querySelector('[data-present-style-tab="background"]')!);
    await clickElement(host.querySelector('input[aria-label="Use gradient"]')!);
    await setInputValue(host.querySelector<HTMLInputElement>('input[aria-label="Card 1 background colour"]')!, '#334155');
    await flushStyleDebounce();

    const saved = serializeWorkspaceDocumentCanonical(latest!);
    const reopened = deserializeWorkspaceDocumentCanonical(saved);
    const reopenedSlide = reopened.presentData!.slides[0] as unknown as Record<string, unknown>;
    const reopenedObjects = reopenedSlide.sceneObjects as Array<Record<string, unknown>>;
    const text = reopenedObjects.find((object) => object.id === 'text-1')!;
    expect(readPresentObjectStyle(text).textColor, 'Objekt-Style überlebt Save/Reopen').toBe('#7c3aed');
    expect(readPresentObjectStyle(text).backgroundGradient, 'Gradient überlebt Save/Reopen').toBeTruthy();
    const card = (reopenedSlide.cards as Array<Record<string, unknown>>)[0]!;
    expect((card.presentStyle as Record<string, unknown>).backgroundColor, 'Card-Style überlebt Save/Reopen').toBe('#334155');
    const background = (reopenedSlide.presentBackgroundStyle as Record<string, unknown>);
    expect(background.imageDataUrl, 'Slide-Hintergrundbild überlebt Save/Reopen').toContain('data:image/png');
    // Old documents without the optional extension remain valid (readers return an empty style).
    expect(readPresentObjectStyle({ id: 'legacy', kind: 'text', text: 'x' })).toEqual({});
  });
});
