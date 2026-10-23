// STATUS: PLATIN — Integration & Release, **Paket 14**: die Touch-Strategie der Draw-Ablagezone
//
// ## Warum das hier steht und nicht in einer CSS-Zeile
//
// „Ein Zeigerereignis ist keine Touch-Strategie". `pointerdown` feuert auch bei Touch — das ist **kein** Nachweis,
// dass ein Tablet die Fläche bedienen kann. Die offenen Fragen sind **Entscheidungen**, und Entscheidungen gehören
// dorthin, wo man sie prüfen kann: in ein **reines** Modul, nicht in eine Stilregel ohne Begründung.
//
// ## In Draw ist die Frage am schärfsten: die Leinwand **zeichnet** mit dem Finger
//
// Die annehmende Fläche ist eine **SVG-Anwendung** (`DrawInteractiveSurface`, `role="application"`). Ihr SVG trägt
// `touch-none` — **das ist die Entscheidung der Zeichenfläche selbst**: ohne sie würde ein Fingerstrich die Seite
// scrollen, statt zu zeichnen (`setPointerCapture`, Tinte, Griffe). Diese Entscheidung gehört dem Canvas und wird
// von der Ablagezone **nicht** angetastet.
//
//   * **`manipulation`, nie `none`** — für die Zone gilt `pan-x pan-y pinch-zoom`: Verschieben und Zoom bleiben
//     der Fläche, abgeschaltet wird nur der Doppeltipp-Zoom. *`none` wäre die bequeme Zeile und der teure Fehler.*
//   * **Die Zone beginnt selbst keine Geste** (`claimsPointerGesture: false`): kein `pointerdown`-Beginn, kein
//     `setPointerCapture`, kein `pointermove` — der Zug gehört der **Quelle** (Paket 5), die Zone ist der
//     **Empfänger**. *Ein zweiter Zeiger-Mechanismus wäre genau der Defekt, den dieses Paket nicht wiederholen darf.*
//   * **Die Zeichengeste bleibt beim Canvas** (`drawingGestureStaysWithCanvas: true`): die Zone liegt **außerhalb**
//     des SVG (Geschwister, nicht Kind) und legt **keine** gestenschluckende Schicht über die Zeichenfläche
//     (`pointer-events: none` außer an den Knöpfen). *Eine Zone, die Touch stiehlt, macht das Zeichnen unerreichbar —
//     auf einer Zeichenfläche ist das wesentliche Funktion (§8.6, §21.3, §32).*
//   * **Langdruck statt Ziehen**, wenn doch eine Berührung zieht: die Entscheidung kommt aus Paket 6
//     (`requiresLongPress('touch')`, `dragThresholdForInput('touch', …)`, `DRAG_TOUCH_LONGPRESS_MS`) — *ohne
//     Langdruck startet jeder Scrollversuch einen Zug, und wer die Leinwand mit dem Finger schiebt, will schieben.*
//   * **Der Systemabbruch ist benannt**: greift das System ein (Geste von außen, eingehender Anruf), kommt
//     `pointercancel`; der heißt hier `pointer-lost`, der Abbruchgrund der Zieh-Session (Paket 5), nicht ein
//     zweiter Wortschatz.
//
// ## Keine zweite Zahl
//
// Die Schwellen werden **nicht** hier neu festgelegt: der Langdruck kommt aus Paket 6 (`DRAG_TOUCH_LONGPRESS_MS`),
// die Toleranz aus der einen Zugschwelle (`DRAG_THRESHOLD_PX`, Paket 5) über die Entscheidung aus Paket 6
// (`dragThresholdForInput`), und ob überhaupt gewartet wird, sagt `requiresLongPress`. *Zwei Zahlen für dieselbe
// Frage wären zwei Wahrheiten — dieses Modul **liest**, es **setzt** nicht.*
//
// ## Die eine Übersetzung der Zeigerart
//
// Draw hat **keine** Tinten-Engine und braucht keine: die Sitzung dort kennt keine Zeigerarten. Deshalb steht die
// Übersetzung `PointerEvent.pointerType` → Eingabeart **hier** — und damit **einmal** in dieser Anwendung.
// `keyboard` entsteht **nicht** aus einem Zeiger: sie ist die bediente Taste und wird dort gesetzt, wo die Taste
// ankommt (`useDrawDropZone`).
//
// **Was hier nicht steht:** ob die Geste auf einem echten Gerät ankommt. Das ist `NOT_TESTED` — dafür fehlt in
// dieser Umgebung ein Browser mit Touch. Die **Strategie** ist entschieden, die **Ausführung** ist es nicht.
import { DRAG_THRESHOLD_PX } from '../../../shell/workspace/drag/dragSession';
import {
  DRAG_TOUCH_LONGPRESS_MS,
  dragThresholdForInput,
  isPointerFree,
  requiresLongPress,
  type DragInputKind,
} from '../../../shell/workspace/drag/dragDropVerdict';
import type { DrawDropZoneCloseReason } from './drawDropZoneContract';

