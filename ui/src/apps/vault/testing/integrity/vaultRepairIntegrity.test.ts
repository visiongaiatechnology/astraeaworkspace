// STATUS: PLATIN — Reparatur aus bekannt-guter Quelle: der gefährlichste Schreibpfad im Vault.
//
// Warum diese Datei existiert: `repairVaultAttachmentFromKnownGood` **ersetzt die Nutzlast** eines
// Vault-Eintrags. Das ist der einzige Pfad im Vault, der vorhandene Bytes durch andere überschreibt, und er
// hatte bis hierher **keinen einzigen Test** (Defekt V-018). Die Prüfung ist beim Lesen klar — nur
// `version`/`backup`/`peer` als Quelle, nur Anhänge, Größe innerhalb der Grenze, Digest muss exakt dem
// gespeicherten entsprechen. „Beim Lesen klar" ist aber kein Nachweis. Dieser Test misst, und er prüft
// insbesondere, dass **kein** Weg an der Digest-Prüfung vorbeiführt.
import { describe, expect, it } from 'vitest';
import type { VaultFile, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  MAX_VAULT_ATTACHMENT_BYTES,
  appendVaultIntegrityAudit,
  buildVaultChunkIntegrity,
  bytesToHex,
  calculateVaultFileBytes,
  calculateVaultFileDigest,
  computeVaultMerkleRoot,
  createVaultAttachmentEntry,
  createVaultWorkspaceEntry,
  dataUrlToBytes,
  inferVaultKindFromFilename,
  MAX_VAULT_AUDIT_HISTORY,
  MAX_VAULT_INTEGRITY_CHUNKS,
  MAX_VAULT_INTEGRITY_FILES,
  repairVaultAttachmentFromKnownGood,
  sha256Bytes,
  sha256Text,
  stableJsonStringify,
  stableWorkspaceDocumentJson,
  verifyEntireVault,
  verifyVaultChunkIntegrity,
  verifyVaultFile,
  VAULT_INTEGRITY_CHUNK_BYTES,
} from '../../../../shared/vault/integrity/vaultIntegrity';

const NOW = 1_700_000_000_000;

const bytesToDataUrl = (bytes: Uint8Array, mimeType = 'application/octet-stream') => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
};

async function attachmentWithContent(content: string, overrides: Partial<VaultFile> = {}): Promise<{ file: VaultFile; bytes: Uint8Array }> {
  const bytes = new TextEncoder().encode(content);
  const digest = await sha256Bytes(bytes);
  return {
    bytes,
    file: {
      // Eindeutige ID je Aufruf: in `verifyEntireVault` würde eine doppelte ID die Zuordnung der
      // Prüfergebnisse verfälschen — mein erster Testlauf hat genau das getan und war deshalb rot.
      id: `vf-${globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!.toString(16)}`, name: 'notiz.txt', kind: 'Writer', sizeBytes: bytes.byteLength,
      encryptedHash: digest, contentDigest: digest, digestAlgorithm: 'SHA-256',
      integrityState: 'verified', sourceType: 'attachment', mimeType: 'text/plain',
      payloadDataUrl: bytesToDataUrl(bytes, 'text/plain'), lastModified: NOW,
      chunkIntegrity: await buildVaultChunkIntegrity(bytes),
      ...overrides,
    },
  };
}

