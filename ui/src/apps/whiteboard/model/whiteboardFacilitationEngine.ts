// STATUS: PLATIN
// Whiteboard facilitation state transitions. Persistence and role authorization stay in useWhiteboardState.

import { secureRandomId } from '../../../shared/crypto/secureRandom';
import type {
  WhiteboardFacilitationState,
  WhiteboardParticipantCursor,
  WhiteboardPresenterViewport,
  WhiteboardVoteSession,
} from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { WHITEBOARD_MAX_ITEMS, clampCoordinate, clampZoom } from '../viewport/whiteboardViewportEngine';

export const WHITEBOARD_FACILITATION_MAX_PARTICIPANTS = 256;
export const WHITEBOARD_FACILITATION_MAX_BALLOTS = 10_000;
export const WHITEBOARD_FACILITATION_MAX_VOTE_TARGETS = 128;
export const WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES = 512;
export const WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS = 2_000;
export const WHITEBOARD_FACILITATION_CURSOR_TTL_MS = 60_000;
export const WHITEBOARD_FACILITATION_MAX_TIMER_MS = 24 * 60 * 60 * 1000;
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PARTICIPANT_NAME_LENGTH = 120;
const MAX_VOTE_PROMPT_LENGTH = 500;
const MAX_CSV_LABEL_LENGTH = 1_000;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').trim().slice(0, maxLength)
    : '';
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function timestamp(value: unknown, fallback = 0): number {
  return Math.max(0, finiteNumber(value, fallback));
}

function uniqueStrings(value: unknown, maxLength: number, maxCount: number, maxScan = maxCount * 4): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value.slice(0, maxScan)) {
    const normalized = cleanString(entry, maxLength);
    if (normalized) unique.add(normalized);
    if (unique.size >= maxCount) break;
  }
  return [...unique];
}

function normalizeTimer(value: unknown): WhiteboardFacilitationState['timer'] {
  const raw = asRecord(value);
  if (!raw) return undefined;

  const durationMs = boundedInt(raw.durationMs, 1_000, WHITEBOARD_FACILITATION_MAX_TIMER_MS, 5 * 60_000);
  const elapsedBeforePauseMs = boundedInt(raw.elapsedBeforePauseMs, 0, durationMs, 0);
  const startedAt = typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt)
    ? timestamp(raw.startedAt)
    : undefined;
  const running = raw.running === true && startedAt !== undefined && elapsedBeforePauseMs < durationMs;

  return {
    durationMs,
    startedAt: running ? startedAt : undefined,
    elapsedBeforePauseMs,
    running,
  };
}

function normalizeVoteSession(value: unknown): WhiteboardVoteSession | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;

  const targetIds = uniqueStrings(raw.targetIds, MAX_IDENTIFIER_LENGTH, WHITEBOARD_FACILITATION_MAX_VOTE_TARGETS);
  if (targetIds.length === 0) return undefined;

  const targetSet = new Set(targetIds);
  const anonymous = raw.anonymous === true;
  const ballots: WhiteboardVoteSession['ballots'] = [];
  const ballotIds = new Set<string>();
  const rawBallots = Array.isArray(raw.ballots) ? raw.ballots : [];

  for (const value of rawBallots.slice(0, WHITEBOARD_FACILITATION_MAX_BALLOTS * 2)) {
    const ballot = asRecord(value);
    if (!ballot) continue;
    const id = cleanString(ballot.id, MAX_IDENTIFIER_LENGTH);
    const targetId = cleanString(ballot.targetId, MAX_IDENTIFIER_LENGTH);
    if (!id || !targetSet.has(targetId) || ballotIds.has(id)) continue;

    ballotIds.add(id);
    const actorLabel = anonymous ? '' : cleanString(ballot.actorLabel, MAX_PARTICIPANT_NAME_LENGTH);
    ballots.push({ id, targetId, ...(actorLabel ? { actorLabel } : {}) });
    if (ballots.length >= WHITEBOARD_FACILITATION_MAX_BALLOTS) break;
  }

  return {
    id: cleanString(raw.id, MAX_IDENTIFIER_LENGTH) || secureRandomId('vote'),
    prompt: cleanString(raw.prompt, MAX_VOTE_PROMPT_LENGTH) || 'Vote',
    targetIds,
    anonymous,
    status: raw.status === 'open' ? 'open' : 'closed',
    startedAt: timestamp(raw.startedAt),
    ballots,
  };
}

function normalizeParticipant(value: unknown): WhiteboardParticipantCursor | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const id = cleanString(raw.id, MAX_IDENTIFIER_LENGTH);
  if (!id) return undefined;
  return {
    id,
    name: cleanString(raw.name, MAX_PARTICIPANT_NAME_LENGTH) || 'Participant',
    x: clampCoordinate(finiteNumber(raw.x)),
    y: clampCoordinate(finiteNumber(raw.y)),
    lastSeenAt: timestamp(raw.lastSeenAt),
  };
}

