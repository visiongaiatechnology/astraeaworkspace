// STATUS: DIAMANT VGT SUPREME — WOM document migration, invariant, and canonical persistence boundary
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WOM_MIN_READABLE_SCHEMA_VERSION, WOM_SCHEMA_VERSION } from '../../../shared/contracts/wom/workspaceWom';
import { INFINITY_PINNED_COMMIT, INFINITY_SUITE, normalizeSecurityProfile } from '../../security/securityProfiles';
import { parseHostileJson } from '../../../shared/security/hostileJson';
import { WorkspaceMalformedInputError, WorkspaceObjectModelError, WorkspaceUnsupportedContentError, WorkspaceValidationError, MAX_SERIALIZE_DEPTH, MAX_SERIALIZED_DOCUMENT_BYTES, MAX_TITLE_LENGTH, assertFiniteNumber, assertStableWorkspaceId, cloneJson, isRecord, refuseWorkspaceInput, rejectDuplicateJsonObjectKeys, workspaceStorageRefusal } from './workspaceObjectModelPrimitives';
import { normalizeExtensionNamespaces, normalizeKnownObjectEnvelope, normalizePermissions, normalizeProtection, readTombstones, validateTypedObject } from './workspaceObjectModelValidation';


const MAX_OBJECTS = 100_000;


const MAX_ROOTS = 100_000;


const FORBIDDEN_PERSISTED_UI_KEYS = new Set(['__uiState', '$uiState', 'transientUiState', 'runtimeUiState']);


const LEGACY_V1_OBJECT_TYPES = new Set(['TextBlock', 'Table', 'Shape', 'Chart', 'WorkspaceReference']);


const KNOWN_DOCUMENT_KINDS = new Set(['Writer','Grid','Present','Notes','PdfStudio','Draw','Whiteboard','Forms','Database','Publish','Insight','Tasks','Planner','Projects','Vault','Spaces','Connect','Automate','AdminPolicy','GaiaCom']);



function canonicalJsonBytes(value: unknown): Uint8Array {
  const encoded = JSON.stringify(canonicalizeJson(value));
  if (encoded === undefined) throw new WorkspaceMalformedInputError('Unsupported payload cannot be canonicalized');
  return new TextEncoder().encode(encoded);
}



function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}



/**
 * Clone-only forward-compatibility boundary. Unsupported payload is never interpreted or
 * normalized; its canonical JSON byte representation must survive the preservation copy exactly.
 */
export function preserveUnsupportedPayload<T>(payload: T): T {
  const before = canonicalJsonBytes(payload);
  const preserved = cloneJson(payload);
  const after = canonicalJsonBytes(preserved);
  if (!equalBytes(before, after)) throw workspaceStorageRefusal('WOM_UNSUPPORTED_PAYLOAD_COPY_CHANGED', 'Unsupported payload preservation changed bytes');
  return preserved;
}



/**
 * **W-456** — the legacy alias `workData` is *migrated*, never discarded. Three measured shapes, three
 * answers, and none of them is a silent loss:
 *   1. `workData` present, canonical field unusable  -> the alias becomes the canonical payload (unchanged
 *      behaviour, the one direction that always worked).
 *   2. `workData` present, canonical field a record  -> the two are compared **byte-wise over their
 *      canonical JSON**. Identical payloads mean the canonical field already carries every input value, so
 *      dropping the alias loses nothing (this is the shape both real callers write:
 *      `apps/notes/notebooks/useNotesManager.ts:145` and
 *      `apps/pdf/integrations/pdfWorkspaceConversions.ts:207` put the *same* payload into both fields).
 *      Divergent payloads have **no defined merge rule** — merging would invent a second semantic and pick
 *      a winner silently — so the document is refused by name instead.
 *   3. `workData` present but not a record         -> refused by name; a present payload is never deleted
 *      without replacement and without a reason.
 */
