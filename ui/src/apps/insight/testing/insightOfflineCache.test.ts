// STATUS: PLATIN — BATCH-INSIGHT-8: the offline snapshot really exists, is encrypted and survives Save/Reopen.
//
// MEASURED FACTS before this batch: `sealCacheEntry`/`openCacheEntry`/`updateCacheMetadata` and
// `offlineSnapshotState` existed with no importer, `InsightCacheMetadata` had no field for the
// ciphertext, and `cache.usedBytes` stayed 0 forever - so the offline promise could never be kept.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DEFAULT_INSIGHT_MODEL, type InsightDocumentModel } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { REFRESH_LIMITS, offlineSnapshotState } from '../refresh/insightRefreshEngine';
import {
  INSIGHT_CACHE_KDF,
  INSIGHT_SNAPSHOT_LIMITS,
  deriveInsightCacheKey,
  insightSnapshotSummary,
  openInsightSnapshot,
  sealInsightSnapshot,
} from '../refresh/insightOfflineCache';
import { compareInsightModels, packInsightDocument, reopenInsightDocument } from '../interchange/insightNativeInterchange';

const PASSWORD = 'offline-snapshot-passphrase';
const DOCUMENT_ID = 'insight-offline-test';
const model = (): InsightDocumentModel => structuredClone(DEFAULT_INSIGHT_MODEL);
const document = (insightData: unknown) => ({
  id:DOCUMENT_ID, kind:'Insight', title:'Offline', created_at:1_700_000_000_000, modified_at:1_700_000_001_000,
  version:2, root_object_ids:[], objects:{}, insightData,
} as unknown as WorkspaceDocument);

