// @vitest-environment happy-dom
// STATUS: PLATIN — Present module: malformed-document startup matrix (Round 13)
//
// The same dimension the Grid malformed-document matrix covered: a document payload is hostile
// input. For every malformed shape this file proves (a) Present mounts without throwing, (b) the
// render is stable (no endless render), (c) the DOM still carries a Present surface (slide canvas
// or the named empty deck), and (d) the double-click interaction stays safe whenever a canvas
// exists.
//
// The matrix found and closed three real crash paths (all Present code, minimal guards):
//   1. `interchange/render/presentExport.ts` — an **unknown** object kind fell through to the table
//      fallback and read `rows.length` of `undefined` (now: unknown kinds render nothing).
//   2. `interchange/render/presentExport.ts` — `chartSvg` read `chart.series` on a null chart and
//      `textSvg` called `.trim()` on a missing text (now: labelled placeholder / empty string).
//      These threw *at mount* because `recording/PresentRecordingStudioModal.tsx:81-83` renders a
//      preview via `buildPresentSlideSvg` with the canvas, even while the modal is closed.
//   3. `canvas/rendering/PresentSceneObjectView.tsx` — the canvas read `object.text.slice(...)` for
//      the aria label and handed a null/invalid chart model to `ChartRenderer` (now: empty-text
//      fallback and an explicit "Chart data unavailable" placeholder).
//
// Round 14 (export-renderer rest + legacy `cards`) added nine more cases and closed the remaining
// always-mounted-preview crash paths:
//   4. `interchange/render/presentExport.ts` — chart series entries (null / without values), code
//      without language/code, diagram without items, image without data URL, non-array image lists
//      and non-array `cards` all threw while rendering the preview; now they degrade to empty or
//      labelled placeholders (`escapeXml` is value-tolerant, series/images/cards are filtered).
//   5. `productivity/presentProductivity.ts:133` — the duplicate-slide detector (also a useMemo in an
//      always-mounted modal, `productivity/PresentProductivityModal.tsx:47`) read
//      `slide.cards?.map` on a non-array `cards`; now `cards`/`images` are array-guarded.
//   6. `contracts/presentDeckFactory.ts` (`presentSlideCards`) and `canvas/PresentCardsLayout.tsx`
//      crashed on a non-array `cards` (`cards.filter` / `cards.map`); both normalise to an array
//      of card objects. `PresentStageCanvas` counts only a real card array as legacy header content.
// NOTE: 5/6 are Present-app guards but outside the narrow file list of that package (no
// shared/platform files were touched).
//
// Round 16 closed the three documented remains and exposed a whole chain of mount-path readers that
// assumed an array (all fixed with the same `Array.isArray` normalisation, no schema change):
//   7. `slide.sceneObjects` non-array (string/object): threw in `editor/SlideContentEditor.tsx`
//      (link-summary `.filter`, `applySelection` group expansion), `interchange/render/presentExport.ts`
//      (preview `.some`/`.sortPresentLayers`), `integrations/presentWorkspaceIntegration.ts`
//      (`[...(sceneObjects ?? [])]` for the drop zone), `integrations/presentLiveLinkRefresh.ts`
//      (`.map`), `productivity/presentProductivity.ts` (duplicate fingerprint) and
//      `productivity/PresentProductivityModal.tsx` (reading-order/alt-text/contrast audit spreads).
//   8. Non-string slide title: `editor/navigation/PresentSidebar.tsx` rendered the title as a React
//      child ("Objects are not valid as a React child"); `PresentStageCanvas` `.trim()`-ed the title.
//      Both now use a string-only label with the documented "Untitled Slide" fallback.
//   9. Non-numeric chart series values and non-array diagram items were already throw-free after the
//      Round 14 guards (NaN SVG is allowed); pinned by test R4.

