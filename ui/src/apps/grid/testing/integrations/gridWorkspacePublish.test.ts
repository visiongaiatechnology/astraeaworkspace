// STATUS: PLATIN — counter-checks for Grid Paket 45 (Grid-Ranges zu Writer) and 46 (Charts zu Present).
//
// Hand-written oracle:
//   45: "A1:D12 markieren und per Integration als Tabelle oder Live-Objekt bereitstellen."
//   46: "Diagramm markieren, als Live-/Snapshot-Element auf gewählte Folie einfügen."
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChartObject, GridCell, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { installWriterWorkspaceIntegrationHost } from '../../../writer/public/workspace/writerWorkspaceIntegrationHostAdapter';
import {
  createGridPublishObject,
  createGridPublishObjectDetailed,
  deleteGridPublishObject,
  GRID_WORKSPACE_PUBLISH_TARGET_KINDS,
  listGridWorkspacePublishTargets,
  publishGridObjectToWorkspaceTarget,
} from '../../integrations/gridWorkspacePublish';
import {
  listGridChartPublishSlides,
  listGridChartPublishTargets,
  publishGridChartToWorkspaceTarget,
  publishGridChartToWorkspaceTargetDetailed,
} from '../../integrations/gridChartPublish';

// The Writer embed boundary requires the Writer-owned host that `apps/App.tsx` installs at boot.
// Installing the *real* adapter here means the Writer path under test is the shipped implementation,
// not a stub; only the browser UI itself remains unverified.
let disposeWriterHost: (() => void) | undefined;
beforeAll(() => { disposeWriterHost = installWriterWorkspaceIntegrationHost(); });
afterAll(() => { disposeWriterHost?.(); });

function gridDocument(cells: Record<string, GridCell>): WorkspaceDocument {
  const tableId = 'grid-table-1';
  const sheetId = 'grid-sheet-1';
  return {
    schema_version: 1, id: 'grid-doc', title: 'Quelle', kind: 'Grid',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default',
    root_object_ids: [tableId],
    objects: { [tableId]: { type: 'Table', data: { id: tableId, rows: 12, cols: 4, cells } } },
    gridData: { sheets: [{ id: sheetId, name: 'Daten', tableObjectId: tableId }], activeSheetId: sheetId, namedRanges: [], publishObjects: [] },
  } as unknown as WorkspaceDocument;
}

function rangeCells(): Record<string, GridCell> {
  const cells: Record<string, GridCell> = {};
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 4; col++) {
      const letter = String.fromCharCode(65 + col);
      if (row === 0) cells[`${letter}1`] = { value: `Kopf ${letter}` };
      else if (row === 1 && col === 3) cells[`${letter}2`] = { value: 4, formula: '=B2*2' };
      else cells[`${letter}${row + 1}`] = { value: row * 4 + col };
    }
  }
  return cells;
}

function writerTarget(): WorkspaceDocument {
  const blockId = 'text-1';
  return {
    schema_version: 1, id: 'writer-doc', title: 'Bericht', kind: 'Writer',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default',
    root_object_ids: [blockId],
    objects: { [blockId]: { type: 'TextBlock', data: { id: blockId, paragraphs: [{ id: 'p-1', runs: [] }] } } },
    writerData: { protectionMode: 'none', workspaceEmbeds: [] },
  } as unknown as WorkspaceDocument;
}

function presentTarget(slideCount = 3): WorkspaceDocument {
  return {
    schema_version: 1, id: 'present-doc', title: 'Deck', kind: 'Present',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: {
      slides: Array.from({ length: slideCount }, (_, index) => ({
        id: `slide-${index}`, title: `Folie ${index + 1}`, subtitle: '', layout: 'blank',
      })),
    },
  } as unknown as WorkspaceDocument;
}

