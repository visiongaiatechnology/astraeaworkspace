// STATUS: DIAMANT VGT SUPREME — Astraea Workspace Platform Architecture & Security Modal
import React, { useState, useEffect } from 'react';
import {
  Shield,
  Cpu,
  Share2,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  X,
  AlertTriangle,
  Lock,
  Boxes,
  Terminal,
} from 'lucide-react';
import {
  runKeyVaultHardwareAttestation,
  AttestationReport,
} from '../../platform/keyvault/keyVaultHardwareAttestation';
import {
  WorkspaceWasmSandbox,
  STANDARD_MATH_PLUGIN_MANIFEST,
  STANDARD_SUMMARY_PLUGIN_MANIFEST,
  SandboxExecutionResult,
  demoWasmConstant,
  demoPermitForManifest,
} from '../../platform/plugin-runtime/sandbox/workspaceWasmSandbox';
import {
  runWorkspacePlatformTestSuite,
  PlatformSuiteReport,
  type PlatformTestResult,
} from '../../platform/workspace/roundtrip/workspacePlatformRoundtripTestSuite';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { platformAdvancedCopy, type PlatformTestId } from '../i18n/platformAdvancedLocale';

const PLATFORM_TEST_IDS: readonly PlatformTestId[] = [
  'VWC_STORAGE_CONTAINER_ROUNDTRIP',
  'KEYVAULT_HARDWARE_ATTESTATION',
  'WASM_SANDBOX_ISOLATION',
  'WORKSPACE_FABRIC_LIVE_OBJECTS',
  'CANONICAL_WORK_ITEM_SYNC',
  'OFFICE_ODF_INTEROP_SANDBOX',
];

function isPlatformTestId(value: string): value is PlatformTestId {
  return PLATFORM_TEST_IDS.some((id) => id === value);
}

function localizedPlatformTest(copy: ReturnType<typeof platformAdvancedCopy>, result: PlatformTestResult): { name: string; message: string } {
  if (!isPlatformTestId(result.id)) return { name: copy.suite.unknownTest, message: result.message };
  const test = copy.suite.test[result.id];
  if (result.message.startsWith('Error: ')) {
    return { name: test.name, message: `${copy.suite.errorDetail}: ${result.message.slice('Error: '.length)}` };
  }
  return { name: test.name, message: result.passed ? test.passed : test.failed };
}

interface WorkspacePlatformAdvancedModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const WorkspacePlatformAdvancedModal: React.FC<WorkspacePlatformAdvancedModalProps> = ({
  isOpen,
  onClose,
  showToast,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = platformAdvancedCopy(locale);
  const [activeTab, setActiveTab] = useState<'keyvault' | 'wasm' | 'fabric' | 'suite'>('keyvault');
  // KeyVault Attestation State
  const [attestationReport, setAttestationReport] = useState<AttestationReport | null>(null);
  const [isAttesting, setIsAttesting] = useState(false);
  // WASM Sandbox State
  const [selectedPlugin, setSelectedPlugin] = useState<'math' | 'summary'>('math');
  const [sandboxResult, setSandboxResult] = useState<SandboxExecutionResult | null>(null);
  const [isExecutingSandbox, setIsExecutingSandbox] = useState(false);
  // Platform Suite State
  const [suiteReport, setSuiteReport] = useState<PlatformSuiteReport | null>(null);
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  useEffect(() => {
    if (isOpen) {
      handleRunAttestation(false);
    }
  }, [isOpen]);
  if (!isOpen) return null;
  const selectedManifest = selectedPlugin === 'math' ? STANDARD_MATH_PLUGIN_MANIFEST : STANDARD_SUMMARY_PLUGIN_MANIFEST;
  const updateSource = selectedManifest.updateSource;
  const updateSourceIdentifier = updateSource.kind === 'offline-file'
    ? updateSource.sourceId
    : updateSource.kind === 'managed-channel' ? updateSource.channelId : null;

  const handleRunAttestation = async (claimHardware: boolean) => {
    try {
      setIsAttesting(true);
      const report = await runKeyVaultHardwareAttestation(claimHardware);
      setAttestationReport(report);
      showToast(
        copy.attestation.completed(claimHardware)
      );
    } catch (err) {
      showToast(`${copy.attestation.error}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAttesting(false);
    }
  };

  const handleRunSandboxScript = async () => {
    try {
      setIsExecutingSandbox(true);
      const manifest = selectedManifest;
      const sandbox = new WorkspaceWasmSandbox(demoPermitForManifest(manifest));

      const demoValue = selectedPlugin === 'math' ? 84 : 3;
      const res = await sandbox.executeWasmModule(
        demoWasmConstant(demoValue),
        manifest.entrypoints[0].exportName,
        [],
      );
      setSandboxResult(res);
      showToast(copy.wasm.executionToast(copy.wasm.status[res.status]));
    } catch (err) {
      showToast(`${copy.wasm.error}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExecutingSandbox(false);
    }
  };

  const handleRunTestSuite = async () => {
    try {
      setIsRunningSuite(true);
      const rep = await runWorkspacePlatformTestSuite();
      setSuiteReport(rep);
      showToast(
        rep.allPassed
          ? copy.suite.completedToast
          : copy.suite.issuesToast
      );
    } catch (err) {
      showToast(`${copy.suite.error}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRunningSuite(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={copy.header.close} className="relative w-full max-w-4xl rounded-2xl glass-dropdown p-6 shadow-2xl border border-purple-500/30 z-10 flex flex-col max-h-[90vh] overflow-hidden bg-[#0d0a1a]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>Astraea Workspace Platform Core</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                  DIAMANT VGT SUPREME
                </span>
              </h3>
              <p className="text-xs text-slate-400">{copy.header.description}</p>
            </div>
          </div>
          <button aria-label={copy.header.close}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-purple-500/20 text-slate-400 hover:text-purple-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 pt-3 pb-2 border-b border-purple-500/15">
          <button
            onClick={() => setActiveTab('keyvault')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'keyvault'
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{copy.tabs.keyvault}</span>
          </button>
          <button
            onClick={() => setActiveTab('wasm')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'wasm'
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{copy.tabs.wasm}</span>
          </button>
          <button
            onClick={() => setActiveTab('fabric')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'fabric'
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{copy.tabs.fabric}</span>
          </button>
          <button
            onClick={() => setActiveTab('suite')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'suite'
                ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{copy.tabs.suite}</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="py-4 overflow-y-auto space-y-4 text-xs pr-1 flex-1">
          {/* Tab 1: KeyVault Hardware Attestation */}
          {activeTab === 'keyvault' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-purple-200 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-purple-400" />
                    <span>{copy.attestation.heading}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {copy.attestation.description}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleRunAttestation(false)}
                    disabled={isAttesting}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isAttesting ? 'animate-spin' : ''}`} />
                    <span>{copy.attestation.attest}</span>
                  </button>
                  <button
                    onClick={() => handleRunAttestation(true)}
                    disabled={isAttesting}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-xs transition-all"
                    title={copy.attestation.testClaimTitle}
                  >
                    <span>{copy.attestation.testClaim}</span>
                  </button>
                </div>
              </div>

              {attestationReport && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-black/40 border border-purple-500/20">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">{copy.attestation.tier}</div>
                      <div className="text-xs font-bold text-purple-300 mt-0.5 font-mono truncate">
                        {copy.attestation.tierName[attestationReport.tier]}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-black/40 border border-purple-500/20">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">{copy.attestation.verdict}</div>
                      <div
                        className={`text-xs font-bold mt-0.5 font-mono ${
                          attestationReport.verdict.startsWith('VERIFIED')
                            ? 'text-emerald-400'
                            : attestationReport.verdict === 'UNVERIFIED_CLAIM_DEGRADED'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {copy.attestation.verdictName[attestationReport.verdict]}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-black/40 border border-purple-500/20">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">{copy.attestation.hardwareBacked}</div>
                      <div className="text-xs font-bold text-slate-100 mt-0.5">
                        {attestationReport.hardwareBacked ? copy.attestation.yesVerified : copy.attestation.noFallback}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-black/40 border border-purple-500/20">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">{copy.attestation.nonExtractable}</div>
                      <div className="text-xs font-bold text-emerald-400 mt-0.5">
                        {attestationReport.isNonExtractable ? copy.attestation.confirmed : copy.attestation.failed}
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/30 border border-purple-500/15 space-y-2">
                    <div className="text-xs font-semibold text-slate-300">{copy.attestation.reportDetails}</div>
                    <p className="text-[11px] text-slate-400">{attestationReport.explanation}</p>
                    <div className="font-mono text-[10px] text-slate-500 break-all">
                      {copy.attestation.challenge}: {attestationReport.attestationChallengeHex}
                    </div>
                    {attestationReport.signatureDigestHex && (
                      <div className="font-mono text-[10px] text-emerald-400 break-all">
                        {copy.attestation.signature}: {attestationReport.signatureDigestHex}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: WASM Sandbox */}
          {activeTab === 'wasm' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-purple-200 flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    <span>{copy.wasm.heading}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {copy.wasm.description}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    aria-label={copy.wasm.selectPlugin}
                    value={selectedPlugin}
                    onChange={(e) => setSelectedPlugin(e.target.value as 'math' | 'summary')}
                    className="bg-black/50 border border-purple-500/30 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none"
                  >
                    <option value="math">{copy.wasm.pluginName.math}</option>
                    <option value="summary">{copy.wasm.pluginName.summary}</option>
                  </select>
                  <button
                    onClick={handleRunSandboxScript}
                    disabled={isExecutingSandbox}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{copy.wasm.execute}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-black/40 border border-purple-500/15">
                  <div className="text-[10px] uppercase font-mono text-slate-500">{copy.wasm.runtimePolicy}</div>
                  <div className="text-[11px] text-emerald-300 mt-1">{copy.wasm.runtimePolicyDetail}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/40 border border-purple-500/15">
                  <div className="text-[10px] uppercase font-mono text-slate-500">{copy.wasm.apiPackage}</div>
                  <div className="text-[11px] text-slate-300 mt-1 font-mono">{selectedManifest.apiCompatibility.minimumInclusive}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{copy.wasm.packageVerification}</div>
                </div>
                <div className="p-3 rounded-lg bg-black/40 border border-purple-500/15">
                  <div className="text-[10px] uppercase font-mono text-slate-500">{copy.wasm.installReview}</div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    {selectedManifest.requestedCapabilities.length === 0 ? copy.wasm.noCapabilities : selectedManifest.requestedCapabilities.join(', ')}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{copy.wasm.publisher}: {selectedManifest.publisher} · {copy.wasm.signature}: {selectedManifest.signature ? copy.wasm.signaturePresent : copy.wasm.unsignedReview}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{copy.wasm.updateSource}: {copy.wasm.updateSourceKind[updateSource.kind]}{updateSourceIdentifier ? ` · ${updateSourceIdentifier}` : ''}</div>
                  <div className="text-[10px] text-amber-300 mt-1">{copy.wasm.capabilityReconsent}</div>
                </div>
              </div>

              {sandboxResult && (
                <div className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{copy.wasm.result}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        sandboxResult.success
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-rose-950 text-rose-300'
                      }`}
                    >
                      {copy.wasm.status[sandboxResult.status]}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {copy.wasm.time}: {sandboxResult.executionTimeMs} ms | {copy.wasm.memoryBound}: {sandboxResult.memoryAllocatedBytes} B
                  </div>
                  <div className="p-2.5 rounded bg-black/60 border border-purple-500/10 font-mono text-[11px] text-purple-300">
                    {JSON.stringify(sandboxResult.data, null, 2)}
                  </div>
                  <div className="space-y-1 pt-1">
                    <div className="text-[10px] uppercase font-mono text-slate-500">{copy.wasm.auditTrail}</div>
                    {sandboxResult.auditLog.map((log, idx) => (
                      <div key={idx} className="text-[10px] font-mono text-slate-400">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Fabric & Interop */}
          {activeTab === 'fabric' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-2">
                <div className="text-xs font-semibold text-purple-200 flex items-center space-x-2">
                  <Share2 className="w-4 h-4 text-purple-400" />
                  <span>{copy.fabric.heading}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {copy.fabric.description}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 space-y-2">
                  <div className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>{copy.fabric.officeHeading}</span>
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-slate-400">
                    {copy.fabric.officeProtection.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 space-y-2">
                  <div className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{copy.fabric.workItemHeading}</span>
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-slate-400">
                    {copy.fabric.workItemProtection.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Security & Roundtrip Suite */}
          {activeTab === 'suite' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-purple-200 flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <span>{copy.suite.heading}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {copy.suite.description}
                  </div>
                </div>
                <button
                  onClick={handleRunTestSuite}
                  disabled={isRunningSuite}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg shadow-purple-600/30 transition-all"
                >
                  <Play className={`w-3.5 h-3.5 ${isRunningSuite ? 'animate-spin' : ''}`} />
                  <span>{copy.suite.run}</span>
                </button>
              </div>

              {suiteReport && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-purple-500/20">
                    <div className="flex items-center space-x-2">
                      {suiteReport.allPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-xs font-semibold text-slate-200">
                        {suiteReport.allPassed
                          ? copy.suite.allPassed
                          : copy.suite.failed}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-purple-300">
                      {suiteReport.passedCount} / {suiteReport.totalTests} {copy.suite.passed} (
                      {suiteReport.totalDurationMs} ms)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {suiteReport.results.map((r) => {
                      const localized = localizedPlatformTest(copy, r);
                      return (
                      <div
                        key={r.id}
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                          r.passed
                            ? 'bg-emerald-950/10 border-emerald-500/20'
                            : 'bg-rose-950/20 border-rose-500/30'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{localized.name}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{localized.message}</div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300 shrink-0">
                          {r.durationMs} ms
                        </span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-purple-500/15 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 text-purple-200 border border-purple-500/20 text-xs font-medium transition-colors"
          >
            {copy.footerClose}
          </button>
        </div>
      </div>
    </div>
  );
};
