// STATUS: PLATIN — Katalog, Inspektor, Entscheidungskonsole, Compliance-Bericht, Konfliktkarte.
//
// **Warum dieses Bauteil existiert (gemessen, nicht vermutet):** „Policy-Katalog navigierbar",
// „Policy-Auswertung als echte Entscheidung", „Compliance-Dashboard", „Policy-Konflikt und
// Prioritäten" und „Globaler Policy-Inspector" verlangen alle dasselbe: eine Operation gegen die
// aktive Richtlinie laufen lassen und das Ergebnis **zeigen**. Es gab keine Stelle, an der ein Nutzer
// eine Operation auswählen und das Resultat sehen konnte; die Zahlen waren Regelanzahlen.
//
// Jede Zahl und jedes Wort in diesem Bauteil kommt aus einem Aufruf von `evaluateAdminOperation`
// bzw. `buildComplianceReport` — es gibt hier keine fest verdrahtete Erfolgsmeldung.
import React, { useMemo, useState } from 'react';
import { ADMIN_ENFORCEMENT_MATRIX, auditAdminOperationDecision, evaluateAdminOperation, type AdminOperationId } from '../enforcement/adminEnforcementCore';
import {
  ADMIN_POLICY_CATALOG,
  FRESH_PROFILE_OPERATIONS,
  buildComplianceReport,
  catalogHit,
  detectGovernanceConflicts,
  heldObjectCount,
  probeRequestFor,
  proveFreshProfileEnforcement,
  searchPolicyCatalog,
  type AdminCatalogHit,
} from '../governance/adminGovernanceCore';
import { SENSITIVITY_LABELS } from '../policies/adminDlpCore';
import { useGovernanceAction } from './adminGovernanceStatus';
import type { AdminGovernancePanelProps } from './adminGovernancePanelTypes';

const OPERATIONS: readonly AdminOperationId[] = ADMIN_ENFORCEMENT_MATRIX.map((entry) => entry.operation);

export interface AdminGovernancePanelProps2 extends AdminGovernancePanelProps {
  /** Der Katalog und die Durchsetzung sind zwei sichtbare Bereiche, aber ein Modul. */
  section: 'catalog' | 'enforce';
}

