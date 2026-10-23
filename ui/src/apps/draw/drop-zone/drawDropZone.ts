// STATUS: PLATIN — Integration & Release, **Paket 14**: die Regeln der Draw-Ablagezone (rein, kopflos prüfbar)
//
// ## Was dieses Modul **nicht** tut
//
// Es erfindet **keinen** zweiten Zieh-Mechanismus. Es **liest** die vorhandene Zieh-Session (Paket 5), es **liest**
// den vorhandenen Träger durch den **einen** Parser (Paket 7, `parseWorkspaceDragPayload`), es **fragt** die
// vorhandene Matrix (Paket 4, die versiegelte `FABRIC_WORKSPACE_DROP_REGISTRY`) und es **löst die Route** über den
// vorhandenen Resolver (`resolveWorkspaceDrop` / `evaluateWorkspaceDrop`). *Kein privater Pfad, keine zweite Route.*
//
// ## Das Urteil kommt aus Paket 6 — hier entsteht **keines**
//
// Die annehmende Fläche ist eine **Leinwand** (in Draw sogar eine SVG-Anwendung). Auf einer Leinwand ist die
// Versuchung groß, „was erlaubt ist" schnell selbst zu beantworten. Genau das ist verboten: `hoverDropTarget`
// (Paket 6) liefert `verdict`, `reason` und `preview` — **benannt**, **neben** der Phase, und **fail-closed**.
// Dieses Modul reicht die Antwort der Autorität als **Fähigkeitsfrage** hinein und **liest** das Ergebnis.
//
// **Die Frage ist die Antwort des Resolvers**, kein Nachbau: gefragt wird
// `evaluateWorkspaceDrop({…, requestedIntent: intent}).status !== 'rejected'`. Damit kann die Fläche **nicht**
// „überfahren: ja" und „abgelegt: nein" sagen — *zwei Antworten auf eine Frage sind eine Lüge, auch wenn beide
// Stellen für sich „fail-closed" heißen.* Deshalb wird hier auch **kein** Objektart- und **kein** Absichtsverzeichnis
// geführt: die Vokabel gehört der Registry, und ein erfundenes Wort lehnt sie selbst ab.
//
// ## Zwei Zugänge zu **einer** Auflösung
//
// Der **Zeiger** (`dropDrawDropZone`) und die **Tastatur** (`confirmDrawDropZone`, `chooseDrawDropIntent`) rufen
// **dieselbe** Funktion `routeWithIntent` beziehungsweise einander auf. *Eine Tastatur, die einen zweiten Weg
// nimmt, ist auf einer Leinwand kein gleichwertiger Weg — sie ist gar keiner.* Und weil die Leinwand keine
// Tastatur hat: die Tastatur braucht **kein** Überfahren, um zu bestätigen.
//
// ## Die Tatsachen bleiben stehen
//
// Endet der Zug, während die Fläche nur **überfahren** wird, schließt sie. Ist der Fall dagegen **entschieden**
// (`refused` / `routed`), bleibt er stehen: *eine Ablehnung oder eine aufgelöste Route ist eine Tatsache, die der
// Nutzer sehen muss* (dieselbe Begründung wie in Paket 5). Ein **zweiter** Abschluss ist ein **benannter** No-op.
//
// ## Was hier **nicht** geprüft werden kann
//
// Das **Binden** der Zeiger-, Ablage- und Tastenereignisse (`useDrawDropZone`) und die **echte** Berührung auf
// einem Gerät: `NOT_TESTED` — dafür fehlt in dieser Umgebung ein Browser. Geprüft ist alles, was rein
// entscheidbar ist.
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
import { DRAW_DROP_INTENT_LABEL, DRAW_DROP_ZONE_PRESENTATION } from './drawDropZoneContract';
import type {
  DrawDropChoice,
  DrawDropCommand,
  DrawDropCommandStep,
  DrawDropRoute,
  DrawDropTransferRead,
  DrawDropZoneCloseReason,
  DrawDropZoneRefusal,
  DrawDropZoneState,
  DrawDropZoneStep,
  DrawDropZoneView,
} from './drawDropZoneContract';

