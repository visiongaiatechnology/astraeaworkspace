// STATUS: DIAMANT VGT SUPREME — zeitkonstanter Ausweisvergleich, eine Verantwortlichkeit.
//
// **Der gemessene Befund, den dieses Modul schliesst:**
// `validateVaultUiSessionGate` verglich den eingegebenen Ausweis mit dem aktiven ueber
// `supplied !== expected`. Die Sprachspezifikation von JavaScript garantiert fuer `!==` auf Zeichenketten
// **keine** konstante Laufzeit: eine Umsetzung darf beim ersten unterschiedlichen Zeichen abbrechen. Damit
// ist die Zahl der Zeichenvergleiche eine Funktion der Uebereinstimmungslage — der Regelverstoss gegen
// „Timing-Attack-resistente Vergleiche in jedem Zweig".
//
// **Und die gemessene Groesse, die die Schwere begrenzt** (Werkzeug:
// `ui/src/apps/vault/testing/security/vaultTimingProbe.test.ts`, 128-Zeichen-Ausweise, 200.000 Aufrufe je
// Runde, 7 Runden): der Gate-Aufruf kostet 6405,6 ns bei Unterschied an Position 0 und 6424,2 ns bei
// Unterschied an Position 127 — ein Abstand von **18,6 ns**, waehrend die Streuung **innerhalb einer
// einzigen Konfiguration 435,9 ns bis 713,1 ns** betraegt. Der angebliche Kanal liegt also **23- bis 38-fach
// unter dem Rauschen** derselben Messung, und das Vorzeichen ist nicht einmal stabil. Im isolierten
// `!==` auf zwei 128-Zeichen-Zeichenketten gemessen: 1,249 ns gegen 1,045 ns, Abstand **-0,204 ns**.
// Die theoretische Breite des Kanals sind 127 Zeichenvergleiche; sie sind in dieser Umgebung **nicht
// aufloesbar**. Die Korrektur ist dennoch richtig: sie kostet nichts, sie haengt nicht von der
// Umsetzungsfreiheit einer Engine ab, und die Regel verlangt sie in jedem Zweig.
//
// **Vertrag dieses Moduls:** `compareVaultCredentials` ist fuer **jede** Eingabe korrekt (es kann niemals
// faelschlich `equal` melden) und laeuft fuer jede Eingabe, deren Laenge hoechstens `loopBound` betraegt,
// ueber **genau `loopBound` Schritte** — unabhaengig davon, an welcher Stelle sich zwei Zeichenketten
// unterscheiden und unabhaengig von der Laenge des Geheimnisses. Beides ist durch den Zeugen
// `vaultCredentialTimingProperty.test.ts` gesichert, nicht behauptet.

/**
 * Das Ergebnis eines Vergleichs **samt** der Zahl der ausgefuehrten Schritte.
 *
 * Der Schrittzahl wegen ist dieses Modul so geschnitten: eine Laufzeitmessung ist in dieser Umgebung nicht
 * stabil genug fuer eine Zusage, die Zahl der Operationen ist es. Ohne sie waere die Eigenschaft
 * „laeuft ueber die volle Laenge" nicht verifizierbar, sondern nur behauptet.
 */
export interface VaultCredentialComparison {
  /** `true` genau dann, wenn beide Zeichenketten dieselbe Laenge und dieselben Zeichen haben. */
  readonly equal: boolean;
  /** Die tatsaechlich ausgefuehrten Schleifenschritte. Im Vertragsbereich identisch fuer alle Eingaben. */
  readonly steps: number;
}

/**
 * Vergleicht zwei Ausweise, ohne die Zahl der Operationen von der Lage des ersten Unterschieds abhaengig
 * zu machen.
 *
 * **Wie die Laenge nicht leckt:** die Laengendifferenz geht als `supplied.length ^ expected.length` in den
 * Akkumulator ein, statt als Abfrage davor. Sie ist damit Teil der konstanten Arbeit und nicht ihr Abbruch.
 *
 * **Wie die Schleife konstante Arbeit leistet:** `charCodeAt` liefert ausserhalb der Zeichenkette `NaN`, und
 * `NaN ^ x` ist nach der Ganzzahlumwandlung `x` mit `ToInt32(NaN) === 0`. Deshalb braucht der Rumpf
 * **keine** Laengenabfrage je Position — es gibt keinen Zweig, der von der Laenge des Geheimnisses abhaengt.
 *
 * **Warum die Untergrenze `Math.max(...)`:** sie ist die Korrektheitszusage, nicht die Zeitkanalzusage. Ein
 * Aufrufer, der eine zu kleine Schranke uebergibt, darf niemals ein falsches `equal` erhalten (das waere ein
 * Umgehen der Ausweisprüfung). Die Untergrenze stellt sicher, dass ueber die volle Laenge beider Eingaben
 * gelaufen wird. Fuer die Zeitkonstanz gilt der Vertrag: solange beide Eingaben hoechstens `loopBound` lang
 * sind — und das erzwingt `validateVaultCredential` vor jedem Aufruf — ist die Schrittzahl genau `loopBound`,
 * also eine Funktion der **Angreifereingabe** und einer **oeffentlichen Konstante**, niemals des Geheimnisses.
 *
 * @param supplied Der eingegebene Ausweis. Feindlich, in beliebiger Laenge.
 * @param expected Der aktive Ausweis. Darf nicht in die Schrittzahl eingehen.
 * @param loopBound Die oeffentliche Obergrenze der Ausweiszlaenge. Pflichtparameter: es gibt keinen
 *   stillen Standardwert, der von der Formatgrenze abdriften koennte.
 */
export function compareVaultCredentials(
  supplied: string,
  expected: string,
  loopBound: number,
): VaultCredentialComparison {
  const safeBound = Number.isSafeInteger(loopBound) && loopBound >= 0 ? loopBound : 0;
  const bound = Math.max(safeBound, supplied.length, expected.length);
  let mismatch = supplied.length ^ expected.length;
  /**
   * **Grund fuer den Zaehler und nicht der vorberechneten Schranke:** eine zurueckgegebene Schranke waere
   * eine Behauptung ueber die Schleife, kein Nachweis. Waere hier `steps: bound` zurueckgegeben worden,
   * haette ein `break` im Rumpf die Zahl nicht veraendert — der Zeuge haette die Schleife dann gar nicht
   * gebunden. Gezaehlt wird, was tatsaechlich geschieht.
   */
  let steps = 0;
  for (let position = 0; position < bound; position += 1) {
    mismatch |= supplied.charCodeAt(position) ^ expected.charCodeAt(position);
    steps += 1;
  }
  return { equal: mismatch === 0, steps };
}
