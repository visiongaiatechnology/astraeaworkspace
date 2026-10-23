// STATUS: DIAMANT VGT SUPREME — the preflight: what this flow needs, and whether it is permitted.
//
// MEASURED FACTS this module encodes (see BATCH-AUTOMATE/INVENTORY.md):
//  - `providers/automatePermissionCore.ts` (`validateFlowManifest`, `assertLeastPrivilege`,
//    `importFlowPackage`) was imported by nothing. A capability with no caller is not delivered.
//  - There was no run plan at all: the trial walked the node order and reported a simulated step per
//    node without ever stating what the flow would need or whether it was allowed to have it.
//
// Fail-closed by construction: `planAutomateRun` can only return `permitted: true` when
//   1. the manifest reproduces exactly the capabilities the actions require (least privilege, both
//      directions — no undeclared use AND no over-privileged declaration),
//   2. the flow graph validates,
//   3. every trigger config satisfies the trigger contract, and
//   4. the admin policy denies none of it.
// Any failure returns `permitted: false` with named codes. It never returns a bare `allowed: true`.
import type { AutomateDocumentModel, FlowNode } from '../model/types';
import { buildRunPreview, validateFlowModel } from '../model/automateFlowCore';
import { deriveFlowCapabilities, validateFlowTriggerConfigs } from '../model/automateEditingCore';
import { requiredActionCapabilities, type AutomateAction, type WorkspaceOperation } from '../actions/automateActionCore';
import {
  assertLeastPrivilege,
  validateFlowManifest,
  type AdminAutomationPolicy,
  type FlowManifest,
  type FlowPermission,
} from '../providers/automatePermissionCore';

/** Access verbs, mirroring `PermissionAccess` in the permission core. One list. */
const WORKSPACE_OPERATION_ACCESS: Readonly<Record<WorkspaceOperation, FlowPermission['access']>> = {
  'document.create': 'write',
  'document.update': 'write',
  'document.export': 'read',
  'task.create': 'write',
  'grid.transform': 'write',
  'report.generate': 'read',
  'vault.move': 'write',
  'vault.copy': 'write',
};

/**
 * The admin policy this edition actually has.
 *
 * No component in the open-core tree supplies an `AdminAutomationPolicy`, so the app owns a policy of
 * record instead of pretending one arrives. It denies nothing by default and is deliberately explicit:
 * a deployment that wants to deny capabilities supplies its own object, and every check below already
 * honours it. Everything is `ReadonlySet`, so a caller cannot mutate the policy in place.
 */
export const PERMISSIVE_AUTOMATION_POLICY: AdminAutomationPolicy = {
  deniedCapabilities: new Set<string>(),
  deniedConnectorCategories: new Set<string>(),
  deniedDomains: new Set<string>(),
  allowRpa: false,
  allowUnattended: false,
  minimumScheduleMinutes: 1,
};

export type RunRefusalCode =
  | 'plan-graph-invalid'
  | 'plan-trigger-config-invalid'
  | 'plan-capability-undeclared'
  | 'plan-overprivileged-manifest'
  | 'plan-policy-denied'
  | 'plan-manifest-invalid';

export interface AutomateRunPlan {
  /** True only when every check below passed. Never a bare constant. */
  readonly permitted: boolean;
  /** i18n-independent refusal codes, in the order they were found. Empty when permitted. */
  readonly refusals: readonly RunRefusalCode[];
  /** Node ids in the order the run would walk them. Empty when not permitted. */
  readonly order: readonly string[];
  /** Exactly the capabilities the actions require, sorted. */
  readonly requiredCapabilities: readonly string[];
  /** The manifest built from the current document, for review before a run. */
  readonly manifest: FlowManifest;
  /** The capabilities the policy denies from the required set. */
  readonly deniedCapabilities: readonly string[];
  /** What this plan claims about execution. Always false: nothing executes here. */
  readonly executes: false;
}

function workspaceAction(node: FlowNode): AutomateAction | null {
  const config = node.config as Record<string, unknown>;
  if (node.type !== 'action' || config.actionKind !== 'workspace') return null;
  const operation = config.operation;
  if (typeof operation !== 'string' || !(operation in WORKSPACE_OPERATION_ACCESS)) return null;
  return {
    kind: 'workspace',
    operation: operation as WorkspaceOperation,
    targetRef: typeof config.targetRef === 'string' ? config.targetRef : '',
    input: null,
  } as unknown as AutomateAction;
}

