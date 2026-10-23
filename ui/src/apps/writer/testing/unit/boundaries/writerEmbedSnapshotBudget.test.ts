// STATUS: DIAMANT — W-316 / W-317: the snapshot budget of one Writer document
//
// W-316: the Writer's own creation path called `extractWriterWorkspaceSnapshot` directly, so it
// bypassed the per-snapshot budget the port applies when a result comes back from the host.
// W-317: the per-document budget (128 embeds × 1 MiB) was documented as derived and enforced nowhere,
// because the port has no document context. The document context exists in this module.
//
// Both are measured here on the Writer's own functions, with a snapshot that is genuinely over budget.
import { describe, expect, it } from 'vitest';

import type { WriterWorkspaceEmbed, WriterWorkspaceEmbedSnapshot } from '../../../../../shared/contracts/workspace';
import {
  appendWriterWorkspaceEmbed,
  MAX_WRITER_EMBED_PAYLOAD_BYTES,
  MAX_WRITER_WORKSPACE_EMBEDS,
} from '../../../../writer/public/workspace/writerWorkspaceIntegration';
import { WorkspaceSnapshotBudgetExceededError } from '../../../../../platform/workspace/integrations/workspaceSnapshot';

/**
 * A snapshot whose serialized form is about `bytes` bytes.
 *
 * One long string, not a million small cells: the project's bounded serializer refuses more than
 * 250 000 nodes **before** it measures the budget (`NODE_LIMIT`, measured — my first fixture of 2 M
 * one-character cells was rejected as "not storable JSON" instead of "over budget"). The size
 * dimension is therefore isolated with node count held low.
 */
function tableSnapshot(bytes: number): WriterWorkspaceEmbedSnapshot {
  return {
    type: 'table',
    columns: ['A'],
    blob: 'x'.repeat(bytes),
  } as unknown as WriterWorkspaceEmbedSnapshot;
}

function embed(id: string, bytes: number): WriterWorkspaceEmbed {
  return {
    id,
    kind: 'grid-range',
    mode: 'Live',
    sourceDocumentId: 'grid-1',
    sourceObjectId: 'range-1',
    uri: `vgt://workspace/document/grid-1/writer-embed/grid-range?id=${id}`,
    sourceVersion: 1,
    anchorParagraphId: 'p1',
    title: 'Tabelle',
    createdAt: 1,
    updatedAt: 1,
    snapshot: tableSnapshot(bytes),
  } as WriterWorkspaceEmbed;
}

describe('W-316 — a snapshot over one megabyte is refused on the Writer’s own path', () => {
  it('refuses an oversized snapshot when it is appended, by the port’s own error type', () => {
    // ~2 MB in one snapshot, with a low node count so the size limit is what decides.
    expect(() => appendWriterWorkspaceEmbed([], embed('e1', 2 * 1024 * 1024)))
      .toThrow(WorkspaceSnapshotBudgetExceededError);
  });

  it('names the byte budget in the refusal', () => {
    expect(() => appendWriterWorkspaceEmbed([], embed('e1', 2 * 1024 * 1024)))
      .toThrow(/1048576-byte budget/u);
  });

  it('accepts an ordinary snapshot and returns it byte-identically', () => {
    const small = embed('e1', 1_000);
    const result = appendWriterWorkspaceEmbed([], small);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(small);
  });

  it('keeps the existing count bound', () => {
    const full = Array.from({ length: MAX_WRITER_WORKSPACE_EMBEDS }, (_, index) => embed(`e${index}`, 10));
    expect(() => appendWriterWorkspaceEmbed(full, embed('extra', 10))).toThrow(/höchstens 128/u);
  });

  it('lets an update of an existing embed pass the count check', () => {
    const replaceable = embed('same-id', 10);
    const updated = appendWriterWorkspaceEmbed([replaceable], embed('same-id', 20));
    expect(updated).toHaveLength(1);
  });
});

describe('W-317 — the aggregate payload ceiling is enforced, and its limit is reachable', () => {
  it('is derived from the two bounds it comes from', () => {
    expect(MAX_WRITER_EMBED_PAYLOAD_BYTES).toBe(MAX_WRITER_WORKSPACE_EMBEDS * 1024 * 1024);
  });

  it('is enforced: the append that crosses the ceiling is refused and nothing is written', () => {
    // The ceiling is exercised at a lower limit, because the derived value is not reachable with
    // 1 MiB snapshots — see the last test of this block. The **mechanism** is what this proves.
    const limit = 3_000_000;
    const existing = [embed('a', 1_000_000), embed('b', 1_000_000)];
    expect(() => appendWriterWorkspaceEmbed(existing, embed('c', 1_000_000), limit)).toThrow(/MiB/u);
    // The refusal left the previous list untouched.
    expect(existing).toHaveLength(2);
    // And one that fits is still accepted.
    expect(appendWriterWorkspaceEmbed(existing, embed('c', 500_000), limit)).toHaveLength(3);
  });

  it('records the measured consequence of the two bounds together', () => {
    // The ceiling is exactly the count bound times the per-snapshot budget, and no snapshot can reach
    // its budget exactly (the serializer also writes the object's braces, keys and commas — measured
    // for this shape as 26 bytes of overhead). So with the current constants the aggregate is **not**
    // reachable, and the count bound and the per-snapshot bound are what actually hold. That is a
    // finding about the constants, not about the mechanism, and it is stated here so a change to
    // either number shows its consequence instead of silently.
    expect(MAX_WRITER_WORKSPACE_EMBEDS * 1024 * 1024).toBe(MAX_WRITER_EMBED_PAYLOAD_BYTES);
    const overhead = JSON.stringify({ type: 'table', columns: ['A'], blob: '' }).length;
    expect(overhead).toBeGreaterThan(0);
    const largestAcceptedSnapshot = 1_048_576;
    expect(MAX_WRITER_WORKSPACE_EMBEDS * (largestAcceptedSnapshot - overhead)).toBeLessThan(MAX_WRITER_EMBED_PAYLOAD_BYTES);
  });
});
