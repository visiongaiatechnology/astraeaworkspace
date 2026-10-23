// STATUS: PLATIN — Integration & Release, **Paket 13**: die Regeln der Publish-Ablagezone (rein, kopflos prüfbar)
//
// ## Was dieses Modul **nicht** tut
//
// Es erfindet **keinen** zweiten Zieh-Mechanismus. Es **liest** die vorhandene Zieh-Session (Paket 5), es **liest**
// den vorhandenen Träger durch den **einen** Parser (Paket 7, `parseWorkspaceDragPayload`), es **fragt** die
// vorhandene Matrix (Paket 4, die versiegelte `FABRIC_WORKSPACE_DROP_REGISTRY`) und es **stellt zu** über den
// vorhandenen Resolver (`resolveWorkspaceDrop` / `evaluateWorkspaceDrop`). *Kein privater Pfad, keine zweite Route.*
//
// ## Das Urteil kommt aus Paket 6 — hier entsteht **keines**
//
// `hoverDropTarget` (Paket 6) liefert `verdict`, `reason` und `preview` — **benannt**, **neben** der Phase, und
// **fail-closed**. Dieses Modul reicht die Antwort der Autorität als **Fähigkeitsfrage** hinein und **liest** das
// Ergebnis. *Eine zweite Liste „was erlaubt ist" wäre genau der Defekt, den diese Sitzung bei fünf Anwendungen
// gefunden hat.* Deshalb wird hier **kein** Objektart- und **kein** Absichtsverzeichnis geführt: die Vokabel
// gehört der Registry, und ein erfundenes Wort lehnt sie selbst ab.
//
// ## Der P1-Defekt `W-443` — hier als **Regel**, nicht als Kommentar
//
// Während `dragenter` / `dragover` liegt `dataTransfer.getData()` im **geschützten** Modus und liefert **nichts**.
// Eine Fläche, die den Zug erst anhand des Inhalts beansprucht, ruft **nie** `preventDefault()` — und bekommt
// deshalb **nie** ein `drop`. Deshalb ist das Beanspruchen hier eine **eigene, reine Funktion**
// (`claimPublishWorkspaceDropZone`), die **nur** `dataTransfer.types` liest:
//
//   * **kein** Workspace-MIME in `types` → `ok: false`, Grund `publish-drop-foreign-drag`, **kein** Anspruch
//     (der Zug gehört dem Datei-Empfänger der Leinwand — *genau ein Empfänger pro Zug*);
//   * **Workspace-MIME** in `types` → `ok: true`, **auch wenn `getData()` leer bleibt**. Der Inhalt wird **erst
//     bei der Ablage** gelesen (`readPublishWorkspaceTransfer`).
//
// ## Ein **eigener** Name für „geschützt" — `publish-drop-transfer-protected`
//
// Es wäre bequem, den geschützten Zustand `…-transfer-missing` zu nennen. Das wäre eine **Unwahrheit während des
// Überfahrens**: es wurde sehr wohl etwas übergeben, es ist nur noch nicht lesbar. Der Träger trägt deshalb den
// benannten Grund `publish-drop-transfer-protected`; erst die **Ablage** ohne Inhalt heißt
// `publish-drop-transfer-missing`. *Zwei Ereignisse, zwei Wahrheiten, zwei Namen.*
//
// ## Zwei Zugänge zu **einer** Zustellung
//
// Der **Zeiger** (`dropPublishWorkspaceDropZone`) und die **Tastatur** (`confirmPublishWorkspaceDropZone`,
// `choosePublishWorkspaceDropIntent`) rufen **dieselbe** Funktion `routeWithIntent` beziehungsweise einander auf.
// *Eine Tastatur, die einen zweiten Weg nimmt, ist kein gleichwertiger Weg — sie ist gar keiner.* Und weil die
// Tastatur keinen Zeiger hat: sie braucht **kein** Überfahren, um zu bestätigen.
//
// ## Die Tatsachen bleiben stehen
//
// Endet der Zug, während die Fläche nur **überfahren** wird, schließt sie. Ist der Fall dagegen **entschieden**
// (`refused` / `delivered`), bleibt er stehen: *eine Ablehnung oder eine Zustellung ist eine Tatsache, die der
// Nutzer sehen muss.* Ein **zweiter** Abschluss ist ein **benannter** No-op.
//
// ## Was hier **nicht** geprüft werden kann
//
// Das **Binden** der Zeiger-, Ablage- und Tastenereignisse (`usePublishWorkspaceDropZone`) und die **echte**
// Berührung auf einem Gerät: `NOT_TESTED` — dafür fehlt in dieser Umgebung ein Browser. Geprüft ist alles, was
// rein entscheidbar ist.
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
  WorkspaceDropIntent,
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
import { PUBLISH_WORKSPACE_DROP_INTENT_LABEL } from './publishWorkspaceDropZoneContract';
import type {
  PublishWorkspaceDropChoice,
  PublishWorkspaceDropCommand,
  PublishWorkspaceDropCommandStep,
  PublishWorkspaceDropResolution,
  PublishWorkspaceDropTransferRead,
  PublishWorkspaceDropZoneCloseReason,
  PublishWorkspaceDropZoneRefusal,
  PublishWorkspaceDropZoneState,
  PublishWorkspaceDropZoneStep,
  PublishWorkspaceDropZoneView,
} from './publishWorkspaceDropZoneContract';

