// STATUS: PLATIN — der Zeuge für den kanonischen Speichern→Schließen→Wiederöffnen-Roundtrip.
//
// **Warum diese Datei existiert.** Die Vault-Abnahme hat **22** Zeilen der Schicht WOM/Persistenz genau
// **eine** Lücke zugeschrieben: „Prüfe Save→Close→Reopen auf identische Nutzdaten" ist nirgends
// ausgeführt (`AST-1128` und seine 21 Folgezeilen). Die Vorarbeit hat die Lücke **beschrieben**, nicht
// gemessen — und ob die Persistenz dabei **Daten verliert** oder nur **unbezeugt** ist, ist der
// Unterschied zwischen einem Datenverlust-P0 und einem fehlenden Zeugen.
//
// **Was hier ausgeführt wird** — der Laufzeitpfad, ohne DOM, ohne Ereignis, ohne Doppelgänger:
//   1. Schreiben:      `persistVaultSnapshotInWorkspaceDocument` (Produktion, `vaultPersistenceEngine.ts:78`)
//   2. Serialisieren:  `packLocalEncryptedContainer` (Produktion, `platform/containers/container.ts:72`)
//                      → echter VGT3-Container, AES-256-GCM mit einem portablen Kennwort
//   3. **Schließen:**  jeder Verweis auf das lebende Dokument fällt; übrig bleibt der Byte-Strom
//   4. Wiederöffnen:   `unpackLocalEncryptedContainer` (Produktion, `container.ts:158`)
//   5. Vergleichen:    **Nutzdaten-Gleichheit**, nicht „das Objekt existiert"
//
// Der Zeuge kann nicht grün werden, weil ein Entschlüsseler kaputt ist: ein **falsches** Kennwort muss
// abgelehnt werden (eigener Fall), und ein Fall mutiert die Nutzdaten **nach** dem Schließen — ein
// Wiederöffnen aus einem lebenden Verweis fliegt damit auf.
//
// **Die vier P0-Felder** haben je einen eigenen Fall, damit ein Verlust den Namen der Anforderung trägt:
//   `AST-1183` keyPolicy (und der Sitzungsausweis bleibt draußen), `AST-1188` backupPolicy/backupCatalog,
//   `AST-1198` status:'quarantined' + quarantineReason + quarantinedAt, `AST-1208` shareGrants.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { StoredVaultData } from '../../../../shared/contracts/vaultSpaces';
import { persistVaultSnapshotInWorkspaceDocument } from '../../../../shared/vault/persistence/vaultPersistenceEngine';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../../../platform/containers/container';
import { normalizeVaultKeyPolicy, vaultPolicyContainsPersistedSecret } from '../../../../shared/vault/security/vaultKeyPolicyEngine';
import { normalizeVaultBackupPolicy } from '../../../../shared/vault/backup/vaultBackupEngine';
import { normalizeVaultVersionRetention } from '../../../../shared/vault/history/vaultVersionHistoryEngine';
import { normalizeVaultTrashRetention } from '../../../../shared/vault/recovery/vaultRecoveryEngine';
import { normalizeVaultPeerSyncPolicy } from '../../../../shared/vault/sync/vaultPeerSyncEngine';
import { normalizeVaultSearchPolicy } from '../../../../shared/vault/search/vaultSearchEngine';
import { normalizeVaultStorageHealthState } from '../../../../shared/vault/diagnostics/vaultStorageHealthEngine';

const NOW = 1_765_000_000_000;
/** Portables Kennwort des Containers. Es darf **nirgends** im Byte-Strom auftauchen. */
const PORTABLE_PASSWORD = 'tresor-roundtrip-portables-kennwort-2026';

const CLEAN_FILE_ID = 'vfile-clean-1';
const CLEAN_FILE_NAME = 'angebotsentwurf-2026.pdf';
const QUARANTINED_FILE_ID = 'vfile-quarantined-1';
const QUARANTINED_FILE_NAME = 'rechnung-anhang.pdf.exe';
const QUARANTINE_REASON = 'executable_mz_header_with_pdf_extension';
const QUARANTINED_AT = NOW - 60_000;
const FOLDER_ID = 'vfolder-1';
const BACKUP_CATALOG_ID = 'vcatalog-1';
const SHARE_GRANT_ID = 'vgrant-1';
const SEARCH_CONTENT_MARKER = 'geheimtext-nur-im-container-4711';
const RECOVERY_SNAPSHOT_ID = 'vrecovery-1';

