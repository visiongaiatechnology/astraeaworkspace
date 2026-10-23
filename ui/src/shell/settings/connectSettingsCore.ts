// STATUS: GOLD — validated, non-secret Astraea Connect mail-profile persistence.
import { parseHostileJson } from '../../shared/security/hostileJson';
import type { ShellStorageLike } from '../platform/workspaceShellPlatform';
import { validateConnectAccount, ConnectAccountError } from '../../platform/connectors/connectAccountCore';
import type { ConnectAccount, ConnectTlsMode } from '../../platform/connectors/connectCoreTypes';

const STORAGE_KEY = 'astraea.connect.accounts.v1';
const MAX_ACCOUNTS = 64;
const MAX_STORAGE_BYTES = 256 * 1024;
const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SECURE_TLS_MODES = new Set<ConnectTlsMode>(['tls', 'starttls-required']);

export class ConnectSettingsError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectSettingsError';
  }
}

export interface ConnectMailProfileInput {
  accountName: string;
  displayName: string;
  address: string;
  username: string;
  imapHost: string;
  imapPort: number;
  imapTls: ConnectTlsMode;
  smtpHost: string;
  smtpPort: number;
  smtpTls: ConnectTlsMode;
  credentialHandle?: string;
}

function boundedText(value: string, max: number): string {
  if (typeof value !== 'string') throw new ConnectSettingsError('profile-text-invalid');
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ConnectSettingsError('profile-text-invalid');
  }
  return normalized;
}

function validPort(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) throw new ConnectSettingsError('profile-port-invalid');
  return value;
}

function validHost(value: string): string {
  const host = boundedText(value, 253).toLowerCase();
  if (!HOST.test(host)) throw new ConnectSettingsError('profile-host-invalid');
  return host;
}

function newId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new ConnectSettingsError('secure-randomness-unavailable');
  return globalThis.crypto.randomUUID();
}

export function buildConnectMailAccount(
  input: ConnectMailProfileInput,
  previous?: ConnectAccount,
  now = Date.now(),
  idFactory: () => string = newId,
): ConnectAccount {
  const accountName = boundedText(input.accountName, 128);
  const displayName = boundedText(input.displayName, 128);
  const address = boundedText(input.address, 320).toLowerCase();
  const username = boundedText(input.username, 320);
  if (!ADDRESS.test(address)) throw new ConnectSettingsError('profile-email-invalid');

  const imapHost = validHost(input.imapHost);
  const smtpHost = validHost(input.smtpHost);
  const imapPort = validPort(input.imapPort);
  const smtpPort = validPort(input.smtpPort);
  if (!SECURE_TLS_MODES.has(input.imapTls) || !SECURE_TLS_MODES.has(input.smtpTls)) {
    throw new ConnectSettingsError('profile-tls-invalid');
  }
  if (!Number.isSafeInteger(now) || now < 1) throw new ConnectSettingsError('profile-timestamp-invalid');
  const id = previous?.id ?? `connect-${idFactory()}`;
  const identityId = previous?.identities[0]?.id ?? `identity-${idFactory()}`;
  const credentialHandle = input.credentialHandle;
  const allowHosts = Array.from(new Set([imapHost, smtpHost])).slice(0, 8);

  const account: ConnectAccount = {
    id,
    name: accountName,
    kind: 'mail',
    localOnly: false,
    identities: [{ id: identityId, displayName, address }],
    username,
    adapters: [
      {
        kind: 'imap',
        endpoint: { host: imapHost, port: imapPort, tls: input.imapTls },
        ...(credentialHandle ? { credentialHandle } : {}),
        enabled: false,
      },
      {
        kind: 'smtp',
        endpoint: { host: smtpHost, port: smtpPort, tls: input.smtpTls },
        ...(credentialHandle ? { credentialHandle } : {}),
        enabled: false,
      },
    ],
    network: {
      capabilityId: previous?.network.capabilityId ?? `connect-mail-${idFactory()}`,
      allowHosts,
      allowCertificateInspection: false,
      failClosedOnTlsError: true,
    },
    defaultIdentityId: identityId,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  try {
    return validateConnectAccount(account);
  } catch (error) {
    if (error instanceof ConnectAccountError) throw new ConnectSettingsError(error.code);
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function boundedUtf8ByteLength(value: string, maxBytes: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x7f) bytes += 1;
    else if (unit <= 0x7ff) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes > maxBytes) return maxBytes + 1;
  }
  return bytes;
}

