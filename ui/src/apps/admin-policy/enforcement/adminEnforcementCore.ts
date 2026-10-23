// STATUS: PLATIN — the ONE authority for "which admin policy decides which operation".
//
// **Warum dieses Modul existiert (gemessen, nicht vermutet):** Admin & Policy hatte dreizehn
// Auswertungsfunktionen, und **keine** davon war ein Durchsetzungspunkt. `enforceDlpBoundary`,
// `assertRetentionDeletionAllowed`, `assignRole`, `packVAdmin`, `exportAdminPortablePackage`,
// `verifyOrganizationPolicyManifest` hatten null Aufrufer außerhalb ihres eigenen Testordners. Die
// Oberfläche zeigte Regelzahlen, und ein Nutzer konnte daraus „Compliance" lesen, während keine einzige
// Operation blockiert wurde. Genau das ist das Fehlerbild, das hier zählt: **eine angezeigte Regel ist
// keine durchgesetzte Regel.**
//
// **Kein zweiter Mechanismus:** dieses Modul erfindet keine Regeln. Es ist die Landkarte
// `Operation → Policy-ID → durchsetzender Hook` und ruft für jede Operation genau die vorhandene
// Auswertungsfunktion auf, die den Fakt schon besitzt (DLP, Retention, NetGate, Key-Policy, RBAC).
//
// **Fail-closed:** ein fehlendes, fremd-versioniertes oder unlesbares Richtliniendokument **verweigert**.
// Eine Autoritätsfunktion, die bei unbrauchbarer Eingabe **wirft**, ist ebenfalls falsch: jede
// unbrauchbare Eingabe wird zu einer benannten Ablehnung, nie zu einem Absturz und nie zu einem
// stillen Zugeständnis.

import type { AdminCapability, AdminPolicyModel, AdminScope, DlpOperation } from '../model/types';
import { evaluateDlp, type DlpSubject } from '../policies/adminDlpCore';
import { retentionLockState, type RetentionObject } from '../compliance/adminRetentionCore';
import { evaluateConnectorPolicy, type ConnectorRequest } from '../policies/adminNetworkPolicyCore';
import { evaluateKeyProvider, type KeyProviderEvidence } from '../security/adminKeyPolicyCore';
import { hasAdminCapability } from '../security/adminRbacCore';
import { appendAuditEvent, assertAuditInputContainsNoContent } from '../compliance/adminAuditCore';

export const ADMIN_POLICY_SCHEMA = 'vgt.admin.policy/1';

export type AdminOperationId =
  | 'admin.policy.write'
  | 'vault.export.plaintext'
  | 'vault.export.encrypted'
  | 'grid.link.share-external'
  | 'automate.run.remote'
  | 'dlp.copy'
  | 'dlp.export'
  | 'dlp.print'
  | 'dlp.share'
  | 'dlp.clipboard'
  | 'dlp.connector'
  | 'retention.delete'
  | 'network.connector'
  | 'network.remote-content'
  | 'network.telemetry'
  | 'privacy.egress.enable'
  | 'key.provider.use';

/** Stabiler Fehlercode-Katalog. Der Klartext dazu liegt in der Locale-Schicht, nicht hier. */
export type AdminEnforcementReason =
  | 'admin-allowed'
  | 'admin-policy-unavailable'
  | 'admin-policy-schema-unsupported'
  | 'admin-request-invalid'
  | 'admin-operation-unknown'
  | 'admin-rbac-denied'
  | 'admin-capability-denied'
  | 'admin-vault-plaintext-export-forbidden'
  | 'admin-encryption-policy-unenforceable'
  | 'admin-automation-remote-undeclared'
  | 'admin-dlp-denied'
  | 'admin-dlp-policy-invalid'
  | 'admin-retention-delete-denied'
  | 'admin-retention-policy-invalid'
  | 'admin-network-denied'
  | 'admin-network-policy-invalid'
  | 'admin-telemetry-hard-disabled'
  | 'admin-privacy-elevated-authorization-required'
  | 'admin-privacy-policy-invalid'
  | 'admin-key-provider-denied'
  | 'admin-key-policy-invalid';

