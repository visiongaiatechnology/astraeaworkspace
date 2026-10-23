// STATUS: DIAMANT VGT SUPREME — local-first mail engine
import type {
  ConnectAttachment,
  ConnectDraft,
  ConnectFolder,
  ConnectMailRule,
  ConnectMessage,
  ConnectPhishingIndicator,
  ConnectQueuedSend,
  ConnectSavedSearch,
} from '../../../platform/connectors/connectCoreTypes';
import { sanitizeMailHtmlDetailed } from './connectHtmlSanitizer';

export class ConnectMailError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectMailError';
  }
}

export const CONNECT_MAIL_LIMITS = {
  maxAttachmentBytes: 64 * 1024 * 1024,
  maxAttachments: 128,
  maxBodyChars: 5_000_000,
  maxMessagesPerOperation: 10_000,
  maxRuleConditions: 32,
  maxRuleActions: 16,
} as const;

const EXECUTABLE_MIME = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/x-dosexec',
  'application/vnd.microsoft.portable-executable',
]);
const EXECUTABLE_EXTENSION = /\.(?:exe|bat|cmd|ps1|vbs|js|scr|dll|com|jar)(?:[\s.]+)?$/i;

function text(value: string, max: number): string {
  if (value.length > max || /[\u0000\u0008\u000b\u000c]/.test(value)) {
    throw new ConnectMailError('text-boundary');
  }
  return value;
}

function address(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) || normalized.length > 320) {
    throw new ConnectMailError('address-invalid');
  }
  return normalized;
}

function normalizeMime(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}

function domainRisk(rawDomain: string): { ascii: string; idn: boolean } {
  const domain = rawDomain.trim().replace(/\.$/, '').toLowerCase();
  if (!domain || domain.length > 253) return { ascii: domain, idn: false };
  const unicodeInput = /[^\x00-\x7f]/.test(domain);
  let ascii = domain;
  try {
    ascii = new URL(`https://${domain}/`).hostname.toLowerCase();
  } catch {
    return { ascii: domain, idn: unicodeInput || domain.includes('xn--') };
  }
  return {
    ascii,
    idn: unicodeInput || ascii.split('.').some((label) => label.startsWith('xn--')),
  };
}

export interface AttachmentSecurityDecision {
  allowed: boolean;
  quarantined: boolean;
  code: 'ok' | 'attachment-size' | 'attachment-mime-mismatch' | 'attachment-executable-blocked' | 'attachment-malware-blocked';
  attachment: ConnectAttachment;
}

export function inspectAttachmentSecurity(attachment: ConnectAttachment): AttachmentSecurityDecision {
  const declaredMime = normalizeMime(attachment.declaredMime);
  const detectedMime = normalizeMime(attachment.detectedMime);
  const quarantine = (code: AttachmentSecurityDecision['code']): AttachmentSecurityDecision => ({
    allowed: false,
    quarantined: true,
    code,
    attachment: { ...attachment, safePreview: false, malwareScanState: 'blocked' },
  });

  if (attachment.sizeBytes < 0 || attachment.sizeBytes > CONNECT_MAIL_LIMITS.maxAttachmentBytes) {
    return quarantine('attachment-size');
  }
  if (!declaredMime || !detectedMime || declaredMime !== detectedMime) {
    return quarantine('attachment-mime-mismatch');
  }
  if (EXECUTABLE_MIME.has(detectedMime) || EXECUTABLE_EXTENSION.test(attachment.name.normalize('NFKC'))) {
    return quarantine('attachment-executable-blocked');
  }
  if (attachment.malwareScanState === 'blocked') {
    return quarantine('attachment-malware-blocked');
  }
  return {
    allowed: true,
    quarantined: false,
    code: 'ok',
    attachment: {
      ...attachment,
      declaredMime,
      detectedMime,
      safePreview: attachment.safePreview && attachment.malwareScanState === 'clean',
    },
  };
}

export function validateAttachment(attachment: ConnectAttachment): ConnectAttachment {
  const decision = inspectAttachmentSecurity(attachment);
  if (!decision.allowed) throw new ConnectMailError(decision.code);
  return decision.attachment;
}

export function quarantineIncomingAttachments(attachments: readonly ConnectAttachment[]): ConnectAttachment[] {
  if (attachments.length > CONNECT_MAIL_LIMITS.maxAttachments) throw new ConnectMailError('attachment-count');
  return attachments.map((attachment) => inspectAttachmentSecurity(attachment).attachment);
}

