// STATUS: PLATIN — Integration & Release, **Paket 14**: Vokabular und Vertrag der Draw-Ablagezone
//
// ## Warum Vokabular und Regeln getrennt liegen
//
// Dieses Modul **benennt** — Zustände, Gründe, Wörter, Formen. Es **entscheidet nichts**. Die Regeln stehen in
// `drawDropZone.ts`. *Wer Wörter und Regeln in eine Datei legt, kann den Vertrag nicht mehr prüfen, ohne die
// Regel zu laden.* Dieselbe Trennung wie in Paket 9/10/11/12/13.
//
// ## Der Draw-Sonderfall: die annehmende Fläche ist eine **Leinwand**
//
// Der verbindliche UI/UX-Standard verbietet wesentliche Funktion, die **nur** in einer Leinwand lebt (§8.6,
// §21.3, §32). Die Draw-Fläche ist sogar eine **SVG-Anwendung** (`DrawInteractiveSurface`, `role="application"`,
// `touch-none` für das Zeichnen mit dem Finger). Eine Ablagezone, die **nur als Pixel** existiert, ist für einen
// Screenreader nicht vorhanden — *und das ist ein Befund, kein Detail*. Deshalb trägt dieser Vertrag eine
// **View-Phase** (`DrawDropZoneView`), die die Ansicht in **echtes DOM** übersetzt: Zeichen, Rahmenform,
// Überschrift, Wörter, echte Knöpfe, eine dauerhaft vorhandene Ansageregion.
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
// benannter `preview`). Eine zweite gespeicherte Phasenangabe wäre **zwei Felder für eine Tatsache**.
// `drawDropZoneView` **rechnet** die View-Phase deshalb aus den Tatsachen aus; sie steht nie daneben.
//
// ## Warum hier `routed` steht und nicht `delivered`
//
// Der Resolver sagt es **selbst** (`workspaceInteractionResolver.ts:105`): *„Resolves a semantic target route
// only. It does not mutate or persist either document."* Eine Fläche, die danach „zugestellt" anzeigt, hätte
// mehr behauptet, als geschehen ist — *und genau das ist der stille Erfolg, den dieses Paket verbietet*. Die
// Entscheidung heißt deshalb `routed` (`DrawDropRoute`) und die Auflösungszeile „Route resolved via …" mit den
// **gelesenen** Versionen. *Die Einfügung selbst ist nicht Teil dieses Pakets und wird nicht behauptet.*
//
// ## Die Wörter sind **eine** Definition
//
// Die Absichts-Wörter und die Objektart-Wörter werden **wiederverwendet** (`shell/i18n/fabricGraphLocale.ts`,
// `transfer.PasteCopy` / `transfer.LiveLink`, `objectType`, elf Arten) — nicht ein zweites Mal geschrieben.
import { WorkspaceInteractionError } from '../../../shared/workspace-interaction';
import type {
  WorkspaceDropIntent,
  WorkspaceIntegrationKind,
  WorkspaceInteractionErrorCode,
  WorkspaceLiveMode,
  WorkspaceObjectDescriptor,
  WorkspaceObjectKind,
} from '../../../shared/workspace-interaction';
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
 *   * `resolved` — die **Route** ist aufgelöst (Adapter, Absicht, beide gelesenen Versionen).
 */
export type DrawDropZoneView = 'closed' | 'open' | 'ready' | 'choice' | 'refused' | 'resolved';

/**
 * Die Gründe, die **diese** Fläche selbst kennt — alles andere kommt aus den vorhandenen Vokabularen:
 * `WorkspaceInteractionErrorCode` (Matrix/Parser/Resolver) und `DropRejectReason` (Ablageurteil, Paket 6).
 * *Eine zweite Fehlerliste über dieselbe Frage wäre eine zweite Wahrheit.*
 */
export type DrawDropZoneLocalRefusal =
  | 'draw-drop-transfer-missing'
  | 'draw-drop-transfer-unreadable'
  | 'draw-drop-target-missing'
  | 'draw-drop-inactive'
  | 'draw-drop-already-decided'
  | 'draw-drop-command-unknown'
  | 'draw-drop-key-unbound';

/** Der **benannte** Grund einer Ablehnung: bestehende Vokabulare zuerst, die eigenen danach. */
export type DrawDropZoneRefusal =
  | WorkspaceInteractionErrorCode
  | DropRejectReason
  | DrawDropZoneLocalRefusal;

/**
 * Warum die Zone wieder **schließt**. Zwei Gründe sind **wiederverwendet**: `pointer-lost` und `window-blur`
 * sind die Abbruchgründe der Zieh-Session (Paket 5) — *ein Touch, den das System abbricht, kommt als
 * `pointercancel` und damit als `pointer-lost`, nicht als eigene Erfindung*.
 */
export type DrawDropZoneCloseReason =
  | 'drag-left'
  | 'keyboard-dismiss'
  | Extract<DragEndReason, 'pointer-lost' | 'window-blur'>;

