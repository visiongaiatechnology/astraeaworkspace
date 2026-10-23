import React, { useState, useEffect } from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { creativePersonalText } from '../../creativePersonalLocale';
import { vaultAdvancedText, vaultAttestationProviderText, vaultProviderText, vaultSecurityLevelText, vaultSuiteResultText } from '../vaultAdvancedLocale';
import { X, Shield, Cpu, Radio, HardDrive, CheckCircle2, AlertTriangle, RefreshCw, KeyRound, Download, Fingerprint } from 'lucide-react';
import {
  probeHardwareCapabilities, generateHardwareBoundKeyPair, rotateVaultEnclaveKey,
  generateAttestationReport, listEnclaveKeyDescriptors, HardwareKeyCapabilities,
  HardwareKeyDescriptor, EnclaveAttestation,
} from '../../../shared/vault/security/hardware/vaultHardwareKeyEngine';
import { runVaultTestSuite, type VaultSuiteReport, type VaultTestResult } from '../diagnostics/roundtrip/vaultRoundtripTestSuite';
import type { NetworkCapability, VaultFile, VaultFolder, VaultPeerDevice, VaultPeerSyncPolicy } from '../../../shared/contracts/workspace';
import { VaultPeerSyncPanel } from '../../../shared/vault/sync/VaultPeerSyncPanel';

interface VaultAdvancedModalProps {
  isOpen: boolean;
  /**
   * Der Sperrzustand der Vault-Sitzung. **Sicherheitsvertrag:** Ein Dialog, der Datei-Metadaten,
   * Peer-Geräte oder Key-Deskriptoren zeigt, darf nicht offen bleiben, wenn der Tresor sperrt. Die
   * Sperr-Sichtbarkeitsliste (`vaultSessionLock.ts`) nennt `advancedModal` ausdrücklich als Material,
   * das nach dem Sperren unsichtbar sein muss.
   */
  locked: boolean;
  onClose: () => void;
  vaultFiles: VaultFile[];
  /**
   * **V-039.** `null` bedeutet „angefordert, aber noch **nicht** geschrieben": seit vor dem Schreiben eine
   * Warnung steht, darf hier keine Erfolgsmeldung erscheinen, solange der Nutzer nicht bestätigt hat. Eine
   * Meldung „Encrypted Vault backup exported: …" vor der Bestätigung wäre eine Erfolgsmeldung ohne Vorgang.
   */
  onExportEncryptedBackup: () => Promise<string | null>;
  showToast: (msg: string) => void;
  peerSyncPolicy: VaultPeerSyncPolicy;
  peerDevices: VaultPeerDevice[];
  vaultFolders: VaultFolder[];
  networkCapability: NetworkCapability;
  onPeerSyncPolicyChange: (update: Partial<VaultPeerSyncPolicy>) => void;
  onTrustPeer: (peer: VaultPeerDevice) => void;
  onRemovePeer: (peerId: string) => void;
  runSecuritySuite?: () => Promise<VaultSuiteReport>;
}

export const VaultAttestationDetails: React.FC<{ attestation: EnclaveAttestation; locale: WorkspaceLocale }> = ({ attestation, locale }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg bg-black/50 text-[0.6875rem] text-slate-300">
    <div><dt className="text-slate-500">{vaultAdvancedText('attestationKey', locale)}</dt><dd className="font-mono break-all">{attestation.keyId}</dd></div>
    <div><dt className="text-slate-500">{vaultAdvancedText('attestationProvider', locale)}</dt><dd>{vaultAttestationProviderText(attestation.hardwareType, locale)}</dd></div>
    <div><dt className="text-slate-500">{vaultAdvancedText('attestationAlgorithm', locale)}</dt><dd className="font-mono">{attestation.algorithm}</dd></div>
    <div><dt className="text-slate-500">{vaultAdvancedText('attestationTimestamp', locale)}</dt><dd className="font-mono">{attestation.timestamp}</dd></div>
    <div className="sm:col-span-2"><dt className="text-slate-500">{vaultAdvancedText('attestationSignature', locale)}</dt><dd className="font-mono break-all">{attestation.signatureHex}</dd></div>
    <div className="sm:col-span-2 font-semibold" role="status">{vaultAdvancedText(attestation.valid ? 'attestationVerified' : 'attestationFailed', locale)}</div>
  </dl>
);

