// STATUS: PLATIN — Integration & Release, **Paket 13**: Vokabular und Vertrag der Publish-Ablagezone
//
// ## Warum Vokabular und Regeln getrennt liegen
//
// Dieses Modul **benennt** — View-Phasen, Gründe, Wörter, Formen. Es **entscheidet nichts**. Die Regeln stehen in
// `publishWorkspaceDropZone.ts`. *Wer Wörter und Regeln in eine Datei legt, kann den Vertrag nicht mehr prüfen,
// ohne die Regel zu laden.* Genau die Form, die **Paket 11** (`apps/whiteboard/drop-zone/**`) bewiesen hat.
//
// ## Was hier **nicht** entsteht: eine zweite Erlaubnisliste
//
// Die Objektart-Wörter und die Absichts-Wörter sind **wiederverwendet** (`shell/i18n/fabricGraphLocale.ts`,
// `objectType` mit elf Arten, `transfer.PasteCopy` / `transfer.LiveLink`) — nicht ein zweites Mal geschrieben.
// Die **Codes** der Matrix, des Parsers und des Resolvers sind die von `WorkspaceInteractionError`; ihre Sätze
// kommen aus dem Fehler **selbst** (`ERROR_MESSAGES`, 30 Codes). *Ein zweites Wörterbuch über dieselben Codes wäre
// eine zweite Wahrheit.* Hier stehen nur die Wörter, die es sonst **nirgends** gibt: die der Zone selbst und die
// fünf Sätze des Ablageurteils (Paket 6 führt Codes, keine Wörter).
//
// ## Zustände ohne Farbe
//
// Jede View-Phase trägt **drei** sichtbare Achsen: ein **Zeichen** (`glyph`), eine **Form** (`pattern`, die
// Rahmenart) und **Wörter** (`headline`). Eine Farbe ist **keine** davon — *wer allein auf einen Farbton zeigt,
// hat für Farbenblinde keinen Zustand, sondern gleich aussehende Flächen.* Der Rahmen wird zusätzlich als
// **Form** gezeichnet (Strichart plus vier Eckwinkel), nie als Farbton allein.
//
// ## Eine View-Phase ist **abgeleitet**, nicht gespeichert
//
// Das Urteil selbst gehört Paket 6 (`DropTargetState`: `verdict` **neben** der Phase, mit benanntem `reason` und
// benannter `preview.label`). Eine zweite gespeicherte Phasenangabe wäre **zwei Felder für eine Tatsache**.
// `publishWorkspaceDropZoneView` **rechnet** die Phase deshalb aus den Tatsachen aus; sie steht nie daneben.
//
// ## Ein Grund, den nur diese Fläche kennt: `publish-drop-transfer-protected`
//
// Der Ablagespeicher ist während `dragenter` / `dragover` **geschützt**: `dataTransfer.getData()` liefert dort
// nichts, `dataTransfer.types` dagegen schon. Das ist **kein** „es wurde nichts übergeben" — es ist die Aussage
// „der Inhalt ist noch nicht lesbar, die Absicht des Zuges ist aber bekannt". Deshalb trägt dieser Fall einen
// **eigenen benannten Grund**. *Wer ihn mit `…-transfer-missing` zusammenlegt, sagt während des Überfahrens eine
// Unwahrheit über den Zug — und genau diese Verwechslung war der P1-Defekt `W-443` in Paket 9.*
import { WorkspaceInteractionError } from '../../../shared/workspace-interaction';
import type {
  WorkspaceDropIntent,
  WorkspaceIntegrationKind,
  WorkspaceInteractionErrorCode,
  WorkspaceLiveMode,
  WorkspaceObjectDescriptor,
  WorkspaceObjectKind,
} from '../../../shared/workspace-interaction';
import type { DropPreview, DropRejectReason, DropTargetState } from '../../../shell/workspace/drag/dragDropVerdict';
import type { DragEndReason } from '../../../shell/workspace/drag/dragSession';
import { FABRIC_GRAPH_COPY } from '../../../shell/i18n/fabricGraphLocale';

