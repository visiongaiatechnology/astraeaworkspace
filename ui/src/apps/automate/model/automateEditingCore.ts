// STATUS: DIAMANT VGT SUPREME — bounded node/connection editing and the action plan (capability truth).
//
// MEASURED FACTS this module encodes (see BATCH-AUTOMATE/INVENTORY.md):
//  - `AutomatePalette.add` derived a node id from `Date.now()` + the *rendered* node count, so two adds
//    inside one render window could mint the same id (duplicate id => whole flow invalid => trial blocked).
//  - The canvas rendered `model.connections` but nothing could ever create one; port ids existed only to
//    be drawn. `createAutomateConnection` is the single definition of a legal edge.
//  - `actions/automateActionCore.ts` was reachable from no component. Its `requiredActionCapabilities`
//    is now the one definition of "which capability does this node need", so a flow whose capabilities
//    are not granted is refused *before* the trial instead of being reported as checked.
//
// One definition per fact: node admission lives here, capability derivation lives with the action
// contract in `actions/automateActionCore.ts`, graph legality stays in `automateFlowCore.ts`.
import { AutomateFlowError, topologicalOrder, validateFlowModel } from './automateFlowCore';
import { requiredActionCapabilities, type AutomateAction } from '../actions/automateActionCore';
import { AutomateTriggerError, triggerFromNodeConfig } from '../triggers/automateTriggerCore';
import { withConfigDefaults, writeFieldValue, validateNodeConfigValues, type AutomateConfigField } from './automateConfigSchema';
import type { AutomateDocumentModel, FlowConnection, FlowNode, JsonValue, TypedPort } from './types';

/** Mirrors `MAX_EDGES` in `automateFlowCore.ts` so refusal happens at the same number that invalidates. */
export const MAX_FLOW_EDGES = 2048;
/** Mirrors `MAX_NODES` in `automateFlowCore.ts`. */
export const MAX_FLOW_NODES = 512;
/** Upper bound for a palette query; longer input is refuse-invalid, never silently truncated. */
export const MAX_PALETTE_QUERY = 128;

export class AutomateEditingError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AutomateEditingError';
  }
}

/** A palette/searchable block. The palette is the only producer of nodes. */
export interface AutomateBlockTemplate {
  readonly type: FlowNode['type'];
  readonly title: string;
  readonly category: string;
  readonly config: Record<string, JsonValue>;
}

const ID = /^[a-z0-9][a-z0-9._:\-]{0,127}$/;

/**
 * Deterministic node id from an explicit seed. PURE: same seed + same model => same id.
 * The caller supplies the seed (the view uses a monotonic counter), so two adds can never collide
 * even when they happen inside one render window.
 */
