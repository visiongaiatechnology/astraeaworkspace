// STATUS: DIAMANT VGT SUPREME — Canonical Version / Autosave / Recovery invariants
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { securityPolicyForDocument } from '../security/securityProfiles';

export const VERSION_RECOVERY_LIMITS = Object.freeze({
  maxVersionsPerDocument: 128,
  maxRecoverySnapshotsPerDocument: 8,
  /**
   * W-230: recovery snapshots were the only durable series without an **age** bound — `selectRecoveryRetention`
   * knew count (8) and bytes (a magic `256 * 1024 * 1024` in its body) but kept a snapshot forever. A crash
   * marker is insurance for the session that just ended; 30 days is far past any plausible "I want it back"
   * and turns "grows until the next save happens to clean it" into a named policy. The bound is enforced where
   * all three dimensions are enforced (the retention selection), not on the read path — see the note there.
   */
  maxRecoverySnapshotAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxRecoverySnapshotBytesPerDocument: 256 * 1024 * 1024,
  maxVersionAgeMs: 180 * 24 * 60 * 60 * 1000,
  maxVersionBytesPerDocument: 512 * 1024 * 1024,
  maxLabelChars: 96,
  maxOpaqueIdChars: 160,
  maxReasonChars: 128,
  maxCompareFields: 32,
  maxFailureCodeChars: 64,
});

export type AutosavePhase = 'clean' | 'dirty' | 'saving' | 'failed';
export interface AutosaveState {
  phase: AutosavePhase;
  mutationRevision: number;
  persistedRevision: number;
  inFlightRevision: number | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  failureCode: string | null;
}

export function initialAutosaveState(now: number | null = null): AutosaveState {
  return { phase: 'clean', mutationRevision: 0, persistedRevision: 0, inFlightRevision: null, lastAttemptAt: now, lastSuccessAt: now, failureCode: null };
}

export function markAutosaveDirty(state: AutosaveState): AutosaveState {
  const mutationRevision = state.mutationRevision + 1;
  return { ...state, mutationRevision, phase: state.inFlightRevision === null ? 'dirty' : 'saving', failureCode: null };
}

export function beginAutosave(state: AutosaveState, now = Date.now()): AutosaveState {
  if (state.mutationRevision <= state.persistedRevision) return { ...state, phase: 'clean', inFlightRevision: null, failureCode: null };
  return { ...state, phase: 'saving', inFlightRevision: state.mutationRevision, lastAttemptAt: now, failureCode: null };
}

function boundedFailureCode(raw: string): string {
  const normalized = raw.trim().toUpperCase().replace(/[^A-Z0-9_.-]+/g, '_').slice(0, VERSION_RECOVERY_LIMITS.maxFailureCodeChars);
  return normalized || 'SAVE_FAILED';
}

export function finishAutosave(state: AutosaveState, success: boolean, now = Date.now(), failureCode = 'SAVE_FAILED'): AutosaveState {
  const target = state.inFlightRevision;
  if (target === null) return state;
  if (!success) {
    return { ...state, phase: 'failed', inFlightRevision: null, lastAttemptAt: now, failureCode: boundedFailureCode(failureCode) };
  }
  const persistedRevision = Math.max(state.persistedRevision, target);
  const stillDirty = state.mutationRevision > persistedRevision;
  return {
    ...state,
    persistedRevision,
    phase: stillDirty ? 'dirty' : 'clean',
    inFlightRevision: null,
    lastAttemptAt: now,
    lastSuccessAt: now,
    failureCode: null,
  };
}

export interface DurableVersionDescriptor {
  id: string;
  createdAt: number;
  encryptedBytes: number;
  documentVersion: number;
  protectionProfile: string;
  labelDigest?: string;
}

export interface VersionRetentionPolicy {
  maxCount: number;
  maxAgeMs: number;
  maxBytes: number;
}

