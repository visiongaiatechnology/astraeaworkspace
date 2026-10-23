// STATUS: DIAMANT VGT SUPREME — stable WOM API facade and change/reference operations
import type { CanonicalWorkItem, WorkspaceChangeOperation, WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import { WorkspaceMalformedInputError, WorkspaceObjectModelError, WorkspaceSecurityError, WorkspaceStorageError, WorkspaceUnsupportedContentError, WorkspaceValidationError, assertStableWorkspaceId, cloneJson, parseWorkspaceObjectUri, workspaceObjectUri, MAX_TITLE_LENGTH, MAX_SERIALIZED_DOCUMENT_BYTES } from './workspaceObjectModelPrimitives';
import { normalizeKnownObjectEnvelope, normalizePermissions, normalizeProtection, readTombstones, validateTypedObject, writeTombstone } from './workspaceObjectModelValidation';
import { assertCanonicalWorkItemSharing, deserializeWorkspaceDocumentCanonical, downgradeWorkspaceDocument, migrateWorkspaceDocument, preserveUnsupportedPayload, serializeWorkspaceDocumentCanonical, validateWorkspaceDocumentInvariants } from './workspaceObjectModelDocumentPersistence';
export { WorkspaceObjectModelError, WorkspaceMalformedInputError, WorkspaceUnsupportedContentError, WorkspaceValidationError, WorkspaceSecurityError, WorkspaceStorageError, assertStableWorkspaceId, workspaceObjectUri, parseWorkspaceObjectUri, preserveUnsupportedPayload, migrateWorkspaceDocument, downgradeWorkspaceDocument, validateWorkspaceDocumentInvariants, serializeWorkspaceDocumentCanonical, deserializeWorkspaceDocumentCanonical, assertCanonicalWorkItemSharing };


export interface WorkspaceReferenceDescriptor {
  sourceDocumentId: string;
  sourceObjectId: string;
  sourceVersion?: number;
  resolvedSourceVersion?: number;
  mode: 'Live'|'Frozen';
  permissionState: 'allowed'|'denied'|'unknown';
  fallbackAvailable: boolean;
}



export function workspaceReferenceDescriptor(object: WorkspaceObject): WorkspaceReferenceDescriptor {
  if (object.type !== 'WorkspaceReference') throw new WorkspaceMalformedInputError('Object is not a WorkspaceReference');
  const source = parseWorkspaceObjectUri(object.data.uri);
  return {
    sourceDocumentId: source.documentId,
    sourceObjectId: source.objectId,
    sourceVersion: object.data.source_version,
    resolvedSourceVersion: object.data.resolved_source_version,
    mode: object.data.mode,
    permissionState: object.data.permission_state ?? 'unknown',
    fallbackAvailable: object.data.fallback_policy === 'allowed' && !!(object.data.fallback_snapshot ?? object.data.cached_snapshot),
  };
}



/** Canonical semantic bytes are validated JSON bytes; crypto/container packaging happens only after this boundary. */
export function encodeWorkspaceSemanticBytes(document: WorkspaceDocument, signal?: AbortSignal): Uint8Array {
  return new TextEncoder().encode(serializeWorkspaceDocumentCanonical(document, signal));
}



export function decodeWorkspaceSemanticBytes(bytes: Uint8Array, signal?: AbortSignal): WorkspaceDocument {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > MAX_SERIALIZED_DOCUMENT_BYTES) throw new WorkspaceMalformedInputError('Semantic byte representation size is invalid');
  if (signal?.aborted) throw new WorkspaceObjectModelError('Workspace semantic decode cancelled');
  let decoded: string;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new WorkspaceMalformedInputError('Semantic bytes are not valid UTF-8'); }
  return deserializeWorkspaceDocumentCanonical(decoded, signal);
}



export interface WorkspaceStorageBoundaryEvidence {
  authenticity: 'verified' | 'unverified';
  integrity: 'verified' | 'failed';
  containerVersion: number;
}



/**
 * VWC/crypto owns cryptographic verification. WOM consumes plaintext semantic bytes only after
 * the caller proves that authenticity and integrity gates have passed; no silent bypass exists.
 */
export function acceptVerifiedWorkspaceSemanticPayload(
  bytes: Uint8Array,
  evidence: WorkspaceStorageBoundaryEvidence,
  signal?: AbortSignal,
): WorkspaceDocument {
  if (evidence.authenticity !== 'verified') throw new WorkspaceObjectModelError('Workspace authenticity verification required');
  if (evidence.integrity !== 'verified') throw new WorkspaceObjectModelError('Workspace integrity verification failed');
  if (!Number.isInteger(evidence.containerVersion) || evidence.containerVersion < 1) throw new WorkspaceMalformedInputError('Workspace container version evidence is invalid');
  return decodeWorkspaceSemanticBytes(bytes, signal);
}



