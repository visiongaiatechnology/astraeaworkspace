// STATUS: PLATIN — W-230: the three retention dimensions of a recovery snapshot series, measured.
//
// The register said "retention of the recovery snapshots (count, size, age) is not measured in this package".
// Measured before the fix: count (8) and bytes (`256 * 1024 * 1024`, inline in the function body) existed, and
// **age did not** — a crash marker from any past year stayed in the series until the next save of that document
// happened to clean it up. These tests pin all three dimensions, the boundary of the age decision, and the
// clamp that stops a caller from widening the policy.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECOVERY_RETENTION,
  normalizeRecoveryRetention,
  selectRecoveryRetention,
  VERSION_RECOVERY_LIMITS,
  type RecoveryRetentionCandidate,
} from '../../../platform/recovery/versionRecoveryEngine';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_750_000_000_000;

const snapshot = (id: string, ageDays: number, encryptedBytes: number): RecoveryRetentionCandidate => ({
  id,
  createdAt: NOW - ageDays * DAY_MS,
  encryptedBytes,
});

describe('recovery snapshot retention (W-230)', () => {
  it('names the count, the byte ceiling and the age bound in one policy', () => {
    expect(DEFAULT_RECOVERY_RETENTION).toEqual({
      maxCount: 8,
      maxAgeMs: 30 * DAY_MS,
      maxBytes: 256 * 1024 * 1024,
    });
    expect(VERSION_RECOVERY_LIMITS.maxRecoverySnapshotsPerDocument).toBe(DEFAULT_RECOVERY_RETENTION.maxCount);
    expect(VERSION_RECOVERY_LIMITS.maxRecoverySnapshotBytesPerDocument).toBe(DEFAULT_RECOVERY_RETENTION.maxBytes);
  });

  it('keeps the newest `maxCount` snapshots of one document and reports the retained bytes', () => {
    const records = Array.from({ length: 10 }, (_, index) => snapshot(`rec-${index}`, index, 1_024));
    const retention = selectRecoveryRetention(records, NOW);

    expect(retention.keep).toEqual(['rec-0', 'rec-1', 'rec-2', 'rec-3', 'rec-4', 'rec-5', 'rec-6', 'rec-7']);
    expect(retention.remove).toEqual(['rec-8', 'rec-9']);
    expect(retention.retainedBytes).toBe(8 * 1_024);
  });

  it('removes every snapshot older than the age bound and keeps the younger ones', () => {
    const retention = selectRecoveryRetention([
      snapshot('fresh', 0, 1_024),
      snapshot('yesterday', 1, 1_024),
      snapshot('ancient', 40, 1_024),
    ], NOW);

    expect(retention.keep).toEqual(['fresh', 'yesterday']);
    expect(retention.remove).toEqual(['ancient']);
  });

  it('treats exactly 30 days as still valid and one millisecond more as expired', () => {
    const boundary = [
      { id: 'exactly-30-days', createdAt: NOW - DEFAULT_RECOVERY_RETENTION.maxAgeMs, encryptedBytes: 1_024 },
      { id: 'one-ms-past', createdAt: NOW - DEFAULT_RECOVERY_RETENTION.maxAgeMs - 1, encryptedBytes: 1_024 },
    ];
    const retention = selectRecoveryRetention(boundary, NOW);

    expect(retention.keep).toEqual(['exactly-30-days']);
    expect(retention.remove).toEqual(['one-ms-past']);
  });

  it('does not expire a snapshot whose stamp lies in the future', () => {
    const retention = selectRecoveryRetention([snapshot('future', -5, 1_024)], NOW);
    expect(retention.keep).toEqual(['future']);
    expect(retention.remove).toEqual([]);
  });

  it('stops at the byte ceiling before the count is reached', () => {
    const sixHundredKiB = 600 * 1_024;
    const retention = selectRecoveryRetention([
      snapshot('newest', 0, sixHundredKiB),
      snapshot('second', 1, sixHundredKiB),
      snapshot('third', 2, sixHundredKiB),
    ], NOW, { maxBytes: 1 * 1_024 * 1_024 });

    expect(retention.keep).toEqual(['newest']);
    expect(retention.remove).toEqual(['second', 'third']);
    expect(retention.retainedBytes).toBe(sixHundredKiB);
  });

  it('removes a record whose id or numbers cannot be trusted instead of storing it forever', () => {
    const retention = selectRecoveryRetention([
      { id: 'not-a-number', createdAt: Number.NaN, encryptedBytes: 1_024 },
      { id: 'negative-bytes', createdAt: NOW, encryptedBytes: -1 },
      { id: '', createdAt: NOW, encryptedBytes: 1_024 },
      { id: 'x'.repeat(VERSION_RECOVERY_LIMITS.maxOpaqueIdChars + 1), createdAt: NOW, encryptedBytes: 1_024 },
      snapshot('sound', 0, 1_024),
    ], NOW);

    expect(retention.keep).toEqual(['sound']);
    // Membership, not order: a record with `NaN` as its stamp has no defined position in a `createdAt` sort,
    // and the rule never promised one. (This assertion was wrong first — it pinned that order.)
    expect(retention.remove.slice().sort()).toEqual([
      '',
      'negative-bytes',
      'not-a-number',
      'x'.repeat(VERSION_RECOVERY_LIMITS.maxOpaqueIdChars + 1),
    ].sort());
    expect(retention.retainedBytes).toBe(1_024);
  });

  it('clamps a caller policy to the hard ceiling instead of letting it widen the series', () => {
    expect(normalizeRecoveryRetention({ maxCount: 10_000, maxAgeMs: 1, maxBytes: 1 }))
      .toEqual({ maxCount: 64, maxAgeMs: 60_000, maxBytes: 1 * 1_024 * 1_024 });
    expect(normalizeRecoveryRetention({ maxCount: -3, maxAgeMs: 10 * 365 * DAY_MS, maxBytes: 10_000 * 1_024 * 1_024 }))
      .toEqual({ maxCount: 1, maxAgeMs: 5 * 365 * DAY_MS, maxBytes: 4 * 1_024 * 1_024 * 1_024 });
  });
});
