// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Grid's browser fallback is explicitly a download, never a "save".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadGridCsv } from '../../interchange/gridCsvDownload';
import { downloadGridPdf } from '../../interchange/gridPdfExport';
import { downloadGridPortableExport } from '../../interchange/gridPortableExport';
import { downloadGridWorkbookExport } from '../../interchange/gridWorkbookExport';
import {
  gridExportAbortedText,
  gridExportDeliveryText,
  gridExportFailureText,
} from '../../interchange/gridExportStatus';

let anchorClicks = 0;

beforeEach(() => {
  anchorClicks = 0;
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { anchorClicks += 1; });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Grid export delivery — browser fallback', () => {
  it('delivers CSV as a download and says so', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:grid-csv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const result = await downloadGridCsv('a,b', 'Umsatz.csv');

    expect(result).toEqual({ fileName: 'Umsatz.csv', mode: 'download' });
    expect(anchorClicks).toBe(1);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('text/csv;charset=utf-8');
    expect(gridExportDeliveryText(result)).toBe('Download gestartet: Umsatz.csv (Browser-Modus – keine Schreibbestätigung).');
  });

  it('keeps the portable/workbook/pdf MIME types in the browser fallback', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:grid');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await downloadGridPortableExport('[]', 'json', 'Umsatz.json');
    await downloadGridWorkbookExport(new Uint8Array([1]), 'Grid.xlsx', 'xlsx');
    await downloadGridPdf(new TextEncoder().encode('%PDF-1.4\n%%EOF'), 'Umsatz.pdf');

    const types = createObjectURL.mock.calls.map((call) => (call[0] as Blob).type);
    expect(types).toEqual([
      'application/json;charset=utf-8',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
    ]);
    expect(anchorClicks).toBe(3);
  });

  it('appends a missing extension instead of downloading a type-less file', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:grid');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const result = await downloadGridCsv('a', 'Umsatz');
    expect(result.fileName).toBe('Umsatz.csv');
  });

  it('words a confirmed save and an abort differently from a download', () => {
    expect(gridExportDeliveryText({ fileName: 'Umsatz.csv', mode: 'file' })).toBe('Umsatz.csv gespeichert.');
    expect(gridExportFailureText(new Error('Der Speicherdialog lieferte kein Ziel (abgebrochen oder nicht verfügbar) — es wurde keine Datei geschrieben.')))
      .toBe(gridExportAbortedText());
    expect(gridExportFailureText(new Error('Die Datei konnte nicht geschrieben werden: Disk full')))
      .toBe('Export fehlgeschlagen: Die Datei konnte nicht geschrieben werden: Disk full');
  });
});
