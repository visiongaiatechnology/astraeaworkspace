// STATUS: PLATIN — Integration & Release, **Paket 9**: die Touch-Strategie des Writer-Ablageziels
//
// ## Warum das hier steht und nicht in einer CSS-Zeile
//
// „Ein Zeigerereignis ist keine Touch-Strategie" ✓. `pointerdown` feuert auch bei Touch ✓ — das ist **kein**
// Nachweis ✗, dass ein Tablet das Ziel bedienen kann ✓. Die drei offenen Fragen sind **Entscheidungen** ✓,
// und Entscheidungen gehören dorthin, wo man sie prüfen kann ✓: in das **reine** Modul ✓, nicht in eine
// Stilregel ohne Begründung ✗.
//
//   * **Langdruck statt Ziehen** ✓ — `WRITER_DROP_ZONE_LONG_PRESS_MS`. *Ohne Langdruck beginnt ein Zug beim
//     Scrollen* ✓: Wer die Seite mit dem Finger schiebt, will scrollen ✓, nicht ziehen ✗.
//   * **`touch-action`** ✓ — `WRITER_DROP_ZONE_TOUCH_ACTION`. Die Oberfläche kämpft **nicht** um die Geste ✗:
//     sie erbt die Shell-Regel (`manipulation` ✓, `design-system/styles/module-accessibility.css` ✓) und
//     setzt **nie** `none` ✗ ✓. *Ein `none` würde das Scrollen auf dem Tablet abschalten und damit ein
//     Bedienproblem gegen ein anderes tauschen* ✓.
//   * **Der Abbruch** ✓ — `WRITER_DROP_ZONE_TOUCH_CANCEL_REASON`. Greift das System ein (Geste von außen,
//     eingehender Anruf ✓), kommt `pointercancel` ✓ — und der heißt hier **benannt** `pointer-lost` ✓: der
//     Abbruchgrund der Zieh-Session (Paket 5 ✓), nicht ein zweiter Wortschatz ✗.
//
// **Was hier nicht steht:** ob die Geste auf einem echten Gerät ankommt ✓. Das ist `NOT_TESTED` ✗ — dafür
// fehlt in dieser Umgebung ein Browser mit Touch ✓. Die **Strategie** ist entschieden ✓, die **Ausführung**
// ist es nicht ✓ — und genau so wird es berichtet ✓.
import { DRAG_THRESHOLD_PX } from '../../../../shell/workspace/drag/dragSession';
import type { WriterWorkspaceDropZoneCloseReason } from './writerWorkspaceDropZoneContract';

/**
 * Die Langdruck-Schwelle in Millisekunden ✓ — darunter ist die Berührung ein Scrollen ✓, kein Zug ✓.
 *
 * **Eine** Zahl für alle Anwendungen ✓ (dieselbe Rolle wie `DRAG_THRESHOLD_PX` in Paket 5 ✓ und
 * `TAB_HOVER_DWELL_MS` in Paket 8 ✓): *zwei Zahlen für dieselbe Frage wären zwei Wahrheiten* ✓.
 */
export const WRITER_DROP_ZONE_LONG_PRESS_MS = 450;

/**
 * Die `touch-action` der Ablagefläche ✓ — **`manipulation`, nie `none`** ✓.
 *
 * `manipulation` erlaubt Scrollen und Pinch ✓ und schaltet nur den Doppeltipp-Zoom ab ✓ — dieselbe Regel,
 * die die Shell bereits auf ihr Wurzelelement legt ✓. *`none` wäre die bequeme Zeile und der teure Fehler* ✓.
 */
export const WRITER_DROP_ZONE_TOUCH_ACTION = 'manipulation' as const;

/** Der **benannte** Abbruch eines abgebrochenen Touch ✓ — wiederverwendet aus Paket 5 ✓. */
export const WRITER_DROP_ZONE_TOUCH_CANCEL_REASON: WriterWorkspaceDropZoneCloseReason = 'pointer-lost';

/**
 * **Die Entscheidung** ✓: Beginnt bei einer Berührung ein Zug — oder scrollt der Nutzer ✓?
 *
 * Ein Zug beginnt **nur**, wenn die Berührung **lange genug** gehalten wurde ✓ **und** der Finger bis dahin
 * die **Zugschwelle nicht überschritten** hat ✓. Die Schwelle ist **wiederverwendet** ✓ (`DRAG_THRESHOLD_PX`
 * aus Paket 5 ✓) — *ein zweiter Toleranzwert wäre eine zweite Definition derselben Frage* ✗ ✓.
 *
 * **Fail-closed** ✓: unbrauchbare Zahlen (keine Zahl ✓, `NaN` ✓, negativ ✓) ergeben **`false`** ✓ — im Zweifel
 * wird **nicht** gezogen ✓, denn ein versehentlicher Zug verliert Daten ✓, ein unterbliebener nur Zeit ✓.
 */
export function writerWorkspaceDropZoneTouchDragBegins(pressDurationMs: unknown, movedDistancePx: unknown): boolean {
  if (typeof pressDurationMs !== 'number' || !Number.isFinite(pressDurationMs) || pressDurationMs < 0) return false;
  if (typeof movedDistancePx !== 'number' || !Number.isFinite(movedDistancePx) || movedDistancePx < 0) return false;
  if (movedDistancePx > DRAG_THRESHOLD_PX) return false;
  return pressDurationMs >= WRITER_DROP_ZONE_LONG_PRESS_MS;
}