function chartDocument(): WorkspaceDocument {
  const chart: ChartObject = {
    id: 'chart-1', chart_type: 'column', title: 'Umsatz',
    categories: ['A', 'B'], series: [{ name: 'S1', values: [1, 2] }],
  } as unknown as ChartObject;
  return {
    schema_version: 1, id: 'grid-chart-source', title: 'Quelle', kind: 'Grid',
    created_at: 0, modified_at: 0, version: 1, theme_id: 'default',
    root_object_ids: ['chart-1'],
    objects: { 'chart-1': { type: 'Chart', data: chart } },
    gridData: { sheets: [{ id: 's1', name: 'Daten', tableObjectId: 't1' }], activeSheetId: 's1', namedRanges: [] },
  } as unknown as WorkspaceDocument;
}

describe('Grid -> Writer publish: A1:D12 becomes a real, round-trippable object (AST-0462/0463/0464)', () => {
  it('materialises the A1:D12 range and reports what it kept and dropped', () => {
    const document = gridDocument(rangeCells());
    const result = createGridPublishObjectDetailed(document, {
      kind: 'range', title: 'Umsatztabelle A1:D12', sourceSheetId: 'grid-sheet-1', sourceRange: 'A1:D12',
    });

    expect(result.record).toMatchObject({ kind: 'range', rows: 12, cols: 4, cellCount: 48, formulasDropped: 1 });
    expect(result.record.preserved.join(' ')).toMatch(/Zellwerte/u);
    expect(result.record.notPreserved.join(' ')).toMatch(/Formeln/u);
    expect(result.document.gridData?.publishObjects).toHaveLength(1);

    const objectId = result.definition.objectId;
    const snapshot = result.document.objects[objectId];
    if (snapshot?.type !== 'Table') throw new Error('snapshot missing');
    expect(snapshot.data.rows).toBe(12);
    expect(snapshot.data.cols).toBe(4);
    expect(snapshot.data.cells.A1?.value).toBe('Kopf A');
    // The formula is replaced by its cached value: documented, not silent.
    expect(snapshot.data.cells.D2?.formula).toBeUndefined();
    expect(snapshot.data.cells.D2?.value).toBe(4);
  });

  it('keeps the published definition and snapshot identical across a save/close/reopen cycle', () => {
    const document = gridDocument(rangeCells());
    const created = createGridPublishObject(document, {
      kind: 'range', title: 'A1:D12', sourceSheetId: 'grid-sheet-1', sourceRange: 'A1:D12',
    });
    // Save -> close -> reopen is modelled as a JSON round trip of the canonical document.
    const reopened = JSON.parse(JSON.stringify(created)) as WorkspaceDocument;
    const definition = reopened.gridData?.publishObjects?.[0];
    expect(definition?.sourceRange).toBe('A1:D12');
    expect(definition?.stableRangeId).toBeTruthy();
    const before = created.objects[definition!.objectId];
    const after = reopened.objects[definition!.objectId];
    expect(after).toEqual(before);
  });

  it('publishes the range into a Writer document as a live embed', () => {
    const document = gridDocument(rangeCells());
    const created = createGridPublishObjectDetailed(document, {
      kind: 'range', title: 'A1:D12', sourceSheetId: 'grid-sheet-1', sourceRange: 'A1:D12',
    });
    const published = publishGridObjectToWorkspaceTarget(created.document, created.definition.id, writerTarget(), 'Live');
    const embeds = published.writerData?.workspaceEmbeds ?? [];
    expect(embeds).toHaveLength(1);
    expect(embeds[0]).toMatchObject({ mode: 'Live' });
    expect(published.version).toBe(2);
  });

  it('offers only target kinds it can actually publish into (no dead Spaces target)', () => {
    const documents: Record<string, WorkspaceDocument> = {
      source: chartDocument(),
      writer: writerTarget(),
      present: presentTarget(),
      spaces: { ...writerTarget(), id: 'spaces', kind: 'Spaces' } as unknown as WorkspaceDocument,
    };
    const targets = listGridWorkspacePublishTargets(documents, 'source');
    expect(targets.map((target) => target.kind)).toEqual(['Writer', 'Present']);
    expect(GRID_WORKSPACE_PUBLISH_TARGET_KINDS).not.toContain('Spaces');

    // A 'Spaces' document can never be produced by the target list...
    const spacesTarget = documents.spaces!;
    const created = createGridPublishObject(gridDocument(rangeCells()), {
      kind: 'range', title: 'A1:D12', sourceSheetId: 'grid-sheet-1', sourceRange: 'A1:D12',
    });
    // ...and the publisher still refuses it explicitly rather than failing at an unrelated step.
    expect(() => publishGridObjectToWorkspaceTarget(created, created.gridData!.publishObjects![0]!.id, spacesTarget, 'Live'))
      .toThrow('grid_publish_target_unsupported');
  });

  it('fails closed for locked, read-only or permissioned targets and for the source itself', () => {
    const source = chartDocument();
    const created = createGridPublishObject(gridDocument(rangeCells()), {
      kind: 'range', title: 'A1:D12', sourceSheetId: 'grid-sheet-1', sourceRange: 'A1:D12',
    });
    const definition = created.gridData!.publishObjects![0]!;

    expect(() => publishGridObjectToWorkspaceTarget(created, definition.id, created, 'Live'))
      .toThrow('grid_publish_self_target');
    expect(() => publishGridObjectToWorkspaceTarget(created, 'missing', writerTarget(), 'Live'))
      .toThrow('grid_publish_definition_missing');

    const locked = { ...writerTarget(), protection: { locked: true } } as unknown as WorkspaceDocument;
    const readOnly = { ...writerTarget(), protection: { readOnly: true } } as unknown as WorkspaceDocument;
    const permissioned = { ...writerTarget(), permissions: { grants: [] } } as unknown as WorkspaceDocument;
    const protectedWriter = { ...writerTarget(), writerData: { protectionMode: 'read-only', workspaceEmbeds: [] } } as unknown as WorkspaceDocument;
    for (const target of [locked, readOnly, permissioned, protectedWriter]) {
      expect(listGridWorkspacePublishTargets({ source, target }, 'source')).toEqual([]);
    }
    expect(listGridWorkspacePublishTargets({ source, writer: writerTarget() }, 'source')).toHaveLength(1);
  });

  it('rejects range, budget and shape violations instead of publishing something wrong', () => {
    const document = gridDocument(rangeCells());
    const request = { kind: 'range' as const, title: 'x', sourceSheetId: 'grid-sheet-1' };
    expect(() => createGridPublishObject(document, { ...request, sourceRange: 'A1:Z99' })).toThrow('grid_publish_range_out_of_bounds');
    expect(() => createGridPublishObject(document, { ...request, sourceRange: 'nonsense' })).toThrow('grid_publish_range_invalid');
    expect(() => createGridPublishObject(document, { ...request, sourceRange: undefined })).toThrow('grid_publish_range_missing');
    expect(() => createGridPublishObject(document, { kind: 'cell', title: 'x', sourceSheetId: 'grid-sheet-1', sourceRange: 'A1:D12' }))
      .toThrow('grid_publish_single_cell_required');
    expect(() => createGridPublishObject(document, { kind: 'kpi', title: 'x', sourceSheetId: 'nope', sourceRange: 'A1' }))
      .toThrow('grid_publish_sheet_missing');
  });

  it('deletes a publish object together with its materialised table', () => {
    const created = createGridPublishObject(gridDocument(rangeCells()), {
      kind: 'range', title: 'A1:D12', sourceSheetId: 'grid-sheet-1', sourceRange: 'A1:D12',
    });
    const definition = created.gridData!.publishObjects![0]!;
    const deleted = deleteGridPublishObject(created, definition.id);
    expect(deleted.gridData?.publishObjects).toEqual([]);
    expect(deleted.objects[definition.objectId]).toBeUndefined();
    expect(deleted.root_object_ids).not.toContain(definition.objectId);
  });
});

