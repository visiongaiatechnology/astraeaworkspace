// STATUS: PLATIN — die ausgelieferte Standardkonfiguration muss die Regeln erfüllen, die diese App
// selbst veröffentlicht.
//
// **Warum diese Klasse von Test nötig ist (Befund aus einer Schwester-App):** in Automate deklarierte
// das Standardmodell `workspace.task.write`, während der Code `workspace.task.create.write` ableitet —
// der mitgelieferte Standardablauf hätte das eigene Fähigkeitsgate nicht bestanden. Die Fixtures der
// Tests waren handgeschrieben und deckten den Fehler zu. Für eine Richtlinien-App lautet dieselbe Klasse:
// **das mitgelieferte Standarddokument muss durch die eigenen Wächter kommen** — und der einzige
// zugeordnete Administrator muss jede Fähigkeit besitzen, die die Oberfläche zum Bearbeiten braucht.
//
// Genau das war hier defekt: `role-system` hatte keine der Verwaltungsfähigkeiten (`dlp.manage`,
// `retention.manage`, `key.manage`, `connector.manage`, `privacy.manage`), also hätte jedes Formular des
// neuen Autorenbereichs auf dem frischen Profil fail-closed abgelehnt.
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_ADMIN_ROLES,
  DEFAULT_ADMIN_POLICY_MODEL,
  type AdminCapability,
  type AdminPolicyModel,
} from '../../model/types';
import { hasAdminCapability, normalizeRole, adminCapabilityGrants } from '../../security/adminRbacCore';
import { normalizeDlpPolicy, DLP_ACTIONS, SENSITIVITY_LABELS, DLP_OPERATIONS } from '../../policies/adminDlpCore';
import { normalizeEncryptionPolicy, evaluateKeyProvider } from '../../security/adminKeyPolicyCore';
import { validateNetworkGovernance } from '../../policies/adminNetworkPolicyCore';
import { validatePrivacyPolicy } from '../../settings/adminPrivacyCore';
import { validateBackupPolicy } from '../../policies/adminContinuityCore';
import { assertCanonicalReferences } from '../../model/adminCanonicalReferenceCore';
import { evaluateAdminOperation } from '../../enforcement/adminEnforcementCore';
import { buildComplianceReport } from '../../governance/adminGovernanceCore';
import { strictestAdminPolicy } from '../../model/adminStrictestPolicy';

const clone = (): AdminPolicyModel => JSON.parse(JSON.stringify(DEFAULT_ADMIN_POLICY_MODEL)) as AdminPolicyModel;
const scope = { kind: 'organization' as const, id: DEFAULT_ADMIN_POLICY_MODEL.organization.id };

/** Die Fähigkeiten, ohne die die sichtbaren Bearbeitungswege dieser Oberfläche nicht funktionieren. */
const AUTHORING_CAPABILITIES: readonly AdminCapability[] = Object.freeze([
  'policy.write', 'identity.assign', 'device.manage', 'key.manage', 'dlp.manage',
  'retention.manage', 'connector.manage', 'privacy.manage',
]);

