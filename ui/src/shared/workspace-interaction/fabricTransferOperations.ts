// STATUS: DIAMANT VGT SUPREME — permission-rechecked Workspace transfer transactions
import type { WorkspaceDocument } from '../contracts/workspace';
import { validateWorkspaceDocumentInvariants } from '../../platform/workspace/model/workspaceObjectModel';
import { assertNoSecurityDowngrade } from '../../platform/security/securityProfiles';
import type {
  FabricResolutionPolicy,
  FabricTransactionResult,
  FabricTransferChoice,
  FabricTransferPlan,
} from './fabricTypes';
import { WorkspaceFabricError } from './fabricTypes';
import { canRead, clone, nextDocumentVersion, nowOr, sourceUnavailable } from './fabricState';
import { insertFromWorkspace } from './fabricReferenceOperations';

export function planWorkspaceTransfer(
  documents: Record<string, WorkspaceDocument>,
  sourceDocId: string,
  sourceObjId: string,
  targetDocId: string,
  policy?: FabricResolutionPolicy,
): FabricTransferPlan {
  const source = documents[sourceDocId];
  const target = documents[targetDocId];
  if (!source || !target) throw new WorkspaceFabricError('Workspace transfer source or target document is unavailable');
  assertNoSecurityDowngrade(source, target);
  if (sourceUnavailable(sourceDocId, policy) || !canRead(source, target, policy)) throw new WorkspaceFabricError('Workspace transfer source is not readable');
  const sourceObject = source.objects[sourceObjId];
  if (!sourceObject) throw new WorkspaceFabricError(`Source object ${sourceObjId} does not exist`);
  return {
    sourceDocId,
    sourceObjId,
    targetDocId,
    allowedChoices: sourceDocId === targetDocId ? ['PasteCopy'] : ['LiveLink', 'PasteCopy'],
    preferredChoice: sourceDocId === targetDocId ? 'PasteCopy' : 'LiveLink',
    sourceType: sourceObject.type,
  };
}

export function applyWorkspaceTransfer(
  documents: Record<string, WorkspaceDocument>,
  plan: FabricTransferPlan,
  choice: FabricTransferChoice,
  options: { targetObjectId: string; now?: number; policy?: FabricResolutionPolicy },
): FabricTransactionResult & { insertedObjectId: string } {
  if (!plan.allowedChoices.includes(choice)) throw new WorkspaceFabricError(`Transfer choice ${choice} is not allowed`);
  if (choice === 'LiveLink') {
    const result = insertFromWorkspace(documents, plan.targetDocId, plan.sourceDocId, plan.sourceObjId, {
      referenceId: options.targetObjectId,
      mode: 'Live',
      expectedType: plan.sourceType,
      now: options.now,
      policy: options.policy,
    });
    return { ...result, insertedObjectId: result.referenceId };
  }

  const at = nowOr(options.now);
  const source = documents[plan.sourceDocId];
  const target = documents[plan.targetDocId];
  if (!source || !target) throw new WorkspaceFabricError('Workspace transfer source or target document is unavailable');
  assertNoSecurityDowngrade(source, target);
  if (sourceUnavailable(source.id, options.policy) || !canRead(source, target, options.policy)) throw new WorkspaceFabricError('Workspace transfer source is not readable');
  const sourceObject = source.objects[plan.sourceObjId];
  if (!sourceObject) throw new WorkspaceFabricError('Workspace transfer source object is missing');
  if (target.objects[options.targetObjectId]) throw new WorkspaceFabricError(`Target object id ${options.targetObjectId} already exists`);
  const copy = clone(sourceObject);
  copy.data.id = options.targetObjectId;
  let nextTarget = nextDocumentVersion(target, at);
  nextTarget.objects = { ...target.objects, [options.targetObjectId]: copy };
  nextTarget.root_object_ids = [...target.root_object_ids, options.targetObjectId];
  validateWorkspaceDocumentInvariants(nextTarget, { allowFutureSchema: true });
  return {
    updatedDocs: { ...documents, [target.id]: nextTarget },
    notifications: [],
    touchedDocumentIds: [target.id],
    insertedObjectId: options.targetObjectId,
  };
}