/** Ein gültiges `WorkspaceDocument` — vollständig gebaut, ohne Typbehauptung. */
function vaultDocument(): WorkspaceDocument {
  return {
    schema_version: 2,
    id: 'vault-roundtrip-witness',
    title: 'Tresor (Roundtrip-Zeuge)',
    kind: 'Vault',
    created_at: NOW - 1_000,
    modified_at: NOW,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
}

/** Die Datei, die **nicht** unter Quarantäne steht — die Gegenprobe zum Quarantäne-Fall. */
const CLEAN_FILE: StoredVaultData['files'][number] = {
  id: CLEAN_FILE_ID,
  name: CLEAN_FILE_NAME,
  kind: 'PdfStudio',
  sizeBytes: 24_576,
  encryptedHash: 'b3f1'.repeat(16),
  lastModified: NOW - 5_000,
  sourceType: 'attachment',
  mimeType: 'application/pdf',
  contentDigest: 'c0ffee'.repeat(10),
  digestAlgorithm: 'SHA-256',
  integrityState: 'verified',
  integrityVerifiedAt: NOW - 4_000,
  folderId: FOLDER_ID,
  tags: ['angebot', 'kunde-nord'],
  favorite: true,
  pinned: false,
  createdAt: NOW - 90_000,
  lastAccessedAt: NOW - 3_000,
  owner: 'lokaler-nutzer',
  classification: 'Internal',
  status: 'available',
  securityLabel: 'pdf',
  association: { action: 'preview', app: 'PdfStudio', source: 'mime' },
  properties: { abteilung: 'vertrieb' },
  spaceIds: ['space-1'],
};

/** `AST-1198` — der Quarantäne-Zustand trägt Grund und Zeitpunkt, nicht nur ein Etikett. */
const QUARANTINED_FILE: StoredVaultData['files'][number] = {
  id: QUARANTINED_FILE_ID,
  name: QUARANTINED_FILE_NAME,
  kind: 'PdfStudio',
  sizeBytes: 4_096,
  encryptedHash: 'a77e'.repeat(16),
  lastModified: QUARANTINED_AT,
  sourceType: 'attachment',
  mimeType: 'application/pdf',
  folderId: null,
  tags: ['verdacht'],
  status: 'quarantined',
  quarantineReason: QUARANTINE_REASON,
  quarantinedAt: QUARANTINED_AT,
  securityLabel: 'executable',
  association: { action: 'workspace', source: 'fallback' },
  properties: {},
  spaceIds: [],
};

/** `AST-1183` — die Schlüsselpolitik. **Kein** Geheimnis: nur Politik-Metadaten. */
const KEY_POLICY = normalizeVaultKeyPolicy({
  protectionMode: 'portable_password',
  autoLockMinutes: 30,
  keyGeneration: 7,
  lastRekeyAt: NOW - 600_000,
  hardwarePreference: 'available',
});

/** `AST-1188` — Sicherungsstrategie und Katalog. */
const BACKUP_POLICY = normalizeVaultBackupPolicy({
  mode: 'incremental',
  keyMode: 'independent_password',
  retentionCount: 9,
  retentionDays: 45,
  target: {
    id: 'vtarget-1',
    label: 'NAS im Keller',
    kind: 'nas_self_hosted',
    transport: 'filesystem_access',
    hostTargetRef: '//nas-keller/sicherungen',
    airGapped: false,
  },
  schedule: { enabled: true, executor: 'local_agent', cadence: 'weekly', hourLocal: 3, weekday: 2 },
});

const BACKUP_CATALOG: NonNullable<StoredVaultData['backupCatalog']> = [{
  id: BACKUP_CATALOG_ID,
  createdAt: NOW - 3_600_000,
  mode: 'incremental',
  baseBackupId: 'vcatalog-0',
  packageDigest: 'd00d'.repeat(16),
  packageBytes: 1_048_576,
  documentCount: 12,
  changedDocumentCount: 3,
  deletedDocumentIds: ['vdoc-geloescht-1'],
  documentDigests: [
    { documentId: 'vdoc-1', digest: '1111'.repeat(16), sizeBytes: 4_096 },
    { documentId: 'vdoc-2', digest: '2222'.repeat(16), sizeBytes: 8_192 },
  ],
  targetId: 'vtarget-1',
  targetKind: 'nas_self_hosted',
  targetLocator: '//nas-keller/sicherungen/2026-10-16',
  keyMode: 'independent_password',
  verifiedAt: NOW - 3_500_000,
  airGapped: false,
}];

/** `AST-1208` — Freigaben sind die Autoritätsquelle; sie müssen vollständig zurückkommen. */
const SHARE_GRANTS: NonNullable<StoredVaultData['shareGrants']> = [{
  id: SHARE_GRANT_ID,
  fileId: CLEAN_FILE_ID,
  delivery: 'encrypted_export',
  permissions: ['view', 'download'],
  createdAt: NOW - 7_200_000,
  recipientKey: 'empfaenger-schluessel-1',
  recipientFingerprint: 'f00d'.repeat(16),
  spaceId: 'space-1',
  serviceRef: 'dienst-referenz-1',
  expiresAt: NOW + 86_400_000,
  status: 'active',
  copyControl: 'controlled_future_access',
  packageDigest: 'feed'.repeat(16),
}];

/**
 * Die vollständigen Nutzdaten, wie der Laufzeitpfad sie an
 * `persistVaultSnapshotInWorkspaceDocument` übergibt: **alle 23 Felder**, jedes mit einer eigenen
 * Kennung. Ein leeres Feld wäre „das Objekt existiert" statt „die Nutzdaten sind gleich".
 */
function vaultPayload(): StoredVaultData {
  return {
    files: [CLEAN_FILE, QUARANTINED_FILE],
    folders: [{
      id: FOLDER_ID,
      name: 'Angebote',
      parentId: null,
      createdAt: NOW - 120_000,
      modifiedAt: NOW - 10_000,
      owner: 'lokaler-nutzer',
      classification: 'Internal',
    }],
    spaces: [{
      id: 'space-1',
      name: 'Nord-Team',
      description: 'Raum mit Kennung für den Roundtrip-Zeugen',
      role: 'Owner',
      permissions: ['vault.read', 'vault.share'],
      sharedFolders: [FOLDER_ID],
      securityLevel: 'Local Workspace',
      lastActivity: NOW - 20_000,
    }],
    spaceTemplates: [{
      id: 'blank',
      name: 'Leere Vorlage',
      description: 'Vorlage mit Kennung für den Roundtrip-Zeugen',
      scope: 'built_in',
      createdAt: NOW - 200_000,
      folders: [FOLDER_ID],
      pages: [{ title: 'Startseite', blocks: [], published: true }],
      libraryColumns: [],
      libraryViews: [],
      lists: [],
      linkedApps: [],
    }],
    // `shares` ist bewusst `unknown[]`: der Free-Laufzeitpfad hat **keinen** Schreiber dafür und muss
    // die Nutzlast deshalb wörtlich erhalten („Retain extension payloads exactly").
    shares: [{ id: 'vshare-1', kennung: 'freigabe-nutzlast-muss-woertlich-zurueckkommen', stufen: [1, 2, 3] }],
    trash: [{
      id: 'vtrash-1',
      deletedAt: NOW - 30_000,
      file: CLEAN_FILE,
      originalFolderId: FOLDER_ID,
    }],
    keyPolicy: KEY_POLICY,
    integrityAudits: [{
      id: 'vaudit-1',
      createdAt: NOW - 50_000,
      totalFiles: 2,
      verified: 1,
      mismatch: 1,
      unavailable: 0,
      entries: [
        { fileId: CLEAN_FILE_ID, name: CLEAN_FILE_NAME, state: 'verified', digest: 'c0ffee'.repeat(10) },
        { fileId: QUARANTINED_FILE_ID, name: QUARANTINED_FILE_NAME, state: 'mismatch', reason: 'digest_abweichung' },
      ],
    }],
    versions: [{
      id: 'vversion-1',
      fileId: CLEAN_FILE_ID,
      createdAt: NOW - 40_000,
      source: 'named',
      label: 'Vor der Freigabe',
      originalName: CLEAN_FILE_NAME,
      mimeType: 'application/pdf',
      sizeBytes: 20_480,
      snapshotBytes: 27_306,
      contentDigest: 'beef'.repeat(16),
      snapshotKind: 'attachment',
      payloadDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
      workspaceDocumentVersion: 4,
      protectedHold: true,
    }],
    versionRetention: normalizeVaultVersionRetention({ maxVersionsPerFile: 12, maxAgeDays: 90 }),
    trashRetention: normalizeVaultTrashRetention({ maxAgeDays: 21 }),
    recoverySnapshots: [{
      id: RECOVERY_SNAPSHOT_ID,
      createdAt: NOW - 25_000,
      label: 'Wiederherstellungspunkt mit Kennung',
      integrityVersion: 2,
      files: [CLEAN_FILE],
      folders: [],
      trash: [],
      documents: [{
        documentId: 'vdoc-1',
        documentKind: 'Writer',
        snapshotJson: '{"id":"vdoc-1"}',
        contentDigest: 'abcd'.repeat(16),
        snapshotBytes: 21,
      }],
      snapshotBytes: 33_000,
      contentDigest: 'cafe'.repeat(16),
    }],
    backupPolicy: BACKUP_POLICY,
    backupCatalog: BACKUP_CATALOG,
    peerSyncPolicy: normalizeVaultPeerSyncPolicy({
      enabled: true,
      selectedFolderIds: [FOLDER_ID],
      selectedFileIds: [CLEAN_FILE_ID],
      ignorePatterns: ['*.tmp'],
      bandwidthLimitKibPerSec: 4_096,
      lanDiscoveryEnabled: true,
      relayEnabled: false,
    }),
    peerDevices: [{
      id: 'vpeer-1',
      label: 'Zweites Gerät',
      publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'kennung-x', y: 'kennung-y' },
      publicKeyFingerprint: '1234'.repeat(16),
      pairedAt: NOW - 800_000,
      lastSeenAt: NOW - 900,
      trusted: true,
      allowedTransports: ['lan'],
    }],
    peerResume: [{
      sessionId: 'vsession-1',
      fileId: CLEAN_FILE_ID,
      peerId: 'vpeer-1',
      acknowledgedBlockIndexes: [0, 1, 2],
      transferredBytes: 196_608,
      updatedAt: NOW - 700,
    }],
    peerSyncAudit: [{
      id: 'vpeeraudit-1',
      at: NOW - 600,
      peerId: 'vpeer-1',
      direction: 'send',
      fileId: CLEAN_FILE_ID,
      outcome: 'ok',
      detail: 'Blockübertragung mit Kennung',
    }],
    searchPolicy: normalizeVaultSearchPolicy({
      contentIndexingEnabled: true,
      ocrIndexingEnabled: false,
      excludedFileIds: ['vfile-ausgeschlossen-1'],
      excludedFolderIds: ['vfolder-ausgeschlossen-1'],
    }),
    searchIndex: {
      version: 1,
      builtAt: NOW - 500,
      protection: 'vault_container_aead',
      entries: [{
        fileId: CLEAN_FILE_ID,
        indexedAt: NOW - 400,
        name: CLEAN_FILE_NAME,
        mimeType: 'application/pdf',
        kind: 'PdfStudio',
        modifiedAt: NOW - 5_000,
        owner: 'lokaler-nutzer',
        tags: ['angebot'],
        properties: { abteilung: 'vertrieb' },
        spaceIds: ['space-1'],
        folderId: FOLDER_ID,
        contentText: SEARCH_CONTENT_MARKER,
        ocrText: '',
        privacyExcluded: false,
        sourceDigest: 'c0ffee'.repeat(10),
        documentVersion: 4,
      }],
    },
    shareGrants: SHARE_GRANTS,
    shareAudit: [{
      id: 'vshareaudit-1',
      at: NOW - 300,
      shareId: SHARE_GRANT_ID,
      fileId: CLEAN_FILE_ID,
      action: 'created',
      detail: 'Freigabe mit Kennung angelegt',
    }],
    storageHealth: normalizeVaultStorageHealthState({
      migrationVersion: 3,
      readOnlyRecoveryMode: false,
      lastHealthScanAt: NOW - 200,
      lastTransactionCleanupAt: NOW - 100,
    }),
  };
}

