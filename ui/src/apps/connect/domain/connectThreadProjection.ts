// STATUS: DIAMANT VGT SUPREME — deterministic compact Connect thread projection.
//
// BATCH-CONNECT-4: the projection now prefers the RFC 5322 header graph and reports how the thread was
// established, so a subject-based guess can never be presented as a proven conversation.

import type { ConnectMessage } from './types';
import { baseSubject, groupThread, messageIdOf, type ConnectThread, type ConnectThreadOrigin } from './connectReplyCore';

export function normalizedThreadSubject(subject: string): string {
  return baseSubject(subject).toLocaleLowerCase().slice(0, 512);
}

/**
 * A stable conversation key. The RFC 5322 Message-ID is preferred because it survives a subject
 * change; the explicit thread id and the normalised subject are the fallbacks for legacy records.
 */
export function connectThreadKey(message: ConnectMessage): string {
  const messageId = messageIdOf(message);
  if (messageId) return `id:${messageId.slice(0, 256)}`;
  const explicit = message.threadId?.trim();
  if (explicit) return `id:${explicit.slice(0, 256)}`;
  return `subject:${normalizedThreadSubject(message.subject)}`;
}

/** The compact projection used by the viewer: header-proven when possible, subject-based otherwise. */
export function connectThreadProjection(messages: readonly ConnectMessage[], anchor: ConnectMessage): ConnectThread {
  return groupThread(messages, anchor);
}

export function connectThreadMessages(messages: readonly ConnectMessage[], anchor: ConnectMessage): ConnectMessage[] {
  return connectThreadProjection(messages, anchor).members;
}

export function connectThreadOrigin(messages: readonly ConnectMessage[], anchor: ConnectMessage): ConnectThreadOrigin {
  return connectThreadProjection(messages, anchor).origin;
}
