// STATUS: PLATIN — Integration & Release, **Paket 10**: die Regeln des Present-Ablageziels (rein, kopflos)
//
// ## Was dieses Modul **nicht** tut
//
// Es erfindet **keinen** zweiten Zieh-Mechanismus und **keine** zweite Erlaubnisregel.
//
//   * **Die Zieh-Session** ist Paket 5 (`isDragActive`, `session.payload` — `shell/workspace/drag/dragSession.ts`).
//   * **Das Ablageurteil, die Vorschau und die Touch-Strategie** sind Paket 6
//     (`hoverDropTarget`, `commitDropTarget`, `createDropTarget`, `leaveDropTarget`,
//     `shell/workspace/drag/dragDropVerdict.ts`). Dieses Modul **liest** das Urteil — es bildet kein eigenes.
//     *Eine zweite Regel über dieselbe Frage wäre eine zweite Wahrheit.*
//   * **Der Träger** ist Paket 7: geparst wird mit `parseWorkspaceDragPayload`
//     (`shared/workspace-interaction/workspaceInteractionPayload.ts`) — die kanonischen Felder
//     (`['documentId','objectId','objectKind','sourceApp','supportedIntents']`) sind **dort** definiert, und
//     ein falsches Feld wird **dort** abgelehnt. Hier wird nur der **Code** weitergereicht.
//   * **Die Erlaubnis** ist Paket 4: die Fähigkeitsfrage wird aus der **vorhandenen** Matrix gebaut
//     (`presentWorkspaceDropCapabilityQuestion` → `getAdapter` / `getCompatibleIntents`) und in
//     `hoverDropTarget` **hineingereicht**. Zugestellt wird über den vorhandenen Resolver
//     (`resolveWorkspaceDrop`) — **kein privater Pfad**.
//
// ## Zwei Zugänge zu **einer** Zustellung
//
// Der **Zeiger** (`dropPresentWorkspaceDropZone`) und die **Tastatur**
// (`confirmPresentWorkspaceDropZone`, `choosePresentWorkspaceDropIntent`) rufen **dieselbe** Funktion
// `routePresentWorkspaceDrop`. *Eine Tastatur, die einen zweiten Weg nimmt, ist kein gleichwertiger Weg* —
// deshalb ist `confirm` im Zustand `choice` **wörtlich** die Ablage.
//
// ## Warum hier ein **eigener** Parser-Aufruf steht (anders als bei Paket 9 in Writer)
//
// `hoverDropTarget` braucht **vor** dem Urteil die drei Vokabeln `targetApp`, `objectKind`, `intent`.
// Writer entscheidet direkt über `evaluateWorkspaceDrop` und braucht sie nicht. Present **muss** also den
// Träger lesen, **bevor** es urteilt — und liest ihn mit **dem einen** Parser, nicht mit einem eigenen.
//
// ## Drei Tatsachen, die getrennt bleiben
//
//   1. **Die Phase** — wo die Fläche im Lebenslauf steht (`closed` … `resolved`).
//   2. **Das Urteil** (`verdict`, Paket 6) — `accept` / `reject` / `none`. Es wohnt **neben** der Phase.
//   3. **Die Geometrie** (`placement`) — hat die Folie überhaupt freien Platz? Das ist **keine** Route und
//      **keine** Erlaubnis, sondern die Antwort von `presentReferencePlacementRect`. Ohne freien Platz wird
//      **vor** dem Einfügen verweigert (`drop-zone-no-free-region`), statt in eine werfende Einfügung zu
//      laufen.
import type { DocumentKind, PresentObjectGeometry, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  WORKSPACE_DROP_INTENTS,
  WorkspaceInteractionError,
  isWorkspaceDocumentKind,
  isWorkspaceDropIntent,
  isWorkspaceObjectKind,
  parseWorkspaceDragPayload,
  resolveWorkspaceDrop,
  type WorkspaceDropAssessment,
  type WorkspaceDropIntent,
  type WorkspaceInteractionRegistry,
  type WorkspaceObjectDescriptor,
} from '../../../../shared/workspace-interaction';
import {
  commitDropTarget,
  createDropTarget,
  hoverDropTarget,
  leaveDropTarget,
  type CapabilityQuestion,
  type DragInputKind,
  type DropTargetState,
  type DropVerdict,
} from '../../../../shell/workspace/drag/dragDropVerdict';
import { isDragActive, type DragSessionState } from '../../../../shell/workspace/drag/dragSession';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
} from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  presentPercentFromClientPoint,
  type PresentClientFrame,
  type PresentClientPoint,
  type PresentPercentPoint,
  type PresentPercentRect,
} from '../../canvas/model/presentRect';
import { presentReferencePlacementRect } from '../presentWorkspaceIntegration';
import type {
  PresentWorkspaceDropZoneCloseReason,
  PresentWorkspaceDropZonePhase,
  PresentWorkspaceDropZoneRefusal,
} from './presentWorkspaceDropZoneContract';

