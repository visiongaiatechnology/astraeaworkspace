// STATUS: PLATIN — Backup-Integrität: Manipulation wird abgelehnt, bevor etwas materialisiert wird.
//
// Warum dieser Test existiert: `vaultBackupEngine.ts` ist die prüfende Instanz für das Paket, das den
// **gesamten** Tresor enthält, und hatte bis hierher **keinen einzigen Test**. Die Prüfkette ist beim Lesen
// vollständig — Format, IDs, Größen, Digest je Dokument, Manifest, Tombstone-Konflikt, Kette, Ziel- und
// Schlüsselmodus-Gleichheit, Retention, die eine Basis nie unter einem abhängigen Inkrement löscht. „Beim
// Lesen vollständig" ist aber keine Messung. Dieser Test misst.
//
// Der wichtigste Fall ist das Akzeptanzszenario zu AST-1191/1192: **ein manipuliertes Backup muss vor der
// Materialisierung abgelehnt werden.** Die Reihenfolge ist der Kern — `restoreVaultBackupChain` validiert
// **alle** Pakete der Kette, bevor es den Zustand aufbaut. Ein Test, der nur „wirft irgendwie" prüft, würde
// eine Fassung durchgehen lassen, die erst nach dem Aufbau scheitert; deshalb prüft der letzte Block, dass
// im Fehlerfall **nichts** zurückkommt.
import { describe, expect, it } from 'vitest';
import type { VaultBackupCatalogEntry, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  applyVaultBackupRetention,
  backupCatalogEntryFromBundle,
  createVaultBackupBundle,
  isVaultBackupScheduleDue,
  MAX_VAULT_BACKUP_BUNDLE_BYTES,
  MAX_VAULT_BACKUP_CATALOG,
  MAX_VAULT_BACKUP_DOCUMENTS,
  normalizeVaultBackupPolicy,
  normalizeVaultBackupTarget,
  previewVaultBackupBundle,
  restoreSelectedVaultFiles,
  restoreVaultBackupChain,
  sha256Hex,
  validateVaultBackupBundle,
  VAULT_BACKUP_FORMAT,
  type VaultBackupBundle,
} from '../../../../shared/vault/backup/vaultBackupEngine';

const NOW = 1_700_000_000_000;

function doc(id: string, overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    schema_version: 1, id, title: `Doc ${id}`, kind: 'Writer',
    created_at: 1, modified_at: 1, version: 1, theme_id: 'default',
    root_object_ids: [], objects: {},
    ...overrides,
  } as unknown as WorkspaceDocument;
}

function vaultDoc(id: string, files: Array<{ id: string; name: string; sizeBytes: number }> = []): WorkspaceDocument {
  return doc(id, { kind: 'Vault', vaultData: { files, folders: [], spaces: [], shares: [], trash: [] } } as never);
}

const target = { id: 'target-1', label: 'Primary', kind: 'local_folder' as const, transport: 'filesystem_access' as const, airGapped: false };

async function catalogEntry(bundle: VaultBackupBundle, locator = `${bundle.id}.vbackup`): Promise<VaultBackupCatalogEntry> {
  const digest = await sha256Hex(JSON.stringify(bundle));
  return backupCatalogEntryFromBundle(bundle, digest, 1024, { ...normalizeVaultBackupPolicy({ target }), target }, locator, NOW);
}

