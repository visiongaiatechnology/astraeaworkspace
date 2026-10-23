// @vitest-environment happy-dom
// STATUS: PLATIN — Release Beta 0.1: bounded workspace backup/restore archive.
import { describe, expect, it } from 'vitest';
import { readZip, utf8, writeStoredZip } from '../../../interop/zip';
import {
  WORKSPACE_BACKUP_FORMAT,
  WORKSPACE_BACKUP_MANIFEST_NAME,
  WORKSPACE_BACKUP_MAX_DOCUMENTS,
  createWorkspaceBackupArchive,
  mergeRestoredWorkspaceDocuments,
  readWorkspaceBackupArchive,
  WorkspaceBackupError,
} from '../workspaceBackupArchive';
import { workspaceStoreFileNameForDocumentId } from '../../persistence/workspaceFilePersistence';
import {
  createTestContainerCodec,
  workspaceDocumentFixture,
} from '../../persistence/testing/workspaceFileTestDoubles';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';

function backupDocuments(): WorkspaceDocument[] {
  return [
    workspaceDocumentFixture({ id: 'backup-writer', kind: 'Writer', title: 'Bericht', modified_at: 1_700_000_000_001 }),
    workspaceDocumentFixture({ id: 'backup-grid', kind: 'Grid', title: 'Budget', modified_at: 1_700_000_000_002 }),
    workspaceDocumentFixture({ id: 'backup-present', kind: 'Present', title: 'Deck', modified_at: 1_700_000_000_003 }),
  ];
}

