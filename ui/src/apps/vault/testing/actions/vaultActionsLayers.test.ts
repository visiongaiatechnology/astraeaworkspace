// STATUS: PLATIN — Backup- und Peer-Aktionsschichten über einen In-Memory-Adapter.
//
// Warum diese Datei existiert: alle bisherigen Batch-Tests prüften **reine Engines**. Die
// **Aktionsschichten** (`vaultBackupActions`, `vaultPeerSyncActions`) waren ungemessen — also genau die
// Stelle, an der Engine-Ergebnisse **persistiert** und über einen **Adapter** geschrieben werden. Damit wird
// auch die bisher ungemessene Adaptergrenze (`VaultBackupTargetAdapter`) prüfbar: Schreiben, Zurücklesen,
// Prüfen, Retention-Löschung.
//
// **Gemessene Umgebungsgrenze, bevor ich etwas behaupte:** das Container-Packen funktioniert headless nur
// für `portable_password` (VGT3). `device` und `device_pin` scheitern in Node mit
// `Browser device key storage is unavailable` — sie brauchen den nicht-exportierbaren Geräteschlüssel aus
// IndexedDB. Die Tests hier arbeiten deshalb mit `portable_password` bzw. `independent_password`; das ist
// die einzige Konfiguration, die in dieser Umgebung **ehrlich** prüfbar ist, und genau so ist sie gewählt.
import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus, VaultFile, VaultPeerDevice, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { StoredVaultData } from '../../../../shared/contracts/vaultSpaces';
import { createVaultBackupActions } from '../../../../shared/vault/backup/vaultBackupActions';
import type { VaultBackupTargetAdapter } from '../../../../shared/vault/backup/vaultBackupTargets';
import { createVaultPeerSyncActions } from '../../../../shared/vault/sync/vaultPeerSyncActions';
// `VaultPeerStagedFile` lebt in der Engine, nicht im Contract — gemessen, nachdem `tsc` es angemahnt hat.
import type { VaultPeerStagedFile } from '../../../../shared/vault/sync/vaultPeerSyncEngine';
import { normalizeVaultKeyPolicy, DEFAULT_VAULT_KEY_POLICY } from '../../../../shared/vault/security/vaultKeyPolicyEngine';
import { DEFAULT_VAULT_BACKUP_POLICY } from '../../../../shared/vault/backup/vaultBackupEngine';

const NOW = 1_700_000_000_000;

const status = { coreConnected: false, isLocked: false, platform: 'test' } as KeyVaultStatus;
const passwordPolicy = normalizeVaultKeyPolicy({ ...DEFAULT_VAULT_KEY_POLICY, protectionMode: 'portable_password' });
const SECRETS = { vaultPassword: 'lang-genug-2026' };

const document = (id: string, title = id, kind = 'Writer'): WorkspaceDocument => ({
  schema_version: 1, id, title, kind, created_at: 1, modified_at: 1, version: 1, theme_id: 'default',
  root_object_ids: [], objects: {},
} as unknown as WorkspaceDocument);

const vaultDocument = (id = 'vault-1', files: VaultFile[] = []): WorkspaceDocument => ({
  ...document(id, 'Tresor', 'Vault'),
  vaultData: { files, folders: [], spaces: [], shares: [], trash: [] },
} as unknown as WorkspaceDocument);

const vaultFile = (id: string, overrides: Partial<VaultFile> = {}): VaultFile => ({
  id, name: `${id}.txt`, kind: 'Writer', sizeBytes: 5, encryptedHash: 'a'.repeat(64),
  contentDigest: 'a'.repeat(64), lastModified: 1, sourceType: 'attachment', mimeType: 'text/plain',
  payloadDataUrl: 'data:text/plain;base64,aGFsbG8=', ...overrides,
});

