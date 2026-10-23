// STATUS: PLATIN — Integration & Release, **Paket 13**: die Touch-Strategie der Publish-Ablagezone
//
// ## Warum das hier steht und nicht in einer CSS-Zeile
//
// „Ein Zeigerereignis ist keine Touch-Strategie". `pointerdown` feuert auch bei Touch — das ist **kein** Nachweis,
// dass ein Tablet die Fläche bedienen kann. Die offenen Fragen sind **Entscheidungen**, und Entscheidungen gehören
// dorthin, wo man sie prüfen kann: in ein **reines** Modul, nicht in eine Stilregel ohne Begründung.
//
// ## Warum die Frage in Publish eine andere ist als auf einer Leinwand
//
// Die Publish-Fläche ist eine **scrollbare Seitenfläche** (`PublishCanvas`: `overflow-auto`) mit Zoom. Legt die
// Ablagezone `touch-action: none` über sich, nimmt sie dem Nutzer das **Scrollen** der Seite und das **Zoom** —
// beides ist wesentliche Funktion. Deshalb:
//
//   * **`manipulation`, nie `none`** — `pan-x pan-y pinch-zoom` bleiben der Seitenfläche; abgeschaltet wird nur
//     der Doppeltipp-Zoom. *`none` wäre die bequeme Zeile und der teure Fehler: eine Zone, die die Seite
//     unverschiebbar macht, ist teurer als jeder verhinderte Zug.*
//   * **Langdruck statt Ziehen** — ohne Langdruck startet **jeder** Scrollversuch einen Zug: wer die Seite mit
//     dem Finger schiebt, will **scrollen**, nicht ziehen.
//   * **Der Systemabbruch ist benannt** — greift das System ein (Geste von außen, eingehender Anruf), kommt
//     `pointercancel`; der heißt hier `pointer-lost`, der Abbruchgrund der Zieh-Session (Paket 5), nicht ein
//     zweiter Wortschatz.
//   * **Die Tastatur ist zeigerfrei** — sie hat kein Scroll-Problem und braucht deshalb **keine** Wartezeit.
//     *Eine Tastatur mit Langdruck wäre eine erfundene Hürde.*
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
import type { PublishWorkspaceDropZoneCloseReason } from './publishWorkspaceDropZoneContract';

/**
 * Die `touch-action` der Ablagezone — **`manipulation`, nie `none`**.
 *
 * `manipulation` ist `pan-x pan-y pinch-zoom`: Die Publish-Seitenfläche behält Scrollen und Zoom, und nur der
 * Doppeltipp-Zoom entfällt. Das ist die Bedingung dafür, dass die Ablagezone die vorhandenen Gesten **nicht**
 * stiehlt.
 */
export const PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION = 'manipulation' as const;

/** Der **benannte** Abbruch eines abgebrochenen Touch — wiederverwendet aus Paket 5. */
export const PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_CANCEL_REASON: PublishWorkspaceDropZoneCloseReason = 'pointer-lost';

/** Der Langdruck, den Paket 6 entschieden hat — **gelesen**, nicht neu gesetzt. */
export function publishWorkspaceDropZoneLongPressMs(): number {
  return DRAG_TOUCH_LONGPRESS_MS;
}

/** Die Touch-Toleranz — die eine Zugschwelle (Paket 5) durch die Entscheidung aus Paket 6. */
export function publishWorkspaceDropZoneTouchThresholdPx(): number {
  return dragThresholdForInput('touch', DRAG_THRESHOLD_PX);
}

/** Ob eine Berührung **warten** muss — die Frage stellt Paket 6, nicht diese Datei. */
export function publishWorkspaceDropZoneTouchWaits(): boolean {
  return requiresLongPress('touch');
}

/** Ob die Tastatur **ohne Zeiger** bedient wird — die Frage stellt Paket 6. */
export function publishWorkspaceDropZoneKeyboardIsPointerFree(): boolean {
  return isPointerFree('keyboard');
}

