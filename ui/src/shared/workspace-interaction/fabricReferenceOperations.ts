// STATUS: DIAMANT VGT SUPREME — Fabric live-reference lifecycle and validated projections
import type { WorkspaceDocument, WorkspaceObject, WorkspaceReferenceObject } from '../contracts/workspace';
import { validateWorkspaceDocumentInvariants, workspaceObjectUri } from '../../platform/workspace/model/workspaceObjectModel';
import { assertNoSecurityDowngrade } from '../../platform/security/securityProfiles';
import type {
  FabricChangeView,
  FabricInsertOptions,
  FabricLinkStatus,
  FabricNotification,
  FabricResolutionPolicy,
  FabricTransactionResult,
} from './fabricTypes';
import { WorkspaceFabricError } from './fabricTypes';
import {
  assertNoFabricCycles,
  canRead,
  clone,
  effectivePermissionRole,
  nextDocumentVersion,
  nowOr,
  notificationId,
  parseVgtUri,
  permissionProvenance,
  referenceObject,
  replaceReferenceWithCopy,
  resolveFabricReference,
  scanFabricLinks,
  setReference,
  sourceUnavailable,
} from './fabricState';

function updateReferenceStatusOnly(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  status: FabricLinkStatus,
  at: number,
): Record<string, WorkspaceDocument> {
  const target = documents[targetDocId];
  if (!target) return documents;
  const reference = referenceObject(target, targetRefId);
  if (reference.fabric_status === status) return documents;
  const updated = setReference(target, targetRefId, { ...reference, fabric_status: status }, at);
  return { ...documents, [targetDocId]: updated };
}

/**
 * Transactionally refreshes one live link. The input map is never partially mutated.
 * Frozen references are intentionally immutable until explicitly relinked/unfrozen.
 */
export function refreshFabricReference(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  options: { now?: number; policy?: FabricResolutionPolicy } = {},
): FabricTransactionResult {
  const at = nowOr(options.now);
  const before = resolveFabricReference(documents, targetDocId, targetRefId, options.policy);
  if (before.link.mode === 'Frozen') {
    return { updatedDocs: documents, notifications: [], touchedDocumentIds: [] };
  }

  if (!before.sourceDocument || !before.sourceObject || before.link.status === 'permission-lost' || before.link.status === 'broken' || before.link.status === 'unavailable') {
    const nextDocs = updateReferenceStatusOnly(documents, targetDocId, targetRefId, before.link.status, at);
    const kind: FabricNotification['kind'] = before.link.status === 'permission-lost'
      ? 'permission-lost'
      : before.link.status === 'unavailable'
        ? 'unavailable'
        : 'broken';
    return {
      updatedDocs: nextDocs,
      touchedDocumentIds: nextDocs === documents ? [] : [targetDocId],
      notifications: [{
        id: notificationId(kind, targetDocId, targetRefId, at),
        at,
        sourceDocId: before.link.sourceDocId,
        sourceObjId: before.link.sourceObjId,
        targetDocId,
        targetRefId,
        previousStatus: before.link.status,
        status: before.link.status,
        sourceVersion: before.link.sourceVersion,
        previousResolvedSourceVersion: before.link.resolvedSourceVersion,
        resolvedSourceVersion: before.link.resolvedSourceVersion,
        kind,
      }],
    };
  }

  const target = documents[targetDocId];
  assertNoSecurityDowngrade(before.sourceDocument, target);
  const reference = referenceObject(target, targetRefId);
  const updatedReference: WorkspaceReferenceObject = {
    ...reference,
    cached_snapshot: undefined,
    fallback_snapshot: undefined,
    fallback_policy: 'forbidden',
    source_snapshot_id: undefined,
    expected_type: reference.expected_type ?? before.sourceObject.type,
    source_version: before.sourceDocument.version,
    resolved_source_version: before.sourceDocument.version,
    fabric_status: 'current',
    permission_provenance: permissionProvenance(before.sourceDocument, {
      sourceRoleCeiling: effectivePermissionRole(before.sourceDocument, target, options.policy),
      snapshotExplicitlyEmbedded: false,
    }),
  };
  const updatedTarget = setReference(target, targetRefId, updatedReference, at);
  const nextDocs = { ...documents, [targetDocId]: updatedTarget };
  assertNoFabricCycles(nextDocs);
  return {
    updatedDocs: nextDocs,
    touchedDocumentIds: [targetDocId],
    notifications: [{
      id: notificationId('refreshed', targetDocId, targetRefId, at),
      at,
      sourceDocId: before.link.sourceDocId,
      sourceObjId: before.link.sourceObjId,
      targetDocId,
      targetRefId,
      previousStatus: before.link.status,
      status: 'current',
      sourceVersion: before.sourceDocument.version,
      previousResolvedSourceVersion: before.link.resolvedSourceVersion,
      resolvedSourceVersion: before.sourceDocument.version,
      kind: 'refreshed',
    }],
  };
}


