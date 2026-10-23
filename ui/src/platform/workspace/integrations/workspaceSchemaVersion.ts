// STATUS: PLATIN — Integration & Release, Paket 1+2 (AST-1878…1887): **ein** Versions- und Migrationsvertrag
//
// ## Warum diese Datei existiert
//
// Die Anforderung lautet: „Jede App erzeugt stabile dokumentierte IDs und serialisiert nur ihren kanonischen
// Zustand." Gemessen in Runde 86 trug nur **4 von 11** Apps eine Schema-Version im **Code** (Draw, Insight,
// Publish, Writer); Grid nur im Kommentar, Notes/Vault/Whiteboard nur in Diagnose-Suiten, Connect/PDF/Present
// gar nicht. Es gab **keinen** gemeinsamen Vertrag — jede App hätte ihre eigene Zahl erfunden, und genau daraus
// entstehen die „zwei Definitionen einer Tatsache", die dieses Projekt viele Runden gekostet haben.
//
// ## Was diese Datei ist — und was sie **nicht** ist
//
// Sie ist der **Vertrag**: eine benannte Version je Dokumentart, eine **fail-closed** Prüfung und eine
// Migrationsentscheidung. Sie ist **nicht** die Umstellung der Apps: Solange eine App diesen Vertrag nicht
// benutzt, ist ihre Lücke **nicht** geschlossen. Der Vertrag macht das Ziel erreichbar und prüfbar — er
// behauptet nicht, es sei erreicht.

// **EINE Definition, abgeleitet statt abgeschrieben (Integration & Release, Paket 3, Runde 154).**
//
// **Der Befund, der dazu führte:** Diese Datei führte `WorkspaceSchemaKind` als **eigene, handgeschriebene Union**
// mit **12** Einträgen ✗ — während die kanonische `DocumentKind` **20** kennt ✓. Sie schrieb außerdem **`'PDF'`** ✗,
// wo das Dokument **`'PdfStudio'`** heißt ✓ ✓. Zwei Wörter für eine Tatsache — und weil
// `WORKSPACE_SCHEMA_VERSIONS` als `Record<WorkspaceSchemaKind, number>` typisiert war ✓, war der Registry
// **vollständig bezogen auf seine eigene Definition** ✗: **nichts konnte die Lücke bemerken** ✓.
// Gefunden hat sie `workspaceSchemaCoverage.contract.ts` ✓ — eine Zusicherung, die den kanonischen Typ gegen die
// Schlüssel dieses Registry hält ✓. *Genau der „zweite Schattenkatalog", den das Abnahmekriterium von Paket 3
// verbietet* ✓.
//
// **Jetzt:** `WorkspaceSchemaKind` **ist** `DocumentKind` ✓ — eine Ableitung, keine Abschrift ✓. Und die Liste
// deckt **jede** persistierte Art ab ✓, auch die Premium-Arten ✓ (sie werden in einer Premium-Edition ebenso
// gespeichert und brauchen deshalb eine benannte Version ✓).
import type { DocumentKind } from '../../../shared/contracts/documentKind';

/** Die Dokumentarten des Arbeitsbereichs — **abgeleitet** aus dem kanonischen Typ, nicht abgeschrieben ✓. */
export type WorkspaceSchemaKind = DocumentKind;

/**
 * **Die eine** Stelle, an der die Schema-Version einer Dokumentart steht.
 *
 * Erhöhen heißt: Die Form des gespeicherten Zustands hat sich geändert und alte Ablagen brauchen eine
 * Migration. Wer eine Version erhöht, ohne den Migrationsschritt in `MIGRATIONS` zu ergänzen, bricht die
 * Prüfung — das ist Absicht.
 *
 * **`Readonly<Record<WorkspaceSchemaKind, number>>` ist die Zusicherung:** Fehlte hier eine Art, wäre das Objekt
 * nicht mehr zuweisbar ✓ — der Übersetzungslauf scheitert ✓. Und `workspaceSchemaCoverage.contract.ts` prüft
 * dieselbe Vollständigkeit zusätzlich über `Exclude<…>` ✓.
 */
export const WORKSPACE_SCHEMA_VERSIONS: Readonly<Record<WorkspaceSchemaKind, number>> = Object.freeze({
  Writer: 1,
  Grid: 1,
  Present: 1,
  Notes: 1,
  PdfStudio: 1,
  Tasks: 1,
  Planner: 1,
  Projects: 1,
  Whiteboard: 1,
  Draw: 1,
  Forms: 1,
  Database: 1,
  Vault: 1,
  Spaces: 1,
  AdminPolicy: 1,
  GaiaCom: 1,
  Publish: 1,
  Insight: 1,
  Connect: 1,
  Automate: 1,
});

