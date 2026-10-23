// STATUS: PLATIN — BATCH-CONNECT-6: folders, labels, rule application and bounded spam triage.
//
// MEASURED GAPS before this batch:
//  - `ConnectSidebar.tsx` offered six fixed folders; the documented IMAP folder kind `custom`
//    (`platform/connectors/connectCoreTypes.ts:5`) was unreachable, and there was no way to move a
//    message: `ConnectMailList.tsx:23` only selected, `:31` only toggled the star.
//  - `connectMailCore.applyRule` could `move` a message but nothing surfaced *where* it went, and a rule
//    whose target did not exist produced no message at all — a silent no-op.
//  - `junk` and `trash` existed in `defaultMailFolders` (`connectMailCore.ts:126`) with no UI and no
//    "never delete silently" rule.
//
// Everything here is pure and bounded; the caller persists the result through Connect's canonical store.

import type { ConnectMessage, ConnectLabel, ConnectMailRuleSetting } from './types';
import { defaultMailFolders } from './connectMailCore';

export class ConnectMailboxError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectMailboxError';
  }
}

/** The folders every account has, in display order. `custom` entries are appended by the user. */
export const CONNECT_FOLDER_ORDER = ['inbox', 'sent', 'drafts', 'archive', 'junk', 'trash'] as const;

/** Folders whose contents the user must never be surprised by: nothing is auto-deleted. */
export const CONNECT_PROTECTED_FOLDERS = ['trash', 'junk'] as const;

export interface ConnectFolderDescriptor {
  readonly id: string;
  readonly name: string;
  readonly kind: (typeof CONNECT_FOLDER_ORDER)[number] | 'custom';
  readonly depth: number;
  readonly parentId?: string;
  readonly selectable: boolean;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Build the folder list from the fixed kinds plus bounded custom labels. */
export function listFolders(accountId: string, labels: readonly ConnectLabel[] = []): ConnectFolderDescriptor[] {
  const byKind = new Map(defaultMailFolders(accountId).map((folder) => [folder.kind as string, folder]));
  // The canonical folder record comes from `connectMailCore.defaultMailFolders`; only the *display*
  // order is defined here, so no second folder definition is introduced.
  const fixed: ConnectFolderDescriptor[] = CONNECT_FOLDER_ORDER
    .map((kind) => byKind.get(kind))
    .filter((folder): folder is NonNullable<typeof folder> => folder !== undefined)
    .map((folder) => ({ id: folder.id, name: folder.name, kind: folder.kind as ConnectFolderDescriptor['kind'], depth: 0, selectable: true }));
  const extra: ConnectFolderDescriptor[] = [];
  for (const label of labels) {
    const name = label.name.trim();
    if (!name || name.length > 256 || CONTROL_CHARS.test(name)) throw new ConnectMailboxError('folder-name-invalid');
    if (!/^[A-Za-z0-9._~-]{1,128}$/.test(label.id)) throw new ConnectMailboxError('folder-id-invalid');
    // Only the folder kinds this module can render are accepted; anything else (including the
    // canonical `vault`) is shown as a custom user folder instead of inventing a new tree entry.
    const kind: ConnectFolderDescriptor['kind'] = (CONNECT_FOLDER_ORDER as readonly string[]).includes(label.kind)
      ? (label.kind as ConnectFolderDescriptor['kind'])
      : 'custom';
    extra.push({ id: `${accountId}:custom:${label.id}`, name, kind, depth: 1, parentId: `${accountId}:inbox`, selectable: true });
  }
  if (fixed.length + extra.length > 512) throw new ConnectMailboxError('folder-limit');
  return [...fixed, ...extra];
}

/** Create a label/folder with validated, bounded input. */
export function createLabel(labels: readonly ConnectLabel[], input: { id: string; name: string; kind?: ConnectLabel['kind'] }): ConnectLabel[] {
  const name = input.name.trim();
  if (!name || name.length > 256 || CONTROL_CHARS.test(name)) throw new ConnectMailboxError('folder-name-invalid');
  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(input.id)) throw new ConnectMailboxError('folder-id-invalid');
  if (labels.some((label) => label.id === input.id || label.name.toLowerCase() === name.toLowerCase())) {
    throw new ConnectMailboxError('folder-duplicate');
  }
  if (labels.length >= 512) throw new ConnectMailboxError('folder-limit');
  return [...labels, { id: input.id, name, kind: input.kind ?? 'custom' }];
}

