import type {
  DocumentKind,
  VaultChunkIntegrityManifest,
  VaultFile,
  VaultIntegrityAuditReport,
  WorkspaceDocument,
} from '../../contracts/workspace';
import { inferVaultFileAssociation } from '../files/vaultFileSystemEngine';
import { VAULT_MAX_NAME_LENGTH } from '../files/vaultNames';

export const MAX_VAULT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/**
 * Grenzen eines Vault-**Importvorgangs**. Sie stehen bewusst hier neben `MAX_VAULT_ATTACHMENT_BYTES` und
 * nicht in einem zweiten Modul: bevor diese Zeilen existierten, hatte derselbe Importpfad zwei
 * verschiedene Obergrenzen (25 MiB hier, 128 MiB in `preview/vaultPreviewQuarantineEngine.ts`) und lehnte
 * einen 40-MiB-Anhang mit zwei unterschiedlichen Begründungen ab — einmal „innerhalb der Grenzen", einmal
 * „zu groß". Eine Tatsache, eine Konstante: `preview/vaultPreviewQuarantineEngine.ts` und
 * `shared/vault/vaultImports.ts` lesen ab jetzt ausschließlich diese Werte.
 *
 * **Warum die Prüffunktionen ebenfalls hier stehen und nicht in `vaultImports.ts`:** `vaultImports.ts`
 * wird derzeit **nur von seinem eigenen Test** importiert. Ein Modul, das nur sein Test kennt, ist laut
 * Auftrag keine erreichbare Funktion (die Lehre aus AST-0238). Die Grenzprüfung liegt deshalb in dieser
 * Datei, die nachweislich von `vaultPreviewQuarantineEngine.ts`, `vaultFileSystemEngine.ts` und weiteren
 * Produktionsmodulen importiert wird. `vaultImports.ts` bleibt die Kompositionsschicht für die
 * Reihenfolge „prüfen → Anhang erzeugen → Sandbox-Prüfung" und wird erst mit der Laufzeitverdrahtung
 * erreichbar; das ist als `VaultImportCompositionReachability`-Vertrag ausdrücklich festgehalten, statt
 * als erledigt ausgegeben.
 */
export const VAULT_IMPORT_MAX_FILE_BYTES = MAX_VAULT_ATTACHMENT_BYTES;
export const VAULT_IMPORT_MAX_FILES = 256;
export const VAULT_IMPORT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/**
 * Die Grenze kommt aus `../files/vaultNames` (Blatt-Modul), damit kein Import-Zyklus entsteht:
 * `vaultIntegrity` → `vaultFileSystemEngine` → `vaultNames` durfte nicht durch einen Rückimport
 * geschlossen werden (nativer Chunk-Crash, siehe `vaultNames.ts`). Der Wert bleibt unter diesem
 * Namen öffentlich, damit alle bestehenden Importe unverändert funktionieren.
 */
export const VAULT_IMPORT_MAX_NAME_LENGTH = VAULT_MAX_NAME_LENGTH;
export const VAULT_INTEGRITY_CHUNK_BYTES = 64 * 1024;
export const MAX_VAULT_INTEGRITY_FILES = 10_000;
export const MAX_VAULT_INTEGRITY_CHUNKS = 4096;
export const MAX_VAULT_AUDIT_HISTORY = 32;

/** Kandidat für eine Grenzprüfung, bevor irgendein Byte gelesen wird. */
export interface VaultImportCandidate {
  /** Anzeigename, wie er im Manifest stehen würde (noch nicht validiert). */
  name: string;
  /** Gemeldete Größe in Bytes (`File.size`), nicht dekodierte Länge. */
  sizeBytes: number;
}

export interface VaultImportPlan {
  fileCount: number;
  totalBytes: number;
  largestFileBytes: number;
}

export interface VaultImportLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxNameLength: number;
}

export const VAULT_IMPORT_LIMITS: VaultImportLimits = Object.freeze({
  maxFiles: VAULT_IMPORT_MAX_FILES,
  maxFileBytes: VAULT_IMPORT_MAX_FILE_BYTES,
  maxTotalBytes: VAULT_IMPORT_MAX_TOTAL_BYTES,
  maxNameLength: VAULT_IMPORT_MAX_NAME_LENGTH,
});