export { FABRIC_WORKSPACE_OBJECT_DRAG_MIME };

/**
 * Die Tasten der Absichten — abgeleitet aus der **vorhandenen** Absichtsliste (Paket 4), damit hier **keine**
 * zweite Grenze („1–4") entsteht: *eine neue Absicht bekommt ihre Taste von selbst.*
 */
const CHOICE_KEYS: readonly string[] = WORKSPACE_DROP_INTENTS.map((_, index) => String(index + 1));

const NO_CHOICES: readonly PublishWorkspaceDropChoice[] = Object.freeze([]);

/** Bei der **Ablage** war nichts zu lesen — es wurde wirklich nichts übergeben. */
const NOT_HANDED_OVER: PublishWorkspaceDropTransferRead = Object.freeze({
  ok: false as const,
  reason: 'publish-drop-transfer-missing' as const,
});

/** Beim **Überfahren**: der Zug hat sich angekündigt, der Ablagespeicher gibt den Inhalt aber noch nicht heraus. */
const CONTENT_PROTECTED: PublishWorkspaceDropTransferRead = Object.freeze({
  ok: false as const,
  reason: 'publish-drop-transfer-protected' as const,
});

/** Die Ablagefläche, wie der DOM sie anbietet — **strukturell**, ohne DOM-Typen (wie `DragPointerLike` in Paket 5). */
export interface PublishWorkspaceDataTransferLike {
  readonly getData?: (mime: string) => unknown;
  /** **Die einzige Angabe, die während `dragenter` / `dragover` sichtbar ist** — der Inhalt ist es nicht. */
  readonly types?: unknown;
}

/** Der Träger, wie er aus der Ablagefläche kommt — die **eine** MIME-Konstante, sonst nichts. */
export type PublishTransferRead =
  | { readonly ok: true; readonly payload: string; readonly reason?: never }
  | {
      readonly ok: false;
      readonly reason: 'publish-drop-transfer-missing' | 'publish-drop-transfer-unreadable';
      readonly payload?: never;
    };

/**
 * Die Eingaben einer Zustellung — die **eine** Autorität, die eigene App, das Zieldokument und der **untrusted**
 * Träger.
 *
 * `registry` ist ein **Parameter** und keine fest verdrahtete Konstante, damit derselbe reine Code gegen die
 * **versiegelte** Matrix der Shell **und** gegen eine im Test aufgebaute Instanz **derselben** Klasse laufen kann:
 * *die Regel bleibt eine, der Prüfling darf ein zweiter Aufbau sein.* Die Produktion reicht die versiegelte Matrix
 * der Shell hinein (`usePublishWorkspaceDropZone`) — es entsteht **keine** zweite Matrix.
 */
export interface PublishWorkspaceDropZoneContext {
  readonly registry: WorkspaceInteractionRegistry | null | undefined;
  /** Die eigene Anwendung — sie wird **nicht** geraten, sondern aus `document.kind` gereicht. */
  readonly targetApp: unknown;
  readonly targetDocumentId: unknown;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly payload?: unknown;
  /**
   * **Paket 15 — der Modus wird gesagt, nicht angenommen.** `'Live'` / `'Frozen'`, oder **abwesend**, solange der
   * Nutzer nicht gewählt hat.
   *
   * Ein `undefined` hier ist **kein** heimlicher Default: es heißt „noch nicht gewählt" — und wird deshalb auch
   * **nicht als Wert** weitergereicht (bedingtes Spreizen in **beiden** Resolver-Aufrufen, Fähigkeitsfrage und
   * Zustellung). *Ein ausdrückliches `undefined` wäre genau der Default, den Paket 15 verbietet.*
   */
  readonly requestedMode?: unknown;
  /**
   * **W-455** ✓✓: die Entscheidung der Administratorrichtlinie zu **dieser** Ablage — *hineingereicht, nicht hier
   * abgefragt* ✓: *die Zone bleibt **rein und synchron**, die asynchrone Antwort kommt aus der **einen**
   * vorhandenen Autoritaet* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) ✓. *Fehlt sie, wird die Ablage
   * **benannt** abgewiesen* ✓ (`drop_policy_decision_required`) — **kein stiller Erfolg** ✗✓.
   */
  readonly requestedPolicyDecision?: unknown;
}

function sameState(state: PublishWorkspaceDropZoneState): PublishWorkspaceDropZoneStep {
  return { ok: true, state };
}

function stateOf(
  state: PublishWorkspaceDropZoneState,
  next: {
    readonly target?: DropTargetState;
    readonly transfer?: PublishWorkspaceDropTransferRead;
    readonly decision?: PublishWorkspaceDropZoneState['decision'];
    readonly closedReason?: PublishWorkspaceDropZoneCloseReason | null;
  },
): PublishWorkspaceDropZoneState {
  return Object.freeze({
    target: next.target ?? state.target,
    transfer: next.transfer ?? state.transfer,
    decision: next.decision ?? state.decision,
    closedReason: next.closedReason === undefined ? state.closedReason : next.closedReason,
  });
}

