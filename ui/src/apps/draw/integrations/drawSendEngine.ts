// STATUS: PLATIN — Draw send: a vector diagram goes to another app as a **live** or **frozen** reference.
//
// The whole chain already exists and is **reused**, not rebuilt:
//   * `registerDrawEmbedAnchor` (this zone) writes the canonical WOM `Shape` anchor into the Draw document
//     and returns the `WorkspaceReferenceObject` (mode + fabric status + cached snapshot when frozen).
//   * `insertFromWorkspace` (shared fabric) writes that reference into the **target** document —
//     `mode: 'Frozen'` embeds `cached_snapshot`/`fallback_snapshot`, `mode: 'Live'` stays a link.
//   * `renderFabricReference` (shared fabric) is the **one** description of the resulting state
//     (`current`/`changed`/`frozen`/`broken`/`unavailable`/`permission-lost`) — the status word the UI shows.
//
// The carrier for the pointer path is produced by the **existing** `createFabricWorkspaceObjectDragPayload`
// (shell) — this module never builds a second payload shape. If the registry does not export the Draw anchor's
// object kind, that producer returns `null`; here that becomes a **named** refusal, never a silent no-op.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { createFabricWorkspaceObjectDragPayload } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import { insertFromWorkspace } from '../../../shared/workspace-interaction/fabricReferenceOperations';
import { renderFabricReference, setReference } from '../../../shared/workspace-interaction/fabricState';
import type { FabricRenderContract } from '../../../shared/workspace-interaction/fabricTypes';
import { DrawModelError } from '../model/drawDocumentValidation';
import { drawEmbedAnchorObjectId, registerDrawEmbedAnchor, type DrawEmbedTarget } from './drawWorkspaceIntegration';
import { projectDrawScene } from '../interactions/drawSceneProjection';

/** Was gesendet werden kann: die aktive Seite oder ein Rahmen der Zeichnung. */
export type DrawSendElement = DrawEmbedTarget;

export type DrawSendMode = 'Live' | 'Frozen';

/** Die **benannten** Gründe dieser Fläche; alles Weitere kommt aus den vorhandenen Engines. */
export type DrawSendRefusal =
  | 'send-source-not-draw'
  | 'send-target-missing'
  | 'send-target-is-source'
  | 'send-element-missing'
  | 'send-anchor-required'
  | 'send-reference-exists'
  | 'send-document-map-invalid';

export interface DrawSendInput {
  readonly source: WorkspaceDocument;
  readonly targetDocumentId: string;
  readonly element: DrawSendElement;
  readonly mode: DrawSendMode;
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly now: number;
}

export interface DrawSendResult {
  /** Die **neuen** Dokumente: Quelle (mit Anker) und Ziel (mit Verweis) — beide über den kanonischen Weg. */
  readonly documents: Readonly<Record<string, WorkspaceDocument>>;
  readonly sourceDocumentId: string;
  readonly targetDocumentId: string;
  readonly anchorObjectId: string;
  readonly referenceId: string;
  readonly mode: DrawSendMode;
  /** Der **eine** Zustandsbeschreiber des Ergebnisses (shared fabric), nicht eine zweite Statusregel. */
  readonly render: FabricRenderContract;
}

function assertInput(input: DrawSendInput): void {
  if (!input.documents || typeof input.documents !== 'object' || Array.isArray(input.documents)) {
    throw new DrawModelError('send-document-map-invalid');
  }
  if (!input.source || input.source.kind !== 'Draw' || !input.source.drawData) {
    throw new DrawModelError('send-source-not-draw');
  }
  if (typeof input.targetDocumentId !== 'string' || input.targetDocumentId.length === 0) {
    throw new DrawModelError('send-target-missing');
  }
  if (input.targetDocumentId === input.source.id) throw new DrawModelError('send-target-is-source');
  if (input.mode !== 'Live' && input.mode !== 'Frozen') throw new DrawModelError('send-mode-invalid');
  if (!Number.isSafeInteger(input.now) || input.now < 0) throw new DrawModelError('send-time-invalid');
}

/** Der stabile Verweis-Bezeichner eines Elements — **eine** Definition (aus `drawWorkspaceIntegration`). */
export { drawEmbedReferenceId as drawSendReferenceId } from './drawWorkspaceIntegration';

