import { describe, expect, it } from 'vitest';
import type { WhiteboardFacilitationState, WhiteboardVoteSession } from '../../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../../types';
import {
  WHITEBOARD_FACILITATION_MAX_PARTICIPANTS,
  castWhiteboardVote,
  closeVotingSession,
  exportVotingResultsCsv,
  getFacilitationTimerRemaining,
  lockTemplateBackground,
  normalizeWhiteboardFacilitationState,
  pauseFacilitationTimer,
  pruneParticipantCursors,
  requestBringEveryone,
  resumeFacilitationTimer,
  setWorkshopAreaVisibility,
  startFacilitationTimer,
  startVotingSession,
  tallyWhiteboardVotes,
  upsertParticipantCursor,
  setWorkshopFrames,
} from '../../model/whiteboardFacilitationEngine';

function item(id: string, text: string, extra: Partial<WhiteboardItem> = {}): WhiteboardItem {
  return { id, type: 'sticky', x: 0, y: 0, width: 100, height: 80, text, ...extra };
}

function voteSession(overrides: Partial<WhiteboardVoteSession> = {}): WhiteboardVoteSession {
  return {
    id: 'vote-1',
    prompt: 'Choose',
    targetIds: ['a', 'b'],
    anonymous: false,
    status: 'open',
    startedAt: 10,
    ballots: [],
    ...overrides,
  };
}

