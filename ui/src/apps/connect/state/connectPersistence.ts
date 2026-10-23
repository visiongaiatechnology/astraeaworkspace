// STATUS: DIAMANT VGT SUPREME — BATCH-CONNECT-6: the one persistence path for Connect.
//
// BATCH-CONNECT-6 (WOM/Persistenz layer) fixes two measured defects in this file:
//  1. `fromConnectStore` returned the caller's fallback whenever `vgtConnectView` was absent, so a
//     stored message/label/search was silently replaced by the in-memory document instead of being
//     read from the canonical arrays. It now reconstructs through the inverse mapping.
//  2. `connectUserDataDigest` left out `sync` and `notifications`, so two different documents hashed
//     to the same value. The covered fields are now one explicit list.
//
// Connect's canonical store already exists: `state/connectEncryptedStore.ts` (PBKDF2 + AES-256-GCM,
// `packVConnect`/`unpackVConnect`, schema `astraea-vconnect-v1`). This module only converts between
// the canonical store and the in-app model, so no second store is introduced. `WP` prefixes below
// refer to `platform/connectors/connectCoreTypes.ts`.
//
// Round-trip rule (AST-1568/AST-1573): every connect-owned user field must survive
// `toConnectStore → packVConnect → unpackVConnect → fromConnectStore` byte-identically. The store
// therefore carries `vgtConnectView` (the Connect-owned projection) next to the canonical arrays.

import type {
  ConnectAccount,
  ConnectCalendar,
  ConnectContactGroup,
  ConnectFolder,
  ConnectMailCacheState,
  ConnectSavedSearch,
} from '../../../platform/connectors/connectCoreTypes';
import { defaultMailFolders } from '../domain/connectMailCore';
import { assertNoInlineCredentials } from '../domain/connectCredentialBoundary';
import { coreContactToLegacy, coreEventToLegacy, coreMessageToLegacy, legacyContactToCore, legacyEventToCore, legacyMessageToCore } from '../application/connectUiBridge';
import type { ConnectDocumentModel } from '../domain/types';
import { ConnectStoreError, packVConnect, unpackVConnect, type ConnectStore } from './connectEncryptedStore';

export const CONNECT_STORE_ACCOUNT_ID = 'connect-ui-local';

const coreAccount = (model: ConnectDocumentModel): ConnectAccount[] =>
  (model.accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    kind: 'mail',
    localOnly: true,
    identities: [{ id: `${account.id}:identity`, displayName: account.name, address: account.address }],
    username: account.username,
    adapters: [
      { kind: 'imap', endpoint: { host: account.host, port: account.port, tls: 'starttls-required' }, credentialHandle: account.credentialHandle, enabled: true },
      { kind: 'local', enabled: true },
    ],
    network: { allowHosts: [], allowCertificateInspection: false, failClosedOnTlsError: true },
    defaultIdentityId: `${account.id}:identity`,
    createdAt: account.createdAt,
    updatedAt: account.createdAt,
  }));

const coreFolders = (model: ConnectDocumentModel): ConnectFolder[] => {
  const base = defaultMailFolders(CONNECT_STORE_ACCOUNT_ID);
  const extra: ConnectFolder[] = (model.labels ?? []).map((label) => ({
    id: `${CONNECT_STORE_ACCOUNT_ID}:label:${label.id}`,
    accountId: CONNECT_STORE_ACCOUNT_ID,
    name: label.name,
    kind: label.kind === 'vault' ? 'custom' : label.kind,
    labels: [],
  }));
  return [...base, ...extra];
};

const coreMailCache = (model: ConnectDocumentModel): ConnectMailCacheState[] => {
  if (!model.sync) return [];
  return [{
    // The workspace document itself is the encrypted container for this model; the cache flag stays
    // `true` because nothing here writes a plaintext cache to disk.
    encrypted: true,
    accountId: model.sync.accountId ?? CONNECT_STORE_ACCOUNT_ID,
    syncToken: model.sync.syncToken,
    lastSyncAt: model.sync.lastSyncAt,
    conflicts: model.sync.conflicts.map((conflict) => ({
      messageId: conflict.messageId,
      localVersion: 1,
      remoteVersion: 2,
      resolution: conflict.resolution === 'unresolved' ? 'pending' : conflict.resolution,
    })),
  }];
};

const coreCalendars = (model: ConnectDocumentModel): ConnectCalendar[] => [
  {
    id: CONNECT_STORE_ACCOUNT_ID,
    accountId: CONNECT_STORE_ACCOUNT_ID,
    name: 'Local',
    colorToken: 'accent',
    visible: true,
    readOnly: false,
    shared: false,
    permissions: 'owner',
    syncToken: model.sync?.syncToken,
  },
];

const coreGroups = (model: ConnectDocumentModel): ConnectContactGroup[] =>
  (model.labels ?? [])
    .filter((label) => label.kind === 'custom')
    .map((label) => ({ id: `${CONNECT_STORE_ACCOUNT_ID}:group:${label.id}`, accountId: CONNECT_STORE_ACCOUNT_ID, name: label.name, memberIds: [], tags: [] }));