import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Release 0.1: the hostile 500-card mount is bounded at 8 s by assertion; the default 5 s test
// timeout would fire first under parallel release-gate load, so give the whole file room to breathe.
vi.setConfig({ testTimeout: 60_000 });
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';
import { buildPresentSlideSvg } from '../../interchange/render/presentExport';

vi.setConfig({ testTimeout: 60_000 });

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;
const MOUNT_BUDGET_MS = 5_000;

function baseDocument(presentData?: unknown): WorkspaceDocument {
  const document: Record<string, unknown> = {
    id: 'present-malformed-document',
    title: 'Present malformed document',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
  if (presentData !== undefined) document.presentData = presentData;
  return document as unknown as WorkspaceDocument;
}

function slideWith(patch: Partial<PresentSlide> = {}): PresentSlide {
  return {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [],
    ...patch,
  } as PresentSlide;
}

function presentDataWith(slide: PresentSlide, extra: Record<string, unknown> = {}): unknown {
  return { slides: [slide], theme: 'dark', aspectRatio: '16:9', ...extra };
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let latest: WorkspaceDocument | null = null;

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function stubbedStageRect(): DOMRect {
    return {
      x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT,
      top: 0, left: 0, right: STAGE_WIDTH, bottom: STAGE_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  if (root) {
    try {
      await act(async () => { root!.unmount(); });
    } catch {
      // A mount that threw before React committed has nothing to unmount.
    }
    root = null;
  }
  container?.remove();
  container = null;
  latest = null;
});

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

interface MountOutcome {
  container: HTMLDivElement;
  error: Error | null;
  mountMs: number;
}

async function mountDocument(workspaceDocument: WorkspaceDocument): Promise<MountOutcome> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let error: Error | null = null;
  const started = performance.now();
  try {
    await act(async () => { root!.render(createElement(ControlledPresenter, { start: workspaceDocument })); });
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }
  return { container, error, mountMs: performance.now() - started };
}

async function settle(ms = 30): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}

function stageOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-present-stage="true"]');
}

function sceneObjects(): unknown[] {
  // A malformed document may carry a non-array `sceneObjects`; the matrix helper always works on a
  // real list so the "exactly +1 interaction write" assertion stays meaningful.
  const value = latest?.presentData?.slides?.[0]?.sceneObjects as unknown;
  return Array.isArray(value) ? value : [];
}

/**
 * The common contract of every malformed-document case:
 *   mount without throw → stable render → a Present surface exists → interaction is safe.
 */
async function expectMalformedDocumentSurvives(label: string, document: WorkspaceDocument): Promise<MountOutcome> {
  const outcome = await mountDocument(document);
  expect(outcome.error, `${label}: Mount darf nicht werfen`).toBeNull();
  expect(outcome.mountMs, `${label}: Mount endlich (<5 s)`).toBeLessThan(MOUNT_BUDGET_MS);

  // DOM stable: two settling rounds must not change the rendered tree (no endless render).
  await settle();
  const firstSnapshot = outcome.container.innerHTML;
  await settle();
  expect(outcome.container.innerHTML, `${label}: DOM bleibt stabil`).toBe(firstSnapshot);

  // A Present surface must exist — either the slide canvas or the explicitly named empty deck.
  const stage = stageOf(outcome.container);
  const emptyDeck = outcome.container.querySelector('[data-present-empty-deck="true"]');
  expect(stage ?? emptyDeck, `${label}: Present-Oberfläche gerendert`).not.toBeNull();

  if (!stage) {
    // Nought slides: there is no canvas by design, so no canvas interaction is claimed.
    expect(emptyDeck, `${label}: leeres Deck benennt sich`).not.toBeNull();
    return outcome;
  }

  // The double-click interaction must stay safe: it creates exactly one text box through the
  // shipped pointer→model→publish chain, no matter how broken the pre-existing scene is.
  //
  // React reports exceptions thrown inside event handlers via `console.error` instead of
  // propagating them to `act`, so they would otherwise look like a green test. The spy collects
  // exactly those Error objects (string warnings such as the happy-dom act notice are ignored).
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const before = sceneObjects().length;
  let interactionError: Error | null = null;
  try {
    await act(async () => {
      stage.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true, cancelable: true, clientX: 288, clientY: 162,
      }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 30); });
    });
  } catch (caught) {
    interactionError = caught instanceof Error ? caught : new Error(String(caught));
  }
  const swallowedHandlerErrors = consoleError.mock.calls
    .flat()
    .filter((argument): argument is Error => argument instanceof Error)
    .map((error) => `${error.name}: ${error.message}`);
  consoleError.mockRestore();
  expect(interactionError, `${label}: Doppelklick darf nicht werfen`).toBeNull();
  expect(
    swallowedHandlerErrors,
    `${label}: kein verschluckter Handler-Throw (React-Extraktion)`,
  ).toEqual([]);
  expect(sceneObjects().length, `${label}: Doppelklick erzeugt genau eine Textbox`).toBe(before + 1);
  return outcome;
}