describe('Backup-Bundle: Erzeugung und Prüfung', () => {
  it('ein vollständiges Bündel trägt Format, Version und den Quell-Tresor', async () => {
    const documents = [vaultDoc('vault-1'), doc('d-1'), doc('d-2')];
    const bundle = await createVaultBackupBundle(documents, 'vault-1', 'full', undefined, NOW);
    expect(bundle.format).toBe(VAULT_BACKUP_FORMAT);
    expect(bundle.version).toBe(1);
    expect(bundle.sourceVaultDocumentId).toBe('vault-1');
    expect(bundle.mode).toBe('full');
    expect(bundle.documents.map((item) => item.documentId)).toEqual(['d-1', 'd-2', 'vault-1']);
    expect(bundle.deletedDocumentIds).toEqual([]);
    await expect(validateVaultBackupBundle(bundle)).resolves.toBe(bundle);
  });

  it('eine doppelte Dokument-ID wird abgelehnt, statt still zu überschreiben', async () => {
    await expect(createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW))
      .rejects.toThrow('vault_backup_document_id_invalid_or_duplicate');
  });

  it('ohne Quell-Tresor im Stapel gibt es kein Backup', async () => {
    await expect(createVaultBackupBundle([doc('d-1')], 'vault-1', 'full', undefined, NOW))
      .rejects.toThrow('vault_backup_source_vault_missing');
  });

  it('ein inkrementelles Bündel ohne Basis wird abgelehnt', async () => {
    await expect(createVaultBackupBundle([vaultDoc('vault-1')], 'vault-1', 'incremental', undefined, NOW))
      .rejects.toThrow('vault_backup_incremental_base_required');
  });

  it('ein Dokument oberhalb der Größenordnung wird abgelehnt, nicht gekürzt', async () => {
    const huge = doc('d-huge', { title: 'x'.repeat(33 * 1024 * 1024) });
    await expect(createVaultBackupBundle([vaultDoc('vault-1'), huge], 'vault-1', 'full', undefined, NOW))
      .rejects.toThrow('vault_backup_document_size_limit');
  });
});

describe('Manipuliertes Backup wird VOR der Materialisierung abgelehnt', () => {
  it('ein gekipptes Byte im Snapshot fällt über den Digest auf', async () => {
    const bundle = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    const tampered: VaultBackupBundle = {
      ...bundle,
      documents: bundle.documents.map((item) => item.documentId === 'd-1'
        ? { ...item, snapshotJson: item.snapshotJson.replace('"title"', '"Title"') }
        : item),
    };
    // Der Digest steht noch auf dem alten Wert, die Größe stimmt noch: nur der Inhalt ist anders.
    await expect(validateVaultBackupBundle(tampered)).rejects.toThrow('vault_backup_payload_integrity_failed');
  });

  it('ein gefälschter Digest allein genügt nicht — die Größe muss ebenfalls stimmen', async () => {
    const bundle = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    const tampered: VaultBackupBundle = {
      ...bundle,
      documents: bundle.documents.map((item) => item.documentId === 'd-1' ? { ...item, sizeBytes: item.sizeBytes + 1 } : item),
    };
    await expect(validateVaultBackupBundle(tampered)).rejects.toThrow('vault_backup_payload_size_invalid');
  });

  it('ein falsches Format oder eine falsche Version wird abgelehnt', async () => {
    const bundle = await createVaultBackupBundle([vaultDoc('vault-1')], 'vault-1', 'full', undefined, NOW);
    await expect(validateVaultBackupBundle({ ...bundle, format: 'OTHER' as never })).rejects.toThrow('vault_backup_format_invalid');
    await expect(validateVaultBackupBundle({ ...bundle, version: 2 as never })).rejects.toThrow('vault_backup_format_invalid');
  });

  it('ein Manifest-Eintrag mit falschem Digest-Format wird abgelehnt', async () => {
    const bundle = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    const tampered: VaultBackupBundle = {
      ...bundle,
      documentDigests: bundle.documentDigests.map((item) => item.documentId === 'd-1' ? { ...item, digest: 'nicht-hex' } : item),
    };
    await expect(validateVaultBackupBundle(tampered)).rejects.toThrow('vault_backup_manifest_invalid');
  });

  it('ein Tombstone, der ein noch vorhandenes Dokument löscht, wird abgelehnt', async () => {
    const bundle = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    const tampered: VaultBackupBundle = { ...bundle, deletedDocumentIds: ['d-1'] };
    await expect(validateVaultBackupBundle(tampered)).rejects.toThrow('vault_backup_tombstone_conflict');
  });

  it('doppelte Dokument-IDs im Bündel (Manipulation nach der Erzeugung) werden abgelehnt', async () => {
    const bundle = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    const first = bundle.documents[0]!;
    const tampered: VaultBackupBundle = { ...bundle, documents: [first, { ...first }] };
    await expect(validateVaultBackupBundle(tampered)).rejects.toThrow('vault_backup_payload_duplicate');
  });
});

