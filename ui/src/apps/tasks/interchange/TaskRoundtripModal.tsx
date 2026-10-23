// STATUS: DIAMANT VGT SUPREME
// Astraea Tasks — Interoperability, Roundtrip & Portable Encrypted Bundle Modal
// Schicht 2: Native Deep Engine UI (Lines 1150-1156, 1178)

import React, { useState } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  Download,
  Upload,
  FileSpreadsheet,
  Calendar,
  Lock,
  Cpu,
  Printer,
} from 'lucide-react';
import { TaskItem } from '../../../shared/contracts/workspace';
import { runTaskInteroperabilitySuite, TaskFidelityReport } from '../testing/interchange/taskRoundtripTestSuite';
import { exportTasksToIcalendarVtodo, parseIcalendarVtodoToTasks } from './taskIcalendarVtodo';
import { exportEncryptedTaskBundle, decryptTaskBundle, VTaskEncryptedBundle } from './taskEncryptedBundle';
import { exportTasksToCsv, importTasksFromCsv, exportTasksToJson, importTasksFromJson, TASK_IMPORT_MAX_BYTES } from './taskInterchangeEngine';
import { downloadTaskPdf, printTaskList } from './taskPrintExport';
import { formatTaskFidelityNotice } from './taskExportFidelity';
import { deliverExportText, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { taskDeliveryText, taskDeliveryFailureText } from './taskExportStatus';

interface TaskRoundtripModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskItem[];
  onImportTasks: (tasks: TaskItem[]) => void;
}

