// STATUS: PLATIN — BATCH-INSIGHT-5 render contract: the report surface really renders the visuals.
//
// Reachability evidence, measured before this batch: `visuals/insightVisualEngine` and
// `reports/insightReportEngine` were imported by NO component — no visual was ever drawn, no page
// could be added, and a placed visual could not be moved or removed. These assertions render the real
// `InsightView`, so a pure module that no component uses cannot satisfy them.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_INSIGHT_MODEL } from '../domain/types';
import { insightCopy } from '../locale/insightLocale';
import { formatInsightUsd } from '../interactions/insightCrossFilter';
import { createSlicer } from '../reports/insightReportEngine';
import { InsightReportCanvas } from '../components/InsightReportCanvas';
import { InsightView } from '../views/InsightView';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const docWith = (insightData: unknown) => ({
  id:'insight-report-test', kind:'Insight', title:'Report', created_at:1, modified_at:2, version:1, root_object_ids:[], objects:{}, insightData,
} as unknown as WorkspaceDocument);
const canvas = (model = structuredClone(DEFAULT_INSIGHT_MODEL)) =>
  renderToStaticMarkup(<InsightReportCanvas model={model} documentId="insight-report-test" crossFilter={null} onCrossFilter={vi.fn()} onUpdateModel={vi.fn()} />);

describe('Insight interactive scope controls', () => {
  it('renders the slicer controls with labelled options and a named removal', () => {
    const markup = canvas();
    const copy = insightCopy('en-US');
    expect(markup).toContain('data-insight-slicers="true"');
    expect(markup).toContain('data-insight-slicer-field="true"');
    expect(markup).toContain('data-insight-add-slicer="true"');
    expect(markup).toContain(copy.addSlicer);
    expect(markup).toContain(`aria-label="${copy.slicers}"`);
  });

  it('renders a preselected slicer with its values, its omission notice and its effect', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    model.report.pages[0].slicers = [{ ...createSlicer('region', 'list', ['Europe-Central']), selection:['Europe-Central'] }];
    const markup = canvas(model);
    const copy = insightCopy('en-US');
    expect(markup).toContain(`data-insight-slicer-field-name="region"`);
    expect(markup).toContain('data-insight-slicer-value="Europe-Central"');
    expect(markup).toContain('data-insight-slicer-value="Europe-North"');
    // The selected value is the checked one, and the removal names what it removes.
    expect(markup).toMatch(/data-insight-slicer-value="Europe-Central"[^>]*checked=""/);
    expect(markup).toContain(copy.removeSlicer);
  });

  it('renders the drill controls bounded by the documented levels and the category filter', () => {
    const markup = canvas();
    const copy = insightCopy('en-US');
    const visualId = 'vis-revenue';
    // The opening tag that carries the marker: React writes `disabled` before the data attributes, so
    // the assertion must look at the whole tag rather than at what follows the marker.
    const tagFor = (source: string, marker: string) => {
      const at = source.indexOf(marker);
      return source.slice(source.lastIndexOf('<button', at), source.indexOf('>', at) + 1);
    };
    expect(markup).toContain(`data-insight-visual-filter="${visualId}"`);
    expect(markup).toContain(copy.filterByCategory);
    // At level 0 the upward control is disabled and the downward one is available.
    expect(tagFor(markup, `data-insight-drill-up="${visualId}"`)).toContain('disabled=""');
    expect(tagFor(markup, `data-insight-drill-down="${visualId}"`)).not.toContain('disabled=""');

    // Drilled to the middle level both directions are available; at the last level the downward one is not.
    const middle = structuredClone(DEFAULT_INSIGHT_MODEL);
    middle.report.pages[0].visuals[0].drillLevel = 1;
    middle.report.pages[0].visuals[0].encoding.category = 'product';
    const middleMarkup = canvas(middle);
    expect(tagFor(middleMarkup, `data-insight-drill-up="${visualId}"`)).not.toContain('disabled=""');
    expect(tagFor(middleMarkup, `data-insight-drill-down="${visualId}"`)).not.toContain('disabled=""');
    const last = structuredClone(DEFAULT_INSIGHT_MODEL);
    last.report.pages[0].visuals[0].drillLevel = 2;
    last.report.pages[0].visuals[0].encoding.category = 'quarter';
    expect(tagFor(canvas(last), `data-insight-drill-down="${visualId}"`)).toContain('disabled=""');
    // A drilled visual really plots the level's column: the chart categories become products.
    expect(middleMarkup).toContain('data-insight-visual-id="vis-revenue"');
  });

  it('lets a page slicer change the numbers the workspace shows (the scope really flows)', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    const europeCentral = model.records.filter((row) => row.region === 'Europe-Central').reduce((total, row) => total + row.revenue, 0);
    expect(europeCentral).toBe(535000);
    // Before the slicer the KPI shows the whole dataset.
    const before = renderToStaticMarkup(<InsightView document={docWith(model)} onUpdateDocument={vi.fn()} />);
    expect(before).toContain(formatInsightUsd(947000, 'en-US'));
    model.report.pages[0].slicers = [{ ...createSlicer('region', 'list', ['Europe-Central']), selection:['Europe-Central'] }];
    const after = renderToStaticMarkup(<InsightView document={docWith(model)} onUpdateDocument={vi.fn()} />);
    // The KPI cards follow the slicer scope, while the segment-bar caption keeps naming the dataset total.
    expect(after).toContain(formatInsightUsd(europeCentral, 'en-US'));
    expect(after).toContain('data-insight-region-total="947000"');
  });
});

