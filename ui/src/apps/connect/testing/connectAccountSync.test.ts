// STATUS: PLATIN — BATCH-CONNECT-2 tests: account setup, KeyVault credential boundary, IMAP sync,
// and the real encrypted Save→Close→Reopen round trip through Connect's canonical store.
//
// The AES-GCM containers are opened with the workspace's own bundled Node runtime, so the round trip
// below is an executed cryptographic operation, not a mock.
import { describe, expect, it } from 'vitest';
import {
  attachCredential,
  buildCalendarEvent,
  buildLocalImapAccount,
  completeSetupWithoutProbe,
  EMPTY_ACCOUNT_DRAFT,
  INITIAL_ACCOUNT_SETUP,
  isAccountReachable,
  recordTlsProbe,
  toAccountSetting,
  updateAccountDraft,
  type ConnectAccountSetupState,
} from '../domain/connectAccountSetup';
import {
  auditConnectCredentials,
  assertNoInlineCredentials,
  ConnectCredentialError,
  sealAccountWithCredentialReference,
  toCredentialReference,
} from '../domain/connectCredentialBoundary';
import {
  applySyncEnvelope,
  isFolderSynchronised,
  joinFolderPath,
  planOfflineFlush,
  queueOfflineChange,
  splitFolderPath,
  syncProgress,
  syncSummary,
} from '../domain/connectSyncCore';
import { connectUserDataDigest, persistConnectModel, reopenConnectModel, toConnectStore } from '../state/connectPersistence';
import { packVConnect, unpackVConnect } from '../state/connectEncryptedStore';
import { DEFAULT_CONNECT_MODEL, type ConnectDocumentModel, type ConnectMessage, type ConnectSyncState } from '../domain/types';

const HANDLE = 'keyvault://connect/imap/engineer-vgt-internal';
const PASSWORD = 'correct horse battery staple';

const filled = (overrides: Partial<typeof EMPTY_ACCOUNT_DRAFT> = {}, credential = HANDLE) => {
  let state: ConnectAccountSetupState = INITIAL_ACCOUNT_SETUP;
  const draft = { ...EMPTY_ACCOUNT_DRAFT, displayName: 'Engineer Mailbox', address: 'engineer@vgt.internal', host: 'imap.vgt.internal', port: '993', username: 'engineer', ...overrides };
  for (const [key, value] of Object.entries(draft)) state = updateAccountDraft(state, key as keyof typeof draft, value);
  if (!credential) return state;
  return attachCredential(state, { stored: true, handle: credential });
};

const fullyConfigured = () => completeSetupWithoutProbe(filled(), 'acc-1', 1_000, { networkCapabilityId: 'netgate-imap-tls' });

const emptySync: ConnectSyncState = { folders: [], pending: [], inProgress: false, conflicts: [] };

const coreMessage = (id: string, overrides: Partial<ConnectMessage> = {}): ConnectMessage => ({
  id, sender: 'Peer', senderEmail: 'peer@vgt.internal', recipients: ['engineer@vgt.internal'],
  subject: 'Subject', snippet: 's', body: 'b', timestamp: 1_700_000_000_000, folder: 'inbox',
  isUnread: true, isStarred: false, isEncrypted: false, ...overrides,
});