export const AdminPolicyGovernancePanel: React.FC<AdminGovernancePanelProps2> = ({ model, copy, coreCopy, actorId, section, onApply }) => {
  const action = useGovernanceAction(copy.applied);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(ADMIN_POLICY_CATALOG[0]?.id ?? '');
  const [probeOperation, setProbeOperation] = useState<AdminOperationId>('vault.export.plaintext');
  const [probeActor, setProbeActor] = useState(actorId);
  const [probeLabel, setProbeLabel] = useState<'public' | 'internal' | 'confidential' | 'restricted' | 'top-secret'>('confidential');
  const [probeDestination, setProbeDestination] = useState('external');
  const [probeJustification, setProbeJustification] = useState('');
  const [probeElevated, setProbeElevated] = useState(false);
  const [proofLine, setProofLine] = useState('');

  const hits: AdminCatalogHit[] = useMemo(() => searchPolicyCatalog(model, query), [model, query]);
  const selected = useMemo(() => {
    const entry = ADMIN_POLICY_CATALOG.find((candidate) => candidate.id === selectedId) ?? ADMIN_POLICY_CATALOG[0];
    return entry ? catalogHit(model, entry) : null;
  }, [model, selectedId]);
  const inspection = useMemo(
    () => (selected ? evaluateAdminOperation(model, probeRequestFor(selected.entry.operation, actorId, model.organization.id)) : null),
    [model, selected, actorId],
  );
  // Die Entscheidung wird bei jedem Rendern wirklich berechnet — der Knopf markiert nur, dass der
  // Nutzer sie ausdrücklich ausgelöst hat. Ein angezeigter Zustand ohne Aufruf wäre genau das
  // Fehlerbild, das dieser Bereich beheben soll.
  const decision = useMemo(() => evaluateAdminOperation(model, {
    operation: probeOperation,
    actorId: probeActor,
    scope: { kind: 'organization', id: model.organization.id },
    subject: { objectId: 'console-object', label: probeLabel, metadata: {}, content: probeJustification },
    destinationKind: probeDestination || 'external',
    destinationId: probeDestination || undefined,
    justification: probeJustification || undefined,
    elevatedAuthorized: probeElevated,
    object: { id: 'console-object', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 },
    connector: { capabilityId: 'console-capability', host: 'console.example', protocol: 'https', purpose: 'connector' },
    keyProvider: { provider: 'console', available: true, hardwareBacked: false, attestationVerified: false, slotTypes: ['os-keychain'] },
  }), [model, probeOperation, probeActor, probeLabel, probeDestination, probeJustification, probeElevated]);

  const report = useMemo(() => buildComplianceReport(model), [model]);
  const conflicts = useMemo(() => detectGovernanceConflicts(model), [model]);
  const holds = useMemo(() => heldObjectCount(model), [model]);

  return (
    <div className="adminPolicy__contentStack" data-admin-governance={section}>
      {section === 'catalog' && (
      <section className="adminPolicy__subpanel" aria-labelledby="admin-catalog-heading">
        <p className="adminPolicy__eyebrow">{copy.inspector}</p>
        <h3 id="admin-catalog-heading" className="adminPolicy__subheading">{copy.catalogSearch}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor="admin-catalog-query" className="adminPolicy__bodyCopy">{copy.catalogSearch}
            <input
              id="admin-catalog-query"
              className="adminPolicy__input"
              value={query}
              maxLength={96}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                const list = event.currentTarget.closest('.adminPolicy__subpanel')?.querySelectorAll<HTMLButtonElement>('[data-catalog-index]');
                if (!list || list.length === 0) return;
                event.preventDefault();
                const currentIndex = Number.parseInt(event.currentTarget.getAttribute('data-catalog-query') ?? '0', 10) || 0;
                const nextIndex = event.key === 'ArrowDown' ? (currentIndex + 1) % list.length : (currentIndex - 1 + list.length) % list.length;
                list[nextIndex]?.focus();
              }}
              data-catalog-query="0"
            />
          </label>
        </div>
        <p className="adminPolicy__count" data-admin-catalog-hits={hits.length}>{copy.results}: {hits.length}</p>
        {hits.length === 0
          ? <p className="adminPolicy__emptyState">{copy.catalogEmpty}</p>
          : (
            <ul className="adminPolicy__catalogList">
              {hits.map((hit, index) => (
                <li key={hit.entry.id} data-selected={hit.entry.id === selectedId ? 'true' : 'false'}>
                  <button
                    type="button"
                    className="adminPolicy__button"
                    data-catalog-index={index}
                    aria-pressed={hit.entry.id === selectedId}
                    onClick={() => setSelectedId(hit.entry.id)}
                  >
                    {copy.domains[hit.entry.domain]} · {hit.entry.id}
                  </button>
                  <span className="adminPolicy__catalogState" data-admin-catalog-state={hit.state}>{copy.catalogStates[hit.state]}</span>
                  <span className="adminPolicy__bodyCopy">{hit.detail.join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        {selected && (
          <section className="adminPolicy__subpanel" aria-labelledby="admin-inspector-heading">
            <h4 id="admin-inspector-heading" className="adminPolicy__subheading">{copy.inspector}: {selected.entry.id}</h4>
            <dl className="adminPolicy__scopeCounts">
              <div><dt>{copy.policyId}</dt><dd data-admin-inspector-policy={selected.policyId}>{selected.policyId}</dd></div>
              <div><dt>{copy.hook}</dt><dd>{selected.hook}</dd></div>
              <div><dt>{copy.source}</dt><dd>{selected.source}</dd></div>
              <div><dt>{copy.test}</dt><dd>{selected.test}</dd></div>
            </dl>
            {inspection && (
              <>
                <p className="adminPolicy__note" data-admin-inspector-allowed={inspection.allowed ? 'true' : 'false'} data-admin-inspector-reason={inspection.reason}>
                  {inspection.allowed ? copy.allowed : copy.deniedLabel} · {copy.reason(inspection.reason)}
                </p>
                <p className="adminPolicy__bodyCopy">{copy.evidence}: {inspection.evidence.join(' · ')}</p>
              </>
            )}
          </section>
        )}
      </section>
      )}

      {section === 'enforce' && (
      <>
      <section className="adminPolicy__subpanel" aria-labelledby="admin-console-heading">
        <p className="adminPolicy__eyebrow">{copy.evaluate}</p>
        <h3 id="admin-console-heading" className="adminPolicy__subheading">{copy.decisionConsole}</h3>
        <div className="adminPolicy__formGrid">
          <label htmlFor="admin-console-operation" className="adminPolicy__bodyCopy">{copy.operation}
            <select id="admin-console-operation" className="adminPolicy__select" value={probeOperation} onChange={(event) => setProbeOperation(event.target.value as AdminOperationId)}>
              {OPERATIONS.map((operation) => <option key={operation} value={operation}>{operation}</option>)}
            </select>
          </label>
          <label htmlFor="admin-console-actor" className="adminPolicy__bodyCopy">{copy.actor}
            <input id="admin-console-actor" className="adminPolicy__input" value={probeActor} maxLength={192} onChange={(event) => setProbeActor(event.target.value)} />
          </label>
          <label htmlFor="admin-console-label" className="adminPolicy__bodyCopy">{copy.label}
            <select id="admin-console-label" className="adminPolicy__select" value={probeLabel} onChange={(event) => setProbeLabel(event.target.value as typeof probeLabel)}>
              {SENSITIVITY_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </label>
          <label htmlFor="admin-console-destination" className="adminPolicy__bodyCopy">{copy.destination}
            <input id="admin-console-destination" className="adminPolicy__input" value={probeDestination} maxLength={96} onChange={(event) => setProbeDestination(event.target.value)} />
          </label>
          <label htmlFor="admin-console-justification" className="adminPolicy__bodyCopy">{copy.justification}
            <input id="admin-console-justification" className="adminPolicy__input" value={probeJustification} maxLength={512} onChange={(event) => setProbeJustification(event.target.value)} />
          </label>
          <label htmlFor="admin-console-elevated" className="adminPolicy__bodyCopy">{copy.elevated}
            <input id="admin-console-elevated" type="checkbox" checked={probeElevated} onChange={(event) => setProbeElevated(event.target.checked)} />
          </label>
        </div>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void action.run(async () => {
          // Die Prüfung wird wirklich ausgeführt **und** protokolliert: der Nachweis entsteht aus der
          // Entscheidung, nicht aus der Anzeige.
          const request = {
            operation: probeOperation,
            actorId: probeActor,
            scope: { kind: 'organization' as const, id: model.organization.id },
            subject: { objectId: 'console-object', label: probeLabel, metadata: {}, content: probeJustification },
            destinationKind: probeDestination || 'external',
            destinationId: probeDestination || undefined,
            justification: probeJustification || undefined,
            elevatedAuthorized: probeElevated,
            object: { id: 'console-object', kind: 'Writer', tags: [], createdAt: 0, versionCount: 1 },
            connector: { capabilityId: 'console-capability', host: 'console.example', protocol: 'https' as const, purpose: 'connector' as const },
            keyProvider: { provider: 'console', available: true, hardwareBacked: false, attestationVerified: false, slotTypes: ['os-keychain' as const] },
          };
          onApply(await auditAdminOperationDecision(model, request, evaluateAdminOperation(model, request)));
        })}>
          {copy.evaluate}
        </button>
        {action.status && (
          <p className="adminPolicy__note" role="status" aria-live="polite" data-code={action.status.code}>
            {action.status.ok ? copy.applied : copy.reason(action.status.code)}
          </p>
        )}
        <p
          className="adminPolicy__note"
          role="status"
          data-admin-decision={decision.allowed ? 'allowed' : 'denied'}
          data-admin-decision-reason={decision.reason}
          data-admin-decision-policy={decision.policyId}
        >
          {decision.allowed ? copy.allowed : copy.deniedLabel} · {copy.reason(decision.reason)} · {decision.policyId} · {decision.hook}
        </p>
        <p className="adminPolicy__bodyCopy">{copy.evidence}: {decision.evidence.join(' · ')}{decision.detail ? ` · ${decision.detail}` : ''}</p>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby="admin-compliance-heading">
        <h3 id="admin-compliance-heading" className="adminPolicy__subheading">{copy.compliance}</h3>
        <dl className="adminPolicy__metrics adminPolicy__metricsThree">
          <div><dt>{copy.complianceStatus.enforced}</dt><dd data-admin-compliance-enforced={report.enforced}>{report.enforced}</dd></div>
          <div><dt>{copy.complianceStatus.violation}</dt><dd data-admin-compliance-violations={report.violations}>{report.violations}</dd></div>
          <div><dt>{copy.complianceStatus.gap}</dt><dd data-admin-compliance-gaps={report.gaps}>{report.gaps}</dd></div>
        </dl>
        <p className="adminPolicy__note" data-admin-compliance-blocking={report.blocking ? 'true' : 'false'}>
          {report.blocking ? copy.blocking : copy.allowed}
        </p>
        <ul className="adminPolicy__catalogList">
          {report.findings.map((finding) => (
            <li key={finding.id} data-admin-compliance-status={finding.status} data-admin-compliance-reason={finding.reason}>
              <span>{finding.id}</span>
              <span>{copy.complianceStatus[finding.status]}</span>
              <span>{finding.policyId}</span>
              <span>{copy.reason(finding.reason)}</span>
            </li>
          ))}
        </ul>
        <p className="adminPolicy__bodyCopy">{copy.retentionRules}: {holds} · {coreCopy.configuredRules}: {model.dlp.rules.length}</p>
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby="admin-conflicts-heading">
        <h3 id="admin-conflicts-heading" className="adminPolicy__subheading">{copy.conflicts}</h3>
        {conflicts.length === 0
          ? <p className="adminPolicy__emptyState">{copy.conflictsNone}</p>
          : (
            <ul className="adminPolicy__catalogList">
              {conflicts.map((conflict) => (
                <li key={`${conflict.kind}-${conflict.participants.join('-')}`} data-admin-conflict={conflict.kind}>
                  <span>{conflict.participants.join(', ')}</span>
                  <span>{copy.winner}: {conflict.winner}</span>
                  <span>{copy.resolution[conflict.resolution]}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="adminPolicy__subpanel" aria-labelledby="admin-proof-heading">
        <h3 id="admin-proof-heading" className="adminPolicy__subheading">{copy.matrix}</h3>
        <p className="adminPolicy__bodyCopy">{copy.matrixHint}</p>
        <button type="button" className="adminPolicy__button adminPolicy__buttonPrimary" onClick={() => void action.run(async () => {
          const { proof, materializedCount } = proveFreshProfileEnforcement(model, probeActor);
          setProofLine(proof.map((row) => `${row.operation}:${row.allowed ? 'allowed' : 'denied'}:${row.materialized ? 'materialized' : 'not-materialized'}`).join(' | ') + ` :: ${materializedCount}`);
          // Jede der drei Abnahmeoperationen wird im Auditprotokoll festgehalten — Erlaubnis wie
          // Verweigerung. Ohne diesen Schritt wäre der Nachweis eine Behauptung.
          let audited = model;
          for (const operation of FRESH_PROFILE_OPERATIONS) {
            const request = probeRequestFor(operation, probeActor, model.organization.id);
            audited = await auditAdminOperationDecision(audited, request, evaluateAdminOperation(audited, request));
          }
          onApply(audited);
        })}>
          {copy.evaluate}
        </button>
        <p className="adminPolicy__note" data-admin-fresh-proof={proofLine.length > 0 ? 'present' : 'absent'}>{proofLine}</p>
        <table className="adminPolicy__matrix">
          <caption>{copy.matrixHint}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.matrixColumns[0]}</th>
              <th scope="col">{copy.matrixColumns[1]}</th>
              <th scope="col">{copy.matrixColumns[2]}</th>
              <th scope="col">{copy.matrixColumns[3]}</th>
            </tr>
          </thead>
          <tbody>
            {ADMIN_ENFORCEMENT_MATRIX.map((row) => (
              <tr key={row.operation} data-admin-matrix-operation={row.operation} data-admin-matrix-policy={row.policyId}>
                <td>{row.operation}</td>
                <td>{row.policyId}</td>
                <td>{row.hook}</td>
                <td>{row.source} · {row.test}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      </>
      )}
    </div>
  );
};
