// STATUS: DIAMANT VGT SUPREME — Interoperability Diagnostic & Universal Importer Modal
import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X, Play, FileUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import { runRoundtripTestSuite, FidelityReport } from '../diagnostics/writerRoundtripTestSuite';
import { importDocument, ImportFormat } from '../import/writerImporter';
import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  describeWriterInterchangeLoss,
  importWriterPortableFile,
  type WriterInterchangeLossReport,
} from '../portable/writerPortableInterop';

interface WriterRoundtripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportParagraphs: (imported: Paragraph[], docTitle?: string) => void;
  onImportDocument: (imported: WorkspaceDocument) => void;
}

export const WriterRoundtripModal: React.FC<WriterRoundtripModalProps> = ({
  isOpen,
  onClose,
  onImportParagraphs,
  onImportDocument,
}) => {
  const [activeTab, setActiveTab] = useState<'suite' | 'import'>('suite');
  const [report, setReport] = useState<FidelityReport | null>(null);
  const [suiteRunning, setSuiteRunning] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFilename, setImportFilename] = useState('imported-document.docx');
  const [explicitFormat, setExplicitFormat] = useState<ImportFormat>('auto');
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setSuiteRunning(true);
    void runRoundtripTestSuite().then((res) => {
      if (active) setReport(res);
    }).finally(() => {
      if (active) setSuiteRunning(false);
    });
    return () => { active = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunSuite = async () => {
    setSuiteRunning(true);
    try {
      setReport(await runRoundtripTestSuite());
    } finally {
      setSuiteRunning(false);
    }
  };

  const handleExecuteImport = () => {
    if (!importText.trim()) return;
    const res = importDocument(importText, importFilename, explicitFormat);
    setImportSummary(`Erfolgreich ${res.itemCount} Absätze erkannt (${res.formatDetected.toUpperCase()}).`);
    onImportParagraphs(res.paragraphs, res.title);
  };

  const handleFileImport = async (file: File) => {
    try {
      // W-177: the import reports what it walked past. The sink is filled during the import below, so the
      // message can name the loss in the same breath as the success — never "imported" without it.
      const captured: WriterInterchangeLossReport[] = [];
      const imported = await importWriterPortableFile(file, (report) => { captured.push(report); });
      onImportDocument(imported);
      const block = imported.root_object_ids.map((id) => imported.objects[id]).find((object) => object?.type === 'TextBlock');
      const count = block?.type === 'TextBlock' ? block.data.paragraphs.length : 0;
      const report = captured[0];
      setImportSummary(
        report && report.hasLosses
          ? `${file.name}: ${count} Absätze importiert — ACHTUNG: ${describeWriterInterchangeLoss(report)}`
          : `${file.name}: ${count} Absätze als echte Datei lokal importiert.`,
      );
    } catch (error) {
      setImportSummary(error instanceof Error ? error.message : 'Dateiimport fehlgeschlagen.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-100">Interoperabilität, Roundtrip-Audit & Importer</h3>
          </div>
          <button aria-label="Close Interoperabilität, Roundtrip-Audit & Importer dialog"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center space-x-2 border-b border-white/10 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('suite')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
              activeTab === 'suite'
                ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Roundtrip-Fidelity Benchmark
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
              activeTab === 'import'
                ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Universeller Multi-Format Importer
          </button>
        </div>

        {/* Tab 1: Roundtrip Suite Benchmark */}
        {activeTab === 'suite' && !report && (
          <div className="rounded-xl border border-white/10 bg-slate-800/40 p-5 text-center text-xs text-slate-400">
            {suiteRunning ? 'Echte Export→Import-Roundtrips werden lokal geprüft…' : 'Noch kein Roundtrip-Bericht vorhanden.'}
          </div>
        )}

        {activeTab === 'suite' && report && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-slate-800/60 rounded-xl border border-white/5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                  {report.averageScore}%
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">
                    {report.overallPassed ? 'Interoperabilitäts-Audit bestanden' : 'Prüfschwellen verfehlt'}
                  </h4>
                  <p className="text-[0.6875rem] text-slate-400">
                    Geprüft gegen DOCX (OOXML), ODF, RTF 1.5, HTML5 und CommonMark.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { void handleRunSuite(); }}
                disabled={suiteRunning} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-blue-500/20 disabled:cursor-wait disabled:opacity-60"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{suiteRunning ? 'Prüft…' : 'Erneut ausführen'}</span>
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {report.tests.map((t) => (
                <div key={t.format} className="p-3 bg-slate-800/40 rounded-xl border border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{t.format}</span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        t.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {t.score}% Fidelity
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[0.625rem] text-slate-400 font-mono">
                    <span>Text-Fidelity: {t.textFidelity}%</span>
                    <span>Struktur-Fidelity: {t.structureFidelity}%</span>
                  </div>
                  {t.anomalies.length > 0 && (
                    <div className="pt-1 space-y-0.5">
                      {t.anomalies.map((a, aIdx) => (
                        <div key={aIdx} className="flex items-center space-x-1 text-[0.625rem] text-amber-400">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Universal Importer */}
        {activeTab === 'import' && (
          <div className="space-y-3">
            <input ref={fileInputRef} type="file" accept=".docx,.odt,.rtf,.html,.htm,.md,.markdown,.txt" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleFileImport(file); }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15 flex items-center justify-center gap-2"><FileUp className="h-4 w-4" />Echte Datei öffnen: DOCX / ODT / RTF / HTML / Markdown / TXT</button>
            <p className="text-[0.625rem] text-slate-500">Dateien werden lokal und begrenzt verarbeitet. ZIP-basierte Formate laufen durch Entry-, Größen- und Kompressionslimits.</p>
            <div className="border-t border-white/10 pt-3 text-[0.625rem] font-bold uppercase tracking-wider text-slate-600">Raw/Paste-Diagnostik</div>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                placeholder="Dateiname (z.B. report.docx, doc.odt, notes.md)..."
                value={importFilename}
                onChange={(e) => setImportFilename(e.target.value)}
                className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
              />
              <select
                value={explicitFormat}
                onChange={(e) => setExplicitFormat(e.target.value as ImportFormat)}
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              >
                <option value="auto">Auto-Erkennung</option>
                <option value="docx">DOCX (Word XML)</option>
                <option value="odt">ODT (OpenDocument)</option>
                <option value="rtf">RTF 1.5</option>
                <option value="html">HTML5</option>
                <option value="markdown">Markdown</option>
                <option value="txt">Plain Text</option>
              </select>
            </div>

            <textarea
              rows={8}
              placeholder="Fügen Sie hier den Inhalt ein (XML-Markup, Markdown-Text, RTF-Code oder HTML)..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 font-mono text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
            />

            {importSummary && (
              <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{importSummary}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={!importText.trim()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <FileUp className="w-4 h-4" />
              <span>Dokument importieren und im Editor laden</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
