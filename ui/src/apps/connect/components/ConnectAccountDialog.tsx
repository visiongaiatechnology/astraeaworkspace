// STATUS: PLATIN — BATCH-CONNECT-7: the visible account-setup surface.
//
// MEASURED GAP before this batch: there was no way to enter an IMAP account anywhere in
// `apps/connect` (no reference to `ConnectAccount`), and the sidebar footer claimed a connection to
// `engineer@example.test` with a hardcoded green dot. This dialog is the visible entry that AST-1566
// asks for; it drives the pure state machine in `domain/connectAccountSetup.ts` and never stores a
// secret itself.

import React, { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldAlert, ShieldQuestion, Info } from 'lucide-react';
import {
  attachCredential,
  completeSetupWithoutProbe,
  INITIAL_ACCOUNT_SETUP,
  isAccountReachable,
  recordTlsProbe,
  toAccountSetting,
  updateAccountDraft,
  type ConnectAccountDraft,
  type ConnectAccountSetupState,
} from '../domain/connectAccountSetup';
import type { ConnectAccountSetting } from '../domain/types';
import { useConnectExtraCopy } from '../locale/connectLocaleExtra';

export interface ConnectAccountDialogProps {
  onClose: () => void;
  onAccountConfigured: (account: ConnectAccountSetting) => void;
  /**
   * The KeyVault writer. It receives the secret and must return a handle. There is no default
   * implementation that falls back to storing the secret locally — omitting it keeps the dialog
   * fail-closed.
   */
  storeSecret?: (accountId: string, protocol: 'imap', secret: string) => Promise<{ stored: boolean; handle?: string }>;
  /** NetGate capability id for outbound IMAP; without it the setup reports BLOCKED. */
  networkCapabilityId?: string;
  /** Real TLS probe. Without it the account stays `unchecked` and can never be called verified. */
  probeTls?: (host: string, port: number) => Promise<{ certificateOk: boolean; certificateSha256?: string; code: string }>;
  now?: () => number;
}

const FIELDS: ReadonlyArray<{ readonly key: keyof ConnectAccountDraft; readonly labelKey: 'accountName' | 'accountAddress' | 'accountHost' | 'accountPort' | 'accountUsername' }> = [
  { key: 'displayName', labelKey: 'accountName' },
  { key: 'address', labelKey: 'accountAddress' },
  { key: 'host', labelKey: 'accountHost' },
  { key: 'port', labelKey: 'accountPort' },
  { key: 'username', labelKey: 'accountUsername' },
];

