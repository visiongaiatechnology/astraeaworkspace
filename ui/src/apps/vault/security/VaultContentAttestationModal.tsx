// STATUS: DIAMANT VGT SUPREME
// Astraea Vault Content Attestation & Cryptographic Digest Inspector Modal

import React from 'react';
import { Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { VaultFile } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { vaultAttestationText } from '../vaultAttestationLocale';

interface VaultContentAttestationModalProps {
  file: VaultFile | null;
  onClose: () => void;
  /** Sitzungssperre: der Dialog gibt Dateiname, Speicherart und Digest nicht mehr heraus. */
  locked?: boolean;
}

export const VaultContentAttestationModal: React.FC<VaultContentAttestationModalProps> = ({
  file,
  onClose,
  locked = false,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof vaultAttestationText>[0]) => vaultAttestationText(message, locale);
  if (!file || locked) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none" role="dialog" aria-modal="true" aria-labelledby="vault-attestation-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Lock className="w-4 h-4" />
            <h3 id="vault-attestation-title" className="text-sm font-bold text-slate-100">{t('title')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded-md hover:bg-white/10"
          >
            {t('closeButton')}
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <span className="text-slate-500 font-medium">{t('filename')}</span>
            <p className="text-slate-200 font-bold mt-0.5">{file.name}</p>
          </div>
          <div>
            <span className="text-slate-500 font-medium">{t('storage')}</span>
            <p className="text-slate-300 mt-0.5">
              {file.sourceType === 'attachment'
                ? t('attachmentStorage')
                : file.sourceType === 'workspace-document'
                ? t('documentStorage')
                : t('metadataStorage')}
            </p>
          </div>
          <div>
            <span className="text-slate-500 font-medium">{t('digest')}</span>
            <p className="text-slate-300 font-mono text-[0.6875rem] bg-slate-950 p-2.5 rounded-lg border border-white/10 break-all select-text">
              {file.contentDigest ?? t('noBaseline')}
            </p>
          </div>
          <div>
            <span className="text-slate-500 font-medium">{t('integrity')}</span>
            <div
              className={`flex items-center space-x-1.5 font-medium mt-0.5 ${
                file.integrityState === 'mismatch'
                  ? 'text-rose-400'
                  : file.integrityState === 'verified'
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {file.integrityState === 'mismatch' ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>
                {file.integrityState === 'verified'
                  ? t('verified')
                  : file.integrityState === 'mismatch'
                  ? t('mismatch')
                  : file.integrityState === 'unavailable'
                  ? t('unavailable')
                  : t('notVerified')}
              </span>
            </div>
          </div>
          {file.mimeType && (
            <div>
              <span className="text-slate-500 font-medium">{t('mime')}</span>
              <p className="text-slate-300 font-mono mt-0.5">{file.mimeType}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