/**
 * **Die Zielanwendung dieser Fläche** — die Vokabel, die die vorhandene Matrix kennt.
 * *Ein zweiter Name für „Present" wäre eine zweite Adresse.*
 */
export const PRESENT_WORKSPACE_DROP_TARGET_APP: DocumentKind = 'Present';

/** Die Tasten der Absichten — **abgeleitet** aus der vorhandenen Liste, damit hier keine zweite Grenze entsteht. */
const CHOICE_KEYS: readonly string[] = WORKSPACE_DROP_INTENTS.map((_, index) => String(index + 1));

const NO_INTENTS: readonly WorkspaceDropIntent[] = Object.freeze([]);
const EMPTY_DOCUMENTS: Readonly<Record<string, WorkspaceDocument>> = Object.freeze({});

export interface PresentWorkspaceDropZoneState {
  readonly phase: PresentWorkspaceDropZonePhase;
  /** **Das Urteil aus Paket 6** — NEBEN der Phase, nie in ihr. */
  readonly verdict: DropVerdict;
  /** Der **benannte** Grund — `null`, solange nichts abgelehnt wurde. */
  readonly reason: PresentWorkspaceDropZoneRefusal | null;
  /** Der vollständige Zustand aus Paket 6: er trägt die **Vorschau** und die Erlaubnis. */
  readonly target: DropTargetState;
  readonly targetDocumentId: string | null;
  readonly input: DragInputKind;
  /** Was die **Autorität** als kompatibel gemeldet hat — nie eine eigene Liste. */
  readonly compatibleIntents: readonly WorkspaceDropIntent[];
  /** Das Platzierungsrechteck der Folie — dieselbe Geometrie, die die Einfügung wirklich nutzt. */
  readonly placement: PresentPercentRect | null;
  /** Der Zeiger in Folien-Prozent (zoomunabhängig) — `null`, wenn nicht messbar. */
  readonly pointer: PresentPercentPoint | null;
  /** Die Antwort des vorhandenen Resolvers — `null`, solange nichts zugestellt wurde. */
  readonly assessment: WorkspaceDropAssessment | null;
  /** Ob „bestätigen" jetzt etwas zustellt — die Frage, die Beschriftung und `disabled` stellen. */
  readonly canConfirmWithKeyboard: boolean;
  /** Der Grund des letzten Schließens — auch im geschlossenen Zustand **benannt**. */
  readonly closedReason: PresentWorkspaceDropZoneCloseReason | null;
}

export type PresentWorkspaceDropZoneStep =
  | { readonly ok: true; readonly state: PresentWorkspaceDropZoneState; readonly reason?: never }
  | { readonly ok: false; readonly reason: PresentWorkspaceDropZoneRefusal; readonly state: PresentWorkspaceDropZoneState };

/** Die Eingaben einer Zustellung: das Ziel, die bekannten Dokumente, der **untrusted** Träger und die Matrix. */
export interface PresentWorkspaceDropZoneContext {
  readonly targetDocumentId: unknown;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  /** Der **untrusted** Träger (Paket 7). */
  readonly payload?: unknown;
  /** Die Objekte der Folie — **nur** für die Geometrie, nie für die Erlaubnis. */
  readonly existingObjects?: readonly PresentObjectGeometry[];
  /** Der sichtbare Folienrahmen und der Zeiger — **nur** für die Anzeige der Position. */
  readonly frame?: PresentClientFrame | null;
  readonly pointer?: PresentClientPoint | null;
  readonly input?: unknown;
  /** Die **eine** Autorität. Fehlt sie, wird **nicht** angenommen (fail-closed). */
  readonly registry?: WorkspaceInteractionRegistry | null;
  /** Eine gewählte Absicht — bleibt `unknown`: der Resolver benennt Unbekanntes selbst. */
  readonly requestedIntent?: unknown;
  /**
   * **Der gewählte Live-Modus** (Paket 15) — bleibt `unknown`: *der Resolver benennt Unbekanntes selbst* ✓.
   * **Fehlt er, wird ein Live-Verweis nicht zugestellt** ✓✓ — *kein heimlicher Default* ✗.
   */
  readonly requestedMode?: unknown;
  /**
   * **W-455** ✓✓: die Entscheidung der Administratorrichtlinie zu **dieser** Ablage — *hineingereicht, nicht hier
   * abgefragt* ✓✓: *die Zone bleibt **rein und synchron**, die (asynchrone) Antwort kommt aus der **einen**
   * vorhandenen Autoritaet* (`precheckPolicy`, `platform/native/nativePolicy.ts:5` ✓). **Fehlt sie, wird nicht
   * abgelegt** ✗✓ — der Resolver nennt den Grund (`drop_policy_decision_required`).
   */
  readonly requestedPolicyDecision?: unknown;
}

