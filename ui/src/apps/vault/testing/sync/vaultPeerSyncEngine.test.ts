// STATUS: PLATIN — Peer-Sync: Pairing, Delta-Plan, Staging, Transport, Konflikte.
//
// `vaultPeerSyncEngine.ts` ist mit 475 Zeilen der **größte** Vault-Engine-Teil und hatte **keinen** Test.
// Er ist außerdem der einzige Vault-Teil, der das Gerät verlässt (Netzwerk, Peers, Relay) — Fehler hier
// kosten nicht nur Daten, sondern Vertraulichkeit.
//
// **Gemessen, bevor ich etwas behauptet habe:** `crypto.subtle` ist in dieser Node-Umgebung **verfügbar**
// (`node -e` → `subtle: object`, `generateKey: function`). Deshalb ist das Pairing — ECDH P-256, JWK,
// Ableitung des Bestätigungscodes — **headless prüfbar** und wird hier geprüft. Der einzige Vault-Pfad, der
// in dieser Umgebung weiterhin nicht läuft, ist der **nicht-exportierbare Signierfall** des Selbsttests
// (`NON_EXTRACTABLE_SIGNING`, bleibt `NOT_TESTED`).
import { describe, expect, it } from 'vitest';
import type { VaultFile, VaultFolder, VaultPeerResumeState } from '../../../../shared/contracts/workspace';
import {
  assertOnlineOnlyPlaceholderPolicy,
  assertVaultPeerTransportAllowed,
  atomicCommitVaultPeerAttachment,
  buildVaultPeerFileManifest,
  createVaultPairingContext,
  DEFAULT_VAULT_PEER_SYNC_POLICY,
  discoverVaultLanPeers,
  finalizeVaultPairing,
  normalizeVaultPeerSyncPolicy,
  peerSyncTransferAllowanceBytes,
  planVaultPeerDelta,
  previewVaultPairing,
  resolveVaultPeerCaseCollision,
  resolveVaultPeerConflict,
  selectVaultPeerTransferBatch,
  shouldVaultPeerSyncFile,
  stageVaultPeerIncomingFile,
  updateVaultPeerResumeState,
} from '../../../../shared/vault/sync/vaultPeerSyncEngine';

const NOW = Date.now();

const file = (id: string, overrides: Partial<VaultFile> = {}): VaultFile => ({
  id, name: `${id}.txt`, kind: 'Writer', sizeBytes: 10, encryptedHash: 'a'.repeat(64),
  lastModified: 1, folderId: null, status: 'available', ...overrides,
});

const folder = (id: string, name = id): VaultFolder => ({ id, name, parentId: null, createdAt: 1, modifiedAt: 1 });

const bytes = (text: string) => new TextEncoder().encode(text);

describe('Politik: Grenzen, Relay, Online-Only', () => {
  it('der Standard ist aus, ohne Auswahl, ohne Netz', () => {
    expect(DEFAULT_VAULT_PEER_SYNC_POLICY).toMatchObject({
      version: 1, enabled: false, selectedFileIds: [], selectedFolderIds: [], ignorePatterns: [],
      bandwidthLimitKibPerSec: 0, lanDiscoveryEnabled: false, relayEnabled: false,
      conflictStrategy: 'three_way_text_else_conflict_copy',
      onlineOnlyPlaceholders: { enabled: false, requiresRobustOsIntegration: true },
    });
  });

  it('Online-Only-Platzhalter werden abgelehnt, weil die OS-Integration fehlt', () => {
    /*
     * `enabled` ist im Vertrag als Literal `false` typisiert (`onlineOnlyPlaceholders: { enabled: false; … }`).
     * Ein direktes `{ enabled: true }` im Test wäre deshalb ein Typfehler — und genau das ist der Punkt: der
     * Vertrag lässt „an" gar nicht zu. Der Test baut die Eingabe deshalb über eine Umgehung, damit der
     * **Laufzeit**-Wächter geprüft wird statt nur der Typ.
     */
    const forbidden = { onlineOnlyPlaceholders: { enabled: true, requiresRobustOsIntegration: true } } as unknown as Partial<import('../../../../shared/contracts/workspace').VaultPeerSyncPolicy>;
    expect(() => normalizeVaultPeerSyncPolicy(forbidden)).toThrow('vault_peer_online_only_requires_robust_os_integration');
    expect(() => assertOnlineOnlyPlaceholderPolicy(forbidden)).toThrow('vault_peer_online_only_requires_robust_os_integration');
    // Und die Normalisierung erzwingt „aus", auch wenn niemand den Wächter aufruft.
    expect(normalizeVaultPeerSyncPolicy({ onlineOnlyPlaceholders: { enabled: false, requiresRobustOsIntegration: true } }).onlineOnlyPlaceholders.enabled).toBe(false);
  });

  it('Auswahllisten werden bereinigt, entdoppelt und begrenzt', () => {
    const policy = normalizeVaultPeerSyncPolicy({ selectedFileIds: [' a ', 'a', '', 5 as never, 'b'] });
    expect(policy.selectedFileIds).toEqual(['a', 'b']);
    expect(normalizeVaultPeerSyncPolicy({ selectedFileIds: Array.from({ length: 9000 }, (_, index) => `f${index}`) }).selectedFileIds).toHaveLength(4096);
  });

  it('Ignorier-Muster werden bereinigt und je Muster begrenzt', () => {
    const policy = normalizeVaultPeerSyncPolicy({ ignorePatterns: [' *.tmp ', '*.tmp', '', 'x'.repeat(500)] });
    expect(policy.ignorePatterns).toHaveLength(2);
    expect(policy.ignorePatterns[1]).toHaveLength(160);
    expect(normalizeVaultPeerSyncPolicy({ ignorePatterns: Array.from({ length: 200 }, (_, index) => `p${index}`) }).ignorePatterns).toHaveLength(64);
  });

  it('die Bandbreitengrenze wird geklemmt, unbrauchbare Werte werden 0', () => {
    expect(normalizeVaultPeerSyncPolicy({ bandwidthLimitKibPerSec: -5 }).bandwidthLimitKibPerSec).toBe(0);
    expect(normalizeVaultPeerSyncPolicy({ bandwidthLimitKibPerSec: 99_999_999 }).bandwidthLimitKibPerSec).toBe(1024 * 1024);
    expect(normalizeVaultPeerSyncPolicy({ bandwidthLimitKibPerSec: Number.NaN }).bandwidthLimitKibPerSec).toBe(0);
    expect(normalizeVaultPeerSyncPolicy({ bandwidthLimitKibPerSec: 12.7 }).bandwidthLimitKibPerSec).toBe(12);
  });

  it('ein Relay-Endpunkt muss wss sein', () => {
    expect(normalizeVaultPeerSyncPolicy({ relayEndpoint: 'wss://relay.example/vault' }).relayEndpoint).toBe('wss://relay.example/vault');
    expect(() => normalizeVaultPeerSyncPolicy({ relayEndpoint: 'https://relay.example' })).toThrow('vault_peer_relay_requires_wss');
    expect(() => normalizeVaultPeerSyncPolicy({ relayEndpoint: 'ws://relay.example' })).toThrow('vault_peer_relay_requires_wss');
    // Gemessen: ein reiner Whitespace-Endpunkt wird zu einem **leeren String**, nicht zu undefined.
    expect(normalizeVaultPeerSyncPolicy({ relayEndpoint: '   ' }).relayEndpoint).toBe('');
  });
});

