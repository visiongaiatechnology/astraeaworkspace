// STATUS: PLATIN — Regression guard for the native chunk crash (2026-10-18).
//
// NATIVE BEFUND: Beim Öffnen eines Grid-Dokuments zeigte die ausgelieferte App sofort
// "Modul wurde sicher angehalten". Das Diagnoseprotokoll nannte:
//
//   ReferenceError: Cannot access 'g' before initialization
//   at .../assets/vaultIntegrity-DJRP_DB-.js:1:173
//
// Ursache: ein Import-Zyklus `vaultIntegrity` → `vaultFileSystemEngine` → `vaultNames` →
// `vaultIntegrity`. Rollup ordnete im gemeinsamen Chunk `vaultNames` **vor** der Konstanten-
// definition von `vaultIntegrity` ein; die Temporal-Dead-Zone traf damit jeden Grid-Start.
// Im Dev-ESM fiel der Fehler nicht auf, weil dort die Modulreihenfolge zufällig gültig ist.
//
// Der Guard prüft beide Richtungen: die Wert-Autorität liegt im Blatt-Modul, und das
// Blatt-Modul importiert nichts mehr aus `integrity`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VAULT_MAX_NAME_LENGTH } from '../files/vaultNames';
import { VAULT_IMPORT_MAX_NAME_LENGTH } from '../integrity/vaultIntegrity';

const NAMES = 'src/shared/vault/files/vaultNames.ts';
const INTEGRITY = 'src/shared/vault/integrity/vaultIntegrity.ts';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

describe('Vault-Namensgrenze: kein Import-Zyklus mehr (nativer Grid-Crash)', () => {
  it('die Wert-Autorität liegt in vaultNames und importiert nichts aus integrity', () => {
    const names = stripComments(readFileSync(NAMES, 'utf8'));
    expect(names, 'die Grenze ist eine Konstante im Blatt-Modul').toContain('export const VAULT_MAX_NAME_LENGTH = 240');
    expect(names, 'kein Rückimport aus integrity — das schloss den Zyklus').not.toContain("integrity/vaultIntegrity");
  });

  it('vaultIntegrity re-exportiert den Wert unter dem öffentlichen Namen', () => {
    const integrity = stripComments(readFileSync(INTEGRITY, 'utf8'));
    expect(integrity).toContain("import { VAULT_MAX_NAME_LENGTH } from '../files/vaultNames'");
    expect(integrity).toContain('export const VAULT_IMPORT_MAX_NAME_LENGTH = VAULT_MAX_NAME_LENGTH');
  });

  it('beide öffentlichen Namen liefern denselben Wert', () => {
    expect(VAULT_MAX_NAME_LENGTH).toBe(240);
    expect(VAULT_IMPORT_MAX_NAME_LENGTH).toBe(VAULT_MAX_NAME_LENGTH);
  });
});