describe('Workspace backup archive (release B5)', () => {
  it('packs encrypted documents and restores them losslessly', async () => {
    const codec = await createTestContainerCodec();
    const documents = backupDocuments();
    const created = await createWorkspaceBackupArchive({ documents, codec, appVersion: '0.1.0-beta.1', createdAt: 1_800_000_000_000 });

    expect(created.documentCount).toBe(3);
    expect(created.skippedCount).toBe(0);
    expect(created.bytes[0]).toBe(0x50); // "PK"
    expect(created.manifest.format).toBe(WORKSPACE_BACKUP_FORMAT);
    expect(created.manifest.documents.map((entry) => entry.documentId).sort()).toEqual([
      'backup-grid',
      'backup-present',
      'backup-writer',
    ]);

    const restored = await readWorkspaceBackupArchive(created.bytes, { codec });
    expect(restored.documents.map((document) => document.id).sort()).toEqual(['backup-grid', 'backup-present', 'backup-writer']);
    expect(restored.ignoredFileCount).toBe(0);
    expect(restored.skipped).toHaveLength(0);
    const byId = new Map(restored.documents.map((document) => [document.id, document]));
    expect(byId.get('backup-writer')?.title).toBe('Bericht');
    expect(byId.get('backup-grid')?.kind).toBe('Grid');
    expect(byId.get('backup-present')?.modified_at).toBe(1_700_000_000_003);
  });

  it('never silently drops a locked document: it is reported as skipped on create and restore', async () => {
    const codec = await createTestContainerCodec({ lockedDocumentIds: new Set(['backup-grid']) });
    // A locked document is still a valid encrypted container: the backup includes it (packing does
    // not need the PIN), and only restoring without the credential reports it as locked.
    const created = await createWorkspaceBackupArchive({ documents: backupDocuments(), codec });
    expect(created.documentCount).toBe(3);
    expect(created.manifest.skipped).toHaveLength(0);

    const restored = await readWorkspaceBackupArchive(created.bytes, { codec });
    expect(restored.documents.map((document) => document.id)).not.toContain('backup-grid');
    expect(restored.skipped).toEqual([expect.objectContaining({ documentId: 'backup-grid', reason: 'credential-required' })]);
  });

  it('rejects archives with a foreign or manipulated manifest instead of unpacking anything', async () => {
    const codec = await createTestContainerCodec();
    const document = backupDocuments()[0]!;
    const fileName = `documents/${await workspaceStoreFileNameForDocumentId(document.id)}`;
    const container = await codec.pack(document, {});
    const foreignManifest = writeStoredZip([
      { name: WORKSPACE_BACKUP_MANIFEST_NAME, data: utf8(JSON.stringify({ format: 'evil.backup', version: 1, createdAt: 1, documents: [] })) },
      { name: fileName, data: container },
    ]);
    await expect(readWorkspaceBackupArchive(foreignManifest, { codec })).rejects.toBeInstanceOf(WorkspaceBackupError);

    // Valid manifest but a document id that does not match the deterministic file name.
    const otherDocument = backupDocuments()[1]!;
    const otherFileName = `documents/${await workspaceStoreFileNameForDocumentId(otherDocument.id)}`;
    const mismatchManifest = writeStoredZip([
      {
        name: WORKSPACE_BACKUP_MANIFEST_NAME,
        data: utf8(JSON.stringify({
          format: WORKSPACE_BACKUP_FORMAT,
          version: 1,
          createdAt: 1,
          documents: [{ documentId: document.id, title: 'X', kind: 'Writer', modifiedAt: 1, fileName: otherFileName }],
          skipped: [],
        })),
      },
      { name: otherFileName, data: container },
    ]);
    await expect(readWorkspaceBackupArchive(mismatchManifest, { codec })).rejects.toMatchObject({ code: 'invalid-manifest' });
  });

  it('ignores unknown ZIP entries and rejects backups beyond the document bound', async () => {
    const codec = await createTestContainerCodec();
    const created = await createWorkspaceBackupArchive({ documents: backupDocuments().slice(0, 1), codec });
    const entries = [...(await readZip(created.bytes)), ['documents/extra.txt', utf8('unrelated')]] as const;
    const withExtra = writeStoredZip(entries.map(([name, data]) => ({ name, data })));
    const restored = await readWorkspaceBackupArchive(withExtra, { codec });
    expect(restored.documents).toHaveLength(1);
    expect(restored.ignoredFileCount).toBe(1);

    const tooMany = Array.from({ length: WORKSPACE_BACKUP_MAX_DOCUMENTS + 1 }, (_, index) =>
      workspaceDocumentFixture({ id: `too-many-${index}` }));
    await expect(createWorkspaceBackupArchive({ documents: tooMany, codec })).rejects.toMatchObject({ code: 'too-many-documents' });
  });

  it('manifest carries metadata only, not document content', async () => {
    const codec = await createTestContainerCodec();
    const document = workspaceDocumentFixture({ id: 'meta-doc', title: 'Geheimtitel' });
    document.writerData = { pageSetup: { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: true, headerText: '', footerText: '' }, tables: [] } as never;
    const created = await createWorkspaceBackupArchive({ documents: [document], codec });
    const entries = await readZip(created.bytes);
    const manifestText = new TextDecoder().decode(entries.get(WORKSPACE_BACKUP_MANIFEST_NAME)!);
    expect(manifestText).toContain('meta-doc');
    expect(manifestText).not.toContain('pageSetup');
    expect(manifestText).not.toContain('paperSize');
  });

  it('restore merge never rolls back newer local work', () => {
    const localNewer = workspaceDocumentFixture({ id: 'same-doc', title: 'Lokal neu', modified_at: 2_000 });
    const localOlder = workspaceDocumentFixture({ id: 'old-doc', title: 'Lokal alt', modified_at: 1_000 });
    const backupNewer = workspaceDocumentFixture({ id: 'same-doc', title: 'Backup alt', modified_at: 1_500 });
    const backupOlder = workspaceDocumentFixture({ id: 'old-doc', title: 'Backup neu', modified_at: 1_500 });
    const fresh = workspaceDocumentFixture({ id: 'fresh-doc', title: 'Nur Backup', modified_at: 1_200 });
    const merged = mergeRestoredWorkspaceDocuments(
      { 'same-doc': localNewer, 'old-doc': localOlder },
      [backupNewer, backupOlder, fresh],
    );
    expect([...merged.adoptedDocumentIds].sort()).toEqual(['fresh-doc', 'old-doc']);
    expect(merged.keptLocalDocumentIds).toEqual(['same-doc']);
    expect(merged.documents['same-doc']?.title).toBe('Lokal neu');
    expect(merged.documents['old-doc']?.title).toBe('Backup neu');
  });
});
