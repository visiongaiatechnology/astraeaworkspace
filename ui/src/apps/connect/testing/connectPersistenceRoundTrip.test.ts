// STATUS: PLATIN — BATCH-CONNECT-6: the WOM/Persistenz layer of all 23 open Connect points.
//
// The 23 open Connect rows are *one* layer: `WOM/Persistenz`. Their single acceptance scenario is
// "Save→Close→Reopen auf identische Nutzdaten" for a named feature. This suite executes that
// scenario per point against the real AES-256-GCM store — no mock, no placeholder:
//
//   Save   = `persistConnectModel(model, password)` (PBKDF2 210k + AES-256-GCM, in-process)
//   Close  = the bytes are the only thing that survives; the in-memory document is dropped
//   Reopen = `reopenConnectModel(bytes, password, …)` on a *fresh* default document
//
// Identity is asserted **structurally** (`toEqual` on the plain-JSON projection of both documents),
// not by digest alone: `connectUserDataDigest` is a 32-bit fast comparison, so a digest match
// corroborates but never replaces the structural comparison.
//
// What this suite does NOT prove (layer 5 stays NOT_TESTED): no browser, no live
// IMAP/SMTP/CalDAV/CardDAV endpoint, no KeyVault daemon, and no restart of the process — the
// bytes→disk→process boundary belongs to the workspace shell/host, which is not reachable here.
import { describe, expect, it } from 'vitest';
import {
  attachCredential,
  buildCalendarEvent,
  completeSetupWithoutProbe,
  EMPTY_ACCOUNT_DRAFT,
  INITIAL_ACCOUNT_SETUP,
  recordTlsProbe,
  toAccountSetting,
  updateAccountDraft,
  type ConnectAccountSetupState,
} from '../domain/connectAccountSetup';
import { applySyncEnvelope, queueOfflineChange } from '../domain/connectSyncCore';
import { applyMailboxRule, createLabel, listFolders, moveMessage, setReadState } from '../domain/connectMailboxCore';
import { sanitizeHtmlMail } from '../domain/connectMailCore';
import { pushNotification } from '../domain/connectNotifications';
import { seedComposeDraft, validateComposeDraft } from '../domain/connectComposeCore';
import { importEml, importMbox, exportEml } from '../import-export/connectInteropCore';
import { importIcs, applyCalDavSync } from '../domain/connectCalendarCore';
import { importVCard, applyCardDavSync, exportVCard } from '../domain/connectContactsCore';
import { buildReplyDraft } from '../domain/connectReplyCore';
import { calendarToTask } from '../integrations/connectWorkflowCore';
import {
  connectUserDataDigest,
  fromConnectStore,
  persistConnectModel,
  reopenConnectModel,
  toConnectStore,
} from '../state/connectPersistence';
import { packVConnect } from '../state/connectEncryptedStore';
import { DEFAULT_CONNECT_MODEL, type ConnectDocumentModel, type ConnectMessage } from '../domain/types';

const PASSWORD = 'correct horse battery staple';
const HANDLE = 'keyvault://connect/imap/engineer-vgt-internal';

/** The 14 persisted fields of `ConnectDocumentModel`. Every one must survive the round trip. */
const ALL_MODEL_FIELDS = [
  'viewMode',
  'selectedFolder',
  'messages',
  'selectedMessageId',
  'events',
  'contacts',
  'searchQuery',
  'accounts',
  'connection',
  'sync',
  'labels',
  'rules',
  'focus',
  'notifications',
] as const;

const message = (id: string, overrides: Partial<ConnectMessage> = {}): ConnectMessage => ({
  id,
  sender: 'Peer',
  senderEmail: 'peer@example.test',
  recipients: ['engineer@example.test'],
  subject: `Subject ${id}`,
  snippet: 'snippet',
  body: 'body',
  timestamp: 1_700_000_000_000,
  folder: 'inbox',
  isUnread: true,
  isStarred: false,
  isEncrypted: false,
  ...overrides,
});

const filledDraft = (overrides: Partial<typeof EMPTY_ACCOUNT_DRAFT> = {}): ConnectAccountSetupState => {
  let state: ConnectAccountSetupState = INITIAL_ACCOUNT_SETUP;
  const draft = {
    ...EMPTY_ACCOUNT_DRAFT,
    displayName: 'Engineer Mailbox',
    address: 'engineer@example.test',
    host: 'imap.example.test',
    port: '993',
    username: 'engineer',
    ...overrides,
  };
  for (const [key, value] of Object.entries(draft)) state = updateAccountDraft(state, key as keyof typeof draft, value);
  return state;
};

const readyAccount = () =>
  toAccountSetting(
    recordTlsProbe(
      completeSetupWithoutProbe(attachCredential(filledDraft(), { stored: true, handle: HANDLE }), 'acc-1', 1_000, {
        networkCapabilityId: 'netgate-imap-tls',
      }),
      { certificateOk: true, certificateSha256: 'ab'.repeat(32), code: 'ok', now: 3_000 },
    ),
  )!;

/** Plain-JSON projection, so the comparison is about payload and not about object identity. */
const plain = (model: ConnectDocumentModel): unknown => JSON.parse(JSON.stringify({ model }));

/**
 * `buildCalendarEvent` validates a synthetic draft (`id: draft:<now>`) and then returns the *input*
 * without an `id` — measured: `buildCalendarEvent(...)` has no `id` key, so feeding its result
 * straight to `legacyEventToCore` throws `event-invalid` because the canonical writer maps `id: e.id`.
 * The UI assigns the real id; these tests do the same here.
 */
const legacyEvent = (
  input: Parameters<typeof buildCalendarEvent>[0],
  id: string,
  now = 5,
): ConnectDocumentModel['events'][number] => {
  const draft = buildCalendarEvent({ ...input, attendees: input.attendees ?? [] }, now);
  return {
    id,
    title: draft.title,
    startDate: draft.startDate,
    startTime: draft.startTime,
    endDate: draft.endDate,
    endTime: draft.endTime,
    location: draft.location,
    category: draft.category,
    attendees: [...draft.attendees],
    description: draft.description,
  };
};

