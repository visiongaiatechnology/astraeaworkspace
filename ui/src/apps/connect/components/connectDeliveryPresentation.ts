// STATUS: PLATIN — BATCH-60: the words the Connect UI is allowed to use for an outgoing message.
// Pure presentation decisions; the component only renders their result.

import type { ConnectCopy } from '../locale/connectLocale';

/**
 * The full, concrete notice printed after the compose action.
 * It always says: queued, not sent, no transport, and when the local release is scheduled.
 */
export function connectQueuedNotice(copy: ConnectCopy, scheduledRelease: string): string {
  return `${copy.queuedNotice} ${copy.queuedReleaseAt(scheduledRelease)}`;
}

/**
 * How an outgoing message is labelled. A queued draft must never be labelled with the
 * folder word ("Gesendet"/"Sent"); it is labelled with the pending state instead.
 */
export function connectSentLabel(copy: ConnectCopy, delivery?: 'queued' | 'sent' | 'failed'): string {
  return delivery === 'queued' ? copy.queuedMessage : copy.sent;
}
