// STATUS: DIAMANT VGT SUPREME — Workspace Fabric resolution, graph and render state
import type {
  WorkspaceDocument,
  WorkspaceObject,
  WorkspacePermissionRole,
  WorkspacePermissionsMetadata,
  WorkspaceReferenceObject,
} from '../contracts/workspace';
import {
  parseWorkspaceObjectUri,
  validateWorkspaceDocumentInvariants,
} from '../../platform/workspace/model/workspaceObjectModel';
import type {
  FabricDependencyEdge,
  FabricDependencyGraph,
  FabricLink,
  FabricLinkStatus,
  FabricNotification,
  FabricRenderContract,
  FabricResolution,
  FabricResolutionPolicy,
} from './fabricTypes';
import { WorkspaceFabricError } from './fabricTypes';

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function nowOr(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now();
}

export function referenceObject(document: WorkspaceDocument, referenceId: string): WorkspaceReferenceObject {
  const object = document.objects[referenceId];
  if (!object || object.type !== 'WorkspaceReference') {
    throw new WorkspaceFabricError(`Workspace reference ${referenceId} was not found in ${document.id}`);
  }
  return object.data;
}

const ROLE_RANK: Readonly<Record<WorkspacePermissionRole, number>> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

export function effectivePermissionRole(
  source: WorkspaceDocument,
  target: WorkspaceDocument,
  policy?: FabricResolutionPolicy,
): WorkspacePermissionRole {
  const sourceRole = policy?.sourceRole?.(source, target) ?? 'viewer';
  const targetRole = policy?.targetRole?.(source, target) ?? sourceRole;
  return ROLE_RANK[sourceRole] <= ROLE_RANK[targetRole] ? sourceRole : targetRole;
}

export function canRead(
  source: WorkspaceDocument,
  target: WorkspaceDocument,
  policy?: FabricResolutionPolicy,
): boolean {
  if (policy?.canReadSource && !policy.canReadSource(source, target)) return false;
  return ROLE_RANK[effectivePermissionRole(source, target, policy)] >= ROLE_RANK.viewer;
}

export function sourceUnavailable(documentId: string, policy?: FabricResolutionPolicy): boolean {
  if (policy?.unavailableDocumentIds?.has(documentId)) return true;
  if (policy?.remoteDocumentIds?.has(documentId) && !policy.transportCapabilityDocumentIds?.has(documentId)) return true;
  return false;
}

export function snapshotExplicitlyEmbedded(reference: WorkspaceReferenceObject): boolean {
  return reference.mode === 'Frozen' || reference.permission_provenance?.snapshot_explicitly_embedded === true;
}

function referenceExpectedType(reference: WorkspaceReferenceObject): WorkspaceObject['type'] | undefined {
  return reference.expected_type;
}

export function nextDocumentVersion(document: WorkspaceDocument, at: number): WorkspaceDocument {
  return {
    ...document,
    version: Math.max(1, document.version + 1),
    modified_at: Math.max(document.modified_at, at),
  };
}

export function setReference(
  document: WorkspaceDocument,
  referenceId: string,
  data: WorkspaceReferenceObject,
  at: number,
): WorkspaceDocument {
  const object = document.objects[referenceId];
  if (!object || object.type !== 'WorkspaceReference') throw new WorkspaceFabricError('Target reference no longer exists');
  const canonicalData: WorkspaceReferenceObject = {
    ...data,
    common: {
      ...(data.common ?? {}),
      ownership: data.mode === 'Frozen' ? 'ExternalFrozen' : 'ExternalLive',
    },
  };
  const next = nextDocumentVersion(document, at);
  next.objects = {
    ...document.objects,
    [referenceId]: { type: 'WorkspaceReference', data: canonicalData },
  };
  validateWorkspaceDocumentInvariants(next, { allowFutureSchema: true });
  return next;
}

export function replaceReferenceWithCopy(
  document: WorkspaceDocument,
  referenceId: string,
  snapshot: WorkspaceObject,
  at: number,
): WorkspaceDocument {
  const copied = clone(snapshot);
  // A broken live link becomes an owned object with the target object's stable identity.
  copied.data.id = referenceId;
  const next = nextDocumentVersion(document, at);
  next.objects = { ...document.objects, [referenceId]: copied };
  validateWorkspaceDocumentInvariants(next, { allowFutureSchema: true });
  return next;
}

