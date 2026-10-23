// @vitest-environment happy-dom
// STATUS: GOLD — Release 0.1 · Present core-module acceptance.
//
// Covers the release-critical core paths end-to-end through the real PresentCanvas mount:
//   1) slide create/duplicate/delete/navigate with no data loss (incl. undo restore),
//   2) text create -> edit -> commit,
//   3) scene objects move/resize/rotate with one commit per gesture,
//   4) images move/resize + explicit image-insert error surface,
//   5) single-screen presentation mode: start, navigate, notes visible, ESC close, editor intact,
//   6) canonical save/reopen roundtrip (text, styles, images, slides, notes, animations, cards),
//   7) dead/misleading-button audit (static scan + accessible primary-toolbar buttons),
//   8) 50+ slide deck: mount + 20 keyboard navigations stay fast and correct.
// True native rendering/decoder paths remain NOT_TESTED (happy-dom has no compositor/decoder);
// those are listed in the release report for the human frontend test.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import {
  DEFAULT_PRESENT_HANDOUT_MASTER,
  DEFAULT_PRESENT_MASTERS,
  DEFAULT_PRESENT_NOTES_MASTER,
  DEFAULT_PRESENT_THEMES,
} from '../../design/presentDesign';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';
import { presentImageInsertionFromFile } from '../../media/presentMediaSecurity';

vi.setConfig({ testTimeout: 120_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const TEXT = (id: string, text: string) => ({
  id, kind: 'text', text, xPercent: 10, yPercent: 10, widthPercent: 30, heightPercent: 14,
  fontSizePt: 22, fontWeight: 'semibold', color: '#0f172a', textAlign: 'left', opacity: 1, zIndex: 20,
});
const SHAPE = (id: string) => ({
  id, kind: 'shape', shape: 'rectangle', xPercent: 55, yPercent: 55, widthPercent: 20, heightPercent: 16,
  fillColor: '#2563eb', strokeColor: '#60a5fa', strokeWidth: 2, opacity: 1, zIndex: 21,
});

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;
let updates: WorkspaceDocument[] = [];

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function stubbedStageRect(): DOMRect {
    return { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT, top: 0, left: 0, right: STAGE_WIDTH, bottom: STAGE_HEIGHT, toJSON: () => ({}) } as DOMRect;
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

function slideWith(id: string, patch: Record<string, unknown> = {}): PresentSlide {
  return {
    id, title: '', subtitle: '', layout: 'blank', cards: [], speakerNotes: '',
    sceneObjects: [], ...patch,
  } as PresentSlide;
}

function presentDataWith(slides: PresentSlide[]): PresentDocumentModel {
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

function documentWith(slides: PresentSlide[]): WorkspaceDocument {
  return {
    id: 'present-release-01', title: 'Present Release 01', kind: 'Present',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default', root_object_ids: [], objects: {},
    presentData: presentDataWith(slides),
  } as WorkspaceDocument;
}

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  latest = document;
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => { updates.push(next); setDocument(next); },
    workspaceDocuments: [],
    networkCapability: 'offline',
    keyVaultUnlocked: false,
    onSelectSelectionType: vi.fn(),
  } as never);
}

async function mount(slides: PresentSlide[] = [slideWith('slide-1')]): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(ControlledPresenter, { start: documentWith(slides) })); });
  return container;
}

async function settle(ms = 60): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function slides(): PresentSlide[] {
  return (latest?.presentData?.slides ?? []) as PresentSlide[];
}

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage not rendered');
  return element;
}

function objectElement(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`object ${id} not rendered`);
  return element;
}

function objectEntry(slideIndex: number, id: string): Record<string, unknown> {
  const object = ((slides()[slideIndex]?.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>).find((candidate) => candidate.id === id);
  if (!object) throw new Error(`object ${id} missing on slide ${slideIndex + 1}`);
  return object;
}

async function clickElement(target: Element | null | undefined): Promise<void> {
  if (!target) throw new Error('click target missing');
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function pressKey(target: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  await act(async () => { target.dispatchEvent(event); await settle(); });
  return event;
}

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
}

/** Press, N rAF-spaced moves, release — the same pointer contract the multi-object perf tests use. */
async function dragAcrossFrames(target: Element, from: { x: number; y: number }, to: { x: number; y: number }, frames = 5): Promise<void> {
  await act(async () => { target.dispatchEvent(pointerEvent('pointerdown', from.x, from.y)); await settle(30); });
  for (let frame = 1; frame <= frames; frame += 1) {
    const x = from.x + ((to.x - from.x) * frame) / frames;
    const y = from.y + ((to.y - from.y) * frame) / frames;
    await act(async () => { window.dispatchEvent(pointerEvent('pointermove', x, y)); await settle(30); });
  }
  await act(async () => { window.dispatchEvent(pointerEvent('pointerup', to.x, to.y)); await settle(60); });
}

async function doubleClickStage(host: HTMLElement, clientX = 288, clientY = 162): Promise<void> {
  await act(async () => {
    stage(host).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY }));
    await settle();
  });
}

