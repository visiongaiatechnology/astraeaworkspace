// STATUS: DIAMANT VGT SUPREME — typed WOM object and metadata validation
import type { WorkspaceDocument, WorkspaceObjectMetadata, WorkspacePermissionsMetadata, WorkspaceProtectionMetadata } from '../../../shared/contracts/workspace';
import { WOM_MAX_BINARY_ASSET_BYTES, WOM_MAX_EXTENSION_BYTES, WOM_MAX_EXTENSION_NAMESPACES, WOM_MAX_ID_LENGTH, WOM_MAX_INLINE_METADATA_BYTES } from '../../../shared/contracts/wom/workspaceWom';
import { WorkspaceMalformedInputError, WorkspaceUnsupportedContentError, assertFiniteNumber, assertNamespace, cloneJson, isRecord, jsonByteLength, parseWorkspaceObjectUri, assertStableWorkspaceId } from './workspaceObjectModelPrimitives';

const MAX_GRANTS = 10_000;


const MAX_LINKS_PER_OBJECT = 4_096;


const MAX_COMMENTS_PER_THREAD = 10_000;


const MAX_COMMENT_BODY = 256 * 1024;


const MAX_DATA_RECORD_FIELDS = 16_384;


const MAX_POLICY_FIELDS = 8_192;


const MAX_EXTENSION_FAMILY_LENGTH = 128;


const MAX_PARAGRAPHS_PER_TEXT_BLOCK = 1_000_000;


const MAX_TABLE_CELLS = 2_000_000;


const MAX_CHART_POINTS = 1_000_000;


const MAX_TOMBSTONES = 200_000;


const WOM_IDENTITY_EXTENSION = 'vgt.wom:identity';


const FORBIDDEN_EXECUTABLE_KEYS = new Set(['eval', 'javascript', 'script', 'scriptSource', 'executable', 'shellCommand', 'commandLine']);


const KNOWN_OBJECT_TYPES = new Set([
  'TextBlock', 'Table', 'Shape', 'Chart', 'WorkspaceReference',
  'MediaAsset', 'CommentReview', 'WorkItemRef', 'DataRecord', 'PolicyMetadata', 'ExtensionObject',
]);


const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;



export function normalizePermissions(value: unknown): WorkspacePermissionsMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new WorkspaceMalformedInputError('Permissions metadata must be an object');
  const ownerId = typeof value.ownerId === 'string' && value.ownerId.trim() ? value.ownerId.trim() : undefined;
  if (ownerId) assertStableWorkspaceId(ownerId, 'Permission owner id');
  const inheritedFrom = typeof value.inheritedFrom === 'string' && value.inheritedFrom.trim() ? value.inheritedFrom.trim() : undefined;
  if (inheritedFrom) assertStableWorkspaceId(inheritedFrom, 'Permission inherited-from id');
  const rawGrants = Array.isArray(value.grants) ? value.grants : [];
  if (rawGrants.length > MAX_GRANTS) throw new WorkspaceMalformedInputError('Permission grant limit exceeded');
  const grants = rawGrants.map((raw) => {
    if (!isRecord(raw) || typeof raw.principalId !== 'string') throw new WorkspaceMalformedInputError('Invalid permission grant');
    const principalId = raw.principalId.trim();
    assertStableWorkspaceId(principalId, 'Permission principal id');
    const role = raw.role;
    if (!['owner', 'editor', 'commenter', 'viewer'].includes(String(role))) throw new WorkspaceMalformedInputError('Invalid permission role');
    const deviceIds = Array.isArray(raw.deviceIds)
      ? [...new Set(raw.deviceIds.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))]
      : undefined;
    deviceIds?.forEach((id) => assertStableWorkspaceId(id, 'Permission device id'));
    const expiresAt = raw.expiresAt;
    if (expiresAt !== undefined) assertFiniteNumber(expiresAt, 'Permission expiry');
    return { principalId, role: role as WorkspacePermissionsMetadata['grants'][number]['role'], deviceIds, expiresAt };
  });
  return { policyVersion: 1, ownerId, inheritedFrom, grants };
}



