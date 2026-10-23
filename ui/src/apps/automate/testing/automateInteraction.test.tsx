// STATUS: PLATIN — BATCH-AUTOMATE interaction contract for the Automate surface.
//
// Two things are proven here that the previous Automate tests could not see:
//  1. "Two calls in ONE instance" — the same editor/connection entry point is invoked twice and the
//     ACCUMULATED result is asserted. Node admission used to derive its id from `Date.now()` plus the
//     rendered node count, so a second add inside one render window could mint a duplicate id.
//  2. Cross-locale honesty — the run drawer claims "no execution engine" in ALL seven locales. The old
//     source contract only ever inspected the en-US literals, so six locales kept a false claim.
//
// Render contracts use `renderToStaticMarkup` (headless, no jsdom). Source-file checks live in the
// `.mjs` companion `automateSourceContract.test.mjs`: a `.tsx` test has no Node type declarations, so
// `node:fs` would be a TS2307 error under `tsc --noEmit`.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_AUTOMATE_MODEL, type AutomateDocumentModel } from '../model/types';
import {
  addAutomateConnection,
  AutomateEditingError,
  buildNodeFromTemplate,
  createAutomateConnection,
  deriveFlowCapabilities,
  filterAutomateBlocks,
  flowRefusalIssues,
  inspectFlowForLoad,
  MAX_FLOW_NODES,
  nextNodeId,
  normalizeAutomateSearch,
  tokenizePaletteQuery,
  undeclaredFlowCapabilities,
  updateNodeField,
  validateFlowTriggerConfigs,
  type AutomateBlockTemplate,
} from '../model/automateEditingCore';
import {
  fieldsForNode,
  hasConfigPath,
  parseMapping,
  serializeMapping,
  validateNodeConfig,
  validateNodeConfigValues,
  withConfigDefaults,
  writeFieldValue,
} from '../model/automateConfigSchema';
import {
  computeTraversedPath,
  isConnectionOnPath,
  isNodeOnPath,
  pathPosition,
} from '../execution/automatePathCore';
import { validateFlowModel, buildRunPreview } from '../model/automateFlowCore';
import { PERMISSIVE_AUTOMATION_POLICY, planAutomateRun, toManifestCapabilityId } from '../execution/automateRunPlanCore';
import {
  buildAutomateTimeline,
  inspectableRuns,
  selectTimelineStep,
} from '../execution/automateTimelineCore';
import {
  acceptedWorkspaceEvents,
  describeEventDelivery,
  FABRIC_WORKSPACE_EVENT_TYPES,
  flowFabricEvents,
  matchingTriggerNodeIds,
  MAX_FABRIC_EVENTS,
  MAX_FABRIC_PAYLOAD_TEXT,
  recordFabricEvent,
} from '../integrations/automateFabricInboxCore';
import { AUTOMATE_RUN_LOG_POLICY, containsRedactableContent, redactRunStepPayload } from '../execution/automateObservabilityCore';
import { AUTOMATE_BLOCK_TEMPLATES, AutomatePalette } from '../toolbar/AutomatePalette';
import { AutomateCanvas } from '../canvas/AutomateCanvas';
import { AutomateRunDrawer } from '../execution/AutomateRunDrawer';
import { AutomateNodeInspector } from '../panels/AutomateNodeInspector';
import { AutomateView } from '../app/AutomateView';
import { automateCopy } from '../locale/automateLocale';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const model = () => structuredClone(DEFAULT_AUTOMATE_MODEL);
const doc = (automateData: AutomateDocumentModel) => ({
  id: 'automate-batch-interaction',
  kind: 'Automate',
  modified_at: 0,
  automateData,
} as unknown as WorkspaceDocument);

// NOTE: props cannot be inspected by invoking a component directly — these components call hooks, so
// calling them outside a renderer throws "Invalid hook call". Every render assertion below therefore
// reads the produced markup, and every decision is asserted through a pure function.

// ---------------------------------------------------------------------------
// Layer Frontend/UX — palette search and the connect affordance are reachable
// ---------------------------------------------------------------------------
describe('Automate palette search (Frontend/UX)', () => {
  it('renders a labelled search field and filters blocks by localized name', () => {
    localeState.current = 'de-DE';
    const copy = automateCopy('de-DE');
    const markup = renderToStaticMarkup(<AutomatePalette onUpdateModel={vi.fn()} />);

    // Exactly one search field, visibly labelled, wired to a real input.
    expect(markup).toContain('data-automate-palette-search="true"');
    expect(markup.match(/data-automate-palette-search="true"/g)).toHaveLength(1);
    expect(markup).toContain(`placeholder="${copy.paletteSearch}"`);
    expect(markup).toContain(`aria-label="${copy.paletteSearch}"`);
    expect(markup).toContain('type="search"');

    // Unfiltered, every localized block is offered.
    expect(markup).toContain(copy.templateTitle('Scheduled Trigger'));
    expect(markup).toContain(copy.templateTitle('Human Approval'));
  });

  it('shows an honest empty state instead of an empty list (pure filter)', () => {
    const blocks: AutomateBlockTemplate[] = [{ type: 'trigger', title: 'Scheduled Trigger', category: 'Trigger', config: {} }];
    expect(filterAutomateBlocks(blocks, 'zzzz-no-such-block')).toEqual([]);
    const copy = automateCopy('de-DE');
    expect(copy.noPaletteMatches.length).toBeGreaterThan(0);
  });

  it('finds localized German and Japanese blocks through a folded search', () => {
    const de = automateCopy('de-DE');
    const ja = automateCopy('ja-JP');
    const blocks: AutomateBlockTemplate[] = [
      { type: 'trigger', title: 'Scheduled Trigger', category: 'Trigger', config: {} },
      { type: 'approval', title: 'Human Approval', category: 'Control', config: {} },
    ];
    const deLabels = (b: AutomateBlockTemplate) => ({ title: de.templateTitle(b.title), category: de.templateCategory(b.category) });
    const jaLabels = (b: AutomateBlockTemplate) => ({ title: ja.templateTitle(b.title), category: ja.templateCategory(b.category) });

    expect(filterAutomateBlocks(blocks, 'zeitplan', deLabels).map((b) => b.title)).toEqual(['Scheduled Trigger']);
    // 'ö' must fold to 'o', otherwise a user typing 'ausloser' silently gets nothing.
    expect(filterAutomateBlocks(blocks, 'ausloser', deLabels).map((b) => b.title)).toEqual(['Scheduled Trigger']);
    expect(filterAutomateBlocks(blocks, '承認', jaLabels).map((b) => b.title)).toEqual(['Human Approval']);
    expect(filterAutomateBlocks(blocks, 'ZWEI WOERTER', deLabels)).toEqual([]);
    expect(filterAutomateBlocks(blocks, '', deLabels)).toHaveLength(2);
    expect(normalizeAutomateSearch('Auslöser')).toBe('ausloser');
  });

  it('refuses an over-long query instead of truncating it silently', () => {
    expect(() => tokenizePaletteQuery('a'.repeat(129))).toThrow(AutomateEditingError);
    expect(() => tokenizePaletteQuery('a'.repeat(129))).toThrow('palette-query-boundary');
  });

  it('renders and wires the connect control and the armed hint', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const idle = renderToStaticMarkup(<AutomateCanvas model={model()} onUpdateModel={vi.fn()} />);
    expect(idle).toContain('data-automate-connect-control="idle"');
    expect(idle).toContain(copy.connectNodes);
    expect(idle).toContain(copy.connectHint);

    const armed = renderToStaticMarkup(
      <AutomateCanvas model={model()} onUpdateModel={vi.fn()} connectingFromNodeId="node-trigger" onCancelConnect={vi.fn()} />,
    );
    expect(armed).toContain('data-automate-connect-control="armed"');
    expect(armed).toContain(copy.connectCancel);
    expect(armed).toContain('data-automate-connect-source="true"');
    // The armed state must not depend on colour alone.
    expect(armed).toContain(copy.connectCancel);
    expect(armed).not.toBe(idle);
  });
});

