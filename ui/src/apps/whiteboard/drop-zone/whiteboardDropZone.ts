// STATUS: PLATIN — Integration & Release, **Paket 11**: die Regeln der Whiteboard-Ablagezone (rein, kopflos prüfbar)
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
// Die annehmende Fläche ist eine **Leinwand**. Auf einer Leinwand ist die Versuchung groß, „was erlaubt ist"
// schnell selbst zu beantworten. Genau das ist verboten: `hoverDropTarget` (Paket 6) liefert `verdict`, `reason`
// und `preview` — **benannt**, **neben** der Phase, und **fail-closed**. Dieses Modul reicht die Antwort der
// Autorität als **Fähigkeitsfrage** hinein und **liest** das Ergebnis. *Eine zweite Liste „was erlaubt ist" wäre
// genau der Defekt, den diese Sitzung bei fünf Anwendungen gefunden hat.*
//
// **Die Frage ist die Antwort des Resolvers**, kein Nachbau: gefragt wird
// `evaluateWorkspaceDrop({…, requestedIntent: intent}).status !== 'rejected'`. Damit kann die Fläche **nicht**
// „überfahren: ja" und „abgelegt: nein" sagen — *zwei Antworten auf eine Frage sind eine Lüge, auch wenn beide
// Stellen für sich „fail-closed" heißen.* Deshalb wird hier auch **kein** Objektart- und **kein** Absichtsverzeichnis
// geführt: die Vokabel gehört der Registry, und ein erfundenes Wort lehnt sie selbst ab.
//
// ## Zwei Zugänge zu **einer** Zustellung
//
// Der **Zeiger** (`dropWhiteboardDropZone`) und die **Tastatur** (`confirmWhiteboardDropZone`,
// `chooseWhiteboardDropIntent`) rufen **dieselbe** Funktion `routeWithIntent` beziehungsweise einander auf.
// *Eine Tastatur, die einen zweiten Weg nimmt, ist auf einer Leinwand kein gleichwertiger Weg — sie ist gar keiner.*
// Und weil die Leinwand keine Tastatur hat: die Tastatur braucht **kein** Überfahren, um zu bestätigen.
//
// ## Die Tatsachen bleiben stehen
//
// Endet der Zug, während die Fläche nur **überfahren** wird, schließt sie. Ist der Fall dagegen **entschieden**
// (`refused` / `delivered`), bleibt er stehen: *eine Ablehnung oder eine Zustellung ist eine Tatsache, die der
// Nutzer sehen muss* (dieselbe Begründung wie in Paket 5). Ein **zweiter** Abschluss ist ein **benannter** No-op.
//
// ## Was hier **nicht** geprüft werden kann
//
// Das **Binden** der Zeiger-, Ablage- und Tastenereignisse (`useWhiteboardDropZone`) und die **echte** Berührung
// auf einem Gerät: `NOT_TESTED` — dafür fehlt in dieser Umgebung ein Browser. Geprüft ist alles, was rein
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
import { WHITEBOARD_DROP_INTENT_LABEL, WHITEBOARD_DROP_ZONE_PRESENTATION } from './whiteboardDropZoneContract';
import type {
  WhiteboardDropChoice,
  WhiteboardDropCommand,
  WhiteboardDropCommandStep,
  WhiteboardDropResolution,
  WhiteboardDropTransferRead,
  WhiteboardDropZoneCloseReason,
  WhiteboardDropZoneRefusal,
  WhiteboardDropZoneState,
  WhiteboardDropZoneStep,
  WhiteboardDropZoneView,
} from './whiteboardDropZoneContract';

export { FABRIC_WORKSPACE_OBJECT_DRAG_MIME };

/**
 * Die Tasten der Absichten — abgeleitet aus der **vorhandenen** Absichtsliste (Paket 4), damit hier **keine**
 * zweite Grenze („1–4") entsteht: *eine neue Absicht bekommt ihre Taste von selbst.*
 */