/** Eine Ablehnung ist ein **Zustand** mit **benanntem** Grund — kein `null`, das wie Erfolg aussieht. */
function refuse(
  state: PublishWorkspaceDropZoneState,
  code: PublishWorkspaceDropZoneRefusal,
  target: DropTargetState = state.target,
  transfer: PublishWorkspaceDropTransferRead = state.transfer,
): PublishWorkspaceDropZoneStep {
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
function noOp(state: PublishWorkspaceDropZoneState, reason: PublishWorkspaceDropZoneRefusal): PublishWorkspaceDropZoneStep {
  return { ok: false, reason, state };
}

/** Nur „ist überhaupt eine Zeichenkette da" — die **Format**prüfung bleibt beim Parser (Paket 7). */
function asPayload(payload: unknown): string | null {
  return typeof payload === 'string' && payload.length > 0 ? payload : null;
}

/**
 * Nur „kennt die Fläche ihr eigenes Ziel" — **nicht** „ist die Kennung wohlgeformt" (das prüft der Resolver).
 * Die eigene **App** gehört dazu: *eine Fläche, die nicht weiß, welche Anwendung sie ist, kann nichts annehmen.*
 */
function targetRefusal(targetApp: unknown, targetDocumentId: unknown): 'publish-drop-target-missing' | null {
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) return 'publish-drop-target-missing';
  if (typeof targetApp !== 'string' || targetApp.trim().length === 0) return 'publish-drop-target-missing';
  return null;
}

/**
 * **Der Träger wird gelesen, nicht geraten.** Der **eine** Parser (Paket 7) entscheidet: unbekannte Objektart,
 * fehlendes Feld, ein **sechstes** Feld oder zu viele Bytes werden **benannt** abgelehnt — mit **seinem** Code,
 * nicht mit einem zweiten Vokabular.
 *
 * Ein **fehlender** Inhalt ist hier **kein** Fehler des Aufrufs, sondern der Zustand `publish-drop-transfer-protected`:
 * *während des Überfahrens ist „noch nicht lesbar" die Wahrheit — „nichts übergeben" wäre eine Unwahrheit.*
 */
