// STATUS: PLATIN — Integration & Release, Paket 1+2: **die Lese-Seite** des Umschlag-Vertrags
//
// Die Schreibseite ist seit Runde 94 verdrahtet (der Shell-Durchlass stempelt). Hier kommt die **Lese**seite
// dazu — und sie hat eine andere Politik als das Schreiben, mit Absicht:
//
// | Zustand | Schreiben | Lesen |
// | --- | --- | --- |
// | unbekannte Dokumentart | durchlassen, **zählen** | durchlassen (der Vertrag kennt sie nicht) |
// | **keine** Version | stempeln | **erlauben** — Ablage aus der Zeit vor der Versionierung (`legacy`) |
// | aktuelle Version | schon richtig | erlauben |
// | **neuere** Version | (kann nicht vorkommen) | **ablehnen mit Namen** |
// | vorhanden, aber unsinnig | — | **ablehnen mit Namen** |
//
// **Warum das Lesen strenger ist:** Eine Ablage aus der Zukunft mit „best effort" zu lesen ist der Weg, auf dem
// Daten **still** falsch werden — Felder, die diese Anwendung nicht kennt, gehen beim nächsten Speichern
// verloren, ohne dass jemand es merkt. Beim Schreiben dagegen wäre ein Wurf schlimmer als eine fehlende
// Versionsangabe (ein nicht gespeichertes Dokument).
import { WORKSPACE_SCHEMA_VERSIONS, WorkspaceSchemaError, resolveWorkspaceSchemaAction, type WorkspaceSchemaKind } from './workspaceSchemaVersion';
import { isVersionedWorkspaceKind } from './workspaceDocumentStamp';

export type WorkspaceReadVerdict =
  | { readonly verdict: 'current'; readonly version: number }
  | { readonly verdict: 'legacy'; readonly reason: 'written-before-versioning' }
  | { readonly verdict: 'unversioned-kind'; readonly kind: string };

/**
 * Entscheidet, ob ein **gelesenes** Dokument benutzt werden darf. Rein, damit headless prüfbar.
 *
 * Wirft `WorkspaceSchemaError` für eine **neuere** oder **unsinnige** Angabe — mit Art und Grund, damit die
 * Oberfläche sagen kann *was* scheiterte statt nur *dass*.
 */
export function resolveWorkspaceDocumentRead<T extends { kind?: unknown; schemaVersion?: unknown }>(document: T): WorkspaceReadVerdict {
  const kind = document?.kind;
  if (!isVersionedWorkspaceKind(kind)) {
    return { verdict: 'unversioned-kind', kind: typeof kind === 'string' ? kind : 'unknown' };
  }
  const gefunden = document.schemaVersion;
  if (gefunden === undefined) return { verdict: 'legacy', reason: 'written-before-versioning' };
  const entscheidung = resolveWorkspaceSchemaAction(kind, gefunden);
  if (entscheidung.action === 'current') return { verdict: 'current', version: entscheidung.version };
  const grund = entscheidung.action === 'reject' ? entscheidung.reason : 'unsupported';
  throw new WorkspaceSchemaError(`workspace_document_schema_${grund}:${String(gefunden)}`, kind as WorkspaceSchemaKind, grund);
}

/** Die Version, die der Vertrag für diese Art kennt — oder `null` für Arten, die er nicht kennt. */
export function workspaceSchemaVersionFor(kind: unknown): number | null {
  return isVersionedWorkspaceKind(kind) ? WORKSPACE_SCHEMA_VERSIONS[kind] : null;
}
