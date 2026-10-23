import React, { useState } from 'react';
import { Shield, Lock, Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { NetworkAuditEntry, NetworkCapability } from '../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellNetworkStaticValues, shellSecurityCopy } from '../i18n/shellSecurityLocale';

interface NetGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  capability: NetworkCapability;
  onChangeCapability: (cap: NetworkCapability) => void;
  auditLogs: NetworkAuditEntry[];
  activeDocumentId: string;
  onTriggerTestConnection: (target: string, purpose: string) => void | Promise<void>;
}

export const NetGateModal: React.FC<NetGateModalProps> = ({
  isOpen,
  onClose,
  capability,
  onChangeCapability,
  auditLogs,
  activeDocumentId,
  onTriggerTestConnection,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSecurityCopy(locale).netgate;
  const networkValues = shellNetworkStaticValues(locale);
  const [testTarget, setTestTarget] = useState('127.0.0.1');
  const [testPurpose, setTestPurpose] = useState('Interactive Workspace policy evaluation');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="netgate-title" className="relative w-full max-w-2xl rounded-2xl glass-dropdown p-6 shadow-2xl border border-purple-500/25 z-10 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/15">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span id="netgate-title">{copy.title}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  {copy.engine}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {copy.description}
              </p>
            </div>
          </div>
          <button aria-label={copy.close}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-purple-500/15 text-slate-400 hover:text-purple-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 space-y-5 overflow-y-auto flex-1">
          {/* Capability Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block uppercase tracking-wider">
              {copy.capabilityHeading}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div
                onClick={() => onChangeCapability('None')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  capability === 'None'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Lock className="w-4 h-4" />
                  <span className="text-xs font-bold">{copy.capabilityTitle.None}</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-80">
                  {copy.capabilityDescription.None}
                </p>
              </div>

              <div
                onClick={() => onChangeCapability('LocalLanOnly')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  capability === 'LocalLanOnly'
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                    : 'bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs font-bold">{copy.capabilityTitle.LocalLanOnly}</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-80">
                  {copy.capabilityDescription.LocalLanOnly}
                </p>
              </div>

              <div
                onClick={() => onChangeCapability('WhitelistedOnly')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  capability === 'WhitelistedOnly'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-200 shadow-md shadow-purple-900/30'
                    : 'bg-white/[0.02] border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-purple-200">{copy.capabilityTitle.WhitelistedOnly}</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-80">
                  {copy.capabilityDescription.WhitelistedOnly}
                </p>
              </div>
            </div>
          </div>

          {/* Side-effect-free NetGate Policy Preview */}
          <div className="p-3.5 rounded-xl bg-purple-950/[0.12] border border-purple-500/15">
            <span className="text-xs font-semibold text-slate-300 block mb-2">
              {copy.previewHeading}
            </span>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={testTarget}
                  onChange={(e) => setTestTarget(e.target.value)}
                  aria-label={copy.target}
                  placeholder={copy.targetPlaceholder}
                  className="flex-1 bg-black/40 border border-purple-500/20 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500/60 font-mono"
                />
                <button
                  onClick={() => { void onTriggerTestConnection(testTarget, testPurpose); }}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-medium transition-colors flex items-center space-x-1.5 shadow-md shadow-purple-600/30"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{copy.previewButton}</span>
                </button>
              </div>
              <input
                type="text"
                value={testPurpose}
                maxLength={512}
                onChange={(e) => setTestPurpose(e.target.value)}
                aria-label={copy.purposePlaceholder}
                placeholder={copy.purposePlaceholder}
                className="w-full bg-black/40 border border-purple-500/20 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500/60"
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 font-mono">
                <span>{copy.scope}: {activeDocumentId || 'workspace-shell'}</span>
                <span>{copy.protocol}: HTTPS/443</span>
                <span>{copy.direction}: {networkValues.outbound}</span>
                <span>{copy.dataClass}: {networkValues.metadata}</span>
              </div>
            </div>
          </div>

          {/* Audit Log Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {copy.auditHeading(auditLogs.length)}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {copy.auditDescription}
              </span>
            </div>

            <div className="border border-purple-500/20 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-black/30">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-purple-950/40 text-purple-200/70 font-mono border-b border-purple-500/20">
                  <tr>
                    <th className="p-2">{copy.time}</th>
                    <th className="p-2">{copy.component}</th>
                    <th className="p-2">{copy.target}</th>
                    <th className="p-2">{copy.verdict}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10 font-mono text-slate-300">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-500 text-xs">
                        {copy.empty}
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-purple-500/5">
                        <td className="p-2 text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString(locale)}
                        </td>
                        <td className="p-2 text-purple-300">{log.component}</td>
                        <td className="p-2 truncate max-w-[160px]" title={log.target_host}>
                          {log.target_host}
                        </td>
                        <td className="p-2">
                          {log.verdict === 'Allowed' ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-0.5" />
                              {copy.networkVerdict.Allowed}
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20" title={log.capability_id ?? undefined}>
                              <XCircle className="w-3 h-3 mr-0.5" />
                              {copy.networkVerdict[log.verdict]}
                            </span>
                          )}                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-purple-500/15 flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-500 max-w-md">{copy.footer}</p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 text-purple-200 border border-purple-500/20 text-xs font-medium transition-colors"
          >
            {copy.closeInspector}
          </button>
        </div>
      </div>
    </div>
  );
};