/**
 * Dieselben Codes zur Laufzeit — eine Definition für Prüfungen (Locales, Berichte).
 *
 * Ein Typ ist zur Laufzeit nicht aufzählbar; ohne diese Liste müsste ein Test die Codes abschreiben,
 * und eine zweite Abschrift veraltet.
 */
export const ADMIN_ENFORCEMENT_REASON_CODES: readonly AdminEnforcementReason[] = Object.freeze([
  'admin-allowed',
  'admin-policy-unavailable',
  'admin-policy-schema-unsupported',
  'admin-request-invalid',
  'admin-operation-unknown',
  'admin-rbac-denied',
  'admin-capability-denied',
  'admin-vault-plaintext-export-forbidden',
  'admin-encryption-policy-unenforceable',
  'admin-automation-remote-undeclared',
  'admin-dlp-denied',
  'admin-dlp-policy-invalid',
  'admin-retention-delete-denied',
  'admin-retention-policy-invalid',
  'admin-network-denied',
  'admin-network-policy-invalid',
  'admin-telemetry-hard-disabled',
  'admin-privacy-elevated-authorization-required',
  'admin-privacy-policy-invalid',
  'admin-key-provider-denied',
  'admin-key-policy-invalid',
]);

export interface AdminOperationRequest {
  operation: AdminOperationId;
  actorId: string;
  scope: AdminScope;
  /** Nur für `dlp.*`, `vault.export.*`, `grid.link.share-external`. */
  subject?: DlpSubject;
  destinationKind?: string;
  destinationId?: string;
  recipientEncrypted?: boolean;
  justification?: string;
  /** Nur für `retention.delete`. */
  object?: RetentionObject;
  /** Nur für `network.*` und `automate.run.remote`. */
  connector?: ConnectorRequest;
  /** Nur für `key.provider.use`. */
  keyProvider?: KeyProviderEvidence;
  /** Nur für `privacy.egress.enable`: ausdrücklich erhöhte Autorisierung. */
  elevatedAuthorized?: boolean;
}

export interface AdminOperationDecision {
  allowed: boolean;
  operation: AdminOperationId | 'unknown';
  /** Stabile Policy-ID für die Nachweis-Matrix (`AST-1876`). */
  policyId: string;
  /** Die Funktion, die diese Entscheidung tatsächlich fällt. */
  hook: string;
  reason: AdminEnforcementReason;
  /** Der Grund der Fach-Auswertung (z. B. `dlp-block`), damit nichts verloren geht. */
  detail?: string;
  /** Begrenzte Herkunftszeilen: was gelesen wurde, nicht was behauptet wird. */
  evidence: string[];
}

export interface AdminOperationMatrixEntry {
  operation: AdminOperationId;
  policyId: string;
  hook: string;
  /** Quelldatei der Regeldefinition. */
  source: string;
  /** Der Testfall, der diese Zeile rot werden lässt. */
  test: string;
}

/**
 * Policy-ID → Source-Handler → Testfall, an EINER Stelle.
 *
 * Der Test `adminEnforcementMatrix.test.mjs` liest diese Matrix **und** die genannten Quelldateien und
 * verlangt für jede Zeile, dass Policy-ID, Hook-Name und Zieldatei wirklich existieren. Eine Zeile ohne
 * Deckung ist damit ein roter Test und kein Häkchen.
 */
