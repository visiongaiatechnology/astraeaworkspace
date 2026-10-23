// STATUS: PLATIN — honest delivery wording for Tasks exports (Release Beta 0.1).
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { isExportDeliveryAbort } from '../../../shared/interchange/exportDelivery';

export function taskDeliveryText(result: ExportDeliveryResult): string {
  return result.mode === 'file'
    ? `${result.fileName} saved.`
    : `Download started: ${result.fileName} (browser mode – no write confirmation).`;
}

export function taskDeliveryFailureText(error: unknown): string {
  if (isExportDeliveryAbort(error)) return 'Export cancelled — no file was written.';
  const detail = error instanceof Error && error.message ? error.message : String(error);
  return `Export failed: ${detail}`;
}