/** Eine Verletzung wird **benannt**, damit der Nutzer erfährt, welche Grenze griff. */
export function vaultImportLimitMessage(violation: string): string {
  switch (violation) {
    case 'count': return `A single Vault import accepts at most ${VAULT_IMPORT_MAX_FILES} files.`;
    case 'file_bytes': return `A single Vault entry accepts at most ${Math.floor(VAULT_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MiB.`;
    case 'total_bytes': return `A single Vault import accepts at most ${Math.floor(VAULT_IMPORT_MAX_TOTAL_BYTES / (1024 * 1024))} MiB in total.`;
    case 'name': return `A Vault entry name accepts at most ${VAULT_IMPORT_MAX_NAME_LENGTH} characters.`;
    case 'empty_batch': return 'A Vault import needs at least one file.';
    case 'empty_file': return 'A Vault entry needs at least one byte.';
    default: return 'The Vault import exceeds a configured bound.';
  }
}

export class VaultImportLimitError extends Error {
  readonly violation: string;

  /**
   * `message` ist optional: die Importgrenzen bilden ihren Text aus `violation`, die **Batch**-Grenzen
   * (V-006) brauchen einen Text, der den **Vorgang** nennt („a single Vault copy accepts at most …").
   *
   * **Der Präfix bleibt in beiden Fällen erhalten** — `vault_import_batch_count: <Text>`. Mein erster
   * Entwurf ersetzte die ganze Meldung durch `message`; damit war der Verstoß nicht mehr aus dem Fehler
   * ablesbar, und die Tests, die auf `vault_import_batch_count` prüfen, waren aus dem **richtigen** Grund rot.
   */
  constructor(violation: string, message?: string) {
    super(message ? `vault_import_${violation}: ${message}` : `vault_import_${violation}: ${vaultImportLimitMessage(violation)}`);
    this.name = 'VaultImportLimitError';
    this.violation = violation;
  }
}

function vaultImportViolationOf(candidate: VaultImportCandidate): string | null {
  if (!Number.isSafeInteger(candidate.sizeBytes) || candidate.sizeBytes <= 0) return 'empty_file';
  if (candidate.sizeBytes > VAULT_IMPORT_MAX_FILE_BYTES) return 'file_bytes';
  if (candidate.name.length > VAULT_IMPORT_MAX_NAME_LENGTH) return 'name';
  return null;
}

/**
 * Prüft den **gesamten** Stapel, bevor ein einziges Byte gelesen wird. Das ist der Unterschied zwischen
 * „ablehnen" und „halb importiert": scheitert Datei 200 von 300 an der Byte-Grenze, bleibt der Vault
 * unverändert statt 199 Einträge zu erhalten und dann abzubrechen.
 *
 * Die Prüfung läuft über **gemeldete** Größen (`File.size`), nicht über dekodierte Data-URLs: eine
 * Größenprüfung darf selbst keinen Speicher in der Größenordnung des Anhangs belegen.
 */
export function assertVaultImportWithinLimits(
  candidates: readonly VaultImportCandidate[],
  limits: VaultImportLimits = VAULT_IMPORT_LIMITS,
): VaultImportPlan {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new VaultImportLimitError('empty_batch');
  if (candidates.length > limits.maxFiles) throw new VaultImportLimitError('count');
  let totalBytes = 0;
  let largestFileBytes = 0;
  for (const candidate of candidates) {
    const violation = vaultImportViolationOf(candidate);
    if (violation) throw new VaultImportLimitError(violation);
    totalBytes += candidate.sizeBytes;
    if (totalBytes > limits.maxTotalBytes) throw new VaultImportLimitError('total_bytes');
    if (candidate.sizeBytes > largestFileBytes) largestFileBytes = candidate.sizeBytes;
  }
  return { fileCount: candidates.length, totalBytes, largestFileBytes };
}

/** Nur für Diagnose/Statusanzeige: was der Vault aktuell belegt. */
export function vaultImportUsage(files: readonly Pick<VaultFile, 'sizeBytes'>[]) {
  return {
    count: files.length,
    bytes: files.reduce((sum, file) => sum + Math.max(0, file.sizeBytes || 0), 0),
  };
}

