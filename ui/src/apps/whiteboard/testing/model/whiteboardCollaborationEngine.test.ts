import { describe, expect, it } from 'vitest';
import type { WhiteboardCollaborationActivity, WhiteboardCollaborationComment, WhiteboardCollaborationState } from '../../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../../types';
import {
  applyWhiteboardItemOperations,
  createWhiteboardItemOperations,
  detectChangedWhiteboardItemIds,
  mergeWhiteboardCollaborationSnapshots,
  normalizeWhiteboardCollaborationState,
  WHITEBOARD_COLLAB_MAX_COMMENTS,
  WHITEBOARD_COLLAB_MAX_ITEM_COMPARE_VALUES,
  WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS,
} from '../../model/whiteboardCollaborationEngine';

const baseState = (overrides: Partial<WhiteboardCollaborationState> = {}): WhiteboardCollaborationState => ({
  enabled: false,
  localDisplayName: 'Owner',
  lamport: 0,
  comments: [],
  activity: [],
  objectAuthorshipEnabled: false,
  objectAuthors: {},
  objectVersions: {},
  ...overrides,
});

const item = (id: string, extra: Record<string, unknown> = {}): WhiteboardItem => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  text: id,
  color: 'yellow',
  ...extra,
} as WhiteboardItem);

const comment = (id: string): WhiteboardCollaborationComment => ({
  id,
  authorId: 'actor-owner',
  authorName: 'Owner',
  body: 'A bounded comment',
  mentions: [],
  createdAt: 1,
  updatedAt: 1,
});

const activity = (id: string): WhiteboardCollaborationActivity => ({
  id,
  at: 1,
  actorId: 'actor-owner',
  actorName: 'Owner',
  kind: 'comment',
  detail: 'A bounded activity',
});

