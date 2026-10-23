// STATUS: DIAMANT VGT SUPREME — Grid interoperability dialog: universal importer, workbook export and round-trip audit.
//
// Reachability: this component is mounted by `apps/grid/overlays/GridModals.tsx` (the Grid modal
// orchestrator), so the import preview and the XLSX/ODS export are reachable from the real Grid UI.
import React, { useMemo, useState } from 'react';
import { ShieldCheck, X, Play, CheckCircle2, AlertTriangle, FileUp, FileDown, Table2 } from 'lucide-react';
import { runGridRoundtripTestSuite, type GridFidelityReport } from './gridRoundtripTestSuite';
import {
  GRID_IMPORT_MAX_BYTES,
  importSpreadsheetDocument,
  type GridFileFormat,
} from './gridXlsxOdsRoundtrip';
import {
  buildGridDelimitedPreview,
  importGridDelimitedText,
  type GridDelimitedPreview,
} from './gridDelimitedImport';
import {
  buildGridWorkbookExport,
  createGridExportDocumentFromCells,
  downloadGridWorkbookExport,
  gridExportRecordSummary,
  type GridWorkbookExportFormat,
  type GridWorkbookExportRecord,
} from './gridWorkbookExport';
import { gridExportDeliveryText, gridExportFailureText } from './gridExportStatus';

interface GridRoundtripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCells: (cells: Record<string, string>, rowCount: number, colCount: number) => boolean | void | Promise<boolean | void>;
  /** Workbook to export. When absent the dialog exports the data currently held in the import tab. */
  workbookDocument?: import('../../../shared/contracts/workspace').WorkspaceDocument;
}

type Tab = 'import' | 'export' | 'suite';


