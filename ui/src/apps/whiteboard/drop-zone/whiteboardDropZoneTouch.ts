// STATUS: PLATIN — Integration & Release, **Paket 11**: die Touch-Strategie der Whiteboard-Ablagezone
//
// ## Warum das hier steht und nicht in einer CSS-Zeile
//
// „Ein Zeigerereignis ist keine Touch-Strategie". `pointerdown` feuert auch bei Touch — das ist **kein** Nachweis,
// dass ein Tablet die Fläche bedienen kann. Die offenen Fragen sind **Entscheidungen**, und Entscheidungen gehören
// dorthin, wo man sie prüfen kann: in ein **reines** Modul, nicht in eine Stilregel ohne Begründung.
//
// ## Auf einem Whiteboard ist die Frage am schärfsten
//
// Die annehmende Fläche ist eine **Leinwand**. Legt sie `touch-action: none` über sich, kämpft sie mit dem
// **Verschieben** des Boards und mit **Pinch-Zoom** — beides ist auf einem Whiteboard **wesentliche** Funktion
// (UI/UX-Standard §8.6, §21.3, §32), und eine Leinwand, die die Geste stiehlt, macht sie unerreichbar. Deshalb:
//
//   * **`manipulation`, nie `none`** — `pan-x pan-y pinch-zoom` bleiben beim Board; abgeschaltet wird nur der
//     Doppeltipp-Zoom, den das Board über eigene Gesten anbietet. *`none` wäre die bequeme Zeile und der teure Fehler.*
//   * **Langdruck statt Ziehen** — ohne Langdruck startet **jeder** Scrollversuch einen Zug: wer das Board mit dem
//     Finger schiebt, will **verschieben**, nicht ziehen.
//   * **Der Systemabbruch ist benannt** — greift das System ein (Geste von außen, eingehender Anruf), kommt
//     `pointercancel`; der heißt hier `pointer-lost`, der Abbruchgrund der Zieh-Session (Paket 5), nicht ein
//     zweiter Wortschatz.
//
// ## Keine zweite Zahl
//
// Die Schwellen werden **nicht** hier neu festgelegt: der Langdruck kommt aus Paket 6 (`DRAG_TOUCH_LONGPRESS_MS`),
// die Toleranz aus der einen Zugschwelle (`DRAG_THRESHOLD_PX`, Paket 5) über die Entscheidung aus Paket 6
// (`dragThresholdForInput('touch', …)`), und ob überhaupt gewartet wird, sagt `requiresLongPress('touch')`.
// *Zwei Zahlen für dieselbe Frage wären zwei Wahrheiten — dieses Modul **liest**, es **setzt** nicht.*
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
import type { WhiteboardDropZoneCloseReason } from './whiteboardDropZoneContract';

/**
 * Die `touch-action` der Ablagezone — **`manipulation`, nie `none`**.
 *
 * `manipulation` ist `pan-x pan-y pinch-zoom`: Das Board behält Verschieben und Zoom, und nur der
 * Doppeltipp-Zoom entfällt. Das ist auf einer Leinwand die Bedingung dafür, dass die Ablagezone die
 * vorhandenen Gesten **nicht** stiehlt.
 */
export const WHITEBOARD_DROP_ZONE_TOUCH_ACTION = 'manipulation' as const;

/** Der **benannte** Abbruch eines abgebrochenen Touch — wiederverwendet aus Paket 5. */
export const WHITEBOARD_DROP_ZONE_TOUCH_CANCEL_REASON: WhiteboardDropZoneCloseReason = 'pointer-lost';

/** Der Langdruck, den Paket 6 entschieden hat — **gelesen**, nicht neu gesetzt. */
export function whiteboardDropZoneLongPressMs(): number {
  return DRAG_TOUCH_LONGPRESS_MS;
}

/** Die Touch-Toleranz — die eine Zugschwelle (Paket 5) durch die Entscheidung aus Paket 6. */
export function whiteboardDropZoneTouchThresholdPx(): number {
  return dragThresholdForInput('touch', DRAG_THRESHOLD_PX);
}

/** Ob eine Berührung **warten** muss — die Frage stellt Paket 6, nicht diese Datei. */
export function whiteboardDropZoneTouchWaits(): boolean {
  return requiresLongPress('touch');
}

/** Ob die Tastatur **ohne Zeiger** bedient wird — die Frage stellt Paket 6. */
export function whiteboardDropZoneKeyboardIsPointerFree(): boolean {
  return isPointerFree('keyboard');
}

/**
 * **Die Entscheidung**: Beginnt bei einer Berührung ein Zug — oder verschiebt der Nutzer das Board?
 *
 * Ein Zug beginnt **nur**, wenn die Berührung lange genug gehalten wurde **und** der Finger bis dahin die
 * Touch-Toleranz nicht überschritten hat. Beide Zahlen kommen aus Paket 5/6.
 *
 * **Fail-closed**: unbrauchbare Zahlen (keine Zahl, `NaN`, negativ) ergeben **`false`** — im Zweifel wird
 * **nicht** gezogen, denn ein versehentlicher Zug verliert Daten, ein unterbliebener nur Zeit.
 */
export function whiteboardDropZoneTouchDragBegins(pressDurationMs: unknown, movedDistancePx: unknown): boolean {
  if (typeof pressDurationMs !== 'number' || !Number.isFinite(pressDurationMs) || pressDurationMs < 0) return false;
  if (typeof movedDistancePx !== 'number' || !Number.isFinite(movedDistancePx) || movedDistancePx < 0) return false;
  if (!whiteboardDropZoneTouchWaits()) return true;
  if (movedDistancePx > whiteboardDropZoneTouchThresholdPx()) return false;
  return pressDurationMs >= whiteboardDropZoneLongPressMs();
}

/**
 * Die **Entscheidung in Worten** je Eingabeart — die Zeile, die die Ansage vorliest. Sie nennt die Zahlen, die
 * gelten, und ist damit eine **Anzeige der Entscheidung**, keine zweite Regel.
 */
export function whiteboardDropZoneInputHint(kind: DragInputKind): string {
  if (kind === 'touch') {
    return `Touch: the drag starts only after a ${whiteboardDropZoneLongPressMs()} ms long-press within ${whiteboardDropZoneTouchThresholdPx()} px; pan and pinch-zoom stay with the board (touch-action: ${WHITEBOARD_DROP_ZONE_TOUCH_ACTION}).`;
  }
  if (kind === 'keyboard') {
    return whiteboardDropZoneKeyboardIsPointerFree()
      ? 'Keyboard: no pointer and no threshold — confirm with Enter or choose an intent with 1–4.'
      : 'Keyboard: this input kind is not pointer-free.';
  }
  return `Pointer: the drag starts after ${dragThresholdForInput(kind, DRAG_THRESHOLD_PX)} px.`;
}