export function normalizeProtection(value: unknown): WorkspaceProtectionMetadata {
  if (value === undefined) return { version: 1, classification: 'standard', locked: false, readOnly: false };
  if (!isRecord(value)) throw new WorkspaceMalformedInputError('Protection metadata must be an object');
  const classification = String(value.classification ?? 'standard');
  if (!['standard', 'sensitive', 'confidential', 'restricted'].includes(classification)) {
    throw new WorkspaceMalformedInputError('Protection classification is invalid');
  }
  const stringField = (key: string): string | undefined => {
    const raw = value[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string' || raw.length > WOM_MAX_ID_LENGTH) throw new WorkspaceMalformedInputError(`Protection ${key} is invalid`);
    return raw;
  };
  return {
    version: 1,
    classification: classification as WorkspaceProtectionMetadata['classification'],
    locked: value.locked === true,
    readOnly: value.readOnly === true,
    policyId: stringField('policyId'),
    sensitivityLabel: stringField('sensitivityLabel'),
    retentionPolicyId: stringField('retentionPolicyId'),
  };
}



function validateObjectMetadata(raw: unknown, objectType: string): WorkspaceObjectMetadata {
  if (raw === undefined) {
    return { ownership: objectType === 'WorkspaceReference' ? 'ExternalLive' : 'Strong' };
  }
  if (!isRecord(raw)) throw new WorkspaceMalformedInputError('Workspace object metadata must be an object');
  const allowedOwnership = ['Strong', 'ExternalLive', 'ExternalFrozen'];
  const ownership = String(raw.ownership ?? (objectType === 'WorkspaceReference' ? 'ExternalLive' : 'Strong'));
  if (!allowedOwnership.includes(ownership)) throw new WorkspaceMalformedInputError('Workspace object ownership is invalid');
  if (objectType !== 'WorkspaceReference' && ownership !== 'Strong') {
    throw new WorkspaceMalformedInputError('Owned WOM objects cannot claim external ownership');
  }
  if (raw.geometry !== undefined) {
    if (!isRecord(raw.geometry)) throw new WorkspaceMalformedInputError('Object geometry must be an object');
    for (const key of ['x', 'y', 'width', 'height'] as const) assertFiniteNumber(raw.geometry[key], `Geometry ${key}`);
    if (Number(raw.geometry.width) < 0 || Number(raw.geometry.height) < 0) throw new WorkspaceMalformedInputError('Geometry dimensions cannot be negative');
    if (raw.geometry.rotationDeg !== undefined) assertFiniteNumber(raw.geometry.rotationDeg, 'Geometry rotation');
  }
  if (raw.accessibility !== undefined) {
    if (!isRecord(raw.accessibility)) throw new WorkspaceMalformedInputError('Accessibility metadata must be an object');
    if (raw.accessibility.readingOrder !== undefined) {
      assertFiniteNumber(raw.accessibility.readingOrder, 'Accessibility reading order');
      if (!Number.isInteger(raw.accessibility.readingOrder) || raw.accessibility.readingOrder < 0) throw new WorkspaceMalformedInputError('Accessibility reading order is invalid');
    }
  }
  if (raw.provenance !== undefined) {
    if (!isRecord(raw.provenance)) throw new WorkspaceMalformedInputError('Provenance metadata must be an object');
    for (const key of ['sourceDocumentId', 'sourceObjectId', 'createdBy'] as const) {
      const id = raw.provenance[key];
      if (id !== undefined) assertStableWorkspaceId(String(id), `Provenance ${key}`);
    }
    if (raw.provenance.sourceVersion !== undefined) {
      assertFiniteNumber(raw.provenance.sourceVersion, 'Provenance source version');
      if (!Number.isInteger(raw.provenance.sourceVersion) || raw.provenance.sourceVersion < 0) throw new WorkspaceMalformedInputError('Provenance source version is invalid');
    }
  }
  if (raw.links !== undefined) {
    if (!Array.isArray(raw.links) || raw.links.length > MAX_LINKS_PER_OBJECT) throw new WorkspaceMalformedInputError('Object link limit exceeded');
    for (const link of raw.links) {
      if (!isRecord(link) || typeof link.uri !== 'string' || typeof link.relation !== 'string') throw new WorkspaceMalformedInputError('Object link is invalid');
      if (link.uri.startsWith('vgt://workspace/')) parseWorkspaceObjectUri(link.uri);
      else if (link.uri.length > 4096) throw new WorkspaceMalformedInputError('Object link URI is too long');
    }
  }
  return raw as WorkspaceObjectMetadata;
}



function assertNoExecutableCorePayload(value: unknown, depth = 0): void {
  if (depth > 32) throw new WorkspaceMalformedInputError('Core payload depth limit exceeded');
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) assertNoExecutableCorePayload(child, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_EXECUTABLE_KEYS.has(key)) throw new WorkspaceMalformedInputError(`Executable core field ${key} is forbidden`);
    assertNoExecutableCorePayload(child, depth + 1);
  }
}



