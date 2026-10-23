// STATUS: DIAMANT VGT SUPREME — Power Query public compatibility facade
// Product callers retain one stable import while query responsibilities are isolated.

export { assertQueryTableLimits, executeQueryPipeline } from './gridPowerQueryEngine';
export type { QueryColumn, QueryColumnType, QueryPipelineResult, QueryStep, QueryStepType, QueryTable, QueryValue } from './gridPowerQueryEngine';
export type { GridQueryConversionReport } from './gridQueryStepValidation';
export { compareGridQueryValues, toGridQueryNumber, toGridQueryText } from './gridQueryStepValidation';
export { parseCsvToQueryTable } from './gridPowerQueryCsv';
export { queryResultToGridCells } from './gridPowerQueryProjection';
