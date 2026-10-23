import { describe, expect, it, vi } from 'vitest';
import { buildConnectMailAccount, ConnectSettingsError, loadConnectMailAccounts, saveConnectMailAccounts, type ConnectMailProfileInput } from '../connectSettingsCore';
import { exportPortableAccount } from '../../../platform/connectors/connectAccountCore';
import type { ShellStorageLike } from '../../platform/workspaceShellPlatform';
import type { ConnectAccount } from '../../../platform/connectors/connectCoreTypes';

class MemoryStorage implements ShellStorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const input: ConnectMailProfileInput = {
  accountName: 'Work mail',
  displayName: 'Astraea Operator',
  address: 'operator@example.com',
  username: 'operator-login',
  imapHost: 'imap.example.com',
  imapPort: 993,
  imapTls: 'tls',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpTls: 'starttls-required',
  credentialHandle: 'keyvault:/connect/5b04eefd-7cc2-4dcb-82cf-862e49f6a759',
};

const fixedIds = () => {
  const ids = ['4c25f9a0-b867-4ea8-a484-0d8dcda2d5b6', '79146cd1-37e7-4f22-9db2-68644a9262a6', '8c2f425a-a534-4a8e-a862-5dd7a4f11b50'];
  return () => ids.shift() ?? '22f12d0f-d287-47f3-9118-20b767d9df95';
};

const accountAt = (index = 0): ConnectAccount => buildConnectMailAccount(
  input,
  undefined,
  1_800_000_000_000,
  () => String(index),
);

const accountWithIdentityCount = (account: ConnectAccount, count: number): ConnectAccount => {
  const identities = Array.from({ length: count }, (_, identityIndex) => ({
    id: `identity-${identityIndex}`,
    displayName: `Identity ${identityIndex}`,
    address: `identity${identityIndex}@example.com`,
  }));
  return { ...account, identities, defaultIdentityId: identities[0]?.id ?? 'missing-identity' };
};

const accountsWithCount = (count: number): ConnectAccount[] => Array.from({ length: count }, (_, index) => accountAt(index));

const storageWithRaw = (raw: string): MemoryStorage => {
  const storage = new MemoryStorage();
  storage.setItem('astraea.connect.accounts.v1', raw);
  return storage;
};

const expectStoreError = (run: () => unknown, expectedCode: string): void => {
  try {
    run();
    throw new Error('expected ConnectSettingsError');
  } catch (error) {
    expect(error).toBeInstanceOf(ConnectSettingsError);
    expect((error as ConnectSettingsError).code).toBe(expectedCode);
  }
};

const accountSetAtEncodedBytes = (targetBytes: number): ConnectAccount[] => {
  const accounts = Array.from({ length: 13 }, (_, accountIndex) => {
    const account = accountAt(accountIndex);
    const identities = Array.from({ length: 64 }, (_, identityIndex) => ({
      id: `identity-${accountIndex}-${identityIndex}`,
      displayName: 'x',
      address: `person${identityIndex}@example.com`,
    }));
    return {
      ...account,
      name: `Account ${accountIndex}`,
      identities,
      defaultIdentityId: identities[0].id,
    };
  });
  let remaining = targetBytes - JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts }).length;
  if (remaining < 0) throw new Error('byte target is below valid profile-set baseline');
  for (const account of accounts) {
    for (const identity of account.identities) {
      const added = Math.min(255, remaining);
      identity.displayName = 'x'.repeat(1 + added);
      remaining -= added;
    }
  }
  if (remaining !== 0) throw new Error('byte target exceeds bounded identity text capacity');
  return accounts;
};

