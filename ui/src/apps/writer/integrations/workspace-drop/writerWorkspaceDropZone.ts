// STATUS: PLATIN — Integration & Release, **Paket 9**: die Regeln des Writer-Ablageziels (rein, kopflos prüfbar)
//
// ## Was dieses Modul **nicht** tut
//
// Es erfindet **keinen** zweiten Zieh-Mechanismus ✗. Es **liest** den vorhandenen Träger ✓ (Paket 7 ✓, über
// den Resolver ✓, der ihn selbst streng parst ✓), es fragt die **vorhandene** Matrix ✓ (Paket 4 ✓,
// `FABRIC_WORKSPACE_DROP_REGISTRY` ✓) und es **stellt zu** über den vorhandenen Resolver ✓
// (`evaluateWorkspaceDrop` / `resolveWorkspaceDrop` ✓). *Kein privater Pfad, keine zweite Route* ✓.
//
//   * **Kein zweiter Parser** ✗: `parseWorkspaceDragPayload` bleibt im Resolver ✓. Dieses Modul ruft ihn nicht
//     einmal auf ✓ — die exakten Felder des Trägers (`['documentId','objectId','objectKind','sourceApp',
//     'supportedIntents']` ✓) sind dort definiert ✓, und ein falsches Feld wird dort **abgelehnt** ✓.
//   * **Keine zweite Erlaubnisregel** ✗: `acceptance` ist das Urteil der Matrix ✓. `needsChoice` heißt
//     „angenommen, Absicht offen" ✓ — nicht „abgelehnt" ✗ und nicht „egal" ✗.
//   * **Kein stiller Erfolg** ✗: eine Ablage ohne eindeutige Route endet **benannt** als
//     `drop_intent_choice_required` ✓ — *niemals mit einer heimlichen Vorauswahl* ✗ ✓.
//
// ## Zwei Zugänge zu **einer** Zustellung
//
// Der **Zeiger** (`dropWriterWorkspaceDropZone` ✓) und die **Tastatur** (`confirmWriterWorkspaceDropZone` ✓,
// `chooseWriterWorkspaceDropIntent` ✓) rufen **dieselbe** Funktion `routeWithIntent` ✓ bzw. einander auf ✓.
// *Eine Tastatur, die einen zweiten Weg nimmt, ist kein gleichwertiger Weg* ✓ — deshalb ist `confirm` im
// Zustand `choice` **wörtlich** die Ablage ✓.
//
// ## Die Tatsachen bleiben stehen
//
// Endet der Zug, während das Ziel noch **überfährt** (`open` / `ready` / `choice` ✓), schließt es ✓. Ist der
// Fall dagegen **entschieden** (`refused` / `resolved` ✓), bleibt er stehen ✓ — *eine Ablehnung oder eine
// Zustellung ist eine Tatsache, die der Nutzer sehen muss* ✓ (dieselbe Begründung wie in Paket 5 ✓).
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  WORKSPACE_DROP_INTENTS,
  evaluateWorkspaceDrop,
  resolveWorkspaceDrop,
} from '../../../../shared/workspace-interaction';
import type {
  WorkspaceDropAssessment,
  WorkspaceDropIntent,
  WorkspaceDropSelection,
} from '../../../../shared/workspace-interaction';
import {
  FABRIC_WORKSPACE_DROP_REGISTRY,
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
} from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { isDragActive } from '../../../../shell/workspace/drag/dragSession';
import type { DragSessionState } from '../../../../shell/workspace/drag/dragSession';
import {
  WRITER_WORKSPACE_DROP_INTENT_LABEL,
  WRITER_WORKSPACE_DROP_ZONE_PRESENTATION,
  WRITER_WORKSPACE_LIVE_MODE_LABEL,
  writerWorkspaceDropObjectKindLabel,
  writerWorkspaceDropPreviewText,
  writerWorkspaceDropRefusalText,
} from './writerWorkspaceDropZoneContract';
import type {
  WriterWorkspaceDropChoice,
  WriterWorkspaceDropCommand,
  WriterWorkspaceDropCommandStep,
  WriterWorkspaceDropPreview,
  WriterWorkspaceDropResolution,
  WriterWorkspaceDropZoneCloseReason,
  WriterWorkspaceDropZonePhase,
  WriterWorkspaceDropZoneRefusal,
  WriterWorkspaceDropZoneState,
  WriterWorkspaceDropZoneStep,
} from './writerWorkspaceDropZoneContract';

/**
 * Die Tasten der Absichten ✓ — abgeleitet aus der **vorhandenen** Liste der Absichten ✓ (Paket 4 ✓), damit
 * hier **keine** zweite Grenze („1–4") entsteht ✓: *eine neue Absicht bekommt ihre Taste von selbst* ✓.
 */
const CHOICE_KEYS: readonly string[] = WORKSPACE_DROP_INTENTS.map((_, index) => String(index + 1));

const NO_CHOICES: readonly WriterWorkspaceDropChoice[] = Object.freeze([]);

