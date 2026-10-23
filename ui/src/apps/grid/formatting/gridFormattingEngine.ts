// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded formatting engine. Pure product logic; no runtime dependency surface.

import {
  GridCell,
  GridConditionalFormattingRule,
  GridStructuredTable,
} from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../core/gridCoordinate';
import { parseGridRange } from '../ranges/gridRange';
import { parseGridConditionalFormula } from './gridFormatValidation';

/** Re-exported so every formatting surface parses ranges through the canonical leaf. */
export { parseGridRange } from '../ranges/gridRange';

const MAX_CF_SCAN = 100_000;
const MAX_AUTOFIT_SCAN = 50_000;
const MIN_COL_WIDTH = 48;
const MAX_COL_WIDTH = 480;
const MIN_ROW_HEIGHT = 22;
const MAX_ROW_HEIGHT = 240;

export const GRID_THEME_COLORS = [
  '#0f172a', '#334155', '#64748b', '#94a3b8', '#e2e8f0', '#ffffff',
  '#2563eb', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#a855f7', '#ec4899',
] as const;

export interface GridConditionalVisual {
  background?: string;
  textColor?: string;
  dataBarPercent?: number;
  dataBarColor?: string;
  icon?: string;
  bold?: boolean;
  /**
   * Set when a conditional-format rule fired for this cell — even when the rule carries no
   * colour of its own. Callers that must not repaint a cell can ignore it; the dialog's
   * preview uses it to tell "rule matched" from "rule did not match".
   */
  matched?: boolean;
}

export interface GridCellStylePreset {
  name: string;
  patch: Partial<GridCell>;
}

export const GRID_CELL_STYLES: readonly GridCellStylePreset[] = [
  { name: 'Normal', patch: { bold: false, italic: false, underline: false, background: undefined, text_color: undefined } },
  { name: 'Title', patch: { bold: true, fontSize: 18, text_color: '#e2e8f0', background: '#0f172a' } },
  { name: 'Heading', patch: { bold: true, fontSize: 13, text_color: '#e0f2fe', background: '#0c4a6e' } },
  { name: 'Good', patch: { text_color: '#14532d', background: '#dcfce7' } },
  { name: 'Neutral', patch: { text_color: '#713f12', background: '#fef3c7' } },
  { name: 'Bad', patch: { text_color: '#7f1d1d', background: '#fee2e2' } },
  { name: 'Input', patch: { text_color: '#1e3a8a', background: '#dbeafe', border: 'bottom' } },
  { name: 'Output', patch: { bold: true, text_color: '#581c87', background: '#f3e8ff', border: 'double-bottom' } },
] as const;

const FORMATTING_KEYS: readonly (keyof GridCell)[] = [
  'format', 'bold', 'italic', 'underline', 'strikethrough', 'fontSize', 'fontFamily',
  'alignment', 'verticalAlignment', 'indent', 'orientation', 'wrap', 'shrinkToFit',
  'background', 'text_color', 'border', 'numberFormatCode',
];

export function extractGridCellFormatting(cell?: GridCell): Partial<GridCell> {
  if (!cell) return {};
  const patch: Partial<GridCell> = {};
  for (const key of FORMATTING_KEYS) {
    const value = cell[key];
    if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
  }
  return patch;
}

export function applyGridCellStyle(cell: GridCell | undefined, styleName: string): GridCell {
  const preset = GRID_CELL_STYLES.find((entry) => entry.name === styleName);
  if (!preset) throw new Error(`Unknown Grid cell style: ${styleName}`);
  return { ...(cell ?? { value: '' }), ...preset.patch };
}

export function applyFormatPainter(source: GridCell | undefined, target: GridCell | undefined): GridCell {
  return { ...(target ?? { value: '' }), ...extractGridCellFormatting(source) };
}

function renderedCellText(cell: GridCell | undefined): string {
  if (!cell) return '';
  if (cell.formula) return String(cell.value ?? cell.formula);
  return String(cell.value ?? '');
}

