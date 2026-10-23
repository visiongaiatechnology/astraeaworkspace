// STATUS: DIAMANT VGT SUPREME
// Deterministic Whiteboard object-semantic merge helper only; durable causal/queue/transport truth remains vgt-syncgraph.

import type {
  WhiteboardCollaborationActivity,
  WhiteboardCollaborationComment,
  WhiteboardCollaborationState,
  WhiteboardGuestAccess,
  WhiteboardObjectAuthorship,
  WhiteboardObjectVersion,
} from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';

export const WHITEBOARD_COLLAB_MAX_COMMENTS = 2_000;
export const WHITEBOARD_COLLAB_MAX_ACTIVITY = 2_000;
export const WHITEBOARD_COLLAB_MAX_MENTIONS = 64;
export const WHITEBOARD_COLLAB_MAX_COMMENT_LENGTH = 16_384;
export const WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS = 100_000;
export const WHITEBOARD_COLLAB_PRESENCE_TTL_MS = 60_000;
export const WHITEBOARD_COLLAB_MAX_ITEM_COMPARE_VALUES = 100_000;
const collaborationActivityKinds = new Set<WhiteboardCollaborationActivity['kind']>(['edit', 'comment', 'merge', 'presence', 'space', 'guest']);

export interface WhiteboardItemOperation {
  id: string;
  actorId: string;
  actorName: string;
  at: number;
  objectId: string;
  version: WhiteboardObjectVersion;
  kind: 'upsert' | 'delete';
  item?: WhiteboardItem;
}

export interface WhiteboardCollaborationSnapshot {
  items: WhiteboardItem[];
  state: WhiteboardCollaborationState;
}

const clean = (value: unknown, max: number, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const bounded = value.slice(0, Math.max(max, max * 4));
  return bounded.normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
};
const safeTime = (value: unknown, fallback: number): number => Number.isFinite(value) ? Math.max(0, Math.trunc(Number(value))) : fallback;
const safeLamport = (value: unknown): number => Number.isSafeInteger(value) ? Math.max(0, Math.trunc(Number(value))) : 0;
const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  throw new Error('whiteboard_collaboration_secure_random_unavailable');
};

function boundedRecord<T>(source: unknown, normalize: (value: unknown) => T | undefined): Record<string, T> {
  const result: Record<string, T> = Object.create(null) as Record<string, T>;
  if (!source || typeof source !== 'object') return result;
  let inspected = 0;
  for (const key in source as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (inspected >= WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS) break;
    inspected += 1;
    const id = clean(key, 256);
    const normalized = id ? normalize((source as Record<string, unknown>)[key]) : undefined;
    if (normalized) result[id] = normalized;
  }
  return result;
}

function normalizeVersion(value: unknown): WhiteboardObjectVersion | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<WhiteboardObjectVersion>;
  const actorId = clean(raw.actorId, 256);
  const lamport = safeLamport(raw.lamport);
  if (!actorId || lamport <= 0) return undefined;
  return { lamport, actorId, deleted: raw.deleted === true || undefined };
}

function normalizeAuthorship(value: unknown): WhiteboardObjectAuthorship | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<WhiteboardObjectAuthorship>;
  const actorId = clean(raw.actorId, 256);
  const actorName = clean(raw.actorName, 128);
  if (!actorId || !actorName) return undefined;
  return { actorId, actorName, updatedAt: safeTime(raw.updatedAt, 0) };
}

export function extractWhiteboardMentions(body: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const regex = /(?:^|\s)@([\p{L}\p{N}_.-]{1,64})/gu;
  const boundedBody = clean(body, WHITEBOARD_COLLAB_MAX_COMMENT_LENGTH);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(boundedBody)) !== null && result.length < WHITEBOARD_COLLAB_MAX_MENTIONS) {
    const mention = clean(match[1], 64);
    const key = mention.toLowerCase();
    if (mention && !seen.has(key)) { seen.add(key); result.push(mention); }
  }
  return result;
}

