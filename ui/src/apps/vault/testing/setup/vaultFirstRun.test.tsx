// STATUS: PLATIN — Ersteinrichtung: Entscheidung, Validierung und Rendervertrag (AST-1126 / AST-1127).
//
// **Der gemessene Befund, der diese Datei ausgelöst hat (Runde 84):** Es gab **keinen** Ersteinrichtungs-
// Einstieg. Gemessen über alle Vault-Oberflächen war die Trefferzahl für
// `firstRun|onboarding|welcome|setup|initializedAt|erstmalig` in Produktionscode **null**; der einzige
// Treffer war „Pairing setup failed." in einem Peer-Toast, also ein anderer Vorgang. Bei leerem Tresor
// zeigte `VaultFilesTab` nur „No Vault entries match this folder/filter." — einen **Filter**hinweis.
//
// **Der gefährlichste Fall steht hier im Mittelpunkt:** eine Schutzart, die eine Kennphrase verlangt, ohne
// gesetzten Ausweis. Der Auftrag nennt ihn ausdrücklich — *„ein fehlender Schlüssel darf nie ein stiller
// Erfolg werden"* —, und `deriveVaultFirstRunView` macht daraus einen **sichtbaren, benannten Blocker**
// statt eines Formulars, das wie Fortschritt aussieht.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_VAULT_KEY_POLICY } from '../../../../shared/vault/security/vaultKeyPolicyEngine';
import {
  deriveVaultFirstRunView,
  isVaultInitialized,
  validateVaultFirstRunDraft,
  vaultFirstRunFactsFrom,
  VAULT_FIRST_RUN_MODES,
  type VaultFirstRunFacts,
} from '../../../../apps/vault/setup/vaultFirstRun';
import { VaultFirstRunPanel } from '../../../../apps/vault/setup/VaultFirstRunPanel';

const noop = () => {};

const facts = (overrides: Partial<VaultFirstRunFacts> = {}): VaultFirstRunFacts => ({
  hasFiles: false, hasFolders: false, initialized: false,
  policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device' },
  activePin: null, activePassword: null, ...overrides,
});

