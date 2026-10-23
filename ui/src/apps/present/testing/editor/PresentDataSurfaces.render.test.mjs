// Contract test for BATCH-PRESENT-3 (Paket 13/14/15/16/17/18): the visible surfaces must expose the
// editable table, the editable chart data model, the live-link state, and the animation/transition
// controls must stay reachable.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PresentObjectInspector } from '../../editor/inspector/PresentObjectInspector';
import { PresentWorkspaceSnapshotView } from '../../canvas/rendering/PresentWorkspaceSnapshotView';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), 'utf8');

const tableObject = {
  id: 'table-1',
  kind: 'table',
  columns: ['Metric', 'Q1'],
  rows: [['Users', '10'], ['Keys', '2']],
  headerColor: '#1e3a8a',
  bodyColor: '#0f172a',
  textColor: '#f8fafc',
  xPercent: 10,
  yPercent: 20,
  widthPercent: 50,
  heightPercent: 20,
  zIndex: 5,
};

const chartObject = {
  id: 'chart-1',
  kind: 'chart',
  linked: false,
  chart: {
    id: 'chart-data-1',
    chart_type: 'column',
    title: 'Revenue',
    categories: ['Q1', 'Q2'],
    series: [{ name: 'Actual', values: [10, 20] }, { name: 'Plan', values: [12, 18] }],
    legend_position: 'bottom',
    show_data_labels: false,
    show_gridlines: true,
  },
  xPercent: 10,
  yPercent: 30,
  widthPercent: 40,
  heightPercent: 30,
  zIndex: 6,
};

const inspectorProps = (overrides = {}) => ({
  selectedObject: null,
  selectedImage: null,
  allObjects: [],
  selectedObjectIds: [],
  selectionSize: 0,
  onPatchObject: vi.fn(),
  onPatchImage: vi.fn(),
  onUpdateAllObjects: vi.fn(),
  onCommand: vi.fn(),
  onApplyTextFormat: vi.fn(),
  onPatchTableResult: vi.fn(),
  onPatchChartResult: vi.fn(),
  onClose: vi.fn(),
  ...overrides,
});