function migrateLegacyWorkData(next: Record<string, unknown>): void {
  const legacy = next.workData;
  if (legacy === undefined) return;
  if (!isRecord(legacy)) {
    throw refuseWorkspaceInput(
      'WOM_LEGACY_WORKDATA_UNUSABLE',
      'Legacy workData is present but is not a work-management record; a present legacy payload is never discarded, so migrate it explicitly to workManagementData before persistence.',
    );
  }
  const canonical = next.workManagementData;
  if (isRecord(canonical)) {
    if (!equalBytes(canonicalJsonBytes(legacy), canonicalJsonBytes(canonical))) {
      throw refuseWorkspaceInput(
        'WOM_LEGACY_WORKDATA_DIVERGES',
        'Legacy workData and canonical workManagementData carry different work-management payloads; there is no defined merge rule, so the document is refused instead of dropping the legacy payload silently.',
      );
    }
  } else {
    next.workManagementData = cloneJson(legacy);
  }
  delete next.workData;
}



function migrateV1ToV2(document: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...document, schema_version: 2 };
  migrateLegacyWorkData(next);
  next.protection = normalizeProtection(next.protection);
  next.wom_extensions = normalizeExtensionNamespaces(next.wom_extensions);
  if (isRecord(next.objects)) next.objects = Object.fromEntries(Object.entries(next.objects).map(([id, object]) => [id, normalizeKnownObjectEnvelope(object)]));
  return next;
}



/**
 * Forward migration is clone-first, deterministic and idempotent. Any failure occurs before the caller's input is mutated.
 * Future schemas remain field-for-field preserved at the storage boundary and are never silently downgraded.
 */
export function migrateWorkspaceDocument(input: unknown): WorkspaceDocument {
  if (!isRecord(input)) throw new WorkspaceMalformedInputError('Workspace document must be an object');
  let working: Record<string, unknown> = cloneJson(input);
  const sourceVersion = typeof working.schema_version === 'number' && Number.isInteger(working.schema_version)
    ? working.schema_version
    : WOM_MIN_READABLE_SCHEMA_VERSION;
  if (sourceVersion < WOM_MIN_READABLE_SCHEMA_VERSION) throw new WorkspaceUnsupportedContentError('Workspace schema is too old');
  if (sourceVersion > WOM_SCHEMA_VERSION) {
    const preserved = preserveUnsupportedPayload(working);
    validateWorkspaceDocumentInvariants(preserved as unknown as WorkspaceDocument, { allowFutureSchema: true });
    return preserved as unknown as WorkspaceDocument;
  }
  if (sourceVersion === 1) working = migrateV1ToV2(working);
  if (working.permissions !== undefined) working.permissions = normalizePermissions(working.permissions);
  if (typeof working.schema_version !== 'number') working.schema_version = WOM_SCHEMA_VERSION;
  working.protection = normalizeProtection(working.protection);
  working.wom_extensions = normalizeExtensionNamespaces(working.wom_extensions);
  if (isRecord(working.objects)) working.objects = Object.fromEntries(Object.entries(working.objects).map(([id, object]) => [id, normalizeKnownObjectEnvelope(object)]));
  const rawPolicy = isRecord(working.securityPolicy) ? working.securityPolicy : {};
  const profile = normalizeSecurityProfile(rawPolicy.profile);
  // **W-457** — provenance is *carried*, never invented. A missing `infinity_*` stays missing and is refused
  // by the guard in `validateWorkspaceDocumentInvariants`: an absent value is not a match, and it becomes a
  // claim the moment this boundary fills it. The previous `|| INFINITY_SUITE` default made every
  // `{profile:'VGT_TOP_SECRET'}` document claim the pinned suite and commit it never proved.
  const carriedProvenance = profile === 'VGT_TOP_SECRET'
    ? {
      ...(typeof rawPolicy.infinity_suite === 'string' ? { infinity_suite: rawPolicy.infinity_suite } : {}),
      ...(typeof rawPolicy.infinity_commit === 'string' ? { infinity_commit: rawPolicy.infinity_commit } : {}),
    }
    : {};
  working.securityPolicy = {
    profile,
    inherited_from_workspace: rawPolicy.inherited_from_workspace === true,
    downgrade_authorized: rawPolicy.downgrade_authorized === true,
    ...carriedProvenance,
  };
  validateWorkspaceDocumentInvariants(working as unknown as WorkspaceDocument, { allowFutureSchema: false });
  return working as unknown as WorkspaceDocument;
}



