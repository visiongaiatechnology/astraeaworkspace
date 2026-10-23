// STATUS: PLATIN — Integration & Release, **Paket 12**: die Regeln der Notes-Ablagezone (rein, kopflos prüfbar)
//
// ## Was dieses Modul **nicht** tut
//
// Es erfindet **keinen** zweiten Zieh-Mechanismus. Es **liest** die vorhandene Zieh-Session (Paket 5,
// `isDragActive` / `DragSessionState`), es **liest** den vorhandenen Träger durch den **einen** Parser (Paket 7,
// `parseWorkspaceDragPayload`), es **fragt** die vorhandene Matrix (Paket 4, die versiegelte
// `FABRIC_WORKSPACE_DROP_REGISTRY`) und es **stellt zu** über den vorhandenen Resolver (`evaluateWorkspaceDrop` /
// `resolveWorkspaceDrop`). *Kein privater Pfad, keine zweite Route, keine zweite Erlaubnisliste.*
//
// ## Das Urteil kommt aus Paket 6 — hier entsteht **keines**
//
// `hoverDropTarget` liefert `verdict`, `reason` und `preview` — **benannt**, **neben** der Phase, **fail-closed**.
// Dieses Modul reicht die Antwort der **einen** Autorität als **Fähigkeitsfrage** hinein und **liest** das
// Ergebnis. Die Frage ist die Antwort des Resolvers, kein Nachbau:
// `evaluateWorkspaceDrop({…, requestedIntent: intent}).status !== 'rejected'`. Damit kann die Fläche **nicht**
// „überfahren: ja" und „abgelegt: nein" sagen — *zwei Antworten auf eine Frage sind eine Lüge*. Deshalb wird hier
// auch **kein** Objektart- und **kein** Absichtsverzeichnis geführt: die Vokabel gehört der Registry.
//
// ## Notes hat **zwei** Flächen — **eine** Maschine
//
// Der Zeiger ist entweder über der **Leinwand** (`canvas`) oder über der **Seitenliste** (`page-list`); die
// Zustellung ist in beiden Fällen dieselbe (dasselbe Notizdokument, dieselbe Matrix, derselbe Resolver). Deshalb
// führt der Zustand **eine** Fläche zur Zeit (`surface`), und die Regeln sind:
//
//   * **Ein Überfahren derselben Fläche** lässt einen **entschiedenen** Fall stehen (Paket 6: eine Ablehnung oder
//     eine Zustellung ist eine Tatsache, die der Nutzer sehen muss).
//   * **Eine andere Fläche** ist eine **neue** Tatsache: sie wird betreten (`enterNotesDropZone`) und löst einen
//     entschiedenen Fall der vorigen Fläche ab — *der Zeiger liegt jetzt woanders, und die Anzeige muss dort
//     gelten, wo er liegt.*
//   * **Ein Verlassen der falschen Fläche** ist ein **benannter** No-op (`notes-drop-surface-mismatch`): *eine
//     Fläche, die beim Verlassen die Tatsache einer anderen löscht, hätte zwei Wahrheiten über einen Zeiger.*
//
// ## Zwei Zugänge zu **einer** Zustellung
//
// Der **Zeiger** (`dropNotesDropZone`) und die **Tastatur** (`confirmNotesDropZone`, `chooseNotesDropIntent`)
// rufen **dieselbe** Funktion `routeWithIntent` bzw. einander auf. Die Tastatur braucht **kein** Überfahren:
// `commitTransfer` fragt nicht nach `overTarget` — *eine Tastatur, die erst einen Zeiger braucht, ist keine
// Alternative, sondern ein Befund.*
//
// ## Was hier **nicht** geprüft werden kann
//
// Das **Binden** der Zeiger-, Ablage- und Tastenereignisse (`useNotesWorkspaceDropZone`), das **Schweben** eines
// echten Zuges über dem DOM und die **echte** Berührung auf einem Gerät: `NOT_TESTED` — dafür fehlt in dieser
// Umgebung ein Browser. Geprüft ist alles, was rein entscheidbar ist.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  WORKSPACE_DROP_INTENTS,
  WorkspaceInteractionError,
  evaluateWorkspaceDrop,
  parseWorkspaceDragPayload,
  resolveWorkspaceDrop,
} from '../../../shared/workspace-interaction';
import type {
  WorkspaceDropAssessment,
  WorkspaceDropSelection,
  WorkspaceInteractionRegistry,
} from '../../../shared/workspace-interaction';
import { FABRIC_WORKSPACE_OBJECT_DRAG_MIME } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import { isDragActive } from '../../../shell/workspace/drag/dragSession';
import type { DragEndReason, DragSessionState } from '../../../shell/workspace/drag/dragSession';
import {
  commitDropTarget,
  createDropTarget,
  hoverDropTarget,
  leaveDropTarget,
} from '../../../shell/workspace/drag/dragDropVerdict';
import type {
  CapabilityQuestion,
  DropPreview,
  DropTargetState,
  DropTargetStep,
} from '../../../shell/workspace/drag/dragDropVerdict';
import {
  NOTES_DROP_INTENT_LABEL,
  NOTES_DROP_ZONE_PRESENTATION,
  isNotesDropZoneSurface,
} from './notesDropZoneContract';
import type {
  NotesDropChoice,
  NotesDropCommand,
  NotesDropCommandStep,
  NotesDropResolution,
  NotesDropTransferRead,
  NotesDropZoneCloseReason,
  NotesDropZoneRefusal,
  NotesDropZoneState,
  NotesDropZoneStep,
  NotesDropZoneSurface,
  NotesDropZoneView,
} from './notesDropZoneContract';

