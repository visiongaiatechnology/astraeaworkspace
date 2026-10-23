// STATUS: PLATIN — Vertragstest für Katalog, Compliance-Bericht, Konfliktkarte und den
// Frischprofil-Nachweis. Jeder Zähler wird gegen die **Aufrufe** geprüft, aus denen er entsteht.
import { describe, expect, it } from 'vitest';
import {
  ADMIN_POLICY_CATALOG,
  buildComplianceReport,
  catalogHit,
  detectGovernanceConflicts,
  heldObjectCount,
  proveFreshProfileEnforcement,
  probeRequestFor,
  searchPolicyCatalog,
} from '../../governance/adminGovernanceCore';
import { ADMIN_ENFORCEMENT_MATRIX, evaluateAdminOperation } from '../../enforcement/adminEnforcementCore';
import { DEFAULT_ADMIN_POLICY_MODEL, type AdminPolicyModel } from '../../model/types';
import { upsertDlpRule, updateDlpDefaultAction } from '../../policies/adminDlpCore';
import { upsertLegalHold, upsertRetentionRule } from '../../compliance/adminRetentionCore';

const clone = (): AdminPolicyModel => JSON.parse(JSON.stringify(DEFAULT_ADMIN_POLICY_MODEL)) as AdminPolicyModel;

