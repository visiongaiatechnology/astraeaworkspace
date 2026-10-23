import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, X, Cpu, Palette, Download, AlertTriangle } from 'lucide-react';
import type { PdfDocumentModel } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../../locale/pdfWorkflowDialogsLocale';
import { runPdfInteroperabilitySuite, PdfFidelityReport } from './pdfRoundtripTestSuite';
import { buildStructuredPrintProductionCopy, type PdfPrintProductionReport } from '../printProduction/pdfPrintProduction';
import { applySecurityWatermarkToPdf, type SecurityWatermarkContext } from '../../security/watermark';
import { buildStructuredPdfA2bArchive, type PdfA2bArchiveWarning, type PdfA2bArchiveWarningCode, type PdfA2bPreflightReport } from '../../interchange/pdfArchiveTarget';
import { deliverExportBytes } from '../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../platform/rendering/documentPdfExport';
import { pdfExportDeliveryText, pdfExportFailureText } from '../../interchange/pdfExportStatus';

interface PdfRoundtripModalProps {
  isOpen: boolean;
  initialTab?: 'suite' | 'preflight' | 'archive';
  onClose: () => void;
  documentTitle: string;
  pdfData: PdfDocumentModel;
  securityWatermarkContext: SecurityWatermarkContext;
}

const TEST_NAME_COPY: Readonly<Record<string, PdfWorkflowCopyKey>> = {
  'Deep Sanitization & Post-Export Verification': 'roundtrip.test.sanitize',
  'Local OCR TSV Boundary Parser': 'roundtrip.test.ocr',
  'Cryptographic PDF signing fail-closed gate': 'roundtrip.test.signature',
  'XFA Detection & Corruption Prevention Policy': 'roundtrip.test.xfa',
  'OutputIntent & ICC Profile PDF/A Preflight': 'roundtrip.test.outputIntent',
  'Binary PDF Stream Serialization & Trailing Delimiter Parity': 'roundtrip.test.stream',
};
const PREFLIGHT_ISSUE_COPY: Readonly<Record<string, PdfWorkflowCopyKey>> = {
  'structure.untagged': 'roundtrip.issue.untagged',
  'structure.reading-order': 'roundtrip.issue.readingOrder',
  'structure.headings': 'roundtrip.issue.headings',
  'structure.tables': 'roundtrip.issue.tables',
  'accessibility.image-alt': 'roundtrip.issue.imageAlt',
  'fonts.unembedded': 'roundtrip.issue.fontsWithCounts',
  'boxes.invalid': 'roundtrip.issue.boxes',
  'color.output-intent': 'roundtrip.issue.outputIntent',
  'color.management': 'roundtrip.issue.color',
  'accessibility.language': 'roundtrip.issue.language',
};
/**
 * W-299: the warning is matched by its **code**, not by its position in the array.
 *
 * The former `ARCHIVE_WARNING_COPY[index]` lookup broke as soon as the engine added, removed or reordered a
 * warning: the user then read the wrong sentence, or a generic one, because the engine's own text was thrown
 * away (`_warning`). A code travels with the meaning; a code this table does not know renders the engine's
 * own sentence rather than a shrug.
 */
const ARCHIVE_WARNING_COPY: Readonly<Record<PdfA2bArchiveWarningCode, PdfWorkflowCopyKey>> = {
  'rasterized-pages': 'roundtrip.archive.warning.raster',
  'flattened-semantics': 'roundtrip.archive.warning.flatten',
  'certification-absent': 'roundtrip.archive.warning.certification',
};