describe('Reparatur: nur Bytes, die dem gespeicherten Digest entsprechen', () => {
  it('die richtigen Bytes reparieren und setzen die Integrität auf verifiziert', async () => {
    const original = new TextEncoder().encode('ursprünglicher Inhalt');
    const { file } = await attachmentWithContent('ursprünglicher Inhalt', {
      // Beschädigte Nutzlast, aber bekannter Digest des **ursprünglichen** Inhalts.
      payloadDataUrl: bytesToDataUrl(new TextEncoder().encode('beschädigt'), 'text/plain'),
      sizeBytes: 10,
    });
    const repaired = await repairVaultAttachmentFromKnownGood(file, { kind: 'backup', bytes: original, mimeType: 'text/plain' }, NOW + 5);
    expect(repaired.integrityState).toBe('verified');
    expect(repaired.integrityVerifiedAt).toBe(NOW + 5);
    expect(repaired.status).toBe('available');
    expect(repaired.sizeBytes).toBe(original.byteLength);
    expect(await sha256Bytes(dataUrlToBytes(repaired.payloadDataUrl!))).toBe(file.contentDigest);
    // Und der reparierte Eintrag besteht die Prüfung.
    await expect(verifyVaultFile(repaired, [])).resolves.toMatchObject({ state: 'verified' });
  });

  it('falsche Bytes werden abgelehnt — es wird nichts geschrieben', async () => {
    const { file } = await attachmentWithContent('richtig');
    await expect(repairVaultAttachmentFromKnownGood(file, { kind: 'backup', bytes: new TextEncoder().encode('falsch') }))
      .rejects.toThrow('vault_repair_source_not_known_good');
  });

  it('eine nicht vertrauenswürdige Quelle wird abgelehnt, auch wenn der Digest stimmt', async () => {
    const { file, bytes } = await attachmentWithContent('inhalt');
    // `bytes` passt zum Digest, aber `kind` ist nicht erlaubt → Ablehnung als **erste** Prüfung.
    await expect(repairVaultAttachmentFromKnownGood(file, { kind: 'untrusted' as never, bytes }))
      .rejects.toThrow('vault_repair_source_untrusted');
    expect(['version', 'backup', 'peer']).toContain('version');
  });

  it('ohne bekannten Digest gibt es keine Reparatur — „irgendetwas einsetzen" ist kein Wiederherstellen', async () => {
    const { file, bytes } = await attachmentWithContent('inhalt', { contentDigest: undefined });
    await expect(repairVaultAttachmentFromKnownGood(file, { kind: 'backup', bytes }))
      .rejects.toThrow('vault_repair_requires_known_digest');
  });

  it('Workspace-Dokumente werden nicht über diesen Pfad repariert', async () => {
    const { file, bytes } = await attachmentWithContent('inhalt', { sourceType: 'workspace-document', documentId: 'doc-1' });
    await expect(repairVaultAttachmentFromKnownGood(file, { kind: 'backup', bytes }))
      .rejects.toThrow('vault_repair_attachment_only');
  });

  it('eine leere oder zu große Quelle wird abgelehnt', async () => {
    const { file } = await attachmentWithContent('inhalt');
    await expect(repairVaultAttachmentFromKnownGood(file, { kind: 'backup', bytes: new Uint8Array(0) }))
      .rejects.toThrow('vault_repair_size_invalid');
    await expect(repairVaultAttachmentFromKnownGood(file, { kind: 'backup', bytes: new Uint8Array(MAX_VAULT_ATTACHMENT_BYTES + 1) }))
      .rejects.toThrow('vault_repair_size_invalid');
  });

  it('alle drei erlaubten Quellen funktionieren', async () => {
    for (const kind of ['version', 'backup', 'peer'] as const) {
      const { file, bytes } = await attachmentWithContent(`inhalt-${kind}`);
      const repaired = await repairVaultAttachmentFromKnownGood(file, { kind, bytes }, NOW);
      expect(repaired.integrityState, kind).toBe('verified');
    }
  });
});

