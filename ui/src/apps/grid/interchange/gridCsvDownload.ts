// STATUS: PLATIN — Grid CSV export delivery (Release Beta 0.1: native file writes, no silent success).
import { deliverExportText, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';

/**
 * Delivers the CSV text to the user.
 *
 * On the desktop the file is written through the native save dialog + atomic export and the result is
 * `mode:'file'` (the granted name is confirmed). In the browser build the blob download remains and is
 * reported as `mode:'download'` — callers must not describe that as "saved".
 */
export function downloadGridCsv(csv: string, filename: string): Promise<ExportDeliveryResult> {
  return deliverExportText(csv, {
    suggestedName: filename,
    extensions: ['csv'],
    mimeType: 'text/csv;charset=utf-8',
  });
}
