// STATUS: PLATIN — Strongly typed Writer Table models
import type { WriterGridSourceReference } from './workspaceWriterGridSource';

export type WriterTableAutoFitMode = 'window' | 'contents' | 'fixed';
export type WriterCellVerticalAlignment = 'top' | 'middle' | 'bottom';
export type WriterCellTextRotation = 0 | 90 | 270;
export type WriterCaptionPosition = 'above' | 'below';

export interface WriterTableCellData {
  id: string;
  content: string;
  colSpan?: number;
  rowSpan?: number;
  verticalAlignment?: WriterCellVerticalAlignment;
  textRotation?: WriterCellTextRotation;
  formula?: string;
  mergedInto?: { row: number; col: number };
}

export interface WriterTableRowData {
  id: string;
  cells: WriterTableCellData[];
  cantSplit?: boolean;
  heightMm?: number;
}

export interface WriterTableBlockData {
  id: string;
  columns: string[];
  rows: WriterTableRowData[];
  styleId?: string;
  anchorParagraphId?: string;
  gridSource?: WriterGridSourceReference;
  autoFit?: WriterTableAutoFitMode;
  columnWidthsMm?: number[];
  repeatHeaderRow?: boolean;
  headerRowHighlight?: boolean;
  totalRowHighlight?: boolean;
  alternatingRows?: boolean;
  firstColumnHighlight?: boolean;
  lastColumnHighlight?: boolean;
  caption?: string;
  captionPosition?: WriterCaptionPosition;
}
