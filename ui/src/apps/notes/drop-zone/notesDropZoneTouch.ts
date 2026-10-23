// STATUS: PLATIN — Integration & Release, **Paket 12**: die Touch-Strategie der Notes-Ablagezone
//
// ## Warum das hier steht und nicht in einer CSS-Zeile
//
// „Ein Zeigerereignis ist keine Touch-Strategie". `pointerdown` feuert auch bei Touch — das ist **kein** Nachweis,
// dass ein Tablet die Fläche bedienen kann. Die offenen Fragen sind **Entscheidungen**, und Entscheidungen gehören
// dorthin, wo man sie prüfen kann: in ein **reines** Modul, nicht in eine Stilregel ohne Begründung.
//
// ## Auf einer Notes-Leinwand ist die Frage scharf: eine Leinwand, die Touch stiehlt, kämpft gegen das Verschieben
//
// Die Notes-Leinwand ist ein **Scroll-Container** (`NotesFreeCanvas`: `overflow-auto`), und ihre Karten werden mit
// eigenen Zeigergesten bewegt und skaliert (`setPointerCapture` im vorhandenen Canvas). Dazu kommen Tinte und
// Palm-Abweisung (`notesInkEngine`). Wer dieser Fläche `touch-action: none` überstülpt, nimmt ihr das **Verschieben**
// — und Verschieben ist auf einer Leinwand **wesentliche** Funktion (UI/UX-Standard §8.6, §21.3, §32). Deshalb:
//
//   * **`manipulation`, nie `none`** — `pan-x pan-y pinch-zoom` bleiben der Leinwand; abgeschaltet wird nur der
//     Doppeltipp-Zoom, den die Fläche nicht braucht. *`none` wäre die bequeme Zeile und der teure Fehler.*
//   * **Diese Fläche beginnt selbst keine Geste** (`claimsPointerGesture: false`): kein `pointerdown`, kein
//     `setPointerCapture`, kein `pointermove` — der Zug gehört der **Quelle** (Paket 5), die Zone ist der
//     **Empfänger**. *Ein zweiter Zeiger-Mechanismus wäre genau der Defekt, den dieses Paket nicht wiederholen darf.*
//   * **Langdruck statt Ziehen**, wenn doch eine Berührung zieht: die Entscheidung kommt aus Paket 6
//     (`requiresLongPress('touch')`, `dragThresholdForInput('touch', …)`, `DRAG_TOUCH_LONGPRESS_MS`) — *ohne
//     Langdruck startet jeder Scrollversuch einen Zug, und wer die Leinwand mit dem Finger schiebt, will schieben.*
//   * **Der Systemabbruch ist benannt**: greift das System ein (Geste von außen, eingehender Anruf), kommt
//     `pointercancel`; der heißt hier `pointer-lost`, der Abbruchgrund der Zieh-Session (Paket 5), nicht ein
//     zweiter Wortschatz.
//
// ## Keine zweite Zahl und keine zweite Übersetzung
//
// Die Schwellen werden **nicht** hier neu festgelegt: der Langdruck kommt aus Paket 6 (`DRAG_TOUCH_LONGPRESS_MS`),
// die Toleranz aus der einen Zugschwelle (`DRAG_THRESHOLD_PX`, Paket 5) über die Entscheidung aus Paket 6, und ob
// überhaupt gewartet wird, sagt `requiresLongPress`. Die Übersetzung `PointerEvent.pointerType` → Eingabeart wird
// ebenfalls **nicht** neu geschrieben: sie kommt aus `normalizePointerType` der Notes-Tinte — *der einen
// Übersetzung dieses Typs in dieser Anwendung.*
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
import { normalizePointerType } from '../canvas/ink/notesInkEngine';
import type { NotesDropZoneCloseReason } from './notesDropZoneContract';