export const ConnectAccountDialog: React.FC<ConnectAccountDialogProps> = ({
  onClose,
  onAccountConfigured,
  storeSecret,
  networkCapabilityId,
  probeTls,
  now = () => Date.now(),
}) => {
  const extra = useConnectExtraCopy();
  const [state, setState] = useState<ConnectAccountSetupState>(INITIAL_ACCOUNT_SETUP);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);

  const setField = (field: keyof ConnectAccountDraft, value: string) => setState(current => updateAccountDraft(current, field, value));

  const handleCreate = async () => {
    const accountId = `connect-account-${now()}`;
    let next = state;
    if (secret.trim().length > 0) {
      const outcome = storeSecret ? await storeSecret(accountId, 'imap', secret) : { stored: false as const };
      next = attachCredential(next, outcome);
      setState(next);
      if (next.step === 'error') return;
    } else {
      setState(current => ({ ...current, errorCode: 'vault-secret-empty', errorField: 'settings', step: 'error' }));
      return;
    }
    const completed = completeSetupWithoutProbe(next, accountId, now(), { networkCapabilityId });
    setState(completed);
    const setting = toAccountSetting(completed);
    // Only a reachable account is handed over *as* reachable; otherwise the caller keeps the blocked
    // state visible and nothing is claimed about it.
    if (setting) onAccountConfigured(setting);
  };

  const handleProbe = async () => {
    if (!probeTls) {
      setState(current => ({ ...current, errorCode: 'tls-probe-unavailable', errorField: 'settings', step: current.step === 'blocked' ? 'blocked' : 'error' }));
      return;
    }
    const host = state.draft.host.trim().toLowerCase();
    const port = Number(state.draft.port);
    setBusy(true);
    try {
      const outcome = await probeTls(host, port);
      const probed = recordTlsProbe(state, { ...outcome, now: now() });
      setState(probed);
      const setting = toAccountSetting(probed);
      if (setting && isAccountReachable(probed)) onAccountConfigured(setting);
    } finally {
      setBusy(false);
    }
  };

  const status = state.step === 'ready'
    ? { icon: <ShieldCheck className="w-3.5 h-3.5" />, text: extra.accountTlsTrusted, tone: 'text-emerald-300' }
    : state.step === 'blocked'
      ? { icon: <ShieldAlert className="w-3.5 h-3.5" />, text: extra.accountBlocked(state.blockedCode ?? 'blocked'), tone: 'text-rose-300' }
      : state.step === 'error'
        ? { icon: <ShieldAlert className="w-3.5 h-3.5" />, text: extra.accountError(state.errorCode ?? 'error'), tone: 'text-rose-300' }
        : { icon: <ShieldQuestion className="w-3.5 h-3.5" />, text: extra.accountTlsUnchecked, tone: 'text-amber-300' };

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/60 p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={extra.accountSettings} data-connect-account-dialog="true">
      <div className="w-full max-w-lg rounded-xl border border-purple-500/30 bg-[#0e0a1b] p-5 space-y-4 text-xs text-slate-200">
        <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
          <h3 className="text-sm font-bold text-purple-200 flex items-center gap-2"><KeyRound className="w-4 h-4" />{extra.accountTitle}</h3>
          <span data-connect-account-step={state.step} className={`inline-flex items-center gap-1 font-mono text-[0.625rem] ${status.tone}`}>{status.icon}{status.text}</span>
        </div>

        <p className="text-[0.6875rem] text-slate-400 flex items-start gap-1.5">
          <Info className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{extra.accountEmpty}</span>
        </p>

        <div className="space-y-3">
          {FIELDS.map(({ key, labelKey }) => (
            <div key={key}>
              <label className="text-slate-400 block mb-1" htmlFor={`connect-account-${key}`}>{extra[labelKey]}</label>
              <input
                id={`connect-account-${key}`}
                type="text"
                value={state.draft[key]}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setField(key, event.target.value)}
                aria-label={extra[labelKey]}
                data-connect-account-field={key}
                aria-invalid={state.errorField === key}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100"
              />
            </div>
          ))}

          <div>
            <label className="text-slate-400 block mb-1" htmlFor="connect-account-secret">{extra.accountPassword}</label>
            <input
              id="connect-account-secret"
              type="password"
              value={secret}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSecret(event.target.value)}
              aria-label={extra.accountPassword}
              data-connect-account-field="secret"
              autoComplete="off"
              className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100"
            />
            <p className="mt-1 text-[0.625rem] text-emerald-300" data-connect-credential-note="keyvault-only">{extra.accountPasswordNote}</p>
          </div>
        </div>

        {state.step === 'error' && (
          <div role="alert" data-connect-account-error={state.errorCode} className="rounded border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-rose-200">
            {extra.accountError(state.errorCode ?? 'error')}
          </div>
        )}
        {state.step === 'blocked' && (
          <div role="alert" data-connect-account-blocked={state.blockedCode} className="rounded border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-amber-200">
            {extra.accountBlocked(state.blockedCode ?? 'blocked')}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-purple-500/20 pt-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200">{extra.close}</button>
          <button
            type="button"
            data-connect-account-probe="true"
            disabled={busy || state.account === undefined}
            onClick={handleProbe}
            className="px-3 py-1.5 rounded-lg border border-purple-500/40 text-purple-200 disabled:opacity-40"
          >
            {extra.accountTestTls}
          </button>
          <button
            type="button"
            data-connect-account-create="true"
            onClick={handleCreate}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold"
          >
            {extra.accountSave}
          </button>
        </div>
      </div>
    </div>
  );
};
