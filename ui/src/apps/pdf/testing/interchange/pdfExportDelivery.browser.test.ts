// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: PDF's browser fallback is a download, never a claimed save.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { downloadStructuredPdf } from '../../interchange/structuredPdfExport';
import { downloadPdfSplitArtifacts } from '../../interchange/split/pdfSplit';
import { pdfExportDeliveryText } from '../../interchange/pdfExportStatus';

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PDF export delivery — browser fallback', () => {
  it('delivers a structured PDF as a browser download and reports it as such', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const result = await downloadStructuredPdf('Quartalsbericht', DEFAULT_PDF_MODEL);

    expect(result.mode).toBe('download');
    expect(result.fileName).toBe('Quartalsbericht_edited.pdf');
    expect(anchorClicks).toBe(1);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('application/pdf');
    expect(pdfExportDeliveryText('de-DE', result)).toContain('Download gestartet');
    expect(pdfExportDeliveryText('de-DE', result)).not.toContain('gespeichert');
  });

  it('delivers every split part as a download and keeps the total', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-split');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadPdfSplitArtifacts([
      { fileName: 'Bericht-part-1.pdf', title: 'Bericht', sourcePages: [1], model: DEFAULT_PDF_MODEL, bytes: new TextEncoder().encode('%PDF-1.4\n1') },
      { fileName: 'Bericht-part-2.pdf', title: 'Bericht', sourcePages: [2], model: DEFAULT_PDF_MODEL, bytes: new TextEncoder().encode('%PDF-1.4\n2') },
    ]);
    expect(result).toEqual({ written: 2, total: 2, mode: 'download', cancelled: false, fileName: 'Bericht-part-2.pdf' });
    expect(anchorClicks).toBe(2);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });
});