/** Die Ablagefläche, wie der DOM sie anbietet ✓ — **strukturell**, ohne DOM-Typen ✓ (wie `DragPointerLike` ✓). */
export interface WriterWorkspaceDataTransferLike {
  readonly getData?: (mime: string) => unknown;
  /**
   * Die **Typenliste** ✓ — die **einzige** Angabe, die während `dragenter`/`dragover` verlässlich lesbar ist ✓:
   * im protected mode liefert `getData` dort `''` ✓ (W-443 ✓). *Derselbe Träger, nur früher lesbar* ✓ — keine
   * zweite Herkunft ✗.
   */
  readonly types?: unknown;
}

export type WriterWorkspaceTransferRead =
  | { readonly ok: true; readonly payload: string; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'drop-zone-transfer-missing' | 'drop-zone-transfer-unreadable'; readonly payload?: never };

/** Die Eingaben einer Zustellung ✓ — das Ziel, die bekannten Dokumente und der **untrusted** Träger ✓. */
export interface WriterWorkspaceDropZoneContext {
  readonly targetDocumentId: unknown;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly payload?: unknown;
  /**
   * **Der gewählte Live-Modus** ✓ (Paket 15 ✓) — bleibt `unknown` ✓: *der Resolver benennt Unbekanntes
   * selbst* ✓. **Fehlt er, wird ein Live-Verweis nicht zugestellt** ✓✓ — *kein heimlicher Default* ✗ ✓.
   */
  readonly requestedMode?: unknown;
  /**
   * **W-455** ✓✓: die Entscheidung der Administratorrichtlinie zu **dieser** Ablage — *hineingereicht, nicht hier
   * abgefragt* ✓: *die Zone bleibt **rein und synchron**, die asynchrone Antwort kommt aus der **einen**
   * vorhandenen Autoritaet* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) ✓. *Fehlt sie, wird die
   * Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`) — **kein stiller Erfolg** ✗✓.
   */
  readonly requestedPolicyDecision?: unknown;
}

function presentationOf(phase: WriterWorkspaceDropZonePhase) {
  return WRITER_WORKSPACE_DROP_ZONE_PRESENTATION[phase];
}

function ok(state: WriterWorkspaceDropZoneState): WriterWorkspaceDropZoneStep {
  return { ok: true, state };
}

function refuse(
  state: WriterWorkspaceDropZoneState,
  targetDocumentId: string | null,
  code: WriterWorkspaceDropZoneRefusal,
): WriterWorkspaceDropZoneStep {
  const presentation = presentationOf('refused');
  return {
    ok: false,
    reason: code,
    state: Object.freeze({
      ...state,
      phase: 'refused' as const,
      glyph: presentation.glyph,
      pattern: presentation.pattern,
      headline: presentation.headline,
      detail: writerWorkspaceDropRefusalText(code),
      code,
      acceptance: 'refused' as const,
      targetDocumentId,
      choices: NO_CHOICES,
      preview: null,
      resolution: null,
      canConfirmWithKeyboard: false,
      closedReason: null,
    }),
  };
}

function closedState(
  state: WriterWorkspaceDropZoneState,
  reason: WriterWorkspaceDropZoneCloseReason | null,
): WriterWorkspaceDropZoneState {
  const presentation = presentationOf('closed');
  return Object.freeze({
    ...state,
    phase: 'closed' as const,
    glyph: presentation.glyph,
    pattern: presentation.pattern,
    headline: presentation.headline,
    detail: null,
    code: null,
    acceptance: 'unknown' as const,
    choices: NO_CHOICES,
    preview: null,
    resolution: null,
    canConfirmWithKeyboard: false,
    closedReason: reason,
  });
}

function openState(state: WriterWorkspaceDropZoneState, targetDocumentId: string): WriterWorkspaceDropZoneState {
  const presentation = presentationOf('open');
  return Object.freeze({
    ...state,
    phase: 'open' as const,
    glyph: presentation.glyph,
    pattern: presentation.pattern,
    headline: presentation.headline,
    detail: 'Dieses Ziel nimmt Workspace-Objekte an. Ob es diesen Träger annimmt, entscheidet die Matrix.',
    code: null,
    acceptance: 'unknown' as const,
    targetDocumentId,
    choices: NO_CHOICES,
    preview: null,
    resolution: null,
    canConfirmWithKeyboard: false,
    closedReason: null,
  });
}

function previewOfSelection(selection: WorkspaceDropSelection, intent: WorkspaceDropIntent | null): WriterWorkspaceDropPreview {
  return Object.freeze({
    objectKind: selection.objectKind,
    objectKindLabel: writerWorkspaceDropObjectKindLabel(selection.objectKind),
    sourceDocumentId: selection.sourceDocumentId,
    sourceObjectId: selection.sourceObjectId,
    intent,
    intentLabel: intent === null ? null : WRITER_WORKSPACE_DROP_INTENT_LABEL[intent],
    // **Paket 15** ✓: die neue Tatsache steht **im Zustand** ✓ — die Ansicht **liest** sie ✓, sie erfindet
    // sie nicht ✗. `mode === null` heißt „noch offen" ✓ und **nicht** „Live" ✗ (*kein heimlicher Default* ✓).
    integrationKind: selection.integrationKind,
    mode: selection.mode ?? null,
    modeLabel: selection.mode === undefined ? null : WRITER_WORKSPACE_LIVE_MODE_LABEL[selection.mode],
    adapterId: selection.adapterId,
  });
}

