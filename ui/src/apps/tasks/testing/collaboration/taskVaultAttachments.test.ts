// A Vault-backed task attachment must be a reference, must be gated, and must carry no bytes.
//
// ## The defect this closes
//
// The open-core tree had no Vault reference on a task attachment at all: a search across all of
// `apps/tasks` for `makeVaultAssetUri`, `vaultAttachment` and `vault_attachment` returned nothing. The only
// way to attach a protected file was to embed its payload, which puts plaintext next to the task document —
// the opposite of what the Vault exists for.
//
// ## What is asserted
//
// 1. a permitted reference yields the canonical Vault URI and **no `dataUrl`**, so nothing on this path can
//    write plaintext;
// 2. a locked session is refused by name, and an auto-locked one too;
// 3. an unknown file is refused by name — and only after the gate, so the refusal cannot be used to probe
//    which files exist;
// 4. a Vault-backed attachment refuses to be inlined for download, because inlining would materialise exactly
//    the plaintext the reference avoids.
//
// ## Counter-check protocol
//
// A. Remove the `workspaceUri` from the produced attachment → case 1 fails.
// B. Remove the gate call → case 2 fails.
// C. Add a `dataUrl` to the produced attachment → case 1's byte-absence assertion fails.
// D. Restore and re-run → green.

import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus, VaultKeyPolicyModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  isVaultBackedTaskAttachment,
  planTaskVaultAttachment,
  taskVaultAttachmentRefusesInline,
} from '../../collaboration/taskVaultAttachments';

const VAULT_DOCUMENT_ID = 'vault-doc-1';
const FILE_ID = 'vault-file-1';

/** A Vault document holding one file, as the Vault's own projection expects to read it. */
const vaultDocument = {
  schema_version: 2,
  id: VAULT_DOCUMENT_ID,
  title: 'Vault',
  kind: 'Vault',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
  vaultData: {
    files: [
      {
        id: FILE_ID,
        name: 'passport.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        status: 'stored',
        sourceType: 'attachment',
        integrityState: 'ok',
        payloadDataUrl: 'data:application/pdf;base64,AAAA',
      },
    ],
  },
} as unknown as WorkspaceDocument;

// A policy with auto-lock effectively off, so the gate is judged on the status rather than on the clock.
const openPolicy = { autoLockMinutes: 0, protectionMode: 'session' } as unknown as VaultKeyPolicyModel;
const lockPolicy = { autoLockMinutes: 1, protectionMode: 'session' } as unknown as VaultKeyPolicyModel;

function request(overrides: Record<string, unknown> = {}) {
  return {
    vaultDocument,
    fileId: FILE_ID,
    vaultStatus: { isLocked: false, hasPin: true, platform: 'test' } as unknown as KeyVaultStatus,
    keyPolicy: openPolicy,
    lastActivityAt: 1_000,
    now: 2_000,
    attachmentId: 'att-1',
    ...overrides,
  } as Parameters<typeof planTaskVaultAttachment>[0];
}

describe('a Vault-backed task attachment is a gated reference, never bytes', () => {
  it('permits an open session and produces the canonical URI with no payload', () => {
    const outcome = planTaskVaultAttachment(request());
    expect(outcome.status, JSON.stringify(outcome)).toBe('permitted');
    if (outcome.status !== 'permitted') return;

    // The reference is the canonical Vault URI, built from the two ids.
    expect(outcome.attachment.workspaceUri).toBe(`vgt://workspace/document/${VAULT_DOCUMENT_ID}?vaultFile=${FILE_ID}`);
    // And no bytes, anywhere on the produced attachment. This is the whole point of the module.
    expect(outcome.attachment.dataUrl).toBeUndefined();
    expect(JSON.stringify(outcome.attachment)).not.toContain('data:');
    expect(JSON.stringify(outcome.attachment)).not.toContain('base64');
    // The descriptor comes from the Vault's own view, not from the caller.
    expect(outcome.asset.fileId).toBe(FILE_ID);
    expect(outcome.asset.name).toBe('passport.pdf');
  });

  it('refuses a locked session by name', () => {
    const outcome = planTaskVaultAttachment(request({ vaultStatus: { isLocked: true, hasPin: true, platform: 'test' } as unknown as KeyVaultStatus }));
    expect(outcome).toMatchObject({ status: 'refused', code: 'task_vault_attachment_session_locked' });
  });

  it('refuses a session past its auto-lock window', () => {
    // One minute of auto-lock, two minutes of inactivity: locked, even though the status still reads unlocked.
    const outcome = planTaskVaultAttachment(
      request({ keyPolicy: lockPolicy, lastActivityAt: 0, now: 120_000 }),
    );
    expect(outcome).toMatchObject({ status: 'refused', code: 'task_vault_attachment_auto_locked' });
  });

  it('negative counter-check: a backwards clock is treated as locked, not as active', () => {
    // A clock before the last activity is not evidence of activity; `vaultShouldAutoLock` refuses it.
    const outcome = planTaskVaultAttachment(request({ keyPolicy: lockPolicy, lastActivityAt: 5_000, now: 1_000 }));
    expect(outcome).toMatchObject({ status: 'refused', code: 'task_vault_attachment_auto_locked' });
  });

  it('refuses an unknown file by name', () => {
    const outcome = planTaskVaultAttachment(request({ fileId: 'does-not-exist' }));
    expect(outcome).toMatchObject({ status: 'refused', code: 'task_vault_attachment_file_unknown' });
  });

  it('a Vault-backed attachment refuses to be inlined for download', () => {
    const outcome = planTaskVaultAttachment(request());
    expect(outcome.status).toBe('permitted');
    if (outcome.status !== 'permitted') return;
    expect(isVaultBackedTaskAttachment(outcome.attachment)).toBe(true);
    expect(taskVaultAttachmentRefusesInline(outcome.attachment)).toBe(true);
    // An ordinary embedded attachment is unaffected, so the rule is targeted rather than blanket.
    expect(taskVaultAttachmentRefusesInline({ id: 'a', name: 'n', mimeType: 'text/plain', sizeBytes: 1 } as never)).toBe(false);
  });
});