/** Eine wählbare Absicht — mit der Taste, die sie **ohne Zeiger** wählt. */
export interface DrawDropChoice {
  readonly intent: WorkspaceDropIntent;
  readonly label: string;
  readonly adapterId: string;
  /** Die Ziffer, die diese Absicht wählt — *eine Ziffer lässt sich ansagen, eine Mausgeste nicht*. */
  readonly key: string;
  readonly shortcutLabel: string;
}

/**
 * Was der Resolver **aufgelöst** hat — Adapter, Absicht, beide Kennungen und die **gelesenen** Versionen.
 *
 * Der Name ist die Aussage: `workspaceInteractionResolver.ts:105` stellt fest, dass der Resolver **kein**
 * Dokument verändert. *Ein Feld namens „delivered" hätte hier eine Einfügung behauptet.*
 */
export interface DrawDropRoute {
  readonly adapterId: string;
  readonly intent: WorkspaceDropIntent;
  /**
   * **Paket 15 (AST-1948):** wie die Zustellung die Quelle behandelt — `COPY` → `copy`, `LIVE_REFERENCE` → `live`.
   * *Eine Live-Route ohne diese Angabe hätte einen Modus versprochen, den die Zustellung nicht ausdrückt.*
   */
  readonly integrationKind: WorkspaceIntegrationKind;
  /**
   * **Nur** bei `integrationKind: 'live'` — und dann **nur**, wenn er **gesagt** wurde (`requestedMode`).
   *
   * *Kein heimlicher Default:* bei einer Kopie fehlt das Feld **ganz** (nicht `undefined`), und ein Live-Verweis
   * **ohne** Angabe kommt gar nicht erst zur Zustellung (`drop_live_mode_required`).
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
export type DrawDropTransferRead =
  | { readonly ok: true; readonly payload: string; readonly descriptor: WorkspaceObjectDescriptor; readonly reason?: never }
  | { readonly ok: false; readonly reason: DrawDropZoneRefusal; readonly payload?: never; readonly descriptor?: never };

/**
 * Was die **Auflösung** ergeben hat (der Resolver, Paket 4) — `none`, solange nichts abgelegt wurde.
 * *Ein stiller Erfolg wäre ein `none`, das wie ein `routed` aussieht; deshalb steht hier der Grund.*
 */
export type DrawDropDecision =
  | { readonly kind: 'none' }
  | { readonly kind: 'choice'; readonly choices: readonly DrawDropChoice[] }
  | { readonly kind: 'refused'; readonly code: DrawDropZoneRefusal }
  | { readonly kind: 'routed'; readonly route: DrawDropRoute };

export interface DrawDropZoneState {
  /**
   * **Das Ablageurteil (Paket 6)** — `verdict` **neben** der Phase, mit benanntem `reason` und benannter
   * `preview.label`. Dieses Modul **erfindet** kein Urteil; es **liest** eines.
   */
  readonly target: DropTargetState;
  /** Was getragen wird — gelesen oder benannt nicht lesbar. */
  readonly transfer: DrawDropTransferRead;
  /** Was der Resolver entschieden hat. */
  readonly decision: DrawDropDecision;
  /** Der Grund des letzten Schließens — auch geschlossen **benannt**. */
  readonly closedReason: DrawDropZoneCloseReason | null;
}

/**
 * **Dieselbe Form wie `DragStep`** (Paket 5) — eine Ursache, eine Behebung.
 *
 * `ok: false` heißt: **der Aufruf** war unbrauchbar (kein Träger, unbekannter Befehl, geschlossene Zone).
 * Eine **Ablehnung der Matrix** ist dagegen ein gültiger Zustandsübergang — der Zustand trägt den Grund sichtbar.
 */
export type DrawDropZoneStep =
  | { readonly ok: true; readonly state: DrawDropZoneState; readonly reason?: never }
  | { readonly ok: false; readonly reason: DrawDropZoneRefusal; readonly state: DrawDropZoneState };

/**
 * Die **Tastatur als Absicht**: ein Befehl, der **dieselbe** Auflösung ausführt wie die Ablage.
 * *Eine Ablagezone, die man nur mit dem Zeiger bestätigen kann, ist auf einer Leinwand ein Befund.*
 */
export type DrawDropCommand =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'choose'; readonly intent: WorkspaceDropIntent }
  | { readonly kind: 'dismiss' };

/** Warum eine Taste **kein** Befehl ist — benannt, damit aus einem Tastendruck kein stiller No-op wird. */
export type DrawDropCommandStep =
  | { readonly ok: true; readonly command: DrawDropCommand; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'draw-drop-key-unbound'; readonly command?: never };

/** Die Präsentation je View-Phase — **erschöpfend** typisiert: eine neue Phase fällt beim Bauen auf. */
export interface DrawDropZonePresentation {
  readonly glyph: string;
  readonly pattern: 'none' | 'dashed' | 'solid' | 'double';
  readonly headline: string;
}