describe('deriveVaultFirstRunView: der gefährliche Fall kommt zuerst', () => {
  it('leerer Tresor ohne Einrichtung: der Einstieg wird gezeigt', () => {
    const view = deriveVaultFirstRunView(facts());
    expect(view).toMatchObject({ state: 'setup_required', showSetup: true, usable: false });
    expect(view.message).toContain('has not been set up yet');
  });

  it('**Schutzart verlangt einen Ausweis, es gibt keinen → sichtbarer Blocker, nicht benutzbar**', () => {
    /*
     * Der Kernauftrag. Ein Tresor, der „geschützt" aussieht und keinen Schlüssel hat, ist schlimmer als ein
     * offener: der Nutzer verlässt sich auf einen Schutz, den es nicht gibt.
     */
    const view = deriveVaultFirstRunView(facts({ initialized: true, policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password' } }));
    expect(view).toMatchObject({ state: 'credential_missing', showSetup: false, usable: false, needsCredential: true });
    expect(view.message).toContain('no credential is stored');
    expect(view.message).toContain('never a silent success');
  });

  it('derselbe Fall **ohne** Einrichtungsvermerk führt in die Einrichtung, nicht in einen Blocker', () => {
    // Sonst stünde der Nutzer vor einer Wand, statt den Tresor einrichten zu können.
    const view = deriveVaultFirstRunView(facts({ policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device_pin' } }));
    expect(view).toMatchObject({ state: 'setup_required', needsCredential: true, usable: false });
    expect(view.message).toContain('must not look protected');
  });

  it('mit gesetztem Ausweis ist der Tresor benutzbar', () => {
    const view = deriveVaultFirstRunView(facts({ initialized: true, policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device_pin' }, activePin: '4821' }));
    expect(view).toMatchObject({ state: 'ready', showSetup: false, usable: true, needsCredential: false });
  });

  it('für den PIN zählt nur der PIN, für das Kennwort nur das Kennwort', () => {
    // Ein gesetztes Kennwort darf einen PIN-Modus **nicht** als geschützt erscheinen lassen.
    expect(deriveVaultFirstRunView(facts({ initialized: true, policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'device_pin' }, activePassword: 'irgendwas' })).usable).toBe(false);
    expect(deriveVaultFirstRunView(facts({ initialized: true, policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password' }, activePin: '4821' })).usable).toBe(false);
  });

  it('der Gerätemodus braucht keinen Ausweis und ist benutzbar', () => {
    const view = deriveVaultFirstRunView(facts({ initialized: true }));
    expect(view).toMatchObject({ usable: true, needsCredential: false });
  });

  it('ein nicht leerer, aber nie eingerichteter Tresor wird **nicht** als Einrichtung gezeigt', () => {
    // Wer schon Dateien hat, soll nicht „Tresor erstmalig einrichten" sehen.
    const view = deriveVaultFirstRunView(facts({ hasFiles: true }));
    expect(view.showSetup).toBe(false);
    expect(view.usable).toBe(true);
  });
});

describe('validateVaultFirstRunDraft: fail-closed und benannt', () => {
  it('ohne Namen wird benannt abgelehnt', () => {
    const result = validateVaultFirstRunDraft({ vaultName: '   ', mode: 'device', credential: '', confirmation: '' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result).toMatchObject({ ok: false, reason: 'name_required' });
  });

  it('ein zu langer Name wird abgelehnt, nicht gekürzt', () => {
    const result = validateVaultFirstRunDraft({ vaultName: 'a'.repeat(241), mode: 'device', credential: '', confirmation: '' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result).toMatchObject({ ok: false, reason: 'name_too_long' });
    if (!result.ok) expect(result.message).toContain('not shortened');
  });

  it('der Gerätemodus kommt ohne Ausweis aus und setzt keinen', () => {
    const result = validateVaultFirstRunDraft({ vaultName: 'Tresor', mode: 'device', credential: '', confirmation: '' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result).toMatchObject({ ok: true, name: 'Tresor', pin: null, password: null });
  });

  it('eine zu kurze Kennphrase wird benannt abgelehnt — nicht still übernommen', () => {
    const result = validateVaultFirstRunDraft({ vaultName: 'Tresor', mode: 'portable_password', credential: 'kurz', confirmation: 'kurz' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result).toMatchObject({ ok: false, reason: 'password_format_invalid' });
    if (!result.ok) expect(result.message).toContain('8 to 128');
  });

  it('eine fehlende Bestätigung wird abgelehnt', () => {
    const result = validateVaultFirstRunDraft({ vaultName: 'Tresor', mode: 'portable_password', credential: 'lang-genug-2026', confirmation: '' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result).toMatchObject({ ok: false, reason: 'confirmation_invalid' });
  });

  it('**eine abweichende Bestätigung wird abgelehnt und nennt die Folge**', () => {
    // Nicht „ungültig", sondern: das Kennwort lässt sich später nicht wiederherstellen.
    const result = validateVaultFirstRunDraft({ vaultName: 'Tresor', mode: 'portable_password', credential: 'lang-genug-2026', confirmation: 'lang-genug-2027' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result).toMatchObject({ ok: false, reason: 'confirmation_invalid' });
    if (!result.ok) expect(result.message).toContain('cannot be recovered later');
  });

  it('eine gültige Kennphrase liefert Policy **und** Ausweis gemeinsam', () => {
    // Atomar: kein halber Zustand, in dem die Policy „geschützt" sagt und kein Ausweis existiert.
    const result = validateVaultFirstRunDraft({ vaultName: 'Tresor', mode: 'portable_password', credential: 'lang-genug-2026', confirmation: 'lang-genug-2026' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.protectionMode).toBe('portable_password');
      expect(result.password).toBe('lang-genug-2026');
      expect(result.pin).toBeNull();
    }
  });

  it('ein PIN wird getrimmt verglichen, Bestätigung inklusive', () => {
    const result = validateVaultFirstRunDraft({ vaultName: 'Tresor', mode: 'device_pin', credential: '4821', confirmation: ' 4821 ' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pin).toBe('4821');
  });

  it('eine unbekannte Schutzart wird abgelehnt', () => {
    const result = validateVaultFirstRunDraft({ vaultName: 'Tresor', mode: 'biometrie' as never, credential: '', confirmation: '' }, { policy: DEFAULT_VAULT_KEY_POLICY, activePin: null, activePassword: null });
    expect(result).toMatchObject({ ok: false, reason: 'mode_invalid' });
  });

  it('die angebotenen Schutzarten sind genau drei', () => {
    expect(VAULT_FIRST_RUN_MODES.map((entry) => entry.mode)).toEqual(['device', 'device_pin', 'portable_password']);
  });
});

describe('Der Einrichtungsvermerk wird abgeleitet, nicht erfunden', () => {
  /*
   * **Warum diese Tests hinzugekommen sind:** mein Gegencheck Nr. 36 (die Ableitung auf `return true`
   * gesetzt) blieb **grün**, weil die bisherigen Tests `initialized` immer **ausdrücklich** übergaben und die
   * Ableitung damit nie berührten. Ein grüner Gegencheck ohne Test für den Pfad ist kein Beweis — dieselbe
   * Vorbedingung wie bei CC24 und CC30.
   */
  it('`keyGeneration >= 1` bedeutet eingerichtet, `0`/fehlend nicht', () => {
    expect(isVaultInitialized({ ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: 1 })).toBe(true);
    expect(isVaultInitialized({ ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: 3 })).toBe(true);
    expect(isVaultInitialized({ ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: 0 })).toBe(false);
    expect(isVaultInitialized(null)).toBe(false);
    expect(isVaultInitialized(undefined)).toBe(false);
    // Unbrauchbare Werte sind kein Freibrief.
    expect(isVaultInitialized({ ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: Number.NaN })).toBe(false);
    expect(isVaultInitialized({ ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: -1 })).toBe(false);
    expect(isVaultInitialized({ ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: '1' as never })).toBe(false);
  });

  it('`vaultFirstRunFactsFrom` baut die Fakten aus dem vorhandenen Zustand', () => {
    const withKey = vaultFirstRunFactsFrom({ policy: { ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: 1, protectionMode: 'device_pin' }, fileCount: 0, folderCount: 0, activePin: '4821', activePassword: null });
    expect(withKey).toMatchObject({ initialized: true, hasFiles: false, hasFolders: false, activePin: '4821' });
    // Der gefährliche Fall entsteht genau aus dieser Ableitung: eingerichtet, PIN-Modus, **kein** PIN.
    expect(deriveVaultFirstRunView(vaultFirstRunFactsFrom({ policy: { ...DEFAULT_VAULT_KEY_POLICY, keyGeneration: 1, protectionMode: 'device_pin' }, fileCount: 0, folderCount: 0, activePin: null, activePassword: null })))
      .toMatchObject({ state: 'credential_missing', usable: false });
  });

  it('ohne Policy fällt der Zustand auf die Vorgaben zurück, ohne zu werfen', () => {
    const withoutPolicy = vaultFirstRunFactsFrom({ policy: null, fileCount: 0, folderCount: 0, activePin: null, activePassword: null });
    expect(withoutPolicy.policy.protectionMode).toBe('device');
    expect(deriveVaultFirstRunView(withoutPolicy).showSetup).toBe(true);
  });

  it('gefüllte Bestände zählen als Dateien bzw. Ordner', () => {
    const filled = vaultFirstRunFactsFrom({ policy: DEFAULT_VAULT_KEY_POLICY, fileCount: 3, folderCount: 0, activePin: null, activePassword: null });
    expect(filled).toMatchObject({ hasFiles: true, hasFolders: false });
  });
});

describe('VaultFirstRunPanel: Rendervertrag, Tastatur, sichtbare Ablehnung', () => {
  const render = (overrides: Partial<VaultFirstRunFacts> = {}, props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(<VaultFirstRunPanel facts={facts(overrides)} onCreate={noop} {...props} />);

  it('der Einstieg hat Name, Schutzarten und einen Absende-Knopf', () => {
    const markup = render();
    expect(markup).toContain('data-vault-first-run="setup"');
    expect(markup).toContain('aria-label="Vault name"');
    expect(markup).toContain('type="radio"');
    expect(markup).toContain('Create the Vault and confirm the key');
    // Ein echtes Formular: Enter löst `onSubmit` aus, nicht nur ein Klick.
    expect(markup).toContain('<form');
    expect(markup).toContain('aria-label="Vault setup form"');
  });

  it('im Gerätemodus wird **kein** Bestätigungsfeld verlangt', () => {
    const markup = render();
    expect(markup).not.toContain('Repeat the password');
    expect(markup).not.toContain('Repeat the PIN');
  });

  it('im Kennwortmodus werden Kennwort, Wiederholung und die Folge genannt', () => {
    const markup = render({ policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password' } });
    expect(markup).toContain('aria-label="Vault password"');
    expect(markup).toContain('aria-label="Repeat the password"');
    expect(markup).toContain('There is no universal recovery key');
  });

  it('der gefährliche Zustand rendert einen Blocker mit `role`-freier, sichtbarer Begründung', () => {
    const markup = render({ initialized: true, policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password' } });
    expect(markup).toContain('data-vault-first-run="credential-missing"');
    expect(markup).toContain('configured but not protected');
    expect(markup).toContain('never become a silent success');
    // Kein Einrichtungsformular in diesem Zustand — sonst wäre der Blocker hinter Fortschritt versteckt.
    expect(markup).not.toContain('aria-label="Vault setup form"');
  });

  it('im fertigen Zustand wird der letzte Schritt der Akzeptanzhandlung angeboten', () => {
    const markup = render({ initialized: true }, { onOpenFiles: noop });
    expect(markup).toContain('data-vault-first-run="ready"');
    expect(markup).toContain('Open the file area');
  });

  it('ohne Rückruf erscheint der Dateibereich-Knopf nicht — kein Knopf, der nichts tut', () => {
    expect(render({ initialized: true })).not.toContain('Open the file area');
  });

  it('das Kennwortfeld ist ein Passwortfeld mit `autocomplete="new-password"`', () => {
    // Kein Klartext im Markup und keine Autofill-Falle beim Anlegen.
    const markup = render({ policy: { ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password' } });
    expect(markup).toContain('type="password"');
    expect(markup).toContain('autoComplete="new-password"');
  });
});
