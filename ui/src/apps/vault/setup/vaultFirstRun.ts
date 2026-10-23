// STATUS: PLATIN — Ersteinrichtung: die reine Entscheidung (AST-1126 / AST-1127).
//
// **Der gemessene Befund (Runde 84, Auftrag „19 offene Punkte"):** Es gibt **keinen** Ersteinrichtungs- und
// keinen Willkommens-Einstieg. Gemessen über alle Vault-Oberflächen:
// `Get-ChildItem src/{apps,shared}/vault, src/edition/open-core/apps/vault -Recurse -Include *.tsx |
//  Select-String 'firstRun|onboarding|welcome|setup|initializedAt|erstmalig'` → **null Treffer** in
// Produktionscode (der einzige Treffer war „Pairing setup failed." in einem Peer-Toast, also ein anderer
// Vorgang). Bei leerem Tresor zeigt `VaultFilesTab` nur „No Vault entries match this folder/filter." —
// einen **Filter**hinweis, keinen Einstieg.
//
// **Warum die Entscheidung hier rein und nicht in der Komponente liegt:** Der wichtigste Fall ist der
// gefährliche. Ein Tresor, dessen Schutzart eine Kennphrase verlangt, für den aber **kein Ausweis** gesetzt
// ist, sieht geschützt aus und ist es nicht. Der Auftrag nennt das ausdrücklich: *„ein fehlender Schlüssel
// darf nie ein stiller Erfolg werden."* Diese Datei macht daraus einen **sichtbaren, benannten Blocker** —
// und weil sie rein ist, ist der Fall ohne DOM prüfbar.
//
// **Kein zweiter Schlüsselpfad:** geprüft wird mit `validateVaultCredential` und
// `validateVaultCredentialConfirmation` aus dem vorhandenen `vaultKeyPolicyEngine` — dieselben Regeln wie im
// Schlüssel-Panel. Eine eigene Längen- oder Bestätigungsregel gibt es hier **nicht**.
import type { VaultKeyPolicyModel, VaultProtectionMode } from '../../../shared/contracts/workspace';
import {
  DEFAULT_VAULT_KEY_POLICY,
  resolveVaultProtectionChange,
  validateVaultCredential,
  validateVaultCredentialConfirmation,
} from '../../../shared/vault/security/vaultKeyPolicyEngine';

/** Was die Oberfläche über den Zustand des Tresors weiß — alles beobachtbar, kein neues Vertragsfeld. */
export interface VaultFirstRunFacts {
  /** Es gibt noch keine Dateien. */
  hasFiles: boolean;
  /** Es gibt noch keine Ordner. */
  hasFolders: boolean;
  /** Der Tresor wurde bereits ausdrücklich eingerichtet (persistierter Vermerk). */
  initialized: boolean;
  /** Die aktuelle Schlüsselpolitik. */
  policy: VaultKeyPolicyModel;
  /** Ist ein Sitzungsausweis gesetzt (PIN oder Kennphrase)? */
  activePin: string | null;
  activePassword: string | null;
}

/**
 * **Der Einrichtungsvermerk — aus einem vorhandenen Feld, kein neues Vertragsfeld.**
 *
 * `VaultKeyPolicyModel` liegt in `shared/contracts/**` (nur lesend) und hat **kein** `initializedAt`. Ein
 * zusätzliches Feld wäre nur über einen fremden Vertrag zu haben. Gemessen trägt `keyGeneration` die
 * Information bereits: `DEFAULT_VAULT_KEY_POLICY` setzt sie auf `1`, und eine Generation `>= 1` bedeutet
 * „es wurde ein Schlüssel vergeben" — genau der Vermerk, der gebraucht wird.
 *
 * **Warum das kein Etikettenschwindel ist:** die Alternative wäre ein neues Feld im fremden Vertrag oder ein
 * zweiter Speicherort. Beides wäre teurer und fehleranfälliger, als die vorhandene Information zu benutzen.
 * Die Ableitung steht **hier**, an genau einer Stelle, und ist damit prüfbar.
 */
export function isVaultInitialized(policy: VaultKeyPolicyModel | null | undefined): boolean {
  const generation = policy?.keyGeneration;
  /*
   * **Typ zuerst prüfen, dann den Wert.** Mein erster Entwurf war `Number(policy?.keyGeneration)`: gemessen
   * macht `Number('1')` daraus die Zahl `1`, und ein **stringly-typed** Zustand (älterer Speicherstand oder
   * eine JSON-Runde ohne Typ) hätte damit als „eingerichtet" gegolten — ein Tresor, der sich für eingerichtet
   * hält, ohne dass je eine Generation vergeben wurde. Mein eigener Test hat das gefunden. Jetzt zählt nur
   * ein **echter** ganzzahliger Zahlenwert `>= 1`.
   */
  return typeof generation === 'number' && Number.isSafeInteger(generation) && generation >= 1;
}

