// STATUS: PLATIN — canonical UI client for VGT-IMPORT-SANDBOX-3.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { readZip } from '../interop/zip';
import { preflightForeignBoundary } from '../security/securityGatesPlatform';
import { IMPORT_WORKER_MAX_INPUT_BYTES } from './importExportSandboxWorkerRequest';

export type ForeignFormat = 'docx'|'xlsx'|'pptx'|'odt'|'ods'|'odp'|'pdf'|'csv'|'json'|'png'|'jpeg'|'gif'|'webp';
export interface PreservedForeignPart { path: string; size_bytes: number; blake3: string; media_hint: string; quarantined: boolean }
export interface ConversionFidelityReport {
  source_format: string;
  supported_features: string[];
  unsupported_features: string[];
  preserved_foreign_parts: PreservedForeignPart[];
  dropped_active_parts: string[];
  warnings: string[];
  destructive_roundtrip_requires_confirmation: boolean;
}
export interface ForeignInspectionReport {
  contract: 'VGT-IMPORT-SANDBOX-3';
  format: ForeignFormat;
  file_name_hint: string;
  size_bytes: number;
  entry_count: number;
  expanded_bytes: number;
  max_observed_ratio_milli: number;
  active_content: 'none'|'quarantined_preserved'|'rejected';
  integrity_verified: boolean;
  parser_boundary: string;
  image_width: number|null;
  image_height: number|null;
  untrusted_resources: { embedded_fonts: number; icc_profiles: number; external_references: number };
  fidelity: ConversionFidelityReport;
}

export interface ForeignInteropPart { path: string; mimeHint: string; dataBase64: string; sizeBytes: number; quarantined: boolean }
export interface ForeignInteropEnvelope {
  sourceFormat: ForeignFormat;
  inspection: ForeignInspectionReport;
  preservedParts: ForeignInteropPart[];
}

const MAX_BYTE_IPC = 32 * 1024 * 1024;
const MAX_PRESERVE_PART = 2 * 1024 * 1024;
const MAX_PRESERVE_TOTAL = 16 * 1024 * 1024;
const MAX_PRESERVE_COUNT = 512;

function assertFileSizeWithinBoundary(file: File): number {
  const size = file.size;
  if (!Number.isSafeInteger(size) || size < 1 || size > IMPORT_WORKER_MAX_INPUT_BYTES) {
    throw new Error('Foreign file exceeds intake size limit');
  }
  return size;
}

function assertMeasuredFileBytes(bytes: Uint8Array, declaredSize: number): void {
  if (!Number.isSafeInteger(bytes.byteLength) || bytes.byteLength < 1 || bytes.byteLength > IMPORT_WORKER_MAX_INPUT_BYTES) {
    throw new Error('Foreign file exceeds intake size limit');
  }
  if (bytes.byteLength !== declaredSize) {
    throw new Error('Foreign file measured byte length does not match file size');
  }
}

function nativeAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}

async function nativeInspect(file: File, bytes: Uint8Array): Promise<ForeignInspectionReport> {
  const { invoke } = await import('@tauri-apps/api/core');
  const path = (file as File & { path?: string }).path;
  if (path) {
    try {
      return await invoke<ForeignInspectionReport>('vgt_import_sandbox_inspect_path', { request: { fileName: file.name, path } });
    } catch {
      // If path-based inspection fails, fall through to in-memory bytes inspection if size permits
    }
  }
  if (bytes.byteLength > MAX_BYTE_IPC) throw new Error('Large foreign imports require the desktop path-based sandbox flow');
  return invoke<ForeignInspectionReport>('vgt_import_sandbox_inspect_bytes', { request: { fileName: file.name, bytesBase64: bytesToBase64(bytes) } });
}

async function nativeValidateExport(fileName: string, bytes: Uint8Array): Promise<ForeignInspectionReport> {
  if (bytes.byteLength > MAX_BYTE_IPC) throw new Error('Large exports require the desktop atomic path-based save flow');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ForeignInspectionReport>('vgt_import_sandbox_validate_export_bytes', { request: { fileName, bytesBase64: bytesToBase64(bytes) } });
}