/** Die Eingabearten, die ein **Zeiger** melden kann — `keyboard` kommt von keiner Zeigerart. */
export type DrawDropZonePointerInputKind = Exclude<DragInputKind, 'keyboard'>;

/** Die `touch-action`-Werte, über die diese Fläche **entscheiden** darf — mehr kennt die Entscheidung nicht. */
export type DrawDropZoneTouchAction = 'manipulation' | 'auto' | 'none';

/**
 * **Die eine Entscheidung, aus der die Panning-Zusage folgt** — erschöpfend typisiert: ein neuer Wert fällt beim
 * Bauen auf und verlangt eine Begründung. *Eine Zusage ohne Tabelle wäre eine Behauptung.*
 */
const TOUCH_ACTION_KEEPS_PANNING: Readonly<Record<DrawDropZoneTouchAction, boolean>> = Object.freeze({
  // `manipulation` ist `pan-x pan-y pinch-zoom`: Verschieben und Zoom bleiben der Fläche, nur der Doppeltipp-Zoom
  // entfällt. Das ist die Bedingung dafür, dass die Ablagezone die vorhandenen Gesten **nicht** stiehlt.
  manipulation: true,
  // `auto` nimmt der Fläche nichts weg — es überlässt dem Browser mehr, nicht weniger.
  auto: true,
  // `none` **stiehlt** die Geste: auf einer Zeichenfläche wäre danach kein Verschieben mehr möglich.
  none: false,
});

/**
 * Die `touch-action` der **Zone** — **`manipulation`, nie `none`**.
 *
 * Sie steht **neben** der Entscheidung der Zeichenfläche: das SVG der Zeichenfläche behält sein eigenes
 * `touch-none` (sonst würde ein Fingerstrich scrollen statt zeichnen), die Zone darüber ist
 * `manipulation` und damit für Verschieben und Zoom durchlässig.
 */
export const DRAW_DROP_ZONE_TOUCH_ACTION: DrawDropZoneTouchAction = 'manipulation';

/** Der **benannte** Abbruch eines abgebrochenen Touch — wiederverwendet aus Paket 5. */
export const DRAW_DROP_ZONE_TOUCH_CANCEL_REASON: DrawDropZoneCloseReason = 'pointer-lost';

/**
 * Die Touch-Strategie **als benannte Entscheidung** — das, was die Ansicht anzeigt und was die Bindung liest.
 * Alle Zahlen kommen aus Paket 5/6; diese Datei **liest**, sie **setzt** nicht.
 */
export interface DrawDropZoneTouchDecision {
  readonly inputKind: DragInputKind;
  /** Muss diese Eingabeart **warten**? (Paket 6: nur Touch.) */
  readonly waitsForLongPress: boolean;
  /** Der Langdruck, den Paket 6 entschieden hat — **gelesen**, nicht neu gesetzt. */
  readonly longPressMs: number;
  /** Die eine Zugschwelle (Paket 5) durch die Entscheidung aus Paket 6 — je Eingabeart. */
  readonly thresholdPx: number;
  readonly touchAction: DrawDropZoneTouchAction;
  /** Ob diese `touch-action` das Verschieben bei der Fläche lässt — aus der Tabelle oben. */
  readonly keepsPanning: boolean;
  /** Ob die Zone selbst eine Zeigergeste **beginnt** — nein: der Zug gehört der Quelle (Paket 5). */
  readonly claimsPointerGesture: boolean;
  /** Ob die Zeichengeste beim Canvas bleibt — ja: die Zone liegt außerhalb des SVG und ist durchlässig. */
  readonly drawingGestureStaysWithCanvas: boolean;
  readonly cancelReason: DrawDropZoneCloseReason;
}

/** Die Entscheidung für eine Eingabeart — **eine** Funktion, aus der Ansicht und Ansage lesen. */
export function drawDropZoneTouchDecision(kind: DragInputKind = 'touch'): DrawDropZoneTouchDecision {
  return Object.freeze({
    inputKind: kind,
    waitsForLongPress: requiresLongPress(kind),
    longPressMs: DRAG_TOUCH_LONGPRESS_MS,
    thresholdPx: dragThresholdForInput(kind, DRAG_THRESHOLD_PX),
    touchAction: DRAW_DROP_ZONE_TOUCH_ACTION,
    keepsPanning: TOUCH_ACTION_KEEPS_PANNING[DRAW_DROP_ZONE_TOUCH_ACTION],
    claimsPointerGesture: false,
    drawingGestureStaysWithCanvas: true,
    cancelReason: DRAW_DROP_ZONE_TOUCH_CANCEL_REASON,
  });
}

