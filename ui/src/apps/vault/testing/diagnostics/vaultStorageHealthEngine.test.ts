// STATUS: PLATIN — Speicherzustand: Kapazität, Waisen, unfertige Transaktionen, Backup-Frische.
//
// `vaultStorageHealthEngine.ts` war der **einzige** Vault-Engine-Teil, den ich bis Batch 5 nicht gelesen
// hatte — und ich habe bis dahin bewusst nichts darüber behauptet. Jetzt ist es gemessen. Besonders wichtig
// ist `unsafeToWrite`/`unsafeReasons`: der Bericht trifft eine Aussage darüber, ob Schreiben sicher ist, und
// eine falsche „alles in Ordnung"-Antwort wäre hier teuer.
import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus, VaultStorageCapacitySnapshot, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { StoredVaultData } from '../../../../shared/contracts/vaultSpaces';
import {
  buildVaultStorageHealthReport,
  cleanupIncompleteVaultTransactions,
  computeVaultBackupFreshness,
  computeVaultKeyProviderHealth,
  computeVaultSizeBreakdown,
  CURRENT_VAULT_STORAGE_SCHEMA_VERSION,
  DEFAULT_VAULT_STORAGE_HEALTH_STATE,
  detectVaultOrphans,
  listIncompleteVaultTransactions,
  MAX_STALE_TRANSACTION_AGE_MS,
  normalizeVaultStorageHealthState,
  setVaultReadOnlyRecoveryMode,
} from '../../../../shared/vault/diagnostics/vaultStorageHealthEngine';

const NOW = 1_700_000_000_000;

const keyStatus = (overrides: Partial<KeyVaultStatus> = {}): KeyVaultStatus => ({
  coreConnected: true, isLocked: false, platform: 'Windows', ...overrides,
} as KeyVaultStatus);

const capacity = (overrides: Partial<VaultStorageCapacitySnapshot> = {}): VaultStorageCapacitySnapshot => ({
  source: 'host_disk', totalBytes: 1_000_000_000, freeBytes: 500_000_000, capturedAt: NOW, ...overrides,
});

const document = (id: string): WorkspaceDocument => ({
  schema_version: 1, id, title: id, kind: 'Writer', created_at: 1, modified_at: 1, version: 1, theme_id: 'default',
  root_object_ids: [], objects: {},
} as unknown as WorkspaceDocument);

function vaultData(overrides: Partial<StoredVaultData> = {}): StoredVaultData {
  return { files: [], folders: [], spaces: [], trash: [], ...overrides };
}

describe('Zustand normalisieren', () => {
  it('der Standard ist aktuell, beschreibbar und ohne Begründung', () => {
    expect(DEFAULT_VAULT_STORAGE_HEALTH_STATE).toEqual({
      version: 1, migrationVersion: CURRENT_VAULT_STORAGE_SCHEMA_VERSION, readOnlyRecoveryMode: false,
    });
    expect(normalizeVaultStorageHealthState()).toEqual(DEFAULT_VAULT_STORAGE_HEALTH_STATE);
  });

  it('eine Begründung existiert nur im gesperrten Lese-Modus und wird begrenzt', () => {
    expect(normalizeVaultStorageHealthState({ readOnlyRecoveryMode: false, readOnlyReason: 'egal' }).readOnlyReason).toBeUndefined();
    const long = normalizeVaultStorageHealthState({ readOnlyRecoveryMode: true, readOnlyReason: 'x'.repeat(500) });
    expect(long.readOnlyReason).toHaveLength(256);
    expect(normalizeVaultStorageHealthState({ readOnlyRecoveryMode: true }).readOnlyReason).toBe('Manual recovery mode');
  });

  it('unbrauchbare Zeitstempel und Migrationsversionen fallen auf sichere Werte zurück', () => {
    const normalized = normalizeVaultStorageHealthState({ migrationVersion: -5, lastHealthScanAt: Number.NaN, lastTransactionCleanupAt: 0 });
    // Gemessen: eine negative Migrationsversion fällt auf die **aktuelle** Version zurück (nicht auf 0).
    expect(normalized.migrationVersion).toBe(CURRENT_VAULT_STORAGE_SCHEMA_VERSION);
    expect(normalized.lastHealthScanAt).toBeUndefined();
    expect(normalized.lastTransactionCleanupAt).toBeUndefined();
  });
});

