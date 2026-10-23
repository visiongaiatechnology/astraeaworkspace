// STATUS: PLATIN — Integration & Release, **Paket 12**: Vokabular und Vertrag der Notes-Ablagezone
//
// ## Warum Vokabular und Regeln getrennt liegen
//
// Dieses Modul **benennt** — Flächen, Zustände, Gründe, Wörter, Formen. Es **entscheidet nichts**. Die Regeln
// stehen in `notesDropZone.ts`, die Touch-Entscheidungen in `notesDropZoneTouch.ts`. *Wer Wörter und Regeln in
// eine Datei legt, kann den Vertrag nicht mehr prüfen, ohne die Regel zu laden.*
//
// ## Notes hat **zwei** benannte Flächen — und das ist keine zweite Regel
//
// Die Zusage des Pakets lautet: „während eines Zuges zeigt die Notes-Fläche — **die Leinwand und die Seitenliste** —
// ein sichtbares, angesagtes Ablageziel". Deshalb gibt es hier **eine** Liste der Flächen
// (`NOTES_DROP_ZONE_SURFACES`) und **eine** Beschriftung je Fläche — und **eine** Zustandsmaschine, die **eine**
// Fläche zur Zeit führt (`state.surface`). *Zwei Maschinen für dieselbe Zustellung wären zwei Wahrheiten.*
//
// ## Zustände ohne Farbe
//
// Jede View-Phase trägt **drei** sichtbare Achsen: ein **Zeichen** (`glyph`), eine **Form** (`pattern`, die
// Rahmenart) und **Wörter** (`headline`). Eine Farbe ist **keine** davon — *wer allein auf einen Farbton zeigt, hat
// für Farbenblinde keinen Zustand, sondern gleich aussehende Flächen*.
//
// ## Die Wörter sind **eine** Definition
//
// Die Absichts-Wörter (`COPY`, `LIVE_REFERENCE`) und die Objektart-Wörter (elf Arten) werden **wiederverwendet**
// (`shell/i18n/fabricGraphLocale.ts`) — nicht ein zweites Mal geschrieben. Für `MOVE` und `FROZEN_SNAPSHOT` führt
// die vorhandene Fabric-Oberfläche **kein** Wort; die zwei fehlenden sind hier benannt und als solche markiert.
// Die Sätze der Matrix- und Parser-Codes kommen aus `WorkspaceInteractionError` **selbst** — *ein zweites
// Wörterbuch über dieselben 30 Codes wäre eine zweite Wahrheit*.
import type { WorkspaceDropIntent, WorkspaceIntegrationKind, WorkspaceInteractionErrorCode, WorkspaceLiveMode, WorkspaceObjectDescriptor, WorkspaceObjectKind } from '../../../shared/workspace-interaction';
import { WORKSPACE_DROP_INTENTS, WorkspaceInteractionError } from '../../../shared/workspace-interaction';
import { FABRIC_GRAPH_COPY } from '../../../shell/i18n/fabricGraphLocale';
import type { DragEndReason } from '../../../shell/workspace/drag/dragSession';
import type { DropRejectReason, DropPreview, DropTargetState } from '../../../shell/workspace/drag/dragDropVerdict';

/**
 * **Die benannten Flächen der Notes-Oberfläche** — es gibt genau diese zwei, und beide werden gebunden
 * (`NotesEditorNavigation.tsx` / `NotesEditorBody.tsx`). *Eine dritte Fläche ohne Eintrag hier wäre im Markup
 * nicht adressierbar — und die Maschine lehnt einen unbekannten Namen **benannt** ab.*
 */
export const NOTES_DROP_ZONE_SURFACES = ['canvas', 'page-list'] as const;

export type NotesDropZoneSurface = (typeof NOTES_DROP_ZONE_SURFACES)[number];

/** Die **eine** Prüfung eines Flächennamens — sie liest die Liste oben, statt sie zu wiederholen. */
export function isNotesDropZoneSurface(value: unknown): value is NotesDropZoneSurface {
  return typeof value === 'string' && (NOTES_DROP_ZONE_SURFACES as readonly string[]).includes(value);
}

