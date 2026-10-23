// STATUS: PLATIN — Integration & Release, **Paket 10**: die Touch-Strategie des Present-Ablageziels
//
// ## Warum das hier steht und nicht in einer CSS-Zeile
//
// „Ein Zeigerereignis ist keine Touch-Strategie." `pointerdown` feuert auch bei Touch — das ist **kein**
// Nachweis, dass ein Tablet dieses Ablageziel bedienen kann. Die drei offenen Fragen sind
// **Entscheidungen**, und Entscheidungen gehören dorthin, wo man sie prüfen kann: in das **reine** Modul,
// nicht in eine Stilregel ohne Begründung.
//
//   * **Langdruck statt Ziehen** — die Schwelle ist **nicht** hier erfunden: sie kommt aus Paket 6
//     (`DRAG_TOUCH_LONGPRESS_MS`, `requiresLongPress`) und die Zugschwelle aus Paket 5
//     (`DRAG_THRESHOLD_PX`). *Ohne Langdruck beginnt jeder Scrollversuch einen Zug* — wer die Fläche mit
//     dem Finger schiebt, will scrollen, nicht ziehen.
//   * **`touch-action`** — `manipulation`, **nie** `none`. Die Shell legt `manipulation` bereits auf ihr
//     Wurzelelement (`design-system/styles/module-accessibility.css`). Diese Fläche **erbt** die Regel und
//     kämpft **nicht** um die Geste: *ein `none` würde das Scrollen auf dem Tablet abschalten und damit
//     ein Bedienproblem gegen ein anderes tauschen.*
//   * **Der Abbruch** — `pointercancel` heißt hier **benannt** `pointer-lost`: der Abbruchgrund der
//     Zieh-Session (Paket 5), nicht ein zweiter Wortschatz. *Ein Touch wird abgebrochen, wenn das System
//     eingreift (Geste von außen, eingehender Anruf) — das ist ein Ereignis, kein Fehler.*
//
// **Was hier nicht steht:** ob die Geste auf einem echten Gerät ankommt. Das ist `NOT_TESTED` — dafür
// fehlt in dieser Umgebung ein Browser mit Touch. Die **Strategie** ist entschieden, die **Ausführung**
// ist es nicht — und genau so wird es berichtet.
import {
  DRAG_TOUCH_LONGPRESS_MS,
  dragThresholdForInput,
  isPointerFree,
  requiresLongPress,
  type DragInputKind,
} from '../../../../shell/workspace/drag/dragDropVerdict';
import { DRAG_THRESHOLD_PX } from '../../../../shell/workspace/drag/dragSession';
import type { PresentWorkspaceDropZoneCloseReason } from './presentWorkspaceDropZoneContract';

/**
 * Die `touch-action` der Ablagefläche — **`manipulation`, nie `none`**.
 *
 * `manipulation` erlaubt Scrollen und Pinch und schaltet nur den Doppeltipp-Zoom ab; es ist **dieselbe**
 * Regel, die die Shell auf ihr Wurzelelement legt. *`none` wäre die bequeme Zeile und der teure Fehler.*
 */
export const PRESENT_WORKSPACE_DROP_ZONE_TOUCH_ACTION = 'manipulation' as const;

/** Das DOM-Ereignis, mit dem das System einen Touch abbricht — **benannt**, nicht verschwiegen. */
export const PRESENT_WORKSPACE_DROP_ZONE_CANCEL_EVENT = 'pointercancel' as const;

/** Der **benannte** Abbruch eines abgebrochenen Touch — wiederverwendet aus Paket 5. */
export const PRESENT_WORKSPACE_DROP_ZONE_CANCEL_REASON: PresentWorkspaceDropZoneCloseReason = 'pointer-lost';

/**
 * Die Touch-Strategie als **eine** Entscheidung — jede Angabe ist prüfbar und hat einen Grund.
 *
 * Es wird **nichts** neu festgelegt: Langdruck (`requiresLongPress`), Dauer (`DRAG_TOUCH_LONGPRESS_MS`),
 * Schwelle (`dragThresholdForInput`, Basis `DRAG_THRESHOLD_PX`) und Zeigerfreiheit (`isPointerFree`)
 * kommen **wörtlich** aus den vorhandenen Modulen. *Ein zweiter Toleranzwert wäre eine zweite Definition
 * derselben Frage.*
 */
