// @vitest-environment happy-dom
// STATUS: GOLD — Present Round 40: rebuild of Notes page and the three master views
//
// User findings: the Notes view rendered overlapping/cut text, and Slide Master / Notes Master /
// Handout were plain forms with no preview. These tests drive the rebuilt views with a controlled
// document: every setting writes through the real callbacks and the live preview reads the same
// model, so nothing is a mock-up.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import { PresentViewWorkspace, type PresentExtendedView } from '../../editor/extended-views/PresentViewWorkspace';
import {
  DEFAULT_PRESENT_HANDOUT_MASTER,
  DEFAULT_PRESENT_MASTERS,
  DEFAULT_PRESENT_NOTES_MASTER,
  DEFAULT_PRESENT_THEMES,
} from '../../design/presentDesign';

vi.setConfig({ testTimeout: 60_000 });

function makeSlide(index: number): PresentSlide {
  return {
    id: `slide-${index + 1}`,
    title: `Slide ${index + 1} title`,
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: index === 0 ? 'Existing speaker notes' : '',
    sceneObjects: [],
  } as unknown as PresentSlide;
}

function makeModel(): PresentDocumentModel {
  return {
    slides: [0, 1, 2, 3].map(makeSlide),
    themeId: 'paper',
    themes: DEFAULT_PRESENT_THEMES,
    masters: DEFAULT_PRESENT_MASTERS,
    notesMaster: DEFAULT_PRESENT_NOTES_MASTER,
    handoutMaster: DEFAULT_PRESENT_HANDOUT_MASTER,
    aspectRatio: '16:9',
  } as unknown as PresentDocumentModel;
}

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

// The controlled harness publishes its latest state here so tests can assert the document side.
let lastModel: PresentDocumentModel | null = null;
let lastSlide: PresentSlide | null = null;

function HarnessPublishing({ view }: { view: PresentExtendedView }) {
  const [model, setModel] = useState<PresentDocumentModel>(makeModel);
  const [slide, setSlide] = useState<PresentSlide>(() => makeModel().slides[0]!);
  lastModel = model;
  lastSlide = slide;
  return createElement(PresentViewWorkspace, {
    view,
    slide,
    slideIndex: 0,
    model,
    embeddedObjects: [] as never,
    onUpdateSlide: (updated: PresentSlide) => {
      setSlide(updated);
      setModel((current) => ({ ...current, slides: current.slides.map((entry, index) => (index === 0 ? updated : entry)) }));
    },
    onUpdateModel: (next: PresentDocumentModel) => setModel(next),
  });
}

async function mountView(view: PresentExtendedView): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(HarnessPublishing, { view })); });
  await settle();
  return container;
}

async function fireInput(element: Element, value: string): Promise<void> {
  const prototype = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  });
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

describe('Present Round 40 — Notes page (finding 4)', () => {
  it('renders a wide readable notes page; edits write into the document', async () => {
    const host = await mountView('notes');
    const page = host.querySelector<HTMLElement>('[data-present-notes-page="true"]');
    expect(page, 'Notes-Page gerendert').not.toBeNull();
    // Round 42: the notes-master header sits above the large slide in the split layout.
    expect(host.textContent, 'Header des Notes-Masters').toContain(DEFAULT_PRESENT_NOTES_MASTER.headerText);
    expect(host.querySelector('[data-present-slide-preview="notes-thumbnail"]'), 'Slide-Thumbnail').not.toBeNull();
    const notes = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Speaker notes"]');
    expect(notes, 'Notizen-Textarea').not.toBeNull();
    expect(notes!.value, 'bestehende Notizen').toBe('Existing speaker notes');
    expect(notes!.style.fontSize, 'Notes-Typografie aus dem Master').toBe(`${DEFAULT_PRESENT_NOTES_MASTER.notesFontSizePt}pt`);

    await fireInput(notes!, 'Updated notes for slide one');
    // Round 42: notes typing commits through a debounce (~300 ms), not per keystroke.
    await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 360); }); });
    expect(lastSlide!.speakerNotes, 'Notizen landen im Dokument').toBe('Updated notes for slide one');
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Speaker notes"]')!.value).toBe('Updated notes for slide one');

    // Print settings: real master fields, wired to the model and reflected on the page.
    const printButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Print settings'));
    expect(printButton, 'Print-Settings-Button').not.toBeNull();
    await clickElement(printButton!);
    const aside = host.querySelector<HTMLElement>('[aria-label="Notes print settings"]');
    expect(aside, 'Print-Settings-Panel').not.toBeNull();
    const footerToggle = aside!.querySelector<HTMLInputElement>('input[aria-label="Show footer"]');
    expect(footerToggle).not.toBeNull();
    await clickElement(footerToggle!);
    expect(lastModel!.notesMaster!.showFooter, 'Master-Einstellung geschrieben').toBe(false);
  });
});

