// STATUS: DIAMANT VGT SUPREME — Tasks attachments that reference a Vault file instead of embedding bytes.
//
// ## Why this module exists
//
// The delivered tree carried this capability; the open-core tree did not. A search across all of
// `open-core/ui/src/apps/tasks` for `makeVaultAssetUri`, `vaultAttachment` and `vault_attachment` returned
// nothing, so a task attachment in Open Core could only ever embed its payload. That is a security problem,
// not a missing convenience: an embedded payload is plaintext next to the task document, and the requirement
// is that a protected file is **referenced**, with the Vault serving it under its own gate.
//
// The module is built on the open-core tree's own contracts rather than copied from the delivered tree,
// because the two disagree: the delivered tree's `TaskAttachment` comes from `shared/contracts/workspace` and
// its sharing vocabulary from `apps/tasks/sharing/taskSharing.ts`, while the open-core tree's comes from
// `shared/contracts/work-management/workspaceWorkTasks.ts`. The contract here *does* already carry the
// `workspaceUri` slot, so the reference has a place to live; what was missing was the code that fills it and
// the permission check around it.
//
// ## The two rules this module enforces
//
// 1. **No bytes on this path.** A permitted reference yields a canonical Vault asset URI and the descriptor;
//    it never yields a data URL, a Blob or a temporary file. A Vault-backed task attachment therefore never
//    places plaintext beside the task document.
// 2. **Fail closed, with a name.** Every refusal returns a named code. A session gate that cannot be read is
//    a refusal, not a pass — the same rule the Vault's own policy engine follows.

