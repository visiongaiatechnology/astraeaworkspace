// STATUS: PLATIN — Integration & Release, **Paket 11**: Vokabular und Vertrag der Whiteboard-Ablagezone
//
// ## Warum Vokabular und Regeln getrennt liegen
//
// Dieses Modul **benennt** — Zustände, Gründe, Wörter, Formen. Es **entscheidet nichts**. Die Regeln stehen in
// `whiteboardDropZone.ts`. *Wer Wörter und Regeln in eine Datei legt, kann den Vertrag nicht mehr prüfen, ohne
// die Regel zu laden.*
//
// ## Der Whiteboard-Sonderfall: die annehmende Fläche ist eine **Leinwand**
//
// Der verbindliche UI/UX-Standard verbietet wesentliche Funktion, die **nur** in einer Leinwand lebt (§8.6,
// §21.3, §32). Eine Ablagezone, die **nur als Pixel** existiert, ist für einen Screenreader nicht vorhanden —
// *und das ist ein Befund, kein Detail*. Deshalb trägt dieser Vertrag eine **View-Phase** (`WhiteboardDropZoneView`),
// die die Ansicht in **echtes DOM** übersetzt: Zeichen, Rahmenform, Überschrift, Wörter.
//
// ## Zustände ohne Farbe
//
// Jede View-Phase trägt **drei** sichtbare Achsen: ein **Zeichen** (`glyph`), eine **Form** (`pattern`, die
// Rahmenart) und **Wörter** (`headline`). Eine Farbe ist **keine** davon — *wer allein auf einen Farbton zeigt,
// hat für Farbenblinde keinen Zustand, sondern gleich aussehende Flächen*.
//
// ## Eine View-Phase ist **abgeleitet**, nicht gespeichert
//
// Das Urteil selbst gehört Paket 6 (`DropTargetState`: `verdict` **neben** der Phase, mit benanntem `reason` und
// benannter `preview`). Eine zweite gespeicherte Phasenangabe wäre **zwei Felder für eine Tatsache** — genau der
// Defekt, den diese Sitzung bei fünf Anwendungen gejagt hat. `whiteboardDropZoneView` **rechnet** die View-Phase
// deshalb aus den Tatsachen aus; sie steht nie daneben.
//
// ## Die Wörter sind **eine** Definition
//
// Die Absichts-Wörter und die Objektart-Wörter werden **wiederverwendet** (`shell/i18n/fabricGraphLocale.ts`,
// `objectType`, elf Arten, `transfer.PasteCopy` / `transfer.LiveLink`) — nicht ein zweites Mal geschrieben.
import { WorkspaceInteractionError } from '../../../shared/workspace-interaction';
import type {
  WorkspaceDropIntent,
  WorkspaceInteractionErrorCode,
  WorkspaceObjectDescriptor,
  WorkspaceObjectKind,
} from '../../../shared/workspace-interaction';
import type { WorkspaceIntegrationKind, WorkspaceLiveMode } from '../../../shared/workspace-interaction';
import type { DropRejectReason, DropTargetState } from '../../../shell/workspace/drag/dragDropVerdict';
import type { DragEndReason } from '../../../shell/workspace/drag/dragSession';
import { FABRIC_GRAPH_COPY } from '../../../shell/i18n/fabricGraphLocale';

/**
 * Die **View-Phase** — der Zustand, den die Ansicht aus den Tatsachen ableitet.
 *
 *   * `closed`   — kein Zug über der Fläche; die Ansicht rendert **nur** die Ansageregion (die bleibt stehen).
 *   * `open`     — ein Zug ist über der Fläche, aber **abgelehnt** (Träger unlesbar oder keine Route).
 *   * `ready`    — das Urteil (Paket 6) sagt `accept`; die Matrix bietet **genau eine** Absicht an.
 *   * `choice`   — das Urteil sagt `accept`; die Matrix bietet **mehrere** Absichten an → ohne Wahl wird nichts abgelegt.
 *   * `refused`  — die Ablage ist **benannt** abgelehnt (Grund aus der Matrix oder lokal).
 *   * `resolved` — **zugestellt** (Adapter, Absicht, beide Versionen).
 */
