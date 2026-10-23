// STATUS: PLATIN — BATCH-INSIGHT-8: an offline snapshot that really exists on disk.
//
// MEASURED FACTS before this batch: `refresh/insightRefreshEngine` could seal and open encrypted cache
// entries (`sealCacheEntry`, `openCacheEntry`, `createAesGcmCacheCipher`, `updateCacheMetadata`) and
// `offlineSnapshotState` even read `cache.snapshotAt` — but NO component ever wrote a snapshot, and the
// cache metadata had no field that could carry the ciphertext, so the offline branch could never become
// true. This module seals a real snapshot with the platform AES-GCM cipher, stores the ciphertext in the
// document's own cache metadata (so it survives the encrypted Save/Reopen) and reads it back.
import type { InsightCacheMetadata, InsightDocumentModel, InsightRow } from '../domain/types';
import { InsightError, cleanText } from '../core/insightCore';
import {
  REFRESH_LIMITS,
  createAesGcmCacheCipher,
  openCacheEntry,
  partitionRows,
  sealCacheEntry,
  updateCacheMetadata,
  type InsightCacheCipher,
  type InsightCacheEntry,
} from './insightRefreshEngine';
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';

/** One key-derivation definition for the offline snapshot: per-document salt, documented cost. */
export const INSIGHT_CACHE_KDF = { iterations: 120_000, hash: 'SHA-256' as const, algorithm: 'AES-GCM' as const } as const;
export const INSIGHT_SNAPSHOT_LIMITS = { maxCiphertextChars: 4 * 1024 * 1024 } as const;

function saltFor(documentId: string): Uint8Array {
  // Deterministic per-document salt: it must be reproducible at reopen time and the container itself is
  // already authenticated, so the salt only has to separate documents.
  return new TextEncoder().encode(`vgt-insight-cache:${documentId}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
  }
  return btoa(binary);
}
function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

interface SerializedEntry { id:string; sourceId:string; partitionKey:string; createdAt:number; rowCount:number; byteLength:number; ciphertext:string; }
function serializeEntries(entries: readonly InsightCacheEntry[]): string {
  const payload: SerializedEntry[] = entries.map((entry) => ({
    id:entry.id, sourceId:entry.sourceId, partitionKey:entry.partitionKey, createdAt:entry.createdAt,
    rowCount:entry.rowCount, byteLength:entry.byteLength, ciphertext:bytesToBase64(entry.ciphertext),
  }));
  return JSON.stringify(payload);
}
function deserializeEntries(text: string): InsightCacheEntry[] {
  if (text.length > INSIGHT_SNAPSHOT_LIMITS.maxCiphertextChars) throw new InsightError('insight-snapshot-limit');
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { throw new InsightError('insight-snapshot-corrupt'); }
  if (!Array.isArray(parsed)) throw new InsightError('insight-snapshot-corrupt');
  return parsed.map((raw) => {
    const entry = raw as Partial<SerializedEntry>;
    if (typeof entry.id !== 'string' || typeof entry.partitionKey !== 'string' || typeof entry.ciphertext !== 'string' || typeof entry.rowCount !== 'number' || typeof entry.byteLength !== 'number') {
      throw new InsightError('insight-snapshot-corrupt');
    }
    return { id:entry.id, sourceId:String(entry.sourceId ?? ''), partitionKey:entry.partitionKey, createdAt:Number(entry.createdAt ?? 0), rowCount:entry.rowCount, byteLength:entry.byteLength, ciphertext:base64ToBytes(entry.ciphertext) };
  });
}

export async function deriveInsightCacheKey(passphrase: string, documentId: string): Promise<CryptoKey> {
  const secret = cleanText(passphrase, 1024);
  const material = await globalThis.crypto.subtle.importKey('raw', toOwnedArrayBuffer(new TextEncoder().encode(secret)), { name:'PBKDF2' }, false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    { name:'PBKDF2', salt:toOwnedArrayBuffer(saltFor(cleanText(documentId, 256))), iterations:INSIGHT_CACHE_KDF.iterations, hash:INSIGHT_CACHE_KDF.hash },
    material,
    { name:INSIGHT_CACHE_KDF.algorithm, length:256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function insightCacheCipher(passphrase: string, documentId: string): Promise<InsightCacheCipher> {
  return createAesGcmCacheCipher(await deriveInsightCacheKey(passphrase, documentId));
}

/**
 * Seal the visible records into the document's own cache metadata. The ciphertext travels with the
 * document, so the offline promise survives Save/Close/Reopen; an empty dataset is refused by name
 * because a snapshot of nothing would be a promise the app cannot keep.
 */
export async function sealInsightSnapshot(model: InsightDocumentModel, options:{ documentId:string; passphrase:string }): Promise<InsightDocumentModel> {
  if (!model.records.length) throw new InsightError('insight-snapshot-empty');
  const cipher = await insightCacheCipher(options.passphrase, options.documentId);
  const sourceId = model.sources.find((source) => source.enabled)?.id ?? 'src-local';
  const partitions = partitionRows(model.records, model.refresh.incremental);
  if (partitions.length > REFRESH_LIMITS.maxPartitions) throw new InsightError('incremental-partition-count-limit');
  const entries: InsightCacheEntry[] = [];
  for (const partition of partitions) entries.push(await sealCacheEntry(sourceId, partition.key, partition.rows, cipher));
  const metadata = updateCacheMetadata({ ...model.cache, enabled:true }, entries, 'fresh');
  return {
    ...model,
    revision: model.revision + 1,
    cache: { ...metadata, snapshotCiphertext: serializeEntries(entries) },
  };
}

export interface InsightSnapshotRead { rows: InsightRow[]; partitions: number; rowCount: number; }
/**
 * Open the snapshot that travels with the document. The rows come out of the ciphertext, never from the
 * live records, so a verification cannot accidentally confirm itself.
 */
export async function openInsightSnapshot(model: InsightDocumentModel, options:{ documentId:string; passphrase:string }): Promise<InsightSnapshotRead> {
  const serialized = model.cache.snapshotCiphertext;
  if (!serialized) throw new InsightError('insight-snapshot-missing');
  const entries = deserializeEntries(serialized);
  const cipher = await insightCacheCipher(options.passphrase, options.documentId);
  const rows: InsightRow[] = [];
  for (const entry of entries) rows.push(...await openCacheEntry(entry, cipher));
  return { rows, partitions: entries.length, rowCount: rows.length };
}

export interface InsightSnapshotSummary { present:boolean; partitions:number; rows:number; bytes:number; sealedAt?:number; }
/** What the UI may claim about the snapshot without holding the passphrase. */
export function insightSnapshotSummary(cache: InsightCacheMetadata): InsightSnapshotSummary {
  const present = Boolean(cache.snapshotCiphertext) && Boolean(cache.snapshotAt);
  return { present, partitions:cache.partitionKeys.length, rows:0, bytes:cache.usedBytes, sealedAt:cache.snapshotAt };
}
