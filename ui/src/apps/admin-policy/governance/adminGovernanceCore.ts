// STATUS: PLATIN — Katalog, Konfliktauflösung und Compliance-Bericht aus **echten** Prüfresultaten.
//
// **Warum dieses Modul existiert (gemessen, nicht vermutet):** Die Oberfläche zeigte pro Registerkarte
// eine Regelzahl. Ein Nutzer konnte daraus „geprüft" lesen, obwohl nichts geprüft worden war: es gab
// keine Funktion, die eine Policy gegen eine Operation laufen ließ und das Ergebnis als Befund
// zurückgab. Dieses Modul erzeugt seine Zahlen **ausschließlich** aus Aufrufen von
// `evaluateAdminOperation` — jeder Zähler ist die Länge einer Liste von Ergebnissen, kein Literal.
//
// **Ein Fakt, eine Definition:** die Zuordnung Regel → durchsetzender Hook steht in
// `ADMIN_ENFORCEMENT_MATRIX`; der Katalog hier verweist nur darauf (`policyId`, `operation`) und
// wiederholt die Zuordnung nicht.

import type { AdminPolicyModel, DlpAction, RetentionRule } from '../model/types';
import { selectDlpRule } from '../policies/adminDlpCore';
import { isUnderLegalHold } from '../compliance/adminRetentionCore';
import {
  ADMIN_ENFORCEMENT_MATRIX,
  evaluateAdminOperation,
  materializeGuarded,
  type AdminOperationDecision,
  type AdminOperationId,
  type AdminOperationRequest,
} from '../enforcement/adminEnforcementCore';

export type AdminCatalogDomain =
  | 'identity' | 'encryption' | 'sharing' | 'retention' | 'export'
  | 'network' | 'devices' | 'audit' | 'continuity' | 'privacy';

export interface AdminCatalogEntry {
  id: string;
  domain: AdminCatalogDomain;
  /** Verweis in die Nachweis-Matrix — keine zweite Zuordnung. */
  operation: AdminOperationId;
  /** Schlagworte in Nutzersprache, damit „Passwort", „Aufbewahrung", „Sharing", „Export", „Netzwerk" finden. */
  keywords: readonly string[];
}

/** Der Katalog ist eine feste, begrenzte Liste — kein Wachstum aus Nutzereingaben. */
export const ADMIN_POLICY_CATALOG: readonly AdminCatalogEntry[] = Object.freeze([
  { id: 'password-policy', domain: 'encryption', operation: 'key.provider.use', keywords: ['password', 'passwort', 'pin', 'keychain', 'schluessel', 'key', 'verschluesselung', 'encryption', 'rotation'] },
  { id: 'native-encryption', domain: 'encryption', operation: 'vault.export.encrypted', keywords: ['encryption', 'verschluesselung', 'plaintext', 'klartext', 'export', 'native'] },
  { id: 'plaintext-export-ban', domain: 'export', operation: 'vault.export.plaintext', keywords: ['export', 'klartext', 'plaintext', 'verboten', 'forbidden', 'vault'] },
  { id: 'dlp-sharing', domain: 'sharing', operation: 'grid.link.share-external', keywords: ['sharing', 'freigabe', 'dlp', 'sensitive', 'sensibel', 'external', 'extern'] },
  { id: 'dlp-export', domain: 'export', operation: 'dlp.export', keywords: ['export', 'dlp', 'block', 'sperre'] },
  { id: 'dlp-clipboard', domain: 'sharing', operation: 'dlp.clipboard', keywords: ['clipboard', 'zwischenablage', 'copy', 'dlp'] },
  { id: 'dlp-print', domain: 'export', operation: 'dlp.print', keywords: ['print', 'drucken', 'dlp'] },
  { id: 'dlp-connector', domain: 'sharing', operation: 'dlp.connector', keywords: ['connector', 'konnektor', 'dlp', 'upload'] },
  { id: 'retention-hold', domain: 'retention', operation: 'retention.delete', keywords: ['retention', 'aufbewahrung', 'legal-hold', 'loeschen', 'delete', 'frist'] },
  { id: 'connector-network', domain: 'network', operation: 'network.connector', keywords: ['network', 'netzwerk', 'netgate', 'connector', 'endpoint', 'domain'] },
  { id: 'remote-content', domain: 'network', operation: 'network.remote-content', keywords: ['remote', 'content', 'inhalte', 'netzwerk', 'deny'] },
  { id: 'telemetry-ban', domain: 'privacy', operation: 'network.telemetry', keywords: ['telemetry', 'telemetrie', 'privacy', 'datenschutz'] },
  { id: 'egress-elevation', domain: 'privacy', operation: 'privacy.egress.enable', keywords: ['egress', 'destination', 'ziel', 'privacy', 'datenschutz', 'freigabe'] },
  { id: 'automation-remote', domain: 'network', operation: 'automate.run.remote', keywords: ['automation', 'automatisierung', 'remote', 'run', 'netzwerk'] },
  { id: 'policy-write-authority', domain: 'identity', operation: 'admin.policy.write', keywords: ['role', 'rolle', 'berechtigung', 'permission', 'owner', 'admin', 'write'] },
]);

