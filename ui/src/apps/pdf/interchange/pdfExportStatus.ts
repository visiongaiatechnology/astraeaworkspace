// STATUS: PLATIN — localized delivery wording for PDF exports (Release Beta 0.1).
//
// One place decides what a delivery result may be called. "Saved" only exists after the desktop
// confirmed the atomic write; the browser fallback is a download; an abort or a write failure is
// named instead of being swallowed. Multi-artifact exports use the partial sentence.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { isExportDeliveryAbort } from '../../../shared/interchange/exportDelivery';
import { pdfWorkflowText } from '../locale/pdfWorkflowDialogsLocale';

export function pdfExportDeliveryText(locale: WorkspaceLocale, result: ExportDeliveryResult): string {
  return pdfWorkflowText(locale, result.mode === 'file' ? 'export.delivery.saved' : 'export.delivery.download', {
    fileName: result.fileName,
  });
}

export function pdfExportFailureText(locale: WorkspaceLocale, error: unknown): string {
  if (isExportDeliveryAbort(error)) return pdfWorkflowText(locale, 'export.delivery.aborted');
  const reason = error instanceof Error && error.message ? error.message : String(error);
  return pdfWorkflowText(locale, 'export.delivery.failed', { reason });
}

export function pdfExportPartialText(locale: WorkspaceLocale, written: number, total: number): string {
  return pdfWorkflowText(locale, 'export.delivery.partial', { written, total });
}
