// STATUS: DIAMANT VGT SUPREME
// Astraea Whiteboard Interoperability, Spatial Virtualization & Audit Modal
// Provides native .vboard container exchange, SVG vector export, auto-layout & test suite

import React, { useState } from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { creativePersonalText } from '../../creativePersonalLocale';
import { whiteboardDeepText } from '../whiteboardDeepLocale';
import { whiteboardInteropFidelityText, whiteboardInteropResultText } from '../whiteboardInteropLocale';
import { useWhiteboardDialogFocus } from './useWhiteboardDialogFocus';
import { WHITEBOARD_INTEROP_FIDELITY } from '../interchange/whiteboardInteropFidelity';
import {
  X,
  FileCode,
  ShieldCheck,
  Cpu,
  GitBranch,
  Download,
  Upload,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layout,
  Maximize2,
} from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WhiteboardItem } from '../types';
import {
  buildWhiteboardPdf,
  buildWhiteboardPng,
  buildWhiteboardSvg,
  downloadWhiteboardBytes,
  downloadWhiteboardText,
  importCommonDiagramSvg,
  importPdfPagesAsWhiteboardItems,
  WHITEBOARD_INTERCHANGE_LIMITS,
  packNativeWhiteboard,
  safeWhiteboardFilename,
  unpackNativeWhiteboard,
} from '../interchange/whiteboardExportImportEngine';
import { deliverExportDataUrl } from '../../../shared/interchange/exportDelivery';
import { whiteboardDeliveryText, whiteboardExportFailureText } from '../interchange/whiteboardExportStatus';
import {
  getVirtualizationStats,
  estimateMemoryFootprint,
  enforceResourceCeiling,
  calculateCanvasBounds,
} from '../rendering/whiteboardSpatialIndexEngine';
import { applyTreeAutoLayout } from '../model/whiteboardAutoLayoutEngine';
import {
  runWhiteboardTestSuite,
  WhiteboardSuiteReport,
  type WhiteboardTestResult,
} from './whiteboardRoundtripTestSuite';

interface WhiteboardInteropModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceDocument: WorkspaceDocument;
  documentTitle: string;
  items: WhiteboardItem[];
  onUpdateItems: (newItems: WhiteboardItem[]) => void;
  onImportDocument: (document: WorkspaceDocument) => void;
  onExportToPresent: () => void;
  showToast: (msg: string) => void;
}