import type { TaskAttachment } from '../../../shared/contracts/work-management/workspaceWork';
import type { KeyVaultStatus, VaultKeyPolicyModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { listVaultAssetsForConsumer, makeVaultAssetUri, type VaultAssetDescriptor } from '../../../platform/workspace-integration/vaultWorkspaceIntegrationEngine';
import { validateVaultUiSessionGate, vaultShouldAutoLock } from '../../../shared/vault/security/vaultKeyPolicyEngine';

/** The refusal vocabulary. Each case is distinguishable, so a surface can say what actually happened. */
export type TaskVaultAttachmentRefusal =
  | 'task_vault_attachment_gate_unreadable'
  | 'task_vault_attachment_session_locked'
  | 'task_vault_attachment_auto_locked'
  | 'task_vault_attachment_file_unknown'
  | 'task_vault_attachment_uri_unusable';

export interface TaskVaultAttachmentRefused {
  readonly status: 'refused';
  readonly code: TaskVaultAttachmentRefusal;
}

export interface TaskVaultAttachmentPermitted {
  readonly status: 'permitted';
  /** The attachment to store on the task. Carries the reference, never the payload. */
  readonly attachment: TaskAttachment;
  /** The Vault's own view of the file, so the caller can hand the reference to the Vault. */
  readonly asset: VaultAssetDescriptor;
}

export type TaskVaultAttachmentOutcome = TaskVaultAttachmentPermitted | TaskVaultAttachmentRefused;

export interface TaskVaultAttachmentRequest {
  /** The Vault document that holds the file. */
  readonly vaultDocument: WorkspaceDocument;
  /** The file inside that Vault document. */
  readonly fileId: string;
  readonly vaultStatus: KeyVaultStatus;
  readonly keyPolicy: VaultKeyPolicyModel;
  /** When the user was last active, for the auto-lock window. */
  readonly lastActivityAt: number;
  /** The clock to judge the lock against; injected so the decision stays pure and testable. */
  readonly now: number;
  readonly attachmentId: string;
  readonly createdAt?: number;
  readonly createdBy?: string;
}

function refused(code: TaskVaultAttachmentRefusal): TaskVaultAttachmentRefused {
  return Object.freeze({ status: 'refused' as const, code });
}

/**
 * Decide whether a Vault file may be referenced by a task attachment, and produce the reference if so.
 *
 * The order of the checks matters and is deliberate:
 *
 *   1. **the session gate first**, so a locked or unreadable Vault refuses before anything about the file is
 *      revealed. A refusal must not become a way to probe which files exist;
 *   2. **the file lookup second**, so an unknown file is named only to a caller who has already passed the gate.
 *
 * Nothing here reads payload bytes. `listVaultAssetsForConsumer` returns descriptors, and the descriptor's
 * `uri` is the canonical link the Vault resolves under its own permissions.
 */
export function planTaskVaultAttachment(request: TaskVaultAttachmentRequest): TaskVaultAttachmentOutcome {
  // (1) The gate first, so a locked or unreadable Vault refuses before anything about the file is revealed.
  // A refusal must not become a way to probe which files exist.
  //
  // `validateVaultUiSessionGate(policy, suppliedCredential, activeCredential, status)` validates the policy's
  // own prerequisites and the credential form; it answers by **throwing**. It is asked without a credential
  // because a task attachment may not unlock the Vault — it may only use a session that is already open.
  try {
    validateVaultUiSessionGate(request.keyPolicy, undefined, undefined, request.vaultStatus);
  } catch {
    return refused('task_vault_attachment_gate_unreadable');
  }

  // The status itself. `KeyVaultStatus` is a record rather than a state name, and `isLocked` is its own
  // answer, so it is read directly instead of being inferred from anything else.
  if (request.vaultStatus.isLocked) {
    return refused('task_vault_attachment_session_locked');
  }

  // And the auto-lock window, which is the second half of the same gate: a session past its window is locked
  // even while the status still reads unlocked. `vaultShouldAutoLock` is fail-closed for a non-finite or
  // backwards clock, so a broken time value refuses rather than passes.
  if (vaultShouldAutoLock(request.keyPolicy, request.lastActivityAt, request.now)) {
    return refused('task_vault_attachment_auto_locked');
  }

  // (2) The file, seen only through the Vault's own projection — which also withholds quarantined, corrupt and
  // missing files, so those cannot be referenced either.
  const assets = listVaultAssetsForConsumer(request.vaultDocument, 'Tasks' as never);
  const asset = assets.find((candidate: VaultAssetDescriptor) => candidate.fileId === request.fileId);
  if (!asset) return refused('task_vault_attachment_file_unknown');

  // The reference must be the canonical Vault URI, built from the two ids rather than taken on trust from
  // anything the caller supplied.
  let uri: string;
  try {
    uri = makeVaultAssetUri(asset.vaultDocumentId, asset.fileId);
  } catch {
    return refused('task_vault_attachment_uri_unusable');
  }
  if (typeof uri !== 'string' || uri.length === 0) {
    return refused('task_vault_attachment_uri_unusable');
  }

  const attachment: TaskAttachment = {
    id: request.attachmentId,
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    // The reference. Deliberately no `dataUrl`: a Vault-backed attachment must not carry bytes, so that
    // nothing writes plaintext next to the task document.
    workspaceUri: uri,
    ...(request.createdAt === undefined ? {} : { createdAt: request.createdAt }),
    ...(request.createdBy === undefined ? {} : { createdBy: request.createdBy }),
  };

  return Object.freeze({ status: 'permitted' as const, attachment, asset });
}

/**
 * Whether an attachment is Vault-backed, judged from the reference rather than from a stored flag.
 *
 * A flag could disagree with the reference; the URI cannot. This keeps the two from drifting, and it is what
 * allows a reader to refuse to inline a Vault-backed attachment.
 */
export function isVaultBackedTaskAttachment(attachment: TaskAttachment): boolean {
  return typeof attachment.workspaceUri === 'string' && attachment.workspaceUri.startsWith('vgt://workspace/document/');
}

/**
 * A Vault-backed attachment must **never** be inlined for a download, because inlining would materialise the
 * plaintext the reference exists to avoid. The caller has to route through the Vault instead.
 */
export function taskVaultAttachmentRefusesInline(attachment: TaskAttachment): boolean {
  if (!isVaultBackedTaskAttachment(attachment)) return false;
  return true;
}