// ---------------------------------------------------------------------------
// Layer Backend/Domain — two calls in ONE instance, accumulated
// ---------------------------------------------------------------------------
describe('Automate node admission — two adds in one session (Backend/Domain)', () => {
  it('mints two distinct nodes and keeps the flow valid after the second add', () => {
    const first = model();
    const nodeA = buildNodeFromTemplate(first, { type: 'action', title: 'A', category: 'Action', config: {} }, 'seed-1');
    const afterFirst: AutomateDocumentModel = { ...first, nodes: [...first.nodes, nodeA] };
    // The second call sees the FIRST call's output, exactly as two rapid clicks would.
    const nodeB = buildNodeFromTemplate(afterFirst, { type: 'action', title: 'B', category: 'Action', config: {} }, 'seed-1');
    const afterSecond: AutomateDocumentModel = { ...afterFirst, nodes: [...afterFirst.nodes, nodeB] };

    expect(nodeA.id).not.toBe(nodeB.id);
    expect(afterSecond.nodes).toHaveLength(first.nodes.length + 2);
    expect(validateFlowModel(afterSecond)).toEqual([]);
    // Both nodes are separately addressable — a duplicate id would collapse them.
    expect(new Set(afterSecond.nodes.map((n) => n.id)).size).toBe(afterSecond.nodes.length);
  });

  it('uses the same seed deterministically and never reuses a taken id', () => {
    const m = model();
    const a = nextNodeId(m, 'x');
    const b = nextNodeId({ nodes: [...m.nodes, { ...m.nodes[0], id: a }] }, 'x');
    expect(a).toBe('node-x');
    expect(b).toBe('node-x-2');
    expect(nextNodeId(m, 'x')).toBe(a);
  });

  it('turns a colliding seed into a distinct id instead of a duplicate node', () => {
    // This is the reproduction of the removed defect: the previous palette called
    // buildNodeFromTemplate with an identical seed for both adds, which produced two nodes sharing an
    // id — `validateFlowModel` then reported node-id-invalid-or-duplicate and the whole flow was blocked.
    const first = model();
    const a = buildNodeFromTemplate(first, { type: 'action', title: 'A', category: 'Action', config: {} }, 'same');
    const second = { ...first, nodes: [...first.nodes, a] };
    const b = buildNodeFromTemplate(second, { type: 'action', title: 'B', category: 'Action', config: {} }, 'same');

    expect(a.id).toBe('node-same');
    expect(b.id).toBe('node-same-2');
    const accumulated = { ...second, nodes: [...second.nodes, b] };
    expect(validateFlowModel(accumulated).filter((i) => i.code === 'node-id-invalid-or-duplicate')).toEqual([]);
  });

  it('refuses at the node bound instead of appending an invalid node', () => {
    const full = model();
    full.nodes = Array.from({ length: MAX_FLOW_NODES }, (_, i) => ({ ...full.nodes[0], id: `node-${i}` }));
    expect(() => buildNodeFromTemplate(full, { type: 'action', title: 'X', category: 'Action', config: {} }, 's')).toThrow('node-count-boundary');
  });

  it('gives triggers no input port and finally-nodes no output port', () => {
    const m = model();
    expect(buildNodeFromTemplate(m, { type: 'trigger', title: 'T', category: 'Trigger', config: {} }, 1).inputs).toEqual([]);
    expect(buildNodeFromTemplate(m, { type: 'finally', title: 'F', category: 'Reliability', config: {} }, 2).outputs).toEqual([]);
  });
});

describe('Automate connection creation — two edges in one session (Backend/Domain)', () => {
  it('accumulates two distinct typed edges, each with its own id', () => {
    const start = model();
    // Port ids must exist on the nodes: trigger exposes `event` out, `finally` has no ports at all.
    const one = addAutomateConnection(start, { fromNodeId: 'node-condition', toNodeId: 'node-finally', fromPortId: 'true', seed: 'e1' });
    const two = addAutomateConnection(one, { fromNodeId: 'node-trigger', toNodeId: 'node-finally', fromPortId: 'event', seed: 'e2' });
    expect(one.connections).toHaveLength(start.connections.length + 1);
    expect(two.connections).toHaveLength(start.connections.length + 2);
    expect(new Set(two.connections.map((c) => c.id)).size).toBe(two.connections.length);
    expect(validateFlowModel(two)).toEqual([]);
    expect(start.connections).toHaveLength(3); // the input document is never mutated
  });

  it('creates the two edges the visible surface actually produces (no invented port ids)', () => {
    // The canvas supplies no port ids. A trigger's only output is `event` and `finally` has no ports at
    // all, so passing 'output'/'input' here refused a legal edge — the surface must not invent ports.
    const start = model();
    const first = addAutomateConnection(start, { fromNodeId: 'node-trigger', toNodeId: 'node-finally', seed: 'ui-1' });
    const second = addAutomateConnection(first, { fromNodeId: 'node-condition', toNodeId: 'node-finally', seed: 'ui-2' });
    expect(second.connections).toHaveLength(5);
    expect(second.connections.at(-1)?.fromPortId).toBeUndefined();
    expect(validateFlowModel(second)).toEqual([]);
  });

  it('refuses a self-loop, so a rule that could re-enter itself is rejected not spun', () => {
    const m = model();
    expect(() => createAutomateConnection(m, { fromNodeId: 'node-action', toNodeId: 'node-action', seed: 's' }))
      .toThrow('edge-self-loop-rejected');
  });

  it('refuses an edge that would close a cycle', () => {
    const m = model();
    // node-finally -> node-trigger closes trigger -> condition -> action -> finally -> trigger.
    expect(() => createAutomateConnection(m, { fromNodeId: 'node-finally', toNodeId: 'node-trigger', seed: 's' }))
      .toThrow('graph-cycle-rejected');
  });

  it('refuses duplicate, missing-node and unknown-port edges with named codes', () => {
    const m = model();
    expect(() => createAutomateConnection(m, { fromNodeId: 'node-trigger', toNodeId: 'node-condition', fromPortId: 'event', toPortId: 'event', seed: 's' }))
      .toThrow('edge-duplicate-rejected');
    expect(() => createAutomateConnection(m, { fromNodeId: 'node-trigger', toNodeId: 'node-nope', seed: 's' }))
      .toThrow('edge-node-missing');
    expect(() => createAutomateConnection(m, { fromNodeId: 'node-trigger', toNodeId: 'node-finally', fromPortId: 'nope', seed: 's' }))
      .toThrow('edge-output-port-missing');
    expect(() => createAutomateConnection(m, { fromNodeId: 'node-trigger', toNodeId: 'node-finally', toPortId: 'nope', seed: 's' }))
      .toThrow('edge-input-port-missing');
  });
});