async function workerInspect(file: File, bytes: Uint8Array): Promise<ForeignInspectionReport> {
  if (typeof Worker === 'undefined') throw new Error('Foreign parser worker is unavailable');
  const worker = new Worker(new URL('./importExportSandbox.worker.ts', import.meta.url), { type: 'module', name: 'vgt-import-sandbox-v2' });
  const id = crypto.randomUUID();
  const copy = bytes.slice().buffer;
  return new Promise<ForeignInspectionReport>((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Foreign parser worker exceeded its deadline')); }, 13_000);
    worker.onmessage = (event: MessageEvent<{id:string;ok:boolean;report?:ForeignInspectionReport;error?:string}>) => {
      if (event.data.id !== id) return;
      clearTimeout(timer); worker.terminate();
      if (!event.data.ok || !event.data.report) reject(new Error(event.data.error || 'Foreign file rejected'));
      else resolve(event.data.report);
    };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Foreign parser worker failed')); };
    worker.postMessage({ id, fileName: file.name, bytes: copy }, [copy]);
  });
}

export async function inspectForeignFile(file: File, bytes?: Uint8Array): Promise<{ bytes: Uint8Array; report: ForeignInspectionReport }> {
  const declaredSize = assertFileSizeWithinBoundary(file);
  const payload = bytes ?? new Uint8Array(await file.arrayBuffer());
  assertMeasuredFileBytes(payload, declaredSize);
  preflightForeignBoundary(file.name, file.type, payload);
  const report = nativeAvailable() ? await nativeInspect(file, payload) : await workerInspect(file, payload);
  if (report.contract !== 'VGT-IMPORT-SANDBOX-3' || !report.integrity_verified || report.active_content === 'rejected') throw new Error('Foreign file failed sandbox verification');
  return { bytes: payload, report };
}

function mimeHint(path: string): string {
  const lower = path.toLowerCase();
  if (/\.(?:xml|rels)$/.test(lower)) return 'application/xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

export async function captureSafeForeignParts(bytes: Uint8Array, report: ForeignInspectionReport): Promise<ForeignInteropEnvelope | undefined> {
  if (!['docx','xlsx','pptx','odt','ods','odp'].includes(report.format)) return undefined;
  const entries = await readZip(bytes, { maxEntries: 4096, maxEntryBytes: 64 * 1024 * 1024, maxTotalUncompressedBytes: 256 * 1024 * 1024, maxCompressionRatio: 100, maxElapsedMs: 12_000 });
  const preservedParts: ForeignInteropPart[] = [];
  let total = 0;
  // Preservation policy is native-core truth. The UI only copies the exact parts listed
  // by the authenticated/bounded sandbox report; it never decides what is safe to retain.
  for (const part of report.fidelity.preserved_foreign_parts.slice(0, MAX_PRESERVE_COUNT)) {
    const data = entries.get(part.path);
    if (!data || data.byteLength !== part.size_bytes || data.byteLength > MAX_PRESERVE_PART) throw new Error('Foreign preservation part no longer matches sandbox report');
    if (total + data.byteLength > MAX_PRESERVE_TOTAL) throw new Error('Foreign preservation envelope exceeds sandbox report budget');
    preservedParts.push({ path: part.path, mimeHint: part.media_hint || mimeHint(part.path), dataBase64: bytesToBase64(data), sizeBytes: data.byteLength, quarantined: part.quarantined });
    total += data.byteLength;
  }
  return { sourceFormat: report.format, inspection: report, preservedParts };
}

export function attachForeignInterop(doc: WorkspaceDocument, envelope: ForeignInteropEnvelope | undefined): WorkspaceDocument {
  return envelope ? { ...doc, foreignInterop: envelope } : doc;
}

export function conversionFidelityReport(doc: WorkspaceDocument): ConversionFidelityReport | null {
  return doc.foreignInterop?.inspection.fidelity ?? null;
}

export async function assertExportArtifact(fileName: string, mimeType: string, bytes: Uint8Array): Promise<void> {
  if (!bytes.byteLength || bytes.byteLength > 128 * 1024 * 1024) throw new Error('Export artifact exceeds sandbox size limit');
  preflightForeignBoundary(fileName, mimeType, bytes);
  const report = nativeAvailable()
    ? await nativeValidateExport(fileName, bytes)
    : await workerInspect(new File([bytes as unknown as BlobPart], fileName, { type: mimeType }), bytes);
  if (report.contract !== 'VGT-IMPORT-SANDBOX-3' || !report.integrity_verified || report.active_content !== 'none') {
    throw new Error('Export artifact failed sandbox integrity verification');
  }
}

/** Always uses a dedicated Worker so browser image decoding never starts in the UI realm. */
export async function preflightIsolatedImageDecode(file: File): Promise<ForeignInspectionReport> {
  const declaredSize = assertFileSizeWithinBoundary(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertMeasuredFileBytes(bytes, declaredSize);
  const report = await workerInspect(file, bytes);
  if (!['png','jpeg','gif','webp'].includes(report.format) || !report.image_width || !report.image_height) throw new Error('Image sandbox rejected the foreign image');
  return report;
}
