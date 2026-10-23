// STATUS: PLATIN — fail-closed app-neutral contract for bounded Present workspace projection.
import type {
  PresentWorkspaceIntegrationKind,
  PresentWorkspaceSceneObject,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';

const INTEGRATION_KINDS: ReadonlySet<string> = new Set([
  'grid-range', 'grid-chart', 'grid-kpi', 'project-timeline', 'task-list', 'task-kpi',
  'project-milestone', 'database-table', 'database-chart', 'whiteboard-frame', 'writer-section',
  'pdf-page', 'forms-dashboard', 'vault-asset', 'space-context',
]);
const SNAPSHOT_TYPES: ReadonlySet<string> = new Set([
  'table', 'chart', 'summary', 'timeline', 'slide', 'frame', 'pdf-page', 'pdf-annotation',
  'vault-asset', 'space-context',
]);

export interface PresentWorkspaceIntegrationRequest {
  sourceDocument: WorkspaceDocument;
  integrationKind: PresentWorkspaceIntegrationKind;
  mode: 'Live' | 'Frozen';
  sourceObjectId?: string;
  sourceSelector?: string;
  title?: string;
}

export interface PresentWorkspaceIntegrationHost {
  createObject(request: PresentWorkspaceIntegrationRequest, id?: string): PresentWorkspaceSceneObject;
}

export class PresentWorkspaceIntegrationHostUnavailableError extends Error {
  constructor() {
    super('present_workspace_integration_host_unavailable');
    this.name = 'PresentWorkspaceIntegrationHostUnavailableError';
  }
}

let activeHost: PresentWorkspaceIntegrationHost | undefined;
let activeRegistration: symbol | undefined;

export function registerPresentWorkspaceIntegrationHost(host: PresentWorkspaceIntegrationHost): () => void {
  if (!host || typeof host !== 'object' || typeof host.createObject !== 'function') {
    throw new TypeError('present_workspace_integration_host_invalid');
  }
  if (activeHost) throw new Error('present_workspace_integration_host_already_registered');

  const registration = Symbol('present-workspace-integration-host');
  activeHost = host;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeHost = undefined;
    activeRegistration = undefined;
  };
}

function assertBoundedOptionalText(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== 'string' || value.length > 512)) {
    throw new TypeError(`present_workspace_integration_${field}_invalid`);
  }
}

function validateRequest(request: PresentWorkspaceIntegrationRequest): void {
  if (!request || typeof request !== 'object' || !request.sourceDocument || typeof request.sourceDocument !== 'object'
    || typeof request.sourceDocument.id !== 'string' || request.sourceDocument.id.length < 1 || request.sourceDocument.id.length > 192
    || !Number.isSafeInteger(request.sourceDocument.version) || request.sourceDocument.version < 0
    || typeof request.sourceDocument.title !== 'string' || request.sourceDocument.title.length > 512
    || typeof request.integrationKind !== 'string' || !INTEGRATION_KINDS.has(request.integrationKind)
    || (request.mode !== 'Live' && request.mode !== 'Frozen')) {
    throw new TypeError('present_workspace_integration_request_invalid');
  }
  assertBoundedOptionalText(request.sourceObjectId, 'source_object_id');
  assertBoundedOptionalText(request.sourceSelector, 'source_selector');
  assertBoundedOptionalText(request.title, 'title');
}

function validateResult(value: PresentWorkspaceSceneObject, request: PresentWorkspaceIntegrationRequest, requestedId?: string): PresentWorkspaceSceneObject {
  const candidate: unknown = value;
  if (!candidate || typeof candidate !== 'object') throw new TypeError('present_workspace_integration_result_invalid');
  const object = candidate as Partial<PresentWorkspaceSceneObject>;
  const snapshot: unknown = object.snapshot;
  if (object.kind !== 'workspace' || typeof object.id !== 'string' || object.id.length < 1 || object.id.length > 192
    || (requestedId !== undefined && object.id !== requestedId)
    || object.integrationKind !== request.integrationKind || object.mode !== request.mode
    || object.sourceDocumentId !== request.sourceDocument.id || object.sourceVersion !== request.sourceDocument.version
    || object.sourceObjectId !== request.sourceObjectId || object.sourceSelector !== request.sourceSelector
    || typeof object.uri !== 'string' || object.uri.length > 2_048
    || typeof object.title !== 'string' || object.title.length > 512
    || !snapshot || typeof snapshot !== 'object' || !('type' in snapshot)
    || typeof snapshot.type !== 'string' || !SNAPSHOT_TYPES.has(snapshot.type)) {
    throw new TypeError('present_workspace_integration_result_invalid');
  }
  return value;
}

export function createPresentWorkspaceIntegrationObject(
  request: PresentWorkspaceIntegrationRequest,
  id?: string,
): PresentWorkspaceSceneObject {
  validateRequest(request);
  if (id !== undefined && (typeof id !== 'string' || id.length < 1 || id.length > 192)) {
    throw new TypeError('present_workspace_integration_id_invalid');
  }
  const host = activeHost;
  if (!host) throw new PresentWorkspaceIntegrationHostUnavailableError();
  return validateResult(host.createObject(request, id), request, id);
}