export function calculateGridAutoFit(
  cells: Record<string, GridCell>,
  rowIndices: readonly number[],
  colIndices: readonly number[],
): { rowHeights: Record<number, number>; colWidths: Record<number, number> } {
  if (rowIndices.length * Math.max(1, colIndices.length) > MAX_AUTOFIT_SCAN) {
    throw new Error('AutoFit selection exceeds the bounded scan limit.');
  }
  const rowHeights: Record<number, number> = {};
  const colWidths: Record<number, number> = {};
  for (const row of rowIndices) {
    if (!Number.isInteger(row) || row < 0) continue;
    let rowHeight = MIN_ROW_HEIGHT;
    for (const col of colIndices) {
      if (!Number.isInteger(col) || col < 0) continue;
      const cell = cells[toA1(col, row)];
      const text = renderedCellText(cell);
      const fontSize = Math.max(8, Math.min(72, cell?.fontSize ?? 12));
      const lines = cell?.wrap ? Math.max(1, Math.ceil(text.length / 28)) : 1;
      rowHeight = Math.max(rowHeight, Math.min(MAX_ROW_HEIGHT, Math.ceil(fontSize * 1.45 * lines + 6)));
      const width = Math.ceil(Math.min(64, [...text].length) * fontSize * 0.62 + 20 + Math.max(0, cell?.indent ?? 0) * 12);
      colWidths[col] = Math.max(colWidths[col] ?? MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width)));
    }
    rowHeights[row] = rowHeight;
  }
  return { rowHeights, colWidths };
}

function rangeCoords(range: string): string[] {
  const bounds = parseGridRange(range);
  if (!bounds) return [];  const size = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (size > MAX_CF_SCAN) throw new Error('Conditional-formatting range exceeds the bounded scan limit.');
  const result: string[] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row++) {
    for (let col = bounds.startCol; col <= bounds.endCol; col++) result.push(toA1(col, row));
  }
  return result;
}

function comparable(value: GridCell['value'] | undefined): string | number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value ?? '').trim();
  const numeric = Number(text);
  return text !== '' && Number.isFinite(numeric) ? numeric : text.toLocaleLowerCase();
}

function numeric(value: GridCell['value'] | undefined): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function interpolateColor(left: string, right: string, t: number): string {
  const a = hexToRgb(left);
  const b = hexToRgb(right);
  if (!a || !b) return t < 0.5 ? left : right;
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function dateKey(value: GridCell['value'] | undefined): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function matchesDatePeriod(value: GridCell['value'] | undefined, period: GridConditionalFormattingRule['datePeriod'], now = new Date()): boolean {
  const d = dateKey(value);
  if (!d || !period) return false;
  const day = 86_400_000;
  const actual = startOfDay(d);
  const today = startOfDay(now);
  if (period === 'today') return actual === today;
  if (period === 'yesterday') return actual === today - day;
  if (period === 'tomorrow') return actual === today + day;
  if (period === 'last-7-days') return actual >= today - 6 * day && actual <= today;
  const monthOffset = period === 'last-month' ? -1 : period === 'next-month' ? 1 : 0;
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1).getTime();
  return actual >= start && actual < end;
}

function simpleFormulaMatches(formula: string | undefined, _coord: string, cell: GridCell | undefined, cells: Record<string, GridCell>): boolean {
  // Grammar and evaluation share one definition: `parseGridConditionalFormula` is the same
  // parser the dialog validates with, so a stored rule is by construction evaluable here.
  const subject = parseGridConditionalFormula(formula);
  if (!subject) return false;
  const left = subject.left === 'VALUE' ? cell?.value : cells[subject.left]?.value;
  const right: string | number = subject.right.startsWith('"')
    ? subject.right.slice(1, -1).replace(/""/g, '"')
    : subject.right.toUpperCase() === 'VALUE'
      ? comparable(cell?.value)
      : Number(subject.right);
  const a = comparable(left);
  const b = comparable(right);
  if (subject.operator === '=') return a === b;
  if (subject.operator === '<>') return a !== b;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  if (subject.operator === '>') return a > b;
  if (subject.operator === '<') return a < b;
  if (subject.operator === '>=') return a >= b;
  return a <= b;
}

function scalarRuleMatches(rule: GridConditionalFormattingRule, cell: GridCell | undefined): boolean {
  const value = comparable(cell?.value);
  const expected = comparable(rule.value);
  if (rule.operator === 'contains') return String(cell?.value ?? '').toLocaleLowerCase().includes(String(rule.value ?? '').toLocaleLowerCase());
  if (rule.operator === 'equals') return value === expected;
  if (rule.operator === 'not-equals') return value !== expected;
  if (rule.operator === 'between') {
    const a = numeric(cell?.value); const lo = numeric(rule.value); const hi = numeric(rule.value2);
    return a !== null && lo !== null && hi !== null && a >= Math.min(lo, hi) && a <= Math.max(lo, hi);
  }
  const a = numeric(cell?.value); const b = numeric(rule.value);
  if (a === null || b === null) return false;
  return rule.operator === 'greater-than' ? a > b : rule.operator === 'less-than' ? a < b : false;
}

