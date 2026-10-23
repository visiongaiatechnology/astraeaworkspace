import type { KeyVaultStatus, VaultAutoLockMinutes, VaultKeyPolicyModel, VaultProtectionMode } from '../../contracts/workspace';
import { compareVaultCredentials } from './vaultCredentialComparison';

export const DEFAULT_VAULT_KEY_POLICY: VaultKeyPolicyModel = Object.freeze({
  version: 1,
  encryptionRequired: true,
  protectionMode: 'device',
  autoLockMinutes: 15,
  keyGeneration: 1,
  hardwarePreference: 'available',
  recoveryPolicy: 'no_universal_recovery',
});

const AUTO_LOCK_VALUES = new Set<number>([0, 1, 5, 15, 30, 60]);
const PROTECTION_MODES = new Set<VaultProtectionMode>(['device', 'device_pin', 'portable_password']);

/**
 * Die Laengengrenzen eines portablen Kennworts.
 *
 * **Warum sie hier stehen und nicht zweimal:** `VAULT_CREDENTIAL_MAXIMUM_LENGTH` ist zugleich die
 * Schleifenschranke des zeitkonstanten Vergleichs. Waere die Grenze an einer Stelle als `128` und an der
 * anderen als Zahl im Vergleichstext hinterlegt, koennte ein spaeteres Anheben der Grenze die Schranke
 * zuruecklassen — und `compareVaultCredentials` muesste dann ueber die Laengenuntergrenze laufen, womit die
 * Schrittzahl wieder von der Laenge des Geheimnisses abhinge. Eine Konstante, zwei Verwendungen, kein Drift.
 */
export const VAULT_CREDENTIAL_MINIMUM_LENGTH = 8;
export const VAULT_CREDENTIAL_MAXIMUM_LENGTH = 128;

function boundedGeneration(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 1_000_000
    ? Number(value)
    : 1;
}

export function normalizeVaultKeyPolicy(input?: Partial<VaultKeyPolicyModel> | null): VaultKeyPolicyModel {
  const protectionMode = input?.protectionMode && PROTECTION_MODES.has(input.protectionMode)
    ? input.protectionMode
    : DEFAULT_VAULT_KEY_POLICY.protectionMode;
  const autoLockMinutes = AUTO_LOCK_VALUES.has(Number(input?.autoLockMinutes))
    ? Number(input?.autoLockMinutes) as VaultAutoLockMinutes
    : DEFAULT_VAULT_KEY_POLICY.autoLockMinutes;
  return {
    version: 1,
    encryptionRequired: true,
    protectionMode,
    autoLockMinutes,
    keyGeneration: boundedGeneration(input?.keyGeneration),
    lastRekeyAt: Number.isSafeInteger(input?.lastRekeyAt) && Number(input?.lastRekeyAt) > 0 ? Number(input?.lastRekeyAt) : undefined,
    hardwarePreference: input?.hardwarePreference === 'required' ? 'required' : 'available',
    recoveryPolicy: 'no_universal_recovery',
  };
}

export function updateVaultProtectionMode(policy: VaultKeyPolicyModel, mode: VaultProtectionMode): VaultKeyPolicyModel {
  if (!PROTECTION_MODES.has(mode)) throw new Error('vault_key_policy_mode_invalid');
  return { ...normalizeVaultKeyPolicy(policy), protectionMode: mode };
}

export function updateVaultAutoLock(policy: VaultKeyPolicyModel, minutes: number): VaultKeyPolicyModel {
  if (!AUTO_LOCK_VALUES.has(minutes)) throw new Error('vault_auto_lock_value_invalid');
  return { ...normalizeVaultKeyPolicy(policy), autoLockMinutes: minutes as VaultAutoLockMinutes };
}

export function markVaultRekeySucceeded(policy: VaultKeyPolicyModel, at: number): VaultKeyPolicyModel {
  if (!Number.isSafeInteger(at) || at <= 0) throw new Error('vault_rekey_timestamp_invalid');
  const current = normalizeVaultKeyPolicy(policy);
  if (current.keyGeneration >= 1_000_000) throw new Error('vault_key_generation_limit');
  return { ...current, keyGeneration: current.keyGeneration + 1, lastRekeyAt: at };
}

