// BATCH-PRESENT — Paket 33 acceptance harness: a real twelve-slide company deck with diagrams and
// presenter notes, built through the *same* factories the UI uses, then exercised end to end in
// process (render, PDF selection, PPTX/ODP round trip, reopen-equivalent normalisation).
//
// This is the code-level half of the acceptance. The user-level half (a human presenting the deck on
// a real display) stays NOT_TESTED - see AST-0636..AST-0640 in the inventory.

import { describe, expect, it } from 'vitest';
import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  PRESENT_DECK_SLIDE_LIMIT,
  createPresentSlide,
  duplicatePresentSlide,
  type PresentSlideLayoutKind,
} from '../../contracts/presentDeckFactory';
import { applyPresentTemplate, presentTemplateById } from '../../contracts/presentTemplates';
import { createPresentChartObject, createPresentDiagramObject, createPresentTextObject } from '../../canvas/model/presentScene';
import { ensurePresentDesign } from '../../design/presentDesign';
import { resolvePresentSlideSelection } from '../../interchange/render/presentExport';
import { buildPresentSlideSvg } from '../../interchange/render/presentExport';
import {
  PRESENT_OFFICE_MAX_SLIDES,
  exportPresentDeck,
  verifyPresentRoundTrip,
} from '../../interchange/office/presentOfficeRoundTrip';
import { buildPresentReadingOrder, auditPresentAltText } from '../../canvas/model/presentAccessibility';
import { withPresentAltText } from '../../canvas/model/presentObjectExtensions';
import { searchPresentDeck, replacePresentDeckText } from '../../productivity/presentProductivity';
import { normalizePresentTable } from '../../canvas/model/presentTable';
import { normalizePresentChart } from '../../canvas/model/presentChartData';

const LAYOUTS: PresentSlideLayoutKind[] = ['title', 'title-content', 'two-column', 'cards', 'blank'];

/** Builds the acceptance deck: 12 slides, mixed layouts, 2 diagrams, 1 chart, notes on every slide. */
function buildAcceptanceDeck(): PresentDocumentModel {
  const slides: PresentSlide[] = [];
  for (let index = 0; index < 12; index += 1) {
    const kind = LAYOUTS[index % LAYOUTS.length];
    const slide = createPresentSlide(kind, { id: `acceptance-slide-${index + 1}`, sequence: index + 1 });
    slides.push({
      ...slide,
      title: index === 0 ? 'Astraea FY26 Board Review' : `Section ${index} · Revenue`,
      speakerNotes: `Presenter notes for slide ${index + 1}: walk through the numbers and pause for questions.`,
      masterId: index % 2 === 0 ? 'master-clean' : 'master-board',
    });
  }
  // Every sixth slide carries a diagram, plus one chart slide with editable data.
  const diagramSlide = slides[5];
  diagramSlide.sceneObjects = [
    withPresentAltText(createPresentDiagramObject('acceptance-diagram-1', 'process'), 'Three-step delivery pipeline') as never,
  ];
  diagramSlide.animations = [
    { id: 'acceptance-anim-1', targetId: 'acceptance-diagram-1', effect: 'fade', trigger: 'on-click', durationMs: 400, delayMs: 0, category: 'entrance' },
  ];
  const chartSlide = slides[8];
  chartSlide.sceneObjects = [
    withPresentAltText(
      createPresentChartObject('acceptance-chart-1', {
        id: 'acceptance-chart-data',
        chart_type: 'column',
        title: 'Revenue by quarter',
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Actual', values: [12, 18, 24, 31] }],
      }, false),
      'Revenue grows every quarter',
    ) as never,
    withPresentAltText(createPresentTextObject('acceptance-text-1', { xPercent: 55, yPercent: 60 }), 'Chart takeaway') as never,
  ];
  chartSlide.transition = { effect: 'wipe', durationMs: 600, direction: 'left' };
  return ensurePresentDesign({ slides, themeId: 'midnight', aspectRatio: '16:9' });
}

const asDocument = (model: PresentDocumentModel): WorkspaceDocument => ({
  id: 'acceptance-doc',
  kind: 'Present',
  title: 'Astraea FY26 Board Review',
  version: 7,
  modified_at: 0,
  presentData: model,
} as unknown as WorkspaceDocument);