export function renameLabel(labels: readonly ConnectLabel[], id: string, name: string): ConnectLabel[] {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 256 || CONTROL_CHARS.test(trimmed)) throw new ConnectMailboxError('folder-name-invalid');
  if (!labels.some((label) => label.id === id)) throw new ConnectMailboxError('folder-unknown');
  if (labels.some((label) => label.id !== id && label.name.toLowerCase() === trimmed.toLowerCase())) throw new ConnectMailboxError('folder-duplicate');
  return labels.map((label) => (label.id === id ? { ...label, name: trimmed } : label));
}

/** Deleting a folder never deletes mail: the messages are reported so the caller can move them. */
export function deleteLabel(
  labels: readonly ConnectLabel[],
  messages: readonly ConnectMessage[],
  id: string,
): { labels: ConnectLabel[]; detached: string[] } {
  const label = labels.find((entry) => entry.id === id);
  if (!label) throw new ConnectMailboxError('folder-unknown');
  const detached = messages.filter((message) => (message.labels ?? []).includes(label.name)).map((message) => message.id);
  return { labels: labels.filter((entry) => entry.id !== id), detached };
}

/**
 * Apply one user rule. A rule never deletes: a `move` records the destination, and a rule whose target
 * folder does not exist is reported as `unresolved` instead of doing nothing quietly.
 */
export interface ConnectRuleOutcome {
  readonly message: ConnectMessage;
  readonly applied: boolean;
  readonly movedTo?: string;
  readonly labelled?: string;
  readonly flagged?: boolean;
  readonly unresolved?: string;
}

export function applyMailboxRule(
  message: ConnectMessage,
  rule: ConnectMailRuleSetting,
  availableFolders: readonly ConnectFolderDescriptor[],
): ConnectRuleOutcome {
  if (!rule.enabled) return { message, applied: false };
  const needle = rule.match.trim().toLowerCase();
  if (!needle) return { message, applied: false, unresolved: 'rule-match-empty' };
  const haystack = [message.sender, message.senderEmail, message.subject, message.snippet, message.body].join('\n').toLowerCase();
  if (!haystack.includes(needle)) return { message, applied: false };
  if (rule.action === 'move') {
    const target = rule.target?.trim();
    if (!target) return { message, applied: false, unresolved: 'rule-target-missing' };
    if (!availableFolders.some((folder) => folder.kind === target || folder.name === target || folder.id === target)) {
      return { message, applied: false, unresolved: 'rule-target-unknown' };
    }
    const folder = availableFolders.find((entry) => entry.kind === target || entry.name === target || entry.id === target) as ConnectFolderDescriptor;
    if (folder.kind === 'trash' || folder.kind === 'junk') {
      // Moving to junk/trash is allowed but must be visible: the caller renders `movedTo`.
      return { message: { ...message, folder: folder.kind as ConnectMessage['folder'] }, applied: true, movedTo: folder.kind };
    }
    if (folder.kind === 'custom') {
      const labels = new Set([...(message.labels ?? []), folder.name]);
      return { message: { ...message, labels: [...labels] }, applied: true, movedTo: folder.name, labelled: folder.name };
    }
    return { message: { ...message, folder: folder.kind as ConnectMessage['folder'] }, applied: true, movedTo: folder.kind };
  }
  if (rule.action === 'label') {
    const target = rule.target?.trim();
    if (!target) return { message, applied: false, unresolved: 'rule-target-missing' };
    const labels = new Set([...(message.labels ?? []), target]);
    return { message: { ...message, labels: [...labels] }, applied: true, labelled: target };
  }
  return { message: { ...message, isStarred: true }, applied: true, flagged: true };
}

/** Apply every enabled rule in order, bounded, and report the combined effect. */
export function applyAllRules(
  message: ConnectMessage,
  rules: readonly ConnectMailRuleSetting[],
  folders: readonly ConnectFolderDescriptor[],
): { message: ConnectMessage; outcomes: ConnectRuleOutcome[] } {
  let current = message;
  const outcomes: ConnectRuleOutcome[] = [];
  for (const rule of rules.slice(0, 256)) {
    const outcome = applyMailboxRule(current, rule, folders);
    outcomes.push(outcome);
    current = outcome.message;
  }
  return { message: current, outcomes };
}