/**
 * **V-006 — eine Obergrenze für Batch-Operationen.**
 *
 * **Der Befund:** Verschieben, Kopieren und Duplizieren konnten eine **beliebig große** Auswahl auf einmal
 * verarbeiten. Es gab keine Grenze: weder eine Zahl noch eine Byte-Grenze noch eine Rückfrage. Zwei Folgen,
 * und beide sind echt:
 *   • **Speicher:** `copyVaultFiles`/`duplicateVaultFiles` erzeugen neue Einträge, und bei Anhängen trägt
 *     jeder Eintrag seine Nutzlast als Base64-Zeichenkette. Tausend 25-MiB-Anhänge auf einmal zu
 *     duplizieren ist keine Bedienhandlung mehr, sondern ein Speicherunfall.
 *   • **Unumkehrbarkeit:** ein versehentliches „Alles auswählen" + „Kopieren" ist ohne Grenze ein Vorgang,
 *     den niemand mehr überschaut. Eine Grenze macht daraus eine benannte Ablehnung.
 *
 * **Keine zweite Autorität:** die Zahl leitet sich aus der **vorhandenen** Importgrenze ab — eine
 * Batch-Operation ist der zweite Weg, auf dem Nutzlast in den Vault kommt. Zwei Zahlen für dieselbe Frage
 * wären genau die Doppelung, die dieses Projekt mehrfach bezahlt hat.
 */
export const VAULT_BATCH_MAX_FILES = VAULT_IMPORT_MAX_FILES;

export type VaultBatchOperation = 'move' | 'copy' | 'duplicate';

export const VAULT_BATCH_OPERATIONS: readonly VaultBatchOperation[] = Object.freeze(['move', 'copy', 'duplicate']);

/** Nur die Vorgänge, die **Nutzlast** vervielfachen und deshalb zusätzlich über die Bytes begrenzt sind. */
const VAULT_BATCH_BYTE_BOUNDED: ReadonlySet<VaultBatchOperation> = new Set<VaultBatchOperation>(['copy', 'duplicate']);

export function vaultBatchLimitMessage(operation: VaultBatchOperation, reason: 'count' | 'total_bytes' | 'empty'): string {
  if (reason === 'empty') return `A Vault ${operation} needs at least one entry.`;
  if (reason === 'count') return `A single Vault ${operation} accepts at most ${VAULT_BATCH_MAX_FILES} entries. Select fewer entries and repeat the operation.`;
  return `A single Vault ${operation} accepts at most ${Math.floor(VAULT_IMPORT_MAX_TOTAL_BYTES / (1024 * 1024))} MiB in total, because it multiplies the stored payload.`;
}

/**
 * Prüft eine Batch-Auswahl **vor** der Ausführung. Gibt die geprüfte Auswahl zurück (dieselbe Liste, keine
 * Umsortierung) oder wirft benannt.
 *
 * **Fail-closed:** eine unbrauchbare Anfrage (kein Array, unbekannter Vorgang, unbrauchbare Größe) wird
 * abgelehnt, nicht durchgelassen.
 */
export function assertVaultBatchWithinLimits(
  operation: VaultBatchOperation,
  entries: readonly Pick<VaultFile, 'sizeBytes'>[],
): { count: number; totalBytes: number } {
  if (!VAULT_BATCH_OPERATIONS.includes(operation)) throw new Error('vault_batch_operation_invalid');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new VaultImportLimitError('empty_batch', vaultBatchLimitMessage(operation, 'empty'));
  }
  if (entries.length > VAULT_BATCH_MAX_FILES) {
    throw new VaultImportLimitError('batch_count', vaultBatchLimitMessage(operation, 'count'));
  }
  let totalBytes = 0;
  for (const entry of entries) {
    const size = Number(entry?.sizeBytes);
    // Eine unbrauchbare Größe ist kein Freibrief: sie könnte eine beliebig große Nutzlast verbergen.
    if (!Number.isFinite(size) || size < 0) throw new Error('vault_batch_size_invalid');
    totalBytes += size;
  }
  // Nur vervielfachende Vorgänge werden zusätzlich über die Bytes begrenzt: ein Verschieben ändert nur den
  // Ordner und berührt die Nutzlast nicht.
  if (VAULT_BATCH_BYTE_BOUNDED.has(operation) && totalBytes > VAULT_IMPORT_MAX_TOTAL_BYTES) {
    throw new VaultImportLimitError('batch_total_bytes', vaultBatchLimitMessage(operation, 'total_bytes'));
  }
  return { count: entries.length, totalBytes };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid Data URL.');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (/;base64/i.test(header)) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

function normalizeForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForStableJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((result, key) => {
      const entry = record[key];
      if (entry !== undefined) result[key] = normalizeForStableJson(entry);
      return result;
    }, {});
  }
  return value;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value));
}

export function stableWorkspaceDocumentJson(document: WorkspaceDocument): string {
  return stableJsonStringify(document);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  if (file.size <= 0 || file.size > MAX_VAULT_ATTACHMENT_BYTES) {
    return Promise.reject(new Error('Vault attachments must be between 1 byte and 25 MiB.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Attachment could not be read.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Attachment read did not produce a Data URL.'));
    reader.readAsDataURL(file);
  });
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const slice = 0x8000;
  for (let start = 0; start < bytes.length; start += slice) {
    binary += String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + slice)));
  }
  return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export function inferVaultKindFromFilename(name: string): DocumentKind {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'vgrid' || ext === 'csv' || ext === 'xlsx' || ext === 'ods') return 'Grid';
  if (ext === 'vpresent' || ext === 'pptx' || ext === 'odp') return 'Present';
  if (ext === 'vnote' || ext === 'md') return 'Notes';
  if (ext === 'vpdf' || ext === 'pdf') return 'PdfStudio';
  if (ext === 'vboard') return 'Whiteboard';
  if (ext === 'vtask') return 'Tasks';
  return 'Writer';
}

export async function computeVaultMerkleRoot(chunkHashes: readonly string[]): Promise<string> {
  if (chunkHashes.length === 0) return '0'.repeat(64);
  let level = [...chunkHashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(await sha256Text(`${left}:${right}`));
    }
    level = next;
  }
  return level[0];
}

export async function buildVaultChunkIntegrity(
  bytes: Uint8Array,
  chunkSize = VAULT_INTEGRITY_CHUNK_BYTES,
): Promise<VaultChunkIntegrityManifest> {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 4096 || chunkSize > 4 * 1024 * 1024) {
    throw new Error('vault_integrity_chunk_size_invalid');
  }
  const totalChunks = Math.max(1, Math.ceil(bytes.byteLength / chunkSize));
  if (totalChunks > MAX_VAULT_INTEGRITY_CHUNKS) throw new Error('vault_integrity_chunk_limit');
  const chunks: Array<{ index: number; hash: string }> = [];
  for (let index = 0; index < totalChunks; index++) {
    const start = index * chunkSize;
    chunks.push({ index, hash: await sha256Bytes(bytes.subarray(start, Math.min(bytes.length, start + chunkSize))) });
  }
  return {
    version: 1,
    algorithm: 'SHA-256',
    chunkSize,
    totalChunks,
    merkleRoot: await computeVaultMerkleRoot(chunks.map((chunk) => chunk.hash)),
    chunks,
  };
}

export async function verifyVaultChunkIntegrity(bytes: Uint8Array, manifest: VaultChunkIntegrityManifest): Promise<boolean> {
  if (manifest.version !== 1 || manifest.algorithm !== 'SHA-256') return false;
  const actual = await buildVaultChunkIntegrity(bytes, manifest.chunkSize);
  return actual.totalChunks === manifest.totalChunks
    && actual.merkleRoot === manifest.merkleRoot
    && actual.chunks.every((chunk, index) => chunk.hash === manifest.chunks[index]?.hash);
}

export async function createVaultAttachmentEntry(file: File): Promise<VaultFile> {
  const payloadDataUrl = await readFileAsDataUrl(file);
  const bytes = dataUrlToBytes(payloadDataUrl);
  const contentDigest = await sha256Bytes(bytes);
  const now = Date.now();
  return {
    id: `vf-${now}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`,
    name: file.name,
    kind: inferVaultKindFromFilename(file.name),
    sizeBytes: file.size,
    encryptedHash: contentDigest,
    contentDigest,
    digestAlgorithm: 'SHA-256',
    integrityState: 'verified',
    integrityVerifiedAt: now,
    chunkIntegrity: await buildVaultChunkIntegrity(bytes),
    sourceType: 'attachment',
    mimeType: file.type || 'application/octet-stream',
    payloadDataUrl,
    lastModified: file.lastModified || now,
    createdAt: now,
    lastAccessedAt: now,
    owner: 'local-user',
    classification: 'Internal',
    status: 'available',
    tags: [], favorite: false, pinned: false,
    association: inferVaultFileAssociation({ name: file.name, kind: inferVaultKindFromFilename(file.name), sourceType: 'attachment', mimeType: file.type || 'application/octet-stream' }),
  };
}