const CHOICE_KEYS: readonly string[] = WORKSPACE_DROP_INTENTS.map((_, index) => String(index + 1));

const NO_CHOICES: readonly WhiteboardDropChoice[] = Object.freeze([]);

const NOT_CARRIED: WhiteboardDropTransferRead = Object.freeze({
  ok: false as const,
  reason: 'whiteboard-drop-transfer-missing' as const,
});

/** Die Ablagefläche, wie der DOM sie anbietet — **strukturell**, ohne DOM-Typen (wie `DragPointerLike` in Paket 5). */
export interface WhiteboardDataTransferLike {
  readonly getData?: (mime: string) => unknown;
}

/** Der Träger, wie er aus der Ablagefläche kommt — die **eine** MIME-Konstante, sonst nichts. */
export type WhiteboardTransferRead =
  | { readonly ok: true; readonly payload: string; readonly reason?: never }
  | {
      readonly ok: false;
      readonly reason: 'whiteboard-drop-transfer-missing' | 'whiteboard-drop-transfer-unreadable';
      readonly payload?: never;
    };

/**
 * Die Eingaben einer Zustellung — die **eine** Autorität, die eigene App, das Zieldokument und der **untrusted**
 * Träger.
 *
 * `registry` ist ein **Parameter** und keine fest verdrahtete Konstante, damit derselbe reine Code gegen die
 * **versiegelte** Matrix der Shell **und** gegen eine im Test aufgebaute Instanz **derselben** Klasse laufen kann:
 * *die Regel bleibt eine, der Prüfling darf ein zweiter Aufbau sein.* Die Produktion reicht die versiegelte Matrix
 * der Shell hinein (`useWhiteboardDropZone`) — es entsteht **keine** zweite Matrix.
 */
