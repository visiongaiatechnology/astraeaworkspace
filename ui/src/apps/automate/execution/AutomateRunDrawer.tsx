// STATUS: DIAMANT VGT SUPREME — Theme-aware execution inspector with preserved semantic run states.
import React from 'react';
import { AlertTriangle, History, CheckCircle2, Play, Trash2 } from 'lucide-react';import type { AutomateDocumentModel, FlowExecutionStep, JsonValue } from '../model/types';
import { redactRunStepPayload } from './automateObservabilityCore';
import { AutomateRunPlanPanel } from '../panels/AutomateRunPlanPanel';
import { AutomateFabricInboxPanel } from '../panels/AutomateFabricInboxPanel';
import { AutomateDebugStepView } from '../panels/AutomateDebugStepView';
import { useAutomateCopy } from '../locale/automateLocale';

interface AutomateRunDrawerProps {
  model: AutomateDocumentModel;
  onUpdateModel: (updater: (prev: AutomateDocumentModel) => AutomateDocumentModel) => void;
  onTriggerSimulation: () => void;
  /** Named load/validation refusals for the current document, shown as-is. */
  loadIssues?: readonly string[];
}

function runStateClass(status: string): string {
  if (status === 'simulated') return 'automate-run-status--trial';
  if (status === 'success') return 'automate-run-status--success';
  if (status === 'failed' || status === 'cancelled' || status === 'quarantined') return 'automate-run-status--critical';
  if (status === 'running') return 'automate-run-status--running';
  return 'automate-run-status--neutral';
}

/**
 * One definition of what a run step may display.
 * A step payload is ALWAYS routed through the observability redactor, even when a producer already
 * redacted it: defence in depth, so no future engine can leak a value by forgetting to redact.
 */
function safeStepPayload(step: FlowExecutionStep): string | null {
  const payload = (step.redactedInput ?? step.redactedOutput) as JsonValue | undefined;
  if (payload === undefined || payload === null) return null;
  return JSON.stringify(redactRunStepPayload(payload));
}

export const AutomateRunDrawer: React.FC<AutomateRunDrawerProps> = ({ model, onUpdateModel, onTriggerSimulation, loadIssues = [] }) => {
  const copy = useAutomateCopy();
  const { runs } = model;
  const clearRuns = () => onUpdateModel((previous) => ({ ...previous, runs: [] }));

  return (
    <aside className="automate-run-drawer w-80 flex flex-col select-none overflow-y-auto" aria-label={copy.runDrawer}>
      <div className="automate-run-drawer-header h-10 px-4 flex items-center justify-between text-xs font-semibold">
        <span className="flex items-center gap-1.5"><History className="automate-run-history-icon" aria-hidden="true"/>{copy.runDrawer}</span>
        <button onClick={clearRuns} className="automate-clear-runs p-1" aria-label={copy.clearHistory} title={copy.clearHistory}><Trash2 aria-hidden="true"/></button>
      </div>

      <div className="p-4 space-y-4 text-xs">
        <section className="automate-sandbox-panel rounded-lg p-3" aria-labelledby="automate-sandbox-heading">
          <h4 id="automate-sandbox-heading" className="automate-sandbox-title font-semibold mb-1">{copy.sandbox}</h4>
          <p className="automate-sandbox-description text-[0.6875rem] leading-relaxed">{copy.sandboxDescription}</p>
          <p data-automate-trial-notice="true" role="status" className="automate-trial-notice mt-2 text-[0.6875rem] leading-relaxed">{copy.trialNotice}</p>
          <button onClick={onTriggerSimulation} className="automate-primary-button mt-3 w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5">
            <Play aria-hidden="true"/><span>{copy.simulate}</span>
          </button>
        </section>

        <div className="automate-run-plan-panel rounded-lg p-3">
          <AutomateRunPlanPanel model={model} />
        </div>

        <div className="automate-fabric-panel rounded-lg p-3">
          <AutomateFabricInboxPanel model={model} onUpdateModel={onUpdateModel} />
        </div>

        <div className="automate-debug-panel rounded-lg p-3">
          <AutomateDebugStepView model={model} />
        </div>

        {loadIssues.length > 0 && (
          <section data-automate-load-issues={loadIssues.length} aria-labelledby="automate-load-issues-heading" className="automate-load-issues rounded-lg p-3">
            <h4 id="automate-load-issues-heading" className="automate-load-issues-title font-semibold mb-1 flex items-center gap-1.5">
              <AlertTriangle aria-hidden="true"/>{copy.loadIssues(loadIssues.length)}
            </h4>
            <ul className="automate-load-issue-list space-y-0.5 text-[0.625rem] font-mono">
              {loadIssues.slice(0, 8).map((code, index) => <li key={`${code}-${index}`} data-automate-load-issue={code}>{copy.validationCode(code)}</li>)}
            </ul>
          </section>
        )}

        <section className="space-y-3" aria-labelledby="automate-recent-runs-heading">
          <h4 id="automate-recent-runs-heading" className="automate-runs-caption text-[0.625rem] font-bold uppercase tracking-wider">{copy.recentRuns(runs.length)}</h4>
          {runs.length === 0 ? <p className="automate-run-message block text-[0.6875rem]">{copy.noRuns}</p> : runs.map((run) => (
            <article key={run.id} data-automate-run-status={run.status} data-automate-run-simulated={run.simulated ? 'true' : 'false'} className="automate-run-entry p-3 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className={`automate-run-status text-[0.6875rem] font-semibold flex items-center gap-1 ${runStateClass(run.status)}`}>
                  <CheckCircle2 aria-hidden="true"/>{copy.execution(run.status)}{run.status === 'simulated' ? ` · ${copy.trialBadge}` : ''}
                </span>
                <span className="automate-run-duration font-mono text-[0.625rem]">{run.durationMs}ms</span>
              </div>

              <div className="automate-run-steps space-y-1 pt-2">
                {run.steps.map((step, index) => {
                  const payload = safeStepPayload(step);
                  return (
                    <div key={`${run.id}-${step.nodeId}-${index}`} data-automate-step-status={step.status} className="automate-run-step text-[0.6875rem] flex items-start gap-1.5">
                      <span className="automate-run-index font-mono">{index + 1}.</span>
                      <span>
                        <span className="automate-run-node-title block font-medium">{step.nodeTitle}</span>
                        <span className="automate-run-message block text-[0.625rem] font-mono">{step.status === 'simulated' ? copy.trialStepMessage(step.nodeTitle) : copy.runStepMessage(step.safeMessage)}</span>
                        {payload !== null && <span data-automate-step-payload="redacted" className="automate-run-payload block text-[0.625rem] font-mono break-all">{payload}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      </div>
    </aside>
  );
};
