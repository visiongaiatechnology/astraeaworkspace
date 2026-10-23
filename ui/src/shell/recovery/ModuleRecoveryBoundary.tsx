// STATUS: DIAMANT VGT SUPREME — module-local crash containment and explicit recovery surface.
import React from 'react';
import { AlertTriangle, Download, FileWarning, RotateCcw } from 'lucide-react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import {
  moduleRecoveryPayload,
  moduleRecoveryStateFromError,
  isModuleRecoveryExportRedacted,
  moduleRecoveryDiagnosticFromError,
  recordModuleRecoveryDiagnostic,
  serializeModuleRecoveryDiagnostics,
} from './moduleRecoveryCore';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';
import { moduleRecoveryCopy } from '../i18n/moduleRecoveryLocale';
import { deliverExportText, type ExportDeliveryResult } from '../../shared/interchange/exportDelivery';

interface Props {
  document: WorkspaceDocument | null;
  locale?: WorkspaceLocale;
  children: React.ReactNode;
}
interface State {
  error: Error | null;
  incidentId: string | null;
  /** Which payload is currently shown/copied below the actions. */
  panel: 'none' | 'diagnostics' | 'state';
  panelText: string;
  copyStatus: 'idle' | 'copied' | 'failed';
}

/**
 * Fallback used when neither the clipboard API nor a download works (native WebView2 without a
 * download handler / without clipboard permission): the payload is shown in a read-only textarea
 * the user can select manually and copy with Ctrl+C.
 *
 * Release Beta 0.1: the payload is delivered through the native save path first (desktop) and the
 * browser fallback remains a download. Both the success and the failure path keep the textarea
 * fallback below, so a missing write dialog never hides the payload.
 */
function deliverRecoveryPayload(fileName: string, payload: string, mime: string): Promise<ExportDeliveryResult> {
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(fileName) ? fileName.split('.').pop()!.toLowerCase() : 'bin';
  return deliverExportText(payload, { suggestedName: fileName, extensions: [extension], mimeType: mime });
}

export class ModuleRecoveryBoundary extends React.Component<Props, State> {
  state: State = { error: null, incidentId: null, panel: 'none', panelText: '', copyStatus: 'idle' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return moduleRecoveryStateFromError(error);
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    /**
     * GR-001 — the crash must be diagnosable **after** it happened.
     *
     * This used to log `error.name` only: no message, no stack, no component path, so the
     * native "Modul wurde sicher angehalten" screen was a dead end. The record is bounded,
     * local and receives nothing but the exception and React's component stack — the document
     * is not an input, so no sheet content can leak into it.
     */
    const diagnostic = moduleRecoveryDiagnosticFromError(error, info?.componentStack);
    recordModuleRecoveryDiagnostic(diagnostic);
    // One stable console line: the WebView2 console / native log keeps the throw site.
    console.error('ASTRAEA_MODULE_BOUNDARY', diagnostic.name, diagnostic.stack[0] ?? '');
    this.setState({ incidentId: diagnostic.incidentId });
  }

  componentDidUpdate(previous: Props): void {
    if (previous.document?.id !== this.props.document?.id && this.state.error) {
      this.setState({ error: null, incidentId: null, panel: 'none', panelText: '', copyStatus: 'idle' });
    }
  }

  /**
   * GR-001 (native) — the diagnostic must be readable even when every export channel fails.
   *
   * Measured natively (2026-10-18): "Diagnoseprotokoll exportieren" and "Zustand exportieren"
   * produced no file in the WebView2 app, so the user had no way to hand the crash over. The
   * panel below always exists: it shows the recorded error with message, stack and React
   * component stack as selectable text; the export buttons stay as convenience/backup.
   */
  private showPanel = (panel: State['panel']): void => {
    const text = panel === 'state'
      ? this.props.document ? moduleRecoveryPayload(this.props.document) : ''
      : serializeModuleRecoveryDiagnostics();
    this.setState({ panel, panelText: text, copyStatus: 'idle' });
  };