/** Die `touch-action`-Werte, über die diese Fläche **entscheiden** darf — mehr kennt die Entscheidung nicht. */
export type NotesDropZoneTouchAction = 'manipulation' | 'auto' | 'none';

/**
 * **Die eine Entscheidung, aus der die Panning-Zusage folgt** — erschöpfend typisiert: ein neuer Wert fällt beim
 * Bauen auf und verlangt eine Begründung. *Eine Zusage ohne Tabelle wäre eine Behauptung.*
 */
const TOUCH_ACTION_KEEPS_PANNING: Readonly<Record<NotesDropZoneTouchAction, boolean>> = Object.freeze({
  // `manipulation` ist `pan-x pan-y pinch-zoom`: Verschieben und Zoom bleiben der Leinwand, nur der Doppeltipp-Zoom
  // entfällt. Das ist die Bedingung dafür, dass die Ablagezone die vorhandenen Gesten **nicht** stiehlt.
  manipulation: true,
  // `auto` nimmt der Leinwand nichts weg — es überlässt dem Browser mehr, nicht weniger.
  auto: true,
  // `none` **stiehlt** die Geste: die Leinwand ließe sich mit dem Finger nicht mehr schieben.
  none: false,
});

/**
 * Die `touch-action` der Notes-Ablagezone — **`manipulation`, nie `none`**.
 *
 * Der Grund ist die Fläche selbst: die Notes-Leinwand ist ein Scroll-Container mit eigenen Zeigergesten. Eine
 * Ablagezone, die Touch **beansprucht**, macht das Verschieben unerreichbar.
 */
export const NOTES_DROP_ZONE_TOUCH_ACTION: NotesDropZoneTouchAction = 'manipulation';

/** Der **benannte** Abbruch eines abgebrochenen Touch — wiederverwendet aus Paket 5. */
export const NOTES_DROP_ZONE_TOUCH_CANCEL_REASON: NotesDropZoneCloseReason = 'pointer-lost';

/**
 * Die Touch-Strategie **als benannte Entscheidung** — das, was die Ansicht anzeigt und was die Bindung liest.
 * Alle Zahlen kommen aus Paket 5/6; diese Datei **liest**, sie **setzt** nicht.
 */
export interface NotesDropZoneTouchDecision {
  readonly inputKind: DragInputKind;
  /** Muss diese Eingabeart **warten**? (Paket 6: nur Touch.) */
  readonly waitsForLongPress: boolean;
  /** Der Langdruck, den Paket 6 entschieden hat — **gelesen**, nicht neu gesetzt. */
  readonly longPressMs: number;
  /** Die eine Zugschwelle (Paket 5) durch die Entscheidung aus Paket 6 — je Eingabeart. */
  readonly thresholdPx: number;
  readonly touchAction: NotesDropZoneTouchAction;
  /** Ob diese `touch-action` das Verschieben bei der Leinwand lässt — aus der Tabelle oben. */
  readonly keepsPanning: boolean;
  /** Ob die Zone selbst eine Zeigergeste **beginnt** — nein: der Zug gehört der Quelle (Paket 5). */
  readonly claimsPointerGesture: boolean;
  readonly cancelReason: NotesDropZoneCloseReason;
}

/** Die Entscheidung für eine Eingabeart — **eine** Funktion, aus der Ansicht und Ansage lesen. */
export function notesDropZoneTouchDecision(kind: DragInputKind = 'touch'): NotesDropZoneTouchDecision {
  return Object.freeze({
    inputKind: kind,
    waitsForLongPress: requiresLongPress(kind),
    longPressMs: DRAG_TOUCH_LONGPRESS_MS,
    thresholdPx: dragThresholdForInput(kind, DRAG_THRESHOLD_PX),
    touchAction: NOTES_DROP_ZONE_TOUCH_ACTION,
    keepsPanning: TOUCH_ACTION_KEEPS_PANNING[NOTES_DROP_ZONE_TOUCH_ACTION],
    claimsPointerGesture: false,
    cancelReason: NOTES_DROP_ZONE_TOUCH_CANCEL_REASON,
  });
}