async function doubleClickObject(host: HTMLElement, id: string): Promise<void> {
  await act(async () => {
    objectElement(host, id).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function typeIntoTextEditor(host: HTMLElement, value: string): Promise<HTMLTextAreaElement> {
  const textarea = host.querySelector<HTMLTextAreaElement>('[data-present-object-id] textarea');
  if (!textarea) throw new Error('text editor textarea not rendered');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(30);
  });
  return textarea;
}

describe('Release 0.1 Present — slides (1)', () => {
  it('create, duplicate, delete and navigate keep slide content (and undo restores a delete)', async () => {
    const host = await mount([
      slideWith('slide-1', { sceneObjects: [TEXT('text-1', 'Slide one')] as never }),
      slideWith('slide-2', { sceneObjects: [TEXT('text-2', 'Slide two')] as never }),
      slideWith('slide-3', { sceneObjects: [TEXT('text-3', 'Slide three')] as never }),
    ]);
    expect(slides(), 'Ausgangsdeck').toHaveLength(3);

    // Add a slide with the primary sidebar action.
    await clickElement(host.querySelector('[data-vgt-app-guide-anchor="Present:first"]'));
    expect(slides(), 'Folie angelegt').toHaveLength(4);
    expect(slides()[3]!.layout, 'neue Folie bleibt blank/freeform').toBe('blank');

    // Duplicate slide 1: content is preserved (new ids are fine, text/data must not be lost).
    await clickElement(host.querySelector('[data-present-slide-thumbnail="1"] button[aria-label="Duplicate Slide"]'));
    expect(slides(), 'Folie dupliziert').toHaveLength(5);
    const duplicatedTexts = slides().map((slide) => ((slide.sceneObjects ?? [])[0] as { text?: string } | undefined)?.text);
    expect(duplicatedTexts.filter((text) => text === 'Slide one'), 'Duplikat enthält den Text').toHaveLength(2);

    // Navigate through the thumbnails; selection is visible via aria-current.
    await clickElement(host.querySelector('[data-present-slide-thumbnail="2"]'));
    expect(host.querySelector('[data-present-slide-thumbnail="2"]')!.getAttribute('aria-current'), 'aktive Folie markiert').toBe('true');
    expect(host.querySelector<HTMLElement>('[data-present-object-id]'), 'Folie 2 ist auf der Bühne').not.toBeNull();

    // Delete slide 2, then one undo restores exactly that slide (no data loss).
    const deckBeforeDelete = JSON.stringify(slides());
    await clickElement(host.querySelector('[data-present-slide-thumbnail="2"] button[aria-label="Delete Slide"]'));
    expect(slides(), 'Folie gelöscht').toHaveLength(4);
    expect(JSON.stringify(slides()), 'Löschung betrifft nur eine Folie').not.toBe(deckBeforeDelete);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await settle(120);
    });
    expect(slides(), 'Undo stellt die Folie wieder her').toHaveLength(5);
    expect(slides().map((slide) => slide.id), 'wiederhergestellte Folie').toContain('slide-2');
    expect(((slides().find((slide) => slide.id === 'slide-2')!.sceneObjects ?? [])[0] as { text?: string }).text, 'Text der Folie erhalten').toBe('Slide two');
  });
  it('reorders slides by drag & drop without losing any content', async () => {
    const host = await mount([
      slideWith('slide-1', { sceneObjects: [TEXT('text-1', 'Alpha')] as never }),
      slideWith('slide-2', { sceneObjects: [TEXT('text-2', 'Beta')] as never }),
      slideWith('slide-3', { sceneObjects: [TEXT('text-3', 'Gamma')] as never }),
    ]);
    const idsBefore = slides().map((slide) => slide.id);
    const first = host.querySelector<HTMLElement>('[data-present-slide-thumbnail="1"]');
    const third = host.querySelector<HTMLElement>('[data-present-slide-thumbnail="3"]');
    expect(first, 'Thumbnail 1 vorhanden').not.toBeNull();
    expect(third, 'Thumbnail 3 vorhanden').not.toBeNull();
    await act(async () => {
      first!.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }));
      await settle(30);
      third!.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      await settle(30);
      third!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
      await settle(120);
    });
    expect(slides(), 'keine Folie verloren').toHaveLength(3);
    expect(slides().map((slide) => slide.id).sort(), 'gleiche Folien nur umsortiert').toEqual([...idsBefore].sort());
    expect(slides()[2]!.id, 'Folie 1 wurde ans Ende gezogen').toBe('slide-1');
    expect(((slides()[2]!.sceneObjects ?? [])[0] as { text?: string }).text, 'Inhalt beim Umsortieren erhalten').toBe('Alpha');
    expect(((slides()[0]!.sceneObjects ?? [])[0] as { text?: string }).text).toBe('Beta');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await settle(120);
    });
    expect(slides().map((slide) => slide.id), 'Undo stellt die alte Reihenfolge her').toEqual(idsBefore);
  });
});

