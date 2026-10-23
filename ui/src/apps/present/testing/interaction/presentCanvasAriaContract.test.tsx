// @vitest-environment happy-dom
// STATUS: PLATIN — Present M1: ARIA/screen-reader contract for the stage (Round 17)
//
// PR-010 proves the native Windows screen-reader probe by hand. This file is the DOM evidence that
// such a probe builds on real semantics, not only on working keys:
//   - the stage is a named, focusable region and its label documents the keyboard contract;
//   - every scene object is a named control whose accessible name states its kind;
//   - the selected object is indistinguishable from an unselected one for AT without state —
//     therefore it carries `aria-pressed` (role=button) *and* the existing data attribute;
//   - the transform handles each have their own non-empty name (8 resize + 1 rotate);
//   - the focused text editor has an accessible name and is a native multi-line control.
//
// Ist-Zustand (gemessen, nicht angenommen):
//   text  → role="button", aria-label="Text object: <first 80 chars>"  (leer → "Text object: empty")
//   shape → role="button", aria-label="Shape object"
//   chart → role="button", aria-label="Chart object"
//   stage → role="region", aria-label "Slide canvas — Tab and Shift+Tab cycle objects (Tab at the
//           last object leaves the canvas), Enter places the armed tool, F2 edits text"
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

const TEXT_OBJECT = {
  id: 'aria-text',
  kind: 'text',
  text: 'Accessible text box',
  xPercent: 10,
  yPercent: 10,
  widthPercent: 30,
  heightPercent: 14,
  fontSizePt: 22,
  fontWeight: 'semibold',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  zIndex: 10,
};

const SHAPE_OBJECT = {
  id: 'aria-shape',
  kind: 'shape',
  shape: 'rectangle',
  xPercent: 15,
  yPercent: 45,
  widthPercent: 25,
  heightPercent: 18,
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  opacity: 1,
  zIndex: 20,
};

const CHART_OBJECT = {
  id: 'aria-chart',
  kind: 'chart',
  chart: {
    id: 'aria-chart-model',
    chart_type: 'column',
    title: 'Accessible chart',
    categories: ['A', 'B'],
    series: [{ name: 'Series', values: [3, 5], color: '#38bdf8' }],
  },
  linked: false,
  xPercent: 55,
  yPercent: 45,
  widthPercent: 30,
  heightPercent: 30,
  zIndex: 30,
};

function slideWithObjects(): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [TEXT_OBJECT, SHAPE_OBJECT, CHART_OBJECT] as never,
  } as PresentSlide;
}

function documentWith(slide: PresentSlide): WorkspaceDocument {
  return {
    id: 'present-aria-contract',
    title: 'Present ARIA contract',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides: [slide], theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
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
});

function ControlledPresenter({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  return createElement(PresentCanvas, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
    workspaceDocuments: [],
    networkCapability: 'offline',
    keyVaultUnlocked: false,
    onSelectSelectionType: vi.fn(),
  } as never);
}

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledPresenter, { start: documentWith(slideWithObjects()) }));
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
}

function stage(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-present-stage="true"]');
  if (!element) throw new Error('stage not rendered');
  return element;
}

