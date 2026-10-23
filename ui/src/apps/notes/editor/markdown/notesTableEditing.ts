// STATUS: DIAMANT VGT SUPREME — pure Markdown table structure edits and fenced-code language
//
// AST-0706 acceptance: "Inline-Code, fenced Code und kleine Tabellen editieren."
// Inserting a table already worked; *editing* a table's structure did not exist at all — the user had to
// rewrite pipe rows by hand. Every operation here is bounded by the same limits as `insertMarkdownTable`
// (2..16 rows, 2..12 columns) and fails closed with a reason instead of producing a malformed table.

import { isMarkdownTableSeparator, splitMarkdownTableRow } from './notesMarkdownEditing';

export const NOTE_TABLE_MIN_ROWS = 2;
export const NOTE_TABLE_MAX_ROWS = 16;
export const NOTE_TABLE_MIN_COLUMNS = 2;
export const NOTE_TABLE_MAX_COLUMNS = 12;

export type NoteTableOperation = 'add-row-above' | 'add-row-below' | 'add-column-left' | 'add-column-right' | 'delete-row' | 'delete-column';

export type NoteTableEditResult =
  | { ok: true; content: string }
  | { ok: false; message: string };

export interface NoteTableBlock {
  /** Index of the header line inside the content line array. */
  headerLineIndex: number;
  columns: number;
  /** Rows including the header. */
  rows: number;
}

/** Locates the table whose header line is `lineIndex`, or `null` when that line is not a table header. */
export function locateMarkdownTable(lines: readonly string[], lineIndex: number): NoteTableBlock | null {
  if (lineIndex < 0 || lineIndex + 1 >= lines.length) return null;
  const header = lines[lineIndex];
  if (!header.includes('|') || !isMarkdownTableSeparator(lines[lineIndex + 1])) return null;
  const columns = splitMarkdownTableRow(header).length;
  let rows = 2;
  for (let index = lineIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].includes('|') || !lines[index].trim()) break;
    rows += 1;
  }
  return { headerLineIndex: lineIndex, columns, rows };
}

function padRow(cells: readonly string[], columns: number): string {
  const padded = [...cells].slice(0, columns);
  while (padded.length < columns) padded.push('');
  return `| ${padded.join(' | ')} |`;
}

/**
 * Applies one structural edit to the table at `lineIndex`.
 * Column operations keep every row the same width, row operations keep the separator in place, and both
 * refuse to go below the minimum or above the maximum instead of producing an unparseable table.
 */
export function editMarkdownTable(
  content: string,
  lineIndex: number,
  operation: NoteTableOperation,
): NoteTableEditResult {
  const lines = content.split('\n');
  const table = locateMarkdownTable(lines, lineIndex);
  if (!table) return { ok: false, message: 'That line is not the header of a Markdown table.' };
  const start = table.headerLineIndex;
  const end = start + table.rows;
  const header = lines[start];
  const separator = lines[start + 1];
  const bodyRows = lines.slice(start + 2, end);
  const columns = table.columns;

  if (operation === 'add-column-left' || operation === 'add-column-right') {
    if (columns >= NOTE_TABLE_MAX_COLUMNS) return { ok: false, message: `A table is limited to ${NOTE_TABLE_MAX_COLUMNS} columns.` };
    const at = operation === 'add-column-left' ? 0 : columns;
    const insertInto = (cells: string[], filler: string) => {
      const next = [...cells.slice(0, at), filler, ...cells.slice(at)];
      return padRow(next, columns + 1);
    };
    lines[start] = insertInto(splitMarkdownTableRow(header), `Column ${columns + 1}`);
    lines[start + 1] = insertInto(splitMarkdownTableRow(separator).map(() => '---'), '---');
    bodyRows.forEach((entry, index) => { lines[start + 2 + index] = insertInto(splitMarkdownTableRow(entry), ''); });
    return { ok: true, content: lines.join('\n') };
  }

  if (operation === 'delete-column') {
    if (columns <= NOTE_TABLE_MIN_COLUMNS) return { ok: false, message: `A table needs at least ${NOTE_TABLE_MIN_COLUMNS} columns.` };
    const drop = (row: string) => padRow(splitMarkdownTableRow(row).slice(0, -1), columns - 1);
    lines[start] = drop(header);
    lines[start + 1] = padRow(splitMarkdownTableRow(separator).slice(0, -1).map(() => '---'), columns - 1);
    bodyRows.forEach((row, index) => { lines[start + 2 + index] = drop(row); });
    return { ok: true, content: lines.join('\n') };
  }

  if (operation === 'add-row-above' || operation === 'add-row-below') {
    if (table.rows >= NOTE_TABLE_MAX_ROWS) return { ok: false, message: `A table is limited to ${NOTE_TABLE_MAX_ROWS} rows.` };
    const insertion = operation === 'add-row-above' ? start + 2 : end;
    lines.splice(insertion, 0, padRow([], columns));
    return { ok: true, content: lines.join('\n') };
  }

  // delete-row
  if (bodyRows.length <= 1) return { ok: false, message: 'A table keeps at least one data row; delete the table instead.' };
  lines.splice(end - 1, 1);
  return { ok: true, content: lines.join('\n') };
}

export interface FencedCodeBlock {
  /** Index of the opening fence line. */
  openLineIndex: number;
  /** Index of the closing fence line, or `null` for an unterminated block. */
  closeLineIndex: number | null;
  language: string;
}

export const NOTE_CODE_LANGUAGE_MAX = 32;

/** Locates the fenced code block whose opening fence is `lineIndex`. */
export function locateFencedCodeBlock(lines: readonly string[], lineIndex: number): FencedCodeBlock | null {
  const opener = lines[lineIndex];
  if (typeof opener !== 'string' || !opener.trimStart().startsWith('```')) return null;
  const language = opener.trim().slice(3).trim().slice(0, NOTE_CODE_LANGUAGE_MAX);
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trimStart().startsWith('```')) return { openLineIndex: lineIndex, closeLineIndex: index, language };
  }
  return { openLineIndex: lineIndex, closeLineIndex: null, language };
}

/** Sets (or clears) the language of one fenced code block without touching its body. */
export function setFencedCodeLanguage(content: string, lineIndex: number, language: string): NoteTableEditResult {
  const lines = content.split('\n');
  const block = locateFencedCodeBlock(lines, lineIndex);
  if (!block) return { ok: false, message: 'That line does not open a fenced code block.' };
  const safe = String(language ?? '').toLowerCase().replace(/[^a-z0-9+#._-]/g, '').slice(0, NOTE_CODE_LANGUAGE_MAX);
  lines[block.openLineIndex] = `\`\`\`${safe}`;
  return { ok: true, content: lines.join('\n') };
}

/** Bounded, non-formatting summary of a code block, for the visible label next to the copy control. */
export function describeFencedCodeBlock(block: FencedCodeBlock, body: string): string {
  const chars = body.length;
  return `${block.language || 'code'} · ${chars.toLocaleString('en-US')} characters`;
}