function normalizeComment(value: unknown): WhiteboardCollaborationComment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<WhiteboardCollaborationComment>;
  const id = clean(raw.id, 256);
  const authorId = clean(raw.authorId, 256);
  const authorName = clean(raw.authorName, 128);
  const body = clean(raw.body, WHITEBOARD_COLLAB_MAX_COMMENT_LENGTH);
  if (!id || !authorId || !authorName || !body) return undefined;
  const mentions = Array.isArray(raw.mentions) ? raw.mentions.slice(0, WHITEBOARD_COLLAB_MAX_MENTIONS).map((entry) => clean(entry, 64)).filter(Boolean) : extractWhiteboardMentions(body);
  return {
    id,
    objectId: clean(raw.objectId, 256) || undefined,
    parentId: clean(raw.parentId, 256) || undefined,
    authorId,
    authorName,
    body,
    mentions: [...new Set(mentions)],
    createdAt: safeTime(raw.createdAt, 0),
    updatedAt: safeTime(raw.updatedAt, safeTime(raw.createdAt, 0)),
    resolvedAt: raw.resolvedAt === undefined ? undefined : safeTime(raw.resolvedAt, 0),
  };
}

function normalizeActivity(value: unknown): WhiteboardCollaborationActivity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<WhiteboardCollaborationActivity>;
  const id = clean(raw.id, 256);
  const actorId = clean(raw.actorId, 256);
  const actorName = clean(raw.actorName, 128);
  const detail = clean(raw.detail, 500);
  if (!id || !actorId || !actorName || !detail || !collaborationActivityKinds.has(raw.kind as WhiteboardCollaborationActivity['kind'])) return undefined;
  return { id, at: safeTime(raw.at, 0), actorId, actorName, kind: raw.kind as WhiteboardCollaborationActivity['kind'], objectId: clean(raw.objectId, 256) || undefined, detail };
}

export function normalizeWhiteboardCollaborationState(input?: Partial<WhiteboardCollaborationState>): WhiteboardCollaborationState {
  const comments = Array.isArray(input?.comments) ? input.comments.slice(-WHITEBOARD_COLLAB_MAX_COMMENTS).map(normalizeComment).filter((entry): entry is WhiteboardCollaborationComment => Boolean(entry)) : [];
  const activity = Array.isArray(input?.activity) ? input.activity.slice(-WHITEBOARD_COLLAB_MAX_ACTIVITY).map(normalizeActivity).filter((entry): entry is WhiteboardCollaborationActivity => Boolean(entry)) : [];
  const spaceId = clean(input?.spaceBinding?.spaceId, 256);
  const memberId = clean(input?.spaceBinding?.memberId, 256);
  const guest = input?.guestAccess;
  const guestAccess = guest && clean(guest.guestId, 512) && clean(guest.transportId, 256) && (guest.permission === 'Viewer' || guest.permission === 'Commenter')
    ? { guestId: clean(guest.guestId, 512), transportId: clean(guest.transportId, 256), permission: guest.permission, createdAt: safeTime(guest.createdAt, 0), expiresAt: safeTime(guest.expiresAt, 0) } as WhiteboardGuestAccess
    : undefined;
  return {
    enabled: input?.enabled === true,
    localDisplayName: clean(input?.localDisplayName, 128, 'Local collaborator') || 'Local collaborator',
    lamport: safeLamport(input?.lamport),
    comments,
    activity,
    objectAuthorshipEnabled: input?.objectAuthorshipEnabled === true,
    objectAuthors: boundedRecord(input?.objectAuthors, normalizeAuthorship),
    objectVersions: boundedRecord(input?.objectVersions, normalizeVersion),
    spaceBinding: spaceId && memberId ? { spaceId, memberId } : undefined,
    guestAccess,
  };
}

export function createWhiteboardComment(input: { actorId: string; actorName: string; body: string; objectId?: string; parentId?: string }, now = Date.now()): WhiteboardCollaborationComment {
  const body = clean(input.body, WHITEBOARD_COLLAB_MAX_COMMENT_LENGTH);
  const authorId = clean(input.actorId, 256);
  const authorName = clean(input.actorName, 128);
  if (!body || !authorId || !authorName || !Number.isSafeInteger(now) || now < 0) throw new Error('whiteboard_comment_invalid');
  return { id: makeId('wb-comment'), objectId: clean(input.objectId, 256) || undefined, parentId: clean(input.parentId, 256) || undefined, authorId, authorName, body, mentions: extractWhiteboardMentions(body), createdAt: now, updatedAt: now };
}

