// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Writer's browser fallback is a download, never a claimed save.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paragraph, WriterPageSetupConfig } from '../../../../../shared/contracts/workspace';
import { downloadWriterPdf } from '../../../interchange/export/pdf/writerPdfExport';
import { downloadWriterPortableBytes } from '../../../interchange/portable/writerPortableInterop';

const PAGE_SETUP: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
};

const PARAGRAPH: Paragraph = {
  id: 'p1',
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 },
  spans: [{ text: 'Alpha Beta', font_size_pt: 11 }],
};

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Writer export delivery — browser fallback', () => {
  it('delivers the PDF as a download and reports the mode', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:writer-pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadWriterPdf('Angebot', [PARAGRAPH], PAGE_SETUP);
    expect(result.mode).toBe('download');
    expect(result.fileName).toMatch(/\.pdf$/u);
    expect(anchorClicks).toBe(1);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('application/pdf');
  });

  it('delivers a portable text export as a download with its real extension', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:writer-markdown');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadWriterPortableBytes({
      fileName: 'Angebot.md',
      mimeType: 'text/markdown;charset=utf-8',
      bytes: new TextEncoder().encode('# Angebot'),
      format: 'markdown',
      lossReport: { hasContentLoss: false } as never,
    });
    expect(result).toEqual({ fileName: 'Angebot.md', mode: 'download' });
    expect(anchorClicks).toBe(1);
  });
});
