// STATUS: PLATIN — Integration & Release, **Paket 8**: Tab-Hover-Aktivierung — als **reine Verweil-Maschine**
//
// ## Der Zweck, und die eine Regel, die ihn trägt
//
// Beim Ziehen zwischen Anwendungen soll ein **Tab** die Zielanwendung öffnen ✓ — aber **nicht**, sobald der Zeiger ihn
// streift ✗ ✓: Sonst wechselt die Anwendung bei jeder Bewegung über die Leiste ✓, und ein Zug über drei Tabs öffnet
// drei Anwendungen ✓. **Deshalb: Verweilen, nicht Berühren** ✓ — *ein vorbeiziehender Zeiger darf nicht die
// Anwendung wechseln* ✓.
//
// ## Warum diese Maschine **rein** ist und nicht in der Tab-Leiste sitzt
//
// Genau wie bei der Zieh-Session (Paket 5 ✓): Der **prüfbare** Teil ist der Zustand ✓ — welche Zeit läuft ✓, wann sie
// **nicht** neu startet ✓, wann sie **verfällt** ✓ —, und der ist **ohne** DOM prüfbar ✓ ✓. Der DOM-Teil
// (\`pointerenter\`/\`pointerleave\` an einem Tab ✓, das Öffnen der Anwendung ✓) bleibt \`NOT_TESTED\` ✗ ✓.
//
// ## Die Entscheidungen — jede einzeln, und jede aus einem Grund
//
//   * **Verweildauer statt Berührung** ✓: Erst nach \`dwellMs\` **ununterbrochenem** Verweilen gilt der Tab als
//     aktiviert ✓.
//   * **Derselbe Tab startet die Zeit nicht neu** ✓: Ein \`mousemove\` innerhalb desselben Tabs ist **kein** neues
//     Verweilen ✗ ✓ — sonst würde ein zitternder Zeiger die Aktivierung **nie** erreichen ✓.
//   * **Verlassen löscht die Zeit** ✓ — **vollständig** ✓, nicht pausiert ✗: *eine pausierte Zeit wäre eine
//     unsichtbare zweite Regel* ✓.
//   * **Ein anderer Tab beginnt neu** ✓: Der Wechsel setzt die Zeit auf **jetzt** ✓ — die Verweildauer gilt **je Tab** ✓.
//   * **Ohne Zug passiert nichts** ✓: \`enabled: false\` lässt die Maschine **unverändert** ✓ ✓ — sie **rät nicht**, ob
//     gerade gezogen wird ✗ ✓ (das weiß nur der Aufrufer ✓).
//   * **Fail-closed** ✓: unbrauchbare Zeit ✓, unbrauchbare Verweildauer ✓ (\`NaN\` ✓, negativ ✓), leerer Tab-Bezeichner ✓
//     → **benannt abgelehnt** ✓, Zustand **unverändert** ✓.

/** Die Verweildauer: darunter ist es ein Vorbeiziehen ✓. Bewusst **eine** Zahl für alle Anwendungen ✓. */
export const TAB_HOVER_DWELL_MS = 400;

export interface TabHoverState {
  /** Der Tab, über dem der Zeiger **verweilt** ✓ — `null`, wenn keiner ✓. */
  readonly hoveredTabId: string | null;
  /** Seit wann er dort verweilt ✓ (Millisekunden) — `null`, wenn keiner ✓. */
  readonly sinceMs: number | null;
  /** Der Tab, der **aktiviert** wurde ✓ — er wird **genau einmal** gemeldet ✓, dann `null` ✓. */
  readonly activatedTabId: string | null;
}

export type TabHoverStep =
  // **Dieselbe Form wie `DragStep`** ✓ — eine Ursache, eine Behebung ✓.
  | { readonly ok: true; readonly state: TabHoverState; readonly reason?: never }
  | { readonly ok: false; readonly reason: string; readonly state: TabHoverState };

const LEER: TabHoverState = Object.freeze({ hoveredTabId: null, sinceMs: null, activatedTabId: null });