export { FABRIC_WORKSPACE_OBJECT_DRAG_MIME };

/**
 * Die Tasten der Absichten — abgeleitet aus der **vorhandenen** Absichtsliste (Paket 4), damit hier **keine**
 * zweite Grenze („1–4") entsteht: *eine neue Absicht bekommt ihre Taste von selbst.*
 */
const CHOICE_KEYS: readonly string[] = WORKSPACE_DROP_INTENTS.map((_, index) => String(index + 1));

const NO_CHOICES: readonly DrawDropChoice[] = Object.freeze([]);

const NOT_CARRIED: DrawDropTransferRead = Object.freeze({
  ok: false as const,
  reason: 'draw-drop-transfer-missing' as const,
});

/** Die Ablagefläche, wie der DOM sie anbietet — **strukturell**, ohne DOM-Typen (wie `DragPointerLike` in Paket 5). */
export interface DrawDataTransferLike {
  readonly getData?: (mime: string) => unknown;
}

/** Der Träger, wie er aus der Ablagefläche kommt — die **eine** MIME-Konstante, sonst nichts. */
export type DrawTransferRead =
  | { readonly ok: true; readonly payload: string; readonly reason?: never }
  | {
      readonly ok: false;
      readonly reason: 'draw-drop-transfer-missing' | 'draw-drop-transfer-unreadable';
      readonly payload?: never;
    };

/**
 * Die Eingaben einer Auflösung — die **eine** Autorität, die eigene App, das Zieldokument und der **untrusted**
 * Träger.
 *
 * `registry` ist ein **Parameter** und keine fest verdrahtete Konstante, damit derselbe reine Code gegen die
 * **versiegelte** Matrix der Shell **und** gegen eine im Test aufgebaute Instanz **derselben** Klasse laufen kann:
 * *die Regel bleibt eine, der Prüfling darf ein zweiter Aufbau sein.* Die Produktion reicht die versiegelte Matrix
 * der Shell hinein (`useDrawDropZone`) — es entsteht **keine** zweite Matrix.
 */