/**
 * Die **View-Phase** — der Zustand, den die Ansicht aus den Tatsachen ableitet.
 *
 *   * `closed`   — kein Zug über der Fläche; die Ansicht rendert **nur** die Ansageregion (die bleibt stehen).
 *   * `open`     — ein Zug ist über der Fläche, aber **abgelehnt** (Träger unlesbar/geschützt oder keine Route).
 *   * `ready`    — das Urteil (Paket 6) sagt `accept`; die Matrix bietet **genau eine** Absicht an.
 *   * `choice`   — das Urteil sagt `accept`; die Matrix bietet **mehrere** Absichten an → ohne Wahl wird nichts abgelegt.
 *   * `refused`  — die Ablage ist **benannt** abgelehnt (Grund aus der Matrix oder lokal).
 *   * `resolved` — **zugestellt** (Adapter, Absicht, beide Versionen).
 */
export type PublishWorkspaceDropZoneView = 'closed' | 'open' | 'ready' | 'choice' | 'refused' | 'resolved';

/**
 * Die Gründe, die **diese** Fläche selbst kennt — alles andere kommt aus den vorhandenen Vokabularen:
 * `WorkspaceInteractionErrorCode` (Matrix/Parser/Resolver) und `DropRejectReason` (Ablageurteil, Paket 6).
 * *Eine zweite Fehlerliste über dieselbe Frage wäre eine zweite Wahrheit.*
 */
export type PublishWorkspaceDropZoneLocalRefusal =
  /** Bei der **Ablage** war nichts zu lesen: es wurde wirklich nichts übergeben. */
  | 'publish-drop-transfer-missing'
  /** Beim **Überfahren**: der Ablagespeicher ist geschützt — die Absicht des Zuges ist bekannt, der Inhalt nicht. */
  | 'publish-drop-transfer-protected'
  /** Die Ablagefläche gibt ihren Inhalt gar nicht heraus (kein `getData`). */
  | 'publish-drop-transfer-unreadable'
  | 'publish-drop-target-missing'
  | 'publish-drop-inactive'
  | 'publish-drop-already-decided'
  | 'publish-drop-command-unknown'
  /** Dieser Zug ist **nicht** für uns (keine Workspace-MIME in `types`) — er gehört dem Datei-Empfänger. */
  | 'publish-drop-foreign-drag';

/** Der **benannte** Grund einer Ablehnung: bestehende Vokabulare zuerst, die eigenen danach. */
export type PublishWorkspaceDropZoneRefusal =
  | WorkspaceInteractionErrorCode
  | DropRejectReason
  | PublishWorkspaceDropZoneLocalRefusal;

/**
 * Warum die Zone wieder **schließt**. Zwei Gründe sind **wiederverwendet**: `pointer-lost` und `window-blur`
 * sind die Abbruchgründe der Zieh-Session (Paket 5) — *ein Touch, den das System abbricht, kommt als
 * `pointercancel` und damit als `pointer-lost`, nicht als eigene Erfindung.*
 */
export type PublishWorkspaceDropZoneCloseReason =
  | 'drag-left'
  | 'keyboard-dismiss'
  | Extract<DragEndReason, 'pointer-lost' | 'window-blur'>;

/** Eine wählbare Absicht — mit der Taste, die sie **ohne Zeiger** wählt. */
export interface PublishWorkspaceDropChoice {
  readonly intent: WorkspaceDropIntent;
  readonly label: string;
  readonly adapterId: string;
  /** Die Ziffer, die diese Absicht wählt — *eine Ziffer lässt sich ansagen, eine Mausgeste nicht*. */
  readonly key: string;
  readonly shortcutLabel: string;
}