describe('Astraea Connect mail settings core', () => {
  it('builds a TLS-only IMAP/SMTP profile with disabled adapters pending transport authorization', () => {
    const account = buildConnectMailAccount(input, undefined, 1_800_000_000_000, fixedIds());
    expect(account.kind).toBe('mail');
    expect(account.username).toBe('operator-login');
    expect(account.adapters.map(({ kind, enabled }) => ({ kind, enabled }))).toEqual([
      { kind: 'imap', enabled: false },
      { kind: 'smtp', enabled: false },
    ]);
    expect(account.adapters.every((adapter) => adapter.credentialHandle === input.credentialHandle)).toBe(true);
    expect(account.network.allowHosts).toEqual(['imap.example.com', 'smtp.example.com']);
  });

  it('rejects invalid hosts, ports, email addresses, and plaintext transport', () => {
    expect(() => buildConnectMailAccount({ ...input, smtpHost: 'smtp.example.com\r\nBcc: attacker@example.test' }, undefined, 1_800_000_000_000, fixedIds())).toThrow();
    expect(() => buildConnectMailAccount({ ...input, imapPort: 65_536 }, undefined, 1_800_000_000_000, fixedIds())).toThrow();
    expect(() => buildConnectMailAccount({ ...input, address: 'invalid-address' }, undefined, 1_800_000_000_000, fixedIds())).toThrow();
    expect(() => buildConnectMailAccount({ ...input, smtpTls: 'local-only' }, undefined, 1_800_000_000_000, fixedIds())).toThrow();
  });

  it('persists a validated profile and retains its username and credential reference', () => {
    const storage = new MemoryStorage();
    const account = buildConnectMailAccount(input, undefined, 1_800_000_000_000, fixedIds());
    expect(saveConnectMailAccounts(storage, [account])).toEqual([account]);
    expect(loadConnectMailAccounts(storage)).toEqual([account]);
    expect(storage.getItem('astraea.connect.accounts.v1')).not.toContain('"password"');
    const portable = exportPortableAccount(account);
    expect(JSON.stringify(portable)).not.toContain('credentialHandle');
    expect(portable.username).toBe('operator-login');
  });

  it('rejects malformed or over-counted profile stores without overwriting them', () => {
    const storage = new MemoryStorage();
    storage.setItem('astraea.connect.accounts.v1', '{"schema":"unexpected","accounts":[]}');
    expect(() => loadConnectMailAccounts(storage)).toThrow();
    expect(storage.getItem('astraea.connect.accounts.v1')).toBe('{"schema":"unexpected","accounts":[]}');
  });

  it('rejects unexpected persisted fields so plaintext credentials cannot cross the profile boundary', () => {
    const storage = new MemoryStorage();
    const account = buildConnectMailAccount(input, undefined, 1_800_000_000_000, fixedIds());
    const withUnexpectedCredential = { ...account, password: 'must-never-persist' };
    storage.setItem('astraea.connect.accounts.v1', JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [withUnexpectedCredential] }));
    expect(() => loadConnectMailAccounts(storage)).toThrow();
  });

  it('rejects duplicate identity IDs and sparse adapter arrays at the persistence boundary', () => {
    const account = buildConnectMailAccount(input, undefined, 1_800_000_000_000, fixedIds());
    const duplicateIdentity = {
      ...account,
      identities: [account.identities[0], { ...account.identities[0], address: 'second@example.com' }],
    };
    const identityStorage = new MemoryStorage();
    expectStoreError(() => saveConnectMailAccounts(identityStorage, [duplicateIdentity]), 'profile-store-account-invalid');

    const sparseAdapters = { ...account, adapters: [account.adapters[0], , account.adapters[1]] as unknown as ConnectAccount['adapters'] };
    const sparseStorage = new MemoryStorage();
    expectStoreError(() => saveConnectMailAccounts(sparseStorage, [sparseAdapters]), 'profile-store-account-invalid');
    expect(sparseStorage.getItem('astraea.connect.accounts.v1')).toBeNull();
  });

  it('runs 4,096 deterministic mutations through persisted-load and save boundaries', () => {
    const account = accountAt(10);
    const duplicateIdentity = { ...account, identities: [account.identities[0], { ...account.identities[0], address: 'other@example.com' }] };
    const oversizedAddress = { ...account, identities: [{ ...account.identities[0], address: `${'a'.repeat(309)}@example.com` }] };
    const withPassword = { ...account, password: 'must-not-cross-profile-boundary' };
    const sparseAdapters = { ...account, adapters: [account.adapters[0], , account.adapters[1]] as unknown as ConnectAccount['adapters'] };
    const maxHandleAccount = {
      ...account,
      adapters: account.adapters.map((adapter) => ({ ...adapter, credentialHandle: `keyvault:/${'a'.repeat(512)}` })),
    };
    const loadMutations: Array<{ raw: string; accept: boolean; code?: string }> = [
      { raw: JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [account] }), accept: true },
      { raw: `${JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [account] })}  `, accept: true },
      { raw: '{not-json', accept: false, code: 'profile-store-invalid' },
      { raw: JSON.stringify({ schema: 'unexpected', accounts: [] }), accept: false, code: 'profile-store-schema-invalid' },
      { raw: JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [account, account] }), accept: false, code: 'profile-store-account-invalid' },
      { raw: JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [duplicateIdentity] }), accept: false, code: 'profile-store-account-invalid' },
      { raw: JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [withPassword] }), accept: false, code: 'profile-store-account-invalid' },
      { raw: JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [oversizedAddress] }), accept: false, code: 'profile-store-account-invalid' },
    ];
    const saveMutations: Array<{ accounts: readonly ConnectAccount[]; accept: boolean; code?: string }> = [
      { accounts: [account], accept: true },
      { accounts: accountsWithCount(64), accept: true },
      { accounts: accountsWithCount(65), accept: false, code: 'profile-store-count-limit' },
      { accounts: [accountWithIdentityCount(account, 64)], accept: true },
      { accounts: [accountWithIdentityCount(account, 65)], accept: false, code: 'profile-store-account-invalid' },
      { accounts: [duplicateIdentity], accept: false, code: 'profile-store-account-invalid' },
      { accounts: [sparseAdapters], accept: false, code: 'profile-store-account-invalid' },
      { accounts: [maxHandleAccount], accept: true },
    ];

    let loadAccepted = 0;
    let loadRejected = 0;
    let saveAccepted = 0;
    let saveRejected = 0;
    for (let mutationIndex = 0; mutationIndex < 4096; mutationIndex += 1) {
      const lane = mutationIndex % 16;
      if (lane < 8) {
        const mutation = loadMutations[lane];
        const run = () => loadConnectMailAccounts(storageWithRaw(mutation.raw));
        if (mutation.accept) {
          expect(run()).toHaveLength(1);
          loadAccepted += 1;
        } else {
          expectStoreError(run, mutation.code ?? 'profile-store-invalid');
          loadRejected += 1;
        }
      } else {
        const mutation = saveMutations[lane - 8];
        const run = () => saveConnectMailAccounts(new MemoryStorage(), mutation.accounts);
        if (mutation.accept) {
          expect(run().length).toBe(mutation.accounts.length);
          saveAccepted += 1;
        } else {
          expectStoreError(run, mutation.code ?? 'profile-store-account-invalid');
          saveRejected += 1;
        }
      }
    }
    expect({ loadAccepted, loadRejected, saveAccepted, saveRejected }).toEqual({
      loadAccepted: 512,
      loadRejected: 1536,
      saveAccepted: 1024,
      saveRejected: 1024,
    });
  });

  it('enforces exact UTF-8 byte, account, identity, and credential-handle boundaries', () => {
    const maximumBytes = 256 * 1024;
    const unicodeAccount = buildConnectMailAccount({ ...input, displayName: 'Astraea 🚀' }, undefined, 1_800_000_000_000, fixedIds());
    const base = JSON.stringify({ schema: 'astraea-connect-settings-v1', accounts: [unicodeAccount] });
    const padding = maximumBytes - new TextEncoder().encode(base).byteLength;
    expect(padding).toBeGreaterThan(0);
    const exactRaw = `${base}${' '.repeat(padding)}`;
    expect(new TextEncoder().encode(exactRaw).byteLength).toBe(maximumBytes);
    expect(loadConnectMailAccounts(storageWithRaw(exactRaw))).toHaveLength(1);

    const overLimitStorage = storageWithRaw(`${exactRaw} `);
    const encodeSpy = vi.spyOn(TextEncoder.prototype, 'encode');
    expectStoreError(() => loadConnectMailAccounts(overLimitStorage), 'profile-store-size-limit');
    expect(encodeSpy).not.toHaveBeenCalled();
    encodeSpy.mockRestore();

    const exactSaveStorage = new MemoryStorage();
    saveConnectMailAccounts(exactSaveStorage, accountSetAtEncodedBytes(maximumBytes));
    expect(new TextEncoder().encode(exactSaveStorage.getItem('astraea.connect.accounts.v1') ?? '').byteLength).toBe(maximumBytes);
    expect(loadConnectMailAccounts(exactSaveStorage)).toHaveLength(13);
    expectStoreError(() => saveConnectMailAccounts(new MemoryStorage(), accountSetAtEncodedBytes(maximumBytes + 1)), 'profile-store-size-limit');

    const maxAccountStorage = new MemoryStorage();
    expect(saveConnectMailAccounts(maxAccountStorage, accountsWithCount(64))).toHaveLength(64);
    expectStoreError(() => saveConnectMailAccounts(new MemoryStorage(), accountsWithCount(65)), 'profile-store-count-limit');
    const identityStorage = new MemoryStorage();
    expect(saveConnectMailAccounts(identityStorage, [accountWithIdentityCount(accountAt(99), 64)])[0].identities).toHaveLength(64);
    expectStoreError(() => saveConnectMailAccounts(new MemoryStorage(), [accountWithIdentityCount(accountAt(99), 65)]), 'profile-store-account-invalid');

    const validHandle = `keyvault:/${'a'.repeat(512)}`;
    const validCredential = { ...accountAt(100), adapters: accountAt(100).adapters.map((adapter) => ({ ...adapter, credentialHandle: validHandle })) };
    expect(saveConnectMailAccounts(new MemoryStorage(), [validCredential])[0].adapters[0].credentialHandle).toBe(validHandle);
    const overlongHandle = `keyvault:/${'a'.repeat(513)}`;
    const invalidCredential = { ...validCredential, adapters: validCredential.adapters.map((adapter) => ({ ...adapter, credentialHandle: overlongHandle })) };
    expectStoreError(() => saveConnectMailAccounts(new MemoryStorage(), [invalidCredential]), 'profile-store-account-invalid');
  });
});
