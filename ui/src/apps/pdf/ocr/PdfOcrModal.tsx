import React, { useEffect, useMemo, useState } from 'react';
import { Cpu, Edit3, Scan, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import {
  applyOcrResultsToDocument,
  convertOcrPageToEditable,
  correctOcrWord,
  detectScannedPages,
  processBatchPdfOcr,
  type BatchOcrProgress,
  type PdfOcrRegion,
} from './pdfOcrEngine';
import { isLocalOcrAvailable, listLocalOcrLanguages } from './pdfOcrNative';
import { preprocessPdfOcrImage } from './pdfOcrPreprocess';
import { PdfOcrFeedback } from './PdfOcrFeedback';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText } from '../locale/pdfWorkflowDialogsLocale';

interface PdfOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfData: PdfDocumentModel;
  onUpdatePdfData: (updated: PdfDocumentModel) => void;
}

const PREFERRED_LANGUAGES = ['deu', 'eng', 'fra', 'spa'];
const LANGUAGE_LABELS: Record<string, string> = { deu: 'Deutsch', eng: 'English', fra: 'Français', spa: 'Español', ita: 'Italiano', nld: 'Nederlands', por: 'Português' };

const percentRegion = (values: { x: number; y: number; width: number; height: number }): PdfOcrRegion => ({
  x: values.x / 100,
  y: values.y / 100,
  width: values.width / 100,
  height: values.height / 100,
});