describe('Insight offline snapshot (real AES-GCM)', () => {
  it('seals the records into the document cache and reads them back from the ciphertext', async () => {
    const sealed = await sealInsightSnapshot(model(), { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    expect(sealed.cache.snapshotAt).toBeGreaterThan(0);
    expect(sealed.cache.usedBytes).toBeGreaterThan(0);
    expect(sealed.cache.usedBytes).toBeLessThanOrEqual(REFRESH_LIMITS.maxCacheBytes);
    expect(sealed.cache.partitionKeys).toEqual(['full']);
    expect(sealed.cache.sourceState).toBe('fresh');
    expect(sealed.revision).toBe(model().revision + 1);
    const serialized = sealed.cache.snapshotCiphertext ?? '';
    expect(serialized.length).toBeGreaterThan(64);
    // The ciphertext is really encrypted: none of the row content is readable in it.
    expect(serialized).not.toContain('Europe-Central');
    expect(serialized.toLowerCase()).not.toContain('sovereign mesh');

    const opened = await openInsightSnapshot(sealed, { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    expect(opened.partitions).toBe(1);
    expect(opened.rowCount).toBe(model().records.length);
    expect(opened.rows.map((row) => row.id)).toEqual(model().records.map((row) => row.id));
    expect(opened.rows[0].revenue).toBe(model().records[0].revenue);
  });

  it('reads the snapshot content, not the live records', async () => {
    // Seal two rows, then change the document to one row: verification must still report two.
    const two = { ...model(), records: model().records.slice(0, 2) };
    const sealed = await sealInsightSnapshot(two, { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    const changed = { ...sealed, records: sealed.records.slice(0, 1) };
    const opened = await openInsightSnapshot(changed, { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    expect(opened.rowCount).toBe(2);
    expect(opened.rows.map((row) => row.id)).toEqual(two.records.map((row) => row.id));
  });

  it('refuses the wrong passphrase and a tampered ciphertext instead of returning rows', async () => {
    const sealed = await sealInsightSnapshot(model(), { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    await expect(openInsightSnapshot(sealed, { documentId:DOCUMENT_ID, passphrase:'not the passphrase' })).rejects.toThrowError('cache-authentication-failed');
    // A different document id derives a different key too.
    await expect(openInsightSnapshot(sealed, { documentId:'another-document', passphrase:PASSWORD })).rejects.toThrowError('cache-authentication-failed');
    const tampered = { ...sealed, cache:{ ...sealed.cache, snapshotCiphertext:`${(sealed.cache.snapshotCiphertext ?? '').slice(0, -8)}AAAAAAAA` } };
    await expect(openInsightSnapshot(tampered, { documentId:DOCUMENT_ID, passphrase:PASSWORD })).rejects.toBeInstanceOf(Error);
  });

  it('refuses an empty dataset, an oversized payload and a corrupt snapshot by name', async () => {
    await expect(sealInsightSnapshot({ ...model(), records:[] }, { documentId:DOCUMENT_ID, passphrase:PASSWORD })).rejects.toThrowError('insight-snapshot-empty');
    await expect(sealInsightSnapshot(model(), { documentId:DOCUMENT_ID, passphrase:'   ' })).rejects.toThrowError(InsightError);
    await expect(openInsightSnapshot(model(), { documentId:DOCUMENT_ID, passphrase:PASSWORD })).rejects.toThrowError('insight-snapshot-missing');
    const corrupt = { ...model(), cache:{ ...model().cache, snapshotAt:1, snapshotCiphertext:'not json' } };
    await expect(openInsightSnapshot(corrupt, { documentId:DOCUMENT_ID, passphrase:PASSWORD })).rejects.toThrowError('insight-snapshot-corrupt');
    const tooLong = { ...model(), cache:{ ...model().cache, snapshotAt:1, snapshotCiphertext:'x'.repeat(INSIGHT_SNAPSHOT_LIMITS.maxCiphertextChars + 1) } };
    await expect(openInsightSnapshot(tooLong, { documentId:DOCUMENT_ID, passphrase:PASSWORD })).rejects.toThrowError('insight-snapshot-limit');
  });

  it('honours the cache quota from the shared refresh engine', async () => {
    const tiny = { ...model(), cache:{ ...model().cache, quotaBytes:16 } };
    await expect(sealInsightSnapshot(tiny, { documentId:DOCUMENT_ID, passphrase:PASSWORD })).rejects.toThrowError('cache-quota-exceeded');
  });

  it('lets offlineSnapshotState tell the truth before and after sealing', async () => {
    expect(offlineSnapshotState(model(), false)).toMatchObject({ usable:false });
    const sealed = await sealInsightSnapshot(model(), { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    const offline = offlineSnapshotState(sealed, false);
    expect(offline.usable).toBe(true);
    expect(offline.timestamp).toBe(sealed.cache.snapshotAt);
    expect(offline.label).toContain('Offline snapshot');
    // The summary the UI may show without the passphrase is bounded and honest.
    expect(insightSnapshotSummary(sealed.cache)).toMatchObject({ present:true, partitions:1 });
    expect(insightSnapshotSummary(model().cache).present).toBe(false);
  });

  it('keeps the sealed snapshot across an encrypted Save/Close/Reopen', async () => {
    const sealed = await sealInsightSnapshot(model(), { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    const bytes = await packInsightDocument(document(sealed), sealed, { password:PASSWORD });
    const reopened = await reopenInsightDocument(bytes, { password:PASSWORD });
    expect(compareInsightModels(sealed, reopened.model)).toEqual({ identical: true });
    // The snapshot that came back is still openable with the snapshot passphrase.
    const opened = await openInsightSnapshot(reopened.model, { documentId:DOCUMENT_ID, passphrase:PASSWORD });
    expect(opened.rowCount).toBe(sealed.records.length);
    expect(offlineSnapshotState(reopened.model, false).usable).toBe(true);
  });

  it('derives a key with the documented cost instead of a bare hash', async () => {
    expect(INSIGHT_CACHE_KDF.iterations).toBeGreaterThanOrEqual(100_000);
    expect(INSIGHT_CACHE_KDF.hash).toBe('SHA-256');
    const key = await deriveInsightCacheKey(PASSWORD, DOCUMENT_ID);
    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.usages).toContain('decrypt');
    // The same inputs derive the same key material (deterministic per document), different ones do not.
    const same = await deriveInsightCacheKey(PASSWORD, DOCUMENT_ID);
    const other = await deriveInsightCacheKey(PASSWORD, 'other-document');
    const probe = new TextEncoder().encode('probe');
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const sealedWithSame = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name:'AES-GCM', iv }, same, probe));
    await expect(globalThis.crypto.subtle.decrypt({ name:'AES-GCM', iv }, other, sealedWithSame)).rejects.toBeInstanceOf(Error);
    await expect(globalThis.crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, sealedWithSame)).resolves.toBeInstanceOf(ArrayBuffer);
  });
});
