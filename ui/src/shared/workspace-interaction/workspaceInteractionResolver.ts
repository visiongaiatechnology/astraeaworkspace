// STATUS: PLATIN — Fail-closed drop assessment re-resolves WOM identity and Fabric permission.
import type { WorkspaceDocument } from '../contracts/workspace';
import type { FabricResolutionPolicy } from './fabricTypes';
import { planWorkspaceTransfer } from './fabricOperations';
import { assertStableWorkspaceId } from '../../platform/workspace/model/workspaceObjectModel';
import { parseWorkspaceDragPayload } from './workspaceInteractionPayload';
import { WorkspaceInteractionError, isWorkspaceDropIntent, type WorkspaceDropIntent, type WorkspaceInteractionErrorCode, type WorkspaceObjectKind } from './workspaceInteractionTypes';
import { WorkspaceInteractionRegistry } from './workspaceInteractionRegistry';

export interface WorkspaceDropRequest {
  readonly payload: string;
  readonly targetDocumentId: string;
  readonly requestedIntent?: unknown;
  /**
   * **Der Modus einer Live-Anforderung — und es gibt keinen Default** ✓✓ (Paket 15, Runde 257).
   *
   * *Der Befund, der das nötig machte:* \`WorkspaceDropSelection\` trug **kein** \`mode\` ✗, während Notes' eigener
   * Verweis \`NoteWorkspaceEmbedData.mode: 'Live' | 'Frozen'\` kennt ✓. *Eine Live-Route versprach also einen Modus,
   * den die Zustellung nicht ausdrücken konnte* ✗. Akzeptanzhandlung von Paket 15: **„Nach Drop erhält Benutzer klare
   * Auswahl Live/Frozen **ohne heimlichen Default**"** ✓ — also wird der Modus **gesagt**, nicht **angenommen**.
   */
  readonly requestedMode?: unknown;
  /**
   * **W-455 — die Entscheidung der Administratorrichtlinie zu genau dieser Ablage** ✓✓ (*Muster wie
   * `requestedMode`* ✓: `unknown`, damit der Resolver **Unbekanntes selbst benennt** statt es zu glauben) ✓.
   *
   * **Fail-closed, und zwar total** ✓✓: *fehlt sie, ist sie kein `Allow`.* Ein Drop **ohne** vorliegende
   * Entscheidung wird **benannt** abgewiesen (`drop_policy_decision_required`) ✓ — *und eine **ungueltige**
   * Entscheidung ist **wie eine fehlende*** ✗✓ (`'allow'` klein geschrieben, `{}`, `null`, `'Allow '` — *alles
   * derselbe Grund* ✓). **`Deny`** und **`RequireApproval`** bekommen **je einen eigenen** Namen ✓✓, weil sie
   * **verschiedene** Tatsachen sind: *eine Ablehnung darf nicht wie „warten auf Freigabe" aussehen* ✓.
   *
   * **Woher der Wert kommt** ✓✓: *aus der **einen** vorhandenen Autoritaet* — `precheckPolicy(action, resource)`
   * (`platform/native/nativePolicy.ts:5`, asynchron, `PolicyEffect = 'Allow' | 'Deny' | 'RequireApproval'`) —
   * und wird **hineingereicht**, nicht hier abgefragt: *der Resolver bleibt **rein und synchron*** ✓✓.
   */
  readonly requestedPolicyDecision?: unknown;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly policy?: FabricResolutionPolicy;
}

/** Wie die Zustellung die Quelle behandelt: \`copy\` = eigenständige Kopie, \`live\` = Verweis auf die Quelle. */
export type WorkspaceIntegrationKind = 'copy' | 'live';

/** Der Modus eines Live-Verweises. **Ohne Default** — *er wird gewählt, nicht angenommen* ✓ (Paket 15). */
export type WorkspaceLiveMode = 'Live' | 'Frozen';