/** Was **wirklich** zugestellt wurde — Adapter, Absicht, **Integrationsart**, Modus, beide Versionen. */
export interface PublishWorkspaceDropResolution {
  readonly adapterId: string;
  readonly intent: WorkspaceDropIntent;
  /**
   * **Die neue Tatsache aus Paket 15** ✓: `COPY` → `'copy'`, `LIVE_REFERENCE` → `'live'`. *Ohne sie wäre eine
   * Zustellung „irgendwie" erfolgt — und der Nutzer könnte Kopie und Live-Verweis nicht unterscheiden.*
   */
  readonly integrationKind: WorkspaceIntegrationKind;
  /**
   * **Nur** bei `integrationKind: 'live'` ✓ — und dann **nur**, wenn er **ausdrücklich** angefordert wurde ✓✓.
   * Fehlt er, hat der Nutzer Live/Frozen noch nicht gesagt; *ein hier eingesetzter Default wäre der heimliche
   * Default, den Paket 15 verbietet.*
   */
  readonly mode?: WorkspaceLiveMode;
  readonly sourceDocumentId: string;
  readonly sourceObjectId: string;
  readonly targetDocumentId: string;
  readonly sourceVersion: number;
  readonly targetVersion: number;
}

/**
 * Der Träger, wie er **gelesen** wurde — oder **benannt** nicht lesbar.
 *
 * `protected` heißt: der Zug hat sich über `types` angekündigt, aber der Ablagespeicher gibt seinen Inhalt
 * während `dragenter` / `dragover` nicht heraus. Das ist ein **Zustand**, kein Fehler — und er verschwindet
 * bei der Ablage, weil `getData()` dort liefert.
 */
export type PublishWorkspaceDropTransferRead =
  | { readonly ok: true; readonly payload: string; readonly descriptor: WorkspaceObjectDescriptor; readonly reason?: never }
  | { readonly ok: false; readonly reason: PublishWorkspaceDropZoneRefusal; readonly payload?: never; readonly descriptor?: never };

/**
 * Was die **Zustellung** ergeben hat (der Resolver, Paket 4) — `none`, solange nichts abgelegt wurde.
 * *Ein stiller Erfolg wäre ein `none`, das wie ein `delivered` aussieht; deshalb steht hier der Grund.*
 */
export type PublishWorkspaceDropDecision =
  | { readonly kind: 'none' }
  | { readonly kind: 'choice'; readonly choices: readonly PublishWorkspaceDropChoice[] }
  | { readonly kind: 'refused'; readonly code: PublishWorkspaceDropZoneRefusal }
  | { readonly kind: 'delivered'; readonly resolution: PublishWorkspaceDropResolution };

export interface PublishWorkspaceDropZoneState {
  /**
   * **Das Ablageurteil (Paket 6)** — `verdict` **neben** der Phase, mit benanntem `reason` und benannter
   * `preview.label`. Dieses Modul **erfindet** kein Urteil; es **liest** seines.
   */
  readonly target: DropTargetState;
  /** Was getragen wird — gelesen, geschützt oder benannt nicht lesbar. */
  readonly transfer: PublishWorkspaceDropTransferRead;
  /** Was der Resolver entschieden hat. */
  readonly decision: PublishWorkspaceDropDecision;
  /** Der Grund des letzten Schließens — auch geschlossen **benannt**. */
  readonly closedReason: PublishWorkspaceDropZoneCloseReason | null;
}

/**
 * **Dieselbe Form wie `DragStep`** (Paket 5) — eine Ursache, eine Behebung.
 *
 * `ok: false` heißt: **der Aufruf** war unbrauchbar (kein Träger, unbekannter Befehl, geschlossene Zone).
 * Eine **Ablehnung der Matrix** ist dagegen ein gültiger Zustandsübergang — der Zustand trägt den Grund sichtbar.
 */
export type PublishWorkspaceDropZoneStep =
  | { readonly ok: true; readonly state: PublishWorkspaceDropZoneState; readonly reason?: never }
  | { readonly ok: false; readonly reason: PublishWorkspaceDropZoneRefusal; readonly state: PublishWorkspaceDropZoneState };

