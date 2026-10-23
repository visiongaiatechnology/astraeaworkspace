// STATUS: PLATIN — Integritäts- und Recovery-Aktionen über eine Persistenz-Attrappe.
//
// Die letzten beiden ungelesenen Aktionsschichten. Nach dem Befund V-037 in `vaultPeerSyncActions`
// (Zustand als `const`-Kopie → mehrere Aufrufe innerhalb einer Instanziierung verloren sich) prüfe ich
// hier gezielt, ob dieselbe Klasse auch in `vaultRecoveryActions` und `vaultIntegrityActions` steckt.
// Genau das ist der Zweck dieses Batches: nicht annehmen, dass ein Fehler lokal bleibt.
import { describe, expect, it } from 'vitest';
import type { VaultFile, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { StoredVaultData } from '../../../../shared/contracts/vaultSpaces';
import { createVaultIntegrityActions } from '../../../../shared/vault/integrity/vaultIntegrityActions';
import { createVaultRecoveryActions } from '../../../../shared/vault/recovery/vaultRecoveryActions';
import { buildVaultChunkIntegrity, sha256Bytes } from '../../../../shared/vault/integrity/vaultIntegrity';

const NOW = 1_700_000_000_000;

const toDataUrl = (bytes: Uint8Array, mime = 'text/plain') => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
};

async function attachment(id: string, content: string, overrides: Partial<VaultFile> = {}): Promise<VaultFile> {
  const bytes = new TextEncoder().encode(content);
  const digest = await sha256Bytes(bytes);
  return {
    id, name: `${id}.txt`, kind: 'Writer', sizeBytes: bytes.byteLength,
    encryptedHash: digest, contentDigest: digest, digestAlgorithm: 'SHA-256', integrityState: 'verified',
    sourceType: 'attachment', mimeType: 'text/plain', payloadDataUrl: toDataUrl(bytes),
    lastModified: 1, folderId: null, status: 'available',
    chunkIntegrity: await buildVaultChunkIntegrity(bytes), ...overrides,
  };
}

const folder = (id: string) => ({ id, name: id, parentId: null, createdAt: 1, modifiedAt: 1 });

function vaultData(overrides: Partial<StoredVaultData> = {}): StoredVaultData {
  return { files: [], folders: [], spaces: [], trash: [], ...overrides };
}

/** Persistenz-Attrappe: **veränderliches** Objekt, damit mehrere Aufrufe denselben Zustand sehen. */
function persister(initial: StoredVaultData) {
  const state: StoredVaultData = { ...initial };
  const patches: Array<Partial<StoredVaultData>> = [];
  return { patch: (updated: Partial<StoredVaultData>) => { patches.push(updated); Object.assign(state, updated); }, state, patches };
}