/** Das sichtbare Wort je Fläche — es steht in der Ansage, im `aria-label` und im `data`-Attribut. */
export const NOTES_DROP_ZONE_SURFACE_LABEL: Readonly<Record<NotesDropZoneSurface, string>> = Object.freeze({
  canvas: 'Notes canvas',
  'page-list': 'Notes page list',
});

/**
 * Die **View-Phase** — der Zustand, den die Ansicht aus den Tatsachen ableitet.
 *
 *   * `closed`   — kein Zug über **dieser** Fläche; die Ansicht rendert **nur** die Ansageregion (die bleibt stehen).
 *   * `open`     — ein Zug ist über der Fläche, aber **abgelehnt** (Träger unlesbar oder keine Route).
 *   * `ready`    — das Urteil (Paket 6) sagt `accept`; die Matrix bietet **genau eine** Absicht an.
 *   * `choice`   — das Urteil sagt `accept`; die Matrix bietet **mehrere** Absichten an → ohne Wahl wird nichts abgelegt.
 *   * `refused`  — die Ablage ist **benannt** abgelehnt (Grund aus der Matrix oder lokal).
 *   * `resolved` — **zugestellt** (Adapter, Absicht, beide Versionen).
 */
export type NotesDropZoneView = 'closed' | 'open' | 'ready' | 'choice' | 'refused' | 'resolved';

/**
 * Die Gründe, die **diese** Fläche selbst kennt — alles andere kommt aus den vorhandenen Vokabularen:
 * `WorkspaceInteractionErrorCode` (Matrix/Parser/Resolver) und `DropRejectReason` (Ablageurteil, Paket 6).
 * *Eine zweite Fehlerliste über dieselbe Frage wäre eine zweite Wahrheit.*
 */
export type NotesDropZoneLocalRefusal =
  | 'notes-drop-transfer-missing'
  | 'notes-drop-transfer-unreadable'
  | 'notes-drop-target-missing'
  | 'notes-drop-surface-unknown'
  | 'notes-drop-surface-mismatch'
  | 'notes-drop-inactive'
  | 'notes-drop-already-decided'
  | 'notes-drop-command-unknown'
  | 'notes-drop-key-unbound';

/** Der **benannte** Grund einer Ablehnung: bestehende Vokabulare zuerst, die eigenen danach. */
export type NotesDropZoneRefusal = WorkspaceInteractionErrorCode | DropRejectReason | NotesDropZoneLocalRefusal;

/**
 * Warum die Zone wieder **schließt**. Zwei Gründe sind **wiederverwendet**: `pointer-lost` und `window-blur` sind
 * die Abbruchgründe der Zieh-Session (Paket 5) — *ein Touch, den das System abbricht, kommt als `pointercancel`
 * und damit als `pointer-lost`, nicht als eigene Erfindung*.
 */
export type NotesDropZoneCloseReason =
  | 'drag-left'
  | 'keyboard-dismiss'
  | Extract<DragEndReason, 'pointer-lost' | 'window-blur'>;

/** Eine wählbare Absicht — mit der Taste, die sie **ohne Zeiger** wählt. */
export interface NotesDropChoice {
  readonly intent: WorkspaceDropIntent;
  readonly label: string;
  readonly adapterId: string;
  /** Die Ziffer, die diese Absicht wählt — *eine Ziffer lässt sich ansagen, eine Mausgeste nicht*. */
  readonly key: string;
  readonly shortcutLabel: string;
}

/**
 * Was **wirklich** zugestellt wurde — Adapter, Absicht, beide Versionen.
 *
 * **Paket 15:** die Zustellung trägt jetzt **`integrationKind`** (`copy` / `live`) und — **nur bei `live`** — den
 * **gesagten** `mode` (`Live` / `Frozen`). *Beides sind Tatsachen des Resolvers, nicht der Anzeige*: der Modus
 * wird **gewählt**, nie angenommen (kein heimlicher Default). Bei `copy` **fehlt** er deshalb — bedingtes Spreizen,
 * weil das Projekt `exactOptionalPropertyTypes` anhat.
 */
