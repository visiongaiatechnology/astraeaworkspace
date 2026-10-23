// @vitest-environment happy-dom
// STATUS: GOLD — Release Beta 0.1: Grid exports are written natively and reported only after the write.
//
// The release blocker is "export reports success but produces no usable file". These tests drive the
// real Grid export adapters against the native contract: the save dialog receives the name *with its
// extension* and the type whitelist, the atomic sandbox export receives the granted name/token/bytes,
// and a confirmed file delivery never falls back to a download link.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartObject, GridCell, GridStructuredTable } from '../../../../shared/contracts/workspace';
import { downloadGridCsv } from '../../interchange/gridCsvDownload';
import { downloadGridPdf } from '../../interchange/gridPdfExport';
import { downloadGridPortableExport } from '../../interchange/gridPortableExport';
import { downloadGridWorkbookExport } from '../../interchange/gridWorkbookExport';
import { deliverGridTableExport } from '../../interchange/gridTableExport';
import { downloadGridChartSvg } from '../../integrations/gridChartExport';
import { buildGridChartFromRange } from '../../charts/gridChartEngine';

const TOKEN = '11111111-2222-4333-8444-555555555555';

interface InvokeCall { command: string; args?: Record<string, unknown> }
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function desktop(invoke: Invoke): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

function createNativeRecorder(): { invoke: Invoke; calls: InvokeCall[] } {
  const calls: InvokeCall[] = [];
  const invoke: Invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === 'vgt_shell_save_dialog') {
      const request = args?.request as { suggestedName?: string } | undefined;
      return { token: TOKEN, file_name: request?.suggestedName ?? 'export.bin' };
    }
    return { contract: 'VGT-IMPORT-SANDBOX-3' };
  };
  return { invoke, calls };
}

function saveRequest(calls: InvokeCall[]): { suggestedName?: string; extensions?: string[] } {
  return (calls[0]?.args?.request ?? {}) as { suggestedName?: string; extensions?: string[] };
}

function writeRequest(calls: InvokeCall[]): { fileName: string; saveToken: string; bytesBase64: string } {
  return (calls[1]?.args?.request ?? {}) as { fileName: string; saveToken: string; bytesBase64: string };
}

function hexBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const TABLE: GridStructuredTable = {
  id: 'sales', name: 'Sales', sheetId: 'sheet-1', range: 'A1:B2', hasHeaders: true, hasTotalsRow: false,
  columns: [{ name: 'Product', totalFunction: 'none' }, { name: 'Price', totalFunction: 'sum' }],
};

const TABLE_CELLS: Record<string, GridCell> = {
  A1: { value: 'Product' }, B1: { value: 'Price' },
  A2: { value: 'Widget' }, B2: { value: 10 },
};

function chartFixture(): ChartObject {
  return buildGridChartFromRange({
    A1: { value: 'Monat' }, B1: { value: 'Umsatz' },
    A2: { value: 'Jan' }, B2: { value: 1200 },
    A3: { value: 'Feb' }, B3: { value: 1500 },
  }, 'A1:B3', 'column', {
    sheetId: 's1', documentId: 'doc-1', tableObjectId: 'table-1', live: true, title: 'Umsatz je Monat',
  });
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

describe('Grid export delivery — native desktop', () => {
  it('writes the CSV through the save dialog and reports the granted name as a file', async () => {
    const recorder = createNativeRecorder();
    desktop(recorder.invoke);

    const result = await downloadGridCsv('a,b\n1,2', 'Umsatz.csv');

    expect(result).toEqual({ fileName: 'Umsatz.csv', mode: 'file' });
    const save = saveRequest(recorder.calls);
    expect(save.suggestedName).toBe('Umsatz.csv');
    expect(save.extensions).toEqual(['csv']);
    expect(writeRequest(recorder.calls).fileName).toBe('Umsatz.csv');
    expect(writeRequest(recorder.calls).saveToken).toBe(TOKEN);
    expect(writeRequest(recorder.calls).bytesBase64).toBe(btoa('a,b\n1,2'));
    expect(anchorClicks).toBe(0);
  });

  it('writes the PDF only after the PDF signature preflight', async () => {
    const recorder = createNativeRecorder();
    desktop(recorder.invoke);
    const pdf = new TextEncoder().encode('%PDF-1.4\n%%EOF');

    const result = await downloadGridPdf(pdf, 'Umsatz.pdf');
    expect(result.mode).toBe('file');
    expect(saveRequest(recorder.calls).suggestedName).toBe('Umsatz.pdf');
    expect(saveRequest(recorder.calls).extensions).toEqual(['pdf']);

    const invalidRecorder = createNativeRecorder();
    desktop(invalidRecorder.invoke);
    await expect(downloadGridPdf(new TextEncoder().encode('not a pdf'), 'Kaputt.pdf'))
      .rejects.toThrow(/document_pdf_signature_missing/u);
    expect(invalidRecorder.calls).toHaveLength(0);
  });

  it('writes portable and workbook exports with their real extensions', async () => {
    const recorder = createNativeRecorder();
    desktop(recorder.invoke);

    await downloadGridPortableExport('{"rows":[[1]]}', 'json', 'Umsatz.json');
    expect(saveRequest(recorder.calls).extensions).toEqual(['json']);
    expect(saveRequest(recorder.calls).suggestedName).toBe('Umsatz.json');

    recorder.calls.length = 0;
    await downloadGridWorkbookExport(new Uint8Array([1, 2, 3]), 'Grid.xlsx', 'xlsx');
    expect(saveRequest(recorder.calls).extensions).toEqual(['xlsx']);
    expect(writeRequest(recorder.calls).bytesBase64).toBe(btoa(String.fromCharCode(1, 2, 3)));
  });

  it('writes a structured table export as a real file', async () => {
    const recorder = createNativeRecorder();
    desktop(recorder.invoke);
    const result = await deliverGridTableExport(TABLE, TABLE_CELLS, 'csv');
    expect(result.mode).toBe('file');
    expect(saveRequest(recorder.calls).suggestedName).toBe('Sales.csv');
    expect(saveRequest(recorder.calls).extensions).toEqual(['csv']);
    expect(hexBytes(writeRequest(recorder.calls).bytesBase64).byteLength).toBeGreaterThan(0);
  });

  it('writes a chart SVG export as a real file', async () => {
    const recorder = createNativeRecorder();
    desktop(recorder.invoke);
    const result = await downloadGridChartSvg(chartFixture());
    expect(result.mode).toBe('file');
    expect(saveRequest(recorder.calls).extensions).toEqual(['svg']);
    expect(saveRequest(recorder.calls).suggestedName).toMatch(/\.svg$/u);
    const svg = new TextDecoder().decode(hexBytes(writeRequest(recorder.calls).bytesBase64));
    expect(svg).toContain('<svg');
  });

  it('reports a cancelled save dialog as a failure and never pretends success', async () => {
    desktop(async () => { throw new Error('Native desktop service rejected the request'); });
    await expect(downloadGridCsv('a', 'Abgebrochen.csv')).rejects.toThrow(/keine Datei geschrieben/u);
    expect(anchorClicks).toBe(0);
  });
});
