// STATUS: DIAMANT VGT SUPREME — Astraea Automate canonical document and execution contracts.
// The event envelope is imported type-only: `automateWorkspaceIntegration` imports this module, so the
// edge stays erased at run time and no runtime cycle exists between the two.
import type { FabricAutomationEvent } from '../integrations/automateWorkspaceIntegration';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type AutomateValueType = 'string' | 'number' | 'boolean' | 'datetime' | 'object' | 'array' | 'workspace-ref' | 'secret-handle' | 'binary-handle';
export type AutomateNodeType = 'trigger' | 'action' | 'condition' | 'switch' | 'loop' | 'parallel' | 'error' | 'finally' | 'approval' | 'subflow' | 'transform';
export type FlowLifecycle = 'draft' | 'published' | 'disabled' | 'suspended';
export type FlowRunStatus = 'queued' | 'running' | 'paused' | 'success' | 'failed' | 'cancelled' | 'quarantined' | 'simulated';

export interface TypedPort {
  id: string;
  name: string;
  valueType: AutomateValueType;
  required: boolean;
}

export interface FlowVariable {
  id: string;
  name: string;
  valueType: AutomateValueType;
  scope: 'flow' | 'branch' | 'loop';
  constant: boolean;
  initialValue?: JsonValue;
}

export type AutomateExpression =
  | { op: 'literal'; value: JsonValue }
  | { op: 'var'; name: string }
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; left: AutomateExpression; right: AutomateExpression }
  | { op: 'and' | 'or'; items: AutomateExpression[] }
  | { op: 'not'; item: AutomateExpression }
  | { op: 'compose'; items: AutomateExpression[]; separator?: string }
  | { op: 'select'; source: AutomateExpression; key: string }
  | { op: 'map'; source: AutomateExpression; itemVariable: string; expression: AutomateExpression }
  | { op: 'filter'; source: AutomateExpression; itemVariable: string; predicate: AutomateExpression };

export interface FlowNode {
  id: string;
  type: AutomateNodeType;
  title: string;
  category: string;
  x: number;
  y: number;
  inputs: TypedPort[];
  outputs: TypedPort[];
  config: Record<string, JsonValue>;
  breakpoint?: boolean;
  disabled?: boolean;
  lastExecutionStatus?: FlowRunStatus;
}

export interface FlowConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortId?: string;
  toPortId?: string;
  label?: string;
}

export interface FlowContract {
  inputs: TypedPort[];
  outputs: TypedPort[];
}

export interface AutomateDesignerState {
  zoom: number;
  panX: number;
  panY: number;
  minimapVisible: boolean;
  validationPanelVisible: boolean;
  testMode: boolean;
  previewNodeIds: string[];
}

export interface FlowExecutionStep {
  nodeId: string;
  nodeTitle: string;
  status: FlowRunStatus;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  branch?: string;
  safeMessage: string;
  redactedInput?: JsonValue;
  redactedOutput?: JsonValue;
}

export interface FlowExecutionRun {
  id: string;
  flowVersion: number;
  startedAt: number;
  endedAt: number;
  status: FlowRunStatus;
  durationMs: number;
  triggerKind: string;
  simulated: boolean;
  steps: FlowExecutionStep[];
  safeErrorCode?: string;
}

export interface FlowRelease {
  id: string;
  name: string;
  version: number;
  createdAt: number;
  graphDigest: string;
}

export interface AutomateDocumentModel {
  schemaVersion: 2;
  flowId: string;
  flowName: string;
  description: string;
  version: number;
  lifecycle: FlowLifecycle;
  nodes: FlowNode[];
  connections: FlowConnection[];
  variables: FlowVariable[];
  contract: FlowContract;
  requiredCapabilities: string[];
  selectedNodeId: string | null;
  designer: AutomateDesignerState;
  runs: FlowExecutionRun[];
  releases: FlowRelease[];
  tags: string[];
  /**
   * Bounded log of observed workspace ("Fabric") events, oldest first.
   *
   * Optional on purpose: a document written before this field existed is still valid, and
   * `flowFabricEvents` reads an absent field as an empty log rather than reporting an error.
   * Validated and bounded by `integrations/automateFabricInboxCore.ts` — this file only declares it.
   */
  fabricEvents?: FabricAutomationEvent[];
  folderId?: string;
  ownerId?: string;
  spaceRef?: string;
}

