// STATUS: PLATIN — BATCH-CONNECT-1: pure folder/filter facts for the Connect mail list.
// A queued, held or failed draft is not "sent", so it needs its own selectable view.

import type { ConnectDocumentModel, ConnectMessage } from '../domain/types';

/**
 * The record the sync core consumes: the visible message plus the two fields only a server can assign.
 * Keeping them on the same record avoids a second message model.
 */
export interface ConnectSyncMessage extends ConnectMessage {
  readonly remoteUid?: number;
  readonly remoteFolderId?: string;
}

import { isPendingDelivery } from './connectDeliveryState';

/** The one selectedFolder value that shows pending deliveries. */
export const CONNECT_QUEUE_FOLDER = 'queue' as const;

/** Pending (not carried by any transport) outgoing messages. */
export function countQueuedMessages(messages: readonly ConnectMessage[]): number {
  return messages.filter((message) => message.delivery === 'queued').length;
}

/** Every pending delivery, including ones whose preparation finished (held) or exhausted retries. */
export function countPendingMessages(messages: readonly ConnectMessage[]): number {
  return messages.filter((message) => isPendingDelivery(message)).length;
}

/**
 * The messages the list shows. The queue view shows exactly the pending deliveries;
 * the ordinary folder views (including "sent") never mix them in.
 */
export function selectVisibleMessages(model: ConnectDocumentModel): ConnectMessage[] {
  if (model.selectedFolder === CONNECT_QUEUE_FOLDER) {
    return model.messages.filter((message) => isPendingDelivery(message));
  }
  // A pending draft shares the storage folder with delivered mail, but it must never appear
  // under a folder label that would call it sent — it lives in the queue view instead.
  const delivered = model.messages.filter((message) => !isPendingDelivery(message));
  if (model.selectedFolder === 'all') return delivered;
  return delivered.filter((message) => message.folder === model.selectedFolder);
}

/** Labels attached to a folder kind, used by the label filter in the list header. */
export function labelsForKind(model: ConnectDocumentModel, kind: string): string[] {
  return (model.labels ?? []).filter((label) => label.kind === kind).map((label) => label.name);
}

/** Messages carrying a label, bounded by the model size. */
export function selectLabelMessages(model: ConnectDocumentModel, labelName: string): ConnectMessage[] {
  return selectVisibleMessages(model).filter((message) => (message.labels ?? []).includes(labelName));
}