function normalizeParticipants(value: unknown): WhiteboardParticipantCursor[] {
  if (!Array.isArray(value)) return [];
  const participants: WhiteboardParticipantCursor[] = [];
  const ids = new Set<string>();
  for (const entry of value.slice(0, WHITEBOARD_FACILITATION_MAX_PARTICIPANTS * 4)) {
    const participant = normalizeParticipant(entry);
    if (!participant || ids.has(participant.id)) continue;
    ids.add(participant.id);
    participants.push(participant);
    if (participants.length >= WHITEBOARD_FACILITATION_MAX_PARTICIPANTS) break;
  }
  return participants;
}

export function normalizeWhiteboardFacilitationState(rawValue?: Partial<WhiteboardFacilitationState>): WhiteboardFacilitationState {
  const raw = asRecord(rawValue);
  const viewport = asRecord(raw?.presenterViewport);
  const presenterViewport = viewport
    && typeof viewport.x === 'number' && Number.isFinite(viewport.x)
    && typeof viewport.y === 'number' && Number.isFinite(viewport.y)
    && typeof viewport.zoom === 'number' && Number.isFinite(viewport.zoom)
    ? {
      x: clampCoordinate(viewport.x),
      y: clampCoordinate(viewport.y),
      zoom: clampZoom(viewport.zoom),
    }
    : undefined;

  return {
    timer: normalizeTimer(raw?.timer),
    voting: normalizeVoteSession(raw?.voting),
    followPresenter: raw?.followPresenter === true,
    presenterViewport,
    bringEveryoneSequence: boundedInt(raw?.bringEveryoneSequence, 0, Number.MAX_SAFE_INTEGER, 0),
    hideParticipantNames: raw?.hideParticipantNames === true,
    participants: normalizeParticipants(raw?.participants),
    workshopFrameIds: uniqueStrings(raw?.workshopFrameIds, MAX_IDENTIFIER_LENGTH, WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES),
    lockedBackgroundIds: uniqueStrings(raw?.lockedBackgroundIds, MAX_IDENTIFIER_LENGTH, WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS),
    revealedAreaIds: uniqueStrings(raw?.revealedAreaIds, MAX_IDENTIFIER_LENGTH, WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS),
  };
}

function safeTimestamp(now: number): number {
  return timestamp(now, Date.now());
}

export function startFacilitationTimer(
  state: WhiteboardFacilitationState,
  durationMs: number,
  now = Date.now(),
): WhiteboardFacilitationState {
  return {
    ...state,
    timer: {
      durationMs: boundedInt(durationMs, 1_000, WHITEBOARD_FACILITATION_MAX_TIMER_MS, 5 * 60_000),
      startedAt: safeTimestamp(now),
      elapsedBeforePauseMs: 0,
      running: true,
    },
  };
}

export function pauseFacilitationTimer(state: WhiteboardFacilitationState, now = Date.now()): WhiteboardFacilitationState {
  const timer = state.timer;
  if (!timer || !timer.running) return state;
  const elapsed = Math.max(0, safeTimestamp(now) - timestamp(timer.startedAt));
  return {
    ...state,
    timer: {
      ...timer,
      startedAt: undefined,
      elapsedBeforePauseMs: Math.min(timer.durationMs, timer.elapsedBeforePauseMs + elapsed),
      running: false,
    },
  };
}

export function resumeFacilitationTimer(state: WhiteboardFacilitationState, now = Date.now()): WhiteboardFacilitationState {
  const timer = state.timer;
  if (!timer || timer.running || timer.elapsedBeforePauseMs >= timer.durationMs) return state;
  return { ...state, timer: { ...timer, startedAt: safeTimestamp(now), running: true } };
}

export function resetFacilitationTimer(state: WhiteboardFacilitationState): WhiteboardFacilitationState {
  return { ...state, timer: undefined };
}

export function getFacilitationTimerRemaining(state: WhiteboardFacilitationState, now = Date.now()): number {
  const timer = state.timer;
  if (!timer) return 0;
  const live = timer.running && timer.startedAt !== undefined
    ? Math.max(0, safeTimestamp(now) - timestamp(timer.startedAt))
    : 0;
  return Math.max(0, timer.durationMs - timer.elapsedBeforePauseMs - live);
}