export interface NotesDropResolution {
  readonly adapterId: string;
  readonly intent: WorkspaceDropIntent;
  readonly integrationKind: WorkspaceIntegrationKind;
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
export type NotesDropTransferRead =
  | { readonly ok: true; readonly payload: string; readonly descriptor: WorkspaceObjectDescriptor; readonly reason?: never }
  | { readonly ok: false; readonly reason: NotesDropZoneRefusal; readonly payload?: never; readonly descriptor?: never };

/**
 * Was die **Zustellung** ergeben hat (der Resolver, Paket 4) — `none`, solange nichts abgelegt wurde.
 * *Ein stiller Erfolg wäre ein `none`, das wie ein `delivered` aussieht; deshalb steht hier der Grund.*
 */
export type NotesDropDecision =
  | { readonly kind: 'none' }
  | { readonly kind: 'choice'; readonly choices: readonly NotesDropChoice[] }
  | { readonly kind: 'refused'; readonly code: NotesDropZoneRefusal }
  | { readonly kind: 'delivered'; readonly resolution: NotesDropResolution };

export interface NotesDropZoneState {
  /**
   * **Das Ablageurteil (Paket 6)** — `verdict` **neben** der Phase, mit benanntem `reason` und benannter
   * `preview.label`. Dieses Modul **erfindet** kein Urteil; es **liest** seines.
   */
  readonly target: DropTargetState;
  /** Was getragen wird — gelesen oder benannt nicht lesbar. */
  readonly transfer: NotesDropTransferRead;
  /** Was der Resolver entschieden hat. */
  readonly decision: NotesDropDecision;
  /** **Welche** der beiden benannten Flächen der Zeiger überfährt — `null`, wenn keine. */
  readonly surface: NotesDropZoneSurface | null;
  /** Der Grund des letzten Schließens — auch geschlossen **benannt**. */
  readonly closedReason: NotesDropZoneCloseReason | null;
}

/**
 * **Dieselbe Form wie `DragStep`** (Paket 5) — eine Ursache, eine Behebung.
 *
 * `ok: false` heißt: **der Aufruf** war unbrauchbar (kein Träger, unbekannter Befehl, geschlossene Zone,
 * falsche Fläche). Eine **Ablehnung der Matrix** ist dagegen ein gültiger Zustandsübergang — der Zustand trägt
 * den Grund sichtbar.
 */
export type NotesDropZoneStep =
  | { readonly ok: true; readonly state: NotesDropZoneState; readonly reason?: never }
  | { readonly ok: false; readonly reason: NotesDropZoneRefusal; readonly state: NotesDropZoneState };

/**
 * Die **Tastatur als Absicht**: ein Befehl, der **dieselbe** Zustellung ausführt wie die Ablage.
 * *Eine Ablagezone, die man nur mit dem Zeiger bestätigen kann, ist ein Befund.*
 */
export type NotesDropCommand =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'choose'; readonly intent: WorkspaceDropIntent }
  | { readonly kind: 'dismiss' };

/** Warum eine Taste **kein** Befehl ist — benannt, damit aus einem Tastendruck kein stiller No-op wird. */
export type NotesDropCommandStep =
  | { readonly ok: true; readonly command: NotesDropCommand; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'notes-drop-key-unbound'; readonly command?: never };

/** Die Präsentation je View-Phase — **erschöpfend** typisiert: eine neue Phase fällt beim Bauen auf. */
export interface NotesDropZonePresentation {
  readonly glyph: string;
  readonly pattern: 'none' | 'dashed' | 'solid' | 'double';
  readonly headline: string;
}

export const NOTES_DROP_ZONE_PRESENTATION: Readonly<Record<NotesDropZoneView, NotesDropZonePresentation>> = Object.freeze({
  closed: { glyph: '', pattern: 'none', headline: '' },
  open: { glyph: '↓', pattern: 'dashed', headline: 'Notes drop zone: a drag is over this surface' },
  ready: { glyph: '⊞', pattern: 'solid', headline: 'Notes drop zone: ready to place' },
  choice: { glyph: '?', pattern: 'double', headline: 'Notes drop zone: choose an intent' },
  refused: { glyph: '!', pattern: 'dashed', headline: 'Notes drop zone: drop refused' },
  resolved: { glyph: '✓', pattern: 'solid', headline: 'Notes drop zone: placed' },
});