export interface WorkspaceDropSelection {
  readonly intent: Exclude<WorkspaceDropIntent, 'MOVE'>;
  /** **Die neue Tatsache** ✓: \`COPY\` → \`copy\`; \`LIVE_REFERENCE\` → \`live\`. */
  readonly integrationKind: WorkspaceIntegrationKind;
  /**
   * **Nur** bei \`integrationKind: 'live'\` ✓ — *und dann **nur**, wenn er ausdrücklich angefordert wurde* ✓✓.
   * Bei einer **Auswahl** (Phase \`choice\`) fehlt er **absichtlich** ✗: *eine Auswahl ist keine Zustellung.*
   */
  readonly mode?: WorkspaceLiveMode;
  readonly adapterId: string;
  readonly sourceDocumentId: string;
  readonly sourceObjectId: string;
  readonly targetDocumentId: string;
  readonly objectKind: WorkspaceObjectKind;
}

export type WorkspaceDropAssessment =
  | { readonly status: 'rejected'; readonly code: WorkspaceInteractionErrorCode }
  | { readonly status: 'needsChoice'; readonly code: 'drop_intent_choice_required'; readonly choices: readonly WorkspaceDropSelection[] }
  | { readonly status: 'accepted'; readonly code: 'drop_accepted'; readonly selection: WorkspaceDropSelection }
  | { readonly status: 'resolved'; readonly code: 'drop_resolved'; readonly selection: WorkspaceDropSelection; readonly sourceVersion: number; readonly targetVersion: number };

function rejected(code: WorkspaceInteractionErrorCode): WorkspaceDropAssessment {
  return Object.freeze({ status: 'rejected', code });
}

function getDocument(documents: Readonly<Record<string, WorkspaceDocument>>, id: string): WorkspaceDocument | undefined {
  if (!Object.prototype.hasOwnProperty.call(documents, id)) return undefined;
  const document = documents[id];
  return document && typeof document === 'object' ? document : undefined;
}

/** **Der eine** Ausgang einer Policy-Entscheidung — *nicht neu erfunden* ✓: die Woerter kommen **woertlich** aus
 * `platform/native/nativePolicy.ts:3` (`PolicyEffect`), *das `platform/**` nicht importieren darf* ✗✓✓ (Grenze).
 * Eine **zweite Vokabel** fuer dieselbe Tatsache entsteht damit **nicht** ✓ — *nur ihre Widerholung an der
 * Grenze, damit `shared/**` nicht von `platform/**` abhaengt* ✓. */
type DropPolicyEffect = 'Allow' | 'Deny' | 'RequireApproval';

/**
 * **W-455 — liest den Ausgang, oder sagt „unlesbar"** ✓✓. *Strukturell gelesen* ✓ (wie `getDocument` und wie der
 * Zonen-Vertrag den Träger liest): *ein `'allow'`, ein `{}`, ein `null`, ein Array, ein fehlendes Feld — **alles**
 * ergibt `undefined`, und `undefined` ist **kein** `Allow`* ✗✓✓. *Damit kann kein Aufrufer mit einem **falschen**
 * Wert durchrutschen.*
 */
function dropPolicyEffectOf(requestedPolicyDecision: unknown): DropPolicyEffect | undefined {
  if (!requestedPolicyDecision || typeof requestedPolicyDecision !== 'object' || Array.isArray(requestedPolicyDecision)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(requestedPolicyDecision, 'effect')) return undefined;
  const effect = (requestedPolicyDecision as { readonly effect?: unknown }).effect;
  return effect === 'Allow' || effect === 'Deny' || effect === 'RequireApproval' ? effect : undefined;
}

