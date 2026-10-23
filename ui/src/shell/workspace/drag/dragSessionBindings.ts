// STATUS: PLATIN — Paket 5, zweite Hälfte: die **DOM-Anbindung** — als dünner Übersetzer
//
// ## Warum hier ein **reiner** Übersetzer steht und nicht nur ein Hook
//
// Ein React-Hook ist in dieser Umgebung **nicht** abnehmbar ✗ (kein DOM, keine Ereignisse ✓) — man kann ihn rendern,
// aber seine **Rückrufe** nicht auslösen ✓. Deshalb liegt die Substanz wieder **außerhalb** des Hooks ✓:
// \`reduceDragEvent\` ist **rein** ✓, nimmt den Zustand und ein **Ereignis-Beschreibungsobjekt** ✓ und gibt den neuen
// Zustand zurück ✓ ✓. Der Hook ist dann **eine Zeile je Ereignis** ✓ ✓.
//
// *Die Maschine entscheidet, der Übersetzer übersetzt, der Hook reicht weiter* ✓ — und **geprüft** wird die Maschine
// und der Übersetzer ✓, **nicht** das Binden ✓ (das bleibt \`NOT_TESTED\` ✗, dafür fehlt die Umgebung ✓).
//
// ## Die Übersetzung ist die Stelle, an der DOM-Eigenheiten **enden** sollen
//
// Der DOM liefert \`pointerId\`, \`clientX\`, \`clientY\` ✓ — und **mehr**, was hier niemanden angeht ✓ (Tasten, Druck,
// Zeigerart ✓). Der Übersetzer **wählt aus** ✓ und wirft den Rest weg ✓; die Maschine sieht nur die drei Zahlen, die
// sie braucht ✓ ✓. *Ein Übersetzer, der alles durchreicht, macht aus einer Zustandsmaschine ein DOM-Objekt.*
import type { DragPoint, DragSessionState, DragStep } from './dragSession';
import { beginDrag, cancelDrag, createDragSession, endDrag, moveDrag } from './dragSession';

/** Die drei Angaben, die aus einem DOM-Ereignis **wirklich** gebraucht werden ✓. */
export interface DragPointerLike {
  readonly pointerId?: unknown;
  readonly clientX?: unknown;
  readonly clientY?: unknown;
}

/**
 * **Ein DOM-Ereignis auf die drei Zahlen bringen** ✓ — **rein** ✓ und ohne DOM-Typen ✓, damit sie ohne Browser
 * prüfbar ist ✓. Fehlt etwas oder ist es unbrauchbar, ergibt es \`null\` ✓ — der Aufrufer **entscheidet** dann ✓,
 * statt dass die Maschine geraten wird ✗ ✓.
 */
export function dragPointFromEvent(event: DragPointerLike | null | undefined): DragPoint | null {
  if (!event) return null;
  const { pointerId, clientX, clientY } = event;
  if (typeof pointerId !== 'number' || !Number.isInteger(pointerId) || pointerId < 0) return null;
  if (typeof clientX !== 'number' || !Number.isFinite(clientX)) return null;
  if (typeof clientY !== 'number' || !Number.isFinite(clientY)) return null;
  return { pointerId, x: clientX, y: clientY };
}

/**
 * Die Ereignisarten, die die Maschine kennt ✓ — **mehr** kennt die Oberfläche nicht ✓.
 *
 * **Ergänzt für Paket 6 ✓:** Das Abnahmekriterium lautet wörtlich *„Ein Klick darf keinen Drag starten; **Esc** und
 * **Drop außerhalb** brechen sauber ab."* ✓ — der **Klick** war über die Schwelle und das `armed`-Ende schon belegt ✓,
 * aber `Esc` **hatte keinen Fall** ✗ und „außerhalb" **keinen Namen** ✗ ✓. *Die Maschine konnte beides ausdrücken; der
 * Übersetzer nannte es nicht* ✓ — und was nicht genannt ist, wird von der Oberfläche auch nicht gebunden ✓.
 */
export type DragEventKind = 'down' | 'move' | 'up' | 'cancel' | 'lost' | 'blur' | 'escape' | 'no-target';

/**
 * **Der reine Übersetzer** ✓: Zustand + Ereignisart + Punkt → neuer Zustand ✓. Er entscheidet **nichts** selbst ✗ —
 * jede Regel liegt in der Maschine ✓ ✓.
 *
 * \`payload\` wird **nur** bei \`down\` gebraucht ✓ (der semantische Träger entsteht am Anfang ✓, Paket 7 ✓).
 */