/** Die Feldnamen, die ein Wiederöffnen tragen muss — als Liste, damit ein Verlust benannt wird. */
const VAULT_DATA_FIELDS: ReadonlyArray<keyof StoredVaultData> = [
  'files', 'folders', 'spaces', 'spaceTemplates', 'shares', 'trash', 'keyPolicy', 'integrityAudits',
  'versions', 'versionRetention', 'trashRetention', 'recoverySnapshots', 'backupPolicy', 'backupCatalog',
  'peerSyncPolicy', 'peerDevices', 'peerResume', 'peerSyncAudit', 'searchPolicy', 'searchIndex',
  'shareGrants', 'shareAudit', 'storageHealth',
];

interface ClosedVault {
  /** Der Byte-Strom ist nach dem Schließen **alles**, was übrig bleibt. */
  readonly container: Uint8Array;
  readonly versionAtSave: number;
}

/**
 * Stufen 1–3 des Laufzeitpfads. Der Rückgabewert trägt **nur** den Byte-Strom — das lebende Dokument
 * und die Nutzdaten werden hier fallen gelassen.
 */
async function saveAndClose(data: StoredVaultData): Promise<ClosedVault> {
  let live: WorkspaceDocument | null = vaultDocument();
  live = persistVaultSnapshotInWorkspaceDocument(live, data, NOW);
  const container = await packLocalEncryptedContainer(live, { password: PORTABLE_PASSWORD });
  const versionAtSave = live.version;
  live = null;
  return { container, versionAtSave };
}

