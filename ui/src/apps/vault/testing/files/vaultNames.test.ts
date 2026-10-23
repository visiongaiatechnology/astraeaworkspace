// STATUS: PLATIN — eine Autorität für Vault-Namen, beide Wege geprüft (V-004).
//
// **Der Befund (gemessen):** Auf dieselbe Frage gab es **zwei** Antworten mit verschiedenem **Verhalten**:
// `assertVaultImportWithinLimits` lehnte einen Namen über 240 Zeichen **ab**, `normalizedName` **kürzte
// still** auf 240. Ein 300 Zeichen langer Importname scheiterte, ein ebenso langer Ordnername wurde klaglos
// zu einem **anderen** Namen. Der Auftrag ist an dieser Stelle eindeutig — **ablehnen statt still kürzen** —,
// und zwei Regeln für eine Frage sind die Doppelung, die dieses Projekt mehrfach bezahlt hat.
//
// Deshalb prüft diese Datei **beide Wege gegen dieselbe Funktion**. Ein Test, der nur einen Weg prüft,
// hätte die Divergenz nicht gefunden — genau das war der Zustand vorher.
import { describe, expect, it } from 'vitest';
import {
  assertVaultNameUsable,
  checkVaultName,
  VAULT_MAX_NAME_LENGTH,
  vaultNameErrorMessage,
  vaultNameInputMaxLength,
  VaultNameError,
} from '../../../../shared/vault/files/vaultNames';
import { createVaultFolder } from '../../../../shared/vault/files/vaultFileSystemEngine';
import { assertVaultImportWithinLimits, VAULT_IMPORT_MAX_NAME_LENGTH, VaultImportLimitError } from '../../../../shared/vault/integrity/vaultIntegrity';

const NOW = 1_700_000_000_000;

describe('Die Grenze ist genau eine', () => {
  it('beide Wege benutzen denselben Zahlenwert', () => {
    expect(VAULT_MAX_NAME_LENGTH).toBe(VAULT_IMPORT_MAX_NAME_LENGTH);
    expect(vaultNameInputMaxLength()).toBe(VAULT_MAX_NAME_LENGTH);
    expect(VAULT_MAX_NAME_LENGTH).toBe(240);
  });

  it('**beide** Wege lehnen an derselben Stelle ab — das war der Befund', () => {
    const atLimit = 'a'.repeat(VAULT_MAX_NAME_LENGTH);
    const overLimit = 'a'.repeat(VAULT_MAX_NAME_LENGTH + 1);

    // Weg 1: Ordner. Vorher wurde hier **gekürzt**.
    expect(createVaultFolder(atLimit, null, NOW).name).toHaveLength(VAULT_MAX_NAME_LENGTH);
    expect(() => createVaultFolder(overLimit, null, NOW)).toThrow('vault_name_too_long');

    // Weg 2: Import. Lehnte schon vorher ab — jetzt mit derselben Grenze und demselben Grund.
    expect(() => assertVaultImportWithinLimits([{ name: atLimit, sizeBytes: 10 }])).not.toThrow();
    expect(() => assertVaultImportWithinLimits([{ name: overLimit, sizeBytes: 10 }])).toThrow(VaultImportLimitError);
  });
});

describe('Abgelehnt wird benannt und begründet', () => {
  it('jede Unbrauchbarkeit hat einen eigenen Grund und Satz', () => {
    expect(checkVaultName('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkVaultName('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkVaultName('.')).toMatchObject({ ok: false, reason: 'dot' });
    expect(checkVaultName('..')).toMatchObject({ ok: false, reason: 'dotdot' });
    expect(checkVaultName('mit\u0000steuerzeichen')).toMatchObject({ ok: false, reason: 'control_characters' });
    expect(checkVaultName('a'.repeat(241))).toMatchObject({ ok: false, reason: 'too_long' });
    // Und ein Nicht-String ist kein Name.
    expect(checkVaultName(undefined)).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkVaultName(42)).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('der Ablehnungstext sagt ausdrücklich, dass NICHT gekürzt wurde', () => {
    // Der Nutzer muss erfahren, dass sein Name nicht angenommen wurde — nicht, dass er verändert wurde.
    const message = vaultNameErrorMessage('too_long');
    expect(message).toContain('240');
    expect(message).toContain('not shortened');
    expect(message).toContain('a shortened name is a different name');
  });

  it('`assertVaultNameUsable` wirft benannt und gibt sonst den bereinigten Namen zurück', () => {
    expect(assertVaultNameUsable('  Bericht  ')).toBe('Bericht');
    let thrown: unknown;
    try { assertVaultNameUsable('a'.repeat(241)); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(VaultNameError);
    expect((thrown as VaultNameError).reason).toBe('too_long');
    expect((thrown as VaultNameError).message).toContain('vault_name_too_long');
  });

  it('ein Name in der Mitte der Grenze wird nicht angetastet', () => {
    // Gegenprobe gegen eine versehentlich zu strenge Regel: ein normaler Name bleibt genau wie eingegeben.
    expect(assertVaultNameUsable('Quartalsbericht 2026')).toBe('Quartalsbericht 2026');
    expect(createVaultFolder('Quartalsbericht 2026', null, NOW).name).toBe('Quartalsbericht 2026');
  });

  it('ein unbrauchbarer Name fällt auf den Vorgabenamen zurück — das ist keine Kürzung', () => {
    // „leer" ist kein zu langer Name: hier ist der Vorgabename der einzig sinnvolle Wert.
    expect(createVaultFolder('', null, NOW).name).toBe('New Folder');
    expect(createVaultFolder('..', null, NOW).name).toBe('New Folder');
  });
});
