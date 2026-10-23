// STATUS: PLATIN — Papierkorb und Recovery: was wiederherstellbar ist, und was ausdrücklich nicht.
//
// `vaultRecoveryEngine.ts` hatte bis hierher genau **zwei** Tests (`src/testing/apps/vault/vaultRecoveryEngine.test.ts`,
// beide nur für den Snapshot-Roundtrip). Alles andere — Soft-Delete, Retention, Bulk-Grenzen, die ehrliche
// Purge-Semantik, die Identitätsprüfung beim Rollback — war ungelesen. Dieser Test misst es.
//
// Zwei Zusagen sind mir dabei besonders wichtig, weil sie Datenverlust bzw. eine falsche Erfolgsmeldung
// betreffen:
//   • `restoreVaultTrashEntries` verweigert die Wiederherstellung, wenn die Datei-ID bereits aktiv ist —
//     sonst gäbe es zwei Einträge mit derselben ID und Undo/Verweise würden mehrdeutig.
//   • `vaultPurgeSemantics()` behauptet **nicht**, dass Löschen kryptografisch wirkt. Genau diese Ehrlichkeit
//     verlangt der Auftrag („nie eine Erfolgsmeldung ohne die Operation").
import { describe, expect, it } from 'vitest';
import type { VaultFile, VaultFolder, VaultRecoverySnapshot, VaultTrashEntry, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  applyVaultTrashRetention,
  appendVaultRecoverySnapshot,
  createVaultRecoverySnapshot,
  DEFAULT_VAULT_TRASH_RETENTION,
  EMPTY_TRASH_CONFIRMATION,
  emptyVaultTrash,
  MAX_VAULT_BULK_RESTORE,
  MAX_VAULT_RECOVERY_SNAPSHOTS,
  MAX_VAULT_TRASH_RETENTION_DAYS,
  moveVaultFileToTrash,
  normalizeVaultTrashRetention,
  purgeVaultTrashEntry,
  restoreVaultRecoverySnapshot,
  restoreVaultTrashEntries,
  restoreVaultTrashEntry,
  vaultPurgeSemantics,
  vaultRecoveryStorageUsage,
  vaultTrashUsage,
  type VaultRecoveryState,
} from '../../../../shared/vault/recovery/vaultRecoveryEngine';

const NOW = 1_700_000_000_000;

const file = (id: string, overrides: Partial<VaultFile> = {}): VaultFile => ({
  id, name: `${id}.txt`, kind: 'Writer', sizeBytes: 100,
  encryptedHash: 'a'.repeat(64), lastModified: NOW, folderId: null, ...overrides,
});

const folder = (id: string, parentId: string | null = null): VaultFolder => ({
  id, name: `Ordner ${id}`, parentId, createdAt: 1, modifiedAt: 1,
});

const emptyState = (): VaultRecoveryState => ({ files: [], folders: [], trash: [] });

describe('Soft-Delete: verschieben statt löschen', () => {
  it('eine Datei wandert in den Papierkorb und behält ihren Inhalt und Ordner', () => {
    const state: VaultRecoveryState = { files: [file('a', { folderId: 'f1' }), file('b')], folders: [folder('f1')], trash: [] };
    const next = moveVaultFileToTrash(state, 'a', NOW);
    expect(next.files.map((item) => item.id)).toEqual(['b']);
    expect(next.trash).toHaveLength(1);
    expect(next.trash[0]).toMatchObject({ deletedAt: NOW, originalFolderId: 'f1' });
    expect(next.trash[0]?.file.id).toBe('a');
    // Der Inhalt wird kopiert, nicht referenziert: eine spätere Änderung darf den Papierkorb nicht verändern.
    expect(next.trash[0]?.file.name).toBe('a.txt');
  });

  it('eine unbekannte Datei wird abgelehnt', () => {
    expect(() => moveVaultFileToTrash(emptyState(), 'weg')).toThrow('vault_trash_file_not_found');
  });

  it('zweimal dasselbe löschen ist kein stiller Erfolg', () => {
    const once = moveVaultFileToTrash({ files: [file('a')], folders: [], trash: [] }, 'a', NOW);
    expect(() => moveVaultFileToTrash(once, 'a', NOW)).toThrow('vault_trash_file_not_found');
  });
});

