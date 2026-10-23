// STATUS: PLATIN — BATCH-CONNECT-1: bounded send-attempt state machine for the Connect outbox.
//
// The compose action only creates a local queue entry (`domain/connectMailCore.ts:149`). There is no
// SMTP transport in this build, so an attempt can only ever be *attempted* through an injected
// `send` function. Everything here is pure: time, jitter and failures are arguments, never clocks.

import type { ConnectMessage } from './types';

export const CONNECT_SEND_POLICY = {
  /** Bounded attempt count; after this the entry is `failed`, never silently retried forever. */
  maxAttempts: 5,
  /** Exponential backoff base and cap in milliseconds. */
  baseBackoffMs: 30_000,
  maxBackoffMs: 30 * 60_000,
  /** Deterministic jitter is applied as a fraction of the backoff, from an injected seed. */
  jitterFraction: 0.2,
} as const;

export const CONNECT_SEND_ERROR_CODES = [
  'no-transport',
  'transport-connected-but-unconfirmed',
  'relay-rejected',
  'auth-required',
  'recipient-rejected',
  'rate-limited',
  'timeout',
  'tls-failure',
  'offline',
  'unknown',
] as const;
export type ConnectSendErrorCode = (typeof CONNECT_SEND_ERROR_CODES)[number];

export type ConnectQueueAction = 'wait' | 'attempt' | 'fail';

export interface ConnectQueueDecision {
  readonly action: ConnectQueueAction;
  /** Bounded machine code, present when `action === 'fail'`. */
  readonly code?: ConnectSendErrorCode;
  /** Millisecond timestamp of the next allowed attempt, present when `action === 'wait'`. */
  readonly nextAttemptAt?: number;
  /** The attempt number this decision would perform (1-based), present when `action === 'attempt'`. */
  readonly attempt?: number;
}

/**
 * Exponential backoff with a bounded, deterministic jitter. The jitter seed must be supplied by the
 * caller (for example from a hash of the queue id) so the function stays pure and testable.
 */
export function sendBackoffMs(attempt: number, seed = 0): number {
  const boundedAttempt = Math.max(1, Math.min(CONNECT_SEND_POLICY.maxAttempts, Math.floor(attempt)));
  const raw = CONNECT_SEND_POLICY.baseBackoffMs * 2 ** (boundedAttempt - 1);
  const capped = Math.min(CONNECT_SEND_POLICY.maxBackoffMs, raw);
  const fraction = Math.abs(Math.sin(seed));
  return Math.round(capped * (1 - CONNECT_SEND_POLICY.jitterFraction + CONNECT_SEND_POLICY.jitterFraction * fraction));
}

export interface ConnectQueueDecisionInput {
  /** Attempts already recorded. This is the only source for a "retried" claim. */
  readonly attempts: number;
  /** Scheduled local release time from `queueDraft`. */
  readonly releaseAt: number;
  /** End of the undo window; before it expires nothing may be sent. */
  readonly undoUntil: number;
  readonly now: number;
  /** Whether a transport really reported itself connected. */
  readonly transportConnected: boolean;
  /** Whether the user is offline; offline never counts as a failed attempt. */
  readonly offline?: boolean;
  /** Seed for the deterministic jitter, e.g. derived from the queue id. */
  readonly jitterSeed?: number;
}

/**
 * Decide what may happen to a queued message now. This is the function that replaces the previous
 * "queued forever, no attempt ever recorded" behaviour: it either waits, really attempts, or fails.
 */
export function decideQueueAction(input: ConnectQueueDecisionInput): ConnectQueueDecision {
  const attempts = Math.max(0, Math.floor(input.attempts));
  if (attempts >= CONNECT_SEND_POLICY.maxAttempts) {
    return { action: 'fail', code: 'relay-rejected' };
  }
  if (input.offline) {
    return { action: 'wait', nextAttemptAt: input.now + sendBackoffMs(attempts + 1, input.jitterSeed) };
  }
  if (!input.transportConnected) {
    // Nothing to send with. This is not a delivery failure and must not be recorded as an attempt.
    return { action: 'wait', code: 'no-transport', nextAttemptAt: Number.POSITIVE_INFINITY };
  }
  if (input.now <= input.undoUntil) {
    return { action: 'wait', nextAttemptAt: input.undoUntil + 1 };
  }
  if (input.now < input.releaseAt) {
    return { action: 'wait', nextAttemptAt: input.releaseAt };
  }
  return { action: 'attempt', attempt: attempts + 1 };
}

export interface ConnectSendAttemptOutcome {
  readonly accepted: boolean;
  readonly code?: ConnectSendErrorCode;
}

export interface ConnectAttemptRecord {
  readonly attempts: number;
  readonly delivery: ConnectMessage['delivery'];
  readonly failureCode?: ConnectSendErrorCode;
  readonly lastAttemptAt: number;
  /** Only set when the transport really accepted the message. */
  readonly ack?: 'relay-accepted';
  readonly nextAttemptAt?: number;
}

