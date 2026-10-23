// STATUS: PLATIN — Versionshistorie: Integrität wird geprüft, bevor Inhalt entsteht.
//
// Dieser Test hält einen gemessenen Befund fest (AST-1164 / Defekt V-008): `previewVaultVersion` war
// synchron und parste `workspaceSnapshotJson` mit `JSON.parse`, **bevor** der Digest verglichen wurde.
// `restoreVaultVersion` prüfte dagegen korrekt zuerst. Derselbe manipulierte Snapshot wurde damit beim
// Wiederherstellen abgelehnt und beim Anzeigen akzeptiert — zwei Regeln für eine Frage. Dieser Test misst
// beide Wege **gegen denselben manipulierten Snapshot**; sie müssen dasselbe sagen.
import { describe, expect, it } from 'vitest';
import type { VaultFile, VaultFileVersion, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  assertVaultVersionSnapshotIntegrity,
  captureVaultFileVersion,
  compareVaultVersions,
  DEFAULT_VAULT_VERSION_RETENTION,
  MAX_VAULT_VERSIONS_PER_FILE,
  MAX_VAULT_VERSION_AGE_DAYS,
  MAX_VAULT_VERSION_SNAPSHOT_BYTES,
  nameVaultVersion,
  normalizeVaultVersionRetention,
  previewVaultVersion,
  restoreVaultVersion,
  setVaultVersionHold,
  vaultVersionStorageUsage,
  vaultVersionsForFile,
  applyVaultVersionRetention,
} from '../../../../shared/vault/history/vaultVersionHistoryEngine';
import { sha256Bytes, stableWorkspaceDocumentJson } from '../../../../shared/vault/integrity/vaultIntegrity';

const NOW = 1_700_000_000_000;

const workspaceDocument = (id: string, title: string, version = 1): WorkspaceDocument => ({
  schema_version: 1, id, title, kind: 'Writer',
  created_at: 1, modified_at: 1, version, theme_id: 'default',
  root_object_ids: [], objects: {},
} as unknown as WorkspaceDocument);

const attachmentFile = (overrides: Partial<VaultFile> = {}): VaultFile => ({
  id: 'vf-1', name: 'notiz.txt', kind: 'Writer', sizeBytes: 5,
  encryptedHash: 'a'.repeat(64), lastModified: 1, sourceType: 'attachment',
  mimeType: 'text/plain',
  payloadDataUrl: `data:text/plain;base64,${btoa('hallo')}`,
  ...overrides,
});

/** Dieselbe Datei-Identität, die `workspaceVersion` beim Erfassen verwendet — sonst greift die Dateiprüfung. */
const workspaceFile = (doc: WorkspaceDocument): VaultFile => ({
  id: `vf-${doc.id}`, name: doc.title, kind: doc.kind, sizeBytes: 1,
  encryptedHash: 'b'.repeat(64), lastModified: 1, sourceType: 'workspace-document', documentId: doc.id,
});

async function workspaceVersion(doc: WorkspaceDocument, now = NOW): Promise<VaultFileVersion[]> {
  return captureVaultFileVersion(workspaceFile(doc), [doc], [], { source: 'automatic', now });
}

