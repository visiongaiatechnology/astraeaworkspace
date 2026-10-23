// STATUS: SILBER — scoped UI redesign; policy decisions remain delegated to the existing cores
import { isImeCompositionEvent } from '../../../shared/accessibility/accessibilityPlatform';
import React, { useEffect, useId, useMemo, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DEFAULT_ADMIN_POLICY_MODEL, type AdminPolicyModel, type AdminCapability } from '../model/types';
import { activateBreakGlass, hasAdminCapability, separationOfDutiesViolations } from '../security/adminRbacCore';
import { evaluateKnownDeviceDeployment } from '../devices/adminDevicePolicyCore';
import { evaluateKeyProvider } from '../security/adminKeyPolicyCore';
import { DLP_ACTIONS, evaluateDlp, isDlpAction, updateDlpDefaultAction } from '../policies/adminDlpCore';
import { evaluateRetention } from '../compliance/adminRetentionCore';
import { evaluateConnectorPolicy } from '../policies/adminNetworkPolicyCore';
import { verifyAuditTrail } from '../compliance/adminAuditCore';
import { backupHealth, recoveryRunbookStatus } from '../policies/adminContinuityCore';
import { privacyDashboard } from '../settings/adminPrivacyCore';
import { effectivePolicy, inspectLocalMachinePolicy } from '../policies/adminLifecycleCore';
import {
  createAdminPolicyHistory,
  pushAdminPolicyHistory,
  redoAdminPolicyHistory,
  undoAdminPolicyHistory,
} from '../state/adminHistoryEngine';
import './AdminPolicyView.css';
import { useAdminPolicyCopy, type AdminPolicyTab } from '../locale/adminPolicyLocale';
import { ADMIN_POLICY_GOVERNANCE_TABS, useAdminPolicyGovernanceCopy, type AdminPolicyGovernanceTab } from '../locale/adminPolicyGovernanceLocale';
import { AdminPolicyAuthoringPanel } from './AdminPolicyAuthoringPanel';
import { AdminPolicyGovernancePanel } from './AdminPolicyGovernancePanel';
import { AdminPolicyInterchangePanel } from './AdminPolicyInterchangePanel';
import { AdminPolicyReleaseGate } from './AdminPolicyReleaseGate';
import { securityGateDecisionOf } from '../../../edition/releaseStatus';

interface Props {
  document: WorkspaceDocument;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  initialTab?: AdminPolicyTab | AdminPolicyGovernanceTab;
  /**
   * `auto` (Produktionspfad) liest die Entscheidung aus der zentralen Release-Registry. `approved`
   * existiert **nur** für Tests der internen Panels: Die Oberfläche selbst bleibt gesperrt, solange
   * `securityGateDecisionOf('AdminPolicy')` „blocked" sagt. Kein Produktionsaufrufer setzt diesen Wert.
   */
  releaseGate?: 'auto' | 'approved';
}

/** Die zehn Fachbereiche bleiben, wie sie sind; vier Verwaltungsbereiche kommen hinzu. */
const CORE_TABS = ['Access', 'Devices', 'Encryption', 'DLP', 'Retention', 'Network', 'Audit', 'Continuity', 'Privacy', 'Lifecycle'] as const;
const TABS = [...CORE_TABS, ...ADMIN_POLICY_GOVERNANCE_TABS] as const;
type CoreTab = (typeof CORE_TABS)[number];
type Tab = (typeof TABS)[number];
const isCoreTab = (value: Tab): value is CoreTab => (CORE_TABS as readonly string[]).includes(value);
const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_ADMIN_POLICY_MODEL)) as AdminPolicyModel;