export function appendWhiteboardComment(state: WhiteboardCollaborationState, comment: WhiteboardCollaborationComment): WhiteboardCollaborationState {
  const normalizedState = normalizeWhiteboardCollaborationState(state);
  const normalized = normalizeComment(comment);
  if (!normalized) throw new Error('whiteboard_comment_invalid');
  if (normalized.parentId && !normalizedState.comments.some((entry) => entry.id === normalized.parentId && !entry.parentId)) throw new Error('whiteboard_comment_parent_missing');
  const byId = new Map(normalizedState.comments.map((entry) => [entry.id, entry]));
  const previous = byId.get(normalized.id);
  if (!previous || normalized.updatedAt >= previous.updatedAt) byId.set(normalized.id, normalized);
  return { ...normalizedState, comments: [...byId.values()].sort((a,b) => a.createdAt - b.createdAt).slice(-WHITEBOARD_COLLAB_MAX_COMMENTS) };
}

export function resolveWhiteboardComment(state: WhiteboardCollaborationState, commentId: string, resolved: boolean, now = Date.now()): WhiteboardCollaborationState {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('whiteboard_comment_time_invalid');
  const normalizedState = normalizeWhiteboardCollaborationState(state);
  const root = normalizedState.comments.find((entry) => entry.id === commentId && !entry.parentId);
  if (!root) return normalizedState;
  return { ...normalizedState, comments: normalizedState.comments.map((entry) => entry.id === commentId || entry.parentId === commentId ? { ...entry, resolvedAt: resolved ? now : undefined, updatedAt: now } : entry) };
}

export function appendWhiteboardActivity(state: WhiteboardCollaborationState, input: Omit<WhiteboardCollaborationActivity,'id'>): WhiteboardCollaborationState {
  const normalizedState = normalizeWhiteboardCollaborationState(state);
  const activity = normalizeActivity({ ...input, id: makeId('wb-activity') });
  if (!activity) return normalizedState;
  const activityItems = normalizedState.activity.slice(-(WHITEBOARD_COLLAB_MAX_ACTIVITY - 1));
  activityItems.push(activity);
  return { ...normalizedState, activity: activityItems };
}