export function insertFromWorkspace(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  sourceDocId: string,
  sourceObjId: string,
  options: FabricInsertOptions,
): FabricTransactionResult & { referenceId: string } {
  const at = nowOr(options.now);
  const target = documents[targetDocId];
  const source = documents[sourceDocId];
  if (!target) throw new WorkspaceFabricError(`Target document ${targetDocId} is unavailable`);
  if (!source || sourceUnavailable(sourceDocId, options.policy)) throw new WorkspaceFabricError(`Source document ${sourceDocId} is unavailable`);
  assertNoSecurityDowngrade(source, target);
  if (!canRead(source, target, options.policy)) throw new WorkspaceFabricError('Source permission is not available to the target context');
  const sourceObject = source.objects[sourceObjId];
  if (!sourceObject) throw new WorkspaceFabricError(`Source object ${sourceObjId} does not exist`);
  if (options.expectedType && options.expectedType !== sourceObject.type) throw new WorkspaceFabricError('Source object type does not match the expected render contract');
  if (target.objects[options.referenceId]) throw new WorkspaceFabricError(`Target object id ${options.referenceId} already exists`);

  const mode = options.mode ?? 'Live';
  const reference: WorkspaceObject = {
    type: 'WorkspaceReference',
    data: {
      id: options.referenceId,
      uri: workspaceObjectUri(sourceDocId, sourceObjId),
      mode,
      cached_snapshot: mode === 'Frozen' ? clone(sourceObject) : undefined,
      fallback_snapshot: mode === 'Frozen' ? clone(sourceObject) : undefined,
      fallback_policy: mode === 'Frozen' ? 'allowed' : 'forbidden',
      source_snapshot_id: mode === 'Frozen' ? `snapshot-${source.version}-${sourceObjId}` : undefined,
      expected_type: options.expectedType ?? sourceObject.type,
      source_version: source.version,
      resolved_source_version: source.version,
      fabric_status: mode === 'Frozen' ? 'frozen' : 'current',
      frozen_at: mode === 'Frozen' ? at : undefined,
      permission_provenance: permissionProvenance(source, {
        sourceRoleCeiling: effectivePermissionRole(source, target, options.policy),
        snapshotExplicitlyEmbedded: mode === 'Frozen',
      }),
      // **Der `Frozen`-Bruch, behoben (Runde 293) ✗✓✓** — *gefunden vom **Draw-Agenten**, der ihn **gemeldet
      // statt umgangen** hat* ✓✓: *`insertFromWorkspace` baute den Verweis **ohne** `common`, und für
      // `mode: 'Frozen'` scheiterte der Aufruf mit `WorkspaceReference ownership/mode mismatch`* ✗✗.
      //
      // **Und es ist genau die Form, die dieses Projekt am teuersten bezahlt ✗✓:** *die Regel stand **einseitig** —
      // `setReference` kennt sie ✓ (`fabricState.ts:94-96`), **der Einfüger nicht** ✗. *Und `insertFromWorkspace`
      // ruft `setReference` erst **später** (Z. 219) — der **erste** Verweis geht also **nie** durch die Regel.* ✓✓
      //
      // **Also dieselbe Regel, an derselben Stelle, mit demselben Ausdruck** ✓✓ — *kein zweiter Begriff von
      // „frozen": **eine** Ableitung aus `mode`, wie beim Aktualisierer* ✓ (`data.mode === 'Frozen'`).
      // *Und `setReference` **überschreibt** `ownership` später ohnehin* ✓ (`...(data.common ?? {})` **dann**
      // `ownership:` ✓) — *die beiden Wege können damit nicht auseinanderlaufen* ✓✓.
      common: { ownership: mode === 'Frozen' ? 'ExternalFrozen' : 'ExternalLive' },
    },
  };

  let nextTarget = nextDocumentVersion(target, at);
  nextTarget.objects = { ...target.objects, [options.referenceId]: reference };
  nextTarget.root_object_ids = target.root_object_ids.includes(options.referenceId)
    ? [...target.root_object_ids]
    : [...target.root_object_ids, options.referenceId];
  validateWorkspaceDocumentInvariants(nextTarget, { allowFutureSchema: true });
  const nextDocs = { ...documents, [targetDocId]: nextTarget };
  assertNoFabricCycles(nextDocs);
  return { updatedDocs: nextDocs, notifications: [], touchedDocumentIds: [targetDocId], referenceId: options.referenceId };
}