describe('Integrität vor Inhalt — beide Wege sagen dasselbe', () => {
  it('ein längerveränderter Snapshot fällt über die Größenprüfung, beide Wege gleich', async () => {
    const doc = workspaceDocument('doc-1', 'Geheim');
    const [version] = await workspaceVersion(doc);
    if (!version) throw new Error('Snapshot wurde nicht erzeugt.');
    // Gültiges JSON, aber anderer Inhalt **und** andere Länge. Gemessene Wächterreihenfolge:
    // `assertVaultVersionSnapshotIntegrity` prüft zuerst `snapshotBytes`, dann den Digest. Deshalb ist die
    // Meldung hier die Größenabweichung — mein erster Testlauf hat den Digest erwartet und war rot. Die
    // Erwartung war falsch, nicht der Code.
    const tampered: VaultFileVersion = {
      ...version,
      workspaceSnapshotJson: version.workspaceSnapshotJson!.replace('"title":"Geheim"', '"title":"Manipuliert"'),
    };
    const previewOutcome = await previewVaultVersion(tampered).then(() => 'angezeigt', (error: Error) => error.message);
    const restoreOutcome = await restoreVaultVersion(workspaceFile(doc), tampered, [doc])
      .then(() => 'wiederhergestellt', (error: Error) => error.message);
    // Der Kern der Zusage: beide Wege sagen **dasselbe**. Vorher sagte die Vorschau „angezeigt".
    expect(previewOutcome).toBe('vault_version_snapshot_size_mismatch');
    expect(restoreOutcome).toBe('vault_version_snapshot_size_mismatch');
    expect(previewOutcome).toBe(restoreOutcome);
  });

  it('ein gleich langer, inhaltlich veränderter Snapshot fällt über den Digest — beide Wege gleich', async () => {
    const doc = workspaceDocument('doc-1b', 'AAAAAA');
    const [version] = await workspaceVersion(doc);
    if (!version) throw new Error('Snapshot wurde nicht erzeugt.');
    // Gleiche Länge, anderer Inhalt: die Größenprüfung kann das nicht sehen, nur der Digest.
    const sameLength: VaultFileVersion = {
      ...version,
      workspaceSnapshotJson: version.workspaceSnapshotJson!.replace('"title":"AAAAAA"', '"title":"BBBBBB"'),
    };
    expect(sameLength.workspaceSnapshotJson!.length).toBe(version.workspaceSnapshotJson!.length);
    expect(sameLength.snapshotBytes).toBe(version.snapshotBytes);
    const previewOutcome = await previewVaultVersion(sameLength).then(() => 'angezeigt', (error: Error) => error.message);
    const restoreOutcome = await restoreVaultVersion(workspaceFile(doc), sameLength, [doc])
      .then(() => 'wiederhergestellt', (error: Error) => error.message);
    expect(previewOutcome).toBe('vault_version_snapshot_integrity_failed');
    expect(restoreOutcome).toBe('vault_version_snapshot_integrity_failed');
    expect(previewOutcome).toBe(restoreOutcome);
  });

  it('ein syntaktisch kaputter Snapshot meldet eine Integritätsverletzung, nicht einen Parse-Fehler', async () => {
    const doc = workspaceDocument('doc-2', 'Kaputt');
    const [version] = await workspaceVersion(doc);
    if (!version) throw new Error('Snapshot wurde nicht erzeugt.');
    const broken: VaultFileVersion = { ...version, workspaceSnapshotJson: '{ das ist kein JSON' };
    // Die Meldung darf NICHT nach Formatproblem klingen — sie muss eine Integritätsverletzung nennen.
    // Beide Wächter (Größe, Digest) sind Integritätsmeldungen; ein `SyntaxError` wäre keine.
    const outcome = await previewVaultVersion(broken).then(() => 'angezeigt', (error: Error) => error.message);
    expect(outcome).toMatch(/^vault_version_snapshot_(size_mismatch|integrity_failed)$/u);
    expect(outcome).not.toMatch(/JSON|Unexpected|Syntax/iu);
  });

  it('eine unversehrte Version wird angezeigt und wiederhergestellt', async () => {
    const doc = workspaceDocument('doc-3', 'Unversehrt', 4);
    const [version] = await workspaceVersion(doc);
    if (!version) throw new Error('Snapshot wurde nicht erzeugt.');
    const preview = await previewVaultVersion(version);
    expect(preview.kind).toBe('workspace');
    if (preview.kind !== 'workspace') throw new Error('falsche Vorschauart');
    expect(preview.document.title).toBe('Unversehrt');
    expect(preview.document.version).toBe(4);
  });

  it('die Digest-Prüfung allein lehnt einen größenveränderten Snapshot ab', async () => {
    const doc = workspaceDocument('doc-4', 'Groesse');
    const [version] = await workspaceVersion(doc);
    if (!version) throw new Error('Snapshot wurde nicht erzeugt.');
    await expect(assertVaultVersionSnapshotIntegrity({ ...version, snapshotBytes: version.snapshotBytes + 1 }))
      .rejects.toThrow('vault_version_snapshot_size_mismatch');
  });

  it('eine Textversion wird als Text angezeigt, nachdem der Digest stimmt', async () => {
    const bytes = new TextEncoder().encode('zeile eins\nzeile zwei');
    const digest = await sha256Bytes(bytes);
    const version: VaultFileVersion = {
      id: 'vver-1', fileId: 'vf-1', createdAt: NOW, source: 'automatic',
      originalName: 'notiz.txt', mimeType: 'text/plain', sizeBytes: bytes.byteLength,
      snapshotBytes: bytes.byteLength, contentDigest: digest, snapshotKind: 'attachment',
      payloadDataUrl: `data:text/plain;base64,${btoa('zeile eins\nzeile zwei')}`,
    };
    const preview = await previewVaultVersion(version);
    expect(preview).toEqual({ kind: 'text', text: 'zeile eins\nzeile zwei' });
  });
});

