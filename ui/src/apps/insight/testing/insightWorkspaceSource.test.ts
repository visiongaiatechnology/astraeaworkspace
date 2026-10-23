// STATUS: PLATIN — BATCH-INSIGHT-4: an existing workbook really becomes an Insight dataset.
//
// MEASURED FACTS before this batch: `createWorkspaceSource` and the whole workspace reference path had
// no importer, and the shell did not pass the document list to Insight, so this package was unreachable
// twice over. The read below uses only the shared grid contract
// (`shared/contracts/grid/workspaceGrid.ts`: TableObject { rows, cols, cells }, GridCell { value }).
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DEFAULT_INSIGHT_MODEL, type InsightDocumentModel } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { executeInsightQuery } from '../queries/insightQueryEngine';
import {
  INSIGHT_READABLE_SOURCE_KINDS,
  INSIGHT_WORKSPACE_LIMITS,
  connectInsightWorkspaceSource,
  findGridTableObjectId,
  insightWorkspaceSourceKind,
  listInsightWorkspaceCandidates,
  readGridTableObject,
} from '../connectors/insightWorkspaceSource';

const HEADER = ['id', 'region', 'product', 'quarter', 'revenue', 'cost', 'activeUsers', 'anomalyScore'];
const DATA = [
  ['r1', 'Europe-Central', 'Mesh', 'Q1', '100', '40', '10', '0.01'],
  ['r2', 'Europe-North', 'Core', 'Q1', '200', '90', '20', '0.02'],
  ['r3', 'Europe-Central', 'Core', 'Q2', '300', '110', '30', '0.03'],
];

/** Build a Grid document through the shared contract only (A1 keys, like a real sheet). */
function gridDocument(rows: string[][] = [HEADER, ...DATA], overrides: Record<string, unknown> = {}): WorkspaceDocument {
  const cells: Record<string, { value: string | number | boolean }> = {};
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (value === '') return;
    const letter = String.fromCharCode(65 + columnIndex);
    cells[`${letter}${rowIndex + 1}`] = { value: /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value };
  }));
  return {
    id: 'workbook-q3', kind: 'Grid', title: 'Sales workbook Q3', created_at: 1_700_000_000_000, modified_at: 1_700_000_001_000,
    version: 7, theme_id: 'default', root_object_ids: [], objects: { 'sheet-1-table': { id: 'sheet-1-table', type: 'TableObject', data: { id: 'sheet-1-table', rows: rows.length, cols: HEADER.length, cells } } },
    gridData: { sheets: [{ id: 'sheet-1', name: 'Sheet 1', tableObjectId: 'sheet-1-table' }] },
    ...overrides,
  } as unknown as WorkspaceDocument;
}
const base = (): InsightDocumentModel => structuredClone(DEFAULT_INSIGHT_MODEL);

describe('Insight workspace source listing (pure)', () => {
  it('maps only the kinds this app can really read and names the rest honestly', () => {
    expect(insightWorkspaceSourceKind('Grid')).toBe('grid');
    expect(insightWorkspaceSourceKind('Tasks')).toBe('tasks');
    expect(insightWorkspaceSourceKind('Vault')).toBe('vault-file');
    expect(insightWorkspaceSourceKind('Writer')).toBeUndefined();
    expect(INSIGHT_READABLE_SOURCE_KINDS.has('grid')).toBe(true);
    // Tasks and Vault are mapped but have no reader in this build, so they must not be advertised as readable.
    expect(INSIGHT_READABLE_SOURCE_KINDS.has('tasks')).toBe(false);

    const candidates = listInsightWorkspaceCandidates([
      gridDocument(),
      { id: 'writer-1', kind: 'Writer', title: 'A document' } as unknown as WorkspaceDocument,
      { id: 'tasks-1', kind: 'Tasks', title: 'A task list', version: 2 } as unknown as WorkspaceDocument,
    ]);
    expect(candidates.map((entry) => `${entry.title}:${entry.sourceKind}:${entry.readable}`)).toEqual([
      'A task list:tasks:false',
      'Sales workbook Q3:grid:true',
    ]);
  });
});

