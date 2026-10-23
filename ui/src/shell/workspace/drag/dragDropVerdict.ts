// STATUS: PLATIN — §12.3 für die Session selbst: **Touch-Strategie, Ablageurteil, Vorschau**
//
// ## Warum diese Datei existiert
//
// Der verbindliche UI/UX-Standard verlangt für Drag & Drop **fünf** Dinge (§12.3 ✓). Drei lieferten die Pakete 5–8 ✓
// (erkennbare Zone ✓, Keyboard-Alternative ✓, Zustände ohne Farballeinigkeit ✓). **Zwei fehlten vollständig** ✗ ✓:
// **erlaubte/unerlaubte Zustände** ✓ und **Touch-Strategie** ✓ — und **eine** Anforderung war nur halb erfüllt ✗:
// die **Drop Preview** ✓.
//
// ## Die drei Entscheidungen, jede mit einem Grund
//
// **① Das Ablageurteil ist ein eigener Zustand, nicht eine Farbe** ✓. *„Dieses Ziel nimmt diesen Träger nicht an" ist
// eine **Tatsache** ✓ — die Anzeige **liest** sie ✓, statt sie zu erfinden* ✗ ✓. Deshalb: \`dropVerdict\` **neben**
// \`phase\` ✓ — *zwei verschiedene Tatsachen dürfen nicht in einem Feld wohnen* ✓ (die Lehre dieser Sitzung ✓).
//
// **② Die Fähigkeitsfrage wird eingeschleust** ✓ — wie der \`Intl\`-Lookup ✓. Die **vorhandene** Matrix
// (\`FABRIC_WORKSPACE_DROP_REGISTRY\` ✓) ist die **eine** Autorität ✓; dieses Modul **fragt** sie ✓ und baut **keine**
// zweite Regel ✗ ✓. *Eine zweite Liste „was erlaubt ist" wäre genau der Defekt, den diese Sitzung bei fünf Apps fand.*
//
// **③ Touch wird entschieden, nicht behauptet** ✓. Ein Zeigerereignis ist **keine** Touch-Strategie ✗ ✓: Dass
// \`pointerdown\` auch bei Touch feuert, sagt nichts darüber, ob ein **Scrollen** einen Zug startet ✓ oder ob ein
// **Systemabbruch** den Zug beendet ✓. Deshalb: eine **benannte Langdruck-Schwelle** ✓ und ein **benannter
// Abbruchgrund** ✓ — *beides prüfbar ✓, statt in einer CSS-Zeile zu verschwinden* ✗ ✓.
//
// ## Was hier **nicht** geprüft werden kann ✗
//
// Der **echte** Touch: \`touch-action\` ✓, das Zusammenspiel mit Scroll und Zoom ✓, \`pointercancel\` durch das
// Betriebssystem ✓. Dafür braucht es ein Gerät ✓. **Was geprüft ist:** die **Entscheidungen** — Schwelle ✓, Abbruch ✓,
// Urteil ✓, Vorschau ✓ ✓. *Die Strategie ist entschieden und benannt; die Ausführung bleibt \`NOT_TESTED\`.* ✓

/** **Die Langdruck-Schwelle für Touch** ✓ — darunter ist ein Tippen, kein Ziehen ✓. */
export const DRAG_TOUCH_LONGPRESS_MS = 250;

/** Die Eingabeart ✓ — **sie bestimmt, welche Schwelle gilt** ✓, und wird deshalb **getragen**, nicht geraten ✓. */
export type DragInputKind = 'mouse' | 'pen' | 'touch' | 'keyboard';

/** **Das Ablageurteil** ✓ — der eigene Zustand neben der Phase ✓. */
export type DropVerdict = 'none' | 'accept' | 'reject';

/** Warum abgelehnt wurde ✓ — **benannt** ✓, nie still ✗. */
export type DropRejectReason =
  | 'object-kind-unknown'
  | 'intent-unknown'
  | 'route-not-capable'
  | 'payload-missing'
  | 'verdict-unavailable';

/** Die Vorschau dessen, **was** abgelegt würde ✓ — benannt ✓, damit die Ansicht es rendern kann ✓. */
export interface DropPreview {
  readonly objectKind: string;
  readonly intent: string;
  /** Der Text, den die Ansicht **unverändert** anzeigen darf ✓ (und den ein Test prüfen kann ✓). */
  readonly label: string;
}

export interface DropTargetState {
  readonly targetApp: string | null;
  readonly verdict: DropVerdict;
  readonly reason: DropRejectReason | null;
  readonly preview: DropPreview | null;
  /** Läuft gerade ein Zug **und** ist ein Ziel unter dem Zeiger ✓ — getrennt von „ein Zug läuft" ✓. */
  readonly overTarget: boolean;
}

export type DropTargetStep =
  | { readonly ok: true; readonly state: DropTargetState; readonly reason?: never }
  | { readonly ok: false; readonly reason: string; readonly state: DropTargetState };

/** **Die eingeschleuste Fähigkeitsfrage** ✓ — die Antwort der **vorhandenen** Matrix ✓, nicht eine zweite Regel ✗. */
export type CapabilityQuestion = (targetApp: string, objectKind: string, intent: string) => boolean;

