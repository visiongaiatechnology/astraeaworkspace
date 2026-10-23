// STATUS: PLATIN
// Expert SQL preparation boundary. This module never executes SQL.
// User values enter only through named parameters; sandbox policy rejects multi-statement and host-control SQL.

import type { SqlDialect } from './sqlDialect';

export const DATABASE_EXPERT_SQL_MAX_BYTES = 20_000;
export const DATABASE_EXPERT_SQL_MAX_PARAMETER_JSON_CHARS = 20_000;
export const DATABASE_EXPERT_SQL_MAX_PARAMS = 256;

export type ExpertSqlParameterValue = string | number | boolean | null;

export interface ExpertSqlPreparedStatement {
  sql: string;
  params: ExpertSqlParameterValue[];
  parameterNames: string[];
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  sandbox: 'local-data-only-v1';
}

const FORBIDDEN = /\b(?:ATTACH|DETACH|PRAGMA|VACUUM|COPY|LOAD|INSTALL|EXTENSION|EXEC(?:UTE)?|CALL|DO|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|SHUTDOWN|REINDEX|ANALYZE)\b/i;
const ALLOWED_START = /^(SELECT|INSERT|UPDATE|DELETE)\b/i;

function placeholder(dialect: SqlDialect, index: number): string {
  switch (dialect) {
    case 'postgres': return `$${index}`;
    case 'sqlite':
    case 'mysql':
    case 'ansi_odbc': return '?';
    default: throw new Error('expert_sql_dialect_invalid');
  }
}

function isExpertSqlParameterValue(value: unknown): value is ExpertSqlParameterValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function stripTrailingSemicolon(sql: string): string {
  return sql.endsWith(';') ? sql.slice(0, -1).trimEnd() : sql;
}

export function prepareExpertSqlStatement(
  sqlTemplate: string,
  namedParameters: Record<string, unknown>,
  dialect: SqlDialect,
): ExpertSqlPreparedStatement {
  if (typeof sqlTemplate !== 'string') throw new Error('expert_sql_statement_must_be_text');
  const trimmed = sqlTemplate.trim();
  if (!trimmed || trimmed.length > DATABASE_EXPERT_SQL_MAX_BYTES || new TextEncoder().encode(trimmed).byteLength > DATABASE_EXPERT_SQL_MAX_BYTES) throw new Error('expert_sql_size_invalid');
  if (!['sqlite', 'postgres', 'mysql', 'ansi_odbc'].includes(dialect)) throw new Error('expert_sql_dialect_invalid');
  if (!namedParameters || typeof namedParameters !== 'object' || Array.isArray(namedParameters)) throw new Error('expert_sql_parameters_must_be_object');
  const prototype = Object.getPrototypeOf(namedParameters);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('expert_sql_parameters_must_be_plain_object');
  if (/--|\/\*|\*\//.test(trimmed)) throw new Error('expert_sql_comments_blocked');
  if (/\$\$|::/.test(trimmed)) throw new Error('expert_sql_extended_syntax_blocked');
  if (/['`]/.test(trimmed)) throw new Error('expert_sql_inline_literals_blocked');
  const body = stripTrailingSemicolon(trimmed);
  if (body.includes(';')) throw new Error('expert_sql_multi_statement_blocked');
  const operation = body.match(ALLOWED_START)?.[1]?.toUpperCase() as ExpertSqlPreparedStatement['operation'] | undefined;
  if (!operation) throw new Error('expert_sql_operation_blocked');
  if (FORBIDDEN.test(body)) throw new Error('expert_sql_sandbox_policy_blocked');
  const providedNames = Object.keys(namedParameters);
  if (providedNames.length > DATABASE_EXPERT_SQL_MAX_PARAMS) throw new Error('expert_sql_parameter_limit');
  if (providedNames.some((name) => !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name))) throw new Error('expert_sql_parameter_name_invalid');

  const params: ExpertSqlParameterValue[] = [];
  const names: string[] = [];
  const used = new Set<string>();
  const sql = body.replace(/:([A-Za-z_][A-Za-z0-9_]{0,63})/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(namedParameters, name)) throw new Error(`expert_sql_parameter_required:${name}`);
    const value = namedParameters[name];
    if (!isExpertSqlParameterValue(value)) throw new Error(`expert_sql_parameter_value_invalid:${name}`);
    used.add(name); names.push(name); params.push(value);
    return placeholder(dialect, params.length);
  });
  const unused = providedNames.filter((name) => !used.has(name));
  if (unused.length) throw new Error(`expert_sql_parameter_unused:${unused[0]}`);
  return { sql: `${sql};`, params, parameterNames: names, operation, sandbox: 'local-data-only-v1' };
}
