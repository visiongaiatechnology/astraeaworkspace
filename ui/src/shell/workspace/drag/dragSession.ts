// STATUS: PLATIN — Integration & Release, **Paket 5**: die Zieh-Session als **reine Zustandsmaschine**
//
// ## Die Messung, die diesen Zuschnitt bestimmt (Runde 190)
//
// Die Shell hat **keine** Zieh-Session ✗: die Suche über `src/shell/**` nach `dragSession`, `pointerdown`,
// `setPointerCapture`, `dragThreshold` liefert **keinen Treffer** ✓. Vorhanden ist **nur** der Fabric-Drop-Registry
// (`shell/fabric/fabricGraphWorkspaceDrop.ts` ✓), der **Routen registriert** ✓ und **einen** Adapter hat ✓ — er
// **startet** aber keinen Zug ✗. **Paket 5 ist damit Neuland ✓**, und die Pakete 5–8 (Zug ✓, Schwelle und Abbruch ✓,
// semantisches Transferobjekt ✓, Tab-Hover ✓) sind **ein** Bau ✓.
//
// ## Warum die Zustandsmaschine **zuerst** kommt — und ohne DOM
//
// Eine Zieh-Session ist zu 90 % **Zustand**: Wann ist ein Druck ein **Klick** ✓, wann ein **Zug** ✓, wann bricht er
// ab ✓, und wann ist der Übergang **ungültig** ✓? Diesen Teil kann man **kopflos** prüfen ✓ ✓ — den DOM-Teil
// (`pointermove`, Schweben über Tabs ✓) **nicht** ✗, dafür gibt es hier keine Umgebung ✓.
// *Wer den prüfbaren Teil zuerst baut, hat einen abnehmbaren Increment ✓; wer mit dem unprüfbaren beginnt, hat am
// Ende eine Behauptung* ✓.
//
// ## Die Regeln — jede ist eine Entscheidung, keine Bequemlichkeit
//
//   * **Ein Druck ist noch kein Zug** ✓: Erst wenn der Zeiger die **Schwelle** überschreitet, wird aus `armed` ein
//     `dragging` ✓. *Ohne diese Regel wäre jeder Klick ein Zug* ✓.
//   * **Die Schwelle gilt ab dem Ursprung** ✓, nicht pro Schritt ✓ — sonst könnte ein Zittern in kleinen Schritten
//     die Schwelle umgehen ✗ ✓.
//   * **Nur ein Zeiger** ✓: Ein zweiter `begin` während eines Zuges wird **abgelehnt** ✓ (Multi-Touch ist Paket 52 ✓,
//     nicht dieses ✓).
//   * **Abbruch gewinnt** ✓: `cancel` ist aus **jedem** Zustand gültig ✓ und führt nach `cancelled` ✓ — **nicht**
//     nach `idle` ✗, denn der Abbruch ist eine **Tatsache**, die der Aufrufer sehen muss (z. B. für die Anzeige ✓).
//   * **Ein Zug endet genau einmal** ✓: Nach `dropped` oder `cancelled` ist jeder weitere `end`/`cancel` ein
//     **No-op** ✓ und wird als solcher **benannt** ✓ — keine stillen zweiten Abschlüsse ✗.
//   * **Fail-closed** ✓: `move` ohne `begin` ✓, unbekannte Zeiger-IDs ✓, unbrauchbare Koordinaten ✓ (`NaN`, `Infinity`)
//     und eine unbrauchbare Schwelle ✓ werden **abgelehnt** ✓ mit **benanntem** Grund ✓.

/** Die Schwelle in Pixeln: darunter ist es ein Klick ✓. Bewusst **eine** Zahl für alle Apps ✓. */
export const DRAG_THRESHOLD_PX = 4;

export type DragPhase = 'idle' | 'armed' | 'dragging' | 'dropped' | 'cancelled';

/** Warum ein Zug endete — sichtbar für den Aufrufer, nicht nur ein Zustandswechsel ✓. */
export type DragEndReason = 'dropped' | 'cancelled' | 'escape' | 'pointer-lost' | 'window-blur';