describe('Größenaufschlüsselung', () => {
  it('addiert die Bestandteile und bildet die logische Summe', () => {
    const sizes = computeVaultSizeBreakdown(vaultData({
      files: [{ id: 'a', sizeBytes: 100, name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1 }],
      versions: [{ id: 'v', fileId: 'a', snapshotBytes: 50 } as never],
      trash: [{ id: 't', deletedAt: 1, file: { id: 'a', sizeBytes: 25, name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1 } }],
      recoverySnapshots: [{ id: 'r', createdAt: 1, snapshotBytes: 10, integrityVersion: 2, files: [], folders: [], trash: [], documents: [], contentDigest: '' } as never],
      backupCatalog: [{ id: 'b', packageBytes: 999 } as never],
    }));
    expect(sizes).toMatchObject({ activeFilesBytes: 100, versionBytes: 50, trashBytes: 25, recoverySnapshotBytes: 10, referencedBackupBytes: 999 });
    expect(sizes.logicalVaultBytes).toBe(100 + 50 + 25 + 10 + sizes.searchIndexBytes + sizes.metadataBytes);
    // Referenzierte Backups zählen **nicht** in den logischen Tresor: sie liegen außerhalb.
    expect(sizes.logicalVaultBytes).toBeLessThan(999 + 185);
  });

  it('negative Größen werden als 0 gezählt, nicht abgezogen', () => {
    const sizes = computeVaultSizeBreakdown(vaultData({
      files: [{ id: 'a', sizeBytes: -100, name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1 }],
      trash: [],
    }));
    expect(sizes.activeFilesBytes).toBe(0);
  });

  it('der Suchindex wird auf 16 MiB gedeckelt', () => {
    const huge = { version: 1, builtAt: 1, protection: 'vault_container_aead', entries: Array.from({ length: 200_000 }, (_, index) => ({ fileId: `f${index}`, contentText: 'x'.repeat(200) })) };
    const sizes = computeVaultSizeBreakdown(vaultData({ searchIndex: huge as never }));
    expect(sizes.searchIndexBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(sizes.searchIndexBytes).toBeGreaterThan(0);
  });

  it('ein nicht serialisierbarer Index ergibt die Obergrenze statt eines Absturzes', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    const sizes = computeVaultSizeBreakdown(vaultData({ searchIndex: cyclic as never }));
    expect(sizes.searchIndexBytes).toBe(16 * 1024 * 1024);
  });
});

describe('Waisen: jede gebrochene Referenz wird benannt', () => {
  it('findet Ordner-, Datei-, Versions-, Index-, Freigabe-, Peer- und Space-Waisen', () => {
    const orphans = detectVaultOrphans(vaultData({
      folders: [{ id: 'f1', name: 'F', parentId: 'fehlt', createdAt: 1, modifiedAt: 1 }],
      files: [
        { id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1, folderId: 'fehlt' },
        { id: 'b', name: 'b', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1, sourceType: 'workspace-document', documentId: 'doc-weg' },
      ],
      versions: [{ id: 'v1', fileId: 'weg' } as never],
      searchIndex: { version: 1, builtAt: 1, protection: 'vault_container_aead', entries: [{ fileId: 'index-weg' }] } as never,
      shareGrants: [{ id: 'g1', fileId: 'weg' } as never],
      peerDevices: [{ id: 'peer-1' } as never],
      peerResume: [{ sessionId: 's1', fileId: 'weg', peerId: 'peer-weg', updatedAt: NOW } as never],
      spaces: [{ id: 'space-1', fileIds: ['space-weg'] } as never],
    }), [document('doc-da')]);
    expect(orphans).toEqual(expect.arrayContaining([
      'folder_parent:f1:fehlt', 'file_folder:a:fehlt', 'file_document:b:doc-weg', 'version_file:v1:weg',
      'search_file:index-weg:index-weg', 'share_file:g1:weg', 'resume_file:s1:weg', 'resume_peer:s1:peer-weg', 'space_file:space-1:space-weg',
    ]));
  });

  it('ein Space mit gültigen Dateiverweisen ergibt keine Space-Waisen', () => {
    // Gemessener Hinweis: `TeamSpace.fileIds` ist im Vertrag **optional**. Der Waisenpfad `space_file`
    // greift deshalb nur, wenn das Feld tatsächlich gesetzt ist — ein Space ohne `fileIds` ist kein Fehler.
    const withFileIds = detectVaultOrphans(vaultData({
      files: [{ id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1 }],
      spaces: [{ id: 'space-1', fileIds: ['a'] } as never],
    }), []);
    expect(withFileIds).toEqual([]);
    const withoutFileIds = detectVaultOrphans(vaultData({ spaces: [{ id: 'space-1' } as never] }), []);
    expect(withoutFileIds).toEqual([]);
  });

  it('gesunde Daten ergeben keine Waisen', () => {
    const orphans = detectVaultOrphans(vaultData({
      folders: [{ id: 'f1', name: 'F', parentId: null, createdAt: 1, modifiedAt: 1 }],
      files: [{ id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1, folderId: 'f1', sourceType: 'workspace-document', documentId: 'd1' }],
      peerDevices: [{ id: 'peer-1' } as never],
      peerResume: [{ sessionId: 's1', fileId: 'a', peerId: 'peer-1', updatedAt: NOW } as never],
    }), [document('d1')]);
    expect(orphans).toEqual([]);
  });

  it('die Liste ist auf 512 Einträge begrenzt', () => {
    const files = Array.from({ length: 700 }, (_, index) => ({ id: `f${index}`, name: 'x', kind: 'Writer', encryptedHash: '', lastModified: 1, folderId: 'fehlt' }));
    expect(detectVaultOrphans(vaultData({ files: files as never }), [])).toHaveLength(512);
  });
});