export function openFabricSource(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  policy?: FabricResolutionPolicy,
): { documentId: string; objectId: string; document: WorkspaceDocument; object: WorkspaceObject } {
  const resolution = resolveFabricReference(documents, targetDocId, targetRefId, policy);
  if (resolution.link.status === 'permission-lost') throw new WorkspaceFabricError('Source permission was lost');
  if (!resolution.sourceDocument || !resolution.sourceObject) throw new WorkspaceFabricError('Source is unavailable or broken');
  return {
    documentId: resolution.link.sourceDocId,
    objectId: resolution.link.sourceObjId,
    document: resolution.sourceDocument,
    object: resolution.sourceObject,
  };
}

export function freezeFabricReference(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  options: { now?: number; policy?: FabricResolutionPolicy } = {},
): FabricTransactionResult {
  const at = nowOr(options.now);
  const refreshed = refreshFabricReference(documents, targetDocId, targetRefId, { now: at, policy: options.policy });
  const working = refreshed.updatedDocs;
  const resolution = resolveFabricReference(working, targetDocId, targetRefId, options.policy);
  if (!resolution.sourceDocument || !resolution.sourceObject || resolution.link.status === 'permission-lost' || resolution.link.status === 'unavailable' || resolution.link.status === 'broken') {
    throw new WorkspaceFabricError('Cannot freeze a Fabric link without readable semantic source content');
  }
  const target = working[targetDocId];
  const reference = referenceObject(target, targetRefId);
  const snapshot = clone(resolution.sourceObject);
  const nextTarget = setReference(target, targetRefId, {
    ...reference,
    mode: 'Frozen',
    cached_snapshot: snapshot,
    fallback_snapshot: clone(snapshot),
    fallback_policy: 'allowed',
    source_snapshot_id: `snapshot-${resolution.sourceDocument.version}-${resolution.link.sourceObjId}`,
    source_version: resolution.sourceDocument.version,
    resolved_source_version: resolution.sourceDocument.version,
    fabric_status: 'frozen',
    frozen_at: at,
    permission_provenance: permissionProvenance(resolution.sourceDocument, {
      sourceRoleCeiling: effectivePermissionRole(resolution.sourceDocument, target, options.policy),
      snapshotExplicitlyEmbedded: true,
    }),
  }, at);
  const parsed = parseVgtUri(reference.uri);
  const nextDocs = { ...working, [targetDocId]: nextTarget };
  return {
    updatedDocs: nextDocs,
    touchedDocumentIds: [targetDocId],
    notifications: [...refreshed.notifications, {
      id: notificationId('frozen', targetDocId, targetRefId, at),
      at,
      sourceDocId: parsed?.docId ?? '',
      sourceObjId: parsed?.objId ?? '',
      targetDocId,
      targetRefId,
      previousStatus: refreshed.notifications.at(-1)?.status ?? 'current',
      status: 'frozen',
      sourceVersion: reference.source_version,
      previousResolvedSourceVersion: reference.resolved_source_version,
      resolvedSourceVersion: reference.resolved_source_version,
      kind: 'frozen',
    }],
  };
}