/** Stufe 4: frisch aus dem Byte-Strom, ohne jeden Verweis auf den Schreiblauf. */
async function reopen(closed: ClosedVault): Promise<WorkspaceDocument> {
  return unpackLocalEncryptedContainer(closed.container, { password: PORTABLE_PASSWORD });
}

/** Byte-Suche im Container — für die Zusicherung „kein Klartext im verschlüsselten Strom". */
function containsBytes(haystack: Uint8Array, needle: string): boolean {
  const target = new TextEncoder().encode(needle);
  if (target.byteLength === 0 || target.byteLength > haystack.byteLength) return false;
  outer: for (let start = 0; start <= haystack.byteLength - target.byteLength; start += 1) {
    for (let offset = 0; offset < target.byteLength; offset += 1) {
      if (haystack[start + offset] !== target[offset]) continue outer;
    }
    return true;
  }
  return false;
}

describe('Runde 1: der Roundtrip ist nicht-trivial — sonst wäre ein grünes Ergebnis eine Nullmessung', () => {
  it('die Nutzdaten tragen alle Felder und jedes Feld trägt eine eigene Kennung', async () => {
    const payload = vaultPayload();
    // Die Liste muss die Nutzlast vollständig beschreiben, sonst prüft der Zeuge weniger als er behauptet.
    expect(VAULT_DATA_FIELDS.length).toBe(23);
    expect(Object.keys(payload).length).toBe(VAULT_DATA_FIELDS.length);
    for (const field of VAULT_DATA_FIELDS) expect(payload[field], field).toBeDefined();
    // Und der Container ist wirklich entstanden: VGT3-Kopf, nicht leer.
    const closed = await saveAndClose(payload);
    expect(closed.container.byteLength).toBeGreaterThan(1024);
    expect(new TextDecoder().decode(closed.container.subarray(0, 4))).toBe('VGT3');
    expect(closed.versionAtSave).toBe(2);
  });

  it('ohne das richtige Kennwort gibt es **kein** Dokument — der Zeuge kann nicht durch einen kaputten Entschlüsseler grün werden', async () => {
    const closed = await saveAndClose(vaultPayload());
    await expect(unpackLocalEncryptedContainer(closed.container, { password: 'falsches-kennwort-2026' }))
      .rejects.toThrow(/invalid password/u);
  });
});

