// STATUS: PLATIN — Strict, byte-bounded parser for untrusted semantic drag payloads.
import { assertStableWorkspaceId } from '../../platform/workspace/model/workspaceObjectModel';
import {
  WORKSPACE_DRAG_PAYLOAD_MAX_BYTES,
  WORKSPACE_DRAG_PAYLOAD_SCHEMA,
  WORKSPACE_DRAG_PAYLOAD_VERSION,
  WorkspaceInteractionError,
  isWorkspaceDocumentKind,
  isWorkspaceDropIntent,
  isWorkspaceObjectKind,
  type WorkspaceDragPayload,
  type WorkspaceDropIntent,
  type WorkspaceObjectDescriptor,
} from './workspaceInteractionTypes';

const PAYLOAD_KEYS = ['schema', 'version', 'descriptor'] as const;
const DESCRIPTOR_KEYS = ['documentId', 'objectId', 'objectKind', 'sourceApp', 'supportedIntents'] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function validateIdentifier(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    assertStableWorkspaceId(value, 'Workspace interaction id');
    return true;
  } catch {
    return false;
  }
}

function normalizeDescriptor(value: unknown): WorkspaceObjectDescriptor {
  if (!isPlainRecord(value) || !hasExactKeys(value, DESCRIPTOR_KEYS)) {
    throw new WorkspaceInteractionError('payload_invalid');
  }
  if (!validateIdentifier(value.documentId) || !validateIdentifier(value.objectId)) {
    throw new WorkspaceInteractionError('identifier_invalid');
  }
  if (!isWorkspaceObjectKind(value.objectKind)) throw new WorkspaceInteractionError('object_kind_unknown');
  if (!isWorkspaceDocumentKind(value.sourceApp)) throw new WorkspaceInteractionError('app_unknown');
  if (!Array.isArray(value.supportedIntents) || value.supportedIntents.length === 0 || value.supportedIntents.length > 4) {
    throw new WorkspaceInteractionError('payload_invalid');
  }
  const intents: WorkspaceDropIntent[] = [];
  for (const item of value.supportedIntents as unknown[]) {
    if (!isWorkspaceDropIntent(item)) throw new WorkspaceInteractionError('intent_unknown');
    if (intents.includes(item)) throw new WorkspaceInteractionError('payload_invalid');
    intents.push(item);
  }
  return Object.freeze({
    documentId: value.documentId,
    objectId: value.objectId,
    objectKind: value.objectKind,
    sourceApp: value.sourceApp,
    supportedIntents: Object.freeze(intents),
  });
}

export function createWorkspaceDragPayload(descriptor: unknown): WorkspaceDragPayload {
  return Object.freeze({
    schema: WORKSPACE_DRAG_PAYLOAD_SCHEMA,
    version: WORKSPACE_DRAG_PAYLOAD_VERSION,
    descriptor: normalizeDescriptor(descriptor),
  });
}

export function serializeWorkspaceDragPayload(payload: unknown): string {
  if (!isPlainRecord(payload) || !hasExactKeys(payload, PAYLOAD_KEYS)) {
    throw new WorkspaceInteractionError('payload_invalid');
  }
  if (payload.schema !== WORKSPACE_DRAG_PAYLOAD_SCHEMA) throw new WorkspaceInteractionError('payload_invalid');
  if (payload.version !== WORKSPACE_DRAG_PAYLOAD_VERSION) throw new WorkspaceInteractionError('payload_version_unsupported');
  const normalized = createWorkspaceDragPayload(payload.descriptor);
  const serialized = JSON.stringify(normalized);
  if (new TextEncoder().encode(serialized).byteLength > WORKSPACE_DRAG_PAYLOAD_MAX_BYTES) {
    throw new WorkspaceInteractionError('payload_too_large');
  }
  return serialized;
}

export function parseWorkspaceDragPayload(serialized: string): WorkspaceDragPayload {
  if (typeof serialized !== 'string') throw new WorkspaceInteractionError('payload_invalid');
  if (serialized.length > WORKSPACE_DRAG_PAYLOAD_MAX_BYTES) throw new WorkspaceInteractionError('payload_too_large');
  if (new TextEncoder().encode(serialized).byteLength > WORKSPACE_DRAG_PAYLOAD_MAX_BYTES) {
    throw new WorkspaceInteractionError('payload_too_large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new WorkspaceInteractionError('payload_invalid');
  }
  if (!isPlainRecord(parsed) || !hasExactKeys(parsed, PAYLOAD_KEYS)) {
    throw new WorkspaceInteractionError('payload_invalid');
  }
  if (parsed.schema !== WORKSPACE_DRAG_PAYLOAD_SCHEMA) throw new WorkspaceInteractionError('payload_invalid');
  if (parsed.version !== WORKSPACE_DRAG_PAYLOAD_VERSION) throw new WorkspaceInteractionError('payload_version_unsupported');
  return createWorkspaceDragPayload(parsed.descriptor);
}