export type WhiteboardDropZoneView = 'closed' | 'open' | 'ready' | 'choice' | 'refused' | 'resolved';

/**
 * Die Gründe, die **diese** Fläche selbst kennt — alles andere kommt aus den vorhandenen Vokabularen:
 * `WorkspaceInteractionErrorCode` (Matrix/Parser/Resolver) und `DropRejectReason` (Ablageurteil, Paket 6).
 * *Eine zweite Fehlerliste über dieselbe Frage wäre eine zweite Wahrheit.*
 */
export type WhiteboardDropZoneLocalRefusal =
  | 'whiteboard-drop-transfer-missing'
  | 'whiteboard-drop-transfer-unreadable'
  | 'whiteboard-drop-target-missing'
  | 'whiteboard-drop-inactive'
  | 'whiteboard-drop-already-decided'
  | 'whiteboard-drop-command-unknown';

/** Der **benannte** Grund einer Ablehnung: bestehende Vokabulare zuerst, die eigenen danach. */
export type WhiteboardDropZoneRefusal =
  | WorkspaceInteractionErrorCode
  | DropRejectReason
  | WhiteboardDropZoneLocalRefusal;

/**
 * Warum die Zone wieder **schließt**. Zwei Gründe sind **wiederverwendet**: `pointer-lost` und `window-blur`
 * sind die Abbruchgründe der Zieh-Session (Paket 5) — *ein Touch, den das System abbricht, kommt als
 * `pointercancel` und damit als `pointer-lost`, nicht als eigene Erfindung*.
 */
export type WhiteboardDropZoneCloseReason =
  | 'drag-left'
  | 'keyboard-dismiss'
  | Extract<DragEndReason, 'pointer-lost' | 'window-blur'>;

/** Eine wählbare Absicht — mit der Taste, die sie **ohne Zeiger** wählt. */
export interface WhiteboardDropChoice {
  readonly intent: WorkspaceDropIntent;
  readonly label: string;
  readonly adapterId: string;
  /** Die Ziffer, die diese Absicht wählt — *eine Ziffer lässt sich ansagen, eine Mausgeste nicht*. */
  readonly key: string;
  readonly shortcutLabel: string;
}

/** Was **wirklich** zugestellt wurde — Adapter, Absicht, Behandlungsart, Modus, beide Versionen. */
export interface WhiteboardDropResolution {
  readonly adapterId: string;
  readonly intent: WorkspaceDropIntent;
  /**
   * **Paket 15 — die neue Tatsache** ✓: `copy` = eigenständige Kopie, `live` = Verweis auf die Quelle.
   * *Ohne sie verspräche eine Live-Route etwas, das die Zustellung nicht ausdrücken konnte* ✗.
   */
  readonly integrationKind: WorkspaceIntegrationKind;
  /**
   * **Nur** bei `integrationKind: 'live'` ✓ — und dann **nur**, wenn er ausdrücklich angefordert wurde ✓✓.
   * *Bei einer Kopie ist die **Abwesenheit** die Aussage* ✓; ein gesetzter Modus wäre dort eine Erfindung ✗.
   */
  readonly mode?: WorkspaceLiveMode;
  readonly sourceDocumentId: string;
  readonly sourceObjectId: string;
  readonly targetDocumentId: string;
  readonly sourceVersion: number;
  readonly targetVersion: number;
}

/**
 * Der Träger, wie er **gelesen** wurde — oder **benannt** nicht lesbar. `unreadable` heißt: das
 * Übertragungsobjekt war da, aber der **eine** Parser (Paket 7) hat es abgelehnt; der Code ist **seiner**.
 */
export type WhiteboardDropTransferRead =
  | { readonly ok: true; readonly payload: string; readonly descriptor: WorkspaceObjectDescriptor; readonly reason?: never }
  | { readonly ok: false; readonly reason: WhiteboardDropZoneRefusal; readonly payload?: never; readonly descriptor?: never };

/**
 * Was die **Zustellung** ergeben hat (der Resolver, Paket 4) — `none`, solange nichts abgelegt wurde.
 * *Ein stiller Erfolg wäre ein `none`, das wie ein `delivered` aussieht; deshalb steht hier der Grund.*
 */
