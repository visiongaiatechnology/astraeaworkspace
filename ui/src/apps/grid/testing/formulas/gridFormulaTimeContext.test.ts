// STATUS: PLATIN — W-426: der Zeitkontext, mit **zwei Zonen gegen dieselbe Formel** gepinnt
//
// Der Kern dieser Prüfung ist der Akzeptanzgedanke aus W-426: **dieselbe Formel, zwei Zonen, zwei Ergebnisse** ✓.
// Eine Prüfung mit **einer** Zone könnte einen konstanten Offset nicht von einer korrekten Zonenregel
// unterscheiden ✗ — und genau das ist der Fehler, den dieser Kontext behebt ✓.
import { describe, expect, it } from 'vitest';
import {
  createGridFormulaTimeContext,
  gridFormulaOffsetLabel,
} from '../../formulas/gridFormulaTimeContext';

// Zwei echte Zonen mit **unterschiedlicher** Sommerzeitlage (die USA und Europa schalten nicht am selben Tag um ✓).
const WINTER = Date.UTC(2026, 0, 15, 12, 0, 0); // 15. Januar 2026, 12:00 UTC
const SOMMER = Date.UTC(2026, 6, 15, 12, 0, 0); // 15. Juli 2026, 12:00 UTC

/** Ein Offset-Lookup, der die **echte** Zonenlage nachbildet — für genau zwei Zonen und zwei Zeitpunkte ✓. */
const lookup = (zone: string, atMs: number): number | null => {
  const sommer = atMs >= Date.UTC(2026, 2, 29) && atMs < Date.UTC(2026, 9, 25); // EU-Umstellung
  if (zone === 'Europe/Berlin') return sommer ? 120 : 60;
  if (zone === 'America/New_York') return sommer ? -240 : -300;
  return null;
};

describe('W-426: der Zeitkontext der Formelauswertung', () => {
  it('**dieselbe Formel, zwei Zonen:** Berlin und New York liefern verschiedene Offsets', () => {
    const berlin = createGridFormulaTimeContext(WINTER, 'Europe/Berlin', lookup);
    const newYork = createGridFormulaTimeContext(WINTER, 'America/New_York', lookup);
    expect(berlin?.utcOffsetMinutes).toBe(60);
    expect(newYork?.utcOffsetMinutes).toBe(-300);
    // Und die Beschriftungen sind verschieden — das ist die sichtbare Folge ✓.
    expect(gridFormulaOffsetLabel(berlin!.utcOffsetMinutes)).toBe('+01:00');
    expect(gridFormulaOffsetLabel(newYork!.utcOffsetMinutes)).toBe('-05:00');
  });

  it('**dieselbe Zone, zwei Zeitpunkte:** die Sommerzeit wird zur konkreten Zeit bestimmt', () => {
    const winter = createGridFormulaTimeContext(WINTER, 'Europe/Berlin', lookup);
    const sommer = createGridFormulaTimeContext(SOMMER, 'Europe/Berlin', lookup);
    expect(winter?.utcOffsetMinutes).toBe(60);
    expect(sommer?.utcOffsetMinutes).toBe(120);
    // **Der eigentliche Punkt:** Ein konstanter Offset hätte hier bestanden ✗ und wäre genau der Fehler, den
    // W-426 beschreibt. Deshalb prüft dieser Fall **zwei** Zeitpunkte derselben Zone ✓.
    expect(sommer!.utcOffsetMinutes).not.toBe(winter!.utcOffsetMinutes);
  });

  it('ohne Zone gilt die **Host**-Zone — aber **benannt**, nicht verschwiegen', () => {
    const host = createGridFormulaTimeContext(WINTER, null);
    expect(host?.source).toBe('host');
    expect(host?.timeZone).toBeNull();
    expect(Number.isInteger(host?.utcOffsetMinutes)).toBe(true);
  });

  it('eine benannte Zone ist als **explizit** gekennzeichnet', () => {
    const kontext = createGridFormulaTimeContext(WINTER, 'Europe/Berlin', lookup);
    expect(kontext?.source).toBe('explicit');
    expect(kontext?.timeZone).toBe('Europe/Berlin');
  });

  it('**fail-closed:** unbrauchbarer Zeitpunkt oder unbekannte Zone ergibt `null`, nicht die Host-Zone', () => {
    for (const kaputt of [Number.NaN, Infinity, 1.5, '2026-01-15', null, undefined, 0]) {
      expect(createGridFormulaTimeContext(kaputt, 'Europe/Berlin', lookup), `Zeitpunkt ${String(kaputt)}`).toBeNull();
    }
    expect(createGridFormulaTimeContext(WINTER, 'Mars/Olympus', lookup)).toBeNull();
    // Ohne Lookup kann eine benannte Zone **nicht** beantwortet werden → ablehnen, nicht raten ✓.
    expect(createGridFormulaTimeContext(WINTER, 'Europe/Berlin')).toBeNull();
  });

  it('die Beschriftung ist streng — ein unsinniger Offset wird abgelehnt, nicht formatiert', () => {
    expect(() => gridFormulaOffsetLabel(1.5)).toThrow(/offset-invalid/u);
    expect(() => gridFormulaOffsetLabel(15 * 60)).toThrow(/offset-out-of-range/u);
    expect(() => gridFormulaOffsetLabel(-13 * 60)).toThrow(/offset-out-of-range/u);
    expect(gridFormulaOffsetLabel(0)).toBe('+00:00');
    expect(gridFormulaOffsetLabel(-330)).toBe('-05:30');
  });

  it('**Nicht-Leerheit:** die Pfade sind wirklich durchlaufen worden', () => {
    const gesehen = [
      createGridFormulaTimeContext(WINTER, 'Europe/Berlin', lookup),
      createGridFormulaTimeContext(WINTER, null),
      createGridFormulaTimeContext(WINTER, 'Mars/Olympus', lookup),
    ];
    expect(gesehen.filter(Boolean).length, 'Alle drei Pfade ergaben null — die Prüfung wäre leer').toBe(2);
  });
});