export function startVotingSession(
  state: WhiteboardFacilitationState,
  targetIds: readonly string[],
  anonymous: boolean,
  prompt: string,
  now = Date.now(),
): WhiteboardFacilitationState {
  if (targetIds.length > WHITEBOARD_MAX_ITEMS) return state;
  const targets = uniqueStrings(
    targetIds,
    MAX_IDENTIFIER_LENGTH,
    WHITEBOARD_FACILITATION_MAX_VOTE_TARGETS + 1,
    WHITEBOARD_MAX_ITEMS,
  );
  if (targets.length === 0 || targets.length > WHITEBOARD_FACILITATION_MAX_VOTE_TARGETS) return state;
  return {
    ...state,
    voting: {
      id: secureRandomId('vote'),
      prompt: cleanString(prompt, MAX_VOTE_PROMPT_LENGTH) || 'Vote',
      targetIds: targets,
      anonymous: anonymous === true,
      status: 'open',
      startedAt: safeTimestamp(now),
      ballots: [],
    },
  };
}

export function castWhiteboardVote(
  state: WhiteboardFacilitationState,
  targetId: string,
  ballotId: string,
  actorLabel?: string,
): WhiteboardFacilitationState {
  const voting = state.voting;
  const target = cleanString(targetId, MAX_IDENTIFIER_LENGTH);
  const id = cleanString(ballotId, MAX_IDENTIFIER_LENGTH);
  if (!voting || voting.status !== 'open' || !target || !voting.targetIds.includes(target)) return state;
  if (!id) return state;

  const label = voting.anonymous ? '' : cleanString(actorLabel, MAX_PARTICIPANT_NAME_LENGTH);
  const existingIndex = voting.ballots.findIndex((ballot) => ballot.id === id);
  if (existingIndex >= 0) {
    if (voting.ballots[existingIndex]?.targetId === target) return state;
    const ballots = [...voting.ballots];
    ballots[existingIndex] = { id, targetId: target, ...(label ? { actorLabel: label } : {}) };
    return { ...state, voting: { ...voting, ballots } };
  }
  if (voting.ballots.length >= WHITEBOARD_FACILITATION_MAX_BALLOTS) return state;
  return {
    ...state,
    voting: {
      ...voting,
      ballots: [...voting.ballots, { id, targetId: target, ...(label ? { actorLabel: label } : {}) }],
    },
  };
}

export function closeVotingSession(state: WhiteboardFacilitationState): WhiteboardFacilitationState {
  return state.voting ? { ...state, voting: { ...state.voting, status: 'closed' } } : state;
}

export function tallyWhiteboardVotes(session: WhiteboardVoteSession | undefined): Array<{ targetId: string; votes: number }> {
  const normalized = normalizeVoteSession(session);
  if (!normalized) return [];
  const counts = new Map(normalized.targetIds.map((id) => [id, 0]));
  for (const ballot of normalized.ballots) counts.set(ballot.targetId, (counts.get(ballot.targetId) ?? 0) + 1);
  return [...counts]
    .map(([targetId, votes]) => ({ targetId, votes }))
    .sort((left, right) => right.votes - left.votes || (left.targetId < right.targetId ? -1 : left.targetId > right.targetId ? 1 : 0));
}

function csvCell(value: string): string {
  const cleaned = value.replace(/\0/g, '');
  const formulaLike = /^[\u0000-\u0020\u00a0\ufeff\u200b\u2028\u2029]*[=+\-@]/u.test(cleaned);
  const safe = formulaLike ? `'${cleaned}` : cleaned;
  return `"${safe.replace(/"/g, '""')}"`;
}

function itemLabel(item: WhiteboardItem | undefined, fallback: string): string {
  return cleanString(item?.text, MAX_CSV_LABEL_LENGTH)
    || cleanString(item?.name, MAX_CSV_LABEL_LENGTH)
    || cleanString(fallback, MAX_CSV_LABEL_LENGTH);
}

export function exportVotingResultsCsv(session: WhiteboardVoteSession | undefined, items: readonly WhiteboardItem[]): string {
  if (!session) return 'target_id,target_label,votes\n';

  const rows = tallyWhiteboardVotes(session);
  const labels = new Map(rows.map(({ targetId }) => [targetId, targetId]));
  const targetsRemaining = new Set(labels.keys());
  const scanLength = Math.min(items.length, WHITEBOARD_MAX_ITEMS);
  for (let index = 0; index < scanLength && targetsRemaining.size > 0; index += 1) {
    const item = items[index];
    if (!item || typeof item.id !== 'string' || !targetsRemaining.has(item.id)) continue;
    labels.set(item.id, itemLabel(item, item.id));
    targetsRemaining.delete(item.id);
  }

  const body = rows.map(({ targetId, votes }) => [
    csvCell(targetId),
    csvCell(labels.get(targetId) ?? targetId),
    String(votes),
  ].join(','));
  return ['target_id,target_label,votes', ...body].join('\n') + '\n';
}

export function updatePresenterViewport(state: WhiteboardFacilitationState, viewport: WhiteboardPresenterViewport): WhiteboardFacilitationState {
  return {
    ...state,
    presenterViewport: {
      x: clampCoordinate(finiteNumber(viewport.x)),
      y: clampCoordinate(finiteNumber(viewport.y)),
      zoom: clampZoom(finiteNumber(viewport.zoom, 1)),
    },
  };
}

