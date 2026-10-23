// STATUS: DIAMANT VGT SUPREME
// Paket 34 — „Vault Lock während Live-Ansicht".
//
// Akzeptanz: „Beim Sperren werden zuvor sichtbare geschützte Assets ausgeblendet."
//
// Der Zeuge ist ein **Vorher/Nachher-Vergleich am echten Bauteil**, nicht eine Behauptung über Zustände:
// dieselbe Datei, derselbe Aufruf, nur `locked` unterscheidet sich. Gerendert wird headless über
// `renderToStaticMarkup` (vitest 5.0.3, Node, kein jsdom), wie in `src/testing/cross-app/chartAccessibility.test.ts`.
//
// Benutzte, vorhandene Vokabel:
//   • `locked`-Vertrag       — shared/vault/files/VaultFileEntry.tsx:51, Bedingung in :89
//   • `data-vault-locked`    — shared/vault/files/VaultFilesTab.tsx:205 (gesperrter Zweig)
//   • `deriveVaultLockState` / `vaultLockRecord` — shared/vault/security/vaultSessionLock.ts:138 / :183
//   • `assertVaultSessionRevoked` — shared/vault/security/vaultSessionLock.ts:85 (benannte Ablehnung)
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VaultFile, VaultFolder, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { VaultFileEntry } from '../../../shared/vault/files/VaultFileEntry';
import { VaultFilesTab } from '../../../shared/vault/files/VaultFilesTab';
import { assertVaultSessionMaterialHidden, assertVaultSessionRevoked, deriveVaultLockState, vaultLockRecord, vaultSessionViewOf } from '../../../shared/vault/security/vaultSessionLock';
import { persistVaultLockRecord, readVaultLockRecord } from '../../../shared/vault/persistence/vaultPersistenceEngine';

/** Der geschützte Bestand: entschlüsselte Nutzlast **und** Metadaten, die der Tresor nicht mehr herausgeben darf. */
const protectedAsset: VaultFile = {
  id: 'asset-payroll',
  name: 'Payroll Q3.png',
  kind: 'Writer',
  sizeBytes: 24_576,
  encryptedHash: 'sha256:aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
  contentDigest: 'sha256:9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff',
  lastModified: Date.UTC(2026, 0, 15),
  mimeType: 'image/png',
  payloadDataUrl: 'data:image/png;base64,iVBORw0KGgoENTSCHEIDETE NUTZLAST',
  integrityState: 'verified',
  status: 'available',
  owner: 'finance-owner',
  classification: 'Confidential',
  securityLabel: 'safe',
  tags: ['confidential', 'payroll'],
};

const listProps = {
  files: [protectedAsset],
  folders: [] as VaultFolder[],
  documents: [] as WorkspaceDocument[],
  onAddLocalFiles: async () => {},
  onAddWorkspaceDocument: async () => {},
  onUpdateFileSystem: () => {},
  onDeleteFile: () => {},
  onVerifyFile: async () => ({ state: 'verified' as const, message: 'verified' }),
  onOpenWith: async () => {},
};

const entryProps = {
  file: protectedAsset,
  viewMode: 'grid' as const,
  selected: false,
  isVerifying: false,
  onToggleSelected: () => {},
  onRename: () => {},
  onVerify: () => {},
  onPreview: () => {},
  onInspect: () => {},
  onOpenTarget: () => {},
  onDelete: () => {},
  onToggleFavorite: () => {},
  onTogglePinned: () => {},
  onEditTags: () => {},
  onEditProperties: () => {},
  onSetAssociation: () => {},
  onDragStart: () => {},
};