/** Die Ablagefläche, wie der DOM sie anbietet — **strukturell**, ohne DOM-Typen (wie `DragPointerLike`). */
export interface PresentWorkspaceDataTransferLike {
  readonly getData?: (mime: string) => unknown;
}

export type PresentWorkspaceTransferRead =
  | { readonly ok: true; readonly payload: string; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'drop-zone-transfer-missing' | 'drop-zone-transfer-unreadable'; readonly payload?: never };

/** **Die Tastatur als Absicht**: ein Befehl, der **dieselbe** Zustellung ausführt wie die Ablage. */
export type PresentWorkspaceDropCommand =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'choose'; readonly intent: WorkspaceDropIntent }
  | { readonly kind: 'dismiss' };

/** Warum eine Taste **kein** Befehl ist — benannt, damit aus einem Tastendruck kein stiller No-op wird. */
export type PresentWorkspaceDropCommandStep =
  | { readonly ok: true; readonly command: PresentWorkspaceDropCommand; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'drop-zone-key-unbound'; readonly command?: never };

function ok(state: PresentWorkspaceDropZoneState): PresentWorkspaceDropZoneStep {
  return { ok: true, state };
}

function withState(
  state: PresentWorkspaceDropZoneState,
  patch: Partial<PresentWorkspaceDropZoneState>,
): PresentWorkspaceDropZoneState {
  return Object.freeze({ ...state, ...patch });
}

/** Eine Ablehnung ist ein **gültiger Zustandsübergang** — der Zustand trägt den Grund sichtbar. */
function refuse(
  state: PresentWorkspaceDropZoneState,
  targetDocumentId: string | null,
  code: PresentWorkspaceDropZoneRefusal,
  patch: Partial<PresentWorkspaceDropZoneState> = {},
): PresentWorkspaceDropZoneStep {
  return {
    ok: false,
    reason: code,
    state: withState(state, {
      phase: 'refused',
      reason: code,
      targetDocumentId,
      assessment: null,
      canConfirmWithKeyboard: false,
      ...patch,
    }),
  };
}

function targetRefusal(value: unknown): 'drop-zone-target-missing' | null {
  return typeof value === 'string' && value.trim().length > 0 ? null : 'drop-zone-target-missing';
}

/** Nur die vier Eingabearten, die Paket 6 kennt — **keine** Liste, sondern die Vokabel seiner eigenen Entscheidungen. */
function inputOf(value: unknown, fallback: DragInputKind): DragInputKind {
  if (value === 'mouse' || value === 'pen' || value === 'touch' || value === 'keyboard') return value;
  return fallback;
}

function documentsOf(value: unknown): Readonly<Record<string, WorkspaceDocument>> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, WorkspaceDocument>>
    : EMPTY_DOCUMENTS;
}

/**
 * **Die Fähigkeitsfrage aus der vorhandenen Matrix** — die Antwort der **einen** Autorität, in
 * `hoverDropTarget` hineingereicht (Paket 6 verlangt genau das).
 *
 * Diese Funktion baut **keine** zweite Liste „was erlaubt ist": sie fragt `getAdapter` (existiert die
 * Route?) und `getCompatibleIntents` (decken Export, Import und Route sie?) — dieselbe Auskunft, die der
 * Resolver benutzt.
 *
 * **Fail-closed:** eine fehlende oder **nicht versiegelte** Matrix ergibt `null`. Paket 6 macht daraus
 * `reject` mit dem Grund `verdict-unavailable` — *im Zweifel wird nicht angenommen*.
 */
export function presentWorkspaceDropCapabilityQuestion(
  registry: WorkspaceInteractionRegistry | null | undefined,
  sourceApp: DocumentKind,
): CapabilityQuestion | null {
  if (!registry || registry.isSealed !== true) return null;
  return (targetApp, objectKind, intent) => {
    if (!isWorkspaceDocumentKind(targetApp)) return false;
    if (!isWorkspaceObjectKind(objectKind)) return false;
    if (!isWorkspaceDropIntent(intent)) return false;
    if (!registry.getAdapter(targetApp, objectKind, intent)) return false;
    return registry.getCompatibleIntents(sourceApp, targetApp, objectKind).includes(intent);
  };
}

/**
 * **Die Taste, die eine Absicht ohne Zeiger wählt** — dieselbe Ableitung, die
 * `resolvePresentWorkspaceDropCommand` liest: die **Stelle** in der angebotenen Liste, nicht die Stelle in
 * `WORKSPACE_DROP_INTENTS`. *Zwei verschiedene Ableitungen derselben Taste wären zwei Wahrheiten.*
 */
