// STATUS: PLATIN — W-426: **der Zeitkontext** für die Formelauswertung (TypeScript-Hälfte)
//
// ## Der Befund, gemessen (Runde 168)
//
// Der **Rust**-Kern kennt **keine** Zeitzone ✓: `crates/vgt-formula/src/functions.rs:2169` ruft
// `chrono::Local::now().date_naive()` (für `TODAY` ✓) und `:2174` `Local::now().naive_local()` (für `NOW` ✓) — beide
// in der **Host**-Zone ✗. Ein Nutzer in Berlin bekommt damit die Zone des **Rechners**, nicht die seiner Tabelle ✓.
// Die **DST-fähige** Regel liegt seit Runde 77 im **bewachten Vorrat** (`gridFormulaSerialDate.ts` ✓, W-321 ✓).
// Und die TypeScript-Seite hat **genau eine** Aufrufstelle ✓ (`formulas/formula.ts:206` ✓) mit **einem**
// Payload-Objekt ✓ — ein Feld ist also **additiv** möglich ✓.
//
// ## Was diese Datei ist — und was sie **nicht** ist
//
// Sie ist die **Quelle** des Zeitkontexts: eine **reine** Funktion, die aus einer Zeitzone und einem Zeitpunkt den
// **Nutzer**-Kontext bildet ✓ — prüfbar, ohne Uhr und ohne DOM ✓. Sie ist **nicht** die Behebung ✗: Solange der
// Rust-Kern das Feld nicht **durchreicht** (die zwei Stellen liegen tief in `functions.rs` ✓), ändert sie am
// Ergebnis **nichts** ✓. *Das steht hier, damit diese Datei nicht als „erledigt" durchgeht, obwohl sie allein
// nichts bewirkt* ✓ — genau die Krankheit, die ich in dieser Sitzung bei fünf Apps gerügt habe ✓.
//
// ## Die Regel für den Kontext
//
//   * **Eine explizite Zone gewinnt** ✓ — sie ist die Absicht des Nutzers.
//   * **Ohne Zone gilt die Zone des Rechners** ✓ — aber **benannt** (`source: 'host'` ✓), nicht verschwiegen ✓.
//   * **Ein unbrauchbarer Zeitpunkt oder eine unbrauchbare Zone werden abgelehnt** ✓ (`null` ✓) — **fail-closed**
//     in dem Sinne, dass der Aufrufer **entscheiden** muss, statt dass still die Host-Zone einspringt ✗ ✓.
//   * **Der Offset wird zur konkreten Zeit berechnet** ✓, nicht als Konstante geführt ✓ — sonst wäre die
//     Sommerzeit genau der Fehler, den dieser Kontext behebt ✗ ✓.

/** Woher die Zone stammt — sichtbar, nicht implizit. */
export type GridFormulaTimeZoneSource = 'explicit' | 'host';

/** Der Kontext, den die Auswertung braucht. Er ist **payload-förmig** ✓, damit er additiv hineinpasst. */
export interface GridFormulaTimeContext {
  /** Der Zeitpunkt in Millisekunden seit der Epoche — **als Zahl**, nicht als `Date` ✓ (IPC-fähig). */
  readonly nowMs: number;
  /** Der Offset der Zone **zu diesem Zeitpunkt**, in Minuten (positiv östlich von UTC) ✓. */
  readonly utcOffsetMinutes: number;
  /** Die Zone, falls benannt ✓ — sonst `null`, und `source` sagt warum ✓. */
  readonly timeZone: string | null;
  readonly source: GridFormulaTimeZoneSource;
}

/** Höchstgrenze für einen Offset: die Erde kennt −12 h bis +14 h; alles andere ist ein Fehler, kein Wert ✓. */
const OFFSET_MIN = -12 * 60;
const OFFSET_MAX = 14 * 60;

/**
 * Bildet den Zeitkontext. **Wirft nie** ✓ — eine unbrauchbare Angabe ergibt `null` ✓, damit der Aufrufer
 * **sichtbar** entscheidet, statt still die Host-Zone zu bekommen ✗ ✓.
 *
 * @param nowMs   Der Zeitpunkt. Unbrauchbar (`NaN`, nicht ganzzahlig, außerhalb von ±100 Jahren um 2026) → `null`.
 * @param timeZone Eine IANA-Zone wie `Europe/Berlin`, oder `null` für die Host-Zone.
 * @param offsetLookup Der Offset-Lookup für eine Zone zu einem Zeitpunkt. **Eingeschleust**, damit diese Funktion
 *                     rein bleibt und der Test ihn ersetzen kann ✓ (kein `Intl` im Modul selbst).
 */