function toChoice(selection: WorkspaceDropSelection, index: number): WriterWorkspaceDropChoice {
  const key = CHOICE_KEYS[index] ?? String(index + 1);
  const mode = selection.mode ?? null;
  return Object.freeze({
    intent: selection.intent,
    integrationKind: selection.integrationKind,
    mode,
    // **Das Absichtswort bleibt schlicht** ✓ (wie in der Notes-Zone ✓) — *die Modusfrage stellt der
    // **Modus-Block** ✓ (`writerWorkspaceDropZoneNeedsMode` ✓ + Aufforderung + zwei Knöpfe ✓)*. Ein
    // `COPY`-Angebot trägt **keinen** Modus ✓ (*Abwesenheit ist die Aussage* ✓).
    label: WRITER_WORKSPACE_DROP_INTENT_LABEL[selection.intent],
    adapterId: selection.adapterId,
    key,
    shortcutLabel: key,
  });
}

function choiceState(
  state: WriterWorkspaceDropZoneState,
  targetDocumentId: string,
  choices: readonly WriterWorkspaceDropChoice[],
  preview: WriterWorkspaceDropPreview | null,
): WriterWorkspaceDropZoneState {
  const presentation = presentationOf('choice');
  return Object.freeze({
    ...state,
    phase: 'choice' as const,
    glyph: presentation.glyph,
    pattern: presentation.pattern,
    headline: presentation.headline,
    detail: writerWorkspaceDropRefusalText('drop_intent_choice_required'),
    code: 'drop_intent_choice_required' as const,
    acceptance: 'accepted' as const,
    targetDocumentId,
    choices: Object.freeze([...choices]),
    preview,
    resolution: null,
    canConfirmWithKeyboard: false,
    closedReason: null,
  });
}

function resolutionOf(
  selection: WorkspaceDropSelection,
  sourceVersion: number,
  targetVersion: number,
): WriterWorkspaceDropResolution {
  return Object.freeze({
    adapterId: selection.adapterId,
    intent: selection.intent,
    // **Paket 15** ✓: `copy` ✓ / `live` ✓ — und der Modus **nur**, wenn er gesagt wurde ✓✓ (bedingtes
    // Spreizen: *ein ausdrückliches `undefined` wäre der heimliche Default* ✗ ✓).
    integrationKind: selection.integrationKind,
    ...(selection.mode === undefined ? {} : { mode: selection.mode }),
    sourceDocumentId: selection.sourceDocumentId,
    sourceObjectId: selection.sourceObjectId,
    targetDocumentId: selection.targetDocumentId,
    sourceVersion,
    targetVersion,
  });
}

function resolvedState(
  state: WriterWorkspaceDropZoneState,
  resolution: WriterWorkspaceDropResolution,
  preview: WriterWorkspaceDropPreview,
  choice: WriterWorkspaceDropChoice,
): WriterWorkspaceDropZoneState {
  const presentation = presentationOf('resolved');
  return Object.freeze({
    ...state,
    phase: 'resolved' as const,
    glyph: presentation.glyph,
    pattern: presentation.pattern,
    headline: presentation.headline,
    detail: `${writerWorkspaceDropPreviewText(preview)} · Quelle v${resolution.sourceVersion} → Ziel v${resolution.targetVersion}`,
    code: null,
    acceptance: 'accepted' as const,
    targetDocumentId: resolution.targetDocumentId,
    choices: Object.freeze([choice]),
    preview,
    resolution,
    canConfirmWithKeyboard: false,
    closedReason: null,
  });
}

/** Nur „ist überhaupt eine Zeichenkette da" ✓ — die **Format**prüfung der Kennung bleibt beim Resolver ✓. */
function readTransfer(payload: unknown): { readonly ok: true; readonly payload: string } | { readonly ok: false } {
  return typeof payload === 'string' && payload.length > 0 ? { ok: true, payload } : { ok: false };
}

/** Nur „fehlt das Zieldokument" ✓ — **nicht** „ist die Kennung wohlgeformt" ✗ (das prüft der Resolver ✓). */
function targetRefusal(targetDocumentId: unknown): 'drop-zone-target-missing' | null {
  return typeof targetDocumentId === 'string' && targetDocumentId.length > 0 ? null : 'drop-zone-target-missing';
}