// ---------------------------------------------------------------------------
// Layer Fehler/Sicherheit/A11y — capability truth and fail-closed import
// ---------------------------------------------------------------------------
describe('Automate capability and import truth (Fehler/Sicherheit/A11y)', () => {
  it('derives the capability of each action from the single action contract', () => {
    const m = model();
    expect(deriveFlowCapabilities(m)).toEqual(['workspace.task.create.write']);
    expect(undeclaredFlowCapabilities(m)).toEqual([]); // declared as workspace.task.write

    m.requiredCapabilities = [];
    expect(undeclaredFlowCapabilities(m)).toEqual(['workspace.task.create.write']);
  });

  it('closes the trial gate when a capability is undeclared', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const undeclared = model();
    undeclared.requiredCapabilities = [];
    const markup = renderToStaticMarkup(<AutomateView document={doc(undeclared)} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain(copy.capabilityFindings(1));
    // The visible graph-issue count includes the capability gap, and the gate is closed.
    expect(markup).toContain(copy.graphIssues(0));
    expect(markup).toMatch(/<button disabled=""[^>]*data-automate-trial-state="idle"/);
  });

  it('keeps the trial gate open for the shipped default flow', () => {
    localeState.current = 'en-US';
    const markup = renderToStaticMarkup(<AutomateView document={doc(model())} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain('data-automate-trial-state="idle"');
    expect(markup).not.toMatch(/<button disabled=""[^>]*data-automate-trial-state/);
  });

  it('refuses to load a flow with an unsupported schema, naming it', () => {
    const legacy = { ...model(), schemaVersion: 1 } as unknown as AutomateDocumentModel;
    const verdict = inspectFlowForLoad(legacy);
    expect(verdict.loadable).toBe(false);
    expect(verdict.unsupportedSchema).toBe(true);
  });

  it('refuses to load a cyclic or capability-gapped flow', () => {
    const cyclic = model();
    cyclic.connections = [...cyclic.connections, { id: 'conn-back', fromNodeId: 'node-finally', toNodeId: 'node-trigger' }];
    expect(inspectFlowForLoad(cyclic).loadable).toBe(false);
    expect(inspectFlowForLoad(cyclic).issues).toContain('graph-cycle-rejected');

    const gapped = model();
    gapped.requiredCapabilities = [];
    const verdict = inspectFlowForLoad(gapped);
    expect(verdict.loadable).toBe(false);
    expect(verdict.issues).toContain('capability-undeclared:workspace.task.create.write');
  });

  it('accepts the shipped default flow as loadable', () => {
    const shipped = model();
    expect(inspectFlowForLoad(shipped)).toEqual({ loadable: true, issues: [], unsupportedSchema: false });
    // The stronger property this test exists for: the SHIPPED configuration must satisfy the rules the
    // app publishes. Every node must carry every field its own type declares — no absent field, no
    // missing fallback. Otherwise the default would be refused by its own contract.
    const perNode = shipped.nodes.map((node) => ({ id: node.id, report: validateNodeConfig(node) }));
    expect(perNode.filter((row) => !row.report.complete)).toEqual([]);
    for (const node of shipped.nodes) {
      for (const field of fieldsForNode(node)) {
        expect(hasConfigPath(node.config as Record<string, never>, field)).toBe(true);
      }
    }
    // No node may carry a config flag that asserts a Vorgang the app does not perform. Measured: the
    // `finally` node used to carry `safeAudit: true` while nothing in this app records an audit.
    for (const node of shipped.nodes) {
      expect(Object.keys(node.config)).not.toContain('safeAudit');
    }
    expect(shipped.nodes.find((node) => node.id === 'node-finally')?.title).toBe('Flow end');
  });

  it('refuses an impossible schedule instead of admitting it and then reporting it as checked', () => {
    const bad = model();
    bad.nodes = bad.nodes.map((node) => (node.id === 'node-trigger'
      ? { ...node, config: { triggerKind: 'schedule', timezone: 'Not/AZone', every: { unit: 'minute', interval: 15 } } }
      : node));
    const codes = validateFlowTriggerConfigs(bad);
    expect(codes).toEqual(['schedule-timezone-invalid:node-trigger']);
    expect(inspectFlowForLoad(bad).loadable).toBe(false);
  });

  it('refuses a schedule interval outside the contract boundary, naming the limit', () => {
    const bad = model();
    bad.nodes = bad.nodes.map((node) => (node.id === 'node-trigger'
      ? { ...node, config: { triggerKind: 'schedule', timezone: 'UTC', every: { unit: 'minute', interval: 0 }, startAt: 0 } }
      : node));
    expect(validateFlowTriggerConfigs(bad)).toEqual(['schedule-interval-boundary:node-trigger']);
  });

  it('refuses a trigger with no recognizable kind', () => {
    const bad = model();
    bad.nodes = bad.nodes.map((node) => (node.id === 'node-trigger' ? { ...node, config: {} } : node));
    expect(validateFlowTriggerConfigs(bad)).toEqual(['trigger-config-missing:node-trigger']);
  });

  it('accepts the trigger config the palette actually offers', () => {
    // The palette's own template must pass the contract, otherwise a user could add a block that is
    // instantly invalid — "accepted, then reported as checked". (The literal is pinned in the `.mjs`
    // companion; here the same config is driven through the validator.)
    const m = model();
    m.nodes = m.nodes.map((node) => (node.id === 'node-trigger'
      ? { ...node, config: { triggerKind: 'schedule', timezone: 'UTC', every: { unit: 'minute', interval: 15 }, startAt: 0, missedRun: 'skip', concurrency: 1 } }
      : node));
    expect(validateFlowTriggerConfigs(m)).toEqual([]);
  });

  it('adds the trigger term to the visible gate', () => {
    localeState.current = 'en-US';
    const bad = model();
    bad.nodes = bad.nodes.map((node) => (node.id === 'node-trigger' ? { ...node, config: {} } : node));
    const markup = renderToStaticMarkup(<AutomateView document={doc(bad)} onUpdateDocument={vi.fn()} />);
    expect(markup).toMatch(/<button disabled=""[^>]*data-automate-trial-state="idle"/);
  });
});

// ---------------------------------------------------------------------------
// Layer WOM/Persistenz + Fehler/Sicherheit/A11y — the run log never shows a secret
// ---------------------------------------------------------------------------
describe('Automate run log redaction (Fehler/Sicherheit/A11y)', () => {
  const secretRun = (payload: Record<string, unknown>) => {
    const m = model();
    m.runs = [{
      id: 'run-secret', flowVersion: 1, startedAt: 0, endedAt: 1, status: 'failed', durationMs: 1,
      triggerKind: 'manual', simulated: false,
      steps: [{
        nodeId: 'node-action', nodeTitle: 'Create incident task', status: 'failed',
        startedAt: 0, endedAt: 1, durationMs: 1, safeMessage: 'ok',
        redactedInput: payload as never,
      }],
    }];
    return m;
  };

  it('redacts a secret that a producer failed to strip', () => {
    const m = secretRun({ endpoint: 'https://x', authorization: 'Bearer SUPER-SECRET-VALUE', token: 'ALSO-SECRET' });
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={m} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-step-payload="redacted"');
    expect(markup).not.toContain('SUPER-SECRET-VALUE');
    expect(markup).not.toContain('ALSO-SECRET');
    expect(markup).toContain('[REDACTED]');
    // The non-secret field survives, so the log is not blanked wholesale.
    expect(markup).toContain('https://x');
  });

  it('proves the redaction is load-bearing, not vacuously true', () => {
    const policy = AUTOMATE_RUN_LOG_POLICY;
    expect(containsRedactableContent({ password: 'p' }, policy)).toBe(true);
    expect(containsRedactableContent({ nested: { credential: 'c' } }, policy)).toBe(true);
    expect(containsRedactableContent({ safe: 'value' }, policy)).toBe(false);
    expect(redactRunStepPayload({ password: 'p' }, policy)).toEqual({ password: '[REDACTED]' });
  });

  it('bounds a deeply nested payload instead of walking it unbounded', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 40; i += 1) deep = { [`l${i}`]: deep };
    const redacted = redactRunStepPayload(deep as never);
    expect(JSON.stringify(redacted)).toContain('[REDACTED:DEPTH]');
  });

  it('shows named load refusals in the drawer instead of failing silently', () => {
    localeState.current = 'en-US';
    const bad = model();
    bad.nodes = bad.nodes.map((node) => (node.id === 'node-trigger' ? { ...node, config: {} } : node));
    const markup = renderToStaticMarkup(<AutomateView document={doc(bad)} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain('data-automate-load-issues="1"');
    expect(markup).toContain('data-automate-load-issue="trigger-config-missing:node-trigger"');
  });

  it('agrees exactly with the load decision it renders', () => {
    const bad = model();
    bad.requiredCapabilities = [];
    const issues = flowRefusalIssues(bad);
    expect(inspectFlowForLoad(bad).issues).toEqual(issues);
    expect(issues).toContain('capability-undeclared:workspace.task.create.write');
  });
});

