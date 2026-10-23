// STATUS: PLATIN — BATCH-INSIGHT-4: the encrypted Save/Close/Reopen round trip the WOM column lacked.
//
// MEASURED FACT before this batch: `interchange/insightNativeInterchange.ts` could pack and unpack an
// authenticated encrypted container, but no component called it and no test ever opened what it wrote.
// Every WOM/Persistenz point in the inventory was therefore PARTIAL for exactly this reason.
//
// This test performs the real round trip through the platform container (WebCrypto password credential
// path, no IndexedDB, no native host) and asserts the reopened payload against the original model.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DEFAULT_INSIGHT_MODEL } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { importInsightDataset } from '../connectors/insightImportCore';
import { addInsightKpi, createEmptyInsightModel } from '../interactions/insightDatasetAuthoring';
import { connectInsightWorkspaceSource } from '../connectors/insightWorkspaceSource';
import { createInsightVisual } from '../visuals/insightVisualEngine';
import { addReportPage, createSlicer, placeVisual } from '../reports/insightReportEngine';
import {
  INSIGHT_NATIVE_LIMITS,
  compareInsightModels,
  packInsightDocument,
  packNativeInsight,
  reopenInsightDocument,
} from '../interchange/insightNativeInterchange';

// The fixture mirrors the canonical seeded document shape (`app/bootstrap/seedData.ts:325`): the
// platform container validates id, kind, title, timestamps, version, root_object_ids and objects, so a
// minimal stub would prove nothing about a real Save/Reopen.
const document = (insightData: unknown = structuredClone(DEFAULT_INSIGHT_MODEL)) => ({
  id: 'insight-roundtrip',
  kind: 'Insight',
  title: 'Insight round trip',
  created_at: 1_700_000_000_000,
  modified_at: 1_700_000_001_000,
  version: 3,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  insightData,
} as unknown as WorkspaceDocument);
const PASSWORD = 'correct horse battery staple';