export async function createVaultWorkspaceEntry(document: WorkspaceDocument): Promise<VaultFile> {
  const bytes = new TextEncoder().encode(stableWorkspaceDocumentJson(document));
  const contentDigest = await sha256Bytes(bytes);
  const now = Date.now();
  return {
    id: `vf-${now}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`,
    name: document.title,
    kind: document.kind,
    sizeBytes: bytes.byteLength,
    encryptedHash: contentDigest,
    contentDigest,
    digestAlgorithm: 'SHA-256',
    integrityState: 'verified',
    integrityVerifiedAt: now,
    chunkIntegrity: await buildVaultChunkIntegrity(bytes),
    sourceType: 'workspace-document',
    documentId: document.id,
    documentVersion: document.version,
    lastModified: document.modified_at,
    createdAt: document.created_at,
    lastAccessedAt: document.modified_at,
    owner: 'local-user', classification: 'Internal', status: 'available', tags: [], favorite: false, pinned: false,
    association: { action: 'workspace', app: document.kind, source: 'native' },
  };
}

export async function calculateVaultFileBytes(file: VaultFile, documents: WorkspaceDocument[]): Promise<Uint8Array> {
  /*
   * **V-017 — der Grund muss stimmen, nicht nur die Ablehnung.** Vorher stand hier
   * `if (sourceType === 'workspace-document' && file.documentId) { … }` und darunter ein einziger
   * Sammelfall. Ein Workspace-Verweis **ohne** `documentId` fiel damit in den letzten Zweig und meldete
   * „No verifiable payload is stored" — als hätte der Eintrag keine Nutzlast. Tatsächlich ist der
   * **Verweis** unvollständig: es gibt keine `documentId`, auf die man zeigen könnte. Für den Nutzer ist das
   * ein Unterschied: „das verknüpfte Dokument ist weg" und „dieser Eintrag hat keinen Inhalt" verlangen
   * verschiedene Reaktionen. Jeder Fall nennt jetzt seinen eigenen Grund.
   */
  if (file.sourceType === 'workspace-document') {
    // Ein Verweis **ohne** dokumentId ist ein unvollständiger Eintrag, kein fehlender Inhalt.
    if (!file.documentId) throw new Error('vault_entry_reference_incomplete');
    const document = documents.find((candidate) => candidate.id === file.documentId);
    // Ein gesetzter, aber nicht auflösbarer Verweis ist ein anderer Fall als ein fehlender Verweis.
    if (!document) throw new Error('Linked Workspace document is unavailable.');
    return new TextEncoder().encode(stableWorkspaceDocumentJson(document));
  }
  if (file.sourceType === 'attachment') {
    // Ein Anhang **ohne** Nutzlast ist ein unvollständiger Eintrag, kein fehlender Verweis.
    if (!file.payloadDataUrl) throw new Error('vault_entry_payload_missing');
    return dataUrlToBytes(file.payloadDataUrl);
  }
  throw new Error('No verifiable payload is stored for this Vault entry.');
}

export async function calculateVaultFileDigest(file: VaultFile, documents: WorkspaceDocument[]): Promise<string> {
  return sha256Bytes(await calculateVaultFileBytes(file, documents));
}

export interface VaultVerificationResult {
  digest: string;
  state: 'verified' | 'mismatch';
  baselineCreated: boolean;
  chunkIntegrity: VaultChunkIntegrityManifest;
}

