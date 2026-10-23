// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: feindliche Clipboard-/Paste-Payloads.
//
// Wichtiger Ist-Befund vorab: Grid hat **keinen** `text/plain`- oder `text/html`-
// Clipboard-Parser. `GridSheet.tsx:478` verdrahtet `onPaste={pasteSelection}`; das arbeitet
// ausschließlich auf einem strukturierten `GridClipboardPayload`
// (`editing/gridClipboard.ts:92-124`). Rohe Text-/TSV-/HTML-Daten erreichen das Grid über
// den Importpfad `importGridDelimitedText` (`interchange/gridDelimitedImport.ts:373-428`),
// dessen Ergebnis über `captureGridClipboard` → `applyGridClipboardPaste` in Zellen landet.
// Diese Datei testet genau diese realen Funktionen und dokumentiert die Grenze im Kopf.
//
// Befund dieses Laufs (2026-10-18): 5/5 grün, kein Throw in den geprüften Pfaden.
//   Fall 1: 100.000 Zeilen / >4 MB werden nach ~258 ms mit `grid_import_row_limit`
//           abgelehnt (Zeilenobergrenze 50.000; Byte-Obergrenze 16 MB). Kein Hänger.
//   Fall 2: `<script>`, Hyperlink-/DDE-Muster, `'007`, `+1`, `-1`, `@SUM` bleiben im
//           strukturierten Paste als Werte; `formula` wird nicht gesetzt, nichts wird
//           ausgeführt. `parseGridCellInput`: `=`-Muster text, `+1`/`-1` integer,
//           `'007`/`@SUM` text. Formel-Interpretation von `=`-Werten passiert erst im
//           Import-Commit (`useGridCellImportController.ts:87-92`), nicht im Paste.
//   Fall 3: fehlende letzte Spalte, doppelte Tabs, CRLF/LF, quoted Tab/Newline liefern
//           deterministische Zellen; 1.000 Spalten → `grid_import_column_limit`;
//           offenes Anführungszeichen → `grid_import_unclosed_quote`.
//   Fall 4: NUL/Steuerzeichen bleiben String-Zellwerte; kein Throw.
//   Fall 5: strukturiertes Paste von `=SUM(B2:B3)` bleibt String; `evaluateGridFormulaLocal`
//           liefert für leere Referenzen 0, für Zirkularität `#CIRCULAR!` statt Throw.
//
// Grenzen/Befunde mit Datei:Zeile:
//   - Kein text/plain-/text/html-Clipboard-Parser im Grid: `GridSheet.tsx:478` bindet
//     `onPaste={pasteSelection}`; `gridClipboard.ts:92-124` akzeptiert nur strukturierte
//     Payloads. Rohtext erreicht Zellen über `importGridDelimitedText`
//     (`gridDelimitedImport.ts:373-428`).
//   - Import-Obergrenzen: 16 MB (`gridXlsxOdsRoundtrip.ts:10`), 50.000 Zeilen (`:15`),
//     256 Spalten (`:18`), 128.000 Zeichen je Zelle (`:31`), 1.000.000 Tabellenzellen (`:30`).
//   - Risiko: Ein CSV/TSV mit `=HYPERLINK(...)`/DDE-Text wird beim Import-Commit als Formel
//     übernommen (`useGridCellImportController.ts:87-92`); das ist bewusste Formel-Semantik,
//     aber eine CSV-Injection-Fläche beim Re-Export. Der strukturierte Paste selbst bleibt
//     inert. NUL/Steuerzeichen werden unverändert als String übernommen (keine Sanitisierung).
import { describe, expect, it, vi } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import {
  applyGridClipboardPaste,
  captureGridClipboard,
  type GridClipboardPayload,
} from '../../editing/gridClipboard';
import { parseGridCellInput } from '../../editing/gridCellTypes';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';
import { parseA1, toA1 } from '../../formulas/formula';
import {
  importGridDelimitedText,
  type GridDelimitedImportOptions,
  type GridDelimitedImportResult,
} from '../../interchange/gridDelimitedImport';

vi.setConfig({ testTimeout: 60_000 });

function importedCells(imported: GridDelimitedImportResult): Record<string, GridCell> {
  const cells: Record<string, GridCell> = {};
  for (const [coord, value] of Object.entries(imported.cells)) cells[coord] = { value };
  return cells;
}

