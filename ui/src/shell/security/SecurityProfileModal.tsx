import React, { useEffect, useMemo, useState } from 'react';
import { Shield, ShieldCheck, LockKeyhole, X } from 'lucide-react';
import type { KeyVaultStatus, SecurityProfile, WorkspaceDocument } from '../../shared/contracts/workspace';
import type { TopSecretRuntimeStatus } from '../../platform/security/topSecretEngine';
import { applySecurityProfile, planSecurityProfileTransition, securityPolicyForDocument } from '../../platform/security/securityProfiles';
import { recordLocalSecurityAudit } from '../../platform/security/securityAudit';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellSecurityCopy } from '../i18n/shellSecurityLocale';

interface Props {
  isOpen: boolean;
  document: WorkspaceDocument | null;
  vaultStatus: KeyVaultStatus;
  topSecretStatus: TopSecretRuntimeStatus;
  onClose: () => void;
  onApply: (document: WorkspaceDocument) => void;
  onInitializeIdentity: () => void | Promise<void>;
}

const PROFILES: SecurityProfile[] = ['STANDARD', 'PQC', 'VGT_TOP_SECRET'];

export const SecurityProfileModal: React.FC<Props> = ({ isOpen, document, vaultStatus, topSecretStatus, onClose, onApply, onInitializeIdentity }) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSecurityCopy(locale).profile;
  const current = document ? securityPolicyForDocument(document).profile : 'STANDARD';
  const [selected, setSelected] = useState<SecurityProfile>(current);
  const [downgradeConfirmed, setDowngradeConfirmed] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setSelected(current);
    setDowngradeConfirmed(false);
  }, [current, isOpen, document?.id]);
  const plan = useMemo(() => planSecurityProfileTransition(current, selected, {
    nativeCoreAvailable: vaultStatus.coreConnected === true,
    pqcProviderAvailable: false,
    topSecretProviderAvailable: topSecretStatus.providerReady,
    topSecretEnrolled: vaultStatus.topSecretEnrolled === true,
    topSecretUnlocked: vaultStatus.topSecretUnlocked === true,
    infinityIdentityReady: topSecretStatus.identityReady,
    infinitySuite: topSecretStatus.infinitySuite,
    infinityCommit: topSecretStatus.infinityCommit,
  }, downgradeConfirmed), [current, selected, vaultStatus, topSecretStatus, downgradeConfirmed]);

  if (!isOpen || !document) return null;

  const apply = () => {
    if (!plan.allowed) {
      recordLocalSecurityAudit({ action: 'PROFILE_REJECTED', result: 'REJECTED', from_profile: current, to_profile: selected, diagnostic_code: 'SECURITY_PROFILE_POLICY_REJECTED' });
      return;
    }
    onApply(applySecurityProfile(document, selected, { downgradeAuthorized: downgradeConfirmed }));
    recordLocalSecurityAudit({ action: 'PROFILE_CHANGE', result: 'OK', from_profile: current, to_profile: selected });
    onClose();
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" role="dialog" aria-modal="true" aria-labelledby="security-profile-title">
    <div className="w-full max-w-xl rounded-2xl border border-purple-500/25 bg-[#0a0714] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex gap-3"><div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2"><Shield className="h-5 w-5 text-purple-300"/></div><div><h2 id="security-profile-title" className="text-sm font-bold text-slate-100">{copy.title}</h2><p className="text-[11px] text-slate-400">{copy.current(copy.profileTitle[current])}</p></div></div>
        <button aria-label={copy.close} onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10"><X className="h-4 w-4"/></button>
      </div>
      <div className="mt-4 space-y-2">
        {PROFILES.map((profile) => <button type="button" key={profile} onClick={() => { setSelected(profile); setDowngradeConfirmed(false); }} className={`w-full rounded-xl border p-3 text-left ${selected === profile ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/10 bg-white/[0.02]'}`} aria-pressed={selected===profile}>
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-100">{copy.profileTitle[profile]}</span>{profile === 'VGT_TOP_SECRET' ? <LockKeyhole className="h-4 w-4 text-purple-300"/> : <ShieldCheck className="h-4 w-4 text-slate-500"/>}</div>
          <p className="mt-1 text-[10px] text-slate-500">{copy.profileDetail[profile]}</p>
        </button>)}
      </div>
      {selected === 'VGT_TOP_SECRET' && !topSecretStatus.identityReady && <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-100"><p>{copy.identityMissing}</p><button type="button" disabled={!topSecretStatus.providerReady || !vaultStatus.topSecretUnlocked} onClick={() => void onInitializeIdentity()} className="mt-2 rounded-lg border border-amber-500/30 px-2 py-1 disabled:opacity-40">{copy.initializeIdentity}</button></div>}
      {plan.isDowngrade && <label className="mt-3 flex gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-[10px] text-rose-100"><input type="checkbox" checked={downgradeConfirmed} onChange={(e)=>setDowngradeConfirmed(e.target.checked)}/><span>{copy.downgradeConfirm}</span></label>}
      <div className={`mt-3 rounded-xl border p-3 text-[10px] ${plan.allowed ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/20 bg-amber-500/5 text-amber-100'}`}>{copy.reason(plan.reason)}</div>
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400">{copy.cancel}</button><button onClick={apply} disabled={!plan.allowed || selected===current} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{copy.apply}</button></div>
    </div>
  </div>;
};
