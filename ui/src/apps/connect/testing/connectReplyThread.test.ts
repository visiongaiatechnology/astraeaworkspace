// STATUS: PLATIN — BATCH-CONNECT-4 tests: reply/forward headers, thread grouping, compose transitions.
//
// Counter-check record (see BATCH-CONNECT/INVENTORY.md): before the fix, `ConnectMailViewer.tsx:191,197`
// rendered the reply and forward buttons without an `onClick`, so a source contract cannot find a
// handler for them and the thread projection ignored `In-Reply-To`/`References` entirely.
import { describe, expect, it } from 'vitest';
import {
  baseSubject,
  buildForwardDraft,
  buildForwardHeaders,
  buildReplyDraft,
  buildReplyHeaders,
  groupThread,
  messageIdOf,
  normalizeMessageId,
  parseReferences,
  prefixSubject,
  quoteOriginalBody,
} from '../domain/connectReplyCore';
import {
  addDraftAttachment,
  parseRecipientList,
  composeSecurityNote,
  removeDraftAttachment,
  seedComposeDraft,
  validateComposeDraft,
  type ConnectComposeDraft,
} from '../domain/connectComposeCore';
import { connectThreadKey, connectThreadMessages, connectThreadOrigin, normalizedThreadSubject } from '../domain/connectThreadProjection';
import type { ConnectMessage } from '../domain/types';
import type { ConnectAttachment } from '../../../platform/connectors/connectCoreTypes';

const msg = (overrides: Partial<ConnectMessage> & { id: string }): ConnectMessage => ({
  sender: 'Sovereign Auditor', senderEmail: 'auditor@example.test', recipients: ['engineer@example.test'],
  subject: 'Security Review', snippet: 's', body: 'line one\nline two', timestamp: 1_700_000_000_000,
  folder: 'inbox', isUnread: true, isStarred: false, isEncrypted: false, ...overrides,
});

const attachment = (overrides: Partial<ConnectAttachment> = {}): ConnectAttachment => ({
  id: 'a1', name: 'proof.pdf', sizeBytes: 1024, declaredMime: 'application/pdf', detectedMime: 'application/pdf',
  safePreview: true, malwareScanState: 'clean', ...overrides,
});