describe('Der kanonische Roundtrip: Schreiben → Serialisieren → Schließen → Wiederöffnen', () => {
  it('**identische Nutzdaten** über alle 23 Felder — nicht „das Objekt existiert"', async () => {
    const payload = vaultPayload();
    const closed = await saveAndClose(payload);
    const reopened = await reopen(closed);
    const back = reopened.vaultData;
    expect(back, 'das wiederöffnete Dokument trägt keine Vault-Nutzdaten').toBeDefined();
    if (!back) throw new Error('vault_data_missing_after_reopen');
    for (const field of VAULT_DATA_FIELDS) {
      expect(back[field], `Feld ${field} fehlt nach dem Wiederöffnen`).toBeDefined();
    }
    expect(back).toEqual(payload);
    expect(reopened.version).toBe(closed.versionAtSave);
    expect(reopened.kind).toBe('Vault');
  });

  it('das Wiederöffnen liest die Bytes, nicht einen lebenden Verweis', async () => {
    const payload = vaultPayload();
    const closed = await saveAndClose(payload);
    // **Nach** dem Schließen mutiert: käme das Ergebnis aus dem lebenden Objekt, stünde hier die Mutation.
    payload.files[0].name = 'nach-dem-schliessen-mutiert.pdf';
    payload.keyPolicy = normalizeVaultKeyPolicy({ protectionMode: 'device' });
    const reopened = await reopen(closed);
    expect(reopened.vaultData?.files[0].name).toBe(CLEAN_FILE_NAME);
    expect(reopened.vaultData?.keyPolicy?.protectionMode).toBe('portable_password');
  });

  it('der Klartext liegt nicht im Byte-Strom — weder Dateiname, noch Suchinhalt, noch Kennwort', async () => {
    const closed = await saveAndClose(vaultPayload());
    expect(containsBytes(closed.container, CLEAN_FILE_NAME)).toBe(false);
    expect(containsBytes(closed.container, SEARCH_CONTENT_MARKER)).toBe(false);
    expect(containsBytes(closed.container, PORTABLE_PASSWORD)).toBe(false);
    // Nicht-Trivialität der Suche selbst: derselbe Sucher findet eine Kennung, die **im Strom** liegt.
    expect(containsBytes(closed.container, 'VGT3')).toBe(true);
  });
});