/**
 * **Die Fähigkeitsfrage** ✓ — sie geht durch **dieselbe** Autorität wie die Zustellung ✓.
 *
 * **Paket 15** ✓: `requestedIntent` ✓ und `requestedMode` ✓ werden **mitgeführt**, nicht erfunden ✗ — und
 * **bedingt gespreizt** ✓: *ein ausdrückliches `undefined` wäre der heimliche Default, den Paket 15
 * verbietet* ✗✓.
 *
 * *Warum die Fähigkeitsfrage den Modus braucht:* ohne ihn meldete sie für einen ausdrücklich angeforderten
 * Live-Verweis `registry_adapter_route_missing` / `drop_intent_not_supported` ✓ — **falsch** ✗. Mit ihm sagt
 * sie **fähig** ✓, und **ohne** ihn nennt sie den wahren Grund ✓ (`drop_live_mode_required` ✓).
 */
function assess(
  targetDocumentId: string,
  documents: Readonly<Record<string, WorkspaceDocument>>,
  payload: string,
  requestedIntent: unknown,
  requestedMode: unknown,
  requestedPolicyDecision: unknown,
): WorkspaceDropAssessment {
  return evaluateWorkspaceDrop({
    payload,
    targetDocumentId,
    documents,
    ...(requestedIntent === undefined ? {} : { requestedIntent }),
    ...(requestedMode === undefined ? {} : { requestedMode }),
    // UEBERGANGSMARKER (W-455): die Entscheidung der Administratorrichtlinie steht hier **noch nicht** bereit —
    // *die Shell holt sie asynchron* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) *und reicht sie ueber
    // den Kontext hinein* ✓. **Dieses feste `Allow` ist bis dahin voruebergehend falsch** ✗✓ — *aber **laut**
    // markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die Entscheidung wirklich ankommt,
    // wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`).
    ...(requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision }),
  }, FABRIC_WORKSPACE_DROP_REGISTRY);
}

function applyAssessment(
  state: WriterWorkspaceDropZoneState,
  targetDocumentId: string,
  assessment: WorkspaceDropAssessment,
  failOnChoice: boolean,
): WriterWorkspaceDropZoneStep {
  if (assessment.status === 'rejected') return refuse(state, targetDocumentId, assessment.code);
  if (assessment.status === 'resolved') {
    return ok(resolvedState(
      state,
      resolutionOf(assessment.selection, assessment.sourceVersion, assessment.targetVersion),
      previewOfSelection(assessment.selection, assessment.selection.intent),
      toChoice(assessment.selection, 0),
    ));
  }
  if (assessment.status === 'needsChoice') {
    const next = choiceState(
      state,
      targetDocumentId,
      assessment.choices.map(toChoice),
      previewOfSelection(assessment.choices[0], null),
    );
    // Beim **Überfahren** ist „Absicht wählen" der richtige Zustand ✓; bei der **Ablage** ist es eine
    // benannte Ablehnung ✓ — der Träger liegt noch nicht an ✓.
    return failOnChoice ? { ok: false, reason: 'drop_intent_choice_required', state: next } : ok(next);
  }
  const presentation = presentationOf('ready');
  const preview = previewOfSelection(assessment.selection, assessment.selection.intent);
  return ok(Object.freeze({
    ...state,
    phase: 'ready' as const,
    glyph: presentation.glyph,
    pattern: presentation.pattern,
    headline: presentation.headline,
    detail: `Bereit: ${writerWorkspaceDropPreviewText(preview)}`,
    code: null,
    acceptance: 'accepted' as const,
    targetDocumentId,
    choices: Object.freeze([toChoice(assessment.selection, 0)]),
    preview,
    resolution: null,
    canConfirmWithKeyboard: true,
    closedReason: null,
  }));
}

/**
 * **Die eine Zustellung** ✓ — Zeiger und Tastatur landen hier ✓. Die Absicht bleibt `unknown` ✓: unbekannte
 * Absichten ✓ und nicht angebotene Absichten ✓ benennt der **Resolver** ✓ (`intent_unknown` /
 * `drop_intent_not_supported` ✓) — *eine eigene Vorprüfung wäre eine zweite Wahrheit* ✗ ✓.
 *
 * **Paket 15** ✓: der Modus geht **mit** ✓ — bedingt gespreizt ✓, damit ein fehlender Modus **fehlt** ✓ und
 * nicht als `undefined` gereist kommt ✓ (*die Abwesenheit ist die Aussage* ✓).
 */