export const ADMIN_ENFORCEMENT_MATRIX: readonly AdminOperationMatrixEntry[] = Object.freeze([
  { operation: 'admin.policy.write', policyId: 'POL-RBAC-POLICY-WRITE', hook: 'hasAdminCapability', source: 'security/adminRbacCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'vault.export.plaintext', policyId: 'POL-ENC-NATIVE-ONLY', hook: 'decideVaultExport', source: 'enforcement/adminEnforcementCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'vault.export.encrypted', policyId: 'POL-ENC-NATIVE-ONLY', hook: 'decideVaultExport', source: 'enforcement/adminEnforcementCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'grid.link.share-external', policyId: 'POL-DLP-RULE-SET', hook: 'evaluateDlp', source: 'policies/adminDlpCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'automate.run.remote', policyId: 'POL-NET-CONNECTOR', hook: 'evaluateConnectorPolicy', source: 'policies/adminNetworkPolicyCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'dlp.copy', policyId: 'POL-DLP-RULE-SET', hook: 'evaluateDlp', source: 'policies/adminDlpCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'dlp.export', policyId: 'POL-DLP-RULE-SET', hook: 'evaluateDlp', source: 'policies/adminDlpCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'dlp.print', policyId: 'POL-DLP-RULE-SET', hook: 'evaluateDlp', source: 'policies/adminDlpCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'dlp.share', policyId: 'POL-DLP-RULE-SET', hook: 'evaluateDlp', source: 'policies/adminDlpCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'dlp.clipboard', policyId: 'POL-DLP-RULE-SET', hook: 'evaluateDlp', source: 'policies/adminDlpCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'dlp.connector', policyId: 'POL-DLP-RULE-SET', hook: 'evaluateDlp', source: 'policies/adminDlpCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'retention.delete', policyId: 'POL-RET-LOCK', hook: 'retentionLockState', source: 'compliance/adminRetentionCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'network.connector', policyId: 'POL-NET-CONNECTOR', hook: 'evaluateConnectorPolicy', source: 'policies/adminNetworkPolicyCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'network.remote-content', policyId: 'POL-NET-REMOTE-CONTENT', hook: 'evaluateConnectorPolicy', source: 'policies/adminNetworkPolicyCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'network.telemetry', policyId: 'POL-NET-TELEMETRY-DENY', hook: 'evaluateConnectorPolicy', source: 'policies/adminNetworkPolicyCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'privacy.egress.enable', policyId: 'POL-PRIV-EGRESS-ELEVATED', hook: 'decidePrivacyEgress', source: 'enforcement/adminEnforcementCore.ts', test: 'adminEnforcementCore.test.ts' },
  { operation: 'key.provider.use', policyId: 'POL-KEY-PROVIDER', hook: 'evaluateKeyProvider', source: 'security/adminKeyPolicyCore.ts', test: 'adminEnforcementCore.test.ts' },
]);

const MATRIX_BY_OPERATION = new Map<string, AdminOperationMatrixEntry>(
  ADMIN_ENFORCEMENT_MATRIX.map((entry) => [entry.operation, entry]),
);

const DLP_OPERATION_BY_ID: Readonly<Record<string, DlpOperation>> = Object.freeze({
  'dlp.copy': 'copy',
  'dlp.export': 'export',
  'dlp.print': 'print',
  'dlp.share': 'share',
  'dlp.clipboard': 'clipboard',
  'dlp.connector': 'connector',
});

/**
 * Dieselbe Operation braucht überall dieselbe Fähigkeit — hier genau einmal festgelegt.
 *
 * **Gemessen und korrigiert:** die erste Fassung verlangte für **Dokument**-Operationen die
 * Verwaltungsfähigkeit des jeweiligen Bereichs (`retention.manage` für `retention.delete`,
 * `connector.manage` für `network.connector`). Damit entschied auf dem Standardprofil immer die
 * Rollenprüfung und **nie** die Fachregel: die Legal-Hold-Regel war erreichbar, aber nie befragt — genau
 * das Fehlerbild „angezeigt, nicht durchgesetzt", nur eine Ebene tiefer. Dokument-Operationen verlangen
 * deshalb nur `policy.read` (irgendein bekanntes, zugeordnetes Subjekt), und die Fachregel entscheidet;
 * **Richtlinienänderungen** (`admin.policy.write`, `privacy.egress.enable`) verlangen weiterhin die
 * Verwaltungsfähigkeit, weil dort die Richtlinie selbst geschrieben wird.
 */
const REQUIRED_CAPABILITY: Readonly<Record<string, AdminCapability>> = Object.freeze({
  'admin.policy.write': 'policy.write',
  'vault.export.plaintext': 'policy.read',
  'vault.export.encrypted': 'policy.read',
  'grid.link.share-external': 'policy.read',
  'automate.run.remote': 'policy.read',
  'dlp.copy': 'policy.read',
  'dlp.export': 'policy.read',
  'dlp.print': 'policy.read',
  'dlp.share': 'policy.read',
  'dlp.clipboard': 'policy.read',
  'dlp.connector': 'policy.read',
  'retention.delete': 'policy.read',
  'network.connector': 'policy.read',
  'network.remote-content': 'policy.read',
  'network.telemetry': 'policy.read',
  'privacy.egress.enable': 'privacy.manage',
  'key.provider.use': 'policy.read',
});

const MAX_EVIDENCE = 8;
const MAX_EVIDENCE_LINE = 192;

function line(value: string): string {
  return value.replace(/[\r\n\t]/g, ' ').trim().slice(0, MAX_EVIDENCE_LINE);
}

function boundedEvidence(values: readonly string[]): string[] {
  return values.filter((value) => typeof value === 'string' && value.length > 0).slice(0, MAX_EVIDENCE).map(line);
}

/**
 * Prüft, ob ein **unbekanntes** Objekt ein benutzbares Richtliniendokument ist.
 *
 * Ein Richtliniendokument ist feindliche Eingabe (Import, `.vpolicy`-Datei, Speicher). Deshalb wird
 * jedes Feld, das die Auswertung gleich liest, vorher auf Form geprüft — und eine Abweichung ist eine
 * Ablehnung, kein `TypeError`.
 */
function usableModel(model: unknown): model is AdminPolicyModel {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return false;
  const candidate = model as Partial<AdminPolicyModel>;
  if (candidate.schema !== ADMIN_POLICY_SCHEMA) return false;
  if (!candidate.organization || typeof candidate.organization !== 'object') return false;
  if (typeof candidate.organization.id !== 'string' || !candidate.organization.id) return false;
  if (!Array.isArray(candidate.roles) || !Array.isArray(candidate.assignments) || !Array.isArray(candidate.breakGlass)) return false;
  if (!candidate.audit || !Array.isArray(candidate.audit.events) || !candidate.audit.clock) return false;
  if (!candidate.dlp || !Array.isArray(candidate.dlp.rules)) return false;
  if (!candidate.retention || !Array.isArray(candidate.retention.rules) || !Array.isArray(candidate.retention.legalHolds)) return false;
  if (!candidate.network || !Array.isArray(candidate.network.netGateCapabilities)) return false;
  if (!candidate.encryption || typeof candidate.encryption !== 'object') return false;
  return true;
}

function deny(
  operation: AdminOperationId | 'unknown',
  reason: AdminEnforcementReason,
  evidence: readonly string[],
  detail?: string,
): AdminOperationDecision {
  const entry = operation === 'unknown' ? undefined : MATRIX_BY_OPERATION.get(operation);
  return {
    allowed: false,
    operation,
    policyId: entry?.policyId ?? 'POL-POLICY-AVAILABILITY',
    hook: entry?.hook ?? 'evaluateAdminOperation',
    reason,
    detail,
    evidence: boundedEvidence(evidence),
  };
}

function allow(
  operation: AdminOperationId,
  reason: AdminEnforcementReason,
  evidence: readonly string[],
  detail?: string,
): AdminOperationDecision {
  const entry = MATRIX_BY_OPERATION.get(operation);
  return {
    allowed: true,
    operation,
    policyId: entry?.policyId ?? 'POL-POLICY-AVAILABILITY',
    hook: entry?.hook ?? 'evaluateAdminOperation',
    reason,
    detail,
    evidence: boundedEvidence(evidence),
  };
}

function usableRequest(request: unknown): request is AdminOperationRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false;
  const candidate = request as Partial<AdminOperationRequest>;
  if (typeof candidate.operation !== 'string') return false;
  if (typeof candidate.actorId !== 'string' || !candidate.actorId.trim() || candidate.actorId.length > 192) return false;
  if (!candidate.scope || typeof candidate.scope !== 'object') return false;
  if (typeof (candidate.scope as AdminScope).kind !== 'string' || typeof (candidate.scope as AdminScope).id !== 'string') return false;
  return true;
}

