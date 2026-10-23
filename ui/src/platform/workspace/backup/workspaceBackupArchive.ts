// STATUS: PLATIN — Release Beta 0.1: one bounded, honest Workspace backup format.
//
// The user's release blocker B5 requires a way to back up one's own documents. Individual exports
// already deliver real files; a workspace backup bundles the **already encrypted** VWC containers
// of all loaded documents into one ZIP with a strict manifest, so restoring does not depend on the
// app-data store surviving a reinstall or a profile reset.
//
// Security posture: the archive is treated as hostile input. The manifest is validated field by
// field (bounded counts/strings, known document kinds, deterministic file names bound to the
// document id), ZIP reading uses the repository's bounded reader, unknown entries are ignored and
// nothing outside `documents/doc-<sha256prefix>.vwc` is ever unpacked. Encryption is the existing
// container codec — no new crypto, no plaintext of document content in the manifest.
import type { DocumentKind, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { isWorkspaceDocumentKind } from '../../../shared/workspace-interaction/workspaceInteractionTypes';
import { decodeUtf8, readZip, utf8, writeStoredZip, type ZipEntry, type ZipReadLimits } from '../../interop/zip';
import {
  sovereignContainerCodec,
  workspaceStoreFileNameForDocumentId,
  isWorkspaceCredentialError,
  WORKSPACE_FILE_DOCUMENT_ID_PATTERN,
  type WorkspaceContainerCodec,
  type WorkspaceDocumentCredentials,
} from '../persistence/workspaceFilePersistence';

export const WORKSPACE_BACKUP_FORMAT = 'astraea.workspace.backup';
export const WORKSPACE_BACKUP_VERSION = 1 as const;
export const WORKSPACE_BACKUP_MANIFEST_NAME = 'manifest.json';
export const WORKSPACE_BACKUP_MAX_DOCUMENTS = 512;
export const WORKSPACE_BACKUP_MAX_TOTAL_BYTES = 512 * 1024 * 1024;
export const WORKSPACE_BACKUP_MAX_ENTRY_BYTES = 128 * 1024 * 1024;
export const WORKSPACE_BACKUP_READ_LIMITS: Readonly<ZipReadLimits> = Object.freeze({
  maxEntries: WORKSPACE_BACKUP_MAX_DOCUMENTS + 8,
  maxEntryBytes: WORKSPACE_BACKUP_MAX_ENTRY_BYTES,
  maxTotalUncompressedBytes: WORKSPACE_BACKUP_MAX_TOTAL_BYTES,
  maxCompressionRatio: 100,
  maxElapsedMs: 20_000,
});

const MAX_TITLE_LENGTH = 512;
const FILE_NAME_PATTERN = /^documents\/doc-[0-9a-f]{32}\.vwc$/u;
const MAX_APP_VERSION_LENGTH = 64;

export type WorkspaceBackupSkipReason = 'credential-required' | 'pack-failed';
export type WorkspaceBackupRestoreSkipReason = 'credential-required' | 'unpack-failed' | 'missing-entry' | 'document-mismatch';

export interface WorkspaceBackupManifestEntry {
  readonly documentId: string;
  readonly title: string;
  readonly kind: DocumentKind;
  readonly modifiedAt: number;
  readonly fileName: string;
}

export interface WorkspaceBackupManifest {
  readonly format: typeof WORKSPACE_BACKUP_FORMAT;
  readonly version: typeof WORKSPACE_BACKUP_VERSION;
  readonly createdAt: number;
  readonly appVersion?: string;
  readonly documents: readonly WorkspaceBackupManifestEntry[];
  readonly skipped: readonly { documentId: string; title: string; reason: WorkspaceBackupSkipReason }[];
}

export interface WorkspaceBackupCreateResult {
  readonly bytes: Uint8Array;
  readonly manifest: WorkspaceBackupManifest;
  readonly documentCount: number;
  readonly skippedCount: number;
}

export interface WorkspaceBackupRestoreResult {
  readonly manifest: WorkspaceBackupManifest;
  readonly documents: readonly WorkspaceDocument[];
  readonly skipped: readonly { documentId: string; reason: WorkspaceBackupRestoreSkipReason }[];
  readonly ignoredFileCount: number;
}

export class WorkspaceBackupError extends Error {
  readonly code: 'too-many-documents' | 'too-large' | 'invalid-archive' | 'invalid-manifest';
  constructor(code: WorkspaceBackupError['code'], message: string) {
    super(message);
    this.name = 'WorkspaceBackupError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function boundedCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export interface CreateWorkspaceBackupOptions {
  readonly documents: readonly WorkspaceDocument[];
  readonly credentialsFor?: (documentId: string) => WorkspaceDocumentCredentials;
  readonly appVersion?: string;
  readonly createdAt?: number;
  readonly codec?: WorkspaceContainerCodec;
}

/**
 * Packs every supplied document into one ZIP backup. Documents whose container cannot be packed
 * with the available credentials are listed in the manifest's `skipped` section instead of being
 * silently omitted.
 */
export async function createWorkspaceBackupArchive(
  options: CreateWorkspaceBackupOptions,
): Promise<WorkspaceBackupCreateResult> {
  const codec = options.codec ?? sovereignContainerCodec;
  const documents = [...options.documents].slice(0, WORKSPACE_BACKUP_MAX_DOCUMENTS);
  if (options.documents.length > WORKSPACE_BACKUP_MAX_DOCUMENTS) {
    throw new WorkspaceBackupError(
      'too-many-documents',
      `Zu viele Dokumente für ein Backup (${options.documents.length}, maximal ${WORKSPACE_BACKUP_MAX_DOCUMENTS}). Es wurde keine Datei geschrieben.`,
    );
  }
  const unique = new Map<string, WorkspaceDocument>();
  for (const document of documents) {
    if (!document || !WORKSPACE_FILE_DOCUMENT_ID_PATTERN.test(document.id)) continue;
    if (!unique.has(document.id)) unique.set(document.id, document);
  }
  const sorted = [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
  const entries: ZipEntry[] = [];
  const manifestDocuments: WorkspaceBackupManifestEntry[] = [];
  const skipped: { documentId: string; title: string; reason: WorkspaceBackupSkipReason }[] = [];
  let totalBytes = 0;

  for (const document of sorted) {
    const credentials = options.credentialsFor?.(document.id) ?? {};
    try {
      const bytes = await codec.pack(document, credentials);
      if (bytes.byteLength === 0) throw new Error('EMPTY_CONTAINER');
      totalBytes += bytes.byteLength;
      if (totalBytes > WORKSPACE_BACKUP_MAX_TOTAL_BYTES) {
        throw new WorkspaceBackupError('too-large', 'Das Backup überschreitet die sichere Größe — es wurde keine Datei geschrieben.');
      }
      const fileName = `documents/${await workspaceStoreFileNameForDocumentId(document.id)}`;
      entries.push({ name: fileName, data: bytes });
      manifestDocuments.push({
        documentId: document.id,
        title: typeof document.title === 'string' ? document.title.slice(0, MAX_TITLE_LENGTH) : 'Untitled',
        kind: document.kind,
        modifiedAt: typeof document.modified_at === 'number' ? document.modified_at : 0,
        fileName,
      });
    } catch (error: unknown) {
      if (error instanceof WorkspaceBackupError) throw error;
      skipped.push({
        documentId: document.id,
        title: typeof document.title === 'string' ? document.title.slice(0, MAX_TITLE_LENGTH) : 'Untitled',
        reason: isWorkspaceCredentialError(error) ? 'credential-required' : 'pack-failed',
      });
    }
  }

  const manifest: WorkspaceBackupManifest = {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    createdAt: options.createdAt ?? Date.now(),
    ...(options.appVersion ? { appVersion: options.appVersion.slice(0, MAX_APP_VERSION_LENGTH) } : {}),
    documents: manifestDocuments,
    skipped,
  };
  const bytes = writeStoredZip([
    { name: WORKSPACE_BACKUP_MANIFEST_NAME, data: utf8(JSON.stringify(manifest, null, 2)) },
    ...entries,
  ]);
  return { bytes, manifest, documentCount: manifestDocuments.length, skippedCount: skipped.length };
}

function parseBackupManifest(raw: unknown): WorkspaceBackupManifest {
  if (!isRecord(raw)) throw new WorkspaceBackupError('invalid-manifest', 'Backup-Manifest ist kein Objekt.');
  if (raw.format !== WORKSPACE_BACKUP_FORMAT) throw new WorkspaceBackupError('invalid-manifest', 'Unbekanntes Backup-Format.');
  if (raw.version !== WORKSPACE_BACKUP_VERSION) throw new WorkspaceBackupError('invalid-manifest', 'Unbekannte Backup-Version.');
  const createdAt = boundedCount(raw.createdAt);
  if (createdAt === null || createdAt <= 0) throw new WorkspaceBackupError('invalid-manifest', 'Backup-Zeitstempel ist ungültig.');
  const appVersion = raw.appVersion === undefined ? undefined : boundedString(raw.appVersion, MAX_APP_VERSION_LENGTH) ?? undefined;
  if (!Array.isArray(raw.documents) || raw.documents.length > WORKSPACE_BACKUP_MAX_DOCUMENTS) {
    throw new WorkspaceBackupError('invalid-manifest', 'Backup-Dokumentliste ist ungültig.');
  }
  if (raw.skipped !== undefined && (!Array.isArray(raw.skipped) || raw.skipped.length > WORKSPACE_BACKUP_MAX_DOCUMENTS)) {
    throw new WorkspaceBackupError('invalid-manifest', 'Backup-Skipliste ist ungültig.');
  }
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  const documents: WorkspaceBackupManifestEntry[] = [];
  for (const item of raw.documents) {
    if (!isRecord(item)) throw new WorkspaceBackupError('invalid-manifest', 'Backup-Eintrag ist ungültig.');
    const documentId = boundedString(item.documentId, 256);
    const title = boundedString(item.title, MAX_TITLE_LENGTH);
    const fileName = boundedString(item.fileName, 128);
    const modifiedAt = boundedCount(item.modifiedAt);
    if (!documentId || !WORKSPACE_FILE_DOCUMENT_ID_PATTERN.test(documentId) || !title || !fileName || !FILE_NAME_PATTERN.test(fileName) || modifiedAt === null) {
      throw new WorkspaceBackupError('invalid-manifest', 'Backup-Eintrag enthält ungültige Werte.');
    }
    if (!isWorkspaceDocumentKind(item.kind)) throw new WorkspaceBackupError('invalid-manifest', 'Backup-Eintrag hat einen unbekannten Dokumenttyp.');
    if (seenIds.has(documentId) || seenFiles.has(fileName)) throw new WorkspaceBackupError('invalid-manifest', 'Backup enthält doppelte Einträge.');
    seenIds.add(documentId);
    seenFiles.add(fileName);
    documents.push({ documentId, title, kind: item.kind as DocumentKind, modifiedAt, fileName });
  }
  const skipped: { documentId: string; title: string; reason: WorkspaceBackupSkipReason }[] = [];
  for (const item of Array.isArray(raw.skipped) ? raw.skipped : []) {
    if (!isRecord(item)) continue;
    const documentId = boundedString(item.documentId, 256);
    const title = boundedString(item.title, MAX_TITLE_LENGTH);
    if (!documentId || !title) continue;
    skipped.push({
      documentId,
      title,
      reason: item.reason === 'credential-required' ? 'credential-required' : 'pack-failed',
    });
  }
  return { format: WORKSPACE_BACKUP_FORMAT, version: WORKSPACE_BACKUP_VERSION, createdAt, ...(appVersion ? { appVersion } : {}), documents, skipped };
}

export interface RestoreWorkspaceBackupOptions {
  readonly credentialsFor?: (documentId: string) => WorkspaceDocumentCredentials;
  readonly codec?: WorkspaceContainerCodec;
}

/**
 * Validates and unpacks a workspace backup. Every document id is bound to its deterministic file
 * name, so a manipulated manifest cannot make the reader unpack a different entry. Unreadable or
 * locked documents are reported, never silently dropped; extra ZIP entries are ignored.
 */
export async function readWorkspaceBackupArchive(
  bytes: Uint8Array,
  options: RestoreWorkspaceBackupOptions = {},
): Promise<WorkspaceBackupRestoreResult> {
  const codec = options.codec ?? sovereignContainerCodec;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > WORKSPACE_BACKUP_MAX_TOTAL_BYTES) {
    throw new WorkspaceBackupError('invalid-archive', 'Die Backup-Datei ist leer oder zu groß.');
  }
  let entries: Map<string, Uint8Array>;
  try {
    entries = await readZip(bytes, WORKSPACE_BACKUP_READ_LIMITS);
  } catch {
    throw new WorkspaceBackupError('invalid-archive', 'Die Backup-Datei ist kein gültiges ZIP-Archiv.');
  }
  const manifestBytes = entries.get(WORKSPACE_BACKUP_MANIFEST_NAME);
  if (!manifestBytes) throw new WorkspaceBackupError('invalid-archive', 'Im Backup fehlt das Manifest.');
  let manifest: WorkspaceBackupManifest;
  try {
    manifest = parseBackupManifest(JSON.parse(decodeUtf8(manifestBytes)));
  } catch (error: unknown) {
    if (error instanceof WorkspaceBackupError) throw error;
    throw new WorkspaceBackupError('invalid-archive', 'Das Backup-Manifest ist nicht lesbar.');
  }
  const documents: WorkspaceDocument[] = [];
  const skipped: { documentId: string; reason: WorkspaceBackupRestoreSkipReason }[] = [];
  const expectedNames = new Set<string>([WORKSPACE_BACKUP_MANIFEST_NAME]);
  for (const entry of manifest.documents) {
    expectedNames.add(entry.fileName);
    const content = entries.get(entry.fileName);
    if (!content) {
      skipped.push({ documentId: entry.documentId, reason: 'missing-entry' });
      continue;
    }
    if (content.byteLength === 0 || content.byteLength > WORKSPACE_BACKUP_MAX_ENTRY_BYTES) {
      skipped.push({ documentId: entry.documentId, reason: 'unpack-failed' });
      continue;
    }
    const expectedFileName = await workspaceStoreFileNameForDocumentId(entry.documentId);
    if (entry.fileName !== `documents/${expectedFileName}`) {
      throw new WorkspaceBackupError('invalid-manifest', 'Backup-Eintrag passt nicht zur Dokument-ID.');
    }
    try {
      const document = await codec.unpack(content, options.credentialsFor?.(entry.documentId) ?? {});
      if (document.id !== entry.documentId) {
        skipped.push({ documentId: entry.documentId, reason: 'document-mismatch' });
        continue;
      }
      documents.push(document);
    } catch (error: unknown) {
      skipped.push({
        documentId: entry.documentId,
        reason: isWorkspaceCredentialError(error) ? 'credential-required' : 'unpack-failed',
      });
    }
  }
  let ignoredFileCount = 0;
  for (const name of entries.keys()) if (!expectedNames.has(name)) ignoredFileCount += 1;
  return { manifest, documents, skipped, ignoredFileCount };
}

export interface RestoredWorkspaceMergeResult {
  readonly documents: Record<string, WorkspaceDocument>;
  /** Images/documents that were actually taken from the backup. */
  readonly adoptedDocumentIds: readonly string[];
  /** Backup copies that are older than or equal to the local document. */
  readonly keptLocalDocumentIds: readonly string[];
}

/**
 * Pure merge for a restore: the newer `modified_at` wins (local wins a tie), so restoring an old
 * backup can never roll back newer local work. The caller writes adopted documents through the
 * normal dirty/autosave path, which produces real files again.
 */
export function mergeRestoredWorkspaceDocuments(
  current: Readonly<Record<string, WorkspaceDocument>>,
  restored: readonly WorkspaceDocument[],
): RestoredWorkspaceMergeResult {
  const documents: Record<string, WorkspaceDocument> = { ...current };
  const adoptedDocumentIds: string[] = [];
  const keptLocalDocumentIds: string[] = [];
  for (const document of restored) {
    if (!document || !WORKSPACE_FILE_DOCUMENT_ID_PATTERN.test(document.id)) continue;
    const existing = current[document.id];
    const restoredModified = typeof document.modified_at === 'number' && Number.isFinite(document.modified_at) ? document.modified_at : 0;
    const localModified = existing && typeof existing.modified_at === 'number' && Number.isFinite(existing.modified_at) ? existing.modified_at : 0;
    if (existing && localModified > restoredModified) {
      keptLocalDocumentIds.push(document.id);
      continue;
    }
    documents[document.id] = document;
    adoptedDocumentIds.push(document.id);
  }
  return { documents, adoptedDocumentIds, keptLocalDocumentIds };
}