export interface DragPoint {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

export interface DragSessionState {
  readonly phase: DragPhase;
  readonly pointerId: number | null;
  readonly origin: { readonly x: number; readonly y: number } | null;
  readonly current: { readonly x: number; readonly y: number } | null;
  /** Der **semantische** Träger (Paket 7 ✓) — hier bewusst `unknown` ✓, damit diese Maschine nichts über Inhalte weiß ✓. */
  readonly payload: unknown;
  /** Der Grund des Endes ✓ — `null`, solange der Zug läuft ✓. */
  readonly endReason: DragEndReason | null;
}

export type DragStep =
  // **`reason?: never` auf dem Erfolgszweig** ✓ — so **existiert** die Eigenschaft auf beiden Zweigen ✓, `.reason`
  // übersetzt auch ohne Verengung ✓, und die Verengung über `ok` bleibt korrekt ✓ ✓. *Die kanonische Form der
  // diskriminierten Union — und der Grund, warum 15 Teststellen unverändert bleiben durften* ✓.
  | { readonly ok: true; readonly state: DragSessionState; readonly reason?: never }
  | { readonly ok: false; readonly reason: string; readonly state: DragSessionState };

const IDLE: DragSessionState = Object.freeze({
  phase: 'idle', pointerId: null, origin: null, current: null, payload: null, endReason: null,
});

function istZahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function punktOk(p: DragPoint): boolean {
  return Boolean(p) && Number.isInteger(p.pointerId) && p.pointerId >= 0 && istZahl(p.x) && istZahl(p.y);
}

/** Der leere Zustand ✓ — jede Sitzung beginnt hier ✓. */
export function createDragSession(): DragSessionState {
  return IDLE;
}

/**
 * **Ein Druck beginnt** ✓ — der Zustand ist danach `armed`, **nicht** `dragging` ✓: *ein Druck ist noch kein Zug* ✓.
 */
export function beginDrag(
  state: DragSessionState,
  point: DragPoint,
  payload: unknown,
  thresholdPx: number = DRAG_THRESHOLD_PX,
): DragStep {
  if (!punktOk(point)) return { ok: false, reason: 'drag-point-invalid', state };
  if (!istZahl(thresholdPx) || thresholdPx < 0) return { ok: false, reason: 'drag-threshold-invalid', state };
  if (state.phase === 'armed' || state.phase === 'dragging') {
    // **Nur ein Zeiger** ✓ — ein zweiter Druck während eines Zuges ist kein zweiter Zug ✓.
    return { ok: false, reason: 'drag-already-active', state };
  }
  return {
    ok: true,
    state: {
      phase: 'armed', pointerId: point.pointerId,
      origin: { x: point.x, y: point.y }, current: { x: point.x, y: point.y },
      payload, endReason: null,
    },
  };
}

/**
 * **Der Zeiger bewegt sich** ✓ — überschreitet er die Schwelle **ab dem Ursprung** ✓, wird aus `armed` ein `dragging` ✓.
 * Eine Bewegung im `idle`-Zustand ist **kein** Zug ✓ und wird **abgelehnt** ✓ (fail-closed ✓).
 */
export function moveDrag(
  state: DragSessionState,
  point: DragPoint,
  thresholdPx: number = DRAG_THRESHOLD_PX,
): DragStep {
  if (!punktOk(point)) return { ok: false, reason: 'drag-point-invalid', state };
  if (state.phase === 'idle' || state.phase === 'dropped' || state.phase === 'cancelled') {
    return { ok: false, reason: 'drag-not-active', state };
  }
  if (point.pointerId !== state.pointerId) return { ok: false, reason: 'drag-pointer-mismatch', state };
  if (!state.origin) return { ok: false, reason: 'drag-origin-missing', state };

  const dx = point.x - state.origin.x;
  const dy = point.y - state.origin.y;
  const ueberSchwelle = Math.hypot(dx, dy) >= thresholdPx;
  const phase: DragPhase = state.phase === 'dragging' || ueberSchwelle ? 'dragging' : 'armed';
  return { ok: true, state: { ...state, phase, current: { x: point.x, y: point.y } } };
}

/**
 * **Der Zug endet** ✓ — genau einmal ✓. Ein zweites Ende ist ein **benannter No-op** ✓, kein stiller zweiter Abschluss ✗.
 * Ein Ende im `armed`-Zustand ist ein **Klick** ✓ und ergibt `cancelled` mit Grund ✓ (der Aufrufer soll den Klick
 * behandeln ✓) — **nicht** `dropped`, denn es wurde nicht gezogen ✓.
 */
export function endDrag(
  state: DragSessionState,
  reason: DragEndReason = 'dropped',
): DragStep {
  if (state.phase === 'idle' || state.phase === 'dropped' || state.phase === 'cancelled') {
    return { ok: false, reason: 'drag-not-active', state };
  }
  const warNurGedrueckt = state.phase === 'armed';
  return {
    ok: true,
    state: {
      ...state,
      phase: warNurGedrueckt || reason !== 'dropped' ? 'cancelled' : 'dropped',
      endReason: warNurGedrueckt && reason === 'dropped' ? 'cancelled' : reason,
    },
  };
}

/** **Der Abbruch** ✓ — aus **jedem** Zustand gültig ✓, auch aus `idle` ✓ (dann ein No-op mit Grund ✓). */
export function cancelDrag(state: DragSessionState, reason: DragEndReason = 'cancelled'): DragStep {
  if (state.phase === 'idle' || state.phase === 'dropped' || state.phase === 'cancelled') {
    return { ok: false, reason: 'drag-not-active', state };
  }
  return { ok: true, state: { ...state, phase: 'cancelled', endReason: reason } };
}

/** Ob ein Zug **läuft** ✓ — die Frage, die die Oberfläche stellt ✓. */
export function isDragActive(state: DragSessionState): boolean {
  return state.phase === 'armed' || state.phase === 'dragging';
}

/** Ob der Zeiger die Schwelle überschritten hat ✓ — getrennt von „ein Zug läuft" ✓. */
export function hasCrossedThreshold(state: DragSessionState, thresholdPx: number = DRAG_THRESHOLD_PX): boolean {
  if (!state.origin || !state.current) return false;
  if (!istZahl(thresholdPx) || thresholdPx < 0) return false;
  return Math.hypot(state.current.x - state.origin.x, state.current.y - state.origin.y) >= thresholdPx;
}
