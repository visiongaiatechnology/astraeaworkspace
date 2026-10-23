// @vitest-environment happy-dom
// STATUS: PLATIN — Present malformed ENTRIES inside arrays (Round 24, final malformed depth)
//
// The array guards (Rounds 14/16/23) stop non-array lists; this matrix goes one level deeper: `null`,
// `{}` and incomplete entries INSIDE otherwise valid arrays (`sceneObjects`, `cards`, chart `series`,
// `rows`/`columns`, `images`, `animations`). Every case mounts the real PresentCanvas and asserts:
//   - no throw, mount < 5 s, DOM stable across settling rounds,
//   - the double-click creation still works exactly once,
//   - and NO silent data repair: the hostile entries stay byte-identical in the document.
// Readers filter with `isPlainPresentRecord` where needed; nothing is removed from the document.
//
// Measured/Fixed Ist-Verhalten:
//   - sceneObjects entry `{}` crashed `PresentSceneObjectView` on `object.kind.charAt`
//     (`SlideContentEditor` link summary, stage render, live-link refresh);
//   - cards entry `null` crashed `stableSlideSignature` (`({ id, ...card })` destructuring);
//   - images entry `{}` crashed the floating-image map on `imageGesture.mode` (undefined id matched
//     the null gesture id);
//   - chart `series` entries with null / missing `values`, table/chart lists that are not arrays and
//     `animations: [null]` are now filtered by every mounted reader (export preview, stage,
//     productivity audits/duplicate detection, live-link refresh, drop-zone projection).
// The document is never rewritten: after the double-click the original entries are byte-identical.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../PresentCanvas';

vi.setConfig({ testTimeout: 60_000 });

let latest: WorkspaceDocument | null = null;
let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 540;
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
    await act(async () => { root!.unmount(); });
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

async function mountDocument(workspaceDocument: WorkspaceDocument): Promise<{ container: HTMLElement; error: Error | null; mountMs: number }> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const startedAt = performance.now();
  let error: Error | null = null;
  try {
    await act(async () => {
      root!.render(createElement(ControlledPresenter, { start: workspaceDocument }));
    });
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }
  const mountMs = performance.now() - startedAt;
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 30); }); });
  return { container, error, mountMs };
}

function slideWith(patch: Record<string, unknown> = {}): PresentSlide {
  return {
    id: 'slide-1',
    title: 'Malformed entries',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [],
    ...patch,
  } as unknown as PresentSlide;
}

function baseDocument(presentData: unknown): WorkspaceDocument {
  return {
    id: 'present-malformed-entries',
    title: 'Present malformed entries',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData,
  } as unknown as WorkspaceDocument;
}

function presentDataWith(slide: PresentSlide): unknown {
  return { slides: [slide], theme: 'dark', aspectRatio: '16:9' };
}

function slideJson(): string {
  return JSON.stringify(latest?.presentData?.slides?.[0] ?? null);
}

function sceneObjects(): unknown[] {
  const value = latest?.presentData?.slides?.[0]?.sceneObjects as unknown;
  return Array.isArray(value) ? value : [];
}

/**
 * Round 13/16 matrix helper + Round 24 additions: entry-level payloads must not be repaired. The
 * original entries (including null/empty objects) must remain byte-identical after the interaction.
 */
async function expectMalformedEntriesSurvive(
  label: string,
  document: WorkspaceDocument,
  checkEntries: (slideBefore: Record<string, unknown>, slideAfter: Record<string, unknown>) => void,
): Promise<void> {
  const slideBefore = JSON.parse(JSON.stringify((document.presentData as { slides: unknown[] }).slides[0])) as Record<string, unknown>;
  const outcome = await mountDocument(document);
  expect(outcome.error, `${label}: Mount darf nicht werfen`).toBeNull();
  expect(outcome.mountMs, `${label}: Mount < 5 s`).toBeLessThan(5_000);

  const stage = outcome.container.querySelector<HTMLElement>('[data-present-stage="true"], [data-present-empty-deck="true"]');
  expect(stage, `${label}: benannte Bühne/Empty-Deck`).not.toBeNull();

  // Mount itself must not rewrite the document (no silent repair at startup).
  expect(
    JSON.stringify((latest!.presentData as { slides: unknown[] }).slides[0]),
    `${label}: Dokument beim Mount unverändert`,
  ).toBe(JSON.stringify((document.presentData as { slides: unknown[] }).slides[0]));

  // Stable DOM across two settling rounds.
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
  const firstSnapshot = outcome.container.innerHTML;
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
  expect(outcome.container.innerHTML, `${label}: DOM stabil`).toBe(firstSnapshot);

  // Double click on empty stage space creates exactly one text object; handler exceptions are
  // reported by React via console.error, so they are captured explicitly.
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const objectsBefore = sceneObjects().length;
  let interactionError: Error | null = null;
  try {
    await act(async () => {
      stage!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 288, clientY: 162 }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 60); });
    });
  } catch (caught) {
    interactionError = caught instanceof Error ? caught : new Error(String(caught));
  }
  const swallowed = consoleError.mock.calls.flat()
    .filter((argument): argument is Error => argument instanceof Error)
    .map((error) => `${error.name}: ${error.message}`);
  consoleError.mockRestore();
  expect(interactionError, `${label}: Doppelklick darf nicht werfen`).toBeNull();
  expect(swallowed, `${label}: kein verschluckter Handler-Throw`).toEqual([]);
  expect(sceneObjects().length, `${label}: Doppelklick erzeugt genau eine Textbox`).toBe(objectsBefore + 1);

  const slideAfter = JSON.parse(slideJson()) as Record<string, unknown>;
  checkEntries(slideBefore, slideAfter);
}

