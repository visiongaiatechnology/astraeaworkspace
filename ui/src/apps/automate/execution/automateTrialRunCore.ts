// STATUS: PLATIN — pure Automate run-outcome decisions.
//
// MEASURED FACTS this module encodes (see BATCH-60 notes.md):
//  - `AutomateView.simulate` never left the process: it awaited `setTimeout` per node and then wrote
//    `status: 'success'` on every step and on the run, while `simulated: true` already said otherwise.
//  - `crates/vgt-automation-runtime` is not reachable from `renderToStaticMarkup`/Vitest here, so this
//    round keeps the honest trial label instead of wiring an engine.
// The only states this module may produce are `simulated` (trial/checked) and `failed`.

import type { AutomateDocumentModel, FlowExecutionRun, FlowNode, FlowRunStatus } from '../model/types';

export interface AutomateRunOutcomeInput {
  /** Validation issues of the flow under test; any issue blocks the trial. */
  readonly issueCount: number;
  /** Node ids in the order the trial walks them (from `buildRunPreview`). */
  readonly order: readonly string[];
  /** The flow model the trial reads node titles from. */
  readonly nodes: readonly Pick<FlowNode, 'id' | 'title'>[];
  readonly flowVersion: number;
  readonly now: number;
}

export interface AutomateRunOutcome {
  /** What the interface may claim about the run as a whole. */
  readonly runStatus: FlowRunStatus;
  /** What the interface may claim about each walked node. */
  readonly nodeStatus: FlowRunStatus;
  /** The existing honest signal, pinned to `true` for every trial this module produces. */
  readonly simulated: boolean;
  /** Node ids in walk order (empty when the flow is invalid). */
  readonly order: readonly string[];
  /** True only when a real execution engine produced this run. Never true here. */
  readonly executed: boolean;
  /** i18n key of the visible notice the view must render. */
  readonly notice: 'invalidFlow' | 'trialNotice';
  /** Data-attribute value for the acceptance harness. */
  readonly trialState: 'blocked' | 'trial';
}

/**
 * Decide the whole truth of a trial run before the view touches it.
 * An invalid flow is never run at all, so it can only produce a blocked outcome.
 */
export function resolveAutomateRunOutcome(input: AutomateRunOutcomeInput): AutomateRunOutcome {
  if (input.issueCount > 0) {
    return {
      runStatus: 'failed',
      nodeStatus: 'failed',
      simulated: false,
      order: [],
      executed: false,
      notice: 'invalidFlow',
      trialState: 'blocked',
    };
  }
  return {
    runStatus: 'simulated',
    nodeStatus: 'simulated',
    simulated: true,
    order: [...input.order],
    executed: false,
    notice: 'trialNotice',
    trialState: 'trial',
  };
}

/**
 * Build a trial step record. Deliberately carries no `safeMessage` wording of its own:
 * the view renders localized text through `copy.trialStepMessage(nodeTitle)`.
 */
export function buildTrialStep(
  nodeId: string,
  nodeTitle: string,
  startedAt: number,
  endedAt: number,
): FlowExecutionRun['steps'][number] {
  return {
    nodeId,
    nodeTitle,
    status: 'simulated',
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    safeMessage: `Trial: ${nodeTitle}`,
    redactedInput: null,
    redactedOutput: null,
  };
}

/** Build the trial run record for an already-walked order. */
export function buildTrialRun(
  model: Pick<AutomateDocumentModel, 'version'>,
  outcome: AutomateRunOutcome,
  startedAt: number,
  endedAt: number,
  steps: FlowExecutionRun['steps'],
): FlowExecutionRun {
  return {
    id: `run-${startedAt}`,
    flowVersion: model.version,
    startedAt,
    endedAt,
    status: outcome.runStatus,
    durationMs: Math.max(0, endedAt - startedAt),
    triggerKind: 'manual',
    simulated: outcome.simulated,
    steps,
  };
}

const TERMINAL_STATUSES: readonly FlowRunStatus[] = ['simulated', 'success', 'failed', 'cancelled', 'quarantined'];

/**
 * A node/run state that a viewer may read as "executed successfully".
 * Used by the canvas to pick a non-success presentation and a text label for trials.
 */
export function isExecutionClaimed(status: FlowRunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.includes(status) && status !== 'simulated';
}

/** Text decorator for a trial state, so the state never depends on colour alone. */
export function trialStatusLabel(badge: string, status: FlowRunStatus | undefined): string {
  return status === 'simulated' ? badge : '';
}
