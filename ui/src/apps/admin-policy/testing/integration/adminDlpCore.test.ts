import { describe, expect, it } from 'vitest';
import { verifyAuditTrail } from '../../compliance/adminAuditCore';
import { updateDlpDefaultAction } from '../../policies/adminDlpCore';
import { DEFAULT_ADMIN_POLICY_MODEL } from '../../model/types';

describe('DLP default action mutation', () => {
  it('requires policy write authority and appends a verifiable audit event', async () => {
    const next = await updateDlpDefaultAction(DEFAULT_ADMIN_POLICY_MODEL, 'block', 'local-owner', 1_800_000_000_000);

    expect(next.dlp.defaultAction).toBe('block');
    expect(next.audit.events.at(-1)).toMatchObject({
      actor: 'local-owner',
      action: 'dlp.default-action.update',
      objectClass: 'dlp-policy',
      result: 'change',
    });
    expect(await verifyAuditTrail(next.audit)).toMatchObject({ ok: true, lastSequence: 1 });

    const readOnly = {
      ...DEFAULT_ADMIN_POLICY_MODEL,
      roles: DEFAULT_ADMIN_POLICY_MODEL.roles.map((role) => role.id === 'role-system'
        ? { ...role, capabilities: role.capabilities.filter((capability) => capability !== 'policy.write') }
        : role),
    };
    await expect(updateDlpDefaultAction(readOnly, 'audit')).rejects.toThrow('admin-rbac-denied');
  });

  it('rejects an out-of-contract action before changing policy state', async () => {
    await expect(updateDlpDefaultAction(DEFAULT_ADMIN_POLICY_MODEL, 'execute' as never)).rejects.toThrow('admin-dlp-action-invalid');
  });
});