describe('AST-1183 — die Schlüsselpolitik kommt zurück, der Sitzungsausweis bleibt draußen', () => {
  it('die Politik überlebt mit allen Reglern', async () => {
    const reopened = await reopen(await saveAndClose(vaultPayload()));
    const policy = reopened.vaultData?.keyPolicy;
    expect(policy).toEqual(KEY_POLICY);
    expect(normalizeVaultKeyPolicy(policy)).toEqual(KEY_POLICY);
    expect(policy?.protectionMode).toBe('portable_password');
    expect(policy?.autoLockMinutes).toBe(30);
    expect(policy?.keyGeneration).toBe(7);
    expect(policy?.lastRekeyAt).toBe(NOW - 600_000);
  });

  it('die Politik trägt kein Geheimnis — der Sitzungsausweis ist Sitzungszustand, kein Dokumentfeld', async () => {
    const closed = await saveAndClose(vaultPayload());
    const reopened = await reopen(closed);
    const policy = reopened.vaultData?.keyPolicy;
    expect(policy).toBeDefined();
    if (!policy) throw new Error('key_policy_missing_after_reopen');
    expect(vaultPolicyContainsPersistedSecret(policy)).toBe(false);
    // Weder das Kennwort des Containers noch ein `pin`/`password`-Feld dürfen im Dokument stehen.
    expect(JSON.stringify(reopened)).not.toContain(PORTABLE_PASSWORD);
    expect(JSON.stringify(policy)).not.toMatch(/"(?:pin|password|private_?key|secret|raw_?key)"\s*:/iu);
  });
});