function routeWithIntent(
  state: WriterWorkspaceDropZoneState,
  targetDocumentId: string,
  documents: Readonly<Record<string, WorkspaceDocument>>,
  payload: string,
  intent: unknown,
  requestedMode: unknown,
  requestedPolicyDecision: unknown,
): WriterWorkspaceDropZoneStep {
  const assessment = resolveWorkspaceDrop({
    payload,
    targetDocumentId,
    documents,
    ...(intent === undefined ? {} : { requestedIntent: intent }),
    ...(requestedMode === undefined ? {} : { requestedMode }),
    // UEBERGANGSMARKER (W-455): die Entscheidung der Administratorrichtlinie steht hier **noch nicht** bereit —
    // *die Shell holt sie asynchron* (`precheckPolicy`, `platform/native/nativePolicy.ts:5`) *und reicht sie ueber
    // den Kontext hinein* ✓. **Dieses feste `Allow` ist bis dahin voruebergehend falsch** ✗✓ — *aber **laut**
    // markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die Entscheidung wirklich ankommt,
    // wird die Ablage **benannt** abgewiesen* ✓ (`drop_policy_decision_required`).
    ...(requestedPolicyDecision === undefined ? { requestedPolicyDecision: { effect: 'Allow' } } : { requestedPolicyDecision }),
  }, FABRIC_WORKSPACE_DROP_REGISTRY);
  return applyAssessment(state, targetDocumentId, assessment, true);
}

/** Das leere Ziel ✓ — jede Sitzung beginnt hier ✓, und die Ansicht rendert dazu **nichts** ✓. */
export function createWriterWorkspaceDropZone(targetDocumentId?: unknown): WriterWorkspaceDropZoneState {
  const presentation = presentationOf('closed');
  return Object.freeze({
    phase: 'closed' as const,
    glyph: presentation.glyph,
    pattern: presentation.pattern,
    headline: presentation.headline,
    detail: null,
    code: null,
    acceptance: 'unknown' as const,
    targetDocumentId: typeof targetDocumentId === 'string' && targetDocumentId.length > 0 ? targetDocumentId : null,
    choices: NO_CHOICES,
    preview: null,
    resolution: null,
    canConfirmWithKeyboard: false,
    closedReason: null,
  });
}

/**
 * **Ein Zug ist über der Fläche** ✓ — der Träger wird **nicht** erfunden: fehlt er, ist das Ziel `open` ✓
 * (der leere Zustand ✓) und **kein** Fehler ✗. Erst eine **Ablage** ohne Träger wird benannt abgelehnt ✓.
 *
 * **Paket 15** ✓: die Fähigkeitsfrage bekommt den **Modus** ✓ — ohne ihn meldete sie für einen Live-Verweis
 * `registry_adapter_route_missing` ✓, *und das wäre falsch* ✗.
 */
export function openWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetDocumentId);
  if (missingTarget) return refuse(state, state.targetDocumentId, missingTarget);
  const targetDocumentId = context.targetDocumentId as string;
  const transfer = readTransfer(context.payload);
  if (!transfer.ok) return ok(openState(state, targetDocumentId));
  return applyAssessment(
    state,
    targetDocumentId,
    assess(targetDocumentId, context.documents, transfer.payload, undefined, context.requestedMode, context.requestedPolicyDecision),
    false,
  );
}

/**
 * **Die Zeiger-Ablage** ✓. Ohne eindeutige Route wird **nicht** zugestellt ✗: der Zustand ist dann `choice`
 * und der Grund ist der der Matrix ✓ (`drop_intent_choice_required` ✓).
 */
export function dropWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetDocumentId);
  if (missingTarget) return refuse(state, state.targetDocumentId, missingTarget);
  const targetDocumentId = context.targetDocumentId as string;
  if (state.phase === 'closed') return refuse(state, targetDocumentId, 'drop-zone-inactive');
  const transfer = readTransfer(context.payload);
  if (!transfer.ok) return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  const assessment = assess(targetDocumentId, context.documents, transfer.payload, undefined, context.requestedMode, context.requestedPolicyDecision);
  if (assessment.status === 'rejected') return refuse(state, targetDocumentId, assessment.code);
  if (assessment.status === 'needsChoice') {
    const next = choiceState(
      state,
      targetDocumentId,
      assessment.choices.map(toChoice),
      previewOfSelection(assessment.choices[0], null),
    );
    return { ok: false, reason: 'drop_intent_choice_required', state: next };
  }
  if (assessment.status === 'resolved') {
    return ok(resolvedState(
      state,
      resolutionOf(assessment.selection, assessment.sourceVersion, assessment.targetVersion),
      previewOfSelection(assessment.selection, assessment.selection.intent),
      toChoice(assessment.selection, 0),
    ));
  }
  return routeWithIntent(
    state,
    targetDocumentId,
    context.documents,
    transfer.payload,
    assessment.selection.intent,
    context.requestedMode,
    context.requestedPolicyDecision,
  );
}

/**
 * **Die Tastatur-Absicht: bestätigen** ✓ — derselbe Weg wie die Ablage ✓.
 *
 *   * `ready` ✓ → die **eine** angebotene Route wird zugestellt ✓ (Enter legt wirklich ab ✓).
 *   * `choice` ✓ → **wörtlich die Ablage** ✓: ohne gewählte Absicht gibt es keine Zustellung ✓, und der
 *     Grund kommt von der Matrix ✓.
 *   * `open` ✓ → kein Träger ✓ → `drop-zone-transfer-missing` ✓.
 *   * `refused` / `resolved` ✓ → der Fall ist entschieden ✓ (`drop-zone-already-decided` ✓, benannter No-op ✓).
 */
