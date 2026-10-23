// STATUS: PLATIN — BATCH-60: an Automate trial run must never read as "executed successfully".
// Pure decisions + visible text. No jsdom: react-dom/server markup only.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_AUTOMATE_MODEL, type FlowExecutionRun } from '../model/types';
import { buildRunPreview, validateFlowModel } from '../model/automateFlowCore';
import {
  buildTrialRun,
  buildTrialStep,
  isExecutionClaimed,
  resolveAutomateRunOutcome,
  trialStatusLabel,
} from '../execution/automateTrialRunCore';
import { AutomateCanvas } from '../canvas/AutomateCanvas';
import { AutomateRunDrawer } from '../execution/AutomateRunDrawer';
import { AutomateView } from '../app/AutomateView';
import { automateCopy } from '../locale/automateLocale';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const model = structuredClone(DEFAULT_AUTOMATE_MODEL);
const order = buildRunPreview(model);

describe('Automate run outcome decision (pure)', () => {
  it('produces a simulated trial, never a success', () => {
    const outcome = resolveAutomateRunOutcome({ issueCount: 0, order, nodes: model.nodes, flowVersion: model.version, now: 1_000 });
    expect(outcome.runStatus).toBe('simulated');
    expect(outcome.nodeStatus).toBe('simulated');
    expect(outcome.simulated).toBe(true);
    expect(outcome.executed).toBe(false);
    expect(outcome.notice).toBe('trialNotice');
    expect(outcome.order).toEqual(order);
  });

  it('never reports a run or node status a viewer could read as executed', () => {
    const outcome = resolveAutomateRunOutcome({ issueCount: 0, order, nodes: model.nodes, flowVersion: model.version, now: 1_000 });
    expect(outcome.runStatus).not.toBe('success');
    expect(outcome.nodeStatus).not.toBe('success');
    expect(isExecutionClaimed(outcome.runStatus)).toBe(false);
    expect(isExecutionClaimed(outcome.nodeStatus)).toBe(false);
  });

  it('blocks an invalid flow without simulating anything', () => {
    const outcome = resolveAutomateRunOutcome({ issueCount: 2, order, nodes: model.nodes, flowVersion: model.version, now: 1_000 });
    expect(outcome.runStatus).toBe('failed');
    expect(outcome.simulated).toBe(false);
    expect(outcome.executed).toBe(false);
    expect(outcome.notice).toBe('invalidFlow');
    expect(outcome.trialState).toBe('blocked');
    expect(outcome.order).toEqual([]);
  });

  it('keeps success distinct from a trial for legacy readers', () => {
    expect(isExecutionClaimed('success')).toBe(true);
    expect(isExecutionClaimed('simulated')).toBe(false);
    expect(isExecutionClaimed(undefined)).toBe(false);
    expect(isExecutionClaimed('failed')).toBe(true);
  });

  it('builds steps that claim no execution and carry no executor wording', () => {
    const step = buildTrialStep('node-action', 'Create incident task', 10, 90);
    expect(step.status).toBe('simulated');
    expect(step.durationMs).toBe(80);
    expect(step.safeMessage).toBe('Trial: Create incident task');
    expect(step.safeMessage).not.toMatch(/^Simulated /);
    expect(step.redactedInput).toBeNull();
    const run = buildTrialRun(model, resolveAutomateRunOutcome({ issueCount: 0, order, nodes: model.nodes, flowVersion: model.version, now: 5 }), 5, 105, [step]);
    expect(run.status).toBe('simulated');
    expect(run.simulated).toBe(true);
    expect(run.triggerKind).toBe('manual');
    expect(run.flowVersion).toBe(model.version);
  });
});