export function requestBringEveryone(state: WhiteboardFacilitationState, viewport: WhiteboardPresenterViewport): WhiteboardFacilitationState {
  return {
    ...updatePresenterViewport(state, viewport),
    bringEveryoneSequence: Math.min(Number.MAX_SAFE_INTEGER, boundedInt(state.bringEveryoneSequence, 0, Number.MAX_SAFE_INTEGER, 0) + 1),
  };
}

export function setFollowPresenter(state: WhiteboardFacilitationState, follow: boolean): WhiteboardFacilitationState {
  return { ...state, followPresenter: follow === true };
}

export function upsertParticipantCursor(
  state: WhiteboardFacilitationState,
  cursor: WhiteboardParticipantCursor,
  now = Date.now(),
): WhiteboardFacilitationState {
  const participant = normalizeParticipant({ ...cursor, lastSeenAt: safeTimestamp(now) });
  if (!participant) return state;
  const remaining = state.participants.filter((entry) =>
    entry.id !== participant.id && safeTimestamp(now) - timestamp(entry.lastSeenAt) <= WHITEBOARD_FACILITATION_CURSOR_TTL_MS,
  );
  return { ...state, participants: [participant, ...remaining].slice(0, WHITEBOARD_FACILITATION_MAX_PARTICIPANTS) };
}

export function pruneParticipantCursors(state: WhiteboardFacilitationState, now = Date.now()): WhiteboardFacilitationState {
  const currentTime = safeTimestamp(now);
  return {
    ...state,
    participants: state.participants
      .filter((participant) => currentTime - timestamp(participant.lastSeenAt) <= WHITEBOARD_FACILITATION_CURSOR_TTL_MS)
      .slice(0, WHITEBOARD_FACILITATION_MAX_PARTICIPANTS),
  };
}

export function setWorkshopFrames(state: WhiteboardFacilitationState, frameIds: readonly string[]): WhiteboardFacilitationState {
  if (frameIds.length > WHITEBOARD_MAX_ITEMS) return state;
  const normalized = uniqueStrings(frameIds, MAX_IDENTIFIER_LENGTH, WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES + 1, WHITEBOARD_MAX_ITEMS);
  if (normalized.length > WHITEBOARD_FACILITATION_MAX_WORKSHOP_FRAMES) return state;
  return { ...state, workshopFrameIds: normalized };
}

function normalizeItemIds(items: readonly WhiteboardItem[], ids: readonly string[]): Set<string> {
  const requested = new Set(uniqueStrings(ids, MAX_IDENTIFIER_LENGTH, WHITEBOARD_MAX_ITEMS));
  if (requested.size === 0) return requested;
  const existing = new Set<string>();
  for (const item of items.slice(0, WHITEBOARD_MAX_ITEMS)) {
    if (typeof item?.id === 'string' && requested.has(item.id)) existing.add(item.id);
  }
  return existing;
}

export function lockTemplateBackground(
  state: WhiteboardFacilitationState,
  items: WhiteboardItem[],
  ids: readonly string[],
  locked: boolean,
): { state: WhiteboardFacilitationState; items: WhiteboardItem[] } {
  if (items.length > WHITEBOARD_MAX_ITEMS) return { state, items };
  const selected = normalizeItemIds(items, ids);
  if (locked && selected.size > WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS) return { state, items };
  const lockedIds = locked
    ? uniqueStrings([...state.lockedBackgroundIds, ...selected], MAX_IDENTIFIER_LENGTH, WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS)
    : state.lockedBackgroundIds.filter((id) => !selected.has(id));
  return {
    state: { ...state, lockedBackgroundIds: lockedIds },
    items: items.map((item) => selected.has(item.id) ? { ...item, locked: locked || undefined } : item),
  };
}

export function setWorkshopAreaVisibility(
  state: WhiteboardFacilitationState,
  items: WhiteboardItem[],
  ids: readonly string[],
  visible: boolean,
): { state: WhiteboardFacilitationState; items: WhiteboardItem[] } {
  if (items.length > WHITEBOARD_MAX_ITEMS) return { state, items };
  const selected = normalizeItemIds(items, ids);
  if (visible && selected.size > WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS) return { state, items };
  const revealedAreaIds = visible
    ? uniqueStrings([...state.revealedAreaIds, ...selected], MAX_IDENTIFIER_LENGTH, WHITEBOARD_FACILITATION_MAX_WORKSHOP_OBJECTS)
    : state.revealedAreaIds.filter((id) => !selected.has(id));
  return {
    state: { ...state, revealedAreaIds },
    items: items.map((item) => selected.has(item.id) ? { ...item, hidden: visible ? undefined : true } : item),
  };
}
