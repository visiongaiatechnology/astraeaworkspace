// STATUS: PLATIN — structured-table export delivery (Release Beta 0.1: one real-write path).
//
// The table export used to build a Blob and click an anchor inside the hook. In the native WebView
// that produced no reliable file. This module owns the byte-to-user step so the hook stays a thin
// state bridge and the delivery is testable without React.
import type { GridCell, GridStructuredTable } from '../../../shared/contracts/workspace';
import { deliverExportText, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { exportTableData } from '../tables/gridTableFeatures';
import type { GridTableInterchangeFormat } from '../tables/interchange/gridStructuredTableInterop';

export const GRID_TABLE_EXPORT_MIME: Readonly<Record<GridTableInterchangeFormat, string>> = {
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

export function exportGridTableData(
  table: GridStructuredTable,
  cells: Record<string, GridCell>,
  format: GridTableInterchangeFormat,
): string {
  return exportTableData(table, cells, format);
}

/** Delivers one structured table. Resolves only after a confirmed native write or a browser download. */
export function deliverGridTableExport(
  table: GridStructuredTable,
  cells: Record<string, GridCell>,
  format: GridTableInterchangeFormat,
): Promise<ExportDeliveryResult> {
  const content = exportGridTableData(table, cells, format);
  return deliverExportText(content, {
    suggestedName: `${table.name}.${format}`,
    extensions: [format],
    mimeType: GRID_TABLE_EXPORT_MIME[format],
  });
}