export function readPublishWorkspaceDropTransfer(payload: unknown): PublishWorkspaceDropTransferRead {
  const serialized = asPayload(payload);
  if (serialized === null) return CONTENT_PROTECTED;
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
 * (genau die **eine** MIME-Konstante) und wirft den Rest weg.
 *
 * Diese Funktion ist für die **Ablage** gedacht: dort ist `getData()` lesbar. Fehlt der Inhalt, ist das
 * **benannt** (`publish-drop-transfer-missing`) — *ein leerer Träger ist kein gültiger Träger.*
 */
export function readPublishWorkspaceTransfer(
  dataTransfer: PublishWorkspaceDataTransferLike | null | undefined,
): PublishTransferRead {
  if (!dataTransfer) return { ok: false, reason: 'publish-drop-transfer-missing' };
  const read = dataTransfer.getData;
  if (typeof read !== 'function') return { ok: false, reason: 'publish-drop-transfer-unreadable' };
  let value: unknown;
  try {
    value = read.call(dataTransfer, FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  } catch {
    return { ok: false, reason: 'publish-drop-transfer-unreadable' };
  }
  return typeof value === 'string' && value.length > 0
    ? { ok: true, payload: value }
    : { ok: false, reason: 'publish-drop-transfer-missing' };
}

/**
 * **Ist dieser Zug überhaupt für uns?** — der `types`-Blick, **ohne** Inhalt.
 *
 * Das ist keine Bequemlichkeit, sondern eine Eigenschaft des Browsers: während `dragenter` / `dragover` liegt der
 * Ablagespeicher im **geschützten** Modus, und `getData()` liefert dann **nichts**. `types` dagegen ist sichtbar.
 * Eine Fläche, die den Zug erst anhand von `getData()` beansprucht, ruft **nie** `preventDefault()` — und bekommt
 * deshalb **nie** ein `drop` (der P1-Defekt `W-443` in Paket 9).
 */
export function isPublishWorkspaceDrag(dataTransfer: { readonly types?: unknown } | null | undefined): boolean {
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
 * Die übergebenen Argumente `targetApp` / `objectKind` werden dabei **nicht** doppelt geprüft: der Resolver leitet
 * beides **selbst** aus dem Träger ab und vergleicht es mit den Dokumenten — *eine zweite Prüfung derselben
 * Identität wäre eine zweite Wahrheit.* Fehlt die Autorität oder wirft sie, ist die Antwort `false`:
 * *im Zweifel wird nicht angenommen.*
 */
export function publishWorkspaceDropCapabilityQuestion(
  context: Pick<PublishWorkspaceDropZoneContext, 'registry' | 'targetDocumentId' | 'documents'> & {
    readonly payload?: unknown;
    readonly requestedMode?: unknown;
    /** **W-455** ✓: die Entscheidung der Administratorrichtlinie — *sie entscheidet mit, ob die Route tragfaehig
     * ist; ohne sie ist die Antwort **nicht** „fähig"* ✓ (fail-closed, *der Resolver nennt den Grund*). */
    readonly requestedPolicyDecision?: unknown;
  },
): CapabilityQuestion | null {
  const registry = context.registry;
  if (!registry || typeof registry.getAdapter !== 'function') return null;
  const payload = asPayload(context.payload);
  if (payload === null) return null;
  const targetDocumentId = context.targetDocumentId;
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) return null;
  return (_targetApp: string, _objectKind: string, intent: string): boolean => {
    try {
      const assessment = evaluateWorkspaceDrop(
        {
          payload,
          targetDocumentId,
          requestedIntent: intent,
          documents: context.documents,
          // **Bedingtes Spreizen** (`exactOptionalPropertyTypes`): ein ausdrückliches `undefined` wäre der
          // heimliche Default, den Paket 15 verbietet. *Der Modus wird **gesagt** — oder gar nicht gereicht.*
          ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
          // **W-455** ✓✓: dieselbe Entscheidung wie in der Zustellung — *die Fähigkeitsfrage darf nicht „fähig"
          // sagen, wo die Richtlinie die Ablage verweigert* ✗✓. Bedingt gespreizt: *fehlt sie, fragt der Resolver
          // fail-closed und die Antwort ist **nicht** „fähig"* ✓.
          ...(context.requestedPolicyDecision === undefined ? {} : { requestedPolicyDecision: context.requestedPolicyDecision }),
        },
        registry,
      );
      if (assessment.status !== 'rejected') return true;
      // **Der Modus ist keine Frage der Route** ✓✓ (Paket 15, `AST-1948`): eine Live-Absicht **ohne** Modus ist
      // hier **fähig** — die Route trägt sie, es fehlt nur die Wahl. *Sagte die Fläche hier `false`, hieße der
      // Grund nach Paket 6 `route-not-capable` — und das wäre die **falsche** Auskunft: die Route ist da.*
      // Der benannte Fehlschlag entsteht bei der **Zustellung** (`drop_live_mode_required`), wo die Wahl fällt.
      return assessment.code === 'drop_live_mode_required';
    } catch {
      return false;
    }
  };
}

/**
 * **Das Urteil über den Träger** (Paket 6) — je **angebotener** Absicht gefragt und dann **zusammengefaltet**.
 *
 * Warum gefaltet und nicht nur die erste Absicht gefragt: eine Quelle darf **zwei** Absichten anbieten, von denen
 * die Matrix **eine** trägt. Fragte die Fläche nur die erste, sagte sie „überfahren: nein" — und der Resolver
 * stellte danach zu. *Zwei Antworten auf eine Frage.* Deshalb: **eine** erlaubte Absicht genügt für `accept`.
 * *Gewählt wird damit nichts:* welche Absicht gilt, entscheidet die **Ablage** — die Fläche zeigt nur, dass
 * dieser Träger hier ankommt.
 */
function verdictOfTransfer(
  targetApp: unknown,
  transfer: PublishWorkspaceDropTransferRead,
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
export function createPublishWorkspaceDropZone(): PublishWorkspaceDropZoneState {
  return Object.freeze({
    target: createDropTarget(),
    transfer: CONTENT_PROTECTED,
    decision: Object.freeze({ kind: 'none' as const }),
    closedReason: null,
  });
}

/**
 * **Die Fläche wird überfahren** — das Urteil entsteht bei Paket 6, zugestellt wird noch nicht.
 *
 * Ein **entschiedener** Fall bleibt stehen: *ein Ablehnungs- oder Zustellungsgrund ist eine Tatsache, die ein
 * bewegter Zeiger nicht überschreibt.*
 */
export function hoverPublishWorkspaceDropZone(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isPublishWorkspaceDropZoneDecided(state)) return sameState(state);
  const transfer = readPublishWorkspaceDropTransfer(context.payload);
  const question = transfer.ok ? publishWorkspaceDropCapabilityQuestion(context) : null;
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'publish-drop-target-missing');
  return {
    ok: true,
    state: stateOf(state, { target: verdict.state, transfer, decision: { kind: 'none' }, closedReason: null }),
  };
}

/**
 * **Der Anspruch auf den Zug** — die **einzige** Stelle, an der die Fläche entscheidet, ob ein laufender Zug
 * **ihr** gehört. Und sie entscheidet es an `dataTransfer.types`, **nie** am Inhalt.
 *
 * Warum das eine eigene, reine Funktion ist und nicht eine Zeile im Hook: *eine Regel, die nur im DOM-Handler
 * steht, ist kopflos nicht prüfbar* — und genau diese Regel war der P1-Defekt `W-443`.
 *
 *   * **fremder** Zug (Dateien, Text, ein Link) → `ok: false`, `publish-drop-foreign-drag`, **kein** Anspruch.
 *     Der Datei-Empfänger der Publish-Leinwand behält ihn: *genau ein Empfänger pro Zug.*
 *   * **unser** Zug → `ok: true` — **auch wenn `getData()` nichts liefert.** Der Aufrufer ruft **danach**
 *     `preventDefault()`; ohne diesen Aufruf gäbe es nie ein `drop`.
 */
/** Der Anspruch auf einen Zug — **ein** Ergebnis, **ein** Name: entweder unser Zug oder ein fremder. */
export type PublishWorkspaceDropClaim =
  | { readonly ok: true; readonly state: PublishWorkspaceDropZoneState; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'publish-drop-foreign-drag'; readonly state: PublishWorkspaceDropZoneState };

export function claimPublishWorkspaceDropZone(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
  dataTransfer: PublishWorkspaceDataTransferLike | null | undefined,
): PublishWorkspaceDropClaim {
  if (!isPublishWorkspaceDrag(dataTransfer)) {
    return { ok: false, reason: 'publish-drop-foreign-drag', state };
  }
  // Der Inhalt wird **versucht**, aber nicht **verlangt**: bleibt er geschützt, trägt der Zustand den benannten
  // Grund `publish-drop-transfer-protected` — und der Anspruch gilt trotzdem.
  const read = readPublishWorkspaceTransfer(dataTransfer);
  return { ok: true, state: enterPublishWorkspaceDropZone(state, { ...context, payload: read.ok ? read.payload : undefined }).state };
}

/**
 * **Der erneute Anspruch** beim wiederholten `dragover` — ein **entschiedener** Fall bleibt dabei stehen.
 *
 * Der Unterschied zu `claimPublishWorkspaceDropZone` ist keine Bequemlichkeit, sondern eine Regel: `dragenter`
 * eröffnet einen **neuen** Zug und darf deshalb eine alte Ablehnung oder Zustellung **ablösen**; `dragover`
 * feuert dagegen viele Male **innerhalb desselben** Zuges. *Ein bewegter Zeiger, der eine Zustellung in
 * „überfahren" zurückverwandelt, löscht eine Tatsache, die der Nutzer gerade gesehen hat.*
 */
export function holdPublishWorkspaceDropZone(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
  dataTransfer: PublishWorkspaceDataTransferLike | null | undefined,
): PublishWorkspaceDropClaim {
  if (!isPublishWorkspaceDrag(dataTransfer)) {
    return { ok: false, reason: 'publish-drop-foreign-drag', state };
  }
  const read = readPublishWorkspaceTransfer(dataTransfer);
  return { ok: true, state: hoverPublishWorkspaceDropZone(state, { ...context, payload: read.ok ? read.payload : undefined }).state };
}

/** Die Fläche wird **verlassen** — das Urteil wird **zurückgenommen** (Paket 6: `leaveDropTarget`), kein Rest. */
export function leavePublishWorkspaceDropZone(
  state: PublishWorkspaceDropZoneState,
  reason: PublishWorkspaceDropZoneCloseReason = 'drag-left',
): PublishWorkspaceDropZoneStep {
  if (isPublishWorkspaceDropZoneDecided(state)) return sameState(state);
  if (!isPublishWorkspaceDropZoneVisible(state)) return { ok: false, reason: 'publish-drop-inactive', state };
  return {
    ok: true,
    state: stateOf(state, {
      target: leaveDropTarget(state.target),
      transfer: CONTENT_PROTECTED,
      decision: { kind: 'none' },
      closedReason: reason,
    }),
  };
}

/** Ein **neuer** Zug betritt die Fläche — ein alter, entschiedener Fall wird dabei **abgelöst**. */
export function enterPublishWorkspaceDropZone(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  return hoverPublishWorkspaceDropZone(isPublishWorkspaceDropZoneDecided(state) ? createPublishWorkspaceDropZone() : state, context);
}

/**
 * Der **Abbruchgrund der Zieh-Session wird übernommen**, wenn die Zone ihn kennt.
 *
 * Paket 5 führt die Gründe bereits **benannt** (`pointer-lost` bei `pointercancel`, `window-blur` beim
 * Fensterverlust). Sie hier auf `drag-left` einzuebnen, würde eine vorhandene Tatsache wegwerfen — *und genau die
 * braucht die Touch-Entscheidung: ein vom System abgebrochener Touch ist kein „danebengezogener Zeiger".*
 */
function closeReasonOf(reason: DragEndReason | null): PublishWorkspaceDropZoneCloseReason {
  return reason === 'pointer-lost' || reason === 'window-blur' ? reason : 'drag-left';
}

/**
 * **Der Empfänger folgt dem vorhandenen Zug** (Paket 5) — `isDragActive`, `session.payload` und der benannte
 * `endReason` kommen **wörtlich** aus der Zieh-Session, statt dass hier ein zweiter Zug geführt wird.
 *
 * Das ist zugleich der **einzige** Weg, auf dem eine Fläche **während** des Ziehens eine echte Vorschau zeigen
 * kann: die MIME-Ankündigung aus dem Browser trägt keinen Inhalt (Schutzmodus), ein Zug **innerhalb** der Shell
 * dagegen schon. Läuft kein Zug mehr, schließt eine **überfahrene** Fläche mit **dessen** Grund; ein
 * **entschiedener** Fall bleibt stehen.
 */
export function publishWorkspaceDropZoneFromDragSession(
  state: PublishWorkspaceDropZoneState,
  session: DragSessionState,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  if (isDragActive(session)) {
    return enterPublishWorkspaceDropZone(state, { ...context, payload: session.payload });
  }
  if (isPublishWorkspaceDropZoneDecided(state)) return sameState(state);
  if (state.target.overTarget) return leavePublishWorkspaceDropZone(state, closeReasonOf(session.endReason));
  return { ok: false, reason: 'publish-drop-inactive', state };
}

function choiceOf(selection: WorkspaceDropSelection, index: number): PublishWorkspaceDropChoice {
  const key = CHOICE_KEYS[index] ?? String(index + 1);
  return Object.freeze({
    intent: selection.intent,
    label: PUBLISH_WORKSPACE_DROP_INTENT_LABEL[selection.intent],
    adapterId: selection.adapterId,
    key,
    shortcutLabel: key,
  });
}

function resolutionOf(
  selection: WorkspaceDropSelection,
  sourceVersion: number,
  targetVersion: number,
): PublishWorkspaceDropResolution {
  return Object.freeze({
    adapterId: selection.adapterId,
    intent: selection.intent,
    // **Paket 15:** die Zustellung sagt, **wie** die Quelle behandelt wird — Kopie oder Live-Verweis.
    integrationKind: selection.integrationKind,
    // **Kein heimlicher Default:** der Modus steht **nur** da, wenn der Live-Verweis ihn ausdrücklich trägt —
    // *bedingtes Spreizen, weil `exactOptionalPropertyTypes` ein ausdrückliches `undefined` verbietet.*
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
 *   * Das Ereignis trägt **etwas**, aber der Parser lehnt es ab → **sein** Grund gilt (`payload_invalid` ✓,
 *     `object_kind_unknown` ✓). *Diesen Grund durch „es war nichts da" zu ersetzen, wäre eine falsche Auskunft.*
 *   * Das Ereignis trägt **nichts** → der beim Überfahren gelesene Träger gilt, sonst `…-transfer-missing`:
 *     *bei der Ablage ist ein leerer Träger kein geschützter Träger, sondern ein fehlender.*
 */
function transferForCommit(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropTransferRead {
  const fromEvent = readPublishWorkspaceDropTransfer(context.payload);
  if (fromEvent.ok) return fromEvent;
  if (asPayload(context.payload) !== null) return fromEvent;
  return state.transfer.ok ? state.transfer : NOT_HANDED_OVER;
}

function applyAssessment(
  state: PublishWorkspaceDropZoneState,
  transfer: PublishWorkspaceDropTransferRead,
  target: DropTargetState,
  assessment: WorkspaceDropAssessment,
  context: PublishWorkspaceDropZoneContext,
  failOnChoice: boolean,
): PublishWorkspaceDropZoneStep {
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
        closedReason: null,
      }),
    };
  }
  if (assessment.status === 'needsChoice') {
    const choices = Object.freeze(assessment.choices.map(choiceOf));
    const next = stateOf(state, { target, transfer, decision: { kind: 'choice', choices }, closedReason: null });
    // Beim **Überfahren** ist „Absicht wählen" der richtige Zustand; bei der **Ablage** ist es eine benannte
    // Ablehnung — der Träger liegt vor, aber ohne Absicht wird **nichts** stillschweigend vorausgewählt.
    return failOnChoice ? { ok: false, reason: 'drop_intent_choice_required', state: next } : { ok: true, state: next };
  }
  // `accepted`: der Resolver bietet **genau eine** Route an — sie wird jetzt **bestellt** (mit beiden Versionen).
  return routeWithIntent(state, transfer, target, assessment.selection.intent, context, true);
}

/**
 * **Die eine Zustellung** — Zeiger und Tastatur landen hier.
 *
 * Die Absicht bleibt `unknown`: unbekannte Absichten und nicht angebotene Absichten benennt der **Resolver**
 * (`intent_unknown` / `drop_intent_not_supported`) — *eine eigene Vorprüfung wäre eine zweite Wahrheit.*
 */
function routeWithIntent(
  state: PublishWorkspaceDropZoneState,
  transfer: PublishWorkspaceDropTransferRead,
  target: DropTargetState,
  intent: unknown,
  context: PublishWorkspaceDropZoneContext,
  failOnChoice: boolean,
): PublishWorkspaceDropZoneStep {
  if (!transfer.ok) return refuse(state, transfer.reason, target, transfer);
  const registry = context.registry;
  if (!registry || typeof registry.getAdapter !== 'function') {
    // Ohne die eine Autorität gibt es **keine** Antwort — derselbe fail-closed Name, den Paket 6 für eine
    // unbeantwortbare Fähigkeitsfrage führt.
    return refuse(state, 'verdict-unavailable', target, transfer);
  }
  const targetDocumentId = context.targetDocumentId;
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) {
    return refuse(state, 'publish-drop-target-missing', target, transfer);
  }
  let assessment: WorkspaceDropAssessment;
  try {
    // **Bedingtes Spreizen** (Paket 15, `exactOptionalPropertyTypes`): ein ausdrückliches `undefined` wäre der
    // heimliche Default, den Paket 15 verbietet — für die **Absicht** wie für den **Modus**.
    const request = {
      payload: transfer.payload,
      targetDocumentId,
      documents: context.documents,
      ...(intent === undefined ? {} : { requestedIntent: intent }),
      ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
      // UEBERGANGSMARKER (W-455): die Entscheidung der Administratorrichtlinie steht hier **noch nicht** bereit —
      // *die Shell holt sie asynchron* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) *und reicht sie
      // ueber den Kontext hinein* ✓. **Dieses feste `Allow` ist bis dahin voruebergehend falsch** ✗✓ — *aber
      // **laut** markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die Entscheidung wirklich
      // ankommt, wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`).
      ...(context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision }),
    };
    // **Zwei Schritte — und der Unterschied ist Paket 15** ✓✓:
    //   * Ist die Absicht **noch nicht gewählt** (`intent === undefined`), wird das **Angebot** erfragt
    //     (`evaluateWorkspaceDrop`): welche Route(n) trägt die Matrix? *Aus einem Angebot wird **nichts**
    //     zugestellt — und deshalb prüft der Resolver hier auch **keinen** Modus.*
    //   * Ist sie **gewählt**, wird **diese eine** Route **bestellt** (`resolveWorkspaceDrop`, mit beiden
    //     Versionen) — und **nur** dann ist der Modus eine Bedingung (`drop_live_mode_required`).
    // *Ohne diese Trennung käme ein Live-Träger ohne Modus als `resolved` zurück: eine Zustellung **ohne** Modus,
    // also genau der heimliche Default, den Paket 15 verbietet.* ✗✓
    assessment = intent === undefined
      ? evaluateWorkspaceDrop(request, registry)
      : resolveWorkspaceDrop(request, registry);
  } catch {
    return refuse(state, 'verdict-unavailable', target, transfer);
  }
  return applyAssessment(state, transfer, target, assessment, context, failOnChoice);
}