function sameItem(left: WhiteboardItem | undefined, right: WhiteboardItem | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  const leftStack: unknown[] = [left];
  const rightStack: unknown[] = [right];
  const seen = new WeakMap<object, WeakSet<object>>();
  let comparedValues = 0;

  try {
    while (leftStack.length > 0) {
      if (comparedValues >= WHITEBOARD_COLLAB_MAX_ITEM_COMPARE_VALUES) return false;
      comparedValues += 1;
      const leftValue = leftStack.pop();
      const rightValue = rightStack.pop();
      if (Object.is(leftValue, rightValue)) continue;
      if (typeof leftValue !== typeof rightValue || leftValue === null || rightValue === null) return false;
      if (typeof leftValue !== 'object' || typeof rightValue !== 'object') return false;

      const leftArray = Array.isArray(leftValue);
      if (leftArray !== Array.isArray(rightValue)) return false;
      if (leftArray) {
        const leftList = leftValue as unknown[];
        const rightList = rightValue as unknown[];
        if (leftList.length !== rightList.length) return false;
        if (comparedValues + leftStack.length + leftList.length > WHITEBOARD_COLLAB_MAX_ITEM_COMPARE_VALUES) return false;
        for (let index = leftList.length - 1; index >= 0; index -= 1) {
          leftStack.push(leftList[index]);
          rightStack.push(rightList[index]);
        }
        continue;
      }

      const leftRecord = leftValue as Record<string, unknown>;
      const rightRecord = rightValue as Record<string, unknown>;
      const leftPrototype = Object.getPrototypeOf(leftRecord);
      const rightPrototype = Object.getPrototypeOf(rightRecord);
      if ((leftPrototype !== Object.prototype && leftPrototype !== null)
        || (rightPrototype !== Object.prototype && rightPrototype !== null)) return false;

      let pairedValues = seen.get(leftRecord);
      if (pairedValues?.has(rightRecord)) continue;
      if (!pairedValues) {
        pairedValues = new WeakSet<object>();
        seen.set(leftRecord, pairedValues);
      }
      pairedValues.add(rightRecord);

      let leftKeyCount = 0;
      let rightKeyCount = 0;
      for (const key in leftRecord) if (Object.prototype.hasOwnProperty.call(leftRecord, key)) leftKeyCount += 1;
      for (const key in rightRecord) if (Object.prototype.hasOwnProperty.call(rightRecord, key)) rightKeyCount += 1;
      if (leftKeyCount !== rightKeyCount
        || comparedValues + leftStack.length + leftKeyCount > WHITEBOARD_COLLAB_MAX_ITEM_COMPARE_VALUES) return false;

      for (const key in leftRecord) {
        if (!Object.prototype.hasOwnProperty.call(leftRecord, key)) continue;
        if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) return false;
        leftStack.push(leftRecord[key]);
        rightStack.push(rightRecord[key]);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function boundedItemMap(items: readonly WhiteboardItem[]): Map<string, WhiteboardItem> {
  const byId = new Map<string, WhiteboardItem>();
  const length = Math.min(items.length, WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS);
  for (let index = 0; index < length; index += 1) {
    const item = items[index];
    if (item && typeof item.id === 'string' && item.id.length > 0) byId.set(item.id, item);
  }
  return byId;
}

export function detectChangedWhiteboardItemIds(previous: readonly WhiteboardItem[], next: readonly WhiteboardItem[]): string[] {
  const before = boundedItemMap(previous);
  const after = boundedItemMap(next);
  const changed: string[] = [];
  for (const [id, item] of after) if (!sameItem(before.get(id), item)) changed.push(id);
  for (const id of before.keys()) if (!after.has(id)) changed.push(id);
  return [...new Set(changed)].slice(0, WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS);
}

function nextLamport(value: number): number {
  if (value >= Number.MAX_SAFE_INTEGER) throw new Error('whiteboard_collaboration_lamport_exhausted');
  return value + 1;
}

export function createWhiteboardItemOperations(previous: readonly WhiteboardItem[], next: readonly WhiteboardItem[], changedIds: readonly string[], state: WhiteboardCollaborationState, actorId: string, actorName: string, now = Date.now()): { operations: WhiteboardItemOperation[]; state: WhiteboardCollaborationState } {
  const safeActorId = clean(actorId, 256);
  const safeActorName = clean(actorName, 128);
  if (!safeActorId || !safeActorName || !Number.isSafeInteger(now) || now < 0) throw new Error('whiteboard_collaboration_operation_invalid');
  const before = boundedItemMap(previous);
  const after = boundedItemMap(next);
  const normalizedState = normalizeWhiteboardCollaborationState(state);
  let lamport = normalizedState.lamport;
  const objectVersions = { ...normalizedState.objectVersions };
  const objectAuthors = { ...normalizedState.objectAuthors };
  const operations: WhiteboardItemOperation[] = [];
  const uniqueIds = new Set<string>();
  const changedIdLimit = Math.min(changedIds.length, WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS);
  for (let index = 0; index < changedIdLimit; index += 1) {
    const objectId = changedIds[index];
    if (typeof objectId !== 'string' || !objectId || clean(objectId, 256) !== objectId || uniqueIds.has(objectId)) continue;
    uniqueIds.add(objectId);
    const oldItem = before.get(objectId);
    const newItem = after.get(objectId);
    if (sameItem(oldItem, newItem)) continue;
    lamport = nextLamport(lamport);
    const version: WhiteboardObjectVersion = { lamport, actorId: safeActorId, deleted: newItem ? undefined : true };
    objectVersions[objectId] = version;
    if (normalizedState.objectAuthorshipEnabled && newItem) objectAuthors[objectId] = { actorId: safeActorId, actorName: safeActorName, updatedAt: now };
    if (!newItem) delete objectAuthors[objectId];
    operations.push({ id: makeId('wb-op'), actorId: safeActorId, actorName: safeActorName, at: now, objectId, version, kind: newItem ? 'upsert' : 'delete', item: newItem ? { ...newItem } : undefined });
  }
  let nextState = { ...normalizedState, lamport, objectVersions, objectAuthors };
  if (operations.length > 0) nextState = appendWhiteboardActivity(nextState, { at: now, actorId: safeActorId, actorName: safeActorName, kind:'edit', objectId: operations.length === 1 ? operations[0].objectId : undefined, detail: operations.length === 1 ? `${operations[0].kind === 'delete' ? 'Deleted' : 'Updated'} object ${operations[0].objectId}.` : `Updated ${operations.length} board objects.` });
  return { operations, state: nextState };
}

function compareVersions(left?: WhiteboardObjectVersion, right?: WhiteboardObjectVersion): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  if (left.lamport !== right.lamport) return left.lamport - right.lamport;
  return left.actorId.localeCompare(right.actorId);
}

function validItemOperation(value: unknown): value is WhiteboardItemOperation {
  if (!value || typeof value !== 'object') return false;
  const operation = value as WhiteboardItemOperation;
  if (typeof operation.id !== 'string' || clean(operation.id, 256) !== operation.id
    || typeof operation.actorId !== 'string' || clean(operation.actorId, 256) !== operation.actorId
    || typeof operation.actorName !== 'string' || !clean(operation.actorName, 128)
    || typeof operation.objectId !== 'string' || clean(operation.objectId, 256) !== operation.objectId
    || !Number.isSafeInteger(operation.at) || operation.at < 0
    || (operation.kind !== 'upsert' && operation.kind !== 'delete')) return false;
  const version = operation.version;
  if (!version || !Number.isSafeInteger(version.lamport) || version.lamport <= 0
    || typeof version.actorId !== 'string' || version.actorId !== operation.actorId
    || (operation.kind === 'delete') !== (version.deleted === true)) return false;
  if (operation.kind === 'delete') return operation.item === undefined;
  return !!operation.item && typeof operation.item.id === 'string' && operation.item.id === operation.objectId;
}

export function applyWhiteboardItemOperations(items: readonly WhiteboardItem[], state: WhiteboardCollaborationState, operations: readonly WhiteboardItemOperation[], now = Date.now()): { items: WhiteboardItem[]; state: WhiteboardCollaborationState; applied: number; conflicts: number; rejected: number } {
  const byId = boundedItemMap(items);
  const normalizedState = normalizeWhiteboardCollaborationState(state);
  const objectVersions = { ...normalizedState.objectVersions };
  const objectAuthors = { ...normalizedState.objectAuthors };
  let lamport = normalizedState.lamport;
  let applied = 0, conflicts = 0, rejected = 0;
  const mergedActors = new Set<string>();
  let inspected = 0;
  for (const operation of operations) {
    if (inspected >= WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS) break;
    inspected += 1;
    if (!validItemOperation(operation)) continue;
    const current = objectVersions[operation.objectId];
    const concurrentTie = Boolean(current && current.lamport === operation.version.lamport && current.actorId !== operation.version.actorId);
    const comparison = compareVersions(current, operation.version);
    lamport = Math.max(lamport, safeLamport(operation.version.lamport));
    if (concurrentTie) conflicts += 1;
    if (comparison > 0) continue;
    if (comparison < 0 || !current) {
      if (operation.kind === 'upsert' && !byId.has(operation.objectId) && byId.size >= WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS) {
        rejected += 1;
        continue;
      }
      objectVersions[operation.objectId] = { ...operation.version };
      if (operation.kind === 'delete' || operation.version.deleted) { byId.delete(operation.objectId); delete objectAuthors[operation.objectId]; }
      else if (operation.item && operation.item.id === operation.objectId) {
        byId.set(operation.objectId, { ...operation.item });
        if (normalizedState.objectAuthorshipEnabled) objectAuthors[operation.objectId] = { actorId: operation.actorId, actorName: clean(operation.actorName,128,'Collaborator') || 'Collaborator', updatedAt: operation.at || now };
      }
      applied += 1;
      mergedActors.add(clean(operation.actorName, 128, 'Collaborator') || 'Collaborator');
    }
  }
  let nextState: WhiteboardCollaborationState = { ...normalizedState, lamport: Math.max(lamport, normalizedState.lamport), objectVersions, objectAuthors };
  if (applied > 0) {
    const actorSuffix = mergedActors.size > 0 ? ` from ${[...mergedActors].slice(0, 4).join(', ')}${mergedActors.size > 4 ? '…' : ''}` : '';
    nextState = appendWhiteboardActivity(nextState, { at: now, actorId:'collaboration-merge', actorName:'Collaboration', kind:'merge', detail:`Merged ${applied} remote object operation(s)${actorSuffix}${conflicts ? ` with ${conflicts} deterministic conflict(s)` : ''}.` });
  }
  return { items: [...byId.values()], state: nextState, applied, conflicts, rejected };
}

function mergeComments(left: readonly WhiteboardCollaborationComment[], right: readonly WhiteboardCollaborationComment[]): WhiteboardCollaborationComment[] {
  const byId = new Map<string, WhiteboardCollaborationComment>();
  for (const comment of [...left, ...right]) { const prev = byId.get(comment.id); if (!prev || comment.updatedAt >= prev.updatedAt) byId.set(comment.id, comment); }
  return [...byId.values()].sort((a,b) => a.createdAt - b.createdAt).slice(-WHITEBOARD_COLLAB_MAX_COMMENTS);
}

function mergeActivity(left: readonly WhiteboardCollaborationActivity[], right: readonly WhiteboardCollaborationActivity[]): WhiteboardCollaborationActivity[] {
  const byId = new Map<string, WhiteboardCollaborationActivity>();
  for (const activity of [...left, ...right]) byId.set(activity.id, activity);
  return [...byId.values()].sort((a,b) => a.at - b.at).slice(-WHITEBOARD_COLLAB_MAX_ACTIVITY);
}

export function mergeWhiteboardCollaborationSnapshots(local: WhiteboardCollaborationSnapshot, remote: WhiteboardCollaborationSnapshot, now = Date.now()): { snapshot: WhiteboardCollaborationSnapshot; conflicts: number } {
  const localState = normalizeWhiteboardCollaborationState(local.state);
  const remoteState = normalizeWhiteboardCollaborationState(remote.state);
  const localItems = boundedItemMap(local.items);
  const remoteItems = boundedItemMap(remote.items);
  const ids = new Set<string>();
  const addIds = (values: Iterable<string>) => {
    for (const id of values) {
      if (ids.size >= WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS) break;
      ids.add(id);
    }
  };
  addIds(localItems.keys());
  addIds(remoteItems.keys());
  addIds(Object.keys(localState.objectVersions));
  addIds(Object.keys(remoteState.objectVersions));
  const mergedItems = new Map<string,WhiteboardItem>();
  const versions = Object.create(null) as Record<string,WhiteboardObjectVersion>;
  const authors = Object.create(null) as Record<string,WhiteboardObjectAuthorship>;
  let conflicts = 0;
  for (const id of [...ids].slice(0,WHITEBOARD_COLLAB_MAX_TRACKED_OBJECTS)) {
    const lv = localState.objectVersions[id], rv = remoteState.objectVersions[id];
    const cmp = compareVersions(lv,rv);
    const winnerRemote = cmp < 0;
    const winnerVersion = winnerRemote ? rv : lv;
    const winnerItem = winnerRemote ? remoteItems.get(id) : localItems.get(id);
    if (lv && rv && lv.actorId !== rv.actorId && lv.lamport === rv.lamport) conflicts += 1;
    if (winnerVersion) versions[id] = { ...winnerVersion };
    if (winnerVersion?.deleted) continue;
    if (winnerItem) mergedItems.set(id,{...winnerItem});
    const author = winnerRemote ? remoteState.objectAuthors[id] : localState.objectAuthors[id];
    if (author) authors[id] = { ...author };
  }
  let state: WhiteboardCollaborationState = {
    ...localState,
    lamport: Math.min(Number.MAX_SAFE_INTEGER, Math.max(localState.lamport, remoteState.lamport) + 1),
    comments: mergeComments(localState.comments, remoteState.comments),
    activity: mergeActivity(localState.activity, remoteState.activity),
    objectVersions: versions,
    objectAuthors: authors,
    spaceBinding: localState.spaceBinding ?? remoteState.spaceBinding,
    guestAccess: (localState.guestAccess?.createdAt ?? 0) >= (remoteState.guestAccess?.createdAt ?? 0) ? localState.guestAccess : remoteState.guestAccess,
  };
  state = appendWhiteboardActivity(state,{at:now,actorId:'collaboration-merge',actorName:'Collaboration',kind:'merge',detail:`Offline snapshot merge completed${conflicts ? ` with ${conflicts} deterministic conflict(s)` : ''}.`});
  return { snapshot:{items:[...mergedItems.values()],state}, conflicts };
}

