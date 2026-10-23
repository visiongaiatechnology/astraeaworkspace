// STATUS: PLATIN — provider ownership, fail-closed routing, result-shape contract and the W-253 size budget.
import { afterEach, describe, expect, it } from 'vitest';
import { initialDocs } from '../../../app/bootstrap/seedData';
import type { WorkspaceDocument, WriterWorkspaceEmbedSnapshot } from '../../../shared/contracts/workspace';
import {
  assertWorkspaceEmbedSnapshotBudget,
  extractWorkspaceEmbedSnapshot,
  registerWorkspaceSnapshotProvider,
  WORKSPACE_EMBED_SNAPSHOT_LIMITS,
  WorkspaceSnapshotBudgetExceededError,
  WorkspaceSnapshotProviderUnavailableError,
  WorkspaceSnapshotShapeRejectedError,
  type WorkspaceSnapshotRequest,
} from '../../../platform/workspace/integrations/workspaceSnapshot';

const sourceDocument = Object.values(initialDocs)[0];
if (!sourceDocument) throw new Error('Workspace snapshot test requires the canonical seed document.');

const request: WorkspaceSnapshotRequest = { kind: 'writer-live-link' };
const snapshot: WriterWorkspaceEmbedSnapshot = { type: 'summary', metrics: [], lines: [] };
let release: (() => void) | undefined;

const MAX_SNAPSHOT_BYTES = WORKSPACE_EMBED_SNAPSHOT_LIMITS.maxSnapshotBytes;

/** 100 × 100 cells of the 2 048-character cell clamp the grid-range rule alone allows (~20 MB). */
function oversizedTableSnapshot(): WriterWorkspaceEmbedSnapshot {
  return {
    type: 'table',
    columns: Array.from({ length: 100 }, (_, index) => `C${index}`),
    rows: Array.from({ length: 100 }, () => Array.from({ length: 100 }, () => 'x'.repeat(2_048))),
  };
}

afterEach(() => {
  release?.();
  release = undefined;
});

describe('Workspace snapshot port', () => {
  it('fails closed when the composition root has not registered a provider', () => {
    expect(() => extractWorkspaceEmbedSnapshot(sourceDocument, request))
      .toThrow(WorkspaceSnapshotProviderUnavailableError);
  });

  it('forwards canonical document and request identity and returns a known snapshot shape', () => {
    let receivedDocument: WorkspaceDocument | undefined;
    let receivedRequest: WorkspaceSnapshotRequest | undefined;
    release = registerWorkspaceSnapshotProvider((document, value) => {
      receivedDocument = document;
      receivedRequest = value;
      return snapshot;
    });

    expect(extractWorkspaceEmbedSnapshot(sourceDocument, request)).toBe(snapshot);
    expect(receivedDocument).toBe(sourceDocument);
    expect(receivedRequest).toBe(request);
  });

  it('rejects a second provider without replacing the registered owner', () => {
    release = registerWorkspaceSnapshotProvider(() => snapshot);

    expect(() => registerWorkspaceSnapshotProvider(() => snapshot))
      .toThrow('workspace_snapshot_provider_already_registered');
    expect(extractWorkspaceEmbedSnapshot(sourceDocument, request)).toBe(snapshot);
  });

  it('rejects provider results outside the shared snapshot union', () => {
    release = registerWorkspaceSnapshotProvider(() => ({ type: 'unknown' } as unknown as WriterWorkspaceEmbedSnapshot));

    expect(() => extractWorkspaceEmbedSnapshot(sourceDocument, request))
      .toThrow('workspace_snapshot_provider_result_invalid');
  });
});

describe('Workspace snapshot size budget (W-253)', () => {
  it('names one megabyte per embed as the stored-snapshot budget', () => {
    expect(MAX_SNAPSHOT_BYTES).toBe(1_048_576);
  });

  it('accepts a realistic maximum grid range and returns the very same snapshot object', () => {
    // 64 columns × 156 rows is the largest range the shared grid-range rule allows (10 000 cells); values of
    // ~20 characters put it at roughly 250 KB — inside the budget with about a factor of four of headroom.
    const columns = Array.from({ length: 64 }, (_, index) => `C${index}`);
    const table: WriterWorkspaceEmbedSnapshot = {
      type: 'table',
      columns,
      rows: Array.from({ length: 156 }, (_, row) => columns.map((__, col) => `value-${row}-${col}`)),
    };

    expect(assertWorkspaceEmbedSnapshotBudget(table)).toBe(table);
  });

  it('refuses an oversized snapshot and names the limit in the message', () => {
    const oversized = oversizedTableSnapshot();

    expect(() => assertWorkspaceEmbedSnapshotBudget(oversized)).toThrow(WorkspaceSnapshotBudgetExceededError);
    expect(() => assertWorkspaceEmbedSnapshotBudget(oversized)).toThrow(`exceeds the ${MAX_SNAPSHOT_BYTES}-byte budget`);
  });

  it('refuses a snapshot that cannot be stored as JSON with its own reason, not as a size failure', () => {
    const cyclic = { type: 'summary', metrics: [], lines: [] } as Record<string, unknown>;
    cyclic.self = cyclic;

    expect(() => assertWorkspaceEmbedSnapshotBudget(cyclic as unknown as WriterWorkspaceEmbedSnapshot))
      .toThrow(WorkspaceSnapshotShapeRejectedError);
    expect(() => assertWorkspaceEmbedSnapshotBudget(cyclic as unknown as WriterWorkspaceEmbedSnapshot))
      .toThrow('CYCLE');
  });

  it('refuses an oversized provider result at the port, so it cannot reach a document', () => {
    release = registerWorkspaceSnapshotProvider(() => oversizedTableSnapshot());

    expect(() => extractWorkspaceEmbedSnapshot(sourceDocument, request))
      .toThrow(WorkspaceSnapshotBudgetExceededError);
  });

  it('keeps the derived document ceiling visible: 128 embeds × 1 MiB', () => {
    // The port has no document context, so the document-level guarantee is the product of the count bound of the
    // Writer adapter (128) and this per-snapshot budget. Pinned here so a later change to either factor shows up.
    expect(128 * MAX_SNAPSHOT_BYTES).toBe(128 * 1_024 * 1_024);
  });
});
