// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Writer exports are written natively and only then called saved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paragraph, WriterPageSetupConfig } from '../../../../../shared/contracts/workspace';
import { downloadWriterPdf } from '../../../interchange/export/pdf/writerPdfExport';
import { writerExportDeliveryText } from '../../../interchange/export/writerExportStatus';

const TOKEN = '11111111-2222-4333-8444-555555555555';

const PAGE_SETUP: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
};

function paragraph(text: string): Paragraph {
  return {
    id: `paragraph-${text}`,
    style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 },
    spans: [{ text, font_size_pt: 11 }],
  };
}

interface InvokeCall { command: string; args?: Record<string, unknown> }

function desktop(): InvokeCall[] {
  const calls: InvokeCall[] = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command === 'vgt_shell_save_dialog') {
          const request = args?.request as { suggestedName?: string } | undefined;
          return { token: TOKEN, file_name: request?.suggestedName ?? 'export.pdf' };
        }
        return { contract: 'VGT-IMPORT-SANDBOX-3' };
      },
    },
  };
  return calls;
}

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.restoreAllMocks();
});

describe('Writer export delivery — native desktop', () => {
  it('writes the PDF through the save dialog and reports the granted file', async () => {
    const calls = desktop();
    const result = await downloadWriterPdf('Angebot', [paragraph('Alpha Beta')], PAGE_SETUP);

    expect(result.mode).toBe('file');
    expect(result.fileName).toMatch(/^Angebot.*\.pdf$/u);
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    const save = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(save.suggestedName).toMatch(/\.pdf$/u);
    expect(save.extensions).toEqual(['pdf']);
    expect(anchorClicks).toBe(0);
  });

  it('does not report success when the atomic write fails', async () => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: {
        invoke: async (command: string) => {
          if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Angebot.pdf' };
          throw new Error('Sandbox refused the bytes');
        },
      },
    };
    await expect(downloadWriterPdf('Angebot', [paragraph('Alpha')], PAGE_SETUP)).rejects.toThrow(/konnte nicht geschrieben werden/u);
    expect(anchorClicks).toBe(0);
  });

  it('never calls a browser download a saved file', () => {
    expect(writerExportDeliveryText({ fileName: 'Angebot.pdf', mode: 'file' })).toBe('Angebot.pdf gespeichert.');
    expect(writerExportDeliveryText({ fileName: 'Angebot.pdf', mode: 'download' })).toContain('Download gestartet');
  });
});