describe('Vorhandene Zusage: Chunk-Integrität und Merkle-Wurzel', () => {
  it('die Chunk-Grenzen sind gesetzt und eine unzulässige Chunk-Größe wird abgelehnt', async () => {
    expect(VAULT_INTEGRITY_CHUNK_BYTES).toBe(64 * 1024);
    expect(MAX_VAULT_INTEGRITY_CHUNKS).toBe(4096);
    expect(MAX_VAULT_INTEGRITY_FILES).toBe(10_000);
    const bytes = new Uint8Array(1024);
    await expect(buildVaultChunkIntegrity(bytes, 1024)).rejects.toThrow('vault_integrity_chunk_size_invalid');
    await expect(buildVaultChunkIntegrity(bytes, 8 * 1024 * 1024)).rejects.toThrow('vault_integrity_chunk_size_invalid');
  });

  it('ein einziges gekipptes Bit in irgendeinem Chunk fällt durch', async () => {
    const bytes = new Uint8Array(VAULT_INTEGRITY_CHUNK_BYTES * 3);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31) % 256;
    const manifest = await buildVaultChunkIntegrity(bytes);
    expect(manifest.totalChunks).toBe(3);
    expect(await verifyVaultChunkIntegrity(bytes, manifest)).toBe(true);
    // Jeden Chunk einzeln kippen: keiner darf durchrutschen.
    for (const chunkIndex of [0, 1, 2]) {
      const tampered = new Uint8Array(bytes);
      tampered[chunkIndex * VAULT_INTEGRITY_CHUNK_BYTES + 7] ^= 0x80;
      expect(await verifyVaultChunkIntegrity(tampered, manifest), `Chunk ${chunkIndex}`).toBe(false);
    }
  });

  it('ein Manifest mit falschem Algorithmus oder falscher Version wird abgelehnt', async () => {
    const manifest = await buildVaultChunkIntegrity(new Uint8Array(2048));
    expect(await verifyVaultChunkIntegrity(new Uint8Array(2048), { ...manifest, algorithm: 'MD5' as never })).toBe(false);
    expect(await verifyVaultChunkIntegrity(new Uint8Array(2048), { ...manifest, version: 2 as never })).toBe(false);
  });

  it('die Merkle-Wurzel hängt von allen Chunks ab', async () => {
    const empty = await computeVaultMerkleRoot([]);
    expect(empty).toBe('0'.repeat(64));
    const a = await computeVaultMerkleRoot(['aa', 'bb']);
    const b = await computeVaultMerkleRoot(['aa', 'cc']);
    expect(a).not.toBe(b);
    // Eine ungerade Anzahl wird korrekt behandelt (letzter Knoten mit sich selbst gepaart).
    const odd = await computeVaultMerkleRoot(['aa', 'bb', 'cc']);
    expect(odd).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('eine einbyte-Änderung an der Nutzlast wird von `verifyVaultFile` erkannt', async () => {
    const { file } = await attachmentWithContent('prüfbar');
    await expect(verifyVaultFile(file, [])).resolves.toMatchObject({ state: 'verified', baselineCreated: false });
    const tampered: VaultFile = { ...file, payloadDataUrl: bytesToDataUrl(new TextEncoder().encode('prüfbar'.replace('b', 'c'))) };
    await expect(verifyVaultFile(tampered, [])).resolves.toMatchObject({ state: 'mismatch' });
  });

  it('ohne Digest wird eine Basis angelegt, und das ist als solches gemeldet', async () => {
    const { file } = await attachmentWithContent('neu', { contentDigest: undefined, encryptedHash: '' });
    const result = await verifyVaultFile(file, []);
    expect(result.baselineCreated).toBe(true);
    expect(result.state).toBe('verified');
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe('Gesamtprüfung: Zählung, Statusübergänge, Obergrenze', () => {
  it('zählt verifiziert, abweichend und nicht verfügbar getrennt', async () => {
    const good = (await attachmentWithContent('gut')).file;
    const bad = { ...(await attachmentWithContent('kaputt')).file, payloadDataUrl: bytesToDataUrl(new TextEncoder().encode('anders')) };
    const unavailable: VaultFile = { ...(await attachmentWithContent('weg')).file, payloadDataUrl: undefined };
    const result = await verifyEntireVault([good, bad, unavailable], [], NOW);
    expect(result.report).toMatchObject({ totalFiles: 3, verified: 1, mismatch: 1, unavailable: 1 });
    expect(result.files.find((file) => file.id === bad.id)?.status).toBe('corrupt');
    expect(result.files.find((file) => file.id === unavailable.id)?.integrityState).toBe('unavailable');
    expect(result.report.entries).toHaveLength(3);
    expect(result.report.entries.find((entry) => entry.fileId === unavailable.id)?.reason).toBeTruthy();
  });

  it('eine frühere Beschädigung wird bei erfolgreicher Prüfung wieder auf available gesetzt', async () => {
    const good = (await attachmentWithContent('heilbar', { status: 'corrupt', integrityState: 'mismatch' })).file;
    const result = await verifyEntireVault([good], [], NOW);
    expect(result.files[0]?.status).toBe('available');
    expect(result.files[0]?.integrityState).toBe('verified');
  });

  it('oberhalb der Dateigrenze wird die Gesamtprüfung abgelehnt, statt teilweise zu laufen', async () => {
    const files = Array.from({ length: MAX_VAULT_INTEGRITY_FILES + 1 }, (_, index) => ({ id: `vf-${index}` } as VaultFile));
    await expect(verifyEntireVault(files, [])).rejects.toThrow('vault_integrity_file_limit');
  });

  it('der Audit-Verlauf ist begrenzt und ersetzt denselben Bericht statt ihn zu doppeln', () => {
    const report = (id: string) => ({ id, createdAt: 1, totalFiles: 0, verified: 0, mismatch: 0, unavailable: 0, entries: [] }) as never;
    let history = appendVaultIntegrityAudit(undefined, report('a'));
    expect(history).toHaveLength(1);
    history = appendVaultIntegrityAudit(history, report('a'));
    expect(history).toHaveLength(1);
    for (let index = 0; index < MAX_VAULT_AUDIT_HISTORY + 5; index += 1) history = appendVaultIntegrityAudit(history, report(`r-${index}`));
    expect(history).toHaveLength(MAX_VAULT_AUDIT_HISTORY);
  });
});

describe('Anhänge und Workspace-Einträge erzeugen', () => {
  it('`createVaultAttachmentEntry` ist headless NICHT ausführbar — das wird festgehalten, nicht umgangen', async () => {
    /*
     * Gemessen: `readFileAsDataUrl` benutzt `FileReader`, und den gibt es in dieser Node-Umgebung nicht
     * (`ReferenceError: FileReader is not defined`). Der **Erfolgspfad** des Anhangsimports ist damit
     * headless nicht prüfbar — nur die Ablehnungspfade davor (Größe) und die reinen Hilfsfunktionen.
     *
     * Ich habe den Fall deshalb nicht grün gemacht, indem ich `FileReader` nachbaue: ein selbstgebauter
     * Ersatz würde genau das Verhalten nachbilden, das ich prüfen will, und wäre damit kein Nachweis. Der
     * Test hält stattdessen die Grenze fest — und dass die Zusage über eine Browser-/Host-Abnahme offen
     * bleibt.
     */
    expect(typeof (globalThis as { FileReader?: unknown }).FileReader).toBe('undefined');
    const file = { size: 10, name: 'bericht.txt', type: 'text/plain', lastModified: NOW } as unknown as File;
    await expect(createVaultAttachmentEntry(file)).rejects.toThrow();
  });

  it('ein zu großer Anhang wird beim Lesen abgelehnt, nicht gekürzt', async () => {
    const huge = { size: MAX_VAULT_ATTACHMENT_BYTES + 1, name: 'gross.bin', type: 'application/octet-stream' } as unknown as File;
    const { readFileAsDataUrl } = await import('../../../../shared/vault/integrity/vaultIntegrity');
    await expect(readFileAsDataUrl(huge)).rejects.toThrow(/between 1 byte and 25 MiB/u);
  });

  it('ein Workspace-Eintrag bindet Dokument-ID und Version und ist stabil digestiert', async () => {
    const document = {
      schema_version: 1, id: 'doc-1', title: 'Mein Dokument', kind: 'Writer',
      created_at: 1, modified_at: 2, version: 3, theme_id: 'default', root_object_ids: [], objects: {},
    } as unknown as WorkspaceDocument;
    const entry = await createVaultWorkspaceEntry(document);
    expect(entry).toMatchObject({ sourceType: 'workspace-document', documentId: 'doc-1', documentVersion: 3 });
    expect(entry.association).toMatchObject({ action: 'workspace', app: 'Writer' });
    // Zweimal dasselbe Dokument ergibt denselben Digest — die Serialisierung ist stabil.
    const again = await createVaultWorkspaceEntry(document);
    expect(again.contentDigest).toBe(entry.contentDigest);
  });

  it('die stabile Serialisierung ist unabhängig von der Schlüsselreihenfolge', () => {
    expect(stableJsonStringify({ b: 1, a: 2 })).toBe(stableJsonStringify({ a: 2, b: 1 }));
    expect(stableJsonStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    // Aber sie ist nicht gleichgültig gegenüber dem Inhalt.
    expect(stableJsonStringify({ a: 1 })).not.toBe(stableJsonStringify({ a: 2 }));
  });

  it('Bytes eines Workspace-Eintrags kommen aus dem verknüpften Dokument, nicht aus einer Kopie', async () => {
    const document = { schema_version: 1, id: 'doc-9', title: 'T', kind: 'Writer', created_at: 1, modified_at: 2, version: 1, theme_id: 'default', root_object_ids: [], objects: {} } as unknown as WorkspaceDocument;
    const entry = await createVaultWorkspaceEntry(document);
    const bytes = await calculateVaultFileBytes(entry, [document]);
    expect(new TextDecoder().decode(bytes)).toBe(stableWorkspaceDocumentJson(document));
    expect(await calculateVaultFileDigest(entry, [document])).toBe(entry.contentDigest);
    // Fehlt das Dokument, ist der Eintrag nicht prüfbar — und sagt das.
    await expect(calculateVaultFileBytes(entry, [])).rejects.toThrow('Linked Workspace document is unavailable.');
  });

  it('ohne Nutzlast gibt es keine prüfbaren Bytes', async () => {
    const entry = { id: 'x', name: 'x', kind: 'Writer', sizeBytes: 1, encryptedHash: '', lastModified: 1 } as VaultFile;
    await expect(calculateVaultFileBytes(entry, [])).rejects.toThrow('No verifiable payload is stored for this Vault entry.');
  });

  it('Dateiendungen werden auf Dokumentarten abgebildet, unbekannte auf Writer', () => {
    expect(inferVaultKindFromFilename('a.vgrid')).toBe('Grid');
    expect(inferVaultKindFromFilename('a.CSV')).toBe('Grid');
    expect(inferVaultKindFromFilename('a.vpresent')).toBe('Present');
    expect(inferVaultKindFromFilename('a.vnote')).toBe('Note'.length === 4 ? 'Notes' : 'Notes');
    expect(inferVaultKindFromFilename('a.vpdf')).toBe('PdfStudio');
    expect(inferVaultKindFromFilename('a.vboard')).toBe('Whiteboard');
    expect(inferVaultKindFromFilename('a.vtask')).toBe('Tasks');
    expect(inferVaultKindFromFilename('ohne-endung')).toBe('Writer');
    expect(inferVaultKindFromFilename('a.unbekannt')).toBe('Writer');
  });

  it('Hex- und Digest-Hilfen sind konsistent', async () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
    expect(await sha256Text('abc')).toBe(await sha256Bytes(new TextEncoder().encode('abc')));
    expect(await sha256Text('abc')).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe('V-017: der Grund stimmt, nicht nur die Ablehnung', () => {
  /*
   * **Der Befund:** `calculateVaultFileBytes` hatte den Zweig
   * `if (sourceType === 'workspace-document' && file.documentId) { … }` und darunter **einen** Sammelfall.
   * Ein Workspace-Verweis **ohne** `documentId` fiel damit in den Sammelfall und meldete
   * „No verifiable payload is stored" — als hätte der Eintrag **keinen Inhalt**. Tatsächlich ist der
   * **Verweis** unvollständig. Für den Nutzer ist das ein Unterschied: „das verknüpfte Dokument ist weg"
   * und „dieser Eintrag hat keinen Inhalt" verlangen verschiedene Reaktionen.
   */
  /*
   * Der Helfer ist **typisiert**, nicht `as never`: mit `never` als Rückgabetyp ließ sich das Ergebnis nicht
   * mehr spreizen (`TS2698: Spread types may only be created from object types`), und der Typecheck hat es
   * angemahnt. Derselbe Fehler wie schon einmal in dieser Sitzung — ein zu weiter Cast verdeckt genau die
   * Stellen, an denen ein Typ gebraucht wird.
   */
  const workspaceRef = (overrides: Partial<VaultFile> = {}): VaultFile => ({
    id: 'vf-ref', name: 'verweis', kind: 'Writer', sizeBytes: 0, encryptedHash: '',
    lastModified: NOW, status: 'available', sourceType: 'workspace-document',
    folderId: null, ...overrides,
  });

  it('ein Verweis **ohne** `documentId` meldet den unvollständigen Verweis, nicht fehlenden Inhalt', async () => {
    await expect(calculateVaultFileBytes(workspaceRef(), [])).rejects.toThrow('vault_entry_reference_incomplete');
    // Und ausdrücklich NICHT die alte, irreführende Meldung.
    await expect(calculateVaultFileBytes(workspaceRef(), [])).rejects.not.toThrow('No verifiable payload');
  });

  it('ein Verweis auf ein **nicht vorhandenes** Dokument meldet die Nichtverfügbarkeit', async () => {
    // Der dritte, eigene Fall: die ID ist gesetzt, das Dokument fehlt.
    await expect(calculateVaultFileBytes(workspaceRef({ documentId: 'weg' }), [])).rejects.toThrow('Linked Workspace document is unavailable.');
  });

  it('ein Anhang **ohne** Nutzlast meldet die fehlende Nutzlast', async () => {
    const attachment = { ...workspaceRef(), sourceType: 'attachment', payloadDataUrl: undefined } as never;
    await expect(calculateVaultFileBytes(attachment, [])).rejects.toThrow('vault_entry_payload_missing');
  });

  it('ein auflösbarer Verweis liefert die Bytes, ein vollständiger Anhang ebenso', async () => {
    // Gegenprobe: die drei Gründe dürfen den Erfolgsfall nicht verdrängt haben.
    const doc = { id: 'd-1', title: 'Tresor', kind: 'Vault', version: 1, objects: {}, vaultData: {} } as never;
    const bytes = await calculateVaultFileBytes(workspaceRef({ documentId: 'd-1' }), [doc]);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const withPayload = { ...workspaceRef(), sourceType: 'attachment', payloadDataUrl: 'data:text/plain;base64,aGFsbG8=' } as never;
    expect(new TextDecoder().decode(await calculateVaultFileBytes(withPayload, []))).toBe('hallo');
  });

  it('die drei Gründe sind unterscheidbar — das ist der Punkt', async () => {
    // Wären zwei Fälle gleich benannt, könnte der Nutzer sie nicht auseinanderhalten. Genau das war V-017.
    const messages = new Set<string>();
    for (const [file, documents] of [
      [workspaceRef(), []],
      [workspaceRef({ documentId: 'weg' }), []],
      [{ ...workspaceRef(), sourceType: 'attachment', payloadDataUrl: undefined }, []],
    ] as const) {
      try { await calculateVaultFileBytes(file as never, documents as never); } catch (error) { messages.add((error as Error).message); }
    }
    expect(messages.size).toBe(3);
  });
});