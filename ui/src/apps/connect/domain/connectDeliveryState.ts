// STATUS: PLATIN — pure Connect delivery-state decisions. No transport, no crypto, no rendering.
//
// MEASURED FACTS this module encodes (see BATCH-CONNECT notes.md for the commands):
//  - `queueCompose` (apps/connect/application/connectUiBridge.ts:12) is `queueDraft(validateCompose(...), now, 10_000, now)`.
//    `queueDraft` (apps/connect/domain/connectMailCore.ts:149) normalizes a draft and returns a `ConnectQueuedSend`
//    with `state: 'queued'` and `releaseAt = max(releaseAt, now + bound)`. It is synchronous, so no `crypto.subtle`
//    operation (always a promise) can have run, and it never calls `releaseQueuedSend`.
//  - Nothing in apps/connect/** performs a fetch/WebSocket/SMTP call on this path.
// Therefore: the compose action produces a *queued draft*, not a sent and not an encrypted message.
//
// BATCH-CONNECT-1 added the fourth state `'held'`: a message whose local preparation really finished
// (for example a WebCrypto step that produced ciphertext) but which no transport has carried. Without
// it, such a message would have to choose between the false word "sent" and the false word "queued".

export type ConnectDeliveryState = 'queued' | 'held' | 'sent' | 'failed';

/** The persisted outbox form of a message the compose action created. */
export interface ConnectQueuedMessageShape {
  folder: 'sent';
  delivery: 'queued';
  isEncrypted: false;
}

export interface ConnectDeliveryResolutionInput {
  /** Truth of the operation, as reported by the queue/domain layer. */
  readonly queued: boolean;
  /** Whether an upstream crypto operation actually ran for this message. Defaults to false. */
  readonly encrypted?: boolean;
  /** Whether cryptography ran but failed — then the message must not claim encryption either. */
  readonly encryptionFailed?: boolean;
  /** Whether a real transport is connected. There is none in this build. */
  readonly transportConnected?: boolean;
  /** Whether a transport really accepted the message (`deliveryAck === 'relay-accepted'`). */
  readonly relayAccepted?: boolean;
}

export interface ConnectDeliveryResolution {
  readonly delivery: ConnectDeliveryState;
  /** Only true when the transport really carried the message. */
  readonly physicallySent: boolean;
  /** Only true when an upstream crypto operation really ran and succeeded. */
  readonly encryptedForReal: boolean;
  /** The outbox entry form when nothing left the process, otherwise null. */
  readonly queuedShape: ConnectQueuedMessageShape | null;
}

/**
 * Decide what the interface may claim. `physicallySent` and `encryptedForReal` are the
 * only sources of the words "sent" and "encrypted" in the UI.
 */
export function resolveConnectDeliveryState(input: ConnectDeliveryResolutionInput): ConnectDeliveryResolution {
  const encryptedForReal = Boolean(input.encrypted) && !Boolean(input.encryptionFailed);
  if (!input.queued) {
    return { delivery: 'failed', physicallySent: false, encryptedForReal, queuedShape: null };
  }
  if (input.relayAccepted && input.transportConnected) {
    return { delivery: 'sent', physicallySent: true, encryptedForReal, queuedShape: null };
  }
  if (!input.transportConnected) {
    return {
      // A real crypto step without a transport is neither "sent" nor a plain draft.
      delivery: encryptedForReal ? 'held' : 'queued',
      physicallySent: false,
      encryptedForReal,
      queuedShape: { folder: 'sent', delivery: 'queued', isEncrypted: false },
    };
  }
  // A connected transport that has not (yet) confirmed acceptance. A message whose local preparation
  // really ran is kept as 'held' — never labelled sent without a confirmation.
  return {
    delivery: encryptedForReal ? 'held' : 'sent',
    physicallySent: true,
    encryptedForReal,
    queuedShape: null,
  };
}

/**
 * A stored message is enqueued-but-not-sent when it explicitly carries a pending delivery
 * state and a real transport never confirmed it. Legacy messages without a `delivery` field
 * keep their previous (folder-derived) meaning.
 */
export function isQueuedDelivery(message: { delivery?: ConnectDeliveryState }): boolean {
  return message.delivery === 'queued';
}

/** `true` for every state that no transport has carried: queued, held and failed. */
export function isPendingDelivery(message: { delivery?: ConnectDeliveryState }): boolean {
  return message.delivery === 'queued' || message.delivery === 'held' || message.delivery === 'failed';
}