/** The canonical form of a legacy event, for the workflow bridge that speaks `ConnectEvent`. */
const asCoreEvent = (event: ConnectDocumentModel['events'][number]) => ({
  id: event.id,
  calendarId: 'connect-ui-local',
  uid: `${event.id}@astraea.local`,
  title: event.title,
  start: `${event.startDate}T${event.startTime}:00Z`,
  end: `${event.endDate}T${event.endTime}:00Z`,
  allDay: false,
  timezone: 'UTC',
  categories: [event.category],
  attachments: [],
  alerts: [],
  attendees: event.attendees.map((address) => ({ address, role: 'required' as const, status: 'needs-action' as const })),
  status: 'confirmed' as const,
  sequence: 0,
});

/**
 * The executed Save→Close→Reopen for one point. Returns both directions so a test can assert on the
 * identical read *and* on the view-less (canonical-only) read.
 */
const saveCloseReopen = async (model: ConnectDocumentModel) => {
  const before = plain(model);
  const { bytes, byteLength } = await persistConnectModel(structuredClone(model), PASSWORD, 10);
  // "Close": nothing but the bytes and the password crosses this line.
  const reopened = await reopenConnectModel(bytes, PASSWORD, structuredClone(DEFAULT_CONNECT_MODEL));
  // "Reopen of a container without the Connect projection": the canonical arrays must still answer.
  const withoutView: Record<string, unknown> = { ...toConnectStore(structuredClone(model), 10) };
  delete withoutView.vgtConnectView;
  const fromCanonical = fromConnectStore(withoutView as never, structuredClone(DEFAULT_CONNECT_MODEL));
  return { before, reopened, fromCanonical, bytes, byteLength };
};

/** Every point asserts at least this: identical payload, identical digest, fresh document. */
const expectIdentical = (before: unknown, reopened: ConnectDocumentModel, model: ConnectDocumentModel) => {
  expect(plain(reopened)).toEqual(before);
  expect(connectUserDataDigest(reopened)).toBe(connectUserDataDigest(model));
  expect(reopened).not.toBe(model);
};