describe('Insight encrypted native interchange (real round trip)', () => {
  it('writes an authenticated encrypted container and reopens the identical document', async () => {
    const source = document();
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    const bytes = await packInsightDocument(source, model, { password: PASSWORD });

    expect(bytes.byteLength).toBeGreaterThan(16);
    expect(bytes.byteLength).toBeLessThanOrEqual(INSIGHT_NATIVE_LIMITS.maxBytes);
    // The container really is encrypted: a plaintext JSON document would fail this.
    expect(['VGT2', 'VGT3', 'VGT4', 'VGT5']).toContain(new TextDecoder().decode(bytes.subarray(0, 4)));
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('Sovereign-Operations-2026');

    const reopened = await reopenInsightDocument(bytes, { password: PASSWORD });
    expect(reopened.document.id).toBe(source.id);
    expect(reopened.document.kind).toBe('Insight');
    expect(compareInsightModels(model, reopened.model)).toEqual({ identical: true });
    // Spot checks that prove the payload is really the document and not an envelope of nothing.
    expect(reopened.model.datasetName).toBe(model.datasetName);
    expect(reopened.model.records).toHaveLength(model.records.length);
    expect(reopened.model.kpis.map((kpi) => kpi.id)).toEqual(model.kpis.map((kpi) => kpi.id));
    expect(reopened.model.cache.sourceState).toBe(model.cache.sourceState);
  });

  it('keeps an authored document identical across Save/Close/Reopen', async () => {
    // The document the user really builds: a created dataset, an imported dataset, a created KPI card,
    // a placed visual on a second report page and a changed pivot configuration. This is the
    // Save/Close/Reopen evidence the WOM column lacked.
    const created = createEmptyInsightModel('Q3 review');
    expect(created.datasetName).toBe('Q3 review');
    const imported = importInsightDataset(created, {
      name:'q3.csv', kind:'csv', text:[
        'id,region,product,quarter,revenue,cost,activeUsers,anomalyScore',
        'r1,Europe,Mesh,Q1,100,40,10,0.01',
        'r2,Europe,Core,Q2,300,90,20,0.03',
      ].join('\n') + '\n',
    }, 1000).model;
    // Documented consequence of an import: the imported file becomes the dataset, so the name it
    // carries is the file name (visible in the toolbar and in the import report).
    expect(imported.datasetName).toBe('q3.csv');
    const authored = addInsightKpi(imported, { title:'Revenue reviewed', measure:'revenue' });
    // A placed visual plus a second report page are part of the document as well.
    const withVisual = {
      ...authored,
      report: addReportPage(placeVisual({
        ...authored.report,
        // A slicer and a drilled visual are part of the document too.
        pages:authored.report.pages.map((entry) => entry.id===authored.report.activePageId
          ? { ...entry, slicers:[{ ...createSlicer('region', 'list', ['Europe']), selection:['Europe'] }] }
          : entry),
      }, authored.report.activePageId, {
        ...createInsightVisual('column', authored.queries[0].id, 'Revenue by region', { x:16, y:16, width:560, height:320 }),
        encoding:{ category:'product', values:['revenue'], aggregation:'SUM' as const },
        drillLevel:1,
      }), 'Detail'),
    };
    const withPivot = { ...withVisual, pivotConfig:{ ...withVisual.pivotConfig, rowDimension:'product' as const, aggFunc:'AVG' as const } };

    const bytes = await packInsightDocument(document(withPivot), withPivot, { password: PASSWORD });
    const reopened = await reopenInsightDocument(bytes, { password: PASSWORD });

    expect(compareInsightModels(withPivot, reopened.model)).toEqual({ identical: true });
    expect(reopened.model.datasetName).toBe('q3.csv');
    expect(reopened.model.records.map((row) => row.revenue)).toEqual([100, 300]);
    expect(reopened.model.kpis).toHaveLength(1);
    expect(reopened.model.kpis[0].measure).toBe('revenue');
    expect(reopened.model.pivotConfig.aggFunc).toBe('AVG');
    expect(reopened.model.cache.sourceState).toBe('fresh');
    // The report structure survives: two pages and the placed visual with its encoding and position.
    expect(reopened.model.report.pages.map((page) => page.name)).toEqual(['Page 1', 'Detail']);
    // The created dataset has no seeded visual, so the placed one is the only visual on page 1.
    expect(reopened.model.report.pages[0].visuals).toHaveLength(1);
    const placed = reopened.model.report.pages[0].visuals.at(-1)!;
    expect(placed.title).toBe('Revenue by region');
    expect(placed.encoding).toEqual({ category:'product', values:['revenue'], aggregation:'SUM' });
    expect(placed.drillLevel).toBe(1);
    expect([placed.x, placed.y, placed.width, placed.height]).toEqual([16, 16, 560, 320]);
    // The slicer selection is document state and comes back with the page.
    expect(reopened.model.report.pages[0].slicers).toHaveLength(1);
    expect(reopened.model.report.pages[0].slicers[0].field).toBe('region');
    expect(reopened.model.report.pages[0].slicers[0].selection).toEqual(['Europe']);
    // A single changed field is still detected, so "identical" is a measurement and not a constant.
    const tampered = { ...reopened.model, pivotConfig:{ ...reopened.model.pivotConfig, aggFunc:'SUM' as const } };
    expect(compareInsightModels(withPivot, tampered)).toEqual({ identical: false, difference:'pivotConfig' });
  });

  it('keeps a connected workbook, its reference and its source across Save/Close/Reopen', async () => {
    // The cross-app connection path: read the workbook, register the source and the live reference,
    // then save and reopen the whole document.
    const cells: Record<string, { value: string | number }> = {};
    const header = ['id', 'region', 'product', 'quarter', 'revenue', 'cost', 'activeUsers', 'anomalyScore'];
    const data = [['r1', 'Europe', 'Mesh', 'Q1', '100', '40', '10', '0.01'], ['r2', 'Europe', 'Core', 'Q2', '300', '90', '20', '0.03']];
    [header, ...data].forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      cells[`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`] = { value:/^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value };
    }));
    const workbook = {
      id:'workbook-q3', kind:'Grid', title:'Sales workbook Q3', created_at:1_700_000_000_000, modified_at:1_700_000_001_000, version:7,
      root_object_ids:[], objects:{ 'sheet-1-table':{ id:'sheet-1-table', type:'TableObject', data:{ id:'sheet-1-table', rows:3, cols:8, cells } } },
      gridData:{ sheets:[{ id:'sheet-1', name:'Sheet 1', tableObjectId:'sheet-1-table' }] },
    } as unknown as WorkspaceDocument;

    const connected = connectInsightWorkspaceSource(createEmptyInsightModel('Connected'), workbook, 1000);
    expect(connected.report.ok).toBe(true);
    expect(connected.model.workspaceReferences).toHaveLength(1);

    const bytes = await packInsightDocument(document(connected.model), connected.model, { password: PASSWORD });
    const reopened = await reopenInsightDocument(bytes, { password: PASSWORD });

    expect(compareInsightModels(connected.model, reopened.model)).toEqual({ identical: true });
    expect(reopened.model.workspaceReferences[0].canonicalUri).toBe(connected.referenceUri);
    expect(reopened.model.workspaceReferences[0].sourceVersion).toBe(7);
    expect(reopened.model.sources.at(-1)?.canonicalUri).toBe(connected.source?.canonicalUri);
    expect(reopened.model.records.map((row) => row.revenue)).toEqual([100, 300]);
  });

  it('refuses to open with the wrong credential instead of returning an empty document', async () => {
    const bytes = await packInsightDocument(document(), structuredClone(DEFAULT_INSIGHT_MODEL), { password: PASSWORD });
    await expect(reopenInsightDocument(bytes, { password: 'wrong password' })).rejects.toBeInstanceOf(Error);
    await expect(reopenInsightDocument(bytes, {})).rejects.toBeInstanceOf(Error);
  });

  it('rejects a payload that is not an Insight document and a payload that is not encrypted at all', async () => {
    const notInsight = document();
    notInsight.kind = 'Grid';
    await expect(packNativeInsight(notInsight, { password: PASSWORD })).rejects.toThrowError('native-insight-payload-missing');
    const plaintext = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
    await expect(reopenInsightDocument(plaintext, { password: PASSWORD })).rejects.toThrowError('native-unencrypted-container');
    const short = new Uint8Array(8);
    await expect(reopenInsightDocument(short, { password: PASSWORD })).rejects.toThrowError('native-size-limit');
  });

  it('names the first differing field when a reopened payload is not identical', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    expect(compareInsightModels(model, structuredClone(model))).toEqual({ identical: true });
    // Key order is not a data change.
    const reordered = { ...structuredClone(model) } as Record<string, unknown>;
    expect(compareInsightModels(model, reordered as unknown as typeof model)).toEqual({ identical: true });

    const changed = structuredClone(model);
    changed.records[0].revenue = changed.records[0].revenue + 1;
    expect(compareInsightModels(model, changed)).toEqual({ identical: false, difference: 'records' });

    const renamed = structuredClone(model);
    renamed.datasetName = 'Something else';
    expect(compareInsightModels(model, renamed)).toEqual({ identical: false, difference: 'datasetName' });

    const dropped = structuredClone(model);
    dropped.kpis = [];
    expect(compareInsightModels(model, dropped)).toEqual({ identical: false, difference: 'kpis' });
  });

  it('bounds the container size before doing any cryptography', async () => {
    const oversized = new Uint8Array(INSIGHT_NATIVE_LIMITS.maxBytes + 1);
    await expect(reopenInsightDocument(oversized, { password: PASSWORD })).rejects.toThrowError(InsightError);
    expect(INSIGHT_NATIVE_LIMITS.maxBytes).toBe(128 * 1024 * 1024);
  });
});