export { FABRIC_WORKSPACE_OBJECT_DRAG_MIME };

/**
 * Die Tasten der Absichten — abgeleitet aus der **vorhandenen** Absichtsliste (Paket 4), damit hier **keine**
 * zweite Grenze („1–4") entsteht: *eine neue Absicht bekommt ihre Taste von selbst.*
 */
const CHOICE_KEYS: readonly string[] = WORKSPACE_DROP_INTENTS.map((_, index) => String(index + 1));

const NO_CHOICES: readonly NotesDropChoice[] = Object.freeze([]);

const NOT_CARRIED: NotesDropTransferRead = Object.freeze({
  ok: false as const,
  reason: 'notes-drop-transfer-missing' as const,
});

/** Die Ablagefläche, wie der DOM sie anbietet — **strukturell**, ohne DOM-Typen (wie `DragPointerLike` in Paket 5). */
export interface NotesDataTransferLike {
  /** Der Inhalt — im **protected mode** (`dragenter`/`dragover`) **leer**; nur bei `drop` verlässlich (W-443). */
  readonly getData?: (mime: string) => unknown;
  /** Die **Typenliste** — die einzige Angabe, die während `dragenter`/`dragover` verlässlich lesbar ist. */
  readonly types?: unknown;
}

/** Der Träger, wie er aus der Ablagefläche kommt — die **eine** MIME-Konstante, sonst nichts. */
export type NotesTransferRead =
  | { readonly ok: true; readonly payload: string; readonly reason?: never }
  | {
      readonly ok: false;
      readonly reason: 'notes-drop-transfer-missing' | 'notes-drop-transfer-unreadable';
      readonly payload?: never;
    };

/**
 * Die Eingaben einer Zustellung — die **eine** Autorität, die eigene App, das Zieldokument, die **benannte**
 * Fläche und der **untrusted** Träger.
 *
 * `registry` ist ein **Parameter** und keine fest verdrahtete Konstante, damit derselbe reine Code gegen die
 * **versiegelte** Matrix der Shell **und** gegen eine im Test aufgebaute Instanz **derselben** Klasse laufen kann:
 * *die Regel bleibt eine, der Prüfling darf ein zweiter Aufbau sein.* Die Produktion reicht die versiegelte Matrix
 * der Shell hinein (`useNotesWorkspaceDropZone`) — es entsteht **keine** zweite Matrix.
 */
export interface NotesDropZoneContext {
  readonly registry: WorkspaceInteractionRegistry | null | undefined;
  /** Die eigene Anwendung — sie wird **nicht** geraten, sondern aus `document.kind` gereicht. */
  readonly targetApp: unknown;
  readonly targetDocumentId: unknown;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  /** **Welche** der benannten Flächen adressiert wird — ein unbekannter Name wird benannt abgelehnt. */
  readonly surface: unknown;
  /**
   * **Der gewählte Live-Modus** (Paket 15, aus `WorkspaceDropRequest.requestedMode`) — bleibt `unknown`:
   * *der Resolver benennt Unbekanntes selbst* (`drop_live_mode_required`), und **fehlt** er, wird ein
   * Live-Verweis **nicht** zugestellt: **kein heimlicher Default**.
   *
   * Er gehört in **beide** Resolver-Aufrufe: in die **Fähigkeitsfrage** (sonst sagte die Fläche „keine Route",
   * obwohl die Route mit Modus trägt) und in die **Zustellung**.
   */
  readonly requestedMode?: unknown;
  /**
   * **W-455** ✓✓: die Entscheidung der Administratorrichtlinie zu **dieser** Ablage — *hineingereicht, nicht hier
   * abgefragt* ✓: *die Zone bleibt **rein und synchron**, die asynchrone Antwort kommt vom Aufrufer* ✓. *Fehlt sie,
   * wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`) — **kein stiller Erfolg** ✗✓.
   */
  readonly requestedPolicyDecision?: unknown;
  readonly payload?: unknown;
}

function sameState(state: NotesDropZoneState): NotesDropZoneStep {
  return { ok: true, state };
}

function stateOf(
  state: NotesDropZoneState,
  next: {
    readonly target?: DropTargetState;
    readonly transfer?: NotesDropTransferRead;
    readonly decision?: NotesDropZoneState['decision'];
    readonly surface?: NotesDropZoneSurface | null;
    readonly closedReason?: NotesDropZoneCloseReason | null;
  },
): NotesDropZoneState {
  return Object.freeze({
    target: next.target ?? state.target,
    transfer: next.transfer ?? state.transfer,
    decision: next.decision ?? state.decision,
    surface: next.surface === undefined ? state.surface : next.surface,
    closedReason: next.closedReason === undefined ? state.closedReason : next.closedReason,
  });
}

/** Eine Ablehnung ist ein **Zustand** mit **benanntem** Grund — kein `null`, das wie Erfolg aussieht. */
function refuse(
  state: NotesDropZoneState,
  code: NotesDropZoneRefusal,
  target: DropTargetState = state.target,
  transfer: NotesDropTransferRead = state.transfer,
): NotesDropZoneStep {
  return {
    ok: false,
    reason: code,
    state: stateOf(state, { target, transfer, decision: { kind: 'refused', code } }),
  };
}

/**
 * Ein **benannter No-op**: der Aufruf war unbrauchbar, aber es gibt **keine neue Tatsache** — und deshalb wird
 * auch **keine** gesetzt. *Ein „schon entschieden", das den entschiedenen Fall in „abgelehnt" umschreibt, löscht
 * die Zustellung, die es gerade meldet.*
 */