export const PdfOcrModal: React.FC<PdfOcrModalProps> = ({ isOpen, onClose, pdfData, onUpdatePdfData }) => {
  const { locale } = useWorkspaceLocale();
  const regionLabels = {
    x: pdfWorkflowText(locale, 'ocr.region.x'),
    y: pdfWorkflowText(locale, 'ocr.region.y'),
    width: pdfWorkflowText(locale, 'ocr.region.width'),
    height: pdfWorkflowText(locale, 'ocr.region.height'),
  };
  const nativeAvailable = isLocalOcrAvailable();
  const [languages, setLanguages] = useState<string[]>([]);
  const [engineVersion, setEngineVersion] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('eng');
  const [psm, setPsm] = useState<3 | 4 | 6 | 11 | 12 | 13>(6);
  const [autoDeskew, setAutoDeskew] = useState(true);
  const [denoise, setDenoise] = useState(true);
  const [enhanceContrast, setEnhanceContrast] = useState(true);
  const [regionEnabled, setRegionEnabled] = useState(false);
  const [region, setRegion] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchOcrProgress | null>(null);
  const [workingData, setWorkingData] = useState<PdfDocumentModel>(pdfData);
  const [error, setError] = useState('');
  const [skewSummary, setSkewSummary] = useState<number[]>([]);

  const scannedPages = useMemo(() => detectScannedPages(workingData), [workingData]);
  const imageBackedPages = useMemo(() => workingData.pages.filter((page) => (page.images?.length ?? 0) > 0).map((page) => page.pageNumber), [workingData]);

  useEffect(() => { if (isOpen) setWorkingData(pdfData); }, [isOpen, pdfData]);

  useEffect(() => {
    if (!isOpen || !nativeAvailable) return;
    let cancelled = false;
    listLocalOcrLanguages().then((inventory) => {
      if (cancelled) return;
      setLanguages(inventory.languages);
      setEngineVersion(inventory.engineVersion);
      const preferred = PREFERRED_LANGUAGES.find((language) => inventory.languages.includes(language));
      setSelectedLanguage((current) => inventory.languages.includes(current) ? current : preferred ?? inventory.languages[0] ?? 'eng');
    }).catch(() => {
      if (!cancelled) setError(pdfWorkflowText(locale, 'ocr.error.inventory'));
    });
    return () => { cancelled = true; };
  }, [isOpen, nativeAvailable, locale]);

  if (!isOpen) return null;

  const persist = (updated: PdfDocumentModel): void => {
    setWorkingData(updated);
    onUpdatePdfData(updated);
  };

  const handleStartOcr = async (): Promise<void> => {
    if (!nativeAvailable) { setError(pdfWorkflowText(locale, 'ocr.error.unavailable')); return; }
    if (!languages.includes(selectedLanguage)) { setError(pdfWorkflowText(locale, 'ocr.error.language')); return; }
    setError(''); setIsProcessing(true); setSkewSummary([]);
    try {
      const targets = scannedPages.length ? scannedPages : imageBackedPages;
      if (!targets.length) { setError(pdfWorkflowText(locale, 'ocr.error.noPages')); return; }
      const prepared = [];
      const skews: number[] = [];
      const activeRegion = regionEnabled ? percentRegion(region) : undefined;
      for (const pageNumber of targets) {
        const page = workingData.pages.find((candidate) => candidate.pageNumber === pageNumber);
        if (!page) continue;
        if ((page.images?.length ?? 0) > 32) { setError(pdfWorkflowText(locale, 'ocr.error.limit')); return; }
        for (const image of page.images ?? []) {
          setProgress({ currentPage: pageNumber, totalPages: targets.length, percentComplete: 0, status: `Preprocessing page ${pageNumber} locally…` });
          const processed = await preprocessPdfOcrImage(pageNumber, image, { autoDeskew, denoise, enhanceContrast, region: activeRegion });
          prepared.push(processed.prepared); skews.push(processed.detectedSkewDegrees);
        }
      }
      const recognized = await processBatchPdfOcr(prepared, { language: selectedLanguage, pageSegmentationMode: psm }, setProgress);
      const updated = applyOcrResultsToDocument(workingData, recognized);
      persist(updated); setSkewSummary(skews);
    } catch {
      setError(pdfWorkflowText(locale, 'ocr.error.process'));
    } finally { setIsProcessing(false); }
  };

  const handleCorrection = (pageNumber: number, wordId: string, value: string): void => {
    try { persist(correctOcrWord(workingData, pageNumber, wordId, value)); setError(''); }
    catch { setError(pdfWorkflowText(locale, 'ocr.error.correct')); }
  };

  const handleConvertEditable = (pageNumber: number): void => {
    try { persist(convertOcrPageToEditable(workingData, pageNumber, true)); setError(''); }
    catch { setError(pdfWorkflowText(locale, 'ocr.error.convert')); }
  };

  const currentWords = workingData.pages.flatMap((page) => page.ocrLayer?.lines.flatMap((line) => line.words.map((word) => ({ pageNumber: page.pageNumber, word }))) ?? []).slice(0, 200);
  const recognizedPages = workingData.pages.filter((page) => page.ocrLayer).map((page) => page.pageNumber);
  const avgConfidence = recognizedPages.length
    ? Math.round(workingData.pages.filter((page) => page.ocrLayer).reduce((sum, page) => sum + (page.ocrLayer?.meanConfidence ?? 0), 0) / recognizedPages.length)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pdf-ocr-title">
      <div className="vgt-dialog-scroll-surface w-full max-w-4xl max-h-[90vh] overflow-y-auto glass-dropdown rounded-2xl p-6 border border-cyan-500/30 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-cyan-300"><Scan className="w-5 h-5" /><div><h3 id="pdf-ocr-title" className="text-sm font-bold text-slate-100">{pdfWorkflowText(locale, 'ocr.title')}</h3><p className="text-[0.625rem] text-slate-500">{engineVersion || pdfWorkflowText(locale, 'ocr.engineFallback')} · {pdfWorkflowText(locale, 'ocr.zeroCloud')}</p></div></div>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400" aria-label={pdfWorkflowText(locale, 'ocr.close')}><X className="w-4 h-4" /></button>
        </div>

        <div className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${nativeAvailable ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-100' : 'bg-amber-500/10 border-amber-500/25 text-amber-100'}`}>
          {nativeAvailable ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <Cpu className="w-4 h-4 mt-0.5 shrink-0" />}
          <p>{nativeAvailable ? pdfWorkflowText(locale, 'ocr.localAvailable') : pdfWorkflowText(locale, 'ocr.localUnavailable')}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1"><span className="block text-slate-400 font-semibold">{pdfWorkflowText(locale, 'ocr.languagePack')}</span><select value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value)} disabled={!nativeAvailable || isProcessing} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-slate-200">{languages.map((language) => <option key={language} value={language}>{LANGUAGE_LABELS[language] ? `${LANGUAGE_LABELS[language]} (${language})` : language}</option>)}</select></label>
          <label className="space-y-1"><span className="block text-slate-400 font-semibold">{pdfWorkflowText(locale, 'ocr.segmentation')}</span><select value={psm} onChange={(event) => setPsm(Number(event.target.value) as typeof psm)} disabled={isProcessing} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-slate-200"><option value={3}>{pdfWorkflowText(locale, 'ocr.segment.automatic')}</option><option value={4}>{pdfWorkflowText(locale, 'ocr.segment.columns')}</option><option value={6}>{pdfWorkflowText(locale, 'ocr.segment.block')}</option><option value={11}>{pdfWorkflowText(locale, 'ocr.segment.sparse')}</option><option value={12}>{pdfWorkflowText(locale, 'ocr.segment.sparseOsd')}</option><option value={13}>{pdfWorkflowText(locale, 'ocr.segment.rawLine')}</option></select></label>
          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3"><div className="text-slate-400">{pdfWorkflowText(locale, 'ocr.scans')}</div><div className="text-lg font-mono text-cyan-300">{new Intl.NumberFormat(locale).format(scannedPages.length)} / {new Intl.NumberFormat(locale).format(workingData.pages.length)}</div><div className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'ocr.scansDescription')}</div></div>
        </div>

        <div className="grid sm:grid-cols-4 gap-2 text-xs">
          {[[pdfWorkflowText(locale, 'ocr.autoDeskew'), autoDeskew, setAutoDeskew], [pdfWorkflowText(locale, 'ocr.denoise'), denoise, setDenoise], [pdfWorkflowText(locale, 'ocr.contrast'), enhanceContrast, setEnhanceContrast], [pdfWorkflowText(locale, 'ocr.keepImage'), true, undefined]].map(([label, checked, setter]) => <label key={String(label)} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-slate-300"><input type="checkbox" checked={Boolean(checked)} disabled={!setter || isProcessing} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<boolean>> | undefined)?.(event.target.checked)} /><span>{String(label)}</span></label>)}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 space-y-2 text-xs">
          <label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={regionEnabled} onChange={(event) => setRegionEnabled(event.target.checked)} disabled={isProcessing} /><span>{pdfWorkflowText(locale, 'ocr.region')}</span></label>
          {regionEnabled && <div className="grid grid-cols-4 gap-2">{(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key} className="text-slate-500">{regionLabels[key]} %<input type="number" min={0} max={100} step={1} value={region[key]} onChange={(event) => setRegion((current) => ({ ...current, [key]: Number(event.target.value) }))} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-950 border border-white/10 text-slate-200" /></label>)}</div>}
        </div>

        <PdfOcrFeedback
          locale={locale}
          progress={progress}
          error={error}
          result={recognizedPages.length ? {
            pageCount: recognizedPages.length,
            wordCount: currentWords.length,
            wordCountCapped: currentWords.length === 200,
            averageConfidence: avgConfidence,
            maximumSkew: skewSummary.length ? Math.max(...skewSummary.map(Math.abs)) : 0,
          } : null}
        />

        {currentWords.length > 0 && <div className="rounded-xl border border-white/10 overflow-hidden"><div className="px-3 py-2 bg-slate-950/80 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Edit3 className="w-3.5 h-3.5" />{pdfWorkflowText(locale, 'ocr.correctionWorkspace')}</div><span className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'ocr.firstWords', { count: 200 })}</span></div><div className="max-h-56 overflow-y-auto divide-y divide-white/5">{currentWords.map(({ pageNumber, word }) => <div key={word.id} className="grid grid-cols-[52px_1fr_72px] gap-2 px-3 py-1.5 items-center"><span className="text-[0.625rem] font-mono text-slate-500">{pdfWorkflowText(locale, 'ocr.pageLabel', { page: pageNumber })}</span><input defaultValue={word.text} onBlur={(event) => event.target.value !== word.text && handleCorrection(pageNumber, word.id, event.target.value)} className="px-2 py-1 rounded bg-slate-950 border border-white/10 text-xs text-slate-200" aria-label={pdfWorkflowText(locale, 'ocr.correctWord', { page: pageNumber })} /><span className={`text-[0.625rem] font-mono text-right ${word.confidence >= 80 ? 'text-emerald-400' : word.confidence >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(word.confidence)}%</span></div>)}</div></div>}

        {recognizedPages.length > 0 && <div className="flex flex-wrap gap-2">{recognizedPages.map((pageNumber) => <button key={pageNumber} type="button" onClick={() => handleConvertEditable(pageNumber)} className="px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-xs text-violet-200 hover:bg-violet-500/20">{pdfWorkflowText(locale, 'ocr.convertPage', { page: pageNumber })}</button>)}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10"><button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">{pdfWorkflowText(locale, 'common.close')}</button><button type="button" onClick={() => void handleStartOcr()} disabled={isProcessing || !nativeAvailable || languages.length === 0} className="px-4 py-1.5 rounded-lg text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /><span>{pdfWorkflowText(locale, isProcessing ? 'ocr.recognizing' : 'ocr.run')}</span></button></div>
      </div>
    </div>
  );
};