describe('Paket 34 — Vault Lock während Live-Ansicht', () => {
  it('VORHER: das entschlüsselte Vorschaubild steht sichtbar im DOM', () => {
    const unlocked = renderToStaticMarkup(createElement(VaultFileEntry, { ...entryProps, locked: false }));

    // Der Beweis, dass hier wirklich entschlüsselte Nutzlast steht — dieselbe Zeichenkette aus der Datei.
    expect(unlocked).toContain(protectedAsset.payloadDataUrl);
    expect(unlocked).toContain('<img src="data:image/png;base64,');
  });

  it('NACHHER: dieselbe Datei mit `locked` gibt die Nutzlast nicht mehr heraus', () => {
    const locked = renderToStaticMarkup(createElement(VaultFileEntry, { ...entryProps, locked: true }));

    expect(locked).not.toContain(protectedAsset.payloadDataUrl);
    expect(locked).not.toContain('<img src="data:image/png;base64,');
  });

  it('VORHER: die Dateiliste zeigt Name, Owner, Klassifikation und Digest', () => {
    const unlocked = renderToStaticMarkup(createElement(VaultFilesTab, { ...listProps, locked: false }));

    expect(unlocked).toContain('data-vault-locked="false"');
    for (const secret of [protectedAsset.name, 'finance-owner', 'Confidential', 'confidential']) {
      expect(unlocked, secret).toContain(secret);
    }
  });

  it('NACHHER: die gesperrte Liste nennt weder Name, Owner, Tag noch Digest', () => {
    const locked = renderToStaticMarkup(createElement(VaultFilesTab, { ...listProps, locked: true }));

    expect(locked).toContain('data-vault-locked="true"');
    for (const secret of [protectedAsset.name, 'finance-owner', 'Confidential', 'confidential', protectedAsset.contentDigest!.slice(0, 12)]) {
      expect(locked, secret).not.toContain(secret);
    }
    // Und die Nutzlast ebenso wenig.
    expect(locked).not.toContain(protectedAsset.payloadDataUrl);
  });

  it('die Sitzungssperre wird BENANNT durchgesetzt, nicht still', () => {
    // Was nach dem Sperren noch sichtbar wäre, wird namentlich gemeldet statt verschwiegen.
    const leaky = vaultSessionViewOf({ preview: true, fileList: true });
    expect(() => assertVaultSessionRevoked(leaky)).toThrow(/^vault_session_not_revoked:preview,fileList$/u);
    expect(() => assertVaultSessionMaterialHidden('inlineThumbnails', true)).toThrow(/^vault_session_not_revoked:inlineThumbnails$/u);
  });

  it('ein gesperrter Tresor startet gesperrt — der Sperrvermerk überlebt den Weg durchs Dokument', () => {
    const document = { id: 'vault-doc', kind: 'Vault', version: 1, modified_at: 0, objects: {} } as unknown as WorkspaceDocument;
    const lockedDocument = persistVaultLockRecord(document, vaultLockRecord(true, 1_700_000_000_000), 1_700_000_000_000);
    const record = readVaultLockRecord(lockedDocument);

    expect(record.lockedAt).toBe(1_700_000_000_000);
    const state = deriveVaultLockState({ lockedAt: record.lockedAt, lastActivityAt: record.lastActivityAt, autoLockMinutes: 15, now: 1_700_000_001_000 });
    expect(state.locked).toBe(true);
    expect(state.reason).toBe('explicit');
  });

  it('Gegenprobe: ohne Sperrvermerk bleibt derselbe Aufruf entsperrt', () => {
    const document = { id: 'vault-doc', kind: 'Vault', version: 1, modified_at: 0, objects: {} } as unknown as WorkspaceDocument;
    const unlockedDocument = persistVaultLockRecord(document, vaultLockRecord(false, 1_700_000_000_000), 1_700_000_000_000);
    const record = readVaultLockRecord(unlockedDocument);

    expect(record.lockedAt).toBeNull();
    const state = deriveVaultLockState({ lockedAt: record.lockedAt, lastActivityAt: record.lastActivityAt, autoLockMinutes: 0, now: 1_700_000_001_000 });
    expect(state.locked).toBe(false);
    expect(state.reason).toBe('never_locked');
  });
});