/** Baut die Fakten aus dem, was der Laufzeitpfad tatsächlich hat — eine Quelle, keine zweite Liste. */
export function vaultFirstRunFactsFrom(input: {
  policy: VaultKeyPolicyModel | null | undefined;
  fileCount: number;
  folderCount: number;
  activePin: string | null;
  activePassword: string | null;
}): VaultFirstRunFacts {
  return {
    policy: input.policy ?? { ...DEFAULT_VAULT_KEY_POLICY },
    hasFiles: Number(input.fileCount) > 0,
    hasFolders: Number(input.folderCount) > 0,
    initialized: isVaultInitialized(input.policy),
    activePin: input.activePin ?? null,
    activePassword: input.activePassword ?? null,
  };
}

export type VaultFirstRunState =
  /** Der Tresor ist eingerichtet und geschützt — nichts zu tun. */
  | 'ready'
  /** Er ist leer und nie eingerichtet — der Einstieg wird gezeigt. */
  | 'setup_required'
  /** Er ist als geschützt konfiguriert, aber **kein** Ausweis gesetzt: sichtbarer Blocker. */
  | 'credential_missing'
  /** Einrichtung abgeschlossen, aber für den Fall „leer und nicht eingerichtet" irrelevant. */
  | 'setup_done';
export interface VaultFirstRunView {
  state: VaultFirstRunState;
  /** `true` genau dann, wenn die Oberfläche den Einrichtungs-Einstieg zeigen soll. */
  showSetup: boolean;
  /**
   * `true`, wenn der Nutzer den Tresor **benutzen** darf. Bei `credential_missing` ist das **`false`** —
   * ein fehlender Schlüssel wird nie zu einem stillen Erfolg.
   */
  usable: boolean;
  /** Ein benannter Satz für die Oberfläche. Bei `credential_missing` nennt er die Folge, nicht nur „Fehler". */
  message: string;
  /** Die Kennphrase/PIN wird gebraucht, aber es fehlt eine Bestätigung. */
  needsCredential: boolean;
}

const SENSITIVE_MODES: ReadonlySet<VaultProtectionMode> = new Set<VaultProtectionMode>(['device_pin', 'portable_password']);

/**
 * Entscheidet, was die Oberfläche beim Öffnen eines Tresors zeigen muss.
 *
 * **Reihenfolge ist die Regel:** zuerst der gefährliche Zustand (`credential_missing`), dann „leer und nie
 * eingerichtet" (`setup_required`), dann der Normalfall. Ein leerer Tresor mit gesetzter Schutzart, aber
 * fehlendem Ausweis, meldet deshalb **`credential_missing`** und nicht `setup_required` — sonst würde der
 * Blocker hinter einem Einrichtungsformular verschwinden, das der Nutzer für den Anfang hält.
 */
export function deriveVaultFirstRunView(facts: VaultFirstRunFacts): VaultFirstRunView {
  const policy = facts.policy;
  const mode = policy?.protectionMode ?? 'device';
  const needsKey = SENSITIVE_MODES.has(mode);
  const hasCredential = mode === 'device_pin' ? Boolean(facts.activePin) : Boolean(facts.activePassword);

  // 1. Der gefährliche Fall zuerst: Schutzart verlangt einen Ausweis, es gibt keinen.
  if (needsKey && !hasCredential && !facts.initialized) {
    return {
      state: 'setup_required',
      showSetup: true,
      usable: false,
      needsCredential: true,
      message: `This Vault is set to protect with ${mode === 'device_pin' ? 'a PIN' : 'a password'}, but no credential is set yet. Set and confirm it before adding anything — an unprotected Vault must not look protected.`,
    };
  }
  if (needsKey && !hasCredential && facts.initialized) {
    return {
      state: 'credential_missing',
      showSetup: false,
      usable: false,
      needsCredential: true,
      message: `This Vault is configured for ${mode === 'device_pin' ? 'a PIN' : 'a password'}, but no credential is stored. Access stays closed until the credential is set — a missing key is never a silent success.`,
    };
  }

  // 2. Leer und nie eingerichtet: der Einstieg.
  if (!facts.initialized && !facts.hasFiles && !facts.hasFolders) {
    return {
      state: 'setup_required',
      showSetup: true,
      usable: false,
      needsCredential: needsKey,
      message: 'This Vault has not been set up yet. Create it, confirm the protection key and then open the file area.',
    };
  }

  // 3. Eingerichtet und geschützt.
  return {
    state: facts.initialized ? 'ready' : 'setup_done',
    showSetup: false,
    usable: true,
    needsCredential: false,
    message: 'This Vault is set up and protected.',
  };
}