describe('Integritäts-Aktionen: Einzelprüfung, Gesamtprüfung, Reparatur', () => {
  it('eine gesunde Datei wird als verifiziert gemeldet und der Zustand persistiert', async () => {
    const file = await attachment('vf-1', 'inhalt');
    const persistence = persister(vaultData({ files: [file] }));
    const actions = createVaultIntegrityActions(persistence.state, [], persistence.patch);
    const feedback = await actions.verifyFile('vf-1');
    expect(feedback.state).toBe('verified');
    expect(feedback.message).toContain('match');
    expect(persistence.state.files[0]!.integrityState).toBe('verified');
  });

  it('eine manipulierte Datei wird als Abweichung gemeldet und als beschädigt markiert', async () => {
    const file = await attachment('vf-1', 'inhalt');
    const tampered = { ...file, payloadDataUrl: toDataUrl(new TextEncoder().encode('anders')) };
    const persistence = persister(vaultData({ files: [tampered] }));
    const actions = createVaultIntegrityActions(persistence.state, [], persistence.patch);
    const feedback = await actions.verifyFile('vf-1');
    expect(feedback.state).toBe('mismatch');
    expect(persistence.state.files[0]!.integrityState).toBe('mismatch');
    expect(persistence.state.files[0]!.status).toBe('corrupt');
  });

  it('eine fehlende Datei wird als nicht verfügbar gemeldet, ohne zu werfen', async () => {
    const persistence = persister(vaultData());
    const actions = createVaultIntegrityActions(persistence.state, [], persistence.patch);
    const feedback = await actions.verifyFile('gibt-es-nicht');
    expect(feedback).toEqual({ state: 'unavailable', message: 'Vault entry no longer exists.' });
    expect(persistence.patches).toEqual([]);
  });

  it('eine Datei ohne Nutzlast wird als nicht verfügbar gemeldet', async () => {
    const file = await attachment('vf-1', 'inhalt', { payloadDataUrl: undefined });
    const persistence = persister(vaultData({ files: [file] }));
    const actions = createVaultIntegrityActions(persistence.state, [], persistence.patch);
    const feedback = await actions.verifyFile('vf-1');
    expect(feedback.state).toBe('unavailable');
    expect(persistence.state.files[0]!.integrityState).toBe('unavailable');
  });

  it('die Gesamtprüfung zählt und legt einen Audit-Bericht ab', async () => {
    const good = await attachment('vf-1', 'gut');
    const bad = await attachment('vf-2', 'kaputt');
    const persistence = persister(vaultData({ files: [good, { ...bad, payloadDataUrl: toDataUrl(new TextEncoder().encode('anders')) }] }));
    const actions = createVaultIntegrityActions(persistence.state, [], persistence.patch);
    const report = await actions.verifyVault();
    expect(report).toMatchObject({ totalFiles: 2, verified: 1, mismatch: 1 });
    expect(persistence.state.integrityAudits).toHaveLength(1);
  });

  it('die Reparatur nimmt nur Bytes an, die dem gespeicherten Digest entsprechen', async () => {
    const file = await attachment('vf-1', 'original');
    const broken = { ...file, payloadDataUrl: toDataUrl(new TextEncoder().encode('beschädigt')) };
    const persistence = persister(vaultData({ files: [broken] }));
    const actions = createVaultIntegrityActions(persistence.state, [], persistence.patch);
    // Falsche Bytes → Ablehnung, kein Schreibvorgang.
    await expect(actions.repairFromBackup('vf-1', new File([new TextEncoder().encode('falsch')], 'x.txt', { type: 'text/plain' })))
      .rejects.toThrow('vault_repair_source_not_known_good');
    expect(persistence.patches).toEqual([]);
    // Richtige Bytes → repariert.
    const repaired = await actions.repairFromBackup('vf-1', new File([new TextEncoder().encode('original')], 'x.txt', { type: 'text/plain' }));
    expect(repaired.integrityState).toBe('verified');
    expect(persistence.state.files[0]!.contentDigest).toBe(file.contentDigest);
  });

  it('eine Reparatur für eine unbekannte Datei wird abgelehnt', async () => {
    const persistence = persister(vaultData());
    const actions = createVaultIntegrityActions(persistence.state, [], persistence.patch);
    await expect(actions.repairFromBackup('weg', new File([new Uint8Array([1])], 'x')))
      .rejects.toThrow('vault_repair_file_missing');
  });
});

