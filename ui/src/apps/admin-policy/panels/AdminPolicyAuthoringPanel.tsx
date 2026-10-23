// STATUS: PLATIN — Autorenbereich: die Regeln, die wirklich entscheiden, bearbeitbar machen.
//
// **Warum dieses Bauteil existiert (gemessen, nicht vermutet):** Die Oberfläche zeigte Regelzahlen und
// **keinen** Schreibweg. `upsertRetentionRule`, `upsertLegalHold`, `assignRole`, `registerDevice`,
// `configureRecoveryEscrow`, `upsertDlpRule` (neu) und `upsertNetGateCapability` (neu) waren bzw. sind
// damit unerreichbar. Eine Richtlinie, die man nicht ändern kann, ist eine Anzeige.
//
// Reine Logik bleibt in den Kernen; dieses Bauteil verdrahtet nur: es hält Feldzustand, ruft die
// Kernfunktion, meldet deren Ergebnis (Erfolg oder benannte Ablehnung) und gibt das neue Dokument nach
// oben weiter. Es entscheidet nichts selbst.
import React, { useId, useState } from 'react';
import type { AdminCapability, DlpAction, DlpOperation, SensitivityLabel } from '../model/types';
import { DLP_ACTIONS, DLP_OPERATIONS, SENSITIVITY_LABELS, previewDlpDecision, removeDlpRule, upsertDlpRule } from '../policies/adminDlpCore';
import { upsertLegalHold, upsertRetentionRule } from '../compliance/adminRetentionCore';
import { adminCapabilityGrants, assignRole, hasAdminCapability } from '../security/adminRbacCore';
import { evaluateKnownDeviceDeployment, registerLocalDevice } from '../devices/adminDevicePolicyCore';
import { configureRecoveryEscrow, planKeyRotation } from '../security/adminKeyPolicyCore';
import { upsertNetGateCapability } from '../policies/adminNetworkPolicyCore';
import { buildAdminWorkspaceReference } from '../model/adminCanonicalReferenceCore';
import { auditAdminOperationDecision, evaluateAdminOperation, materializeGuarded } from '../enforcement/adminEnforcementCore';
import { useGovernanceAction } from './adminGovernanceStatus';
import type { AdminGovernancePanelProps } from './adminGovernancePanelTypes';
import './AdminPolicyViewPanels.css';

type RetentionAction = 'retain' | 'delete' | 'review';