describe('Kette: die Reihenfolge ist die Sicherheit', () => {
  it('eine volle Basis plus Inkrement ergibt den erwarteten Zustand', async () => {
    const base = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    const baseEntry = await catalogEntry(base);
    const incremental = await createVaultBackupBundle(
      [vaultDoc('vault-1'), doc('d-1'), doc('d-2')], 'vault-1', 'incremental', baseEntry, NOW + 1000,
    );
    expect(incremental.baseBackupId).toBe(base.id);
    expect(incremental.documents.map((item) => item.documentId)).toEqual(['d-2']);

    const restored = await restoreVaultBackupChain([base, incremental]);
    expect(restored.map((item) => item.id)).toEqual(['d-1', 'd-2', 'vault-1']);
  });

  it('eine Kette, die nicht mit einer vollen Basis beginnt, wird abgelehnt', async () => {
    const base = await createVaultBackupBundle([vaultDoc('vault-1')], 'vault-1', 'full', undefined, NOW);
    const baseEntry = await catalogEntry(base);
    const incremental = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'incremental', baseEntry, NOW + 1000);
    await expect(restoreVaultBackupChain([incremental])).rejects.toThrow('vault_backup_chain_full_required');
  });

  it('ein Inkrement mit falschem Vorgänger bricht die Kette ab, statt sie zu erraten', async () => {
    const baseA = await createVaultBackupBundle([vaultDoc('vault-1')], 'vault-1', 'full', undefined, NOW);
    const entryA = await catalogEntry(baseA);
    const orphan = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-x')], 'vault-1', 'incremental', entryA, NOW + 2000);
    // Vorgänger durch ein *anderes* volles Paket ersetzt: die Verkettung stimmt nicht mehr.
    const unrelatedBase = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-y')], 'vault-1', 'full', undefined, NOW - 5000);
    await expect(restoreVaultBackupChain([unrelatedBase, orphan])).rejects.toThrow('vault_backup_chain_broken');
  });

  it('verweigert die Wiederherstellung vollständig, wenn ein Paket der Kette manipuliert ist', async () => {
    const base = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    const baseEntry = await catalogEntry(base);
    const incremental = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-2')], 'vault-1', 'incremental', baseEntry, NOW + 1000);
    const tamperedBase: VaultBackupBundle = {
      ...base,
      documents: base.documents.map((item) => ({ ...item, snapshotJson: item.snapshotJson.replace('"title"', '"Title"') })),
    };
    // Der Fehler kommt aus der **Basis**, also aus einem Paket, das gar nicht das angeforderte ist: die
    // ganze Kette wird geprüft, bevor irgendetwas materialisiert wird.
    await expect(restoreVaultBackupChain([tamperedBase, incremental])).rejects.toThrow('vault_backup_payload_integrity_failed');
  });

  it('eine Teilauswahl, die ein fehlendes Dokument nennt, wird abgelehnt', async () => {
    const base = await createVaultBackupBundle([vaultDoc('vault-1'), doc('d-1')], 'vault-1', 'full', undefined, NOW);
    await expect(restoreVaultBackupChain([base], ['d-1', 'gibt-es-nicht'])).rejects.toThrow('vault_backup_restore_selection_missing');
  });

  it('eine leere Kette wird abgelehnt', async () => {
    await expect(restoreVaultBackupChain([])).rejects.toThrow('vault_backup_chain_empty');
  });
});

