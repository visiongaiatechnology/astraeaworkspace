// STATUS: PLATIN — BATCH-CONNECT-6 tests: folder/label management, moves, rules, spam triage, notifications.
import { describe, expect, it } from 'vitest';
import {
  applyAllRules,
  applyMailboxRule,
  createLabel,
  deleteLabel,
  listFolders,
  moveMessage,
  renameLabel,
  setReadState,
  triageMessage,
  undoMove,
  unreadCount,
} from '../domain/connectMailboxCore';
import {
  isQuietAt,
  markAllNotificationsRead,
  markNotificationRead,
  parseClockMinutes,
  pruneNotifications,
  pushNotification,
  suppressedCount,
  surfacedNotifications,
  validateFocusState,
} from '../domain/connectNotifications';
import { applyRule, matchesRule, defaultMailFolders } from '../domain/connectMailCore';
import type { ConnectFocusState, ConnectLabel, ConnectMailRuleSetting, ConnectMessage } from '../domain/types';
import type { ConnectMessage as CoreMessage, ConnectMailRule } from '../../../platform/connectors/connectCoreTypes';

const msg = (overrides: Partial<ConnectMessage> & { id: string }): ConnectMessage => ({
  sender: 'Peer', senderEmail: 'peer@example.test', recipients: ['me@example.test'], subject: 'Subject',
  snippet: 's', body: 'body', timestamp: 1_700_000_000_000, folder: 'inbox',
  isUnread: true, isStarred: false, isEncrypted: false, ...overrides,
});

const FOLDERS = listFolders('acc');
/** Local noon, so a notification test never accidentally lands inside quiet hours. */
const NOON = new Date(2026, 8, 11, 12, 0, 0).getTime();
const focus = (overrides: Partial<ConnectFocusState> = {}): ConnectFocusState => ({
  badgeEnabled: true, quietFrom: '22:00', quietTo: '07:00', calendarAlertsEnabled: true, ...overrides,
});

describe('Connect folders and labels', () => {
  it('lists the fixed IMAP folders in order and appends custom ones at depth 1', () => {
    const labels: ConnectLabel[] = [{ id: 'l1', name: 'Projects', kind: 'custom' }];
    const folders = listFolders('acc', labels);
    expect(folders.slice(0, 6).map((folder) => folder.kind)).toEqual(['inbox', 'sent', 'drafts', 'archive', 'junk', 'trash']);
    expect(folders.at(-1)).toMatchObject({ name: 'Projects', kind: 'custom', depth: 1 });
    expect(defaultMailFolders('acc')).toHaveLength(6);
  });

  it('validates a new label and refuses duplicates and control characters', () => {
    expect(createLabel([], { id: 'l1', name: 'Projects' })).toEqual([{ id: 'l1', name: 'Projects', kind: 'custom' }]);
    expect(() => createLabel([{ id: 'l1', name: 'Projects', kind: 'custom' }], { id: 'l1', name: 'Other' })).toThrowError(expect.objectContaining({ code: 'folder-duplicate' }));
    expect(() => createLabel([], { id: 'l2', name: 'bad\u0000name' })).toThrowError(expect.objectContaining({ code: 'folder-name-invalid' }));
    expect(() => createLabel([], { id: 'bad id', name: 'X' })).toThrowError(expect.objectContaining({ code: 'folder-id-invalid' }));
    expect(() => createLabel(Array.from({ length: 512 }, (_, index) => ({ id: `l${index}`, name: `N${index}`, kind: 'custom' as const })), { id: 'lnew', name: 'N' }))
      .toThrowError(expect.objectContaining({ code: 'folder-limit' }));
  });

  it('renames a label and deletes one without deleting mail', () => {
    const labels: ConnectLabel[] = [{ id: 'l1', name: 'Projects', kind: 'custom' }];
    expect(renameLabel(labels, 'l1', 'Arbeit')[0].name).toBe('Arbeit');
    expect(() => renameLabel(labels, 'nope', 'X')).toThrowError(expect.objectContaining({ code: 'folder-unknown' }));
    const withLabel = [msg({ id: 'a', labels: ['Projects'] }), msg({ id: 'b' })];
    const result = deleteLabel(labels, withLabel, 'l1');
    expect(result.labels).toEqual([]);
    // The message is reported as detached — it is never removed together with the folder.
    expect(result.detached).toEqual(['a']);
  });

  it('moves a message and can undo the move, and refuses an unknown target', () => {
    const messages = [msg({ id: 'a' }), msg({ id: 'b' })];
    const { messages: moved, move } = moveMessage(messages, 'a', { folder: 'archive' }, FOLDERS, 5);
    expect(moved.find((message) => message.id === 'a')?.folder).toBe('archive');
    expect(move).toMatchObject({ messageId: 'a', fromFolder: 'inbox', toFolder: 'archive' });
    expect(undoMove(moved, move).find((message) => message.id === 'a')?.folder).toBe('inbox');
    expect(() => moveMessage(messages, 'ghost', { folder: 'archive' }, FOLDERS)).toThrowError(expect.objectContaining({ code: 'move-message-unknown' }));
    expect(() => moveMessage(messages, 'a', { folder: 'nope' as never }, FOLDERS)).toThrowError(expect.objectContaining({ code: 'move-folder-unknown' }));
  });

  it('marks read and unread explicitly and counts only the requested folder', () => {
    const messages = [msg({ id: 'a', folder: 'inbox', isUnread: true }), msg({ id: 'b', folder: 'archive', isUnread: true })];
    expect(unreadCount(messages, 'inbox')).toBe(1);
    const read = setReadState(messages, 'a', false);
    expect(read.find((message) => message.id === 'a')?.isUnread).toBe(false);
    expect(unreadCount(setReadState(messages, 'a', false), 'inbox')).toBe(0);
    expect(() => setReadState(messages, 'ghost', false)).toThrowError(expect.objectContaining({ code: 'read-message-unknown' }));
  });
});