export function presentWorkspaceDropChoiceKey(index: number): string {
  return Number.isInteger(index) && index >= 0 ? CHOICE_KEYS[index] ?? '' : '';
}

/** Die Absichten, die die Autorität für diesen Träger und dieses Ziel anbietet — gefiltert nach dem Träger. */
export function presentWorkspaceDropCompatibleIntents(
  registry: WorkspaceInteractionRegistry | null | undefined,
  descriptor: WorkspaceObjectDescriptor,
): readonly WorkspaceDropIntent[] {
  if (!registry || registry.isSealed !== true) return NO_INTENTS;
  try {
    return registry
      .getCompatibleIntents(descriptor.sourceApp, PRESENT_WORKSPACE_DROP_TARGET_APP, descriptor.objectKind)
      .filter((intent) => descriptor.supportedIntents.includes(intent));
  } catch {
    return NO_INTENTS;
  }
}

/**
 * **Der eine Parser** — `parseWorkspaceDragPayload` (Paket 7). Hier wird **nichts** selbst geprüft: ein
 * falsches Feld, eine unbekannte Objektart, eine unbekannte Absicht, eine zu große Nutzlast und eine
 * unpassende Version werden **dort** abgelehnt. Dieses Modul reicht nur den **Code** weiter — *eine eigene
 * Vorprüfung wäre eine zweite Wahrheit über den Träger*.
 */
function parsePresentWorkspaceTransfer(serialized: string):
  | { readonly ok: true; readonly descriptor: WorkspaceObjectDescriptor; readonly serialized: string; readonly reason?: never }
  | { readonly ok: false; readonly reason: PresentWorkspaceDropZoneRefusal; readonly descriptor?: never; readonly serialized?: never } {
  try {
    const parsed = parseWorkspaceDragPayload(serialized);
    return { ok: true, descriptor: parsed.descriptor, serialized };
  } catch (error) {
    return { ok: false, reason: error instanceof WorkspaceInteractionError ? error.code : 'payload_invalid' };
  }
}

/** Nur „ist überhaupt eine Zeichenkette da" — die **Format**prüfung bleibt beim einen Parser. */
function readPresentWorkspacePayload(value: unknown): PresentWorkspaceTransferRead {
  return typeof value === 'string' && value.length > 0
    ? { ok: true, payload: value }
    : { ok: false, reason: 'drop-zone-transfer-missing' };
}

/**
 * **Der Träger aus der Ablagefläche** — der Übersetzer, wie `dragPointFromEvent` in Paket 5: er **wählt
 * aus** (genau die **eine** MIME-Konstante aus Paket 4) und wirft den Rest weg.
 */
