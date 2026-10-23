// STATUS: PLATIN — BATCH-60 source contract: the Automate "run" claim is gone.
// Comments are stripped (string-literal aware), so documentation is not mistaken for code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const strip = (source) => {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 1; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && next === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? source.length : end + 1; continue; }
    if (ch === '/' && next === '/') { const end = source.indexOf('\n', i); i = end === -1 ? source.length : end; continue; }
    out += ch;
  }
  return out;
};

const view = strip(read('../app/AutomateView.tsx'));
const canvas = strip(read('../canvas/AutomateCanvas.tsx'));
const drawer = strip(read('../execution/AutomateRunDrawer.tsx'));
const core = strip(read('../execution/automateTrialRunCore.ts'));
const css = read('../canvas/AutomateCanvasTheme.css');

describe('Automate trial source contract', () => {
  it('no longer marks nodes or runs as successfully executed', () => {
    expect(view).not.toMatch(/lastExecutionStatus:\s*'success'/);
    expect(view).not.toMatch(/lastExecutionStatus:'success'/);
    expect(view).not.toMatch(/status:\s*'success'/);
    expect(view).not.toMatch(/status:'success'/);
    expect(core).toContain("runStatus: 'simulated'");
    expect(core).toContain("nodeStatus: 'simulated'");
    expect(view).toContain('outcome.nodeStatus');
  });

  it('never presents a trial node or run with the success treatment', () => {
    expect(canvas).not.toMatch(/simulated:\s*'automate-status-dot--success'/);
    expect(canvas).toContain("simulated: 'automate-status-dot--trial'");
    expect(drawer).not.toMatch(/status === 'success' \|\| status === 'simulated'/);
    expect(drawer).toContain("if (status === 'simulated') return 'automate-run-status--trial';");
    // Wording is carried by text, not by colour alone.
    expect(canvas).toContain('data-automate-trial-badge="true"');
    expect(drawer).toContain('data-automate-run-status={run.status}');
    expect(drawer).toContain('data-automate-step-status={step.status}');
    expect(css).toContain('.automate-status-dot--trial');
  });

  it('routes every run decision through the pure resolver instead of the JSX handler', () => {
    expect(view).toContain('resolveAutomateRunOutcome({');
    expect(view).toContain('buildTrialStep(');
    expect(view).toContain('buildTrialRun(');
    expect(view).toContain('setExecutionNotice(copy.trialNotice)');
    expect(view).toContain('data-automate-trial-state={trialState}');
  });

  it('labels the trigger honestly and drops the simulated-node executor wording', () => {
    expect(view).toContain('copy.runTrial');
    expect(view).not.toContain('copy.runPreview');
    expect(view).not.toContain('copy.simulated(');
    expect(view).not.toMatch(/`Simulated \$\{node\.type\}`/);
    expect(view).not.toMatch(/`Simulated \$\{nodeType\}`/);
  });

  it('does not secretly claim a sandbox execution engine', () => {
    const locale = read('../locale/automateLocale.ts');
    expect(locale).not.toMatch(/sandboxDescription: '[^']*isolated in-process sandbox/);
    expect(locale).toContain('trialNotice');
  });
});