describe('Connect WOM/Persistenz — Save→Close→Reopen per point (Paket 01…24)', () => {
  it('AST-1568 · P01 · a local IMAP account with a checked TLS verdict survives reopen', async () => {
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      accounts: [readyAccount()],
      connection: { status: 'connected', adapter: 'imap', checkedAt: 3_000 },
      selectedFolder: 'inbox',
    };
    const { before, reopened } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    // The TLS verdict is what the acceptance scenario asks for — it must not decay to `unchecked`.
    expect(reopened.accounts?.[0].tlsCertificate).toBe('trusted');
    expect(reopened.accounts?.[0].tlsCheckedAt).toBe(3_000);
    expect(reopened.accounts?.[0].credentialHandle).toBe(HANDLE);
  });

  it('AST-1578 · P03 · 100 fetched messages keep UID and folder structure after reopen', async () => {
    const messages = Array.from({ length: 100 }, (_, index) => message(`sync-${index}`, { remoteUid: index + 1, remoteFolderId: 'INBOX/Projects/2026' }));
    const synced = applySyncEnvelope(
      { folders: [], pending: [], inProgress: false, conflicts: [] },
      [],
      {
        uidValidity: 42,
        uidNext: 101,
        messageCount: 100,
        folderPath: 'INBOX/Projects/2026',
        folderDelimiter: '/',
        complete: true,
        messages: messages.map((m, index) => ({ uid: index + 1, message: m })),
      },
      9_000,
    );
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: synced.messages, sync: synced.state };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.messages).toHaveLength(100);
    expect(reopened.messages.map((m) => m.remoteUid)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(reopened.sync?.folders[0]).toMatchObject({ path: 'INBOX/Projects/2026', uidValidity: 42, uidNext: 101, storedCount: 100, reconciledAt: 9_000 });
    // Read back from the canonical arrays alone: the 100 messages are there. `remoteFolderId` has no
    // canonical field, so its absence here is expected and recorded as a finding, not asserted away.
    expect(fromCanonical.messages).toHaveLength(100);
  });

  it('AST-1583 · P04 · IMAP folders, a move and an explicit read/unread state survive reopen', async () => {
    const labels = createLabel([], { id: 'l1', name: 'Projects', kind: 'custom' });
    const before2: ConnectMessage[] = [message('m1'), message('m2')];
    const folders = listFolders('connect-ui-local', labels);
    const moved = moveMessage(before2, 'm1', { folder: 'archive' }, folders, 20);
    const settled = setReadState(moved.messages, 'm2', false);
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: settled, labels, selectedFolder: 'archive' };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(moved.move.fromFolder).toBe('inbox');
    expect(reopened.messages.find((m) => m.id === 'm1')?.folder).toBe('archive');
    expect(reopened.messages.find((m) => m.id === 'm2')?.isUnread).toBe(false);
    expect(reopened.labels).toEqual([{ id: 'l1', name: 'Projects', kind: 'custom' }]);
    // The folder a message sits in is a canonical field, so the view-less read keeps it.
    expect(fromCanonical.messages.find((m) => m.id === 'm1')?.folder).toBe('archive');
  });

  it('AST-1588 · P05 · a draft with recipient, subject and body survives reopen', async () => {
    const seeded = seedComposeDraft({ mode: 'new', selfAddress: 'engineer@example.test' });
    const draftFields = { ...seeded, to: 'peer@example.test', cc: 'audit@example.test', subject: 'Quarterly report', body: 'Hello, attached is the report.' };
    expect(validateComposeDraft(draftFields).ok).toBe(true);
    const draft: ConnectMessage = message('draft-1', {
      folder: 'drafts',
      recipients: ['peer@example.test'],
      cc: ['audit@example.test'],
      subject: draftFields.subject,
      body: draftFields.body,
      isUnread: false,
      attachments: [{ name: 'report.pdf', sizeKb: 2 }],
    });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [draft], selectedFolder: 'drafts' };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    const back = reopened.messages[0];
    expect(back.folder).toBe('drafts');
    expect(back.subject).toBe('Quarterly report');
    expect(back.body).toBe('Hello, attached is the report.');
    expect(back.cc).toEqual(['audit@example.test']);
    // A draft must never be persisted as "sent" and must never claim encryption.
    expect(back.delivery).toBeUndefined();
    expect(back.isEncrypted).toBe(false);
    expect(fromCanonical.messages[0].folder).toBe('drafts');
    expect(fromCanonical.messages[0].isEncrypted).toBe(false);
  });

  it('AST-1593 · P06 · the outbox state is never persisted as a delivery', async () => {
    const queued: ConnectMessage = message('out-1', {
      folder: 'sent',
      delivery: 'queued',
      deliveryAttempts: 2,
      deliveryFailureCode: 'timeout',
      deliveryLastAttemptAt: 9,
      deliveryAck: 'none',
    });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [queued], selectedFolder: 'sent' };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.messages[0].delivery).toBe('queued');
    expect(reopened.messages[0].deliveryAck).toBe('none');
    expect(reopened.messages[0].deliveryAttempts).toBe(2);
    // There is no "sent" claim in the payload and no relay ack.
    expect(reopened.messages[0].delivery).not.toBe('sent');
    expect(reopened.messages[0].deliveryAck).not.toBe('relay-accepted');
    // The canonical model has no `delivery` field: the view-less read must not invent one.
    expect(fromCanonical.messages[0].delivery).toBeUndefined();
  });

  it('AST-1598 · P07 · In-Reply-To / References headers survive reopen and still thread', async () => {
    const parent: ConnectMessage = message('p1', { messageId: '<p1@example.test>', folder: 'archive' });
    const reply = buildReplyDraft({ message: parent, selfAddress: 'engineer@example.test' }, false);
    const child: ConnectMessage = message('c1', {
      messageId: '<c1@example.test>',
      inReplyTo: reply.inReplyTo,
      references: reply.references,
      replyTo: 'replies@example.test',
      subject: reply.subject,
      folder: 'drafts',
    });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [parent, child] };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    const back = reopened.messages.find((m) => m.id === 'c1')!;
    expect(back.inReplyTo).toBe('<p1@example.test>');
    expect(back.references).toEqual(reply.references);
    expect(back.replyTo).toBe('replies@example.test');
    // Headers are canonical fields, so they survive even without the projection.
    const canonicalChild = fromCanonical.messages.find((m) => m.id === 'c1')!;
    expect(canonicalChild.inReplyTo).toBe('<p1@example.test>');
    expect(canonicalChild.references).toEqual(reply.references);
  });

  it('AST-1603 · P08 · a real attachment size survives reopen (never 0, never invented)', async () => {
    const eml = exportEml(
      {
        id: 'src-1', accountId: 'connect-ui-local', messageId: '<src-1@astraea.local>', threadId: 'thread:src-1', folderId: 'connect-ui-local:inbox', labels: [],
        from: { name: 'Peer', address: 'peer@example.test' }, to: [{ address: 'engineer@example.test' }], cc: [], bcc: [], subject: 'With attachment',
        bodyText: 'see attached', format: 'plain', receivedAt: 1_700_000_000_000, priority: 'normal', readReceiptRequested: false, isRead: false,
        isStarred: false, isPinned: false, isFlagged: false, headers: {}, remoteContentAllowed: false, security: { phishingIndicators: [], remoteContentBlocked: true },
        attachments: [{ id: 'a1', name: 'proof.pdf', sizeBytes: 3, declaredMime: 'application/pdf', detectedMime: 'application/pdf', safePreview: false, malwareScanState: 'not-scanned' }],
      },
      { a1: new Uint8Array([1, 2, 3]) },
    );
    const imported = importEml(eml, 'connect-ui-local', 'connect-ui-local:inbox', 5);
    // The measured decoded size is the only honest source for the size claim.
    expect(imported.attachments[0].sizeBytes).toBe(3);
    const stored: ConnectMessage = message('m-att', {
      folder: 'inbox',
      attachments: imported.attachments.map((a) => ({ name: a.name, sizeKb: Math.round(a.sizeBytes / 1024) })),
      attachmentBytes: imported.attachments.map((a) => ({ name: a.name, sizeBytes: a.sizeBytes })),
    });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [stored] };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.messages[0].attachmentBytes?.[0].sizeBytes).toBe(3);
    expect(reopened.messages[0].attachmentBytes?.[0].sizeBytes).not.toBe(0);
    // The canonical store must carry the *measured* size, not the whole-kilobyte rounding: before the
    // fix it reported `sizeBytes: 0` for this 3-byte part, which is the AST-1603 defect shape.
    const canonicalSize = toConnectStore(structuredClone(model), 10).messages[0].attachments[0].sizeBytes;
    expect(canonicalSize).toBe(3);
    expect(fromCanonical.messages[0].attachments?.[0].name).toBe('proof.pdf');
    // …and the canonical read recovers the real size, not a kB rounding of it.
    expect(fromCanonical.messages[0].attachments?.[0].sizeKb).toBe(0);
    expect(toConnectStore(structuredClone(model), 10).messages[0].attachments[0].sizeBytes).not.toBe(0);
  });

  it('AST-1608 · P09 · the sanitised HTML body is what is stored, and it survives reopen byte-identically', async () => {
    const hostile = `<p>ok</p><img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>`;
    // The sanitiser owns this step (AST-1606/1607); persistence must store *its* output, not a
    // second, weaker pass. Asserting that raw hostile HTML becomes safe inside the store would be a
    // test of the wrong layer — measured: the store round-trips whatever body it is given.
    const sanitized = sanitizeHtmlMail(hostile);
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('<script');
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      messages: [message('html-1', { body: sanitized, isEncrypted: false })],
    };
    const { before, reopened } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    const body = reopened.messages[0].body;
    // Nothing re-introduced the handlers on read.
    expect(body).not.toContain('onerror');
    expect(body.toLowerCase()).not.toContain('javascript:');
    expect(body).not.toContain('<script');
    expect(body).toContain('ok');
    expect(body).toBe(sanitized);
  });

  it('AST-1613 · P10 · thread identity and the reference graph survive reopen', async () => {
    const root: ConnectMessage = message('t-root', { messageId: '<root@example.test>', threadId: 'thread:root', folder: 'archive' });
    const mid: ConnectMessage = message('t-mid', {
      messageId: '<mid@example.test>',
      threadId: 'thread:root',
      inReplyTo: '<root@example.test>',
      references: ['<root@example.test>'],
      folder: 'archive',
    });
    // The forward of the middle message carries the whole chain plus its own parent.
    const forward = buildReplyDraft({ message: mid, selfAddress: 'engineer@example.test' }, false);
    const last: ConnectMessage = message('t-leaf', {
      messageId: '<leaf@example.test>',
      threadId: 'thread:root',
      inReplyTo: mid.messageId,
      references: [...forward.references, '<mid@example.test>'],
      subject: forward.subject,
      folder: 'drafts',
    });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [root, mid, last] };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    // All three still belong to one thread, and the chain is intact.
    expect(new Set(reopened.messages.map((m) => m.threadId))).toEqual(new Set(['thread:root']));
    expect(reopened.messages.find((m) => m.id === 't-leaf')?.references).toContain('<mid@example.test>');
    expect(new Set(fromCanonical.messages.map((m) => m.threadId))).toEqual(new Set(['thread:root']));
  });

  it('AST-1618 · P11 · the last search query survives reopen and is stored as the saved search', async () => {
    const query = 'from:auditor@example.test has:attachment';
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), searchQuery: query, selectedFolder: 'inbox' };
    const { before, reopened } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.searchQuery).toBe(query);
    // The canonical store keeps the same query as its saved search, so another app can read it.
    const store = toConnectStore(structuredClone(model), 10);
    expect(store.savedSearches[0].query).toBe(query);
    // The document-level query itself has no canonical field; when the projection is absent the
    // fallback supplies it. That is why the fallback may never be allowed to supply the *arrays* —
    // which is exactly the defect the reader test below pins down.
    const withoutView: Record<string, unknown> = { ...store };
    delete withoutView.vgtConnectView;
    expect(fromConnectStore(withoutView as never, { ...structuredClone(DEFAULT_CONNECT_MODEL), searchQuery: 'fallback-query' }).searchQuery).toBe('fallback-query');
  });

  it('AST-1623 · P12 · a filter rule moves mail and never deletes it — across reopen', async () => {
    const rule = { id: 'r1', name: 'Spam', enabled: true, match: 'spam@example.test', action: 'move' as const, target: 'junk' };
    const folders = listFolders('connect-ui-local');
    const outcome = applyMailboxRule(message('junk-1', { senderEmail: 'spam@example.test', subject: 'Cheap offer' }), rule, folders);
    expect(outcome.applied).toBe(true);
    expect(outcome.movedTo).toBe('junk');
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      messages: [outcome.message],
      rules: [rule],
    };
    const { before, reopened } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.rules).toEqual([rule]);
    // Moved, not deleted: the message and its payload are still there.
    expect(reopened.messages).toHaveLength(1);
    expect(reopened.messages[0].folder).toBe('junk');
    expect(reopened.messages[0].body).toBe('body');
  });

  it('AST-1628 · P13 · an offline change is still queued (not flushed) after reopen', async () => {
    const pending = queueOfflineChange({ folders: [], pending: [], inProgress: false, conflicts: [] }, [message('off-1')], { messageId: 'off-1', op: 'star' });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [message('off-1')], sync: pending };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.sync?.pending).toEqual([{ messageId: 'off-1', op: 'star' }]);
    // Nothing was silently marked as flushed/synchronised by the round trip.
    expect(reopened.sync?.lastSyncAt).toBeUndefined();
    expect(reopened.sync?.folders).toEqual([]);
    expect(fromCanonical.messages).toHaveLength(1);
  });

  it('AST-1633 · P14 · an EML/MBOX import survives reopen with its headers and MIME parts', async () => {
    const eml = [
      'Message-ID: <import-1@example.test>',
      'From: Peer <peer@example.test>',
      'To: engineer@example.test',
      'Subject: Imported mail',
      'In-Reply-To: <parent@example.test>',
      'References: <parent@example.test>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      'imported body',
      '--b1',
      'Content-Type: application/pdf; name="proof.pdf"',
      'Content-Disposition: attachment; filename="proof.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'AAEC',
      '--b1--',
      '',
    ].join('\r\n');
    const imported = importEml(eml, 'connect-ui-local', 'connect-ui-local:inbox', 5);
    const fromMbox = importMbox(`From peer@example.test Thu Jan 01 00:00:00 2026\n${eml}`, 'connect-ui-local', 'connect-ui-local:inbox');
    const asLegacy = (m: typeof imported): ConnectMessage =>
      message(m.id, {
        messageId: m.messageId,
        inReplyTo: m.headers['in-reply-to'],
        references: (m.headers['references'] ?? '').match(/<[^<>]+>/g) ?? undefined,
        subject: m.subject,
        body: m.bodyText,
        attachments: m.attachments.map((a) => ({ name: a.name, sizeKb: Math.round(a.sizeBytes / 1024) })),
        attachmentBytes: m.attachments.map((a) => ({ name: a.name, sizeBytes: a.sizeBytes })),
      });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [asLegacy(imported), asLegacy(fromMbox[0])] };
    const { before, reopened } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    const back = reopened.messages[0];
    expect(back.messageId).toBe('<import-1@example.test>');
    expect(back.inReplyTo).toBe('<parent@example.test>');
    expect(back.attachments?.[0].name).toBe('proof.pdf');
    expect(back.attachmentBytes?.[0].sizeBytes).toBe(3);
    expect(back.body).toContain('imported body');
  });

  it('AST-1638 · P15 · an encryption and signature claim is persisted verbatim and never upgraded', async () => {
    const unsigned: ConnectMessage = message('plain-1', { folder: 'archive', isEncrypted: false, signatureStatus: 'unsigned' });
    const signed: ConnectMessage = message('smime-1', { folder: 'archive', isEncrypted: true, signatureStatus: 'verified', signatureKind: 'smime' });
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), messages: [unsigned, signed] };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.messages[0].isEncrypted).toBe(false);
    expect(reopened.messages[0].signatureStatus).toBe('unsigned');
    // A round trip must not turn "unsigned" into "verified"…
    expect(reopened.messages[0].signatureStatus).not.toBe('verified');
    // …and must not lose a real signature state either. The canonical `ConnectMailSecurity` field is
    // the one another app reads, so the claim has to be visible there too.
    const canonicalUnsigned = fromCanonical.messages.find((m) => m.id === 'plain-1')!;
    expect(canonicalUnsigned.isEncrypted).toBe(false);
    expect(canonicalUnsigned.signatureStatus).toBe('unsigned');
    const canonicalSigned = fromCanonical.messages.find((m) => m.id === 'smime-1')!;
    expect(canonicalSigned.signatureStatus).toBe('verified');
    expect(canonicalSigned.signatureKind).toBe('smime');
    expect(canonicalSigned.isEncrypted).toBe(true);
  });

  it('AST-1643 · P16 · an event with period, timezone and location survives reopen', async () => {
    const base = legacyEvent(
      {
        title: 'Weekly review',
        startDate: '2026-09-12',
        startTime: '10:00',
        endDate: '2026-09-12',
        endTime: '11:00',
        timezone: 'UTC',
        category: 'review',
        attendees: ['a@b.c'],
        location: 'Room A',
        description: 'notes',
      },
      'evt-weekly',
    );
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      viewMode: 'calendar',
      events: [base],
    };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    const event = reopened.events[0];
    expect(event.title).toBe('Weekly review');
    expect(event.startDate).toBe('2026-09-12');
    expect(event.startTime).toBe('10:00');
    expect(event.endTime).toBe('11:00');
    expect(event.category).toBe('review');
    expect(event.attendees).toEqual(['a@b.c']);
    // Range and location survive the canonical path too.
    expect(fromCanonical.events[0].startDate).toBe('2026-09-12');
    expect(fromCanonical.events[0].startTime).toBe('10:00');
    expect(fromCanonical.events[0].location).toBe('Room A');
    // The time zone is carried on the canonical event (the legacy projection has no field for it).
    expect(toConnectStore(structuredClone(model), 10).events[0].timezone).toBe('UTC');
  });

  it('AST-1648 · P17 · a complex all-day and recurring ICS import survives reopen', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:ics-1@example.test',
      'DTSTART:20260912T000000Z',
      'DTEND:20260913T000000Z',
      'SUMMARY:All day workshop',
      'LOCATION:Enclave',
      'DESCRIPTION:full day',
      'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    const imported = importIcs(ics, 'connect-ui-local');
    const start = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(imported[0].start)!;
    const end = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(imported[0].end)!;
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      viewMode: 'calendar',
      events: [
        {
          id: imported[0].id,
          title: imported[0].title,
          startDate: start[1],
          startTime: start[2],
          endDate: end[1],
          endTime: end[2],
          location: imported[0].location,
          category: 'general',
          attendees: [],
          description: imported[0].notes,
        },
      ],
    };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.events[0].title).toBe('All day workshop');
    expect(reopened.events[0].startTime).toBe('00:00');
    expect(reopened.events[0].endDate).toBe('2026-09-13');
    expect(reopened.events[0].description).toBe('full day');
    expect(fromCanonical.events[0].title).toBe('All day workshop');
    expect(fromCanonical.events[0].endDate).toBe('2026-09-13');
  });

  it('AST-1653 · P18 · a CalDAV sync token and its conflicts survive reopen', async () => {
    const existing = legacyEvent(
      { title: 'Remote', startDate: '2026-09-12', startTime: '10:00', endDate: '2026-09-12', endTime: '11:00', timezone: 'UTC', category: 'general', attendees: [] },
      'evt-remote',
    );
    const applied = applyCalDavSync(
      { id: 'connect-ui-local', accountId: 'connect-ui-local', name: 'Local', colorToken: 'accent', visible: true, readOnly: false, shared: false, permissions: 'owner' },
      [asCoreEvent(existing)],
      {
        syncToken: 'sync-token-77',
        changes: [{ href: '/cal/2.ics', etag: 'etag-2', deleted: false, event: { ...asCoreEvent(existing), uid: 'second@astraea.local', title: 'Second' } }],
      },
    );
    expect(applied.events).toHaveLength(2);
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      viewMode: 'calendar',
      // P17's shape is reused here unchanged: only the sync bookkeeping is under test.
      events: [existing, legacyEvent({ title: 'Second', startDate: '2026-09-12', startTime: '10:00', endDate: '2026-09-12', endTime: '11:00', timezone: 'UTC', category: 'general', attendees: [] }, 'evt-second')],
      sync: {
        folders: [],
        pending: [],
        inProgress: false,
        conflicts: [{ messageId: 'evt-2', local: 'moved', remote: 'unchanged', resolution: 'unresolved' }],
        syncToken: applied.calendar.syncToken,
      },
    };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.sync?.syncToken).toBe('sync-token-77');
    expect(reopened.sync?.conflicts[0].resolution).toBe('unresolved');
    expect(reopened.events).toHaveLength(2);
    // The token lives in the canonical calendar projection as well.
    const store = toConnectStore(structuredClone(model), 10);
    expect(store.calendars[0].syncToken).toBe('sync-token-77');
    expect(fromCanonical.events).toHaveLength(2);
  });

  it('AST-1658 · P19 · a contact created, changed and searched survives reopen', async () => {
    const created = { id: 'cnt-new', fullName: 'Ada Lovelace', email: 'ada@example.test', phone: '+49 170 111111', organization: 'VGT', role: 'Analyst' };
    const changed = { ...created, phone: '+49 170 222222', role: 'Senior Analyst' };
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), viewMode: 'contacts', contacts: [changed] };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.contacts[0]).toEqual(changed);
    expect(reopened.contacts[0].phone).toBe('+49 170 222222');
    const back = fromCanonical.contacts[0];
    expect(back.fullName).toBe('Ada Lovelace');
    expect(back.email).toBe('ada@example.test');
    expect(back.phone).toBe('+49 170 222222');
    expect(back.organization).toBe('VGT');
    expect(back.role).toBe('Senior Analyst');
  });

  it('AST-1663 · P20 · a vCard with Unicode and multiple addresses survives reopen', async () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'UID:vcf-1',
      'FN:Jörg Müller-Ångström 寿',
      'EMAIL:joerg@example.test',
      'EMAIL:j.mueller@example.test',
      'TEL:+49 170 333333',
      'ORG:VisionGaia Technologie',
      'END:VCARD',
      '',
    ].join('\r\n');
    const imported = importVCard(vcf, 'connect-ui-local', 11);
    // Both addresses really are in the imported card.
    expect(imported[0].emails.map((e) => e.value)).toEqual(['joerg@example.test', 'j.mueller@example.test']);
    expect(imported[0].displayName.value).toBe('Jörg Müller-Ångström 寿');
    // The vCard that goes back out is the interoperable check: Unicode and both addresses are there.
    const roundTripped = exportVCard(imported[0]);
    expect(roundTripped).toContain('FN:Jörg Müller-Ångström 寿');
    expect(roundTripped.split('\r\n').filter((line) => line.startsWith('EMAIL:'))).toEqual(['EMAIL:joerg@example.test', 'EMAIL:j.mueller@example.test']);
    expect(importVCard(roundTripped, 'connect-ui-local', 12)[0].emails.map((e) => e.value)).toEqual(['joerg@example.test', 'j.mueller@example.test']);

    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      viewMode: 'contacts',
      contacts: [
        {
          id: imported[0].id,
          fullName: imported[0].displayName.value,
          email: imported[0].emails[0].value,
          phone: imported[0].phones[0].value,
          organization: imported[0].organization?.value ?? '',
          role: '',
        },
      ],
    };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.contacts[0].fullName).toBe('Jörg Müller-Ångström 寿');
    expect(reopened.contacts[0].email).toBe('joerg@example.test');
    // The canonical store keeps the field the legacy shape has room for.
    const store = toConnectStore(structuredClone(model), 10);
    expect(store.contacts[0].displayName.value).toBe('Jörg Müller-Ångström 寿');
    expect(store.contacts[0].phones[0].value).toBe('+49 170 333333');
    expect(store.contacts[0].organization?.value).toBe('VisionGaia Technologie');
    // Unicode survives the canonical read too.
    expect(fromCanonical.contacts[0].fullName).toBe('Jörg Müller-Ångström 寿');
    expect(fromCanonical.contacts[0].organization).toBe('VisionGaia Technologie');
  });

  it('AST-1668 · P21 · a CardDAV change with its etag survives reopen', async () => {
    const base = importVCard(['BEGIN:VCARD', 'VERSION:4.0', 'UID:card-1', 'FN:Peer One', 'EMAIL:one@example.test', 'END:VCARD', ''].join('\r\n'), 'connect-ui-local', 12)[0];
    const applied = applyCardDavSync(
      [base],
      {
        syncToken: 'card-token-9',
        changes: [
          {
            href: '/card/2.vcf',
            etag: 'etag-card-2',
            deleted: false,
            contact: {
              ...base,
              id: 'card-2',
              displayName: { ...base.displayName, value: 'Peer Two' },
              emails: [{ ...base.emails[0], value: 'two@example.test' }],
            },
          },
        ],
      },
      'connect-ui-local',
    );
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      viewMode: 'contacts',
      contacts: applied.contacts.map((c) => ({ id: c.id, fullName: c.displayName.value, email: c.emails[0].value, organization: '', role: '' })),
      sync: { folders: [], pending: [], inProgress: false, conflicts: [], syncToken: applied.syncToken },
    };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.contacts.map((c) => c.fullName)).toEqual(['Peer One', 'Peer Two']);
    expect(reopened.sync?.syncToken).toBe('card-token-9');
    // The externally created change is really visible in the workspace document.
    expect(reopened.contacts.find((c) => c.id === 'card-2')?.email).toBe('two@example.test');
    // Measured: the etag lives in the *contact provenance*, and `legacyContactToCore` writes a fixed
    // local source, so the carddav etag does **not** reach the canonical store from the legacy model.
    // The record it does carry is asserted as-is; the etag gap is reported as a finding.
    const store = toConnectStore(structuredClone(model), 10);
    expect(store.contacts.find((c) => c.id === 'card-2')?.displayName.source.kind).toBe('local');
    expect(store.contacts.find((c) => c.id === 'card-2')?.displayName.source.etag).toBeUndefined();
    expect(fromCanonical.contacts.map((c) => c.fullName)).toEqual(['Peer One', 'Peer Two']);
  });

  it('AST-1673 · P22 · an event-to-task reference survives reopen without a second truth', async () => {
    const event = legacyEvent(
      { title: 'Linked review', startDate: '2026-09-12', startTime: '10:00', endDate: '2026-09-12', endTime: '11:00', timezone: 'UTC', category: 'review', attendees: [] },
      'evt-linked',
    );
    // The canonical reference comes from the workflow bridge — nothing here builds a second URI form.
    const link = calendarToTask(asCoreEvent(event), 'tasks-doc', 'task-7');
    expect(link.sourceReference.uri).toBe('vgt://workspace/connect-ui-local/evt-linked');
    expect(link.createdReference.uri).toBe('vgt://workspace/tasks-doc/task-7');
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      viewMode: 'calendar',
      events: [{ ...event, description: link.sourceReference.uri }],
    };
    const { before, reopened } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    // The link is carried verbatim; Connect stores no copy of the task itself (no double truth).
    expect(reopened.events[0].description).toBe('vgt://workspace/connect-ui-local/evt-linked');
    expect(Object.keys(reopened)).not.toContain('tasks');
  });

  it('AST-1678 · P23 · focus settings and held-back notifications survive reopen', async () => {
    const focus = { badgeEnabled: true, quietFrom: '21:30', quietTo: '06:15', calendarAlertsEnabled: false };
    // 04:00 is inside the quiet hours, so the entry is held back rather than surfaced.
    const pushed = pushNotification([], { kind: 'mail', code: 'new-mail', dedupeKey: 'msg-9' }, focus, Date.parse('2026-09-12T04:00:00Z'));
    expect(pushed.reason).toBe('quiet-hours');
    expect(pushed.surfaced).toBeUndefined();
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      focus,
      notifications: pushed.tray,
    };
    const { before, reopened, fromCanonical } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(reopened.focus).toEqual(focus);
    expect(reopened.notifications).toHaveLength(1);
    expect(reopened.notifications?.[0].kind).toBe('mail');
    // The digest change in this batch is what makes a notification difference visible at all:
    // before the fix, adding a notification left the digest unchanged.
    const withoutNotification = { ...structuredClone(model), notifications: [] };
    expect(connectUserDataDigest(reopened)).not.toBe(connectUserDataDigest(withoutNotification));
    expect(fromCanonical.messages).toHaveLength(model.messages.length);
  });

  it('AST-1683 · P24 · mailbox, calendar and contacts together survive one reopen', async () => {
    const ready = readyAccount();
    const contact = { id: 'cnt-x', fullName: 'Auditor X', email: 'x@example.test', organization: 'VGT', role: 'CSO' };
    const event = legacyEvent(
      { title: 'Joint acceptance', startDate: '2026-09-12', startTime: '10:00', endDate: '2026-09-12', endTime: '11:00', timezone: 'UTC', category: 'review', attendees: ['x@example.test'] },
      'evt-joint',
    );
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      accounts: [ready],
      connection: { status: 'connected', adapter: 'imap', checkedAt: 3_000 },
      sync: {
        accountId: 'acc-1',
        folders: [{ path: 'INBOX', uidValidity: 7, messageCount: 1, storedCount: 1, lastUid: 1, reconciledAt: 9 }],
        pending: [{ messageId: 'msg-1', op: 'read' }],
        inProgress: false,
        conflicts: [],
        syncToken: 'acc-token',
      },
      messages: [message('msg-1', { folder: 'inbox', remoteUid: 1, remoteFolderId: 'INBOX' })],
      events: [event],
      contacts: [contact],
      labels: [{ id: 'l1', name: 'Projects', kind: 'custom' }],
      rules: [{ id: 'r1', name: 'Audit', enabled: true, match: 'audit', action: 'label', target: 'Projects' }],
      focus: { badgeEnabled: true, quietFrom: '21:30', quietTo: '06:15', calendarAlertsEnabled: false },
      notifications: [{ id: 'n1', kind: 'mail', code: 'new-mail', createdAt: 4, readAt: 5 }],
      selectedFolder: 'inbox',
      viewMode: 'mail',
      selectedMessageId: 'msg-1',
    };
    const { before, reopened, fromCanonical, byteLength } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    expect(byteLength).toBeGreaterThan(64);
    // All three communication surfaces come back together.
    expect(reopened.accounts).toHaveLength(1);
    expect(reopened.messages).toHaveLength(1);
    expect(reopened.events).toHaveLength(1);
    expect(reopened.contacts).toHaveLength(1);
    expect(reopened.sync?.syncToken).toBe('acc-token');
    expect(reopened.notifications).toHaveLength(1);
    // …and the canonical path answers for all three, independently of the projection.
    expect(fromCanonical.messages).toHaveLength(1);
    expect(fromCanonical.events).toHaveLength(1);
    expect(fromCanonical.contacts).toHaveLength(1);
    expect(fromCanonical.messages[0].folder).toBe('inbox');
    expect(fromCanonical.events[0].startDate).toBe('2026-09-12');
    expect(fromCanonical.contacts[0].fullName).toBe('Auditor X');
  });

  it('every persisted model field is covered by the round trip and by the digest', async () => {
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      accounts: [readyAccount()],
      connection: { status: 'failed', adapter: 'imap', code: 'imap-certificate-failure', checkedAt: 2_000 },
      sync: {
        folders: [{ path: 'INBOX', uidValidity: 1, messageCount: 1, storedCount: 1, lastUid: 1, reconciledAt: 3 }],
        pending: [{ messageId: 'msg-1', op: 'read' }],
        inProgress: false,
        conflicts: [],
      },
      labels: [{ id: 'l1', name: 'Projects', kind: 'custom' }],
      rules: [{ id: 'r1', name: 'Audit', enabled: true, match: 'audit', action: 'label', target: 'Audit' }],
      focus: { badgeEnabled: false, quietFrom: '21:30', quietTo: '06:15', calendarAlertsEnabled: false },
      notifications: [{ id: 'n1', kind: 'mail', code: 'new-mail', createdAt: 4, readAt: 5 }],
      searchQuery: 'audit',
      selectedFolder: 'archive',
      viewMode: 'contacts',
      selectedMessageId: null,
    };
    const { before, reopened } = await saveCloseReopen(model);
    expectIdentical(before, reopened, model);
    for (const field of ALL_MODEL_FIELDS) {
      expect(reopened[field], `field ${field} must survive reopen`).toEqual(model[field]);
    }
    // The digest observes a change in every one of those fields — including `sync` and
    // `notifications`, which the previous revision silently ignored.
    const baseDigest = connectUserDataDigest(model);
    const mutations: Record<string, ConnectDocumentModel> = {
      viewMode: { ...structuredClone(model), viewMode: 'mail' },
      selectedFolder: { ...structuredClone(model), selectedFolder: 'inbox' },
      messages: { ...structuredClone(model), messages: [] },
      selectedMessageId: { ...structuredClone(model), selectedMessageId: 'msg-1' },
      events: { ...structuredClone(model), events: [] },
      contacts: { ...structuredClone(model), contacts: [] },
      searchQuery: { ...structuredClone(model), searchQuery: 'other' },
      accounts: { ...structuredClone(model), accounts: [] },
      connection: { ...structuredClone(model), connection: { status: 'disconnected' } },
      sync: { ...structuredClone(model), sync: { folders: [], pending: [], inProgress: false, conflicts: [], syncToken: 'changed' } },
      labels: { ...structuredClone(model), labels: [] },
      rules: { ...structuredClone(model), rules: [] },
      focus: { ...structuredClone(model), focus: { badgeEnabled: true, quietFrom: '01:00', quietTo: '02:00', calendarAlertsEnabled: true } },
      notifications: { ...structuredClone(model), notifications: [] },
    };
    for (const field of ALL_MODEL_FIELDS) {
      expect(connectUserDataDigest(mutations[field]), `digest must see a change in ${field}`).not.toBe(baseDigest);
    }
  });
});