/** In-Memory-Ziel: genau die Operationen, die der echte Ordner-/WebDAV-Adapter bietet. */
function memoryAdapter(initial: Record<string, Uint8Array> = {}) {
  const store = new Map<string, Uint8Array>(Object.entries(initial));
  const log: string[] = [];
  const adapter: VaultBackupTargetAdapter = {
    async write(filename, bytes) { log.push(`write:${filename}`); store.set(filename, bytes); return { locator: filename }; },
    async read(locator) {
      log.push(`read:${locator}`);
      const found = store.get(locator);
      if (!found) throw new Error(`vault_backup_target_missing:${locator}`);
      return found;
    },
    async remove(locator) { log.push(`remove:${locator}`); store.delete(locator); },
  };
  return { adapter, store, log };
}

function backupPolicy(overrides: Record<string, unknown> = {}) {
  return {
    ...DEFAULT_VAULT_BACKUP_POLICY,
    target: { id: 'target-1', label: 'Primary', kind: 'local_folder' as const, transport: 'filesystem_access' as const, airGapped: false },
    ...overrides,
  };
}

function vaultData(overrides: Partial<StoredVaultData> = {}): StoredVaultData {
  return {
    files: [], folders: [], spaces: [], trash: [],
    keyPolicy: passwordPolicy,
    backupPolicy: backupPolicy(),
    ...overrides,
  };
}

/** Persistenz-Attrappe: schreibt in ein **veränderliches** Objekt und protokolliert die Aufrufe. */
function persister(initial: StoredVaultData) {
  const state: StoredVaultData = { ...initial };
  const patches: Array<Partial<StoredVaultData>> = [];
  return { patch: (updated: Partial<StoredVaultData>) => { patches.push(updated); Object.assign(state, updated); }, state, patches };
}