/**
 * Bestätigt ein Kennwort/ein PIN bei der **ersten** Vergabe — fail-closed (V-011).
 *
 * **Der Befund:** Der Vault fragte ein portables Kennwort **einmal** ab. Ein Tippfehler ist dort nicht
 * korrigierbar: `vaultRecoveryExplanation` sagt selbst, dass der Tresor ohne das Kennwort (oder ein
 * unabhängig erzeugtes Backup) **dauerhaft unlesbar** bleibt und dass es keinen universellen
 * Wiederherstellungsschlüssel gibt. Ausgerechnet dieser eine, unwiderrufliche Vorgang hatte keine
 * Wiederholungseingabe.
 *
 * Die Regel fragt nur bei der **ersten** Vergabe (also wenn noch kein Ausweis aktiv ist) — beim bloßen
 * Ändern der Auto-Lock-Zeit mit bereits aktivem Ausweis wäre die Wiederholung lästig ohne Nutzen.
 */
export function validateVaultCredentialConfirmation(
  mode: VaultProtectionMode,
  credential: string,
  confirmation: string,
  hasActiveCredential: boolean,
): string {
  if (mode === 'device') return '';
  const accepted = validateVaultCredential(mode, credential);
  if (!accepted) throw new Error(mode === 'device_pin' ? 'vault_pin_format_invalid' : 'vault_password_format_invalid');
  if (hasActiveCredential) return accepted;
  if (typeof confirmation !== 'string' || confirmation.trim().length === 0) {
    throw new Error('vault_credential_confirmation_required');
  }
  // Für ein PIN ist der Vergleich nach dem Trimmen richtig (er ist numerisch); für ein Kennwort gilt die
  // exakte Eingabe, weil Leerzeichen Teil des Geheimnisses sein können.
  //
  // Der Vergleich läuft zeitkonstant (Regel: „in jedem Zweig"). Hier ist der erwartete Wert die eigene
  // Ersteingabe desselben Vorgangs — es gibt also kein Geheimnis zu extrahieren. Die Umstellung ist
  // Regelkonformität, nicht die Schliessung eines belegten Kanals; das ist der Unterschied, den dieser
  // Kommentar festhält.
  const candidate = mode === 'device_pin' ? confirmation.trim() : confirmation;
  const matches = compareVaultCredentials(candidate, accepted, VAULT_CREDENTIAL_MAXIMUM_LENGTH).equal;
  if (!matches) throw new Error('vault_credential_confirmation_mismatch');
  return accepted;
}

export interface VaultProtectionChange {
  nextPolicy: VaultKeyPolicyModel;
  /** Der Sitzungsausweis, der zu `nextPolicy` gehört: nur einer der beiden ist je gesetzt. */
  nextPin: string | null;
  nextPassword: string | null;
}

function credentialsForProtectionMode(
  mode: VaultProtectionMode,
  credential: string | null | undefined,
  alreadyActive: { pin: string | null; password: string | null },
): { pin: string | null; password: string | null } {
  if (mode === 'device') return { pin: null, password: null };
  const active = mode === 'device_pin' ? alreadyActive.pin : alreadyActive.password;
  /**
   * **Befund + Fix (V-044, Runde 83d):** Hier stand zuerst „ein bereits aktiver Ausweis gewinnt" — der
   * Parameter `credential` wurde bei aktivem Ausweis **gar nicht angesehen**. Damit war ein
   * Kennwortwechsel unmöglich: der Nutzer tippte ein neues Kennwort (und bestätigte es), die Oberfläche
   * meldete Erfolg, und der Tresor behielt still das **alte**. Wer sich auf die Bestätigung verlässt und das
   * alte Kennwort später vergisst, hat den Tresor dauerhaft unlesbar gemacht, ohne je eine Warnung gesehen
   * zu haben — dieselbe Schadensklasse wie V-011, aber ohne Tippfehler.
   *
   * Jetzt gilt: eine **angegebene** Eingabe schlägt den aktiven Ausweis. Nur wenn der Nutzer nichts eingibt
   * (er ändert z. B. nur die Auto-Lock-Zeit), bleibt der aktive Ausweis bestehen — das war die eigentliche
   * Absicht der alten Zeile.
   */
  if (typeof credential === 'string' && credential.length > 0) {
    const acceptedNew = validateVaultCredential(mode, credential);
    if (!acceptedNew) throw new Error('vault_credential_required_for_protection_mode');
    return mode === 'device_pin' ? { pin: acceptedNew, password: null } : { pin: null, password: acceptedNew };
  }
  if (active) return validateVaultCredential(mode, active)
    ? (mode === 'device_pin' ? { pin: active, password: null } : { pin: null, password: active })
    : { pin: null, password: null };
  // Kein stiller Rückfall: ein Moduswechsel ohne gültigen Ausweis ist kein Wechsel. Ohne diese Zeile wäre
  // „device_pin" mit leerem PIN als Erfolg gemeldet worden, während tatsächlich gar kein Ausweis aktiv war.
  throw new Error('vault_credential_required_for_protection_mode');
}