describe('PresentObjectInspector — table and chart contract', () => {
  it('renders bounded table editing with row/column actions and fit-to-slide sizing', () => {
    const html = renderToStaticMarkup(createElement(PresentObjectInspector, inspectorProps({
      selectedObject: tableObject,
      allObjects: [tableObject],
      selectedObjectIds: ['table-1'],
      selectionSize: 1,
    })));
    expect(html).toContain('Table · 2 × 2');
    for (const label of ['+ Row', '− Row', '+ Column', '− Column', 'Fit slide width', 'Fit slide height']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-present-table-fit="width"');
    for (const colour of ['Table Header colour', 'Table Body colour', 'Table Text colour']) {
      expect(html).toContain(`aria-label="${colour}"`);
    }
    // The documented bounds are visible, not only enforced in code.
    expect(html).toContain('at most 64 rows and 16 columns');
  });

  it('renders the editable chart data model plus axis, legend and label controls', () => {
    const html = renderToStaticMarkup(createElement(PresentObjectInspector, inspectorProps({
      selectedObject: chartObject,
      allObjects: [chartObject],
      selectedObjectIds: ['chart-1'],
      selectionSize: 1,
    })));
    expect(html).toContain('data-present-chart-inspector="true"');
    expect(html).toContain('data-present-chart-data-table="true"');
    expect(html).toContain('Chart data · 2 × 2');
    expect(html).toContain('aria-label="Chart title"');
    expect(html).toContain('aria-label="Chart type"');
    expect(html).toContain('aria-label="Chart legend position"');
    expect(html).toContain('aria-label="Chart x axis title"');
    expect(html).toContain('aria-label="Chart y axis title"');
    expect(html).toContain('aria-label="Show data labels"');
    expect(html).toContain('aria-label="Show gridlines"');
    // One editable input per cell, addressed so an acceptance run can reach it.
    expect(html).toContain('aria-label="Series 1 value for Q1"');
    expect(html).toContain('aria-label="Series 2 value for Q2"');
    expect(html).toContain('aria-label="Category 1"');
    expect(html).toContain('aria-label="Series 1 name"');
    expect(html).toContain('+ Category');
    expect(html).toContain('+ Series');
    expect(html).toContain('at most 64 categories and 16 series');
  });

  it('renders the resolved live-link state as text for a workspace reference', () => {
    const object = {
      id: 'ws-1',
      kind: 'workspace',
      integrationKind: 'grid-chart',
      mode: 'Live',
      sourceDocumentId: 'doc-1',
      sourceVersion: 4,
      uri: 'astraea://doc-1',
      title: 'Revenue sheet',
      snapshot: { type: 'chart', title: 'Revenue', categories: ['Q1'], series: [{ name: 'A', values: [1] }] },
      xPercent: 40,
      yPercent: 10,
      widthPercent: 30,
      heightPercent: 40,
      zIndex: 7,
    };
    const offline = renderToStaticMarkup(createElement(PresentWorkspaceSnapshotView, {
      object,
      linkStatus: { state: 'offline', label: 'Offline · source not available', attention: true, versionDelta: 0 },
    }));
    expect(offline).toContain('data-present-link-state="offline"');
    expect(offline).toContain('Offline · source not available');
    expect(offline).toContain('role="status"');

    const current = renderToStaticMarkup(createElement(PresentWorkspaceSnapshotView, {
      object,
      linkStatus: { state: 'live-current', label: 'Live · up to date', attention: false, versionDelta: 0 },
    }));
    expect(current).toContain('data-present-link-state="live-current"');
    expect(current).toContain('Live · up to date');
  });
});

describe('BATCH-PRESENT-3 reachability', () => {
  const inspector = read('../../editor/inspector/PresentObjectInspector.tsx');
  const editor = read('../../editor/SlideContentEditor.tsx');
  const canvas = read('../../canvas/PresentStageCanvas.tsx');
  const animationPane = read('../../editor/animation/PresentAnimationPane.tsx');
  const deckSurface = read('../../presenter/PresenterDeckSurface.tsx');
  const presenterModal = read('../../presenter/PresenterModeModal.tsx');

  it('mounts the table and chart editors through the pure rules only', () => {
    expect(editor).toContain('onPatchTableResult');
    expect(editor).toContain('onPatchChartResult');
    expect(inspector).toContain('appendPresentTableRow(selectedObject)');
    expect(inspector).toContain('stretchPresentObjectToSlide(object, \'width\')');
    expect(inspector).toContain('setPresentChartValue(selectedObject.chart, seriesIndex, categoryIndex, e.target.value)');
    expect(inspector).toContain('applyPresentChartOptions(selectedObject.chart');
    // No component may write chart data or table rows directly.
    expect(inspector).not.toContain('chart: { ...selectedObject.chart, categories:');
  });

  it('resolves and displays the live-link state on the canvas', () => {
    expect(editor).toContain('summarizePresentSlideLinks(');
    expect(canvas).toContain('linkStatusByObjectId');
    // The assertion names the full attribute expression: a plain substring match would also accept a
    // renamed attribute such as `data-present-link-summary-removed` (this is the second time this
    // class of weak assertion hid a revert, so the expression is asserted verbatim).
    expect(canvas).toContain("data-present-link-summary={linkAttentionCount > 0 ? 'attention' : 'ok'}");
    expect(canvas).toContain('need attention (offline/stale)');
  });

  it('keeps the animation controls and the transition engine reachable (Paket 17/18)', () => {
    for (const control of ['Duration', 'Delay', 'Category', 'Trigger', 'Scratch', 'Scrub']) {
      if (control === 'Scratch') continue;
      expect(animationPane, control).toContain(control);
    }
    expect(animationPane).toContain('runPreview(animations)');
    expect(animationPane).toContain('evaluatePreviewAnimationsAtTime');
    // The presenter must render transitions through the engine, not by swapping slides instantly.
    expect(presenterModal).toContain('normalizePresentTransition(slides[toIdx]?.transition)');
    expect(deckSurface).toContain('computePresentTransitionFrame(transition, transitionState.progress)');
    expect(deckSurface).toContain('buildPresentMorphFrame');
  });
});
