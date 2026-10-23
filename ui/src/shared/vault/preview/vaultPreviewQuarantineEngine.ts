// STATUS: DIAMANT VGT SUPREME — Safe Vault preview, parser validation & quarantine policy.
import type { VaultFile } from '../../contracts/workspace';
import { readZip } from '../../../platform/interop/zip';
import { dataUrlToBytes, VAULT_IMPORT_MAX_FILE_BYTES } from '../integrity/vaultIntegrity';

const MAX_PREVIEW_TEXT_BYTES = 256 * 1024;
/**
 * Vorher stand hier eine **zweite** Obergrenze von 128 MiB, während `readFileAsDataUrl` denselben Import
 * bereits bei 25 MiB abgelehnt hat. Ein 40-MiB-Anhang passierte damit die Quarantäne-Prüfung als
 * „innerhalb der Grenzen" und wurde erst danach verworfen — zwei Begründungen für eine Ablehnung, und die
 * Sandbox-Prüfung urteilte über eine Nutzlast, die so nie gespeichert werden konnte. Es gilt jetzt genau
 * eine Zahl (`integrity/vaultIntegrity.ts`), für die Prüfung **und** für die Lesegrenze.
 */
const MAX_IMPORT_BYTES = VAULT_IMPORT_MAX_FILE_BYTES;
const MAX_ARCHIVE_ENTRIES = 512;
const MAX_ARCHIVE_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_RATIO = 100;
const MAX_ARCHIVE_MS = 2_000;
const MAX_PDF_TEXT_CHARS = 48_000;
const MAX_PARSER_MS = 5_000;
const EXECUTABLE_EXTENSIONS = new Set(['exe','dll','com','msi','scr','bat','cmd','ps1','vbs','js','jse','wsf','wsh','sh','bash','zsh','fish','appimage','dmg','pkg']);
const ARCHIVE_EXTENSIONS = new Set(['zip']);
const RASTER_MIME = new Set(['image/png','image/jpeg','image/gif','image/webp']);
const AUDIO_MIME = new Set(['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/mp4']);
const OFFICE_EXTENSIONS = new Set(['docx','xlsx','pptx','ods']);

export interface VaultPdfInspection {
  pageCount: number;
  hasJavaScriptActions: boolean;
  firstPageText: string;
  externalLinkCount: number;
}

export interface VaultPreviewParserAdapters {
  inspectPdf(bytes: Uint8Array): Promise<VaultPdfInspection>;
  inspectOffice(file: File): Promise<{ kind: string; title: string }>;
}

export type VaultSafePreview =
  | { kind: 'workspace'; title: string; mimeType: string; documentId: string; securityLabel: VaultFile['securityLabel']; warning?: string }
  | { kind: 'text'; title: string; mimeType: string; text: string; securityLabel: VaultFile['securityLabel']; warning?: string }
  | { kind: 'image'; title: string; mimeType: string; dataUrl: string; securityLabel: VaultFile['securityLabel']; warning?: string }
  | { kind: 'audio'; title: string; mimeType: string; dataUrl: string; securityLabel: VaultFile['securityLabel']; warning?: string }
  | { kind: 'pdf'; title: string; mimeType: string; pageCount: number; text: string; externalLinkCount: number; securityLabel: VaultFile['securityLabel']; warning?: string }
  | { kind: 'archive'; title: string; mimeType: string; entries: Array<{ name: string; sizeBytes: number }>; securityLabel: VaultFile['securityLabel']; warning?: string }
  | { kind: 'blocked'; title: string; mimeType: string; securityLabel: VaultFile['securityLabel']; warning: string };

export interface VaultIncomingInspection {
  securityLabel: NonNullable<VaultFile['securityLabel']>;
  quarantine: boolean;
  reason?: string;
}

