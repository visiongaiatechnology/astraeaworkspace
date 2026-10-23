// STATUS: DIAMANT VGT SUPREME — the Fabric event inbox: validated envelopes that actually reach a flow.
//
// MEASURED FACTS this module encodes (see BATCH-AUTOMATE/INVENTORY.md):
//  - `integrations/automateWorkspaceIntegration.ts` was imported by nothing. Its
//    `createFabricAutomationEvent` validated event envelopes that no application code ever produced, so
//    the "Dokumentänderungen als Trigger" capability existed only as a contract.
//  - A flow could declare a `workspace-event` trigger, but nothing could ever tell whether a given
//    workspace event would be accepted by it.
//
// This module is the caller. It does ONE thing: hold a bounded, validated log of observed workspace
// events for a flow, and answer whether the flow's trigger accepts one. It does not subscribe to a live
// Fabric bus (none exists in this tree) and does not deliver anything to a running flow — an event that
// is recorded is recorded, nothing more. The panel says so.
import type { AutomateDocumentModel, JsonValue } from '../model/types';
import {
  AutomateIntegrationError,
  createFabricAutomationEvent,
  type FabricAutomationEvent,
} from '../integrations/automateWorkspaceIntegration';

/** The event kinds the workspace trigger contract accepts, as Fabric `eventType` strings. */
export const FABRIC_WORKSPACE_EVENT_TYPES: readonly string[] = [
  'document.created',
  'document.saved',
  'task.changed',
  'vault.entry',
];

/** How many recorded events a document may carry. Refuse above this, never truncate silently. */
export const MAX_FABRIC_EVENTS = 64;
/** Bound for one payload, so a recorded envelope cannot be the thing that makes the doc unreadable. */
export const MAX_FABRIC_PAYLOAD_ITEMS = 64;
export const MAX_FABRIC_PAYLOAD_TEXT = 4096;

export class AutomateFabricError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AutomateFabricError';
  }
}

/** The recorded log, oldest first. Absent means empty — an older document is not an error. */
export function flowFabricEvents(model: Pick<AutomateDocumentModel, 'fabricEvents'>): FabricAutomationEvent[] {
  return model.fabricEvents ? [...model.fabricEvents] : [];
}

/** Bound a payload so a single event cannot blow the document budget. Refuses, never truncates. */
function assertBoundedPayload(payload: JsonValue): void {
  const seen: JsonValue[] = [payload];
  let text = 0;
  let count = 0;
  while (seen.length > 0) {
    const value = seen.pop() as JsonValue;
    count += 1;
    if (count > MAX_FABRIC_PAYLOAD_ITEMS * 4) throw new AutomateFabricError('fabric-payload-boundary');
    if (typeof value === 'string') {
      text += value.length;
      if (text > MAX_FABRIC_PAYLOAD_TEXT) throw new AutomateFabricError('fabric-payload-boundary');
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_FABRIC_PAYLOAD_ITEMS) throw new AutomateFabricError('fabric-payload-boundary');
      seen.push(...value);
      continue;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length > MAX_FABRIC_PAYLOAD_ITEMS) throw new AutomateFabricError('fabric-payload-boundary');
      seen.push(...entries.map(([, entry]) => entry as JsonValue));
    }
  }
}

/**
 * Validate an observed workspace event with the Fabric contract and record it.
 *
 * The validation is `createFabricAutomationEvent`'s — the single definition of a well-formed envelope.
 * This function adds only what that contract cannot know: the event KIND must be one the workspace
 * trigger accepts, and the log must stay inside its bound.
 */
export function recordFabricEvent(
  model: AutomateDocumentModel,
  input: { eventId: string; eventType: string; objectRef: string; objectVersion: number; occurredAt: number; payload: JsonValue },
): AutomateDocumentModel {
  if (!FABRIC_WORKSPACE_EVENT_TYPES.includes(input.eventType)) throw new AutomateFabricError('fabric-event-type-unsupported');
  assertBoundedPayload(input.payload);
  const existing = flowFabricEvents(model);
  if (existing.some((event) => event.eventId === input.eventId)) throw new AutomateFabricError('fabric-event-duplicate');
  if (existing.length >= MAX_FABRIC_EVENTS) throw new AutomateFabricError('fabric-event-log-boundary');
  // Throws `fabric-event-invalid` when the envelope is malformed. Nothing is stored on refusal.
  const event = createFabricAutomationEvent(input);
  return { ...model, fabricEvents: [...existing, event] };
}

/** The `workspace-event` triggers of a flow, as their accepted eventType values. */
export function acceptedWorkspaceEvents(model: Pick<AutomateDocumentModel, 'nodes'>): string[] {
  const accepted = new Set<string>();
  for (const node of model.nodes) {
    if (node.type !== 'trigger') continue;
    const config = node.config as Record<string, unknown>;
    if (config.triggerKind !== 'workspace-event') continue;
    if (typeof config.event === 'string') accepted.add(config.event);
  }
  return [...accepted].sort();
}

/**
 * Would this flow's trigger accept the recorded event?
 * Returns the matching trigger node ids — empty means the event is recorded but nothing in this flow
 * listens for it, which is a fact the inbox must be able to state.
 */
export function matchingTriggerNodeIds(
  model: Pick<AutomateDocumentModel, 'nodes'>,
  event: Pick<FabricAutomationEvent, 'eventType'>,
): string[] {
  return model.nodes
    .filter((node) => {
      if (node.type !== 'trigger') return false;
      const config = node.config as Record<string, unknown>;
      return config.triggerKind === 'workspace-event' && config.event === event.eventType;
    })
    .map((node) => node.id);
}

/** What the inbox may claim about a recorded event. `delivered` is always false: nothing dispatches. */
export function describeEventDelivery(
  model: Pick<AutomateDocumentModel, 'nodes'>,
  event: Pick<FabricAutomationEvent, 'eventType'>,
): { recorded: true; matchedTriggerIds: string[]; delivered: false } {
  return { recorded: true, matchedTriggerIds: matchingTriggerNodeIds(model, event), delivered: false };
}

/** Re-exported so a caller can catch Fabric refusals from this module's API with one import. */
export { AutomateIntegrationError };