export interface DrawDropZoneContext {
  readonly registry: WorkspaceInteractionRegistry | null | undefined;
  /** Die eigene Anwendung — sie wird **nicht** geraten, sondern aus `document.kind` gereicht. */
  readonly targetApp: unknown;
  readonly targetDocumentId: unknown;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly payload?: unknown;
  /**
   * **Der gewählte Live-Modus** (Paket 15, AST-1948) — bleibt `unknown`: *der Resolver benennt Unbekanntes selbst.*
   * Fehlt er, wird ein Live-Verweis **nicht** zugestellt (`drop_live_mode_required`) — *kein heimlicher Default.*
   *
   * Er wird in **beide** Aufrufe mitgeführt: die **Fähigkeitsfrage** (sonst wäre ein Live-Verweis „nicht fähig",
   * obwohl die Route ihn trägt) und die **Zustellung** (sonst verspräche die Fläche einen Modus, den sie nicht
   * nennt). *Bedingtes Spreizen, kein explizites `undefined`.*
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

function sameState(state: DrawDropZoneState): DrawDropZoneStep {
  return { ok: true, state };
}

function stateOf(
  state: DrawDropZoneState,
  next: {
    readonly target?: DropTargetState;
    readonly transfer?: DrawDropTransferRead;
    readonly decision?: DrawDropZoneState['decision'];
    readonly closedReason?: DrawDropZoneCloseReason | null;
  },
): DrawDropZoneState {
  return Object.freeze({
    target: next.target ?? state.target,
    transfer: next.transfer ?? state.transfer,
    decision: next.decision ?? state.decision,
    closedReason: next.closedReason === undefined ? state.closedReason : next.closedReason,
  });
}

/** Eine Ablehnung ist ein **Zustand** mit **benanntem** Grund — kein `null`, das wie Erfolg aussieht. */
function refuse(
  state: DrawDropZoneState,
  code: DrawDropZoneRefusal,
  target: DropTargetState = state.target,
  transfer: DrawDropTransferRead = state.transfer,
): DrawDropZoneStep {
  return {
    ok: false,
    reason: code,
    state: stateOf(state, { target, transfer, decision: { kind: 'refused', code } }),
  };
}

/**
 * Ein **benannter No-op**: der Aufruf war unbrauchbar, aber es gibt **keine neue Tatsache** — und deshalb wird
 * auch **keine** gesetzt. *Ein „schon entschieden", das den entschiedenen Fall in „abgelehnt" umschreibt, löscht
 * die Route, die es gerade meldet.*
 */
function noOp(state: DrawDropZoneState, reason: DrawDropZoneRefusal): DrawDropZoneStep {
  return { ok: false, reason, state };
}

/** Nur „ist überhaupt eine Zeichenkette da" — die **Format**prüfung bleibt beim Parser (Paket 7). */
function asPayload(payload: unknown): string | null {
  return typeof payload === 'string' && payload.length > 0 ? payload : null;
}

/**
 * Nur „kennt die Fläche ihr eigenes Ziel" — **nicht** „ist die Kennung wohlgeformt" (das prüft der Resolver).
 * Die eigene **App** gehört dazu: *eine Leinwand, die nicht weiß, welche Anwendung sie ist, kann nichts annehmen.*
 */
function targetRefusal(targetApp: unknown, targetDocumentId: unknown): 'draw-drop-target-missing' | null {
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) return 'draw-drop-target-missing';
  if (typeof targetApp !== 'string' || targetApp.trim().length === 0) return 'draw-drop-target-missing';
  return null;
}

/**
 * **Der Träger wird gelesen, nicht geraten.** Der **eine** Parser (Paket 7) entscheidet: unbekannte Objektart,
 * fehlendes Feld, ein **sechstes** Feld oder zu viele Bytes werden **benannt** abgelehnt — mit **seinem** Code,
 * nicht mit einem zweiten Vokabular. `objectKind` aus dem Deskriptor wird damit zur **Tatsache**, auf die Paket 6
 * seine Frage stützt.
 */
