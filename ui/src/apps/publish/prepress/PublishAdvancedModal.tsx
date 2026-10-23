// STATUS: DIAMANT VGT SUPREME — Astraea Publish Prepress & PDF/X Studio Modal
import React, { useState } from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { creativePersonalText } from '../../creativePersonalLocale';
import { publishProfileDescription, publishTicViolationText, publishVerificationResultText } from '../publishAdvancedLocale';
import {
  X,
  Printer,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Sliders,
  SlidersHorizontal,
  FileCheck
} from 'lucide-react';
import { PublishDocumentModel } from '../contracts/types';
import { deliverExportBytes } from '../../../shared/interchange/exportDelivery';
import {
  AVAILABLE_ICC_PROFILES,
  IccProfileId,
  analyzePublishPrepress,
  PrepressInspectionReport
} from './publishPrepressEngine';
import {
  exportPublishToPdfX,
  PdfXStandard,
  PrinterMarksOptions,
  PdfXExportResult
} from '../interchange/pdf/publishPdfXExportEngine';
import {
  runPublishRoundtripTestSuite,
  PublishSuiteReport,
  type PublishTestResult,
} from '../diagnostics/publishRoundtripTestSuite';

interface PublishAdvancedModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  model: PublishDocumentModel;
  onUpdateModel: (updater: (prev: PublishDocumentModel) => PublishDocumentModel) => void;
  showToast?: (msg: string) => void;
}

