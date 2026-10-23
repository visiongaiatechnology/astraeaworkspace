// STATUS: PLATIN — bounded metadata projection for lazy Writer workspace sources.
import type { DocumentKind, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { WriterWorkspaceSourceMetadata } from '../../types';

export interface WriterWorkspaceSourceCandidate {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly title: string;
  readonly isOpen: boolean;
}

/** Whether the projection had to stop at the ceiling (W-262). */
export interface WriterWorkspaceSourceProjection {
  readonly candidates: WriterWorkspaceSourceCandidate[];
  readonly truncated: boolean;
}

const WRITER_INTEGRATION_KINDS: ReadonlySet<DocumentKind> = new Set([
  'Grid', 'Tasks', 'Whiteboard', 'Draw', 'Present', 'PdfStudio', 'Vault',
]);

/**
 * The most candidates the source picker offers (W-262).
 *
 * The list was unbounded: every stored workspace document of an integrable kind became a row, so a
 * workspace with thousands of documents produced a dialog that grew with the workspace and could not
 * be scanned. The order is deterministic — open documents first, each group in the order it arrived —
 * so the same workspace always yields the same first 128 rows.
 */
export const MAX_WRITER_WORKSPACE_SOURCE_CANDIDATES = 128;

export function projectWriterWorkspaceSourceCandidates(
  writerDocumentId: string,
  openDocuments: readonly WorkspaceDocument[],
  storedDocuments: readonly WriterWorkspaceSourceMetadata[],
  limit: number = MAX_WRITER_WORKSPACE_SOURCE_CANDIDATES,
): WriterWorkspaceSourceCandidate[] {
  return projectWriterWorkspaceSources(writerDocumentId, openDocuments, storedDocuments, limit).candidates;
}

/**
 * The candidates **and** whether the ceiling cut the list short (W-262).
 *
 * The picker needs both: a silent cut would look like "these are all your documents". The flag is what
 * lets the surface say so.
 */
export function projectWriterWorkspaceSources(
  writerDocumentId: string,
  openDocuments: readonly WorkspaceDocument[],
  storedDocuments: readonly WriterWorkspaceSourceMetadata[],
  limit: number = MAX_WRITER_WORKSPACE_SOURCE_CANDIDATES,
): WriterWorkspaceSourceProjection {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : MAX_WRITER_WORKSPACE_SOURCE_CANDIDATES;
  const candidates = new Map<string, WriterWorkspaceSourceCandidate>();
  for (const document of openDocuments) {
    if (document.id === writerDocumentId || !WRITER_INTEGRATION_KINDS.has(document.kind)) continue;
    candidates.set(document.id, {
      id: document.id,
      kind: document.kind,
      title: document.title,
      isOpen: true,
    });
  }
  for (const document of storedDocuments) {
    if (document.id === writerDocumentId || candidates.has(document.id) || !WRITER_INTEGRATION_KINDS.has(document.kind)) continue;
    candidates.set(document.id, {
      id: document.id,
      kind: document.kind,
      title: document.title,
      isOpen: false,
    });
  }
  const all = [...candidates.values()];
  return all.length <= boundedLimit
    ? { candidates: all, truncated: false }
    : { candidates: all.slice(0, boundedLimit), truncated: true };
}