function assess(request: WorkspaceDropRequest, registry: WorkspaceInteractionRegistry): WorkspaceDropAssessment {
  if (!registry.isSealed) return rejected('registry_unsealed');
  let payload;
  try {
    payload = parseWorkspaceDragPayload(request.payload);
    assertStableWorkspaceId(request.targetDocumentId, 'Workspace drop target id');
  } catch (error) {
    return rejected(error instanceof WorkspaceInteractionError ? error.code : 'identifier_invalid');
  }
  const descriptor = payload.descriptor;
  const source = getDocument(request.documents, descriptor.documentId);
  const target = getDocument(request.documents, request.targetDocumentId);
  if (!source || source.id !== descriptor.documentId) return rejected('drop_source_document_missing');
  // **W-455 — die Administratorrichtlinie, und zwar VOR dem Ziel** ✓✓✓ (*die Stelle ist die Entscheidung*):
  //
  // *Eine **abgelehnte** Ablage darf nicht verraten, **ob das Zieldokument existiert*** ✓✓ — *sonst waere der
  // Grund ein Auskunftsdienst ueber fremde Dokumente* ✗✓. Deshalb steht diese Pruefung **vor**
  // `drop_target_document_missing` ✓ und **nach** der Quelle ✓ (*ein fehlendes Quelldokument ist keine
  // Policy-Frage; die Quelle nennt der Träger selbst* ✓✓).
  //
  // **Vier Faelle, ein Weg** ✓✓: *abwesend **oder** ungueltig* ⇒ `drop_policy_decision_required` ✓ (fail-closed ✓);
  // *`Deny`* ⇒ `drop_policy_denied` ✓; *`RequireApproval`* ⇒ `drop_policy_approval_required` ✓; *`Allow`* ⇒
  // **weiter wie bisher** ✓ — *kein vierter Zustand, keine stille Ausnahme* ✓✓.
  const policyEffect = dropPolicyEffectOf(request.requestedPolicyDecision);
  if (policyEffect === undefined) return rejected('drop_policy_decision_required');
  if (policyEffect === 'Deny') return rejected('drop_policy_denied');
  if (policyEffect === 'RequireApproval') return rejected('drop_policy_approval_required');
  if (!target || target.id !== request.targetDocumentId) return rejected('drop_target_document_missing');
  const sourceObject = source.objects[descriptor.objectId];
  if (!sourceObject) return rejected('drop_source_object_missing');
  if (source.kind !== descriptor.sourceApp || sourceObject.type !== descriptor.objectKind) {
    return rejected('drop_identity_mismatch');
  }
  const availableIntents = registry.getCompatibleIntents(source.kind, target.kind, sourceObject.type)
    .filter((intent) => descriptor.supportedIntents.includes(intent))
    .filter((intent) => intent !== 'MOVE');
  if (request.requestedIntent !== undefined && !isWorkspaceDropIntent(request.requestedIntent)) {
    return rejected('intent_unknown');
  }
  if (request.requestedIntent === 'MOVE') return rejected('drop_move_transaction_unavailable');
  const selectedIntents = request.requestedIntent === undefined
    ? availableIntents
    : availableIntents.filter((intent) => intent === request.requestedIntent);
  if (selectedIntents.length === 0) {
    return rejected(availableIntents.length === 0 ? 'registry_adapter_route_missing' : 'drop_intent_not_supported');
  }
  try {
    planWorkspaceTransfer(request.documents as Record<string, WorkspaceDocument>, source.id, descriptor.objectId, target.id, request.policy);
  } catch {
    return rejected('drop_authorization_failed');
  }
  // **Der Modus wird geprüft, bevor irgendetwas ausgewählt wird** ✓ — *fail-closed und total* ✓: ein unbekannter
  // Modus ist **kein** Modus ✗ (und kein stiller Rückfall auf einen der beiden ✓).
  const rawMode = request.requestedMode;
  if (rawMode !== undefined && rawMode !== 'Live' && rawMode !== 'Frozen') return rejected('drop_live_mode_required');
  const mode: WorkspaceLiveMode | undefined = rawMode === 'Live' || rawMode === 'Frozen' ? rawMode : undefined;
  // **Kein heimlicher Default (Paket 15)** ✓✓: Wer einen Live-Verweis **ausdrücklich** anfordert, muss Live oder
  // Frozen **sagen** ✗. *Wer ihn nur zur **Auswahl** angeboten bekommt, bekommt ihn **ohne** Modus ✓ — und muss ihn
  // mit Modus erneut anfordern.* ✓ So bleibt die gemessene Choice-Phase (Form B) erhalten ✓.
  if (request.requestedIntent === 'LIVE_REFERENCE' && mode === undefined) return rejected('drop_live_mode_required');
  const completeSelections: WorkspaceDropSelection[] = [];
  for (const intent of selectedIntents) {
    const adapter = registry.getAdapter(target.kind, sourceObject.type, intent);
    if (!adapter) return rejected('registry_adapter_route_missing');
    const integrationKind: WorkspaceIntegrationKind = intent === 'LIVE_REFERENCE' ? 'live' : 'copy';
    completeSelections.push(Object.freeze({
      intent,
      integrationKind,
      // **Bedingtes Spreizen statt `mode: undefined`** ✓ — *aber **nicht** wegen `exactOptionalPropertyTypes`* ✗✓:
      // **Zwei Agenten haben unabhängig gemessen, dass die Option in diesem Repo nicht gesetzt ist** ✗
      // (`open-core/ui/tsconfig.json`: `strict: true`, **kein** `exactOptionalPropertyTypes`, kein `extends`). *Mein
      // genannter Grund traf also nicht zu — der **Sache** nach bleibt es richtig:* **abwesend ≠ ausdrücklich
      // `undefined`** ✓, und genau das ist bei der Kopie **prüfbar** (`Object.hasOwn(route, 'mode') === false` ✓).
      ...(integrationKind === 'live' && mode !== undefined ? { mode } : {}),
      adapterId: adapter.id,
      sourceDocumentId: source.id,
      sourceObjectId: descriptor.objectId,
      targetDocumentId: target.id,
      objectKind: sourceObject.type,
    }));
  }
  if (completeSelections.length > 1) {
    return Object.freeze({ status: 'needsChoice', code: 'drop_intent_choice_required', choices: Object.freeze(completeSelections) });
  }
  const selection = completeSelections[0];
  if (!selection) return rejected('registry_adapter_route_missing');
  return Object.freeze({ status: 'accepted', code: 'drop_accepted', selection });
}