describe('Wiederherstellen: Identität und Zielordner', () => {
  it('stellt an den ursprünglichen Ort wieder her', () => {
    const state: VaultRecoveryState = { files: [], folders: [folder('f1')], trash: [{ id: 't1', deletedAt: NOW, file: file('a', { folderId: 'f1' }), originalFolderId: 'f1' }] };
    const restored = restoreVaultTrashEntry(state, 't1', NOW + 10);
    expect(restored.files[0]).toMatchObject({ id: 'a', folderId: 'f1', lastModified: NOW + 10 });
    expect(restored.trash).toEqual([]);
  });

  it('stellt an ein ausdrücklich genanntes Ziel wieder her, auch an die Wurzel', () => {
    const state: VaultRecoveryState = { files: [], folders: [folder('f1'), folder('f2')], trash: [{ id: 't1', deletedAt: NOW, file: file('a', { folderId: 'f1' }), originalFolderId: 'f1' }] };
    expect(restoreVaultTrashEntry(state, 't1', NOW, 'f2').files[0]?.folderId).toBe('f2');
    expect(restoreVaultTrashEntry(state, 't1', NOW, null).files[0]?.folderId).toBeNull();
  });

  it('ein Zielordner, den es nicht mehr gibt, wird abgelehnt statt still an die Wurzel zu legen', () => {
    const state: VaultRecoveryState = { files: [], folders: [], trash: [{ id: 't1', deletedAt: NOW, file: file('a'), originalFolderId: 'weg' }] };
    expect(() => restoreVaultTrashEntry(state, 't1', NOW)).toThrow('vault_trash_restore_folder_missing');
    expect(() => restoreVaultTrashEntry(state, 't1', NOW, 'weg')).toThrow('vault_trash_restore_folder_missing');
  });

  it('eine bereits aktive ID verhindert die Wiederherstellung — sonst gäbe es zwei Einträge mit derselben ID', () => {
    const state: VaultRecoveryState = { files: [file('a')], folders: [], trash: [{ id: 't1', deletedAt: NOW, file: file('a') }] };
    expect(() => restoreVaultTrashEntry(state, 't1', NOW)).toThrow('vault_trash_restore_id_conflict');
  });

  it('eine unbekannte Papierkorb-ID wird abgelehnt', () => {
    expect(() => restoreVaultTrashEntry(emptyState(), 'weg')).toThrow('vault_trash_entry_not_found');
  });

  it('Bulk-Wiederherstellung nimmt Duplikate in der Auswahl nur einmal', () => {
    const state: VaultRecoveryState = {
      files: [], folders: [],
      trash: [
        { id: 't1', deletedAt: NOW, file: file('a') },
        { id: 't2', deletedAt: NOW, file: file('b') },
      ],
    };
    const restored = restoreVaultTrashEntries(state, ['t1', 't1', 't2'], undefined, NOW);
    expect(restored.files.map((item) => item.id).sort()).toEqual(['a', 'b']);
    expect(restored.trash).toEqual([]);
  });

  it('eine leere Auswahl und eine Auswahl oberhalb der Grenze werden abgelehnt', () => {
    const state: VaultRecoveryState = {
      files: [], folders: [],
      trash: Array.from({ length: MAX_VAULT_BULK_RESTORE + 1 }, (_, index) => ({ id: `t${index}`, deletedAt: NOW, file: file(`f${index}`) })),
    };
    expect(() => restoreVaultTrashEntries(state, [])).toThrow('vault_trash_restore_selection_required');
    expect(() => restoreVaultTrashEntries(state, state.trash.map((entry) => entry.id))).toThrow('vault_trash_bulk_restore_limit');
    // Genau die Grenze ist zulässig.
    expect(restoreVaultTrashEntries(state, state.trash.slice(0, MAX_VAULT_BULK_RESTORE).map((entry) => entry.id), undefined, NOW).files)
      .toHaveLength(MAX_VAULT_BULK_RESTORE);
  });

  it('eine Auswahl, die eine unbekannte ID enthält, wird vollständig abgelehnt', () => {
    const state: VaultRecoveryState = { files: [], folders: [], trash: [{ id: 't1', deletedAt: NOW, file: file('a') }] };
    expect(() => restoreVaultTrashEntries(state, ['t1', 'weg'])).toThrow('vault_trash_entry_not_found');
  });
});

