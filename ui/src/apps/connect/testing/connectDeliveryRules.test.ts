// STATUS: PLATIN — BATCH-CONNECT-1 tests: no Connect status may exist without the operation behind it.
//
// This file is the executable negative test for the defect class "success without the operation":
// a stored `sent`/`encrypted`/`retried` claim with no evidence must be *reported*, not rendered.
import { describe, expect, it, vi } from 'vitest';
import {
  CONNECT_SEND_POLICY,
  applyDecision,
  decideQueueAction,
  drainOutbox,
  jitterSeedFrom,
  recordSendAttempt,
  retryKey,
  sendBackoffMs,
} from '../domain/connectDeliveryRules';
import {
  composeEvidence,
  findFalseClaims,
  mayRenderClaim,
  proveClaim,
  storedClaims,
  type ConnectClaimEvidence,
} from '../domain/connectClaims';
import { isPendingDelivery, resolveConnectDeliveryState } from '../domain/connectDeliveryState';
import { countPendingMessages, selectVisibleMessages } from '../domain/connectMailboxView';
import type { ConnectDocumentModel, ConnectMessage } from '../domain/types';

const base: ConnectMessage = {
  id: 'm1', sender: 'Me', senderEmail: 'me@example.test', recipients: ['peer@example.test'],
  subject: 'S', snippet: 's', body: 'b', timestamp: 1_000, folder: 'sent',
  isUnread: false, isStarred: false, isEncrypted: false,
};

describe('Connect claim resolver (the defect class under test)', () => {
  it('proves a claim only with the named operation', () => {
    expect(proveClaim('sent', ['smtp-accepted-by-relay']).proven).toBe(true);
    expect(proveClaim('sent', ['local-queue-entry-created']).proven).toBe(false);
    expect(proveClaim('sent', []).reason).toContain('no evidence');
    expect(proveClaim('encrypted', ['webcrypto-ciphertext-created']).proven).toBe(true);
    expect(proveClaim('retried', ['retry-attempt-recorded']).proven).toBe(true);
    expect(proveClaim('synchronised', ['imap-fetch-completed']).proven).toBe(true);
  });

  it('CATCHES the original defect: a message stored as sent+encrypted with no operation behind it', () => {
    // This is the exact shape BATCH-60 found in the compose path.
    const defect: ConnectMessage = { ...base, folder: 'sent', delivery: undefined, isEncrypted: true };
    const falseClaims = findFalseClaims(defect, []);
    expect(falseClaims.map((proof) => proof.claim).sort()).toEqual(['encrypted']);
    // The pre-BATCH-60 shape claimed "sent" through the folder alone; the folder no longer produces
    // a claim (only the explicit `delivery` field does), which is why the repaired shape is clean.
    expect(storedClaims({ ...defect, folder: 'sent' })).not.toContain('sent');
    expect(findFalseClaims({ ...defect, isEncrypted: false }, [])).toEqual([]);
  });

  it('reports the queued compose shape as clean and refuses a sent label for it', () => {
    const queued: ConnectMessage = { ...base, delivery: 'queued', isEncrypted: false };
    const evidence = composeEvidence(true);
    expect(findFalseClaims(queued, evidence)).toEqual([]);
    expect(mayRenderClaim('queued', evidence)).toBe(true);
    expect(mayRenderClaim('sent', evidence)).toBe(false);
    expect(mayRenderClaim('encrypted', evidence)).toBe(false);
  });

  it('keeps a delivered claim tied to the relay acknowledgement, not to a local queue entry', () => {
    const acked: ConnectMessage = { ...base, delivery: 'sent', deliveryAck: 'relay-accepted' };
    expect(storedClaims(acked)).toContain('delivered');
    expect(findFalseClaims(acked, ['smtp-accepted-by-relay'])).toEqual([]);
    expect(findFalseClaims(acked, ['local-queue-entry-created']).map((p) => p.claim)).toEqual(['sent', 'delivered']);
  });
});