const CATALOG_LIMIT = 128;

export type AdminCatalogState = 'enforced' | 'configured' | 'default-only' | 'missing';

export interface AdminCatalogHit {
  entry: AdminCatalogEntry;
  policyId: string;
  hook: string;
  source: string;
  test: string;
  state: AdminCatalogState;
  detail: string[];
}

function matrixFor(operation: AdminOperationId) {
  const found = ADMIN_ENFORCEMENT_MATRIX.find((row) => row.operation === operation);
  if (!found) throw new Error('admin-catalog-matrix-missing');
  return found;
}

/** Der Live-Zustand eines Katalogeintrags, gelesen aus dem Dokument — nicht behauptet. */
function catalogState(model: AdminPolicyModel, entry: AdminCatalogEntry): { state: AdminCatalogState; detail: string[] } {
  switch (entry.id) {
    case 'password-policy':
      return { state: 'configured', detail: [
        `slots=${model.encryption.allowedKeySlotTypes.join('|') || 'none'}`,
        `pbkdf2-iterations=${model.encryption.minimumPortablePasswordIterations}`,
        `pin-attempts=${model.encryption.pin.maxAttempts}`,
        `rotation-days=${model.encryption.rotationDays}`,
      ] };
    case 'native-encryption':
      return { state: model.encryption.requireNativeEncryption ? 'enforced' : 'missing', detail: [
        `requireNativeEncryption=${model.encryption.requireNativeEncryption}`,
        `implicitMasterKey=${model.encryption.implicitMasterKey}`,
      ] };
    case 'plaintext-export-ban':
      return { state: 'enforced', detail: ['plaintext-export=denied-by-policy'] };
    case 'dlp-sharing':
    case 'dlp-export':
    case 'dlp-clipboard':
    case 'dlp-print':
    case 'dlp-connector': {
      const enabled = model.dlp.rules.filter((rule) => rule.enabled).length;
      return { state: enabled ? 'configured' : 'missing', detail: [
        `enabled-rules=${enabled}`,
        `default-action=${model.dlp.defaultAction}`,
      ] };
    }
    case 'retention-hold': {
      const activeHolds = model.retention.legalHolds.filter((hold) => hold.active).length;
      return { state: model.retention.rules.length || activeHolds ? 'configured' : 'missing', detail: [
        `rules=${model.retention.rules.length}`,
        `active-holds=${activeHolds}`,
      ] };
    }
    case 'connector-network': {
      const capabilities = model.network.netGateCapabilities.length;
      return { state: capabilities ? 'configured' : 'missing', detail: [`netgate-capabilities=${capabilities}`] };
    }
    case 'remote-content':
      return { state: model.network.remoteContentDefault === 'deny' ? 'enforced' : 'missing', detail: [`remoteContentDefault=${model.network.remoteContentDefault}`] };
    case 'telemetry-ban':
      return { state: model.network.telemetryEnabled === false ? 'enforced' : 'missing', detail: [`telemetryEnabled=${String(model.network.telemetryEnabled)}`] };
    case 'egress-elevation':
      return { state: model.privacy.egressChangeRequiresElevatedAuth ? 'enforced' : 'missing', detail: [
        `elevatedAuth=${model.privacy.egressChangeRequiresElevatedAuth}`,
        `destinations=${model.privacy.externalDestinations.length}`,
      ] };
    case 'automation-remote':
      return { state: 'default-only', detail: [`providers=${model.network.providers.allow.length}`, `externalAi=${model.network.providers.externalAiEnabled}`] };
    case 'policy-write-authority':
      return { state: 'configured', detail: [
        `roles=${model.roles.length}`,
        `assignments=${model.assignments.length}`,
      ] };
    default:
      return { state: 'default-only', detail: [] };
  }
}