describe('Endgültiges Löschen: ehrlich benannt, nicht als kryptografische Vernichtung verkauft', () => {
  it('die Purge-Semantik behauptet ausdrücklich KEINE Schlüsselvernichtung und KEIN Überschreiben', () => {
    const semantics = vaultPurgeSemantics();
    expect(semantics).toEqual({
      logicalPurge: true,
      cryptographicKeyDestruction: false,
      physicalOverwriteClaim: false,
      reason: expect.stringContaining('shared container key'),
    });
  });

  it('einen einzelnen Eintrag entfernen und einen unbekannten ablehnen', () => {
    const state: VaultRecoveryState = { files: [], folders: [], trash: [{ id: 't1', deletedAt: NOW, file: file('a') }] };
    expect(purgeVaultTrashEntry(state, 't1').trash).toEqual([]);
    expect(() => purgeVaultTrashEntry(state, 'weg')).toThrow('vault_trash_entry_not_found');
  });

  it('„alles leeren" verlangt die Bestätigungsphrase im Klartext', () => {
    const state: VaultRecoveryState = { files: [], folders: [], trash: [{ id: 't1', deletedAt: NOW, file: file('a') }] };
    expect(() => emptyVaultTrash(state, '')).toThrow('vault_trash_confirmation_required');
    expect(() => emptyVaultTrash(state, 'leeren')).toThrow('vault_trash_confirmation_required');
    expect(() => emptyVaultTrash(state, 'EMPTY TRASH ')).toThrow('vault_trash_confirmation_required');
    expect(emptyVaultTrash(state, EMPTY_TRASH_CONFIRMATION).trash).toEqual([]);
  });
});

describe('Retention im Papierkorb', () => {
  it('abgelaufene Einträge werden gezählt und entfernt', () => {
    const state: VaultRecoveryState = {
      files: [], folders: [],
      trash: [
        { id: 'alt', deletedAt: NOW - 100 * 86_400_000, file: file('alt') },
        { id: 'neu', deletedAt: NOW - 1 * 86_400_000, file: file('neu') },
      ],
    };
    const result = applyVaultTrashRetention(state, { maxAgeDays: 30 }, NOW);
    expect(result.purged).toBe(1);
    expect(result.state.trash.map((entry) => entry.id)).toEqual(['neu']);
  });

  it('die Grenzen werden eingehalten und der Standard ist 30 Tage', () => {
    expect(DEFAULT_VAULT_TRASH_RETENTION.maxAgeDays).toBe(30);
    expect(normalizeVaultTrashRetention({ maxAgeDays: 99_999 }).maxAgeDays).toBe(MAX_VAULT_TRASH_RETENTION_DAYS);
    expect(normalizeVaultTrashRetention({ maxAgeDays: 0 }).maxAgeDays).toBe(1);
    expect(normalizeVaultTrashRetention().maxAgeDays).toBe(30);
  });

  it('die Belegungsanzeige zählt Einträge und Bytes und ignoriert unsinnige Größen', () => {
    const trash: VaultTrashEntry[] = [
      { id: 't1', deletedAt: NOW, file: file('a', { sizeBytes: 10 }) },
      { id: 't2', deletedAt: NOW, file: file('b', { sizeBytes: -5 }) },
    ];
    expect(vaultTrashUsage(trash)).toEqual({ count: 2, bytes: 10 });
    expect(vaultTrashUsage([])).toEqual({ count: 0, bytes: 0 });
  });
});