export function applyWorkspaceChangeOperation(document: WorkspaceDocument, operation: WorkspaceChangeOperation): WorkspaceDocument {
  assertStableWorkspaceId(operation.operationId, 'Operation id');
  if (!Number.isFinite(operation.at) || operation.at < 0) throw new WorkspaceMalformedInputError('Operation timestamp is invalid');
  const next = migrateWorkspaceDocument(document);
  switch (operation.kind) {
    case 'set_title':
      if (!operation.title.trim() || operation.title.length > MAX_TITLE_LENGTH) throw new WorkspaceMalformedInputError('Title is invalid');
      next.title = operation.title.trim();
      break;
    case 'upsert_object': {
      assertStableWorkspaceId(operation.objectId, 'Operation object id');
      if (readTombstones(next).has(operation.objectId) && !(operation.objectId in next.objects)) throw new WorkspaceMalformedInputError('Recycling a deleted WOM object id is forbidden');
      validateTypedObject(operation.objectId, operation.object, { document: next });
      next.objects = { ...next.objects, [operation.objectId]: cloneJson(normalizeKnownObjectEnvelope(operation.object) as WorkspaceObject) };
      if (operation.asRoot && !next.root_object_ids.includes(operation.objectId)) next.root_object_ids = [...next.root_object_ids, operation.objectId];
      break;
    }
    case 'remove_object': {
      assertStableWorkspaceId(operation.objectId, 'Operation object id');
      if (!(operation.objectId in next.objects)) throw new WorkspaceMalformedInputError('Cannot remove unknown object');
      next.objects = Object.fromEntries(Object.entries(next.objects).filter(([id]) => id !== operation.objectId));
      writeTombstone(next, operation.objectId, operation.at, operation.authorSignature);
      next.root_object_ids = next.root_object_ids.filter((id) => id !== operation.objectId);
      next.objects = markWorkspaceReferencesBroken(next, next.id, operation.objectId).objects;
      break;
    }
    case 'set_root_order': {
      const ids = [...operation.rootObjectIds];
      if (new Set(ids).size !== ids.length || ids.some((id) => !(id in next.objects))) throw new WorkspaceMalformedInputError('Root order references invalid objects');
      next.root_object_ids = ids;
      break;
    }
    case 'set_permissions':
      next.permissions = normalizePermissions(operation.permissions);
      break;
    case 'set_protection':
      next.protection = normalizeProtection(operation.protection);
      break;
    default: {
      const neverOperation: never = operation;
      throw new WorkspaceObjectModelError(`Unsupported operation ${(neverOperation as WorkspaceChangeOperation).kind}`);
    }
  }
  next.modified_at = Math.max(next.modified_at, operation.at);
  next.version = Math.max(1, next.version + 1);
  validateWorkspaceDocumentInvariants(next, { allowFutureSchema: true });
  return next;
}



/** Converts live references to a predictable broken state while preserving the last allowed fallback snapshot. */
export function markWorkspaceReferencesBroken(document: WorkspaceDocument, sourceDocumentId: string, sourceObjectId: string): WorkspaceDocument {
  assertStableWorkspaceId(sourceDocumentId, 'Deleted source document id');
  assertStableWorkspaceId(sourceObjectId, 'Deleted source object id');
  const next = cloneJson(document);
  for (const [id, object] of Object.entries(next.objects)) {
    if (object.type !== 'WorkspaceReference') continue;
    const parsed = parseWorkspaceObjectUri(object.data.uri);
    if (parsed.documentId !== sourceDocumentId || parsed.objectId !== sourceObjectId) continue;
    next.objects[id] = {
      ...object,
      data: {
        ...object.data,
        fabric_status: 'broken',
        permission_state: object.data.permission_state ?? 'unknown',
        fallback_snapshot: object.data.fallback_policy === 'allowed' ? (object.data.fallback_snapshot ?? object.data.cached_snapshot) : undefined,
        fallback_policy: object.data.fallback_policy ?? 'forbidden',
        common: { ...(object.data.common ?? {}), ownership: object.data.mode === 'Frozen' ? 'ExternalFrozen' : 'ExternalLive' },
      },
    };
  }
  return next;
}



export function canonicalWorkItems(document: WorkspaceDocument): readonly CanonicalWorkItem[] {
  return document.workManagementData?.tasks ?? [];
}



/** Resolves a reference to the exact canonical TaskItem object; callers must not synthesize shadow task copies. */
export function resolveCanonicalWorkItemReference(document: WorkspaceDocument, referenceObjectId: string): CanonicalWorkItem {
  const object = document.objects[referenceObjectId];
  if (!object || object.type !== 'WorkItemRef') throw new WorkspaceMalformedInputError('Work item reference object is missing');
  const work = document.workManagementData;
  if (!work) throw new WorkspaceMalformedInputError('Canonical work item collection is missing');
  const canonical = work.tasks.find((task) => task.id === object.data.workItemId);
  if (!canonical) throw new WorkspaceMalformedInputError('Work item reference target is missing');
  return canonical;
}



export function workspaceObjectOwnership(object: WorkspaceObject): 'Strong'|'ExternalLive'|'ExternalFrozen' {
  if (object.type !== 'WorkspaceReference') return 'Strong';
  return object.data.mode === 'Frozen' ? 'ExternalFrozen' : 'ExternalLive';
}



/** Stable family inventory used by apps and audits instead of duplicating taxonomy locally. */
export function workspaceObjectFamily(type: WorkspaceObject['type']): 'text'|'table-grid'|'chart'|'scene-shape'|'media-asset'|'comment-review'|'work-item'|'data-record'|'link-reference'|'policy'|'extension' {
  switch (type) {
    case 'TextBlock': return 'text';
    case 'Table': return 'table-grid';
    case 'Chart': return 'chart';
    case 'Shape': return 'scene-shape';
    case 'MediaAsset': return 'media-asset';
    case 'CommentReview': return 'comment-review';
    case 'WorkItemRef': return 'work-item';
    case 'DataRecord': return 'data-record';
    case 'WorkspaceReference': return 'link-reference';
    case 'PolicyMetadata': return 'policy';
    case 'ExtensionObject': return 'extension';
  }
}