describe('Retention löscht nie eine Basis, die ein Inkrement noch braucht', () => {
  const entry = (id: string, createdAt: number, baseBackupId?: string): VaultBackupCatalogEntry => ({
    id, createdAt, mode: baseBackupId ? 'incremental' : 'full', baseBackupId,
    packageDigest: 'a'.repeat(64), packageBytes: 100, documentCount: 1, changedDocumentCount: 1,
    deletedDocumentIds: [], documentDigests: [], targetId: 'target-1', targetKind: 'local_folder',
    targetLocator: `${id}.vbackup`, keyMode: 'inherit_vault', verifiedAt: createdAt, airGapped: false,
  });

  it('bei „eine behalten" bleibt die Basis erhalten, weil ein Inkrement von ihr abhängt', () => {
    const catalog = [entry('base', NOW - 10_000), entry('inc', NOW, 'base')];
    const result = applyVaultBackupRetention(catalog, { ...normalizeVaultBackupPolicy({ target }), retentionCount: 1 }, NOW);
    expect(result.kept.map((item) => item.id).sort()).toEqual(['base', 'inc']);
    expect(result.expired).toEqual([]);
  });

  it('ein Katalog mit fehlender Basis wird als gebrochen gemeldet, statt still zu löschen', () => {
    const catalog = [entry('inc', NOW, 'gibt-es-nicht')];
    expect(() => applyVaultBackupRetention(catalog, { ...normalizeVaultBackupPolicy({ target }), retentionCount: 1 }, NOW))
      .toThrow('vault_backup_catalog_chain_broken');
  });

  it('nach Alter abgelaufene Einträge werden entfernt, die Anzahlgrenze greift zusätzlich', () => {
    const catalog = [entry('alt', NOW - 200 * 86_400_000), entry('neu', NOW)];
    const result = applyVaultBackupRetention(catalog, { ...normalizeVaultBackupPolicy({ target }), retentionCount: 10, retentionDays: 90 }, NOW);
    expect(result.kept.map((item) => item.id)).toEqual(['neu']);
    expect(result.expired.map((item) => item.id)).toEqual(['alt']);
  });
});

describe('Grenzen und Vorschau', () => {
  it('die Katalog- und Dokumentgrenzen sind gesetzt; unbrauchbare Werte fallen auf den Standard zurück', () => {
    expect(MAX_VAULT_BACKUP_DOCUMENTS).toBe(1024);
    expect(MAX_VAULT_BACKUP_CATALOG).toBe(256);
    expect(MAX_VAULT_BACKUP_BUNDLE_BYTES).toBe(96 * 1024 * 1024);
    /*
     * Gemessen, nicht angenommen: `normalizeVaultBackupPolicy` **klemmt nicht auf die Grenze**, sondern
     * verwirft einen Wert außerhalb [1, 256] und nimmt den Standard (10). Das ist eine bewusste
     * Entscheidung — eine Zahl, die der Nutzer nie gemeint haben kann, wird nicht stillschweigend in die
     * nächstliegende gültige Zahl verwandelt. mein erster Testlauf hat hier eine Klemmung erwartet und war
     * deshalb rot; die Erwartung war falsch, nicht der Code. Genau so ist das Verhalten jetzt festgehalten.
     */
    expect(normalizeVaultBackupPolicy({ retentionCount: 99_999 }).retentionCount).toBe(10);
    expect(normalizeVaultBackupPolicy({ retentionCount: 256 }).retentionCount).toBe(256);
    expect(normalizeVaultBackupPolicy({ retentionCount: 257 }).retentionCount).toBe(10);
    expect(normalizeVaultBackupPolicy({ retentionCount: 0 }).retentionCount).toBe(10);
    expect(normalizeVaultBackupPolicy({ retentionDays: 0 }).retentionDays).toBe(90);
    expect(normalizeVaultBackupPolicy({ retentionDays: 3650 }).retentionDays).toBe(3650);
    expect(normalizeVaultBackupPolicy({ retentionDays: 3651 }).retentionDays).toBe(90);
    // `verifyAfterWrite` ist nicht abschaltbar — der Typ lässt nur `true` zu, die Normalisierung erzwingt es.
    expect(normalizeVaultBackupPolicy({ verifyAfterWrite: false as never }).verifyAfterWrite).toBe(true);
  });

  it('die Vorschau validiert zuerst und nennt geänderte Dokumente und Tresor-Dateien', async () => {
    const bundle = await createVaultBackupBundle(
      [vaultDoc('vault-1', [{ id: 'vf-1', name: 'gehalt.pdf', sizeBytes: 42 }]), doc('d-1')],
      'vault-1', 'full', undefined, NOW,
    );
    const preview = await previewVaultBackupBundle(bundle);
    expect(preview.mode).toBe('full');
    expect(preview.changedDocuments.map((item) => item.id).sort()).toEqual(['d-1', 'vault-1']);
    expect(preview.totalWorkspaceDocuments).toBe(2);
    // `folderId` bleibt undefiniert, wenn die Quelldatei keins hat; die Vorschau erfindet keins.
    expect(preview.vaultFiles).toMatchObject([{ id: 'vf-1', name: 'gehalt.pdf', sizeBytes: 42 }]);
    expect(preview.vaultFiles[0]?.folderId).toBeUndefined();
  });

  it('der Zeitplan ist ohne Aktivierung nie fällig und respektiert die Stunde', () => {
    const schedule = { enabled: true, executor: 'local_agent' as const, cadence: 'daily' as const, hourLocal: 2 };
    const at = (hour: number) => new Date(2026, 0, 15, hour, 0, 0).getTime();
    expect(isVaultBackupScheduleDue(schedule, undefined, at(1))).toBe(false);
    expect(isVaultBackupScheduleDue(schedule, undefined, at(3))).toBe(true);
    expect(isVaultBackupScheduleDue({ ...schedule, enabled: false }, undefined, at(3))).toBe(false);
    // Zu kurz seit dem letzten Lauf: 20 Stunden Mindestabstand bei täglicher Ausführung.
    expect(isVaultBackupScheduleDue(schedule, at(3) - 3_600_000, at(3))).toBe(false);
    expect(isVaultBackupScheduleDue(schedule, at(3) - 21 * 3_600_000, at(3))).toBe(true);
  });

  it('ein WebDAV-Ziel ohne HTTPS oder mit Zugangsdaten in der URL wird abgelehnt', () => {
    expect(() => normalizeVaultBackupTarget({ id: 't', label: 'T', kind: 'nas_self_hosted', transport: 'webdav_https', endpointUrl: 'http://nas.example/', airGapped: false }))
      .toThrow('vault_backup_target_url_invalid');
    expect(() => normalizeVaultBackupTarget({ id: 't', label: 'T', kind: 'nas_self_hosted', transport: 'webdav_https', endpointUrl: 'https://user:pw@nas.example/', airGapped: false }))
      .toThrow('vault_backup_target_url_invalid');
    expect(() => normalizeVaultBackupTarget({ id: 't', label: 'T', kind: 'nas_self_hosted', transport: 'webdav_https', endpointUrl: 'https://nas.example/#frag', airGapped: false }))
      .toThrow('vault_backup_target_url_invalid');
    // Ein air-gapped Ziel darf nicht über das Netz gehen.
    expect(() => normalizeVaultBackupTarget({ id: 't', label: 'T', kind: 'nas_self_hosted', transport: 'webdav_https', endpointUrl: 'https://nas.example/', airGapped: true }))
      .toThrow('vault_backup_airgap_network_invalid');
  });
});