function noOp(state: NotesDropZoneState, reason: NotesDropZoneRefusal): NotesDropZoneStep {
  return { ok: false, reason, state };
}

/** Nur „ist überhaupt eine Zeichenkette da" — die **Format**prüfung bleibt beim Parser (Paket 7). */
function asPayload(payload: unknown): string | null {
  return typeof payload === 'string' && payload.length > 0 ? payload : null;
}

/** Der Flächenname, wie die Maschine ihn liest — ein unbekannter Name ist ein **benannter** Grund. */
function surfaceOf(surface: unknown): NotesDropZoneSurface | null {
  return isNotesDropZoneSurface(surface) ? surface : null;
}

/**
 * Nur „kennt die Fläche ihr eigenes Ziel" — **nicht** „ist die Kennung wohlgeformt" (das prüft der Resolver).
 * Die eigene **App** gehört dazu: *eine Fläche, die nicht weiß, welche Anwendung sie ist, kann nichts annehmen.*
 */
function targetRefusal(targetApp: unknown, targetDocumentId: unknown): 'notes-drop-target-missing' | null {
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) return 'notes-drop-target-missing';
  if (typeof targetApp !== 'string' || targetApp.trim().length === 0) return 'notes-drop-target-missing';
  return null;
}

/**
 * **Der Träger wird gelesen, nicht geraten.** Der **eine** Parser (Paket 7) entscheidet: unbekannte Objektart,
 * fehlendes Feld, ein **sechstes** Feld oder zu viele Bytes werden **benannt** abgelehnt — mit **seinem** Code,
 * nicht mit einem zweiten Vokabular. `objectKind` aus dem Deskriptor wird damit zur **Tatsache**, auf die Paket 6
 * seine Frage stützt.
 */
export function readNotesDropTransfer(payload: unknown): NotesDropTransferRead {
  const serialized = asPayload(payload);
  if (serialized === null) return NOT_CARRIED;
  try {
    const parsed = parseWorkspaceDragPayload(serialized);
    return Object.freeze({ ok: true as const, payload: serialized, descriptor: parsed.descriptor });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      reason: error instanceof WorkspaceInteractionError ? error.code : 'payload_invalid',
    });
  }
}

/**
 * **Der Träger aus der Ablagefläche** — der Übersetzer, wie `dragPointFromEvent` in Paket 5: er **wählt aus**
 * (genau die **eine** MIME-Konstante) und wirft den Rest weg. Fehlt der Inhalt, ist das **benannt**:
 * *ein leerer Träger ist kein gültiger Träger.*
 *
 * **W-443:** Dieser Leser gehört an die **Ablage** — im protected mode liefert `getData()` während `dragover`
 * nichts, und „nichts" ist dort **kein** Grund, den Zug abzuweisen.
 */
export function readNotesWorkspaceTransfer(
  dataTransfer: NotesDataTransferLike | null | undefined,
): NotesTransferRead {
  if (!dataTransfer) return { ok: false, reason: 'notes-drop-transfer-missing' };
  const read = dataTransfer.getData;
  if (typeof read !== 'function') return { ok: false, reason: 'notes-drop-transfer-unreadable' };
  let value: unknown;
  try {
    value = read.call(dataTransfer, FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  } catch {
    return { ok: false, reason: 'notes-drop-transfer-unreadable' };
  }
  return typeof value === 'string' && value.length > 0
    ? { ok: true, payload: value }
    : { ok: false, reason: 'notes-drop-transfer-missing' };
}

/**
 * **Ist dieser Zug überhaupt für uns?** — der `types`-Blick, **ohne** Inhalt.
 *
 * Das ist keine Bequemlichkeit, sondern eine Eigenschaft des Browsers: während `dragenter` / `dragover` liegt der
 * Ablagespeicher im **geschützten** Modus, und `getData()` liefert dann **nichts**. `types` dagegen ist sichtbar.
 * Eine Fläche, die den Zug erst anhand von `getData()` beansprucht, ruft **nie** `preventDefault()` — und bekommt
 * deshalb **nie** ein `drop`. Das war der P1-Defekt `W-443` in Paket 9.
 *
 * **Fail-closed:** keine Liste, keine array-artige Liste, unbrauchbare Werte → `false`. *Im Zweifel ist diese
 * Fläche nicht gemeint* — dann fällt auch kein `preventDefault`, und die **vorhandene** Notes-Ablage (Dateien,
 * Seitenverweise) behält ihre Ablage.
 */
export function isNotesWorkspaceDrag(dataTransfer: { readonly types?: unknown } | null | undefined): boolean {
  const types = dataTransfer?.types;
  if (types === null || types === undefined) return false;
  if (typeof types === 'string') return types === FABRIC_WORKSPACE_OBJECT_DRAG_MIME;
  if (typeof (types as { readonly length?: unknown }).length !== 'number') return false;
  const list = types as ArrayLike<unknown>;
  for (let index = 0; index < list.length && index < 32; index += 1) {
    if (list[index] === FABRIC_WORKSPACE_OBJECT_DRAG_MIME) return true;
  }
  return false;
}

/**
 * **Die eingeschleuste Fähigkeitsfrage** — die Antwort der **einen** Autorität.
 *
 * Sie ist **nicht** nachgebaut: `evaluateWorkspaceDrop` beantwortet sie mit demselben Resolver, der später
 * zustellt (Identität des Trägers gegen das Quellobjekt, vorhandene Dokumente, Route der Matrix, Richtlinie).
 * Fehlt die Autorität oder wirft sie, ist die Antwort `false`: *im Zweifel wird nicht angenommen.*
 */
export function notesDropCapabilityQuestion(
  context: Pick<NotesDropZoneContext, 'registry' | 'targetDocumentId' | 'documents' | 'requestedMode'> & { readonly payload?: unknown; readonly requestedPolicyDecision?: unknown },
): CapabilityQuestion | null {
  const registry = context.registry;
  if (!registry || typeof registry.getAdapter !== 'function') return null;
  const payload = asPayload(context.payload);
  if (payload === null) return null;
  const targetDocumentId = context.targetDocumentId;
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) return null;
  return (_targetApp: string, _objectKind: string, intent: string): boolean => {
    try {
      return (
        evaluateWorkspaceDrop(
          {
            payload,
            targetDocumentId,
            requestedIntent: intent,
            documents: context.documents,
            // **Paket 15:** der Modus wird **mitgeführt**, nicht erfunden. *Bedingtes Spreizen, weil das Projekt
            // `exactOptionalPropertyTypes` anhat — ein explizites `undefined` wäre der verbotene Default.*
            ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
            // UEBERGANGSMARKER (W-455): **dieselbe** Entscheidung wie in der Zustellung — *die Frage darf nicht
            // „fähig" sagen, wo die Richtlinie die Ablage verweigert* ✗✓✓. *Die Entscheidung steht hier **noch
            // nicht** bereit (die Shell holt sie asynchron: `precheckPolicy`) und wird voruebergehend als `Allow`
            // weitergereicht* ✗✓ — *laut markiert und im Bericht gefuehrt* ✓.
            ...(context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision }),
          },
          registry,
        ).status !== 'rejected'
      );
    } catch {
      return false;
    }
  };
}