/**
 * **Der gemeinsame Abschluss** von Zeiger-Ablage und Tastatur-Bestätigung.
 *
 * Hier steht die **eine** Stelle, an der Paket 6 gefragt wird, ob überhaupt abgelegt werden darf
 * (`commitDropTarget`): ein abgelehntes Urteil führt **nie** zur Zustellung. *Kein stiller Erfolg.*
 */
function commitTransfer(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = publishWorkspaceDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'publish-drop-target-missing');
  const gate = commitDropTarget(verdict.state);
  if (!gate.ok) {
    // Der Riegel fällt genau dann, wenn das Urteil **nicht** `accept` sagt — und dann trägt es seinen Grund.
    // Der Rückfall ist die fail-closed Versicherung, falls Paket 6 je ohne Grund ablehnt.
    return refuse(state, verdict.state.reason ?? 'publish-drop-inactive', verdict.state, transfer);
  }
  // **Der Erfolg verbraucht das Urteil** (Paket 6): `gate.state` ist wieder leer — ein stehengebliebenes
  // „hier annehmen" wäre nach der Ablage eine Lüge.
  return routeWithIntent(state, transfer, gate.state, undefined, context, true);
}

/**
 * **Die Zeiger-Ablage.** Ohne eindeutige Route wird **nicht** zugestellt: der Zustand ist dann `choice` und der
 * Grund ist der der Matrix (`drop_intent_choice_required`).
 */
