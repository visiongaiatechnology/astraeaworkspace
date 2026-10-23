// STATUS: PLATIN — Kennwortbestätigung bei der ersten Vergabe (V-011).
//
// **Der Befund:** Der Vault fragte ein portables Kennwort **einmal** ab. `vaultRecoveryExplanation` sagt
// selbst, dass der Tresor ohne dieses Kennwort (oder ein unabhängig erzeugtes Backup) **dauerhaft unlesbar**
// bleibt und dass es keinen universellen Wiederherstellungsschlüssel gibt. Ausgerechnet der einzige
// unwiderrufliche Vorgang im Tresor hatte **keine** Wiederholungseingabe: ein Tippfehler ist dort nicht
// korrigierbar, es gibt keinen zweiten Versuch und keine Wiederherstellung.
//
// **Zwei Zusicherungen, die der Auftrag verlangt hat:**
//   1. Die Bestätigung wird **verglichen** — eine abweichende zweite Eingabe wird abgelehnt, statt sie nur
//      abzufragen.
//   2. Die Ablehnung ist **sichtbar und benannt** — nicht ein gesperrter Knopf und kein stiller Nichtvorgang.
//      `resolveVaultProtectionChange` wirft deshalb einen benannten Fehler, den die Oberfläche als Meldung
//      zeigt; der Knopf bleibt bedienbar, damit der Grund überhaupt erscheinen kann.
//
// **Und die Grenze, ehrlich benannt:** Ein **identischer** Tippfehler in beiden Feldern besteht jeden
// Vergleich — kein Vergleich der Welt kann ihn fangen, weil beide Eingaben gleich sind. Die Bestätigung
// verhindert die **Abweichung**, nicht die Absicht. Was dagegen hilft, steht als Warnung im Panel und ist
// hier ebenfalls gepinnt: es gibt keinen universellen Wiederherstellungsschlüssel, und ohne unabhängiges
// Backup bleibt der Tresor unlesbar.
import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus, VaultKeyPolicyModel } from '../../../../shared/contracts/workspace';
import {
  DEFAULT_VAULT_KEY_POLICY,
  resolveVaultProtectionChange,
  validateVaultCredentialConfirmation,
} from '../../../../shared/vault/security/vaultKeyPolicyEngine';