export const AdminPolicyAuthoringPanel: React.FC<AdminGovernancePanelProps> = ({ model, copy, coreCopy, actorId, onApply }) => {
  const idPrefix = useId();
  const dlpAction = useGovernanceAction(copy.applied);
  const retentionAction = useGovernanceAction(copy.applied);
  const holdAction = useGovernanceAction(copy.applied);
  const roleAction = useGovernanceAction(copy.applied);
  const deviceAction = useGovernanceAction(copy.applied);
  const networkAction = useGovernanceAction(copy.applied);
  const escrowAction = useGovernanceAction(copy.applied);

  const [ruleId, setRuleId] = useState('dlp-rule-1');
  const [ruleLabel, setRuleLabel] = useState<SensitivityLabel>('confidential');
  const [ruleOperation, setRuleOperation] = useState<DlpOperation>('export');
  const [ruleAction, setRuleAction] = useState<DlpAction>('block');
  const [ruleDestination, setRuleDestination] = useState('external');
  const [previewContent, setPreviewContent] = useState('');

  const [retentionId, setRetentionId] = useState('retention-1');
  const [retentionKind, setRetentionKind] = useState('Writer');
  const [retentionDays, setRetentionDays] = useState('365');
  const [retentionDecision, setRetentionDecision] = useState<RetentionAction>('retain');
  const [probeObjectId, setProbeObjectId] = useState('probe-object-1');

  const [holdId, setHoldId] = useState('hold-1');
  const [holdName, setHoldName] = useState('Legal hold 1');
  const [holdObjects, setHoldObjects] = useState('probe-object-1');

  const [subjectId, setSubjectId] = useState('local-viewer');
  const [roleId, setRoleId] = useState(model.roles[0]?.id ?? 'role-helpdesk');

  const [deviceId, setDeviceId] = useState('device-local-1');
  const [deviceName, setDeviceName] = useState('This device');
  const [deviceOs, setDeviceOs] = useState('Windows');
  const [deviceVersion, setDeviceVersion] = useState('1.0.0');

  const [capabilityId, setCapabilityId] = useState('cap:connector-1');
  const [capabilityDomain, setCapabilityDomain] = useState('connector.example');
  const [capabilityProtocol, setCapabilityProtocol] = useState('https');

  const [escrowRecipient, setEscrowRecipient] = useState('recovery-key-1');
  const [escrowDisclosure, setEscrowDisclosure] = useState('Recovery disclosure text for the organisation.');

  const canAssign = hasAdminCapability(model, actorId, 'identity.assign', { kind: 'organization', id: model.organization.id });
  const grants: AdminCapability[] = adminCapabilityGrants(model, actorId);
  const preview = previewDlpDecision(
    model.dlp,
    { objectId: 'preview-object', label: ruleLabel, metadata: {}, content: previewContent },
    { operation: ruleOperation, destinationKind: ruleDestination || 'external' },
  );
  const knownDevice = model.devices[0];
  const deviceView = knownDevice ? evaluateKnownDeviceDeployment(model, knownDevice) : null;
  const rotation = planKeyRotation(model, { domainId: model.organization.id, currentKeyId: 'key-current', nextKeyId: 'key-next', recoveryProofAvailable: model.encryption.recoveryEscrow.enabled });

  const field = (suffix: string) => `${idPrefix}-${suffix}`;

  return (
    <div className="adminPolicy__contentStack" data-admin-authoring="true">
      <section className="adminPolicy__subpanel" aria-labelledby={field('dlp-heading')}>
        <p className="adminPolicy__eyebrow">{copy.authoring}</p>
        <h3 id={field('dlp-heading')} className="adminPolicy__subheading">{copy.dlpRules}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('dlp-id')} className="adminPolicy__bodyCopy">{copy.identifier}
            <input id={field('dlp-id')} className="adminPolicy__input" value={ruleId} maxLength={128} onChange={(event) => setRuleId(event.target.value)} />
          </label>
          <label htmlFor={field('dlp-label')} className="adminPolicy__bodyCopy">{copy.label}
            <select id={field('dlp-label')} className="adminPolicy__select" value={ruleLabel} onChange={(event) => setRuleLabel(event.target.value as SensitivityLabel)}>
              {SENSITIVITY_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </label>
          <label htmlFor={field('dlp-operation')} className="adminPolicy__bodyCopy">{copy.operation}
            <select id={field('dlp-operation')} className="adminPolicy__select" value={ruleOperation} onChange={(event) => setRuleOperation(event.target.value as DlpOperation)}>
              {DLP_OPERATIONS.map((operation) => <option key={operation} value={operation}>{operation}</option>)}
            </select>
          </label>
          <label htmlFor={field('dlp-action')} className="adminPolicy__bodyCopy">{copy.action}
            <select id={field('dlp-action')} className="adminPolicy__select" value={ruleAction} onChange={(event) => setRuleAction(event.target.value as DlpAction)}>
              {DLP_ACTIONS.map((action) => <option key={action} value={action}>{coreCopy.dlpActions[action]}</option>)}
            </select>
          </label>
          <label htmlFor={field('dlp-destination')} className="adminPolicy__bodyCopy">{copy.destination}
            <input id={field('dlp-destination')} className="adminPolicy__input" value={ruleDestination} maxLength={96} onChange={(event) => setRuleDestination(event.target.value)} />
          </label>
        </div>
        <button
          type="button"
          className="adminPolicy__button adminPolicy__buttonPrimary"
          onClick={() => void dlpAction.run(async () => {
            const next = await upsertDlpRule(model, {
              id: ruleId, enabled: true, labels: [ruleLabel], operations: [ruleOperation], destinationKinds: ruleDestination ? [ruleDestination] : [],
              metadataMatchers: [], contentMatchers: [], action: ruleAction,
            }, actorId);
            onApply(next);
          })}
        >
          {copy.add}
        </button>
        {dlpAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={dlpAction.status.code} data-ok={dlpAction.status.ok ? 'true' : 'false'}>
            {dlpAction.status.ok ? copy.applied : copy.reason(dlpAction.status.code)}
          </p>
        )}
        <ul className="adminPolicy__boundaryList">
          {model.dlp.rules.map((rule) => (
            <li key={rule.id}>
              <span>{rule.id}</span>
              <span data-admin-rule-action={rule.action}>{rule.action}</span>
              <button type="button" className="adminPolicy__button" onClick={() => void dlpAction.run(async () => {
                const next = await removeDlpRule(model, rule.id, actorId);
                onApply(next);
              })}>{copy.remove}</button>
            </li>
          ))}
          {model.dlp.rules.length === 0 && <li className="adminPolicy__emptyState">{copy.catalogEmpty}</li>}
        </ul>
        <div className="adminPolicy__sectionHeadingRow">
          <h4 className="adminPolicy__subheading">{copy.preview}</h4>
          <span className="adminPolicy__count" data-admin-preview-allowed={preview.allowed ? 'true' : 'false'}>
            {preview.allowed ? copy.previewAllowed : copy.previewDenied}
          </span>
        </div>
        <label htmlFor={field('dlp-preview')} className="adminPolicy__bodyCopy">{copy.testContent}
          <textarea id={field('dlp-preview')} className="adminPolicy__input" rows={3} value={previewContent} maxLength={20000} onChange={(event) => setPreviewContent(event.target.value)} />
        </label>
        <p className="adminPolicy__note" role="status" data-admin-preview-reason={preview.reason}>
          {coreCopy.reason('dlp', preview.reason)}
        </p>
        <p className="adminPolicy__bodyCopy">{copy.findings}: {preview.findings.length}</p>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('retention-heading')}>
        <h3 id={field('retention-heading')} className="adminPolicy__subheading">{copy.retentionRules}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('retention-id')} className="adminPolicy__bodyCopy">{copy.identifier}
            <input id={field('retention-id')} className="adminPolicy__input" value={retentionId} maxLength={128} onChange={(event) => setRetentionId(event.target.value)} />
          </label>
          <label htmlFor={field('retention-kind')} className="adminPolicy__bodyCopy">{copy.documentKind}
            <input id={field('retention-kind')} className="adminPolicy__input" value={retentionKind} maxLength={64} onChange={(event) => setRetentionKind(event.target.value)} />
          </label>
          <label htmlFor={field('retention-days')} className="adminPolicy__bodyCopy">{copy.retentionDays}
            <input id={field('retention-days')} className="adminPolicy__input" type="number" min={1} max={36500} value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} />
          </label>
          <label htmlFor={field('retention-action')} className="adminPolicy__bodyCopy">{copy.action}
            <select id={field('retention-action')} className="adminPolicy__select" value={retentionDecision} onChange={(event) => setRetentionDecision(event.target.value as RetentionAction)}>
              {(['retain', 'delete', 'review'] as RetentionAction[]).map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void retentionAction.run(() => {
          const days = Number.parseInt(retentionDays, 10);
          const next = upsertRetentionRule(model.retention, {
            id: retentionId, enabled: true, documentKinds: retentionKind ? [retentionKind] : [], spaceIds: [], tags: [],
            retentionDays: Number.isFinite(days) ? days : 1, action: retentionDecision,
          }, actorId);
          onApply({ ...model, retention: next, updatedAt: Date.now() });
        })}>
          {copy.add}
        </button>
        {retentionAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={retentionAction.status.code}>
            {retentionAction.status.ok ? copy.applied : copy.reason(retentionAction.status.code)}
          </p>
        )}
        <ul className="adminPolicy__boundaryList">
          {model.retention.rules.map((rule) => (
            <li key={rule.id}><span>{rule.id}</span><span>{rule.action} / {rule.retentionDays}</span></li>
          ))}
        </ul>
        <div className="adminPolicy__sectionHeadingRow">
          <label htmlFor={field('probe-object')} className="adminPolicy__bodyCopy">{copy.deletionProbe}
            <input id={field('probe-object')} className="adminPolicy__input" value={probeObjectId} maxLength={192} onChange={(event) => setProbeObjectId(event.target.value)} />
          </label>
        </div>
        {/*
          Die Löschung läuft durch die Durchsetzungsgrenze: `materializeGuarded` ruft die erzeugende
          Funktion bei einer Ablehnung **nicht** auf. Der Zustand darunter nennt das Ergebnis und die
          Tatsache, dass nichts materialisiert wurde.
        */}
        <button type="button" className="adminPolicy__button" onClick={() => void retentionAction.run(async () => {
          const request = {
            operation: 'retention.delete' as const, actorId, scope: { kind: 'organization' as const, id: model.organization.id },
            object: { id: probeObjectId, kind: retentionKind || 'Writer', tags: [], createdAt: 0, versionCount: 1 },
          };
          const decision = evaluateAdminOperation(model, request);
          const guard = materializeGuarded(model, request, () => 'materialized');
          // Auch die Verweigerung wird protokolliert; bei Erlaubnis bleibt das Dokument unverändert,
          // weil die Löschung selbst außerhalb dieser Oberfläche stattfindet.
          onApply(await auditAdminOperationDecision(model, request, decision));
          if (!guard.allowed) throw new Error(`${decision.reason}:${decision.detail ?? ''}`);
        })}>
          {copy.deletionProbe}
        </button>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('hold-heading')}>
        <h3 id={field('hold-heading')} className="adminPolicy__subheading">{copy.legalHolds}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('hold-id')} className="adminPolicy__bodyCopy">{copy.identifier}
            <input id={field('hold-id')} className="adminPolicy__input" value={holdId} maxLength={128} onChange={(event) => setHoldId(event.target.value)} />
          </label>
          <label htmlFor={field('hold-name')} className="adminPolicy__bodyCopy">{copy.holdName}
            <input id={field('hold-name')} className="adminPolicy__input" value={holdName} maxLength={192} onChange={(event) => setHoldName(event.target.value)} />
          </label>
          <label htmlFor={field('hold-objects')} className="adminPolicy__bodyCopy">{copy.holdObjects}
            <input id={field('hold-objects')} className="adminPolicy__input" value={holdObjects} maxLength={512} onChange={(event) => setHoldObjects(event.target.value)} />
          </label>
        </div>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void holdAction.run(() => {
          const next = upsertLegalHold(model.retention, {
            id: holdId, name: holdName, active: true,
            objectIds: holdObjects.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 10_000),
            spaceIds: [], createdAt: Date.now(), authorizedBy: actorId,
          }, actorId);
          onApply({ ...model, retention: next, updatedAt: Date.now() });
        })}>
          {copy.add}
        </button>
        {holdAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={holdAction.status.code}>
            {holdAction.status.ok ? copy.applied : copy.reason(holdAction.status.code)}
          </p>
        )}
        <ul className="adminPolicy__boundaryList">
          {model.retention.legalHolds.map((hold) => (
            <li key={hold.id}><span>{hold.name}</span><span data-admin-hold-active={hold.active ? 'true' : 'false'}>{hold.active ? copy.enabledLabel : coreCopy.disabled}</span></li>
          ))}
        </ul>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('roles-heading')}>
        <h3 id={field('roles-heading')} className="adminPolicy__subheading">{copy.rolesAndAssignments}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('role-subject')} className="adminPolicy__bodyCopy">{copy.subject}
            <input id={field('role-subject')} className="adminPolicy__input" value={subjectId} maxLength={192} onChange={(event) => setSubjectId(event.target.value)} />
          </label>
          <label htmlFor={field('role-select')} className="adminPolicy__bodyCopy">{copy.role}
            <select id={field('role-select')} className="adminPolicy__select" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              {model.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
        </div>
        <p className="adminPolicy__bodyCopy" data-admin-assign-authority={canAssign ? 'allowed' : 'restricted'}>
          {copy.scope}: {model.organization.id}
        </p>
        <button
          type="button"
          className="adminPolicy__button adminPolicy__buttonPrimary"
          disabled={!canAssign}
          onClick={() => void roleAction.run(() => {
            const next = assignRole(model, {
              id: `assignment-${subjectId}-${roleId}`, subjectId, roleId,
              scopes: [{ kind: 'organization', id: model.organization.id }], createdAt: Date.now(),
            }, grants);
            onApply(next);
          })}
        >
          {copy.assign}
        </button>
        {roleAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={roleAction.status.code}>
            {roleAction.status.ok ? copy.applied : copy.reason(roleAction.status.code)}
          </p>
        )}
        <ul className="adminPolicy__boundaryList">
          {model.assignments.map((assignment) => (
            <li key={assignment.id}><span>{assignment.subjectId}</span><span>{assignment.roleId}</span><span>{assignment.scopes.map((scope) => `${scope.kind}:${scope.id}`).join(', ')}</span></li>
          ))}
        </ul>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('devices-heading')}>
        <h3 id={field('devices-heading')} className="adminPolicy__subheading">{copy.localDevices}</h3>
        <p className="adminPolicy__bodyCopy">{copy.localDeviceOnly}</p>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('device-id')} className="adminPolicy__bodyCopy">{copy.identifier}
            <input id={field('device-id')} className="adminPolicy__input" value={deviceId} maxLength={128} onChange={(event) => setDeviceId(event.target.value)} />
          </label>
          <label htmlFor={field('device-name')} className="adminPolicy__bodyCopy">{copy.deviceName}
            <input id={field('device-name')} className="adminPolicy__input" value={deviceName} maxLength={128} onChange={(event) => setDeviceName(event.target.value)} />
          </label>
          <label htmlFor={field('device-os')} className="adminPolicy__bodyCopy">{copy.deviceOs}
            <input id={field('device-os')} className="adminPolicy__input" value={deviceOs} maxLength={160} onChange={(event) => setDeviceOs(event.target.value)} />
          </label>
          <label htmlFor={field('device-version')} className="adminPolicy__bodyCopy">{copy.deviceVersion}
            <input id={field('device-version')} className="adminPolicy__input" value={deviceVersion} maxLength={64} onChange={(event) => setDeviceVersion(event.target.value)} />
          </label>
        </div>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void deviceAction.run(async () => {
          const next = await registerLocalDevice(model, { id: deviceId, name: deviceName, os: deviceOs, workspaceVersion: deviceVersion }, actorId);
          onApply(next);
        })}>
          {copy.add}
        </button>
        {deviceAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={deviceAction.status.code}>
            {deviceAction.status.ok ? copy.applied : copy.reason(deviceAction.status.code)}
          </p>
        )}
        {deviceView && (
          <p className="adminPolicy__note" data-admin-device-note={deviceView.note}>
            {deviceView.evaluation ? coreCopy.reason('device', deviceView.evaluation.reason) : coreCopy.noApprovedRelease}
          </p>
        )}
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('netgate-heading')}>
        <h3 id={field('netgate-heading')} className="adminPolicy__subheading">{copy.netGate}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('capability-id')} className="adminPolicy__bodyCopy">{copy.identifier}
            <input id={field('capability-id')} className="adminPolicy__input" value={capabilityId} maxLength={128} onChange={(event) => setCapabilityId(event.target.value)} />
          </label>
          <label htmlFor={field('capability-domain')} className="adminPolicy__bodyCopy">{copy.domain}
            <input id={field('capability-domain')} className="adminPolicy__input" value={capabilityDomain} maxLength={253} onChange={(event) => setCapabilityDomain(event.target.value)} />
          </label>
          <label htmlFor={field('capability-protocol')} className="adminPolicy__bodyCopy">{copy.protocol}
            <input id={field('capability-protocol')} className="adminPolicy__input" value={capabilityProtocol} maxLength={32} onChange={(event) => setCapabilityProtocol(event.target.value)} />
          </label>
        </div>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void networkAction.run(async () => {
          const next = await upsertNetGateCapability(model, { id: capabilityId, domains: [capabilityDomain], protocols: [capabilityProtocol] }, actorId);
          onApply(next);
        })}>
          {copy.add}
        </button>
        {networkAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={networkAction.status.code}>
            {networkAction.status.ok ? copy.applied : copy.reason(networkAction.status.code)}
          </p>
        )}
        <ul className="adminPolicy__boundaryList">
          {model.network.netGateCapabilities.map((capability) => (
            <li key={capability.id}><span>{capability.id}</span><span>{capability.domains.join(', ')}</span><span>{capability.protocols.join(', ')}</span></li>
          ))}
        </ul>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby={field('escrow-heading')}>
        <h3 id={field('escrow-heading')} className="adminPolicy__subheading">{copy.recoveryEscrow}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor={field('escrow-recipient')} className="adminPolicy__bodyCopy">{copy.recipient}
            <input id={field('escrow-recipient')} className="adminPolicy__input" value={escrowRecipient} maxLength={192} onChange={(event) => setEscrowRecipient(event.target.value)} />
          </label>
          <label htmlFor={field('escrow-disclosure')} className="adminPolicy__bodyCopy">{copy.disclosure}
            <input id={field('escrow-disclosure')} className="adminPolicy__input" value={escrowDisclosure} maxLength={1024} onChange={(event) => setEscrowDisclosure(event.target.value)} />
          </label>
        </div>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void escrowAction.run(() => {
          const authorized = hasAdminCapability(model, actorId, 'key.manage', { kind: 'organization', id: model.organization.id });
          onApply(configureRecoveryEscrow(model, { enabled: true, recipientKeyId: escrowRecipient, disclosure: escrowDisclosure }, authorized));
        })}>
          {copy.add}
        </button>
        {escrowAction.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={escrowAction.status.code}>
            {escrowAction.status.ok ? copy.applied : copy.reason(escrowAction.status.code)}
          </p>
        )}
        <p className="adminPolicy__note" data-admin-rotation-allowed={rotation.allowed ? 'true' : 'false'}>
          {rotation.allowed ? rotation.steps.join(' → ') : rotation.evidence.join(', ')}
        </p>
        <p className="adminPolicy__note">{copy.policyId}: POL-ENC-NATIVE-ONLY · {copy.source}: {buildAdminWorkspaceReference('app', 'admin-policy')}</p>
      </section>
    </div>
  );
};