// ---------------------------------------------------------------------------
// Layer Backend/Domain + Fehler/Sicherheit — the run plan (first caller of the permission core)
// ---------------------------------------------------------------------------
describe('Automate run plan and permissions (Backend/Domain + Fehler/Sicherheit/A11y)', () => {
  it('permits the shipped default flow and reports what it needs', () => {
    const plan = planAutomateRun(model());
    expect(plan.permitted).toBe(true);
    expect(plan.refusals).toEqual([]);
    // The public plan reports the action layer's capability name; the manifest inside it uses the
    // permission contract's `cap:` namespace. Both are asserted so the bridge cannot silently regress.
    expect(plan.requiredCapabilities).toEqual(['workspace.task.create.write']);
    expect(plan.manifest.permissions.map((p) => p.capability)).toEqual(['cap:workspace.task.create.write']);
    expect(plan.manifest.permissions[0].access).toBe('write');
    expect(plan.manifest.flowId).toBe('flow-security-response');
    // The plan never claims an execution happened.
    expect(plan.executes).toBe(false);
    // The walk order is the topological order, not raw node order.
    expect(plan.order).toEqual(buildRunPreview(model()));
  });

  it('bridges the two capability namespaces idempotently', () => {
    expect(toManifestCapabilityId('workspace.task.create.write')).toBe('cap:workspace.task.create.write');
    expect(toManifestCapabilityId('cap:workspace.task.create.write')).toBe('cap:workspace.task.create.write');
  });

  it('refuses a flow whose action needs an undeclared capability', () => {
    const gapped = model();
    gapped.requiredCapabilities = [];
    const plan = planAutomateRun(gapped);
    expect(plan.permitted).toBe(false);
    expect(plan.refusals).toContain('plan-capability-undeclared');
    // A refused plan has no order to walk.
    expect(plan.order).toEqual([]);
  });

  it('refuses an over-privileged manifest: a declared capability with no matching action', () => {
    const over = model();
    over.requiredCapabilities = ['workspace.task.create.write', 'workspace.vault.move.write'];
    const plan = planAutomateRun(over);
    expect(plan.permitted).toBe(false);
    expect(plan.refusals).toContain('plan-overprivileged-manifest');
  });

  it('fails closed on a policy denial and names the denied capability', () => {
    const denying = { ...PERMISSIVE_AUTOMATION_POLICY, deniedCapabilities: new Set(['workspace.task.create.write']) };
    const plan = planAutomateRun(model(), denying);
    expect(plan.permitted).toBe(false);
    expect(plan.refusals).toContain('plan-policy-denied');
    expect(plan.deniedCapabilities).toEqual(['workspace.task.create.write']);
    expect(plan.order).toEqual([]);
  });

  it('refuses a flow with no trigger, an invalid graph, or an invalid trigger config', () => {
    // A flow with no trigger is already an invalid graph, so `plan-graph-invalid` is the honest code —
    // there is no separate no-trigger branch to double-report the same defect.
    const noTrigger = model();
    noTrigger.nodes = noTrigger.nodes.filter((node) => node.type !== 'trigger');
    noTrigger.connections = [];
    expect(planAutomateRun(noTrigger).refusals).toContain('plan-graph-invalid');

    const cyclic = model();
    cyclic.connections = [...cyclic.connections, { id: 'conn-back', fromNodeId: 'node-finally', toNodeId: 'node-trigger' }];
    expect(planAutomateRun(cyclic).refusals).toContain('plan-graph-invalid');

    const badTrigger = model();
    badTrigger.nodes = badTrigger.nodes.map((n) => (n.id === 'node-trigger' ? { ...n, config: {} } : n));
    expect(planAutomateRun(badTrigger).refusals).toContain('plan-trigger-config-invalid');
  });

  it('never returns a bare permitted constant: an empty flow is refused', () => {
    const empty = model();
    empty.nodes = [];
    empty.connections = [];
    const plan = planAutomateRun(empty);
    expect(plan.permitted).toBe(false);
    expect(plan.refusals.length).toBeGreaterThan(0);
  });

  it('is deterministic and does not mutate the document it inspects', () => {
    const before = JSON.stringify(model());
    const first = planAutomateRun(model());
    const second = planAutomateRun(model());
    expect(first).toEqual(second);
    expect(JSON.stringify(model())).toBe(before);
  });

  it('renders the permitted plan in the run drawer, in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = automateCopy(locale);
      const markup = renderToStaticMarkup(<AutomateRunDrawer model={model()} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
      expect(markup).toContain('data-automate-run-plan="permitted"');
      expect(markup).toContain(copy.runPlanPermitted);
      expect(markup).toContain(copy.runPlanExecutesNothing);
      expect(markup).toContain('data-automate-run-capability="workspace.task.create.write"');
    }
  });

  it('renders each refusal as localized text, never a raw code', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const gapped = model();
    gapped.requiredCapabilities = [];
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={gapped} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-run-plan="refused"');
    expect(markup).toContain('data-automate-run-refusal="plan-capability-undeclared"');
    expect(markup).toContain(copy.planCapabilityUndeclared);
    // The raw engine code must not be what the user reads.
    expect(markup).not.toContain('>plan-capability-undeclared<');
  });
});

