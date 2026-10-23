// STATUS: PLATIN — shared, honest export status wording for Grid (Release Beta 0.1).
//
// One definition of what a successful delivery may be called: a confirmed native write is "saved",
// the browser fallback is a "download" and must never claim a file on disk. Aborts and failures are
// named instead of being swallowed.
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { isExportDeliveryAbort } from '../../../shared/interchange/exportDelivery';

export function gridExportDeliveryText(result: ExportDeliveryResult): string {
  return result.mode === 'file'
    ? `${result.fileName} gespeichert.`
    : `Download gestartet: ${result.fileName} (Browser-Modus – keine Schreibbestätigung).`;
}

export function gridExportAbortedText(): string {
  return 'Export abgebrochen — es wurde keine Datei geschrieben.';
}

export function gridExportFailureText(error: unknown): string {
  if (isExportDeliveryAbort(error)) return gridExportAbortedText();
  const detail = error instanceof Error && error.message ? error.message : 'Unbekannter Fehler.';
  return `Export fehlgeschlagen: ${detail}`;
}