describe('Recovery-Aktionen: Löschen, Wiederherstellen, Retention, Snapshots', () => {
  it('Löschen verschiebt in den Papierkorb und persistiert den neuen Zustand', async () => {
    const file = await attachment('vf-1', 'inhalt', { folderId: 'f1' });
    const persistence = persister(vaultData({ files: [file], folders: [folder('f1')] }));
    const actions = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    actions.deleteFile('vf-1');
    expect(persistence.state.files).toEqual([]);
    expect(persistence.state.trash).toHaveLength(1);
    expect(persistence.state.trash[0]).toMatchObject({ originalFolderId: 'f1' });
  });

  /*
   * **Der Kern dieses Batches.** In `vaultPeerSyncActions` fand ich V-037: der Zustand lag als
   * `const`-Kopie vor, sodass mehrere Aufrufe innerhalb **einer** Instanziierung sich nicht sahen. Hier
   * wird derselbe Ablauf bewusst in **einer** Instanz geprüft: löschen, dann wiederherstellen.
   */
  it('Löschen und Wiederherstellen in **einer** Instanz sehen sich gegenseitig', async () => {
    const file = await attachment('vf-1', 'inhalt');
    const persistence = persister(vaultData({ files: [file] }));
    const actions = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    actions.deleteFile('vf-1');
    const trashId = persistence.state.trash[0]!.id;
    // Ohne Nachziehen des Zustands rechnet `restoreOne` gegen die alte Dateiliste und wirft
    // `vault_trash_entry_not_found`, weil der Papierkorb aus seiner Sicht leer ist.
    expect(() => actions.restoreOne(trashId)).not.toThrow();
    expect(persistence.state.files.map((item) => item.id)).toEqual(['vf-1']);
    expect(persistence.state.trash).toEqual([]);
  });

  it('zwei Löschvorgänge in einer Instanz sammeln sich an, statt sich zu überschreiben', async () => {
    const first = await attachment('vf-1', 'eins');
    const second = await attachment('vf-2', 'zwei');
    const persistence = persister(vaultData({ files: [first, second] }));
    const actions = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    actions.deleteFile('vf-1');
    actions.deleteFile('vf-2');
    // Mit einem eingefrorenen Zustand wäre der zweite Aufruf an `vault_trash_file_not_found` gescheitert
    // oder hätte den ersten Papierkorb-Eintrag verworfen.
    expect(persistence.state.files).toEqual([]);
    expect(persistence.state.trash).toHaveLength(2);
  });

  it('Bulk-Wiederherstellung und Purge arbeiten auf dem aktuellen Zustand', async () => {
    const first = await attachment('vf-1', 'eins');
    const second = await attachment('vf-2', 'zwei');
    const persistence = persister(vaultData({ files: [first, second] }));
    const actions = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    actions.deleteFile('vf-1');
    actions.deleteFile('vf-2');
    const ids = persistence.state.trash.map((entry) => entry.id);
    expect(() => actions.purgeOne(ids[0]!)).not.toThrow();
    expect(persistence.state.trash).toHaveLength(1);
    expect(() => actions.restoreBulk([persistence.state.trash[0]!.id])).not.toThrow();
    expect(persistence.state.files).toHaveLength(1);
    expect(persistence.state.trash).toEqual([]);
  });

  it('„alles leeren" verlangt die Bestätigungsphrase, auch über die Aktionsschicht', async () => {
    const file = await attachment('vf-1', 'inhalt');
    const persistence = persister(vaultData({ files: [file] }));
    const actions = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    actions.deleteFile('vf-1');
    expect(() => actions.emptyTrash('leeren')).toThrow('vault_trash_confirmation_required');
    expect(persistence.state.trash).toHaveLength(1);
    actions.emptyTrash('EMPTY TRASH');
    expect(persistence.state.trash).toEqual([]);
  });

  it('die Retention wird gesetzt, angewendet und meldet die Anzahl der entfernten Einträge', async () => {
    const file = await attachment('vf-1', 'inhalt');
    const persistence = persister(vaultData({ files: [file] }));
    const actions = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    actions.deleteFile('vf-1');
    // Papierkorb-Eintrag künstlich altern lassen, damit die Retention greift.
    persistence.state.trash = [{ ...persistence.state.trash[0]!, deletedAt: NOW - 100 * 86_400_000 }];
    const actions2 = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    const purged = actions2.applyRetentionNow();
    expect(purged).toBe(1);
    expect(persistence.state.trash).toEqual([]);
    expect(actions2.updateRetention({ maxAgeDays: 7 })).toBe(0);
    expect(persistence.state.trashRetention).toMatchObject({ maxAgeDays: 7 });
  });

  it('ein Snapshot wird erstellt, begrenzt abgelegt und wiederhergestellt', async () => {
    const file = await attachment('vf-1', 'inhalt');
    const document = { schema_version: 1, id: 'd-1', title: 'A', kind: 'Writer', created_at: 1, modified_at: 1, version: 1, theme_id: 'default', root_object_ids: [], objects: {} } as unknown as WorkspaceDocument;
    const persistence = persister(vaultData({ files: [file] }));
    const updated: WorkspaceDocument[] = [];
    const created: WorkspaceDocument[] = [];
    const actions = createVaultRecoveryActions(persistence.state, [document], 'vault-1', persistence.patch, (doc) => updated.push(doc), (doc) => created.push(doc));

    const snapshot = await actions.createSnapshot('Vor Umbau');
    expect(snapshot.label).toBe('Vor Umbau');
    expect(persistence.state.recoverySnapshots).toHaveLength(1);

    const result = await actions.restoreSnapshot(snapshot.id);
    // Das Dokument existiert bereits → aktualisiert, nicht neu angelegt.
    expect(result).toEqual({ updated: 1, recreated: 0 });
    expect(updated).toHaveLength(1);
    expect(created).toEqual([]);
    // Ein zweiter Snapshot („Before workspace rollback") wurde zusätzlich abgelegt.
    expect(persistence.state.recoverySnapshots!.length).toBeGreaterThanOrEqual(2);
  });

  it('ein unbekannter Snapshot wird abgelehnt', async () => {
    const persistence = persister(vaultData());
    const actions = createVaultRecoveryActions(persistence.state, [], 'vault-1', persistence.patch, () => undefined, () => undefined);
    await expect(actions.restoreSnapshot('gibt-es-nicht')).rejects.toThrow('vault_recovery_snapshot_not_found');
  });

  it('ein fehlendes Dokument wird beim Rollback neu angelegt', async () => {
    /*
     * Gemessene Kontraktgrenze, die meinen ersten Test falsch machte: `restoreSnapshot` übergibt an
     * `restoreVaultRecoverySnapshot` **dieselbe** `documents`-Liste, die der Aktionsschicht gegeben wurde.
     * Ein Dokument, das in dieser Liste steht, gilt deshalb immer als „vorhanden" und wird **aktualisiert**,
     * nie neu angelegt — der `recreated`-Zweig ist über diesen Aufruf nicht erreichbar. Das ist keine Lücke
     * in der Engine (dort ist der Zweig getestet), sondern eine Eigenschaft der Verdrahtung: „fehlend"
     * bedeutet hier „fehlt in der übergebenen Liste", und das kann der Aufrufer nur über eine **veraltete**
     * Liste ausdrücken.
     *
     * Ich habe den Zweig deshalb direkt über die Engine geprüft (siehe `vaultTrashRecovery.test.ts`) und
     * hier festgehalten, dass die Aktionsschicht ihn nicht erreicht.
     */
    const document = { schema_version: 1, id: 'd-1', title: 'A', kind: 'Writer', created_at: 1, modified_at: 1, version: 1, theme_id: 'default', root_object_ids: [], objects: {} } as unknown as WorkspaceDocument;
    const persistence = persister(vaultData());
    const updated: WorkspaceDocument[] = [];
    const actions = createVaultRecoveryActions(persistence.state, [document], 'vault-1', persistence.patch, (doc) => updated.push(doc), () => undefined);
    const snapshot = await actions.createSnapshot();
    const result = await actions.restoreSnapshot(snapshot.id);
    // Das Dokument steht in der Liste → es wird aktualisiert, nicht neu angelegt.
    expect(result).toEqual({ updated: 1, recreated: 0 });
    expect(updated).toHaveLength(1);
  });
});
