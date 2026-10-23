// STATUS: DIAMANT VGT SUPREME
// Formula reference boundary helpers. These helpers never evaluate formulas;
// the Rust vgt-formula crate remains the sole calculation authority.

export const FORMULA_REFERENCE_MAX_BYTES = 16 * 1024;
export const FORMULA_REFERENCE_MAX_DEPTH = 128;
export const FORMULA_REFERENCE_MAX_MATCHES = 50_000;

export interface DetailedA1Reference {
  col: number;
  row: number;
  absoluteCol: boolean;
  absoluteRow: boolean;
}

export interface FormulaReferenceDescriptor {
  kind: 'cell' | 'range' | 'qualified-cell' | 'qualified-range' | 'structured' | 'name';
  raw: string;
  sheet?: string;
  start?: DetailedA1Reference;
  end?: DetailedA1Reference;
}

export class FormulaBoundaryError extends Error {
  constructor(readonly code: string, readonly offset: number) {
    super(`${code}@${offset}`);
    this.name = 'FormulaBoundaryError';
  }
}

function columnIndex(label: string): number {
  let value = 0;
  for (const ch of label) value = value * 26 + ch.charCodeAt(0) - 64;
  return value - 1;
}

function columnLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 16_384) throw new FormulaBoundaryError('formula_column_range', 0);
  let value = index + 1;
  let out = '';
  while (value > 0) {
    out = String.fromCharCode(65 + ((value - 1) % 26)) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

export function parseDetailedA1Reference(raw: string): DetailedA1Reference | null {
  const match = raw.trim().toUpperCase().match(/^(\$?)([A-Z]{1,3})(\$?)(\d{1,7})$/);
  if (!match) return null;
  const col = columnIndex(match[2]);
  const row = Number(match[4]) - 1;
  if (col < 0 || col >= 16_384 || row < 0 || row >= 1_048_576) return null;
  return { col, row, absoluteCol: match[1] === '$', absoluteRow: match[3] === '$' };
}

export function formatDetailedA1Reference(reference: DetailedA1Reference): string {
  if (!Number.isInteger(reference.row) || reference.row < 0 || reference.row >= 1_048_576) {
    throw new FormulaBoundaryError('formula_row_range', 0);
  }
  return `${reference.absoluteCol ? '$' : ''}${columnLabel(reference.col)}${reference.absoluteRow ? '$' : ''}${reference.row + 1}`;
}

export function r1c1ToA1(raw: string, base: { col: number; row: number }): string {
  const match = raw.trim().toUpperCase().match(/^R(\[?-?\d*\]?|)C(\[?-?\d*\]?|)$/);
  if (!match) throw new FormulaBoundaryError('formula_r1c1_invalid', 0);
  const resolve = (token: string, current: number): { value: number; absolute: boolean } => {
    if (!token) return { value: current, absolute: false };
    if (token.startsWith('[') && token.endsWith(']')) {
      const delta = Number(token.slice(1, -1) || '0');
      if (!Number.isInteger(delta)) throw new FormulaBoundaryError('formula_r1c1_invalid', 0);
      return { value: current + delta, absolute: false };
    }
    const oneBased = Number(token);
    if (!Number.isInteger(oneBased) || oneBased < 1) throw new FormulaBoundaryError('formula_r1c1_invalid', 0);
    return { value: oneBased - 1, absolute: true };
  };
  const row = resolve(match[1], base.row);
  const col = resolve(match[2], base.col);
  return formatDetailedA1Reference({ col: col.value, row: row.value, absoluteCol: col.absolute, absoluteRow: row.absolute });
}

function unquoteSheet(raw: string): string {
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

/**
 * Bounded, quote-aware reference scanner used for UI diagnostics/copy-fill tooling.
 * It does not evaluate or rewrite formula semantics.
 */
export function scanFormulaReferences(formula: string): FormulaReferenceDescriptor[] {
  if (new TextEncoder().encode(formula).byteLength > FORMULA_REFERENCE_MAX_BYTES) {
    throw new FormulaBoundaryError('formula_length_limit', 0);
  }
  const refs: FormulaReferenceDescriptor[] = [];
  let string = false;
  let depth = 0;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '"') {
      if (string && formula[i + 1] === '"') { i++; continue; }
      string = !string;
      continue;
    }
    if (string) continue;
    if (ch === '(') {
      depth++;
      if (depth > FORMULA_REFERENCE_MAX_DEPTH) throw new FormulaBoundaryError('formula_parse_depth', i);
    } else if (ch === ')') {
      depth--;
      if (depth < 0) throw new FormulaBoundaryError('formula_unbalanced_parenthesis', i);
    }
  }
  if (string) throw new FormulaBoundaryError('formula_unterminated_string', formula.length);
  if (depth !== 0) throw new FormulaBoundaryError('formula_unbalanced_parenthesis', formula.length);

  const masked = formula.replace(/"(?:""|[^"])*"/g, value => ' '.repeat(value.length));
  const qualified = /((?:'(?:''|[^'])+'|[A-Za-z_][A-Za-z0-9_.]{0,254})!)((?:\$?[A-Za-z]{1,3}\$?\d{1,7})(?::(?:\$?[A-Za-z]{1,3}\$?\d{1,7}))?)/g;
  let match: RegExpExecArray | null;
  while ((match = qualified.exec(masked)) !== null) {
    const sheetRaw = match[1].slice(0, -1);
    const [startRaw, endRaw] = match[2].split(':');
    const start = parseDetailedA1Reference(startRaw);
    const endParsed = endRaw ? parseDetailedA1Reference(endRaw) : null;
    const end = endParsed ?? undefined;
    if (!start || (endRaw && !end)) throw new FormulaBoundaryError('formula_reference_invalid', match.index);
    refs.push({ kind: end ? 'qualified-range' : 'qualified-cell', raw: match[0], sheet: unquoteSheet(sheetRaw), start, end });
  }

  const structured = /\b([A-Za-z_][A-Za-z0-9_.]{0,127}(?:\[[^\[\]\r\n]{1,512}\])+)/g;
  while ((match = structured.exec(masked)) !== null) refs.push({ kind: 'structured', raw: match[1] });

  if (refs.length > FORMULA_REFERENCE_MAX_MATCHES) throw new FormulaBoundaryError('formula_reference_count', 0);
  return refs;
}

export function formulaContainsExternalWorkbookSyntax(formula: string): boolean {
  // Excel-style external workbook syntax, e.g. [Book.xlsx]Sheet1!A1. The core does not dereference it directly.
  return /\[[^\]\r\n]{1,512}\][^!\r\n]{1,255}!/.test(formula.replace(/"(?:""|[^"])*"/g, ''));
}
