// STATUS: PLATIN — Grenzen eines Vault-Imports: eine Autorität, ablehnen statt kürzen.
//
// Was dieser Test festhält: Vor der Änderung gab es **zwei** Obergrenzen für denselben Importpfad
// (`MAX_VAULT_ATTACHMENT_BYTES` = 25 MiB in `integrity/vaultIntegrity.ts`,
// `MAX_IMPORT_BYTES` = 128 MiB in `preview/vaultPreviewQuarantineEngine.ts`). Beide wurden angewendet.
// Ein 40-MiB-Anhang passierte die Quarantäne-Prüfung als „innerhalb der Grenzen" und wurde erst danach
// mit einer anderen Begründung verworfen.
//
// Der Test prüft deshalb nicht nur, **dass** abgelehnt wird, sondern dass die Grenze **eine** ist und dass
// die Ablehnung den Grund benennt. Ein Test, der nur „wirft irgendwie" prüft, hätte die Doppelung nicht
// bemerkt — beide Fassungen warfen ja.
import { describe, expect, it } from 'vitest';
import {
  assertVaultImportWithinLimits,
  VAULT_IMPORT_LIMITS,
  VAULT_IMPORT_MAX_FILE_BYTES,
  VAULT_IMPORT_MAX_FILES,
  VAULT_IMPORT_MAX_NAME_LENGTH,
  VAULT_IMPORT_MAX_TOTAL_BYTES,
  VaultImportLimitError,
  vaultImportLimitMessage,
  vaultImportUsage,
  MAX_VAULT_ATTACHMENT_BYTES,
} from '../../../../shared/vault/integrity/vaultIntegrity';

const candidate = (name: string, sizeBytes: number) => ({ name, sizeBytes });

describe('Vault-Import: es gilt genau eine Byte-Grenze', () => {
  it('die Importgrenze und die Anhangsgrenze sind derselbe Wert', () => {
    // Das ist der eigentliche Befund als Zusicherung: zwei Zahlen für eine Tatsache waren der Defekt.
    expect(VAULT_IMPORT_MAX_FILE_BYTES).toBe(MAX_VAULT_ATTACHMENT_BYTES);
    expect(VAULT_IMPORT_LIMITS.maxFileBytes).toBe(VAULT_IMPORT_MAX_FILE_BYTES);
  });

  it('die Quarantäne-Prüfung liest dieselbe Grenze wie die Importprüfung', async () => {
    // Gegenprobe gegen die zweite Implementierung: `inspectVaultIncomingFile` muss eine Datei, die
    // oberhalb der **einen** Grenze liegt, als außerhalb der Grenzen melden.
    const { inspectVaultIncomingFile } = await import('../../../../shared/vault/preview/vaultPreviewQuarantineEngine');
    const adapters = {
      inspectPdf: async () => ({ pageCount: 1, hasJavaScriptActions: false, firstPageText: '', externalLinkCount: 0 }),
      inspectOffice: async () => ({ kind: 'Writer', title: 'x' }),
    };
    const oversized = { name: 'gross.bin', type: 'application/octet-stream', size: VAULT_IMPORT_MAX_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
    const inspection = await inspectVaultIncomingFile(oversized, adapters);
    expect(inspection.quarantine).toBe(true);
    expect(inspection.reason).toContain('bounds');
  });
});

describe('Vault-Import: Grenzen werden geprüft, bevor etwas gelesen wird', () => {
  it('ein einzelner Anhang oberhalb der Byte-Grenze wird abgelehnt und benennt die Grenze', () => {
    let thrown: unknown;
    try {
      assertVaultImportWithinLimits([candidate('gross.bin', VAULT_IMPORT_MAX_FILE_BYTES + 1)]);
    } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(VaultImportLimitError);
    expect((thrown as VaultImportLimitError).violation).toBe('file_bytes');
    expect((thrown as Error).message).toContain('vault_import_file_bytes');
    // Die Meldung nennt die Zahl, nicht nur „zu groß": sonst ist die Grenze für den Nutzer nicht prüfbar.
    expect(vaultImportLimitMessage('file_bytes')).toContain('25 MiB');
  });

  it('genau an der Grenze wird akzeptiert — die Grenze ist inklusiv, nicht „fast"', () => {
    const plan = assertVaultImportWithinLimits([candidate('genau.bin', VAULT_IMPORT_MAX_FILE_BYTES)]);
    expect(plan.fileCount).toBe(1);
    expect(plan.totalBytes).toBe(VAULT_IMPORT_MAX_FILE_BYTES);
  });

  it('ein Stapel oberhalb der Anzahlgrenze wird vollständig abgelehnt, nicht teilweise importiert', () => {
    const tooMany = Array.from({ length: VAULT_IMPORT_MAX_FILES + 1 }, (_, index) => candidate(`f${index}.bin`, 1));
    expect(() => assertVaultImportWithinLimits(tooMany)).toThrow(/vault_import_count/u);
    // Gegenprobe: exakt die Grenze ist zulässig.
    expect(assertVaultImportWithinLimits(tooMany.slice(0, VAULT_IMPORT_MAX_FILES)).fileCount).toBe(VAULT_IMPORT_MAX_FILES);
  });

  it('ein Stapel oberhalb der Summengrenze wird abgelehnt, obwohl jede Datei einzeln zulässig ist', () => {
    const perFile = VAULT_IMPORT_MAX_FILE_BYTES;
    const count = Math.ceil(VAULT_IMPORT_MAX_TOTAL_BYTES / perFile) + 1;
    const batch = Array.from({ length: count }, (_, index) => candidate(`f${index}.bin`, perFile));
    expect(batch.every((item) => item.sizeBytes <= VAULT_IMPORT_MAX_FILE_BYTES)).toBe(true);
    expect(() => assertVaultImportWithinLimits(batch)).toThrow(/vault_import_total_bytes/u);
  });

  it('ein zu langer Name wird abgelehnt statt still gekürzt', () => {
    const longName = `${'a'.repeat(VAULT_IMPORT_MAX_NAME_LENGTH)}.bin`;
    expect(longName.length).toBeGreaterThan(VAULT_IMPORT_MAX_NAME_LENGTH);
    expect(() => assertVaultImportWithinLimits([candidate(longName, 8)])).toThrow(/vault_import_name/u);
    // Genau an der Grenze zulässig.
    const exact = 'a'.repeat(VAULT_IMPORT_MAX_NAME_LENGTH);
    expect(assertVaultImportWithinLimits([candidate(exact, 8)]).fileCount).toBe(1);
  });

  it('ein leerer Stapel und eine leere Datei sind Fehler, keine stillen Erfolge', () => {
    expect(() => assertVaultImportWithinLimits([])).toThrow(/vault_import_empty_batch/u);
    expect(() => assertVaultImportWithinLimits([candidate('leer.bin', 0)])).toThrow(/vault_import_empty_file/u);
    expect(() => assertVaultImportWithinLimits([candidate('negativ.bin', -1)])).toThrow(/vault_import_empty_file/u);
    expect(() => assertVaultImportWithinLimits([candidate('krumm.bin', 1.5)])).toThrow(/vault_import_empty_file/u);
  });

  it('die Belegung wird ohne Bytes zu kopieren zusammengefasst', () => {
    expect(vaultImportUsage([{ sizeBytes: 10 } as never, { sizeBytes: 5 } as never, {} as never])).toEqual({ count: 3, bytes: 15 });
  });
});
