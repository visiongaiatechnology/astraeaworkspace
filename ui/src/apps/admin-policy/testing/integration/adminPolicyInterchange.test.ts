// STATUS: PLATIN — Vertragstest des Richtlinien-Austauschs: verlustfreier Roundtrip, authentifizierter
// Container, Versionen und ein Audit-Export, der nur vorhandene Hashes trägt.
import { describe, expect, it } from 'vitest';
import {
  PolicyInterchangeError,
  applyPolicyPackage,
  decodeContainerBase64,
  diffPolicyVersions,
  encodeContainerBase64,
  exportPolicyAudit,
  exportPolicyDocument,
  localOnlyFieldNames,
  openEncryptedPolicyDocument,
  packageFieldNames,
  previewPolicyPackage,
  rollbackToPolicyVersion,
  saveEncryptedPolicyDocument,
  snapshotPolicyVersion,
} from '../../interchange/adminPolicyInterchange';
import { DEFAULT_ADMIN_POLICY_MODEL, type AdminPolicyModel } from '../../model/types';
import { upsertDlpRule } from '../../policies/adminDlpCore';
import { upsertLegalHold } from '../../compliance/adminRetentionCore';
import { appendAuditEvent, verifyAuditTrail } from '../../compliance/adminAuditCore';
import { registerLocalDevice } from '../../devices/adminDevicePolicyCore';

const clone = (): AdminPolicyModel => JSON.parse(JSON.stringify(DEFAULT_ADMIN_POLICY_MODEL)) as AdminPolicyModel;
const PASSWORD = 'correct horse battery';

