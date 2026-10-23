// STATUS: PLATIN — BATCH-CONNECT-7: the bridge between the visible message list and the pure sync core.
//
// `domain/connectSyncCore.ts` works on canonical `ConnectMessage` records; the visible list works on the
// legacy record in `domain/types.ts`. This module is the only conversion point, so the sync core never
// needs a second message model and the UI never re-implements UID bookkeeping.

import type { ConnectMessage as CoreMessage } from '../../../platform/connectors/connectCoreTypes';
import { legacyMessageToCore } from './connectUiBridge';
import type { ConnectMessage } from '../domain/types';

export interface InboxRow {
  readonly uid: number;
  readonly message: CoreMessage;
}

/**
 * Turn the stored messages into sync rows. A message that already carries a server UID keeps it, so a
 * repeated sync does not renumber the mailbox; everything else is appended in stable order.
 */
export function toInboxRows(messages: readonly ConnectMessage[]): InboxRow[] {
  const used = new Set<number>();
  const rows: InboxRow[] = [];
  let next = 1;
  const allocate = (): number => {
    while (used.has(next)) next += 1;
    used.add(next);
    return next;
  };
  for (const message of messages) {
    const existing = message.remoteUid;
    const uid = existing !== undefined && Number.isInteger(existing) && existing > 0 && !used.has(existing) ? existing : allocate();
    rows.push({ uid, message: legacyMessageToCore(message) });
  }
  return rows;
}

/** Record the UID the server assigned. The UID is the only proof of a server-confirmed object. */
export function assignRemoteUid(message: ConnectMessage, uid: number | undefined): ConnectMessage {
  if (uid === undefined || !Number.isInteger(uid) || uid < 1) return message;
  return { ...message, remoteUid: uid };
}

/** The folder a sync row belongs to, as the server would report it. */
export function remoteFolderPathFor(message: ConnectMessage): string {
  return message.remoteFolderId ?? `INBOX/${message.folder.toUpperCase()}`;
}

export interface SyncEnvelopePlan {
  readonly folders: string[];
  readonly totalMessages: number;
}

/**
 * Describe what a sync would cover *before* it runs, so the UI can show a real total instead of an
 * indefinite spinner. Nothing is fetched here.
 */
export function planSyncEnvelope(messages: readonly ConnectMessage[]): SyncEnvelopePlan {
  const folders = [...new Set(messages.map(remoteFolderPathFor))].sort();
  return { folders, totalMessages: messages.length };
}

/** True only when every stored message carries a server UID. */
export function allMessagesHaveUid(messages: readonly ConnectMessage[]): boolean {
  return messages.length > 0 && messages.every((message) => typeof message.remoteUid === 'number' && message.remoteUid > 0);
}