/** Der sichtbare Satz zu jedem **eigenen** Grund — erschöpfend: ein neuer lokaler Grund bricht hier den Bau. */
const NOTES_DROP_ZONE_LOCAL_REFUSAL_TEXT: Readonly<Record<NotesDropZoneLocalRefusal, string>> = Object.freeze({
  'notes-drop-transfer-missing': 'No workspace object was handed over.',
  'notes-drop-transfer-unreadable': 'The drag surface does not hand over its content.',
  'notes-drop-target-missing': 'This Notes surface does not know its own target (app or document).',
  'notes-drop-surface-unknown': 'This drop zone is not a known Notes surface.',
  'notes-drop-surface-mismatch': 'Another Notes drop zone is under the pointer; this one has no fact to record.',
  'notes-drop-inactive': 'The drop zone is not open.',
  'notes-drop-already-decided': 'This drop is already decided.',
  'notes-drop-command-unknown': 'The drop machine does not know this command.',
  'notes-drop-key-unbound': 'This key is not bound to a drop intent.',
});

/**
 * Der sichtbare Satz zu jedem Grund des **Ablageurteils** (Paket 6) — erschöpfend über `DropRejectReason`.
 * Die Codes selbst sind eine Definition in Paket 6; *hier stehen nur die Wörter, weil Paket 6 keine führt*.
 */
const NOTES_DROP_VERDICT_REFUSAL_TEXT: Readonly<Record<DropRejectReason, string>> = Object.freeze({
  'object-kind-unknown': 'The carried object kind is unknown (or the carried object could not be read).',
  'intent-unknown': 'The carried intent is unknown.',
  'route-not-capable': 'No registered route accepts this object at the Notes document.',
  'payload-missing': 'The carried object is missing.',
  'verdict-unavailable': 'The capability question could not be answered; the drop is refused.',
});

const LOCAL_REFUSALS: Readonly<Record<string, string>> = NOTES_DROP_ZONE_LOCAL_REFUSAL_TEXT;
const VERDICT_REFUSALS: Readonly<Record<string, string>> = NOTES_DROP_VERDICT_REFUSAL_TEXT;

/**
 * Der sichtbare Satz zu einem benannten Grund — **eine** Definition für alle Oberflächen.
 *
 * Für die Codes der Matrix und des Parsers wird **kein** zweites Wörterbuch angelegt: `WorkspaceInteractionError`
 * trägt zu **jedem** Code seinen Satz, und diese Nachricht ist bereits die eine Definition.
 */
