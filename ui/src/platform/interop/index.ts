// STATUS: PLATIN — Office/ODF interoperability routed through VGT-IMPORT-SANDBOX-3.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { importDocx, exportDocx } from './docx';
import { importXlsx, exportXlsx } from './xlsx';
import { importPptx, exportPptx } from './pptx';
import { importOds, exportOds } from './ods';
import { importOdp, exportOdp } from './odp';
import { importWriterPortableBytes } from '../../apps/writer/interchange/portable/writerPortableInterop';
import { inspectForeignFile, captureSafeForeignParts, attachForeignInterop, conversionFidelityReport, assertExportArtifact } from '../import-sandbox/importExportSandbox';
import { assertDocumentOpenNetworkIsolated } from '../security/documentNetworkIsolation';
import { DEFAULT_SHELL_NATIVE_POLICY, nativeShellSaveBytes } from '../native/nativeShellServices';

export { importOds, exportOds, importOdp, exportOdp };

export type OfficeFormat = 'docx' | 'xlsx' | 'pptx' | 'odt' | 'ods' | 'odp';

export function detectOfficeFormat(fileName: string): OfficeFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.odt')) return 'odt';
  if (lower.endsWith('.ods')) return 'ods';
  if (lower.endsWith('.odp')) return 'odp';
  return null;
}

function reportOfficeFormat(value: string): OfficeFormat | null {
  return value === 'docx' || value === 'xlsx' || value === 'pptx' || value === 'odt' || value === 'ods' || value === 'odp' ? value : null;
}

export async function importOfficeDocument(file: File): Promise<WorkspaceDocument> {
  const { bytes, report } = await inspectForeignFile(file);
  const format = reportOfficeFormat(report.format);
  if (!format) throw new Error(`Sandbox identified ${report.format.toUpperCase()}, not an Office/ODF document`);
  let imported: WorkspaceDocument;
  switch (format) {
    case 'docx': imported = await importDocx(bytes, file.name); break;
    case 'xlsx': imported = await importXlsx(bytes, file.name); break;
    case 'pptx': imported = await importPptx(bytes, file.name); break;
    case 'odt': imported = await importWriterPortableBytes(bytes, file.name); break;
    case 'ods': imported = await importOds(bytes, file.name); break;
    case 'odp': imported = await importOdp(bytes, file.name); break;
  }
  const envelope = await captureSafeForeignParts(bytes, report);
  return assertDocumentOpenNetworkIsolated(attachForeignInterop(imported, envelope));
}

export function exportOfficeDocument(doc: WorkspaceDocument, options: { confirmForeignLoss?: boolean } = {}): { fileName: string; mimeType: string; bytes: Uint8Array } {
  const fidelity = conversionFidelityReport(doc);
  if (fidelity?.destructive_roundtrip_requires_confirmation && !options.confirmForeignLoss) {
    throw new Error(`FOREIGN_FIDELITY_CONFIRMATION_REQUIRED:${[...fidelity.unsupported_features, ...fidelity.warnings].join(' | ').slice(0, 1600)}`);
  }
  const safeTitle = (doc.title || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'document';
  if (doc.kind === 'Writer') return {
    fileName: `${safeTitle}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: exportDocx(doc),
  };
  if (doc.kind === 'Grid') return {
    fileName: `${safeTitle}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: exportXlsx(doc),
  };
  if (doc.kind === 'Present') return {
    fileName: `${safeTitle}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    bytes: exportPptx(doc),
  };
  throw new Error('Office export is available only for Writer, Grid and Present');
}

export async function downloadOfficeDocument(doc: WorkspaceDocument, options: { confirmForeignLoss?: boolean } = {}): Promise<string> {
  const exported = exportOfficeDocument(doc, options);
  await assertExportArtifact(exported.fileName, exported.mimeType, exported.bytes);
  /**
   * Native round 6 — the desktop writes the file itself.
   *
   * The WebView's synthetic `<a download>` did not produce a usable document, although the
   * package was verified and the UI reported success. On the desktop the save dialog grants
   * a destination and the import sandbox commits the validated bytes atomically; the browser
   * build (and every test) keeps the download-link fallback below.
   */
  const extension = exported.fileName.includes('.') ? exported.fileName.split('.').pop()! : '';
  const nativeName = await nativeShellSaveBytes(DEFAULT_SHELL_NATIVE_POLICY, exported.bytes, {
    suggestedName: exported.fileName,
    extensions: extension ? [extension] : [],
  });
  if (nativeName) return nativeName;
  const blob = new Blob([exported.bytes as unknown as BlobPart], { type: exported.mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exported.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return exported.fileName;
}