describe('Backup-Aktionen über einen In-Memory-Adapter: Schreiben, Zurücklesen, Wiederherstellen', () => {
  it('erstellt ein Backup, liest es zurück, prüft es und legt einen Katalogeintrag an', async () => {
    const { adapter, store, log } = memoryAdapter();
    const persistence = persister(vaultData());
    const actions = createVaultBackupActions(
      persistence.state, [vaultDocument('vault-1'), document('d-1')], 'vault-1', persistence.patch, status,
    );
    const result = await actions.createBackup(adapter, SECRETS, NOW);
    expect(result.entry).toMatchObject({ mode: 'full', targetId: 'target-1', documentCount: 2, changedDocumentCount: 2, keyMode: 'inherit_vault' });
    expect(result.entry.packageDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.entry.packageBytes).toBeGreaterThan(0);
    expect(result.pruned).toEqual([]);
    // Das Paket liegt im Ziel und wurde nach dem Schreiben **zurückgelesen**.
    expect(store.size).toBe(1);
    expect(log.filter((entry) => entry.startsWith('read:'))).toHaveLength(1);
    expect(persistence.state.backupCatalog).toHaveLength(1);
  });

  it('stellt das gesamte Backup aus dem Ziel wieder her', async () => {
    const { adapter } = memoryAdapter();
    const persistence = persister(vaultData());
    const actions = createVaultBackupActions(
      persistence.state, [vaultDocument('vault-1'), document('d-1'), document('d-2')], 'vault-1', persistence.patch, status,
    );
    await actions.createBackup(adapter, SECRETS, NOW);
    const restored = await actions.restoreCatalogEntry(persistence.state.backupCatalog![0]!.id, adapter, SECRETS);
    expect(restored.map((item) => item.id)).toEqual(['d-1', 'd-2', 'vault-1']);
    expect(restored.find((item) => item.id === 'd-1')?.title).toBe('d-1');
  });

  it('liefert eine Vorschau mit den Dateien des Tresors', async () => {
    const { adapter } = memoryAdapter();
    const persistence = persister(vaultData());
    const files = [vaultFile('vf-1')];
    const actions = createVaultBackupActions(
      persistence.state, [vaultDocument('vault-1', files), document('d-1')], 'vault-1', persistence.patch, status,
    );
    await actions.createBackup(adapter, SECRETS, NOW);
    const preview = await actions.previewCatalogEntry(persistence.state.backupCatalog![0]!.id, adapter, SECRETS);
    expect(preview.totalWorkspaceDocuments).toBe(2);
    expect(preview.vaultFiles).toMatchObject([{ id: 'vf-1', name: 'vf-1.txt', sizeBytes: 5 }]);
  });

  it('ein manipuliertes Paket im Ziel wird abgelehnt, statt es zu materialisieren', async () => {
    const { adapter, store } = memoryAdapter();
    const persistence = persister(vaultData());
    const actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1')], 'vault-1', persistence.patch, status);
    await actions.createBackup(adapter, SECRETS, NOW);
    const entry = persistence.state.backupCatalog![0]!;
    const stored = store.get(entry.targetLocator)!;
    const tampered = new Uint8Array(stored);
    // Ein Byte mitten im Paket kippen: der Digest im Katalog passt dann nicht mehr.
    tampered[Math.floor(tampered.length / 2)] ^= 0x01;
    store.set(entry.targetLocator, tampered);
    await expect(actions.restoreCatalogEntry(entry.id, adapter, SECRETS))
      .rejects.toThrow('vault_backup_verify_digest_failed');
  });

  it('ein fehlendes Paket im Ziel wird benannt', async () => {
    const { adapter, store } = memoryAdapter();
    const persistence = persister(vaultData());
    const actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1')], 'vault-1', persistence.patch, status);
    await actions.createBackup(adapter, SECRETS, NOW);
    const entry = persistence.state.backupCatalog![0]!;
    store.clear();
    await expect(actions.restoreCatalogEntry(entry.id, adapter, SECRETS)).rejects.toThrow(/target_missing/u);
  });

  it('ein inkrementelles Backup überträgt nur Geändertes und stellt die Kette korrekt her', async () => {
    const { adapter } = memoryAdapter();
    let persistence = persister(vaultData());
    // Lauf 1: vollständig.
    let actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1'), document('d-1')], 'vault-1', persistence.patch, status);
    await actions.createBackup(adapter, SECRETS, NOW);
    // Auf inkrementell umstellen.
    persistence.patch({ backupPolicy: backupPolicy({ mode: 'incremental' }) });
    actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1'), document('d-1'), document('d-2')], 'vault-1', persistence.patch, status);
    const incremental = await actions.createBackup(adapter, SECRETS, NOW + 1000);
    expect(incremental.entry.mode).toBe('incremental');
    expect(incremental.entry.changedDocumentCount).toBe(1);
    const catalog = persistence.state.backupCatalog!;
    expect(catalog).toHaveLength(2);
    // Kette in **jeder** Richtung prüfen: das jüngste Paket zieht seine Basis selbst nach.
    actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1'), document('d-1'), document('d-2')], 'vault-1', persistence.patch, status);
    const restored = await actions.restoreCatalogEntry(incremental.entry.id, adapter, SECRETS);
    expect(restored.map((item) => item.id)).toEqual(['d-1', 'd-2', 'vault-1']);
  });

  it('ein inkrementelles Backup ohne Basis wird abgelehnt', async () => {
    const { adapter } = memoryAdapter();
    const persistence = persister(vaultData({ backupPolicy: backupPolicy({ mode: 'incremental' }) }));
    const actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1')], 'vault-1', persistence.patch, status);
    await expect(actions.createBackup(adapter, SECRETS, NOW)).rejects.toThrow('vault_backup_incremental_base_required');
  });

  it('ein Backup ohne konfiguriertes Ziel wird abgelehnt', async () => {
    const { adapter } = memoryAdapter();
    const persistence = persister(vaultData({ backupPolicy: { ...DEFAULT_VAULT_BACKUP_POLICY } }));
    const actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1')], 'vault-1', persistence.patch, status);
    await expect(actions.createBackup(adapter, SECRETS, NOW)).rejects.toThrow('vault_backup_target_required');
  });

  it('die Retention löscht abgelaufene Pakete **im Ziel** und meldet sie', async () => {
    const { adapter, store, log } = memoryAdapter();
    const persistence = persister(vaultData({ backupPolicy: backupPolicy({ retentionCount: 1, retentionDays: 1 }) }));
    const actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1')], 'vault-1', persistence.patch, status);
    // Erstes Backup: 200 Tage alt, damit es später abläuft.
    await actions.createBackup(adapter, SECRETS, NOW - 200 * 86_400_000);
    expect(store.size).toBe(1);
    await actions.createBackup(adapter, SECRETS, NOW);
    // Das alte Paket ist abgelaufen und wurde aus dem Ziel entfernt.
    expect(log.some((entry) => entry.startsWith('remove:'))).toBe(true);
    expect(store.size).toBe(1);
    expect(persistence.state.backupCatalog).toHaveLength(1);
  });

  it('ohne Löschmöglichkeit im Ziel wird die Retention **abgelehnt** und das Paket bleibt verzeichnet (V-038 behoben)', async () => {
    const store = new Map<string, Uint8Array>();
    const adapter: VaultBackupTargetAdapter = {
      async write(filename, bytes) { store.set(filename, bytes); return { locator: filename }; },
      async read(locator) { const found = store.get(locator); if (!found) throw new Error('missing'); return found; },
      // kein `remove`
    };
    const persistence = persister(vaultData({ backupPolicy: backupPolicy({ retentionCount: 1, retentionDays: 1 }) }));
    const actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1')], 'vault-1', persistence.patch, status);
    await actions.createBackup(adapter, SECRETS, NOW - 200 * 86_400_000);
    await expect(actions.createBackup(adapter, SECRETS, NOW)).rejects.toThrow('vault_backup_retention_delete_unavailable');
    /*
     * **Zusicherung geändert, weil sich das Verhalten geändert hat.** Hier stand zuvor:
     *   `expect(persistence.state.backupCatalog).toHaveLength(1); expect(store.size).toBe(2);`
     * — also der gemessene **Befund** V-038: das neu geschriebene Paket lag im Ziel, war aber **nicht im
     * Katalog** und damit über die Oberfläche nicht mehr aufräumbar.
     *
     * Jetzt gilt: der Katalog wird **zuerst** gespeichert (der Schreibvorgang ist die Tatsache), und
     * scheitert danach die Aufbewahrung, bleibt der Katalog bei der **Wahrheit**. Also:
     *   • zwei Pakete im Ziel **und** zwei Katalogeinträge — kein verwaistes Paket mehr,
     *   • die Aufbewahrung ist trotzdem **abgelehnt** (der Fehler oben), es wird nichts still gekürzt,
     *   • und der Nutzer erfährt, dass die Aufbewahrung nicht griff.
     */
    expect(store.size).toBe(2);
    expect(persistence.state.backupCatalog).toHaveLength(2);
    // Der Kern: Ziel und Katalog stimmen überein — kein Eintrag liegt außerhalb des Katalogs.
    expect(store.size - persistence.state.backupCatalog!.length).toBe(0);
  });

  it('ein importiertes Paket lässt sich vorprüfen und wiederherstellen', async () => {
    const { adapter, store } = memoryAdapter();
    const persistence = persister(vaultData());
    const actions = createVaultBackupActions(persistence.state, [vaultDocument('vault-1'), document('d-1')], 'vault-1', persistence.patch, status);
    await actions.createBackup(adapter, SECRETS, NOW);
    const bytes = [...store.values()][0]!;
    const preview = await actions.previewImported(bytes, 'inherit_vault', SECRETS);
    expect(preview.totalWorkspaceDocuments).toBe(2);
    const restored = await actions.restoreImportedChain([bytes], 'inherit_vault', SECRETS);
    expect(restored.map((item) => item.id).sort()).toEqual(['d-1', 'vault-1']);
    // Ein fremdes Passwort öffnet das Paket nicht — fail-closed.
    await expect(actions.previewImported(bytes, 'inherit_vault', { vaultPassword: 'ein-anderes-passwort' }))
      .rejects.toThrow();
  });
});