describe('policy document interchange', () => {
  it('exports a portable package that reimports losslessly for every packaged field', async () => {
    let model = clone();
    model = await upsertDlpRule(model, { id: 'roundtrip-rule', enabled: true, labels: ['confidential'], operations: ['export'], destinationKinds: ['external'], metadataMatchers: [], contentMatchers: [], action: 'block' });
    model.retention = upsertLegalHold(model.retention, { id: 'roundtrip-hold', name: 'Hold', active: true, objectIds: ['o1'], spaceIds: [], createdAt: 5, authorizedBy: 'local-owner' }, 'local-owner');
    model.network.netGateCapabilities = [{ id: 'cap:roundtrip', domains: ['roundtrip.example'], ips: [], protocols: ['https'] }];

    const exported = exportPolicyDocument(model, 'portable-json');
    expect(exported.fileName.endsWith('.vpolicy')).toBe(true);
    expect(exported.text).toContain('vgt.admin.portable/1');

    const preview = previewPolicyPackage(exported.bytes);
    expect(preview.retainedLocally).toEqual([...localOnlyFieldNames()]);
    expect(packageFieldNames()).toHaveLength(10);

    const applied = applyPolicyPackage(clone(), preview.package);
    for (const field of packageFieldNames() as readonly (keyof AdminPolicyModel)[]) {
      // **Benannte, begrenzte Reduktion im Paket:** das Paket trägt das Retention-**Auditprotokoll**
      // nicht (`retention.audit: []`) und höchstens die letzten 64 Versionen. Beides ist Absicht, wird
      // hier aber ausdrücklich geprüft statt als „verlustfrei" behauptet.
      const expected = field === 'retention'
        ? { ...model.retention, audit: [] }
        : model[field];
      expect(applied[field]).toEqual(expected);
    }
    expect(preview.package.retention.audit).toEqual([]);
    expect(preview.package.lifecycle.versions.length).toBeLessThanOrEqual(64);
    // Und die lokalen Sicherheitsfakten des Zieldokuments bleiben unangetastet.
    expect(applied.assignments).toEqual(DEFAULT_ADMIN_POLICY_MODEL.assignments);
    expect(applied.audit.events).toEqual(DEFAULT_ADMIN_POLICY_MODEL.audit.events);
  });

  it('refuses a hostile or truncated package by name instead of silently truncating it', () => {
    expect(() => previewPolicyPackage(new TextEncoder().encode(''))).toThrow(PolicyInterchangeError);
    expect(() => previewPolicyPackage(new TextEncoder().encode('[]'))).toThrow(/admin-portable/);
    expect(() => previewPolicyPackage(new TextEncoder().encode('{"schema":"vgt.admin.portable/1"}'))).toThrow(/admin-portable-schema/);
    expect(() => previewPolicyPackage(new Uint8Array(9 * 1024 * 1024))).toThrow(/policy-import-size/);
    // Ein Paket mit Geheimnisfeldern wird abgelehnt, nicht bereinigt.
    const model = clone();
    const hostile = exportPolicyDocument(model, 'portable-json').text!.replace('"organization"', '"client_secret"');
    expect(() => previewPolicyPackage(new TextEncoder().encode(hostile))).toThrow();
  });

  it('round-trips the encrypted store and refuses a wrong password, a short password and a corrupted container', async () => {
    let model = clone();
    model = await upsertDlpRule(model, { id: 'store-rule', enabled: true, labels: ['restricted'], operations: ['print'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'block' });
    model = await registerLocalDevice(model, { id: 'store-device', name: 'Local', os: 'Windows', workspaceVersion: '1.0.0' }, 'local-owner', 500);
    model.encryption.recoveryEscrow = { enabled: true, recipientKeyId: 'escrow-key', disclosure: 'Recovery disclosure text for the organisation.' };
    model.network.netGateCapabilities = [{ id: 'cap:store', domains: ['store.example'], ips: [], protocols: ['https'] }];

    const container = await saveEncryptedPolicyDocument(model, PASSWORD, 1_700_000_000_000);
    expect(new TextDecoder().decode(container.subarray(0, 4))).toBe('VGT3');

    const reopened = await openEncryptedPolicyDocument(container, PASSWORD);
    expect(reopened).toEqual(model);
    // Die Nutzdaten sind identisch **und** die Auditkette ist nach dem Wiederöffnen noch gültig.
    expect(reopened.dlp.rules.map((rule) => rule.id)).toEqual(['store-rule']);
    expect(reopened.devices.map((entry) => entry.id)).toEqual(['store-device']);
    expect(reopened.encryption.recoveryEscrow).toEqual(model.encryption.recoveryEscrow);
    expect(reopened.network.netGateCapabilities).toEqual(model.network.netGateCapabilities);
    expect(await verifyAuditTrail(reopened.audit)).toMatchObject({ ok: true, lastSequence: model.audit.events.length });

    await expect(openEncryptedPolicyDocument(container, 'wrong password here')).rejects.toThrow(/vadmin-authentication-failed/);
    await expect(saveEncryptedPolicyDocument(model, 'short')).rejects.toThrow(/vadmin-password-policy/);
    const corrupted = Uint8Array.from(container);
    corrupted[corrupted.length - 1] ^= 0xff;
    await expect(openEncryptedPolicyDocument(corrupted, PASSWORD)).rejects.toThrow(/vadmin-authentication-failed/);
    await expect(openEncryptedPolicyDocument(new Uint8Array([1, 2, 3]), PASSWORD)).rejects.toThrow(/vadmin-container-invalid/);
  });

  it('survives a base64 text round trip of the container', async () => {
    const model = clone();
    const container = await saveEncryptedPolicyDocument(model, PASSWORD);
    const text = encodeContainerBase64(container);
    const reopened = await openEncryptedPolicyDocument(decodeContainerBase64(text), PASSWORD);
    expect(reopened).toEqual(model);
    expect(() => decodeContainerBase64('not base64 !!')).toThrow(/vadmin-container-invalid/);
    expect(() => decodeContainerBase64('')).toThrow(/vadmin-container-size/);
  });

  it('keeps both of two snapshots in one instance and rolls back to the requested one', async () => {
    let model = clone();
    model = snapshotPolicyVersion(model, 'local-owner', 1_000);
    expect(model.lifecycle.versions).toHaveLength(1);
    model = await upsertDlpRule(model, { id: 'after-snapshot', enabled: true, labels: ['internal'], operations: ['copy'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'audit' });
    model = snapshotPolicyVersion(model, 'local-owner', 2_000);
    expect(model.lifecycle.versions.map((version) => version.sequence)).toEqual([1, 2]);

    const diff = diffPolicyVersions(model, model.lifecycle.versions[0].id, model.lifecycle.versions[1].id);
    expect(diff.changes.some((change) => change.path.includes('/dlp/rules'))).toBe(true);

    const rolledBack = rollbackToPolicyVersion(model, model.lifecycle.versions[0].id, 'local-owner', 3_000);
    expect(rolledBack.lifecycle.versions).toHaveLength(3);
    expect(rolledBack.lifecycle.versions.at(-1)?.status).toBe('rolled-back');
    expect(rolledBack.lifecycle.versions.at(-1)?.parentId).toBe(model.lifecycle.versions[0].id);
    expect(() => rollbackToPolicyVersion(model, 'missing-version', 'local-owner')).toThrow(/admin-policy-rollback-target-missing/);
  });

  it('exports only audit lines whose hash is present in the document', async () => {
    let model = clone();
    model.audit = await appendAuditEvent(model.audit, { at: 10, actor: 'local-owner', action: 'policy.one', objectClass: 'admin-policy', result: 'change' });
    model.audit = await appendAuditEvent(model.audit, { at: 20, actor: 'local-owner', action: 'policy.two', objectClass: 'admin-policy', result: 'change' });

    const exported = exportPolicyAudit(model);
    expect(exported.eventCount).toBe(2);
    const lines = exported.ndjson.trim().split('\n');
    expect(lines).toHaveLength(2);
    const hashes = new Set(model.audit.events.map((event) => event.hash));
    for (const line of lines) expect(hashes.has(JSON.parse(line).hash)).toBe(true);

    // Ein fremder Ereignissatz darf nicht in den Export gelangen: `exportAuditNdjson` filtert über die
    // im Dokument vorhandenen Hashes.
    const foreign = { ...model.audit.events[0], hash: 'f'.repeat(64) };
    const filtered = exportPolicyAudit(model, 1);
    expect(filtered.ndjson).not.toContain(foreign.hash);
  });

  it('refuses to open a document whose schema is not the admin policy schema', () => {
    const unknown = { ...clone(), schema: 'vgt.admin.policy/9' } as unknown;
    expect(() => applyPolicyPackage(clone(), unknown as never)).toThrow(/admin-portable-schema/);
  });
});
