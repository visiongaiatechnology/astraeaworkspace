// STATUS: PLATIN — BATCH-CONNECT-2: credentials live in the KeyVault, never in the workspace document.
//
// Requirement (AST-1571…AST-1575): "E-Mail-Passwort/Token geschützt hinterlegen, nicht im
// Workspace-Dokument." The canonical object model already has the right shape
// (`platform/connectors/connectCoreTypes.ts:15 ConnectAccount` with `adapters[].credentialHandle` and
// `connectAccountCore.ts:8` enforcing `keyvault:/…`). What was missing is the *sidecar* that proves a
// workspace document, the connect model and the .vconnect store really contain no inline secret.
//
// This module is that sidecar. It is pure and runs before anything is persisted; a rejected document
// must not be written at all (fail-closed), not sanitised afterwards.

import type { ConnectAccountSetting, ConnectDocumentModel } from './types';

export class ConnectCredentialError extends Error {
  constructor(
    public readonly code: string,
    public readonly path: string,
  ) {
    super(`${code}@${path}`);
    this.name = 'ConnectCredentialError';
  }
}

/** Only KeyVault references may back a credential. Mirrors `connectAccountCore.ts:4`. */
export const CONNECT_KEYVAULT_HANDLE = /^keyvault:\/[A-Za-z0-9._~/-]{1,512}$/;

/** Field names that must never carry a secret value in a Connect document. */
const SECRET_FIELD_NAMES = new Set([
  'password',
  'passwd',
  'passphrase',
  'secret',
  'clientsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'auth',
  'authorization',
  'bearer',
  'credential',
  'credentials',
  'credentialhandle',
  'oauthcode',
  'sessionkey',
]);

/** Value shapes that are credentials wherever they appear. Kept narrow to avoid false positives. */
const SECRET_VALUE_PATTERNS: ReadonlyArray<{ readonly code: string; readonly pattern: RegExp }> = [
  { code: 'inline-bearer-token', pattern: /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { code: 'inline-private-key-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: 'inline-oauth-token', pattern: /\b(?:ya29\.|ghp_|gho_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/ },
  { code: 'inline-jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { code: 'inline-assigned-password', pattern: /\b(?:password|passwd|passphrase|kennwort|passwort|token|secret)\s*[:=]\s*\S{4,}/i },
  { code: 'inline-url-userinfo', pattern: /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]{3,}@/i },
];

const MAX_DEPTH = 64;

function checkString(value: string, path: string): void {
  for (const { code, pattern } of SECRET_VALUE_PATTERNS) {
    if (pattern.test(value)) throw new ConnectCredentialError(code, path);
  }
}

function walk(value: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) throw new ConnectCredentialError('credential-scan-depth', path);
  if (typeof value === 'string') {
    checkString(value, path);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z0-9_]/gi, '').toLowerCase();
    const isSecretField = SECRET_FIELD_NAMES.has(normalizedKey);
    if (isSecretField && typeof entry === 'string' && entry.trim().length > 0) {
      // A keyvault handle is the *reference*, not the secret, and is the only allowed value.
      if (!CONNECT_KEYVAULT_HANDLE.test(entry.trim())) {
        // Report the most specific reason: a value shape (bearer token, JWT, private key) is more
        // actionable than the generic "secret field" verdict.
        const shape = SECRET_VALUE_PATTERNS.find(({ pattern }) => pattern.test(entry));
        throw new ConnectCredentialError(shape ? shape.code : 'inline-secret-field', `${path}.${key}`);
      }
    }
    walk(entry, `${path}.${key}`, depth + 1);
  }
}

/**
 * Throw when a value carries an inline credential. The caller must not persist anything the check
 * rejects — this is fail-closed by construction, because it returns `true` or throws.
 */
export function assertNoInlineCredentials(value: unknown, root = 'connectData'): true {
  walk(value, root, 0);
  return true;
}

export interface ConnectCredentialWriteRequest {
  readonly accountId: string;
  readonly protocol: 'imap' | 'smtp' | 'caldav' | 'carddav';
  /** The secret the user typed. It is handed to the vault writer and must not be returned. */
  readonly secret: string;
  /** Whether the vault reported a successful store. */
  readonly stored: boolean;
  /** Handle the vault returned; required whenever `stored` is true. */
  readonly handle?: string;
}

export interface ConnectCredentialWriteResult {
  readonly credentialHandle: string;
  readonly protocol: ConnectCredentialWriteRequest['protocol'];
  /** Never true without a vault-confirmed handle. */
  readonly persistedInVault: boolean;
  /** The secret is deliberately not part of the result. */
  readonly secretReturned: false;
}

/**
 * Build the only credential shape that may enter the document. Without a vault-confirmed handle the
 * call fails — there is no code path that stores a password in the workspace document.
 */
export function toCredentialReference(request: ConnectCredentialWriteRequest): ConnectCredentialWriteResult {
  if (!request.stored) throw new ConnectCredentialError('vault-store-failed', 'credentialHandle');
  if (request.secret.trim().length === 0) throw new ConnectCredentialError('vault-secret-empty', 'secret');
  // The secret must not be used as, or smuggled into, the handle.
  if (request.handle && request.handle.includes(request.secret)) {
    throw new ConnectCredentialError('vault-handle-echoes-secret', 'credentialHandle');
  }
  if (!request.handle || !CONNECT_KEYVAULT_HANDLE.test(request.handle)) {
    throw new ConnectCredentialError('vault-handle-invalid', 'credentialHandle');
  }
  return { credentialHandle: request.handle, protocol: request.protocol, persistedInVault: true, secretReturned: false };
}

export interface ConnectCredentialAudit {
  readonly ok: boolean;
  /** One bounded code per rejected location. */
  readonly violations: Array<{ code: string; path: string }>;
  /** Accounts whose credential is a KeyVault reference and nothing else. */
  readonly keyVaultAccounts: string[];
}

/**
 * Audit a whole Connect model before it is written. Returns a report instead of throwing so a test
 * can assert on every violation, while `assertNoInlineCredentials` stays the fail-closed gate.
 */
export function auditConnectCredentials(model: ConnectDocumentModel): ConnectCredentialAudit {
  const violations: Array<{ code: string; path: string }> = [];
  const keyVaultAccounts: string[] = [];
  for (const [index, account] of (model.accounts ?? []).entries()) {
    const handle = account.credentialHandle ?? '';
    if (!CONNECT_KEYVAULT_HANDLE.test(handle)) {
      violations.push({ code: 'credential-not-in-keyvault', path: `accounts[${index}].credentialHandle` });
    } else {
      keyVaultAccounts.push(account.id);
    }
  }
  try {
    assertNoInlineCredentials(model);
  } catch (error) {
    if (error instanceof ConnectCredentialError) violations.push({ code: error.code, path: error.path });
    else throw error;
  }
  return { ok: violations.length === 0, violations, keyVaultAccounts };
}

/** The only account shape the UI may hand to the persistence layer. */
export function sealAccountWithCredentialReference(
  draft: Omit<ConnectAccountSetting, 'credentialHandle'>,
  credential: ConnectCredentialWriteResult,
): ConnectAccountSetting {
  const account: ConnectAccountSetting = { ...draft, credentialHandle: credential.credentialHandle };
  // The sealed account must survive the boundary check; this is the counter-check for the setter.
  assertNoInlineCredentials({ accounts: [account] });
  return account;
}