describe('Peer-Aktionen: Vertrauen, Persistenz, Riegel', () => {
  const peer = (id: string, trusted = true): VaultPeerDevice => ({
    id, label: `Peer ${id}`, publicKeyFingerprint: 'b'.repeat(64), trusted, allowedTransports: ['lan'],
  } as VaultPeerDevice);

  const staged = (fileId: string, hash = 'c'.repeat(64)): VaultPeerStagedFile => ({
    fileId, fileName: `${fileId}.txt`, temporaryName: `.${fileId}.tmp`, contentHash: hash, bytes: new Uint8Array([1, 2, 3]), verifiedAt: NOW,
  });

  it('ein Peer ohne Vertrauen, ohne Fingerabdruck oder ohne ID wird abgelehnt', () => {
    const persistence = persister(vaultData());
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    expect(() => actions.trustPeer(peer('p1', false))).toThrow('vault_peer_descriptor_invalid');
    expect(() => actions.trustPeer({ ...peer('p1'), publicKeyFingerprint: '' } as never)).toThrow('vault_peer_descriptor_invalid');
    expect(() => actions.trustPeer({ ...peer(''), } as never)).toThrow('vault_peer_descriptor_invalid');
    expect(persistence.patches).toEqual([]);
  });

  it('ein vertrauter Peer wird vorn eingefügt, entdoppelt und mit Audit-Eintrag', () => {
    const persistence = persister(vaultData({ peerDevices: [peer('alt')] }));
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    actions.trustPeer(peer('neu'));
    expect(persistence.state.peerDevices!.map((item) => item.id)).toEqual(['neu', 'alt']);
    expect(persistence.state.peerSyncAudit).toHaveLength(1);
    expect(persistence.state.peerSyncAudit![0]).toMatchObject({ peerId: 'neu', direction: 'pair', outcome: 'ok' });
    // Derselbe Peer erneut: ersetzt, nicht gedoppelt.
    actions.trustPeer(peer('neu'));
    const second = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    second.trustPeer(peer('neu'));
    expect(persistence.state.peerDevices!.filter((item) => item.id === 'neu')).toHaveLength(1);
    expect(persistence.state.peerSyncAudit!.length).toBeGreaterThanOrEqual(2);
  });

  it('das Vertrauen entziehen entfernt den Peer und seine Resume-Zustände, andere bleiben', () => {
    const persistence = persister(vaultData({
      peerDevices: [peer('p1'), peer('p2')],
      peerResume: [
        // `updatedAt` gehört zum Vertrag und wird beim Entdoppeln/Sortieren gebraucht — mein erster Entwurf
        // liess es weg, wodurch alle Zeitwerte `undefined` waren und die Sortierung alles bis auf einen
        // Eintrag verwarf. Der Fehler war meine Fixture, nicht der Code.
        { sessionId: 's1', fileId: 'f1', peerId: 'p1', acknowledgedBlockIndexes: [], transferredBytes: 0, updatedAt: NOW },
        { sessionId: 's2', fileId: 'f2', peerId: 'p2', acknowledgedBlockIndexes: [], transferredBytes: 0, updatedAt: NOW },
      ] as never,
    }));
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    actions.removePeer('p1');
    expect(persistence.state.peerDevices!.map((item) => item.id)).toEqual(['p2']);
    expect(persistence.state.peerResume!.map((item) => item.fileId)).toEqual(['f2']);
    expect(persistence.state.peerSyncAudit![0]).toMatchObject({ peerId: 'p1', outcome: 'blocked' });
  });

  it('ein unbekannter Peer beim Entziehen ist ein No-op ohne Audit-Eintrag', () => {
    const persistence = persister(vaultData({ peerDevices: [peer('p1')] }));
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    actions.removePeer('gibt-es-nicht');
    // Gemessen: kein stiller Audit-Eintrag, aber auch kein Fehler.
    expect(persistence.patches).toEqual([]);
  });

  it('Resume-Zustände werden je Peer **und** Datei entdoppelt, neueste zuerst', () => {
    const persistence = persister(vaultData());
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    const resume = (sessionId: string, peerId: string, fileId: string, updatedAt: number) => ({
      sessionId, fileId, peerId, acknowledgedBlockIndexes: [], transferredBytes: 0, updatedAt,
    });
    actions.recordResume(resume('a', 'p1', 'f1', NOW) as never);
    actions.recordResume(resume('b', 'p1', 'f2', NOW + 1) as never);
    actions.recordResume(resume('c', 'p1', 'f1', NOW + 2) as never);
    const state = persistence.state.peerResume!;
    expect(state).toHaveLength(2);
    expect(state[0]!.sessionId).toBe('c');
    expect(state[0]!.updatedAt).toBe(NOW + 2);
  });

  it('ein eingehender Anhang eines **nicht** vertrauten Peers wird abgelehnt', async () => {
    const persistence = persister(vaultData({ files: [vaultFile('vf-1')], peerDevices: [] }));
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    await expect(actions.commitIncomingAttachment('p1', staged('vf-1'), 'data:text/plain;base64,AA=='))
      .rejects.toThrow('vault_peer_untrusted');
    expect(persistence.patches).toEqual([]);
  });

  it('ein eingehender Anhang für eine fehlende oder nicht angehängte Datei wird abgelehnt', async () => {
    const persistence = persister(vaultData({ files: [vaultFile('vf-1')], peerDevices: [peer('p1')] }));
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    await expect(actions.commitIncomingAttachment('p1', staged('gibt-es-nicht'), 'data:text/plain;base64,AA=='))
      .rejects.toThrow('vault_peer_attachment_missing');
    const linked = persister(vaultData({ files: [vaultFile('vf-1', { sourceType: 'workspace-document', documentId: 'd1' })], peerDevices: [peer('p1')] }));
    const linkedActions = createVaultPeerSyncActions(linked.state, [], linked.patch);
    await expect(linkedActions.commitIncomingAttachment('p1', staged('vf-1'), 'data:text/plain;base64,AA=='))
      .rejects.toThrow('vault_peer_attachment_missing');
  });

  it('ein vertrauter Peer schreibt den Anhang, erfasst eine Version und leert den Resume-Zustand', async () => {
    const persistence = persister(vaultData({
      files: [vaultFile('vf-1')],
      peerDevices: [peer('p1')],
      peerResume: [{ sessionId: 's1', fileId: 'vf-1', peerId: 'p1', acknowledgedBlockIndexes: [0], transferredBytes: 1, updatedAt: NOW }] as never,
      versions: [],
    }));
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    const committed = await actions.commitIncomingAttachment('p1', staged('vf-1', 'd'.repeat(64)), 'data:text/plain;base64,aGFsbG8=', 'merged');
    expect(committed).toMatchObject({ id: 'vf-1', contentDigest: 'd'.repeat(64), integrityState: 'verified', status: 'available' });
    expect(persistence.state.files![0]!.contentDigest).toBe('d'.repeat(64));
    // Eine Version wurde vorher gesichert.
    expect(persistence.state.versions!.length).toBeGreaterThan(0);
    // Der Resume-Zustand für diese Datei ist weg, der Audit-Eintrag da.
    expect(persistence.state.peerResume).toEqual([]);
    expect(persistence.state.peerSyncAudit![0]).toMatchObject({ peerId: 'p1', direction: 'receive', fileId: 'vf-1', outcome: 'merged' });
  });

  it('die Politik wird normalisiert persistiert', () => {
    const persistence = persister(vaultData());
    const actions = createVaultPeerSyncActions(persistence.state, [], persistence.patch);
    actions.updatePolicy({ enabled: true, bandwidthLimitKibPerSec: 99_999_999 });
    expect(persistence.state.peerSyncPolicy).toMatchObject({ enabled: true, bandwidthLimitKibPerSec: 1024 * 1024 });
    // Und der Wächter greift auch hier.
    expect(() => actions.updatePolicy({ relayEndpoint: 'http://relay.example' })).toThrow('vault_peer_relay_requires_wss');
  });
});