/**
 * Die **Tastatur als Absicht**: ein Befehl, der **dieselbe** Zustellung ausführt wie die Ablage.
 * *Eine Ablagezone, die man nur mit dem Zeiger bestätigen kann, ist ein Befund.*
 */
export type PublishWorkspaceDropCommand =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'choose'; readonly intent: WorkspaceDropIntent }
  | { readonly kind: 'dismiss' };

/** Warum eine Taste **kein** Befehl ist — benannt, damit aus einem Tastendruck kein stiller No-op wird. */
export type PublishWorkspaceDropCommandStep =
  | { readonly ok: true; readonly command: PublishWorkspaceDropCommand; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'publish-drop-key-unbound'; readonly command?: never };

/** Die Präsentation je View-Phase — **erschöpfend** typisiert: eine neue Phase fällt beim Bauen auf. */
export interface PublishWorkspaceDropZonePresentation {
  readonly glyph: string;
  readonly pattern: 'none' | 'dashed' | 'solid' | 'double';
  readonly headline: string;
}

export const PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION: Readonly<Record<PublishWorkspaceDropZoneView, PublishWorkspaceDropZonePresentation>> = Object.freeze({
  closed: { glyph: '', pattern: 'none', headline: '' },
  open: { glyph: '↓', pattern: 'dashed', headline: 'Publish drop zone: a drag is over the page surface' },
  ready: { glyph: '⊞', pattern: 'solid', headline: 'Publish drop zone: ready to place' },
  choice: { glyph: '?', pattern: 'double', headline: 'Publish drop zone: choose an intent' },
  refused: { glyph: '!', pattern: 'dashed', headline: 'Publish drop zone: drop refused' },
  resolved: { glyph: '✓', pattern: 'solid', headline: 'Publish drop zone: placed' },
});

/** Der sichtbare Satz zu jedem **eigenen** Grund — erschöpfend: ein neuer lokaler Grund bricht hier den Bau. */
const PUBLISH_WORKSPACE_DROP_ZONE_LOCAL_REFUSAL_TEXT: Readonly<Record<PublishWorkspaceDropZoneLocalRefusal, string>> = Object.freeze({
  'publish-drop-transfer-missing': 'No workspace object was handed over.',
  'publish-drop-transfer-protected': 'The drag content is protected while the pointer is over the surface; it becomes readable at the drop.',
  'publish-drop-transfer-unreadable': 'The drag surface does not hand over its content.',
  'publish-drop-target-missing': 'This surface does not know its own target (app or document).',
  'publish-drop-inactive': 'The drop zone is not open.',
  'publish-drop-already-decided': 'This drop is already decided.',
  'publish-drop-command-unknown': 'The drop machine does not know this command.',
  'publish-drop-foreign-drag': 'This drag does not carry a workspace object; it belongs to the file receiver.',
});

/**
 * Der sichtbare Satz zu jedem Grund des **Ablageurteils** (Paket 6) — erschöpfend über `DropRejectReason`.
 * Die Codes selbst sind eine Definition in Paket 6; *hier stehen nur die Wörter, weil Paket 6 keine führt*.
 * Sie nennen **diese** Fläche — *dieselben fünf Sätze für Whiteboard und Publish wären eine Auskunft, die den
 * falschen Ort nennt.* Eine **Regel** entsteht dadurch nicht: was erlaubt ist, beantwortet weiter allein die Matrix.
 */
const PUBLISH_WORKSPACE_DROP_VERDICT_REFUSAL_TEXT: Readonly<Record<DropRejectReason, string>> = Object.freeze({
  'object-kind-unknown': 'The carried object kind is unknown (or the drag announced no object kind yet).',
  'intent-unknown': 'The carried intent is unknown.',
  'route-not-capable': 'No registered route accepts this object at the Publish surface.',
  'payload-missing': 'The carried object is missing.',
  'verdict-unavailable': 'The capability question could not be answered; the drop is refused.',
});