describe('Connect rule application: no silent deletion', () => {
  const rule = (overrides: Partial<ConnectMailRuleSetting> = {}): ConnectMailRuleSetting => ({
    id: 'r1', name: 'Newsletter', enabled: true, match: 'newsletter', action: 'move', target: 'junk', ...overrides,
  });

  it('moves matching mail to junk and reports where it went', () => {
    const target = msg({ id: 'a', subject: 'Weekly newsletter' });
    const outcome = applyMailboxRule(target, rule(), FOLDERS);
    expect(outcome.applied).toBe(true);
    expect(outcome.movedTo).toBe('junk');
    expect(outcome.message.folder).toBe('junk');
    // Nothing was deleted.
    expect(outcome.message.id).toBe('a');
  });

  it('reports an unknown destination instead of quietly doing nothing', () => {
    const outcome = applyMailboxRule(msg({ id: 'a', subject: 'newsletter' }), rule({ target: 'Nirwana' }), FOLDERS);
    expect(outcome.applied).toBe(false);
    expect(outcome.unresolved).toBe('rule-target-unknown');
  });

  it('reports a rule with an empty match or missing target', () => {
    expect(applyMailboxRule(msg({ id: 'a' }), rule({ match: '   ' }), FOLDERS).unresolved).toBe('rule-match-empty');
    expect(applyMailboxRule(msg({ id: 'a', subject: 'newsletter' }), rule({ target: undefined }), FOLDERS).unresolved).toBe('rule-target-missing');
  });

  it('labels, flags and ignores a disabled rule', () => {
    const labelled = applyMailboxRule(msg({ id: 'a', subject: 'newsletter' }), rule({ action: 'label', target: 'News' }), FOLDERS);
    expect(labelled.labelled).toBe('News');
    expect(labelled.message.labels).toContain('News');
    const flagged = applyMailboxRule(msg({ id: 'a', subject: 'newsletter' }), rule({ action: 'flag' }), FOLDERS);
    expect(flagged.message.isStarred).toBe(true);
    expect(applyMailboxRule(msg({ id: 'a', subject: 'newsletter' }), rule({ enabled: false }), FOLDERS).applied).toBe(false);
  });

  it('applies every rule in order and is bounded', () => {
    const rules = [rule(), rule({ id: 'r2', target: 'archive' })];
    const { message, outcomes } = applyAllRules(msg({ id: 'a', subject: 'newsletter' }), rules, FOLDERS);
    expect(outcomes).toHaveLength(2);
    expect(message.folder).toBe('archive');
    expect(applyAllRules(msg({ id: 'a' }), Array.from({ length: 400 }, (_, index) => rule({ id: `r${index}` })), FOLDERS).outcomes).toHaveLength(256);
  });

  it('stays compatible with the platform rule engine', () => {
    const core: CoreMessage = {
      id: 'm', accountId: 'a', messageId: '<m@x>', threadId: 't', folderId: 'a:inbox', labels: [],
      from: { address: 'peer@example.test' }, to: [{ address: 'me@example.test' }], cc: [], bcc: [],
      subject: 'Audit report', bodyText: 'body', format: 'plain', receivedAt: 1, priority: 'normal',
      readReceiptRequested: false, isRead: true, isStarred: false, isPinned: false, isFlagged: false,
      attachments: [], headers: {}, remoteContentAllowed: false, security: { phishingIndicators: [], remoteContentBlocked: true },
    };
    const platformRule: ConnectMailRule = { id: 'pr', name: 'audit', enabled: true, all: true, conditions: [{ field: 'subject', operator: 'contains', value: 'audit' }], actions: [{ kind: 'notify', value: 'audit-mail' }] };
    expect(matchesRule(core, platformRule)).toBe(true);
    expect(applyRule(core, platformRule).notifications).toEqual(['audit-mail']);
    expect(matchesRule(core, { ...platformRule, enabled: false })).toBe(false);
  });
});

