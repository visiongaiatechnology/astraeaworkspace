// STATUS: PLATIN — a policy preview is usable only when the native echo matches the request.

export type NetGateVerdict =
  | 'Allowed'
  | 'BlockedByDefault'
  | 'BlockedUserPolicy'
  | 'BlockedTelemetryBlacklist'
  | 'BlockedResolution'
  | 'BlockedRateLimit'
  | 'BlockedResourceLimit'
  | 'BlockedExpiredCapability'
  | 'BlockedTlsPolicy'
  | 'BlockedCancelled';

export type NetGateCapability = 'None' | 'LocalLanOnly' | 'WhitelistedOnly' | 'FullUserApproved';
export type NetGateDestinationClass = 'Loopback' | 'PrivateLan' | 'LinkLocal' | 'PublicInternet';

export interface NetGatePreviewExpectation {
  capability: NetGateCapability;
  targetHost: string;
  targetPort: number;
  purpose: string;
  componentId: string;
  documentId: string | null;
  automationId: string | null;
}

export interface NetGatePreviewResponse {
  verdict: NetGateVerdict;
  capability: NetGateCapability;
  target_host: string;
  target_port: number;
  purpose: string;
  component_id: string;
  document_id: string | null;
  automation_id: string | null;
  destination_classes: NetGateDestinationClass[];
  capability_id: string | null;
  preview_only: true;
  resolution_required: boolean;
}

const RESPONSE_FIELDS = [
  'verdict',
  'capability',
  'target_host',
  'target_port',
  'purpose',
  'component_id',
  'document_id',
  'automation_id',
  'destination_classes',
  'capability_id',
  'preview_only',
  'resolution_required',
] as const;

const VERDICTS: readonly NetGateVerdict[] = [
  'Allowed',
  'BlockedByDefault',
  'BlockedUserPolicy',
  'BlockedTelemetryBlacklist',
  'BlockedResolution',
  'BlockedRateLimit',
  'BlockedResourceLimit',
  'BlockedExpiredCapability',
  'BlockedTlsPolicy',
  'BlockedCancelled',
];

const CAPABILITIES: readonly NetGateCapability[] = ['None', 'LocalLanOnly', 'WhitelistedOnly', 'FullUserApproved'];
const DESTINATION_CLASSES: readonly NetGateDestinationClass[] = ['Loopback', 'PrivateLan', 'LinkLocal', 'PublicInternet'];

function readExactDataRecord(value: unknown): Record<(typeof RESPONSE_FIELDS)[number], unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const keys = Reflect.ownKeys(value);
    if (keys.length !== RESPONSE_FIELDS.length || keys.some((key) => typeof key !== 'string')) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const record = Object.create(null) as Record<(typeof RESPONSE_FIELDS)[number], unknown>;

    for (const field of RESPONSE_FIELDS) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
      record[field] = descriptor.value;
    }

    return record;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/\p{Cc}/u.test(value);
}

function nullableText(value: unknown, maxLength: number): value is string | null {
  return value === null || boundedText(value, maxLength);
}

function canonicalHostKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 253 || /[\s/@?#\\]/u.test(trimmed)) return null;

  const bracketedIpv6 = /^\[([^\]]+)\]$/u.exec(trimmed);
  const unbracketed = bracketedIpv6?.[1] ?? trimmed;
  if (unbracketed.includes(':')) {
    try {
      const parsed = new URL(`https://[${unbracketed}]/`);
      return parsed.hostname.slice(1, -1).toLowerCase();
    } catch {
      return null;
    }
  }

  const canonical = unbracketed.replace(/\.+$/u, '').toLowerCase();
  if (!canonical || canonical.length > 253) return null;
  if (canonical === 'localhost') return canonical;
  const labels = canonical.split('.');
  if (labels.some((label) => label.length === 0 || label.length > 63 ||
    label.startsWith('-') || label.endsWith('-') || !/^[a-z0-9-]+$/u.test(label))) return null;
  return canonical;
}

function isStringArray(value: unknown): value is NetGateDestinationClass[] {
  if (!Array.isArray(value)) return false;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!Number.isSafeInteger(length) || (length as number) > DESTINATION_CLASSES.length) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== (length as number) + 1 || keys.some((key) => key !== 'length' && !/^(0|[1-3])$/u.test(String(key)))) return false;

    const seen = new Set<string>();
    for (let index = 0; index < (length as number); index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
      const item: unknown = descriptor.value;
      if (typeof item !== 'string' || !DESTINATION_CLASSES.includes(item as NetGateDestinationClass) || seen.has(item)) return false;
      seen.add(item);
    }
    return true;
  } catch {
    return false;
  }
}

export function parseNetGatePolicyResponse(
  value: unknown,
  expected: NetGatePreviewExpectation,
): NetGatePreviewResponse | null {
  const record = readExactDataRecord(value);
  if (!record || typeof record.verdict !== 'string' || !VERDICTS.includes(record.verdict as NetGateVerdict)) return null;
  if (typeof record.capability !== 'string' || !CAPABILITIES.includes(record.capability as NetGateCapability)) return null;
  if (!boundedText(record.target_host, 253) || canonicalHostKey(record.target_host) === null) return null;
  if (!Number.isSafeInteger(record.target_port) || record.target_port !== expected.targetPort) return null;
  if (!boundedText(record.purpose, 512) || !boundedText(record.component_id, 128)) return null;
  if (!nullableText(record.document_id, 128) || !nullableText(record.automation_id, 128)) return null;
  if (!isStringArray(record.destination_classes)) return null;
  if (record.capability_id !== null &&
    (typeof record.capability_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/u.test(record.capability_id))) return null;
  if (record.preview_only !== true || typeof record.resolution_required !== 'boolean') return null;

  const requestHostKey = canonicalHostKey(expected.targetHost);
  const responseHostKey = canonicalHostKey(record.target_host);
  if (requestHostKey === null || requestHostKey !== responseHostKey ||
    record.capability !== expected.capability || record.purpose !== expected.purpose ||
    record.component_id !== expected.componentId || record.document_id !== expected.documentId ||
    record.automation_id !== expected.automationId) return null;

  return {
    verdict: record.verdict as NetGateVerdict,
    capability: record.capability as NetGateCapability,
    target_host: record.target_host,
    target_port: record.target_port as number,
    purpose: record.purpose,
    component_id: record.component_id,
    document_id: record.document_id as string | null,
    automation_id: record.automation_id as string | null,
    destination_classes: record.destination_classes,
    capability_id: record.capability_id as string | null,
    preview_only: true,
    resolution_required: record.resolution_required,
  };
}
