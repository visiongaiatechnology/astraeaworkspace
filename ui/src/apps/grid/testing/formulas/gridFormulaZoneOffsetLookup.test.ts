// STATUS: PLATIN — W-426: der `Intl`-Offset-Lookup, mit **zwei Zeitpunkten** geprüft
//
// **Warum zwei Zeitpunkte der Kern sind ✓:** Ein **konstanter** Offset würde den Januar-Fall für Berlin bestehen und den
// Juli-Fall nicht ✓ ✓ — *eine Prüfung mit einem Zeitpunkt kann einen festen Wert nicht von einer korrekten Zonenregel
// unterscheiden* ✓. Genau deshalb steht hier **dieselbe Zone zu zwei Zeiten** ✓, mit **verschiedenen** Erwartungen ✓.
//
// **Und warum das kopflos geht ✓:** `Intl` ist in Node vorhanden ✓ (kein Browser nötig ✓) — die Zeugen laufen in
// derselben Umgebung wie alle anderen ✓ ✓. Wäre `Intl` nicht da, ergäbe der Lookup **`null`** ✓ und die Prüfung würde
// das **sagen** ✓, statt still zu bestehen ✓.
import { describe, expect, it } from 'vitest';
import { createIntlZoneOffsetLookup, gridFormulaOffsetLabel } from '../../formulas/gridFormulaTimeContext';

const JANUAR = Date.UTC(2026, 0, 15, 12, 0, 0);
const JULI = Date.UTC(2026, 6, 15, 12, 0, 0);
const lookup = createIntlZoneOffsetLookup();

describe('W-426: der Intl-Zeitzonen-Offset', () => {
  it('**Nicht-Leerheit:** zwei Zonen, zwei Zeitpunkte — und sie ergeben verschiedene Offsets', () => {
    const werte = [
      lookup('Europe/Berlin', JANUAR),
      lookup('Europe/Berlin', JULI),
      lookup('America/New_York', JANUAR),
      lookup('UTC', JANUAR),
    ];
    // Wäre `Intl` nicht verfügbar, wären **alle** `null` ✓ — dann sagt die Prüfung das ✓ und besteht nicht still ✓.
    const brauchbar = werte.filter((w) => typeof w === 'number');
    expect(brauchbar.length, 'kein einziger Offset auflösbar — fehlt Intl in dieser Umgebung?').toBeGreaterThanOrEqual(4);
    // **Zwei Zeitpunkte, zwei Werte** ✓ — der eigentliche Beweis gegen einen konstanten Offset ✓.
    expect(werte[0]).not.toBe(werte[1]);
  });

  it('**dieselbe Zone, zwei Zeitpunkte:** die Sommerzeit ist enthalten, nicht angenommen', () => {
    // Berlin: Januar +60, Juli +120 ✓.
    expect(lookup('Europe/Berlin', JANUAR)).toBe(60);
    expect(lookup('Europe/Berlin', JULI)).toBe(120);
    // **Keine Non-Null-Assertion ✗** (der VGT-TypeScript-Gate verbietet unbewiesene `!` ✓): Stattdessen eine **echte**
    // Verengung ✓, die ihren Fehlschlag **benennt** ✓. *Eine Prüfung, die den Grund nennt, ist mehr wert als ein
    // Ausrufezeichen, das den Zweig für wahr erklärt* ✓.
    const label = (zone: string, atMs: number): string => {
      const offset = lookup(zone, atMs);
      if (offset === null) throw new Error(`Kein Offset für ${zone} bei ${atMs} — Intl fehlt oder die Zone ist unbekannt.`);
      return gridFormulaOffsetLabel(offset);
    };
    expect(label('Europe/Berlin', JANUAR)).toBe('+01:00');
    expect(label('Europe/Berlin', JULI)).toBe('+02:00');
    // New York: Januar −300 ✓ (und im Juli −240 ✓ — die USA schalten anders um als Europa ✓).
    expect(lookup('America/New_York', JANUAR)).toBe(-300);
    expect(lookup('America/New_York', JULI)).toBe(-240);
  });

  it('**UTC ist die Nullschreibweise**, nicht ein Sonderfall im Aufrufer', () => {
    // `Intl` gibt für UTC `GMT` **ohne** Offset zurück ✓ — ohne die ausdrückliche Behandlung wäre London immer `null` ✗.
    expect(lookup('UTC', JANUAR)).toBe(0);
    expect(lookup('Europe/London', JANUAR)).toBe(0);
    expect(lookup('Europe/London', JULI)).toBe(60);
  });

  it('**eine halbe Stunde existiert** — der Lookup parst auch krumme Offsets', () => {
    // Indien: +05:30 ✓, ganzjährig ✓ — *wer nur ganze Stunden parst, macht daraus +05:00 und damit eine falsche Zeit* ✗.
    expect(lookup('Asia/Kolkata', JANUAR)).toBe(330);
    expect(lookup('Asia/Kolkata', JULI)).toBe(330);
  });

  it('**fail-closed:** unbekannte Zone, leere Zone, unbrauchbare Zeit → `null`, **nicht** 0', () => {
    for (const zone of ['Mars/Olympus', '', '   ', 'Nicht/Existiert', 42, null, undefined]) {
      expect(lookup(zone as string, JANUAR), String(zone)).toBeNull();
    }
    for (const zeit of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '2026-01-15']) {
      expect(lookup('Europe/Berlin', zeit as number), String(zeit)).toBeNull();
    }
    // **Der entscheidende Fall ✓:** Eine unbekannte Zone ergibt **`null`** ✓ — und `null` ist **nicht** „UTC" ✓ ✓.
    expect(lookup('Mars/Olympus', JANUAR)).not.toBe(0);
  });
});
