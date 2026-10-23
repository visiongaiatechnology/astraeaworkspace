// STATUS: DIAMANT VGT SUPREME
// Bounded document-wide structured redaction UI. Secrets are never copied into audit logs.

import React, { useState } from 'react';
import { Search, ShieldAlert, X } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';
import type { PdfRedactionPatternMode } from './pdfTrueRedaction';

export interface PdfTrueRedactionRequest {
  pattern: string;
  mode: PdfRedactionPatternMode;
  caseSensitive: boolean;
  reason: string;
  overlayText: string;
}

interface PdfTrueRedactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (request: PdfTrueRedactionRequest) => { matchCount: number; redactedCharacters: number };
}

export const PdfTrueRedactionModal: React.FC<PdfTrueRedactionModalProps> = ({ isOpen, onClose, onApply }) => {
  const { locale } = useWorkspaceLocale();
  const [pattern, setPattern] = useState('');
  const [mode, setMode] = useState<PdfRedactionPatternMode>('literal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState('[REDACTED]');
  const [status, setStatus] = useState<string>('');
  const reasonValue = reason ?? pdfWorkflowText(locale, 'redaction.defaultReason');

  if (!isOpen) return null;

  const apply = () => {
    setStatus('');
    try {
      const result = onApply({ pattern, mode, caseSensitive, reason: reasonValue, overlayText });
      if (result.matchCount === 0) {
        setStatus(pdfWorkflowText(locale, 'redaction.noMatches'));
        return;
      }
      setStatus(pdfWorkflowText(locale, 'redaction.applied', { matches: result.matchCount, characters: result.redactedCharacters }));
      setPattern('');
    } catch {
      setStatus(pdfWorkflowText(locale, 'redaction.error'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pdf-redaction-title">
      <div className="vgt-dialog-scroll-surface max-h-[90vh] overflow-y-auto w-full max-w-xl rounded-2xl border border-red-500/30 bg-slate-950/95 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <div>
              <h3 id="pdf-redaction-title" className="text-sm font-bold text-white">{pdfWorkflowText(locale, 'redaction.title')}</h3>
              <p className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'redaction.scope')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white" aria-label={pdfWorkflowText(locale, 'common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[0.6875rem] leading-relaxed text-amber-100">
          {pdfWorkflowText(locale, 'redaction.caution')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              maxLength={256}
              placeholder={pdfWorkflowText(locale, mode === 'literal' ? 'redaction.literalPlaceholder' : 'redaction.regexPlaceholder')}
              className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-red-500/60"
              autoFocus
            />
          </div>
          <select aria-label={pdfWorkflowText(locale, 'redaction.patternMode')} value={mode} onChange={(event) => setMode(event.target.value as PdfRedactionPatternMode)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white">
            <option value="literal">{pdfWorkflowText(locale, 'redaction.literal')}</option>
            <option value="regex">{pdfWorkflowText(locale, 'redaction.regex')}</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />
          {pdfWorkflowText(locale, 'redaction.caseSensitive')}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1 text-[0.6875rem] text-slate-400">
            <span className="uppercase tracking-wider font-semibold">{pdfWorkflowText(locale, 'redaction.reason')}</span>
            <input value={reasonValue} onChange={(event) => setReason(event.target.value)} maxLength={512} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-red-500/60" />
          </label>
          <label className="space-y-1 text-[0.6875rem] text-slate-400">
            <span className="uppercase tracking-wider font-semibold">{pdfWorkflowText(locale, 'redaction.overlay')}</span>
            <input value={overlayText} onChange={(event) => setOverlayText(event.target.value)} maxLength={128} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-red-500/60" />
          </label>
        </div>

        {status && <div role="status" className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[0.6875rem] text-slate-300">{status}</div>}

        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">{pdfWorkflowText(locale, 'common.close')}</button>
          <button type="button" onClick={apply} disabled={!pattern.trim() || !reasonValue.trim()} className="px-4 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white disabled:opacity-40 hover:bg-red-500">
            {pdfWorkflowText(locale, 'redaction.apply')}
          </button>
        </div>
      </div>
    </div>
  );
};