interface WorkspaceIdentityTombstone {
  id: string;
  tombstone: true;
  deleted_at: number;
  author_signature: string;
  payload: null;
}



const TOMBSTONE_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;



function readTombstoneRecords(document: WorkspaceDocument): Map<string, WorkspaceIdentityTombstone | null> {
  const extension = document.wom_extensions?.[WOM_IDENTITY_EXTENSION];
  if (extension === undefined) return new Map();
  if (!isRecord(extension) || !Array.isArray(extension.tombstones) || extension.tombstones.length > MAX_TOMBSTONES) {
    throw new WorkspaceMalformedInputError('WOM identity tombstone state is invalid');
  }
  const tombstones = new Map<string, WorkspaceIdentityTombstone | null>();
  for (const raw of extension.tombstones) {
    // Legacy v2 documents stored only the retired id. They remain readable but all new deletions use signed metadata records.
    if (typeof raw === 'string') {
      assertStableWorkspaceId(raw, 'Tombstoned object id');
      if (tombstones.has(raw)) throw new WorkspaceMalformedInputError('Duplicate WOM identity tombstone');
      tombstones.set(raw, null);
      continue;
    }
    if (!isRecord(raw) || raw.tombstone !== true || raw.payload !== null || typeof raw.id !== 'string' ||
        typeof raw.deleted_at !== 'number' || !Number.isFinite(raw.deleted_at) || raw.deleted_at < 0 ||
        typeof raw.author_signature !== 'string' || !TOMBSTONE_SIGNATURE_PATTERN.test(raw.author_signature)) {
      throw new WorkspaceMalformedInputError('WOM identity tombstone record is invalid');
    }
    const allowedKeys = new Set(['id', 'tombstone', 'deleted_at', 'author_signature', 'payload']);
    if (Object.keys(raw).some((key) => !allowedKeys.has(key))) throw new WorkspaceMalformedInputError('WOM tombstone contains forbidden payload fields');
    assertStableWorkspaceId(raw.id, 'Tombstoned object id');
    if (tombstones.has(raw.id)) throw new WorkspaceMalformedInputError('Duplicate WOM identity tombstone');
    tombstones.set(raw.id, {
      id: raw.id, tombstone: true, deleted_at: raw.deleted_at, author_signature: raw.author_signature, payload: null,
    });
  }
  return tombstones;
}



export function readTombstones(document: WorkspaceDocument): Set<string> {
  return new Set(readTombstoneRecords(document).keys());
}



export function writeTombstone(document: WorkspaceDocument, objectId: string, deletedAt: number, authorSignature: string): void {
  assertFiniteNumber(deletedAt, 'Tombstone deletion timestamp');
  if (deletedAt < 0) throw new WorkspaceMalformedInputError('Tombstone deletion timestamp is invalid');
  if (!TOMBSTONE_SIGNATURE_PATTERN.test(authorSignature)) throw new WorkspaceMalformedInputError('Tombstone author signature is invalid');
  const tombstones = readTombstoneRecords(document);
  tombstones.set(objectId, { id: objectId, tombstone: true, deleted_at: deletedAt, author_signature: authorSignature, payload: null });
  if (tombstones.size > MAX_TOMBSTONES) throw new WorkspaceMalformedInputError('WOM identity tombstone limit exceeded');
  const records = [...tombstones.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, record]) => record ?? id);
  document.wom_extensions = {
    ...(document.wom_extensions ?? {}),
    [WOM_IDENTITY_EXTENSION]: { tombstones: records },
  };
}