function sceneObject(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-present-object-id="${id}"]`);
  if (!element) throw new Error(`scene object ${id} not rendered`);
  return element;
}

/** Accessible name sources in the order the ARIA name computation prefers them. */
function accessibleName(element: Element): string {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return (element.textContent ?? '').trim();
}

async function clickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  });
}

async function doubleClickElement(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await settle();
  });
}

describe('Present M1 — stage ARIA/screen-reader contract (Round 17)', () => {
  it('case 1: the stage is a named, focusable region documenting the keyboard contract', async () => {
    const host = await mount();
    const element = stage(host);

    expect(element.getAttribute('role'), 'Bühne hat eine Rolle').toBe('region');
    const label = element.getAttribute('aria-label') ?? '';
    expect(label.trim().length, 'Bühne hat eine nicht-leere Bezeichnung').toBeGreaterThan(10);
    expect(label, 'Bezeichnung ist eine Bühnen-Bezeichnung').toMatch(/slide canvas/i);

    expect(element.getAttribute('tabindex'), 'Bühne ist per Tastatur fokussierbar').toBe('0');

    // Case 5: the fixed keyboard contract from Round 10/12 is announced in the label.
    expect(label, 'Label nennt Tab').toMatch(/\bTab\b/);
    expect(label, 'Label nennt Enter').toMatch(/\bEnter\b/);
    expect(label, 'Label nennt F2').toMatch(/\bF2\b/);
  });

  it('case 2: every scene object is a named control and the names distinguish the kinds', async () => {
    const host = await mount();
    const text = sceneObject(host, 'aria-text');
    const shape = sceneObject(host, 'aria-shape');
    const chart = sceneObject(host, 'aria-chart');

    for (const [label, element] of [['text', text], ['shape', shape], ['chart', chart]] as const) {
      expect(element.getAttribute('role'), `${label}: Rolle`).toBe('button');
      const name = accessibleName(element);
      expect(name.length, `${label}: nicht-leerer zugänglicher Name`).toBeGreaterThan(0);
    }

    // Documented Ist-Namen (measured): they state the object kind, so AT can distinguish them.
    expect(accessibleName(text), 'Textobjekt nennt seine Art und den Inhalt').toBe('Text object: Accessible text box');
    expect(accessibleName(shape), 'Formobjekt nennt seine Art').toBe('Shape object');
    expect(accessibleName(chart), 'Chartobjekt nennt seine Art').toBe('Chart object');
    const names = new Set([accessibleName(text), accessibleName(shape), accessibleName(chart)]);
    expect(names.size, 'Namen sind unterscheidbar').toBe(3);
  });

  it('case 3: the selected object is recognizable for AT and the 9 handles are individually named', async () => {
    const host = await mount();
    const text = sceneObject(host, 'aria-text');
    expect(text.getAttribute('data-present-object-selected'), 'unselektiert').toBeNull();
    expect(text.getAttribute('aria-pressed'), 'unselektiert: aria-pressed=false').toBe('false');

    await clickElement(text);
    const selected = sceneObject(host, 'aria-text');
    expect(selected.getAttribute('data-present-object-selected'), 'Selektion ist im DOM markiert').toBe('true');
    // AT-Erkennbarkeit: role=button + aria-pressed is the valid state pair (data-* is not exposed).
    expect(selected.getAttribute('aria-pressed'), 'Selektion ist für AT erkennbar').toBe('true');
    expect(sceneObject(host, 'aria-shape').getAttribute('aria-pressed'), 'nicht selektiert bleibt false').toBe('false');

    // Eight resize handles + rotation, each with its own non-empty name.
    const handles = Array.from(selected.querySelectorAll<HTMLButtonElement>('[data-present-handle]'));
    expect(handles, '4 Ecken + 4 Kanten + Rotation').toHaveLength(9);
    for (const handle of handles) {
      const name = accessibleName(handle);
      expect(name.length, `${handle.dataset.presentHandle}: nicht-leerer Name`).toBeGreaterThan(0);
    }
    const handleNames = handles.map((handle) => accessibleName(handle));
    expect(new Set(handleNames).size, 'jeder Handle hat einen eigenen Namen').toBe(9);
    // Each of the eight edge/corner affordances is named exactly once (measured Ist-Namen:
    // "Resize object from the top left corner", "… from the top edge", … , "… from the left edge").
    for (const position of [
      'top left corner',
      'top edge',
      'top right corner',
      'right edge',
      'bottom right corner',
      'bottom edge',
      'bottom left corner',
      'left edge',
    ]) {
      expect(
        handleNames.filter((name) => name.includes(position)).length,
        `Handle "${position}" ist genau einmal benannt`,
      ).toBe(1);
    }
    expect(handleNames).toContain('Rotate object');
  });

  it('case 4: the focused text editor has an accessible name and is a native multi-line control', async () => {
    const host = await mount();
    const text = sceneObject(host, 'aria-text');

    await doubleClickElement(text);
    await settle();
    const editor = host.querySelector<HTMLTextAreaElement>('[data-present-object-id="aria-text"] textarea');
    expect(editor, 'Doppelklick öffnet den Editor').not.toBeNull();
    expect(editor!.tagName, 'native Mehrzeilen-Kontrolle').toBe('TEXTAREA');
    expect(document.activeElement, 'Editor ist fokussiert').toBe(editor);

    const name = accessibleName(editor!);
    expect(name.length, 'Editor hat einen nicht-leeren zugänglichen Namen').toBeGreaterThan(0);
    expect(name, 'Editor-Name nennt die Textobjekt-Art').toMatch(/text object/i);
    expect(editor!.getAttribute('aria-multiline'), 'Mehrzeiligkeit ist für AT deklariert').toBe('true');
  });
});