describe('Connect reply headers (RFC 5322)', () => {
  it('builds In-Reply-To, References and exactly one Re: prefix', () => {
    const parent = msg({ id: 'm1', messageId: '<m1@example.test>', subject: 'Re: Fwd: Security Review' });
    const headers = buildReplyHeaders({ message: parent, selfAddress: 'engineer@example.test' }, false);
    expect(headers.subject).toBe('Re: Security Review');
    expect(headers.inReplyTo).toBe('<m1@example.test>');
    expect(headers.references).toEqual(['<m1@example.test>']);
    expect(headers.to).toEqual(['auditor@example.test']);
  });

  it('never doubles a prefix and never strips a meaningful one from the body', () => {
    expect(prefixSubject('Re: X', 'reply')).toBe('Re: X');
    expect(prefixSubject('Fwd: X', 'reply')).toBe('Re: X');
    expect(prefixSubject('Re: Re: Fwd: Re: X', 'forward')).toBe('Fwd: X');
    expect(baseSubject('AW: [2] Re: Quartalsbericht')).toBe('Quartalsbericht');
    expect(normalizedThreadSubject('  Re:  Re: X ')).toBe('x');
  });

  it('chains References with the parent appended, bounded and de-duplicated', () => {
    const chain = parseReferences('<a@x> <b@x> <a@x>', '<c@x>');
    expect(chain).toEqual(['<a@x>', '<b@x>', '<c@x>']);
    const many = Array.from({ length: 80 }, (_, index) => `<m${index}@x>`).join(' ');
    expect(parseReferences(many).length).toBe(32);
    expect(parseReferences(many).at(-1)).toBe('<m31@x>');
    expect(parseReferences(undefined)).toEqual([]);
    expect(parseReferences('<a@x>', '<a@x>')).toEqual(['<a@x>']);
  });

  it('validates message ids instead of accepting hostile header text', () => {
    expect(normalizeMessageId('<m1@example.test>')).toBe('<m1@example.test>');
    expect(normalizeMessageId('m1@example.test')).toBe('<m1@example.test>');
    expect(normalizeMessageId('not an id')).toBeUndefined();
    expect(normalizeMessageId('<a@b> Bcc: evil@x')).toBeUndefined();
    expect(normalizeMessageId('<a@b>')).toBe('<a@b>');
    expect(normalizeMessageId('')).toBeUndefined();
  });

  it('reply-all keeps the other recipients in Cc and never lists the user twice', () => {
    const parent = msg({
      id: 'm1', messageId: '<m1@example.test>', senderEmail: 'auditor@example.test',
      recipients: ['engineer@example.test', 'lead@example.test'], cc: ['sec@example.test', 'lead@example.test', 'engineer@example.test'],
    });
    const all = buildReplyHeaders({ message: parent, selfAddress: 'engineer@example.test' }, true);
    expect(all.to).toEqual(['auditor@example.test']);
    expect(all.cc).toEqual(['lead@example.test', 'sec@example.test']);
    expect(all.cc).not.toContain('engineer@example.test');

    const single = buildReplyHeaders({ message: parent, selfAddress: 'engineer@example.test' }, false);
    expect(single.cc).toEqual([]);
  });

  it('forward starts a new conversation and carries no references', () => {
    const parent = msg({ id: 'm1', messageId: '<m1@example.test>', references: ['<older@x>'], inReplyTo: '<older@x>' });
    const headers = buildForwardHeaders({ message: parent, selfAddress: 'engineer@example.test' });
    expect(headers.inReplyTo).toBe('');
    expect(headers.references).toEqual([]);
    expect(headers.subject).toBe('Fwd: Security Review');
    expect(headers.to).toEqual([]);
  });

  it('quotes the original body with an attribution line', () => {
    const parent = msg({ id: 'm1' });
    const quoted = quoteOriginalBody(parent, 'reply');
    expect(quoted).toContain('auditor@example.test');
    expect(quoted).toContain('> line one');
    expect(quoted).toContain('> line two');
    const forwarded = quoteOriginalBody(parent, 'forward');
    expect(forwarded).toContain('Forwarded message');
    expect(forwarded).toContain('> line one');
  });

  it('produces complete drafts for both paths', () => {
    const parent = msg({ id: 'm1', messageId: '<m1@example.test>' });
    const reply = buildReplyDraft({ message: parent, selfAddress: 'engineer@example.test' }, true);
    expect(reply).toMatchObject({ to: 'auditor@example.test', subject: 'Re: Security Review', references: ['<m1@example.test>'], replyToMessageId: 'm1' });
    expect(reply.forwardOfMessageId).toBeUndefined();
    const forward = buildForwardDraft({ message: parent, selfAddress: 'engineer@example.test' });
    expect(forward).toMatchObject({ to: '', subject: 'Fwd: Security Review', references: [], forwardOfMessageId: 'm1' });
  });

  it('refuses a parent whose stored Message-ID is unusable, and derives a local one otherwise', () => {
    const broken = msg({ id: 'm1', messageId: 'not a message id at all' });
    // A stored id that cannot be a Message-ID is rejected rather than silently replaced.
    expect(() => buildReplyHeaders({ message: broken, selfAddress: 'engineer@example.test' }, false))
      .toThrowError(expect.objectContaining({ code: 'reply-parent-message-id-invalid' }));
    // A legacy record without any Message-ID gets a deterministic local one.
    const legacy = msg({ id: 'legacy-7', messageId: undefined });
    expect(messageIdOf(legacy)).toBe('<legacy-7@astraea.local>');
    expect(buildReplyHeaders({ message: legacy, selfAddress: 'engineer@example.test' }, false).references)
      .toEqual(['<legacy-7@astraea.local>']);
  });
});