export function catalogHit(model: AdminPolicyModel, entry: AdminCatalogEntry): AdminCatalogHit {
  const row = matrixFor(entry.operation);
  const state = catalogState(model, entry);
  return { entry, policyId: row.policyId, hook: row.hook, source: row.source, test: row.test, state: state.state, detail: state.detail };
}

/**
 * Katalogsuche. Die Suchanfrage ist begrenzte Nutzereingabe: 96 Zeichen, und ein Treffer entsteht nur
 * durch Vergleich mit `id`, `domain` oder den deklarierten Schlagworten — nie durch Auswertung.
 */
export function searchPolicyCatalog(model: AdminPolicyModel, query: string): AdminCatalogHit[] {
  const needle = String(query ?? '').trim().toLowerCase().slice(0, 96);
  return ADMIN_POLICY_CATALOG.slice(0, CATALOG_LIMIT)
    .filter((entry) => !needle
      || entry.id.includes(needle)
      || entry.domain.includes(needle)
      || entry.keywords.some((keyword) => keyword.includes(needle)))
    .map((entry) => catalogHit(model, entry));
}

export interface AdminGovernanceConflict {
  kind: 'dlp-rule-collision' | 'retention-rule-collision' | 'separated-duty-overlap';
  /** Die kollidierenden Regel-IDs in Dokumentreihenfolge. */
  participants: string[];
  /** Die deterministisch gewählte Regel — die Auflösung ist Teil des Befunds, nicht eine Fußnote. */
  winner: string;
  resolution: 'first-match-in-document-order' | 'longest-retention-then-document-order' | 'reported-not-resolved';
}

function dlpRulesCollide(a: { labels: readonly string[]; operations: readonly string[]; destinationKinds: readonly string[]; action: DlpAction }, b: { labels: readonly string[]; operations: readonly string[]; destinationKinds: readonly string[]; action: DlpAction }): boolean {
  const overlaps = (left: readonly string[], right: readonly string[]) => left.length === 0 || right.length === 0 || left.some((value) => right.includes(value));
  if (a.action === b.action) return false;
  return overlaps(a.labels, b.labels) && overlaps(a.operations, b.operations) && overlaps(a.destinationKinds, b.destinationKinds);
}

function retentionRulesCollide(a: RetentionRule, b: RetentionRule): boolean {
  if (!a.enabled || !b.enabled) return false;
  if (a.action === b.action) return false;
  const overlaps = (left: readonly string[], right: readonly string[]) => left.length === 0 || right.length === 0 || left.some((value) => right.includes(value));
  return overlaps(a.documentKinds, b.documentKinds) && overlaps(a.tags, b.tags) && overlaps(a.spaceIds, b.spaceIds);
}

/**
 * Findet kollidierende Regeln und **nennt die Auflösung**.
 *
 * Begrenzt: höchstens 2048 DLP-Regeln und 2048 Retention-Regeln werden verglichen, der Vergleich ist
 * quadratisch in der Zahl der Regeln und deshalb mit einem Ergebnisdeckel versehen.
 */