/**
 * Sendet ein Draw-Element als **Live-Verweis** oder **eingefrorenen Schnappschuss** an ein Zieldokument.
 *
 * **Live** benutzt die geteilte Einfügung (`insertFromWorkspace`, `mode: 'Live'`).
 * **Frozen** benutzt dieselbe Einfügung **und danach** den geteilten Verweis-Schreiber
 * (`setReference`), weil `insertFromWorkspace` den Verweis **ohne** `common.ownership` baut und die
 * WOM-Prüfung für `mode: 'Frozen'` `ExternalFrozen` verlangt
 * (`workspaceObjectModelValidation.ts:369-370`) — *gemessen: der direkte Frozen-Aufruf scheitert mit
 * `WorkspaceReference ownership/mode mismatch`.* `setReference` setzt die Eigentümerschaft kanonisch
 * (`fabricState.ts:92-98`), also entsteht **keine** zweite Verweis-Form. Sobald die geteilte Einfügung
 * `common` selbst setzt, kann dieser zweite Schritt entfallen.
 */
export function sendDrawElement(input: DrawSendInput): DrawSendResult {
  assertInput(input);
  const target = input.documents[input.targetDocumentId];
  if (!target) throw new DrawModelError('send-target-missing');

  // Ein bereits vorhandener Anker wird **wiederverwendet** (zweites Ziel oder Moduswechsel), nicht verdoppelt.
  const registration = registerDrawEmbedAnchor(input.source, input.element, input.mode, input.now, { reuseAnchor: true });
  const sourceAfterAnchor = registration.source;
  const documentsWithAnchor: Record<string, WorkspaceDocument> = {
    ...input.documents,
    [sourceAfterAnchor.id]: sourceAfterAnchor,
  };

  const referenceId = registration.reference.id;
  if (target.objects[referenceId]) throw new DrawModelError('send-reference-exists');

  let documents = insertFromWorkspace(
    documentsWithAnchor,
    input.targetDocumentId,
    sourceAfterAnchor.id,
    registration.anchorObjectId,
    { referenceId, mode: 'Live', expectedType: 'Shape', now: input.now },
  ).updatedDocs;

  if (input.mode === 'Frozen') {
    documents = {
      ...documents,
      [input.targetDocumentId]: setReference(documents[input.targetDocumentId]!, referenceId, registration.reference, input.now),
    };
  }

  return {
    documents,
    sourceDocumentId: sourceAfterAnchor.id,
    targetDocumentId: input.targetDocumentId,
    anchorObjectId: registration.anchorObjectId,
    referenceId,
    mode: input.mode,
    render: renderFabricReference(documents, input.targetDocumentId, referenceId),
  };
}

/** Der Zustand eines bereits gesendeten Verweises — dieselbe eine Beschreibung, nur gelesen. */
export function readDrawSendState(
  documents: Readonly<Record<string, WorkspaceDocument>>,
  targetDocumentId: string,
  referenceId: string,
): FabricRenderContract | null {
  const target = documents[targetDocumentId];
  if (!target || !target.objects[referenceId]) return null;
  return renderFabricReference(documents, targetDocumentId, referenceId);
}

/**
 * **Der Zeigerpfad.** Ruft den **vorhandenen** Erzeuger (`createFabricWorkspaceObjectDragPayload`) mit dem
 * WOM-Anker des Elements. Es gibt **keine zweite Trägerform**: derselbe serialisierte Träger, den die
 * Fabric-Fläche erzeugt.
 *
 * Der Anker wird über den **kanonischen** Bezeichner gesucht (`drawEmbedAnchorObjectId`) — nicht über eine
 * Suche „irgendein Shape mit x/y", die ein anderes Objekt hätte treffen können.
 *
 * `null` ist der **benannte** Fall: fehlt der Anker → `send-anchor-required`; exportiert die Matrix die
 * Objektart der App nicht, liefert der Erzeuger ebenfalls `null` → derselbe benannte Grund.
 */
export function drawSendCarrierPayload(input: {
  readonly source: WorkspaceDocument;
  readonly element: DrawSendElement;
}): string {
  const source = input.source;
  if (!source || source.kind !== 'Draw' || !source.drawData) throw new DrawModelError('send-source-not-draw');
  const anchorObject = source.objects[drawEmbedAnchorObjectId(input.element)];
  if (!anchorObject) throw new DrawModelError('send-anchor-required');
  const payload = createFabricWorkspaceObjectDragPayload(source, anchorObject);
  if (payload === null) throw new DrawModelError('send-anchor-required');
  return payload;
}

/** Die Elemente, die gesendet werden können: die aktive Seite und jeder Rahmen der Seite. */
export function listDrawSendElements(model: Parameters<typeof projectDrawScene>[0]): readonly DrawSendElement[] {
  const scene = projectDrawScene(model, model.activePageId);
  const frames = scene.entries
    .filter((entry) => entry.object.type === 'frame')
    .map((entry) => ({ kind: 'frame' as const, id: entry.object.id }));
  return [{ kind: 'page', id: model.activePageId }, ...frames];
}