export function readDrawDropTransfer(payload: unknown): DrawDropTransferRead {
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
 */
export function readDrawWorkspaceTransfer(
  dataTransfer: DrawDataTransferLike | null | undefined,
): DrawTransferRead {
  if (!dataTransfer) return { ok: false, reason: 'draw-drop-transfer-missing' };
  const read = dataTransfer.getData;
  if (typeof read !== 'function') return { ok: false, reason: 'draw-drop-transfer-unreadable' };
  let value: unknown;
  try {
    value = read.call(dataTransfer, FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  } catch {
    return { ok: false, reason: 'draw-drop-transfer-unreadable' };
  }
  return typeof value === 'string' && value.length > 0
    ? { ok: true, payload: value }
    : { ok: false, reason: 'draw-drop-transfer-missing' };
}

/**
 * **Ist dieser Zug überhaupt für uns?** — der `types`-Blick, **ohne** Inhalt.
 *
 * Das ist keine Bequemlichkeit, sondern eine Eigenschaft des Browsers: während `dragenter` / `dragover` liegt der
 * Ablagespeicher im **geschützten** Modus, und `getData()` liefert dann **nichts**. `types` dagegen ist sichtbar.
 * Eine Fläche, die den Zug erst anhand von `getData()` beansprucht, ruft **nie** `preventDefault()` — und
 * bekommt deshalb **nie** ein `drop`. *Der Inhalt wird also erst bei der Ablage gelesen; bis dahin ist das Urteil
 * `reject`, und genau dafür ist fail-closed da.* **Dieser Defekt war P1 in Paket 9 (`W-443`) — er wird hier nicht
 * wiederholt.**
 */
export function isDrawWorkspaceDrag(dataTransfer: { readonly types?: unknown } | null | undefined): boolean {
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
 * Sie ist **nicht** nachgebaut: `evaluateWorkspaceDrop` beantwortet sie mit demselben Resolver, der später die
 * Route auflöst (Identität des Trägers gegen das Quellobjekt, vorhandene Dokumente, Route der Matrix, Richtlinie).
 * Die übergebenen Argumente `targetApp` / `objectKind` werden dabei **nicht** doppelt geprüft: der Resolver leitet
 * beides **selbst** aus dem Träger ab und vergleicht es mit den Dokumenten — *eine zweite Prüfung derselben
 * Identität wäre eine zweite Wahrheit.* Fehlt die Autorität oder wirft sie, ist die Antwort `false`:
 * *im Zweifel wird nicht angenommen.*
 */
export function drawDropCapabilityQuestion(
  context: Pick<DrawDropZoneContext, 'registry' | 'targetDocumentId' | 'documents' | 'requestedMode'> & { readonly payload?: unknown; readonly requestedPolicyDecision?: unknown },
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
        evaluateWorkspaceDrop({
          payload,
          targetDocumentId,
          requestedIntent: intent,
          documents: context.documents,
          // **Paket 15:** der Modus gehört **auch** in die Fähigkeitsfrage — *sonst wäre ein Live-Verweis „nicht
          // fähig", obwohl die Route ihn trägt, und die Fläche sagte „route-not-capable" statt den Modus zu
          // verlangen.* Bedingtes Spreizen: ein explizites `undefined` wäre der heimliche Default.
          ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
          // UEBERGANGSMARKER (W-455): die Entscheidung der Administratorrichtlinie steht hier **noch nicht** bereit
          // — *die Shell holt sie asynchron* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) *und reicht sie
          // ueber den Kontext hinein* ✓. **Dieses feste `Allow` ist bis dahin voruebergehend falsch** ✗✓ — *aber
          // **laut** markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die Entscheidung wirklich
          // ankommt, wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`).
          ...(context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision }),
        }, registry).status !== 'rejected'
      );
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
 * löste danach die Route auf. *Zwei Antworten auf eine Frage.* Deshalb: **eine** erlaubte Absicht genügt für
 * `accept`. *Gewählt wird damit nichts:* welche Absicht gilt, entscheidet die **Ablage** — die Fläche zeigt nur,
 * dass dieser Träger hier ankommt.
 */
function verdictOfTransfer(
  targetApp: unknown,
  transfer: DrawDropTransferRead,
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
export function createDrawDropZone(): DrawDropZoneState {
  return Object.freeze({
    target: createDropTarget(),
    transfer: NOT_CARRIED,
    decision: Object.freeze({ kind: 'none' as const }),
    closedReason: null,
  });
}

/**
 * **Die Fläche wird überfahren** — das Urteil entsteht bei Paket 6, aufgelöst wird noch nicht.
 *
 * Ein **entschiedener** Fall bleibt stehen: *ein Ablehnungs- oder Routengrund ist eine Tatsache, die ein
 * bewegter Zeiger nicht überschreibt.* Ein **unlesbarer** Träger ist **kein** Fehler des Aufrufs, sondern ein
 * Zustand: die Fläche sagt an, dass sie den Träger (noch) nicht lesen kann — und nennt den Grund dafür.
 */
export function hoverDrawDropZone(
  state: DrawDropZoneState,
  context: DrawDropZoneContext,
): DrawDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isDrawDropZoneDecided(state)) return sameState(state);
  const transfer = readDrawDropTransfer(context.payload);
  const question = transfer.ok ? drawDropCapabilityQuestion(context) : null;
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'draw-drop-target-missing');
  return {
    ok: true,
    state: stateOf(state, { target: verdict.state, transfer, decision: { kind: 'none' }, closedReason: null }),
  };
}

