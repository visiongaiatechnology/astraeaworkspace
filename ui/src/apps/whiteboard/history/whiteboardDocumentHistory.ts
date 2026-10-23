// STATUS: DIAMANT VGT SUPREME
// Bounded delta history for canonical Astraea Whiteboard editing state.

import type {
  WhiteboardCollaborationState,
  WhiteboardCustomTemplate,
  WhiteboardFacilitationState,
  WhiteboardViewConfig,
} from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';

export const WHITEBOARD_HISTORY_MAX_ENTRIES = 96;
export const WHITEBOARD_HISTORY_COALESCE_MS = 650;
export const WHITEBOARD_HISTORY_MAX_CHANGED_ITEMS = 100_000;

export interface WhiteboardHistoryItemDelta {
  id: string;
  before?: WhiteboardItem;
  after?: WhiteboardItem;
  beforeIndex: number;
  afterIndex: number;
}

interface WhiteboardHistoryMetaDelta<T> {
  before: T | undefined;
  after: T | undefined;
}

export interface WhiteboardHistoryEntry {
  documentId: string;
  at: number;
  coalesceKey?: string;
  itemDeltas: WhiteboardHistoryItemDelta[];
  view?: WhiteboardHistoryMetaDelta<WhiteboardViewConfig>;
  templates?: WhiteboardHistoryMetaDelta<WhiteboardCustomTemplate[]>;
  facilitation?: WhiteboardHistoryMetaDelta<WhiteboardFacilitationState>;
  collaboration?: WhiteboardHistoryMetaDelta<WhiteboardCollaborationState>;
}

export interface WhiteboardHistoryState {
  documentId: string;
  past: WhiteboardHistoryEntry[];
  future: WhiteboardHistoryEntry[];
}

export interface WhiteboardHistoryAppliedState {
  items: WhiteboardItem[];
  view?: WhiteboardViewConfig;
  templates?: WhiteboardCustomTemplate[];
  facilitation?: WhiteboardFacilitationState;
  collaboration?: WhiteboardCollaborationState;
}

const clone = <T,>(value: T): T => {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};
const same = (left: unknown, right: unknown): boolean => left === right || JSON.stringify(left) === JSON.stringify(right);

export function createWhiteboardHistory(documentId: string): WhiteboardHistoryState {
  return { documentId, past: [], future: [] };
}

export function scopeWhiteboardHistoryToDocument(
  state: WhiteboardHistoryState,
  documentId: string,
): WhiteboardHistoryState {
  return state.documentId === documentId ? state : createWhiteboardHistory(documentId);
}

export function createWhiteboardItemHistoryEntry(
  documentId: string,
  before: readonly WhiteboardItem[],
  after: readonly WhiteboardItem[],
  changedIds: readonly string[],
  coalesceKey?: string,
  at = Date.now(),
): WhiteboardHistoryEntry | null {
  const ids = [...new Set(changedIds)].slice(0, WHITEBOARD_HISTORY_MAX_CHANGED_ITEMS);
  if (ids.length === 0) return null;
  const beforeMap = new Map(before.map((item, index) => [item.id, { item, index }]));
  const afterMap = new Map(after.map((item, index) => [item.id, { item, index }]));
  const itemDeltas: WhiteboardHistoryItemDelta[] = [];
  for (const id of ids) {
    const left = beforeMap.get(id);
    const right = afterMap.get(id);
    if (same(left?.item, right?.item)) continue;
    itemDeltas.push({
      id,
      before: left ? clone(left.item) : undefined,
      after: right ? clone(right.item) : undefined,
      beforeIndex: left?.index ?? -1,
      afterIndex: right?.index ?? -1,
    });
  }
  return itemDeltas.length ? { documentId, at, coalesceKey, itemDeltas } : null;
}