describe('Present module — malformed entries inside arrays (Round 24)', () => {
  it('Fall 1: sceneObjects mit null / unvollständigem / leerem Eintrag', async () => {
    const slide = slideWith({ sceneObjects: [null, { kind: 'text' }, {}] });
    await expectMalformedEntriesSurvive('sceneObjects entries', baseDocument(presentDataWith(slide)), (before, after) => {
      const beforeObjects = before.sceneObjects as unknown[];
      const afterObjects = after.sceneObjects as unknown[];
      expect(afterObjects.length, 'nur das neue Textobjekt kommt hinzu').toBe(beforeObjects.length + 1);
      expect(afterObjects.slice(0, beforeObjects.length), 'alte Einträge unverändert (keine Reparatur)').toEqual(beforeObjects);
    });
  });

  it('Fall 2: cards mit null / leerem / unvollständigem Eintrag', async () => {
    const slide = slideWith({ layout: 'cards', cards: [null, {}, { title: 'x' }] });
    await expectMalformedEntriesSurvive('cards entries', baseDocument(presentDataWith(slide)), (before, after) => {
      expect(after.cards, 'cards unverändert').toEqual(before.cards);
    });
  });

  it('Fall 3: chart.series mit null / leerem / values-kein-Array-Eintrag', async () => {
    const slide = slideWith({
      sceneObjects: [
        {
          id: 'chart-entries',
          kind: 'chart',
          chart: {
            id: 'chart-entries-model',
            chart_type: 'column',
            title: 'Entries',
            categories: ['A'],
            series: [null, {}, { values: 'nope' }],
          },
          linked: false,
          xPercent: 10,
          yPercent: 10,
          widthPercent: 40,
          heightPercent: 30,
          zIndex: 1,
        },
      ],
    });
    await expectMalformedEntriesSurvive('chart series entries', baseDocument(presentDataWith(slide)), (before, after) => {
      const beforeChart = (before.sceneObjects as Array<Record<string, unknown>>)[0].chart as Record<string, unknown>;
      const afterChart = (after.sceneObjects as Array<Record<string, unknown>>)[0].chart as Record<string, unknown>;
      expect(afterChart.series, 'chart.series unverändert').toEqual(beforeChart.series);
    });
  });

  it('Fall 4: table rows/columns und chart series sind selbst kein Array', async () => {
    const slide = slideWith({
      sceneObjects: [
        {
          id: 'table-bad-lists',
          kind: 'table',
          columns: 'not-an-array',
          rows: { not: 'an array' },
          xPercent: 10,
          yPercent: 10,
          widthPercent: 40,
          heightPercent: 30,
          zIndex: 1,
        },
        {
          id: 'chart-bad-series',
          kind: 'chart',
          chart: { id: 'chart-bad-series-model', chart_type: 'column', title: 'Bad', categories: ['A'], series: { not: 'an array' } },
          linked: false,
          xPercent: 55,
          yPercent: 55,
          widthPercent: 35,
          heightPercent: 25,
          zIndex: 2,
        },
      ],
    });
    await expectMalformedEntriesSurvive('table/chart non-array lists', baseDocument(presentDataWith(slide)), (before, after) => {
      const beforeObjects = before.sceneObjects as Array<Record<string, unknown>>;
      const afterObjects = after.sceneObjects as Array<Record<string, unknown>>;
      expect(afterObjects[0], 'table-Objekt unverändert').toEqual(beforeObjects[0]);
      expect(afterObjects[1], 'chart-Objekt unverändert').toEqual(beforeObjects[1]);
    });
  });

  it('Fall 5: images mit null/leerem Eintrag und animations mit null', async () => {
    const slide = slideWith({
      sceneObjects: [
        {
          id: 'text-with-bad-relations',
          kind: 'text',
          text: 'Body',
          xPercent: 10,
          yPercent: 10,
          widthPercent: 30,
          heightPercent: 12,
          fontSizePt: 22,
          color: '#ffffff',
          zIndex: 1,
        },
      ],
      images: [null, {}],
      animations: [null],
    });
    await expectMalformedEntriesSurvive('images/animations entries', baseDocument(presentDataWith(slide)), (before, after) => {
      expect(after.images, 'images unverändert').toEqual(before.images);
      expect(after.animations, 'animations unverändert').toEqual(before.animations);
    });
  });
});
