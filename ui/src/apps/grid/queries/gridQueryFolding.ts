// STATUS: DIAMANT VGT SUPREME — Query Folding Engine
// Translates Power Query transformation steps into high-performance native SQL queries

import type { QueryStep, QueryColumn } from './gridPowerQuery';

export type SqlDialect = 'sqlite' | 'postgres' | 'mysql';

export interface QueryFoldingResult {
  canFoldCompletely: boolean;
  foldedCount: number;
  unfoldedCount: number;
  sqlQuery: string;
  dialect: SqlDialect;
  unfoldedSteps: QueryStep[];
}

/**
 * Attempts to fold as many sequential steps into an equivalent SQL query as possible.
 */
export function foldQuerySteps(
  tableName: string,
  initialColumns: QueryColumn[],
  steps: QueryStep[],
  dialect: SqlDialect = 'sqlite'
): QueryFoldingResult {
  let canFold = true;
  let foldedCount = 0;
  const unfoldedSteps: QueryStep[] = [];

  let selectedCols = initialColumns.map((c) => c.name);
  const whereClauses: string[] = [];
  const orderByClauses: string[] = [];
  let groupByClause = '';
  let havingClause = '';

  for (const step of steps) {
    if (!canFold) {
      unfoldedSteps.push(step);
      continue;
    }

    switch (step.type) {
      case 'filter': {
        const { colIndex, operator, value } = step.params;
        const colName = selectedCols[colIndex] || initialColumns[colIndex]?.name;
        if (!colName) {
          canFold = false;
          unfoldedSteps.push(step);
          break;
        }

        const safeVal = typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`;

        if (operator === 'equals') whereClauses.push(`"${colName}" = ${safeVal}`);
        else if (operator === 'notEquals') whereClauses.push(`"${colName}" != ${safeVal}`);
        else if (operator === 'greater') whereClauses.push(`"${colName}" > ${safeVal}`);
        else if (operator === 'less') whereClauses.push(`"${colName}" < ${safeVal}`);
        else if (operator === 'contains') whereClauses.push(`"${colName}" LIKE '%${String(value)}%'`);
        else {
          canFold = false;
          unfoldedSteps.push(step);
          break;
        }

        foldedCount++;
        break;
      }

      case 'rename': {
        const { colIndex, newName } = step.params;
        if (selectedCols[colIndex]) {
          selectedCols[colIndex] = `${selectedCols[colIndex]} AS "${newName}"`;
          foldedCount++;
        } else {
          canFold = false;
          unfoldedSteps.push(step);
        }
        break;
      }

      case 'removeColumns': {
        const { colIndices } = step.params as { colIndices: number[] };
        selectedCols = selectedCols.filter((_, idx) => !colIndices.includes(idx));
        foldedCount++;
        break;
      }

      case 'sort': {
        const { colIndex, ascending } = step.params;
        const colName = selectedCols[colIndex] || initialColumns[colIndex]?.name;
        if (colName) {
          orderByClauses.push(`"${colName}" ${ascending ? 'ASC' : 'DESC'}`);
          foldedCount++;
        } else {
          canFold = false;
          unfoldedSteps.push(step);
        }
        break;
      }

      case 'groupBy': {
        const { groupColIndex, aggColIndex, aggFunction } = step.params;
        const gCol = initialColumns[groupColIndex]?.name;
        const aCol = initialColumns[aggColIndex]?.name;
        if (gCol && aCol) {
          selectedCols = [`"${gCol}"`, `${aggFunction.toUpperCase()}("${aCol}") AS "${aggFunction}_${aCol}"`];
          groupByClause = `GROUP BY "${gCol}"`;
          foldedCount++;
        } else {
          canFold = false;
          unfoldedSteps.push(step);
        }
        break;
      }

      default:
        // Complex transformations like custom split or arbitrary JS expressions break query folding
        canFold = false;
        unfoldedSteps.push(step);
        break;
    }
  }

  // Assemble SQL Statement
  const colsPart = selectedCols.length > 0 ? selectedCols.join(', ') : '*';
  let sql = `SELECT ${colsPart} FROM "${tableName}"`;

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  if (groupByClause) {
    sql += ` ${groupByClause}`;
  }
  if (havingClause) {
    sql += ` ${havingClause}`;
  }
  if (orderByClauses.length > 0) {
    sql += ` ORDER BY ${orderByClauses.join(', ')}`;
  }

  sql += ';';

  return {
    canFoldCompletely: unfoldedSteps.length === 0,
    foldedCount,
    unfoldedCount: unfoldedSteps.length,
    sqlQuery: sql,
    dialect,
    unfoldedSteps,
  };
}

export interface ExternalQueryFoldingContext {
  explicitNetGateCapability: boolean;
  credentialKeyId?: string;
  connectorKind: 'external-db' | 'local-db';
}

/**
 * Folding for external DB connectors is fail-closed. SQL is only emitted after an
 * explicit NetGate capability and a KeyVault credential reference are present.
 */
export function foldExternalQuerySteps(
  tableName: string,
  initialColumns: QueryColumn[],
  steps: QueryStep[],
  dialect: SqlDialect,
  context: ExternalQueryFoldingContext,
): QueryFoldingResult {
  if (context.connectorKind !== 'external-db') throw new Error('query_folding_external_db_only');
  if (!context.explicitNetGateCapability) throw new Error('query_folding_netgate_required');
  if (!context.credentialKeyId?.trim()) throw new Error('query_folding_keyvault_credential_required');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(tableName)) throw new Error('query_folding_table_identifier_invalid');
  for (const column of initialColumns) if (!/^[A-Za-z_][A-Za-z0-9_ ]{0,127}$/.test(column.name)) throw new Error('query_folding_column_identifier_invalid');
  return foldQuerySteps(tableName, initialColumns, steps, dialect);
}