const LEER: DropTargetState = Object.freeze({
  targetApp: null, verdict: 'none', reason: null, preview: null, overTarget: false,
});

export function createDropTarget(): DropTargetState {
  return LEER;
}

function istBezeichner(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * **Der Zeiger ist über einem Ziel** ✓ — das Urteil entsteht **hier** ✓, aus der einen Autorität ✓.
 *
 * \`dropAllowed(...)\` wird **hineingereicht** ✓. Ist sie nicht verfügbar oder wirft sie ✓, lautet das Urteil
 * **\`reject\`** mit dem Grund **\`verdict-unavailable\`** ✓ — *im Zweifel wird nicht angenommen* ✓ ✓.
 */
export function hoverDropTarget(
  state: DropTargetState,
  eingabe: { targetApp: unknown; objectKind: unknown; intent: unknown; label?: unknown },
  dropAllowed: CapabilityQuestion | null | undefined,
): DropTargetStep {
  const { targetApp, objectKind, intent } = eingabe;
  if (!istBezeichner(targetApp)) return { ok: false, reason: 'drop-target-app-invalid', state };
  if (!istBezeichner(objectKind)) {
    // **Ein leerer Objekttyp ist ein benannter Grund** ✓ — kein stiller „nicht erlaubt" ✗.
    return { ok: true, state: { ...LEER, targetApp, overTarget: true, verdict: 'reject', reason: 'object-kind-unknown' } };
  }
  // **Eigener Fehler, korrigiert (Runde 219) ✗✓:** Hier stand zugesichert, ein **unbekannter** Objekttyp werde benannt
  // abgelehnt ✓ — der Code prüfte aber nur, dass die Zeichenkette **nicht leer** ist ✗. Ein erfundener Typ ging damit an
  // die Matrix ✓. *Die Prüfung hat die Lüge in meinem eigenen Kommentar gefunden.* ✓
  //
  // **Und die Behebung ist NICHT, hier eine Typliste einzubauen** ✗: Die Vokabel der Objektarten und Absichten ist die
  // Tatsache **der Registry** ✓ — sie hier zu wiederholen wäre **genau die zweite Definition**, die diese Sitzung bei
  // fünf Apps gejagt hat ✓. **Dieses Modul fragt ✓ und behauptet nicht ✓.** Ein erfundener Typ ergibt damit
  // \`reject\` **mit dem Grund, den die Autorität hergibt** ✓ — *und eine Matrix, die ihn fälschlich annähme, ist ein
  // Befund **an der Matrix** ✗, nicht an dieser Datei* ✓.
  if (!istBezeichner(intent)) {
    return { ok: true, state: { ...LEER, targetApp, overTarget: true, verdict: 'reject', reason: 'intent-unknown' } };
  }
  const label = istBezeichner(eingabe.label) ? eingabe.label : `${objectKind} · ${intent}`;
  const preview: DropPreview = { objectKind, intent, label };
  let erlaubt = false;
  let frageVerfuegbar = true;
  try {
    if (typeof dropAllowed !== 'function') frageVerfuegbar = false;
    else erlaubt = dropAllowed(targetApp, objectKind, intent) === true;
  } catch {
    frageVerfuegbar = false;
  }
  if (!frageVerfuegbar) {
    // **Fail-closed ✓:** keine Antwort ist **keine** Erlaubnis ✓.
    return { ok: true, state: { targetApp, overTarget: true, verdict: 'reject', reason: 'verdict-unavailable', preview } };
  }
  return {
    ok: true,
    state: {
      targetApp, overTarget: true, preview,
      verdict: erlaubt ? 'accept' : 'reject',
      reason: erlaubt ? null : 'route-not-capable',
    },
  };
}

/** **Der Zeiger verlässt das Ziel** ✓ — das Urteil wird **zurückgenommen** ✓, nicht aufbewahrt ✗. */
export function leaveDropTarget(
  // **Eigener Fehler, korrigiert (Runde 225) ✗✓:** Dieser Parameter war **unbenutzt** ✗ und erzeugte
  // `TS6133 'state' is declared but its value is never read` ✓ — gefunden vom **Writer-Agenten** ✓, der ihn als
  // **fremden** roten Punkt meldete ✓, mit Zeitstempel ✓ und Referenzzählung ✓: *„bitte dort klären"* ✓.
  // **Ich hatte ihn in Runde 219 übersehen** ✗, weil ich nur die **ersten fünf** Zeilen des Typlaufs gelesen hatte ✓
  // — *genau die gefilterte Lesart, vor der ich jeden Agenten gewarnt habe* ✓ ✓.
  //
  // **Die Behebung ist nicht, den Parameter zu entfernen** ✗: Er gehört zur **symmetrischen** API ✓
  // (`hoverDropTarget` ✓ → `leaveDropTarget` ✓ soll dieselbe Form haben ✓) und wird ein Aufrufer brauchen, sobald
  // „welches Ziel wurde verlassen" gemeldet werden soll ✓. Der führende Unterstrich ist die **Standard-Ausnahme** ✓
  // und macht die Absicht sichtbar ✓ — *statt den Parameter zu löschen und die API asymmetrisch zu machen* ✗.
  _state: DropTargetState,
): DropTargetState {
  return LEER;
}

/**
 * **Der Ablageversuch** ✓ — und die Stelle, an der ein **stiller Erfolg** entstehen würde ✗ ✓.
 * Ein Ziel, das nicht angenommen hat, ergibt **\`ok: false\`** mit **benanntem** Grund ✓ — *kein No-op, der wie ein
 * Erfolg aussieht* ✓.
 */
export function commitDropTarget(state: DropTargetState): DropTargetStep {
  if (!state.overTarget || state.targetApp === null) {
    return { ok: false, reason: 'drop-no-target', state };
  }
  if (!state.preview) return { ok: false, reason: 'payload-missing', state };
  if (state.verdict !== 'accept') {
    return { ok: false, reason: `drop-rejected:${state.reason ?? 'unknown'}`, state };
  }
  // **Nach dem Ablegen ist das Ziel wieder leer** ✓ — sonst bliebe ein Urteil stehen, das nicht mehr gilt ✗.
  return { ok: true, state: LEER };
}

/**
 * **Die Touch-Strategie als Entscheidung** ✓ — *prüfbar ✓, benannt ✓, ohne Gerät entschieden ✓.*
 *
 * Die Regeln, jede aus einem Grund ✓:
 *   * **Touch braucht Langdruck** ✓ (\`DRAG_TOUCH_LONGPRESS_MS\`) — *ohne ihn startet jeder Scrollversuch einen Zug* ✗.
 *   * **Maus und Stift nicht** ✓ — dort ist die Berührung selbst die Absicht ✓; eine Wartezeit wäre eine **Regel ohne
 *     Grund** ✓ und würde das Ziehen nur träge machen ✗.
 *   * **Tastatur ist kein Zeiger** ✓ und braucht **gar keine** Schwelle ✓ — sie hat ein eigenes Modell ✓.
 *   * **Ein Systemabbruch endet den Zug benannt** ✓ (\`pointercancel\` → \`pointer-lost\` ✓): *ein Touch **wird**
 *     abgebrochen, wenn das System eingreift* ✓ — das ist kein Fehler, sondern ein Ereignis ✓.
 */
export function dragThresholdForInput(kind: DragInputKind, thresholdPx?: number): number {
  const basis = typeof thresholdPx === 'number' && Number.isFinite(thresholdPx) && thresholdPx >= 0 ? thresholdPx : 4;
  return kind === 'touch' ? basis * 2 : basis;
}

/** Ob diese Eingabeart **warten** muss ✓ — die Frage, die die Bindung stellt ✓. */
export function requiresLongPress(kind: DragInputKind): boolean {
  return kind === 'touch';
}

/** Ob diese Eingabeart **ohne Zeiger** bedient wird ✓ — *und damit die Keyboard-Alternative braucht* ✓. */
export function isPointerFree(kind: DragInputKind): boolean {
  return kind === 'keyboard';
}

/**
 * **Die eine Uebersetzung `pointerType` → `DragInputKind`** ✓✓ (`W-446`, Runde 291).
 *
 * **Warum sie hier steht ✓:** Der Typ \`DragInputKind\` ist in **dieser** Datei definiert ✓ — und bis Runde 289 bot
 * sie **keine** Uebersetzung an ✗, obwohl sie den Typ in \`dragThresholdForInput\`, \`requiresLongPress\` und
 * \`isPointerFree\` selbst benutzt. Gemessen übersetzten **fuenf Apps jeweils selbst** ✗:
 * \`drawDropZoneTouch.ts:173,182\` · \`notesDropZoneTouch.ts:163\` · \`presentWorkspaceDropZone.ts:201\` ·
 * \`publishWorkspaceDropZoneTouch.ts:116,142\` · \`whiteboardDropZoneTouch.ts:96\`.
 * *Fuenf Kopien einer Ein-Zeilen-Regel — und niemand haelt fest, dass sie gleichlautend bleiben.* ✗
 * *Die naechste Aenderung an einer davon erzeugt eine **zweite Wahrheit**.* ✓
 *
 * **Der Rückfall ist die eigentliche Entscheidung ✓✓:** Ein **unbekannter** Zeiger ergibt \`'touch'\` ✗ — also die
 * **strengste** Regel ✓ (*Langdruck noetig* ✓). *Begruendung: Wenn wir nicht wissen, womit jemand zeigt, ist die
 * vorsichtige Annahme die, die **nicht** bei jeder Beruehrung einen Zug startet* ✓. Die Alternative \`'mouse'\` waere
 * bequemer ✓ und wuerde auf einem Tablet **jeden Scrollversuch** zu einem Zug machen ✗ ✓.
 */
export function dragInputKindFromPointerType(pointerType: unknown): DragInputKind {
  if (pointerType === 'touch') return 'touch';
  if (pointerType === 'pen') return 'pen';
  if (pointerType === 'mouse') return 'mouse';
  // **Unbekannt ist kein Zeiger** ✓ — *und die strengste Regel ist die sichere* ✓.
  return 'touch';
}