describe('Present Round 40 — Slide Master (finding 5)', () => {
  it('left master list + live preview + right inspector; edits reflect in the preview', async () => {
    const host = await mountView('slide-master');
    const list = host.querySelector<HTMLElement>('[aria-label="Master list"]');
    expect(list, 'Master-Liste').not.toBeNull();
    expect(list!.querySelectorAll('[data-present-master-id]').length, 'alle Master gelistet').toBe(DEFAULT_PRESENT_MASTERS.length);
    expect(host.querySelector('[data-present-slide-preview="slide-master"]'), 'Live-Slide-Preview').not.toBeNull();
    expect(host.querySelector('[aria-label="Master properties"]'), 'Properties-Inspektor').not.toBeNull();
    expect(host.textContent).toContain(`Live preview · ${DEFAULT_PRESENT_MASTERS[0]!.name}`);

    // Select the second master: the live preview names it.
    const second = host.querySelectorAll<HTMLButtonElement>('[data-present-master-id]')[1]!;
    await clickElement(second);
    expect(host.textContent, 'Vorschau folgt der Master-Auswahl').toContain(`Live preview · ${DEFAULT_PRESENT_MASTERS[1]!.name}`);

    // Change the background colour: the model updates and the preview frame uses the new colour.
    const backgroundInput = host.querySelector<HTMLInputElement>('input[aria-label="Background"]')!;
    await fireInput(backgroundInput, '#123456');
    expect(lastModel!.masters![1]!.backgroundColor, 'Master-Farbe im Modell').toBe('#123456');
    const previewFrame = host.querySelector<HTMLElement>('[data-present-slide-preview="slide-master"]');
    const inlineStyles = Array.from(previewFrame?.querySelectorAll<HTMLElement>('[style]') ?? [])
      .map((element) => element.getAttribute('style') ?? '')
      .join(' ')
      .toLowerCase();
    expect(inlineStyles, 'Preview nutzt die neue Master-Farbe').toContain('#123456');
  });
});

describe('Present Round 40 — Notes Master (finding 5)', () => {
  it('shows a real notes-page preview and applies typography/header settings', async () => {
    const host = await mountView('notes-master');
    const preview = host.querySelector<HTMLElement>('[data-present-notes-master-preview="true"]');
    expect(preview, 'Notes-Page-Preview').not.toBeNull();
    expect(preview!.textContent).toContain(DEFAULT_PRESENT_NOTES_MASTER.headerText);
    expect(preview!.querySelector('[data-present-slide-preview="notes-master-thumbnail"]'), 'Thumbnail in Vorschau').not.toBeNull();

    const sizeInput = host.querySelector<HTMLInputElement>('input[aria-label="Notes font size"]')!;
    await fireInput(sizeInput, '20');
    expect(lastModel!.notesMaster!.notesFontSizePt, 'Notengröße im Modell').toBe(20);
    expect(host.querySelector<HTMLElement>('[data-present-notes-master-preview="true"]')!.textContent, 'Vorschau nennt die neue Größe').toContain('20 pt');

    const headerToggle = host.querySelector<HTMLInputElement>('input[aria-label="Show header"]')!;
    await clickElement(headerToggle);
    expect(lastModel!.notesMaster!.showHeader, 'Header-Schalter im Modell').toBe(false);
    expect(host.querySelector<HTMLElement>('[data-present-notes-master-preview="true"]')!.textContent, 'Header in der Vorschau ausgeblendet').not.toContain(DEFAULT_PRESENT_NOTES_MASTER.headerText);
  });
});

describe('Present Round 40 — Handout Master (finding 5)', () => {
  it('renders the slide grid for 2/4/6/9 per page and applies colours', async () => {
    const host = await mountView('handout-master');
    const preview = host.querySelector<HTMLElement>('[data-present-handout-preview="true"]');
    expect(preview, 'Handout-Preview').not.toBeNull();
    // Default master: 3 per page → 3 of the 4 slides are on the page.
    expect(preview!.getAttribute('data-present-handout-per-page')).toBe(String(DEFAULT_PRESENT_HANDOUT_MASTER.slidesPerPage));
    expect(preview!.querySelectorAll('[data-present-handout-cell]').length).toBe(DEFAULT_PRESENT_HANDOUT_MASTER.slidesPerPage);
    expect(preview!.querySelector('[data-present-slide-preview]'), 'echte Folien im Raster').not.toBeNull();

    await clickElement(host.querySelector<HTMLElement>('[data-present-handout-layout="2"]')!);
    expect(lastModel!.handoutMaster!.slidesPerPage, '2 pro Seite im Modell').toBe(2);
    expect(host.querySelector<HTMLElement>('[data-present-handout-preview="true"]')!.getAttribute('data-present-handout-per-page')).toBe('2');
    expect(host.querySelectorAll('[data-present-handout-cell]').length).toBe(2);

    await clickElement(host.querySelector<HTMLElement>('[data-present-handout-layout="6"]')!);
    expect(host.querySelectorAll('[data-present-handout-cell]').length, 'alle 4 Folien + 2 leere Zellen').toBe(4);
    expect(host.querySelectorAll('[data-present-handout-empty]').length).toBe(2);

    const backgroundInput = host.querySelector<HTMLInputElement>('input[aria-label="Background"]')!;
    await fireInput(backgroundInput, '#fef3c7');
    expect(lastModel!.handoutMaster!.backgroundColor, 'Handout-Farbe im Modell').toBe('#fef3c7');
    expect(host.querySelector<HTMLElement>('[data-present-handout-preview="true"]')!.style.backgroundColor, 'Vorschau-Hintergrund').toBe('#fef3c7');
  });
});
