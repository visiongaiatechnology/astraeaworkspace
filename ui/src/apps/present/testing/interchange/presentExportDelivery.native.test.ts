// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Present exports are written natively; success only after the write.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import { downloadPresentSlideSvg } from '../../interchange/render/presentExport';
import { downloadCaptionSidecar } from '../../interchange/video/presentVideoExport';
import { presentExportDeliveryText } from '../../interchange/presentExportStatus';

const TOKEN = '11111111-2222-4333-8444-555555555555';

const SLIDE: PresentSlide = {
  id: 'slide-1',
  title: 'Quartal',
  subtitle: 'Bericht',
  layout: 'blank',
  speakerNotes: '',
} as PresentSlide;

const MODEL: PresentDocumentModel = {
  slides: [SLIDE],
  theme: 'dark',
  aspectRatio: '16:9',
} as PresentDocumentModel;

interface InvokeCall { command: string; args?: Record<string, unknown> }

function desktop(): InvokeCall[] {
  const calls: InvokeCall[] = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    core: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command === 'vgt_shell_save_dialog') {
          const request = args?.request as { suggestedName?: string } | undefined;
          return { token: TOKEN, file_name: request?.suggestedName ?? 'export.svg' };
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

describe('Present export delivery — native desktop', () => {
  it('writes a slide SVG through the save dialog with its real extension', async () => {
    const calls = desktop();
    const result = await downloadPresentSlideSvg('Quartalsbericht', SLIDE, MODEL, 'de-DE');

    expect(result.mode).toBe('file');
    expect(result.fileName).toMatch(/\.svg$/u);
    expect(calls.map((call) => call.command)).toEqual(['vgt_shell_save_dialog', 'vgt_import_sandbox_atomic_export']);
    const save = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(save.suggestedName).toMatch(/\.svg$/u);
    expect(save.extensions).toEqual(['svg']);
    expect(anchorClicks).toBe(0);
  });

  it('writes the WebVTT sidecar as a text file', async () => {
    const calls = desktop();
    const result = await downloadCaptionSidecar({ webVttCaptions: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHallo' } as never, 'deck.vtt');
    expect(result.mode).toBe('file');
    expect(result.fileName).toBe('deck.vtt');
    const save = calls[0]!.args!.request as { suggestedName?: string; extensions?: string[] };
    expect(save.extensions).toEqual(['vtt']);
  });

  it('does not report success when the atomic write fails', async () => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: {
        invoke: async (command: string) => {
          if (command === 'vgt_shell_save_dialog') return { token: TOKEN, file_name: 'Quartal.svg' };
          throw new Error('Sandbox refused the bytes');
        },
      },
    };
    await expect(downloadPresentSlideSvg('Quartalsbericht', SLIDE, MODEL, 'de-DE')).rejects.toThrow(/konnte nicht geschrieben werden/u);
    expect(anchorClicks).toBe(0);
  });

  it('words saved and downloaded differently in both supported languages', () => {
    expect(presentExportDeliveryText('de-DE', { fileName: 'x.svg', mode: 'file' })).toBe('x.svg gespeichert.');
    expect(presentExportDeliveryText('de-DE', { fileName: 'x.svg', mode: 'download' })).toContain('Download gestartet');
    expect(presentExportDeliveryText('en-US', { fileName: 'x.svg', mode: 'file' })).toBe('x.svg saved.');
  });
});
