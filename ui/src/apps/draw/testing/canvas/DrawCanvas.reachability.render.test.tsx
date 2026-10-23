// STATUS: GOLD — reachability contract for the whole Draw canvas: the visible surface really is the
// interactive one, and the panels/commands are present in the rendered markup.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DRAW_INTERACTION_COPY } from '../../drawInteractionLocale';
import { DRAW_CANVAS_ERROR_COPY } from '../../drawCanvasLocale';
import { DrawCanvas } from '../../canvas/DrawCanvas';
import { DrawShapeLibraryPanel, DRAW_SHAPE_RESULT_LIMIT } from '../../canvas/DrawShapeLibraryPanel';
import { DrawLayerPanel } from '../../canvas/DrawLayerPanel';
import { DrawStyleInspectorPanel } from '../../canvas/DrawStyleInspectorPanel';
import { DrawConnectorPanel } from '../../canvas/DrawConnectorPanel';
import { buildDrawModel } from '../interactions/drawInteractionFixtures';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: () => undefined });

const noop = (): void => undefined;

function workspaceDocument(drawData: ReturnType<typeof buildDrawModel>): WorkspaceDocument {
  return {
    id: 'draw-canvas', title: 'Interactive canvas', kind: 'Draw', created_at: 0, modified_at: 0, version: 1,
    theme_id: 'cosmic', root_object_ids: [], objects: {}, drawData,
  } as WorkspaceDocument;
}

const model = buildDrawModel({
  objects: [
    { id: 'a', x: 100, y: 100, width: 200, height: 100, text: 'Alpha' },
    { id: 'b', x: 400, y: 300, width: 120, height: 60, text: 'Beta' },
  ],
});
const props = { document: workspaceDocument(model), onUpdateDocument: noop } satisfies ComponentProps<typeof DrawCanvas>;

describe('Draw canvas reachability', () => {
  it('renders the interactive surface plus every panel through the real component tree', () => {
    const markup = renderToStaticMarkup(<DrawCanvas {...props} />);
    expect(markup).toContain('data-vgt-draw-root="true"');
    expect(markup).toContain('data-vgt-draw-surface="true"');
    expect(markup).toContain('data-vgt-interactive-canvas="true"');
    expect(markup).toContain('role="application"');
    expect(markup).toContain('data-vgt-panel="shape-library"');
    expect(markup).toContain('data-vgt-panel="layers"');
    expect(markup).toContain('data-vgt-panel="style-inspector"');
    expect(markup).toContain('data-vgt-shape-search="true"');
    expect(markup).toContain('data-vgt-object="a"');
    expect(markup).toContain('data-vgt-layer="layer-main"');
    expect(markup).toContain('data-vgt-canvas-announcement="true"');
    expect(markup).toContain('role="status"');
    // The static preview is gone from the main viewport.
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('data:image/svg+xml');
  });

  it('exposes the shape library entries, the layer controls and the style controls', () => {
    const markup = renderToStaticMarkup(<DrawCanvas {...props} />);
    expect(markup).toContain('data-vgt-stencil="draw-core-shapes:process"');
    expect(markup).toContain('data-vgt-shape-results=');
    expect(markup).toContain('data-vgt-layer-visible="layer-main"');
    expect(markup).toContain('data-vgt-layer-locked="layer-main"');
    expect(markup).toContain('data-vgt-layer-printable="layer-main"');
    expect(markup).toContain('data-vgt-style="fill"');
    expect(markup).toContain('data-vgt-style="strokeWidth"');
    expect(markup).toContain('data-vgt-style-preset="shadow:raised"');
    expect(markup).toContain('data-vgt-style-preset="fontSize:24"');
    expect(markup).toContain('data-vgt-command="connect"');
    expect(markup).toContain('data-vgt-command="auto-layout"');
    expect(markup).toContain('data-vgt-move-to-layer="true"');
  });

  it('exposes the snapping controls and the connector inspector', () => {
    const markup = renderToStaticMarkup(<DrawCanvas {...props} />);
    for (const flag of ['showGrid', 'snapToGrid', 'snapToShapes', 'snapToGuides']) {
      expect(markup, flag).toContain(`data-vgt-viewport="${flag}"`);
    }
    expect(markup).toContain('data-vgt-add-to-group="true"');
    expect(markup).toContain('data-vgt-command="guide-add-x"');
    expect(markup).toContain('data-vgt-command="guide-add-y"');
    expect(markup).toContain('data-vgt-guide-count="0"');
    expect(markup).toContain('data-vgt-guide-list="true"');
    // No connector is selected in the initial state, so the connector inspector renders nothing.
    expect(markup).not.toContain('data-vgt-panel="connector"');
  });

  it('names the template choice and the browser-only export formats (AST-1289, AST-1319)', () => {
    const markup = renderToStaticMarkup(<DrawCanvas {...props} />);
    // Templates: a real empty state (no template chosen) with a named hint and a placeholder option.
    expect(markup).toContain('data-vgt-template-select="true"');
    expect(markup).toContain('aria-describedby="draw-template-hint"');
    expect(markup).toContain('data-vgt-template-hint="true"');
    expect(markup).toContain(DRAW_INTERACTION_COPY['en-US'].templateHint);
    expect(markup).toContain(DRAW_INTERACTION_COPY['en-US'].templateNoneSelected);
    expect(markup).toContain('data-vgt-command="apply-template"');
    // PNG/PDF need the browser rasterizer; without it they are disabled **and** the reason is associated.
    expect(markup).toContain('data-vgt-raster-hint="unavailable"');
    expect(markup).toMatch(/data-vgt-command="export-png"[^>]*disabled/u);
    expect(markup).toMatch(/data-vgt-command="export-pdf"[^>]*disabled/u);
    expect(markup).toContain(DRAW_CANVAS_ERROR_COPY['en-US'].rasterUnavailable);
    // SVG export never depends on the rasterizer.
    expect(markup).not.toMatch(/data-vgt-command="export-svg"[^>]*disabled/u);
  });

  it('renders the connector inspector with route, label, waypoints and arrowheads when one is selected', () => {
    const withConnector = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 400, y: 0, width: 100, height: 60 },
        {
          id: 'c1', type: 'connector', x: 100, y: 0, width: 300, height: 60,
          connector: {
            from: { objectId: 'a', anchor: 'auto' }, to: { objectId: 'b', anchor: 'auto' },
            route: 'curved', autoRoute: false, waypoints: [{ x: 250, y: 30 }], obstacleAvoidance: true,
            routingPriority: 0, crossingStyle: 'none', semantic: { label: 'uses' },
            arrowStart: 'circle', arrowEnd: 'triangle',
          },
        },
      ],
    });
    const markup = renderToStaticMarkup(
      <DrawConnectorPanel model={withConnector} locale="en-US" selectedIds={['c1']} onCommand={noop} />,
    );
    expect(markup).toContain('data-vgt-panel="connector"');
    expect(markup).toContain('data-vgt-connector-id="c1"');
    expect(markup).toContain('data-vgt-connector-route="curved"');
    expect(markup).toContain('data-vgt-connector-waypoints="1"');
    expect(markup).toContain('data-vgt-connector-label="true"');
    expect(markup).toContain('value="uses"');
    expect(markup).toContain('data-vgt-command="connector-clear-waypoints"');
    expect(markup).toContain('data-vgt-connector-arrow-start="circle"');
    expect(markup).toContain('data-vgt-connector-arrow-end="triangle"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('renders nothing for the connector inspector when no connector is selected', () => {
    const shapeOnly = buildDrawModel({ objects: [{ id: 'a', x: 0, y: 0, width: 100, height: 60 }] });
    expect(renderToStaticMarkup(
      <DrawConnectorPanel model={shapeOnly} locale="en-US" selectedIds={['a']} onCommand={noop} />,
    )).toBe('');
  });

  it('renders every interaction label in every supported locale', () => {
    const expectedKeys = Object.keys(DRAW_INTERACTION_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = DRAW_INTERACTION_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders the localized shape library, layer list and inspector labels', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = DRAW_INTERACTION_COPY[locale];
      const markup = renderToStaticMarkup(<DrawCanvas {...props} />);
      expect(markup).toContain(copy.shapeLibrary);
      expect(markup).toContain(copy.layers);
      expect(markup).toContain(copy.styleInspector);
      expect(markup).toContain(copy.autoLayout);
      expect(markup).toContain(copy.exportPng);
      expect(markup).toContain(copy.importVisio);
      expect(markup).toContain(copy.layerRename);
    }
  });
});