function rangeOf(cells: Record<string, GridCell>): string {
  const coords = Object.keys(cells);
  if (coords.length === 0) return 'A1';
  let maxCol = 0;
  let maxRow = 0;
  for (const coord of coords) {
    const parsed = parseA1(coord);
    if (parsed) {
      maxCol = Math.max(maxCol, parsed.col);
      maxRow = Math.max(maxRow, parsed.row);
    }
  }
  return `A1:${toA1(maxCol, maxRow)}`;
}

/** Rohtext → Zellen (Importpfad) → strukturierter Clipboard-Payload (capture). */
function payloadFromText(text: string, options: GridDelimitedImportOptions = {}): GridClipboardPayload {
  const imported = importGridDelimitedText(text, { firstRowIsHeader: false, ...options });
  const cells = importedCells(imported);
  return captureGridClipboard(cells, rangeOf(cells), false);
}

function pastePayload(payload: GridClipboardPayload, targetAnchor = 'A1'): Record<string, GridCell> {
  return applyGridClipboardPaste({
    cells: {},
    payload,
    targetAnchor,
    mode: 'all',
  }).cells;
}

function valueAt(cells: Record<string, GridCell>, coord: string): string | number | boolean | undefined {
  return cells[coord]?.value;
}

function catchError(run: () => void): { error: unknown; elapsedMs: number } {
  const started = Date.now();
  let error: unknown = null;
  try {
    run();
  } catch (reason) {
    error = reason;
  }
  return { error, elapsedMs: Date.now() - started };
}

