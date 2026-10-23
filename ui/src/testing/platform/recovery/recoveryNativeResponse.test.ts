// STATUS: PLATIN — validates native recovery list/write/restore response contracts and document invariants.
import { describe, expect, it } from 'vitest';
import {
  parseRecoveryRestoreResponse,
  parseRecoverySnapshotListResponse,
  parseRecoveryWriteResponse,
} from '../../../platform/recovery/recovery';

const snapshotId = '0123456789abcdef0123456789abcdef/1234567890-0123456789abcdef.vrec';

const validSnapshot = {
  snapshot_id: snapshotId,
  document_kind: 'Writer',
  created_at: 1_728_000_000_000,
  size_bytes: 4_096,
  requires_pin: false,
  requires_password: false,
  security_profile: 'STANDARD',
};

const validDocument = {
  id: 'doc-recovery',
  title: 'Recovered document',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'astraea-dark',
  root_object_ids: [],
  objects: {},
};

describe('native recovery response validation', () => {
  it('accepts bounded native snapshot lists and the native write response', () => {
    expect(parseRecoverySnapshotListResponse([validSnapshot])).toEqual([validSnapshot]);
    expect(parseRecoveryWriteResponse({ success: true, snapshot_id: snapshotId, created_at: 1_728_000_000_000 }))
      .toEqual({ success: true, snapshot_id: snapshotId, created_at: 1_728_000_000_000 });
  });

  it('rejects malformed, duplicate, over-limit, or unauthorized snapshot records as a whole', () => {
    expect(parseRecoverySnapshotListResponse([{ ...validSnapshot, size_bytes: 0 }])).toBeNull();
    expect(parseRecoverySnapshotListResponse([{ ...validSnapshot, document_kind: 'Unknown' }])).toBeNull();
    expect(parseRecoverySnapshotListResponse([{ ...validSnapshot, snapshot_id: '../escape.vrec' }])).toBeNull();
    expect(parseRecoverySnapshotListResponse([validSnapshot, validSnapshot])).toBeNull();
    expect(parseRecoverySnapshotListResponse(Array.from({ length: 101 }, () => validSnapshot))).toBeNull();
    expect(parseRecoverySnapshotListResponse([{ ...validSnapshot, requires_pin: true, requires_password: true }])).toBeNull();
    expect(parseRecoveryWriteResponse({ success: true, snapshot_id: '../escape.vrec', created_at: 1 })).toBeNull();
  });

  it('validates restored document schema and size before it can reach Workspace state', () => {
    expect(parseRecoveryRestoreResponse({
      success: true,
      document: validDocument,
      error: null,
      requires_pin: false,
      requires_password: false,
    })).toMatchObject({ success: true, document: validDocument });

    expect(parseRecoveryRestoreResponse({
      success: true,
      document: { ...validDocument, id: '' },
      error: null,
      requires_pin: false,
      requires_password: false,
    })).toBeNull();
    expect(parseRecoveryRestoreResponse({
      success: true,
      document: null,
      error: null,
      requires_pin: false,
      requires_password: false,
    })).toBeNull();
  });

  it('accepts an explicit PIN challenge and rejects accessors without executing them', () => {
    expect(parseRecoveryRestoreResponse({
      success: false,
      document: null,
      error: 'PIN required',
      requires_pin: true,
      requires_password: false,
    })).toMatchObject({ success: false, requires_pin: true });

    let getterCalls = 0;
    const accessor = Object.defineProperty({
      success: false,
      document: null,
      error: 'PIN required',
      requires_pin: true,
      requires_password: false,
    }, 'success', { enumerable: true, get: () => { getterCalls += 1; return false; } });
    expect(parseRecoveryRestoreResponse(accessor)).toBeNull();
    expect(getterCalls).toBe(0);
  });
});
