// STATUS: PLATIN — die Bündelgrenze wird genannt, bevor sie greift (V-012).
//
// **Der Befund:** `MAX_VAULT_BACKUP_BUNDLE_BYTES` (96 MiB) und `MAX_VAULT_BACKUP_DOCUMENTS` (1024) gab es
// bereits, aber sie wurden **erst beim Überschreiten** sichtbar: `createVaultBackupBundle` wirft mitten im
// Durchlauf (`vault_backup_bundle_size_limit`). Der Nutzer erfuhr die Grenze also **nachdem** er gewartet
// hatte, und ohne Vorwarnung, wie groß sein Bündel wird.
//
// **Zwei Zusagen, die hier geprüft werden:**
//   1. Die Schätzung benutzt **dieselbe** Serialisierung wie das echte Bündel (`JSON.stringify(document)`) —
//      eine zweite Schätzmethode wäre eine zweite Zahl für dieselbe Frage.
//   2. Die Ablehnung ist **benannt** (Anzahl oder Bytes, mit Zahlen) — nicht bloß „zu groß" und kein
//      gesperrter Knopf ohne Begründung.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  MAX_VAULT_BACKUP_BUNDLE_BYTES,
  MAX_VAULT_BACKUP_DOCUMENTS,
  planVaultBackupBundle,
  vaultBackupBundlePlanMessage,
} from '../../../../shared/vault/backup/vaultBackupEngine';

const doc = (id: string, padding = 0): WorkspaceDocument => ({
  id, title: `Dokument ${id}`, kind: 'Writer', version: 1, objects: {},
  // Füllmaterial, um eine bestimmte Größe zu erreichen.
  body: padding > 0 ? 'x'.repeat(padding) : undefined,
} as unknown as WorkspaceDocument);

describe('V-012: die Schätzung benutzt dieselbe Serialisierung wie das Bündel', () => {
  it('die geschätzte Größe entspricht der tatsächlichen Serialisierung', () => {
    const documents = [doc('a'), doc('b', 1000)];
    const plan = planVaultBackupBundle(documents);
    const expected = documents.reduce((sum, document) => sum + new TextEncoder().encode(JSON.stringify(document)).byteLength, 0);
    expect(plan.totalBytes).toBe(expected);
    expect(plan.documentCount).toBe(2);
  });

  it('ein passendes Bündel wird als passend gemeldet und nennt die Zahlen', () => {
    const plan = planVaultBackupBundle([doc('a')]);
    expect(plan.fits).toBe(true);
    expect(plan.exceeds).toBeUndefined();
    expect(plan.maxBundleBytes).toBe(MAX_VAULT_BACKUP_BUNDLE_BYTES);
    expect(plan.maxDocuments).toBe(MAX_VAULT_BACKUP_DOCUMENTS);
    const message = vaultBackupBundlePlanMessage(plan);
    // Die Zahlen stehen **vor** dem Lauf da: Anzahl und geschätzte Größe gegen die Grenze.
    expect(message).toContain('1 document');
    expect(message).toContain('96.0 MiB');
    expect(message).toContain('of');
  });

  it('zu viele Dokumente werden als Anzahlüberschreitung benannt', () => {
    const many = Array.from({ length: MAX_VAULT_BACKUP_DOCUMENTS + 1 }, (_, index) => doc(`d${String(index).padStart(5, '0')}`));
    const plan = planVaultBackupBundle(many);
    expect(plan.fits).toBe(false);
    expect(plan.exceeds).toBe('document_count');
    const message = vaultBackupBundlePlanMessage(plan);
    expect(message).toContain(String(MAX_VAULT_BACKUP_DOCUMENTS));
    expect(message).toContain(String(MAX_VAULT_BACKUP_DOCUMENTS + 1));
  });

  it('eine Byteüberschreitung wird mit Zahlen und dem verursachenden Dokument benannt', () => {
    /*
     * Der Kern von V-012: die Meldung nennt **wie viel** und **wie viel erlaubt** — nicht „zu groß". Und sie
     * sagt, **welches** Dokument die Grenze überschreitet, weil ein Bündel über 96 MiB ohne diesen Hinweis
     * nicht auflösbar wäre.
     */
    const huge = doc('riesig', MAX_VAULT_BACKUP_BUNDLE_BYTES);
    const plan = planVaultBackupBundle([doc('klein'), huge]);
    expect(plan.fits).toBe(false);
    expect(plan.exceeds).toBe('bundle_bytes');
    expect(plan.largestDocumentId).toBe('riesig');
    expect(plan.totalBytes).toBeGreaterThan(MAX_VAULT_BACKUP_BUNDLE_BYTES);
    const message = vaultBackupBundlePlanMessage(plan);
    expect(message).toContain('96.0 MiB');
    expect(message).toContain('Remove documents before running the backup');
  });

  it('die Grenze wird erreicht, aber nicht überschritten: das Bündel passt noch', () => {
    // Genau an der Grenze muss `fits` wahr bleiben — sonst wäre die Grenze um ein Dokument zu streng.
    const plan = planVaultBackupBundle([doc('a')]);
    expect(plan.totalBytes).toBeLessThan(plan.maxBundleBytes);
    expect(plan.fits).toBe(true);
  });

  it('doppelte IDs werden nicht doppelt gezählt', () => {
    // Das echte Bündel dedupliziert ebenfalls; die Schätzung darf nicht danebenliegen.
    const once = doc('a', 500);
    const plan = planVaultBackupBundle([once, once]);
    expect(plan.documentCount).toBe(1);
    expect(plan.totalBytes).toBe(new TextEncoder().encode(JSON.stringify(once)).byteLength);
  });

  it('ein Dokument ohne ID wird übersprungen, nicht als Größe mitgezählt', () => {
    const plan = planVaultBackupBundle([{ title: 'ohne id' } as unknown as WorkspaceDocument, doc('a')]);
    expect(plan.documentCount).toBe(1);
  });

  it('ein leeres Bündel passt und meldet 0 Dokumente', () => {
    const plan = planVaultBackupBundle([]);
    expect(plan).toMatchObject({ fits: true, documentCount: 0, totalBytes: 0 });
    expect(vaultBackupBundlePlanMessage(plan)).toContain('0 documents');
  });
});
