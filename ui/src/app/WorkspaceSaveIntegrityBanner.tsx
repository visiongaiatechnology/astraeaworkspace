// STATUS: DIAMANT VGT SUPREME — release blocker #1: a failed file write must never be silent.
//
// Until Beta 0.1 a failed autosave only changed the status-bar colour; the user had no reason, no
// action and no proof that the document was still there. This banner appears **only** for a failed
// authoritative save, names the failed stage in plain words, and offers the two actions that can
// resolve it: retry the confirmed file write, or write a portable container to a chosen path.
import React from 'react';
import { useWorkspaceLocale } from '../shell/localization/workspaceLocale';
import { shellChromeCopy } from '../shell/i18n/shellChromeLocale';
import type { WorkspaceSaveFailure } from '../shell/persistence/workspaceSaveFailure';
import { workspaceSaveProofCopy } from '../shell/persistence/workspaceSaveProof';

export interface WorkspaceSaveIntegrityBannerProps {
  readonly saveStatus: 'saved' | 'saved-with-warning' | 'saving' | 'unsaved' | 'error';
  readonly saveFailure: WorkspaceSaveFailure | null;
  readonly busy: boolean;
  readonly fileStoreAvailable: boolean;
  readonly onRetry: () => void;
  readonly onSaveAs: () => void;
  readonly onRevealWorkspaceFiles?: () => void;
}

export const WorkspaceSaveIntegrityBanner: React.FC<WorkspaceSaveIntegrityBannerProps> = ({
  saveStatus,
  saveFailure,
  busy,
  fileStoreAvailable,
  onRetry,
  onSaveAs,
  onRevealWorkspaceFiles,
}) => {
  const { locale } = useWorkspaceLocale();
  if (saveStatus !== 'error') return null;
  const copy = workspaceSaveProofCopy(locale);
  const fallbackReason = saveFailure ? shellChromeCopy(locale).saveFailure[saveFailure.code] : null;
  const reason = saveFailure?.detail ? copy.failure[saveFailure.detail] : fallbackReason;
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-save-integrity-banner="true"
      data-file-store-available={fileStoreAvailable ? 'true' : 'false'}
      className="mx-3 mb-1 flex shrink-0 items-start gap-3 rounded-lg border border-rose-400/40 bg-rose-950/60 px-3 py-2 text-[11px] text-rose-100 shadow-lg shadow-rose-950/30 backdrop-blur"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium" data-save-integrity-title>{copy.failureTitle}</p>
        {reason && <p data-save-integrity-reason={saveFailure?.detail ?? saveFailure?.code}>{reason}</p>}
        <p className="text-rose-200/80">{copy.failureHint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          data-save-action="retry"
          className="rounded-md border border-rose-300/40 bg-rose-500/15 px-2.5 py-1 font-medium text-rose-50 hover:border-rose-200/70 hover:bg-rose-500/25 disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
        >
          {copy.retry}
        </button>
        <button
          type="button"
          onClick={onSaveAs}
          disabled={busy}
          data-save-action="save-as"
          className="rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-rose-50 hover:border-white/40 hover:bg-white/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
        >
          {copy.saveAs}
        </button>
        {fileStoreAvailable && onRevealWorkspaceFiles && (
          <button
            type="button"
            onClick={onRevealWorkspaceFiles}
            data-save-action="reveal"
            title={copy.revealFolderTitle}
            className="rounded-md border border-white/10 px-2.5 py-1 text-rose-100/80 hover:border-white/30 hover:text-rose-50 focus-visible:outline focus-visible:outline-2"
          >
            {copy.revealFolder}
          </button>
        )}
      </div>
    </div>
  );
};