export const WhiteboardInteropDiagnosticRows: React.FC<{ results: readonly WhiteboardTestResult[]; locale: WorkspaceLocale }> = ({ results, locale }) => (
  <div className="space-y-2">
    {results.map((result) => {
      const copy = whiteboardInteropResultText(result.id, result.passed, locale);
      return (
        <div key={result.id} className={`p-3 rounded-xl border flex items-start space-x-3 ${result.passed ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'}`}>
          {result.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between"><span className="text-xs font-bold">{copy.name}</span><span className="font-mono text-[0.625rem] opacity-75">{result.durationMs}ms</span></div>
            <p className="text-[0.6875rem] opacity-90 mt-0.5">{copy.message}</p>
          </div>
        </div>
      );
    })}
  </div>
);

export const WhiteboardInteropModal: React.FC<WhiteboardInteropModalProps> = ({
  isOpen,
  onClose,
  workspaceDocument,
  documentTitle,
  items,
  onUpdateItems,
  onImportDocument,
  onExportToPresent,
  showToast,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => creativePersonalText(whiteboardDeepText(message, locale), locale);
  const [activeTab, setActiveTab] = useState<
    'interchange' | 'spatial' | 'autolayout' | 'suite'
  >('interchange');
  const [suiteReport, setSuiteReport] = useState<WhiteboardSuiteReport | null>(null);
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [nativePassword, setNativePassword] = useState('');
  const [selectedFrameId, setSelectedFrameId] = useState('');
  const dialogRef = useWhiteboardDialogFocus(isOpen, onClose);

  if (!isOpen) return null;

  const bounds = calculateCanvasBounds(items);
  const memStats = estimateMemoryFootprint(items);
  const virtStats = getVirtualizationStats(items, {
    minX: 0,
    minY: 0,
    maxX: 1920,
    maxY: 1080,
  });

  const handleExportVBoard = async () => {
    try {
      const bytes = await packNativeWhiteboard(workspaceDocument, nativePassword ? { password: nativePassword } : {});
      const delivery = await downloadWhiteboardBytes(bytes, 'application/octet-stream', `${safeWhiteboardFilename(documentTitle)}.vboard`);
      showToast(`${t(nativePassword ? 'Exported portable encrypted .vboard.' : 'Exported device-bound encrypted .vboard.')} ${whiteboardDeliveryText(delivery)}`);
    } catch (error) { showToast(whiteboardExportFailureText(error)); }
  };

  const handleImportVBoard = async (file: File) => {
    try {
      if (file.size <= 0 || file.size > WHITEBOARD_INTERCHANGE_LIMITS.maxNativeBytes) throw new Error('File exceeds the native import policy');
      const imported = await unpackNativeWhiteboard(new Uint8Array(await file.arrayBuffer()), nativePassword ? { password: nativePassword } : {});
      onImportDocument(imported);
      showToast(`${t('Imported encrypted .vboard with')} ${imported.whiteboardData?.items?.length ?? 0} ${t('items')}.`);
    } catch { showToast(t('Whiteboard operation failed.')); }
  };

  const exportScope = selectedFrameId ? { frameId: selectedFrameId } : {};
  const handleExportSvg = async () => {
    try {
      const delivery = await downloadWhiteboardText(buildWhiteboardSvg(documentTitle, items, exportScope), 'image/svg+xml;charset=utf-8', `${safeWhiteboardFilename(documentTitle)}${selectedFrameId ? '-frame' : ''}.svg`);
      showToast(`${t(selectedFrameId ? 'Exported selected frame as vector SVG.' : 'Exported bounded vector SVG.')} ${whiteboardDeliveryText(delivery)}`);
    } catch (error) { showToast(whiteboardExportFailureText(error)); }
  };
  const handleExportPng = async () => {
    try {
      const dataUrl = await buildWhiteboardPng(documentTitle, items, exportScope);
      const deliverable = await deliverExportDataUrl(dataUrl, {
        suggestedName: `${safeWhiteboardFilename(documentTitle)}${selectedFrameId ? '-frame' : ''}.png`,
        extensions: ['png'],
        mimeType: 'image/png',
      });
      showToast(`${t('Exported high-resolution tiled PNG.')} ${whiteboardDeliveryText(deliverable)}`);
    } catch (error) { showToast(whiteboardExportFailureText(error)); }
  };
  const handleExportPdf = async () => {
    try {
      const bytes = await buildWhiteboardPdf(documentTitle, items, exportScope);
      const delivery = await downloadWhiteboardBytes(bytes, 'application/pdf', `${safeWhiteboardFilename(documentTitle)}${selectedFrameId ? '-frame' : ''}.pdf`);
      showToast(`${t(selectedFrameId ? 'Exported selected frame as PDF.' : 'Exported frame-paged PDF.')} ${whiteboardDeliveryText(delivery)}`);
    } catch (error) { showToast(whiteboardExportFailureText(error)); }
  };
  const handleImportDiagramSvg = async (file: File) => {
    try {
      if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new Error('SVG exceeds byte policy');
      const imported = importCommonDiagramSvg(await file.text());
      onUpdateItems([...items, ...imported]);
      showToast(`${t('Imported')} ${imported.length} ${t('native diagram object(s) from SVG.')}`);
    } catch { showToast(t('Whiteboard operation failed.')); }
  };
  const handleImportPdf = async (file: File) => {
    try {
      if (file.size < 1 || file.size > WHITEBOARD_INTERCHANGE_LIMITS.maxPdfBytes) throw new Error('PDF exceeds byte policy');
      const imported = await importPdfPagesAsWhiteboardItems(file, bounds.minX, bounds.maxY + 120);
      onUpdateItems([...items, ...imported]);
      showToast(`${t('Imported')} ${imported.length} ${t('flattened local PDF page(s).')}`);
    } catch { showToast(t('Whiteboard operation failed.')); }
  };

  const handleApplyTreeLayout = (orientation: 'horizontal' | 'vertical') => {
    const rearranged = applyTreeAutoLayout(items, {
      orientation,
      horizontalSpacing: 80,
      verticalSpacing: 60,
      startX: 100,
      startY: 100,
    });
    onUpdateItems(rearranged);
    showToast(t(orientation === 'horizontal' ? 'Applied horizontal tree auto-layout to nodes.' : 'Applied vertical tree auto-layout to nodes.'));
  };

  const handleEnforceCeiling = () => {
    const res = enforceResourceCeiling(items, 15 * 1024 * 1024);
    if (res.culledCount > 0) {
      onUpdateItems(res.safeItems);
      showToast(`${res.culledCount} ${t('oversized items pruned; memory freed:')} ${(res.memoryFreed / 1024).toFixed(0)} KB`);
    } else {
      showToast(t('Canvas is optimal: memory is within safe limits.'));
    }
  };

  const handleRunSuite = async () => {
    setIsRunningSuite(true);
    try {
      const report = await runWhiteboardTestSuite();
      setSuiteReport(report);
      if (report.allPassed) {
        showToast(t('All six bounded Whiteboard diagnostics passed.'));
      } else {
        showToast(`${report.failedTests} ${t('Whiteboard diagnostic(s) failed.')}`);
      }
    } catch {
      showToast(t('Whiteboard operation failed.'));
    } finally {
      setIsRunningSuite(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="whiteboard-interop-title" tabIndex={-1} className="relative w-full max-w-3xl bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 id="whiteboard-interop-title" className="text-sm font-bold text-white tracking-wide">
                {t('Astraea Whiteboard · Interoperability & Diagnostics')}
              </h2>
              <p className="text-xs text-slate-400">
                {t('Encrypted .vboard, PNG/SVG/PDF interchange, Spatial virtualization & Audit Suite')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Close Whiteboard interoperability dialog')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label={t('Whiteboard interoperability sections')} className="flex overflow-x-auto border-b border-slate-800 bg-slate-900/40 px-6">
          <button
            onClick={() => setActiveTab('interchange')}
            role="tab" aria-selected={activeTab === 'interchange'}
            className={`flex items-center space-x-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'interchange'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{t('Containers & Vector')}</span>
          </button>
          <button
            onClick={() => setActiveTab('spatial')}
            role="tab" aria-selected={activeTab === 'spatial'}
            className={`flex items-center space-x-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'spatial'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>{t('Spatial Virtualization')}</span>
          </button>
          <button
            onClick={() => setActiveTab('autolayout')}
            role="tab" aria-selected={activeTab === 'autolayout'}
            className={`flex items-center space-x-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'autolayout'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>{t('Auto-Layout & Routing')}</span>
          </button>
          <button
            onClick={() => setActiveTab('suite')}
            role="tab" aria-selected={activeTab === 'suite'}
            className={`flex items-center space-x-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'suite'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('Bounded Diagnostics')}</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'interchange' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <FileCode className="w-4 h-4 text-indigo-400" />
                  <span>{t('Native .vboard Container (Encrypted)')}</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  {t('Uses the authenticated VGT2/VGT3 Workspace container. Default export is device-bound encrypted; an optional password creates a portable encrypted .vboard.')}
                </p>
                <input
                  type="password"
                  value={nativePassword}
                  onChange={(event) => setNativePassword(event.target.value.slice(0, 256))}
                  placeholder={t('Optional portable .vboard password')}
                  autoComplete="new-password"
                  className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                />
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleExportVBoard}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('Download .vboard')}</span>
                  </button>
                  <label className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-2 border border-slate-700 cursor-pointer transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t('Import .vboard')}</span>
                    <input
                      type="file"
                      accept=".vboard"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportVBoard(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>{t('Vector SVG Export (Hardened & Sanitized)')}</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  {t('Generates scalable, standalone SVG with arrowheads, connector paths, and strict neutralization against polyglots and XSS vectors (CWE-79).')}
                </p>
                <button
                  onClick={handleExportSvg}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('Download SVG Vector')}</span>
                </button>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select value={selectedFrameId} onChange={(event) => setSelectedFrameId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                    <option value="">{t('Whole board / frame-paged PDF')}</option>
                    {items.filter((item) => item.type === 'frame').map((frame) => <option key={frame.id} value={frame.id}>{frame.text || frame.name || frame.id}</option>)}
                  </select>
                  <button onClick={() => void handleExportPng()} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-100">{t('High-res PNG')}</button>
                  <button onClick={() => void handleExportPdf()} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-100">{t('PDF pages')}</button>
                  <button onClick={onExportToPresent} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-100">{t('Frames → Present')}</button>
                  <label className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-100 cursor-pointer">{t('Import diagram SVG')}<input type="file" accept="image/svg+xml,.svg" className="hidden" onChange={(event)=>{const file=event.target.files?.[0]; if(file) void handleImportDiagramSvg(file); event.currentTarget.value='';}} /></label>
                  <label className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-100 cursor-pointer">{t('Import PDF pages')}<input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event)=>{const file=event.target.files?.[0]; if(file) void handleImportPdf(file); event.currentTarget.value='';}} /></label>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-label={t('Interoperability fidelity disclosure')}><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-200">{t('Fidelity disclosure')}</h3><div className="space-y-1.5">{WHITEBOARD_INTEROP_FIDELITY.map((entry)=>{const copy=whiteboardInteropFidelityText(entry.format,entry.fidelity,locale);return <p key={entry.format} className="text-[0.625rem] leading-relaxed text-slate-400"><strong className="text-slate-200">{copy.format} · {copy.fidelity}</strong> — {copy.preserved} {copy.limitations}</p>;})}</div></div>
            </div>
          )}

          {activeTab === 'spatial' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[0.6875rem] text-slate-400 uppercase font-semibold">{t('Canvas Bounds')}</span>
                  <div className="text-sm font-bold text-white mt-1">
                    {Math.round(bounds.maxX - bounds.minX)} × {Math.round(bounds.maxY - bounds.minY)} px
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[0.6875rem] text-slate-400 uppercase font-semibold">{t('Memory Consumption')}</span>
                  <div className="text-sm font-bold text-emerald-400 mt-1">{memStats.formattedSize}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[0.6875rem] text-slate-400 uppercase font-semibold">{t('Total Objects')}</span>
                  <div className="text-sm font-bold text-indigo-400 mt-1">{items.length} items</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-[0.6875rem] text-slate-400 uppercase font-semibold">{t('Viewport Culling Rate')}</span>
                  <div className="text-sm font-bold text-amber-400 mt-1">{virtStats.culledPercentage}% Culled</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{t('Out-Of-Memory (OOM) Protection Boundary')}</h4>
                  <p className="text-xs text-slate-400">{t('Enforce safe 15 MB heap ceiling to prevent canvas crash under heavy image loads.')}</p>
                </div>
                <button
                  onClick={handleEnforceCeiling}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-all"
                >
                  {t('Verify Ceiling')}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'autolayout' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <GitBranch className="w-4 h-4 text-indigo-400" />
                  <span>{t('Algorithmic Tree & Flowchart Layout')}</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  {t('Automatically sorts nodes hierarchically based on connector dependencies, centering parents and eliminating overlaps.')}
                </p>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleApplyTreeLayout('horizontal')}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    <Layout className="w-3.5 h-3.5" />
                    <span>{t('Horizontal Mind-Map')}</span>
                  </button>
                  <button
                    onClick={() => handleApplyTreeLayout('vertical')}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-2 border border-slate-700 transition-all"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>{t('Vertical Flowchart')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'suite' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div>
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    {t('Whiteboard Interchange Diagnostics')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t('Six bounded checks use a private encrypted-container fixture plus SVG, spatial, routing, frame, and memory fixtures. They do not verify foreign-application roundtrips or release readiness.')}
                  </p>
                </div>
                <button
                  onClick={handleRunSuite}
                  disabled={isRunningSuite}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/20 transition-all"
                >
                  {isRunningSuite ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{t('Run Diagnostics')}</span>
                </button>
              </div>

              {suiteReport && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs px-1 text-slate-400">
                    <span>
                      Passed: <strong className="text-emerald-400">{suiteReport.passedTests}</strong> / {suiteReport.totalTests}
                    </span>
                    <span className="font-mono text-[0.6875rem]">{new Date(suiteReport.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <WhiteboardInteropDiagnosticRows results={suiteReport.results} locale={locale} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