function validateSharedFamily(objectId: string, type: string, data: Record<string, unknown>, document?: WorkspaceDocument): void {
  switch (type) {
    case 'TextBlock': {
      if (!Array.isArray(data.paragraphs) || data.paragraphs.length > MAX_PARAGRAPHS_PER_TEXT_BLOCK) throw new WorkspaceMalformedInputError('TextBlock paragraph limit exceeded');
      const ids = new Set<string>();
      for (const paragraph of data.paragraphs) {
        if (!isRecord(paragraph) || typeof paragraph.id !== 'string' || !Array.isArray(paragraph.spans) || !isRecord(paragraph.style)) throw new WorkspaceMalformedInputError('TextBlock paragraph is invalid');
        assertStableWorkspaceId(paragraph.id, 'Paragraph id');
        if (ids.has(paragraph.id)) throw new WorkspaceMalformedInputError('Duplicate paragraph id');
        ids.add(paragraph.id);
        for (const numeric of ['line_height', 'space_before', 'space_after'] as const) {
          if (paragraph.style[numeric] !== undefined) assertFiniteNumber(paragraph.style[numeric], `Paragraph ${numeric}`);
        }
      }
      break;
    }
    case 'Table': {
      if (!Number.isInteger(data.rows) || !Number.isInteger(data.cols) || Number(data.rows) < 0 || Number(data.cols) < 0 || Number(data.rows) > 1_000_000 || Number(data.cols) > 100_000) throw new WorkspaceMalformedInputError('Table dimensions are invalid');
      if (!isRecord(data.cells) || Object.keys(data.cells).length > MAX_TABLE_CELLS) throw new WorkspaceMalformedInputError('Table cell limit exceeded');
      break;
    }
    case 'Shape': {
      for (const key of ['x', 'y', 'width', 'height', 'rotation', 'stroke_width'] as const) assertFiniteNumber(data[key], `Shape ${key}`);
      if (Number(data.width) < 0 || Number(data.height) < 0 || Number(data.stroke_width) < 0) throw new WorkspaceMalformedInputError('Shape geometry is invalid');
      break;
    }
    case 'Chart': {
      if (!Array.isArray(data.categories) || !Array.isArray(data.series)) throw new WorkspaceMalformedInputError('Chart data is invalid');
      let points = 0;
      for (const series of data.series) {
        if (!isRecord(series) || !Array.isArray(series.values)) throw new WorkspaceMalformedInputError('Chart series is invalid');
        points += series.values.length;
        if (points > MAX_CHART_POINTS) throw new WorkspaceMalformedInputError('Chart point limit exceeded');
        for (const value of series.values) assertFiniteNumber(value, 'Chart value');
      }
      break;
    }
    case 'MediaAsset': {
      if (typeof data.mime !== 'string' || data.mime.length < 1 || data.mime.length > 255) throw new WorkspaceMalformedInputError('MediaAsset mime is invalid');
      assertFiniteNumber(data.byteLength, 'MediaAsset byteLength');
      if (!Number.isInteger(data.byteLength) || data.byteLength < 0 || data.byteLength > WOM_MAX_BINARY_ASSET_BYTES) throw new WorkspaceMalformedInputError('MediaAsset byteLength exceeds policy');
      if (typeof data.sha256 !== 'string' || !SHA256_HEX_PATTERN.test(data.sha256)) throw new WorkspaceMalformedInputError('MediaAsset sha256 is invalid');
      if (data.storage === 'container-chunk') {
        if (typeof data.chunkId !== 'string') throw new WorkspaceMalformedInputError('MediaAsset container chunk id is missing');
        assertStableWorkspaceId(data.chunkId, 'MediaAsset chunk id');
      } else if (data.storage === 'external-capability') {
        if (typeof data.capabilityUri !== 'string' || data.capabilityUri.length > 4096) throw new WorkspaceMalformedInputError('MediaAsset capability URI is invalid');
      } else throw new WorkspaceMalformedInputError('MediaAsset storage mode is invalid');
      for (const forbidden of ['dataBase64', 'base64', 'bytes', 'blob']) if (forbidden in data) throw new WorkspaceMalformedInputError('Binary assets must use manifested chunks/capabilities, not inline blobs');
      break;
    }
    case 'CommentReview': {
      if (typeof data.targetUri !== 'string') throw new WorkspaceMalformedInputError('CommentReview target URI is missing');
      parseWorkspaceObjectUri(data.targetUri);
      if (data.status !== 'open' && data.status !== 'resolved') throw new WorkspaceMalformedInputError('CommentReview status is invalid');
      if (!Array.isArray(data.comments) || data.comments.length > MAX_COMMENTS_PER_THREAD) throw new WorkspaceMalformedInputError('CommentReview comment limit exceeded');
      const ids = new Set<string>();
      for (const raw of data.comments) {
        if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.body !== 'string') throw new WorkspaceMalformedInputError('CommentReview entry is invalid');
        assertStableWorkspaceId(raw.id, 'Comment id');
        if (ids.has(raw.id)) throw new WorkspaceMalformedInputError('Duplicate comment id');
        ids.add(raw.id);
        if (raw.body.length > MAX_COMMENT_BODY) throw new WorkspaceMalformedInputError('Comment body exceeds limit');
        assertFiniteNumber(raw.createdAt, 'Comment timestamp');
      }
      break;
    }
    case 'WorkItemRef': {
      if (typeof data.workItemId !== 'string') throw new WorkspaceMalformedInputError('WorkItemRef workItemId is missing');
      assertStableWorkspaceId(data.workItemId, 'Canonical work item id');
      const allowedKeys = new Set(['id', 'workItemId', 'common']);
      const shadowKeys = Object.keys(data).filter((key) => !allowedKeys.has(key));
      if (shadowKeys.length > 0) throw new WorkspaceMalformedInputError('WorkItemRef must not contain shadow task payload');
      if (document?.workManagementData && !document.workManagementData.tasks.some((task) => task.id === data.workItemId)) {
        throw new WorkspaceMalformedInputError(`WorkItemRef ${objectId} points to unknown canonical work item`);
      }
      break;
    }
    case 'DataRecord': {
      if (!isRecord(data.fields) || Object.keys(data.fields).length > MAX_DATA_RECORD_FIELDS) throw new WorkspaceMalformedInputError('DataRecord field limit exceeded');
      for (const [key, value] of Object.entries(data.fields)) {
        if (!key || key.length > 256) throw new WorkspaceMalformedInputError('DataRecord field name is invalid');
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new WorkspaceMalformedInputError('DataRecord fields must be scalar');
        if (typeof value === 'number' && !Number.isFinite(value)) throw new WorkspaceMalformedInputError('DataRecord number must be finite');
        if (typeof value === 'string' && value.length > WOM_MAX_INLINE_METADATA_BYTES) throw new WorkspaceMalformedInputError('DataRecord string exceeds inline metadata limit');
      }
      break;
    }
    case 'PolicyMetadata': {
      assertNamespace(data.namespace, 'Policy namespace');
      if (typeof data.policyVersion !== 'number' || !Number.isInteger(data.policyVersion) || data.policyVersion < 1) throw new WorkspaceMalformedInputError('Policy version is invalid');
      if (!isRecord(data.values) || Object.keys(data.values).length > MAX_POLICY_FIELDS) throw new WorkspaceMalformedInputError('Policy field limit exceeded');
      assertNoExecutableCorePayload(data.values);
      break;
    }
    case 'ExtensionObject': {
      assertNamespace(data.namespace);
      if (typeof data.family !== 'string' || data.family.length < 1 || data.family.length > MAX_EXTENSION_FAMILY_LENGTH) throw new WorkspaceMalformedInputError('Extension object family is invalid');
      if (jsonByteLength(data.payload) > WOM_MAX_EXTENSION_BYTES) throw new WorkspaceMalformedInputError('Extension object payload exceeds limit');
      assertNoExecutableCorePayload(data.payload);
      break;
    }
  }
}