describe('Automate visible text for a trial run', () => {
  it('labels the trial everywhere in every locale, with no "executed successfully" claim', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = automateCopy(locale);
      expect(copy.runTrial.length).toBeGreaterThan(0);
      expect(copy.runTrial).not.toBe(copy.simulate);
      expect(copy.trialNotice.length).toBeGreaterThan(0);
      expect(copy.trialBadge.length).toBeGreaterThan(0);
      expect(copy.trialStepMessage('Create incident task')).toContain('Create incident task');
      expect(copy.trialStepMessage('Create incident task')).not.toBe(copy.runStepMessage('Simulated action'));
      // The trial wording must not be the success wording.
      expect(copy.execution('simulated')).not.toBe(copy.execution('success'));
      expect(trialStatusLabel(copy.trialBadge, 'simulated')).toBe(copy.trialBadge);
      expect(trialStatusLabel(copy.trialBadge, 'success')).toBe('');
    }
  });

  it('renders the trial button label and the trial notice instead of a run claim', () => {
    localeState.current = 'de-DE';
    const copy = automateCopy('de-DE');
    const document = { id: 'automate-trial', kind: 'Automate', modified_at: 0, automateData: model } as unknown as WorkspaceDocument;
    const markup = renderToStaticMarkup(<AutomateView document={document} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain(copy.runTrial);
    expect(markup).toContain('data-automate-trial-state="idle"');
    expect(markup).not.toContain('Run preview');
  });

  it('marks trial nodes on the canvas without the success treatment', () => {
    localeState.current = 'de-DE';
    const copy = automateCopy('de-DE');
    const trialModel = structuredClone(model);
    trialModel.nodes = trialModel.nodes.map((node) => ({ ...node, lastExecutionStatus: 'simulated' as const }));
    trialModel.runs = [buildTrialRun(model, resolveAutomateRunOutcome({ issueCount: 0, order, nodes: model.nodes, flowVersion: model.version, now: 1 }), 1, 5, [])];
    const canvasMarkup = renderToStaticMarkup(<AutomateCanvas model={trialModel} onUpdateModel={vi.fn()} />);
    expect(canvasMarkup).toContain('data-automate-node-status="simulated"');
    expect(canvasMarkup).toContain('data-automate-trial-badge="true"');
    expect(canvasMarkup).toContain(copy.trialStepMessage(copy.templateTitle('Workspace security event')));
    expect(canvasMarkup).not.toContain('automate-status-dot--success');
  });

  it('renders trial runs, their steps and the sandbox notice honestly in the run drawer', () => {
    localeState.current = 'de-DE';
    const copy = automateCopy('de-DE');
    const steps = order.map((id, index) => buildTrialStep(id, model.nodes.find((n) => n.id === id)?.title ?? id, index * 80, index * 80 + 80));
    const run: FlowExecutionRun = buildTrialRun(model, resolveAutomateRunOutcome({ issueCount: 0, order, nodes: model.nodes, flowVersion: model.version, now: 1 }), 1, 400, steps);
    const runModel = structuredClone(model);
    runModel.runs = [run];
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={runModel} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-run-status="simulated"');
    expect(markup).toContain(`data-automate-run-simulated="true"`);
    expect(markup).toContain(copy.execution('simulated'));
    expect(markup).toContain(copy.trialBadge);
    expect(markup).toContain(copy.trialNotice);
    expect(markup).toContain(copy.trialStepMessage(copy.templateTitle('Workspace security event')));
    expect(markup).toContain(`data-automate-step-status="simulated"`);
    expect(markup).not.toContain('automate-run-status--success');
    expect(markup).not.toContain(copy.execution('success'));
    expect(markup).not.toContain('Simulated trigger');
  });

  it('keeps a genuinely failed run readable as failed', () => {
    localeState.current = 'de-DE';
    const copy = automateCopy('de-DE');
    const failedModel = structuredClone(model);
    failedModel.runs = [{
      id: 'run-failed', flowVersion: 1, startedAt: 0, endedAt: 1, status: 'failed', durationMs: 1,
      triggerKind: 'manual', simulated: false,
      steps: [{ nodeId: 'node-action', nodeTitle: 'Create incident task', status: 'failed', startedAt: 0, endedAt: 1, durationMs: 1, safeMessage: 'unmapped-engine-detail' }],
    }];
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={failedModel} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain(copy.execution('failed'));
    expect(markup).not.toContain('unmapped-engine-detail');
  });

  it('accepts only an executable flow for a trial', () => {
    const invalid = structuredClone(model);
    invalid.nodes = [];
    invalid.connections = [];
    expect(validateFlowModel(invalid).length).toBeGreaterThan(0);
    expect(validateFlowModel(model).length).toBe(0);
  });
});