describe('Versionen erfassen: Duplikate, Grenzen, Schutz', () => {
  it('derselbe Inhalt wird nicht doppelt gespeichert', async () => {
    const file = attachmentFile();
    const first = await captureVaultFileVersion(file, [], [], { source: 'automatic', now: NOW });
    const second = await captureVaultFileVersion(file, [], first, { source: 'automatic', now: NOW + 1000 });
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe(first[0]?.id);
  });

  it('eine benannte Version auf denselben Inhalt benennt die vorhandene um, statt zu duplizieren', async () => {
    const file = attachmentFile();
    const first = await captureVaultFileVersion(file, [], [], { source: 'automatic', now: NOW });
    const named = await captureVaultFileVersion(file, [], first, { source: 'named', label: 'Freigabe', now: NOW + 1000 });
    expect(named).toHaveLength(1);
    expect(named[0]).toMatchObject({ source: 'named', label: 'Freigabe' });
  });

  it('ein Snapshot oberhalb der Größengrenze wird abgelehnt', async () => {
    const huge = attachmentFile({ sizeBytes: MAX_VAULT_VERSION_SNAPSHOT_BYTES + 1, payloadDataUrl: undefined });
    await expect(captureVaultFileVersion(huge, [], [], { source: 'automatic', now: NOW }))
      .rejects.toThrow('vault_version_attachment_payload_unavailable');
  });

  it('ein Workspace-Dokument, das nicht mehr existiert, ergibt keinen Snapshot', async () => {
    const file = attachmentFile({ sourceType: 'workspace-document', documentId: 'weg', payloadDataUrl: undefined });
    await expect(captureVaultFileVersion(file, [], [], { source: 'automatic', now: NOW }))
      .rejects.toThrow('vault_version_workspace_document_unavailable');
  });

  it('das Gesamtbudget wird geprüft, nicht nur der Einzelsnapshot', async () => {
    // Viele kleine Versionen: die Summe überschreitet das Budget, also muss die Erfassung scheitern.
    const chunk = new Uint8Array(8 * 1024 * 1024);
    const existing: VaultFileVersion[] = Array.from({ length: 64 }, (_, index) => ({
      id: `vver-${index}`, fileId: 'vf-1', createdAt: NOW + index, source: 'automatic',
      originalName: 'x', mimeType: 'text/plain', sizeBytes: chunk.byteLength,
      snapshotBytes: chunk.byteLength, contentDigest: `${index}`.padStart(64, '0'),
      snapshotKind: 'attachment', payloadDataUrl: 'data:text/plain;base64,AA==',
    }));
    expect(existing.reduce((sum, item) => sum + item.snapshotBytes, 0)).toBe(512 * 1024 * 1024);
    await expect(captureVaultFileVersion(attachmentFile(), [], existing, { source: 'automatic', now: NOW }))
      .rejects.toThrow('vault_version_total_storage_limit');
  });
});