export const DRAW_DROP_ZONE_PRESENTATION: Readonly<Record<DrawDropZoneView, DrawDropZonePresentation>> = Object.freeze({
  closed: { glyph: '', pattern: 'none', headline: '' },
  open: { glyph: '↓', pattern: 'dashed', headline: 'Draw drop zone: a drag is over the drawing' },
  ready: { glyph: '⊞', pattern: 'solid', headline: 'Draw drop zone: ready to route onto the drawing' },
  choice: { glyph: '?', pattern: 'double', headline: 'Draw drop zone: choose an intent' },
  refused: { glyph: '!', pattern: 'double', headline: 'Draw drop zone: drop refused' },
  resolved: { glyph: '✓', pattern: 'solid', headline: 'Draw drop zone: route resolved' },
});

/** Der sichtbare Satz zu jedem **eigenen** Grund — erschöpfend: ein neuer lokaler Grund bricht hier den Bau. */
const DRAW_DROP_ZONE_LOCAL_REFUSAL_TEXT: Readonly<Record<DrawDropZoneLocalRefusal, string>> = Object.freeze({
  'draw-drop-transfer-missing': 'No workspace object is being carried.',
  'draw-drop-transfer-unreadable': 'The drag surface does not hand over its content.',
  'draw-drop-target-missing': 'This surface does not know its own target (app or document).',
  'draw-drop-inactive': 'The drop zone is not open.',
  'draw-drop-already-decided': 'This drop is already decided.',
  'draw-drop-command-unknown': 'The drop machine does not know this command.',
  'draw-drop-key-unbound': 'This key is not bound to a drop command.',
});

/**
 * Der sichtbare Satz zu jedem Grund des **Ablageurteils** (Paket 6) — erschöpfend über `DropRejectReason`.
 * Die Codes selbst sind eine Definition in Paket 6; *hier stehen nur die Wörter, weil Paket 6 keine führt*.
 */
const DRAW_DROP_VERDICT_REFUSAL_TEXT: Readonly<Record<DropRejectReason, string>> = Object.freeze({
  'object-kind-unknown': 'The carried object kind is unknown (or the carried object could not be read).',
  'intent-unknown': 'The carried intent is unknown.',
  'route-not-capable': 'No registered route accepts this object at the Draw canvas.',
  'payload-missing': 'The carried object is missing.',
  'verdict-unavailable': 'The capability question could not be answered; the drop is refused.',
});

const LOCAL_REFUSALS: Readonly<Record<string, string>> = DRAW_DROP_ZONE_LOCAL_REFUSAL_TEXT;
const VERDICT_REFUSALS: Readonly<Record<string, string>> = DRAW_DROP_VERDICT_REFUSAL_TEXT;

/**
 * Der sichtbare Satz zu einem benannten Grund — **eine** Definition für alle Oberflächen.
 *
 * Für die Codes der Matrix und des Parsers wird **kein** zweites Wörterbuch angelegt: `WorkspaceInteractionError`
 * trägt zu **jedem** Code seinen Satz (`ERROR_MESSAGES`), und diese Nachricht ist bereits die eine Definition.
 * Ein zweites Wörterbuch hier wäre eine zweite Wahrheit über dieselben 30 Codes.
 */
export function drawDropRefusalText(code: DrawDropZoneRefusal): string {
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
export const DRAW_DROP_INTENT_LABEL: Readonly<Record<WorkspaceDropIntent, string>> = Object.freeze({
  COPY: FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy,
  LIVE_REFERENCE: FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink,
  FROZEN_SNAPSHOT: 'Frozen snapshot',
  MOVE: 'Move',
});

/** Die Objektart-Wörter — **wiederverwendet** aus der Fabric-Oberfläche (elf Arten), nicht neu geschrieben. */
export function drawDropObjectKindLabel(kind: WorkspaceObjectKind): string {
  return FABRIC_GRAPH_COPY['en-US'].objectType[kind];
}

/**
 * Die sichtbare Vorschau — **der Text kommt aus dem Urteil** (Paket 6, `preview.label`) und wird hier **wörtlich**
 * durchgereicht. *Wer die Vorschau neu formuliert, hat zwei Vorschauen über eine Ablage.*
 */
export function drawDropPreviewLabel(state: DrawDropZoneState): string | null {
  return state.target.preview === null ? null : state.target.preview.label;
}

/** Die Kennung der **einen** Ansageregion dieser Fläche — sie wird von der Fläche beschrieben (`aria-describedby`). */
export const DRAW_DROP_ZONE_ANNOUNCER_ID = 'draw-drop-zone-announcer';
export const DRAW_DROP_ZONE_TITLE = 'Draw workspace drop zone';
/** Die Fläche als **Wort** — die Leinwand, nicht ein Ort im Pixel. */
export const DRAW_DROP_ZONE_SURFACE_LABEL = 'Drawing canvas';
export const DRAW_DROP_ZONE_CONFIRM_LABEL = 'Route here';
export const DRAW_DROP_ZONE_DISMISS_LABEL = 'Dismiss';
export const DRAW_DROP_ZONE_KEY_HINT = 'Keyboard: Enter routes · 1–4 chooses the intent · Esc dismisses';
/** Die Ansage des leeren Zustands — die Region steht **immer** im DOM, damit die Ansage eine Änderung ist. */
export const DRAW_DROP_ZONE_IDLE_ANNOUNCEMENT = 'No workspace object is being carried over the Draw canvas.';