  private copyPanel = async (): Promise<void> => {
    const text = this.state.panelText;
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.setState({ copyStatus: 'copied' });
        return;
      }
      throw new Error('clipboard-unavailable');
    } catch {
      this.setState({ copyStatus: 'failed' });
    }
  };

  private exportState = async (): Promise<void> => {
    const document = this.props.document;
    if (!document) return;
    const payload = moduleRecoveryPayload(document);
    try {
      await deliverRecoveryPayload(
        `${document.title.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'astraea-recovery'}.recovery.json`,
        payload,
        'application/json',
      );
    } catch {
      /* Der Payload steht unten weiterhin im Textfeld — kein stiller Verlust. */
    }
    this.showPanel('state');
  };

  private exportDiagnostics = async (): Promise<void> => {
    /**
     * GR-001 — the trace, not the document.
     *
     * `serializeModuleRecoveryDiagnostics` only knows the recorded exceptions and their React
     * component paths; there is no document reference on this path, which is what keeps the
     * export free of sheet content even for a protected workbook.
     */
    try {
      await deliverRecoveryPayload(
        `astraea-module-diagnostics-${this.state.incidentId ?? 'unknown'}.json`,
        serializeModuleRecoveryDiagnostics(),
        'application/json',
      );
    } catch {
      /* Der Payload steht unten weiterhin im Textfeld — kein stiller Verlust. */
    }
    this.showPanel('diagnostics');
  };

  private restart = (): void => this.setState({ error: null, incidentId: null, panel: 'none', panelText: '', copyStatus: 'idle' });

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    const copy = moduleRecoveryCopy(this.props.locale ?? 'en-US');
    // WR-044: say out loud that a protected document exports metadata only.
    const redacted = this.props.document ? isModuleRecoveryExportRedacted(this.props.document) : false;
    return (
      <section role="alert" aria-live="assertive" data-module-recovery="active" className="h-full w-full overflow-auto bg-[#07050d] p-8 text-slate-100">
        <div className="mx-auto max-w-3xl border-l-2 border-amber-400/70 pl-6">
          <div className="flex items-center gap-2 text-amber-300"><AlertTriangle className="h-5 w-5"/><span className="text-sm font-semibold">{copy.stopped}</span></div>
          <h1 className="mt-3 text-xl font-semibold">{copy.workspaceContinues}</h1>
          <p className="mt-2 max-w-prose text-sm leading-6 text-slate-300">{copy.explanation}</p>
          <p className="mt-3 font-mono text-[11px] text-slate-500">{copy.incident}: {this.state.incidentId}</p>
          {redacted && (
            <p role="note" data-module-recovery-redacted="true" className="mt-3 max-w-prose rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
              {copy.exportRedacted}
            </p>
          )}
          {/**
           * Kein Exception-Text im Standard-Render (Datenschutz-Vertrag der Surface). Die Details
           * erscheinen **auf Klick** im Panel unten: der Export-Knopf öffnet es immer, auch wenn
           * der WebView2-Download nichts schreibt — dann ist der Text dort markierbar/kopierbar.
           */}
          <p className="mt-2 max-w-prose text-xs leading-5 text-slate-500" data-module-recovery-hint="true">
            {this.props.locale === 'de-DE' ? 'Kein Download? Das Protokoll erscheint unten und ist kopierbar.' : (copy.exportHint ?? 'No download? The log is shown below and can be copied.')}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={this.exportState} disabled={!this.props.document} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4"/>{copy.exportState}</button>
            <button type="button" onClick={this.exportDiagnostics} data-module-recovery-diagnostics="true" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10"><FileWarning className="h-4 w-4"/>{copy.exportDiagnostics}</button>
            <button type="button" onClick={this.restart} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500"><RotateCcw className="h-4 w-4"/>{copy.restartModule}</button>
          </div>
          {this.state.panel !== 'none' && (
            <div className="mt-4" data-module-recovery-panel={this.state.panel}>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>
                  {this.state.panel === 'diagnostics'
                    ? 'Diagnoseprotokoll (nur Trace, kein Dokumentinhalt)'
                    : 'Dokumentzustand (JSON)'}
                </span>
                <button type="button" onClick={() => void this.copyPanel()} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold hover:bg-white/10" data-module-recovery-copy="true">
                  {this.state.copyStatus === 'copied' ? 'Kopiert ✓' : this.state.copyStatus === 'failed' ? 'Kopieren nicht möglich — bitte Text markieren' : 'In Zwischenablage kopieren'}
                </button>
              </div>
              <textarea
                readOnly
                value={this.state.panelText}
                data-module-recovery-text="true"
                onFocus={(event) => event.currentTarget.select()}
                className="mt-1 h-64 w-full resize-y rounded-lg border border-white/10 bg-black/60 p-2 font-mono text-[10px] leading-4 text-slate-300"
              />
            </div>
          )}
        </div>
      </section>
    );
  }
}