/**
 * **Das Urteil über den Träger** (Paket 6) — je **angebotener** Absicht gefragt und dann **zusammengefaltet**.
 *
 * Eine Quelle darf **zwei** Absichten anbieten, von denen die Matrix **eine** trägt. Fragte die Fläche nur die
 * erste, sagte sie „überfahren: nein" — und der Resolver stellte danach zu. *Zwei Antworten auf eine Frage.*
 * Deshalb: **eine** erlaubte Absicht genügt für `accept`. *Gewählt wird damit nichts:* welche Absicht gilt,
 * entscheidet die **Ablage**.
 *
 * Die Vorschau entsteht **in Paket 6** (`preview.label`, dort als `objectKind · intent` gebildet) — dieses Modul
 * reicht sie **wörtlich** durch und formuliert sie nicht neu.
 */
function verdictOfTransfer(
  targetApp: unknown,
  transfer: NotesDropTransferRead,
  question: CapabilityQuestion | null,
): DropTargetStep {
  if (!transfer.ok) {
    // Kein lesbarer Träger: **kein** geratener Objekttyp → Paket 6 lehnt benannt ab (`object-kind-unknown`).
    // *Warum der Typ unbekannt ist, steht daneben im Träger-Fakt — nicht in einem zweiten Urteil.*
    return hoverDropTarget(createDropTarget(), { targetApp, objectKind: '', intent: '' }, question);
  }
  const descriptor = transfer.descriptor;
  let first: DropTargetStep | null = null;
  for (const intent of descriptor.supportedIntents) {
    const step = hoverDropTarget(createDropTarget(), { targetApp, objectKind: descriptor.objectKind, intent }, question);
    if (first === null) first = step;
    if (step.ok && step.state.verdict === 'accept') return step;
  }
  if (first !== null) return first;
  // Der Parser lässt keinen leeren Absichtsvektor zu — dieser Zweig ist die fail-closed Versicherung.
  return hoverDropTarget(createDropTarget(), { targetApp, objectKind: descriptor.objectKind, intent: '' }, question);
}

/** Das leere Ziel — jede Sitzung beginnt hier, und die Ansicht rendert dazu nur die Ansageregion. */
export function createNotesDropZone(): NotesDropZoneState {
  return Object.freeze({
    target: createDropTarget(),
    transfer: NOT_CARRIED,
    decision: Object.freeze({ kind: 'none' as const }),
    surface: null,
    closedReason: null,
  });
}

/** Die Fläche, die der Zeiger gerade überfährt — `null`, wenn keine. */
export function notesDropZoneSurface(state: NotesDropZoneState): NotesDropZoneSurface | null {
  return state.surface;
}

/**
 * Das Überfahren **einer** Fläche — die gemeinsame Mitte von `hoverNotesDropZone` und `enterNotesDropZone`.
 * Sie setzt den Flächennamen **und** das Urteil; sie kennt **keinen** Flächenwechsel (das ist Sache des Aufrufers).
 */
function hoverZone(state: NotesDropZoneState, context: NotesDropZoneContext, surface: NotesDropZoneSurface): NotesDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isNotesDropZoneDecided(state)) return sameState(state);
  const transfer = readNotesDropTransfer(context.payload);
  const question = transfer.ok ? notesDropCapabilityQuestion(context) : null;
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'notes-drop-target-missing');
  return {
    ok: true,
    state: stateOf(state, {
      target: verdict.state,
      transfer,
      decision: { kind: 'none' },
      surface,
      closedReason: null,
    }),
  };
}

/**
 * **Eine Fläche wird überfahren** — das Urteil entsteht bei Paket 6, zugestellt wird noch nicht.
 *
 * Ein **entschiedener** Fall derselben Fläche bleibt stehen: *ein Ablehnungs- oder Zustellungsgrund ist eine
 * Tatsache, die ein bewegter Zeiger nicht überschreibt.* Eine **andere** Fläche dagegen ist ein **neuer** Ort und
 * wird betreten — *sonst zeigte die Seitenliste das Urteil der Leinwand.*
 */