export type WhiteboardDropDecision =
  | { readonly kind: 'none' }
  | { readonly kind: 'choice'; readonly choices: readonly WhiteboardDropChoice[] }
  | { readonly kind: 'refused'; readonly code: WhiteboardDropZoneRefusal }
  | { readonly kind: 'delivered'; readonly resolution: WhiteboardDropResolution };

export interface WhiteboardDropZoneState {
  /**
   * **Das Ablageurteil (Paket 6)** — `verdict` **neben** der Phase, mit benanntem `reason` und benannter
   * `preview.label`. Dieses Modul **erfindet** kein Urteil; es **liest** seines.
   */
  readonly target: DropTargetState;
  /** Was getragen wird — gelesen oder benannt nicht lesbar. */
  readonly transfer: WhiteboardDropTransferRead;
  /** Was der Resolver entschieden hat. */
  readonly decision: WhiteboardDropDecision;
  /** Der Grund des letzten Schließens — auch geschlossen **benannt**. */
  readonly closedReason: WhiteboardDropZoneCloseReason | null;
}

/**
 * **Dieselbe Form wie `DragStep`** (Paket 5) — eine Ursache, eine Behebung.
 *
 * `ok: false` heißt: **der Aufruf** war unbrauchbar (kein Träger, unbekannter Befehl, geschlossene Zone).
 * Eine **Ablehnung der Matrix** ist dagegen ein gültiger Zustandsübergang — der Zustand trägt den Grund sichtbar.
 */
export type WhiteboardDropZoneStep =
  | { readonly ok: true; readonly state: WhiteboardDropZoneState; readonly reason?: never }
  | { readonly ok: false; readonly reason: WhiteboardDropZoneRefusal; readonly state: WhiteboardDropZoneState };

/**
 * Die **Tastatur als Absicht**: ein Befehl, der **dieselbe** Zustellung ausführt wie die Ablage.
 * *Eine Ablagezone, die man nur mit dem Zeiger bestätigen kann, ist auf einer Leinwand ein Befund.*
 */
export type WhiteboardDropCommand =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'choose'; readonly intent: WorkspaceDropIntent }
  | { readonly kind: 'dismiss' };

/** Warum eine Taste **kein** Befehl ist — benannt, damit aus einem Tastendruck kein stiller No-op wird. */
export type WhiteboardDropCommandStep =
  | { readonly ok: true; readonly command: WhiteboardDropCommand; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'whiteboard-drop-key-unbound'; readonly command?: never };

/** Die Präsentation je View-Phase — **erschöpfend** typisiert: eine neue Phase fällt beim Bauen auf. */
export interface WhiteboardDropZonePresentation {
  readonly glyph: string;
  readonly pattern: 'none' | 'dashed' | 'solid' | 'double';
  readonly headline: string;
}

export const WHITEBOARD_DROP_ZONE_PRESENTATION: Readonly<Record<WhiteboardDropZoneView, WhiteboardDropZonePresentation>> = Object.freeze({
  closed: { glyph: '', pattern: 'none', headline: '' },
  open: { glyph: '↓', pattern: 'dashed', headline: 'Whiteboard drop zone: a drag is over the board' },
  ready: { glyph: '⊞', pattern: 'solid', headline: 'Whiteboard drop zone: ready to place' },
  choice: { glyph: '?', pattern: 'double', headline: 'Whiteboard drop zone: choose an intent' },
  refused: { glyph: '!', pattern: 'dashed', headline: 'Whiteboard drop zone: drop refused' },
  resolved: { glyph: '✓', pattern: 'solid', headline: 'Whiteboard drop zone: placed' },
});

/** Der sichtbare Satz zu jedem **eigenen** Grund — erschöpfend: ein neuer lokaler Grund bricht hier den Bau. */
const WHITEBOARD_DROP_ZONE_LOCAL_REFUSAL_TEXT: Readonly<Record<WhiteboardDropZoneLocalRefusal, string>> = Object.freeze({
  'whiteboard-drop-transfer-missing': 'No workspace object was handed over.',
  'whiteboard-drop-transfer-unreadable': 'The drag surface does not hand over its content.',
  'whiteboard-drop-target-missing': 'This surface does not know its own target (app or document).',
  'whiteboard-drop-inactive': 'The drop zone is not open.',
  'whiteboard-drop-already-decided': 'This drop is already decided.',
  'whiteboard-drop-command-unknown': 'The drop machine does not know this command.',
});

