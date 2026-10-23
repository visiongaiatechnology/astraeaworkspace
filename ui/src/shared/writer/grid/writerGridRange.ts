// STATUS: PLATIN — Eine Definition davon, was ein gültiger Grid-Bereich ist (W-240)
//
// Befund W-240 (gemessen in Runde 65): **Zwei** Stellen parsten dieselbe A1-Range und zogen **unterschiedliche**
// Grenzen:
//   • `apps/writer/integrations/grid/writerGridLink.ts` — nur Gesamtzellen (10 000), dafür nennt die Meldung
//     die Zahl.
//   • `apps/writer/public/workspace/writerWorkspaceExtractors.ts` — zusätzlich Achsengrenzen (64 Spalten,
//     500 Zeilen), aber die Meldung nennt **keine** Zahl.
// Beide benutzten bereits dasselbe Muster für den Text, also war der Text nie das Problem — die **Regel** war
// es. Wer hier „den besseren der beiden" hätte gewinnen lassen, hätte entweder eine Grenze verloren
// ( schutzärmer) oder eine Nutzermeldung verschlechtert.
//
// Deshalb diese Datei: **eine** reine Funktion für Muster, Normalisierung und die **Vereinigung** der Grenzen.
// Sie **wirft nicht** — sie liefert einen typisierten Grund. Jeder Aufrufer bildet den Grund auf **seine**
// Fehlerklasse und **seine** sichtbare Meldung ab, die die konkrete Zahl nennt. So gibt es eine Definition der
// Regel und je Oberfläche den passenden Wortlaut.

/** Die Grenzen sind die **Vereinigung** beider bisherigen Regeln — keine davon darf verschwinden. */
export const WRITER_GRID_RANGE_LIMITS = Object.freeze({
  /** Gesamtzellen eines Bereichs. */
  maxCells: 10_000,
  /** Spalten je Bereich (aus dem Einbettungspfad). */
  maxColumns: 64,
  /** Zeilen je Bereich (aus dem Einbettungspfad). */
  maxRows: 500,
});

/** Warum eine Bereichsangabe abgelehnt wird — für die Meldung des jeweiligen Aufrufers. */
export type WriterGridRangeFailure =
  | 'invalid-range'
  | 'outside-sheet'
  | 'too-many-cells'
  | 'too-many-columns'
  | 'too-many-rows';

export interface WriterGridRangeBounds {
  readonly cols: number;
  readonly rows: number;
}

export interface WriterGridRange {
  readonly start: { readonly col: number; readonly row: number };
  readonly end: { readonly col: number; readonly row: number };
  readonly width: number;
  readonly height: number;
}

export type WriterGridRangeResult =
  | { readonly ok: true; readonly range: WriterGridRange }
  | { readonly ok: false; readonly reason: WriterGridRangeFailure; readonly limit?: number };

/** `A` → 0, `Z` → 25, `AA` → 26. Nur Großbuchstaben; der Aufrufer normalisiert vorher. */
function columnIndex(label: string): number {
  let index = 0;
  for (const character of label) index = index * 26 + (character.charCodeAt(0) - 64);
  return index - 1;
}

const RANGE_PATTERN = /^([A-Z]{1,3})([1-9]\d*)(?::([A-Z]{1,3})([1-9]\d*))?$/u;

/**
 * Prüft und normalisiert eine A1-Range gegen die Grenzen des Blattes.
 *
 * Reihenfolge der Prüfungen ist bewusst: erst die Form, dann die Lage im Blatt, dann die Größe. Eine
 * „A1:ZZ999"-Angabe auf einem kleinen Blatt ist damit **außerhalb des Blattes** und nicht „zu groß" — die
 * Meldung, die der Nutzer sieht, soll die tatsächliche Ursache nennen.
 */
export function parseWriterGridRange(range: string, bounds: WriterGridRangeBounds): WriterGridRangeResult {
  const match = RANGE_PATTERN.exec((range ?? '').trim().toUpperCase());
  if (!match) return { ok: false, reason: 'invalid-range' };

  const start = { col: columnIndex(match[1]!), row: Number(match[2]) - 1 };
  const end = { col: columnIndex(match[3] ?? match[1]!), row: Number(match[4] ?? match[2]!) - 1 };
  const normalized: WriterGridRange = {
    start: { col: Math.min(start.col, end.col), row: Math.min(start.row, end.row) },
    end: { col: Math.max(start.col, end.col), row: Math.max(start.row, end.row) },
    width: Math.abs(end.col - start.col) + 1,
    height: Math.abs(end.row - start.row) + 1,
  };

  if (
    normalized.start.col < 0 || normalized.start.row < 0
    || normalized.end.col >= bounds.cols || normalized.end.row >= bounds.rows
  ) {
    return { ok: false, reason: 'outside-sheet' };
  }
  // Achsengrenzen zuerst: bei einem 64×500-Raster ist die Aussage „zu viele Spalten" genauer als „zu groß".
  if (normalized.width > WRITER_GRID_RANGE_LIMITS.maxColumns) {
    return { ok: false, reason: 'too-many-columns', limit: WRITER_GRID_RANGE_LIMITS.maxColumns };
  }
  if (normalized.height > WRITER_GRID_RANGE_LIMITS.maxRows) {
    return { ok: false, reason: 'too-many-rows', limit: WRITER_GRID_RANGE_LIMITS.maxRows };
  }
  if (normalized.width * normalized.height > WRITER_GRID_RANGE_LIMITS.maxCells) {
    return { ok: false, reason: 'too-many-cells', limit: WRITER_GRID_RANGE_LIMITS.maxCells };
  }
  return { ok: true, range: normalized };
}

/** Der Spaltenname zu einem Index (`0` → `A`), für Anzeige und Erzeugung von Bereichen. */
export function writerGridColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}