export const DEFAULT_VERSION_RETENTION: Readonly<VersionRetentionPolicy> = Object.freeze({
  maxCount: VERSION_RECOVERY_LIMITS.maxVersionsPerDocument,
  maxAgeMs: VERSION_RECOVERY_LIMITS.maxVersionAgeMs,
  maxBytes: VERSION_RECOVERY_LIMITS.maxVersionBytesPerDocument,
});

export function normalizeVersionRetention(policy: Partial<VersionRetentionPolicy> = {}): VersionRetentionPolicy {
  return {
    maxCount: Math.max(1, Math.min(512, Math.trunc(policy.maxCount ?? DEFAULT_VERSION_RETENTION.maxCount))),
    maxAgeMs: Math.max(60_000, Math.min(5 * 365 * 24 * 60 * 60 * 1000, Math.trunc(policy.maxAgeMs ?? DEFAULT_VERSION_RETENTION.maxAgeMs))),
    maxBytes: Math.max(1 * 1024 * 1024, Math.min(4 * 1024 * 1024 * 1024, Math.trunc(policy.maxBytes ?? DEFAULT_VERSION_RETENTION.maxBytes))),
  };
}

export function selectRetainedVersions(
  records: readonly DurableVersionDescriptor[],
  now = Date.now(),
  policy: Partial<VersionRetentionPolicy> = {},
): { keep: string[]; remove: string[]; retainedBytes: number } {
  const p = normalizeVersionRetention(policy);
  const ordered = records
    .filter((record) => record.id.length > 0 && record.id.length <= VERSION_RECOVERY_LIMITS.maxOpaqueIdChars && Number.isFinite(record.createdAt) && Number.isFinite(record.encryptedBytes))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  let bytes = 0;
  const keep: string[] = [];
  const remove: string[] = [];
  for (const record of ordered) {
    const expired = now - record.createdAt > p.maxAgeMs;
    const size = Math.max(0, Math.trunc(record.encryptedBytes));
    const overCount = keep.length >= p.maxCount;
    const overBytes = bytes + size > p.maxBytes;
    if (expired || overCount || overBytes) remove.push(record.id);
    else { keep.push(record.id); bytes += size; }
  }
  return { keep, remove, retainedBytes: bytes };
}

export interface VersionComparison {
  sameIdentity: boolean;
  sameKind: boolean;
  sourceVersion: number;
  targetVersion: number;
  sourceModifiedAt: number;
  targetModifiedAt: number;
  protectionChanged: boolean;
  changedObjectCount: number;
  addedObjectCount: number;
  removedObjectCount: number;
}

export function compareWorkspaceVersionMetadata(source: WorkspaceDocument, target: WorkspaceDocument): VersionComparison {
  const sourceIds = new Set(Object.keys(source.objects ?? {}));
  const targetIds = new Set(Object.keys(target.objects ?? {}));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const id of targetIds) if (!sourceIds.has(id)) added += 1;
  for (const id of sourceIds) if (!targetIds.has(id)) removed += 1;
  for (const id of sourceIds) {
    if (!targetIds.has(id)) continue;
    if (JSON.stringify(source.objects[id]) !== JSON.stringify(target.objects[id])) changed += 1;
  }
  return {
    sameIdentity: source.id === target.id,
    sameKind: source.kind === target.kind,
    sourceVersion: source.version,
    targetVersion: target.version,
    sourceModifiedAt: source.modified_at,
    targetModifiedAt: target.modified_at,
    protectionChanged: securityPolicyForDocument(source).profile !== securityPolicyForDocument(target).profile,
    changedObjectCount: changed,
    addedObjectCount: added,
    removedObjectCount: removed,
  };
}