describe('Release 0.1 Present — text (2)', () => {
  it('double-click creates a text box; editing commits on blur and survives re-editing', async () => {
    const host = await mount([slideWith('slide-1')]);
    await doubleClickStage(host);
    const created = (slides()[0]!.sceneObjects ?? []) as unknown as Array<Record<string, unknown>>;
    expect(created, 'Textobjekt per Doppelklick').toHaveLength(1);
    const textId = created[0]!.id as string;
    expect(created[0]!.kind).toBe('text');

    await doubleClickObject(host, textId);
    const editor = await typeIntoTextEditor(host, 'Release text');
    expect(editor.value).toBe('Release text');
    await act(async () => { editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await settle(120); });
    expect(objectEntry(0, textId).text, 'Text im Dokument').toBe('Release text');
    expect(host.querySelector(`[data-present-object-id="${textId}"] textarea`), 'Editor nach Blur geschlossen').toBeNull();
    expect(host.textContent, 'Text auf der Bühne sichtbar').toContain('Release text');

    // Re-edit the same object: no duplicate object, update keeps identity.
    await doubleClickObject(host, textId);
    const secondEditor = await typeIntoTextEditor(host, 'Release text edited');
    await act(async () => { secondEditor.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await settle(120); });
    expect((slides()[0]!.sceneObjects ?? []) as unknown[], 'kein Duplikat beim Re-Edit').toHaveLength(1);
    expect(objectEntry(0, textId).text, 'zweiter Edit committed').toBe('Release text edited');
  });
});

describe('Release 0.1 Present — objects (2)', () => {
  it('move/resize/rotate commit once per gesture and undo reverts the gesture', async () => {
    const host = await mount([slideWith('slide-1', { sceneObjects: [TEXT('text-1', 'Move me'), SHAPE('shape-1')] as never })]);

    // Move: exactly one commit on release.
    const startX = objectEntry(0, 'text-1').xPercent as number;
    await dragAcrossFrames(objectElement(host, 'text-1'), { x: 240, y: 140 }, { x: 336, y: 140 });
    expect(updates, 'ein Commit für den Move').toHaveLength(1);
    expect(objectEntry(0, 'text-1').xPercent, 'finale X-Position').toBeCloseTo(startX + ((336 - 240) / STAGE_WIDTH) * 100, 3);

    // Resize via the south-east handle.
    const sizeBefore = objectEntry(0, 'text-1').widthPercent as number;
    await clickElement(objectElement(host, 'text-1'));
    await dragAcrossFrames(host.querySelector('[data-present-handle="resize-se"]')!, { x: 400, y: 200 }, { x: 460, y: 240 });
    expect(updates, 'ein Commit für das Resize').toHaveLength(2);
    expect(objectEntry(0, 'text-1').widthPercent, 'Breite geändert').toBeGreaterThan(sizeBefore);

    // Rotate via the rotate handle.
    const rotationBefore = Number(objectEntry(0, 'text-1').rotation ?? 0);
    await clickElement(objectElement(host, 'text-1'));
    const rotateHandle = host.querySelector<HTMLElement>('[data-present-handle="rotate"]');
    expect(rotateHandle, 'Rotate-Handle vorhanden').not.toBeNull();
    await dragAcrossFrames(rotateHandle!, { x: 400, y: 200 }, { x: 470, y: 260 });
    expect(updates, 'ein Commit für die Rotation').toHaveLength(3);
    expect(Number(objectEntry(0, 'text-1').rotation ?? 0), 'Rotation geändert').not.toBe(rotationBefore);

    // One undo reverts the whole rotation gesture.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await settle(120);
    });
    expect(Number(objectEntry(0, 'text-1').rotation ?? 0), 'Undo stellt die Rotation zurück').toBe(rotationBefore);
  });
});