describe('Dateiauswahl-Wiederherstellung', () => {
  it('stellt genau die gewählten Dateien wieder her und legt benötigte Ordner an', async () => {
    const backupVault = doc('vault-1', {
      kind: 'Vault',
      vaultData: {
        files: [
          { id: 'vf-a', name: 'a.bin', sizeBytes: 1, folderId: 'folder-x' },
          { id: 'vf-b', name: 'b.bin', sizeBytes: 1, folderId: null },
        ],
        folders: [{ id: 'folder-x', name: 'X', parentId: null, createdAt: 1, modifiedAt: 1 }],
        spaces: [], shares: [], trash: [],
      },
    } as never);
    const bundle = await createVaultBackupBundle([backupVault], 'vault-1', 'full', undefined, NOW);
    const current = doc('vault-1', { kind: 'Vault', vaultData: { files: [], folders: [], spaces: [], shares: [], trash: [] } } as never);
    const restored = await restoreSelectedVaultFiles([bundle], current, ['vf-a'], NOW + 5);
    expect((restored.vaultData?.files ?? []).map((file) => file.id)).toEqual(['vf-a']);
    expect((restored.vaultData?.folders ?? []).map((folder) => folder.id)).toEqual(['folder-x']);
    expect(restored.version).toBe(current.version + 1);
  });

  it('eine leere Auswahl und eine unbekannte Datei werden abgelehnt', async () => {
    const bundle = await createVaultBackupBundle([vaultDoc('vault-1', [{ id: 'vf-a', name: 'a.bin', sizeBytes: 1 }])], 'vault-1', 'full', undefined, NOW);
    const current = vaultDoc('vault-1');
    await expect(restoreSelectedVaultFiles([bundle], current, [])).rejects.toThrow('vault_backup_file_selection_empty');
    await expect(restoreSelectedVaultFiles([bundle], current, ['gibt-es-nicht'])).rejects.toThrow('vault_backup_file_selection_missing');
  });
});