describe('Connect account setup (AST-1566/1567, fail-closed)', () => {
  const draftWith = (overrides: Partial<typeof EMPTY_ACCOUNT_DRAFT>) => ({
    ...EMPTY_ACCOUNT_DRAFT, displayName: 'A', address: 'a@b.c', host: 'imap.vgt.internal', port: '993', username: 'u', ...overrides,
  });

  it('validates every field with a bounded code and never accepts a bad host or port', () => {
    // Even with a capability id, the platform refuses to enable a network adapter without a
    // vault-backed credential (`connector-secret-reference-required`, connectAccountCore.ts:8), so
    // the honest outcome here is `blocked`, not `created`.
    expect(buildLocalImapAccount(draftWith({}), 'acc', 1, { networkCapabilityId: 'cap' }))
      .toMatchObject({ outcome: 'blocked', code: 'local-account-network-adapter-blocked', adapterEnabled: false });
    for (const [field, value, code] of [
      ['host', 'not a host', 'endpoint-invalid'],
      ['host', 'imap.vgt.internal]', 'endpoint-invalid'],
      ['port', '0', 'endpoint-port-invalid'],
      ['port', '70000', 'endpoint-port-invalid'],
      ['port', '99x', 'endpoint-port-invalid'],
      ['address', 'not-an-address', 'identity-address-invalid'],
      ['displayName', '   ', 'display-name-empty'],
      ['displayName', 'x'.repeat(600), 'field-too-long'],
    ] as const) {
      expect(() => buildLocalImapAccount(draftWith({ [field]: value }), 'acc', 1, { networkCapabilityId: 'cap' }))
        .toThrowError(expect.objectContaining({ code }));
    }
  });

  it('refuses a control character in any field instead of silently trimming it', () => {
    expect(() => buildLocalImapAccount(draftWith({ displayName: 'A\u0000B' }), 'acc', 1, { networkCapabilityId: 'cap' }))
      .toThrowError(expect.objectContaining({ code: 'field-control-character' }));
  });

  it('cannot activate an IMAP adapter without a NetGate capability — and says so instead of claiming connected', () => {
    // Measured platform rule: connectAccountCore.ts:8 local-account-network-adapter-blocked /
    // network-capability-required. The honest result is a BLOCKED setup, never a green dot.
    const blocked = completeSetupWithoutProbe(filled(), 'acc-1', 1_000);
    expect(blocked.step).toBe('blocked');
    expect(blocked.blockedCode).toBe('local-account-network-adapter-blocked');
    expect(isAccountReachable(blocked)).toBe(false);
    // The record is still real and validated — only its activation is honestly denied.
    expect(blocked.account?.adapters.find((adapter) => adapter.kind === 'imap')?.enabled).toBe(false);
    expect(blocked.account?.network.failClosedOnTlsError).toBe(true);
    expect(() => buildLocalImapAccount(filled().draft, 'acc-1', 1_000)).not.toThrow();
  });

  it('never claims a verified TLS configuration without a probe', () => {
    const pending = completeSetupWithoutProbe(filled(), 'acc-1', 1_000, { networkCapabilityId: 'cap' });
    expect(pending.step).toBe('tls-unverified');
    const setting = toAccountSetting(pending);
    expect(setting?.tlsCertificate).toBe('unchecked');
    expect(setting?.tlsCheckedAt).toBeUndefined();
    expect(isAccountReachable(pending)).toBe(false);
    // The settings shape has no place to store a plaintext secret.
    expect(JSON.stringify(setting)).not.toContain('hunter2');
  });

  it('reaches ready only through a successful probe and stores the certificate fingerprint', () => {
    const pending = fullyConfigured();
    const failed = recordTlsProbe(pending, { certificateOk: false, code: 'imap-certificate-failure', now: 2_000 });
    expect(failed.step).toBe('error');
    expect(failed.errorCode).toBe('imap-certificate-failure');
    expect(toAccountSetting(failed)?.tlsCertificate).toBe('failed');
    expect(isAccountReachable(failed)).toBe(false);

    const ready = recordTlsProbe(pending, { certificateOk: true, certificateSha256: 'ab'.repeat(32), code: 'ok', now: 3_000 });
    expect(ready.step).toBe('ready');
    expect(toAccountSetting(ready)).toMatchObject({ tlsCertificate: 'trusted', tlsCheckedAt: 3_000 });
    expect(isAccountReachable(ready)).toBe(true);
  });

  it('cannot finish without a credential reference and is fail-closed on a bad handle', () => {
    expect(completeSetupWithoutProbe(filled({}, ''), 'acc-1', 1).step).toBe('error');
    expect(completeSetupWithoutProbe(filled({}, ''), 'acc-1', 1).errorCode).toBe('credential-missing');
    expect(attachCredential(filled(), { stored: false }).errorCode).toBe('vault-store-failed');
    expect(attachCredential(filled(), { stored: true, handle: 'plain' }).errorCode).toBe('vault-handle-invalid');
    expect(attachCredential(filled(), { stored: true, handle: HANDLE }).step).toBe('credential-pending');
  });

  it('does not let a certificate probe unblock an adapter this build cannot activate', () => {
    const blocked = completeSetupWithoutProbe(filled(), 'acc-1', 1_000);
    const probed = recordTlsProbe(blocked, { certificateOk: true, code: 'ok', now: 2_000 });
    expect(probed.step).toBe('blocked');
    expect(isAccountReachable(probed)).toBe(false);
  });

  it('builds an event only through the platform validator (no silent bad ranges)', () => {
    const good = { title: 'T', startDate: '2026-09-12', startTime: '10:00', endDate: '2026-09-12', endTime: '11:00', timezone: 'UTC', category: 'review' as const, attendees: ['a@b.c'] };
    expect(buildCalendarEvent(good, 5).title).toBe('T');
    expect(() => buildCalendarEvent({ ...good, endTime: '09:00' }, 5)).toThrowError();
    expect(() => buildCalendarEvent({ ...good, attendees: [] as string[] }, 5)).not.toThrow();
  });
});