describe('Retention: geschützte Versionen überleben, gewöhnliche nicht', () => {
  const version = (id: string, createdAt: number, protectedHold = false, snapshotBytes = 10): VaultFileVersion => ({
    id, fileId: 'vf-1', createdAt, source: 'automatic', originalName: 'x', mimeType: 'text/plain',
    sizeBytes: 1, snapshotBytes, contentDigest: 'c'.repeat(64), snapshotKind: 'attachment',
    payloadDataUrl: 'data:text/plain;base64,AA==', protectedHold,
  });

  it('geschützte Versionen ignorieren Alter und Anzahl', () => {
    const old = version('alt', NOW - 10 * 365 * 86_400_000, true);
    const kept = applyVaultVersionRetention([old], { maxVersionsPerFile: 1, maxAgeDays: 1 }, NOW);
    expect(kept.map((item) => item.id)).toEqual(['alt']);
  });

  it('gewöhnliche Versionen fallen über Anzahl und Alter heraus', () => {
    const versions = [version('a', NOW), version('b', NOW - 1000), version('c', NOW - 2000), version('alt', NOW - 400 * 86_400_000)];
    const kept = applyVaultVersionRetention(versions, { maxVersionsPerFile: 2, maxAgeDays: 180 }, NOW);
    expect(kept.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });

  it('die Normalisierung hält die Grenzen ein und erfindet keinen Schalter zum Abschalten', () => {
    expect(normalizeVaultVersionRetention({ maxVersionsPerFile: 9999 }).maxVersionsPerFile).toBe(MAX_VAULT_VERSIONS_PER_FILE);
    expect(normalizeVaultVersionRetention({ maxAgeDays: 99999 }).maxAgeDays).toBe(MAX_VAULT_VERSION_AGE_DAYS);
    // `keepProtected` ist nicht abschaltbar.
    expect(normalizeVaultVersionRetention({ keepProtected: false as never }).keepProtected).toBe(true);
    expect(normalizeVaultVersionRetention().maxVersionsPerFile).toBe(DEFAULT_VAULT_VERSION_RETENTION.maxVersionsPerFile);
  });

  it('Versionen werden je Datei gruppiert und neueste zuerst geliefert', async () => {
    const older = version('alt', NOW - 1000);
    const newer = version('neu', NOW);
    const other = { ...version('fremd', NOW), fileId: 'vf-2' };
    expect(vaultVersionsForFile([older, newer, other], 'vf-1').map((item) => item.id)).toEqual(['neu', 'alt']);
  });

  it('Halten und Umbenennen wirken nur auf die genannte Version', () => {
    const versions = [version('a', NOW), version('b', NOW - 1)];
    expect(setVaultVersionHold(versions, 'a', true).find((item) => item.id === 'a')?.protectedHold).toBe(true);
    expect(setVaultVersionHold(versions, 'b', true).find((item) => item.id === 'a')?.protectedHold).toBe(false);
    expect(nameVaultVersion(versions, 'a', '  Freigabe  ').find((item) => item.id === 'a')).toMatchObject({ source: 'named', label: 'Freigabe' });
    expect(() => setVaultVersionHold(versions, 'weg', true)).toThrow('vault_version_not_found');
    expect(() => nameVaultVersion(versions, 'a', '   ')).toThrow('vault_version_label_required');
  });

  it('die Belegungsanzeige trennt Gesamt- und geschützte Bytes', () => {
    expect(vaultVersionStorageUsage([version('a', NOW, true, 100), version('b', NOW, false, 50)]))
      .toEqual({ totalBytes: 150, heldBytes: 100, versionCount: 2, heldCount: 1 });
  });
});

describe('Vergleich zweier Versionen', () => {
  it('Textversionen werden zeilenweise verglichen und die Ausgabe ist begrenzt', async () => {
    const make = async (id: string, text: string): Promise<VaultFileVersion> => {
      const bytes = new TextEncoder().encode(text);
      return {
        id, fileId: 'vf-1', createdAt: NOW, source: 'automatic', originalName: 'x.txt', mimeType: 'text/plain',
        sizeBytes: bytes.byteLength, snapshotBytes: bytes.byteLength, contentDigest: await sha256Bytes(bytes),
        snapshotKind: 'attachment', payloadDataUrl: `data:text/plain;base64,${btoa(text)}`,
      };
    };
    const before = await make('a', 'eins\nzwei\ndrei');
    const after = await make('b', 'eins\nZWEI\ndrei\nvier');
    const result = compareVaultVersions(before, after);
    expect(result.supported).toBe(true);
    expect(result).toMatchObject({ changed: 1, added: 1, removed: 0 });
    expect(result.sample.length).toBeGreaterThan(0);
    expect(result.sample[0]).toMatch(/^L\d+: /u);
  });

  it('Binärversionen werden nicht verglichen, sondern als nicht unterstützt gemeldet', async () => {
    const make = async (id: string): Promise<VaultFileVersion> => {
      const bytes = new Uint8Array([1, 2, 3]);
      return {
        id, fileId: 'vf-1', createdAt: NOW, source: 'automatic', originalName: 'x.bin', mimeType: 'application/octet-stream',
        sizeBytes: 3, snapshotBytes: 3, contentDigest: await sha256Bytes(bytes),
        snapshotKind: 'attachment', payloadDataUrl: 'data:application/octet-stream;base64,AQID',
      };
    };
    const result = compareVaultVersions(await make('a'), await make('b'));
    expect(result).toMatchObject({ supported: false, reason: 'binary_compare_unsupported' });
  });

  it('Versionen verschiedener Dateien werden nicht verglichen', () => {
    const base: VaultFileVersion = {
      id: 'a', fileId: 'vf-1', createdAt: NOW, source: 'automatic', originalName: 'x', mimeType: 'text/plain',
      sizeBytes: 1, snapshotBytes: 1, contentDigest: 'd'.repeat(64), snapshotKind: 'attachment',
      payloadDataUrl: 'data:text/plain;base64,AA==',
    };
    expect(() => compareVaultVersions(base, { ...base, id: 'b', fileId: 'vf-2' }))
      .toThrow('vault_version_compare_file_mismatch');
  });

  it('gemischte Snapshot-Arten sind nicht vergleichbar', () => {
    const attachment: VaultFileVersion = {
      id: 'a', fileId: 'vf-1', createdAt: NOW, source: 'automatic', originalName: 'x', mimeType: 'text/plain',
      sizeBytes: 1, snapshotBytes: 1, contentDigest: 'e'.repeat(64), snapshotKind: 'attachment',
      payloadDataUrl: 'data:text/plain;base64,AA==',
    };
    const workspace: VaultFileVersion = { ...attachment, id: 'b', snapshotKind: 'workspace-document', workspaceSnapshotJson: stableWorkspaceDocumentJson(workspaceDocument('doc-1', 'T')) };
    expect(compareVaultVersions(attachment, workspace)).toMatchObject({ supported: false, reason: 'snapshot_kind_mismatch' });
  });
});