// ---------------------------------------------------------------------------
// Layer Backend/Domain + Frontend/UX — typed node inspector (packages 4, 5, 7, 10)
// ---------------------------------------------------------------------------
describe('Automate typed node inspector (Frontend/UX + Backend/Domain)', () => {
  const scheduleFields = () => fieldsForNode({ type: 'trigger', config: { triggerKind: 'schedule' } });

  it('offers typed fields per node type, following the node discriminator', () => {
    const schedule = scheduleFields().map((f) => f.key);
    expect(schedule).toContain('cfgEveryInterval');
    expect(schedule).toContain('cfgTimezone');
    expect(schedule).toContain('cfgConcurrency');

    // A manual trigger must NOT show schedule fields — the form follows the value.
    const manual = fieldsForNode({ type: 'trigger', config: { triggerKind: 'manual' } }).map((f) => f.key);
    expect(manual).not.toContain('cfgEveryInterval');

    const httpAction = fieldsForNode({ type: 'action', config: { actionKind: 'http' } }).map((f) => f.key);
    expect(httpAction).toContain('cfgMethod');
    expect(httpAction).not.toContain('cfgTargetRef');

    // The loop bound and the concurrency bound are editable, not frozen at the template constant.
    expect(fieldsForNode({ type: 'loop', config: {} }).map((f) => f.key)).toContain('cfgMaxIterations');
    expect(fieldsForNode({ type: 'parallel', config: {} }).map((f) => f.key)).toContain('cfgMaxConcurrency');
    expect(fieldsForNode({ type: 'approval', config: {} }).map((f) => f.key)).toContain('cfgPrompt');
  });

  it('writes two typed edits into ONE accumulated config, immutably', () => {
    const start = model();
    const interval = scheduleFields().find((f) => f.key === 'cfgEveryInterval')!;
    const concurrency = scheduleFields().find((f) => f.key === 'cfgConcurrency')!;

    const afterFirst = updateNodeField(start, 'node-trigger', interval, 30);
    const afterSecond = updateNodeField(afterFirst, 'node-trigger', concurrency, 3);

    const config = afterSecond.nodes.find((n) => n.id === 'node-trigger')!.config as unknown as { every: { interval: number }; concurrency: number };
    expect(config.every.interval).toBe(30); // the first edit survives the second
    expect(config.concurrency).toBe(3);
    expect(validateFlowModel(afterSecond)).toEqual([]);
    // The input document is untouched: the update is a value, not a mutation.
    const original = start.nodes.find((n) => n.id === 'node-trigger')!.config as unknown as { every?: unknown };
    expect(original.every).toBeUndefined();
  });

  it('refuses a wrong-typed value instead of coercing it into the document', () => {
    const interval = scheduleFields().find((f) => f.key === 'cfgEveryInterval')!;
    const waitForAll = fieldsForNode({ type: 'parallel', config: {} }).find((f) => f.key === 'cfgWaitForAll')!;

    expect(() => writeFieldValue({}, interval, 'abc')).toThrow('config-number-required');
    expect(() => writeFieldValue({}, interval, 1.5)).toThrow('config-integer-required');
    expect(() => writeFieldValue({}, waitForAll, 'true')).toThrow('config-boolean-required');
    expect(() => writeFieldValue({}, interval, 0)).not.toThrow(); // typing is the writer's job, bounds the validator's
    expect(() => updateNodeField(model(), 'node-nope', interval, 5)).toThrow('node-not-found');
  });

  it('refuses an out-of-bounds value and names the field and the bound it broke', () => {
    expect(validateNodeConfigValues({ type: 'parallel', config: { maxConcurrency: 99, waitForAll: true } }))
      .toEqual([{ fieldKey: 'cfgMaxConcurrency', code: 'config-above-maximum' }]);
    expect(validateNodeConfigValues({ type: 'loop', config: { items: 'x', maxIterations: 0 } }))
      .toEqual([{ fieldKey: 'cfgMaxIterations', code: 'config-below-minimum' }]);
    expect(validateNodeConfigValues({ type: 'loop', config: { items: '', maxIterations: 5 } }))
      .toEqual([{ fieldKey: 'cfgItems', code: 'config-text-empty' }]);
  });

  it('separates an INCOMPLETE config from an ILLEGAL one', () => {
    const incomplete = validateNodeConfig({ type: 'loop', config: { maxIterations: 10 } });
    expect(incomplete.complete).toBe(false);
    // Asserted against the schema itself, not a hand-written list: adding a loop field must not leave
    // this test silently behind (it did exactly that when package 10 added three).
    const declared = fieldsForNode({ type: 'loop', config: { maxIterations: 10 } }).map((f) => f.key);
    expect([...incomplete.missing].sort()).toEqual(declared.filter((k) => k !== 'cfgMaxIterations').sort());
    // An absent field is not a contract violation — it has a declared fallback.
    expect(incomplete.issues).toEqual([]);

    expect(validateNodeConfig({ type: 'loop', config: { items: 'x', maxIterations: 10_001 } }).issues).toHaveLength(1);
  });

  it('fills a node from its declared fallbacks so a template cannot ship an incomplete node', () => {
    const completed = withConfigDefaults({ id: 'n1', type: 'trigger', title: 'T', category: 'Trigger', x: 0, y: 0, inputs: [], outputs: [], config: { triggerKind: 'schedule' } });
    const config = completed.config as unknown as { every: { unit: string; interval: number }; timezone: string; concurrency: number };
    expect(config.every.unit).toBe('minute');
    expect(config.every.interval).toBe(15);
    expect(config.timezone).toBe('UTC');
    expect(config.concurrency).toBe(1);
    expect(validateNodeConfig(completed).complete).toBe(true);
  });

  it('keeps the whole palette template set complete under its own contract', () => {
    // "The default configuration must satisfy the rules the app publishes", applied to every block.
    const draft = model();
    const nodes = AUTOMATE_BLOCK_TEMPLATES.map((template, index) => buildNodeFromTemplate(draft, template, `tpl-${index}`));
    expect(nodes.length).toBe(AUTOMATE_BLOCK_TEMPLATES.length);
    const incomplete = nodes
      .map((node) => ({ title: node.title, report: validateNodeConfig(node) }))
      .filter((row) => !row.report.complete);
    expect(incomplete).toEqual([]);
  });

  it('renders an empty inspector with no node selected', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const markup = renderToStaticMarkup(<AutomateNodeInspector model={model()} onUpdateModel={vi.fn()} />);
    expect(markup).toContain('data-automate-inspector-empty="true"');
    expect(markup).toContain(copy.inspectorEmpty);
  });

  it('renders typed, labelled, bounded controls for the selected node', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const selected = model();
    selected.selectedNodeId = 'node-action';
    const markup = renderToStaticMarkup(<AutomateNodeInspector model={selected} onUpdateModel={vi.fn()} />);

    expect(markup).toContain('data-automate-inspector-node="node-action"');
    expect(markup).toContain('data-automate-field="cfgActionKind"');
    expect(markup).toContain('data-automate-field="cfgOperation"');
    expect(markup).toContain('data-automate-field="cfgTargetRef"');
    expect(markup).toContain('automate-inspector-label');
    expect(markup).toContain(copy.nodeTitleLabel);
    // The option text is localized copy, not the raw engine value.
    expect(markup).toContain(copy.opTaskCreate);
    expect(markup).toContain('data-automate-inspector-state="complete"');
  });

  it('gives a number field its declared bounds so the browser cannot silently accept a bad value', () => {
    localeState.current = 'en-US';
    const selected = model();
    // The default trigger is a workspace-event trigger, which correctly has no number field; switching
    // the kind to `schedule` is exactly the discriminator-following this test is about.
    selected.nodes = selected.nodes.map((node) => (node.id === 'node-trigger'
      ? { ...node, config: { triggerKind: 'schedule', timezone: 'UTC', every: { unit: 'minute', interval: 15 }, startAt: 0, missedRun: 'skip', concurrency: 1 } }
      : node));
    selected.selectedNodeId = 'node-trigger';
    const markup = renderToStaticMarkup(<AutomateNodeInspector model={selected} onUpdateModel={vi.fn()} />);
    expect(markup).toContain('data-automate-field="cfgEveryInterval"');
    expect(markup).toMatch(/type="number"/);
    expect(markup).toContain('max="10080"'); // schedule interval upper bound, from the schema
    expect(markup).toContain('max="32"');     // concurrency upper bound
  });

  it('marks the node state as incomplete when a declared field is absent', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const partial = model();
    partial.selectedNodeId = 'node-condition';
    partial.nodes = partial.nodes.map((node) => (node.id === 'node-condition' ? { ...node, config: { conditionKind: 'equals' } } : node));
    const markup = renderToStaticMarkup(<AutomateNodeInspector model={partial} onUpdateModel={vi.fn()} />);
    expect(markup).toContain('data-automate-inspector-state="incomplete"');
    expect(markup).toContain(copy.configIssues(2)); // cfgLeft + cfgRight
  });

  it('shows the inspector inside the real workspace surface', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const markup = renderToStaticMarkup(<AutomateView document={doc(model())} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain(`aria-label="${copy.inspector}"`);
    expect(markup).toContain('data-automate-inspector-empty="true"');
  });
});