describe('Insight grid read (pure)', () => {
  it('reads the first visible sheet through the shared contract, A1 or row:col keys', () => {
    const document = gridDocument();
    expect(findGridTableObjectId(document)).toBe('sheet-1-table');
    const table = readGridTableObject(document, 'sheet-1-table');
    expect(table.headers).toEqual(HEADER);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]).toEqual(DATA[0]);
    expect(table.errors).toEqual([]);

    // row:col keys describe the same sheet.
    const rc = gridDocument();
    const tableObject = (rc.objects['sheet-1-table'] as { data: { cells: Record<string, unknown> } }).data;
    const rebuilt: Record<string, unknown> = {};
    for (const [key, cell] of Object.entries(tableObject.cells)) rebuilt[key.replace(/^([A-Z])(\d+)$/, (_m, letter: string, row: string) => `${Number(row) - 1}:${letter.charCodeAt(0) - 65}`)] = cell;
    tableObject.cells = rebuilt;
    expect(readGridTableObject(rc, 'sheet-1-table').rows[0]).toEqual(DATA[0]);
  });

  it('reports an unreadable cell key instead of dropping it silently', () => {
    const document = gridDocument();
    (document.objects['sheet-1-table'] as { data: { cells: Record<string, unknown> } }).data.cells['??'] = { value: 'orphan' };
    const table = readGridTableObject(document, 'sheet-1-table');
    expect(table.errors).toEqual([{ row:0, column:'??', code:'workspace-cell-key-invalid' }]);
    expect(table.rows).toHaveLength(3);
  });

  it('rejects a document without a table object and an unreadable table shape by name', () => {
    const empty = gridDocument();
    empty.objects = {};
    expect(findGridTableObjectId(empty)).toBeUndefined();
    expect(() => connectInsightWorkspaceSource(base(), empty)).toThrowError('workspace-grid-table-missing');
    const broken = gridDocument();
    (broken.objects['sheet-1-table'] as { data: unknown }).data = { rows: 3, cols: 2 };
    expect(() => readGridTableObject(broken, 'sheet-1-table')).toThrowError('workspace-grid-table-invalid');
    expect(() => readGridTableObject(gridDocument(), 'does-not-exist')).toThrowError(InsightError);
  });

  it('bounds the read by the cells that really exist, not by the declared sheet size', () => {
    // A sparse sheet that declares a million rows but holds four cells must still read fine.
    const sparse = gridDocument();
    (sparse.objects['sheet-1-table'] as { data: { rows: number; cols: number } }).data.rows = 1_048_576;
    (sparse.objects['sheet-1-table'] as { data: { cols: number } }).data.cols = 16_384;
    expect(readGridTableObject(sparse, 'sheet-1-table').rows).toHaveLength(3);
    // More existing cells than the documented bound is refused by name.
    const wide = gridDocument();
    const cells = (wide.objects['sheet-1-table'] as { data: { cells: Record<string, unknown> } }).data.cells;
    for (let index = 0; index < INSIGHT_WORKSPACE_LIMITS.maxCells + 1; index += 1) cells[`${index}:0`] = { value: index };
    expect(() => readGridTableObject(wide, 'sheet-1-table')).toThrowError('workspace-read-cell-limit');
  });
});

describe('Insight workbook connection (pure)', () => {
  it('builds the dataset from the workbook and registers a typed source plus a live reference', () => {
    const model = base();
    const { model: next, source, report, referenceUri } = connectInsightWorkspaceSource(model, gridDocument(), 1000);

    expect(report.ok).toBe(true);
    expect(report.rows).toBe(3);
    expect(report.missingColumns).toEqual([]);
    expect(next.datasetName).toBe('Sales workbook Q3');
    expect(next.records.map((row) => row.id)).toEqual(['r1', 'r2', 'r3']);
    expect(next.records.map((row) => row.revenue)).toEqual([100, 200, 300]);

    // A real workspace source with a stable id, a canonical URI, the observed types and no secret.
    expect(source?.canonicalUri.startsWith('vgt://workspace/workbook-q3/grid/')).toBe(true);
    expect(source?.secretHandle).toBeUndefined();
    expect(source?.trust).toBe('workspace-trusted');
    expect(source?.schema?.tables[0].columns.find((column) => column.name === 'revenue')?.type).toBe('integer');
    expect(next.sources.at(-1)?.id).toBe(source?.id);

    // The cross-app reference carries the source version and the live mode.
    expect(referenceUri).toBe('vgt://workspace/workbook-q3/insight-source/grid/sheet-1-table');
    expect(next.workspaceReferences).toHaveLength(1);
    expect(next.workspaceReferences[0]).toMatchObject({ sourceDocumentId:'workbook-q3', sourceKind:'grid', mode:'live', sourceVersion:7 });
    // A file really was read, so the cache may say so — and the query now reads the workbook rows.
    expect(next.cache.sourceState).toBe('fresh');
    expect(next.queries[0].sourceId).toBe(source?.id);

    const rows = executeInsightQuery(next.queries[0].id, next.queries, new Map([[source!.id, next.records.map((row) => ({ ...row }))]]), new Map([[source!.id, source!]])).rows;
    expect(rows).toHaveLength(3);
  });

  it('refuses a workbook without the canonical columns and leaves the model untouched', () => {
    const model = base();
    const short = gridDocument([['id', 'region', 'revenue'], ['r1', 'Europe', '100']]);
    const { model: next, source, report } = connectInsightWorkspaceSource(model, short, 1000);
    expect(report.ok).toBe(false);
    expect(report.reason).toBe('import-canonical-columns-missing');
    expect(report.missingColumns).toEqual(['product', 'quarter', 'cost', 'activeUsers', 'anomalyScore']);
    expect(source).toBeNull();
    expect(next).toBe(model);
  });

  it('reports per-row workbook errors line by line and keeps only the usable rows', () => {
    const rows = [HEADER, ['r1', 'Europe', 'Mesh', 'Q1', '100', '40', '10', '0.01'], ['r2', 'Europe', 'Mesh', 'Q1', 'not-a-number', '40', '10', '0.01']];
    const { model: next, report } = connectInsightWorkspaceSource(base(), gridDocument(rows), 1000);
    expect(report.ok).toBe(true);
    expect(report.rows).toBe(1);
    expect(report.skippedRows).toBe(1);
    expect(report.errors).toEqual([{ row:2, column:'revenue', code:'import-canonical-value-invalid' }]);
    expect(next.records).toHaveLength(1);
  });

  it('refuses a document kind whose rows it cannot read yet instead of faking a connection', () => {
    const tasks = { id: 'tasks-1', kind: 'Tasks', title: 'Tasks', version: 1, objects: {} } as unknown as WorkspaceDocument;
    expect(() => connectInsightWorkspaceSource(base(), tasks)).toThrowError('workspace-source-reader-missing');
    const writer = { id: 'writer-1', kind: 'Writer', title: 'Doc', version: 1, objects: {} } as unknown as WorkspaceDocument;
    expect(() => connectInsightWorkspaceSource(base(), writer)).toThrowError('workspace-source-kind-invalid');
  });
});