/**
 * Löst einen Wechsel der Schutzart **atomar und fail-closed** auf.
 *
 * Gemessener Befund (Runde „Vault", vor dieser Funktion): `VaultKeyPolicyPanel.applyProtection` setzte den
 * Sitzungsausweis (`onSetActiveDocumentPin`/`onSetActiveDocumentPassword`) **bevor** die neue Policy
 * berechnet und gespeichert wurde. Schlug irgendein späterer Schritt fehl — `updateVaultProtectionMode`,
 * `assertVaultPolicySafeToPersist` beim Persistieren, oder die Hardware-Vorbedingung in
 * `validateVaultPolicyPrerequisites` — blieb der Ausweis gesetzt und die Policy unverändert. Das Ergebnis
 * war ein Zustand „Ausweis aktiv, Policy sagt `device`": erscheinungsbildlich geschützt, tatsächlich nicht.
 * Genau die Klasse von Fehler, die dieser Plan unter „nie still in einen unsicheren Modus fallen" verbietet.
 *
 * Die Funktion mutiert nichts. Sie liefert das vollständige Ergebnis oder wirft; der Aufrufer setzt erst
 * danach alle drei Werte. Damit ist ein halb angewandter Wechsel strukturell unmöglich, nicht nur
 * unwahrscheinlich.
 */
export function resolveVaultProtectionChange(
  policy: VaultKeyPolicyModel,
  nextMode: VaultProtectionMode,
  credential: string | null | undefined,
  alreadyActive: { pin: string | null; password: string | null },
  status: KeyVaultStatus,
  /** Bestätigungseingabe bei der **ersten** Vergabe (V-011). Beim Wechsel mit aktivem Ausweis entbehrlich. */
  confirmation?: string,
): VaultProtectionChange {
  if (!PROTECTION_MODES.has(nextMode)) throw new Error('vault_key_policy_mode_invalid');
  const nextPolicy = updateVaultProtectionMode(policy, nextMode);
  // Vorbedingungen erst prüfen, dann irgendetwas zurückgeben: „provider-bestätigte Hardware gefordert,
  // aber nicht vorhanden" muss den Wechsel verhindern, nicht begleiten.
  validateVaultPolicyPrerequisites(nextPolicy, status);
  const active = nextMode === 'device_pin' ? alreadyActive.pin : alreadyActive.password;
  /**
   * **V-011:** Bei der ersten Vergabe muss die Eingabe wiederholt werden. Der Wert wird hier geprüft und
   * **verworfen**; `credentialsForProtectionMode` bekommt weiterhin die ursprüngliche Eingabe, damit es nur
   * eine Quelle für den Ausweis gibt.
   */
  /**
   * **V-011 / V-044:** Sobald eine **neue** Eingabe im Feld steht, ist es eine Neusetzung — und die muss
   * bestätigt werden, auch wenn schon ein Ausweis aktiv ist. Vorher hing die Bestätigung allein an
   * `!active`; damit war ein Kennwortwechsel entweder unmöglich (V-044) oder unbestätigt.
   */
  if (nextMode !== 'device' && (!active || (typeof credential === 'string' && credential.length > 0))) {
    validateVaultCredentialConfirmation(nextMode, credential ?? '', confirmation ?? '', false);
  }
  const credentials = credentialsForProtectionMode(nextMode, credential, alreadyActive);
  return { nextPolicy, nextPin: credentials.pin, nextPassword: credentials.password };
}

export interface VaultHardwareCapability {
  providerConnected: boolean;
  providerUnlocked: boolean;
  hardwareBacked: boolean;
  platform: string;
  claim: 'hardware-backed' | 'software-or-unknown';
}