export type VersionRestoreMode = 'new-document' | 'replace-current';
export function prepareVersionRestore(
  current: WorkspaceDocument,
  snapshot: WorkspaceDocument,
  mode: VersionRestoreMode,
  options: { confirmedReplace?: boolean; newDocumentId?: string; now?: number } = {},
): WorkspaceDocument {
  if (current.kind !== snapshot.kind) throw new Error('VERSION_KIND_MISMATCH');
  if (securityPolicyForDocument(current).profile !== securityPolicyForDocument(snapshot).profile) throw new Error('VERSION_PROTECTION_MISMATCH');
  const now = options.now ?? Date.now();
  if (mode === 'replace-current') {
    if (!options.confirmedReplace) throw new Error('VERSION_REPLACE_CONFIRMATION_REQUIRED');
    return { ...structuredClone(snapshot), id: current.id, title: current.title, modified_at: now, version: Math.max(current.version, snapshot.version) + 1 };
  }
  const newDocumentId = options.newDocumentId?.trim() ?? '';
  if (!newDocumentId || newDocumentId.length > 256 || /[\u0000-\u001f]/.test(newDocumentId)) throw new Error('VERSION_NEW_DOCUMENT_ID_INVALID');
  return { ...structuredClone(snapshot), id: newDocumentId, title: `${snapshot.title} (restored)`.slice(0, 256), created_at: now, modified_at: now, version: 1 };
}

export interface RecoveryRetentionCandidate { id: string; createdAt: number; encryptedBytes: number; }

export interface RecoveryRetentionPolicy {
  maxCount: number;
  maxAgeMs: number;
  maxBytes: number;
}

/**
 * W-230: the three retention dimensions of a recovery snapshot series, named in one place. The numbers used to
 * live in the body of `selectRecoveryRetention` (bytes) and in `VERSION_RECOVERY_LIMITS` (count) with no age at
 * all, so nothing could state — or test — what the policy was.
 */
export const DEFAULT_RECOVERY_RETENTION: Readonly<RecoveryRetentionPolicy> = Object.freeze({
  maxCount: VERSION_RECOVERY_LIMITS.maxRecoverySnapshotsPerDocument,
  maxAgeMs: VERSION_RECOVERY_LIMITS.maxRecoverySnapshotAgeMs,
  maxBytes: VERSION_RECOVERY_LIMITS.maxRecoverySnapshotBytesPerDocument,
});

/** Clamped like `normalizeVersionRetention`, so a caller cannot widen the policy past the hard ceiling. */
export function normalizeRecoveryRetention(policy: Partial<RecoveryRetentionPolicy> = {}): RecoveryRetentionPolicy {
  return {
    maxCount: Math.max(1, Math.min(64, Math.trunc(policy.maxCount ?? DEFAULT_RECOVERY_RETENTION.maxCount))),
    maxAgeMs: Math.max(60_000, Math.min(5 * 365 * 24 * 60 * 60 * 1000, Math.trunc(policy.maxAgeMs ?? DEFAULT_RECOVERY_RETENTION.maxAgeMs))),
    maxBytes: Math.max(1 * 1024 * 1024, Math.min(4 * 1024 * 1024 * 1024, Math.trunc(policy.maxBytes ?? DEFAULT_RECOVERY_RETENTION.maxBytes))),
  };
}

/**
 * Decides which encrypted recovery snapshots **of one document** survive: newest first, then the first failure
 * of `maxAgeMs`, `maxCount` or `maxBytes` ends the series. Everything after that failure is removed — including
 * the records it decided to drop — so the series cannot grow past the policy on any dimension.
 *
 * A record whose id or numbers cannot be trusted is removed rather than kept: being unable to reason about a
 * record is not a reason to store it forever.
 *
 * `now` is the caller's clock on purpose (the same value the new snapshot is stamped with), so a test can pin
 * the age decision instead of racing the wall clock.
 */
