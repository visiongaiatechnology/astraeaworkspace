// STATUS: PLATIN — BATCH-INSIGHT-2: the local import really replaces the dataset, or it refuses.
//
// MEASURED FACT before this batch: the bounded file reader in the connector engine was reachable
// from no component — the visible Insight surface had no import entry point at all, and
// `InsightDataSource.schema` was written by nothing.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightDocumentModel } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { executeInsightQuery } from '../queries/insightQueryEngine';
import { importInsightDataset, canonicalColumnTypes, INSIGHT_CANONICAL_COLUMNS } from '../connectors/insightImportCore';

const base = (): InsightDocumentModel => structuredClone(DEFAULT_INSIGHT_MODEL);
const HEADER = 'id,region,product,quarter,revenue,cost,activeUsers,anomalyScore';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n') + '\n';

describe('Insight local import (pure)', () => {
  it('imports a canonical CSV, registers a typed source and repoints the local query to it', () => {
    const model = base();
    const { model: next, source, report } = importInsightDataset(model, {
      name: 'Sales 2026',
      kind: 'csv',
      text: csv('r1,Europe-Central,Mesh,Q1,100,40,10,0.01', 'r2,Europe-North,Core,Q1,200,90,20,0.02'),
    }, 1000);

    expect(report.ok).toBe(true);
    expect(report.rows).toBe(2);
    expect(report.skippedRows).toBe(0);
    expect(report.missingColumns).toEqual([]);
    expect(next.datasetName).toBe('Sales 2026');
    expect(next.records).toHaveLength(2);
    expect(next.records[0]).toEqual({ id:'r1', region:'Europe-Central', product:'Mesh', quarter:'Q1', revenue:100, cost:40, activeUsers:10, anomalyScore:0.01 });
    // The data types of the imported file are really recorded on the source.
    expect(source?.schema?.tables[0].columns.map((column) => `${column.name}:${column.type}`)).toEqual([
      'id:string', 'region:string', 'product:string', 'quarter:string',
      'revenue:integer', 'cost:integer', 'activeUsers:integer', 'anomalyScore:number',
    ]);
    expect(source?.canonicalUri.startsWith('vgt://insight/file/csv/')).toBe(true);
    expect(next.sources.at(-1)?.id).toBe(source?.id);
    // The one local query now reads the imported source with a fresh pipeline.
    expect(next.queries[0].sourceId).toBe(source?.id);
    expect(next.queries[0].steps).toEqual([]);
    expect(next.querySteps).toEqual([]);
  });

  it('feeds the imported rows into the executor the surface uses', () => {
    const { model: next } = importInsightDataset(base(), {
      name: 'Sales', kind: 'csv', text: csv('r1,Europe,Mesh,Q1,100,40,10,0.01', 'r2,Europe,Mesh,Q2,300,90,20,0.02'),
    }, 1000);
    const source = next.sources.at(-1)!;
    const result = executeInsightQuery(next.queries[0].id, next.queries, new Map([[source.id, next.records.map((row) => ({ ...row }))]]), new Map([[source.id, source]]));
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.revenue)).toEqual([100, 300]);
  });

  it('refuses a file that is missing a canonical column and leaves the model untouched', () => {
    const model = base();
    const { model: next, source, report } = importInsightDataset(model, {
      name: 'Broken', kind: 'csv', text: 'id,region,product,revenue\nr1,Europe,Mesh,100\n',
    }, 1000);
    expect(report.ok).toBe(false);
    expect(report.reason).toBe('import-canonical-columns-missing');
    expect(report.missingColumns).toEqual(['quarter', 'cost', 'activeUsers', 'anomalyScore']);
    expect(source).toBeNull();
    // Fail-closed: not one field of the previous dataset changed.
    expect(next).toBe(model);
  });

  it('reports per-row source errors line by line and imports only the usable rows', () => {
    const { report } = importInsightDataset(base(), {
      name: 'Mixed', kind: 'csv',
      text: csv('r1,Europe,Mesh,Q1,100,40,10,0.01', 'r2,Europe,Mesh,Q1,not-a-number,40,10,0.01', 'r1,Europe,Mesh,Q2,120,50,11,0.01'),
    }, 1000);
    expect(report.ok).toBe(true);
    expect(report.rows).toBe(1);
    expect(report.skippedRows).toBe(2);
    expect(report.errors).toEqual([
      { row:2, column:'revenue', code:'import-canonical-value-invalid' },
      { row:3, column:'id', code:'import-id-duplicate' },
    ]);
    // The declared type comes from the document, the observed type from the file; the difference is
    // visible instead of being converted away.
    expect(report.types.find((entry) => entry.column === 'revenue')).toEqual({ column:'revenue', declared:'currency', observed:'string' });
    expect(report.mismatches).toContainEqual({ column:'revenue', declared:'currency', observed:'string' });
    expect(report.columns.find((column) => column.name === 'revenue')?.type).toBe('string');
  });

  it('takes the declared canonical types from the document semantic model, not from a second list', () => {
    const model = base();
    const declared = canonicalColumnTypes(model);
    const fromModel = new Map(model.semanticModel.tables.flatMap((table) => table.columns).map((column) => [column.name, column.dataType]));
    for (const column of INSIGHT_CANONICAL_COLUMNS) {
      expect(declared[column]).toBe(fromModel.get(column) ?? declared[column]);
    }
    expect(declared.revenue).toBe('currency');
    expect(declared.activeUsers).toBe('integer');
    // A document without a semantic model falls back to the documented intake contract.
    const bare = { ...model, semanticModel:{ ...model.semanticModel, tables:[] } };
    expect(canonicalColumnTypes(bare).revenue).toBe('number');
  });

  it('refuses a file whose rows are all unusable and leaves the model untouched', () => {
    const model = base();
    const { model: next, report } = importInsightDataset(model, {
      name: 'Bad', kind: 'csv', text: csv(',Europe,Mesh,Q1,100,40,10,0.01'),
    }, 1000);
    expect(report.ok).toBe(false);
    expect(report.reason).toBe('import-rows-unusable');
    expect(report.errors).toEqual([{ row:1, column:'id', code:'import-id-missing' }]);
    expect(next).toBe(model);
  });

  it('imports JSON objects and infers their native types', () => {
    const { model: next, report, source } = importInsightDataset(base(), {
      name: 'Json sales', kind: 'json',
      text: JSON.stringify([
        { id:'j1', region:'Europe', product:'Mesh', quarter:'Q1', revenue:1000, cost:400, activeUsers:10, anomalyScore:0.5, certified:true },
        { id:'j2', region:'Europe', product:'Core', quarter:'Q2', revenue:2000.5, cost:500, activeUsers:20, anomalyScore:0.25, certified:false },
      ]),
    }, 1000);
    expect(report.ok).toBe(true);
    expect(report.rows).toBe(2);
    expect(source?.schema?.tables[0].columns.find((column) => column.name === 'certified')?.type).toBe('boolean');
    expect(source?.schema?.tables[0].columns.find((column) => column.name === 'revenue')?.type).toBe('number');
    expect(next.records[1].revenue).toBe(2000.5);
  });

  it('rejects JSON that is not an array of objects, with a named reason', () => {
    expect(() => importInsightDataset(base(), { name:'x', kind:'json', text:'{"id":"r1"}' }, 1000)).toThrowError('json-root-array-required');
    expect(() => importInsightDataset(base(), { name:'x', kind:'json', text:'[[[1]]]' }, 1000)).not.toThrow();
  });

  it('bounds the input by bytes and by name before anything is read', () => {
    expect(() => importInsightDataset(base(), { name:'empty', kind:'csv', text:'' }, 1000)).toThrowError('file-byte-limit');
    expect(() => importInsightDataset(base(), { name:'   ', kind:'csv', text:csv('r1,E,P,Q1,1,1,1,0') }, 1000)).toThrowError(InsightError);
  });
});