export const GridRoundtripModal: React.FC<GridRoundtripModalProps> = ({
  isOpen,
  onClose,
  onImportCells,
  workbookDocument,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('import');
  const [report, setReport] = useState<GridFidelityReport>(() => runGridRoundtripTestSuite());
  const [importText, setImportText] = useState('');
  const [importFilename, setImportFilename] = useState('sheet1.csv');
  const [format, setFormat] = useState<GridFileFormat>('auto');
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [exportRecord, setExportRecord] = useState<GridWorkbookExportRecord | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDelivery, setExportDelivery] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  // Preview is pure and bounded, so it is safe to compute during render.
  const preview: GridDelimitedPreview | null = useMemo(() => {
    if (!importText.trim()) return null;
    try {
      return buildGridDelimitedPreview(importText, { firstRowIsHeader: true });
    } catch (reason) {
      return null;
    }
  }, [importText]);

  if (!isOpen) return null;

  const handleRunSuite = () => setReport(runGridRoundtripTestSuite());

  const handleExecuteImport = async () => {
    if (!importText.trim()) return;
    setImportError(null);
    setImportSummary(null);
    setImportNotes([]);
    try {
      // CSV/TSV go through the bounded, typed, leading-zero-protecting decision layer.
      const isDelimited = format === 'csv' || format === 'tsv' || (format === 'auto' && /\.(?:csv|tsv)$/iu.test(importFilename));
      let cells: Record<string, string>;
      let rowCount: number;
      let colCount: number;
      let formatLabel: string;
      let multiSheetCount = 0;
      let notes: string[] = [];
      if (isDelimited) {
        const parsed = importGridDelimitedText(importText, { firstRowIsHeader: true });
        cells = parsed.cells; rowCount = parsed.rowCount; colCount = parsed.colCount;
        formatLabel = parsed.preview.kind.toUpperCase();
        notes = [
          ...parsed.skippedNotes,
          ...parsed.preview.warnings.map((warning) => `Vorschau: ${warning}`),
        ];
      } else {
        const parsed = importSpreadsheetDocument(importText, importFilename, format);
        cells = parsed.cells; rowCount = parsed.rowCount; colCount = parsed.colCount;
        formatLabel = parsed.format.toUpperCase();
        multiSheetCount = parsed.sheets.length;
        notes = parsed.notes;
      }
      const committed = await onImportCells(cells, rowCount, colCount);
      if (committed === false) {
        setImportError('Der Import wurde durch Tabellen- oder Zugriffsregeln abgelehnt.');
        return;
      }
      const cellCount = Object.keys(cells).length;
      const sheetNote = multiSheetCount > 1 ? ` · ${multiSheetCount} Blätter erkannt` : '';
      setImportSummary(`${cellCount} Zellen geladen (${formatLabel}, ${rowCount}×${colCount})${sheetNote}.`);
      setImportNotes(notes.slice(0, 32));
    } catch (reason) {
      setImportError(reason instanceof Error ? `Import abgelehnt: ${reason.message}` : 'Der Import ist ungültig oder überschreitet die zulässigen Grenzen.');
    }
  };

  const handleExport = async (exportFormat: GridWorkbookExportFormat) => {
    setExportBusy(true);
    setExportError(null);
    setExportRecord(null);
    setExportDelivery(null);
    try {
      const source = workbookDocument ?? createGridExportDocumentFromCells(
        preview ? buildImportCellsForExport(importText, importFilename, format) : {},
        importFilename.replace(/\.[^/.]+$/u, '') || 'Grid Export',
        preview?.dataRowCount ?? 20,
        preview?.columnCount ?? 10,
      );
      const exported = await buildGridWorkbookExport(source, exportFormat);
      const delivery = await downloadGridWorkbookExport(exported.bytes, exported.fileName, exportFormat);
      setExportRecord(exported.record);
      setExportDelivery(gridExportDeliveryText(delivery));
    } catch (reason) {
      setExportError(gridExportFailureText(reason));
    } finally {
      setExportBusy(false);
    }
  };

  const tabClass = (tab: Tab): string =>
    `px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
      activeTab === tab ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grid-roundtrip-title"
        className="bg-slate-900 border border-white/15 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-200 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-emerald-400">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            <h3 id="grid-roundtrip-title" className="text-sm font-bold text-slate-100">Grid Interoperabilität, Import & Export</h3>
          </div>
          <button
            aria-label="Grid Interoperabilität, Import & Export Dialog schließen"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div role="tablist" aria-label="Interoperabilitätsbereiche" className="flex items-center space-x-2 border-b border-white/10 pb-1">
          <button type="button" role="tab" aria-selected={activeTab === 'import'} onClick={() => setActiveTab('import')} className={tabClass('import')}>
            Import & Vorschau
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'export'} onClick={() => setActiveTab('export')} className={tabClass('export')}>
            XLSX / ODS Export
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'suite'} onClick={() => setActiveTab('suite')} className={tabClass('suite')}>
            Roundtrip-Audit
          </button>
        </div>

        {activeTab === 'import' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                aria-label="Dateiname der Importquelle"
                placeholder="Dateiname (z.B. data.csv, table.tsv, sheet.ods)…"
                value={importFilename}
                maxLength={128}
                onChange={(event) => { setImportFilename(event.target.value); setImportSummary(null); setImportError(null); }}
                className="flex-1 min-w-48 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
              />
              <label className="flex items-center gap-2 text-[0.6875rem] text-slate-400">
                Format
                <select
                  aria-label="Importformat"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as GridFileFormat)}
                  className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
                >
                  <option value="auto">Auto-Erkennung</option>
                  <option value="csv">CSV (getrennt)</option>
                  <option value="tsv">TSV (Tabulator)</option>
                  <option value="xlsx">XLSX (OpenXML)</option>
                  <option value="ods">ODS (OpenDocument)</option>
                  <option value="json">JSON Tabular</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-[0.6875rem] font-medium text-slate-300">Rohdaten (UTF-8)</span>
              <textarea
                rows={7}
                placeholder="CSV-/TSV-Text, JSON-Dictionary oder XML-Fragment hier einfügen…"
                value={importText}
                maxLength={GRID_IMPORT_MAX_BYTES}
                aria-describedby="grid-import-preview-status"
                onChange={(event) => { setImportText(event.target.value); setImportSummary(null); setImportError(null); setImportNotes([]); }}
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
              />
            </label>

            {preview && (
              <section aria-label="Importvorschau" className="rounded-xl border border-white/10 bg-slate-800/40 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-slate-300">
                  <span className="inline-flex items-center gap-1"><Table2 className="w-3.5 h-3.5" aria-hidden="true" />Vorschau</span>
                  <span>Zeichenkodierung: <b className="text-emerald-300">{preview.encodingLabel}</b></span>
                  <span>Trennzeichen: <b className="text-emerald-300">{preview.delimiterLabel}</b></span>
                  <span>Spalten: <b>{preview.columnCount}</b></span>
                  <span>Datenzeilen: <b>{preview.dataRowCount}{preview.truncated ? '+' : ''}</b></span>
                  <span>Zeilenenden: <b>{preview.lineEnding}</b></span>
                </div>
                <div className="overflow-x-auto rounded border border-white/10">
                  <table className="min-w-full text-[0.625rem] font-mono">
                    <thead className="bg-slate-900/80">
                      <tr>
                        {preview.columns.map((column) => (
                          <th key={column.index} scope="col" className="p-1 text-left text-slate-300">
                            <span className="block truncate max-w-40">{column.letter} · {column.label}</span>
                            <span className={column.leadingZeroProtected ? 'text-amber-300' : 'text-slate-500'}>
                              {column.inferredType}{column.leadingZeroProtected ? ' · führende Nullen' : ''}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.slice(1).map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t border-white/5">
                          {preview.columns.map((column) => (
                            <td key={column.index} className="max-w-44 truncate p-1 text-slate-200">{row[column.index] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.warnings.length > 0 && (
                  <ul className="space-y-0.5">
                    {preview.warnings.map((warning) => (
                      <li key={warning} className="flex items-start gap-1 text-[0.625rem] text-amber-300">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />{warning}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {importSummary && (
              <div role="status" id="grid-import-preview-status" className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /><span>{importSummary}</span>
              </div>
            )}
            {importNotes.length > 0 && (
              <ul aria-label="Hinweise zum Import" className="max-h-24 overflow-y-auto space-y-0.5 text-[0.625rem] text-amber-300">
                {importNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
              </ul>
            )}
            {importError && (
              <div role="alert" className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs break-words">{importError}</div>
            )}

            <button
              type="button"
              onClick={() => { void handleExecuteImport(); }}
              disabled={!importText.trim()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <FileUp className="w-4 h-4" aria-hidden="true" /><span>Daten prüfen und im Blatt laden</span>
            </button>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="space-y-3">
            <p className="text-[0.6875rem] text-slate-400">
              Exportiert {workbookDocument ? 'das geöffnete Arbeitsblatt' : 'die im Import-Reiter eingefügten Daten'} als echte
              OOXML-/ODF-Paketdatei. Formeln innerhalb der Sicherheitsgrenze bleiben Formeln; alles andere wird als inaktiver Text gesichert und unten ausgewiesen.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => { void handleExport('xlsx'); }}
                className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" aria-hidden="true" /><span>Als XLSX exportieren</span>
              </button>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => { void handleExport('ods'); }}
                className="py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" aria-hidden="true" /><span>Als ODS exportieren</span>
              </button>
            </div>
            {exportError && (
              <div role="alert" className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs break-words">{exportError}</div>
            )}
            {exportDelivery && (
              <div role="status" data-grid-export-delivery="true" className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs break-words">{exportDelivery}</div>
            )}
            {exportRecord && (
              <section aria-label="Erhaltungsprotokoll" className="rounded-xl border border-white/10 bg-slate-800/40 p-3 space-y-2 text-[0.6875rem]">
                <div role="status" className="text-emerald-300 font-semibold">{gridExportRecordSummary(exportRecord)}</div>
                <div>
                  <span className="text-slate-400">Erhalten:</span>
                  <ul className="list-disc pl-5 text-slate-300">
                    {exportRecord.preserved.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <span className="text-amber-300">Nicht erhalten:</span>
                  <ul className="list-disc pl-5 text-amber-300/90">
                    {exportRecord.notPreserved.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'suite' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-800/60 rounded-xl border border-white/5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                  {report.averageScore}%
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">
                    {report.overallPassed ? 'Interoperabilitäts-Audit bestanden' : 'Prüfschwellen verfehlt'}
                  </h4>
                  <p className="text-[0.6875rem] text-slate-400">{report.scopeStatement}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunSuite}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-blue-500/20"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" /><span>Erneut ausführen</span>
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {report.tests.map((test) => (
                <div key={test.format} className="p-3 bg-slate-800/40 rounded-xl border border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{test.format}</span>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${test.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {test.score}% Fidelity
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[0.625rem] text-slate-400 font-mono">
                    <span>Zell-Fidelity: {test.cellFidelity}%</span>
                    <span>Formel-Fidelity: {test.formulaFidelity}%</span>
                  </div>
                  <div className="text-[0.625rem] text-slate-500">{test.verificationScope}</div>
                  {test.anomalies.length > 0 && (
                    <div className="pt-1 space-y-0.5">
                      {test.anomalies.map((anomaly, index) => (
                        <div key={index} className="flex items-start space-x-1 text-[0.625rem] text-amber-400">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" /><span>{anomaly}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Exports the pasted delimited text as a cell map, reusing the same bounded decision layer. */
function buildImportCellsForExport(text: string, filename: string, format: GridFileFormat): Record<string, string> {
  try {
    const isDelimited = format === 'csv' || format === 'tsv' || (format === 'auto' && /\.(?:csv|tsv)$/iu.test(filename));
    return isDelimited
      ? importGridDelimitedText(text, { firstRowIsHeader: true }).cells
      : importSpreadsheetDocument(text, filename, format).cells;
  } catch {
    return {};
  }
}
