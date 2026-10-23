// STATUS: PLATIN — Eine Regel für A1-Bereiche (W-240)
//
// Der Test prüft die **Vereinigung** der beiden früheren Regeln: keine Grenze darf verschwinden, und jeder
// Ablehnungsgrund muss unterscheidbar sein, weil jeder Aufrufer daraus seine eigene sichtbare Meldung baut.
// Die Erwartungen sind von Hand geschrieben, nicht aus der Umsetzung abgeleitet.
import { describe, expect, it } from 'vitest';
import {
  WRITER_GRID_RANGE_LIMITS,
  parseWriterGridRange,
  writerGridColumnLabel,
} from '../../../../../shared/writer/grid/writerGridRange';

/** Ein Blatt, das groß genug für die Grenzfälle ist. */
const bigSheet = { cols: 200, rows: 2_000 };
const smallSheet = { cols: 10, rows: 10 };

const reason = (range: string, bounds = bigSheet) => {
  const result = parseWriterGridRange(range, bounds);
  return result.ok ? 'ok' : result.reason;
};

describe('gültige Bereiche werden normalisiert', () => {
  it('liest eine Einzelzelle', () => {
    const result = parseWriterGridRange('B3', bigSheet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range.start).toEqual({ col: 1, row: 2 });
      expect(result.range.end).toEqual({ col: 1, row: 2 });
      expect(result.range.width).toBe(1);
      expect(result.range.height).toBe(1);
    }
  });

  it('dreht eine umgekehrte Angabe um, statt sie abzulehnen', () => {
    // „C5:A1" ist eine übliche Nutzereingabe; Excel liest sie ebenso.
    const result = parseWriterGridRange('C5:A1', bigSheet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range.start).toEqual({ col: 0, row: 0 });
      expect(result.range.end).toEqual({ col: 2, row: 4 });
      expect(result.range.width).toBe(3);
      expect(result.range.height).toBe(5);
    }
  });

  it('nimmt Leerraum und Kleinschreibung an', () => {
    expect(reason('  a1:b2  ')).toBe('ok');
  });

  it('zählt mehrbuchstabige Spalten richtig', () => {
    const result = parseWriterGridRange('AA1:AB1', bigSheet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range.start.col).toBe(26);
      expect(result.range.end.col).toBe(27);
      expect(result.range.width).toBe(2);
    }
  });
});

describe('jeder Ablehnungsgrund ist unterscheidbar', () => {
  it('erkennt eine ungültige Angabe', () => {
    for (const input of ['', 'A', '1', 'A0', 'A1:', ':B2', 'A1:B', 'AAAA1', 'A1 B2', 'A-1']) {
      expect(reason(input), input).toBe('invalid-range');
    }
  });

  it('erkennt einen Bereich außerhalb des Blattes', () => {
    expect(reason('A1:K2', smallSheet)).toBe('outside-sheet');
    expect(reason('A1:A11', smallSheet)).toBe('outside-sheet');
    // Ein zu großes Blatt ist nicht die Ursache — die Lage ist es.
    expect(reason('A1:K2', smallSheet)).not.toBe('too-many-columns');
  });

  it('nennt zu viele Spalten, bevor es „zu groß" sagt', () => {
    // 65 Spalten × 1 Zeile: die genauere Ursache ist die Achse, nicht die Gesamtzahl.
    expect(reason('A1:BM1')).toBe('too-many-columns');
    const result = parseWriterGridRange('A1:BM1', bigSheet);
    if (!result.ok) expect(result.limit).toBe(WRITER_GRID_RANGE_LIMITS.maxColumns);
  });

  it('nennt zu viele Zeilen', () => {
    expect(reason('A1:A501')).toBe('too-many-rows');
  });

  it('nennt zu viele Zellen, wenn beide Achsen einzeln erlaubt sind', () => {
    // 64 Spalten × 200 Zeilen = 12 800 Zellen: beide Achsen erlaubt, die Summe nicht.
    expect(reason('A1:BL200')).toBe('too-many-cells');
    const result = parseWriterGridRange('A1:BL200', bigSheet);
    if (!result.ok) expect(result.limit).toBe(WRITER_GRID_RANGE_LIMITS.maxCells);
  });
});

describe('die Grenzen sind die Vereinigung beider früheren Regeln', () => {
  it('lässt genau die Grenze durch und lehnt ein Element darüber ab', () => {
    // Spalten
    expect(reason(`A1:${writerGridColumnLabel(WRITER_GRID_RANGE_LIMITS.maxColumns - 1)}1`)).toBe('ok');
    expect(reason(`A1:${writerGridColumnLabel(WRITER_GRID_RANGE_LIMITS.maxColumns)}1`)).toBe('too-many-columns');
    // Zeilen
    expect(reason(`A1:A${WRITER_GRID_RANGE_LIMITS.maxRows}`)).toBe('ok');
    expect(reason(`A1:A${WRITER_GRID_RANGE_LIMITS.maxRows + 1}`)).toBe('too-many-rows');
    // Zellen: **innerhalb** der Achsengrenzen. 20 Spalten × 500 Zeilen = genau 10 000 → erlaubt;
    // 21 × 500 = 10 500 → zu viele Zellen. Meine erste Fassung nahm „100 × 100" an — das sind 100 Spalten,
    // und damit greift die **Achsengrenze** (64) zuerst. Diese Wechselwirkung ist Teil der Regel.
    expect(reason('A1:T500')).toBe('ok');
    expect(reason('A1:U500')).toBe('too-many-cells');
    // Gegenprobe zur Wechselwirkung: 100 Spalten sind unzulässig, obwohl 100 × 100 = 10 000 Zellen genau
    // an der Zellgrenze läge.
    expect(reason('A1:CV100')).toBe('too-many-columns');
  });

  it('behält die Zellgrenze, die der Link-Pfad schon hatte', () => {
    // Ohne die Vereinigung hätte der Einbettungspfad diese Grenze verloren (er hatte 64×500, aber die
    // Zellgrenze stand dort ebenfalls — geprüft wird, dass sie **wirkt**, nicht nur, dass sie dasteht).
    expect(WRITER_GRID_RANGE_LIMITS.maxCells).toBe(10_000);
    expect(reason('A1:BL200')).toBe('too-many-cells');
  });

  it('behält die Achsengrenzen, die der Einbettungspfad schon hatte', () => {
    // Ohne die Vereinigung hätte der Link-Pfad diese Grenzen verloren.
    expect(WRITER_GRID_RANGE_LIMITS.maxColumns).toBe(64);
    expect(WRITER_GRID_RANGE_LIMITS.maxRows).toBe(500);
    // 1 000 Spalten × 1 Zeile wäre unter der Zellgrenze — die Achsengrenze muss trotzdem greifen.
    expect(reason('A1:ALL1', { cols: 2_000, rows: 10 })).toBe('too-many-columns');
  });
});

describe('der Spaltenname ist die Umkehrung der Zählung', () => {
  it('zählt A, Z, AA, AB, BA', () => {
    expect([0, 25, 26, 27, 52].map(writerGridColumnLabel)).toEqual(['A', 'Z', 'AA', 'AB', 'BA']);
  });

  it('ist mit der Zählung des Parsers umkehrbar', () => {
    for (const index of [0, 1, 25, 26, 27, 51, 52, 63, 701, 702]) {
      const label = writerGridColumnLabel(index);
      const parsed = parseWriterGridRange(`${label}1`, { cols: 1_000, rows: 1 });
      expect(parsed.ok, label).toBe(true);
      if (parsed.ok) expect(parsed.range.start.col, label).toBe(index);
    }
  });
});