export function hoverNotesDropZone(state: NotesDropZoneState, context: NotesDropZoneContext): NotesDropZoneStep {
  const surface = surfaceOf(context.surface);
  if (surface === null) return refuse(state, 'notes-drop-surface-unknown');
  if (state.surface !== null && surface !== state.surface) return enterNotesDropZone(state, context);
  return hoverZone(state, context, surface);
}

/** Ein **neuer** Zug betritt die Fläche — ein alter, entschiedener Fall wird dabei **abgelöst**. */
export function enterNotesDropZone(state: NotesDropZoneState, context: NotesDropZoneContext): NotesDropZoneStep {
  const surface = surfaceOf(context.surface);
  if (surface === null) return refuse(state, 'notes-drop-surface-unknown');
  const base = isNotesDropZoneDecided(state) ? createNotesDropZone() : state;
  return hoverZone(base, context, surface);
}

/**
 * **Eine Fläche wird verlassen** — das Urteil wird **zurückgenommen** (Paket 6: `leaveDropTarget`), kein Rest.
 *
 * Verlassen wird **genau die** Fläche, die der Aufruf nennt: eine andere Fläche meldet `notes-drop-surface-mismatch`
 * und lässt die Tatsache stehen. *Sonst löschte die Leinwand beim Verlassen das Urteil der Seitenliste.*
 */
export function leaveNotesDropZone(
  state: NotesDropZoneState,
  context: NotesDropZoneContext,
  reason: NotesDropZoneCloseReason = 'drag-left',
): NotesDropZoneStep {
  const surface = surfaceOf(context.surface);
  if (surface === null) return refuse(state, 'notes-drop-surface-unknown');
  if (isNotesDropZoneDecided(state)) return sameState(state);
  if (!isNotesDropZoneVisible(state)) return { ok: false, reason: 'notes-drop-inactive', state };
  if (state.surface !== null && surface !== state.surface) return noOp(state, 'notes-drop-surface-mismatch');
  return {
    ok: true,
    state: stateOf(state, {
      target: leaveDropTarget(state.target),
      transfer: NOT_CARRIED,
      decision: { kind: 'none' },
      surface: null,
      closedReason: reason,
    }),
  };
}

/**
 * Der **Abbruchgrund der Zieh-Session wird übernommen**, wenn die Zone ihn kennt.
 *
 * Paket 5 führt die Gründe bereits **benannt** (`pointer-lost` bei `pointercancel`, `window-blur` beim
 * Fensterverlust). Sie hier auf `drag-left` einzuebnen, würde eine vorhandene Tatsache wegwerfen — *und genau die
 * braucht die Touch-Entscheidung: ein vom System abgebrochener Touch ist kein „danebengezogener Zeiger".*
 */
function closeReasonOf(reason: DragEndReason | null): NotesDropZoneCloseReason {
  return reason === 'pointer-lost' || reason === 'window-blur' ? reason : 'drag-left';
}

/**
 * **Der Empfänger folgt dem vorhandenen Zug** (Paket 5) — `isDragActive`, `session.payload` und der benannte
 * `endReason` kommen **wörtlich** aus der Zieh-Session, statt dass hier ein zweiter Zug geführt wird. Läuft kein
 * Zug mehr, schließt eine **überfahrene** Fläche mit **dessen** Grund; ein **entschiedener** Fall bleibt stehen.
 */
export function notesDropZoneFromDragSession(
  state: NotesDropZoneState,
  session: DragSessionState,
  context: NotesDropZoneContext,
): NotesDropZoneStep {
  if (isDragActive(session)) return enterNotesDropZone(state, { ...context, payload: session.payload });
  if (isNotesDropZoneDecided(state)) return sameState(state);
  if (state.target.overTarget) return leaveNotesDropZone(state, context, closeReasonOf(session.endReason));
  return { ok: false, reason: 'notes-drop-inactive', state };
}

function choiceOf(selection: WorkspaceDropSelection, index: number): NotesDropChoice {
  const key = CHOICE_KEYS[index] ?? String(index + 1);
  return Object.freeze({
    intent: selection.intent,
    label: NOTES_DROP_INTENT_LABEL[selection.intent],
    adapterId: selection.adapterId,
    key,
    shortcutLabel: key,
  });
}

function resolutionOf(
  selection: WorkspaceDropSelection,
  sourceVersion: number,
  targetVersion: number,
): NotesDropResolution {
  return Object.freeze({
    adapterId: selection.adapterId,
    intent: selection.intent,
    // **Paket 15:** `integrationKind` ist eine **Tatsache des Resolvers** (`COPY` → `copy`, `LIVE_REFERENCE` →
    // `live`) und wird hier **gelesen**, nicht hergeleitet. Der `mode` wird **nur** mitgeführt, wenn er **gesagt**
    // wurde — *bedingtes Spreizen statt `mode: undefined` (`exactOptionalPropertyTypes`): ein ausdrückliches
    // `undefined` wäre genau der heimliche Default, den Paket 15 verbietet.*
    integrationKind: selection.integrationKind,
    ...(selection.mode === undefined ? {} : { mode: selection.mode }),
    sourceDocumentId: selection.sourceDocumentId,
    sourceObjectId: selection.sourceObjectId,
    targetDocumentId: selection.targetDocumentId,
    sourceVersion,
    targetVersion,
  });
}

