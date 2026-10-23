// STATUS: PLATIN — Der Auswahlindex muss sich **genau** wie die alte Prüfung verhalten
//
// Der Renderer fragte vorher je Zelle `coordInGridRange(coord, range)` (Zeichenkette gegen Zeichenkette).
// Jetzt prüft er Zahlen gegen einmal zerlegte Bereiche. Ein Umbau, der schneller ist und **anders** antwortet,
// wäre eine stille Fehlfunktion — deshalb ist die alte Funktion hier das **Orakel**: für eine Reihe von
// Koordinaten und Bereichen muss `gridSelectionIndexAt(…) >= 0` dieselbe Antwort geben wie zuvor
// `ranges.some((range) => coordInGridRange(coord, range))`.
import { describe, expect, it } from 'vitest';
import { coordInGridRange } from '../../compat/gridProfessional';
import { gridSelectionContains, gridSelectionIndexAt, parseGridSelectionBounds } from '../../canvas/gridSelectionIndex';

const coordOf = (colIdx: number, rowIdx: number): string => {
  let value = colIdx + 1;
  let label = '';
  while (value > 0) { const rest = (value - 1) % 26; label = String.fromCharCode(65 + rest) + label; value = Math.floor((value - 1) / 26); }
  return `${label}${rowIdx + 1}`;
};

describe('Zerlegen und Prüfen', () => {
  it('liest eine Einzelzelle', () => {
    const bounds = parseGridSelectionBounds(['B2']);
    expect(bounds).toHaveLength(1);
    expect(gridSelectionIndexAt(bounds, 1, 1)).toBe(0);
    expect(gridSelectionIndexAt(bounds, 1, 2)).toBe(-1);
  });

  it('liest einen Bereich', () => {
    const bounds = parseGridSelectionBounds(['A1:C3']);
    expect(gridSelectionContains(bounds, 0, 0)).toBe(true);
    expect(gridSelectionContains(bounds, 2, 2)).toBe(true);
    expect(gridSelectionContains(bounds, 3, 2)).toBe(false);
    expect(gridSelectionContains(bounds, 2, 3)).toBe(false);
  });

  it('behandelt eine umgekehrte Angabe wie bisher', () => {
    const bounds = parseGridSelectionBounds(['C3:A1']);
    expect(gridSelectionContains(bounds, 0, 0)).toBe(true);
    expect(gridSelectionContains(bounds, 2, 2)).toBe(true);
  });

  it('nennt den ERSTEN passenden Bereich (wie zuvor `.find`)', () => {
    const bounds = parseGridSelectionBounds(['A1:B2', 'B2:D4']);
    expect(gridSelectionIndexAt(bounds, 1, 1)).toBe(0);
    expect(gridSelectionIndexAt(bounds, 2, 2)).toBe(1);
  });

  it('überspringt unlesbare Angaben, statt zu stören', () => {
    const bounds = parseGridSelectionBounds(['', 'kaputt', 'A1:A1', '1', 'A0']);
    expect(bounds).toHaveLength(1);
    expect(gridSelectionIndexAt(bounds, 0, 0)).toBe(0);
  });

  it('antwortet ohne Auswahl immer mit -1', () => {
    expect(gridSelectionIndexAt([], 0, 0)).toBe(-1);
    expect(gridSelectionContains(parseGridSelectionBounds([]), 5, 5)).toBe(false);
  });
});

describe('Verhaltensgleichheit mit der alten Prüfung (Orakel)', () => {
  const ranges = ['A1:C3', 'B2', 'E1:E9', 'C3:A1', 'AA10:AB12', '', 'kaputt'];
  const bounds = parseGridSelectionBounds(ranges);

  it('stimmt für jede geprüfte Koordinate mit `coordInGridRange` überein', () => {
    let verglichen = 0;
    for (let colIdx = 0; colIdx <= 28; colIdx += 1) {
      for (let rowIdx = 0; rowIdx <= 13; rowIdx += 1) {
        const coord = coordOf(colIdx, rowIdx);
        const alt = ranges.some((range) => coordInGridRange(coord, range));
        const neu = gridSelectionContains(bounds, colIdx, rowIdx);
        expect(neu, `${coord} (alt: ${alt}, neu: ${neu})`).toBe(alt);
        verglichen += 1;
      }
    }
    expect(verglichen).toBe(29 * 14);
  });

  it('liefert bei mehreren Treffern denselben Bereich wie zuvor `.find`', () => {
    for (let colIdx = 0; colIdx <= 28; colIdx += 1) {
      for (let rowIdx = 0; rowIdx <= 13; rowIdx += 1) {
        const coord = coordOf(colIdx, rowIdx);
        const alt = ranges.find((range) => coordInGridRange(coord, range));
        const index = gridSelectionIndexAt(bounds, colIdx, rowIdx);
        const neu = index >= 0 ? ranges.filter((range) => parseGridSelectionBounds([range]).length > 0)[index] : undefined;
        // `parseGridSelectionBounds` verwirft unlesbare Angaben, deshalb wird hier über die **gefilterte**
        // Liste verglichen — genau die Liste, die der Renderer für die Rahmenauflösung benutzt.
        if (alt === undefined) expect(neu, coord).toBeUndefined();
        else expect(neu, coord).toBe(alt);
      }
    }
  });
});