export function breakFabricLink(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  options: { now?: number; policy?: FabricResolutionPolicy } = {},
): FabricTransactionResult {
  const at = nowOr(options.now);
  const resolution = resolveFabricReference(documents, targetDocId, targetRefId, options.policy);
  const target = documents[targetDocId];
  const reference = referenceObject(target, targetRefId);
  const snapshot = reference.cached_snapshot ?? resolution.sourceObject;
  if (!snapshot) throw new WorkspaceFabricError('Cannot break a link without an available or cached source snapshot');
  const nextTarget = replaceReferenceWithCopy(target, targetRefId, snapshot, at);
  return {
    updatedDocs: { ...documents, [targetDocId]: nextTarget },
    touchedDocumentIds: [targetDocId],
    notifications: [{
      id: notificationId('broken', targetDocId, targetRefId, at),
      at,
      sourceDocId: resolution.link.sourceDocId,
      sourceObjId: resolution.link.sourceObjId,
      targetDocId,
      targetRefId,
      previousStatus: resolution.link.status,
      status: 'broken',
      sourceVersion: resolution.link.sourceVersion,
      previousResolvedSourceVersion: resolution.link.resolvedSourceVersion,
      resolvedSourceVersion: resolution.link.resolvedSourceVersion,
      kind: 'broken',
    }],
  };
}

export function relinkFabricReference(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  sourceDocId: string,
  sourceObjId: string,
  options: { now?: number; mode?: 'Live' | 'Frozen'; policy?: FabricResolutionPolicy } = {},
): FabricTransactionResult {
  const at = nowOr(options.now);
  const target = documents[targetDocId];
  const source = documents[sourceDocId];
  if (!target || !source || sourceUnavailable(sourceDocId, options.policy)) throw new WorkspaceFabricError('Relink source or target is unavailable');
  assertNoSecurityDowngrade(source, target);
  if (!canRead(source, target, options.policy)) throw new WorkspaceFabricError('Relink source permission is unavailable');
  const sourceObject = source.objects[sourceObjId];
  if (!sourceObject) throw new WorkspaceFabricError('Relink source object does not exist');
  const previous = resolveFabricReference(documents, targetDocId, targetRefId, options.policy);
  const reference = referenceObject(target, targetRefId);
  const mode = options.mode ?? reference.mode;
  const nextReference: WorkspaceReferenceObject = {
    ...reference,
    uri: workspaceObjectUri(sourceDocId, sourceObjId),
    mode,
    cached_snapshot: mode === 'Frozen' ? clone(sourceObject) : undefined,
    fallback_snapshot: mode === 'Frozen' ? clone(sourceObject) : undefined,
    fallback_policy: mode === 'Frozen' ? 'allowed' : 'forbidden',
    source_snapshot_id: mode === 'Frozen' ? `snapshot-${source.version}-${sourceObjId}` : undefined,
    expected_type: sourceObject.type,
    source_version: source.version,
    resolved_source_version: source.version,
    fabric_status: mode === 'Frozen' ? 'frozen' : 'current',
    frozen_at: mode === 'Frozen' ? at : undefined,
    permission_provenance: permissionProvenance(source, {
      sourceRoleCeiling: effectivePermissionRole(source, target, options.policy),
      snapshotExplicitlyEmbedded: mode === 'Frozen',
    }),
  };
  const nextTarget = setReference(target, targetRefId, nextReference, at);
  const nextDocs = { ...documents, [targetDocId]: nextTarget };
  assertNoFabricCycles(nextDocs);
  return {
    updatedDocs: nextDocs,
    touchedDocumentIds: [targetDocId],
    notifications: [{
      id: notificationId('relinked', targetDocId, targetRefId, at),
      at,
      sourceDocId,
      sourceObjId,
      targetDocId,
      targetRefId,
      previousStatus: previous.link.status,
      status: mode === 'Frozen' ? 'frozen' : 'current',
      sourceVersion: source.version,
      previousResolvedSourceVersion: previous.link.resolvedSourceVersion,
      resolvedSourceVersion: source.version,
      kind: 'relinked',
    }],
  };
}

/**
 * Atomic source update propagation. Every affected target is validated first; any failure throws
 * before a new map is returned, so callers never observe a half-applied multi-document update.
 */
