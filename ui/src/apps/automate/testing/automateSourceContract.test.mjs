// STATUS: PLATIN — BATCH-AUTOMATE source contract: file-reading checks only.
//
// This file must be `.mjs`: a `.ts`/`.tsx` test has no Node type declarations, so `node:fs` is a TS2307
// error under `tsc --noEmit`. Measured — the render test in the `.tsx` companion tripped exactly that.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const palette = read('../toolbar/AutomatePalette.tsx');
const view = read('../app/AutomateView.tsx');
const canvas = read('../canvas/AutomateCanvas.tsx');
const editing = read('../model/automateEditingCore.ts');

describe('Automate wiring contract (source)', () => {
  it('has exactly one node-id minter and the palette no longer closes over the render snapshot', () => {
    expect(palette).toContain('buildNodeFromTemplate');
    expect(palette).not.toMatch(/nodes\.length \+ 1/);
    expect(palette).not.toMatch(/const id = `node-\$\{Date\.now\(\)/);
    expect(editing.match(/export function nextNodeId/g)).toHaveLength(1);
  });

  it('seeds each palette add with the per-instance counter, not a constant', () => {
    // Guards the wiring itself. Proven by counter-check: replacing this expression with a literal
    // turns the companion `.tsx` test of the same name red.
    expect(palette).toMatch(/paletteSeed \+= 1;/);
    expect(palette).toMatch(/buildNodeFromTemplate\(previous, template, `\$\{Date\.now\(\)\.toString\(36\)\}-\$\{paletteSeed\}`\)/);
  });

  it('routes connection creation through the editing core, not inline in JSX', () => {
    expect(view).toContain('addAutomateConnection');
    expect(canvas).toContain('onCompleteConnect');
    expect(canvas).toContain('data-automate-connect-control');
  });

  it('keeps exactly one definition of what a refused flow is', () => {
    // `flowRefusalIssues` is the single list; the view renders it and `inspectFlowForLoad` reuses it.
    expect(editing.match(/export function flowRefusalIssues/g)).toHaveLength(1);
    expect(editing).toMatch(/const issues = flowRefusalIssues\(candidate\);/);
    expect(view).toContain('flowRefusalIssues(model)');
    expect(view).not.toMatch(/const loadIssues=\[\.\.\.issues/);
  });

  it('keeps exactly one definition of redacting a run payload', () => {
    const drawer = read('../execution/AutomateRunDrawer.tsx');
    const observability = read('../execution/automateObservabilityCore.ts');
    expect(observability.match(/export function redactRunStepPayload/g)).toHaveLength(1);
    expect(drawer).toContain('redactRunStepPayload(payload)');
  });

  it('offers only trigger configs that satisfy the trigger contract', () => {
    expect(palette).toContain("every: { unit: 'minute', interval: 15 }");
    expect(palette).not.toMatch(/config: \{ triggerKind: 'schedule', timezone: 'UTC', interval: 15 \}/);
  });

  it('gates the trial on every refusal term, and not on a merely absent field', () => {
    // The four terms are graph legality, declared capability, trigger config and config value. An
    // *absent* field is deliberately not among them: it has a declared fallback, so it is incomplete
    // (the inspector offers it) rather than a contract violation.
    expect(view).toContain('const graphIssues=issues.length+capabilityGaps.length+triggerConfigIssues.length+configValueIssues.length;');
    expect(view).toContain('disabled={graphIssues>0}');
    expect(view).not.toContain('disabled={issues.length>0}');
  });

  it('keeps exactly one definition of the config field contract', () => {
    const schema = read('../model/automateConfigSchema.ts');
    expect(schema.match(/export function fieldsForNode/g)).toHaveLength(1);
    expect(schema.match(/export function validateNodeConfigValues/g)).toHaveLength(1);
    // The inspector renders from the schema and must never carry a field list of its own.
    const inspector = read('../panels/AutomateNodeInspector.tsx');
    expect(inspector).toContain('fieldsForNode(node)');
    expect(inspector).not.toMatch(/kind: 'number',/);
  });

  it('no longer asserts a sandbox execution engine in any locale literal', () => {
    const locale = read('../locale/automateLocale.ts');
    const falseClaims = [
      /isoliert im Prozess mit strengen Speichergrenzen/,
      /выполняются в изолированной песочнице/,
      /vengono eseguiti in una sandbox/,
      /se ejecutan en una sandbox aislada/,
      /プロセス内分離サンドボックスで実行されます/,
      /在进程内隔离沙箱中运行/,
      /executed in an isolated in-process sandbox/,
    ];
    for (const claim of falseClaims) expect(locale).not.toMatch(claim);
  });

  it('still carries the trial notice that replaced the false claim', () => {
    const locale = read('../locale/automateLocale.ts');
    expect(locale).toContain('trialNotice');
    expect(locale.match(/loadIssues: n =>/g)).toHaveLength(7);
  });
});