export function dropPublishWorkspaceDropZone(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isPublishWorkspaceDropZoneDecided(state)) return noOp(state, 'publish-drop-already-decided');
  return commitTransfer(state, context);
}

/**
 * **Die Tastatur-Absicht: bestätigen** — derselbe Weg wie die Ablage.
 *
 *   * `choice` → **wörtlich die Ablage**: ohne gewählte Absicht gibt es keine Zustellung, und der Grund kommt
 *     von der Matrix.
 *   * sonst → derselbe Abschluss wie der Zeiger, **ohne** dass die Fläche vorher überfahren werden musste:
 *     *eine Tastatur, die erst einen Zeiger braucht, ist keine Alternative.*
 *   * `refused` / `delivered` → der Fall ist entschieden (`publish-drop-already-decided`, benannter No-op).
 */
export function confirmPublishWorkspaceDropZone(
  state: PublishWorkspaceDropZoneState,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isPublishWorkspaceDropZoneDecided(state)) return noOp(state, 'publish-drop-already-decided');
  if (state.decision.kind === 'choice') return dropPublishWorkspaceDropZone(state, context);
  return commitTransfer(state, context);
}

/**
 * **Die Tastatur-Absicht: eine Absicht wählen** — dieselbe Zustellung wie die Ablage.
 *
 * Eine Absicht, die **nicht** angeboten wurde, wird **nicht** stillschweigend übernommen: sie geht durch die
 * Matrix und wird dort benannt abgelehnt (`drop_intent_not_supported` / `intent_unknown`). Deshalb wird hier
 * **nicht** vorab gegen das Urteil geprüft — *die Matrix ist die Prüfung.*
 */
