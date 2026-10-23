// STATUS: PLATIN — BATCH-CONNECT-2: pure IMAP sync core (UID sets, folder structure, conflicts).
//
// Nothing here opens a socket. `planSync`/`applySyncEnvelope` are the deterministic half of
// "Posteingang synchronisieren": they take a server-reported envelope and turn it into local state,
// preserving UIDs and folder paths, and they refuse anything that does not fit the bounds.

import type { ConnectFolderSyncReport, ConnectSyncState } from './types';
import type { ConnectSyncMessage } from './connectMailboxView';

export class ConnectSyncError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectSyncError';
  }
}

export const CONNECT_SYNC_LIMITS = {
  /** Per-envelope message bound; larger fetches must be chunked by the caller. */
  maxMessagesPerEnvelope: 10_000,
  /** The acceptance scenario asks for 100 real messages; the bound must comfortably exceed it. */
  acceptanceMessageCount: 100,
  maxFolderDepth: 16,
  maxFolders: 512,
  maxBodyChars: 5_000_000,
  maxUid: 4_294_967_295,
} as const;

export interface ConnectSyncProgress {
  /** Messages already applied from the announced total. */
  readonly applied: number;
  readonly total: number;
  /** Integer percentage 0…100, for a progress bar that is not a spinner guessing. */
  readonly percent: number;
  readonly done: boolean;
}

/**
 * Real progress from real counts. A progress indicator may only be shown from this function, so the
 * UI never animates a "synchronising" bar that no fetch is feeding.
 */
export function syncProgress(applied: number, total: number): ConnectSyncProgress {
  const boundedTotal = Math.max(0, Math.floor(total));
  const boundedApplied = Math.max(0, Math.min(boundedTotal, Math.floor(applied)));
  return {
    applied: boundedApplied,
    total: boundedTotal,
    percent: boundedTotal === 0 ? 0 : Math.round((boundedApplied / boundedTotal) * 100),
    done: boundedTotal > 0 && boundedApplied === boundedTotal,
  };
}

/** Split an IMAP folder path into its hierarchy, honouring the server's delimiter. */
export function splitFolderPath(path: string, delimiter = '/'): string[] {
  const normalized = path.trim();
  if (!normalized) throw new ConnectSyncError('folder-path-empty');
  if (normalized.length > 1024) throw new ConnectSyncError('folder-path-limit');
  if (!delimiter || delimiter.length !== 1) throw new ConnectSyncError('folder-delimiter-invalid');
  const parts = normalized.split(delimiter).filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > CONNECT_SYNC_LIMITS.maxFolderDepth) {
    throw new ConnectSyncError('folder-depth-limit');
  }
  for (const part of parts) {
    // IMAP forbids control characters and the closing bracket in a mailbox name (RFC 3501 §5.1).
    if (/[\u0000-\u001f\u007f]/.test(part) || part.includes(']')) throw new ConnectSyncError('folder-name-invalid');
  }
  return parts;
}

/** Re-join a hierarchy with the server delimiter, so a stored path round-trips byte-identically. */
export function joinFolderPath(parts: readonly string[], delimiter = '/'): string {
  return parts.join(delimiter);
}

export interface ConnectSyncEnvelope {
  /** UIDVALIDITY of the folder; a change means every cached UID must be discarded. */
  readonly uidValidity?: number;
  readonly uidNext?: number;
  /** Server-reported total message count for this folder. */
  readonly messageCount: number;
  readonly folderPath: string;
  readonly folderDelimiter?: string;
  /**
   * `true` when this envelope contains the whole folder state. Only a complete envelope may set
   * `reconciledAt` and thereby allow the word "synchronised".
   */
  readonly complete?: boolean;
  readonly messages: ReadonlyArray<{
    readonly uid: number;
    readonly message: ConnectSyncMessage;
    readonly deleted?: boolean;
  }>;
}

export interface ConnectSyncConflict {
  readonly messageId: string;
  readonly local: string;
  readonly remote: string;
  readonly resolution: 'unresolved' | 'local' | 'remote';
}

export interface ConnectSyncResult {
  readonly state: ConnectSyncState;
  readonly messages: ConnectSyncMessage[];
  readonly report: ConnectFolderSyncReport;
  readonly conflicts: ConnectSyncConflict[];
  /** Messages newly stored, in envelope order. */
  readonly added: string[];
  /** Messages whose remote UID was confirmed for the first time. */
  readonly confirmed: string[];
}

const LOCAL_VIEW = (message: ConnectSyncMessage): string =>
  `${message.folder}|${message.isUnread ? 'unread' : 'read'}|${message.isStarred ? 'starred' : 'plain'}|${(message.labels ?? []).join(',')}`;

/**
 * Apply one folder envelope. `uidValidity` changes invalidate the cached UID map and force a resync
 * instead of silently keeping stale UIDs (which is how mail clients duplicate or lose messages).
 */
