// STATUS: DIAMANT VGT SUPREME — app-neutral, fail-closed Workspace snapshot port.
import type {
  WriterWorkspaceEmbedKind,
  WriterWorkspaceEmbedSnapshot,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import { BoundedJsonSerializationError, stringifyJsonWithinUtf8ByteLimit } from '../../diagnostics/boundedJsonStringify';

export interface WorkspaceSnapshotRequest {
  kind: WriterWorkspaceEmbedKind;
  sourceObjectId?: string;
  sourceSelector?: string;
  retainedWriterCommentIds?: readonly string[];
}

export type WorkspaceSnapshotProvider = (
  document: WorkspaceDocument,
  request: WorkspaceSnapshotRequest,
) => WriterWorkspaceEmbedSnapshot;

const SNAPSHOT_TYPES: ReadonlySet<string> = new Set([
  'table', 'chart', 'summary', 'timeline', 'slide', 'frame', 'pdf-page', 'pdf-annotation', 'vault-asset', 'space-context',
]);

/**
 * W-253: measured before this bound existed — the count of embeds was capped (128) and the **size of one snapshot
 * was not**, although a snapshot is stored inline in the document. The `grid-range` extractor alone may legally
 * return 10 000 cells whose text is clamped at 2 048 characters each, so one embed could carry ~20 MB and 128 of
 * them ~2.5 GB into a document that is otherwise a word-processing file.
 *
 * The ceiling is one megabyte per snapshot, measured **as stored** (serialized JSON, UTF-8) with the project's
 * single bounded serializer, which streams and aborts at the budget instead of building the oversized string
 * first. For scale: a realistic maximum grid range (64 × 156 cells of ~20-character values) is ~250 KB, and the
 * largest chart snapshot (64 series × 512 values, plus the canonical chart copy) is ~400 KB — so ordinary work
 * keeps a factor of ~4 of headroom, while a 20 MB dump is refused by name rather than absorbed.
 *
 * Derived invariant, not enforced here because the port has no document context: with the existing count bound
 * of 128 embeds, the port-mediated payload of one document is at most 128 MiB.
 */
export const WORKSPACE_EMBED_SNAPSHOT_LIMITS = Object.freeze({
  /** Serialized UTF-8 bytes of one embed snapshot. */
  maxSnapshotBytes: 1_048_576,
});

export class WorkspaceSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceSnapshotError';
  }
}

/** The snapshot is larger than one embed may carry. Concrete on purpose: the message names the byte budget. */
export class WorkspaceSnapshotBudgetExceededError extends WorkspaceSnapshotError {
  constructor(readonly maxBytes: number) {
    super(`Workspace snapshot exceeds the ${maxBytes}-byte budget for one embed.`);
    this.name = 'WorkspaceSnapshotBudgetExceededError';
  }
}

/** The snapshot is not storable as plain JSON (depth, node count, cycle, accessor, unsupported value). */
export class WorkspaceSnapshotShapeRejectedError extends WorkspaceSnapshotError {
  constructor(readonly code: BoundedJsonSerializationError['code']) {
    super(`Workspace snapshot is not storable JSON (${code}).`);
    this.name = 'WorkspaceSnapshotShapeRejectedError';
  }
}

/**
 * Measures a snapshot the way it will be stored and returns it unchanged, so a caller can wrap a value in place.
 * Both refusals are typed and derive from `WorkspaceSnapshotError`, so every existing catch site keeps working.
 */
export function assertWorkspaceEmbedSnapshotBudget(
  snapshot: WriterWorkspaceEmbedSnapshot,
  maxBytes: number = WORKSPACE_EMBED_SNAPSHOT_LIMITS.maxSnapshotBytes,
): WriterWorkspaceEmbedSnapshot {
  try {
    stringifyJsonWithinUtf8ByteLimit(snapshot, maxBytes);
  } catch (error) {
    if (error instanceof BoundedJsonSerializationError) {
      throw error.code === 'SIZE_LIMIT'
        ? new WorkspaceSnapshotBudgetExceededError(maxBytes)
        : new WorkspaceSnapshotShapeRejectedError(error.code);
    }
    throw error;
  }
  return snapshot;
}

export class WorkspaceSnapshotProviderUnavailableError extends WorkspaceSnapshotError {
  constructor() {
    super('Workspace snapshot service is not available.');
    this.name = 'WorkspaceSnapshotProviderUnavailableError';
  }
}

let activeProvider: WorkspaceSnapshotProvider | undefined;
let activeRegistration: symbol | undefined;

export function registerWorkspaceSnapshotProvider(provider: WorkspaceSnapshotProvider): () => void {
  if (typeof provider !== 'function') throw new TypeError('workspace_snapshot_provider_invalid');
  if (activeProvider) throw new Error('workspace_snapshot_provider_already_registered');

  const registration = Symbol('workspace-snapshot-provider');
  activeProvider = provider;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeProvider = undefined;
    activeRegistration = undefined;
  };
}

export function extractWorkspaceEmbedSnapshot(
  document: WorkspaceDocument,
  request: WorkspaceSnapshotRequest,
): WriterWorkspaceEmbedSnapshot {
  const provider = activeProvider;
  if (!provider) throw new WorkspaceSnapshotProviderUnavailableError();
  const snapshot: unknown = provider(document, request);
  if (!snapshot || typeof snapshot !== 'object' || !('type' in snapshot)
    || typeof snapshot.type !== 'string' || !SNAPSHOT_TYPES.has(snapshot.type)) {
    throw new TypeError('workspace_snapshot_provider_result_invalid');
  }
  return assertWorkspaceEmbedSnapshotBudget(snapshot as WriterWorkspaceEmbedSnapshot);
}