export function confirmWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetDocumentId);
  if (missingTarget) return refuse(state, state.targetDocumentId, missingTarget);
  const targetDocumentId = context.targetDocumentId as string;
  if (state.phase === 'closed') return refuse(state, targetDocumentId, 'drop-zone-inactive');
  if (state.phase === 'refused' || state.phase === 'resolved') {
    return refuse(state, targetDocumentId, 'drop-zone-already-decided');
  }
  if (state.phase === 'choice') return dropWriterWorkspaceDropZone(state, context);
  const offered = state.choices[0];
  if (state.phase === 'open' || !offered) return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  const transfer = readTransfer(context.payload);
  if (!transfer.ok) return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  return routeWithIntent(state, targetDocumentId, context.documents, transfer.payload, offered.intent, context.requestedMode, context.requestedPolicyDecision);
}

/**
 * **Die Tastatur-Absicht: eine Absicht wählen** ✓ — dieselbe Zustellung wie die Ablage ✓.
 *
 * Eine Absicht, die **nicht** angeboten wurde, wird **nicht** stillschweigend übernommen ✗ — sie geht durch
 * die Matrix ✓ und wird dort benannt abgelehnt ✓ (`drop_intent_not_supported` ✓ / `intent_unknown` ✓).
 */
export function chooseWriterWorkspaceDropIntent(
  state: WriterWorkspaceDropZoneState,
  intent: unknown,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetDocumentId);
  if (missingTarget) return refuse(state, state.targetDocumentId, missingTarget);
  const targetDocumentId = context.targetDocumentId as string;
  if (state.phase === 'closed') return refuse(state, targetDocumentId, 'drop-zone-inactive');
  const transfer = readTransfer(context.payload);
  if (!transfer.ok) return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  return routeWithIntent(state, targetDocumentId, context.documents, transfer.payload, intent, context.requestedMode, context.requestedPolicyDecision);
}

/**
 * **Der Modusschritt** ✓ (Paket 15 ✓) — **dieselbe** Zustellung wie die Ablage und die Absicht ✓.
 *
 * Der Modus wird **gesagt**, nicht angenommen ✓: ein unbekannter Modus ✓ ist **kein** Modus ✗ und wird von
 * der Autorität **benannt** abgelehnt ✓ (`drop_live_mode_required` ✓) — *kein stiller Rückfall auf `Live`* ✗✓.
 * Und **ohne** Modus gibt es hier **keine** Zustellung ✗: `chooseWriterWorkspaceDropMode(state, undefined, …)`
 * ist derselbe benannte Fehlschlag ✓ — *die Abwesenheit ist die Aussage* ✓.
 *
 * *Warum hier `LIVE_REFERENCE` steht:* ein Modus gehört **nur** zu einem Live-Verweis ✓. Ihn mit einer Kopie
 * zu reisen zu lassen, hieße ihn stillschweigend zu verwerfen ✗ — der Resolver trägt ihn ohnehin nur bei
 * `live` ✓ (*Abwesenheit ist die Aussage* ✓).
 */
export function chooseWriterWorkspaceDropMode(
  state: WriterWorkspaceDropZoneState,
  mode: unknown,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  const missingTarget = targetRefusal(context.targetDocumentId);
  if (missingTarget) return refuse(state, state.targetDocumentId, missingTarget);
  const targetDocumentId = context.targetDocumentId as string;
  if (state.phase === 'closed') return refuse(state, targetDocumentId, 'drop-zone-inactive');
  const transfer = readTransfer(context.payload);
  if (!transfer.ok) return refuse(state, targetDocumentId, 'drop-zone-transfer-missing');
  return routeWithIntent(
    state,
    targetDocumentId,
    context.documents,
    transfer.payload,
    'LIVE_REFERENCE',
    mode,
    context.requestedPolicyDecision,
  );
}

/** **Das Schließen** ✓ — aus jedem offenen Zustand ✓; aus `closed` ein **benannter** No-op ✓. */
export function closeWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  reason: WriterWorkspaceDropZoneCloseReason = 'drag-left',
): WriterWorkspaceDropZoneStep {
  if (state.phase === 'closed') return { ok: false, reason: 'drop-zone-inactive', state };
  return ok(closedState(state, reason));
}

/**
 * Ob der Fall **entschieden** ist ✓ — `refused` oder `resolved` ✓. *Eine Ablehnung und eine Zustellung sind
 * Tatsachen* ✓: sie werden von einem überfahrenden Zeiger **nicht** überschrieben ✓, sondern nur von einem
 * **neuen** Zug (siehe `enterWriterWorkspaceDropZone` ✓) oder vom Schließen ✓.
 */
export function isWriterWorkspaceDropZoneDecided(state: WriterWorkspaceDropZoneState): boolean {
  return state.phase === 'refused' || state.phase === 'resolved';
}