describe('Connect spam triage is advisory only', () => {
  it('never auto-deletes, whatever the score', () => {
    const heavy = triageMessage(msg({ id: 'a' }), [
      { severity: 'warning', kind: 'punycode', explanation: 'IDN sender' },
      { severity: 'warning', kind: 'suspicious-link', explanation: 'non-HTTPS link' },
      { severity: 'warning', kind: 'display-domain-mismatch', explanation: 'display mismatch' },
    ]);
    expect(heavy.level).toBe('likely-spam');
    expect(heavy.autoDelete).toBe(false);
    expect(heavy.reasons.length).toBeGreaterThan(0);
  });

  it('downgrades a trusted sender and a VIP subject', () => {
    const trusted = triageMessage(msg({ id: 'a', senderEmail: 'auditor@example.test' }), [], ['auditor@example.test']);
    expect(trusted.level).toBe('clean');
    const vip = triageMessage(msg({ id: 'a', subject: 'Release 0.1 validated' }), [{ severity: 'info', kind: 'remote-tracker', explanation: 'tracker' }], [], ['release']);
    expect(vip.level).toBe('clean');
  });

  it('bounds the reason list', () => {
    const many = Array.from({ length: 50 }, (_, index) => ({ severity: 'info' as const, kind: 'remote-tracker', explanation: `t${index}` }));
    expect(triageMessage(msg({ id: 'a' }), many).reasons).toHaveLength(16);
  });
});