describe('Whiteboard collaboration model', () => {
  it('truncates comment and activity arrays before reading discarded entries', () => {
    const comments = Array.from({ length: WHITEBOARD_COLLAB_MAX_COMMENTS + 1 }, (_, index) => comment(`c-${index}`));
    const activities = Array.from({ length: WHITEBOARD_COLLAB_MAX_COMMENTS + 1 }, (_, index) => activity(`a-${index}`));
    Object.defineProperty(comments, '0', { configurable: true, get: () => { throw new Error('discarded comment was traversed'); } });
    Object.defineProperty(activities, '0', { configurable: true, get: () => { throw new Error('discarded activity was traversed'); } });

    const normalized = normalizeWhiteboardCollaborationState({
      comments,
      activity: activities,
    } as Partial<WhiteboardCollaborationState>);

    expect(normalized.comments).toHaveLength(WHITEBOARD_COLLAB_MAX_COMMENTS);
    expect(normalized.comments[0]?.id).toBe('c-1');
    expect(normalized.activity).toHaveLength(WHITEBOARD_COLLAB_MAX_COMMENTS);
    expect(normalized.activity[0]?.id).toBe('a-1');
  });

  it('does not coerce attacker-controlled display-name values through toString', () => {
    const hostile = { toString: () => { throw new Error('coercion executed'); } };

    const normalized = normalizeWhiteboardCollaborationState({
      localDisplayName: hostile,
    } as unknown as Partial<WhiteboardCollaborationState>);

    expect(normalized.localDisplayName).toBe('Local collaborator');
  });

  it('bounds record normalization and uses a prototype-free output record', () => {
    const versions = Object.create(null) as Record<string, unknown>;
    for (let index = 0; index < WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS; index += 1) {
      versions[`version-${index}`] = { lamport: 1, actorId: 'actor-owner' };
    }
    Object.defineProperty(versions, 'overflow', {
      enumerable: true,
      get: () => { throw new Error('record past the configured ceiling was read'); },
    });

    const normalized = normalizeWhiteboardCollaborationState({ objectVersions: versions } as unknown as Partial<WhiteboardCollaborationState>);

    expect(Object.keys(normalized.objectVersions)).toHaveLength(WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS);
    expect(Object.getPrototypeOf(normalized.objectVersions)).toBeNull();
  });

  it('compares nested item values without serializing them and detects changed data', () => {
    const before = item('object-1', { metadata: { labels: ['one', 'two'], detail: { enabled: true } } });
    const equivalent = item('object-1', { metadata: { detail: { enabled: true }, labels: ['one', 'two'] } });
    const changed = item('object-1', { metadata: { detail: { enabled: false }, labels: ['one', 'two'] } });

    expect(detectChangedWhiteboardItemIds([before], [equivalent])).toEqual([]);
    expect(detectChangedWhiteboardItemIds([before], [changed])).toEqual(['object-1']);
  });

  it('compares cyclic plain model values without throwing', () => {
    const left = item('cyclic');
    const right = item('cyclic');
    (left as unknown as Record<string, unknown>).metadata = { owner: left };
    (right as unknown as Record<string, unknown>).metadata = { owner: right };

    expect(detectChangedWhiteboardItemIds([left], [right])).toEqual([]);
  });

  it('fails closed when a single item comparison exceeds its bounded value budget', () => {
    const count = WHITEBOARD_COLLAB_MAX_ITEM_COMPARE_VALUES + 1;
    const before = item('large', { metadata: Array.from({ length: count }, () => 'x') });
    const equivalent = item('large', { metadata: Array.from({ length: count }, () => 'x') });

    expect(detectChangedWhiteboardItemIds([before], [equivalent])).toEqual(['large']);
  });

  it('does not read snapshot items past the 100,000-item merge ceiling', () => {
    const items = Array.from({ length: WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS + 1 }, () => item('duplicate'));
    Object.defineProperty(items, String(WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS), {
      configurable: true,
      get: () => { throw new Error('snapshot item past the merge ceiling was read'); },
    });

    const merged = mergeWhiteboardCollaborationSnapshots(
      { items, state: baseState() },
      { items: [], state: baseState() },
      10,
    );

    expect(merged.snapshot.items.map((entry) => entry.id)).toEqual(['duplicate']);
  });

  it('rejects malformed remote operations and applies only well-formed deletes', () => {
    const current = item('object-1');
    const initial = baseState();
    const malformed = {
      id: 'operation-1',
      actorId: 'actor-peer',
      actorName: 'Peer',
      at: 1,
      objectId: 'object-1',
      version: { lamport: 1, actorId: 'actor-peer' },
      kind: 'delete',
    } as unknown as Parameters<typeof applyWhiteboardItemOperations>[2][number];
    const valid = {
      ...malformed,
      version: { lamport: 2, actorId: 'actor-peer', deleted: true },
    } as Parameters<typeof applyWhiteboardItemOperations>[2][number];

    const rejected = applyWhiteboardItemOperations([current], initial, [malformed], 2);
    const applied = applyWhiteboardItemOperations([current], initial, [valid], 2);

    expect(rejected.applied).toBe(0);
    expect(rejected.items).toEqual([current]);
    expect(applied.applied).toBe(1);
    expect(applied.items).toEqual([]);
  });

  it('rejects local version creation when the safe Lamport counter is exhausted', () => {
    const current = item('object-1');
    const changed = item('object-1', { text: 'changed' });
    const exhausted = baseState({ lamport: Number.MAX_SAFE_INTEGER });

    expect(() => createWhiteboardItemOperations([current], [changed], ['object-1'], exhausted, 'actor-owner', 'Owner', 10))
      .toThrow('whiteboard_collaboration_lamport_exhausted');
  });

  it('does not traverse changed IDs beyond the configured ceiling', () => {
    const changedIds = Array.from({ length: WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS + 1 }, () => 'object-1');
    Object.defineProperty(changedIds, String(WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS), {
      configurable: true,
      get: () => { throw new Error('changed ID past the configured ceiling was read'); },
    });

    const result = createWhiteboardItemOperations(
      [item('object-1')],
      [item('object-1', { text: 'changed' })],
      changedIds,
      baseState(),
      'actor-owner',
      'Owner',
      10,
    );

    expect(result.operations).toHaveLength(1);
  });

  it('reports remote upserts rejected by the tracked-object ceiling without exceeding it', () => {
    const items = Array.from({ length: WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS }, (_, index) => item(`object-${index}`));
    const operation = {
      id: 'operation-overflow',
      actorId: 'actor-peer',
      actorName: 'Peer',
      at: 10,
      objectId: 'object-overflow',
      version: { lamport: 1, actorId: 'actor-peer' },
      kind: 'upsert',
      item: item('object-overflow'),
    } as Parameters<typeof applyWhiteboardItemOperations>[2][number];

    const result = applyWhiteboardItemOperations(items, baseState(), [operation], 10);

    expect(result.applied).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.items).toHaveLength(WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS);
  });

  it('keeps prototype-shaped object IDs as data during snapshot merge', () => {
    const versions = Object.create(null) as WhiteboardCollaborationState['objectVersions'];
    versions.__proto__ = { lamport: 1, actorId: 'actor-owner' };
    const local = { items: [item('__proto__')], state: baseState({ objectVersions: versions }) };

    const merged = mergeWhiteboardCollaborationSnapshots(local, { items: [], state: baseState() }, 10);

    expect(Object.getPrototypeOf(merged.snapshot.state.objectVersions)).toBeNull();
    expect(Object.hasOwn(merged.snapshot.state.objectVersions, '__proto__')).toBe(true);
    expect(merged.snapshot.items.map((entry) => entry.id)).toEqual(['__proto__']);
  });

});