function ext(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function isTextMime(mime: string): boolean {
  return mime.startsWith('text/') || ['application/json','application/xml','application/yaml'].includes(mime);
}

function begins(bytes: Uint8Array, values: number[]): boolean {
  return bytes.length >= values.length && values.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder('ascii').decode(bytes.subarray(offset, offset + length));
}

export function detectVaultExecutable(bytes: Uint8Array, fileName: string): boolean {
  const extension = ext(fileName);
  if (EXECUTABLE_EXTENSIONS.has(extension)) return true;
  if (begins(bytes, [0x4d,0x5a])) return true; // PE/Windows
  if (begins(bytes, [0x7f,0x45,0x4c,0x46])) return true; // ELF
  if (bytes.length >= 4) {
    const magic = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
    if ([0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe].includes(magic)) return true; // Mach-O / FAT
  }
  if (begins(bytes, [0x23,0x21]) && ['sh','bash','zsh','fish','py','pl','rb'].includes(extension)) return true;
  return false;
}

export function assertVaultRasterImage(bytes: Uint8Array, mimeType: string): void {
  if (!RASTER_MIME.has(mimeType)) throw new Error('vault_preview_image_type_not_passive');
  const valid = mimeType === 'image/png' ? begins(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
    : mimeType === 'image/jpeg' ? begins(bytes,[0xff,0xd8,0xff])
    : mimeType === 'image/gif' ? (ascii(bytes,0,6) === 'GIF87a' || ascii(bytes,0,6) === 'GIF89a')
    : bytes.length >= 12 && ascii(bytes,0,4) === 'RIFF' && ascii(bytes,8,4) === 'WEBP';
  if (!valid) throw new Error('vault_preview_image_magic_mismatch');
}

export function assertVaultPassiveAudio(bytes: Uint8Array, mimeType: string): void {
  if (!AUDIO_MIME.has(mimeType)) throw new Error('vault_preview_audio_type_not_passive');
  const valid = mimeType === 'audio/wav' || mimeType === 'audio/x-wav'
    ? bytes.length >= 12 && ascii(bytes,0,4) === 'RIFF' && ascii(bytes,8,4) === 'WAVE'
    : mimeType === 'audio/ogg'
      ? ascii(bytes,0,4) === 'OggS'
      : mimeType === 'audio/webm'
        ? begins(bytes,[0x1a,0x45,0xdf,0xa3])
        : mimeType === 'audio/mp4'
          ? bytes.length >= 12 && ascii(bytes,4,4) === 'ftyp'
          : begins(bytes,[0x49,0x44,0x33]) || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!valid) throw new Error('vault_preview_audio_magic_mismatch');
}

function assertPdfHeader(bytes: Uint8Array): void {
  if (bytes.length < 8 || ascii(bytes,0,5) !== '%PDF-') throw new Error('vault_preview_pdf_header_invalid');
}

async function browseArchive(bytes: Uint8Array): Promise<Array<{ name: string; sizeBytes: number }>> {
  const entries = await readZip(bytes, {
    maxEntries: MAX_ARCHIVE_ENTRIES,
    maxEntryBytes: MAX_ARCHIVE_ENTRY_BYTES,
    maxTotalUncompressedBytes: MAX_ARCHIVE_TOTAL_BYTES,
    maxCompressionRatio: MAX_ARCHIVE_RATIO,
    maxElapsedMs: MAX_ARCHIVE_MS,
  });
  return [...entries.entries()].map(([name,data]) => ({ name, sizeBytes: data.byteLength }));
}

function fileBytes(file: VaultFile): Uint8Array {
  if (!file.payloadDataUrl) throw new Error('vault_preview_payload_unavailable');
  const bytes = dataUrlToBytes(file.payloadDataUrl);
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('vault_preview_payload_too_large');
  return bytes;
}

async function withParserBudget<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`vault_preview_${label}_time_budget`)), MAX_PARSER_MS);
  });
  try { return await Promise.race([operation, timeout]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

export async function buildVaultSafePreview(file: VaultFile, adapters: VaultPreviewParserAdapters): Promise<VaultSafePreview> {
  const mimeType = file.mimeType || 'application/octet-stream';
  const securityLabel = file.securityLabel ?? 'unknown';
  if (file.status === 'quarantined') return { kind:'blocked', title:file.name, mimeType, securityLabel, warning:file.quarantineReason || 'File is quarantined and preview is blocked.' };
  if (file.sourceType === 'workspace-document' && file.documentId) {
    return { kind:'workspace', title:file.name, mimeType:`application/x-vgt-${file.kind.toLowerCase()}`, documentId:file.documentId, securityLabel:'safe' };
  }
  const bytes = fileBytes(file);
  if (detectVaultExecutable(bytes, file.name)) return { kind:'blocked', title:file.name, mimeType, securityLabel:'executable', warning:'Executable/script content is never auto-executed or previewed.' };
  if (RASTER_MIME.has(mimeType)) {
    assertVaultRasterImage(bytes,mimeType);
    return { kind:'image', title:file.name, mimeType, dataUrl:file.payloadDataUrl!, securityLabel:'safe' };
  }
  if (AUDIO_MIME.has(mimeType)) {
    assertVaultPassiveAudio(bytes,mimeType);
    return { kind:'audio', title:file.name, mimeType, dataUrl:file.payloadDataUrl!, securityLabel:'safe', warning:'Audio is streamed from the encrypted in-memory Vault payload; no plaintext preview file is created.' };
  }
  if (mimeType === 'image/svg+xml' || ext(file.name) === 'svg') return { kind:'blocked', title:file.name, mimeType, securityLabel:'unknown', warning:'Active/vector image preview is blocked; download explicitly if trusted.' };
  if (mimeType === 'application/pdf' || ext(file.name) === 'pdf') {
    assertPdfHeader(bytes);
    const inspected = await withParserBudget(adapters.inspectPdf(bytes), 'pdf');
    if (inspected.hasJavaScriptActions) return { kind:'blocked', title:file.name, mimeType:'application/pdf', securityLabel:'pdf', warning:'PDF contains JavaScript actions and is quarantined from preview.' };
    return { kind:'pdf', title:file.name, mimeType:'application/pdf', pageCount:inspected.pageCount, text:inspected.firstPageText.slice(0,MAX_PDF_TEXT_CHARS), externalLinkCount:inspected.externalLinkCount, securityLabel:'pdf', warning:inspected.externalLinkCount ? `${inspected.externalLinkCount} external link(s) detected; none were fetched.` : undefined };
  }
  if (ARCHIVE_EXTENSIONS.has(ext(file.name)) || mimeType === 'application/zip') {
    const entries = await browseArchive(bytes);
    return { kind:'archive', title:file.name, mimeType:'application/zip', entries, securityLabel:'archive', warning:'Archive contents are listed only; entries are not executed.' };
  }
  if (isTextMime(mimeType)) {
    const text = new TextDecoder('utf-8',{fatal:false}).decode(bytes.subarray(0,MAX_PREVIEW_TEXT_BYTES));
    return { kind:'text', title:file.name, mimeType, text, securityLabel:'safe', warning:bytes.byteLength>MAX_PREVIEW_TEXT_BYTES?'Text preview truncated at 256 KiB.':undefined };
  }
  return { kind:'blocked', title:file.name, mimeType, securityLabel:'unknown', warning:'Unknown binary type. Automatic preview is disabled.' };
}

export async function inspectVaultIncomingFile(file: File, adapters: VaultPreviewParserAdapters): Promise<VaultIncomingInspection> {
  if (file.size <= 0 || file.size > MAX_IMPORT_BYTES) return { securityLabel:'unknown', quarantine:true, reason:'File size is outside Vault import bounds.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (detectVaultExecutable(bytes,file.name)) return { securityLabel:'executable', quarantine:true, reason:'Executable or script content requires explicit review and cannot auto-run.' };
  const extension = ext(file.name);
  if (OFFICE_EXTENSIONS.has(extension)) {
    try { await withParserBudget(adapters.inspectOffice(file), 'office'); return { securityLabel:'office', quarantine:false }; }
    catch { return { securityLabel:'office', quarantine:true, reason:'Office parser rejected malformed or unsupported content.' }; }
  }
  if (file.type === 'application/pdf' || extension === 'pdf') {
    try {
      assertPdfHeader(bytes);
      const inspected = await withParserBudget(adapters.inspectPdf(bytes), 'pdf');
      if (inspected.hasJavaScriptActions) return { securityLabel:'pdf', quarantine:true, reason:'PDF contains JavaScript actions.' };
      return { securityLabel:'pdf', quarantine:false };
    } catch { return { securityLabel:'pdf', quarantine:true, reason:'PDF parser rejected malformed or unsafe content.' }; }
  }
  if (file.type === 'application/zip' || ARCHIVE_EXTENSIONS.has(extension)) {
    try { await browseArchive(bytes); return { securityLabel:'archive', quarantine:false }; }
    catch { return { securityLabel:'archive', quarantine:true, reason:'Archive parser rejected malformed, oversized or suspicious content.' }; }
  }
  if (file.type.startsWith('image/')) {
    try { assertVaultRasterImage(bytes,file.type); return { securityLabel:'safe', quarantine:false }; }
    catch { return { securityLabel:'unknown', quarantine:true, reason:'Image MIME/magic mismatch or active image type.' }; }
  }
  if (file.type.startsWith('audio/')) {
    try { assertVaultPassiveAudio(bytes,file.type); return { securityLabel:'safe', quarantine:false }; }
    catch { return { securityLabel:'unknown', quarantine:true, reason:'Audio MIME/magic mismatch or unsupported active media type.' }; }
  }
  if (isTextMime(file.type)) return { securityLabel:'safe', quarantine:false };
  return { securityLabel:'unknown', quarantine:false, reason:'Unknown binary type; automatic preview/execution remains disabled.' };
}

export function applyVaultIncomingInspection(file: VaultFile, inspection: VaultIncomingInspection, now=Date.now()): VaultFile {
  return inspection.quarantine
    ? { ...file, status:'quarantined', securityLabel:inspection.securityLabel, quarantineReason:inspection.reason || 'Quarantined by Vault inspection.', quarantinedAt:now }
    : { ...file, status:file.status === 'quarantined' ? 'available' : (file.status ?? 'available'), securityLabel:inspection.securityLabel, quarantineReason:undefined, quarantinedAt:undefined };
}
