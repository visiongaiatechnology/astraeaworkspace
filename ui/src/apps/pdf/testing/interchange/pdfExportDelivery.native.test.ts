// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: PDF exports are written natively; split parts stop on abort.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { downloadStructuredPdf } from '../../interchange/structuredPdfExport';
import { downloadPdfSplitArtifacts } from '../../interchange/split/pdfSplit';
import { pdfExportDeliveryText, pdfExportFailureText, pdfExportPartialText } from '../../interchange/pdfExportStatus';

const TOKEN = '11111111-2222-4333-8444-555555555555';

interface InvokeCall { command: string; args?: Record<string, unknown> }
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function desktop(invoke: Invoke): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

function createRecorder(options: { failWrite?: boolean; failSaveOnCall?: number } = {}) {
  const calls: InvokeCall[] = [];
  let saveCalls = 0;
  const invoke: Invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === 'vgt_shell_save_dialog') {
      saveCalls += 1;
      if (options.failSaveOnCall && saveCalls === options.failSaveOnCall) {
        throw new Error('Native desktop service rejected the request');
      }
      const request = args?.request as { suggestedName?: string } | undefined;
      return { token: TOKEN, file_name: request?.suggestedName ?? 'export.pdf' };
    }
    if (options.failWrite) throw new Error('Sandbox refused the bytes');
    return { contract: 'VGT-IMPORT-SANDBOX-3' };
  };
  return { invoke, calls };
}

function saveRequests(calls: InvokeCall[]): { suggestedName?: string; extensions?: string[] }[] {
  return calls
    .filter((call) => call.command === 'vgt_shell_save_dialog')
    .map((call) => (call.args?.request ?? {}) as { suggestedName?: string; extensions?: string[] });
}

const splitArtifacts = () => [
  { fileName: 'Bericht-part-1.pdf', title: 'Bericht', sourcePages: [1], model: DEFAULT_PDF_MODEL, bytes: new TextEncoder().encode('%PDF-1.4\npart1') },
  { fileName: 'Bericht-part-2.pdf', title: 'Bericht', sourcePages: [2], model: DEFAULT_PDF_MODEL, bytes: new TextEncoder().encode('%PDF-1.4\npart2') },
];

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.restoreAllMocks();
});

describe('PDF export delivery — native desktop', () => {
  it('writes the structured PDF with its real name and extension', async () => {
    const recorder = createRecorder();
    desktop(recorder.invoke);

    const result = await downloadStructuredPdf('Quartalsbericht', DEFAULT_PDF_MODEL);

    expect(result).toEqual({ fileName: 'Quartalsbericht_edited.pdf', mode: 'file' });
    const [save] = saveRequests(recorder.calls);
    expect(save.suggestedName).toBe('Quartalsbericht_edited.pdf');
    expect(save.extensions).toEqual(['pdf']);
    expect(recorder.calls.map((call) => call.command)).toEqual([
      'vgt_shell_save_dialog',
      'vgt_import_sandbox_atomic_export',
    ]);
    expect(anchorClicks).toBe(0);
  });

  it('does not report success when the atomic write fails', async () => {
    const recorder = createRecorder({ failWrite: true });
    desktop(recorder.invoke);
    await expect(downloadStructuredPdf('Quartalsbericht', DEFAULT_PDF_MODEL))
      .rejects.toThrow(/konnte nicht geschrieben werden/);
    expect(anchorClicks).toBe(0);
  });

  it('writes each split part through its own dialog', async () => {
    const recorder = createRecorder();
    desktop(recorder.invoke);

    const result = await downloadPdfSplitArtifacts(splitArtifacts());

    expect(result).toEqual({ written: 2, total: 2, mode: 'file', cancelled: false, fileName: 'Bericht-part-2.pdf' });
    const saves = saveRequests(recorder.calls);
    expect(saves.map((save) => save.suggestedName)).toEqual(['Bericht-part-1.pdf', 'Bericht-part-2.pdf']);
    expect(saves.every((save) => save.extensions?.join(',') === 'pdf')).toBe(true);
    expect(recorder.calls.filter((call) => call.command === 'vgt_import_sandbox_atomic_export')).toHaveLength(2);
  });

  it('stops further split dialogs when the user aborts one and reports the partial count', async () => {
    const recorder = createRecorder({ failSaveOnCall: 2 });
    desktop(recorder.invoke);

    const result = await downloadPdfSplitArtifacts(splitArtifacts());

    expect(result).toEqual({ written: 1, total: 2, mode: 'file', cancelled: true, fileName: 'Bericht-part-1.pdf' });
    // Only the first part was saved; the second dialog was cancelled, so it was the last dialog opened.
    expect(saveRequests(recorder.calls)).toHaveLength(2);
    expect(pdfExportPartialText('de-DE', result.written, result.total)).toContain('1 von 2');
  });
});

describe('PDF export delivery — wording', () => {
  it('never calls a browser download a save', () => {
    expect(pdfExportDeliveryText('de-DE', { fileName: 'Bericht.pdf', mode: 'file' })).toBe('Bericht.pdf wurde gespeichert.');
    expect(pdfExportDeliveryText('de-DE', { fileName: 'Bericht.pdf', mode: 'download' })).toContain('Download gestartet');
    expect(pdfExportFailureText('de-DE', new Error('Der Speicherdialog lieferte kein Ziel (abgebrochen oder nicht verfügbar) — es wurde keine Datei geschrieben.')))
      .toContain('keine Datei geschrieben');
  });
});
