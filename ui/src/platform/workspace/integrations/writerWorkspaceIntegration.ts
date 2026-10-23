// STATUS: PLATIN — fail-closed app-neutral contract for Writer workspace operations.
import type {
  WriterWorkspaceEmbed,
  WriterWorkspaceEmbedKind,
  WriterWorkspaceEmbedMode,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import { assertWorkspaceEmbedSnapshotBudget } from './workspaceSnapshot';

const MAX_WRITER_WORKSPACE_EMBEDS = 128;
const SNAPSHOT_TYPES: ReadonlySet<string> = new Set([
  'table', 'chart', 'summary', 'timeline', 'slide', 'frame', 'pdf-page', 'pdf-annotation', 'vault-asset',
]);
const EMBED_KINDS: ReadonlySet<string> = new Set([
  'writer-live-link', 'grid-range', 'grid-chart', 'writer-local-chart', 'task-list', 'task-kpi',
  'whiteboard-frame', 'present-slide', 'pdf-page', 'pdf-annotation', 'vault-asset',
]);

export interface CreateWriterWorkspaceEmbedRequest {
  writerDocument: WorkspaceDocument;
  sourceDocument: WorkspaceDocument;
  kind: WriterWorkspaceEmbedKind;
  mode: WriterWorkspaceEmbedMode;
  anchorParagraphId: string;
  sourceObjectId?: string;
  sourceSelector?: string;
  id?: string;
  now?: number;
}

export interface WriterWorkspaceIntegrationHost {
  createEmbed(request: CreateWriterWorkspaceEmbedRequest): WriterWorkspaceEmbed;
  appendEmbed(embeds: readonly WriterWorkspaceEmbed[], embed: WriterWorkspaceEmbed): WriterWorkspaceEmbed[];
}

export class WriterWorkspaceIntegrationHostUnavailableError extends Error {
  constructor() {
    super('writer_workspace_integration_host_unavailable');
    this.name = 'WriterWorkspaceIntegrationHostUnavailableError';
  }
}

let activeHost: WriterWorkspaceIntegrationHost | undefined;
let activeRegistration: symbol | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number, required = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (!required || value.length > 0);
}

function validateDocument(document: WorkspaceDocument, expectedKind?: string): void {
  const candidate: unknown = document;
  if (!isRecord(candidate)
    || (expectedKind !== undefined && candidate.kind !== expectedKind)
    || !boundedText(candidate.id, 512, true)
    || typeof candidate.version !== 'number' || !Number.isSafeInteger(candidate.version) || candidate.version < 0
    || !boundedText(candidate.title, 4_096)) {
    throw new TypeError('writer_workspace_integration_document_invalid');
  }
}

function validateCreateRequest(request: CreateWriterWorkspaceEmbedRequest): void {
  const candidate: unknown = request;
  if (!isRecord(candidate) || !candidate.writerDocument || !candidate.sourceDocument
    || typeof candidate.kind !== 'string' || !EMBED_KINDS.has(candidate.kind)
    || (candidate.mode !== 'Live' && candidate.mode !== 'Snapshot')
    || !boundedText(candidate.anchorParagraphId, 512, true)
    || (candidate.sourceObjectId !== undefined && !boundedText(candidate.sourceObjectId, 512, true))
    || (candidate.sourceSelector !== undefined && !boundedText(candidate.sourceSelector, 2_048, true))
    || (candidate.id !== undefined && !boundedText(candidate.id, 512, true))
    || (candidate.now !== undefined && (typeof candidate.now !== 'number' || !Number.isFinite(candidate.now) || candidate.now < 0))) {
    throw new TypeError('writer_workspace_integration_request_invalid');
  }
  validateDocument(candidate.writerDocument as WorkspaceDocument, 'Writer');
  validateDocument(candidate.sourceDocument as WorkspaceDocument);
}

function validateEmbedResult(
  value: unknown,
  request: CreateWriterWorkspaceEmbedRequest,
): WriterWorkspaceEmbed {
  if (!isRecord(value)) throw new TypeError('writer_workspace_integration_result_invalid');
  const snapshot = value.snapshot;
  if (!boundedText(value.id, 512, true)
    || (request.id !== undefined && value.id !== request.id)
    || value.kind !== request.kind || value.mode !== request.mode
    || value.sourceDocumentId !== request.sourceDocument.id
    || value.sourceObjectId !== request.sourceObjectId || value.sourceSelector !== request.sourceSelector
    || value.sourceVersion !== request.sourceDocument.version
    || value.anchorParagraphId !== request.anchorParagraphId
    || !boundedText(value.uri, 2_048, true) || !boundedText(value.title, 512)
    || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)
    || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
    || !isRecord(snapshot) || typeof snapshot.type !== 'string' || !SNAPSHOT_TYPES.has(snapshot.type)) {
    throw new TypeError('writer_workspace_integration_result_invalid');
  }
  // W-253: the count was bounded, the size of the payload was not. Bounding the snapshot here keeps the public
  // signatures of this module unchanged, so no Writer file has to change for the bound to take effect.
  // (`snapshot` is a `Record<string, unknown>` here, hence the double assertion — `tsc` caught the single one.)
  assertWorkspaceEmbedSnapshotBudget(snapshot as unknown as WriterWorkspaceEmbed['snapshot']);
  return value as unknown as WriterWorkspaceEmbed;
}

function requireHost(): WriterWorkspaceIntegrationHost {
  if (!activeHost) throw new WriterWorkspaceIntegrationHostUnavailableError();
  return activeHost;
}

export function registerWriterWorkspaceIntegrationHost(host: WriterWorkspaceIntegrationHost): () => void {
  if (!host || typeof host !== 'object'
    || typeof host.createEmbed !== 'function'
    || typeof host.appendEmbed !== 'function'
) {
    throw new TypeError('writer_workspace_integration_host_invalid');
  }
  if (activeHost) throw new Error('writer_workspace_integration_host_already_registered');

  const registration = Symbol('writer-workspace-integration-host');
  activeHost = host;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeHost = undefined;
    activeRegistration = undefined;
  };
}

export function createWriterWorkspaceEmbed(request: CreateWriterWorkspaceEmbedRequest): WriterWorkspaceEmbed {
  validateCreateRequest(request);
  return validateEmbedResult(requireHost().createEmbed(request), request);
}

export function appendWriterWorkspaceEmbed(
  embeds: readonly WriterWorkspaceEmbed[],
  embed: WriterWorkspaceEmbed,
): WriterWorkspaceEmbed[] {
  if (!Array.isArray(embeds) || embeds.length > MAX_WRITER_WORKSPACE_EMBEDS
    || !embed || typeof embed !== 'object' || !boundedText(embed.id, 512, true)
    || typeof embed.kind !== 'string' || !EMBED_KINDS.has(embed.kind)) {
    throw new TypeError('writer_workspace_integration_append_request_invalid');
  }
  // W-253 as well: an embed that reaches the document through the append path is measured by the same budget.
  if (isRecord(embed.snapshot)) assertWorkspaceEmbedSnapshotBudget(embed.snapshot as WriterWorkspaceEmbed['snapshot']);
  const result = requireHost().appendEmbed(embeds, embed);
  if (!Array.isArray(result) || result.length > MAX_WRITER_WORKSPACE_EMBEDS
    || result.at(-1)?.id !== embed.id) {
    throw new TypeError('writer_workspace_integration_append_result_invalid');
  }
  return result;
}