export interface PresentWorkspaceDropTouchStrategy {
  readonly input: DragInputKind;
  /** Wartet diese Eingabeart auf einen Langdruck? */
  readonly longPress: { readonly required: boolean; readonly ms: number };
  /** Die Zugschwelle, die für **diese** Eingabeart gilt (Touch: doppelt, aus Paket 6). */
  readonly thresholdPx: number;
  /** Der `touch-action`-Wert, den die Fläche setzt — **geerbt**, nicht erzwungen. */
  readonly touchAction: typeof PRESENT_WORKSPACE_DROP_ZONE_TOUCH_ACTION;
  /** Das Ereignis, das den Zug beendet, wenn das System eingreift. */
  readonly cancelEvent: typeof PRESENT_WORKSPACE_DROP_ZONE_CANCEL_EVENT;
  /** Der **benannte** Grund dieses Abbruchs. */
  readonly cancelReason: PresentWorkspaceDropZoneCloseReason;
  /** Ob diese Eingabeart **ohne Zeiger** bedient wird — und damit die Tastatur-Alternative braucht. */
  readonly pointerFree: boolean;
}

/** **Die Entscheidung** — für jede Eingabeart eine benannte Strategie, nicht eine Behauptung. */
export function presentWorkspaceDropTouchStrategy(input: DragInputKind): PresentWorkspaceDropTouchStrategy {
  const required = requiresLongPress(input);
  return Object.freeze({
    input,
    longPress: { required, ms: required ? DRAG_TOUCH_LONGPRESS_MS : 0 },
    thresholdPx: dragThresholdForInput(input, DRAG_THRESHOLD_PX),
    touchAction: PRESENT_WORKSPACE_DROP_ZONE_TOUCH_ACTION,
    cancelEvent: PRESENT_WORKSPACE_DROP_ZONE_CANCEL_EVENT,
    cancelReason: PRESENT_WORKSPACE_DROP_ZONE_CANCEL_REASON,
    pointerFree: isPointerFree(input),
  });
}

/**
 * **Beginnt aus diesem Druck ein Zug — oder scrollt der Nutzer?**
 *
 * Die Entscheidung, prüfbar und ohne Gerät:
 *   * **Touch** beginnt **nur**, wenn lange genug gehalten wurde **und** der Finger bis dahin die
 *     Zugschwelle **nicht** überschritten hat.
 *   * **Maus und Stift** brauchen **keinen** Langdruck — dort ist die Berührung selbst die Absicht; die
 *     Schwelle entscheidet danach Paket 5 (`armed` → `dragging`).
 *   * **Tastatur** beginnt **nie** einen Zeigerzug — sie hat ein eigenes Modell (siehe
 *     `presentWorkspaceDropZone.ts`, Tastatur-Absicht).
 *
 * **Fail-closed:** unbrauchbare Zahlen (`NaN`, unendlich, negativ) ergeben `false` — *im Zweifel wird
 * nicht gezogen, denn ein versehentlicher Zug verliert Daten, ein unterbliebener nur Zeit.*
 */
export function presentWorkspaceDropGestureBegins(
  input: DragInputKind,
  pressDurationMs: unknown,
  movedDistancePx: unknown,
): boolean {
  if (input === 'keyboard') return false;
  if (typeof pressDurationMs !== 'number' || !Number.isFinite(pressDurationMs) || pressDurationMs < 0) return false;
  if (typeof movedDistancePx !== 'number' || !Number.isFinite(movedDistancePx) || movedDistancePx < 0) return false;
  if (!requiresLongPress(input)) return true;
  if (movedDistancePx > dragThresholdForInput(input, DRAG_THRESHOLD_PX)) return false;
  return pressDurationMs >= DRAG_TOUCH_LONGPRESS_MS;
}