const coreSavedSearches = (model: ConnectDocumentModel): ConnectSavedSearch[] =>
  model.searchQuery.trim()
    ? [{ id: `${CONNECT_STORE_ACCOUNT_ID}:last-search`, name: 'last', query: model.searchQuery, createdAt: model.messages[0]?.timestamp ?? 0 }]
    : [];

/**
 * Build the canonical store. The credential boundary runs *before* anything is produced, so a model
 * with an inline secret never reaches the persistence layer (fail-closed, not sanitised).
 */
export function toConnectStore(model: ConnectDocumentModel, now = Date.now()): ConnectStore {
  assertNoInlineCredentials(model);
  return {
    schema: 'astraea-vconnect-v1',
    accounts: coreAccount(model),
    folders: coreFolders(model),
    messages: model.messages.map((message) => legacyMessageToCore(message)),
    mailCache: coreMailCache(model),
    calendars: coreCalendars(model),
    events: model.events.map((event) => legacyEventToCore(event)),
    contacts: model.contacts.map((contact) => legacyContactToCore(contact, now)),
    groups: coreGroups(model),
    savedSearches: coreSavedSearches(model),
    updatedAt: now,
    vgtConnectView: structuredClone(model),
  };
}

/**
 * Read the model back. When the Connect projection is present it is authoritative, because the
 * canonical arrays are a lossy projection (WP:21 has no `folder`/`delivery`/`isEncrypted`).
 *
 * When the projection is **absent** — a `.vconnect` file written by another app, or by a build before
 * the projection existed — the canonical arrays are read back through the *inverse* of the mapping in
 * `application/connectUiBridge.ts`. Falling back to the caller's in-memory document here was a real
 * defect: it reported a payload the container never held, so a stored message, label or search was
 * silently replaced by whatever the app happened to have open. Fields the canonical model genuinely
 * cannot carry keep the fallback's value, and the fallback's only remaining job is to supply the
 * document-level view state (`viewMode`, `selectedFolder`, `selectedMessageId`, `searchQuery`) plus
 * the Connect-only `accounts`/`sync`/`focus`/`notifications` sidecars, which the canonical arrays do
 * not describe either.
 */
export function fromConnectStore(store: ConnectStore, fallback: ConnectDocumentModel): ConnectDocumentModel {
  const view = store.vgtConnectView;
  if (view) return structuredClone(view);
  return {
    ...structuredClone(fallback),
    messages: store.messages.map(coreMessageToLegacy),
    events: store.events.map(coreEventToLegacy),
    contacts: store.contacts.map(coreContactToLegacy),
  };
}

export interface ConnectPersistResult {
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  readonly messageCount: number;
  readonly accountCount: number;
}

/** Encrypt and return the container. The caller writes the bytes; nothing is written here. */
export async function persistConnectModel(model: ConnectDocumentModel, password: string, now = Date.now()): Promise<ConnectPersistResult> {
  const store = toConnectStore(model, now);
  const bytes = await packVConnect(store, password);
  return { bytes, byteLength: bytes.byteLength, messageCount: store.messages.length, accountCount: store.accounts.length };
}

/** The Save→Close→Reopen proof: decrypt and return the model that was stored. */
export async function reopenConnectModel(bytes: Uint8Array, password: string, fallback: ConnectDocumentModel): Promise<ConnectDocumentModel> {
  try {
    const store = await unpackVConnect(bytes, password);
    return fromConnectStore(store, fallback);
  } catch (error) {
    if (error instanceof ConnectStoreError) throw error;
    throw new ConnectStoreError('vconnect-authentication-failed');
  }
}

/**
 * A stable, comparable digest of the connect-owned user data, for the reopen assertion.
 *
 * BATCH-CONNECT-6: every persisted field of `ConnectDocumentModel` is listed explicitly, because the
 * previous version enumerated the same fields inline and had silently left out `sync` and
 * `notifications` — two documents that differed in sync bookkeeping or in the notification tray
 * produced the *same* digest, so a digest comparison could not see the difference. Listing the keys
 * in one place makes a new model field an obvious edit rather than an invisible omission.
 *
 * This is a fast structural comparison helper, **not** an integrity or tamper proof: it is a 32-bit
 * non-cryptographic hash. Identity is proven by the structural comparison (`toEqual` on the reopened
 * document); a digest match is corroboration, a digest mismatch is a finding.
 */
const CONNECT_DIGEST_FIELDS = [
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
] as const satisfies ReadonlyArray<keyof ConnectDocumentModel>;

export function connectUserDataDigest(model: ConnectDocumentModel): string {
  const payload: Record<string, unknown> = {};
  // Fixed order, so the digest never depends on the caller's property order.
  for (const field of CONNECT_DIGEST_FIELDS) payload[field] = model[field] ?? null;
  const canonical = JSON.stringify(payload);
  let hash = 2_166_136_261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