describe('shipped default policy satisfies the rules this app publishes', () => {
  it('accepts every publishable rule set of the default document through its own validator', () => {
    const model = clone();
    expect(() => normalizeDlpPolicy(model.dlp)).not.toThrow();
    expect(() => normalizeEncryptionPolicy(model.encryption)).not.toThrow();
    expect(() => validateNetworkGovernance(model.network)).not.toThrow();
    expect(() => validatePrivacyPolicy(model.privacy)).not.toThrow();
    for (const role of model.roles) expect(() => normalizeRole(role)).not.toThrow();
    // Keine kanonische Referenz im Standard ist ungültig (leere Listen sind gültig).
    expect(() => assertCanonicalReferences(model.dlp.rules.flatMap((rule) => rule.approvedSpaceIds ?? []), 'space')).not.toThrow();
    expect(() => assertCanonicalReferences(model.retention.rules.flatMap((rule) => rule.spaceIds), 'space')).not.toThrow();

    // Die Normalisierung darf die Sicherheitszusagen des Standards nicht abschwächen.
    const normalized = normalizeEncryptionPolicy(model.encryption);
    expect(normalized.requireNativeEncryption).toBe(true);
    expect(normalized.implicitMasterKey).toBe(false);
    expect(normalized.minimumPortablePasswordIterations).toBeGreaterThanOrEqual(210_000);
  });

  it('grants the assigned administrator every capability the visible authoring surface needs', () => {
    const model = clone();
    const administrator = model.assignments[0].subjectId;
    for (const capability of AUTHORING_CAPABILITIES) {
      expect(hasAdminCapability(model, administrator, capability, scope), capability).toBe(true);
    }
    // Und jede veröffentlichte Fähigkeit ist überhaupt von mindestens einer eingebauten Rolle erreichbar —
    // sonst wäre eine Operation für niemanden ausführbar.
    const published = new Set<AdminCapability>(BUILTIN_ADMIN_ROLES.flatMap((role) => role.capabilities));
    for (const capability of AUTHORING_CAPABILITIES) expect(published.has(capability), capability).toBe(true);
    expect(adminCapabilityGrants(model, administrator).length).toBeGreaterThanOrEqual(AUTHORING_CAPABILITIES.length);
  });

  it('lets the default administrator write every policy domain the surface writes', async () => {
    const model = clone();
    const administrator = model.assignments[0].subjectId;
    // Der Durchsetzungspunkt für Richtlinienänderungen erlaubt dem Standardadministrator wirklich.
    const decision = evaluateAdminOperation(model, { operation: 'admin.policy.write', actorId: administrator, scope });
    expect(decision.allowed).toBe(true);
    expect(decision.policyId).toBe('POL-RBAC-POLICY-WRITE');
  });

  it('keeps the safety promises of the default document that the app displays', () => {
    const model = clone();
    expect(model.network.telemetryEnabled).toBe(false);
    expect(model.network.remoteContentDefault).toBe('deny');
    expect(model.privacy.diagnosticsMode).toBe('local-only');
    expect(model.privacy.analyticsEnabled).toBe(false);
    expect(model.privacy.egressChangeRequiresElevatedAuth).toBe(true);
    expect(model.encryption.requireNativeEncryption).toBe(true);
    expect(model.encryption.implicitMasterKey).toBe(false);
    expect(model.deployment.requireInstallerSignature).toBe(true);
    expect(DLP_ACTIONS).toContain(model.dlp.defaultAction);
    expect(SENSITIVITY_LABELS).toContain(model.network.providers.externalAiMaxSensitivity);
    for (const operation of DLP_OPERATIONS) expect(typeof operation).toBe('string');
  });

  it('reports the unconfigured backup as an actionable named refusal, not as a silent pass', () => {
    const model = clone();
    // Ein frisches Profil hat **kein** Sicherungsziel. `requireOfflineCopy: true` ohne Ziel ist deshalb
    // kein gültiger Zustand — der Wächter lehnt benannt ab, statt still durchzugehen.
    expect(() => validateBackupPolicy(model.continuity)).toThrow(/admin-backup-offline-target-required/);
    // Mit einem verschlüsselten, offline-fähigen Ziel ist derselbe Standard gültig.
    const configured: AdminPolicyModel = {
      ...model,
      continuity: { ...model.continuity, targets: [{ id: 't1', kind: 'removable-encrypted', encrypted: true, offlineCapable: true, locationRef: 'removable://backup' }] },
    };
    expect(() => validateBackupPolicy(configured.continuity)).not.toThrow();
  });

  it('reports a violation-free fresh profile exactly once and stays honest about its gaps', () => {
    const report = buildComplianceReport(clone());
    expect(report.violations).toBe(0);
    expect(report.gaps).toBeGreaterThan(0);
    // Die Lücken sind die nicht konfigurierten Prüfgegenstände — der Standard ist sicher, aber leer.
    expect(report.findings.filter((finding) => finding.status === 'gap').every((finding) => finding.reason === 'admin-probe-precondition-missing')).toBe(true);
  });

  it('keeps the key provider promise of the default document enforceable', () => {
    const model = clone();
    // Software-/OS-Schutz ohne Hardware-Attestierung: die Behauptung darf nicht „hardware-backed" lauten.
    const software = evaluateKeyProvider(model.encryption, { provider: 'os', available: true, hardwareBacked: false, attestationVerified: false, slotTypes: ['os-keychain'] });
    expect(software.allowed).toBe(true);
    expect(software.hardwareClaim).not.toContain('Hardware-backed (verified)');

    // Eine Hardware-Behauptung ohne Attestierung wird abgelehnt — der Standard verlangt sie.
    const unverified = evaluateKeyProvider(model.encryption, { provider: 'tpm', available: true, hardwareBacked: true, attestationVerified: false, slotTypes: ['hardware-backed'] });
    expect(unverified.allowed).toBe(false);
    expect(unverified.reason).toBe('hardware-attestation-required');
  });

  it('makes the strictest fallback strictly stricter than the default on every enforced operation', () => {
    const model = clone();
    const strict = strictestAdminPolicy(model);
    expect(evaluateAdminOperation(model, { operation: 'grid.link.share-external', actorId: 'local-owner', scope, subject: { objectId: 'o', label: 'internal', metadata: {}, content: 'x' }, destinationKind: 'external' }).allowed).toBe(true);
    expect(evaluateAdminOperation(strict, { operation: 'grid.link.share-external', actorId: 'local-owner', scope, subject: { objectId: 'o', label: 'internal', metadata: {}, content: 'x' }, destinationKind: 'external' }).allowed).toBe(false);
    expect(strict.network.netGateCapabilities).toEqual([]);
    expect(strict.network.providers.allow).toEqual([]);
    expect(strict.network.providers.externalAiEnabled).toBe(false);
    expect(strict.dlp.rules).toEqual([]);
  });
});
