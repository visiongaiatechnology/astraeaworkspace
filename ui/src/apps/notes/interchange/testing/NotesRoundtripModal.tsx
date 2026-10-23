// STATUS: DIAMANT VGT SUPREME — Notes Universal Interoperability & OneNote/Evernote Modal
import React, { useState } from 'react';
import { ShieldCheck, X, Play, CheckCircle2, AlertTriangle, FileUp, Copy, Check } from 'lucide-react';
import { NoteNotebook, NoteSection } from '../../../../shared/contracts/workspace';
import {
  runNotesRoundtripTestSuite,
  NotesFidelityReport,
} from './notesRoundtripTestSuite';
import {
  importNotesDocument,
  exportToOneNoteXml,
  exportToEvernoteEnex,
  ExternalNotesFormat,
} from '../onenote/notesOneNoteRoundtrip';
import { useNotesDialogA11y } from '../../editor/useNotesDialogA11y';

interface NotesRoundtripModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNotebook: NoteNotebook | null;
  onImportNotebook: (imported: NoteNotebook) => void;
}

export const NotesRoundtripModal: React.FC<NotesRoundtripModalProps> = ({
  isOpen,
  onClose,
  activeNotebook,
  onImportNotebook,
}) => {
  const [activeTab, setActiveTab] = useState<'suite' | 'import' | 'export'>('suite');
  const [report, setReport] = useState<NotesFidelityReport | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [importText, setImportText] = useState('');
  const [importFilename, setImportFilename] = useState('notebook.onenote.xml');
  const [format, setFormat] = useState<ExternalNotesFormat>('auto');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const [exportFormat, setExportFormat] = useState<'onenote' | 'enex'>('onenote');
  const [exportedXml, setExportedXml] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const dialogA11y = useNotesDialogA11y(isOpen, onClose);

  if (!isOpen) return null;

  const handleRunSuite = async () => {
    setIsTesting(true);
    try {
      const res = await runNotesRoundtripTestSuite();
      setReport(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleExecuteImport = () => {
    if (!importText.trim()) return;
    try {
      const res = importNotesDocument(importText, importFilename, format);
      onImportNotebook(res.notebook);
      const pageCount = res.notebook.sections.reduce((acc: number, s: NoteSection) => acc + s.pages.length, 0);
      setImportStatus(
        `Erfolgreich Notizbuch "${res.notebook.title}" mit ${pageCount} Seiten importiert (${res.detectedFormat.toUpperCase()}, Fidelity: ${res.manifest.fidelityScorePercent}%).`
      );
    } catch (e) {
      setImportStatus(`Importfehler: ${String(e)}`);
    }
  };

  const handleGenerateExport = (requestedFormat: 'onenote' | 'enex' = exportFormat) => {
    if (!activeNotebook) return;
    setExportedXml(requestedFormat === 'onenote' ? exportToOneNoteXml(activeNotebook) : exportToEvernoteEnex(activeNotebook));
  };

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportedXml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Notes interoperability diagnostics">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-100">Interoperabilitäts-Diagnose &amp; OneNote-XML/ENEX Adapter</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close interoperability diagnostics"
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center space-x-2 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('suite')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'suite' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            Lokaler Adapter-Selbsttest
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'import' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            OneNote / Evernote Import
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              handleGenerateExport();
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'export' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            OneNote / Evernote Export
          </button>
        </div>

        {/* Tab 1: Roundtrip Suite */}
        {activeTab === 'suite' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-white/5">
              <div>
                <span className="text-xs text-slate-400">Lokale Adapter-Fidelity:</span>
                <div className="text-xl font-bold font-mono text-blue-400">
                  {report ? `${report.overallFidelityPercent}%` : 'Bereit'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunSuite}
                disabled={isTesting}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold rounded-lg text-white flex items-center space-x-1.5 shadow-lg shadow-blue-900/30"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Führe Tests aus...' : 'Suite ausführen'}</span>
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {report?.results.map((res) => (
                <div
                  key={res.testId}
                  className="p-3 bg-slate-800/40 rounded-xl border border-white/5 flex items-start justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      {res.status === 'passed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-200">{res.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-slate-400 font-mono">
                        {res.format}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 pl-6">{res.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-blue-300 font-bold">{res.fidelityPercent}%</span>
                    <div className="text-[10px] text-slate-500 font-mono">{res.durationMs}ms</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Universal Import */}
        {activeTab === 'import' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Dateiname:</label>
                <input
                  type="text"
                  value={importFilename}
                  onChange={(e) => setImportFilename(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Format-Parser:</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  <option value="auto">Automatische Erkennung</option>
                  <option value="onenote">Microsoft OneNote XML-Adapter (kein .one-Binärparser)</option>
                  <option value="enex">Evernote Export Archive (.enex)</option>
                  <option value="markdown">Standard Markdown</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">OneNote / ENEX XML-Quelltext einfügen:</label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Fügen Sie hier OneNote XML (<one:NoteNotebook>) oder Evernote XML (<en-export>) ein..."
                rows={7}
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs font-mono text-slate-300 outline-none focus:border-blue-500/50"
              />
            </div>

            {importStatus && (
              <div className="p-2.5 bg-slate-800/80 rounded-lg text-xs text-blue-300 border border-blue-500/30">
                {importStatus}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={!importText.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold rounded-lg text-white flex items-center space-x-1.5 shadow-lg shadow-blue-900/30"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Notizbuch importieren</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Universal Export */}
        {activeTab === 'export' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400">Exportformat:</span>
                <select
                  value={exportFormat}
                  onChange={(e) => {
                    const nextFormat = e.target.value as 'onenote' | 'enex';
                    setExportFormat(nextFormat);
                    handleGenerateExport(nextFormat);
                  }}
                  className="bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200"
                >
                  <option value="onenote">Microsoft OneNote XML-Adapter (one:Notebook)</option>
                  <option value="enex">Evernote ENEX XML (en-export)</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleCopyExport}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-300 text-xs rounded-lg flex items-center space-x-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Kopiert!' : 'XML kopieren'}</span>
              </button>
            </div>

            <textarea
              readOnly
              value={exportedXml}
              rows={9}
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs font-mono text-blue-300/90 outline-none resize-none"
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-xs rounded-lg text-slate-300"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};