export function choosePublishWorkspaceDropIntent(
  state: PublishWorkspaceDropZoneState,
  intent: unknown,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isPublishWorkspaceDropZoneDecided(state)) return noOp(state, 'publish-drop-already-decided');
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = publishWorkspaceDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  return routeWithIntent(state, transfer, verdict.ok ? verdict.state : state.target, intent, context, true);
}

/** Ob der Fall **entschieden** ist — `refused` und `delivered` werden von einem überfahrenden Zeiger nicht ersetzt. */
export function isPublishWorkspaceDropZoneDecided(state: PublishWorkspaceDropZoneState): boolean {
  return state.decision.kind === 'refused' || state.decision.kind === 'delivered';
}

/** Ob die Ansicht die sichtbare Zone rendert — die Ansageregion steht davon **unabhängig** immer im DOM. */
export function isPublishWorkspaceDropZoneVisible(state: PublishWorkspaceDropZoneState): boolean {
  return state.target.overTarget || state.decision.kind !== 'none';
}

/** **Die View-Phase wird gerechnet, nicht gespeichert** — zwei Felder für eine Tatsache wären der Defekt selbst. */
export function publishWorkspaceDropZoneView(state: PublishWorkspaceDropZoneState): PublishWorkspaceDropZoneView {
  if (state.decision.kind === 'delivered') return 'resolved';
  if (state.decision.kind === 'refused') return 'refused';
  if (state.decision.kind === 'choice') return 'choice';
  if (!state.target.overTarget) return 'closed';
  return state.target.verdict === 'accept' ? 'ready' : 'open';
}