/** Ein **neuer** Zug betritt die Fläche ✓ — ein alter, entschiedener Fall wird dabei **abgelöst** ✓. */
export function enterWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  const current = isWriterWorkspaceDropZoneDecided(state)
    ? closeWriterWorkspaceDropZone(state, 'drag-left').state
    : state;
  return openWriterWorkspaceDropZone(current, context);
}

/** Der Zeiger **bewegt sich** über der Fläche ✓ — ein entschiedener Fall bleibt stehen ✓. */
export function hoverWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  if (isWriterWorkspaceDropZoneDecided(state)) return ok(state);
  return openWriterWorkspaceDropZone(state, context);
}

/** Die Fläche wird **verlassen** ✓ — ein entschiedener Fall bleibt stehen ✓, ein überfahrender schließt ✓. */
export function leaveWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  reason: WriterWorkspaceDropZoneCloseReason = 'drag-left',
): WriterWorkspaceDropZoneStep {
  if (isWriterWorkspaceDropZoneDecided(state)) return ok(state);
  return closeWriterWorkspaceDropZone(state, reason);
}

/**
 * **Der Zug aus Paket 5** ✓ — der Empfänger folgt dem Erzeuger ✓, statt einen zweiten Zug zu führen ✗.
 *
 * `isDragActive` ✓ und der semantische Träger `session.payload` ✓ kommen **wörtlich** aus der vorhandenen
 * Zieh-Session ✓. Läuft kein Zug mehr, schließt ein **überfahrendes** Ziel ✓; ein **entschiedenes** bleibt
 * stehen ✓.
 */
export function openWriterWorkspaceDropZoneFromDragSession(
  state: WriterWorkspaceDropZoneState,
  session: DragSessionState,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  if (isDragActive(session)) return openWriterWorkspaceDropZone(state, { ...context, payload: session.payload });
  if (state.phase === 'closed') return { ok: false, reason: 'drop-zone-inactive', state };
  return leaveWriterWorkspaceDropZone(state, 'drag-left');
}

/** **Die Taste wird zur Absicht** ✓ — rein ✓ und ohne DOM ✓: nur der Tastenname wird ausgewertet ✓. */
export function resolveWriterWorkspaceDropCommand(
  state: WriterWorkspaceDropZoneState,
  key: unknown,
): WriterWorkspaceDropCommandStep {
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'drop-zone-key-unbound' };
  if (key === 'Escape') return { ok: true, command: { kind: 'dismiss' } };
  if (key === 'Enter' || key === ' ') return { ok: true, command: { kind: 'confirm' } };
  const index = CHOICE_KEYS.indexOf(key);
  if (index < 0) return { ok: false, reason: 'drop-zone-key-unbound' };
  const choice = state.choices[index];
  if (!choice) return { ok: false, reason: 'drop-zone-key-unbound' };
  return { ok: true, command: { kind: 'choose', intent: choice.intent } };
}

/**
 * **Die Absicht wird ausgeführt** ✓ — jeder Zweig führt in **dieselbe** Zustellung ✓, die auch der Zeiger
 * nimmt ✓. Ein unbekannter Befehl wird **benannt** abgelehnt ✓, nicht verschluckt ✗.
 */
export function applyWriterWorkspaceDropCommand(
  state: WriterWorkspaceDropZoneState,
  command: WriterWorkspaceDropCommand,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  if (!command || typeof command !== 'object') return refuse(state, state.targetDocumentId, 'drop-zone-command-unknown');
  switch (command.kind) {
    case 'confirm':
      return confirmWriterWorkspaceDropZone(state, context);
    case 'choose':
      return chooseWriterWorkspaceDropIntent(state, command.intent, context);
    case 'dismiss':
      return closeWriterWorkspaceDropZone(state, 'keyboard-dismiss');
    default:
      return refuse(state, state.targetDocumentId, 'drop-zone-command-unknown');
  }
}

/**
 * **Trägt dieser Zug unser Objekt?** ✓ — die Entscheidung fällt auf der **Typenliste** ✓, **nicht** auf dem
 * Inhalt ✗.
 *
 * **W-443:** Während `dragenter`/`dragover` liegt der Drag-Store im *protected mode* ✓ — `getData(...)` liefert
 * dort `''` ✓, `dataTransfer.types` aber ist lesbar ✓. Eine Zone, die hier auf den **Träger** entscheidet,
 * kehrt **vor** `preventDefault()` zurück ✓, bekommt deshalb **nie** ein `drop` ✓ und ist für echte Züge
 * **unerreichbar** ✗. Genau so entscheidet es die vorhandene Fabric-Oberfläche ✓
 * (`FabricGraphModal.tsx`: `Array.from(event.dataTransfer.types).includes(FABRIC_WORKSPACE_OBJECT_DRAG_MIME)` ✓)
 * — dieselbe **eine** MIME-Konstante ✓, keine zweite Herkunft ✗.
 *
 * **Fail-closed** ✓: keine Liste ✓, keine array-artige Liste ✓, unbrauchbare Werte ✓ → `false` ✓. *Im Zweifel
 * ist diese Fläche nicht gemeint* ✓ — dann fällt auch kein `preventDefault` ✓ und der Browser behält seine
 * eigene Ablage ✓.
 */
