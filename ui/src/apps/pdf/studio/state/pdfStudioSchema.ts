// STATUS: PLATIN — Integration & Release, Paket 1: PDF Studio **benutzt** den gemeinsamen Versionsvertrag
//
// **Warum diese Datei existiert.** Die Messung in Runde 86 zeigte: PDF Studio war eine von **drei** Apps ohne
// jede Schema-Angabe im Code ✗. Ohne Versionsangabe kann niemand eine alte Ablage erkennen, migrieren oder
// ablehnen — und eine unbekannte Form zu lesen ist genau der Weg, auf dem Daten still falsch werden.
//
// **Runde 91 hat mich selbst korrigiert:** Ich hatte „die Lücke ist geschlossen" behauptet, weil dieses Modul
// existierte — gemessen hatte es **null** Aufrufer ✗. Seit Runde 92 wird es an der **Speicherstrecke** benutzt
// (`usePdfStudioState.ts`), und `integrationSchemaAdoption.contract.test.mjs` prüft genau das.
//
// **Was hier NICHT steht:** eine eigene Zahl. Die Version kommt aus `WORKSPACE_SCHEMA_VERSIONS.PdfStudio`.

import {
  WORKSPACE_SCHEMA_VERSIONS,
  WorkspaceSchemaError,
  resolveWorkspaceSchemaAction,
} from '../../../../platform/workspace/integrations/workspaceSchemaVersion';
import { WORKSPACE_SCHEMA_FIELD } from '../../../../platform/workspace/integrations/workspaceDocumentStamp';

/** PDF Studios kanonische Schema-Version — **abgeleitet**, nicht abgeschrieben. */
export const PDF_STUDIO_SCHEMA_VERSION: number = WORKSPACE_SCHEMA_VERSIONS.PdfStudio;

/**
 * Das Feld, in dem die Version im gespeicherten Zustand steht.
 *
 * **Korrigiert in diesem Batch:** Hier stand das Literal `'schemaVersion'` — dieselbe Schreibweise, die
 * `platform/workspace/integrations/workspaceDocumentStamp.ts` als `WORKSPACE_SCHEMA_FIELD` führt, also
 * **zweimal** im Baum. Zwei Schreibweisen für ein Feld sind derselbe Fehler wie zwei Zahlen für eine Version:
 * Wer eine davon ändert, ändert die andere nicht, und der Stempel und der Leser finden sich nicht mehr.
 * Der Name bleibt (öffentliche Schnittstelle), der Wert kommt jetzt aus der einen Quelle.
 */
export const PDF_STUDIO_SCHEMA_FIELD = WORKSPACE_SCHEMA_FIELD;

export interface PdfStudioSchemaState {
  readonly schemaVersion?: unknown;
}

/**
 * Das Ergebnis der Prüfung. `legacy` ist **kein** stilles Durchwinken: Es benennt die Ablagen aus der Zeit
 * **vor** der Versionierung, damit sie sichtbar bleiben und beim nächsten Speichern die Version bekommen.
 */
export type PdfStudioSchemaVerdict =
  | { readonly verdict: 'current'; readonly version: number }
  | { readonly verdict: 'legacy'; readonly reason: 'written-before-versioning' };

/**
 * Prüft einen gelesenen PDF-Studio-Zustand **fail-closed**.
 *
 * - aktuell → durchlassen
 * - neuer als unterstützt → **ablehnen** (diese Anwendung ist zu alt; „best effort" lesen wäre Datenverlust)
 * - vorhanden, aber unsinnig (0, -1, 1.5, NaN, Text, Objekt) → **ablehnen**
 * - **gar nicht vorhanden** → `legacy`: Ablage aus der Zeit vor der Versionierung. Erlaubt, **benannt**, und
 *   beim nächsten Speichern gestempelt — nicht heimlich als „Version 1" gedeutet.
 */
export function resolvePdfStudioSchema(input: PdfStudioSchemaState | null | undefined): PdfStudioSchemaVerdict {
  const gefunden = input?.[PDF_STUDIO_SCHEMA_FIELD];
  if (gefunden === undefined) return { verdict: 'legacy', reason: 'written-before-versioning' };
  const entscheidung = resolveWorkspaceSchemaAction('PdfStudio', gefunden);
  if (entscheidung.action === 'current') return { verdict: 'current', version: entscheidung.version };
  const grund = entscheidung.action === 'reject' ? entscheidung.reason : 'unsupported';
  throw new WorkspaceSchemaError(`pdf_studio_schema_${grund}:${String(gefunden)}`, 'PdfStudio', grund);
}

/** Wie `resolvePdfStudioSchema`, aber ohne Rückgabe — für Stellen, die nur prüfen wollen. */
export function assertPdfStudioSchema(input: PdfStudioSchemaState | null | undefined): void {
  resolvePdfStudioSchema(input);
}

/** Setzt die Version beim Schreiben — die einzige Stelle, die sie in den Zustand legt. */
export function withPdfStudioSchema<T extends object>(zustand: T): T & { schemaVersion: number } {
  return { ...zustand, [PDF_STUDIO_SCHEMA_FIELD]: PDF_STUDIO_SCHEMA_VERSION };
}