/**
 * Translate an action-layer capability name into a manifest capability identifier.
 *
 * MEASURED: the two layers name the same fact differently. `requiredActionCapabilities` yields
 * `workspace.task.create.write`, while `validateFlowManifest` requires the `cap:` prefix
 * (`/^cap:[a-z0-9][a-z0-9._:-]{1,127}$/`). Without this bridge the shipped default flow was reported as
 * `permission-invalid` — a false refusal caused purely by a naming mismatch. The bridge is idempotent so
 * an already-namespaced name is not double-prefixed.
 */
export function toManifestCapabilityId(capability: string): string {
  return capability.startsWith('cap:') ? capability : `cap:${capability}`;
}

/** The permission rows behind the derived capabilities, for a review list a human can read. */
export function flowPermissions(model: Pick<AutomateDocumentModel, 'nodes'>): FlowPermission[] {
  const rows: FlowPermission[] = [];
  const seen = new Set<string>();
  for (const node of model.nodes) {
    const action = workspaceAction(node);
    if (!action) continue;
    for (const capability of requiredActionCapabilities(action)) {
      const namespaced = toManifestCapabilityId(capability);
      if (seen.has(namespaced)) continue;
      seen.add(namespaced);
      rows.push({
        capability: namespaced,
        // The resource is the action's own target when it has one, otherwise the node that needs it.
        resource: action.kind === 'workspace' && action.targetRef ? action.targetRef : node.id,
        access: action.kind === 'workspace' ? WORKSPACE_OPERATION_ACCESS[action.operation] : 'use',
        reason: node.title,
      });
    }
  }
  return rows;
}

/** Build the manifest the document's actions imply — the least-privilege side of the comparison. */
export function buildFlowManifest(model: AutomateDocumentModel): FlowManifest {
  const permissions = flowPermissions(model);
  return {
    flowId: model.flowId,
    flowVersion: model.version,
    permissions,
    connectorCategories: [],
    networkDomains: [],
    unattended: false,
    rpa: false,
  };
}

/**
 * The preflight. Answers "would this flow be allowed to run, and what would it need?" without claiming
 * that anything ran.
 *
 * The least-privilege decision is delegated to `assertLeastPrivilege` in the permission core, which is
 * the single definition of that rule: it refuses both an *undeclared* use and an *over-privileged*
 * declaration. The "used" set is what the actions actually require; the "declared" set is
 * `model.requiredCapabilities`. This function only maps the core's throw onto a named refusal code — it
 * does not restate the comparison.
 */
export function planAutomateRun(
  model: AutomateDocumentModel,
  policy: AdminAutomationPolicy = PERMISSIVE_AUTOMATION_POLICY,
): AutomateRunPlan {
  const manifest = buildFlowManifest(model);
  const required = deriveFlowCapabilities(model);
  const refusals: RunRefusalCode[] = [];

  const graphIssues = validateFlowModel(model);
  const triggerIssues = validateFlowTriggerConfigs(model);
  if (graphIssues.length > 0) refusals.push('plan-graph-invalid');
  if (triggerIssues.length > 0) refusals.push('plan-trigger-config-invalid');

  // Least privilege in BOTH directions, decided by the permission core, which is the single definition
  // of that rule. Both sides are normalised to the manifest's `cap:` namespace first: the manifest
  // holds namespaced ids while `model.requiredCapabilities` uses the action layer's bare names, and
  // comparing the two raw would report a false `undeclared-capability-use` on every flow.
  const usedCapabilities = new Set(model.requiredCapabilities.map(toManifestCapabilityId));
  try {
    assertLeastPrivilege(manifest, usedCapabilities);
  } catch {
    const undeclaredUse = required.some((capability) => !model.requiredCapabilities.includes(capability));
    refusals.push(undeclaredUse ? 'plan-capability-undeclared' : 'plan-overprivileged-manifest');
  }

  try {
    validateFlowManifest(manifest, policy);
  } catch {
    refusals.push('plan-manifest-invalid');
  }

  const deniedCapabilities = required.filter((capability) => policy.deniedCapabilities.has(capability));
  if (deniedCapabilities.length > 0) refusals.push('plan-policy-denied');
  if (policy.allowRpa !== true && manifest.rpa) refusals.push('plan-manifest-invalid');
  if (policy.allowUnattended !== true && manifest.unattended) refusals.push('plan-manifest-invalid');

  const unique = [...new Set(refusals)];
  const permitted = unique.length === 0;
  // A refused plan has no order to walk. The walk order is only derived from a graph that validated, so
  // an invalid graph can never throw out of the preflight.
  const order = permitted ? buildRunPreview(model) : [];
  return {
    permitted,
    refusals: unique,
    order,
    requiredCapabilities: required,
    manifest,
    deniedCapabilities,
    executes: false,
  };
}