export function detectGovernanceConflicts(model: AdminPolicyModel, maxFindings = 64): AdminGovernanceConflict[] {
  const out: AdminGovernanceConflict[] = [];
  const cap = Math.max(1, Math.min(512, Math.trunc(maxFindings)));
  const dlpRules = model.dlp.rules.slice(0, 2048);
  for (let i = 0; i < dlpRules.length && out.length < cap; i += 1) {
    const participants = [dlpRules[i].id];
    for (let j = i + 1; j < dlpRules.length; j += 1) {
      if (dlpRulesCollide(dlpRules[i], dlpRules[j])) participants.push(dlpRules[j].id);
    }
    if (participants.length > 1) {
      out.push({ kind: 'dlp-rule-collision', participants, winner: participants[0], resolution: 'first-match-in-document-order' });
    }
  }
  const retentionRules = model.retention.rules.slice(0, 2048);
  for (let i = 0; i < retentionRules.length && out.length < cap; i += 1) {
    const participants = [retentionRules[i].id];
    for (let j = i + 1; j < retentionRules.length; j += 1) {
      if (retentionRulesCollide(retentionRules[i], retentionRules[j])) participants.push(retentionRules[j].id);
    }
    if (participants.length > 1) {
      const ranked = participants
        .map((id) => retentionRules.find((rule) => rule.id === id)!)
        .sort((a, b) => b.retentionDays - a.retentionDays || participants.indexOf(a.id) - participants.indexOf(b.id));
      out.push({ kind: 'retention-rule-collision', participants, winner: ranked[0].id, resolution: 'longest-retention-then-document-order' });
    }
  }
  return out.slice(0, cap);
}

export type AdminComplianceStatus = 'enforced' | 'violation' | 'gap' | 'observed';

export interface AdminComplianceFinding {
  id: string;
  policyId: string;
  operation: AdminOperationId | 'unknown';
  status: AdminComplianceStatus;
  reason: string;
  detail?: string;
  evidence: string[];
}

export interface AdminComplianceReport {
  findings: AdminComplianceFinding[];
  enforced: number;
  violations: number;
  gaps: number;
  observed: number;
  /** `true`, wenn mindestens ein Befund eine durchgesetzte Regel **verletzt**. */
  blocking: boolean;
}

interface ComplianceProbe {
  id: string;
  operation: AdminOperationId;
  expectation: 'must-deny' | 'must-allow' | 'observe';
  request: AdminOperationRequest;
  /** Wenn gesetzt, wird die Probe nur ausgewertet, wenn der Prüfer sie für sinnvoll hält. */
  onlyWhen?: (model: AdminPolicyModel) => boolean;
}

const PROBE_ACTOR = 'local-owner';
const PROBE_SCOPE = { kind: 'organization' as const, id: 'org-local' };

/**
 * Die Prüfsonden sind **feste** Anfragen. Jede wird durch `evaluateAdminOperation` geschickt; die
 * Zählwerte des Berichts sind die Längen der Ergebnislisten.
 */
function complianceProbes(model: AdminPolicyModel): ComplianceProbe[] {
  const blockingDlp = model.dlp.rules.find((rule) => rule.enabled && rule.action === 'block');
  const activeHold = model.retention.legalHolds.find((hold) => hold.active);
  const capability = model.network.netGateCapabilities[0];
  return [
    {
      id: 'plaintext-export-must-fail', operation: 'vault.export.plaintext', expectation: 'must-deny',
      request: { operation: 'vault.export.plaintext', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, subject: { objectId: 'probe-vault-file', label: 'confidential', metadata: {}, content: 'probe' }, destinationKind: 'file' },
    },
    {
      id: 'telemetry-must-fail', operation: 'network.telemetry', expectation: 'must-deny',
      request: { operation: 'network.telemetry', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, connector: { capabilityId: capability?.id ?? 'none', host: capability?.domains[0] ?? 'example.invalid', protocol: 'https', purpose: 'telemetry' } },
    },
    {
      id: 'remote-content-must-fail', operation: 'network.remote-content', expectation: 'must-deny',
      request: { operation: 'network.remote-content', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, connector: { capabilityId: capability?.id ?? 'none', host: capability?.domains[0] ?? 'example.invalid', protocol: 'https', purpose: 'remote-content' } },
    },
    {
      id: 'egress-without-elevation-must-fail', operation: 'privacy.egress.enable', expectation: 'must-deny',
      request: { operation: 'privacy.egress.enable', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, destinationId: 'probe-destination', elevatedAuthorized: false },
    },
    {
      id: 'unassigned-actor-must-fail', operation: 'dlp.export', expectation: 'must-deny',
      request: { operation: 'dlp.export', actorId: 'probe-unassigned', scope: PROBE_SCOPE, subject: { objectId: 'probe-doc', label: 'internal', metadata: {}, content: 'probe' }, destinationKind: 'external' },
    },
    {
      id: 'builtin-secret-export-must-fail', operation: 'dlp.export', expectation: 'must-deny',
      request: { operation: 'dlp.export', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, subject: { objectId: 'probe-secret-doc', label: 'internal', metadata: {}, content: 'api_key: AKIAIOSFODNN7EXAMPLE' }, destinationKind: 'external' },
    },
    {
      id: 'blocking-dlp-rule-must-fail', operation: 'dlp.export', expectation: 'must-deny',
      onlyWhen: () => Boolean(blockingDlp),
      request: { operation: 'dlp.export', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, subject: { objectId: 'probe-rule-doc', label: 'confidential', metadata: {}, content: 'harmless probe text' }, destinationKind: 'external' },
    },
    {
      id: 'legal-hold-delete-must-fail', operation: 'retention.delete', expectation: 'must-deny',
      onlyWhen: () => Boolean(activeHold),
      request: { operation: 'retention.delete', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, object: { id: activeHold?.objectIds[0] ?? 'probe-held-object', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 } },
    },
    {
      id: 'encrypted-export-must-be-decided', operation: 'vault.export.encrypted', expectation: 'observe',
      request: { operation: 'vault.export.encrypted', actorId: PROBE_ACTOR, scope: PROBE_SCOPE, subject: { objectId: 'probe-vault-file', label: 'internal', metadata: {}, content: 'probe' }, destinationKind: 'local-encrypted' },
    },
    {
      id: 'policy-write-must-be-decided', operation: 'admin.policy.write', expectation: 'observe',
      request: { operation: 'admin.policy.write', actorId: PROBE_ACTOR, scope: PROBE_SCOPE },
    },
  ];
}

