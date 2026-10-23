// STATUS: PLATIN — Integration & Release, Paket 1+2: **der Umschlag wird an einer Stelle gestempelt**
//
// ## Die Einsicht, die diese Datei trägt
//
// In Runde 86 habe ich gemessen: nur 4 von 11 Apps trugen eine Schema-Version im Code. Der naheliegende Weg wäre
// gewesen, elf Apps einzeln nachzurüsten — Grid allein hat **fünf** Speicherpunkte ✗, und ein halb angepasster
// Pfad ist schlimmer als gar keiner.
//
// **Die Version gehört zum Dokument-Umschlag, und den schreibt die Shell.** Also wird sie **dort** gestempelt:
// **eine** Stelle, **alle** Dokumentarten, keine App muss ihre fünf Speicherpunkte anfassen.
//
// ## Fail-open an der Schreibgrenze — mit Absicht und mit Grund
//
// Der Stempel wirft **nie**. Ein unbekannter Dokumenttyp wird **nicht** gestempelt und **nicht** abgelehnt,
// sondern **gezählt** (`unstampable`). Ein Wurf an dieser Stelle würde das **Speichern** verhindern — und ein
// nicht gespeichertes Dokument ist schlimmer als ein Dokument ohne Versionsangabe. Abgelehnt wird beim
// **Lesen** (`resolveWorkspaceSchemaAction`), nicht beim Schreiben.
import { WORKSPACE_SCHEMA_VERSIONS, type WorkspaceSchemaKind } from './workspaceSchemaVersion';

/** Das Feld, in dem die Version im Dokument-Umschlag steht. Eine Schreibweise, überall dieselbe. */
export const WORKSPACE_SCHEMA_FIELD = 'schemaVersion' as const;

/** Dokumenttypen, für die der Vertrag eine Version kennt. */
export function isVersionedWorkspaceKind(kind: unknown): kind is WorkspaceSchemaKind {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(WORKSPACE_SCHEMA_VERSIONS, kind);
}

export interface WorkspaceStampResult<T> {
  readonly document: T;
  /** `stamped` — Version gesetzt · `already-current` — war schon richtig · `unstampable` — unbekannter Typ. */
  readonly outcome: 'stamped' | 'already-current' | 'unstampable';
}

/**
 * Stempelt einen Dokument-Umschlag mit der kanonischen Version seiner Art. **Rein**, wirft nie.
 *
 * `unstampable` ist der ehrliche Ausgang für Typen, die der Vertrag (noch) nicht kennt: Sie werden
 * durchgelassen **und gezählt** — nicht stillschweigend als „Version 1" gedeutet und nicht blockiert.
 */
export function stampWorkspaceDocumentSchema<T extends { kind?: unknown; schemaVersion?: unknown }>(
  document: T,
): WorkspaceStampResult<T> {
  if (!isVersionedWorkspaceKind(document?.kind)) return { document, outcome: 'unstampable' };
  const soll = WORKSPACE_SCHEMA_VERSIONS[document.kind];
  if (document.schemaVersion === soll) return { document, outcome: 'already-current' };
  return { document: { ...document, [WORKSPACE_SCHEMA_FIELD]: soll }, outcome: 'stamped' };
}

/** Zählt die Ausgänge — damit „acht Apps gestempelt, drei nicht" eine Zahl hat und keine Behauptung bleibt. */
export interface WorkspaceStampTally {
  readonly stamped: number;
  readonly alreadyCurrent: number;
  readonly unstampable: number;
}

export function createWorkspaceStampTally(): { record: (outcome: WorkspaceStampResult<unknown>['outcome']) => void; read: () => WorkspaceStampTally } {
  let stamped = 0;
  let alreadyCurrent = 0;
  let unstampable = 0;
  return {
    record: (outcome) => {
      if (outcome === 'stamped') stamped += 1;
      else if (outcome === 'already-current') alreadyCurrent += 1;
      else unstampable += 1;
    },
    read: () => ({ stamped, alreadyCurrent, unstampable }),
  };
}