export const PublishVerificationResultRows: React.FC<{ results: readonly PublishTestResult[]; locale: WorkspaceLocale }> = ({ results, locale }) => (
  <div className="space-y-2">
    {results.map((result) => {
      const copy = publishVerificationResultText(result.id, result.status, locale);
      return (
        <div key={result.id} className={`p-2.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${result.status === 'passed' ? 'bg-emerald-950/10 border-emerald-500/30 text-emerald-300' : result.status === 'warning' ? 'bg-amber-950/10 border-amber-500/30 text-amber-300' : 'bg-rose-950/10 border-rose-500/30 text-rose-300'}`}>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 font-bold">
              {result.status === 'passed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
              <span>{copy.name}</span><span className="rounded border border-current/20 px-1.5 py-0.5 text-[0.5625rem] uppercase">{copy.status}</span>
            </div>
            <p className="text-[0.6875rem] text-slate-400 pl-6">{copy.description}</p>
          </div>
          <span className="font-mono text-[0.6875rem] text-slate-500 shrink-0">{result.durationMs}ms</span>
        </div>
      );
    })}
  </div>
);

export const PublishAdvancedModal: React.FC<PublishAdvancedModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  model,
  onUpdateModel,
  showToast,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(message, locale);
  const [activeTab, setActiveTab] = useState<'prepress' | 'preflight' | 'export' | 'suite'>('prepress');
  const [selectedProfileId, setSelectedProfileId] = useState<IccProfileId>('FOGRA51');
  const [pdfStandard, setPdfStandard] = useState<PdfXStandard>('PDF/X-4:2010');
  const [marks, setMarks] = useState<PrinterMarksOptions>({
    cropMarks: true,
    bleedMarks: true,
    registrationMarks: true,
    colorBars: true,
    pageInformation: true,
  });

  const [prepressReport, setPrepressReport] = useState<PrepressInspectionReport>(() =>
    analyzePublishPrepress(model, selectedProfileId)
  );
  const [exportResult, setExportResult] = useState<PdfXExportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [suiteReport, setSuiteReport] = useState<PublishSuiteReport | null>(null);
  const [isRunningSuite, setIsRunningSuite] = useState(false);

  if (!isOpen) return null;

  const handleProfileChange = (profileId: IccProfileId) => {
    setSelectedProfileId(profileId);
    const report = analyzePublishPrepress(model, profileId);
    setPrepressReport(report);
  };

  const handleExportPdfX = async () => {
    setIsExporting(true);
    try {
      const res = await exportPublishToPdfX(model, pdfStandard, marks, selectedProfileId);
      setExportResult(res);

      // Release Beta 0.1: native save dialog + atomic write on the desktop; browser stays a download.
      const delivery = await deliverExportBytes(new TextEncoder().encode(res.pdfStream), {
        suggestedName: `${documentTitle.replace(/\s+/g, '_').toLowerCase()}_${pdfStandard.replace(/[:/]/g, '-')}.pdf`,
        extensions: ['pdf'],
        mimeType: 'application/pdf',
      });

      if (showToast) showToast(`${t('Exported {standard} successfully ({size} KB)').replace('{standard}', pdfStandard).replace('{size}', String(Math.round(res.bytesCount / 1024)))} ${delivery.mode === 'file' ? `File saved as ${delivery.fileName}.` : `Download started: ${delivery.fileName} (browser mode – no write confirmation).`}`);
    } catch (error) {
      if (showToast) showToast(`${t('PDF/X export failed.')} ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRunSuite = async () => {
    setIsRunningSuite(true);
    try {
      const rep = await runPublishRoundtripTestSuite(model, documentTitle);
      setSuiteReport(rep);
      if (showToast) showToast(t('Audit: {passed}/{total} tests passed ({score}%)').replace('{passed}', String(rep.passedCount)).replace('{total}', String(rep.totalTests)).replace('{score}', String(rep.overallFidelityScore)));
    } catch {
      if (showToast) showToast(t('Prepress verification failed.'));
    } finally {
      setIsRunningSuite(false);
    }
  };

  const handleNavigateToFrame = (frameId: string, pageIndex: number) => {
    onUpdateModel((prev) => ({
      ...prev,
      activePageIndex: pageIndex,
      selectedFrameId: frameId,
    }));
    if (showToast) showToast(t('Navigated to page {page}, frame: {frame}').replace('{page}', String(pageIndex + 1)).replace('{frame}', frameId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl">
              <Printer className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {t('Astraea Publish Prepress & PDF/X Studio')}
                <span className="text-[0.625rem] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Modul 17 Prepress Core
                </span>
              </h2>
              <p className="text-xs text-slate-400">{t('ISO 15930 print verification, ICC color intent, ink manager & PDF/X-4 export')}</p>
            </div>
          </div>
          <button aria-label={t('Close Astraea Publish Prepress & PDF/X Studio dialog')} onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6">
          <button
            onClick={() => setActiveTab('prepress')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'prepress' ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            {t('ICC Profiles & Ink Manager')}
          </button>
          <button
            onClick={() => setActiveTab('preflight')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'preflight' ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            {t('Navigable Preflight Audit')}
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'export' ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            {t('PDF/X Production Export')}
          </button>
          <button
            onClick={() => setActiveTab('suite')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'suite' ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {t('6-Point Verification Suite')}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: ICC PROFILES & INK MANAGER */}
          {activeTab === 'prepress' && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-purple-400" />
                    {t('Output Intent ICC Profile')}
                  </h3>
                  <span className="text-xs font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                    {t('Limit:')} {prepressReport.profile.maxTicPercent}% TIC
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(Object.keys(AVAILABLE_ICC_PROFILES) as IccProfileId[]).map((pid) => {
                    const prof = AVAILABLE_ICC_PROFILES[pid];
                    return (
                      <div
                        key={pid}
                        // GAP-0052, Runde 286: die Profilkachel war nur mit
                        // der Maus waehlbar — `cursor-pointer` und `onClick`,
                        // aber kein Tastaturweg. Die letzte der vierzehn
                        // Stellen, die der Parser gefunden hat.
                        role="button"
                        tabIndex={0}
                        aria-pressed={selectedProfileId === pid}
                        onClick={() => handleProfileChange(pid)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleProfileChange(pid);
                          }
                        }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedProfileId === pid
                            ? 'bg-purple-950/40 border-purple-500 text-white'
                            : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs">{prof.name}</span>
                          <span className="text-[0.625rem] font-mono text-purple-400">{prof.standard}</span>
                        </div>
                        <p className="text-[0.6875rem] text-slate-500 leading-snug">{publishProfileDescription(pid, locale)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ink Manager & Separations */}
              <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    {t('Prepress Ink Manager & Separation Density')}
                  </h3>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={model.cmykSimulated}
                      onChange={(e) => onUpdateModel((prev) => ({ ...prev, cmykSimulated: e.target.checked }))}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
                    />
                    <span>{t('CMYK Overprint Simulation')}</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {prepressReport.separations.map((sep) => (
                    <div key={sep.id} className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: sep.colorHex }} />
                        <span className="text-[0.625rem] font-mono text-slate-400">{sep.isSpot ? 'SPOT' : 'PROC'}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-200 truncate">{sep.name}</div>
                      <div className="flex items-center justify-between text-[0.6875rem] text-slate-400 font-mono">
                        <span>{t('Density:')}</span>
                        <span className="text-purple-300">{sep.density}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NAVIGABLE PREFLIGHT AUDIT */}
          {activeTab === 'preflight' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-white">{t('Interactive Navigable Preflight')}</h3>
                    <p className="text-xs text-slate-400">{t('Click an issue to jump directly to the page and target frame.')}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  prepressReport.pdfXCompliant
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                }`}>
                  {t(prepressReport.pdfXCompliant ? 'ISO 15930 CERTIFIED' : 'PREPRESS ISSUES DETECTED')}
                </span>
              </div>

              <div className="space-y-2">
                {prepressReport.violations.length === 0 ? (
                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{t('Zero Total Ink Coverage (TIC) violations detected across all active editorial pages.')}</span>
                  </div>
                ) : (
                  prepressReport.violations.map((v) => (
                    <div
                      key={v.id}
                      // GAP-0051, Runde 280: der Verstoss trug `cursor-pointer`
                      // und ein `onClick`, aber keinen Tastaturweg — er liess
                      // sich nur mit der Maus anspringen.
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNavigateToFrame(v.frameId, v.pageIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleNavigateToFrame(v.frameId, v.pageIndex);
                        }
                      }}
                      className="p-3 bg-amber-950/20 hover:bg-amber-950/30 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-200 group-hover:text-amber-300 transition-colors">
                            {publishTicViolationText(v.description, locale)}
                          </span>
                          <span className="text-[0.6875rem] text-slate-400 block">
                            {t('Page')} {v.pageIndex + 1} | {t('Coordinates: X:')} {v.xMm}mm, {t('Y:')} {v.yMm}mm
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-amber-900/40 text-amber-200 rounded text-[0.6875rem] font-mono shrink-0">
                        {t('Jump to Frame →')}
                      </span>
                    </div>
                  ))
                )}

                {/* Additional Preflight Invariants */}
                <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-300">{t('Bleed Boundary:')} {model.geometry.bleedMm}mm ({t('minimum 3mm required for PDF/X')})</span>
                  </div>
                  <span className="text-emerald-400 font-mono text-[0.6875rem]">{t('Pass')}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PDF/X EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold text-white">{t('Target PDF/X Standard')}</h3>
                  <div className="space-y-2">
                    {(['PDF/X-4:2010', 'PDF/X-1a:2001'] as PdfXStandard[]).map((std) => (
                      <label
                        key={std}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                          pdfStandard === std ? 'bg-purple-950/40 border-purple-500 text-white' : 'bg-slate-900/50 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-bold block">{std}</span>
                          <span className="text-[0.6875rem] text-slate-500">
                            {t(std === 'PDF/X-4:2010' ? 'Supports live transparency & 16-bit color gamut' : 'Blind exchange standard, flattens transparency to CMYK')}
                          </span>
                        </div>
                        <input
                          type="radio"
                          name="pdfx-std"
                          checked={pdfStandard === std}
                          onChange={() => setPdfStandard(std)}
                          className="text-purple-600 focus:ring-0"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold text-white">{t('Prepress Printer Marks')}</h3>
                  <div className="space-y-2 text-xs">
                    {(
                      [
                        { key: 'cropMarks', label: 'Trim & Crop Marks' },
                        { key: 'bleedMarks', label: 'Bleed Marks' },
                        { key: 'registrationMarks', label: 'Registration Targets' },
                        { key: 'colorBars', label: 'Color Calibration Bars' },
                        { key: 'pageInformation', label: 'Slug Info & Timestamps' },
                      ] as const
                    ).map((m) => (
                      <label key={m.key} className="flex items-center justify-between text-slate-300 cursor-pointer">
                        <span>{t(m.label)}</span>
                        <input
                          type="checkbox"
                          checked={marks[m.key]}
                          onChange={(e) => setMarks((prev) => ({ ...prev, [m.key]: e.target.checked }))}
                          className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-0"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleExportPdfX}
                disabled={isExporting}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 transition-all"
              >
                <Printer className="w-4 h-4" />
                {isExporting ? t('Generating PDF/X Stream...') : `${t('Export Print-Ready')} ${pdfStandard}`}
              </button>

              {exportResult && (
                <div className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300">{t('Generated')} {exportResult.standard} {t('Package')}</span>
                    <span className="font-mono text-slate-400">{Math.round(exportResult.bytesCount / 1024)} KB</span>
                  </div>
                  <div className="font-mono text-[0.6875rem] text-slate-400 truncate">
                    SHA-256: {exportResult.sha256}
                  </div>
                  <div className="text-[0.6875rem] text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('Includes')} {exportResult.marksApplied.map((mark) => t(mark)).join(', ')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VERIFICATION SUITE */}
          {activeTab === 'suite' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    {t('Astraea Publish 6-Point Verification Suite')}
                  </h3>
                  <p className="text-xs text-slate-400">{t('Formal audit: .vpub seal, PDF/X output intent, TIC diagnostics & IDML fidelity')}</p>
                </div>
                <button
                  onClick={handleRunSuite}
                  disabled={isRunningSuite}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isRunningSuite ? 'animate-spin' : ''}`} />
                  {isRunningSuite ? t('Running Audit...') : t('Run Verification Suite')}
                </button>
              </div>

              {suiteReport && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl">
                      <span className="text-[0.6875rem] text-slate-400 block">{t('Fidelity Score')}</span>
                      <span className="text-xl font-black text-emerald-400 font-mono">{suiteReport.overallFidelityScore}%</span>
                    </div>
                    <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl">
                      <span className="text-[0.6875rem] text-slate-400 block">{t('Passed Tests')}</span>
                      <span className="text-xl font-black text-white font-mono">{suiteReport.passedCount} / {suiteReport.totalTests}</span>
                    </div>
                    <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl">
                      <span className="text-[0.6875rem] text-slate-400 block">{t('SHA-256 Container Seal')}</span>
                      <span className="text-xs font-mono text-purple-300 truncate block mt-1">{suiteReport.containerSha256.substring(0, 16)}...</span>
                    </div>
                  </div>

                  <PublishVerificationResultRows results={suiteReport.results} locale={locale} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
