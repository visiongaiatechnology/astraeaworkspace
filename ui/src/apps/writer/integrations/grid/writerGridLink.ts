// STATUS: PLATIN — Bounded Grid-to-Writer range link engine
import type {
  TableObject,
  WorkspaceDocument,
  WriterGridSourceReference,
  WriterTableBlockData,
} from '../../../../shared/contracts/workspace';
import { writerGridCellText } from './writerGridCellText';
import {
  WRITER_GRID_RANGE_LIMITS,
  parseWriterGridRange as parseWriterGridRangeRule,
  type WriterGridRangeFailure,
} from '../../../../shared/writer/grid/writerGridRange';


export class WriterGridLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriterGridLinkError';
  }
}

interface GridCoordinate {
  col: number;
  row: number;
}

interface GridRange {
  start: GridCoordinate;
  end: GridCoordinate;
}

export interface WriterGridTableExtractionOptions {
  tableId?: string;
  anchorParagraphId?: string;
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

/**
 * Die sichtbare Meldung des Link-Pfads zu einem Ablehnungsgrund (W-240).
 *
 * Der **Wortlaut** gehört hierher, die **Regel** nach `shared/writer/grid/writerGridRange.ts`. Die Zahlen
 * werden genannt: eine Grenze, die der Nutzer nicht kennt, kann er nicht einhalten.
 */
function writerGridLinkRangeMessage(reason: WriterGridRangeFailure, limit?: number): string {
  switch (reason) {
    case 'invalid-range':
      return 'Der Grid-Bereich muss eine gültige A1-Range sein.';
    case 'outside-sheet':
      return 'Der Grid-Bereich liegt außerhalb des ausgewählten Sheets.';
    case 'too-many-columns':
      return `Ein Writer-Link darf höchstens ${limit ?? WRITER_GRID_RANGE_LIMITS.maxColumns} Spalten umfassen.`;
    case 'too-many-rows':
      return `Ein Writer-Link darf höchstens ${limit ?? WRITER_GRID_RANGE_LIMITS.maxRows} Zeilen umfassen.`;
    case 'too-many-cells':
      return `Ein Writer-Link darf höchstens ${(limit ?? WRITER_GRID_RANGE_LIMITS.maxCells).toLocaleString('de-DE')} Grid-Zellen enthalten.`;
    default: {
      // Erschöpfend: ein neuer Grund muss hier auffallen, statt still durchzufallen.
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function parseWriterGridRange(range: string, table: TableObject): GridRange {
  const parsed = parseWriterGridRangeRule(range, { cols: table.cols, rows: table.rows });
  if (!parsed.ok) throw new WriterGridLinkError(writerGridLinkRangeMessage(parsed.reason, parsed.limit));
  return { start: parsed.range.start, end: parsed.range.end };
}

function cellText(table: TableObject, col: number, row: number): string {
  // One definition for how a Grid cell reads in Writer — the Grid's own formatter (W-237). The
  // previous `String(value)` dropped number formats and spelled booleans `TRUE`/`FALSE`, while the
  // canonical workspace-embed path spelled them `Ja`/`Nein` (W-239).
  const cell = table.cells[`${columnLabel(col)}${row + 1}`];
  return writerGridCellText(cell, { booleanTrue: 'Ja', booleanFalse: 'Nein' });
}

export function extractWriterTableFromGrid(
  document: WorkspaceDocument,
  objectId: string,
  range: string,
  mode: 'Live' | 'Frozen',
  options: WriterGridTableExtractionOptions = {},
): WriterTableBlockData {
  const tableId = options.tableId ?? crypto.randomUUID();
  if (document.kind !== 'Grid') throw new WriterGridLinkError('Die ausgewählte Quelle ist kein Grid-Dokument.');
  const object = document.objects[objectId];
  if (!object || object.type !== 'Table') throw new WriterGridLinkError('Das ausgewählte Grid-Sheet ist nicht verfügbar.');
  const bounds = parseWriterGridRange(range, object.data);
  const columns = Array.from(
    { length: bounds.end.col - bounds.start.col + 1 },
    (_, offset) => cellText(object.data, bounds.start.col + offset, bounds.start.row) || columnLabel(bounds.start.col + offset)
  );
  const rows = Array.from(
    { length: Math.max(0, bounds.end.row - bounds.start.row) },
    (_, rowOffset) => {
      const sourceRow = bounds.start.row + rowOffset + 1;
      return {
        id: `${tableId}-row-${sourceRow}`,
        cells: columns.map((_, colOffset) => ({
          id: `${tableId}-cell-${sourceRow}-${bounds.start.col + colOffset}`,
          content: cellText(object.data, bounds.start.col + colOffset, sourceRow),
        })),
      };
    }
  );
  const normalizedRange = `${columnLabel(bounds.start.col)}${bounds.start.row + 1}:${columnLabel(bounds.end.col)}${bounds.end.row + 1}`;
  const gridSource: WriterGridSourceReference | undefined = mode === 'Live'
    ? {
        documentId: document.id,
        objectId,
        range: normalizedRange,
        uri: `vgt://workspace/document/${encodeURIComponent(document.id)}/object/${encodeURIComponent(objectId)}?range=${encodeURIComponent(normalizedRange)}`,
        mode,
        sourceVersion: document.version,
      }
    : undefined;

  return {
    id: tableId,
    columns,
    rows,
    ...(options.anchorParagraphId ? { anchorParagraphId: options.anchorParagraphId } : {}),
    gridSource,
  };
}

export function refreshWriterGridLinks(
  writerDocument: WorkspaceDocument,
  sourceDocument: WorkspaceDocument,
  sourceObjectId: string
): { document: WorkspaceDocument; updatedCount: number } {
  if (writerDocument.kind !== 'Writer' || !writerDocument.writerData) {
    return { document: writerDocument, updatedCount: 0 };
  }
  let updatedCount = 0;
  const tables = writerDocument.writerData.tables.map((table) => {
    const source = table.gridSource;
    if (!source || source.mode !== 'Live' || source.documentId !== sourceDocument.id || source.objectId !== sourceObjectId) {
      return table;
    }
    try {
      const refreshed = extractWriterTableFromGrid(sourceDocument, sourceObjectId, source.range, 'Live', {
        tableId: table.id,
        anchorParagraphId: table.anchorParagraphId,
      });
      updatedCount += 1;
      return { ...refreshed, anchorParagraphId: table.anchorParagraphId };
    } catch (error: unknown) {
      if (error instanceof WriterGridLinkError) return table;
      throw error;
    }
  });
  if (updatedCount === 0) return { document: writerDocument, updatedCount };
  return {
    document: {
      ...writerDocument,
      version: writerDocument.version + 1,
      modified_at: Date.now(),
      writerData: { ...writerDocument.writerData, tables },
    },
    updatedCount,
  };
}