export const VaultSecuritySuiteRows: React.FC<{ results: readonly VaultTestResult[]; locale: WorkspaceLocale }> = ({ results, locale }) => (
  <div className="space-y-2">
    {results.map((result) => {
      const copy = vaultSuiteResultText(result.id, result.passed, locale);
      return (
        <div key={result.id} className={`p-3.5 rounded-xl border flex items-start space-x-3 ${result.passed ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' : 'bg-rose-950/20 border-rose-500/30 text-rose-200'}`}>
          {result.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold flex items-center justify-between"><span>{copy.name}</span><span className="text-[0.625rem] font-mono text-slate-400">{result.durationMs} ms</span></div>
            <div className="text-[0.6875rem] text-slate-300 mt-1">{copy.message}</div>
          </div>
        </div>
      );
    })}
  </div>
);

export const VaultAdvancedModal: React.FC<VaultAdvancedModalProps> = ({
  isOpen,
  locked,
  onClose,
  vaultFiles,
  onExportEncryptedBackup,
  showToast,
  peerSyncPolicy,
  peerDevices,
  vaultFolders,
  networkCapability,
  onPeerSyncPolicyChange,
  onTrustPeer,
  onRemovePeer,
  runSecuritySuite,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const [activeTab, setActiveTab] = useState<'hardware' | 'relay' | 'container' | 'suite'>('hardware');

  // Hardware Key State
  const [hwCaps, setHwCaps] = useState<HardwareKeyCapabilities | null>(null);
  const [keyDescriptors, setKeyDescriptors] = useState<HardwareKeyDescriptor[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [activeAttestation, setActiveAttestation] = useState<EnclaveAttestation | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  // Suite State
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteReport, setSuiteReport] = useState<VaultSuiteReport | null>(null);

  useEffect(() => {
    if (isOpen) {
      probeHardwareCapabilities().then((caps) => setHwCaps(caps));
      setKeyDescriptors(listEnclaveKeyDescriptors());
    }
  }, [isOpen]);

  // Sperren nimmt das Material zurück, nicht nur den Fokus: kein Renderpfad für verschlüsselte Inhalte
  // (Dateinamen, Digests, Peer-Geräte, Key-Deskriptoren), solange die Sitzung gesperrt ist.
  if (!isOpen || locked) return null;

  const handleCreateHardwareKey = async () => {
    try {
      setIsGeneratingKey(true);
      const { descriptor } = await generateHardwareBoundKeyPair(newKeyLabel || 'Vault Hardware Key');
      setKeyDescriptors(listEnclaveKeyDescriptors());
      setNewKeyLabel('');
      showToast(t('Signing key created: {label}. Hardware backing is not asserted.').replace('{label}', descriptor.label));
    } catch {
      showToast(t('Vault operation failed.'));
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleRotateKey = async (keyId: string) => {
    try {
      const res = await rotateVaultEnclaveKey(keyId, 'Rotated Enclave Key');
      setKeyDescriptors(listEnclaveKeyDescriptors());
      showToast(t('Signing key rotated: new key {id} active; Vault data rekey is separate.').replace('{id}', res.newKeyId.slice(0, 10)));
    } catch {
      showToast(t('Vault operation failed.'));
    }
  };

  const handleAttestation = async (keyId: string) => {
    try {
      const report = await generateAttestationReport(keyId);
      setActiveAttestation(report);
      showToast(t('WebCrypto key self-verification report signed and verified; this is not hardware attestation.'));
    } catch {
      showToast(t('Vault operation failed.'));
    }
  };

  const handleRunSuite = async () => {
    try {
      setIsRunningSuite(true);
      const report = await (runSecuritySuite ?? runVaultTestSuite)();
      setSuiteReport(report);
      showToast(t('Suite finished: {passed}/{total} tests passed.').replace('{passed}', String(report.passedCount)).replace('{total}', String(report.totalCount)));
    } catch {
      showToast(t('Vault operation failed.'));
    } finally {
      setIsRunningSuite(false);
    }
  };

  const handleExportContainer = async () => {
    try {
      const filename = await onExportEncryptedBackup();
      /*
       * **V-039.** `null` heißt: der Export ist nur **angefordert**. Seit V-039 steht davor eine Warnpforte,
       * die der Nutzer erst bestätigen muss. Eine Erfolgsmeldung hier wäre eine Meldung ohne Vorgang — die
       * Bestätigung meldet sich selbst.
       */
      if (!filename) return;
      showToast(t('Encrypted Vault backup exported: {filename}').replace('{filename}', filename));
    } catch {
      showToast(t('Vault operation failed.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150" role="dialog" aria-modal="true" aria-labelledby="vault-advanced-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="relative w-full max-w-4xl bg-[#0e0a1a] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/20 bg-purple-950/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 id="vault-advanced-title" className="text-sm font-semibold text-slate-100 flex items-center space-x-2">
                <span>{t('Astraea Vault — Advanced Interop & Key Security')}</span>
                <span className="text-[0.625rem] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                  Provider-aware
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Provider-reported hardware capability, peer relay federation, encrypted containers and fidelity verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close Vault advanced settings')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-purple-500/20 bg-purple-950/10 space-x-1">
          <button
            onClick={() => setActiveTab('hardware')}
            className={`flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'hardware'
                ? 'border-purple-400 text-purple-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{t('Key Capabilities & Signing')}</span>
          </button>

          <button
            onClick={() => setActiveTab('relay')}
            className={`flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'relay'
                ? 'border-purple-400 text-purple-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{t('Relay & Federation Sync')}</span>
          </button>

          <button
            onClick={() => setActiveTab('container')}
            className={`flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'container'
                ? 'border-purple-400 text-purple-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>{t('Encrypted .vvault Containers')}</span>
          </button>

          <button
            onClick={() => setActiveTab('suite')}
            className={`flex items-center space-x-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'suite'
                ? 'border-purple-400 text-purple-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t('Fidelity & Security Audit Suite')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 text-slate-200 space-y-6">
          {/* Tab 1: Key Capabilities & Signing */}
          {activeTab === 'hardware' && (
            <div className="space-y-6">
              {/* Capability Overview */}
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-[0.6875rem] text-slate-400 uppercase tracking-wider font-mono">{t('Browser / Authenticator')}</div>
                  <div className="text-xs font-semibold text-purple-300 mt-1">
                    {hwCaps?.enclaveProvider ? vaultProviderText(hwCaps.enclaveProvider, locale) : vaultAdvancedText('probing', locale)}
                  </div>
                </div>
                <div>
                  <div className="text-[0.6875rem] text-slate-400 uppercase tracking-wider font-mono">{t('Security Tier')}</div>
                  <div className="text-xs font-semibold text-emerald-400 mt-1 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{hwCaps?.securityLevel ? vaultSecurityLevelText(hwCaps.securityLevel, locale) : vaultAdvancedText('probing', locale)}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[0.6875rem] text-slate-400 uppercase tracking-wider font-mono">WebAuthn PRF</div>
                  <div className="text-xs font-semibold text-slate-200 mt-1">
                    {vaultAdvancedText(hwCaps?.hasPrfExtension ? 'authenticatorAvailable' : 'authenticatorUnavailable', locale)}
                  </div>
                </div>
              </div>

              {/* Key Registration */}
              <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 space-y-3">
                <div className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
                  <KeyRound className="w-4 h-4 text-purple-400" />
                  <span>{t('Generate Non-Extractable WebCrypto Signing Key (ECDSA P-256)')}</span>
                </div>
                <div className="flex space-x-3">
                  <input
                    type="text"
                    placeholder={t('Key Label (e.g. Master Vault Enclave Key)')}
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-purple-500/30 text-xs text-slate-200 focus:outline-none focus:border-purple-400"
                  />
                  <button
                    onClick={handleCreateHardwareKey}
                    disabled={isGeneratingKey}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center space-x-2 disabled:opacity-50"
                  >
                    {isGeneratingKey ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Fingerprint className="w-3.5 h-3.5" />}
                    <span>{t('Generate Signing Key')}</span>
                  </button>
                </div>
              </div>

              {/* Active Keys List */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-300">{t('Registered Hardware Enclave Keys')}</div>
                {keyDescriptors.length === 0 ? (
                  <div className="p-4 text-center rounded-xl bg-black/20 border border-purple-500/10 text-xs text-slate-400">
                    No hardware keys registered yet. Generate one above or run the verification suite.
                  </div>
                ) : (
                  keyDescriptors.map((kd) => (
                    <div
                      key={kd.id}
                      className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-purple-200 flex items-center space-x-2">
                          <span>{kd.label}</span>
                          <span className="text-[0.625rem] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 font-mono">
                            Non-Extractable
                          </span>
                        </div>
                        <div className="text-[0.6875rem] text-slate-400 font-mono mt-0.5">
                          ID: {kd.id} | Alg: {kd.algorithm} | Hash: {kd.attestationDigest.slice(0, 16)}...
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleAttestation(kd.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/40 text-purple-300 border border-purple-500/30 text-xs"
                        >
                          Attest
                        </button>
                        <button
                          onClick={() => handleRotateKey(kd.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 border border-indigo-500/30 text-xs"
                        >
                          Rotate
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Attestation Result Viewer */}
              {activeAttestation && (
                <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-2">
                  <div className="text-xs font-semibold text-purple-300 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{t('Cryptographic Attestation Verification Report')}</span>
                  </div>
                  <VaultAttestationDetails attestation={activeAttestation} locale={locale} />
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Optional Peer Sync */}
          {activeTab === 'relay' && (
            <VaultPeerSyncPanel
              files={vaultFiles}
              folders={vaultFolders}
              policy={peerSyncPolicy}
              peers={peerDevices}
              networkCapability={networkCapability}
              onPolicyChange={onPeerSyncPolicyChange}
              onTrustPeer={onTrustPeer}
              onRemovePeer={onRemovePeer}
              showToast={showToast}
            />
          )}

          {/* Tab 3: Container & Backups */}
          {activeTab === 'container' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-4">
                <div className="text-xs font-semibold text-purple-300 flex items-center space-x-2">
                  <HardDrive className="w-4 h-4" />
                  <span>{t('Portable Native .vvault Encrypted Backup Container')}</span>
                </div>
                <p className="text-xs text-slate-400">
                  Exports current Vault files, metadata, and Merkle tree hashes into an encrypted container with SHA-256
                  anti-tampering seal.
                </p>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => void handleExportContainer()}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-medium flex items-center space-x-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('Export .vvault Container')} ({vaultFiles.length} {t('files')})</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Fidelity & Security Audit Suite */}
          {activeTab === 'suite' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-xl bg-purple-950/20 border border-purple-500/20">
                <div>
                  <div className="text-xs font-semibold text-purple-300">{t('6-Point Local Vault Security Self-Test')}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Executes production local crypto, integrity, E2EE and quarantine cores; it does not claim live network or hardware backing
                  </div>
                </div>
                <button
                  onClick={handleRunSuite}
                  disabled={isRunningSuite}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-medium flex items-center space-x-2 disabled:opacity-50"
                >
                  {isRunningSuite ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{t('Run Local Self-Test')}</span>
                </button>
              </div>

              {suiteReport && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="font-semibold text-slate-300">{t('Execution Results')}</span>
                    <span
                      className={`font-mono font-medium ${
                        suiteReport.overallPassed ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {suiteReport.passedCount} / {suiteReport.totalCount} Passed
                    </span>
                  </div>

                  <div className="space-y-2">
                    <VaultSecuritySuiteRows results={suiteReport.results} locale={locale} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
