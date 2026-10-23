// Contract test for BATCH-PRESENT-6 (Paket 28–33): hyperlinks reachable end to end, the accessible
// reading order / alt text / contrast audit visible, undo-redo present, and the acceptance harness's
// fixtures wired through the canonical paths.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PresentObjectInspector } from '../../editor/inspector/PresentObjectInspector';
import { PresenterDeckSurface } from '../../presenter/PresenterDeckSurface';
import { PresentProductivityModal } from '../../productivity/PresentProductivityModal';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), 'utf8');

const inspectorSource = read('../../editor/inspector/PresentObjectInspector.tsx');
const deckSurfaceSource = read('../../presenter/PresenterDeckSurface.tsx');
const presenterModalSource = read('../../presenter/PresenterModeModal.tsx');
const editorSource = read('../../editor/SlideContentEditor.tsx');
const sceneObjectViewSource = read('../../canvas/rendering/PresentSceneObjectView.tsx');
const sidebarSource = read('../../editor/navigation/PresentSidebar.tsx');

const linkedShape = (patch = {}) => ({
  id: 'shape-1',
  kind: 'shape',
  shape: 'rounded-rectangle',
  fillColor: '#2563eb',
  strokeColor: '#60a5fa',
  strokeWidth: 2,
  xPercent: 10,
  yPercent: 10,
  widthPercent: 30,
  heightPercent: 20,
  zIndex: 5,
  link: { kind: 'slide', slideId: 's2' },
  altText: 'Jump to the revenue section',
  ...patch,
});

describe('Paket 28 — hyperlinks are editable and visible', () => {
  it('renders the link editor, the apply/remove actions and the current-link summary', () => {
    const html = renderToStaticMarkup(createElement(PresentObjectInspector, {
      selectedObject: linkedShape(),
      selectedImage: null,
      allObjects: [linkedShape()],
      selectedObjectIds: ['shape-1'],
      selectionSize: 1,
      onPatchObject: vi.fn(),
      onPatchImage: vi.fn(),
      onUpdateAllObjects: vi.fn(),
      onLinkResult: vi.fn(),
      linkSlides: [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }],
      slideIndexById: new Map([['s1', 0], ['s2', 1]]),
      onClose: vi.fn(),
    }));
    expect(html).toContain('data-present-link-section="true"');
    expect(html).toContain('data-present-link-apply="true"');
    expect(html).toContain('data-present-link-remove="true"');
    expect(html).toContain('aria-label="Link kind"');
    expect(html).toContain('aria-label="Link target slide"');
    expect(html).toContain('Current: Slide 2');
  });

  it('renders link hotspots only on the interactive surface, never for the audience', () => {
    const props = {
      slides: [{ id: 's1', title: 'One', subtitle: '', layout: 'blank', sceneObjects: [linkedShape()] }],
      currentIdx: 0,
      transitionState: null,
      presentData: { slides: [] },
      embeddedObjects: [],
      activeAnimations: [],
      animationProgressById: {},
      triggerObjectIds: new Set(),
      onTriggerObject: vi.fn(),
      onAdvance: vi.fn(),
      pointerTool: 'none',
      laserPos: null,
      inkStrokes: [],
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      zoom: 1,
      onActivateLink: vi.fn(),
    };
    const presenter = renderToStaticMarkup(createElement(PresenterDeckSurface, { ...props, interactive: true }));
    expect(presenter).toContain('data-present-link-hotspot="shape-1"');
    expect(presenter).toContain('aria-label="Activate link on shape object"');

    const audience = renderToStaticMarkup(createElement(PresenterDeckSurface, { ...props, interactive: false }));
    expect(audience).not.toContain('data-present-link-hotspot');
  });

  it('activates a link through the pure resolver in the presenter', () => {
    expect(presenterModalSource).toContain('resolvePresentLinkActivation(target, {');
    expect(presenterModalSource).toContain("action === 'navigate-slide'");
    expect(presenterModalSource).toContain("window.open(activation.url, '_blank', 'noopener,noreferrer')");
    expect(presenterModalSource).toContain('onOpenDocument');
    expect(deckSurfaceSource).toContain('presentObjectLink(object)');
    // A linked object also shows a badge in the editor, so the link is discoverable without hovering.
    expect(sceneObjectViewSource).toContain('data-present-link-badge');
  });
});