/** Die Fähigkeitsprüfung, die jede Operation zuerst durchläuft. */
function decideCapability(model: AdminPolicyModel, request: AdminOperationRequest): AdminOperationDecision | null {
  const capability = REQUIRED_CAPABILITY[request.operation];
  const actor = request.actorId.trim().slice(0, 192);
  const scope: AdminScope = { kind: request.scope.kind, id: String(request.scope.id).slice(0, 192) };
  if (!capability) {
    return deny(request.operation, 'admin-operation-unknown', [`operation=${request.operation}`]);
  }
  if (!hasAdminCapability(model, actor, capability, scope)) {
    return deny(request.operation, 'admin-rbac-denied', [`actor=${actor}`, `capability=${capability}`, `scope=${scope.kind}:${scope.id}`], capability);
  }
  return null;
}

function decideVaultExport(model: AdminPolicyModel, request: AdminOperationRequest): AdminOperationDecision {
  if (model.encryption.requireNativeEncryption !== true || model.encryption.implicitMasterKey !== false) {
    // Eine Richtlinie, die native Verschlüsselung nicht mehr erzwingt, ist als Autorität unbrauchbar:
    // sie wird nicht „großzügig" interpretiert, sondern verweigert.
    return deny(request.operation, 'admin-encryption-policy-unenforceable', [
      `requireNativeEncryption=${String(model.encryption.requireNativeEncryption)}`,
      `implicitMasterKey=${String(model.encryption.implicitMasterKey)}`,
    ]);
  }
  if (!Array.isArray(model.encryption.allowedKeySlotTypes) || model.encryption.allowedKeySlotTypes.length === 0) {
    return deny(request.operation, 'admin-encryption-policy-unenforceable', ['allowedKeySlotTypes=empty']);
  }
  if (request.operation === 'vault.export.plaintext') {
    return deny(request.operation, 'admin-vault-plaintext-export-forbidden', [
      'plaintext-export-requested',
      'requireNativeEncryption=true',
    ]);
  }
  return decideDlpOperation(model, request, 'export');
}