/** Die Fläche wird **verlassen** — das Urteil wird **zurückgenommen** (Paket 6: `leaveDropTarget`), kein Rest. */
export function leaveDrawDropZone(
  state: DrawDropZoneState,
  reason: DrawDropZoneCloseReason = 'drag-left',
): DrawDropZoneStep {
  if (isDrawDropZoneDecided(state)) return sameState(state);
  if (!isDrawDropZoneVisible(state)) return { ok: false, reason: 'draw-drop-inactive', state };
  return {
    ok: true,
    state: stateOf(state, {
      target: leaveDropTarget(state.target),
      transfer: NOT_CARRIED,
      decision: { kind: 'none' },
      closedReason: reason,
    }),
  };
}

/** Ein **neuer** Zug betritt die Fläche — ein alter, entschiedener Fall wird dabei **abgelöst**. */
export function enterDrawDropZone(
  state: DrawDropZoneState,
  context: DrawDropZoneContext,
): DrawDropZoneStep {
  return hoverDrawDropZone(isDrawDropZoneDecided(state) ? createDrawDropZone() : state, context);
}

/**
 * Der **Abbruchgrund der Zieh-Session wird übernommen**, wenn die Zone ihn kennt.
 *
 * Paket 5 führt die Gründe bereits **benannt** (`pointer-lost` bei `pointercancel`, `window-blur` beim
 * Fensterverlust). Sie hier auf `drag-left` einzuebnen, würde eine vorhandene Tatsache wegwerfen — *und genau die
 * braucht die Touch-Entscheidung: ein vom System abgebrochener Touch ist kein „danebengezogener Zeiger".*
 */
function closeReasonOf(reason: DragEndReason | null): DrawDropZoneCloseReason {
  return reason === 'pointer-lost' || reason === 'window-blur' ? reason : 'drag-left';
}

/**
 * **Der Empfänger folgt dem vorhandenen Zug** (Paket 5) — `isDragActive`, `session.payload` und der benannte
 * `endReason` kommen **wörtlich** aus der Zieh-Session, statt dass hier ein zweiter Zug geführt wird. Läuft kein
 * Zug mehr, schließt eine **überfahrene** Fläche mit **dessen** Grund; ein **entschiedener** Fall bleibt stehen.
 */
export function drawDropZoneFromDragSession(
  state: DrawDropZoneState,
  session: DragSessionState,
  context: DrawDropZoneContext,
): DrawDropZoneStep {
  if (isDragActive(session)) {
    return enterDrawDropZone(state, { ...context, payload: session.payload });
  }
  if (isDrawDropZoneDecided(state)) return sameState(state);
  if (state.target.overTarget) return leaveDrawDropZone(state, closeReasonOf(session.endReason));
  return { ok: false, reason: 'draw-drop-inactive', state };
}

function choiceOf(selection: WorkspaceDropSelection, index: number): DrawDropChoice {
  const key = CHOICE_KEYS[index] ?? String(index + 1);
  return Object.freeze({
    intent: selection.intent,
    label: DRAW_DROP_INTENT_LABEL[selection.intent],
    adapterId: selection.adapterId,
    key,
    shortcutLabel: key,
  });
}