/** **Die Vorschau kommt aus dem Urteil** (Paket 6, `preview`) — dieses Modul formuliert sie nicht neu. */
export function publishWorkspaceDropZonePreview(state: PublishWorkspaceDropZoneState): DropPreview | null {
  return state.target.preview;
}

/**
 * Der **benannte** Grund, den die Ansicht zeigen muss — aus dem **Träger** (warum er nicht lesbar ist), aus der
 * **Zustellung** (was der Resolver entschieden hat) oder aus dem **Urteil** (Paket 6). `null`, wenn nichts zu
 * melden ist. *Ein leeres Feld hier hieße: „alles in Ordnung" — und das darf nicht versehentlich entstehen.*
 */
export function publishWorkspaceDropZoneRefusalCode(state: PublishWorkspaceDropZoneState): PublishWorkspaceDropZoneRefusal | null {
  if (state.decision.kind === 'refused') return state.decision.code;
  // Eine **geschlossene** Fläche meldet **nichts**: der Träger-Zustand einer Fläche, über die kein Zug läuft,
  // ist keine Auskunft über einen Zug. *Ein „geschützt", das im leeren Zustand angezeigt würde, wäre eine
  // Behauptung über einen Zug, den es nicht gibt.*
  if (!isPublishWorkspaceDropZoneVisible(state)) return null;
  if (!state.transfer.ok) return state.transfer.reason;
  if (state.target.verdict === 'reject') return state.target.reason;
  return null;
}

/** Die sichtbaren Absichten — nur die, die der **Resolver** angeboten hat. */
export function publishWorkspaceDropZoneChoices(state: PublishWorkspaceDropZoneState): readonly PublishWorkspaceDropChoice[] {
  return state.decision.kind === 'choice' ? state.decision.choices : NO_CHOICES;
}

/** **Die Taste wird zur Absicht** — rein und ohne DOM: nur der Tastenname wird ausgewertet. */
export function resolvePublishWorkspaceDropCommand(
  state: PublishWorkspaceDropZoneState,
  key: unknown,
): PublishWorkspaceDropCommandStep {
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'publish-drop-key-unbound' };
  if (key === 'Escape') return { ok: true, command: { kind: 'dismiss' } };
  if (key === 'Enter' || key === ' ') return { ok: true, command: { kind: 'confirm' } };
  const index = CHOICE_KEYS.indexOf(key);
  if (index < 0) return { ok: false, reason: 'publish-drop-key-unbound' };
  const choice = publishWorkspaceDropZoneChoices(state)[index];
  if (!choice) return { ok: false, reason: 'publish-drop-key-unbound' };
  return { ok: true, command: { kind: 'choose', intent: choice.intent } };
}

/** **Die Absicht wird ausgeführt** — jeder Zweig führt in **dieselbe** Zustellung, die auch der Zeiger nimmt. */
export function applyPublishWorkspaceDropCommand(
  state: PublishWorkspaceDropZoneState,
  command: PublishWorkspaceDropCommand,
  context: PublishWorkspaceDropZoneContext,
): PublishWorkspaceDropZoneStep {
  if (!command || typeof command !== 'object') return noOp(state, 'publish-drop-command-unknown');
  switch (command.kind) {
    case 'confirm':
      return confirmPublishWorkspaceDropZone(state, context);
    case 'choose':
      return choosePublishWorkspaceDropIntent(state, command.intent, context);
    case 'dismiss':
      return leavePublishWorkspaceDropZone(state, 'keyboard-dismiss');
    default:
      return noOp(state, 'publish-drop-command-unknown');
  }
}

/**
 * Ob **jetzt** etwas bestätigt werden kann — die Frage, die die Ansicht dem Knopf stellt.
 *
 * Sie verlangt **beides**: einen gelesenen Träger **und** ein Urteil, das annimmt (Paket 6). *Ein „ablegen"-Knopf,
 * der bei `reject` aktiv aussieht, wäre eine Anzeige, die das Gegenteil ihres eigenen Zustands behauptet.*
 */
export function publishWorkspaceDropZoneCanConfirm(state: PublishWorkspaceDropZoneState): boolean {
  if (state.decision.kind === 'choice') return false;
  if (isPublishWorkspaceDropZoneDecided(state)) return false;
  return state.transfer.ok && state.target.verdict === 'accept';
}

/**
 * Das Absichtswort einer **benannten** Absicht — für die Auflösungszeile der Ansicht.
 *
 * Es ist ein **Durchreichen** der einen Vokabel aus dem Contract (`PUBLISH_WORKSPACE_DROP_INTENT_LABEL`), damit
 * die Ansicht die Zuordnung nicht ein zweites Mal aufschreibt. *Zwei Tabellen über dieselbe Absicht wären zwei
 * Vokabeln.*
 */
export function publishWorkspaceDropIntentLabelOf(intent: WorkspaceDropIntent): string {
  return PUBLISH_WORKSPACE_DROP_INTENT_LABEL[intent];
}