/** Was mit einer gefundenen Version geschehen soll. */
export type WorkspaceSchemaAction =
  /** Die Version ist die aktuelle — nichts zu tun. */
  | { readonly action: 'current'; readonly kind: WorkspaceSchemaKind; readonly version: number }
  /** Eine **ältere**, bekannte Version — es gibt einen benannten Migrationsweg. */
  | { readonly action: 'migrate'; readonly kind: WorkspaceSchemaKind; readonly from: number; readonly to: number; readonly id: string }
  /** Eine **neuere** Version — diese Anwendung ist zu alt. Ablehnen, nicht „best effort" lesen. */
  | { readonly action: 'reject'; readonly kind: WorkspaceSchemaKind; readonly reason: 'newer-than-supported'; readonly found: number; readonly supported: number }
  /** Keine brauchbare Angabe — ablehnen. */
  | { readonly action: 'reject'; readonly kind: WorkspaceSchemaKind; readonly reason: 'missing-or-invalid' };

/**
 * Benannte Migrationsschritte. `from → to` ist immer **ein** Schritt; mehrere Schritte laufen nacheinander.
 * Die Kennung erscheint im Fehlertext und in der Evidenz, damit ein Nutzer sagen kann, **welcher** Schritt
 * scheiterte.
 */
export interface WorkspaceSchemaMigration {
  readonly id: string;
  readonly kind: WorkspaceSchemaKind;
  readonly from: number;
  readonly to: number;
}

/**
 * **Noch leer — und das ist der gemessene Zustand.** Solange alle Arten auf Version 1 stehen, gibt es nichts zu
 * migrieren. Der erste Eintrag entsteht mit der ersten echten Formänderung; `assertMigrationCoverage` erzwingt,
 * dass er dann auch da ist.
 */
export const MIGRATIONS: readonly WorkspaceSchemaMigration[] = Object.freeze([]);

export class WorkspaceSchemaError extends Error {
  constructor(message: string, readonly kind: WorkspaceSchemaKind, readonly reason: string) {
    super(message);
    this.name = 'WorkspaceSchemaError';
  }
}

/**
 * Entscheidet, was mit einer gefundenen Version geschehen soll. **Rein** — kein Zugriff auf Ablagen, keine Zeit,
 * kein Zufall; damit ist sie ohne Browser prüfbar.
 *
 * **Fail-closed:** Alles, was nicht eindeutig „aktuell" oder ein bekannter Migrationsweg ist, wird abgelehnt.
 * Eine fehlende Version ist **kein** „dann eben Version 1": Wer die Form nicht benennt, hat sie nicht
 * dokumentiert — und eine unbekannte Form zu lesen ist genau der Weg, auf dem Daten still falsch werden.
 */
export function resolveWorkspaceSchemaAction(kind: WorkspaceSchemaKind, found: unknown): WorkspaceSchemaAction {
  const supported = WORKSPACE_SCHEMA_VERSIONS[kind];
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
    return { action: 'reject', kind, reason: 'missing-or-invalid' };
  }
  if (found === supported) return { action: 'current', kind, version: found };
  if (found > supported) return { action: 'reject', kind, reason: 'newer-than-supported', found, supported };
  const schritt = MIGRATIONS.find((m) => m.kind === kind && m.from === found);
  if (!schritt) return { action: 'reject', kind, reason: 'missing-or-invalid' };
  return { action: 'migrate', kind, from: found, to: schritt.to, id: schritt.id };
}

/**
 * Prüft den Vertrag **gegen sich selbst**: Jede Art hat eine Version, jede Version ist eine ganze Zahl ≥ 1, und
 * zu jeder Migrationskette gibt es einen Weg von der ältesten bekannten Version zur aktuellen. Wird eine Version
 * erhöht, ohne den Schritt zu ergänzen, schlägt das hier fehl — beim Start, nicht beim Nutzer.
 */
export function assertWorkspaceSchemaContract(): void {
  const arten = Object.keys(WORKSPACE_SCHEMA_VERSIONS) as WorkspaceSchemaKind[];
  if (arten.length === 0) throw new WorkspaceSchemaError('workspace_schema_contract_empty', 'Writer', 'empty');
  for (const kind of arten) {
    const version = WORKSPACE_SCHEMA_VERSIONS[kind];
    if (!Number.isInteger(version) || version < 1) {
      throw new WorkspaceSchemaError(`workspace_schema_version_invalid:${kind}`, kind, 'version-invalid');
    }
    // Jede Migration muss zu ihrer Art gehören, vorwärts zeigen und genau einen Schritt machen.
    for (const m of MIGRATIONS) {
      if (m.kind !== kind) continue;
      if (m.to !== m.from + 1) throw new WorkspaceSchemaError(`workspace_schema_migration_not_single_step:${m.id}`, kind, 'not-single-step');
      if (m.to > version) throw new WorkspaceSchemaError(`workspace_schema_migration_above_current:${m.id}`, kind, 'above-current');
    }
  }
  for (const m of MIGRATIONS) {
    if (!arten.includes(m.kind)) throw new WorkspaceSchemaError(`workspace_schema_migration_unknown_kind:${m.id}`, m.kind, 'unknown-kind');
  }
}