describe('Paket 29 — reading order, alt text and contrast are visible', () => {
  it('offers an alternative text field for every object kind and reports contrast', () => {
    const html = renderToStaticMarkup(createElement(PresentObjectInspector, {
      selectedObject: { id: 't1', kind: 'text', text: 'Low contrast', fontSizePt: 14, color: '#777777', xPercent: 0, yPercent: 0, widthPercent: 30, heightPercent: 10, zIndex: 1 },
      selectedImage: null,
      allObjects: [],
      selectedObjectIds: ['t1'],
      selectionSize: 1,
      onPatchObject: vi.fn(),
      onPatchImage: vi.fn(),
      onUpdateAllObjects: vi.fn(),
      slideBackground: '#ffffff',
      onClose: vi.fn(),
    }));
    expect(html).toContain('data-present-a11y-section="true"');
    expect(html).toContain('aria-label="Object alternative text"');
    expect(html).toContain('data-present-contrast-finding="fail"');
    expect(html).toContain('contrast 4.48:1');
  });

  it('shows the deck-wide accessibility audit with counts, not a claim', () => {
    const model = {
      slides: [
        { id: 's1', title: 'One', subtitle: '', layout: 'blank', sceneObjects: [{ id: 'c1', kind: 'chart', linked: false, chart: { id: 'cd', chart_type: 'pie', title: 'Pie', categories: ['A'], series: [{ name: 'S', values: [1] }] }, xPercent: 0, yPercent: 0, widthPercent: 20, heightPercent: 20, zIndex: 1 }] },
        { id: 's2', title: 'Two', subtitle: '', layout: 'blank', sceneObjects: [{ id: 't1', kind: 'text', text: 'x', fontSizePt: 12, color: '#777777', xPercent: 0, yPercent: 0, widthPercent: 20, heightPercent: 10, zIndex: 1 }] },
      ],
    };
    const html = renderToStaticMarkup(createElement(PresentProductivityModal, {
      isOpen: true,
      model,
      activeSlideIndex: 1,
      onClose: vi.fn(),
      onUpdateModel: vi.fn(),
      onSelectSlide: vi.fn(),
    }));
    expect(html).toContain('data-present-a11y-audit="true"');
    expect(html).toContain('data-present-alt-text-findings="1"');
    expect(html).toContain('data-present-contrast-findings="1"');
    expect(html).toContain('Missing alternative text (1)');
    expect(html).toContain('Contrast too low for 1 text object(s)');
    // The rule is stated, so the reader can judge it.
    expect(html).toContain('back-to-front by layer position');
  });
});

describe('Paket 30/31 — search, undo/redo and the W-401 command runner', () => {
  it('keeps search/replace/duplicate/cleanup in the productivity surface', () => {
    expect(sidebarSource).toContain('Find / Reuse');
    const productivity = read('../../productivity/PresentProductivityModal.tsx');
    for (const fn of ['searchPresentDeck', 'replacePresentDeckText', 'findDuplicatePresentSlides', 'cleanupUnusedPresentMasters']) {
      expect(productivity).toContain(fn);
    }
  });

  it('routes every canvas command through the snapshot-advancing runner (W-401)', () => {
    expect(editorSource).toContain('runPresentCanvasCommand(');
    expect(editorSource).toContain('canvasRun.snapshot');
    expect(editorSource).not.toContain('applyPresentCanvasCommand(');
    // Undo/redo stay reachable from the toolbar and the keyboard.
    const toolbar = read('../../editor/toolbar/PresentTopToolbar.tsx');
    expect(toolbar).toContain('onUndo');
    expect(toolbar).toContain('onRedo');
    expect(editorSource).toContain("case 'undo':");
    expect(editorSource).toContain("case 'redo':");
  });
});