export function evaluateWorkspaceDrop(request: WorkspaceDropRequest, registry: WorkspaceInteractionRegistry): WorkspaceDropAssessment {
  return assess(request, registry);
}

/** Resolves a semantic target route only. It does not mutate or persist either document. */
export function resolveWorkspaceDrop(request: WorkspaceDropRequest, registry: WorkspaceInteractionRegistry): WorkspaceDropAssessment {
  const assessment = assess(request, registry);
  if (assessment.status !== 'accepted') return assessment;
  // **Paket 15 — das Loch an der WURZEL geschlossen (Runde 262) ✗✓✓**
  //
  // **Gefunden vom Whiteboard-Agenten** ✓✓ und **vom Publish-Agenten unabhängig begründet** ✓✓:
  // `accepted` ist ein **Angebot** ✗, `resolved` eine **Zustellung** ✓. Die Modusregel oben greift nur, wenn der
  // Aufrufer die Absicht **ausdrücklich** nennt ✗ — *also lieferte eine Route, die **nur** `LIVE_REFERENCE` führt,
  // über den **absichtslosen** Weg ein `resolved` **ohne** Modus* ✗✗: *genau der heimliche Default, den Paket 15
  // verbietet* ✓. **Sechs Zonen hatten dafür je einen eigenen Riegel** ✗ — *das ist die „zweite Regel", die dieses
  // Projekt am teuersten bezahlt* ✗✓. **Die Zustellung selbst weigert sich jetzt** ✓✓: **kein `resolved` mit einem
  // Live-Verweis ohne gesagten Modus** — *benannt, nicht still* ✓. *Die **Auswahl** (`needsChoice`) bleibt erlaubt,
  // denn eine Auswahl ist keine Zustellung* ✓.
  if (assessment.selection.integrationKind === 'live' && assessment.selection.mode === undefined) {
    return rejected('drop_live_mode_required');
  }
  const source = getDocument(request.documents, assessment.selection.sourceDocumentId);
  const target = getDocument(request.documents, assessment.selection.targetDocumentId);
  if (!source || !target || source.id !== assessment.selection.sourceDocumentId || target.id !== assessment.selection.targetDocumentId) {
    return rejected('drop_identity_mismatch');
  }
  return Object.freeze({
    status: 'resolved',
    code: 'drop_resolved',
    selection: assessment.selection,
    sourceVersion: source.version,
    targetVersion: target.version,
  });
}
