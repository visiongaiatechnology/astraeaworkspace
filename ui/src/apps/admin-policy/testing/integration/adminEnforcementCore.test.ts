// STATUS: PLATIN — Vertragstest der einen Autoritätsfunktion: fail-closed, benannt, nicht werfend,
// wirklich durchsetzend (das erzeugende Gegenstück wird bei Ablehnung **nicht** aufgerufen).
import { describe, expect, it } from 'vitest';
import {
  ADMIN_ENFORCEMENT_MATRIX,
  AdminOperationDenied,
  auditAdminOperationDecision,
  evaluateAdminOperation,
  materializeGuarded,
  requireAdminOperation,
  type AdminOperationRequest,
} from '../../enforcement/adminEnforcementCore';
import { DEFAULT_ADMIN_POLICY_MODEL, type AdminPolicyModel } from '../../model/types';
import { buildAdminWorkspaceReference } from '../../model/adminCanonicalReferenceCore';
import { upsertDlpRule, updateDlpDefaultAction } from '../../policies/adminDlpCore';
import { upsertLegalHold, upsertRetentionRule } from '../../compliance/adminRetentionCore';
import { appendAuditEvent, verifyAuditTrail } from '../../compliance/adminAuditCore';
import { evaluateAdminOperation as evaluate } from '../../enforcement/adminEnforcementCore';

const clone = (): AdminPolicyModel => JSON.parse(JSON.stringify(DEFAULT_ADMIN_POLICY_MODEL)) as AdminPolicyModel;
const scope = { kind: 'organization' as const, id: 'org-local' };
const base = (overrides: Partial<AdminOperationRequest> = {}): AdminOperationRequest => ({
  operation: 'dlp.export',
  actorId: 'local-owner',
  scope,
  subject: { objectId: 'doc-1', label: 'confidential', metadata: {}, content: 'harmless text' },
  destinationKind: 'external',
  ...overrides,
});