export function notesDropRefusalText(code: NotesDropZoneRefusal): string {
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

/**
 * Die Absichts-Wörter — **wiederverwendet** aus der vorhandenen Fabric-Oberfläche. Zwei Absichten (`MOVE`,
 * `FROZEN_SNAPSHOT`) haben dort **kein** Wort; sie sind hier benannt und nicht erfunden.
 */
export const NOTES_DROP_INTENT_LABEL: Readonly<Record<WorkspaceDropIntent, string>> = Object.freeze({
  COPY: FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy,
  LIVE_REFERENCE: FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink,
  FROZEN_SNAPSHOT: 'Frozen snapshot',
  MOVE: 'Move',
});

/** Die Objektart-Wörter — **wiederverwendet** aus der vorhandenen Fabric-Oberfläche (elf Arten). */
export function notesDropObjectKindLabel(kind: WorkspaceObjectKind): string {
  return FABRIC_GRAPH_COPY['en-US'].objectType[kind];
}

/**
 * **Die zwei Modi eines Live-Verweises** (Paket 15) — und ihre Wörter sind **wiederverwendet**, nicht erfunden:
 * `Live` ist das vorhandene Live-Verweis-Wort der Fabric-Oberfläche, `Frozen` das vorhandene Wort der eingefrorenen
 * Momentaufnahme (`NOTES_DROP_INTENT_LABEL.FROZEN_SNAPSHOT`). *Der Modus wird **gewählt**, nie angenommen.*
 */
export const NOTES_DROP_MODE_LABEL: Readonly<Record<WorkspaceLiveMode, string>> = Object.freeze({
  Live: FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink,
  Frozen: 'Frozen snapshot',
});

/**
 * Die Modi, **die die Anzeige anbietet** — abgeleitet aus dem Wort-Register, damit **keine zweite Liste** entsteht:
 * *ein neuer Modus im Resolver bricht dort den Bau (`Record<WorkspaceLiveMode, …>` ist erschöpfend) und bekommt
 * hier von selbst seinen Knopf.*
 */
export const NOTES_DROP_MODES = Object.keys(NOTES_DROP_MODE_LABEL) as readonly WorkspaceLiveMode[];

/**
 * Die Aufforderung, den Modus zu **sagen** — der sichtbare Satz neben den zwei Knöpfen.
 * *Ohne ihn wäre die Modus-Auswahl ein stiller Zwang statt einer Wahl.*
 */
export const NOTES_DROP_MODE_PROMPT = 'Choose the mode of the live reference:';

/**
 * Die sichtbare Vorschau — **der Text kommt aus dem Urteil** (Paket 6, `preview.label`) und wird hier **wörtlich**
 * durchgereicht. *Wer die Vorschau neu formuliert, hat zwei Vorschauen über eine Ablage.*
 */
export function notesDropPreviewLabel(state: NotesDropZoneState): string | null {
  return state.target.preview === null ? null : state.target.preview.label;
}

/** Die strukturierte Vorschau des Urteils — **ungelesen** durchgereicht, für `data`-Attribute und Tests. */
export function notesDropPreview(state: NotesDropZoneState): DropPreview | null {
  return state.target.preview;
}

/** Der Name der **Zone** je Fläche — zwei Flächen, zwei Namen, **eine** Funktion. */
export function notesDropZoneTitle(surface: NotesDropZoneSurface): string {
  return `${NOTES_DROP_ZONE_SURFACE_LABEL[surface]} workspace drop zone`;
}

/**
 * Der Name des **Ziels** (der gebundenen Region) je Fläche. Zone und Ziel sind **zwei** Tatsachen: das Ziel ist
 * immer da, die sichtbare Zone nur während eines Zuges — deshalb zwei Namen, aber **eine** Quelle (die Fläche).
 */
export function notesDropZoneTargetLabel(surface: NotesDropZoneSurface): string {
  return `${NOTES_DROP_ZONE_SURFACE_LABEL[surface]} workspace drop target`;
}

/**
 * Die Kennung der Ansageregion — **eine** Definition, weil zwei Stellen sie brauchen: die Region selbst und das
 * `aria-describedby` der fokussierbaren Fläche. *Zwei Kennungen für eine Region wären ein toter Verweis.*
 */
export function notesDropZoneAnnouncerId(surface: NotesDropZoneSurface): string {
  return `notes-drop-zone-announcer-${surface}`;
}

export const NOTES_DROP_ZONE_CONFIRM_LABEL = 'Place here';
export const NOTES_DROP_ZONE_DISMISS_LABEL = 'Dismiss';

/**
 * Der Tastenhinweis — die Ziffernspanne wird aus der **vorhandenen** Absichtsliste abgeleitet (Paket 4):
 * *eine neue Absicht bekommt ihre Taste und ihre Spanne von selbst.*
 */
export const NOTES_DROP_ZONE_KEY_HINT =
  `Keyboard: Enter places · 1–${WORKSPACE_DROP_INTENTS.length} chooses the intent · Esc dismisses`;

/**
 * Die Ansage des leeren Zustands — **je Fläche**, weil zwei Ansageregionen im DOM stehen. Die Region steht
 * **immer**, damit die Ansage eine **Änderung** ist und nicht eine Region, die mit ihrem Text geboren wird.
 */
export function notesDropZoneIdleAnnouncement(surface: NotesDropZoneSurface): string {
  return `No workspace object is being carried over the ${NOTES_DROP_ZONE_SURFACE_LABEL[surface]}.`;
}
