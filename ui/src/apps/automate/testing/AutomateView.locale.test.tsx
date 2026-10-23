// STATUS: PLATIN — Automate editor controls, status labels, and run surfaces render for every supported locale.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_AUTOMATE_MODEL } from '../model/types';
import { automateCopy } from '../locale/automateLocale';
import { AutomateView } from '../app/AutomateView';
import { AutomateCanvas } from '../canvas/AutomateCanvas';
import { AutomateRunDrawer } from '../execution/AutomateRunDrawer';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const document = {
  id: 'automate-locale-test',
  kind: 'Automate',
  modified_at: 0,
  automateData: structuredClone(DEFAULT_AUTOMATE_MODEL),
} as unknown as WorkspaceDocument;

describe('Automate locale catalog', () => {
  it.each(WORKSPACE_LOCALES)('renders editor and run controls in %s', (locale) => {
    localeState.current = locale;
    const copy = automateCopy(locale);
    const markup = renderToStaticMarkup(<AutomateView document={document} onUpdateDocument={vi.fn()} />);

    expect(markup).toContain(copy.productTitle);
    expect(markup).toContain(`aria-label="${copy.toolbar}"`);
    expect(markup).toContain(`aria-label="${copy.palette}"`);
    expect(markup).toContain(copy.templateTitle('Workspace Event'));
    expect(markup).toContain(`aria-label="${copy.canvas}"`);
    expect(markup).toContain(`aria-label="${copy.runDrawer}"`);
    expect(markup).toContain(copy.noRuns);
    expect(markup).toContain(copy.validationPass);
  });

  it.each(WORKSPACE_LOCALES)('localizes typed execution, node, validation, and accessibility states in %s', (locale) => {
    const copy = automateCopy(locale);
    for (const state of ['queued', 'running', 'paused', 'success', 'failed', 'cancelled', 'quarantined', 'simulated']) {
      expect(copy.executionStatus(state)).not.toBe(state);
      expect(copy.execution(state)).not.toBe(state);
    }
    expect(copy.nodeType('transform')).not.toBe('transform');
    expect(copy.validationCode('graph-cycle-rejected')).not.toBe('graph-cycle-rejected');
    expect(copy.validationCode('preview-invalid:expression-variable-missing')).not.toContain('preview-invalid');
    expect(copy.accessibilityCode('designer-zoom-out-of-range')).not.toBe('designer-zoom-out-of-range');
    expect(copy.validationCode('engine-new-code')).not.toBe('engine-new-code');
  });

  it.each(WORKSPACE_LOCALES)('renders localized graph issue codes and safe step messages in %s', (locale) => {
    localeState.current = locale;
    const copy = automateCopy(locale);
    const invalidModel = structuredClone(DEFAULT_AUTOMATE_MODEL);
    invalidModel.nodes = [];
    invalidModel.connections = [];
    const canvasMarkup = renderToStaticMarkup(<AutomateCanvas model={invalidModel} onUpdateModel={vi.fn()} />);
    expect(canvasMarkup).toContain(copy.validationCode('node-count-boundary'));
    expect(canvasMarkup).toContain(copy.validationCode('trigger-required'));
    expect(canvasMarkup).not.toContain('trigger-required');

    const runModel = structuredClone(DEFAULT_AUTOMATE_MODEL);
    runModel.runs = [{
      id: 'locale-run', flowVersion: 1, startedAt: 0, endedAt: 1, status: 'failed', durationMs: 1,
      triggerKind: 'manual', simulated: true,
      steps: [
        { nodeId: 'node-action', nodeTitle: 'User-authored action', status: 'success', startedAt: 0, endedAt: 1, durationMs: 1, safeMessage: 'Simulated action' },
        { nodeId: 'node-unknown', nodeTitle: 'Unknown engine step', status: 'failed', startedAt: 0, endedAt: 1, durationMs: 1, safeMessage: 'engine-private-runtime-detail' },
      ],
    }];
    const runMarkup = renderToStaticMarkup(<AutomateRunDrawer model={runModel} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(runMarkup).toContain(copy.runStepMessage('Simulated action'));
    expect(runMarkup).toContain(copy.runStepMessage('engine-private-runtime-detail'));
    expect(runMarkup).not.toContain('engine-private-runtime-detail');
    expect(runMarkup).toContain('User-authored action');
  });
});