function decideDlpOperation(model: AdminPolicyModel, request: AdminOperationRequest, operation: DlpOperation): AdminOperationDecision {
  const subject: DlpSubject = request.subject ?? { objectId: 'unnamed', label: 'internal', metadata: {} };
  try {
    const decision = evaluateDlp(
      model.dlp,
      subject,
      {
        operation,
        destinationKind: request.destinationKind ?? 'external',
        destinationId: request.destinationId,
        recipientEncrypted: request.recipientEncrypted,
        justification: request.justification,
      },
      false,
    );
    const evidence = [
      `operation=${operation}`,
      `destination=${request.destinationKind ?? 'external'}`,
      `ruleId=${decision.ruleId ?? 'default'}`,
      `action=${decision.action}`,
    ];
    return decision.allowed
      ? allow(request.operation, 'admin-allowed', evidence, decision.reason)
      : deny(request.operation, 'admin-dlp-denied', evidence, decision.reason);
  } catch (error) {
    // Eine unlesbare DLP-Regel (z. B. ein unsicherer Ausdruck) darf die Operation nicht durchlassen.
    return deny(request.operation, 'admin-dlp-policy-invalid', [`operation=${operation}`, `error=${describe(error)}`]);
  }
}

function decideRetentionDelete(model: AdminPolicyModel, request: AdminOperationRequest): AdminOperationDecision {
  if (!request.object || typeof request.object !== 'object' || typeof request.object.id !== 'string') {
    return deny(request.operation, 'admin-request-invalid', ['object=missing']);
  }
  try {
    const state = retentionLockState(model.retention, request.object, Date.now());
    const evidence = [`object=${line(request.object.id)}`, `lock=${state.reason}`, `ruleId=${state.ruleId ?? 'none'}`];
    return state.locked
      ? deny(request.operation, 'admin-retention-delete-denied', evidence, state.reason)
      : allow(request.operation, 'admin-allowed', evidence, state.reason);
  } catch (error) {
    return deny(request.operation, 'admin-retention-policy-invalid', [`error=${describe(error)}`]);
  }
}