// ---------------------------------------------------------------------------
// Layer Backend/Domain + WOM/Persistenz — the Fabric event inbox (first caller of workspaceIntegration)
// ---------------------------------------------------------------------------
describe('Automate Fabric event inbox (Backend/Domain + WOM/Persistenz)', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    eventId: 'evt-0001',
    eventType: 'document.saved',
    objectRef: 'vgt://workspace/documents/current',
    objectVersion: 1,
    occurredAt: 1_000,
    payload: { source: 'grid' } as never,
    ...over,
  });

  it('records TWO events into ONE accumulated log, in order', () => {
    const start = model();
    const first = recordFabricEvent(start, event({ eventId: 'evt-0001' }));
    const second = recordFabricEvent(first, event({ eventId: 'evt-0002', eventType: 'task.changed' }));

    expect(flowFabricEvents(start)).toEqual([]);
    expect(flowFabricEvents(second).map((e) => e.eventId)).toEqual(['evt-0001', 'evt-0002']);
    expect(flowFabricEvents(second).map((e) => e.eventType)).toEqual(['document.saved', 'task.changed']);
    // The envelope carries the validated schema version, produced by the integration contract.
    expect(flowFabricEvents(second)[0].schemaVersion).toBe('vgt.fabric.event/1');
  });

  it('reads an absent log as empty, so an older document is not an error', () => {
    const legacy = model();
    delete legacy.fabricEvents;
    expect(flowFabricEvents(legacy)).toEqual([]);
    expect(recordFabricEvent(legacy, event()).fabricEvents).toHaveLength(1);
  });

  it('refuses a malformed envelope through the Fabric contract, storing nothing', () => {
    const start = model();
    // objectRef is not a vgt:// reference -> the integration contract's own validation.
    expect(() => recordFabricEvent(start, event({ objectRef: 'not-a-ref' }))).toThrow('fabric-event-invalid');
    expect(() => recordFabricEvent(start, event({ objectVersion: 0 }))).toThrow('fabric-event-invalid');
    expect(() => recordFabricEvent(start, event({ eventId: 'x' }))).toThrow('fabric-event-invalid');
    expect(start.fabricEvents).toBeUndefined();
  });

  it('refuses an event kind the workspace trigger does not accept', () => {
    expect(() => recordFabricEvent(model(), event({ eventType: 'mail.received' })))
      .toThrow('fabric-event-type-unsupported');
    expect(FABRIC_WORKSPACE_EVENT_TYPES).toEqual(['document.created', 'document.saved', 'task.changed', 'vault.entry']);
  });

  it('refuses a duplicate id and an over-full log, naming each limit', () => {
    const one = recordFabricEvent(model(), event({ eventId: 'evt-dup' }));
    expect(() => recordFabricEvent(one, event({ eventId: 'evt-dup' }))).toThrow('fabric-event-duplicate');

    let full = model();
    for (let i = 0; i < MAX_FABRIC_EVENTS; i += 1) full = recordFabricEvent(full, event({ eventId: `evt-${i}` }));
    expect(flowFabricEvents(full)).toHaveLength(MAX_FABRIC_EVENTS);
    expect(() => recordFabricEvent(full, event({ eventId: 'evt-overflow' }))).toThrow('fabric-event-log-boundary');
  });

  it('refuses an over-large payload instead of truncating it', () => {
    const huge = { blob: 'x'.repeat(MAX_FABRIC_PAYLOAD_TEXT + 1) };
    expect(() => recordFabricEvent(model(), event({ payload: huge }))).toThrow('fabric-payload-boundary');
    const wide = { items: Array.from({ length: 200 }, (_, i) => i) };
    expect(() => recordFabricEvent(model(), event({ payload: wide }))).toThrow('fabric-payload-boundary');
  });

  it('matches an event to this flow trigger, and reports no match honestly', () => {
    const m = model();
    expect(acceptedWorkspaceEvents(m)).toEqual(['document.saved']);
    expect(matchingTriggerNodeIds(m, { eventType: 'document.saved' })).toEqual(['node-trigger']);
    expect(matchingTriggerNodeIds(m, { eventType: 'task.changed' })).toEqual([]);
  });

  it('never claims an event was delivered', () => {
    const m = recordFabricEvent(model(), event());
    for (const recorded of flowFabricEvents(m)) {
      const delivery = describeEventDelivery(m, recorded);
      expect(delivery.recorded).toBe(true);
      expect(delivery.delivered).toBe(false); // no Fabric bus is wired
      expect(delivery.matchedTriggerIds).toEqual(['node-trigger']);
    }
  });

  it('renders the inbox with its honest not-delivered statement, in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = automateCopy(locale);
      const withEvents = recordFabricEvent(model(), event());
      const markup = renderToStaticMarkup(<AutomateRunDrawer model={withEvents} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
      expect(markup).toContain('data-automate-fabric-events="1"');
      expect(markup).toContain('data-automate-fabric-not-delivered="true"');
      expect(markup).toContain(copy.fabricNotDelivered);
      expect(markup).toContain(copy.fabricAccepted);
      expect(markup).toContain('data-automate-fabric-delivered="false"');
      expect(markup).toContain('data-automate-fabric-event="document.saved"');
    }
  });

  it('shows an unmatched event as unmatched rather than as accepted', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const withTask = recordFabricEvent(model(), event({ eventType: 'task.changed' }));
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={withTask} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-fabric-matched="0"');
    expect(markup).toContain(copy.fabricUnmatched);
  });
});

// ---------------------------------------------------------------------------
// Layer Backend/Domain + Frontend/UX — debug step view and timeline (package 19)
// ---------------------------------------------------------------------------
describe('Automate debug step view and timeline (Backend/Domain + Frontend/UX)', () => {
  const step = (over: Record<string, unknown> = {}) => ({
    nodeId: 'node-trigger',
    nodeTitle: 'Workspace security event',
    status: 'simulated' as const,
    startedAt: 1_000,
    endedAt: 1_080,
    durationMs: 80,
    safeMessage: 'Trial: Workspace security event',
    ...over,
  });
  const run = (steps: unknown[]) => ({
    id: 'run-debug', flowVersion: 1, startedAt: 1_000, endedAt: 1_240, status: 'simulated' as const,
    durationMs: 240, triggerKind: 'manual', simulated: true, steps: steps as never,
  });

  it('places steps on the timeline with offsets, durations and shares', () => {
    const timeline = buildAutomateTimeline(run([
      step({ nodeId: 'a', startedAt: 1_000, endedAt: 1_080, durationMs: 80 }),
      step({ nodeId: 'b', startedAt: 1_080, endedAt: 1_240, durationMs: 160 }),
    ]));
    expect(timeline.totalMs).toBe(240);
    expect(timeline.degenerate).toBe(false);
    expect(timeline.steps.map((s) => s.offsetMs)).toEqual([0, 80]);
    expect(timeline.steps.map((s) => s.durationMs)).toEqual([80, 160]);
    // Shares are shares, not raw milliseconds: 80/240 = 33.3%, 160/240 = 66.7%.
    expect(timeline.steps.map((s) => s.percent)).toEqual([33.3, 66.7]);
  });

  it('survives a run whose steps measured nothing, without NaN', () => {
    const timeline = buildAutomateTimeline(run([
      step({ nodeId: 'a', startedAt: 1_000, endedAt: 1_000, durationMs: 0 }),
      step({ nodeId: 'b', startedAt: 1_000, endedAt: 1_000, durationMs: 0 }),
    ]));
    expect(timeline.degenerate).toBe(true);
    expect(timeline.totalMs).toBe(0);
    expect(timeline.steps.map((s) => s.percent)).toEqual([0, 0]);
    for (const s of timeline.steps) expect(Number.isNaN(s.percent)).toBe(false);
  });

  it('refuses to trust a malformed duration instead of rendering NaN or a negative offset', () => {
    const timeline = buildAutomateTimeline(run([
      step({ nodeId: 'a', startedAt: 1_100, durationMs: Number.NaN }),
      step({ nodeId: 'b', startedAt: 1_000, durationMs: -50 }),
      step({ nodeId: 'c', startedAt: 1_240, durationMs: 240 }),
    ]));
    expect(timeline.steps.map((s) => s.durationMs)).toEqual([0, 0, 240]);
    expect(timeline.totalMs).toBe(240);
    // Offsets are relative to the earliest start, never negative.
    expect(timeline.steps.every((s) => s.offsetMs >= 0)).toBe(true);
    expect(timeline.steps[0].offsetMs).toBe(100);
  });

  it('clamps the selected step and returns null for an empty run', () => {
    const r = run([step({ nodeId: 'a' }), step({ nodeId: 'b' })]);
    expect(selectTimelineStep(r, 0)?.nodeId).toBe('a');
    expect(selectTimelineStep(r, 5)?.nodeId).toBe('b');
    expect(selectTimelineStep(r, -3)?.nodeId).toBe('a');
    expect(selectTimelineStep(run([]), 0)).toBeNull();
  });

  it('offers only runs that have steps, newest first, bounded', () => {
    const empty = run([]);
    const withSteps = run([step()]);
    expect(inspectableRuns([empty, withSteps]).map((r) => r.id)).toEqual(['run-debug']);
    expect(inspectableRuns([withSteps], 1)).toHaveLength(1);
    expect(() => inspectableRuns([withSteps], 0)).toThrow('timeline-run-limit-invalid');
    expect(() => inspectableRuns([withSteps], 5_000)).toThrow('timeline-run-limit-invalid');
    expect(inspectableRuns([])).toEqual([]);
  });

  it('renders an honest empty state when there is no run to inspect', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={model()} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-debug-view="empty"');
    expect(markup).toContain('data-automate-debug-empty="true"');
    expect(markup).toContain(copy.debugEmpty);
  });

  it('renders the step view with the numbers as text, in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = automateCopy(locale);
      const withRun = model();
      withRun.runs = [run([
        step({ nodeId: 'node-trigger', durationMs: 80, startedAt: 1_000, endedAt: 1_080,
               redactedInput: { severity: 'CRITICAL' } as never }),
        step({ nodeId: 'node-action', nodeTitle: 'Create incident task', durationMs: 160, startedAt: 1_080, endedAt: 1_240 }),
      ])];
      const markup = renderToStaticMarkup(<AutomateRunDrawer model={withRun} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
      expect(markup).toContain('data-automate-debug-view="ready"');
      expect(markup).toContain(copy.debugView);
      expect(markup).toContain(copy.debugTimeline);
      expect(markup).toContain(copy.debugStepOf(1, 2));
      expect(markup).toContain(copy.debugInput);
      // Offsets, duration and share are rendered as text, so the bar is never the only carrier.
      expect(markup).toContain('+0ms · 80ms · 33.3%');
      expect(markup).toContain('+80ms · 160ms · 66.7%');
      expect(markup).toContain('data-automate-debug-percent="33.3"');
      expect(markup).toContain('data-automate-debug-segment="node-trigger"');
    }
  });

  it('says so when a timeline measured no duration', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const flat = model();
    flat.runs = [run([step({ nodeId: 'a', startedAt: 5, endedAt: 5, durationMs: 0 })])];
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={flat} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-debug-degenerate="true"');
    expect(markup).toContain(copy.debugDegenerate);
  });

  it('routes step input and output through the redactor before display', () => {
    localeState.current = 'en-US';
    const leaking = model();
    leaking.runs = [run([
      step({
        nodeId: 'node-trigger',
        redactedInput: { authorization: 'Bearer MUST-NOT-SHOW' } as never,
        redactedOutput: 'plain-output' as never,
      }),
    ])];
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={leaking} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).not.toContain('MUST-NOT-SHOW');
    expect(markup).toContain('[REDACTED]');
    expect(markup).toContain('data-automate-debug-output="present"');
    expect(markup).toContain('plain-output');
  });

  it('states plainly when a step recorded no payload', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const bare = model();
    bare.runs = [run([step({ nodeId: 'node-trigger' })])];
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={bare} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-debug-no-payload="true"');
    expect(markup).toContain(copy.debugNoPayload);
  });

  it('marks a breakpointed node with text, not with colour alone, on a reachable button', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const withBreakpoint = model();
    withBreakpoint.nodes = withBreakpoint.nodes.map((n) => (n.id === 'node-trigger' ? { ...n, breakpoint: true } : n));
    withBreakpoint.runs = [run([step({ nodeId: 'node-trigger' })])];
    const markup = renderToStaticMarkup(<AutomateRunDrawer model={withBreakpoint} onUpdateModel={vi.fn()} onTriggerSimulation={vi.fn()} />);
    expect(markup).toContain('data-automate-debug-breakpoint="node-trigger"');
    expect(markup).toContain(copy.debugBreakpointSet);
    // Every segment is a real button, so the step view is keyboard reachable.
    expect(markup).toContain('data-automate-debug-segment="node-trigger"');
    expect(markup).toMatch(/<button[^>]*data-automate-debug-segment="node-trigger"/);
  });
});

