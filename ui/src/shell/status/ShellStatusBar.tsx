// STATUS: DIAMANT VGT SUPREME — event-driven, evidence-honest Workspace shell status.
import React from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { deriveShellStatus, type ShellSaveState } from '../home/workspaceShellHomeCore';
import type { WorkspaceSaveFailureCode, WorkspaceSaveFailureDetail } from '../persistence/workspaceSaveFailure';
import type { WorkspaceSaveProof, WorkspaceSaveWarning } from '../persistence/workspaceSaveProof';
import { workspaceSaveProofCopy, workspaceSaveProofTitle } from '../persistence/workspaceSaveProof';
import { securityPolicyForDocument } from '../../platform/security/securityProfiles';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellChromeCopy, shellVerifiedBadge } from '../i18n/shellChromeLocale';
import { BUILD_ID, BUILD_ID_SHORT, BUILD_PACKAGE_VERSION, BUILD_SOURCE_FILE_COUNT } from '../../platform/buildIdentity.generated';

interface ShellStatusBarProps {
  document: WorkspaceDocument | null;
  save: ShellSaveState;
  /** **Warum** das letzte Speichern scheiterte (W-229). Fehlt er, wird nichts erklärt. */
  saveFailure?: { readonly code: WorkspaceSaveFailureCode; readonly detail?: WorkspaceSaveFailureDetail } | null;
  /**
   * Release Beta 0.1 (release blocker #1): **what** was saved. A confirmed native document file
   * (`Gespeichert · Datei`, with path/SHA-256 tooltip) or the browser cache (`Browser-Ablage`, which is
   * explicitly not a file). Without a proof the bar makes no durable claim.
   */
  saveProof?: WorkspaceSaveProof | null;
  /** Additional visible reason for `saved-with-warning` (stale cache / missing desktop recovery). */
  saveWarning?: WorkspaceSaveWarning | null;
  /** Whether the native file store exists in this process (renders the "Ordner öffnen" action). */
  workspaceFileStoreAvailable?: boolean;
  onRevealWorkspaceFiles?: () => void;
  scalePercent: number;
  topSecretProviderReady: boolean;
  encryptedContainerAuthenticated?: boolean;
  pqcOperational?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onScaleChange?: (percent: number) => void;
}

const statusTone = (value: string): string => value === 'error' || value === 'conflict' ? 'text-rose-300' : value === 'saving' || value === 'syncing' || value === 'unsaved' || value === 'saved-with-warning' ? 'text-amber-300' : 'text-slate-300';