describe('Connect credential boundary (AST-1571…1575)', () => {
  it('never lets a password reach the document, and fails instead of storing it', () => {
    const model = { ...structuredClone(DEFAULT_CONNECT_MODEL), accounts: [{ ...toAccountSetting(fullyConfigured())!, credentialHandle: 'hunter2-plain-password' }] } as ConnectDocumentModel;
    const audit = auditConnectCredentials(model);
    expect(audit.ok).toBe(false);
    expect(audit.violations.map((violation) => violation.code)).toContain('credential-not-in-keyvault');
  });

  it('rejects inline secrets wherever they hide (field name, value shape, URL userinfo, private key)', () => {
    const cases: Array<[unknown, string]> = [
      [{ accounts: [{ credentialHandle: HANDLE, password: 'hunter2' }] }, 'inline-secret-field'],
      [{ headers: { Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz1234' } }, 'inline-bearer-token'],
      [{ body: 'imap://engineer:hunter2@imap.vgt.internal' }, 'inline-url-userinfo'],
      [{ body: 'someone wrote password=letmein here' }, 'inline-assigned-password'],
      [{ credential: { note: '-----BEGIN RSA PRIVATE KEY-----\nMIIE' } }, 'inline-private-key-block'],
      [{ accessToken: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }, 'inline-oauth-token'],
    ];
    for (const [value, code] of cases) {
      expect(() => assertNoInlineCredentials(value)).toThrowError(expect.objectContaining({ code }));
    }
  });

  it('accepts ordinary mail content so the guard stays usable', () => {
    for (const benign of [
      { body: 'Please reset the password for the shared account at your convenience.' },
      { body: 'The token expired yesterday, see the ticket.' },
      { subject: 'Security review: Zero-Knowledge KeyVault & NetGate policies' },
      { headers: { 'message-id': '<x@astraea.local>' } },
      { body: 'Contact https://vgt.internal/docs for details' },
    ]) {
      expect(() => assertNoInlineCredentials(benign)).not.toThrow();
    }
  });

  it('builds the credential reference only from a vault-confirmed handle', () => {
    expect(() => toCredentialReference({ accountId: 'a', protocol: 'imap', secret: 'hunter2', stored: false }))
      .toThrowError(expect.objectContaining({ code: 'vault-store-failed' }));
    expect(() => toCredentialReference({ accountId: 'a', protocol: 'imap', secret: 'hunter2', stored: true, handle: 'plain-handle' }))
      .toThrowError(expect.objectContaining({ code: 'vault-handle-invalid' }));
    expect(() => toCredentialReference({ accountId: 'a', protocol: 'imap', secret: 'hunter2', stored: true, handle: `keyvault://x/hunter2` }))
      .toThrowError(expect.objectContaining({ code: 'vault-handle-echoes-secret' }));
    const ok = toCredentialReference({ accountId: 'a', protocol: 'imap', secret: 'hunter2', stored: true, handle: HANDLE });
    expect(ok).toEqual({ credentialHandle: HANDLE, protocol: 'imap', persistedInVault: true, secretReturned: false });
    expect(JSON.stringify(ok)).not.toContain('hunter2');
  });

  it('seals an account that itself passes the boundary check', () => {
    const sealed = sealAccountWithCredentialReference(
      { id: 'a', name: 'A', address: 'a@b.c', kind: 'imap+local', host: 'imap.vgt.internal', port: 993, tls: 'starttls-required', username: 'u', tlsCertificate: 'trusted', isDefault: true, createdAt: 1 },
      toCredentialReference({ accountId: 'a', protocol: 'imap', secret: 'hunter2', stored: true, handle: HANDLE }),
    );
    expect(sealed.credentialHandle).toBe(HANDLE);
    expect(sealed.tlsCertificate).toBe('trusted');
    expect(auditConnectCredentials({ ...structuredClone(DEFAULT_CONNECT_MODEL), accounts: [sealed] })).toMatchObject({ ok: true, keyVaultAccounts: ['a'] });
  });

  it('exposes a typed error so the UI can name the failing field', () => {
    try {
      assertNoInlineCredentials({ accounts: [{ password: 'x' }] });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectCredentialError);
      expect((error as ConnectCredentialError).path).toContain('password');
    }
  });
});

describe('Connect IMAP sync (AST-1576…1580)', () => {
  it('keeps UIDVALIDITY, UID and folder structure and reports real progress', () => {
    const messages = Array.from({ length: 100 }, (_, index) => coreMessage(`sync-${index}`));
    const envelope = {
      uidValidity: 42,
      uidNext: 101,
      messageCount: 100,
      folderPath: 'INBOX/Projects/2026',
      folderDelimiter: '/',
      complete: true,
      messages: messages.map((message, index) => ({ uid: index + 1, message })),
    };
    const first = applySyncEnvelope(emptySync, [], envelope, 9_000);
    expect(first.added).toHaveLength(100);
    expect(first.report).toMatchObject({ path: 'INBOX/Projects/2026', uidValidity: 42, uidNext: 101, messageCount: 100, storedCount: 100 });
    expect(first.report.reconciledAt).toBe(9_000);
    expect(first.messages[0].remoteUid).toBe(1);
    expect(first.messages.at(-1)?.remoteUid).toBe(100);
    expect(isFolderSynchronised(first.state, 'INBOX/Projects/2026')).toBe(true);
    expect(syncProgress(50, 100)).toEqual({ applied: 50, total: 100, percent: 50, done: false });
    expect(syncProgress(100, 100).done).toBe(true);
    expect(syncProgress(500, 100)).toEqual({ applied: 100, total: 100, percent: 100, done: true });
    expect(syncSummary(first.state)).toContain('sync:1:0');
  });

  it('does not call a folder synchronised after a partial (delta) envelope', () => {
    const partial = applySyncEnvelope(emptySync, [], {
      messageCount: 100, folderPath: 'INBOX', complete: false,
      messages: [{ uid: 5, message: coreMessage('only-one') }],
    }, 1);
    expect(partial.report.reconciledAt).toBeUndefined();
    expect(isFolderSynchronised(partial.state, 'INBOX')).toBe(false);
  });

  it('reports a changed UID as a conflict instead of silently overwriting it', () => {
    const stored = applySyncEnvelope(emptySync, [], { messageCount: 1, folderPath: 'INBOX', complete: true, messages: [{ uid: 7, message: coreMessage('m1') }] }, 1);
    const afterChange = applySyncEnvelope(stored.state, stored.messages, { messageCount: 1, folderPath: 'INBOX', complete: true, messages: [{ uid: 9, message: coreMessage('m1') }] }, 2);
    expect(afterChange.conflicts).toEqual([{ messageId: 'm1', local: 'uid:7', remote: 'uid:9', resolution: 'unresolved' }]);
    expect(afterChange.messages[0].remoteUid).toBe(9);
  });

  it('flags a remote-vs-local view difference (read/star/folder) as an unresolved conflict', () => {
    const stored = applySyncEnvelope(emptySync, [], { messageCount: 1, folderPath: 'INBOX', complete: true, messages: [{ uid: 1, message: coreMessage('m1', { isUnread: true }) }] }, 1);
    const server = applySyncEnvelope(stored.state, stored.messages, { messageCount: 1, folderPath: 'INBOX', complete: true, messages: [{ uid: 1, message: coreMessage('m1', { isUnread: false }) }] }, 2);
    expect(server.conflicts).toHaveLength(1);
    expect(server.conflicts[0].resolution).toBe('unresolved');
    expect(server.conflicts[0].local).not.toBe(server.conflicts[0].remote);
  });

  it('invalidates cached UIDs when UIDVALIDITY changes', () => {
    const first = applySyncEnvelope(emptySync, [], { uidValidity: 1, messageCount: 1, folderPath: 'INBOX', complete: true, messages: [{ uid: 1, message: coreMessage('m1') }] }, 1);
    const second = applySyncEnvelope(first.state, first.messages, { uidValidity: 2, messageCount: 1, folderPath: 'INBOX', complete: true, messages: [{ uid: 1, message: coreMessage('m1') }] }, 2);
    expect(second.state.syncToken).toBe('INBOX:uidvalidity-changed');
    expect(isFolderSynchronised(second.state, 'INBOX')).toBe(true);
  });

  it('bounds hostile envelopes instead of truncating them', () => {
    expect(() => applySyncEnvelope(emptySync, [], { messageCount: -1, folderPath: 'INBOX', messages: [] })).toThrowError(expect.objectContaining({ code: 'sync-count-invalid' }));
    expect(() => applySyncEnvelope(emptySync, [], { messageCount: 1, folderPath: 'INBOX', messages: [{ uid: 0, message: coreMessage('m') }] })).toThrowError(expect.objectContaining({ code: 'sync-uid-invalid' }));
    expect(() => applySyncEnvelope(emptySync, [], { messageCount: 2, folderPath: 'INBOX', messages: [{ uid: 1, message: coreMessage('a') }, { uid: 1, message: coreMessage('b') }] })).toThrowError(expect.objectContaining({ code: 'sync-uid-duplicate' }));
    expect(() => splitFolderPath('')).toThrowError(expect.objectContaining({ code: 'folder-path-empty' }));
    expect(() => splitFolderPath('a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q')).toThrowError(expect.objectContaining({ code: 'folder-depth-limit' }));
    expect(() => splitFolderPath('INBOX]evil')).toThrowError(expect.objectContaining({ code: 'folder-name-invalid' }));
    expect(joinFolderPath(splitFolderPath('INBOX/Projects/2026', '/'), '/')).toBe('INBOX/Projects/2026');
    expect(joinFolderPath(splitFolderPath('INBOX.Projects', '.'), '.')).toBe('INBOX.Projects');
  });

  it('never flushes an offline change without a transport', () => {
    const withPending = queueOfflineChange(emptySync, [coreMessage('m1')], { messageId: 'm1', op: 'read' });
    expect(planOfflineFlush(withPending, false)).toEqual({ flushable: [], blocked: 1 });
    expect(planOfflineFlush(withPending, true).flushable).toEqual([{ messageId: 'm1', op: 'read' }]);
    expect(() => queueOfflineChange(emptySync, [], { messageId: 'ghost', op: 'move' })).toThrowError(expect.objectContaining({ code: 'sync-message-unknown' }));
  });
});

describe('Connect persistence: real encrypted Save → Close → Reopen (AST-1568/1573)', () => {
  it('round-trips the complete connect user data through AES-256-GCM and back', async () => {
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      accounts: [toAccountSetting(fullyConfigured())!],
      connection: { status: 'failed', adapter: 'imap', code: 'imap-certificate-failure', checkedAt: 2_000 },
      sync: { accountId: 'acc-1', folders: [{ path: 'INBOX', uidValidity: 1, messageCount: 1, storedCount: 1, lastUid: 1, reconciledAt: 3 }], pending: [{ messageId: 'msg-1', op: 'read' }], inProgress: false, conflicts: [] },
      labels: [{ id: 'l1', name: 'Projects', kind: 'custom' }],
      rules: [{ id: 'r1', name: 'Audit', enabled: true, match: 'audit', action: 'label', target: 'Audit' }],
      focus: { badgeEnabled: false, quietFrom: '21:30', quietTo: '06:15', calendarAlertsEnabled: false },
      notifications: [{ id: 'n1', kind: 'mail', code: 'new-mail', createdAt: 4, readAt: 5 }],
      selectedFolder: 'queue',
      messages: [{ ...coreMessage('msg-1'), delivery: 'queued', deliveryAttempts: 2, deliveryFailureCode: 'timeout', deliveryLastAttemptAt: 9 }],
    };
    const before = connectUserDataDigest(model);
    const { bytes, byteLength, accountCount } = await persistConnectModel(model, PASSWORD, 10);
    expect(byteLength).toBeGreaterThan(64);
    expect(accountCount).toBe(1);
    // The container must not leak the credential reference or the subject in plaintext.
    // (No Node types in a `.ts` test, so the decode goes through TextDecoder, not Buffer.)
    const asText = new TextDecoder('latin1').decode(bytes);
    expect(asText).not.toContain(HANDLE);
    expect(asText).not.toContain('Security Review');

    const reopened = await reopenConnectModel(bytes, PASSWORD, structuredClone(DEFAULT_CONNECT_MODEL));
    expect(connectUserDataDigest(reopened)).toBe(before);
    expect(reopened).toEqual(model);
  });

  it('fails closed on a wrong password and does not return a partial model', async () => {
    const { bytes } = await persistConnectModel(structuredClone(DEFAULT_CONNECT_MODEL), PASSWORD, 10);
    await expect(reopenConnectModel(bytes, 'wrong-password-here', structuredClone(DEFAULT_CONNECT_MODEL)))
      .rejects.toThrowError(expect.objectContaining({ code: 'vconnect-authentication-failed' }));
  });

  it('refuses to persist a model that carries an inline credential', async () => {
    const model = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      accounts: [{ ...toAccountSetting(fullyConfigured())!, credentialHandle: 'hunter2' }],
    } as ConnectDocumentModel;
    await expect(persistConnectModel(model, PASSWORD, 10)).rejects.toThrowError(expect.objectContaining({ code: 'inline-secret-field' }));
    expect(() => toConnectStore(model, 10)).toThrowError(ConnectCredentialError);
  });

  it('rejects a store whose payload smuggles an inline secret, even if it was encrypted correctly', async () => {
    // Direct unit test of the store's own sidecar, so the guard is measurable independently of the
    // credential boundary that runs earlier in `persistConnectModel`.
    const base = toConnectStore(structuredClone(DEFAULT_CONNECT_MODEL), 10);
    for (const poison of [
      { password: 'hunter2' },
      { note: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNz' },
      { authorization: 'Basic YWxpY2U6c2VjcmV0LXBhc3N3b3Jk' },
    ]) {
      await expect(packVConnect({ ...base, vgtConnectView: { ...base.vgtConnectView!, searchQuery: JSON.stringify(poison) } as never }, PASSWORD))
        .rejects.toThrowError(expect.objectContaining({ code: 'vconnect-inline-secret-rejected' }));
    }
    // The unpoisoned store still packs fine.
    await expect(packVConnect(base, PASSWORD)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('keeps the canonical arrays populated so other apps can read the same store', async () => {
    const model: ConnectDocumentModel = {
      ...structuredClone(DEFAULT_CONNECT_MODEL),
      labels: [{ id: 'l2', name: 'Invoices', kind: 'custom' }],
      accounts: [toAccountSetting(fullyConfigured())!],
    };
    const store = toConnectStore(model, 10);
    expect(store.schema).toBe('astraea-vconnect-v1');
    expect(store.accounts[0].adapters[0].credentialHandle).toBe(HANDLE);
    expect(store.folders.map((folder) => folder.kind)).toContain('inbox');
    expect(store.folders.some((folder) => folder.name === 'Invoices')).toBe(true);
    expect(store.messages).toHaveLength(model.messages.length);
    expect(store.events).toHaveLength(model.events.length);
    expect(store.contacts).toHaveLength(model.contacts.length);
    expect(store.mailCache[0]).toMatchObject({ encrypted: true });
    // …and the canonical store really reopens through the platform unpacker.
    const container = await persistConnectModel(model, PASSWORD, 10);
    const unpacked = await unpackVConnect(container.bytes, PASSWORD);
    expect(unpacked.vgtConnectView?.labels?.[0].name).toBe('Invoices');
  });
});
