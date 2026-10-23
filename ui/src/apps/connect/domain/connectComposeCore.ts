// STATUS: PLATIN — BATCH-CONNECT-4/5: pure draft transitions for the compose surface.
//
// MEASURED GAP before this batch: `ConnectMailViewer` opened an empty compose form; the reply and
// forward buttons had no handler, and the attachment picker did not exist. A compose surface that
// cannot be seeded from a message cannot reply, and a forward that re-implements header logic inside a
// component drifts from the RFC rules. This module owns the transitions.

import type { ConnectAttachment } from '../../../platform/connectors/connectCoreTypes';
import { validateAttachment } from './connectMailCore';
import { buildForwardDraft, buildReplyDraft, type ConnectReplyDraft } from './connectReplyCore';
import type { ConnectMessage as LegacyMessage } from './types';

export type ConnectComposeMode = 'new' | 'reply' | 'reply-all' | 'forward';

export interface ConnectComposeDraft {
  readonly mode: ConnectComposeMode;
  readonly to: string;
  readonly cc: string;
  readonly subject: string;
  readonly body: string;
  readonly inReplyTo: string;
  readonly references: readonly string[];
  readonly replyToMessageId?: string;
  readonly forwardOfMessageId?: string;
  readonly attachments: readonly ConnectAttachment[];
}

export const CONNECT_COMPOSE_LIMITS = {
  maxAttachments: 128,
  maxAttachmentBytes: 64 * 1024 * 1024,
  maxRecipients: 1000,
  maxSubjectChars: 998,
  maxBodyChars: 5_000_000,
} as const;

const EMPTY: ConnectComposeDraft = {
  mode: 'new', to: '', cc: '', subject: '', body: '', inReplyTo: '', references: [], attachments: [],
};

/** Split a comma/semicolon separated recipient string into bounded, trimmed addresses. */
export function parseRecipientList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, CONNECT_COMPOSE_LIMITS.maxRecipients);
}

export interface ConnectDraftValidation {
  readonly ok: boolean;
  readonly code?: 'recipient-required' | 'recipient-invalid' | 'recipient-limit' | 'subject-too-long' | 'body-too-long' | 'attachment-count' | 'attachment-rejected';
  readonly message?: string;
}

/** Validate the visible compose state before it is turned into a queued draft. */
export function validateComposeDraft(draft: ConnectComposeDraft): ConnectDraftValidation {
  const recipients = [...parseRecipientList(draft.to), ...parseRecipientList(draft.cc)];
  if (recipients.length === 0) return { ok: false, code: 'recipient-required' };
  if (recipients.length > CONNECT_COMPOSE_LIMITS.maxRecipients) return { ok: false, code: 'recipient-limit' };
  for (const address of recipients) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) || address.length > 320) return { ok: false, code: 'recipient-invalid' };
  }
  if (draft.subject.length > CONNECT_COMPOSE_LIMITS.maxSubjectChars) return { ok: false, code: 'subject-too-long' };
  if (draft.body.length > CONNECT_COMPOSE_LIMITS.maxBodyChars) return { ok: false, code: 'body-too-long' };
  if (draft.attachments.length > CONNECT_COMPOSE_LIMITS.maxAttachments) return { ok: false, code: 'attachment-count' };
  for (const attachment of draft.attachments) {
    try {
      validateAttachment(attachment);
    } catch {
      return { ok: false, code: 'attachment-rejected' };
    }
  }
  return { ok: true };
}

export interface ConnectComposeSeedInput {
  readonly mode: ConnectComposeMode;
  /** Present for every mode except `new`. */
  readonly message?: LegacyMessage;
  readonly selfAddress: string;
  readonly selfAddresses?: readonly string[];
}

/**
 * Seed the compose fields for the requested mode. A reply carries `In-Reply-To` + `References` and a
 * single `Re:` prefix; a forward starts a new conversation and quotes the original.
 */
export function seedComposeDraft(input: ConnectComposeSeedInput): ConnectComposeDraft {
  if (input.mode === 'new' || !input.message) return { ...EMPTY, mode: 'new' };
  const source = { message: input.message, selfAddress: input.selfAddress, selfAddresses: input.selfAddresses };
  const header = (draft: ConnectReplyDraft): ConnectComposeDraft => ({
    mode: input.mode,
    to: draft.to,
    cc: draft.cc,
    subject: draft.subject,
    body: draft.body,
    inReplyTo: draft.inReplyTo,
    references: draft.references,
    replyToMessageId: draft.replyToMessageId,
    forwardOfMessageId: draft.forwardOfMessageId,
    attachments: [],
  });
  return input.mode === 'forward' ? header(buildForwardDraft(source)) : header(buildReplyDraft(source, input.mode === 'reply-all'));
}

/** Enter an attachment into the draft, validating it first. A rejection is *reported*, never silent. */
export function addDraftAttachment(
  draft: ConnectComposeDraft,
  attachment: ConnectAttachment,
): { draft: ConnectComposeDraft; accepted: boolean; code?: string } {
  if (draft.attachments.length >= CONNECT_COMPOSE_LIMITS.maxAttachments) {
    return { draft, accepted: false, code: 'attachment-count' };
  }
  let safe: ConnectAttachment;
  try {
    safe = validateAttachment(attachment);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'attachment-rejected';
    return { draft, accepted: false, code };
  }
  const total = draft.attachments.reduce((sum, entry) => sum + entry.sizeBytes, 0) + safe.sizeBytes;
  if (total > CONNECT_COMPOSE_LIMITS.maxAttachmentBytes) return { draft, accepted: false, code: 'attachment-size' };
  return { draft: { ...draft, attachments: [...draft.attachments, safe] }, accepted: true };
}

export function removeDraftAttachment(draft: ConnectComposeDraft, attachmentId: string): ConnectComposeDraft {
  return { ...draft, attachments: draft.attachments.filter((entry) => entry.id !== attachmentId) };
}

/**
 * What the compose surface may say about encryption. There is no key material in this build, so the
 * answer is always `none` — a real OpenPGP/S/MIME step would have to set `encryptedInProcess`.
 */
export interface ConnectComposeSecurityNote {
  readonly encryption: 'none' | 'in-process';
  readonly signature: 'none' | 'detached';
  readonly note: string;
}

export function composeSecurityNote(encryptionAvailable: boolean, signatureAvailable: boolean): ConnectComposeSecurityNote {
  if (!encryptionAvailable) {
    return { encryption: 'none', signature: signatureAvailable ? 'detached' : 'none', note: 'no-encryption-no-key-operation' };
  }
  return { encryption: 'in-process', signature: signatureAvailable ? 'detached' : 'none', note: 'encryption-layer-active' };
}