export async function verifyVaultFile(file: VaultFile, documents: WorkspaceDocument[]): Promise<VaultVerificationResult> {
  const bytes = await calculateVaultFileBytes(file, documents);
  const digest = await sha256Bytes(bytes);
  const chunkIntegrity = await buildVaultChunkIntegrity(bytes, file.chunkIntegrity?.chunkSize ?? VAULT_INTEGRITY_CHUNK_BYTES);
  const expected = file.contentDigest;
  if (!expected) return { digest, state: 'verified', baselineCreated: true, chunkIntegrity };
  const chunksMatch = file.chunkIntegrity ? await verifyVaultChunkIntegrity(bytes, file.chunkIntegrity) : true;
  return { digest, state: digest === expected && chunksMatch ? 'verified' : 'mismatch', baselineCreated: false, chunkIntegrity };
}

export async function verifyEntireVault(
  files: readonly VaultFile[],
  documents: WorkspaceDocument[],
  now = Date.now(),
): Promise<{ files: VaultFile[]; report: VaultIntegrityAuditReport }> {
  if (files.length > MAX_VAULT_INTEGRITY_FILES) throw new Error('vault_integrity_file_limit');
  const updated: VaultFile[] = [];
  const entries: VaultIntegrityAuditReport['entries'] = [];
  let verified = 0, mismatch = 0, unavailable = 0;
  for (const file of files) {
    try {
      const result = await verifyVaultFile(file, documents);
      const ok = result.state === 'verified';
      if (ok) verified++; else mismatch++;
      entries.push({ fileId: file.id, name: file.name, state: result.state, digest: result.digest });
      updated.push({
        ...file,
        contentDigest: result.baselineCreated ? result.digest : file.contentDigest,
        encryptedHash: result.baselineCreated ? result.digest : file.encryptedHash,
        digestAlgorithm: 'SHA-256',
        integrityState: result.state,
        integrityVerifiedAt: now,
        chunkIntegrity: result.chunkIntegrity,
        status: ok ? (file.status === 'missing' || file.status === 'corrupt' ? 'available' : file.status ?? 'available') : 'corrupt',
      });
    } catch (error) {
      unavailable++;
      const reason = error instanceof Error ? error.message : 'integrity_unavailable';
      entries.push({ fileId: file.id, name: file.name, state: 'unavailable', reason });
      updated.push({ ...file, integrityState: 'unavailable', integrityVerifiedAt: now, status: /unavailable/i.test(reason) ? 'missing' : file.status });
    }
  }
  return {
    files: updated,
    report: {
      id: `vault-integrity-${now}-${files.length}`,
      createdAt: now,
      totalFiles: files.length,
      verified, mismatch, unavailable,
      entries,
    },
  };
}

export type VaultRepairSourceKind = 'version' | 'backup' | 'peer';

export async function repairVaultAttachmentFromKnownGood(
  file: VaultFile,
  source: { kind: VaultRepairSourceKind; bytes: Uint8Array; mimeType?: string },
  now = Date.now(),
): Promise<VaultFile> {
  if (!['version', 'backup', 'peer'].includes(source.kind)) throw new Error('vault_repair_source_untrusted');
  if (file.sourceType !== 'attachment') throw new Error('vault_repair_attachment_only');
  if (!file.contentDigest) throw new Error('vault_repair_requires_known_digest');
  if (source.bytes.byteLength <= 0 || source.bytes.byteLength > MAX_VAULT_ATTACHMENT_BYTES) throw new Error('vault_repair_size_invalid');
  const digest = await sha256Bytes(source.bytes);
  if (digest !== file.contentDigest) throw new Error('vault_repair_source_not_known_good');
  const chunkIntegrity = await buildVaultChunkIntegrity(source.bytes, file.chunkIntegrity?.chunkSize ?? VAULT_INTEGRITY_CHUNK_BYTES);
  return {
    ...file,
    payloadDataUrl: bytesToDataUrl(source.bytes, source.mimeType || file.mimeType || 'application/octet-stream'),
    sizeBytes: source.bytes.byteLength,
    lastModified: now,
    integrityState: 'verified',
    integrityVerifiedAt: now,
    chunkIntegrity,
    status: 'available',
  };
}

export function appendVaultIntegrityAudit(
  current: readonly VaultIntegrityAuditReport[] | undefined,
  report: VaultIntegrityAuditReport,
): VaultIntegrityAuditReport[] {
  return [report, ...(current ?? []).filter((item) => item.id !== report.id)].slice(0, MAX_VAULT_AUDIT_HISTORY);
}