function routeOf(
  selection: WorkspaceDropSelection,
  sourceVersion: number,
  targetVersion: number,
): DrawDropRoute {
  return Object.freeze({
    adapterId: selection.adapterId,
    intent: selection.intent,
    // **Paket 15:** die Zustellung nennt **beides** — wie die Quelle behandelt wird (`copy` / `live`) und, **nur**
    // bei Live, den **gesagten** Modus. *Ein `mode: undefined` bei einer Kopie wäre genau der heimliche Default.*
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
 *   * Das Ereignis trägt **etwas**, aber der Parser lehnt es ab → **sein** Grund gilt (`payload_invalid` ✓,
 *     `object_kind_unknown` ✓). *Diesen Grund durch „es war nichts da" zu ersetzen, wäre eine falsche Auskunft.*
 *   * Das Ereignis trägt **nichts** (Tastatur-Bestätigung ohne Ablagefläche) → der beim Überfahren gelesene
 *     Träger gilt.
 */
function transferForCommit(
  state: DrawDropZoneState,
  context: DrawDropZoneContext,
): DrawDropTransferRead {
  const fromEvent = readDrawDropTransfer(context.payload);
  if (fromEvent.ok) return fromEvent;
  if (asPayload(context.payload) !== null) return fromEvent;
  return state.transfer;
}

function applyAssessment(
  state: DrawDropZoneState,
  transfer: DrawDropTransferRead,
  target: DropTargetState,
  assessment: WorkspaceDropAssessment,
  context: DrawDropZoneContext,
  failOnChoice: boolean,
): DrawDropZoneStep {
  if (assessment.status === 'rejected') return refuse(state, assessment.code, target, transfer);
  if (assessment.status === 'resolved') {
    return {
      ok: true,
      state: stateOf(state, {
        target,
        transfer,
        decision: {
          kind: 'routed',
          route: routeOf(assessment.selection, assessment.sourceVersion, assessment.targetVersion),
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
 * **Die eine Auflösung** — Zeiger und Tastatur landen hier.
 *
 * Die Absicht bleibt `unknown`: unbekannte Absichten und nicht angebotene Absichten benennt der **Resolver**
 * (`intent_unknown` / `drop_intent_not_supported`) — *eine eigene Vorprüfung wäre eine zweite Wahrheit.*
 */
function routeWithIntent(
  state: DrawDropZoneState,
  transfer: DrawDropTransferRead,
  target: DropTargetState,
  intent: unknown,
  context: DrawDropZoneContext,
  failOnChoice: boolean,
): DrawDropZoneStep {
  if (!transfer.ok) return refuse(state, transfer.reason, target, transfer);
  const registry = context.registry;
  if (!registry || typeof registry.getAdapter !== 'function') {
    // Ohne die eine Autorität gibt es **keine** Antwort — derselbe fail-closed Name, den Paket 6 für eine
    // unbeantwortbare Fähigkeitsfrage führt.
    return refuse(state, 'verdict-unavailable', target, transfer);
  }
  const targetDocumentId = context.targetDocumentId;
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) {
    return refuse(state, 'draw-drop-target-missing', target, transfer);
  }
  let assessment: WorkspaceDropAssessment;
  try {
    assessment = resolveWorkspaceDrop(
      {
        payload: transfer.payload,
        targetDocumentId,
        requestedIntent: intent,
        documents: context.documents,
        // **Paket 15:** der Modus wird **mitgeführt**, nicht erfunden. Bedingtes Spreizen — ein explizites
        // `undefined` wäre genau der heimliche Default, den Paket 15 verbietet.
        ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
        // UEBERGANGSMARKER (W-455): dieselbe Stelle wie in der Fähigkeitsfrage — *die Entscheidung der
        // Administratorrichtlinie steht **noch nicht** bereit und wird hier voruebergehend als `Allow`
        // weitergereicht* ✗✓. *Ohne sie faellt die Ablage **benannt** aus* ✓ (`drop_policy_decision_required`).
        ...(context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision }),
      },
      registry,
    );
  } catch {
    return refuse(state, 'verdict-unavailable', target, transfer);
  }
  return applyAssessment(state, transfer, target, assessment, context, failOnChoice);
}

/**
 * **Der gemeinsame Abschluss** von Zeiger-Ablage und Tastatur-Bestätigung.
 *
 * Hier steht die **eine** Stelle, an der Paket 6 gefragt wird, ob überhaupt abgelegt werden darf
 * (`commitDropTarget`): ein abgelehntes Urteil führt **nie** zur Auflösung. *Kein stiller Erfolg.*
 */
function commitTransfer(state: DrawDropZoneState, context: DrawDropZoneContext): DrawDropZoneStep {
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = drawDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'draw-drop-target-missing');
  const gate = commitDropTarget(verdict.state);
  if (!gate.ok) {
    const code: DrawDropZoneRefusal =
      verdict.state.reason ?? (transfer.payload.length > 0 ? 'draw-drop-inactive' : 'payload-missing');
    return refuse(state, code, verdict.state, transfer);
  }
  // **Der Erfolg verbraucht das Urteil** (Paket 6): `gate.state` ist wieder leer — ein stehengebliebenes
  // „hier annehmen" wäre nach der Ablage eine Lüge.
  return routeWithIntent(state, transfer, gate.state, undefined, context, true);
}

/**
 * **Die Zeiger-Ablage.** Ohne eindeutige Route wird **nicht** aufgelöst: der Zustand ist dann `choice` und der
 * Grund ist der der Matrix (`drop_intent_choice_required`).
 */
export function dropDrawDropZone(
  state: DrawDropZoneState,
  context: DrawDropZoneContext,
): DrawDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isDrawDropZoneDecided(state)) return noOp(state, 'draw-drop-already-decided');
  return commitTransfer(state, context);
}

/**
 * **Die Tastatur-Absicht: bestätigen** — derselbe Weg wie die Ablage.
 *
 *   * `choice` → **wörtlich die Ablage**: ohne gewählte Absicht gibt es keine Auflösung, und der Grund kommt
 *     von der Matrix.
 *   * sonst → derselbe Abschluss wie der Zeiger, **ohne** dass die Fläche vorher überfahren werden musste:
 *     *eine Tastatur, die erst einen Zeiger braucht, ist keine Alternative.*
 *   * `refused` / `routed` → der Fall ist entschieden (`draw-drop-already-decided`, benannter No-op).
 */
export function confirmDrawDropZone(
  state: DrawDropZoneState,
  context: DrawDropZoneContext,
): DrawDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isDrawDropZoneDecided(state)) return noOp(state, 'draw-drop-already-decided');
  if (state.decision.kind === 'choice') return dropDrawDropZone(state, context);
  return commitTransfer(state, context);
}

/**
 * **Die Tastatur-Absicht: eine Absicht wählen** — dieselbe Auflösung wie die Ablage.
 *
 * Eine Absicht, die **nicht** angeboten wurde, wird **nicht** stillschweigend übernommen: sie geht durch die
 * Matrix und wird dort benannt abgelehnt (`drop_intent_not_supported` / `intent_unknown`). Deshalb wird hier
 * **nicht** vorab gegen das Urteil geprüft — *die Matrix ist die Prüfung.*
 */
export function chooseDrawDropIntent(
  state: DrawDropZoneState,
  intent: unknown,
  context: DrawDropZoneContext,
): DrawDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isDrawDropZoneDecided(state)) return noOp(state, 'draw-drop-already-decided');
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = drawDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  return routeWithIntent(state, transfer, verdict.ok ? verdict.state : state.target, intent, context, true);
}