describe('Release 0.1 Present — images (3)', () => {
  it('moves/resizes a floating image; an invalid image insert shows a visible error', async () => {
    const imageSlide = slideWith('slide-1', {
      images: [{ id: 'img-1', name: 'one.png', dataUrl: PNG_DATA_URL, xPercent: 20, yPercent: 30, widthPercent: 20, heightPercent: 20, opacity: 1, zIndex: 25 }] as never,
    });
    const host = await mount([imageSlide]);
    const image = host.querySelector<HTMLElement>('[aria-label^="Image object"]');
    expect(image, 'Bild gerendert').not.toBeNull();

    const imageGeometry = (): Record<string, unknown> => (slides()[0]!.images ?? [])[0] as unknown as Record<string, unknown>;
    const xBefore = imageGeometry().xPercent as number;
    await dragAcrossFrames(image!, { x: 300, y: 220 }, { x: 396, y: 220 });
    expect(updates, 'ein Commit für den Bild-Move').toHaveLength(1);
    expect(imageGeometry().xPercent, 'Bild verschoben').toBeCloseTo(xBefore + ((396 - 300) / STAGE_WIDTH) * 100, 3);

    // Resize through the floating-image selection handle.
    await clickElement(host.querySelector('[aria-label^="Image object"]'));
    const handle = host.querySelector<HTMLElement>('button[data-vgt-theme-selection-handle="true"]');
    expect(handle, 'Bild-Resize-Handle').not.toBeNull();
    const widthBefore = imageGeometry().widthPercent as number;
    await dragAcrossFrames(handle!, { x: 500, y: 300 }, { x: 560, y: 340 });
    expect(imageGeometry().widthPercent, 'Bildbreite geändert').not.toBe(widthBefore);

    // Invalid image insert: visible status instead of an unhandled rejection.
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"][accept*="image"]');
    expect(fileInput, 'Bild-Datei-Input im Toolbar').not.toBeNull();
    const file = new File(['not an image'], 'broken.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true });
    await act(async () => {
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(200);
    });
    const status = host.querySelector('[role="status"]');
    expect(status, 'Fehleranzeige statt stiller Nicht-Aktion').not.toBeNull();
    expect(status!.textContent, 'Fehlertext nennt das Bildproblem').toContain('Image insert failed');
    expect((slides()[0]!.images ?? []), 'kein kaputtes Bild gespeichert').toHaveLength(1);
  });

  it('image intake enforces type and size limits before any decode (no silent acceptance)', async () => {
    await expect(presentImageInsertionFromFile(new File([], 'empty.png', { type: 'image/png' })), 'leere Datei abgelehnt').rejects.toThrow(/size boundary/);
    await expect(presentImageInsertionFromFile(new File(['nope'], 'x.txt', { type: 'text/plain' })), 'falscher MIME abgelehnt').rejects.toThrow(/Only PNG, JPEG, and WebP/);
    await expect(
      presentImageInsertionFromFile(new File([new Uint8Array(17 * 1024 * 1024)], 'huge.png', { type: 'image/png' })),
      'über 16 MB abgelehnt',
    ).rejects.toThrow(/size boundary/);
  });
});

describe('Release 0.1 Present — presentation mode (4)', () => {
  it('single-screen start, notes visible, navigation, ESC closes and leaves the editor intact', async () => {
    const host = await mount([
      slideWith('slide-1', { title: 'First slide', speakerNotes: 'Notes for first slide', sceneObjects: [TEXT('text-1', 'One')] as never }),
      slideWith('slide-2', { title: 'Second slide', speakerNotes: 'Notes for second slide', sceneObjects: [TEXT('text-2', 'Two')] as never }),
      slideWith('slide-3', { title: 'Third slide', sceneObjects: [TEXT('text-3', 'Three')] as never }),
    ]);
    const slideCountBefore = slides().length;

    await clickElement(Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Present Slides')));
    const startDialog = host.querySelector<HTMLElement>('[data-present-start-dialog="true"]');
    expect(startDialog, 'Start-Dialog erscheint').not.toBeNull();
    const singleScreen = startDialog!.querySelector<HTMLElement>('[data-present-start-submit="true"][data-present-start-mode="single"]');
    expect(singleScreen, 'Single-Screen-Option vorhanden').not.toBeNull();
    await clickElement(singleScreen);

    const presenterDialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Presentation mode"]');
    expect(presenterDialog, 'Präsentationsmodus gestartet').not.toBeNull();
    expect(presenterDialog!.textContent, 'Folie 1 sichtbar').toContain('First slide');
    expect(presenterDialog!.textContent, 'Sprechernotizen sichtbar').toContain('Notes for first slide');

    // Navigate forward; the next slide and its notes appear.
    await pressKey(window, { key: 'ArrowRight' });
    expect(presenterDialog!.textContent, 'Navigation zur Folie 2').toContain('Second slide');
    expect(presenterDialog!.textContent, 'Notizen der Folie 2').toContain('Notes for second slide');

    // ESC ends the presentation; the editor comes back unchanged.
    await pressKey(window, { key: 'Escape' });
    expect(document.querySelector('[role="dialog"][aria-label="Presentation mode"]'), 'Präsentation beendet').toBeNull();
    expect(host.querySelector('[data-present-stage="true"]'), 'Editor wieder sichtbar').not.toBeNull();
    expect(slides(), 'keine Folien durch die Präsentation verändert').toHaveLength(slideCountBefore);
  });
});

describe('Release 0.1 Present — canonical save/reopen roundtrip (5)', () => {
  it('preserves text, styles, images, slides, notes, animations and cards', async () => {
    const richSlides: PresentSlide[] = [
      slideWith('slide-1', {
        title: 'Rich slide',
        speakerNotes: 'Release notes one',
        sceneObjects: [
          { ...TEXT('text-1', 'Styled body'), presentStyle: { textColor: '#b91c1c', fontSizePt: 30, backgroundGradient: { type: 'linear', from: '#ffffff', to: '#bae6fd', angle: 45 }, border: { color: '#0ea5e9', width: 3, radius: 12 } } },
          SHAPE('shape-1'),
        ] as never,
        images: [{ id: 'img-1', name: 'one.png', dataUrl: PNG_DATA_URL, xPercent: 50, yPercent: 60, widthPercent: 20, heightPercent: 20, opacity: 1, zIndex: 25 }] as never,
        animations: [{ id: 'anim-1', targetId: 'text-1', effect: 'fade-in', trigger: 'on-click', durationMs: 700, delayMs: 100, category: 'entrance', scope: 'object', repeatCount: 1, motionPath: [] }] as never,
      }),
      slideWith('slide-2', {
        title: 'Cards slide',
        speakerNotes: 'Release notes two',
        layout: 'cards',
        cards: [{ id: 'card-1', title: 'Card', description: 'Body', colorTheme: 'blue' }] as never,
      }),
    ];
    const original = documentWith(richSlides);
    const saved = serializeWorkspaceDocumentCanonical(original);
    const reopened = deserializeWorkspaceDocumentCanonical(saved);

    const reopenedSlides = (reopened.presentData!.slides ?? []) as PresentSlide[];
    expect(reopenedSlides, 'Folienanzahl erhalten').toHaveLength(2);
    expect(reopenedSlides[0]!.speakerNotes, 'Notizen erhalten').toBe('Release notes one');
    expect(reopenedSlides[1]!.speakerNotes, 'Notizen Folie 2 erhalten').toBe('Release notes two');
    const reopenedText = (reopenedSlides[0]!.sceneObjects ?? [])[0] as unknown as Record<string, unknown>;
    expect(reopenedText.text, 'Text erhalten').toBe('Styled body');
    expect((reopenedText.presentStyle as Record<string, unknown>).textColor, 'Textfarbe erhalten').toBe('#b91c1c');
    expect((reopenedText.presentStyle as Record<string, unknown>).fontSizePt, 'Schriftgröße erhalten').toBe(30);
    expect((reopenedText.presentStyle as Record<string, unknown>).backgroundGradient, 'Gradient erhalten').toMatchObject({ from: '#ffffff', to: '#bae6fd', angle: 45 });
    expect((reopenedSlides[0]!.images ?? [])[0]!.dataUrl, 'Bild erhalten').toBe(PNG_DATA_URL);
    expect((reopenedSlides[0]!.animations ?? [])[0]!.effect, 'Animation erhalten').toBe('fade-in');
    expect((reopenedSlides[0]!.animations ?? [])[0]!.durationMs).toBe(700);
    expect((reopenedSlides[1]!.cards ?? [])[0], 'Karte erhalten').toMatchObject({ id: 'card-1', title: 'Card' });

    // The reopened document mounts again with the same visible content (reload path).
    const host = await mount(reopenedSlides);
    expect(host.textContent, 'Text nach Reopen sichtbar').toContain('Styled body');
    expect(host.querySelector('[data-present-object-id="text-1"]'), 'Objekt nach Reopen sichtbar').not.toBeNull();
    expect(host.querySelector('[aria-label^="Image object"]'), 'Bild nach Reopen sichtbar').not.toBeNull();
  });
});

describe('Release 0.1 Present — no dead visible buttons (6)', () => {
  it('primary toolbar buttons are all named and wired source has no placeholder handlers', async () => {
    const host = await mount([slideWith('slide-1', { sceneObjects: [TEXT('text-1', 'One')] as never })]);
    const toolbar = host.querySelector<HTMLElement>('[data-present-band="true"], [data-present-toolbar-scroll="none"]');
    expect(toolbar, 'Primär-Toolbar gerendert').not.toBeNull();
    const buttons = Array.from(toolbar!.querySelectorAll<HTMLButtonElement>('button')).filter((button) => !button.disabled);
    expect(buttons.length, 'sichtbare Toolbar-Buttons').toBeGreaterThan(10);
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '';
      expect(name, `Button ohne zugänglichen Namen: ${button.outerHTML.slice(0, 120)}`).not.toBe('');
    }

    // Static guard: no placeholder/empty onClick handlers or dead href="#" anchors in the editor shell.
    const roots = ['src/apps/present/editor', 'src/apps/present/canvas'];
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const full = join(directory, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
        const source = readFileSync(full, 'utf8');
        for (const pattern of [/onClick=\{\(\)\s*=>\s*\{\s*\}\}/, /onClick=\{undefined\}/, /href="#"/, /TODO[^\n]*Button/]) {
          if (pattern.test(source)) offenders.push(`${full}: ${pattern}`);
        }
      }
    };
    for (const directory of roots) walk(directory);
    expect(offenders, 'keine toten/irreführenden Platzhalter-Handler').toEqual([]);
  });
});