// ---------------------------------------------------------------------------
// Layer Frontend/UX + Backend/Domain — traversed path and data mapping (packages 9 + 10)
// ---------------------------------------------------------------------------
describe('Automate traversed path (Frontend/UX + Backend/Domain)', () => {
  it('derives the path from a recorded run and says it came from a run', () => {
    const withRun = model();
    withRun.runs = [{
      id: 'r1', flowVersion: 1, startedAt: 0, endedAt: 10, status: 'simulated', durationMs: 10,
      triggerKind: 'manual', simulated: true,
      steps: [
        { nodeId: 'node-trigger', nodeTitle: 'T', status: 'simulated', startedAt: 0, endedAt: 1, durationMs: 1, safeMessage: 'x' },
        { nodeId: 'node-condition', nodeTitle: 'C', status: 'simulated', startedAt: 1, endedAt: 2, durationMs: 1, safeMessage: 'x' },
        { nodeId: 'node-action', nodeTitle: 'A', status: 'simulated', startedAt: 2, endedAt: 3, durationMs: 1, safeMessage: 'x' },
      ],
    }];
    const path = computeTraversedPath(withRun);
    expect(path.nodeIds).toEqual(['node-trigger', 'node-condition', 'node-action']);
    expect(path.basis).toBe('run-steps');
    // The connections between consecutive walked nodes are the taken ones.
    expect([...path.connectionIds].sort()).toEqual(['conn-1', 'conn-2']);
    expect(isConnectionOnPath(path, 'conn-3')).toBe(false); // action -> finally was not walked
  });

  it('falls back to the trial order and labels it as a trial, not an execution', () => {
    const preview = model();
    preview.runs = [];
    preview.designer = { ...preview.designer, previewNodeIds: ['node-trigger', 'node-condition', 'node-action', 'node-finally'] };
    const path = computeTraversedPath(preview);
    expect(path.basis).toBe('trial-order');
    // A trial path is NOT an execution — the flag must say so.
    expect(path.fromExecutedRun).toBe(false);
    expect([...path.connectionIds].sort()).toEqual(['conn-1', 'conn-2', 'conn-3']);
  });

  it('reports no path at all when nothing was checked or executed', () => {
    const untouched = model();
    untouched.runs = [];
    untouched.designer = { ...untouched.designer, previewNodeIds: [] };
    const path = computeTraversedPath(untouched);
    expect(path.nodeIds).toEqual([]);
    expect(path.connectionIds).toEqual([]);
    expect(isNodeOnPath(path, 'node-trigger')).toBe(false);
    expect(pathPosition(path, 'node-trigger')).toBe(-1);
  });

  it('prefers the recorded run over a stale preview', () => {
    const both = model();
    both.designer = { ...both.designer, previewNodeIds: ['node-finally', 'node-trigger'] };
    both.runs = [{
      id: 'r2', flowVersion: 1, startedAt: 0, endedAt: 1, status: 'simulated', durationMs: 1,
      triggerKind: 'manual', simulated: true,
      steps: [{ nodeId: 'node-trigger', nodeTitle: 'T', status: 'simulated', startedAt: 0, endedAt: 1, durationMs: 1, safeMessage: 'x' }],
    }];
    const path = computeTraversedPath(both);
    expect(path.nodeIds).toEqual(['node-trigger']);
    expect(path.basis).toBe('run-steps');
  });

  it('marks the taken edges from the derived path, not from a success status', () => {
    localeState.current = 'en-US';
    const preview = model();
    preview.runs = [];
    preview.designer = { ...preview.designer, previewNodeIds: ['node-trigger', 'node-condition', 'node-action'] };
    const markup = renderToStaticMarkup(<AutomateCanvas model={preview} onUpdateModel={vi.fn()} />);
    // A trial can only produce `simulated`, so a `success`-based rule would have marked nothing.
    expect(markup).toContain('data-automate-edge-taken="true"');
    expect(markup).toContain('data-automate-edge-taken="false"');
    expect(markup.match(/data-automate-edge-taken="true"/g)).toHaveLength(2);
    expect(markup).toContain('data-automate-node-on-path="true"');
    expect(markup).toContain('data-automate-node-path-position="1"');
    // The position is also text, so the path is not carried by colour alone.
    expect(markup).toContain('data-automate-path-badge="1"');
  });

  it('shows no taken edge when no path was walked', () => {
    localeState.current = 'en-US';
    const untouched = model();
    untouched.runs = [];
    untouched.designer = { ...untouched.designer, previewNodeIds: [] };
    const markup = renderToStaticMarkup(<AutomateCanvas model={untouched} onUpdateModel={vi.fn()} />);
    expect(markup).not.toContain('data-automate-edge-taken="true"');
    expect(markup).toContain('data-automate-node-on-path="false"');
  });
});

