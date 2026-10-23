// STATUS: DIAMANT VGT SUPREME — Power Query Local ETL Engine
// In-memory tabular extraction, transformation pipeline, and loading engine

import { evaluateGridSafeExpression } from '../../../shared/expressions/gridSafeExpression';
import {
  assertQueryMatrixBounds,
  GRID_QUERY_MAX_CELL_CHARS,
  GRID_QUERY_MAX_CELLS,
  GRID_QUERY_MAX_COLUMNS,
  GRID_QUERY_MAX_ROWS,
  GRID_QUERY_MAX_STEPS,
  GRID_QUERY_MAX_SOURCE_BYTES,
} from './gridQueryLimits';
import {
  assertGridQueryStepList,
  assertGridQueryStepType,
  boundGridQueryCalculatedFormula,
  boundGridQueryColumnName,
  boundGridQueryDelimiter,
  createGridQueryConversionReport,
  noteGridQueryConversion,
  requireGridQueryAggregation,
  requireGridQueryColumnIndex,
  requireGridQueryColumnType,
  requireGridQueryFilterOperator,
  requireGridQueryJoinType,
  sortGridQueryRows,
  toGridQueryNumber,
  toGridQueryText,
  type GridQueryConversionReport,
} from './gridQueryStepValidation';

export type QueryColumnType = 'text' | 'number' | 'date' | 'boolean';
export type QueryValue = string | number | boolean | null;
export interface QueryTable { columns: QueryColumn[]; rows: QueryValue[][]; }

export interface QueryColumn {
  name: string;
  type: QueryColumnType;
}

export function assertQueryTableLimits(columns: readonly QueryColumn[], rows: readonly (readonly unknown[])[]): number {
  assertQueryMatrixBounds(rows.length, columns.length);
  let totalTextChars = 0;
  for (const column of columns) {
    if (typeof column.name !== 'string' || column.name.length > 256
      || !['text', 'number', 'date', 'boolean'].includes(column.type)) throw new Error('query_column_name_limit');
    totalTextChars += column.name.length;
  }
  for (const row of rows) {
    if (row.length > columns.length) throw new Error('query_row_width_invalid');
    for (const value of row) {
      if (typeof value === 'string') {
        if (value.length > GRID_QUERY_MAX_CELL_CHARS) throw new Error('query_cell_size_limit');
        totalTextChars += value.length;
        if (totalTextChars > GRID_QUERY_MAX_SOURCE_BYTES) throw new Error('query_table_text_limit');
      } else if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error('query_number_invalid');
      } else if (value !== null && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new Error('query_value_invalid');
      }
    }
  }
  return totalTextChars;
}

function assertQueryStepLimits(steps: readonly QueryStep[]): void {
  if (!Array.isArray(steps) || steps.length > GRID_QUERY_MAX_STEPS) throw new Error('query_step_limit');
  const pending: unknown[] = [...steps];
  const visited = new WeakSet<object>();
  let nodes = 0;
  let textChars = 0;
  while (pending.length) {
    const value = pending.pop();
    if (++nodes > 1_000_000) throw new Error('query_step_complexity_limit');
    if (typeof value === 'string') {
      textChars += value.length;
      if (value.length > GRID_QUERY_MAX_CELL_CHARS || textChars > GRID_QUERY_MAX_SOURCE_BYTES) throw new Error('query_step_text_limit');
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('query_step_number_invalid');
      continue;
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'undefined') continue;
    if (typeof value !== 'object') throw new Error('query_step_value_invalid');
    if (visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      if (value.length > GRID_QUERY_MAX_CELLS) throw new Error('query_step_array_limit');
      for (let index = 0; index < value.length; index++) pending.push(value[index]);
      continue;
    }
    let ownKeys = 0;
    for (const key in value) if (Object.prototype.hasOwnProperty.call(value, key)) {
      textChars += key.length;
      if (++ownKeys > GRID_QUERY_MAX_CELLS || textChars > GRID_QUERY_MAX_SOURCE_BYTES) throw new Error('query_step_object_limit');
      pending.push((value as Record<string, unknown>)[key]);
    }
  }
}