/** Explicit downgrade policy. Lossy schema downgrade is rejected instead of silently deleting fields. */
export function downgradeWorkspaceDocument(document: WorkspaceDocument, targetVersion: 1 | 2): Record<string, unknown> {
  const current = migrateWorkspaceDocument(document);
  if (targetVersion === WOM_SCHEMA_VERSION) return canonicalizeJson(current) as Record<string, unknown>;
  if (targetVersion !== 1) throw new WorkspaceUnsupportedContentError(`Unsupported WOM downgrade target ${targetVersion}`);
  if (Object.keys(current.wom_extensions ?? {}).length > 0) throw new WorkspaceUnsupportedContentError('WOM extensions prevent lossless v1 downgrade');
  if (Object.values(current.objects).some((object) => !LEGACY_V1_OBJECT_TYPES.has(object.type))) throw new WorkspaceUnsupportedContentError('New WOM object families prevent lossless v1 downgrade');
  const protection = normalizeProtection(current.protection);
  if (protection.classification !== 'standard' || protection.locked || protection.readOnly || protection.policyId || protection.sensitivityLabel || protection.retentionPolicyId) {
    throw new WorkspaceUnsupportedContentError('Protection metadata prevents lossless v1 downgrade');
  }
  const legacy = canonicalizeJson(current) as Record<string, unknown>;
  legacy.schema_version = 1;
  if (legacy.workManagementData !== undefined) legacy.workData = legacy.workManagementData;
  delete legacy.workManagementData;
  delete legacy.protection;
  delete legacy.wom_extensions;
  if (isRecord(legacy.objects)) legacy.objects = Object.fromEntries(Object.entries(legacy.objects).map(([id, raw]) => {
    if (!isRecord(raw)) return [id, raw];
    const copy = { ...raw };
    if (isRecord(copy.data)) {
      const data = { ...copy.data };
      delete data.common;
      copy.data = data;
    }
    if (copy.type === 'WorkspaceReference' && isRecord(copy.data)) {
      const data = { ...copy.data };
      delete data.permission_state;
      delete data.fallback_snapshot;
      delete data.fallback_policy;
      copy.data = data;
    }
    return [id, copy];
  }));
  return legacy;
}