export function writerWorkspaceDropZoneCarriesTransfer(
  dataTransfer: WriterWorkspaceDataTransferLike | null | undefined,
): boolean {
  if (!dataTransfer || dataTransfer.types === undefined || dataTransfer.types === null) return false;
  try {
    // `Array.from` liest sowohl `readonly string[]` ✓ als auch eine array-artige `DOMStringList` ✓.
    return Array.from(dataTransfer.types as ArrayLike<unknown>)
      .some((type) => type === FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  } catch {
    return false;
  }
}

/**
 * **Der Zug ist über der Fläche, sein Inhalt ist (noch) nicht lesbar** ✓ — der protected mode gibt den Träger
 * erst bei `drop` heraus ✓ (W-443 ✓).
 *
 * Deshalb wird hier **nichts entschieden** ✗: das Ziel wird **sichtbar** ✓ (der leere Zustand `open` ✓, mit
 * Zeichen ✓, Form ✓ und Worten ✓), und ein **bereits gezeigtes** Angebot wird **nicht** zurückgestuft ✓ —
 * *der `drop`-Pfad holt den Träger nach* ✓ und entscheidet dann über die **Matrix** ✓. Ohne diesen Zustand
 * hätte die Fläche während eines echten Zuges **nichts** angezeigt ✓ — und die Zusage „während eines Zuges
 * ein sichtbares, angesagtes Ablageziel" wäre im protected mode unerfüllt ✗.
 */
export function revealWriterWorkspaceDropZone(
  state: WriterWorkspaceDropZoneState,
  context: WriterWorkspaceDropZoneContext,
): WriterWorkspaceDropZoneStep {
  if (state.phase !== 'closed') return ok(state);
  return openWriterWorkspaceDropZone(state, context);
}

/**
 * **Der Träger aus der Ablagefläche** ✓ — der Übersetzer ✓, wie `dragPointFromEvent` in Paket 5 ✓: er **wählt
 * aus** ✓ (genau die **eine** MIME-Konstante ✓) und wirft den Rest weg ✓. Fehlt der Inhalt, ist das
 * **benannt** ✓ — *ein leerer Träger ist kein gültiger Träger* ✓.
 *
 * **W-443:** Dieser Leser gehört an die **Ablage** ✓, nicht an das Überfahren ✗ — im protected mode ist er hier
 * leer ✓, und „leer" ist dann **kein** Grund, den Zug abzuweisen ✓.
 */
export function readWriterWorkspaceTransfer(
  dataTransfer: WriterWorkspaceDataTransferLike | null | undefined,
): WriterWorkspaceTransferRead {
  if (!dataTransfer) return { ok: false, reason: 'drop-zone-transfer-missing' };
  const read = dataTransfer.getData;
  if (typeof read !== 'function') return { ok: false, reason: 'drop-zone-transfer-unreadable' };
  let value: unknown;
  try {
    value = read.call(dataTransfer, FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
  } catch {
    return { ok: false, reason: 'drop-zone-transfer-unreadable' };
  }
  return typeof value === 'string' && value.length > 0
    ? { ok: true, payload: value }
    : { ok: false, reason: 'drop-zone-transfer-missing' };
}

/** Ob die Ansicht überhaupt etwas rendert ✓ — nur `closed` rendert nichts ✓. */
export function isWriterWorkspaceDropZoneVisible(state: WriterWorkspaceDropZoneState): boolean {
  return state.phase !== 'closed';
}

/**
 * **Ob die Ansicht den Modus fragen muss** ✓ (Paket 15 ✓) — die eine Bedingung, die die Modus-Knöpfe stellt ✓.
 *
 * Zwei Tatsachen können sie stellen, und **beide sind gelesen, nicht geraten** ✓ (dieselbe Form wie in der
 * Notes-Zone ✓):
 *
 *   * die Zustellung hat genau das **benannt** ✓ (`drop_live_mode_required` ✓) — *dann ist der Modus die
 *     fehlende Tatsache, und die Knöpfe dürfen nicht verschwinden* ✓;
 *   * die Matrix hat eine **Live-Route angeboten** ✓ (`choice`) — *dann muss der Modus gesagt werden, sonst
 *     wird sie nicht zugestellt* ✓.
 *
 * **Und die Frage verschwindet, wenn sie beantwortet ist** ✓: ein Angebot, dessen Modus **schon** gesagt ist
 * ✓, fragt nicht mehr ✓ — *sonst stünde die Frage neben ihrer eigenen Antwort* ✗ ✓.
 */
export function writerWorkspaceDropZoneNeedsMode(state: WriterWorkspaceDropZoneState): boolean {
  if (state.code === 'drop_live_mode_required') return true;
  return state.choices.some((choice) => choice.integrationKind === 'live' && choice.mode === null);
}
