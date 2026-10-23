// STATUS: PLATIN — localized OCR progress, error, and result presentation.
import { CheckCircle2 } from 'lucide-react';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { pdfWorkflowText } from '../locale/pdfWorkflowDialogsLocale';
import type { BatchOcrProgress } from './pdfOcrEngine';

export interface PdfOcrResultSummary {
  pageCount: number;
  wordCount: number;
  wordCountCapped: boolean;
  averageConfidence: number;
  maximumSkew: number;
}

interface PdfOcrFeedbackProps {
  locale: WorkspaceLocale;
  progress: BatchOcrProgress | null;
  error: string;
  result: PdfOcrResultSummary | null;
}

export const PdfOcrFeedback = ({ locale, progress, error, result }: PdfOcrFeedbackProps) => {
  const progressKey = progress?.status.startsWith('Preprocessing page')
    ? 'ocr.preparingPage'
    : progress?.status.startsWith('Recognizing page')
      ? 'ocr.recognizingPage'
      : progress?.status.startsWith('Local OCR complete for')
        ? 'ocr.completed'
        : 'ocr.processing';

  return (
    <>
      {progress && <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-xl border border-white/10 text-xs" aria-live="polite">
        <div className="flex justify-between text-slate-400">
          <span>{pdfWorkflowText(locale, progressKey, { page: progress.currentPage })}</span>
          <span className="font-mono text-cyan-400">{new Intl.NumberFormat(locale).format(progress.percentComplete)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-cyan-500 transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${progress.percentComplete}%` }} />
        </div>
      </div>}
      {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200" role="alert">{error}</div>}
      {result && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-300 font-bold"><CheckCircle2 className="w-4 h-4" />{pdfWorkflowText(locale, 'ocr.applied')}</div>
        <div className="grid grid-cols-4 gap-2 font-mono text-[0.6875rem] text-slate-300">
          <div>{pdfWorkflowText(locale, 'ocr.pages')}: <b>{new Intl.NumberFormat(locale).format(result.pageCount)}</b></div>
          <div>{pdfWorkflowText(locale, 'ocr.words')}: <b>{new Intl.NumberFormat(locale).format(result.wordCount)}{result.wordCountCapped ? '+' : ''}</b></div>
          <div>{pdfWorkflowText(locale, 'ocr.confidence')}: <b>{new Intl.NumberFormat(locale).format(result.averageConfidence)}%</b></div>
          <div>{pdfWorkflowText(locale, 'ocr.skewMax')}: <b>{new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(result.maximumSkew)}°</b></div>
        </div>
      </div>}
    </>
  );
};