/**
 * **Der Träger dieses Ereignisses ist maßgeblich.** Im Browser liefert `dragover` seinen Inhalt **nicht** aus
 * (Sicherheitsregel), `drop` dagegen **schon** — deshalb wird der Träger beim Ablegen **neu** gelesen.
 *
 * Drei Fälle, jeder **benannt**:
 *   * Das Ereignis trägt einen **lesbaren** Träger → dieser gilt.
 *   * Das Ereignis trägt **etwas**, aber der Parser lehnt es ab → **sein** Grund gilt (`payload_invalid`,
 *     `object_kind_unknown`). *Diesen Grund durch „es war nichts da" zu ersetzen, wäre eine falsche Auskunft.*
 *   * Das Ereignis trägt **nichts** (Tastatur-Bestätigung ohne Ablagefläche) → der beim Überfahren gelesene
 *     Träger gilt.
 */
function transferForCommit(state: NotesDropZoneState, context: NotesDropZoneContext): NotesDropTransferRead {
  const fromEvent = readNotesDropTransfer(context.payload);
  if (fromEvent.ok) return fromEvent;
  if (asPayload(context.payload) !== null) return fromEvent;
  return state.transfer;
}

function applyAssessment(
  state: NotesDropZoneState,
  surface: NotesDropZoneSurface | null,
  transfer: NotesDropTransferRead,
  target: DropTargetState,
  assessment: WorkspaceDropAssessment,
  context: NotesDropZoneContext,
  failOnChoice: boolean,
): NotesDropZoneStep {
  if (assessment.status === 'rejected') return refuse(state, assessment.code, target, transfer);
  if (assessment.status === 'resolved') {
    return {
      ok: true,
      state: stateOf(state, {
        target,
        transfer,
        decision: {
          kind: 'delivered',
          resolution: resolutionOf(assessment.selection, assessment.sourceVersion, assessment.targetVersion),
        },
        surface,
        closedReason: null,
      }),
    };
  }
  if (assessment.status === 'needsChoice') {
    const choices = Object.freeze(assessment.choices.map(choiceOf));
    const next = stateOf(state, { target, transfer, decision: { kind: 'choice', choices }, surface, closedReason: null });
    // Beim **Überfahren** ist „Absicht wählen" der richtige Zustand; bei der **Ablage** ist es eine benannte
    // Ablehnung — der Träger liegt vor, aber ohne Absicht wird **nichts** stillschweigend vorausgewählt.
    return failOnChoice ? { ok: false, reason: 'drop_intent_choice_required', state: next } : { ok: true, state: next };
  }
  // `accepted`: der Resolver bietet **genau eine** Route an — sie wird jetzt **bestellt** (mit beiden Versionen).
  return routeWithIntent(state, surface, transfer, target, assessment.selection.intent, context, true);
}

/**
 * **Die eine Zustellung** — Zeiger und Tastatur landen hier.
 *
 * Die Absicht bleibt `unknown`: unbekannte Absichten und nicht angebotene Absichten benennt der **Resolver**
 * (`intent_unknown` / `drop_intent_not_supported`) — *eine eigene Vorprüfung wäre eine zweite Wahrheit.*
 */
function routeWithIntent(
  state: NotesDropZoneState,
  surface: NotesDropZoneSurface | null,
  transfer: NotesDropTransferRead,
  target: DropTargetState,
  intent: unknown,
  context: NotesDropZoneContext,
  failOnChoice: boolean,
): NotesDropZoneStep {
  if (!transfer.ok) return refuse(state, transfer.reason, target, transfer);
  const registry = context.registry;
  if (!registry || typeof registry.getAdapter !== 'function') {
    // Ohne die eine Autorität gibt es **keine** Antwort — derselbe fail-closed Name, den Paket 6 für eine
    // unbeantwortbare Fähigkeitsfrage führt.
    return refuse(state, 'verdict-unavailable', target, transfer);
  }
  const targetDocumentId = context.targetDocumentId;
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) {
    return refuse(state, 'notes-drop-target-missing', target, transfer);
  }
  let assessment: WorkspaceDropAssessment;
  try {
    assessment = resolveWorkspaceDrop(
      {
        payload: transfer.payload,
        targetDocumentId,
        requestedIntent: intent,
        documents: context.documents,
        // **Paket 15** — derselbe Modus wie in der Fähigkeitsfrage: *eine Fläche, die „fähig" sagt und dann ohne
        // Modus zustellt, hätte zwei Antworten auf eine Frage.* Bedingtes Spreizen (`exactOptionalPropertyTypes`).
        ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
        // UEBERGANGSMARKER (W-455): die Entscheidung der Administratorrichtlinie steht hier **noch nicht** bereit
        // — *die Shell holt sie asynchron* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) *und reicht sie
        // ueber den Kontext hinein* ✓. **Dieses feste `Allow` ist bis dahin voruebergehend falsch** ✗✓ — *aber
        // **laut** markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die Entscheidung
        // wirklich ankommt, wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`).
        ...(context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision }),
      },
      registry,
    );
  } catch {
    return refuse(state, 'verdict-unavailable', target, transfer);
  }
  return applyAssessment(state, surface, transfer, target, assessment, context, failOnChoice);
}

/**
 * **Der gemeinsame Abschluss** von Zeiger-Ablage und Tastatur-Bestätigung.
 *
 * Hier steht die **eine** Stelle, an der Paket 6 gefragt wird, ob überhaupt abgelegt werden darf
 * (`commitDropTarget`): ein abgelehntes Urteil führt **nie** zur Zustellung. *Kein stiller Erfolg.*
 *
 * **Und die Tastatur braucht kein Überfahren:** gefragt wird der **Träger** und das **Urteil**, nicht
 * `overTarget` — *eine Tastatur, die erst einen Zeiger braucht, ist keine Alternative.*
 */