/** A move the user can undo. Nothing is deleted, so the inverse is always available. */
export interface ConnectMove {
  readonly messageId: string;
  readonly fromFolder: ConnectMessage['folder'];
  readonly fromLabels: string[];
  readonly toFolder?: ConnectMessage['folder'];
  readonly toLabel?: string;
  readonly at: number;
}

export function moveMessage(
  messages: readonly ConnectMessage[],
  messageId: string,
  destination: { folder?: ConnectMessage['folder']; label?: string },
  folders: readonly ConnectFolderDescriptor[],
  now = Date.now(),
): { messages: ConnectMessage[]; move: ConnectMove } {
  const target = messages.find((message) => message.id === messageId);
  if (!target) throw new ConnectMailboxError('move-message-unknown');
  if (destination.folder && !folders.some((folder) => folder.kind === destination.folder)) {
    throw new ConnectMailboxError('move-folder-unknown');
  }
  if (destination.label && !folders.some((folder) => folder.name === destination.label || folder.kind === 'custom')) {
    throw new ConnectMailboxError('move-label-unknown');
  }
  const move: ConnectMove = {
    messageId,
    fromFolder: target.folder,
    fromLabels: [...(target.labels ?? [])],
    toFolder: destination.folder,
    toLabel: destination.label,
    at: now,
  };
  const messages2 = messages.map((message) => {
    if (message.id !== messageId) return message;
    const labels = new Set(message.labels ?? []);
    if (destination.label) labels.add(destination.label);
    return { ...message, folder: destination.folder ?? message.folder, labels: destination.folder && !destination.label ? [] : [...labels] };
  });
  return { messages: messages2, move };
}

/** Undo a recorded move. A failure is explicit instead of a silent no-op. */
export function undoMove(messages: readonly ConnectMessage[], move: ConnectMove): ConnectMessage[] {
  if (!messages.some((message) => message.id === move.messageId)) throw new ConnectMailboxError('move-message-unknown');
  return messages.map((message) => (message.id === move.messageId ? { ...message, folder: move.fromFolder, labels: [...move.fromLabels] } : message));
}

/** Mark read/unread. Separate from selection, so an accidental click is not a state change. */
export function setReadState(messages: readonly ConnectMessage[], messageId: string, isUnread: boolean): ConnectMessage[] {
  if (!messages.some((message) => message.id === messageId)) throw new ConnectMailboxError('read-message-unknown');
  return messages.map((message) => (message.id === messageId ? { ...message, isUnread } : message));
}

export function unreadCount(messages: readonly ConnectMessage[], folder: ConnectMessage['folder']): number {
  return messages.filter((message) => message.folder === folder && message.isUnread).length;
}

export interface ConnectSpamVerdict {
  readonly level: 'clean' | 'advisory' | 'likely-spam';
  readonly score: number;
  readonly reasons: string[];
  /** Never `true` for an automatic decision — only a user action may delete a message. */
  readonly autoDelete: false;
}

/**
 * Triage a message with the existing phishing analysis. The verdict is advisory: `autoDelete` is
 * always `false`, so a rule can move a message to junk but nothing deletes mail behind the user's back.
 */
export function triageMessage(
  message: ConnectMessage,
  indicators: readonly { severity: 'info' | 'warning'; kind: string; explanation: string }[],
  trustedSenders: readonly string[] = [],
  vipSubjects: readonly string[] = [],
): ConnectSpamVerdict {
  const reasons: string[] = [];
  let score = 0;
  for (const indicator of indicators) {
    score += indicator.severity === 'warning' ? 2 : 1;
    reasons.push(indicator.explanation);
  }
  const sender = message.senderEmail.toLowerCase();
  const trusted = trustedSenders.map((entry) => entry.toLowerCase()).includes(sender);
  if (trusted && indicators.length === 0) {
    reasons.push('trusted sender with no indicators');
    score = Math.max(0, score - 2);
  }
  const subjectLower = message.subject.toLowerCase();
  if (vipSubjects.some((subject) => subjectLower.includes(subject.toLowerCase()))) {
    score -= 1;
    reasons.push('subject matches a VIP/release pattern');
  }
  const level: ConnectSpamVerdict['level'] = score >= 4 ? 'likely-spam' : score >= 1 ? 'advisory' : 'clean';
  return { level, score: Math.max(0, score), reasons: reasons.slice(0, 16), autoDelete: false };
}