export function selectRecoveryRetention(
  records: readonly RecoveryRetentionCandidate[],
  now = Date.now(),
  policy: Partial<RecoveryRetentionPolicy> = {},
): { keep: string[]; remove: string[]; retainedBytes: number } {
  const bounded = normalizeRecoveryRetention(policy);
  const ordered = records.slice().sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const keep: string[] = [];
  const remove: string[] = [];
  let total = 0;
  for (const record of ordered) {
    const trusted = record.id.length > 0 && record.id.length <= VERSION_RECOVERY_LIMITS.maxOpaqueIdChars
      && Number.isFinite(record.createdAt) && Number.isFinite(record.encryptedBytes) && record.encryptedBytes >= 0;
    if (!trusted) {
      remove.push(record.id);
      continue;
    }
    const bytes = Math.max(0, Math.trunc(record.encryptedBytes));
    const expired = now - record.createdAt > bounded.maxAgeMs;
    if (expired || keep.length >= bounded.maxCount || total + bytes > bounded.maxBytes) remove.push(record.id);
    else { keep.push(record.id); total += bytes; }
  }
  return { keep, remove, retainedBytes: total };
}

export type RecoveryFailureKind = 'disk-full' | 'permission-denied' | 'interrupted-write' | 'truncated-container' | 'bad-authentication-tag' | 'stale-lock' | 'duplicate-save';
export interface FailureInjectionResult { kind: RecoveryFailureKind; originalPreserved: boolean; dirtyPreserved: boolean; replacementCommitted: boolean; }
export function modelFailureInvariant(kind: RecoveryFailureKind): FailureInjectionResult {
  return { kind, originalPreserved: true, dirtyPreserved: true, replacementCommitted: false };
}

export type RecoveryPlatform = 'windows' | 'linux' | 'macos' | 'astraeaos';
export interface AtomicPersistenceContract {
  platform: RecoveryPlatform;
  ciphertextTempOnly: true;
  tempWrite: true;
  fileSync: true;
  atomicReplace: true;
  parentDirectorySync: boolean;
  preserveLastKnownGoodUntilReplace: true;
}
export function atomicPersistenceContract(platform: RecoveryPlatform): AtomicPersistenceContract {
  return {
    platform,
    ciphertextTempOnly: true,
    tempWrite: true,
    fileSync: true,
    atomicReplace: true,
    parentDirectorySync: platform !== 'windows',
    preserveLastKnownGoodUntilReplace: true,
  };
}

export function assertVersionRecoveryPublicId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > VERSION_RECOVERY_LIMITS.maxOpaqueIdChars || /[\u0000-\u001f]/.test(normalized)) throw new Error(`${label.toUpperCase().replace(/\s+/g, '_')}_INVALID`);
  return normalized;
}

export interface DocumentSaveLease { documentId: string; token: string; acquiredAt: number; expiresAt: number; }
export class DocumentSaveLeaseManager {
  private readonly leases = new Map<string, DocumentSaveLease>();
  constructor(private readonly idFactory: () => string = () => globalThis.crypto.randomUUID()) {}

  acquire(documentId: string, now = Date.now(), ttlMs = 30_000): DocumentSaveLease {
    const id = assertVersionRecoveryPublicId(documentId, 'document id');
    const boundedTtl = Math.max(1_000, Math.min(120_000, Math.trunc(ttlMs)));
    const existing = this.leases.get(id);
    if (existing && existing.expiresAt > now) throw new Error('SAVE_ALREADY_IN_PROGRESS');
    const lease = { documentId: id, token: this.idFactory(), acquiredAt: now, expiresAt: now + boundedTtl };
    this.leases.set(id, lease);
    return { ...lease };
  }

  release(lease: DocumentSaveLease): void {
    const current = this.leases.get(lease.documentId);
    if (current?.token === lease.token) this.leases.delete(lease.documentId);
  }

  active(documentId: string, now = Date.now()): boolean {
    const current = this.leases.get(documentId);
    if (!current) return false;
    if (current.expiresAt <= now) { this.leases.delete(documentId); return false; }
    return true;
  }
}

export const workspaceSaveLeaseManager = new DocumentSaveLeaseManager();