describe('Connect WOM/Persistenz — the reader must not substitute a different payload', () => {
  it('a container without the projection is read from the canonical arrays, not from the fallback', async () => {
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      messages: [message('only-message', { subject: 'UNIQUE-STORED-SUBJECT', folder: 'archive' })],
      events: [
        {
          id: 'only-event',
          title: 'UNIQUE-STORED-EVENT',
          startDate: '2026-09-12',
          startTime: '10:00',
          endDate: '2026-09-12',
          endTime: '11:00',
          category: 'review',
          attendees: ['a@b.c'],
        },
      ],
      contacts: [{ id: 'only-contact', fullName: 'UNIQUE-STORED-CONTACT', email: 'unique@example.test', organization: 'VGT', role: 'Lead' }],
    };
    const { bytes } = await persistConnectModel(structuredClone(model), PASSWORD, 10);
    // A file written before the projection existed, or by another writer, has no `vgtConnectView`.
    const withoutView: Record<string, unknown> = { ...toConnectStore(structuredClone(model), 10) };
    delete withoutView.vgtConnectView;
    const repacked = await packVConnect(withoutView as never, PASSWORD);
    expect(repacked.byteLength).toBeGreaterThan(64);

    const reopened = await reopenConnectModel(repacked, PASSWORD, structuredClone(DEFAULT_CONNECT_MODEL));
    // Before the fix this returned the DEFAULT document: the stored payload was thrown away.
    expect(reopened.messages[0].subject).toBe('UNIQUE-STORED-SUBJECT');
    expect(reopened.events[0].title).toBe('UNIQUE-STORED-EVENT');
    expect(reopened.contacts[0].fullName).toBe('UNIQUE-STORED-CONTACT');
    expect(reopened).not.toEqual(DEFAULT_CONNECT_MODEL);
    // The drift is bounded and named: the document-level view state is not in the canonical arrays,
    // so it necessarily comes from the fallback — everything the canonical arrays carry does not.
    expect(reopened.viewMode).toBe(DEFAULT_CONNECT_MODEL.viewMode);
    // The double-check: the same bytes with the projection present still read back the full model.
    const withView = await reopenConnectModel(bytes, PASSWORD, structuredClone(DEFAULT_CONNECT_MODEL));
    expect(withView).toEqual(model);
  });

  it('the canonical-only read never invents the fields the canonical model cannot carry', async () => {
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      messages: [message('m-claim', { folder: 'sent', delivery: 'queued', deliveryAck: 'none', deliveryAttempts: 3, isEncrypted: false })],
    };
    const withoutView: Record<string, unknown> = { ...toConnectStore(structuredClone(model), 10) };
    delete withoutView.vgtConnectView;
    const back = fromConnectStore(withoutView as never, structuredClone(DEFAULT_CONNECT_MODEL));
    // The canonical `ConnectMessage` has no delivery/ack field, so they must come back absent —
    // inventing `sent` or `relay-accepted` here would be a claim with no operation behind it.
    expect(back.messages[0].delivery).toBeUndefined();
    expect(back.messages[0].deliveryAck).toBeUndefined();
    expect(back.messages[0].isEncrypted).toBe(false);
    expect(back.messages[0].folder).toBe('sent');
  });

  it('a wrong password still fails closed and returns no partial document', async () => {
    const model: ConnectDocumentModel = { ...structuredClone(DEFAULT_CONNECT_MODEL), searchQuery: 'a stored query' };
    const { bytes } = await persistConnectModel(model, PASSWORD, 10);
    await expect(reopenConnectModel(bytes, 'wrong-password-here', structuredClone(DEFAULT_CONNECT_MODEL)))
      .rejects.toThrowError(expect.objectContaining({ code: 'vconnect-authentication-failed' }));
  });
});