describe('Grid -> Present publish: the chosen slide receives the chart (AST-0467/0468/0469)', () => {
  it('writes the chart element onto the explicitly chosen slide, not slide 1', () => {
    const target = presentTarget(3);
    const outcome = publishGridChartToWorkspaceTargetDetailed(chartDocument(), 'chart-1', target, 'Live', 2);
    expect(outcome.slideIndex).toBe(2);
    expect(outcome.summary).toMatch(/Folie 3/u);
    const slides = outcome.document.presentData!.slides;
    expect(slides[0]?.chartReferenceId).toBeUndefined();
    expect(slides[2]?.chartReferenceId).toBeTruthy();
    expect(slides[2]?.layout).toBe('chart');
    expect(outcome.document.root_object_ids).toContain(slides[2]!.chartReferenceId!);
    expect(outcome.document.objects[slides[2]!.chartReferenceId!]).toMatchObject({ type: 'WorkspaceReference' });
  });

  it('defaults to slide 1 only when no slide was chosen', () => {
    const outcome = publishGridChartToWorkspaceTargetDetailed(chartDocument(), 'chart-1', presentTarget(3), 'Frozen');
    expect(outcome.slideIndex).toBe(0);
    expect(outcome.document.presentData!.slides[0]?.chartReferenceId).toBeTruthy();
  });

  it('rejects an out-of-range or non-integer slide instead of writing to the wrong slide', () => {
    for (const slideIndex of [-1, 3, 1.5, Number.NaN]) {
      expect(() => publishGridChartToWorkspaceTargetDetailed(chartDocument(), 'chart-1', presentTarget(3), 'Live', slideIndex))
        .toThrow('chart_publish_slide_index_invalid');
    }
    expect(() => publishGridChartToWorkspaceTargetDetailed(chartDocument(), 'chart-1', presentTarget(0), 'Live', 0))
      .toThrow('chart_publish_present_model_missing');
  });

  it('lists the selectable slides of a Present target, bounded and labelled', () => {
    const slides = listGridChartPublishSlides(presentTarget(4));
    expect(slides.map((slide) => slide.index)).toEqual([0, 1, 2, 3]);
    expect(slides[2]?.label).toBe('3. Folie 3');
    expect(listGridChartPublishSlides(writerTarget())).toEqual([]);
  });

  it('keeps the published reference identical across save/close/reopen', () => {
    const outcome = publishGridChartToWorkspaceTargetDetailed(chartDocument(), 'chart-1', presentTarget(2), 'Live', 1);
    const reopened = JSON.parse(JSON.stringify(outcome.document)) as WorkspaceDocument;
    expect(reopened.presentData).toEqual(outcome.document.presentData);
    expect(reopened.objects).toEqual(outcome.document.objects);
    const referenceId = reopened.presentData!.slides[1]!.chartReferenceId!;
    const reference = reopened.objects[referenceId];
    if (reference?.type !== 'WorkspaceReference') throw new Error('reference missing');
    expect(reference.data.mode).toBe('Live');
    expect(reference.data.cached_snapshot).toMatchObject({ type: 'Chart' });
  });

  it('keeps the compatibility wrapper behaviour for legacy callers', () => {
    const legacy = publishGridChartToWorkspaceTarget(chartDocument(), 'chart-1', presentTarget(2), 'Live');
    expect(legacy.presentData!.slides[0]?.chartReferenceId).toBeTruthy();
  });

  it('refuses a missing chart, a non-Grid source and a self target', () => {
    expect(() => publishGridChartToWorkspaceTargetDetailed(chartDocument(), 'nope', presentTarget(), 'Live'))
      .toThrow('chart_publish_source_missing');
    expect(() => publishGridChartToWorkspaceTargetDetailed(writerTarget(), 'chart-1', presentTarget(), 'Live'))
      .toThrow('chart_publish_source_not_grid');
    const source = chartDocument();
    expect(() => publishGridChartToWorkspaceTargetDetailed(source, 'chart-1', source, 'Live'))
      .toThrow('chart_publish_self_target');
  });

  it('lists only writable Writer/Present targets for charts', () => {
    const documents: Record<string, WorkspaceDocument> = {
      source: chartDocument(),
      writer: writerTarget(),
      present: presentTarget(),
      grid2: gridDocument({}),
      locked: { ...presentTarget(), protection: { locked: true } } as unknown as WorkspaceDocument,
    };
    expect(listGridChartPublishTargets(documents, 'source').map((target) => target.kind)).toEqual(['Writer', 'Present']);
  });
});