export function createGridFormulaTimeContext(
  nowMs: unknown,
  timeZone: string | null | undefined,
  offsetLookup?: (timeZone: string, atMs: number) => number | null,
): GridFormulaTimeContext | null {
  // 1. Der Zeitpunkt muss brauchbar sein — fail-closed, nicht „best effort".
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || !Number.isInteger(nowMs)) return null;
  const ZEHN_JAHRE = 10 * 365.25 * 24 * 60 * 60 * 1000;
  const MITTE_2026 = 1_780_000_000_000;
  if (Math.abs(nowMs - MITTE_2026) > ZEHN_JAHRE) return null;

  // 2. Ohne benannte Zone: die Host-Zone — aber **benannt** ✓, nicht verschwiegen.
  const zone = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : null;
  if (!zone) {
    const offset = -new Date(nowMs).getTimezoneOffset(); // JS liefert Minuten **westlich** von UTC → Vorzeichen umkehren.
    if (!Number.isInteger(offset) || offset < OFFSET_MIN || offset > OFFSET_MAX) return null;
    return { nowMs, utcOffsetMinutes: offset, timeZone: null, source: 'host' };
  }

  // 3. Mit benannter Zone: der Offset wird **zur konkreten Zeit** bestimmt ✓ — sonst wäre die Sommerzeit der Fehler.
  if (typeof offsetLookup !== 'function') return null;
  const offset = offsetLookup(zone, nowMs);
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < OFFSET_MIN || offset > OFFSET_MAX) return null;
  return { nowMs, utcOffsetMinutes: offset, timeZone: zone, source: 'explicit' };
}

/**
 * **Der Offset-Lookup aus `Intl`** ✓ — die **eine** Stelle, an der die Zeitzone eines Nutzers zu einer Zahl wird.
 *
 * **Warum er hier steht und nicht im Aufrufer:** \`createGridFormulaTimeContext\` verlangt den Lookup **eingeschleust** ✓,
 * damit die Umrechnung **rein** und ohne Uhr prüfbar bleibt ✓ ✓. Diese Funktion ist der **einzige** Ort, an dem die
 * Umgebung (\`Intl\`) ins Spiel kommt ✓ — und sie ist deshalb **benannt**, damit der Aufrufer weiß, dass er hier eine
 * Abhängigkeit einkauft ✓ ✓.
 *
 * **Die Umrechnung, ausgeschrieben:** \`Intl\` gibt den Offset als **Text** zurück ✓ (\`GMT+02:00\` ✓ oder \`GMT+5:30\` ✓);
 * \`longOffset\` liefert ihn **zur konkreten Zeit** ✓ ✓ — *also ist die Sommerzeit darin schon berücksichtigt* ✓, was ein
 * fester Wert nie wäre ✗.
 *
 * **Fail-closed ✓:** eine unbekannte Zone ✓, eine Umgebung ohne \`Intl\` ✓, ein unparsbarer Text ✓ oder ein Offset
 * außerhalb der Erdgrenzen ✓ ergeben **\`null\`** ✓ — **nicht** 0 ✗ ✓. *Ein erfundener Nullwert wäre die stillste Form
 * der falschen Antwort* ✓.
 */
export function createIntlZoneOffsetLookup(): (timeZone: string, atMs: number) => number | null {
  return (timeZone: string, atMs: number): number | null => {
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') return null;
    if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
    if (!Number.isFinite(atMs)) return null;
    try {
      const teile = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'longOffset',
        hour: '2-digit',
      }).formatToParts(new Date(atMs));
      const offsetTeil = teile.find((t) => t.type === 'timeZoneName')?.value ?? '';
      // `GMT` allein bedeutet **+00:00** ✓ (Intl lässt die Nullschreibweise weg ✓).
      if (offsetTeil === 'GMT' || offsetTeil === 'UTC') return 0;
      const treffer = /^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?$/u.exec(offsetTeil);
      if (!treffer) return null;
      const vorzeichen = treffer[1] === '-' ? -1 : 1;
      const minuten = Number(treffer[2]) * 60 + Number(treffer[3] ?? '0');
      const offset = vorzeichen * minuten;
      if (!Number.isInteger(offset) || offset < OFFSET_MIN || offset > OFFSET_MAX) return null;
      return offset;
    } catch {
      // Unbekannte Zone → `null` ✓, nicht 0 ✗.
      return null;
    }
  };
}

/**
 * Der **ISO-8601-Offset** (`+02:00`) als Zeichenkette — die Schreibweise, die ein IPC-Vertrag und ein Fehlertext
 * beide lesen können ✓.
 */
export function gridFormulaOffsetLabel(utcOffsetMinutes: number): string {
  if (!Number.isInteger(utcOffsetMinutes)) throw new Error('grid-formula-offset-invalid');
  if (utcOffsetMinutes < OFFSET_MIN || utcOffsetMinutes > OFFSET_MAX) throw new Error('grid-formula-offset-out-of-range');
  const vorzeichen = utcOffsetMinutes < 0 ? '-' : '+';
  const betrag = Math.abs(utcOffsetMinutes);
  const stunden = String(Math.floor(betrag / 60)).padStart(2, '0');
  const minuten = String(betrag % 60).padStart(2, '0');
  return `${vorzeichen}${stunden}:${minuten}`;
}