describe('Automate data mapping editor (Backend/Domain + Fehler/Sicherheit/A11y)', () => {
  const loopFields = () => fieldsForNode({ type: 'loop', config: {} });

  it('offers a loop the result variable, the item variable and a mapping', () => {
    const keys = loopFields().map((f) => f.key);
    expect(keys).toContain('cfgResultVariable');
    expect(keys).toContain('cfgItemVariable');
    expect(keys).toContain('cfgMapping');
    expect(loopFields().find((f) => f.key === 'cfgMapping')?.kind).toBe('mapping');
    // The three new fields must be *produced*, not merely declared: a palette loop node must carry them,
    // otherwise the contract would list fields no created node ever has.
    const created = buildNodeFromTemplate(model(), AUTOMATE_BLOCK_TEMPLATES.find((t) => t.type === 'loop')!, 'loop-1');
    const config = created.config as unknown as Record<string, unknown>;
    for (const key of ['resultVariable', 'itemVariable', 'mapping']) {
      expect(Object.keys(config)).toContain(key);
    }
    expect(validateNodeConfig(created).complete).toBe(true);
  });

  it('round-trips a valid mapping and refuses every malformed shape by name', () => {
    const good = [{ from: 'item.severity', to: 'severity' }];
    expect(parseMapping(serializeMapping(good))).toEqual(good);

    expect(() => parseMapping('not-a-list' as never)).toThrow('config-mapping-not-a-list');
    expect(() => parseMapping([{ from: '', to: 'x' }] as never)).toThrow('config-mapping-from-invalid');
    expect(() => parseMapping([{ from: 'a' }] as never)).toThrow('config-mapping-to-invalid');
    expect(() => parseMapping(['string'] as never)).toThrow('config-mapping-entry-invalid');
    expect(() => parseMapping([{ from: 'a', to: 'b', expression: 5 }] as never)).toThrow('config-mapping-expression-invalid');
    expect(() => parseMapping(Array.from({ length: 65 }, (_, i) => ({ from: `a${i}`, to: `b${i}` })) as never))
      .toThrow('config-mapping-boundary');
  });

  it('writes a mapping into ONE accumulated config, immutably', () => {
    const start = model();
    const mapping = loopFields().find((f) => f.key === 'cfgMapping')!;
    const result = loopFields().find((f) => f.key === 'cfgResultVariable')!;

    const withMapping = updateNodeField(start, 'node-action', mapping, [{ from: 'item.id', to: 'id' }] as never);
    const withBoth = updateNodeField(withMapping, 'node-action', result, 'collected');

    const config = withBoth.nodes.find((n) => n.id === 'node-action')!.config as unknown as {
      mapping: unknown[]; resultVariable: string;
    };
    expect(config.mapping).toEqual([{ from: 'item.id', to: 'id' }]);
    expect(config.resultVariable).toBe('collected');
    // The input document is untouched.
    const original = start.nodes.find((n) => n.id === 'node-action')!.config as unknown as { mapping?: unknown };
    expect(original.mapping).toBeUndefined();
  });

  it('refuses to store an invalid mapping through the writer', () => {
    const mapping = loopFields().find((f) => f.key === 'cfgMapping')!;
    expect(() => writeFieldValue({}, mapping, 'not-a-list' as never)).toThrow('config-mapping-not-a-list');
    expect(() => writeFieldValue({}, mapping, [{ from: '', to: 'x' }] as never)).toThrow('config-mapping-from-invalid');
    // A valid one is accepted and normalised through the parser.
    expect(writeFieldValue({}, mapping, [{ from: 'a', to: 'b' }] as never)).toEqual({ mapping: [{ from: 'a', to: 'b' }] });
  });

  it('renders the mapping editor for a loop node and reports its entries', () => {
    localeState.current = 'en-US';
    const copy = automateCopy('en-US');
    const selected = model();
    selected.selectedNodeId = 'node-action';
    selected.nodes = selected.nodes.map((n) => (n.id === 'node-action'
      ? { ...n, type: 'loop' as const, config: { items: 'event.items', maxIterations: 10, resultVariable: 'out', itemVariable: 'it', mapping: [{ from: 'it.x', to: 'x' }] } }
      : n));
    const markup = renderToStaticMarkup(<AutomateNodeInspector model={selected} onUpdateModel={vi.fn()} />);
    expect(markup).toContain('data-automate-field="cfgMapping"');
    expect(markup).toContain('data-automate-mapping="true"');
    expect(markup).toContain(copy.cfgMapping);
    expect(markup).toContain(copy.cfgResultVariable);
    expect(markup).toContain('data-automate-inspector-state="complete"');
  });
});

// ---------------------------------------------------------------------------
// Layer Frontend/UX — every locale keeps the honest "no execution engine" claim
// ---------------------------------------------------------------------------
describe('Automate locale honesty across all seven locales (Frontend/UX)', () => {
  it.each(WORKSPACE_LOCALES)('claims no execution engine in %s', (locale) => {
    const copy = automateCopy(locale);
    // The old false claim, per locale, in one place: "flows are executed in an isolated sandbox".
    const FALSE_EXECUTION_CLAIMS = [
      /isoliert im Prozess mit strengen Speichergrenzen/,
      /выполняются в изолированной песочнице/,
      /vengono eseguiti in una sandbox/,
      /se ejecutan en una sandbox aislada/,
      /プロセス内分離サンドボックスで実行されます/,
      /在进程内隔离沙箱中运行/,
      /executed in an isolated in-process sandbox/,
    ];
    for (const claim of FALSE_EXECUTION_CLAIMS) expect(copy.sandboxDescription).not.toMatch(claim);
    expect(copy.sandboxDescription.length).toBeGreaterThan(20);
    // The trial wording must exist and must not be the success wording in any locale.
    expect(copy.trialNotice.length).toBeGreaterThan(0);
    expect(copy.execution('simulated')).not.toBe(copy.execution('success'));
  });

  it('carries the new search/connect keys in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = automateCopy(locale);
      expect(copy.paletteSearch.length).toBeGreaterThan(0);
      expect(copy.noPaletteMatches.length).toBeGreaterThan(0);
      expect(copy.connectNodes.length).toBeGreaterThan(0);
      expect(copy.connectCancel.length).toBeGreaterThan(0);
      expect(copy.capabilityFindings(1).length).toBeGreaterThan(0);
      expect(copy.capabilityFindings(1)).not.toBe(copy.capabilityFindings(2));
    }
  });

  it('renders the search field and connect control in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = automateCopy(locale);
      const markup = renderToStaticMarkup(<AutomateView document={doc(model())} onUpdateDocument={vi.fn()} />);
      expect(markup).toContain(`placeholder="${copy.paletteSearch}"`);
      expect(markup).toContain(copy.connectNodes);
    }
  });
});

// ---------------------------------------------------------------------------
// The wire — the render-side half; the source half lives in the `.mjs` companion
// ---------------------------------------------------------------------------
describe('Automate wiring contract (render side)', () => {
  it('offers a palette block set that is never empty for a blank query', () => {
    // If the palette's own templates were filtered out by their own contract, the user would face an
    // empty list. The unfiltered palette must render at least one addable block.
    const markup = renderToStaticMarkup(<AutomatePalette onUpdateModel={vi.fn()} />);
    expect(markup.match(/automate-palette-item /g)?.length ?? 0).toBeGreaterThan(0);
    expect(markup).not.toContain('data-automate-palette-empty');
  });

  it('renders the named load refusals that the gate uses', () => {
    localeState.current = 'en-US';
    const bad = model();
    bad.requiredCapabilities = [];
    const markup = renderToStaticMarkup(<AutomateView document={doc(bad)} onUpdateDocument={vi.fn()} />);
    expect(markup).toContain('data-automate-load-issue="capability-undeclared:workspace.task.create.write"');
  });
});