const status: KeyVaultStatus = { coreConnected: false, isLocked: false, platform: 'browser' } as KeyVaultStatus;
const policy: VaultKeyPolicyModel = { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device', hardwarePreference: 'available' };
const noCredential = { pin: null, password: null };
const PASSWORD = 'korrekte-pferde-batterie';
const PIN = '4821';

describe('Der Vergleich: eine abweichende zweite Eingabe wird abgelehnt', () => {
  it('ohne zweite Eingabe wird abgelehnt — die Bestätigung ist Pflicht', () => {
    expect(() => validateVaultCredentialConfirmation('portable_password', PASSWORD, '', false))
      .toThrow('vault_credential_confirmation_required');
    expect(() => validateVaultCredentialConfirmation('device_pin', PIN, '   ', false))
      .toThrow('vault_credential_confirmation_required');
  });

  it('eine abweichende zweite Eingabe wird als Abweichung gemeldet', () => {
    expect(() => validateVaultCredentialConfirmation('portable_password', PASSWORD, 'korrekte-pferde-baterie', false))
      .toThrow('vault_credential_confirmation_mismatch');
    // Auch ein Unterschied um ein Zeichen.
    expect(() => validateVaultCredentialConfirmation('device_pin', '4821', '4822', false))
      .toThrow('vault_credential_confirmation_mismatch');
  });

  it('eine übereinstimmende zweite Eingabe wird angenommen und der geprüfte Wert zurückgegeben', () => {
    expect(validateVaultCredentialConfirmation('portable_password', PASSWORD, PASSWORD, false)).toBe(PASSWORD);
    // Ein PIN wird getrimmt verglichen (er ist numerisch) …
    expect(validateVaultCredentialConfirmation('device_pin', '4821', ' 4821 ', false)).toBe(PIN);
    // … ein Kennwort **nicht**: Leerzeichen können Teil des Geheimnisses sein. Gemessen: führende und
    // nachfolgende Leerzeichen werden vom Formatprüfer entfernt, ein Leerzeichen **im** Kennwort bleibt.
    expect(validateVaultCredentialConfirmation('portable_password', 'zwei worte geheim', 'zwei worte geheim', false))
      .toBe('zwei worte geheim');
  });

  it('ein formal ungültiges Kennwort fällt auf die Formatprüfung zurück, nicht auf die Bestätigung', () => {
    // Reihenfolge ist die Regel: erst Format, dann Bestätigung. Sonst bekäme der Nutzer bei einem zu kurzen
    // Kennwort die Meldung „stimmt nicht überein", obwohl das eigentliche Problem die Länge ist.
    expect(() => validateVaultCredentialConfirmation('portable_password', 'kurz', 'kurz', false))
      .toThrow('vault_password_format_invalid');
    expect(() => validateVaultCredentialConfirmation('device_pin', '12', '12', false))
      .toThrow('vault_pin_format_invalid');
    expect(() => validateVaultCredentialConfirmation('device_pin', 'abcd', 'abcd', false))
      .toThrow('vault_pin_format_invalid');
  });

  it('bei bereits aktivem Ausweis entfällt die Bestätigung, das Format wird weiter geprüft', () => {
    // Beim bloßen Ändern der Auto-Lock-Zeit mit bestehendem Kennwort wäre eine Wiederholung lästig ohne Nutzen.
    expect(validateVaultCredentialConfirmation('portable_password', PASSWORD, '', true)).toBe(PASSWORD);
    // Aber ein neues, zu kurzes Kennwort wird auch dann nicht durchgelassen.
    expect(() => validateVaultCredentialConfirmation('portable_password', 'kurz', '', true))
      .toThrow('vault_password_format_invalid');
  });

  it('der Gerätemodus verlangt nie eine Bestätigung', () => {
    expect(validateVaultCredentialConfirmation('device', '', '', false)).toBe('');
    expect(validateVaultCredentialConfirmation('device', 'irgendwas', '', false)).toBe('');
  });
});

describe('Der Wechsel selbst ist fail-closed', () => {
  it('ohne Bestätigung wird **nichts** gesetzt und der Fehler ist benannt', () => {
    expect(() => resolveVaultProtectionChange(policy, 'portable_password', PASSWORD, noCredential, status, ''))
      .toThrow('vault_credential_confirmation_required');
    // Und der Wechsel mit Bestätigung liefert den vollständigen Ausweis.
    const change = resolveVaultProtectionChange(policy, 'portable_password', PASSWORD, noCredential, status, PASSWORD);
    expect(change.nextPolicy.protectionMode).toBe('portable_password');
    expect(change.nextPassword).toBe(PASSWORD);
    expect(change.nextPin).toBeNull();
  });

  it('die Vorbedingungen werden **vor** der Bestätigung geprüft', () => {
    // „Provider-bestätigte Hardware gefordert, aber nicht vorhanden" muss den Wechsel verhindern — und zwar
    // mit der richtigen Meldung, nicht mit „Bestätigung fehlt".
    const strict: VaultKeyPolicyModel = { ...policy, hardwarePreference: 'required' };
    expect(() => resolveVaultProtectionChange(strict, 'portable_password', PASSWORD, noCredential, status, PASSWORD))
      .toThrow(/hardware/u);
  });

  it('bei bereits aktivem Ausweis entfällt die Bestätigung **nur**, wenn nichts Neues eingegeben wird', () => {
    /*
     * **Korrigierte Erwartung (V-044).** Ich hatte hier geprüft, dass ein **neues** Kennwort ohne Bestätigung
     * durchgeht, weil ich „aktiver Ausweis" mit „keine Bestätigung nötig" gleichgesetzt hatte. Das war falsch:
     * wer ein neues Kennwort eingibt, **setzt** eines — und genau das muss bestätigt werden. Ohne neue Eingabe
     * (nur Auto-Lock ändern) entfällt die Bestätigung, und der aktive Ausweis bleibt.
     */
    const unchanged = resolveVaultProtectionChange(policy, 'portable_password', '', { pin: null, password: 'altes-kennwort' }, status, '');
    expect(unchanged.nextPassword).toBe('altes-kennwort');
    // Eine neue Eingabe ohne Bestätigung wird abgelehnt …
    expect(() => resolveVaultProtectionChange(policy, 'portable_password', PASSWORD, { pin: null, password: 'altes-kennwort' }, status, ''))
      .toThrow('vault_credential_confirmation_required');
    // … und mit Bestätigung wird sie gesetzt, nicht still verworfen.
    expect(resolveVaultProtectionChange(policy, 'portable_password', PASSWORD, { pin: null, password: 'altes-kennwort' }, status, PASSWORD).nextPassword)
      .toBe(PASSWORD);
  });

  it('ein unbekannter Modus wird abgelehnt', () => {
    expect(() => resolveVaultProtectionChange(policy, 'biometrie' as never, PASSWORD, noCredential, status, PASSWORD))
      .toThrow('vault_key_policy_mode_invalid');
  });
});

describe('Die Grenze des Vergleichs — festgehalten, nicht verschwiegen', () => {
  it('die Grenze ist keine Lücke, die man schließen könnte — sie wird benannt', () => {
    /*
     * Der Quellvertrag für die sichtbare Warnung steht in `vaultExportConsolidation.contract.test.mjs`
     * (dort, wo `node:fs` verfügbar ist). Hier bleibt die gemessene Grenze des Vergleichs selbst festgehalten:
     * sind beide Eingaben gleich, gibt es nichts zu vergleichen. Die Bestätigung fängt die **Abweichung**,
     * nicht die Absicht.
     */
    const typo = 'korrekte-pferde-baterie';
    expect(validateVaultCredentialConfirmation('portable_password', typo, typo, false)).toBe(typo);
  });
});