export type QueryStepType =
  | 'source'
  | 'filter'
  | 'rename'
  | 'changeType'
  | 'addCalculated'
  | 'split'
  | 'sort'
  | 'groupBy'
  | 'removeColumns'
  | 'unpivot'
  | 'pivot'
  | 'merge'
  | 'replace'
  | 'join'
  | 'append';

export interface QueryStep {
  id: string;
  type: QueryStepType;
  description: string;
  params: Record<string, any>;
}

export interface QueryPipelineResult {
  columns: QueryColumn[];
  rows: QueryValue[][];
  rowCount: number;
  appliedStepsCount: number;
  /** Steps that changed the schema (column count, name or type). Cheap and truthful. */
  schemaChangingSteps: number;
  /** Steps that changed the row count. Cheap and truthful. */
  rowCountChangingSteps: number;
  /** Lossy conversions (values that could not be typed) reported instead of replaced by a fake 0. */
  conversionReports: GridQueryConversionReport[];
}

/**
 * Executes a sequence of Power Query transformation steps.
 */
export function executeQueryPipeline(
  initialColumns: QueryColumn[],
  initialRows: QueryValue[][],
  steps: QueryStep[]
): QueryPipelineResult {
  assertQueryTableLimits(initialColumns, initialRows);
  assertQueryStepLimits(steps);
  // Unknown step types are rejected up front: they used to fall through `default: break` and were
  // silently counted as applied steps.
  assertGridQueryStepList(steps);
  let columns: QueryColumn[] = initialColumns.map((c) => ({ ...c }));
  let rows: QueryValue[][] = initialRows.map((r) => [...r]);
  const conversionReports: GridQueryConversionReport[] = [];
  let schemaChangingSteps = 0;
  let rowCountChangingSteps = 0;

  for (const step of steps) {
    const before = { columns: columns.map((column) => `${column.name}\u0000${column.type}`).join('\u0001'), rows: rows.length };
    assertGridQueryStepType(step.type);
    switch (step.type) {
      case 'source':
        break;

      case 'filter': {
        const colIndex = requireGridQueryColumnIndex(step.params.colIndex, columns.length);
        const operator = requireGridQueryFilterOperator(step.params.operator);
        const value = step.params.value;
        rows = rows.filter((row) => {
          const cellVal = row[colIndex];
          if (operator === 'equals') return String(cellVal) === String(value);
          if (operator === 'notEquals') return String(cellVal) !== String(value);
          if (operator === 'contains') return String(cellVal).toLowerCase().includes(String(value).toLowerCase());
          // Numeric comparison must never silently answer "false" for a non-numeric operand.
          const left = toGridQueryNumber(cellVal);
          const right = toGridQueryNumber(value);
          if (left === null || right === null) return false;
          return operator === 'greater' ? left > right : left < right;
        });
        break;
      }

      case 'rename': {
        const colIndex = requireGridQueryColumnIndex(step.params.colIndex, columns.length, 'query_rename_column_invalid');
        columns[colIndex]!.name = boundGridQueryColumnName(step.params.newName, columns[colIndex]!.name);
        break;
      }

      case 'changeType': {
        const colIndex = requireGridQueryColumnIndex(step.params.colIndex, columns.length, 'query_change_type_column_invalid');
        const targetType = requireGridQueryColumnType(step.params.targetType);
        columns[colIndex]!.type = targetType;
        const report = createGridQueryConversionReport(columns[colIndex]!.name, targetType === 'text' || targetType === 'date' ? 'number' : targetType);
        rows.forEach((r) => {
          const source = r[colIndex];
          if (targetType === 'number') {
            const numeric = toGridQueryNumber(source);
            noteGridQueryConversion(report, source, numeric !== null);
            r[colIndex] = numeric;
          } else if (targetType === 'boolean') {
            const text = toGridQueryText(source).toLowerCase();
            const boolean = text === 'true' || text === '1' || text === 'wahr' || text === 'ja'
              ? true
              : text === 'false' || text === '0' || text === 'falsch' || text === 'nein'
                ? false : null;
            noteGridQueryConversion(report, source, boolean !== null);
            r[colIndex] = boolean;
          } else {
            const text = toGridQueryText(source);
            noteGridQueryConversion(report, source, source === null || source === undefined || typeof source === 'string' || typeof source === 'number' || typeof source === 'boolean');
            r[colIndex] = text;
          }
        });
        if (report.unconvertible > 0) conversionReports.push(report);
        break;
      }

      case 'addCalculated': {
        const { newName } = step.params;
        if (columns.length >= GRID_QUERY_MAX_COLUMNS || rows.length * (columns.length + 1) > GRID_QUERY_MAX_CELLS) throw new Error('query_calculated_column_limit');
        const boundedFormula = boundGridQueryCalculatedFormula(step.params.formula);
        if (!boundedFormula.trim()) throw new Error('query_calculated_formula_empty');
        columns.push({ name: boundGridQueryColumnName(newName, 'Calculated'), type: 'number' });
        const newColIdx = columns.length - 1;
        const report = createGridQueryConversionReport(columns[newColIdx]!.name, 'number');

        rows.forEach((r) => {
          const variables: Record<string, number> = {};
          columns.slice(0, newColIdx).forEach((col, idx) => { variables[col.name] = toGridQueryNumber(r[idx]) ?? 0; });
          try {
            const produced = evaluateGridSafeExpression(boundedFormula, variables);
            if (Number.isFinite(produced)) { r.push(produced); noteGridQueryConversion(report, produced, true); }
            else { r.push(null); noteGridQueryConversion(report, boundedFormula, false); }
          } catch { r.push(null); noteGridQueryConversion(report, boundedFormula, false); }
        });
        if (report.unconvertible > 0) conversionReports.push(report);
        break;
      }

      case 'split': {
        const colIndex = requireGridQueryColumnIndex(step.params.colIndex, columns.length, 'query_split_column_invalid');
        const colToSplit = columns[colIndex]!;
        if (columns.length >= GRID_QUERY_MAX_COLUMNS || rows.length * (columns.length + 1) > GRID_QUERY_MAX_CELLS) throw new Error('query_split_column_limit');
        const safeDelimiter = boundGridQueryDelimiter(step.params.delimiter);

        columns.splice(colIndex, 1, { name: `${colToSplit.name}.1`, type: 'text' }, { name: `${colToSplit.name}.2`, type: 'text' });

        rows.forEach((r) => {
          const val = toGridQueryText(r[colIndex]);
          const splitAt = val.indexOf(safeDelimiter);
          const left = splitAt < 0 ? val : val.slice(0, splitAt);
          const right = splitAt < 0 ? '' : val.slice(splitAt + safeDelimiter.length);
          r.splice(colIndex, 1, left, right);
        });
        break;
      }

      case 'sort': {
        const colIndex = requireGridQueryColumnIndex(step.params.colIndex, columns.length, 'query_sort_column_invalid');
        if (typeof step.params.ascending !== 'boolean') throw new Error('query_sort_direction_invalid');
        rows = sortGridQueryRows(rows, colIndex, step.params.ascending);
        break;
      }

      case 'removeColumns': {
        const raw = step.params.colIndices;
        if (!Array.isArray(raw) || raw.length === 0) throw new Error('query_remove_columns_invalid');
        const unique = new Set<number>();
        for (const entry of raw) {
          const index = requireGridQueryColumnIndex(entry, columns.length, 'query_remove_columns_invalid');
          unique.add(index);
        }
        if (unique.size >= columns.length) throw new Error('query_remove_columns_would_empty_schema');
        for (const index of [...unique].sort((a, b) => b - a)) {
          columns.splice(index, 1);
          rows.forEach((r) => r.splice(index, 1));
        }
        break;
      }

      case 'groupBy': {
        const groupColIndex = requireGridQueryColumnIndex(step.params.groupColIndex, columns.length, 'query_group_column_invalid');
        const aggColIndex = requireGridQueryColumnIndex(step.params.aggColIndex, columns.length, 'query_group_aggregate_column_invalid');
        const aggFunction = requireGridQueryAggregation(step.params.aggFunction);
        const groups = new Map<string, number[]>();

        rows.forEach((r) => {
          const key = toGridQueryText(r[groupColIndex]);
          const num = toGridQueryNumber(r[aggColIndex]) ?? 0;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(num);
        });

        const newCols: QueryColumn[] = [
          columns[groupColIndex]!,
          { name: `${aggFunction}(${columns[aggColIndex]?.name || 'Value'})`, type: 'number' },
        ];

        const newRows: QueryValue[][] = [];
        for (const [key, values] of groups.entries()) {
          let aggVal = 0;
          if (aggFunction === 'sum') aggVal = values.reduce((s, v) => s + v, 0);
          else if (aggFunction === 'avg') aggVal = values.reduce((s, v) => s + v, 0) / values.length;
          else if (aggFunction === 'min') aggVal = values.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
          else if (aggFunction === 'max') aggVal = values.reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
          else aggVal = values.length;

          newRows.push([key, aggVal]);
        }

        columns = newCols;
        rows = newRows;
        break;
      }

      case 'unpivot': {
        const { fixedColIndices, unpivotColIndices, attributeColName, valueColName } = step.params as {
          fixedColIndices: number[];
          unpivotColIndices: number[];
          attributeColName?: string;
          valueColName?: string;
        };

        if (!Array.isArray(fixedColIndices) || !Array.isArray(unpivotColIndices)
          || fixedColIndices.length > GRID_QUERY_MAX_COLUMNS || unpivotColIndices.length > GRID_QUERY_MAX_COLUMNS) {
          throw new Error('query_unpivot_column_limit');
        }
        const safeFixed = fixedColIndices.map((index) => requireGridQueryColumnIndex(index, columns.length, 'query_unpivot_column_invalid'));
        const safeUnpivot = unpivotColIndices.map((index) => requireGridQueryColumnIndex(index, columns.length, 'query_unpivot_column_invalid'));
        if (!safeUnpivot.length) throw new Error('query_unpivot_requires_columns');
        const attrName = boundGridQueryColumnName(attributeColName, 'Attribute');
        const valName = boundGridQueryColumnName(valueColName, 'Value');
        const outputColumns = safeFixed.length + 2;
        assertQueryMatrixBounds(rows.length * safeUnpivot.length, outputColumns);

        const newCols: QueryColumn[] = [
          ...safeFixed.map((idx) => columns[idx]),
          { name: attrName, type: 'text' },
          { name: valName, type: 'text' },
        ];

        const newRows: QueryValue[][] = [];
        for (const row of rows) {
          const fixedVals = safeFixed.map((idx) => row[idx]);
          for (const uIdx of safeUnpivot) {
            const colDef = columns[uIdx];
            if (!colDef) continue;
            const attrVal = colDef.name;
            const cellVal = row[uIdx];
            newRows.push([...fixedVals, attrVal, cellVal]);
          }
        }

        columns = newCols;
        rows = newRows;
        break;
      }

      case 'merge': {
        const leftColIndex = requireGridQueryColumnIndex(step.params.leftColIndex, columns.length, 'query_merge_column_invalid');
        const rightColIndex = requireGridQueryColumnIndex(step.params.rightColIndex, columns.length, 'query_merge_column_invalid');
        if (leftColIndex === rightColIndex) throw new Error('query_merge_same_column');
        if (columns.length >= GRID_QUERY_MAX_COLUMNS || rows.length * (columns.length + 1) > GRID_QUERY_MAX_CELLS) throw new Error('query_merge_column_limit');
        const boundedDelimiter = String(step.params.delimiter ?? ' ').slice(0, 64);
        const existingTextChars = assertQueryTableLimits(columns, rows);
        let generatedTextChars = 0;
        for (const row of rows) {
          const resultLength = toGridQueryText(row[leftColIndex]).length + boundedDelimiter.length + toGridQueryText(row[rightColIndex]).length;
          if (resultLength > GRID_QUERY_MAX_CELL_CHARS) throw new Error('query_merge_cell_limit');
          generatedTextChars += resultLength;
          if (existingTextChars + generatedTextChars > GRID_QUERY_MAX_SOURCE_BYTES) throw new Error('query_merge_text_limit');
        }
        const safeName = boundGridQueryColumnName(step.params.newName, 'Merged');
        columns.push({ name: safeName, type: 'text' });
        rows = rows.map((row) => [...row, `${toGridQueryText(row[leftColIndex])}${boundedDelimiter}${toGridQueryText(row[rightColIndex])}`]);
        break;
      }

      case 'replace': {
        const colIndex = requireGridQueryColumnIndex(step.params.colIndex, columns.length, 'query_replace_column_invalid');
        const needle = String(step.params.find ?? '');
        if (!needle) throw new Error('query_replace_find_empty');
        const repl = String(step.params.replacement ?? '');
        const matchCase = step.params.matchCase === true;
        // Deterministic case folding: `toLocaleLowerCase` made the result locale dependent.
        const foldText = (value: string): string => (matchCase ? value : value.toLowerCase());
        const existingTextChars = assertQueryTableLimits(columns, rows);
        let textDelta = 0;
        for (const row of rows) {
          const value = toGridQueryText(row[colIndex]);
          const source = foldText(value);
          const target = foldText(needle);
          if (source.indexOf(target) < 0) continue;
          const nextLength = value.length - needle.length + repl.length;
          if (nextLength > GRID_QUERY_MAX_CELL_CHARS) throw new Error('query_replace_cell_limit');
          textDelta += nextLength - value.length;
          if (existingTextChars + textDelta > GRID_QUERY_MAX_SOURCE_BYTES) throw new Error('query_replace_text_limit');
        }
        // Replace *every* occurrence in the cell, not only the first one.
        rows = rows.map((row) => {
          const value = toGridQueryText(row[colIndex]);
          const source = foldText(value);
          const target = foldText(needle);
          if (source.indexOf(target) < 0) return row;
          let cursor = 0;
          let out = '';
          while (cursor < value.length) {
            const at = source.indexOf(target, cursor);
            if (at < 0) { out += value.slice(cursor); break; }
            out += value.slice(cursor, at) + repl;
            cursor = at + needle.length;
          }
          if (out.length > GRID_QUERY_MAX_CELL_CHARS) throw new Error('query_replace_cell_limit');
          const next = [...row];
          next[colIndex] = out;
          return next;
        });
        break;
      }

      case 'pivot': {
        const keyColIndex = requireGridQueryColumnIndex(step.params.keyColIndex, columns.length, 'query_pivot_column_invalid');
        const attributeColIndex = requireGridQueryColumnIndex(step.params.attributeColIndex, columns.length, 'query_pivot_column_invalid');
        const valueColIndex = requireGridQueryColumnIndex(step.params.valueColIndex, columns.length, 'query_pivot_column_invalid');
        const attrSet = new Set<string>();
        for (const row of rows) {
          const attribute = toGridQueryText(row[attributeColIndex]);
          if (attribute) {
            attrSet.add(attribute);
            if (attrSet.size >= GRID_QUERY_MAX_COLUMNS) throw new Error('query_pivot_column_limit');
          }
        }
        const attrs=Array.from(attrSet);
        if (attrs.length + 1 > GRID_QUERY_MAX_COLUMNS) throw new Error('query_pivot_column_limit');
        const distinctKeys = new Set(rows.map((row) => toGridQueryText(row[keyColIndex]))).size;
        assertQueryMatrixBounds(distinctKeys, attrs.length + 1);
        const attributeIndex = new Map<string, number>();
        attrs.forEach((attribute, index) => attributeIndex.set(attribute, index));
        const byKey=new Map<string, QueryValue[]>();
        for(const row of rows){
          const key=toGridQueryText(row[keyColIndex]);
          let target=byKey.get(key);
          if(!target){target=[row[keyColIndex],...new Array<QueryValue>(attrs.length).fill(null)];byKey.set(key,target);}
          const ai=attributeIndex.get(toGridQueryText(row[attributeColIndex]));
          if(ai!==undefined)target[ai+1]=row[valueColIndex];
        }
        columns=[columns[keyColIndex]!,...attrs.map((name)=>({name:name.slice(0,256),type:columns[valueColIndex]!.type}))];rows=Array.from(byKey.values());
        break;
      }

      case 'append': {
        const table = step.params.table as { columns: QueryColumn[]; rows: QueryValue[][] } | undefined;
        if (!table?.columns || !Array.isArray(table.rows)) throw new Error('query_append_table_invalid');
        assertQueryTableLimits(table.columns, table.rows);
        const names=columns.map((col)=>col.name);const rightNames=table.columns.map((col)=>col.name);
        if(names.length!==rightNames.length||names.some((name,index)=>name!==rightNames[index]))throw new Error('query_append_schema_mismatch');
        const nextRows = rows.length + table.rows.length;
        assertQueryMatrixBounds(nextRows, columns.length);
        rows=[...rows,...table.rows.map((row)=>[...row])];
        break;
      }

      case 'join': {
        const joinType = requireGridQueryJoinType(step.params.joinType);
        const leftKeyIndex = requireGridQueryColumnIndex(step.params.leftKeyIndex, columns.length, 'query_join_key_invalid');
        const rightTable = step.params.rightTable as { columns: QueryColumn[]; rows: QueryValue[][] } | undefined;
        if (!rightTable?.columns || !Array.isArray(rightTable.rows)) throw new Error('query_join_table_invalid');
        const rightKeyIndex = requireGridQueryColumnIndex(step.params.rightKeyIndex, rightTable.columns.length, 'query_join_key_invalid');

        const rightCols = rightTable.columns.map((c) => ({
          name: `${c.name} (Right)`,
          type: c.type,
        }));
        const newCols: QueryColumn[] = [...columns, ...rightCols];
        if (newCols.length > GRID_QUERY_MAX_COLUMNS) throw new Error('query_join_column_limit');
        assertQueryTableLimits(rightTable.columns, rightTable.rows);

        const rightKeyMap = new Map<string, QueryValue[][]>();
        for (const rRow of rightTable.rows) {
          const key = toGridQueryText(rRow[rightKeyIndex]);
          if (!rightKeyMap.has(key)) rightKeyMap.set(key, []);
          rightKeyMap.get(key)!.push(rRow);
        }

        const matchedRightRows = new Set<QueryValue[]>();
        let expectedRows = 0;

        for (const lRow of rows) {
          const matches = rightKeyMap.get(toGridQueryText(lRow[leftKeyIndex]));
          if (matches?.length) {
            expectedRows += matches.length;
            if (expectedRows > GRID_QUERY_MAX_ROWS || expectedRows * newCols.length > GRID_QUERY_MAX_CELLS) throw new Error('query_join_result_limit');
            for (const rRow of matches) matchedRightRows.add(rRow);
          } else if (joinType === 'left' || joinType === 'full') {
            expectedRows++;
          }
          if (expectedRows > GRID_QUERY_MAX_ROWS || expectedRows * newCols.length > GRID_QUERY_MAX_CELLS) throw new Error('query_join_result_limit');
        }
        if (joinType === 'right' || joinType === 'full') {
          const unmatchedCount = rightTable.rows.reduce((count, rRow) => count + (matchedRightRows.has(rRow) ? 0 : 1), 0);
          expectedRows += unmatchedCount;
          if (expectedRows > GRID_QUERY_MAX_ROWS || expectedRows * newCols.length > GRID_QUERY_MAX_CELLS) throw new Error('query_join_result_limit');
        }

        const newRows: QueryValue[][] = [];
        matchedRightRows.clear();

        for (const lRow of rows) {
          const key = toGridQueryText(lRow[leftKeyIndex]);
          const matches = rightKeyMap.get(key);

          if (matches && matches.length > 0) {
            for (const rRow of matches) {
              matchedRightRows.add(rRow);
              newRows.push([...lRow, ...rRow]);
            }
          } else if (joinType === 'left' || joinType === 'full') {
            const emptyRight = new Array<QueryValue>(rightTable.columns.length).fill(null);
            newRows.push([...lRow, ...emptyRight]);
          }
        }

        if (joinType === 'right' || joinType === 'full') {
          for (const rRow of rightTable.rows) {
            if (!matchedRightRows.has(rRow)) {
              const emptyLeft = new Array<QueryValue>(columns.length).fill(null);
              newRows.push([...emptyLeft, ...rRow]);
            }
          }
        }

        columns = newCols;
        rows = newRows;
        break;
      }

      default:
        // Unreachable: `assertGridQueryStepType` rejects every unknown type before the switch.
        throw new Error('query_step_type_unsupported');
    }
    assertQueryTableLimits(columns, rows);
    if (columns.map((column) => `${column.name}\u0000${column.type}`).join('\u0001') !== before.columns) schemaChangingSteps += 1;
    if (rows.length !== before.rows) rowCountChangingSteps += 1;
  }

  return {
    columns,
    rows,
    rowCount: rows.length,
    appliedStepsCount: steps.length,
    schemaChangingSteps,
    rowCountChangingSteps,
    conversionReports,
  };
}