describe('AST-1188 — Sicherungsstrategie und Sicherungskatalog kommen zurück', () => {
  it('die Strategie überlebt samt Ziel und Zeitplan', async () => {
    const reopened = await reopen(await saveAndClose(vaultPayload()));
    expect(reopened.vaultData?.backupPolicy).toEqual(BACKUP_POLICY);
    expect(reopened.vaultData?.backupPolicy?.target?.hostTargetRef).toBe('//nas-keller/sicherungen');
    expect(reopened.vaultData?.backupPolicy?.schedule?.weekday).toBe(2);
    expect(normalizeVaultBackupPolicy(reopened.vaultData?.backupPolicy)).toEqual(BACKUP_POLICY);
  });

  it('der Katalog überlebt als Autoritätsquelle der Wiederherstellung', async () => {
    const reopened = await reopen(await saveAndClose(vaultPayload()));
    expect(reopened.vaultData?.backupCatalog).toEqual(BACKUP_CATALOG);
    expect(reopened.vaultData?.backupCatalog?.[0].deletedDocumentIds).toEqual(['vdoc-geloescht-1']);
    expect(reopened.vaultData?.backupCatalog?.[0].documentDigests).toHaveLength(2);
  });
});

describe("AST-1198 — der Quarantäne-Zustand kommt zurück, mit Grund und Zeitpunkt", () => {
  it('status, quarantineReason und quarantinedAt überleben', async () => {
    const reopened = await reopen(await saveAndClose(vaultPayload()));
    const quarantined = reopened.vaultData?.files.find((file) => file.id === QUARANTINED_FILE_ID);
    expect(quarantined, 'die unter Quarantäne gestellte Datei fehlt nach dem Wiederöffnen').toBeDefined();
    expect(quarantined?.status).toBe('quarantined');
    expect(quarantined?.quarantineReason).toBe(QUARANTINE_REASON);
    expect(quarantined?.quarantinedAt).toBe(QUARANTINED_AT);
    // Die Gegenprobe: die saubere Datei wird **nicht** mit-quarantäniert.
    const clean = reopened.vaultData?.files.find((file) => file.id === CLEAN_FILE_ID);
    expect(clean?.status).toBe('available');
    expect(clean?.quarantineReason).toBeUndefined();
  });
});

describe('AST-1208 — Freigaben kommen als Autoritätsquelle vollständig zurück', () => {
  it('die Freigaben überleben mit Rechten, Kopierkontrolle und Widerrufszustand', async () => {
    const reopened = await reopen(await saveAndClose(vaultPayload()));
    expect(reopened.vaultData?.shareGrants).toEqual(SHARE_GRANTS);
    const grant = reopened.vaultData?.shareGrants?.[0];
    expect(grant?.permissions).toEqual(['view', 'download']);
    expect(grant?.status).toBe('active');
    expect(grant?.copyControl).toBe('controlled_future_access');
    expect(grant?.recipientFingerprint).toBe('f00d'.repeat(16));
    expect(grant?.expiresAt).toBe(NOW + 86_400_000);
  });
});

describe('Der kanonische Speichervorgang lässt keine Schattenkopie stehen', () => {
  it('der alte Zweitspeicher `objects.vault_gaiacom_payload` wird beim Speichern entfernt', () => {
    const withShadow: WorkspaceDocument = {
      ...vaultDocument(),
      objects: {
        vault_gaiacom_payload: {
          type: 'ExtensionObject',
          data: { id: 'vault_gaiacom_payload', namespace: 'astraea.vault', family: 'legacy-payload', payload: { files: [] } },
        },
      },
    };
    const written = persistVaultSnapshotInWorkspaceDocument(withShadow, vaultPayload(), NOW);
    expect('vault_gaiacom_payload' in written.objects).toBe(false);
    expect(written.version).toBe(withShadow.version + 1);
    expect(written.vaultData?.files).toHaveLength(2);
  });
});
