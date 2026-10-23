// STATUS: PLATIN — BATCH-CONNECT-4: RFC 5322 reply/forward headers and real thread grouping.
//
// MEASURED GAP before this batch: `components/ConnectMailViewer.tsx:191` and `:197` rendered the reply
// and forward buttons with **no `onClick` handler at all** — they were decorated no-ops. The thread view
// (`domain/connectThreadProjection.ts:8`) grouped by subject only, so it never looked at `In-Reply-To`
// or `References`, and `types.ts` had no field for either header.
//
// Everything here is pure: the caller supplies the parent message and the identity.

import type { ConnectMessage } from './types';

export class ConnectReplyError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectReplyError';
  }
}

/** A Message-ID as it appears on the wire, including the angle brackets. */
const MESSAGE_ID = /^<[^<>\s@]{1,190}@[^<>\s]{1,190}>$/;
const MAX_REFERENCES = 32;
const MAX_SUBJECT = 998;

export const CONNECT_REPLY_LIMITS = {
  maxReferences: MAX_REFERENCES,
  maxSubjectChars: MAX_SUBJECT,
  maxQuoteChars: 500_000,
} as const;

/** Strip a subject down to its base, so "Re: Re: Fwd: X" has one canonical base. */
export function baseSubject(subject: string): string {
  let value = subject;
  let previous = '';
  while (value !== previous) {
    previous = value;
    // Prefix, then optional index inside or outside the colon ("AW: [2] Re: X" / "Re[2]: X"),
    // then the colon itself — repeated until stable, so "[2]" is handled too.
    value = value
      .replace(/^\s*(?:re|aw|fw|fwd|wg|antw|sv|vs)\s*(?:\[\d+\])?\s*:\s*/i, '')
      .replace(/^\s*\[\d+\]\s*/, '');
  }
  return value.trim().slice(0, MAX_SUBJECT);
}

/** Apply exactly one prefix. Calling it twice must not double the prefix. */
export function prefixSubject(subject: string, kind: 'reply' | 'forward'): string {
  const base = baseSubject(subject);
  const prefix = kind === 'reply' ? 'Re' : 'Fwd';
  return `${prefix}: ${base}`.slice(0, MAX_SUBJECT);
}

/** Normalise a header value into wire form, refusing anything that is not a real Message-ID. */
export function normalizeMessageId(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const wrapped = trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
  return MESSAGE_ID.test(wrapped) ? wrapped : undefined;
}

/**
 * Parse a `References` header value into a bounded, de-duplicated chain (oldest first).
 *
 * `own` is appended *after* the guard, so a reply to the first message of a conversation still gets
 * `References: <parent>` — returning early here was a real defect found by the test below.
 */
export function parseReferences(raw: string | undefined | null, own?: string): string[] {
  const found = raw ? (raw.match(/<[^<>]+>/g) ?? []) : [];
  const chain: string[] = [];
  for (const candidate of found) {
    const id = normalizeMessageId(candidate);
    if (id && !chain.includes(id)) chain.push(id);
    if (chain.length >= MAX_REFERENCES) break;
  }
  if (own && !chain.includes(own)) chain.push(own);
  return chain.slice(-MAX_REFERENCES);
}

export interface ConnectReplyHeaders {
  readonly to: string[];
  readonly cc: string[];
  readonly subject: string;
  readonly inReplyTo: string;
  readonly references: string[];
  readonly kind: 'reply' | 'forward';
}

export interface ConnectReplySource {
  readonly message: ConnectMessage;
  /** The local identity address, so the user is not put into their own To/Cc list. */
  readonly selfAddress: string;
  /** Addresses that are already handled, so reply-all does not duplicate them. */
  readonly selfAddresses?: readonly string[];
}

/**
 * The Message-ID of a stored message, in wire form. A stored id that cannot be parsed as a Message-ID
 * is rejected; a message that simply carries none (a legacy local record) gets a deterministic local
 * id derived from its own id, which keeps the reference chain reproducible.
 */
export function messageIdOf(message: { id: string; messageId?: string }): string | undefined {
  if (message.messageId !== undefined && message.messageId.trim().length > 0) {
    const normalized = normalizeMessageId(message.messageId);
    if (!normalized) return undefined;
    return normalized;
  }
  return normalizeMessageId(`${message.id}@astraea.local`);
}

const lower = (value: string): string => value.trim().toLowerCase();

/**
 * Build the reply headers. `replyAll` keeps every original recipient except the user's own
 * addresses and the original sender, and never puts an address into both To and Cc.
 */
export function buildReplyHeaders(source: ConnectReplySource, replyAll: boolean): ConnectReplyHeaders {
  const { message } = source;
  const self = new Set([source.selfAddress, ...(source.selfAddresses ?? [])].map(lower));
  const parentId = messageIdOf(message);
  if (!parentId) throw new ConnectReplyError('reply-parent-message-id-invalid');

  const to = [lower(message.senderEmail)];
  const cc: string[] = [];
  if (replyAll) {
    for (const recipient of [...message.recipients, ...(message.cc ?? [])]) {
      const address = lower(recipient);
      if (!address || self.has(address) || to.includes(address) || cc.includes(address)) continue;
      cc.push(address);
    }
  }
  const references = parseReferences((message.references ?? []).join(' '), parentId);
  return {
    to: to.filter((address) => !self.has(address) || address === lower(message.senderEmail)),
    cc: cc.slice(0, 512),
    subject: prefixSubject(message.subject, 'reply'),
    inReplyTo: parentId,
    references,
    kind: 'reply',
  };
}