describe('Pairing: ECDH ist headless messbar', () => {
  it('beide Seiten leiten denselben Bestätigungscode ab — sonst wäre der Vergleich wertlos', async () => {
    const a = await createVaultPairingContext('Gerät A');
    const b = await createVaultPairingContext('Gerät B');
    const fromA = await previewVaultPairing(a, b.offer);
    const fromB = await previewVaultPairing(b, a.offer);
    expect(fromA.verificationCode).toBe(fromB.verificationCode);
    expect(fromA.verificationCode).toMatch(/^[0-9A-F]{8}$/u);
    expect(fromA.sharedSecretDigest).toBe(fromB.sharedSecretDigest);
    expect(fromA.sharedSecretDigest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('ein falscher Bestätigungscode verhindert die Paarung, ein Code in Kleinschreibung genügt', async () => {
    const a = await createVaultPairingContext('A');
    const b = await createVaultPairingContext('B');
    const result = await previewVaultPairing(a, b.offer);
    await expect(finalizeVaultPairing(a, b.offer, 'DEADBEEF')).rejects.toThrow('vault_peer_pairing_verification_mismatch');
    // Gemessen: der Vergleich ist gross-/kleinschreibungsunabhängig und trimmt.
    await expect(finalizeVaultPairing(a, b.offer, `  ${result.verificationCode.toLowerCase()}  `)).resolves.toMatchObject({ verificationCode: result.verificationCode });
  });

  it('der Peer trägt Fingerabdruck, Vertrauen und erlaubte Transporte', async () => {
    const a = await createVaultPairingContext('A');
    const b = await createVaultPairingContext('Langes Gerät');
    const result = await previewVaultPairing(a, b.offer);
    expect(result.peer).toMatchObject({ id: b.offer.deviceId, label: 'Langes Gerät', trusted: true, allowedTransports: ['lan', 'relay'] });
    expect(result.peer.publicKeyFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.peer.pairedAt).toBeLessThanOrEqual(Date.now());
  });

  it('das eigene Gerät, ein unbekanntes Format und ein abgelaufenes Angebot werden abgelehnt', async () => {
    const a = await createVaultPairingContext('A');
    const b = await createVaultPairingContext('B');
    await expect(previewVaultPairing(a, a.offer)).rejects.toThrow('vault_peer_pairing_offer_invalid');
    await expect(previewVaultPairing(a, { ...b.offer, version: 2 as never })).rejects.toThrow('vault_peer_pairing_offer_invalid');
    await expect(previewVaultPairing(a, { ...b.offer, nonce: 'zu-kurz' })).rejects.toThrow('vault_peer_pairing_nonce_invalid');
    await expect(previewVaultPairing(a, { ...b.offer, createdAt: NOW - 11 * 60 * 1000 })).rejects.toThrow('vault_peer_pairing_offer_expired');
    // Genau an der Grenze (10 Minuten) ist das Angebot noch gültig.
    await expect(previewVaultPairing(a, { ...b.offer, createdAt: Date.now() - 9 * 60 * 1000 })).resolves.toBeTruthy();
  });

  it('ein fremder oder unvollständiger öffentlicher Schlüssel wird abgelehnt, bevor abgeleitet wird', async () => {
    const a = await createVaultPairingContext('A');
    const b = await createVaultPairingContext('B');
    await expect(previewVaultPairing(a, { ...b.offer, publicKeyJwk: { kty: 'RSA' } as never })).rejects.toThrow('vault_peer_pairing_public_key_invalid');
    await expect(previewVaultPairing(a, { ...b.offer, publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'a', y: 'b' } as never })).rejects.toThrow('vault_peer_pairing_public_key_invalid');
  });

  it('ein leeres Gerätelabel bekommt einen Ersatznamen statt eines leeren Feldes', async () => {
    const context = await createVaultPairingContext('   ');
    expect(context.offer.label).toBe('Astraea Device');
    expect(context.offer.nonce).toMatch(/^[0-9a-f]{32}$/u);
    expect(context.offer.deviceId).toMatch(/^peer_[0-9a-f]{32}$/u);
  });
});

describe('Manifest und Delta-Plan', () => {
  const content = () => new Uint8Array(200 * 1024).map((_, index) => index % 251);

  it('ein Manifest beschreibt Blöcke, Grösse und Inhaltsdigest', async () => {
    const manifest = await buildVaultPeerFileManifest(file('a'), content(), { 'peer-1': 3 }, 64 * 1024);
    expect(manifest).toMatchObject({ version: 1, fileId: 'a', fileName: 'a.txt', sizeBytes: 200 * 1024, blockSize: 64 * 1024 });
    expect(manifest.blocks).toHaveLength(4);
    expect(manifest.blocks.map((block) => block.offset)).toEqual([0, 65536, 131072, 196608]);
    expect(manifest.blocks[3]?.sizeBytes).toBe(200 * 1024 - 196608);
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.vectorClock).toEqual({ 'peer-1': 3 });
  });

  it('unbrauchbare Blockgrössen werden in die Grenzen gezogen', async () => {
    expect((await buildVaultPeerFileManifest(file('a'), bytes('x'), {}, 1)).blockSize).toBe(16 * 1024);
    expect((await buildVaultPeerFileManifest(file('a'), bytes('x'), {}, 99 * 1024 * 1024)).blockSize).toBe(1024 * 1024);
  });

  it('eine zu grosse Datei und zu viele Blöcke werden abgelehnt', async () => {
    await expect(buildVaultPeerFileManifest(file('a'), new Uint8Array(256 * 1024 * 1024 + 1))).rejects.toThrow('vault_peer_file_too_large');
    // 8192 Blöcke à 16 KiB sind 128 MiB; 8193 Blöcke überschreiten die Grenze.
    await expect(buildVaultPeerFileManifest(file('a'), new Uint8Array(8193 * 16 * 1024), {}, 16 * 1024)).rejects.toThrow('vault_peer_block_count_exceeded');
  });

  it('eine leere Datei ergibt genau einen Block — kein Sonderfall mit null Blöcken', async () => {
    const manifest = await buildVaultPeerFileManifest(file('a'), new Uint8Array(0));
    expect(manifest.blocks).toHaveLength(1);
    expect(manifest.blocks[0]).toMatchObject({ index: 0, offset: 0, sizeBytes: 0 });
  });

  it('das Delta überträgt nur fehlende Blöcke', async () => {
    const full = await buildVaultPeerFileManifest(file('a'), content(), {}, 64 * 1024);
    // Lokal sind die ersten beiden Blöcke identisch, die letzten beiden nicht.
    const local = { ...full, blocks: full.blocks.map((block, index) => index < 2 ? block : { ...block, hash: 'f'.repeat(64) }), contentHash: 'f'.repeat(64) };
    const plan = planVaultPeerDelta(local, full);
    expect(plan.neededBlockIndexes).toEqual([2, 3]);
    expect(plan.transferBytes).toBe(full.blocks[2]!.sizeBytes + full.blocks[3]!.sizeBytes);
    expect(plan.completeWithoutTransfer).toBe(false);
  });

  it('ohne lokale Kopie werden alle Blöcke gebraucht', async () => {
    const remote = await buildVaultPeerFileManifest(file('a'), bytes('hallo welt'), {}, 16 * 1024);
    const plan = planVaultPeerDelta(undefined, remote);
    expect(plan.neededBlockIndexes).toEqual([0]);
    expect(plan.completeWithoutTransfer).toBe(false);
  });

  it('identische Inhalte brauchen keinen Transfer', async () => {
    const manifest = await buildVaultPeerFileManifest(file('a'), bytes('gleich'), {}, 16 * 1024);
    // Gleiche Blockgrösse erzwingen: das Manifest der „lokalen" Seite entsteht aus denselben Bytes.
    const local = await buildVaultPeerFileManifest(file('a'), bytes('gleich'), {}, 16 * 1024);
    const plan = planVaultPeerDelta(local, manifest);
    expect(plan.neededBlockIndexes).toEqual([]);
    expect(plan.skippedResumeIndexes).toEqual([]);
    expect(plan.completeWithoutTransfer).toBe(true);
  });

  it('ein Resume-Zustand überspringt bereits bestätigte Blöcke und benennt sie', async () => {
    const remote = await buildVaultPeerFileManifest(file('a'), content(), {}, 64 * 1024);
    const resume: VaultPeerResumeState = {
      sessionId: 's1', fileId: 'a', peerId: 'peer-1', acknowledgedBlockIndexes: [0, 1], transferredBytes: 0, updatedAt: NOW,
    };
    const plan = planVaultPeerDelta(undefined, remote, resume);
    expect(plan.neededBlockIndexes).toEqual([2, 3]);
    expect(plan.skippedResumeIndexes).toEqual([0, 1]);
    expect(plan.completeWithoutTransfer).toBe(false);
  });

  it('Resume-Indizes werden gegen das Manifest begrenzt; fremde Datei-IDs gelten nicht', async () => {
    const remote = await buildVaultPeerFileManifest(file('a'), content(), {}, 64 * 1024);
    const wrongFile: VaultPeerResumeState = { sessionId: 's', fileId: 'andere', peerId: 'p', acknowledgedBlockIndexes: [0], transferredBytes: 0, updatedAt: NOW };
    expect(planVaultPeerDelta(undefined, remote, wrongFile).neededBlockIndexes).toEqual([0, 1, 2, 3]);
    // skippedResumeIndexes bleibt leer, weil der Resume-Zustand zu einer anderen Datei gehoert.
    expect(planVaultPeerDelta(undefined, remote, wrongFile).skippedResumeIndexes).toEqual([]);
    const garbage: VaultPeerResumeState = { sessionId: 's', fileId: 'a', peerId: 'p', acknowledgedBlockIndexes: [-1, 0, 99, 1.5 as never], transferredBytes: 0, updatedAt: NOW };
    // Unbrauchbare Indizes (-1, 99, 1.5) werden verworfen; 0 und 1 gelten.
    expect(planVaultPeerDelta(undefined, remote, garbage).neededBlockIndexes).toEqual([1, 2, 3]);
  });

  it('ein abgelehntes Manifest wird nicht verplant', async () => {
    const remote = await buildVaultPeerFileManifest(file('a'), bytes('x'), {}, 16 * 1024);
    expect(() => planVaultPeerDelta(undefined, { ...remote, version: 2 as never })).toThrow('vault_peer_manifest_rejected');
    expect(() => planVaultPeerDelta(undefined, { ...remote, sizeBytes: 256 * 1024 * 1024 + 1 })).toThrow('vault_peer_manifest_rejected');
  });

  it('der Resume-Zustand zählt die bestätigten Blöcke und Bytes kumulativ', async () => {
    const manifest = await buildVaultPeerFileManifest(file('a'), content(), {}, 64 * 1024);
    let resume = updateVaultPeerResumeState(undefined, 'peer-1', manifest, 0);
    expect(resume.acknowledgedBlockIndexes).toEqual([0]);
    expect(resume.transferredBytes).toBe(manifest.blocks[0]!.sizeBytes);
    expect(resume.fileId).toBe('a');
    resume = updateVaultPeerResumeState(resume, 'peer-1', manifest, 2);
    expect(resume.acknowledgedBlockIndexes).toEqual([0, 2]);
    expect(resume.transferredBytes).toBe(manifest.blocks[0]!.sizeBytes + manifest.blocks[2]!.sizeBytes);
    expect(() => updateVaultPeerResumeState(resume, 'peer-1', manifest, 99)).toThrow('vault_peer_resume_block_invalid');
  });

  it('ein Resume-Zustand einer anderen Datei beginnt leer', async () => {
    const manifest = await buildVaultPeerFileManifest(file('a'), content(), {}, 64 * 1024);
    const other: VaultPeerResumeState = { sessionId: 's', fileId: 'fremd', peerId: 'p', acknowledgedBlockIndexes: [0, 1, 2], transferredBytes: 999, updatedAt: NOW };
    const next = updateVaultPeerResumeState(other, 'peer-1', manifest, 1);
    expect(next.acknowledgedBlockIndexes).toEqual([1]);
    expect(next.fileId).toBe('a');
  });
});

describe('Staging: keine ungeprüften Bytes werden zusammengesetzt', () => {
  /*
   * Gemessene Falle meines ersten Anlaufs: `buildVaultPeerFileManifest` zieht die Blockgröße auf
   * **mindestens 16 KiB** (`MIN_BLOCK_SIZE`). Mit kurzen Zeichenketten wie `'AAAABBBB'` entsteht deshalb
   * genau **ein** Block, und `manifest.blocks[1]` gibt es nicht (`reading 'offset' of undefined`). Die
   * Fixtures arbeiten hier mit echten Größen oberhalb der Mindestblockgröße.
   */
  const BLOCK = 16 * 1024;
  const manifestFor = async (parts: string[]) => {
    const full = bytes(parts.join(''));
    const manifest = await buildVaultPeerFileManifest(file('a'), full, {}, BLOCK);
    return { full, manifest };
  };

  it('aus Basis und eingehenden Blöcken entsteht die vollständige Datei', async () => {
    const first = 'A'.repeat(BLOCK);
    const { full, manifest } = await manifestFor([first, 'BBBB']);
    expect(manifest.blocks).toHaveLength(2);
    // Basis enthält Block 0 korrekt, Block 1 nicht.
    const base = new Uint8Array(full.length);
    base.set(full.subarray(0, manifest.blocks[0]!.sizeBytes), 0);
    const second = manifest.blocks[1]!;
    const incoming = [{ index: 1, bytes: full.slice(second.offset, second.offset + second.sizeBytes) }];
    const staged = await stageVaultPeerIncomingFile(manifest, base, incoming);
    expect(staged.bytes).toEqual(full);
    expect(new TextDecoder().decode(staged.bytes.subarray(BLOCK))).toBe('BBBB');
    expect(staged.contentHash).toBe(manifest.contentHash);
    expect(staged.fileName).toBe('a.txt');
    expect(staged.temporaryName).toMatch(/^\.a\.txt\.astraea-sync-/u);
  });

  it('ein gekippter Block wird abgelehnt, bevor die Datei materialisiert wird', async () => {
    const first = 'A'.repeat(BLOCK);
    const { full, manifest } = await manifestFor([first, 'BBBB']);
    const second = manifest.blocks[1]!;
    const tamperedBlock = full.slice(second.offset, second.offset + second.sizeBytes);
    tamperedBlock[0] ^= 0x01;
    // Als Basis eine **korrekte** erste Hälfte, damit die Ablehnung nachweislich vom Block-Hash kommt und
    // nicht von einem ohnehin falschen Puffer.
    const base = new Uint8Array(full.length);
    base.set(full.subarray(0, second.offset), 0);
    await expect(stageVaultPeerIncomingFile(manifest, base, [{ index: 1, bytes: tamperedBlock }]))
      .rejects.toThrow('vault_peer_block_hash_mismatch');
    /*
     * Gemessene Einordnung (Gegencheck 12): Nimmt man die **Block**-Prüfung heraus, schlägt derselbe Fall
     * weiterhin fehl — aber erst mit `vault_peer_content_hash_mismatch`. Die Zusage „manipulierte Bytes
     * werden nie materialisiert" hängt also **nicht** an dieser Zeile; sie hängt an der
     * Gesamt-Digest-Prüfung am Ende. Der Block-Hash ist **Defence-in-Depth**: er benennt den genauen Block
     * statt nur „die Datei ist falsch" und verhindert, dass falsche Bytes überhaupt in den Ausgabepuffer
     * geschrieben werden. Das ist es wert, aber es ist **keine** eigene Sicherheitsgarantie — und genau so
     * steht es hier.
     */
  });

  it('ein Block mit falscher Länge wird abgelehnt', async () => {
    const first = 'A'.repeat(BLOCK);
    const { full, manifest } = await manifestFor([first, 'BBBB']);
    await expect(stageVaultPeerIncomingFile(manifest, full, [{ index: 1, bytes: new Uint8Array(3) }]))
      .rejects.toThrow('vault_peer_block_size_mismatch');
  });

  it('ein falscher Gesamt-Digest wird abgelehnt, auch wenn alle Blöcke passen', async () => {
    const { full, manifest } = await manifestFor(['AAAA']);
    await expect(stageVaultPeerIncomingFile({ ...manifest, contentHash: 'f'.repeat(64) }, full, []))
      .rejects.toThrow('vault_peer_content_hash_mismatch');
  });

  it('zu viele Blöcke im Manifest werden abgelehnt — die Größengrenze allein genügt nicht', async () => {
    const { manifest } = await manifestFor(['AAAA']);
    // Mehr als MAX_BLOCKS Einträge: `sizeBytes` bleibt dabei unauffällig, die Blockzahl nicht.
    const manyBlocks = Array.from({ length: 8193 }, (_, index) => ({ index, offset: index, sizeBytes: 1, hash: 'a'.repeat(64) }));
    await expect(stageVaultPeerIncomingFile({ ...manifest, blocks: manyBlocks }, undefined, []))
      .rejects.toThrow('vault_peer_manifest_rejected');
  });

  it('eine leere Datei hat genau einen Block der Länge 0 und lässt sich ohne Fehler stagen', async () => {
    const empty = await buildVaultPeerFileManifest(file('a'), new Uint8Array(0), {}, BLOCK);
    const staged = await stageVaultPeerIncomingFile(empty, undefined, []);
    expect(staged.bytes).toHaveLength(0);
    expect(staged.contentHash).toBe(empty.contentHash);
  });
});

describe('Auswahl und Ignoriermuster', () => {
  const folders = [folder('f1', 'Projekte')];
  const enabled = { enabled: true };

  it('ohne Auswahl wird alles synchronisiert, ausser ungesunden Dateien', () => {
    expect(shouldVaultPeerSyncFile(file('a'), folders, enabled)).toBe(true);
    for (const status of ['quarantined', 'corrupt', 'missing'] as const) {
      expect(shouldVaultPeerSyncFile(file('a', { status }), folders, enabled), status).toBe(false);
    }
  });

  it('eine ausdrückliche Auswahl schliesst alles andere aus — Datei oder Ordner', () => {
    expect(shouldVaultPeerSyncFile(file('a'), folders, { ...enabled, selectedFileIds: ['a'] })).toBe(true);
    expect(shouldVaultPeerSyncFile(file('b'), folders, { ...enabled, selectedFileIds: ['a'] })).toBe(false);
    expect(shouldVaultPeerSyncFile(file('a', { folderId: 'f1' }), folders, { ...enabled, selectedFolderIds: ['f1'] })).toBe(true);
    expect(shouldVaultPeerSyncFile(file('a', { folderId: 'f2' }), folders, { ...enabled, selectedFolderIds: ['f1'] })).toBe(false);
  });

  it('ein ausgeschalteter Sync synchronisiert gar nichts', () => {
    expect(shouldVaultPeerSyncFile(file('a'), folders, { enabled: false })).toBe(false);
    expect(shouldVaultPeerSyncFile(file('a'), folders, undefined)).toBe(false);
  });

  it('Ignoriermuster greifen auf Dateinamen und auf den Pfad mit Ordnernamen', () => {
    expect(shouldVaultPeerSyncFile(file('a', { name: 'notiz.tmp' }), folders, { ...enabled, ignorePatterns: ['*.tmp'] })).toBe(false);
    expect(shouldVaultPeerSyncFile(file('a', { name: 'notiz.txt' }), folders, { ...enabled, ignorePatterns: ['*.tmp'] })).toBe(true);
    // Über den Pfad: der Ordnername steht im Muster.
    expect(shouldVaultPeerSyncFile(file('a', { name: 'x.txt', folderId: 'f1' }), folders, { ...enabled, ignorePatterns: ['Projekte/*'] })).toBe(false);
    // `?` ist genau ein Zeichen.
    expect(shouldVaultPeerSyncFile(file('a', { name: 'ab.txt' }), folders, { ...enabled, ignorePatterns: ['?b.txt'] })).toBe(false);
    expect(shouldVaultPeerSyncFile(file('a', { name: 'aab.txt' }), folders, { ...enabled, ignorePatterns: ['?b.txt'] })).toBe(true);
  });

  it('Sonderzeichen im Muster werden als Text behandelt, nicht als Regex', () => {
    // Ein Muster mit Regex-Metazeichen darf nicht als Ausdruck interpretiert werden.
    expect(shouldVaultPeerSyncFile(file('a', { name: 'a+b.txt' }), folders, { ...enabled, ignorePatterns: ['a+b.txt'] })).toBe(false);
    expect(shouldVaultPeerSyncFile(file('a', { name: 'aab.txt' }), folders, { ...enabled, ignorePatterns: ['a+b.txt'] })).toBe(true);
    expect(shouldVaultPeerSyncFile(file('a', { name: 'x(1).txt' }), folders, { ...enabled, ignorePatterns: ['x(1).txt'] })).toBe(false);
    // Ein katastrophales Muster darf nicht hängen: die Engine nutzt einen linearen Matcher.
    const evil = 'a'.repeat(160);
    expect(() => shouldVaultPeerSyncFile(file('a', { name: 'a'.repeat(4000) }), folders, { ...enabled, ignorePatterns: [evil] })).not.toThrow();
  });
});

describe('Budget und Transport', () => {
  it('ohne Grenze gilt unbegrenzt; mit Grenze wird zeitanteilig gerechnet', () => {
    expect(peerSyncTransferAllowanceBytes({}, 1000)).toBe(Number.MAX_SAFE_INTEGER);
    // 100 KiB/s für genau 1 s = 102400 Bytes.
    expect(peerSyncTransferAllowanceBytes({ bandwidthLimitKibPerSec: 100 }, 1000)).toBe(102_400);
    expect(peerSyncTransferAllowanceBytes({ bandwidthLimitKibPerSec: 100 }, 0)).toBe(0);
    // Die verstrichene Zeit wird auf 60 s begrenzt.
    expect(peerSyncTransferAllowanceBytes({ bandwidthLimitKibPerSec: 100 }, 10 * 60_000)).toBe(peerSyncTransferAllowanceBytes({ bandwidthLimitKibPerSec: 100 }, 60_000));
    expect(peerSyncTransferAllowanceBytes({ bandwidthLimitKibPerSec: 100 }, -5)).toBe(0);
  });

  it('der Stapel füllt das Budget und bricht dann ab, statt zu überschreiten', async () => {
    const manifest = await buildVaultPeerFileManifest(file('a'), new Uint8Array(100 * 1024), {}, 16 * 1024);
    const plan = planVaultPeerDelta(undefined, manifest);
    // 25 KiB/s für 1 s = 25600 Bytes → genau ein 16-KiB-Block passt, der zweite nicht.
    const batch = selectVaultPeerTransferBatch(plan, manifest, { bandwidthLimitKibPerSec: 25 }, 1000);
    expect(batch).toEqual([0]);
    // Ohne Grenze kommt alles.
    expect(selectVaultPeerTransferBatch(plan, manifest, {}, 1000)).toEqual(plan.neededBlockIndexes);
  });

  it('LAN braucht aktivierten Sync, LAN-Erkennung und eine Netzfreigabe', () => {
    const lan = { kind: 'lan' as const, peerId: 'p' };
    expect(() => assertVaultPeerTransportAllowed({ enabled: true, lanDiscoveryEnabled: true }, lan, 'LocalLanOnly')).not.toThrow();
    expect(() => assertVaultPeerTransportAllowed({ enabled: false }, lan, 'LocalLanOnly')).toThrow('vault_peer_sync_disabled');
    expect(() => assertVaultPeerTransportAllowed({ enabled: true }, lan, 'LocalLanOnly')).toThrow('vault_peer_lan_disabled');
    expect(() => assertVaultPeerTransportAllowed({ enabled: true, lanDiscoveryEnabled: true }, lan, 'None')).toThrow('vault_peer_network_capability_blocked');
  });

  it('Relay braucht wss, ausreichende Freigabe und exakt den konfigurierten Endpunkt', () => {
    const policy = { enabled: true, relayEnabled: true, relayEndpoint: 'wss://relay.example/v' };
    const relay = { kind: 'relay' as const, peerId: 'p', endpoint: 'wss://relay.example/v' };
    expect(() => assertVaultPeerTransportAllowed(policy, relay, 'WhitelistedOnly')).not.toThrow();
    expect(() => assertVaultPeerTransportAllowed(policy, relay, 'FullUserApproved')).not.toThrow();
    expect(() => assertVaultPeerTransportAllowed({ enabled: true }, relay, 'WhitelistedOnly')).toThrow('vault_peer_relay_disabled');
    expect(() => assertVaultPeerTransportAllowed(policy, relay, 'LocalLanOnly')).toThrow('vault_peer_relay_capability_blocked');
    expect(() => assertVaultPeerTransportAllowed(policy, relay, 'None')).toThrow('vault_peer_relay_capability_blocked');
    expect(() => assertVaultPeerTransportAllowed(policy, { ...relay, endpoint: 'wss://boese.example/v' }, 'WhitelistedOnly')).toThrow('vault_peer_relay_endpoint_mismatch');
  });

  it('die LAN-Erkennung filtert unbrauchbare Kandidaten und ist ohne Freigabe gesperrt', async () => {
    const adapter = { discover: async () => [
      { peerId: 'gültig', label: 'Peer', endpoint: 'https://10.0.0.2:7777', publicKeyFingerprint: 'a'.repeat(64) },
      { peerId: '', label: 'ohne id', endpoint: 'x', publicKeyFingerprint: 'a'.repeat(64) },
      { peerId: 'kurzer-fp', label: 'Peer', endpoint: 'x', publicKeyFingerprint: 'abc' },
      { peerId: 'lang', label: 'P'.repeat(200), endpoint: 'https://10.0.0.3', publicKeyFingerprint: 'b'.repeat(64) },
    ] };
    const found = await discoverVaultLanPeers({ enabled: true, lanDiscoveryEnabled: true }, 'LocalLanOnly', adapter);
    expect(found.map((candidate) => candidate.peerId)).toEqual(['gültig', 'lang']);
    expect(found[1]?.label.length).toBe(96);
    // Ohne Aktivierung wird der Adapter gar nicht befragt.
    expect(await discoverVaultLanPeers({ enabled: false }, 'LocalLanOnly', adapter)).toEqual([]);
    expect(await discoverVaultLanPeers({ enabled: true, lanDiscoveryEnabled: false }, 'LocalLanOnly', adapter)).toEqual([]);
    // Ohne Netzfreigabe ein Fehler, kein leeres Ergebnis.
    await expect(discoverVaultLanPeers({ enabled: true, lanDiscoveryEnabled: true }, 'None', adapter)).rejects.toThrow('vault_peer_network_capability_blocked');
  });
});

describe('Namenskollision, Konflikt, atomarer Abschluss', () => {
  it('eine Namenskollision wird umbenannt — sonst gäbe es zwei gleiche Namen', () => {
    // Gemessen: der peerId-Anteil wird auf [a-z0-9] reduziert und auf 8 Zeichen gekuerzt — peer-1 wird zu peer1.
    expect(resolveVaultPeerCaseCollision('Bericht.txt', ['bericht.TXT'], 'peer-1')).toMatch(/^Bericht\.case-conflict-peer1-\d+\.txt$/u);
    // Kein Konflikt → unverändert.
    expect(resolveVaultPeerCaseCollision('Neu.txt', ['alt.txt'], 'peer-1')).toBe('Neu.txt');
    // DERSELBE Name zweimal ist ebenfalls eine Kollision — und genau die zwei gleichen Namen,
    // die der Titel dieses Falls verbietet. Die frühere Fassung gab den Namen hier unverändert
    // zurück („kein Konflikt") und überliess den exakten Fall dem Aufrufer; einen solchen
    // Aufrufer gibt es nicht, also blieb der Fall unbehandelt. Gemessen am 2026-10-16.
    expect(resolveVaultPeerCaseCollision('Gleich.txt', ['Gleich.txt'], 'peer-1')).toMatch(/^Gleich\.case-conflict-peer1-\d+\.txt$/u);
  });

  it('ohne Endung wird der Zusatz hinten angehängt', () => {
    expect(resolveVaultPeerCaseCollision('Bericht', ['bericht'], 'peer-1')).toMatch(/^Bericht\.case-conflict-peer1-\d+$/u);
  });

  it('identische Inhalte und einseitige Änderungen werden ohne Konfliktkopie aufgelöst', () => {
    const base = bytes('zeile1\nzeile2');
    const local = bytes('zeile1\nzeile2');
    const remote = bytes('zeile1\nzeileX');
    expect(resolveVaultPeerConflict('a.txt', 'p', base, local, local)).toEqual({ kind: 'local', bytes: local });
    // Lokal unverändert → remote gewinnt.
    expect(resolveVaultPeerConflict('a.txt', 'p', base, base, remote)).toEqual({ kind: 'remote', bytes: remote });
    // Remote unverändert → lokal gewinnt.
    expect(resolveVaultPeerConflict('a.txt', 'p', base, remote, base)).toEqual({ kind: 'local', bytes: remote });
  });

  it('Text wird dreiseitig zusammengeführt, wenn beide Seiten verschiedene Zeilen ändern', () => {
    const base = bytes('a\nb\nc');
    const local = bytes('A\nb\nc');
    const remote = bytes('a\nb\nC');
    const merged = resolveVaultPeerConflict('a.txt', 'p', base, local, remote, 'text/plain');
    expect(merged.kind).toBe('merged');
    expect(new TextDecoder().decode(merged.bytes)).toBe('A\nb\nC');
  });

  it('dieselbe Zeile auf beiden Seiten unterschiedlich geändert ergibt eine Konfliktkopie', () => {
    const base = bytes('a\nb\nc');
    const local = bytes('a\nL\nc');
    const remote = bytes('a\nR\nc');
    const resolved = resolveVaultPeerConflict('bericht.txt', 'peer-42', base, local, remote, 'text/plain');
    expect(resolved.kind).toBe('conflict_copy');
    expect(resolved.bytes).toEqual(remote);
    expect(resolved.conflictName).toMatch(/^bericht\.conflict-peer42-\d+\.txt$/u);
  });

  it('Binärinhalte werden nie zusammengeführt, sondern als Konfliktkopie abgelegt', () => {
    const base = new Uint8Array([1, 2, 3]);
    const local = new Uint8Array([1, 9, 3]);
    const remote = new Uint8Array([1, 8, 3]);
    const resolved = resolveVaultPeerConflict('a.bin', 'p', base, local, remote, 'application/octet-stream');
    expect(resolved.kind).toBe('conflict_copy');
    // Auch ohne Basis gibt es keinen Merge.
    expect(resolveVaultPeerConflict('a.txt', 'p', undefined, bytes('x'), bytes('y'), 'text/plain').kind).toBe('conflict_copy');
  });

  it('ungültiges UTF-8 verhindert den Merge, statt ihn zu erfinden', () => {
    const base = new Uint8Array([0xff, 0xfe]);
    const local = new Uint8Array([0xff, 0xfd]);
    const remote = new Uint8Array([0xff, 0xfc]);
    expect(resolveVaultPeerConflict('a.txt', 'p', base, local, remote, 'text/plain').kind).toBe('conflict_copy');
  });

  it('der atomare Abschluss prüft Identität und Nutzlast, bevor er schreibt', async () => {
    /*
     * Gemessene Falle meines ersten Anlaufs: `stageVaultPeerIncomingFile(manifest, undefined, [])` ist ein
     * **degenerierter** Fall — der Ausgabepuffer entsteht aus der fehlenden Basis und den fehlenden Blöcken,
     * ist also mit Nullen gefüllt. Der Block-Hash stimmt dann nicht mit dem Manifest überein und das Staging
     * wirft zu Recht `vault_peer_block_hash_mismatch`. Der Fehler war mein Test, nicht der Code. Hier wird
     * deshalb korrekt gestaged: die eingehenden Blöcke werden aus dem Inhalt gebildet.
     */
    const content = bytes('inhalt');
    const manifest = await buildVaultPeerFileManifest(file('a'), content, {}, 16 * 1024);
    const incoming = manifest.blocks.map((block) => ({ index: block.index, bytes: content.slice(block.offset, block.offset + block.sizeBytes) }));
    const staged = await stageVaultPeerIncomingFile(manifest, undefined, incoming);
    const payloadDataUrl = `data:text/plain;base64,${btoa('inhalt')}`;
    const committed = atomicCommitVaultPeerAttachment(file('a'), staged, payloadDataUrl, NOW);
    expect(committed).toMatchObject({
      id: 'a', name: 'a.txt', sizeBytes: staged.bytes.byteLength, contentDigest: staged.contentHash,
      integrityState: 'verified', integrityVerifiedAt: staged.verifiedAt, lastModified: NOW, status: 'available',
    });
    expect(committed.encryptedHash).toBe(committed.contentDigest);
    expect(committed.digestAlgorithm).toBe('SHA-256');
    // Eine fremde Datei-ID wird abgelehnt — sonst würde der Inhalt an der falschen Stelle landen.
    expect(() => atomicCommitVaultPeerAttachment(file('b'), staged, payloadDataUrl)).toThrow('vault_peer_atomic_file_id_mismatch');
    expect(() => atomicCommitVaultPeerAttachment(file('a'), staged, 'kein-data-url')).toThrow('vault_peer_atomic_payload_invalid');
  });
});