function decideNetwork(model: AdminPolicyModel, request: AdminOperationRequest, purpose: ConnectorRequest['purpose']): AdminOperationDecision {
  const connector: ConnectorRequest = request.connector
    ? { ...request.connector, purpose }
    : { capabilityId: '', host: '', protocol: 'https', purpose };
  try {
    const decision = evaluateConnectorPolicy(model.network, connector);
    const evidence = [
      `purpose=${purpose}`,
      `capability=${line(connector.capabilityId)}`,
      `host=${line(connector.host)}`,
      `protocol=${connector.protocol}`,
    ];
    if (!decision.allowed && decision.reason === 'telemetry-policy-hard-disabled') {
      return deny(request.operation, 'admin-telemetry-hard-disabled', evidence, decision.reason);
    }
    return decision.allowed
      ? allow(request.operation, 'admin-allowed', evidence, decision.reason)
      : deny(request.operation, 'admin-network-denied', evidence, decision.reason);
  } catch (error) {
    return deny(request.operation, 'admin-network-policy-invalid', [`error=${describe(error)}`]);
  }
}

function decidePrivacyEgress(model: AdminPolicyModel, request: AdminOperationRequest): AdminOperationDecision {
  if (model.privacy.diagnosticsMode !== 'local-only' || model.privacy.analyticsEnabled !== false || model.privacy.egressChangeRequiresElevatedAuth !== true) {
    return deny(request.operation, 'admin-privacy-policy-invalid', [
      `diagnosticsMode=${String(model.privacy.diagnosticsMode)}`,
      `analyticsEnabled=${String(model.privacy.analyticsEnabled)}`,
    ]);
  }
  if (request.elevatedAuthorized !== true) {
    return deny(request.operation, 'admin-privacy-elevated-authorization-required', ['elevatedAuthorized=false']);
  }
  return allow(request.operation, 'admin-allowed', ['destination=' + line(request.destinationId ?? 'unnamed')], 'egress-change-authorized');
}

function decideKeyProvider(model: AdminPolicyModel, request: AdminOperationRequest): AdminOperationDecision {
  if (!request.keyProvider || typeof request.keyProvider !== 'object') {
    return deny(request.operation, 'admin-request-invalid', ['keyProvider=missing']);
  }
  try {
    const result = evaluateKeyProvider(model.encryption, request.keyProvider);
    const evidence = [`provider=${line(request.keyProvider.provider)}`, `hardwareClaim=${line(result.hardwareClaim)}`];
    return result.allowed
      ? allow(request.operation, 'admin-allowed', evidence, result.reason)
      : deny(request.operation, 'admin-key-provider-denied', evidence, result.reason);
  } catch (error) {
    return deny(request.operation, 'admin-key-policy-invalid', [`error=${describe(error)}`]);
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return line(error.message);
  return line(String(error));
}

/**
 * Die eine Autoritätsentscheidung.
 *
 * Nimmt **unbekannte** Eingaben entgegen, weil ihre Aufrufer Dateien, Importe und IPC-Antworten
 * weitergeben. Sie wirft nie; jede unbrauchbare Eingabe wird zu einer benannten Ablehnung.
 */
export function evaluateAdminOperation(model: unknown, request: unknown): AdminOperationDecision {
  if (!usableRequest(request)) return deny('unknown', 'admin-request-invalid', ['request=malformed']);
  const operation = request.operation;
  if (!MATRIX_BY_OPERATION.has(operation)) return deny('unknown', 'admin-operation-unknown', [`operation=${line(String(operation))}`]);
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return deny(operation, 'admin-policy-unavailable', ['policy=absent']);
  }
  if ((model as Partial<AdminPolicyModel>).schema !== ADMIN_POLICY_SCHEMA) {
    return deny(operation, 'admin-policy-schema-unsupported', [`schema=${line(String((model as Partial<AdminPolicyModel>).schema))}`]);
  }
  if (!usableModel(model)) return deny(operation, 'admin-policy-unavailable', ['policy=unreadable']);
  const capability = decideCapability(model, request);
  if (capability) return capability;
  switch (operation) {
    case 'admin.policy.write':
      return allow(operation, 'admin-allowed', ['capability=policy.write'], 'policy-write-authorized');
    case 'vault.export.plaintext':
    case 'vault.export.encrypted':
      return decideVaultExport(model, request);
    case 'grid.link.share-external':
      return decideDlpOperation(model, request, 'share');
    case 'automate.run.remote':
      if (!request.connector) return deny(operation, 'admin-automation-remote-undeclared', ['connector=missing']);
      return decideNetwork(model, request, 'connector');
    case 'dlp.copy':
    case 'dlp.export':
    case 'dlp.print':
    case 'dlp.share':
    case 'dlp.clipboard':
    case 'dlp.connector':
      return decideDlpOperation(model, request, DLP_OPERATION_BY_ID[operation]);
    case 'retention.delete':
      return decideRetentionDelete(model, request);
    case 'network.connector':
      return decideNetwork(model, request, 'connector');
    case 'network.remote-content':
      return decideNetwork(model, request, 'remote-content');
    case 'network.telemetry':
      return decideNetwork(model, request, 'telemetry');
    case 'privacy.egress.enable':
      return decidePrivacyEgress(model, request);
    case 'key.provider.use':
      return decideKeyProvider(model, request);
    default:
      return deny('unknown', 'admin-operation-unknown', [`operation=${line(String(operation))}`]);
  }
}