/**
 * Der sichtbare Satz zu jedem Grund des **Ablageurteils** (Paket 6) — erschöpfend über `DropRejectReason`.
 * Die Codes selbst sind eine Definition in Paket 6; *hier stehen nur die Wörter, weil Paket 6 keine führt*.
 */
const WHITEBOARD_DROP_VERDICT_REFUSAL_TEXT: Readonly<Record<DropRejectReason, string>> = Object.freeze({
  'object-kind-unknown': 'The carried object kind is unknown (or the carried object could not be read).',
  'intent-unknown': 'The carried intent is unknown.',
  'route-not-capable': 'No registered route accepts this object at the Whiteboard.',
  'payload-missing': 'The carried object is missing.',
  'verdict-unavailable': 'The capability question could not be answered; the drop is refused.',
});

const LOCAL_REFUSALS: Readonly<Record<string, string>> = WHITEBOARD_DROP_ZONE_LOCAL_REFUSAL_TEXT;
const VERDICT_REFUSALS: Readonly<Record<string, string>> = WHITEBOARD_DROP_VERDICT_REFUSAL_TEXT;

/**
 * Der sichtbare Satz zu einem benannten Grund — **eine** Definition für alle Oberflächen.
 *
 * Für die Codes der Matrix und des Parsers wird **kein** zweites Wörterbuch angelegt: `WorkspaceInteractionError`
 * trägt zu **jedem** Code seinen Satz (`ERROR_MESSAGES`), und diese Nachricht ist bereits die eine Definition.
 * Ein zweites Wörterbuch hier wäre eine zweite Wahrheit über dieselben 30 Codes.
 */
export function whiteboardDropRefusalText(code: WhiteboardDropZoneRefusal): string {
  const local = LOCAL_REFUSALS[code];
  if (local !== undefined) return local;
  const verdict = VERDICT_REFUSALS[code];
  if (verdict !== undefined) return verdict;
  try {
    return new WorkspaceInteractionError(code as WorkspaceInteractionErrorCode).message;
  } catch {
    return String(code);
  }
}

/** Die Absichts-Wörter — **wiederverwendet** aus der Fabric-Oberfläche, nicht neu geschrieben. */
export const WHITEBOARD_DROP_INTENT_LABEL: Readonly<Record<WorkspaceDropIntent, string>> = Object.freeze({
  COPY: FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy,
  LIVE_REFERENCE: FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink,
  FROZEN_SNAPSHOT: 'Frozen snapshot',
  MOVE: 'Move',
});

/** Die Objektart-Wörter — **wiederverwendet** aus der Fabric-Oberfläche (elf Arten), nicht neu geschrieben. */
export function whiteboardDropObjectKindLabel(kind: WorkspaceObjectKind): string {
  return FABRIC_GRAPH_COPY['en-US'].objectType[kind];
}

/**
 * Die sichtbare Vorschau — **der Text kommt aus dem Urteil** (Paket 6, `preview.label`) und wird hier **wörtlich**
 * durchgereicht. *Wer die Vorschau neu formuliert, hat zwei Vorschauen über eine Ablage.*
 */
export function whiteboardDropPreviewLabel(state: WhiteboardDropZoneState): string | null {
  return state.target.preview === null ? null : state.target.preview.label;
}

export const WHITEBOARD_DROP_ZONE_TITLE = 'Whiteboard workspace drop zone';
export const WHITEBOARD_DROP_ZONE_CONFIRM_LABEL = 'Place here';
export const WHITEBOARD_DROP_ZONE_DISMISS_LABEL = 'Dismiss';
export const WHITEBOARD_DROP_ZONE_KEY_HINT = 'Keyboard: Enter places · 1–4 chooses the intent · Esc dismisses';
/** Die Ansage des leeren Zustands — die Region steht **immer** im DOM, damit die Ansage eine Änderung ist. */
export const WHITEBOARD_DROP_ZONE_IDLE_ANNOUNCEMENT = 'No workspace object is being carried over the Whiteboard.';
