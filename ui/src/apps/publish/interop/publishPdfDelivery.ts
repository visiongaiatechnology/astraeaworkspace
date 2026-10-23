// STATUS: DIAMANT VGT SUPREME — Publish: PDF-Auslieferung an den Nutzer
//
// Befund aus dem Quell-Audit, in Runde 59 **gemessen bestätigt**: Der Toolbar-Knopf „PDF" rief
// `window.print()` auf — mit dem Kommentar „Generate clean print layout trigger". Das ist **kein Export**:
// es entsteht keine Datei, es gibt keinen Fortschritt, keinen Fehlerzustand und keine Prüfung. Der echte
// PDF-Bauer (`buildPublishPdf`) existierte daneben die ganze Zeit und wurde nur vom Prepress-Dialog benutzt.
//
// Dieses Modul hat zwei Aufgaben, getrennt nach Prüfbarkeit:
//   • `publishExportFileName` — **rein**: aus einem Dokumenttitel einen sicheren Dateinamen machen. Der
//     Titel ist Nutzereingabe und landet in einem Dateinamen, also an einer Vertrauensgrenze.
//   • `deliverPublishPdf` — die dünne Verdrahtung (Blob, Anker, Aufräumen).
//
// Eine Definition für beide Aufrufer: der Prepress-Dialog hatte seine eigene Kopie der Download-Mechanik.
// Genau solche Doppelungen haben dieses Projekt wiederholt Fehler gekostet.

/** Obergrenze in **Bytes**, nicht in Zeichen: ein Umlaut belegt in UTF-8 zwei. */
export const MAX_PUBLISH_FILE_NAME_BYTES = 120;
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
const FALLBACK_STEM = 'publish-dokument';

/**
 * Ein sicherer Dateiname für den PDF-Export.
 *
 * Regeln, jede mit einem Grund:
 *   • Pfadtrenner und unter Windows verbotene Zeichen werden zu `-` — ein Titel darf keinen Pfad bilden.
 *   • `..` kann nicht entstehen, weil Punkte nur als Endung erlaubt sind.
 *   • Steuerzeichen fliegen raus (sie zerlegen Dateinamen und Logs).
 *   • Führende Punkte und Bindestriche entfallen: unter Windows ist ein führender Punkt unzulässig, und
 *     „-bericht.pdf" sieht nach einem Fehler aus.
 *   • Die Länge wird in **Bytes** begrenzt und dabei auf **Codepunkten** geschnitten, damit kein
 *     Ersatzpaar (Emoji, seltener Buchstabe) zerteilt wird — ein halbes Zeichen wäre ein kaputter Name.
 *   • Die Endung ist genau einmal `.pdf`, unabhängig davon, ob der Titel schon eine trägt.
 *   • Bleibt nichts übrig, greift ein fester Name: ein leerer Dateiname wäre für den Nutzer unbrauchbar.
 */
export function publishExportFileName(documentTitle: string, suffix = ''): string {
  return `${boundStem(documentTitle, suffix)}.pdf`;
}

/**
 * Derselbe sichere Stamm ohne Endung — fuer HTML und EPUB, die andere Endungen tragen.
 *
 * Diese Funktion ist die **eine** Definition der Bereinigung. `publishExportFileName` ruft sie auf, statt
 * die Regeln zu wiederholen: eine zweite Kopie der Dateinamen-Regeln waere eine zweite Gelegenheit, aus
 * einem Nutzertitel einen Pfad zu bauen.
 */
export function boundStem(documentTitle: string, suffix = '', budgetBytes = MAX_PUBLISH_FILE_NAME_BYTES): string {
  const normalized = (documentTitle ?? '').normalize('NFC');
  const withoutExtension = normalized.replace(/\.(pdf|zip|indd|idml|epub|html|htm)$/iu, '');
  const cleaned = withoutExtension
    // eslint-disable-next-line no-control-regex -- Steuerzeichen sind hier genau das Ziel.
    .replace(/[\u0000-\u001f\u007f]/gu, '')
    .replace(/[\\/:*?"<>|]+/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[.\-]+/u, '')
    .replace(/[.\-\s]+$/u, '');
  const stem = cleaned.length > 0 ? cleaned : FALLBACK_STEM;
  const tail = suffix.trim().length > 0 ? `-${suffix.trim().replace(/[\\/:*?"<>|\s]+/gu, '-')}` : '';
  return `${boundToBytesUtf8(stem, budgetBytes - tail.length - 5)}${tail}`;
}

/** Kürzt auf eine Byte-Obergrenze, ohne je ein Ersatzpaar zu zerteilen. */
function boundToBytesUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const limit = Math.max(1, maxBytes);
  let used = 0;
  let out = '';
  for (const character of value) {
    const size = encoder.encode(character).byteLength;
    if (used + size > limit) break;
    out += character;
    used += size;
  }
  return out.length > 0 ? out : FALLBACK_STEM;
}

/**
 * Liefert die Bytes als Datei aus (Release Beta 0.1).
 *
 * Auf dem Desktop schreibt der Speichern-Dialog + atomare Sandbox-Export die Datei und bestaetigt den
 * Namen (`mode:'file'`). Im Browser bleibt der Download-Fallback und wird als Download gemeldet —
 * niemals als bestaetigtes Speichern. Fehler werden geworfen (kein stiller Nicht-Export).
 */
export function deliverPublishPdf(bytes: Uint8Array, fileName: string): Promise<ExportDeliveryResult> {
  return deliverPublishBytes(bytes, fileName, 'application/pdf');
}

/**
 * Dieselbe Auslieferung fuer jeden Exporttyp.
 *
 * EPUB und Publikationspaket erzeugten ihre ZIP-Bytes vorher ohne Auslieferung — der Nutzer bekam sie
 * nicht. Statt in jedem Exportpfad einen eigenen Anker zu bauen, gibt es genau eine Auslieferung.
 */
export function deliverPublishBytes(bytes: Uint8Array, fileName: string, mimeType: string): Promise<ExportDeliveryResult> {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(fileName) ? fileName.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportBytes(bytes, { suggestedName: fileName, extensions: [extension], mimeType });
}
