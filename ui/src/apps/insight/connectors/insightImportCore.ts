// STATUS: PLATIN — BATCH-INSIGHT-2: real local CSV/TSV/JSON import into the canonical Insight model.
//
// MEASURED FACTS before this batch:
//  - `connectors/insightConnectorEngine.ts` owned a complete, bounded local file reader
//    (`parseTabularFile`, `createFileSource`, `assertSourceSafe`) that NO component could reach.
//    There was no import entry point anywhere in the visible Insight surface.
//  - `InsightDataSource.schema` (`domain/types.ts:31`) was never written by anything, so no data
//    type was ever visualised.
//
// Two type facts are kept apart on purpose, because confusing them is how an import silently loses
// data: the DECLARED type comes from the document's own semantic model (the single definition of
// what `revenue` means) and decides the conversion; the OBSERVED type is inferred from the file and
// is reported so the user can see a mismatch. A value that does not fit the declared type makes its
// ROW an error with a row number and a column — never a silently dropped number.
import type { InsightColumnSchema, InsightDataType, InsightDataSource, InsightDocumentModel, InsightRecord, InsightScalar } from '../domain/types';
import { InsightError, cleanText, stableInsightId } from '../core/insightCore';
import { assertSourceSafe, createFileSource } from './insightConnectorEngine';
import { nextInsightCache } from '../refresh/insightRefreshOutcome';
import { TABULAR_LIMITS, assertJsonDepth, convertCell, inferColumnType, readDelimitedTable, type InsightRawTable, type InsightSourceError } from './insightTabularCore';

export type InsightImportKind = 'csv' | 'tsv' | 'json';
export const INSIGHT_CANONICAL_COLUMNS = ['id', 'region', 'product', 'quarter', 'revenue', 'cost', 'activeUsers', 'anomalyScore'] as const;
/** Intake contract for a document whose semantic model declares nothing about a canonical column. */
const CANONICAL_FALLBACK_TYPES:Readonly<Record<string, InsightDataType>> = {
  id:'string', region:'string', product:'string', quarter:'string',
  revenue:'number', cost:'number', activeUsers:'number', anomalyScore:'number',
};
export const INSIGHT_IMPORT_LIMITS = { maxReportedErrors:256 } as const;

export interface InsightImportTypeMismatch { column:string; declared:InsightDataType; observed:InsightDataType; }
export interface InsightImportReport {
  readonly ok:boolean;
  /** '' when ok, otherwise a named reason the import was refused. */
  readonly reason:string;
  readonly rows:number;
  readonly skippedRows:number;
  /** The observed data types of the imported file — visualised in the sources panel. */
  readonly columns:InsightColumnSchema[];
  /** Declared (model) type vs observed (file) type for every canonical column. */
  readonly types:Array<{ column:string; declared:InsightDataType; observed:InsightDataType }>;
  readonly mismatches:InsightImportTypeMismatch[];
  /** Source errors with their 1-based data row number and column, so they can be shown line by line. */
  readonly errors:InsightSourceError[];
  readonly missingColumns:string[];
}
export interface InsightImportResult { readonly model:InsightDocumentModel; readonly report:InsightImportReport; readonly source:InsightDataSource|null; }

const encoder = new TextEncoder();
/** The declared data types that hold numbers. One definition, used by the import and by the chart bridge. */
export const INSIGHT_NUMERIC_DATA_TYPES: ReadonlySet<InsightDataType> = new Set(['integer', 'number', 'currency', 'percentage', 'duration']);
const NUMERIC_DECLARED = INSIGHT_NUMERIC_DATA_TYPES;

/** The declared type of a canonical column, read from the document's own semantic model. */
export function canonicalColumnTypes(model:InsightDocumentModel):Record<string, InsightDataType>{
  const declared = new Map<string, InsightDataType>();
  for (const table of model.semanticModel.tables) for (const column of table.columns) if (!declared.has(column.name)) declared.set(column.name, column.dataType);
  return Object.fromEntries(INSIGHT_CANONICAL_COLUMNS.map((column) => [column, declared.get(column) ?? CANONICAL_FALLBACK_TYPES[column]]));
}

/** JSON array of objects -> raw string cells, sharing the delimited reader's limits. */
function readJsonRawTable(text:string,limits=TABULAR_LIMITS):InsightRawTable{
  assertJsonDepth(text, limits.maxDepth);
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new InsightError('json-root-array-required');
  if (parsed.length > limits.maxRows) throw new InsightError('file-row-limit');
  const headers:string[] = [];
  const errors:InsightSourceError[] = [];
  const rows:string[][] = [];
  parsed.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push({ row:index + 1, column:'', code:'json-row-invalid' }); return; }
    const record = item as Record<string, unknown>;
    for (const key of Object.keys(record)) if (!headers.includes(key)) headers.push(key);
    if (headers.length > limits.maxColumns) throw new InsightError('tabular-column-limit');
    rows.push(headers.map((header) => {
      const value = record[header];
      return value === null || value === undefined ? '' : typeof value === 'string' ? value : String(value);
    }));
  });
  return { headers, rows, errors };
}

export interface InsightDatasetMapping extends InsightImportReport { records:InsightRecord[]; }
/**
 * The ONE mapping from a raw table onto the canonical dataset. A local file import and a workspace
 * (Grid/Tasks/Vault) connection both go through it, so the two paths can never disagree about which
 * rows are usable, which types were observed and what a refusal means.
 */