export function notificationId(kind: FabricNotification['kind'], targetDocId: string, targetRefId: string, at: number): string {
  return `fabric:${kind}:${targetDocId}:${targetRefId}:${at}`;
}

/** Canonical parser retained for older callers. Parsing is owned by WOM, not duplicated here. */
export function parseVgtUri(uri: string): { docId: string; objId: string } | null {
  try {
    const parsed = parseWorkspaceObjectUri(uri);
    return { docId: parsed.documentId, objId: parsed.objectId };
  } catch {
    return null;
  }
}

export function resolveFabricReference(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  policy?: FabricResolutionPolicy,
): FabricResolution {
  const target = documents[targetDocId];
  if (!target) throw new WorkspaceFabricError(`Target document ${targetDocId} is unavailable`);
  const reference = referenceObject(target, targetRefId);
  const parsed = parseVgtUri(reference.uri);
  if (!parsed) {
    return {
      link: {
        targetDocId,
        targetRefId,
        sourceDocId: '',
        sourceObjId: '',
        mode: reference.mode,
        status: 'broken',
        resolvedSourceVersion: reference.resolved_source_version,
        expectedType: referenceExpectedType(reference),
      },
      snapshot: snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined,
    };
  }

  const base: Omit<FabricLink, 'status'> = {
    targetDocId,
    targetRefId,
    sourceDocId: parsed.docId,
    sourceObjId: parsed.objId,
    mode: reference.mode,
    resolvedSourceVersion: reference.resolved_source_version,
    expectedType: referenceExpectedType(reference),
    sourceSnapshotId: reference.source_snapshot_id,
  };

  if (reference.mode === 'Frozen') {
    const embedded = snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined;
    return {
      link: { ...base, status: embedded ? 'frozen' : 'broken', sourceVersion: reference.source_version },
      snapshot: embedded,
    };
  }

  if (sourceUnavailable(parsed.docId, policy)) {
    return {
      link: { ...base, status: 'unavailable', sourceVersion: reference.source_version },
      snapshot: snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined,
    };
  }

  const sourceDocument = documents[parsed.docId];
  if (!sourceDocument) {
    return {
      link: { ...base, status: 'unavailable', sourceVersion: reference.source_version },
      snapshot: snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined,
    };
  }

  const effectiveRole = effectivePermissionRole(sourceDocument, target, policy);
  if (!canRead(sourceDocument, target, policy)) {
    return {
      link: { ...base, status: 'permission-lost', sourceVersion: sourceDocument.version, effectiveRole },
      sourceDocument,
      snapshot: snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined,
    };
  }

  const sourceObject = sourceDocument.objects[parsed.objId];
  if (!sourceObject) {
    return {
      link: { ...base, status: 'broken', sourceVersion: sourceDocument.version, effectiveRole },
      sourceDocument,
      snapshot: snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined,
    };
  }

  const expectedType = referenceExpectedType(reference);
  if (expectedType && sourceObject.type !== expectedType) {
    return {
      link: { ...base, status: 'broken', sourceVersion: sourceDocument.version, effectiveRole },
      sourceDocument,
      sourceObject,
      snapshot: snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined,
    };
  }

  const resolvedVersion = reference.resolved_source_version;
  const status: FabricLinkStatus = resolvedVersion === undefined || resolvedVersion < sourceDocument.version
    ? 'changed'
    : 'current';
  return {
    link: { ...base, status, sourceVersion: sourceDocument.version, effectiveRole },
    sourceDocument,
    sourceObject,
    snapshot: snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined,
  };
}