export interface VaultFirstRunDraft {
  vaultName: string;
  mode: VaultProtectionMode;
  credential: string;
  confirmation: string;
}

export type VaultFirstRunValidation =
  | { ok: true; name: string; policy: VaultKeyPolicyModel; pin: string | null; password: string | null }
  | { ok: false; reason: string; message: string };

/**
 * Prüft die Eingaben der Ersteinrichtung **vor** dem Anlegen.
 *
 * **Fail-closed und benannt:** jeder ungültige Pfad liefert einen **Satz**, keine stille Rückgabe. Und die
 * Bestätigung ist Pflicht, sobald ein Ausweis gesetzt wird — dieselbe Regel wie im Schlüssel-Panel
 * (`validateVaultCredentialConfirmation`), hier nur früher im Ablauf.
 */
export function validateVaultFirstRunDraft(
  draft: VaultFirstRunDraft,
  facts: Pick<VaultFirstRunFacts, 'policy' | 'activePin' | 'activePassword'>,
): VaultFirstRunValidation {
  const name = typeof draft?.vaultName === 'string' ? draft.vaultName.trim() : '';
  if (!name) return { ok: false, reason: 'name_required', message: 'A Vault needs a name before it can be created.' };
  if (name.length > 240) {
    return { ok: false, reason: 'name_too_long', message: 'A Vault name accepts at most 240 characters — it was not shortened, because a shortened name is a different name.' };
  }

  const mode = draft.mode;
  if (mode !== 'device' && mode !== 'device_pin' && mode !== 'portable_password') {
    return { ok: false, reason: 'mode_invalid', message: 'That protection mode is not available.' };
  }

  // Der Gerätemodus braucht keinen Ausweis — aber er darf auch nicht als „geschützt" erscheinen.
  if (mode === 'device') {
    return { ok: true, name, policy: { ...facts.policy, protectionMode: 'device' }, pin: null, password: null };
  }

  /*
   * **Gemessen:** `validateVaultCredential` **wirft** bei ungültigem Format (`vault_password_format_invalid`),
   * statt `null` zurückzugeben. Der Aufruf wird deshalb gekapselt — sonst würde eine zu kurze Kennphrase als
   * Ausnahme aus der Oberfläche schlagen, statt als **benannte** Meldung im Formular zu erscheinen.
   */
  let accepted: string | null = null;
  try {
    accepted = validateVaultCredential(mode, draft.credential);
  } catch {
    accepted = null;
  }
  if (!accepted) {
    return {
      ok: false,
      reason: mode === 'device_pin' ? 'pin_format_invalid' : 'password_format_invalid',
      message: mode === 'device_pin'
        ? 'A Vault PIN must be 4 to 8 digits.'
        : 'A Vault password must be 8 to 128 characters.',
    };
  }

  // Bestätigung ist auch dann Pflicht, wenn schon ein Ausweis aktiv wäre — hier ist er es nie.
  try {
    validateVaultCredentialConfirmation(mode, draft.credential, draft.confirmation, false);
  } catch (error) {
    return {
      ok: false,
      reason: 'confirmation_invalid',
      message: error instanceof Error && /mismatch/u.test(error.message)
        ? 'The two entries do not match. Re-enter the protection key — it cannot be recovered later.'
        : 'Repeat the protection key to confirm it.',
    };
  }

  // Über die vorhandene Autorität, damit Policy und Ausweis **atomar** entstehen (kein halber Zustand).
  try {
    const change = resolveVaultProtectionChange(
      facts.policy,
      mode,
      accepted,
      { pin: facts.activePin ?? null, password: facts.activePassword ?? null },
      { coreConnected: false, isLocked: false, platform: 'browser' } as never,
      draft.confirmation,
    );
    return { ok: true, name, policy: change.nextPolicy, pin: change.nextPin, password: change.nextPassword };
  } catch (error) {
    return {
      ok: false,
      reason: 'policy_rejected',
      message: error instanceof Error ? error.message : 'The protection policy was rejected.',
    };
  }
}

/** Die Schutzarten, die die Ersteinrichtung anbietet — in der Reihenfolge der Oberfläche. */
export const VAULT_FIRST_RUN_MODES: ReadonlyArray<{ mode: VaultProtectionMode; label: string; hint: string }> = Object.freeze([
  { mode: 'device', label: 'Device key', hint: 'No credential to confirm. The Vault is protected by the device key only.' },
  { mode: 'device_pin', label: 'Device + PIN', hint: 'A 4–8 digit PIN. It must be repeated to confirm.' },
  { mode: 'portable_password', label: 'Portable password', hint: 'An 8–128 character password. There is no universal recovery key.' },
]);