export const ShellStatusBar: React.FC<ShellStatusBarProps> = ({
  document,
  save,
  saveFailure,
  saveProof = null,
  saveWarning = null,
  workspaceFileStoreAvailable = false,
  onRevealWorkspaceFiles,
  scalePercent,
  topSecretProviderReady,
  encryptedContainerAuthenticated = false,
  pqcOperational = false,
  onUndo,
  onRedo,
  onScaleChange,
}) => {
  if (!document) return null;
  const { locale } = useWorkspaceLocale();
  const copy = shellChromeCopy(locale).status;
  // saveFailure liegt auf oberster Ebene des Katalogs, nicht im status-Block (W-229).
  const saveFailureCopy = shellChromeCopy(locale).saveFailure;
  const proofCopy = workspaceSaveProofCopy(locale);
  const profile = securityPolicyForDocument(document).profile;
  /**
   * WR-006/WR-034 — **the shell slider must not zoom the Writer's paper.**
   *
   * `onScaleChange` writes `root.style.fontSize`, i.e. it scales the whole application
   * chrome. With a Writer document open that looked like a page zoom, scaled the toolbar
   * and the page together, and competed with the Writer's own 50–200 % sheet zoom two rows
   * above this bar. A Writer document therefore gets the pointer to the control that
   * really zooms the paper instead of a second, differently-working zoom.
   */
  const shellZoomApplies = document.kind !== 'Writer';
  const status = deriveShellStatus({
    save,
    saveFailure,
    sync: 'local-only',
    securityProfile: profile,
    encryptedContainerAuthenticated,
    pqcOperational,
    topSecretProviderReady,
    zoomPercent: scalePercent,
    view: document.kind,
  });
  const failureDetailCopy = saveFailure?.detail ? proofCopy.failure[saveFailure.detail] : null;
  const showReveal = workspaceFileStoreAvailable && typeof onRevealWorkspaceFiles === 'function' && (saveProof?.kind === 'file' || save === 'error');
  return (
    <footer role="status" aria-live="polite" aria-label={copy.document} className="h-7 shrink-0 border-t border-purple-500/15 bg-[#07050d]/95 px-3 flex items-center gap-3 text-[10px] text-slate-400 select-none">
      <div className="flex items-center gap-1" aria-label={copy.history}>
        <button type="button" onClick={onUndo} disabled={!onUndo} className="px-1.5 py-0.5 rounded border border-white/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2" title={copy.undoTitle}>{copy.undo}</button>
        <button type="button" onClick={onRedo} disabled={!onRedo} className="px-1.5 py-0.5 rounded border border-white/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2" title={copy.redoTitle}>{copy.redo}</button>
      </div>
      <span className={statusTone(status.save)} aria-label={status.save === 'saved-with-warning' ? copy.saveWarningAria : undefined} title={status.save === 'saved-with-warning' ? copy.saveWarningTitle : undefined}>
        {copy.save}: {copy.saveState[status.save]}
        {saveProof && (save === 'saved' || save === 'saved-with-warning') && (
          <>
            {' · '}
            <span
              data-save-proof={saveProof.kind}
              title={workspaceSaveProofTitle(saveProof, proofCopy)}
              className={saveProof.kind === 'file' ? 'text-emerald-300' : 'text-amber-300'}
            >
              {saveProof.kind === 'file' ? proofCopy.fileSuffix : proofCopy.browserSuffix}
            </span>
          </>
        )}
        {status.save === 'error' && status.saveFailure && (
          <>
            {' — '}
            <span role="status" aria-live="polite">{saveFailureCopy[status.saveFailure.code]}</span>
            {failureDetailCopy && (
              <>
                {' '}
                <span data-save-failure-detail={saveFailure?.detail}>{failureDetailCopy}</span>
              </>
            )}
          </>
        )}
        {save === 'saved-with-warning' && saveWarning && (
          <>
            {' — '}
            <span data-save-warning={saveWarning} className="text-amber-300">{proofCopy.warning[saveWarning]}</span>
          </>
        )}
      </span>
      {showReveal && (
        <button
          type="button"
          onClick={onRevealWorkspaceFiles}
          title={proofCopy.revealFolderTitle}
          className="px-1.5 py-0.5 rounded border border-white/10 hover:border-emerald-400/40 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2"
        >
          {proofCopy.revealFolder}
        </button>
      )}
      <span className={statusTone(status.sync)}>{copy.sync}: {copy.syncState[status.sync]}</span>
      <span>{copy.policy}: {copy.profile[profile]}</span>
      <span>{copy.protectionEvidence}: {copy.protection[status.protection]}</span>
      {status.verifiedBadges.map((badge) => <span key={badge} className="text-emerald-300">{copy.verified}: {shellVerifiedBadge(locale, badge)}</span>)}
      <span className="ml-auto">{copy.view}: {status.view}</span>
      {/* The identity of the source state this bundle was built from. Importing it is what puts it in the
          bundle: an unreferenced module is tree-shaken away, so without this import the identity would exist
          in the tree and in nothing the user actually runs. `tools/verify_release_integrity.py` fails when the
          bundle does not carry it. */}
      <span
        className="font-mono text-slate-500"
        data-build-id={BUILD_ID}
        title={`Build ${BUILD_ID} · ${BUILD_PACKAGE_VERSION} · ${BUILD_SOURCE_FILE_COUNT} source files · reproducible with tools/build_id.py`}
        aria-label={`Build identity of this installation: ${BUILD_ID}`}
      >
        Build: {BUILD_PACKAGE_VERSION} · {BUILD_ID_SHORT}
      </span>
      {shellZoomApplies ? (
        <div className="flex items-center gap-1" role="group" aria-label={copy.zoomPresets}>
          <button type="button" disabled={!onScaleChange} onClick={() => onScaleChange?.(Math.max(25, status.zoomPercent - 25))} className="h-5 w-5 rounded border border-white/10 disabled:opacity-40" aria-label={copy.zoomOut}>−</button>
          <input aria-label={copy.zoom} type="range" min={25} max={400} step={25} value={Math.max(25, Math.min(400, status.zoomPercent))} onChange={(event) => onScaleChange?.(Number(event.target.value))} className="w-20 accent-purple-500" />
          <select aria-label={copy.zoomPresets} value={[50,100,150,200].includes(status.zoomPercent) ? String(status.zoomPercent) : 'custom'} onChange={(event) => { const value=event.target.value; if(value==='fit-width') onScaleChange?.(100); else if(value==='whole-page') onScaleChange?.(75); else if(value!=='custom') onScaleChange?.(Number(value)); }} className="h-5 rounded border border-white/10 bg-slate-950 px-1 text-[9px] text-slate-300">
            <option value="custom">{status.zoomPercent}%</option><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option><option value="fit-width">{copy.fitWidth}</option><option value="whole-page">{copy.wholePage}</option>
          </select>
          <button type="button" disabled={!onScaleChange} onClick={() => onScaleChange?.(Math.min(400, status.zoomPercent + 25))} className="h-5 w-5 rounded border border-white/10 disabled:opacity-40" aria-label={copy.zoomIn}>+</button>
        </div>
      ) : (
        <span className="flex items-center gap-1 text-slate-500" title={copy.writerPageZoomHint} data-shell-zoom-delegated={document.kind}>
          {copy.writerPageZoom}
        </span>
      )}
    </footer>
  );
};