describe('Connect thread grouping (header graph, not subject)', () => {
  const root = msg({ id: 'r', messageId: '<root@x>', subject: 'Topic', timestamp: 1 });
  const child = msg({ id: 'c', messageId: '<child@x>', inReplyTo: '<root@x>', references: ['<root@x>'], subject: 'Re: Topic', timestamp: 2 });
  const unrelated = msg({ id: 'u', messageId: '<other@x>', subject: 'Topic', timestamp: 4 });

  it('groups by References even when the subject differs', () => {
    const renamed = { ...child, subject: 'Completely different subject' };
    const thread = groupThread([root, renamed, unrelated], renamed);
    expect(thread.members.map((message) => message.id)).toEqual(['r', 'c']);
    expect(thread.origin).toBe('references');
    expect(thread.root.id).toBe('r');
  });

  it('excludes a same-subject message that is not in the reference graph', () => {
    const thread = groupThread([root, child, unrelated], root);
    expect(thread.members.map((message) => message.id)).toEqual(['r', 'c']);
    expect(thread.members.map((message) => message.id)).not.toContain('u');
  });

  it('bridges a missing parent through References', () => {
    const orphan = msg({ id: 'o', messageId: '<orphan@x>', inReplyTo: '<missing@x>', references: ['<root@x>', '<missing@x>'], subject: 'Re: Topic', timestamp: 5 });
    const thread = groupThread([root, orphan], orphan);
    expect(thread.members.map((message) => message.id).sort()).toEqual(['o', 'r']);
    expect(thread.origin).toBe('references');
  });

  it('falls back to the subject only when no message carries a header, and says so', () => {
    const a = msg({ id: 'a1', subject: 'Re: Same topic', timestamp: 1 });
    const b = msg({ id: 'b1', subject: 'Same topic', timestamp: 2 });
    const c = msg({ id: 'c1', subject: 'Other topic', timestamp: 3 });
    const thread = groupThread([a, b, c], a);
    expect(thread.members.map((message) => message.id)).toEqual(['a1', 'b1']);
    expect(thread.origin).toBe('subject');
    expect(groupThread([a], a).origin).toBe('single');
  });

  it('reports the origin through the projection helpers the viewer uses', () => {
    const messages = [root, child];
    expect(connectThreadOrigin(messages, child)).toBe('references');
    expect(connectThreadMessages(messages, child).map((message) => message.id)).toEqual(['r', 'c']);
    expect(connectThreadKey(root)).toBe('id:<root@x>');
    // A message whose Message-ID cannot be parsed falls back to the normalised subject key…
    expect(connectThreadKey({ ...root, messageId: 'not a message id' })).toBe('subject:topic');
    // …while a legacy record with no Message-ID at all gets a deterministic local id key.
    expect(connectThreadKey({ ...root, messageId: undefined })).toBe('id:<r@astraea.local>');
  });

  it('is bounded on a wide message set (no quadratic blow-up on hostile input)', () => {
    const wide = Array.from({ length: 2000 }, (_, index) => msg({ id: `w${index}`, messageId: `<w${index}@x>`, inReplyTo: '<root@x>', references: ['<root@x>'], timestamp: index }));
    const started = Date.now();
    const thread = groupThread([root, ...wide], root);
    expect(thread.members.length).toBe(2001);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('Connect compose draft transitions', () => {
  it('seeds reply, reply-all and forward from a message', () => {
    const parent = msg({ id: 'm1', messageId: '<m1@x>', recipients: ['me@example.test', 'lead@example.test'] });
    expect(seedComposeDraft({ mode: 'new', selfAddress: 'me@example.test' })).toMatchObject({ mode: 'new', to: '', subject: '' });
    const reply = seedComposeDraft({ mode: 'reply', message: parent, selfAddress: 'me@example.test' });
    expect(reply).toMatchObject({ mode: 'reply', to: 'auditor@example.test', subject: 'Re: Security Review', inReplyTo: '<m1@x>', replyToMessageId: 'm1' });
    expect(reply.body).toContain('> line one');
    const all = seedComposeDraft({ mode: 'reply-all', message: parent, selfAddress: 'me@example.test' });
    expect(all.cc).toBe('lead@example.test');
    const forward = seedComposeDraft({ mode: 'forward', message: parent, selfAddress: 'me@example.test' });
    expect(forward).toMatchObject({ mode: 'forward', to: '', subject: 'Fwd: Security Review', forwardOfMessageId: 'm1' });
  });

  it('validates recipients, subject, body and attachments before queueing', () => {
    const base = seedComposeDraft({ mode: 'new', selfAddress: 'me@example.test' });
    expect(validateComposeDraft(base)).toEqual({ ok: false, code: 'recipient-required' });
    expect(validateComposeDraft({ ...base, to: 'not-an-address' })).toEqual({ ok: false, code: 'recipient-invalid' });
    expect(validateComposeDraft({ ...base, to: 'a@b.c' })).toEqual({ ok: true });
    expect(validateComposeDraft({ ...base, to: 'a@b.c', subject: 'x'.repeat(999) }).code).toBe('subject-too-long');
    expect(parseRecipientList('a@b.c; d@e.f, ,g@h.i')).toEqual(['a@b.c', 'd@e.f', 'g@h.i']);
  });

  it('refuses a rejected attachment and bounds the total size — visibly, with a reason', () => {
    const base: ConnectComposeDraft = { ...seedComposeDraft({ mode: 'new', selfAddress: 'me@example.test' }), to: 'a@b.c' };
    const ok = addDraftAttachment(base, attachment());
    expect(ok.accepted).toBe(true);
    expect(ok.draft.attachments).toHaveLength(1);
    // An executable is rejected by the mail core and the reason is returned, not swallowed.
    const rejected = addDraftAttachment(base, attachment({ name: 'payload.exe' }));
    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe('attachment-executable-blocked');
    expect(rejected.draft.attachments).toHaveLength(0);
    const huge = addDraftAttachment(base, attachment({ sizeBytes: 65 * 1024 * 1024 }));
    expect(huge).toMatchObject({ accepted: false, code: 'attachment-size' });
    // A declaration/detection mismatch is rejected too (no silent type coercion).
    expect(addDraftAttachment(base, attachment({ detectedMime: 'application/zip' }))).toMatchObject({ accepted: false, code: 'attachment-mime-mismatch' });
    expect(validateComposeDraft({ ...ok.draft, attachments: [attachment({ name: 'x.exe' })] }).code).toBe('attachment-rejected');
    expect(removeDraftAttachment(ok.draft, 'a1').attachments).toHaveLength(0);
  });

  it('never claims encryption the build cannot perform', () => {
    expect(composeSecurityNote(false, false)).toEqual({ encryption: 'none', signature: 'none', note: 'no-encryption-no-key-operation' });
    expect(composeSecurityNote(false, true).encryption).toBe('none');
    expect(composeSecurityNote(true, false).encryption).toBe('in-process');
  });
});
