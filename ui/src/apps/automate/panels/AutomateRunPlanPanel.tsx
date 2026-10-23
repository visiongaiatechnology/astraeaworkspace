// STATUS: DIAMANT VGT SUPREME — the visible preflight: what the flow needs and whether it is permitted.
//
// This panel is the first caller of `providers/automatePermissionCore.ts`, which had no importer before.
// It shows the answer for the CURRENT document, so a user can see a refusal before pressing anything.
// It states plainly that the plan executes nothing — the panel never implies a run happened.
import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react';
import type { AutomateDocumentModel } from '../model/types';
import { planAutomateRun, type RunRefusalCode } from '../execution/automateRunPlanCore';
import { useAutomateCopy } from '../locale/automateLocale';

interface Props {
  model: AutomateDocumentModel;
}

/** i18n keys for the refusal codes. Every code the core can emit is listed, so none renders raw. */
const REFUSAL_KEYS: Readonly<Record<RunRefusalCode, string>> = {
  'plan-graph-invalid': 'planGraphInvalid',
  'plan-trigger-config-invalid': 'planTriggerConfigInvalid',
  'plan-capability-undeclared': 'planCapabilityUndeclared',
  'plan-overprivileged-manifest': 'planOverprivilegedManifest',
  'plan-policy-denied': 'planPolicyDenied',
  'plan-manifest-invalid': 'planManifestInvalid',
};

export const AutomateRunPlanPanel: React.FC<Props> = ({ model }) => {
  const copy = useAutomateCopy();
  const labels = copy as unknown as Record<string, string>;
  const plan = useMemo(() => planAutomateRun(model), [model]);

  return (
    <section className="automate-run-plan" data-automate-run-plan={plan.permitted ? 'permitted' : 'refused'} aria-labelledby="automate-run-plan-heading">
      <h4 id="automate-run-plan-heading" className="automate-run-plan-title text-[0.625rem] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <KeyRound aria-hidden="true"/>{copy.runPlan}
      </h4>

      <p className="automate-run-plan-state text-[0.6875rem] flex items-center gap-1.5" role="status">
        {plan.permitted
          ? <><CheckCircle2 aria-hidden="true"/>{copy.runPlanPermitted}</>
          : <><ShieldAlert aria-hidden="true"/>{copy.runPlanRefused(plan.refusals.length)}</>}
      </p>

      {!plan.permitted && (
        <ul className="automate-run-plan-refusals space-y-0.5 text-[0.625rem] mt-1">
          {plan.refusals.map((code) => (
            <li key={code} data-automate-run-refusal={code}>
              <AlertTriangle aria-hidden="true"/> {labels[REFUSAL_KEYS[code]] ?? code}
            </li>
          ))}
        </ul>
      )}

      <p className="automate-run-plan-caps text-[0.625rem] mt-1">{copy.runPlanCapabilities(plan.requiredCapabilities.length)}</p>
      {plan.requiredCapabilities.length > 0 && (
        <ul className="automate-run-plan-cap-list text-[0.625rem] font-mono space-y-0.5">
          {plan.requiredCapabilities.map((capability) => (
            <li key={capability} data-automate-run-capability={capability}>{capability}</li>
          ))}
        </ul>
      )}

      {plan.deniedCapabilities.length > 0 && (
        <p data-automate-run-denied={plan.deniedCapabilities.length} className="automate-run-plan-denied text-[0.625rem] mt-1">
          {copy.runPlanDenied(plan.deniedCapabilities.length)}
        </p>
      )}

      <p className="automate-run-plan-honest text-[0.625rem] mt-1">{copy.runPlanExecutesNothing}</p>
    </section>
  );
};