function rangeStats(rule: GridConditionalFormattingRule, cells: Record<string, GridCell>) {
  const coords = rangeCoords(rule.range);
  const values = coords.map((coord) => numeric(cells[coord]?.value)).filter((v): v is number => v !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  return { coords, values, min, max };
}

function ruleVisual(rule: GridConditionalFormattingRule, coord: string, cell: GridCell | undefined, cells: Record<string, GridCell>): GridConditionalVisual | null {
  const kind = rule.kind ?? 'cell';
  // Membership is decided from the parsed bounds, before any coordinate array is built, so
  // a rule that does not apply to this cell costs no work at all.
  const ruleBounds = parseGridRange(rule.range);
  if (!ruleBounds) return null;
  const point = parseCoord(coord);
  if (point.colIdx < ruleBounds.startCol || point.colIdx > ruleBounds.endCol) return null;
  if (point.rowIdx < ruleBounds.startRow || point.rowIdx > ruleBounds.endRow) return null;
  let matched = false;
  if (kind === 'cell') matched = scalarRuleMatches(rule, cell);
  else if (kind === 'formula') matched = simpleFormulaMatches(rule.formula, coord, cell, cells);
  else if (kind === 'date') matched = matchesDatePeriod(cell?.value, rule.datePeriod);
  else if (kind === 'duplicate' || kind === 'unique') {
    const values = rangeCoords(rule.range).map((c) => comparable(cells[c]?.value));
    const count = values.filter((v) => v === comparable(cell?.value)).length;
    matched = kind === 'duplicate' ? count > 1 : count === 1;
  } else if (kind === 'top' || kind === 'bottom') {
    const { values } = rangeStats(rule, cells);
    const value = numeric(cell?.value);
    const count = Math.max(1, Math.min(values.length, rule.rankPercent ? Math.ceil(values.length * Math.max(1, Math.min(100, rule.rankCount ?? 10)) / 100) : Math.round(rule.rankCount ?? 10)));
    const ordered = [...values].sort((a, b) => kind === 'top' ? b - a : a - b);
    matched = value !== null && ordered.slice(0, count).includes(value);
  } else if (kind === 'color-scale' || kind === 'data-bar' || kind === 'icon-set') {
    const { min, max } = rangeStats(rule, cells);
    const value = numeric(cell?.value);
    if (value === null) return null;
    const t = max === min ? 1 : Math.max(0, Math.min(1, (value - min) / (max - min)));
    if (kind === 'data-bar') return { dataBarPercent: Math.round(t * 100), dataBarColor: rule.dataBarColor ?? '#3b82f6' };
    if (kind === 'icon-set') {
      const set = rule.iconSet ?? 'arrows';
      const icons = set === 'traffic-lights' ? ['🔴', '🟡', '🟢'] : set === 'ratings' ? ['★', '★★', '★★★'] : ['↓', '→', '↑'];
      return { icon: icons[t < 1/3 ? 0 : t < 2/3 ? 1 : 2] };
    }
    const minColor = rule.minColor ?? '#ef4444'; const midColor = rule.midColor ?? '#facc15'; const maxColor = rule.maxColor ?? '#22c55e';
    return { background: t <= 0.5 ? interpolateColor(minColor, midColor, t * 2) : interpolateColor(midColor, maxColor, (t - 0.5) * 2) };
  }
  if (!matched) return null;
  return { background: rule.background, textColor: rule.textColor, matched: true };
}

export function conditionalVisualForCell(
  coord: string,
  cell: GridCell | undefined,
  rules: readonly GridConditionalFormattingRule[] = [],
  cells: Record<string, GridCell> = {},
): GridConditionalVisual {
  const result: GridConditionalVisual = {};
  const sorted = [...rules].sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER));
  for (const rule of sorted) {
    const visual = ruleVisual(rule, coord.toUpperCase(), cell, cells);
    if (!visual) continue;
    Object.assign(result, visual);
    if (rule.stopIfTrue) break;
  }
  return result;
}

export function normalizeConditionalPriorities(rules: readonly GridConditionalFormattingRule[]): GridConditionalFormattingRule[] {
  return [...rules]
    .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
    .map((rule, index) => ({ ...rule, priority: index + 1 }));
}

