// Preview/test evaluator only. Activation and production scheduling truth lives in native vgt-automation-runtime.
// STATUS: DIAMANT VGT SUPREME — Deterministic, capability-free preview evaluator.

export const AUTOMATION_IR_VERSION = 'vgt.automation/1' as const;
const MAX_NODES = 128;
const MAX_VALUE_BYTES = 256 * 1024;
const MAX_PROPOSED_OPERATIONS = 256;
let automationSafeMode = false;

export function setAutomationSafeMode(enabled: boolean): void { automationSafeMode = enabled; }
export function automationSafeModeEnabled(): boolean { return automationSafeMode; }

export type AutomationNode =
  | { id: string; kind: 'input'; key: string }
  | { id: string; kind: 'const'; value: string | number | boolean | null }
  | { id: string; kind: 'number.add'; dependencies: [string, string] }
  | { id: string; kind: 'number.multiply'; dependencies: [string, string] }
  | { id: string; kind: 'string.concat'; dependencies: string[] }
  | { id: string; kind: 'propose-operation'; dependency: string; operationKind: string; objectId: string };

export interface AutomationFlow {
  version: typeof AUTOMATION_IR_VERSION;
  flowId: string;
  nodes: AutomationNode[];
  outputs: string[];
}

export interface ProposedWorkspaceOperation {
  operationKind: string;
  objectId: string;
  value: unknown;
  idempotencyKey: string;
}

export interface AutomationRunResult {
  outputs: Record<string, unknown>;
  proposedOperations: ProposedWorkspaceOperation[];
  executedNodeIds: string[];
}

export function validateAutomationFlow(flow: AutomationFlow): string[] {
  if (flow.version !== AUTOMATION_IR_VERSION) throw new Error('AUTOMATION_VERSION_REJECTED');
  if (!/^[a-z0-9][a-z0-9._:-]{1,127}$/.test(flow.flowId)) throw new Error('AUTOMATION_FLOW_ID_REJECTED');
  if (!Array.isArray(flow.nodes) || flow.nodes.length === 0 || flow.nodes.length > MAX_NODES) throw new Error('AUTOMATION_NODE_COUNT_REJECTED');
  const byId = new Map<string, AutomationNode>();
  for (const node of flow.nodes) {
    if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(node.id) || byId.has(node.id)) throw new Error('AUTOMATION_NODE_ID_REJECTED');
    byId.set(node.id, node);
    validateNodeShape(node);
  }
  const dependencies = new Map<string, string[]>();
  for (const node of flow.nodes) {
    const deps = nodeDependencies(node);
    if (deps.some((dependency) => !byId.has(dependency))) throw new Error('AUTOMATION_DEPENDENCY_MISSING');
    dependencies.set(node.id, deps);
  }
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error('AUTOMATION_CYCLE_REJECTED');
    visiting.add(id);
    const deps = [...(dependencies.get(id) ?? [])].sort();
    for (const dependency of deps) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const id of [...byId.keys()].sort()) visit(id);
  for (const output of flow.outputs) if (!byId.has(output)) throw new Error('AUTOMATION_OUTPUT_REJECTED');
  return order;
}

export function runDeterministicAutomation(
  flow: AutomationFlow,
  inputs: Readonly<Record<string, unknown>>,
): AutomationRunResult {
  if (automationSafeMode) throw new Error('AUTOMATION_SAFE_MODE_BLOCKED');
  const order = validateAutomationFlow(flow);
  assertBoundedValue(inputs);
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]));
  const values = new Map<string, unknown>();
  const proposedOperations: ProposedWorkspaceOperation[] = [];
  for (const id of order) {
    const node = nodes.get(id);
    if (!node) throw new Error('AUTOMATION_INTERNAL_NODE_MISSING');
    const value = evaluateNode(flow.flowId, node, inputs, values, proposedOperations);
    assertBoundedValue(value);
    values.set(id, value);
  }
  const outputs: Record<string, unknown> = {};
  for (const output of flow.outputs) outputs[output] = values.get(output);
  assertBoundedValue(outputs);
  return { outputs, proposedOperations, executedNodeIds: order };
}

function evaluateNode(
  flowId: string,
  node: AutomationNode,
  inputs: Readonly<Record<string, unknown>>,
  values: ReadonlyMap<string, unknown>,
  operations: ProposedWorkspaceOperation[],
): unknown {
  switch (node.kind) {
    case 'input':
      if (!(node.key in inputs)) throw new Error('AUTOMATION_INPUT_MISSING');
      return structuredClone(inputs[node.key]);
    case 'const':
      return node.value;
    case 'number.add':
      return numberValue(values.get(node.dependencies[0])) + numberValue(values.get(node.dependencies[1]));
    case 'number.multiply':
      return numberValue(values.get(node.dependencies[0])) * numberValue(values.get(node.dependencies[1]));
    case 'string.concat':
      return node.dependencies.map((dependency) => String(values.get(dependency) ?? '')).join('');
    case 'propose-operation': {
      if (operations.length >= MAX_PROPOSED_OPERATIONS) throw new Error('AUTOMATION_OPERATION_LIMIT');
      if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(node.operationKind) || !node.objectId || node.objectId.length > 256) {
        throw new Error('AUTOMATION_OPERATION_REJECTED');
      }
      const value = structuredClone(values.get(node.dependency));
      const operation: ProposedWorkspaceOperation = {
        operationKind: node.operationKind,
        objectId: node.objectId,
        value,
        idempotencyKey: `${flowId}:${node.id}`,
      };
      operations.push(operation);
      return value;
    }
  }
}

function validateNodeShape(node: AutomationNode): void {
  if (node.kind === 'input' && (!node.key || node.key.length > 128)) throw new Error('AUTOMATION_INPUT_KEY_REJECTED');
  if (node.kind === 'string.concat' && (node.dependencies.length === 0 || node.dependencies.length > 32)) throw new Error('AUTOMATION_DEPENDENCY_COUNT_REJECTED');
  if (node.kind === 'const') assertBoundedValue(node.value);
}

function nodeDependencies(node: AutomationNode): string[] {
  switch (node.kind) {
    case 'number.add':
    case 'number.multiply':
    case 'string.concat': return [...node.dependencies];
    case 'propose-operation': return [node.dependency];
    case 'input':
    case 'const': return [];
  }
}

function numberValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('AUTOMATION_NUMBER_REQUIRED');
  return value;
}

function assertBoundedValue(value: unknown): void {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new Error('AUTOMATION_VALUE_SERIALIZATION_REJECTED');
  }
  if (new TextEncoder().encode(encoded ?? 'null').byteLength > MAX_VALUE_BYTES) throw new Error('AUTOMATION_VALUE_LIMIT');
}