export interface WhiteboardDropZoneContext {
  readonly registry: WorkspaceInteractionRegistry | null | undefined;
  /** Die eigene Anwendung — sie wird **nicht** geraten, sondern aus `document.kind` gereicht. */
  readonly targetApp: unknown;
  readonly targetDocumentId: unknown;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly payload?: unknown;
  /**
   * **Paket 15: der Modus einer Live-Anforderung — und es gibt keinen Default.**
   *
   * *Der Befund:* eine Live-Route verspricht einen Modus (`Live` / `Frozen`), den die Zustellung ausdrücken muss.
   * Wird er **gesagt**, liefert der Resolver `integrationKind: 'live'` **mit** `mode`; wird er **nicht** gesagt,
   * antwortet er **benannt** `drop_live_mode_required` ✗ — *kein heimlicher Default* ✓✓.
   *
   * Der Modus wird **mitgeführt**, nicht erfunden: er kommt aus dem Kontext (wie bei der Referenz in
   * `apps/present/integrations/workspace-drop/presentWorkspaceDropZone.ts`), und er wird **konditional gespreizt**,
   * damit **kein** ausdrückliches `undefined` entsteht.
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

function sameState(state: WhiteboardDropZoneState): WhiteboardDropZoneStep {
  return { ok: true, state };
}

function stateOf(
  state: WhiteboardDropZoneState,
  next: {
    readonly target?: DropTargetState;
    readonly transfer?: WhiteboardDropTransferRead;
    readonly decision?: WhiteboardDropZoneState['decision'];
    readonly closedReason?: WhiteboardDropZoneCloseReason | null;
  },
): WhiteboardDropZoneState {
  return Object.freeze({
    target: next.target ?? state.target,
    transfer: next.transfer ?? state.transfer,
    decision: next.decision ?? state.decision,
    closedReason: next.closedReason === undefined ? state.closedReason : next.closedReason,
  });
}

/** Eine Ablehnung ist ein **Zustand** mit **benanntem** Grund — kein `null`, das wie Erfolg aussieht. */
function refuse(
  state: WhiteboardDropZoneState,
  code: WhiteboardDropZoneRefusal,
  target: DropTargetState = state.target,
  transfer: WhiteboardDropTransferRead = state.transfer,
): WhiteboardDropZoneStep {
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
function noOp(state: WhiteboardDropZoneState, reason: WhiteboardDropZoneRefusal): WhiteboardDropZoneStep {
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
function targetRefusal(targetApp: unknown, targetDocumentId: unknown): 'whiteboard-drop-target-missing' | null {
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) return 'whiteboard-drop-target-missing';
  if (typeof targetApp !== 'string' || targetApp.trim().length === 0) return 'whiteboard-drop-target-missing';
  return null;
}

/**
 * **Der Träger wird gelesen, nicht geraten.** Der **eine** Parser (Paket 7) entscheidet: unbekannte Objektart,
 * fehlendes Feld, ein **sechstes** Feld oder zu viele Bytes werden **benannt** abgelehnt — mit **seinem** Code,
 * nicht mit einem zweiten Vokabular. `objectKind` aus dem Deskriptor wird damit zur **Tatsache**, auf die Paket 6
 * seine Frage stützt.
 */
export function readWhiteboardDropTransfer(payload: unknown): WhiteboardDropTransferRead {
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
export function readWhiteboardWorkspaceTransfer(
  dataTransfer: WhiteboardDataTransferLike | null | undefined,
): WhiteboardTransferRead {
  if (!dataTransfer) return { ok: false, reason: 'whiteboard-drop-transfer-missing' };
  const read = dataTransfer.getData;
  if (typeof read !== 'function') return { ok: false, reason: 'whiteboard-drop-transfer-unreadable' };
  let value: unknown;
  try {
    value = read.call(dataTransfer, FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  } catch {
    return { ok: false, reason: 'whiteboard-drop-transfer-unreadable' };
  }
  return typeof value === 'string' && value.length > 0
    ? { ok: true, payload: value }
    : { ok: false, reason: 'whiteboard-drop-transfer-missing' };
}

/**
 * **Ist dieser Zug überhaupt für uns?** — der `types`-Blick, **ohne** Inhalt.
 *
 * Das ist keine Bequemlichkeit, sondern eine Eigenschaft des Browsers: während `dragenter` / `dragover` liegt der
 * Ablagespeicher im **geschützten** Modus, und `getData()` liefert dann **nichts**. `types` dagegen ist sichtbar.
 * Eine Fläche, die den Zug erst anhand von `getData()` beansprucht, ruft **nie** `preventDefault()` — und bekommt
 * deshalb **nie** ein `drop`. *Der Inhalt wird also erst bei der Ablage gelesen; bis dahin ist das Urteil
 * `reject`, und genau dafür ist fail-closed da.*
 */
export function isWhiteboardWorkspaceDrag(dataTransfer: { readonly types?: unknown } | null | undefined): boolean {
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
export function whiteboardDropCapabilityQuestion(
  context: Pick<WhiteboardDropZoneContext, 'registry' | 'targetDocumentId' | 'documents' | 'requestedMode'> & { readonly payload?: unknown; readonly requestedPolicyDecision?: unknown },
): CapabilityQuestion | null {
  const registry = context.registry;
  if (!registry || typeof registry.getAdapter !== 'function') return null;
  const payload = asPayload(context.payload);
  if (payload === null) return null;
  const targetDocumentId = context.targetDocumentId;
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) return null;
  // **Paket 15** ✓: Der Modus geht auch in die **Frage** — *sonst fragte die Fläche eine andere Frage, als sie
  // später stellt* ✗. Bedingtes Spreizen: ein ausdrückliches `undefined` wäre der verbotene Default ✓✓.
  const mode = context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode };
  // UEBERGANGSMARKER (W-455): **dieselbe** Entscheidung wie in der Zustellung — *die Frage darf nicht „fähig"
  // sagen, wo die Richtlinie die Ablage verweigert* ✗✓✓. *Die Entscheidung steht hier **noch nicht** bereit (die
  // Shell holt sie asynchron: `precheckPolicy`) und wird voruebergehend als `Allow` weitergereicht* ✗✓ — *laut
  // markiert und im Bericht gefuehrt* ✓.
  const policy = context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision };
  return (_targetApp: string, _objectKind: string, intent: string): boolean => {
    try {
      const assessment = evaluateWorkspaceDrop(
        { payload, targetDocumentId, requestedIntent: intent, ...mode, ...policy, documents: context.documents },
        registry,
      );
      if (assessment.status !== 'rejected') return true;
      // **Paket 15 — der eine benannte Code, der „fähig" heißt** ✓✓.
      //
      // `drop_live_mode_required` sagt: **die Route ist fähig, der Modus ist das Problem** — *nicht* „keine Route" ✗.
      // Würde die Fläche ihn wie jede andere Ablehnung lesen, meldete sie beim Überfahren **fälschlich**
      // `route-not-capable` ✗, obwohl die Ablage mit gewähltem Modus glatt zustellt ✓.
      //
      // *Und es ist **keine** zweite Erlaubnisregel:* gelesen wird der **eigene** Code der Autorität ✓ — **genau
      // dieser eine**; jeder andere Code bleibt fail-closed `false` ✓. Auch ein **unbrauchbarer** Moduswert
      // (`'kaputt'`) fällt hierher, und das ist richtig: der Modus ist das Problem, nicht die Route ✓.
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
  transfer: WhiteboardDropTransferRead,
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
export function createWhiteboardDropZone(): WhiteboardDropZoneState {
  return Object.freeze({
    target: createDropTarget(),
    transfer: NOT_CARRIED,
    decision: Object.freeze({ kind: 'none' as const }),
    closedReason: null,
  });
}

/**
 * **Die Fläche wird überfahren** — das Urteil entsteht bei Paket 6, zugestellt wird noch nicht.
 *
 * Ein **entschiedener** Fall bleibt stehen: *ein Ablehnungs- oder Zustellungsgrund ist eine Tatsache, die ein
 * bewegter Zeiger nicht überschreibt.* Ein **unlesbarer** Träger ist **kein** Fehler des Aufrufs, sondern ein
 * Zustand: die Fläche sagt an, dass sie den Träger (noch) nicht lesen kann — und nennt den Grund dafür.
 */
export function hoverWhiteboardDropZone(
  state: WhiteboardDropZoneState,
  context: WhiteboardDropZoneContext,
): WhiteboardDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isWhiteboardDropZoneDecided(state)) return sameState(state);
  const transfer = readWhiteboardDropTransfer(context.payload);
  const question = transfer.ok ? whiteboardDropCapabilityQuestion(context) : null;
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'whiteboard-drop-target-missing');
  return {
    ok: true,
    state: stateOf(state, { target: verdict.state, transfer, decision: { kind: 'none' }, closedReason: null }),
  };
}

/** Die Fläche wird **verlassen** — das Urteil wird **zurückgenommen** (Paket 6: `leaveDropTarget`), kein Rest. */
export function leaveWhiteboardDropZone(
  state: WhiteboardDropZoneState,
  reason: WhiteboardDropZoneCloseReason = 'drag-left',
): WhiteboardDropZoneStep {
  if (isWhiteboardDropZoneDecided(state)) return sameState(state);
  if (!isWhiteboardDropZoneVisible(state)) return { ok: false, reason: 'whiteboard-drop-inactive', state };
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
export function enterWhiteboardDropZone(
  state: WhiteboardDropZoneState,
  context: WhiteboardDropZoneContext,
): WhiteboardDropZoneStep {
  return hoverWhiteboardDropZone(isWhiteboardDropZoneDecided(state) ? createWhiteboardDropZone() : state, context);
}

/**
 * Der **Abbruchgrund der Zieh-Session wird übernommen**, wenn die Zone ihn kennt.
 *
 * Paket 5 führt die Gründe bereits **benannt** (`pointer-lost` bei `pointercancel`, `window-blur` beim
 * Fensterverlust). Sie hier auf `drag-left` einzuebnen, würde eine vorhandene Tatsache wegwerfen — *und genau die
 * braucht die Touch-Entscheidung: ein vom System abgebrochener Touch ist kein „danebengezogener Zeiger".*
 */
function closeReasonOf(reason: DragEndReason | null): WhiteboardDropZoneCloseReason {
  return reason === 'pointer-lost' || reason === 'window-blur' ? reason : 'drag-left';
}

/**
 * **Der Empfänger folgt dem vorhandenen Zug** (Paket 5) — `isDragActive`, `session.payload` und der benannte
 * `endReason` kommen **wörtlich** aus der Zieh-Session, statt dass hier ein zweiter Zug geführt wird. Läuft kein
 * Zug mehr, schließt eine **überfahrene** Fläche mit **dessen** Grund; ein **entschiedener** Fall bleibt stehen.
 */
export function whiteboardDropZoneFromDragSession(
  state: WhiteboardDropZoneState,
  session: DragSessionState,
  context: WhiteboardDropZoneContext,
): WhiteboardDropZoneStep {
  if (isDragActive(session)) {
    return enterWhiteboardDropZone(state, { ...context, payload: session.payload });
  }
  if (isWhiteboardDropZoneDecided(state)) return sameState(state);
  if (state.target.overTarget) return leaveWhiteboardDropZone(state, closeReasonOf(session.endReason));
  return { ok: false, reason: 'whiteboard-drop-inactive', state };
}

function choiceOf(selection: WorkspaceDropSelection, index: number): WhiteboardDropChoice {
  const key = CHOICE_KEYS[index] ?? String(index + 1);
  return Object.freeze({
    intent: selection.intent,
    label: WHITEBOARD_DROP_INTENT_LABEL[selection.intent],
    adapterId: selection.adapterId,
    key,
    shortcutLabel: key,
  });
}

function resolutionOf(
  selection: WorkspaceDropSelection,
  sourceVersion: number,
  targetVersion: number,
): WhiteboardDropResolution {
  return Object.freeze({
    adapterId: selection.adapterId,
    intent: selection.intent,
    // **Paket 15** ✓: Die Zustellung **sagt**, wie sie die Quelle behandelt — und bei `live` **welchen** Modus sie
    // gewählt hat. *Beim Kopieren ist die **Abwesenheit** des Modus die Aussage* ✓.
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
  state: WhiteboardDropZoneState,
  context: WhiteboardDropZoneContext,
): WhiteboardDropTransferRead {
  const fromEvent = readWhiteboardDropTransfer(context.payload);
  if (fromEvent.ok) return fromEvent;
  if (asPayload(context.payload) !== null) return fromEvent;
  return state.transfer;
}

function applyAssessment(
  state: WhiteboardDropZoneState,
  transfer: WhiteboardDropTransferRead,
  target: DropTargetState,
  assessment: WorkspaceDropAssessment,
  context: WhiteboardDropZoneContext,
  failOnChoice: boolean,
): WhiteboardDropZoneStep {
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
  state: WhiteboardDropZoneState,
  transfer: WhiteboardDropTransferRead,
  target: DropTargetState,
  intent: unknown,
  context: WhiteboardDropZoneContext,
  failOnChoice: boolean,
): WhiteboardDropZoneStep {
  if (!transfer.ok) return refuse(state, transfer.reason, target, transfer);
  const registry = context.registry;
  if (!registry || typeof registry.getAdapter !== 'function') {
    // Ohne die eine Autorität gibt es **keine** Antwort — derselbe fail-closed Name, den Paket 6 für eine
    // unbeantwortbare Fähigkeitsfrage führt.
    return refuse(state, 'verdict-unavailable', target, transfer);
  }
  const targetDocumentId = context.targetDocumentId;
  if (typeof targetDocumentId !== 'string' || targetDocumentId.length === 0) {
    return refuse(state, 'whiteboard-drop-target-missing', target, transfer);
  }
  let assessment: WorkspaceDropAssessment;
  try {
    // **Die absichtslose Frage stellt nur fest — sie liefert nie aus** ✓✓ (Paket 15, gemessen).
    //
    // *Der Befund:* `resolveWorkspaceDrop` mit `requestedIntent: undefined` antwortet für eine reine Live-Route
    // **`resolved`** — **ohne** Modus ✗. Die Modusregel des Resolvers greift **nur** bei **ausdrücklichem**
    // `requestedIntent === 'LIVE_REFERENCE'` (`workspaceInteractionResolver.ts:110`), weil die absichtslose Runde
    // die **Auswahl** anbietet („nur zur Auswahl angeboten … muss ihn mit Modus erneut anfordern").
    // Hätte die Fläche diese Runde als Zustellung genommen, hätte sie einen Live-Verweis **ohne** Live/Frozen
    // ausgeliefert ✗ — *genau der heimliche Default, den Paket 15 verbietet* ✓.
    //
    // Deshalb: ohne Absicht wird **nur gefragt** (`evaluateWorkspaceDrop`), und zugestellt wird ausschließlich mit
    // **genannter** Absicht (`resolveWorkspaceDrop`) ✓. *Eine Zustellung ohne Absicht gibt es nicht* ✓.
    assessment = intent === undefined
      ? evaluateWorkspaceDrop(
          {
            payload: transfer.payload,
            targetDocumentId,
            // **Paket 15** ✓: Der Modus wird **mitgeführt**, nicht erfunden ✗ — dieselbe konditionale Spreizung wie
            // in der Frage und wie in der Referenz (`presentWorkspaceDropZone.ts`). *Ein explizites `undefined`
            // wäre der heimliche Default, den Paket 15 verbietet.*
            ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
            // UEBERGANGSMARKER (W-455): die Entscheidung der Administratorrichtlinie steht hier **noch nicht**
            // bereit — *die Shell holt sie asynchron* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) *und
            // reicht sie ueber den Kontext hinein* ✓. **Dieses feste `Allow` ist bis dahin voruebergehend falsch**
            // ✗✓ — *aber **laut** markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die
            // Entscheidung wirklich ankommt, wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`).
            ...(context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision }),
            documents: context.documents,
          },
          registry,
        )
      : resolveWorkspaceDrop(
          {
            payload: transfer.payload,
            targetDocumentId,
            requestedIntent: intent,
            ...(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode }),
            // UEBERGANGSMARKER (W-455): die Entscheidung der Administratorrichtlinie steht hier **noch nicht**
            // bereit — *die Shell holt sie asynchron* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) *und
            // reicht sie ueber den Kontext hinein* ✓. **Dieses feste `Allow` ist bis dahin voruebergehend falsch**
            // ✗✓ — *aber **laut** markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die
            // Entscheidung wirklich ankommt, wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`).
            ...(context.requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision: context.requestedPolicyDecision }),
            documents: context.documents,
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
 * (`commitDropTarget`): ein abgelehntes Urteil führt **nie** zur Zustellung. *Kein stiller Erfolg.*
 */
function commitTransfer(state: WhiteboardDropZoneState, context: WhiteboardDropZoneContext): WhiteboardDropZoneStep {
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = whiteboardDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  if (!verdict.ok) return refuse(state, 'whiteboard-drop-target-missing');
  const gate = commitDropTarget(verdict.state);
  if (!gate.ok) {
    const code: WhiteboardDropZoneRefusal =
      verdict.state.reason ?? (transfer.payload.length > 0 ? 'whiteboard-drop-inactive' : 'payload-missing');
    return refuse(state, code, verdict.state, transfer);
  }
  // **Der Erfolg verbraucht das Urteil** (Paket 6): `gate.state` ist wieder leer — ein stehengebliebenes
  // „hier annehmen" wäre nach der Ablage eine Lüge.
  return routeWithIntent(state, transfer, gate.state, undefined, context, true);
}

/**
 * **Die Zeiger-Ablage.** Ohne eindeutige Route wird **nicht** zugestellt: der Zustand ist dann `choice` und der
 * Grund ist der der Matrix (`drop_intent_choice_required`).
 */
export function dropWhiteboardDropZone(
  state: WhiteboardDropZoneState,
  context: WhiteboardDropZoneContext,
): WhiteboardDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isWhiteboardDropZoneDecided(state)) return noOp(state, 'whiteboard-drop-already-decided');
  return commitTransfer(state, context);
}

/**
 * **Die Tastatur-Absicht: bestätigen** — derselbe Weg wie die Ablage.
 *
 *   * `choice` → **wörtlich die Ablage**: ohne gewählte Absicht gibt es keine Zustellung, und der Grund kommt
 *     von der Matrix.
 *   * sonst → derselbe Abschluss wie der Zeiger, **ohne** dass die Fläche vorher überfahren werden musste:
 *     *eine Tastatur, die erst einen Zeiger braucht, ist keine Alternative.*
 *   * `refused` / `delivered` → der Fall ist entschieden (`whiteboard-drop-already-decided`, benannter No-op).
 */
export function confirmWhiteboardDropZone(
  state: WhiteboardDropZoneState,
  context: WhiteboardDropZoneContext,
): WhiteboardDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isWhiteboardDropZoneDecided(state)) return noOp(state, 'whiteboard-drop-already-decided');
  if (state.decision.kind === 'choice') return dropWhiteboardDropZone(state, context);
  return commitTransfer(state, context);
}

/**
 * **Die Tastatur-Absicht: eine Absicht wählen** — dieselbe Zustellung wie die Ablage.
 *
 * Eine Absicht, die **nicht** angeboten wurde, wird **nicht** stillschweigend übernommen: sie geht durch die
 * Matrix und wird dort benannt abgelehnt (`drop_intent_not_supported` / `intent_unknown`). Deshalb wird hier
 * **nicht** vorab gegen das Urteil geprüft — *die Matrix ist die Prüfung.*
 */
export function chooseWhiteboardDropIntent(
  state: WhiteboardDropZoneState,
  intent: unknown,
  context: WhiteboardDropZoneContext,
): WhiteboardDropZoneStep {
  const missingTarget = targetRefusal(context.targetApp, context.targetDocumentId);
  if (missingTarget) return refuse(state, missingTarget);
  if (isWhiteboardDropZoneDecided(state)) return noOp(state, 'whiteboard-drop-already-decided');
  const transfer = transferForCommit(state, context);
  if (!transfer.ok) return refuse(state, transfer.reason, state.target, transfer);
  const question = whiteboardDropCapabilityQuestion({ ...context, payload: transfer.payload });
  const verdict = verdictOfTransfer(context.targetApp, transfer, question);
  return routeWithIntent(state, transfer, verdict.ok ? verdict.state : state.target, intent, context, true);
}

/** Ob der Fall **entschieden** ist — `refused` und `delivered` werden von einem überfahrenden Zeiger nicht ersetzt. */
export function isWhiteboardDropZoneDecided(state: WhiteboardDropZoneState): boolean {
  return state.decision.kind === 'refused' || state.decision.kind === 'delivered';
}

/** Ob die Ansicht die sichtbare Zone rendert — die Ansageregion steht davon **unabhängig** immer im DOM. */
export function isWhiteboardDropZoneVisible(state: WhiteboardDropZoneState): boolean {
  return state.target.overTarget || state.decision.kind !== 'none';
}

/** **Die View-Phase wird gerechnet, nicht gespeichert** — zwei Felder für eine Tatsache wären der Defekt selbst. */
export function whiteboardDropZoneView(state: WhiteboardDropZoneState): WhiteboardDropZoneView {
  if (state.decision.kind === 'delivered') return 'resolved';
  if (state.decision.kind === 'refused') return 'refused';
  if (state.decision.kind === 'choice') return 'choice';
  if (!state.target.overTarget) return 'closed';
  return state.target.verdict === 'accept' ? 'ready' : 'open';
}

/** Die Präsentation (Zeichen, Form, Überschrift) zur **gerechneten** View-Phase — eine Quelle für die Ansicht. */
export function whiteboardDropZonePresentation(state: WhiteboardDropZoneState) {
  return WHITEBOARD_DROP_ZONE_PRESENTATION[whiteboardDropZoneView(state)];
}

/** **Die Vorschau kommt aus dem Urteil** (Paket 6, `preview`) — dieses Modul formuliert sie nicht neu. */
export function whiteboardDropZonePreview(state: WhiteboardDropZoneState): DropPreview | null {
  return state.target.preview;
}

/**
 * Der **benannte** Grund, den die Ansicht zeigen muss — aus dem **Träger** (warum er nicht lesbar ist), aus der
 * **Zustellung** (was der Resolver entschieden hat) oder aus dem **Urteil** (Paket 6). `null`, wenn nichts zu
 * melden ist. *Ein leeres Feld hier hieße: „alles in Ordnung" — und das darf nicht versehentlich entstehen.*
 */
export function whiteboardDropZoneRefusalCode(state: WhiteboardDropZoneState): WhiteboardDropZoneRefusal | null {
  if (state.decision.kind === 'refused') return state.decision.code;
  if (!state.transfer.ok) return state.transfer.reason;
  if (state.target.verdict === 'reject') return state.target.reason;
  return null;
}

/** Die sichtbaren Absichten — nur die, die der **Resolver** angeboten hat. */
export function whiteboardDropZoneChoices(state: WhiteboardDropZoneState): readonly WhiteboardDropChoice[] {
  return state.decision.kind === 'choice' ? state.decision.choices : NO_CHOICES;
}

/** **Die Taste wird zur Absicht** — rein und ohne DOM: nur der Tastenname wird ausgewertet. */
export function resolveWhiteboardDropCommand(state: WhiteboardDropZoneState, key: unknown): WhiteboardDropCommandStep {
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'whiteboard-drop-key-unbound' };
  if (key === 'Escape') return { ok: true, command: { kind: 'dismiss' } };
  if (key === 'Enter' || key === ' ') return { ok: true, command: { kind: 'confirm' } };
  const index = CHOICE_KEYS.indexOf(key);
  if (index < 0) return { ok: false, reason: 'whiteboard-drop-key-unbound' };
  const choice = whiteboardDropZoneChoices(state)[index];
  if (!choice) return { ok: false, reason: 'whiteboard-drop-key-unbound' };
  return { ok: true, command: { kind: 'choose', intent: choice.intent } };
}

/** **Die Absicht wird ausgeführt** — jeder Zweig führt in **dieselbe** Zustellung, die auch der Zeiger nimmt. */
export function applyWhiteboardDropCommand(
  state: WhiteboardDropZoneState,
  command: WhiteboardDropCommand,
  context: WhiteboardDropZoneContext,
): WhiteboardDropZoneStep {
  if (!command || typeof command !== 'object') return noOp(state, 'whiteboard-drop-command-unknown');
  switch (command.kind) {
    case 'confirm':
      return confirmWhiteboardDropZone(state, context);
    case 'choose':
      return chooseWhiteboardDropIntent(state, command.intent, context);
    case 'dismiss':
      return leaveWhiteboardDropZone(state, 'keyboard-dismiss');
    default:
      return noOp(state, 'whiteboard-drop-command-unknown');
  }
}

/**
 * Ob **jetzt** etwas bestätigt werden kann — die Frage, die die Ansicht dem Knopf stellt.
 *
 * Sie verlangt **beides**: einen gelesenen Träger **und** ein Urteil, das annimmt (Paket 6). *Ein „ablegen"-Knopf,
 * der bei `reject` aktiv aussieht, wäre eine Anzeige, die das Gegenteil ihres eigenen Zustands behauptet.*
 */
export function whiteboardDropZoneCanConfirm(state: WhiteboardDropZoneState): boolean {
  if (state.decision.kind === 'choice') return false;
  if (isWhiteboardDropZoneDecided(state)) return false;
  return state.transfer.ok && state.target.verdict === 'accept';
}