function isConnectAccountCandidate(value: unknown): value is ConnectAccount {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || value.kind !== 'mail'
    || value.localOnly !== false || !Array.isArray(value.identities) || !Array.isArray(value.adapters)
    || typeof value.defaultIdentityId !== 'string' || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt)
    || (value.username !== undefined && typeof value.username !== 'string') || !isRecord(value.network)
    || !hasOnlyKeys(value, ['id', 'name', 'kind', 'localOnly', 'identities', 'username', 'adapters', 'network', 'defaultIdentityId', 'createdAt', 'updatedAt'])) return false;
  const validIdentity = (identity: unknown) => isRecord(identity)
    && typeof identity.id === 'string' && typeof identity.displayName === 'string' && typeof identity.address === 'string'
    && identity.address.length <= 320
    && hasOnlyKeys(identity, ['id', 'displayName', 'address']);
  const validAdapter = (adapter: unknown) => {
    if (!isRecord(adapter) || (adapter.kind !== 'imap' && adapter.kind !== 'smtp') || typeof adapter.enabled !== 'boolean'
      || !hasOnlyKeys(adapter, ['kind', 'endpoint', 'credentialHandle', 'enabled'])) return false;
    if (adapter.credentialHandle !== undefined && typeof adapter.credentialHandle !== 'string') return false;
    if (!isRecord(adapter.endpoint) || typeof adapter.endpoint.host !== 'string' || !Number.isSafeInteger(adapter.endpoint.port)
      || (adapter.endpoint.tls !== 'tls' && adapter.endpoint.tls !== 'starttls-required')
      || !hasOnlyKeys(adapter.endpoint, ['host', 'port', 'tls'])) return false;
    return true;
  };
  const network = value.network;
  return value.identities.length >= 1 && value.identities.length <= 64 && isDenseArray(value.identities) && value.identities.every(validIdentity)
    && value.adapters.length <= 8 && isDenseArray(value.adapters) && value.adapters.every(validAdapter)
    && (network.capabilityId === undefined || typeof network.capabilityId === 'string')
    && Array.isArray(network.allowHosts) && isDenseArray(network.allowHosts) && network.allowHosts.every((host) => typeof host === 'string')
    && typeof network.allowCertificateInspection === 'boolean' && network.failClosedOnTlsError === true
    && hasOnlyKeys(network, ['capabilityId', 'allowHosts', 'allowCertificateInspection', 'failClosedOnTlsError']);
}

function validateStoredAccounts(value: unknown): ConnectAccount[] {
  if (!isRecord(value) || value.schema !== 'astraea-connect-settings-v1' || !Array.isArray(value.accounts)) {
    throw new ConnectSettingsError('profile-store-schema-invalid');
  }
  if (value.accounts.length > MAX_ACCOUNTS) throw new ConnectSettingsError('profile-store-count-limit');
  const ids = new Set<string>();
  return value.accounts.map((candidate) => {
    if (!isConnectAccountCandidate(candidate)) throw new ConnectSettingsError('profile-store-account-invalid');
    let account: ConnectAccount;
    try {
      account = validateConnectAccount(candidate);
    } catch {
      throw new ConnectSettingsError('profile-store-account-invalid');
    }
    if (account.kind !== 'mail' || ids.has(account.id)) throw new ConnectSettingsError('profile-store-account-invalid');
    const identityIds = new Set<string>();
    for (const identity of account.identities) {
      if (identityIds.has(identity.id)) throw new ConnectSettingsError('profile-store-account-invalid');
      identityIds.add(identity.id);
    }
    ids.add(account.id);
    return account;
  });
}

export function loadConnectMailAccounts(storage: ShellStorageLike | null): ConnectAccount[] {
  let raw: string | null;
  try { raw = storage?.getItem(STORAGE_KEY) ?? null; }
  catch { throw new ConnectSettingsError('profile-store-read-failed'); }
  if (raw === null) return [];
  if (typeof raw !== 'string') throw new ConnectSettingsError('profile-store-invalid');
  if (boundedUtf8ByteLength(raw, MAX_STORAGE_BYTES) > MAX_STORAGE_BYTES) throw new ConnectSettingsError('profile-store-size-limit');
  try {
    const parsed = parseHostileJson(raw, { maxBytes: MAX_STORAGE_BYTES, maxDepth: 20, maxNodes: 20_000, maxStringChars: 2048, maxObjectKeys: 64, maxArrayItems: MAX_ACCOUNTS * 16 });
    return validateStoredAccounts(parsed);
  } catch (error) {
    if (error instanceof ConnectSettingsError) throw error;
    throw new ConnectSettingsError('profile-store-invalid');
  }
}

export function saveConnectMailAccounts(storage: ShellStorageLike | null, accounts: readonly ConnectAccount[]): ConnectAccount[] {
  if (!storage) throw new ConnectSettingsError('profile-store-unavailable');
  if (!Array.isArray(accounts)) throw new ConnectSettingsError('profile-store-account-invalid');
  const validated = validateStoredAccounts({ schema: 'astraea-connect-settings-v1', accounts: [...accounts] });
  const encoded = JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: validated });
  if (new TextEncoder().encode(encoded).byteLength > MAX_STORAGE_BYTES) throw new ConnectSettingsError('profile-store-size-limit');
  try { storage.setItem(STORAGE_KEY, encoded); }
  catch { throw new ConnectSettingsError('profile-store-write-failed'); }
  return validated;
}

export function connectAccountCredentialHandle(account: ConnectAccount | null | undefined): string | undefined {
  return account?.adapters.find((adapter) => adapter.kind === 'smtp')?.credentialHandle
    ?? account?.adapters.find((adapter) => adapter.kind === 'imap')?.credentialHandle;
}

export function connectAccountEndpoint(account: ConnectAccount, kind: 'imap' | 'smtp') {
  return account.adapters.find((adapter) => adapter.kind === kind)?.endpoint;
}
