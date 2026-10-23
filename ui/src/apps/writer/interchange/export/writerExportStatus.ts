// STATUS: PLATIN — honest delivery wording for Writer exports (Release Beta 0.1).
//
// A confirmed native write is "gespeichert"; the browser fallback is a "Download"; an abort or write
// failure is named. Writer's export surface is German, so the copy stays German.
import type { ExportDeliveryResult } from '../../../../shared/interchange/exportDelivery';
import { isExportDeliveryAbort } from '../../../../shared/interchange/exportDelivery';

export function writerExportDeliveryText(result: ExportDeliveryResult): string {
  return result.mode === 'file'
    ? `${result.fileName} gespeichert.`
    : `Download gestartet: ${result.fileName} (Browser-Modus – keine Schreibbestätigung).`;
}

export function writerExportAbortedText(): string {
  return 'Export abgebrochen — es wurde keine Datei geschrieben.';
}

export function writerExportFailureText(error: unknown): string {
  if (isExportDeliveryAbort(error)) return writerExportAbortedText();
  const detail = error instanceof Error && error.message ? error.message : 'Unbekannter Fehler.';
  return `Export fehlgeschlagen: ${detail}`;
}