export function reduceDragEvent(
  state: DragSessionState,
  kind: DragEventKind,
  event: DragPointerLike | null | undefined,
  payload: unknown = null,
  thresholdPx?: number,
): DragStep {
  switch (kind) {
    case 'down': {
      const punkt = dragPointFromEvent(event);
      if (!punkt) return { ok: false, reason: 'drag-point-invalid', state };
      return beginDrag(state, punkt, payload, thresholdPx);
    }
    case 'move': {
      const punkt = dragPointFromEvent(event);
      if (!punkt) return { ok: false, reason: 'drag-point-invalid', state };
      return moveDrag(state, punkt, thresholdPx);
    }
    case 'up':
      // **Der Abschluss trägt keinen Punkt** ✓: Ob es ein Drop war, entscheidet die **Maschine** anhand der Phase ✓
      // (ein Ende im `armed`-Zustand ist ein Klick ✓) — der Übersetzer darf das **nicht** vorwegnehmen ✗ ✓.
      return endDrag(state, 'dropped');
    case 'cancel':
      return cancelDrag(state, 'cancelled');
    case 'lost':
      return cancelDrag(state, 'pointer-lost');
    case 'blur':
      return cancelDrag(state, 'window-blur');
    // **Paket 6: `Esc`** ✓ — die Abnahme nennt die Taste ausdrücklich ✓. Der Grund ist **benannt** ✓ (`escape`), nicht
    // „cancelled": *ein Abbruch durch die Tastatur ist ein anderer Vorgang als ein verworfener Zug* ✓.
    case 'escape':
      return cancelDrag(state, 'escape');
    // **Paket 6: `Drop außerhalb`** ✓ — die Abnahme nennt es ausdrücklich ✓. Der Grund bleibt `cancelled` ✓, weil das
    // die Vokabel der Maschine ist ✓; **unterscheidbar** ist der Fall durch die **Ereignisart** ✓ (`no-target`) ✓ —
    // *und genau die braucht die Oberfläche, um „daneben gefallen" von „abgebrochen" zu unterscheiden* ✓.
    case 'no-target':
      return cancelDrag(state, 'cancelled');
    default:
      return { ok: false, reason: 'drag-event-unknown', state };
  }
}

/** Die Rückrufe, die eine Ansicht bindet ✓ — bewusst **ohne** DOM-Typen ✓, damit sie überall passen ✓. */
export interface DragSessionBindings {
  readonly state: DragSessionState;
  readonly onPointerDown: (event: DragPointerLike, payload?: unknown) => void;
  readonly onPointerMove: (event: DragPointerLike) => void;
  readonly onPointerUp: (event: DragPointerLike) => void;
  readonly onPointerCancel: (event: DragPointerLike) => void;
  readonly onLostPointerCapture: () => void;
  readonly onWindowBlur: () => void;
}

/**
 * **Der Hook** ✓ — er hält **einen** Zustand ✓ und reicht jedes Ereignis durch den Übersetzer ✓. Er entscheidet
 * **nichts** ✗ ✓: kein Zweig, keine Schwelle, keine Sonderfälle ✓ ✓.
 *
 * **Nicht geprüft ✗** und ausdrücklich so benannt: das **Binden** der Ereignisse ✓ (dafür braucht es einen Browser ✓).
 * Geprüft sind die Maschine ✓ und der Übersetzer ✓ — also **alles**, was hier prüfbar ist ✓ ✓.
 */
export function createDragSessionBindings(
  onChange?: (state: DragSessionState, step: DragStep) => void,
  thresholdPx?: number,
): DragSessionBindings {
  let state: DragSessionState = createDragSession();
  const anwenden = (step: DragStep): void => {
    state = step.state;
    onChange?.(state, step);
  };
  return {
    get state() {
      return state;
    },
    onPointerDown: (event, payload = null) => anwenden(reduceDragEvent(state, 'down', event, payload, thresholdPx)),
    onPointerMove: (event) => anwenden(reduceDragEvent(state, 'move', event, null, thresholdPx)),
    onPointerUp: (event) => anwenden(reduceDragEvent(state, 'up', event, null, thresholdPx)),
    onPointerCancel: (event) => anwenden(reduceDragEvent(state, 'cancel', event, null, thresholdPx)),
    onLostPointerCapture: () => anwenden(reduceDragEvent(state, 'lost', null, null, thresholdPx)),
    onWindowBlur: () => anwenden(reduceDragEvent(state, 'blur', null, null, thresholdPx)),
  };
}