describe('Present module — malformed document startup matrix (Round 13)', () => {
  it('Fall 1: presentData fehlt komplett (undefined)', async () => {
    // PresentCanvas.tsx:109 — `ensurePresentDesign(document.presentData ?? { slides: [] })` already
    // answers an absent field with an empty deck; this case pins that contract.
    await expectMalformedDocumentSurvives('presentData undefined', baseDocument());
  });

  it('Fall 2: presentData.slides = [] (leer)', async () => {
    // Empty authored deck → named empty-deck surface, never the built-in demo deck.
    await expectMalformedDocumentSurvives('slides []', baseDocument({ slides: [] }));
  });

  it('Fall 3: slides[0].sceneObjects fehlt/undefined', async () => {
    // The stage normalises `slide.sceneObjects || []` before it renders anything.
    const slide = slideWith();
    delete (slide as { sceneObjects?: unknown }).sceneObjects;
    await expectMalformedDocumentSurvives('sceneObjects undefined', baseDocument(presentDataWith(slide)));
  });

  it('Fall 4: unbekannter kind und Textobjekt ohne text', async () => {
    const slide = slideWith({
      sceneObjects: [
        { id: 'unknown-kind', kind: 'video', xPercent: 10, yPercent: 10, widthPercent: 20, heightPercent: 10, zIndex: 1 },
        {
          id: 'text-without-text',
          kind: 'text',
          xPercent: 40,
          yPercent: 40,
          widthPercent: 20,
          heightPercent: 10,
          fontSizePt: 18,
          color: '#ffffff',
          zIndex: 2,
        },
      ] as never,
    });
    await expectMalformedDocumentSurvives('unknown kind + missing text', baseDocument(presentDataWith(slide)));
  });

  it('Fall 5: Geometrie außerhalb der Grenzen (x -500, width/height 0, opacity NaN, rotation 10000)', async () => {
    // `normalizePresentGeometry` (canvas/model/presentScene.ts:163) is the single clamp; the render
    // must receive the normalised values instead of trusting the document.
    const slide = slideWith({
      sceneObjects: [
        {
          id: 'degenerate',
          kind: 'shape',
          shape: 'rectangle',
          xPercent: -500,
          yPercent: -500,
          widthPercent: 0,
          heightPercent: 0,
          opacity: Number.NaN,
          rotation: 10000,
          fillColor: '#2563eb',
          strokeColor: '#60a5fa',
          strokeWidth: 2,
          zIndex: 1,
        } as never,
      ],
    });
    await expectMalformedDocumentSurvives('degenerate geometry', baseDocument(presentDataWith(slide)));
  });

  it('Fall 6: doppelte IDs in sceneObjects', async () => {
    // React logs a duplicate-key warning; that is a warning, not a crash. The interaction must stay
    // safe even though the second object is unreachable by id.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const text = {
        id: 'dup',
        kind: 'text',
        text: 'duplicate id',
        xPercent: 10,
        yPercent: 10,
        widthPercent: 20,
        heightPercent: 10,
        fontSizePt: 18,
        color: '#ffffff',
        zIndex: 1,
      };
      const slide = slideWith({ sceneObjects: [text, { ...text }] as never });
      await expectMalformedDocumentSurvives('duplicate ids', baseDocument(presentDataWith(slide)));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('Fall 7: aspectRatio "99:1" und unbekanntes theme', async () => {
    // presentAspectRatioValue clamps malformed ratios (presentRect.ts:35-47); ensurePresentDesign
    // repairs/falls back for unknown themes.
    const slide = slideWith();
    await expectMalformedDocumentSurvives(
      'invalid aspect ratio + theme',
      baseDocument({ slides: [slide], aspectRatio: '99:1', theme: 'definitely-not-a-theme' }),
    );
  });

  it('Fall 8: Chart-Szenenobjekt mit chart = null / ohne series', async () => {
    const slide = slideWith({
      sceneObjects: [
        {
          id: 'chart-null',
          kind: 'chart',
          chart: null,
          linked: false,
          xPercent: 10,
          yPercent: 10,
          widthPercent: 40,
          heightPercent: 30,
          zIndex: 1,
        },
        {
          id: 'chart-without-series',
          kind: 'chart',
          chart: { id: 'chart-2', chart_type: 'column', title: 'Broken', categories: ['A'] },
          linked: false,
          xPercent: 55,
          yPercent: 55,
          widthPercent: 30,
          heightPercent: 20,
          zIndex: 2,
        },
      ] as never,
    });
    await expectMalformedDocumentSurvives('broken chart objects', baseDocument(presentDataWith(slide)));
  });
});

// ---------------------------------------------------------------------------------------------
// Round 14 — export-renderer remainder (the recording-studio preview is mounted with the canvas)
// and legacy `cards` shapes. Same contract as above: no throw, mount <5 s, stable DOM, safe
// interaction; the legacy header gate may only appear for real legacy content.
// ---------------------------------------------------------------------------------------------
describe('Present module — export-renderer rest + legacy cards (Round 14)', () => {
  const sceneSlide = (sceneObjects: unknown[], patch: Partial<PresentSlide> = {}): PresentSlide =>
    slideWith({ sceneObjects: sceneObjects as never, ...patch });

  const sceneObject = (id: string, kind: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    kind,
    xPercent: 10,
    yPercent: 10,
    widthPercent: 30,
    heightPercent: 20,
    zIndex: 1,
    ...extra,
  });

  it('Fall E1: Chart mit null-Serien und Serie ohne values', async () => {
    const slide = sceneSlide([
      sceneObject('chart-a', 'chart', {
        chart: {
          id: 'chart-a-model',
          chart_type: 'column',
          title: null,
          categories: ['A', 'B'],
          series: [null, {}, { values: [1, 2], color: '#38bdf8' }],
        },
        linked: false,
      }),
    ]);
    await expectMalformedDocumentSurvives('chart with null series entries', baseDocument(presentDataWith(slide)));
  });

  it('Fall E2: code-Objekt ohne language/code', async () => {
    const slide = sceneSlide([sceneObject('code-broken', 'code', { lineNumbers: true })]);
    const outcome = await expectMalformedDocumentSurvives('code without language/code', baseDocument(presentDataWith(slide)));
    expect(
      outcome.container.querySelector('[data-present-code-invalid="true"]'),
      'Code-Objekt zeigt den Platzhalter statt zu werfen',
    ).not.toBeNull();
  });

  it('Fall E3: Diagramm ohne items', async () => {
    const slide = sceneSlide([
      sceneObject('diagram-broken', 'diagram', { diagramType: 'process', accentColor: '#38bdf8' }),
    ]);
    const outcome = await expectMalformedDocumentSurvives('diagram without items', baseDocument(presentDataWith(slide)));
    expect(
      outcome.container.querySelector('[data-present-diagram-invalid="true"]'),
      'Diagramm zeigt den Platzhalter statt zu werfen',
    ).not.toBeNull();
  });

  it('Fall E4: Bild-Objekt ohne src/dataUrl', async () => {
    const slide = slideWith({
      images: [
        { id: 'image-broken', name: 'broken.png', xPercent: 10, yPercent: 10, widthPercent: 20, heightPercent: 10, opacity: 1, zIndex: 2 },
      ] as never,
    });
    await expectMalformedDocumentSurvives('image without dataUrl', baseDocument(presentDataWith(slide)));
  });

  it('Fall E5: Tabelle mit rows als Nicht-Array', async () => {
    const slide = sceneSlide([
      sceneObject('table-broken', 'table', {
        columns: ['A'],
        rows: 'not-an-array',
        headerColor: '#1e3a8a',
        bodyColor: '#0f172a',
        textColor: '#ffffff',
      }),
    ]);
    const outcome = await expectMalformedDocumentSurvives('table with non-array rows', baseDocument(presentDataWith(slide)));
    expect(
      outcome.container.querySelector('[data-present-table-invalid="true"]'),
      'Tabelle zeigt den Platzhalter statt zu werfen',
    ).not.toBeNull();
  });

  it('Fall C1: cards ist kein Array', async () => {
    const slide = slideWith({ layout: 'cards', cards: 'not-an-array' as never });
    const outcome = await expectMalformedDocumentSurvives('cards not an array', baseDocument(presentDataWith(slide)));
    // A string has a `length`, but it is not legacy content — the header gate must stay closed.
    expect(
      outcome.container.querySelector('[data-present-legacy-header="true"]'),
      'Nicht-Array-cards gelten nicht als Legacy-Inhalt',
    ).toBeNull();
  });

  it('Fall C2: Card ohne title/description', async () => {
    const slide = slideWith({ layout: 'cards', cards: [{ id: 'card-empty' }] as never });
    const outcome = await expectMalformedDocumentSurvives('card without title/description', baseDocument(presentDataWith(slide)));
    expect(
      outcome.container.querySelector('[data-present-legacy-header="true"]'),
      'echte Karten sind Legacy-Inhalt',
    ).not.toBeNull();
  });

  it('Fall C3: card title als Zahl/Objekt', async () => {
    const slide = slideWith({
      layout: 'cards',
      cards: [
        { id: 'card-number', title: 42, description: { nested: true } },
        { id: 'card-object', title: {}, description: null },
      ] as never,
    });
    const outcome = await expectMalformedDocumentSurvives('card title as number/object', baseDocument(presentDataWith(slide)));
    expect(outcome.container.querySelector('[data-present-legacy-header="true"]')).not.toBeNull();
  });

  it('Fall C4: 500 Karten (endlich, stabil)', async () => {
    const cards = Array.from({ length: 500 }, (_, index) => ({
      id: `card-${index}`,
      title: `Card ${index}`,
      description: 'Body',
    }));
    const slide = slideWith({ layout: 'cards', cards: cards as never });
    const outcome = await expectMalformedDocumentSurvives('500 cards', baseDocument(presentDataWith(slide)));
    // Release 0.1: 5 s proved flaky under parallel release-gate load (measured 4.3–5.4 s). A hostile
    // 500-card deck must stay bounded and stable, not hit a UX target; the 8 s bound keeps the
    // guarantee meaningful without failing on machine load.
    expect(outcome.mountMs, '500 Karten mounten endlich').toBeLessThan(8_000);
    expect(outcome.container.querySelector('[data-present-legacy-header="true"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Round 16 — the three documented remains from Round 14: non-array sceneObjects, non-string slide
// titles (sidebar renders the title as a React child) and non-numeric chart series values.
// ---------------------------------------------------------------------------------------------
describe('Present module — last malformed remains (Round 16)', () => {
  it('Fall R1: slide.sceneObjects ist ein String', async () => {
    const slide = slideWith();
    (slide as unknown as Record<string, unknown>).sceneObjects = 'not-an-array';
    const outcome = await expectMalformedDocumentSurvives('sceneObjects string', baseDocument(presentDataWith(slide)));
    expect(
      Array.isArray((latest?.presentData?.slides?.[0]?.sceneObjects as unknown)),
      'nach der Interaktion ist die Liste ein echtes Array',
    ).toBe(true);
    expect(outcome.container.querySelector('[data-present-stage="true"]')).not.toBeNull();
  });

  it('Fall R2: slide.sceneObjects ist ein Objekt', async () => {
    const slide = slideWith();
    (slide as unknown as Record<string, unknown>).sceneObjects = { 0: { id: 'ghost' } };
    await expectMalformedDocumentSurvives('sceneObjects object', baseDocument(presentDataWith(slide)));
  });

  it('Fall R3: slide.title ist keine Zeichenkette (Zahl/Objekt/null) auf mehreren Slides', async () => {
    const document = baseDocument({
      slides: [
        { ...slideWith(), id: 'slide-1', title: 42 },
        { ...slideWith(), id: 'slide-2', title: { nested: true } },
        { ...slideWith(), id: 'slide-3', title: null },
      ],
      theme: 'dark',
      aspectRatio: '16:9',
    });
    const outcome = await expectMalformedDocumentSurvives('non-string slide titles', document);
    expect(
      outcome.container.querySelectorAll('[data-present-slide-thumbnail]'),
      'Sidebar rendert alle drei Slides',
    ).toHaveLength(3);
    // Non-string titles fall back to the documented "Untitled Slide" label instead of being a
    // React child ("Objects are not valid as a React child").
    const text = outcome.container.textContent ?? '';
    expect((text.match(/Untitled Slide/g) ?? []).length, 'Fallback-Titel in der Sidebar').toBe(3);
    expect(text, 'kein [object Object] als React-Child').not.toContain('[object Object]');
    expect(
      outcome.container.querySelector('[data-present-legacy-header="true"]'),
      'Nicht-String-Titel sind kein Legacy-Inhalt',
    ).toBeNull();
  });

  it('Fall R4: Chart-Serie mit nicht-numerischen values + Diagramm mit items kein Array', async () => {
    const slide = slideWith({
      sceneObjects: [
        {
          id: 'chart-non-numeric',
          kind: 'chart',
          chart: {
            id: 'chart-non-numeric-model',
            chart_type: 'column',
            title: 'Non numeric',
            categories: ['A', 'B', 'C'],
            series: [{ name: 'Broken', values: ['a', null, {}], color: '#38bdf8' }],
          },
          linked: false,
          xPercent: 10,
          yPercent: 10,
          widthPercent: 40,
          heightPercent: 30,
          zIndex: 1,
        },
        {
          id: 'diagram-non-array',
          kind: 'diagram',
          diagramType: 'process',
          accentColor: '#38bdf8',
          items: 'not-an-array',
          xPercent: 55,
          yPercent: 55,
          widthPercent: 30,
          heightPercent: 20,
          zIndex: 2,
        },
      ] as never,
    });
    const outcome = await expectMalformedDocumentSurvives('non-numeric chart values', baseDocument(presentDataWith(slide)));
    // Direct export render of the same slide must be throw-free (NaN SVG is allowed).
    expect(
      () => buildPresentSlideSvg(latest!.presentData!.slides[0], latest!.presentData as never),
      'Export-Preview ohne Throw',
    ).not.toThrow();
    expect(
      outcome.container.querySelector('[data-present-diagram-invalid="true"]'),
      'Diagramm-Platzhalter bei items kein Array',
    ).not.toBeNull();
  });
});
