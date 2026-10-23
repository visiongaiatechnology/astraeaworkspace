// STATUS: PLATIN — honest delivery wording for Present exports (Release Beta 0.1).
//
// A confirmed native write is "gespeichert"; the browser fallback is a "Download"; abort and write
// failures are named. Present's export surface is bilingual (de/en) with the German copy first.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { isExportDeliveryAbort } from '../../../shared/interchange/exportDelivery';

const german = (locale: WorkspaceLocale): boolean => locale === 'de-DE';

export function presentExportDeliveryText(locale: WorkspaceLocale, result: ExportDeliveryResult): string {
  if (german(locale)) {
    return result.mode === 'file'
      ? `${result.fileName} gespeichert.`
      : `Download gestartet: ${result.fileName} (Browser-Modus – keine Schreibbestätigung).`;
  }
  return result.mode === 'file'
    ? `${result.fileName} saved.`
    : `Download started: ${result.fileName} (browser mode – no write confirmation).`;
}

export function presentExportFailureText(locale: WorkspaceLocale, error: unknown): string {
  const reason = error instanceof Error && error.message ? error.message : String(error);
  if (isExportDeliveryAbort(error)) {
    return german(locale) ? 'Export abgebrochen — es wurde keine Datei geschrieben.' : 'Export cancelled — no file was written.';
  }
  return german(locale) ? `Export fehlgeschlagen: ${reason}` : `Export failed: ${reason}`;
}