export function moveConditionalRule(rules: readonly GridConditionalFormattingRule[], id: string, direction: 'up' | 'down'): GridConditionalFormattingRule[] {
  const normalized = normalizeConditionalPriorities(rules);
  const index = normalized.findIndex((rule) => rule.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= normalized.length) return normalized;
  const copy = [...normalized];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy.map((rule, i) => ({ ...rule, priority: i + 1 }));
}

export function patchSheetAutoFit(
  currentRowHeights: Record<number, number> | undefined,
  currentColWidths: Record<number, number> | undefined,
  fit: ReturnType<typeof calculateGridAutoFit>,
) {
  return {
    rowHeights: { ...(currentRowHeights ?? {}), ...fit.rowHeights },
    colWidths: { ...(currentColWidths ?? {}), ...fit.colWidths },
  };
}

export function structuredTableVisualForCell(coord: string, tables: readonly GridStructuredTable[] = []): GridConditionalVisual {
  for (const table of tables) {
    const bounds = parseGridRange(table.range);
    if (!bounds) continue;
    const { colIdx, rowIdx } = parseCoord(coord);
    if (colIdx < bounds.startCol || colIdx > bounds.endCol || rowIdx < bounds.startRow || rowIdx > bounds.endRow) continue;
    const palette = gridStructuredTablePalette(table.styleTheme ?? 'blue');
    if (table.hasHeaders && rowIdx === bounds.startRow) return { background: palette[0], textColor: GRID_STRUCTURED_TABLE_HEADER_TEXT, bold: true };
    if (table.hasTotalsRow && rowIdx === bounds.endRow) return { background: palette[0], textColor: GRID_STRUCTURED_TABLE_HEADER_TEXT, bold: true };
    return { background: (rowIdx - bounds.startRow) % 2 === 0 ? palette[1] : palette[2] };
  }
  return {};
}

/** One palette definition for both the renderer and the style patch. */
export const GRID_STRUCTURED_TABLE_HEADER_TEXT = '#f8fafc';

export type GridStructuredTableTheme = NonNullable<GridStructuredTable['styleTheme']>;

export function gridStructuredTablePalette(theme: GridStructuredTableTheme): readonly [string, string, string] {
  switch (theme) {
    case 'blue':
      return ['#1e3a8a', '#0f274d', '#132d56'];
    case 'dark':
      return ['#111827', '#0f172a', '#1e293b'];
    case 'emerald':
      return ['#065f46', '#063d33', '#0b4b3d'];
    case 'purple':
      return ['#581c87', '#32154f', '#40205f'];
    case 'amber':
      return ['#92400e', '#4c2a0a', '#5c330c'];
    default: {
      const exhaustive: never = theme;
      return exhaustive;
    }
  }
}

/**
 * Paints one structured table's style theme onto its cells as a concrete, reviewable
 * patch. The DOM table and the Canvas renderer already derive the same colours from the
 * table definition; this function exists so that switching a theme is a real, undoable,
 * auditable cell edit instead of an invisible change to the table object.
 *
 * Only the keys the theme owns are written, so an explicit per-cell font or fill choice
 * remains authoritative.
 */
export function gridStructuredTableStylePatch(
  table: GridStructuredTable,
  existingCells: Record<string, GridCell>,
): Record<string, GridCell> {
  const bounds = parseGridRange(table.range);
  if (!bounds) throw new Error(`Structured table ${table.name} has an invalid range: ${table.range}`);
  const palette = gridStructuredTablePalette(table.styleTheme ?? 'blue');
  const limit = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (limit > MAX_CF_SCAN) throw new Error('Structured table style range exceeds the bounded scan limit.');

  const updated: Record<string, GridCell> = { ...existingCells };
  for (let row = bounds.startRow; row <= bounds.endRow; row++) {
    const isHeaderBand = !(table.hasHeaders && row === bounds.startRow);
    const isTotalsBand = !(table.hasTotalsRow && row === bounds.endRow);
    const isStripeBand = isHeaderBand && isTotalsBand;
    for (let col = bounds.startCol; col <= bounds.endCol; col++) {
      const coord = toA1(col, row);
      const current = updated[coord] ?? { value: '' };
      updated[coord] = isStripeBand
        // Same parity as `structuredTableVisualForCell`, so the stored fill and the
        // rendered fill can never disagree.
        ? { ...current, background: (row - bounds.startRow) % 2 === 0 ? palette[1] : palette[2] }
        : { ...current, background: palette[0], text_color: GRID_STRUCTURED_TABLE_HEADER_TEXT, bold: true };
    }
  }
  return updated;
}