function zahlOk(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Der leere Zustand ✓. */
export function createTabHover(): TabHoverState {
  return LEER;
}

/**
 * **Der Zeiger betritt einen Tab** (oder bewegt sich darin ✓).
 *
 * \`enabled\`: nur **während eines Zuges** darf ein Tab aktiviert werden ✓ ✓. Ist es `false`, bleibt der Zustand
 * **unverändert** ✓ — *die Maschine rät nicht, ob gezogen wird* ✗ ✓.
 *
 * **Wichtig:** Derselbe Tab **startet die Zeit nicht neu** ✓ ✓ — und ob die Verweildauer erreicht ist, entscheidet
 * **nicht** diese Funktion ✗, sondern \`hoverTick\` ✓ ✓. *Eine Betreten-Funktion, die auch aktiviert, hätte zwei
 * Aufgaben und wäre zweimal zu prüfen.* ✓
 */
export function hoverTab(
  state: TabHoverState,
  tabId: unknown,
  nowMs: unknown,
  enabled: boolean,
): TabHoverStep {
  if (typeof tabId !== 'string' || tabId.trim().length === 0) return { ok: false, reason: 'tab-hover-id-invalid', state };
  if (!zahlOk(nowMs) || nowMs < 0) return { ok: false, reason: 'tab-hover-time-invalid', state };
  if (!enabled) return { ok: true, state }; // **unverändert** ✓ — kein Raten ✗.
  if (state.hoveredTabId === tabId) {
    // **Derselbe Tab:** die laufende Zeit bleibt ✓ — die Aktivierung wird davon **nicht** ausgelöst ✓.
    return { ok: true, state: { ...state, activatedTabId: null } };
  }
  // **Ein anderer Tab:** die Verweildauer gilt **je Tab** ✓ → die Zeit beginnt **jetzt** ✓.
  return { ok: true, state: { hoveredTabId: tabId, sinceMs: nowMs, activatedTabId: null } };
}

/**
 * **Die Zeit läuft weiter** ✓ — und **hier** entsteht die Aktivierung ✓. Sie wird **genau einmal** gemeldet ✓:
 * Nach der Aktivierung ist \`activatedTabId\` gesetzt ✓; der nächste \`hoverTick\` für **denselben** Tab meldet
 * **nichts** mehr ✓ ✓ — *sonst würde ein Verweilen die Anwendung immer wieder öffnen* ✗ ✓.
 */
export function hoverTick(
  state: TabHoverState,
  nowMs: unknown,
  dwellMs: number = TAB_HOVER_DWELL_MS,
): TabHoverStep {
  if (!zahlOk(nowMs) || nowMs < 0) return { ok: false, reason: 'tab-hover-time-invalid', state };
  if (!zahlOk(dwellMs) || dwellMs < 0) return { ok: false, reason: 'tab-hover-dwell-invalid', state };
  if (state.hoveredTabId === null || state.sinceMs === null) return { ok: true, state };
  if (nowMs < state.sinceMs) {
    // **Die Uhr läuft rückwärts** ✓ — das ist keine Verweildauer, das ist ein Fehler ✓ → **ablehnen** ✓.
    return { ok: false, reason: 'tab-hover-time-went-backwards', state };
  }
  if (state.activatedTabId === state.hoveredTabId) return { ok: true, state }; // **genau einmal** ✓.
  const verweilt = nowMs - state.sinceMs;
  if (verweilt < dwellMs) return { ok: true, state: { ...state, activatedTabId: null } };
  return { ok: true, state: { ...state, activatedTabId: state.hoveredTabId } };
}

/**
 * **Der Zeiger verlässt den Tab** ✓ — die Zeit wird **vollständig** gelöscht ✓ ✓, nicht pausiert ✗.
 * Verlassen eines **anderen** Tabs als des verweilten ist ein **benannter No-op** ✓ (der Zustand bleibt ✓).
 */
export function leaveTab(state: TabHoverState, tabId: unknown, nowMs: unknown): TabHoverStep {
  if (typeof tabId !== 'string' || tabId.trim().length === 0) return { ok: false, reason: 'tab-hover-id-invalid', state };
  if (!zahlOk(nowMs) || nowMs < 0) return { ok: false, reason: 'tab-hover-time-invalid', state };
  if (state.hoveredTabId === null) return { ok: false, reason: 'tab-hover-not-hovering', state };
  if (state.hoveredTabId !== tabId) return { ok: false, reason: 'tab-hover-other-tab', state };
  return { ok: true, state: { ...LEER, activatedTabId: null } };
}

/** Ob **jetzt** die Verweildauer erreicht ist ✓ — die Frage, die die Anzeige stellt ✓ (ohne den Zustand zu ändern ✓). */
export function hasDwelled(
  state: TabHoverState,
  nowMs: unknown,
  dwellMs: number = TAB_HOVER_DWELL_MS,
): boolean {
  if (!zahlOk(nowMs) || !zahlOk(dwellMs) || dwellMs < 0) return false;
  if (state.sinceMs === null || nowMs < state.sinceMs) return false;
  return nowMs - state.sinceMs >= dwellMs;
}

/** Ob ein Verweilen **läuft** ✓ — getrennt von „ist aktiviert" ✓. */
export function isHovering(state: TabHoverState): boolean {
  return state.hoveredTabId !== null;
}