export function createWhiteboardMetaHistoryEntry(options: {
  documentId: string;
  at?: number;
  coalesceKey?: string;
  view?: { before: WhiteboardViewConfig | undefined; after: WhiteboardViewConfig | undefined };
  templates?: { before: WhiteboardCustomTemplate[] | undefined; after: WhiteboardCustomTemplate[] | undefined };
  facilitation?: { before: WhiteboardFacilitationState | undefined; after: WhiteboardFacilitationState | undefined };
  collaboration?: { before: WhiteboardCollaborationState | undefined; after: WhiteboardCollaborationState | undefined };
  itemEntry?: WhiteboardHistoryEntry | null;
}): WhiteboardHistoryEntry | null {
  const entry: WhiteboardHistoryEntry = {
    documentId: options.documentId,
    at: options.at ?? Date.now(),
    coalesceKey: options.coalesceKey,
    itemDeltas: options.itemEntry?.itemDeltas.map((delta) => clone(delta)) ?? [],
  };
  if (options.view && !same(options.view.before, options.view.after)) entry.view = { before: clone(options.view.before), after: clone(options.view.after) };
  if (options.templates && !same(options.templates.before, options.templates.after)) entry.templates = { before: clone(options.templates.before), after: clone(options.templates.after) };
  if (options.facilitation && !same(options.facilitation.before, options.facilitation.after)) entry.facilitation = { before: clone(options.facilitation.before), after: clone(options.facilitation.after) };
  if (options.collaboration && !same(options.collaboration.before, options.collaboration.after)) entry.collaboration = { before: clone(options.collaboration.before), after: clone(options.collaboration.after) };
  return entry.itemDeltas.length || entry.view || entry.templates || entry.facilitation || entry.collaboration ? entry : null;
}

function mergeEntries(previous: WhiteboardHistoryEntry, next: WhiteboardHistoryEntry): WhiteboardHistoryEntry {
  const byId = new Map<string, WhiteboardHistoryItemDelta>();
  for (const delta of previous.itemDeltas) byId.set(delta.id, clone(delta));
  for (const delta of next.itemDeltas) {
    const existing = byId.get(delta.id);
    if (!existing) byId.set(delta.id, clone(delta));
    else byId.set(delta.id, {
      id: delta.id,
      before: existing.before,
      beforeIndex: existing.beforeIndex,
      after: clone(delta.after),
      afterIndex: delta.afterIndex,
    });
  }
  const itemDeltas = [...byId.values()].filter((delta) => !same(delta.before, delta.after));
  const mergeMeta = <T,>(left?: WhiteboardHistoryMetaDelta<T>, right?: WhiteboardHistoryMetaDelta<T>): WhiteboardHistoryMetaDelta<T> | undefined => {
    if (!left && !right) return undefined;
    const merged = { before: left?.before, after: right ? right.after : left?.after };
    return same(merged.before, merged.after) ? undefined : clone(merged);
  };
  return {
    documentId: previous.documentId,
    at: next.at,
    coalesceKey: next.coalesceKey,
    itemDeltas,
    view: mergeMeta(previous.view, next.view),
    templates: mergeMeta(previous.templates, next.templates),
    facilitation: mergeMeta(previous.facilitation, next.facilitation),
    collaboration: mergeMeta(previous.collaboration, next.collaboration),
  };
}

export function recordWhiteboardHistory(state: WhiteboardHistoryState, entry: WhiteboardHistoryEntry | null): WhiteboardHistoryState {
  if (!entry || state.documentId !== entry.documentId) return state;
  const last = state.past.at(-1);
  const coalesce = Boolean(
    last && entry.coalesceKey && last.coalesceKey === entry.coalesceKey && entry.at >= last.at && entry.at - last.at <= WHITEBOARD_HISTORY_COALESCE_MS,
  );
  let past: WhiteboardHistoryEntry[];
  if (coalesce) {
    const merged = mergeEntries(last!, entry);
    const meaningful = merged.itemDeltas.length > 0 || Boolean(merged.view || merged.templates || merged.facilitation || merged.collaboration);
    past = meaningful ? [...state.past.slice(0, -1), merged] : state.past.slice(0, -1);
  } else {
    past = [...state.past, entry].slice(-WHITEBOARD_HISTORY_MAX_ENTRIES);
  }
  return { ...state, past, future: [] };
}

export function stepWhiteboardHistory(
  state: WhiteboardHistoryState,
  direction: 'undo' | 'redo',
): { state: WhiteboardHistoryState; entry?: WhiteboardHistoryEntry } {
  if (direction === 'undo') {
    const entry = state.past.at(-1);
    if (!entry) return { state };
    return {
      entry,
      state: { ...state, past: state.past.slice(0, -1), future: [entry, ...state.future].slice(0, WHITEBOARD_HISTORY_MAX_ENTRIES) },
    };
  }
  const entry = state.future[0];
  if (!entry) return { state };
  return {
    entry,
    state: { ...state, past: [...state.past, entry].slice(-WHITEBOARD_HISTORY_MAX_ENTRIES), future: state.future.slice(1) },
  };
}