/** Der Langdruck, den Paket 6 entschieden hat — **gelesen**, nicht neu gesetzt. */
export function drawDropZoneLongPressMs(): number {
  return DRAG_TOUCH_LONGPRESS_MS;
}

/** Die Touch-Toleranz — die eine Zugschwelle (Paket 5) durch die Entscheidung aus Paket 6. */
export function drawDropZoneTouchThresholdPx(): number {
  return dragThresholdForInput('touch', DRAG_THRESHOLD_PX);
}

/** Ob eine Berührung **warten** muss — die Frage stellt Paket 6, nicht diese Datei. */
export function drawDropZoneTouchWaits(): boolean {
  return requiresLongPress('touch');
}

/** Ob die Tastatur **ohne Zeiger** bedient wird — die Frage stellt Paket 6. */
export function drawDropZoneKeyboardIsPointerFree(): boolean {
  return isPointerFree('keyboard');
}

/**
 * **Die Entscheidung**: Beginnt bei einer Berührung ein Zug — oder verschiebt (beziehungsweise zeichnet) der
 * Nutzer auf der Fläche?
 *
 * Ein Zug beginnt **nur**, wenn die Berührung lange genug gehalten wurde **und** der Finger bis dahin die
 * Touch-Toleranz nicht überschritten hat. Beide Zahlen kommen aus Paket 5/6.
 *
 * **Fail-closed**: unbrauchbare Zahlen (keine Zahl, `NaN`, negativ) ergeben **`false`** — im Zweifel wird
 * **nicht** gezogen, denn ein versehentlicher Zug verliert Daten, ein unterbliebener nur Zeit.
 */
export function drawDropZoneTouchDragBegins(pressDurationMs: unknown, movedDistancePx: unknown): boolean {
  if (typeof pressDurationMs !== 'number' || !Number.isFinite(pressDurationMs) || pressDurationMs < 0) return false;
  if (typeof movedDistancePx !== 'number' || !Number.isFinite(movedDistancePx) || movedDistancePx < 0) return false;
  if (!drawDropZoneTouchWaits()) return true;
  if (movedDistancePx > drawDropZoneTouchThresholdPx()) return false;
  return pressDurationMs >= drawDropZoneLongPressMs();
}

/**
 * Die Eingabeart aus `PointerEvent.pointerType` — **die eine** Übersetzung dieses Typs in Draw.
 *
 * `mouse`, `pen` und `touch` sind die drei Arten, die ein Zeiger melden kann; alles Unbekannte ist der
 * Zeiger-Standard (`mouse`). *Der Unterschied ist die **angezeigte** Strategie, nicht ein Zug: diese Zone beginnt
 * keine Geste — ein unbekannter Wert kann deshalb keinen Zug auslösen, nur eine Hinweiszeile wählen.*
 */
export function drawDropInputKindFromPointerType(pointerType: unknown): DrawDropZonePointerInputKind {
  return pointerType === 'pen' || pointerType === 'touch' ? pointerType : 'mouse';
}

/**
 * Die **Entscheidung in Worten** je Eingabeart — die Zeile, die die Ansicht ansagt. Sie nennt die Zahlen, die
 * gelten, und ist damit eine **Anzeige der Entscheidung**, keine zweite Regel.
 */
export function drawDropZoneInputHint(kind: DragInputKind): string {
  const decision = drawDropZoneTouchDecision(kind);
  if (kind === 'touch') {
    return `Touch: the drag starts only after a ${decision.longPressMs} ms long-press within ${decision.thresholdPx} px; panning and pinch-zoom stay with the surface (touch-action: ${decision.touchAction}), and the drawing gesture stays with the canvas — this zone never starts a pointer gesture itself.`;
  }
  if (kind === 'keyboard') {
    return decision.waitsForLongPress
      ? 'Keyboard: waiting is required, which contradicts the pointer-free model.'
      : 'Keyboard: no pointer, no threshold and no hover needed — confirm with Enter or choose an intent with 1–4.';
  }
  return `Pointer: the drag starts after ${decision.thresholdPx} px; this zone never claims the gesture, and the drawing gesture stays with the canvas.`;
}