export function mapInsightTableToRecords(model:InsightDocumentModel,input:{ name:string; raw:InsightRawTable }):InsightDatasetMapping{
  const { raw } = input;
  const declared = canonicalColumnTypes(model);
  const observed:InsightColumnSchema[] = raw.headers.map((header, index) => ({
    name:header,
    type:inferColumnType(raw.rows.map((row) => row[index] ?? '')),
    nullable:raw.rows.some((row) => (row[index] ?? '').trim() === ''),
  }));
  const types = INSIGHT_CANONICAL_COLUMNS.filter((column) => raw.headers.includes(column)).map((column) => ({ column, declared:declared[column], observed:observed.find((entry) => entry.name === column)?.type ?? 'unknown' }));
  const mismatches = types.filter((entry) => entry.observed !== 'unknown' && !sameFamily(entry.declared, entry.observed));
  const missingColumns = INSIGHT_CANONICAL_COLUMNS.filter((column) => !raw.headers.includes(column));
  const base = { rows:0, skippedRows:raw.errors.length, columns:observed, types, mismatches, errors:raw.errors.slice(0, INSIGHT_IMPORT_LIMITS.maxReportedErrors), missingColumns:[...missingColumns], records:[] as InsightRecord[] };
  if (missingColumns.length) return { ...base, ok:false, reason:'import-canonical-columns-missing' };

  const index = new Map(raw.headers.map((header, position) => [header, position]));
  const errors = [...raw.errors];
  const records:InsightRecord[] = [];
  const seen = new Set<string>();
  raw.rows.forEach((row, position) => {
    const rawId = (row[index.get('id')!] ?? '').trim();
    if (!rawId) { errors.push({ row:position + 1, column:'id', code:'import-id-missing' }); return; }
    if (seen.has(rawId)) { errors.push({ row:position + 1, column:'id', code:'import-id-duplicate' }); return; }
    const values:Record<string, InsightScalar> = {};
    let failed = false;
    for (const column of INSIGHT_CANONICAL_COLUMNS) {
      const cell = row[index.get(column)!] ?? '';
      const value = convertCell(cell, declared[column]);
      if (NUMERIC_DECLARED.has(declared[column]) && (typeof value !== 'number' || !Number.isFinite(value))) {
        errors.push({ row:position + 1, column, code:'import-canonical-value-invalid' });
        failed = true;
      }
      values[column] = value;
    }
    if (failed) return;
    seen.add(rawId);
    records.push({
      id:String(values.id),
      region:String(values.region),
      product:String(values.product),
      quarter:String(values.quarter),
      revenue:Number(values.revenue),
      cost:Number(values.cost),
      activeUsers:Number(values.activeUsers),
      anomalyScore:Number(values.anomalyScore),
    });
  });

  if (!records.length) return { ...base, ok:false, reason:'import-rows-unusable', skippedRows:errors.length, errors:errors.slice(0, INSIGHT_IMPORT_LIMITS.maxReportedErrors), records:[] };
  return { ...base, ok:true, reason:'', rows:records.length, skippedRows:errors.length, errors:errors.slice(0, INSIGHT_IMPORT_LIMITS.maxReportedErrors), records };
}

export function importInsightDataset(
  model:InsightDocumentModel,
  input:{ name:string; kind:InsightImportKind; text:string },
  now:number = Date.now(),
):InsightImportResult {
  const name = cleanText(input.name,256);
  const bytes = encoder.encode(input.text).byteLength;
  if (bytes === 0 || bytes > TABULAR_LIMITS.maxBytes) throw new InsightError('file-byte-limit');

  const raw = input.kind === 'csv' ? readDelimitedTable(input.text, ',')
    : input.kind === 'tsv' ? readDelimitedTable(input.text, '\t')
    : readJsonRawTable(input.text);

  const mapping = mapInsightTableToRecords(model, { name, raw });
  const report:InsightImportReport = { ok:mapping.ok, reason:mapping.reason, rows:mapping.rows, skippedRows:mapping.skippedRows, columns:mapping.columns, types:mapping.types, mismatches:mapping.mismatches, errors:mapping.errors, missingColumns:mapping.missingColumns };
  if (!mapping.ok) return { model, source:null, report };

  const fingerprint = stableInsightId('fp', input.text);
  const source = createFileSource(name, input.kind, fingerprint);
  const withSchema:InsightDataSource = { ...source, schema:{ tables:[{ name, columns:mapping.columns }], discoveredAt:now } };
  assertSourceSafe(withSchema);
  const next:InsightDocumentModel = {
    ...model,
    revision:model.revision + 1,
    datasetName:name,
    records:mapping.records,
    querySteps:[],
    // A local file really was read, so the cache may say so — through the one cache definition.
    cache:nextInsightCache(model.cache,{ kind:'read', rows:mapping.records.length, nextSourceState:'fresh' },now),
    // The imported file is the new source of the one local query: a fresh, empty pipeline that
    // really reads the imported rows instead of the previous dataset's steps.
    queries:model.queries.map((query, position) => position === 0 ? { ...query, sourceId:withSchema.id, steps:[], version:query.version + 1 } : query),
    sources:[...model.sources, withSchema],
  };
  return { model:next, source:withSchema, report:{ ...report, rows:mapping.records.length, missingColumns:[] } };
}

function sameFamily(declared:InsightDataType, observed:InsightDataType):boolean{
  if (declared === observed) return true;
  if (NUMERIC_DECLARED.has(declared) && (observed === 'integer' || observed === 'number')) return true;
  return false;
}