function patchArrayById<T extends { id: string }>(current: readonly T[], before: readonly T[], after: readonly T[], direction: 'undo' | 'redo'): T[] {
  const beforeMap = new Map(before.map((value) => [value.id, value]));
  const afterMap = new Map(after.map((value) => [value.id, value]));
  const changedIds = new Set<string>();
  for (const id of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    if (!same(beforeMap.get(id), afterMap.get(id))) changedIds.add(id);
  }
  if (!changedIds.size) return current.map((value) => clone(value));
  const target = direction === 'undo' ? before : after;
  const targetMap = new Map(target.map((value) => [value.id, value]));
  const output = current.filter((value) => !changedIds.has(value.id)).map((value) => clone(value));
  for (const value of target) {
    if (changedIds.has(value.id) && targetMap.has(value.id)) output.push(clone(value));
  }
  return output;
}

function applyCollaborationDelta(
  current: WhiteboardCollaborationState | undefined,
  delta: WhiteboardHistoryMetaDelta<WhiteboardCollaborationState> | undefined,
  direction: 'undo' | 'redo',
): WhiteboardCollaborationState | undefined {
  if (!delta) return current ? clone(current) : undefined;
  const before = delta.before;
  const after = delta.after;
  const target = direction === 'undo' ? before : after;
  if (!target) return current ? clone(current) : undefined;
  if (!current) return clone(target);
  const result = clone(current);
  if (!same(before?.enabled, after?.enabled)) result.enabled = clone(target.enabled);
  if (!same(before?.localDisplayName, after?.localDisplayName)) result.localDisplayName = clone(target.localDisplayName);
  if (!same(before?.objectAuthorshipEnabled, after?.objectAuthorshipEnabled)) {
    result.objectAuthorshipEnabled = clone(target.objectAuthorshipEnabled);
  }
  if (!same(before?.spaceBinding, after?.spaceBinding)) result.spaceBinding = clone(target.spaceBinding);
  if (!same(before?.guestAccess, after?.guestAccess)) result.guestAccess = clone(target.guestAccess);
  result.comments = patchArrayById(current.comments, before?.comments ?? [], after?.comments ?? [], direction);
  result.activity = patchArrayById(current.activity, before?.activity ?? [], after?.activity ?? [], direction);
  // Collaboration clocks and remote object truth are monotonic and never rewound by local document undo.
  result.lamport = current.lamport;
  result.objectVersions = clone(current.objectVersions);
  result.objectAuthors = clone(current.objectAuthors);
  return result;
}

function applyItemDeltas(current: readonly WhiteboardItem[], deltas: readonly WhiteboardHistoryItemDelta[], direction: 'undo' | 'redo'): WhiteboardItem[] {
  if (!deltas.length) return current.map((item) => item);
  const affected = new Set(deltas.map((delta) => delta.id));
  const output = current.filter((item) => !affected.has(item.id)).map((item) => item);
  const insertions = deltas
    .map((delta) => ({ item: direction === 'undo' ? delta.before : delta.after, index: direction === 'undo' ? delta.beforeIndex : delta.afterIndex }))
    .filter((entry): entry is { item: WhiteboardItem; index: number } => Boolean(entry.item))
    .sort((left, right) => left.index - right.index);
  for (const insertion of insertions) output.splice(Math.max(0, Math.min(output.length, insertion.index)), 0, clone(insertion.item));
  return output;
}

export function applyWhiteboardHistoryEntry(
  current: WhiteboardHistoryAppliedState,
  entry: WhiteboardHistoryEntry,
  direction: 'undo' | 'redo',
): WhiteboardHistoryAppliedState {
  const pick = <T,>(delta: WhiteboardHistoryMetaDelta<T> | undefined): T | undefined => delta ? clone(direction === 'undo' ? delta.before : delta.after) : undefined;
  return {
    items: applyItemDeltas(current.items, entry.itemDeltas, direction),
    view: entry.view ? pick(entry.view) : current.view,
    templates: entry.templates ? pick(entry.templates) : current.templates,
    facilitation: entry.facilitation ? pick(entry.facilitation) : current.facilitation,
    collaboration: applyCollaborationDelta(current.collaboration, entry.collaboration, direction),
  };
}