describe('feindliche Clipboard-/Paste-Payloads', () => {
  it('Fall 1: 5-MB-/100k-Zeilen-Payload wird über die dokumentierte Zeilengrenze abgelehnt (kein Hänger)', () => {
    const rows = Array.from({ length: 100_000 }, (_, index) => `row-${index}\t${'x'.repeat(40)}`);
    const text = rows.join('\n');
    expect(text.length, 'die Payload ist wirklich groß').toBeGreaterThan(4_000_000);

    const { error, elapsedMs } = catchError(() => {
      importGridDelimitedText(text, { firstRowIsHeader: false });
    });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('grid_import_row_limit');
    expect(elapsedMs, 'die Ablehnung muss in endlicher Zeit erfolgen').toBeLessThan(5_000);
  });

  it('Fall 2: HTML/TSV-/Formel-Injection-Muster bleiben Zellstrings bzw. werden typisiert, aber nicht ausgeführt', () => {
    const values = [
      '<script>alert(1)</script>',
      '=HYPERLINK("http://x","y")',
      "=cmd|' /C calc'!A0",
      "'007",
      '+1',
      '-1',
      '@SUM(A1)',
    ];
    const payload = payloadFromText(values.join('\t'));
    const pasted = pastePayload(payload);

    expect(Object.values(pasted).map((cell) => cell.value)).toEqual(values);
    expect(Object.values(pasted).every((cell) => cell.formula === undefined), 'strukturiertes Paste interpretiert keine Formel').toBe(true);
    expect(valueAt(pasted, 'A1')).toBe('<script>alert(1)</script>');
    expect(valueAt(pasted, 'B1')).toBe('=HYPERLINK("http://x","y")');
    expect(valueAt(pasted, 'C1')).toBe("=cmd|' /C calc'!A0");

    // Typisierungs-Ist je Präfix (parseGridCellInput ist der Commit-Typisierer für Werte):
    expect(parseGridCellInput('<script>alert(1)</script>').dataType).toBe('text');
    expect(parseGridCellInput('=HYPERLINK("http://x","y")').dataType).toBe('text');
    expect(parseGridCellInput("=cmd|' /C calc'!A0").dataType).toBe('text');
    expect(parseGridCellInput("'007")).toEqual({ value: "'007", dataType: 'text' });
    expect(parseGridCellInput('+1'), 'führendes + wird als Zahlenwert typisiert, nicht als Formel').toMatchObject({ value: 1, dataType: 'integer' });
    expect(parseGridCellInput('-1'), 'führendes - wird als Zahlenwert typisiert, nicht als Formel').toMatchObject({ value: -1, dataType: 'integer' });
    expect(parseGridCellInput('@SUM(A1)').dataType).toBe('text');
  });

  it('Fall 3: unbalancierte/verschachtelte Tabellen deterministisch oder explizit abgelehnt', () => {
    // Fehlende letzte Spalte: letzte Zeile hat nur eine Zelle.
    const sparse = importGridDelimitedText('a\tb\nc', { firstRowIsHeader: false });
    expect(sparse.cells).toEqual({ A1: 'a', B1: 'b', A2: 'c' });

    // Doppelte Tabs: leere Felder werden übersprungen, Positionen bleiben stabil.
    const doubleTabs = importGridDelimitedText('a\t\tb\nc\t\td', { firstRowIsHeader: false });
    expect(doubleTabs.cells).toEqual({ A1: 'a', C1: 'b', A2: 'c', C2: 'd' });

    // CRLF und LF müssen dasselbe Ergebnis liefern.
    const lf = importGridDelimitedText('a\tb\nc\td', { firstRowIsHeader: false });
    const crlf = importGridDelimitedText('a\tb\r\nc\td', { firstRowIsHeader: false });
    expect(crlf.cells).toEqual(lf.cells);

    // Verschachtelte Anführungszeichen mit Tab/Zeilenumbruch bleiben ein Feld.
    const quoted = importGridDelimitedText('"a\tb"\tc\n"d\ne"\tf', { firstRowIsHeader: false });
    expect(quoted.cells).toEqual({ A1: 'a\tb', B1: 'c', A2: 'd\ne', B2: 'f' });

    // 1000 Spalten in einer Zeile: die dokumentierte Spaltengrenze greift.
    const wide = Array.from({ length: 1_000 }, (_, index) => `c${index}`).join('\t');
    const wideResult = catchError(() => {
      importGridDelimitedText(wide, { firstRowIsHeader: false });
    });
    expect(wideResult.error).toBeInstanceOf(Error);
    expect((wideResult.error as Error).message).toBe('grid_import_column_limit');

    // Unclosed Quote: explizite Ablehnung statt stiller Trunkierung.
    const unclosed = catchError(() => {
      importGridDelimitedText('"offen\tzu', { firstRowIsHeader: false });
    });
    expect(unclosed.error).toBeInstanceOf(Error);
    expect((unclosed.error as Error).message).toBe('grid_import_unclosed_quote');
  });

  it('Fall 4: NUL-/Steuerzeichen bleiben String-Zellwerte und werfen nicht', () => {
    const payload = payloadFromText('A\u0000B\tC\u0001D\nE');
    const pasted = pastePayload(payload);
    expect(pasted.A1?.value).toBe('A\u0000B');
    expect(pasted.B1?.value).toBe('C\u0001D');
    expect(pasted.A2?.value).toBe('E');
    expect(Object.values(pasted).every((cell) => typeof cell.value === 'string')).toBe(true);
  });

  it('Fall 5: Formel-Paste wird im strukturierten Pfad nicht ausgeführt; lokale Evaluation wirft nicht', () => {
    // Strukturiertes Paste behandelt den Text als String; `formula` wird nicht gesetzt.
    const payload = payloadFromText('=SUM(B2:B3)');
    const pasted = pastePayload(payload);
    expect(pasted.A1?.value).toBe('=SUM(B2:B3)');
    expect(pasted.A1?.formula).toBeUndefined();
    expect(parseGridCellInput('=SUM(B2:B3)')).toEqual({ value: '=SUM(B2:B3)', dataType: 'text' });

    // Der Formula-Core darf bei leeren/fehlenden Referenzen nicht werfen.
    expect(evaluateGridFormulaLocal('=SUM(B2:B3)', {})).toBe(0);
    expect(() => evaluateGridFormulaLocal('=B2', {})).not.toThrow();
    expect(() => evaluateGridFormulaLocal('=SUM(B2:B3)', {})).not.toThrow();

    // Zirkularität wird als definierter Fehlerwert gemeldet, nicht als Ausnahme.
    const circularCells: Record<string, GridCell> = { A1: { value: 0, formula: '=A1' } };
    expect(evaluateGridFormulaLocal('=A1', circularCells)).toBe('#CIRCULAR!');
  });
});