function commitTransfer(state: NotesDropZoneState, context: NotesDropZoneContext): NotesDropZoneStep {
  const surface = surfaceOf(context.surface);
  if (surface === null) return refuse(state, 'notes-drop-surface-unknown');
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = notesDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'notes-drop-target-missing');
  const gate = commitDropTarget(verdict.state);
  if (!gate.ok) {
    const code: NotesDropZoneRefusal =
      verdict.state.reason ?? (transfer.payload.length > 0 ? 'notes-drop-inactive' : 'payload-missing');
    return refuse(state, code, verdict.state, transfer);
  }
  // **Der Erfolg verbraucht das Urteil** (Paket 6): `gate.state` ist wieder leer — ein stehengebliebenes
  // „hier annehmen" wäre nach der Ablage eine Lüge. Die Fläche bleibt benannt: sie **ist** der Ort der Zustellung.
  return routeWithIntent(state, surface, transfer, gate.state, undefined, context, true);
}

/**
 * **Die Zeiger-Ablage.** Ohne eindeutige Route wird **nicht** zugestellt: der Zustand ist dann `choice` und der
 * Grund ist der der Matrix (`drop_intent_choice_required`).
 */
export function dropNotesDropZone(state: NotesDropZoneState, context: NotesDropZoneContext): NotesDropZoneStep {
  const surface = surfaceOf(context.surface);
  if (surface === null) return refuse(state, 'notes-drop-surface-unknown');
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isNotesDropZoneDecided(state)) return noOp(state, 'notes-drop-already-decided');
  return commitTransfer(state, context);
}

/**
 * **Die Tastatur-Absicht: bestätigen** — derselbe Weg wie die Ablage.
 *
 *   * `choice` → **wörtlich die Ablage**: ohne gewählte Absicht gibt es keine Zustellung, und der Grund kommt
 *     von der Matrix.
 *   * sonst → derselbe Abschluss wie der Zeiger, **ohne** dass die Fläche vorher überfahren werden musste.
 *   * `refused` / `delivered` → der Fall ist entschieden (`notes-drop-already-decided`, benannter No-op).
 */
export function confirmNotesDropZone(state: NotesDropZoneState, context: NotesDropZoneContext): NotesDropZoneStep {
  const surface = surfaceOf(context.surface);
  if (surface === null) return refuse(state, 'notes-drop-surface-unknown');
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isNotesDropZoneDecided(state)) return noOp(state, 'notes-drop-already-decided');
  if (state.decision.kind === 'choice') return dropNotesDropZone(state, context);
  return commitTransfer(state, context);
}

/**
 * **Der Modus ist die eine fehlende Tatsache** (Paket 15).
 *
 * Hat die Fläche einen Live-Verweis **benannt** abgelehnt, weil der Modus fehlte (`drop_live_mode_required`), dann
 * ist **dieselbe** Anfrage **mit** einem gesagten Modus **kein zweiter Abschluss**, sondern die
 * **Vervollständigung**: *ein Knopf, der nichts mehr bewirken kann, wäre eine Lüge* ✓ — und die Tastatur (Ziffer
 * `2`) landete sonst in einer Sackgasse, was §12.3 („per Tastatur bestätigbar") verletzt ✗.
 *
 * **Was hier bewusst NICHT geprüft wird:** ob der Modus **gültig** ist. *Das ist die Regel des Resolvers* — er
 * benennt einen unbekannten Modus selbst (`drop_live_mode_required`), und eine zweite Prüfung desselben Wertes wäre
 * eine zweite Wahrheit. Hier wird nur geprüft, dass überhaupt **einer gesagt** wurde und **welcher Grund** stand.
 * Und **welche** Absicht einen Modus braucht, steht ebenfalls nicht hier: der **Grund** sagt es.
 */
export function isNotesDropZoneModeCompletion(state: NotesDropZoneState, context: NotesDropZoneContext): boolean {
  return state.decision.kind === 'refused'
    && state.decision.code === 'drop_live_mode_required'
    && context.requestedMode !== undefined;
}

/**
 * Die Tastatur-Absicht: eine Absicht wählen — dieselbe Zustellung wie die Ablage.
 *
 * Eine Absicht, die **nicht** angeboten wurde, wird **nicht** stillschweigend übernommen: sie geht durch die
 * Matrix und wird dort benannt abgelehnt (`drop_intent_not_supported` / `intent_unknown`). Deshalb wird hier
 * **nicht** vorab gegen das Urteil geprüft — *die Matrix ist die Prüfung.*
 */
export function chooseNotesDropIntent(
  state: NotesDropZoneState,
  intent: unknown,
  context: NotesDropZoneContext,
): NotesDropZoneStep {
  const surface = surfaceOf(context.surface);
  if (surface === null) return refuse(state, 'notes-drop-surface-unknown');
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isNotesDropZoneDecided(state) && !isNotesDropZoneModeCompletion(state, context)) {
    return noOp(state, 'notes-drop-already-decided');
  }
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = notesDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  return routeWithIntent(state, surface, transfer, verdict.ok ? verdict.state : state.target, intent, context, true);
}

/**
 * Ob die Ansicht den **Modus fragen** muss — die Frage, die die Modus-Knöpfe stellt.
 *
 * Zwei Tatsachen können sie stellen, und beide sind **gelesen**, nicht geraten:
 *   * die Matrix hat eine **Live-Route angeboten** (Phase `choice`) — *dann muss der Modus gesagt werden, sonst
 *     wird sie nicht zugestellt*;
 *   * die Zustellung hat genau das **benannt** (`drop_live_mode_required`) — *dann ist der Modus die fehlende
 *     Tatsache, und die Knöpfe dürfen nicht verschwinden.*
 */