describe('Unfertige Transaktionen', () => {
  const resume = (overrides: Record<string, unknown> = {}) => ({ sessionId: 's1', fileId: 'a', peerId: 'peer-1', updatedAt: NOW, ...overrides }) as never;

  it('zu alte, auf fehlende Dateien oder unbekannte Peers zeigende Sitzungen werden gemeldet', () => {
    const base = vaultData({
      files: [{ id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1 }],
      peerDevices: [{ id: 'peer-1' } as never],
      peerResume: [
        resume({ sessionId: 'ok' }),
        resume({ sessionId: 'alt', updatedAt: NOW - MAX_STALE_TRANSACTION_AGE_MS - 1 }),
        resume({ sessionId: 'datei-weg', fileId: 'weg' }),
        resume({ sessionId: 'peer-weg', peerId: 'weg' }),
      ],
    });
    expect(listIncompleteVaultTransactions(base, NOW).sort()).toEqual(['alt', 'datei-weg', 'peer-weg']);
  });

  it('genau an der Altersgrenze gilt eine Sitzung noch als frisch', () => {
    const base = vaultData({
      files: [{ id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1 }],
      peerDevices: [{ id: 'peer-1' } as never],
      peerResume: [resume({ updatedAt: NOW - MAX_STALE_TRANSACTION_AGE_MS })],
    });
    // Gemessen: die Grenze ist **exklusiv** — erst älter als 24 h gilt als unfertig.
    expect(listIncompleteVaultTransactions(base, NOW)).toEqual([]);
    expect(MAX_STALE_TRANSACTION_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('die Bereinigung entfernt genau die gemeldeten Sitzungen und nennt sie', () => {
    const base = vaultData({
      files: [{ id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1 }],
      peerDevices: [{ id: 'peer-1' } as never],
      peerResume: [resume({ sessionId: 'ok' }), resume({ sessionId: 'alt', updatedAt: NOW - MAX_STALE_TRANSACTION_AGE_MS - 1 })],
    });
    const result = cleanupIncompleteVaultTransactions(base, NOW);
    expect(result.removed).toEqual(['alt']);
    expect(result.peerResume.map((item) => item.sessionId)).toEqual(['ok']);
  });
});

describe('Backup-Frische', () => {
  const withSchedule = (cadence: 'daily' | 'weekly') => vaultData({
    backupPolicy: { version: 1, mode: 'full', verifyAfterWrite: true, keyMode: 'inherit_vault', retentionCount: 10, retentionDays: 90, schedule: { enabled: true, executor: 'local_agent', cadence, hourLocal: 2 } },
  });
  const catalog = (verifiedAt: number) => [{ id: 'b', verifiedAt, packageBytes: 1 } as never];

  it('ohne Zeitplan ist der Zustand „manual" — auch ohne jedes Backup', () => {
    expect(computeVaultBackupFreshness(vaultData(), NOW)).toEqual({ state: 'manual' });
    expect(computeVaultBackupFreshness(vaultData({ backupCatalog: catalog(NOW - 1000) }), NOW)).toMatchObject({ state: 'manual', ageMs: 1000 });
  });

  it('mit Zeitplan und ohne Backup ist der Zustand „never" und nennt das erwartete Fenster', () => {
    expect(computeVaultBackupFreshness(withSchedule('daily'), NOW)).toEqual({ state: 'never', expectedWithinMs: 48 * 60 * 60 * 1000 });
    expect(computeVaultBackupFreshness(withSchedule('weekly'), NOW)).toMatchObject({ state: 'never', expectedWithinMs: 10 * 24 * 60 * 60 * 1000 });
  });

  it('innerhalb des Fensters „fresh", außerhalb „stale" — und der neueste Eintrag zählt', () => {
    const policy = withSchedule('daily');
    expect(computeVaultBackupFreshness({ ...policy, backupCatalog: catalog(NOW - 1000) }, NOW)).toMatchObject({ state: 'fresh', ageMs: 1000 });
    expect(computeVaultBackupFreshness({ ...policy, backupCatalog: catalog(NOW - 49 * 60 * 60 * 1000) }, NOW)).toMatchObject({ state: 'stale' });
    const mixed = { ...policy, backupCatalog: [{ id: 'alt', verifiedAt: NOW - 100 * 60 * 60 * 1000 } as never, { id: 'neu', verifiedAt: NOW - 60_000 } as never] };
    expect(computeVaultBackupFreshness(mixed, NOW)).toMatchObject({ state: 'fresh' });
  });
});

describe('Schlüssel-Provider', () => {
  it('ohne Verbindung heißt es ehrlich „software_or_unknown", nicht „bereit"', () => {
    expect(computeVaultKeyProviderHealth(keyStatus({ coreConnected: false }))).toMatchObject({ state: 'software_or_unknown', connected: false, hardwareBacked: false });
  });

  it('verbunden und gesperrt heißt „locked"; verbunden und offen heißt „ready"', () => {
    expect(computeVaultKeyProviderHealth(keyStatus({ isLocked: true }))).toMatchObject({ state: 'locked', connected: true });
    expect(computeVaultKeyProviderHealth(keyStatus())).toMatchObject({ state: 'ready', connected: true });
  });

  it('Hardware-Rückhalt wird nur bei vollständiger Provider-Bestätigung behauptet', () => {
    expect(computeVaultKeyProviderHealth(keyStatus({ hardwareBacked: true })).hardwareBacked).toBe(false);
    expect(computeVaultKeyProviderHealth(keyStatus({ hardwareBacked: true, hardwareAttestationVerified: true })).hardwareBacked).toBe(false);
    expect(computeVaultKeyProviderHealth(keyStatus({ hardwareBacked: true, hardwareAttestationVerified: true, hardwareSlotSupported: true })).hardwareBacked).toBe(true);
  });

  it('ein unbekannter Plattformname wird benannt, nicht erfunden', () => {
    expect(computeVaultKeyProviderHealth(keyStatus({ platform: undefined as never })).platform).toBe('Unknown provider');
  });
});

describe('Bericht: Migration, Sicherheit zum Schreiben, Kapazität', () => {
  it('die Migrationslage wird unterschieden: aktuell, ausstehend, unzulässig neu', () => {
    const report = (migrationVersion: number) => buildVaultStorageHealthReport(
      vaultData({ storageHealth: { version: 1, migrationVersion, readOnlyRecoveryMode: false } }), [], keyStatus(), capacity(), NOW,
    );
    expect(report(CURRENT_VAULT_STORAGE_SCHEMA_VERSION).migration).toBe('current');
    expect(report(CURRENT_VAULT_STORAGE_SCHEMA_VERSION + 1).migration).toBe('unsupported_future');
    /*
     * Gemessen — und meine erste Erwartung war falsch: `migrationVersion: 0` ist **gültig** (der
     * Normalisierer erlaubt 0) und bedeutet „älterer Stand" → `'pending'`. Ich hatte angenommen, 0 falle auf
     * den aktuellen Stand zurück. Der Ist-Zustand ist der sicherere: ein Bestand mit Version 0 wird nicht
     * stillschweigend als aktuell ausgegeben. `migrationVersion: -5` dagegen ist unbrauchbar und fällt auf
     * den Standard zurück.
     */
    expect(report(0).migration).toBe('pending');
    expect(report(0).unsafeReasons).toContain('migration_pending');
    expect(report(-5).migration).toBe('current');
  });

  it('Integritätsfehler setzen „unsafeToWrite" mit benanntem Grund', () => {
    const report = buildVaultStorageHealthReport(vaultData({
      files: [
        { id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1, status: 'corrupt' },
        { id: 'b', name: 'b', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1, status: 'missing' },
        { id: 'c', name: 'c', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1, integrityState: 'mismatch' },
      ],
    }), [], keyStatus(), capacity(), NOW);
    expect(report.corruptFiles).toBe(2);
    expect(report.missingFiles).toBe(1);
    expect(report.unsafeToWrite).toBe(true);
    expect(report.unsafeReasons).toContain('integrity_failure');
  });

  it('ein Integritätsaudit mit Abweichungen genügt für „unsafeToWrite"', () => {
    const report = buildVaultStorageHealthReport(vaultData({
      integrityAudits: [{ id: 'r', createdAt: NOW, totalFiles: 1, verified: 0, mismatch: 1, unavailable: 0, entries: [] } as never],
    }), [], keyStatus(), capacity(), NOW);
    expect(report.latestIntegrityMismatch).toBe(1);
    expect(report.latestIntegrityAt).toBe(NOW);
    expect(report.unsafeReasons).toContain('integrity_failure');
  });

  it('knapper Speicher setzt „unsafeToWrite" — mit 2 %-Untergrenze bzw. 64 MiB', () => {
    const tight = (total: number, free: number) => buildVaultStorageHealthReport(
      vaultData(), [], keyStatus(), { source: 'host_disk', totalBytes: total, freeBytes: free, capturedAt: NOW }, NOW,
    );
    // 1 GB Gesamt: die Untergrenze ist 64 MiB (2 % wären nur 20 MiB).
    expect(tight(1_000_000_000, 64 * 1024 * 1024 - 1).unsafeReasons).toContain('storage_capacity_critical');
    expect(tight(1_000_000_000, 64 * 1024 * 1024).unsafeReasons).not.toContain('storage_capacity_critical');
    // 100 GB Gesamt: 2 % (2 GB) ist größer als 64 MiB und gilt.
    expect(tight(100_000_000_000, 1_999_999_999).unsafeReasons).toContain('storage_capacity_critical');
    expect(tight(100_000_000_000, 2_000_000_000).unsafeReasons).not.toContain('storage_capacity_critical');
  });

  it('ohne Kapazitätsangabe wird die Kapazitätsprüfung NICHT erfunden', () => {
    const report = buildVaultStorageHealthReport(vaultData(), [], keyStatus(), { source: 'unavailable', capturedAt: NOW }, NOW);
    expect(report.unsafeReasons).not.toContain('storage_capacity_critical');
    expect(report.unsafeToWrite).toBe(false);
    // Ein Gesamt ohne Freiwert genügt ebenfalls nicht für ein Urteil.
    const partial = buildVaultStorageHealthReport(vaultData(), [], keyStatus(), { source: 'browser_quota', totalBytes: 100, capturedAt: NOW }, NOW);
    expect(partial.unsafeReasons).not.toContain('storage_capacity_critical');
  });

  it('ein gesunder Tresor ist beschreibbar und zählt die Bestände', () => {
    const report = buildVaultStorageHealthReport(vaultData({
      files: [{ id: 'a', name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1, sizeBytes: 1 }],
      versions: [{ id: 'v', fileId: 'a' } as never, { id: 'v2', fileId: 'a' } as never],
      trash: [{ id: 't', deletedAt: 1, file: { id: 'a', sizeBytes: 1, name: 'a', kind: 'Writer', encryptedHash: '', lastModified: 1 } }],
    }), [], keyStatus(), capacity(), NOW);
    expect(report.unsafeToWrite).toBe(false);
    expect(report.unsafeReasons).toEqual([]);
    expect(report).toMatchObject({ versionCount: 2, trashCount: 1, corruptFiles: 0, missingFiles: 0, createdAt: NOW });
    expect(report.orphanRefs).toEqual([]);
  });
});

describe('Lese-Modus setzen', () => {
  it('setzt und löscht den Modus samt Begründung', () => {
    const enabled = setVaultReadOnlyRecoveryMode(undefined, true, '  Integrität beschädigt  ', NOW);
    expect(enabled).toMatchObject({ readOnlyRecoveryMode: true, readOnlyReason: 'Integrität beschädigt', lastHealthScanAt: NOW });
    const disabled = setVaultReadOnlyRecoveryMode(enabled, false, 'egal', NOW + 5);
    expect(disabled.readOnlyRecoveryMode).toBe(false);
    expect(disabled.readOnlyReason).toBeUndefined();
    // Der erste Scan-Zeitpunkt bleibt erhalten.
    expect(disabled.lastHealthScanAt).toBe(NOW);
  });

  it('ohne Begründung wird ein Standardtext gesetzt, nicht ein leerer', () => {
    expect(setVaultReadOnlyRecoveryMode(undefined, true).readOnlyReason).toBe('Storage health requires recovery mode');
  });
});