/** Ob der Fall **entschieden** ist — `refused` und `routed` werden von einem überfahrenden Zeiger nicht ersetzt. */
export function isDrawDropZoneDecided(state: DrawDropZoneState): boolean {
  return state.decision.kind === 'refused' || state.decision.kind === 'routed';
}

/** Ob die Ansicht die sichtbare Zone rendert — die Ansageregion steht davon **unabhängig** immer im DOM. */
export function isDrawDropZoneVisible(state: DrawDropZoneState): boolean {
  return state.target.overTarget || state.decision.kind !== 'none';
}

/** **Die View-Phase wird gerechnet, nicht gespeichert** — zwei Felder für eine Tatsache wären der Defekt selbst. */
export function drawDropZoneView(state: DrawDropZoneState): DrawDropZoneView {
  if (state.decision.kind === 'routed') return 'resolved';
  if (state.decision.kind === 'refused') return 'refused';
  if (state.decision.kind === 'choice') return 'choice';
  if (!state.target.overTarget) return 'closed';
  return state.target.verdict === 'accept' ? 'ready' : 'open';
}

/** Die Präsentation (Zeichen, Form, Überschrift) zur **gerechneten** View-Phase — eine Quelle für die Ansicht. */
export function drawDropZonePresentation(state: DrawDropZoneState) {
  return DRAW_DROP_ZONE_PRESENTATION[drawDropZoneView(state)];
}