/**
 * Record the result of one real attempt. `accepted: true` is the only way to reach `delivery: 'sent'`
 * and `ack: 'relay-accepted'`; a rejection increments the counter and schedules the next bounded try.
 */
export function recordSendAttempt(
  previousAttempts: number,
  outcome: ConnectSendAttemptOutcome,
  now: number,
  jitterSeed = 0,
): ConnectAttemptRecord {
  const attempts = Math.max(0, Math.floor(previousAttempts)) + 1;
  if (outcome.accepted) {
    return { attempts, delivery: 'sent', lastAttemptAt: now, ack: 'relay-accepted' };
  }
  const code = outcome.code && CONNECT_SEND_ERROR_CODES.includes(outcome.code) ? outcome.code : 'unknown';
  if (attempts >= CONNECT_SEND_POLICY.maxAttempts) {
    return { attempts, delivery: 'failed', failureCode: code, lastAttemptAt: now };
  }
  return {
    attempts,
    delivery: 'queued',
    failureCode: code,
    lastAttemptAt: now,
    nextAttemptAt: now + sendBackoffMs(attempts, jitterSeed),
  };
}

/** Deterministic jitter seed derived from a queue/message id. */
export function jitterSeedFrom(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 1_000_003;
  }
  return hash;
}

/**
 * Apply a decision to a stored message without inventing an outcome. Waiting produces no state
 * change at all; only a recorded attempt may set `deliveryAttempts`/`deliveryAck`.
 */
export function applyDecision(
  message: ConnectMessage,
  decision: ConnectQueueDecision,
  outcome: ConnectSendAttemptOutcome | undefined,
  now: number,
  jitterSeed = 0,
): ConnectMessage {
  if (decision.action !== 'attempt') return message;
  const record = recordSendAttempt(message.deliveryAttempts ?? 0, outcome ?? { accepted: false, code: 'unknown' }, now, jitterSeed);
  return {
    ...message,
    delivery: record.delivery,
    deliveryAttempts: record.attempts,
    deliveryFailureCode: record.failureCode,
    deliveryLastAttemptAt: record.lastAttemptAt,
    deliveryAck: record.ack ?? message.deliveryAck ?? 'none',
  };
}

/**
 * Compare a locale-independent key for a message so a retry of the same logical mail is recognised.
 * A repeated failure on a different body is a different mail and must not be deduplicated away.
 */
export function retryKey(message: ConnectMessage): string {
  return [
    message.recipients.slice().sort().join(','),
    message.subject.trim().toLowerCase(),
    String(message.body.length),
  ].join('|');
}

export interface RetryDiff {
  readonly newlyFailed: string[];
  readonly newlySent: string[];
  attemptsMade: number;
}

/**
 * Run one bounded pass over an outbox. `send` is the only way a message can become `sent`; it is
 * injected so this module never pretends a transport exists. `send` resolving means the transport
 * accepted the message — a rejection must throw or resolve `{accepted: false}`.
 */
export async function drainOutbox(
  messages: readonly ConnectMessage[],
  send: (message: ConnectMessage) => Promise<ConnectSendAttemptOutcome>,
  input: { now: number; transportConnected: boolean; offline?: boolean; maxPerPass?: number },
): Promise<{ messages: ConnectMessage[]; diff: RetryDiff }> {
  const maxPerPass = Math.max(1, Math.min(64, input.maxPerPass ?? 16));
  const out: ConnectMessage[] = [];
  const newlyFailed: string[] = [];
  const newlySent: string[] = [];
  let attemptsMade = 0;
  let performed = 0;
  for (const message of messages) {
    if (message.delivery !== 'queued') {
      out.push(message);
      continue;
    }
    const decision = decideQueueAction({
      attempts: message.deliveryAttempts ?? 0,
      releaseAt: message.deliveryLastAttemptAt ?? input.now,
      undoUntil: 0,
      now: input.now,
      transportConnected: input.transportConnected,
      offline: input.offline,
      jitterSeed: jitterSeedFrom(message.id),
    });
    if (decision.action !== 'attempt' || performed >= maxPerPass) {
      out.push(message);
      continue;
    }
    performed += 1;
    let outcome: ConnectSendAttemptOutcome = { accepted: false, code: 'unknown' };
    try {
      const result = await send(message);
      outcome = { accepted: result.accepted === true, code: result.code };
    } catch (error) {
      const code = error instanceof Error && (CONNECT_SEND_ERROR_CODES as readonly string[]).includes(error.message)
        ? (error.message as ConnectSendErrorCode)
        : 'unknown';
      outcome = { accepted: false, code };
    }
    const next = applyDecision(message, decision, outcome, input.now, jitterSeedFrom(message.id));
    attemptsMade += 1;
    if (next.delivery === 'sent') newlySent.push(next.id);
    if (next.delivery === 'failed') newlyFailed.push(next.id);
    out.push(next);
  }
  return { messages: out, diff: { newlyFailed, newlySent, attemptsMade } };
}
