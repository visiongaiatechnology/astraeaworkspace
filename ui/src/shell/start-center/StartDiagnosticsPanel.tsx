import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  FileDown,
  RefreshCw,
  Trash2,
  Boxes,
} from 'lucide-react';
import type { RecoverySnapshotInfo } from '../../platform/recovery/recovery';
import { ALPHA_KNOWN_ISSUES } from '../../platform/release/alphaStatus';
import { diagnosticDebugModeState } from '../../platform/diagnostics/diagnosticLog';
import { readRecoverySafeMode, setDiagnosticDebugMode, setRecoverySafeMode, type RecoverySafeModeStatus } from '../../platform/diagnostics/diagnosticsReleaseClient';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { formatShellNumber, shellSurfaceCopy } from '../i18n/shellSurfaceLocale';

interface StartDiagnosticsPanelProps {
  onOpenFileClick: () => void;
  onOpenVault: () => void;
  recoverySnapshots: RecoverySnapshotInfo[];
  onRestoreRecovery: (snapshotId: string) => void;
  onDeleteRecovery: (snapshotId: string) => void;
  onExportDiagnostics: () => void;
  onOpenPlatformModal?: () => void;
}

const secondaryButtonClass = 'vgt-button-secondary inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-accent-strong)]';

export const StartDiagnosticsPanel: React.FC<StartDiagnosticsPanelProps> = ({
  onOpenFileClick,
  onOpenVault,
  recoverySnapshots,
  onRestoreRecovery,
  onDeleteRecovery,
  onExportDiagnostics,
  onOpenPlatformModal,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellSurfaceCopy(locale);
  const [debugState, setDebugState] = useState(() => diagnosticDebugModeState());
  const [safeMode, setSafeMode] = useState<RecoverySafeModeStatus | null>(null);
  useEffect(() => {
    let active = true;
    void readRecoverySafeMode().then((status) => { if (active) setSafeMode(status); });
    const timer = window.setInterval(() => setDebugState(diagnosticDebugModeState()), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const toggleDebug = async (enabled: boolean) => {
    const state = await setDiagnosticDebugMode(enabled, 15 * 60 * 1000);
    setDebugState(state);
  };

  const toggleSafeMode = async () => {
    const state = await setRecoverySafeMode(!(safeMode?.enabled ?? false));
    setSafeMode(state);
  };

  return (
    <section aria-label={copy.diagnostics.ariaLabel} className="space-y-5">
      {recoverySnapshots.length > 0 && (
        <div className="glass-panel rounded-2xl border-l-2 border-l-[var(--vgt-control-warning)] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] text-[var(--vgt-control-warning)]">
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.diagnostics.recoveryTitle}</h2>
                <p className="text-[11px] text-[var(--vgt-text-muted)]">
                  {copy.diagnostics.recoveryDescription}
                </p>
              </div>
            </div>
            <span className="rounded border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--vgt-control-warning)]">
              {formatShellNumber(locale, recoverySnapshots.length)} {copy.diagnostics.snapshots}
            </span>
          </div>

          <div className="space-y-2">
            {recoverySnapshots.slice(0, 4).map((snap) => (
              <div
                key={snap.snapshot_id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-3 text-xs sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[var(--vgt-text-primary)]">
                    {snap.document_kind ?? copy.diagnostics.protected} · {copy.diagnostics.snapshotFrom} {new Date(snap.created_at).toLocaleString(locale)}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-[var(--vgt-text-muted)]">
                    {Math.max(1, Math.round(snap.size_bytes / 1024))} KiB · {snap.security_profile} ·{' '}
                    {snap.requires_pin ? copy.diagnostics.pinProtected : snap.requires_password ? copy.diagnostics.passwordProtected : snap.security_profile === 'VGT_TOP_SECRET' ? copy.diagnostics.topSecretUnlock : copy.diagnostics.deviceBound}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRestoreRecovery(snap.snapshot_id)}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--vgt-control-warning)] transition-colors hover:bg-[var(--vgt-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-control-warning)]"
                  >
                    {copy.diagnostics.restore}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRecovery(snap.snapshot_id)}
                    className="vgt-button-secondary rounded-lg p-1.5 text-[var(--vgt-control-muted)]"
                    aria-label={copy.diagnostics.discard}
                    title={copy.diagnostics.discard}
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="glass-panel flex flex-col justify-between rounded-2xl p-5">
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] text-[var(--vgt-control-muted)]">
                <FolderOpen aria-hidden="true" className="h-4 w-4" />
              </div>
              <h2 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.diagnostics.nativeTitle}</h2>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--vgt-text-muted)]">
              {copy.diagnostics.nativeDescription}
            </p>
          </div>
          <div className="mt-4 border-t border-[var(--vgt-metal-edge)] pt-3">
            <button
              type="button"
              onClick={onOpenFileClick}
              className="vgt-button-primary flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-accent-strong)]"
            >
              <FolderOpen aria-hidden="true" className="h-4 w-4" />
              <span>{copy.diagnostics.openLocalFile}</span>
            </button>
          </div>
        </div>

        <div className="glass-panel flex flex-col justify-between rounded-2xl p-5">
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] text-[var(--vgt-control-success)]">
                <HardDrive aria-hidden="true" className="h-4 w-4" />
              </div>
              <h2 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.diagnostics.vaultTitle}</h2>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--vgt-text-muted)]">
              {copy.diagnostics.vaultDescription}
            </p>
          </div>
          <div className="mt-4 border-t border-[var(--vgt-metal-edge)] pt-3">
            <button
              type="button"
              onClick={onOpenVault}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-3 py-2 text-xs font-medium text-[var(--vgt-control-success)] transition-colors hover:bg-[var(--vgt-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-control-success)]"
            >
              <HardDrive aria-hidden="true" className="h-4 w-4" />
              <span>{copy.diagnostics.enterVault}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel flex flex-col items-start justify-between gap-4 rounded-2xl p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--vgt-control-success)]" />
          <div>
            <h3 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.diagnostics.sovereigntyTitle}</h3>
            <p className="mt-0.5 text-[11px] text-[var(--vgt-text-muted)]">
              {copy.diagnostics.sovereigntyDescription}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onOpenPlatformModal && (
            <button type="button" onClick={onOpenPlatformModal} className={secondaryButtonClass}>
              <Boxes aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{copy.diagnostics.platformTests}</span>
            </button>
          )}
          <button type="button" onClick={onExportDiagnostics} className={secondaryButtonClass}>
            <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{copy.diagnostics.createReport}</span>
          </button>
          <button
            type="button"
            onClick={() => void toggleDebug(!debugState.enabled)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-control-warning)] ${debugState.enabled ? 'border-[var(--vgt-control-warning)] bg-[var(--vgt-control-active)] text-[var(--vgt-control-warning)]' : 'border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)]'}`}
            title={debugState.enabled && debugState.enabledUntilMs ? `${copy.diagnostics.debugTitle} ${new Date(debugState.enabledUntilMs).toLocaleTimeString(locale)}` : copy.diagnostics.enableDebug}
          >
            {debugState.enabled ? copy.diagnostics.debugActive : copy.diagnostics.debugTimed}
          </button>
          <button
            type="button"
            onClick={() => void toggleSafeMode()}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vgt-control-danger)] ${safeMode?.enabled ? 'border-[var(--vgt-control-danger)] bg-[var(--vgt-control-active)] text-[var(--vgt-control-danger)]' : 'border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] text-[var(--vgt-control-muted)] hover:bg-[var(--vgt-control-hover)]'}`}
            title={copy.diagnostics.safeModeTitle}
          >
            {safeMode?.enabled ? copy.diagnostics.safeModeActive : copy.diagnostics.safeMode}
          </button>
        </div>
      </div>
      {debugState.enabled && (
        <div className="glass-panel rounded-xl border-l-2 border-l-[var(--vgt-control-warning)] px-4 py-2 text-[11px] text-[var(--vgt-control-warning)]">
          {copy.diagnostics.debugNotice}
        </div>
      )}
      {safeMode?.enabled && (
        <div className="glass-panel rounded-xl border-l-2 border-l-[var(--vgt-control-danger)] px-4 py-2 text-[11px] text-[var(--vgt-control-danger)]">
          {copy.diagnostics.safeModeNotice}
        </div>
      )}

      <div className="glass-panel rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-[var(--vgt-control-warning)]" />
          <h3 className="text-xs font-semibold text-[var(--vgt-text-primary)]">{copy.diagnostics.betaConditions}</h3>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ALPHA_KNOWN_ISSUES.slice(0, 4).map((issue) => (
            <div key={issue.id} className="rounded-lg border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-2.5 text-left">
              <div className="text-[11px] font-medium text-[var(--vgt-text-secondary)]">{copy.betaIssues[issue.id as keyof typeof copy.betaIssues]?.area ?? issue.area}</div>
              <div className="mt-0.5 text-[10px] leading-relaxed text-[var(--vgt-text-muted)]">{copy.betaIssues[issue.id as keyof typeof copy.betaIssues]?.summary ?? issue.summary}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