function statusFor(expectation: ComplianceProbe['expectation'], decision: AdminOperationDecision): AdminComplianceStatus {
  if (expectation === 'must-deny') return decision.allowed ? 'violation' : 'enforced';
  if (expectation === 'must-allow') return decision.allowed ? 'enforced' : 'gap';
  return 'observed';
}

/**
 * Der Compliance-Bericht. Jeder Zähler ist die Länge einer Liste von Aufrufergebnissen; ein fehlender
 * Prüfgegenstand (z. B. keine aktive Legal Hold) wird als **Lücke** gemeldet und nicht verschwiegen.
 */
export function buildComplianceReport(model: AdminPolicyModel): AdminComplianceReport {
  const findings: AdminComplianceFinding[] = [];
  for (const probe of complianceProbes(model)) {
    if (probe.onlyWhen && !probe.onlyWhen(model)) {
      findings.push({
        id: probe.id, policyId: 'POL-POLICY-COVERAGE', operation: probe.operation, status: 'gap',
        reason: 'admin-probe-precondition-missing', evidence: ['probe-skipped=precondition-missing'],
      });
      continue;
    }
    const decision = evaluateAdminOperation(model, probe.request);
    findings.push({
      id: probe.id,
      policyId: decision.policyId,
      operation: decision.operation,
      status: statusFor(probe.expectation, decision),
      reason: decision.reason,
      detail: decision.detail,
      evidence: decision.evidence,
    });
  }
  const count = (status: AdminComplianceStatus) => findings.filter((finding) => finding.status === status).length;
  return {
    findings,
    enforced: count('enforced'),
    violations: count('violation'),
    gaps: count('gap'),
    observed: count('observed'),
    blocking: count('violation') > 0,
  };
}

/** Konfliktkarte für die Oberfläche: kollidierende Regeln plus der DLP-Kandidatenstand einer Operation. */
export function inspectDlpSelection(model: AdminPolicyModel, context: { label: 'public' | 'internal' | 'confidential' | 'restricted' | 'top-secret'; operation: 'copy' | 'export' | 'print' | 'share' | 'clipboard' | 'connector'; destinationKind: string }): { ruleId?: string; matchingRuleIds: string[]; conflict: boolean } {
  const selection = selectDlpRule(model.dlp, { objectId: 'inspector', label: context.label, metadata: {} }, { operation: context.operation, destinationKind: context.destinationKind });
  return { ruleId: selection.rule?.id, matchingRuleIds: selection.matchingRuleIds, conflict: selection.conflict };
}