describe('Connect send-attempt state machine', () => {
  it('never attempts anything without a transport and records no attempt', () => {
    const decision = decideQueueAction({ attempts: 0, releaseAt: 0, undoUntil: 0, now: 5_000, transportConnected: false });
    expect(decision.action).toBe('wait');
    expect(decision.code).toBe('no-transport');
    expect(decision.nextAttemptAt).toBe(Number.POSITIVE_INFINITY);
    // Waiting must not create an attempt: no claim, no counter.
    const after = applyDecision(base, decision, undefined, 5_000);
    expect(after).toBe(base);
    expect(after.deliveryAttempts).toBeUndefined();
  });

  it('never sends inside the undo window and sends only after a real release', () => {
    expect(decideQueueAction({ attempts: 0, releaseAt: 1_000, undoUntil: 10_000, now: 9_000, transportConnected: true }).action).toBe('wait');
    expect(decideQueueAction({ attempts: 0, releaseAt: 11_000, undoUntil: 10_000, now: 10_500, transportConnected: true }).action).toBe('wait');
    const attempt = decideQueueAction({ attempts: 0, releaseAt: 11_000, undoUntil: 10_000, now: 11_001, transportConnected: true });
    expect(attempt).toEqual({ action: 'attempt', attempt: 1 });
  });

  it('treats being offline as a wait, never as a failed delivery', () => {
    const decision = decideQueueAction({ attempts: 0, releaseAt: 0, undoUntil: 0, now: 5_000, transportConnected: true, offline: true });
    expect(decision.action).toBe('wait');
    expect(decision.nextAttemptAt).toBeGreaterThan(5_000);
    expect(applyDecision(base, decision, undefined, 5_000).delivery).toBeUndefined();
  });

  it('bounds the retry count and fails instead of retrying forever', () => {
    expect(decideQueueAction({ attempts: CONNECT_SEND_POLICY.maxAttempts, releaseAt: 0, undoUntil: 0, now: 1, transportConnected: true }))
      .toEqual({ action: 'fail', code: 'relay-rejected' });
    let attempts = 0;
    let delivery: ConnectMessage['delivery'];
    for (let attempt = 1; attempt <= CONNECT_SEND_POLICY.maxAttempts; attempt += 1) {
      const next = recordSendAttempt(attempt - 1, { accepted: false, code: 'timeout' }, 1_000 * attempt);
      attempts = next.attempts;
      delivery = next.delivery;
      expect(attempts).toBe(attempt);
      if (attempt < CONNECT_SEND_POLICY.maxAttempts) {
        expect(next.delivery).toBe('queued');
        expect(next.nextAttemptAt).toBeGreaterThan(1_000 * attempt);
      } else {
        expect(next.delivery).toBe('failed');
        expect(next.nextAttemptAt).toBeUndefined();
        expect(next.failureCode).toBe('timeout');
      }
    }
    expect(attempts).toBe(CONNECT_SEND_POLICY.maxAttempts);
    expect(delivery).toBe('failed');
  });

  it('keeps the backoff bounded and deterministic for an injected seed', () => {
    expect(sendBackoffMs(0)).toBe(sendBackoffMs(1));
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const value = sendBackoffMs(attempt, 7);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(CONNECT_SEND_POLICY.maxBackoffMs);
      expect(value).toBe(sendBackoffMs(attempt, 7));
    }
    expect(sendBackoffMs(9, 3)).toBe(sendBackoffMs(CONNECT_SEND_POLICY.maxAttempts, 3));
  });

  it('maps a rejection onto a bounded code and never onto "unknown" from a hostile code', () => {
    expect(recordSendAttempt(0, { accepted: false, code: 'relay-rejected' }, 1).failureCode).toBe('relay-rejected');
    expect(recordSendAttempt(0, { accepted: false, code: 'not-a-code' as never }, 1).failureCode).toBe('unknown');
    expect(recordSendAttempt(0, { accepted: false }, 1).failureCode).toBe('unknown');
  });

  it('reaches sent and an ack only through an accepted attempt', () => {
    const accepted = recordSendAttempt(2, { accepted: true }, 500);
    expect(accepted).toEqual({ attempts: 3, delivery: 'sent', lastAttemptAt: 500, ack: 'relay-accepted' });
  });

  it('deduplicates a retry of the same logical mail but keeps a different body separate', () => {
    const other: ConnectMessage = { ...base, id: 'm2', body: 'different' };
    expect(retryKey(base)).toBe(retryKey({ ...base, id: 'm9' }));
    expect(retryKey(base)).not.toBe(retryKey(other));
  });

  it('drains a bounded number of attempts per pass and reports what really happened', async () => {
    const queued: ConnectMessage = { ...base, id: 'q1', delivery: 'queued' };
    const send = vi.fn(async () => ({ accepted: true }) as const);
    const { messages, diff } = await drainOutbox([queued], send, { now: 50_000, transportConnected: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(diff).toEqual({ newlyFailed: [], newlySent: ['q1'], attemptsMade: 1 });
    expect(messages[0].delivery).toBe('sent');
    expect(messages[0].deliveryAck).toBe('relay-accepted');
    expect(messages[0].deliveryAttempts).toBe(1);
  });

  it('records a thrown transport error as a bounded failure code, not as a success', async () => {
    const queued: ConnectMessage = { ...base, id: 'q2', delivery: 'queued' };
    const { messages, diff } = await drainOutbox([queued], async () => { throw new Error('tls-failure'); }, { now: 50_000, transportConnected: true });
    expect(messages[0].delivery).toBe('queued');
    expect(messages[0].deliveryFailureCode).toBe('tls-failure');
    expect(diff.newlySent).toEqual([]);
    expect(diff.attemptsMade).toBe(1);
  });

  it('does not touch the outbox without a transport', async () => {
    const queued: ConnectMessage = { ...base, id: 'q3', delivery: 'queued' };
    const send = vi.fn(async () => ({ accepted: true }) as const);
    const { messages } = await drainOutbox([queued], send, { now: 50_000, transportConnected: false });
    expect(send).not.toHaveBeenCalled();
    expect(messages[0]).toEqual(queued);
  });

  it('bounds one pass so a huge outbox cannot block the UI', async () => {
    const many = Array.from({ length: 50 }, (_, index) => ({ ...base, id: `q-${index}`, delivery: 'queued' as const }));
    const send = vi.fn(async () => ({ accepted: false, code: 'timeout' }) as const);
    const { diff } = await drainOutbox(many, send, { now: 1_000_000, transportConnected: true, maxPerPass: 4 });
    expect(diff.attemptsMade).toBe(4);
    expect(send).toHaveBeenCalledTimes(4);
  });
});

describe('Connect delivery state resolution', () => {
  it('adds a fourth honest state for prepared-but-uncarried mail', () => {
    const held = resolveConnectDeliveryState({ queued: true, encrypted: true, transportConnected: false });
    expect(held.delivery).toBe('held');
    expect(held.physicallySent).toBe(false);
    expect(held.encryptedForReal).toBe(true);
    // A connected transport that confirmed acceptance is the only way to the word "sent".
    expect(resolveConnectDeliveryState({ queued: true, transportConnected: true, relayAccepted: true }).delivery).toBe('sent');
  });

  it('treats queued, held and failed as pending, and only those three', () => {
    expect(isPendingDelivery({ delivery: 'queued' })).toBe(true);
    expect(isPendingDelivery({ delivery: 'held' })).toBe(true);
    expect(isPendingDelivery({ delivery: 'failed' })).toBe(true);
    expect(isPendingDelivery({ delivery: 'sent' })).toBe(false);
    expect(isPendingDelivery({})).toBe(false);
  });

  it('keeps pending mail out of the sent folder and visible in the queue view', () => {
    const model = {
      viewMode: 'mail', selectedFolder: 'sent', selectedMessageId: null, searchQuery: '',
      events: [], contacts: [],
      messages: [
        { ...base, id: 'pending-queued', delivery: 'queued' },
        { ...base, id: 'pending-held', delivery: 'held' },
        { ...base, id: 'pending-failed', delivery: 'failed' },
        { ...base, id: 'real-sent' },
      ],
    } as unknown as ConnectDocumentModel;
    expect(selectVisibleMessages(model).map((message) => message.id)).toEqual(['real-sent']);
    expect(selectVisibleMessages({ ...model, selectedFolder: 'queue' }).map((message) => message.id))
      .toEqual(['pending-queued', 'pending-held', 'pending-failed']);
    expect(countPendingMessages(model.messages)).toBe(3);
    expect(jitterSeedFrom('pending-queued')).toBe(jitterSeedFrom('pending-queued'));
  });
});

describe('Connect claim evidence sources stay real', () => {
  it('names every evidence source in a way a reader can verify', () => {
    const evidence: ConnectClaimEvidence[] = ['local-queue-entry-created'];
    expect(composeEvidence(true)).toEqual(evidence);
    expect(composeEvidence(false)).toEqual([]);
    expect(composeEvidence(true, true)).toContain('webcrypto-ciphertext-created');
  });
});