describe('Connect notifications and focus', () => {
  it('parses quiet hours and handles a window that wraps midnight', () => {
    expect(parseClockMinutes('22:30')).toBe(1350);
    expect(parseClockMinutes('24:00')).toBeUndefined();
    expect(parseClockMinutes('7:00')).toBeUndefined();
    expect(() => validateFocusState(focus({ quietFrom: 'nope' }))).toThrowError(expect.objectContaining({ code: 'focus-time-invalid' }));
    const at = (hour: number, minute = 0) => new Date(2026, 8, 11, hour, minute);
    expect(isQuietAt(focus(), at(23))).toBe(true);
    expect(isQuietAt(focus(), at(6, 59))).toBe(true);
    expect(isQuietAt(focus(), at(7))).toBe(false);
    expect(isQuietAt(focus({ quietFrom: '09:00', quietTo: '09:00' }), at(9))).toBe(false);
  });

  it('surfaces a new-mail notification outside quiet hours', () => {
    const outcome = pushNotification([], { kind: 'mail', code: 'new-mail', dedupeKey: 'msg-1' }, focus(), new Date(2026, 8, 11, 12).getTime());
    expect(outcome.reason).toBe('shown');
    expect(outcome.surfaced?.code).toBe('new-mail');
    expect(surfacedNotifications(outcome.tray)).toHaveLength(1);
    expect(suppressedCount(outcome.tray)).toBe(0);
  });

  it('suppresses inside quiet hours and during a badge-off focus state instead of popping up', () => {
    const quiet = pushNotification([], { kind: 'mail', code: 'new-mail', dedupeKey: 'msg-2' }, focus(), new Date(2026, 8, 11, 23).getTime());
    expect(quiet.reason).toBe('quiet-hours');
    expect(quiet.surfaced).toBeUndefined();
    expect(suppressedCount(quiet.tray)).toBe(1);
    expect(surfacedNotifications(quiet.tray)).toHaveLength(0);

    // The badge counter is a display choice, not a reason to hide a notification from the tray.
    const badgeOff = pushNotification([], { kind: 'sync', code: 'sync-done', dedupeKey: 'k' }, focus({ badgeEnabled: false }), NOON);
    expect(badgeOff.surfaced?.code).toBe('sync-done');
    expect(surfacedNotifications(badgeOff.tray)).toHaveLength(1);
  });

  it('never shows the same event twice', () => {
    const first = pushNotification([], { kind: 'mail', code: 'new-mail', dedupeKey: 'msg-3' }, focus(), NOON);
    const second = pushNotification(first.tray, { kind: 'mail', code: 'new-mail', dedupeKey: 'msg-3' }, focus(), NOON + 1);
    expect(second.reason).toBe('duplicate');
    expect(second.tray).toHaveLength(1);
    // After it is read, a genuinely new event may surface again.
    const read = markNotificationRead(second.tray, second.tray[0].id, NOON + 2);
    expect(pushNotification(read, { kind: 'mail', code: 'new-mail', dedupeKey: 'msg-3' }, focus(), NOON + 3).reason).toBe('shown');
  });

  it('respects the calendar toggle and disables calendar alerts on request', () => {
    expect(pushNotification([], { kind: 'calendar', code: 'event-soon', dedupeKey: 'e1' }, focus({ calendarAlertsEnabled: false }), NOON).reason).toBe('focus-disabled');
    expect(pushNotification([], { kind: 'calendar', code: 'event-soon', dedupeKey: 'e1' }, focus(), NOON).reason).toBe('shown');
    expect(pushNotification([], { kind: 'calendar', code: 'event-soon', dedupeKey: 'e1', allowCalendar: false }, focus(), NOON).reason).toBe('focus-disabled');
  });

  it('bounds the tray and never discards an unread entry to make room', () => {
    let tray = Array.from({ length: 500 }, (_, index) => ({ id: `n${index}`, kind: 'mail' as const, code: 'new-mail', createdAt: index }));
    expect(pushNotification(tray, { kind: 'mail', code: 'new-mail', dedupeKey: 'overflow' }, focus(), NOON).reason).toBe('tray-limit');
    tray = tray.map((entry, index) => (index === 3 ? { ...entry, readAt: 9 } : entry));
    const outcome = pushNotification(tray, { kind: 'mail', code: 'new-mail', dedupeKey: 'overflow' }, focus(), NOON);
    expect(outcome.tray).toHaveLength(500);
    expect(outcome.tray.some((entry) => entry.id === 'n3')).toBe(false);
    expect(outcome.tray.at(-1)?.id).toContain('overflow');
  });

  it('bounds argument size and prunes the tray', () => {
    const outcome = pushNotification([], { kind: 'mail', code: 'new-mail', dedupeKey: 'k', args: { subject: 'x'.repeat(2000) } }, focus(), NOON);
    expect(String(outcome.tray[0].args?.subject).length).toBe(512);
    expect(pruneNotifications(Array.from({ length: 100 }, (_, index) => ({ id: `${index}`, kind: 'mail' as const, code: 'c', createdAt: index })), 10)).toHaveLength(10);
    expect(markAllNotificationsRead([{ id: 'a', kind: 'mail', code: 'c', createdAt: 1 }], 5)[0].readAt).toBe(5);
  });
});