/** **Die Vorschau kommt aus dem Urteil** (Paket 6, `preview`) — dieses Modul formuliert sie nicht neu. */
export function drawDropZonePreview(state: DrawDropZoneState): DropPreview | null {
  return state.target.preview;
}

/**
 * Der **benannte** Grund, den die Ansicht zeigen muss — aus dem **Träger** (warum er nicht lesbar ist), aus der
 * **Auflösung** (was der Resolver entschieden hat) oder aus dem **Urteil** (Paket 6). `null`, wenn nichts zu
 * melden ist. *Ein leeres Feld hier hieße: „alles in Ordnung" — und das darf nicht versehentlich entstehen.*
 */
export function drawDropZoneRefusalCode(state: DrawDropZoneState): DrawDropZoneRefusal | null {
  if (state.decision.kind === 'refused') return state.decision.code;
  if (!state.transfer.ok) return state.transfer.reason;
  if (state.target.verdict === 'reject') return state.target.reason;
  return null;
}

/** Die sichtbaren Absichten — nur die, die der **Resolver** angeboten hat. */
export function drawDropZoneChoices(state: DrawDropZoneState): readonly DrawDropChoice[] {
  return state.decision.kind === 'choice' ? state.decision.choices : NO_CHOICES;
}

/** **Die Taste wird zur Absicht** — rein und ohne DOM: nur der Tastenname wird ausgewertet. */
export function resolveDrawDropCommand(state: DrawDropZoneState, key: unknown): DrawDropCommandStep {
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'draw-drop-key-unbound' };
  if (key === 'Escape') return { ok: true, command: { kind: 'dismiss' } };
  if (key === 'Enter' || key === ' ') return { ok: true, command: { kind: 'confirm' } };
  const index = CHOICE_KEYS.indexOf(key);
  if (index < 0) return { ok: false, reason: 'draw-drop-key-unbound' };
  const choice = drawDropZoneChoices(state)[index];
  if (!choice) return { ok: false, reason: 'draw-drop-key-unbound' };
  return { ok: true, command: { kind: 'choose', intent: choice.intent } };
}

/** **Die Absicht wird ausgeführt** — jeder Zweig führt in **dieselbe** Auflösung, die auch der Zeiger nimmt. */
export function applyDrawDropCommand(
  state: DrawDropZoneState,
  command: DrawDropCommand,
  context: DrawDropZoneContext,
): DrawDropZoneStep {
  if (!command || typeof command !== 'object') return noOp(state, 'draw-drop-command-unknown');
  switch (command.kind) {
    case 'confirm':
      return confirmDrawDropZone(state, context);
    case 'choose':
      return chooseDrawDropIntent(state, command.intent, context);
    case 'dismiss':
      return leaveDrawDropZone(state, 'keyboard-dismiss');
    default:
      return noOp(state, 'draw-drop-command-unknown');
  }
}

/**
 * Ob **jetzt** etwas bestätigt werden kann — die Frage, die die Ansicht dem Knopf stellt.
 *
 * Sie verlangt **beides**: einen gelesenen Träger **und** ein Urteil, das annimmt (Paket 6). *Ein „route
 * here"-Knopf, der bei `reject` aktiv aussieht, wäre eine Anzeige, die das Gegenteil ihres eigenen Zustands
 * behauptet.*
 */
export function drawDropZoneCanConfirm(state: DrawDropZoneState): boolean {
  if (state.decision.kind === 'choice') return false;
  if (isDrawDropZoneDecided(state)) return false;
  return state.transfer.ok && state.target.verdict === 'accept';
}