describe('admin enforcement authority — fail-closed and never throwing', () => {
  it('denies when the policy document is absent, unreadable or foreign-versioned instead of throwing', () => {
    for (const unusable of [null, undefined, 42, 'vpolicy', [], {}, { schema: 'vgt.admin.policy/2' }, { schema: 'vgt.admin.policy/1' }]) {
      const decision = evaluateAdminOperation(unusable, base());
      expect(decision.allowed).toBe(false);
      expect(['admin-policy-unavailable', 'admin-policy-schema-unsupported']).toContain(decision.reason);
      expect(decision.evidence.length).toBeGreaterThan(0);
    }
  });

  it('denies a malformed request and an unknown operation by name', () => {
    expect(evaluateAdminOperation(clone(), null).reason).toBe('admin-request-invalid');
    expect(evaluateAdminOperation(clone(), { operation: 'dlp.export' }).reason).toBe('admin-request-invalid');
    expect(evaluateAdminOperation(clone(), base({ operation: 'vault.destroy' as never })).reason).toBe('admin-operation-unknown');
  });

  it('denies an actor that holds no assignment at all, and allows the assigned administrator', () => {
    const denied = evaluateAdminOperation(clone(), base({ actorId: 'probe-unassigned' }));
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('admin-rbac-denied');
    expect(denied.evidence.join(' ')).toContain('capability=policy.read');

    const allowed = evaluateAdminOperation(clone(), base());
    expect(allowed.allowed).toBe(true);
  });

  it('forbids a plaintext vault export and permits the encrypted path', () => {
    const plaintext = evaluateAdminOperation(clone(), base({ operation: 'vault.export.plaintext', destinationKind: 'file' }));
    expect(plaintext.allowed).toBe(false);
    expect(plaintext.reason).toBe('admin-vault-plaintext-export-forbidden');
    expect(plaintext.policyId).toBe('POL-ENC-NATIVE-ONLY');

    const encrypted = evaluateAdminOperation(clone(), base({ operation: 'vault.export.encrypted', destinationKind: 'local-encrypted' }));
    expect(encrypted.allowed).toBe(true);
  });

  it('refuses to interpret an encryption policy that no longer enforces native encryption', () => {
    const weakened = clone();
    weakened.encryption.requireNativeEncryption = false as never;
    const decision = evaluateAdminOperation(weakened, base({ operation: 'vault.export.encrypted', destinationKind: 'local-encrypted' }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('admin-encryption-policy-unenforceable');
  });

  it('hard-denies telemetry and remote content from the network policy, not from a display flag', () => {
    const telemetry = evaluateAdminOperation(clone(), { operation: 'network.telemetry', actorId: 'local-owner', scope, connector: { capabilityId: 'cap', host: 'example.com', protocol: 'https', purpose: 'telemetry' } });
    expect(telemetry.allowed).toBe(false);
    expect(telemetry.reason).toBe('admin-telemetry-hard-disabled');

    const remote = evaluateAdminOperation(clone(), { operation: 'network.remote-content', actorId: 'local-owner', scope, connector: { capabilityId: 'cap', host: 'example.com', protocol: 'https', purpose: 'remote-content' } });
    expect(remote.allowed).toBe(false);
    expect(remote.reason).toBe('admin-network-denied');
    expect(remote.detail).toBe('remote-content-default-deny');
  });

  it('requires elevated authorization for an egress change and reports the refusal by name', () => {
    const denied = evaluateAdminOperation(clone(), { operation: 'privacy.egress.enable', actorId: 'local-owner', scope, destinationId: 'dest-1', elevatedAuthorized: false });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('admin-privacy-elevated-authorization-required');

    const allowed = evaluateAdminOperation(clone(), { operation: 'privacy.egress.enable', actorId: 'local-owner', scope, destinationId: 'dest-1', elevatedAuthorized: true });
    expect(allowed.allowed).toBe(true);
  });

  it('does not materialize anything when the policy denies — the producing step is never invoked', async () => {
    // Die Kernfunktionen sind unveränderlich: sie geben ein neues Dokument zurück. Genau so benutzt die
    // Oberfläche sie (`onApply(next)`), und genau so prüft dieser Test sie.
    const model = await upsertDlpRule(clone(), {
      id: 'block-confidential-export', enabled: true, labels: ['confidential'], operations: ['export'], destinationKinds: ['external'],
      metadataMatchers: [], contentMatchers: [], action: 'block',
    });
    let produced = 0;
    const guard = materializeGuarded(model, base(), () => { produced += 1; return 'bytes'; });
    expect(guard.allowed).toBe(false);
    expect(guard.materialized).toBe(false);
    expect(guard.value).toBeUndefined();
    expect(produced).toBe(0);

    const allowedGuard = materializeGuarded(model, base({ subject: { objectId: 'doc-2', label: 'internal', metadata: {}, content: 'harmless' } }), () => { produced += 1; return 'bytes'; });
    expect(allowedGuard.materialized).toBe(true);
    expect(produced).toBe(1);
  });

  it('throws a named denial only at the throwing boundary, carrying the decision', () => {
    try {
      requireAdminOperation(clone(), base({ operation: 'vault.export.plaintext', destinationKind: 'file' }));
      throw new Error('expected a denial');
    } catch (error) {
      expect(error).toBeInstanceOf(AdminOperationDenied);
      expect((error as AdminOperationDenied).message).toBe('admin-policy-denied:admin-vault-plaintext-export-forbidden');
      expect((error as AdminOperationDenied).decision.policyId).toBe('POL-ENC-NATIVE-ONLY');
    }
  });
});

describe('admin enforcement authority — accumulated state in ONE document', () => {
  it('applies both of two DLP rules added in the same instance and both of two retention rules', async () => {
    let model = clone();
    // Zwei Aufrufe in EINER Instanz: der zweite darf den ersten nicht verlieren.
    model = await upsertDlpRule(model, { id: 'rule-a', enabled: true, labels: ['confidential'], operations: ['export'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'block' });
    model = await upsertDlpRule(model, { id: 'rule-b', enabled: true, labels: ['restricted'], operations: ['print'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'block' });
    expect(model.dlp.rules.map((rule) => rule.id)).toEqual(['rule-a', 'rule-b']);

    const exportDenied = evaluateAdminOperation(model, base({ subject: { objectId: 'doc', label: 'confidential', metadata: {}, content: 'x' } }));
    const printDenied = evaluateAdminOperation(model, base({ operation: 'dlp.print', subject: { objectId: 'doc', label: 'restricted', metadata: {}, content: 'x' } }));
    const copyAllowed = evaluateAdminOperation(model, base({ operation: 'dlp.copy', subject: { objectId: 'doc', label: 'restricted', metadata: {}, content: 'x' } }));
    expect(exportDenied.allowed).toBe(false);
    expect(exportDenied.detail).toBe('dlp-block');
    expect(printDenied.allowed).toBe(false);
    expect(copyAllowed.allowed).toBe(true);

    model.retention = upsertRetentionRule(model.retention, { id: 'ret-1', enabled: true, documentKinds: ['Writer'], spaceIds: [], tags: [], retentionDays: 30, action: 'retain' }, 'local-owner');
    model.retention = upsertRetentionRule(model.retention, { id: 'ret-2', enabled: true, documentKinds: ['Grid'], spaceIds: [], tags: [], retentionDays: 0, action: 'delete' }, 'local-owner');
    expect(model.retention.rules).toHaveLength(2);

    const writerDenied = evaluateAdminOperation(model, { operation: 'retention.delete', actorId: 'local-owner', scope, object: { id: 'w1', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 } });
    expect(writerDenied.allowed).toBe(false);
    expect(writerDenied.reason).toBe('admin-retention-delete-denied');

    // Audit-Einträge in derselben Instanz: die Kette bleibt gültig, verliert nichts und ist streng
    // aufsteigend. (Die beiden Regel-Anlagen oben haben bereits auditiert — das ist der Punkt.)
    model.audit = await appendAuditEvent(model.audit, { at: 1, actor: 'local-owner', action: 'probe.one', objectClass: 'test', result: 'change' });
    model.audit = await appendAuditEvent(model.audit, { at: 2, actor: 'local-owner', action: 'probe.two', objectClass: 'test', result: 'change' });
    const sequences = model.audit.events.map((event) => event.sequence);
    expect(model.audit.events.map((event) => event.action).slice(-2)).toEqual(['probe.one', 'probe.two']);
    expect(sequences).toEqual(sequences.map((_, index) => index + 1));
    expect(await verifyAuditTrail(model.audit)).toMatchObject({ ok: true, lastSequence: sequences.length });

    // Zwei Richtlinienänderungen in derselben Instanz: die zweite liest den Stand der ersten.
    const afterBlock = await updateDlpDefaultAction(model, 'block');
    const afterAudit = await updateDlpDefaultAction(afterBlock, 'audit');
    expect(afterBlock.dlp.defaultAction).toBe('block');
    expect(afterAudit.dlp.defaultAction).toBe('audit');
    expect(afterAudit.audit.events.length).toBe(model.audit.events.length + 2);
  });

  it('enforces a legal hold created in the same instance that then denies the deletion', () => {
    const model = clone();
    model.retention = upsertLegalHold(model.retention, {
      id: 'hold-1', name: 'Case 1', active: true, objectIds: ['held-object'], spaceIds: [], createdAt: 0, authorizedBy: 'local-owner',
    }, 'local-owner');
    const denied = evaluateAdminOperation(model, { operation: 'retention.delete', actorId: 'local-owner', scope, object: { id: 'held-object', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 } });
    expect(denied.allowed).toBe(false);
    expect(denied.detail).toBe('legal-hold-active');
    const otherAllowed = evaluateAdminOperation(model, { operation: 'retention.delete', actorId: 'local-owner', scope, object: { id: 'free-object', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 } });
    expect(otherAllowed.allowed).toBe(true);
  });
});

describe('admin enforcement authority — canonical space scoping really matches', () => {
  it('applies a DLP approved-space rule that was written canonically, and refuses a foreign space', async () => {
    const canonicalSpace = buildAdminWorkspaceReference('space', 'space-alpha');
    const model = await upsertDlpRule(clone(), {
      id: 'approved-space-only', enabled: true, labels: [], operations: ['export'], destinationKinds: ['space'],
      metadataMatchers: [], contentMatchers: [], action: 'require-approved-space', approvedSpaceIds: [canonicalSpace],
    });

    const inside = evaluateAdminOperation(model, base({ destinationKind: 'space', destinationId: 'space-alpha' }));
    const outside = evaluateAdminOperation(model, base({ destinationKind: 'space', destinationId: 'space-beta' }));
    expect(inside.allowed).toBe(true);
    expect(outside.allowed).toBe(false);
    expect(outside.detail).toBe('dlp-approved-space-required');
  });

  it('applies a retention rule whose space list is canonical, and not one for another space', () => {
    const model = clone();
    model.retention = upsertRetentionRule(model.retention, {
      id: 'ret-space', enabled: true, documentKinds: [], spaceIds: [buildAdminWorkspaceReference('space', 'space-alpha')], tags: [],
      retentionDays: 3650, action: 'retain',
    }, 'local-owner');
    const inside = evaluateAdminOperation(model, { operation: 'retention.delete', actorId: 'local-owner', scope, object: { id: 'o1', kind: 'Writer', spaceId: 'space-alpha', tags: [], createdAt: 0, versionCount: 1 } });
    const outside = evaluateAdminOperation(model, { operation: 'retention.delete', actorId: 'local-owner', scope, object: { id: 'o2', kind: 'Writer', spaceId: 'space-beta', tags: [], createdAt: 0, versionCount: 1 } });
    expect(inside.allowed).toBe(false);
    expect(outside.allowed).toBe(true);
  });
});

describe('admin enforcement audit trail', () => {
  it('records both an allowance and a denial, with the named reason, and keeps the chain verifiable', async () => {
    let model = clone();
    const deniedRequest = base({ operation: 'vault.export.plaintext', destinationKind: 'file' });
    model = await auditAdminOperationDecision(model, deniedRequest, evaluateAdminOperation(model, deniedRequest), 1_000);
    const allowedRequest = base({ subject: { objectId: 'doc', label: 'internal', metadata: {}, content: 'harmless' } });
    model = await auditAdminOperationDecision(model, allowedRequest, evaluateAdminOperation(model, allowedRequest), 2_000);

    const events = model.audit.events;
    expect(events.map((event) => event.action)).toEqual(['admin.operation.deny', 'admin.operation.allow']);
    expect(events[0].result).toBe('deny');
    expect(events[0].detailCode).toBe('POL-ENC-NATIVE-ONLY/admin-vault-plaintext-export-forbidden');
    expect(events[0].actor).toBe('local-owner');
    expect(events[1].result).toBe('allow');
    expect(await verifyAuditTrail(model.audit)).toMatchObject({ ok: true, lastSequence: 2 });
  });

  it('refuses to write content fields into the audit trail', async () => {
    const model = clone();
    const request = { ...base(), content: 'this must never reach the audit trail' } as unknown as AdminOperationRequest;
    const decision = evaluateAdminOperation(model, request);
    await expect(auditAdminOperationDecision(model, request, decision)).resolves.toBeDefined();
    // Der Inhalt des Vorgangs wird nicht geschrieben: nur Zeit, Akteur, Operation, Ergebnis, Grund.
    const audited = await auditAdminOperationDecision(model, request, decision, 5);
    const event = audited.audit.events.at(-1)!;
    expect(Object.keys(event).sort()).toEqual(['action', 'actor', 'at', 'detailCode', 'hash', 'objectClass', 'objectId', 'previousHash', 'result', 'sequence']);
    expect(JSON.stringify(event)).not.toContain('must never reach');
  });
});

describe('admin enforcement matrix', () => {
  it('names exactly one policy, hook, source and test per operation and rejects duplicates', () => {
    const operations = ADMIN_ENFORCEMENT_MATRIX.map((entry) => entry.operation);
    expect(new Set(operations).size).toBe(operations.length);
    for (const entry of ADMIN_ENFORCEMENT_MATRIX) {
      expect(entry.policyId.startsWith('POL-')).toBe(true);
      expect(entry.hook.length).toBeGreaterThan(3);
      expect(entry.source.endsWith('.ts')).toBe(true);
      expect(entry.test.length).toBeGreaterThan(3);
    }
  });

  it('routes every matrix operation through a decision that carries the same policy id', () => {
    const model = clone();
    for (const entry of ADMIN_ENFORCEMENT_MATRIX) {
      const decision = evaluate(model, {
        operation: entry.operation, actorId: 'local-owner', scope,
        subject: { objectId: 'matrix-object', label: 'internal', metadata: {}, content: 'matrix' },
        destinationKind: 'external',
        object: { id: 'matrix-object', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 },
        connector: { capabilityId: 'matrix-capability', host: 'matrix.example', protocol: 'https', purpose: 'connector' },
        keyProvider: { provider: 'matrix', available: true, hardwareBacked: false, attestationVerified: false, slotTypes: ['os-keychain'] },
      });
      expect(decision.operation).toBe(entry.operation);
      expect(decision.policyId).toBe(entry.policyId);
      expect(decision.hook).toBe(entry.hook);
    }
  });
});