export function defaultMailFolders(accountId: string): ConnectFolder[] {
  return (['inbox', 'sent', 'drafts', 'archive', 'trash', 'junk'] as const).map((kind) => ({
    id: `${accountId}:${kind}`,
    accountId,
    name: kind[0].toUpperCase() + kind.slice(1),
    kind,
    labels: [],
  }));
}

export function normalizeDraft(draft: ConnectDraft): ConnectDraft {
  if (draft.to.length + draft.cc.length + draft.bcc.length > 1000) throw new ConnectMailError('recipient-limit');
  for (const recipient of [...draft.to, ...draft.cc, ...draft.bcc]) address(recipient.address);
  text(draft.subject, 998);
  text(draft.bodyText, CONNECT_MAIL_LIMITS.maxBodyChars);
  if (draft.bodyHtml) text(draft.bodyHtml, CONNECT_MAIL_LIMITS.maxBodyChars);
  if (draft.attachments.length > CONNECT_MAIL_LIMITS.maxAttachments) throw new ConnectMailError('attachment-count');
  return {
    ...structuredClone(draft),
    attachments: draft.attachments.map(validateAttachment),
    readReceiptRequested: Boolean(draft.readReceiptRequested),
  };
}

export function queueDraft(draft: ConnectDraft, releaseAt: number, undoWindowMs = 10_000, now = Date.now()): ConnectQueuedSend {
  const normalized = normalizeDraft(draft);
  const bounded = Math.max(10_000, Math.min(120_000, undoWindowMs));
  return {
    id: `send:${normalized.id}:${now}`,
    draft: normalized,
    releaseAt: Math.max(releaseAt, now + bounded),
    undoUntil: now + bounded,
    state: 'queued',
    createdAt: now,
  };
}

export function undoQueuedSend(item: ConnectQueuedSend, now = Date.now()): ConnectQueuedSend {
  if (item.state !== 'queued' || now > item.undoUntil) throw new ConnectMailError('undo-window-expired');
  return { ...item, state: 'cancelled' };
}

export async function releaseQueuedSend(
  item: ConnectQueuedSend,
  connectAndSend: (draft: ConnectDraft) => Promise<void>,
  now = Date.now(),
): Promise<ConnectQueuedSend> {
  if (item.state !== 'queued') throw new ConnectMailError('send-not-queued');
  if (now < item.releaseAt || now <= item.undoUntil) throw new ConnectMailError('send-release-pending');
  await connectAndSend(structuredClone(item.draft));
  return { ...item, state: 'released' };
}

function hay(message: ConnectMessage, field: ConnectMailRule['conditions'][number]['field']): string {
  switch (field) {
    case 'sender': return message.from.address;
    case 'recipient': return [...message.to, ...message.cc, ...message.bcc].map((recipient) => recipient.address).join(' ');
    case 'subject': return message.subject;
    case 'header': return Object.entries(message.headers).flat().join(' ');
    case 'body': return message.bodyText;
    case 'size': return String(message.bodyText.length + message.attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0));
    case 'attachment': return message.attachments.map((attachment) => `${attachment.name} ${attachment.detectedMime}`).join(' ');
  }
}

export function matchesRule(message: ConnectMessage, rule: ConnectMailRule): boolean {
  if (!rule.enabled || rule.conditions.length > CONNECT_MAIL_LIMITS.maxRuleConditions || rule.actions.length > CONNECT_MAIL_LIMITS.maxRuleActions) return false;
  const checks = rule.conditions.map((condition) => {
    const candidate = hay(message, condition.field);
    if (condition.operator === 'exists') return candidate.length > 0;
    if (condition.operator === 'contains') return candidate.toLowerCase().includes(String(condition.value ?? '').toLowerCase());
    if (condition.operator === 'equals') return candidate.toLowerCase() === String(condition.value ?? '').toLowerCase();
    const numericCandidate = Number(candidate);
    const numericValue = Number(condition.value);
    return condition.operator === 'gt' ? numericCandidate > numericValue : numericCandidate < numericValue;
  });
  return rule.all ? checks.every(Boolean) : checks.some(Boolean);
}

export function applyRule(message: ConnectMessage, rule: ConnectMailRule): { message: ConnectMessage; notifications: string[]; copies: string[] } {
  if (!matchesRule(message, rule)) return { message, notifications: [], copies: [] };
  const updated = structuredClone(message);
  const notifications: string[] = [];
  const copies: string[] = [];
  for (const action of rule.actions) {
    if (action.kind === 'move' && action.value) updated.folderId = action.value;
    if (action.kind === 'copy' && action.value) copies.push(action.value);
    if (action.kind === 'tag' && action.value && !updated.labels.includes(action.value)) updated.labels.push(action.value);
    if (action.kind === 'flag') updated.isFlagged = true;
    if (action.kind === 'notify') notifications.push(action.value ?? rule.name);
  }
  return { message: updated, notifications, copies };
}