export function readPresentWorkspaceTransfer(
  dataTransfer: PresentWorkspaceDataTransferLike | null | undefined,
): PresentWorkspaceTransferRead {
  if (!dataTransfer) return { ok: false, reason: 'drop-zone-transfer-missing' };
  const read = dataTransfer.getData;
  if (typeof read !== 'function') return { ok: false, reason: 'drop-zone-transfer-unreadable' };
  let value: unknown;
  try {
    value = read.call(dataTransfer, FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  } catch {
    return { ok: false, reason: 'drop-zone-transfer-unreadable' };
  }
  return readPresentWorkspacePayload(value);
}

/** Ob diese `dataTransfer.types` unseren Träger **ankündigen** — rein und kopflos prüfbar. */
export function hasPresentWorkspaceDropTransfer(types: unknown): boolean {
  if (!Array.isArray(types)) return false;
  return types.some((type) => type === FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
}

/**
 * **Das Platzierungsrechteck** — dieselbe Geometrie, die `createPresentWorkspaceObject` beim Einfügen
 * wirklich belegt. *Eine zweite Platzierung wäre eine zweite Vorschau.*
 */
export function presentWorkspaceDropPlacement(
  existingObjects: readonly PresentObjectGeometry[] | null | undefined,
): PresentPercentRect | null {
  return presentReferencePlacementRect(Array.isArray(existingObjects) ? existingObjects : []);
}

/**
 * **Der Zeiger in Folien-Prozent** — über die **eine** Umrechnung (`presentPercentFromClientPoint`), die
 * auch die Zeigergesten des Canvas benutzen. `null` heißt: nicht messbar oder kein Rahmen.
 * *Weil der sichtbare Rahmen **nach** dem Zoom gemessen wird, ist das Ergebnis bei jedem Zoom dasselbe.*
 */
export function presentWorkspaceDropPointerPercent(
  frame: PresentClientFrame | null | undefined,
  pointer: PresentClientPoint | null | undefined,
): PresentPercentPoint | null {
  return presentPercentFromClientPoint(pointer ?? null, frame ?? null);
}

/** Das leere Ziel — jede Sitzung beginnt hier, und die Ansicht rendert dazu **nichts**. */
export function createPresentWorkspaceDropZone(targetDocumentId?: unknown): PresentWorkspaceDropZoneState {
  return Object.freeze({
    phase: 'closed' as const,
    verdict: 'none' as const,
    reason: null,
    target: createDropTarget(),
    targetDocumentId: typeof targetDocumentId === 'string' && targetDocumentId.length > 0 ? targetDocumentId : null,
    input: 'mouse' as const,
    compatibleIntents: NO_INTENTS,
    placement: null,
    pointer: null,
    assessment: null,
    canConfirmWithKeyboard: false,
    closedReason: null,
  });
}

/** Ob die Ansicht überhaupt etwas rendert — nur `closed` rendert nichts. */
export function isPresentWorkspaceDropZoneVisible(state: PresentWorkspaceDropZoneState): boolean {
  return state.phase !== 'closed';
}

/**
 * Ob der Fall **entschieden** ist: eine Ablehnung und eine Zustellung sind **Tatsachen**. Sie werden von
 * einem überfahrenden Zeiger **nicht** überschrieben, sondern nur von einem **neuen** Zug (siehe
 * `enterPresentWorkspaceDropZone`) oder vom Schließen.
 */
export function isPresentWorkspaceDropZoneSettled(state: PresentWorkspaceDropZoneState): boolean {
  return state.phase === 'refused' || state.phase === 'resolved';
}

/** **Das Schließen** — aus jedem offenen Zustand; aus `closed` ein **benannter** No-op. */
function closePresentWorkspaceDropZone(
  state: PresentWorkspaceDropZoneState,
  reason: PresentWorkspaceDropZoneCloseReason,
): PresentWorkspaceDropZoneStep {
  if (state.phase === 'closed') return { ok: false, reason: 'drop-zone-inactive', state };
  return ok(withState(state, {
    phase: 'closed',
    verdict: 'none',
    reason: null,
    // **Paket 6 nimmt das Urteil zurück** — sonst bliebe ein Urteil stehen, das nicht mehr gilt.
    target: leaveDropTarget(state.target),
    compatibleIntents: NO_INTENTS,
    placement: null,
    pointer: null,
    assessment: null,
    canConfirmWithKeyboard: false,
    closedReason: reason,
  }));
}

/** Die Fläche wird **verlassen** — ein entschiedener Fall bleibt stehen, ein überfahrender schließt. */
export function leavePresentWorkspaceDropZone(
  state: PresentWorkspaceDropZoneState,
  reason: PresentWorkspaceDropZoneCloseReason = 'drag-left',
): PresentWorkspaceDropZoneStep {
  if (isPresentWorkspaceDropZoneSettled(state)) return ok(state);
  return closePresentWorkspaceDropZone(state, reason);
}

/** Ein **neuer** Zug betritt die Fläche — ein alter, entschiedener Fall wird dabei **abgelöst**. */
export function enterPresentWorkspaceDropZone(
  state: PresentWorkspaceDropZoneState,
  context: PresentWorkspaceDropZoneContext,
): PresentWorkspaceDropZoneStep {
  const current = isPresentWorkspaceDropZoneSettled(state)
    ? closePresentWorkspaceDropZone(state, 'drag-left').state
    : state;
  return openPresentWorkspaceDropZone(current, context);
}

/**
 * **Ein Zug ist über der Fläche** — das Urteil entsteht **hier**, aus der einen Autorität.
 *
 * Fehlt der Träger, ist das Ziel `open` (der **leere Zustand**) und **kein** Fehler: *ein Zug über der
 * Fläche ist noch kein Fall.* Erst ein **unlesbarer** Träger (falsche Felder, unbekannte Objektart) wird
 * **benannt** abgelehnt — nie still angenommen.
 */
export function openPresentWorkspaceDropZone(
  state: PresentWorkspaceDropZoneState,
  context: PresentWorkspaceDropZoneContext,
): PresentWorkspaceDropZoneStep {
  if (isPresentWorkspaceDropZoneSettled(state)) return ok(state);
  const missing = targetRefusal(context.targetDocumentId);
  if (missing) return refuse(state, null, missing);
  const targetDocumentId = context.targetDocumentId as string;
  const registry = context.registry === undefined ? FABRIC_WORKSPACE_DROP_REGISTRY : context.registry;
  const anzeige = {
    targetDocumentId,
    input: inputOf(context.input, state.input),
    placement: presentWorkspaceDropPlacement(context.existingObjects),
    pointer: presentWorkspaceDropPointerPercent(context.frame, context.pointer),
  };

  const transfer = readPresentWorkspacePayload(context.payload);
  if (!transfer.ok) {
    return ok(withState(state, {
      ...anzeige,
      phase: 'open',
      verdict: 'none',
      reason: null,
      target: createDropTarget(),
      compatibleIntents: NO_INTENTS,
      assessment: null,
      canConfirmWithKeyboard: false,
      closedReason: null,
    }));
  }
  const parsed = parsePresentWorkspaceTransfer(transfer.payload);
  if (!parsed.ok) {
    return refuse(state, targetDocumentId, parsed.reason, {
      ...anzeige, verdict: 'none', target: createDropTarget(), compatibleIntents: NO_INTENTS,
    });
  }

  const descriptor = parsed.descriptor;
  const intents = presentWorkspaceDropCompatibleIntents(registry, descriptor);
  // Die **erste** von der Autorität angebotene Absicht wird beurteilt; ist keine angeboten, wird die erste
  // **vom Träger** zugesagte beurteilt — die Frage antwortet dann `false`, und das Urteil ist `reject`.
  const intent = intents[0] ?? descriptor.supportedIntents[0];
  const hovered = hoverDropTarget(createDropTarget(), {
    targetApp: PRESENT_WORKSPACE_DROP_TARGET_APP,
    objectKind: descriptor.objectKind,
    intent,
  }, presentWorkspaceDropCapabilityQuestion(registry, descriptor.sourceApp));
  if (!hovered.ok) {
    return refuse(state, targetDocumentId, 'drop-zone-verdict-unavailable', {
      ...anzeige, target: hovered.state, compatibleIntents: intents,
    });
  }
  const target = hovered.state;
  if (target.verdict !== 'accept') {
    // **Das Urteil der vorhandenen Matrix** — kein zweites „was erlaubt ist".
    return refuse(state, targetDocumentId, target.reason ?? 'verdict-unavailable', {
      ...anzeige, target, verdict: target.verdict, compatibleIntents: intents,
    });
  }
  if (anzeige.placement === null) {
    // **Geometrie, nicht Route**: ohne freien Platz wird **vor** dem Einfügen verweigert (fail-closed).
    return refuse(state, targetDocumentId, 'drop-zone-no-free-region', {
      ...anzeige, target, verdict: target.verdict, compatibleIntents: intents,
    });
  }
  return ok(withState(state, {
    ...anzeige,
    phase: intents.length > 1 ? 'choice' : 'ready',
    verdict: target.verdict,
    reason: null,
    target,
    compatibleIntents: intents,
    assessment: null,
    canConfirmWithKeyboard: true,
    closedReason: null,
  }));
}

/**
 * **Die eine Zustellung** — Zeiger und Tastatur landen hier. Kein privater Pfad.
 *
 * Die Reihenfolge ist eine Entscheidung:
 *   1. **Geometrie** — ohne freien Platz gibt es nichts abzulegen.
 *   2. **`commitDropTarget`** (Paket 6) — die Autorität für „darf abgelegt werden". Ihr Nein ist bereits
 *      im Zustand **benannt** und wird nicht überschrieben.
 *   3. **Der vorhandene Resolver** — er parst den Träger erneut streng, prüft Identität, Richtlinie und
 *      Route und antwortet mit einem **benannten** Ergebnis. Ein nicht aufgelöstes Ergebnis ist ein
 *      **Fehlschlag mit Grund**, kein stiller Erfolg.
 */
function routePresentWorkspaceDrop(
  state: PresentWorkspaceDropZoneState,
  context: PresentWorkspaceDropZoneContext,
  requestedIntent: unknown,
): PresentWorkspaceDropZoneStep {
  const missing = targetRefusal(context.targetDocumentId);
  if (missing) return refuse(state, null, missing);
  const targetDocumentId = context.targetDocumentId as string;
  if (state.phase === 'closed') return refuse(state, targetDocumentId, 'drop-zone-inactive');
  if (isPresentWorkspaceDropZoneSettled(state)) return refuse(state, targetDocumentId, 'drop-zone-already-decided');
  const registry = context.registry === undefined ? FABRIC_WORKSPACE_DROP_REGISTRY : context.registry;
  if (!registry || registry.isSealed !== true) return refuse(state, targetDocumentId, 'drop-zone-registry-unavailable');
  if (!state.placement) return refuse(state, targetDocumentId, 'drop-zone-no-free-region');
  const transfer = readPresentWorkspacePayload(context.payload);
  if (!transfer.ok) return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  const commit = commitDropTarget(state.target);
  if (!commit.ok) return refuse(state, targetDocumentId, state.reason ?? 'verdict-unavailable');

  let assessment: WorkspaceDropAssessment;
  try {
    assessment = resolveWorkspaceDrop({
      payload: transfer.payload,
      targetDocumentId,
      documents: documentsOf(context.documents),
      ...(requestedIntent === undefined ? {} : { requestedIntent }),
      // **Paket 15** ✓: Der Modus wird **mitgeführt**, nicht erfunden ✗. Bedingtes Spreizen, weil *abwesend ≠
      // ausdrücklich `undefined`* ✓ — **nicht** wegen `exactOptionalPropertyTypes` ✗✓: *zwei Agenten haben gemessen,
      // dass die Option hier **nicht** gesetzt ist* ✓ (`strict: true`, kein `extends`). *Der Grund war falsch, die
      // Form bleibt richtig.* ✓
      ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
      // **W-455** ✓✓: die **echte** Entscheidung der Administratorrichtlinie — *von der Shell geholt
      // (`precheckPolicy`) und hier **hineingereicht*** ✓. Bedingt gespreizt wie der Modus: *fehlt sie, **fehlt**
      // sie* ✓ — und der Resolver legt dann **nicht** ab (`drop_policy_decision_required`), statt still
      // fortzufahren ✗✓✓.
      ...(context.requestedPolicyDecision === undefined ? {} : { requestedPolicyDecision: context.requestedPolicyDecision }),
    }, registry);
  } catch {
    // *Ein geworfener Resolver ist ein Fehlschlag mit Namen — kein stiller Erfolg und keine Ausnahme.*
    return refuse(state, targetDocumentId, 'drop-zone-routing-failed');
  }
  if (assessment.status === 'rejected') {
    return refuse(state, targetDocumentId, assessment.code, { assessment });
  }
  // **Paket 15 — das Loch in MEINER Datei, geschlossen (Runde 262) ✗✓✓**
  //
  // **Gefunden vom Whiteboard-Agenten** ✓✓ — *er hat dasselbe Muster in **seiner** Zone gefunden und behoben, und
  // es für Present als **Hypothese** gemeldet* ✓. **Ich habe es gemessen statt geglaubt** ✓: der Test
  // `presentWorkspaceLiveModePath.contract.test.ts` versucht die Umgehung zu **erzeugen** — und sie **gelang** ✗✗:
  // eine Route, die **nur** `LIVE_REFERENCE` führt, wurde über den **Ablegeweg ohne genannte Absicht** zugestellt ✗.
  //
  // **Warum:** die absichtslose Runde ist die **Auswahl**-Runde. `assess` liefert bei genau einer gedeckten Absicht
  // `accepted` ✓ — und der Weg darunter nahm die angebotene Absicht als **Zustellung**, obwohl der Benutzer
  // **nichts gesagt** hat ✗. *Genau das ist der heimliche Default, den Paket 15 verbietet* ✗✓.
  //
  // **Die Regel, die es schließt** ✓✓: **ein Live-Verweis ohne gesagten Modus wird nie zugestellt** — *benannt,
  // nicht still* ✓. *Die **positive Kontrolle** steht daneben: mit `requestedMode` liefert derselbe Weg* ✓✓.
  if ((assessment.status === 'accepted' || assessment.status === 'resolved')
    && assessment.selection.integrationKind === 'live'
    && assessment.selection.mode === undefined) {
    return refuse(state, targetDocumentId, 'drop_live_mode_required', { assessment });
  }
  if (assessment.status === 'needsChoice') {
    // **Kein stiller Erfolg und keine heimliche Vorauswahl**: die Absicht ist offen, und das bleibt stehen.
    return {
      ok: false,
      reason: 'drop_intent_choice_required',
      state: withState(state, { phase: 'choice', assessment, canConfirmWithKeyboard: true }),
    };
  }
  if (assessment.status === 'accepted') {
    // Eindeutige Route **ohne** angeforderte Absicht: sie wird mit der angebotenen Absicht zugestellt.
    return routePresentWorkspaceDrop(state, context, assessment.selection.intent);
  }
  return ok(withState(state, {
    phase: 'resolved',
    verdict: 'accept',
    reason: null,
    assessment,
    // **Paket 6 räumt nach dem Ablegen auf** — ein Urteil, das nicht mehr gilt, bleibt nicht stehen.
    target: commit.state,
    canConfirmWithKeyboard: false,
  }));
}

/** **Die Zeiger-Ablage** — ohne eindeutige Route wird **nicht** zugestellt. */
export function dropPresentWorkspaceDropZone(
  state: PresentWorkspaceDropZoneState,
  context: PresentWorkspaceDropZoneContext,
): PresentWorkspaceDropZoneStep {
  return routePresentWorkspaceDrop(state, context, context.requestedIntent);
}

/**
 * **Die Tastatur-Absicht: bestätigen** — derselbe Weg wie die Ablage.
 *
 *   * `ready` → die **eine** angebotene Route wird zugestellt (Enter legt wirklich ab).
 *   * `choice` → **wörtlich die Ablage**: ohne gewählte Absicht gibt es keine Zustellung, und der Grund
 *     kommt von der Matrix.
 *   * `open` → kein Träger → `drop-zone-transfer-missing`.
 *   * `refused` / `resolved` → der Fall ist entschieden (`drop-zone-already-decided`, benannter No-op).
 */
export function confirmPresentWorkspaceDropZone(
  state: PresentWorkspaceDropZoneState,
  context: PresentWorkspaceDropZoneContext,
): PresentWorkspaceDropZoneStep {
  const missing = targetRefusal(context.targetDocumentId);
  if (missing) return refuse(state, null, missing);
  const targetDocumentId = context.targetDocumentId as string;
  if (state.phase === 'closed') return refuse(state, targetDocumentId, 'drop-zone-inactive');
  if (isPresentWorkspaceDropZoneSettled(state)) return refuse(state, targetDocumentId, 'drop-zone-already-decided');
  if (state.phase === 'choice') return dropPresentWorkspaceDropZone(state, context);
  if (state.phase === 'open') return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  const offered = state.compatibleIntents[0];
  if (!offered) return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  return routePresentWorkspaceDrop(state, context, offered);
}

/**
 * **Die Tastatur-Absicht: eine Absicht wählen** — dieselbe Zustellung wie die Ablage.
 * Eine **nicht** angebotene Absicht wird nicht stillschweigend übernommen: sie geht durch die Matrix und
 * wird dort benannt abgelehnt (`drop_intent_not_supported` / `intent_unknown`).
 */
export function choosePresentWorkspaceDropIntent(
  state: PresentWorkspaceDropZoneState,
  intent: unknown,
  context: PresentWorkspaceDropZoneContext,
): PresentWorkspaceDropZoneStep {
  const missing = targetRefusal(context.targetDocumentId);
  if (missing) return refuse(state, null, missing);
  const targetDocumentId = context.targetDocumentId as string;
  if (state.phase === 'closed') return refuse(state, targetDocumentId, 'drop-zone-inactive');
  if (isPresentWorkspaceDropZoneSettled(state)) return refuse(state, targetDocumentId, 'drop-zone-already-decided');
  return routePresentWorkspaceDrop(state, context, intent);
}

/** **Die Taste wird zur Absicht** — rein und ohne DOM: nur der Tastenname wird ausgewertet. */
export function resolvePresentWorkspaceDropCommand(
  state: PresentWorkspaceDropZoneState,
  key: unknown,
): PresentWorkspaceDropCommandStep {
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'drop-zone-key-unbound' };
  if (key === 'Escape') return { ok: true, command: { kind: 'dismiss' } };
  if (key === 'Enter' || key === ' ') return { ok: true, command: { kind: 'confirm' } };
  const index = CHOICE_KEYS.indexOf(key);
  if (index < 0) return { ok: false, reason: 'drop-zone-key-unbound' };
  const intent = state.compatibleIntents[index];
  if (!intent) return { ok: false, reason: 'drop-zone-key-unbound' };
  return { ok: true, command: { kind: 'choose', intent } };
}

/**
 * **Die Absicht wird ausgeführt** — jeder Zweig führt in **dieselbe** Zustellung, die auch der Zeiger
 * nimmt. Ein unbekannter Befehl wird **benannt** abgelehnt, nicht verschluckt.
 */
export function applyPresentWorkspaceDropCommand(
  state: PresentWorkspaceDropZoneState,
  command: PresentWorkspaceDropCommand,
  context: PresentWorkspaceDropZoneContext,
): PresentWorkspaceDropZoneStep {
  if (!command || typeof command !== 'object') return refuse(state, state.targetDocumentId, 'drop-zone-command-unknown');
  switch (command.kind) {
    case 'confirm':
      return confirmPresentWorkspaceDropZone(state, context);
    case 'choose':
      return choosePresentWorkspaceDropIntent(state, command.intent, context);
    case 'dismiss':
      return leavePresentWorkspaceDropZone(state, 'keyboard-dismiss');
    default:
      return refuse(state, state.targetDocumentId, 'drop-zone-command-unknown');
  }
}

/**
 * **Der Zug aus Paket 5** — der Empfänger folgt dem Erzeuger, statt einen zweiten Zug zu führen.
 *
 * `isDragActive` und der semantische Träger `session.payload` kommen **wörtlich** aus der vorhandenen
 * Zieh-Session. Läuft kein Zug mehr, schließt ein **überfahrendes** Ziel; ein **entschiedenes** bleibt
 * stehen.
 */
export function openPresentWorkspaceDropZoneFromDragSession(
  state: PresentWorkspaceDropZoneState,
  session: DragSessionState,
  context: PresentWorkspaceDropZoneContext,
): PresentWorkspaceDropZoneStep {
  if (isDragActive(session)) return openPresentWorkspaceDropZone(state, { ...context, payload: session.payload });
  if (state.phase === 'closed') return { ok: false, reason: 'drop-zone-inactive', state };
  return leavePresentWorkspaceDropZone(state, 'drag-left');
}
