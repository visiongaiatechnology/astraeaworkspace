// STATUS: PLATIN — Writer-Schreibpfad: kein Feld eines Patches darf still verschwinden
//
// ## Befund (Release 0.1, Audit)
//
// `useWriterPersistence.mergedWriterData` baute das zu schreibende `writerData` aus
// einer **festen Liste** bekannter Felder zusammen. Jeder Patch-Schlüssel, der in
// dieser Liste fehlte, wurde ignoriert — das Dokument behielt den alten Wert, ohne
// Fehler und ohne Hinweis. Heute betrifft das `endnotes` (im Vertrag
// `WriterDocumentModel`, aber nicht in der Liste); morgen jedes additive Feld, das
// ein anderer Teil des Writers einzuführen beginnt.
//
// ## Die Regel
//
// Ein Feld, das im Patch **definiert** ist, kommt im Ergebnis an — es sei denn, der
// Schreibpfad löst es bewusst selbst auf:
//
//   * `images`  — wird normalisiert (`normalizeWriterImagesForWrite`), damit der
//                 gespeicherte Wrap-Modus dem angezeigten entspricht (W-057);
//   * `workspaceEmbeds` — wird nach einem Tabellen-Patch über
//                 `refreshWriterLocalChartEmbeds` neu berechnet.
//
// `undefined` löscht nichts: ein Feld, das nicht im Patch steht, bleibt wie es war.
// Die Funktion gibt bei „nichts zu ergänzen" **dasselbe Objekt** zurück, damit der
// Aufrufer keine neue Identität erzeugt, die Historie/Vergleiche unnötig bewegt.
import type { WriterDocumentData } from '../types';

/**
 * Felder, deren Wert der Schreibpfad selbst bestimmt. Ein roher Patch-Wert darf sie
 * nicht überschreiben, sonst würde z. B. die Bild-Normalisierung rückgängig gemacht.
 */
const WRITER_DATA_FIELDS_RESOLVED_ELSEWHERE: ReadonlySet<string> = new Set([
  'images',
  'workspaceEmbeds',
]);

/**
 * Ergänzt das explizit aufgebaute `writerData` um alle Patch-Felder, die der
 * explizite Aufbau nicht kennt. Pure und idempotent.
 */
export function carryOverWriterDataPatchFields<T extends WriterDocumentData>(
  base: T,
  patch: Partial<WriterDocumentData>,
): T {
  const baseRecord = base as Record<string, unknown>;
  const additional: Record<string, unknown> = {};
  let hasAdditional = false;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (WRITER_DATA_FIELDS_RESOLVED_ELSEWHERE.has(key)) continue;
    if (baseRecord[key] === value) continue;
    additional[key] = value;
    hasAdditional = true;
  }
  return hasAdditional ? { ...base, ...additional } as T : base;
}