export const TaskRoundtripModal: React.FC<TaskRoundtripModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onImportTasks,
}) => {
  const [activeTab, setActiveTab] = useState<'suite' | 'export' | 'import'>('suite');
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteReport, setSuiteReport] = useState<TaskFidelityReport | null>(null);

  // Export / Import states
  const [passphrase, setPassphrase] = useState('Sovereign-Passphrase-2026');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [importPassphrase, setImportPassphrase] = useState('');

  if (!isOpen) return null;

  const handleRunSuite = async () => {
    setIsRunningSuite(true);
    try {
      const rep = await runTaskInteroperabilitySuite();
      setSuiteReport(rep);
    } catch (err) {
      console.error('Task suite failure:', err);
    } finally {
      setIsRunningSuite(false);
    }
  };

  /** Release Beta 0.1: native save first; the browser fallback is a download and says so. */
  const triggerDownload = (filename: string, content: string, mime: string): Promise<ExportDeliveryResult> => {
    const extension = /\.[A-Za-z0-9]{1,12}$/u.test(filename) ? filename.split('.').pop()!.toLowerCase() : 'bin';
    return deliverExportText(content, { suggestedName: filename, extensions: [extension], mimeType: mime });
  };

  const handleExportIcs = async () => {
    try {
      const ics = exportTasksToIcalendarVtodo(tasks, 'Astraea Sovereign Tasks');
      const delivery = await triggerDownload('tasks.ics', ics, 'text/calendar;charset=utf-8');
      setStatusMsg(`${taskDeliveryText(delivery)} Exported ${tasks.length} tasks to RFC 5545 iCalendar VTODO (tasks.ics).${formatTaskFidelityNotice(tasks, 'vtodo')}`);
    } catch (error) { setStatusMsg(taskDeliveryFailureText(error)); }
  };

  const handleExportCsv = async () => {
    try {
      const csv = exportTasksToCsv(tasks);
      const delivery = await triggerDownload('tasks.csv', csv, 'text/csv;charset=utf-8');
      setStatusMsg(`${taskDeliveryText(delivery)} Exported ${tasks.length} tasks to RFC 4180 CSV with Formula Injection protection.${formatTaskFidelityNotice(tasks, 'csv')}`);
    } catch (error) { setStatusMsg(taskDeliveryFailureText(error)); }
  };

  const handleExportJson = async () => {
    try {
      const json = exportTasksToJson(tasks);
      const delivery = await triggerDownload('tasks.json', json, 'application/json;charset=utf-8');
      setStatusMsg(`${taskDeliveryText(delivery)} Exported ${tasks.length} tasks to canonical Tasks JSON schema.${formatTaskFidelityNotice(tasks, 'json')}`);
    } catch (error) { setStatusMsg(taskDeliveryFailureText(error)); }
  };

  const handlePrintPdf = async () => {
    try {
      const delivery = await downloadTaskPdf(tasks, 'Astraea Tasks', 'tasks.pdf');
      setStatusMsg(`${taskDeliveryText(delivery)} Exported ${tasks.length} tasks through the shared Astraea PDF creation service.${formatTaskFidelityNotice(tasks, 'print')}`);
    } catch (err) {
      setStatusMsg(taskDeliveryFailureText(err));
    }
  };

  const handleSystemPrint = () => {
    try {
      printTaskList(tasks, 'Astraea Tasks');
      setStatusMsg(`Opened the local system print sheet for ${tasks.length} tasks.${formatTaskFidelityNotice(tasks, 'print')}`);
    } catch (err) {
      setStatusMsg(`Print failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportEncryptedBundle = async () => {
    try {
      const bundle = await exportEncryptedTaskBundle(tasks, passphrase);
      const json = JSON.stringify(bundle, null, 2);
      const delivery = await triggerDownload('tasks.vtask', json, 'application/json;charset=utf-8');
      setStatusMsg(`${taskDeliveryText(delivery)} Exported ${tasks.length} tasks into portable AES-256-GCM encrypted bundle (tasks.vtask).${formatTaskFidelityNotice(tasks, 'vtask')}`);
    } catch (err) {
      setStatusMsg(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (file.size > TASK_IMPORT_MAX_BYTES) {
      setStatusMsg(`Import rejected: file exceeds ${TASK_IMPORT_MAX_BYTES} byte limit.`);
      return;
    }

    const text = await file.text();
    const name = file.name.toLowerCase();

    try {
      if (name.endsWith('.ics')) {
        const res = parseIcalendarVtodoToTasks(text);
        onImportTasks(res.tasks);
        setStatusMsg(`Imported ${res.tasks.length} tasks from iCalendar VTODO file. ${res.unsupportedPropertiesCount} unsupported properties ignored.${res.warnings.length ? ` ${res.warnings.join(' ')}` : ''}`);
      } else if (name.endsWith('.csv')) {
        const res = importTasksFromCsv(text);
        onImportTasks(res.tasks);
        setStatusMsg(`Imported ${res.tasks.length} tasks from CSV file (${res.skippedCount} skipped).${res.warnings.length ? ` ${res.warnings.join(' ')}` : ''}`);
      } else if (name.endsWith('.vtask') || name.endsWith('.json')) {
        if (text.includes('VTASK_ENCRYPTED_V2')) {
          const bundle = JSON.parse(text) as VTaskEncryptedBundle;
          const payload = await decryptTaskBundle(bundle, importPassphrase || passphrase);
          onImportTasks(payload.tasks);
          setStatusMsg(`Decrypted & imported ${payload.tasks.length} tasks from .vtask bundle.${payload.warnings?.length ? ` ${payload.warnings.join(' ')}` : ''}`);
        } else {
          const res = importTasksFromJson(text);
          onImportTasks(res.tasks);
          setStatusMsg(`Imported ${res.tasks.length} validated tasks from JSON file (${res.skippedCount} skipped).${res.warnings.length ? ` ${res.warnings.join(' ')}` : ''}`);
        }
      } else {
        setStatusMsg('Unsupported file extension. Expected .ics, .csv, .vtask, or .json.');
      }
    } catch (err) {
      setStatusMsg(`Import error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="tasks-roundtrip-title" className="w-full max-w-2xl glass-dropdown rounded-2xl p-6 border border-indigo-500/30 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h3 id="tasks-roundtrip-title" className="text-sm font-bold text-slate-100">
              Tasks Interoperability, Roundtrip & Enclave Interchange
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Tasks interoperability dialog" className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex space-x-2 border-b border-white/10 pb-2 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('suite')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'suite'
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Interoperability Test Suite (Schicht 2)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'export'
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Export (VTODO, .vtask, CSV, JSON, Print/PDF)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'import'
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Import External Backlog
          </button>
        </div>

        {/* Tab 1: Suite */}
        {activeTab === 'suite' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            <p className="text-slate-300">
              Automated validation testing RFC 5545 VTODO parity, AES-256-GCM encrypted .vtask bundles, CSV formula injection neutralization, RRULE recurrence calculations, and hierarchy DAG integrity.
            </p>

            <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-xl border border-white/10">
              <div>
                <span className="font-semibold text-slate-200">Astraea Tasks Test Harness</span>
                <p className="text-[0.6875rem] text-slate-500 font-mono">6 automated multi-engine test cases</p>
              </div>
              <button
                type="button"
                onClick={handleRunSuite}
                disabled={isRunningSuite}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isRunningSuite ? 'Running Tests...' : 'Run Test Suite'}</span>
              </button>
            </div>

            {suiteReport && (
              <div className="space-y-2">
                <div className="p-3 bg-slate-900 rounded-xl border border-white/10 flex items-center justify-between font-mono text-[0.6875rem]">
                  <span>Fidelity Score: <strong className="text-emerald-400">{suiteReport.overallFidelityScore}%</strong></span>
                  <span>Passed: <strong className="text-emerald-300">{suiteReport.passedTests}/{suiteReport.totalTests}</strong></span>
                  <span>Duration: <strong className="text-slate-300">{suiteReport.durationMs} ms</strong></span>
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
                          <span className="font-semibold text-slate-200">{tc.name}</span>
                        </div>
                        <span className="text-[0.625rem] font-mono text-slate-500">{tc.durationMs} ms</span>
                      </div>
                      <p className="text-[0.6875rem] text-slate-400 pl-6">{tc.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Export */}
        {activeTab === 'export' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            <p className="text-slate-300">
              Export {tasks.length} sovereign tasks into standard formats or encrypted sovereign enclave bundles.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportIcs}
                className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-left space-y-1 transition-colors"
              >
                <div className="flex items-center space-x-2 text-blue-300 font-bold">
                  <Calendar className="w-4 h-4" />
                  <span>iCalendar VTODO (.ics)</span>
                </div>
                <p className="text-[0.6875rem] text-slate-400">RFC 5545 VTODO for compatible calendar/task clients. Astraea reports metadata that cannot be represented losslessly.</p>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-left space-y-1 transition-colors"
              >
                <div className="flex items-center space-x-2 text-emerald-300 font-bold">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>RFC 4180 CSV</span>
                </div>
                <p className="text-[0.6875rem] text-slate-400">Hardened table format with automatic formula injection neutralization.</p>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-left space-y-1 transition-colors"
              >
                <div className="flex items-center space-x-2 text-purple-300 font-bold">
                  <Download className="w-4 h-4" />
                  <span>Canonical JSON</span>
                </div>
                <p className="text-[0.6875rem] text-slate-400">Standard task interchange format for automated pipelines.</p>
              </button>

              <button
                type="button"
                onClick={handlePrintPdf}
                className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-left space-y-1 transition-colors"
              >
                <div className="flex items-center space-x-2 text-sky-300 font-bold">
                  <Printer className="w-4 h-4" />
                  <span>Export PDF</span>
                </div>
                <p className="text-[0.6875rem] text-slate-400">Deterministic PDF generated by the shared Astraea PDF creation service.</p>
              </button>

              <button
                type="button"
                onClick={handleSystemPrint}
                className="p-3 rounded-xl border border-slate-500/30 bg-slate-500/10 hover:bg-slate-500/20 text-left space-y-1 transition-colors"
              >
                <div className="flex items-center space-x-2 text-slate-300 font-bold">
                  <Printer className="w-4 h-4" />
                  <span>System Print</span>
                </div>
                <p className="text-[0.6875rem] text-slate-400">Local browser print sheet for physical printers or operating-system PDF drivers.</p>
              </button>

              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
                <div className="flex items-center space-x-2 text-amber-300 font-bold">
                  <Lock className="w-4 h-4" />
                  <span>Encrypted .vtask</span>
                </div>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Passphrase..."
                  className="w-full px-2 py-1 rounded bg-slate-950 border border-white/10 text-[0.6875rem] text-slate-200 outline-none"
                />
                <button
                  type="button"
                  onClick={handleExportEncryptedBundle}
                  className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs"
                >
                  Export Encrypted
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Import */}
        {activeTab === 'import' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            <p className="text-slate-300">
              Import tasks from iCalendar (`.ics`), spreadsheets (`.csv`), encrypted envelopes (`.vtask`), or JSON exports.
            </p>

            <div className="space-y-2">
              <label className="text-slate-400 font-bold block">Optional .vtask Decryption Passphrase</label>
              <input
                type="password"
                value={importPassphrase}
                onChange={(e) => setImportPassphrase(e.target.value)}
                placeholder="Passphrase if file is an encrypted .vtask..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <label className="block p-6 rounded-2xl border-2 border-dashed border-white/15 hover:border-indigo-500/50 text-center cursor-pointer transition-colors bg-white/[0.02]">
              <Upload className="w-8 h-8 mx-auto mb-2 text-indigo-400" />
              <span className="font-semibold text-slate-200 block">Select .ics, .csv, .vtask or .json file</span>
              <span className="text-[0.6875rem] text-slate-500 block mt-1">Air-gapped local-first import. Data never leaves your device.</span>
              <input
                type="file"
                accept=".ics,.csv,.json,.vtask"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Status Message */}
        {statusMsg && (
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs text-indigo-200 font-mono shrink-0">
            {statusMsg}
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-2 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-200 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
