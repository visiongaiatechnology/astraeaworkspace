import React, { useState } from 'react';
import { Lock, Key, ShieldCheck, EyeOff, Check, X, Cpu, Layers3 } from 'lucide-react';
import { KeyVaultStatus } from '../../shared/contracts/workspace';
import { createSoftwareKeyProvider, enrollTopSecretAccess, unlockSoftwareKeyProvider, unlockTopSecretAccess } from '../../platform/operations/appContainerOps';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { KEY_VAULT_MODAL_COPY } from './keyVaultModalLocale';

interface KeyVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: KeyVaultStatus;
  onSetPin: (pin: string | null) => void;
  onSetPortablePassword: (password: string | null) => void;
  onTogglePrivacyMode: () => void;
  onLockKeyVault: () => void | Promise<void>;
  onTopSecretAccessChanged?: () => void | Promise<void>;
}

export const KeyVaultModal: React.FC<KeyVaultModalProps> = ({
  isOpen,
  onClose,
  status,
  onSetPin,
  onSetPortablePassword,
  onTogglePrivacyMode,
  onLockKeyVault,
  onTopSecretAccessChanged,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = KEY_VAULT_MODAL_COPY[locale];
  const [pinInput, setPinInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [topSecretSecret, setTopSecretSecret] = useState('');
  const [topSecretFactor, setTopSecretFactor] = useState('');
  const [requireOfflineFactor, setRequireOfflineFactor] = useState(true);
  const [issuedOfflineFactor, setIssuedOfflineFactor] = useState<string | null>(null);
  const [topSecretMessage, setTopSecretMessage] = useState<string | null>(null);
  const [softwarePassphrase, setSoftwarePassphrase] = useState('');
  const [softwarePassphraseConfirm, setSoftwarePassphraseConfirm] = useState('');
  const [softwareProviderBusy, setSoftwareProviderBusy] = useState(false);
  const [softwareProviderMessage, setSoftwareProviderMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    const pin = pinInput.trim();
    if (/^\d{4,8}$/.test(pin)) {
      onSetPin(pin);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        setPinInput('');
      }, 1500);
    }
  };

  const handleRemovePin = () => {
    onSetPin(null);
    setPinInput('');
  };


  const handleSavePortablePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.length >= 8 && passwordInput.length <= 128) {
      onSetPortablePassword(passwordInput);
      setPasswordInput('');
    }
  };

  const handleRemovePortablePassword = () => {
    onSetPortablePassword(null);
    setPasswordInput('');
  };

  const handleSoftwareProviderSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (softwarePassphrase.length < 16 || softwarePassphrase.length > 128 || !status.isLocked) return;
    if (!status.softwareProviderConfigured && softwarePassphrase !== softwarePassphraseConfirm) {
      setSoftwareProviderMessage(copy.passphraseMismatch);
      return;
    }
    setSoftwareProviderBusy(true);
    setSoftwareProviderMessage(null);
    try {
      if (status.softwareProviderConfigured) {
        await unlockSoftwareKeyProvider(softwarePassphrase);
        setSoftwareProviderMessage(copy.softwareProviderSessionActive);
      } else {
        await createSoftwareKeyProvider(softwarePassphrase);
        setSoftwareProviderMessage(copy.softwareProviderSessionActive);
      }
      await onTopSecretAccessChanged?.();
    } catch {
      setSoftwareProviderMessage(copy.providerOperationFailed);
    } finally {
      setSoftwarePassphrase('');
      setSoftwarePassphraseConfirm('');
      setSoftwareProviderBusy(false);
    }
  };

  const handleEnrollTopSecret = async (): Promise<void> => {
    setTopSecretMessage(null);
    try {
      const result = await enrollTopSecretAccess(topSecretSecret, requireOfflineFactor);
      setIssuedOfflineFactor(result.success ? result.offlineFactorHex || null : null);
      if (!result.success) {
        setTopSecretMessage(copy.rejected);
        return;
      }
      setTopSecretMessage(copy.enrolled);
      try {
        await onTopSecretAccessChanged?.();
      } catch {
        setTopSecretMessage(copy.accessRefreshFailed);
      }
    } catch {
      setIssuedOfflineFactor(null);
      setTopSecretMessage(copy.rejected);
    }
  };

  const handleUnlockTopSecret = async (): Promise<void> => {
    setTopSecretMessage(null);
    try {
      const result = await unlockTopSecretAccess(topSecretSecret, topSecretFactor || undefined);
      if (!result.success) {
        setTopSecretMessage(copy.rejected);
        return;
      }
      setTopSecretMessage(copy.topSecretUnlocked);
      try {
        await onTopSecretAccessChanged?.();
      } catch {
        setTopSecretMessage(copy.accessRefreshFailed);
      }
    } catch {
      setTopSecretMessage(copy.rejected);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl glass-dropdown p-6 shadow-2xl border border-purple-500/25 z-10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/15">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>{copy.title}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25 font-mono">
                  RUST CORE
                </span>
              </h3>
              <p className="text-xs text-slate-400">{copy.summary}</p>
            </div>
          </div>
          <button aria-label={copy.close}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-purple-500/15 text-slate-400 hover:text-purple-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-4 text-xs max-h-[72vh] overflow-y-auto pr-1">
          {/* Platform Status */}
          <div className="p-3 rounded-xl bg-purple-950/[0.12] border border-purple-500/15 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="font-semibold text-slate-200 block">{copy.activeProvider}</span>
                <span className="text-[11px] text-slate-400">{status.providerName || (status.platform === 'SoftwareEncrypted' ? copy.softwareProviderName : status.platform)}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{status.coreConnected ? (status.platform === 'SoftwareEncrypted' ? copy.passphraseProviderActive : status.hardwareAttestationVerified && status.hardwareBacked ? copy.hardwareAttested : copy.nativeSecureStorage) : copy.startCore}</span>
                {status.providerDetail && <span className="text-[10px] text-slate-500 block mt-0.5 max-w-sm">{status.providerDetail}</span>}
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              {status.coreConnected ? (status.isLocked ? copy.locked : copy.unlocked) : copy.offline}
            </span>
          </div>

          <section className="p-3.5 rounded-xl bg-cyan-950/[0.16] border border-cyan-400/20">
            <div className="flex items-center gap-2 mb-1.5">
              <Key className="w-4 h-4 text-cyan-300" />
              <span className="font-semibold text-slate-100">{copy.softwareProviderTitle}</span>
            </div>
            <p className="text-[10px] text-slate-400 mb-3">
              {copy.softwareProviderDescription}
            </p>
            {status.platform === 'SoftwareEncrypted' && !status.isLocked ? (
              <p className="text-[11px] text-emerald-300">{copy.softwareProviderSessionActive}</p>
            ) : (
              <form onSubmit={(event) => void handleSoftwareProviderSubmit(event)} className="space-y-2">
                <input
                  id="keyvault-software-passphrase"
                  type="password"
                  autoComplete={status.softwareProviderConfigured ? 'current-password' : 'new-password'}
                  required
                  minLength={16}
                  maxLength={128}
                  value={softwarePassphrase}
                  onChange={(event) => { setSoftwarePassphrase(event.target.value); setSoftwareProviderMessage(null); }}
                  placeholder={status.softwareProviderConfigured ? copy.passphraseUnlockPlaceholder : copy.passphraseCreatePlaceholder}
                  aria-label={status.softwareProviderConfigured ? copy.passphraseUnlock : copy.passphraseCreate}
                  aria-describedby={!status.softwareProviderConfigured ? 'keyvault-software-passphrase-loss-warning' : undefined}
                  disabled={!status.isLocked || softwareProviderBusy || !status.coreConnected}
                  className="w-full bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-300/60 disabled:opacity-50"
                />
                {!status.softwareProviderConfigured && (
                  <>
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={16}
                      maxLength={128}
                      value={softwarePassphraseConfirm}
                      onChange={(event) => { setSoftwarePassphraseConfirm(event.target.value); setSoftwareProviderMessage(null); }}
                      placeholder={copy.passphraseConfirm}
                      aria-label={copy.passphraseConfirm}
                      aria-describedby="keyvault-software-passphrase-loss-warning"
                      aria-invalid={softwarePassphraseConfirm.length > 0 && softwarePassphraseConfirm !== softwarePassphrase}
                      disabled={!status.isLocked || softwareProviderBusy || !status.coreConnected}
                      className="w-full bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-300/60 disabled:opacity-50"
                    />
                    <p id="keyvault-software-passphrase-loss-warning" className="text-[10px] leading-relaxed text-amber-200/90" role="note">{copy.passphraseLossWarning}</p>
                  </>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-slate-500">{status.softwareProviderConfigured ? copy.providerRecordFound : copy.independentKey}</span>
                  <button
                    type="submit"
                    disabled={!status.isLocked || softwareProviderBusy || softwarePassphrase.length < 16 || softwarePassphrase.length > 128 || !status.coreConnected}
                    className="rounded-lg bg-cyan-700 hover:bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                  >
                    {softwareProviderBusy ? copy.working : status.softwareProviderConfigured ? copy.unlockSoftwareKey : copy.createSoftwareKey}
                  </button>
                </div>
              </form>
            )}
            {softwareProviderMessage && <p role="status" className="mt-2 text-[10px] text-cyan-200">{softwareProviderMessage}</p>}
            {!status.isLocked && status.platform !== 'SoftwareEncrypted' && <p className="mt-2 text-[10px] text-amber-300">{copy.lockBeforeSwitch}</p>}
          </section>


          <div className="p-3.5 rounded-xl bg-purple-950/[0.12] border border-purple-500/15">
            <div className="flex items-center gap-2 mb-2">
              <Layers3 className="w-4 h-4 text-cyan-300" />
              <span className="font-semibold text-slate-200">{copy.securityDomains}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <span className="text-slate-400 block">{copy.standard}</span>
                <span className={status.isLocked ? 'text-amber-300' : 'text-emerald-400'}>{status.isLocked ? copy.locked : copy.unlocked}</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <span className="text-slate-400 block">{copy.pqc}</span>
                <span className={status.pqcUnlocked ? 'text-emerald-400' : 'text-slate-500'}>{status.pqcUnlocked ? copy.unlocked : copy.locked}</span>
              </div>
              <div className="rounded-lg border border-purple-500/20 bg-black/20 p-2">
                <span className="text-purple-300 block">{copy.topSecret}</span>
                <span className={status.topSecretUnlocked ? 'text-emerald-400' : status.topSecretEnrolled ? 'text-amber-300' : 'text-slate-500'}>{status.topSecretUnlocked ? copy.unlocked : status.topSecretEnrolled ? copy.locked : copy.notEnrolled}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">{copy.rootsIndependent}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-950/[0.12] border border-purple-500/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-purple-300" />
              <div>
                <span className="font-semibold text-slate-200 block">{copy.relockTitle}</span>
                <span className="text-[10px] text-slate-500">{copy.relockDescription}</span>
              </div>
            </div>
            <button type="button" disabled={!status.coreConnected} onClick={() => void onLockKeyVault()} className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-300 border border-rose-500/25 text-xs">{copy.lockNow}</button>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-950/[0.12] border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2"><Lock className="w-4 h-4 text-purple-300"/><span className="font-semibold text-slate-200">{copy.topSecretAccessTitle}</span></div>
            <p className="text-[10px] text-slate-500 mb-3">{copy.topSecretAccessDescription}</p>
            <div className="space-y-2">
              <input type="password" autoComplete="new-password" value={topSecretSecret} onChange={(e)=>setTopSecretSecret(e.target.value)} placeholder={copy.topSecretSecretPlaceholder} aria-label={copy.topSecretSecretPlaceholder} className="w-full bg-black/40 border border-purple-500/20 rounded-lg px-3 py-1.5 text-xs text-slate-100"/>
              {status.topSecretEnrolled && <input value={topSecretFactor} onChange={(e)=>setTopSecretFactor(e.target.value.trim().slice(0,64))} placeholder={copy.offlineFactorPlaceholder} aria-label={copy.offlineFactorPlaceholder} className="w-full bg-black/40 border border-purple-500/20 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"/>}
              {!status.topSecretEnrolled && <label className="flex gap-2 text-[10px] text-slate-400"><input type="checkbox" checked={requireOfflineFactor} onChange={(e)=>setRequireOfflineFactor(e.target.checked)}/><span>{copy.issueOfflineFactor}</span></label>}
              <div className="flex gap-2">
                {!status.topSecretEnrolled
                  ? <button type="button" disabled={topSecretSecret.length < 16 || !status.coreConnected} onClick={() => void handleEnrollTopSecret()} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">{copy.enrollTopSecret}</button>
                  : <button type="button" disabled={topSecretSecret.length < 16 || !status.coreConnected} onClick={() => void handleUnlockTopSecret()} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">{copy.unlockTopSecret}</button>}
              </div>
              {issuedOfflineFactor && <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-[10px] text-amber-100"><strong>{copy.offlineFactorOneTime}</strong><div className="mt-1 break-all font-mono select-all">{issuedOfflineFactor}</div><div className="mt-1 text-amber-200/70">{copy.offlineFactorDeviceWarning}</div></div>}
              {topSecretMessage && <p className="text-[10px] text-slate-400">{topSecretMessage}</p>}
            </div>
          </div>

                    {/* PIN Setup */}
          <div className="p-3.5 rounded-xl bg-purple-950/[0.12] border border-purple-500/15">
            <div className="flex items-center space-x-2 mb-2">
              <Key className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-slate-200">
                  {status.hasPin ? copy.pinProtectionActive : copy.setPin}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              {copy.pinDescription}
            </p>

            {status.hasPin ? (
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 text-xs font-medium flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{copy.pinRequired}</span>
                </span>
                <button
                  onClick={handleRemovePin}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors text-xs"
                >
                  {copy.removePin}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSavePin} className="flex items-center space-x-2">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,8}"
                  autoComplete="off"
                  placeholder={copy.enterPin}
                  aria-label={copy.enterPin}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                  className="flex-1 bg-black/40 border border-purple-500/20 rounded-lg px-3 py-1.5 text-slate-100 outline-none focus:border-purple-500/60 font-mono tracking-widest text-center"
                />
                <button
                  type="submit"
                  disabled={!/^\d{4,8}$/.test(pinInput)}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-medium transition-colors shadow-md shadow-purple-600/30"
                >
                  {savedSuccess ? copy.saved : copy.enablePin}
                </button>
              </form>
            )}
          </div>

          {/* Portable password */}
          <div className="p-3.5 rounded-xl bg-purple-950/[0.12] border border-purple-500/15">
            <div className="flex items-center space-x-2 mb-2">
              <Key className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-slate-200">
                  {status.hasPortablePassword ? copy.portablePasswordActive : copy.portablePassword}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              {copy.portablePasswordDescription}
            </p>
            {status.hasPortablePassword ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-purple-300 text-[11px]">{copy.passwordRetained}</span>
                <button type="button" onClick={handleRemovePortablePassword} className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs">{copy.removePassword}</button>
              </div>
            ) : (
              <form onSubmit={handleSavePortablePassword} className="flex items-center space-x-2">
                <input type="password" autoComplete="new-password" minLength={8} maxLength={128} placeholder={copy.passwordPlaceholder} aria-label={copy.portablePassword} value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="flex-1 bg-black/40 border border-purple-500/20 rounded-lg px-3 py-1.5 text-slate-100 outline-none focus:border-purple-500/60" />
                <button type="submit" disabled={passwordInput.length < 8 || passwordInput.length > 128} className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-medium text-xs shadow-md shadow-purple-600/30">{copy.enablePassword}</button>
              </form>
            )}
          </div>

          {/* Privacy Mode */}
          <div className="p-3.5 rounded-xl bg-purple-950/[0.12] border border-purple-500/15 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <EyeOff className={`w-4 h-4 ${status.privacyMode ? 'text-amber-400' : 'text-slate-400'}`} />
              <div>
                <span className="font-semibold text-slate-200 block">{copy.privacyTitle}</span>
                <span className="text-[11px] text-slate-400">{copy.privacyDescription}</span>
              </div>
            </div>
            <button
              onClick={onTogglePrivacyMode}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                status.privacyMode
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.1]'
              }`}
            >
              {status.privacyMode ? copy.active : copy.disabled}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-purple-500/15 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 text-purple-200 border border-purple-500/20 text-xs font-medium transition-colors"
          >
            {copy.done}
          </button>
        </div>
      </div>
    </div>
  );
};
