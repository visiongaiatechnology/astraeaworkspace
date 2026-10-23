// STATUS: PLATIN — der sichtbare Einstieg für die Ersteinrichtung (AST-1126 / AST-1127).
//
// **Was hier gebaut wird und warum:** Es gab keinen Ersteinrichtungs- und keinen Willkommens-Einstieg
// (gemessen: `firstRun|onboarding|welcome|setup|erstmalig` → null Treffer in Produktionscode). Bei leerem
// Tresor zeigte `VaultFilesTab` nur einen **Filter**hinweis. Diese Komponente ist der Einstieg: Tresor
// benennen, Schutzart wählen, Schutzschlüssel **bestätigen**, Grenzen sehen — und dann übergeben.
//
// **Keyboard ist nicht optional:** ein `<form>` mit `onSubmit`, sodass **Enter** die Einrichtung auslöst;
// Fokus wandert beim Fehler auf die Meldung (`role="alert"` + `tabIndex={-1}` + `focus()`), damit ein
// Screenreader sie vorliest und ein Tastaturnutzer nicht suchen muss.
//
// **Keine Attrappe:** der Knopf ist nur gesperrt, wenn wirklich etwas fehlt, und **daneben steht der Grund**
// (dieselbe Regel wie bei V-012). Ein gesperrter Knopf ohne Begründung wäre eine stumme Ablehnung.
import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { VaultKeyPolicyModel, VaultProtectionMode } from '../../../shared/contracts/workspace';
import {
  deriveVaultFirstRunView,
  validateVaultFirstRunDraft,
  VAULT_FIRST_RUN_MODES,
  type VaultFirstRunFacts,
} from './vaultFirstRun';

export interface VaultFirstRunPanelProps {
  facts: Pick<VaultFirstRunFacts, 'hasFiles' | 'hasFolders' | 'initialized' | 'policy' | 'activePin' | 'activePassword'>;
  /** Wird **nur** bei gültiger Eingabe gerufen — die Prüfung liegt in `validateVaultFirstRunDraft`. */
  onCreate: (input: { name: string; policy: VaultKeyPolicyModel; pin: string | null; password: string | null }) => void;
  /** Wird gerufen, wenn der Nutzer den Dateibereich öffnen will (Akzeptanzhandlung, letzter Schritt). */
  onOpenFiles?: () => void;
}

const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400/50';

export const VaultFirstRunPanel: React.FC<VaultFirstRunPanelProps> = ({ facts, onCreate, onOpenFiles }) => {
  const view = deriveVaultFirstRunView(facts);
  const [vaultName, setVaultName] = useState('');
  const [mode, setMode] = useState<VaultProtectionMode>(facts.policy?.protectionMode ?? 'device');
  const [credential, setCredential] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLParagraphElement | null>(null);

  // Beim Fehler den Fokus auf die Meldung — sonst müsste ein Tastaturnutzer sie suchen.
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);

  // Der gefährliche Zustand: Schutzart verlangt einen Ausweis, es gibt keinen. **Sichtbarer Blocker.**
  if (view.state === 'credential_missing') {
    return <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5" aria-label="Vault credential missing" data-vault-first-run="credential-missing">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-200"><Lock aria-hidden="true" className="h-4 w-4" />The Vault is configured but not protected</h2>
      <p className="mt-2 text-[0.6875rem] text-rose-100/90">{view.message}</p>
      <p className="mt-2 text-[0.625rem] text-slate-400">Set the credential in the protection panel. This screen deliberately offers no shortcut: a missing key must never become a silent success.</p>
    </section>;
  }

  if (!view.showSetup) {
    // Eingerichtet: nur der letzte Schritt der Akzeptanzhandlung wird angeboten.
    return <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5" aria-label="Vault ready" data-vault-first-run="ready">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><ShieldCheck aria-hidden="true" className="h-4 w-4" />This Vault is set up</h2>
      <p className="mt-1 text-[0.6875rem] text-slate-300">{view.message}</p>
      {onOpenFiles && <button type="button" onClick={onOpenFiles} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500">
        <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />Open the file area
      </button>}
    </section>;
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateVaultFirstRunDraft({ vaultName, mode, credential, confirmation }, {
      policy: facts.policy, activePin: facts.activePin, activePassword: facts.activePassword,
    });
    if (!result.ok) { setError(result.message); return; }
    setError(null);
    onCreate({ name: result.name, policy: result.policy, pin: result.pin, password: result.password });
    // Akzeptanzhandlung: nach dem Anlegen den Dateibereich öffnen.
    onOpenFiles?.();
  };

  const needsConfirmation = mode !== 'device';

  return <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5" aria-label="Set up this Vault" data-vault-first-run="setup">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><KeyRound aria-hidden="true" className="h-4 w-4 text-cyan-300" />Set up this Vault</h2>
    <p className="mt-1 text-[0.6875rem] text-slate-400">{view.message}</p>

    <form onSubmit={submit} className="mt-4 space-y-3" aria-label="Vault setup form">
      <label className="block text-[0.625rem] text-slate-400">Vault name
        <input value={vaultName} onChange={(e) => setVaultName(e.target.value)} maxLength={240} className={`${field} mt-1`} aria-label="Vault name" />
      </label>

      <fieldset className="space-y-1">
        <legend className="text-[0.625rem] text-slate-400">Protection</legend>
        {VAULT_FIRST_RUN_MODES.map((option) => <label key={option.mode} className="flex items-start gap-2 text-[0.6875rem] text-slate-300">
          <input type="radio" name="vault-protection" value={option.mode} checked={mode === option.mode} onChange={() => { setMode(option.mode); setCredential(''); setConfirmation(''); setError(null); }} className="mt-0.5" />
          <span><b>{option.label}</b><span className="block text-[0.625rem] text-slate-500">{option.hint}</span></span>
        </label>)}
      </fieldset>

      {needsConfirmation && <>
        <label className="block text-[0.625rem] text-slate-400">{mode === 'device_pin' ? 'PIN' : 'Password'}
          <input type="password" autoComplete="new-password" value={credential} onChange={(e) => setCredential(e.target.value)} className={`${field} mt-1`} aria-label={mode === 'device_pin' ? 'Vault PIN' : 'Vault password'} />
        </label>
        <label className="block text-[0.625rem] text-slate-400">{mode === 'device_pin' ? 'Repeat the PIN' : 'Repeat the password'}
          <input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={`${field} mt-1`} aria-label={mode === 'device_pin' ? 'Repeat the PIN' : 'Repeat the password'} />
        </label>
        {mode === 'portable_password' && <p className="text-[0.625rem] text-amber-300" role="note">
          There is no universal recovery key. If this password is mistyped or lost, the Vault stays permanently unreadable unless you already hold an independent encrypted backup.
        </p>}
      </>}

      {error && <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[0.6875rem] text-rose-200 outline-none">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500">
          <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />Create the Vault and confirm the key
        </button>
        <span className="text-[0.625rem] text-slate-500">Enter submits · the key is never written in plain text</span>
      </div>
    </form>
  </section>;
};

export default VaultFirstRunPanel;