const scalarPort = (id: string, name: string, valueType: AutomateValueType, required = true): TypedPort => ({ id, name, valueType, required });

export const DEFAULT_AUTOMATE_MODEL: AutomateDocumentModel = {
  schemaVersion: 2,
  flowId: 'flow-security-response',
  flowName: 'NetGate Security Response',
  description: 'Local-first, capability-gated response flow for a denied outbound policy event.',
  version: 1,
  lifecycle: 'draft',
  // Measured rule this default must obey: the shipped configuration has to satisfy the rules the app
  // publishes. Every field that `model/automateConfigSchema.ts` declares for a node's own type is
  // present here, so the default flow passes its own config contract — and the only action's derived
  // capability (`workspace.task.create.write`) is exactly what is declared. See
  // `automateInteraction.test.tsx` "accepts the shipped default flow as loadable".
  nodes: [
    {
      id: 'node-trigger', type: 'trigger', title: 'Workspace security event', category: 'Workspace Event', x: 60, y: 100,
      inputs: [], outputs: [scalarPort('event', 'event', 'object')],
      config: { triggerKind: 'workspace-event', event: 'document.saved' },
    },
    {
      id: 'node-condition', type: 'condition', title: 'Severity is critical', category: 'Logic', x: 340, y: 100,
      inputs: [scalarPort('event', 'event', 'object')], outputs: [scalarPort('true', 'true', 'boolean'), scalarPort('false', 'false', 'boolean')],
      config: {
        conditionKind: 'equals', left: 'severity', right: 'CRITICAL',
        expression: { op: 'eq', left: { op: 'var', name: 'severity' }, right: { op: 'literal', value: 'CRITICAL' } } as unknown as JsonValue,
      },
    },
    {
      id: 'node-action', type: 'action', title: 'Create incident task', category: 'Workspace', x: 640, y: 70,
      inputs: [scalarPort('event', 'event', 'object')], outputs: [scalarPort('task-ref', 'taskRef', 'workspace-ref')],
      config: { actionKind: 'workspace', operation: 'task.create', targetRef: 'vgt://workspace/tasks/security-incidents' },
    },
    {
      // Measured: this node was titled "Record safe completion" and carried `safeAudit: true`, but no
      // component in this app records an audit entry — the flag asserted a Vorgang that does not happen.
      // The title now names what the node actually is (a flow terminator) and the config carries only a
      // field the app's own schema declares and the inspector edits.
      id: 'node-finally', type: 'finally', title: 'Flow end', category: 'Reliability', x: 920, y: 70,
      inputs: [], outputs: [], config: { mode: 'always' },
    },
  ],
  connections: [
    { id: 'conn-1', fromNodeId: 'node-trigger', toNodeId: 'node-condition', fromPortId: 'event', toPortId: 'event' },
    { id: 'conn-2', fromNodeId: 'node-condition', toNodeId: 'node-action', fromPortId: 'true', toPortId: 'event', label: 'critical' },
    { id: 'conn-3', fromNodeId: 'node-action', toNodeId: 'node-finally' },
  ],
  variables: [{ id: 'var-severity', name: 'severity', valueType: 'string', scope: 'flow', constant: false }],
  contract: { inputs: [scalarPort('event', 'event', 'object')], outputs: [] },
  // Measured: the default flow's only action is `actionKind:'workspace', operation:'task.create'`, and
  // `requiredActionCapabilities` in `actions/automateActionCore.ts` derives `workspace.task.create.write`
  // for exactly that action. The previously declared `workspace.task.write` matched no code path, so the
  // shipped default would have been refused by its own capability gate.
  requiredCapabilities: ['workspace.task.create.write'],
  selectedNodeId: null,
  designer: { zoom: 1, panX: 0, panY: 0, minimapVisible: true, validationPanelVisible: true, testMode: false, previewNodeIds: [] },
  runs: [], releases: [], tags: ['security'],
};