/** Hardware-backed is asserted only by the actual KeyVault provider, never by WebAuthn presence alone. */
export function resolveVaultHardwareCapability(status: KeyVaultStatus): VaultHardwareCapability {
  const providerConnected = status.coreConnected === true;
  const hardwareBacked = providerConnected
    && status.hardwareBacked === true
    && status.hardwareAttestationVerified === true
    && status.hardwareSlotSupported === true;
  return {
    providerConnected,
    providerUnlocked: providerConnected && status.isLocked === false,
    hardwareBacked,
    platform: status.platform || 'Unknown provider',
    claim: hardwareBacked ? 'hardware-backed' : 'software-or-unknown',
  };
}

export function validateVaultPolicyPrerequisites(policy: VaultKeyPolicyModel, status: KeyVaultStatus): void {
  const normalized = normalizeVaultKeyPolicy(policy);
  const hardware = resolveVaultHardwareCapability(status);
  if (normalized.hardwarePreference === 'required' && !hardware.hardwareBacked) {
    throw new Error('vault_hardware_backing_required_unavailable');
  }
}

export function validateVaultCredential(mode: VaultProtectionMode, credential?: string | null): string | null {
  if (mode === 'device') return null;
  if (mode === 'device_pin') {
    const pin = credential?.trim() ?? '';
    if (!/^\d{4,8}$/.test(pin)) throw new Error('vault_pin_format_invalid');
    return pin;
  }
  const password = credential ?? '';
  if (password.length < VAULT_CREDENTIAL_MINIMUM_LENGTH || password.length > VAULT_CREDENTIAL_MAXIMUM_LENGTH) {
    throw new Error('vault_password_format_invalid');
  }
  return password;
}

/**
 * Auto-Lock-Entscheidung, **fail-closed**.
 *
 * Gemessener Befund: In der vorigen Fassung stand `if (!Number.isFinite(lastActivityAt) || !Number.isFinite(now)
 * || now < lastActivityAt) return false;`. Jeder unbrauchbare Zeitwert — `NaN` aus einem fehlgeschlagenen
 * `Date.now()`, ein zurückgesetzter Systemzeitgeber, eine Uhr, die vor der letzten Aktivität steht — wurde
 * damit als „nicht sperren" ausgelegt. Ausgerechnet die Funktion, die den Tresor **schließen** soll, hatte
 * als Standardverhalten „offen bleiben". Für eine Sperrregel ist das die falsche Richtung: der unsichere
 * Ausgang ist „gesperrt", nicht „entsperrt". Jetzt gilt umgekehrt — ein Zeitwert, dem nicht zu trauen ist,
 * sperrt sofort, und zwar unabhängig davon, wie viele Minuten konfiguriert sind.
 *
 * `disabled` (0 Minuten) bleibt die **einzige** bewusste Ausnahme: sie ist eine Nutzerentscheidung, keine
 * Fehlinterpretation eines defekten Wertes.
 */
export function vaultShouldAutoLock(policy: VaultKeyPolicyModel, lastActivityAt: number, now: number): boolean {
  const minutes = normalizeVaultKeyPolicy(policy).autoLockMinutes;
  if (minutes === 0) return false;
  if (!Number.isFinite(lastActivityAt) || !Number.isFinite(now)) return true;
  // Eine Uhr, die vor der letzten Aktivität steht, ist kein Beweis für Aktivität — sie ist ein defekter
  // Zeitwert und sperrt deshalb ebenfalls.
  if (now < lastActivityAt) return true;
  return now - lastActivityAt >= minutes * 60_000;
}

/**
 * Empfehlung für den Aufrufer: welchen Zeitstempel darf ein Auto-Lock-Zähler als „letzte Aktivität"
 * führen? Ein `NaN` oder `undefined` aus der Anwendung darf nicht als gültige Aktivität in die Prüfung
 * gelangen, sonst entscheidet die Prüfung über einen Wert, den sie gar nicht kennt.
 */
export function normalizeVaultActivityTimestamp(value: unknown, now = Date.now()): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now ? value : now;
}

/**
 * Local plaintext-view/session gate only. This MUST NOT be treated as cryptographic
 * KeyVault authentication. Native save/open always revalidates the credential against
 * authenticated key slots in vgt-keyvault; this helper merely controls an already-loaded UI.
 */