describe('Draw panels render independently', () => {
  it('shows an empty state for an empty object list and reader hints for the inspector', () => {
    const empty = buildDrawModel({});
    const page = empty.pages[0]!;
    const layerMarkup = renderToStaticMarkup(
      <DrawLayerPanel
        model={empty} page={page} locale="en-US" activeLayerId="layer-main" selectedIds={[]}
        onSetActiveLayer={noop} onToggleLayerVisibility={noop} onToggleLayerLock={noop} onToggleLayerPrintable={noop}
        onStepLayer={noop} onRenameLayer={noop} onAddLayer={noop} onSelectObject={noop} onToggleObjectLock={noop}
        onZOrder={noop} onGroup={noop} onUngroup={noop} onAddToGroup={noop} onMoveToLayer={noop} onConnect={noop}
        onDisconnect={noop} onToggleViewport={noop} onAddGuide={noop} onRemoveGuide={noop}
      />,
    );
    expect(layerMarkup).toContain(DRAW_INTERACTION_COPY['en-US'].objectEmpty);
    expect(layerMarkup).toContain('data-vgt-object-list="0"');

    const inspectorMarkup = renderToStaticMarkup(
      <DrawStyleInspectorPanel model={empty} locale="en-US" selectedIds={[]} onCommand={noop} />,
    );
    expect(inspectorMarkup).toContain('data-vgt-style-empty="true"');
    expect(inspectorMarkup).toContain(DRAW_INTERACTION_COPY['en-US'].styleEmpty);
  });

  it('bounds the rendered shape library results', () => {
    const markup = renderToStaticMarkup(
      <DrawShapeLibraryPanel model={buildDrawModel({})} locale="en-US" onInsert={noop} />,
    );
    const match = /data-vgt-shape-results="(\d+)"/u.exec(markup);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
    expect(Number(match![1])).toBeLessThanOrEqual(DRAW_SHAPE_RESULT_LIMIT);
  });
});