export function validateTypedObject(
  objectId: string,
  raw: unknown,
  options: { allowUnknownObject?: boolean; document?: WorkspaceDocument } = {},
): void {
  if (!isRecord(raw) || typeof raw.type !== 'string' || !isRecord(raw.data)) {
    throw new WorkspaceMalformedInputError(`Object ${objectId} does not match the typed WOM envelope`);
  }
  const dataId = raw.data.id;
  if (typeof dataId !== 'string' || dataId !== objectId) throw new WorkspaceMalformedInputError(`Object ${objectId} identity mismatch`);
  assertStableWorkspaceId(dataId, 'Object data id');
  if (!KNOWN_OBJECT_TYPES.has(raw.type)) {
    if (!options.allowUnknownObject) throw new WorkspaceUnsupportedContentError(`Unsupported WOM object type ${raw.type}`);
    if (raw.type.length > 192 || jsonByteLength(raw) > WOM_MAX_EXTENSION_BYTES) throw new WorkspaceMalformedInputError('Future WOM object exceeds preservation limits');
    return;
  }
  const meta = validateObjectMetadata(raw.data.common, raw.type);
  if (raw.type === 'WorkspaceReference') {
    if (typeof raw.data.uri !== 'string') throw new WorkspaceMalformedInputError('WorkspaceReference uri is missing');
    parseWorkspaceObjectUri(raw.data.uri);
    if (raw.data.mode !== 'Live' && raw.data.mode !== 'Frozen') throw new WorkspaceMalformedInputError('WorkspaceReference mode is invalid');
    const expectedOwnership = raw.data.mode === 'Live' ? 'ExternalLive' : 'ExternalFrozen';
    if (meta.ownership !== expectedOwnership) throw new WorkspaceMalformedInputError('WorkspaceReference ownership/mode mismatch');
    if (raw.data.expected_type !== undefined && (typeof raw.data.expected_type !== 'string' || raw.data.expected_type.length > 192)) throw new WorkspaceMalformedInputError('WorkspaceReference expected type is invalid');
    if (raw.data.fabric_status !== undefined && !['current', 'changed', 'broken', 'unavailable', 'permission-lost', 'frozen'].includes(String(raw.data.fabric_status))) {
      throw new WorkspaceMalformedInputError('WorkspaceReference status is invalid');
    }
    if (raw.data.permission_state !== undefined && !['allowed', 'denied', 'unknown'].includes(String(raw.data.permission_state))) throw new WorkspaceMalformedInputError('WorkspaceReference permission state is invalid');
    if (raw.data.fallback_policy !== undefined && raw.data.fallback_policy !== 'allowed' && raw.data.fallback_policy !== 'forbidden') throw new WorkspaceMalformedInputError('WorkspaceReference fallback policy is invalid');
    if (raw.data.fallback_snapshot !== undefined && raw.data.fallback_policy !== 'allowed') throw new WorkspaceMalformedInputError('WorkspaceReference fallback snapshot is not policy-authorized');
    for (const key of ['source_version', 'resolved_source_version', 'frozen_at'] as const) {
      const value = raw.data[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new WorkspaceMalformedInputError(`WorkspaceReference ${key} is invalid`);
    }
    if (raw.data.source_snapshot_id !== undefined) {
      if (typeof raw.data.source_snapshot_id !== 'string') throw new WorkspaceMalformedInputError('WorkspaceReference source snapshot id is invalid');
      assertStableWorkspaceId(raw.data.source_snapshot_id, 'WorkspaceReference source snapshot id');
    }
    if (raw.data.permission_provenance !== undefined) {
      if (!isRecord(raw.data.permission_provenance) || typeof raw.data.permission_provenance.source_document_id !== 'string') throw new WorkspaceMalformedInputError('WorkspaceReference permission provenance is invalid');
      assertStableWorkspaceId(raw.data.permission_provenance.source_document_id, 'Permission provenance source document id');
      const policyVersion = raw.data.permission_provenance.source_policy_version;
      if (policyVersion !== undefined && (typeof policyVersion !== 'number' || !Number.isInteger(policyVersion) || policyVersion < 1)) throw new WorkspaceMalformedInputError('WorkspaceReference permission provenance policy version is invalid');
      const role = raw.data.permission_provenance.source_role_ceiling;
      if (role !== undefined && !['owner','editor','commenter','viewer'].includes(String(role))) throw new WorkspaceMalformedInputError('WorkspaceReference permission role ceiling is invalid');
      const explicitSnapshot = raw.data.permission_provenance.snapshot_explicitly_embedded;
      if (explicitSnapshot !== undefined && typeof explicitSnapshot !== 'boolean') throw new WorkspaceMalformedInputError('WorkspaceReference snapshot provenance is invalid');
      if (raw.data.mode === 'Live' && raw.data.cached_snapshot !== undefined && explicitSnapshot !== true) throw new WorkspaceMalformedInputError('Live WorkspaceReference may not carry an implicit source snapshot');
    } else if (raw.data.mode === 'Live' && raw.data.cached_snapshot !== undefined) {
      throw new WorkspaceMalformedInputError('Live WorkspaceReference snapshot lacks explicit provenance');
    }
    if (raw.data.fallback_snapshot !== undefined) validateTypedObject(String((raw.data.fallback_snapshot as { data?: { id?: unknown } })?.data?.id ?? ''), raw.data.fallback_snapshot, { allowUnknownObject: options.allowUnknownObject });
    if (raw.data.cached_snapshot !== undefined) validateTypedObject(String((raw.data.cached_snapshot as { data?: { id?: unknown } })?.data?.id ?? ''), raw.data.cached_snapshot, { allowUnknownObject: options.allowUnknownObject });
    return;
  }
  validateSharedFamily(objectId, raw.type, raw.data, options.document);
}



export function normalizeKnownObjectEnvelope(raw: unknown): unknown {
  if (!isRecord(raw) || typeof raw.type !== 'string' || !isRecord(raw.data) || !KNOWN_OBJECT_TYPES.has(raw.type)) return raw;
  if (raw.type === 'WorkspaceReference') {
    const existingCommon = isRecord(raw.data.common) ? raw.data.common : {};
    const ownership = raw.data.mode === 'Frozen' ? 'ExternalFrozen' : 'ExternalLive';
    const provenance = isRecord(raw.data.permission_provenance) ? raw.data.permission_provenance : undefined;
    const explicitSnapshot = raw.data.mode === 'Frozen' || provenance?.snapshot_explicitly_embedded === true;
    const preservedSnapshot = explicitSnapshot ? (raw.data.fallback_snapshot ?? raw.data.cached_snapshot) : undefined;
    return {
      ...raw,
      data: {
        ...raw.data,
        cached_snapshot: explicitSnapshot ? raw.data.cached_snapshot : undefined,
        permission_state: raw.data.permission_state ?? 'unknown',
        fallback_snapshot: preservedSnapshot,
        fallback_policy: preservedSnapshot !== undefined ? 'allowed' : 'forbidden',
        permission_provenance: provenance ? { ...provenance, snapshot_explicitly_embedded: explicitSnapshot } : provenance,
        common: { ...existingCommon, ownership },
      },
    };
  }
  // Legacy core families retain their established wire shape. New shared families carry `common` explicitly.
  return raw;
}



export function normalizeExtensionNamespaces(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new WorkspaceMalformedInputError('WOM extension namespace container must be an object');
  const entries = Object.entries(value);
  if (entries.length > WOM_MAX_EXTENSION_NAMESPACES) throw new WorkspaceMalformedInputError('WOM extension namespace count exceeded');
  const out: Record<string, unknown> = {};
  for (const [namespace, payload] of entries) {
    assertNamespace(namespace);
    if (jsonByteLength(payload) > WOM_MAX_EXTENSION_BYTES) throw new WorkspaceMalformedInputError(`WOM extension ${namespace} exceeds limit`);
    assertNoExecutableCorePayload(payload);
    out[namespace] = cloneJson(payload);
  }
  return out;
}
