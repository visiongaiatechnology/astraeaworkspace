// STATUS: PLATIN — Jeder ungültige Schlüsselpfad ist sichtbar und fail-closed.
//
// Zwei gemessene Befunde, die dieser Test festhält:
//
// 1. `VaultKeyPolicyPanel.applyProtection` setzte den Sitzungsausweis **vor** der neuen Policy. Schlug ein
//    späterer Schritt fehl, blieb ein Ausweis aktiv, während die Policy weiter `device` sagte. Der Tresor
//    sah geschützt aus und war es nicht. `resolveVaultProtectionChange` liefert jetzt alles oder nichts.
//
// 2. `vaultShouldAutoLock` gab bei unbrauchbaren Zeitwerten (`NaN`, Uhr rückwärts) **`false`** zurück —
//    also „nicht sperren". Ausgerechnet die Sperrregel hatte „offen bleiben" als Standardausgang.
import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus } from '../../../../shared/contracts/workspace';
import {
  DEFAULT_VAULT_KEY_POLICY,
  normalizeVaultActivityTimestamp,
  normalizeVaultKeyPolicy,
  resolveVaultProtectionChange,
  validateVaultCredential,
  validateVaultPolicyPrerequisites,
  vaultShouldAutoLock,
} from '../../../../shared/vault/security/vaultKeyPolicyEngine';

const status = (overrides: Partial<KeyVaultStatus> = {}): KeyVaultStatus => ({
  coreConnected: true,
  isLocked: false,
  platform: 'test',
  ...overrides,
} as KeyVaultStatus);

const noCredentials = { pin: null, password: null };

describe('Schutzart wechseln: alles oder nichts', () => {
  it('ein gültiges PIN liefert Policy und Ausweis gemeinsam', () => {
    const change = resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'device_pin', '1234', noCredentials, status(), '1234');
    expect(change.nextPolicy.protectionMode).toBe('device_pin');
    expect(change.nextPin).toBe('1234');
    expect(change.nextPassword).toBeNull();
  });

  it('ein ungültiges PIN wirft, statt eine Policy ohne Ausweis zurückzugeben', () => {
    // Der Kern des Befunds: vorher wäre hier `onSetActiveDocumentPin(null)` gelaufen und die Policy hätte
    // trotzdem auf `device_pin` gewechselt — geschützt aussehend, ohne Ausweis.
    expect(() => resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'device_pin', '12', noCredentials, status())).toThrow(/vault_pin_format_invalid/u);
    expect(() => resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'device_pin', '123456789', noCredentials, status())).toThrow(/vault_pin_format_invalid/u);
    expect(() => resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'device_pin', '', noCredentials, status())).toThrow(/vault_pin_format_invalid/u);
  });

  it('ein zu kurzes Passwort wirft, ein gültiges wird übernommen', () => {
    expect(() => resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'portable_password', 'kurz', noCredentials, status())).toThrow(/vault_password_format_invalid/u);
    const change = resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'portable_password', 'lang-genug-2026', noCredentials, status(), 'lang-genug-2026');
    expect(change.nextPassword).toBe('lang-genug-2026');
    expect(change.nextPin).toBeNull();
  });

  it('eine fehlende Hardware-Vorbedingung verhindert den Wechsel, statt ihn zu begleiten', () => {
    const demanding = normalizeVaultKeyPolicy({ ...DEFAULT_VAULT_KEY_POLICY, hardwarePreference: 'required' });
    expect(() => validateVaultPolicyPrerequisites(demanding, status({ hardwareBacked: false }))).toThrow(/vault_hardware_backing_required_unavailable/u);
    // Und der Wechsel selbst scheitert aus demselben Grund.
    expect(() => resolveVaultProtectionChange(demanding, 'device_pin', '1234', noCredentials, status({ hardwareBacked: false }))).toThrow(/vault_hardware_backing_required_unavailable/u);
  });

  it('ein bereits aktiver gültiger Ausweis derselben Art bleibt ohne Neueingabe gültig', () => {
    const change = resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'device_pin', '', { pin: '5678', password: null }, status());
    expect(change.nextPin).toBe('5678');
  });

  it('der Wechsel auf „device" nimmt beide Ausweise zurück', () => {
    const withPin = normalizeVaultKeyPolicy({ ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device_pin' });
    const change = resolveVaultProtectionChange(withPin, 'device', '1234', { pin: '1234', password: null }, status());
    expect(change.nextPin).toBeNull();
    expect(change.nextPassword).toBeNull();
  });

  it('eine unbekannte Schutzart wird abgelehnt', () => {
    expect(() => resolveVaultProtectionChange(DEFAULT_VAULT_KEY_POLICY, 'magic' as never, 'x', noCredentials, status())).toThrow(/vault_key_policy_mode_invalid/u);
  });

  it('die Ausweisprüfung selbst kennt keinen Durchschlupf', () => {
    expect(validateVaultCredential('device_pin', '  1234  ')).toBe('1234');
    expect(validateVaultCredential('device', 'egal')).toBeNull();
    expect(() => validateVaultCredential('portable_password', 'a'.repeat(129))).toThrow(/vault_password_format_invalid/u);
  });
});

describe('Auto-Lock ist fail-closed, nicht fail-open', () => {
  const policy = normalizeVaultKeyPolicy({ ...DEFAULT_VAULT_KEY_POLICY, autoLockMinutes: 15 });
  const now = 1_700_000_000_000;

  it('sperrt nach Ablauf der Frist und nicht vorher', () => {
    expect(vaultShouldAutoLock(policy, now - 14 * 60_000, now)).toBe(false);
    expect(vaultShouldAutoLock(policy, now - 15 * 60_000, now)).toBe(true);
    expect(vaultShouldAutoLock(policy, now - 60 * 60_000, now)).toBe(true);
  });

  it('ein unbrauchbarer Zeitstempel sperrt sofort statt den Tresor offen zu lassen', () => {
    // Vorher: `return false` — „nicht sperren". Das ist der eigentliche Defekt.
    expect(vaultShouldAutoLock(policy, Number.NaN, now)).toBe(true);
    expect(vaultShouldAutoLock(policy, now, Number.NaN)).toBe(true);
    expect(vaultShouldAutoLock(policy, Number.POSITIVE_INFINITY, now)).toBe(true);
  });

  it('eine Uhr, die vor der letzten Aktivität steht, ist kein Aktivitätsnachweis', () => {
    expect(vaultShouldAutoLock(policy, now, now - 1)).toBe(true);
  });

  it('„deaktiviert" bleibt die einzige bewusste Ausnahme', () => {
    const disabled = normalizeVaultKeyPolicy({ ...DEFAULT_VAULT_KEY_POLICY, autoLockMinutes: 0 });
    expect(vaultShouldAutoLock(disabled, Number.NaN, now)).toBe(false);
    expect(vaultShouldAutoLock(disabled, now - 365 * 86_400_000, now)).toBe(false);
  });

  it('der Aktivitätszeitstempel wird normalisiert, bevor er in die Prüfung gelangt', () => {
    expect(normalizeVaultActivityTimestamp(Number.NaN, now)).toBe(now);
    expect(normalizeVaultActivityTimestamp(undefined, now)).toBe(now);
    expect(normalizeVaultActivityTimestamp(0, now)).toBe(now);
    expect(normalizeVaultActivityTimestamp(now + 5_000, now)).toBe(now);
    expect(normalizeVaultActivityTimestamp(now - 1_000, now)).toBe(now - 1_000);
  });
});