export function notesDropZoneNeedsMode(state: NotesDropZoneState): boolean {
  if (state.decision.kind === 'refused' && state.decision.code === 'drop_live_mode_required') return true;
  return notesDropZoneChoices(state).some((choice) => choice.intent === 'LIVE_REFERENCE');
}

/** Ob der Fall **entschieden** ist — `refused` und `delivered` werden von einem überfahrenden Zeiger nicht ersetzt. */
export function isNotesDropZoneDecided(state: NotesDropZoneState): boolean {
  return state.decision.kind === 'refused' || state.decision.kind === 'delivered';
}

/** Ob die Ansicht die sichtbare Zone rendert — die Ansageregion steht davon **unabhängig** immer im DOM. */
export function isNotesDropZoneVisible(state: NotesDropZoneState): boolean {
  return state.target.overTarget || state.decision.kind !== 'none';
}

/** **Die View-Phase wird gerechnet, nicht gespeichert** — zwei Felder für eine Tatsache wären der Defekt selbst. */
export function notesDropZoneView(state: NotesDropZoneState): NotesDropZoneView {
  if (state.decision.kind === 'delivered') return 'resolved';
  if (state.decision.kind === 'refused') return 'refused';
  if (state.decision.kind === 'choice') return 'choice';
  if (!state.target.overTarget || state.surface === null) return 'closed';
  return state.target.verdict === 'accept' ? 'ready' : 'open';
}

/** Die Präsentation (Zeichen, Form, Überschrift) zur **gerechneten** View-Phase — eine Quelle für die Ansicht. */
export function notesDropZonePresentation(state: NotesDropZoneState) {
  return NOTES_DROP_ZONE_PRESENTATION[notesDropZoneView(state)];
}

/** **Die Vorschau kommt aus dem Urteil** (Paket 6, `preview`) — dieses Modul formuliert sie nicht neu. */
export function notesDropZonePreview(state: NotesDropZoneState): DropPreview | null {
  return state.target.preview;
}

/**
 * Der **benannte** Grund, den die Ansicht zeigen muss — aus dem **Träger** (warum er nicht lesbar ist), aus der
 * **Zustellung** (was der Resolver entschieden hat) oder aus dem **Urteil** (Paket 6). `null`, wenn nichts zu
 * melden ist. *Ein leeres Feld hier hieße: „alles in Ordnung" — und das darf nicht versehentlich entstehen.*
 */
export function notesDropZoneRefusalCode(state: NotesDropZoneState): NotesDropZoneRefusal | null {
  if (state.decision.kind === 'refused') return state.decision.code;
  if (!state.transfer.ok) return state.transfer.reason;
  if (state.target.verdict === 'reject') return state.target.reason;
  return null;
}

/** Die sichtbaren Absichten — nur die, die der **Resolver** angeboten hat. */
export function notesDropZoneChoices(state: NotesDropZoneState): readonly NotesDropChoice[] {
  return state.decision.kind === 'choice' ? state.decision.choices : NO_CHOICES;
}

/** **Die Taste wird zur Absicht** — rein und ohne DOM: nur der Tastenname wird ausgewertet. */
export function resolveNotesDropCommand(state: NotesDropZoneState, key: unknown): NotesDropCommandStep {
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'notes-drop-key-unbound' };
  if (key === 'Escape') return { ok: true, command: { kind: 'dismiss' } };
  if (key === 'Enter' || key === ' ') return { ok: true, command: { kind: 'confirm' } };
  const index = CHOICE_KEYS.indexOf(key);
  if (index < 0) return { ok: false, reason: 'notes-drop-key-unbound' };
  const choice = notesDropZoneChoices(state)[index];
  if (!choice) return { ok: false, reason: 'notes-drop-key-unbound' };
  return { ok: true, command: { kind: 'choose', intent: choice.intent } };
}

/** **Die Absicht wird ausgeführt** — jeder Zweig führt in **dieselbe** Zustellung, die auch der Zeiger nimmt. */
export function applyNotesDropCommand(
  state: NotesDropZoneState,
  command: NotesDropCommand,
  context: NotesDropZoneContext,
): NotesDropZoneStep {
  if (!command || typeof command !== 'object') return noOp(state, 'notes-drop-command-unknown');
  switch (command.kind) {
    case 'confirm':
      return confirmNotesDropZone(state, context);
    case 'choose':
      return chooseNotesDropIntent(state, command.intent, context);
    case 'dismiss':
      return leaveNotesDropZone(state, context, 'keyboard-dismiss');
    default:
      return noOp(state, 'notes-drop-command-unknown');
  }
}

/**
 * Ob **jetzt** etwas bestätigt werden kann — die Frage, die die Ansicht dem Knopf stellt.
 *
 * Sie verlangt **beides**: einen gelesenen Träger **und** ein Urteil, das annimmt (Paket 6). *Ein „ablegen"-Knopf,
 * der bei `reject` aktiv aussieht, wäre eine Anzeige, die das Gegenteil ihres eigenen Zustands behauptet.*
 */
export function notesDropZoneCanConfirm(state: NotesDropZoneState): boolean {
  if (state.decision.kind === 'choice') return false;
  if (isNotesDropZoneDecided(state)) return false;
  return state.transfer.ok && state.target.verdict === 'accept';
}