export const AdminPolicyView: React.FC<Props> = ({ document, onUpdateDocument, initialTab = 'Access', releaseGate = 'auto' }) => {
  const copy = useAdminPolicyCopy();
  const governanceCopy = useAdminPolicyGovernanceCopy();
  const incoming = (document.adminPolicyData ?? cloneDefault()) as AdminPolicyModel;
  const [history, setHistory] = useState(() => createAdminPolicyHistory(incoming));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [zoom, setZoom] = useState(100);
  const [auditStatus, setAuditStatus] = useState(copy.notVerified);
  const [dlpDraft, setDlpDraft] = useState(incoming.dlp.defaultAction);
  const [dlpSaveStatus, setDlpSaveStatus] = useState('');
  const [dlpSaving, setDlpSaving] = useState(false);
  /**
   * Die handelnde Kennung ist wählbar, weil „unberechtigte Änderung abweisen" (AST-1856) nur prüfbar
   * ist, wenn ein nicht berechtigtes Subjekt auch gewählt werden kann. Vorgabe: die Bootstrap-Zuordnung
   * des Dokuments — nicht ein Literal.
   */
  const [actorId, setActorId] = useState(() => incoming.assignments[0]?.subjectId ?? 'local-owner');
  const idPrefix = useId();

  useEffect(() => {
    if (JSON.stringify(history.present) !== JSON.stringify(incoming)) {
      setHistory(createAdminPolicyHistory(incoming));
    }
  }, [document.id]);

  useEffect(() => setDlpDraft(incoming.dlp.defaultAction), [document.id, incoming.dlp.defaultAction]);

  const model = history.present;
  const ownerCaps = useMemo(
    () => ['policy.read', 'policy.write', 'identity.assign', 'device.manage', 'release.manage', 'key.manage', 'breakglass.activate'] as AdminCapability[],
    [],
  );
  /**
   * **Sicherheits-Gate (Beta):** Admin & Policy ist in `edition/releaseStatus.ts` als „blocked" geführt,
   * weil seine Richtlinien in keinem Workspace-Modul durchgesetzt werden. Der Gate-Return steht **nach**
   * allen Hooks (Hook-Reihenfolge bleibt stabil) und **vor** jedem Schreibpfad. Bestehende Richtliniendaten
   * werden nicht angefasst; die Ansicht schreibt nichts.
   */
  const gateBlocked = releaseGate !== 'approved' && securityGateDecisionOf('AdminPolicy') === 'blocked';
  if (gateBlocked) return <AdminPolicyReleaseGate documentId={document.id} />;
  const persist = (next: AdminPolicyModel) => {
    const nextHistory = pushAdminPolicyHistory(history, next);
    setHistory(nextHistory);
    onUpdateDocument({ ...document, adminPolicyData: nextHistory.present, modified_at: Date.now(), version: document.version + 1 });
  };
  const saveDlpDefaultAction = async () => {
    if (!isDlpAction(dlpDraft) || dlpSaving) return;
    setDlpSaving(true);
    setDlpSaveStatus('');
    try {
      const next = await updateDlpDefaultAction(model, dlpDraft);
      persist(next);
      setDlpSaveStatus(copy.savedAction);
    } catch {
      setDlpSaveStatus(copy.rejectedAction);
    } finally {
      setDlpSaving(false);
    }
  };
  const applyHistory = (nextHistory: ReturnType<typeof createAdminPolicyHistory>) => {
    setHistory(nextHistory);
    onUpdateDocument({ ...document, adminPolicyData: nextHistory.present, modified_at: Date.now(), version: document.version + 1 });
  };
  const keydown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Eine Definition, wann eine Eingabe IME-Komposition ist (W-279): die eigene Prüfung kannte
      // `isComposing` und `keyCode === 229`, verpasste aber `key === 'Process' | 'Dead'`.
    if (isImeCompositionEvent({ isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode, key: event.key })) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      applyHistory(event.shiftKey ? redoAdminPolicyHistory(history) : undoAdminPolicyHistory(history));
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      applyHistory(redoAdminPolicyHistory(history));
    }
  };

  const access = hasAdminCapability(model, 'local-owner', 'policy.write', { kind: 'organization', id: model.organization.id });
  const separationFindings = separationOfDutiesViolations(model, 'local-owner');
  const dlp = evaluateDlp(model.dlp, { objectId: 'preview', label: 'internal', metadata: {}, content: 'preview' }, { operation: 'export', destinationKind: 'external' }, true);
  const retention = evaluateRetention(model.retention, { id: 'preview', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 });
  const backup = backupHealth(model.continuity);
  const privacy = privacyDashboard(model.privacy);
  const effective = effectivePolicy(model.lifecycle, { machine: model.lifecycle.localMachinePolicy, organization: { telemetry: false } });
  const activeTabIndex = TABS.indexOf(tab);
  const currentTabId = (value: Tab) => `${idPrefix}-tab-${value.toLowerCase()}`;
  const currentPanelId = (value: Tab) => `${idPrefix}-panel-${value.toLowerCase()}`;
  const tabLabel = (value: Tab) => (isCoreTab(value) ? copy.tabs[value] : governanceCopy.tabs[value]);
  const tabDescription = (value: Tab) => (isCoreTab(value) ? copy.descriptions[value] : governanceCopy.descriptions[value]);

  const navigateTabs = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = TABS[nextIndex];
    setTab(nextTab);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector<HTMLButtonElement>(`[data-admin-tab-index="${nextIndex}"]`)
      ?.focus();
  };

  return (
    <div
      data-vgt-admin-policy="true"
      onKeyDown={keydown}
      className="vgt-admin-policy adminPolicy flex-1 overflow-auto text-slate-100"
      style={{ fontSize: `${zoom}%` }}
    >
      <div className="adminPolicy__frame">
        <header className="adminPolicy__header">
          <div className="adminPolicy__identity">
          <p className="adminPolicy__eyebrow"><span aria-hidden="true" /> {copy.governance}</p>
          <h1 className="adminPolicy__title">{copy.title}</h1>
          <p className="adminPolicy__subtitle">{copy.subtitle}</p>
          </div>

          <div className="adminPolicy__toolbar" role="group" aria-label={copy.toolbar}>
            <div className="adminPolicy__historyControls" aria-label={copy.history}>
              <button
                type="button"
                className="adminPolicy__button"
                onClick={() => applyHistory(undoAdminPolicyHistory(history))}
                disabled={!history.past.length}
                aria-label={copy.undo}
              >
                {copy.undo}
              </button>
              <button
                type="button"
                className="adminPolicy__button"
                onClick={() => applyHistory(redoAdminPolicyHistory(history))}
                disabled={!history.future.length}
                aria-label={copy.redo}
              >
                {copy.redo}
              </button>
            </div>
            <label className="adminPolicy__scale">
              <span>{governanceCopy.actor}</span>
              <select
                aria-label={governanceCopy.actor}
                value={actorId}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setActorId(event.target.value)}
                className="adminPolicy__select"
              >
                {[...new Set([actorId, ...model.assignments.map((assignment) => assignment.subjectId)])].slice(0, 64).map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </label>
            <label className="adminPolicy__scale">
              <span>{copy.scale}</span>
              <select
                aria-label={copy.scale}
                value={zoom}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setZoom(Number(event.target.value))}
                className="adminPolicy__select"
              >
                {[100, 125, 150, 200, 250, 300].map((value) => <option key={value} value={value}>{value}%</option>)}
              </select>
            </label>
          </div>
        </header>

        <div className="adminPolicy__layout">
          <aside className="adminPolicy__sidebar" aria-label={copy.scopeNavigation}>
            <section className="adminPolicy__scope" aria-labelledby={`${idPrefix}-scope-heading`}>
              <p className="adminPolicy__eyebrow">{copy.currentScope}</p>
                <h2 id={`${idPrefix}-scope-heading`} className="adminPolicy__scopeMode">{copy.value(model.organization.mode === 'personal' ? 'personalScope' : 'organizationScope')}</h2>
              <div className="adminPolicy__scopeAccess" data-access={access ? 'allowed' : 'restricted'}>
                <span className="adminPolicy__stateMark" aria-hidden="true" />
                <div>
                  <span className="adminPolicy__factLabel">{copy.ownerPolicyWrite}</span>
                  <strong>{access ? copy.available : copy.restricted}</strong>
                </div>
              </div>
              <dl className="adminPolicy__scopeCounts">
                <div><dt>{copy.roles}</dt><dd>{model.roles.length}</dd></div>
                <div><dt>{copy.assignments}</dt><dd>{model.assignments.length}</dd></div>
              </dl>
            </section>

            <nav className="adminPolicy__navigation" role="tablist" aria-label={copy.policyDomains} aria-orientation="vertical">
              <p className="adminPolicy__eyebrow">{copy.policyDomains}</p>
              <div className="adminPolicy__tabList">
                {TABS.map((value, index) => (
                  <button
                    key={value}
                    id={currentTabId(value)}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    aria-controls={currentPanelId(value)}
                    tabIndex={tab === value ? 0 : -1}
                    data-admin-tab-index={index}
                    data-vgt-app-guide-anchor={index === 0 ? 'AdminPolicy:first' : undefined}
                    onClick={() => setTab(value)}
                    onKeyDown={(event) => navigateTabs(event, index)}
                    className="adminPolicy__tab"
                  >
                    <span className="adminPolicy__tabIndex" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <span>{tabLabel(value)}</span>
                    <span className="adminPolicy__tabArrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </nav>
          </aside>

          <main className="adminPolicy__main">
            <div className="adminPolicy__mobileNavigation">
              <label htmlFor={`${idPrefix}-mobile-section`} className="adminPolicy__eyebrow">{copy.policyDomain}</label>
              <select
                id={`${idPrefix}-mobile-section`}
                aria-label={copy.policyDomain}
                value={tab}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setTab(event.target.value as Tab)}
                className="adminPolicy__select adminPolicy__mobileSelect"
              >
                {TABS.map((value) => <option key={value} value={value}>{tabLabel(value)}</option>)}
              </select>
            </div>

            <section
              id={currentPanelId(tab)}
              role="tabpanel"
              aria-labelledby={currentTabId(tab)}
              aria-label={copy.panelLabel(tabLabel(tab))}
              tabIndex={0}
              className="adminPolicy__panel"
            >
              <header className="adminPolicy__panelHeader">
                <div>
                  <p className="adminPolicy__eyebrow">{copy.panelPosition(String(activeTabIndex + 1).padStart(2, '0'), TABS.length)}</p>
                  <h2 className="adminPolicy__panelTitle">{tabLabel(tab)}</h2>
                  <p className="adminPolicy__panelDescription">{tabDescription(tab)}</p>
                </div>
                <span className="adminPolicy__domainMark" aria-hidden="true">AP / {String(activeTabIndex + 1).padStart(2, '0')}</span>
              </header>

              <div className="adminPolicy__panelBody">
                {tab === 'Access' && (
                  <div className="adminPolicy__sectionGrid">
                    <section className="adminPolicy__subpanel adminPolicy__breakGlass" aria-labelledby={`${idPrefix}-breakglass-heading`}>
                      <div>
                        <p className="adminPolicy__eyebrow">{copy.timeBoundedAuthority}</p>
                        <h3 id={`${idPrefix}-breakglass-heading`} className="adminPolicy__subheading">{copy.breakGlass}</h3>
                        <p className="adminPolicy__bodyCopy">{copy.breakGlassDescription}</p>
                      </div>
                      <button
                        type="button"
                        className="adminPolicy__button adminPolicy__buttonPrimary"
                        disabled={!ownerCaps.includes('breakglass.activate')}
                        onClick={() => void activateBreakGlass(
                          model,
                          {
                            id: `bg-${Date.now()}`,
                            subjectId: 'local-owner',
                            reason: 'Local recovery administration requested',
                            minutes: 15,
                            capabilities: ['policy.read', 'policy.write'],
                          },
                          'local-owner',
                        ).then(persist).catch(() => setAuditStatus(copy.breakGlassDenied))}
                      >
                        {copy.activateBreakGlass}
                      </button>
                    </section>

                    <section className="adminPolicy__subpanel" aria-labelledby={`${idPrefix}-separation-heading`}>
                      <p className="adminPolicy__eyebrow">{copy.roleGovernance}</p>
                      <h3 id={`${idPrefix}-separation-heading`} className="adminPolicy__subheading">{copy.separationOfDuties}</h3>
                      <p className="adminPolicy__bodyCopy">{copy.currentFindings}</p>
                      <div className="adminPolicy__finding" data-tone={separationFindings.length ? 'warning' : 'clear'}>
                        <span className="adminPolicy__stateMark" aria-hidden="true" />
                        <strong>{separationFindings.length ? copy.findingCount(separationFindings.length) : copy.noFindings}</strong>
                      </div>
                      <p className="adminPolicy__findingList">{separationFindings.map(copy.finding).join(', ') || copy.none}</p>
                    </section>
                  </div>
                )}

                {tab === 'Devices' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsThree">
                      <div><dt>{copy.registeredDevices}</dt><dd>{model.devices.length}</dd></div>
                      <div><dt>{copy.releaseChannels}</dt><dd className="adminPolicy__metricText">{model.deployment.channels.map(copy.releaseChannel).join(', ') || copy.noneConfigured}</dd></div>
                      <div><dt>{copy.installerSignature}</dt><dd className="adminPolicy__metricText">{model.deployment.requireInstallerSignature ? copy.required : copy.notRequired}</dd></div>
                    </dl>
                    <section className="adminPolicy__subpanel" aria-labelledby={`${idPrefix}-device-list-heading`}>
                      <div className="adminPolicy__sectionHeadingRow">
                        <div>
                          <p className="adminPolicy__eyebrow">{copy.deploymentInventory}</p>
                          <h3 id={`${idPrefix}-device-list-heading`} className="adminPolicy__subheading">{copy.deviceEvaluation}</h3>
                        </div>
                        <span className="adminPolicy__count">{Math.min(model.devices.length, 20)} / {model.devices.length}</span>
                      </div>
                      {model.devices.length ? (
                        <ul className="adminPolicy__deviceList">
                          {model.devices.slice(0, 20).map((device) => {
                            /*
                             * **Befund + Fix:** hier stand `signatureVerified: true` als Literal — die
                             * Oberfläche behauptete eine geprüfte Installer-Signatur, ohne irgendetwas zu
                             * prüfen. `evaluateKnownDeviceDeployment` meldet die Signatur ausdrücklich als
                             * ungeprüft; dadurch sagt die angezeigte Entscheidung die Wahrheit.
                             */
                            const view = evaluateKnownDeviceDeployment(model, device);
                            return (
                              <li key={device.id} className="adminPolicy__deviceRow">
                                <strong>{device.name}</strong>
                                <span data-admin-device-note={view.note}>{view.evaluation ? copy.reason('device', view.evaluation.reason) : copy.noApprovedRelease}</span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="adminPolicy__emptyState">{copy.noDevices}</p>
                      )}
                    </section>
                  </div>
                )}

                {tab === 'Encryption' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsTwo">
                      <div><dt>{copy.nativeEncryption}</dt><dd>{model.encryption.requireNativeEncryption ? copy.required : copy.notRequired}</dd></div>
                      <div><dt>{copy.implicitMasterKey}</dt><dd>{model.encryption.implicitMasterKey ? copy.enabled : copy.disabled}</dd></div>
                    </dl>
                    <section className="adminPolicy__subpanel" aria-labelledby={`${idPrefix}-provider-heading`}>
                      <p className="adminPolicy__eyebrow">{copy.providerCapability}</p>
                      <h3 id={`${idPrefix}-provider-heading`} className="adminPolicy__subheading">{copy.reportedKeyProtection}</h3>
                      <p className="adminPolicy__bodyCopy">{copy.keyProviderClaim(evaluateKeyProvider(model.encryption, {
                        provider: 'runtime',
                        available: true,
                        hardwareBacked: false,
                        attestationVerified: false,
                        slotTypes: ['os-keychain'],
                      }).hardwareClaim)}</p>
                    </section>
                  </div>
                )}

                {tab === 'DLP' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsTwo">
                      <div><dt>{copy.configuredRules}</dt><dd>{model.dlp.rules.length}</dd></div>
                      <div><dt>{copy.exportSimulation}</dt><dd className="adminPolicy__metricText">{copy.reason('dlp', dlp.reason)}</dd></div>
                    </dl>
                    <section className="adminPolicy__subpanel" aria-labelledby={`${idPrefix}-dlp-boundaries-heading`}>
                      <div className="adminPolicy__sectionHeadingRow">
                        <div>
                          <p className="adminPolicy__eyebrow">{copy.defaultEnforcement}</p>
                          <h3 className="adminPolicy__subheading">{copy.unmatchedActivity}</h3>
                        </div>
                        <span className="adminPolicy__count">{access ? copy.writeAuthorized : copy.readOnly}</span>
                      </div>
                      <div className="adminPolicy__sectionHeadingRow">
                        <label htmlFor={`${idPrefix}-dlp-default-action`} className="adminPolicy__bodyCopy">{copy.defaultAction}</label>
                        <select
                          id={`${idPrefix}-dlp-default-action`}
                          aria-label={copy.defaultAction}
                          value={dlpDraft}
                          disabled={!access || dlpSaving}
                          onChange={(event) => {
                            if (isDlpAction(event.target.value)) {
                              setDlpDraft(event.target.value);
                              setDlpSaveStatus('');
                            }
                          }}
                          className="adminPolicy__select"
                        >
                          {DLP_ACTIONS.map((action) => <option key={action} value={action}>{copy.dlpActions[action]}</option>)}
                        </select>
                      </div>
                      <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void saveDlpDefaultAction()} disabled={!access || dlpSaving || dlpDraft === model.dlp.defaultAction}>
                        {dlpSaving ? copy.saving : copy.saveDefaultAction}
                      </button>
                      {dlpSaveStatus && <p className="adminPolicy__note" role="status" aria-live="polite">{dlpSaveStatus}</p>}
                      <p className="adminPolicy__eyebrow">{copy.enforcementCoverage}</p>
                      <h3 id={`${idPrefix}-dlp-boundaries-heading`} className="adminPolicy__subheading">{copy.protectedBoundaries}</h3>
                      <ul className="adminPolicy__boundaryList">
                        {['Copy', 'Export', 'Print', 'Share', 'Clipboard', 'Connectors'].map((boundary) => <li key={boundary}>{copy.boundary(boundary)}</li>)}
                      </ul>
                      <p className="adminPolicy__bodyCopy">{copy.enforcementDescription}</p>
                    </section>
                  </div>
                )}

                {tab === 'Retention' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsThree">
                      <div><dt>{copy.retentionRules}</dt><dd>{model.retention.rules.length}</dd></div>
                      <div><dt>{copy.activeLegalHolds}</dt><dd>{model.retention.legalHolds.filter((hold) => hold.active).length}</dd></div>
                      <div><dt>{copy.dispositionPreview}</dt><dd className="adminPolicy__metricText">{copy.reason('retention', retention.reason)}</dd></div>
                    </dl>
                    <p className="adminPolicy__note">{copy.retentionDescription}</p>
                  </div>
                )}

                {tab === 'Network' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsTwo">
                      <div><dt>{copy.telemetry}</dt><dd>{model.network.telemetryEnabled ? copy.enabled : copy.disabled}</dd></div>
                      <div><dt>{copy.remoteContent}</dt><dd className="adminPolicy__metricText">{copy.value('denied')}</dd></div>
                    </dl>
                    <section className="adminPolicy__subpanel" aria-labelledby={`${idPrefix}-connector-heading`}>
                      <p className="adminPolicy__eyebrow">{copy.capabilityEvaluation}</p>
                      <h3 id={`${idPrefix}-connector-heading`} className="adminPolicy__subheading">{copy.connectorPolicy}</h3>
                      <p className="adminPolicy__bodyCopy">{model.network.netGateCapabilities[0]
                        ? copy.reason('network', evaluateConnectorPolicy(model.network, {
                          capabilityId: model.network.netGateCapabilities[0].id,
                          host: model.network.netGateCapabilities[0].domains[0] ?? 'invalid',
                          protocol: 'https',
                          purpose: 'connector',
                        }).reason)
                        : copy.noConnector}</p>
                    </section>
                  </div>
                )}

                {tab === 'Audit' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsTwo">
                      <div><dt>{copy.auditEvents}</dt><dd>{model.audit.events.length}</dd></div>
                      <div><dt>{copy.clockSkew}</dt><dd>{model.audit.clock.backwardSkewCount}</dd></div>
                    </dl>
                    <section className="adminPolicy__subpanel adminPolicy__auditAction" aria-labelledby={`${idPrefix}-audit-verify-heading`}>
                      <div>
                        <p className="adminPolicy__eyebrow">{copy.integrityCheck}</p>
                        <h3 id={`${idPrefix}-audit-verify-heading`} className="adminPolicy__subheading">{copy.auditVerification}</h3>
                        <p className="adminPolicy__bodyCopy">{copy.auditDescription}</p>
                      </div>
                      <button type="button" data-vgt-app-guide-anchor="AdminPolicy:second" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void verifyAuditTrail(model.audit).then((result) => setAuditStatus(copy.auditResult(result.ok, result.reason))).catch(() => setAuditStatus(copy.auditVerificationFailed))}>
                        {copy.verifyAudit}
                      </button>
                      <p role="status" className="adminPolicy__statusLine">{auditStatus}</p>
                    </section>
                  </div>
                )}

                {tab === 'Continuity' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsTwo">
                      <div><dt>{copy.backupHealth}</dt><dd>{copy.value(backup.status === 'scheduled-not-proven' ? 'scheduledNotProven' : backup.status)}</dd></div>
                      <div><dt>{copy.restoreDue}</dt><dd>{recoveryRunbookStatus(model.continuity).restoreVerificationDue ? copy.yes : copy.no}</dd></div>
                    </dl>
                    <section className="adminPolicy__subpanel" aria-labelledby={`${idPrefix}-backup-heading`}>
                      <p className="adminPolicy__eyebrow">{copy.recoveryReadiness}</p>
                      <h3 id={`${idPrefix}-backup-heading`} className="adminPolicy__subheading">{copy.backupDetail}</h3>
                      <p className="adminPolicy__bodyCopy">{copy.reason('backup', backup.reason)}</p>
                    </section>
                  </div>
                )}

                {tab === 'Privacy' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsThree">
                      <div><dt>{copy.diagnostics}</dt><dd className="adminPolicy__metricText">{copy.value('localOnly')}</dd></div>
                      <div><dt>{copy.analytics}</dt><dd className="adminPolicy__metricText">{privacy.analytics === 'disabled' ? copy.disabled : privacy.analytics}</dd></div>
                      <div><dt>{copy.externalDestinations}</dt><dd>{privacy.activeExternalDestinations.length}</dd></div>
                    </dl>
                    <p className="adminPolicy__note">{copy.privacyDescription}</p>
                  </div>
                )}

                {tab === 'Lifecycle' && (
                  <div className="adminPolicy__contentStack">
                    <dl className="adminPolicy__metrics adminPolicy__metricsTwo">
                      <div><dt>{copy.policyVersions}</dt><dd>{model.lifecycle.versions.length}</dd></div>
                      <div><dt>{copy.effectiveKeys}</dt><dd className="adminPolicy__metricText">{Object.keys(effective).join(', ') || copy.noneConfigured}</dd></div>
                    </dl>
                    <section className="adminPolicy__subpanel" aria-labelledby={`${idPrefix}-local-policy-heading`}>
                      <div className="adminPolicy__sectionHeadingRow">
                        <div>
                          <p className="adminPolicy__eyebrow">{copy.inspectableSource}</p>
                          <h3 id={`${idPrefix}-local-policy-heading`} className="adminPolicy__subheading">{copy.localMachinePolicy}</h3>
                        </div>
                        <span className="adminPolicy__count">JSON</span>
                      </div>
                      <pre aria-label={copy.inspectablePolicyLabel} className="adminPolicy__policySource">{JSON.stringify(inspectLocalMachinePolicy(model.lifecycle), null, 2)}</pre>
                    </section>
                  </div>
                )}

                {tab === 'Catalog' && (
                  <AdminPolicyGovernancePanel section="catalog" model={model} copy={governanceCopy} coreCopy={copy} actorId={actorId} onApply={persist} />
                )}

                {tab === 'Author' && (
                  <AdminPolicyAuthoringPanel model={model} copy={governanceCopy} coreCopy={copy} actorId={actorId} onApply={persist} />
                )}

                {tab === 'Enforce' && (
                  <AdminPolicyGovernancePanel section="enforce" model={model} copy={governanceCopy} coreCopy={copy} actorId={actorId} onApply={persist} />
                )}

                {tab === 'Interchange' && (
                  <AdminPolicyInterchangePanel model={model} copy={governanceCopy} coreCopy={copy} actorId={actorId} onApply={persist} />
                )}
              </div>
            </section>
            {TABS.filter((value) => value !== tab).map((value) => (
              <div
                key={value}
                id={currentPanelId(value)}
                role="tabpanel"
                aria-labelledby={currentTabId(value)}
                hidden
              />
            ))}
          </main>
        </div>
      </div>
    </div>
  );
};