/** Der Langdruck, den Paket 6 entschieden hat — **gelesen**, nicht neu gesetzt. */
export function notesDropZoneLongPressMs(): number {
  return DRAG_TOUCH_LONGPRESS_MS;
}

/** Die Touch-Toleranz — die eine Zugschwelle (Paket 5) durch die Entscheidung aus Paket 6. */
export function notesDropZoneTouchThresholdPx(): number {
  return dragThresholdForInput('touch', DRAG_THRESHOLD_PX);
}

/** Ob eine Berührung **warten** muss — die Frage stellt Paket 6, nicht diese Datei. */
export function notesDropZoneTouchWaits(): boolean {
  return requiresLongPress('touch');
}

/** Ob die Tastatur **ohne Zeiger** bedient wird — die Frage stellt Paket 6. */
export function notesDropZoneKeyboardIsPointerFree(): boolean {
  return isPointerFree('keyboard');
}

/**
 * **Die Entscheidung**: Beginnt bei einer Berührung ein Zug — oder schiebt der Nutzer die Leinwand?
 *
 * Ein Zug beginnt **nur**, wenn die Berührung lange genug gehalten wurde **und** der Finger bis dahin die
 * Touch-Toleranz nicht überschritten hat. Beide Zahlen kommen aus Paket 5/6.
 *
 * **Fail-closed**: unbrauchbare Zahlen (keine Zahl, `NaN`, negativ) ergeben **`false`** — im Zweifel wird
 * **nicht** gezogen: ein versehentlicher Zug verliert Daten, ein unterbliebener nur Zeit.
 */
export function notesDropZoneTouchDragBegins(pressDurationMs: unknown, movedDistancePx: unknown): boolean {
  if (typeof pressDurationMs !== 'number' || !Number.isFinite(pressDurationMs) || pressDurationMs < 0) return false;
  if (typeof movedDistancePx !== 'number' || !Number.isFinite(movedDistancePx) || movedDistancePx < 0) return false;
  if (!notesDropZoneTouchWaits()) return true;
  if (movedDistancePx > notesDropZoneTouchThresholdPx()) return false;
  return pressDurationMs >= notesDropZoneLongPressMs();
}

/**
 * Die Eingabeart aus `PointerEvent.pointerType` — über die **vorhandene** Übersetzung der Notes-Tinte, nicht über
 * eine zweite. `keyboard` entsteht **nicht** hier: sie ist keine Zeigerart, sondern die bediente Taste (siehe
 * `resolveNotesDropCommand`).
 */
export function notesDropInputKindFromPointerType(pointerType: unknown): DragInputKind {
  return normalizePointerType(typeof pointerType === 'string' ? pointerType : undefined);
}

/**
 * Die **Entscheidung in Worten** je Eingabeart — die Zeile, die die Ansicht ansagt. Sie nennt die Zahlen, die
 * gelten, und ist damit eine **Anzeige der Entscheidung**, keine zweite Regel.
 */
export function notesDropZoneInputHint(kind: DragInputKind): string {
  const decision = notesDropZoneTouchDecision(kind);
  if (kind === 'touch') {
    return `Touch: the drag starts only after a ${decision.longPressMs} ms long-press within ${decision.thresholdPx} px; panning and pinch-zoom stay with the canvas (touch-action: ${decision.touchAction}). This zone never starts a pointer gesture itself.`;
  }
  if (kind === 'keyboard') {
    return decision.waitsForLongPress
      ? 'Keyboard: waiting is required, which contradicts the pointer-free model.'
      : 'Keyboard: no pointer, no threshold and no hover needed — confirm with Enter or choose an intent with 1–4.';
  }
  return `Pointer: the drag starts after ${decision.thresholdPx} px; this zone never claims the gesture.`;
}