export function propagateFabricUpdates(
  sourceDocId: string,
  sourceObjId: string,
  updatedSourceObj: WorkspaceObject,
  documents: Record<string, WorkspaceDocument>,
  options: { now?: number; policy?: FabricResolutionPolicy } = {},
): { updatedDocs: Record<string, WorkspaceDocument>; count: number; notifications: FabricNotification[] } {
  const at = nowOr(options.now);
  const source = documents[sourceDocId];
  if (!source) throw new WorkspaceFabricError(`Source document ${sourceDocId} does not exist`);
  if (!source.objects[sourceObjId]) throw new WorkspaceFabricError(`Source object ${sourceObjId} does not exist`);
  if (updatedSourceObj.data.id !== sourceObjId) throw new WorkspaceFabricError('Updated source object identity mismatch');

  const sourceNext: WorkspaceDocument = {
    ...source,
    objects: { ...source.objects, [sourceObjId]: clone(updatedSourceObj) },
  };
  validateWorkspaceDocumentInvariants(sourceNext, { allowFutureSchema: true });
  let working: Record<string, WorkspaceDocument> = { ...documents, [sourceDocId]: sourceNext };
  const notifications: FabricNotification[] = [];
  const touched = new Set<string>();

  // Resolve against the post-source-update map. Source version is controlled by the caller's document update.
  const links = scanFabricLinks(working, options.policy)
    .filter((link) => link.sourceDocId === sourceDocId && link.sourceObjId === sourceObjId)
    .sort((a, b) => `${a.targetDocId}/${a.targetRefId}`.localeCompare(`${b.targetDocId}/${b.targetRefId}`));

  for (const link of links) {
    if (link.mode !== 'Live') continue;
    const target = working[link.targetDocId];
    if (!target) continue;
    const reference = referenceObject(target, link.targetRefId);
    let status: FabricLinkStatus = 'changed';
    let nextReference: WorkspaceReferenceObject = { ...reference, fabric_status: status };
    let kind: FabricNotification['kind'] = 'source-changed';

    if (sourceUnavailable(sourceDocId, options.policy)) {
      status = 'unavailable';
      kind = 'unavailable';
      nextReference = { ...reference, fabric_status: status };
    } else if (!canRead(sourceNext, target, options.policy)) {
      status = 'permission-lost';
      kind = 'permission-lost';
      nextReference = { ...reference, fabric_status: status };
    } else if (reference.expected_type && reference.expected_type !== updatedSourceObj.type) {
      status = 'broken';
      kind = 'broken';
      nextReference = { ...reference, fabric_status: status };
    } else {
      // Live propagation advances only authenticated identity/version metadata. Source content
      // remains in the source document and is never silently copied into a Live reference.
      status = 'current';
      nextReference = {
        ...reference,
        cached_snapshot: undefined,
        fallback_snapshot: undefined,
        fallback_policy: 'forbidden',
        source_snapshot_id: undefined,
        expected_type: reference.expected_type ?? updatedSourceObj.type,
        source_version: sourceNext.version,
        resolved_source_version: sourceNext.version,
        fabric_status: 'current',
        permission_provenance: permissionProvenance(sourceNext, {
          sourceRoleCeiling: effectivePermissionRole(sourceNext, target, options.policy),
          snapshotExplicitlyEmbedded: false,
        }),
      };
    }

    const updatedTarget = setReference(target, link.targetRefId, nextReference, at);
    working = { ...working, [link.targetDocId]: updatedTarget };
    touched.add(link.targetDocId);
    notifications.push({
      id: notificationId(kind, link.targetDocId, link.targetRefId, at),
      at,
      sourceDocId,
      sourceObjId,
      targetDocId: link.targetDocId,
      targetRefId: link.targetRefId,
      previousStatus: link.status,
      status,
      sourceVersion: sourceNext.version,
      previousResolvedSourceVersion: link.resolvedSourceVersion,
      resolvedSourceVersion: status === 'current' ? sourceNext.version : link.resolvedSourceVersion,
      kind,
    });
  }

  assertNoFabricCycles(working);
  return { updatedDocs: working, count: touched.size === 0 ? 0 : notifications.length, notifications };
}




export function viewFabricChanges(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  policy?: FabricResolutionPolicy,
): FabricChangeView {
  const resolution = resolveFabricReference(documents, targetDocId, targetRefId, policy);
  const reference = referenceObject(documents[targetDocId], targetRefId);
  return {
    targetDocId,
    targetRefId,
    sourceDocId: resolution.link.sourceDocId,
    sourceObjId: resolution.link.sourceObjId,
    fromVersion: reference.resolved_source_version,
    toVersion: resolution.link.sourceVersion,
    status: resolution.link.status,
    changed: resolution.link.status === 'changed',
    typeChanged: Boolean(reference.expected_type && resolution.sourceObject && reference.expected_type !== resolution.sourceObject.type),
  };
}