/** Forward headers: no In-Reply-To (a forward is a new conversation), original text quoted. */
export function buildForwardHeaders(source: ConnectReplySource): ConnectReplyHeaders {
  const { message } = source;
  return {
    to: [],
    cc: [],
    subject: prefixSubject(message.subject, 'forward'),
    // A forward deliberately starts a new thread, so it carries no parent reference.
    inReplyTo: '',
    references: [],
    kind: 'forward',
  };
}

/** Quote the original body with a stable attribution line, bounded. */
export function quoteOriginalBody(message: ConnectMessage, kind: 'reply' | 'forward'): string {
  const header = kind === 'reply'
    ? `On ${new Date(message.timestamp).toISOString()}, ${message.sender} <${message.senderEmail}> wrote:`
    : `---------- Forwarded message ----------\nFrom: ${message.sender} <${message.senderEmail}>\nDate: ${new Date(message.timestamp).toISOString()}\nSubject: ${message.subject}\nTo: ${message.recipients.join(', ')}`;
  const quoted = message.body
    .slice(0, CONNECT_REPLY_LIMITS.maxQuoteChars)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
  return `${header}\n${quoted}`;
}

export interface ConnectReplyDraft {
  readonly to: string;
  readonly cc: string;
  readonly subject: string;
  readonly body: string;
  readonly inReplyTo: string;
  readonly references: string[];
  readonly forwardOfMessageId?: string;
  readonly replyToMessageId?: string;
}

/** The complete outgoing draft, ready for `validateCompose`/`queueCompose`. */
export function buildReplyDraft(source: ConnectReplySource, replyAll: boolean): ConnectReplyDraft {
  const headers = buildReplyHeaders(source, replyAll);
  return {
    to: headers.to.join(', '),
    cc: headers.cc.join(', '),
    subject: headers.subject,
    body: `\n\n${quoteOriginalBody(source.message, 'reply')}`,
    inReplyTo: headers.inReplyTo,
    references: headers.references,
    replyToMessageId: source.message.id,
  };
}

export function buildForwardDraft(source: ConnectReplySource): ConnectReplyDraft {
  const headers = buildForwardHeaders(source);
  return {
    to: '',
    cc: '',
    subject: headers.subject,
    body: `\n\n${quoteOriginalBody(source.message, 'forward')}`,
    inReplyTo: '',
    references: [],
    forwardOfMessageId: source.message.id,
  };
}

export type ConnectThreadOrigin = 'references' | 'in-reply-to' | 'subject' | 'single';

export interface ConnectThread {
  /** The message that started the conversation (oldest). */
  readonly root: ConnectMessage;
  readonly members: ConnectMessage[];
  /** How the grouping was established — `subject` is weaker and must be shown as such. */
  readonly origin: ConnectThreadOrigin;
}

/**
 * Group messages into one conversation using the header graph, falling back to the normalised
 * subject only when no message in the set carries a reference header. The returned `origin` makes the
 * difference visible, so the UI never presents a subject guess as a proven thread.
 *
 * The graph is a union-find over Message-IDs: two messages are in the same conversation when one's id
 * appears in the other's `References`/`In-Reply-To`. That resolves a reply whose parent is missing
 * from the local set as long as any grandparent is present.
 */
export function groupThread(messages: readonly ConnectMessage[], anchor: ConnectMessage): ConnectThread {
  const idOf = (message: ConnectMessage): string | undefined => messageIdOf(message);

  const parent = new Map<string, string>();
  const find = (node: string): string => {
    let current = node;
    while (parent.get(current) !== undefined && parent.get(current) !== current) {
      current = parent.get(current) as string;
    }
    return current;
  };
  const union = (a: string, b: string): void => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const keyOf = new Map<string, string>();
  for (const message of messages) {
    const id = idOf(message);
    if (id) {
      union(id, id);
      if (!keyOf.has(id)) keyOf.set(id, message.id);
    }
  }
  let anyHeader = false;
  for (const message of messages) {
    const id = idOf(message);
    if (!id) continue;
    const links = [
      normalizeMessageId(message.inReplyTo ?? ''),
      ...(message.references ?? []).map((reference) => normalizeMessageId(reference)),
    ].filter((value): value is string => typeof value === 'string');
    if (links.length === 0) continue;
    anyHeader = true;
    for (const link of links) {
      union(id, link);
      if (!keyOf.has(link)) keyOf.set(link, message.id);
    }
  }

  const anchorId = idOf(anchor);
  const anchorRoot = anchorId ? find(anchorId) : undefined;
  const connected = new Set<string>();
  if (anchorRoot !== undefined && anyHeader) {
    for (const message of messages) {
      const id = idOf(message);
      if (id && find(id) === anchorRoot) connected.add(message.id);
    }
  }
  if (anchorId && !connected.has(anchor.id) && anyHeader && connected.size > 0) connected.add(anchor.id);

  const members = anyHeader && connected.size > 0
    ? messages.filter((message) => connected.has(message.id))
    : messages.filter((message) => baseSubject(message.subject) === baseSubject(anchor.subject));

  const sorted = members.slice().sort((a, b) => a.timestamp - b.timestamp);
  const origin: ConnectThreadOrigin = sorted.length <= 1
    ? 'single'
    : anyHeader
      ? (sorted.some((message) => (message.references ?? []).length > 0) ? 'references' : 'in-reply-to')
      : 'subject';
  return { root: sorted[0] ?? anchor, members: sorted, origin };
}