export function analyzeMailSecurity(message: ConnectMessage): ConnectPhishingIndicator[] {
  const indicators: ConnectPhishingIndicator[] = [];
  const seen = new Set<string>();
  const addIdn = (context: 'Sender' | 'Link', domain: string) => {
    const risk = domainRisk(domain);
    if (!risk.idn) return;
    const key = `${context}:${risk.ascii}`;
    if (seen.has(key)) return;
    seen.add(key);
    indicators.push({
      kind: 'punycode',
      severity: 'warning',
      explanation: `${context} internationalized domain blocked for homograph review: ${risk.ascii}`,
    });
  };

  const fromDomain = message.from.address.split('@').at(-1) ?? '';
  addIdn('Sender', fromDomain);

  const body = `${message.bodyText}\n${message.bodyHtml ?? ''}`;
  const urls = (body.match(/https?:\/\/[^\s<>()"']+/giu) ?? []).slice(0, 256);
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      addIdn('Link', url.hostname);
      if (url.protocol !== 'https:') {
        indicators.push({ kind: 'suspicious-link', severity: 'warning', explanation: `Non-HTTPS link: ${url.hostname}` });
      }
      if (/(?:^|[?&#/_-])(?:utm_[^=&#]*|pixel|track(?:ing)?|beacon)(?:[=&#/_-]|$)/i.test(url.href)) {
        indicators.push({ kind: 'remote-tracker', severity: 'info', explanation: `Possible tracking URL: ${url.hostname}` });
      }
    } catch {
      indicators.push({ kind: 'suspicious-link', severity: 'warning', explanation: 'Malformed URL detected' });
    }
  }
  return indicators.slice(0, 64);
}

export function assertMailIdentitySafe(message: ConnectMessage): true {
  if (analyzeMailSecurity(message).some((indicator) => indicator.kind === 'punycode' && indicator.severity === 'warning')) {
    throw new ConnectMailError('mail-idn-homograph-blocked');
  }
  return true;
}

/**
 * BATCH-CONNECT-3: the previous blacklist-regex implementation of this function was bypassable
 * (measured: `<svg/onload=alert(1)>`, `javas\tcript:` and `java&#115;cript:` all survived). It now
 * delegates to the tokenising allowlist in `connectHtmlSanitizer.ts`. The signature is unchanged so
 * existing callers keep working; `sanitizeMailHtmlDetailed` additionally reports what was removed.
 */
export function sanitizeHtmlMail(html: string, allowRemote = false): string {
  return sanitizeMailHtmlDetailed(html, { allowRemote }).html;
}

export function searchMessages(messages: readonly ConnectMessage[], query: string): ConnectMessage[] {
  const terms = query.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  if (terms.length > 32) throw new ConnectMailError('search-term-limit');
  return messages.filter((message) => terms.every((term) => {
    const [rawKey, ...rest] = term.split(':');
    const hasOperator = rest.length > 0;
    const key = hasOperator ? rawKey.toLowerCase() : 'text';
    const value = (hasOperator ? rest.join(':') : term).replace(/^"|"$/g, '').toLowerCase();
    switch (key) {
      case 'from': return message.from.address.toLowerCase().includes(value);
      case 'to': return message.to.some((recipient) => recipient.address.toLowerCase().includes(value));
      case 'subject': return message.subject.toLowerCase().includes(value);
      case 'category': return message.labels.some((label) => label.toLowerCase() === value);
      case 'folder': return message.folderId.toLowerCase().includes(value);
      case 'is': return value === 'read' ? message.isRead : value === 'unread' ? !message.isRead : value === 'starred' ? message.isStarred : false;
      case 'has': return value === 'attachment' ? message.attachments.length > 0 : false;
      case 'date': return new Date(message.receivedAt).toISOString().slice(0, 10) === value;
      default:
        return `${message.subject}\n${message.bodyText}\n${message.from.address}\n${message.attachments.map((attachment) => attachment.name).join(' ')}`
          .toLowerCase()
          .includes(value);
    }
  }));
}

export function validateSavedSearch(search: ConnectSavedSearch): ConnectSavedSearch {
  text(search.name, 128);
  text(search.query, 2048);
  return { ...search };
}