export const PdfRoundtripModal: React.FC<PdfRoundtripModalProps> = ({
  isOpen,
  initialTab = 'suite',
  onClose,
  documentTitle,
  pdfData,
  securityWatermarkContext,
}) => {
  const { locale } = useWorkspaceLocale();
  const [activeTab, setActiveTab] = useState<'suite' | 'preflight' | 'archive'>(initialTab);
  const [isRunning, setIsRunning] = useState(false);
  const [suiteReport, setSuiteReport] = useState<PdfFidelityReport | null>(null);
  const [suiteError, setSuiteError] = useState(false);

  const [language, setLanguage] = useState('en-US');
  const [preflightReport, setPreflightReport] = useState<PdfPrintProductionReport | null>(null);
  const [productionBytes, setProductionBytes] = useState<Uint8Array | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [archiveDpi, setArchiveDpi] = useState(200);
  const [archiveReport, setArchiveReport] = useState<PdfA2bPreflightReport | null>(null);
  const [archiveBytes, setArchiveBytes] = useState<Uint8Array | null>(null);
  const [archiveWarnings, setArchiveWarnings] = useState<readonly PdfA2bArchiveWarning[]>([]);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  /** Release Beta 0.1: export state is stated — saved file vs browser download vs failure. */
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunSuite = async () => {
    setIsRunning(true);
    setSuiteError(false);
    try {
      const rep = await runPdfInteroperabilitySuite();
      setSuiteReport(rep);
    } catch {
      setSuiteError(true);
    } finally {
      setIsRunning(false);
    }
  };

  const handleBuildProductionCopy = () => {
    try {
      const copy = buildStructuredPrintProductionCopy(documentTitle, applySecurityWatermarkToPdf(pdfData, securityWatermarkContext), language);
      setPreflightReport(copy.report);
      setProductionBytes(copy.bytes);
      setPreflightError(null);
    } catch {
      setPreflightReport(null);
      setProductionBytes(null);
      setPreflightError(pdfWorkflowText(locale, 'roundtrip.error.preflight'));
    }
  };

  const handleBuildArchive = async () => {
    setIsArchiving(true);
    try {
      const result = await buildStructuredPdfA2bArchive(documentTitle, pdfData, { dpi: archiveDpi, language });
      setArchiveReport(result.report);
      setArchiveBytes(result.bytes);
      setArchiveWarnings(result.warnings);
      setArchiveError(null);
    } catch {
      setArchiveReport(null);
      setArchiveBytes(null);
      setArchiveWarnings([]);
      setArchiveError(pdfWorkflowText(locale, 'roundtrip.error.archive'));
    } finally {
      setIsArchiving(false);
    }
  };

  const deliverRoundtripPdf = async (bytes: Uint8Array, suffix: string) => {
    const safe = (documentTitle || 'document').replace(/\.pdf$/iu, '').replace(/[^a-z0-9._-]+/giu, '_');
    try {
      const delivery = await deliverExportBytes(bytes, {
        suggestedName: `${safe}_${suffix}.pdf`,
        extensions: ['pdf'],
        mimeType: 'application/pdf',
        assertArtifact: assertPdfExportArtifact,
      });
      setDeliveryNotice(pdfExportDeliveryText(locale, delivery));
      setDeliveryError(null);
    } catch (error) {
      setDeliveryError(pdfExportFailureText(locale, error));
      setDeliveryNotice(null);
    }
  };

  const downloadArchive = async () => {
    if (!archiveBytes) return;
    await deliverRoundtripPdf(archiveBytes, 'PDF-A-2b');
  };

  const downloadProductionCopy = async () => {
    if (!productionBytes) return;
    await deliverRoundtripPdf(productionBytes, 'production');
  };

  const preflightChecks = preflightReport ? ([
    ['roundtrip.report.tagged', preflightReport.tagged],
    ['roundtrip.report.readingOrder', preflightReport.readingOrderDeterministic],
    ['roundtrip.report.semanticTags', preflightReport.headingSemantics && preflightReport.tableSemantics],
    ['roundtrip.report.pageBoxes', preflightReport.pageBoxesValid],
    ['roundtrip.report.outputIntent', preflightReport.srgbProfilePresent],
    ['roundtrip.report.colorManaged', preflightReport.colorManaged],
    ['roundtrip.report.fontsEmbedded', preflightReport.embeddedFonts],
    ['roundtrip.report.language', preflightReport.language],
  ] as const) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label={pdfWorkflowText(locale, 'roundtrip.title')} className="vgt-dialog-scroll-surface w-full max-w-2xl glass-dropdown rounded-2xl p-6 border border-purple-500/30 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-purple-400">
            <Cpu className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-slate-100">{pdfWorkflowText(locale, 'roundtrip.title')}</h3>
          </div>
          <button aria-label={pdfWorkflowText(locale, 'roundtrip.close')} type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div role="tablist" aria-label={pdfWorkflowText(locale, 'roundtrip.title')} className="flex space-x-2 border-b border-white/10 pb-2 text-xs shrink-0">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'suite'}
            aria-controls="pdf-roundtrip-panel"
            onClick={() => setActiveTab('suite')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'suite'
                ? 'bg-purple-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {pdfWorkflowText(locale, 'roundtrip.tab.suite')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preflight'}
            aria-controls="pdf-roundtrip-panel"
            onClick={() => setActiveTab('preflight')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'preflight'
                ? 'bg-purple-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {pdfWorkflowText(locale, 'roundtrip.tab.preflight')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'archive'}
            aria-controls="pdf-roundtrip-panel"
            onClick={() => setActiveTab('archive')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'archive'
                ? 'bg-purple-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {pdfWorkflowText(locale, 'roundtrip.tab.archive')}
          </button>
        </div>

        {/* Tab 1: Interoperability Test Suite */}
        {activeTab === 'suite' && (
          <div id="pdf-roundtrip-panel" role="tabpanel" className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            <p className="text-slate-300">
              {pdfWorkflowText(locale, 'roundtrip.suite.description')}
            </p>

            <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-xl border border-white/10">
              <div>
                <span className="font-semibold text-slate-200">{pdfWorkflowText(locale, 'roundtrip.harness')}</span>
                <p className="text-[11px] text-slate-500 font-mono">{pdfWorkflowText(locale, 'roundtrip.caseCount')}</p>
              </div>
              <button
                type="button"
                onClick={handleRunSuite}
                disabled={isRunning}
                className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold flex items-center space-x-1.5 shadow-lg shadow-purple-600/30"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isRunning ? pdfWorkflowText(locale, 'roundtrip.running') : pdfWorkflowText(locale, 'roundtrip.run')}</span>
              </button>
            </div>

            {suiteError && <div role="alert" aria-live="assertive" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">{pdfWorkflowText(locale, 'roundtrip.error.suite')}</div>}
            {suiteReport && (
              <div className="space-y-2">
                <div className="p-3 bg-slate-900 rounded-xl border border-white/10 flex items-center justify-between font-mono text-[11px]">
                  <span>{pdfWorkflowText(locale, 'roundtrip.score')}: <strong className="text-emerald-400">{suiteReport.overallFidelityScore}%</strong></span>
                  <span>{pdfWorkflowText(locale, 'roundtrip.passed')}: <strong className="text-emerald-300">{suiteReport.passedTests}/{suiteReport.totalTests}</strong></span>
                  <span>{pdfWorkflowText(locale, 'roundtrip.duration')}: <strong className="text-slate-300">{suiteReport.durationMs} ms</strong></span>
                </div>

                <div className="space-y-1.5">
                  {suiteReport.testCases.map((tc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {tc.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span className="font-semibold text-slate-200">{pdfWorkflowText(locale, TEST_NAME_COPY[tc.name] ?? 'roundtrip.test.unknown')}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{tc.durationMs} ms</span>
                      </div>
                      <p className="text-[11px] text-slate-400 pl-6">{pdfWorkflowText(locale, tc.passed ? 'roundtrip.test.pass' : 'roundtrip.test.fail')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Preflight & OutputIntent */}
        {activeTab === 'preflight' && (
          <div id="pdf-roundtrip-panel" role="tabpanel" className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            <p className="text-slate-300">
              {pdfWorkflowText(locale, 'roundtrip.preflight.description')}
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="font-bold text-slate-400 block">{pdfWorkflowText(locale, 'roundtrip.documentLanguage')}</span>
                <input aria-label={pdfWorkflowText(locale, 'roundtrip.documentLanguage')} value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={64} placeholder="en-US" className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-slate-200 focus:outline-none focus:border-purple-500 font-mono" />
              </label>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-[11px] text-slate-400">
                <div className="font-semibold text-slate-200">{pdfWorkflowText(locale, 'roundtrip.proofBoundary')}</div>
                <div className="mt-1">{pdfWorkflowText(locale, 'roundtrip.proofDetails')}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleBuildProductionCopy}
              className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center justify-center space-x-1.5 shadow-lg shadow-purple-600/30"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>{pdfWorkflowText(locale, 'roundtrip.buildProduction')}</span>
            </button>

            {preflightError && <div role="alert" aria-live="assertive" className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-200">{preflightError}</div>}

            {preflightReport && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {preflightChecks.map(([labelKey, value]) => (
                    <div key={labelKey} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-[9px] uppercase text-slate-500">{pdfWorkflowText(locale, labelKey)}</div>
                      <div className={`mt-0.5 font-mono text-[11px] ${value === true ? 'text-emerald-300' : value === false ? 'text-amber-300' : 'text-slate-200'}`}>{typeof value === 'boolean' ? (value ? pdfWorkflowText(locale, 'roundtrip.state.pass') : pdfWorkflowText(locale, 'roundtrip.state.check')) : value}</div>
                    </div>
                  ))}
                </div>
                {preflightReport.issues.map((issue) => <div key={issue.code} className={`rounded-lg border px-3 py-2 text-[11px] ${issue.severity === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : issue.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-blue-500/30 bg-blue-500/10 text-blue-200'}`}>{pdfWorkflowText(locale, PREFLIGHT_ISSUE_COPY[issue.code] ?? 'roundtrip.issue.generic', { embedded: preflightReport.embeddedFontProgramCount, total: preflightReport.fontObjectCount })}</div>)}
                <button type="button" onClick={() => { void downloadProductionCopy(); }} className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 font-semibold text-emerald-200 hover:bg-emerald-500/15 flex items-center justify-center gap-2"><Download className="h-3.5 w-3.5" />{pdfWorkflowText(locale, 'roundtrip.downloadProduction')}</button>
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{pdfWorkflowText(locale, 'roundtrip.preflight.warning')}</span></div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'archive' && (
          <div id="pdf-roundtrip-panel" role="tabpanel" className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            <p className="text-slate-300">
              {pdfWorkflowText(locale, 'roundtrip.archive.description')}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="font-bold text-slate-400 block">{pdfWorkflowText(locale, 'roundtrip.archiveDpi')}</span>
                <select value={archiveDpi} onChange={(event) => setArchiveDpi(Number(event.target.value))} className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-slate-200">
                  <option value={144}>144 DPI</option><option value={200}>200 DPI</option><option value={240}>240 DPI</option><option value={300}>300 DPI</option>
                </select>
              </label>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-100">
                {pdfWorkflowText(locale, 'roundtrip.archive.warning')}
              </div>
            </div>
            <button type="button" onClick={handleBuildArchive} disabled={isArchiving || Boolean(pdfData.rawPdfDataUrl)} className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold">
              {isArchiving ? pdfWorkflowText(locale, 'roundtrip.archive.building') : pdfWorkflowText(locale, 'roundtrip.archive.build')}
            </button>
            {pdfData.rawPdfDataUrl && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">{pdfWorkflowText(locale, 'roundtrip.archive.unsupported')}</div>}
            {archiveError && <div role="alert" aria-live="assertive" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">{archiveError}</div>}
            {archiveReport && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2"><div className="text-[9px] uppercase text-slate-500">{pdfWorkflowText(locale, 'roundtrip.report.preflight')}</div><div className="text-emerald-300 font-mono">{pdfWorkflowText(locale, archiveReport.valid ? 'roundtrip.state.pass' : 'roundtrip.state.fail')}</div></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2"><div className="text-[9px] uppercase text-slate-500">{pdfWorkflowText(locale, 'roundtrip.report.pages')}</div><div className="text-slate-200 font-mono">{new Intl.NumberFormat(locale).format(archiveReport.pageCount)}</div></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2"><div className="text-[9px] uppercase text-slate-500">{pdfWorkflowText(locale, 'roundtrip.report.fonts')}</div><div className="text-amber-200 font-mono">{pdfWorkflowText(locale, 'roundtrip.report.none')}</div><div className="text-[9px] text-slate-500">{pdfWorkflowText(locale, 'roundtrip.report.fontsNoneHint')}</div></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2"><div className="text-[9px] uppercase text-slate-500">{pdfWorkflowText(locale, 'roundtrip.report.profile')}</div><div className="text-emerald-300 font-mono">PDF/A-2b</div></div>
                </div>
                {archiveReport.textSemanticsPreserved === false && (
                  <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-100">
                    {pdfWorkflowText(locale, 'roundtrip.archive.notSearchable')}
                  </div>
                )}
                {archiveWarnings.map((warning) => (
                  <div key={warning.code} role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-100">
                    {ARCHIVE_WARNING_COPY[warning.code] ? pdfWorkflowText(locale, ARCHIVE_WARNING_COPY[warning.code]) : warning.detail}
                  </div>
                ))}
                <button type="button" onClick={() => { void downloadArchive(); }} className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 font-semibold text-emerald-200 hover:bg-emerald-500/15 flex items-center justify-center gap-2"><Download className="h-3.5 w-3.5" />{pdfWorkflowText(locale, 'roundtrip.downloadArchive')}</button>
              </div>
            )}
          </div>
        )}

        {deliveryNotice && <div role="status" data-pdf-roundtrip-delivery="true" className="shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[0.6875rem] text-emerald-200">{deliveryNotice}</div>}
        {deliveryError && <div role="alert" data-pdf-roundtrip-delivery-error="true" className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.6875rem] text-red-200">{deliveryError}</div>}
        <div className="flex justify-end space-x-2 pt-2 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-200 hover:text-white"
          >
            {pdfWorkflowText(locale, 'roundtrip.closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