describe('Release 0.1 Present — 50+ slide deck performance (7)', () => {
  it('mounts a 60-slide deck and navigates 20 slides quickly without errors', async () => {
    const deck = Array.from({ length: 60 }, (_, index) => slideWith(`slide-${index + 1}`, {
      title: `Slide ${index + 1}`,
      sceneObjects: [TEXT(`text-${index + 1}`, `Content ${index + 1}`), SHAPE(`shape-${index + 1}`)] as never,
    }));
    const mountStarted = performance.now();
    const host = await mount(deck);
    const mountMs = performance.now() - mountStarted;
    expect(slides(), '60 Folien im Dokument').toHaveLength(60);
    expect(host.querySelectorAll('[data-present-slide-thumbnail]').length, 'Thumbnail-Liste vollständig').toBeGreaterThanOrEqual(60);
    expect(mountMs, `Mount eines 60-Folien-Decks (${Math.round(mountMs)} ms)`).toBeLessThan(15_000);

    const navigationStarted = performance.now();
    for (let step = 2; step <= 21; step += 1) {
      await pressKey(window, { key: 'PageDown' });
      expect(host.querySelector(`[data-present-slide-thumbnail="${step}"]`)!.getAttribute('aria-current'), `Folie ${step} aktiv`).toBe('true');
    }
    const navigationMs = performance.now() - navigationStarted;
    expect(navigationMs, `20 Folien-Navigationen (${Math.round(navigationMs)} ms)`).toBeLessThan(10_000);

    // Undo/redo stays responsive on the large deck (navigate back up).
    await pressKey(window, { key: 'PageUp' });
    expect(host.querySelector('[data-present-slide-thumbnail="20"]')!.getAttribute('aria-current'), 'PageUp navigiert zurück').toBe('true');
  });
});