/**
 * Die Touch-Strategie als **benannte Entscheidungen** — die Form, die die Ansicht ansagen kann.
 *
 * Sie ist **keine** zweite Regel: jedes Feld ist aus Paket 5/6 **gelesen**. Die Struktur existiert, damit die
 * Ansicht nicht drei einzelne Funktionen aufrufen und dabei eine vergessen kann: *eine Entscheidung, die man
 * vergessen kann, ist keine Entscheidung.*
 */
export interface PublishWorkspaceDropTouchStrategy {
  readonly inputKind: DragInputKind;
  readonly touchAction: typeof PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION;
  readonly longPress: { readonly required: boolean; readonly ms: number };
  readonly thresholdPx: number;
  readonly pointerFree: boolean;
  readonly cancelReason: PublishWorkspaceDropZoneCloseReason;
  /** Der sichtbare Grund der Entscheidung — die Zeile, die die Zone ansagt. */
  readonly reason: string;
}

export function publishWorkspaceDropTouchStrategy(inputKind: DragInputKind): PublishWorkspaceDropTouchStrategy {
  return Object.freeze({
    inputKind,
    touchAction: PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION,
    longPress: Object.freeze({ required: requiresLongPress(inputKind), ms: DRAG_TOUCH_LONGPRESS_MS }),
    thresholdPx: inputKind === 'keyboard' ? 0 : dragThresholdForInput(inputKind, DRAG_THRESHOLD_PX),
    pointerFree: isPointerFree(inputKind),
    cancelReason: PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_CANCEL_REASON,
    reason: publishWorkspaceDropZoneInputHint(inputKind),
  });
}

/**
 * **Die Entscheidung**: Beginnt bei einer Berührung ein Zug — oder scrollt der Nutzer die Seite?
 *
 * Ein Zug beginnt **nur**, wenn die Berührung lange genug gehalten wurde **und** der Finger bis dahin die
 * Touch-Toleranz nicht überschritten hat. Beide Zahlen kommen aus Paket 5/6.
 *
 * **Fail-closed**: unbrauchbare Zahlen (keine Zahl, `NaN`, negativ) ergeben **`false`** — im Zweifel wird
 * **nicht** gezogen, denn ein versehentlicher Zug verliert Daten, ein unterbliebener nur Zeit.
 */
export function publishWorkspaceDropZoneTouchDragBegins(pressDurationMs: unknown, movedDistancePx: unknown): boolean {
  if (typeof pressDurationMs !== 'number' || !Number.isFinite(pressDurationMs) || pressDurationMs < 0) return false;
  if (typeof movedDistancePx !== 'number' || !Number.isFinite(movedDistancePx) || movedDistancePx < 0) return false;
  if (!publishWorkspaceDropZoneTouchWaits()) return true;
  if (movedDistancePx > publishWorkspaceDropZoneTouchThresholdPx()) return false;
  return pressDurationMs >= publishWorkspaceDropZoneLongPressMs();
}

/**
 * Die **Entscheidung in Worten** je Eingabeart — die Zeile, die die Ansage vorliest. Sie nennt die Zahlen, die
 * gelten, und ist damit eine **Anzeige der Entscheidung**, keine zweite Regel.
 */
export function publishWorkspaceDropZoneInputHint(kind: DragInputKind): string {
  if (kind === 'touch') {
    return `Touch: the drag starts only after a ${publishWorkspaceDropZoneLongPressMs()} ms long-press within ${publishWorkspaceDropZoneTouchThresholdPx()} px; pan and pinch-zoom stay with the page surface (touch-action: ${PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION}).`;
  }
  if (kind === 'keyboard') {
    return publishWorkspaceDropZoneKeyboardIsPointerFree()
      ? 'Keyboard: no pointer and no threshold — confirm with Enter or choose an intent with 1–4.'
      : 'Keyboard: this input kind is not pointer-free.';
  }
  return `Pointer: the drag starts after ${dragThresholdForInput(kind, DRAG_THRESHOLD_PX)} px.`;
}