export function validateWorkspaceDocumentInvariants(
  document: WorkspaceDocument,
  options: { allowFutureSchema?: boolean } = {},
): void {
  if (!document || typeof document !== 'object') throw new WorkspaceMalformedInputError('Workspace document missing');
  assertNoUiOnlyPersistentTruth(document);
  assertStableWorkspaceId(document.id, 'Document id');
  if (!KNOWN_DOCUMENT_KINDS.has(document.kind)) throw new WorkspaceMalformedInputError('Workspace document kind is invalid');
  if (typeof document.title !== 'string' || !document.title.trim() || document.title.length > MAX_TITLE_LENGTH) throw new WorkspaceMalformedInputError('Workspace title is invalid');
  assertFiniteNumber(document.created_at, 'Document created_at');
  assertFiniteNumber(document.modified_at, 'Document modified_at');
  if (document.created_at < 0 || document.modified_at < document.created_at) throw new WorkspaceMalformedInputError('Document timestamps are invalid');
  if (!Number.isInteger(document.version) || document.version < 1) throw new WorkspaceMalformedInputError('Document version is invalid');
  const schemaVersion = document.schema_version ?? WOM_MIN_READABLE_SCHEMA_VERSION;
  if (!Number.isInteger(schemaVersion) || schemaVersion < WOM_MIN_READABLE_SCHEMA_VERSION) throw new WorkspaceMalformedInputError('Workspace schema version is invalid');
  if (!options.allowFutureSchema && schemaVersion > WOM_SCHEMA_VERSION) throw new WorkspaceUnsupportedContentError('Workspace schema is newer than this client');
  if (schemaVersion <= WOM_SCHEMA_VERSION) {
    normalizeProtection(document.protection);
    normalizeExtensionNamespaces(document.wom_extensions);
  }
  if (!Array.isArray(document.root_object_ids) || document.root_object_ids.length > MAX_ROOTS) throw new WorkspaceMalformedInputError('Root object limit exceeded');
  if (!isRecord(document.objects) || Object.keys(document.objects).length > MAX_OBJECTS) throw new WorkspaceMalformedInputError('Object limit exceeded');
  const roots = new Set<string>();
  for (const id of document.root_object_ids) {
    assertStableWorkspaceId(id, 'Root object id');
    if (roots.has(id)) throw new WorkspaceMalformedInputError(`Duplicate root object id ${id}`);
    roots.add(id);
    if (!(id in document.objects)) throw new WorkspaceMalformedInputError(`Root object ${id} is missing`);
  }
  const tombstones = readTombstones(document);
  for (const [id, object] of Object.entries(document.objects)) {
    assertStableWorkspaceId(id, 'Object id');
    if (tombstones.has(id)) throw new WorkspaceMalformedInputError(`Live object ${id} reuses a tombstoned identity`);
    validateTypedObject(id, object, { allowUnknownObject: schemaVersion > WOM_SCHEMA_VERSION && options.allowFutureSchema === true, document });
  }
  if (schemaVersion <= WOM_SCHEMA_VERSION) {
    normalizePermissions((document as WorkspaceDocument & { permissions?: unknown }).permissions);
  }
  const securityProfile = normalizeSecurityProfile(document.securityPolicy?.profile);
  if (securityProfile === 'VGT_TOP_SECRET') {
    const suite = document.securityPolicy?.infinity_suite;
    const commit = document.securityPolicy?.infinity_commit;
    // **W-457 ①** — the *missing* case is refused first, and it is a security refusal: an unproven origin
    // claim is never a match and is never filled in. Without this branch the guard only ever saw the wrong
    // value, because the normalization had already replaced the absent one with the pinned claim.
    if (typeof suite !== 'string' || suite.length === 0 || typeof commit !== 'string' || commit.length === 0) {
      throw refuseWorkspaceInput(
        'SEC_TS_PROVENANCE_ABSENT',
        'A VGT_TOP_SECRET document carries no pinned Infinity suite provenance; an absent origin is never accepted as a match and is never filled in by the persistence boundary.',
      );
    }
    // **W-457 ②** — a present but different value keeps its existing, verbatim refusal: unchanged, not rebuilt.
    if (suite !== INFINITY_SUITE || commit !== INFINITY_PINNED_COMMIT) throw new WorkspaceValidationError('Top Secret Infinity suite provenance mismatch');
  }
  // **W-456 (dritte Ausprägung, gemessen)** — the guard tests *presence*, not truthiness: a stored
  // `"workData": null` passed the old `if (document.workData)` and survived into the canonical bytes as a
  // legacy alias. `undefined` (a key without a value) is not a legacy payload and canonical JSON drops it.
  if (document.workData !== undefined) throw new WorkspaceValidationError('Legacy workData must be migrated to canonical workManagementData before persistence');
  assertCanonicalWorkItemSharing(document);
}



function assertNoUiOnlyPersistentTruth(value: unknown, depth = 0, seen = new WeakSet<object>()): void {
  if (depth > MAX_SERIALIZE_DEPTH) throw new WorkspaceMalformedInputError('Persistent WOM depth limit exceeded');
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value as object)) throw new WorkspaceMalformedInputError('Cyclic values cannot be persisted in WOM');
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const item of value) assertNoUiOnlyPersistentTruth(item, depth + 1, seen);
    seen.delete(value);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PERSISTED_UI_KEYS.has(key) || key.startsWith('__ui') || key.startsWith('$ui')) throw new WorkspaceMalformedInputError(`UI-only field ${key} cannot be persisted in WOM`);
    assertNoUiOnlyPersistentTruth(child, depth + 1, seen);
  }
  seen.delete(value as object);
}



function canonicalizeJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_SERIALIZE_DEPTH) throw new WorkspaceMalformedInputError('Serialization depth limit exceeded');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new WorkspaceMalformedInputError('Non-finite number cannot be serialized');
    return value;
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new WorkspaceMalformedInputError('Unsupported persistent value in Workspace document');
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item, depth + 1));
  if (!isRecord(value)) throw new WorkspaceMalformedInputError('Unsupported persistent object');
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (FORBIDDEN_PERSISTED_UI_KEYS.has(key) || key.startsWith('__ui') || key.startsWith('$ui')) throw new WorkspaceMalformedInputError(`UI-only field ${key} cannot be persisted in WOM`);
    if (value[key] === undefined) continue;
    out[key] = canonicalizeJson(value[key], depth + 1);
  }
  return out;
}



export function serializeWorkspaceDocumentCanonical(document: WorkspaceDocument, signal?: AbortSignal): string {
  if (signal?.aborted) throw new WorkspaceObjectModelError('Workspace serialization cancelled');
  const migrated = migrateWorkspaceDocument(document);
  validateWorkspaceDocumentInvariants(migrated, { allowFutureSchema: true });
  const serialized = JSON.stringify(canonicalizeJson(migrated));
  if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_DOCUMENT_BYTES) throw new WorkspaceMalformedInputError('Serialized Workspace document exceeds size limit');
  if (signal?.aborted) throw new WorkspaceObjectModelError('Workspace serialization cancelled');
  return serialized;
}



export function deserializeWorkspaceDocumentCanonical(serialized: string, signal?: AbortSignal): WorkspaceDocument {
  if (signal?.aborted) throw new WorkspaceObjectModelError('Workspace deserialization cancelled');
  if (typeof serialized !== 'string' || serialized.length < 2 || new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_DOCUMENT_BYTES) throw new WorkspaceMalformedInputError('Serialized Workspace document size is invalid');
  rejectDuplicateJsonObjectKeys(serialized);
  let parsed: unknown;
  try { parsed = parseHostileJson(serialized, { maxBytes: MAX_SERIALIZED_DOCUMENT_BYTES, maxDepth: MAX_SERIALIZE_DEPTH, maxNodes: 4_000_000, maxStringChars: MAX_SERIALIZED_DOCUMENT_BYTES, maxObjectKeys: 1_000_000, maxArrayItems: 1_000_000 }); }
  catch { throw new WorkspaceMalformedInputError('Serialized Workspace document is not valid bounded JSON'); }
  if (signal?.aborted) throw new WorkspaceObjectModelError('Workspace deserialization cancelled');
  return migrateWorkspaceDocument(parsed);
}



export function assertCanonicalWorkItemSharing(document: WorkspaceDocument): void {
  const work = document.workManagementData;
  if (work === undefined) return;
  if (!isRecord(work) || !Array.isArray(work.tasks) || !Array.isArray(work.cards)) {
    throw new WorkspaceMalformedInputError('Canonical work-management tasks and cards must be arrays');
  }
  const ids = new Set<string>();
  for (const task of work.tasks) {
    if (!isRecord(task) || typeof task.id !== 'string') throw new WorkspaceMalformedInputError('Canonical work item entry is invalid');
    assertStableWorkspaceId(task.id, 'Canonical work item id');
    if (ids.has(task.id)) throw new WorkspaceMalformedInputError('Canonical work item ids must be unique');
    ids.add(task.id);
  }
  for (const card of work.cards) {
    if (!isRecord(card)) throw new WorkspaceMalformedInputError('Planner card entry is invalid');
    if (card.linkedTaskId !== undefined && typeof card.linkedTaskId !== 'string') throw new WorkspaceMalformedInputError('Planner card linked task id is invalid');
    if (card.linkedTaskId && !ids.has(card.linkedTaskId)) throw new WorkspaceMalformedInputError('Planner card references an unknown canonical task');
  }
}