const LOCAL_REFUSALS: Readonly<Record<string, string>> = PUBLISH_WORKSPACE_DROP_ZONE_LOCAL_REFUSAL_TEXT;
const VERDICT_REFUSALS: Readonly<Record<string, string>> = PUBLISH_WORKSPACE_DROP_VERDICT_REFUSAL_TEXT;

/**
 * Der sichtbare Satz zu einem benannten Grund — **eine** Definition für alle Oberflächen.
 *
 * Für die Codes der Matrix und des Parsers wird **kein** zweites Wörterbuch angelegt: `WorkspaceInteractionError`
 * trägt zu **jedem** Code seinen Satz (`ERROR_MESSAGES`), und diese Nachricht ist bereits die eine Definition.
 */
export function publishWorkspaceDropRefusalText(code: PublishWorkspaceDropZoneRefusal): string {
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
export const PUBLISH_WORKSPACE_DROP_INTENT_LABEL: Readonly<Record<WorkspaceDropIntent, string>> = Object.freeze({
  COPY: FABRIC_GRAPH_COPY['en-US'].transfer.PasteCopy,
  LIVE_REFERENCE: FABRIC_GRAPH_COPY['en-US'].transfer.LiveLink,
  // Dieselben zwei Wörter wie in Paket 11 — *zwei Schreibweisen für dieselbe Absicht wären zwei Vokabeln.*
  FROZEN_SNAPSHOT: 'Frozen snapshot',
  MOVE: 'Move',
});

/** Die Objektart-Wörter — **wiederverwendet** aus der Fabric-Oberfläche (elf Arten), nicht neu geschrieben. */
export function publishWorkspaceDropObjectKindLabel(kind: WorkspaceObjectKind): string {
  return FABRIC_GRAPH_COPY['en-US'].objectType[kind];
}

/**
 * Die sichtbare Vorschau — **der Text kommt aus dem Urteil** (Paket 6, `preview.label`) und wird hier **wörtlich**
 * durchgereicht. *Wer die Vorschau neu formuliert, hat zwei Vorschauen über eine Ablage.*
 */
export function publishWorkspaceDropPreviewText(preview: DropPreview | null): string {
  return preview === null ? '' : preview.label;
}

export const PUBLISH_WORKSPACE_DROP_ZONE_TITLE = 'Publish workspace drop zone';
export const PUBLISH_WORKSPACE_DROP_ZONE_CONFIRM_LABEL = 'Place here';
export const PUBLISH_WORKSPACE_DROP_ZONE_DISMISS_LABEL = 'Dismiss';
export const PUBLISH_WORKSPACE_DROP_ZONE_PREVIEW_LABEL = 'Drop preview:';
export const PUBLISH_WORKSPACE_DROP_ZONE_KEY_HINT = 'Keyboard: Enter places · 1–4 chooses the intent · Esc dismisses';
/** Die Ansage des leeren Zustands — die Region steht **immer** im DOM, damit die Ansage eine Änderung ist. */
export const PUBLISH_WORKSPACE_DROP_ZONE_IDLE_ANNOUNCEMENT = 'No workspace object is being carried over the Publish surface.';

/**
 * **Paket 15: der Modus ist eine eigene, sichtbare Wahl** ✓✓ — für eine Live-Referenz gibt es **keinen** Default.
 *
 * Die Wörter stehen **einmal** hier und nicht in der Ansicht: *zwei Schreibweisen derselben Wahl wären zwei
 * Vokabeln.* Ein fehlender Modus hat einen **eigenen** Satz — „nicht gewählt" ist keine Ablehnung, sondern der
 * Zustand vor der Wahl.
 */
export const PUBLISH_WORKSPACE_DROP_ZONE_MODE_LABEL = 'Live reference treatment:';
export const PUBLISH_WORKSPACE_DROP_ZONE_MODE_NOT_CHOSEN = 'mode not chosen — a live reference needs Live or Frozen';
export const PUBLISH_WORKSPACE_DROP_ZONE_MODE_CHOSEN = 'chosen:';