describe('Whiteboard facilitation model', () => {
  it('normalizes malformed persisted fields and bounds every collection', () => {
    const normalized = normalizeWhiteboardFacilitationState({
      participants: [null, { id: '  p1  ', name: '  Ada  ', x: Number.POSITIVE_INFINITY, y: -15, lastSeenAt: Number.POSITIVE_INFINITY }, { id: 'p1', name: 'Duplicate' }] as never,
      voting: { id: 'v', status: 'unexpected', targetIds: ['x', {}, 'x'], ballots: [{ id: 'b', targetId: 'outside' }, { id: 'b2', targetId: 'x', actorLabel: 'Ada' }] } as never,
      timer: { durationMs: Number.POSITIVE_INFINITY, startedAt: Number.NaN, elapsedBeforePauseMs: 99_999_999, running: true } as never,
      workshopFrameIds: 'not-an-array' as never,
      lockedBackgroundIds: [null, ' locked ', 'locked', { id: 'x' }] as never,
      revealedAreaIds: [],
    });

    expect(normalized.participants).toEqual([{ id: 'p1', name: 'Ada', x: 0, y: -15, lastSeenAt: 0 }]);
    expect(normalized.voting).toMatchObject({ status: 'closed', targetIds: ['x'], ballots: [{ id: 'b2', targetId: 'x', actorLabel: 'Ada' }] });
    expect(normalized.timer).toEqual({ durationMs: 300_000, startedAt: undefined, elapsedBeforePauseMs: 300_000, running: false });
    expect(normalized.workshopFrameIds).toEqual([]);
    expect(normalized.lockedBackgroundIds).toEqual(['locked']);
  });

  it('keeps timer state monotonic across pause, resume, expiry, and reset', () => {
    const running = startFacilitationTimer(normalizeWhiteboardFacilitationState(), 10_000, 1_000);
    expect(getFacilitationTimerRemaining(running, 4_000)).toBe(7_000);
    const paused = pauseFacilitationTimer(running, 4_000);
    expect(getFacilitationTimerRemaining(paused, 50_000)).toBe(7_000);
    const resumed = resumeFacilitationTimer(paused, 10_000);
    expect(getFacilitationTimerRemaining(resumed, 12_000)).toBe(5_000);
    expect(getFacilitationTimerRemaining(pauseFacilitationTimer(resumed, 20_000), 20_000)).toBe(0);
  });

  it('bounds vote targets and prevents duplicate, unknown-target, anonymous-label, and closed-session ballots', () => {
    const initial = normalizeWhiteboardFacilitationState();
    const targets = ['a', 'b', ...Array.from({ length: 126 }, (_, index) => `target-${index}`)];
    const started = startVotingSession(initial, targets, true, '  Pick  ', 50);
    expect(started.voting?.targetIds).toHaveLength(128);
    expect(started.voting?.prompt).toBe('Pick');
    expect(startVotingSession(initial, [...targets, 'overflow'], true, 'Pick', 50)).toBe(initial);

    const first = castWhiteboardVote(started, 'a', 'ballot-1', 'Private name');
    expect(first.voting?.ballots).toEqual([{ id: 'ballot-1', targetId: 'a' }]);
    const changedVote = castWhiteboardVote(first, 'b', 'ballot-1');
    expect(changedVote.voting?.ballots).toEqual([{ id: 'ballot-1', targetId: 'b' }]);
    expect(castWhiteboardVote(changedVote, 'b', 'ballot-1')).toBe(changedVote);
    expect(castWhiteboardVote(changedVote, 'outside', 'ballot-2')).toBe(changedVote);
    expect(closeVotingSession(first).voting?.status).toBe('closed');
    expect(castWhiteboardVote(closeVotingSession(first), 'b', 'ballot-2')).toEqual(closeVotingSession(first));
  });

  it('tallies only unique valid ballots and sorts ties deterministically', () => {
    const result = tallyWhiteboardVotes(voteSession({
      ballots: [
        { id: '1', targetId: 'b' },
        { id: '2', targetId: 'a' },
        { id: '3', targetId: 'b' },
        { id: '2', targetId: 'b' },
        { id: '4', targetId: 'outside' },
      ],
    }));
    expect(result).toEqual([{ targetId: 'b', votes: 2 }, { targetId: 'a', votes: 1 }]);
  });

  it('neutralizes formula cells and quotes CSV values without changing vote counts', () => {
    const session = voteSession({
      targetIds: ['=1+1', 'safe'],
      ballots: [{ id: '1', targetId: '=1+1' }, { id: '2', targetId: 'safe' }],
    });
    const csv = exportVotingResultsCsv(session, [
      item('=1+1', '\t=HYPERLINK("https://invalid.example","run")'),
      item('safe', 'A "quoted", label'),
    ]);

    expect(csv).toContain("\"'=1+1\"");
    expect(csv).toContain(`"'=HYPERLINK(""https://invalid.example"",""run"")"`);
    expect(csv).toContain('"A ""quoted"", label"');
    expect(csv).toMatch(/,1\n/u);
  });

  it('locks and hides only current item IDs and preserves unrelated object references', () => {
    const state = normalizeWhiteboardFacilitationState({ lockedBackgroundIds: ['old'], revealedAreaIds: ['old'] });
    const original = [item('a', 'Alpha'), item('b', 'Beta')];
    const locked = lockTemplateBackground(state, original, ['a', 'missing'], true);
    expect(locked.state.lockedBackgroundIds).toEqual(['old', 'a']);
    expect(locked.items[0]).toMatchObject({ id: 'a', locked: true });
    expect(locked.items[1]).toBe(original[1]);

    const hidden = setWorkshopAreaVisibility(state, original, ['b', 'missing'], false);
    expect(hidden.state.revealedAreaIds).toEqual(['old']);
    expect(hidden.items[1]).toMatchObject({ id: 'b', hidden: true });
    expect(hidden.items[0]).toBe(original[0]);
  });

  it('rejects over-limit vote, frame, lock, and reveal selections without partial writes', () => {
    const state = normalizeWhiteboardFacilitationState();
    const voteOptions = Array.from({ length: 129 }, (_, index) => `vote-${index}`);
    const frames = Array.from({ length: 513 }, (_, index) => `frame-${index}`);
    expect(startVotingSession(state, voteOptions, false, 'Choose')).toBe(state);
    expect(setWorkshopFrames(state, frames)).toBe(state);

    const items = Array.from({ length: 2_001 }, (_, index) => item(`object-${index}`, `Object ${index}`));
    const ids = items.map(({ id }) => id);
    expect(lockTemplateBackground(state, items, ids, true)).toEqual({ state, items });
    expect(setWorkshopAreaVisibility(state, items, ids, true)).toEqual({ state, items });
  });

  it('keeps participant cursors unique, bounded, and TTL-pruned', () => {
    let state: WhiteboardFacilitationState = normalizeWhiteboardFacilitationState();
    for (let index = 0; index <= WHITEBOARD_FACILITATION_MAX_PARTICIPANTS; index += 1) {
      state = upsertParticipantCursor(state, { id: `p-${index}`, name: 'Participant', x: index, y: 0, lastSeenAt: 0 }, 10_000);
    }
    expect(state.participants).toHaveLength(WHITEBOARD_FACILITATION_MAX_PARTICIPANTS);
    state = upsertParticipantCursor(state, { id: 'p-0', name: 'Updated', x: 1, y: 2, lastSeenAt: 0 }, 20_000);
    expect(state.participants.filter(({ id }) => id === 'p-0')).toHaveLength(1);
    expect(pruneParticipantCursors(state, 100_001).participants).toEqual([]);
  });

  it('clamps presenter viewport and saturates its change sequence safely', () => {
    const state = normalizeWhiteboardFacilitationState({ bringEveryoneSequence: Number.MAX_SAFE_INTEGER });
    const next = requestBringEveryone(state, { x: Number.POSITIVE_INFINITY, y: -20_000_000, zoom: Number.NaN });
    expect(next.presenterViewport).toEqual({ x: 0, y: -10_000_000, zoom: 1 });
    expect(next.bringEveryoneSequence).toBe(Number.MAX_SAFE_INTEGER);
  });
});