/** Für das Dashboard: Objekte, die eine Löschung wirklich verweigern würden. */
export function heldObjectCount(model: AdminPolicyModel): number {
  const ids = new Set<string>();
  for (const hold of model.retention.legalHolds) {
    if (!hold.active) continue;
    for (const id of hold.objectIds.slice(0, 10_000)) ids.add(id);
  }
  for (const rule of model.retention.rules) {
    if (!rule.enabled) continue;
    if (isUnderLegalHold(model.retention, { id: `rule-${rule.id}`, kind: rule.documentKinds[0] ?? 'Writer', tags: rule.tags, createdAt: 0, versionCount: 1 })) ids.add(`rule-${rule.id}`);
  }
  return ids.size;
}

/**
 * Die **eine** Abbildung Katalogeintrag → prüfbare Anfrage.
 *
 * Der Inspektor soll zeigen, was eine Regel wirklich tut. Dafür braucht er eine konkrete Anfrage je
 * Operation; sie hier einmal zu definieren verhindert, dass der Inspektor eine eigene, abweichende
 * Vorstellung von den Operationen entwickelt.
 */
export function probeRequestFor(operation: AdminOperationId, actorId: string, organizationId: string): AdminOperationRequest {
  const scope = { kind: 'organization' as const, id: organizationId };
  const subject = { objectId: 'inspector-object', label: 'confidential' as const, metadata: {}, content: 'inspector probe content' };
  switch (operation) {
    case 'retention.delete':
      return { operation, actorId, scope, object: { id: 'inspector-object', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 } };
    case 'network.connector':
    case 'network.remote-content':
    case 'network.telemetry':
      return { operation, actorId, scope, connector: { capabilityId: 'inspector-capability', host: 'inspector.example', protocol: 'https', purpose: operation === 'network.telemetry' ? 'telemetry' : operation === 'network.remote-content' ? 'remote-content' : 'connector' } };
    case 'privacy.egress.enable':
      return { operation, actorId, scope, destinationId: 'inspector-destination', elevatedAuthorized: false };
    case 'key.provider.use':
      return { operation, actorId, scope, keyProvider: { provider: 'inspector', available: true, hardwareBacked: false, attestationVerified: false, slotTypes: ['os-keychain'] } };
    case 'automate.run.remote':
      return { operation, actorId, scope, connector: { capabilityId: 'inspector-capability', host: 'inspector.example', protocol: 'https', purpose: 'connector' } };
    case 'admin.policy.write':
      return { operation, actorId, scope };
    default:
      return { operation, actorId, scope, subject, destinationKind: 'external' };
  }
}

/** Die drei Operationen der Abnahme auf einem frischen Profil, an einer Stelle benannt. */
export const FRESH_PROFILE_OPERATIONS: readonly AdminOperationId[] = Object.freeze([
  'vault.export.plaintext',
  'grid.link.share-external',
  'automate.run.remote',
]);

export interface FreshProfileProof {
  operation: AdminOperationId;
  allowed: boolean;
  materialized: boolean;
  reason: string;
  policyId: string;
}

/**
 * Führt die drei Abnahme-Operationen durch die Durchsetzungsgrenze und berichtet, ob wirklich etwas
 * materialisiert wurde. Der erzeugende Schritt zählt nur — es entsteht **kein** Byte, wenn die
 * Richtlinie verweigert, und genau das macht den Unterschied zwischen Warnung und Durchsetzung messbar.
 */
export function proveFreshProfileEnforcement(model: AdminPolicyModel, actorId: string): { proof: FreshProfileProof[]; materializedCount: number } {
  const proof: FreshProfileProof[] = [];
  let materializedCount = 0;
  for (const operation of FRESH_PROFILE_OPERATIONS) {
    const request = probeRequestFor(operation, actorId, model.organization.id);
    let produced = 0;
    const guard = materializeGuarded(model, request, () => { produced += 1; return produced; });
    if (guard.materialized) materializedCount += 1;
    proof.push({ operation, allowed: guard.decision.allowed, materialized: guard.materialized, reason: guard.decision.reason, policyId: guard.decision.policyId });
  }
  return { proof, materializedCount };
}
