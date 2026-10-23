// STATUS: PLATIN — Kennwortwechsel setzt wirklich das neue Kennwort (V-044).
//
// **Der Befund, den mein eigener Test gefunden hat:** `credentialsForProtectionMode` sah den Parameter
// `credential` **gar nicht an**, sobald ein Ausweis aktiv war. Damit war ein Kennwortwechsel unmöglich: der
// Nutzer tippte ein neues Kennwort, bestätigte es, die Oberfläche meldete Erfolg — und der Tresor behielt
// still das **alte**. Wer sich auf die Erfolgsmeldung verlässt und das alte Kennwort später vergisst, hat
// den Tresor dauerhaft unlesbar gemacht, **ohne je eine Warnung gesehen zu haben**. Das ist dieselbe
// Schadensklasse wie V-011, nur ohne Tippfehler.
//
// Diese Datei pinnt beide Richtungen: eine **neue** Eingabe gewinnt (sonst wäre der Wechsel wirkungslos), und
// eine **leere** Eingabe lässt den aktiven Ausweis bestehen (das war die eigentliche Absicht der alten Zeile —
// wer nur die Auto-Lock-Zeit ändert, soll sein Kennwort nicht erneut eingeben müssen).
import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus, VaultKeyPolicyModel } from '../../../../shared/contracts/workspace';
import { DEFAULT_VAULT_KEY_POLICY, resolveVaultProtectionChange } from '../../../../shared/vault/security/vaultKeyPolicyEngine';

const status: KeyVaultStatus = { coreConnected: false, isLocked: false, platform: 'browser' } as KeyVaultStatus;
const policy: VaultKeyPolicyModel = { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password', hardwarePreference: 'available' };
const ALT = 'altes-kennwort-1234';
const NEU = 'neues-kennwort-5678';

describe('V-044: eine neue Eingabe gewinnt gegen den aktiven Ausweis', () => {
  it('ein neues Kennwort wird tatsächlich gesetzt, nicht still verworfen', () => {
    // Das war der Fehler: das Ergebnis war `ALT`, obwohl `NEU` eingegeben und bestätigt wurde.
    const change = resolveVaultProtectionChange(policy, 'portable_password', NEU, { pin: null, password: ALT }, status, NEU);
    expect(change.nextPassword).toBe(NEU);
    expect(change.nextPassword).not.toBe(ALT);
  });

  it('ein neuer PIN wird ebenfalls tatsächlich gesetzt', () => {
    const pinPolicy: VaultKeyPolicyModel = { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device_pin', hardwarePreference: 'available' };
    const change = resolveVaultProtectionChange(pinPolicy, 'device_pin', '7788', { pin: '1122', password: null }, status, '7788');
    expect(change.nextPin).toBe('7788');
  });

  it('ein Kennwortwechsel verlangt eine Bestätigung, auch wenn schon eines aktiv ist', () => {
    // Vorher hing die Bestätigung allein an „kein Ausweis aktiv" — ein Wechsel wäre unbestätigt durchgelaufen.
    expect(() => resolveVaultProtectionChange(policy, 'portable_password', NEU, { pin: null, password: ALT }, status, ''))
      .toThrow('vault_credential_confirmation_required');
    expect(() => resolveVaultProtectionChange(policy, 'portable_password', NEU, { pin: null, password: ALT }, status, 'anderes-kennwort'))
      .toThrow('vault_credential_confirmation_mismatch');
  });

  it('eine leere Eingabe lässt den aktiven Ausweis unverändert — die eigentliche Absicht der alten Regel', () => {
    // Wer nur die Auto-Lock-Zeit ändert, soll sein Kennwort nicht erneut eingeben müssen.
    const change = resolveVaultProtectionChange(policy, 'portable_password', '', { pin: null, password: ALT }, status, '');
    expect(change.nextPassword).toBe(ALT);
  });

  it('ein neues, formal ungültiges Kennwort wird abgelehnt und überschreibt nichts', () => {
    // Gemessene Korrektur meiner Erwartung: der Formatprüfer greift **vor** der „Ausweis erforderlich"-Meldung,
    // der Fehler lautet hier also `vault_password_format_invalid` (nicht `vault_credential_required_…`).
    expect(() => resolveVaultProtectionChange(policy, 'portable_password', 'kurz', { pin: null, password: ALT }, status, 'kurz'))
      .toThrow('vault_password_format_invalid');
    // Und das aktive Kennwort bleibt unangetastet: es wurde nichts gesetzt.
    const unchanged = resolveVaultProtectionChange(policy, 'portable_password', '', { pin: null, password: ALT }, status, '');
    expect(unchanged.nextPassword).toBe(ALT);
  });

  it('der Wechsel auf „device" entfernt beide Ausweise, unabhängig von der Eingabe', () => {
    const change = resolveVaultProtectionChange(policy, 'device', NEU, { pin: '1122', password: ALT }, status, NEU);
    expect(change.nextPin).toBeNull();
    expect(change.nextPassword).toBeNull();
    expect(change.nextPolicy.protectionMode).toBe('device');
  });

  it('ein Wechsel zwischen den Ausweisarten gibt genau einen Ausweis zurück', () => {
    const fromPin = resolveVaultProtectionChange(
      { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device_pin', hardwarePreference: 'available' },
      'portable_password', NEU, { pin: '1122', password: null }, status, NEU,
    );
    expect(fromPin.nextPin).toBeNull();
    expect(fromPin.nextPassword).toBe(NEU);
  });
});
