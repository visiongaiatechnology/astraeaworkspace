// STATUS: DIAMANT VGT SUPREME
import React, { useState } from 'react';
import { X, CheckCircle, Shield, Award } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';

export type PdfVisualMarkType = 'signature' | 'initial' | 'stamp';

interface PdfSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: number;
  onApplySignature: (signerName: string, role: string, sealType: string, markType: PdfVisualMarkType) => void;
}

export const PdfSignatureModal: React.FC<PdfSignatureModalProps> = ({
  isOpen,
  onClose,
  currentPage,
  onApplySignature,
}) => {
  const { locale } = useWorkspaceLocale();
  const [signerName, setSignerName] = useState('Dr. Elizabeth Vance');
  const [signerRole, setSignerRole] = useState('Sovereign Enclave Custodian');
  const [sealType, setSealType] = useState<'emerald' | 'cyan' | 'amber'>('emerald');
  const [markType, setMarkType] = useState<PdfVisualMarkType>('signature');

  if (!isOpen) return null;

  const markLabel = pdfWorkflowText(locale, markType === 'initial' ? 'visual.mark.initials' : markType === 'stamp' ? 'visual.mark.stamp' : 'visual.mark.signature');
  const addLabel = pdfWorkflowText(locale, markType === 'initial' ? 'visual.addInitials' : markType === 'stamp' ? 'visual.addStamp' : 'visual.addSignature');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) return;
    onApplySignature(signerName.trim(), signerRole.trim(), sealType, markType);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-in fade-in duration-150" role="dialog" aria-modal="true" aria-labelledby="pdf-visual-signature-title">
      <div className="vgt-dialog-scroll-surface max-h-[90vh] overflow-y-auto w-full max-w-md bg-slate-950 border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 id="pdf-visual-signature-title" className="text-sm font-bold text-slate-100">{pdfWorkflowText(locale, 'visual.title')}</h3>
              <p className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'visual.pageAnnotation', { page: currentPage })}</p>
            </div>
          </div>
          <button aria-label={pdfWorkflowText(locale, 'visual.close')}
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{pdfWorkflowText(locale, 'visual.signerName')}</label>
            <input
              type="text"
              aria-label={pdfWorkflowText(locale, 'visual.signerName')}
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={pdfWorkflowText(locale, 'visual.namePlaceholder')}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400/60"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{pdfWorkflowText(locale, 'visual.role')}</label>
            <input
              type="text"
              aria-label={pdfWorkflowText(locale, 'visual.role')}
              value={signerRole}
              onChange={(e) => setSignerRole(e.target.value)}
              placeholder={pdfWorkflowText(locale, 'visual.rolePlaceholder')}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400/60"
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-slate-300">{pdfWorkflowText(locale, 'visual.markType')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'signature', label: pdfWorkflowText(locale, 'visual.mark.signature') },
                { id: 'initial', label: pdfWorkflowText(locale, 'visual.mark.initials') },
                { id: 'stamp', label: pdfWorkflowText(locale, 'visual.mark.stamp') },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={markType === option.id}
                  onClick={() => setMarkType(option.id)}
                  className={`rounded-lg border px-2 py-2 text-[0.625rem] font-semibold transition-all ${
                    markType === option.id
                      ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200'
                      : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{pdfWorkflowText(locale, 'visual.sealTheme')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'emerald', label: pdfWorkflowText(locale, 'visual.theme.emerald'), border: 'border-emerald-500/40', text: 'text-emerald-400' },
                  { id: 'cyan', label: pdfWorkflowText(locale, 'visual.theme.cyan'), border: 'border-blue-500/40', text: 'text-blue-400' },
                  { id: 'amber', label: pdfWorkflowText(locale, 'visual.theme.amber'), border: 'border-amber-500/40', text: 'text-amber-400' },
                ] as const
              ).map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setSealType(theme.id)}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    sealType === theme.id
                      ? `${theme.border} bg-white/5 ring-1 ring-white/20`
                      : 'border-white/5 hover:border-white/15'
                  }`}
                >
                  <Shield className={`w-4 h-4 mx-auto mb-1 ${theme.text}`} />
                  <span className="text-[0.625rem] block font-medium text-slate-300">{theme.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live Seal Preview */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-center space-x-3">
            <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
            <div className="text-[0.625rem] font-mono leading-tight text-slate-300">
              <span className="text-emerald-300 font-bold block">
                {markType === 'initial'
                  ? (signerName || pdfWorkflowText(locale, 'visual.preview.signerFallback'))
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 4)
                      .map((part) => part[0]?.toUpperCase() ?? '')
                      .join('') || '—'
                  : signerName || pdfWorkflowText(locale, 'visual.preview.signerFallback')}
              </span>
              <span className="text-slate-400 block">{signerRole || pdfWorkflowText(locale, 'visual.preview.roleFallback')}</span>
              <span className="text-slate-500 text-[0.5625rem]">
                {pdfWorkflowText(locale, 'visual.preview.notCrypto', { mark: markLabel.toLocaleUpperCase(locale) })}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs text-slate-400 hover:text-slate-200"
            >
              {pdfWorkflowText(locale, 'common.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/30 flex items-center space-x-1.5"
            >
              <Award className="w-3.5 h-3.5" />
              <span>{addLabel}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
