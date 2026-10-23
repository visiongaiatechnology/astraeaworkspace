// STATUS: PLATIN — Auswahlindex für den Canvas: Bereiche **einmal** zerlegen statt je Zelle
//
// Befund (gemessen, BATCH-E B5/B18): Der Canvas-Renderer rief je sichtbarer Zelle
// `selectedRanges.some((range) => coordInGridRange(coord, range))` (Zeile 109) und
// `selectedRanges.find((range) => coordInGridRange(coord, range))` (Zeile 131). Jeder dieser Aufrufe
// **zerlegt die Bereichszeichenkette neu** (`parseGridRange`) *und* die Koordinate (`parseCoord`). Bei
// ~1.500 sichtbaren Zellen und mehreren ausgewählten Bereichen sind das pro Bild mehrere tausend
// Zerlegungen — für eine Frage, deren Antwort sich innerhalb eines Bildes **nicht ändert**.
//
// Diese Datei trennt die Regel von der Wiederholung: die Bereiche werden **einmal je Bild** zerlegt, die
// Zelle wird gegen Zahlen geprüft (die Schleife kennt Spalte und Zeile bereits, eine Koordinatenzeichenkette
// muss dafür gar nicht entstehen). Verhalten bleibt exakt gleich: der **erste** passende Bereich gewinnt,
// unlesbare Angaben werden übersprungen — genau wie zuvor.
import { parseGridRange } from '../ranges/gridRange';

export interface GridSelectionBounds {
  /** Die ursprüngliche Angabe — der Renderer braucht sie für die Rahmenauflösung. */
  readonly source: string;
  readonly startCol: number;
  readonly startRow: number;
  readonly endCol: number;
  readonly endRow: number;
}

/**
 * Zerlegt die ausgewählten Bereiche **einmal**. Unlesbare Angaben fallen weg (vorher: `if (!bounds) return
 * false` je Aufruf) — dadurch kann ein kaputter Eintrag die Anzeige nicht stören.
 */
export function parseGridSelectionBounds(ranges: readonly string[]): readonly GridSelectionBounds[] {
  const bounds: GridSelectionBounds[] = [];
  for (const source of ranges) {
    const parsed = parseGridRange(source);
    if (!parsed) continue;
    bounds.push({
      source,
      startCol: parsed.startCol,
      startRow: parsed.startRow,
      endCol: parsed.endCol,
      endRow: parsed.endRow,
    });
  }
  return bounds;
}

/**
 * Index des **ersten** Bereichs, der die Zelle enthält, sonst `-1`.
 *
 * Bewusst ohne Zeichenkettenarbeit: der Aufrufer hat Spalte und Zeile schon als Zahlen. Das ist der ganze
 * Grund, warum diese Funktion im Renderer überhaupt vertretbar ist.
 */
export function gridSelectionIndexAt(
  bounds: readonly GridSelectionBounds[],
  colIdx: number,
  rowIdx: number,
): number {
  for (let index = 0; index < bounds.length; index += 1) {
    const range = bounds[index]!;
    if (colIdx >= range.startCol && colIdx <= range.endCol && rowIdx >= range.startRow && rowIdx <= range.endRow) {
      return index;
    }
  }
  return -1;
}

/** Bequemer für Aufrufer, die nur „liegt darin?" brauchen. */
export function gridSelectionContains(
  bounds: readonly GridSelectionBounds[],
  colIdx: number,
  rowIdx: number,
): boolean {
  return gridSelectionIndexAt(bounds, colIdx, rowIdx) >= 0;
}