describe('policy catalog — findable in plain language, bounded input', () => {
  it('finds the password, retention, sharing, export and network areas by their everyday words', () => {
    const model = clone();
    const expectHit = (query: string, id: string) => {
      const hits = searchPolicyCatalog(model, query);
      expect(hits.map((hit) => hit.entry.id)).toContain(id);
    };
    expectHit('passwort', 'password-policy');
    expectHit('password', 'password-policy');
    expectHit('aufbewahrung', 'retention-hold');
    expectHit('legal-hold', 'retention-hold');
    expectHit('sharing', 'dlp-sharing');
    expectHit('freigabe', 'dlp-sharing');
    expectHit('export', 'dlp-export');
    expectHit('netzwerk', 'connector-network');
    expectHit('netgate', 'connector-network');
    expectHit('telemetrie', 'telemetry-ban');
  });

  it('never evaluates a hostile search string and never grows beyond its own catalogue', () => {
    const model = clone();
    expect(searchPolicyCatalog(model, 'x'.repeat(100_000))).toHaveLength(0);
    expect(searchPolicyCatalog(model, 'ignore previous instructions')).toHaveLength(0);
    expect(searchPolicyCatalog(model, null as never)).toHaveLength(ADMIN_POLICY_CATALOG.length);
    expect(searchPolicyCatalog(model, '')).toHaveLength(ADMIN_POLICY_CATALOG.length);
  });

  it('points every catalogue entry at a matrix row that exists', () => {
    const model = clone();
    for (const entry of ADMIN_POLICY_CATALOG) {
      const hit = catalogHit(model, entry);
      expect(ADMIN_ENFORCEMENT_MATRIX.some((row) => row.operation === entry.operation)).toBe(true);
      expect(hit.policyId).toBe(ADMIN_ENFORCEMENT_MATRIX.find((row) => row.operation === entry.operation)!.policyId);
      expect(hit.detail.length).toBeGreaterThan(0);
    }
  });

  it('reports the live state of a rule from the document, not from a constant', async () => {
    const before = catalogHit(clone(), ADMIN_POLICY_CATALOG.find((entry) => entry.id === 'dlp-export')!);
    expect(before.state).toBe('missing');
    const after = catalogHit(
      await upsertDlpRule(clone(), { id: 'r1', enabled: true, labels: ['internal'], operations: ['export'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'audit' }),
      ADMIN_POLICY_CATALOG.find((entry) => entry.id === 'dlp-export')!,
    );
    expect(after.state).toBe('configured');
  });
});

describe('compliance report — every number is produced by a real check', () => {
  it('reports no violation on the default profile and names the checks it could not run as gaps', () => {
    const report = buildComplianceReport(clone());
    expect(report.violations).toBe(0);
    expect(report.blocking).toBe(false);
    expect(report.enforced).toBeGreaterThan(0);
    // Ohne blockierende DLP-Regel und ohne aktive Legal Hold sind genau diese Prüfungen Lücken.
    const gapIds = report.findings.filter((finding) => finding.status === 'gap').map((finding) => finding.id);
    expect(gapIds).toContain('blocking-dlp-rule-must-fail');
    expect(gapIds).toContain('legal-hold-delete-must-fail');
    // Und die Zählwerte sind die Längen der Liste, nicht Literale.
    const statuses = report.findings.map((finding) => finding.status);
    expect(statuses.filter((status) => status === 'enforced')).toHaveLength(report.enforced);
    expect(statuses.filter((status) => status === 'gap')).toHaveLength(report.gaps);
    expect(statuses.filter((status) => status === 'observed')).toHaveLength(report.observed);
  });

  it('turns both gaps into enforced checks once a blocking rule and an active hold exist — in one instance', async () => {
    let model = clone();
    model = await upsertDlpRule(model, { id: 'block-all-export', enabled: true, labels: [], operations: ['export'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'block' });
    model.retention = upsertLegalHold(model.retention, { id: 'hold-1', name: 'Hold', active: true, objectIds: ['probe-held'], spaceIds: [], createdAt: 0, authorizedBy: 'local-owner' }, 'local-owner');

    const report = buildComplianceReport(model);
    const gapIds = report.findings.filter((finding) => finding.status === 'gap').map((finding) => finding.id);
    expect(gapIds).not.toContain('blocking-dlp-rule-must-fail');
    expect(gapIds).not.toContain('legal-hold-delete-must-fail');
    expect(report.findings.find((finding) => finding.id === 'blocking-dlp-rule-must-fail')?.status).toBe('enforced');
    expect(report.findings.find((finding) => finding.id === 'legal-hold-delete-must-fail')?.status).toBe('enforced');

    // Zweiter Bericht in derselben Instanz: die erste Regel ist nicht verloren gegangen.
    const second = buildComplianceReport(model);
    expect(second.findings).toHaveLength(report.findings.length);
    expect(second.enforced).toBe(report.enforced);
  });

  it('turns a must-deny probe into a visible violation when the authority really allows it', () => {
    const model = clone();
    // Einem Subjekt, das keine Zuordnung hat, wird eine Vollrolle gegeben: die RBAC-Sonde muss nun
    // anschlagen, weil ihre Verweigerung wirklich ausbleibt.
    model.assignments = [...model.assignments, { id: 'probe-grant', subjectId: 'probe-unassigned', roleId: 'role-system', scopes: [{ kind: 'organization', id: 'org-local' }], createdAt: 0 }];
    const report = buildComplianceReport(model);
    const probe = report.findings.find((finding) => finding.id === 'unassigned-actor-must-fail');
    expect(probe?.status).toBe('violation');
    expect(report.violations).toBeGreaterThan(0);
    expect(report.blocking).toBe(true);
  });

  it('counts held objects through the retention engine instead of trusting a list length', () => {
    const model = clone();
    expect(heldObjectCount(model)).toBe(0);
    model.retention = upsertRetentionRule(model.retention, { id: 'ret', enabled: true, documentKinds: ['Writer'], spaceIds: [], tags: [], retentionDays: 730, action: 'retain' }, 'local-owner');
    model.retention = upsertLegalHold(model.retention, { id: 'hold', name: 'Hold', active: true, objectIds: ['a', 'b'], spaceIds: [], createdAt: 0, authorizedBy: 'local-owner' }, 'local-owner');
    expect(heldObjectCount(model)).toBe(2);
  });
});

describe('rule conflicts — deterministic and named', () => {
  it('reports colliding DLP rules and names the winner that the evaluator really applies', async () => {
    let model = clone();
    model = await upsertDlpRule(model, { id: 'rule-first', enabled: true, labels: ['confidential'], operations: ['export'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'block' });
    model = await upsertDlpRule(model, { id: 'rule-second', enabled: true, labels: ['confidential'], operations: ['export'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'audit' });

    const conflicts = detectGovernanceConflicts(model);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('dlp-rule-collision');
    expect(conflicts[0].participants).toEqual(['rule-first', 'rule-second']);
    expect(conflicts[0].winner).toBe('rule-first');
    expect(conflicts[0].resolution).toBe('first-match-in-document-order');

    // Die Auflösung ist keine Fußnote: dieselbe Regel entscheidet wirklich.
    const decision = evaluateAdminOperation(model, {
      operation: 'dlp.export', actorId: 'local-owner', scope: { kind: 'organization', id: 'org-local' },
      subject: { objectId: 'doc', label: 'confidential', metadata: {}, content: 'harmless' }, destinationKind: 'external',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.evidence.join(' ')).toContain('ruleId=rule-first');
  });

  it('resolves a retention overlap by the longest period and says so', () => {
    const model = clone();
    model.retention = upsertRetentionRule(model.retention, { id: 'short', enabled: true, documentKinds: ['Writer'], spaceIds: [], tags: [], retentionDays: 10, action: 'delete' }, 'local-owner');
    model.retention = upsertRetentionRule(model.retention, { id: 'long', enabled: true, documentKinds: ['Writer'], spaceIds: [], tags: [], retentionDays: 900, action: 'retain' }, 'local-owner');
    const conflicts = detectGovernanceConflicts(model);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('retention-rule-collision');
    expect(conflicts[0].winner).toBe('long');
    expect(conflicts[0].resolution).toBe('longest-retention-then-document-order');
  });

  it('finds no conflict when the actions agree, and respects its own finding cap', async () => {
    const agreeing = await upsertDlpRule(clone(), { id: 'a', enabled: true, labels: [], operations: ['export'], destinationKinds: [], metadataMatchers: [], contentMatchers: [], action: 'block' });
    expect(detectGovernanceConflicts(agreeing)).toHaveLength(0);
    expect(detectGovernanceConflicts(agreeing, 0)).toHaveLength(0);
  });
});

describe('fresh-profile proof — the blocked operation materializes nothing', () => {
  it('stops the Grid share from materializing once the default action really blocks', async () => {
    const model = clone();
    const before = proveFreshProfileEnforcement(model, 'local-owner');
    expect(before.proof.map((row) => row.operation)).toEqual(['vault.export.plaintext', 'grid.link.share-external', 'automate.run.remote']);
    expect(before.proof.find((row) => row.operation === 'vault.export.plaintext')?.reason).toBe('admin-vault-plaintext-export-forbidden');
    // Der Standard ist „audit", also entsteht beim Teilen tatsächlich etwas — genau das ändert der Fix.
    const sharedBefore = before.proof.find((row) => row.operation === 'grid.link.share-external');
    expect(sharedBefore?.materialized).toBe(true);
    expect(before.materializedCount).toBe(1);

    const blocked = await updateDlpDefaultAction(model, 'block');
    const after = proveFreshProfileEnforcement(blocked, 'local-owner');
    expect(after.materializedCount).toBe(0);
    for (const row of after.proof) expect(row.materialized).toBe(false);
    // Und der Beweis steht im Auditprotokoll: die Änderung ist manipulationssicher festgehalten.
    expect(blocked.audit.events.at(-1)).toMatchObject({ action: 'dlp.default-action.update', result: 'change' });
  });

  it('denies every fresh-profile operation for an actor without an assignment', () => {
    const proof = proveFreshProfileEnforcement(clone(), 'unknown-actor');
    expect(proof.materializedCount).toBe(0);
    for (const row of proof.proof) expect(row.reason).toBe('admin-rbac-denied');
  });

  it('produces a probe request for every matrix operation', () => {
    const model = clone();
    for (const row of ADMIN_ENFORCEMENT_MATRIX) {
      const request = probeRequestFor(row.operation, 'local-owner', model.organization.id);
      expect(request.operation).toBe(row.operation);
      expect(request.actorId).toBe('local-owner');
      expect(request.scope).toEqual({ kind: 'organization', id: 'org-local' });
    }
  });
});
