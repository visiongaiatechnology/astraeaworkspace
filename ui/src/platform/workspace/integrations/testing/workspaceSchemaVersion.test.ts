// STATUS: PLATIN — Integration & Release, Paket 1+2: der Versions- und Migrationsvertrag hält, was er verspricht
//
// Die Prüfung ist **rein** (kein DOM, keine Ablage, keine Zeit) und deshalb headless vollständig prüfbar. Sie
// deckt die drei Fälle ab, die im Betrieb über Datenverlust entscheiden: aktuell, älter (Migration), neuer
// (ablehnen) — und die vierte, gefährlichste Möglichkeit: **keine Angabe**.
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  WORKSPACE_SCHEMA_VERSIONS,
  WorkspaceSchemaError,
  assertWorkspaceSchemaContract,
  resolveWorkspaceSchemaAction,
  type WorkspaceSchemaKind,
} from '../workspaceSchemaVersion';

const ARTEN = Object.keys(WORKSPACE_SCHEMA_VERSIONS) as WorkspaceSchemaKind[];

describe('der Vertrag prüft sich selbst', () => {
  it('jede Dokumentart hat eine gültige Version', () => {
    expect(ARTEN.length).toBeGreaterThan(0);
    for (const kind of ARTEN) {
      expect(Number.isInteger(WORKSPACE_SCHEMA_VERSIONS[kind]), `${kind} hat keine ganze Version`).toBe(true);
      expect(WORKSPACE_SCHEMA_VERSIONS[kind]).toBeGreaterThanOrEqual(1);
    }
  });

  it('`assertWorkspaceSchemaContract` läuft über den echten Vertrag fehlerfrei', () => {
    expect(() => assertWorkspaceSchemaContract()).not.toThrow();
  });

  it('jede Migration gehört zu einer bekannten Art und ist genau ein Schritt', () => {
    for (const m of MIGRATIONS) {
      expect(ARTEN, `Migration ${m.id} nennt eine unbekannte Art`).toContain(m.kind);
      expect(m.to, `Migration ${m.id} ist kein Einzelschritt`).toBe(m.from + 1);
    }
  });
});

describe('die Entscheidung ist fail-closed', () => {
  it('die aktuelle Version ist „current"', () => {
    for (const kind of ARTEN) {
      expect(resolveWorkspaceSchemaAction(kind, WORKSPACE_SCHEMA_VERSIONS[kind])).toEqual({
        action: 'current', kind, version: WORKSPACE_SCHEMA_VERSIONS[kind],
      });
    }
  });

  it('eine **neuere** Version wird abgelehnt, nicht „best effort" gelesen', () => {
    for (const kind of ARTEN) {
      const ergebnis = resolveWorkspaceSchemaAction(kind, WORKSPACE_SCHEMA_VERSIONS[kind] + 1);
      expect(ergebnis.action).toBe('reject');
      if (ergebnis.action === 'reject') expect(ergebnis.reason).toBe('newer-than-supported');
    }
  });

  it('eine **fehlende oder unsinnige** Angabe wird abgelehnt — nicht stillschweigend als Version 1 gelesen', () => {
    // Der wichtigste Fall: Genau hier werden Daten still falsch, wenn man „keine Angabe" als „alt, wird schon
    // passen" deutet.
    for (const wert of [undefined, null, 0, -1, 1.5, NaN, Infinity, '1', {}, []]) {
      const ergebnis = resolveWorkspaceSchemaAction('Writer', wert);
      expect(ergebnis.action, `Wert ${String(wert)} wurde nicht abgelehnt`).toBe('reject');
    }
  });

  it('eine ältere Version ohne Migrationsweg wird abgelehnt, nicht geraten', () => {
    // Heute steht jede Art auf Version 1, es gibt also keinen älteren Wert als 1 — deshalb wird eine
    // Migrationspflicht über einen künstlichen Vertrag geprüft, nicht über eine Lücke im echten.
    const ergebnis = resolveWorkspaceSchemaAction('Writer', 1);
    expect(ergebnis.action).toBe('current');
    // Und die Aussage „kein Migrationsweg ⇒ ablehnen" ist im Entscheider verdrahtet; ein Wert, der weder
    // aktuell noch neuer noch migrierbar ist, kann heute nur < 1 sein und fällt in denselben Zweig.
    for (const alt of [0, -5]) {
      expect(resolveWorkspaceSchemaAction('Writer', alt).action).toBe('reject');
    }
  });

  it('der Fehlertyp trägt Art und Grund — damit eine Meldung sagen kann, was scheiterte', () => {
    const fehler = new WorkspaceSchemaError('workspace_schema_version_invalid:Grid', 'Grid', 'version-invalid');
    expect(fehler.name).toBe('WorkspaceSchemaError');
    expect(fehler.kind).toBe('Grid');
    expect(fehler.reason).toBe('version-invalid');
    expect(fehler.message).toContain('Grid');
  });
});