export function validateVaultUiSessionGate(
  policy: VaultKeyPolicyModel,
  suppliedCredential: string | null | undefined,
  activeCredential: string | null | undefined,
  status: KeyVaultStatus,
): void {
  const normalized = normalizeVaultKeyPolicy(policy);
  validateVaultPolicyPrerequisites(normalized, status);
  if (normalized.protectionMode === 'device') {
    // Native provider lock is authoritative when it exists. Browser-only device mode
    // uses its non-exportable IndexedDB key and therefore has no user credential prompt.
    if (status.coreConnected && status.isLocked) throw new Error('vault_keyvault_locked');
    return;
  }
  const supplied = validateVaultCredential(normalized.protectionMode, suppliedCredential);
  const expected = validateVaultCredential(normalized.protectionMode, activeCredential);
  /**
   * **Der geschlossene Zeitkanal.**
   *
   * Hier stand `if (!expected || supplied !== expected)`. `!==` auf Zeichenketten darf beim ersten
   * unterschiedlichen Zeichen abbrechen; die Zahl der Zeichenvergleiche war damit eine Funktion der
   * Uebereinstimmungslage. Der Vergleich laeuft jetzt ueber eine **oeffentliche feste Schranke**
   * (`VAULT_CREDENTIAL_MAXIMUM_LENGTH`), sodass die Schrittzahl weder von der Lage des ersten Unterschieds
   * noch von der Laenge des aktiven Ausweises abhaengt.
   *
   * **Warum die Leerwertprüfung stehen bleibt und nicht durch den Vergleich ersetzt wird:** der alte
   * Ausdruck sperrte bei `!expected` — also auch bei der leeren Zeichenkette. Ein zeitkonstanter Vergleich
   * zweier leerer Zeichenketten meldet **gleich**, haette aus dieser Sperre also ein Durchlassen gemacht.
   * Dass `validateVaultCredential` fuer `device_pin` und `portable_password` eine leere Zeichenkette bereits
   * am Format zurueckweist, macht den Fall unerreichbar — aber eine Auth-Entscheidung darf nicht auf der
   * Unerreichbarkeit einer Vorbedingung ruhen. Die Sperre ist deshalb ausdruecklich und fuer `supplied`
   * zusaetzlich gesetzt (er ist im Nicht-`device`-Zweig nie `null`, aber der Typ sagt es nicht).
   *
   * Die Schranke deckt beide Betriebsarten ab: ein PIN ist hoechstens 8 Zeichen, ein Kennwort hoechstens
   * `VAULT_CREDENTIAL_MAXIMUM_LENGTH`. Beide Grenzen werden von `validateVaultCredential` **vor** diesem
   * Vergleich erzwungen, weshalb die Schrittzahl genau die Schranke ist.
   */
  if (!supplied || !expected) throw new Error('vault_wrong_credential');
  if (!compareVaultCredentials(supplied, expected, VAULT_CREDENTIAL_MAXIMUM_LENGTH).equal) {
    throw new Error('vault_wrong_credential');
  }
}

export function vaultRecoveryExplanation(policy: VaultKeyPolicyModel): string {
  const mode = normalizeVaultKeyPolicy(policy).protectionMode;
  const factor = mode === 'device'
    ? 'the local device KeyVault/device key'
    : mode === 'device_pin'
      ? 'both the local device key and the configured PIN'
      : 'the portable password';
  return `Recovery requires ${factor} or an independently created known-good encrypted backup/recipient package. Astraea stores no universal recovery key and has no recovery backdoor. Losing every valid key/credential and backup can make the Vault permanently unreadable.`;
}

export function vaultPolicyContainsPersistedSecret(policy: VaultKeyPolicyModel): boolean {
  const serialized = JSON.stringify(policy).toLowerCase();
  return /"(?:pin|password|privatekey|private_key|secret|rawkey|raw_key)"\s*:/.test(serialized);
}

export function assertVaultPolicySafeToPersist(policy: VaultKeyPolicyModel): VaultKeyPolicyModel {
  const normalized = normalizeVaultKeyPolicy(policy);
  if (vaultPolicyContainsPersistedSecret(normalized)) throw new Error('vault_key_policy_contains_secret');
  return normalized;
}