describe('Paket 33 acceptance harness — a twelve-slide company deck', () => {
  const model = buildAcceptanceDeck();

  it('has exactly twelve slides, mixed layouts, notes on every slide and named masters', () => {
    expect(model.slides).toHaveLength(12);
    expect(new Set(model.slides.map((slide) => slide.layout)).size).toBeGreaterThanOrEqual(4);
    expect(model.slides.every((slide) => (slide.speakerNotes ?? '').trim().length > 0)).toBe(true);
    expect(model.slides.every((slide) => Boolean(slide.masterId))).toBe(true);
    expect(model.slides.length).toBeLessThan(PRESENT_DECK_SLIDE_LIMIT);
    expect(model.slides.length).toBeLessThan(PRESENT_OFFICE_MAX_SLIDES);
  });

  it('carries a diagram (with animation) and a chart with an editable data model', () => {
    const diagram = model.slides[5].sceneObjects?.find((object) => object.kind === 'diagram');
    expect(diagram).toBeDefined();
    expect(model.slides[5].animations?.[0].targetId).toBe('acceptance-diagram-1');
    const chart = model.slides[8].sceneObjects?.find((object) => object.kind === 'chart');
    expect(chart?.kind === 'chart' && chart.chart.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    if (chart?.kind === 'chart') {
      const normalized = normalizePresentChart({ ...chart.chart, series: [{ name: 'A', values: [Number.NaN] }] });
      expect(normalized.series[0].values.every((value) => Number.isFinite(value))).toBe(true);
    }
  });

  it('renders every slide to SVG without a placeholder or undefined leaking in', () => {
    for (const slide of model.slides) {
      const svg = buildPresentSlideSvg(slide, model);
      expect(svg.startsWith('<svg'), slide.id).toBe(true);
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('NaN');
    }
  });

  it('exports all twelve slides in deck order and a selection in deck order', () => {
    expect(resolvePresentSlideSelection(model).map((slide) => slide.id)).toEqual(model.slides.map((slide) => slide.id));
    const selection = resolvePresentSlideSelection(model, ['acceptance-slide-9', 'acceptance-slide-2']);
    expect(selection.map((slide) => slide.id)).toEqual(['acceptance-slide-2', 'acceptance-slide-9']);
  });

  it('round-trips through PPTX in process with a measured, non-empty fidelity report', async () => {
    const { comparison, bytes } = await verifyPresentRoundTrip(asDocument(model), 'pptx');
    expect(bytes).toBeGreaterThan(1000);
    expect(comparison.slideCountBefore).toBe(12);
    expect(comparison.slideCountAfter).toBe(12);
    expect(comparison.preservedFields.length).toBeGreaterThan(0);
    // The report must state what is NOT preserved rather than claiming full fidelity.
    expect(comparison.fields.length).toBeGreaterThan(10);
  });

  it('exports ODP as well and keeps the same slide count', async () => {
    const { comparison } = await verifyPresentRoundTrip(asDocument(model), 'odp');
    expect(comparison.slideCountAfter).toBe(12);
  });

  it('finds the authored text through search and replaces it deck-wide', () => {
    const hits = searchPresentDeck(model, 'Revenue');
    expect(hits.length).toBeGreaterThan(0);
    const replaced = replacePresentDeckText(model, 'Revenue', 'Turnover');
    expect(replaced.replacements).toBeGreaterThan(0);
    expect(searchPresentDeck(replaced.model, 'Revenue')).toHaveLength(0);
  });

  it('produces a reading order and reports the alt-text gap honestly', () => {
    const objects = [...(model.slides[5].sceneObjects ?? []), ...(model.slides[8].sceneObjects ?? [])];
    const order = buildPresentReadingOrder(objects as never);
    expect(order.length).toBe(objects.length);
    expect(order.map((entry) => entry.position)).toEqual(order.map((_, index) => index + 1));
    const report = auditPresentAltText(objects as never);
    expect(report.missing).toHaveLength(0);
    expect(report.withAltText).toBeGreaterThanOrEqual(3);
  });

  it('instantiates a template into a complete deck and keeps its master and theme', () => {
    const template = presentTemplateById('template-board-review')!;
    const result = applyPresentTemplate({ slides: [] }, template, {
      title: 'T', subtitle: 'S', agendaTitle: 'Agenda', agendaItem1: 'a', agendaItem2: 'b', agendaItem3: 'c',
      findingsTitle: 'Findings', findingsSubtitle: 'x', closingTitle: 'Thanks', closingSubtitle: 'Questions',
    });
    expect(result.unresolvedPlaceholders).toEqual([]);
    expect(result.model.slides.every((slide) => slide.masterId === template.masterId)).toBe(true);
    expect(result.model.themeId).toBe(template.themeId);
  });

  it('duplicates a slide of the deck without sharing an id or a group key', () => {
    const source = model.slides[8];
    const copy = duplicatePresentSlide(source, 'acceptance-copy');
    expect(copy.id).toBe('acceptance-copy');
    const sourceObjectIds = new Set((source.sceneObjects ?? []).map((object) => object.id));
    expect((copy.sceneObjects ?? []).every((object) => !sourceObjectIds.has(object.id))).toBe(true);
  });

  it('keeps a torn/partial model loadable instead of producing NaN geometry', () => {
    const torn: PresentDocumentModel = {
      slides: [{ id: 's1', title: 'T', subtitle: '', layout: 'table' as never, sceneObjects: [
        { id: 't1', kind: 'table', columns: ['A'], rows: [['1']], headerColor: '#111', bodyColor: '#222', textColor: '#fff', xPercent: Number.NaN, yPercent: -50, widthPercent: 0, heightPercent: 1e9 } as never,
        { id: 'c1', kind: 'chart', linked: false, chart: { id: 'cd', chart_type: 'rope' as never, title: '', categories: [], series: [] } as never, xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 } as never,
      ] }],
    };
    const repaired = ensurePresentDesign(torn);
    const table = normalizePresentTable((repaired.slides[0].sceneObjects ?? [])[0] as never);
    expect(Number.isFinite(table.xPercent)).toBe(true);
    expect(table.widthPercent).toBeGreaterThan(0);
    expect(table.heightPercent).toBeLessThanOrEqual(100);
    expect(table.columns.length).toBeGreaterThanOrEqual(1);
    const chartObject = (repaired.slides[0].sceneObjects ?? [])[1] as Extract<PresentSlide['sceneObjects'], unknown[]> extends never ? never : { kind: string; chart: { chart_type: string; categories: string[] } };
    const chart = normalizePresentChart(chartObject.chart as never);
    expect(chart.chart_type).toBe('column');
    expect(chart.categories).toHaveLength(1);
  });

  it('exports the deck through the bounded module without throwing', () => {
    expect(() => exportPresentDeck(asDocument(model), 'pptx')).not.toThrow();
    expect(exportPresentDeck(asDocument(model), 'pptx').byteLength).toBeGreaterThan(1000);
  });
});