export function applySyncEnvelope(
  state: ConnectSyncState,
  existing: readonly ConnectSyncMessage[],
  envelope: ConnectSyncEnvelope,
  now = Date.now(),
): ConnectSyncResult {
  if (envelope.messages.length > CONNECT_SYNC_LIMITS.maxMessagesPerEnvelope) {
    throw new ConnectSyncError('sync-envelope-limit');
  }
  if (!Number.isInteger(envelope.messageCount) || envelope.messageCount < 0) {
    throw new ConnectSyncError('sync-count-invalid');
  }
  const delimiter = envelope.folderDelimiter ?? '/';
  const parts = splitFolderPath(envelope.folderPath, delimiter);
  const folderPath = joinFolderPath(parts, delimiter);

  const previousReport = state.folders.find((report) => report.path === folderPath);
  const uidValidityChanged =
    previousReport?.uidValidity !== undefined &&
    envelope.uidValidity !== undefined &&
    previousReport.uidValidity !== envelope.uidValidity;

  const byId = new Map(existing.map((message) => [message.id, message]));
  const conflicts: ConnectSyncConflict[] = [];
  const added: string[] = [];
  const confirmed: string[] = [];
  const seenUids = new Set<number>();

  for (const entry of envelope.messages) {
    if (!Number.isInteger(entry.uid) || entry.uid < 1 || entry.uid > CONNECT_SYNC_LIMITS.maxUid) {
      throw new ConnectSyncError('sync-uid-invalid');
    }
    if (seenUids.has(entry.uid)) throw new ConnectSyncError('sync-uid-duplicate');
    seenUids.add(entry.uid);
    const current = byId.get(entry.message.id);
    if (entry.deleted) {
      byId.delete(entry.message.id);
      continue;
    }
    if (!current) {
      const stored: ConnectSyncMessage = { ...entry.message, remoteUid: entry.uid, remoteFolderId: folderPath };
      byId.set(stored.id, stored);
      added.push(stored.id);
      continue;
    }
    const local: ConnectSyncMessage = { ...current, remoteUid: entry.uid, remoteFolderId: folderPath };
    // A UID that changed for the same message id is a real conflict, not a silent overwrite.
    if (current.remoteUid !== undefined && current.remoteUid !== entry.uid) {
      conflicts.push({
        messageId: entry.message.id,
        local: `uid:${current.remoteUid}`,
        remote: `uid:${entry.uid}`,
        resolution: 'unresolved',
      });
      byId.set(entry.message.id, local);
      continue;
    }
    if (LOCAL_VIEW(current) !== LOCAL_VIEW(entry.message)) {
      conflicts.push({
        messageId: entry.message.id,
        local: LOCAL_VIEW(current),
        remote: LOCAL_VIEW(entry.message),
        resolution: 'unresolved',
      });
    }
    byId.set(entry.message.id, local);
    confirmed.push(entry.message.id);
  }

  const report: ConnectFolderSyncReport = {
    path: folderPath,
    uidValidity: envelope.uidValidity,
    uidNext: envelope.uidNext,
    messageCount: envelope.messageCount,
    // Counted from what really ended up in the store, so `isFolderSynchronised` compares two facts.
    storedCount: [...byId.values()].filter((message) => message.remoteFolderId === folderPath).length,
    lastUid: seenUids.size ? Math.max(...seenUids) : previousReport?.lastUid,
    reconciledAt: envelope.complete ? now : previousReport?.reconciledAt,
  };
  const folders = [...state.folders.filter((entry) => entry.path !== folderPath), report];
  if (folders.length > CONNECT_SYNC_LIMITS.maxFolders) throw new ConnectSyncError('sync-folder-limit');

  return {
    state: {
      ...state,
      folders,
      lastSyncAt: now,
      inProgress: false,
      // A UIDVALIDITY change invalidates the local UID map: the caller must refetch, and the state
      // says so instead of pretending the old UIDs are still meaningful.
      syncToken: uidValidityChanged ? `${folderPath}:uidvalidity-changed` : (state.syncToken ?? envelope.uidValidity?.toString()),
      conflicts: [...state.conflicts.filter((conflict) => !conflicts.some((next) => next.messageId === conflict.messageId)), ...conflicts],
    },
    messages: [...byId.values()],
    report,
    conflicts,
    added,
    confirmed,
  };
}

/**
 * `true` only when the folder was reconciled against a *complete* server envelope and the stored
 * message count matches what the server reported. This is the only allowed source for the word
 * "synchronised" in the Connect UI — a partial (delta) fetch never produces it.
 */
export function isFolderSynchronised(state: ConnectSyncState, folderPath: string): boolean {
  if (state.inProgress) return false;
  const reports = state.folders.filter((entry) => entry.path === folderPath);
  if (reports.length !== 1) return false;
  const report = reports[0];
  if (!report.reconciledAt) return false;
  return report.storedCount === report.messageCount;
}

/** Short, non-lying sync summary: counts and a timestamp, never the word "synchronised" by itself. */
export function syncSummary(state: ConnectSyncState): string {
  if (state.inProgress) return 'sync-running';
  if (!state.lastSyncAt) return 'sync-never';
  const folders = state.folders.length;
  const conflicts = state.conflicts.length;
  return `sync:${folders}:${conflicts}:${state.lastSyncAt}`;
}

/**
 * Queue a local change made while offline. Bounded, and it refuses to queue a change for a message
 * that does not exist, so a flush can never invent a remote operation.
 */
export function queueOfflineChange(
  state: ConnectSyncState,
  messages: readonly { readonly id: string }[],
  change: ConnectSyncState['pending'][number],
): ConnectSyncState {
  if (state.pending.length >= 100_000) throw new ConnectSyncError('sync-pending-limit');
  if (!messages.some((message) => message.id === change.messageId)) throw new ConnectSyncError('sync-message-unknown');
  const pending = state.pending.filter((entry) => !(entry.messageId === change.messageId && entry.op === change.op));
  return { ...state, pending: [...pending, change] };
}

/** Nothing is flushed without a connected transport; the flush reports what it really did. */
export function planOfflineFlush(
  state: ConnectSyncState,
  transportConnected: boolean,
): { flushable: ConnectSyncState['pending']; blocked: number } {
  if (!transportConnected) return { flushable: [], blocked: state.pending.length };
  return { flushable: [...state.pending], blocked: 0 };
}