export function nextNodeId(model: Pick<AutomateDocumentModel, 'nodes'>, seed: number | string): string {
  const base = `node-${String(seed).replace(/[^a-z0-9]/gi, '')}`.slice(0, 100).toLowerCase();
  const taken = new Set(model.nodes.map((node) => node.id));
  if (ID.test(base) && !taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** Port shape for a node type. Triggers take no input; `finally` produces no output. */
export function portsForNodeType(type: FlowNode['type']): { inputs: TypedPort[]; outputs: TypedPort[] } {
  return {
    inputs: type === 'trigger' ? [] : [{ id: 'input', name: 'input', valueType: 'object', required: false }],
    outputs: type === 'finally' ? [] : [{ id: 'output', name: 'output', valueType: 'object', required: false }],
  };
}

/**
 * Build a node from a template. Refuses when the flow is already at the node bound instead of
 * appending a node that would make the whole document invalid.
 */
export function buildNodeFromTemplate(
  model: Pick<AutomateDocumentModel, 'nodes'>,
  template: AutomateBlockTemplate,
  seed: number | string,
): FlowNode {
  if (model.nodes.length >= MAX_FLOW_NODES) throw new AutomateEditingError('node-count-boundary');
  const id = nextNodeId(model, seed);
  const { inputs, outputs } = portsForNodeType(template.type);
  const draft: FlowNode = {
    id,
    type: template.type,
    title: template.title,
    category: template.category,
    x: 100 + (model.nodes.length % 3) * 260,
    y: 100 + Math.floor(model.nodes.length / 3) * 130,
    inputs,
    outputs,
    config: structuredClone(template.config),
  };
  // A palette node is complete by construction: every field its own type declares is present, so the
  // inspector never shows a control for a value the contract already defines. A template cannot ship a
  // node that its own contract would immediately refuse.
  return withConfigDefaults(draft);
}

/**
 * Fold diacritics and kana width to a comparable form, then lowercase.
 * Without this a German user searching "verfugbar" or a Japanese user typing half-width katakana
 * would silently get "no results" for copy that exists.
 */
export function normalizeAutomateSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .toLowerCase();
}

/** Split a query into normalized terms. Blank terms are dropped; the result may be empty. */
export function tokenizePaletteQuery(query: string): string[] {
  if (query.length > MAX_PALETTE_QUERY) throw new AutomateEditingError('palette-query-boundary');
  return normalizeAutomateSearch(query).split(/\s+/).filter((term) => term.length > 0);
}

/**
 * Filter blocks by every whitespace-separated term (AND), matching title or category.
 * `labels` supplies localized title/category text when the caller has it; an empty query returns all.
 */
export function filterAutomateBlocks<T extends AutomateBlockTemplate>(
  blocks: readonly T[],
  query: string,
  labels?: (block: T) => { title: string; category: string },
): T[] {
  const terms = tokenizePaletteQuery(query);
  if (terms.length === 0) return [...blocks];
  return blocks.filter((block) => {
    const effective = labels ? labels(block) : { title: block.title, category: block.category };
    const haystack = normalizeAutomateSearch(`${effective.title} ${effective.category} ${block.type}`);
    return terms.every((term) => haystack.includes(term));
  });
}

export interface CreateConnectionInput {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly fromPortId?: string;
  readonly toPortId?: string;
  readonly label?: string;
  /** Monotonic seed from the caller so two connections can never share an id. */
  readonly seed: number | string;
}

/**
 * The single definition of a legal edge. Every refusal names its code; nothing is repaired silently.
 */
export function createAutomateConnection(
  model: Pick<AutomateDocumentModel, 'nodes' | 'connections'>,
  input: CreateConnectionInput,
): FlowConnection {
  const from = model.nodes.find((node) => node.id === input.fromNodeId);
  const to = model.nodes.find((node) => node.id === input.toNodeId);
  if (!from || !to) throw new AutomateEditingError('edge-node-missing');
  if (from.id === to.id) throw new AutomateEditingError('edge-self-loop-rejected');
  if (model.connections.length >= MAX_FLOW_EDGES) throw new AutomateEditingError('edge-count-boundary');

  const duplicate = model.connections.some(
    (edge) => edge.fromNodeId === from.id && edge.toNodeId === to.id
      && edge.fromPortId === input.fromPortId && edge.toPortId === input.toPortId,
  );
  if (duplicate) throw new AutomateEditingError('edge-duplicate-rejected');

  if (input.fromPortId && !from.outputs.some((port) => port.id === input.fromPortId)) throw new AutomateEditingError('edge-output-port-missing');
  if (input.toPortId && !to.inputs.some((port) => port.id === input.toPortId)) throw new AutomateEditingError('edge-input-port-missing');

  const connection: FlowConnection = {
    id: `conn-${String(input.seed).replace(/[^a-z0-9]/gi, '')}`.slice(0, 100).toLowerCase(),
    fromNodeId: from.id,
    toNodeId: to.id,
    fromPortId: input.fromPortId,
    toPortId: input.toPortId,
    label: input.label,
  };
  // Cycle/self-recursion is refused here, not tolerated until run time: a flow that can re-enter
  // itself must never be offered as runnable.
  topologicalOrder(model.nodes, [...model.connections, connection]);
  return connection;
}

/** Append a validated edge. Returns a new model; the input model is never mutated. */
export function addAutomateConnection(
  model: AutomateDocumentModel,
  input: CreateConnectionInput,
): AutomateDocumentModel {
  const connection = createAutomateConnection(model, input);
  return { ...model, connections: [...model.connections, connection] };
}

/**
 * Write one typed config field on one node.
 *
 * Identity fields are refused here: `id` and `type` decide what the node *is*, so a form must not be
 * able to turn a trigger into an action and silently invalidate every edge that referenced it.
 */
export function updateNodeField(
  model: AutomateDocumentModel,
  nodeId: string,
  field: AutomateConfigField,
  value: JsonValue,
): AutomateDocumentModel {
  const target = model.nodes.find((node) => node.id === nodeId);
  if (!target) throw new AutomateEditingError('node-not-found');
  const config = writeFieldValue(target.config as Record<string, JsonValue>, field, value);
  return { ...model, nodes: model.nodes.map((node) => (node.id === nodeId ? { ...node, config } : node)) };
}

/** Rename a node. The title is an identity-adjacent field with its own bound (`node-title-boundary`). */
export function renameNode(model: AutomateDocumentModel, nodeId: string, title: string): AutomateDocumentModel {
  if (!title || title.length > 160) throw new AutomateEditingError('node-title-boundary');
  if (!model.nodes.some((node) => node.id === nodeId)) throw new AutomateEditingError('node-not-found');
  return { ...model, nodes: model.nodes.map((node) => (node.id === nodeId ? { ...node, title } : node)) };
}

/** Apply every declared fallback to a node, so an older template becomes a complete one. */
export function completeNodeConfig(model: AutomateDocumentModel, nodeId: string): AutomateDocumentModel {
  const target = model.nodes.find((node) => node.id === nodeId);
  if (!target) throw new AutomateEditingError('node-not-found');
  const completed = withConfigDefaults(target);
  return { ...model, nodes: model.nodes.map((node) => (node.id === nodeId ? completed : node)) };
}

/**
 * Validate a node's trigger configuration against the canonical trigger contract.
 * Returns an empty array when the node carries no trigger config; otherwise it returns named codes.
 * A refusal here is what stops an impossible schedule (interval 0, unknown timezone, a webhook with no
 * capability) from being admitted and later reported as "checked".
 */
export function validateNodeTriggerConfig(node: Pick<FlowNode, 'id' | 'type' | 'config'>): string[] {
  if (node.type !== 'trigger') return [];
  const config = node.config as Record<string, unknown>;
  if (config.triggerKind === undefined) return [`trigger-config-missing:${node.id}`];
  try {
    triggerFromNodeConfig(config);
    return [];
  } catch (error) {
    const code = error instanceof AutomateTriggerError ? error.code : 'trigger-config-invalid';
    return [`${code}:${node.id}`];
  }
}

/** Named trigger-config refusals for a whole flow, in node order. */
export function validateFlowTriggerConfigs(model: Pick<AutomateDocumentModel, 'nodes'>): string[] {
  return model.nodes.flatMap((node) => validateNodeTriggerConfig(node));
}

/** Declare exactly what a flow needs: derived capabilities, nothing hand-maintained. */
export function withDerivedCapabilities(model: AutomateDocumentModel): AutomateDocumentModel {
  return { ...model, requiredCapabilities: deriveFlowCapabilities(model) };
}

/**
 * The capabilities every node of this flow actually needs.
 * Derived from the canonical action contract so the manifest cannot drift from the actions.
 */
export function deriveFlowCapabilities(model: Pick<AutomateDocumentModel, 'nodes'>): string[] {
  const required = new Set<string>();
  for (const node of model.nodes) {
    const config = node.config as Record<string, unknown>;
    if (node.type === 'action' && config.actionKind === 'workspace' && typeof config.operation === 'string') {
      const action = { kind: 'workspace', operation: config.operation, targetRef: '', input: null } as unknown as AutomateAction;
      for (const capability of requiredActionCapabilities(action)) required.add(capability);
    }
    if (node.type === 'action' && config.actionKind === 'http' && typeof config.netGateCapabilityId === 'string') {
      required.add(config.netGateCapabilityId);
    }
    if (node.type === 'approval') required.add('workspace.approval.request');
    if (node.type === 'trigger' && config.triggerKind === 'connector' && typeof config.capabilityId === 'string') {
      required.add(config.capabilityId);
    }
  }
  return [...required].sort();
}

/** Capabilities a flow needs that the document does not declare. Empty means the flow is admissible. */
export function undeclaredFlowCapabilities(model: AutomateDocumentModel): string[] {
  const declared = new Set(model.requiredCapabilities);
  return deriveFlowCapabilities(model).filter((capability) => !declared.has(capability));
}

/** Named config *value* refusals for a whole flow, in node order. Absent fields are not refusals. */
export function validateFlowConfigValues(model: Pick<AutomateDocumentModel, 'nodes'>): string[] {
  return model.nodes.flatMap((node) => validateNodeConfigValues(node).map((issue) => `config-${issue.code}:${node.id}`));
}

const SUPPORTED_SCHEMA_VERSION = 2;

/**
 * The single definition of why a flow is refused: graph legality, declared capabilities, trigger
 * configs, config values. `inspectFlowForLoad` adds the schema check on top; the view renders exactly
 * this list, so the visible refusals and the load decision can never disagree.
 */
export function flowRefusalIssues(candidate: AutomateDocumentModel): string[] {
  return [
    ...validateFlowModel(candidate).map((issue) => issue.code),
    ...undeclaredFlowCapabilities(candidate).map((capability) => `capability-undeclared:${capability}`),
    ...validateFlowTriggerConfigs(candidate),
    ...validateFlowConfigValues(candidate),
  ];
}

/**
 * Normalize an imported/generated flow for a *new* document.
 * Returns the blocked model (for audit) plus the exact validation codes, so the caller can refuse
 * instead of rendering a flow as if it were loadable.
 */
export function inspectFlowForLoad(candidate: AutomateDocumentModel): {
  loadable: boolean;
  issues: string[];
  unsupportedSchema: boolean;
} {
  const unsupportedSchema = candidate.schemaVersion !== SUPPORTED_SCHEMA_VERSION;
  const issues = flowRefusalIssues(candidate);
  return { loadable: !unsupportedSchema && issues.length === 0, issues, unsupportedSchema };
}

/** Re-exported so callers can catch graph refusals from this module's API with one import. */
export { AutomateFlowError };