/** Finds all cross-document links and resolves their state without mutating documents. */
export function scanFabricLinks(
  documents: Record<string, WorkspaceDocument>,
  policy?: FabricResolutionPolicy,
): FabricLink[] {
  const links: FabricLink[] = [];
  for (const [targetDocId, doc] of Object.entries(documents)) {
    for (const [objId, obj] of Object.entries(doc.objects)) {
      if (obj.type !== 'WorkspaceReference') continue;
      links.push(resolveFabricReference(documents, targetDocId, objId, policy).link);
    }
  }
  return links;
}

export function buildFabricDependencyGraph(
  documents: Record<string, WorkspaceDocument>,
): FabricDependencyGraph {
  const edges: FabricDependencyEdge[] = [];
  const nodes = new Set<string>(Object.keys(documents));
  for (const link of scanFabricLinks(documents)) {
    if (!link.sourceDocId) continue;
    nodes.add(link.sourceDocId);
    nodes.add(link.targetDocId);
    edges.push({
      sourceDocId: link.sourceDocId,
      sourceObjId: link.sourceObjId,
      targetDocId: link.targetDocId,
      targetRefId: link.targetRefId,
      mode: link.mode,
    });
  }

  // Direction follows update propagation: source -> target.
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node, []);
  for (const edge of edges) adjacency.get(edge.sourceDocId)?.push(edge.targetDocId);
  for (const neighbors of adjacency.values()) neighbors.sort();

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const cycleKeys = new Set<string>();

  const visit = (node: string) => {
    visited.add(node);
    active.add(node);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!visited.has(next)) visit(next);
      else if (active.has(next)) {
        const start = stack.lastIndexOf(next);
        const cycle = [...stack.slice(start), next];
        const canonical = cycle.slice(0, -1).sort().join('|');
        if (!cycleKeys.has(canonical)) {
          cycleKeys.add(canonical);
          cycles.push(cycle);
        }
      }
    }
    stack.pop();
    active.delete(node);
  };

  for (const node of [...nodes].sort()) if (!visited.has(node)) visit(node);
  return { nodes: [...nodes].sort(), edges, cycles };
}

export function assertNoFabricCycles(documents: Record<string, WorkspaceDocument>): void {
  const graph = buildFabricDependencyGraph(documents);
  if (graph.cycles.length > 0) {
    throw new WorkspaceFabricError(`Workspace Fabric cycle detected: ${graph.cycles[0].join(' -> ')}`);
  }
}


export function permissionProvenance(
  source: WorkspaceDocument,
  options: { sourceRoleCeiling?: WorkspacePermissionRole; snapshotExplicitlyEmbedded?: boolean } = {},
): WorkspaceReferenceObject['permission_provenance'] {
  const permissions = source.permissions as WorkspacePermissionsMetadata | undefined;
  return {
    source_document_id: source.id,
    source_policy_version: permissions?.policyVersion,
    source_role_ceiling: options.sourceRoleCeiling ?? 'viewer',
    snapshot_explicitly_embedded: options.snapshotExplicitlyEmbedded === true,
  };
}


export function renderFabricReference(
  documents: Record<string, WorkspaceDocument>,
  targetDocId: string,
  targetRefId: string,
  policy?: FabricResolutionPolicy,
): FabricRenderContract {
  const resolution = resolveFabricReference(documents, targetDocId, targetRefId, policy);
  const target = documents[targetDocId];
  const reference = referenceObject(target, targetRefId);
  const embeddedSnapshot = snapshotExplicitlyEmbedded(reference) ? reference.cached_snapshot : undefined;
  const payload = resolution.link.status === 'permission-lost'
    ? embeddedSnapshot
    : resolution.sourceObject ?? embeddedSnapshot;
  return {
    contract: 'astraea.workspace.fabric.render.v1',
    referenceId: targetRefId,
    sourceUri: reference.uri,
    mode: reference.mode,
    status: resolution.link.status,
    sourceType: payload?.type ?? reference.expected_type,
    sourceVersion: resolution.link.sourceVersion,
    resolvedSourceVersion: resolution.link.resolvedSourceVersion,
    sourceSnapshotId: resolution.link.sourceSnapshotId,
    effectiveRole: resolution.link.effectiveRole,
    stale: resolution.link.status === 'changed' || resolution.link.status === 'unavailable',
    payload: payload ? clone(payload) : undefined,
  };
}