export class AdminOperationDenied extends Error {
  constructor(public readonly decision: AdminOperationDecision) {
    super(`admin-policy-denied:${decision.reason}`);
    this.name = 'AdminOperationDenied';
  }
}

/** Der Wurf-Pfad für Aufrufer, die **vor** der Materialisierung abbrechen müssen. */
export function requireAdminOperation(model: unknown, request: unknown): AdminOperationDecision {
  const decision = evaluateAdminOperation(model, request);
  if (!decision.allowed) throw new AdminOperationDenied(decision);
  return decision;
}

export interface AdminGuardedResult<T> {
  allowed: boolean;
  materialized: boolean;
  decision: AdminOperationDecision;
  value?: T;
}

/**
 * Führt eine erzeugende Operation **nur** aus, wenn die Richtlinie sie erlaubt.
 *
 * Das ist der Unterschied zwischen „Warnung" und „Durchsetzung": `produce` wird bei einer Ablehnung
 * **nicht aufgerufen**. Der Test misst das, indem `produce` einen Zähler erhöht — es gibt kein Byte,
 * das „trotzdem" entstanden ist.
 */
export function materializeGuarded<T>(model: unknown, request: unknown, produce: () => T): AdminGuardedResult<T> {
  const decision = evaluateAdminOperation(model, request);
  if (!decision.allowed) return { allowed: false, materialized: false, decision };
  return { allowed: true, materialized: true, decision, value: produce() };
}

/**
 * Schreibt die Entscheidung in das manipulationssichere Auditprotokoll — auch die **Ablehnung**.
 *
 * **Warum das hier steht und nicht im Aufrufer:** ohne diesen Schritt blieb jede Verweigerung
 * unbemerkt. Die Anforderung „AuthZ-Audit-Trail" (AST-1877) und „Policy-Änderung mit Zeit/Actor/Target
 * manipulationssicher dokumentieren" (AST-1821) verlangen genau das. `materializeGuarded` ist synchron
 * und kann deshalb nicht selbst auditieren; diese Funktion ist der eine Ort, an dem die Entscheidung
 * protokolliert wird.
 *
 * Es werden **nur** Zeitpunkt, Handelnder, Operation, Ergebnis und der benannte Grund geschrieben — der
 * Inhalt des Vorgangs nie. `assertAuditInputContainsNoContent` wacht darüber.
 */
export async function auditAdminOperationDecision(
  model: AdminPolicyModel,
  request: AdminOperationRequest,
  decision: AdminOperationDecision,
  now = Date.now(),
): Promise<AdminPolicyModel> {
  const input = {
    at: now,
    actor: String(request.actorId ?? 'unknown').slice(0, 192),
    action: `admin.operation.${decision.allowed ? 'allow' : 'deny'}`,
    objectClass: 'admin-operation',
    objectId: String(decision.operation).slice(0, 128),
    result: decision.allowed ? ('allow' as const) : ('deny' as const),
    detailCode: `${decision.policyId}/${decision.reason}`.slice(0, 256),
  };
  assertAuditInputContainsNoContent(input);
  const audit = await appendAuditEvent(model.audit, input);
  return { ...model, audit, updatedAt: now };
}