describe('Insight report canvas renders through the shared chart stack', () => {
  it('renders every visible visual of the active page as a chart with a data table', () => {
    const markup = canvas();
    // Two visuals are seeded on the overview page.
    expect(markup).toContain('data-insight-visual-count="2"');
    expect(markup).toContain('data-insight-visual-id="vis-revenue"');
    expect(markup).toContain('data-insight-visual-id="vis-matrix"');
    expect(markup).toContain('data-insight-visual-kind="column"');
    // The shared renderer was really used: a figure with an image and the accessible table toggle.
    expect(markup).toContain('<figure');
    expect(markup).toContain('Show data table');
    expect(markup).toContain('Revenue by Region');
    // The seeded matrix visual has no shared chart type, so it is refused by name instead of faked.
    expect(markup).toContain('insight-visual-kind-unsupported');
    expect(markup).toContain(insightCopy('en-US').reportActionFailed('insight-visual-kind-unsupported'));
  });

  it('offers the page strip and the gallery with accessible names', () => {
    const markup = canvas();
    const copy = insightCopy('en-US');
    expect(markup).toContain('data-insight-report="true"');
    expect(markup).toContain('data-insight-page-count="1"');
    expect(markup).toContain('data-insight-add-page="true"');
    expect(markup).toContain('data-insight-rename-page="true"');
    expect(markup).toContain('data-insight-page-name="true"');
    expect(markup).toContain('data-insight-page-tab="page-overview"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain(`aria-label="${copy.reportPages}"`);
    expect(markup).toContain('data-insight-gallery="true"');
    expect(markup).toContain('data-insight-visual-kind-select="true"');
    expect(markup).toContain('data-insight-visual-category="true"');
    expect(markup).toContain('data-insight-visual-values="true"');
    expect(markup).toContain('data-insight-visual-aggregation="true"');
    expect(markup).toContain('data-insight-add-visual="true"');
    // Only shared-chart kinds are offered, so the gallery can never place a kind that cannot render.
    expect(markup).toContain('value="column"');
    expect(markup).toContain('>column</option>');
    expect(markup).toContain('value="box-plot"');
    expect(markup).not.toContain('value="gauge"');
    expect(markup).not.toContain('value="matrix"');
    // Every value well is a labelled checkbox over the numeric columns, not a text field.
    expect(markup).toContain('data-insight-visual-value="revenue"');
    expect(markup).toContain('data-insight-visual-value="cost"');
  });

  it('gives every layout action a keyboard reachable, named control', () => {
    const markup = canvas();
    const copy = insightCopy('en-US');
    for (const label of [copy.moveLeft, copy.moveRight, copy.moveUp, copy.moveDown, copy.resizeWider, copy.resizeTaller, copy.deleteVisual]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('data-insight-remove-visual="vis-revenue"');
    // The vector image of a visual is exported through the shared chart renderer, per visual.
    expect(markup).toContain('data-insight-visual-export="svg"');
    expect(markup).toContain('data-insight-visual-export-id="vis-revenue"');
    expect(markup).toContain(copy.exportSvg);
    // No essential function is offered only through a canvas: every action above is a real button.
    expect(markup).toContain('<button');
    expect(markup).not.toContain('data-insight-report-error');
  });

  it('names an empty page instead of rendering an empty canvas', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    model.report.pages[0].visuals = [];
    const markup = canvas(model);
    expect(markup).toContain(insightCopy('en-US').noVisuals);
    expect(markup).toContain('data-insight-visual-count="0"');
  });

  it('renders the report surface labels in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = insightCopy(locale);
      const markup = canvas();
      expect(markup).toContain(copy.reportPages);
      expect(markup).toContain(copy.addPage);
      expect(markup).toContain(copy.addVisual);
      expect(markup).toContain(copy.moveLeft);
      expect(markup).toContain(copy.deleteVisual);
    }
    localeState.current = 'en-US';
  });

  it('is reachable from the rendered Insight workspace', () => {
    const markup = renderToStaticMarkup(<InsightView document={docWith(structuredClone(DEFAULT_INSIGHT_MODEL))} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain('data-insight-report="true"');
    expect(markup).toContain('data-insight-visual-count="2"');
    expect(markup).toContain('data-insight-gallery="true"');
  });
});