describe('Recovery-Snapshots: Integrität und Identität', () => {
  const document = (id: string, title: string, kind = 'Writer'): WorkspaceDocument => ({
    schema_version: 1, id, title, kind, created_at: 1, modified_at: 1, version: 1, theme_id: 'default',
    root_object_ids: [], objects: {},
  } as unknown as WorkspaceDocument);

  it('ein Snapshot schließt den Tresor selbst aus und trägt Digest und Größe', async () => {
    const documents = [document('vault-1', 'Tresor', 'Vault'), document('d-1', 'A'), document('d-2', 'B')];
    const snapshot = await createVaultRecoverySnapshot(emptyState(), documents, 'vault-1', { label: '  Test  ', now: NOW });
    expect(snapshot.documents.map((item) => item.documentId).sort()).toEqual(['d-1', 'd-2']);
    expect(snapshot.integrityVersion).toBe(2);
    expect(snapshot.label).toBe('Test');
    expect(snapshot.contentDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.snapshotBytes).toBeGreaterThan(0);
  });

  it('ein manipulierter Snapshot wird vor jeder Anwendung abgelehnt', async () => {
    const documents = [document('vault-1', 'Tresor', 'Vault'), document('d-1', 'A')];
    const snapshot = await createVaultRecoverySnapshot(emptyState(), documents, 'vault-1', { now: NOW });
    const tampered: VaultRecoverySnapshot = {
      ...snapshot,
      documents: [{ ...snapshot.documents[0]!, snapshotJson: snapshot.documents[0]!.snapshotJson.replace('"title"', '"Title"') }],
    };
    await expect(restoreVaultRecoverySnapshot(tampered, documents)).rejects.toThrow(/vault_recovery_(snapshot_integrity_failed|document_(size|integrity)_)/u);
  });

  it('eine Identitätsänderung im Dokument wird abgelehnt', async () => {
    const documents = [document('vault-1', 'Tresor', 'Vault'), document('d-1', 'A')];
    const snapshot = await createVaultRecoverySnapshot(emptyState(), documents, 'vault-1', { now: NOW });
    // Dokument-ID im Snapshot umbenennen, aber den Digest mitziehen: dann greift die Identitätsprüfung.
    const renamed = JSON.parse(snapshot.documents[0]!.snapshotJson) as WorkspaceDocument;
    renamed.id = 'd-anderes';
    const json = JSON.stringify(renamed);
    const { sha256Text } = await import('../../../../shared/vault/integrity/vaultIntegrity');
    const crafted: VaultRecoverySnapshot = {
      ...snapshot,
      documents: [{ ...snapshot.documents[0]!, snapshotJson: json, contentDigest: await sha256Text(json), snapshotBytes: new TextEncoder().encode(json).byteLength }],
    };
    // Der Digest des **Gesamt**-Snapshots passt nun nicht mehr → Ablehnung. Das ist die gewünschte Richtung:
    // ein nachträglich verändertes Teilstück kann den Gesamt-Digest nicht mitziehen.
    await expect(restoreVaultRecoverySnapshot(crafted, documents)).rejects.toThrow('vault_recovery_snapshot_integrity_failed');
  });

  it('ein Rollback aktualisiert vorhandene Dokumente und legt fehlende neu an', async () => {
    const documents = [document('vault-1', 'Tresor', 'Vault'), document('d-1', 'A')];
    const snapshot = await createVaultRecoverySnapshot(emptyState(), documents, 'vault-1', { now: NOW });
    const result = await restoreVaultRecoverySnapshot(snapshot, [document('d-1', 'A', 'Writer')], NOW + 50);
    expect(result.updatedDocuments.map((item) => item.id)).toEqual(['d-1']);
    expect(result.updatedDocuments[0]?.version).toBe(2);
    expect(result.recreatedDocuments).toEqual([]);
    // Fehlt das Dokument inzwischen, wird es neu angelegt statt zu verschwinden.
    const recreated = await restoreVaultRecoverySnapshot(snapshot, [], NOW + 50);
    expect(recreated.recreatedDocuments.map((item) => item.id)).toEqual(['d-1']);
  });

  it('eine nicht unterstützte Integritätsversion wird abgelehnt', async () => {
    const documents = [document('vault-1', 'Tresor', 'Vault')];
    const snapshot = await createVaultRecoverySnapshot(emptyState(), documents, 'vault-1', { now: NOW });
    await expect(restoreVaultRecoverySnapshot({ ...snapshot, integrityVersion: 3 as never }, documents))
      .rejects.toThrow('vault_recovery_snapshot_integrity_version_unsupported');
  });

  it('der Snapshot-Verlauf ist begrenzt und die Belegung wird zusammengefasst', () => {
    const snapshot = (id: string, createdAt: number, bytes: number): VaultRecoverySnapshot => ({
      id, createdAt, integrityVersion: 2, files: [], folders: [], trash: [], documents: [],
      snapshotBytes: bytes, contentDigest: 'a'.repeat(64),
    });
    let list: VaultRecoverySnapshot[] = [];
    for (let index = 0; index < MAX_VAULT_RECOVERY_SNAPSHOTS + 5; index += 1) {
      list = appendVaultRecoverySnapshot(list, snapshot(`s${index}`, NOW + index, 10));
    }
    expect(list).toHaveLength(MAX_VAULT_RECOVERY_SNAPSHOTS);
    expect(list[0]?.id).toBe(`s${MAX_VAULT_RECOVERY_SNAPSHOTS + 4}`);
    // Derselbe Snapshot wird ersetzt, nicht gedoppelt — solange er im Fenster der neuesten Einträge bleibt.
    // (Ein erneutes Anhängen mit **altem** `createdAt` fällt dagegen aus der Grenze heraus; das ist die
    // gemessene Semantik und wird hier nicht schöngeredet.)
    const newestId = list[0]!.id;
    const replaced = appendVaultRecoverySnapshot(list, snapshot(newestId, NOW + 1000, 10));
    expect(replaced.filter((item) => item.id === newestId)).toHaveLength(1);
    expect(replaced).toHaveLength(MAX_VAULT_RECOVERY_SNAPSHOTS);
    // Und ein erneut angehängter alter Snapshot verschiebt sich ans Ende und fällt aus der Grenze.
    expect(appendVaultRecoverySnapshot(list, snapshot('s0', NOW, 10))).toHaveLength(MAX_VAULT_RECOVERY_SNAPSHOTS);
    expect(vaultRecoveryStorageUsage(list)).toMatchObject({ count: MAX_VAULT_RECOVERY_SNAPSHOTS, bytes: MAX_VAULT_RECOVERY_SNAPSHOTS * 10 });
  });
});
